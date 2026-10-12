import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseExerciseFeedback, saveExerciseFeedback, exercisePreferences, withoutDisliked, parseWorkoutRating, saveWorkoutRating, workoutRatings } from "../src/exercise-feedback.js";
import { generateStrengthPlan, FOCUS_GROUPS } from "../src/strength-generator.js";
import { gymAlternatives } from "../src/gym-catalog.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const context = () => ({ date: "2026-09-28", cycling: { recentRideTss: 100, recentRideHours: 2, recentActivities: [], nextRide: null }, recovery: {}, strength: { recentCompletedSets: [] } });
const workNames = plan => [...new Set(plan.rows.filter(r => r[0] === "WORK").map(r => r[1]))];

test("exercise feedback takes a thumb up, down or none, one or several", () => {
  assert.deepEqual(parseExerciseFeedback({ exercise: "Lat pulldown", liked: false }), [{ exercise: "Lat pulldown", liked: false }]);
  assert.deepEqual(parseExerciseFeedback({ items: [{ exercise: "DB curl", liked: true }, { exercise: "Hip thrust", liked: null }] }).map(i => i.liked), [true, null]);
  assert.throws(() => parseExerciseFeedback({ exercise: "", liked: true }));
  assert.throws(() => parseExerciseFeedback({ exercise: "DB curl", liked: "yes" }));
  assert.throws(() => parseExerciseFeedback({ items: [] }));
  assert.throws(() => parseExerciseFeedback({ items: Array.from({ length: 31 }, (_, i) => ({ exercise: "x" + i, liked: true })) }));
});

test("exercise preferences are stored per user and a null removes one", async () => {
  const raw = createD1(), db = scopedDb(raw, 3), other = scopedDb(raw, 4);
  assert.deepEqual(await exercisePreferences(db), { liked: [], disliked: [] }, "nothing before the first rating");
  await saveExerciseFeedback(db, { items: [{ exercise: "Lat pulldown", liked: false }, { exercise: "DB curl", liked: true }] });
  assert.deepEqual(await exercisePreferences(db), { liked: ["DB curl"], disliked: ["Lat pulldown"] });
  assert.deepEqual(await exercisePreferences(other), { liked: [], disliked: [] });
  await saveExerciseFeedback(db, { exercise: "Lat pulldown", liked: null });
  await saveExerciseFeedback(db, { exercise: "DB curl", liked: false });
  assert.deepEqual(await exercisePreferences(db), { liked: [], disliked: ["DB curl"] });
});

test("disliked candidates go unless nothing else is left", () => {
  assert.deepEqual(withoutDisliked(["a", "b"], ["a"]), ["b"]);
  assert.deepEqual(withoutDisliked(["a"], ["a"]), ["a"]);
  assert.deepEqual(withoutDisliked([{ ex: "a" }, { ex: "b" }], new Set(["b"]), x => x.ex), [{ ex: "a" }]);
  assert.deepEqual(withoutDisliked(["a", "b"], []), ["a", "b"]);
});

test("the generator leaves out disliked exercises and keeps the muscle trained", () => {
  const base = generateStrengthPlan(context(), { durationMinutes: 60 });
  const disliked = workNames(base).slice(0, 2);
  const plan = generateStrengthPlan(context(), { durationMinutes: 60, dislikedExercises: disliked });
  for (const name of disliked) assert.ok(!workNames(plan).includes(name), name);
  assert.equal(workNames(plan).length, workNames(base).length);
  // The group's best exercise disliked: the next one instead.
  const group = FOCUS_GROUPS.abs.exercises;
  const first = workNames(generateStrengthPlan(context(), { focusMuscles: ["abs"], durationMinutes: 30, maxExercises: 1 }))[0];
  const focused = generateStrengthPlan(context(), { focusMuscles: ["abs"], durationMinutes: 30, maxExercises: 1, dislikedExercises: [first] });
  assert.equal(workNames(focused).length, 1);
  assert.notEqual(workNames(focused)[0], first);
  const all = generateStrengthPlan(context(), { focusMuscles: ["abs"], durationMinutes: 30, maxExercises: 1, dislikedExercises: group });
  assert.equal(workNames(all).length, 1, "every option disliked: one is still used");
});

