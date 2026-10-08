import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR || resolve(root, 'data');
export const UPLOAD_DIR = resolve(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(resolve(DATA_DIR, 'mevazor.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const cache = new Map();
const stmt = (sql) => {
  let s = cache.get(sql);
  if (!s) cache.set(sql, (s = db.prepare(sql)));
  return s;
};

/** Tiny query helpers around prepared statements. */
export const q = {
  all: (sql, ...p) => stmt(sql).all(...p).map((r) => ({ ...r })),
  get: (sql, ...p) => {
    const r = stmt(sql).get(...p);
    return r ? { ...r } : undefined;
  },
  run: (sql, ...p) => stmt(sql).run(...p),
  insert: (sql, ...p) => Number(stmt(sql).run(...p).lastInsertRowid),
};

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const now = () => new Date().toISOString();

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('CUSTOMER','SELLER','COURIER','ADMIN','SUPER_ADMIN')),
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  last_seen TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  birth_date TEXT,
  note TEXT
);
CREATE TABLE IF NOT EXISTS admin_users (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  permissions TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS sellers (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  description TEXT,
  emoji TEXT DEFAULT '🍎',
  rating REAL NOT NULL DEFAULT 5,
  rating_count INTEGER NOT NULL DEFAULT 0,
  online INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS couriers (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  vehicle TEXT,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline','delivering','available')),
  rating REAL NOT NULL DEFAULT 5,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  emoji TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price_per_kg INTEGER NOT NULL CHECK (price_per_kg >= 0),
  discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  stock_kg REAL NOT NULL DEFAULT 0,
  min_order REAL NOT NULL DEFAULT 0.5,
  max_order REAL NOT NULL DEFAULT 20,
  size TEXT NOT NULL DEFAULT 'O''rtacha',
  quality TEXT NOT NULL DEFAULT 'Premium',
  origin TEXT NOT NULL DEFAULT 'O''zbekiston',
  harvest_info TEXT,
  art TEXT,
  tint TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  is_popular INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER NOT NULL DEFAULT 0,
  is_seasonal INTEGER NOT NULL DEFAULT 0,
  delivery_min INTEGER NOT NULL DEFAULT 30,
  delivery_max INTEGER NOT NULL DEFAULT 60,
  sold_kg REAL NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  full_address TEXT NOT NULL,
  apartment TEXT,
  instructions TEXT,
  is_default INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  code TEXT UNIQUE,
  discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  min_total INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  art TEXT
);
CREATE TABLE IF NOT EXISTS delivery_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_fee INTEGER NOT NULL,
  free_from INTEGER NOT NULL,
  eta_min INTEGER NOT NULL,
  eta_max INTEGER NOT NULL,
  return_policy TEXT NOT NULL DEFAULT 'delivery_fee' CHECK (return_policy IN ('delivery_fee','free','fixed')),
  return_fixed_fee INTEGER NOT NULL DEFAULT 0,
  support_phone TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  group_code TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  courier_id INTEGER REFERENCES couriers(id),
  status TEXT NOT NULL DEFAULT 'draft',
  payment_method TEXT NOT NULL DEFAULT 'cod',
  items_total INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  promo_code TEXT,
  delivery_fee INTEGER NOT NULL,
  total INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  apartment TEXT,
  instructions TEXT,
  reject_reason TEXT,
  eta_min INTEGER NOT NULL DEFAULT 30,
  eta_max INTEGER NOT NULL DEFAULT 60,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  art TEXT,
  tint TEXT,
  price_per_kg INTEGER NOT NULL,
  qty_kg REAL NOT NULL,
  line_total INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  actor_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  product_id INTEGER REFERENCES products(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','flagged')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  sender_role TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  product_id INTEGER REFERENCES products(id),
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  quality_rating INTEGER NOT NULL CHECK (quality_rating BETWEEN 1 AND 5),
  seller_rating INTEGER NOT NULL CHECK (seller_rating BETWEEN 1 AND 5),
  delivery_rating INTEGER NOT NULL CHECK (delivery_rating BETWEEN 1 AND 5),
  body TEXT,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  created_at TEXT NOT NULL,
  UNIQUE (order_id, product_id)
);
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  reason TEXT NOT NULL,
  note TEXT,
  photos TEXT NOT NULL DEFAULT '[]',
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  meta TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
`;

export function migrate() {
  db.exec(SCHEMA);
}
migrate();
