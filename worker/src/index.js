// Scheduled Email Gateway - Cloudflare Worker (API + cron)
// Browser -> Worker -> mail.cloudebase.top (Brevo gateway). API key lives only in Worker Secrets.

const TZ_OFFSET = 19800; // Asia/Colombo = UTC+05:30
const SESSION_TTL = 7 * 86400;
const MAX_MSG = 5000;
const MAX_SUBJECT = 200;
const TEMPLATE_VARS = ['name', 'sender', 'year', 'email'];

const DEFAULTS = {
  max_user_scheduled_messages: 5, max_daily_emails: 30, max_monthly_emails: 500,
  max_contacts: 100, max_bulk_recipients: 500, max_otp_requests: 5,
  max_login_attempts: 8, otp_expiry_minutes: 10, max_otp_attempts: 5,
  allow_custom_sender_name: 1, registration_enabled: 1, bulk_batch_size: 20,
};

/* ---------- helpers ---------- */
class ApiError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const now = () => Math.floor(Date.now() / 1000);
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const rand = (n = 32) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

function respond(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}
const ok = (data = {}, headers) => respond({ success: true, data }, 200, headers);

function normalizeEmail(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(s)) return null;
  if (s.length > 254) return null;
  return s;
}
const clean = (s, max = 200) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

async function hashPassword(pw, salt = rand(16), iter = 100000) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${salt}$${hex(bits)}`;
}
async function verifyPassword(pw, stored) {
  const [, iter, salt, h] = String(stored).split('$');
  if (!h) return false;
  const calc = (await hashPassword(pw, salt, Number(iter))).split('$')[3];
  let d = 0; for (let i = 0; i < calc.length; i++) d |= calc.charCodeAt(i) ^ h.charCodeAt(i);
  return d === 0 && calc.length === h.length;
}
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 100) throw new ApiError('WEAK_PASSWORD', 'Password must be 8-100 characters.');
}

/* Sri Lanka time helpers */
function toEpoch(dateStr, timeStr) {
  const d = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/), t = timeStr.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!d || !t) return null;
  const ms = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  const chk = new Date(ms);
  if (chk.getUTCMonth() !== +d[2] - 1 || chk.getUTCDate() !== +d[3]) return null;
  return Math.floor(ms / 1000) - TZ_OFFSET;
}
const colomboParts = (epoch) => { const d = new Date((epoch + TZ_OFFSET) * 1000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
const dayStart = (epoch) => { const p = colomboParts(epoch); return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 1000) - TZ_OFFSET; };
const monthStart = (epoch) => { const p = colomboParts(epoch); return Math.floor(Date.UTC(p.y, p.m - 1, 1) / 1000) - TZ_OFFSET; };
function nextYearly(mmdd, hhmm, after) {
  const [mm, dd] = mmdd.split('-').map(Number);
  const start = colomboParts(after).y;
  for (let y = start; y < start + 9; y++) {
    let day = dd;
    if (mm === 2 && dd === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) day = 28;
    const e = toEpoch(`${y}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`, hhmm);
    if (e && e > after) return e;
  }
  return null;
}
const ALL_DAYS = '0,1,2,3,4,5,6';
/** weekdays: "1,2,3" (0=Sun … 6=Sat, Colombo time) or a single digit */
function nextWeekly(weekdays, hhmm, after) {
  const set = new Set(String(weekdays).split(',').map(Number));
  for (let i = 0; i < 14; i++) {
    const parts = colomboParts(after + i * 86400);
    const dateStr = `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
    const noon = toEpoch(dateStr, '12:00');
    if (noon == null) continue;
    const jsDay = new Date((noon + TZ_OFFSET) * 1000).getUTCDay();
    if (!set.has(jsDay)) continue;
    const e = toEpoch(dateStr, hhmm);
    if (e && e > after) return e;
  }
  return null;
}
/** rule = 'daily' (every day) or a day list like "1,2,3,4,5" */
function nextDaily(hhmm, after, rule) {
  return nextWeekly(rule && rule !== 'daily' ? rule : ALL_DAYS, hhmm, after);
}
/** dayOfMonth 1–31 or 'L' (last day); clamps to last day of month */
function nextMonthly(dayOfMonth, hhmm, after) {
  const dom = String(dayOfMonth).toUpperCase() === 'L' ? 31 : Math.min(31, Math.max(1, Number(dayOfMonth)));
  const start = colomboParts(after);
  for (let i = 0; i < 14; i++) {
    let y = start.y, m = start.m + i;
    while (m > 12) { m -= 12; y += 1; }
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const day = Math.min(dom, lastDay);
    const e = toEpoch(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, hhmm);
    if (e && e > after) return e;
  }
  return null;
}
function computeNextRun(type, rule, hhmm, after) {
  if (type === 'DAILY') return nextDaily(hhmm, after, rule);
  if (type === 'WEEKLY') return nextWeekly(rule, hhmm, after);
  if (type === 'MONTHLY') return nextMonthly(rule, hhmm, after);
  if (type === 'YEARLY' || type === 'BIRTHDAY' || type === 'ANNIVERSARY') return nextYearly(rule, hhmm, after);
  return null;
}
const validMMDD = (s) => /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s) && toEpoch(`2024-${s}`, '00:00') !== null;
function toMMDD(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(?:\d{4}-)?(\d{2}-\d{2})$/);
  return m && validMMDD(m[1]) ? m[1] : false;
}
function parseDays(b) {
  let v = b.days;
  if (v == null) return null;
  if (typeof v === 'string') v = v.split(/[\s,]+/).filter(Boolean);
  if (!Array.isArray(v)) return null;
  const set = new Set(v.map(Number));
  for (const d of set) if (!Number.isInteger(d) || d < 0 || d > 6) throw new ApiError('INVALID_DATE', 'Invalid day selection.');
  return [...set].sort((a, b) => a - b);
}
/** Shared repeat parser (schedules + campaigns). Returns { type, rule, next } */
function parseRepeat(type, b, time, after) {
  let rule, next;
  if (type === 'DAILY') {
    const days = parseDays(b);
    if (days && !days.length) throw new ApiError('INVALID_DATE', 'Choose at least one day.');
    rule = !days || days.length === 7 ? 'daily' : days.join(',');
    next = nextDaily(time, after, rule);
  } else if (type === 'WEEKLY') {
    let days = parseDays(b);
    if (!days) {
      const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      let wd = b.weekday != null ? b.weekday : b.date;
      if (typeof wd === 'string' && map[wd.toLowerCase().slice(0, 3)] != null) wd = map[wd.toLowerCase().slice(0, 3)];
      wd = Number(wd);
      days = Number.isInteger(wd) && wd >= 0 && wd <= 6 ? [wd] : [];
    }
    if (!days.length) throw new ApiError('INVALID_DATE', 'Choose at least one day of the week.');
    rule = days.join(',');
    next = nextWeekly(rule, time, after);
  } else if (type === 'MONTHLY') {
    const raw = b.day_of_month != null ? b.day_of_month : (clean(b.date, 10).match(/(\d{1,2})$/) || [])[1];
    if (String(raw).toUpperCase() === 'L') rule = 'L';
    else {
      const day = Number(raw);
      if (!Number.isInteger(day) || day < 1 || day > 31) throw new ApiError('INVALID_DATE', 'Choose a day of month (1-31 or last day).');
      rule = String(day);
    }
    next = nextMonthly(rule, time, after);
  } else if (type === 'YEARLY') {
    const mmdd = toMMDD(clean(b.date, 10));
    if (!mmdd) throw new ApiError('INVALID_DATE', 'Choose the date to repeat every year.');
    rule = mmdd; next = nextYearly(mmdd, time, after);
  } else {
    throw new ApiError('INVALID_TYPE', 'Invalid repeat type.');
  }
  if (!next) throw new ApiError('INVALID_DATE', 'Could not compute the next run.');
  return { type, rule, next };
}

/* ---------- settings / rate limit / audit ---------- */
async function getSettings(env) {
  const s = { ...DEFAULTS };
  const { results } = await env.DB.prepare('SELECT setting_key, setting_value FROM system_settings').all();
  for (const r of results) if (r.setting_key in DEFAULTS) s[r.setting_key] = Number(r.setting_value);
  return s;
}
async function rateLimit(env, key, max, windowSec) {
  const t = now();
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limits WHERE key=?').bind(key).first();
  if (!row || t - row.window_start >= windowSec) {
    await env.DB.prepare('INSERT INTO rate_limits(key,count,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1, window_start=?').bind(key, t, t).run();
    return true;
  }
  if (row.count >= max) return false;
  await env.DB.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').bind(key).run();
  return true;
}
const audit = (env, actor, action, type, id, meta) =>
  env.DB.prepare('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata,created_at) VALUES(?,?,?,?,?,?)')
    .bind(actor ?? null, action, type ?? null, id != null ? String(id) : null, meta ? JSON.stringify(meta) : null, now()).run();

