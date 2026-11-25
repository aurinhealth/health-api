// The recipe library of the food version (scripts/build-recipes.mjs), read
// from R2 like the world food catalogue: recipes/current.json names the
// version, recipes/<version>/index.json carries what the list and its filters
// need, and one ranged read of recipes/<version>/details.txt gives a recipe.
// Off until RECIPES_ENABLED is "true" (staging only until the food version
// ships): every route answers 404 then.
//
// GET /app/api/recipes?slot=&diet=&exclude=&q=&limit=&cursor=  the list
// GET /app/api/recipes/index    the whole index for the app to keep (ETag = version)
// GET /app/api/recipes/<id>     one recipe in the app's language
// "exclude" takes EU allergens, ingredient keys and the groups of foods people
// often don't eat ("I don't eat": pork, mushrooms, ...), comma separated.
import { L, lang } from './lang.js';

export const RECIPES_FORMAT = 1;
export const DIETS = ['everything', 'pescatarian', 'vegetarian', 'vegan'];
export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const PAGE = 30;
export const MAX_PAGE = 50;
const TTL_MS = 10 * 60 * 1000;

export const recipesOn = env => String(env?.RECIPES_ENABLED || '') === 'true';
const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

// The index stays in the isolate's memory for 10 minutes (about 1.2 MB).
const memo = new WeakMap();
export async function recipeIndex(bucket) {
  const hit = memo.get(bucket);
  if (hit && hit.until > Date.now()) return hit.index;
  const current = await (await bucket.get('recipes/current.json'))?.json().catch(() => null);
  if (current?.format !== RECIPES_FORMAT || !current.version) return null;
  if (hit?.index?.version === current.version) { hit.until = Date.now() + TTL_MS; return hit.index; }
  const index = await (await bucket.get(`recipes/${current.version}/index.json`))?.json();
  if (!index) return null;
  index.byId = new Map(index.recipes.map(r => [r.id, r]));
  index.searchText = new Map(index.recipes.map(r => [r.id, fold(`${r.title.cs} ${r.title.en}`)]));
  memo.set(bucket, { index, until: Date.now() + TTL_MS });
  return index;
}

// A recipe the user can be offered: a vegan dish suits every diet, a fish dish a pescatarian and everyone.
export const fitsDiet = (recipeDiet, userDiet) => !DIETS.includes(userDiet) || DIETS.indexOf(recipeDiet) >= DIETS.indexOf(userDiet);

// Allergens, ingredient keys and groups to one set of what the recipe must not have.
export function excluded(index, value) {
  const allergens = new Set(), keys = new Set();
  for (const raw of String(value || '').split(',').map(s => s.trim()).filter(Boolean)) {
    if (index.groups?.[raw]) index.groups[raw].forEach(k => keys.add(k));
    else if (raw.includes(':')) keys.add(raw);
    else allergens.add(raw);
  }
  return { allergens, keys };
}

export function filterRecipes(index, { slot, diet, exclude, q, keto, lowerCarb } = {}) {
  const ex = excluded(index, exclude), words = fold(q).match(/[a-z0-9]+/g) || [];
  return index.recipes.filter(r => (!slot || r.slot === slot) && fitsDiet(r.diet, diet)
    && (!keto || r.keto) && (!lowerCarb || r.lowerCarb || r.keto)
    && !r.allergens.some(a => ex.allergens.has(a)) && !r.ingredients.some(k => ex.keys.has(k))
    && words.every(w => index.searchText.get(r.id).includes(w)));
}

const pick = value => value && typeof value === 'object' && !Array.isArray(value) && 'cs' in value && 'en' in value
  ? value[lang() === 'en' ? 'en' : 'cs']
  : Array.isArray(value) ? value.map(pick)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pick(v)])) : value;
// What a row of the list shows.
const row = r => ({ id: r.id, title: pick(r.title), slot: r.slot, region: r.region, diet: r.diet, cuisine: r.cuisine, minutes: r.minutes,
  difficulty: r.difficulty, allergens: r.allergens, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat });

export async function recipeDetail(bucket, index, id) {
  const r = index.byId.get(String(id));
  if (!r) return null;
  const [offset, length] = r.at, key = `recipes/${index.version}/details.txt`;
  const url = `https://recipes.internal/${index.version}/${encodeURIComponent(r.id)}`, store = globalThis.caches?.default;
  let text = await store?.match(url).then(x => x?.text()).catch(() => null);
  if (text == null) {
    const o = await bucket.get(key, { range: { offset, length } });
    if (!o) return null;
    text = await o.text();
    await store?.put(url, new Response(text, { headers: { 'Cache-Control': 'max-age=86400' } })).catch(() => {});
  }
  return pick(JSON.parse(text));
}

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export async function handleRecipesApi(request, env, url, session = {}) {
  const path = url.pathname;
  if (path !== '/app/api/recipes' && !path.startsWith('/app/api/recipes/')) return undefined;
  if (!recipesOn(env) || request.method !== 'GET') return json({ message: L('Nenalezeno.', 'Not found.') }, 404);
  if (!session.signedIn) return json({ message: L('Přihlas se do aplikace.', 'Sign in to the app.') }, 401);
  const bucket = env.FOOD_CATALOG_R2, index = bucket ? await recipeIndex(bucket).catch(() => null) : null;
  if (!index) return json({ message: L('Recepty teď nejdou načíst.', "Recipes can't be loaded right now.") }, 503);
  if (path === '/app/api/recipes/index') {
    const etag = `"${index.version}-${lang()}"`;
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
    return json({ status: 'ok', version: index.version, recipes: index.recipes.map(r => ({ ...row(r), ingredients: r.ingredients, keto: r.keto, lowerCarb: r.lowerCarb })),
      ingredients: index.ingredients.map(i => ({ k: i.k, name: lang() === 'en' ? i.en : i.cs, recipes: i.n })), groups: index.groups },
    200, { ETag: etag, 'Cache-Control': 'private, max-age=86400' });
  }
  if (path === '/app/api/recipes') {
    const p = url.searchParams, slot = SLOTS.includes(p.get('slot')) ? p.get('slot') : null;
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(p.get('limit')) || PAGE)), from = Math.max(0, Number(p.get('cursor')) || 0);
    const found = filterRecipes(index, { slot, diet: p.get('diet'), exclude: p.get('exclude'), q: p.get('q'), keto: p.get('keto') === 'true', lowerCarb: p.get('lowerCarb') === 'true' });
    const page = found.slice(from, from + limit);
    return json({ status: 'ok', version: index.version, total: found.length, recipes: page.map(row), next: from + limit < found.length ? String(from + limit) : null });
  }
  const recipe = await recipeDetail(bucket, index, decodeURIComponent(path.slice('/app/api/recipes/'.length)));
  if (!recipe) return json({ message: L('Recept nebyl nalezen.', "The recipe wasn't found.") }, 404);
  return json({ status: 'ok', version: index.version, recipe });
}
