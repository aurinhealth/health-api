import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGymReview } from '../src/gym-review.js';
import { buildCoachCouncil } from '../src/coach-engine.js';
import { GYM_PLAN_COLUMNS } from '../src/gym-plan-store.js';
import { withLang } from '../src/lang.js';

const date = '2026-10-07';
const set = (exercise, no, pkg, preps, kg, reps, rpe, done = true) => ['WORK', exercise, no, pkg, preps, kg, reps, rpe, done ? 'TRUE' : 'FALSE', '', '', 'FALSE', ''];
const values = [['ADAPTIVNÍ SILOVÝ TRÉNINK'], [''], ['Datum', date, '', 'Horní tělo A'], [], [], [], GYM_PLAN_COLUMNS,
  set('DB bench press', 1, 24, '8-10', 24, 10, 7), set('DB bench press', 2, 24, '8-10', 24, 10, 7.5), set('DB bench press', 3, 24, '8-10', 24, 10, 8),
  set('Low row', 1, 50, '10-12', 50, 9, 9), set('Low row', 2, 50, '10-12', 50, 8, 9.5), set('Low row', 3, 50, '10-12', null, null, null, false),
  set('Cable curl', 1, 20, '10-12', 20, 12, 8), set('Cable curl', 2, 20, '10-12', 20, 11, 8.5)];
const history = [
  { workout_date: '2026-10-03', exercise: 'DB bench press', actual_kg: 22, actual_reps: 10, rpe: 8 },
  { workout_date: '2026-10-03', exercise: 'Low row', actual_kg: 50, actual_reps: 11, rpe: 8 },
  { workout_date: '2026-10-03', exercise: 'Cable curl', actual_kg: 20, actual_reps: 11, rpe: 8 }];

test('the gym review sets every exercise against the plan, last time and next time', () => {
  const r = withLang('cs', () => buildGymReview({ values, history, date })), text = JSON.stringify(r);
  assert.equal(r.verdict, 'Odcvičeno 7 z 8 pracovních sérií.');
  assert.deepEqual(r.table.rows[0], ['DB bench press', '3× 24 kg × 8-10', '24×10, 24×10, 24×10', '8']);
  assert.match(text, /DB bench press: odhad maxima 32 kg, o 2,7 kg víc než minule \(3\. 10\.\)/);
  assert.match(text, /Low row: 2 z 3 sérií, 50×9 a 50×8 pod rozsahem 10–12 opakování\./);
  assert.match(text, /DB bench press 27,5 kg \(\+3,5\)/);
  assert.match(text, /Low row 4\d(,5)? kg \(−/);
  assert.deepEqual(r.sets[1].sets.map(s => s.status), ['under', 'under', 'missing']);
});

test('in English the gym review is English', () => {
  const r = withLang('en', () => buildGymReview({ values, history, date }));
  assert.equal(r.verdict, '7 of 8 work sets done.');
  assert.doesNotMatch(JSON.stringify(r), /[ěščřžýáíéůú]/i);
});

test('a finished gym session replaces its preparation card with the review', () => {
  const all = values.map((row, i) => i > 6 ? row.map((v, j) => j === 8 ? 'TRUE' : j === 5 && v == null ? 50 : j === 6 && v == null ? 8 : v) : row);
  const council = withLang('cs', () => buildCoachCouncil({ date, daily: { date, training: { planned: [{ id: 'g', name: 'Horní tělo A', type: 'WeightTraining' }], completed: [] } }, gym: { values: all }, strengthHistory: history }));
  assert.ok(!council.coaches.some(c => c.id === 'gym'));
  assert.equal(council.reviews.length, 1);
  assert.equal(council.reviews[0].title, 'Po tréninku · Posilovna');
  assert.equal(council.reviews[0].headline, 'Horní tělo A');
});
