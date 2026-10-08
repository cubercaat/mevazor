import { $, $$, esc, icon, art, num, kg, money, toast, modal, confirmDialog, busy, fmtDateTime, fmtTime, uploadImage, starFill } from '/shared/core.js';
import { api, S, cart, cartGroups, deliveryFeeFor, nav, requireLogin, emit, refreshCounters } from './state.js';
import { empty, tint, statusTone, isLive } from './components.js';

const view = () => document.getElementById('view');
const artBox = (it) => `<span class="ma" style="--tint:${tint(it.tint)}">${art(it)}</span>`;

/* ----------------------------- promo + totals ----------------------------- */
const PROMO_KEY = 'mz_promo';
const getPromo = () => { try { return JSON.parse(sessionStorage.getItem(PROMO_KEY)); } catch { return null; } };
const setPromo = (p) => { try { p ? sessionStorage.setItem(PROMO_KEY, JSON.stringify(p)) : sessionStorage.removeItem(PROMO_KEY); } catch { /* ignore */ } };

function totals() {
  const promo = getPromo();
  const groups = cartGroups().map((g) => {
    const discount = promo ? Math.round((g.subtotal * promo.discount_percent) / 100) : 0;
    const fee = deliveryFeeFor(g.subtotal - discount);
    return { ...g, discount, fee, total: g.subtotal - discount + fee };
  });
  return {
    groups, promo,
    items: groups.reduce((a, g) => a + g.subtotal, 0),
    discount: groups.reduce((a, g) => a + g.discount, 0),
    fee: groups.reduce((a, g) => a + g.fee, 0),
    total: groups.reduce((a, g) => a + g.total, 0),
  };
}

