import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStrengthPlan, EXERCISES } from '../src/strength-generator.js';

// "Another suggestion" in the gym builder: the app sends the exercises it has
// shown, and the next proposal prefers others for the same movements.
const base = () => ({ date: '2026-11-05', cycling: { recentRideTss: 100, recentRideHours: 2, recentActivities: [], plannedWorkouts: [] }, recovery: {}, strength: { recentCompletedSets: [] } });
const work = plan => [...new Set(plan.rows.filter(r => r[0] === 'WORK').map(r => r[1]))];

for (const [label, options] of [['upper body', { focus: 'upper' }], ['full body', {}], ['lower body', { focus: 'lower' }], ['chosen muscles', { focusMuscles: ['chest', 'lats'] }]]) {
  test('another suggestion changes the ' + label + ' workout', () => {
    const first = work(generateStrengthPlan(base(), { durationMinutes: 75, ...options }));
    const again = work(generateStrengthPlan(base(), { durationMinutes: 75, ...options }));
    assert.deepEqual(again, first);
    const next = work(generateStrengthPlan(base(), { durationMinutes: 75, ...options, avoidExercises: first }));
    const kept = next.filter(ex => first.includes(ex));
    assert.ok(kept.length <= Math.floor(first.length / 3), label + ': kept ' + kept.join(', '));
    // The same kind of session: upper body stays upper body.
    if (options.focus === 'upper') assert.ok(next.every(ex => !['quads', 'hamstrings', 'glutes', 'calves'].includes(EXERCISES[ex].muscle)));
    // A third tap avoids both earlier ones where it can.
    const third = work(generateStrengthPlan(base(), { durationMinutes: 75, ...options, avoidExercises: [...first, ...next] }));
    assert.notDeepEqual(third, first);
    assert.ok(third.length >= first.length - 1);
  });
}

test('avoiding everything still builds a full workout (a preference, not a filter)', () => {
  const all = Object.keys(EXERCISES);
  const plan = generateStrengthPlan(base(), { durationMinutes: 60, focus: 'upper', avoidExercises: all });
  assert.ok(work(plan).length >= 4);
});
