import { q, now } from '../db.js';
import { Router, forbidden, notFound, badRequest, conflict } from '../lib/http.js';
import { requireAuth, requirePerm } from '../lib/auth.js';
import { notify, ownUpload, rateLimit, sellerUserId, v, validate, audit } from '../lib/util.js';
import { STATUS_LABELS } from '../domain.js';

export const chat = new Router();

const ONLINE_WINDOW_MS = 2 * 60_000;
const isOnline = (lastSeen) => !!lastSeen && Date.now() - Date.parse(lastSeen) < ONLINE_WINDOW_MS;

/** Returns the chat if the caller may see it, with the caller's side ('customer'|'seller'|'admin'). */
function access(ctx, chatId) {
  const c = q.get('SELECT * FROM chats WHERE id = ?', chatId);
  if (!c) throw notFound('Suhbat topilmadi');
  const u = ctx.user;
  let side = null;
  if (u.role === 'CUSTOMER' && c.customer_id === u.id) side = 'customer';
  else if (u.role === 'SELLER' && c.seller_id === u.seller_id) side = 'seller';
  else if (u.role === 'SUPER_ADMIN' || (u.role === 'ADMIN' && u.permissions.includes('chats'))) side = 'admin';
  if (!side) throw forbidden();
  return { c, side };
}

const SUMMARY_SQL = `
  SELECT c.*, o.code AS order_code, o.status AS order_status, o.total AS order_total, o.customer_name,
         s.store_name, s.online AS seller_online, s.emoji AS seller_emoji, cu.last_seen AS customer_seen,
         (SELECT body FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
         (SELECT image_url FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_image,
         (SELECT created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
         (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS message_count
  FROM chats c
  JOIN orders o ON o.id = c.order_id
  JOIN sellers s ON s.id = c.seller_id
  JOIN users cu ON cu.id = c.customer_id`;

function summarize(rows, side) {
  return rows.map((r) => {
    const unread = side === 'admin' ? 0 : q.get('SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND read_at IS NULL AND sender_role != ?', r.id, side === 'customer' ? 'CUSTOMER' : 'SELLER').n;
    return {
      id: r.id, order_id: r.order_id, order_code: r.order_code, order_status: r.order_status, order_status_label: STATUS_LABELS[r.order_status],
      order_total: r.order_total, status: r.status, customer_name: r.customer_name, store_name: r.store_name, seller_emoji: r.seller_emoji,
      seller_online: !!r.seller_online, customer_online: isOnline(r.customer_seen),
      last_message: r.last_body || (r.last_image ? '📷 Rasm' : ''), last_at: r.last_at || r.created_at, unread, message_count: r.message_count,
    };
  }).sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
}

chat.get('/api/chats', requireAuth, (ctx) => {
  const u = ctx.user;
  if (u.role === 'CUSTOMER') return summarize(q.all(`${SUMMARY_SQL} WHERE c.customer_id = ?`, u.id), 'customer');
  if (u.role === 'SELLER') return summarize(q.all(`${SUMMARY_SQL} WHERE c.seller_id = ?`, u.seller_id), 'seller');
  if (u.role === 'COURIER') throw forbidden();
  requirePerm('chats')(ctx);
  return summarize(q.all(`${SUMMARY_SQL} ${ctx.query.status ? 'WHERE c.status = ?' : ''}`, ...(ctx.query.status ? [ctx.query.status] : [])), 'admin');
});

chat.post('/api/orders/:id/chat', requireAuth, (ctx) => {
  if (ctx.user.role !== 'CUSTOMER') throw forbidden();
  const o = q.get('SELECT * FROM orders WHERE id = ? AND customer_id = ?', Number(ctx.params.id), ctx.user.id);
  if (!o) throw notFound('Buyurtma topilmadi');
  let c = q.get('SELECT id FROM chats WHERE order_id = ?', o.id);
  if (!c) {
    const first = q.get('SELECT product_id FROM order_items WHERE order_id = ? ORDER BY id LIMIT 1', o.id);
    const t = now();
    c = { id: q.insert('INSERT INTO chats (order_id, customer_id, seller_id, product_id, created_at, updated_at) VALUES (?,?,?,?,?,?)', o.id, o.customer_id, o.seller_id, first?.product_id ?? null, t, t) };
  }
  return { id: c.id };
});

chat.get('/api/chats/:id', requireAuth, (ctx) => {
  const { c, side } = access(ctx, Number(ctx.params.id));
  if (side !== 'admin') {
    q.run('UPDATE messages SET read_at = ? WHERE chat_id = ? AND read_at IS NULL AND sender_role != ?', now(), c.id, side === 'customer' ? 'CUSTOMER' : 'SELLER');
  }
  const summary = summarize(q.all(`${SUMMARY_SQL} WHERE c.id = ?`, c.id), side)[0];
  const messages = q.all(`SELECT m.id, m.sender_role, m.sender_id, m.body, m.image_url, m.product_id, m.read_at, m.created_at,
      p.name AS product_name, p.art AS product_art, p.tint AS product_tint, p.price_per_kg AS product_price, (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort, id LIMIT 1) AS product_image
      FROM messages m LEFT JOIN products p ON p.id = m.product_id WHERE m.chat_id = ? ORDER BY m.id`, c.id);
  const order = q.get('SELECT id, code, status, total, delivery_fee FROM orders WHERE id = ?', c.order_id);
  order.items = q.all(`SELECT oi.product_id, oi.name, oi.art, oi.tint, oi.qty_kg, oi.price_per_kg, (SELECT url FROM product_images WHERE product_id = oi.product_id ORDER BY sort, id LIMIT 1) AS image FROM order_items oi WHERE oi.order_id = ?`, c.order_id);
  order.status_label = STATUS_LABELS[order.status];
  return { ...summary, side, messages, order };
});

