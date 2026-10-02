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
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[n] || ''}"/></svg>`;
const LOGO = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';

let me = null, mySettings = {}, busyNav = 0;

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
function modal(html, ready) {
  const o = document.createElement('div'); o.className = 'overlay';
  o.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
  const close = () => o.remove();
  o.addEventListener('click', (e) => { if (e.target === o) close(); });
  document.body.append(o);
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
function scheduleRuleLabel(s) {
  const t = s.schedule_type, r = s.recurrence_rule, tm = s.send_time || '';
  if (t === 'ONE_TIME') return 'Once';
  if (t === 'DAILY') return `Every day at ${tm}`;
  if (t === 'WEEKLY') return `Every ${WEEKDAYS[Number(r)] || r} at ${tm}`;
  if (t === 'MONTHLY') return `Day ${r} each month at ${tm}`;
  if (t === 'YEARLY' || t === 'BIRTHDAY' || t === 'ANNIVERSARY') return `${r || ''} each year at ${tm}`.trim();
  return tm ? `at ${tm}` : '';
}
const loading = () => '<div class="splash" style="min-height:40dvh"><div class="spinner"></div></div>';

/* ---------- auth screens ---------- */
function renderAuth() {
  $('#app').innerHTML = `
  <div class="authwrap">
    <div class="authtop">
      <div class="logo">${LOGO}</div>
      <h1>Email Scheduler</h1>
      <p class="tagline">Your personal email reminder &amp; greeting assistant</p>
      <div class="auth-features">
        <div class="af"><span class="af-ic">✉️</span><div><strong>Send now</strong><small>Email anyone in seconds</small></div></div>
        <div class="af"><span class="af-ic">⏰</span><div><strong>Schedule</strong><small>One-time, daily, weekly, monthly</small></div></div>
        <div class="af"><span class="af-ic">🎂</span><div><strong>Greetings</strong><small>Birthdays &amp; anniversaries</small></div></div>
        <div class="af"><span class="af-ic">📱</span><div><strong>Install app</strong><small>Works on phone &amp; PC (PWA)</small></div></div>
      </div>
      <p class="auth-howto">Sign in to manage contacts, templates, and reminders. All times use <strong>Sri Lanka (UTC+5:30)</strong>. After login, use <em>Add to Home Screen</em> (mobile) or the install icon in your browser (PC) for a full app experience.</p>
    </div>
    <div class="authcard"><div id="authbody"></div></div>
  </div>`;
  authLogin();
}
const emailField = (v = '') => `<label>Email address</label><input name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(v)}" required>`;
function authLogin() {
  const b = $('#authbody');
  b.innerHTML = `
  <div class="tabs"><button class="on">Log in</button><button id="to-reg">Sign up</button></div>
  <p class="auth-lead">Welcome back. Enter your email and password to continue.</p>
  <form id="f">
    ${emailField()}
    <label>Password</label><input name="password" type="password" autocomplete="current-password" required>
    <button class="btn block">Log in</button>
  </form>
  <div class="row" style="justify-content:center;margin-top:12px"><button class="linkbtn" id="forgot">Forgot password?</button></div>
  <div class="auth-foot muted small">New here? Tap <strong>Sign up</strong> — we’ll send a one-time code to your email.</div>`;
  $('#to-reg').onclick = authRegister1; $('#forgot').onclick = authForgot1;
  $('#f').onsubmit = (e) => { e.preventDefault(); withBtn($('.btn', b), async () => { const d = await api('/api/auth/login', 'POST', fd(e.target)); me = d.user; boot(); }); };
}
function authRegister1() {
  const b = $('#authbody');
  b.innerHTML = `
  <div class="tabs"><button id="to-login">Log in</button><button class="on">Sign up</button></div>
  <p class="auth-lead">Create a free account. We’ll send a 6-digit code to verify your email.</p>
  <form id="f">
    ${emailField()}
    <p class="hint">Use an email you can access — the code arrives in a few seconds.</p>
    <button class="btn block">Send verification code</button>
  </form>`;
  $('#to-login').onclick = authLogin;
  $('#f').onsubmit = (e) => { e.preventDefault(); const d = fd(e.target); withBtn($('.btn', b), async () => { await api('/api/auth/register/request', 'POST', d); authOtp(d.email, 'register'); }); };
}
function authOtp(email, mode) {
  const b = $('#authbody');
  b.innerHTML = `<h3 style="font-size:20px">Enter the code</h3><p class="muted">Sent to ${esc(email)}</p>
  <form id="f"><input class="otp" name="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" required>
  ${mode === 'register' ? '<label>Your name</label><input name="display_name" autocomplete="name" maxlength="60" required><label>Password</label><input name="password" type="password" minlength="8" autocomplete="new-password" required><p class="hint">At least 8 characters.</p>' : ''}
  ${mode === 'reset' ? '<label>New password</label><input name="password" type="password" minlength="8" autocomplete="new-password" required><p class="hint">At least 8 characters.</p>' : ''}
  <button class="btn block">${mode === 'reset' ? 'Reset password' : 'Create account'}</button></form>
  <div class="row" style="justify-content:space-between;margin-top:8px"><button class="linkbtn" id="back">← Back</button></div>`;
  $('#back').onclick = authLogin;
  $('#f').onsubmit = (e) => {
    e.preventDefault(); const d = { email, ...fd(e.target) };
    withBtn($('.btn', b), async () => {
      if (mode === 'register') { const r = await api('/api/auth/register/verify', 'POST', d); me = r.user; boot(); }
      else { await api('/api/auth/password/reset', 'POST', d); toast('Password updated. Please log in.', 'good'); authLogin(); }
    });
  };
}
function authForgot1() {
  const b = $('#authbody');
  b.innerHTML = `<h3 style="font-size:20px">Reset password</h3><p class="muted">We'll email you a code.</p>
  <form id="f">${emailField()}<button class="btn block">Send code</button></form>
  <div class="row" style="margin-top:8px"><button class="linkbtn" id="back">← Back</button></div>`;
  $('#back').onclick = authLogin;
  $('#f').onsubmit = (e) => { e.preventDefault(); const d = fd(e.target); withBtn($('.btn', b), async () => { await api('/api/auth/password/forgot', 'POST', d); toast('If that email exists, a code was sent.', 'good'); authOtp(d.email, 'reset'); }); };
}

/* ---------- shell ---------- */
function shell(title, sub) {
  const isAdmin = me && me.role === 'ADMIN';
  $('#app').innerHTML = `
  <header class="topbar"><div class="logo">${LOGO}</div><div><h1>${esc(title)}</h1>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>
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
  const sideExtra = [
    { id: 'history', label: 'History', icon: 'list' },
    { id: 'templates', label: 'Templates', icon: 'file' },
    { id: 'profile', label: 'Profile', icon: 'user' },
  ];
  if (isAdmin) sideExtra.push({ id: 'admin', label: 'Admin', icon: 'shield' }, { id: 'campaigns', label: 'Campaigns', icon: 'mega' }, { id: 'settings', label: 'Settings', icon: 'settings' });
  sideExtra.push({ id: 'logout', label: 'Log out', icon: 'logout' });
  $('#bnav').innerHTML = nav.map((n) => `<button data-nav="${n.id}">${ic(n.icon)}<span>${n.label}</span></button>`).join('');
  $('#side').innerHTML = `<div class="sec">Menu</div>` + [...nav.slice(0, 4), ...sideExtra].map((n) => `<a href="#" data-nav="${n.id}">${ic(n.icon)}${n.label}</a>`).join('');
  $$('[data-nav]').forEach((el) => el.onclick = (e) => { e.preventDefault(); go(el.dataset.nav); });
  $('#avatar').onclick = () => go('profile');
}
function setNav(id) {
  $$('#bnav button, #side a').forEach((el) => el.classList.toggle('on', el.dataset.nav === id || (id === 'history' && el.dataset.nav === 'more')));
}
async function go(id) {
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
      <button class="btn ghost" data-go="contacts">${ic('users')} Contacts</button>
    </div>
  </div>`;
  $$('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
}

async function pageSend() {
  const contacts = (await api('/api/contacts')).contacts || [];
  $('#main').innerHTML = `
  <div class="card"><h3>Send email now</h3>
  <form id="f">
    <label>To</label>
    <input name="recipient" type="email" list="clist" placeholder="friend@example.com" required>
    <datalist id="clist">${contacts.map((c) => `<option value="${esc(c.email)}">${esc(c.name)}</option>`).join('')}</datalist>
    <label>Recipient name (optional)</label><input name="recipient_name" maxlength="80" placeholder="For {name} variable">
    <label>Subject</label><input name="subject" maxlength="200" placeholder="Subject line" required>
    <label>Message</label><textarea name="message" rows="6" maxlength="5000" placeholder="You can use {name}, {sender}, {year}" required></textarea>
    <label>From name (optional)</label><input name="sender_name" maxlength="60" placeholder="${esc(me.sender_name || me.display_name || '')}">
    <label class="check"><input type="checkbox" name="append_signature" value="1" checked> Append signature</label>
    <button class="btn block" style="margin-top:12px">Send now</button>
  </form></div>`;
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const d = fd(e.target);
    d.append_signature = !!e.target.append_signature.checked;
    withBtn($('.btn', e.target), async () => {
      await api('/api/email/send', 'POST', d);
      toast('Email sent!', 'good');
      e.target.reset();
    });
  };
}

async function pageSchedules() {
  const data = await api('/api/schedules');
  const list = data.schedules || [];
  $('#main').innerHTML = `
  <div class="row" style="margin-bottom:12px"><h2 style="font-size:18px">Schedules</h2>
  <button class="btn right" id="add">+ New</button></div>
  <p class="muted small">${list.filter((s) => ['PENDING', 'ACTIVE'].includes(s.status)).length}${data.limit == null ? ' active (unlimited)' : ` / ${data.limit} active`}</p>
  <div id="slist">${list.length ? list.map((s) => `
    <div class="card item">
      <div class="row"><strong>${esc(TYPE_LABEL[s.schedule_type] || s.schedule_type)}</strong> ${statusBadge(s.status)}</div>
      <div class="muted small">${esc(s.recipient_name || '')} · ${esc(s.recipient_email)}</div>
      <div class="small" style="margin-top:4px"><strong>${esc(s.subject_template || 'Reminder')}</strong></div>
      <div class="muted small">${esc((s.message_template || '').slice(0, 80))}${(s.message_template || '').length > 80 ? '…' : ''}</div>
      <div class="muted small" style="margin-top:6px">${scheduleRuleLabel(s)} · Next: ${fmtDT(s.next_run_at)}</div>
      ${['PENDING', 'ACTIVE'].includes(s.status) ? `<div class="row" style="margin-top:8px"><button class="btn ghost danger smallbtn" data-cancel="${s.id}">Cancel</button></div>` : ''}
    </div>`).join('') : '<div class="card muted">No schedules yet.</div>'}</div>`;
  $('#add').onclick = () => scheduleForm();
  $$('[data-cancel]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Cancel schedule', 'This schedule will be cancelled.', 'Cancel it'))) return;
    try { await api('/api/schedules/' + b.dataset.cancel, 'DELETE'); toast('Cancelled', 'good'); pageSchedules(); } catch (e) { toast(e.message, 'err'); }
  });
}
function scheduleForm() {
  modal(`<h3>New schedule</h3>
  <form id="sf">
    <label>Repeat</label>
    <select name="schedule_type" id="stype">
      <option value="ONE_TIME">One-time (specific date)</option>
      <option value="DAILY">Every day</option>
      <option value="WEEKLY">Every week</option>
      <option value="MONTHLY">Every month</option>
      <option value="YEARLY">Every year</option>
      <option value="BIRTHDAY">Birthday (yearly)</option>
      <option value="ANNIVERSARY">Anniversary (yearly)</option>
    </select>
    <div id="when-fields"></div>
    <label>Recipient email</label><input name="recipient" type="email" required>
    <label>Recipient name</label><input name="recipient_name" maxlength="80">
    <label>Subject</label><input name="subject" maxlength="200" value="Reminder" required>
    <label>Message</label><textarea name="message" rows="4" required placeholder="Hi {name}! ..."></textarea>
    <label>Time (Colombo, Sri Lanka UTC+5:30)</label><input name="time" type="time" value="08:00" required>
    <p class="hint">All times use Asia/Colombo (+5:30).</p>
    <label>From name</label><input name="sender_name" maxlength="60" placeholder="${esc(me.sender_name || '')}">
    <button class="btn block" style="margin-top:12px">Schedule</button>
  </form>`, (sheet, close) => {
    const when = $('#when-fields', sheet);
    const renderWhen = () => {
      const t = $('#stype', sheet).value;
      if (t === 'ONE_TIME') {
        when.innerHTML = `<label>Date</label><input name="date" type="date" value="${slDate(1)}" required>
          <p class="hint">Sends once on this date at the time below.</p>`;
      } else if (t === 'DAILY') {
        when.innerHTML = `<p class="hint">Sends every day at the time below.</p><input type="hidden" name="date" value="">`;
      } else if (t === 'WEEKLY') {
        when.innerHTML = `<label>Day of week</label>
          <select name="weekday">${WEEKDAYS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select>
          <p class="hint">Sends every week on this day.</p>`;
      } else if (t === 'MONTHLY') {
        when.innerHTML = `<label>Day of month</label>
          <select name="day_of_month">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select>
          <p class="hint">Sends on this day each month (shorter months use the last day).</p>`;
      } else {
        when.innerHTML = `<label>Date each year</label><input name="date" type="date" value="${slDate(0)}" required>
          <p class="hint">Only month & day are used — repeats every year.</p>`;
      }
    };
    $('#stype', sheet).onchange = renderWhen;
    renderWhen();
    $('#sf', sheet).onsubmit = (e) => {
      e.preventDefault();
      const d = fd(e.target);
      if (['YEARLY', 'BIRTHDAY', 'ANNIVERSARY'].includes(d.schedule_type) && d.date && d.date.length === 10) {
        d.date = d.date.slice(5); // YYYY-MM-DD → MM-DD
      }
      if (d.weekday != null) d.weekday = Number(d.weekday);
      if (d.day_of_month != null) d.day_of_month = Number(d.day_of_month);
      withBtn($('.btn', e.target), async () => {
        await api('/api/schedules', 'POST', d);
        toast('Scheduled!', 'good');
        close();
        pageSchedules();
      });
    };
  });
}

