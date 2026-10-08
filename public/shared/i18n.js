/*
 * Tiny runtime i18n shared by the customer app and the admin panel (uz / ru / en).
 *
 * Entries are tuples [uz, ru, en]. A string is looked up by its text in ANY of the three
 * languages, so UI strings (written in uz for the customer app, en for admin) and server/data
 * strings (statuses, fruit names, error messages) share one dictionary.
 * Dynamic text uses numbered placeholders: ['{1} ta meva', '{1} шт.', '{1} items'] — captured
 * parts are translated recursively (so a fruit name inside a sentence is translated too).
 *
 * The DOM is translated in place; original text is remembered per node, so switching language
 * is instant and lossless. Wrap anything that must never be translated in [data-notr].
 */
export const LANGS = [
  { code: 'uz', label: "O'zbekcha", short: 'UZ' },
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'en', label: 'English', short: 'EN' },
];
const IDX = { uz: 0, ru: 1, en: 2 };
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exact = new Map(); // normalized text -> entry
const patterns = []; // {re, labels, entry}
let lang = 'uz';
let storageKey = 'lang';
const missing = new Set();
const listeners = new Set();

export function addEntries(entries) {
  for (const e of entries) {
    const hasVar = e.some((t) => /\{\d\}/.test(t));
    for (const t of e) {
      if (!t) continue;
      if (hasVar && /\{\d\}/.test(t)) {
        // a pattern with no literal words (e.g. "{2} {1}") would match everything — never register those
        if (t.replace(/\{\d\}/g, '').replace(/[^\p{L}]/gu, '').length < 2) continue;
        const labels = [];
        const src = norm(t);
        const re = new RegExp('^' + esc(src).replace(/\\\{(\d)\\\}/g, (_, n) => (labels.push(n), '(.+?)')) + '$');
        patterns.push({ re, labels, entry: e, src });
      } else if (!exact.has(norm(t))) exact.set(norm(t), e);
    }
  }
}

function units(s) {
  if (lang === 'ru') return s.replace(/\bUZS\b/g, 'сум').replace(/(\d)(\s?)kg\b/g, '$1$2кг').replace(/^kg$/, 'кг').replace(/\/ kg\b/g, '/ кг');
  return s;
}

/** Translate a (trimmed, normalized) string into the current language. */
function tr(text, depth = 0) {
  const e = exact.get(text);
  if (e) return e[IDX[lang]] || text;
  if (depth >= 4) return text;
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    // "a · b" strings are several facts joined together; split them instead of letting a pattern swallow them
    if (m.slice(1).some((c) => (c.includes(' · ') && !p.src.includes(' · ')) || (c.includes(': ') && !p.src.includes(': ')))) continue;
    const caps = {};
    p.labels.forEach((l, i) => (caps[l] = tr(m[i + 1], depth + 1)));
    const out = p.entry[IDX[lang]];
    if (out) return out.replace(/\{(\d)\}/g, (_, n) => caps[n] ?? '');
  }
  // "a · b · c": translate every part
  for (const sep of [' · ', ' — ']) {
    if (!text.includes(sep)) continue;
    const parts = text.split(sep);
    const out = parts.map((x) => tr(x, depth + 1));
    if (out.some((x, i) => x !== parts[i])) return out.join(sep);
  }
  // "Label: value"
  const c = text.indexOf(': ');
  if (c > 0 && c < 40) {
    const a = tr(text.slice(0, c), depth + 1);
    const b = tr(text.slice(c + 2), depth + 1);
    if (a !== text.slice(0, c) || b !== text.slice(c + 2)) return `${a}: ${b}`;
  }
  // "<name> 2 kg"
  const km = /^(.+) (\d+(?:[.,]\d+)?)( ?)kg$/.exec(text);
  if (km) {
    const a = tr(km[1], depth + 1);
    if (a !== km[1]) return `${a} ${km[2]}${km[3]}kg`;
  }
  // "a, b, c" lists (fruit names in an order)
  if (text.includes(', ')) {
    const parts = text.split(', ');
    const out = parts.map((x) => tr(x, depth + 1));
    if (out.some((x, i) => x !== parts[i])) return out.join(', ');
  }
  return text;
}
export function t(text) {
  if (!text || typeof text !== 'string') return text;
  const lead = /^\s*/.exec(text)[0];
  const trail = /\s*$/.exec(text)[0];
  const core = norm(text);
  if (!core) return text;
  let out = tr(core);
  if (out === core && /\p{L}{3,}/u.test(core) && !/^[\d\s.,:;%+\-–—/()#@]*$/.test(core)) missing.add(core);
  out = units(out);
  return lead + out + (trail || '');
}

/* ------------------------------ DOM ------------------------------ */
const nodeRec = new WeakMap();
const attrRec = new WeakMap();
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);

function doText(n) {
  const p = n.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest('[data-notr]')) return;
  const cur = n.nodeValue;
  let rec = nodeRec.get(n);
  if (!rec || rec.out !== cur) { rec = { src: cur, out: cur }; nodeRec.set(n, rec); }
  const out = t(rec.src);
  if (out !== cur) n.nodeValue = out;
  rec.out = out;
}
function doAttrs(el) {
  if (el.closest?.('[data-notr]')) return;
  let rec = attrRec.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute?.(a)) continue;
    const cur = el.getAttribute(a);
    if (!rec) attrRec.set(el, (rec = {}));
    if (!rec[a] || rec[a].out !== cur) rec[a] = { src: cur, out: cur };
    const out = t(rec[a].src);
    if (out !== cur) el.setAttribute(a, out);
    rec[a].out = out;
  }
}
function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1 && root.nodeType !== 9) return;
  if (root.nodeType === 1) doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = w.nextNode();
  while (n) { if (n.nodeType === 3) doText(n); else doAttrs(n); n = w.nextNode(); }
}

