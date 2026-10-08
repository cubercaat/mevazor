import { q, tx, now } from '../db.js';
import { HttpError, Router, badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { hashPassword, requireAuth, requireRole, signToken, verifyPassword } from '../lib/auth.js';
import { adminUserIds, notify, ownUpload, rateLimit, saveImage, sellerUserId, v, validate, validatePartial, audit } from '../lib/util.js';
import {
  FLOW, STATUS_LABELS, allowedTransitions, deliveryFee, effPrice, facets, getProduct, listProducts, orderCode, orderView,
  refreshRatings, reserveStock, returnFee, setStatus, settings,
} from '../domain.js';

export const shop = new Router();
const customerOnly = requireRole('CUSTOMER');

/* ------------------------------ public ------------------------------ */
shop.get('/api/bootstrap', (ctx) => {
  const t = now();
  return {
    categories: q.all(`SELECT c.id, c.slug, c.name, c.emoji,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status='active') AS count
      FROM categories c WHERE c.active = 1 ORDER BY c.sort, c.id`),
    settings: settings(),
    promotions: q.all('SELECT id, title, subtitle, code, discount_percent, min_total, art FROM promotions WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)', t, t),
    facets: facets(),
    flow: FLOW.map((s) => ({ key: s, label: STATUS_LABELS[s] })),
    labels: STATUS_LABELS,
  };
});

shop.get('/api/products', (ctx) => listProducts(ctx.query, ctx.user?.id));

shop.get('/api/products/:id', (ctx) => {
  const p = getProduct(Number(ctx.params.id), ctx.user?.id);
  if (!p) throw notFound('Meva topilmadi');
  p.related = listProducts({ category: p.category_slug, limit: 9 }, ctx.user?.id).filter((x) => x.id !== p.id).slice(0, 8);
  p.rating_breakdown = [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: q.get("SELECT COUNT(*) AS n FROM reviews WHERE product_id = ? AND rating = ? AND status='visible'", p.id, s).n }));
  const agg = q.get("SELECT AVG(quality_rating) AS quality, AVG(seller_rating) AS seller, AVG(delivery_rating) AS delivery FROM reviews WHERE product_id = ? AND status='visible'", p.id);
  p.rating_parts = agg;
  return p;
});

shop.get('/api/products/:id/reviews', (ctx) =>
  q.all(`SELECT r.id, r.rating, r.quality_rating, r.seller_rating, r.delivery_rating, r.body, r.photo_url, r.created_at, u.name AS author
         FROM reviews r JOIN users u ON u.id = r.customer_id
         WHERE r.product_id = ? AND r.status = 'visible' ORDER BY r.id DESC LIMIT 50`, Number(ctx.params.id))
    .map((r) => ({ ...r, author: r.author.split(' ')[0] + ' ' + (r.author.split(' ')[1]?.[0] ?? '') + '.' })));

shop.get('/api/sellers/:id', (ctx) => {
  const s = q.get("SELECT id, store_name, owner_name, address, description, emoji, rating, rating_count, online, created_at FROM sellers WHERE id = ? AND status='active'", Number(ctx.params.id));
  if (!s) throw notFound();
  s.online = !!s.online;
  s.orders_count = q.get("SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND status IN ('completed','delivered')", s.id).n;
  return s;
});

shop.post('/api/promo/validate', (ctx) => {
  const { code, total } = validate(ctx.body, { code: v.str(1, 40), total: v.num(0) });
  const t = now();
  const p = q.get('SELECT * FROM promotions WHERE UPPER(code) = UPPER(?) AND active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)', code, t, t);
  if (!p) throw badRequest('Promokod topilmadi yoki muddati tugagan');
  if (total < p.min_total) throw badRequest(`Promokod uchun kamida ${p.min_total.toLocaleString('ru-RU')} UZS xarid kerak`);
  return { code: p.code, discount_percent: p.discount_percent, title: p.title };
});

/* ------------------------------- auth ------------------------------- */
const userOut = (u) => ({ id: u.id, role: u.role, name: u.name, phone: u.phone, email: u.email, avatar: u.avatar });

