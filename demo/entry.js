/*
 * Browser build of the Mevazor server. The very same route code that runs under Node (server/routes/*) runs here
 * against SQLite-in-WebAssembly, and window.fetch is intercepted for <BASE>/api/* — so the apps work on static hosting
 * (GitHub Pages) with no backend. Data lives in the visitor's browser (localStorage); add ?reset to the URL to start over.
 */
globalThis.__DEMO__ = true;
globalThis.__BASE__ = __BASE__;

import { q } from '../server/db.js';
import { state } from './shims/sqlite.js';
import { HttpError } from '../server/lib/http.js';
import { authenticate } from '../server/lib/auth.js';
import { rateLimit } from '../server/lib/util.js';
import { shop } from '../server/routes/shop.js';
import { chat } from '../server/routes/chat.js';
import { admin } from '../server/routes/admin.js';
import { seed } from '../server/seed.js';
import { ensureDemoPhotos } from '../server/photos.js';

if (!state.restored || !q.get('SELECT 1 AS x FROM delivery_settings WHERE id = 1')) seed({ reset: false });
ensureDemoPhotos();

const routers = [shop, chat, admin];

async function handle(method, pathname, query, headers, rawBody) {
  const ctx = { req: { headers, method }, res: null, ip: 'demo', query, params: {}, body: {}, status: 200, user: null };
  try {
    rateLimit('ip:demo', 100000, 60_000);
    let hit = null;
    let pathMatched = false;
    for (const r of routers) {
      const m = r.match(method, pathname);
      if (m.route) { hit = m; break; }
      pathMatched ||= !!m.pathMatched;
    }
    if (!hit) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Topilmadi');
    ctx.params = hit.params;
    ctx.user = authenticate(ctx.req);
    if (method !== 'GET' && method !== 'HEAD' && rawBody) {
      if (rawBody.length > 6 * 1024 * 1024) throw new HttpError(413, "So'rov hajmi juda katta");
      try { ctx.body = JSON.parse(rawBody) || {}; } catch { throw new HttpError(400, "JSON noto'g'ri"); }
    }
    let out;
    const hs = hit.route.handlers;
    for (let i = 0; i < hs.length; i++) {
      const r = await hs[i](ctx);
      if (i === hs.length - 1) out = r;
    }
    return { status: ctx.status, data: out ?? { ok: true } };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, data: { error: e.message, details: e.details } };
    console.error(e);
    return { status: 500, data: { error: 'Serverda xatolik yuz berdi' } };
  }
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith(`${__BASE__}/api/`)) return realFetch(input, init);
  const headers = {};
  for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
  const { status, data } = await handle((init.method || 'GET').toUpperCase(), url.pathname.slice(__BASE__.length), Object.fromEntries(url.searchParams), headers, init.body);
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
};

/* small floating badge so visitors know this is a sandbox */
const badge = document.createElement('div');
badge.setAttribute('data-notr', '');
const inAdmin = location.pathname.includes('/admin');
badge.style.cssText = `position:fixed;${inAdmin ? 'right:12px;bottom:12px' : 'left:10px;bottom:84px'};z-index:80;font:600 11px system-ui,sans-serif;background:rgba(15,23,42,.88);color:#fff;padding:6px 10px;border-radius:99px;display:flex;gap:8px;align-items:center;backdrop-filter:blur(6px)`;
badge.innerHTML = 'DEMO <a href="?reset" style="color:#9FE3BE;text-decoration:underline">reset</a>';
(document.body ? Promise.resolve() : new Promise((r) => addEventListener('DOMContentLoaded', r))).then(() => document.body.append(badge));
