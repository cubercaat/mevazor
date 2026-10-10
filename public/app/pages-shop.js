import { $, $$, esc, icon, emojiImg, heartFill, starFill, art, num, kg, money, toast, modal, debounce, fmtDate, busy } from '/shared/core.js';
import { api, S, cart, nav, requireLogin, viewed, authed } from './state.js';
import { productCard, cardSkeletons, bindCards, empty, stars, tint, eta } from './components.js';

const view = () => document.getElementById('view');

/* =============================== HOME =============================== */
function rail(title, sub, href, list) {
  if (!list.length) return '';
  return `<section class="section"><div class="sec-head"><div><h2>${title}</h2><p>${sub}</p></div><a class="link" href="${href}">Barchasi ${icon('chevR', 16)}</a></div>
    <div class="rail">${list.map(productCard).join('')}</div></section>`;
}

export async function home() {
  const v = view();
  const b = S.boot;
  const st = b.settings;
  v.innerHTML = `
  <div class="container">
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow"><i></i>Bugun uzilgan · ${st.eta_min}–${st.eta_max} daqiqada yetkazamiz</span>
        <h1>Bog'dan <em>to'g'ridan-to'g'ri</em> eshigingizgacha</h1>
        <p>Faqat yangi mevalar. Eshigingizda ko'zdan kechiring, yoqmasa qaytaring — mevaning narxini to'lamaysiz.</p>
        <div class="hero-cta"><a class="btn light lg" href="#/fruits">Mevalarni ko'rish ${icon('arrow', 18)}</a><a class="btn line lg" href="#/fruits?discount=1">Chegirmalar</a></div>
        <div class="hero-stats"><div><b>${S.boot.categories.reduce((a, c) => a + c.count, 0)}+</b><span>xil meva</span></div><div><b>4.8</b><span>o'rtacha baho</span></div><div><b>0 UZS</b><span>oldindan to'lov</span></div></div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="orb big"><img src="/photos/apelsin.jpg" alt=""></div><div class="orb m1"><img src="/photos/kivi.jpg" alt=""></div><div class="orb m2"><img src="/photos/husayni-uzum.jpg" alt=""></div><div class="orb m3"><img src="/photos/malina.jpg" alt=""></div><div class="orb m4"><img src="/photos/limon.jpg" alt=""></div>
      </div>
    </section>
    <div class="quick">
      <a href="#/orders"><span class="qi">${icon('bag', 22)}</span><div><b>Buyurtmalar</b><small>Kuzatish va tarix</small></div></a>
      <a href="#/chat"><span class="qi c">${icon('chat', 22)}</span><div><b>Sotuvchi bilan aloqa</b><small>Savollarga javob oling</small></div></a>
      <a href="#/profile/favorites"><span class="qi g">${icon('heart', 22)}</span><div><b>Sevimli mevalar</b><small>Tez qayta buyurtma</small></div></a>
      <a href="#/fruits?discount=1"><span class="qi">${icon('tag', 22)}</span><div><b>Chegirmalar</b><small>Bugungi takliflar</small></div></a>
    </div>
    <div class="trust">
      <div>${icon('truck', 26)}<span><b>${st.eta_min}–${st.eta_max} daqiqa</b><small>Tez yetkazib berish</small></span></div>
      <div>${icon('shield', 26)}<span><b>Qaytarish kafolati</b><small>Yoqmasa, qaytaring</small></span></div>
      <div>${icon('dollar', 26)}<span><b>Yetkazilganda to'lov</b><small>Karta shart emas</small></span></div>
      <div>${icon('leaf', 26)}<span><b>Faqat yangi mevalar</b><small>Bugungi hosil</small></span></div>
    </div>
    <section class="section" style="margin-top:30px"><div class="cats" id="cats">${b.categories.map((c) => `<a class="cat" href="#/fruits?category=${c.slug}"><span class="e">${emojiImg(c.emoji)}</span>${esc(c.name)}</a>`).join('')}</div></section>
    ${b.promotions.length ? `<section class="section" style="margin-top:20px"><div class="promos">${b.promotions.map((p) => `<div class="promo"><div><h3>${esc(p.title)}</h3><p>${esc(p.subtitle || '')}</p>${p.code ? `<code data-code="${esc(p.code)}" title="Nusxalash">${esc(p.code)}</code>` : ''}</div><span class="pa">${emojiImg(p.art || '🍓')}</span></div>`).join('')}</div></section>` : ''}
    <div id="rails">${['Bugungi mashhur mevalar', 'Eng ko\'p sotilganlar', 'Mavsumiy mevalar'].map((t) => `<section class="section"><div class="sec-head"><div><h2>${t}</h2></div></div><div class="rail">${cardSkeletons(5)}</div></section>`).join('')}</div>
    <section class="section"><div class="panel" style="display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:center;padding:34px">
      <div style="display:grid;gap:12px"><span class="pill warn" style="justify-self:start">Yetkazib berish</span><h2 class="serif" style="font-size:32px;line-height:1.1">Tez, toza va ishonchli</h2>
        <p class="muted">Buyurtmangiz sotuvchi tomonidan saralanib, kuryer orqali ${st.eta_min}–${st.eta_max} daqiqada yetkaziladi. ${money(st.free_from)} dan yuqori xaridlarda yetkazib berish bepul, qolgan holatda ${money(st.base_fee)}.</p>
        <div class="row" style="gap:12px;flex-wrap:wrap"><a class="btn primary" href="#/fruits">Buyurtma berish</a><a class="btn outline" href="tel:${esc(st.support_phone || '')}">${icon('phone', 18)} ${esc(st.support_phone || 'Yordam')}</a></div></div>
      <div style="display:grid;gap:12px">${[['1', 'Mevani tanlang', 'Savatga qo\'shing'], ['2', 'Savollaringiz bo\'lsa — so\'rang', 'Sotuvchi bilan chat'], ['3', 'Ko\'zdan kechiring, keyin to\'lang', 'Yoqmasa qaytaring']].map(([n, t, s]) => `<div class="row" style="padding:14px 16px;border-radius:16px;background:var(--bg)"><span class="ava">${n}</span><div><b>${t}</b><div class="muted" style="font-size:13px">${s}</div></div></div>`).join('')}</div>
    </div></section>
  </div>`;
  $('#cats')?.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; } }, { passive: true });
  v.onclick = (e) => {
    const c = e.target.closest('[data-code]');
    if (c) { navigator.clipboard?.writeText(c.dataset.code); toast(`${c.dataset.code} nusxalandi`, 'success'); }
  };

  const q = (p) => api.get(`/api/products?limit=10&${p}`);
  const [popular, best, seasonal, disc, fresh, rec] = await Promise.all([q('popular=1'), q('sort=popular'), q('seasonal=1'), q('discount=1&sort=popular'), q('new=1&sort=newest'), q('sort=rating')]);
  const all = new Map();
  [popular, best, seasonal, disc, fresh, rec].flat().forEach((p) => all.set(p.id, p));
  $('#rails').innerHTML =
    rail("Bugungi mashhur mevalar", "Mijozlarimiz bugun eng ko'p tanlagan", '#/fruits?popular=1', popular) +
    rail("Eng ko'p sotilganlar", 'Sinovdan o\'tgan sevimlilar', '#/fruits?sort=popular', best) +
    rail('Mavsumiy mevalar', 'Hozir eng mazali payti', '#/fruits?seasonal=1', seasonal) +
    rail('Chegirmadagi mevalar', 'Cheklangan muddat', '#/fruits?discount=1', disc) +
    rail('Yangi kelganlar', 'Yaqinda qo\'shilgan', '#/fruits?new=1&sort=newest', fresh) +
    rail('Siz uchun tavsiya', 'Yuqori baholanganlar', '#/fruits?sort=rating', rec);
  bindCards($('#rails'), (id) => all.get(id));
}

