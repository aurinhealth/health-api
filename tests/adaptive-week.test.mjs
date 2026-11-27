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

test('a week without recent sessions keeps to the sports the athlete does, never an unknown ride', async () => {
  const { fallbackSports } = await import('../src/adaptive-week.js');
  assert.deepEqual(fallbackSports({ sport: 'general', regular: ['run', 'strength'] }), ['run', 'gym']);
  assert.deepEqual(fallbackSports({ sport: 'cycling', regular: ['strength'] }), ['ride', 'gym']);
  assert.deepEqual(fallbackSports({ sport: 'general' }), ['gym', 'run']);
  assert.deepEqual(fallbackSports({ sport: 'strength' }), ['gym', 'run']);
  assert.deepEqual(fallbackSports({ sport: 'running' }), ['run', 'gym']);
  assert.deepEqual(fallbackSports(null), ['gym', 'run']);
});

test('replan: the proposal sees the planned workouts from today on as gone, the done ones and earlier days stay', async () => {
  const { withoutPlannedFrom, sessionsOn } = await import('../src/adaptive-week.js');
  const ride = { type: 'Ride', durationHours: 1 }, run = { type: 'Run', durationHours: .5 };
  const week = { days: [
    { date: '2026-11-23', daily: { training: { completed: [run], planned: [ride] } } },
    { date: '2026-11-24', daily: { training: { completed: [run], planned: [ride] } } },
    { date: '2026-11-25', daily: { training: { planned: [ride, run] } } },
    { date: '2026-11-26' }
  ] };
  const out = withoutPlannedFrom(week, '2026-11-24');
  assert.deepEqual(out.days.map(d => sessionsOn(d).length), [2, 1, 0, 0]);
  assert.deepEqual(week.days.map(d => sessionsOn(d).length), [2, 2, 2, 0], 'the week passed in is unchanged');
});

test('replan of the changed days: only they lose their planned workouts, the rest stays', async () => {
  const { withoutPlannedOn, sessionsOn } = await import('../src/adaptive-week.js');
  const gym = { type: 'WeightTraining', name: 'Gym', minutes: 45 };
  const week = { days: ['2026-11-24', '2026-11-25', '2026-11-28'].map(date => ({ date, daily: { training: { planned: [gym] } } })) };
  assert.deepEqual(withoutPlannedOn(week, ['2026-11-28']).days.map(d => sessionsOn(d).length), [1, 1, 0]);
});

test('replan affects: hard days in a row, heavy legs before a key day, the only key workout gone, the week volume', async () => {
  const { replanAffects } = await import('../src/adaptive-week.js');
  const today = '2026-11-24';
  const day = (date, planned = [], completed = []) => ({ date, daily: { training: { planned, completed } } });
  const intervals = { type: 'Ride', name: 'Threshold intervals', durationHours: 1.25 };
  const easy = { type: 'Ride', name: 'Endurance ride', durationHours: 1 };
  const legs = { type: 'WeightTraining', name: 'Gym, lower body', minutes: 50 };
  const upper = { type: 'WeightTraining', name: 'Gym, upper body', minutes: 50 };
  const long = { sport: 'ride', role: 'long', minutes: 180, date: '2026-11-28' };
  const week = p27 => ({ days: [day('2026-11-24', [upper]), day('2026-11-25', [easy]), day('2026-11-27', [p27]), day('2026-11-28', [legs])] });
  assert.deepEqual(replanAffects({ week: week(intervals), items: [long], dates: ['2026-11-28'], today }), { kind: 'hard_in_a_row', dates: ['2026-11-27', '2026-11-28'] });
  assert.equal(replanAffects({ week: week(legs), items: [long], dates: ['2026-11-28'], today })?.kind, 'hard_in_a_row', 'heavy legs the day before a long ride');
  assert.equal(replanAffects({ week: week(upper), items: [{ ...long, minutes: 60 }], dates: ['2026-11-28'], today }), null, 'upper body before: nothing');
  assert.equal(replanAffects({ week: week(easy), items: [{ sport: 'ride', role: 'endurance', minutes: 60, date: '2026-11-28' }], dates: ['2026-11-28'], today }), null);
  const onlyKey = { days: [day('2026-11-24', [upper]), day('2026-11-26', [easy]), day('2026-11-28', [intervals])] };
  assert.equal(replanAffects({ week: onlyKey, items: [{ sport: 'ride', role: 'endurance', minutes: 75, date: '2026-11-28' }], dates: ['2026-11-28'], today })?.kind, 'key_lost');
  const beginner = { days: [day('2026-11-24', [upper]), day('2026-11-26', [easy]), day('2026-11-28', [easy])] };
  assert.equal(replanAffects({ week: beginner, items: [{ sport: 'run', role: 'endurance', minutes: 45, date: '2026-11-28' }], dates: ['2026-11-28'], today }), null, 'no key workout before: no key rule; 15 min less is no volume jump');
  const big = { days: [day('2026-11-25', [{ ...easy, durationHours: 1 }]), day('2026-11-28', [{ ...easy, durationHours: 1.4 }])] };
  assert.equal(replanAffects({ week: big, items: [], dates: ['2026-11-28'], today })?.kind, 'volume_down');
  assert.equal(replanAffects({ week: { days: [day('2026-11-28')] }, items: [{ ...long, role: 'endurance' }], dates: ['2026-11-28'], today }), null, 'a first plan in an empty week is no volume jump');
  assert.equal(replanAffects({ week: { days: [day('2026-11-23', [], [intervals]), day('2026-11-24')] }, items: [{ ...long, date: today }], dates: [today], today }), null, 'a hard day before today: nothing to recalculate');
});
