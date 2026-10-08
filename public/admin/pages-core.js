import { $, $$, esc, icon, art, num, money, kg, toast, modal, confirmDialog, busy, fmtDateTime, fmtDate, fmtTime, ago, initials, debounce } from '/shared/core.js';
import { api, A, can, isSeller, isCourier, isTeam, pill, tonePill, tint, fruitCell, rate, emptyState, rows, drawer, zoomable, STATUS } from './common.js';
import { lineChart, barChart, donut, rankBars, PALETTE } from './charts.js';

const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/* ================================ DASHBOARD ================================ */
export async function dashboard(host) {
  host.innerHTML = `<div class="ph"><div><h2>${isSeller() ? 'Store overview' : 'Overview'}</h2><p>${isSeller() ? 'Your store at a glance' : 'Marketplace performance at a glance'}</p></div>
    <div class="acts"><div class="seg" id="rng"><button data-d="7">7 days</button><button data-d="14" class="on">14 days</button><button data-d="30">30 days</button></div></div></div>
    <div class="kpis">${Array.from({ length: 10 }, () => '<div class="card kpi sk-k sk"></div>').join('')}</div>
    <div class="grid2"><div class="card sk" style="height:320px"></div><div class="card sk" style="height:320px"></div></div>`;
  const [s, an0] = await Promise.all([api.get('/api/admin/stats'), api.get('/api/admin/analytics?days=14')]);
  let an = an0;
  const k = (ic, tone, label, value, sub = '') => `<div class="card kpi"><div class="kh"><span>${label}</span><span class="ki ${tone}">${icon(ic, 18)}</span></div><b>${value}</b><small>${sub}</small></div>`;
  const d = s.delivery;
  const kp = [
    k('box', '', "Today's orders", num(s.orders_today), `${money(s.revenue_today)} ordered today`),
    k('dollar', 'g', 'Total sales', money(s.total_sales), 'Delivered + completed'),
    k('zap', 'o', 'Active orders', num(s.active_orders), `${s.awaiting_seller} awaiting seller`),
    k('check', 'g', 'Completed orders', num(s.completed_orders), 'All time'),
    k('x', 'r', 'Cancelled orders', num(s.cancelled_orders), 'Cancelled + rejected'),
    k('refresh', 'y', 'Returns', num(s.returns), `${s.pending_returns} pending review`),
    isSeller() ? '' : k('users', 'b', 'Customers', num(s.customers), 'Registered'),
    isSeller() ? '' : k('store', '', 'Sellers', num(s.sellers), 'Active stores'),
    k('layers', 'o', 'Products', num(s.products), 'Active listings'),
    k('truck', 'b', 'Delivery', `${d.avg_minutes} min`, `${d.on_time_percent}% within 60 min${d.couriers_online != null ? ` · ${d.couriers_online}/${d.couriers_total} couriers online` : ''}`),
  ].join('');
  host.innerHTML = `<div class="ph"><div><h2>${isSeller() ? 'Store overview' : 'Overview'}</h2><p>${isSeller() ? 'Your store at a glance' : 'Marketplace performance at a glance'}</p></div>
    <div class="acts"><div class="seg" id="rng"><button data-d="7">7 days</button><button data-d="14" class="on">14 days</button><button data-d="30">30 days</button></div></div></div>
    <div class="kpis">${kp}</div>
    <div class="grid2"><div class="card"><div class="card-h"><div><h3>Daily orders</h3><small id="t1"></small></div></div><div class="card-b"><div id="c-orders"></div></div></div>
      <div class="card"><div class="card-h"><div><h3>Delivery performance</h3><small>Handover → delivered</small></div></div><div class="card-b" id="c-del"></div></div></div>
    <div class="grid2"><div class="card"><div class="card-h"><div><h3>Revenue</h3><small id="t2"></small></div></div><div class="card-b"><div id="c-rev"></div></div></div>
      <div class="card"><div class="card-h"><div><h3>Return rate</h3><small>Returns / orders</small></div><span class="st ${an.return_rate > 8 ? 'bad' : 'ok'}" id="rr"></span></div><div class="card-b"><div id="c-ret"></div></div></div></div>
    <div class="grid2e"><div class="card"><div class="card-h"><div><h3>Most popular fruits</h3><small>By kilograms sold</small></div></div><div class="card-b" id="c-pop"></div></div>
      <div class="card"><div class="card-h"><div><h3>${isSeller() ? 'Order status mix' : 'Most active sellers'}</h3><small>${isSeller() ? 'Selected period' : 'By number of orders'}</small></div></div><div class="card-b" id="c-sel"></div></div></div>
    <div class="grid2"><div class="card tcard"><div class="card-h" style="padding-bottom:12px"><h3>Recent orders</h3><a class="btn ghost sm" href="#/orders">View all ${icon('chevR', 14)}</a></div><div class="twrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Store</th><th class="num">Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>
      ${s.recent_orders.map((o) => `<tr class="click" data-o="${o.id}"><td class="mono">${esc(o.code)}</td><td>${esc(o.customer_name)}</td><td>${esc(o.store_name)}</td><td class="num">${num(o.total)}</td><td>${pill(o.status)}</td><td>${ago(o.created_at)}</td></tr>`).join('') || `<tr><td colspan="6">${emptyState('📦', 'No orders yet')}</td></tr>`}</tbody></table></div></div>
      <div class="card"><div class="card-h"><div><h3>Low stock</h3><small>Under 30 kg remaining</small></div></div><div class="card-b" style="display:grid;gap:12px">${s.low_stock.length ? s.low_stock.map((p) => `<div class="cell"><span class="art" style="--tint:${tint(p.tint)}">${art(p)}</span><div class="grow" style="flex:1"><b>${esc(p.name)}</b><small>${esc(p.store_name)}</small></div><span class="st bad">${p.stock_kg} kg</span></div>`).join('') : emptyState('✅', 'Stock levels look healthy')}</div></div></div>`;

  const draw = () => {
    const labels = an.daily.map((x) => dm(x.day));
    $('#t1').textContent = `${num(an.totals.orders)} orders in ${an.days} days`;
    $('#t2').textContent = `${money(an.totals.revenue)} in ${an.days} days`;
    $('#rr').textContent = `${an.return_rate}% overall`;
    $('#rr').className = `st ${an.return_rate > 8 ? 'bad' : 'ok'}`;
    barChart($('#c-orders'), { data: an.daily.map((x, i) => ({ label: labels[i], value: x.orders })), name: 'Orders', height: 240 });
    lineChart($('#c-rev'), { labels, series: [{ name: 'Revenue', color: PALETTE[0], values: an.daily.map((x) => x.revenue), fmt: (v) => money(v) }], height: 240 });
    lineChart($('#c-ret'), { labels, series: [{ name: 'Return rate', color: PALETTE[3], values: an.daily.map((x) => x.return_rate), fmt: (v) => `${v}%` }], height: 240, fmt: (v) => `${v}%` });
    donut($('#c-del'), { data: an.delivery.buckets.map((b, i) => ({ label: b.label, value: b.count, color: ['#10B981', '#4F46E5', '#F59E0B', '#EF4444'][i] })), center: `${an.delivery.avg || 0}m`, centerSub: 'avg time' });
    $('#c-pop').innerHTML = an.popular.length ? rankBars(an.popular.map((p) => ({ label: p.name, sub: money(p.revenue), value: p.kg, tint: tint(p.tint), art: p.art, image: p.image })), (v) => `${num(v)} kg`, (r) => art(r)) : emptyState('🍎', 'No sales in this period');
    $('#c-sel').innerHTML = isSeller()
      ? `<div id="c-st"></div>`
      : an.sellers.length ? rankBars(an.sellers.map((x) => ({ label: x.store_name, sub: money(x.revenue), value: x.orders, art: (x.store_name || '?')[0] })), (v) => `${num(v)} orders`, (r) => `<b style="color:var(--green)">${esc(r.art)}</b>`) : emptyState('🏪', 'No data');
    if (isSeller()) donut($('#c-st'), { data: an.statuses.slice(0, 6).map((x, i) => ({ label: x.label, value: x.count, color: PALETTE[i % 6] })), center: num(an.totals.orders), centerSub: 'orders' });
  };
  draw();
  $('#rng').onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('#rng button').forEach((x) => x.classList.toggle('on', x === b));
    an = await api.get(`/api/admin/analytics?days=${b.dataset.d}`);
    draw();
  };
  host.onclick = (e) => { const r = e.target.closest('[data-o]'); if (r) openOrder(+r.dataset.o); };
}

