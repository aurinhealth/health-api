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
// GET /app/api/recipes/marks   the user's saved and hidden recipes
// PUT /app/api/recipes/marks   {id, mark: "saved" | "hidden" | null}
// "exclude" takes EU allergens, ingredient keys and the groups of foods people
// often don't eat ("I don't eat": pork, mushrooms, ...), comma separated.
import { L, lang } from './lang.js';

export const RECIPES_FORMAT = 1;
export const DIETS = ['everything', 'pescatarian', 'vegetarian', 'vegan'];
export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
// The 14 allergens of EU Regulation 1169/2011 Annex II, as the recipes name them.
export const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree_nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'];
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
export const fitsDiet = (recipeDiet, userDiet) => !userDiet || DIETS.indexOf(recipeDiet) >= DIETS.indexOf(userDiet);
const bad = message => Object.assign(new Error(message), { status: 400 });

// Allergens, ingredient keys and groups to one set of what the recipe must not
// have. Something it doesn't know is refused, never ignored: a filter that
// silently lets an allergen through is worse than an error.
export function excluded(index, value) {
  const allergens = new Set(), keys = new Set();
  for (const raw of String(value || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const token = raw.includes(':') ? raw : raw.toLowerCase();
    if (Object.hasOwn(index.groups || {}, token)) index.groups[token].forEach(k => keys.add(k));
    else if (token.includes(':')) keys.add(token);
    else if (ALLERGENS.includes(token)) allergens.add(token);
    else throw bad(L(`Neznámá položka „${raw}“.`, `Unknown item "${raw}".`));
  }
  return { allergens, keys };
}

export function filterRecipes(index, { slot, diet, exclude, q, keto, lowerCarb } = {}) {
  diet = diet ? String(diet).trim().toLowerCase() : null;
  if (diet && !DIETS.includes(diet)) throw bad(L(`Neznámá dieta „${diet}“.`, `Unknown diet "${diet}".`));
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

// Saved ("Save recipe") and hidden ("Don't suggest again") recipes, one row
// per recipe; hiding a saved recipe replaces the mark. Kept while health data
// is paused (they say nothing about the body), deleted with the account.
export const MARKS = ['saved', 'hidden'];
export const MAX_MARKS = 2000;
async function ensureMarks(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS recipe_marks (
    user_id INTEGER NOT NULL, recipe_id TEXT NOT NULL, mark TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, recipe_id))`).run();
}
const missingTable = error => /no such table/i.test(String(error?.message || error));
export async function recipeMarks(db, userId) {
  const rows = await db.prepare('SELECT recipe_id, mark FROM recipe_marks WHERE user_id=? ORDER BY created_at DESC').bind(userId).all()
    .then(r => r.results || []).catch(error => { if (missingTable(error)) return []; throw error; });
  return Object.fromEntries(MARKS.map(m => [m, rows.filter(r => r.mark === m).map(r => r.recipe_id)]));
}
export async function setRecipeMark(db, userId, index, { id, mark } = {}) {
  if (!index.byId.has(String(id))) throw Object.assign(new Error(L('Recept nebyl nalezen.', "The recipe wasn't found.")), { status: 404 });
  if (mark != null && !MARKS.includes(mark)) throw Object.assign(new Error(L('Neznámé označení.', 'Unknown mark.')), { status: 400 });
  await ensureMarks(db);
  if (mark == null) { await db.prepare('DELETE FROM recipe_marks WHERE user_id=? AND recipe_id=?').bind(userId, String(id)).run(); return recipeMarks(db, userId); }
  // A recipe already marked may always change its mark, even at the cap.
  const count = (await db.prepare('SELECT COUNT(*) AS n, SUM(recipe_id=?) AS here FROM recipe_marks WHERE user_id=?').bind(String(id), userId).first()) || {};
  if (!count.here && (count.n || 0) >= MAX_MARKS) throw Object.assign(new Error(L('Označených receptů je moc, nějaké nejdřív odeber.', 'Too many marked recipes; remove some first.')), { status: 400 });
  await db.prepare('INSERT INTO recipe_marks(user_id,recipe_id,mark,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,recipe_id) DO UPDATE SET mark=excluded.mark,created_at=excluded.created_at')
    .bind(userId, String(id), mark, new Date().toISOString()).run();
  return recipeMarks(db, userId);
}

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export async function handleRecipesApi(request, env, url, session = {}) {
  const path = url.pathname;
  if (path !== '/app/api/recipes' && !path.startsWith('/app/api/recipes/')) return undefined;
  const marks = path === '/app/api/recipes/marks';
  if (!recipesOn(env) || !(request.method === 'GET' || (marks && request.method === 'PUT'))) return json({ message: L('Nenalezeno.', 'Not found.') }, 404);
  if (!session.signedIn) return json({ message: L('Přihlas se do aplikace.', 'Sign in to the app.') }, 401);
  if (marks && request.method === 'GET') return json({ status: 'ok', ...await recipeMarks(env.DB, env.USER_ID) });
  const bucket = env.FOOD_CATALOG_R2, index = bucket ? await recipeIndex(bucket).catch(() => null) : null;
  if (!index) return json({ message: L('Recepty teď nejdou načíst.', "Recipes can't be loaded right now.") }, 503);
  if (marks) {
    if (request.headers.get('Origin') !== url.origin) return json({ message: L('Neplatný původ požadavku.', 'Invalid request origin.') }, 403);
    try {
      const body = await request.json().catch(() => ({}));
      return json({ status: 'ok', ...await setRecipeMark(env.DB, env.USER_ID, index, body) });
    } catch (error) { if (error.status) return json({ message: error.message }, error.status); throw error; }
  }
  if (path === '/app/api/recipes/index') {
    // Compression on the way out may turn the tag weak (W/"..."); the app may send several.
    const etag = `"${index.version}-${lang()}"`, sent = String(request.headers.get('If-None-Match') || '').split(',').map(t => t.trim().replace(/^W\//, ''));
    if (sent.includes(etag)) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, max-age=86400' } });
    return json({ status: 'ok', version: index.version, recipes: index.recipes.map(r => ({ ...row(r), ingredients: r.ingredients, keto: r.keto, lowerCarb: r.lowerCarb })),
      ingredients: index.ingredients.map(i => ({ k: i.k, name: lang() === 'en' ? i.en : i.cs, recipes: i.n })), groups: index.groups },
    200, { ETag: etag, 'Cache-Control': 'private, max-age=86400' });
  }
  if (path === '/app/api/recipes') {
    const p = url.searchParams, slot = SLOTS.includes(p.get('slot')) ? p.get('slot') : null;
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(p.get('limit')) || PAGE)), from = Math.max(0, Number(p.get('cursor')) || 0);
    let found;
    try {
      found = filterRecipes(index, { slot, diet: p.get('diet'), exclude: p.get('exclude'), q: p.get('q'), keto: p.get('keto') === 'true', lowerCarb: p.get('lowerCarb') === 'true' });
    } catch (error) { if (error.status === 400) return json({ message: error.message }, 400); throw error; }
    const page = found.slice(from, from + limit);
    return json({ status: 'ok', version: index.version, total: found.length, recipes: page.map(row), next: from + limit < found.length ? String(from + limit) : null });
  }
  let id;
  try { id = decodeURIComponent(path.slice('/app/api/recipes/'.length)); } catch { id = null; }
  const recipe = id ? await recipeDetail(bucket, index, id) : null;
  if (!recipe) return json({ message: L('Recept nebyl nalezen.', "The recipe wasn't found.") }, 404);
  return json({ status: 'ok', version: index.version, recipe });
}
