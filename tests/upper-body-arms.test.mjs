import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStrengthPlan, EXERCISES } from '../src/strength-generator.js';

// Petr 2026-11-14: 75 minutes of Upper Body often had no curl, as core and
// shoulders took the three free places. From 60 minutes both arms are in.
const context = (date, sets = []) => ({ date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: sets, plannedSessions: [] }, athleteState: { status: 'active', memories: [], focusGroups: [] } });
const muscles = plan => new Set(plan.rows.filter(r => r[0] === 'WORK').map(r => EXERCISES[r[1]]?.muscle));

test('Upper Body from 60 minutes has a biceps and a triceps exercise, also after curls of the athlete', () => {
  const curls = [0, 1, 2].map(() => ({ workout_date: '2026-10-12', exercise: 'DB curl', type: 'WORK', weight_kg: 10, reps: 10, rpe: 8 }));
  let checked = 0;
  for (const sets of [[], curls]) for (const durationMinutes of [60, 75, 90]) {
    for (const plan of [generateStrengthPlan(context('2026-10-14', sets), { focus: 'upper', durationMinutes }), generateStrengthPlan(context('2026-10-14', sets), { durationMinutes, weeklyGymDays: 4 })]) {
      if (plan.planName !== 'Upper Body') continue;
      checked++;
      assert.ok(muscles(plan).has('biceps'), durationMinutes + ' min: ' + plan.rows.map(r => r[1]));
      assert.ok(muscles(plan).has('triceps'), durationMinutes + ' min: ' + plan.rows.map(r => r[1]));
    }
  }
  assert.ok(checked >= 6, String(checked));
});