/* ================================ ANALYTICS ================================ */
export async function analytics(host) {
  let days = 30;
  const load = async () => {
    const an = await api.get(`/api/admin/analytics?days=${days}`);
    const labels = an.daily.map((x) => dm(x.day));
    const avgOrder = an.totals.orders ? an.totals.revenue / Math.max(1, an.daily.reduce((a, x) => a + x.orders - x.cancelled, 0)) : 0;
    host.innerHTML = `<div class="ph"><div><h2>Analytics</h2><p>Deeper view of orders, revenue and fulfilment</p></div><div class="seg" id="rng">${[7, 14, 30, 90].map((d) => `<button data-d="${d}" class="${d === days ? 'on' : ''}">${d} days</button>`).join('')}</div></div>
      <div class="kpis"><div class="card kpi"><div class="kh"><span>Orders</span><span class="ki">${icon('box', 18)}</span></div><b>${num(an.totals.orders)}</b><small>Excluding drafts</small></div>
        <div class="card kpi"><div class="kh"><span>Revenue</span><span class="ki g">${icon('dollar', 18)}</span></div><b>${money(an.totals.revenue)}</b><small>Delivered + completed</small></div>
        <div class="card kpi"><div class="kh"><span>Avg. order value</span><span class="ki b">${icon('chart', 18)}</span></div><b>${money(avgOrder)}</b><small>Per fulfilled order</small></div>
        <div class="card kpi"><div class="kh"><span>Return rate</span><span class="ki y">${icon('refresh', 18)}</span></div><b>${an.return_rate}%</b><small>${an.totals.returns} returns</small></div>
        <div class="card kpi"><div class="kh"><span>Avg. delivery</span><span class="ki o">${icon('truck', 18)}</span></div><b>${an.delivery.avg} min</b><small>${an.delivery.count} deliveries</small></div></div>
      <div class="card"><div class="card-h"><h3>Orders vs. cancellations</h3></div><div class="card-b"><div id="a1"></div><div class="legend"><span><i style="background:${PALETTE[0]}"></i>Orders</span><span><i style="background:${PALETTE[3]}"></i>Cancelled / rejected</span></div></div></div>
      <div class="grid2e"><div class="card"><div class="card-h"><h3>Revenue</h3></div><div class="card-b"><div id="a2"></div></div></div><div class="card"><div class="card-h"><h3>Order status mix</h3></div><div class="card-b" id="a3"></div></div></div>
      <div class="grid2e"><div class="card"><div class="card-h"><h3>Top fruits</h3><small>By kg</small></div><div class="card-b">${rankBars(an.popular.map((p) => ({ label: p.name, sub: money(p.revenue), value: p.kg, tint: tint(p.tint), art: p.art, image: p.image })), (v) => `${num(v)} kg`, (r) => art(r))}</div></div>
        <div class="card"><div class="card-h"><h3>Sales by category</h3><small>Kilograms</small></div><div class="card-b" id="a4"></div></div></div>`;
    lineChart($('#a1'), { labels, series: [{ name: 'Orders', color: PALETTE[0], values: an.daily.map((x) => x.orders) }, { name: 'Cancelled', color: PALETTE[3], values: an.daily.map((x) => x.cancelled) }], height: 260 });
    lineChart($('#a2'), { labels, series: [{ name: 'Revenue', color: PALETTE[1], values: an.daily.map((x) => x.revenue), fmt: (v) => money(v) }], height: 240 });
    donut($('#a3'), { data: an.statuses.map((x, i) => ({ label: x.label, value: x.count, color: PALETTE[i % 6] })).slice(0, 6), center: num(an.totals.orders), centerSub: 'orders' });
    donut($('#a4'), { data: an.categories.slice(0, 6).map((x, i) => ({ label: x.name, value: x.kg, color: PALETTE[i % 6] })), center: num(an.categories.reduce((a, c) => a + c.kg, 0)), centerSub: 'kg sold', fmt: (v) => `${num(v)} kg` });
    $('#rng').onclick = (e) => { const b = e.target.closest('button'); if (b) { days = +b.dataset.d; load(); } };
  };
  host.innerHTML = '<div class="card sk" style="height:400px"></div>';
  await load();
}

