// Cycling race plans, the new gym plans with the strength test, and the race
// estimates (training-plans.js, race-estimate.js).
import test from "node:test";
import assert from "node:assert/strict";
import { getTemplate, planWeek, planQuality, planLoad, applyPlan, raceWorkout, raceDay, gymPhaseFor, planCompletion, templateSummary } from "../src/training-plans.js";
import { planWeekRoles, weekTargets } from "../src/week-planner.js";
import { getWorkout } from "../src/workout-library.js";
import { runRaceSeconds, runEstimates, rideEstimates, rideRace, goalVerdict, durationShare, speedFor } from "../src/race-estimate.js";
import { generateStrengthPlan, EXERCISES, fitsEquipment } from "../src/strength-generator.js";

const monday = "2026-10-12";
const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const week = k => shift(monday, k * 7);
const days = [["gym"], ["ride", "run"], ["run"], ["ride"], ["gym", "run"], ["ride", "gym"], ["run", "gym"]];
const targetsFor = (plan, k, options = {}) => {
  const start = week(k), pw = planWeek(plan, start), sport = getTemplate(plan.templateId).sport;
  return applyPlan(weekTargets({ roles: planWeekRoles(days, { quality: planQuality(pw), prefer: sport }), ctl: 50, days: [], today: start, weekStart: start, plan: planLoad(pw) }), plan, start, options);
};

test("race estimates: running from the threshold pace, cycling from FTP", () => {
  assert.equal(runRaceSeconds(10, 285), 2850);
  assert.equal(runRaceSeconds(10, null), null);
  const run = runEstimates(285);
  assert.deepEqual(run.races.map(r => r.km), [5, 10, 21.1, 42.2]);
  assert.ok(run.races.every((r, i) => i === 0 || r.pace > run.races[i - 1].pace), "longer races are slower");
  const ride = rideEstimates(250, 75);
  assert.deepEqual(ride.efforts.map(e => e.watts), [300, 263, 250]);
  assert.equal(ride.efforts[2].wkg, 3.3);
  assert.ok(Math.abs(durationShare(20) - 1.05) < .001 && Math.abs(durationShare(60) - 1) < .001);
  // More power, more speed; a climb is slower than the flat.
  assert.ok(speedFor(300, 75) > speedFor(200, 75));
  assert.ok(speedFor(250, 75, "climb") < speedFor(250, 75, "road") / 2);
  const gf = rideRace("granfondo", 160, { ftp: 250, weight: 75 });
  assert.deepEqual([gf.low, gf.high], [163, 188]);
  assert.ok(gf.minutes > 240 && gf.minutes < 360, String(gf.minutes));
  const tt = rideRace("tt", 40, { ftp: 250, weight: 75 });
  assert.ok(tt.minutes > 50 && tt.minutes < 70 && tt.low > 230, JSON.stringify(tt));
  assert.equal(rideRace("granfondo", 160, { weight: 80 }).estimated, true, "without FTP, 2.5 W/kg");
  assert.equal(goalVerdict(6200, 6270, 10), "real");
  assert.equal(goalVerdict(6100, 6270, 10), "bold");
  assert.equal(goalVerdict(5600, 6270, 10), "hard");
  assert.equal(goalVerdict(6400, 6270, 10), "easy");
});

test("cycling race plans end on race day with the race's power", async () => {
  for (const id of ["ride-granfondo", "ride-mtb", "ride-tt", "ride-climb"]) {
    const t = getTemplate(id);
    assert.equal(t.sport, "ride");
    assert.equal(t.weeks.at(-1).race, true, id);
    assert.ok(t.race.options.includes(t.race.km), id);
    assert.equal(templateSummary(t).race.kind, t.race.ride);
  }
  const plan = { templateId: "ride-granfondo", startDate: monday, raceDate: shift(week(11), 5), raceKm: 160 };
  const rides = targetsFor(plan, 11, { ftp: 250, weight: 75 }).items.filter(x => x.sport === "ride");
  const race = rides.find(x => x.role === "race");
  assert.equal(race.date, plan.raceDate);
  assert.match(race.plan.workoutId, /^race-ride-granfondo-160-\d+$/);
  assert.equal(race.label, "Gran fondo 160 km");
  assert.ok(rides.every(x => x.date <= plan.raceDate));
  const w = await getWorkout({}, race.plan.workoutId);
  assert.equal(w.sport, "ride");
  assert.equal(w.duration_minutes, race.minutes);
  assert.match(w.description, /65–75 % FTP/);
  // The long rides grow towards five hours.
  const long = targetsFor(plan, 9, { ftp: 250 }).items.find(x => x.sport === "ride" && x.role === "long");
  assert.equal(long.minutes, 300);
  // A time trial: a warm-up, a short effort and the race at what its duration allows.
  const tt = raceWorkout(raceDay(getTemplate("ride-tt"), 40, { ftp: 250, weight: 75 }).workoutId);
  assert.equal(tt.name, "Časovka 40 km");
  assert.ok(tt.duration_minutes > 80, "warm-up and cool-down around the race");
});

