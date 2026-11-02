import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoachActions, gymMusclesOf, requestedMuscles, GYM_MUSCLES, COACH_ACTION_FORMAT } from '../src/coach-actions.js';
import { FOCUS_GROUPS, EXERCISES, generateStrengthPlan } from '../src/strength-generator.js';

// Petr 2026-11-01: "75 minut v posilovně, určitě cviky na prsa" gave a card
// named Lower Body without a chest exercise, while its text said chest-focused.
const date = '2026-11-01';
const ask = 'Naplanuj mi 75minutovy trenink v posilovne. Chci ram urcite cviky na prsa';
const gymAction = (extra = {}) => ({ type: 'workout', eventId: '', date, sport: 'gym', minutes: 75, status: '', statusUntil: '', reason: 'Chest-focused gym session', fromExercise: '', toExercise: '', workoutId: '', kind: '', activityId: '', otherActivityId: '', time: '', kcal: 0, gymFocus: '', gymMuscles: [], insisted: false, planId: '', days: [], raceKm: 0, ...extra });

test('the coach card offers the same muscle groups as the strength generator', () => {
  assert.deepEqual([...GYM_MUSCLES].sort(), Object.keys(FOCUS_GROUPS).sort());
  const item = COACH_ACTION_FORMAT.schema.properties.actions.items;
  assert.ok(item.required.includes('gymMuscles'));
  assert.deepEqual(item.properties.gymMuscles.items.enum, GYM_MUSCLES);
});

test('muscle groups named as a wish are found, complaints and plain days are not', () => {
  assert.deepEqual(requestedMuscles(ask), ['chest']);
  assert.deepEqual(requestedMuscles('Chci cviky na prsa'), ['chest']);
  assert.deepEqual(requestedMuscles('zítra na záda a biceps, 60 min'), ['upper_back', 'lats', 'biceps']);
  assert.deepEqual(requestedMuscles('chest day please'), ['chest']);
  assert.deepEqual(requestedMuscles('Chci procvičit ramena'), ['front_delts', 'side_delts', 'rear_delts']);
  assert.deepEqual(requestedMuscles('Bolí mě záda, naplánuj posilovnu'), []);
  assert.deepEqual(requestedMuscles('Naplánuj mi posilovnu na čtvrtek'), []);
  assert.deepEqual(requestedMuscles('jen na nohy'), []);
});

test('named groups always stay, a lone group gets companions for a long session', () => {
  assert.deepEqual(gymMusclesOf({ minutes: 75 }, ask), ['chest', 'triceps', 'abs']);
  assert.deepEqual(gymMusclesOf({ minutes: 30 }, ask), ['chest']);
  // The coach's own list leaves chest out: the athlete's words put it back first.
  assert.deepEqual(gymMusclesOf({ minutes: 75, gymMuscles: ['triceps', 'abs'] }, ask), ['chest', 'triceps', 'abs']);
  assert.deepEqual(gymMusclesOf({ minutes: 60, gymMuscles: ['chest', 'nonsense'] }, ''), ['chest', 'triceps', 'abs']);
  assert.deepEqual(gymMusclesOf({ minutes: 60, gymMuscles: [] }, ''), []);
});

test('the chest request becomes an upper-body card built around chest', () => {
  const [kept] = validateCoachActions([gymAction({ gymFocus: 'lower' })], { week: [], athleteState: 'active', userMessage: ask }, date, { userInitiated: true });
  assert.deepEqual(kept.gymMuscles, ['chest', 'triceps', 'abs']);
  assert.equal(kept.gymFocus, 'upper');
  const [legs] = validateCoachActions([gymAction({ gymMuscles: ['quads', 'hamstrings'] })], { week: [], athleteState: 'active', userMessage: '' }, date, { userInitiated: true });
  assert.equal(legs.gymFocus, 'lower');
  const [plain] = validateCoachActions([gymAction()], { week: [], athleteState: 'active', userMessage: 'Naplánuj mi posilovnu' }, date, { userInitiated: true });
  assert.equal(plain.gymMuscles, undefined);
});

test('75 minutes for chest, triceps and abs is mostly chest, never legs', () => {
  const plan = generateStrengthPlan({ date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: [], plannedSessions: [] } }, { focusMuscles: ['chest', 'triceps', 'abs'], durationMinutes: 75 });
  const names = [...new Set(plan.rows.filter(r => r[0] === 'WORK').map(r => r[1]))];
  const muscle = name => EXERCISES[name]?.muscle;
  assert.ok(names.filter(n => muscle(n) === 'chest').length >= 2, names.join(', '));
  assert.ok(!names.some(n => ['quads', 'hamstrings', 'glutes', 'hips', 'calves'].includes(muscle(n))), names.join(', '));
  assert.match(plan.planName, /Chest|Hrudník/);
  assert.ok(names.every(n => EXERCISES[n]));
});
