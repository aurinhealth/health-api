// The world food catalogue (kCalori: Open Food Facts, USDA, Fineli, Ciqual,
// CoFID; about 3.4 million foods) read from R2. scripts/build-world-foods.mjs
// writes it as a few large pack files, so it costs no D1 rows: a barcode is one
// ranged read, a name one index read plus one ranged read. The catalogue is
// read only; foods users add or correct stay in D1 (personal-foods.js,
// shared-foods.js) and are listed before it. Its Open Food Facts products are
// replaced every 14 days (scripts/refresh-world-foods.mjs).
import { lang } from './lang.js';
import { searchStaples } from './staples.js';

export const WORLD_FOODS_FORMAT = 1;
export const NODE_LIMIT = 1500;
const RESULTS = 12;
// Which foods come first: cz for Czech and Slovak phones (products sold there,
// Czech names), intl for everyone else (food tables, English names, no country
// first). The app sends it (Settings > Food > Food database); an older build
// gets it from the app language.
export const MARKETS = ['cz', 'intl'];
export const marketOf = (value, language = lang()) => MARKETS.includes(value) ? value : String(language).toLowerCase().startsWith('en') ? 'intl' : 'cz';
// A word in fewer foods than this is not offered as a typo fix (vocab/<x>.json).
export const TYPO_MIN_FOODS = 20;
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

// Micronutrients per 100 g (scripts/build-micronutrients.mjs) sit beside the
// catalogue in 256 small JSON shards under micros/<version>/, so the script and
// the Worker must agree on the shard of a key: FNV-1a 32-bit of the (ASCII)
// catalog_key, mod 256, as 000-255.
export const MICROS_FORMAT = 1;
export function microShard(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return String((h >>> 0) % 256).padStart(3, '0');
}

// Small JSON objects (version, indexes, micronutrient shards) stay in the isolate's memory.
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
// A pack's slice never changes within a version (the key carries it), so the
// decoded rows stay in the isolate (typing "jog", "jogu", "jogurt" reads one
// node) and the text in the data centre's cache for other isolates.
const decoded = new WeakMap();
const NODES_KEPT = 40;
async function gzipLines(bucket, key, offset, length, store = globalThis.caches?.default) {
  if (!length) return [];
  const id = `${key}@${offset}+${length}`;
  if (!decoded.has(bucket)) decoded.set(bucket, new Map());
  const nodes = decoded.get(bucket);
  if (nodes.has(id)) { const rows = nodes.get(id); nodes.delete(id); nodes.set(id, rows); return rows; }
  const url = 'https://world-foods.internal/' + encodeURIComponent(id);
  let text = await store?.match(url).then(r => r?.text()).catch(() => null);
  if (text == null) {
    const o = await bucket.get(key, { range: { offset, length } });
    if (!o) return [];
    text = await new Response(o.body.pipeThrough(new DecompressionStream('gzip'))).text();
    await store?.put(url, new Response(text, { headers: { 'Cache-Control': 'max-age=86400' } })).catch(() => {});
  }
  const rows = text ? text.split('\n').map(line => JSON.parse(line)) : [];
  nodes.set(id, rows);
  if (nodes.size > NODES_KEPT) nodes.delete(nodes.keys().next().value);
  return rows;
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

// Optimal string alignment distance, or max + 1 once it is over max.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = [], prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      if (d < low) low = d;
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = row;
  }
  return prev[b.length];
}
const within = (short, long) => { let i = 0; for (const ch of long) if (ch === short[i]) i++; return i === short.length; };
// Letters one word has more of than the other: never more than their distance.
const letters = w => { const h = new Int8Array(36); for (let i = 0; i < w.length; i++) h[w.charCodeAt(i) - (w.charCodeAt(i) >= 97 ? 97 : 22)]++; return h; };
function bagOver(h, w, max) {
  const g = h.slice();
  let more = 0;
  for (let i = 0; i < w.length; i++) if (--g[w.charCodeAt(i) - (w.charCodeAt(i) >= 97 ? 97 : 22)] < 0 && ++more > max) return true;
  let less = 0;
  for (const n of g) if (n > 0 && (less += n) > max) return true;
  return false;
}

// "cofee" -> "coffee": a word of 4+ letters that 20 times more foods spell one
// or two letters differently (missing, extra, swapped or wrong). The foods of
// longer words it starts count for it, so a word still being typed stays; a
// word of a Czech name is never changed. vocab: vocab/<first letter>.json.
const vocabLists = new WeakMap();
function listed(vocab) {
  if (!vocabLists.has(vocab)) {
    const sorted = Object.entries(vocab).map(([w, v]) => [w, Array.isArray(v) ? v[0] : v]).sort((a, b) => a[0] < b[0] ? -1 : 1);
    const byLength = [];
    for (const e of sorted) (byLength[e[0].length] ||= []).push(e);
    vocabLists.set(vocab, { sorted, byLength });
  }
  return vocabLists.get(vocab);
}
export function correctWord(word, vocab) {
  if (!vocab || word.length < 4 || /\d/.test(word)) return word;
  const own = vocab[word];
  if (Array.isArray(own)) return word;
  const { sorted, byLength } = listed(vocab);
  // A word not listed is in fewer than TYPO_MIN_FOODS foods.
  let started = own ?? TYPO_MIN_FOODS - 1, lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid][0] <= word) lo = mid + 1; else hi = mid; }
  for (let i = lo; i < sorted.length && sorted[i][0].startsWith(word); i++) started += sorted[i][1];
  const need = 20 * started, h = letters(word);
  let best = null;
  for (let len = word.length - 2; len <= word.length + 2; len++) for (const [w, n] of byLength[len] || []) {
    if (n < need || w === word || w.startsWith(word) || bagOver(h, w, 2)) continue;
    const d = distance(word, w, 2);
    if (d > 2) continue;
    // A letter left out is the usual slip: "cofe" is coffee before cafe.
    const score = n * (d === 1 ? 4 : 1) * (within(word, w) ? 4 : 1);
    if (!best || score > best.score) best = { w, score };
  }
  return best ? best.w : word;
}

