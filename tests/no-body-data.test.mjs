import test from "node:test";
import assert from "node:assert/strict";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { rankOptions } from "../src/coach-pick.js";
import { withLang } from "../src/lang.js";

// Audit 2026-11-06, 14.1 (Petr's answer to O7): an athlete with only an
// iPhone (no HRV, resting HR, nights or Intervals.icu) got a yellow day
// every day, "readiness is moderate", and every planned interval session
// turned into endurance. Nothing measured the body, so the plan stands.
const DATE = "2026-10-08";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const run = (date, name, durationHours = 0.75) => ({ date, name, type: "Run", durationHours });
const week = { days: [
  ...[-9, -7, -5, -3, -2].map(o => ({ date: day(o), daily: { training: { planned: [], completed: [run(day(o), "Easy run")] } } })),
  { date: DATE, daily: { training: { planned: [run(DATE, "Threshold 3x10 min", 1)], completed: [] } } }
] };
const coach = () => withLang("cs", () => buildCyclingCoachV2({ date: DATE, today: DATE, sport: "run", week, gym: { history: [] } }));

test("only an iPhone: the planned threshold run stays, no yellow, no 'moderate readiness'", () => {
  const r = coach();
  assert.equal(r.readiness.noBodyData, true);
  assert.equal(r.readiness.score, null);
  assert.equal(r.readiness.status, "green");
  assert.equal(r.recommendation.session.kind, "threshold");
  assert.ok(!r.recommendation.adaptations.some(a => /střední připravenost/.test(a)));
  assert.ok(r.readiness.reasons.some(x => /řídím se plánem a zátěží/.test(x)));
});

test("only an iPhone: Aktivita dne explains the pick from the plan, not from readiness", () => {
  const r = coach();
  const best = withLang("cs", () => rankOptions({ ride: r, run: r, mainSport: "running", sports: ["run"], planned: ["run"] })).options.find(o => o.best);
  assert.equal(best.kind, "run");
  assert.equal(best.reason, "Sedí to s plánem na dnešek.");
});
