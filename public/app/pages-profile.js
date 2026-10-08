import { $, $$, esc, icon, money, toast, modal, confirmDialog, busy, initials, ago, fmtDate } from '/shared/core.js';
import { langButton } from '/shared/i18n.js';
import { api, S, nav, requireLogin, setSession, logout, refreshCounters, viewed } from './state.js';
import { empty, productCard, bindCards, cardSkeletons, statusTone } from './components.js';

const view = () => document.getElementById('view');

/* =============================== AUTH =============================== */
function authShell(title, sub, inner, foot) {
  view().innerHTML = `<div class="container"><div class="auth"><div class="auth-card"><div><h1>${title}</h1><p class="muted" style="margin-top:4px">${sub}</p></div>${inner}</div><p style="text-align:center" class="muted">${foot}</p></div></div>`;
}
const safeNext = (n) => (n && /^\/[a-z]/i.test(n) && !n.startsWith('//') ? n : '/');

export function login(_, query) {
  if (S.user) return nav(safeNext(query.next));
  authShell('Xush kelibsiz', 'Telefon raqamingiz bilan kiring', `
    <form id="lf" class="stack" style="gap:14px" novalidate>
      <div class="field"><label for="lg">Telefon raqam</label><input id="lg" class="input" type="tel" autocomplete="username" inputmode="tel" placeholder="+998 90 123 45 67" required autofocus></div>
      <div class="field"><label for="pw">Parol</label><input id="pw" class="input" type="password" autocomplete="current-password" required></div>
      <button class="btn primary lg block" type="submit">Kirish</button>
    </form>
    <div class="demo-box"><b>Demo hisob</b><span>+998 90 123 45 67 · Demo#2026</span><button type="button" id="fill">Avtomatik to'ldirish</button></div>`,
  `Hisobingiz yo'qmi? <a class="link" href="#/register${query.next ? '?next=' + encodeURIComponent(query.next) : ''}">Ro'yxatdan o'tish</a>`);
  $('#fill').onclick = () => { $('#lg').value = '+998901234567'; $('#pw').value = 'Demo#2026'; };
  $('#lf').onsubmit = (e) => {
    e.preventDefault();
    busy(e.currentTarget.querySelector('button[type=submit]'), async () => {
      const res = await api.post('/api/auth/login', { login: $('#lg').value, password: $('#pw').value });
      if (res.user.role !== 'CUSTOMER') throw new Error('Bu hisob xodimlar uchun. Boshqaruv paneliga /admin orqali kiring');
      setSession(res);
      refreshCounters();
      toast(`Xush kelibsiz, ${res.user.name.split(' ')[0]}!`, 'success');
      nav(safeNext(query.next));
    });
  };
}

export function register(_, query) {
  if (S.user) return nav('/');
  authShell("Ro'yxatdan o'tish", 'Bir daqiqada hisob yarating', `
    <form id="rf" class="stack" style="gap:14px" novalidate>
      <div class="field"><label for="rn">Ism-familiya</label><input id="rn" class="input" autocomplete="name" required minlength="2" autofocus></div>
      <div class="field"><label for="rp">Telefon raqam</label><input id="rp" class="input" type="tel" autocomplete="tel" inputmode="tel" placeholder="+998 90 123 45 67" required></div>
      <div class="field"><label for="rw">Parol</label><input id="rw" class="input" type="password" autocomplete="new-password" minlength="8" required><span class="hint">Kamida 8 ta belgi</span></div>
      <button class="btn primary lg block" type="submit">Hisob yaratish</button>
    </form>`, `Hisobingiz bormi? <a class="link" href="#/login${query.next ? '?next=' + encodeURIComponent(query.next) : ''}">Kirish</a>`);
  $('#rf').onsubmit = (e) => {
    e.preventDefault();
    busy(e.currentTarget.querySelector('button[type=submit]'), async () => {
      const res = await api.post('/api/auth/register', { name: $('#rn').value, phone: $('#rp').value, password: $('#rw').value });
      setSession(res);
      toast('Hisob yaratildi. Xush kelibsiz!', 'success');
      nav(safeNext(query.next));
    });
  };
}

/* =============================== PROFILE =============================== */
const SECTIONS = [
  ['info', 'user', 'Shaxsiy ma\'lumotlar'], ['addresses', 'pin', 'Manzillarim'], ['orders', 'bag', 'Buyurtmalar tarixi'], ['favorites', 'heart', 'Sevimli mevalar'],
  ['saved', 'leaf', 'Saqlangan mahsulotlar'], ['chats', 'chat', 'Chatlar tarixi'], ['returns', 'undo', 'Qaytarishlar'], ['notifications', 'bell', 'Bildirishnomalar'], ['settings', 'sliders', 'Sozlamalar'],
];