/* ---------- Email adapter (mail.cloudebase.top) ---------- */
async function sendEmail(env, { to, subject, html, text, senderName }) {
  try {
    const fromEmail = env.EMAIL_FROM_EMAIL || 'notifications@cloudebase.top';
    const fromName = senderName || env.EMAIL_FROM_NAME || 'Cloudebase App';
    const body = {
      to,
      subject: subject || '(no subject)',
      textContent: text || html?.replace(/<[^>]+>/g, '') || '',
      htmlContent: html || `<p>${(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`,
      sender: { name: fromName, email: fromEmail },
    };
    const res = await fetch(env.EMAIL_API_URL || 'https://mail.cloudebase.top', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    let data = null; try { data = await res.json(); } catch { /* non-JSON */ }
    if (res.ok && data && data.success) return { ok: true, id: String(data.messageId || data.id || '') || null };
    return { ok: false, code: String(res.status), message: String((data && data.error) || (data && data.message) || 'Provider error').slice(0, 300), permanent: res.status >= 400 && res.status < 500 };
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: 'Could not reach email provider', permanent: false };
  }
}
/** Turn http(s):// URLs in already-escaped text into clickable links */
const linkify = (s) => s.replace(/(https?:\/\/[^\s<"]+)/gi, (m) => {
  const t = m.match(/[.,!?;:)\]]+$/);
  const url = t ? m.slice(0, -t[0].length) : m;
  return `<a href="${url}" style="color:#5b4bff">${url}</a>${t ? t[0] : ''}`;
});
async function sendAndLog(env, { userId, to, subject, message, type, ref, senderName }) {
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5">${linkify(message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).replace(/\n/g, '<br>')}</div>`;
  const r = await sendEmail(env, { to, subject, html, text: message, senderName });
  const t = now();
  await env.DB.prepare('INSERT INTO email_logs(user_id,recipient_email,message_type,message_reference,subject_preview,message_preview,provider_message_id,status,error_code,error_message,sent_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(userId ?? null, to, type, ref ?? null, type === 'OTP' ? '[verification code]' : (subject || '').slice(0, 120), type === 'OTP' ? '[verification code]' : message.slice(0, 200), r.id ?? null, r.ok ? 'SENT' : 'FAILED', r.ok ? null : r.code, r.ok ? null : r.message, r.ok ? t : null, t).run();
  return r;
}

/* ---------- templates / limits ---------- */
function validateTemplate(tpl, max = MAX_MSG) {
  if (!tpl || tpl.length > max) throw new ApiError('INVALID_MESSAGE', `Message is required (max ${max} characters).`);
  for (const m of tpl.matchAll(/\{(\w+)\}/g)) if (!TEMPLATE_VARS.includes(m[1])) throw new ApiError('UNKNOWN_VARIABLE', `Unknown variable {${m[1]}}. Allowed: ${TEMPLATE_VARS.map((v) => `{${v}}`).join(', ')}.`);
}
const renderTemplate = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => (k in v ? v[k] : `{${k}}`));
function composeMessage(tpl, { name, sender, email, signature }) {
  let msg = renderTemplate(tpl, { name: name || '', sender: sender || '', year: String(colomboParts(now()).y), email: email || '' });
  if (signature && sender && !/\{sender\}/.test(tpl)) msg += `\n\n- ${sender}`;
  return msg;
}
function resolveSender(settings, user, requested) {
  const s = clean(requested ?? user.sender_name ?? '', 60);
  if (!s) return '';
  if (!settings.allow_custom_sender_name && s !== (user.sender_name || '')) throw new ApiError('SENDER_NOT_ALLOWED', 'Custom sender names are disabled.');
  return s;
}
async function checkQuota(env, user, settings, count = 1) {
  if (user.role === 'ADMIN') return;
  const t = now();
  const q = (since) => env.DB.prepare("SELECT COUNT(*) c FROM email_logs WHERE user_id=? AND status='SENT' AND message_type!='OTP' AND created_at>=?").bind(user.id, since).first();
  const [d, m] = await Promise.all([q(dayStart(t)), q(monthStart(t))]);
  if (d.c + count > settings.max_daily_emails) throw new ApiError('EMAIL_LIMIT_REACHED', 'Your daily email limit has been reached.', 429);
  if (m.c + count > settings.max_monthly_emails) throw new ApiError('EMAIL_LIMIT_REACHED', 'Your monthly email limit has been reached.', 429);
}
const ACTIVE = "('PENDING','ACTIVE','PROCESSING')";

/* ---------- auth ---------- */
const publicUser = (u) => ({ id: u.id, email: u.email, display_name: u.display_name, sender_name: u.sender_name, role: u.role, status: u.status, schedule_limit: u.schedule_limit ?? null, created_at: u.created_at, last_login_at: u.last_login_at });
function userScheduleLimit(user, settings) {
  // Admin has no schedule limit (not bound by default user settings)
  if (user.role === 'ADMIN') return null;
  const n = user.schedule_limit;
  if (n != null && Number.isFinite(Number(n)) && Number(n) >= 0) return Number(n);
  return settings.max_user_scheduled_messages;
}

async function createSession(env, req, userId) {
  const token = rand(32), t = now();
  const ip = req.headers.get('CF-Connecting-IP') || '';
  await env.DB.prepare('INSERT INTO sessions(user_id,session_token_hash,expires_at,created_at,last_used_at,ip_hash,user_agent) VALUES(?,?,?,?,?,?,?)')
    .bind(userId, await sha256(token), t + SESSION_TTL, t, t, await sha256(ip + env.SESSION_SECRET), (req.headers.get('User-Agent') || '').slice(0, 120)).run();
  return { 'Set-Cookie': `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}` };
}
const clearCookie = { 'Set-Cookie': 'sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' };
function cookieSid(req) { const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})/); return m ? m[1] : null; }

async function authenticate(req, env) {
  const sid = cookieSid(req);
  if (!sid) return null;
  const h = await sha256(sid);
  const row = await env.DB.prepare('SELECT u.*, s.id AS sid_row FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.session_token_hash=? AND s.expires_at>?').bind(h, now()).first();
  if (!row || row.status !== 'ACTIVE') return null;
  row.session_hash = h;
  return row;
}

async function requestOtp(env, req, settings, email, purpose, userId) {
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  // Short window: 3 per email / 15 min, 8 per IP / 15 min (stops rapid spam)
  // Long window: settings.max_otp_requests per email / hour, 4x that per IP / hour
  const shortMax = Math.min(3, settings.max_otp_requests);
  if (
    !(await rateLimit(env, `otp15:${email}`, shortMax, 900)) ||
    !(await rateLimit(env, `otpip15:${ip}`, 8, 900)) ||
    !(await rateLimit(env, `otp:${email}`, settings.max_otp_requests, 3600)) ||
    !(await rateLimit(env, `otpip:${ip}`, settings.max_otp_requests * 4, 3600))
  )
    throw new ApiError('OTP_RATE_LIMIT', 'Too many OTP requests. Please try again later.', 429);
  const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const t = now();
  await env.DB.prepare('UPDATE otp_requests SET used_at=? WHERE email=? AND purpose=? AND used_at IS NULL').bind(t, email, purpose).run();
  await env.DB.prepare('INSERT INTO otp_requests(user_id,email,otp_hash,purpose,expires_at,created_at) VALUES(?,?,?,?,?,?)')
    .bind(userId ?? null, email, await sha256(`${otp}:${email}:${env.SESSION_SECRET}`), purpose, t + settings.otp_expiry_minutes * 60, t).run();
  const subject = 'Your verification code';
  const message = `Your verification code is ${otp}.\n\nIt expires in ${settings.otp_expiry_minutes} minutes.\nDo not share this code with anyone.`;
  if (env.DEV_MODE === '1') { console.log(`[DEV] OTP for ${email}: ${otp}`); return; }
  const r = await sendAndLog(env, { userId, to: email, subject, message, type: 'OTP' });
  if (!r.ok) throw new ApiError('EMAIL_FAILED', 'Could not send the verification code. Please try again.', 502);
}
async function checkOtp(env, settings, email, purpose, otp) {
  const row = await env.DB.prepare('SELECT * FROM otp_requests WHERE email=? AND purpose=? AND used_at IS NULL ORDER BY id DESC LIMIT 1').bind(email, purpose).first();
  if (!row || row.expires_at < now()) throw new ApiError('INVALID_OTP', 'The code is invalid or has expired.');
  if (row.attempt_count >= settings.max_otp_attempts) throw new ApiError('OTP_LOCKED', 'Too many incorrect attempts. Request a new code.', 429);
  const h = await sha256(`${clean(String(otp), 10)}:${email}:${env.SESSION_SECRET}`);
  if (h !== row.otp_hash) {
    await env.DB.prepare('UPDATE otp_requests SET attempt_count=attempt_count+1 WHERE id=?').bind(row.id).run();
    throw new ApiError('INVALID_OTP', 'The code is invalid or has expired.');
  }
  return row;
}
const needEmail = (b) => { const e = normalizeEmail(b.email); if (!e) throw new ApiError('INVALID_EMAIL', 'Enter a valid email address.'); return e; };

