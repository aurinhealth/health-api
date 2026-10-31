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

test("own brick: the day's first run goes right after the ride, short and easy", async () => {
  const { ownBrick, BRICK_MINUTES } = await import('../src/adaptive-week.js');
  const run = { date: '2026-11-07', sport: 'run', slot: 0, role: 'quality', minutes: 45, tss: 50 };
  const brick = ownBrick(run, [5], '2026-11-02');
  assert.equal(brick.brick, true);
  assert.equal(brick.role, 'recovery');
  assert.equal(brick.minutes, BRICK_MINUTES);
  assert.equal(ownBrick(run, [5], '2026-11-02', { brick: { minutes: 25 } }).minutes, 25, "a triathlete's split sets its length");
  assert.equal(ownBrick(run, [4], '2026-11-02'), run, 'another day: unchanged');
  assert.equal(ownBrick({ ...run, sport: 'ride' }, [5], '2026-11-02').brick, undefined);
  assert.equal(ownBrick({ ...run, slot: 1 }, [5], '2026-11-02').brick, undefined, 'only the first run of the day');
});
