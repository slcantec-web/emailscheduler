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

function respond(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
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
const validMMDD = (s) => /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s) && toEpoch(`2024-${s}`, '00:00') !== null;
function toMMDD(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(?:\d{4}-)?(\d{2}-\d{2})$/);
  return m && validMMDD(m[1]) ? m[1] : false;
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
async function sendAndLog(env, { userId, to, subject, message, type, ref, senderName }) {
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>`;
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
const publicUser = (u) => ({ id: u.id, email: u.email, display_name: u.display_name, sender_name: u.sender_name, role: u.role, status: u.status, created_at: u.created_at, last_login_at: u.last_login_at });

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
  if (!(await rateLimit(env, `otp:${email}`, settings.max_otp_requests, 3600)) || !(await rateLimit(env, `otpip:${ip}`, settings.max_otp_requests * 4, 3600)))
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
  if (!['ONE_TIME', 'BIRTHDAY', 'ANNIVERSARY', 'CUSTOM_RECURRING'].includes(type)) throw new ApiError('INVALID_TYPE', 'Invalid schedule type.');
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
  if (type === 'ONE_TIME') {
    const at = toEpoch(clean(b.date, 10), time);
    if (!at) throw new ApiError('INVALID_DATE', 'Enter a valid date.');
    if (at <= now() + 30) throw new ApiError('PAST_DATE', 'Schedule time must be in the future (Sri Lanka time).');
    Object.assign(f, { scheduledAt: at, nextRun: at, rule: null, status: 'PENDING' });
  } else {
    let mmdd = toMMDD(clean(b.date, 10));
    if (mmdd === null || mmdd === undefined) {
      if (contact) mmdd = type === 'BIRTHDAY' ? contact.birthday : type === 'ANNIVERSARY' ? contact.anniversary : null;
    }
    if (!mmdd) throw new ApiError('INVALID_DATE', 'Choose the date to repeat every year.');
    if (mmdd === false) throw new ApiError('INVALID_DATE', 'Enter a valid MM-DD date.');
    const next = nextYearly(mmdd, time, now());
    if (!next) throw new ApiError('INVALID_DATE', 'Could not compute next run date.');
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
      max_daily_emails: c.settings.max_daily_emails,
      max_monthly_emails: c.settings.max_monthly_emails,
      max_user_scheduled_messages: c.settings.max_user_scheduled_messages,
      max_contacts: c.settings.max_contacts,
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
  if (cnt.c >= c.settings.max_contacts) throw new ApiError('CONTACT_LIMIT', `You can have at most ${c.settings.max_contacts} contacts.`, 403);
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
  const { results } = await c.env.DB.prepare("SELECT id,recipient_email,message_type,subject_preview,message_preview,provider_message_id,status,error_message,created_at FROM email_logs WHERE user_id=? AND message_type!='OTP' ORDER BY id DESC LIMIT 30 OFFSET ?").bind(c.user.id, off).all();
  return ok({ logs: results, next_offset: results.length === 30 ? off + 30 : null });
});

// --- schedules
route('GET', '/api/schedules', 'user', async (c) => ok({ schedules: (await c.env.DB.prepare('SELECT * FROM scheduled_messages WHERE user_id=? ORDER BY (status IN (\'PENDING\',\'ACTIVE\',\'PROCESSING\')) DESC, next_run_at ASC LIMIT 200').bind(c.user.id).all()).results.map(scheduleOut), limit: c.settings.max_user_scheduled_messages }));
route('POST', '/api/schedules', 'user', async (c) => {
  const cnt = await c.env.DB.prepare(`SELECT COUNT(*) c FROM scheduled_messages WHERE user_id=? AND status IN ${ACTIVE}`).bind(c.user.id).first();
  if (cnt.c >= c.settings.max_user_scheduled_messages) throw new ApiError('SCHEDULE_LIMIT', `You can have at most ${c.settings.max_user_scheduled_messages} active schedules.`, 403);
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
  const r = await c.env.DB.prepare("UPDATE scheduled_messages SET status='CANCELLED', updated_at=? WHERE id=? AND user_id=? AND status IN ('PENDING','ACTIVE')").bind(now(), Number(c.params.id), c.user.id).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'No cancellable schedule found.', 404);
  return ok({});
});

// --- admin
route('GET', '/api/admin/users', 'admin', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT u.id,u.email,u.display_name,u.role,u.status,u.created_at,u.last_login_at,
    (SELECT COUNT(*) FROM scheduled_messages s WHERE s.user_id=u.id AND s.status IN ${ACTIVE}) AS active_schedules,
    (SELECT COUNT(*) FROM email_logs l WHERE l.user_id=u.id AND l.status='SENT' AND l.message_type!='OTP' AND l.created_at>=?) AS emails_today
    FROM users u ORDER BY u.id DESC LIMIT 300`).bind(dayStart(now())).all();
  return ok({ users: results, schedule_limit: c.settings.max_user_scheduled_messages });
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
route('GET', '/api/admin/campaigns', 'admin', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT c.*, 
    (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id) total,
    (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='SENT') sent,
    (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='FAILED') failed,
    (SELECT COUNT(*) FROM email_campaign_recipients r WHERE r.campaign_id=c.id AND r.status IN ('PENDING','PROCESSING')) pending
    FROM email_campaigns c ORDER BY c.id DESC LIMIT 50`).all();
  return ok({ campaigns: results, max_recipients: c.settings.max_bulk_recipients });
});
route('POST', '/api/admin/campaigns', 'admin', async (c) => {
  const name = clean(c.body.campaign_name, 80); if (!name) throw new ApiError('INVALID_NAME', 'Campaign name is required.');
  const subject = clean(c.body.subject || name, MAX_SUBJECT);
  const msg = clean(c.body.message, MAX_MSG + 1); validateTemplate(msg);
  if (/\{name\}/.test(msg) || /\{name\}/.test(subject)) throw new ApiError('UNKNOWN_VARIABLE', '{name} is not available in bulk campaigns.');
  const list = Array.isArray(c.body.recipients) ? c.body.recipients : String(c.body.recipients || '').split(/[\s,;]+/);
  const emails = [...new Set(list.filter(Boolean).map(normalizeEmail))];
  if (emails.some((e) => !e)) throw new ApiError('INVALID_EMAIL', 'One or more recipient emails are invalid.');
  if (!emails.length) throw new ApiError('NO_RECIPIENTS', 'Add at least one recipient.');
  if (emails.length > c.settings.max_bulk_recipients) throw new ApiError('TOO_MANY_RECIPIENTS', `Maximum ${c.settings.max_bulk_recipients} recipients per campaign.`);
  let at = now();
  if (c.body.date && c.body.time) { at = toEpoch(clean(c.body.date, 10), clean(c.body.time, 5)); if (!at) throw new ApiError('INVALID_DATE', 'Invalid schedule date/time.'); if (at < now() - 60) throw new ApiError('PAST_DATE', 'Schedule time must be in the future.'); }
  const sender = clean(c.body.sender_name, 60);
  const t = now();
  const composed = composeMessage(msg, { sender: sender || c.user.sender_name, signature: false });
  const r = await c.env.DB.prepare('INSERT INTO email_campaigns(created_by,campaign_name,subject,message,sender_name,scheduled_at,status,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(c.user.id, name, subject, composed, sender || null, at, 'SCHEDULED', t).run();
  const id = r.meta.last_row_id;
  const stmts = emails.map((e) => c.env.DB.prepare('INSERT INTO email_campaign_recipients(campaign_id,recipient_email,status,created_at) VALUES(?,?,?,?)').bind(id, e, 'PENDING', t));
  for (let i = 0; i < stmts.length; i += 90) await c.env.DB.batch(stmts.slice(i, i + 90));
  await audit(c.env, c.user.id, 'CAMPAIGN_CREATED', 'campaign', id, { recipients: emails.length });
  return ok({ id, recipients: emails.length });
});
route('GET', '/api/admin/campaigns/:id', 'admin', async (c) => {
  const camp = await c.env.DB.prepare('SELECT * FROM email_campaigns WHERE id=?').bind(Number(c.params.id)).first();
  if (!camp) throw new ApiError('NOT_FOUND', 'Campaign not found.', 404);
  const { results } = await c.env.DB.prepare('SELECT recipient_email,recipient_name,status,error_message,sent_at FROM email_campaign_recipients WHERE campaign_id=? ORDER BY id LIMIT 500').bind(camp.id).all();
  return ok({ campaign: camp, recipients: results });
});
route('POST', '/api/admin/campaigns/:id/cancel', 'admin', async (c) => {
  const id = Number(c.params.id);
  const r = await c.env.DB.prepare("UPDATE email_campaigns SET status='CANCELLED', completed_at=? WHERE id=? AND status IN ('SCHEDULED','RUNNING')").bind(now(), id).run();
  if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'No cancellable campaign found.', 404);
  await c.env.DB.prepare("UPDATE email_campaign_recipients SET status='CANCELLED' WHERE campaign_id=? AND status='PENDING'").bind(id).run();
  await audit(c.env, c.user.id, 'CAMPAIGN_CANCELLED', 'campaign', id);
  return ok({});
});
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
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With', 'Access-Control-Max-Age': '86400' } });
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
        const next = nextYearly(s.recurrence_rule, s.send_time || '08:00', t);
        await env.DB.prepare('UPDATE scheduled_messages SET status=?, next_run_at=?, last_run_at=?, last_error=?, updated_at=? WHERE id=?')
          .bind(r.ok ? 'ACTIVE' : 'FAILED', next, t, r.ok ? null : r.message, t, s.id).run();
      }
    } catch (e) {
      await env.DB.prepare("UPDATE scheduled_messages SET status='FAILED', last_error=?, updated_at=? WHERE id=?").bind(String(e.message || e).slice(0, 200), t, s.id).run();
    }
  }
}
async function processCampaigns(env, settings) {
  const t = now();
  await env.DB.prepare("UPDATE email_campaigns SET status='RUNNING', started_at=? WHERE status='SCHEDULED' AND scheduled_at<=?").bind(t, t).run();
  const camp = await env.DB.prepare("SELECT * FROM email_campaigns WHERE status='RUNNING' ORDER BY id LIMIT 1").first();
  if (!camp) return;
  const { results } = await env.DB.prepare("UPDATE email_campaign_recipients SET status='PROCESSING' WHERE id IN (SELECT id FROM email_campaign_recipients WHERE campaign_id=? AND status='PENDING' ORDER BY id LIMIT ?) AND status='PENDING' RETURNING *").bind(camp.id, Math.min(settings.bulk_batch_size, 40)).all();
  for (const rec of results) {
    const r = await sendAndLog(env, { userId: camp.created_by, to: rec.recipient_email, subject: camp.subject, message: camp.message, type: 'CAMPAIGN', ref: `campaign:${camp.id}`, senderName: camp.sender_name || undefined });
    await env.DB.prepare('UPDATE email_campaign_recipients SET status=?, provider_message_id=?, sent_at=?, error_message=? WHERE id=?').bind(r.ok ? 'SENT' : 'FAILED', r.id ?? null, r.ok ? now() : null, r.ok ? null : r.message, rec.id).run();
  }
  const left = await env.DB.prepare("SELECT COUNT(*) c FROM email_campaign_recipients WHERE campaign_id=? AND status IN ('PENDING','PROCESSING')").bind(camp.id).first();
  if (left.c === 0) await env.DB.prepare("UPDATE email_campaigns SET status='COMPLETED', completed_at=? WHERE id=? AND status='RUNNING'").bind(now(), camp.id).run();
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