function summaryHtml(t, { cta = '' } = {}) {
  const st = S.boot.settings;
  const single = t.groups.length === 1;
  const remaining = single ? Math.max(0, st.free_from - (t.items - t.discount)) : 0;
  const pct = Math.min(100, Math.round(((t.items - t.discount) / st.free_from) * 100));
  return `
    <div class="sum-row"><span>Mahsulotlar jami</span><b class="num">${money(t.items)}</b></div>
    ${t.discount ? `<div class="sum-row"><span>Promokod (${esc(t.promo.code)})</span><b class="num" style="color:var(--coral)">−${money(t.discount)}</b></div>` : ''}
    <div class="sum-row"><span>Yetkazib berish${t.groups.length > 1 ? ` (${t.groups.length} ta sotuvchi)` : ''}</span>${t.fee ? `<b class="num">${money(t.fee)}</b>` : '<b class="free">Bepul</b>'}</div>
    ${single && remaining > 0 ? `<div class="ship-prog" style="--p:${pct}%">Yana ${money(remaining)} xarid qiling — yetkazib berish bepul bo'ladi<i></i></div>` : ''}
    <div class="sum-row total"><span>Jami</span><span class="num">${money(t.total)}</span></div>${cta}`;
}

/* =============================== CART =============================== */
export async function cartPage() {
  const v = view();
  const draw = () => {
    if (!cart.count()) {
      v.innerHTML = `<div class="container"><div class="page-head"><h1>Savat</h1></div>${empty('🧺', 'Savatingiz bo\'sh', 'Yangi mevalarni tanlang — ular bir necha daqiqada yo\'lga chiqadi.', '<a class="btn primary" href="#/fruits">Mevalarni ko\'rish</a>')}</div>`;
      return;
    }
    const t = totals();
    v.innerHTML = `<div class="container"><div class="page-head"><h1>Savat</h1><p>${cart.count()} xil meva</p></div>
      <div class="two-col" style="margin-top:18px">
        <div class="panel" style="padding-top:8px;padding-bottom:8px" id="lines">${cart.items.map((i) => `
          <div class="line-item" data-id="${i.id}">
            <a href="#/fruit/${i.id}" class="li-art" style="--tint:${tint(i.tint)}">${i.image ? `<img src="${esc(i.image)}" alt="">` : art(i)}</a>
            <div class="li-main"><b>${esc(i.name)}</b><span class="muted" style="font-size:13px">${esc(i.seller)}</span><span class="muted num" style="font-size:13.5px">${num(i.price)} UZS / kg</span>
              <button class="rm" data-rm="${i.id}">${icon('trash', 15)} O'chirish</button></div>
            <div class="li-side"><div class="stepper sm"><button data-dec="${i.id}" ${i.qty <= i.min ? 'disabled' : ''} aria-label="Kamaytirish">${icon('minus', 16)}</button><input data-qin="${i.id}" value="${i.qty}" inputmode="decimal" aria-label="Kilogramm"><span class="unit" style="margin-left:-6px;margin-right:6px;font-size:13px">kg</span><button data-inc="${i.id}" ${i.qty >= i.max ? 'disabled' : ''} aria-label="Ko'paytirish">${icon('plus', 16)}</button></div>
              <b class="num">${money(Math.round(i.price * i.qty))}</b></div>
          </div>`).join('')}</div>
        <aside class="panel sticky"><h3>Buyurtma xulosasi</h3>
          <div class="promo-in"><input class="input" id="pcode" placeholder="Promokod" value="${esc(t.promo?.code || '')}" ${t.promo ? 'readonly' : ''}><button class="btn ${t.promo ? 'ghost' : 'soft'}" id="papply">${t.promo ? 'Olib tashlash' : 'Qo\'llash'}</button></div>
          <div id="sumbox">${summaryHtml(t)}</div>
          <button class="btn primary lg block" id="order" style="margin-top:14px">Buyurtma berish ${icon('arrow', 18)}</button>
          <div class="mini-trust"><div>${icon('dollar', 18)} Yetkazilganda to'laysiz — karta shart emas</div><div>${icon('shield', 18)} Yoqmasa, qaytarasiz — meva narxi hisoblanmaydi</div></div>
        </aside></div></div>`;
  };
  const redrawTotals = () => { const t = totals(); $('#sumbox').innerHTML = summaryHtml(t); };
  draw();
  if (cart.count()) {
    try { await cart.sync(); if (location.hash.startsWith('#/cart')) draw(); } catch { /* offline: keep local copy */ }
  }
  v.onclick = (e) => {
    const g = (sel) => e.target.closest(sel);
    let b;
    if ((b = g('[data-inc]'))) { const it = cart.items.find((i) => i.id === +b.dataset.inc); cart.setQty(it.id, it.qty + 0.5); draw(); }
    else if ((b = g('[data-dec]'))) { const it = cart.items.find((i) => i.id === +b.dataset.dec); cart.setQty(it.id, it.qty - 0.5); draw(); }
    else if ((b = g('[data-rm]'))) {
      const row = b.closest('.line-item');
      row.classList.add('removing');
      setTimeout(() => {
        const old = cart.remove(+b.dataset.rm);
        draw();
        toast(`${old.name} olib tashlandi`, 'info', { label: 'Qaytarish', run: () => { cart.restore(old); if (location.hash.startsWith('#/cart')) cartPage(); } });
      }, 220);
    } else if ((b = g('#papply'))) {
      if (getPromo()) { setPromo(null); draw(); return; }
      const code = $('#pcode').value.trim();
      if (!code) return;
      busy(b, async () => {
        try { setPromo(await api.post('/api/promo/validate', { code, total: cart.subtotal() })); toast('Promokod qo\'llandi', 'success'); draw(); }
        catch (err) { toast(err.message, 'error'); }
      });
    } else if ((b = g('#order'))) {
      if (!requireLogin('/checkout')) return;
      nav('/checkout');
    }
  };
  v.onchange = (e) => {
    const inp = e.target.closest('[data-qin]');
    if (!inp) return;
    const n = parseFloat(String(inp.value).replace(',', '.'));
    const it = cart.items.find((i) => i.id === +inp.dataset.qin);
    if (Number.isFinite(n)) cart.setQty(it.id, n);
    draw();
  };
  void redrawTotals;
}

/* =============================== CHECKOUT =============================== */
export async function checkout() {
  if (!requireLogin('/checkout')) return;
  const v = view();
  if (!cart.count()) { nav('/cart'); return; }
  v.innerHTML = '<div class="container"><div class="page-head"><h1>Buyurtmani rasmiylashtirish</h1></div><div class="sk" style="height:480px;border-radius:24px;margin-top:20px"></div></div>';
  try { await cart.sync(); } catch { /* ignore */ }
  if (!cart.count()) { nav('/cart'); return; }
  const addresses = await api.get('/api/addresses').catch(() => []);
  const def = addresses.find((a) => a.is_default) || addresses[0];
  const t = totals();
  const st = S.boot.settings;
  v.innerHTML = `<div class="container"><div class="page-head"><h1>Buyurtmani rasmiylashtirish</h1><p>Bir necha soniyada — to'lov yetkazilganda</p></div>
    <form id="co" class="two-col" style="margin-top:18px" novalidate>
      <div class="stack">
        <section class="panel"><h3>${icon('user', 20)} Qabul qiluvchi</h3>
          <div class="form-grid">
            <div class="field"><label for="f_name">Ism-familiya</label><input class="input" id="f_name" required minlength="2" autocomplete="name" value="${esc(S.user.name)}"></div>
            <div class="field"><label for="f_phone">Telefon raqam</label><input class="input" id="f_phone" required type="tel" inputmode="tel" autocomplete="tel" value="${esc(S.user.phone || '')}" placeholder="+998 90 123 45 67"></div>
          </div></section>
        <section class="panel"><h3>${icon('pin', 20)} Yetkazib berish manzili</h3>
          ${addresses.length ? `<div class="addr-pick" id="apick">${addresses.map((a) => `<button type="button" class="opt ${def && a.id === def.id ? 'on' : ''}" data-a="${a.id}">${esc(a.label)}</button>`).join('')}<button type="button" class="opt" data-a="new">+ Yangi manzil</button></div>` : ''}
          <div class="form-grid">
            <div class="field full"><label for="f_addr">Manzil</label><input class="input" id="f_addr" required minlength="5" autocomplete="street-address" placeholder="Shahar, ko'cha, uy" value="${esc(def?.full_address || '')}"></div>
            <div class="field"><label for="f_apt">Xonadon / uy ma'lumoti</label><input class="input" id="f_apt" placeholder="Masalan: 24-xonadon, 3-qavat" value="${esc(def?.apartment || '')}"></div>
            <div class="field"><label for="f_ins">Qo'shimcha izoh</label><input class="input" id="f_ins" placeholder="Kuryerga ko'rsatma" value="${esc(def?.instructions || '')}"></div>
          </div>
          <label class="check" style="margin-top:14px"><input type="checkbox" id="f_save" ${addresses.length ? '' : 'checked'}> Bu manzilni saqlab qo'yish</label></section>
        <section class="panel"><h3>${icon('dollar', 20)} To'lov usuli</h3>
          <div class="pay"><span class="radio"></span><div><b>Yetkazib berilganda to'lash</b><small>Naqd yoki karta orqali kuryerga. Oldindan to'lov shart emas.</small></div></div></section>
        <section class="return-box"><h4>${icon('shield', 20)} Meva sizga yoqmasa, mahsulotni qaytarishingiz mumkin.</h4>
          <ul><li>${icon('eye', 18)}<span>Kuryer kelganda mevalarni ko'zdan kechirish huquqiga egasiz.</span></li>
          <li>${icon('undo', 18)}<span>Sifat yoqmasa — rad eting yoki qaytaring. Murakkab jarayon yo'q.</span></li>
          <li>${icon('truck', 18)}<span>${st.return_policy === 'free' ? "Qaytarishda hech narsa to'lanmaydi, meva narxi hisoblanmaydi." : `Faqat yetkazib berish haqi (${st.return_policy === 'fixed' ? money(st.return_fixed_fee) : 'buyurtmadagi miqdorda'}) to'lanadi, meva narxi hisoblanmaydi.`}</span></li></ul></section>
      </div>
      <aside class="panel sticky"><h3>Buyurtma tarkibi</h3>
        ${t.groups.map((g) => `<div class="mini-items" style="margin-bottom:14px"><div class="label">${esc(g.seller)}</div>${g.items.map((i) => `<div class="mini-item">${artBox(i)}<div class="grow"><b>${esc(i.name)}</b><div class="muted num" style="font-size:12.5px">${kg(i.qty)} × ${num(i.price)}</div></div><b class="num">${money(Math.round(i.price * i.qty))}</b></div>`).join('')}</div>`).join('')}
        ${summaryHtml(t)}
        <button class="btn primary lg block" id="submit" type="submit" style="margin-top:14px">Buyurtma berish</button>
        <p class="hint" style="margin-top:10px;text-align:center">Keyingi qadamda sotuvchiga savol berishingiz yoki darhol tasdiqlashingiz mumkin.</p></aside>
    </form></div>`;

  $('#apick')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    $$('#apick .opt').forEach((x) => x.classList.toggle('on', x === b));
    const a = addresses.find((x) => String(x.id) === b.dataset.a);
    $('#f_addr').value = a?.full_address || '';
    $('#f_apt').value = a?.apartment || '';
    $('#f_ins').value = a?.instructions || '';
    if (!a) $('#f_addr').focus();
  });
  $('#co').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#f_name').value.trim();
    const phone = $('#f_phone').value.trim();
    const address = $('#f_addr').value.trim();
    $$('.input.invalid').forEach((x) => x.classList.remove('invalid'));
    const bad = [];
    if (name.length < 2) bad.push('f_name');
    if (!/^\+?\d[\d\s()-]{8,}$/.test(phone)) bad.push('f_phone');
    if (address.length < 5) bad.push('f_addr');
    if (bad.length) { bad.forEach((id) => $('#' + id).classList.add('invalid')); $('#' + bad[0]).focus(); toast("Majburiy maydonlarni to'g'ri to'ldiring", 'error'); return; }
    busy($('#submit'), async () => {
      const body = {
        customer_name: name, phone, address, apartment: $('#f_apt').value.trim(), instructions: $('#f_ins').value.trim(),
        promo_code: getPromo()?.code || null,
        items: cart.items.map((i) => ({ product_id: i.id, qty_kg: i.qty })),
      };
      const res = await api.post('/api/orders', body);
      if ($('#f_save').checked && !addresses.some((a) => a.full_address === address)) {
        api.post('/api/addresses', { label: addresses.length ? 'Manzil ' + (addresses.length + 1) : 'Uy', full_address: address, apartment: body.apartment, instructions: body.instructions, is_default: !addresses.length }).catch(() => {});
      }
      cart.clear();
      setPromo(null);
      nav(`/confirm/${res.group_code}`);
    });
  });
}

/* ================= CONFIRMATION (contact seller or confirm) ================= */
async function groupOrders(code) {
  const all = await api.get('/api/orders');
  return all.filter((o) => o.group_code === code);
}
export async function confirmPage({ group }) {
  if (!requireLogin()) return;
  const v = view();
  v.innerHTML = '<div class="container"><div class="sk" style="height:420px;border-radius:28px;margin-top:30px;max-width:640px;margin-left:auto;margin-right:auto"></div></div>';
  const orders = (await groupOrders(group)).filter((o) => o.status === 'draft');
  if (!orders.length) { nav('/orders'); return; }
  const total = orders.reduce((a, o) => a + o.total, 0);
  v.innerHTML = `<div class="container"><div class="confirm-hero">
      <div class="badge-ic">${icon('chat', 34)}</div>
      <span class="pill warn">${icon('info', 14)} Buyurtma hali sotuvchiga yuborilmagan</span>
      <h1>Buyurtmani tasdiqlashdan oldin sotuvchiga savolingiz bormi?</h1>
      <p class="muted">Meva yangi-mi, qaysi hajmda, shirinligi qanday — so'rashingiz mumkin. Bu majburiy emas: xohlasangiz, darhol tasdiqlang.</p>
      <div class="confirm-actions">
        <button class="btn outline lg block" id="contact">${icon('phone', 20)} Sotuvchi bilan bog'lanish</button>
        <button class="btn primary lg block" id="confirm">${icon('check', 20)} Savolsiz, buyurtmani tasdiqlash</button>
      </div>
    </div>
    <div class="panel confirm-card">${orders.map((o) => `<div style="padding:4px 0 12px"><div class="row" style="justify-content:space-between"><b>${esc(o.seller.store_name)}</b><span class="muted" style="font-size:13px"><span class="dot ${o.seller.online ? 'on' : ''}"></span>${o.seller.online ? 'Onlayn' : 'Oflayn'}</span></div>
      <div class="mini-items" style="margin:10px 0">${o.items.map((i) => `<div class="mini-item">${artBox(i)}<div class="grow"><b>${esc(i.name)}</b><div class="muted" style="font-size:12.5px">${kg(i.qty_kg)}</div></div><b class="num">${money(i.line_total)}</b></div>`).join('')}</div></div>`).join('<hr style="border:0;border-top:1px dashed var(--line-strong);margin:4px 0 12px">')}
      <div class="sum-row total" style="margin-top:0"><span>Jami (yetkazilganda to'lanadi)</span><span class="num">${money(total)}</span></div></div>
    <p style="text-align:center;margin-top:16px"><button class="btn ghost sm" id="cancel">Buyurtmani bekor qilish</button></p></div>`;

  const openChat = async (o) => { const c = await api.post(`/api/orders/${o.id}/chat`); nav(`/chat/${c.id}?from=${group}`); };
  $('#contact').onclick = (e) => {
    if (orders.length === 1) return busy(e.currentTarget, () => openChat(orders[0]));
    const { el, close } = modal(`<div class="modal-head"><h3>Qaysi sotuvchi bilan bog'lanasiz?</h3><button class="ibtn" data-close>${icon('x')}</button></div><div class="modal-body">${orders.map((o) => `<button class="seller-card" data-o="${o.id}" style="text-align:left"><span class="seller-ava">${esc((o.seller.store_name || '?')[0])}</span><div class="grow"><b>${esc(o.seller.store_name)}</b><div class="muted" style="font-size:13px">${o.items.map((i) => esc(i.name)).join(', ')}</div></div>${icon('chevR', 18)}</button>`).join('')}</div>`);
    el.onclick = async (ev) => { const b = ev.target.closest('[data-o]'); if (b) { close(); try { await openChat(orders.find((x) => x.id === +b.dataset.o)); } catch (err) { toast(err.message, 'error'); } } };
  };
  $('#confirm').onclick = (e) => busy(e.currentTarget, async () => {
    await api.post(`/api/orders/confirm-group/${group}`);
    refreshCounters();
    nav(`/done/${group}`);
  });
  $('#cancel').onclick = async () => {
    if (!(await confirmDialog({ title: 'Buyurtmani bekor qilasizmi?', text: 'Savat bo\'shatilgan. Mevalarni qaytadan tanlashingiz kerak bo\'ladi.', confirmLabel: 'Ha, bekor qilish', cancelLabel: 'Yo\'q', danger: true }))) return;
    await Promise.all(orders.map((o) => api.post(`/api/orders/${o.id}/cancel`).catch(() => {})));
    toast('Buyurtma bekor qilindi', 'info');
    nav('/fruits');
  };
}

