// A new version of the world food catalogue (src/world-foods.js) from a fresh
// Open Food Facts export and the version that is live now:
//   node scripts/refresh-world-foods.mjs <previous-version-dir|none> <off.ndjson.gz> <out-dir> [--version v] [--off-date yyyy-mm-dd]
// Runs every 14 days in .github/workflows/food-catalog-refresh.yml.
//   - Open Food Facts products come from the export (scripts/export-off.py), so
//     new products, corrected values and deleted products follow OFF.
//   - Every other source (USDA, Fineli, Ciqual, CoFID) is carried over record by
//     record from the previous version: those tables change once a year at most,
//     and their Czech names come from the kCalori release, not from the tables.
//   - Czech and English names of an OFF product that the export lacks are kept
//     from the previous version.
// checkCounts then refuses a version much smaller than the previous one, so a
// broken export never replaces a good catalogue.
import { closeSync, createReadStream, existsSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip, gunzipSync } from "node:zlib";
import { buildRows } from "./build-world-foods.mjs";
import { barcodeKey, searchWorldFoods, WORLD_FOODS_FORMAT } from "../src/world-foods.js";

export const NAME_SHARDS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
export const OFF_SOURCE = {
  id: "off", title: "Open Food Facts contributors", url: "https://world.openfoodfacts.org/",
  license: "ODbL-1.0", license_url: "https://opendatacommons.org/licenses/odbl/1-0/"
};
// Least share of the previous version a new one must keep.
export const MIN_SHARE = { foods: 0.9, barcodes: 0.9, czech_market: 0.85, carried: 0.97 };

const clean = (v, max) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
const round = v => Math.round(Number(v) * 100) / 100;
const inRange = (v, max) => v != null && Number.isFinite(v) && v >= 0 && v <= max;

// The catalog_key of an OFF code: numeric codes as a 14-digit GTIN (as in the
// kCalori release, short codes too), anything else under off:.
export function offKey(code) {
  const c = String(code ?? "").trim();
  if (!c || c.length > 40) return null;
  if (/^\d+$/.test(c)) return c.length <= 14 ? "gtin:" + c.padStart(14, "0") : null;
  return /^[\w.-]+$/.test(c) ? "off:" + c : null;
}

// One exported product (scripts/export-off.py) as a build row, or null when
// it lacks a name, a key or plausible energy and macros per 100 g.
export function offRow(p) {
  const key = offKey(p?.code);
  if (!key) return null;
  const names = {};
  for (const n of Array.isArray(p.names) ? p.names : []) if (n?.lang && !names[n.lang]) names[n.lang] = clean(n.text, 200);
  const main = names.main, lang = String(p.lang || "");
  const cs = names.cs || (lang === "cs" ? main : null), en = names.en || (lang === "en" ? main : null);
  const name = main || en || cs;
  if (!name) return null;
  const v = {};
  for (const x of Array.isArray(p.n) ? p.n : []) if (x?.k && v[x.k] == null && Number.isFinite(Number(x.v))) v[x.k] = Number(x.v);
  const kcal = v["energy-kcal"] ?? (v.energy != null ? v.energy / 4.184 : null);
  const protein = v.proteins, carbs = v.carbohydrates, fat = v.fat;
  if (!inRange(kcal, 950) || !inRange(protein, 100) || !inRange(carbs, 100) || !inRange(fat, 100) || protein + carbs + fat > 105) return null;
  const optional = x => inRange(x, 100) ? round(x) : null;
  return {
    catalog_key: key, source_id: "off", default_name: name, cs, en,
    brand: clean(String(p.brands || "").split(",").map(b => b.trim()).filter(Boolean).join(", "), 120),
    barcode: key.startsWith("gtin:") ? String(p.code).trim() : null,
    basis_unit: String(p.unit || "").toLowerCase() === "ml" ? "ml" : "g",
    kcal: round(kcal), protein: round(protein), carbs: round(carbs), fat: round(fat),
    fiber: optional(v.fiber), sugars: optional(v.sugars), salt: optional(v.salt),
    quantity: clean(p.quantity, 60), serving_size: clean(p.serving_size, 60), cz: p.cz ? 1 : 0
  };
}

