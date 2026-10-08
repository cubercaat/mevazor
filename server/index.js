import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPLOAD_DIR, q } from './db.js';
import { HttpError, readJson, sendJson } from './lib/http.js';
import { authenticate } from './lib/auth.js';
import { rateLimit } from './lib/util.js';
import { shop } from './routes/shop.js';
import { chat } from './routes/chat.js';
import { admin } from './routes/admin.js';
import { ensureDemoPhotos } from './photos.js';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const routers = [shop, chat, admin];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function serveFile(req, res, file, cache) {
  const st = statSync(file);
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': cache });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

function safeJoin(base, rel) {
  const full = normalize(join(base, rel));
  return full === base || full.startsWith(base + sep) ? full : null;
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/uploads/')) {
    const f = safeJoin(UPLOAD_DIR, pathname.slice(9));
    if (f && existsSync(f) && statSync(f).isFile()) return serveFile(req, res, f, 'public, max-age=31536000, immutable');
    res.writeHead(404, SECURITY_HEADERS);
    return res.end('Not found');
  }
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/admin' || rel === '/admin/') rel = '/admin/index.html';
  let f = safeJoin(PUBLIC, rel);
  if (f && existsSync(f) && statSync(f).isFile()) return serveFile(req, res, f, extname(f) === '.html' ? 'no-cache' : 'no-cache');
  // SPA fallback only for extension-less paths
  if (!extname(pathname)) {
    f = pathname.startsWith('/admin') ? join(PUBLIC, 'admin', 'index.html') : join(PUBLIC, 'index.html');
    return serveFile(req, res, f, 'no-cache');
  }
  res.writeHead(404, SECURITY_HEADERS);
  res.end('Not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  const ctx = {
    req, res, ip: req.socket.remoteAddress, query: Object.fromEntries(url.searchParams), params: {}, body: {}, status: 200, user: null,
  };
  try {
    rateLimit(`ip:${ctx.ip}`, 900, 60_000);
    let hit = null;
    let pathMatched = false;
    for (const r of routers) {
      const m = r.match(req.method, pathname);
      if (m.route) { hit = m; break; }
      pathMatched ||= !!m.pathMatched;
    }
    if (!hit) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Topilmadi');
    ctx.params = hit.params;
    ctx.user = authenticate(req);
    if (!['GET', 'HEAD'].includes(req.method)) ctx.body = await readJson(req, pathname === '/api/uploads' ? 5 * 1024 * 1024 : 256 * 1024);
    const handlers = hit.route.handlers;
    let out;
    for (let i = 0; i < handlers.length; i++) {
      const r = await handlers[i](ctx);
      if (i === handlers.length - 1) out = r;
    }
    sendJson(res, ctx.status, out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message, details: e.details });
    console.error(e);
    sendJson(res, 500, { error: 'Serverda xatolik yuz berdi' });
  }
});

if (!q.get('SELECT 1 AS x FROM delivery_settings WHERE id = 1')) {
  console.log('Empty database detected — seeding demo data…');
  await import('./seed.js').then((m) => m.seed());
}

ensureDemoPhotos();

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`\n  Mevazor running\n  Customer app : http://localhost:${PORT}/\n  Admin panel  : http://localhost:${PORT}/admin/\n`);
});