// Basic foods from the food tables come first (staples.js), then the catalogue
// without them.
export async function searchWorldFoods(env, { name = '', barcode = '', language = lang(), market } = {}) {
  market = marketOf(market, language);
  // The basic foods need no R2: a failed catalogue read still lists them.
  const found = await catalogueFoods(env, { name, barcode, language, market }).catch(error => {
    if (barcode) throw error;
    console.error('world catalogue', error?.message);
    const typed = [...new Set(words(name))];
    return { foods: [], query: typed, typed };
  });
  if (barcode) return found.foods;
  const basic = searchStaples(found.query, name, language);
  const staples = basic.length ? basic : searchStaples(found.typed, name, language);
  const keys = new Set(staples.map(p => p.catalog_key));
  return [...staples, ...found.foods.filter(p => !keys.has(p.catalog_key))];
}

async function catalogueFoods(env, { name, barcode, language, market }) {
  const typed = [...new Set(words(name))], none = { foods: [], query: typed, typed };
  const bucket = env.FOOD_CATALOG_R2;
  if (!bucket) return none;
  const current = await json(bucket, 'current.json');
  const version = current?.format === WORLD_FOODS_FORMAT ? current.version : null;
  if (!version) return none;
  const code = barcodeKey(barcode);
  if (code) {
    const index = await json(bucket, `${version}/barcodes.idx.json`);
    const [pack, offset, length] = index?.[bucketOf(code)] || [0, 0, 0];
    const rows = await gzipLines(bucket, `${version}/barcodes-${pack}.pack`, offset, length);
    return { ...none, foods: rows.filter(r => barcodeKey(r.b) === code).slice(0, RESULTS).map(r => toProduct(r, language)) };
  }
  if (barcode) return none;
  const query = await Promise.all(typed.map(async w => w.length < 4 ? w : correctWord(w, await json(bucket, `${version}/vocab/${w[0]}.json`))));
  let start = fold(name).trim();
  typed.forEach((w, i) => { if (query[i] !== w) start = start.replace(new RegExp(`\\b${w}\\b`), query[i]); });
  const found = await namesFound(bucket, version, query, start, language, market);
  // A fixed word that finds nothing: the words as typed.
  if (found.length || query.every((w, i) => w === typed[i])) return { foods: found, query, typed };
  return { foods: await namesFound(bucket, version, typed, fold(name).trim(), language, market), query: typed, typed };
}

async function namesFound(bucket, version, query, start, language, market) {
  // The longest word narrows the most; a catalogue word needs 3 letters.
  const longest = query.reduce((a, b) => b.length > a.length ? b : a, '');
  if (longest.length < 3) return [];
  const node = await nodeFor(bucket, version, longest);
  if (!node) return [];
  const [pack, offset, length] = node;
  const rows = await gzipLines(bucket, `${version}/names-${pack}.pack`, offset, length);
  const hits = [];
  for (const r of rows) {
    const ws = r.t.split(' ');
    if (!query.every(q => ws.some(w => w.startsWith(q)))) continue;
    const product = toProduct(r, language);
    // The market's rank first (scripts/build-world-foods.mjs rankOf and
    // intlRankOf; a version built before ri has only r), then a name that
    // starts with the query, then a shorter name. A node holds both markets'
    // best, so every row is scored, not the first few hundred.
    const rank = (market === 'intl' ? r.ri ?? r.r : r.r) ?? 4;
    hits.push({ product, score: rank * 1e6 + (fold(product.name).startsWith(start) ? 0 : 1) * 1000 + Math.min(product.name.length, 999), at: hits.length });
  }
  return hits.sort((a, b) => a.score - b.score || a.at - b.at).slice(0, RESULTS).map(h => h.product);
}

// catalog_key -> { fe, ca, ..., x } for the keys that have values (x: 1 marks
// an estimate from a matching generic food). One read per shard touched.
export async function microsFor(env, keys) {
  const out = new Map(), bucket = env.FOOD_CATALOG_R2;
  if (!bucket || !keys?.length) return out;
  const current = await json(bucket, 'micros/current.json');
  if (current?.format !== MICROS_FORMAT || !current.version) return out;
  const shards = new Map();
  for (const key of new Set(keys)) {
    if (typeof key !== 'string' || !key) continue;
    const s = microShard(key);
    if (!shards.has(s)) shards.set(s, []);
    shards.get(s).push(key);
  }
  await Promise.all([...shards].map(async ([s, list]) => {
    const data = await json(bucket, `micros/${current.version}/${s}.json`);
    for (const key of list) if (data && Object.hasOwn(data, key)) out.set(key, data[key]);
  }));
  return out;
}