/* ================================ ORDERS ================================ */
export async function orders(host, query) {
  const f = { status: query.status || '', q: '', seller: '', from: '', to: '' };
  const sellers = isTeam() ? await api.get('/api/admin/sellers/options') : [];
  host.innerHTML = `<div class="ph"><div><h2>Orders</h2><p>${isCourier() ? 'Deliveries assigned to you' : 'Track and manage every order'}</p></div><div class="acts"><button class="btn outline sm" id="rf">${icon('refresh', 16)} Refresh</button><button class="btn outline sm" id="ex">${icon('download', 16)} Export CSV</button></div></div>
    <div class="card tcard"><div class="tools"><div class="search">${icon('search', 16)}<input class="input" id="q" placeholder="Search ID, customer, phone…"></div>
      <select class="select" id="st"><option value="">All statuses</option><option value="active" ${f.status === 'active' ? 'selected' : ''}>Active only</option>${Object.entries(STATUS).filter(([k]) => k !== 'draft').map(([k, [l]]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${sellers.length ? `<select class="select" id="sl"><option value="">All sellers</option>${sellers.map((s) => `<option value="${s.id}">${esc(s.store_name)}</option>`).join('')}</select>` : ''}
      <input type="date" class="input sm" id="df" style="width:auto" aria-label="From"><input type="date" class="input sm" id="dt" style="width:auto" aria-label="To"></div>
      <div class="twrap"><table><thead><tr><th>Order ID</th><th>Customer</th><th>Seller</th><th>Products</th><th class="num">Total</th><th class="num">Delivery fee</th><th>Status</th><th>Payment</th><th>Date</th><th>Time</th></tr></thead><tbody id="tb">${`<tr><td colspan="10">${rows(5)}</td></tr>`}</tbody></table></div><div class="pager" id="pg"></div></div>`;
  let list = [];
  const draw = () => {
    $('#tb').innerHTML = list.length ? list.map((o) => `<tr class="click" data-o="${o.id}"><td class="mono"><b>${esc(o.code)}</b></td><td><div class="cell"><span class="ava">${esc(initials(o.customer_name))}</span><div><b>${esc(o.customer_name)}</b><small>${esc(o.phone)}</small></div></div></td><td>${esc(o.store_name)}</td><td><div class="trunc" title="${esc(o.products)}">${esc(o.products)}</div></td><td class="num"><b>${num(o.total)}</b></td><td class="num">${o.delivery_fee ? num(o.delivery_fee) : '<span class="muted">Free</span>'}</td><td>${pill(o.status)}</td><td>${tonePill('Cash on delivery')}</td><td>${fmtDate(o.created_at)}</td><td>${fmtTime(o.created_at)}</td></tr>`).join('') : `<tr><td colspan="10">${emptyState('📦', 'No orders match', 'Try changing the filters.')}</td></tr>`;
    $('#pg').innerHTML = `<span>${list.length} order${list.length === 1 ? '' : 's'}</span><span><span class="live-dot"></span>Auto-refreshing</span>`;
  };
  const load = async () => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    try { list = await api.get(`/api/admin/orders?${p}`); draw(); } catch (e) { $('#tb').innerHTML = `<tr><td colspan="10">${emptyState('⚠️', 'Failed to load', e.message)}</td></tr>`; }
  };
  $('#q').oninput = debounce((e) => { f.q = e.target.value.trim(); load(); }, 300);
  $('#st').onchange = (e) => { f.status = e.target.value; load(); };
  $('#sl') && ($('#sl').onchange = (e) => { f.seller = e.target.value; load(); });
  $('#df').onchange = (e) => { f.from = e.target.value; load(); };
  $('#dt').onchange = (e) => { f.to = e.target.value; load(); };
  $('#rf').onclick = (e) => busy(e.currentTarget, load);
  $('#ex').onclick = () => {
    const head = ['Order ID', 'Customer', 'Phone', 'Seller', 'Products', 'Total', 'Delivery fee', 'Status', 'Payment', 'Created'];
    const csv = [head, ...list.map((o) => [o.code, o.customer_name, o.phone, o.store_name, o.products, o.total, o.delivery_fee, STATUS[o.status]?.[0], 'Cash on delivery', o.created_at])]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  host.onclick = (e) => { const r = e.target.closest('tr[data-o]'); if (r) openOrder(+r.dataset.o, load); };
  await load();
  const t = setInterval(() => { if (!document.hidden && !document.querySelector('.drawer-back')) load(); }, 15000);
  return () => clearInterval(t);
}

