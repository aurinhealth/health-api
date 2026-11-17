import test from 'node:test';
import assert from 'node:assert/strict';
import { unwantedExercises, generateStrengthPlan } from '../src/strength-generator.js';
import { validateCoachActions } from '../src/coach-actions.js';

test('the exercise the athlete turned down, in Czech and English', () => {
  assert.deepEqual(unwantedExercises(['Nechci floor press']), ['Barbell Floor Press']);
  assert.deepEqual(unwantedExercises(['Jak nemas. Chci tvuj trenink jenom mi nahrad ten floor press']), ['Barbell Floor Press']);
  assert.deepEqual(unwantedExercises(['Chci tvůj trénink, jenom mi nahraď ten floor press']), ['Barbell Floor Press']);
  assert.deepEqual(unwantedExercises(['Místo floor pressu dej bench press']), ['Barbell Floor Press']);
  assert.deepEqual(unwantedExercises(["I don't want the floor press today"]), ['Barbell Floor Press']);
  assert.deepEqual(unwantedExercises(['Nechce v tréninku floor press; místo něj bench press.']), ['Barbell Floor Press']);
  assert.ok(unwantedExercises(['bez bench pressu']).includes('Barbell bench press'));
});

test('the replacement and plain wishes are no refusal', () => {
  assert.deepEqual(unwantedExercises(['Nahraď to bench pressem']), []);
  assert.deepEqual(unwantedExercises(['Replace it with floor press']), []);
  assert.deepEqual(unwantedExercises(['Chci floor press', 'Dej mi bench press', 'Jak nemas']), []);
  assert.deepEqual(unwantedExercises(['Nechci dnes posilovat nohy, floor press je super']), []);
  assert.deepEqual(unwantedExercises(['No floor press je fajn']), []);
  // A "no" before the refusal word, a list cut by a comma, the replacement after "místo" (review 2026-11-12).
  for (const text of ['Nechce vynechávat bench press', 'Nechci vynechat bench press', "Don't remove the bench press", 'Nechce vyměnit bench press za nic jiného', 'Nechce, aby se vynechal bench press', 'Drop the bench press to 60 kg', 'Skip the bench press warmup', 'Nesnáším bench press, ale udělám ho', 'Místo toho bench press'])
    assert.deepEqual(unwantedExercises([text]), [], text);
  for (const text of ['Nechci floor press, bench press je ok', 'Místo floor pressu bench press', 'bez floor pressu, bench press nech'])
    assert.deepEqual(unwantedExercises([text]), ['Barbell Floor Press'], text);
  assert.ok(unwantedExercises(['Nechci floor press ani bench press']).includes('Barbell bench press'));
});

test('the coach gym card carries the exercise turned down in the chat', () => {
  const today = '2026-11-12';
  const ctx = { userMessage: 'Jak nemas. Chci tvuj trenink jenom mi nahrad ten floor press', conversation: [{ role: 'user', content: 'Nechci floor press' }, { role: 'assistant', content: 'Floor press vynecháme.' }], week: [], athleteState: 'active' };
  const [card] = validateCoachActions([{ type: 'workout', eventId: '', date: today, sport: 'gym', minutes: 60, status: '', statusUntil: '', reason: 'Upper body', fromExercise: '', toExercise: '', workoutId: '', kind: '', place: '', activityId: '', otherActivityId: '', time: '', kcal: 0, gymFocus: 'upper', gymMuscles: ['chest', 'upper_back'], insisted: false, planId: '', days: [], raceKm: 0 }], ctx, today, { userInitiated: true });
  assert.ok(card, 'gym card kept');
  assert.deepEqual(card.gymAvoid, ['Barbell Floor Press']);
});

test('a remembered "does not want" leaves the exercise out of the plan', () => {
  const context = { date: '2026-11-12', athleteState: { memories: ['Nechce floor press, místo něj bench press.'] }, strength: { recentCompletedSets: [] } };
  for (let day = 1; day <= 28; day++) {
    const date = '2026-11-' + String(day).padStart(2, '0');
    const plan = generateStrengthPlan({ ...context, date }, { focusMuscles: ['chest', 'upper_back'], durationMinutes: 60 });
    assert.ok(!plan.rows.some(r => r[1] === 'Barbell Floor Press'), date);
  }
});
