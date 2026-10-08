import { $, $$, esc, icon, art, num, money, kg, toast, modal, confirmDialog, busy, fmtDateTime, fmtDate, ago, initials, debounce, uploadImage, starFill, emojiImg } from '/shared/core.js';
import { api, A, can, isSeller, isTeam, pill, tonePill, tint, fruitCell, rate, emptyState, rows, drawer, zoomable, FRUIT_EMOJI, QUALITIES, SIZES } from './common.js';
import { openOrder } from './pages-core.js';

const field = (label, inner, cls = '') => `<div class="field ${cls}"><label>${label}</label>${inner}</div>`;
const sel = (id, opts, val) => `<select class="select" id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const toolsBar = (inner) => `<div class="tools">${inner}</div>`;
const searchBox = (id, ph = 'Search…') => `<div class="search">${icon('search', 16)}<input class="input" id="${id}" placeholder="${ph}"></div>`;
const tableShell = (head, id = 'tb') => `<div class="twrap"><table><thead><tr>${head.map((h) => `<th class="${/^#/.test(h) ? 'num' : ''}">${h.replace(/^#/, '')}</th>`).join('')}</tr></thead><tbody id="${id}"><tr><td colspan="${head.length}">${rows(5)}</td></tr></tbody></table></div>`;
const cols = (n, inner) => `<tr><td colspan="${n}">${inner}</td></tr>`;

/* ================================ PRODUCTS ================================ */
export async function products(host) {
  const [cats, sellers] = await Promise.all([api.get('/api/admin/categories'), isTeam() ? api.get('/api/admin/sellers/options') : []]);
  const f = { q: '', status: '', category: '' };
  host.innerHTML = `<div class="ph"><div><h2>Products</h2><p>${isSeller() ? 'Manage your fruit listings' : 'Every fruit listed on the marketplace'}</p></div><div class="acts"><button class="btn primary" id="add">${icon('plus', 16)} Add fruit</button></div></div>
    <div class="card tcard">${toolsBar(`${searchBox('q', 'Search fruit or seller…')}<select class="select" id="fc"><option value="">All categories</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><select class="select" id="fs"><option value="">Any status</option><option value="active">Active</option><option value="hidden">Disabled</option></select>`)}
    ${tableShell(['Fruit', 'Seller', '#Price / kg', 'Stock (kg)', 'Order range', 'Details', 'Flags', 'Active', ''])}<div class="pager" id="pg"></div></div>`;
  let list = [];
  const draw = () => {
    $('#tb').innerHTML = list.length ? list.map((p) => {
      const eff = Math.round(p.price_per_kg * (100 - p.discount_percent) / 100);
      return `<tr data-id="${p.id}"><td>${fruitCell(p, p.category_name)}</td><td>${esc(p.store_name)}</td>
        <td class="num"><input class="input sm" style="width:104px;text-align:right" type="number" min="0" step="500" value="${p.price_per_kg}" data-f="price_per_kg" aria-label="Price per kg">${p.discount_percent ? `<div style="margin-top:4px"><span class="st orange">−${p.discount_percent}% → ${num(eff)}</span></div>` : ''}</td>
        <td><input class="input sm" style="width:88px" type="number" min="0" step="1" value="${p.stock_kg}" data-f="stock_kg" aria-label="Stock"><div class="stockbar ${p.stock_kg < 30 ? 'low' : ''}"><i style="width:${Math.min(100, p.stock_kg / 3)}%"></i></div></td>
        <td>${p.min_order}–${p.max_order} kg</td><td><div>${esc(p.size)} · ${esc(p.quality)}</div><small class="muted" style="color:var(--muted)">${esc(p.origin)}</small></td>
        <td><div class="tag-row">${p.is_popular ? '<span class="mini-tag pop">Popular</span>' : ''}${p.is_new ? '<span class="mini-tag new">New</span>' : ''}${p.is_seasonal ? '<span class="mini-tag sea">Seasonal</span>' : ''}</div></td>
        <td><label class="switch"><input type="checkbox" data-act="toggle" ${p.status === 'active' ? 'checked' : ''} aria-label="Enable"><i></i></label></td>
        <td style="white-space:nowrap"><button class="ibtn" data-act="edit" aria-label="Edit">${icon('edit', 18)}</button><button class="ibtn" data-act="del" aria-label="Delete">${icon('trash', 18)}</button></td></tr>`;
    }).join('') : cols(9, emptyState('🍎', 'No fruits found', 'Add your first fruit to start selling.'));
    $('#pg').innerHTML = `<span>${list.length} product${list.length === 1 ? '' : 's'}</span><span class="muted">Edit price and stock inline</span>`;
  };
  const load = async () => { const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => v && p.set(k, v)); list = await api.get(`/api/admin/products?${p}`); draw(); };
  $('#q').oninput = debounce((e) => { f.q = e.target.value.trim(); load(); }, 250);
  $('#fc').onchange = (e) => { f.category = e.target.value; load(); };
  $('#fs').onchange = (e) => { f.status = e.target.value; load(); };
  $('#add').onclick = () => productEditor(null, cats, sellers, load);
  host.addEventListener('change', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const p = list.find((x) => x.id === +tr.dataset.id);
    try {
      if (e.target.dataset.act === 'toggle') { await api.put(`/api/admin/products/${p.id}`, { status: e.target.checked ? 'active' : 'hidden' }); toast(e.target.checked ? 'Product enabled' : 'Product disabled', 'success'); p.status = e.target.checked ? 'active' : 'hidden'; }
      else if (e.target.dataset.f) { const v = Number(e.target.value); if (!(v >= 0)) throw new Error('Invalid value'); await api.put(`/api/admin/products/${p.id}`, { [e.target.dataset.f]: v }); p[e.target.dataset.f] = v; toast('Saved', 'success'); draw(); }
    } catch (er) { toast(er.message, 'error'); load(); }
  });
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    const tr = e.target.closest('tr[data-id]');
    if (!b || !tr || b.dataset.act === 'toggle') return;
    const p = list.find((x) => x.id === +tr.dataset.id);
    if (b.dataset.act === 'edit') productEditor(p, cats, sellers, load);
    if (b.dataset.act === 'del' && (await confirmDialog({ title: `Delete ${p.name}?`, text: 'If this fruit appears in past orders it will be archived (disabled) instead of removed.', confirmLabel: 'Delete', danger: true }))) {
      const r = await api.del(`/api/admin/products/${p.id}`).catch((er) => toast(er.message, 'error'));
      if (r) { toast(r.archived ? 'Product archived (used in past orders)' : 'Product deleted', 'success'); load(); }
    }
  });
  await load();
}

function productEditor(p, cats, sellers, done) {
  const v = p || { name: '', category_id: cats[0]?.id, description: '', price_per_kg: 20000, discount_percent: 0, stock_kg: 50, min_order: 0.5, max_order: 10, size: "O'rtacha", quality: 'Premium', origin: "O'zbekiston", harvest_info: '', art: '🍎', tint: '#FBE3DF', status: 'active', is_popular: 0, is_new: 1, is_seasonal: 0, delivery_min: 30, delivery_max: 60, images: [], seller_id: sellers[0]?.id };
  let images = [...(v.images || [])];
  const num_ = (id, label, val, extra = '') => field(label, `<input class="input" id="${id}" type="number" inputmode="decimal" value="${val}" ${extra}>`);
  const { el, close } = modal(`<div class="modal-head"><h3>${p ? 'Edit fruit' : 'Add fruit'}</h3><button class="ibtn" data-close aria-label="Close">${icon('x')}</button></div>
    <form class="modal-body" id="pf" novalidate>
      <div class="fg">${field('Name', `<input class="input" id="f_name" value="${esc(v.name)}" required maxlength="80" placeholder="e.g. Red Apple">`)}${field('Category', sel('f_cat', cats.map((c) => [c.id, c.name]), v.category_id))}
        ${isTeam() ? field('Seller', sel('f_seller', sellers.map((s) => [s.id, s.store_name]), v.seller_id)) : ''}${field('Status', sel('f_status', [['active', 'Active'], ['hidden', 'Disabled']], v.status))}
        ${field('Description', `<textarea class="textarea" id="f_desc" maxlength="2000">${esc(v.description)}</textarea>`, 'full')}</div>
      <div class="fg three">${num_('f_price', 'Price per kg (UZS)', v.price_per_kg, 'min="0" step="500"')}${num_('f_disc', 'Discount %', v.discount_percent, 'min="0" max="90"')}${num_('f_stock', 'Stock (kg)', v.stock_kg, 'min="0" step="1"')}
        ${num_('f_min', 'Minimum order (kg)', v.min_order, 'min="0.1" step="0.5"')}${num_('f_max', 'Maximum order (kg)', v.max_order, 'min="0.5" step="0.5"')}${field('Size', sel('f_size', SIZES.map((s) => [s, s]), v.size))}
        ${field('Quality', sel('f_qual', QUALITIES.map((s) => [s, s]), v.quality))}${field('Origin', `<input class="input" id="f_origin" value="${esc(v.origin)}" maxlength="60">`)}${field('Harvest info', `<input class="input" id="f_harv" value="${esc(v.harvest_info || '')}" maxlength="300" placeholder="Harvested Sept 2026 · Samarkand">`)}
        ${num_('f_dmin', 'Delivery min (min)', v.delivery_min, 'min="5"')}${num_('f_dmax', 'Delivery max (min)', v.delivery_max, 'min="5"')}</div>
      <div class="toggles"><label class="check"><input type="checkbox" id="f_pop" ${v.is_popular ? 'checked' : ''}> Popular</label><label class="check"><input type="checkbox" id="f_new" ${v.is_new ? 'checked' : ''}> New</label><label class="check"><input type="checkbox" id="f_sea" ${v.is_seasonal ? 'checked' : ''}> Seasonal</label></div>
      <div class="field"><label>Photos <span class="hint">(PNG/JPG/WEBP, up to 8 — shown instead of the illustration)</span></label><div class="img-row" id="imgs"></div></div>
      <div class="fg"><div class="field"><label>Illustration (used when there are no photos)</label><div class="emoji-pick" id="ep">${FRUIT_EMOJI.map((e) => `<button type="button" class="${v.art === e ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div></div>
        ${field('Card background', `<input class="input" id="f_tint" type="color" value="${tint(v.tint)}" style="padding:4px;height:40px">`)}</div>
    </form><div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${p ? 'Save changes' : 'Create fruit'}</button></div>`, { cls: 'modal-lg' });
  let art_ = v.art;
  const drawImgs = () => {
    $('#imgs', el).innerHTML = images.map((u, i) => `<div class="im"><img src="${esc(u)}" alt=""><button type="button" data-rm="${i}" aria-label="Remove">${icon('x', 12)}</button></div>`).join('') + (images.length < 8 ? `<label class="img-add" title="Upload photo">${icon('plus', 22)}<input type="file" id="fi" accept="image/png,image/jpeg,image/webp" multiple hidden></label>` : '');
    const fi = $('#fi', el);
    if (fi) fi.onchange = async (e) => { for (const file of [...e.target.files].slice(0, 8 - images.length)) { try { images.push(await uploadImage(api, file)); } catch (er) { toast(er.message, 'error'); } } drawImgs(); };
  };
  drawImgs();
  $('#imgs', el).onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { images.splice(+b.dataset.rm, 1); drawImgs(); } };
  $('#ep', el).onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) { art_ = b.dataset.e; $$('#ep button', el).forEach((x) => x.classList.toggle('on', x === b)); } };
  $('#save', el).onclick = (e) => busy(e.currentTarget, async () => {
    const g = (id) => $(`#${id}`, el);
    const body = {
      name: g('f_name').value, category_id: +g('f_cat').value, description: g('f_desc').value, price_per_kg: Math.round(+g('f_price').value), discount_percent: +g('f_disc').value || 0,
      stock_kg: +g('f_stock').value, min_order: +g('f_min').value, max_order: +g('f_max').value, size: g('f_size').value, quality: g('f_qual').value, origin: g('f_origin').value,
      harvest_info: g('f_harv').value, status: g('f_status').value, is_popular: g('f_pop').checked, is_new: g('f_new').checked, is_seasonal: g('f_sea').checked,
      delivery_min: +g('f_dmin').value, delivery_max: +g('f_dmax').value, art: art_, tint: g('f_tint').value, images,
    };
    if (isTeam()) body.seller_id = +g('f_seller').value;
    if (p) await api.put(`/api/admin/products/${p.id}`, body); else await api.post('/api/admin/products', body);
    toast(p ? 'Fruit updated' : 'Fruit created', 'success');
    close();
    done();
  });
}

