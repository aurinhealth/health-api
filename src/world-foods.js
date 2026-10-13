// The world food catalogue (kCalori: Open Food Facts, USDA, Fineli, Ciqual,
// CoFID; about 3.4 million foods) read from R2. scripts/build-world-foods.mjs
// writes it as a few large pack files, so it costs no D1 rows: a barcode is one
// ranged read, a name one index read plus one ranged read. The catalogue is
// read only; foods users add or correct stay in D1 (personal-foods.js,
// shared-foods.js) and are listed before it.
import { lang } from './lang.js';

export const WORLD_FOODS_FORMAT = 1;
export const NODE_LIMIT = 1500;
const RESULTS = 12;
const TTL_MS = 10 * 60 * 1000;

const SOURCE_NAMES = {
  off: 'Open Food Facts', fineli: 'Fineli (THL)', ciqual: 'Ciqual (Anses)', cofid: 'CoFID (McCance and Widdowson)',
  usda_foundation: 'USDA FoodData Central', usda_sr_legacy: 'USDA FoodData Central', usda_survey: 'USDA FoodData Central', usda_branded: 'USDA FoodData Central'
};

// Lower case without diacritics; words are runs of a-z and 0-9.
export const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const words = s => fold(s).match(/[a-z0-9]+/g)?.filter(w => w.length >= 2) || [];

// 8 to 14 digits padded to a 14-digit GTIN, as in the release.
export function barcodeKey(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits.padStart(14, '0') : null;
}
// Digits 10-13 (before the check digit) spread codes evenly over 10 000 buckets.
export const bucketOf = key => Number(key.slice(9, 13));

// Small JSON objects (version, indexes) stay in the isolate's memory.
const caches = new WeakMap();
async function json(bucket, key) {
  if (!caches.has(bucket)) caches.set(bucket, new Map());
  const cache = caches.get(bucket), hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const o = await bucket.get(key), value = o ? await o.json() : null;
  if (cache.size > 100) cache.clear();
  cache.set(key, { value, until: Date.now() + TTL_MS });
  return value;
}
async function gzipLines(bucket, key, offset, length) {
  if (!length) return [];
  const o = await bucket.get(key, { range: { offset, length } });
  if (!o) return [];
  const text = await new Response(o.body.pipeThrough(new DecompressionStream('gzip'))).text();
  return text ? text.split('\n').map(line => JSON.parse(line)) : [];
}

// The record in the shape of food-sources.js productFromLabel.
export function toProduct(r, language = lang()) {
  const name = language === 'en' ? (r.en || r.n) : (r.cs || r.en || r.n);
  return {
    barcode: r.b || null,
    name,
    brand: r.br || '',
    serving_size: r.ss || '',
    quantity: r.q || '',
    piece_size: '',
    preferred_unit: null,
    nutrition_basis: r.u === 'ml' ? 'ml' : 'g',
    calories_100g: r.e ?? null,
    protein_100g: r.p ?? null,
    carbs_100g: r.c ?? null,
    fat_100g: r.f ?? null,
    sugars_100g: r.su ?? null,
    fiber_100g: r.fi ?? null,
    salt_100g: r.sa ?? null,
    source: 'catalog',
    source_name: SOURCE_NAMES[r.s] || r.s,
    source_url: r.s === 'off' && r.b ? `https://world.openfoodfacts.org/product/${encodeURIComponent(r.b)}` : null,
    catalog_key: r.k,
    confidence: 'catalog',
    label_verified: false
  };
}

// The index node for a query word: the deepest key that starts it.
async function nodeFor(bucket, version, word) {
  const manifest = await json(bucket, `${version}/names/${word[0]}.json`);
  if (!manifest) return null;
  let key = word.slice(0, 3);
  for (;;) {
    const node = manifest[key];
    if (!node) return null;
    if (node[3] || key === word) return node;
    key = word.slice(0, key.length + 1);
  }
}

export async function searchWorldFoods(env, { name = '', barcode = '', language = lang() } = {}) {
  const bucket = env.FOOD_CATALOG_R2;
  if (!bucket) return [];
  const current = await json(bucket, 'current.json');
  const version = current?.format === WORLD_FOODS_FORMAT ? current.version : null;
  if (!version) return [];
  const code = barcodeKey(barcode);
  if (code) {
    const index = await json(bucket, `${version}/barcodes.idx.json`);
    const [pack, offset, length] = index?.[bucketOf(code)] || [0, 0, 0];
    const rows = await gzipLines(bucket, `${version}/barcodes-${pack}.pack`, offset, length);
    return rows.filter(r => barcodeKey(r.b) === code).slice(0, RESULTS).map(r => toProduct(r, language));
  }
  if (barcode) return [];
  const query = [...new Set(words(name))];
  // The longest word narrows the most; a catalogue word needs 3 letters.
  const longest = query.reduce((a, b) => b.length > a.length ? b : a, '');
  if (longest.length < 3) return [];
  const node = await nodeFor(bucket, version, longest);
  if (!node) return [];
  const [pack, offset, length] = node;
  const rows = await gzipLines(bucket, `${version}/names-${pack}.pack`, offset, length);
  const start = fold(name).trim();
  const hits = [];
  for (const r of rows) {
    const ws = r.t.split(' ');
    if (!query.every(q => ws.some(w => w.startsWith(q)))) continue;
    const product = toProduct(r, language);
    // Rank first (sold in Czechia, Czech name, food tables, English name),
    // then a name that starts with the query, then a shorter name.
    hits.push({ product, score: (r.r ?? 4) * 1e6 + (fold(product.name).startsWith(start) ? 0 : 1) * 1000 + Math.min(product.name.length, 999), at: hits.length });
    if (hits.length >= 400) break;
  }
  return hits.sort((a, b) => a.score - b.score || a.at - b.at).slice(0, RESULTS).map(h => h.product);
}