export async function profile({ section }) {
  if (!requireLogin('/profile')) return;
  const v = view();
  const u = S.user;
  const key = section || 'info';
  v.innerHTML = `<div class="container">
    <div class="prof-head"><span class="prof-ava">${esc(initials(u.name))}</span><div><h1>${esc(u.name)}</h1><div style="opacity:.8">${esc(u.phone || '')}</div></div></div>
    <div class="prof-grid ${section ? 'is-section' : 'is-home'}"><aside class="panel" style="padding:8px"><nav class="menu">${SECTIONS.map(([k, ic, label]) => `<a href="${k === 'orders' ? '#/orders' : k === 'chats' ? '#/chat' : '#/profile/' + k}" class="${key === k ? 'on' : ''}">${icon(ic, 20)}${label}${k === 'notifications' && S.unread ? `<span class="cnt hot">${S.unread}</span>` : ''}${icon('chevR', 16, 'go')}</a>`).join('')}<button id="lo">${icon('logout', 20)}Chiqish</button></nav></aside>
    <main id="sec"><a class="link back-link" href="#/profile">${icon('chevL', 16)} Profil</a><div id="host"></div></main></div></div>`;
  const fn = { info: sectionInfo, addresses: sectionAddresses, favorites: sectionFavorites, saved: sectionSaved, returns: sectionReturns, notifications: sectionNotifications, settings: sectionSettings }[key] || sectionInfo;
  v.addEventListener('click', async (e) => {
    if (e.target.closest('#lo')) {
      if (await confirmDialog({ title: 'Chiqasizmi?', text: 'Hisobingizdan chiqmoqchimisiz?', confirmLabel: 'Chiqish' })) { logout(); toast('Tizimdan chiqdingiz', 'info'); nav('/'); }
    }
  });
  await fn($('#host'));
}

const card = (title, body, extra = '') => `<section class="panel"><div class="row" style="justify-content:space-between;margin-bottom:14px"><h3 style="margin:0">${title}</h3>${extra}</div>${body}</section>`;

async function sectionInfo(host) {
  const u = S.user;
  host.innerHTML = card('Shaxsiy ma\'lumotlar', `<form id="pf" class="form-grid" novalidate><div class="field"><label for="pn">Ism-familiya</label><input id="pn" class="input" value="${esc(u.name)}" required minlength="2"></div><div class="field"><label for="pp">Telefon</label><input id="pp" class="input" value="${esc(u.phone || '')}" required></div><div class="full"><button class="btn primary" type="submit">Saqlash</button></div></form>`);
  $('#pf', host).onsubmit = (e) => { e.preventDefault(); busy(e.currentTarget.querySelector('button'), async () => { const r = await api.patch('/api/me', { name: $('#pn', host).value, phone: $('#pp', host).value }); S.user = { ...S.user, ...r }; toast('Saqlandi', 'success'); }); };
}

