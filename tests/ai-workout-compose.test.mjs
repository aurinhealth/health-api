// The AI's own ride or run (src/ai-workout-compose.js): only when the library
// fits the day poorly, and only a workout of the coach's type and length under
// the morning's hard-minute cap; it is kept and loads again as "ai-<id>".
import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { composeWorkout, dailyOwnWorkout, coachFirst, poorFit, COMPOSE_BELOW, fewMatches, composeKey, composeWarning, composeFits } from "../src/ai-workout-compose.js";
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

test("a workout that breaks the limits twice comes from the library; no consent or a failure gives nothing", async () => {
  const env = owner(), none = async () => null;
  const longer = [block(600, 55, 65), { repeats: 4, steps: [{ label: "tempo", seconds: 600, low: 80, high: 85 }, { label: "lehce", seconds: 180, low: 50, high: 55 }] }, block(300, 50, 55)];
  const fromLibrary = w => { assert.ok(w?.ai?.fallback, "a library workout"); assert.equal(w.duration_minutes, 45); assert.equal(w.primary_system, "tempo"); assert.doesNotMatch(w.id, /^ai-/); return w; };
  assert.match(fromLibrary(await composeWorkout(env, { ...day, ask: answer(longer) })).ai.tried, /^length \d+ min$/, "too long, twice");
  assert.equal(await composeWorkout(env, { ...day, ask: answer(longer), fallback: none }), null, "too long and no library");
  // 45 min with 24 minutes of VO2max: over the yellow morning's 20.
  const hard = [block(600, 55, 65), { repeats: 6, steps: [{ label: "VO2", seconds: 240, low: 110, high: 118 }, { label: "lehce", seconds: 120, low: 50, high: 55 }] }, block(60, 50, 55)];
  const capped = await composeWorkout(env, { ...day, kind: "vo2", ask: answer(hard) });
  assert.ok(capped.ai.fallback && capped.primary_system === "vo2max", "over the yellow hard-minute cap: the library's");
  assert.ok(!(await composeWorkout(env, { ...day, kind: "vo2", coach: { readiness: { status: "green" } }, ask: answer(hard) })).ai.fallback, "fine on a green morning");
  const easy = [block(2700, 60, 70)];
  assert.equal((await composeWorkout(env, { ...day, ask: answer(easy), fallback: none, diagnose: true })).rejected, "type endurance", "not the coach's type");
  assert.equal((await composeWorkout(env, { ...day, ask: answer(tempo45, ""), fallback: none, diagnose: true })).rejected, "reason", "no reason");
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
  const env = owner(), hard = [block(600, 55, 65), { repeats: 6, steps: [{ label: "VO2", seconds: 240, low: 110, high: 118 }, { label: "lehce", seconds: 120, low: 50, high: 55 }] }, block(60, 50, 55)];
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

test("a draft outside the band is asked for once more with the reason; two misses give the library's workout", async () => {
  const env = owner(), none = async () => null, first = await composeWorkout(env, { ...day, asked: {}, ask: answer(tempo45) }), d = first.difficulty;
  // The second draft: one more tempo effort, inside the band the first draft missed.
  const harder = [block(300, 55, 65), { repeats: 4, steps: [{ label: "tempo", seconds: 480, low: 83, high: 88 }, { label: "lehce", seconds: 120, low: 50, high: 55 }] }, block(60, 50, 55)];
  const notes = [], ask = async (e, args) => { notes.push(args.instructions); return answer(notes.length > 1 ? harder : tempo45)(); };
  const w = await composeWorkout(env, { ...day, coach: { readiness: { status: "green" } }, asked: { minDifficulty: d + 0.7, maxDifficulty: 10 }, ask });
  assert.equal(notes.length, 2, "asked twice: one step under the band passes the checks but is still outside it");
  assert.match(notes[1], new RegExp(`rejected: difficulty ${d} \\(wanted ${d + 0.7}–10 .*add an effort`));
  assert.ok(w && !w.ai.fallback && w.difficulty > d, "the second draft is kept");
  notes.length = 0;
  assert.ok(await composeWorkout(env, { ...day, coach: { readiness: { status: "green" } }, asked: { minDifficulty: d - 0.5, maxDifficulty: d + 0.5 }, ask }), "inside the band");
  assert.equal(notes.length, 1, "no second ask inside the band");
  assert.match((await composeWorkout(env, { ...day, ask: async () => { throw new Error("down"); }, diagnose: true })).rejected, /^error: down/);
  // Both drafts under the band (4 for 4.5–10): the library's tempo workout inside it (its hardest at 45 min is 4.9).
  const twice = await composeWorkout(env, { ...day, coach: { readiness: { status: "green" } }, asked: { minDifficulty: 4.5, maxDifficulty: 10 }, ask: answer(tempo45) });
  assert.ok(twice?.ai?.fallback, "from the library");
  assert.ok(twice.difficulty >= 4.5 && twice.difficulty <= 10 && twice.primary_system === "tempo" && Math.abs(twice.duration_minutes - 45) <= 5, JSON.stringify([twice.id, twice.difficulty, twice.duration_minutes]));
  assert.equal(twice.ai.tried, `difficulty ${d}`);
  const r = await composeWorkout(env, { ...day, asked: { minDifficulty: d + 3, maxDifficulty: 10 }, ask: answer(tempo45), diagnose: true, fallback: none });
  assert.equal(r.rejected, `difficulty ${d}`);
  assert.equal(await composeWorkout(env, { ...day, asked: { minDifficulty: d + 3, maxDifficulty: 10 }, ask: answer(tempo45), fallback: none }), null, "without diagnose and without a library still nothing");
  const longer = [block(600, 55, 65), { repeats: 3, steps: [{ label: "tempo", seconds: 480, low: 80, high: 85 }, { label: "lehce", seconds: 180, low: 50, high: 55 }] }, block(900, 50, 55)];
  assert.match((await composeWorkout(env, { ...day, ask: answer(longer), diagnose: true, fallback: none })).rejected, /^length \d+ min$/);
});

test("two efforts in a row without a recovery are rejected", async () => {
  const env = owner(), green = { ...day, kind: "vo2max", coach: { readiness: { status: "green" } } };
  const split = [block(600, 50, 75), block(240, 112, 118), { repeats: 4, steps: [{ label: "vo2", seconds: 240, low: 112, high: 118 }, { label: "lehce", seconds: 120, low: 45, high: 55 }] }, block(420, 45, 55)];
  assert.equal((await composeWorkout(env, { ...green, ask: answer(split), diagnose: true, fallback: async () => null })).rejected, "efforts back to back");
  assert.ok((await composeWorkout(env, { ...green, ask: answer(split) })).ai.fallback, "the library's VO2max instead");
  const whole = [block(600, 50, 75), { repeats: 5, steps: [{ label: "vo2", seconds: 240, low: 112, high: 118 }, { label: "lehce", seconds: 120, low: 45, high: 55 }] }, block(300, 50, 55)];
  assert.ok(await composeWorkout(env, { ...green, ask: answer(whole) }), "the same efforts in one repeat pass");
});

// Coach evaluation runs 35, 38 and 41: "VO2max 5×4, 45 min" with 7 min of warm-up.
test("a hard workout needs 10 easy minutes before its first effort; an easier one does not", async () => {
  const env = owner(), green = { ...day, kind: "vo2max", coach: { readiness: { status: "green" } } };
  const short = [block(420, 50, 75), { repeats: 5, steps: [{ label: "vo2", seconds: 240, low: 112, high: 118 }, { label: "lehce", seconds: 120, low: 45, high: 55 }] }, block(480, 45, 55)];
  assert.equal((await composeWorkout(env, { ...green, ask: answer(short), diagnose: true, fallback: async () => null })).rejected, "warm-up 7 min");
  assert.ok((await composeWorkout(env, { ...green, ask: answer(short) })).ai.fallback, "the library's VO2max instead");
  // A tempo ride may start sooner: the check is for threshold and harder.
  const tempo = [block(300, 55, 65), { repeats: 3, steps: [{ label: "tempo", seconds: 600, low: 80, high: 85 }, { label: "lehce", seconds: 180, low: 50, high: 55 }] }, block(60, 50, 55)];
  assert.ok(!(await composeWorkout(env, { ...day, ask: answer(tempo) })).ai.fallback);
});

test("a draft the editor refuses (a step under 30 %) is asked for once more and then comes from the library, not nothing (runs 44/45, W01)", async () => {
  const env = owner(), none = async () => null;
  const zero = [block(600, 55, 65), { repeats: 3, steps: [{ label: "tempo", seconds: 480, low: 80, high: 85 }, { label: "stát", seconds: 180, low: 0, high: 0 }] }, block(120, 50, 55)];
  const notes = [], ask = async (e, args) => { notes.push(args.instructions); return answer(notes.length > 1 ? tempo45 : zero)(); };
  const w = await composeWorkout(env, { ...day, ask });
  assert.equal(notes.length, 2, "asked once more");
  assert.match(notes[1], /rejected: invalid .*30.*200/);
  assert.ok(w && w.ai.composed && !w.ai.fallback, "the second draft is kept");
  const twice = await composeWorkout(env, { ...day, ask: answer(zero) });
  assert.ok(twice?.ai?.fallback && twice.primary_system === "tempo", "twice refused: the library's");
  assert.match(twice.ai.tried, /^invalid /);
  assert.match((await composeWorkout(env, { ...day, ask: answer(zero), fallback: none, diagnose: true })).rejected, /^invalid /);
  assert.equal(await composeWorkout(env, { ...day, ask: answer(zero), fallback: none }), null);
  const banded = await composeWorkout(env, { ...day, coach: { readiness: { status: "green" } }, asked: { minDifficulty: 4.5, maxDifficulty: 10 }, ask: answer(zero) });
  assert.ok(banded?.ai?.fallback && !/difficulty/.test(banded.ai.tried), "no difficulty for a refused draft");
});

// The library thread's critic, 2026-11-16: on today's proposal a draft refused
// twice gave the library workout nearest in length, which replaced the ranked
// pick and skipped aiWorkoutPick. Now the ranked pick stays.
test("today's proposal: a draft refused twice keeps the ranked pick, with one log line and no health data", async () => {
  const env = owner(), logs = [], log = console.log;
  console.log = line => logs.push(line);
  const longer = [block(600, 55, 65), { repeats: 4, steps: [{ label: "tempo", seconds: 600, low: 80, high: 85 }, { label: "lehce", seconds: 180, low: 50, high: 55 }] }, block(300, 50, 55)];
  const poor = { primary_system: "tempo", suitability: COMPOSE_BELOW - 10 }, good = { primary_system: "tempo", suitability: 95 };
  let fallbacks = 0, asks = 0;
  const ask = async () => { asks++; return answer(longer)(); };
  try {
    const refused = await dailyOwnWorkout(env, poor, { ...day, ask, fallback: async () => { fallbacks++; return { id: "lib" }; } });
    assert.equal(refused.workout, null, "nothing from the library: the caller keeps its ranked pick");
    assert.equal(refused.poorFit, true);
    assert.match(refused.rejected, /^length \d+ min$/);
    assert.equal(asks, 2, "asked twice");
    assert.equal(fallbacks, 0, "the library fallback is never asked");
    const composed = await dailyOwnWorkout(env, poor, { ...day, ask: answer(tempo45) });
    assert.ok(composed.workout?.ai?.composed && !composed.workout.ai.fallback);
    asks = 0;
    const kept = await dailyOwnWorkout(env, good, { ...day, ask });
    assert.equal(kept.workout, null); assert.equal(kept.poorFit, false); assert.equal(asks, 0, "a good fit asks nothing");
    const skipped = await dailyOwnWorkout({ ...env, OPENAI_API_KEY: "" }, poor, { ...day, ask });
    assert.equal(skipped.workout, null);
    const failed = await dailyOwnWorkout(env, poor, { ...day, ask: async () => { throw new Error("AI time for this answer is spent"); } });
    assert.equal(failed.workout, null);
    // 24 min of VO2max over the yellow morning's 20, twice: the cap (20) would tell the readiness.
    const hard = [block(600, 55, 65), { repeats: 6, steps: [{ label: "VO2", seconds: 240, low: 110, high: 118 }, { label: "lehce", seconds: 120, low: 50, high: 55 }] }, block(60, 50, 55)];
    await dailyOwnWorkout(env, { primary_system: "vo2max", suitability: 50 }, { ...day, kind: "vo2", ask: answer(hard) });
  } finally { console.log = log; }
  const lines = logs.map(l => JSON.parse(l)).filter(l => l.daily_compose);
  assert.deepEqual(lines.map(l => l.daily_compose), ["rejected", "composed", "library", "skipped", "error", "rejected"]);
  assert.deepEqual(Object.keys(lines[0]).sort(), ["daily_compose", "rejected", "sport", "type"]);
  assert.equal(lines[0].rejected, "length");
  assert.equal(lines[4].rejected, undefined, "no error text");
  assert.equal(lines[5].rejected, "hard", "the check's name, not its cap");
  for (const l of lines) assert.doesNotMatch(JSON.stringify(l), /yellow|(?<!vo)\d|readiness|score|sleep|spent/);
});

// Step 2 (COACH_FIRST): the AI writes first only where the coaches let it.
test("coach first: easy and tempo days for everyone with a threshold, harder only for the experienced on a green morning", () => {
  const green = { readiness: { status: "green" }, constraints: {} }, ftp = { ftp: 250 }, pace = { runThresholdPace: "4:30" };
  assert.equal(coachFirst({ sport: "ride", kind: "sweet_spot", minutes: 75, coach: green, thresholds: ftp }), null);
  assert.equal(coachFirst({ sport: "ride", kind: "endurance", minutes: 120, coach: green, thresholds: ftp }), null);
  assert.equal(coachFirst({ sport: "ride", kind: "endurance", minutes: 150, coach: green, thresholds: ftp }), "long");
  assert.equal(coachFirst({ sport: "ride", kind: "vo2", minutes: 60, coach: green, thresholds: ftp }), "hard type");
  assert.equal(coachFirst({ sport: "ride", kind: "vo2", minutes: 60, coach: green, thresholds: ftp, experience: "experienced" }), null);
  assert.equal(coachFirst({ sport: "ride", kind: "openers", minutes: 45, coach: green, thresholds: ftp, experience: "experienced" }), "race");
  assert.equal(coachFirst({ sport: "ride", kind: "vo2", minutes: 60, coach: { ...green, readiness: { status: "yellow" } }, thresholds: ftp, experience: "experienced" }), "hard type");
  assert.equal(coachFirst({ sport: "ride", kind: "tempo", minutes: 60, coach: green, thresholds: {} }), "no threshold");
  const base = { longestRun30: 70, runs8w: 20, weeksWith2Runs: 6, longestBreak28: 4, last7Minutes: 150 };
  assert.equal(coachFirst({ sport: "run", kind: "endurance", minutes: 45, coach: green, thresholds: pace, runBase: base }), null);
  assert.equal(coachFirst({ sport: "run", kind: "endurance", minutes: 45, coach: green, thresholds: pace }), "run base", "no history read");
  for (const thin of [{ weeksWith2Runs: 2 }, { longestBreak28: 14 }, { runs8w: 11 }, { last7Minutes: 59 }])
    assert.equal(coachFirst({ sport: "run", kind: "endurance", minutes: 45, coach: green, thresholds: pace, runBase: { ...base, ...thin } }), "run base", JSON.stringify(thin));
  assert.equal(coachFirst({ sport: "run", kind: "endurance", minutes: 80, coach: green, thresholds: pace, runBase: base }), "long", "over 1.1× the longest run of 30 days (77 min)");
  assert.equal(coachFirst({ sport: "run", kind: "endurance", minutes: 75, coach: green, thresholds: pace, runBase: base }), null);
  assert.equal(coachFirst({ sport: "ride", kind: "tempo", minutes: 60, coach: { ...green, constraints: { lastHardDays: 1 } }, thresholds: ftp }), "hard yesterday");
  assert.equal(coachFirst({ sport: "ride", kind: "endurance", minutes: 60, coach: { ...green, constraints: { lastHardDays: 1 } }, thresholds: ftp }), null);
  assert.equal(coachFirst({ sport: "ride", kind: "tempo", minutes: 60, coach: { ...green, constraints: { lastHardDays: 2 } }, thresholds: ftp }), null);
  assert.equal(coachFirst({ sport: "run", kind: "endurance", minutes: 100, coach: green, thresholds: pace, runBase: { ...base, longestRun30: 120 } }), "long");
  assert.equal(coachFirst({ sport: "run", kind: "endurance", minutes: 45, coach: { ...green, constraints: { novice: true } }, thresholds: pace }), "novice");
  assert.equal(coachFirst({ sport: "run", kind: "endurance", minutes: 45, coach: { ...green, constraints: { returning: true } }, thresholds: pace }), "returning");
  assert.equal(coachFirst({ sport: "run", kind: "endurance", minutes: 45, coach: green, today: { feeling: "sick" }, thresholds: pace }), "sick");
  assert.equal(coachFirst({ sport: "ride", kind: "endurance", minutes: 60, coach: { ...green, constraints: { plannedToday: { name: "x" } } }, thresholds: ftp }), "planned");
});

test("coach first: off without the flag; on, a good library fit is still written by the AI, to the target difficulty ± 0.75", async () => {
  const env = owner(), good = { primary_system: "tempo", suitability: 95 }, seen = [];
  const coach = { readiness: { status: "green" }, constraints: {}, recommendation: { progression: { targetDifficulty: 4 } } };
  const ask = async (e, args) => { seen.push(JSON.parse(args.input.replace(/^[^{]*/, ""))); return answer(tempo45)(); };
  const log = console.log; console.log = () => {};
  try {
    assert.equal((await dailyOwnWorkout(env, good, { ...day, coach, ask, thresholds: { ftp: 250 } })).workout, null, "without COACH_FIRST the good fit stays");
    assert.equal(seen.length, 0);
    const on = { ...env, COACH_FIRST: "true" };
    const r = await dailyOwnWorkout(on, good, { ...day, coach, ask, thresholds: { ftp: 250 }, experience: "regular" });
    assert.equal(r.coachFirst, true);
    assert.deepEqual(seen[0].difficulty, { min: 3.3, max: 4.8, scale: "1–10" });
    assert.equal(seen[0].athleteLevel, "regular");
    const held = await dailyOwnWorkout(on, good, { ...day, coach: { ...coach, constraints: { novice: true } }, ask, thresholds: { ftp: 250 } });
    assert.equal(held.workout, null); assert.equal(held.held, "novice"); assert.equal(seen.length, seen.length);
  } finally { console.log = log; }
});

test("coach first: no band on endurance days, where the difficulty follows the minutes; the log says only held or yes", async () => {
  const seen = [], logs = [], orig = console.log;
  const env = { ...owner(), COACH_FIRST: "true" };
  const ask = async (e, args) => { seen.push(JSON.parse(args.input.replace(/^[^{]*/, ""))); return null; };
  const coach = { readiness: { status: "green" }, constraints: {}, recommendation: { progression: { targetDifficulty: 4.45 } } };
  console.log = l => logs.push(l);
  try {
    await dailyOwnWorkout(env, { suitability: 95, primary_system: "endurance", duration_minutes: 60 }, { sport: "ride", kind: "endurance", minutes: 60, coach, today: {}, ask, thresholds: { ftp: 250 }, experience: "experienced" });
    await dailyOwnWorkout(env, { suitability: 95, primary_system: "endurance", duration_minutes: 60 }, { sport: "ride", kind: "endurance", minutes: 60, coach, today: { feeling: "sick" }, ask, thresholds: { ftp: 250 } });
  } finally { console.log = orig; }
  assert.ok(seen.length >= 1 && seen.every(f => !f.difficulty), JSON.stringify(seen[0]));
  assert.ok(logs.every(l => !/sick|novice|returning/.test(l)), logs.join("\n"));
  assert.match(logs.at(-1), /"coach_first":"held"/);
});

test("checks: most of the work in the type's zone; long VO2max efforts need recoveries of at least half their length", async () => {
  const { workInZone, shortRecoveries, composeFaults } = await import("../src/ai-workout-compose.js");
  const sst = [{ durationMinutes: 10, power: 60 }, { repeats: 3, steps: [{ durationMinutes: 12, power: 91 }, { durationMinutes: 4, power: 50 }] }, { durationMinutes: 10, power: 50 }];
  assert.equal(workInZone(sst, "ride", "sweet_spot"), 1);
  const tooHigh = [{ durationMinutes: 10, power: 60 }, { repeats: 3, steps: [{ durationMinutes: 12, power: 98 }, { durationMinutes: 4, power: 50 }] }, { durationMinutes: 10, power: 50 }];
  assert.equal(workInZone(tooHigh, "ride", "sweet_spot"), 0, "threshold, not sweet spot");
  assert.equal(workInZone(sst, "ride", "endurance"), null);
  const vo2 = rec => [{ durationMinutes: 15, power: 60 }, { repeats: 4, steps: [{ durationMinutes: 4, power: 112 }, { durationMinutes: rec, power: 50 }] }, { durationMinutes: 10, power: 50 }];
  assert.equal(shortRecoveries(vo2(3), "ride"), false, "Helgerud 4×4 with 3 min");
  assert.equal(shortRecoveries(vo2(1.5), "ride"), true);
  const short = [{ durationMinutes: 15, power: 60 }, { repeats: 10, steps: [{ durationMinutes: 0.67, power: 120 }, { durationMinutes: 0.33, power: 50 }] }, { durationMinutes: 10, power: 50 }];
  assert.equal(shortRecoveries(short, "ride"), false, "40/20 is exempt");
  assert.deepEqual(composeFaults({ structure: vo2(1.5), sport: "ride", type: "vo2max", length: 47, cap: 45 }), ["recoveries shorter than efforts"]);
});
