import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunReview } from '../src/run-review.js';
import { plannedSteps } from '../src/ride-review.js';
import { withLang } from '../src/lang.js';

// 5×5 min at threshold with 1 min jogs; threshold pace 5:00/km (3.333 m/s).
const description = 'Warmup\n- 12m 78% rozklus\n\n5x\n- 5m 99%\n- 1m 72% klus\n\nCooldown\n- 8m 76% výklus';
const sp = secPerKm => 1000 / secPerKm, iv = (start, seconds, pace, hr, maxHr) => ({ start, seconds, speed: sp(pace), hr, maxHr });
const intervals = [iv(0, 720, 330, 140, 152),
  iv(720, 300, 302, 165, 170), iv(1020, 60, 360, 158, 165), iv(1080, 300, 300, 168, 173), iv(1380, 60, 400, 160, 166),
  iv(1440, 300, 304, 170, 175), iv(1740, 60, 410, 161, 167), iv(1800, 300, 312, 172, 177), iv(2100, 60, 420, 162, 168),
  iv(2160, 300, 318, 174, 179), iv(2460, 60, 430, 163, 168)];
const activity = { id: 'activity:r1', type: 'Run', name: 'Prahové úseky 5×5 min', start: '2026-10-07T07:00:00', durationHours: 2520 / 3600, tss: 70 };
const review = lang => withLang(lang, () => buildRunReview({ activity, detail: { activity: { distance: 8100 }, intervals }, plan: { description, tss: 65, durationHours: 50 / 60 }, date: '2026-10-07', thresholdPace: 300 }));

test('run steps: jogs between reps are recoveries', () => {
  assert.deepEqual([...new Set(plannedSteps(description, { sport: 'run' }).map(s => s.role))], ['warmup', 'work', 'rest', 'cooldown']);
});

test('the run review talks in pace per km and finds the fade and the missing cool-down', () => {
  const r = review('cs'), text = JSON.stringify(r);
  assert.match(r.target, /99 % prahové rychlosti, tedy zhruba 5:03–5:03\/km při prahu 5:00\/km|zhruba 5:03\/km/);
  assert.equal(r.table.rows.length, 5);
  assert.deepEqual(r.table.rows[0], ['1', '5:02/km · 5:00', '165 / 170']);
  assert.match(text, /Tempo v úsecích klesalo: poslední o 16 s\/km pomalejší/);
  assert.match(text, /Chybí výklus: místo 8 min nic/);
  assert.match(text, /Rozklus moc rychlý|Tep v úsecích stoupal/);
  assert.equal(r.chart.refLabel, 'práh 5:00/km');
});

test('the run review is English in English', () => {
  assert.doesNotMatch(JSON.stringify(review('en')), /[ěščřžýáíéůú]/i);
});
