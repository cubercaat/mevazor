import { q, tx, now } from '../db.js';
import { Router, badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { hashPassword, requireAuth } from '../lib/auth.js';
import { audit, notify, ownUpload, v, validate, validatePartial, sellerUserId } from '../lib/util.js';
import { ALL_STATUSES, STATUS_LABELS, TZ, allowedTransitions, orderView, setStatus, settings } from '../domain.js';

export const admin = new Router();

/* ------------------------------ RBAC ------------------------------ */
export const ADMIN_PERMS = ['dashboard', 'products', 'categories', 'orders', 'customers', 'sellers', 'couriers', 'chats', 'reviews', 'returns', 'promotions', 'delivery', 'analytics'];
const SELLER_PERMS = ['dashboard', 'products', 'orders', 'chats', 'reviews', 'returns'];
const COURIER_PERMS = ['orders'];

export function permsFor(u) {
  if (u.role === 'SUPER_ADMIN') return [...ADMIN_PERMS, 'team', 'audit', 'settings'];
  if (u.role === 'ADMIN') return [...u.permissions, 'settings'].filter((p, i, a) => a.indexOf(p) === i);
  if (u.role === 'SELLER') return SELLER_PERMS;
  if (u.role === 'COURIER') return COURIER_PERMS;
  return [];
}
const can = (perm) => (ctx) => {
  requireAuth(ctx);
  if (!permsFor(ctx.user).includes(perm)) throw forbidden();
};
const canAny = (...perms) => (ctx) => {
  requireAuth(ctx);
  const have = permsFor(ctx.user);
  if (!perms.some((p) => have.includes(p))) throw forbidden();
};
const superOnly = (ctx) => {
  requireAuth(ctx);
  if (ctx.user.role !== 'SUPER_ADMIN') throw forbidden();
};
const staffOnlyAdmin = (ctx) => {
  requireAuth(ctx);
  if (!['ADMIN', 'SUPER_ADMIN'].includes(ctx.user.role)) throw forbidden();
};
/** Row-level scope: sellers only see their own rows, couriers their assigned orders. */
const sellerScope = (ctx, col) => {
  const id = ctx.user.role === 'SELLER' ? ctx.user.seller_id : null;
  return { sql: `(? IS NULL OR ${col} = ?)`, args: [id, id] };
};
const isTeam = (u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN';
const patchSql = (table, d, id) => {
  const keys = Object.keys(d);
  if (keys.length) q.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => d[k]), id);
};

admin.get('/api/admin/meta', requireAuth, (ctx) => ({
  permissions: permsFor(ctx.user), all_permissions: ADMIN_PERMS, statuses: STATUS_LABELS, role: ctx.user.role,
  seller: ctx.user.seller_id ? q.get('SELECT id, store_name FROM sellers WHERE id = ?', ctx.user.seller_id) : null,
}));

/* ---------------------------- dashboard ---------------------------- */
const ACTIVE = "('sent','reviewing','accepted','preparing','handed','on_way')";
const DONE = "('delivered','completed')";

admin.get('/api/admin/stats', canAny('dashboard', 'analytics'), (ctx) => {
  const sc = sellerScope(ctx, 'o.seller_id');
  const one = (where, ...a) => q.get(`SELECT COUNT(*) AS n, COALESCE(SUM(o.total),0) AS sum FROM orders o WHERE ${sc.sql} AND ${where}`, ...sc.args, ...a);
  const today = `date(o.created_at,'${TZ}') = date('now','${TZ}') AND o.status != 'draft'`;
  const ts = one(today);
  const dl = q.get(`SELECT AVG(mins) AS avg, SUM(CASE WHEN mins <= 60 THEN 1 ELSE 0 END) * 100.0 / MAX(COUNT(*),1) AS on_time, COUNT(*) AS n FROM (
      SELECT (julianday(d.created_at) - julianday(h.created_at)) * 1440 AS mins FROM orders o
      JOIN order_status_history h ON h.order_id = o.id AND h.status = 'handed'
      JOIN order_status_history d ON d.order_id = o.id AND d.status = 'delivered' WHERE ${sc.sql})`, ...sc.args);
  const retN = q.get(`SELECT COUNT(*) AS n FROM returns r WHERE ${sellerScope(ctx, 'r.seller_id').sql}`, ...sellerScope(ctx, 'r.seller_id').args).n;
  const isSeller = ctx.user.role === 'SELLER';
  return {
    orders_today: ts.n, revenue_today: ts.sum,
    total_sales: one(`o.status IN ${DONE}`).sum,
    active_orders: one(`o.status IN ${ACTIVE}`).n,
    completed_orders: one(`o.status IN ${DONE}`).n,
    cancelled_orders: one("o.status IN ('cancelled','rejected')").n,
    returns: retN,
    pending_returns: q.get(`SELECT COUNT(*) AS n FROM returns r WHERE r.status='pending' AND ${sellerScope(ctx, 'r.seller_id').sql}`, ...sellerScope(ctx, 'r.seller_id').args).n,
    awaiting_seller: one("o.status IN ('sent','reviewing')").n,
    customers: q.get("SELECT COUNT(*) AS n FROM users WHERE role='CUSTOMER'").n,
    sellers: q.get("SELECT COUNT(*) AS n FROM sellers WHERE status='active'").n,
    products: q.get(`SELECT COUNT(*) AS n FROM products p WHERE p.status='active' AND ${sellerScope(ctx, 'p.seller_id').sql}`, ...sellerScope(ctx, 'p.seller_id').args).n,
    delivery: {
      avg_minutes: Math.round(dl.avg || 0), on_time_percent: Math.round(dl.on_time || 0), delivered: dl.n,
      couriers_online: isSeller ? null : q.get("SELECT COUNT(*) AS n FROM couriers WHERE status != 'offline'").n,
      couriers_total: isSeller ? null : q.get('SELECT COUNT(*) AS n FROM couriers').n,
    },
    recent_orders: q.all(`SELECT o.id, o.code, o.customer_name, o.total, o.status, o.created_at, s.store_name FROM orders o JOIN sellers s ON s.id = o.seller_id
      WHERE o.status != 'draft' AND ${sc.sql} ORDER BY o.id DESC LIMIT 8`, ...sc.args).map((o) => ({ ...o, status_label: STATUS_LABELS[o.status] })),
    low_stock: q.all(`SELECT p.id, p.name, p.art, p.tint, (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort, id LIMIT 1) AS image, p.stock_kg, s.store_name FROM products p JOIN sellers s ON s.id = p.seller_id
      WHERE p.status='active' AND p.stock_kg < 30 AND ${sellerScope(ctx, 'p.seller_id').sql} ORDER BY p.stock_kg LIMIT 6`, ...sellerScope(ctx, 'p.seller_id').args),
  };
});

