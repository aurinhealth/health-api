import test from 'node:test';
import assert from 'node:assert/strict';
import { pickHours } from '../src/adaptive-week.js';

test('the weather card takes five hours of the day', () => {
  const time = Array.from({ length: 24 }, (_, h) => '2026-10-11T' + String(h).padStart(2, '0') + ':00');
  const hours = pickHours({ time, temperature_2m: time.map((_, h) => h + 0.4), weather_code: time.map(() => 2) }, '2026-10-11');
  assert.deepEqual(hours.map(h => h.hour), [8, 11, 14, 17, 20]);
  assert.deepEqual(hours[0], { hour: 8, temp: 8, code: 2 });
  assert.deepEqual(pickHours(null, '2026-10-11'), []);
});
