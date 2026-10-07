'use strict';
/* Email Scheduler frontend. All security is enforced by the Worker; this is UI only.
   Untrusted text is always passed through esc() before insertion into HTML. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDT = (e) => (e ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(e * 1000)) : '-');
const fmtMD = (s) => (s ? `${+s.slice(3)} ${MONTHS[+s.slice(0, 2) - 1]}` : '');
const slDate = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(Date.now() + offsetDays * 864e5));
const ICON = {
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6',
  home: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  mega: 'M3 11v2a1 1 0 0 0 1 1h3l8 5V5L7 10H4a1 1 0 0 0-1 1zM19 8a5 5 0 0 1 0 8',
  scroll: 'M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4M19 17V5a2 2 0 0 0-2-2H4',
  back: 'M15 18l-6-6 6-6',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
};
const ic = (n) => `<svg class="icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[n] || ''}"/></svg>`;
const LOGO = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';

let me = null, mySettings = {}, busyNav = 0, contactsCache = null;

/* ---------- navigation state (back button + phone back gesture) ---------- */
const TOP = ['home', 'send', 'schedules', 'contacts', 'more'];
const PARENT = { history: 'more', templates: 'more', profile: 'more', admin: 'more', campaigns: 'more', settings: 'more', calendar: 'more' };
const TITLES = { home: 'Email Scheduler', send: 'Send email', schedules: 'Schedules', contacts: 'Contacts', more: 'More', history: 'Email history', templates: 'Templates', profile: 'Profile', admin: 'Users', campaigns: 'Campaigns', settings: 'Settings', calendar: 'Calendar' };
let curPage = 'home', navDepth = 0, ignorePop = false, sendPrefill = null;
function updateTopbar() {
  const tb = $('#topbar'); if (!tb) return;
  tb.classList.toggle('has-back', curPage !== 'home');
  $('#tbtitle').textContent = TITLES[curPage] || 'Email Scheduler';
  $('#tbsub').textContent = curPage === 'home' ? ((me && me.display_name) || '') : 'Email Scheduler';
}
function goBack() {
  if (navDepth > 0) history.back();
  else go(PARENT[curPage] || 'home', { replace: true });
}

/* ---------- api / ui helpers ---------- */
async function api(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Network error. Check your connection.'); }
  let j = null; try { j = await res.json(); } catch { /* ignore */ }
  if (res.status === 401 && me && !path.includes('/auth/')) { me = null; renderAuth(); throw new Error('Session expired. Please log in again.'); }
  if (!j || !j.success) throw new Error((j && j.error && j.error.message) || 'Request failed.');
  return j.data;
}
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 3500);
}
function modal(html, ready, cls = '') {
  const o = document.createElement('div'); o.className = 'overlay';
  o.innerHTML = `<div class="sheet ${cls}" role="dialog"><div class="grab"></div><button type="button" class="sheet-x" aria-label="Close">&times;</button>${html}</div>`;
  let pushed = false;
  try { history.pushState({ page: curPage, depth: navDepth, modal: 1 }, ''); pushed = true; } catch { /* ignore */ }
  const close = (fromPop) => {
    if (!o.isConnected) return;
    o.remove();
    if (pushed) { pushed = false; if (fromPop !== true) { ignorePop = true; history.back(); } }
  };
  o._close = close;
  o.addEventListener('click', (e) => { if (e.target === o) close(); });
  document.body.append(o);
  $('.sheet-x', o).onclick = () => close();
  if (ready) ready($('.sheet', o), close);
  return close;
}
function confirmBox(title, text, okLabel = 'Confirm') {
  return new Promise((res) => {
    modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="row" style="margin-top:14px"><button class="btn danger right" id="c-ok">${esc(okLabel)}</button><button class="btn ghost" id="c-no">Back</button></div>`, (s, close) => {
      $('#c-ok', s).onclick = () => { close(); res(true); };
      $('#c-no', s).onclick = () => { close(); res(false); };
    });
  });
}
async function withBtn(btn, fn) {
  btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; }
}
const fd = (f) => Object.fromEntries(new FormData(f));
const statusBadge = (s) => `<span class="badge ${{ SENT: 'ok', ACTIVE: 'ok', COMPLETED: 'ok', FAILED: 'bad', CANCELLED: 'bad', PENDING: 'warn', PROCESSING: 'warn', SCHEDULED: 'warn', RUNNING: 'warn' }[s] || ''}">${esc(s)}</span>`;
const TYPE_LABEL = {
  ONE_TIME: 'One-time',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
  BIRTHDAY: 'Birthday',
  ANNIVERSARY: 'Anniversary',
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function daysLabel(r) {
  const s = String(r || 'daily');
  if (s === 'daily' || s === '0,1,2,3,4,5,6') return 'Every day';
  if (s === '1,2,3,4,5') return 'Weekdays (Mon–Fri)';
  if (s === '0,6') return 'Weekends (Sat, Sun)';
  const a = s.split(',');
  if (a.length === 1) return `Every ${WEEKDAYS[Number(a[0])] || a[0]}`;
  return a.map((n) => DAY_SHORT[Number(n)] || n).join(', ');
}
function scheduleRuleLabel(s) {
  const t = s.schedule_type, r = s.recurrence_rule, tm = s.send_time || '';
  if (t === 'ONE_TIME') return 'Once';
  if (t === 'DAILY' || t === 'WEEKLY') return `${daysLabel(r)} at ${tm}`;
  if (t === 'MONTHLY') return r === 'L' ? `Last day of each month at ${tm}` : r === '1' ? `First day of each month at ${tm}` : `Day ${r} each month at ${tm}`;
  if (t === 'YEARLY' || t === 'BIRTHDAY' || t === 'ANNIVERSARY') return `${r || ''} each year at ${tm}`.trim();
  return tm ? `at ${tm}` : '';
}
const loading = () => '<div class="splash" style="min-height:40dvh"><div class="spinner"></div></div>';

/* ---------- repeat options (shared by Send email, Campaigns) ---------- */
const monthDayOpts = () => `<option value="1">First day of month (1st)</option><option value="L">Last day of month (month end)</option>${Array.from({ length: 30 }, (_, i) => `<option value="${i + 2}">Day ${i + 2}</option>`).join('')}`;
const daysPickerHtml = (on) => `<div class="daybtns">${[1, 2, 3, 4, 5, 6, 0].map((i) => `<label class="daychip"><input type="checkbox" name="days" value="${i}"${on.includes(i) ? ' checked' : ''}><span>${DAY_SHORT[i]}</span></label>`).join('')}</div>
  <div class="row small"><button type="button" class="linkbtn" data-days="1,2,3,4,5,6,0">Every day</button><button type="button" class="linkbtn" data-days="1,2,3,4,5">Weekdays only</button><button type="button" class="linkbtn" data-days="6,0">Weekends only</button></div>`;
function bindDays(root) {
  $$('[data-days]', root).forEach((b) => b.onclick = () => {
    const s = b.dataset.days.split(',');
    $$('input[name="days"]', root).forEach((x) => { x.checked = s.includes(x.value); });
  });
}
const repeatSelectHtml = () => `<label>Repeat</label>
  <select name="repeat" id="rep">
    <option value="">Don't repeat</option>
    <option value="DAILY">Every day</option>
    <option value="WEEKLY">Every week</option>
    <option value="MONTHLY">Every month</option>
    <option value="YEARLY">Every year</option>
  </select>
  <div id="rep-fields"></div>`;
/* onceHtml = what to show when "Don't repeat" is chosen. onChange(type) is optional. */
function bindRepeat(root, onceHtml = '', onChange) {
  const sel = $('#rep', root), box = $('#rep-fields', root);
  const timeHtml = '<label>Time (Colombo)</label><input name="time" type="time" value="09:00" required>';
  const paint = () => {
    const t = sel.value;
    if (!t) box.innerHTML = onceHtml;
    else if (t === 'DAILY') box.innerHTML = `<label>Send on</label>${daysPickerHtml([0, 1, 2, 3, 4, 5, 6])}${timeHtml}<p class="hint">Untick the days you want to skip, e.g. weekends.</p>`;
    else if (t === 'WEEKLY') box.innerHTML = `<label>Days of week</label>${daysPickerHtml([1])}${timeHtml}<p class="hint">Pick one or more days.</p>`;
    else if (t === 'MONTHLY') box.innerHTML = `<label>Day of month</label><select name="day_of_month">${monthDayOpts()}</select>${timeHtml}<p class="hint">Month end always means the last day (28, 29, 30 or 31).</p>`;
    else box.innerHTML = `<label>Date each year</label><input name="date" type="date" value="${slDate(0)}" required>${timeHtml}<p class="hint">Only month and day are used.</p>`;
    bindDays(box);
    if (onChange) onChange(t);
  };
  sel.onchange = paint;
  paint();
  return { paint };
}
function repeatPayload(d, form) {
  if (!d.repeat) return d;
  if (form && ['DAILY', 'WEEKLY'].includes(d.repeat)) d.days = $$('input[name="days"]:checked', form).map((x) => Number(x.value));
  if (d.day_of_month != null && d.day_of_month !== 'L') d.day_of_month = Number(d.day_of_month);
  if (d.repeat === 'YEARLY' && d.date && d.date.length === 10) d.date = d.date.slice(5);
  return d;
}

/* ---------- auth screens ---------- */
function renderAuth() {
  contactsCache = null;
  $('#app').innerHTML = `
  <div class="authwrap">
    <div class="authtop">
      <div class="logo">${LOGO}</div>
      <h1>Email Scheduler</h1>
      <p class="tagline">Reminders, greetings &amp; Sri Lanka calendar — in one app</p>
      <div class="auth-features">
        <div class="af"><span class="af-ic">✉️</span><div><strong>Send now</strong><small>Email anyone in seconds</small></div></div>
        <div class="af"><span class="af-ic">⏰</span><div><strong>Schedule</strong><small>One-time, daily, weekly, monthly, yearly</small></div></div>
        <div class="af"><span class="af-ic">📅</span><div><strong>Calendar</strong><small>Sri Lankan holidays — tap a day to remind</small></div></div>
        <div class="af"><span class="af-ic">🎂</span><div><strong>Greetings</strong><small>Birthdays &amp; anniversaries auto-sent</small></div></div>
        <div class="af"><span class="af-ic">👥</span><div><strong>Contacts &amp; campaigns</strong><small>Import lists, email many at once</small></div></div>
        <div class="af"><span class="af-ic">📝</span><div><strong>Templates</strong><small>Reusable messages with {name}</small></div></div>
        <div class="af"><span class="af-ic">📱</span><div><strong>Install app</strong><small>Phone &amp; PC as a PWA</small></div></div>
        <div class="af"><span class="af-ic">🇱🇰</span><div><strong>Colombo time</strong><small>All schedules use UTC+5:30</small></div></div>
      </div>
      <p class="auth-howto">Sign in to manage contacts, templates, campaigns, and the <strong>Sri Lanka holiday calendar</strong> (public, bank, mercantile &amp; Poya). Schedule email reminders on any day. After login, use <em>Add to Home Screen</em> (mobile) or the install icon in your browser (PC) for a full app experience.</p>
    </div>
    <div class="authcard"><div id="authbody"></div></div>
  </div>`;
  authLogin();
}
const pwField = (name, auto, label = 'Password', min = false) => `<label>${label}</label><div class="pw"><input name="${name}" type="password" autocomplete="${auto}" ${min ? 'minlength="8"' : ''} required><button type="button" class="pw-toggle" data-pw aria-label="Show or hide password">Show</button></div>`;
const emailField = (v = '') => `<label>Email address</label><input name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(v)}" required>`;

let authView = 'login';
let authBusy = false;

function authTabsHtml(active) {
  if (active === 'forgot' || active === 'otp') {
    return `<div class="tabs tabs-single"><button type="button" class="on">${active === 'forgot' ? 'Reset password' : 'Verify code'}</button></div>`;
  }
  return `<div class="tabs">
    <button type="button" class="${active === 'login' ? 'on' : ''}" data-auth-tab="login">Log in</button>
    <button type="button" class="${active === 'signup' ? 'on' : ''}" data-auth-tab="signup">Sign up</button>
  </div>`;
}

function loginPanelHtml() {
  return `
  <p class="auth-lead">Welcome back. Enter your email and password to continue.</p>
  <form id="f">
    ${emailField()}
    ${pwField('password', 'current-password')}
    <button class="btn block">Log in</button>
  </form>
  <div class="row" style="justify-content:center;margin-top:12px"><button type="button" class="linkbtn" id="forgot">Forgot password?</button></div>
  <div class="auth-foot muted small">New here? Tap <strong>Sign up</strong> — we’ll send a one-time code to your email.</div>`;
}

function signupPanelHtml() {
  return `
  <p class="auth-lead">Create a free account. We’ll send a 6-digit code to verify your email.</p>
  <form id="f">
    ${emailField()}
    <p class="hint">Use an email you can access — the code arrives in a few seconds.</p>
    <button class="btn block">Send verification code</button>
  </form>
  <div class="auth-spacer"></div>
  <div class="auth-foot muted small">Already have an account? Tap <strong>Log in</strong>.</div>`;
}

function forgotPanelHtml() {
  return `
  <p class="auth-lead">Enter your email and we’ll send a verification code to reset your password.</p>
  <form id="f">
    ${emailField()}
    <button class="btn block">Send reset code</button>
  </form>
  <div class="auth-spacer"></div>
  <div class="row" style="justify-content:center;margin-top:12px"><button type="button" class="linkbtn" id="back">← Back to log in</button></div>`;
}

function otpPanelHtml(email, mode) {
  return `
  <p class="auth-lead">Code sent to <strong>${esc(email)}</strong>. Enter it below.</p>
  <form id="f">
    <label>Verification code</label>
    <input class="otp" name="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" required>
    ${mode === 'register' ? `<label>Your name</label><input name="display_name" autocomplete="name" maxlength="60" required>
      ${pwField('password', 'new-password', 'Password', true)}
      <p class="hint">At least 8 characters.</p>` : ''}
    ${mode === 'reset' ? `${pwField('password', 'new-password', 'New password', true)}
      <p class="hint">At least 8 characters.</p>` : ''}
    <button class="btn block">${mode === 'reset' ? 'Reset password' : 'Create account'}</button>
  </form>
  <div class="row" style="justify-content:center;margin-top:10px"><button type="button" class="linkbtn" id="back">← Back</button></div>`;
}

function bindAuthView(view, extra) {
  authView = view;
  $$('[data-auth-tab]').forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.authTab;
      if (tab === authView) return;
      authGo(tab);
    };
  });
  if (view === 'login') {
    const forgot = $('#forgot');
    if (forgot) forgot.onclick = () => authGo('forgot');
    const form = $('#f');
    if (form) form.onsubmit = (e) => {
      e.preventDefault();
      withBtn($('.btn', form), async () => {
        const d = await api('/api/auth/login', 'POST', fd(e.target));
        me = d.user;
        boot();
      });
    };
  } else if (view === 'signup') {
    const form = $('#f');
    if (form) form.onsubmit = (e) => {
      e.preventDefault();
      const d = fd(e.target);
      withBtn($('.btn', form), async () => {
        await api('/api/auth/register/request', 'POST', d);
        authGo('otp', { email: d.email, mode: 'register' });
      });
    };
  } else if (view === 'forgot') {
    const back = $('#back');
    if (back) back.onclick = () => authGo('login');
    const form = $('#f');
    if (form) form.onsubmit = (e) => {
      e.preventDefault();
      const d = fd(e.target);
      withBtn($('.btn', form), async () => {
        await api('/api/auth/password/forgot', 'POST', d);
        toast('If that email exists, a code was sent.', 'good');
        authGo('otp', { email: d.email, mode: 'reset' });
      });
    };
  } else if (view === 'otp' && extra) {
    const back = $('#back');
    if (back) back.onclick = () => authGo(extra.mode === 'reset' ? 'forgot' : 'signup');
    const form = $('#f');
    if (form) form.onsubmit = (e) => {
      e.preventDefault();
      const d = { email: extra.email, ...fd(e.target) };
      withBtn($('.btn', form), async () => {
        if (extra.mode === 'register') {
          const r = await api('/api/auth/register/verify', 'POST', d);
          me = r.user;
          boot();
        } else {
          await api('/api/auth/password/reset', 'POST', d);
          toast('Password updated. Please log in.', 'good');
          authGo('login');
        }
      });
    };
  }
}

