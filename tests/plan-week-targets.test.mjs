import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

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
    capRunVolume: t => t, capWeekTargets: (t, prefs) => { seen.prefs = prefs; return t; }
  });
  vm.runInContext(slice(source, 'async function computeWeekTargets(', '\n// What the active plan asks'), context);
  const env = { DB: { prepare: () => ({ bind: () => empty }) }, USER_ID: 1 };
  const targets = await context.computeWeekTargets(env, {}, '2026-10-19');
  assert.equal(seen.start, '2026-10-19');
  assert.equal(seen.prefs, saved);
  assert.deepEqual(seen.days, saved.days);
  assert.equal(targets.items[0].plan.workoutId, 'z2-60');
});
