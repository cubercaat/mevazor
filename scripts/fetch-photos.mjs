// Downloads one real photograph per fruit from Wikipedia / Wikimedia Commons (free licences) into public/photos
// and writes public/photos/CREDITS.json with author + licence for attribution.
//   node scripts/fetch-photos.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'photos');
mkdirSync(OUT, { recursive: true });

// slug -> English Wikipedia article whose lead image is a good photo of the fruit
const FRUITS = {
  'qizil-olma': 'Apple', 'yashil-olma': 'Granny Smith', banan: 'Banana', apelsin: 'Orange (fruit)', mandarin: 'Mandarin orange', limon: 'Lemon',
  'husayni-uzum': 'Grape', 'kishmish-uzum': 'Thompson Seedless', qulupnay: 'Strawberry', tarvuz: 'Watermelon', qovun: 'Cantaloupe', shaftoli: 'Peach',
  nok: 'Pear', anor: 'Pomegranate', kivi: 'Kiwifruit', mango: 'Mango', ananas: 'Pineapple', gilos: 'Cherry', orik: 'Apricot', olxori: 'Plum',
  anjir: 'Ficus carica', avokado: 'Avocado', malina: 'Raspberry', 'kok-rezavor': 'Blueberry',
};
// Where the Wikipedia lead image is an illustration or a weak crop, use a hand-picked Commons search result: [query, result index]
const PICKS = {
  anjir: ['fresh figs fruit', 1], kivi: ['kiwi fruits whole and cut', 0], shaftoli: ['peaches fruit', 0], qovun: ['cantaloupe melon fruit', 0],
  'husayni-uzum': ['red grapes bunch', 0], malina: ['raspberries fresh', 0], tarvuz: ['watermelon sliced', 1], banan: ['bananas bunch', 0],
  limon: ['lemons fruit', 0], mandarin: ['mandarins tangerines fruit', 2],
};
const API = 'https://en.wikipedia.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'MevazorDemo/1.0 (local development; contact: mamatqulovz601@gmail.com)' };
const j = async (u) => (await fetch(u, { headers: UA })).json();
const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const credit = (slug, file, title, meta) => ({
  file, source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
  author: strip(meta.Artist?.value), license: strip(meta.LicenseShortName?.value), licenseUrl: meta.LicenseUrl?.value ?? '',
});

async function picked(query, index) {
  const u = `${COMMONS}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=${encodeURIComponent(query + ' filetype:bitmap')}&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=900`;
  const r = await j(u);
  const pages = Object.values(r.query?.pages ?? {}).sort((a, b) => a.index - b.index).filter((p) => /jpeg/.test(p.imageinfo?.[0]?.mime));
  const p = pages[index];
  return { title: p.title.replace(/^File:/, ''), src: p.imageinfo[0].thumburl, meta: p.imageinfo[0].extmetadata ?? {} };
}
async function lead(title) {
  const q = await j(`${API}?action=query&format=json&redirects=1&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=thumbnail|name&pithumbsize=900`);
  const page = Object.values(q.query.pages)[0];
  if (!page.pageimage || !page.thumbnail?.source) throw new Error('no lead image');
  const info = await j(`${COMMONS}?action=query&format=json&titles=${encodeURIComponent('File:' + page.pageimage)}&prop=imageinfo&iiprop=extmetadata`);
  return { title: page.pageimage, src: page.thumbnail.source, meta: Object.values(info.query.pages)[0].imageinfo?.[0]?.extmetadata ?? {} };
}

const credits = {};
for (const [slug, article] of Object.entries(FRUITS)) {
  try {
    const p = PICKS[slug] ? await picked(...PICKS[slug]) : await lead(article);
    const res = await fetch(p.src, { headers: UA });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(resolve(OUT, `${slug}.jpg`), buf);
    credits[slug] = credit(slug, `${slug}.jpg`, p.title, p.meta);
    console.log(`✓ ${slug.padEnd(14)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB  ${credits[slug].license}  ${p.title}`);
  } catch (e) {
    console.log(`✗ ${slug}: ${e.message}`);
  }
}
writeFileSync(resolve(OUT, 'CREDITS.json'), JSON.stringify(credits, null, 2));
