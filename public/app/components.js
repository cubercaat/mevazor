import { esc, icon, starFill, heartFill, art, money, num, kg, toast, emojiIcon } from '/shared/core.js';
import { api, S, cart, requireLogin } from './state.js';

export const tint = (t) => (/^#[0-9a-fA-F]{3,8}$/.test(t || '') ? t : '#F4E9D8');
export const eta = (p) => `${p.delivery_min}–${p.delivery_max} daq`;
export const stars = (n, size = 15) => `<span class="stars" aria-label="${n} yulduz">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= Math.round(n) ? '' : 'off'}">${starFill(size)}</span>`).join('')}</span>`;
export const quickQty = (p) => Math.min(p.stock_kg, Math.max(1, p.min_order));

/** The visual stage of a fruit: uploaded photo if the seller added one, otherwise the illustrated fruit. */
export function stage(p, cls = '') {
  return `<span class="stage ${cls}" style="--tint:${tint(p.tint)}">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">` : art(p.art)}</span>`;
}

export function productCard(p) {
  const sold = p.stock_kg < p.min_order;
  const low = !sold && p.stock_kg <= 30;
  return `
  <article class="pc ${sold ? 'sold' : ''}" data-id="${p.id}">
    <div style="position:relative">
      <a href="#/fruit/${p.id}" aria-label="${esc(p.name)}">${stage(p)}</a>
      <div class="badges">
        ${p.discount_percent ? `<span class="tag sale">−${p.discount_percent}%</span>` : ''}
        ${p.is_new ? '<span class="tag new">Yangi</span>' : ''}
        ${p.is_seasonal ? '<span class="tag season">Mavsumiy</span>' : ''}
      </div>
      <button class="fav ${p.is_fav ? 'on' : ''}" data-fav="${p.id}" aria-label="Sevimlilarga qo'shish" aria-pressed="${!!p.is_fav}">${p.is_fav ? heartFill(20) : icon('heart', 20)}</button>
    </div>
    <div class="pc-body">
      <a href="#/fruit/${p.id}" class="pc-name">${esc(p.name)}</a>
      <div class="pc-seller"><span class="rating">${starFill(14)}${p.rating_count ? p.rating_avg.toFixed(1) : '—'} <small>(${p.rating_count})</small></span><span>· ${esc(p.seller_name)}</span></div>
      <div class="chips"><span class="chip">${esc(p.size)}</span><span class="chip q">${esc(p.quality)}</span><span class="chip">${esc(p.origin)}</span></div>
      <div class="price"><b class="num">${num(p.price_final)}</b><small>UZS / kg</small>${p.discount_percent ? `<s class="num">${num(p.price_per_kg)}</s>` : ''}</div>
      <div class="pc-foot">
        <div class="pc-info">
          <span class="${low ? 'low' : ''}">${icon('box', 14)}${sold ? 'Tugagan' : `${kg(p.stock_kg)} mavjud`}</span>
          <span>${icon('clock', 14)}${eta(p)}</span>
        </div>
        <button class="add" data-add="${p.id}" ${sold ? 'disabled' : ''} aria-label="Savatga qo'shish">${icon('plus', 22)}</button>
      </div>
    </div>
  </article>`;
}

export const cardSkeletons = (n = 8) => Array.from({ length: n }, () => `<div class="sk-card"><div class="a sk"></div><div class="b"><div class="sk" style="height:18px;width:70%"></div><div class="sk" style="height:12px;width:50%"></div><div class="sk" style="height:12px;width:90%"></div><div class="sk" style="height:22px;width:55%"></div></div></div>`).join('');

export function empty(emoji, title, text, action = '') {
  return `<div class="empty"><div class="em">${emojiIcon(emoji)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

/** Delegated handler for add-to-cart and favourite buttons on any list of cards. */
export function bindCards(root, getProduct) {
  root.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
      e.preventDefault();
      const p = getProduct(Number(addBtn.dataset.add));
      if (!p) return;
      cart.add(p, quickQty(p));
      addBtn.classList.add('done');
      addBtn.innerHTML = icon('check', 22);
      setTimeout(() => { addBtn.classList.remove('done'); addBtn.innerHTML = icon('plus', 22); }, 1100);
      toast(`${p.name} savatga qo'shildi`, 'success', { label: 'Savat', run: () => (location.hash = '/cart') });
      return;
    }
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      e.preventDefault();
      if (!requireLogin()) return;
      const id = Number(favBtn.dataset.fav);
      const p = getProduct(id);
      const was = favBtn.classList.contains('on');
      const set = (on) => {
        favBtn.classList.toggle('on', on);
        favBtn.setAttribute('aria-pressed', on);
        favBtn.innerHTML = on ? heartFill(20) : icon('heart', 20);
        if (p) p.is_fav = on;
      };
      set(!was);
      favBtn.classList.remove('pop');
      void favBtn.offsetWidth;
      favBtn.classList.add('pop');
      try {
        const r = await api.post(`/api/favorites/${id}`);
        set(r.is_fav);
        toast(r.is_fav ? "Sevimli mevalarga qo'shildi" : 'Sevimlilardan olib tashlandi', 'success');
      } catch (err) {
        set(was);
        toast(err.message, 'error');
      }
    }
  });
}

export const statusTone = (s) => (['rejected', 'cancelled'].includes(s) ? 'bad' : ['return_requested', 'returned', 'draft'].includes(s) ? 'warn' : ['completed'].includes(s) ? 'grey' : '');
export const isLive = (s) => ['sent', 'reviewing', 'accepted', 'preparing', 'handed', 'on_way'].includes(s);

export function userCan() { return !!S.user; }
export { money };