export async function openOrder(id, onChange) {
  const d = drawer('Order', '<div class="sk" style="height:300px"></div>');
  const paint = async () => {
    let o;
    try { o = await api.get(`/api/admin/orders/${id}`); } catch (e) { d.el.innerHTML = emptyState('⚠️', 'Cannot open order', e.message); return; }
    const couriers = isTeam() && can('couriers') ? await api.get('/api/admin/couriers').catch(() => []) : [];
    d.root.querySelector('h3').innerHTML = `<span class="mono">${esc(o.code)}</span> ${pill(o.status)}`;
    const stepLabels = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v[0]]));
    const nextBtns = (o.next || []).filter((s) => isTeam() ? true : true);
    d.el.innerHTML = `
      ${nextBtns.length ? `<section class="sec"><h4>Update status</h4>${isTeam()
        ? `<div class="fg"><div class="field"><label>New status</label><select class="select" id="ns">${nextBtns.map((s) => `<option value="${s}">${esc(stepLabels[s])}</option>`).join('')}</select></div><div class="field"><label>Note (optional)</label><input class="input" id="nn" maxlength="300"></div></div><div><button class="btn primary" id="nu">Update status</button></div>`
        : `<div class="row" style="display:flex;gap:8px;flex-wrap:wrap">${nextBtns.map((s, i) => `<button class="btn ${s === 'rejected' ? 'danger-soft' : i === 0 ? 'primary' : 'outline'}" data-s="${s}">${esc(stepLabels[s])}</button>`).join('')}</div>`}</section>` : ''}
      ${o.return ? `<section class="sec"><h4>Return request ${tonePill(o.return.status, { pending: 'warn', approved: 'ok', completed: 'ok', rejected: 'bad' }[o.return.status])}</h4><dl class="kvs"><dt>Reason</dt><dd>${esc(o.return.reason)}</dd>${o.return.note ? `<dt>Customer note</dt><dd>${esc(o.return.note)}</dd>` : ''}<dt>Delivery fee due</dt><dd>${money(o.return.delivery_fee)}</dd></dl>${o.return.photos.length ? `<div class="photos">${o.return.photos.map((u) => `<img src="${esc(u)}" data-zoom alt="Return photo">`).join('')}</div>` : ''}${isTeam() && can('returns') ? '<a class="btn outline sm" href="#/returns" style="justify-self:start">Open in Returns</a>' : ''}</section>` : ''}
      <section class="sec"><h4>Items</h4><div class="lines">${o.items.map((i) => `<div class="ln"><span class="art" style="width:36px;height:36px;border-radius:9px;display:grid;place-items:center;background:${tint(i.tint)};font-size:20px">${art(i)}</span><div class="grow"><b>${esc(i.name)}</b><div class="muted" style="color:var(--muted);font-size:12.5px">${kg(i.qty_kg)} × ${num(i.price_per_kg)}</div></div><b>${money(i.line_total)}</b></div>`).join('')}</div>
        <div><div class="sumr"><span>Products total</span><span>${money(o.items_total)}</span></div>${o.discount_amount ? `<div class="sumr"><span>Discount (${esc(o.promo_code)})</span><span>−${money(o.discount_amount)}</span></div>` : ''}<div class="sumr"><span>Delivery fee</span><span>${o.delivery_fee ? money(o.delivery_fee) : 'Free'}</span></div><div class="sumr t"><span>Total</span><span>${money(o.total)}</span></div><div class="sumr"><span>Payment</span><span>Cash on delivery</span></div></div></section>
      <section class="sec"><h4>Customer</h4><dl class="kvs"><dt>Name</dt><dd>${esc(o.customer_name)}</dd><dt>Phone</dt><dd><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></dd><dt>Address</dt><dd>${esc(o.address)}${o.apartment ? ', ' + esc(o.apartment) : ''}</dd>${o.instructions ? `<dt>Instructions</dt><dd>${esc(o.instructions)}</dd>` : ''}${o.customer ? `<dt>Account</dt><dd>${o.customer.orders_count} orders · since ${fmtDate(o.customer.created_at)}</dd>` : ''}</dl></section>
      ${o.seller_full ? `<section class="sec"><h4>Seller</h4><dl class="kvs"><dt>Store</dt><dd>${esc(o.seller_full.store_name)}</dd><dt>Owner</dt><dd>${esc(o.seller_full.owner_name)}</dd><dt>Phone</dt><dd>${esc(o.seller_full.phone || '')}</dd><dt>Address</dt><dd>${esc(o.seller_full.address || '')}</dd></dl></section>` : ''}
      <section class="sec"><h4>Courier</h4>${o.courier ? `<div class="cell"><span class="ava">${esc(initials(o.courier.name))}</span><div><b>${esc(o.courier.name)}</b><small>${esc(o.courier.vehicle || '')} · ${esc(o.courier.phone)}</small></div></div>` : '<span class="muted" style="color:var(--muted)">Not assigned yet — assigned automatically when handed over.</span>'}
        ${couriers.length ? `<div class="row" style="display:flex;gap:8px"><select class="select sm" id="cs" style="flex:1"><option value="">Assign courier…</option>${couriers.map((c) => `<option value="${c.id}" ${o.courier_id === c.id ? 'selected' : ''}>${esc(c.name)} · ${c.status}</option>`).join('')}</select><button class="btn outline sm" id="ca">Assign</button></div>` : ''}</section>
      ${o.messages?.length ? `<section class="sec"><h4>Conversation</h4><div class="mini-chat">${o.messages.map((m) => `<div class="${m.sender_role === 'CUSTOMER' ? 'c' : m.sender_role === 'ADMIN' ? 'a' : 's'}">${m.body ? esc(m.body) : '📷 Photo'}</div>`).join('')}</div>${can('chats') || isSeller() ? `<a class="btn outline sm" style="justify-self:start" href="#/chats?open=${o.chat_id}">Open conversation</a>` : ''}</section>` : ''}
      <section class="sec"><h4>Order history</h4><div class="tline">${o.history.filter((h) => h.status !== 'draft' || true).map((h) => `<div><b>${esc(stepLabels[h.status] || h.status)}</b><small>${fmtDateTime(h.created_at)}${h.actor ? ' · ' + esc(h.actor) : ''}${h.note ? ' · ' + esc(h.note) : ''}</small></div>`).join('')}</div></section>`;
    zoomable(d.el);
    const change = async (status, note) => { await api.post(`/api/admin/orders/${id}/status`, { status, note }); toast('Order updated', 'success'); onChange?.(); await paint(); };
    $('#nu', d.el)?.addEventListener('click', (e) => busy(e.currentTarget, () => change($('#ns', d.el).value, $('#nn', d.el).value || null)));
    d.el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.s === 'rejected') {
        const reason = await askReason();
        if (!reason) return;
        busy(b, () => change('rejected', reason));
      } else busy(b, () => change(b.dataset.s));
    }));
    $('#ca', d.el)?.addEventListener('click', (e) => busy(e.currentTarget, async () => { const v = $('#cs', d.el).value; if (!v) throw new Error('Choose a courier'); await api.post(`/api/admin/orders/${id}/courier`, { courier_id: +v }); toast('Courier assigned', 'success'); onChange?.(); await paint(); }));
  };
  await paint();
}

