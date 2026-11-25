import test from 'node:test';
import assert from 'node:assert/strict';
import { build, coverage, untrackedKey, MIN_PER_CELL } from '../scripts/build-recipes.mjs';
import { handleRecipesApi, recipeIndex, filterRecipes, fitsDiet } from '../src/recipes.js';
import { withLang } from '../src/lang.js';

const recipe = (id, o = {}) => ({
  id, region: 'intl', slot: 'lunch', title: { cs: `Rýže ${id}`, en: `Rice ${id}` }, diet: { eating: 'everything', keto: false, lower_carb: false },
  allergens: [], total_min: 20, difficulty: 1, cuisine: 'czech',
  components: [{ role: 'carb', items: [{ k: 'usda_sr_legacy:168877', grams: 75, display: { cs: 'rýže 75 g', en: '75 g rice' } }] }],
  nutrition_per_serving: { kcal: 600.4, protein: 35.2, carbs: 80.6, fat: 12 }, phases: [{ steps: { cs: ['Uvařte.'], en: ['Cook.'] } }], ...o
});
const RECIPES = [
  recipe('a1'),
  recipe('a2', { slot: 'breakfast', diet: { eating: 'vegan', keto: false, lower_carb: false }, allergens: ['gluten'], title: { cs: 'Ovesná kaše', en: 'Porridge' } }),
  recipe('a3', { diet: { eating: 'pescatarian', keto: false, lower_carb: false }, allergens: ['fish'],
    components: [{ role: 'protein', items: [{ untracked: { cs: 'koriandr', en: 'coriander leaves' }, grams: 5, display: { cs: 'koriandr', en: 'coriander' } }] }] }),
  recipe('a4', { components: [{ role: 'protein', items: [{ k: 'usda_sr_legacy:173864', grams: 50, display: { cs: 'šunka', en: 'ham' } }] }] })
];

// An R2 bucket in memory with ranged reads.
function bucketOf(files) {
  const reads = [];
  return {
    reads,
    async get(key, opts) {
      reads.push(key);
      if (!(key in files)) return null;
      let text = files[key];
      if (opts?.range) text = Buffer.from(text).subarray(opts.range.offset, opts.range.offset + opts.range.length).toString();
      return { json: async () => JSON.parse(text), text: async () => text };
    }
  };
}
function env(on = true) {
  const b = build(RECIPES);
  assert.deepEqual(b.problems, []);
  return { RECIPES_ENABLED: on ? 'true' : 'false', FOOD_CATALOG_R2: bucketOf({ 'recipes/current.json': JSON.stringify({ format: 1, version: b.version }), [`recipes/${b.version}/index.json`]: JSON.stringify(b.index), [`recipes/${b.version}/details.txt`]: b.details }) };
}
const call = (e, path, { lang = 'en', signedIn = true, headers = {} } = {}) => withLang(lang, () => handleRecipesApi(new Request('https://x.test' + path, { headers }), e, new URL('https://x.test' + path), { signedIn }));

test('build: index, offsets, groups and the untracked key', () => {
  const b = build(RECIPES);
  assert.equal(b.index.recipes.length, 4);
  assert.match(b.version, /^r[0-9a-f]{12}$/);
  for (const r of b.index.recipes) assert.equal(JSON.parse(Buffer.from(b.details).subarray(r.at[0], r.at[0] + r.at[1]).toString()).id, r.id);
  assert.equal(untrackedKey({ untracked: { en: 'Coriander leaves' } }), 'u:coriander_leaves');
  assert.deepEqual(b.index.groups.coriander, ['u:coriander_leaves']);
  assert.deepEqual(b.index.groups.pork, ['usda_sr_legacy:173864']);
  assert.equal(b.index.recipes.find(r => r.id === 'a1').kcal, 600);
});

test('build: reports a duplicate id, an unknown allergen and an unnamed ingredient', () => {
  const b = build([recipe('x'), recipe('x'), recipe('y', { allergens: ['nuts'], components: [{ items: [{ k: 'extra:nothing', grams: 1 }] }] })]);
  assert.deepEqual(b.problems, ['x: twice', 'y: allergen nuts', 'y: no name for extra:nothing']);
});

test('coverage counts what the planner can offer per region and diet', () => {
  const rows = coverage(build(RECIPES).index.recipes);
  const cell = (region, slot, diet) => rows.find(r => r.region === region && r.slot === slot && r.diet === diet);
  assert.equal(cell('intl', 'lunch', 'everything').n, 3);
  assert.equal(cell('intl', 'lunch', 'pescatarian').n, 1);
  assert.equal(cell('cz', 'breakfast', 'vegan').n, 1);
  assert.equal(cell('intl', 'lunch', 'everything').ok, 3 >= MIN_PER_CELL);
});

test('diets: a vegan dish suits everyone, meat only "everything"', () => {
  assert.equal(fitsDiet('vegan', 'vegetarian'), true);
  assert.equal(fitsDiet('everything', 'pescatarian'), false);
  assert.equal(fitsDiet('pescatarian', 'pescatarian'), true);
  assert.equal(fitsDiet('everything', undefined), true);
});

test('filters: slot, diet, allergen, ingredient key, group and text', async () => {
  const index = await recipeIndex(env().FOOD_CATALOG_R2);
  const ids = o => filterRecipes(index, o).map(r => r.id);
  assert.deepEqual(ids({ slot: 'breakfast' }), ['a2']);
  assert.deepEqual(ids({ diet: 'pescatarian' }), ['a2', 'a3']);
  assert.deepEqual(ids({ exclude: 'gluten,fish' }), ['a1', 'a4']);
  assert.deepEqual(ids({ exclude: 'usda_sr_legacy:173864' }), ['a1', 'a2', 'a3']);
  assert.deepEqual(ids({ exclude: 'pork,coriander' }), ['a1', 'a2']);
  assert.deepEqual(ids({ q: 'ovesna' }), ['a2']);
  assert.deepEqual(ids({ q: 'porridge' }), ['a2']);
});

