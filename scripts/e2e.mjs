// End-to-end API checks against a running server (npm start) seeded with demo data.
//   node scripts/e2e.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:3000';
let failed = 0;
const ok = (cond, name, extra = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ' ' + extra}`); if (!cond) failed++; };

async function call(method, url, token, body) {
  const res = await fetch(BASE + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const login = async (l, p) => (await call('POST', '/api/auth/login', null, { login: l, password: p })).data.token;

const cust = await login('+998901234567', 'Demo#2026');
const samar = await login('samarqand@mevazor.uz', 'Seller#2026');
const fargona = await login('fargona@mevazor.uz', 'Seller#2026');
const cour = await login('courier1@mevazor.uz', 'Courier#2026');
const admin = await login('admin@mevazor.uz', 'Admin#2026');
const mod = await login('moderator@mevazor.uz', 'Moder#2026');
ok(cust && samar && fargona && cour && admin && mod, 'all demo accounts can sign in');

console.log('\nAccess control');
ok((await call('GET', '/api/admin/stats', cust)).status === 403, 'customer cannot read admin stats');
ok((await call('GET', '/api/orders')).status === 401, 'anonymous cannot list orders');
ok((await call('GET', '/api/admin/sellers', mod)).status === 403, 'limited admin cannot manage sellers');
ok((await call('GET', '/api/admin/team', mod)).status === 403, 'only SUPER_ADMIN can read team');
ok((await call('GET', '/api/admin/audit', admin)).status === 200, 'SUPER_ADMIN can read audit log');
ok((await call('POST', '/api/auth/login', null, { login: 'x@y.z', password: 'nope-nope' })).status === 401, 'bad credentials rejected');

console.log('\nValidation');
const prods = (await call('GET', '/api/products?limit=100')).data;
const p1 = prods.find((p) => p.seller_name.startsWith('Samarqand') && p.stock_kg > 20);
const base = { customer_name: 'Madina K', phone: '+998901234567', address: 'Test ko\'chasi 12' };
ok((await call('POST', '/api/orders', cust, { ...base, items: [] })).status === 400, 'empty cart rejected');
ok((await call('POST', '/api/orders', cust, { ...base, items: [{ product_id: p1.id, qty_kg: 0.1 }] })).status === 400, 'below minimum order rejected');
ok((await call('POST', '/api/orders', cust, { ...base, items: [{ product_id: p1.id, qty_kg: 9999 }] })).status === 400, 'above stock/max rejected');
ok((await call('POST', '/api/orders', cust, { ...base, phone: '123', items: [{ product_id: p1.id, qty_kg: 1 }] })).status === 400, 'bad phone rejected');
ok((await call('POST', '/api/uploads', cust, { data: 'data:image/png;base64,AAAA' })).status === 400, 'fake image rejected (magic bytes)');

console.log('\nOrder lifecycle (confirm → seller → courier → delivered → return)');
const stockBefore = (await call('GET', `/api/products/${p1.id}`)).data.stock_kg;
const created = (await call('POST', '/api/orders', cust, { ...base, items: [{ product_id: p1.id, qty_kg: 2 }] })).data;
const o = created.orders[0];
ok(o.status === 'draft', 'order starts as draft (not yet sent to seller)');
ok(o.delivery_fee === (o.items_total >= 150000 ? 0 : 12000), 'delivery fee computed from settings', `fee=${o.delivery_fee}`);
ok(!(await call('GET', '/api/admin/orders', samar)).data.some((x) => x.id === o.id), 'seller does not see draft order');
const chat = (await call('POST', `/api/orders/${o.id}/chat`, cust)).data;
ok(chat.id > 0, 'customer can open a seller chat before confirming');
const m = (await call('POST', `/api/chats/${chat.id}/messages`, cust, { body: 'Olma bugun keldimi?' })).data;
ok(m.id > 0, 'customer message sent');
ok((await call('GET', `/api/chats/${chat.id}`, fargona)).status === 403, 'other seller cannot read the chat');
ok((await call('POST', `/api/orders/${o.id}/confirm`, cust)).status === 200, 'customer confirms order');
ok((await call('GET', `/api/products/${p1.id}`)).data.stock_kg === stockBefore - 2, 'stock reserved on confirm');
ok((await call('POST', `/api/admin/orders/${o.id}/status`, fargona, { status: 'reviewing' })).status === 404, "other seller cannot touch the order");
ok((await call('POST', `/api/admin/orders/${o.id}/status`, samar, { status: 'delivered' })).status === 409, 'seller cannot skip steps');
ok((await call('POST', `/api/admin/orders/${o.id}/status`, samar, { status: 'rejected' })).status === 400, 'reject needs a reason');
for (const s of ['reviewing', 'accepted', 'preparing', 'handed']) ok((await call('POST', `/api/admin/orders/${o.id}/status`, samar, { status: s })).status === 200, `seller → ${s}`);
const handed = (await call('GET', `/api/admin/orders/${o.id}`, admin)).data;
ok(!!handed.courier_id, 'courier auto-assigned on handover');
const courTok = handed.courier.name === 'Sardor Ergashev' ? cour : await login(`courier${handed.courier_id}@mevazor.uz`, 'Courier#2026');
ok((await call('POST', `/api/admin/orders/${o.id}/status`, courTok, { status: 'on_way' })).status === 200, 'courier → on_way');
ok((await call('POST', `/api/admin/orders/${o.id}/status`, courTok, { status: 'delivered' })).status === 200, 'courier → delivered');
const ret = await call('POST', `/api/orders/${o.id}/return`, cust, { reason: 'Mevalar ezilgan yoki buzilgan', note: 'test' });
ok(ret.status === 200 && ret.data.status === 'return_requested', 'customer refuses fruit on delivery');
ok(ret.data.return.delivery_fee === o.delivery_fee, 'return fee = delivery fee only');
const rid = (await call('GET', '/api/admin/returns', admin)).data.find((r) => r.order_id === o.id).id;
ok((await call('PATCH', `/api/admin/returns/${rid}`, samar, { status: 'approved' })).status === 403, 'seller cannot decide returns');
ok((await call('PATCH', `/api/admin/returns/${rid}`, admin, { status: 'approved', admin_note: 'ok' })).status === 200, 'admin approves return');
const fin = (await call('GET', `/api/orders/${o.id}`, cust)).data;
ok(fin.status === 'returned' && fin.payable === o.delivery_fee, 'customer pays only the delivery fee', `payable=${fin.payable}`);
ok((await call('GET', `/api/products/${p1.id}`)).data.stock_kg === stockBefore, 'stock restored after return');

console.log('\nCompleted order → review');
const c2 = (await call('POST', '/api/orders', cust, { ...base, items: [{ product_id: p1.id, qty_kg: 1 }] })).data.orders[0];
await call('POST', `/api/orders/${c2.id}/confirm`, cust);
for (const s of ['reviewing', 'accepted', 'preparing', 'handed', 'on_way', 'delivered']) await call('POST', `/api/admin/orders/${c2.id}/status`, admin, { status: s });
ok((await call('POST', `/api/orders/${c2.id}/complete`, cust)).status === 200, 'customer accepts delivery → completed');
ok((await call('POST', `/api/orders/${c2.id}/review`, cust, { rating: 5, quality_rating: 5, seller_rating: 4, delivery_rating: 5, body: 'Zo\'r!' })).status === 200, 'review posted');
ok((await call('POST', `/api/orders/${c2.id}/review`, cust, { rating: 5, quality_rating: 5, seller_rating: 4, delivery_rating: 5 })).status === 409, 'only one review per order');

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
