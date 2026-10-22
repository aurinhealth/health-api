import test from "node:test";
import assert from "node:assert/strict";
import { generateStrengthPlan, exerciseCountFor, EXERCISES, plannedSessionFromRows, weeklyGymDays, splitParts } from "../src/strength-generator.js";
import { plannedGymSessions } from "../src/strength-context.js";
import { planValues } from "../src/gym-plan-store.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const context = (date, plannedSessions = [], recentCompletedSets = []) => ({
  status: "ok", date, recovery: {},
  cycling: { recentRideHours: 3, recentRideTss: 200, recentActivities: [], plannedWorkouts: [], nextRide: null },
  strength: { recentCompletedSets, plannedSessions }
});
const workExercises = plan => [...new Set(plan.rows.filter(r => r[0] === "WORK").map(r => r[1]))];

test("the session length bounds volume including warmups, rests and setup", () => {
  assert.deepEqual([30, 45, 60, 75, 90, undefined].map(exerciseCountFor), [3, 5, 6, 7, 8, 6]);
  for (const [minutes, count] of [[45, 5], [60, 6], [75, 7]]) {
    const plan = generateStrengthPlan(context("2026-10-03"), { focus: "upper", durationMinutes: minutes });
    assert.ok(workExercises(plan).length <= count);
    assert.ok(workExercises(plan).length >= 3);
    assert.ok(plan.timing.totalSeconds <= minutes * 60);
    assert.ok(plan.timing.setupSeconds > 0 && plan.timing.bufferSeconds > 0);
  }
});

test("a second gym day in the week gets different exercises", () => {
  const friday = generateStrengthPlan(context("2026-10-02"), { focus: "upper", durationMinutes: 60 });
  const fridayExercises = workExercises(friday);
  const sunday = generateStrengthPlan(context("2026-10-04", [{ date: "2026-10-02", exercises: fridayExercises }]), { focus: "upper", durationMinutes: 60 });
  const sundayExercises = workExercises(sunday);
  assert.ok(sundayExercises.length >= 3 && sundayExercises.length <= 6);
  assert.ok(sunday.timing.estimatedMinutes <= 60);
  const shared = sundayExercises.filter(x => fridayExercises.includes(x));
  assert.ok(shared.length <= 1, "shared: " + shared.join(", "));
  assert.match(sunday.rationale, /liší od plánu na/);
});

test("an upper-body day has no leg exercises and only one full warm-up", () => {
  const plan = generateStrengthPlan(context("2026-10-03"), { focus: "upper", durationMinutes: 75 });
  assert.ok(workExercises(plan).every(x => !["quads", "hamstrings", "glutes", "calves"].includes(EXERCISES[x].muscle)));
  const warmups = plan.rows.filter(r => r[0] === "WARMUP");
  assert.ok(warmups.length <= 3 + (workExercises(plan).length - 1));
  assert.equal(warmups.filter(r => r[1] === warmups[0][1]).length, 3);
});

test("exercises done in the last two days are left out", () => {
  const done = [{ workout_date: "2026-10-02", exercise: "DB bench press", type: "WORK", completed: 1, actual_kg: 20, actual_reps: 8, rpe: 8, set_no: 1 }];
  const plan = generateStrengthPlan(context("2026-10-03", [], done), { focus: "upper", durationMinutes: 60 });
  assert.ok(!workExercises(plan).includes("DB bench press"));
});

test("planned gym sessions around a date come from D1, without done sets or the date itself", async () => {
  const raw = createD1();
  const db = scopedDb(raw, 1);
  const save = async (userId, date, rows) => raw.sqlite.prepare("INSERT INTO gym_plans(user_id,workout_date,values_json) VALUES(?,?,?)").run(userId, date, JSON.stringify(planValues({ date, rows })));
  await plannedGymSessions({ DB: db, USER_ID: 1 }, "2026-10-04"); // creates the table
  const row = (ex, done = "FALSE") => ["WORK", ex, "1", "10", "8", "", "", "", done, "", "", "", "BILATERAL"];
  await save(1, "2026-10-02", [row("DB curl"), row("Low row", "TRUE")]);
  await save(1, "2026-10-04", [row("Pec deck")]);
  await save(1, "2026-09-20", [row("Lat pulldown")]);
  await save(2, "2026-10-03", [row("Face pull")]);
  const sessions = await plannedGymSessions({ DB: db, USER_ID: 1 }, "2026-10-04");
  assert.deepEqual(sessions, [{ date: "2026-10-02", exercises: ["DB curl"], sets: { "DB curl": 1 }, loads: { "DB curl": { kg: 10, reps: "8" } } }]);
});

