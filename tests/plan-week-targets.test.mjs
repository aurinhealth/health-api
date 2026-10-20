import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { committedRunMinutes } from '../src/week-planner.js';

const source = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
const slice = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to));

// The plan's week (GET /app/api/plans/week) and the plan proposal call
// computeWeekTargets without prefs: it read prefs.location, threw, and the
// caller's catch turned it into no sessions, so a plan week showed nothing.
test('week targets without prefs use the saved week plan', async () => {
  const saved = { days: [['ride'], [], ['ride'], [], [], ['ride'], []], location: null, availability: [] };
  const seen = {};
  const empty = { all: async () => ({ results: [] }) };
  const context = vm.createContext({
    Request, Response, URL,
    shiftDate: (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); },
    localToday: () => '2026-10-14', localDate: t => String(t).slice(0, 10),
    handleDashboardApi: async () => Response.json({ wellness: [] }), cached: (_env, _ctx, _key, compute) => compute(),
    getWeekPlan: async (_db, start) => { seen.start = start; return saved; },
    sportOfType: () => null, activityFromRow: () => null,
    weekWeather: async location => { seen.location = location; return {}; },
    weeklyRunCap: () => null, planningHistory: async () => [],
    planForWeek: async () => ({ plan: { id: 1 }, roles: {}, load: null, apply: t => ({ ...t, items: [{ date: '2026-10-19', sport: 'ride', slot: 0, plan: { workoutId: 'z2-60' } }] }) }),
    planWeekRoles: days => { seen.days = days; return {}; },
    weekTargets: () => ({ status: 'ok', items: [] }), estimatedTargets: () => ({ status: 'ok', items: [] }),
    weekLoadsBefore: () => [], hrvWeekTrendDown: () => false,
    hrvSourceRows: rows => rows, googleHealthFor: async () => null,
    capRunVolume: t => t, committedRunMinutes, capWeekTargets: (t, prefs) => { seen.prefs = prefs; return t; }
  });
  vm.runInContext(slice(source, 'async function computeWeekTargets(', '\n// What the active plan asks'), context);
  const env = { DB: { prepare: () => ({ bind: () => empty }) }, USER_ID: 1 };
  const targets = await context.computeWeekTargets(env, {}, '2026-10-19');
  assert.equal(seen.start, '2026-10-19');
  assert.equal(seen.prefs, saved);
  assert.deepEqual(seen.days, saved.days);
  assert.equal(targets.items[0].plan.workoutId, 'z2-60');
});

// A run planned for today and not done yet still counts against the weekly
// running cap; once a run is done today, it is that run, not one more.
test('week targets count today\'s planned run once against the running cap', async () => {
  const runCommitted = async rows => {
    let committed = null;
    const context = vm.createContext({
      Request, Response, URL,
      shiftDate: (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); },
      localToday: () => '2026-10-21', localDate: t => String(t).slice(0, 10),
      handleDashboardApi: async () => Response.json({ wellness: [] }), cached: (_env, _ctx, _key, compute) => compute(),
      getWeekPlan: async () => ({ days: [[], [], [], [], [], [], []], location: null, availability: [] }),
      sportOfType: type => /run/i.test(type) ? 'run' : null, activityFromRow: r => ({ minutes: JSON.parse(r.payload_json).minutes }),
      weekWeather: async () => ({}), weeklyRunCap: () => ({ cap: 120 }), planningHistory: async () => [],
      planForWeek: async () => ({ plan: null, roles: {}, load: null, apply: t => t }),
      planWeekRoles: () => ({}), weekTargets: () => ({ status: 'ok', items: [] }), estimatedTargets: () => ({ status: 'ok', items: [] }),
      weekLoadsBefore: () => [], hrvWeekTrendDown: () => false, hrvSourceRows: x => x, googleHealthFor: async () => null,
      athleteFocus: () => ({}), dashboardProfile: async () => null,
      capRunVolume: (t, _cap, c) => { committed = c; return t; }, committedRunMinutes, capWeekTargets: t => t
    });
    vm.runInContext(slice(source, 'async function computeWeekTargets(', '\n// What the active plan asks'), context);
    const results = rows.map(([data_type, start_time, payload]) => ({ data_type, source_family: 'intervals', start_time, payload_json: JSON.stringify({ type: 'Run', ...payload }) }));
    const env = { DB: { prepare: sql => ({ bind: () => ({ all: async () => ({ results: /health_datapoints/.test(sql) ? results : [] }) }) }) }, USER_ID: 1 };
    await context.computeWeekTargets(env, {}, '2026-10-19');
    return committed;
  };
  // Monday's run done (30), today's 45 planned, Friday's 40 planned.
  const week = [['activity', '2026-10-19T07:00:00', { minutes: 30 }], ['planned-workout', '2026-10-21T07:00:00', { moving_time: 2700 }], ['planned-workout', '2026-10-23T07:00:00', { moving_time: 2400 }]];
  assert.equal(await runCommitted(week), 115);
  // Today's run done (the planned one stays in the calendar): counted once.
  assert.equal(await runCommitted([...week, ['activity', '2026-10-21T08:00:00', { minutes: 50 }]]), 120);
});
