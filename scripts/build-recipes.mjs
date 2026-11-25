// The recipe library for the food version (src/recipes.js). The recipes live
// in the private repository aurin-prompts (recipes/recipes.json, checked out to
// src/private), so the public repository never carries their texts.
//
// node scripts/build-recipes.mjs [source] [outDir]
// writes outDir/<version>/index.json (what the list and filters need, with each
// recipe's place in details.txt), outDir/<version>/details.txt (one recipe per
// line, read with one ranged read) and outDir/current.json (written last by
// the upload). It prints how many recipes each meal x diet x region cell has:
// the planner ships when every cell has at least 30 (NAVRH.md, release
// conditions).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STAPLES } from '../src/staples-data.js';

export const RECIPES_FORMAT = 1;
export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const DIETS = ['everything', 'pescatarian', 'vegetarian', 'vegan'];
export const REGIONS = ['intl', 'cz'];
export const MIN_PER_CELL = 30;
// The 14 allergens of EU Regulation 1169/2011 Annex II, as the recipes name them.
export const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree_nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'];
// Foods people often just don't eat ("I don't eat", NAVRH.md): ticked as one
// row, they stand for every ingredient whose English name matches.
export const GROUPS = {
  pork: /\b(pork|bacon|ham|prosciutto|pancetta|chorizo|salami|lard|sausage)\b/i,
  beef: /\b(beef|steak|veal)\b/i,
  mushrooms: /\b(mushrooms?|champignons?|shiitake|porcini|chanterelles?)\b/i,
  offal: /\b(liver|kidneys?(?! beans?)|offal|tripe|giblets?)\b/i,
  coriander: /\b(coriander|cilantro)\b/i,
  olives: /\bolives?\b(?! oil)/i,
  spicy: /\b(chil(l)?i|chilies|jalape(n|ñ)o|cayenne|sriracha|harissa|gochujang|hot sauce|sambal)\b/i
};

const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// An ingredient without a catalogue food (herbs, spices) gets a key from its English name.
export const untrackedKey = item => 'u:' + fold(item.untracked?.en).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const keyOf = item => item.k || untrackedKey(item);
const round = v => Math.round(Number(v) || 0);

export function build(recipes, { extra = [] } = {}) {
  const names = new Map([...STAPLES, ...extra].map(f => [f.k, { cs: f.cs, en: f.en }]));
  const ingredients = new Map(), problems = [], ids = new Set();
  const lines = [], index = [];
  let offset = 0;
  for (const r of [...recipes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (ids.has(r.id)) { problems.push(`${r.id}: twice`); continue; }
    ids.add(r.id);
    if (!SLOTS.includes(r.slot)) problems.push(`${r.id}: slot ${r.slot}`);
    if (!DIETS.includes(r.diet?.eating)) problems.push(`${r.id}: diet ${r.diet?.eating}`);
    if (!REGIONS.includes(r.region)) problems.push(`${r.id}: region ${r.region}`);
    for (const a of r.allergens || []) if (!ALLERGENS.includes(a)) problems.push(`${r.id}: allergen ${a}`);
    const keys = new Set();
    for (const item of (r.components || []).flatMap(c => c.items || [])) {
      const k = keyOf(item);
      keys.add(k);
      const name = names.get(k) || (item.untracked ? { cs: item.untracked.cs, en: item.untracked.en } : null);
      if (!name) { problems.push(`${r.id}: no name for ${k}`); continue; }
      const seen = ingredients.get(k) || { k, cs: name.cs, en: name.en, n: 0 };
      seen.n++;
      ingredients.set(k, seen);
    }
    const line = JSON.stringify(r), length = Buffer.byteLength(line) + 1;
    lines.push(line);
    const n = r.nutrition_per_serving || {};
    index.push({
      id: r.id, region: r.region, slot: r.slot, title: r.title, diet: r.diet.eating, keto: !!r.diet.keto, lowerCarb: !!r.diet.lower_carb,
      allergens: r.allergens || [], ingredients: [...keys].sort(), cuisine: r.cuisine || null, minutes: r.total_min ?? r.time_min ?? null,
      difficulty: r.difficulty ?? null, role: r.training_role || null,
      kcal: round(n.kcal), protein: round(n.protein), carbs: round(n.carbs), fat: round(n.fat),
      at: [offset, length]
    });
    offset += length;
  }
  const list = [...ingredients.values()].sort((a, b) => b.n - a.n || a.en.localeCompare(b.en));
  const groups = Object.fromEntries(Object.entries(GROUPS).map(([g, re]) => [g, list.filter(i => re.test(i.en)).map(i => i.k)]));
  const details = lines.join('\n') + '\n';
  const version = 'r' + createHash('sha256').update(details).digest('hex').slice(0, 12);
  return { version, index: { format: RECIPES_FORMAT, version, recipes: index, ingredients: list, groups }, details, problems, coverage: coverage(index) };
}

// Recipes a user of each diet can be offered: a vegan dish suits everyone.
const fits = (recipeDiet, userDiet) => DIETS.indexOf(recipeDiet) >= DIETS.indexOf(userDiet);
export function coverage(index) {
  const rows = [];
  for (const region of REGIONS) for (const slot of SLOTS) for (const diet of DIETS) {
    // The planner offers global recipes everywhere and regional ones in their region.
    const n = index.filter(r => r.slot === slot && fits(r.diet, diet) && (r.region === 'intl' || r.region === region)).length;
    rows.push({ region, slot, diet, n, ok: n >= MIN_PER_CELL });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = process.argv[2] || 'src/private/recipes/recipes.json', out = process.argv[3] || 'out/recipes';
  const extraPath = join(source, '..', 'extra-ingredients.json');
  let extra = [];
  try { extra = JSON.parse(readFileSync(extraPath, 'utf8')); } catch { /* every name in the staples */ }
  const result = build(JSON.parse(readFileSync(source, 'utf8')), { extra });
  if (result.problems.length) { console.error(result.problems.join('\n')); process.exit(1); }
  mkdirSync(join(out, result.version), { recursive: true });
  writeFileSync(join(out, result.version, 'index.json'), JSON.stringify(result.index));
  writeFileSync(join(out, result.version, 'details.txt'), result.details);
  writeFileSync(join(out, 'current.json'), JSON.stringify({ format: RECIPES_FORMAT, version: result.version }));
  console.log(`version ${result.version}: ${result.index.recipes.length} recipes, ${result.index.ingredients.length} ingredients`);
  console.log(`index ${Buffer.byteLength(JSON.stringify(result.index))} bytes, details ${Buffer.byteLength(result.details)} bytes`);
  for (const [g, keys] of Object.entries(result.index.groups)) console.log(`group ${g}: ${keys.length} ingredients`);
  console.log('region slot diet: recipes (planner needs ' + MIN_PER_CELL + ')');
  for (const c of result.coverage) console.log(`${c.region} ${c.slot} ${c.diet}: ${c.n}${c.ok ? '' : '  < ' + MIN_PER_CELL}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\n`, { flag: 'a' });
}
