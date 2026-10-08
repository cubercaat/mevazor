import { createApi, esc, icon, art, toast, emojiIcon } from '/shared/core.js';

export const api = createApi('mza_token');
export const A = { user: null, meta: null, unread: 0, awaiting: 0 };
export const can = (p) => A.meta?.permissions.includes(p);
export const isSeller = () => A.user?.role === 'SELLER';
export const isCourier = () => A.user?.role === 'COURIER';
export const isTeam = () => ['ADMIN', 'SUPER_ADMIN'].includes(A.user?.role);

export const STATUS = {
  draft: ['Awaiting confirmation', 'warn'], sent: ['Submitted', 'info'], reviewing: ['Under review', 'info'], accepted: ['Accepted', 'brand'],
  preparing: ['Preparing', 'brand'], handed: ['Handed to courier', 'orange'], on_way: ['On the way', 'orange'], delivered: ['Delivered', 'ok'],
  completed: ['Completed', 'ok'], rejected: ['Rejected', 'bad'], cancelled: ['Cancelled', 'bad'], return_requested: ['Return requested', 'warn'], returned: ['Returned', 'bad'],
};
export const pill = (s) => `<span class="st ${STATUS[s]?.[1] || ''}">${esc(STATUS[s]?.[0] || s)}</span>`;
export const tonePill = (label, tone = '') => `<span class="st ${tone}">${esc(label)}</span>`;
export const tint = (t) => (/^#[0-9a-fA-F]{3,8}$/.test(t || '') ? t : '#F4E9D8');
export const fruitCell = (p, sub) => `<div class="cell"><span class="art" style="--tint:${tint(p.tint)}">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="">` : art(p.art)}</span><div><b>${esc(p.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
export const rate = (n) => `<span class="rate">${icon('star', 14)}${Number(n).toFixed(1)}</span>`;
export const emptyState = (emoji, title, text = '') => `<div class="empty"><div class="em">${emojiIcon(emoji)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
export const rows = (n, h = 52) => Array.from({ length: n }, () => `<div class="sk" style="height:${h}px;margin:10px 16px"></div>`).join('');

/** Right-hand drawer. */
export function drawer(title, body, { actions = '', onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'drawer-back';
  back.innerHTML = `<aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="drawer-h"><h3 class="grow" style="flex:1">${title}</h3>${actions}<button class="ibtn" data-x aria-label="Close">${icon('x')}</button></div><div class="drawer-b">${body}</div></aside>`;
  document.body.append(back);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => back.classList.add('in'));
  const close = () => {
    back.classList.remove('in');
    setTimeout(() => { back.remove(); if (!document.querySelector('.modal-back,.drawer-back')) document.body.classList.remove('no-scroll'); }, 220);
    document.removeEventListener('keydown', key);
    onClose?.();
  };
  const key = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-back')) close(); };
  document.addEventListener('keydown', key);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-x]').onclick = close;
  return { el: back.querySelector('.drawer-b'), root: back, close };
}

export function zoomable(root) {
  root.addEventListener('click', (e) => {
    const im = e.target.closest('img[data-zoom]');
    if (!im) return;
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${esc(im.getAttribute('src'))}" alt="">`;
    lb.onclick = () => lb.remove();
    document.body.append(lb);
  });
}

export const FRUIT_EMOJI = ['🍎', '🍏', '🍌', '🍊', '🍋', '🍇', '🍓', '🍉', '🍈', '🍑', '🍐', '🥝', '🥭', '🍍', '🍒', '🥑', '🫐'];
export const QUALITIES = ['Premium', 'Birinchi nav', 'Standart'];
export const SIZES = ["Kichik", "O'rtacha", 'Katta'];

export async function guard(fn) {
  try { return await fn(); } catch (e) { toast(e.message, 'error'); }
}