let queued = new Set();
let raf = 0;
const flush = () => { if (!raf) return; raf = 0; const q = queued; queued = new Set(); for (const n of q) if (n.isConnected || n.nodeType === 9) walk(n); };
// rAF alone never fires in background tabs, so race it against a short timer
const queue = (n) => { queued.add(n); if (!raf) { raf = 1; requestAnimationFrame(flush); setTimeout(flush, 30); } };

export function initI18n({ key, entries, defaultLang = 'uz' }) {
  storageKey = key;
  addEntries(entries);
  let saved = null;
  try { saved = localStorage.getItem(key); } catch { /* storage blocked */ }
  lang = IDX[saved] != null ? saved : defaultLang;
  document.documentElement.lang = lang;
  const run = () => {
    walk(document.documentElement);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') queue(m.target);
        else if (m.type === 'attributes') queue(m.target);
        else m.addedNodes.forEach((n) => queue(n));
      }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
}

export const getLang = () => lang;
export function setLang(code) {
  if (IDX[code] == null || code === lang) return;
  lang = code;
  try { localStorage.setItem(storageKey, code); } catch { /* ignore */ }
  document.documentElement.lang = code;
  walk(document.documentElement);
  listeners.forEach((f) => f(code));
}
export const onLang = (f) => (listeners.add(f), () => listeners.delete(f));
export const missingStrings = () => [...missing];

/** Language picker button + popover. Returns markup; wire once with bindLangMenu(). */
export function langButton(extra = '') {
  const cur = LANGS.find((l) => l.code === lang);
  return `<button class="lang-btn ${extra}" data-lang-btn aria-haspopup="true" aria-label="Language" title="Language" data-notr><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg><b>${cur.short}</b></button>`;
}
export function bindLangMenu(onChange) {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.lang-pop')) return;
    document.querySelectorAll('.lang-pop').forEach((p) => p.remove());
    const b = e.target.closest('[data-lang-btn]');
    if (!b) return;
    e.stopPropagation();
    const pop = document.createElement('div');
    pop.className = 'lang-pop';
    pop.setAttribute('data-notr', '');
    pop.innerHTML = LANGS.map((l) => `<button data-l="${l.code}" class="${l.code === lang ? 'on' : ''}"><b>${l.short}</b>${l.label}</button>`).join('');
    const r = b.getBoundingClientRect();
    document.body.append(pop);
    pop.style.top = `${r.bottom + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth))}px`;
    pop.onclick = (ev) => {
      const l = ev.target.closest('[data-l]');
      if (!l) return;
      setLang(l.dataset.l);
      document.querySelectorAll('[data-lang-btn] b').forEach((x) => (x.textContent = LANGS.find((z) => z.code === l.dataset.l).short));
      pop.remove();
      onChange?.(l.dataset.l);
    };
  }, true);
}
