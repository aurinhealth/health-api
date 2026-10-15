// The AI's own ride or run (src/ai-workout-compose.js): only when the library
// fits the day poorly, and only a workout of the coach's type and length under
// the morning's hard-minute cap; it is kept and loads again as "ai-<id>".
import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { composeWorkout, poorFit, COMPOSE_BELOW } from "../src/ai-workout-compose.js";
import { getWorkout } from "../src/workout-library.js";

const owner = () => ({ DB: scopedDb(createD1(), 1), USER_ID: 1, USER_IS_OWNER: true, OPENAI_API_KEY: "test" });
const block = (seconds, low, high, repeats = 1) => ({ repeats, steps: [{ label: "x", seconds, low, high }] });
const answer = (blocks, reason = "Připravenost 74: tempo 3 × 10 sedí.") => async () => ({ text: JSON.stringify({ name: "Tempo 3×10", reason, blocks }) });
// 45 min: 10 warm-up, 3 × (8 tempo + 3 easy), 2 cool-down.
const tempo45 = [block(600, 55, 65), { repeats: 3, steps: [{ label: "tempo", seconds: 480, low: 80, high: 85 }, { label: "lehce", seconds: 180, low: 50, high: 55 }] }, block(120, 50, 55)];
const day = { sport: "ride", kind: "tempo", minutes: 45, coach: { readiness: { status: "yellow", score: 64 } } };

test("a poor fit is another type or a low suitability", () => {
  assert.equal(poorFit({ primary_system: "tempo", suitability: COMPOSE_BELOW }, { kind: "tempo" }), false);
  assert.equal(poorFit({ primary_system: "tempo", suitability: COMPOSE_BELOW - 1 }, { kind: "tempo" }), true);
  assert.equal(poorFit({ primary_system: "anaerobic", suitability: 95 }, { kind: "vo2" }), true);
  assert.equal(poorFit({ primary_system: "vo2max", suitability: 95 }, { kind: "vo2" }), false);
  assert.equal(poorFit({ primary_system: "threshold", suitability: 90 }, { sport: "run", kind: "sweet_spot" }), false);
});

test("the AI's workout is saved and loads again for planning", async () => {
  const env = owner();
  const w = await composeWorkout(env, { ...day, ask: answer(tempo45) });
  assert.ok(w, "a valid workout is kept");
  assert.match(w.id, /^ai-[A-Za-z0-9]{10}$/);
  assert.equal(w.primary_system, "tempo");
  assert.equal(w.duration_minutes, 45);
  assert.equal(w.ai.reason, "Připravenost 74: tempo 3 × 10 sedí.");
  const again = await getWorkout(env.DB, w.id);
  assert.equal(again.name, "Tempo 3×10");
  assert.equal(again.duration_minutes, 45);
  assert.equal((await getWorkout(env.DB, w.id + "~60")).duration_minutes, 60);
});

test("a workout that breaks the limits, no consent or a failure gives nothing", async () => {
  const env = owner();
  const longer = [block(600, 55, 65), { repeats: 4, steps: [{ label: "tempo", seconds: 600, low: 80, high: 85 }, { label: "lehce", seconds: 180, low: 50, high: 55 }] }, block(300, 50, 55)];
  assert.equal(await composeWorkout(env, { ...day, ask: answer(longer) }), null, "too long");
  // 45 min with 24 minutes of VO2max: over the yellow morning's 20.
  const hard = [block(480, 55, 65), { repeats: 6, steps: [{ label: "VO2", seconds: 240, low: 110, high: 118 }, { label: "lehce", seconds: 120, low: 50, high: 55 }] }, block(60, 50, 55)];
  assert.equal(await composeWorkout(env, { ...day, kind: "vo2", ask: answer(hard) }), null, "over the yellow hard-minute cap");
  assert.ok(await composeWorkout(env, { ...day, kind: "vo2", coach: { readiness: { status: "green" } }, ask: answer(hard) }), "fine on a green morning");
  const easy = [block(2700, 60, 70)];
  assert.equal(await composeWorkout(env, { ...day, ask: answer(easy) }), null, "not the coach's type");
  assert.equal(await composeWorkout(env, { ...day, ask: answer(tempo45, "") }), null, "no reason");
  assert.equal(await composeWorkout(env, { ...day, ask: async () => { throw new Error("down"); } }), null);
  assert.equal(await composeWorkout({ ...env, USER_IS_OWNER: false }, { ...day, ask: answer(tempo45) }), null, "no AI consent");
  assert.equal(await composeWorkout({ ...env, OPENAI_API_KEY: "" }, { ...day, ask: answer(tempo45) }), null);
});
