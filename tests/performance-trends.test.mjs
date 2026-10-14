import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceTrends } from '../src/performance-trends.js';
import { calculateCapabilityUpdate } from '../src/workout-library.js';

const day = k => new Date(Date.parse('2026-10-14T12:00:00Z') - k * 86400000).toISOString().slice(0, 10);
const athlete = { restHr: 50, maxHr: 190, lthr: 165 };

test('runs: weekly pace, a rising efficiency and the best efforts', () => {
  // Six weeks of 10 km runs, getting faster at the same heart rate.
  const sessions = Array.from({ length: 12 }, (_, i) => ({ date: day(40 - i * 3), kind: 'run', distance: 10000, minutes: 55 - i, avgHr: 150 }));
  sessions.push({ date: day(2), kind: 'run', distance: 21100, minutes: 110, avgHr: 152 });
  const { run, ride } = performanceTrends(sessions, athlete, day(0));
  assert.equal(ride, undefined);
  assert.equal(run.weeks.length, 6);
  assert.ok(run.efficiencyChangePercent > 2);
  assert.equal(run.efficiencyTrend, 'zlepšuje se');
  assert.equal(run.bestEfforts['10km+'].pace, '4:24/km');
  assert.equal(run.bestEfforts.longest.km, 21.1);
});

test('rides: eFTP now and four weeks ago, power per heartbeat falling', () => {
  const sessions = Array.from({ length: 10 }, (_, i) => ({ date: day(38 - i * 4), kind: 'ride', minutes: 60, avgPower: 200 - i * 3, normPower: 215 - i * 3, avgHr: 140, distance: 30000, rollingFtp: 260 - i }));
  const { ride } = performanceTrends(sessions, athlete, day(0));
  assert.equal(ride.eftp.now, 251);
  assert.ok(ride.eftp.fourWeeksAgo > ride.eftp.now);
  assert.equal(ride.efficiencyTrend, 'zhoršuje se');
  assert.equal(ride.bestEfforts['40-90min'].averagePower, 200);
  assert.equal(ride.ftpFromData.basis, 'intervals-eftp');
});

test('nothing to say without sessions', () => {
  assert.equal(performanceTrends([], athlete, day(0)), null);
});

test('an auto-paired workout moves the level by its measured intensity', () => {
  const current = { level: 4 }, workout = { difficulty: 4 };
  assert.equal(calculateCapabilityUpdate(current, workout, { survey: 'auto_completed', completedPercent: 100 }).delta, 0);
  assert.ok(calculateCapabilityUpdate(current, workout, { survey: 'auto_completed', completedPercent: 100, intensityRatio: 1.05 }).delta > 0);
  assert.ok(calculateCapabilityUpdate(current, workout, { survey: 'auto_completed', completedPercent: 100, intensityRatio: 0.85 }).delta < 0);
  assert.equal(calculateCapabilityUpdate(current, workout, { survey: 'auto_completed', completedPercent: 60, intensityRatio: 1.05 }).delta, 0);
  // Smaller than the athlete's own easy rating.
  assert.ok(calculateCapabilityUpdate(current, workout, { survey: 'auto_completed', completedPercent: 100, intensityRatio: 1.05 }).delta
    < calculateCapabilityUpdate(current, workout, { survey: 'completed', completedPercent: 100, rpe: 6 }).delta);
});

test('Intervals.icu curves: the key durations and distances', async () => {
  const { powerCurvePoints, paceCurvePoints, intervalsCurves } = await import('../src/performance-trends.js');
  assert.deepEqual(powerCurvePoints({ list: [{ id: '42d', secs: [5, 60, 300, 1200, 3600], values: [900, 450, 320, 270, 250] }] }),
    { '42d': { '5s': 900, '1min': 450, '5min': 320, '20min': 270, '60min': 250 } });
  assert.equal(powerCurvePoints({ list: [{ id: '90d', secs: [1200], watts: [280] }] })['90d']['20min'], 280);
  const pace = paceCurvePoints({ list: [{ id: '42d', distance: [1000, 5000], values: [210, 1200] }] });
  assert.deepEqual(pace['42d']['5km'], { time: '20:00', pace: '4:00/km' });
  assert.equal(powerCurvePoints({}), null);
  assert.equal(await intervalsCurves({}, 'x'), null);
  const fake = async url => ({ ok: true, json: async () => url.includes('power') ? { list: [{ id: '42d', secs: [1200], values: [270] }] } : null });
  assert.deepEqual(await intervalsCurves({ INTERVALS_API_KEY: 'k' }, 'x', fake), { ridePower: { '42d': { '20min': 270 } } });
});
