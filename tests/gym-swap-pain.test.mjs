import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleGymToolsApi } from "../src/routes-gym.js";
import { updateAthleteState } from "../src/athlete-state.js";
import { localToday } from "../src/user-time.js";

// Swapping an exercise never offers one that loads a part the coach remembers
// as painful, as the coach chat already does (coach-gym-adjustment.js).
const ORIGIN = "https://aurin.health";
async function alternatives(env, exercise) {
  const url = new URL(ORIGIN + "/app/api/gym/alternatives?date=" + localToday() + "&exercise=" + encodeURIComponent(exercise));
  return (await (await handleGymToolsApi(new Request(url), env, {}, url, { signedIn: true }, {})).json()).alternatives.map(a => a.name);
}

test("a sore knee keeps knee-loading exercises out of the swap list", async () => {
  const env = { DB: scopedDb(createD1(), 1), USER_ID: 1 };
  const before = await alternatives(env, "Back Squat");
  assert.ok(before.some(n => /squat|lunge|leg press/i.test(n)), before.join(", "));
  await updateAthleteState(env.DB, { memory: "Bolí mě koleno" });
  const after = await alternatives(env, "Back Squat");
  assert.ok(after.every(n => !/squat|lunge|leg press|step-up/i.test(n)), after.join(", "));
});
