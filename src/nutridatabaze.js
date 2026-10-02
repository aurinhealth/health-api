// Czech Food Composition Database (NutriDatabaze.cz, ÚZEI), the first source
// for a food searched by name. The rows come from the registered-user export
// (scripts/import-nutridatabaze.mjs) and live only in D1: the licence forbids
// passing the data file on, so they never join the public reference download.
import {rankFoods} from './food-reference.js';

export const NUTRIDATABAZE_URL = 'https://www.nutridatabaze.cz/';
// Wording required by the licence whenever the data is shown to the public.
export const nutridatabazeAttribution = version => `Na základě dat z NutriDatabaze.cz, verze ${version}, ÚZEI, Praha`;

const CACHE_MS = 10 * 60 * 1000;
let cache = null;

export function resetNutridatabazeCache() { cache = null; }

export function nutridatabazeProduct(row) {
  const id = /^\d+$/.test(String(row.code)) ? Number(row.code) : null;
  return {
    name: row.name,
    brand: 'Běžná potravina',
    quantity: '',
    nutrition_basis: 'g',
    calories_100g: row.calories_100g,
    protein_100g: row.protein_100g,
    carbs_100g: row.carbs_100g,
    fat_100g: row.fat_100g,
    fiber_100g: row.fiber_100g ?? null,
    salt_100g: row.salt_100g ?? null,
    source: 'nutridatabaze',
    source_url: id ? `https://www.nutridatabaze.cz/potraviny/?id=${id}` : NUTRIDATABAZE_URL,
    confidence: 'reference',
    nutridatabaze_code: String(row.code),
    version: row.version,
    attribution: nutridatabazeAttribution(row.version)
  };
}

// About a thousand short rows: read once per isolate and match in memory, so
// Czech word forms get the same tolerant matching as the reference foods.
async function loadRows(db) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  let rows = [];
  try {
    const result = await db.prepare('SELECT code,name,calories_100g,protein_100g,carbs_100g,fat_100g,fiber_100g,salt_100g,version FROM nutridatabaze_foods').all();
    // Shorter names are the plain food ("Banány" before "Banány sušené").
    rows = (result.results || []).sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'cs'));
  } catch {
    // Table not migrated yet: other sources still answer.
    return [];
  }
  cache = { at: Date.now(), rows };
  return rows;
}

export async function searchNutridatabaze(db, query, limit = 12) {
  if (!db || !String(query || '').trim()) return [];
  return rankFoods(await loadRows(db), query, limit).map(nutridatabazeProduct);
}
