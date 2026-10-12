// Builds the world food catalogue for R2 (src/world-foods.js) from the
// kCalori foods.sqlite release: node scripts/build-world-foods.mjs <foods.sqlite> <out-dir>
//
// R2 holds a few large pack files read with ranged GETs, so the upload is a
// handful of objects instead of millions of D1 rows. Layout under <version>/:
//   meta.json                 counts, sources and attributions
//   barcodes.idx.json         [pack,offset,length] of each of 10 000 gzip buckets
//   barcodes-<n>.pack         gzip NDJSON, bucket = digits 10-13 of the 14-digit code
//   names/<x>.json            index nodes for keys starting with x: key -> [pack,offset,length,leaf]
//   names-<n>.pack            gzip NDJSON, one member per node, best ranked first
// A node holds every food with a name or brand word starting with its key when
// they fit (leaf), else only the best ranked and the longer keys below it.
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { mkdirSync, openSync, writeSync, closeSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fold, words, barcodeKey, bucketOf, NODE_LIMIT, WORLD_FOODS_FORMAT } from "../src/world-foods.js";

const PACK_BYTES = 280 * 1024 * 1024; // under wrangler's 300 MiB upload limit
const MAX_WORDS = 8;
// Sources whose data may be passed on (sources.release_allowed); the
// uploaded kCalori list has no clear licence, NutriDatabaze forbids it.
const EXCLUDED = new Set(["legacy", "nutridatabaze"]);
const GENERIC = new Set(["fineli", "ciqual", "cofid", "usda_foundation", "usda_sr_legacy", "usda_survey"]);

const num = v => v == null ? null : Math.round(Number(v) * 100) / 100;

export function toRecord(row) {
  const r = { k: row.catalog_key, n: row.default_name };
  if (row.cs && row.cs !== row.default_name) r.cs = row.cs;
  if (row.en && row.en !== row.default_name) r.en = row.en;
  if (row.brand) r.br = row.brand;
  if (row.barcode) r.b = row.barcode;
  if (row.basis_unit === "ml") r.u = "ml";
  r.e = num(row.kcal); r.p = num(row.protein); r.c = num(row.carbs); r.f = num(row.fat);
  for (const [key, col] of [["fi", "fiber"], ["su", "sugars"], ["sa", "salt"]]) if (row[col] != null) r[key] = num(row[col]);
  if (row.quantity) r.q = row.quantity;
  if (row.serving_size) r.ss = row.serving_size;
  r.s = row.source_id;
  if (row.cz) r.cz = 1;
  return r;
}

// 0 sold in Czechia, 1 Czech name, 2 food composition table, 3 English name, 4 other.
export function rankOf(row) {
  if (row.cz) return 0;
  if (row.cs) return 1;
  if (GENERIC.has(row.source_id)) return 2;
  if (row.en) return 3;
  return 4;
}

export function indexWords(row) {
  const brand = String(row.brand || "").split(",")[0];
  const out = [];
  for (const text of [row.cs, row.en, row.default_name, brand]) for (const w of words(text)) if (!out.includes(w)) out.push(w);
  return out.slice(0, MAX_WORDS);
}

class Packs {
  constructor(dir, prefix) { this.dir = dir; this.prefix = prefix; this.n = -1; this.fd = null; this.offset = PACK_BYTES; this.files = []; }
  write(buf) {
    if (this.offset + buf.length > PACK_BYTES) {
      if (this.fd != null) closeSync(this.fd);
      this.n++; this.offset = 0;
      const name = `${this.prefix}-${this.n}.pack`;
      this.files.push(name); this.fd = openSync(join(this.dir, name), "w");
    }
    writeSync(this.fd, buf);
    const at = [this.n, this.offset, buf.length];
    this.offset += buf.length;
    return at;
  }
  close() { if (this.fd != null) closeSync(this.fd); }
}

