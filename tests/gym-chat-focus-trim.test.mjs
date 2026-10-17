import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoachActions, gymFocusOf, actionSummary } from '../src/coach-actions.js';
import { trimGymPlan } from '../src/gym-trim.js';
import { planValues } from '../src/gym-plan-store.js';
import { estimateStrengthTiming } from '../src/strength-timing.js';
import { EXERCISES } from '../src/strength-generator.js';

// Revize 2026-10-16, nález 23 (G01, G09, G12): the gym proposal from the chat
// knows the half of the body asked for, and a day with a plan gets it shortened.
const date = '2026-10-17';
const sets = (name, kg, reps, n = 3) => Array.from({ length: n }, (_, i) => ['WORK', name, String(i + 1), String(kg), reps, '', '', '', 'FALSE', '[Pauza 120 s]', '', 'FALSE', '', '']);
const rows = [...sets('Back squat', 90, '6-10'), ...sets('Bench press', 70, '6-10'), ...sets('Lat pulldown', 55, '8-12'), ...sets('Romanian deadlift', 80, '8-10'), ...sets('Overhead press', 35, '8-10'), ...sets('Leg press', 150, '10-12'), ...sets('Barbell curl', 25, '10-12')];
const values = planValues({ date, rows, planName: 'Celé tělo', timing: { requestedMinutes: 75, estimatedMinutes: 75 } });
const base = { week: [], athleteState: 'active' };
const gymAction = (extra = {}) => ({ type: 'workout', eventId: '', date, sport: 'gym', minutes: 45, status: '', statusUntil: '', reason: 'Posilovna podle zadání', fromExercise: '', toExercise: '', workoutId: '', kind: '', activityId: '', otherActivityId: '', time: '', kcal: 0, gymFocus: '', ...extra });

test('a gym proposal carries the half of the body from the field or the words', () => {
  assert.equal(gymFocusOf({ gymFocus: 'lower' }, ''), 'lower');
  assert.equal(gymFocusOf({}, 'Zítra chci posilovnu jen na nohy, 45 minut.'), 'lower');
  assert.equal(gymFocusOf({}, 'Dneska bez nohou, zítra jedu dlouhou jízdu.'), 'upper');
  assert.equal(gymFocusOf({}, '40 min jen horní polovina, nohy bolí.'), 'upper');
  assert.equal(gymFocusOf({}, 'Naplánuj mi posilovnu na čtvrtek.'), null);
  const [kept] = validateCoachActions([gymAction({ date: '2026-10-18' })], { ...base, userMessage: 'Zítra chci posilovnu jen na nohy, 45 minut.' }, date, { userInitiated: true });
  assert.equal(kept.gymFocus, 'lower');
  assert.match(actionSummary(kept), /\(nohy\)/);
});

test('a shorter session on a day with a gym plan shortens that plan, the big lifts first', () => {
  assert.ok(estimateStrengthTiming(rows, EXERCISES, 30).estimatedMinutes > 30);
  const [kept] = validateCoachActions([gymAction({ minutes: 30 })], { ...base, gymPlan: { values }, userMessage: 'Uprav dnešní cvičení, mám jen 30 min' }, date, { userInitiated: true });
  assert.ok(kept.trim, 'the plan is shortened, no second plan');
  const left = [...new Set(kept.trim.values.filter(r => r[0] === 'WORK').map(r => r[1]))];
  assert.deepEqual(left.slice(0, 2), ['Back squat', 'Bench press']);
  assert.ok(!left.includes('Barbell curl'));
  assert.ok(estimateStrengthTiming(kept.trim.values.filter(r => r[0] === 'WORK'), EXERCISES, 30).estimatedMinutes <= 30 || left.length === 2);
  assert.deepEqual(kept.trim.source, values);
  assert.match(actionSummary(kept), /zkrácený na 30 min/);
});

test('logged sets stay and a plan that already fits gets no card', () => {
  const started = values.map(r => r.slice()), i = started.findIndex(r => r[1] === 'Barbell curl');
  started[i][5] = '25'; started[i][6] = '12'; started[i][8] = 'TRUE';
  const trimmed = trimGymPlan(started, 30);
  assert.ok(trimmed.values.some(r => r[1] === 'Barbell curl' && r[8] === 'TRUE'));
  assert.equal(trimGymPlan(values, 180), null);
  assert.deepEqual(validateCoachActions([gymAction({ minutes: 180 })], { ...base, gymPlan: { values } }, date, { userInitiated: true }), []);
});