async function sectionAddresses(host) {
  const draw = async () => {
    const list = await api.get('/api/addresses');
    host.innerHTML = card('Manzillarim', `<div class="list-stack">${list.length ? list.map((a) => `<div class="addr ${a.is_default ? 'def' : ''}"><span class="ai">${icon('pin', 20)}</span><div class="grow"><b>${esc(a.label)}</b> ${a.is_default ? '<span class="pill" style="height:22px;font-size:11px">Asosiy</span>' : ''}<div>${esc(a.full_address)}${a.apartment ? ', ' + esc(a.apartment) : ''}</div>${a.instructions ? `<div class="muted" style="font-size:13px">${esc(a.instructions)}</div>` : ''}</div>
      <div class="row" style="gap:2px"><button class="ibtn" data-edit="${a.id}" aria-label="Tahrirlash">${icon('edit', 18)}</button>${a.is_default ? '' : `<button class="ibtn" data-def="${a.id}" title="Asosiy qilish" aria-label="Asosiy qilish">${icon('check', 18)}</button>`}<button class="ibtn" data-del="${a.id}" aria-label="O'chirish">${icon('trash', 18)}</button></div></div>`).join('') : empty('📍', "Manzillar yo'q", 'Tezroq buyurtma berish uchun manzil qo\'shing.')}</div>`, `<button class="btn primary sm" id="addA">${icon('plus', 16)} Yangi manzil</button>`);
    host.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'addA') form(null);
      else if (b.dataset.edit) form(list.find((a) => a.id === +b.dataset.edit));
      else if (b.dataset.def) { await api.patch(`/api/addresses/${b.dataset.def}`, { is_default: true }); toast('Asosiy manzil o\'zgardi', 'success'); draw(); }
      else if (b.dataset.del && (await confirmDialog({ title: "Manzilni o'chirasizmi?", text: '', confirmLabel: "O'chirish", danger: true }))) { await api.del(`/api/addresses/${b.dataset.del}`); draw(); }
    };
    const form = (a) => {
      const { el, close } = modal(`<div class="modal-head"><h3>${a ? 'Manzilni tahrirlash' : 'Yangi manzil'}</h3><button class="ibtn" data-close>${icon('x')}</button></div><form class="modal-body" id="af" novalidate>
        <div class="field"><label>Nomi</label><input class="input" id="al" placeholder="Uy, Ish…" value="${esc(a?.label || '')}" required></div>
        <div class="field"><label>Manzil</label><input class="input" id="aa" value="${esc(a?.full_address || '')}" required minlength="5"></div>
        <div class="field"><label>Xonadon / uy</label><input class="input" id="ap" value="${esc(a?.apartment || '')}"></div>
        <div class="field"><label>Izoh</label><input class="input" id="ai" value="${esc(a?.instructions || '')}"></div>
        <label class="check"><input type="checkbox" id="ad" ${a?.is_default ? 'checked' : ''}> Asosiy manzil</label>
        <button class="btn primary block" type="submit">Saqlash</button></form>`);
      $('#af', el).onsubmit = (ev) => { ev.preventDefault(); busy(ev.currentTarget.querySelector('button[type=submit]'), async () => { const body = { label: $('#al', el).value, full_address: $('#aa', el).value, apartment: $('#ap', el).value, instructions: $('#ai', el).value, is_default: $('#ad', el).checked }; if (a) await api.patch(`/api/addresses/${a.id}`, body); else await api.post('/api/addresses', body); close(); toast('Saqlandi', 'success'); draw(); }); };
    };
  };
  await draw();
}

async function sectionFavorites(host) {
  host.innerHTML = card('Sevimli mevalar', `<div class="grid" id="fg">${cardSkeletons(4)}</div>`);
  const list = await api.get('/api/favorites');
  $('#fg', host).outerHTML = list.length ? `<div class="grid" id="fg">${list.map(productCard).join('')}</div>` : empty('💚', "Sevimli mevalar yo'q", "Mevadagi yurakchani bossangiz, shu yerda saqlanadi.", '<a class="btn primary" href="#/fruits">Mevalarni ko\'rish</a>');
  bindCards(host, (id) => list.find((p) => p.id === id));
}
async function sectionSaved(host) {
  const ids = viewed.get();
  host.innerHTML = card('Saqlangan mahsulotlar', `<p class="muted" style="margin-top:-6px;margin-bottom:14px">Yaqinda ko'rgan mevalaringiz</p><div class="grid" id="fg">${ids.length ? cardSkeletons(4) : ''}</div>`);
  if (!ids.length) { $('#fg', host).outerHTML = empty('👀', "Hali hech narsa ko'rmadingiz", 'Ko\'rgan mevalaringiz shu yerda saqlanadi.'); return; }
  const list = await api.get(`/api/products?ids=${ids.join(',')}&limit=50`);
  const sorted = ids.map((id) => list.find((p) => p.id === id)).filter(Boolean);
  $('#fg', host).innerHTML = sorted.map(productCard).join('');
  bindCards(host, (id) => sorted.find((p) => p.id === id));
}
async function sectionReturns(host) {
  host.innerHTML = card('Qaytarishlar tarixi', '<div class="sk" style="height:120px"></div>');
  const list = await api.get('/api/returns');
  const tone = { pending: 'warn', approved: '', completed: 'grey', rejected: 'bad' };
  const lbl = { pending: 'Ko\'rib chiqilmoqda', approved: 'Tasdiqlandi', completed: 'Yakunlandi', rejected: 'Rad etildi' };
  host.innerHTML = card('Qaytarishlar tarixi', list.length ? `<div class="list-stack">${list.map((r) => `<a class="ocard" href="#/orders/${r.order_id}"><div class="ocard-top"><b>${esc(r.code)}</b><span class="pill ${tone[r.status]}">${lbl[r.status]}</span></div><div>${esc(r.reason)}</div><div class="muted" style="font-size:13px">${esc(r.store_name)} · ${fmtDate(r.created_at)} · Yetkazib berish haqi: ${money(r.delivery_fee)}</div>${r.admin_note ? `<div class="notice">${icon('info', 18)}<span>${esc(r.admin_note)}</span></div>` : ''}</a>`).join('')}</div>` : empty('✅', "Qaytarishlar yo'q", "Hammasi yaxshi! Yoqmagan meva bo'lsa, buyurtma sahifasidan qaytarishingiz mumkin."));
}

