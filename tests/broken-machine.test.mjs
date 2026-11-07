import test from 'node:test';
import assert from 'node:assert/strict';
import { getAthleteState, updateAthleteState, memoryCheck, memorySaves, brokenStations } from '../src/athlete-state.js';
import { BROKEN_WORDS, stationExercises } from '../src/gym-equipment.js';
import { COACH_ACTION_FORMAT } from '../src/coach-actions.js';
import { prepareGymSwap, todayGymContext } from '../src/coach-gym-adjustment.js';
import { scopedDb } from '../src/tenancy.js';
import { createD1 } from './helpers/d1.mjs';
import { readFileSync } from 'node:fs';
import { planValues } from '../src/gym-plan-store.js';

// Audit "Kouč jako skutečný trenér" 2026-11-07, point 11.
const date = '2026-10-14';

test('a broken machine is left out until the day the athlete said, two weeks without one, then the coach asks', async () => {
  const db = scopedDb(createD1(), 1);
  const saves = memorySaves({ save: [
    { text: 'Nefunguje Pivot leg press (do 20. 10.)', group: 'training', station: 'pivot_leg_press', until: '2026-10-20' },
    { text: 'Kladky jsou mimo provoz', group: 'training', station: 'cables', until: '' },
    { text: 'Rád jezdím ráno', group: 'training', station: 'no_such_machine', until: '2026-10-20' }] });
  assert.deepEqual(saves.map(s => [s.station, s.until]), [['pivot_leg_press', '2026-10-20'], ['cables', null], [undefined, undefined]]);
  const state = await updateAthleteState(db, { saves }, { date });
  assert.deepEqual(brokenStations(state, date), ['pivot_leg_press', 'cables']);
  assert.deepEqual(brokenStations(state, '2026-10-20'), ['cables']);
  assert.deepEqual(brokenStations(state, '2026-10-28'), []);
  assert.deepEqual(brokenStations({ ...state, memoryOff: true }, date), []);
  // On the day it should work again the coach asks "Platí to pořád?"; "Pořád platí" leaves it out two more weeks.
  assert.equal(memoryCheck(state, '2026-10-20').memory, 'Nefunguje Pivot leg press (do 20. 10.)');
  const kept = await updateAthleteState(db, { keep: 'Nefunguje Pivot leg press (do 20. 10.)' }, { date: '2026-10-20' });
  assert.deepEqual(brokenStations(kept, '2026-10-20'), ['pivot_leg_press', 'cables']);
  // Undo forgets it, so the machine is back.
  const gone = await updateAthleteState(db, { forget: 'Kladky jsou mimo provoz' }, { date });
  assert.deepEqual(brokenStations(await getAthleteState(db, { date }), date), ['pivot_leg_press']);
  assert.ok(gone);
});

test('the coach gets the stations only when a machine is said not to work, and the schema carries station and until', () => {
  for (const t of ['Leg press nefunguje', 'Kladky jsou rozbité', 'The cable machine is out of order', 'Smith je mimo provoz']) assert.ok(BROKEN_WORDS.test(t), t);
  for (const t of ['Dej mi zítra nohy', 'Funguje to skvěle']) assert.ok(!BROKEN_WORDS.test(t), t);
  const save = COACH_ACTION_FORMAT.schema.properties.memory.properties.save.items;
  assert.deepEqual(save.required, ['text', 'group', 'station', 'muscles', 'until']);
  const src = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(src, /BROKEN_WORDS\.test\(message\)\?\{gymStations:stationList\(\)\}/);
  // Saved before the previews, so the gym card made now leaves the machine out.
  assert.ok(src.indexOf('const saves=remembers') < src.indexOf("a.preview=await workoutPreview"));
});

test('a swap or its alternatives never use a broken machine', () => {
  assert.ok(stationExercises(['pivot_leg_press']).includes('Pivot leg press'));
  const gym = { values: planValues({ date, rows: [['WORK', 'Pendulum squat', '1', '60', '8–12', '', '', '', 'FALSE', '', '', 'FALSE', '']] }), history: [] };
  assert.throws(() => prepareGymSwap(gym, 'Pendulum squat', 'Pivot leg press', 'x', [], ['pivot_leg_press']), /nefunguje|out of order/);
  const ctx = todayGymContext(gym, date, [], ['pivot_leg_press']);
  assert.ok(todayGymContext(gym, date).exercises[0].alternatives.some(a => a.name === 'Pivot leg press'));
  assert.ok(!ctx.exercises.flatMap(e => e.alternatives.map(a => a.name)).includes('Pivot leg press'));
});

test('the gym plan leaves out every exercise on a broken machine and says so', async () => {
  const { generateStrengthPlan } = await import('../src/strength-generator.js');
  const context = broken => ({ date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: [], plannedSessions: [] }, athleteState: { status: 'active', memories: [], brokenStations: broken } });
  const used = broken => generateStrengthPlan(context(broken), { focusMuscles: ['quads'], durationMinutes: 45 }).rows.filter(r => r[0] === 'WORK').map(r => r[1]);
  const all = ['pivot_leg_press', 'pendulum_squat', 'leg_extension'], free = used([]);
  assert.ok(free.some(name => stationExercises(all).includes(name)), free.join());
  const without = used(all);
  assert.ok(without.length && !without.some(name => stationExercises(all).includes(name)), without.join());
  assert.match(generateStrengthPlan(context(['pivot_leg_press']), { focusMuscles: ['quads'], durationMinutes: 45 }).rationale, /Mimo provoz: Pivot leg press\./);
});
