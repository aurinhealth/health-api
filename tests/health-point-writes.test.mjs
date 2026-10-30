import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { healthPointJson } from '../src/health-point-json.js';
import { importIntervalsWeights } from '../src/weight-sync.js';
import { KEEP_TYPE_SQL } from '../src/activity-type.js';
import { BUCKET_SECONDS, HEART_RATE_BUCKET_TYPE } from '../src/heart-rate-compaction.js';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../staging/schema.sql', import.meta.url), 'utf8');
// Execute the actual persistence functions against SQLite, without provider
// HTTP calls. Batch tests inject only the provider's field extraction.
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  const env = { DB: scopedDb(raw, 1), USER_ID: 1 };
  const afterSync = [], sinces = [];
  const context = vm.createContext({ healthPointJson, BUCKET_SECONDS, HEART_RATE_BUCKET_TYPE, KEEP_TYPE_SQL, crypto, googleInfo: (_type, p) => p.info, afterGoogleSync: async (_env, type, _points, opts) => { afterSync.push(type); sinces.push(opts?.since); return 0; } });
  for (const [start, end] of [
    ['function pointStatement(', '// GOOGLE NUTRITION API'],
    ['async function saveGooglePointsBatch(', 'async function syncGoogleRecent(']
  ]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))), context);
  const point = (values = {}, user = env) => context.pointStatement(user, 'google-wearables', 'steps', values.payload ?? { steps: { count: 12 } }, values.value ?? 12, values.unit ?? 'steps', values.sample ?? '2026-10-10T12:00:00Z', values.start ?? null, values.end ?? null, 'sample-1');
  return { raw, env, context, point, afterSync, sinces };
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

test('choosing the source again runs only after a Google page changed a row', async () => {
  const { env, context, afterSync, sinces } = setup();
  const points = Array.from({ length: 3 }, (_, i) => ({ name: 'sample-' + i, info: { sample: '2026-10-10', start: null, end: null, value: i, unit: 'steps' } }));
  await context.saveGooglePointsBatch(env, 'google-wearables', 'steps', points);
  assert.deepEqual(afterSync, ['steps']);
  await context.saveGooglePointsBatch(env, 'google-wearables', 'steps', points);
  assert.deepEqual(afterSync, ['steps']);
  points[1].info.value = 50;
  await context.saveGooglePointsBatch(env, 'google-wearables', 'steps', points);
  assert.deepEqual(afterSync, ['steps', 'steps']);
  // It starts at the oldest hour a row changed, not 35 days back.
  points[0].info = { sample: '2026-10-08T09:00:00Z', start: null, end: null, value: 7, unit: 'steps' };
  points[2].info = { sample: '2026-10-09T09:00:00Z', start: null, end: null, value: 8, unit: 'steps' };
  await context.saveGooglePointsBatch(env, 'google-wearables', 'steps', points);
  assert.deepEqual(sinces, ['2026-10-10', '2026-10-10', '2026-10-08T09']);
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

test('Google heart rate is stored as 5-minute rows; a re-read writes nothing, a split bucket is joined', async () => {
  const { raw, env, context } = setup();
  // The real field extraction is not in this context: the sample time is enough here.
  context.googleInfo = (_type, p) => p.info || ({ sample: p.heartRate.sampleTime.physicalTime });
  const sample = (time, bpm) => ({ heartRate: { sampleTime: { physicalTime: time }, beatsPerMinute: String(bpm) } });
  const at = (base, s) => new Date(Date.parse(base) + s * 1000).toISOString().replace('.000Z', 'Z');
  // 10 minutes every 2 s: 60 in the first five, 80 in the next; one bad value.
  const points = Array.from({ length: 300 }, (_, i) => sample(at('2026-10-10T06:00:00Z', i * 2), i < 150 ? 60 : 80)).concat(sample('2026-10-10T06:01:01Z', 400));
  const page1 = points.slice(0, 200), page2 = points.slice(200);
  await context.saveGooglePointsBatch(env, 'google-wearables', 'heart-rate', page1);
  await context.saveGooglePointsBatch(env, 'google-wearables', 'heart-rate', page2);
  const rows = () => raw.sqlite.prepare("SELECT data_type, sample_time, end_time, value_numeric, payload_json FROM health_datapoints ORDER BY sample_time").all().map(r => [r.data_type, r.sample_time, r.end_time, r.value_numeric, JSON.parse(r.payload_json).n, JSON.parse(r.payload_json).min, JSON.parse(r.payload_json).max]);
  const expected = [
    ['heart-rate-5min', '2026-10-10T06:00:00Z', '2026-10-10T06:05:00Z', 60, 150, 60, 60],
    ['heart-rate-5min', '2026-10-10T06:05:00Z', '2026-10-10T06:10:00Z', 80, 150, 80, 80]
  ];
  assert.deepEqual(rows(), expected, 'the second bucket was split between the pages and is joined');
  // The nightly run reads the same samples again, cut into other pages.
  raw.sqlite.exec("CREATE TABLE point_updates(n INTEGER); CREATE TRIGGER count_point_update AFTER UPDATE ON health_datapoints BEGIN INSERT INTO point_updates VALUES(1); END");
  assert.equal(await context.saveGooglePointsBatch(env, 'google-wearables', 'heart-rate', points.slice(0, 250)), 0);
  assert.equal(await context.saveGooglePointsBatch(env, 'google-wearables', 'heart-rate', points.slice(250)), 0);
  assert.equal(await context.saveGooglePointsBatch(env, 'google-wearables', 'heart-rate', points), 0);
  assert.equal(raw.sqlite.prepare('SELECT COUNT(*) n FROM point_updates').get().n, 0);
  assert.deepEqual(rows(), expected);
  // Samples that reached Google late: the bucket read again with more samples replaces it.
  await context.saveGooglePointsBatch(env, 'google-wearables', 'heart-rate', [...points, sample('2026-10-10T06:09:59Z', 110)]);
  assert.deepEqual(rows()[1].slice(3), [80.2, 151, 80, 110]);
  // A part of the bucket from another page cut (other values inside it) never replaces the whole.
  await context.saveGooglePointsBatch(env, 'google-wearables', 'heart-rate', [sample('2026-10-10T06:06:00Z', 150), sample('2026-10-10T06:07:00Z', 150)]);
  assert.deepEqual(rows()[1].slice(3), [80.2, 151, 80, 110]);
  // A workout's own minutes keep every sample.
  await context.saveGooglePointsBatch(env, 'google-wearables', 'heart-rate', [{ name: 'w1', info: { sample: '2026-10-10T07:00:00Z', start: null, end: null, value: 120, unit: 'bpm' } }], { raw: true });
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE data_type = 'heart-rate'").get().n, 1);
});
