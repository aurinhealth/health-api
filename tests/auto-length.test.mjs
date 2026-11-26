import test from "node:test";
import assert from "node:assert/strict";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { explainWorkout, structureHow } from "../src/workout-explanation.js";
import { CYCLING_WORKOUTS } from "../src/workout-library.js";
import { renderForEnvironment } from "../src/workout-model.js";

const week = days => ({ days: days.map(([date, planned = [], completed = []]) => ({ date, daily: { training: { planned, completed } } })) });
const ride = (date, hours, extra = {}) => [date, [], [{ type: "Ride", name: "Endurance", durationHours: hours, tss: Math.round(hours * 50), ...extra }]];
const fitness = { wellness: [{ id: "2026-10-01", ctl: 55, atl: 50 }, { id: "2026-10-03", ctl: 55, atl: 50 }] };
const health = date => ({ sleep: [{ type: "sleep", durationMin: 480, endTime: date + "T06:30:00" }] });
// Last week 3 rides, this week 3 rides of similar load (not a recovery week).
const history = [ride("2026-09-22", 1.5), ride("2026-09-24", 1.25), ride("2026-09-26", 2), ride("2026-09-28", 1.5), ride("2026-09-29", 1.25), ride("2026-09-30", 1.5)];

const sleep = (date, minutes = 480) => ({ sleep: [{ type: "sleep", durationMin: minutes, endTime: date + "T06:30:00" }] });
const coach = (opts = {}) => buildCyclingCoachV2({ date: "2026-10-01", week: week(history), fitness: { wellness: [{ id: "2026-10-01", ctl: opts.ctl ?? 55, atl: opts.atl ?? 53 }] }, health: sleep("2026-10-01", opts.sleep), ...opts.extra });

test("no time and no plan: length is estimated from CTL, with the reasons", () => {
  const c = coach();
  assert.equal(c.constraints.autoLength, true);
  assert.equal(c.constraints.capacityMinutes, 99); // 55·7·1.05 = 404 TSS / 5 days = 81 TSS / 49 TSS/h
  assert.match(c.rationale.at(-1), /^Délka \d+ min: kondice CTL 55: týdenní cíl 404 TSS na 5 tréninkových dní ≈ 81 TSS/);
});

test("a CTL ramp above 8 a week holds the load instead of raising it (Friel)", () => {
  const steep = buildCyclingCoachV2({ date: "2026-10-01", week: week(history), fitness: { wellness: [{ id: "2026-10-01", ctl: 55, atl: 53, rampRate: 9 }] }, health: sleep("2026-10-01") });
  assert.equal(steep.constraints.capacityMinutes, 94);
  assert.match(steep.rationale.at(-1), /CTL roste o 9 za týden, nad 8 zátěž jen držím/);
});

test("fitness, sleep and form change the length; any day can be a long ride", () => {
  const fit = coach({ ctl: 85, atl: 75 }), tired = coach({ ctl: 85, atl: 115 }), shortSleep = coach({ ctl: 85, atl: 75, sleep: 330 });
  assert.ok(fit.constraints.capacityMinutes > coach().constraints.capacityMinutes);
  assert.ok(tired.constraints.capacityMinutes < fit.constraints.capacityMinutes);
  assert.ok(shortSleep.constraints.capacityMinutes < fit.constraints.capacityMinutes);
  assert.match(shortSleep.rationale.at(-1), /spánek pod 6 h −20 %/);
  // A fresh, fit athlete on a Thursday after two quality days: a long aerobic ride.
  const hard = [ride("2026-09-28", 1.5, { name: "Threshold" }), ride("2026-09-29", 2, { name: "VO2max" }), ride("2026-09-30", 2)];
  const long = buildCyclingCoachV2({ date: "2026-10-01", week: week([...history.slice(0, 3), ...hard]), fitness: { wellness: [{ id: "2026-10-01", ctl: 95, atl: 85 }] }, health: sleep("2026-10-01") });
  assert.equal(long.week.recoveryWeek, false);
  assert.equal(long.recommendation.session.kind, "long_endurance");
  assert.ok(long.constraints.availableMinutes >= 150);
  // Recovery week and an explicit time.
  const heavy = [ride("2026-09-22", 3, { tss: 200 }), ride("2026-09-24", 3, { tss: 200 }), ride("2026-09-26", 3, { tss: 200 }), ride("2026-09-29", 1, { tss: 40 })];
  const recovery = buildCyclingCoachV2({ date: "2026-10-01", week: week(heavy), fitness: { wellness: [{ id: "2026-10-01", ctl: 55, atl: 50 }] }, health: sleep("2026-10-01") });
  assert.equal(recovery.week.recoveryWeek, true);
  assert.match(recovery.rationale.at(-1), /regenerační týden −30 %/);
  const fixed = coach({ extra: { availabilityMinutes: 180 } });
  assert.equal(fixed.constraints.availableMinutes, 180);
  assert.equal(fixed.constraints.autoLength, false);
});

