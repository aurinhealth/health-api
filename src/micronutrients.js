// Vitamins and minerals of the food log. Catalogue foods carry them per 100 g
// (world-foods.js microsFor, built by scripts/build-micronutrients.mjs from
// USDA, Fineli, Ciqual and CoFID); a logged meal keeps the eaten amounts in its
// note (note.micros), so later catalogue versions never change a past day.
// Fibre, sugar and salt stay where they always were (fiber_g column,
// note.sugar_g, note.salt_g) and are the free part of the Živiny page.
import { L } from './lang.js';

// target: adult intake per day (EFSA population reference or adequate intake,
// US RDA where EFSA has none), [men, women]; limit: an upper bound instead.
export const NUTRIENTS = [
  { key: 'fiber', cs: 'Vláknina', en: 'Fibre', unit: 'g', group: 'main' },
  { key: 'sugar', cs: 'Cukry', en: 'Sugars', unit: 'g', group: 'main', limit: true },
  { key: 'salt', cs: 'Sůl', en: 'Salt', unit: 'g', group: 'main', limit: true },
  { key: 'fe', cs: 'Železo', en: 'Iron', unit: 'mg', group: 'min', target: [11, 16] },
  { key: 'ca', cs: 'Vápník', en: 'Calcium', unit: 'mg', group: 'min', target: [950, 950] },
  { key: 'mg', cs: 'Hořčík', en: 'Magnesium', unit: 'mg', group: 'min', target: [350, 300] },
  { key: 'k', cs: 'Draslík', en: 'Potassium', unit: 'mg', group: 'min', target: [3500, 3500] },
  { key: 'zn', cs: 'Zinek', en: 'Zinc', unit: 'mg', group: 'min', target: [11, 8] },
  { key: 'p', cs: 'Fosfor', en: 'Phosphorus', unit: 'mg', group: 'min', target: [700, 700] },
  { key: 'se', cs: 'Selen', en: 'Selenium', unit: 'µg', group: 'min', target: [70, 70] },
  { key: 'iod', cs: 'Jód', en: 'Iodine', unit: 'µg', group: 'min', target: [150, 150] },
  { key: 'vitd', cs: 'Vitamín D', en: 'Vitamin D', unit: 'µg', group: 'vit', target: [15, 15] },
  { key: 'b12', cs: 'Vitamín B12', en: 'Vitamin B12', unit: 'µg', group: 'vit', target: [4, 4] },
  { key: 'vitc', cs: 'Vitamín C', en: 'Vitamin C', unit: 'mg', group: 'vit', target: [110, 95] },
  { key: 'fol', cs: 'Folát', en: 'Folate', unit: 'µg', group: 'vit', target: [330, 330] },
  { key: 'vita', cs: 'Vitamín A', en: 'Vitamin A', unit: 'µg', group: 'vit', target: [750, 650] },
  { key: 'vite', cs: 'Vitamín E', en: 'Vitamin E', unit: 'mg', group: 'vit', target: [13, 11] },
  { key: 'vitk', cs: 'Vitamín K', en: 'Vitamin K', unit: 'µg', group: 'vit', target: [70, 70] },
  { key: 'b1', cs: 'Vitamín B1', en: 'Vitamin B1', unit: 'mg', group: 'vit', target: [1.2, 1.1] },
  { key: 'b2', cs: 'Vitamín B2', en: 'Vitamin B2', unit: 'mg', group: 'vit', target: [1.6, 1.6] },
  { key: 'b3', cs: 'Niacin', en: 'Niacin', unit: 'mg', group: 'vit', target: [16, 14] },
  { key: 'b6', cs: 'Vitamín B6', en: 'Vitamin B6', unit: 'mg', group: 'vit', target: [1.7, 1.6] }
];
export const MICRO_KEYS = NUTRIENTS.filter(n => n.target).map(n => n.key);
export const FREE_KEYS = ['fiber', 'sugar', 'salt'];
const BY_KEY = new Map(NUTRIENTS.map(n => [n.key, n]));
export const nutrientName = (key, language) => { const n = BY_KEY.get(key); return n ? (language === 'en' ? n.en : L(n.cs, n.en)) : key; };

