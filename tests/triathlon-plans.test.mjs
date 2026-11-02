import test from "node:test";
import assert from "node:assert/strict";
import { getTemplate, planDays, applyPlan, planStart, planPreview, templateSummary, triRaceDay, raceWorkout, missedSession, planSports } from "../src/training-plans.js";
import { weekProposal } from "../src/adaptive-week.js";
import { sanitizeWeekPlan } from "../src/week-planner.js";

const AVAILABLE = [60, 60, 90, 60, 60, 180, 120].map(minutes => ({ minutes }));
const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
function week(id, n, more = {}) {
  const t = getTemplate(id), base = sanitizeWeekPlan({ weeklyActivities: 8, availability: AVAILABLE });
  const prefs = sanitizeWeekPlan({ ...base, days: planDays(t, base).days });
  const when = planStart(t, { today: "2026-11-02", raceDate: "2027-02-21" });
  const plan = { templateId: t.id, sport: "triathlon", ...when, ...more }, start = shift(when.startDate, (n - 1) * 7);
  const p = weekProposal({ prefs, start, today: "2026-11-02", state: { status: "active" }, focus: { sport: "triathlon" }, triathlon: { year: null, levels: {} } });
  return applyPlan(p, plan, start, { thresholdPace: 280, ftp: 250, swimCss: 110 });
}

test("four triathlon plans: base, build and peak, every fourth week lighter, the race last", () => {
  for (const [id, weeks] of [["tri-sprint", 12], ["tri-olympic", 16], ["tri-half", 20], ["tri-full", 24]]) {
    const t = getTemplate(id);
    assert.equal(t.weeks.length, weeks);
    assert.equal(t.weeks.at(-1).phase, "race");
    assert.ok(t.weeks.some(w => w.brick), id + " has bricks");
    assert.ok(!t.weeks.at(-1).brick && !t.weeks.at(-2).brick, "no brick in the taper and race week");
    for (const w of t.weeks) for (const s of planSports("triathlon")) assert.ok(w.sports[s].q.length <= 1, "one key session per sport at most");
  }
  assert.deepEqual(planSports("run"), ["run"]);
});

test("the week's days: each sport gets its days, no sport takes all the best days", () => {
  const { days } = planDays(getTemplate("tri-olympic"), sanitizeWeekPlan({ availability: AVAILABLE }));
  const count = s => days.filter(d => d.includes(s)).length;
  assert.deepEqual([count("ride"), count("run"), count("swim")], [3, 3, 2]);
  assert.ok(days.every(d => d.length <= 2));
});

test("a build week: a key session per sport, the long ride at the weekend with the brick after it", () => {
  const a = week("tri-olympic", 9), tri = a.items.filter(x => x.plan);
  for (const s of ["ride", "run", "swim"]) assert.equal(tri.filter(x => x.sport === s && x.plan.kind === "quality").length, 1, s);
  const longRide = tri.find(x => x.sport === "ride" && x.plan.kind === "long"), brick = tri.find(x => x.brick);
  assert.ok(longRide.date >= shift(a.items[0].date, 5) || new Date(longRide.date + "T12:00:00Z").getUTCDay() % 6 === 0);
  assert.equal(brick.date, longRide.date);
  assert.equal(brick.minutes, getTemplate("tri-olympic").weeks[8].brick);
  const swim = tri.find(x => x.sport === "swim" && x.plan.kind === "long");
  assert.ok(swim.minutes < 60, "a swim takes its workout's time");
  assert.equal(a.plan.phase, "build");
  assert.equal(missedSession(a, { templateId: "tri-olympic" }, a.items[0].date, shift(a.items[0].date, 3)), null);
});

test("race day: the three legs on the day, nothing after it", () => {
  const a = week("tri-olympic", 16), race = a.items.filter(x => x.plan?.kind === "race");
  assert.deepEqual(race.map(x => x.sport), ["swim", "ride", "run"], "in the race's order");
  assert.ok(race.every(x => x.date === "2027-02-21"));
  assert.ok(!a.items.some(x => x.date > "2027-02-21"));
  const d = triRaceDay("olympic", { thresholdPace: 280, ftp: 250, swimCss: 110 });
  assert.equal(d.swim.workoutId, "race-swim-1500-" + d.swim.minutes);
  assert.match(d.ride.workoutId, /^race-ride-tri-short-40-\d+$/);
  assert.ok(d.run.minutes > 45, "the run after the ride is slower than fresh");
  const swim = raceWorkout(d.swim.workoutId), ride = raceWorkout(d.ride.workoutId);
  assert.equal(swim.sport, "swim");
  assert.equal(ride.sport, "ride");
});

