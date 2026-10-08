/* Shared helpers for the customer app and the admin panel: API client, formatting, icons, fruit art, toasts, dialogs. */

/* ------------------------------ API ------------------------------ */
export function createApi(tokenKey) {
  const get = () => { try { return localStorage.getItem(tokenKey); } catch { return null; } };
  const api = async (method, url, body) => {
    const headers = {};
    const t = get();
    if (t) headers.Authorization = `Bearer ${t}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw Object.assign(new Error("Server bilan aloqa yo'q. Internetni tekshiring"), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = Object.assign(new Error(data.error || 'Xatolik yuz berdi'), { status: res.status });
      if (res.status === 401 && t) api.onUnauthorized?.();
      throw err;
    }
    return data;
  };
  api.get = (u) => api('GET', u);
  api.post = (u, b = {}) => api('POST', u, b);
  api.put = (u, b = {}) => api('PUT', u, b);
  api.patch = (u, b = {}) => api('PATCH', u, b);
  api.del = (u) => api('DELETE', u);
  api.token = get;
  api.setToken = (t) => { try { t ? localStorage.setItem(tokenKey, t) : localStorage.removeItem(tokenKey); } catch { /* storage blocked */ } };
  return api;
}

/** Read an image file, downscale to <=1280px and upload; resolves with the stored URL. */
export async function uploadImage(api, file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Faqat PNG, JPG yoki WEBP rasm');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.84);
  return (await api.post('/api/uploads', { data })).url;
}

/* --------------------------- formatting --------------------------- */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} UZS`;
export const num = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
export const kg = (n) => `${Number(n).toLocaleString('uz-UZ', { maximumFractionDigits: 2 }).replace(',', '.')} kg`;
const TZ = 'Asia/Tashkent';
export const fmtDate = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
export const fmtDateTime = (iso) => `${fmtDate(iso)} ${fmtTime(iso)}`;
export function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'hozir';
  if (s < 3600) return `${Math.floor(s / 60)} daq oldin`;
  if (s < 86400) return `${Math.floor(s / 3600)} soat oldin`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} kun oldin`;
  return fmtDate(iso);
}
export const initials = (n = '') => n.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ------------------------------ icons ------------------------------ */
const P = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h9.3a1 1 0 0 0 1-.8L21 7H6"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.2 7.6L3 21l1.5-5.5A8.5 8.5 0 1 1 21 12z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 15a6 6 0 0 1 4 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  heart: '<path d="M12 21s-7.5-4.8-9.6-9.4C.9 8.2 2.9 4.5 6.6 4.5c2 0 3.8 1.1 5.4 3 1.6-1.9 3.4-3 5.4-3 3.7 0 5.7 3.7 4.2 7.1C19.5 16.2 12 21 12 21z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevD: '<path d="M5 9l7 7 7-7"/>',
  arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  truck: '<path d="M2 6h11v11H2zM13 10h4.5L21 13.5V17h-8"/><circle cx="6.5" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  star: '<path d="M12 2.5l3 6.3 6.9.9-5 4.8 1.3 6.9L12 18l-6.2 3.4 1.3-6.9-5-4.8 6.9-.9z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>',
  send: '<path d="M21 3L10 14M21 3l-6.5 18-3.5-7.5L3.5 10z"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  filter: '<path d="M3 6h18M6 12h12M10 18h4"/>',
  undo: '<path d="M3 7v6h6"/><path d="M3.5 13A9 9 0 1 0 6 6.3"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  store: '<path d="M3 9l1.6-5h14.8L21 9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v8h14v-8"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8c-2-4-6-3-5 0 .5 1.5 3 1 5 0zM12 8c2-4 6-3 5 0-.5 1.5-3 1-5 0z"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  dollar: '<path d="M12 2v20M17 6.5C16 5 14.3 4.5 12 4.5c-2.8 0-4.5 1.3-4.5 3.2 0 4.5 9.5 2.3 9.5 7 0 2-1.9 3.3-5 3.3-2.4 0-4.2-.7-5.2-2.3"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
};
export const icon = (name, size = 20, cls = '') =>
  `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
export const starFill = (size = 16) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${P.star.replace('<path', '<path stroke="none"')}</svg>`;
export const heartFill = (size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${P.heart}</svg>`;

/* ---------------------------- fruit artwork ---------------------------- */
const SVG_ART = {
  pomegranate: `<defs><radialGradient id="gp" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#E5584A"/><stop offset="1" stop-color="#A5251F"/></radialGradient></defs><path d="M38 16l5 7 7-8 7 8 5-7 2 12H36z" fill="#B3302A"/><circle cx="50" cy="58" r="33" fill="url(#gp)"/><ellipse cx="38" cy="44" rx="9" ry="6" fill="#fff" opacity=".22" transform="rotate(-30 38 44)"/>`,
  apricot: `<defs><radialGradient id="ga" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="#FFC27A"/><stop offset="1" stop-color="#E9822E"/></radialGradient></defs><circle cx="50" cy="56" r="34" fill="url(#ga)"/><path d="M50 24c-6 12-6 40 0 64" stroke="#C9631A" stroke-width="2" fill="none" opacity=".55"/><path d="M50 24c3-8 12-11 18-8-3 7-10 10-18 8z" fill="#5E9B4A"/><ellipse cx="37" cy="44" rx="8" ry="5" fill="#fff" opacity=".28" transform="rotate(-30 37 44)"/>`,
  plum: `<defs><radialGradient id="gm" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="#8E5BB5"/><stop offset="1" stop-color="#4B2A6E"/></radialGradient></defs><ellipse cx="50" cy="57" rx="33" ry="32" fill="url(#gm)"/><path d="M50 25c-5 10-5 38 0 64" stroke="#341B50" stroke-width="2" fill="none" opacity=".5"/><path d="M50 26c0-8 3-13 8-16" stroke="#6B4A2B" stroke-width="3" stroke-linecap="round" fill="none"/><ellipse cx="37" cy="43" rx="8" ry="5" fill="#fff" opacity=".25" transform="rotate(-30 37 43)"/>`,
  fig: `<defs><radialGradient id="gf" cx="40%" cy="40%" r="80%"><stop offset="0" stop-color="#8A5A86"/><stop offset="1" stop-color="#4D2A4B"/></radialGradient></defs><path d="M50 18c6 0 8 8 9 14 12 8 22 22 22 36 0 12-9 20-31 20S19 80 19 68c0-14 10-28 22-36 1-6 3-14 9-14z" fill="url(#gf)"/><path d="M50 18v-8" stroke="#6B4A2B" stroke-width="4" stroke-linecap="round"/><ellipse cx="38" cy="58" rx="6" ry="12" fill="#fff" opacity=".16" transform="rotate(12 38 58)"/>`,
  raspberry: `<defs><radialGradient id="gr" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="#F0657C"/><stop offset="1" stop-color="#B3153A"/></radialGradient></defs><path d="M30 34c0-10 40-10 40 0 6 6 10 20 4 34-6 13-18 20-24 20s-18-7-24-20c-6-14-2-28 4-34z" fill="url(#gr)"/>${[[38, 42], [50, 40], [62, 42], [32, 54], [44, 53], [56, 53], [68, 54], [38, 66], [50, 66], [62, 66], [44, 78], [56, 78]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.2" fill="#fff" opacity=".18"/>`).join('')}<path d="M36 30c4-8 10-8 14-3 4-5 10-5 14 3-9 4-19 4-28 0z" fill="#4E8F46"/>`,
};
export function art(a, cls = '') {
  if (a && typeof a === 'object') {
    if (a.image) return `<img class="thumb-img ${cls}" src="${esc(a.image)}" alt="" loading="lazy">`;
    a = a.art;
  }
  if (a && a.startsWith('svg:')) return `<svg class="fruit-svg ${cls}" viewBox="0 0 100 100" aria-hidden="true">${SVG_ART[a.slice(4)] ?? ''}</svg>`;
  return `<span class="fruit-emoji ${cls}" aria-hidden="true">${esc(a || '🍎')}</span>`;
}


/* ---- emoji -> real photo (promotions, categories) and emoji -> UI icon (empty states) ---- */
const EMOJI_PHOTO = { '🍎': 'qizil-olma', '🍏': 'yashil-olma', '🍌': 'banan', '🍊': 'apelsin', '🍋': 'limon', '🍇': 'husayni-uzum', '🍓': 'qulupnay', '🍉': 'tarvuz', '🍈': 'qovun', '🍑': 'shaftoli', '🍐': 'nok', '🥝': 'kivi', '🥭': 'mango', '🍍': 'ananas', '🍒': 'gilos', '🥑': 'avokado', '🫐': 'kok-rezavor' };
export const emojiImg = (e) => (EMOJI_PHOTO[e] ? `<img class="thumb-img" src="/photos/${EMOJI_PHOTO[e]}.jpg" alt="" loading="lazy">` : esc(e));
const EMOJI_ICON = { '🧺': 'cart', '🔎': 'search', '⚠️': 'alert', '🍃': 'leaf', '🌿': 'leaf', '📦': 'box', '💬': 'chat', '💚': 'heart', '👀': 'eye', '✅': 'check', '🔔': 'bell', '⭐': 'star', '📍': 'pin', '↩️': 'undo', '📡': 'alert', '🍎': 'leaf', '🏷️': 'tag', '🛵': 'truck', '🗂️': 'layers', '👥': 'users', '🏪': 'store', '🧭': 'map', '🚚': 'truck' };
export const emojiIcon = (e, size = 40) => (EMOJI_ICON[e] ? icon(EMOJI_ICON[e], size) : esc(e));
/* ------------------------------ toasts ------------------------------ */
let toastHost;
export function toast(message, kind = 'info', action) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.append(toastHost);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span class="toast-ic">${icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info', 18)}</span><span class="toast-msg">${esc(message)}</span>${action ? `<button class="toast-act">${esc(action.label)}</button>` : ''}`;
  toastHost.append(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.toast-act')?.addEventListener('click', () => { action.run(); close(); });
  setTimeout(close, action ? 5500 : 3200);
}

