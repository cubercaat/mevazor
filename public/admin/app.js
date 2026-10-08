import { $, esc, icon, toast, busy, initials } from '/shared/core.js';
import { initI18n, langButton, bindLangMenu } from '/shared/i18n.js';
import { COMMON } from '/shared/i18n-common.js';
import { ADMIN } from './i18n-admin.js';

initI18n({ key: 'mza_lang', entries: [...COMMON, ...ADMIN], defaultLang: 'uz' });
import { api, A, can, emptyState } from './common.js';
import * as core from './pages-core.js';
import * as mg from './pages-manage.js';

/* path, handler, permission, label, icon, group */
const PAGES = [
  ['/', core.dashboard, 'dashboard', 'Dashboard', 'grid', 'Overview'],
  ['/products', mg.products, 'products', 'Products', 'layers', 'Catalogue'],
  ['/categories', mg.categories, 'categories', 'Categories', 'tag', 'Catalogue'],
  ['/orders', core.orders, 'orders', 'Orders', 'box', 'Operations'],
  ['/customers', mg.customers, 'customers', 'Customers', 'users', 'Operations'],
  ['/sellers', mg.sellers, 'sellers', 'Sellers', 'store', 'Operations'],
  ['/couriers', mg.couriers, 'couriers', 'Couriers', 'truck', 'Operations'],
  ['/chats', core.chats, 'chats', 'Chats', 'chat', 'Community'],
  ['/reviews', mg.reviews, 'reviews', 'Reviews', 'star', 'Community'],
  ['/returns', mg.returns, 'returns', 'Returns', 'refresh', 'Community'],
  ['/promotions', mg.promotions, 'promotions', 'Promotions', 'gift', 'Growth'],
  ['/delivery', mg.delivery, 'delivery', 'Delivery', 'map', 'Growth'],
  ['/analytics', core.analytics, 'analytics', 'Analytics', 'chart', 'Growth'],
  ['/notifications', mg.notifications, '*', 'Notifications', 'bell', 'System'],
  ['/settings', mg.settings, '*', 'Settings', 'sliders', 'System'],
];
let cleanup = null;
let token = 0;
let cur = '/';

/* ----------------------------- login ----------------------------- */
function loginScreen(msg) {
  document.getElementById('root').innerHTML = `<div class="login-wrap"><div class="login-art"><div class="brand" style="padding:0"><img class="mark" src="/shared/logo-192.webp" alt="" width="34" height="34"><div>Mevazor<small>Admin console</small></div></div>
    <div><h1>Run the freshest fruit marketplace.</h1><p>Orders, sellers, couriers, returns and analytics in one calm workspace.</p></div><div style="color:#8B97B5;font-size:13px">© ${new Date().getFullYear()} Mevazor</div><div class="floaters">🍎🍊</div></div>
    <div class="login-form"><form id="lf" novalidate><div style="display:flex;justify-content:space-between;align-items:flex-start"><h2>Sign in</h2>${langButton()}</div><div><p class="muted" style="color:var(--muted);margin-top:4px">Staff only — admins, sellers and couriers</p></div>${msg ? `<div class="hint-box" style="background:var(--danger-soft);color:#8F2330">${esc(msg)}</div>` : ''}
      <div class="field"><label for="u">Email or phone</label><input class="input" id="u" autocomplete="username" autofocus></div><div class="field"><label for="p">Password</label><input class="input" id="p" type="password" autocomplete="current-password"></div>
      <button class="btn primary lg" type="submit">Sign in</button>
      <div class="roles"><b style="color:var(--ink)">Demo accounts</b>
        <button type="button" data-u="admin@mevazor.uz" data-p="Admin#2026"><span>Super admin</span><span>admin@mevazor.uz</span></button>
        <button type="button" data-u="moderator@mevazor.uz" data-p="Moder#2026"><span>Admin (limited)</span><span>moderator@mevazor.uz</span></button>
        <button type="button" data-u="samarqand@mevazor.uz" data-p="Seller#2026"><span>Seller</span><span>samarqand@mevazor.uz</span></button>
        <button type="button" data-u="courier1@mevazor.uz" data-p="Courier#2026"><span>Courier</span><span>courier1@mevazor.uz</span></button></div></form></div></div>`;
  document.querySelectorAll('.roles button').forEach((b) => (b.onclick = () => { $('#u').value = b.dataset.u; $('#p').value = b.dataset.p; }));
  $('#lf').onsubmit = (e) => {
    e.preventDefault();
    busy(e.currentTarget.querySelector('button[type=submit]'), async () => {
      const r = await api.post('/api/auth/login', { login: $('#u').value, password: $('#p').value });
      if (r.user.role === 'CUSTOMER') throw new Error('Customer accounts cannot access the admin panel');
      api.setToken(r.token);
      await boot();
    });
  };
}

/* ----------------------------- shell ----------------------------- */
async function counters() {
  try {
    const [n, s] = await Promise.all([api.get('/api/notifications'), A.meta.permissions.includes('orders') && A.user.role !== 'COURIER' ? api.get('/api/admin/orders?status=sent&limit=100').catch(() => []) : []]);
    A.unread = n.unread;
    A.awaiting = Array.isArray(s) ? s.length : 0;
    window.__badge?.();
  } catch { /* offline */ }
}