test("what the app shows: legs, sessions per sport and each sport's long session", () => {
  const s = templateSummary(getTemplate("tri-half"));
  assert.deepEqual(s.race.legs, { swimMeters: 1900, rideKm: 90, runKm: 21.1 });
  assert.deepEqual(s.perSport, { ride: 3, run: 3, swim: 3 });
  assert.ok(s.weeks[10].long.ride > s.weeks[0].long.ride);
  const p = planPreview(getTemplate("tri-sprint"), { ctl: 40, days: [0, 1, 2, 3, 4, 5, 6], startDate: "2026-11-02" });
  assert.equal(p.weeks[0].sessions, 6);
});

test("multisport races with two sports: their legs in order, no third sport", async () => {
  const { perSportOf, chosenSports } = await import("../src/training-plans.js");
  for (const [id, sports, legs] of [["du-sprint", ["ride", "run"], ["run", "ride", "run"]], ["du-standard", ["ride", "run"], ["run", "ride", "run"]], ["aquabike", ["ride", "swim"], ["swim", "ride"]], ["aquathlon", ["run", "swim"], ["swim", "run"]]]) {
    const t = getTemplate(id);
    assert.deepEqual(planSports(t), sports, id);
    assert.equal(t.weeks.at(-1).phase, "race");
    for (const w of t.weeks) assert.deepEqual(Object.keys(w.sports).sort(), [...sports].sort());
    assert.equal(t.weeks.some(w => w.brick), sports.includes("ride") && sports.includes("run"), id + ": a brick only with a ride and a run");
    const d = triRaceDay(t.race.tri, { thresholdPace: 280, ftp: 250, swimCss: 110 });
    assert.deepEqual(d.legs.map(x => x.sport), legs);
    assert.ok(d.legs.every(x => raceWorkout(x.workoutId)?.sport === x.sport), id + ": each leg has its workout");
    assert.ok(d.minutes > d.legs.reduce((a, x) => a + x.minutes, 0), "transitions count");
    const s = templateSummary(t);
    assert.deepEqual(s.race.legList.map(x => x.sport), legs);
    assert.equal(s.race.legs, undefined, "the by-sport legs are a triathlon's");
    assert.deepEqual(Object.keys(perSportOf(t)), sports);
  }
  // A 5 km run after the ride is slower than after a swim.
  const du = triRaceDay("du-standard", { thresholdPace: 280 }), aqua = triRaceDay("aquathlon", { thresholdPace: 280 });
  assert.ok(du.legs[2].minutes >= aqua.legs[1].minutes && du.legs[2].workoutId.endsWith("-p98"), "slower after the ride");
  assert.equal(chosenSports(["swim"]), null);
  assert.deepEqual(chosenSports(["swim", "ride"]), ["ride", "swim"], "the app's order");
});

test("a duathlon week: race day run, ride, run; the athlete's own swim stays as it was", () => {
  const t = getTemplate("du-standard"), base = sanitizeWeekPlan({ weeklyActivities: 8, availability: AVAILABLE });
  const prefs = sanitizeWeekPlan({ ...base, days: planDays(t, base).days.map((d, i) => i === 2 ? [...d.filter(s => s !== "swim"), "swim"].slice(-2) : d) });
  assert.ok(!planDays(t, base).days.some(d => d.includes("swim")), "the plan adds no swim");
  const when = planStart(t, { today: "2026-11-02", raceDate: "2027-01-24" });
  const plan = { templateId: t.id, sport: "triathlon", ...when };
  const run = n => {
    const start = shift(when.startDate, (n - 1) * 7);
    const p = weekProposal({ prefs, start, today: "2026-11-02", state: { status: "active" } });
    return applyPlan(p, plan, start, { thresholdPace: 280, ftp: 250 });
  };
  const build = run(6);
  assert.ok(build.items.some(x => x.brick), "a ride–run brick in the build");
  assert.ok(build.items.filter(x => x.sport === "swim").every(x => !x.plan), "the swim is not the plan's");
  const race = run(12).items.filter(x => x.plan?.kind === "race");
  assert.deepEqual(race.map(x => x.sport), ["run", "ride", "run"]);
  assert.ok(race.every(x => x.date === "2027-01-24" && x.leg === undefined));
});