/* =============================== CATALOG =============================== */
const SORT_LABELS = [['popular', 'Ommabop'], ['cheapest', 'Arzonroq'], ['expensive', 'Qimmatroq'], ['rating', 'Yuqori baholangan'], ['newest', 'Yangi'], ['fastest', 'Tez yetkazish']];
const FILTER_KEYS = ['min_price', 'max_price', 'size', 'quality', 'origin', 'min_rating', 'in_stock', 'max_delivery', 'discount', 'popular', 'new', 'seasonal'];

export async function fruits(_, query) {
  const v = view();
  const f = { ...query };
  const b = S.boot;
  const PAGE = 24;
  let items = [];
  let total = 0;
  const go = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, val]) => { if (val !== '' && val != null) p.set(k, val); });
    history.replaceState(null, '', `#/fruits${p.toString() ? '?' + p : ''}`);
  };
  const activeFilterCount = () => FILTER_KEYS.filter((k) => f[k]).length;

  v.innerHTML = `<div class="container">
    <div class="page-head"><h1>Mevalar</h1><p>Faqat yangi va sifatli mevalar</p></div>
    <div class="toolbar">
      <div class="search">${icon('search', 20)}<input id="q" class="input" type="search" placeholder="Meva, sotuvchi yoki kategoriya…" value="${esc(f.q || '')}" autocomplete="off"></div>
      <button class="btn outline fbtn" id="fbtn" style="border-radius:99px">${icon('sliders', 18)} Filtrlar<span class="fcount hide" id="fcount"></span></button>
      <select id="sort" class="select" aria-label="Saralash">${SORT_LABELS.map(([k, l]) => `<option value="${k}" ${(f.sort || 'popular') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="cats" id="cats" style="padding-top:0"><button class="cat ${!f.category ? 'on' : ''}" data-cat=""><span class="e">${icon('grid', 16)}</span>Barchasi</button>${b.categories.map((c) => `<button class="cat ${f.category === c.slug ? 'on' : ''}" data-cat="${c.slug}"><span class="e">${emojiImg(c.emoji)}</span>${esc(c.name)}</button>`).join('')}</div>
    <div id="af" class="active-filters"></div>
    <div id="meta" class="res-meta"></div>
    <div id="grid" class="grid">${cardSkeletons(8)}</div>
    <div id="more" style="text-align:center;margin-top:26px"></div>
  </div>`;

  const drawActive = () => {
    const labels = {
      min_price: `≥ ${num(f.min_price || 0)} UZS`, max_price: `≤ ${num(f.max_price || 0)} UZS`, size: `Hajmi: ${f.size}`, quality: `Sifat: ${f.quality}`, origin: `Mamlakat: ${f.origin}`,
      min_rating: `${f.min_rating}★ va yuqori`, in_stock: 'Mavjud', max_delivery: `≤ ${f.max_delivery} daqiqa`, discount: 'Chegirma', popular: 'Mashhur', new: 'Yangi', seasonal: 'Mavsumiy',
    };
    const chips = FILTER_KEYS.filter((k) => f[k]).map((k) => `<span class="af">${esc(labels[k])}<button data-rm="${k}" aria-label="Olib tashlash">${icon('x', 12)}</button></span>`);
    if (f.q) chips.unshift(`<span class="af">“${esc(f.q)}”<button data-rm="q" aria-label="Olib tashlash">${icon('x', 12)}</button></span>`);
    $('#af').innerHTML = chips.join('');
    const n = activeFilterCount();
    const fc = $('#fcount');
    fc.textContent = n;
    fc.classList.toggle('hide', !n);
  };

  const load = async (append = false) => {
    if (!append) { $('#grid').innerHTML = cardSkeletons(8); items = []; }
    const params = new URLSearchParams({ limit: PAGE, offset: items.length });
    ['q', 'category', 'sort', 'seller', ...FILTER_KEYS].forEach((k) => f[k] && params.set(k, f[k]));
    try {
      const list = await api.get(`/api/products?${params}`);
      items = append ? items.concat(list) : list;
      total = list.length === PAGE ? items.length + 1 : items.length;
    } catch (e) {
      $('#grid').innerHTML = empty('⚠️', 'Yuklab bo\'lmadi', e.message, '<button class="btn primary" id="retry">Qayta urinish</button>');
      $('#retry').onclick = () => load();
      return;
    }
    drawActive();
    $('#meta').textContent = items.length ? `${items.length}${list_more() ? '+' : ''} ta meva topildi` : '';
    $('#grid').innerHTML = items.length ? items.map(productCard).join('') : '';
    if (!items.length) {
      $('#grid').outerHTML = `<div id="grid">${empty('🍃', 'Hech narsa topilmadi', "Qidiruv yoki filtrlarni o'zgartirib ko'ring.", '<button class="btn soft" id="clear">Filtrlarni tozalash</button>')}</div>`;
      $('#clear').onclick = () => { Object.keys(f).forEach((k) => delete f[k]); $('#q').value = ''; sync(); };
    }
    $('#more').innerHTML = list_more() ? '<button class="btn outline" id="moreBtn">Ko\'proq ko\'rsatish</button>' : '';
    $('#moreBtn')?.addEventListener('click', (e) => busy(e.currentTarget, () => load(true)));
  };
  const list_more = () => items.length > 0 && items.length % PAGE === 0;
  const sync = () => { go(f); document.querySelectorAll('[data-cat]').forEach((c) => c.classList.toggle('on', (c.dataset.cat || undefined) === f.category)); $('#grid') || null; load(); };
  const gridEl = () => document.getElementById('grid');

  $('#q').addEventListener('input', debounce((e) => { f.q = e.target.value.trim() || undefined; sync(); }, 300));
  $('#sort').addEventListener('change', (e) => { f.sort = e.target.value; sync(); });
  v.onclick = (e) => {
    const c = e.target.closest('[data-cat]');
    if (c) { f.category = c.dataset.cat || undefined; sync(); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { delete f[rm.dataset.rm]; if (rm.dataset.rm === 'q') $('#q').value = ''; sync(); }
  };
  bindCards(v, (id) => items.find((p) => p.id === id));
  $('#fbtn').onclick = () => openFilters(f, b.facets, (next) => { FILTER_KEYS.forEach((k) => delete f[k]); Object.assign(f, next); sync(); });
  void gridEl;
  await load();
}

function openFilters(f, facets, apply) {
  const cur = { ...f };
  const optGroup = (key, label, values) => `<div class="fgroup"><b>${label}</b><div class="opts">${values.map((val) => `<button type="button" class="opt ${String(cur[key]) === String(val.v ?? val) ? 'on' : ''}" data-k="${key}" data-v="${esc(val.v ?? val)}">${esc(val.l ?? val)}</button>`).join('')}</div></div>`;
  const { el, close } = modal(`
    <div class="modal-head"><h3>Filtrlar</h3><button class="ibtn" data-close aria-label="Yopish">${icon('x')}</button></div>
    <div class="modal-body filters">
      <div class="fgroup"><b>Narx (UZS / kg)</b><div class="range"><input class="input" id="pmin" type="number" min="0" inputmode="numeric" placeholder="${num(facets.price.min)}" value="${cur.min_price || ''}"><span class="muted">—</span><input class="input" id="pmax" type="number" min="0" inputmode="numeric" placeholder="${num(facets.price.max)}" value="${cur.max_price || ''}"></div></div>
      ${optGroup('size', 'Hajmi', facets.sizes)}
      ${optGroup('quality', 'Sifat', facets.qualities)}
      ${optGroup('origin', 'Mamlakat', facets.origins)}
      ${optGroup('min_rating', 'Reyting', [{ v: 4.5, l: '4.5★ +' }, { v: 4, l: '4★ +' }, { v: 3, l: '3★ +' }])}
      ${optGroup('max_delivery', 'Yetkazib berish', [{ v: 45, l: '≤ 45 daqiqa' }, { v: 60, l: '≤ 60 daqiqa' }, { v: 90, l: '≤ 90 daqiqa' }])}
      <div class="fgroup"><b>Qo'shimcha</b><div class="opts">
        <button type="button" class="opt ${cur.in_stock ? 'on' : ''}" data-k="in_stock" data-v="1">Mavjud</button>
        <button type="button" class="opt ${cur.discount ? 'on' : ''}" data-k="discount" data-v="1">Chegirmada</button>
        <button type="button" class="opt ${cur.seasonal ? 'on' : ''}" data-k="seasonal" data-v="1">Mavsumiy</button>
        <button type="button" class="opt ${cur.new ? 'on' : ''}" data-k="new" data-v="1">Yangi</button>
      </div></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" id="reset">Tozalash</button><button class="btn primary" id="apply">Natijalarni ko'rsatish</button></div>`, { cls: 'modal-md' });
  el.addEventListener('click', (e) => {
    const o = e.target.closest('.opt');
    if (!o) return;
    const { k, v: val } = o.dataset;
    const on = String(cur[k]) === val;
    if (on) delete cur[k]; else cur[k] = val;
    $$(`.opt[data-k="${k}"]`, el).forEach((x) => x.classList.toggle('on', String(cur[k]) === x.dataset.v));
  });
  $('#reset', el).onclick = () => { FILTER_KEYS.forEach((k) => delete cur[k]); $$('.opt', el).forEach((x) => x.classList.remove('on')); $('#pmin', el).value = ''; $('#pmax', el).value = ''; };
  $('#apply', el).onclick = () => {
    const out = {};
    FILTER_KEYS.forEach((k) => { if (cur[k]) out[k] = cur[k]; });
    const a = $('#pmin', el).value;
    const z = $('#pmax', el).value;
    if (a) out.min_price = a; else delete out.min_price;
    if (z) out.max_price = z; else delete out.max_price;
    apply(out);
    close();
  };
}