function askReason() {
  return new Promise((resolve) => {
    let val = null;
    const { el, close } = modal(`<div class="dlg"><h3>Reject this order?</h3><p>The customer will see your reason.</p><textarea class="textarea" id="rr" maxlength="200" placeholder="e.g. This fruit is out of stock today"></textarea><div class="dlg-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="ok">Reject order</button></div></div>`, { cls: 'modal-sm', onClose: () => resolve(val) });
    $('#ok', el).onclick = () => { const t = $('#rr', el).value.trim(); if (!t) { toast('Please write a reason', 'error'); return; } val = t; close(); };
  });
}

/* ================================ CHATS ================================ */
export async function chats(host, query) {
  let list = [];
  let sel = query.open ? Number(query.open) : null;
  let filter = '';
  let q = '';
  let timer;
  host.innerHTML = `<div class="ph"><div><h2>Chats</h2><p>${isSeller() ? 'Conversations with your customers' : 'Customer–seller conversations, for moderation. Intervene only when necessary.'}</p></div></div>
    <div class="card"><div class="tools"><div class="search">${icon('search', 16)}<input class="input" id="cq" placeholder="Search order, customer, store…"></div>${isTeam() ? `<select class="select" id="cf"><option value="">All conversations</option><option value="active">Active</option><option value="flagged">Flagged</option><option value="closed">Closed</option></select>` : ''}</div>
      <div class="chat-grid ${sel ? 'has' : ''}" id="cg"><div class="l" id="cl">${rows(5, 70)}</div><div class="thread" id="th"><div class="empty" style="margin:auto"><div class="em">💬</div><h3>Select a conversation</h3><p>Each chat belongs to an order.</p></div></div></div></div>`;
  const drawList = () => {
    const f = list.filter((c) => !q || `${c.order_code} ${c.customer_name} ${c.store_name} ${c.last_message}`.toLowerCase().includes(q));
    $('#cl').innerHTML = f.length ? f.map((c) => `<div class="ci ${c.id === sel ? 'on' : ''}" data-c="${c.id}"><span class="ava">${esc(initials(c.customer_name))}</span><div class="grow" style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(c.customer_name)}</b><small class="muted" style="color:var(--muted)">${ago(c.last_at)}</small></div><p>${esc(c.last_message || 'No messages yet')}</p><div style="display:flex;gap:6px;margin-top:5px;align-items:center"><span class="mono muted" style="color:var(--muted);font-size:12px">${esc(c.order_code)}</span>${isTeam() ? `<span class="muted" style="color:var(--muted);font-size:12px">· ${esc(c.store_name)}</span>` : ''}${c.status !== 'active' ? tonePill(c.status, c.status === 'flagged' ? 'bad' : '') : ''}${c.unread ? `<span class="st orange" style="margin-left:auto">${c.unread} new</span>` : ''}</div></div></div>`).join('') : emptyState('💬', 'No conversations', 'Chats appear once customers contact a seller.');
  };
  const loadList = async () => { list = await api.get(`/api/chats${filter ? `?status=${filter}` : ''}`).catch(() => list); drawList(); };
  const openThread = async (id) => {
    sel = id;
    $('#cg').classList.add('has');
    drawList();
    const th = $('#th');
    let data = await api.get(`/api/chats/${id}`);
    let intervening = !isTeam();
    let sig = '';
    const shell = () => {
      th.innerHTML = `<div class="th"><button class="ibtn" id="tb" aria-label="Back" style="display:none">${icon('chevL')}</button><span class="ava">${esc(initials(data.customer_name))}</span><div class="grow" style="flex:1"><b>${esc(data.customer_name)}</b><div class="muted" style="color:var(--muted);font-size:12.5px"><span class="mono">${esc(data.order_code)}</span> · ${esc(data.store_name)} · ${pill(data.order_status)} ${data.customer_online ? '· <span class="live-dot"></span>Online' : ''}</div></div>
        <button class="btn outline sm" id="oo">Order</button>${isTeam() ? `<button class="btn outline sm" id="fl">${data.status === 'flagged' ? 'Unflag' : 'Flag'}</button><button class="btn outline sm" id="cl2">${data.status === 'closed' ? 'Reopen' : 'Close'}</button>` : ''}</div>
        ${isTeam() ? `<div class="notice-bar ${intervening ? 'hide' : ''}" id="nb">${icon('eye', 16)} <span>Monitoring mode — the customer and seller can't see you.</span><button class="btn sm outline" id="iv" style="margin-left:auto">Intervene</button></div>` : ''}
        <div class="tm" id="tm"></div>
        <form class="tcomp ${intervening && data.status !== 'closed' ? '' : 'hide'}" id="tc"><input class="input" id="ti" placeholder="${isTeam() ? 'Message as Mevazor support…' : 'Reply to the customer…'}" maxlength="1500" autocomplete="off"><button class="btn primary" type="submit">${icon('send', 16)} Send</button></form>`;
      $('#tb').style.display = matchMedia('(max-width:900px)').matches ? 'grid' : 'none';
      $('#tb').onclick = () => { sel = null; $('#cg').classList.remove('has'); clearInterval(timer); drawList(); };
      $('#oo').onclick = () => openOrder(data.order_id);
      $('#iv')?.addEventListener('click', async () => { if (await confirmDialog({ title: 'Join this conversation?', text: 'Your message will be visible to both the customer and the seller.', confirmLabel: 'Intervene' })) { intervening = true; $('#tc').classList.remove('hide'); $('#nb').classList.add('hide'); $('#ti').focus(); } });
      $('#fl')?.addEventListener('click', async () => { await api.patch(`/api/chats/${id}`, { status: data.status === 'flagged' ? 'active' : 'flagged' }); toast('Updated', 'success'); await refresh(true); loadList(); });
      $('#cl2')?.addEventListener('click', async () => { await api.patch(`/api/chats/${id}`, { status: data.status === 'closed' ? 'active' : 'closed' }); toast('Updated', 'success'); await refresh(true); loadList(); });
      $('#tc').onsubmit = async (e) => {
        e.preventDefault();
        const body = $('#ti').value.trim();
        if (!body) return;
        $('#ti').value = '';
        try { await api.post(`/api/chats/${id}/messages`, { body }); await refresh(true); } catch (er) { toast(er.message, 'error'); $('#ti').value = body; }
      };
    };
    const paintMsgs = (force) => {
      const s = JSON.stringify(data.messages.map((m) => [m.id, m.read_at]));
      if (s === sig && !force) return;
      sig = s;
      const tm = $('#tm');
      const bottom = tm.scrollHeight - tm.scrollTop - tm.clientHeight < 80;
      tm.innerHTML = data.messages.map((m) => `<div class="tmsg ${m.sender_role === 'SELLER' ? 's' : m.sender_role === 'ADMIN' ? 'a' : ''}"><small>${m.sender_role === 'CUSTOMER' ? esc(data.customer_name) : m.sender_role === 'ADMIN' ? 'Mevazor support' : esc(data.store_name)} · ${fmtTime(m.created_at)}${m.read_at && m.sender_role !== 'CUSTOMER' ? ' · ✓✓' : ''}</small>${m.product_id ? `<div class="mini-tag" style="margin-bottom:4px">${esc(m.product_name || 'Product')}</div><br>` : ''}${m.image_url ? `<img src="${esc(m.image_url)}" data-zoom alt="">` : ''}${m.body ? esc(m.body) : ''}</div>`).join('') || '<div class="muted" style="color:var(--muted);margin:auto">No messages yet.</div>';
      if (bottom || force) tm.scrollTop = tm.scrollHeight;
    };
    async function refresh(force) { try { data = await api.get(`/api/chats/${id}`); if (force) { const tcHidden = $('#tc')?.classList.contains('hide'); const draft = $('#ti')?.value; shell(); if (!tcHidden) $('#tc').classList.remove('hide'); if (draft) $('#ti').value = draft; } paintMsgs(force); } catch { /* offline */ } }
    shell();
    zoomable(th);
    paintMsgs(true);
    clearInterval(timer);
    timer = setInterval(() => !document.hidden && sel === id && refresh(false), 4000);
  };
  $('#cl').onclick = (e) => { const c = e.target.closest('[data-c]'); if (c) openThread(+c.dataset.c); };
  $('#cq').oninput = debounce((e) => { q = e.target.value.trim().toLowerCase(); drawList(); }, 200);
  $('#cf')?.addEventListener('change', (e) => { filter = e.target.value; loadList(); });
  await loadList();
  if (sel) openThread(sel);
  const lt = setInterval(() => !document.hidden && loadList(), 8000);
  return () => { clearInterval(timer); clearInterval(lt); };
}