function panelHtmlFor(view, extra) {
  if (view === 'login') return loginPanelHtml();
  if (view === 'signup') return signupPanelHtml();
  if (view === 'forgot') return forgotPanelHtml();
  if (view === 'otp') return otpPanelHtml(extra.email, extra.mode);
  return loginPanelHtml();
}

/* PC split login: details on one half, form on the other. Sign-up flow swaps the halves;
   log in / forgot / reset keep the form on the right. */
const formOnLeft = (view, extra) => view === 'signup' || (view === 'otp' && extra && extra.mode === 'register');
function swapSides(wrap, wantLeft, animate) {
  const els = [$('.authtop', wrap), $('.authcard', wrap)];
  const before = els.map((el) => el.getBoundingClientRect().left);
  wrap.classList.toggle('swap', wantLeft);
  if (!animate || !els[0].animate || (window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches)) return;
  els.forEach((el, i) => {
    const dx = before[i] - el.getBoundingClientRect().left;
    if (!dx) return;
    el.style.willChange = 'transform';
    const a = el.animate([{ transform: `translate3d(${dx}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 650, easing: 'cubic-bezier(.65,0,.35,1)' });
    a.onfinish = a.oncancel = () => { el.style.willChange = ''; };
  });
}
function authGo(view, extra, animate = true) {
  const b = $('#authbody');
  if (!b || authBusy) return;
  const wideScreen = !!(window.matchMedia && window.matchMedia('(min-width:900px)').matches);
  const wrap = $('.authwrap');
  if (wrap) {
    const wantLeft = formOnLeft(view, extra);
    if (wrap.classList.contains('swap') !== wantLeft) {
      swapSides(wrap, wantLeft, wideScreen && animate);
    }
  }
  const dir = (view === 'login' || (authView === 'signup' && view === 'login')) ? 'left' : 'right';
  const stage = $('#auth-stage', b) || b;
  const panel = $('#auth-panel', b);

  const mount = () => {
    b.innerHTML = `${authTabsHtml(view)}
      <div id="auth-stage" class="auth-stage">
        <div id="auth-panel" class="auth-panel auth-in auth-in-${dir}${wideScreen ? ' auth-wide' : ''}">${panelHtmlFor(view, extra)}</div>
      </div>`;
    bindAuthView(view, extra);
    authBusy = false;
  };

  if (!animate || !panel) {
    mount();
    return;
  }
  authBusy = true;
  panel.classList.remove('auth-in', 'auth-in-left', 'auth-in-right');
  if (wideScreen) panel.classList.add('auth-wide');
  panel.classList.add('auth-out', dir === 'left' ? 'auth-out-left' : 'auth-out-right');
  /* Match CSS authOut duration (160ms desktop / ~120ms touch) */
  const outMs = wideScreen ? 150 : ((window.matchMedia && window.matchMedia('(hover:none) and (pointer:coarse)').matches) ? 130 : 170);
  setTimeout(mount, outMs);
}

function authLogin() {
  authGo('login', null, false);
}
function authRegister1() {
  authGo('signup');
}
function authForgot1() {
  authGo('forgot');
}
function authOtp(email, mode) {
  authGo('otp', { email, mode });
}

/* ---------- shell ---------- */
function shell(title, sub) {
  const isAdmin = me && me.role === 'ADMIN';
  $('#app').innerHTML = `
  <header class="topbar" id="topbar"><button class="backbtn" id="back" type="button" aria-label="Go back">${ic('back')}</button><div class="logo">${LOGO}</div><div class="tb-text"><h1 id="tbtitle">${esc(title)}</h1><span class="sub" id="tbsub">${esc(sub || '')}</span></div>
  <div class="who"><button class="avatar" id="avatar">${esc((me.display_name || '?')[0].toUpperCase())}</button></div></header>
  <nav class="sidebar" id="side"></nav>
  <div class="shell"><main class="main" id="main">${loading()}</main></div>
  <nav class="bottomnav" id="bnav"></nav>`;
  const nav = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'send', label: 'Send', icon: 'send' },
    { id: 'schedules', label: 'Schedules', icon: 'clock' },
    { id: 'contacts', label: 'Contacts', icon: 'users' },
    { id: 'more', label: 'More', icon: 'more' },
  ];
  const groups = [
    { t: 'Main', items: nav.slice(0, 4) },
    { t: 'Tools', items: [{ id: 'calendar', label: 'Calendar', icon: 'calendar' }, { id: 'history', label: 'History', icon: 'list' }, { id: 'templates', label: 'Templates', icon: 'file' }, { id: 'campaigns', label: 'Campaigns', icon: 'mega' }] },
    { t: 'Account', items: [{ id: 'profile', label: 'Profile', icon: 'user' }, { id: 'logout', label: 'Log out', icon: 'logout' }] },
  ];
  if (isAdmin) groups.splice(2, 0, { t: 'Admin', items: [{ id: 'admin', label: 'Users', icon: 'shield' }, { id: 'settings', label: 'Settings', icon: 'settings' }] });
  $('#bnav').innerHTML = nav.map((n) => `<button data-nav="${n.id}">${ic(n.icon)}<span>${n.label}</span></button>`).join('');
  $('#side').innerHTML = groups.map((g) => `<div class="sec">${g.t}</div>` + g.items.map((n) => `<a href="#" class="${n.id === 'logout' ? 'logout' : ''}" data-nav="${n.id}">${ic(n.icon)}${n.label}</a>`).join('')).join('');
  $$('[data-nav]').forEach((el) => el.onclick = (e) => { e.preventDefault(); go(el.dataset.nav); });
  $('#avatar').onclick = () => go('profile');
  $('#back').onclick = goBack;
}
function setNav(id) {
  const moreIds = ['history', 'templates', 'profile', 'admin', 'campaigns', 'settings', 'calendar'];
  $$('#bnav button, #side a').forEach((el) => el.classList.toggle('on', el.dataset.nav === id || (el.dataset.nav === 'more' && moreIds.includes(id))));
}
async function go(id, opts = {}) {
  if (busyNav) return;
  busyNav = 1;
  try {
    if (id === 'logout') {
      if (await confirmBox('Log out', 'End this session?', 'Log out')) {
        try { await api('/api/auth/logout', 'POST', {}); } catch { /* ignore */ }
        me = null; renderAuth();
      }
      return;
    }
    if (id === 'home' && curPage !== 'home' && navDepth > 0 && !opts.fromPop) { history.go(-navDepth); return; }
    if (!opts.fromPop && id !== curPage) {
      const replace = opts.replace || (!opts.push && TOP.includes(id) && TOP.includes(curPage) && curPage !== 'home');
      if (replace) { try { history.replaceState({ page: id, depth: navDepth }, ''); } catch { /* ignore */ } }
      else { navDepth++; try { history.pushState({ page: id, depth: navDepth }, ''); } catch { /* ignore */ } }
    }
    curPage = id;
    updateTopbar();
    setNav(id);
    const main = $('#main');
    main.innerHTML = loading();
    if (id === 'home') await pageHome();
    else if (id === 'send') await pageSend();
    else if (id === 'schedules') await pageSchedules();
    else if (id === 'contacts') await pageContacts();
    else if (id === 'history') await pageHistory();
    else if (id === 'templates') await pageTemplates();
    else if (id === 'profile') await pageProfile();
    else if (id === 'more') await pageMore();
    else if (id === 'admin') await pageAdmin();
    else if (id === 'campaigns') await pageCampaigns();
    else if (id === 'settings') await pageSettings();
    else if (id === 'calendar') await pageCalendar();
    else main.innerHTML = '<p class="muted">Coming soon</p>';
  } catch (e) { toast(e.message, 'err'); $('#main').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  finally { busyNav = 0; }
}

/* ---------- pages ---------- */
async function pageHome() {
  const d = await api('/api/auth/me');
  me = d.user; mySettings = d.limits || {};
  const u = d.usage || {};
  const lim = d.limits || {};
  const isAdmin = me.role === 'ADMIN';
  $('#main').innerHTML = `
  ${isAdmin ? '<p class="muted small" style="margin-bottom:10px">Admin account — no schedule / email / contact limits apply.</p>' : ''}
  <div class="grid2">
    <div class="card stat"><div class="label">Today's emails</div><div class="val">${u.emails_today || 0}${isAdmin ? '' : ` <span class="of">/ ${lim.max_daily_emails ?? '∞'}</span>`}</div></div>
    <div class="card stat"><div class="label">Active schedules</div><div class="val">${u.active_schedules || 0}${isAdmin ? '' : ` <span class="of">/ ${lim.max_user_scheduled_messages ?? '∞'}</span>`}</div></div>
    <div class="card stat"><div class="label">This month</div><div class="val">${u.emails_month || 0}${isAdmin ? '' : ` <span class="of">/ ${lim.max_monthly_emails ?? '∞'}</span>`}</div></div>
    <div class="card stat"><div class="label">Contacts</div><div class="val">${u.contacts || 0}${isAdmin || lim.max_contacts == null ? '' : ` <span class="of">/ ${lim.max_contacts}</span>`}</div></div>
  </div>
  <div class="card" style="margin-top:14px">
    <h3>Quick actions</h3>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:10px">
      <button class="btn" data-go="send">${ic('send')} Send email</button>
      <button class="btn ghost" data-go="schedules">${ic('clock')} Schedules</button>
      <button class="btn ghost" data-go="calendar">${ic('calendar')} Calendar</button>
      <button class="btn ghost" data-go="contacts">${ic('users')} Contacts</button>
    </div>
  </div>`;
  $$('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
}

async function pageSend() {
  $('#main').innerHTML = `
  <div class="card"><h3>Send email</h3>
  <form id="f">
    <label>To</label>
    ${recipField()}
    <p class="hint">Type a name or email to search your contacts, or tap the contacts button.</p>
    <label>Recipient name (optional)</label><input name="recipient_name" maxlength="80" placeholder="For {name} variable">
    <label>Subject</label><input name="subject" maxlength="200" placeholder="Subject line" required>
    <label>Message</label><textarea name="message" rows="6" maxlength="5000" placeholder="You can use {name}, {sender}, {year}" required></textarea>
    <label>From name (optional)</label><input name="sender_name" maxlength="60" placeholder="${esc(me.sender_name || me.display_name || '')}">
    <label class="check"><input type="checkbox" name="append_signature" value="1" checked> Append signature</label>
    ${repeatSelectHtml()}
    <button class="btn block" id="sendbtn" style="margin-top:12px">Send now</button>
  </form></div>`;
  const sf = $('#f');
  bindRecipient(sf, '[name="recipient_name"]');
  if (sendPrefill) { sf.recipient.value = sendPrefill.email; sf.recipient_name.value = sendPrefill.name || ''; sendPrefill = null; }
  const rep = bindRepeat(sf, '', (t) => { $('#sendbtn', sf).textContent = t ? 'Schedule repeat' : 'Send now'; });
  sf.onsubmit = (e) => {
    e.preventDefault();
    const d = fd(e.target);
    withBtn($('#sendbtn', e.target), async () => {
      if (d.repeat) {
        repeatPayload(d, e.target);
        await api('/api/schedules', 'POST', {
          schedule_type: d.repeat, recipient: d.recipient, recipient_name: d.recipient_name,
          subject: d.subject, message: d.message, sender_name: d.sender_name,
          time: d.time, days: d.days, day_of_month: d.day_of_month, date: d.date,
        });
        toast('Repeat schedule created! See it under Schedules.', 'good');
      } else {
        d.append_signature = !!e.target.append_signature.checked;
        await api('/api/email/send', 'POST', d);
        toast('Email sent!', 'good');
      }
      e.target.reset();
      rep.paint();
    });
  };
}

async function pageSchedules() {
  const data = await api('/api/schedules');
  const list = data.schedules || [];
  const nAct = list.filter((s) => ['PENDING', 'ACTIVE'].includes(s.status)).length;
  const nDone = list.filter((s) => ['SENT', 'FAILED', 'CANCELLED'].includes(s.status)).length;
  $('#main').innerHTML = `
  <div class="page-head"><h2>Schedules</h2><button class="btn right" id="add">+ New</button></div>
  <div class="row small" style="margin-bottom:10px"><span class="muted">${nAct}${data.limit == null ? ' active (unlimited)' : ` / ${data.limit} active`}</span>
    ${nAct ? '<button class="btn ghost danger smallbtn right" id="cancelall">Cancel all</button>' : ''}
    ${nDone ? `<button class="btn ghost smallbtn${nAct ? '' : ' right'}" id="clearfin">Clear finished (${nDone})</button>` : ''}</div>
  <div id="slist">${list.length ? list.map((s) => `
    <div class="card item">
      <div class="row"><strong>${esc(TYPE_LABEL[s.schedule_type] || s.schedule_type)}</strong> ${statusBadge(s.status)}</div>
      <div class="muted small">${esc(s.recipient_name || '')} · ${esc(s.recipient_email)}</div>
      <div class="small" style="margin-top:4px"><strong>${esc(s.subject_template || 'Reminder')}</strong></div>
      <div class="muted small">${esc((s.message_template || '').slice(0, 80))}${(s.message_template || '').length > 80 ? '…' : ''}</div>
      <div class="muted small" style="margin-top:6px">${scheduleRuleLabel(s)} · Next: ${fmtDT(s.next_run_at)}</div>
      ${s.status !== 'PROCESSING' ? `<div class="actions"><button class="btn ghost danger smallbtn" data-del="${s.id}">Delete</button></div>` : ''}
    </div>`).join('') : '<div class="card muted">No schedules yet.</div>'}</div>`;
  $('#add').onclick = () => scheduleForm();
  const run = async (fn, msg) => { try { const r = await fn(); toast(msg(r), 'good'); pageSchedules(); } catch (e) { toast(e.message, 'err'); } };
  const ca = $('#cancelall');
  if (ca) ca.onclick = async () => { if (await confirmBox('Cancel all schedules', `Remove all ${nAct} active schedules? Nothing more will be sent.`, 'Cancel all')) run(() => api('/api/schedules/cancel-all', 'POST', {}), (r) => `Removed ${r.removed}`); };
  const cf = $('#clearfin');
  if (cf) cf.onclick = async () => { if (await confirmBox('Clear finished', 'Remove all sent, failed and cancelled schedules?', 'Clear')) run(() => api('/api/schedules', 'DELETE'), (r) => `Cleared ${r.removed}`); };
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Delete schedule', 'This schedule will be removed.', 'Delete'))) return;
    run(() => api('/api/schedules/' + b.dataset.del, 'DELETE'), () => 'Deleted');
  });
}
function scheduleForm(prefill = {}) {
  const preDate = prefill.date || '';
  const preSubject = prefill.subject || 'Reminder';
  const preMsg = prefill.message || '';
  modal(`<h3>${preDate ? 'Remind me on this day' : 'New schedule'}</h3>
  <form id="sf">
    <div class="cf-grid"><div class="cf-col">
    <label>Repeat</label>
    <select name="schedule_type" id="stype">
      <option value="ONE_TIME" selected>One-time (specific date)</option>
      <option value="DAILY">Every day</option>
      <option value="WEEKLY">Every week</option>
      <option value="MONTHLY">Every month</option>
      <option value="YEARLY">Every year</option>
      <option value="BIRTHDAY">Birthday (yearly)</option>
      <option value="ANNIVERSARY">Anniversary (yearly)</option>
    </select>
    <div id="when-fields"></div>
    <label>Time (Colombo, Sri Lanka UTC+5:30)</label><input name="time" type="time" value="08:00" required>
    <p class="hint">All times use Asia/Colombo (+5:30).</p>
    <label>From name</label><input name="sender_name" maxlength="60" placeholder="${esc(me.sender_name || '')}">
    </div><div class="cf-col">
    <label>Recipient email</label>${recipField()}
    <label>Recipient name</label><input name="recipient_name" maxlength="80">
    <label>Subject</label><input name="subject" maxlength="200" value="${esc(preSubject)}" required>
    <label>Message</label><textarea name="message" rows="4" required placeholder="Hi {name}! ...">${esc(preMsg)}</textarea>
    </div></div>
    <button class="btn block">Schedule</button>
  </form>`, (sheet, close) => {
    bindRecipient(sheet, '[name="recipient_name"]');
    const when = $('#when-fields', sheet);
    const renderWhen = () => {
      const t = $('#stype', sheet).value;
      if (t === 'ONE_TIME') {
        when.innerHTML = `<label>Date</label><input name="date" type="date" value="${esc(preDate || slDate(1))}" required>
          <p class="hint">Sends once on this date at the time below.</p>`;
      } else if (t === 'DAILY') {
        when.innerHTML = `<label>Send on</label>${daysPickerHtml([0, 1, 2, 3, 4, 5, 6])}<p class="hint">Untick the days you want to skip, e.g. weekends.</p>`;
      } else if (t === 'WEEKLY') {
        when.innerHTML = `<label>Days of week</label>${daysPickerHtml([1])}<p class="hint">Pick one or more days.</p>`;
      } else if (t === 'MONTHLY') {
        when.innerHTML = `<label>Day of month</label>
          <select name="day_of_month">${monthDayOpts()}</select>
          <p class="hint">Month end always means the last day (28, 29, 30 or 31).</p>`;
      } else {
        when.innerHTML = `<label>Date each year</label><input name="date" type="date" value="${slDate(0)}" required>
          <p class="hint">Only month & day are used — repeats every year.</p>`;
      }
      bindDays(when);
    };
    $('#stype', sheet).onchange = renderWhen;
    renderWhen();
    $('#sf', sheet).onsubmit = (e) => {
      e.preventDefault();
      const d = fd(e.target);
      if (['YEARLY', 'BIRTHDAY', 'ANNIVERSARY'].includes(d.schedule_type) && d.date && d.date.length === 10) {
        d.date = d.date.slice(5); // YYYY-MM-DD → MM-DD
      }
      if (['DAILY', 'WEEKLY'].includes(d.schedule_type)) d.days = $$('input[name="days"]:checked', e.target).map((x) => Number(x.value));
      if (d.day_of_month != null && d.day_of_month !== 'L') d.day_of_month = Number(d.day_of_month);
      withBtn($('.btn', e.target), async () => {
        await api('/api/schedules', 'POST', d);
        toast('Scheduled!', 'good');
        close();
        if (curPage === 'calendar') pageCalendar();
        else pageSchedules();
      });
    };
  }, 'sheet-full');
}

const initials = (n) => (String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
/* ---------- contact import (vCard / CSV) ---------- */
function normMD(v) {
  v = String(v || '').trim();
  if (!v) return '';
  const m = v.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/) || v.match(/^--(\d{2})-?(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = v.replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return '';
}
function parseVcf(text) {
  const out = [];
  const unfolded = text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '');
  for (const block of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    const c = { name: '', email: '', birthday: '', anniversary: '' };
    let n = '';
    for (const line of block.split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0].replace(/^.*\./, '').toUpperCase();
      const val = line.slice(i + 1).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
      if (key === 'FN' && !c.name) c.name = val;
      else if (key === 'N' && !n) n = val.split(';').slice(0, 2).reverse().join(' ').trim();
      else if (key === 'EMAIL' && !c.email) c.email = val;
      else if (key === 'BDAY') c.birthday = normMD(val);
      else if (key === 'ANNIVERSARY' || key === 'X-ANNIVERSARY') c.anniversary = normMD(val);
    }
    if (!c.name) c.name = n;
    if (c.email) out.push(c);
  }
  return out;
}
function parseCsvRows(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const find = (fn) => h.map((x, i) => (fn(x) ? i : -1)).filter((i) => i >= 0);
  const emailCols = find((x) => /e-?mail/.test(x) && !/label|type/.test(x));
  const nameCol = find((x) => ['name', 'full name', 'display name'].includes(x))[0];
  const first = find((x) => ['first name', 'given name', 'firstname'].includes(x))[0];
  const last = find((x) => ['last name', 'family name', 'surname', 'lastname'].includes(x))[0];
  const bd = find((x) => /birth/.test(x))[0];
  const an = find((x) => /anniversary/.test(x))[0];
  return rows.slice(1).map((r) => {
    const g = (i) => (i == null ? '' : (r[i] || '').trim());
    const email = emailCols.map(g).find(Boolean) || '';
    const name = g(nameCol) || [g(first), g(last)].filter(Boolean).join(' ');
    return { name, email, birthday: normMD(g(bd)), anniversary: normMD(g(an)) };
  }).filter((c) => c.email);
}
function importForm() {
  modal(`<h3>Import contacts</h3>
    <p class="muted small">Upload a vCard (.vcf) or CSV file. CSV needs an email column; name, birthday and anniversary columns are optional. Existing emails are skipped.</p>
    <input type="file" id="ifile" accept=".vcf,.csv,text/vcard,text/csv">
    <p class="hint" id="isum"></p>
    <button class="btn block" id="igo" disabled>Import</button>`, (sheet, close) => {
    let parsed = [];
    $('#ifile', sheet).onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        parsed = /\.vcf$/i.test(file.name) || /BEGIN:VCARD/i.test(text) ? parseVcf(text) : parseCsv(text);
      } catch { parsed = []; }
      $('#isum', sheet).textContent = parsed.length ? `${parsed.length} contacts with an email found.` : 'No contacts with an email address found.';
      $('#igo', sheet).disabled = !parsed.length;
    };
    $('#igo', sheet).onclick = (e) => withBtn(e.currentTarget, async () => {
      const r = await api('/api/contacts/import', 'POST', { contacts: parsed.slice(0, 1000) });
      let msg = `Imported ${r.imported}`;
      if (r.duplicates) msg += `, ${r.duplicates} already existed`;
      if (r.invalid) msg += `, ${r.invalid} invalid`;
      if (r.over_limit) msg += `, ${r.over_limit} skipped (contact limit)`;
      toast(msg, r.imported ? 'good' : '');
      close(); pageContacts();
    });
  });
}

/* ---------- contact search, pickers, campaigns ---------- */
async function getContacts(force) {
  if (!contactsCache || force) contactsCache = (await api('/api/contacts')).contacts || [];
  return contactsCache;
}
const cMatch = (c, q) => {
  if (!q) return true;
  const h = `${c.name} ${c.email}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => h.includes(w));
};

/* email input + "contacts" button; use with bindRecipient() */
const recipField = () => `<div class="inwrap"><input name="recipient" type="email" inputmode="email" autocomplete="off" placeholder="name or email@example.com" required data-rcpt>
  <button type="button" class="btn ghost pickbtn" data-pick aria-label="Pick from contacts" title="Pick from contacts">${ic('users')}</button></div>`;

/* type-ahead: shows matching contacts under an input while typing */
function suggestFor(input, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'sugwrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.append(input);
  const box = document.createElement('div');
  box.className = 'sug hide';
  wrap.append(box);
  let items = [];
  const hide = () => box.classList.add('hide');
  const render = async () => {
    const q = input.value.trim();
    if (!q) return hide();
    let all;
    try { all = await getContacts(); } catch { return; }
    items = all.filter((c) => cMatch(c, q)).slice(0, 6);
    if (!items.length || (items.length === 1 && items[0].email === q.toLowerCase())) return hide();
    box.innerHTML = items.map((c, i) => `<button type="button" class="sug-item" data-i="${i}"><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></button>`).join('');
    box.classList.remove('hide');
  };
  input.addEventListener('input', render);
  input.addEventListener('blur', () => setTimeout(hide, 180));
  box.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.sug-item');
    if (!b) return;
    e.preventDefault();
    const c = items[Number(b.dataset.i)];
    input.value = c.email;
    hide();
    if (onPick) onPick(c);
  });
}
function bindRecipient(root, nameSel) {
  const input = $('[data-rcpt]', root);
  if (!input) return;
  const fill = (c) => {
    input.value = c.email;
    const n = nameSel ? $(nameSel, root) : null;
    if (n) n.value = c.name;
  };
  suggestFor(input, fill);
  $('[data-pick]', root).onclick = async () => {
    const r = await pickContacts({ multi: false });
    if (r && r[0]) fill(r[0]);
  };
}

/* searchable contact picker (modal). Resolves with an array of contacts. */
function pickContacts({ multi = true, selected = [] } = {}) {
  return new Promise((resolve) => {
    getContacts().then((all) => {
      const sel = new Set(selected);
      modal(`<h3>${multi ? 'Select contacts' : 'Pick a contact'}</h3>
        <input type="search" id="pq" placeholder="Search name or email" autocomplete="off">
        <div class="row small" style="margin-top:8px"><span class="muted" id="pcount"></span>
          ${multi ? '<button type="button" class="linkbtn right" id="pall">Select all shown</button><button type="button" class="linkbtn" id="pnone">Clear</button>' : ''}</div>
        <div class="plist" id="plist"></div>
        ${multi ? '<button type="button" class="btn block" id="pok">Done</button>' : ''}`, (sheet, close) => {
        const shown = () => all.filter((c) => cMatch(c, $('#pq', sheet).value.trim()));
        const count = (n) => { $('#pcount', sheet).textContent = `${n} of ${all.length}` + (multi ? ` · ${sel.size} selected` : ''); };
        const paint = () => {
          const list = shown();
          count(list.length);
          $('#plist', sheet).innerHTML = list.length
            ? list.map((c) => `<label class="prow" data-id="${c.id}">${multi ? `<input type="checkbox" ${sel.has(c.id) ? 'checked' : ''}>` : ''}<span class="pt"><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></span></label>`).join('')
            : '<p class="muted small" style="padding:12px">No contacts match.</p>';
        };
        $('#pq', sheet).oninput = paint;
        const rowId = (e) => { const r = e.target.closest('.prow'); return r ? Number(r.dataset.id) : null; };
        if (multi) {
          $('#plist', sheet).addEventListener('change', (e) => {
            const id = rowId(e);
            if (id == null) return;
            if (e.target.checked) sel.add(id); else sel.delete(id);
            count(shown().length);
          });
          $('#pall', sheet).onclick = () => { shown().forEach((c) => sel.add(c.id)); paint(); };
          $('#pnone', sheet).onclick = () => { sel.clear(); paint(); };
          $('#pok', sheet).onclick = () => { close(); resolve(all.filter((c) => sel.has(c.id))); };
        } else {
          $('#plist', sheet).addEventListener('click', (e) => {
            const id = rowId(e);
            if (id == null) return;
            close();
            resolve(all.filter((c) => c.id === id));
          });
        }
        paint();
        if (window.matchMedia && window.matchMedia('(hover:hover)').matches) setTimeout(() => $('#pq', sheet).focus(), 60);
      });
    }).catch((e) => { toast(e.message, 'err'); resolve(null); });
  });
}

/* chip input: type/paste many emails, contacts type-ahead, remove with x */
function chipsInput(root, initial = []) {
  const items = new Map();
  const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  const list = $('#chiplist', root), input = $('#chipin', root), sug = $('#chipsug', root), cnt = $('#chipcount', root);
  const known = (e) => (contactsCache || []).find((c) => c.email === e);
  const put = (c) => { const e = String(c.email).toLowerCase(); if (!items.has(e)) items.set(e, { email: e, name: c.name || '', id: c.id }); };
  initial.forEach(put);
  let sItems = [];
  const hideSug = () => sug.classList.add('hide');
  const paint = () => {
    list.innerHTML = [...items.values()].map((c) => `<span class="chip" title="${esc(c.email)}">${esc(c.name || c.email)}<button type="button" data-rm="${esc(c.email)}" aria-label="Remove">&times;</button></span>`).join('');
    cnt.textContent = items.size ? `${items.size} recipient${items.size > 1 ? 's' : ''}` : 'No recipients yet';
  };
  const commit = (text) => {
    const bad = [];
    for (const tok of String(text).split(/[\s,;]+/).filter(Boolean)) {
      const e = tok.toLowerCase().replace(/^<|>$/g, '');
      if (!EMAIL_RE.test(e)) { bad.push(tok); continue; }
      put(known(e) || { email: e });
    }
    input.value = bad.join(' ');
    if (bad.length) toast(`Not a valid email: ${bad.slice(0, 3).join(', ')}`, 'err');
    paint(); hideSug();
  };
  input.addEventListener('keydown', (e) => {
    const v = input.value.trim();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!v) return;
      if (!EMAIL_RE.test(v) && sItems.length) { put(sItems[0]); input.value = ''; paint(); hideSug(); } else commit(v);
    } else if ((e.key === ',' || e.key === ';' || (e.key === ' ' && EMAIL_RE.test(v))) && v) {
      e.preventDefault(); commit(v);
    } else if (e.key === 'Backspace' && !input.value && items.size) {
      items.delete([...items.keys()].pop()); paint();
    }
  });
  input.addEventListener('paste', (e) => {
    const t = (e.clipboardData || window.clipboardData).getData('text');
    if (/[\s,;]/.test(t.trim())) { e.preventDefault(); commit(`${input.value} ${t}`); }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (EMAIL_RE.test(input.value.trim())) commit(input.value); hideSug(); }, 180));
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) return hideSug();
    sItems = (contactsCache || []).filter((c) => !items.has(c.email) && cMatch(c, q)).slice(0, 6);
    if (!sItems.length) return hideSug();
    sug.innerHTML = sItems.map((c, i) => `<button type="button" class="sug-item" data-i="${i}"><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></button>`).join('');
    sug.classList.remove('hide');
  });
  sug.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.sug-item');
    if (!b) return;
    e.preventDefault();
    put(sItems[Number(b.dataset.i)]); input.value = ''; paint(); hideSug(); input.focus();
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { items.delete(b.dataset.rm); paint(); } });
  $('#chipbox', root).addEventListener('click', (e) => { if (!e.target.closest('button')) input.focus(); });
  paint();
  return {
    items,
    flush: () => { if (input.value.trim()) commit(input.value); return !input.value.trim(); },
    pick: async () => {
      const r = await pickContacts({ multi: true, selected: [...items.values()].filter((c) => c.id).map((c) => c.id) });
      if (r) { for (const [k, v] of [...items]) if (v.id) items.delete(k); r.forEach(put); paint(); }
    },
    addAll: () => { (contactsCache || []).forEach(put); paint(); },
    clear: () => { items.clear(); paint(); },
  };
}

