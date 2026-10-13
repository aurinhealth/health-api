import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStrengthPlan, goalReps, recommendedGoal, EXERCISES } from '../src/strength-generator.js';
import { stretchingFor, warmupFor, routinesRow, readRoutines } from '../src/stretching.js';
import { planValues } from '../src/gym-plan-store.js';
import { normalizeTraining } from '../src/onboarding.js';
import { strengthPlanToIntervalsEvent } from '../src/intervals-strength.js';

const L_WARM = () => 'Rozcvička';
const context = (trainingSetup = {}) => ({ date: '2026-10-14', strength: { recentCompletedSets: [] }, cycling: { recentActivities: [], plannedWorkouts: [] }, recovery: {}, trainingSetup: { equipment: 'gym', ...trainingSetup } });
const work = plan => plan.rows.filter(r => r[0] === 'WORK');
const rest = row => Number(String(row[9]).match(/\[Pauza (\d+) s\]/)?.[1]);
const mainLift = plan => work(plan).find(r => EXERCISES[r[1]].warmup);

test('the gym goal sets the reps and rests of the main lifts', () => {
  const strength = generateStrengthPlan(context({ goal: 'strength', experience: 'regular' }), { durationMinutes: 75 });
  const fitness = generateStrengthPlan(context({ goal: 'fitness', experience: 'regular' }), { durationMinutes: 75 });
  assert.equal(mainLift(strength)[4], '3–6');
  assert.equal(mainLift(fitness)[4], '12–15');
  assert.ok(rest(mainLift(strength)) > rest(mainLift(fitness)));
  assert.ok(work(fitness).every(r => rest(r) <= 75));
  assert.match(strength.rationale, /Cíl síla|Goal strength/);
  assert.equal(strength.goal, 'strength');
});

test('a beginner lifts 6–8 for strength and an experienced athlete gets one more main set', () => {
  const press = EXERCISES['DB bench press'];
  assert.equal(goalReps(press, 'strength', 'beginner'), '6–8');
  assert.equal(goalReps(press, 'strength', 'experienced'), '3–6');
  assert.equal(goalReps(press, 'auto', 'regular'), press.reps);
  assert.equal(goalReps(EXERCISES['Dead bug'], 'fitness', 'regular'), EXERCISES['Dead bug'].reps);
  const sets = plan => work(plan).filter(r => r[1] === mainLift(plan)[1]).length;
  const regular = generateStrengthPlan(context({ goal: 'strength', experience: 'regular' }), { durationMinutes: 120 });
  const experienced = generateStrengthPlan(context({ goal: 'strength', experience: 'experienced' }), { durationMinutes: 120 });
  assert.ok(sets(experienced) >= sets(regular));
  const beginner = generateStrengthPlan(context({ goal: 'strength', experience: 'beginner' }), { durationMinutes: 60 });
  assert.ok(work(beginner).every(r => r[11] !== 'TRUE'));
});

test('stretching follows the muscles worked, fits the time and can be turned off', () => {
  const plan = generateStrengthPlan(context(), { durationMinutes: 60, focus: 'lower' });
  assert.ok(plan.stretching.items.length >= 3 && plan.stretching.items.length <= 5);
  assert.equal(plan.stretching.items.at(-1).id, 'child');
  assert.ok(plan.stretching.items.some(x => ['hip_flexor', 'hamstring', 'quad', 'figure_four'].includes(x.id)));
  assert.ok(plan.timing.totalSeconds <= 3600 && plan.timing.routineSeconds === plan.stretching.seconds + plan.warmup.seconds);
  const off = generateStrengthPlan(context({ stretching: false, warmup: false }), { durationMinutes: 60 });
  assert.equal(off.stretching, null);
  assert.equal(off.warmup, null);
  assert.equal(off.timing.routineSeconds, 0);
  assert.equal(stretchingFor([['WARMUP', 'DB bench press']], name => EXERCISES[name]?.muscle), null);
});