/* ================================ CATEGORIES ================================ */
export async function categories(host) {
  host.innerHTML = `<div class="ph"><div><h2>Categories</h2><p>Organise the fruit catalogue</p></div><div class="acts"><button class="btn primary" id="add">${icon('plus', 16)} Add category</button></div></div><div class="card tcard">${tableShell(['Category', 'Slug', '#Fruits', '#Order', 'Visible', ''])}</div>`;
  let list = [];
  const draw = () => {
    $('#tb').innerHTML = list.map((c) => `<tr data-id="${c.id}"><td><div class="cell"><span class="art" style="background:var(--green-soft)">${emojiImg(c.emoji)}</span><b>${esc(c.name)}</b></div></td><td class="mono">${esc(c.slug)}</td><td class="num">${c.products}</td><td class="num">${c.sort}</td><td><label class="switch"><input type="checkbox" data-act="vis" ${c.active ? 'checked' : ''}><i></i></label></td><td style="white-space:nowrap"><button class="ibtn" data-act="edit">${icon('edit', 18)}</button><button class="ibtn" data-act="del">${icon('trash', 18)}</button></td></tr>`).join('') || cols(6, emptyState('🗂️', 'No categories'));
  };
  const load = async () => { list = await api.get('/api/admin/categories'); draw(); };
  const edit = (c) => {
    const { el, close } = modal(`<div class="modal-head"><h3>${c ? 'Edit' : 'New'} category</h3><button class="ibtn" data-close>${icon('x')}</button></div><form class="modal-body" novalidate>${field('Name', `<input class="input" id="n" value="${esc(c?.name || '')}" maxlength="60">`)}<div class="fg">${field('Emoji', `<input class="input" id="e" value="${esc(c?.emoji || '🍎')}" maxlength="8">`)}${field('Sort order', `<input class="input" id="s" type="number" value="${c?.sort ?? 0}">`)}</div><label class="check"><input type="checkbox" id="a" ${c?.active ?? 1 ? 'checked' : ''}> Visible in the app</label></form><div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ok">Save</button></div>`, { cls: 'modal-sm' });
    $('#ok', el).onclick = (e) => busy(e.currentTarget, async () => { const b = { name: $('#n', el).value, emoji: $('#e', el).value, sort: +$('#s', el).value || 0, active: $('#a', el).checked }; if (c) await api.put(`/api/admin/categories/${c.id}`, b); else await api.post('/api/admin/categories', b); toast('Saved', 'success'); close(); load(); });
  };
  $('#add').onclick = () => edit(null);
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); const tr = e.target.closest('tr[data-id]');
    if (!b || !tr) return;
    const c = list.find((x) => x.id === +tr.dataset.id);
    if (b.dataset.act === 'edit') edit(c);
    if (b.dataset.act === 'del' && (await confirmDialog({ title: `Delete “${c.name}”?`, text: 'Only empty categories can be deleted.', confirmLabel: 'Delete', danger: true }))) { try { await api.del(`/api/admin/categories/${c.id}`); toast('Deleted', 'success'); load(); } catch (er) { toast(er.message, 'error'); } }
  });
  host.addEventListener('change', async (e) => { if (e.target.dataset.act === 'vis') { const c = list.find((x) => x.id === +e.target.closest('tr').dataset.id); await api.put(`/api/admin/categories/${c.id}`, { active: e.target.checked }).then(() => toast('Updated', 'success')).catch((er) => toast(er.message, 'error')); } });
  await load();
}