test("multisport without a race: two or three picked sports share six sessions", async () => {
  const { perSportOf } = await import("../src/training-plans.js");
  const t = getTemplate("multi-base");
  assert.ok(t.choose && !t.race);
  assert.ok(!t.weeks.some(w => w.race || w.phase === "taper" || w.brick), "no race, taper or brick");
  assert.deepEqual(perSportOf(t, { sports: ["swim", "ride"] }), { ride: 3, swim: 3 });
  assert.deepEqual(perSportOf(t, { sports: ["ride", "run", "swim"] }), { ride: 2, run: 2, swim: 2 });
  assert.deepEqual(planSports({ templateId: "multi-base", sports: ["run", "ride"] }), ["ride", "run"]);
  const { days } = planDays(t, sanitizeWeekPlan({ availability: AVAILABLE }), null, ["ride", "swim"]);
  const count = s => days.filter(d => d.includes(s)).length;
  assert.deepEqual([count("ride"), count("run"), count("swim")], [3, 0, 3]);
  const p = planPreview(t, { ctl: 40, days: [0, 1, 2, 3, 4, 5, 6], startDate: "2026-11-02", sports: ["ride", "swim"] });
  assert.equal(p.weeks[0].sessions, 6);
  assert.ok(p.weeks.every(w => w.keys.length <= 2), "only the picked sports' key sessions");
});

test("multisport days chosen by the athlete: the sports go only on those days", () => {
  const t = getTemplate("du-standard"), chosen = [1, 3, 5, 6];
  const { days } = planDays(t, sanitizeWeekPlan({ availability: AVAILABLE }), null, null, chosen);
  assert.ok(days.every((d, i) => chosen.includes(i) || !d.some(s => ["ride", "run"].includes(s))));
  assert.ok(chosen.every(i => days[i].length > 0));
});

test("review: picked sports reach the week, the summary and the roles", async () => {
  const { planWeek, planSummary, perSportOf } = await import("../src/training-plans.js");
  const { planRoleOptions } = await import("../src/week-planner.js");
  const plan = { templateId: "multi-base", sport: "triathlon", startDate: "2026-11-02", sports: ["run", "swim"] };
  const pw = planWeek(plan, "2026-12-07");
  assert.ok(pw.spec.q.every(k => ["run", "swim"].includes(k.sport)) && !pw.spec.sports.ride, "no ride key session");
  const keys = planSummary(plan, "2026-11-04").template.weeks.flatMap(w => w.keys).join(" ");
  assert.ok(!/Práh 2×|Sweet spot|Threshold 2×/.test(keys), keys);
  // Started from an older app without sports: ride and run, the same everywhere.
  assert.deepEqual(planSports({ templateId: "multi-base" }), ["ride", "run"]);
  assert.deepEqual(perSportOf(getTemplate("multi-base"), {}), { ride: 3, run: 3 });
  // A duathlon's roles: the athlete's own swim gets no key session; an aquathlon prefers the run.
  assert.deepEqual(planRoleOptions({ sport: "triathlon" }, 2, ["ride", "run"]).avoid, ["swim"]);
  assert.equal(planRoleOptions({ sport: "triathlon" }, 2, ["run", "swim"]).prefer, "run");
  assert.equal(planRoleOptions({ sport: "triathlon" }, 2, ["ride", "run", "swim"]).avoid, undefined);
  // Chosen days count whatever their free time.
  const short = AVAILABLE.map((d, i) => i === 1 ? { minutes: 15 } : d);
  const { days } = planDays(getTemplate("du-standard"), sanitizeWeekPlan({ availability: short }), null, null, [0, 1, 3, 5]);
  assert.ok(days[1].length > 0, "Tuesday is used");
});
