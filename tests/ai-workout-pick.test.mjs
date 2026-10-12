// The AI's pick of today's ride or run (src/ai-workout-pick.js): only one of
// the rules' library candidates that passes the length and hard-minute check,
// with a reason; otherwise the rules' pick stays.
import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { aiWorkoutPick, safeCandidates, workoutLoadCheck } from "../src/ai-workout-pick.js";

const steps = (...parts) => JSON.stringify(parts.map(([m, p]) => ({ durationMinutes: m, power: p })));
const easy = { id: "easy", name: "Z2", primary_system: "endurance", structure_json: steps([60, 65]) };
const tempo = { id: "tempo", name: "Tempo", primary_system: "tempo", structure_json: steps([15, 60], [30, 82], [15, 55]) };
const vo2 = { id: "vo2", name: "VO2", primary_system: "vo2max", structure_json: steps([15, 60], [25, 112], [20, 55]) };
const long = { id: "long", name: "Long", primary_system: "endurance", structure_json: steps([120, 65]) };
const generated = { status: "ok", workout: easy, alternatives: [tempo, vo2, long], explanation: { why: [] } };

const owner = () => ({ DB: scopedDb(createD1(), 1), USER_ID: 1, USER_IS_OWNER: true, OPENAI_API_KEY: "test" });
const reply = (id, reason) => async () => ({ text: JSON.stringify({ id, reason }) });

test("the check counts total and threshold-and-above minutes from the steps", () => {
  assert.deepEqual(workoutLoadCheck(vo2), { total: 60, hard: 25 });
  assert.deepEqual(workoutLoadCheck(tempo), { total: 60, hard: 0 });
  assert.deepEqual(safeCandidates([easy, tempo, vo2, long], { minutes: 60, zone: "yellow" }).map(w => w.id), ["easy", "tempo"]);
  assert.deepEqual(safeCandidates([easy, tempo, vo2, long], { minutes: 90, zone: "green" }).map(w => w.id), ["easy", "tempo", "vo2"]);
});

test("the AI's candidate comes first with its reason", async () => {
  let input = null;
  const ask = async (env, req) => { input = req.input; return { text: JSON.stringify({ id: "tempo", reason: "Připravenost 74 a vyspaný: zvládneš tempo." }) }; };
  const r = await aiWorkoutPick(owner(), generated, { minutes: 60, coach: { readiness: { status: "green", score: 74 } }, ask });
  assert.equal(r.workout.id, "tempo");
  assert.equal(r.workout.ai.reason, "Připravenost 74 a vyspaný: zvládneš tempo.");
  assert.deepEqual(r.alternatives.map(w => w.id), ["easy", "vo2", "long"]);
  assert.ok(!input.includes('"id":"long"'), "too long a workout is not offered");
});

test("an answer outside the safe candidates, no consent or a failure keeps the rules' pick", async () => {
  const red = { coach: { readiness: { status: "red" } }, minutes: 60 };
  assert.equal((await aiWorkoutPick(owner(), generated, { ...red, ask: reply("vo2", "Jdi do toho.") })).workout.id, "easy");
  assert.equal((await aiWorkoutPick(owner(), generated, { minutes: 60, ask: reply("nope", "x") })).ai, undefined);
  const never = async () => { throw new Error("must not be called"); };
  assert.equal((await aiWorkoutPick({ DB: scopedDb(createD1(), 2), USER_ID: 2, OPENAI_API_KEY: "test" }, generated, { minutes: 60, ask: never })).workout.id, "easy");
  assert.equal((await aiWorkoutPick(owner(), generated, { minutes: 60, ask: async () => { throw new Error("down"); } })).workout.id, "easy");
});