/* bulk email: from selected contacts (Contacts page) or from scratch (Campaigns page) */
/* fill the repeat / schedule fields of the campaign form from a saved campaign */
function fillCampaignSchedule(root, c) {
  const rep = $('#rep', root);
  if (!rep) return;
  const setv = (n, v) => { const el = $(`[name="${n}"]`, root); if (el) el.value = v; };
  if (c.repeat_type) {
    rep.value = c.repeat_type;
    rep.dispatchEvent(new Event('change'));
    setv('time', c.repeat_time || '09:00');
    const r = c.repeat_rule || '';
    if (['DAILY', 'WEEKLY'].includes(c.repeat_type)) {
      const on = !r || r === 'daily' ? ['0', '1', '2', '3', '4', '5', '6'] : r.split(',');
      $$('input[name="days"]', root).forEach((x) => { x.checked = on.includes(x.value); });
    } else if (c.repeat_type === 'MONTHLY') setv('day_of_month', r);
    else if (c.repeat_type === 'YEARLY') setv('date', `${slDate(0).slice(0, 4)}-${r}`);
  } else if (c.scheduled_at * 1000 > Date.now() + 60000) {
    const d = new Date(c.scheduled_at * 1000);
    setv('date', new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(d));
    setv('time', new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d));
  }
}
/* edit = { campaign, recipients } to edit an existing scheduled/running campaign (change text, schedule, add/remove recipients) */
async function campaignForm({ contacts = [], onDone, edit = null } = {}) {
  try { await getContacts(); } catch { /* picker will report */ }
  const running = !!(edit && edit.campaign.status === 'RUNNING');
  const sentCount = edit ? edit.recipients.filter((r) => !['PENDING', 'PROCESSING'].includes(r.status)).length : 0;
  const openRecipients = edit ? edit.recipients.filter((r) => ['PENDING', 'PROCESSING'].includes(r.status)).map((r) => ({ email: r.recipient_email, name: r.recipient_name || '' })) : contacts;
  modal(`<h3>${edit ? 'Edit campaign' : contacts.length ? 'Email selected contacts' : 'New campaign'}</h3>
  <form id="cf">
    <div class="cf-grid"><div class="cf-col">
    <label>Recipients</label>
    <div class="chipwrap">
      <div class="chipbox" id="chipbox"><span class="chiplist" id="chiplist"></span><input id="chipin" type="text" inputmode="email" autocomplete="off" autocapitalize="off" placeholder="Type or paste emails, press Enter"></div>
      <div class="sug hide" id="chipsug"></div>
    </div>
    <div class="row small" style="margin-top:6px"><span class="muted" id="chipcount"></span>
      <button type="button" class="linkbtn right" id="pickc">${ic('users')} Choose contacts</button>
      <button type="button" class="linkbtn" id="allc">All</button>
      <button type="button" class="linkbtn" id="clrc">Clear</button></div>
    <p class="hint">Paste a whole list at once (commas, spaces or new lines). Start typing a name to pick from your contacts.</p>
    ${edit ? `<p class="hint">Add or remove recipients here.${sentCount ? ` ${sentCount} already sent/failed — those are not affected and will not be sent again.` : ''}</p>` : ''}
    </div><div class="cf-col">
    <label>Subject</label><input name="subject" maxlength="200" required>
    <label>Message</label><textarea name="message" rows="5" maxlength="5000" required placeholder="Hi {name}, ..."></textarea>
    <p class="hint">Variables: {name} {sender} {year} {email}. {name} comes from the contact.</p>
    <label>Campaign name (optional)</label><input name="campaign_name" maxlength="80" placeholder="For your own reference">
    <label>From name (optional)</label><input name="sender_name" maxlength="60" placeholder="${esc(me.sender_name || me.display_name || '')}">
    ${running ? '<p class="hint">This campaign is already sending, so its schedule cannot change. You can edit the message and recipients.</p>' : repeatSelectHtml()}
    <p class="hint">Bulk emails are sent in small batches every minute.</p>
    </div></div>
    <button class="btn block">${edit ? 'Save changes' : 'Send'}</button>
  </form>`, (sheet, close) => {
    const chips = chipsInput(sheet, openRecipients);
    $('#pickc', sheet).onclick = () => chips.pick();
    $('#allc', sheet).onclick = () => chips.addAll();
    $('#clrc', sheet).onclick = () => chips.clear();
    if (!running) bindRepeat(sheet, `<div class="grid2">
      <div><label>Date (blank = send now)</label><input name="date" type="date"></div>
      <div><label>Time (Colombo)</label><input name="time" type="time" value="09:00"></div>
    </div>`);
    if (edit) {
      const f = $('#cf', sheet), ec = edit.campaign;
      f.subject.value = ec.subject || '';
      f.message.value = ec.message || '';
      f.campaign_name.value = ec.campaign_name || '';
      f.sender_name.value = ec.sender_name || '';
      if (!running) fillCampaignSchedule(sheet, ec);
    }
    $('#cf', sheet).onsubmit = (e) => {
      e.preventDefault();
      if (!chips.flush()) { toast('One of the emails is not valid. Fix or clear it first.', 'err'); return; }
      const all = [...chips.items.values()];
      if (!all.length) { toast('Add at least one recipient.', 'err'); return; }
      const d = repeatPayload(fd(e.target), e.target);
      d.contact_ids = all.filter((c) => c.id).map((c) => c.id);
      d.recipients = edit ? all.filter((c) => !c.id).map((c) => ({ email: c.email, name: c.name })) : all.filter((c) => !c.id).map((c) => c.email);
      const total = all.length;
      withBtn($('.btn', e.target), async () => {
        const base = me.role === 'ADMIN' ? '/api/admin/campaigns' : '/api/campaigns';
        if (edit) {
          const r = await api(base + '/' + edit.campaign.id, 'PUT', d);
          toast(`Saved. ${r.added} added, ${r.removed} removed.`, 'good');
          close();
          if (onDone) onDone();
          return;
        }
        const when = d.repeat ? 'This campaign repeats automatically. Cancel it on the Campaigns page to stop.' : d.date ? 'It will be sent at the scheduled time.' : 'It will start sending right away.';
        if (!(await confirmBox('Send to ' + total + ' recipient' + (total > 1 ? 's' : '') + '?', when, 'Send'))) return;
        const r = await api(base, 'POST', d);
        toast(`Campaign created for ${r.recipients} recipient${r.recipients > 1 ? 's' : ''}`, 'good');
        close();
        if (onDone) onDone();
      });
    };
  }, 'sheet-full');
}

