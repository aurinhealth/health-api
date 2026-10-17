import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanGymRows, rowsFromModel, planForModel } from '../src/gym-adjust.js';
import { serverSource } from "./helpers/server-source.mjs";

const row = (type, name, n, kg, reps, akg = '', areps = '', done = 'FALSE') => [type, name, String(n), kg, reps, akg, areps, '', done, '', '', 'FALSE', ''];

test('the AI answer becomes plan rows only from the catalog, keeping each exercise\'s notes', () => {
  const original = [row('WARMUP', 'Bench', 1, '20', '8'), ['WORK', 'Bench', '1', '40', '8-10', '', '', '', 'FALSE', 'Hrudník [Pauza 90 s]', '', 'TRUE', 'A']];
  assert.deepEqual(planForModel(original), [{ name: 'Bench', sets: [{ type: 'WARMUP', kg: 20, reps: '8' }, { type: 'WORK', kg: 40, reps: '8-10' }] }]);
  const rows = rowsFromModel([
    { name: 'Bench', sets: [{ type: 'WORK', kg: 41.2, reps: '8' }, { type: 'WORK', kg: 41, reps: '8' }] },
    { name: 'DB curl', sets: [{ type: 'WORK', kg: null, reps: '10' }] },
    { name: 'Invented press', sets: [{ type: 'WORK', kg: 10, reps: '10' }] },
    { name: 'Bench', sets: [{ type: 'WORK', kg: 99, reps: '1' }] }
  ], original, new Map([['DB curl', { note: 'Biceps' }]]));
  assert.deepEqual(rows.map(r => [r[1], r[2], r[3], r[9], r[11], r[12]]), [['Bench', '1', '41', 'Hrudník [Pauza 90 s]', 'FALSE', 'A'], ['Bench', '2', '41', 'Hrudník [Pauza 90 s]', 'TRUE', 'A'], ['DB curl', '1', '', 'Biceps', 'FALSE', '']]);
});

test('a confirmed proposal keeps only planning columns of known exercises', () => {
  const rows = cleanGymRows([row('WORK', 'Bench', 1, '40.3', '8', '45', '8', 'TRUE'), row('WORK', 'Mystery', 1, '1', '1'), ['STRETCH', 'Bench']], new Set(['Bench']));
  assert.deepEqual(rows, [['WORK', 'Bench', '1', '40,5', '8', '', '', '', 'FALSE', '', '', 'FALSE', '', '']]);
  assert.throws(() => cleanGymRows([row('WORK', 'Mystery', 1, '1', '1')], new Set(['Bench'])), /aspoň jeden cvik/);
});