/* ---------- schedules ---------- */
async function buildSchedule(env, user, settings, b) {
  const type = b.schedule_type;
  const ALLOWED = ['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'BIRTHDAY', 'ANNIVERSARY'];
  if (!ALLOWED.includes(type)) throw new ApiError('INVALID_TYPE', 'Invalid schedule type.');
  const message = clean(b.message, MAX_MSG + 1);
  validateTemplate(message);
  const subject = clean(b.subject || 'Reminder', MAX_SUBJECT + 1);
  validateTemplate(subject, MAX_SUBJECT);
  let recipient, name = clean(b.recipient_name, 80), contactId = null, contact = null;
  if (b.contact_id) {
    contact = await env.DB.prepare('SELECT * FROM contacts WHERE id=? AND user_id=?').bind(Number(b.contact_id), user.id).first();
    if (!contact) throw new ApiError('NOT_FOUND', 'Contact not found.', 404);
    recipient = contact.email; name = contact.name; contactId = contact.id;
  } else {
    recipient = normalizeEmail(b.recipient);
    if (!recipient) throw new ApiError('INVALID_EMAIL', 'Enter a valid recipient email address.');
  }
  const time = clean(b.time, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError('INVALID_TIME', 'Enter a valid time (HH:MM).');
  const sender = resolveSender(settings, user, b.sender_name);
  const f = { type, recipient, name, contactId, message, subject, sender, time };
  const t = now();

  if (type === 'ONE_TIME') {
    const at = toEpoch(clean(b.date, 10), time);
    if (!at) throw new ApiError('INVALID_DATE', 'Enter a valid date.');
    if (at <= t + 30) throw new ApiError('PAST_DATE', 'Schedule time must be in the future (Sri Lanka time).');
    Object.assign(f, { scheduledAt: at, nextRun: at, rule: null, status: 'PENDING' });
  } else if (type === 'DAILY' || type === 'WEEKLY') {
    const p = parseRepeat(type, b, time, t);
    Object.assign(f, { scheduledAt: null, nextRun: p.next, rule: p.rule, status: 'ACTIVE' });
  } else if (type === 'MONTHLY') {
    const p = parseRepeat('MONTHLY', b, time, t);
    Object.assign(f, { scheduledAt: null, nextRun: p.next, rule: p.rule, status: 'ACTIVE' });
  } else {
    // YEARLY / BIRTHDAY / ANNIVERSARY
    let mmdd = toMMDD(clean(b.date, 10));
    if (mmdd === null || mmdd === undefined) {
      if (contact) mmdd = type === 'BIRTHDAY' ? contact.birthday : type === 'ANNIVERSARY' ? contact.anniversary : null;
    }
    if (!mmdd) throw new ApiError('INVALID_DATE', 'Choose the date to repeat every year (MM-DD).');
    if (mmdd === false) throw new ApiError('INVALID_DATE', 'Enter a valid MM-DD date.');
    const next = nextYearly(mmdd, time, t);
    if (!next) throw new ApiError('INVALID_DATE', 'Could not compute next yearly run.');
    Object.assign(f, { scheduledAt: null, nextRun: next, rule: mmdd, status: 'ACTIVE' });
  }
  return f;
}
const scheduleOut = (r) => ({
  id: r.id, schedule_type: r.schedule_type, recipient_email: r.recipient_email, recipient_name: r.recipient_name,
  subject_template: r.subject_template, message_template: r.message_template, sender_name: r.sender_name,
  scheduled_at: r.scheduled_at, next_run_at: r.next_run_at, send_time: r.send_time, recurrence_rule: r.recurrence_rule,
  status: r.status, last_run_at: r.last_run_at, last_error: r.last_error, created_at: r.created_at,
});

/* ---------- routing ---------- */
const routes = [];
function route(method, path, auth, handler) {
  const parts = path.split('/').filter(Boolean);
  routes.push({ method, parts, auth, handler });
}
function matchRoute(method, pathname) {
  const segs = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (r.parts[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { ...r, params };
  }
  return null;
}

// --- auth
route('POST', '/api/auth/register/request', 'public', async (c) => {
  if (!c.settings.registration_enabled) throw new ApiError('REGISTRATION_DISABLED', 'Registration is currently disabled.', 403);
  const email = needEmail(c.body);
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
  if (existing) throw new ApiError('EMAIL_EXISTS', 'An account with this email already exists.');
  await requestOtp(c.env, c.req, c.settings, email, 'REGISTRATION', null);
  return ok({ email });
});
route('POST', '/api/auth/register/verify', 'public', async (c) => {
  const email = needEmail(c.body);
  const otpRow = await checkOtp(c.env, c.settings, email, 'REGISTRATION', c.body.otp);
  const name = clean(c.body.display_name, 60); if (!name) throw new ApiError('INVALID_NAME', 'Enter your name.');
  checkPassword(c.body.password);
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
  if (existing) throw new ApiError('EMAIL_EXISTS', 'An account with this email already exists.');
  const t = now();
  const isAdmin = (c.env.ADMIN_EMAIL || '').toLowerCase() === email;
  const r = await c.env.DB.prepare('INSERT INTO users(email,email_verified,password_hash,display_name,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(email, 1, await hashPassword(c.body.password), name, isAdmin ? 'ADMIN' : 'USER', 'ACTIVE', t, t).run();
  await c.env.DB.prepare('UPDATE otp_requests SET used_at=?, verified_at=? WHERE id=?').bind(t, t, otpRow.id).run();
  const headers = await createSession(c.env, c.req, r.meta.last_row_id);
  return ok({ user: publicUser({ id: r.meta.last_row_id, email, display_name: name, sender_name: null, role: isAdmin ? 'ADMIN' : 'USER', status: 'ACTIVE', created_at: t, last_login_at: t }) }, headers);
});
route('POST', '/api/auth/login', 'public', async (c) => {
  const email = needEmail(c.body);
  if (!(await rateLimit(c.env, `login:${email}`, c.settings.max_login_attempts, 900))) throw new ApiError('LOGIN_LOCKED', 'Too many login attempts. Try again later.', 429);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if (!user || !(await verifyPassword(c.body.password || '', user.password_hash))) throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password.');
  if (user.status !== 'ACTIVE') throw new ApiError('ACCOUNT_DISABLED', 'Your account is not active.', 403);
  await c.env.DB.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(now(), user.id).run();
  const headers = await createSession(c.env, c.req, user.id);
  return ok({ user: publicUser(user) }, headers);
});
route('POST', '/api/auth/logout', 'user', async (c) => {
  if (c.user.session_hash) await c.env.DB.prepare('DELETE FROM sessions WHERE session_token_hash=?').bind(c.user.session_hash).run();
  return ok({}, clearCookie);
});
route('GET', '/api/auth/me', 'user', async (c) => {
  const t = now();
  const isAdmin = c.user.role === 'ADMIN';
  const schedLimit = userScheduleLimit(c.user, c.settings);
  const [today, month, schedules, contacts] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) c FROM email_logs WHERE user_id=? AND status='SENT' AND message_type!='OTP' AND created_at>=?").bind(c.user.id, dayStart(t)).first(),
    c.env.DB.prepare("SELECT COUNT(*) c FROM email_logs WHERE user_id=? AND status='SENT' AND message_type!='OTP' AND created_at>=?").bind(c.user.id, monthStart(t)).first(),
    c.env.DB.prepare(`SELECT COUNT(*) c FROM scheduled_messages WHERE user_id=? AND status IN ${ACTIVE}`).bind(c.user.id).first(),
    c.env.DB.prepare('SELECT COUNT(*) c FROM contacts WHERE user_id=?').bind(c.user.id).first(),
  ]);
  return ok({
    user: publicUser(c.user),
    usage: { emails_today: today.c, emails_month: month.c, active_schedules: schedules.c, contacts: contacts.c },
    limits: {
      // Admin is not bound by user limits
      max_daily_emails: isAdmin ? null : c.settings.max_daily_emails,
      max_monthly_emails: isAdmin ? null : c.settings.max_monthly_emails,
      max_user_scheduled_messages: schedLimit, // null for admin = unlimited
      max_contacts: isAdmin ? null : c.settings.max_contacts,
    },
  });
});
route('POST', '/api/auth/password/change', 'user', async (c) => {
  if (!(await verifyPassword(c.body.current_password || '', c.user.password_hash))) throw new ApiError('INVALID_PASSWORD', 'Current password is incorrect.');
  checkPassword(c.body.new_password);
  await c.env.DB.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').bind(await hashPassword(c.body.new_password), now(), c.user.id).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND session_token_hash!=?').bind(c.user.id, c.user.session_hash).run();
  return ok({});
});
route('POST', '/api/auth/password/forgot', 'public', async (c) => {
  const email = needEmail(c.body);
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
  if (user) await requestOtp(c.env, c.req, c.settings, email, 'PASSWORD_RESET', user.id);
  return ok({}); // always succeed to avoid email enumeration
});
route('POST', '/api/auth/password/reset', 'public', async (c) => {
  const email = needEmail(c.body);
  const otpRow = await checkOtp(c.env, c.settings, email, 'PASSWORD_RESET', c.body.otp);
  checkPassword(c.body.password);
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
  if (!user) throw new ApiError('NOT_FOUND', 'Account not found.', 404);
  const t = now();
  await c.env.DB.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').bind(await hashPassword(c.body.password), t, user.id).run();
  await c.env.DB.prepare('UPDATE otp_requests SET used_at=?, verified_at=? WHERE id=?').bind(t, t, otpRow.id).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
  return ok({});
});

