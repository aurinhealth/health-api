import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleGymPlanApi, handleGymToolsApi } from "../src/routes-gym.js";
import { planValues, saveGymPlan } from "../src/gym-plan-store.js";
import { localToday } from "../src/user-time.js";

// The Apple Watch's own gym requests when the iPhone is out of reach
// (AurinWatch/GymStore.swift): the sheet without the history, a set saved
// without the history back, and a search of the exercise names.
const ORIGIN = "https://aurin.health";
function setup() {
  const raw = createD1();
  return { env: { DB: scopedDb(raw, 1), USER_ID: 1 } };
}
const rows = [
  ["WORK", "Bench press", "1", "60", "8", "", "", "", "FALSE", "", ""],
  ["WORK", "Bench press", "2", "60", "8", "", "", "", "FALSE", "", ""]
];

test("the watch loads the day's sheet without the history", async () => {
  const { env } = setup(), today = localToday();
  await saveGymPlan(env.DB, today, planValues({ date: today, planName: "Upper Body", rows }));
  const url = new URL(ORIGIN + "/app/api/gym?lite=1&date=" + today);
  const response = await handleGymPlanApi(new Request(url), env, {}, url, { signedIn: true }, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.values[2][3], "Upper Body");
  assert.deepEqual(body.history, []);
  assert.deepEqual(body.muscles, {});
});

test("a set saved from the watch goes into the history without the history coming back", async () => {
  const { env } = setup(), today = localToday();
  const values = planValues({ date: today, planName: "Upper Body", rows });
  await saveGymPlan(env.DB, today, values);
  const done = values.map((row, i) => i === 7 ? ["WORK", "Bench press", "1", "60", "8", "62.5", "8", "", "TRUE", "", ""] : row);
  const url = new URL(ORIGIN + "/app/api/gym");
  const request = new Request(url, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ date: today, values: done.slice(7), fullValues: done, lite: true }) });
  const response = await handleGymPlanApi(request, env, {}, url, { signedIn: true }, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.history, []);
  assert.equal(body.values[7][5], "62.5");
  const again = new URL(ORIGIN + "/app/api/gym?date=" + today);
  const full = await (await handleGymPlanApi(new Request(again), env, {}, again, { signedIn: true }, {})).json();
  assert.ok(full.history.some(h => h.exercise === "Bench press"));
});

test("the watch searches the exercise names, at most 20, without the muscles", async () => {
  const { env } = setup();
  const url = new URL(ORIGIN + "/app/api/gym/exercises?q=press");
  const response = await handleGymToolsApi(new Request(url), env, {}, url, { signedIn: true }, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.exercises.length > 0 && body.exercises.length <= 20);
  assert.ok(body.exercises.every(e => /press/i.test(e.name) && e.muscles === undefined));
});
