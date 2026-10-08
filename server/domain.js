import { q, now } from './db.js';
import { notify, adminUserIds, sellerUserId } from './lib/util.js';

export const TZ = '+5 hours'; // Asia/Tashkent

export const STATUS_LABELS = {
  draft: 'Tasdiqlash kutilmoqda',
  sent: 'Buyurtma yuborildi',
  reviewing: "Sotuvchi ko'rib chiqmoqda",
  accepted: 'Buyurtma qabul qilindi',
  preparing: 'Mevalar tayyorlanmoqda',
  handed: 'Kuryerga topshirildi',
  on_way: "Yo'lda",
  delivered: 'Yetkazildi',
  completed: 'Yakunlandi',
  rejected: 'Buyurtma rad etildi',
  cancelled: 'Bekor qilindi',
  return_requested: "Qaytarish so'rovi yuborildi",
  returned: 'Qaytarildi',
};
/** Linear happy path shown on the tracking screen. */
export const FLOW = ['sent', 'reviewing', 'accepted', 'preparing', 'handed', 'on_way', 'delivered', 'completed'];

const SELLER_NEXT = {
  sent: ['reviewing', 'rejected'],
  reviewing: ['accepted', 'rejected'],
  accepted: ['preparing', 'rejected'],
  preparing: ['handed'],
};
const COURIER_NEXT = { handed: ['on_way'], on_way: ['delivered'] };
const CUSTOMER_NEXT = { draft: ['cancelled'], sent: ['cancelled'], reviewing: ['cancelled'], delivered: ['completed'] };
export const ALL_STATUSES = Object.keys(STATUS_LABELS).filter((s) => s !== 'draft');

export function allowedTransitions(role, status) {
  if (role === 'SELLER') return SELLER_NEXT[status] ?? [];
  if (role === 'COURIER') return COURIER_NEXT[status] ?? [];
  if (role === 'CUSTOMER') return CUSTOMER_NEXT[status] ?? [];
  return ALL_STATUSES.filter((s) => s !== status); // ADMIN / SUPER_ADMIN
}

const CUSTOMER_MESSAGES = {
  sent: ['Buyurtma yuborildi', 'Sotuvchi tez orada ko\'rib chiqadi'],
  reviewing: ["Sotuvchi ko'rib chiqmoqda", 'Buyurtmangiz ko\'rib chiqilmoqda'],
  accepted: ['Buyurtma qabul qilindi', 'Sotuvchi buyurtmangizni qabul qildi'],
  preparing: ['Mevalar tayyorlanmoqda', 'Mevalaringiz saralanib, qadoqlanmoqda'],
  handed: ['Kuryer buyurtmani oldi', 'Buyurtmangiz kuryerga topshirildi'],
  on_way: ["Kuryer yo'lda", 'Kuryer tez orada yetib boradi'],
  delivered: ['Buyurtma yetkazildi', 'Mevalarni ko\'zdan kechiring: yoqmasa qaytarishingiz mumkin'],
  completed: ['Buyurtma yakunlandi', 'Xaridingiz uchun rahmat! Sharh qoldirishingiz mumkin'],
  rejected: ['Buyurtma rad etildi', 'Sotuvchi buyurtmani qabul qila olmadi'],
  cancelled: ['Buyurtma bekor qilindi', ''],
  returned: ['Qaytarish tasdiqlandi', 'Meva narxi hisoblanmaydi'],
};

export const settings = () => q.get('SELECT * FROM delivery_settings WHERE id = 1');

export const effPrice = (p) => Math.round((p.price_per_kg * (100 - (p.discount_percent || 0))) / 100);
export const EFF_PRICE_SQL = 'CAST(ROUND(p.price_per_kg * (100 - p.discount_percent) / 100.0) AS INTEGER)';

export function deliveryFee(itemsTotal, s = settings()) {
  return itemsTotal >= s.free_from ? 0 : s.base_fee;
}
export function returnFee(order, s = settings()) {
  if (s.return_policy === 'free') return 0;
  if (s.return_policy === 'fixed') return s.return_fixed_fee;
  return order.delivery_fee;
}

/* ---------------- products ---------------- */
const PRODUCT_SELECT = `
  SELECT p.*, ${EFF_PRICE_SQL} AS price_final,
         s.store_name AS seller_name, s.rating AS seller_rating, s.online AS seller_online, s.emoji AS seller_emoji, s.status AS seller_status,
         c.name AS category_name, c.slug AS category_slug
  FROM products p
  JOIN sellers s ON s.id = p.seller_id
  JOIN categories c ON c.id = p.category_id`;

const SORTS = {
  popular: 'p.sold_kg DESC',
  cheapest: 'price_final ASC',
  expensive: 'price_final DESC',
  rating: 'p.rating_avg DESC, p.rating_count DESC',
  newest: 'p.created_at DESC, p.id DESC',
  fastest: 'p.delivery_min ASC, p.delivery_max ASC',
};

