import test from "node:test";
import assert from "node:assert/strict";
import { generateStrengthPlan, exerciseCountFor, EXERCISES } from "../src/strength-generator.js";
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
  assert.deepEqual([30, 45, 60, 75, 90, undefined].map(exerciseCountFor), [3, 4, 5, 6, 7, 5]);
  for (const [minutes, count] of [[45, 4], [60, 5], [75, 6]]) {
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
  assert.ok(sundayExercises.length >= 3 && sundayExercises.length <= 5);
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
  assert.deepEqual(sessions, [{ date: "2026-10-02", exercises: ["DB curl"] }]);
});