/* ================================ CUSTOMERS ================================ */
export async function customers(host) {
  host.innerHTML = `<div class="ph"><div><h2>Customers</h2><p>People who buy fruit on Mevazor</p></div></div><div class="card tcard">${toolsBar(searchBox('q', 'Search name or phone…'))}${tableShell(['Customer', 'Phone', '#Orders', '#Spent', '#Returns', 'Last seen', 'Status'])}</div>`;
  let list = [];
  const load = async (q = '') => {
    list = await api.get(`/api/admin/customers?q=${encodeURIComponent(q)}`);
    $('#tb').innerHTML = list.map((c) => `<tr class="click" data-id="${c.id}"><td><div class="cell"><span class="ava">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>Joined ${fmtDate(c.created_at)}</small></div></div></td><td>${esc(c.phone || '')}</td><td class="num">${c.orders_count}</td><td class="num">${money(c.spent)}</td><td class="num">${c.returns_count}</td><td>${c.last_seen ? ago(c.last_seen) : '—'}</td><td>${tonePill(c.status === 'active' ? 'Active' : 'Blocked', c.status === 'active' ? 'ok' : 'bad')}</td></tr>`).join('') || cols(7, emptyState('👥', 'No customers found'));
  };
  $('#q').oninput = debounce((e) => load(e.target.value.trim()), 250);
  host.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const d = drawer('Customer', '<div class="sk" style="height:260px"></div>');
    const paint = async () => {
      const c = await api.get(`/api/admin/customers/${tr.dataset.id}`);
      d.root.querySelector('h3').textContent = c.name;
      d.el.innerHTML = `<section class="sec"><h4>Profile</h4><dl class="kvs"><dt>Phone</dt><dd>${esc(c.phone || '')}</dd><dt>Joined</dt><dd>${fmtDate(c.created_at)}</dd><dt>Status</dt><dd>${tonePill(c.status === 'active' ? 'Active' : 'Blocked', c.status === 'active' ? 'ok' : 'bad')}</dd></dl><div><button class="btn ${c.status === 'active' ? 'danger-soft' : 'outline'} sm" id="blk">${c.status === 'active' ? 'Block customer' : 'Unblock customer'}</button></div></section>
        <section class="sec"><h4>Addresses</h4>${c.addresses.map((a) => `<div><b>${esc(a.label)}</b> — ${esc(a.full_address)}${a.apartment ? ', ' + esc(a.apartment) : ''}</div>`).join('') || '<span class="muted">None saved</span>'}</section>
        <section class="sec"><h4>Recent orders</h4>${c.orders.map((o) => `<div class="ln" style="display:flex;gap:10px;align-items:center;cursor:pointer" data-o="${o.id}"><span class="mono">${esc(o.code)}</span><span class="grow" style="flex:1">${money(o.total)}</span>${pill(o.status)}</div>`).join('') || '<span class="muted">No orders</span>'}</section>`;
      $('#blk', d.el).onclick = async () => { if (c.status === 'active' && !(await confirmDialog({ title: 'Block this customer?', text: 'They will be signed out and unable to order.', confirmLabel: 'Block', danger: true }))) return; await api.patch(`/api/admin/customers/${c.id}`, { status: c.status === 'active' ? 'blocked' : 'active' }); toast('Updated', 'success'); load($('#q').value); paint(); };
      d.el.onclick = (ev) => { const r = ev.target.closest('[data-o]'); if (r) openOrder(+r.dataset.o); };
    };
    paint();
  });
  await load();
}