// Petr 2026-10-21: Friday to Sunday in the gym got three near-identical full
// body sessions (low row three days running, rear delts and rope pushdown every day).
const buildBlock = (days, options = {}) => {
  const built = [], plans = [];
  for (const d of days) {
    const plan = generateStrengthPlan(context(d, built.slice()), { durationMinutes: 70, blockDates: days.filter(x => x !== d), ...options });
    built.push(plannedSessionFromRows(d, plan.rows));
    plans.push(plan);
  }
  return plans;
};
const groupOfPattern = p => ({ push: "hpush", horizontal_push: "hpush", push_vertical: "vpush", pull: "hpull", pull_vertical: "vpull" })[p];
const workSets = plan => plan.rows.filter(r => r[0] === "WORK").length;

test("gym days in a row follow on from each other: no exercise or main push/pull direction two days running", () => {
  const plans = buildBlock(["2026-10-23", "2026-10-24", "2026-10-25"]);
  for (let i = 1; i < plans.length; i++) {
    const before = workExercises(plans[i - 1]), today = workExercises(plans[i]);
    assert.deepEqual(today.filter(x => before.includes(x)), [], plans[i].date);
    const dirs = list => new Set(list.map(x => groupOfPattern(EXERCISES[x].pattern)).filter(Boolean));
    const shared = [...dirs(today)].filter(d => dirs(before).has(d));
    assert.deepEqual(shared, [], plans[i].date + " shares " + shared.join(", "));
    const smallBefore = new Set(before.map(x => EXERCISES[x].muscle).filter(m => ["rear_delts", "triceps", "biceps", "side_delts"].includes(m)));
    assert.ok(today.every(x => !smallBefore.has(EXERCISES[x].muscle) || !["rear_delts", "triceps", "biceps", "side_delts"].includes(EXERCISES[x].muscle)), plans[i].date + " repeats a small muscle");
  }
  assert.match(plans[1].rationale, /Navazuje na posilovnu v pátek a v neděli/);
});

test("the third gym day in a row is lighter: about 30 % fewer sets, no heavier load", () => {
  const [friday, , sunday] = buildBlock(["2026-10-23", "2026-10-24", "2026-10-25"]);
  assert.match(sunday.planName, /lehčí den/);
  assert.ok(workSets(sunday) <= Math.round(workSets(friday) * 0.8), workSets(friday) + " → " + workSets(sunday));
  // The same exercise as two days before keeps its reps and is not heavier.
  const fridayPlan = plannedSessionFromRows("2026-10-23", friday.rows);
  const plan = generateStrengthPlan(context("2026-10-25", [fridayPlan, { date: "2026-10-24", exercises: [] }]), { durationMinutes: 70, blockDates: ["2026-10-24"], excludeExercises: [] });
  for (const r of plan.rows.filter(r => r[0] === "WORK" && fridayPlan.loads[r[1]])) {
    const was = fridayPlan.loads[r[1]];
    assert.equal(r[4], was.reps);
    if (was.kg != null && r[3] !== "") assert.ok(Number(String(r[3]).replace(",", ".")) <= was.kg, r[1]);
  }
});

test("four gym days a week alternate upper and lower body, five and more push, pull and legs", () => {
  assert.equal(splitParts(3), null);
  assert.deepEqual(splitParts(4), ["upper", "lower"]);
  assert.deepEqual(splitParts(6), ["push", "pull", "legs"]);
  assert.deepEqual(buildBlock(["2026-10-23", "2026-10-24", "2026-10-25"], { weeklyGymDays: 5 }).map(p => p.planName), ["Push · prsa, ramena, triceps", "Pull · záda, biceps", "Nohy"]);
  assert.deepEqual(buildBlock(["2026-10-23", "2026-10-24", "2026-10-25"], { weeklyGymDays: 4 }).map(p => p.planName), ["Upper Body", "Lower Body", "Upper Body"]);
  // Generated one by one: the part trained longest ago comes next.
  const done = ["Low row", "Lat pulldown", "DB curl", "Rear delt pec deck"].map(exercise => ({ workout_date: "2026-10-22", exercise, type: "WORK", completed: 1, actual_kg: 20, actual_reps: 8, rpe: 8, set_no: 1 }));
  const next = generateStrengthPlan(context("2026-10-23", [], done), { durationMinutes: 60, weeklyGymDays: 5 });
  assert.equal(next.planName, "Push · prsa, ramena, triceps");
  assert.ok(workExercises(next).every(x => !["back", "biceps", "rear_delts"].includes(EXERCISES[x].muscle)));
});

test("the week's gym days count the week plan and the sessions that week", () => {
  const plan = [["gym"], [], ["gym"], [], ["gym"], ["gym"], []];
  assert.equal(weeklyGymDays("2026-10-21", plan), 4);
  assert.equal(weeklyGymDays("2026-10-23", [], ["2026-10-24", "2026-10-25", "2026-10-26"]), 3);
});