const initialsOf = (n) => (String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
async function pageContacts() {
  let all = await getContacts(true);
  const sel = new Set();
  let q = '';
  $('#main').innerHTML = `
  <div class="page-head"><div><h2>Contacts</h2><p class="muted small" id="ccount"></p></div>
  <div class="head-actions"><button class="btn ghost smallbtn" id="imp">Import</button>
  <button class="btn" id="add">+ Add</button></div></div>
  <div class="searchbar"><input type="search" id="cq" placeholder="Search contacts by name or email" autocomplete="off"></div>
  <div class="row small" style="margin:2px 0 8px"><span class="muted" id="cinfo"></span>
    <button type="button" class="linkbtn right" id="selall">Select all shown</button></div>
  <div id="clist"></div>
  <div class="selbar hide" id="selbar"><span id="selcount"></span>
    <button type="button" class="btn ghost smallbtn" id="selclear">Clear</button>
    <button type="button" class="btn ghost danger smallbtn" id="seldel">${ic('trash')} Delete</button>
    <button type="button" class="btn smallbtn" id="selsend">${ic('send')} Email</button></div>`;
  const shown = () => all.filter((c) => cMatch(c, q));
  const bar = () => {
    $('#selbar').classList.toggle('hide', sel.size === 0);
    $('#selcount').textContent = `${sel.size} selected`;
  };
  const paint = () => {
    const list = shown();
    $('#ccount').textContent = q ? `${list.length} of ${all.length} shown` : `${all.length} saved`;
    $('#cinfo').textContent = all.length ? (q ? `${list.length} match${list.length === 1 ? '' : 'es'}` : 'Tick contacts to email or delete them together') : '';
    $('#selall').classList.toggle('hide', !list.length);
    $('#clist').innerHTML = list.length ? list.map((c) => `
      <div class="crow cr${sel.has(c.id) ? ' on' : ''}" data-id="${c.id}">
        <label class="cr-main">
          <input type="checkbox" ${sel.has(c.id) ? 'checked' : ''} aria-label="Select ${esc(c.name)}">
          <span class="avatar-xs">${esc(initialsOf(c.name))}</span>
          <span class="cr-info"><strong>${esc(c.name)}</strong><small>${esc(c.email)}${c.birthday ? ` · 🎂 ${esc(fmtMD(c.birthday))}` : ''}${c.anniversary ? ` · 💍 ${esc(fmtMD(c.anniversary))}` : ''}</small></span>
        </label>
        <button type="button" class="iconbtn" data-send="${c.id}" title="Send email" aria-label="Send email">${ic('send')}</button>
        <button type="button" class="iconbtn danger" data-del="${c.id}" title="Delete" aria-label="Delete">${ic('trash')}</button>
      </div>`).join('') : `<div class="card muted">${all.length ? 'No contacts match your search.' : 'No contacts yet. Tap + Add to save one.'}</div>`;
    bar();
  };
  paint();
  const removeIds = async (ids) => {
    const r = await api('/api/contacts/delete', 'POST', { ids });
    const gone = new Set(ids);
    all = all.filter((c) => !gone.has(c.id));
    contactsCache = all;
    ids.forEach((i) => sel.delete(i));
    toast(`Deleted ${r.removed}`, 'good');
    paint();
  };
  let qt;
  $('#cq').oninput = (e) => {
    clearTimeout(qt);
    const v = e.target.value.trim();
    qt = setTimeout(() => { q = v; paint(); }, 150);
  };
  $('#selall').onclick = () => { shown().forEach((c) => sel.add(c.id)); paint(); };
  $('#selclear').onclick = () => { sel.clear(); paint(); };
  $('#seldel').onclick = async () => {
    if (!(await confirmBox('Delete contacts', `Delete ${sel.size} selected contact${sel.size > 1 ? 's' : ''}? This cannot be undone.`, 'Delete'))) return;
    try { await removeIds([...sel]); } catch (e) { toast(e.message, 'err'); }
  };
  $('#selsend').onclick = () => campaignForm({
    contacts: all.filter((c) => sel.has(c.id)),
    onDone: () => { sel.clear(); go('campaigns', { push: true }); },
  });
  $('#clist').addEventListener('change', (e) => {
    const row = e.target.closest('.crow');
    if (!row) return;
    const id = Number(row.dataset.id);
    if (e.target.checked) sel.add(id); else sel.delete(id);
    row.classList.toggle('on', e.target.checked);
    bar();
  });
  $('#clist').addEventListener('click', async (e) => {
    const sb = e.target.closest('[data-send]');
    if (sb) {
      const c = all.find((x) => x.id === Number(sb.dataset.send));
      if (c) { sendPrefill = { email: c.email, name: c.name }; go('send', { push: true }); }
      return;
    }
    const b = e.target.closest('[data-del]');
    if (!b) return;
    if (!(await confirmBox('Delete contact', 'Remove this contact?', 'Delete'))) return;
    try { await removeIds([Number(b.dataset.del)]); } catch (err) { toast(err.message, 'err'); }
  });
  $('#add').onclick = () => contactForm();
  $('#imp').onclick = () => importForm();
}
function contactForm() {
  modal(`<h3>Add contact</h3>
  <form id="cf">
    <label>Name</label><input name="name" required maxlength="80">
    <label>Email</label><input name="email" type="email" required>
    <label>Birthday (MM-DD)</label><input name="birthday" placeholder="04-18" pattern="\\d{2}-\\d{2}">
    <label>Anniversary (MM-DD)</label><input name="anniversary" placeholder="08-12" pattern="\\d{2}-\\d{2}">
    <label>Notes</label><input name="notes" maxlength="300">
    <button class="btn block" style="margin-top:12px">Save</button>
  </form>`, (sheet, close) => {
    $('#cf', sheet).onsubmit = (e) => {
      e.preventDefault();
      withBtn($('.btn', e.target), async () => {
        await api('/api/contacts', 'POST', fd(e.target));
        toast('Contact added', 'good');
        close();
        pageContacts();
      });
    };
  });
}

async function pageHistory() {
  const data = await api('/api/email/history');
  const list = data.logs || [];
  $('#main').innerHTML = `
  <div class="page-head"><h2>Email history</h2>${list.length ? '<button class="btn ghost danger smallbtn" id="clearh">Clear history</button>' : ''}</div>
  <div class="list">${list.length ? list.map((l) => `
    <div class="card item">
      <div class="row"><strong>${esc(l.subject_preview || '(no subject)')}</strong> ${statusBadge(l.status)}</div>
      <div class="muted small">To: ${esc(l.recipient_email)} · ${esc(l.message_type)} · ${fmtDT(l.created_at)}</div>
      ${l.error_message ? `<div class="small" style="color:var(--bad)">${esc(l.error_message)}</div>` : ''}
    </div>`).join('') : '<div class="card muted">No emails yet.</div>'}</div>`;
  const ch = $('#clearh');
  if (ch) ch.onclick = async () => {
    if (!(await confirmBox('Clear history', 'Remove all entries from your email history? Your daily/monthly sending limits are not reset.', 'Clear'))) return;
    try { await api('/api/email/history', 'DELETE'); toast('History cleared', 'good'); pageHistory(); } catch (e) { toast(e.message, 'err'); }
  };
}

async function pageTemplates() {
  const data = await api('/api/templates');
  const list = data.templates || [];
  $('#main').innerHTML = `
  <div class="page-head"><h2>Templates</h2><button class="btn right" id="add">+ New</button></div>
  <div class="list">${list.length ? list.map((t) => `
    <div class="card item">
      <div class="row"><strong>${esc(t.template_name)}</strong>
        <button class="linkbtn right" data-del="${t.id}">Delete</button></div>
      <div class="muted small">${esc(t.subject_body || '')}</div>
      <div class="small">${esc((t.message_body || '').slice(0, 100))}</div>
    </div>`).join('') : '<div class="card muted">No templates yet.</div>'}</div>`;
  $('#add').onclick = () => {
    modal(`<h3>New template</h3>
    <form id="tf"><label>Name</label><input name="template_name" required>
    <label>Subject</label><input name="subject_body">
    <label>Body</label><textarea name="message_body" rows="5" required></textarea>
    <button class="btn block" style="margin-top:12px">Save</button></form>`, (sheet, close) => {
      $('#tf', sheet).onsubmit = (e) => {
        e.preventDefault();
        withBtn($('.btn', e.target), async () => {
          await api('/api/templates', 'POST', fd(e.target));
          toast('Saved', 'good'); close(); pageTemplates();
        });
      };
    });
  };
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Delete', 'Delete this template?', 'Delete'))) return;
    try { await api('/api/templates/' + b.dataset.del, 'DELETE'); pageTemplates(); } catch (e) { toast(e.message, 'err'); }
  });
}

