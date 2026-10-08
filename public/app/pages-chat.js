import { $, $$, esc, icon, art, money, kg, toast, modal, busy, fmtTime, fmtDate, uploadImage, ago } from '/shared/core.js';
import { api, S, nav, requireLogin, refreshCounters } from './state.js';
import { empty, tint } from './components.js';

const view = () => document.getElementById('view');
const QUICK = ['Meva yangi-mi?', 'Qaysi hajmda?', 'Shirinligi qanday?', 'Bugun keltirilganmi?', 'Rasm yubora olasizmi?'];
const ticks = (read) => `<span class="${read ? 'read' : ''}" style="display:inline-flex">${icon('check', 15)}${read ? `<span style="margin-left:-9px;display:inline-flex">${icon('check', 15)}</span>` : ''}</span>`;

export async function chatPage({ id }, query) {
  if (!requireLogin()) return;
  const v = view();
  const cid = id ? Number(id) : null;
  v.innerHTML = `<div class="container"><div class="chat-layout ${cid ? 'in-thread' : ''}" id="cl">
    <aside class="chat-list"><h2>Chat</h2><div id="clist">${Array.from({ length: 4 }, () => '<div class="citem"><div class="sk" style="width:46px;height:46px;border-radius:15px"></div><div class="grow"><div class="sk" style="height:14px;width:60%;margin-bottom:8px"></div><div class="sk" style="height:12px;width:85%"></div></div></div>').join('')}</div></aside>
    <section class="thread" id="thread">${cid ? '' : `<div style="display:grid;place-items:center;height:100%;padding:20px">${empty('💬', 'Suhbatni tanlang', "Sotuvchi bilan yozishmalaringiz shu yerda. Har bir suhbat buyurtma bilan bog'langan.")}</div>`}</section></div></div>`;

  let chats = [];
  const drawList = () => {
    $('#clist').innerHTML = chats.length ? chats.map((c) => `
      <a class="citem ${c.id === cid ? 'on' : ''}" href="#/chat/${c.id}">
        <span class="cava">${esc((c.store_name || '?')[0])}<i class="st ${c.seller_online ? 'on' : ''}"></i></span>
        <div class="grow"><div class="row" style="justify-content:space-between"><b>${esc(c.store_name)}</b><time>${c.last_at ? ago(c.last_at) : ''}</time></div>
          <div class="row" style="justify-content:space-between"><p>${esc(c.last_message || 'Suhbatni boshlang')}</p>${c.unread ? `<span class="unread">${c.unread}</span>` : ''}</div>
          <small class="muted">${esc(c.order_code)} · ${esc(c.order_status_label)}</small></div></a>`).join('')
      : `<div style="padding:30px 20px">${empty('💬', "Suhbatlar yo'q", "Buyurtma berayotganda sotuvchidan savol so'rashingiz mumkin.", '<a class="btn primary sm" href="#/fruits">Mevalarni ko\'rish</a>')}</div>`;
  };
  const loadList = async () => { chats = await api.get('/api/chats').catch(() => chats); drawList(); S.chatUnread = chats.reduce((a, c) => a + c.unread, 0); };
  await loadList();
  const listTimer = setInterval(() => !document.hidden && loadList(), 7000);
  let stop = () => {};
  if (cid) stop = await thread(cid, query, loadList);
  return () => { clearInterval(listTimer); stop(); };
}