export async function donePage({ group }) {
  if (!requireLogin()) return;
  const v = view();
  const orders = await groupOrders(group);
  v.innerHTML = `<div class="container"><div class="confirm-hero" style="padding-top:44px"><div class="success-ring">${icon('check', 46)}</div>
    <h1>Buyurtma yuborildi!</h1><p class="muted">Sotuvchi buyurtmangizni ko'rib chiqadi. Holatini real vaqtda kuzatib borishingiz mumkin.</p></div>
    <div class="confirm-card" style="display:grid;gap:12px">${orders.map((o) => `<a class="ocard" href="#/orders/${o.id}"><div class="ocard-top"><b>${esc(o.code)}</b><span class="pill live">${esc(o.status_label)}</span></div><div class="row"><div class="o-items">${o.items.slice(0, 4).map((i) => `<span class="oi" style="--tint:${tint(i.tint)}">${art(i)}</span>`).join('')}</div><div class="grow" style="margin-left:14px"><b>${esc(o.seller.store_name)}</b><div class="muted" style="font-size:13px">Taxminan ${o.eta_min}–${o.eta_max} daqiqa</div></div><b class="num">${money(o.total)}</b></div></a>`).join('')}
    <div class="row" style="gap:10px;margin-top:6px"><a class="btn primary grow" href="#/orders/${orders[0]?.id}">Kuzatish</a><a class="btn outline grow" href="#/fruits">Davom etish</a></div></div></div>`;
}

