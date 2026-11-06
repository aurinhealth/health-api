// Next session's load after a late exercise for a tired muscle: a failure set
// or a weak last set doesn't take a step back, a tired exercise is compared
// with its last session at a similar place in the workout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { progressionDecision, priorMuscleSets, estimateStartingLoad } from '../src/strength-intelligence.js';
import { buildGymReview } from '../src/gym-review.js';
import { GYM_PLAN_COLUMNS } from '../src/gym-plan-store.js';
import { withLang } from '../src/lang.js';

const sets = (date, exercise, kg, reps, rpe = 7.5, row = 0) => reps.map((r, i) => ({ workout_date: date, plan_row: row + i, type: 'WORK', completed: 1, exercise, set_no: i + 1, actual_kg: kg, actual_reps: r, rpe: Array.isArray(rpe) ? rpe[i] : rpe }));
// Petr's workout of 2026-11-05: three biceps exercises before the DB curl.
const before = date => [...sets(date, 'Barbell bench press', 60, [8, 8, 7], 8, 0), ...sets(date, 'Barbell Curl', 30, [10, 10, 9], 8, 10), ...sets(date, 'DB bench press', 24, [8, 8, 8], 8, 20), ...sets(date, 'Cable curl', 20, [10, 10, 9], 8, 30)];
const late = (date, reps, rpe = 9) => [...before(date), ...sets(date, 'DB curl', 12.5, reps, rpe, 50)];

test('a set rated F with the reps in range holds the load', () => {
  const d = progressionDecision(sets('2026-11-05', 'DB curl', 12.5, [12, 10, 8], [7.5, 7.5, 10]), 'DB curl', '8–12', 1, '2026-11-06');
  assert.deepEqual([d.decision, d.kg], ['hold', 12.5]);
});

test('on a main lift a failed first set still steps back', () => {
  const d = progressionDecision(sets('2026-11-05', 'Barbell bench press', 80, [6, 5, 5], 10), 'Barbell bench press', '5–8', 1, '2026-11-06');
  assert.equal(d.decision, 'decrease');
});

test('one weak late set holds; a weak first set or half the sets step back', () => {
  const at = reps => progressionDecision(sets('2026-11-05', 'DB curl', 12.5, reps), 'DB curl', '8–12', 1, '2026-11-06').decision;
  assert.equal(at([12, 11, 6]), 'hold');
  assert.equal(at([6, 10, 10]), 'decrease');
  assert.equal(at([10, 6, 6]), 'decrease');
});

test('same-muscle sets before an exercise: direct sets count 1, a press or row half, another muscle nothing', () => {
  assert.equal(priorMuscleSets(late('2026-11-05', [8, 8, 8]), 'DB curl').get('2026-11-05'), 6);
  const day = [...sets('2026-11-05', 'Barbell bench press', 60, [8, 8, 8], 8, 0), ...sets('2026-11-05', 'Lat pulldown', 50, [10, 10], 8, 10), ...sets('2026-11-05', 'Cable curl', 20, [10], 8, 20)];
  assert.equal(priorMuscleSets(day, 'Cable curl').get('2026-11-05'), 1);
  assert.equal(priorMuscleSets(day, 'Barbell bench press').get('2026-11-05'), 0);
});

test('a late exercise for a tired muscle keeps its load once, a clearly too heavy one still drops', () => {
  const at = history => { const own = history.filter(r => r.exercise === 'DB curl'); return progressionDecision(own, 'DB curl', '8–12', 1, '2026-11-06', priorMuscleSets(history, 'DB curl')); };
  const tired = at(late('2026-11-05', [7, 6, 5]));
  assert.deepEqual([tired.decision, tired.kg, tired.fatigueHold, tired.fatigue], ['hold', 12.5, true, 6]);
  assert.equal(at(late('2026-11-05', [5, 4, 4])).decision, 'decrease', 'two of three sets of 8–12 under 5 reps');
  // A fresh session earlier is no comparison for a late one.
  assert.equal(at([...sets('2026-10-29', 'DB curl', 12.5, [12, 11, 10]), ...late('2026-11-05', [7, 6, 5])]).decision, 'hold');
  // Short at the same place twice in a row: the load is too heavy there.
  assert.equal(at([...late('2026-10-29', [7, 6, 6]), ...late('2026-11-05', [7, 6, 5])]).decision, 'decrease');
  // Without the day's other exercises nothing changes.
  assert.equal(progressionDecision(late('2026-11-05', [7, 6, 5]).filter(r => r.exercise === 'DB curl'), 'DB curl', '8–12', 1, '2026-11-06').decision, 'decrease');
});

test('the plan keeps the load of a tired late exercise', () => {
  const e = estimateStartingLoad({ exercise: 'DB curl', history: late('2026-11-05', [7, 6, 5]), targetReps: '8–12', today: '2026-11-06' });
  assert.deepEqual([e.kg, e.progression, e.fatigueHold, e.priorSets], [12.5, 'hold', true, 6]);
});

test('stagnation compares sessions at a similar place in the workout', () => {
  const fresh = d => sets(d, 'DB curl', 12.5, [10, 10, 10]);
  const three = progressionDecision([...fresh('2026-10-22'), ...fresh('2026-10-29'), ...fresh('2026-11-05')], 'DB curl', '8–12', 1, '2026-11-06');
  assert.equal(three.stalled, true);
  const mixed = [...late('2026-10-22', [10, 10, 10], 7.5), ...fresh('2026-10-29'), ...fresh('2026-11-05')];
  assert.equal(progressionDecision(mixed.filter(r => r.exercise === 'DB curl'), 'DB curl', '8–12', 1, '2026-11-06', priorMuscleSets(mixed, 'DB curl')).stalled, false);
});

test('the review keeps the load of a tired late exercise and compares it with a similar session', () => {
  const date = '2026-11-05';
  const row = (exercise, no, kg, preps, reps, rpe) => ['WORK', exercise, no, kg, preps, kg, reps, rpe, 'TRUE', '', '', 'FALSE', ''];
  const values = [['ADAPTIVNÍ SILOVÝ TRÉNINK'], [''], ['Datum', date, '', 'Targeted workout'], [], [], [], GYM_PLAN_COLUMNS,
    ...[1, 2, 3].map(i => row('Barbell Curl', i, 30, '8-12', 10, 8)), ...[1, 2, 3].map(i => row('Cable curl', i, 20, '8-12', 10, 8)),
    row('DB curl', 1, 12.5, '8-12', 7, 9), row('DB curl', 2, 12.5, '8-12', 6, 9), row('DB curl', 3, 12.5, '8-12', 5, 10)];
  // Last week the DB curl came first: a higher max, but no comparison for today.
  const history = sets('2026-10-29', 'DB curl', 12.5, [12, 11, 10]);
  const text = JSON.stringify(withLang('en', () => buildGymReview({ values, history, date })));
  assert.match(text, /DB curl 12\.5 kg, same weight \(after 6 biceps sets\)/);
  assert.doesNotMatch(text, /DB curl: estimated max/);
});
