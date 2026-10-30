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