function decorate(rows, userId) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const imgs = q.all(`SELECT product_id, url FROM product_images WHERE product_id IN (${marks}) ORDER BY sort, id`, ...ids);
  const favs = userId ? new Set(q.all(`SELECT product_id FROM favorites WHERE user_id = ? AND product_id IN (${marks})`, userId, ...ids).map((f) => f.product_id)) : new Set();
  for (const r of rows) {
    r.images = imgs.filter((i) => i.product_id === r.id).map((i) => i.url);
    r.is_fav = favs.has(r.id);
    r.seller_online = !!r.seller_online;
  }
  return rows;
}

/** Public catalogue query (only active products of active sellers). */
export function listProducts(f = {}, userId = null) {
  const where = ["p.status = 'active'", "s.status = 'active'", 'c.active = 1'];
  const args = [];
  const add = (cond, ...a) => (where.push(cond), args.push(...a));
  if (f.q) {
    const like = `%${String(f.q).toLowerCase().replace(/[%_]/g, '')}%`;
    add('(LOWER(p.name) LIKE ? OR LOWER(s.store_name) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(p.origin) LIKE ?)', like, like, like, like);
  }
  if (f.category) add('c.slug = ?', f.category);
  if (f.seller) add('p.seller_id = ?', Number(f.seller));
  if (f.min_price) add(`${EFF_PRICE_SQL} >= ?`, Number(f.min_price));
  if (f.max_price) add(`${EFF_PRICE_SQL} <= ?`, Number(f.max_price));
  for (const k of ['size', 'quality', 'origin']) if (f[k]) add(`p.${k} = ?`, f[k]);
  if (f.min_rating) add('p.rating_avg >= ?', Number(f.min_rating));
  if (f.in_stock === '1') add('p.stock_kg >= p.min_order');
  if (f.max_delivery) add('p.delivery_max <= ?', Number(f.max_delivery));
  if (f.discount === '1') add('p.discount_percent > 0');
  if (f.popular === '1') add('p.is_popular = 1');
  if (f.new === '1') add('p.is_new = 1');
  if (f.seasonal === '1') add('p.is_seasonal = 1');
  if (f.ids) add(`p.id IN (${String(f.ids).split(',').map(Number).filter(Boolean).join(',') || 0})`);
  const order = SORTS[f.sort] || SORTS.popular;
  const limit = Math.min(Number(f.limit) || 60, 100);
  const offset = Math.max(Number(f.offset) || 0, 0);
  const sql = `${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order}, p.id LIMIT ${limit} OFFSET ${offset}`;
  return decorate(q.all(sql, ...args), userId);
}

export function getProduct(id, userId = null, { includeHidden = false } = {}) {
  const row = q.get(`${PRODUCT_SELECT} WHERE p.id = ?`, id);
  if (!row || (!includeHidden && (row.status !== 'active' || row.seller_status === 'suspended'))) return null;
  return decorate([row], userId)[0];
}

export function facets() {
  const col = (c) => q.all(`SELECT DISTINCT ${c} AS v FROM products WHERE status='active' ORDER BY 1`).map((r) => r.v);
  return {
    sizes: col('size'),
    qualities: col('quality'),
    origins: col('origin'),
    price: q.get(`SELECT MIN(${EFF_PRICE_SQL}) AS min, MAX(${EFF_PRICE_SQL}) AS max FROM products p WHERE status='active'`),
  };
}

/* ---------------- orders ---------------- */
export function orderView(o, { withHistory = true } = {}) {
  if (!o) return o;
  o.items = q.all(`SELECT oi.*, (SELECT url FROM product_images WHERE product_id = oi.product_id ORDER BY sort, id LIMIT 1) AS image FROM order_items oi WHERE oi.order_id = ? ORDER BY oi.id`, o.id);
  o.status_label = STATUS_LABELS[o.status];
  const s = q.get('SELECT id, store_name, phone, online, emoji, user_id FROM sellers WHERE id = ?', o.seller_id);
  o.seller = s && { id: s.id, store_name: s.store_name, phone: s.phone, online: !!s.online, emoji: s.emoji };
  o.courier = o.courier_id ? q.get('SELECT id, name, phone, status, rating, vehicle FROM couriers WHERE id = ?', o.courier_id) : null;
  if (withHistory) {
    o.history = q.all('SELECT h.status, h.note, h.created_at, u.name AS actor FROM order_status_history h LEFT JOIN users u ON u.id = h.actor_id WHERE h.order_id = ? ORDER BY h.id', o.id)
      .map((h) => ({ ...h, label: STATUS_LABELS[h.status] }));
  }
  const ret = q.get('SELECT * FROM returns WHERE order_id = ?', o.id);
  o.return = ret ? { ...ret, photos: JSON.parse(ret.photos || '[]') } : null;
  o.chat_id = q.get('SELECT id FROM chats WHERE order_id = ?', o.id)?.id ?? null;
  o.reviewed = !!q.get('SELECT 1 AS x FROM reviews WHERE order_id = ?', o.id);
  o.payable = o.status === 'returned' ? o.return?.delivery_fee ?? 0 : o.total;
  return o;
}

