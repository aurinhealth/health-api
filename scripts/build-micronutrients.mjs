// Vitamins and minerals per 100 g for the world food catalogue
// (src/world-foods.js), from the open composition tables the catalogue's
// generic foods come from, plus estimates for single-ingredient products:
//   node scripts/build-micronutrients.mjs <work-dir> <out-dir> [--upload] [--bucket name] [--version v]
// Needs network access to the publishers and R2 (wrangler signed in, or
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID), so it runs in
// .github/workflows/food-micros.yml. The catalogue has only macros, so:
//   1. USDA FoodData Central (SR Legacy, Foundation, FNDDS survey), Fineli,
//      Ciqual and CoFID are downloaded and their values mapped to NUTRIENTS;
//   2. the current catalogue is read from R2 (every pack, deduplicated by key);
//   3. a food from a table gets that table's values; a product whose name is a
//      plain ingredient (scripts/micronutrient-matches.mjs) and whose macros
//      agree with that ingredient's generic food gets its values with x: 1;
//   4. out/<version>/<000-255>.json shards (src/world-foods.js microShard),
//      meta.json, top.json ("rich in" lists) and with --upload all of it under
//      micros/<version>/ in R2, micros/current.json last.
// Downloaded files are untrusted data: archives are only listed and read entry
// by entry (unzip -p), never extracted, and values must parse as numbers.
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gunzipSync } from 'node:zlib';
import { microShard, MICROS_FORMAT, WORLD_FOODS_FORMAT } from '../src/world-foods.js';
import { MATCHES, matchFood, nameMatches } from './micronutrient-matches.mjs';

// Output keys and their units per 100 g.
export const NUTRIENTS = {
  fe: 'mg', ca: 'mg', mg: 'mg', k: 'mg', zn: 'mg', p: 'mg', se: 'ug', iod: 'ug', vitd: 'ug',
  vita: 'ug', // retinol activity (USDA, Fineli) or retinol equivalents (CoFID, Ciqual)
  vite: 'mg', vitk: 'ug', vitc: 'mg', b1: 'mg', b2: 'mg', b3: 'mg', b6: 'mg',
  fol: 'ug', // dietary folate equivalents where given, else total folate
  b12: 'ug', chol: 'mg', sfa: 'g'
};
// Macros of a table food (for references missing in the catalogue); own names, as p is phosphorus.
const MACROS = { pro: 'g', fat: 'g', carb: 'g', kcal: 'kcal' };
const TABLES = ['usda_sr_legacy', 'usda_foundation', 'usda_survey', 'fineli', 'ciqual', 'cofid'];
const OPTIONAL = new Set(['fineli']);
// Some publishers (Fineli) refuse unknown clients.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// ---- numbers and units ----------------------------------------------------

export const round3 = v => v === 0 ? 0 : Number(Number(v).toPrecision(3));
// "1,23", "1.23", "(0.4)" (an estimate in CoFID) -> number; "Tr", "N", "-", "< 0,5", "traces" -> null.
export function number(value) {
  const s = String(value ?? '').trim().replace(/^\((.*)\)$/, '$1').replace(',', '.');
  return /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s) ? Number(s) : null;
}
const FACTOR = { g: 1e6, mg: 1e3, ug: 1, kcal: 1, kj: 1 / 4.184 };
export function unitOf(s) {
  let u = String(s ?? '').trim().toLowerCase().replace(/[µμ]/g, 'u');
  if (u === 'mcg') u = 'ug';
  return Object.hasOwn(FACTOR, u) ? u : null;
}
// Mass units convert among themselves, kJ to kcal; anything else (IU) is null.
export function convert(value, from, to) {
  const f = unitOf(from), t = unitOf(to);
  if (value == null || !Number.isFinite(value) || !f || !t) return null;
  const energy = u => u === 'kcal' || u === 'kj';
  if (energy(f) !== energy(t)) return null;
  return value * FACTOR[f] / FACTOR[t];
}
// Sets out.v[key] (or out.m for macros) from a value in a unit; a lower
// priority number wins when two source nutrients map to one key.
function setValue(food, key, raw, unit, prio = 0) {
  const isMacro = Object.hasOwn(MACROS, key);
  const v = convert(raw, unit, isMacro ? MACROS[key] : NUTRIENTS[key]);
  if (v == null || v < 0) return;
  const bag = isMacro ? (food.m ||= {}) : (food.v ||= {}), pr = (food.pr ||= {});
  const id = (isMacro ? 'm.' : '') + key;
  if (id in pr && pr[id] <= prio) return;
  bag[key] = v; pr[id] = prio;
}
const finish = food => { delete food.pr; food.v ||= {}; food.m ||= {}; return food; };

// ---- text formats -----------------------------------------------------------