/* =============================== PRODUCT =============================== */
const PRESETS = [0.5, 1, 1.5, 2, 3, 5, 10];
export async function product({ id }) {
  const v = view();
  v.innerHTML = `<div class="container"><div class="crumbs sk" style="height:20px;width:260px;margin-top:20px"></div><div class="pd"><div class="sk" style="aspect-ratio:1/.9;border-radius:30px"></div><div style="display:grid;gap:14px"><div class="sk" style="height:46px;width:70%"></div><div class="sk" style="height:24px;width:40%"></div><div class="sk" style="height:60px"></div><div class="sk" style="height:140px"></div><div class="sk" style="height:200px;border-radius:24px"></div></div></div></div>`;
  let p;
  try { p = await api.get(`/api/products/${id}`); } catch (e) {
    v.innerHTML = `<div class="container">${empty('🔎', 'Meva topilmadi', e.message, '<a class="btn primary" href="#/fruits">Mevalarga qaytish</a>')}</div>`;
    return;
  }
  viewed.push(p.id);
  document.title = `${p.name} — Mevazor`;
  const max = Math.min(p.max_order, p.stock_kg);
  const sold = p.stock_kg < p.min_order;
  let qty = Math.min(max, Math.max(p.min_order, 1));
  const slides = p.images.length
    ? p.images.map((u) => `<div class="slide"><img src="${esc(u)}" alt="${esc(p.name)}"></div>`)
    : [`<div class="slide">${art(p.art)}</div>`, `<div class="slide cluster">${[0, 1, 2, 3, 4, 5].map(() => art(p.art)).join('')}</div>`, `<div class="slide zoom">${art(p.art)}</div>`];
  const stockPct = Math.min(100, Math.round((p.stock_kg / Math.max(p.stock_kg, 200)) * 100));
  const low = p.stock_kg <= 30;
  const old = p.discount_percent ? p.price_per_kg : 0;

  v.innerHTML = `<div class="container">
    <nav class="crumbs" aria-label="Yo'l"><a href="#/">Bosh sahifa</a>${icon('chevR', 14)}<a href="#/fruits">Mevalar</a>${icon('chevR', 14)}<a href="#/fruits?category=${esc(p.category_slug)}">${esc(p.category_name)}</a>${icon('chevR', 14)}<span>${esc(p.name)}</span></nav>
    <div class="pd">
      <div class="gal"><div class="gal-main" style="--tint:${tint(p.tint)}" id="gmain">${slides.join('')}
          <div class="badges" style="top:18px;left:18px">${p.discount_percent ? `<span class="tag sale">−${p.discount_percent}%</span>` : ''}${p.is_new ? '<span class="tag new">Yangi</span>' : ''}${p.is_seasonal ? '<span class="tag season">Mavsumiy</span>' : ''}</div>
          <button class="fav ${p.is_fav ? 'on' : ''}" data-fav="${p.id}" style="top:16px;right:16px;width:44px;height:44px" aria-label="Sevimli">${p.is_fav ? heartFill(22) : icon('heart', 22)}</button>
        </div>
        <div class="gal-thumbs" id="gthumbs">${slides.map((_, i) => `<button class="gthumb ${i === 0 ? 'on' : ''}" data-i="${i}" style="--tint:${tint(p.tint)}" aria-label="Rasm ${i + 1}">${p.images[i] ? `<img src="${esc(p.images[i])}" alt="">` : art(p.art)}</button>`).join('')}</div>
      </div>
      <div class="pd-info">
        <div><div class="pd-top"><span class="rating">${stars(p.rating_avg)} <b>${p.rating_count ? p.rating_avg.toFixed(1) : 'Yangi'}</b> <small>(${p.rating_count} sharh)</small></span><span>·</span><span>${esc(p.category_name)}</span></div>
          <h1 style="margin-top:8px">${esc(p.name)}</h1></div>
        <div class="pd-price"><b class="num">${num(p.price_final)}</b><small>UZS / kg</small>${old ? `<s class="num">${num(old)}</s><span class="save">−${p.discount_percent}%</span>` : ''}</div>
        <div class="specs">
          <div class="spec"><small>Hajmi</small><b>${esc(p.size)}</b></div><div class="spec"><small>Sifat</small><b>${esc(p.quality)}</b></div>
          <div class="spec"><small>Mamlakat</small><b>${esc(p.origin)}</b></div><div class="spec"><small>Yetkazib berish</small><b>${eta(p)}</b></div>
          ${p.harvest_info ? `<div class="spec" style="grid-column:1/-1"><small>Hosil haqida</small><b style="font-weight:600">${esc(p.harvest_info)}</b></div>` : ''}
        </div>
        <div class="stock ${low ? 'low' : ''}"><div class="row" style="justify-content:space-between;font-size:14px"><span><b>${sold ? 'Tugagan' : `${kg(p.stock_kg)} mavjud`}</b></span><span class="muted">${low && !sold ? 'Oz qoldi!' : `Minimal: ${kg(p.min_order)} · Maksimal: ${kg(max)}`}</span></div><div class="stock-bar"><i style="width:${stockPct}%"></i></div></div>
        <div class="buybox">
          <div class="label">Miqdorni tanlang</div>
          <div class="qchips" id="qchips">${PRESETS.map((x) => `<button class="qchip" data-q="${x}" ${x < p.min_order || x > max ? 'disabled' : ''}>${x} kg</button>`).join('')}</div>
          <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div class="stepper"><button id="qminus" aria-label="Kamaytirish">${icon('minus', 18)}</button><input id="qin" inputmode="decimal" aria-label="Kilogramm" value="${qty}"><span class="unit">kg</span><button id="qplus" aria-label="Ko'paytirish">${icon('plus', 18)}</button></div>
            <div class="buy-total"><span class="muted" style="margin-right:12px">Jami</span><b class="num" id="qtotal"></b></div>
          </div>
          <div class="buy-actions"><button class="btn outline lg" id="addc" ${sold ? 'disabled' : ''}>${icon('cart', 20)} Savatga qo'shish</button><button class="btn accent lg" id="buy" ${sold ? 'disabled' : ''}>Hoziroq sotib olish</button></div>
        </div>
        <a class="seller-card" href="#/fruits?seller=${p.seller_id}" aria-label="Sotuvchi">
          <span class="seller-ava">${esc((p.seller_name || '?')[0])}</span>
          <div class="grow"><b>${esc(p.seller_name)}</b><div class="muted" style="font-size:13px"><span class="rating">${starFill(14)} ${p.seller_rating.toFixed(1)}</span> · <span class="dot ${p.seller_online ? 'on' : ''}"></span>${p.seller_online ? 'Onlayn' : 'Oflayn'}</div></div>${icon('chevR', 18)}
        </a>
        <div class="guarantee">${icon('shield', 26)}<div><b>Meva sizga yoqmasa, mahsulotni qaytarishingiz mumkin.</b><p>Kuryer kelganda ko'zdan kechiring. Sifat mos kelmasa, meva narxini to'lamaysiz — faqat yetkazib berish haqi.</p></div></div>
      </div>
    </div>
    <div class="tabs" id="tabs"><button class="tab on" data-t="desc">Tavsif</button><button class="tab" data-t="rev">Sharhlar (${p.rating_count})</button><button class="tab" data-t="del">Yetkazib berish va qaytarish</button></div>
    <div id="tabbody"></div>
    ${p.related.length ? `<section class="section"><div class="sec-head"><h2>O'xshash mevalar</h2></div><div class="rail">${p.related.map(productCard).join('')}</div></section>` : ''}
  </div>`;

  /* gallery */
  const slideEls = $$('#gmain .slide');
  const show = (i) => { slideEls.forEach((s, k) => s.classList.toggle('on', k === i)); $$('.gthumb').forEach((t, k) => t.classList.toggle('on', k === i)); };
  show(0);
  $('#gthumbs').onclick = (e) => { const t = e.target.closest('.gthumb'); if (t) show(Number(t.dataset.i)); };

  /* quantity */
  const clamp = (n) => Math.max(p.min_order, Math.min(max, Math.round(n * 100) / 100));
  const paint = () => {
    $('#qin').value = qty;
    $('#qtotal').textContent = money(Math.round(p.price_final * qty));
    $$('.qchip').forEach((c) => c.classList.toggle('on', Number(c.dataset.q) === qty));
    $('#qminus').disabled = qty <= p.min_order;
    $('#qplus').disabled = qty >= max;
  };
  $('#qminus').onclick = () => { qty = clamp(qty - 0.5); paint(); };
  $('#qplus').onclick = () => { qty = clamp(qty + 0.5); paint(); };
  $('#qchips').onclick = (e) => { const c = e.target.closest('.qchip'); if (c && !c.disabled) { qty = Number(c.dataset.q); paint(); } };
  $('#qin').addEventListener('change', (e) => {
    const n = parseFloat(String(e.target.value).replace(',', '.'));
    if (!Number.isFinite(n)) { paint(); return; }
    const c = clamp(n);
    if (c !== n) toast(`Miqdor ${kg(p.min_order)} – ${kg(max)} oralig'ida bo'lishi kerak`, 'info');
    qty = c;
    paint();
  });
  paint();
  $('#addc').onclick = () => { cart.add(p, qty); toast(`${p.name} · ${kg(qty)} savatga qo'shildi`, 'success', { label: 'Savat', run: () => nav('/cart') }); };
  $('#buy').onclick = () => { cart.add(p, qty); nav('/checkout'); };
  bindCards(v, (pid) => (pid === p.id ? p : p.related.find((r) => r.id === pid)));

  /* tabs */
  const body = $('#tabbody');
  const tabs = {
    desc: () => `<div class="panel" style="max-width:820px"><p style="font-size:16px;line-height:1.7">${esc(p.description || '')}</p></div>`,
    del: () => `<div class="two-col" style="grid-template-columns:1fr 1fr"><div class="panel"><h3>${icon('truck', 20)} Yetkazib berish</h3><p class="muted">Taxminiy vaqt: ${eta(p)}. ${money(S.boot.settings.free_from)} dan yuqori buyurtmalarda yetkazib berish bepul, qolgan holatda ${money(S.boot.settings.base_fee)}. To'lov — yetkazilganda, naqd yoki kartada.</p></div>
      <div class="panel"><h3>${icon('shield', 20)} Qaytarish</h3><p class="muted">Kuryer kelganda mevalarni tekshiring. Sifat yoqmasa, rad etishingiz mumkin: meva narxi hisoblanmaydi, faqat yetkazib berish haqi ushlanadi.</p></div></div>`,
  };
  const loadReviews = async () => {
    body.innerHTML = '<div class="sk" style="height:200px;border-radius:22px"></div>';
    const list = await api.get(`/api/products/${p.id}/reviews`);
    const tot = p.rating_breakdown.reduce((a, b) => a + b.count, 0) || 1;
    const part = p.rating_parts || {};
    body.innerHTML = `<div class="rev-sum"><div class="rev-big"><b>${p.rating_count ? p.rating_avg.toFixed(1) : '—'}</b>${stars(p.rating_avg, 18)}<div class="muted" style="font-size:13px;margin-top:6px">${p.rating_count} ta sharh</div></div>
      <div class="bars">${p.rating_breakdown.map((r) => `<div class="bar"><span>${r.stars} ★</span><i style="--w:${Math.round((r.count / tot) * 100)}%"></i><span>${r.count}</span></div>`).join('')}
      ${part.quality ? `<div class="muted" style="font-size:13px;margin-top:6px">Sifat <b>${(+part.quality).toFixed(1)}</b> · Sotuvchi <b>${(+part.seller).toFixed(1)}</b> · Yetkazish <b>${(+part.delivery).toFixed(1)}</b></div>` : ''}</div></div>
      <div style="max-width:820px">${list.length ? list.map((r) => `<div class="review"><div class="who"><span class="ava">${esc(r.author[0])}</span><div><b>${esc(r.author)}</b><div class="row" style="gap:8px">${stars(r.rating, 13)}<small class="muted">${fmtDate(r.created_at)}</small></div></div></div>${r.body ? `<p>${esc(r.body)}</p>` : ''}${r.photo_url ? `<img class="rev-photo" src="${esc(r.photo_url)}" alt="Sharh rasmi">` : ''}</div>`).join('') : empty('⭐', 'Hali sharhlar yo\'q', 'Buyurtma yakunlangach, birinchi sharhni siz qoldiring.')}</div>`;
  };
  const setTab = (t) => { $$('.tab').forEach((x) => x.classList.toggle('on', x.dataset.t === t)); if (t === 'rev') loadReviews(); else body.innerHTML = tabs[t](); };
  $('#tabs').onclick = (e) => { const t = e.target.closest('.tab'); if (t) setTab(t.dataset.t); };
  setTab('desc');
  void authed; void requireLogin;
}