async function pageContacts() {
  const data = await api('/api/contacts');
  const list = data.contacts || [];
  $('#main').innerHTML = `
  <div class="row" style="margin-bottom:12px"><h2 style="font-size:18px">Contacts</h2>
  <button class="btn right" id="add">+ Add</button></div>
  <div id="clist">${list.length ? list.map((c) => `
    <div class="card item">
      <div class="row"><strong>${esc(c.name)}</strong>
        <button class="linkbtn right" data-del="${c.id}">Delete</button></div>
      <div class="muted small">${esc(c.email)}</div>
      ${c.birthday || c.anniversary ? `<div class="muted small" style="margin-top:4px">${c.birthday ? '🎂 ' + esc(fmtMD(c.birthday)) : ''} ${c.anniversary ? '💍 ' + esc(fmtMD(c.anniversary)) : ''}</div>` : ''}
    </div>`).join('') : '<div class="card muted">No contacts yet.</div>'}</div>`;
  $('#add').onclick = () => contactForm();
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Delete contact', 'Remove this contact?', 'Delete'))) return;
    try { await api('/api/contacts/' + b.dataset.del, 'DELETE'); toast('Deleted', 'good'); pageContacts(); } catch (e) { toast(e.message, 'err'); }
  });
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
  <h2 style="font-size:18px;margin-bottom:12px">Email history</h2>
  ${list.length ? list.map((l) => `
    <div class="card item">
      <div class="row"><strong>${esc(l.subject_preview || '(no subject)')}</strong> ${statusBadge(l.status)}</div>
      <div class="muted small">To: ${esc(l.recipient_email)} · ${esc(l.message_type)} · ${fmtDT(l.created_at)}</div>
      ${l.error_message ? `<div class="small" style="color:var(--bad)">${esc(l.error_message)}</div>` : ''}
    </div>`).join('') : '<div class="card muted">No emails yet.</div>'}`;
}

async function pageTemplates() {
  const data = await api('/api/templates');
  const list = data.templates || [];
  $('#main').innerHTML = `
  <div class="row" style="margin-bottom:12px"><h2 style="font-size:18px">Templates</h2>
  <button class="btn right" id="add">+ New</button></div>
  ${list.length ? list.map((t) => `
    <div class="card item">
      <div class="row"><strong>${esc(t.template_name)}</strong>
        <button class="linkbtn right" data-del="${t.id}">Delete</button></div>
      <div class="muted small">${esc(t.subject_body || '')}</div>
      <div class="small">${esc((t.message_body || '').slice(0, 100))}</div>
    </div>`).join('') : '<div class="card muted">No templates yet.</div>'}`;
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
      <label>Current password</label><input name="current_password" type="password" required>
      <label>New password</label><input name="new_password" type="password" minlength="8" required>
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

async function pageMore() {
  const items = [
    { id: 'history', label: 'Email history', icon: 'list' },
    { id: 'templates', label: 'Templates', icon: 'file' },
    { id: 'profile', label: 'Profile & password', icon: 'user' },
  ];
  if (me.role === 'ADMIN') {
    items.push({ id: 'admin', label: 'Users (admin)', icon: 'shield' });
    items.push({ id: 'campaigns', label: 'Campaigns', icon: 'mega' });
    items.push({ id: 'settings', label: 'System settings', icon: 'settings' });
  }
  items.push({ id: 'logout', label: 'Log out', icon: 'logout' });
  $('#main').innerHTML = `<div class="card">${items.map((i) => `<a href="#" class="menuitem" data-nav="${i.id}">${ic(i.icon)} ${esc(i.label)}</a>`).join('')}</div>`;
  $$('[data-nav]').forEach((el) => el.onclick = (e) => { e.preventDefault(); go(el.dataset.nav); });
}

async function pageAdmin() {
  if (me.role !== 'ADMIN') return go('home');
  const data = await api('/api/admin/users');
  const list = data.users || [];
  const defaultLimit = data.default_schedule_limit ?? 5;
  $('#main').innerHTML = `
  <h2 style="font-size:18px;margin-bottom:4px">Users</h2>
  <p class="muted small" style="margin-bottom:12px">Default schedule limit: ${defaultLimit}. Times use Sri Lanka (UTC+5:30).</p>
  ${list.length ? list.map((u) => {
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
      ${u.id !== me.id ? `<div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap">
        ${u.status === 'ACTIVE'
          ? `<button class="btn ghost smallbtn" data-st="${u.id}:SUSPENDED">Deactivate</button>`
          : `<button class="btn smallbtn" data-st="${u.id}:ACTIVE">Activate</button>`}
        ${!isAdm ? `<button class="btn ghost smallbtn" data-limit="${u.id}" data-cur="${u.schedule_limit != null ? u.schedule_limit : ''}">Schedule limit</button>` : ''}
        ${!isAdm ? `<button class="btn ghost danger smallbtn" data-del="${u.id}">Remove</button>` : ''}
      </div>` : '<p class="muted small" style="margin-top:8px">This is you (admin — no limits)</p>'}
    </div>`;
  }).join('') : '<div class="card muted">No users yet.</div>'}`;
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
  if (me.role !== 'ADMIN') return go('home');
  const data = await api('/api/admin/campaigns');
  const list = data.campaigns || [];
  $('#main').innerHTML = `
  <div class="row" style="margin-bottom:12px"><h2 style="font-size:18px">Campaigns</h2>
  <button class="btn right" id="add">+ New</button></div>
  ${list.length ? list.map((c) => `
    <div class="card item">
      <div class="row"><strong>${esc(c.campaign_name)}</strong> ${statusBadge(c.status)}</div>
      <div class="muted small">${esc(c.subject)} · ${fmtDT(c.scheduled_at)}</div>
      <div class="small">Total ${c.total || 0} · Sent ${c.sent || 0} · Failed ${c.failed || 0} · Pending ${c.pending || 0}</div>
      ${['SCHEDULED', 'RUNNING'].includes(c.status) ? `<button class="btn ghost danger smallbtn" style="margin-top:8px" data-cancel="${c.id}">Cancel</button>` : ''}
    </div>`).join('') : '<div class="card muted">No campaigns yet.</div>'}`;
  $('#add').onclick = () => {
    modal(`<h3>New campaign</h3>
    <form id="cf">
      <label>Name</label><input name="campaign_name" required>
      <label>Subject</label><input name="subject" required>
      <label>Message</label><textarea name="message" rows="5" required></textarea>
      <label>Recipients (emails, one per line or comma)</label><textarea name="recipients" rows="4" required></textarea>
      <label>Date (optional, blank = send now)</label><input name="date" type="date">
      <label>Time (Colombo UTC+5:30)</label><input name="time" type="time" value="09:00">
      <button class="btn block" style="margin-top:12px">Create</button>
    </form>`, (sheet, close) => {
      $('#cf', sheet).onsubmit = (e) => {
        e.preventDefault();
        const d = fd(e.target);
        d.recipients = String(d.recipients || '').split(/[\s,;]+/).filter(Boolean);
        withBtn($('.btn', e.target), async () => {
          await api('/api/admin/campaigns', 'POST', d);
          toast('Campaign created', 'good'); close(); pageCampaigns();
        });
      };
    });
  };
  $$('[data-cancel]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Cancel campaign', 'Stop this campaign?', 'Cancel'))) return;
    try { await api('/api/admin/campaigns/' + b.dataset.cancel + '/cancel', 'POST', {}); pageCampaigns(); } catch (e) { toast(e.message, 'err'); }
  });
}

