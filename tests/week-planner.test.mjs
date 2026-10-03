import test from "node:test";
import assert from "node:assert/strict";
import { planWeekRoles, roleFor, sanitizeWeekPlan, saveWeekPlan, getWeekPlan, DEFAULT_LOCATION, weekTargets, targetFor } from "../src/week-planner.js";
import { rankWorkoutCandidates, CYCLING_WORKOUTS, defaultCapabilities } from "../src/workout-library.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { googleExerciseHeartRate, heartRateFromSamples } from "../src/index.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

// Úterý, čtvrtek, sobota, neděle kolo; pondělí, středa, sobota posilovna.
const example = [["gym"], ["ride"], ["gym"], ["ride"], [], ["ride", "gym"], ["ride"]];
const roleOf = (roles, day, sport) => roles[day].items.find(x => x.sport === sport)?.role;

test("the weekly planner spreads long, quality and easy days over the chosen days", () => {
  const roles = planWeekRoles(example);
  assert.equal(roleOf(roles, 6, "ride"), "long", "Sunday without gym gets the long ride");
  assert.equal(roleOf(roles, 1, "ride"), "quality");
  assert.equal(roleOf(roles, 3, "ride"), "quality");
  assert.equal(roleOf(roles, 5, "ride"), "endurance");
  // Gym the day before intervals is upper body; Saturday gym before a long easy ride may train legs.
  assert.equal(roleOf(roles, 0, "gym"), "gym_upper");
  assert.equal(roleOf(roles, 2, "gym"), "gym_upper");
  assert.equal(roleOf(roles, 5, "gym"), "gym_full");
  assert.deepEqual(roles[4].items, []);
});

test("quality days are never on neighbouring days and readiness limits them", () => {
  const every = Array.from({ length: 7 }, () => ["ride"]);
  const roles = planWeekRoles(every), quality = roles.filter(d => d.items[0].role === "quality").map(d => d.weekday);
  assert.equal(quality.length, 2);
  assert.ok(Math.abs(quality[0] - quality[1]) >= 2);
  assert.equal(planWeekRoles(every, { readiness: "red" }).filter(d => d.items[0].role === "quality").length, 0);
  // The day after quality is easy.
  for (const q of quality) if (q < 6 && roles[q + 1].items[0].role !== "long") assert.equal(roles[q + 1].items[0].role, "recovery");
});

test("several activities on one day: the second endurance sport stays easy", () => {
  const roles = planWeekRoles([["ride", "run", "gym"], [], [], [], [], [], []]);
  assert.deepEqual(roles[0].items.map(x => x.sport), ["ride", "run", "gym"]);
  assert.equal(roles[0].items[1].role, "recovery");
});

test("roleFor maps a date to its weekday role", () => {
  const prefs = sanitizeWeekPlan({ days: example });
  assert.equal(roleFor(prefs, "2026-10-04", "ride").role, "long"); // neděle
  assert.equal(roleFor(prefs, "2026-10-04", "ride").focus, "long_endurance");
  assert.equal(roleFor(prefs, "2026-10-02", "ride"), null); // pátek bez kola
});

test("week plan preferences are sanitised and stored per user", async () => {
  const raw = createD1(), a = scopedDb(raw, 1), b = scopedDb(raw, 2);
  assert.deepEqual(sanitizeWeekPlan({ days: [["ride", "swim"]], location: { latitude: 999 } }).days[0], ["ride"]);
  assert.deepEqual(sanitizeWeekPlan({}).location, DEFAULT_LOCATION);
  await saveWeekPlan(a, { days: example, location: { name: "Praha", latitude: 50.0755, longitude: 14.4378 } });
  assert.equal((await getWeekPlan(a)).location.name, "Praha");
  assert.deepEqual((await getWeekPlan(a)).days[5], ["ride", "gym"]);
  assert.deepEqual((await getWeekPlan(b)).days, [[], [], [], [], [], [], []]);
});

test("the planner's easy role keeps the coach off intensity", () => {
  const coach = buildCyclingCoachV2({ date: "2026-10-01", goal: { focus: "recovery" } });
  assert.equal(coach.recommendation.session.kind, "recovery");
  // Without data the readiness is red, so a long day falls back to plain endurance – never intervals.
  const long = buildCyclingCoachV2({ date: "2026-10-01", goal: { focus: "long_endurance" } });
  assert.ok(["long_endurance", "endurance"].includes(long.recommendation.session.kind));
});

