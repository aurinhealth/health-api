import test from 'node:test';
import assert from 'node:assert/strict';
import { withLang } from '../src/lang.js';
import { raceWeek } from '../src/coach-race-week.js';
import { carbsPerHour } from '../src/workout-explanation.js';
import { runRaceSeconds } from '../src/race-estimate.js';

const half = (daysLeft, extra = {}) => ({ event: { name: 'Prague Half', date: '2026-12-20', daysLeft, sport: 'run', km: 21.1, ...extra } });
// Threshold 4:55/km: a half at 96 % of threshold speed.
const PACE = 295;

test('race week of a half: the numbers come from the rules, the fuel from carbsPerHour', () => withLang('en', () => {
  const w = raceWeek({ focus: half(6), thresholdPace: PACE, weightKg: 70, experience: 'regular' });
  const seconds = runRaceSeconds(21.1, PACE), perHour = carbsPerHour(seconds / 60, 'tempo', 'run', 'regular');
  assert.equal(w.text, '6 days to go. The work is done.\n\nA little race pace keeps the legs sharp.');
  assert.deepEqual(w.chips, ['Fuel and drinks', 'Pacing plan']);
  assert.equal(w.race.estimate, '1 h 48 min');
  const race = w.fuel.rows.find(r => r.when === 'race');
  assert.equal(race.perHour, perHour);
  assert.deepEqual(race.gelsAt, [40, 80], 'a 25 g gel every 1500 / 40 g/h minutes');
  assert.equal(w.fuel.rows[0].text, 'about 560 g of carbs (8 g per kg), early dinner, little fibre');
  assert.equal(w.fuel.rows.find(r => r.when === 'breakfast').text, 'about 110 g of carbs, two hours before the start');
  assert.match(w.fuel.note, /^Estimates, not medical advice/);
  const avg = Math.round(seconds / 21.1);
  assert.deepEqual(w.pacing.segments.map(s => [s.fromKm, s.toKm, s.pace]), [[1, 5, avg + 5], [6, 16, avg], [17, 21.1, avg - 5]], '1.5 % of a 5:07 pace is 5 s');
  assert.equal(w.pacing.line, 'Start easy, finish strong.');
}));

test('a 5 km race has no carb loading; no threshold pace means no pacing plan; Czech', () => {
  const five = withLang('en', () => raceWeek({ focus: half(2, { km: 5 }), thresholdPace: PACE }));
  assert.deepEqual(five.fuel.rows.map(r => r.when), ['breakfast', 'drink']);
  assert.equal(five.fuel.rows[0].text, 'about 70 g of carbs, two hours before the start');
  assert.match(five.text, /Easy running and a few short strides/);
  const ten = withLang('en', () => raceWeek({ focus: half(4, { km: 10 }), thresholdPace: PACE }));
  assert.ok(!ten.fuel.rows.some(r => r.when === 'race'), 'no carbs during a race under an hour');
  const marathon = withLang('en', () => raceWeek({ focus: half(5, { km: 42.2 }), thresholdPace: PACE, weightKg: 70 }));
  assert.equal(marathon.fuel.rows[0].title, 'Two days before: carb-rich, familiar meals');
  assert.equal(marathon.fuel.rows[0].text, 'about 700 g of carbs (10 g per kg) each day, early dinner, little fibre');
  const m = marathon.fuel.rows.find(r => r.when === 'race');
  assert.equal(m.gelsAt[1] - m.gelsAt[0], Math.round(25 * 60 / m.perHour / 5) * 5);
  assert.equal(marathon.fuel.rows.at(-1).text, '150 ml of water with each gel, otherwise drink to thirst');
  const none = withLang('en', () => raceWeek({ focus: half(3), weightKg: null }));
  assert.equal(none.pacing, undefined);
  assert.deepEqual(none.chips, ['Fuel and drinks']);
  assert.equal(none.fuel.rows[0].text, 'about 8 g of carbs per kg, early dinner, little fibre');
  assert.equal(withLang('cs', () => raceWeek({ focus: half(3), thresholdPace: PACE }).text.split('\n')[0]), 'Do závodu zbývají 3 dny. Práce je hotová.');
  assert.equal(withLang('cs', () => raceWeek({ focus: half(6), thresholdPace: PACE }).text.split('\n')[0]), 'Do závodu zbývá 6 dní. Práce je hotová.');
});

test('only a running race in its last six days', () => {
  assert.equal(raceWeek({ focus: half(7) }), null);
  assert.equal(raceWeek({ focus: half(-1) }), null);
  assert.equal(raceWeek({ focus: half(3, { sport: 'ride', km: 120 }) }), null);
  assert.equal(raceWeek({ focus: { event: null } }), null);
  assert.ok(raceWeek({ focus: half(0) }));
});