// A record of a built version back as a build row; its rank comes along,
// because a Czech name equal to the default name is not stored twice.
export function rowOf(r) {
  return {
    catalog_key: r.k, source_id: r.s, default_name: r.n, cs: r.cs ?? null, en: r.en ?? null, brand: r.br ?? null,
    barcode: r.b ?? null, basis_unit: r.u === "ml" ? "ml" : "g", kcal: r.e, protein: r.p, carbs: r.c, fat: r.f,
    fiber: r.fi ?? null, sugars: r.su ?? null, salt: r.sa ?? null, quantity: r.q ?? null, serving_size: r.ss ?? null,
    cz: r.cz ? 1 : 0, ...(r.r != null ? { rank: r.r } : {})
  };
}

// Every record of a built version once: the name nodes first, as their records
// carry the rank, then the barcode buckets. A food whose words all sit only in
// nodes too full to hold it (and that has no barcode) was never stored, so it
// cannot be carried over either; checkCounts allows for that.
export function* versionRecords(dir) {
  const slices = [];
  for (const s of NAME_SHARDS) {
    const file = join(dir, "names", `${s}.json`);
    if (!existsSync(file)) continue;
    for (const [pack, offset, length] of Object.values(JSON.parse(readFileSync(file, "utf8")))) if (length) slices.push([`names-${pack}.pack`, offset, length]);
  }
  slices.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  const barcodes = JSON.parse(readFileSync(join(dir, "barcodes.idx.json"), "utf8")).filter(x => x[2]).map(([p, o, l]) => [`barcodes-${p}.pack`, o, l]);
  barcodes.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  const seen = new Set();
  for (const [file, offset, length] of [...slices, ...barcodes]) {
    const fd = openSync(join(dir, file), "r");
    try {
      const buf = Buffer.alloc(length);
      readSync(fd, buf, 0, length, offset);
      for (const line of gunzipSync(buf).toString("utf8").split("\n")) {
        if (!line) continue;
        const r = JSON.parse(line);
        if (seen.has(r.k)) continue;
        seen.add(r.k);
        yield r;
      }
    } finally { closeSync(fd); }
  }
}

export async function* ndjson(file) {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    // DuckDB writes non-finite floats as bare Infinity / NaN (export-off.py drops them).
    try { yield JSON.parse(line); } catch { yield JSON.parse(line.replace(/:\s*(-?Infinity|NaN)\b/g, ":null")); }
  }
}

// Rows of the new version: the carried-over records, then the OFF products.
export async function collect(previous, products, log = console.log) {
  const carried = [], names = new Map(), taken = new Set();
  const stats = { carried: 0, previous_off: 0, off: 0, off_skipped: 0, off_duplicate: 0, off_behind_other_source: 0, names_kept: 0 };
  for (const r of previous) {
    if (r.s === "off") {
      stats.previous_off++;
      if (r.cs || r.en) names.set(r.k, [r.cs ?? null, r.en ?? null]);
      continue;
    }
    carried.push(rowOf(r)); taken.add(r.k); stats.carried++;
  }
  log(`previous version: ${stats.carried} foods carried over, ${stats.previous_off} Open Food Facts products replaced by the export`);
  const off = [], seenOff = new Set();
  for await (const p of products) {
    const row = offRow(p);
    if (!row) { stats.off_skipped++; continue; }
    // A barcode another source already holds (USDA Branded) stays with it.
    if (taken.has(row.catalog_key)) { stats.off_behind_other_source++; continue; }
    // Two OFF codes for one GTIN ("0123…" and "123…"): the first stays.
    if (seenOff.has(row.catalog_key)) { stats.off_duplicate++; continue; }
    seenOff.add(row.catalog_key);
    const old = names.get(row.catalog_key);
    if (old && ((!row.cs && old[0]) || (!row.en && old[1]))) { row.cs ||= old[0]; row.en ||= old[1]; stats.names_kept++; }
    off.push(row); stats.off++;
    if (stats.off % 500000 === 0) log(`${stats.off} Open Food Facts products`);
  }
  let id = 0;
  const rows = [...carried, ...off];
  for (const r of rows) r.id = ++id;
  return { rows, stats };
}

