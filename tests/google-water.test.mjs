import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { ensure as ensureFluids } from '../src/fluids.js';
import { processFoodGoogle, foodGoogleStatus } from '../src/food-google-sync.js';
import { saveSyncPrefs, readSyncPrefs, healthAllowed, googleMissingScopes } from '../src/sync-destinations.js';
import { HEALTH_SCOPES } from '../src/google-scopes.js';
import { localToday } from '../src/user-time.js';

const token = async () => 'test-token';
const day = localToday(), before = new Date(Date.parse(day + 'T12:00:00Z') - 2 * 864e5).toISOString().slice(0, 10);
const drink = 'users/1/dataTypes/hydration-log/dataPoints/w1';
function google() {
  const calls = [];
  return { calls, fetcher: async (url, options) => { calls.push({ url, method: options.method, body: JSON.parse(options.body || 'null') }); return Response.json({ done: true, response: options.body?.includes('"names"') ? {} : { name: drink } }); } };
}
async function setup() {
  const raw = createD1(), db = scopedDb(raw, 1);
  raw.sqlite.exec('CREATE TABLE food_logs(id INTEGER PRIMARY KEY,user_id INTEGER,consumed_date TEXT,consumed_at TEXT,recipe_title TEXT,kcal REAL,protein_g REAL,carbs_g REAL,fat_g REAL,note TEXT,source TEXT)');
  await ensureFluids(db);
  const add = (id, kind, ml, source = null, date = day) => raw.sqlite.prepare('INSERT INTO fluid_log(id,user_id,date,consumed_at,ml,kind,source) VALUES(?,?,?,?,?,?,?)').run(id, 1, date, date + 'T08:30', ml, kind, source);
  // Only the first goes: coffee, another app's water and a day before water was on stay out.
  add(1, 'water', 500); add(2, 'coffee', 200); add(3, 'water', 300, 'google-health'); add(4, 'water', 400, null, before);
  return { raw, db, env: { DB: db, CONNECTED_PROVIDERS: ['google'] } };
}

test('Google Health water: off until ticked; an old "all" stays weight and food, a new Vše includes it', async () => {
  const { db } = await setup();
  assert.equal(healthAllowed(await readSyncPrefs(db, 1, 'google'), 'water'), false);
  await saveSyncPrefs(db, 1, 'google', {});
  await db.prepare("UPDATE sync_preferences SET health_json='\"all\"' WHERE user_id=1 AND destination='google'").run();
  assert.deepEqual((await readSyncPrefs(db, 1, 'google')).health, ['weight', 'nutrition']);
  await saveSyncPrefs(db, 1, 'google', { health: 'all' });
  assert.equal(healthAllowed(await readSyncPrefs(db, 1, 'google'), 'water'), true);
  // Water needs the same Google permission as food.
  assert.deepEqual(googleMissingScopes({ GOOGLE_SCOPES: HEALTH_SCOPES.slice(0, 4) }, { health: ['water'] }), ['nutritionWrite']);
  assert.deepEqual(googleMissingScopes({ GOOGLE_SCOPES: HEALTH_SCOPES }, { health: ['water'] }), []);
});

test('Google Health water: only plain water logged in Aurin goes, once; a change patches, a delete removes it', async () => {
  const { raw, db, env } = await setup();
  let g = google();
  await processFoodGoogle(env, { token, ...g });
  assert.equal(g.calls.length, 0, 'nothing while water is off');
  await saveSyncPrefs(db, 1, 'google', { health: ['water'] });
  await processFoodGoogle(env, { token, ...g });
  assert.equal(g.calls.length, 1);
  assert.match(g.calls[0].url, /hydration-log\/dataPoints$/);
  assert.equal(g.calls[0].method, 'POST');
  assert.equal(g.calls[0].body.hydrationLog.amountConsumed.milliliters, 500);
  await processFoodGoogle(env, { token, ...g });
  assert.equal(g.calls.length, 1, 'no second copy');
  assert.deepEqual(await foodGoogleStatus(db), [], 'drinks stay out of the food list');
  raw.sqlite.prepare('UPDATE fluid_log SET ml=750 WHERE id=1').run();
  await processFoodGoogle(env, { token, ...g });
  assert.equal(g.calls[1].method, 'PATCH');
  assert.match(g.calls[1].url, /hydration-log\/dataPoints\/w1$/);
  assert.equal(g.calls[1].body.hydrationLog.amountConsumed.milliliters, 750);
  raw.sqlite.prepare('DELETE FROM fluid_log WHERE id=1').run();
  await processFoodGoogle(env, { token, ...g });
  assert.match(g.calls[2].url, /hydration-log\/dataPoints:batchDelete$/);
  assert.deepEqual(g.calls[2].body.names, [drink]);
  await processFoodGoogle(env, { token, ...g });
  assert.equal(g.calls.length, 3);
});