// --- profile
route('PUT', '/api/profile', 'user', async (c) => {
  const name = clean(c.body.display_name, 60); if (!name) throw new ApiError('INVALID_NAME', 'Name is required.');
  const sender = clean(c.body.sender_name, 60);
  await c.env.DB.prepare('UPDATE users SET display_name=?, sender_name=?, updated_at=? WHERE id=?').bind(name, sender || null, now(), c.user.id).run();
  return ok({ user: publicUser({ ...c.user, display_name: name, sender_name: sender || null }) });
});

// --- contacts
route('GET', '/api/contacts', 'user', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM contacts WHERE user_id=? ORDER BY name COLLATE NOCASE LIMIT 500').bind(c.user.id).all();
  return ok({ contacts: results });
});
route('POST', '/api/contacts', 'user', async (c) => {
  const cnt = await c.env.DB.prepare('SELECT COUNT(*) c FROM contacts WHERE user_id=?').bind(c.user.id).first();
  if (c.user.role !== 'ADMIN' && cnt.c >= c.settings.max_contacts) throw new ApiError('CONTACT_LIMIT', `You can have at most ${c.settings.max_contacts} contacts.`, 403);
  const name = clean(c.body.name, 80); if (!name) throw new ApiError('INVALID_NAME', 'Name is required.');
  const email = normalizeEmail(c.body.email); if (!email) throw new ApiError('INVALID_EMAIL', 'Enter a valid email address.');
  const birthday = toMMDD(c.body.birthday); if (birthday === false) throw new ApiError('INVALID_DATE', 'Invalid birthday (use MM-DD).');
  const anniversary = toMMDD(c.body.anniversary); if (anniversary === false) throw new ApiError('INVALID_DATE', 'Invalid anniversary (use MM-DD).');
  const notes = clean(c.body.notes, 300);
  const t = now();
  try {
    const r = await c.env.DB.prepare('INSERT INTO contacts(user_id,name,email,birthday,anniversary,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(c.user.id, name, email, birthday || null, anniversary || null, notes || null, t, t).run();
    return ok({ id: r.meta.last_row_id });
  } catch (e) {
    if (String(e.message || e).includes('UNIQUE')) throw new ApiError('DUPLICATE', 'You already have this contact email.');
    throw e;
  }
});
route('POST', '/api/contacts/import', 'user', async (c) => {
  const list = Array.isArray(c.body.contacts) ? c.body.contacts : [];
  if (!list.length) throw new ApiError('NO_CONTACTS', 'No contacts found in the file.');
  if (list.length > 1000) throw new ApiError('TOO_MANY', 'Import at most 1000 contacts at a time.');
  const { results: ex } = await c.env.DB.prepare('SELECT email FROM contacts WHERE user_id=?').bind(c.user.id).all();
  const have = new Set(ex.map((r) => r.email));
  const isAdmin = c.user.role === 'ADMIN';
  let room = isAdmin ? Infinity : c.settings.max_contacts - ex.length;
  const t = now(), rows = [];
  let invalid = 0, duplicates = 0, overLimit = 0;
  for (const it of list) {
    const email = normalizeEmail(it && it.email);
    const name = clean(it && it.name, 80) || (email ? email.split('@')[0] : '');
    if (!email || !name) { invalid++; continue; }
    if (have.has(email)) { duplicates++; continue; }
    if (room <= 0) { overLimit++; continue; }
    have.add(email); room--;
    const bd = toMMDD(it.birthday), an = toMMDD(it.anniversary);
    rows.push(c.env.DB.prepare('INSERT OR IGNORE INTO contacts(user_id,name,email,birthday,anniversary,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(c.user.id, name, email, bd || null, an || null, clean(it.notes, 300) || null, t, t));
  }
  for (let i = 0; i < rows.length; i += 90) await c.env.DB.batch(rows.slice(i, i + 90));
  return ok({ imported: rows.length, duplicates, invalid, over_limit: overLimit });
});
route('POST', '/api/contacts/delete', 'user', async (c) => {
  const ids = [...new Set((Array.isArray(c.body.ids) ? c.body.ids : []).map(Number).filter(Number.isInteger))].slice(0, 5000);
  if (!ids.length) throw new ApiError('NO_CONTACTS', 'Select at least one contact.');
  let removed = 0;
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const r = await c.env.DB.prepare(`DELETE FROM contacts WHERE user_id=? AND id IN (${part.map(() => '?').join(',')})`).bind(c.user.id, ...part).run();
    removed += r.meta.changes;
  }
  return ok({ removed });
});
route('PUT', '/api/contacts/:id', 'user', async (c) => {
  const name = clean(c.body.name, 80); if (!name) throw new ApiError('INVALID_NAME', 'Name is required.');
  const email = normalizeEmail(c.body.email); if (!email) throw new ApiError('INVALID_EMAIL', 'Enter a valid email address.');
  const birthday = toMMDD(c.body.birthday); if (birthday === false) throw new ApiError('INVALID_DATE', 'Invalid birthday.');
  const anniversary = toMMDD(c.body.anniversary); if (anniversary === false) throw new ApiError('INVALID_DATE', 'Invalid anniversary.');
  const notes = clean(c.body.notes, 300);
  const r = await c.env.DB.prepare('UPDATE contacts SET name=?,email=?,birthday=?,anniversary=?,notes=?,updated_at=? WHERE id=? AND user_id=?')
    .bind(name, email, birthday || null, anniversary || null, notes || null, now(), Number(c.params.id), c.user.id).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'Contact not found.', 404);
  return ok({});
});
route('DELETE', '/api/contacts/:id', 'user', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM contacts WHERE id=? AND user_id=?').bind(Number(c.params.id), c.user.id).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'Contact not found.', 404);
  return ok({});
});

// --- templates
const tplFields = (b) => {
  const name = clean(b.template_name, 60); if (!name) throw new ApiError('INVALID_NAME', 'Template name is required.');
  const subject = clean(b.subject_body || '', MAX_SUBJECT);
  const body = clean(b.message_body, MAX_MSG + 1);
  validateTemplate(body);
  if (subject) validateTemplate(subject, MAX_SUBJECT);
  return [name, subject, body];
};
route('GET', '/api/templates', 'user', async (c) => ok({ templates: (await c.env.DB.prepare('SELECT * FROM message_templates WHERE user_id=? ORDER BY id DESC LIMIT 100').bind(c.user.id).all()).results }));
route('POST', '/api/templates', 'user', async (c) => {
  const f = tplFields(c.body), t = now();
  const r = await c.env.DB.prepare('INSERT INTO message_templates(user_id,template_name,subject_body,message_body,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(c.user.id, ...f, t, t).run();
  return ok({ id: r.meta.last_row_id });
});
route('PUT', '/api/templates/:id', 'user', async (c) => {
  const f = tplFields(c.body);
  const r = await c.env.DB.prepare('UPDATE message_templates SET template_name=?,subject_body=?,message_body=?,updated_at=? WHERE id=? AND user_id=?').bind(...f, now(), Number(c.params.id), c.user.id).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'Template not found.', 404);
  return ok({});
});
route('DELETE', '/api/templates/:id', 'user', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM message_templates WHERE id=? AND user_id=?').bind(Number(c.params.id), c.user.id).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'Template not found.', 404);
  return ok({});
});