admin.get('/api/admin/analytics', canAny('dashboard', 'analytics'), (ctx) => {
  const days = Math.min(Math.max(Number(ctx.query.days) || 14, 7), 90);
  const sc = sellerScope(ctx, 'o.seller_id');
  const since = `date('now','${TZ}','-${days - 1} days')`;
  const dayExpr = `date(o.created_at,'${TZ}')`;
  const series = q.all(`SELECT ${dayExpr} AS day, COUNT(*) AS orders,
      COALESCE(SUM(CASE WHEN o.status IN ${DONE} THEN o.total END),0) AS revenue,
      SUM(CASE WHEN o.status IN ('cancelled','rejected') THEN 1 ELSE 0 END) AS cancelled
    FROM orders o WHERE o.status != 'draft' AND ${dayExpr} >= ${since} AND ${sc.sql} GROUP BY day`, ...sc.args);
  const rets = q.all(`SELECT date(r.created_at,'${TZ}') AS day, COUNT(*) AS n FROM returns r WHERE date(r.created_at,'${TZ}') >= ${since} AND ${sellerScope(ctx, 'r.seller_id').sql} GROUP BY day`, ...sellerScope(ctx, 'r.seller_id').args);
  const byDay = new Map(series.map((r) => [r.day, r]));
  const retByDay = new Map(rets.map((r) => [r.day, r.n]));
  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() + 5 * 3600_000 - i * 86400_000).toISOString().slice(0, 10);
    const r = byDay.get(d) ?? { orders: 0, revenue: 0, cancelled: 0 };
    const rn = retByDay.get(d) ?? 0;
    daily.push({ day: d, orders: r.orders, revenue: r.revenue, cancelled: r.cancelled, returns: rn, return_rate: r.orders ? Math.round((rn / r.orders) * 1000) / 10 : 0 });
  }
  const valid = "o.status NOT IN ('draft','cancelled','rejected')";
  const popular = q.all(`SELECT i.name, i.art, i.tint, (SELECT url FROM product_images WHERE product_id = i.product_id ORDER BY sort, id LIMIT 1) AS image, ROUND(SUM(i.qty_kg),1) AS kg, SUM(i.line_total) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE ${valid} AND ${dayExpr} >= ${since} AND ${sc.sql} GROUP BY i.product_id ORDER BY kg DESC LIMIT 8`, ...sc.args);
  const sellers = ctx.user.role === 'SELLER' ? [] : q.all(`SELECT s.id, s.store_name, s.emoji, COUNT(*) AS orders, COALESCE(SUM(o.total),0) AS revenue FROM orders o JOIN sellers s ON s.id = o.seller_id
    WHERE ${valid} AND ${dayExpr} >= ${since} GROUP BY s.id ORDER BY orders DESC LIMIT 6`);
  const durations = q.all(`SELECT (julianday(d.created_at) - julianday(h.created_at)) * 1440 AS mins FROM orders o
      JOIN order_status_history h ON h.order_id = o.id AND h.status = 'handed'
      JOIN order_status_history d ON d.order_id = o.id AND d.status = 'delivered' WHERE ${dayExpr} >= ${since} AND ${sc.sql}`, ...sc.args).map((r) => r.mins);
  const buckets = [['≤ 30 daq', 0, 30], ['30–45 daq', 30, 45], ['45–60 daq', 45, 60], ['> 60 daq', 60, 1e9]]
    .map(([label, lo, hi]) => ({ label, count: durations.filter((m) => m > lo && m <= hi || (lo === 0 && m <= 0)).length }));
  const statuses = q.all(`SELECT o.status, COUNT(*) AS n FROM orders o WHERE o.status != 'draft' AND ${dayExpr} >= ${since} AND ${sc.sql} GROUP BY o.status ORDER BY n DESC`, ...sc.args)
    .map((r) => ({ status: r.status, label: STATUS_LABELS[r.status], count: r.n }));
  const categories = q.all(`SELECT c.name, ROUND(SUM(i.qty_kg),1) AS kg FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id JOIN categories c ON c.id = p.category_id
    WHERE ${valid} AND ${dayExpr} >= ${since} AND ${sc.sql} GROUP BY c.id ORDER BY kg DESC`, ...sc.args);
  const totalOrders = daily.reduce((a, d) => a + d.orders, 0);
  const totalReturns = daily.reduce((a, d) => a + d.returns, 0);
  return {
    days, daily, popular, sellers, delivery: { buckets, avg: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0, count: durations.length },
    statuses, categories, return_rate: totalOrders ? Math.round((totalReturns / totalOrders) * 1000) / 10 : 0,
    totals: { orders: totalOrders, revenue: daily.reduce((a, d) => a + d.revenue, 0), returns: totalReturns },
  };
});