test("suitability is a share of the points the active filters can give", () => {
  const ranked = rankWorkoutCandidates(CYCLING_WORKOUTS, { durationMinutes: 90, durationTolerance: 15 }, { readiness: "green" }, defaultCapabilities());
  // Without a type and load filter the best match used to stop around 63–70 %.
  assert.ok(ranked[0].suitability >= 90, String(ranked[0].suitability));
  assert.ok(ranked.every(w => w.suitability <= 100));
});

test("Google exercise heart rate comes from the summary or from samples", () => {
  assert.equal(googleExerciseHeartRate({ averageHeartRateBeatsPerMinute: 104.4 }), 104);
  assert.equal(googleExerciseHeartRate({ caloriesKcal: 80 }), null);
  assert.equal(googleExerciseHeartRate({ averageHeartRateVariabilityMilliseconds: 50 }), null);
  const walk = { start: "2026-10-01T08:00:00Z", end: "2026-10-01T08:30:00Z" };
  const samples = [["08:05", 98], ["08:10", 102], ["08:20", 100], ["09:00", 150]].map(([t, v]) => ({ sample_time: "2026-10-01T" + t + ":00Z", value_numeric: v }));
  assert.equal(heartRateFromSamples(walk, samples), 100);
  assert.equal(heartRateFromSamples(walk, samples.slice(0, 2)), null);
});

test("week targets: after a heavy week the rest is a recovery week with a sensible ride", () => {
  // Pá gym, So kolo, Ne gym; Po–St hotovo 128 TSS; minulý týden 715 TSS při CTL 69.
  const days = [["2026-09-28", 30, ["gym"]], ["2026-09-29", 47, ["ride"]], ["2026-09-30", 51, ["ride"]]].map(([date, done, sports]) => ({ date, done, planned: 0, sports }));
  const t = weekTargets({ roles: planWeekRoles([[], [], [], [], ["gym"], ["ride"], ["gym"]]), ctl: 69, lastWeekLoad: 715, days, today: "2026-10-01", weekStart: "2026-09-28" });
  assert.equal(t.recovery, true);
  assert.equal(t.target, Math.round(483 * .7));
  const ride = targetFor(t, "2026-10-03", "ride");
  assert.ok(ride.tss < 120 && ride.minutes >= 90 && ride.minutes <= 150, JSON.stringify(ride));
  assert.equal(t.shortfall, 0);
});

test("week targets: done or planned sessions count first and one ride never carries the week", () => {
  const roles = planWeekRoles([[], [], [], [], [], ["ride"], []]);
  const t = weekTargets({ roles, ctl: 70, lastWeekLoad: 450, days: [], today: "2026-09-28", weekStart: "2026-09-28" });
  const ride = targetFor(t, "2026-10-03", "ride");
  assert.ok(ride.tss <= 70 * 1.6 + 1, String(ride.tss));
  assert.ok(t.shortfall > 0, "a missing day is reported instead");
  // A ride already planned in Intervals.icu on that day is not a second target.
  const planned = weekTargets({ roles, ctl: 70, lastWeekLoad: 450, days: [{ date: "2026-10-03", done: 0, planned: 120, sports: ["ride"] }], today: "2026-09-28", weekStart: "2026-09-28" });
  assert.equal(targetFor(planned, "2026-10-03", "ride"), null);
  assert.equal(weekTargets({ roles, ctl: null }).status, "no_fitness");
});

test("the nightly gym plan follows the week plan and keeps an existing plan", async () => {
  const { createD1 } = await import("./helpers/d1.mjs");
  const { scopedDb } = await import("../src/tenancy.js");
  const { saveWeekPlan, nightlyGymSkip } = await import("../src/week-planner.js");
  const { saveGymPlan } = await import("../src/gym-plan-store.js");
  const db = scopedDb(createD1(), 7);
  assert.equal(await nightlyGymSkip(db, "2026-10-03"), null); // no week plan yet: old behaviour
  await saveWeekPlan(db, { days: [["gym"], ["ride"], [], ["gym"], ["ride"], ["ride"], ["ride"]] });
  assert.match(await nightlyGymSkip(db, "2026-10-03"), /není tento den gym/); // Saturday: ride
  assert.equal(await nightlyGymSkip(db, "2026-10-05"), null); // Monday: gym
  await saveGymPlan(db, "2026-10-05", [["x"]]);
  assert.match(await nightlyGymSkip(db, "2026-10-05"), /už gym plán je/);
});