async function pageSettings() {
  if (me.role !== 'ADMIN') return go('home');
  const data = await api('/api/admin/settings');
  const s = data.settings || {};
  const fields = [
    ['max_user_scheduled_messages', 'Max active schedules per user'],
    ['max_daily_emails', 'Max emails per day (user)'],
    ['max_monthly_emails', 'Max emails per month (user)'],
    ['max_contacts', 'Max contacts per user'],
    ['max_bulk_recipients', 'Max bulk recipients'],
    ['otp_expiry_minutes', 'OTP expiry (minutes)'],
    ['registration_enabled', 'Registration enabled (0/1)'],
    ['allow_custom_sender_name', 'Allow custom From name (0/1)'],
    ['bulk_batch_size', 'Bulk batch size'],
  ];
  $('#main').innerHTML = `
  <div class="card"><h3>System settings</h3>
  <p class="muted small">These limits apply to <strong>normal users only</strong>. Admin accounts have no schedule, email, or contact limits.</p>
  <form id="sf">${fields.map(([k, label]) => `<label>${esc(label)}</label><input name="${k}" type="number" value="${s[k] ?? ''}">`).join('')}
  <button class="btn block" style="margin-top:12px">Save settings</button></form></div>`;
  $('#sf').onsubmit = (e) => {
    e.preventDefault();
    withBtn($('.btn', e.target), async () => {
      await api('/api/admin/settings', 'PUT', fd(e.target));
      toast('Settings saved', 'good');
    });
  };
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const d = await api('/api/auth/me');
    me = d.user;
    shell('Email Scheduler', me.display_name);
    go('home');
  } catch {
    renderAuth();
  }
}
boot();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
// PWA install hint (Chrome/Edge on PC & Android)
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});
window.__installPwa = async () => {
  if (!deferredPrompt) {
    toast('On mobile: browser menu → Add to Home Screen. On PC: use the install icon in the address bar.', 'good');
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
};