shop.post('/api/auth/register', (ctx) => {
  rateLimit(`reg:${ctx.ip}`, 8, 10 * 60_000);
  const d = validate(ctx.body, { name: v.str(2, 80), phone: v.phone(), password: v.str(8, 100) });
  if (q.get('SELECT 1 AS x FROM users WHERE phone = ?', d.phone)) throw conflict('Bu raqam allaqachon ro\'yxatdan o\'tgan');
  const id = tx(() => {
    const uid = q.insert('INSERT INTO users (role, name, phone, password_hash, created_at) VALUES (?,?,?,?,?)', 'CUSTOMER', d.name, d.phone, hashPassword(d.password), now());
    q.run('INSERT INTO customers (user_id) VALUES (?)', uid);
    return uid;
  });
  const user = q.get('SELECT * FROM users WHERE id = ?', id);
  ctx.status = 201;
  return { token: signToken(user), user: userOut(user) };
});

shop.post('/api/auth/login', (ctx) => {
  rateLimit(`login:${ctx.ip}`, 12, 5 * 60_000);
  const { login, password } = validate(ctx.body, { login: v.str(3, 120), password: v.str(1, 100) });
  const digits = login.replace(/[^\d]/g, '');
  const phone = digits.length === 9 ? '+998' + digits : digits ? '+' + digits : null;
  const u = q.get('SELECT * FROM users WHERE (phone = ? OR LOWER(email) = LOWER(?))', phone, login);
  // Same message for both failure modes so accounts cannot be enumerated.
  if (!u || !verifyPassword(password, u.password_hash)) throw new HttpError(401, 'Telefon yoki parol noto\'g\'ri');
  if (u.status !== 'active') throw forbidden('Hisobingiz bloklangan');
  q.run('UPDATE users SET last_seen = ? WHERE id = ?', now(), u.id);
  ctx.user = u;
  if (u.role !== 'CUSTOMER') audit(ctx, 'login', 'user', u.id);
  return { token: signToken(u), user: userOut(u) };
});

shop.get('/api/auth/me', requireAuth, (ctx) => {
  q.run('UPDATE users SET last_seen = ? WHERE id = ?', now(), ctx.user.id);
  const u = ctx.user;
  return { ...userOut(u), permissions: u.permissions, seller_id: u.seller_id, courier_id: u.courier_id };
});

shop.patch('/api/me', requireAuth, (ctx) => {
  const d = validatePartial(ctx.body, { name: v.str(2, 80), phone: v.phone() });
  if (d.phone && q.get('SELECT 1 AS x FROM users WHERE phone = ? AND id != ?', d.phone, ctx.user.id)) throw conflict('Bu raqam band');
  if (ctx.body.new_password) {
    const cur = q.get('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
    if (!verifyPassword(String(ctx.body.current_password || ''), cur.password_hash)) throw badRequest('Joriy parol noto\'g\'ri');
    d.password_hash = hashPassword(validate(ctx.body, { new_password: v.str(8, 100) }).new_password);
  }
  const keys = Object.keys(d);
  if (keys.length) q.run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => d[k]), ctx.user.id);
  return userOut(q.get('SELECT * FROM users WHERE id = ?', ctx.user.id));
});