function shell() {
  const visible = PAGES.filter(([, , perm]) => perm === '*' || A.meta.permissions.includes(perm));
  let groups = '';
  let last = '';
  for (const [p, , , label, ic, g] of visible) {
    if (g !== last) { groups += `<div class="grp">${g}</div>`; last = g; }
    groups += `<a href="#${p}" data-p="${p}">${icon(ic, 19)}<span>${label}</span><span class="cnt hide" data-b="${p}"></span></a>`;
  }
  const roleLabel = { SUPER_ADMIN: 'Super admin', ADMIN: 'Administrator', SELLER: A.meta.seller?.store_name || 'Seller', COURIER: 'Courier' }[A.user.role];
  document.getElementById('root').innerHTML = `<div class="app"><aside class="side" id="side"><div class="brand"><img class="mark" src="/shared/logo-192.webp" alt="" width="34" height="34"><div>Mevazor<small>Admin console</small></div></div><nav>${groups}</nav>
      <div class="me"><span class="ava" id="meava">${esc(initials(A.user.name))}</span><div class="grow" style="flex:1;min-width:0"><b style="display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" id="mename">${esc(A.user.name)}</b><small>${esc(roleLabel)}</small></div><button class="ibtn" id="lo" title="Sign out" aria-label="Sign out" style="color:#A6B1C6">${icon('logout', 18)}</button></div></aside>
    <div class="main"><header class="top"><button class="ibtn menu-btn" id="mb" aria-label="Menu">${icon('menu')}</button><h1 id="ttl"></h1><div class="grow"></div>
      <div id="role-ctl"></div>${langButton()}<a class="ibtn" href="#/notifications" aria-label="Notifications" id="nb">${icon('bell', 20)}<i class="dotn hide"></i></a></header><main class="page" id="page" tabindex="-1"></main></div></div>`;
  $('#lo').onclick = () => { api.setToken(null); A.user = null; toast('Signed out', 'info'); loginScreen(); };
  $('#mb').onclick = () => $('#side').classList.toggle('open');
  document.addEventListener('click', (e) => { if (!e.target.closest('#side') && !e.target.closest('#mb')) $('#side')?.classList.remove('open'); });
  window.__badge = () => {
    const b = document.querySelector('[data-b="/orders"]');
    if (b) { b.textContent = A.awaiting; b.classList.toggle('hide', !A.awaiting || A.user.role === 'COURIER'); }
    document.querySelector('#nb .dotn')?.classList.toggle('hide', !A.unread);
  };
  window.__me = () => { $('#mename').textContent = A.user.name; $('#meava').textContent = initials(A.user.name); };
  roleControls();
}

function roleControls() {
  const host = $('#role-ctl');
  if (A.user.role === 'SELLER') {
    api.get('/api/admin/sellers/options').catch(() => {});
    host.innerHTML = `<label class="check" style="font-weight:600"><span class="switch"><input type="checkbox" id="onl" checked><i></i></span> Accepting chats</label>`;
    $('#onl').onchange = (e) => api.post('/api/admin/me/online', { online: e.target.checked }).then(() => toast(e.target.checked ? 'You appear online' : 'You appear offline', 'success'));
  }
  if (A.user.role === 'COURIER') {
    host.innerHTML = `<select class="select sm" id="cst" style="width:150px" aria-label="Availability"><option value="available">Available</option><option value="online">Online</option><option value="offline">Offline</option></select>`;
    $('#cst').onchange = (e) => api.post('/api/admin/me/courier-status', { status: e.target.value }).then(() => toast('Status updated', 'success'));
  }
}

async function route() {
  if (!A.user) return;
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  let page = PAGES.find(([p]) => p === path);
  const allowed = (pg) => pg && (pg[2] === '*' || A.meta.permissions.includes(pg[2]));
  const t = ++token;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const host = $('#page');
  if (!page) { host.innerHTML = emptyState('🧭', 'Page not found'); return; }
  if (!allowed(page)) {
    // land on the first page the role may use
    const first = PAGES.find(allowed);
    if (first && first[0] !== path) { location.hash = first[0]; return; }
  }
  cur = page[0];
  $('#ttl').textContent = page[3];
  document.title = `${page[3]} · Mevazor Admin`;
  document.querySelectorAll('.side a').forEach((a) => a.classList.toggle('on', a.dataset.p === cur));
  $('#side').classList.remove('open');
  document.querySelectorAll('.modal-back,.drawer-back').forEach((m) => m.remove());
  document.body.classList.remove('no-scroll');
  host.innerHTML = '<div class="kpis">' + Array.from({ length: 4 }, () => '<div class="card kpi sk-k sk"></div>').join('') + '</div><div class="card sk" style="height:320px"></div>';
  host.onclick = host.onchange = host.oninput = null;
  const clone = host.cloneNode(false);
  host.replaceWith(clone);
  clone.innerHTML = host.innerHTML;
  try {
    const c = await page[1](clone, query);
    if (t !== token) { if (typeof c === 'function') c(); return; }
    if (typeof c === 'function') cleanup = c;
  } catch (e) {
    console.error(e);
    if (t === token) clone.innerHTML = emptyState('⚠️', 'Something went wrong', e.message);
  }
}

async function boot() {
  try {
    A.user = await api.get('/api/auth/me');
    if (A.user.role === 'CUSTOMER') throw new Error('Customer accounts cannot access the admin panel');
    A.meta = await api.get('/api/admin/meta');
  } catch (e) {
    api.setToken(null);
    A.user = null;
    return loginScreen(api.token() === null && e.status !== 401 && e.message ? e.message : '');
  }
  shell();
  await route();
  counters();
}
api.onUnauthorized = () => { if (A.user) { A.user = null; api.setToken(null); loginScreen('Your session expired. Please sign in again.'); } };
bindLangMenu();
window.addEventListener('hashchange', route);
setInterval(() => A.user && !document.hidden && counters(), 20000);

if (api.token()) boot(); else loginScreen();