export function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch { return buf.toString('latin1'); }
}
// CSV with quotes (and quoted newlines); calls onRow(fields) for every row.
export function parseCsv(text, sep = ',', onRow) {
  const S = sep.charCodeAt(0), n = text.length;
  let row = [];
  for (let i = 0; i < n || row.length;) {
    let value;
    if (text.charCodeAt(i) === 34) {
      let j = i + 1; value = '';
      for (;;) {
        const k = text.indexOf('"', j);
        if (k < 0) { value += text.slice(j); i = n; break; }
        value += text.slice(j, k);
        if (text.charCodeAt(k + 1) === 34) { value += '"'; j = k + 2; } else { i = k + 1; break; }
      }
      while (i < n && ![S, 10, 13].includes(text.charCodeAt(i))) i++;
    } else {
      let j = i;
      while (j < n) { const c = text.charCodeAt(j); if (c === S || c === 10 || c === 13) break; j++; }
      value = text.slice(i, j); i = j;
    }
    row.push(value);
    if (i < n && text.charCodeAt(i) === S) { i++; if (i < n) continue; row.push(''); }
    if (text.charCodeAt(i) === 13) i++;
    if (text.charCodeAt(i) === 10) i++;
    if (!(row.length === 1 && row[0] === '')) onRow(row);
    row = [];
    if (i >= n) break;
  }
}
// Rows as objects keyed by the header row (keys trimmed, upper case).
export function csvRecords(text, sep, onRecord) {
  let head = null;
  parseCsv(text, sep, row => {
    if (!head) { head = row.map(h => h.trim().toUpperCase()); return; }
    const o = {};
    for (let i = 0; i < head.length; i++) o[head[i]] = row[i];
    onRecord(o);
  });
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export const xmlText = s => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(lt|gt|amp|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, e, d, h) => e ? ENTITIES[e.toLowerCase()] : String.fromCodePoint(d ? Number(d) : parseInt(h, 16)));
// <TAG><a> 1 </a><b/></TAG> blocks as { a: '1', b: '' } (Ciqual's flat XML).
export function xmlRecords(xml, tag, onRecord) {
  const block = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  for (const m of xml.matchAll(block)) {
    const o = {};
    for (const f of m[1].matchAll(/<([A-Za-z_][\w.-]*)\s*(?:\/>|>([\s\S]*?)<\/\1>)/g)) o[f[1].toLowerCase()] = xmlText(f[2] ?? '').trim();
    onRecord(o);
  }
}

// ---- USDA FoodData Central (CSV; food_nutrient amounts are per 100 g) -------

// By nutrient number (stable across releases): [key, priority].
export const USDA_NUMBERS = {
  303: ['fe'], 301: ['ca'], 304: ['mg'], 306: ['k'], 309: ['zn'], 305: ['p'], 317: ['se'], 314: ['iod'],
  328: ['vitd'], 320: ['vita'], 323: ['vite'], 430: ['vitk'], 401: ['vitc'], 404: ['b1'], 405: ['b2'],
  406: ['b3'], 415: ['b6'], 435: ['fol', 0], 417: ['fol', 1], 418: ['b12'], 601: ['chol'], 606: ['sfa'],
  203: ['pro'], 204: ['fat'], 205: ['carb'], 208: ['kcal', 0], 958: ['kcal', 1], 957: ['kcal', 2]
};
// FNDDS releases leave nutrient_nbr empty: the FDC nutrient ids, with units.
export const USDA_IDS = {
  1089: [303, 'mg'], 1087: [301, 'mg'], 1090: [304, 'mg'], 1092: [306, 'mg'], 1095: [309, 'mg'], 1091: [305, 'mg'], 1103: [317, 'ug'],
  1100: [314, 'ug'], 1114: [328, 'ug'], 1106: [320, 'ug'], 1109: [323, 'mg'], 1185: [430, 'ug'], 1162: [401, 'mg'], 1165: [404, 'mg'],
  1166: [405, 'mg'], 1167: [406, 'mg'], 1175: [415, 'mg'], 1190: [435, 'ug'], 1177: [417, 'ug'], 1178: [418, 'ug'], 1253: [601, 'mg'],
  1258: [606, 'g'], 1003: [203, 'g'], 1004: [204, 'g'], 1005: [205, 'g'], 1008: [208, 'kcal'], 2048: [958, 'kcal'], 2047: [957, 'kcal']
};
export function parseUsda({ food, nutrient, foodNutrient }, dataTypes) {
  const nutrients = new Map(), foods = new Map();
  csvRecords(nutrient, ',', r => {
    const spec = USDA_NUMBERS[Number(r.NUTRIENT_NBR)];
    if (spec) nutrients.set(r.ID, { key: spec[0], prio: spec[1] ?? 0, unit: r.UNIT_NAME });
  });
  for (const [id, [nbr, unit]] of Object.entries(USDA_IDS)) if (!nutrients.has(id)) {
    const spec = USDA_NUMBERS[nbr];
    nutrients.set(id, { key: spec[0], prio: spec[1] ?? 0, unit });
  }
  csvRecords(food, ',', r => { if (!dataTypes || dataTypes.includes(r.DATA_TYPE)) foods.set(r.FDC_ID, { name: r.DESCRIPTION }); });
  // FNDDS food_nutrient.csv gives the nutrient number in nutrient_id.
  const byNumber = new Map();
  csvRecords(nutrient, ',', r => { const spec = USDA_NUMBERS[Number(r.NUTRIENT_NBR)]; if (spec) byNumber.set(String(Number(r.NUTRIENT_NBR)), { key: spec[0], prio: spec[1] ?? 0, unit: r.UNIT_NAME }); });
  csvRecords(foodNutrient, ',', r => {
    const f = foods.get(r.FDC_ID), n = f && (nutrients.get(r.NUTRIENT_ID) || byNumber.get(r.NUTRIENT_ID));
    if (n) setValue(f, n.key, number(r.AMOUNT), n.unit, n.prio);
  });
  for (const f of foods.values()) finish(f);
  return foods;
}

// ---- Fineli (THL; ';' separated, decimal comma, per 100 g edible part) ------