/* ================================ SELLERS ================================ */
export async function sellers(host) {
  host.innerHTML = `<div class="ph"><div><h2>Sellers</h2><p>Stores that list fruit on Mevazor</p></div><div class="acts"><button class="btn primary" id="add">${icon('plus', 16)} Add seller</button></div></div><div class="card tcard">${tableShell(['Store', 'Owner', 'Contact', 'Rating', '#Orders', '#Revenue', '#Products', 'Online', 'Status', ''])}</div>`;
  let list = [];
  const tone = { active: 'ok', pending: 'warn', suspended: 'bad' };
  const draw = () => {
    $('#tb').innerHTML = list.map((s) => `<tr data-id="${s.id}"><td><div class="cell"><span class="art" style="background:var(--green-soft);font-weight:800;color:var(--green)">${esc((s.store_name || '?')[0])}</span><div><b>${esc(s.store_name)}</b><small>${esc(s.address || '')}</small></div></div></td><td>${esc(s.owner_name)}</td><td>${esc(s.phone || '')}<small class="muted" style="display:block;color:var(--muted)">${esc(s.email || '')}</small></td><td>${rate(s.rating)} <small class="muted" style="color:var(--muted)">(${s.rating_count})</small></td><td class="num">${s.total_orders}</td><td class="num">${money(s.revenue)}</td><td class="num">${s.active_products}</td><td><label class="switch"><input type="checkbox" data-act="online" ${s.online ? 'checked' : ''}><i></i></label></td><td>${tonePill(s.status, tone[s.status])}</td>
      <td style="white-space:nowrap">${s.status === 'pending' ? '<button class="btn primary sm" data-act="approve">Approve</button>' : ''}<button class="ibtn" data-act="edit">${icon('edit', 18)}</button>${s.status === 'active' ? `<button class="ibtn" data-act="suspend" title="Suspend">${icon('lock', 18)}</button>` : s.status === 'suspended' ? `<button class="btn outline sm" data-act="approve">Reinstate</button>` : ''}</td></tr>`).join('');
  };
  const load = async () => { list = await api.get('/api/admin/sellers'); draw(); };
  const edit = (s) => {
    const { el, close } = modal(`<div class="modal-head"><h3>${s ? 'Edit seller' : 'Add seller'}</h3><button class="ibtn" data-close>${icon('x')}</button></div><form class="modal-body" novalidate><div class="fg">${field('Store name', `<input class="input" id="sn" value="${esc(s?.store_name || '')}">`)}${field('Owner', `<input class="input" id="so" value="${esc(s?.owner_name || '')}">`)}${field('Phone', `<input class="input" id="sp" value="${esc(s?.phone || '')}" placeholder="+998…">`)}${field('Emoji', `<input class="input" id="se" value="${esc(s?.emoji || '🍎')}" maxlength="8">`)}${field('Address', `<input class="input" id="sa" value="${esc(s?.address || '')}">`, 'full')}${field('Description', `<textarea class="textarea" id="sd">${esc(s?.description || '')}</textarea>`, 'full')}
      ${s ? '' : `${field('Login email', '<input class="input" id="sm" type="email" autocomplete="off">')}${field('Initial password', '<input class="input" id="sw" type="password" autocomplete="new-password" minlength="8">')}`}</div></form><div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ok">Save</button></div>`, { cls: 'modal-lg' });
    $('#ok', el).onclick = (e) => busy(e.currentTarget, async () => {
      const b = { store_name: $('#sn', el).value, owner_name: $('#so', el).value, phone: $('#sp', el).value, address: $('#sa', el).value, description: $('#sd', el).value, emoji: $('#se', el).value, status: s?.status || 'active' };
      if (s) await api.put(`/api/admin/sellers/${s.id}`, b); else await api.post('/api/admin/sellers', { ...b, email: $('#sm', el).value, password: $('#sw', el).value });
      toast('Saved', 'success'); close(); load();
    });
  };
  $('#add').onclick = () => edit(null);
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); const tr = e.target.closest('tr[data-id]');
    if (!b || !tr || b.dataset.act === 'online') return;
    const s = list.find((x) => x.id === +tr.dataset.id);
    if (b.dataset.act === 'edit') edit(s);
    if (b.dataset.act === 'approve') { await api.put(`/api/admin/sellers/${s.id}`, { status: 'active' }); toast('Seller is active', 'success'); load(); }
    if (b.dataset.act === 'suspend' && (await confirmDialog({ title: `Suspend ${s.store_name}?`, text: 'Their fruits will disappear from the catalogue.', confirmLabel: 'Suspend', danger: true }))) { await api.put(`/api/admin/sellers/${s.id}`, { status: 'suspended' }); toast('Seller suspended', 'success'); load(); }
  });
  host.addEventListener('change', async (e) => { if (e.target.dataset.act === 'online') { const s = list.find((x) => x.id === +e.target.closest('tr').dataset.id); await api.put(`/api/admin/sellers/${s.id}`, { online: e.target.checked }); toast('Updated', 'success'); } });
  await load();
}

/* ================================ COURIERS ================================ */
const CSTATUS = { online: ['Online', 'info'], offline: ['Offline', ''], delivering: ['Delivering', 'orange'], available: ['Available', 'ok'] };
export async function couriers(host) {
  host.innerHTML = `<div class="ph"><div><h2>Couriers</h2><p>Delivery team availability and performance</p></div><div class="acts"><button class="btn primary" id="add">${icon('plus', 16)} Add courier</button></div></div><div class="kpis" id="ck"></div><div class="card tcard">${tableShell(['Courier', 'Phone', 'Vehicle', 'Status', '#Current orders', '#Completed', 'Rating'])}</div>`;
  let list = [];
  const draw = () => {
    $('#ck').innerHTML = Object.entries(CSTATUS).map(([k, [l]]) => `<div class="card kpi"><div class="kh"><span>${l}</span></div><b>${list.filter((c) => c.status === k).length}</b></div>`).join('');
    $('#tb').innerHTML = list.map((c) => `<tr data-id="${c.id}"><td><div class="cell"><span class="ava">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>${esc(c.email || '')}</small></div></div></td><td>${esc(c.phone || '')}</td><td>${esc(c.vehicle || '—')}</td>
      <td><select class="select sm" data-act="status" style="width:140px">${Object.entries(CSTATUS).map(([k, [l]]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td class="num">${c.current_orders}</td><td class="num">${c.completed}</td><td class="num">${rate(c.rating)}</td></tr>`).join('');
  };
  const load = async () => { list = await api.get('/api/admin/couriers'); draw(); };
  $('#add').onclick = () => {
    const { el, close } = modal(`<div class="modal-head"><h3>Add courier</h3><button class="ibtn" data-close>${icon('x')}</button></div><form class="modal-body" novalidate><div class="fg">${field('Name', '<input class="input" id="n">')}${field('Phone', '<input class="input" id="p" placeholder="+998…">')}${field('Vehicle', '<input class="input" id="v" placeholder="Scooter, Damas…">')}${field('Login email', '<input class="input" id="e" type="email">')}${field('Initial password', '<input class="input" id="w" type="password" autocomplete="new-password">', 'full')}</div></form><div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ok">Create</button></div>`, { cls: 'modal-sm' });
    $('#ok', el).onclick = (e) => busy(e.currentTarget, async () => { await api.post('/api/admin/couriers', { name: $('#n', el).value, phone: $('#p', el).value, vehicle: $('#v', el).value, email: $('#e', el).value, password: $('#w', el).value }); toast('Courier added', 'success'); close(); load(); });
  };
  host.addEventListener('change', async (e) => { if (e.target.dataset.act === 'status') { const id = +e.target.closest('tr').dataset.id; await api.put(`/api/admin/couriers/${id}`, { status: e.target.value }).then(() => { toast('Status updated', 'success'); load(); }).catch((er) => toast(er.message, 'error')); } });
  await load();
}

