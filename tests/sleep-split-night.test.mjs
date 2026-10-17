import test from 'node:test';
import assert from 'node:assert/strict';
import { joinSplitNights } from '../src/sleep-sessions.js';
import { sleepNeedFor } from '../src/recovery-model.js';
import { primaryNights } from '../src/readiness.js';

// Asleep at 1:04, up at 8:27, asleep again 10:18–13:13 (Prague, UTC+2); Google flags the second part a nap.
const night = { id: 'n', source: 'google-wearables', date: '2026-10-17', startTime: '2026-10-16T23:04:00Z', endTime: '2026-10-17T06:27:00Z', timeInBedMin: 443, durationMin: 405, stages: { DEEP: 70, LIGHT: 250, REM: 85, AWAKE: 38 }, wasoMin: 30, nap: false };
const rest = { id: 'r', source: 'google-wearables', date: '2026-10-17', startTime: '2026-10-17T08:18:00Z', endTime: '2026-10-17T11:13:00Z', timeInBedMin: 175, durationMin: 169, stages: { LIGHT: 120, DEEP: 20, REM: 29, AWAKE: 6 }, wasoMin: 4, nap: true };

test('the sleep after a morning wake-up is the rest of the night, not a nap', () => {
  const [one, ...others] = joinSplitNights([rest, night]);
  assert.equal(others.length, 0);
  assert.equal(one.durationMin, 574);
  assert.equal(one.timeInBedMin, 618);
  assert.equal(one.startTime, night.startTime);
  assert.equal(one.endTime, rest.endTime);
  assert.equal(one.nap, false);
  assert.equal(one.upMin, 111);
  assert.equal(one.stages.LIGHT, 370);
  assert.equal(primaryNights([one]).get('2026-10-17').durationMin, 574);
  // Tonight's need is no longer lowered by a 2 h 49 min "nap".
  assert.equal(sleepNeedFor({ date: '2026-10-18', age: 35, sessions: [night, rest] }).naps, 169);
  assert.equal(sleepNeedFor({ date: '2026-10-18', age: 35, sessions: joinSplitNights([night, rest]) }).naps, 0);
});

test('an afternoon nap and a sleep long after the night stay apart', () => {
  const afternoon = { ...rest, id: 'a', startTime: '2026-10-17T12:30:00Z', endTime: '2026-10-17T14:30:00Z' };
  const late = { ...rest, id: 'l', startTime: '2026-10-17T09:40:00Z', endTime: '2026-10-17T10:00:00Z' }; // 3 h 13 min after waking
  assert.equal(joinSplitNights([night, afternoon]).length, 2);
  assert.equal(joinSplitNights([night, late]).length, 2);
  // Another device's sleep is not joined to this one's night.
  assert.equal(joinSplitNights([night, { ...rest, source: 'apple-health' }]).length, 2);
});

test('the timeline of a joined night shows the time up as awake', () => {
  const p = (s, e) => ({ stages: [{ type: 'LIGHT', startTime: s, endTime: e }] });
  const [one] = joinSplitNights([{ ...night, payload: p(night.startTime, night.endTime) }, { ...rest, payload: p(rest.startTime, rest.endTime) }]);
  assert.deepEqual(one.payload.stages.map(s => s.type), ['LIGHT', 'AWAKE', 'LIGHT']);
  assert.equal(one.payload.stages[1].startTime, night.endTime);
});

test('a Fitbit night that starts awake takes those minutes as the time to fall asleep', async () => {
  const { sleepSessionFromRow } = await import('../src/sleep-sessions.js');
  const sleep = { interval: { startTime: '2026-10-15T23:04:00Z', endTime: '2026-10-16T04:07:00Z' }, summary: { minutesToFallAsleep: '0', minutesAwake: '16', minutesAfterWakeUp: '0' }, stages: [
    { type: 'AWAKE', startTime: '2026-10-15T23:04:00Z', endTime: '2026-10-15T23:20:00Z' },
    { type: 'LIGHT', startTime: '2026-10-15T23:20:00Z', endTime: '2026-10-16T04:07:00Z' }] };
  const s = sleepSessionFromRow({ external_id: 'x', start_time: sleep.interval.startTime, end_time: sleep.interval.endTime, payload_json: JSON.stringify({ sleep }) });
  assert.equal(s.latencyMin, 16);
  assert.equal(s.wasoMin, 0);
  // A source that says how long it took keeps its own number.
  sleep.summary.minutesToFallAsleep = '9';
  assert.equal(sleepSessionFromRow({ external_id: 'x', payload_json: JSON.stringify({ sleep }) }).latencyMin, 9);
});

test('Today lists the afternoon nap, not the night or the rest of it', async () => {
  const { napsOn } = await import('../src/app-today.js');
  const joined = joinSplitNights([night, rest]);
  const nap = { id: 'p', source: 'google-wearables', startTime: '2026-10-17T13:05:00Z', endTime: '2026-10-17T14:43:00Z', durationMin: 92, nap: true };
  const naps = napsOn([...joined, nap], '2026-10-17', joined[0]);
  assert.equal(naps.length, 1);
  assert.equal(naps[0].minutes, 92);
  assert.match(naps[0].start, /^15:05$/);
});