const round3 = v => { if (!(v > 0)) return 0; const d = Math.max(0, 2 - Math.floor(Math.log10(v))); return Number(v.toFixed(Math.min(d, 4))); };

// Only known keys with plausible numbers per 100 g (a gram of pure iron is not food).
export function cleanMicros(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of MICRO_KEYS) {
    const v = Number(value[key]);
    if (value[key] != null && value[key] !== '' && Number.isFinite(v) && v >= 0 && v < 100000) out[key] = round3(v);
  }
  return Object.keys(out).length ? out : null;
}
export function scaleMicros(micros, factor) {
  const clean = cleanMicros(micros), f = Number(factor);
  if (!clean || !Number.isFinite(f) || f < 0) return null;
  for (const key of Object.keys(clean)) clean[key] = round3(clean[key] * f);
  return clean;
}

const noteOf = entry => { try { const n = JSON.parse(entry?.note || '{}'); return n && typeof n === 'object' && !Array.isArray(n) ? n : {}; } catch { return {}; } };
const eatenEntries = food => (Array.isArray(food?.entries) ? food.entries : []).filter(e => e && !['planned', 'cancelled'].includes(e.status));

// What one logged meal holds, by nutrient key.
export function entryNutrients(entry) {
  const note = noteOf(entry), out = {};
  const put = (key, v) => { const x = Number(v); if (v != null && v !== '' && Number.isFinite(x)) out[key] = x; };
  put('fiber', entry.fiber_g); put('sugar', note.sugar_g); put('salt', note.salt_g);
  const micros = cleanMicros(note.micros);
  if (micros) Object.assign(out, micros);
  return out;
}

// Tolerable upper intake levels for adults (EFSA, overview of ULs, 2025;
// iron: the safe level of 2024). An own target never goes above them. For
// magnesium and folate they count supplements and fortified folic acid only,
// so they are not used as a cap there.
export const UPPER = { vitd: 100, vita: 3000, vite: 300, b6: 12, zn: 25, se: 255, iod: 600, ca: 2500, fe: 40 };

// Plant iron and zinc are absorbed less: vegetarians need 1.8× the iron and
// up to 1.5× the zinc (IOM 2001). Vegans the same.
const PLANT_FACTOR = { fe: 1.8, zn: 1.5 };

// The Auto targets (sex, energy, diet) and, with Pro, the user's own ones
// (Settings: the nutrient detail → Target). own lists the keys set by hand.
export function targetsFor(profile = {}, kcalTarget = null, { own = true } = {}) {
  const female = profile?.sex === 'female', out = {}, auto = {};
  const plant = ['vegetarian', 'vegan'].includes(profile?.dietEating);
  for (const n of NUTRIENTS) if (n.target) {
    const base = n.target[female ? 1 : 0], factor = plant ? PLANT_FACTOR[n.key] || 1 : 1;
    auto[n.key] = Math.min(UPPER[n.key] ?? Infinity, Math.round(base * factor * 10) / 10);
  }
  // Fibre and sugar follow the energy target like the Jídlo screen (app-food.js).
  auto.fiber = kcalTarget != null ? Math.max(25, Math.round(kcalTarget / 1000 * 14)) : 30;
  auto.sugar = kcalTarget != null ? Math.round(kcalTarget * 0.1 / 4) : 50;
  auto.salt = 5;
  Object.assign(out, auto);
  const mine = own ? ownTargets(profile) : {};
  Object.assign(out, mine);
  Object.defineProperty(out, 'auto', { value: auto });
  Object.defineProperty(out, 'own', { value: Object.keys(mine) });
  return out;
}

// The user's own targets from the profile, known keys only, under the upper limit.
export function ownTargets(profile = {}) {
  const v = profile?.nutrientTargets, out = {};
  if (!v || typeof v !== 'object') return out;
  for (const key of Object.keys(v)) {
    const x = Number(v[key]);
    if (BY_KEY.has(key) && Number.isFinite(x) && x > 0) out[key] = Math.min(UPPER[key] ?? Infinity, Math.round(x * 100) / 100);
  }
  return out;
}

