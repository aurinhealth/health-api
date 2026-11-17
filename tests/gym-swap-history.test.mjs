import test from 'node:test';
import assert from 'node:assert/strict';
import { withHistoryOf } from '../src/strength-history.js';
import { gymAlternatives } from '../src/gym-catalog.js';

// Petr 2026-11-12: floor press swapped for a bench press done months ago got
// no weight, as the bench press was older than the 500 recent sets.
const row = (date, exercise, kg, set = 1) => ({ workout_date: date, plan_row: 10 + set, type: 'WORK', exercise, set_no: set, actual_kg: kg, actual_reps: 8, rpe: 8, completed: 1 });
const recent = Array.from({ length: 500 }, (_, i) => row('2026-10-' + String(1 + (i % 28)).padStart(2, '0'), 'Leg press', 120, i));
const fakeDb = rows => {
  const calls = [];
  return { userId: 'u', calls, prepare: sql => ({ bind: (...args) => ({ all: async () => { calls.push({ sql, args }); return { results: rows }; } }) }) };
};

test('a swap reaches an exercise done before the recent window', async () => {
  const db = fakeDb([row('2026-07-01', 'Barbell bench press', 60, 1), row('2026-07-01', 'Barbell bench press', 60, 2)]);
  const history = await withHistoryOf(db, recent, ['Barbell bench press']);
  assert.equal(history.length, 502);
  assert.match(db.calls[0].sql, /exercise IN \(\?\) AND workout_date <= \?/);
  assert.equal(db.calls[0].args.at(-2), '2026-10-01');
  const bench = gymAlternatives('Barbell Floor Press', history).find(a => a.name === 'Barbell bench press');
  assert.equal(bench.source, 'own-history');
  assert.ok(bench.kg >= 60);
});

test('no extra read when the recent window holds everything', async () => {
  const db = fakeDb([]);
  const few = recent.slice(0, 20);
  assert.equal(await withHistoryOf(db, few, ['Barbell bench press']), few);
  assert.equal(db.calls.length, 0);
});

test('sets already in the window are not counted twice', async () => {
  const dup = row('2026-10-01', 'Leg press', 120, 0);
  const db = fakeDb([dup]);
  assert.equal((await withHistoryOf(db, recent, ['Leg press'])).length, 500);
});