// --- email send
route('POST', '/api/email/send', 'user', async (c) => {
  const recipient = normalizeEmail(c.body.recipient);
  if (!recipient) throw new ApiError('INVALID_EMAIL', 'Enter a valid recipient email address.');
  const subject = clean(c.body.subject || 'Message', MAX_SUBJECT + 1);
  validateTemplate(subject, MAX_SUBJECT);
  const raw = clean(c.body.message, MAX_MSG + 1);
  validateTemplate(raw);
  const sender = resolveSender(c.settings, c.user, c.body.sender_name);
  const message = composeMessage(raw, { name: clean(c.body.recipient_name, 80), sender, email: recipient, signature: !!c.body.append_signature });
  const subj = composeMessage(subject, { name: clean(c.body.recipient_name, 80), sender, email: recipient });
  if (!(await rateLimit(c.env, `email:${c.user.id}`, 30, 600))) throw new ApiError('RATE_LIMIT', 'You are sending too fast. Please wait a moment.', 429);
  await checkQuota(c.env, c.user, c.settings, 1);
  const r = await sendAndLog(c.env, { userId: c.user.id, to: recipient, subject: subj, message, type: 'SINGLE', senderName: sender || undefined });
  if (!r.ok) throw new ApiError('EMAIL_FAILED', 'The email could not be sent: ' + r.message, 502);
  return ok({ provider_message_id: r.id });
});
route('GET', '/api/email/history', 'user', async (c) => {
  const off = Math.max(0, Number(c.url.searchParams.get('offset')) || 0);
  const { results } = await c.env.DB.prepare("SELECT id,recipient_email,message_type,subject_preview,message_preview,provider_message_id,status,error_message,created_at FROM email_logs WHERE user_id=? AND hidden=0 AND message_type!='OTP' ORDER BY id DESC LIMIT 30 OFFSET ?").bind(c.user.id, off).all();
  return ok({ logs: results, next_offset: results.length === 30 ? off + 30 : null });
});
route('DELETE', '/api/email/history', 'user', async (c) => {
  const r = await c.env.DB.prepare("UPDATE email_logs SET hidden=1 WHERE user_id=? AND hidden=0 AND message_type!='OTP'").bind(c.user.id).run();
  return ok({ removed: r.meta.changes });
});

// --- schedules
route('GET', '/api/schedules', 'user', async (c) => {
  const limit = userScheduleLimit(c.user, c.settings);
  return ok({ schedules: (await c.env.DB.prepare('SELECT * FROM scheduled_messages WHERE user_id=? ORDER BY (status IN (\'PENDING\',\'ACTIVE\',\'PROCESSING\')) DESC, next_run_at ASC LIMIT 200').bind(c.user.id).all()).results.map(scheduleOut), limit });
});
route('POST', '/api/schedules', 'user', async (c) => {
  const limit = userScheduleLimit(c.user, c.settings);
  if (limit != null) {
    const cnt = await c.env.DB.prepare(`SELECT COUNT(*) c FROM scheduled_messages WHERE user_id=? AND status IN ${ACTIVE}`).bind(c.user.id).first();
    if (cnt.c >= limit) throw new ApiError('SCHEDULE_LIMIT', `You can have at most ${limit} active schedules.`, 403);
  }
  const f = await buildSchedule(c.env, c.user, c.settings, c.body), t = now();
  const r = await c.env.DB.prepare('INSERT INTO scheduled_messages(user_id,contact_id,schedule_type,recipient_email,recipient_name,subject_template,message_template,sender_name,scheduled_at,next_run_at,recurrence_rule,send_time,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(c.user.id, f.contactId, f.type, f.recipient, f.name || null, f.subject, f.message, f.sender || null, f.scheduledAt, f.nextRun, f.rule, f.time, f.status, t, t).run();
  return ok({ id: r.meta.last_row_id });
});
route('PUT', '/api/schedules/:id', 'user', async (c) => {
  const cur = await c.env.DB.prepare('SELECT * FROM scheduled_messages WHERE id=? AND user_id=?').bind(Number(c.params.id), c.user.id).first();
  if (!cur) throw new ApiError('NOT_FOUND', 'Schedule not found.', 404);
  if (!['PENDING', 'ACTIVE'].includes(cur.status)) throw new ApiError('NOT_EDITABLE', 'Only pending or active schedules can be edited.', 409);
  const f = await buildSchedule(c.env, c.user, c.settings, c.body);
  const r = await c.env.DB.prepare("UPDATE scheduled_messages SET contact_id=?,schedule_type=?,recipient_email=?,recipient_name=?,subject_template=?,message_template=?,sender_name=?,scheduled_at=?,next_run_at=?,recurrence_rule=?,send_time=?,status=?,updated_at=? WHERE id=? AND user_id=? AND status IN ('PENDING','ACTIVE')")
    .bind(f.contactId, f.type, f.recipient, f.name || null, f.subject, f.message, f.sender || null, f.scheduledAt, f.nextRun, f.rule, f.time, f.status, now(), cur.id, c.user.id).run();
  if (!r.meta.changes) throw new ApiError('NOT_EDITABLE', 'Schedule is already being processed.', 409);
  return ok({});
});
route('DELETE', '/api/schedules/:id', 'user', async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM scheduled_messages WHERE id=? AND user_id=? AND status!='PROCESSING'").bind(Number(c.params.id), c.user.id).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'Schedule not found.', 404);
  return ok({});
});
// cancel all = remove every pending/active schedule
route('POST', '/api/schedules/cancel-all', 'user', async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM scheduled_messages WHERE user_id=? AND status IN ('PENDING','ACTIVE')").bind(c.user.id).run();
  return ok({ removed: r.meta.changes });
});
// clear finished (sent / failed / cancelled)
route('DELETE', '/api/schedules', 'user', async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM scheduled_messages WHERE user_id=? AND status IN ('SENT','FAILED','CANCELLED')").bind(c.user.id).run();
  return ok({ removed: r.meta.changes });
});

