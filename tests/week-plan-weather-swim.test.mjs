import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeWeekPlan } from '../src/week-planner.js';
import { capWeekTargets, weekProposal, environmentFor, estimatedTargets, usualMinutes } from '../src/adaptive-week.js';

const sunny = { max: 14, min: 4, wind: 10, rain: 0, rainProb: 10, code: 1 };
const rainy = { max: 12, min: 6, wind: 15, rain: 6, rainProb: 90, code: 61 };

test('winter rides follow the forecast; only a day without one stays indoor (22.6)', () => {
  assert.equal(environmentFor('2026-11-14', 'ride', sunny).environment, 'outdoor');
  assert.equal(environmentFor('2026-11-14', 'ride', { ...sunny, max: 6 }).environment, 'indoor');
  assert.equal(environmentFor('2026-11-14', 'ride', rainy).environment, 'indoor');
  const none = environmentFor('2026-12-14', 'ride');
  assert.equal(none.environment, 'indoor');
  assert.match(none.reason, /Předpověď na tento den ještě není/);
  const p = sanitizeWeekPlan({ availability: Array(7).fill({ minutes: 240 }) });
  const long = { date: '2026-11-14', sport: 'ride', minutes: 170, tss: 110 };
  assert.equal(capWeekTargets({ items: [long] }, p, [], { '2026-11-14': sunny }).items[0].minutes, 170);
  const wet = capWeekTargets({ items: [long] }, p, [], { '2026-11-14': rainy }).items[0];
  assert.equal(wet.minutes, 90);
  assert.equal(wet.outdoorMinutes, 170);
  assert.match(wet.reason, /Kolo uvnitř: 90 min místo 170 min venku\./);
  // A ride the indoor rule leaves as long as it was says nothing.
  const short = capWeekTargets({ items: [{ date: '2026-11-14', sport: 'ride', minutes: 30, tss: 20 }] }, p, [], { '2026-11-14': rainy }).items[0];
  assert.equal(short.outdoorMinutes, undefined);
});

test('the week says when the indoor cap shortens a session (22.6)', () => {
  const prefs = sanitizeWeekPlan({ availability: Array(7).fill({ minutes: 120 }), days: [[], ['ride'], [], [], [], ['ride'], []] });
  const proposal = weekProposal({ prefs, start: '2026-11-09', today: '2026-11-06', weather: { '2026-11-10': rainy, '2026-11-14': sunny } });
  const tue = proposal.items.find(x => x.date === '2026-11-10'), sat = proposal.items.find(x => x.date === '2026-11-14');
  assert.equal(tue.environment, 'indoor');
  assert.equal(sat.environment, 'outdoor');
  assert.deepEqual(proposal.warnings.filter(w => /uvnitř/.test(w.text)), [{ date: '2026-11-10', text: 'Kolo uvnitř: ' + tue.minutes + ' min místo ' + tue.outdoorMinutes + ' min venku.' }]);
});

test('a sport turned off in Settings stays out of the usual week, unless the plan trains it (22.7)', () => {
  const prefs = sanitizeWeekPlan({ availability: Array(7).fill({ minutes: 90 }), days: [[], ['run'], ['ride'], ['swim'], [], ['ride', 'gym'], []] });
  const focus = { sports: ['ride', 'gym'] };
  const sports = weekProposal({ prefs, start: '2026-04-13', today: '2026-04-10', focus }).items.map(x => x.sport);
  assert.ok(sports.length);
  assert.ok(sports.every(s => s === 'ride' || s === 'gym'), sports.join());
  const plan = { plan: { sport: 'run' } };
  const withPlan = weekProposal({ prefs, start: '2026-04-13', today: '2026-04-10', focus, plan }).items.map(x => x.sport);
  assert.ok(withPlan.includes('run'));
  assert.ok(!withPlan.includes('swim'));
});

test('without fitness data a session is as long as the usual one; a new swimmer starts at 30 min (22.8)', () => {
  const roles = [{ items: [{ sport: 'swim', role: 'quality' }] }, { items: [] }, { items: [{ sport: 'swim', role: 'easy' }, { sport: 'ride', role: 'easy' }] }, { items: [] }, { items: [] }, { items: [] }, { items: [] }];
  assert.deepEqual(estimatedTargets(roles, '2026-11-09', '2026-11-06').items.map(x => [x.sport, x.minutes]), [['swim', 30], ['swim', 30], ['ride', 60]]);
  const history = [['2026-10-20', 25], ['2026-10-27', 35], ['2026-11-03', 40], ['2026-10-01', 90]].map(([date, m]) => ({ date, daily: { training: { completed: [{ type: 'Swim', durationHours: m / 60 }] } } }));
  assert.deepEqual(usualMinutes(history, '2026-11-06'), { swim: 35 });
  assert.deepEqual(estimatedTargets(roles, '2026-11-09', '2026-11-06', [], history).items.map(x => x.minutes), [35, 35, 60]);
});
