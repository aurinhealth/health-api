import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MINUTES } from '../src/workout-model.js';
import { CYCLING_WORKOUTS, RUNNING_WORKOUTS, resizeWorkout } from '../src/workout-library.js';
import { SESSION_MINUTES, sanitizeSessions } from '../src/week-planner.js';
import { sanitizeWeekDays } from '../src/week-ai.js';

// Petr 2026-11-02: an 8 h ride and a 6 h ultra run; a 24 h challenge is a calendar event.
test('longest sessions: an 8 h ride and a 6 h run everywhere', () => {
  assert.deepEqual(MAX_MINUTES, { ride: 480, run: 360 });
  assert.equal(Math.max(...SESSION_MINUTES.ride), 480);
  assert.equal(Math.max(...SESSION_MINUTES.run), 360);
  // The library has a ride and a run of that length to pick from.
  assert.ok(CYCLING_WORKOUTS.some(w => w.duration_minutes === 480 && w.primary_system === 'endurance'));
  assert.ok(RUNNING_WORKOUTS.some(w => w.duration_minutes === 360 && w.primary_system === 'endurance'));
  // "Change length" stretches up to the longest and no further.
  const ride = CYCLING_WORKOUTS.find(w => w.id === 'pfd-z2-240'), run = RUNNING_WORKOUTS.find(w => w.id === 'run-long-180');
  assert.equal(resizeWorkout(ride, 480).duration_minutes, 480);
  assert.ok(resizeWorkout(ride, 600).duration_minutes <= 480);
  assert.equal(resizeWorkout(run, 360).duration_minutes, 360);
  assert.ok(resizeWorkout(run, 480).duration_minutes <= 360);
});

test('longest sessions: the week plan keeps an 8 h ride, a run only up to 6 h', () => {
  const days = [[], [], [], [], [], ['ride'], ['run']];
  const out = sanitizeSessions({ '5|ride|0': { minutes: 480 }, '6|run|0': { minutes: 420 } }, days);
  assert.equal(out['5|ride|0'].minutes, 480);
  assert.equal(out['6|run|0'], undefined);
});

test('longest sessions: the AI week goes long only on a day the athlete asked for', () => {
  const start = '2026-11-02', week = (requested) => sanitizeWeekDays([{ date: '2026-11-07', sport: 'ride', kind: 'endurance', minutes: 480, requested }], { start, today: start });
  assert.equal(week(true)[0].minutes, 480);
  assert.equal(week(false)[0].minutes, 300);
});