function adjustStock(orderId, sign) {
  for (const it of q.all('SELECT product_id, qty_kg FROM order_items WHERE order_id = ?', orderId)) {
    q.run('UPDATE products SET stock_kg = MAX(0, stock_kg + ?), sold_kg = MAX(0, sold_kg + ?) WHERE id = ?', sign * it.qty_kg, -sign * it.qty_kg, it.product_id);
  }
}
/** Reserve stock when the customer confirms the order. Throws on shortage. */
export function reserveStock(orderId) {
  for (const it of q.all('SELECT product_id, qty_kg, name FROM order_items WHERE order_id = ?', orderId)) {
    const r = q.run('UPDATE products SET stock_kg = stock_kg - ?, sold_kg = sold_kg + ? WHERE id = ? AND stock_kg >= ?', it.qty_kg, it.qty_kg, it.product_id, it.qty_kg);
    if (!r.changes) throw Object.assign(new Error(`${it.name}: omborda yetarli emas`), { shortage: true });
  }
}

/**
 * The single place order status changes happen: writes history, restores stock on
 * negative outcomes, keeps courier state in sync and fires notifications.
 */
export function setStatus(order, status, actor, note = null) {
  const prev = order.status;
  const t = now();
  q.run('UPDATE orders SET status = ?, updated_at = ?, reject_reason = COALESCE(?, reject_reason) WHERE id = ?', status, t, status === 'rejected' ? note : null, order.id);
  q.run('INSERT INTO order_status_history (order_id, status, note, actor_id, created_at) VALUES (?,?,?,?,?)', order.id, status, note, actor?.id ?? null, t);

  const wasReserved = !['draft', 'rejected', 'cancelled', 'returned'].includes(prev);
  const releases = ['rejected', 'cancelled', 'returned'].includes(status);
  if (wasReserved && releases) adjustStock(order.id, +1);

  if (status === 'handed' && !order.courier_id) autoAssignCourier(order.id);
  const cid = q.get('SELECT courier_id FROM orders WHERE id = ?', order.id).courier_id;
  if (cid) {
    if (status === 'handed' || status === 'on_way') q.run("UPDATE couriers SET status = 'delivering' WHERE id = ?", cid);
    if (status === 'delivered') q.run("UPDATE couriers SET status = 'available', completed = completed + 1 WHERE id = ?", cid);
  }

  const msg = CUSTOMER_MESSAGES[status];
  if (msg && actor?.id !== order.customer_id) {
    const body = status === 'rejected' && note ? `${msg[1]}. Sabab: ${note}` : msg[1];
    notify(order.customer_id, `order_${status}`, msg[0], `${order.code} · ${body}`, `#/orders/${order.id}`);
  }
  if (status === 'sent') {
    notify(sellerUserId(order.seller_id), 'new_order', 'Yangi buyurtma', `${order.code} · ${order.total.toLocaleString('ru-RU')} UZS`, `#/orders/${order.id}`);
    notify(adminUserIds(), 'new_order', 'Yangi buyurtma', `${order.code} · ${order.customer_name}`, `#/orders/${order.id}`);
  }
  if (status === 'cancelled' && actor?.id === order.customer_id) {
    notify(sellerUserId(order.seller_id), 'order_cancelled', 'Buyurtma bekor qilindi', order.code, `#/orders/${order.id}`);
  }
  if (status === 'handed' || status === 'on_way') {
    const c = q.get('SELECT u.id FROM couriers c JOIN users u ON u.id = c.user_id WHERE c.id = ?', cid);
    if (c && status === 'handed') notify(c.id, 'courier_task', 'Yangi yetkazish', order.code, `#/orders/${order.id}`);
  }
}

function autoAssignCourier(orderId) {
  const c = q.get(`SELECT c.id FROM couriers c WHERE c.status IN ('available','online')
    ORDER BY (SELECT COUNT(*) FROM orders o WHERE o.courier_id = c.id AND o.status IN ('handed','on_way')), c.rating DESC LIMIT 1`);
  if (c) q.run('UPDATE orders SET courier_id = ? WHERE id = ?', c.id, orderId);
}

/** Recompute denormalised rating aggregates after a review change. */
export function refreshRatings(productId, sellerId) {
  const p = q.get("SELECT AVG(rating) AS a, COUNT(*) AS n FROM reviews WHERE product_id = ? AND status='visible'", productId);
  q.run('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?', Math.round((p.a || 0) * 10) / 10, p.n, productId);
  const s = q.get("SELECT AVG(seller_rating) AS a, COUNT(*) AS n FROM reviews WHERE seller_id = ? AND status='visible'", sellerId);
  if (s.n) q.run('UPDATE sellers SET rating = ?, rating_count = ? WHERE id = ?', Math.round(s.a * 10) / 10, s.n, sellerId);
}

export function orderCode() {
  const n = (q.get('SELECT COALESCE(MAX(id),0) + 1 AS n FROM orders').n);
  return `MZ-${String(10000 + n)}`;
}