// Problems that stop the upload, compared with the previous version's counts.
export function checkCounts(previous, next) {
  const problems = [];
  for (const key of ["foods", "barcodes", "czech_market"]) {
    const was = previous?.[key] || 0;
    if (was && (next[key] || 0) < was * MIN_SHARE[key]) problems.push(`${key}: ${next[key] || 0}, previous ${was} (needs ${Math.round(MIN_SHARE[key] * 100)} %)`);
  }
  for (const [source, was] of Object.entries(previous?.by_source || {})) {
    if (source === "off") continue;
    const now = next.by_source?.[source] || 0;
    if (now < was * MIN_SHARE.carried) problems.push(`${source}: ${now} foods, previous ${was}`);
  }
  if (!next.by_source?.off) problems.push("no Open Food Facts products");
  return problems;
}

// A few foods of the new version looked up the way the Worker does, from the files.
export async function smoke(dir, version, records) {
  const bucket = {
    async get(key, options = {}) {
      let data;
      if (key === "current.json") data = Buffer.from(JSON.stringify({ format: WORLD_FOODS_FORMAT, version }));
      else if (key.startsWith(version + "/") && existsSync(join(dir, key.slice(version.length + 1)))) data = readFileSync(join(dir, key.slice(version.length + 1)));
      else return null;
      if (options.range) data = data.subarray(options.range.offset, options.range.offset + options.range.length);
      return { body: new Blob([data]).stream(), json: async () => JSON.parse(data.toString("utf8")) };
    }
  };
  const env = { FOOD_CATALOG_R2: bucket }, problems = [];
  for (const r of records) {
    const hits = await searchWorldFoods(env, { barcode: r.barcode, language: "cs" });
    if (!hits.some(h => h.catalog_key === r.catalog_key)) problems.push(`barcode ${r.barcode} (${r.catalog_key}) not found`);
  }
  return problems;
}

// previousDir "none" builds from the export alone (the dry run of a pull request).
export async function refresh({ previousDir, offFile, out, version, offDate, log = console.log }) {
  const meta = previousDir === "none" ? { format: WORLD_FOODS_FORMAT, version: null, counts: null, sources: [] } : JSON.parse(readFileSync(join(previousDir, "meta.json"), "utf8"));
  if (meta.format !== WORLD_FOODS_FORMAT) throw new Error(`Previous version has format ${meta.format}, expected ${WORLD_FOODS_FORMAT}`);
  if (version === meta.version) throw new Error(`Version ${version} is the live one; pick another`);
  log(`previous version ${meta.version}: ${JSON.stringify(meta.counts)}`);
  const { rows, stats } = await collect(previousDir === "none" ? [] : versionRecords(previousDir), ndjson(offFile), log);
  log(`new version: ${JSON.stringify(stats)}`);
  // Czech products with a barcode, spread over the list, for the smoke test.
  const withCode = rows.filter(r => r.cz && barcodeKey(r.barcode)), probes = withCode.filter((_, i) => i % Math.max(1, Math.floor(withCode.length / 20)) === 0).slice(0, 20);
  const sources = [{ ...OFF_SOURCE, version: offDate || null }, ...(meta.sources || []).filter(s => s.id !== "off")];
  const built = buildRows(rows, sources, out, { log, version });
  rows.length = 0;
  built.meta.refresh = { previous: meta.version, ...stats };
  writeFileSync(join(built.dir, "meta.json"), JSON.stringify(built.meta, null, 1));
  const problems = [...checkCounts(meta.counts, built.meta.counts), ...await smoke(built.dir, version, probes)];
  return { ...built, previous: meta, stats, problems };
}

if (process.argv[1]?.endsWith("refresh-world-foods.mjs")) {
  const args = process.argv.slice(2), flag = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const version = flag("--version") || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const offDate = flag("--off-date");
  const [previousDir, offFile, out] = args;
  if (!previousDir || !offFile || !out) {
    console.error("Usage: node scripts/refresh-world-foods.mjs <previous-version-dir|none> <off.ndjson.gz> <out-dir> [--version v] [--off-date yyyy-mm-dd]");
    process.exit(2);
  }
  const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
  try {
    const { dir, meta, problems } = await refresh({ previousDir, offFile, out, version, offDate, log });
    log(`counts: ${JSON.stringify(meta.counts)}`);
    if (problems.length) { console.error(`The new version is not uploaded:\n${problems.join("\n")}`); process.exit(1); }
    log(`Done: ${dir}`);
  } catch (e) {
    console.error(e.stack || e.message);
    process.exit(1);
  }
}
