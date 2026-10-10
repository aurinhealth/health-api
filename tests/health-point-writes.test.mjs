import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { healthPointJson } from '../src/health-point-json.js';
import { importIntervalsWeights } from '../src/weight-sync.js';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../staging/schema.sql', import.meta.url), 'utf8');
// Execute the actual persistence functions against SQLite, without provider
// HTTP calls. Batch tests inject only the provider's field extraction.
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  const env = { DB: scopedDb(raw, 1), USER_ID: 1 };
  const context = vm.createContext({ healthPointJson, crypto, googleInfo: (_type, p) => p.info });
  for (const [start, end] of [
    ['function pointStatement(', '// GOOGLE NUTRITION API'],
    ['async function saveGooglePointsBatch(', 'async function syncGoogleRecent(']
  ]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))), context);
  const point = (values = {}, user = env) => context.pointStatement(user, 'google-wearables', 'steps', values.payload ?? { steps: { count: 12 } }, values.value ?? 12, values.unit ?? 'steps', values.sample ?? '2026-10-10T12:00:00Z', values.start ?? null, values.end ?? null, 'sample-1');
  return { raw, env, context, point };
}

test('identical samples write zero rows and preserve update time and activity matching', async () => {
  const { raw, point } = setup();
  assert.equal((await point().run()).meta.changes, 1);
  raw.sqlite.exec("UPDATE health_datapoints SET updated_at='2000-01-01',record_role='duplicate',matched_activity_id='intervals:1'");
  for (let i = 0; i < 10; i++) assert.equal((await point().run()).meta.changes, 0);
  const row = await raw.prepare('SELECT * FROM health_datapoints').first();
  assert.equal(row.updated_at, '2000-01-01');
  assert.equal(row.record_role, 'duplicate');
  assert.equal(row.matched_activity_id, 'intervals:1');
});

test('each changed persisted field is still updated, including NULL transitions', async () => {
  const { raw, env, context } = setup();
  const args = [env, 'google-wearables', 'steps', { count: 12 }, 12, 'steps', null, null, null, 'same-id'];
  const write = () => context.pointStatement(...args).run();
  await write();
  for (const [index, value] of [[3, { count: 13 }], [4, 0], [4, null], [4, 14], [5, null], [5, 'count'], [6, 'sample'], [6, null], [7, 'start'], [7, null], [8, 'end'], [8, null]]) {
    args[index] = value;
    assert.equal((await write()).meta.changes, 1, `changed argument ${index}`);
    assert.equal((await write()).meta.changes, 0);
  }
  assert.equal((await raw.prepare('SELECT COUNT(*) n FROM health_datapoints').first()).n, 1);
});

test('same external ID belongs to separate users', async () => {
  const { raw, point } = setup();
  await point().run();
  assert.equal((await point({ value: 99 }, { DB: scopedDb(raw, 2), USER_ID: 2 }).run()).meta.changes, 1);
  assert.equal((await raw.prepare('SELECT value_numeric FROM health_datapoints WHERE user_id=1').first()).value_numeric, 12);
});

test('JSON key order is ignored at every depth, but array order and values are retained', async () => {
  const { point } = setup();
  const a = { z: [{ b: 2, a: 1 }, null], a: { y: false, x: 0 } };
  const b = { a: { x: 0, y: false }, z: [{ a: 1, b: 2 }, null] };
  assert.equal(healthPointJson(a), healthPointJson(b));
  assert.deepEqual(JSON.parse(healthPointJson(a)), a);
  await point({ payload: a }).run();
  assert.equal((await point({ payload: b }).run()).meta.changes, 0);
  assert.equal((await point({ payload: { ...b, z: [...b.z].reverse() } }).run()).meta.changes, 1);
});

test('125 repeated Google samples stay batched and perform no INSERT or UPDATE', async () => {
  const { raw, env, context } = setup();
  const points = Array.from({ length: 125 }, (_, i) => ({ name: 'sample-' + i, info: { sample: '2026-10-10', start: null, end: null, value: i, unit: 'steps' } }));
  const batches = [], originalBatch = raw.batch.bind(raw);
  raw.batch = async statements => { const results = await originalBatch(statements); batches.push({ size: statements.length, changes: results.reduce((n, r) => n + r.meta.changes, 0) }); return results; };
  assert.equal(await context.saveGooglePointsBatch(env, 'google-wearables', 'steps', points), 125);
  assert.deepEqual(batches.map(b => b.size), [50, 50, 25]);
  assert.equal(batches.reduce((n, b) => n + b.changes, 0), 125);
  batches.length = 0;
  await context.saveGooglePointsBatch(env, 'google-wearables', 'steps', points);
  assert.equal(batches.reduce((n, b) => n + b.changes, 0), 0);
  points[2].info.value = 1000;
  batches.length = 0;
  await context.saveGooglePointsBatch(env, 'google-wearables', 'steps', points);
  assert.equal(batches.reduce((n, b) => n + b.changes, 0), 1);
});

test('Intervals weight import skips identical weights and retains corrections', async () => {
  const { raw, env } = setup();
  let weight = 80;
  const options = { now: Date.parse('2026-10-10T12:00:00Z'), fetchImpl: async () => Response.json([{ id: '2026-10-10', weight }]) };
  await importIntervalsWeights(env, options);
  raw.sqlite.exec("CREATE TABLE point_updates(n INTEGER); CREATE TRIGGER count_point_update AFTER UPDATE ON health_datapoints BEGIN INSERT INTO point_updates VALUES(1); END");
  await importIntervalsWeights(env, options);
  assert.equal((await raw.prepare('SELECT COUNT(*) n FROM point_updates').first()).n, 0);
  weight = 81;
  await importIntervalsWeights(env, options);
  assert.equal((await raw.prepare('SELECT COUNT(*) n FROM point_updates').first()).n, 1);
  assert.equal((await raw.prepare('SELECT value_numeric FROM health_datapoints').first()).value_numeric, 81);
});
