import test from "node:test";
import assert from "node:assert/strict";
import { planTemplates, getTemplate, planWorkoutId, planStart, planDays, planWeek, planQuality, planLoad, applyPlan, raceWorkout, raceId, templateSummary, levelShift } from "../src/training-plans.js";
import { planWeekRoles, weekTargets } from "../src/week-planner.js";
import { CYCLING_WORKOUTS, RUNNING_WORKOUTS, getWorkout } from "../src/workout-library.js";

const CATALOGUE = { ride: CYCLING_WORKOUTS, run: RUNNING_WORKOUTS };
const monday = "2026-10-12";
const week = k => new Date(Date.parse(monday + "T12:00:00Z") + k * 7 * 86400000).toISOString().slice(0, 10);

test("every session of every plan is in the catalogue", () => {
  for (const t of planTemplates()) {
    for (const w of t.weeks) {
      for (const k of w.q) {
        if (k.test) continue;
        const levels = CATALOGUE[t.sport].filter(x => x.family === k.family).map(x => x.level);
        assert.ok(levels.includes(k.level), `${t.id} ${k.family} level ${k.level}`);
      }
      for (const f of [w.long?.family, w.easy?.family].filter(Boolean)) assert.ok(CATALOGUE[t.sport].some(x => x.family === f), `${t.id} ${f}`);
      assert.ok(w.load > 0 && w.load <= 1.1, t.id);
    }
    // A lighter week at least every fourth week, and race plans end with the race.
    const light = t.weeks.map((w, i) => w.load < .8 ? i : -1).filter(i => i >= 0);
    assert.ok(light.length >= 1, t.id);
    if (t.race) assert.equal(t.weeks.at(-1).race, true, t.id);
    assert.equal(templateSummary(t).weeks.length, t.weeks.length);
  }
});

test("the key session's workout: never harder than planned, shortened when time is short", () => {
  const id = planWorkoutId("run", { family: "run-cruise", level: 1 }, 45);
  assert.equal(id, "run-cruise-4x5-45");
  // Too little time for the level: the shortest of it, shortened; never a harder level.
  assert.match(planWorkoutId("ride", { family: "thr", level: 8 }, 40), /^pfd-thr-2x20-\d+~40$/);
  // A beginner one or two levels easier, an experienced athlete one harder.
  assert.equal(levelShift({ level: 1 }), -2);
  assert.equal(levelShift({ level: 4.4 }), 1);
  assert.equal(planWorkoutId("run", { family: "run-cruise", level: 3 }, 60, -2), "run-cruise-4x5-60");
});

test("a race plan ends on race day; a near race starts it later", () => {
  const t = getTemplate("run-10k");
  const far = planStart(t, { today: "2026-10-11", raceDate: "2026-12-20" });
  assert.deepEqual([far.startDate, far.firstWeek], ["2026-10-12", 1]);
  const near = planStart(t, { today: "2026-10-28", raceDate: "2026-12-20" });
  assert.deepEqual([near.startDate, near.firstWeek], ["2026-10-12", 3]);
  assert.throws(() => planStart(t, { today: "2026-11-20", raceDate: "2026-12-20" }));
  // Without a race: this Monday until Tuesday, then the next one.
  assert.equal(planStart(getTemplate("ride-ftp"), { today: "2026-10-13" }).startDate, "2026-10-12");
  assert.equal(planStart(getTemplate("ride-ftp"), { today: "2026-10-15" }).startDate, "2026-10-19");
});

test("too few days of the sport: the freest days are added, spread out", () => {
  const prefs = { days: [[], ["run"], [], [], [], [], []], availability: [0, 60, 60, 45, 60, 90, 120].map(minutes => ({ minutes })) };
  const r = planDays(getTemplate("run-half"), prefs);
  assert.equal(r.days.filter(d => d.includes("run")).length, 4);
  assert.ok(!r.added.includes(0), "no time on Monday");
  assert.ok(r.added.every(i => !r.added.includes(i + 1)), JSON.stringify(r.added));
});

const days = [["gym"], ["ride", "run"], ["run"], ["ride"], ["gym", "run"], ["ride", "gym"], ["run", "gym"]];
const targetsFor = (plan, k, extra = {}) => {
  const start = week(k), pw = planWeek(plan, start);
  return applyPlan(weekTargets({ roles: planWeekRoles(days, { quality: planQuality(pw), prefer: plan.sport ?? getTemplate(plan.templateId).sport }), ctl: 50, days: [], today: start, weekStart: start, plan: planLoad(pw), ...extra }), plan, start, { thresholdPace: 280 });
};

test("the plan sets the week: quality days, the long run, a lighter week", () => {
  const plan = { templateId: "run-10k", startDate: monday, raceDate: week(9).replace(/12$/, "20"), raceKm: 10 };
  const w3 = targetsFor(plan, 2), runs = w3.items.filter(x => x.sport === "run");
  assert.deepEqual(runs.filter(x => x.role === "quality").map(x => x.plan.family), ["run-vo2-short", "run-tempo"]);
  assert.equal(runs.find(x => x.role === "long").minutes, 60);
  assert.equal(w3.plan.week, 3);
  const w4 = targetsFor(plan, 3);
  assert.equal(w4.recovery, true);
  assert.equal(w4.target, Math.round(50 * 7 * .7));
  // A heavy last week the data calls a recovery week stays one in a build week.
  assert.equal(targetsFor(plan, 2, { weekLoads: [600] }).target, Math.round(350 * .7));
});

test("race week: the race on its day, nothing of the sport after it", () => {
  const plan = { templateId: "run-10k", startDate: monday, raceDate: "2026-12-19", raceKm: 10 };
  const items = targetsFor(plan, 9).items.filter(x => x.sport === "run");
  const race = items.find(x => x.role === "race");
  assert.equal(race.date, "2026-12-19");
  assert.equal(race.plan.workoutId, raceId(10, 47));
  assert.ok(items.every(x => x.date <= "2026-12-19"));
  assert.equal(items.find(x => x.date === "2026-12-18")?.plan.family ?? "run-easy-strides", "run-easy-strides");
});

test("the FTP plan starts and ends with a test", () => {
  const plan = { templateId: "ride-ftp", startDate: monday };
  const first = targetsFor(plan, 0).items.filter(x => x.sport === "ride");
  assert.equal(first.find(x => x.role === "quality").plan.workoutId, "test-ride-ftp20");
  assert.equal(targetsFor(plan, 7).items.find(x => x.sport === "ride" && x.plan?.kind === "test")?.plan.workoutId, "test-ride-ftp20");
  assert.equal(planWeek(plan, week(8)), null);
});

test("race day is a workout the library can plan", async () => {
  const w = raceWorkout(raceId(21.1, 103));
  assert.equal(w.sport, "run");
  assert.ok(Math.abs(w.duration_minutes - 123) <= 1, String(w.duration_minutes));
  assert.equal((await getWorkout({}, raceId(5, 30))).family, "race");
});

test("the plan's quality count goes to the plan's sport first", () => {
  const roles = planWeekRoles(days, { quality: 1, prefer: "ride" });
  const q = roles.flatMap(d => d.items.filter(x => x.role === "quality").map(x => x.sport));
  assert.deepEqual(q, ["ride"]);
  assert.equal(planWeekRoles(days, { quality: 0 }).flatMap(d => d.items).filter(x => x.role === "quality").length, 0);
  // Readiness still caps it.
  assert.equal(planWeekRoles(days, { quality: 2, readiness: "red" }).flatMap(d => d.items).filter(x => x.role === "quality").length, 0);
});
