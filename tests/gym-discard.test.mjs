import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleGymPlanApi } from "../src/routes-gym.js";
import { readGymPlan, planValues, saveGymPlan, cancelGymPlan } from "../src/gym-plan-store.js";
import { getStrengthHistory } from "../src/strength-history.js";
import { daySessions } from "../src/app-training.js";
import { localToday } from "../src/user-time.js";

const ORIGIN = "https://aurin.health";
function setup() {
  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT)");
  return { raw, env: { DB: scopedDb(raw, 1), USER_ID: 1 } };
}
async function post(env, body) {
  const url = new URL(ORIGIN + "/app/api/gym");
  const request = new Request(url, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const response = await handleGymPlanApi(request, env, {}, url, { signedIn: true }, {});
  return { status: response.status, body: await response.json() };
}

test("Zahodit trénink takes a generated gym off the day, with its logged sets", async () => {
  const { raw, env } = setup(), date = localToday();
  const plan = { date, planName: "Horní tělo", rows: [
    ["WORK", "Bench press", "1", "60", "8", "", "", "", "FALSE", "", ""],
    ["WORK", "Bench press", "2", "60", "8", "", "", "", "FALSE", "", ""]
  ] };
  const values = planValues(plan);
  await saveGymPlan(env.DB, date, values);
  // One set ticked in Režim tréninku, saved as the app saves it.
  const ticked = values.map(r => Array.isArray(r) ? [...r] : r);
  ticked[7][5] = "60"; ticked[7][6] = "8"; ticked[7][8] = "TRUE";
  assert.equal((await post(env, { date, values: ticked })).status, 200);
  assert.equal((await getStrengthHistory(env.DB, 50)).length, 1);

  const r = await post(env, { date, action: "discard" });
  assert.equal(r.status, 200);
  assert.equal(r.body.discarded, true);
  const after = await readGymPlan(env.DB, date, { includeCancelled: true });
  assert.deepEqual([after.stored, after.cancelled], [false, false]);
  assert.equal((await getStrengthHistory(env.DB, 50)).length, 0);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM gym_plans").get().n, 0);
  // Nothing is left for Dnes → Den to show with Začít.
  assert.deepEqual(daySessions(date, date, {}, null).sessions, []);

  // A new workout can be built for the same day right away.
  assert.equal((await post(env, { date, values })).status, 200);
  assert.equal((await readGymPlan(env.DB, date)).stored, true);
});

test("a cancelled gym plan is discarded too", async () => {
  const { env } = setup(), date = localToday();
  await saveGymPlan(env.DB, date, planValues({ date, planName: "Nohy", rows: [["WORK", "Leg press", "1", "100", "10", "", "", "", "FALSE", "", ""]] }));
  await cancelGymPlan(env.DB, date);
  assert.equal((await post(env, { date, action: "discard" })).status, 200);
  const after = await readGymPlan(env.DB, date, { includeCancelled: true });
  assert.deepEqual([after.stored, after.cancelled, after.recoverable], [false, false, false]);
});