const fmt = v => v == null ? null : v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;

// The Živiny page: days of food logs (newest last), each { date, food }.
// Free accounts get fibre, sugar and salt; the rest comes back locked, without values.
export function buildNutrients({ days = [], profile = {}, kcalTarget = null, pro = false, language }) {
  const targets = targetsFor(profile, kcalTarget, { own: pro }), totals = {}, counted = {};
  let meals = 0, withMicros = 0;
  for (const { food } of days) for (const e of eatenEntries(food)) {
    meals++;
    const v = entryNutrients(e);
    if (MICRO_KEYS.some(k => k in v)) withMicros++;
    for (const [k, x] of Object.entries(v)) { totals[k] = (totals[k] || 0) + x; counted[k] = true; }
  }
  const n = Math.max(1, days.length);
  const items = NUTRIENTS.map(def => {
    const locked = !pro && !FREE_KEYS.includes(def.key);
    const eaten = locked ? null : fmt((totals[def.key] || 0) / n), target = targets[def.key];
    return {
      key: def.key, name: nutrientName(def.key, language), unit: def.unit, group: def.group,
      eaten, target, limit: Boolean(def.limit), locked,
      percent: eaten == null || !target ? null : Math.round(eaten / target * 100),
      known: locked ? null : Boolean(counted[def.key])
    };
  });
  return { days: days.length, pro, meals, withMicros, items, coach: pro ? nutrientCoach(items, days.length, language) : null };
}

const FOODS_FOR = {
  fe: ['luštěniny, červené maso nebo ryby', 'legumes, red meat or fish'], vitd: ['tučné ryby nebo vejce', 'oily fish or eggs'],
  ca: ['mléčné výrobky nebo mák', 'dairy or poppy seeds'], mg: ['ořechy, semínka nebo celozrnné pečivo', 'nuts, seeds or wholegrain bread'],
  k: ['brambory, banány nebo luštěniny', 'potatoes, bananas or legumes'], zn: ['maso, sýry nebo dýňová semínka', 'meat, cheese or pumpkin seeds'],
  b12: ['maso, ryby, vejce nebo mléko', 'meat, fish, eggs or milk'], vitc: ['papriku, citrusy nebo kiwi', 'peppers, citrus or kiwi'],
  fol: ['listovou zeleninu nebo luštěniny', 'leafy greens or legumes'], iod: ['ryby, mléko nebo jodidovanou sůl', 'fish, milk or iodised salt'],
  se: ['para ořechy, ryby nebo vejce', 'Brazil nuts, fish or eggs'], vita: ['mrkev, batáty nebo špenát', 'carrots, sweet potatoes or spinach']
};
const GENITIVE = { fiber: 'vlákniny', sugar: 'cukrů', salt: 'soli', p: 'fosforu', vite: 'vitamínu E', vitk: 'vitamínu K', b1: 'vitamínu B1', b2: 'vitamínu B2', b3: 'niacinu', b6: 'vitamínu B6', fe: 'železa', ca: 'vápníku', mg: 'hořčíku', k: 'draslíku', zn: 'zinku', se: 'selenu', iod: 'jódu', vitd: 'vitamínu D', b12: 'vitamínu B12', vitc: 'vitamínu C', fol: 'folátu', vita: 'vitamínu A' };
// One sentence: the two vitamins or minerals furthest under the target, with foods that have them.
export function nutrientCoach(items, days, language) {
  const en = language === 'en';
  const low = items.filter(i => i.known && i.target && !i.limit && !['fiber'].includes(i.key) && i.percent != null && i.percent < 60 && FOODS_FOR[i.key])
    .sort((a, b) => a.percent - b.percent).slice(0, 2);
  if (!low.length) return null;
  const names = low.map(i => en ? BY_KEY.get(i.key).en.replace(/^[A-Z]/, c => c.toLowerCase()) : (GENITIVE[i.key] || i.name));
  const when = days > 1 ? (en ? 'All week you have had' : 'Celý týden máš') : (en ? 'Today you have had' : 'Dnes máš');
  const foods = FOODS_FOR[low[0].key][en ? 1 : 0];
  return en ? `${when} little ${names.join(' and ')}. Add ${foods}.` : `${when} málo ${names.join(' a ')}. Přidej ${foods}.`;
}

