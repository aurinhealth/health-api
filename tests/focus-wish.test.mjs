import test from 'node:test';
import assert from 'node:assert/strict';
import { updateAthleteState, memorySaves, focusGroups, memoryCheck } from '../src/athlete-state.js';
import { generateStrengthPlan, FOCUS_GROUPS } from '../src/strength-generator.js';
import { COACH_ACTION_FORMAT, GYM_MUSCLES } from '../src/coach-actions.js';
import { scopedDb } from '../src/tenancy.js';
import { createD1 } from './helpers/d1.mjs';

// Audit "Kouč jako skutečný trenér" 2026-11-07, point 10.
const date = '2026-10-14';

test('a lasting wish is kept until the day the athlete said, six weeks without one, then the coach asks', async () => {
  const saves = memorySaves({ save: [{ text: 'Chci víc posilovat biceps', group: 'training', station: '', muscles: ['biceps', 'biceps', 'BAD id'], until: '' }, { text: 'Do Vánoc víc zad', group: 'training', station: '', muscles: ['upper_back'], until: '2026-12-24' }] });
  assert.deepEqual(saves.map(s => s.muscles), [['biceps'], ['upper_back']]);
  const state = await updateAthleteState(scopedDb(createD1(), 1), { saves }, { date });
  assert.deepEqual(focusGroups(state, date), ['biceps', 'upper_back']);
  assert.deepEqual(focusGroups(state, '2026-11-25'), ['upper_back']);
  assert.equal(memoryCheck(state, '2026-11-25').memory, 'Chci víc posilovat biceps');
  assert.deepEqual(focusGroups({ ...state, memoryOff: true }, date), []);
  assert.deepEqual(COACH_ACTION_FORMAT.schema.properties.memory.properties.save.items.properties.muscles.items.enum, GYM_MUSCLES);
});

test('a full-body session gets the wished group, one a session, a split day or a chosen group stay as they are', () => {
  const context = (focus, extra = {}) => ({ date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: [], plannedSessions: [] }, athleteState: { status: 'active', memories: [], focusGroups: focus }, ...extra });
  const work = (plan, group) => plan.rows.filter(r => r[0] === 'WORK' && FOCUS_GROUPS[group].exercises.includes(r[1]));
  assert.equal(work(generateStrengthPlan(context([]), { durationMinutes: 45 }), 'biceps').length, 0);
  const plan = generateStrengthPlan(context(['biceps']), { durationMinutes: 45 });
  assert.ok(work(plan, 'biceps').length > 0);
  assert.match(plan.rationale, /Víc partie biceps, jak sis přál\./);
  const two = generateStrengthPlan(context(['biceps', 'rear_delts']), { durationMinutes: 45 });
  assert.equal([work(two, 'biceps').length > 0, work(two, 'rear_delts').length > 0].filter(Boolean).length, 1);
  // A chosen group decides alone.
  assert.equal(work(generateStrengthPlan(context(['biceps']), { focusMuscles: ['quads'], durationMinutes: 45 }), 'biceps').length, 0);
});