/* ================================ REVIEWS ================================ */
export async function reviews(host) {
  host.innerHTML = `<div class="ph"><div><h2>Reviews</h2><p>${isSeller() ? 'What customers say about your fruit' : 'Moderate customer feedback'}</p></div></div><div class="card" id="rv">${rows(4, 90)}</div>`;
  const load = async () => {
    const list = await api.get('/api/admin/reviews');
    const stars = (n) => `<span class="rate">${[1, 2, 3, 4, 5].map((i) => `<span style="color:${i <= n ? '#F59E0B' : '#D5DBE6'}">${starFill(13)}</span>`).join('')}</span>`;
    $('#rv').innerHTML = list.length ? list.map((r) => `<div class="rv-card ${r.status === 'hidden' ? 'hidden-r' : ''}" data-id="${r.id}"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="art" style="width:36px;height:36px;border-radius:9px;display:grid;place-items:center;background:${tint(r.tint)};font-size:20px">${art(r)}</span><div class="grow" style="flex:1"><b>${esc(r.product)}</b> · ${esc(r.customer)}<div class="muted" style="color:var(--muted);font-size:12.5px">${esc(r.store_name)} · <span class="mono">${esc(r.order_code)}</span> · ${ago(r.created_at)}</div></div>${stars(r.rating)}${isTeam() ? `<button class="btn outline sm" data-act="toggle">${r.status === 'hidden' ? 'Show' : 'Hide'}</button>` : ''}</div>
      <div class="muted" style="color:var(--muted);font-size:12.5px">Quality ${r.quality_rating}/5 · Seller ${r.seller_rating}/5 · Delivery ${r.delivery_rating}/5</div>${r.body ? `<p>${esc(r.body)}</p>` : ''}${r.photo_url ? `<div class="photos"><img src="${esc(r.photo_url)}" data-zoom alt="Review photo"></div>` : ''}</div>`).join('') : emptyState('⭐', 'No reviews yet');
    $('#rv').onclick = async (e) => { const b = e.target.closest('[data-act=toggle]'); if (!b) return; const r = list.find((x) => x.id === +b.closest('.rv-card').dataset.id); await api.patch(`/api/admin/reviews/${r.id}`, { status: r.status === 'hidden' ? 'visible' : 'hidden' }); toast('Review updated', 'success'); load(); };
    zoomable($('#rv'));
  };
  await load();
}

/* ================================ RETURNS ================================ */
const RTONE = { pending: 'warn', approved: 'ok', rejected: 'bad', completed: 'info' };
export async function returns(host) {
  host.innerHTML = `<div class="ph"><div><h2>Returns</h2><p>Customers who refused fruit on delivery — they pay only the delivery fee</p></div></div><div class="card tcard">${toolsBar(`<select class="select" id="fs"><option value="">All statuses</option>${['pending', 'approved', 'rejected', 'completed'].map((s) => `<option>${s}</option>`).join('')}</select>`)}${tableShell(['Return', 'Customer', 'Seller', 'Product', 'Reason', '#Delivery fee', 'Photos', 'Status', 'Date'])}</div>`;
  let list = [];
  let fs = '';
  const draw = () => {
    const f = list.filter((r) => !fs || r.status === fs);
    $('#tb').innerHTML = f.map((r) => `<tr class="click" data-id="${r.id}"><td class="mono"><b>${esc(r.order_code)}</b></td><td>${esc(r.customer_name)}<small class="muted" style="display:block;color:var(--muted)">${esc(r.phone)}</small></td><td>${esc(r.store_name)}</td><td><div class="trunc">${esc(r.products)}</div></td><td><div class="trunc">${esc(r.reason)}</div></td><td class="num">${money(r.delivery_fee)}</td><td>${r.photos.length ? `${icon('image', 16)} ${r.photos.length}` : '—'}</td><td>${tonePill(r.status, RTONE[r.status])}</td><td>${fmtDate(r.created_at)}</td></tr>`).join('') || cols(9, emptyState('↩️', 'No return requests', 'Great — customers are happy with their fruit.'));
  };
  const load = async () => { list = await api.get('/api/admin/returns'); draw(); };
  $('#fs').onchange = (e) => { fs = e.target.value; draw(); };
  host.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const r = list.find((x) => x.id === +tr.dataset.id);
    const d = drawer(`Return · <span class="mono">${esc(r.order_code)}</span> ${tonePill(r.status, RTONE[r.status])}`, `
      <section class="sec"><h4>Request</h4><dl class="kvs"><dt>Reason</dt><dd>${esc(r.reason)}</dd>${r.note ? `<dt>Customer note</dt><dd>${esc(r.note)}</dd>` : ''}<dt>Products</dt><dd>${esc(r.products)}</dd><dt>Order total</dt><dd>${money(r.order_total)} <span class="muted">(not charged if approved)</span></dd><dt>Delivery fee</dt><dd><b>${money(r.delivery_fee)}</b> — payable by customer</dd><dt>Requested</dt><dd>${fmtDateTime(r.created_at)}</dd></dl>${r.photos.length ? `<div class="photos">${r.photos.map((u) => `<img src="${esc(u)}" data-zoom alt="Return photo">`).join('')}</div>` : ''}</section>
      <section class="sec"><h4>Parties</h4><dl class="kvs"><dt>Customer</dt><dd>${esc(r.customer_name)} · ${esc(r.phone)}</dd><dt>Seller</dt><dd>${esc(r.store_name)}</dd></dl><button class="btn outline sm" id="oo" style="justify-self:start">Open order</button></section>
      ${r.admin_note ? `<section class="sec"><h4>Decision note</h4><p>${esc(r.admin_note)}</p></section>` : ''}
      ${isTeam() && ['pending', 'approved'].includes(r.status) ? `<section class="sec"><h4>Decision</h4><div class="field"><label>Note to customer (optional)</label><input class="input" id="an" maxlength="400"></div><div style="display:flex;gap:8px;flex-wrap:wrap">${r.status === 'pending' ? '<button class="btn primary" data-d="approved">Approve return</button><button class="btn danger-soft" data-d="rejected">Reject</button>' : '<button class="btn primary" data-d="completed">Mark completed</button>'}</div></section>` : ''}`);
    zoomable(d.el);
    $('#oo', d.el).onclick = () => openOrder(r.order_id);
    d.el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => busy(b, async () => { await api.patch(`/api/admin/returns/${r.id}`, { status: b.dataset.d, admin_note: $('#an', d.el)?.value || null }); toast(`Return ${b.dataset.d}`, 'success'); d.close(); load(); })));
  });
  await load();
}

