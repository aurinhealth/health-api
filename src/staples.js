// Basic foods (coffee, banana, rice, chicken breast…) from USDA FoodData
// Central, with a Czech and English name and their usual portion. Food search
// lists the ones that fit the query before the catalogue (world-foods.js),
// with a check mark in the app: values from a food composition table, not a
// label someone typed in. The list lives in the Worker (src/staples-data.js,
// about 40 KB), so it costs no D1 or R2 read.
import { STAPLES } from './staples-data.js';
import { lang } from './lang.js';

export const STAPLES_SHOWN = 4;
const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = s => fold(s).match(/[a-z0-9]+/g) || [];
const indexed = STAPLES.map((r, at) => ({ r, at, cs: words(r.cs), en: words(r.en) }));

export function stapleProduct(r, language = lang()) {
  const unit = r.u === 'ml' ? 'ml' : 'g', [size, cs, en] = r.s || [];
  return {
    barcode: null, name: language === 'en' ? r.en : r.cs, brand: '',
    serving_size: size ? `${size} ${unit}` : '', ...(size ? { serving_name: language === 'en' ? en : cs } : {}),
    quantity: '', piece_size: '', preferred_unit: null, nutrition_basis: unit,
    calories_100g: r.e, protein_100g: r.p, carbs_100g: r.c, fat_100g: r.f,
    sugars_100g: r.su ?? null, fiber_100g: r.fi ?? null, salt_100g: r.sa ?? null,
    source: 'table', source_name: 'USDA', source_url: `https://fdc.nal.usda.gov/food-details/${r.k.split(':')[1]}/nutrients`,
    catalog_key: r.k, confidence: 'table', label_verified: false
  };
}

// query: the search words (typos already fixed, world-foods.js), each the start
// of a word of the Czech or the English name. The name in the user's language
// that starts with the query comes first, then one with the query's whole
// words, then the list's own order (the
// usual food before its variants: coffee before decaf).
export function searchStaples(query, typed, language = lang()) {
  const qs = query.map(fold).filter(Boolean);
  if (!qs.some(q => q.length >= 3)) return [];
  const start = fold(typed).trim(), own = language === 'en' ? 'en' : 'cs';
  const hits = [];
  for (const s of indexed) {
    const fits = ws => qs.every(q => ws.some(w => w.startsWith(q)));
    if (!fits(s[own]) && !fits(s[own === 'en' ? 'cs' : 'en'])) continue;
    const name = fold(s.r[own]), whole = qs.every(q => s[own].includes(q));
    // "sýr" is cheese before "syrová" (raw), "olej" oil before tuna "v oleji".
    hits.push({ s, score: (name.startsWith(start) ? 0 : whole ? 1 : fits(s[own]) ? 2 : 3) * 10000 + s.at });
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, STAPLES_SHOWN).map(h => stapleProduct(h.s.r, language));
}
