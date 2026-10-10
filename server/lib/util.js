import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UPLOAD_DIR, q, now } from '../db.js';
import { HttpError, badRequest } from './http.js';

/* ---------- validation ---------- */
export const v = {
  str: (min = 0, max = 500) => (x, k) => {
    if (x === undefined || x === null) x = '';
    if (typeof x !== 'string') throw badRequest(`${k}: matn bo'lishi kerak`);
    x = x.trim();
    if (x.length < min) throw badRequest(`${k}: kamida ${min} belgi`);
    if (x.length > max) throw badRequest(`${k}: ko'pi bilan ${max} belgi`);
    return x;
  },
  num: (min = -Infinity, max = Infinity) => (x, k) => {
    const n = Number(x);
    if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${k}: noto'g'ri qiymat`);
    return n;
  },
  int: (min = -Infinity, max = Infinity) => (x, k) => {
    const n = Number(x);
    if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${k}: noto'g'ri qiymat`);
    return n;
  },
  bool: () => (x) => (x === true || x === 1 || x === '1' || x === 'true' ? 1 : 0),
  oneOf: (...opts) => (x, k) => {
    if (!opts.includes(x)) throw badRequest(`${k}: ruxsat etilmagan qiymat`);
    return x;
  },
  phone: () => (x, k) => {
    const d = String(x ?? '').replace(/[^\d]/g, '');
    const n = d.length === 9 ? '998' + d : d;
    if (!/^998\d{9}$/.test(n)) throw badRequest(`${k}: telefon raqami noto'g'ri (+998 XX XXX XX XX)`);
    return '+' + n;
  },
  optional: (rule, fallback = null) => (x, k) => (x === undefined || x === null || x === '' ? fallback : rule(x, k)),
};

/** validate(body, { field: rule }) -> cleaned object containing only declared fields. */
export function validate(body, schema) {
  const out = {};
  for (const [k, rule] of Object.entries(schema)) out[k] = rule(body?.[k], k);
  return out;
}
/** Same, but only for fields present in body (for PATCH). */
export function validatePartial(body, schema) {
  const out = {};
  for (const [k, rule] of Object.entries(schema)) if (body && k in body) out[k] = rule(body[k], k);
  return out;
}

/* ---------- rate limiting (in-memory token window) ---------- */
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < t) {
    buckets.set(key, { n: 1, reset: t + windowMs });
    return;
  }
  if (++b.n > max) throw new HttpError(429, 'Juda ko\'p urinish. Birozdan so\'ng qayta urinib ko\'ring');
}
setInterval(() => {
  const t = Date.now();
  for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k);
}, 60_000).unref?.();

/* ---------- uploads (magic-byte verified) ---------- */
const MAGIC = [
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];
export function saveImage(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw badRequest('Faqat PNG, JPG yoki WEBP rasm qabul qilinadi');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw badRequest('Rasm hajmi 3 MB dan oshmasligi kerak');
  const kind = MAGIC.find((k) => k.test(buf));
  if (!kind) throw badRequest('Rasm fayli yaroqsiz');
  // Browser demo build has no disk: hand the (already validated) image back as a data URL.
  if (globalThis.__DEMO__) return `data:image/${kind.ext === 'jpg' ? 'jpeg' : kind.ext};base64,${m[2]}`;
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${randomBytes(12).toString('hex')}.${kind.ext}`;
  writeFileSync(resolve(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
/** Accept only URLs we produced ourselves (prevents hot-linking arbitrary hosts / javascript: urls). */
export const ownUpload = (u) => {
  if (typeof u !== 'string') return null;
  if (/^(\/[\w-]+)?\/uploads\/[a-f0-9]{24}\.(png|jpg|webp)$/.test(u) || /^(\/[\w-]+)?\/photos\/[a-z-]+\.jpg$/.test(u)) return u;
  return globalThis.__DEMO__ && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : null;
};

/* ---------- audit + notifications ---------- */
export function audit(ctx, action, entity, entityId, meta) {
  q.run(
    'INSERT INTO audit_logs (user_id, action, entity, entity_id, meta, ip, created_at) VALUES (?,?,?,?,?,?,?)',
    ctx.user?.id ?? null, action, entity ?? null, entityId != null ? String(entityId) : null,
    meta ? JSON.stringify(meta) : null, ctx.ip ?? null, now(),
  );
}
export function notify(userIds, type, title, body, link) {
  const ids = [...new Set([].concat(userIds).filter(Boolean))];
  for (const id of ids) {
    q.run('INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?,?,?,?,?,?)', id, type, title, body ?? null, link ?? null, now());
  }
}
export const adminUserIds = () => q.all("SELECT id FROM users WHERE role IN ('ADMIN','SUPER_ADMIN') AND status='active'").map((r) => r.id);
export const sellerUserId = (sellerId) => q.get('SELECT user_id FROM sellers WHERE id = ?', sellerId)?.user_id;