/* =============================== ORDERS =============================== */
const FLOW_ORDER = ['sent', 'reviewing', 'accepted', 'preparing', 'handed', 'on_way', 'delivered', 'completed'];
const stepIdx = (s) => FLOW_ORDER.indexOf(s);

export async function orders() {
  if (!requireLogin()) return;
  const v = view();
  let tab = 'active';
  let list = [];
  const draw = () => {
    const f = list.filter((o) => (tab === 'active' ? isLive(o.status) || ['draft', 'delivered', 'return_requested'].includes(o.status) : tab === 'done' ? ['completed', 'returned', 'rejected', 'cancelled'].includes(o.status) : true));
    $('#olist').innerHTML = f.length ? f.map((o, i) => {
      const idx = stepIdx(o.status);
      return `<a class="ocard" href="${o.status === 'draft' ? `#/confirm/${o.group_code}` : `#/orders/${o.id}`}" style="animation-delay:${i * 40}ms">
        <div class="ocard-top"><div><b>${esc(o.code)}</b> <span class="muted" style="font-size:13px">· ${fmtDateTime(o.created_at)}</span></div><span class="pill ${statusTone(o.status)} ${isLive(o.status) ? 'live' : ''}">${esc(o.status_label)}</span></div>
        <div class="row"><div class="o-items">${o.items.slice(0, 4).map((it) => `<span class="oi" style="--tint:${tint(it.tint)}">${art(it)}</span>`).join('')}</div>
          <div class="grow" style="margin-left:16px"><b>${esc(o.seller.store_name)}</b><div class="muted" style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.items.map((it) => esc(it.name)).join(', ')}</div></div>
          <b class="num">${money(o.payable ?? o.total)}</b></div>
        ${idx >= 0 && idx < 7 ? `<div class="prog">${FLOW_ORDER.slice(0, 7).map((_, k) => `<i class="${k < idx ? 'd' : k === idx ? 'c' : ''}"></i>`).join('')}</div>` : ''}
        ${o.status === 'draft' ? `<div class="notice">${icon('info', 18)}<span>Buyurtma tasdiqlanmagan. Davom etish uchun bosing.</span></div>` : ''}
      </a>`;
    }).join('') : empty('📦', tab === 'active' ? 'Faol buyurtmalar yo\'q' : 'Buyurtmalar topilmadi', 'Birinchi buyurtmangizni bering — yangi mevalar yo\'lda!', '<a class="btn primary" href="#/fruits">Mevalarni ko\'rish</a>');
  };
  v.innerHTML = `<div class="container"><div class="page-head"><h1>Buyurtmalar</h1></div>
    <div class="seg" id="seg"><button data-t="active" class="on">Faol</button><button data-t="done">Yakunlangan</button><button data-t="all">Barchasi</button></div>
    <div id="olist" class="list-stack">${Array.from({ length: 3 }, () => '<div class="sk" style="height:150px;border-radius:22px"></div>').join('')}</div></div>`;
  $('#seg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; $$('#seg button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
  const load = async () => { try { list = await api.get('/api/orders'); } catch (e) { $('#olist').innerHTML = empty('⚠️', 'Yuklab bo\'lmadi', e.message); return; } draw(); };
  await load();
  const timer = setInterval(() => { if (document.hidden) return; api.get('/api/orders').then((l) => { if (JSON.stringify(l.map((o) => o.status)) !== JSON.stringify(list.map((o) => o.status))) { list = l; draw(); } }).catch(() => {}); }, 12000);
  return () => clearInterval(timer);
}

/* ---------- order detail + tracking ---------- */
export async function orderDetail({ id }) {
  if (!requireLogin()) return;
  const v = view();
  v.innerHTML = '<div class="container"><div class="sk" style="height:60px;margin-top:24px;width:50%"></div><div class="two-col" style="margin-top:20px"><div class="sk" style="height:520px;border-radius:24px"></div><div class="sk" style="height:420px;border-radius:24px"></div></div></div>';
  let o;
  const fetchOrder = async () => { o = await api.get(`/api/orders/${id}`); };
  try { await fetchOrder(); } catch (e) { v.innerHTML = `<div class="container">${empty('🔎', 'Buyurtma topilmadi', e.message, '<a class="btn primary" href="#/orders">Buyurtmalarga qaytish</a>')}</div>`; return; }
  const st = S.boot.settings;

  const paint = () => {
    const idx = stepIdx(o.status);
    const hist = Object.fromEntries(o.history.map((h) => [h.status, h]));
    const labels = Object.fromEntries(S.boot.flow.map((f) => [f.key, f.label]));
    const terminalBad = ['rejected', 'cancelled'].includes(o.status);
    const retFee = st.return_policy === 'free' ? 0 : st.return_policy === 'fixed' ? st.return_fixed_fee : o.delivery_fee;
    const steps = (['return_requested', 'returned'].includes(o.status) ? FLOW_ORDER.slice(0, 7) : FLOW_ORDER);
    v.innerHTML = `<div class="container">
      <nav class="crumbs"><a href="#/orders">Buyurtmalar</a>${icon('chevR', 14)}<span>${esc(o.code)}</span></nav>
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px"><div><h1 class="serif" style="font-size:34px">${esc(o.code)}</h1><div class="muted">${fmtDateTime(o.created_at)} · ${esc(o.seller.store_name)}</div></div><span class="pill ${statusTone(o.status)} ${isLive(o.status) ? 'live' : ''}" style="height:34px;padding:0 16px;font-size:14px">${esc(o.status_label)}</span></div>
      <div class="two-col">
        <div class="stack">
          ${o.status === 'rejected' ? `<div class="notice bad">${icon('alert', 20)}<div><b>Buyurtma rad etildi</b><div>${o.reject_reason ? 'Sabab: ' + esc(o.reject_reason) : 'Sotuvchi sabab ko\'rsatmadi.'}</div></div></div>` : ''}
          ${o.status === 'cancelled' ? `<div class="notice bad">${icon('x', 20)}<div><b>Buyurtma bekor qilindi</b></div></div>` : ''}
          ${o.status === 'return_requested' ? `<div class="notice">${icon('undo', 20)}<div><b>Qaytarish so'rovi ko'rib chiqilmoqda</b><div>Sabab: ${esc(o.return?.reason || '')}. Tasdiqlansa, meva narxi hisoblanmaydi.</div></div></div>` : ''}
          ${o.status === 'returned' ? `<div class="notice ok">${icon('check', 20)}<div><b>Qaytarish tasdiqlandi</b><div>Meva narxi hisoblanmaydi. To'lanadigan summa: ${money(o.payable)} (faqat yetkazib berish haqi).</div></div></div>` : ''}
          ${o.status === 'delivered' ? `<div class="delivered-actions"><div><b style="font-size:18px">Mevalarni ko'zdan kechiring</b><p class="muted" style="font-size:14px">${retFee ? `Hammasi yoqdimi? Yoqmasa, faqat yetkazib berish haqi (${money(retFee)}) to'lab qaytarishingiz mumkin.` : "Hammasi yoqdimi? Yoqmasa, hech narsa to'lamasdan qaytarishingiz mumkin."}</p></div>
            <div class="two"><button class="btn primary lg" id="accept">${icon('check', 20)} Hammasi yaxshi</button><button class="btn danger-soft lg" id="refuse">${icon('undo', 20)} Meva yoqmadi</button></div></div>` : ''}
          ${o.status === 'completed' && !o.reviewed ? `<div class="notice ok" style="align-items:center;justify-content:space-between">${icon('star', 20)}<div class="grow"><b>Buyurtma yoqdimi?</b><div>Sharhingiz boshqalarga yordam beradi.</div></div><button class="btn primary sm" id="review">Sharh qoldirish</button></div>` : ''}
          <section class="panel"><h3>${icon('truck', 20)} Buyurtma holati</h3>
            ${['draft'].includes(o.status) ? `<p class="muted">Buyurtma hali tasdiqlanmagan.</p><a class="btn primary" href="#/confirm/${o.group_code}" style="margin-top:12px">Tasdiqlashga o'tish</a>` : `
            <div class="timeline">${steps.map((s, i) => {
              const retFlow = ['return_requested', 'returned'].includes(o.status);
              const done = terminalBad ? !!hist[s] : i < idx || retFlow || o.status === 'completed';
              const now = !terminalBad && i === idx && !retFlow && o.status !== 'completed';
              const t = hist[s];
              return `<div class="tl ${done ? 'done' : ''} ${now ? 'now' : ''}"><span class="tdot">${done ? icon('check', 16) : i + 1}</span><div><b>${esc(labels[s])}</b>${t ? `<small>${fmtTime(t.created_at)}</small>` : ''}</div></div>`;
            }).join('')}${terminalBad ? `<div class="tl done now"><span class="tdot" style="background:var(--danger);border-color:var(--danger)">${icon('x', 16)}</span><div><b>${esc(o.status_label)}</b><small>${fmtTime(o.updated_at)}</small></div></div>` : ''}</div>`}
          </section>
        </div>
        <aside class="stack sticky">
          ${isLive(o.status) ? `<div class="eta">${icon('clock', 28)}<div><b>Yetkazib berish: ${o.eta_min}–${o.eta_max} daqiqa</b><small>${o.status === 'on_way' ? 'Kuryer yo\'lda' : 'Buyurtma tayyorlanmoqda'}</small></div></div>` : ''}
          ${o.courier && ['handed', 'on_way', 'delivered', 'completed'].includes(o.status) ? `<section class="panel"><h3>${icon('truck', 20)} Kuryer</h3><div class="row"><span class="ava">${esc(o.courier.name[0])}</span><div class="grow"><b>${esc(o.courier.name)}</b><div class="muted" style="font-size:13px">${esc(o.courier.vehicle || '')} · <span class="rating">${starFill(13)} ${o.courier.rating}</span></div></div><a class="btn soft sm icon" href="tel:${esc(o.courier.phone)}" aria-label="Qo'ng'iroq">${icon('phone', 16)}</a></div></section>` : ''}
          <section class="panel"><h3>Buyurtma tarkibi</h3><div class="mini-items">${o.items.map((i) => `<div class="mini-item">${artBox(i)}<div class="grow"><b>${esc(i.name)}</b><div class="muted num" style="font-size:12.5px">${kg(i.qty_kg)} × ${num(i.price_per_kg)}</div></div><b class="num">${money(i.line_total)}</b></div>`).join('')}</div>
            <div style="margin-top:14px"><div class="sum-row"><span>Mahsulotlar</span><span class="num">${money(o.items_total)}</span></div>
            ${o.discount_amount ? `<div class="sum-row"><span>Chegirma (${esc(o.promo_code)})</span><span class="num" style="color:var(--coral)">−${money(o.discount_amount)}</span></div>` : ''}
            <div class="sum-row"><span>Yetkazib berish</span>${o.delivery_fee ? `<span class="num">${money(o.delivery_fee)}</span>` : '<b class="free">Bepul</b>'}</div>
            <div class="sum-row total"><span>${o.status === 'returned' ? 'To\'lanadi' : 'Jami'}</span><span class="num">${money(o.payable ?? o.total)}</span></div></div></section>
          <section class="panel"><h3>Yetkazib berish</h3><div class="kv">
            <div>${icon('pin', 18)}<span>${esc(o.address)}${o.apartment ? ', ' + esc(o.apartment) : ''}<small>${esc(o.customer_name)} · ${esc(o.phone)}</small></span></div>
            ${o.instructions ? `<div>${icon('info', 18)}<span>${esc(o.instructions)}</span></div>` : ''}
            <div>${icon('dollar', 18)}<span>Yetkazib berilganda to'lash<small>Oldindan to'lov talab qilinmaydi</small></span></div></div></section>
          <div class="row" style="gap:10px;flex-wrap:wrap">
            ${o.status !== 'draft' ? `<button class="btn outline grow" id="chat">${icon('chat', 18)} Sotuvchi bilan aloqa</button>` : ''}
            ${['sent', 'reviewing'].includes(o.status) ? `<button class="btn danger-soft grow" id="cancel">Bekor qilish</button>` : ''}
            ${o.status === 'draft' ? `<button class="btn danger-soft grow" id="cancel">Bekor qilish</button>` : ''}
          </div>
        </aside>
      </div></div>`;
  };
  paint();
  v.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const act = (fn) => busy(b, async () => { await fn(); await fetchOrder(); paint(); refreshCounters(); });
    if (b.id === 'chat') busy(b, async () => nav(`/chat/${(await api.post(`/api/orders/${o.id}/chat`)).id}`));
    else if (b.id === 'accept') act(async () => { await api.post(`/api/orders/${o.id}/complete`); toast('Rahmat! Buyurtma yakunlandi', 'success'); });
    else if (b.id === 'cancel') {
      if (await confirmDialog({ title: 'Buyurtmani bekor qilasizmi?', text: 'Bu amalni qaytarib bo\'lmaydi.', confirmLabel: 'Ha, bekor qilish', cancelLabel: 'Yo\'q', danger: true })) act(async () => { await api.post(`/api/orders/${o.id}/cancel`); toast('Buyurtma bekor qilindi', 'info'); });
    } else if (b.id === 'refuse') openReturn(o, st, async () => { await fetchOrder(); paint(); });
    else if (b.id === 'review') openReview(o, async () => { await fetchOrder(); paint(); });
  };
  const timer = setInterval(async () => {
    if (document.hidden || document.querySelector('.modal-back')) return;
    const prev = o.status;
    try { await fetchOrder(); } catch { return; }
    if (o.status !== prev) { paint(); toast(`Holat: ${o.status_label}`, 'info'); refreshCounters(); }
  }, 8000);
  return () => clearInterval(timer);
}

const REASONS = ['Meva yetarlicha yangi emas', 'Mevalar ezilgan yoki buzilgan', "Hajmi va'da qilinganidan farq qiladi", "Mevalar pishmagan yoki o'ta pishgan", 'Boshqa sabab'];
function openReturn(o, st, done) {
  const fee = st.return_policy === 'free' ? 0 : st.return_policy === 'fixed' ? st.return_fixed_fee : o.delivery_fee;
  let photos = [];
  const { el, close } = modal(`<div class="modal-head"><h3>Mevani qaytarish</h3><button class="ibtn" data-close aria-label="Yopish">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="notice ok">${icon('shield', 20)}<div>${fee ? `Meva narxi (${money(o.items_total)}) hisoblanmaydi. Siz faqat ${money(fee)} yetkazib berish haqini to'laysiz.` : `Meva narxi (${money(o.items_total)}) hisoblanmaydi. Siz hech narsa to'lamaysiz.`}</div></div>
      <div class="field"><label class="label">Sabab</label><div class="stack" style="gap:8px">${REASONS.map((r, i) => `<label class="check" style="padding:11px 14px;border:1.5px solid var(--line-strong);border-radius:12px"><input type="radio" name="reason" value="${esc(r)}" ${i === 0 ? 'checked' : ''}> ${esc(r)}</label>`).join('')}</div></div>
      <div class="field"><label class="label" for="rnote">Izoh (ixtiyoriy)</label><textarea class="textarea" id="rnote" maxlength="500" placeholder="Nima yoqmadi?"></textarea></div>
      <div class="field"><label class="label">Rasm (ixtiyoriy)</label><label class="photo-drop">${icon('camera', 22)}<span>Meva rasmini yuklang (3 tagacha)</span><input type="file" id="rfile" accept="image/png,image/jpeg,image/webp" multiple hidden></label><div class="thumbs" id="rthumbs"></div></div>
    </div><div class="modal-foot"><button class="btn ghost" data-close>Bekor qilish</button><button class="btn danger" id="rsend">Qaytarish so'rovini yuborish</button></div>`);
  $('#rfile', el).onchange = async (e) => {
    for (const f of [...e.target.files].slice(0, 3 - photos.length)) {
      try { photos.push(await uploadImage(api, f)); } catch (err) { toast(err.message, 'error'); }
    }
    $('#rthumbs', el).innerHTML = photos.map((u) => `<img src="${esc(u)}" alt="">`).join('');
  };
  $('#rsend', el).onclick = (e) => busy(e.currentTarget, async () => {
    await api.post(`/api/orders/${o.id}/return`, { reason: el.querySelector('input[name=reason]:checked').value, note: $('#rnote', el).value, photos });
    close();
    toast("Qaytarish so'rovi yuborildi", 'success');
    await done();
  });
}

function openReview(o, done) {
  const val = { rating: 5, quality_rating: 5, seller_rating: 5, delivery_rating: 5 };
  let photo = null;
  const row = (k, label) => `<div class="rate-row"><span>${label}</span><span class="star-input" data-k="${k}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" class="${n <= 5 ? 'on' : ''}" aria-label="${n} yulduz">${starFill(28)}</button>`).join('')}</span></div>`;
  const { el, close } = modal(`<div class="modal-head"><h3>Sharh qoldirish</h3><button class="ibtn" data-close aria-label="Yopish">${icon('x')}</button></div>
    <div class="modal-body">${row('rating', 'Umumiy baho')}${row('quality_rating', 'Meva sifati')}${row('seller_rating', 'Sotuvchi')}${row('delivery_rating', 'Yetkazib berish')}
      <div class="field"><label class="label" for="rtext">Fikringiz</label><textarea class="textarea" id="rtext" maxlength="800" placeholder="Mevalar qanday edi?"></textarea></div>
      <label class="photo-drop"><span id="pph">${icon('camera', 22)}</span><span>Rasm qo'shish (ixtiyoriy)</span><input type="file" id="rph" accept="image/png,image/jpeg,image/webp" hidden></label></div>
    <div class="modal-foot"><button class="btn ghost" data-close>Keyinroq</button><button class="btn primary" id="rsub">Yuborish</button></div>`);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.star-input button');
    if (!b) return;
    const g = b.parentElement;
    val[g.dataset.k] = Number(b.dataset.n);
    $$('button', g).forEach((x) => x.classList.toggle('on', Number(x.dataset.n) <= val[g.dataset.k]));
  });
  $('#rph', el).onchange = async (e) => { try { photo = await uploadImage(api, e.target.files[0]); $('#pph', el).innerHTML = `<img src="${esc(photo)}" alt="">`; } catch (err) { toast(err.message, 'error'); } };
  $('#rsub', el).onclick = (e) => busy(e.currentTarget, async () => {
    await api.post(`/api/orders/${o.id}/review`, { ...val, body: $('#rtext', el).value, photo_url: photo });
    close();
    toast('Sharhingiz uchun rahmat!', 'success');
    await done();
  });
}
void emit;