async function pageProfile() {
  $('#main').innerHTML = `
  <div class="card">
    <h3>Profile</h3>
    <form id="pf">
      <label>Display name</label><input name="display_name" value="${esc(me.display_name)}" required>
      <label>Email</label><input value="${esc(me.email)}" disabled>
      <label>Default From name</label><input name="sender_name" value="${esc(me.sender_name || '')}" maxlength="60">
      <button class="btn block" style="margin-top:12px">Save</button>
    </form>
  </div>
  <div class="card" style="margin-top:14px">
    <h3>Change password</h3>
    <form id="pw">
      ${pwField('current_password', 'current-password', 'Current password')}
      ${pwField('new_password', 'new-password', 'New password', true)}
      <button class="btn block" style="margin-top:12px">Update password</button>
    </form>
  </div>`;
  $('#pf').onsubmit = (e) => {
    e.preventDefault();
    withBtn($('.btn', e.target), async () => {
      const d = await api('/api/profile', 'PUT', fd(e.target));
      me = d.user; toast('Saved', 'good');
    });
  };
  $('#pw').onsubmit = (e) => {
    e.preventDefault();
    withBtn($('.btn', e.target), async () => {
      await api('/api/auth/password/change', 'POST', fd(e.target));
      toast('Password updated', 'good'); e.target.reset();
    });
  };
}

