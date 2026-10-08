import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

function setup() {
  const calls = [], timers = [], refreshed = [];
  const week = { days: [{ date: '2026-10-08', daily: { training: { planned: [{ id: 'planned:7', name: 'Threshold', type: 'Ride', start: '2026-10-08T17:00:00' }] } } }, { date: '2026-10-09', daily: { training: { planned: [] } } }, { date: '2026-10-10', daily: { training: { planned: [] } } }] };
  const ctx = vm.createContext({ Date, Math, Number, String, JSON, Map, state: { week }, plannedQueue: new Map(), pendingAdds: new Map(), planDataRevision: 0,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    window: { addEventListener() {}, confirm: () => true }, document: { addEventListener() {}, visibilityState: 'visible' },
    jsonFetch: async (path, o) => { calls.push([path, JSON.parse(o.body)]); return { status: 'ok' }; },
    refreshAfterPlanChange: async () => refreshed.push(1), renderWeekHub() {}, toast() {}, longDate: d => d, localToday: () => '2026-10-05', num: v => Number(v) || 0 });
  vm.runInContext(slice('function takePlanned(', 'async function refreshAfterPlanChange('), ctx);
  vm.runInContext(slice('const PLAN_SETTLE_MS=', 'function installPlannedEditing('), ctx);
  return { ctx, calls, timers, refreshed, week };
}
const at = (week, date) => week.days.find(d => d.date === date).daily.training.planned.map(x => x.id);

test('the week moves at once; several moves reach Intervals.icu as one change after a quiet pause', async () => {
  const { ctx, calls, timers, refreshed, week } = setup();
  ctx.movePlanned('planned:7', '2026-10-09', 'Threshold');
  assert.deepEqual(at(week, '2026-10-09'), ['planned:7']);
  ctx.movePlanned('planned:7', '2026-10-10', 'Threshold');
  assert.deepEqual(at(week, '2026-10-09'), []);
  assert.deepEqual(at(week, '2026-10-10'), ['planned:7']);
  assert.equal(calls.length, 0);
  // Fetched data from before the change keeps showing the change.
  week.days[0].daily.training.planned.push({ id: 'planned:7', name: 'Threshold', start: '2026-10-08T17:00:00' });
  ctx.applyPendingPlanned(week.days);
  assert.deepEqual(at(week, '2026-10-08'), []);
  assert.ok(timers.every(t => t.ms <= 15000));
  await vm.runInContext('flushPlannedQueue()', ctx);
  assert.deepEqual(calls, [['/app/api/planned/move', { eventId: 'planned:7', date: '2026-10-10' }]]);
  assert.equal(refreshed.length, 1);
});

test('moved back to its day sends nothing; a delete wins over a move', async () => {
  const { ctx, calls } = setup();
  ctx.movePlanned('planned:7', '2026-10-09', 'Threshold');
  ctx.movePlanned('planned:7', '2026-10-08', 'Threshold');
  await vm.runInContext('flushPlannedQueue()', ctx);
  assert.equal(calls.length, 0);
  ctx.movePlanned('planned:7', '2026-10-09', 'Threshold');
  ctx.deletePlanned('planned:7', 'Threshold');
  await vm.runInContext('flushPlannedQueue()', ctx);
  assert.deepEqual(calls, [['/app/api/planned/delete', { eventId: 'planned:7' }]]);
});
