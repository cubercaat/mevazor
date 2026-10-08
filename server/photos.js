import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from './db.js';

const PHOTO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'photos');

/** Built-in catalogue fruit -> photo in public/photos (see scripts/fetch-photos.mjs and CREDITS.json). */
export const DEMO_PHOTOS = {
  'Qizil olma': 'qizil-olma', 'Yashil olma': 'yashil-olma', Banan: 'banan', Apelsin: 'apelsin', Mandarin: 'mandarin', Limon: 'limon',
  'Husayni uzumi': 'husayni-uzum', 'Kishmish uzum': 'kishmish-uzum', Qulupnay: 'qulupnay', Tarvuz: 'tarvuz', 'Qovun (Torpeda)': 'qovun',
  Shaftoli: 'shaftoli', Nok: 'nok', 'Anor (Qand-i-Surx)': 'anor', Kivi: 'kivi', Mango: 'mango', Ananas: 'ananas', Gilos: 'gilos',
  "O'rik": 'orik', "Olxo'ri": 'olxori', Anjir: 'anjir', Avokado: 'avokado', Malina: 'malina', "Ko'k rezavor": 'kok-rezavor',
};

/** Gives every demo fruit that has no photo yet its real photograph (safe to run on every start). */
export function ensureDemoPhotos() {
  for (const p of q.all('SELECT id, name FROM products WHERE id NOT IN (SELECT product_id FROM product_images)')) {
    const slug = DEMO_PHOTOS[p.name];
    if (slug && existsSync(resolve(PHOTO_DIR, `${slug}.jpg`))) q.run('INSERT INTO product_images (product_id, url, sort) VALUES (?,?,0)', p.id, `/photos/${slug}.jpg`);
  }
}