/* ---------- Sri Lanka holidays (DB-backed; admin sync/import/manual) ---------- */
const HOLIDAY_TYPE_LABEL = { public: 'Public', bank: 'Bank', mercantile: 'Mercantile', poya: 'Poya' };
const HOLIDAY_TYPE_CLASS = { public: 'h-pub', bank: 'h-bank', mercantile: 'h-merc', poya: 'h-poya' };

let calYear = null, calMonth = null; // 0-based month
let holidaysCache = {}; // year -> [{d,n,t}]

function normalizeHolidayRows(list) {
  return (list || []).map((h) => ({
    d: h.date || h.d,
    n: h.name || h.n,
    t: h.types || h.t || [],
    id: h.id,
  })).filter((h) => h.d && h.n);
}

async function loadHolidaysYear(y) {
  if (holidaysCache[y]) return holidaysCache[y];
  try {
    const data = await api('/api/holidays?year=' + y);
    holidaysCache[y] = normalizeHolidayRows(data.holidays);
  } catch {
    holidaysCache[y] = [];
  }
  return holidaysCache[y];
}

function holidaysForMonth(list, y, m) {
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  return list.filter((h) => h.d.startsWith(prefix));
}

function holidayMapFromList(list) {
  const map = {};
  list.forEach((h) => { map[h.d] = h; });
  return map;
}

async function pageCalendar() {
  const todayStr = slDate(0);
  if (calYear == null) {
    const [yy, mm] = todayStr.split('-').map(Number);
    calYear = yy;
    calMonth = mm - 1;
  }
  let scheduleDates = {};
  try {
    const data = await api('/api/schedules');
    (data.schedules || []).forEach((s) => {
      if (!['PENDING', 'ACTIVE'].includes(s.status)) return;
      if (s.schedule_type === 'ONE_TIME' && s.next_run_at) {
        const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(s.next_run_at * 1000));
        if (!scheduleDates[d]) scheduleDates[d] = [];
        scheduleDates[d].push(s);
      }
    });
  } catch { /* ignore */ }

  const render = async () => {
    const y = calYear, m = calMonth;
    const yearList = await loadHolidaysYear(y);
    const first = new Date(Date.UTC(y, m, 1));
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    let startDow = (first.getUTCDay() + 6) % 7;
    const hMap = holidayMapFromList(yearList);
    const monthHolidays = holidaysForMonth(yearList, y, m);
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div class="cal-cell empty"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const h = hMap[ds];
      const isToday = ds === todayStr;
      const hasRem = !!scheduleDates[ds];
      const classes = ['cal-cell', 'day'];
      if (isToday) classes.push('today');
      if (h) {
        classes.push('holiday');
        if (h.t.includes('poya')) classes.push('is-poya');
        else if (h.t.includes('mercantile')) classes.push('is-merc');
        else classes.push('is-pub');
      }
      if (hasRem) classes.push('has-rem');
      const dots = [];
      if (h) {
        if (h.t.includes('poya')) dots.push('<span class="cdot poya" title="Poya"></span>');
        if (h.t.includes('public')) dots.push('<span class="cdot pub" title="Public"></span>');
        if (h.t.includes('mercantile') && !h.t.includes('poya')) dots.push('<span class="cdot merc" title="Mercantile"></span>');
        if (h.t.includes('bank') && !h.t.includes('public') && !h.t.includes('poya')) dots.push('<span class="cdot bank" title="Bank"></span>');
      }
      if (hasRem) dots.push('<span class="cdot rem" title="Your reminder"></span>');
      const title = h ? esc(h.n) : (hasRem ? 'Has reminder — tap to add another' : 'Tap to set a reminder');
      cells.push(`<button type="button" class="${classes.join(' ')}" data-date="${ds}" title="${title}">
        <span class="dnum">${day}</span>
        ${dots.length ? `<span class="cdots">${dots.join('')}</span>` : ''}
        ${h ? `<span class="hname">${esc(h.n.split(' ').slice(0, 2).join(' '))}</span>` : ''}
      </button>`);
    }
    const emptyNote = yearList.length
      ? ''
      : `<p class="muted small" style="margin-top:10px">No holidays loaded for ${y}. An admin can sync or upload them under <strong>Settings → Holidays</strong>.</p>`;
    $('#main').innerHTML = `
    <div class="page-head">
      <h2>Calendar</h2>
      <button class="btn right" id="cal-today">Today</button>
    </div>
    <p class="muted small" style="margin-bottom:12px">Sri Lankan public, bank, mercantile &amp; Poya holidays (managed by admin). Tap any day to schedule an email reminder.</p>
    <div class="cal-nav">
      <button type="button" class="btn ghost iconbtn" id="cal-prev" aria-label="Previous month">${ic('back')}</button>
      <div class="cal-title">${MONTHS[m]} ${y}</div>
      <button type="button" class="btn ghost iconbtn" id="cal-next" aria-label="Next month"><svg class="icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>
    <div class="cal-grid">
      <div class="cal-dow">Mon</div><div class="cal-dow">Tue</div><div class="cal-dow">Wed</div><div class="cal-dow">Thu</div><div class="cal-dow">Fri</div><div class="cal-dow">Sat</div><div class="cal-dow">Sun</div>
      ${cells.join('')}
    </div>
    <div class="cal-legend">
      <span><i class="cdot poya"></i> Poya</span>
      <span><i class="cdot pub"></i> Public</span>
      <span><i class="cdot merc"></i> Mercantile</span>
      <span><i class="cdot bank"></i> Bank only</span>
      <span><i class="cdot rem"></i> Your reminder</span>
    </div>
    ${emptyNote}
    ${monthHolidays.length ? `
    <div class="sec-title" style="margin-top:18px">Holidays this month</div>
    <div class="list cal-hlist">${monthHolidays.map((h) => `
      <div class="card item cal-hitem" data-date="${h.d}">
        <div class="row">
          <strong>${esc(h.d.slice(8))}/${esc(h.d.slice(5, 7))}</strong>
          <span class="cal-tags">${h.t.map((t) => `<span class="htag ${HOLIDAY_TYPE_CLASS[t] || ''}">${HOLIDAY_TYPE_LABEL[t] || esc(t)}</span>`).join('')}</span>
        </div>
        <div class="small" style="margin-top:4px">${esc(h.n)}</div>
        <div class="actions"><button class="btn ghost smallbtn" data-remind="${h.d}">+ Reminder</button></div>
      </div>`).join('')}</div>` : '<p class="muted small" style="margin-top:14px">No holidays this month.</p>'}
    <p class="muted small" style="margin-top:14px">Islamic festival dates may shift by one day subject to moon sighting. Official gazette takes priority.</p>`;

    $('#cal-prev').onclick = () => {
      if (calMonth === 0) { calYear--; calMonth = 11; } else calMonth--;
      render();
    };
    $('#cal-next').onclick = () => {
      if (calMonth === 11) { calYear++; calMonth = 0; } else calMonth++;
      render();
    };
    $('#cal-today').onclick = () => {
      const [yy, mm] = todayStr.split('-').map(Number);
      calYear = yy; calMonth = mm - 1;
      render();
    };
    const openDay = (ds) => {
      const h = hMap[ds];
      const subject = h ? `Reminder: ${h.n}` : 'Reminder';
      const message = h
        ? `Hi {name},\n\nThis is a reminder for ${h.n} (${ds}).\n\nHave a great day!`
        : `Hi {name},\n\nThis is your scheduled reminder for ${ds}.\n\nHave a great day!`;
      scheduleForm({ date: ds, subject, message });
    };
    $$('.cal-cell.day').forEach((el) => el.onclick = () => openDay(el.dataset.date));
    $$('[data-remind]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); openDay(b.dataset.remind); });
  };
  await render();
}

async function pageMore() {
  const groups = [
    { title: 'Your account', items: [
      { id: 'calendar', label: 'Calendar', desc: 'Sri Lankan holidays & reminders', icon: 'calendar', tone: 'blue' },
      { id: 'history', label: 'Email history', desc: 'Everything you have sent', icon: 'list', tone: 'blue' },
      { id: 'templates', label: 'Templates', desc: 'Reusable messages', icon: 'file', tone: 'violet' },
      { id: 'campaigns', label: 'Campaigns', desc: 'Email many contacts at once', icon: 'mega', tone: 'amber' },
      { id: 'profile', label: 'Profile', desc: 'Name, From name, password', icon: 'user', tone: 'green' },
    ] },
  ];
  if (me.role === 'ADMIN') {
    groups.push({ title: 'Admin', items: [
      { id: 'admin', label: 'Users', desc: 'Accounts and limits', icon: 'shield', tone: 'violet' },
      { id: 'settings', label: 'Settings', desc: 'System limits and access', icon: 'settings', tone: 'blue' },
    ] });
  }
  const app = [];
  if (!isStandalone()) app.push({ id: 'install-pwa', label: 'Install app', desc: 'Add to your home screen', icon: 'home', tone: 'green' });
  app.push({ id: 'logout', label: 'Log out', desc: 'End this session', icon: 'logout', tone: 'red' });
  groups.push({ title: 'App', items: app });
  $('#main').innerHTML = groups.map((g) => `
    <div class="sec-title">${esc(g.title)}</div>
    <div class="tiles">${g.items.map((i) => `
      <a href="#" class="tile nav-tile tone-${i.tone}" data-nav="${i.id}">
        <span class="tile-ic">${ic(i.icon)}</span>
        <span class="tile-t">${esc(i.label)}</span>
        <span class="tile-d">${esc(i.desc)}</span>
      </a>`).join('')}</div>`).join('');
  $$('[data-nav]', $('#main')).forEach((el) => el.onclick = (e) => {
    e.preventDefault();
    const id = el.dataset.nav;
    if (id === 'install-pwa') {
      try { localStorage.removeItem('pwa_dismiss'); } catch { /* ignore */ }
      hidePwaBanner();
      if (deferredPrompt) showPwaBanner('install');
      else if (isIos()) showPwaBanner('ios');
      else if (isSamsung()) showPwaBanner('samsung');
      else showPwaBanner('manual');
      return;
    }
    go(id);
  });
}