const NOTIF_ICON = { order: 'bag', seller: 'chat', message: 'chat', return: 'undo', promo: 'gift', courier: 'truck' };
const nIcon = (t) => icon(Object.entries(NOTIF_ICON).find(([k]) => t.includes(k))?.[1] || 'bell', 20);
export const fixLink = (l) => (l ? l.replace('/chats/', '/chat/').replace(/^#/, '') : '/');

async function sectionNotifications(host) {
  host.innerHTML = card('Bildirishnomalar', '<div class="sk" style="height:200px"></div>');
  const { items } = await api.get('/api/notifications');
  host.innerHTML = card('Bildirishnomalar', items.length ? `<div>${items.map((n) => `<div class="notif ${n.read_at ? '' : 'unread-n'}" data-id="${n.id}" data-link="${esc(fixLink(n.link))}"><span class="ni">${nIcon(n.type)}</span><div class="grow"><b>${esc(n.title)}</b><div class="muted" style="font-size:14px">${esc(n.body || '')}</div><small class="muted">${ago(n.created_at)}</small></div></div>`).join('')}</div>` : empty('🔔', "Bildirishnomalar yo'q", 'Buyurtma yangiliklari shu yerda ko\'rinadi.'), items.some((n) => !n.read_at) ? '<button class="btn soft sm" id="readall">Hammasini o\'qilgan qilish</button>' : '');
  host.onclick = async (e) => {
    if (e.target.closest('#readall')) { await api.post('/api/notifications/read'); refreshCounters(); sectionNotifications(host); return; }
    const n = e.target.closest('.notif');
    if (n) { api.post('/api/notifications/read', { id: +n.dataset.id }).then(refreshCounters); nav(n.dataset.link); }
  };
}

const PREF_KEY = 'mz_prefs';
const prefs = () => { try { return { order: true, chat: true, promo: true, ...JSON.parse(localStorage.getItem(PREF_KEY)) }; } catch { return { order: true, chat: true, promo: true }; } };
async function sectionSettings(host) {
  const p = prefs();
  const row = (k, t, s) => `<div class="setting"><div><b>${t}</b><div class="muted" style="font-size:13px">${s}</div></div><label class="switch"><input type="checkbox" data-pref="${k}" ${p[k] ? 'checked' : ''}><i></i></label></div>`;
  host.innerHTML = `<div class="stack">${card('Bildirishnomalar', row('order', 'Buyurtma yangiliklari', 'Qabul qilindi, yo\'lda, yetkazildi') + row('chat', 'Sotuvchi javoblari', 'Chatdagi yangi xabarlar') + row('promo', 'Aksiyalar', 'Chegirma va promokodlar'))}
    ${card('Parolni o\'zgartirish', `<form id="pwf" class="form-grid" novalidate><div class="field"><label>Joriy parol</label><input class="input" id="cp" type="password" autocomplete="current-password" required></div><div class="field"><label>Yangi parol</label><input class="input" id="np" type="password" autocomplete="new-password" minlength="8" required></div><div class="full"><button class="btn primary" type="submit">Yangilash</button></div></form>`)}
    ${card('Ilova', `<div class="setting"><div><b>Til</b></div>${langButton('outline-lang')}</div><div class="setting"><div><b>Valyuta</b></div><span class="muted">UZS</span></div><div class="setting"><div><b>Hisobdan chiqish</b></div><button class="btn danger-soft sm" id="lo">${icon('logout', 16)} Chiqish</button></div>`)}</div>`;
  host.onchange = (e) => { const c = e.target.closest('[data-pref]'); if (c) { p[c.dataset.pref] = c.checked; try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ } toast('Sozlama saqlandi', 'success'); } };
  $('#pwf', host).onsubmit = (e) => { e.preventDefault(); busy(e.currentTarget.querySelector('button'), async () => { await api.patch('/api/me', { new_password: $('#np', host).value, current_password: $('#cp', host).value }); toast('Parol yangilandi', 'success'); e.target.reset(); }); };
}

export async function notificationsPage() { nav('/profile/notifications'); }
void $$;
void statusTone;
