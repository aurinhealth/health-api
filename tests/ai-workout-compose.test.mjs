// The AI's own ride or run (src/ai-workout-compose.js): only when the library
// fits the day poorly, and only a workout of the coach's type and length under
// the morning's hard-minute cap; it is kept and loads again as "ai-<id>".
import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { composeWorkout, poorFit, COMPOSE_BELOW, fewMatches, composeKey, composeWarning, composeFits } from "../src/ai-workout-compose.js";
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

// The library's search (Na míru od AI): the athlete's choice is the brief.
test("the search offers the AI's own workout when few of the chosen type are left", () => {
  const w = (primary_system) => ({ primary_system });
  assert.equal(fewMatches([w("vo2max"), w("threshold"), w("threshold")], "vo2max"), true);
  assert.equal(fewMatches([w("vo2max"), w("vo2max"), w("vo2max")], "vo2max"), false);
  assert.equal(fewMatches([w("tempo"), w("endurance"), w("recovery")], null), false, "any type when none is chosen");
  assert.equal(fewMatches([], null), true);
});

test("the athlete's choice passes a hard type on a worse morning, with a warning, and is written once", async () => {
  const env = owner(), hard = [block(480, 55, 65), { repeats: 6, steps: [{ label: "VO2", seconds: 240, low: 110, high: 118 }, { label: "lehce", seconds: 120, low: 50, high: 55 }] }, block(60, 50, 55)];
  let calls = 0, sent = null;
  const ask = async (_env, request) => { calls += 1; sent = request; return answer(hard)(); };
  const key = composeKey({ date: "2026-10-19", sport: "ride", environment: "indoor", kind: "vo2max", minutes: 45 });
  const w = await composeWorkout(env, { ...day, kind: "vo2max", asked: { key }, ask });
  assert.ok(w, "yellow morning, but the athlete chose it");
  assert.match(w.ai.warning, /střední/);
  assert.match(sent.input, /chosenByAthlete/);
  const again = await composeWorkout(env, { ...day, kind: "vo2max", asked: { key }, ask });
  assert.equal(again.id, w.id, "the same choice loads the same workout");
  assert.equal(calls, 1, "and is not paid for again");
  const other = await composeWorkout(env, { ...day, kind: "vo2max", asked: { key: composeKey({ date: "2026-10-19", sport: "ride", environment: "indoor", kind: "vo2max", minutes: 45, variant: 1 }) }, ask });
  assert.notEqual(other.id, w.id, "Jiný návrh writes another");
  assert.equal(composeWarning("endurance", "red"), null);
  assert.equal(composeWarning("vo2max", "green"), null);
});

test("the chosen difficulty band holds within one step", async () => {
  const env = owner(), w = await composeWorkout(env, { ...day, asked: {}, ask: answer(tempo45) });
  const d = w.difficulty;
  assert.ok(await composeWorkout(env, { ...day, asked: { minDifficulty: d - 0.5, maxDifficulty: d + 0.5 }, ask: answer(tempo45) }), "inside the band");
  assert.ok(await composeWorkout(env, { ...day, asked: { minDifficulty: d + 0.9, maxDifficulty: 10 }, ask: answer(tempo45) }), "one step below the band still passes");
  assert.equal(await composeWorkout(env, { ...day, asked: { minDifficulty: d + 1.5, maxDifficulty: 10 }, ask: answer(tempo45) }), null, "far below the band");
});

test("the evaluation composes with the model it is given and keeps nothing", async () => {
  const env = { OPENAI_API_KEY: "test" };
  let model = null;
  const w = await composeWorkout(env, { ...day, model: "gpt-6-sol", save: false, ask: async (_e, r) => { model = r.model; return { ...(await answer(tempo45)()), model: "gpt-6-sol" }; } });
  assert.equal(model, "gpt-6-sol");
  assert.equal(w.ai.model, "gpt-6-sol");
});

test("a draft under the chosen band is asked for once more, and the evaluation learns why a draft was rejected", async () => {
  const env = owner(), first = await composeWorkout(env, { ...day, asked: {}, ask: answer(tempo45) }), d = first.difficulty;
  // The second draft: one more tempo effort, inside the band the first draft missed.
  const harder = [block(300, 55, 65), { repeats: 4, steps: [{ label: "tempo", seconds: 480, low: 83, high: 88 }, { label: "lehce", seconds: 120, low: 50, high: 55 }] }, block(60, 50, 55)];
  const notes = [], ask = async (e, args) => { notes.push(args.instructions); return answer(notes.length > 1 ? harder : tempo45)(); };
  const w = await composeWorkout(env, { ...day, coach: { readiness: { status: "green" } }, asked: { minDifficulty: d + 0.7, maxDifficulty: 10 }, ask });
  assert.equal(notes.length, 2, "asked twice: one step under the band passes the checks but is still outside it");
  assert.match(notes[1], new RegExp(`rated ${d} .*under the chosen band`));
  assert.ok(w && w.difficulty > d, "the harder draft is kept");
  notes.length = 0;
  assert.ok(await composeWorkout(env, { ...day, coach: { readiness: { status: "green" } }, asked: { minDifficulty: d - 0.5, maxDifficulty: d + 0.5 }, ask }), "inside the band");
  assert.equal(notes.length, 1, "no second ask inside the band");
  assert.match((await composeWorkout(env, { ...day, ask: async () => { throw new Error("down"); }, diagnose: true })).rejected, /^error: down/);
  const r = await composeWorkout(env, { ...day, asked: { minDifficulty: d + 3, maxDifficulty: 10 }, ask: answer(tempo45), diagnose: true });
  assert.equal(r.rejected, `difficulty ${d}`);
  assert.equal(await composeWorkout(env, { ...day, asked: { minDifficulty: d + 3, maxDifficulty: 10 }, ask: answer(tempo45) }), null, "without diagnose still nothing");
  const longer = [block(600, 55, 65), { repeats: 3, steps: [{ label: "tempo", seconds: 480, low: 80, high: 85 }, { label: "lehce", seconds: 180, low: 50, high: 55 }] }, block(900, 50, 55)];
  assert.match((await composeWorkout(env, { ...day, ask: answer(longer), diagnose: true })).rejected, /^length \d+ min$/);
});

test("two efforts in a row without a recovery are rejected", async () => {
  const env = owner(), green = { ...day, kind: "vo2max", coach: { readiness: { status: "green" } } };
  const split = [block(480, 50, 75), block(240, 112, 118), { repeats: 4, steps: [{ label: "vo2", seconds: 240, low: 112, high: 118 }, { label: "lehce", seconds: 120, low: 45, high: 55 }] }, block(540, 45, 55)];
  assert.equal((await composeWorkout(env, { ...green, ask: answer(split), diagnose: true })).rejected, "efforts back to back");
  const whole = [block(480, 50, 75), { repeats: 5, steps: [{ label: "vo2", seconds: 240, low: 112, high: 118 }, { label: "lehce", seconds: 120, low: 45, high: 55 }] }, block(420, 45, 55)];
  assert.ok(await composeWorkout(env, { ...green, ask: answer(whole) }), "the same efforts in one repeat pass");
});
