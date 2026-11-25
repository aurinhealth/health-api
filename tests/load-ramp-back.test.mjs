import test from 'node:test';
import assert from 'node:assert/strict';
import { gymLoadEstimate, gymAlternatives } from '../src/gym-catalog.js';
import { generateStrengthPlan, templateStrengthPlan, painfulExercises, EXERCISES } from '../src/strength-generator.js';
import { painAreas } from '../src/pain-words.js';
import { adjustGymPlan } from '../src/gym-adjust.js';

// Load ramp-back review 2026-11-25: after a break, illness or pain the coach
// must not add load (C3, C4, C5, C8, C6 gym part).
const sets = (date, exercise = 'Pendulum squat', kg = 100) => [1, 2, 3].map(set => ({ workout_date: date, exercise, set_no: set, type: 'WORK', actual_kg: kg, actual_reps: 12, planned_reps: '8–12', rpe: 7, completed: 1 }));
const history = [...sets('2026-09-20'), ...sets('2026-09-24'), ...sets('2026-09-28')];

test('C3: a swapped or added exercise holds or lowers its weight after a break', () => {
  const fresh = gymLoadEstimate('Pendulum squat', history, '2026-09-30');
  assert.ok(fresh.kg > 100, 'two days later the reps were met: one step up');
  assert.equal(gymLoadEstimate('Pendulum squat', history, '2026-10-14').kg, 100, '16 days: the weight holds');
  assert.ok(gymLoadEstimate('Pendulum squat', history, '2026-10-25').kg < 100, '27 days: lighter');
  const alt = gymAlternatives('Pivot leg press', history, [], {}, () => true, {}, '2026-10-25').find(a => a.name === 'Pendulum squat');
  if (alt) assert.ok(alt.kg < 100, 'an alternative after a long break is lighter too');
});

const context = (date, extra = {}) => ({ date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: history, plannedSessions: [] }, athleteState: { status: 'active', memories: [], brokenStations: [] }, ...extra });

test('C4: no extra set after two weeks without the gym', () => {
  // A good morning: before, the squat without recent load got a fourth set.
  const plan = generateStrengthPlan(context('2026-10-25', { adaptive: { recovery: { zone: 'green', score: 90, flags: [] } } }), { durationMinutes: 90 });
  assert.ok(plan.rows.some(r => r[1] === 'Pendulum squat'));
  const byExercise = new Map();
  for (const r of plan.rows.filter(r => r[0] === 'WORK')) byExercise.set(r[1], (byExercise.get(r[1]) || 0) + 1);
  for (const [name, n] of byExercise) assert.ok(n <= (Number(EXERCISES[name].sets) || 3) * (EXERCISES[name].unilateral ? 2 : 1), name + ': ' + n + ' sets');
});

const template = { sport: 'gym', name: 'Nohy', minutes: 60, exercises: [{ name: 'Pendulum squat', sets: 3, reps: '8–12' }, { name: 'Lat pulldown', sets: 3, reps: '10' }] };

test('C5: a saved workout respects a red morning, signs of illness and pain', () => {
  assert.throws(() => templateStrengthPlan(context('2026-10-01', { adaptive: { recovery: { zone: 'red', flags: [] } } }), template), /červená|red zone/);
  assert.throws(() => templateStrengthPlan(context('2026-10-01', { adaptive: { recovery: { zone: 'green', flags: ['respiration_elevated'] } } }), template), /Dech|breathing/);
  assert.throws(() => templateStrengthPlan(context('2026-10-01', { checkin: 'sick' }), template), /Nemoc|Sick/);
  const sore = context('2026-10-01', { athleteState: { status: 'active', memories: ['Bolí mě koleno'] } });
  const plan = templateStrengthPlan(sore, template);
  assert.deepEqual([...new Set(plan.rows.filter(r => r[0] === 'WORK').map(r => r[1]))], ['Lat pulldown']);
  assert.match(plan.rationale, /Pendulum squat/);
  assert.throws(() => templateStrengthPlan(sore, { ...template, exercises: [template.exercises[0]] }), /bolest|pain/);
});

test('C8: the thigh, the back of the thigh, the glutes and the ribs are body parts', () => {
  assert.deepEqual(painAreas(['Bolí mě stehno']).map(a => a.id), ['thigh']);
  assert.deepEqual(painAreas(['natažený hamstring']).map(a => a.id), ['hamstring']);
  assert.deepEqual(painAreas(['bolí mě hýždě']).map(a => a.id), ['glute']);
  assert.deepEqual(painAreas(['sore ribs']).map(a => a.id), ['ribs']);
  assert.deepEqual(painAreas(['nebolí mě stehno']), []);
  assert.ok(painfulExercises(['natažený hamstring']).avoid.has('Barbell Romanian deadlift'));
  assert.ok(painfulExercises(['bolí mě hýždě']).avoid.has('Hip thrust'));
  assert.ok(!painfulExercises(['bolí mě hýždě']).avoid.has('Lat pulldown'));
});

test('C6: the AI gym adjust never adds an exercise on a painful part', async () => {
  const rows = [['WORK', 'Lat pulldown', '1', '50', '10', '', '', '', 'FALSE', '', '', 'FALSE', '', '', '']];
  let seen;
  const { rows: out } = await adjustGymPlan({}, { rows, request: 'přidej nohy', taste: { memories: ['Bolí mě koleno'] }, ask: async (_e, req) => { seen = JSON.parse(req.input); return { text: JSON.stringify({ answer: 'Přidal jsem dřep.', exercises: [{ name: 'Lat pulldown', sets: [{ type: 'WORK', kg: 50, reps: '10' }] }, { name: 'Pendulum squat', sets: [{ type: 'WORK', kg: 80, reps: '10' }] }] }) }; } });
  assert.ok(!seen.catalog.some(e => e.name === 'Pendulum squat'), 'not offered to the model');
  assert.deepEqual([...new Set(out.map(r => r[1]))], ['Lat pulldown']);
});
