import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleGymToolsApi } from "../src/routes-gym.js";
import { updateAthleteState } from "../src/athlete-state.js";
import { getStrengthHistory } from "../src/strength-history.js";
import { localToday } from "../src/user-time.js";
import { shiftDate } from "../src/dashboard-shared.js";

// The watch's Repeat last and an exercise added in the live gym take today's
// loads from the server, which knows the day (load ramp-back review C2).
const ORIGIN = "https://aurin.health";
async function next(env, ...names) {
  const url = new URL(ORIGIN + "/app/api/gym/next?date=" + localToday() + names.map(n => "&exercise=" + encodeURIComponent(n)).join(""));
  return (await handleGymToolsApi(new Request(url), env, {}, url, { signedIn: true }, {})).json();
}
async function lastSquat(env, daysAgo) {
  await getStrengthHistory(env.DB);
  for (const set of [1, 2, 3]) await env.DB.prepare("INSERT INTO strength_sets(user_id,source_key,workout_date,plan_row,type,exercise,set_no,planned_kg,planned_reps,actual_kg,actual_reps,completed) VALUES(1,?,?,1,'WORK','Back Squat',?,100,'5-8',100,8,1)").bind('test-' + set, shiftDate(localToday(), -daysAgo), set).run();
}

test("all reps done a few days ago: the squat goes up", async () => {
  const env = { DB: scopedDb(createD1(), 1), USER_ID: 1 };
  await lastSquat(env, 4);
  const r = await next(env, "Back Squat");
  assert.equal(r.warning, null);
  assert.ok(r.exercises[0].kg > 100, JSON.stringify(r));
  assert.equal(r.exercises[0].pain, false);
});

test("after more than 21 days without it, the squat comes back lighter", async () => {
  const env = { DB: scopedDb(createD1(), 1), USER_ID: 1 };
  await lastSquat(env, 30);
  const r = await next(env, "Back Squat");
  assert.ok(r.exercises[0].kg < 100, JSON.stringify(r));
});

test("status Sick: a warning and the load holds", async () => {
  const env = { DB: scopedDb(createD1(), 1), USER_ID: 1 };
  await lastSquat(env, 4);
  await updateAthleteState(env.DB, { status: "sick" });
  const r = await next(env, "Back Squat");
  assert.ok(r.warning, JSON.stringify(r));
  assert.equal(r.exercises[0].kg, 100);
});

test("a remembered sore knee marks the squat, the row is not", async () => {
  const env = { DB: scopedDb(createD1(), 1), USER_ID: 1 };
  await updateAthleteState(env.DB, { memory: "Bolí mě koleno" });
  const r = await next(env, "Back Squat", "Seated Cable Row");
  assert.deepEqual(r.exercises.map(e => e.pain), [true, false]);
});

test("a red morning or signs of illness give the gym's warning, a good day none", async () => {
  const { gymDayWarning } = await import("../src/strength-generator.js");
  assert.equal(gymDayWarning({ adaptive: { recovery: { zone: "green", flags: [] } } }), null);
  assert.match(gymDayWarning({ adaptive: { recovery: { zone: "red", flags: [] } } }), /red|červen/i);
  assert.ok(gymDayWarning({ adaptive: { recovery: { zone: "green", flags: ["respiration_elevated"] } } }));
});