chat.post('/api/chats/:id/messages', requireAuth, (ctx) => {
  rateLimit(`msg:${ctx.user.id}`, 40, 60_000);
  const { c, side } = access(ctx, Number(ctx.params.id));
  if (c.status === 'closed') throw conflict('Suhbat yopilgan');
  const body = v.optional(v.str(0, 1500), '')(ctx.body.body, 'body');
  const image = ownUpload(ctx.body.image_url);
  const productId = ctx.body.product_id ? Number(ctx.body.product_id) : null;
  if (!body && !image && !productId) throw badRequest('Xabar bo\'sh');
  if (productId && !q.get('SELECT 1 AS x FROM products WHERE id = ?', productId)) throw badRequest('Mahsulot topilmadi');
  const role = side === 'admin' ? 'ADMIN' : ctx.user.role;
  const id = insertMessage(c, ctx.user.id, role, body, image, productId);
  if (side === 'admin') audit(ctx, 'chat.intervene', 'chat', c.id);
  if (side === 'customer') scheduleDemoReply(c, body);
  return q.get('SELECT * FROM messages WHERE id = ?', id);
});

chat.patch('/api/chats/:id', requireAuth, (ctx) => {
  const { c, side } = access(ctx, Number(ctx.params.id));
  if (side !== 'admin') throw forbidden();
  const { status } = validate(ctx.body, { status: v.oneOf('active', 'closed', 'flagged') });
  q.run('UPDATE chats SET status = ?, updated_at = ? WHERE id = ?', status, now(), c.id);
  audit(ctx, 'chat.status', 'chat', c.id, { status });
  return { ok: true };
});

function insertMessage(c, senderId, role, body, image, productId) {
  const t = now();
  const id = q.insert('INSERT INTO messages (chat_id, sender_id, sender_role, body, image_url, product_id, created_at) VALUES (?,?,?,?,?,?,?)', c.id, senderId, role, body || null, image, productId, t);
  q.run('UPDATE chats SET updated_at = ? WHERE id = ?', t, c.id);
  const order = q.get('SELECT code FROM orders WHERE id = ?', c.order_id);
  if (role === 'CUSTOMER') notify(sellerUserId(c.seller_id), 'message', 'Mijozdan xabar', `${order.code} · ${body || '📷 Rasm'}`.slice(0, 120), `#/chats/${c.id}`);
  else notify(c.customer_id, 'seller_reply', role === 'ADMIN' ? 'Mevazor yordam xizmati' : 'Sotuvchi javob berdi', `${order.code} · ${body || '📷 Rasm'}`.slice(0, 120), `#/chats/${c.id}`);
  return id;
}

/* ---- Demo seller autoresponder (disable with DEMO_SELLER_BOT=0). Real sellers answer from the admin panel. ---- */
const REPLIES = [
  [/yangi|bugun|keltir|olib kel|свеж|сегодня|привез|fresh|today|arrive/i, 'Ha, bugun ertalab olib kelingan. Hammasi yangi va sifatli.'],
  [/hajm|katta|kichik|o'lcham|olcham|размер|крупн|size|big|large/i, 'Mevalar o\'rtacha va yirik hajmda, qadoqlashdan oldin qo\'lda saralaymiz.'],
  [/shirin|ta'm|tam|слад|вкус|sweet|taste/i, 'Juda shirin, ta\'mini o\'zim tatib ko\'rganman. Yoqmasa, qaytarishingiz mumkin.'],
  [/rasm|surat|foto|фото|снимк|photo|picture/i, 'Albatta! Qadoqlayotganda mevalarning rasmini yuboraman.'],
  [/narx|chegirma|arzon|цен|скидк|price|discount/i, 'Narx hozirgi chegirma bilan hisoblangan. Ko\'proq olsangiz, yetkazib berish bepul bo\'lishi mumkin.'],
  [/rahmat|raxmat|tasdiq|спасибо|подтвержд|thank|confirm/i, 'Marhamat! Buyurtmangizni tasdiqlasangiz, darhol tayyorlashni boshlaymiz.'],
];
function scheduleDemoReply(c, text) {
  if (process.env.DEMO_SELLER_BOT === '0') return;
  const seller = q.get('SELECT user_id, online FROM sellers WHERE id = ?', c.seller_id);
  if (!seller?.online) return;
  const hit = REPLIES.find(([re]) => re.test(text || ''));
  const reply = hit ? hit[1] : (/^(assalom|salom|здравствуй|привет|hello|hi)/i.test(text || '') ? 'Va alaykum assalom! Qanday yordam bera olaman?' : 'Savolingiz uchun rahmat. Hozir tekshirib, javob beraman.');
  setTimeout(() => {
    try {
      insertMessage(c, seller.user_id, 'SELLER', reply, null, null);
    } catch { /* chat might be gone */ }
  }, 1800 + Math.random() * 1500).unref?.();
}