// One nutrient: today's amount, the 7-day average against the target, the
// meals it came from today and foods rich in it (top.json of the micro build).
export function buildNutrientDetail({ key, today, week = [], profile = {}, kcalTarget = null, rich = [], pro = false, language }) {
  const def = BY_KEY.get(key);
  if (!def) return null;
  const targets = targetsFor(profile, kcalTarget, { own: pro }), target = targets[key];
  const sum = food => eatenEntries(food).reduce((s, e) => s + (entryNutrients(e)[key] || 0), 0);
  const eaten = fmt(sum(today));
  const avg = week.length ? week.reduce((s, d) => s + sum(d.food), 0) / week.length : null;
  const sources = eatenEntries(today).map(e => ({ name: String(e.recipe_title || L('Jídlo', 'Food')).slice(0, 120), amount: fmt(entryNutrients(e)[key] || 0) }))
    .filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 8);
  return {
    key, name: nutrientName(key, language), unit: def.unit, limit: Boolean(def.limit), eaten, target,
    // The Target row: Aurin's own value, whether the user set one, the upper
    // limit, and why Auto is higher (vegetarian iron and zinc).
    autoTarget: targets.auto[key], custom: targets.own.includes(key), upperLimit: UPPER[key] ?? null,
    autoBasis: PLANT_FACTOR[key] && ['vegetarian', 'vegan'].includes(profile?.dietEating) ? profile.dietEating : null,
    percent: target ? Math.round(eaten / target * 100) : null,
    weekPercent: avg != null && target ? Math.round(avg / target * 100) : null,
    sources,
    richTitle: language === 'en' ? `Rich in ${def.en.replace(/^[A-Z]/, c => c.toLowerCase())}` : `Hodně ${GENITIVE[key]} má`,
    rich: (Array.isArray(rich) ? rich : []).slice(0, 8).map(r => ({ name: String((language === 'en' ? r.en || r.n : r.cs || r.n) || '').slice(0, 120), per100: fmt(Number(r.v)) })).filter(r => r.name && r.per100 > 0)
  };
}

// Up to three nutrients a Pro account pins to the Jídlo screen (dashboard_profile row 5).
export const FAVORITES_ROW = 5;
export const cleanFavorites = value => [...new Set((Array.isArray(value) ? value : []).map(String).filter(k => BY_KEY.has(k)))].slice(0, 3);
export async function nutrientFavorites(db, userId) {
  const row = await db.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=?').bind(userId, FAVORITES_ROW).first().catch(() => null);
  try { return cleanFavorites(JSON.parse(row?.profile_json || 'null')?.favorites); } catch { return []; }
}
export async function saveNutrientFavorites(db, userId, favorites) {
  const clean = cleanFavorites(favorites);
  await db.prepare('CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY(user_id,id))').run();
  await db.prepare('INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET profile_json=excluded.profile_json').bind(userId, FAVORITES_ROW, JSON.stringify({ favorites: clean })).run();
  return clean;
}

// Foods rich in each nutrient, written next to the shards by build-micronutrients.mjs.
let topCache = null;
export async function microTop(env) {
  const bucket = env.FOOD_CATALOG_R2;
  if (!bucket) return {};
  if (topCache && topCache.until > Date.now()) return topCache.value;
  const current = await bucket.get('micros/current.json').then(o => o?.json()).catch(() => null);
  const value = current?.version ? await bucket.get(`micros/${current.version}/top.json`).then(o => o?.json()).catch(() => null) || {} : {};
  topCache = { value, until: Date.now() + 10 * 60 * 1000 };
  return value;
}
