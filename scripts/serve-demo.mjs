// Preview the static demo exactly as GitHub Pages serves it (under /mevazor/).
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const BASE = '/mevazor';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(BASE)) { res.writeHead(302, { Location: BASE + '/' }); return res.end(); }
  p = p.slice(BASE.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(DOCS, p));
  if (!f.startsWith(DOCS) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  createReadStream(f).pipe(res);
}).listen(4000, () => console.log('Demo preview: http://localhost:4000/mevazor/  (admin: /mevazor/admin/)'));