async function pageAdmin() {
  if (me.role !== 'ADMIN') return go('home');
  const data = await api('/api/admin/users');
  const list = data.users || [];
  const defaultLimit = data.default_schedule_limit ?? 5;
  $('#main').innerHTML = `
  <div class="page-head"><h2>Users</h2></div>
  <p class="muted small" style="margin-bottom:12px">Default schedule limit: ${defaultLimit}. Times use Sri Lanka (UTC+5:30).</p>
  <div class="list">${list.length ? list.map((u) => {
    const isAdm = u.role === 'ADMIN';
    const lim = isAdm ? null : (u.schedule_limit != null ? u.schedule_limit : defaultLimit);
    const custom = !isAdm && u.schedule_limit != null;
    return `
    <div class="card item">
      <div class="row"><strong>${esc(u.display_name)}</strong> ${statusBadge(u.status)} ${isAdm ? '<span class="badge info">ADMIN</span>' : ''}</div>
      <div class="muted small">${esc(u.email)}</div>
      <div class="muted small" style="margin-top:4px">
        Active schedules: <strong>${u.active_schedules || 0}</strong>${isAdm ? ' (unlimited)' : ` / ${lim}${custom ? ' (custom)' : ' (default)'}`}
        · Today: ${u.emails_today || 0}
        · Joined: ${fmtDT(u.created_at)}
      </div>
      ${u.id !== me.id ? `<div class="actions">
        ${u.status === 'ACTIVE'
          ? `<button class="btn ghost smallbtn" data-st="${u.id}:SUSPENDED">Deactivate</button>`
          : `<button class="btn smallbtn" data-st="${u.id}:ACTIVE">Activate</button>`}
        ${!isAdm ? `<button class="btn ghost smallbtn" data-limit="${u.id}" data-cur="${u.schedule_limit != null ? u.schedule_limit : ''}">Schedule limit</button>` : ''}
        ${!isAdm ? `<button class="btn ghost danger smallbtn" data-del="${u.id}">Remove</button>` : ''}
      </div>` : '<p class="muted small" style="margin-top:8px">This is you (admin — no limits)</p>'}
    </div>`;
  }).join('') : '<div class="card muted">No users yet.</div>'}</div>`;
  $$('[data-st]').forEach((b) => b.onclick = async () => {
    const [id, status] = b.dataset.st.split(':');
    const label = status === 'ACTIVE' ? 'Activate this user?' : 'Deactivate this user? They will be logged out.';
    if (!(await confirmBox(status === 'ACTIVE' ? 'Activate' : 'Deactivate', label, status === 'ACTIVE' ? 'Activate' : 'Deactivate'))) return;
    try { await api('/api/admin/users/' + id + '/status', 'PUT', { status }); toast('Updated', 'good'); pageAdmin(); } catch (e) { toast(e.message, 'err'); }
  });
  $$('[data-limit]').forEach((b) => b.onclick = () => {
    const id = b.dataset.limit;
    const cur = b.dataset.cur;
    modal(`<h3>Schedule limit</h3>
      <p class="muted small">Leave empty to use system default (${defaultLimit}).</p>
      <form id="lf">
        <label>Max active schedules</label>
        <input name="schedule_limit" type="number" min="0" max="10000" placeholder="Default: ${defaultLimit}" value="${esc(cur)}">
        <button class="btn block" style="margin-top:12px">Save</button>
      </form>`, (sheet, close) => {
      $('#lf', sheet).onsubmit = (e) => {
        e.preventDefault();
        const raw = fd(e.target).schedule_limit;
        const schedule_limit = raw === '' || raw == null ? null : Number(raw);
        withBtn($('.btn', e.target), async () => {
          await api('/api/admin/users/' + id + '/schedule-limit', 'PUT', { schedule_limit });
          toast('Limit updated', 'good');
          close();
          pageAdmin();
        });
      };
    });
  });
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Remove user', 'Permanently delete this user and their data? This cannot be undone.', 'Remove'))) return;
    try { await api('/api/admin/users/' + b.dataset.del, 'DELETE'); toast('User removed', 'good'); pageAdmin(); } catch (e) { toast(e.message, 'err'); }
  });
}

async function pageCampaigns() {
  const isAdmin = me.role === 'ADMIN';
  const base = isAdmin ? '/api/admin/campaigns' : '/api/campaigns';
  const data = await api(base);
  const list = data.campaigns || [];
  const live = (c) => ['SCHEDULED', 'RUNNING'].includes(c.status);
  const nAct = list.filter(live).length, nDone = list.length - nAct;
  $('#main').innerHTML = `
  <div class="page-head"><h2>Campaigns</h2>
  <div class="head-actions"><button class="btn ghost smallbtn" id="refresh">Refresh</button>
  <button class="btn smallbtn" id="add">+ New</button></div></div>
  <p class="muted small" style="margin-bottom:12px">Email many people at once. Up to ${data.max_recipients} recipients per campaign, sent in batches every minute. Tip: tick contacts on the Contacts tab and tap Email.</p>
  ${nAct || nDone ? `<div class="row small" style="margin-bottom:10px">
    ${nAct ? '<button class="btn ghost danger smallbtn" id="cancelall">Cancel all</button>' : ''}
    ${nDone ? `<button class="btn ghost smallbtn" id="clearfin">Clear finished (${nDone})</button>` : ''}</div>` : ''}
  <div class="list">${list.length ? list.map((c) => {
    const done = (c.sent || 0) + (c.failed || 0);
    const pct = c.total ? Math.round((done / c.total) * 100) : 0;
    return `
    <div class="card item">
      <div class="row"><strong>${esc(c.campaign_name)}</strong> ${statusBadge(c.status)}</div>
      <div class="muted small">${esc(c.subject)} · ${fmtDT(c.scheduled_at)}</div>
      ${c.repeat_type ? `<div class="small">🔁 ${esc(scheduleRuleLabel({ schedule_type: c.repeat_type, recurrence_rule: c.repeat_rule, send_time: c.repeat_time }))}</div>` : ''}
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="small">Total ${c.total || 0} · Sent ${c.sent || 0} · Failed ${c.failed || 0} · Pending ${c.pending || 0}</div>
      <div class="row" style="margin-top:8px">${live(c) ? `<button class="btn ghost smallbtn" data-edit="${c.id}">Edit / add recipients</button>` : ''}<button class="btn ghost danger smallbtn" data-del="${c.id}">${live(c) ? 'Cancel &amp; delete' : 'Delete'}</button></div>
    </div>`;
  }).join('') : '<div class="card muted">No campaigns yet.</div>'}</div>`;
  const run = async (fn, msg) => { try { const r = await fn(); toast(msg(r), 'good'); pageCampaigns(); } catch (e) { toast(e.message, 'err'); } };
  $('#refresh').onclick = () => pageCampaigns().catch((e) => toast(e.message, 'err'));
  $('#add').onclick = () => campaignForm({ onDone: pageCampaigns });
  const ca = $('#cancelall');
  if (ca) ca.onclick = async () => { if (await confirmBox('Cancel all campaigns', `Stop and remove all ${nAct} running or scheduled campaigns? Unsent emails will not be sent and repeats stop.`, 'Cancel all')) run(() => api(base + '/cancel-all', 'POST', {}), (r) => `Removed ${r.removed}`); };
  const cf = $('#clearfin');
  if (cf) cf.onclick = async () => { if (await confirmBox('Clear finished', 'Remove all completed and cancelled campaigns?', 'Clear')) run(() => api(base, 'DELETE'), (r) => `Cleared ${r.removed}`); };
  $$('[data-edit]').forEach((b) => b.onclick = () => withBtn(b, async () => {
    const d = await api(base + '/' + b.dataset.edit);
    await campaignForm({ edit: d, onDone: pageCampaigns });
  }));
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Delete campaign', 'Remove this campaign? If it is still running, unsent emails will not be sent.', 'Delete'))) return;
    run(() => api(base + '/' + b.dataset.del, 'DELETE'), () => 'Deleted');
  });
}

