import test from 'node:test';
import assert from 'node:assert/strict';
import { withLang, L, bilingual } from '../src/lang.js';
import { generateStrengthPlan } from '../src/strength-generator.js';
import { strengthPlanToIntervalsEvent } from '../src/intervals-strength.js';
import { explainWorkout } from '../src/workout-explanation.js';
import { CYCLING_WORKOUTS } from '../src/workout-library.js';
import { renderForEnvironment } from '../src/workout-model.js';
import { EN, EN_TEMPLATES } from '../src/i18n-en.js';

// Letters only Czech uses. Machine markers ([Pauza 90 s], [Do selhání]) stay
// Czech on purpose because the app reads them back.
const CZECH = /[ěščřžýůňťďĚŠČŘŽÝŮŇŤĎ]/;
const strip = text => String(text).replace(/\[(?:Pauza \d+ s|Do selhání|Supersérie [A-F]\d*)\]/g, '');
const context = { date: '2026-10-04', strength: { recentCompletedSets: [] }, cycling: { recentActivities: [], plannedWorkouts: [] }, recovery: {} };

test('a strength plan and its Intervals.icu workout are fully English in the English app', () => withLang('en', () => {
  const plan = generateStrengthPlan(context, { durationMinutes: 45 });
  const texts = [plan.planName, ...plan.rows.flatMap(r => [r[1], r[9]])].filter(Boolean).map(strip);
  for (const text of texts) assert.doesNotMatch(text, CZECH, text);
  const event = strengthPlanToIntervalsEvent(plan, { date: '2026-10-04' });
  assert.doesNotMatch(strip(event.name + ' ' + event.description), CZECH);
}));

test('the same plan stays Czech in the Czech app', () => withLang('cs', () => {
  const plan = generateStrengthPlan(context, { durationMinutes: 45 });
  assert.match(plan.rows.map(r => r[9]).join(' '), CZECH);
}));

test('a cycling workout explanation follows the app language', () => {
  const workout = renderForEnvironment(CYCLING_WORKOUTS.find(w => w.id === 'pfd-vo2-5x4x112-75'), 'indoor');
  const en = withLang('en', () => explainWorkout(workout, { thresholds: { ftp: 260 } }));
  const cs = withLang('cs', () => explainWorkout(workout, { thresholds: { ftp: 260 } }));
  assert.doesNotMatch(JSON.stringify(en.how), CZECH);
  assert.match(JSON.stringify(cs.how), CZECH);
});

test('label tables read in the current language', () => {
  const table = bilingual({ a: 'Pauza' }, { a: 'Break' });
  assert.equal(withLang('en', () => table.a), 'Break');
  assert.equal(withLang('cs', () => table.a), 'Pauza');
  assert.equal(withLang('en', () => L('váha', 'weight')), 'weight');
});

test('no English dictionary entry is left in Czech', () => {
  for (const [cs, en] of [...Object.entries(EN), ...Object.entries(EN_TEMPLATES)]) assert.doesNotMatch(en, CZECH, cs);
});
