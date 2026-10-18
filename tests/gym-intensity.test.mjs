import test from 'node:test';
import assert from 'node:assert/strict';
import { intensityOf, intensityRpe, intensityFromRpe, assignIntensities } from '../src/gym-intensity.js';
import { strengthSetOptions, strengthOptionNote } from '../src/gym-set-options.js';
import { planValues, syncGymPlanHistory } from '../src/gym-plan-store.js';
import { getStrengthHistory, parseStrengthPlan } from '../src/strength-history.js';
import { configureStrengthCoaching, estimateStrengthTiming } from '../src/strength-timing.js';
import { rowsFromModel, planForModel } from '../src/gym-adjust.js';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';

const work = (name, n, kg, note = '', failure = 'FALSE') => ['WORK', name, String(n), kg, '10', '', '', '', 'FALSE', note, '', failure, '', '', ''];

test('the eight letters, the RPE they stand for and the old RPE as a letter', () => {
  assert.equal(intensityOf(' pr '), 'PR');
  assert.equal(intensityOf('X'), '');
  assert.deepEqual(['W', 'T', 'E', 'M', 'H', 'F', 'PR', 'D'].map(intensityRpe), [null, 5, 6, 7.5, 9, 10, 9, 10]);
  assert.deepEqual([5, 6, 7, 8, 9, 10, '', null].map(intensityFromRpe), ['T', 'E', 'M', 'H', 'H', 'F', '', '']);
});

test('a generated plan gets a letter per set from what it already says', () => {
  const rows = [
    ['WARMUP', 'Bench', '1', '20', '8', '', '', '', 'FALSE', '[WARMUP]', '', 'FALSE', ''],
    work('Bench', 1, '40'), work('Bench', 2, '40'),
    work('Curl', 1, '10', 'nech si 3–4 opakování v rezervě (RPE 6–7)'),
    work('Fly', 1, '10'), work('Fly', 2, '10', '', 'TRUE'),
    ['DROP', 'Fly', '2', '8', 'max', '', '', '', 'FALSE', '', '', 'FALSE', '', '', ''],
    [...work('Row', 1, '30').slice(0, 14), 'E']
  ];
  assert.deepEqual(assignIntensities(rows).map(r => r[14]), ['W', 'M', 'H', 'E', 'M', 'F', 'D', 'E']);
  assert.deepEqual(assignIntensities([work('Bench', 1, '40')], { phaseRpe: '6' }).map(r => r[14]), ['E']);
});

test('the letter goes to history as a note tag, a drop set as type DROP the coach reads but progression does not', async () => {
  assert.equal(strengthOptionNote({ note: 'x', intensity: 'PR' }), 'x [Intenzita PR]');
  assert.equal(strengthSetOptions({ note: 'x [Intenzita PR]' }).intensity, 'PR');
  const done = r => { r[5] = r[3]; r[6] = '8'; r[8] = 'TRUE'; return r; };
  const values = planValues({ date: '2026-10-18', rows: [done([...work('Fly', 1, '20').slice(0, 14), 'H']), done(['DROP', 'Fly', '1', '15', 'max', '', '', '', 'FALSE', '', '', 'FALSE', '', '', 'D'])] });
  assert.equal(values[6].at(-1), 'Intenzita');
  assert.deepEqual(parseStrengthPlan(values).rows.map(r => [r.type, r.intensity]), [['WORK', 'H'], ['DROP', 'D']]);
  const db = scopedDb(createD1(), 1);
  await syncGymPlanHistory(db, values);
  const workOnly = await getStrengthHistory(db), all = await getStrengthHistory(db, 100, { drops: true });
  assert.deepEqual(workOnly.map(r => [r.type, r.intensity, r.rpe]), [['WORK', 'H', 9]]);
  assert.deepEqual(all.map(r => [r.type, r.intensity, r.rpe]), [['WORK', 'H', 9], ['DROP', 'D', 10]]);
});

test('for muscle the set to failure goes on as a drop set, with no rest before it', () => {
  const catalog = { 'Cable lateral raise': { fatigue: .3, muscle: 'side_delts' }, Bench: { fatigue: 1, warmup: true, muscle: 'chest' } };
  const rows = [work('Bench', 1, '60'), work('Cable lateral raise', 1, '10'), work('Cable lateral raise', 2, '10')];
  configureStrengthCoaching(rows, catalog, { goal: 'muscle' });
  assert.deepEqual(rows.map(r => [r[0], r[3], r[4], r[11]]), [['WORK', '60', '10', 'FALSE'], ['WORK', '10', '10', 'FALSE'], ['WORK', '10', '10', 'TRUE'], ['DROP', '7,5', 'max', 'FALSE'], ['DROP', '5', 'max', 'FALSE']]);
  configureStrengthCoaching(rows, catalog, { goal: 'muscle' });
  assert.equal(rows.filter(r => r[0] === 'DROP').length, 2);
  const strength = [work('Bench', 1, '60'), work('Cable lateral raise', 1, '10'), work('Cable lateral raise', 2, '10')];
  configureStrengthCoaching(strength, catalog, { goal: 'strength' });
  assert.equal(strength.some(r => r[0] === 'DROP'), false);
  const plain = estimateStrengthTiming(rows.filter(r => r[0] !== 'DROP'), catalog).restSeconds;
  assert.ok(estimateStrengthTiming(rows, catalog).restSeconds - plain <= 20);
});

test('the AI can add a drop set after a work set, never on its own', () => {
  const original = [work('Fly', 1, '20')];
  const rows = rowsFromModel([{ name: 'Fly', sets: [{ type: 'DROP', kg: 10, reps: '5', intensity: 'D' }, { type: 'WORK', kg: 20, reps: '10', intensity: 'F' }, { type: 'DROP', kg: 15, reps: '5', intensity: 'D' }] }], original, new Map());
  assert.deepEqual(rows.map(r => [r[0], r[2], r[3], r[4], r[11], r[14]]), [['WORK', '1', '20', '10', 'TRUE', 'F'], ['DROP', '1', '15', 'max', 'FALSE', 'D']]);
  assert.deepEqual(planForModel(rows).map(e => e.sets.map(s => s.type + s.intensity)), [['WORKF', 'DROPD']]);
});