async function thread(cid, query, reloadList) {
  const el = $('#thread');
  el.innerHTML = '<div style="display:grid;place-items:center;height:100%"><div class="sk" style="width:60%;height:24px"></div></div>';
  let data;
  try { data = await api.get(`/api/chats/${cid}`); } catch (e) { el.innerHTML = empty('⚠️', 'Suhbat ochilmadi', e.message); return () => {}; }
  let sig = '';
  let waiting = false;
  let waitTimer;
  let draftOrder = null;
  if (data.order_status === 'draft') draftOrder = await api.get(`/api/orders/${data.order_id}`).catch(() => null);

  const shell = () => {
    const o = data.order;
    el.innerHTML = `
      <div class="thread-head"><a class="ibtn back-m" href="#/chat" aria-label="Orqaga">${icon('chevL')}</a>
        <span class="cava">${esc((data.store_name || '?')[0])}<i class="st ${data.seller_online ? 'on' : ''}" id="st"></i></span>
        <div class="grow"><b>${esc(data.store_name)}</b><div class="muted" style="font-size:13px" id="stl"><span class="dot ${data.seller_online ? 'on' : ''}"></span>${data.seller_online ? 'Onlayn' : 'Oflayn — javob biroz kechikishi mumkin'}</div></div>
        <a class="btn outline sm" href="#/orders/${data.order_id}">${esc(data.order_code)}</a></div>
      ${draftOrder ? `<div class="confirm-banner"><span>Buyurtma hali tasdiqlanmagan</span><button class="btn primary sm" id="confirmNow">${icon('check', 16)} Buyurtmani tasdiqlash</button></div>` : ''}
      <div class="order-strip"><div class="row" style="padding-left:8px">${o.items.slice(0, 3).map((i) => `<span class="oi" style="--tint:${tint(i.tint)}">${art(i)}</span>`).join('')}</div><span class="grow">${o.items.map((i) => esc(i.name) + ' ' + kg(i.qty_kg)).join(', ')}</span><b class="num">${money(o.total)}</b></div>
      <div class="msgs" id="msgs" aria-live="polite"></div>
      <div class="quick-q" id="qq"></div>
      <form class="composer" id="cf"><div class="box"><textarea id="ct" rows="1" placeholder="Xabar yozing…" maxlength="1500" aria-label="Xabar"></textarea>
        <button type="button" class="ibtn" id="cprod" aria-label="Mahsulotni ulashish" title="Mahsulotni ulashish">${icon('box', 20)}</button>
        <label class="ibtn" style="cursor:pointer" title="Rasm yuborish">${icon('image', 20)}<input type="file" id="cimg" accept="image/png,image/jpeg,image/webp" hidden></label></div>
        <button class="send" type="submit" aria-label="Yuborish">${icon('send', 20)}</button></form>`;
  };
  shell();

  const render = (force) => {
    const s = JSON.stringify(data.messages.map((m) => [m.id, m.read_at]));
    if (s === sig && !force) return;
    sig = s;
    const box = $('#msgs');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    let lastDay = '';
    let html = '';
    for (const m of data.messages) {
      const day = fmtDate(m.created_at);
      if (day !== lastDay) { html += `<div class="day">${day === fmtDate(new Date().toISOString()) ? 'Bugun' : day}</div>`; lastDay = day; }
      const mine = m.sender_role === 'CUSTOMER';
      html += `<div class="msg ${mine ? 'me' : m.sender_role === 'ADMIN' ? 'admin' : 'them'}">
        ${m.sender_role === 'ADMIN' ? '<div class="who">Mevazor yordam xizmati</div>' : ''}
        ${m.product_id ? `<a class="pref" href="#/fruit/${m.product_id}"><span class="pa" style="--tint:${tint(m.product_tint)}">${art({ image: m.product_image, art: m.product_art })}</span><div><b>${esc(m.product_name)}</b><small>${m.product_price ? money(m.product_price) + ' / kg' : ''}</small></div></a>` : ''}
        ${m.image_url ? `<img class="pic" src="${esc(m.image_url)}" alt="Yuborilgan rasm" data-zoom="${esc(m.image_url)}">` : ''}
        ${m.body ? `<div>${esc(m.body).replace(/\n/g, '<br>')}</div>` : ''}
        <div class="meta"><span>${fmtTime(m.created_at)}</span>${mine ? ticks(!!m.read_at) : ''}</div></div>`;
    }
    if (waiting) html += '<div class="typing" aria-label="Sotuvchi yozmoqda"><i></i><i></i><i></i></div>';
    box.innerHTML = html || `<div style="margin:auto;text-align:center;color:var(--muted);padding:20px">Savolingizni yozing yoki pastdagi tayyor savollardan birini tanlang.</div>`;
    if (atBottom || force) box.scrollTop = box.scrollHeight;
    $('#qq').innerHTML = data.messages.length <= 2 ? QUICK.map((t) => `<button type="button">${t}</button>`).join('') : '';
  };
  render(true);

  const refresh = async () => {
    try {
      const prevLast = data.messages.at(-1)?.id;
      data = await api.get(`/api/chats/${cid}`);
      if (data.messages.at(-1)?.id !== prevLast && data.messages.at(-1)?.sender_role !== 'CUSTOMER') { waiting = false; clearTimeout(waitTimer); }
      render();
      const st = $('#st'); if (st) st.classList.toggle('on', data.seller_online);
    } catch { /* offline */ }
  };
  const timer = setInterval(() => !document.hidden && refresh(), 3000);

  const send = async (payload) => {
    await api.post(`/api/chats/${cid}/messages`, payload);
    if (data.seller_online) { waiting = true; clearTimeout(waitTimer); waitTimer = setTimeout(() => { waiting = false; render(true); }, 9000); }
    await refresh();
    $('#msgs').scrollTop = $('#msgs').scrollHeight;
    reloadList();
  };
  const ct = $('#ct');
  const submit = () => {
    const body = ct.value.trim();
    if (!body) return;
    ct.value = ''; ct.style.height = 'auto';
    send({ body }).catch((e) => { toast(e.message, 'error'); ct.value = body; });
  };
  $('#cf').onsubmit = (e) => { e.preventDefault(); submit(); };
  ct.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
  ct.addEventListener('input', () => { ct.style.height = 'auto'; ct.style.height = Math.min(ct.scrollHeight, 120) + 'px'; });
  $('#qq').onclick = (e) => { const b = e.target.closest('button'); if (b) { ct.value = b.textContent; submit(); } };
  $('#cimg').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { toast('Rasm yuklanmoqda…', 'info'); await send({ image_url: await uploadImage(api, f) }); } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  };
  $('#cprod').onclick = () => {
    const { el: m, close } = modal(`<div class="modal-head"><h3>Mahsulotni ulashish</h3><button class="ibtn" data-close>${icon('x')}</button></div><div class="modal-body">${data.order.items.map((i) => `<button class="seller-card" data-p="${i.product_id}" style="text-align:left"><span class="seller-ava" style="background:${tint(i.tint)}">${art(i)}</span><div class="grow"><b>${esc(i.name)}</b><div class="muted" style="font-size:13px">${kg(i.qty_kg)}</div></div>${icon('send', 18)}</button>`).join('')}</div>`, { cls: 'modal-sm' });
    m.onclick = (ev) => { const b = ev.target.closest('[data-p]'); if (b) { close(); send({ product_id: +b.dataset.p, body: 'Shu mahsulot haqida savolim bor' }).catch((er) => toast(er.message, 'error')); } };
  };
  el.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]');
    if (z) { const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${esc(z.dataset.zoom)}" alt="">`; lb.onclick = () => lb.remove(); document.body.append(lb); }
  });
  $('#confirmNow')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    if (query.from) { await api.post(`/api/orders/confirm-group/${query.from}`); refreshCounters(); nav(`/done/${query.from}`); } else { await api.post(`/api/orders/${data.order_id}/confirm`); refreshCounters(); nav(`/orders/${data.order_id}`); }
  }));
  if (!data.messages.length) setTimeout(() => ct.focus(), 100);
  return () => { clearInterval(timer); clearTimeout(waitTimer); };
}