export const FINELI_CODES = {
  FE: 'fe', CA: 'ca', MG: 'mg', K: 'k', ZN: 'zn', P: 'p', SE: 'se', ID: 'iod', VITD: 'vitd', VITA: 'vita', VITE: 'vite',
  VITK: 'vitk', VITC: 'vitc', THIA: 'b1', RIBF: 'b2', NIA: 'b3', VITPYRID: 'b6', FOL: 'fol', VITB12: 'b12', CHOLE: 'chol',
  FASAT: 'sfa', PROT: 'pro', FAT: 'fat', CHOAVL: 'carb', ENERC: 'kcal'
};
export function parseFineli({ componentValue, component, foodNames = '' }, log = () => {}) {
  const units = new Map(), foods = new Map();
  csvRecords(component, ';', r => units.set(r.EUFDNAME?.trim(), r.COMPUNIT?.trim()));
  const missing = Object.keys(FINELI_CODES).filter(c => !units.has(c));
  if (missing.length) log(`fineli: components not in component.csv: ${missing.join(', ')}`);
  csvRecords(componentValue, ';', r => {
    const code = r.EUFDNAME?.trim(), key = FINELI_CODES[code];
    if (!key) return;
    const id = r.FOODID?.trim();
    if (!foods.has(id)) foods.set(id, {});
    setValue(foods.get(id), key, number(r.BESTLOC ?? r.VALUE), units.get(code) || NUTRIENTS[key]);
  });
  csvRecords(foodNames, ';', r => { const f = foods.get(r.FOODID?.trim()); if (f && (!r.LANG || /^en$/i.test(r.LANG.trim()))) f.name = r.FOODNAME?.trim(); });
  for (const f of foods.values()) finish(f);
  return foods;
}

// ---- Ciqual (Anses; XML, decimal comma, per 100 g) ---------------------------

