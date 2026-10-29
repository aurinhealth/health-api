import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleGymPlanApi } from "../src/routes-gym.js";
import { readGymPlan, planValues, saveGymPlan, cancelGymPlan } from "../src/gym-plan-store.js";
import { localToday } from "../src/user-time.js";
import { shiftDate } from "../src/dashboard-shared.js";

const ORIGIN = "https://aurin.health";
function setup() {
  const raw = createD1();
  return { raw, env: { DB: scopedDb(raw, 1), USER_ID: 1 } };
}
async function move(env, date, to) {
  const url = new URL(ORIGIN + "/app/api/gym");
  const request = new Request(url, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ date, action: "move", to }) });
  const response = await handleGymPlanApi(request, env, {}, url, { signedIn: true }, {});
  return { status: response.status, body: await response.json() };
}
const plan = (date, name = "Upper Body") => planValues({ date, planName: name, rows: [
  ["WORK", "Bench press", "1", "60", "8", "", "", "", "FALSE", "", ""],
  ["WORK", "Bench press", "2", "60", "8", "", "", "", "FALSE", "", ""]
] });

test("a gym plan moves onto a day whose own plan was cancelled", async () => {
  const { env } = setup(), today = localToday(), friday = shiftDate(today, 1);
  await saveGymPlan(env.DB, today, plan(today));
  await saveGymPlan(env.DB, friday, plan(friday, "Legs"));
  await cancelGymPlan(env.DB, friday);
  const r = await move(env, today, friday);
  assert.equal(r.status, 200);
  const moved = await readGymPlan(env.DB, friday);
  assert.equal(moved.stored, true);
  assert.equal(moved.cancelled, false);
  assert.equal(moved.values[2][3], "Upper Body");
  assert.equal((await readGymPlan(env.DB, today)).stored, false);
});

test("a weight left in a set that was not done does not hold the plan back", async () => {
  const { env } = setup(), today = localToday(), friday = shiftDate(today, 1);
  const values = plan(today);
  values[7][5] = "60";
  await saveGymPlan(env.DB, today, values);
  assert.equal((await move(env, today, friday)).status, 200);
});

test("a plan with a done set, or a day with its own plan, says why it stays", async () => {
  const { env } = setup(), today = localToday(), friday = shiftDate(today, 1), saturday = shiftDate(today, 2);
  const done = plan(today);
  done[7][5] = "60"; done[7][6] = "8"; done[7][8] = "TRUE";
  await saveGymPlan(env.DB, today, done);
  const logged = await move(env, today, friday);
  assert.equal(logged.status, 409);
  assert.match(logged.body.message, /logged sets|zapsané série/);

  await saveGymPlan(env.DB, friday, plan(friday, "Legs"));
  await saveGymPlan(env.DB, saturday, plan(saturday, "Pull"));
  const taken = await move(env, friday, saturday);
  assert.equal(taken.status, 409);
  assert.match(taken.body.message, /own gym plan|vlastní gym plán/);

  // A cancelled plan with logged sets keeps its results: the day is not free.
  const sunday = shiftDate(today, 3), kept = plan(sunday, "Push");
  kept[7][5] = "60"; kept[7][6] = "8"; kept[7][8] = "TRUE";
  await saveGymPlan(env.DB, sunday, kept);
  await cancelGymPlan(env.DB, sunday);
  assert.equal((await move(env, friday, sunday)).status, 409);
});
