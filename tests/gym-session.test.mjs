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