// By English constituent name, the unit is in the name: "Iron (mg/100 g)".
export const CIQUAL_NAMES = [
  ['fe', /^iron\b/], ['ca', /^calcium\b/], ['mg', /^magnesium\b/], ['k', /^potassium\b/], ['zn', /^zinc\b/],
  ['p', /^phosphorus\b/], ['se', /^selenium\b/], ['iod', /^iodine\b/], ['vitd', /^vitamin d\b/], ['retinol', /^retinol\b/],
  ['bcar', /^beta-carotene\b/], ['vite', /^vitamin e\b/], ['vitk', /^vitamin k1\b/], ['vitc', /^vitamin c\b/],
  ['b1', /^vitamin b1\b/], ['b2', /^vitamin b2\b/], ['b3', /^vitamin b3\b/], ['b6', /^vitamin b6\b/],
  ['fol', /^vitamin b9\b/], ['b12', /^vitamin b12\b/], ['chol', /^cholesterol\b/], ['sfa', /^fa saturated\b/],
  ['pro', /^protein \(g/], ['fat', /^fat \(g/], ['carb', /^carbohydrate \(g/], ['kcal', /^energy, regulation eu no 1169\/2011 \(kcal/]
];
export function parseCiqual({ alim, compo, constants }) {
  const consts = new Map(), foods = new Map();
  xmlRecords(constants, 'CONST', r => {
    const name = String(r.const_nom_eng || '').toLowerCase();
    const hit = CIQUAL_NAMES.find(([, re]) => re.test(name));
    const unit = name.match(/\(\s*(g|mg|µg|μg|ug|kcal|kj)\s*\/\s*100\s*m?[gl]\s*\)/i)?.[1];
    if (hit && unit && ![...consts.values()].some(c => c.key === hit[0])) consts.set(r.const_code, { key: hit[0], unit });
  });
  xmlRecords(alim, 'ALIM', r => foods.set(r.alim_code, { name: r.alim_nom_eng || r.alim_nom_fr }));
  xmlRecords(compo, 'COMPO', r => {
    const c = consts.get(r.const_code), f = foods.get(r.alim_code);
    if (!c || !f) return;
    const v = number(r.teneur);
    if (c.key === 'retinol' || c.key === 'bcar') { if (v != null) (f.a ||= {})[c.key] = convert(v, c.unit, 'ug'); return; }
    setValue(f, c.key, v, c.unit);
  });
  for (const f of foods.values()) {
    // Retinol equivalents: retinol + beta-carotene / 6, only when both are known.
    if (f.a?.retinol != null && f.a?.bcar != null) setValue(f, 'vita', f.a.retinol + f.a.bcar / 6, 'ug');
    delete f.a; finish(f);
  }
  return foods;
}

// ---- CoFID (McCance and Widdowson's, xlsx; per 100 g) -------------------------

// By column header; first sheet with a match wins. Unit from "(mg)" in the header.
export const COFID_HEADERS = [
  ['fe', /^iron\b/], ['ca', /^calcium\b/], ['mg', /^magnesium\b/], ['k', /^potassium\b/], ['zn', /^zinc\b/],
  ['p', /^phosphorus\b/], ['se', /^selenium\b/], ['iod', /^iodine\b/], ['vitd', /^vitamin d\b/], ['vita', /^retinol equivalent/],
  ['vite', /^vitamin e\b/], ['vitk', /^vitamin k1\b/], ['vitc', /^vitamin c\b/], ['b1', /^thiamin\b/], ['b2', /^riboflavin\b/],
  ['b3', /^niacin\b(?!\s*equiv)/], ['b6', /^vitamin b6\b/], ['fol', /^folate\b/], ['b12', /^vitamin b12\b/],
  ['chol', /^cholesterol\b/], ['sfa', /^(satd|saturated)\b.*(fd|food)\b/],
  ['pro', /^protein\b/], ['fat', /^fat\b/], ['carb', /^carbohydrate\b/], ['kcal', /^energy\b.*kcal/]
];
const UNIT_KEYS = { ...NUTRIENTS, ...MACROS };
export function parseCofid(sheets, log = () => {}) {
  const foods = new Map(), taken = new Set();
  for (const { name: sheet, rows } of sheets) {
    // The header row has "Food Name" (one sheet leaves "Food Code" blank: the code is then the first column).
    const h = rows.slice(0, 6).findIndex(r => r.some(c => /^food\s*name$/i.test(String(c ?? '').trim())));
    if (h < 0) { log(`  CoFID ${sheet}: no header in ${JSON.stringify(rows.slice(0, 3).map(r => r.slice(0, 6)))}`); continue; }
    const head = rows[h].map(c => String(c ?? '').replace(/\s+/g, ' ').trim());
    const nameCol = head.findIndex(c => /^food\s*name$/i.test(c)), code = Math.max(0, head.findIndex(c => /^food\s*code$/i.test(c)));
    const cols = [];
    for (const [key, re] of COFID_HEADERS) {
      if (taken.has(key)) continue;
      const i = head.findIndex(c => re.test(c.toLowerCase()));
      if (i < 0) continue;
      const unit = head[i].match(/\((g|mg|µg|μg|ug|mcg|kcal|kj)\)/i)?.[1] || UNIT_KEYS[key];
      cols.push([key, i, unit]); taken.add(key);
      log(`  CoFID ${sheet}: ${key} <- "${head[i]}"`);
    }
    if (!cols.length) continue;
    for (const r of rows.slice(h + 1)) {
      const id = String(r[code] ?? '').trim();
      if (!/^\d{1,3}-\d{1,4}[a-z]?$/i.test(id)) continue;
      if (!foods.has(id)) foods.set(id, { name: String(r[nameCol] ?? '').trim() });
      const f = foods.get(id);
      for (const [key, i, unit] of cols) setValue(f, key, number(r[i]), unit);
    }
  }
  for (const f of foods.values()) finish(f);
  return foods;
}

// Minimal xlsx reading: shared strings and cell values of one sheet's XML.
export function sharedStrings(xml) {
  return [...String(xml || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => xmlText(t[1])).join(''));
}
const colIndex = ref => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export function sheetRows(xml, strings) {
  const rows = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;
      const type = c[1].match(/\bt="(\w+)"/)?.[1], body = c[2] || '';
      let v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (type === 's') v = strings[Number(v)];
      else if (type === 'inlineStr') v = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => xmlText(t[1])).join('');
      else if (v != null) v = xmlText(v);
      cells[colIndex(ref)] = v ?? '';
    }
    rows.push(cells);
  }
  return rows;
}

// ---- zip archives (unzip, entry by entry) -------------------------------------

function zipList(file) {
  const r = spawnSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : null;
}
function zipEntry(file, entry) {
  const r = spawnSync('unzip', ['-p', file, entry.replace(/([[\]*?])/g, '[$1]')], { maxBuffer: 2 ** 31 - 1 });
  if (r.status !== 0) throw new Error(`Cannot read ${entry} from ${file}`);
  return r.stdout;
}
// The entry whose file name (any folder) matches.
const findEntry = (entries, re) => entries.find(e => re.test(e.split('/').pop()));

function readXlsx(file) {
  const entries = zipList(file), text = e => decode(zipEntry(file, e));
  const strings = entries.includes('xl/sharedStrings.xml') ? sharedStrings(text('xl/sharedStrings.xml')) : [];
  const rels = new Map([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(m => [m[0].match(/Id="([^"]+)"/)?.[1], m[0].match(/Target="([^"]+)"/)?.[1]]));
  return [...text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map(m => {
    const name = xmlText(m[0].match(/name="([^"]*)"/)?.[1]).trim(), target = rels.get(m[0].match(/r:id="([^"]+)"/)?.[1]) || '';
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    return { name, rows: entries.includes(path) ? sheetRows(text(path), strings) : [] };
  });
}

// ---- downloads ------------------------------------------------------------------

// Known URLs first (the releases the catalogue was built from), then links found
// on the publisher's download page. The first file that is a zip with the
// needed entries is kept.
const FDC = 'https://fdc.nal.usda.gov/fdc-datasets/';
const FDC_PAGES = ['https://fdc.nal.usda.gov/download-datasets', 'https://fdc.nal.usda.gov/download-datasets.html'];
export const SOURCES = {
  usda_sr_legacy: { urls: [FDC + 'FoodData_Central_sr_legacy_food_csv_2018-04.zip'], pages: FDC_PAGES, link: /FoodData_Central_sr_legacy_food_csv_[\w-]+\.zip/g, need: [/^food\.csv$/, /^nutrient\.csv$/, /^food_nutrient\.csv$/] },
  usda_foundation: { urls: ['2026-04-30', '2025-12-18', '2025-04-24', '2024-10-31', '2024-04-18'].map(d => `${FDC}FoodData_Central_foundation_food_csv_${d}.zip`), pages: FDC_PAGES, link: /FoodData_Central_foundation_food_csv_[\w-]+\.zip/g, need: [/^food\.csv$/, /^nutrient\.csv$/, /^food_nutrient\.csv$/] },
  usda_survey: { urls: ['2024-10-31', '2022-10-28'].map(d => `${FDC}FoodData_Central_survey_food_csv_${d}.zip`), pages: FDC_PAGES, link: /FoodData_Central_survey_food_csv_[\w-]+\.zip/g, need: [/^food\.csv$/, /^nutrient\.csv$/, /^food_nutrient\.csv$/] },
  fineli: { urls: ['https://fineli.fi/fineli/content/file/47', 'https://fineli.fi/fineli/content/file/48'], pages: ['https://fineli.fi/fineli/en/avoin-data', 'https://www.avoindata.fi/data/en_GB/dataset/fineli-elintarvikkeiden-koostumustietopankki', 'https://www.avoindata.fi/data/fi/dataset/fineli-elintarvikkeiden-koostumustietopankki'], link: /[^"'\s<>]*content\/file\/\d+|https?:\/\/[^"'\s<>]+\.zip/g, need: [/^component_value\.csv$/i, /^component\.csv$/i] },
  // The catalogue has Ciqual 2025, published on Zenodo as separate XML files
  // (ciqualFiles); the 2020 XML archive is the fallback.
  ciqual: { urls: ['https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip'], pages: [], link: /$^/g, need: [/^compo.*\.xml$/i, /^alim_(?!grp).*\.xml$/i, /^const.*\.xml$/i] },
  cofid: { urls: ['https://assets.publishing.service.gov.uk/media/60538e66d3bf7f0455a5d8cb/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx'], pages: ['https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid'], link: /https:\/\/assets\.publishing\.service\.gov\.uk\/[^"'\s<>]+\.xlsx/g, prefer: /Integrated_Dataset/i, need: [/^workbook\.xml$/] }
};

const HEADERS = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-GB,en;q=0.9' };
async function fetchTo(url, file) {
  // Transient network errors get two more tries.
  let r;
  for (let attempt = 1; ; attempt++) {
    try { r = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15 * 60 * 1000) }); break; }
    catch (e) { if (attempt >= 3) throw e; await new Promise(res => setTimeout(res, 5000 * attempt)); }
  }
  if (r.ok && r.body) return pipeline(Readable.fromWeb(r.body), createWriteStream(file));
  // A bot filter may refuse Node's client but not curl's.
  const c = spawnSync('curl', ['-fsSL', '--max-time', '900', '-A', UA, '-o', file, url], { encoding: 'utf8' });
  if (c.status !== 0) throw new Error(`HTTP ${r.status}, server ${r.headers.get('server')}; curl: ${c.stderr.trim().slice(-200)}`);
}
// Ciqual 2025 from its Zenodo record: alim, compo and const XML files.
const CIQUAL_RECORD = 'https://zenodo.org/api/records/17550133';
async function ciqualFiles(dir, log) {
  const r = await fetch(CIQUAL_RECORD, { headers: { ...HEADERS, accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const files = (await r.json()).files || [];
  const out = {};
  for (const [part, re] of [['alim', /^alim_(?!grp).*\.xml$/i], ['compo', /^compo_.*\.xml$/i], ['constants', /^const_.*\.xml$/i]]) {
    const f = files.find(x => re.test(x.key || ''));
    if (!f?.links?.self?.startsWith('https://zenodo.org/')) throw new Error(`no ${part} file in ${CIQUAL_RECORD}`);
    const file = join(dir, `ciqual-${part}.xml`);
    if (!existsSync(file)) await fetchTo(f.links.self, file);
    out[part] = decode(readFileSync(file));
    log(`ciqual: ${part} from ${f.links.self} (${(statSync(file).size / 1048576).toFixed(1)} MB)`);
  }
  return { url: CIQUAL_RECORD, parts: out };
}
async function links(page, re) {
  const r = await fetch(page, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}, server ${r.headers.get('server')}`);
  const html = await r.text();
  return [...new Set([...html.matchAll(re)].map(m => new URL(m[0].replace(/&amp;/g, '&'), r.url).href))];
}
export async function download(id, dir, log = console.log) {
  const { urls, pages, link, need, prefer } = SOURCES[id];
  const file = join(dir, `${id}.bin`), meta = join(dir, `${id}.url`);
  const ok = () => { const e = zipList(file); return e && need.every(re => findEntry(e, re)) ? e : null; };
  if (existsSync(file) && existsSync(meta) && ok()) { log(`${id}: cached ${readFileSync(meta, 'utf8')}`); return { file, url: readFileSync(meta, 'utf8'), entries: zipList(file) }; }
  const tried = new Set();
  const attempt = async url => {
    if (tried.has(url)) return null;
    tried.add(url);
    try { await fetchTo(url, file); } catch (e) { log(`${id}: ${url} failed (${e.message})`); return null; }
    const entries = ok();
    if (!entries) { log(`${id}: ${url} is not the expected archive (${statSync(file).size} bytes)`); return null; }
    writeFileSync(meta, url);
    log(`${id}: using ${url} (${(statSync(file).size / 1048576).toFixed(1)} MB)`);
    return { file, url, entries };
  };
  if (!SOURCES[id].pagesFirst) for (const url of urls) { const got = await attempt(url); if (got) return got; }
  for (const page of pages) {
    let found = [];
    try { found = await links(page, link); } catch (e) { log(`${id}: page ${page} failed (${e.message})`); continue; }
    log(`${id}: ${found.length} link(s) on ${page}: ${found.slice(0, 12).join(' ')}`);
    for (const url of found.sort((a, b) => (prefer?.test(b) ? 1 : 0) - (prefer?.test(a) ? 1 : 0))) { const got = await attempt(url); if (got) return got; }
  }
  if (SOURCES[id].pagesFirst) for (const url of urls) { const got = await attempt(url); if (got) return got; }
  throw new Error(`${id}: no working download`);
}

export async function loadTables(dir, log = console.log) {
  mkdirSync(dir, { recursive: true });
  const tables = {}, used = {};
  const errors = [], unavailable = [];
  for (const id of TABLES) try {
    if (id === 'ciqual') {
      let got = null;
      try { got = await ciqualFiles(dir, log); } catch (e) { log(`ciqual 2025: ${e.message}; falling back to the 2020 archive`); }
      if (got) { used[id] = got.url; tables[id] = parseCiqual(got.parts); }
    }
    const { file, url, entries } = tables[id] ? {} : await download(id, dir, log);
    if (url) used[id] = url;
    const text = re => { const e = findEntry(entries, re); return e ? decode(zipEntry(file, e)) : ''; };
    const t0 = Date.now();
    if (tables[id]) { /* Ciqual 2025, read above */ } else if (id.startsWith('usda_')) {
      const type = { usda_sr_legacy: 'sr_legacy_food', usda_foundation: 'foundation_food', usda_survey: 'survey_fndds_food' }[id];
      tables[id] = parseUsda({ food: text(/^food\.csv$/), nutrient: text(/^nutrient\.csv$/), foodNutrient: text(/^food_nutrient\.csv$/) }, [type]);
    } else if (id === 'fineli') {
      tables[id] = parseFineli({ componentValue: text(/^component_value\.csv$/i), component: text(/^component\.csv$/i), foodNames: text(/^foodname_en\.csv$/i) }, log);
    } else if (id === 'ciqual') {
      log(`ciqual: entries ${entries.join(', ')}`);
      tables[id] = parseCiqual({ alim: text(/^alim_(?!grp)[^/]*\.xml$/i), compo: text(/^compo.*\.xml$/i), constants: text(/^const.*\.xml$/i) });
    } else {
      const sheets = readXlsx(file);
      log(`cofid: sheets ${sheets.map(s => `${s.name} (${s.rows.length})`).join(', ')}`);
      tables[id] = parseCofid(sheets, log);
    }
    const foods = [...tables[id].values()];
    const per = Object.fromEntries(Object.keys(NUTRIENTS).map(k => [k, foods.filter(f => f.v[k] != null).length]));
    log(`${id}: ${foods.length} foods in ${((Date.now() - t0) / 1000).toFixed(1)} s; foods with each value: ${JSON.stringify(per)}`);
    if (!foods.length || !per.fe) {
      log(`${id}: entries ${entries.join(', ')}`);
      for (const re of [/^nutrient\.csv$/, /^food_nutrient\.csv$/, /^food\.csv$/]) { const e = findEntry(entries, re); if (e) log(`${id}: ${e}: ${JSON.stringify(text(re).slice(0, 400))}`); }
      throw new Error(`${id}: no values parsed`);
    }
  } catch (e) {
    // Keep going, so one run shows every problem (missing references too).
    // Fineli refuses GitHub's runners (Cloudflare 403): its foods then go
    // through the estimates like any other food instead of failing the build.
    if (OPTIONAL.has(id)) { log(`WARNING ${id} unavailable, its foods get estimates only: ${e.message}`); unavailable.push(id); continue; }
    errors.push(`${id}: ${e.message}`); log(`ERROR ${id}: ${e.stack || e.message}`); tables[id] = new Map();
  }
  return { tables, used, errors, unavailable };
}

// ---- the catalogue in R2 ------------------------------------------------------

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function r2get(bucket, key, file, { optional = false } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = spawnSync(npx, ['--yes', 'wrangler@4', 'r2', 'object', 'get', `${bucket}/${key}`, '--remote', '--file', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.status === 0 && existsSync(file)) return true;
    if (optional && /not found|does not exist|10007|404/i.test(r.stdout + r.stderr)) return false;
    console.error(`Download of ${key} failed (attempt ${attempt}): ${(r.stderr || r.stdout).slice(-300)}`);
  }
  if (optional) return false;
  throw new Error(`Could not download ${key}`);
}
const NAME_SHARDS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
export async function fetchCatalogue(dir, bucket, log = console.log) {
  mkdirSync(dir, { recursive: true });
  r2get(bucket, 'current.json', join(dir, 'current.json'));
  const current = JSON.parse(readFileSync(join(dir, 'current.json'), 'utf8'));
  if (current.format !== WORLD_FOODS_FORMAT) throw new Error(`Catalogue format ${current.format}, expected ${WORLD_FOODS_FORMAT}`);
  const vdir = join(dir, current.version);
  mkdirSync(join(vdir, 'names'), { recursive: true });
  const get = (key, opt) => existsSync(join(vdir, key)) || r2get(bucket, `${current.version}/${key}`, join(vdir, key), opt);
  get('meta.json'); get('barcodes.idx.json');
  const meta = JSON.parse(readFileSync(join(vdir, 'meta.json'), 'utf8'));
  log(`catalogue ${current.version}: ${JSON.stringify(meta.counts)}`);
  for (const s of meta.sources || []) log(`  source ${s.id}: ${s.title} ${s.version || ''} ${s.url || ''}`);
  const shards = NAME_SHARDS.filter(s => get(`names/${s}.json`, { optional: true }));
  for (const f of meta.files) { const t0 = Date.now(); get(f); log(`  ${f}: ${(statSync(join(vdir, f)).size / 1048576).toFixed(0)} MB in ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  return { version: current.version, dir: vdir, meta, shards };
}
// Every record of every name node and barcode bucket (gzip members located by
// the indexes; a record repeats across name nodes).
export function* catalogueRecords({ dir, shards }) {
  const slices = [];
  for (const s of shards) for (const [pack, offset, length] of Object.values(JSON.parse(readFileSync(join(dir, 'names', `${s}.json`), 'utf8')))) slices.push([`names-${pack}.pack`, offset, length]);
  for (const [pack, offset, length] of JSON.parse(readFileSync(join(dir, 'barcodes.idx.json'), 'utf8'))) if (length) slices.push([`barcodes-${pack}.pack`, offset, length]);
  slices.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  let fd = null, open = null;
  for (const [file, offset, length] of slices) {
    if (file !== open) { if (fd != null) closeSync(fd); fd = openSync(join(dir, file), 'r'); open = file; }
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, offset);
    const text = gunzipSync(buf).toString('utf8');
    for (const line of text.split('\n')) if (line) yield JSON.parse(line);
  }
  if (fd != null) closeSync(fd);
}

// ---- the build ------------------------------------------------------------------

const keyOf = (src, id) => `${src}:${id}`;
export function rounded(v) {
  const out = {};
  for (const k of Object.keys(NUTRIENTS)) if (v[k] != null) out[k] = round3(v[k]);
  return out;
}
// USDA appends "(Includes foods for USDA's Food Distribution Program)" to some names.
export const normName = s => String(s || '').replace(/\s*\(includes foods for usda'?s food distribution program\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
const sample = (list, n, rnd) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }

// Each entry's references by source and exact description (USDA's
// "(Includes foods for ...)" suffix ignored); misses list the nearest names.
export function findRefs(tables, entries = MATCHES) {
  const byName = {};
  for (const [src, foods] of Object.entries(tables)) {
    byName[src] = new Map();
    for (const [id, f] of foods) if (f.name) { const n = normName(f.name); if (!byName[src].has(n)) byName[src].set(n, id); }
  }
  const found = [], missing = [];
  for (const e of entries) for (const [src, desc] of e.refs) {
    const id = byName[src]?.get(normName(desc)), f = id != null ? tables[src].get(id) : null;
    if (f && Object.keys(rounded(f.v)).length) { found.push({ e, src, desc, id, f }); continue; }
    const want = normName(desc).split(/[^a-z0-9%]+/).filter(Boolean);
    const near = [...(byName[src]?.keys() || [])].map(n => [n, want.filter(w => n.includes(w.slice(0, 5))).length - n.length / 1000]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
    missing.push(`${e.id}: ${src} "${desc}" ${f ? 'has no values' : 'not found'}; nearest: ${near.map(n => JSON.stringify(n)).join(' | ')}`);
  }
  return { found, missing };
}

export function compute({ tables, records, log = console.log, entries = MATCHES }) {
  // Catalogue foods: table foods by key, other foods whose names match an entry.
  const generic = new Map(), candidates = [], seen = new Set(), bySource = {};
  let total = 0;
  for (const r of records) {
    if (seen.has(r.k)) continue;
    seen.add(r.k); total++;
    bySource[r.s] = (bySource[r.s] || 0) + 1;
    const slim = { k: r.k, n: r.n, cs: r.cs, en: r.en, e: r.e, p: r.p, c: r.c, f: r.f, u: r.u, s: r.s };
    if (tables[r.s]) generic.set(r.k, slim);
    else if (nameMatches(slim, entries).length) candidates.push(slim);
  }
  log(`catalogue: ${total} unique foods ${JSON.stringify(bySource)}; ${candidates.length} name candidates for estimates`);

  // Direct values.
  const out = new Map(), counts = { direct: {}, table_foods: {}, not_in_catalogue: {}, estimates: 0, by_match: {}, rejected: {} };
  for (const [src, foods] of Object.entries(tables)) {
    counts.table_foods[src] = foods.size; counts.direct[src] = 0; counts.not_in_catalogue[src] = 0;
    for (const [id, f] of foods) {
      const k = keyOf(src, id), v = rounded(f.v);
      if (!Object.keys(v).length) continue;
      if (!generic.has(k)) { counts.not_in_catalogue[src]++; continue; }
      out.set(k, v); counts.direct[src]++;
    }
  }

  // References: source + exact description, resolved once; missing ones fail the build.
  const { found, missing } = findRefs(tables, entries);
  const refs = new Map();
  for (const { e, src, desc, id, f } of found) {
    const k = keyOf(src, id), cat = generic.get(k), m = cat && cat.p != null ? cat : { p: f.m.pro, f: f.m.fat, c: f.m.carb, e: f.m.kcal };
    if (!cat) log(`  reference ${k} (${desc}) is not in the catalogue; using the table's macros`);
    if (m?.p == null || m?.f == null || m?.c == null || m?.e == null) { log(`  reference ${k} (${desc}) has no macros, skipped`); continue; }
    refs.set(`${src}\u0000${desc}`, { k, n: cat?.en || cat?.n || f.name, cs: cat?.cs, e: m.e, p: m.p, c: m.c, f: m.f, v: rounded(f.v), entry: e });
  }
  for (const e of entries) if (!e.refs.some(([src, desc]) => refs.has(`${src}\u0000${desc}`))) missing.push(`${e.id}: no usable reference`);
  if (missing.length) throw new Error(`Missing references:\n${missing.join('\n')}`);
  const refOf = (src, desc) => refs.get(`${src}\u0000${desc}`) || null;

  // Estimates.
  const accepted = [], rejected = [];
  for (const r of candidates) {
    const m = matchFood(r, refOf, entries);
    if (!m.ref) { if (m.entry) { counts.rejected[m.entry.id] = (counts.rejected[m.entry.id] || 0) + 1; rejected.push({ r, m }); } continue; }
    out.set(r.k, { ...m.ref.v, x: 1 });
    counts.by_match[m.entry.id] = (counts.by_match[m.entry.id] || 0) + 1;
    counts.estimates++; accepted.push({ r, m });
  }
  counts.total = out.size;

  const rnd = seeded(20261015), show = r => `${r.k} "${r.cs || r.en || r.n}" ${r.u === 'ml' ? '(ml) ' : ''}e${r.e} p${r.p} c${r.c} f${r.f}`;
  log(`estimates per match (accepted / name matched but rejected):`);
  for (const e of entries) log(`  ${e.id}: ${counts.by_match[e.id] || 0} / ${counts.rejected[e.id] || 0}`);
  log('20 random accepted:');
  for (const { r, m } of sample(accepted, 20, rnd)) log(`  + ${show(r)} -> ${m.entry.id} ${m.ref.k} (e${m.ref.e} p${m.ref.p} c${m.ref.c} f${m.ref.f})`);
  log('20 random rejected:');
  for (const { r, m } of sample(rejected, 20, rnd)) log(`  - ${show(r)} -> ${m.entry.id}: ${m.reason}`);

  // "Rich in" lists from the reference foods, one food per entry label.
  const pool = new Map();
  for (const ref of refs.values()) if (!pool.has(ref.entry.cs)) pool.set(ref.entry.cs, ref);
  const top = {};
  for (const key of Object.keys(NUTRIENTS)) {
    top[key] = [...pool.values()].filter(r => r.v[key] > 0).sort((a, b) => b.v[key] - a.v[key]).slice(0, 8)
      .map(r => ({ k: r.k, n: r.n, cs: r.cs || r.entry.cs, v: r.v[key] }));
  }
  return { out, counts, top, refs, accepted, generic };
}

export function writeOutput(out, dir, { version, counts, used, catalogue, top, extra = {} }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const shards = Array.from({ length: 256 }, () => ({}));
  for (const k of [...out.keys()].sort()) shards[Number(microShard(k))][k] = out.get(k);
  shards.forEach((s, i) => writeFileSync(join(dir, `${String(i).padStart(3, '0')}.json`), JSON.stringify(s)));
  const meta = {
    format: MICROS_FORMAT, version, created_utc: new Date().toISOString(), catalogue, units: NUTRIENTS,
    estimate_flag: 'x: 1 marks values of a generic food whose name and macros match (scripts/micronutrient-matches.mjs)',
    counts, sources: [
      { id: 'usda', title: 'USDA FoodData Central (SR Legacy, Foundation Foods, FNDDS survey foods)', license: 'Public domain (CC0 1.0)', url: 'https://fdc.nal.usda.gov/', files: [used?.usda_sr_legacy, used?.usda_foundation, used?.usda_survey].filter(Boolean) },
      ...(used?.fineli ? [{ id: 'fineli', title: 'Fineli, Finnish Institute for Health and Welfare (THL)', license: 'CC BY 4.0', url: 'https://fineli.fi/', files: [used.fineli] }] : []),
      { id: 'ciqual', title: 'Anses, Ciqual French food composition table', license: 'Etalab Open Licence 2.0 (Licence Ouverte)', url: 'https://ciqual.anses.fr/', files: [used?.ciqual].filter(Boolean) },
      { id: 'cofid', title: "McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID), Public Health England", license: 'Open Government Licence v3.0', url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid', files: [used?.cofid].filter(Boolean) }
    ], ...extra
  };
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  writeFileSync(join(dir, 'top.json'), JSON.stringify(top));
  return meta;
}

// R2 uploads, a few at a time; micros/current.json last.
function put(bucket, key, file) {
  return new Promise((resolve, reject) => {
    const run = attempt => {
      const p = spawn(npx, ['--yes', 'wrangler@4', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', file, '--remote', '--content-type', 'application/json'], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', d => { err = (err + d).slice(-400); });
      p.on('close', code => {
        if (code === 0) return resolve();
        console.error(`Upload of ${key} failed (attempt ${attempt}): ${err}`);
        if (attempt < 3) setTimeout(() => run(attempt + 1), 2000 * attempt); else reject(new Error(`Could not upload ${key}`));
      });
    };
    run(1);
  });
}
export async function upload(dir, version, bucket, log = console.log) {
  const files = [...Array.from({ length: 256 }, (_, i) => `${String(i).padStart(3, '0')}.json`), 'top.json'];
  await put(bucket, `micros/${version}/meta.json`, join(dir, 'meta.json'));
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(files.slice(i, i + 8).map(f => put(bucket, `micros/${version}/${f}`, join(dir, f))));
    if (i % 64 === 0) log(`  uploaded ${Math.min(i + 8, files.length)} / ${files.length}`);
  }
  const current = join(dir, '..', `current-${version}.json`);
  writeFileSync(current, JSON.stringify({ format: MICROS_FORMAT, version }));
  await put(bucket, 'micros/current.json', current);
  log(`Done: micros/current.json -> ${version}`);
}

if (process.argv[1]?.endsWith('build-micronutrients.mjs')) {
  const args = process.argv.slice(2), flag = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const doUpload = args.includes('--upload'); if (doUpload) args.splice(args.indexOf('--upload'), 1);
  const bucket = flag('--bucket') || 'loadwise-food-catalog';
  const version = flag('--version') || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [work, outDir] = args;
  if (!work || !outDir) { console.error('Usage: node scripts/build-micronutrients.mjs <work-dir> <out-dir> [--upload] [--bucket name] [--version v]'); process.exit(2); }
  const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
  try {
    const { tables, used, errors, unavailable } = await loadTables(join(work, 'sources'), log);
    // Fail before the long catalogue download when a table or reference is missing.
    const early = [...errors, ...findRefs(tables).missing];
    if (early.length) throw new Error(`Build failed:\n${early.join('\n')}`);
    const cat = await fetchCatalogue(join(work, 'catalogue'), bucket, log);
    let result;
    try { result = compute({ tables, records: catalogueRecords(cat), log }); } catch (e) { errors.push(e.message); }
    if (errors.length) throw new Error(`Build failed:\n${errors.join('\n')}`);
    const { out, counts, top, refs, accepted } = result;
    const dir = join(outDir, version);
    const meta = writeOutput(out, dir, { version, counts, used, catalogue: cat.version, top, extra: { unavailable } });
    log(`counts: ${JSON.stringify(counts)}`);
    // A few values to check by eye, also kept as sample.json for the artifact.
    const examples = {};
    for (const id of ['chicken_breast', 'spinach', 'lentils', 'milk', 'egg', 'oats']) {
      const ref = [...refs.values()].find(r => r.entry.id === id);
      if (ref) examples[`${id} (reference ${ref.k} ${ref.n})`] = out.get(ref.k) || ref.v;
      // Prefer a product with a Czech barcode (GS1 859) and a Czech name.
      const est = accepted.find(a => a.m.entry.id === id && a.r.cs && a.r.k.startsWith('gtin:0859')) || accepted.find(a => a.m.entry.id === id && a.r.cs) || accepted.find(a => a.m.entry.id === id);
      if (est) examples[`${id} estimate ${est.r.k} "${est.r.cs || est.r.en || est.r.n}"`] = out.get(est.r.k);
    }
    for (const [k, v] of Object.entries(examples)) log(`example ${k}: ${JSON.stringify(v)}`);
    log(`top iron: ${JSON.stringify(top.fe)}`);
    writeFileSync(join(dir, 'sample.json'), JSON.stringify({ examples, first: Object.fromEntries([...out].slice(0, 100)), estimates: Object.fromEntries([...out].filter(([, v]) => v.x).slice(0, 100)) }, null, 1));
    if (doUpload) { log(`uploading ${version} to ${bucket}`); await upload(dir, version, bucket, log); }
    else log(`dry run: ${meta.counts.total} keys in ${dir}, nothing uploaded`);
  } catch (e) {
    console.error(e.stack || e.message);
    process.exit(1);
  }
}