test("a running race with a goal time: the race day runs at the goal pace", () => {
  const half = getTemplate("run-half");
  const goal = raceDay(half, 21.1, { thresholdPace: 285, target: 6120 });
  assert.equal(goal.workoutId, "race-run-21_1-102-p98");
  const w = raceWorkout(goal.workoutId);
  assert.ok(w.structure_json.includes('"power":98'), w.structure_json);
  assert.match(w.description, /cílového času/);
  // Without a goal, the threshold's race pace as before.
  assert.equal(raceDay(half, 21.1, { thresholdPace: 285 }).workoutId, "race-run-21_1-104");
  const plan = { templateId: "run-half", startDate: monday, raceDate: shift(week(11), 6), raceKm: 21.1, target: 6120 };
  const race = targetsFor(plan, 11, { thresholdPace: 285 }).items.find(x => x.role === "race");
  assert.equal(race.plan.workoutId, "race-run-21_1-102-p98");
  assert.equal(race.minutes, 102);
});

test("the strength plan tests on its first session and goes light on the others", () => {
  const plan = { templateId: "gym-strength", startDate: monday };
  const gymDays = [["gym"], [], ["gym"], [], ["gym"], [], []];
  const first = gymPhaseFor(plan, monday, gymDays);
  assert.equal(first.test, true);
  assert.equal(first.sets, 1);
  assert.equal(first.reps, "3–5");
  assert.match(first.name, /^Síla · Test síly · týden 1\/12$/);
  const second = gymPhaseFor(plan, shift(monday, 2), gymDays);
  assert.ok(!second.test);
  assert.equal(second.rpe, "6–7");
  assert.equal(gymPhaseFor(plan, week(11), gymDays).test, true, "and again at the end");
  assert.equal(templateSummary(getTemplate("gym-strength")).weeks[0].keys[0], "Dřep, bench, mrtvý tah: odhad maxima");
});

test("every gym plan exercise exists and every slot ends with something for home", () => {
  for (const id of ["gym-muscle", "gym-strength", "gym-running", "gym-home"]) {
    for (const w of getTemplate(id).weeks) for (const slot of [...w.gym.exercises, ...(w.gym.test || [])]) {
      for (const name of [].concat(slot)) assert.ok(EXERCISES[name], `${id}: ${name}`);
      assert.ok([].concat(slot).some(name => fitsEquipment(name, "dumbbells")), `${id}: ${[].concat(slot)[0]} has a dumbbell or body-weight option`);
    }
  }
  for (const slot of getTemplate("gym-home").weeks[0].gym.exercises) assert.ok(fitsEquipment([].concat(slot)[0], "bodyweight"), String(slot));
  assert.equal(gymPhaseFor({ templateId: "gym-home", startDate: monday }, monday, [["gym"], [], [], [], [], [], []]).equipment, "bodyweight");
});

test("a plan exercise the equipment does not allow is replaced, not dropped", () => {
  const phase = { name: "Test", phaseName: "Test", sets: 3, reps: "8", rpe: "7", rationale: "", exercises: [["Leg extension Prime"], ["Barbell bench press"]] };
  const context = { date: monday, profile: { sex: "male" }, trainingSetup: { equipment: "bodyweight" }, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: [], plannedSessions: [] } };
  const plan = generateStrengthPlan(context, { planPhase: phase, durationMinutes: 60 });
  const work = [...new Set(plan.rows.filter(r => r[0] === "WORK").map(r => r[1]))];
  assert.equal(work.length, 2, JSON.stringify(work));
  assert.equal(EXERCISES[work.find(n => EXERCISES[n].muscle === "quads")]?.muscle, "quads");
  assert.ok(work.every(n => fitsEquipment(n, "bodyweight")), JSON.stringify(work));
});

test("a gym plan's weeks done count its own sessions", () => {
  const plan = { templateId: "gym-strength", startDate: monday };
  const done = [monday, shift(monday, 2), shift(monday, 4), week(1), shift(week(1), 2)];
  const c = planCompletion(plan, { days: [0, 2, 4], doneDates: done, today: week(2) });
  assert.deepEqual(c, { 1: 100, 2: 67 });
});