/* ------------------------- dialogs / sheets ------------------------- */
/** Generic modal. Returns {el, close}. `html` is trusted markup built with esc(). */
export function modal(html, { cls = '', onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(back);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => back.classList.add('in'));
  const prevFocus = document.activeElement;
  const close = (val) => {
    back.classList.remove('in');
    setTimeout(() => { back.remove(); if (!document.querySelector('.modal-back')) document.body.classList.remove('no-scroll'); }, 220);
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
    onClose?.(val);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  setTimeout(() => back.querySelector('[autofocus], input, textarea, button.primary')?.focus(), 60);
  return { el: back.firstElementChild, close };
}

export function confirmDialog({ title, text, confirmLabel = 'Tasdiqlash', cancelLabel = 'Bekor qilish', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const { el, close } = modal(
      `<div class="dlg"><h3>${esc(title)}</h3><p>${esc(text || '')}</p>
       <div class="dlg-actions"><button class="btn ghost" data-close>${esc(cancelLabel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirmLabel)}</button></div></div>`,
      { cls: 'modal-sm', onClose: () => resolve(result) },
    );
    el.querySelector('[data-ok]').addEventListener('click', () => { result = true; close(); });
  });
}

/** Run an async action on a button with a busy state and error toast. */
export async function busy(btn, fn) {
  if (btn.disabled) return;
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('is-busy');
  try {
    return await fn();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-busy');
    btn.innerHTML = label;
  }
}