/* ================================ PROMOTIONS ================================ */
export async function promotions(host) {
  host.innerHTML = `<div class="ph"><div><h2>Promotions</h2><p>Promo codes and homepage banners</p></div><div class="acts"><button class="btn outline" id="bc">${icon('bell', 16)} Send notification</button><button class="btn primary" id="add">${icon('plus', 16)} New promotion</button></div></div><div class="card tcard">${tableShell(['Promotion', 'Code', '#Discount', '#Min. order', 'Period', 'Active', ''])}</div>`;
  let list = [];
  const load = async () => {
    list = await api.get('/api/admin/promotions');
    $('#tb').innerHTML = list.map((p) => `<tr data-id="${p.id}"><td><div class="cell"><span class="art" style="background:var(--coral-soft)">${emojiImg(p.art || '🍓')}</span><div><b>${esc(p.title)}</b><small>${esc(p.subtitle || '')}</small></div></div></td><td class="mono">${esc(p.code || '—')}</td><td class="num"><b>${p.discount_percent}%</b></td><td class="num">${num(p.min_total)}</td><td>${p.starts_at ? fmtDate(p.starts_at) : 'Now'} → ${p.ends_at ? fmtDate(p.ends_at) : 'No end'}</td><td><label class="switch"><input type="checkbox" data-act="on" ${p.active ? 'checked' : ''}><i></i></label></td><td style="white-space:nowrap"><button class="ibtn" data-act="edit">${icon('edit', 18)}</button><button class="ibtn" data-act="del">${icon('trash', 18)}</button></td></tr>`).join('') || cols(7, emptyState('🏷️', 'No promotions yet'));
  };
  const edit = (p) => {
    const day = (s) => (s ? s.slice(0, 10) : '');
    const { el, close } = modal(`<div class="modal-head"><h3>${p ? 'Edit' : 'New'} promotion</h3><button class="ibtn" data-close>${icon('x')}</button></div><form class="modal-body" novalidate><div class="fg">${field('Title', `<input class="input" id="t" value="${esc(p?.title || '')}">`, 'full')}${field('Subtitle', `<input class="input" id="s" value="${esc(p?.subtitle || '')}">`, 'full')}${field('Promo code', `<input class="input" id="c" value="${esc(p?.code || '')}" style="text-transform:uppercase">`)}${field('Discount %', `<input class="input" id="d" type="number" min="0" max="90" value="${p?.discount_percent ?? 10}">`)}${field('Min. order (UZS)', `<input class="input" id="m" type="number" min="0" value="${p?.min_total ?? 0}">`)}${field('Emoji', `<input class="input" id="a" value="${esc(p?.art || '🍓')}" maxlength="8">`)}${field('Starts', `<input class="input" id="st" type="date" value="${day(p?.starts_at)}">`)}${field('Ends', `<input class="input" id="en" type="date" value="${day(p?.ends_at)}">`)}</div><label class="check"><input type="checkbox" id="ac" ${p?.active ?? 1 ? 'checked' : ''}> Active</label></form><div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ok">Save</button></div>`, { cls: 'modal-lg' });
    $('#ok', el).onclick = (e) => busy(e.currentTarget, async () => {
      const iso = (v, end) => (v ? `${v}T${end ? '23:59:59' : '00:00:00'}.000Z` : null);
      const b = { title: $('#t', el).value, subtitle: $('#s', el).value, code: $('#c', el).value || null, discount_percent: +$('#d', el).value, min_total: +$('#m', el).value || 0, art: $('#a', el).value, starts_at: iso($('#st', el).value), ends_at: iso($('#en', el).value, true), active: $('#ac', el).checked };
      if (p) await api.put(`/api/admin/promotions/${p.id}`, b); else await api.post('/api/admin/promotions', b);
      toast('Saved', 'success'); close(); load();
    });
  };
  $('#add').onclick = () => edit(null);
  $('#bc').onclick = () => {
    const { el, close } = modal(`<div class="modal-head"><h3>Send notification to all customers</h3><button class="ibtn" data-close>${icon('x')}</button></div><form class="modal-body" novalidate>${field('Title', '<input class="input" id="t" maxlength="80" placeholder="Weekend fruit sale −15%">')}${field('Message', '<input class="input" id="b" maxlength="200">')}<div class="hint-box">${icon('info', 18)}<span>This appears in every active customer's notifications.</span></div></form><div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ok">Send</button></div>`, { cls: 'modal-sm' });
    $('#ok', el).onclick = (e) => busy(e.currentTarget, async () => { const r = await api.post('/api/admin/broadcast', { title: $('#t', el).value, body: $('#b', el).value }); toast(`Sent to ${r.sent} customers`, 'success'); close(); });
  };
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); const tr = e.target.closest('tr[data-id]');
    if (!b || !tr || b.dataset.act === 'on') return;
    const p = list.find((x) => x.id === +tr.dataset.id);
    if (b.dataset.act === 'edit') edit(p);
    if (b.dataset.act === 'del' && (await confirmDialog({ title: `Delete “${p.title}”?`, text: 'The promo code will stop working.', confirmLabel: 'Delete', danger: true }))) { await api.del(`/api/admin/promotions/${p.id}`); toast('Deleted', 'success'); load(); }
  });
  host.addEventListener('change', async (e) => { if (e.target.dataset.act === 'on') { const p = list.find((x) => x.id === +e.target.closest('tr').dataset.id); await api.put(`/api/admin/promotions/${p.id}`, { active: e.target.checked }); toast('Updated', 'success'); } });
  await load();
}

