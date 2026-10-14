import test from 'node:test';
import assert from 'node:assert/strict';
import { illnessSigns, illnessWarning } from '../src/illness-check.js';

const date = '2026-10-14';
const sick = { components: {
  wristTemp: { deviation: 0.8, raised: true, elevated: false },
  respiration: { value: 17.4, baseline: 15.4, elevated: true },
  hrv: { value: 38, baseline: 50, z: -1.6 },
  restingHR: { value: 58, baseline: 51, z: 2.1 },
} };
const week = { days: [
  { date: '2026-10-13', daily: { training: { planned: [{ id: 'planned:1', name: 'Včerejší' }] } } },
  { date: '2026-10-16', daily: { training: { planned: [{ id: 'planned:42', name: 'Práh 3×12' }, { id: 'planned:43', name: 'Nutrition' }] } } },
] };

test('a raised temperature with another sign shows the card with each sign', () => {
  const card = illnessWarning({ date, readiness: sick, week });
  assert.equal(card.kind, 'illness');
  assert.deepEqual(card.rows.map(r => r.id), ['temperature', 'respiration', 'hrv', 'restingHR']);
  assert.deepEqual(card.rows.map(r => r.value), ['+0,8 °C', '+2,0 /min', '−24 %', '+7']);
  assert.deepEqual(card.sessions, [{ eventId: 'planned:42', date: '2026-10-16', name: 'Práh 3×12' }]);
});

test('no card without a temperature or breathing sign, for one sign, when not training or dismissed', () => {
  assert.deepEqual(illnessSigns({ components: { hrv: sick.components.hrv, restingHR: sick.components.restingHR } }), []);
  assert.deepEqual(illnessSigns({ components: { wristTemp: sick.components.wristTemp } }), []);
  assert.equal(illnessWarning({ date, readiness: sick, state: { status: 'sick' } }), null);
  assert.equal(illnessWarning({ date, readiness: sick, state: { status: 'active', dismissed: [date + ':illness'] } }), null);
  assert.equal(illnessWarning({ date, readiness: null }), null);
});
