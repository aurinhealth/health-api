import test from 'node:test';
import assert from 'node:assert/strict';
import { warmupFor, stretchingFor, routinesFor, normalizeMyRoutines, myRoutinesView, routineMoves, routinesRow, readRoutines } from '../src/stretching.js';
import { normalizeTraining } from '../src/onboarding.js';

const muscleOf = name => name;
const legs = [...Array(4).fill(['WORK', 'quads']), ...Array(3).fill(['WORK', 'hamstrings']), ...Array(3).fill(['WORK', 'glutes']), ['WORK', 'calves']];
const upper = [...Array(3).fill(['WORK', 'chest']), ...Array(3).fill(['WORK', 'triceps'])];
const ids = r => r.items.map(i => i.id);

test('without a date the same session gets the same best-fitting moves', () => {
  assert.deepEqual(ids(warmupFor(legs, muscleOf, { count: 3 })), ids(warmupFor(legs, muscleOf, { count: 3 })));
});

test('the date rotates the moves among the ones that fit, and a day keeps its own', () => {
  const days = ['2026-10-26', '2026-10-29', '2026-11-02', '2026-11-05', '2026-11-09'];
  const sets = days.map(date => ids(warmupFor(legs, muscleOf, { count: 3, date })).join());
  assert.ok(new Set(sets).size >= 3, 'other moves on other days: ' + sets.join(' | '));
  assert.deepEqual(ids(warmupFor(legs, muscleOf, { count: 3, date: days[0] })).join(), sets[0]);
  const stretches = days.map(date => ids(stretchingFor(legs, muscleOf, { count: 3, date })).join());
  assert.ok(new Set(stretches).size >= 2);
  for (const s of stretches) assert.equal(s.split(',').at(-1), 'child');
});

test('a length fills that time with more moves', () => {
  const five = warmupFor(legs, muscleOf, { minutes: 5, date: '2026-10-26' });
  const ten = warmupFor(legs, muscleOf, { minutes: 10, date: '2026-10-26' });
  const fifteen = stretchingFor(legs, muscleOf, { minutes: 15, date: '2026-10-26' });
  assert.ok(Math.abs(five.seconds - 300) <= 60, 'five: ' + five.seconds);
  assert.ok(Math.abs(ten.seconds - 600) <= 60, 'ten: ' + ten.seconds);
  assert.ok(Math.abs(fifteen.seconds - 900) <= 60, 'fifteen: ' + fifteen.seconds);
  assert.ok(ten.items.length > five.items.length);
});

test('the main sport adds its moves: a cyclist stretches the hip flexors after an upper-body day', () => {
  assert.ok(!ids(stretchingFor(upper, muscleOf, { count: 4 })).includes('hip_flexor'));
  assert.ok(ids(stretchingFor(upper, muscleOf, { count: 4, sport: 'cycling' })).includes('hip_flexor'));
});

test('own routines are cleaned, built and picked instead of the automatic one', () => {
  const mine = normalizeMyRoutines({ warmup: [
    { id: 'legs', name: 'Legs', items: [{ move: 'hip_circles' }, { name: 'Rowing machine', seconds: 300 }, { name: '', seconds: 30 }, { move: 'nope' }] },
    { id: 'empty', name: 'Empty', items: [] }
  ], stretching: 'x' });
  assert.deepEqual(mine.warmup, [{ id: 'legs', name: 'Legs', items: [{ move: 'hip_circles' }, { name: 'Rowing machine', seconds: 300, sides: false }] }]);
  assert.deepEqual(mine.stretching, []);
  const setup = { myRoutines: mine, warmupRoutine: 'legs' };
  const all = routinesFor(legs, muscleOf, setup, 60, { date: '2026-10-26' });
  assert.equal(all.warmup.name, 'Legs');
  assert.deepEqual(all.warmup.items.map(i => i.seconds), [20, 300]);
  assert.equal(all.stretching.items.at(-1).id, 'child');
  // One day: automatic for 10 minutes instead.
  const day = routinesFor(legs, muscleOf, setup, 60, { date: '2026-10-26', override: { warmup: { routine: 'auto', length: '10' } } });
  assert.equal(day.warmup.name, undefined);
  assert.ok(day.warmup.seconds >= 540);
  // Stored with its name, so the app shows "Legs".
  assert.equal(readRoutines([0, 0, 0, 0, 0, routinesRow({ warmup: all.warmup })]).warmup.name, 'Legs');
  const view = myRoutinesView(setup);
  assert.equal(view.warmup[0].minutes, 6);
  assert.equal(view.warmup[0].items[0].name.length > 0, true);
});

test('the settings keep the lengths and an own routine only while it exists', () => {
  const t = normalizeTraining({ warmupLength: 10, stretchingLength: 'auto', myRoutines: { warmup: [{ id: 'a', name: 'A', items: [{ move: 'squat' }] }] }, warmupRoutine: 'a', stretchingRoutine: 'gone' });
  assert.equal(t.warmupLength, 10);
  assert.equal(t.stretchingLength, 'auto');
  assert.equal(t.warmupRoutine, 'a');
  assert.equal(t.stretchingRoutine, 'auto');
  assert.equal(normalizeTraining({ warmupLength: 99 }).warmupLength, 'auto');
  const moves = routineMoves();
  assert.ok(moves.warmup.length >= 29 && moves.stretching.some(m => m.id === 'child'));
});