test("without CTL a default length is used", () => {
  const c = buildCyclingCoachV2({ date: "2026-10-01", week: week([]) });
  assert.match(c.rationale.at(-1), /CTL\) zatím neznám/);
});

test("advice describes the actual main set with watts", () => {
  const ss = renderForEnvironment(CYCLING_WORKOUTS.find(w => w.id === "pfd-ss-3x12-90"), "outdoor");
  const x = explainWorkout(ss, { environment: "outdoor", thresholds: { ftp: 260 } });
  assert.match(x.how.join(" "), /3× 12 min na 91 % FTP \(≈ 237 W\)/);
  assert.match(x.environment[0], /12 min nerušené jízdy/);
  assert.match(x.fueling.at(-1), /~90 g sacharidů/);
  const r = renderForEnvironment(CYCLING_WORKOUTS.find(w => w.id === "research-ronnestad-30-15"), "indoor");
  assert.match(structureHow(JSON.parse(r.structure_json), { system: "vo2max", ftp: 260 })[0], /3 série: 13× 30 s na 120 % FTP \(≈ 312 W\) \/ 15 s lehce/);
  const a = explainWorkout(renderForEnvironment(CYCLING_WORKOUTS.find(w => w.id === "pfd-vo2-5x4x112-75"), "indoor"), { thresholds: { ftp: 260 } });
  assert.notEqual(a.how.join(), x.how.join());
});

import { resizeWorkout, generateWorkout, getWorkout, RUNNING_WORKOUTS } from "../src/workout-library.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

test("changing the length keeps the main set and hits the length", () => {
  const ss = CYCLING_WORKOUTS.find(w => w.id === "pfd-ss-3x12-90");
  const longer = resizeWorkout(ss, 180);
  assert.equal(longer.duration_minutes, 180);
  assert.equal(longer.work_minutes, ss.work_minutes);
  const research = CYCLING_WORKOUTS.find(w => w.id === "research-ronnestad-30-15");
  const r = resizeWorkout(research, 150);
  assert.equal(r.id, "research-ronnestad-30-15~150");
  assert.equal(r.duration_minutes, 150);
  assert.equal(r.work_minutes, research.work_minutes);
  assert.match(r.resize_notes.join(), /aerobní blok před hlavní sérií/);
  const shorter = resizeWorkout(RUNNING_WORKOUTS.find(w => w.id === "run-cruise-4x8-60"), 40);
  assert.equal(shorter.duration_minutes, 40);
  assert.match(shorter.resize_notes.join(), /méně opakování \(4 → \d\)/);
});

test("a resized proposal can be loaded again by its id and explains the change", async () => {
  const db = scopedDb(createD1(), 1);
  assert.equal((await getWorkout(db, "research-ronnestad-30-15~150")).duration_minutes, 150);
  const r = await generateWorkout(db, { sport: "ride", environment: "outdoor", date: "2026-10-01", workoutId: "research-ronnestad-30-15~120", resizeTo: 180, thresholds: { ftp: 260 } });
  // Outdoor adds warm-up, so the stored length is shorter and the ridden length is 180.
  assert.match(r.workout.id, /^research-ronnestad-30-15~1\d\d$/);
  assert.equal(r.workout.environment, "outdoor");
  assert.equal(r.workout.duration_minutes, 180);
  assert.match(r.explanation.why[0], /^Délku jsem změnil z 66 na 180 min – princip tréninku zůstává/);
});