/* ----------------------------- addresses ----------------------------- */
const addressSchema = { label: v.str(1, 40), full_address: v.str(5, 250), apartment: v.optional(v.str(0, 100), ''), instructions: v.optional(v.str(0, 300), ''), is_default: v.optional(v.bool(), 0) };
shop.get('/api/addresses', customerOnly, (ctx) => q.all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id', ctx.user.id));
shop.post('/api/addresses', customerOnly, (ctx) => {
  const d = validate(ctx.body, addressSchema);
  const count = q.get('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', ctx.user.id).n;
  if (count >= 10) throw badRequest('Ko\'pi bilan 10 ta manzil saqlash mumkin');
  const id = tx(() => {
    if (d.is_default || !count) q.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', ctx.user.id);
    return q.insert('INSERT INTO addresses (user_id, label, full_address, apartment, instructions, is_default) VALUES (?,?,?,?,?,?)', ctx.user.id, d.label, d.full_address, d.apartment, d.instructions, d.is_default || !count ? 1 : 0);
  });
  ctx.status = 201;
  return q.get('SELECT * FROM addresses WHERE id = ?', id);
});
shop.patch('/api/addresses/:id', customerOnly, (ctx) => {
  const a = q.get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', Number(ctx.params.id), ctx.user.id);
  if (!a) throw notFound();
  const d = validatePartial(ctx.body, addressSchema);
  tx(() => {
    if (d.is_default) q.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', ctx.user.id);
    const keys = Object.keys(d);
    if (keys.length) q.run(`UPDATE addresses SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => d[k]), a.id);
  });
  return q.get('SELECT * FROM addresses WHERE id = ?', a.id);
});
shop.delete('/api/addresses/:id', customerOnly, (ctx) => {
  q.run('DELETE FROM addresses WHERE id = ? AND user_id = ?', Number(ctx.params.id), ctx.user.id);
  return { ok: true };
});

/* ----------------------------- favorites ----------------------------- */
shop.get('/api/favorites', customerOnly, (ctx) => {
  const ids = q.all('SELECT product_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC', ctx.user.id).map((r) => r.product_id);
  if (!ids.length) return [];
  const list = listProducts({ ids: ids.join(','), limit: 100 }, ctx.user.id);
  return ids.map((id) => list.find((p) => p.id === id)).filter(Boolean);
});
shop.post('/api/favorites/:id', customerOnly, (ctx) => {
  const pid = Number(ctx.params.id);
  if (!q.get('SELECT 1 AS x FROM products WHERE id = ?', pid)) throw notFound();
  const had = q.run('DELETE FROM favorites WHERE user_id = ? AND product_id = ?', ctx.user.id, pid).changes;
  if (!had) q.run('INSERT INTO favorites (user_id, product_id, created_at) VALUES (?,?,?)', ctx.user.id, pid, now());
  return { is_fav: !had };
});

/* ------------------------------ orders ------------------------------ */
/** Creates one DRAFT order per seller. Nothing reaches the seller until the customer confirms. */
shop.post('/api/orders', customerOnly, (ctx) => {
  rateLimit(`order:${ctx.user.id}`, 10, 10 * 60_000);
  const d = validate(ctx.body, {
    customer_name: v.str(2, 80), phone: v.phone(), address: v.str(5, 250),
    apartment: v.optional(v.str(0, 100), ''), instructions: v.optional(v.str(0, 300), ''),
    promo_code: v.optional(v.str(0, 40), null),
  });
  const rawItems = Array.isArray(ctx.body.items) ? ctx.body.items.slice(0, 50) : [];
  if (!rawItems.length) throw badRequest('Savat bo\'sh');

  const s = settings();
  const lines = rawItems.map((it) => {
    const p = getProduct(Number(it.product_id), null);
    const qty = Math.round(Number(it.qty_kg) * 100) / 100;
    if (!p) throw badRequest('Savatdagi mahsulotlardan biri mavjud emas');
    if (!(qty >= p.min_order) || qty > p.max_order) throw badRequest(`${p.name}: ${p.min_order}–${p.max_order} kg oralig'ida bo'lishi kerak`);
    if (qty > p.stock_kg) throw badRequest(`${p.name}: omborda faqat ${p.stock_kg} kg qolgan`);
    return { p, qty, price: effPrice(p), line: Math.round(effPrice(p) * qty) };
  });

  let promo = null;
  if (d.promo_code) {
    const t = now();
    promo = q.get('SELECT * FROM promotions WHERE UPPER(code) = UPPER(?) AND active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)', d.promo_code, t, t);
    const grand = lines.reduce((a, l) => a + l.line, 0);
    if (!promo || grand < promo.min_total) throw badRequest('Promokod yaroqsiz');
  }

  const bySeller = new Map();
  for (const l of lines) (bySeller.get(l.p.seller_id) ?? bySeller.set(l.p.seller_id, []).get(l.p.seller_id)).push(l);

  const result = tx(() => {
    const group = 'G' + Date.now().toString(36).toUpperCase();
    const ids = [];
    for (const [sellerId, ls] of bySeller) {
      const items = ls.reduce((a, l) => a + l.line, 0);
      const discount = promo ? Math.round((items * promo.discount_percent) / 100) : 0;
      const fee = deliveryFee(items - discount, s);
      const t = now();
      const id = q.insert(
        `INSERT INTO orders (code, group_code, customer_id, seller_id, status, items_total, discount_amount, promo_code, delivery_fee, total,
          customer_name, phone, address, apartment, instructions, eta_min, eta_max, created_at, updated_at)
         VALUES (?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        orderCode(), group, ctx.user.id, sellerId, items, discount, promo?.code ?? null, fee, items - discount + fee,
        d.customer_name, d.phone, d.address, d.apartment, d.instructions,
        Math.max(...ls.map((l) => l.p.delivery_min), s.eta_min), Math.max(...ls.map((l) => l.p.delivery_max), s.eta_max), t, t,
      );
      for (const l of ls) {
        q.run('INSERT INTO order_items (order_id, product_id, name, art, tint, price_per_kg, qty_kg, line_total) VALUES (?,?,?,?,?,?,?,?)', id, l.p.id, l.p.name, l.p.art, l.p.tint, l.price, l.qty, l.line);
      }
      q.run('INSERT INTO order_status_history (order_id, status, note, actor_id, created_at) VALUES (?,?,?,?,?)', id, 'draft', 'Tasdiqlash kutilmoqda', ctx.user.id, t);
      ids.push(id);
    }
    return { group, ids };
  });
  ctx.status = 201;
  return { group_code: result.group, orders: result.ids.map((id) => orderView(q.get('SELECT * FROM orders WHERE id = ?', id), { withHistory: false })) };
});

shop.get('/api/orders', customerOnly, (ctx) => {
  const rows = q.all('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 100', ctx.user.id);
  return rows.map((o) => orderView(o, { withHistory: false }));
});

function ownOrder(ctx) {
  const o = q.get('SELECT * FROM orders WHERE id = ? AND customer_id = ?', Number(ctx.params.id), ctx.user.id);
  if (!o) throw notFound('Buyurtma topilmadi');
  return o;
}

shop.get('/api/orders/:id', customerOnly, (ctx) => orderView(ownOrder(ctx)));

function confirmOne(o, actor) {
  if (o.status !== 'draft') return;
  try {
    reserveStock(o.id);
  } catch (e) {
    if (e.shortage) throw conflict(e.message);
    throw e;
  }
  q.run('UPDATE orders SET confirmed_at = ? WHERE id = ?', now(), o.id);
  setStatus(o, 'sent', actor, 'Mijoz buyurtmani tasdiqladi');
}

shop.post('/api/orders/:id/confirm', customerOnly, (ctx) => {
  const o = ownOrder(ctx);
  if (o.status !== 'draft') throw conflict('Buyurtma allaqachon tasdiqlangan');
  tx(() => confirmOne(o, ctx.user));
  return orderView(q.get('SELECT * FROM orders WHERE id = ?', o.id));
});
shop.post('/api/orders/confirm-group/:code', customerOnly, (ctx) => {
  const rows = q.all("SELECT * FROM orders WHERE group_code = ? AND customer_id = ? AND status = 'draft'", ctx.params.code, ctx.user.id);
  if (!rows.length) throw notFound('Tasdiqlanadigan buyurtma yo\'q');
  tx(() => rows.forEach((o) => confirmOne(o, ctx.user)));
  return { confirmed: rows.map((r) => r.id) };
});

shop.post('/api/orders/:id/cancel', customerOnly, (ctx) => {
  const o = ownOrder(ctx);
  if (!allowedTransitions('CUSTOMER', o.status).includes('cancelled')) throw conflict('Bu bosqichda bekor qilib bo\'lmaydi');
  tx(() => setStatus(o, 'cancelled', ctx.user, ctx.body.reason ? String(ctx.body.reason).slice(0, 200) : 'Mijoz bekor qildi'));
  return orderView(q.get('SELECT * FROM orders WHERE id = ?', o.id));
});

shop.post('/api/orders/:id/complete', customerOnly, (ctx) => {
  const o = ownOrder(ctx);
  if (o.status !== 'delivered') throw conflict('Buyurtma hali yetkazilmagan');
  tx(() => setStatus(o, 'completed', ctx.user, 'Mijoz mevalarni qabul qildi'));
  return orderView(q.get('SELECT * FROM orders WHERE id = ?', o.id));
});

export const RETURN_REASONS = ['Meva yetarlicha yangi emas', 'Mevalar ezilgan yoki buzilgan', 'Hajmi va\'da qilinganidan farq qiladi', 'Mevalar pishmagan yoki o\'ta pishgan', 'Boshqa sabab'];
shop.post('/api/orders/:id/return', customerOnly, (ctx) => {
  const o = ownOrder(ctx);
  if (o.status !== 'delivered') throw conflict('Qaytarish faqat yetkazib berilgan paytda mumkin');
  const d = validate(ctx.body, { reason: v.oneOf(...RETURN_REASONS), note: v.optional(v.str(0, 500), '') });
  const photos = (Array.isArray(ctx.body.photos) ? ctx.body.photos : []).map(ownUpload).filter(Boolean).slice(0, 4);
  const fee = returnFee(o);
  tx(() => {
    const t = now();
    q.insert('INSERT INTO returns (order_id, customer_id, seller_id, reason, note, photos, delivery_fee, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)', o.id, o.customer_id, o.seller_id, d.reason, d.note, JSON.stringify(photos), fee, t, t);
    setStatus(o, 'return_requested', ctx.user, d.reason);
    notify(adminUserIds(), 'return_request', "Qaytarish so'rovi", `${o.code} · ${d.reason}`, `#/returns`);
    notify(sellerUserId(o.seller_id), 'return_request', "Qaytarish so'rovi", `${o.code} · ${d.reason}`, `#/returns`);
  });
  return orderView(q.get('SELECT * FROM orders WHERE id = ?', o.id));
});

shop.post('/api/orders/:id/review', customerOnly, (ctx) => {
  const o = ownOrder(ctx);
  if (!['delivered', 'completed'].includes(o.status)) throw conflict('Sharh faqat yetkazilgan buyurtma uchun');
  if (q.get('SELECT 1 AS x FROM reviews WHERE order_id = ?', o.id)) throw conflict('Siz allaqachon sharh qoldirgansiz');
  const star = v.int(1, 5);
  const d = validate(ctx.body, { rating: star, quality_rating: star, seller_rating: star, delivery_rating: star, body: v.optional(v.str(0, 800), '') });
  const photo = ownUpload(ctx.body.photo_url);
  tx(() => {
    const items = q.all('SELECT DISTINCT product_id FROM order_items WHERE order_id = ?', o.id);
    for (const it of items) {
      q.run('INSERT INTO reviews (order_id, product_id, customer_id, seller_id, rating, quality_rating, seller_rating, delivery_rating, body, photo_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        o.id, it.product_id, o.customer_id, o.seller_id, d.rating, d.quality_rating, d.seller_rating, d.delivery_rating, d.body, photo, now());
      refreshRatings(it.product_id, o.seller_id);
    }
    notify(sellerUserId(o.seller_id), 'review', 'Yangi sharh', `${o.code} · ${d.rating}★`, '#/reviews');
  });
  return { ok: true };
});

shop.get('/api/returns', customerOnly, (ctx) =>
  q.all(`SELECT r.*, o.code, s.store_name FROM returns r JOIN orders o ON o.id = r.order_id JOIN sellers s ON s.id = r.seller_id
         WHERE r.customer_id = ? ORDER BY r.id DESC`, ctx.user.id).map((r) => ({ ...r, photos: JSON.parse(r.photos) })));

/* --------------------------- notifications --------------------------- */
shop.get('/api/notifications', requireAuth, (ctx) => ({
  items: q.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60', ctx.user.id),
  unread: q.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', ctx.user.id).n,
}));
shop.post('/api/notifications/read', requireAuth, (ctx) => {
  const id = Number(ctx.body.id);
  if (id) q.run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?', now(), id, ctx.user.id);
  else q.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), ctx.user.id);
  return { ok: true };
});

/* ------------------------------ uploads ------------------------------ */
shop.post('/api/uploads', requireAuth, (ctx) => {
  rateLimit(`upload:${ctx.user.id}`, 30, 10 * 60_000);
  return { url: saveImage(ctx.body.data) };
});
