import { $, esc, icon, art, num, debounce, modal } from '/shared/core.js';
import { initI18n, langButton, bindLangMenu } from '/shared/i18n.js';
import { COMMON } from '/shared/i18n-common.js';
import { APP } from './i18n-app.js';

initI18n({ key: 'mz_lang', entries: [...COMMON, ...APP], defaultLang: 'uz' });
import { api, S, cart, loadBoot, loadUser, refreshCounters, subscribe } from './state.js';
import { tint, empty } from './components.js';
import * as shop from './pages-shop.js';
import * as ord from './pages-order.js';
import { chatPage } from './pages-chat.js';
import * as prof from './pages-profile.js';

const ROUTES = [
  ['/', shop.home, 'home'], ['/fruits', shop.fruits, 'fruits'], ['/fruit/:id', shop.product, 'fruits'],
  ['/cart', ord.cartPage, 'cart'], ['/checkout', ord.checkout, 'cart'], ['/confirm/:group', ord.confirmPage, 'orders'], ['/done/:group', ord.donePage, 'orders'],
  ['/orders', ord.orders, 'orders'], ['/orders/:id', ord.orderDetail, 'orders'],
  ['/chat', chatPage, 'chat'], ['/chat/:id', chatPage, 'chat'],
  ['/profile', prof.profile, 'profile'], ['/profile/:section', prof.profile, 'profile'], ['/notifications', prof.notificationsPage, 'profile'],
  ['/login', prof.login, 'profile'], ['/register', prof.register, 'profile'],
].map(([p, h, tab]) => ({ re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), h, tab }));

const NAV = [
  ['home', '/', 'home', 'Bosh sahifa'], ['fruits', '/fruits', 'grid', 'Mevalar'], ['cart', '/cart', 'cart', 'Savat'],
  ['orders', '/orders', 'bag', 'Buyurtmalar'], ['chat', '/chat', 'chat', 'Chat'], ['profile', '/profile', 'user', 'Profil'],
];
let activeTab = 'home';
let cleanup = null;
let navToken = 0;