// --- admin
route('GET', '/api/admin/users', 'admin', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT u.id,u.email,u.display_name,u.role,u.status,u.schedule_limit,u.created_at,u.last_login_at,
    (SELECT COUNT(*) FROM scheduled_messages s WHERE s.user_id=u.id AND s.status IN ${ACTIVE}) AS active_schedules,
    (SELECT COUNT(*) FROM email_logs l WHERE l.user_id=u.id AND l.status='SENT' AND l.message_type!='OTP' AND l.created_at>=?) AS emails_today
    FROM users u ORDER BY u.id DESC LIMIT 300`).bind(dayStart(now())).all();
  return ok({ users: results, default_schedule_limit: c.settings.max_user_scheduled_messages });
});
route('PUT', '/api/admin/users/:id/status', 'admin', async (c) => {
  const id = Number(c.params.id), st = c.body.status;
  if (!['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(st)) throw new ApiError('INVALID_STATUS', 'Invalid status.');
  if (id === c.user.id) throw new ApiError('FORBIDDEN', 'You cannot change your own status.', 403);
  const r = await c.env.DB.prepare('UPDATE users SET status=?, updated_at=? WHERE id=?').bind(st, now(), id).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'User not found.', 404);
  if (st !== 'ACTIVE') await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
  await audit(c.env, c.user.id, st === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_SUSPENDED', 'user', id, { status: st });
  return ok({});
});
route('PUT', '/api/admin/users/:id/schedule-limit', 'admin', async (c) => {
  const id = Number(c.params.id);
  const target = await c.env.DB.prepare('SELECT id, role FROM users WHERE id=?').bind(id).first();
  if (!target) throw new ApiError('NOT_FOUND', 'User not found.', 404);
  if (target.role === 'ADMIN') throw new ApiError('FORBIDDEN', 'Admin accounts have no schedule limit.', 403);
  let lim = c.body.schedule_limit;
  if (lim === null || lim === '' || lim === undefined) lim = null;
  else {
    lim = Number(lim);
    if (!Number.isInteger(lim) || lim < 0 || lim > 10000) throw new ApiError('INVALID_LIMIT', 'Schedule limit must be 0–10000, or empty for default.');
  }
  const r = await c.env.DB.prepare('UPDATE users SET schedule_limit=?, updated_at=? WHERE id=?').bind(lim, now(), id).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'User not found.', 404);
  await audit(c.env, c.user.id, 'USER_SCHEDULE_LIMIT', 'user', id, { schedule_limit: lim });
  return ok({ schedule_limit: lim });
});
route('DELETE', '/api/admin/users/:id', 'admin', async (c) => {
  const id = Number(c.params.id);
  if (id === c.user.id) throw new ApiError('FORBIDDEN', 'You cannot delete your own account.', 403);
  const target = await c.env.DB.prepare('SELECT id, role, email FROM users WHERE id=?').bind(id).first();
  if (!target) throw new ApiError('NOT_FOUND', 'User not found.', 404);
  if (target.role === 'ADMIN') throw new ApiError('FORBIDDEN', 'Cannot delete another admin account.', 403);
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM email_campaigns WHERE created_by=?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run();
  await audit(c.env, c.user.id, 'USER_DELETED', 'user', id, { email: target.email });
  return ok({});
});
route('POST', '/api/admin/users/:id/revoke-sessions', 'admin', async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(Number(c.params.id)).run();
  await audit(c.env, c.user.id, 'SESSIONS_REVOKED', 'user', c.params.id);
  return ok({});
});
route('GET', '/api/admin/email', 'admin', async (c) => {
  const off = Math.max(0, Number(c.url.searchParams.get('offset')) || 0);
  const failed = c.url.searchParams.get('failed') === '1';
  const { results } = await c.env.DB.prepare(`SELECT l.id,l.recipient_email,l.message_type,l.subject_preview,l.message_preview,l.status,l.error_message,l.created_at,u.display_name FROM email_logs l LEFT JOIN users u ON u.id=l.user_id WHERE l.message_type!='OTP' ${failed ? "AND l.status='FAILED'" : ''} ORDER BY l.id DESC LIMIT 30 OFFSET ?`).bind(off).all();
  return ok({ logs: results, next_offset: results.length === 30 ? off + 30 : null });
});
// --- campaigns: users manage their own, admin manages all
async function listCampaigns(c, all) {
  const sql = `SELECT c.*,
    (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id) total,
    (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='SENT') sent,
    (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='FAILED') failed,
    (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.status IN ('PENDING','PROCESSING')) pending
    FROM email_campaigns c ${all ? '' : 'WHERE c.created_by=?'} ORDER BY c.id DESC LIMIT 50`;
  const st = c.env.DB.prepare(sql);
  const { results } = await (all ? st : st.bind(c.user.id)).all();
  return ok({ campaigns: results, max_recipients: c.settings.max_bulk_recipients });
}
/** typed emails + selected contacts -> Map(email -> name). Contacts supply names for {name}. */
async function collectRecipients(c, b) {
  const found = new Map();
  let bad = 0;
  const add = (email, nm) => {
    const e = normalizeEmail(email);
    if (!e) { bad++; return; }
    const n = clean(nm || '', 80);
    if (!found.has(e) || (!found.get(e) && n)) found.set(e, n);
  };
  const raw = Array.isArray(b.recipients) ? b.recipients : String(b.recipients || '').split(/[\s,;]+/);
  for (const r of raw) {
    if (!r) continue;
    if (typeof r === 'string') add(r, '');
    else if (typeof r === 'object') add(r.email, r.name);
    else bad++;
  }
  const ids = [...new Set((Array.isArray(b.contact_ids) ? b.contact_ids : []).map(Number).filter(Number.isInteger))];
  if (ids.length > 5000) throw new ApiError('TOO_MANY_RECIPIENTS', 'Too many contacts selected.');
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const { results } = await c.env.DB.prepare(`SELECT name,email FROM contacts WHERE user_id=? AND id IN (${part.map(() => '?').join(',')})`).bind(c.user.id, ...part).all();
    for (const r of results) add(r.email, r.name);
  }
  if (bad) throw new ApiError('INVALID_EMAIL', 'One or more recipient emails are invalid.');
  return found;
}
/** Send-now / one-time date / repeat settings -> { at, rep } */
function campaignSchedule(b, t) {
  let at = t, rep = null;
  const rtype = clean(b.repeat, 10).toUpperCase();
  if (rtype) {
    const time = clean(b.time, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError('INVALID_TIME', 'Enter a valid time (HH:MM).');
    rep = parseRepeat(rtype, b, time, t);
    rep.time = time;
    at = rep.next;
  } else if (b.date && b.time) {
    at = toEpoch(clean(b.date, 10), clean(b.time, 5));
    if (!at) throw new ApiError('INVALID_DATE', 'Invalid schedule date/time.');
    if (at < t - 60) throw new ApiError('PAST_DATE', 'Schedule time must be in the future.');
  }
  return { at, rep };
}
async function createCampaign(c) {
  const b = c.body, isAdmin = c.user.role === 'ADMIN';
  const rawSubject = clean(b.subject, MAX_SUBJECT + 1);
  const name = clean(b.campaign_name, 80) || clean(rawSubject, 80);
  if (!name) throw new ApiError('INVALID_NAME', 'Campaign name or subject is required.');
  const subject = rawSubject || name;
  validateTemplate(subject, MAX_SUBJECT);
  const msg = clean(b.message, MAX_MSG + 1);
  validateTemplate(msg);

  const found = await collectRecipients(c, b);
  const emails = [...found.keys()];
  if (!emails.length) throw new ApiError('NO_RECIPIENTS', 'Add at least one recipient.');
  if (emails.length > c.settings.max_bulk_recipients) throw new ApiError('TOO_MANY_RECIPIENTS', `Maximum ${c.settings.max_bulk_recipients} recipients per campaign.`);

  if (!isAdmin) {
    if (!(await rateLimit(c.env, `camp:${c.user.id}`, 10, 3600))) throw new ApiError('RATE_LIMIT', 'Too many campaigns created. Try again later.', 429);
    const pend = await c.env.DB.prepare("SELECT COUNT(*) c FROM email_campaign_recipients r JOIN email_campaigns k ON k.id=r.campaign_id WHERE k.created_by=? AND r.status IN ('PENDING','PROCESSING')").bind(c.user.id).first();
    await checkQuota(c.env, c.user, c.settings, emails.length + pend.c);
  }

  const t = now();
  const { at, rep } = campaignSchedule(b, t);
  const sender = isAdmin ? clean(b.sender_name, 60) : resolveSender(c.settings, c.user, b.sender_name || undefined);
  const r = await c.env.DB.prepare('INSERT INTO email_campaigns(created_by,campaign_name,subject,message,sender_name,scheduled_at,status,created_at,repeat_type,repeat_rule,repeat_time) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(c.user.id, name, subject, msg, sender || c.user.sender_name || null, at, 'SCHEDULED', t, rep ? rep.type : null, rep ? rep.rule : null, rep ? rep.time : null).run();
  const id = r.meta.last_row_id;
  const stmts = emails.map((e) => c.env.DB.prepare('INSERT INTO email_campaign_recipients(campaign_id,recipient_email,recipient_name,status,created_at) VALUES(?,?,?,?,?)').bind(id, e, found.get(e) || null, 'PENDING', t));
  for (let i = 0; i < stmts.length; i += 90) await c.env.DB.batch(stmts.slice(i, i + 90));
  await audit(c.env, c.user.id, 'CAMPAIGN_CREATED', 'campaign', id, { recipients: emails.length });
  return ok({ id, recipients: emails.length });
}
async function getCampaign(c, all) {
  const id = Number(c.params.id);
  const camp = await c.env.DB.prepare(`SELECT * FROM email_campaigns WHERE id=? ${all ? '' : 'AND created_by=?'}`).bind(...(all ? [id] : [id, c.user.id])).first();
  if (!camp) throw new ApiError('NOT_FOUND', 'Campaign not found.', 404);
  const { results } = await c.env.DB.prepare('SELECT id,recipient_email,recipient_name,status,error_message,sent_at FROM email_campaign_recipients WHERE campaign_id=? ORDER BY id LIMIT 2000').bind(camp.id).all();
  return ok({ campaign: camp, recipients: results });
}
/** Edit a scheduled/running campaign: text, schedule (scheduled only) and recipients (add / remove unsent ones). */
async function editCampaign(c, all) {
  const id = Number(c.params.id), b = c.body, isAdmin = c.user.role === 'ADMIN';
  const camp = await c.env.DB.prepare(`SELECT * FROM email_campaigns WHERE id=? ${all ? '' : 'AND created_by=?'}`).bind(...(all ? [id] : [id, c.user.id])).first();
  if (!camp) throw new ApiError('NOT_FOUND', 'Campaign not found.', 404);
  if (!['SCHEDULED', 'RUNNING'].includes(camp.status)) throw new ApiError('NOT_EDITABLE', 'Only scheduled or running campaigns can be edited.', 409);
  const subject = b.subject !== undefined ? clean(b.subject, MAX_SUBJECT + 1) : camp.subject;
  if (!subject) throw new ApiError('INVALID_NAME', 'Subject is required.');
  validateTemplate(subject, MAX_SUBJECT);
  const msg = b.message !== undefined ? clean(b.message, MAX_MSG + 1) : camp.message;
  validateTemplate(msg);
  const name = clean(b.campaign_name, 80) || camp.campaign_name;
  const t = now();
  let at = camp.scheduled_at;
  let rep = camp.repeat_type ? { type: camp.repeat_type, rule: camp.repeat_rule, time: camp.repeat_time } : null;
  if (camp.status === 'SCHEDULED' && (b.repeat !== undefined || b.date !== undefined || b.time !== undefined)) ({ at, rep } = campaignSchedule(b, t));
  const sender = b.sender_name !== undefined ? (isAdmin ? clean(b.sender_name, 60) : resolveSender(c.settings, c.user, b.sender_name || undefined)) : (camp.sender_name || '');

  // recipients: plan first (validate), apply after the campaign row is updated
  let toAdd = [], toRemove = [], skipped = 0, found = null;
  if (b.recipients !== undefined || b.contact_ids !== undefined) {
    found = await collectRecipients(c, b);
    const { results: ex } = await c.env.DB.prepare('SELECT id,recipient_email,status FROM email_campaign_recipients WHERE campaign_id=?').bind(id).all();
    const have = new Map(ex.map((r) => [r.recipient_email, r]));
    toAdd = [...found.keys()].filter((e) => !have.has(e));
    skipped = [...found.keys()].filter((e) => have.has(e) && !['PENDING', 'PROCESSING'].includes(have.get(e).status)).length;
    toRemove = ex.filter((r) => r.status === 'PENDING' && !found.has(r.recipient_email));
    const open = ex.filter((r) => ['PENDING', 'PROCESSING'].includes(r.status)).length - toRemove.length + toAdd.length;
    if (open < 1) throw new ApiError('NO_RECIPIENTS', 'A campaign needs at least one unsent recipient. Use Delete to remove the whole campaign.');
    if (ex.length - toRemove.length + toAdd.length > c.settings.max_bulk_recipients) throw new ApiError('TOO_MANY_RECIPIENTS', `Maximum ${c.settings.max_bulk_recipients} recipients per campaign.`);
    if (!isAdmin && toAdd.length) {
      const pend = await c.env.DB.prepare("SELECT COUNT(*) c FROM email_campaign_recipients r JOIN email_campaigns k ON k.id=r.campaign_id WHERE k.created_by=? AND r.status IN ('PENDING','PROCESSING')").bind(c.user.id).first();
      await checkQuota(c.env, c.user, c.settings, pend.c - toRemove.length + toAdd.length);
    }
  }
  const u = await c.env.DB.prepare("UPDATE email_campaigns SET campaign_name=?,subject=?,message=?,sender_name=?,scheduled_at=?,repeat_type=?,repeat_rule=?,repeat_time=? WHERE id=? AND status IN ('SCHEDULED','RUNNING')")
    .bind(name, subject, msg, sender || c.user.sender_name || null, at, rep ? rep.type : null, rep ? rep.rule : null, rep ? rep.time : null, id).run();
  if (!u.meta.changes) throw new ApiError('NOT_EDITABLE', 'This campaign has just finished and can no longer be edited.', 409);
  for (let i = 0; i < toRemove.length; i += 80) {
    const part = toRemove.slice(i, i + 80).map((r) => r.id);
    await c.env.DB.prepare(`DELETE FROM email_campaign_recipients WHERE campaign_id=? AND status='PENDING' AND id IN (${part.map(() => '?').join(',')})`).bind(id, ...part).run();
  }
  const stmts = toAdd.map((e) => c.env.DB.prepare('INSERT INTO email_campaign_recipients(campaign_id,recipient_email,recipient_name,status,created_at) VALUES(?,?,?,?,?)').bind(id, e, found.get(e) || null, 'PENDING', t));
  for (let i = 0; i < stmts.length; i += 90) await c.env.DB.batch(stmts.slice(i, i + 90));
  await audit(c.env, c.user.id, 'CAMPAIGN_EDITED', 'campaign', id, { added: toAdd.length, removed: toRemove.length });
  return ok({ added: toAdd.length, removed: toRemove.length, skipped });
}
async function cancelCampaign(c, all) {
  const id = Number(c.params.id);
  const r = await c.env.DB.prepare(`UPDATE email_campaigns SET status='CANCELLED', completed_at=? WHERE id=? AND status IN ('SCHEDULED','RUNNING') ${all ? '' : 'AND created_by=?'}`)
    .bind(...(all ? [now(), id] : [now(), id, c.user.id])).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'No cancellable campaign found.', 404);
  await c.env.DB.prepare("UPDATE email_campaign_recipients SET status='CANCELLED' WHERE campaign_id=? AND status='PENDING'").bind(id).run();
  await audit(c.env, c.user.id, 'CAMPAIGN_CANCELLED', 'campaign', id);
  return ok({});
}
async function removeCampaigns(c, all, statuses, id) {
  const st = statuses.map((s) => `'${s}'`).join(',');
  const scope = (all ? '' : ' AND created_by=?') + (id ? ' AND id=?' : '');
  const binds = [...(all ? [] : [c.user.id]), ...(id ? [id] : [])];
  await c.env.DB.prepare(`DELETE FROM email_campaign_recipients WHERE campaign_id IN (SELECT id FROM email_campaigns WHERE status IN (${st})${scope})`).bind(...binds).run();
  const r = await c.env.DB.prepare(`DELETE FROM email_campaigns WHERE status IN (${st})${scope}`).bind(...binds).run();
  return r.meta.changes;
}
const CAMP_ALL = ['SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED'];
for (const [prefix, auth, all] of [['/api/admin/campaigns', 'admin', true], ['/api/campaigns', 'user', false]]) {
  route('DELETE', `${prefix}/:id`, auth, async (c) => {
    if (!(await removeCampaigns(c, all, CAMP_ALL, Number(c.params.id)))) throw new ApiError('NOT_FOUND', 'Campaign not found.', 404);
    return ok({});
  });
  route('POST', `${prefix}/cancel-all`, auth, async (c) => ok({ removed: await removeCampaigns(c, all, ['SCHEDULED', 'RUNNING']) }));
  route('DELETE', prefix, auth, async (c) => ok({ removed: await removeCampaigns(c, all, ['COMPLETED', 'CANCELLED']) }));
}
route('GET', '/api/admin/campaigns', 'admin', (c) => listCampaigns(c, true));
route('POST', '/api/admin/campaigns', 'admin', (c) => createCampaign(c));
route('GET', '/api/campaigns', 'user', (c) => listCampaigns(c, false));
route('POST', '/api/campaigns', 'user', (c) => createCampaign(c));
route('GET', '/api/admin/campaigns/:id', 'admin', (c) => getCampaign(c, true));
route('GET', '/api/campaigns/:id', 'user', (c) => getCampaign(c, false));
route('PUT', '/api/admin/campaigns/:id', 'admin', (c) => editCampaign(c, true));
route('PUT', '/api/campaigns/:id', 'user', (c) => editCampaign(c, false));
route('POST', '/api/admin/campaigns/:id/cancel', 'admin', (c) => cancelCampaign(c, true));
route('POST', '/api/campaigns/:id/cancel', 'user', (c) => cancelCampaign(c, false));
route('GET', '/api/admin/settings', 'admin', async (c) => ok({ settings: c.settings }));
route('PUT', '/api/admin/settings', 'admin', async (c) => {
  const stmts = [], changed = {};
  for (const [k, v] of Object.entries(c.body)) {
    if (!(k in DEFAULTS)) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 1000000) throw new ApiError('INVALID_SETTING', `Invalid value for ${k}.`);
    if (['allow_custom_sender_name', 'registration_enabled'].includes(k) && n > 1) throw new ApiError('INVALID_SETTING', `Invalid value for ${k}.`);
    if (['otp_expiry_minutes', 'max_otp_attempts', 'bulk_batch_size'].includes(k) && n < 1) throw new ApiError('INVALID_SETTING', `${k} must be at least 1.`);
    if (k === 'bulk_batch_size' && n > 40) throw new ApiError('INVALID_SETTING', 'bulk_batch_size must be 40 or less (Worker subrequest limits).');
    if (n !== c.settings[k]) { changed[k] = [c.settings[k], n]; stmts.push(c.env.DB.prepare('INSERT INTO system_settings(setting_key,setting_value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at, updated_by=excluded.updated_by').bind(k, String(n), now(), c.user.id)); }
  }
  if (stmts.length) { await c.env.DB.batch(stmts); await audit(c.env, c.user.id, 'SETTINGS_UPDATED', 'settings', null, changed); }
  return ok({ settings: await getSettings(c.env) });
});

/* ---------- request handler ---------- */
async function handle(req, env, url) {
  try {
    if (!env.DB) return respond({ success: false, error: { code: 'NO_DB', message: 'Database not configured.' } }, 500);
    if (!env.SESSION_SECRET) return respond({ success: false, error: { code: 'NO_SECRET', message: 'SESSION_SECRET is not set.' } }, 500);
    const method = req.method.toUpperCase();
    // Same-origin SPA: do not advertise Access-Control-Allow-Origin: *.
    // Only echo Origin when it matches this host (needed if anything is called cross-origin).
    if (method === 'OPTIONS') {
      const origin = req.headers.get('Origin') || '';
      const sameOrigin = origin && (origin === url.origin || origin === `https://${url.host}` || origin === `http://${url.host}`);
      const h = {
        ...SECURITY_HEADERS,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      };
      if (sameOrigin) h['Access-Control-Allow-Origin'] = origin;
      return new Response(null, { status: 204, headers: h });
    }
    const matched = matchRoute(method, url.pathname);
    if (!matched) return respond({ success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
    let body = {};
    if (method !== 'GET' && method !== 'HEAD') {
      try { body = await req.json(); } catch { body = {}; }
    }
    const settings = await getSettings(env);
    const user = await authenticate(req, env);
    if (matched.auth === 'user' || matched.auth === 'admin') {
      if (!user) return respond({ success: false, error: { code: 'UNAUTHORIZED', message: 'Please log in.' } }, 401);
      if (matched.auth === 'admin' && user.role !== 'ADMIN') return respond({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required.' } }, 403);
    }
    const ctx = { req, env, url, body, params: matched.params, user, settings };
    return await matched.handler(ctx);
  } catch (e) {
    if (e instanceof ApiError) return respond({ success: false, error: { code: e.code, message: e.message } }, e.status);
    console.error('unhandled', e && e.stack ? e.stack : e);
    return respond({ success: false, error: { code: 'INTERNAL', message: 'Something went wrong.' } }, 500);
  }
}

/* ---------- cron processing ---------- */
async function processSchedules(env, settings) {
  const t = now();
  const { results } = await env.DB.prepare(`UPDATE scheduled_messages SET status='PROCESSING', claimed_at=? WHERE id IN (
    SELECT id FROM scheduled_messages WHERE status IN ('PENDING','ACTIVE') AND next_run_at<=? AND next_run_at IS NOT NULL ORDER BY next_run_at LIMIT 15
  ) AND status IN ('PENDING','ACTIVE') RETURNING *`).bind(t, t).all();
  for (const s of results) {
    try {
      const subject = composeMessage(s.subject_template || 'Reminder', { name: s.recipient_name, sender: s.sender_name, email: s.recipient_email });
      const message = composeMessage(s.message_template, { name: s.recipient_name, sender: s.sender_name, email: s.recipient_email, signature: true });
      const r = await sendAndLog(env, { userId: s.user_id, to: s.recipient_email, subject, message, type: s.schedule_type, ref: `schedule:${s.id}`, senderName: s.sender_name || undefined });
      if (s.schedule_type === 'ONE_TIME') {
        await env.DB.prepare('UPDATE scheduled_messages SET status=?, last_run_at=?, last_error=?, updated_at=? WHERE id=?')
          .bind(r.ok ? 'SENT' : 'FAILED', t, r.ok ? null : r.message, t, s.id).run();
      } else {
        const next = computeNextRun(s.schedule_type, s.recurrence_rule, s.send_time || '08:00', t);
        await env.DB.prepare('UPDATE scheduled_messages SET status=?, next_run_at=?, last_run_at=?, last_error=?, updated_at=? WHERE id=?')
          .bind(r.ok ? 'ACTIVE' : 'FAILED', next, t, r.ok ? null : r.message, t, s.id).run();
      }
    } catch (e) {
      await env.DB.prepare("UPDATE scheduled_messages SET status='FAILED', last_error=?, updated_at=? WHERE id=?").bind(String(e.message || e).slice(0, 200), t, s.id).run();
    }
  }
}
/** Recurring campaign: create the next run with the same recipients */
async function spawnNextCampaign(env, camp) {
  const t = now();
  const next = computeNextRun(camp.repeat_type, camp.repeat_rule, camp.repeat_time || '09:00', t);
  if (!next) return;
  const r = await env.DB.prepare('INSERT INTO email_campaigns(created_by,campaign_name,subject,message,sender_name,scheduled_at,status,created_at,repeat_type,repeat_rule,repeat_time) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(camp.created_by, camp.campaign_name, camp.subject, camp.message, camp.sender_name, next, 'SCHEDULED', t, camp.repeat_type, camp.repeat_rule, camp.repeat_time).run();
  await env.DB.prepare("INSERT INTO email_campaign_recipients(campaign_id,recipient_email,recipient_name,status,created_at) SELECT ?,recipient_email,recipient_name,'PENDING',? FROM email_campaign_recipients WHERE campaign_id=?")
    .bind(r.meta.last_row_id, t, camp.id).run();
}
async function processCampaigns(env, settings) {
  const t = now();
  await env.DB.prepare("UPDATE email_campaigns SET status='RUNNING', started_at=? WHERE status='SCHEDULED' AND scheduled_at<=?").bind(t, t).run();
  const camp = await env.DB.prepare("SELECT * FROM email_campaigns WHERE status='RUNNING' ORDER BY id LIMIT 1").first();
  if (!camp) return;
  const { results } = await env.DB.prepare("UPDATE email_campaign_recipients SET status='PROCESSING' WHERE id IN (SELECT id FROM email_campaign_recipients WHERE campaign_id=? AND status='PENDING' ORDER BY id LIMIT ?) AND status='PENDING' RETURNING *").bind(camp.id, Math.min(settings.bulk_batch_size, 40)).all();
  let defSender = camp.sender_name || '';
  if (!defSender) {
    const owner = await env.DB.prepare('SELECT sender_name FROM users WHERE id=?').bind(camp.created_by).first();
    defSender = (owner && owner.sender_name) || '';
  }
  for (const rec of results) {
    const vars = { name: rec.recipient_name, sender: defSender, email: rec.recipient_email };
    const r = await sendAndLog(env, { userId: camp.created_by, to: rec.recipient_email, subject: composeMessage(camp.subject, vars), message: composeMessage(camp.message, vars), type: 'CAMPAIGN', ref: `campaign:${camp.id}`, senderName: camp.sender_name || undefined });
    await env.DB.prepare('UPDATE email_campaign_recipients SET status=?, provider_message_id=?, sent_at=?, error_message=? WHERE id=?').bind(r.ok ? 'SENT' : 'FAILED', r.id ?? null, r.ok ? now() : null, r.ok ? null : r.message, rec.id).run();
  }
  const left = await env.DB.prepare("SELECT COUNT(*) c FROM email_campaign_recipients WHERE campaign_id=? AND status IN ('PENDING','PROCESSING')").bind(camp.id).first();
  if (left.c === 0) {
    const done = await env.DB.prepare("UPDATE email_campaigns SET status='COMPLETED', completed_at=? WHERE id=? AND status='RUNNING'").bind(now(), camp.id).run();
    if (done.meta.changes && camp.repeat_type) await spawnNextCampaign(env, camp);
  }
}
async function runCron(env) {
  try {
    const settings = await getSettings(env);
    await processSchedules(env, settings);
    await processCampaigns(env, settings);
    const t = now();
    if (new Date().getUTCMinutes() === 0) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(t),
        env.DB.prepare('DELETE FROM otp_requests WHERE created_at<?').bind(t - 86400),
        env.DB.prepare('DELETE FROM rate_limits WHERE window_start<?').bind(t - 86400),
      ]);
    }
  } catch (e) { console.error('cron failed', e && e.stack ? e.stack : e); }
}

export { handle, runCron };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (env.CRON_ONLY === '1') return new Response('Not found', { status: 404 });
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    return handle(req, env, url);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(runCron(env)); },
};