test('routes: 404 while off, 401 signed out, list with pages, detail in the language', async () => {
  assert.equal((await call(env(false), '/app/api/recipes')).status, 404);
  assert.equal(await call(env(), '/app/api/food/recipes'), undefined);
  const e = env();
  assert.equal((await call(e, '/app/api/recipes', { signedIn: false })).status, 401);
  const list = await (await call(e, '/app/api/recipes?limit=3')).json();
  assert.equal(list.total, 4);
  assert.equal(list.recipes.length, 3);
  assert.equal(list.next, '3');
  assert.equal(list.recipes[0].title, 'Rice a1');
  const last = await (await call(e, '/app/api/recipes?limit=3&cursor=3')).json();
  assert.deepEqual(last.recipes.map(r => r.id), ['a4']);
  assert.equal(last.next, null);
  const cs = await (await call(e, '/app/api/recipes/a2', { lang: 'cs' })).json();
  assert.equal(cs.recipe.title, 'Ovesná kaše');
  assert.deepEqual(cs.recipe.phases[0].steps, ['Uvařte.']);
  assert.equal((await call(e, '/app/api/recipes/nope')).status, 404);
});

test('index route answers 304 for the version the app has', async () => {
  const e = env();
  const first = await call(e, '/app/api/recipes/index');
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.recipes.length, 4);
  assert.ok(body.groups.pork);
  const again = await call(e, '/app/api/recipes/index', { headers: { 'If-None-Match': first.headers.get('ETag') } });
  assert.equal(again.status, 304);
});

test('no published library answers 503', async () => {
  const e = { RECIPES_ENABLED: 'true', FOOD_CATALOG_R2: bucketOf({}) };
  assert.equal((await call(e, '/app/api/recipes')).status, 503);
});

test('unknown filters are refused, never ignored; odd paths are 404', async () => {
  const e = env();
  for (const q of ['diet=vegann', 'exclude=nuts', 'exclude=constructor', 'exclude=__proto__']) assert.equal((await call(e, '/app/api/recipes?' + q)).status, 400, q);
  const upper = await (await call(e, '/app/api/recipes?diet=Vegan&exclude=Gluten')).json();
  assert.deepEqual(upper.recipes.map(r => r.id), []);
  assert.deepEqual((await (await call(e, '/app/api/recipes?exclude=GLUTEN,Pork')).json()).recipes.map(r => r.id), ['a1', 'a3']);
  assert.equal((await call(e, '/app/api/recipes/%E0%A4%A')).status, 404);
});

test('a weak or listed ETag still gets 304', async () => {
  const e = env(), tag = (await call(e, '/app/api/recipes/index')).headers.get('ETag');
  const again = await call(e, '/app/api/recipes/index', { headers: { 'If-None-Match': `"old", W/${tag}` } });
  assert.equal(again.status, 304);
  assert.equal(again.headers.get('Cache-Control'), 'private, max-age=86400');
});

test('build: a recipe without id or diet is a problem, not a crash', () => {
  assert.deepEqual(build([{ id: 'z', title: { cs: 'a', en: 'a' } }]).problems, ['z: id, title or diet missing']);
});

test('saved and hidden recipes: set, replace, remove, refuse unknown, origin', async () => {
  const { createD1 } = await import('./helpers/d1.mjs');
  const e = { ...env(), DB: createD1(), USER_ID: 7 };
  const put = (body, origin = 'https://x.test') => withLang('en', () => handleRecipesApi(new Request('https://x.test/app/api/recipes/marks', { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e, new URL('https://x.test/app/api/recipes/marks'), { signedIn: true }));
  assert.deepEqual(await (await call(e, '/app/api/recipes/marks')).json(), { status: 'ok', saved: [], hidden: [] });
  assert.deepEqual((await (await put({ id: 'a1', mark: 'saved' })).json()).saved, ['a1']);
  const hidden = await (await put({ id: 'a1', mark: 'hidden' })).json();
  assert.deepEqual([hidden.saved, hidden.hidden], [[], ['a1']]);
  assert.deepEqual((await (await put({ id: 'a1', mark: null })).json()).hidden, []);
  assert.equal((await put({ id: 'nope', mark: 'saved' })).status, 404);
  assert.equal((await put({ id: 'a1', mark: 'liked' })).status, 400);
  assert.equal((await put({ id: 'a1', mark: 'saved' }, 'https://evil.test')).status, 403);
  e.USER_ID = 8;
  assert.deepEqual((await (await call(e, '/app/api/recipes/marks')).json()).saved, []);
  assert.equal((await withLang('en', () => handleRecipesApi(new Request('https://x.test/app/api/recipes/a1', { method: 'PUT' }), e, new URL('https://x.test/app/api/recipes/a1'), { signedIn: true }))).status, 404);
});

test('"I don\'t eat" in the profile: cleaned, at most 40', async () => {
  const { normalizeDiet, AVOID_MAX } = await import('../src/diet.js');
  assert.deepEqual(normalizeDiet({ dietAvoid: ['Gluten', 'pork', 'usda_sr_legacy:169251', 'u:coriander_leaves', 'x', 'drop table', 'pork', 7] }).dietAvoid, ['gluten', 'pork', 'usda_sr_legacy:169251', 'u:coriander_leaves']);
  assert.deepEqual(normalizeDiet({}).dietAvoid, []);
  assert.equal(normalizeDiet({ dietAvoid: Array.from({ length: 60 }, (_, i) => 'u:item' + i) }).dietAvoid.length, AVOID_MAX);
});