async function pageSettings() {
  if (me.role !== 'ADMIN') return go('home');
  const data = await api('/api/admin/settings');
  const s = data.settings || {};
  const groups = [
    { title: 'User limits', note: 'Apply to normal users only. Admin accounts have no limits.', tiles: [
      { k: 'max_user_scheduled_messages', icon: '⏰', label: 'Active schedules', desc: 'Per user (default)', min: 0 },
      { k: 'max_daily_emails', icon: '✉️', label: 'Emails per day', desc: 'Per user', min: 0 },
      { k: 'max_monthly_emails', icon: '📅', label: 'Emails per month', desc: 'Per user', min: 0 },
      { k: 'max_contacts', icon: '👥', label: 'Contacts', desc: 'Per user', min: 0 },
    ] },
    { title: 'Access', tiles: [
      { k: 'registration_enabled', icon: '🟢', label: 'Registration', desc: 'Allow new sign-ups', toggle: true },
      { k: 'allow_custom_sender_name', icon: '✍️', label: 'Custom From name', desc: 'Let users set their own', toggle: true },
    ] },
    { title: 'Security', tiles: [
      { k: 'otp_expiry_minutes', icon: '⌛', label: 'Code expiry', desc: 'Minutes a code stays valid', min: 1 },
      { k: 'max_otp_requests', icon: '🔢', label: 'Code requests', desc: 'Per email, per hour', min: 0 },
      { k: 'max_otp_attempts', icon: '🔑', label: 'Code attempts', desc: 'Wrong tries before lock', min: 1 },
      { k: 'max_login_attempts', icon: '🚫', label: 'Login attempts', desc: 'Per email, per 15 minutes', min: 0 },
    ] },
    { title: 'Bulk sending', tiles: [
      { k: 'max_bulk_recipients', icon: '📣', label: 'Recipients', desc: 'Max per campaign', min: 0 },
      { k: 'bulk_batch_size', icon: '📦', label: 'Batch size', desc: 'Emails per minute (max 40)', min: 1, max: 40 },
    ] },
  ];
  const toggleKeys = groups.flatMap((g) => g.tiles).filter((x) => x.toggle).map((x) => x.k);
  const tileHtml = (x) => `
    <div class="tile setting">
      <div class="setting-head">
        <span class="tile-ic">${x.icon}</span>
        <div><div class="tile-t">${esc(x.label)}</div><div class="tile-d">${esc(x.desc)}</div></div>
      </div>
      ${x.toggle
        ? `<div class="switch"><span class="small muted">Off / On</span><input type="checkbox" name="${x.k}" ${Number(s[x.k]) === 1 ? 'checked' : ''}></div>`
        : `<input name="${x.k}" type="number" min="${x.min ?? 0}" ${x.max ? `max="${x.max}"` : ''} value="${esc(s[x.k] ?? '')}">`}
    </div>`;
  const thisYear = Number(slDate(0).slice(0, 4));
  $('#main').innerHTML = `
  <div class="page-head"><h2>System settings</h2></div>
  <form id="sf">
    ${groups.map((g) => `
      <div class="sec-title">${esc(g.title)}</div>
      ${g.note ? `<p class="muted small" style="margin:-4px 2px 10px">${esc(g.note)}</p>` : ''}
      <div class="tiles tiles-settings">${g.tiles.map(tileHtml).join('')}</div>`).join('')}
    <div class="savebar"><span class="muted small">Changes apply right after saving.</span><button class="btn">Save settings</button></div>
  </form>
  <div class="sec-title" style="margin-top:28px">Sri Lanka holidays</div>
  <p class="muted small" style="margin:-4px 2px 12px">Powers the Calendar for all users. Prefer <strong>auto-sync</strong> from open government-sourced data, or add/upload manually.</p>
  <div class="card" id="hol-panel">
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:flex-end">
      <div style="min-width:100px">
        <label>Year</label>
        <input type="number" id="hol-year" min="2020" max="2035" value="${thisYear}" style="width:110px">
      </div>
      <button type="button" class="btn" id="hol-sync">Auto-sync year</button>
      <button type="button" class="btn ghost" id="hol-load">Refresh list</button>
      <button type="button" class="btn ghost" id="hol-add">+ Add holiday</button>
      <label class="btn ghost" style="cursor:pointer;margin:0">Upload JSON<input type="file" id="hol-file" accept="application/json,.json" hidden></label>
      <button type="button" class="btn ghost danger" id="hol-clear">Clear year</button>
    </div>
    <p class="muted small" style="margin-top:10px">Auto-sync fetches open-source Gazette-based data from <a href="https://github.com/Dilshan-H/srilanka-holidays" target="_blank" rel="noopener">srilanka-holidays</a> (no API key). You can also upload a JSON array or add rows one by one.</p>
    <div id="hol-years" class="muted small" style="margin-top:8px"></div>
    <div id="hol-list" style="margin-top:12px"></div>
  </div>`;
  $('#sf').onsubmit = (e) => {
    e.preventDefault();
    const d = fd(e.target);
    toggleKeys.forEach((k) => { d[k] = e.target.elements[k].checked ? 1 : 0; });
    withBtn($('.btn', e.target), async () => {
      await api('/api/admin/settings', 'PUT', d);
      toast('Settings saved', 'good');
    });
  };
  const holYear = () => String($('#hol-year').value || thisYear);
  const renderHolList = async () => {
    const y = holYear();
    $('#hol-list').innerHTML = loading();
    try {
      const data = await api('/api/admin/holidays?year=' + encodeURIComponent(y));
      holidaysCache = {};
      const years = data.years || [];
      $('#hol-years').textContent = years.length
        ? 'Loaded years: ' + years.map((r) => `${r.year} (${r.count})`).join(' · ')
        : 'No holidays in database yet.';
      const list = data.holidays || [];
      if (!list.length) {
        $('#hol-list').innerHTML = `<p class="muted">No holidays for ${esc(y)}. Use <strong>Auto-sync year</strong> or upload JSON.</p>`;
        return;
      }
      $('#hol-list').innerHTML = `<div class="list">${list.map((h) => `
        <div class="card item">
          <div class="row"><strong>${esc(h.date)}</strong>
            <span class="cal-tags">${(h.types || []).map((t) => `<span class="htag ${HOLIDAY_TYPE_CLASS[t] || ''}">${HOLIDAY_TYPE_LABEL[t] || esc(t)}</span>`).join('')}</span>
          </div>
          <div class="small" style="margin-top:4px">${esc(h.name)}</div>
          <div class="muted small">Source: ${esc(h.source || '—')}</div>
          <div class="actions">
            <button class="btn ghost smallbtn" data-hedit="${h.id}">Edit</button>
            <button class="btn ghost danger smallbtn" data-hdel="${h.id}">Delete</button>
          </div>
        </div>`).join('')}</div>`;
      $$('[data-hdel]').forEach((b) => b.onclick = async () => {
        if (!(await confirmBox('Delete holiday', 'Remove this holiday from the calendar?', 'Delete'))) return;
        try {
          await api('/api/admin/holidays/' + b.dataset.hdel, 'DELETE');
          toast('Deleted', 'good');
          renderHolList();
        } catch (err) { toast(err.message, 'err'); }
      });
      $$('[data-hedit]').forEach((b) => {
        const h = list.find((x) => String(x.id) === b.dataset.hedit);
        if (h) b.onclick = () => holidayForm(h, renderHolList);
      });
    } catch (err) {
      $('#hol-list').innerHTML = `<p class="muted">${esc(err.message)}</p>
        <p class="muted small">If the table is missing, run the <code>holidays</code> CREATE TABLE from schema.sql in the D1 Console.</p>`;
    }
  };
  $('#hol-load').onclick = () => renderHolList();
  $('#hol-year').onchange = () => renderHolList();
  $('#hol-sync').onclick = async () => {
    const y = holYear();
    if (!(await confirmBox('Auto-sync holidays', `Fetch open-source Sri Lanka holidays for ${y} and merge into the database? Matching date+name rows are updated.`, 'Sync'))) return;
    withBtn($('#hol-sync'), async () => {
      const r = await api('/api/admin/holidays/sync', 'POST', { year: Number(y) });
      toast(`Synced ${r.written || 0} holidays for ${y}`, 'good');
      renderHolList();
    });
  };
  $('#hol-clear').onclick = async () => {
    const y = holYear();
    if (!(await confirmBox('Clear year', `Delete ALL holidays for ${y}? This cannot be undone.`, 'Clear'))) return;
    try {
      const r = await api('/api/admin/holidays?year=' + encodeURIComponent(y), 'DELETE');
      toast(`Removed ${r.removed || 0}`, 'good');
      renderHolList();
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#hol-add').onclick = () => holidayForm({ date: `${holYear()}-01-01`, name: '', types: ['public'] }, renderHolList);
  $('#hol-file').onchange = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const holidays = Array.isArray(parsed) ? parsed : (parsed.holidays || parsed.items || []);
      if (!Array.isArray(holidays) || !holidays.length) throw new Error('JSON must be an array of holidays, or { holidays: [...] }.');
      const r = await api('/api/admin/holidays/import', 'POST', { holidays, source: 'import' });
      toast(`Imported ${r.written || 0} holidays`, 'good');
      renderHolList();
    } catch (err) { toast(err.message || 'Import failed', 'err'); }
  };
  renderHolList();
}

function holidayForm(h, onDone) {
  const types = h.types || [];
  const chk = (t) => types.includes(t) ? 'checked' : '';
  modal(`<h3>${h.id ? 'Edit holiday' : 'Add holiday'}</h3>
  <form id="hf">
    <label>Date</label><input name="date" type="date" value="${esc(h.date || '')}" required>
    <label>Name</label><input name="name" maxlength="200" value="${esc(h.name || '')}" required>
    <label>Types</label>
    <div class="daybtns" style="margin-bottom:12px">
      <label class="daychip"><input type="checkbox" name="types" value="public" ${chk('public')}><span>Public</span></label>
      <label class="daychip"><input type="checkbox" name="types" value="bank" ${chk('bank')}><span>Bank</span></label>
      <label class="daychip"><input type="checkbox" name="types" value="mercantile" ${chk('mercantile')}><span>Mercantile</span></label>
      <label class="daychip"><input type="checkbox" name="types" value="poya" ${chk('poya')}><span>Poya</span></label>
    </div>
    <button class="btn block">${h.id ? 'Save' : 'Add'}</button>
  </form>`, (sheet, close) => {
    $('#hf', sheet).onsubmit = (e) => {
      e.preventDefault();
      const date = $('[name=date]', sheet).value;
      const name = $('[name=name]', sheet).value.trim();
      const typesSel = $$('input[name=types]:checked', sheet).map((x) => x.value);
      withBtn($('.btn', sheet), async () => {
        if (h.id) await api('/api/admin/holidays/' + h.id, 'PUT', { date, name, types: typesSel });
        else await api('/api/admin/holidays', 'POST', { date, name, types: typesSel });
        toast(h.id ? 'Updated' : 'Added', 'good');
        close();
        if (onDone) onDone();
      });
    };
  });
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const d = await api('/api/auth/me');
    me = d.user;
    shell('Email Scheduler', me.display_name);
    curPage = 'home'; navDepth = 0;
    try { history.replaceState({ page: 'home', depth: 0 }, ''); } catch { /* ignore */ }
    go('home', { fromPop: true });
  } catch {
    renderAuth();
  }
}
boot();

/* ---------- PWA install banner (mobile + desktop, incl. Samsung) ---------- */
let deferredPrompt = null;
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isSamsung = () => /SamsungBrowser/i.test(navigator.userAgent);
const isMobile = () => /android|iphone|ipad|ipod|mobile|SamsungBrowser/i.test(navigator.userAgent) || window.innerWidth < 768;
const pwaDismissed = () => {
  try {
    const v = localStorage.getItem('pwa_dismiss');
    if (!v) return false;
    // Re-show after 3 days
    if (v === '1') return true;
    const t = Number(v);
    if (Number.isFinite(t) && Date.now() - t < 3 * 864e5) return true;
    return false;
  } catch { return false; }
};
const setPwaDismissed = () => {
  try { localStorage.setItem('pwa_dismiss', String(Date.now())); } catch { /* ignore */ }
};

function hidePwaBanner() {
  const el = $('#pwa-banner');
  if (el) {
    el.classList.add('pwa-hide');
    setTimeout(() => el.remove(), 280);
  }
}

function showPwaBanner(mode, force = false) {
  // mode: install | ios | samsung | manual
  if (isStandalone()) return;
  if (!force && (pwaDismissed() || $('#pwa-banner'))) return;
  if ($('#pwa-banner')) hidePwaBanner();

  let title = 'Install this app';
  let body = 'Open the browser menu and choose <strong>Add page to → Home screen</strong> (or Install app).';
  if (mode === 'ios') {
    title = 'Install Email Scheduler';
    body = 'Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.';
  } else if (mode === 'samsung') {
    title = 'Add to Home screen';
    body = 'Samsung Internet: tap the <strong>menu ☰</strong> → <strong>Add page to</strong> → <strong>Home screen</strong>.';
  } else if (mode === 'install') {
    body = 'Add Email Scheduler to your home screen for a faster, app-like experience.';
  } else if (mode === 'manual') {
    body = 'Browser menu → <strong>Install app</strong> or <strong>Add to Home screen</strong>.';
  }

  const canNative = mode === 'install' && !!deferredPrompt;
  const actions = canNative
    ? `<button type="button" class="btn pwa-install-btn" id="pwa-install">Install</button>
       <button type="button" class="btn ghost pwa-later-btn" id="pwa-later">Not now</button>`
    : `<button type="button" class="btn pwa-install-btn" id="pwa-gotit">Got it</button>
       <button type="button" class="btn ghost pwa-later-btn" id="pwa-later">Not now</button>`;

  const bar = document.createElement('div');
  bar.id = 'pwa-banner';
  bar.className = 'pwa-banner';
  bar.innerHTML = `
    <div class="pwa-banner-inner">
      <div class="pwa-icon">${LOGO}</div>
      <div class="pwa-text">
        <strong>${title}</strong>
        <span>${body}</span>
      </div>
      <div class="pwa-actions">${actions}</div>
    </div>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('pwa-show'));

  const later = () => { setPwaDismissed(); hidePwaBanner(); };
  const laterBtn = $('#pwa-later', bar);
  if (laterBtn) laterBtn.onclick = later;
  const got = $('#pwa-gotit', bar);
  if (got) got.onclick = later;
  const inst = $('#pwa-install', bar);
  if (inst) {
    inst.onclick = async () => {
      if (!deferredPrompt) {
        toast('Use browser menu → Add to Home screen', 'good');
        return;
      }
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      setPwaDismissed();
      hidePwaBanner();
      if (choice && choice.outcome === 'accepted') toast('App installed!', 'good');
    };
  }
}

function maybeShowPwaBanner() {
  if (isStandalone() || pwaDismissed()) return;
  // Always show on mobile; Samsung often has no beforeinstallprompt
  setTimeout(() => {
    if (isStandalone() || pwaDismissed() || $('#pwa-banner')) return;
    if (deferredPrompt) showPwaBanner('install');
    else if (isIos()) showPwaBanner('ios');
    else if (isSamsung() || isMobile()) showPwaBanner(isSamsung() ? 'samsung' : 'manual');
  }, 1000);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(() => {
    // SW ready helps some browsers (incl. Samsung) treat the site as installable
  }).catch(() => {});
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!pwaDismissed() && !isStandalone()) showPwaBanner('install');
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  setPwaDismissed();
  hidePwaBanner();
  toast('Email Scheduler installed!', 'good');
});
maybeShowPwaBanner();

/* ---------- back button (phone gesture / browser) + password show/hide ---------- */
window.addEventListener('popstate', (e) => {
  if (ignorePop) { ignorePop = false; return; }
  const open = $$('.overlay');
  if (open.length) { open.forEach((o) => o._close && o._close(true)); return; }
  if (!me) return;
  const st = e.state || {};
  navDepth = st.depth || 0;
  go(st.page || 'home', { fromPop: true });
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pw]');
  if (!b) return;
  const i = b.previousElementSibling;
  const show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  b.textContent = show ? 'Hide' : 'Show';
});