test("a liked exercise wins a close call", () => {
  const base = generateStrengthPlan(context(), { focusMuscles: ["biceps"], durationMinutes: 30, maxExercises: 1 });
  const other = FOCUS_GROUPS.biceps.exercises.find(name => !workNames(base).includes(name));
  const plan = generateStrengthPlan(context(), { focusMuscles: ["biceps"], durationMinutes: 30, maxExercises: 1, likedExercises: [other] });
  assert.equal(workNames(plan)[0], other);
});

test("alternatives skip disliked exercises while others fit", () => {
  const all = gymAlternatives("Lat pulldown", [], []).map(a => a.name);
  assert.ok(all.length > 1);
  const without = gymAlternatives("Lat pulldown", [], [], { disliked: [all[0]] }).map(a => a.name);
  assert.ok(!without.includes(all[0]));
  const liked = gymAlternatives("Lat pulldown", [], [], { liked: [all[1]] }).map(a => a.name);
  assert.equal(liked[0], all[1]);
});

test("a workout rating needs a date and good, ok or bad; the text is optional", () => {
  assert.deepEqual(parseWorkoutRating({ date: "2026-10-11", sport: "gym", rating: "good" }), { date: "2026-10-11", sessionId: "strength:2026-10-11", sport: "strength", rating: "good", text: null });
  assert.equal(parseWorkoutRating({ date: "2026-10-11", sport: "ride", rating: "bad", text: "  moc dlouhé  ", sessionId: "activity:i42" }).text, "moc dlouhé");
  assert.equal(parseWorkoutRating({ date: "2026-10-11", sport: "kayak", rating: "ok" }).sport, "other");
  assert.throws(() => parseWorkoutRating({ date: "11.10.2026", rating: "good" }));
  assert.throws(() => parseWorkoutRating({ date: "2026-10-11", rating: 5 }));
  assert.equal(parseWorkoutRating({ date: "2026-10-11", rating: "good", sessionId: "done:2026-10-11:Ranní jízda" }).sessionId, "done:2026-10-11:Rann_j_zda");
  assert.equal(parseWorkoutRating({ date: "2026-10-11", rating: "ok", text: "x".repeat(2000) }).text.length, 1000);
});

test("rating a session again replaces its rating", async () => {
  const db = scopedDb(createD1(), 3);
  assert.deepEqual(await workoutRatings(db, "2026-10-11"), []);
  await saveWorkoutRating(db, { date: "2026-10-11", sessionId: "gym:2026-10-11", sport: "strength", rating: "bad", text: "moc cviků" });
  await saveWorkoutRating(db, { date: "2026-10-11", sessionId: "gym:2026-10-11", sport: "strength", rating: "ok" });
  await saveWorkoutRating(db, { date: "2026-10-11", sessionId: "activity:i1", sport: "ride", rating: "good" });
  const list = await workoutRatings(db, "2026-10-11");
  assert.equal(list.length, 2);
  assert.deepEqual(list.find(r => r.sessionId === "gym:2026-10-11"), { date: "2026-10-11", sessionId: "gym:2026-10-11", sport: "strength", rating: "ok", text: null });
});

test("the feedback endpoints check sign-in and the origin, and the generator reads the thumbs", () => {
  const src = readFileSync(new URL("../src/routes-training.js", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("url.pathname==='/app/api/feedback/exercise'"), src.indexOf("// The threshold check and the training profile."));
  assert.match(block, /session\.signedIn/);
  assert.match(block, /request\.headers\.get\('Origin'\)!==url\.origin/);
  assert.match(block, /saveWorkoutRating\(env\.DB,body\)/);
  assert.match(block, /saveExerciseFeedback\(env\.DB,body\)/);
  const gateway = readFileSync(new URL("../src/strength-gateway.js", import.meta.url), "utf8");
  assert.match(gateway, /options\.dislikedExercises = taste\.disliked/);
  assert.match(readFileSync(new URL("../src/tenancy.js", import.meta.url), "utf8"), /exercise_preferences: \{\},\n {2}workout_ratings: \{\}/);
});
