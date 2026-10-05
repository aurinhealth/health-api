import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeIntervalsSleep, withIntervalsSleep } from '../src/intervals-sleep.js';

const google = { id: 'g1', date: '2026-10-04', startTime: '2026-10-03T22:10:00Z', endTime: '2026-10-04T05:40:00Z', durationMin: 430, stages: { DEEP: 80 } };
const wellness = [{ id: '2026-10-03', sleepSecs: 25200, sleepScore: 81 }, { id: '2026-10-04', sleepSecs: 30000 }, { id: '2026-10-05', sleepSecs: 0 }];

test('Intervals nights fill only the nights Google does not have', () => {
  const merged = mergeIntervalsSleep([google], wellness, { start: '2026-10-01', end: '2026-10-06' });
  assert.deepEqual(merged.map(s => [s.date, s.source || 'google', s.durationMin]), [['2026-10-04', 'google', 430], ['2026-10-03', 'intervals', 420]]);
  assert.equal(merged[1].score, 81);
  assert.equal(merged[1].startTime, null);
});

test('without Intervals.icu the sleep answer stays as it is', async () => {
  const data = { status: 'ok', sessions: [google] };
  assert.equal(await withIntervalsSleep({}, data, '2026-10-01', '2026-10-06'), data);
  const calls = [];
  const r = await withIntervalsSleep({ INTERVALS_API_KEY: 'k' }, { status: 'ok', sessions: [] }, '2026-10-01', '2026-10-06', async url => { calls.push(url); return new Response(JSON.stringify(wellness), { status: 200 }); });
  assert.match(calls[0], /wellness\?oldest=2026-10-01&newest=2026-10-06/);
  assert.deepEqual(r.sources, ['intervals']);
  assert.equal(r.sessions.length, 2);
});