function chrome() {
  document.getElementById('app').innerHTML = `
  <header class="hdr" id="hdr"><div class="container hdr-in">
    <a class="logo" href="#/" aria-label="Mevazor"><img class="logo-mark" src="/shared/logo-192.webp" alt="" width="38" height="38">Mevazor</a>
    <div class="search desktop" id="sw">${icon('search', 20)}<input id="gs" class="input" type="search" placeholder="Meva, sotuvchi yoki kategoriya qidiring…" autocomplete="off" aria-label="Qidirish"><div id="sg"></div></div>
    <nav class="nav" id="nav" aria-label="Asosiy menyu"></nav>${langButton('desk-lang')}
    <div class="hdr-mobile">${langButton()}<a class="ibtn" href="#/fruits" aria-label="Qidirish">${icon('search', 22)}</a><a class="ibtn" href="#/chat" aria-label="Chat" id="mchat">${icon('chat', 22)}</a><a class="ibtn" href="#/notifications" aria-label="Bildirishnomalar" id="mbell">${icon('bell', 22)}</a></div>
  </div></header>
  <main id="view" tabindex="-1" aria-live="polite"></main>
  <footer class="foot"><div class="container foot-in"><div><b>Mevazor</b><br>Faqat yangi mevalar. Yetkazilganda to'lov, yoqmasa qaytarish.</div><div>Yordam: ${esc(S.boot?.settings?.support_phone || '')}<br>© ${new Date().getFullYear()} Mevazor<br><a href="#" id="credits" class="link">Foto manbalari</a></div></div></footer>
  <nav class="bnav" id="bnav" aria-label="Pastki menyu"></nav>`;
  const link = (k, href, ic, label, bnav) => `<a href="#${href}" data-tab="${k}" class="${activeTab === k ? 'on' : ''}" ${activeTab === k ? 'aria-current="page"' : ''} title="${label}">${icon(ic, bnav ? 24 : 20)}<span class="${bnav ? '' : 'lbl'}">${label}</span>${badge(k)}</a>`;
  const badge = (k) => {
    const n = k === 'cart' ? cart.count() : k === 'chat' ? S.chatUnread : k === 'profile' ? S.unread : 0;
    return n ? `<span class="badge">${n > 9 ? '9+' : n}</span>` : '';
  };
  const paint = () => {
    $('#nav').innerHTML = NAV.map(([k, h, ic, l]) => link(k, h, ic, l, false)).join('');
    $('#bnav').innerHTML = NAV.filter(([k]) => k !== 'chat').map(([k, h, ic, l]) => link(k, h, ic, k === 'fruits' ? 'Mevalar' : l, true)).join('');
    const mb = $('#mbell'); if (mb) mb.innerHTML = icon('bell', 22) + (S.unread ? `<span class="badge">${S.unread > 9 ? '9+' : S.unread}</span>` : '');
    const mc = $('#mchat'); if (mc) mc.innerHTML = icon('chat', 22) + (S.chatUnread ? `<span class="badge">${S.chatUnread > 9 ? '9+' : S.chatUnread}</span>` : '');
  };
  paint();
  bindLangMenu();
  subscribe(paint);
  $('#credits').addEventListener('click', async (e) => {
    e.preventDefault();
    let list = {};
    try { list = await (await fetch('/photos/CREDITS.json')).json(); } catch { /* offline */ }
    modal(`<div class="modal-head"><h3>Foto manbalari</h3><button class="ibtn" data-close aria-label="Yopish">${icon('x')}</button></div>
      <div class="modal-body"><p class="muted" style="font-size:14px">Mevalar fotosuratlari Wikimedia Commons'dan erkin litsenziyalar asosida olingan.</p>
      <div style="display:grid;gap:10px;max-height:52vh;overflow:auto">${Object.values(list).map((c) => `<div class="row" style="gap:12px;align-items:center"><img src="/photos/${esc(c.file)}" alt="" width="44" height="44" style="border-radius:10px;object-fit:cover"><div class="grow" style="font-size:13px"><b>${esc(c.file.replace('.jpg', ''))}</b><br><span class="muted" data-notr>${esc(c.author || '—')} · ${esc(c.license)}</span></div><a class="link" href="${esc(c.source)}" target="_blank" rel="noopener" data-notr>Wikimedia</a></div>`).join('')}</div></div>`, { cls: 'modal-lg' });
  });
  window.__paintNav = paint;
  window.addEventListener('scroll', () => $('#hdr').classList.toggle('scrolled', scrollY > 4), { passive: true });

  /* live search suggestions */
  const gs = $('#gs');
  const sg = $('#sg');
  const close = () => (sg.innerHTML = '');
  gs.addEventListener('input', debounce(async () => {
    const q = gs.value.trim();
    if (q.length < 2) return close();
    try {
      const list = await api.get(`/api/products?q=${encodeURIComponent(q)}&limit=5`);
      sg.innerHTML = `<div class="suggest">${list.length ? list.map((p) => `<a href="#/fruit/${p.id}"><span class="sg-art" style="background:${tint(p.tint)}">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px">` : art(p.art)}</span><span class="grow"><b>${esc(p.name)}</b><br><small>${esc(p.seller_name)} · ${num(p.price_final)} UZS/kg</small></span></a>`).join('') + `<a href="#/fruits?q=${encodeURIComponent(q)}"><span class="sg-art" style="background:var(--green-soft)">${icon('search', 18)}</span><b>“${esc(q)}” bo'yicha barcha natijalar</b></a>` : `<a href="#/fruits?q=${encodeURIComponent(q)}"><b>Hech narsa topilmadi — kengroq qidirish</b></a>`}</div>`;
    } catch { close(); }
  }, 220));
  gs.addEventListener('keydown', (e) => { if (e.key === 'Enter' && gs.value.trim()) { location.hash = `/fruits?q=${encodeURIComponent(gs.value.trim())}`; close(); gs.blur(); } if (e.key === 'Escape') close(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#sw')) close(); });
  sg.addEventListener('click', () => { close(); gs.value = ''; });
}

async function route() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const token = ++navToken;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  document.querySelectorAll('.modal-back').forEach((m) => m.remove());
  document.body.classList.remove('no-scroll');
  let match = null;
  for (const r of ROUTES) { const m = r.re.exec(path.replace(/\/$/, '') || '/'); if (m) { match = { r, params: m.groups || {} }; break; } }
  const view = $('#view');
  view.onclick = view.onchange = view.oninput = null;
  activeTab = match?.r.tab || 'home';
  window.__paintNav?.();
  document.title = 'Mevazor — yangi mevalar yetkazib berish';
  view.classList.remove('page-in');
  void view.offsetWidth;
  view.classList.add('page-in');
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (!match) { view.innerHTML = `<div class="container">${empty('🌿', 'Sahifa topilmadi', 'Bu manzil mavjud emas.', '<a class="btn primary" href="#/">Bosh sahifa</a>')}</div>`; return; }
  try {
    const c = await match.r.h(match.params, query);
    if (token !== navToken) { if (typeof c === 'function') c(); return; }
    if (typeof c === 'function') cleanup = c;
  } catch (e) {
    console.error(e);
    if (token === navToken) view.innerHTML = `<div class="container">${empty('⚠️', 'Xatolik yuz berdi', e.message || 'Qayta urinib ko\'ring', '<button class="btn primary" onclick="location.reload()">Qayta yuklash</button>')}</div>`;
  }
}

async function start() {
  try {
    await Promise.all([loadBoot(), loadUser()]);
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="container" style="padding-top:60px">${empty('📡', 'Server bilan aloqa yo\'q', e.message, '<button class="btn primary" onclick="location.reload()">Qayta urinish</button>')}</div>`;
    return;
  }
  chrome();
  window.addEventListener('hashchange', route);
  await route();
  refreshCounters();
  setInterval(() => !document.hidden && refreshCounters(), 20000);
  if (S.user) cart.sync().catch(() => {});
}
start();
