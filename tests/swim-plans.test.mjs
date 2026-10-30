import test from "node:test";
import assert from "node:assert/strict";
import { applyPlan, getTemplate, planDays, planPreview, templateSummary } from "../src/training-plans.js";
import { getWorkout } from "../src/workout-library.js";

test("swim plans: learn to swim 400 m and 1,500 m without stopping", async () => {
  for (const id of ["swim-400", "swim-1500"]) {
    const t = getTemplate(id);
    assert.equal(t.sport, "swim");
    assert.ok(templateSummary(t).weeks.every(w => w.keys.length), id + " names each week");
  }
  assert.equal(getTemplate("swim-400").weeks.length, 8);
  assert.equal(getTemplate("swim-1500").weeks.length, 10);
  const days = planDays(getTemplate("swim-400"), { days: [[], [], [], [], [], [], []], availability: Array.from({ length: 7 }, () => ({ minutes: 45 })) });
  assert.equal(days.days.filter(d => d.includes("swim")).length, 3);
  assert.ok(planPreview(getTemplate("swim-1500"), { days: [0, 2, 5], startDate: "2026-11-02" }).weeks.every(w => w.minutes > 0));
});

test("a swim plan's week: the plan's workouts in metres on the swim days, the long one the continuous swim", async () => {
  const plan = { templateId: "swim-400", startDate: "2026-11-02" };
  const items = [["2026-11-03", "endurance"], ["2026-11-05", "endurance"], ["2026-11-07", "long"]].map(([date, role]) => ({ date, sport: "swim", slot: 0, role, minutes: 30, tss: 20, intensity: .7 }));
  const week7 = applyPlan({ items: items.map(x => ({ ...x, date: x.date.replace("11-0", "12-1") })) }, plan, "2026-12-14");
  const long = week7.items.find(x => x.role === "long");
  assert.equal(long.plan.workoutId, "swim-continuous-300");
  const first = applyPlan({ items }, plan, "2026-11-02");
  assert.ok(first.items.every(x => /^swim-first-/.test(x.plan.workoutId)));
  assert.ok(first.items.every(x => !x.plan.workoutId.includes("~")), "a swim keeps its metres");
  const db = { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }), run: async () => ({}) }) };
  assert.equal((await getWorkout(db, long.plan.workoutId)).distance_meters, 500);
});