export function build(source, out, { log = console.log, version = new Date().toISOString().slice(0, 10).replace(/-/g, "") } = {}) {
  const dir = join(out, version);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "names"), { recursive: true });
  const work = join(out, `work-${version}.sqlite`);
  if (existsSync(work)) rmSync(work);
  const src = new DatabaseSync(source, { readOnly: true });
  const db = new DatabaseSync(work);
  db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE; PRAGMA cache_size=-200000;
    CREATE TABLE rec(id INTEGER PRIMARY KEY, bkey TEXT, rank INTEGER NOT NULL, json TEXT NOT NULL);
    CREATE TABLE post(word TEXT NOT NULL, rank INTEGER NOT NULL, id INTEGER NOT NULL);`);
  const name = lang => `(SELECT name FROM food_names WHERE food_id=f.id AND lower(lang)='${lang}' ORDER BY is_primary DESC, id LIMIT 1)`;
  const rows = src.prepare(`SELECT f.*, ${name("cs")} AS cs, ${name("en")} AS en,
      EXISTS(SELECT 1 FROM food_markets m WHERE m.food_id=f.id AND m.country_tag='en:czech-republic') AS cz
    FROM foods f WHERE f.search_enabled=1 AND f.kcal IS NOT NULL AND f.protein IS NOT NULL AND f.carbs IS NOT NULL AND f.fat IS NOT NULL
    ORDER BY f.id`);
  const addRec = db.prepare("INSERT INTO rec(id,bkey,rank,json) VALUES(?,?,?,?)");
  const addPost = db.prepare("INSERT INTO post(word,rank,id) VALUES(?,?,?)");
  const counts = { foods: 0, czech_market: 0, barcodes: 0, words: 0, by_source: {} };
  db.exec("BEGIN");
  for (const row of rows.iterate()) {
    if (EXCLUDED.has(row.source_id)) continue;
    const rec = toRecord(row), rank = rankOf(row), key = barcodeKey(row.barcode);
    const ws = indexWords(row);
    rec.t = ws.join(" "); rec.r = rank;
    addRec.run(row.id, key, rank, JSON.stringify(rec));
    for (const w of ws) addPost.run(w, rank, row.id);
    counts.foods++; counts.words += ws.length; if (key) counts.barcodes++; if (row.cz) counts.czech_market++;
    counts.by_source[row.source_id] = (counts.by_source[row.source_id] || 0) + 1;
    if (counts.foods % 250000 === 0) { db.exec("COMMIT; BEGIN"); log(`${counts.foods} foods`); }
  }
  db.exec("COMMIT");
  log(`${counts.foods} foods, ${counts.words} index words; indexing`);
  db.exec("CREATE INDEX rec_bkey ON rec(bkey) WHERE bkey IS NOT NULL; CREATE INDEX post_word ON post(word, rank, id);");

  // Barcodes: one gzip member per bucket, records without the search fields.
  const bpacks = new Packs(dir, "barcodes"), index = [];
  let bucket = -1, lines = [], bbytes = 0;
  const flush = () => {
    if (bucket < 0) return;
    index[bucket] = bpacks.write(gzipSync(lines.join("\n"))); bbytes += index[bucket][2]; lines = [];
  };
  for (const r of db.prepare("SELECT bkey, json FROM rec WHERE bkey IS NOT NULL ORDER BY substr(bkey,10,4), bkey").iterate()) {
    const b = bucketOf(r.bkey);
    if (b !== bucket) { flush(); bucket = b; }
    const rec = JSON.parse(r.json); delete rec.t; delete rec.r;
    lines.push(JSON.stringify(rec));
  }
  flush(); bpacks.close();
  for (let i = 0; i < 10000; i++) if (!index[i]) index[i] = [0, 0, 0];
  writeFileSync(join(dir, "barcodes.idx.json"), JSON.stringify(index));
  log(`barcodes ${(bbytes / 1048576).toFixed(0)} MB in ${bpacks.files.length} pack(s)`);

  // Names: nodes split by the next character until they fit NODE_LIMIT.
  const packs = new Packs(dir, "names"), manifests = new Map();
  const count = db.prepare("SELECT COUNT(DISTINCT id) AS n FROM post WHERE word >= ? AND word < ?");
  const best = db.prepare(`SELECT r.json FROM (SELECT id, MIN(rank) AS rank FROM post WHERE word >= ? AND word < ? GROUP BY id ORDER BY rank, id LIMIT ?) p JOIN rec r ON r.id=p.id ORDER BY p.rank, p.id`);
  const children = db.prepare("SELECT DISTINCT substr(word, 1, ?) AS k FROM post WHERE word >= ? AND word < ?");
  const end = key => key + "￿";
  let nodes = 0, bytes = 0;
  const emit = (key, jsonRows, leaf) => {
    const at = packs.write(gzipSync(jsonRows.map(r => r.json).join("\n")));
    const shard = key[0];
    if (!manifests.has(shard)) manifests.set(shard, {});
    manifests.get(shard)[key] = [...at, leaf ? 1 : 0];
    nodes++; bytes += at[2];
  };
  const visit = key => {
    const n = count.get(key, end(key)).n;
    if (n <= NODE_LIMIT || key.length >= 24) { emit(key, best.all(key, end(key), NODE_LIMIT), true); return; }
    emit(key, best.all(key, end(key), NODE_LIMIT), false);
    for (const { k } of children.all(key.length + 1, key, end(key))) if (k.length > key.length) visit(k);
  };
  const roots = db.prepare("SELECT DISTINCT substr(word, 1, 3) AS k FROM post ORDER BY k").all();
  for (const { k } of roots) {
    visit(k);
    if (nodes % 5000 < 3) log(`${nodes} name nodes`);
  }
  packs.close();
  for (const [shard, nodesOf] of manifests) writeFileSync(join(dir, "names", `${shard}.json`), JSON.stringify(nodesOf));
  log(`${nodes} name nodes, ${(bytes / 1048576).toFixed(0)} MB in ${packs.files.length} pack(s)`);

  const sources = src.prepare("SELECT id, title, url, license, license_url, version FROM sources WHERE release_allowed=1").all()
    .filter(s => !EXCLUDED.has(s.id) && counts.by_source[s.id]);
  const meta = { format: WORLD_FOODS_FORMAT, version, created_utc: new Date().toISOString(), node_limit: NODE_LIMIT,
    license: "ODbL-1.0 (database); individual source attributions below", counts, sources, files: [...bpacks.files, ...packs.files] };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 1));
  src.close(); db.close(); rmSync(work);
  return { dir, meta };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("build-world-foods.mjs")) {
  const [source, out] = process.argv.slice(2);
  if (!source || !out) { console.error("Usage: node scripts/build-world-foods.mjs <foods.sqlite> <out-dir>"); process.exit(2); }
  const { dir, meta } = build(source, out);
  console.log(`Done: ${dir} (${meta.counts.foods} foods)`);
}