/* ================================ DELIVERY ================================ */
export async function delivery(host) {
  const d = await api.get('/api/admin/delivery');
  const s = d.settings;
  host.innerHTML = `<div class="ph"><div><h2>Delivery</h2><p>Fees, delivery time and the return policy shown to customers</p></div></div>
    <div class="grid2"><div class="card"><div class="card-h"><h3>Delivery settings</h3></div><form class="card-b" id="df" novalidate style="display:grid;gap:16px"><div class="fg">${field('Delivery fee per order (UZS)', `<input class="input" id="bf" type="number" min="0" step="500" value="${s.base_fee}">`)}${field('Free delivery from (UZS)', `<input class="input" id="ff" type="number" min="0" step="1000" value="${s.free_from}">`)}${field('Estimated delivery — min (minutes)', `<input class="input" id="e1" type="number" min="5" value="${s.eta_min}">`)}${field('Estimated delivery — max (minutes)', `<input class="input" id="e2" type="number" min="5" value="${s.eta_max}">`)}
      ${field('When a customer refuses fruit, they pay…', sel('rp', [['delivery_fee', 'The order’s delivery fee'], ['fixed', 'A fixed return fee'], ['free', 'Nothing']], s.return_policy))}${field('Fixed return fee (UZS)', `<input class="input" id="rf" type="number" min="0" value="${s.return_fixed_fee}">`)}${field('Support phone shown to customers', `<input class="input" id="sp" value="${esc(s.support_phone || '')}">`, 'full')}</div>
      <div class="hint-box">${icon('info', 18)}<span>Changes apply to new orders immediately. The fruit price is never charged when a customer rejects an order for unacceptable quality.</span></div><div><button class="btn primary" type="submit">Save settings</button></div></form></div>
    <div class="card"><div class="card-h"><div><h3>Live deliveries</h3><small>Handed to courier or on the way</small></div></div><div class="card-b" style="display:grid;gap:12px">${d.live.length ? d.live.map((o) => `<div class="cell" style="cursor:pointer" data-o="${o.id}"><span class="art" style="background:var(--coral-soft)">${icon('truck', 20)}</span><div class="grow" style="flex:1"><b class="mono">${esc(o.code)}</b><small>${esc(o.address)}</small></div><div style="text-align:right">${pill(o.status)}<small style="display:block;color:var(--muted)">${esc(o.courier_name || 'No courier')}</small></div></div>`).join('') : emptyState('🛵', 'No active deliveries')}</div></div></div>
    <div class="card tcard"><div class="card-h" style="padding-bottom:12px"><h3>Courier availability</h3><a class="btn ghost sm" href="#/couriers">Manage couriers ${icon('chevR', 14)}</a></div>${`<div class="twrap"><table><thead><tr><th>Courier</th><th>Status</th><th class="num">Current</th><th class="num">Completed</th><th class="num">Rating</th></tr></thead><tbody>${d.couriers.map((c) => `<tr><td><div class="cell"><span class="ava">${esc(initials(c.name))}</span><b>${esc(c.name)}</b></div></td><td>${tonePill(CSTATUS[c.status][0], CSTATUS[c.status][1])}</td><td class="num">${c.current_orders}</td><td class="num">${c.completed}</td><td class="num">${rate(c.rating)}</td></tr>`).join('')}</tbody></table></div>`}</div>`;
  $('#df').onsubmit = (e) => { e.preventDefault(); busy(e.currentTarget.querySelector('button[type=submit]'), async () => { await api.put('/api/admin/delivery', { base_fee: +$('#bf').value, free_from: +$('#ff').value, eta_min: +$('#e1').value, eta_max: +$('#e2').value, return_policy: $('#rp').value, return_fixed_fee: +$('#rf').value || 0, support_phone: $('#sp').value }); toast('Delivery settings saved', 'success'); }); };
  host.onclick = (e) => { const r = e.target.closest('[data-o]'); if (r) openOrder(+r.dataset.o); };
}

