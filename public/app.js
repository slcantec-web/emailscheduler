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
  back: 'M15 18l-6-6 6-6',
};
const ic = (n) => `<svg class="icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[n] || ''}"/></svg>`;
const LOGO = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';

let me = null, mySettings = {}, busyNav = 0;

/* ---------- navigation state (back button + phone back gesture) ---------- */
const TOP = ['home', 'send', 'schedules', 'contacts', 'more'];
const PARENT = { history: 'more', templates: 'more', profile: 'more', admin: 'more', campaigns: 'more', settings: 'more' };
const TITLES = { home: 'Email Scheduler', send: 'Send email', schedules: 'Schedules', contacts: 'Contacts', more: 'More', history: 'Email history', templates: 'Templates', profile: 'Profile', admin: 'Users', campaigns: 'Campaigns', settings: 'Settings' };
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
function modal(html, ready) {
  const o = document.createElement('div'); o.className = 'overlay';
  o.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div><button type="button" class="sheet-x" aria-label="Close">&times;</button>${html}</div>`;
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

function authGo(view, extra, animate = true) {
  const b = $('#authbody');
  if (!b || authBusy) return;
  const dir = (view === 'login' || (authView === 'signup' && view === 'login')) ? 'left' : 'right';
  const stage = $('#auth-stage', b) || b;
  const panel = $('#auth-panel', b);

  const mount = () => {
    b.innerHTML = `${authTabsHtml(view)}
      <div id="auth-stage" class="auth-stage">
        <div id="auth-panel" class="auth-panel auth-in auth-in-${dir}">${panelHtmlFor(view, extra)}</div>
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
  panel.classList.add('auth-out', dir === 'left' ? 'auth-out-left' : 'auth-out-right');
  /* Match CSS authOut duration (160ms desktop / ~120ms touch) */
  const outMs = (window.matchMedia && window.matchMedia('(hover:none) and (pointer:coarse)').matches) ? 130 : 170;
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
    { t: 'Tools', items: [{ id: 'history', label: 'History', icon: 'list' }, { id: 'templates', label: 'Templates', icon: 'file' }] },
    { t: 'Account', items: [{ id: 'profile', label: 'Profile', icon: 'user' }, { id: 'logout', label: 'Log out', icon: 'logout' }] },
  ];
  if (isAdmin) groups.splice(2, 0, { t: 'Admin', items: [{ id: 'admin', label: 'Users', icon: 'shield' }, { id: 'campaigns', label: 'Campaigns', icon: 'mega' }, { id: 'settings', label: 'Settings', icon: 'settings' }] });
  $('#bnav').innerHTML = nav.map((n) => `<button data-nav="${n.id}">${ic(n.icon)}<span>${n.label}</span></button>`).join('');
  $('#side').innerHTML = groups.map((g) => `<div class="sec">${g.t}</div>` + g.items.map((n) => `<a href="#" class="${n.id === 'logout' ? 'logout' : ''}" data-nav="${n.id}">${ic(n.icon)}${n.label}</a>`).join('')).join('');
  $$('[data-nav]').forEach((el) => el.onclick = (e) => { e.preventDefault(); go(el.dataset.nav); });
  $('#avatar').onclick = () => go('profile');
  $('#back').onclick = goBack;
}
function setNav(id) {
  const moreIds = ['history', 'templates', 'profile', 'admin', 'campaigns', 'settings'];
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
  /* The datalist id must NOT be "clist": app.css styles `.main #clist` as the contacts-page grid,
     which forced this datalist to render as visible page content. */
  $('#main').innerHTML = `
  <div class="card"><h3>Send email now</h3>
  <form id="f">
    <label>To</label>
    <input name="recipient" type="email" list="contact-options" placeholder="friend@example.com" required>
    <datalist id="contact-options">${contacts.map((c) => `<option value="${esc(c.email)}">${esc(c.name)}</option>`).join('')}</datalist>
    <label>Recipient name (optional)</label><input name="recipient_name" maxlength="80" placeholder="For {name} variable">
    <label>Subject</label><input name="subject" maxlength="200" placeholder="Subject line" required>
    <label>Message</label><textarea name="message" rows="6" maxlength="5000" placeholder="You can use {name}, {sender}, {year}" required></textarea>
    <label>From name (optional)</label><input name="sender_name" maxlength="60" placeholder="${esc(me.sender_name || me.display_name || '')}">
    <label class="check"><input type="checkbox" name="append_signature" value="1" checked> Append signature</label>
    <button class="btn block" style="margin-top:12px">Send now</button>
  </form></div>`;
  const sf = $('#f');
  if (sendPrefill) { sf.recipient.value = sendPrefill.email; sf.recipient_name.value = sendPrefill.name || ''; sendPrefill = null; }
  sf.recipient.addEventListener('change', () => {
    const c = contacts.find((x) => x.email === sf.recipient.value.trim().toLowerCase());
    if (c && !sf.recipient_name.value) sf.recipient_name.value = c.name;
  });
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
  <div class="page-head"><h2>Schedules</h2><button class="btn right" id="add">+ New</button></div>
  <p class="muted small">${list.filter((s) => ['PENDING', 'ACTIVE'].includes(s.status)).length}${data.limit == null ? ' active (unlimited)' : ` / ${data.limit} active`}</p>
  <div id="slist">${list.length ? list.map((s) => `
    <div class="card item">
      <div class="row"><strong>${esc(TYPE_LABEL[s.schedule_type] || s.schedule_type)}</strong> ${statusBadge(s.status)}</div>
      <div class="muted small">${esc(s.recipient_name || '')} · ${esc(s.recipient_email)}</div>
      <div class="small" style="margin-top:4px"><strong>${esc(s.subject_template || 'Reminder')}</strong></div>
      <div class="muted small">${esc((s.message_template || '').slice(0, 80))}${(s.message_template || '').length > 80 ? '…' : ''}</div>
      <div class="muted small" style="margin-top:6px">${scheduleRuleLabel(s)} · Next: ${fmtDT(s.next_run_at)}</div>
      ${['PENDING', 'ACTIVE'].includes(s.status) ? `<div class="actions"><button class="btn ghost danger smallbtn" data-cancel="${s.id}">Cancel</button></div>` : ''}
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

const initials = (n) => (String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
async function pageContacts() {
  const data = await api('/api/contacts');
  const list = data.contacts || [];
  $('#main').innerHTML = `
  <div class="page-head"><div><h2>Contacts</h2><p class="muted small">${list.length} saved</p></div>
  <button class="btn right" id="add">+ Add</button></div>
  <div id="clist">${list.length ? list.map((c, i) => `
    <div class="card item contact">
      <div class="contact-main">
        <span class="avatar-sm">${esc(initials(c.name))}</span>
        <div class="contact-info">
          <strong>${esc(c.name)}</strong>
          <span class="muted small ellip">${esc(c.email)}</span>
          ${c.birthday || c.anniversary ? `<div class="contact-tags">${c.birthday ? `<span class="tag">🎂 ${esc(fmtMD(c.birthday))}</span>` : ''}${c.anniversary ? `<span class="tag">💍 ${esc(fmtMD(c.anniversary))}</span>` : ''}</div>` : ''}
        </div>
      </div>
      <div class="actions"><button class="btn smallbtn" data-send="${i}">Send email</button><button class="btn ghost danger smallbtn" data-del="${c.id}">Delete</button></div>
    </div>`).join('') : '<div class="card muted">No contacts yet. Tap + Add to save one.</div>'}</div>`;
  $('#add').onclick = () => contactForm();
  $$('[data-send]').forEach((b) => b.onclick = () => {
    const c = list[Number(b.dataset.send)];
    sendPrefill = { email: c.email, name: c.name };
    go('send', { push: true });
  });
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
  <div class="page-head"><h2>Email history</h2></div>
  <div class="list">${list.length ? list.map((l) => `
    <div class="card item">
      <div class="row"><strong>${esc(l.subject_preview || '(no subject)')}</strong> ${statusBadge(l.status)}</div>
      <div class="muted small">To: ${esc(l.recipient_email)} · ${esc(l.message_type)} · ${fmtDT(l.created_at)}</div>
      ${l.error_message ? `<div class="small" style="color:var(--bad)">${esc(l.error_message)}</div>` : ''}
    </div>`).join('') : '<div class="card muted">No emails yet.</div>'}</div>`;
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

async function pageMore() {
  const groups = [
    { title: 'Your account', items: [
      { id: 'history', label: 'Email history', desc: 'Everything you have sent', icon: 'list', tone: 'blue' },
      { id: 'templates', label: 'Templates', desc: 'Reusable messages', icon: 'file', tone: 'violet' },
      { id: 'profile', label: 'Profile', desc: 'Name, From name, password', icon: 'user', tone: 'green' },
    ] },
  ];
  if (me.role === 'ADMIN') {
    groups.push({ title: 'Admin', items: [
      { id: 'admin', label: 'Users', desc: 'Accounts and limits', icon: 'shield', tone: 'violet' },
      { id: 'campaigns', label: 'Campaigns', desc: 'Bulk email sends', icon: 'mega', tone: 'amber' },
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
  if (me.role !== 'ADMIN') return go('home');
  const data = await api('/api/admin/campaigns');
  const list = data.campaigns || [];
  $('#main').innerHTML = `
  <div class="page-head"><h2>Campaigns</h2><button class="btn right" id="add">+ New</button></div>
  <div class="list">${list.length ? list.map((c) => `
    <div class="card item">
      <div class="row"><strong>${esc(c.campaign_name)}</strong> ${statusBadge(c.status)}</div>
      <div class="muted small">${esc(c.subject)} · ${fmtDT(c.scheduled_at)}</div>
      <div class="small">Total ${c.total || 0} · Sent ${c.sent || 0} · Failed ${c.failed || 0} · Pending ${c.pending || 0}</div>
      ${['SCHEDULED', 'RUNNING'].includes(c.status) ? `<button class="btn ghost danger smallbtn" style="margin-top:8px" data-cancel="${c.id}">Cancel</button>` : ''}
    </div>`).join('') : '<div class="card muted">No campaigns yet.</div>'}</div>`;
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
  $('#main').innerHTML = `
  <div class="page-head"><h2>System settings</h2></div>
  <form id="sf">
    ${groups.map((g) => `
      <div class="sec-title">${esc(g.title)}</div>
      ${g.note ? `<p class="muted small" style="margin:-4px 2px 10px">${esc(g.note)}</p>` : ''}
      <div class="tiles tiles-settings">${g.tiles.map(tileHtml).join('')}</div>`).join('')}
    <div class="savebar"><span class="muted small">Changes apply right after saving.</span><button class="btn">Save settings</button></div>
  </form>`;
  $('#sf').onsubmit = (e) => {
    e.preventDefault();
    const d = fd(e.target);
    toggleKeys.forEach((k) => { d[k] = e.target.elements[k].checked ? 1 : 0; });
    withBtn($('.btn', e.target), async () => {
      await api('/api/admin/settings', 'PUT', d);
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