test('the week proposal comes back without the chat and confirmed gym rows are cleaned', () => {
  const server = serverSource();
  assert.match(server, /return Response\.json\(\{status:'ok',start,proposal\}/);
  assert.doesNotMatch(server, /WEEK_REVIEW_REQUEST/);
  assert.match(server, /if\(Array\.isArray\(body\.rows\)\)plan\.rows=cleanGymRows/);
});

test('the model\'s numbers are checked: a load within 0–500 kg or none, reps as a number or range, else the plan\'s', () => {
  const original = [['WARMUP', 'Bench', '1', '20', '6', '', '', '', 'FALSE', '[WARMUP]', '', 'FALSE', ''], ['WORK', 'Bench', '1', '40', '8-10', '', '', '', 'FALSE', 'Hrudník', '', 'FALSE', '']];
  const rows = rowsFromModel([{ name: 'Bench', sets: [{ type: 'WARMUP', kg: -5, reps: 'a few' }, { type: 'WORK', kg: 900, reps: 'lots' }, { type: 'WORK', kg: 42.5, reps: '8–10' }, { type: 'WORK', kg: 500, reps: '12' }] }], original, new Map());
  assert.deepEqual(rows.map(r => [r[0], r[3], r[4]]), [['WARMUP', '', '6'], ['WORK', '', '8-10'], ['WORK', '42,5', '8-10'], ['WORK', '500', '12']]);
});

test('after an AI change the old "+2,5 kg" goes, the session fits its minutes and dumbbells are ones the athlete has', async () => {
  const { fitGymMinutes, snapGymDumbbells, adjustGymPlan } = await import('../src/gym-adjust.js');
  const original = [['WORK', 'Lat pulldown', '1', '50', '8-10', '', '', '', 'FALSE', 'Laty; ↑ minule 3× 10 op. @ 47,5 kg → +2,5 kg [Pauza 120 s]', '', 'FALSE', '']];
  const [changed] = rowsFromModel([{ name: 'Lat pulldown', sets: [{ type: 'WORK', kg: 45, reps: '10' }] }], original, new Map());
  assert.equal(changed[9], 'Laty [Pauza 120 s]');
  const [same] = rowsFromModel([{ name: 'Lat pulldown', sets: [{ type: 'WORK', kg: 50, reps: '10' }] }], original, new Map());
  assert.match(same[9], /\+2,5 kg/);
  const many = ['Lat pulldown', 'Leg press', 'DB bench press', 'Low row', 'DB shoulder press', 'Cable curl'].flatMap(name => [1, 2, 3, 4, 5].map(n => ['WORK', name, String(n), '20', '8-10', '', '', '', 'FALSE', '[Pauza 120 s]', '', 'FALSE', '']));
  const fitted = fitGymMinutes(many, 45);
  assert.ok(fitted.length < many.length);
  assert.ok(new Set(fitted.map(r => r[1])).size === 6, 'every exercise keeps a set');
  assert.equal(snapGymDumbbells([['WORK', 'DB bench press', '1', '22,5', '8']], [10, 20, 25])[0][3], '20');
  // The AI only sees exercises the athlete's equipment allows.
  let seen = null;
  await adjustGymPlan({}, { rows: original, request: 'víc zad', equipment: name => name === 'Low row', ask: async (_e, req) => { seen = JSON.parse(req.input); return { text: JSON.stringify({ answer: 'Přidal jsem low row.', exercises: [{ name: 'Low row', sets: [{ type: 'WORK', kg: 40, reps: '10' }] }] }) }; } });
  assert.deepEqual(seen.catalog.map(e => e.name).sort(), ['Lat pulldown', 'Low row']);
});

test('the AI adjustment sees readiness, status and legs, and its weights follow the equipment step (Revize 2026-10-16, nález 27)', async () => {
  const { adjustGymPlan } = await import('../src/gym-adjust.js');
  const { gymDayFacts } = await import('../src/strength-generator.js');
  const context = { date: '2026-09-28', cycling: { recentActivities: [], nextRide: { start_date_local: '2026-09-29T08:00:00', name: 'VO2max 5x4', intensity: true, durationHours: 1.2 } }, adaptive: { recovery: { zone: 'amber', score: 62, flags: ['hrv_low'] } }, athleteState: { status: 'active' } };
  const day = gymDayFacts(context);
  assert.deepEqual(day.readiness, { zone: 'amber', score: 62, flags: ['hrv_low'] });
  assert.equal(day.athleteStatus, 'active');
  assert.equal(day.legs.protect, true);
  assert.match(day.legs.reason, /VO2max/);
  const original = [['WORK', 'Barbell back squat', '1', '60', '5', '', '', '', 'FALSE', '', '', 'FALSE', ''], ['WORK', 'DB curl', '1', '10', '10', '', '', '', 'FALSE', '', '', 'FALSE', '']];
  let seen = null;
  const { rows } = await adjustGymPlan({}, { rows: original, request: 'lehčeji', day, ask: async (_e, req) => { seen = JSON.parse(req.input); return { text: JSON.stringify({ answer: 'Ubral jsem.', exercises: [{ name: 'Barbell back squat', sets: [{ type: 'WARMUP', kg: 17, reps: '8' }, { type: 'WORK', kg: 51, reps: '5' }] }, { name: 'DB curl', sets: [{ type: 'WORK', kg: 11, reps: '10' }] }] }) }; } });
  assert.deepEqual(seen.readiness.zone, 'amber');
  assert.equal(seen.legs.protect, true);
  assert.equal(seen.athleteStatus, 'active');
  // A bar by 2,5 kg (17 → 17,5, 51 → 50), dumbbells by 2,5 kg (11 → 10).
  assert.deepEqual(rows.map(r => [r[1], r[3]]), [['Barbell back squat', '17,5'], ['Barbell back squat', '50'], ['DB curl', '10']]);
});