/* ================================ NOTIFICATIONS ================================ */
const NI = { new_order: 'box', order_cancelled: 'x', message: 'chat', seller_reply: 'chat', return_request: 'refresh', new_seller: 'store', warning: 'alert', stock: 'alert', review: 'star', courier_task: 'truck', promo: 'gift' };
export function notifRoute(link) {
  if (!link) return;
  const m = /^#?\/orders\/(\d+)/.exec(link);
  if (m) { location.hash = '/orders'; setTimeout(() => openOrder(+m[1]), 350); return; }
  const c = /^#?\/chats\/(\d+)/.exec(link);
  location.hash = c ? `/chats?open=${c[1]}` : link.replace(/^#/, '');
}
export async function notifications(host) {
  const load = async () => {
    const { items, unread } = await api.get('/api/notifications');
    A.unread = unread;
    window.__badge?.();
    host.innerHTML = `<div class="ph"><div><h2>Notifications</h2><p>${unread ? `${unread} unread` : 'You are all caught up'}</p></div><div class="acts">${unread ? '<button class="btn outline" id="ra">Mark all as read</button>' : ''}</div></div>
      <div class="card">${items.length ? items.map((n) => `<div class="nitem ${n.read_at ? '' : 'u'}" data-id="${n.id}" data-link="${esc(n.link || '')}"><span class="ni">${icon(NI[n.type] || 'bell', 18)}</span><div class="grow" style="flex:1"><b>${esc(n.title)}</b><div class="muted" style="color:var(--muted)">${esc(n.body || '')}</div></div><small class="muted" style="color:var(--muted)">${ago(n.created_at)}</small></div>`).join('') : emptyState('🔔', 'No notifications')}</div>`;
    $('#ra')?.addEventListener('click', async () => { await api.post('/api/notifications/read'); load(); });
    host.querySelectorAll('.nitem').forEach((n) => n.addEventListener('click', async () => { await api.post('/api/notifications/read', { id: +n.dataset.id }); notifRoute(n.dataset.link); load(); }));
  };
  await load();
}

/* ================================ SETTINGS ================================ */
export async function settings(host) {
  const u = A.user;
  host.innerHTML = `<div class="ph"><div><h2>Settings</h2><p>Your account${u.role === 'SUPER_ADMIN' ? ', team and audit log' : ''}</p></div></div>
    <div class="grid2e"><div class="card"><div class="card-h"><h3>Profile</h3></div><form class="card-b" id="pf" style="display:grid;gap:14px" novalidate>${field('Name', `<input class="input" id="pn" value="${esc(u.name)}">`)}${field('Phone', `<input class="input" id="pp" value="${esc(u.phone || '')}">`)}<div class="hint">Role: <b>${esc(u.role.replace('_', ' '))}</b>${u.email ? ` · ${esc(u.email)}` : ''}</div><div><button class="btn primary" type="submit">Save profile</button></div></form></div>
      <div class="card"><div class="card-h"><h3>Change password</h3></div><form class="card-b" id="pw" style="display:grid;gap:14px" novalidate>${field('Current password', '<input class="input" id="cp" type="password" autocomplete="current-password">')}${field('New password', '<input class="input" id="np" type="password" autocomplete="new-password" minlength="8">')}<div><button class="btn primary" type="submit">Update password</button></div></form></div></div>
    ${u.role === 'SUPER_ADMIN' ? '<div id="team"></div><div id="audit"></div>' : ''}`;
  $('#pf').onsubmit = (e) => { e.preventDefault(); busy(e.currentTarget.querySelector('button'), async () => { const r = await api.patch('/api/me', { name: $('#pn').value, phone: $('#pp').value }); Object.assign(A.user, r); toast('Profile saved', 'success'); window.__me?.(); }); };
  $('#pw').onsubmit = (e) => { e.preventDefault(); busy(e.currentTarget.querySelector('button'), async () => { await api.patch('/api/me', { current_password: $('#cp').value, new_password: $('#np').value }); toast('Password updated', 'success'); e.target.reset(); }); };
  if (u.role !== 'SUPER_ADMIN') return;

  const loadTeam = async () => {
    const team = await api.get('/api/admin/team');
    $('#team').innerHTML = `<div class="card tcard"><div class="card-h" style="padding-bottom:12px"><div><h3>Team & permissions</h3><small>Role-based access for administrators</small></div><button class="btn primary sm" id="ta">${icon('plus', 14)} Add administrator</button></div><div class="twrap"><table><thead><tr><th>Member</th><th>Role</th><th>Permissions</th><th>Status</th><th></th></tr></thead><tbody>${team.map((t) => `<tr data-id="${t.id}"><td><div class="cell"><span class="ava">${esc(initials(t.name))}</span><div><b>${esc(t.name)}</b><small>${esc(t.email || '')}</small></div></div></td><td>${tonePill(t.role.replace('_', ' '), t.role === 'SUPER_ADMIN' ? 'brand' : '')}</td><td><div class="tag-row">${t.role === 'SUPER_ADMIN' ? '<span class="mini-tag">Everything</span>' : t.permissions.map((p) => `<span class="mini-tag">${esc(p)}</span>`).join('') || '—'}</div></td><td>${tonePill(t.status === 'active' ? 'Active' : 'Blocked', t.status === 'active' ? 'ok' : 'bad')}</td><td>${t.role === 'ADMIN' ? `<button class="ibtn" data-act="perm">${icon('edit', 18)}</button><button class="ibtn" data-act="blk">${icon('lock', 18)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
    const ALL = ['dashboard', 'products', 'categories', 'orders', 'customers', 'sellers', 'couriers', 'chats', 'reviews', 'returns', 'promotions', 'delivery', 'analytics'];
    const permGrid = (cur) => `<div class="perm-grid">${ALL.map((p) => `<label><input type="checkbox" value="${p}" ${cur.includes(p) ? 'checked' : ''}> ${p}</label>`).join('')}</div>`;
    $('#ta').onclick = () => {
      const { el, close } = modal(`<div class="modal-head"><h3>Add administrator</h3><button class="ibtn" data-close>${icon('x')}</button></div><form class="modal-body" novalidate><div class="fg">${field('Name', '<input class="input" id="n">')}${field('Job title', '<input class="input" id="jt" value="Moderator">')}${field('Email', '<input class="input" id="e" type="email">')}${field('Phone', '<input class="input" id="p" placeholder="+998…">')}${field('Initial password', '<input class="input" id="w" type="password" autocomplete="new-password">', 'full')}</div><div class="field"><label>Permissions</label>${permGrid(['dashboard', 'orders'])}</div></form><div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ok">Create</button></div>`, { cls: 'modal-lg' });
      $('#ok', el).onclick = (e) => busy(e.currentTarget, async () => { await api.post('/api/admin/team', { name: $('#n', el).value, title: $('#jt', el).value, email: $('#e', el).value, phone: $('#p', el).value, password: $('#w', el).value, permissions: $$('.perm-grid input:checked', el).map((c) => c.value) }); toast('Administrator created', 'success'); close(); loadTeam(); loadAudit(); });
    };
    $('#team').onclick = async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const t = team.find((x) => x.id === +b.closest('tr').dataset.id);
      if (b.dataset.act === 'perm') {
        const { el, close } = modal(`<div class="modal-head"><h3>Permissions · ${esc(t.name)}</h3><button class="ibtn" data-close>${icon('x')}</button></div><div class="modal-body">${permGrid(t.permissions)}</div><div class="modal-foot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ok">Save</button></div>`, { cls: 'modal-lg' });
        $('#ok', el).onclick = (ev) => busy(ev.currentTarget, async () => { await api.patch(`/api/admin/team/${t.id}`, { permissions: $$('.perm-grid input:checked', el).map((c) => c.value) }); toast('Permissions saved', 'success'); close(); loadTeam(); loadAudit(); });
      } else { await api.patch(`/api/admin/team/${t.id}`, { status: t.status === 'active' ? 'blocked' : 'active' }); toast('Updated', 'success'); loadTeam(); loadAudit(); }
    };
  };
  const loadAudit = async () => {
    const log = await api.get('/api/admin/audit?limit=60');
    $('#audit').innerHTML = `<div class="card tcard"><div class="card-h" style="padding-bottom:12px"><div><h3>Audit log</h3><small>Recent sensitive actions</small></div></div><div class="twrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>${log.map((a) => `<tr><td>${fmtDateTime(a.created_at)}</td><td>${esc(a.user_name || '—')} <small class="muted" style="color:var(--muted)">${esc(a.role || '')}</small></td><td class="mono">${esc(a.action)}</td><td>${esc(a.entity || '')} ${a.entity_id ? '#' + esc(a.entity_id) : ''}</td><td class="trunc mono" style="font-size:12px" title="${esc(a.meta || '')}">${esc(a.meta || '')}</td></tr>`).join('')}</tbody></table></div></div>`;
  };
  await Promise.all([loadTeam(), loadAudit()]);
}
void kg; void fruitCell;