test('stretching is stored in the plan header and sent to Intervals.icu', () => {
  const plan = generateStrengthPlan(context(), { durationMinutes: 60, focus: 'upper' });
  const values = planValues(plan);
  assert.equal(values[5][0], 'Rozcvička a protažení');
  assert.deepEqual(readRoutines(values).stretching.items, plan.stretching.items);
  assert.deepEqual(readRoutines(values).warmup.items, plan.warmup.items);
  assert.equal(values[6][0], 'Typ');
  assert.deepEqual(routinesRow({}), []);
  assert.deepEqual(readRoutines([[], [], [], [], [], []]), { warmup: null, stretching: null });
  const description = strengthPlanToIntervalsEvent(plan).description;
  assert.match(description, /Protažení na konci|Stretching at the end/);
  assert.ok(description.indexOf(L_WARM()) < description.indexOf('1. '));
});

test('the training setup keeps the goal and the stretching switch', () => {
  assert.equal(normalizeTraining({ goal: 'strength' }).goal, 'strength');
  assert.equal(normalizeTraining({ goal: 'bulk' }).goal, 'auto');
  assert.equal(normalizeTraining({ goal: 'muscle_fitness' }).goal, 'muscle_fitness');
  assert.equal(normalizeTraining({}).stretching, true);
  assert.equal(normalizeTraining({ stretching: false }).stretching, false);
});

test('the goal follows the main sport while it is automatic', () => {
  assert.equal(recommendedGoal('cycling', 'regular'), 'strength_muscle');
  assert.equal(recommendedGoal('cycling', 'beginner'), 'muscle');
  assert.equal(recommendedGoal('running', 'experienced'), 'muscle_fitness');
  assert.equal(recommendedGoal('general', 'regular'), 'auto');
  const rider = generateStrengthPlan({ ...context({ experience: 'regular' }), profile: { mainSport: 'cycling' } }, { durationMinutes: 75 });
  const runner = generateStrengthPlan({ ...context({ experience: 'regular' }), profile: { mainSport: 'running' } }, { durationMinutes: 75 });
  assert.equal(rider.goal, 'strength_muscle');
  assert.equal(mainLift(rider)[4], '5–8');
  assert.equal(mainLift(runner)[4], '8–12');
  assert.match(rider.rationale, /podle tvého sportu|from your sport/);
  const chosen = generateStrengthPlan({ ...context({ goal: 'fitness' }), profile: { mainSport: 'cycling' } }, { durationMinutes: 75 });
  assert.equal(chosen.goal, 'fitness');
});

test('each stretch has steps, two photos and two rounds for the muscles worked most', () => {
  const plan = generateStrengthPlan(context(), { durationMinutes: 90, focus: 'lower' });
  for (const item of plan.stretching.items) {
    assert.ok(item.steps.length >= 2);
    assert.equal(item.photos.length, 2);
    assert.match(item.photos[0], /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/\w/);
  }
  assert.deepEqual(plan.stretching.items.map(x => x.rounds), [2, 2, 1, 1, 1]);
  assert.ok(plan.stretching.minutes >= 5 && plan.stretching.minutes <= 9);
});

test('the warm-up starts with easy cardio and moves for the muscles of the session', () => {
  const upper = generateStrengthPlan(context(), { durationMinutes: 60, focus: 'upper' });
  const lower = generateStrengthPlan(context(), { durationMinutes: 60, focus: 'lower' });
  assert.equal(upper.warmup.items[0].id, 'cardio');
  assert.equal(upper.warmup.items.length, 4);
  const short = generateStrengthPlan(context(), { durationMinutes: 30 });
  assert.ok(short.warmup.minutes + short.stretching.minutes <= 8);
  assert.ok(upper.warmup.items.some(x => ['arm_circles', 'chest_openers', 'band_pull_apart'].includes(x.id)));
  assert.ok(lower.warmup.items.some(x => ['worlds_greatest', 'squat', 'leg_swings', 'hip_circles', 'bridge'].includes(x.id)));
  assert.ok(upper.warmup.minutes >= 4 && upper.warmup.minutes <= 8);
  assert.equal(warmupFor([], () => null), null);
});