/* ----------------------------- products ----------------------------- */
const hexColor = (x, k) => {
  if (!/^#[0-9a-fA-F]{3,8}$/.test(String(x))) throw badRequest(`${k}: rang noto'g'ri`);
  return x;
};
const productSchema = {
  name: v.str(2, 80), category_id: v.int(1), description: v.optional(v.str(0, 2000), ''),
  price_per_kg: v.int(0, 10_000_000), discount_percent: v.optional(v.int(0, 90), 0), stock_kg: v.num(0, 1_000_000),
  min_order: v.optional(v.num(0.1, 1000), 0.5), max_order: v.optional(v.num(0.1, 10_000), 20),
  size: v.str(1, 40), quality: v.str(1, 40), origin: v.str(1, 60), harvest_info: v.optional(v.str(0, 300), ''),
  art: v.optional(v.str(0, 16), ''), tint: v.optional(hexColor, ''),
  status: v.oneOf('active', 'hidden'), is_popular: v.bool(), is_new: v.bool(), is_seasonal: v.bool(),
  delivery_min: v.optional(v.int(5, 1440), 30), delivery_max: v.optional(v.int(5, 2880), 60),
};
const PRODUCT_LIST_SQL = `SELECT p.*, s.store_name, c.name AS category_name FROM products p JOIN sellers s ON s.id = p.seller_id JOIN categories c ON c.id = p.category_id`;
const withImages = (p) => ({ ...p, images: q.all('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort, id', p.id).map((i) => i.url) });

admin.get('/api/admin/products', can('products'), (ctx) => {
  const sc = sellerScope(ctx, 'p.seller_id');
  const where = [sc.sql];
  const args = [...sc.args];
  if (ctx.query.q) { where.push('(LOWER(p.name) LIKE ? OR LOWER(s.store_name) LIKE ?)'); const l = `%${ctx.query.q.toLowerCase()}%`; args.push(l, l); }
  if (ctx.query.status) { where.push('p.status = ?'); args.push(ctx.query.status); }
  if (ctx.query.category) { where.push('p.category_id = ?'); args.push(Number(ctx.query.category)); }
  return q.all(`${PRODUCT_LIST_SQL} WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 300`, ...args).map(withImages);
});
admin.get('/api/admin/products/:id', can('products'), (ctx) => {
  const p = q.get(`${PRODUCT_LIST_SQL} WHERE p.id = ?`, Number(ctx.params.id));
  if (!p || (ctx.user.role === 'SELLER' && p.seller_id !== ctx.user.seller_id)) throw notFound();
  return withImages(p);
});

function checkProduct(d) {
  if (d.min_order != null && d.max_order != null && d.min_order > d.max_order) throw badRequest('Minimal buyurtma maksimaldan katta bo\'lmasligi kerak');
  if (d.delivery_min != null && d.delivery_max != null && d.delivery_min > d.delivery_max) throw badRequest('Yetkazib berish vaqti noto\'g\'ri');
  if (d.category_id != null && !q.get('SELECT 1 AS x FROM categories WHERE id = ?', d.category_id)) throw badRequest('Kategoriya topilmadi');
}
function saveImages(productId, imgs) {
  const urls = (Array.isArray(imgs) ? imgs : []).map(ownUpload).filter(Boolean).slice(0, 8);
  q.run('DELETE FROM product_images WHERE product_id = ?', productId);
  urls.forEach((u, i) => q.run('INSERT INTO product_images (product_id, url, sort) VALUES (?,?,?)', productId, u, i));
}

admin.post('/api/admin/products', can('products'), (ctx) => {
  const d = validate(ctx.body, productSchema);
  checkProduct(d);
  const sellerId = ctx.user.role === 'SELLER' ? ctx.user.seller_id : Number(ctx.body.seller_id);
  if (!q.get('SELECT 1 AS x FROM sellers WHERE id = ?', sellerId)) throw badRequest('Sotuvchini tanlang');
  const id = tx(() => {
    const pid = q.insert(`INSERT INTO products (seller_id, category_id, name, description, price_per_kg, discount_percent, stock_kg, min_order, max_order, size, quality, origin, harvest_info, art, tint, status, is_popular, is_new, is_seasonal, delivery_min, delivery_max, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, sellerId, d.category_id, d.name, d.description, d.price_per_kg, d.discount_percent, d.stock_kg, d.min_order, d.max_order, d.size, d.quality, d.origin, d.harvest_info, d.art || '🍎', d.tint || '#F4E4D4', d.status, d.is_popular, d.is_new, d.is_seasonal, d.delivery_min, d.delivery_max, now());
    saveImages(pid, ctx.body.images);
    return pid;
  });
  audit(ctx, 'product.create', 'product', id, { name: d.name });
  ctx.status = 201;
  return withImages(q.get(`${PRODUCT_LIST_SQL} WHERE p.id = ?`, id));
});

admin.put('/api/admin/products/:id', can('products'), (ctx) => {
  const p = q.get('SELECT * FROM products WHERE id = ?', Number(ctx.params.id));
  if (!p || (ctx.user.role === 'SELLER' && p.seller_id !== ctx.user.seller_id)) throw notFound();
  const d = validatePartial(ctx.body, productSchema);
  checkProduct({ min_order: p.min_order, max_order: p.max_order, delivery_min: p.delivery_min, delivery_max: p.delivery_max, ...d });
  if (isTeam(ctx.user) && ctx.body.seller_id && q.get('SELECT 1 AS x FROM sellers WHERE id = ?', Number(ctx.body.seller_id))) d.seller_id = Number(ctx.body.seller_id);
  tx(() => {
    patchSql('products', d, p.id);
    if ('images' in ctx.body) saveImages(p.id, ctx.body.images);
  });
  audit(ctx, 'product.update', 'product', p.id, Object.keys(d));
  return withImages(q.get(`${PRODUCT_LIST_SQL} WHERE p.id = ?`, p.id));
});

admin.delete('/api/admin/products/:id', can('products'), (ctx) => {
  const p = q.get('SELECT * FROM products WHERE id = ?', Number(ctx.params.id));
  if (!p || (ctx.user.role === 'SELLER' && p.seller_id !== ctx.user.seller_id)) throw notFound();
  const used = q.get('SELECT 1 AS x FROM order_items WHERE product_id = ?', p.id);
  if (used) {
    q.run("UPDATE products SET status = 'hidden' WHERE id = ?", p.id);
    audit(ctx, 'product.archive', 'product', p.id);
    return { archived: true };
  }
  q.run('DELETE FROM products WHERE id = ?', p.id);
  audit(ctx, 'product.delete', 'product', p.id, { name: p.name });
  return { deleted: true };
});

/* ---------------------------- categories ---------------------------- */
const catSchema = { name: v.str(2, 60), emoji: v.optional(v.str(0, 8), ''), sort: v.optional(v.int(0, 999), 0), active: v.bool() };
const slugify = (s) => s.toLowerCase().replace(/[‘’ʻ'`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kategoriya';
admin.get('/api/admin/categories', can('products'), () => q.all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS products FROM categories c ORDER BY sort, id'));
admin.post('/api/admin/categories', can('categories'), (ctx) => {
  const d = validate(ctx.body, catSchema);
  let slug = slugify(d.name);
  if (q.get('SELECT 1 AS x FROM categories WHERE slug = ?', slug)) slug += '-' + Date.now().toString(36).slice(-3);
  const id = q.insert('INSERT INTO categories (slug, name, emoji, sort, active) VALUES (?,?,?,?,?)', slug, d.name, d.emoji, d.sort, d.active);
  audit(ctx, 'category.create', 'category', id);
  ctx.status = 201;
  return q.get('SELECT * FROM categories WHERE id = ?', id);
});
admin.put('/api/admin/categories/:id', can('categories'), (ctx) => {
  const id = Number(ctx.params.id);
  if (!q.get('SELECT 1 AS x FROM categories WHERE id = ?', id)) throw notFound();
  patchSql('categories', validatePartial(ctx.body, catSchema), id);
  audit(ctx, 'category.update', 'category', id);
  return q.get('SELECT * FROM categories WHERE id = ?', id);
});
admin.delete('/api/admin/categories/:id', can('categories'), (ctx) => {
  const id = Number(ctx.params.id);
  if (q.get('SELECT 1 AS x FROM products WHERE category_id = ?', id)) throw conflict('Kategoriyada mevalar bor. Avval ularni boshqa kategoriyaga o\'tkazing');
  q.run('DELETE FROM categories WHERE id = ?', id);
  audit(ctx, 'category.delete', 'category', id);
  return { deleted: true };
});

/* ------------------------------ orders ------------------------------ */
function orderScope(ctx) {
  const u = ctx.user;
  if (u.role === 'SELLER') return { sql: 'o.seller_id = ?', args: [u.seller_id] };
  if (u.role === 'COURIER') return { sql: 'o.courier_id = ?', args: [u.courier_id] };
  return { sql: '1=1', args: [] };
}
admin.get('/api/admin/orders', can('orders'), (ctx) => {
  const sc = orderScope(ctx);
  const where = [sc.sql, "o.status != 'draft'"];
  const args = [...sc.args];
  const f = ctx.query;
  if (f.status === 'active') where.push(`o.status IN ${ACTIVE}`);
  else if (f.status) { where.push('o.status = ?'); args.push(f.status); }
  if (f.seller) { where.push('o.seller_id = ?'); args.push(Number(f.seller)); }
  if (f.q) { where.push('(LOWER(o.code) LIKE ? OR LOWER(o.customer_name) LIKE ? OR o.phone LIKE ?)'); const l = `%${f.q.toLowerCase()}%`; args.push(l, l, l); }
  if (f.from) { where.push(`date(o.created_at,'${TZ}') >= ?`); args.push(f.from); }
  if (f.to) { where.push(`date(o.created_at,'${TZ}') <= ?`); args.push(f.to); }
  const rows = q.all(`SELECT o.*, s.store_name, c.name AS courier_name,
      (SELECT GROUP_CONCAT(i.name || ' ' || i.qty_kg || 'kg', ', ') FROM order_items i WHERE i.order_id = o.id) AS products
    FROM orders o JOIN sellers s ON s.id = o.seller_id LEFT JOIN couriers c ON c.id = o.courier_id
    WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT ${Math.min(Number(f.limit) || 150, 500)}`, ...args);
  return rows.map((o) => ({ ...o, status_label: STATUS_LABELS[o.status], next: allowedTransitions(ctx.user.role, o.status) }));
});

function loadOrder(ctx) {
  const o = q.get('SELECT * FROM orders WHERE id = ?', Number(ctx.params.id));
  const sc = orderScope(ctx);
  if (!o || o.status === 'draft' || (ctx.user.role === 'SELLER' && o.seller_id !== ctx.user.seller_id) || (ctx.user.role === 'COURIER' && o.courier_id !== ctx.user.courier_id)) throw notFound('Buyurtma topilmadi');
  void sc;
  return o;
}
admin.get('/api/admin/orders/:id', can('orders'), (ctx) => {
  const o = orderView(loadOrder(ctx));
  o.customer = q.get('SELECT u.id, u.name, u.phone, u.created_at, (SELECT COUNT(*) FROM orders x WHERE x.customer_id = u.id AND x.status != \'draft\') AS orders_count FROM users u WHERE u.id = ?', o.customer_id);
  o.seller_full = q.get('SELECT id, store_name, owner_name, phone, address, rating FROM sellers WHERE id = ?', o.seller_id);
  o.next = allowedTransitions(ctx.user.role, o.status);
  if (o.chat_id && ctx.user.role !== 'COURIER') {
    o.messages = q.all('SELECT id, sender_role, body, image_url, created_at FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 12', o.chat_id).reverse();
  }
  if (ctx.user.role === 'COURIER') delete o.seller_full;
  return o;
});
admin.post('/api/admin/orders/:id/status', can('orders'), (ctx) => {
  const o = loadOrder(ctx);
  const { status, note } = validate(ctx.body, { status: v.oneOf(...ALL_STATUSES), note: v.optional(v.str(0, 300), null) });
  if (!allowedTransitions(ctx.user.role, o.status).includes(status)) throw conflict(`"${STATUS_LABELS[o.status]}" holatidan "${STATUS_LABELS[status]}" holatiga o'tib bo'lmaydi`);
  if (status === 'rejected' && ctx.user.role === 'SELLER' && !note) throw badRequest('Rad etish sababini yozing');
  tx(() => setStatus(o, status, ctx.user, note));
  audit(ctx, 'order.status', 'order', o.id, { from: o.status, to: status });
  return orderView(q.get('SELECT * FROM orders WHERE id = ?', o.id));
});
admin.post('/api/admin/orders/:id/courier', can('couriers'), (ctx) => {
  const o = loadOrder(ctx);
  const cid = Number(ctx.body.courier_id);
  if (!q.get('SELECT 1 AS x FROM couriers WHERE id = ?', cid)) throw badRequest('Kuryer topilmadi');
  q.run('UPDATE orders SET courier_id = ?, updated_at = ? WHERE id = ?', cid, now(), o.id);
  const cu = q.get('SELECT user_id FROM couriers WHERE id = ?', cid).user_id;
  notify(cu, 'courier_task', 'Yangi yetkazish', o.code, `#/orders/${o.id}`);
  audit(ctx, 'order.courier', 'order', o.id, { courier_id: cid });
  return orderView(q.get('SELECT * FROM orders WHERE id = ?', o.id));
});

/* ---------------------------- customers ---------------------------- */
admin.get('/api/admin/customers', can('customers'), (ctx) => {
  const l = `%${(ctx.query.q || '').toLowerCase()}%`;
  return q.all(`SELECT u.id, u.name, u.phone, u.status, u.created_at, u.last_seen,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id AND o.status != 'draft') AS orders_count,
      (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.customer_id = u.id AND o.status IN ${DONE}) AS spent,
      (SELECT COUNT(*) FROM returns r WHERE r.customer_id = u.id) AS returns_count
    FROM users u WHERE u.role = 'CUSTOMER' AND (LOWER(u.name) LIKE ? OR u.phone LIKE ?) ORDER BY u.id DESC LIMIT 300`, l, l);
});
admin.get('/api/admin/customers/:id', can('customers'), (ctx) => {
  const u = q.get("SELECT id, name, phone, status, created_at, last_seen FROM users WHERE id = ? AND role='CUSTOMER'", Number(ctx.params.id));
  if (!u) throw notFound();
  u.addresses = q.all('SELECT * FROM addresses WHERE user_id = ?', u.id);
  u.orders = q.all("SELECT id, code, total, status, created_at FROM orders WHERE customer_id = ? AND status != 'draft' ORDER BY id DESC LIMIT 20", u.id).map((o) => ({ ...o, status_label: STATUS_LABELS[o.status] }));
  return u;
});
admin.patch('/api/admin/customers/:id', can('customers'), (ctx) => {
  const { status } = validate(ctx.body, { status: v.oneOf('active', 'blocked') });
  q.run("UPDATE users SET status = ? WHERE id = ? AND role = 'CUSTOMER'", status, Number(ctx.params.id));
  audit(ctx, 'customer.status', 'user', ctx.params.id, { status });
  return { ok: true };
});

/* ----------------------------- sellers ----------------------------- */
const sellerSchema = { store_name: v.str(2, 80), owner_name: v.str(2, 80), phone: v.phone(), address: v.optional(v.str(0, 250), ''), description: v.optional(v.str(0, 600), ''), emoji: v.optional(v.str(0, 8), '🍎'), status: v.oneOf('active', 'pending', 'suspended') };
const SELLER_LIST_SQL = `SELECT s.*, u.email, u.status AS user_status,
  (SELECT COUNT(*) FROM orders o WHERE o.seller_id = s.id AND o.status != 'draft') AS total_orders,
  (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.seller_id = s.id AND o.status IN ('delivered','completed')) AS revenue,
  (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id AND p.status = 'active') AS active_products
  FROM sellers s JOIN users u ON u.id = s.user_id`;
admin.get('/api/admin/sellers', can('sellers'), () => q.all(`${SELLER_LIST_SQL} ORDER BY s.id`));
admin.get('/api/admin/sellers/options', requireAuth, () => q.all("SELECT id, store_name FROM sellers WHERE status='active' ORDER BY store_name"));
admin.post('/api/admin/sellers', can('sellers'), (ctx) => {
  const d = validate(ctx.body, sellerSchema);
  const login = validate(ctx.body, { email: v.str(5, 120), password: v.str(8, 100) });
  if (q.get('SELECT 1 AS x FROM users WHERE phone = ? OR LOWER(email) = LOWER(?)', d.phone, login.email)) throw conflict('Telefon yoki email band');
  const id = tx(() => {
    const uid = q.insert("INSERT INTO users (role, name, phone, email, password_hash, created_at) VALUES ('SELLER',?,?,?,?,?)", d.owner_name, d.phone, login.email, hashPassword(login.password), now());
    return q.insert('INSERT INTO sellers (user_id, store_name, owner_name, phone, address, description, emoji, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)', uid, d.store_name, d.owner_name, d.phone, d.address, d.description, d.emoji, d.status, now());
  });
  audit(ctx, 'seller.create', 'seller', id);
  ctx.status = 201;
  return q.get(`${SELLER_LIST_SQL} WHERE s.id = ?`, id);
});
admin.put('/api/admin/sellers/:id', can('sellers'), (ctx) => {
  const id = Number(ctx.params.id);
  if (!q.get('SELECT 1 AS x FROM sellers WHERE id = ?', id)) throw notFound();
  const d = validatePartial(ctx.body, sellerSchema);
  if ('online' in ctx.body) d.online = ctx.body.online ? 1 : 0;
  patchSql('sellers', d, id);
  audit(ctx, 'seller.update', 'seller', id, Object.keys(d));
  return q.get(`${SELLER_LIST_SQL} WHERE s.id = ?`, id);
});
admin.post('/api/admin/me/online', can('orders'), (ctx) => {
  if (ctx.user.role !== 'SELLER') throw forbidden();
  q.run('UPDATE sellers SET online = ? WHERE id = ?', ctx.body.online ? 1 : 0, ctx.user.seller_id);
  return { online: !!ctx.body.online };
});

/* ----------------------------- couriers ----------------------------- */
const COURIER_SQL = `SELECT c.*, u.email,
  (SELECT COUNT(*) FROM orders o WHERE o.courier_id = c.id AND o.status IN ('handed','on_way')) AS current_orders FROM couriers c JOIN users u ON u.id = c.user_id`;
admin.get('/api/admin/couriers', requireAuth, (ctx) => {
  if (!isTeam(ctx.user)) throw forbidden();
  return q.all(`${COURIER_SQL} ORDER BY c.id`);
});
admin.post('/api/admin/couriers', can('couriers'), (ctx) => {
  const d = validate(ctx.body, { name: v.str(2, 80), phone: v.phone(), vehicle: v.optional(v.str(0, 60), ''), email: v.str(5, 120), password: v.str(8, 100) });
  if (q.get('SELECT 1 AS x FROM users WHERE phone = ? OR LOWER(email) = LOWER(?)', d.phone, d.email)) throw conflict('Telefon yoki email band');
  const id = tx(() => {
    const uid = q.insert("INSERT INTO users (role, name, phone, email, password_hash, created_at) VALUES ('COURIER',?,?,?,?,?)", d.name, d.phone, d.email, hashPassword(d.password), now());
    return q.insert('INSERT INTO couriers (user_id, name, phone, vehicle, status, created_at) VALUES (?,?,?,?,?,?)', uid, d.name, d.phone, d.vehicle, 'offline', now());
  });
  audit(ctx, 'courier.create', 'courier', id);
  ctx.status = 201;
  return q.get(`${COURIER_SQL} WHERE c.id = ?`, id);
});
admin.put('/api/admin/couriers/:id', can('couriers'), (ctx) => {
  const id = Number(ctx.params.id);
  if (!q.get('SELECT 1 AS x FROM couriers WHERE id = ?', id)) throw notFound();
  patchSql('couriers', validatePartial(ctx.body, { name: v.str(2, 80), phone: v.phone(), vehicle: v.str(0, 60), status: v.oneOf('online', 'offline', 'delivering', 'available') }), id);
  audit(ctx, 'courier.update', 'courier', id);
  return q.get(`${COURIER_SQL} WHERE c.id = ?`, id);
});
admin.post('/api/admin/me/courier-status', can('orders'), (ctx) => {
  if (ctx.user.role !== 'COURIER') throw forbidden();
  const { status } = validate(ctx.body, { status: v.oneOf('online', 'offline', 'available') });
  q.run('UPDATE couriers SET status = ? WHERE id = ?', status, ctx.user.courier_id);
  return { status };
});

/* ------------------------------ reviews ------------------------------ */
admin.get('/api/admin/reviews', can('reviews'), (ctx) => {
  const sc = sellerScope(ctx, 'r.seller_id');
  return q.all(`SELECT r.*, u.name AS customer, p.name AS product, p.art, p.tint, (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort, id LIMIT 1) AS image, s.store_name, o.code AS order_code
    FROM reviews r JOIN users u ON u.id = r.customer_id JOIN products p ON p.id = r.product_id JOIN sellers s ON s.id = r.seller_id JOIN orders o ON o.id = r.order_id
    WHERE ${sc.sql} ORDER BY r.id DESC LIMIT 200`, ...sc.args);
});
admin.patch('/api/admin/reviews/:id', can('reviews'), (ctx) => {
  if (!isTeam(ctx.user)) throw forbidden();
  const { status } = validate(ctx.body, { status: v.oneOf('visible', 'hidden') });
  const r = q.get('SELECT * FROM reviews WHERE id = ?', Number(ctx.params.id));
  if (!r) throw notFound();
  q.run('UPDATE reviews SET status = ? WHERE id = ?', status, r.id);
  // refreshRatings is import-cycle free: do it inline
  const p = q.get("SELECT AVG(rating) AS a, COUNT(*) AS n FROM reviews WHERE product_id = ? AND status='visible'", r.product_id);
  q.run('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?', Math.round((p.a || 0) * 10) / 10, p.n, r.product_id);
  audit(ctx, 'review.status', 'review', r.id, { status });
  return { ok: true };
});

/* ------------------------------ returns ------------------------------ */
admin.get('/api/admin/returns', can('returns'), (ctx) => {
  const sc = sellerScope(ctx, 'r.seller_id');
  return q.all(`SELECT r.*, o.code AS order_code, o.total AS order_total, o.customer_name, o.phone, s.store_name,
      (SELECT GROUP_CONCAT(i.name || ' ' || i.qty_kg || 'kg', ', ') FROM order_items i WHERE i.order_id = o.id) AS products
    FROM returns r JOIN orders o ON o.id = r.order_id JOIN sellers s ON s.id = r.seller_id WHERE ${sc.sql} ORDER BY r.id DESC LIMIT 200`, ...sc.args)
    .map((r) => ({ ...r, photos: JSON.parse(r.photos) }));
});
admin.patch('/api/admin/returns/:id', can('returns'), (ctx) => {
  if (!isTeam(ctx.user)) throw forbidden('Qaytarishni faqat administrator hal qiladi');
  const r = q.get('SELECT * FROM returns WHERE id = ?', Number(ctx.params.id));
  if (!r) throw notFound();
  const d = validate(ctx.body, { status: v.oneOf('approved', 'rejected', 'completed'), admin_note: v.optional(v.str(0, 400), null) });
  const order = q.get('SELECT * FROM orders WHERE id = ?', r.order_id);
  tx(() => {
    q.run('UPDATE returns SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = ? WHERE id = ?', d.status, d.admin_note, now(), r.id);
    if ((d.status === 'approved' || d.status === 'completed') && order.status === 'return_requested') setStatus(order, 'returned', ctx.user, 'Qaytarish tasdiqlandi');
    if (d.status === 'rejected' && order.status === 'return_requested') {
      setStatus(order, 'delivered', ctx.user, d.admin_note || 'Qaytarish rad etildi');
      notify(order.customer_id, 'return_update', "Qaytarish rad etildi", `${order.code}${d.admin_note ? ' · ' + d.admin_note : ''}`, `#/orders/${order.id}`);
    }
    if (d.status !== 'rejected') notify(order.customer_id, 'return_update', 'Qaytarish yangilandi', `${order.code} · Meva narxi hisoblanmaydi, faqat yetkazib berish haqi to'lanadi`, `#/orders/${order.id}`);
  });
  audit(ctx, 'return.status', 'return', r.id, { status: d.status });
  return { ok: true };
});

/* ---------------------------- promotions ---------------------------- */
const promoSchema = { title: v.str(2, 80), subtitle: v.optional(v.str(0, 160), ''), code: v.optional(v.str(0, 30), null), discount_percent: v.int(0, 90), min_total: v.optional(v.int(0, 100_000_000), 0), starts_at: v.optional(v.str(0, 30), null), ends_at: v.optional(v.str(0, 30), null), active: v.bool(), art: v.optional(v.str(0, 8), '🍓') };
admin.get('/api/admin/promotions', can('promotions'), () => q.all('SELECT * FROM promotions ORDER BY id DESC'));
admin.post('/api/admin/promotions', can('promotions'), (ctx) => {
  const d = validate(ctx.body, promoSchema);
  if (d.code) d.code = d.code.toUpperCase();
  try {
    const id = q.insert('INSERT INTO promotions (title, subtitle, code, discount_percent, min_total, starts_at, ends_at, active, art) VALUES (?,?,?,?,?,?,?,?,?)', d.title, d.subtitle, d.code, d.discount_percent, d.min_total, d.starts_at, d.ends_at, d.active, d.art);
    audit(ctx, 'promo.create', 'promotion', id);
    ctx.status = 201;
    return q.get('SELECT * FROM promotions WHERE id = ?', id);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw conflict('Bu promokod mavjud');
    throw e;
  }
});
admin.put('/api/admin/promotions/:id', can('promotions'), (ctx) => {
  const d = validatePartial(ctx.body, promoSchema);
  if (d.code) d.code = d.code.toUpperCase();
  patchSql('promotions', d, Number(ctx.params.id));
  audit(ctx, 'promo.update', 'promotion', ctx.params.id);
  return q.get('SELECT * FROM promotions WHERE id = ?', Number(ctx.params.id));
});
admin.delete('/api/admin/promotions/:id', can('promotions'), (ctx) => {
  q.run('DELETE FROM promotions WHERE id = ?', Number(ctx.params.id));
  audit(ctx, 'promo.delete', 'promotion', ctx.params.id);
  return { deleted: true };
});

/* --------------------------- delivery / settings --------------------------- */
admin.get('/api/admin/delivery', can('delivery'), () => ({
  settings: settings(),
  couriers: q.all(`${COURIER_SQL} ORDER BY c.id`),
  live: q.all(`SELECT o.id, o.code, o.status, o.address, o.customer_name, o.created_at, c.name AS courier_name, s.store_name FROM orders o
    JOIN sellers s ON s.id = o.seller_id LEFT JOIN couriers c ON c.id = o.courier_id WHERE o.status IN ('handed','on_way') ORDER BY o.id DESC`).map((o) => ({ ...o, status_label: STATUS_LABELS[o.status] })),
}));
admin.put('/api/admin/delivery', can('delivery'), (ctx) => {
  const d = validate(ctx.body, {
    base_fee: v.int(0, 1_000_000), free_from: v.int(0, 100_000_000), eta_min: v.int(5, 1440), eta_max: v.int(5, 2880),
    return_policy: v.oneOf('delivery_fee', 'free', 'fixed'), return_fixed_fee: v.optional(v.int(0, 1_000_000), 0), support_phone: v.optional(v.str(0, 30), ''),
  });
  if (d.eta_min > d.eta_max) throw badRequest('Minimal vaqt maksimaldan katta bo\'lmasligi kerak');
  q.run('UPDATE delivery_settings SET base_fee=?, free_from=?, eta_min=?, eta_max=?, return_policy=?, return_fixed_fee=?, support_phone=? WHERE id = 1', d.base_fee, d.free_from, d.eta_min, d.eta_max, d.return_policy, d.return_fixed_fee, d.support_phone);
  audit(ctx, 'delivery.update', 'settings', 1, d);
  return settings();
});

/* ---------------------- team + audit (super admin) ---------------------- */
admin.get('/api/admin/team', superOnly, () => q.all(`SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.last_seen, a.title, a.permissions FROM users u LEFT JOIN admin_users a ON a.user_id = u.id WHERE u.role IN ('ADMIN','SUPER_ADMIN') ORDER BY u.id`).map((r) => ({ ...r, permissions: JSON.parse(r.permissions || '[]') })));
admin.post('/api/admin/team', superOnly, (ctx) => {
  const d = validate(ctx.body, { name: v.str(2, 80), email: v.str(5, 120), phone: v.phone(), password: v.str(8, 100), title: v.optional(v.str(0, 60), 'Administrator') });
  const perms = (Array.isArray(ctx.body.permissions) ? ctx.body.permissions : []).filter((p) => ADMIN_PERMS.includes(p));
  if (q.get('SELECT 1 AS x FROM users WHERE phone = ? OR LOWER(email) = LOWER(?)', d.phone, d.email)) throw conflict('Telefon yoki email band');
  const id = tx(() => {
    const uid = q.insert("INSERT INTO users (role, name, phone, email, password_hash, created_at) VALUES ('ADMIN',?,?,?,?,?)", d.name, d.phone, d.email, hashPassword(d.password), now());
    q.run('INSERT INTO admin_users (user_id, title, permissions) VALUES (?,?,?)', uid, d.title, JSON.stringify(perms));
    return uid;
  });
  audit(ctx, 'team.create', 'user', id);
  ctx.status = 201;
  return { id };
});
admin.patch('/api/admin/team/:id', superOnly, (ctx) => {
  const id = Number(ctx.params.id);
  const u = q.get("SELECT * FROM users WHERE id = ? AND role = 'ADMIN'", id);
  if (!u) throw notFound('Faqat ADMIN rolini tahrirlash mumkin');
  if (Array.isArray(ctx.body.permissions)) q.run('UPDATE admin_users SET permissions = ? WHERE user_id = ?', JSON.stringify(ctx.body.permissions.filter((p) => ADMIN_PERMS.includes(p))), id);
  if (ctx.body.status) q.run('UPDATE users SET status = ? WHERE id = ?', v.oneOf('active', 'blocked')(ctx.body.status, 'status'), id);
  audit(ctx, 'team.update', 'user', id);
  return { ok: true };
});
admin.get('/api/admin/audit', superOnly, (ctx) => q.all(`SELECT a.*, u.name AS user_name, u.role FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ${Math.min(Number(ctx.query.limit) || 100, 500)}`));

/* ------- admin-level notification broadcast (promotions to customers) ------- */
admin.post('/api/admin/broadcast', can('promotions'), (ctx) => {
  const d = validate(ctx.body, { title: v.str(2, 80), body: v.optional(v.str(0, 200), '') });
  const ids = q.all("SELECT id FROM users WHERE role='CUSTOMER' AND status='active'").map((r) => r.id);
  tx(() => notify(ids, 'promo', d.title, d.body, '#/'));
  audit(ctx, 'broadcast', 'notification', null, { recipients: ids.length, title: d.title });
  return { sent: ids.length };
});
void sellerUserId;
