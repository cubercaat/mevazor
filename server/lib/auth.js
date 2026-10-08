import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR, q } from '../db.js';
import { forbidden, unauthorized } from './http.js';

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = resolve(DATA_DIR, '.jwt-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const s = randomBytes(48).toString('hex');
  writeFileSync(file, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();
const b64 = (b) => Buffer.from(b).toString('base64url');

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const h = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const h = scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  const expected = Buffer.from(hash, 'hex');
  return h.length === expected.length && timingSafeEqual(h, expected);
}

export function signToken(user, ttlSec = 60 * 60 * 24 * 14) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verifyToken(token) {
  const [h, b, s] = String(token).split('.');
  if (!h || !b || !s) return null;
  const expected = createHmac('sha256', SECRET).update(`${h}.${b}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
  return payload.exp > Date.now() / 1000 ? payload : null;
}

/** Resolve the Bearer token to a fresh user row (so blocked users lose access immediately). */
export function authenticate(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  let payload;
  try {
    payload = verifyToken(m[1]);
  } catch {
    return null;
  }
  if (!payload) return null;
  const u = q.get('SELECT id, role, name, phone, email, avatar, status FROM users WHERE id = ?', payload.sub);
  if (!u || u.status !== 'active') return null;
  if (u.role === 'SELLER') u.seller_id = q.get('SELECT id FROM sellers WHERE user_id = ?', u.id)?.id;
  if (u.role === 'COURIER') u.courier_id = q.get('SELECT id FROM couriers WHERE user_id = ?', u.id)?.id;
  if (u.role === 'ADMIN') {
    u.permissions = JSON.parse(q.get('SELECT permissions FROM admin_users WHERE user_id = ?', u.id)?.permissions || '[]');
  }
  return u;
}

/* ---- guards ---- */
export const requireAuth = (ctx) => {
  if (!ctx.user) throw unauthorized();
};
export const requireRole = (...roles) => (ctx) => {
  requireAuth(ctx);
  if (!roles.includes(ctx.user.role)) throw forbidden();
};
/** Staff = anyone allowed into the admin panel. */
export const STAFF = ['SELLER', 'COURIER', 'ADMIN', 'SUPER_ADMIN'];
export const isAdmin = (u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN';
/** Fine-grained admin permission. SUPER_ADMIN has everything; ADMIN needs the named permission. */
export const requirePerm = (perm) => (ctx) => {
  requireAuth(ctx);
  const u = ctx.user;
  if (u.role === 'SUPER_ADMIN') return;
  if (u.role === 'ADMIN' && u.permissions.includes(perm)) return;
  throw forbidden();
};
