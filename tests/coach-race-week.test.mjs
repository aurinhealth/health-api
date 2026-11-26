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
  assert.deepEqual(race.gelsAt, [30, 60, 90], 'a 25 g gel every 1500 / 50 g/h minutes');
  assert.equal(w.fuel.rows[0].text, 'about 560 g of carbs (8 g per kg), early dinner, little fibre');
  assert.equal(w.fuel.rows.find(r => r.when === 'breakfast').text, 'about 110 g of carbs, two hours before the start');
  assert.match(w.fuel.note, /^Estimates, not medical advice/);
  const avg = Math.round(seconds / 21.1);
  assert.deepEqual(w.pacing.segments.map(s => [s.fromKm, s.toKm, s.pace]), [[1, 5, avg + 5], [6, 16, avg], [17, 21.1, avg - 5]], '1.5 % of a 5:07 pace is 5 s');
  assert.equal(w.pacing.line, 'Start easy, finish strong.');
}));

test('a 5 km race has no carb loading; no threshold pace means no pacing plan; Czech', () => {
  const five = withLang('en', () => raceWeek({ focus: half(2, { km: 5 }), thresholdPace: PACE }));
  assert.deepEqual(five.fuel.rows.map(r => r.when), ['breakfast', 'drink', 'after']);
  assert.equal(five.fuel.rows[0].text, 'about 70 g of carbs, two hours before the start');
  assert.match(five.text, /Easy running and a few short strides/);
  const ten = withLang('en', () => raceWeek({ focus: half(4, { km: 10 }), thresholdPace: PACE }));
  assert.ok(!ten.fuel.rows.some(r => r.when === 'race'), 'no carbs during a race under an hour');
  const marathon = withLang('en', () => raceWeek({ focus: half(5, { km: 42.2 }), thresholdPace: PACE, weightKg: 70 }));
  assert.equal(marathon.fuel.rows[0].title, 'Two days before: carb-rich, familiar meals');
  assert.equal(marathon.fuel.rows[0].text, 'about 700 g of carbs (10 g per kg) each day, early dinner, little fibre');
  const m = marathon.fuel.rows.find(r => r.when === 'race');
  assert.equal(m.gelsAt[1] - m.gelsAt[0], Math.round(25 * 60 / m.perHour / 5) * 5);
  assert.equal(marathon.fuel.rows.find(r => r.when === 'drink').text, '150 ml of water with each gel, otherwise drink to thirst');
  const none = withLang('en', () => raceWeek({ focus: half(3), weightKg: null }));
  assert.equal(none.pacing, undefined);
  assert.deepEqual(none.chips, ['Fuel and drinks']);
  assert.equal(none.fuel.rows[0].text, 'about 8 g of carbs per kg, early dinner, little fibre');
  assert.equal(withLang('cs', () => raceWeek({ focus: half(3), thresholdPace: PACE }).text.split('\n')[0]), 'Do závodu zbývají 3 dny. Práce je hotová.');
  assert.equal(withLang('cs', () => raceWeek({ focus: half(6), thresholdPace: PACE }).text.split('\n')[0]), 'Do závodu zbývá 6 dní. Práce je hotová.');
});

test('only a run, ride or swim race in its last six days', () => {
  assert.equal(raceWeek({ focus: half(7) }), null);
  assert.equal(raceWeek({ focus: half(-1) }), null);
  assert.equal(raceWeek({ focus: half(3, { sport: 'tri', km: 51.5 }) }), null);
  assert.equal(raceWeek({ focus: { event: null } }), null);
  assert.ok(raceWeek({ focus: half(0) }));
});

test('a ride: food on minutes, pacing in watts only with an FTP', () => withLang('en', () => {
  const w = raceWeek({ focus: half(3, { sport: 'ride', km: 100 }), ftp: 250, weightKg: 75, experience: 'regular' });
  assert.equal(w.text, '3 days to go. The work is done.\n\nKeep rides short and easy, with a few short harder efforts to keep the legs sharp.');
  assert.deepEqual(w.fuel.rows.map(r => r.when), ['day_before', 'breakfast', 'race', 'drink', 'after']);
  assert.equal(w.fuel.rows[1].text, 'about 150 g of carbs, two to three hours before the start');
  const race = w.fuel.rows.find(r => r.when === 'race');
  assert.equal(race.every, Math.max(15, Math.round(25 * 60 / race.perHour / 5) * 5));
  assert.match(race.text, /glucose and fructose/, 'over 60 g an hour');
  assert.deepEqual(w.pacing.segments.map(s => [s.fromKm, s.toKm, s.wattsText]), [[1, 25, '163 W'], [26, 75, '163–188 W'], [76, 100, 'up to 188 W']]);
  assert.equal(w.pacing.climb, 'On long climbs stay under 200 W, brief steep ramps are fine.');
  const long = raceWeek({ focus: half(5, { sport: 'ride', km: 200 }), ftp: 250, weightKg: 75 });
  assert.equal(long.fuel.rows[0].title, 'Two days before: carb-rich, familiar meals', '4 h or more');
  assert.equal(long.pacing.high, 175, 'over five hours the top stays at 70 %');
  const none = raceWeek({ focus: half(0, { sport: 'ride', km: 60 }) });
  assert.equal(none.pacing, undefined);
  assert.equal(none.race.estimate, undefined, 'a 2.5 W/kg guess times the food only');
  assert.equal(none.text.split('\n\n')[1], 'Warm up easily, with two short openers.');
}));

test('a swim: pacing from the CSS, feeds only from 90 min', () => withLang('en', () => {
  const w = raceWeek({ focus: half(2, { sport: 'swim', km: 1.5 }), swimCss: 95, weightKg: 70 });
  assert.equal(w.text.split('\n\n')[1], 'Easy swimming with a few relaxed fast 25s keeps you loose.');
  assert.deepEqual(w.fuel.rows.map(r => r.when), ['breakfast', 'drink', 'after']);
  assert.match(w.fuel.note, /wetsuits are allowed/);
  const pace = 95 * 100 / 95 * 1.03;
  assert.deepEqual(w.pacing.segments.map(s => [s.fromM, s.toM, s.pace]), [[0, 100, Math.round(pace * 0.98)], [100, 1150, Math.round(pace)], [1150, 1500, Math.round(pace * 0.985)]]);
  assert.equal(w.pacing.segments[1].paceText, '1:43 /100 m');
  const ten = raceWeek({ focus: half(4, { sport: 'swim', km: 10 }), swimCss: 95, weightKg: 70 });
  assert.equal(ten.pacing.segments[0].cue, 'Start controlled, find clear water', 'no fast start over 3 km');
  assert.deepEqual(ten.fuel.rows.map(r => r.when), ['day_before', 'breakfast', 'start', 'race', 'drink', 'after']);
  assert.equal(raceWeek({ focus: half(4, { sport: 'swim', km: 0.8 }), swimCss: 95 }).pacing.segments.length, 1);
  assert.equal(raceWeek({ focus: half(4, { sport: 'swim', km: 1.5 }), swimCss: 300 }).pacing, undefined, 'no pacing from the 2:00 fallback');
}));
