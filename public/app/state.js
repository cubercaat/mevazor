import { createApi, toast } from '/shared/core.js';

export const api = createApi('mz_token');

/** Global app state + a tiny pub/sub so the header badges stay in sync. */
export const S = { user: null, boot: null, unread: 0, chatUnread: 0 };
const subs = new Set();
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));
export const emit = () => subs.forEach((f) => f());

export const nav = (path) => { location.hash = path; };
export const authed = () => !!S.user;
/** Gate for actions that need an account; remembers where to return. */
export function requireLogin(next) {
  if (S.user) return true;
  toast('Davom etish uchun tizimga kiring', 'info');
  nav(`/login?next=${encodeURIComponent(next || location.hash.slice(1) || '/')}`);
  return false;
}

export async function loadBoot() {
  S.boot = await api.get('/api/bootstrap');
}
export async function loadUser() {
  if (!api.token()) return;
  try {
    S.user = await api.get('/api/auth/me');
    if (S.user.role !== 'CUSTOMER') { S.user = null; api.setToken(null); }
  } catch {
    S.user = null;
  }
}
export async function refreshCounters() {
  if (!S.user) { S.unread = 0; S.chatUnread = 0; emit(); return; }
  try {
    const [n, chats] = await Promise.all([api.get('/api/notifications'), api.get('/api/chats')]);
    S.unread = n.unread;
    S.chatUnread = chats.reduce((a, c) => a + c.unread, 0);
    emit();
  } catch { /* offline */ }
}
export function setSession(res) {
  api.setToken(res.token);
  S.user = res.user;
  emit();
}
export function logout() {
  api.setToken(null);
  S.user = null;
  S.unread = 0;
  S.chatUnread = 0;
  emit();
}
api.onUnauthorized = () => { if (S.user) { logout(); toast('Sessiya tugadi. Qayta kiring', 'info'); nav('/login'); } };

/* ------------------------------- cart ------------------------------- */
const KEY = 'mz_cart_v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
export const cart = {
  items: load(),
  persist() { try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* ignore */ } emit(); },
  snapshot: (p) => ({ id: p.id, name: p.name, art: p.art, tint: p.tint, image: p.images?.[0] || null, price: p.price_final, min: p.min_order, max: Math.min(p.max_order, p.stock_kg), stock: p.stock_kg, seller_id: p.seller_id, seller: p.seller_name }),
  add(p, qty) {
    const snap = this.snapshot(p);
    const ex = this.items.find((i) => i.id === p.id);
    if (ex) { Object.assign(ex, snap); ex.qty = Math.min(snap.max, round(ex.qty + qty)); } else this.items.push({ ...snap, qty: Math.min(snap.max, qty) });
    this.persist();
  },
  setQty(id, qty) {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    it.qty = Math.max(it.min, Math.min(it.max, round(qty)));
    this.persist();
  },
  remove(id) { const old = this.items.find((i) => i.id === id); this.items = this.items.filter((i) => i.id !== id); this.persist(); return old; },
  restore(item) { if (item && !this.items.some((i) => i.id === item.id)) { this.items.push(item); this.persist(); } },
  clear() { this.items = []; this.persist(); },
  count() { return this.items.length; },
  subtotal() { return this.items.reduce((a, i) => a + Math.round(i.price * i.qty), 0); },
  /** Refresh prices/stock from the server so the cart never shows stale numbers. */
  async sync() {
    if (!this.items.length) return;
    const list = await api.get(`/api/products?ids=${this.items.map((i) => i.id).join(',')}&limit=100`);
    const byId = new Map(list.map((p) => [p.id, p]));
    this.items = this.items.filter((i) => byId.has(i.id)).map((i) => {
      const p = byId.get(i.id);
      const snap = this.snapshot(p);
      return { ...i, ...snap, qty: Math.max(snap.min, Math.min(snap.max, i.qty)) };
    }).filter((i) => i.stock >= i.min);
    this.persist();
  },
};
export const round = (n) => Math.round(n * 100) / 100;

export function deliveryFeeFor(total) {
  const s = S.boot.settings;
  return total >= s.free_from ? 0 : s.base_fee;
}
/** Cart grouped by seller – each seller becomes its own order at checkout. */
export function cartGroups() {
  const m = new Map();
  for (const i of cart.items) (m.get(i.seller_id) ?? m.set(i.seller_id, { seller_id: i.seller_id, seller: i.seller, items: [] }).get(i.seller_id)).items.push(i);
  return [...m.values()].map((g) => ({ ...g, subtotal: g.items.reduce((a, i) => a + Math.round(i.price * i.qty), 0) }));
}

/* recently viewed (profile → Saqlanganlar) */
export const viewed = {
  get() { try { return JSON.parse(localStorage.getItem('mz_viewed')) || []; } catch { return []; } },
  push(id) { const v = [id, ...this.get().filter((x) => x !== id)].slice(0, 20); try { localStorage.setItem('mz_viewed', JSON.stringify(v)); } catch { /* ignore */ } },
};
