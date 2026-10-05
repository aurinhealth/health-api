import test from 'node:test';
import assert from 'node:assert/strict';
import { capWeekTargets, indoorMinutes } from '../src/adaptive-week.js';
import { sanitizeWeekPlan } from '../src/week-planner.js';
import { cached, bumpCacheVersion } from '../src/api-cache.js';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';

const targets = { status: 'ok', items: [
  { date: '2026-10-10', sport: 'ride', slot: 0, role: 'long', minutes: 180, tss: 139, intensity: .68 },
  { date: '2026-10-09', sport: 'gym', slot: 0, role: 'gym_full', minutes: 70, tss: 35 }] };

test('rain makes the ride indoor and shorter; indoor is never three hours', () => {
  const prefs = sanitizeWeekPlan({ days: [[], [], [], [], ['gym'], ['ride'], []] });
  const r = capWeekTargets(targets, prefs, [], { '2026-10-10': { max: 14, rain: 6, rainProb: 85, code: 63 } });
  const ride = r.items.find(x => x.sport === 'ride');
  assert.equal(ride.environment, 'indoor');
  assert.equal(ride.minutes, 90);
  assert.ok(ride.tss < 139);
  assert.equal(indoorMinutes('ride', 60), 40);
  assert.equal(indoorMinutes('run', 90), 60);
});

test('the athlete chooses length and place per chip; gym can be 30 minutes', () => {
  const prefs = sanitizeWeekPlan({ days: [[], [], [], [], ['gym'], ['ride'], []], sessions: { '4|gym|0': { minutes: 30, environment: 'indoor' }, '5|ride|0': { environment: 'outdoor', minutes: 120 }, '5|ride|1': { minutes: 60 }, 'x': { minutes: 30 } } });
  assert.deepEqual(prefs.sessions, { '4|gym|0': { minutes: 30 }, '5|ride|0': { minutes: 120, environment: 'outdoor' } });
  const r = capWeekTargets(targets, prefs, [], { '2026-10-10': { rain: 6, rainProb: 85 } });
  const ride = r.items.find(x => x.sport === 'ride'), gym = r.items.find(x => x.sport === 'gym');
  assert.deepEqual([ride.environment, ride.minutes, ride.chosenMinutes, ride.chosenEnvironment, ride.autoEnvironment], ['outdoor', 120, true, true, 'indoor']);
  assert.deepEqual([gym.minutes, gym.tss], [30, 15]);
});

test('cached inputs are reused until the user changes something', async () => {
  const raw = createD1();
  raw.sqlite.exec('CREATE TABLE api_cache_versions (user_id INTEGER PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0)');
  const db = scopedDb(raw, 7), mem = new Map(), store = { async match(u) { return mem.has(u) ? new Response(mem.get(u)) : null; }, async put(u, r) { mem.set(u, await r.text()); } };
  let runs = 0; const compute = async () => ({ n: ++runs });
  assert.deepEqual(await cached({ DB: db }, null, 'k', compute, { store }), { n: 1 });
  assert.deepEqual(await cached({ DB: db }, null, 'k', compute, { store }), { n: 1 });
  await bumpCacheVersion(db);
  assert.deepEqual(await cached({ DB: db }, null, 'k', compute, { store }), { n: 2 });
  // Another user never sees it.
  assert.deepEqual(await cached({ DB: scopedDb(raw, 8) }, null, 'k', compute, { store }), { n: 3 });
});
