import test from "node:test";
import assert from "node:assert/strict";
import { complianceBand, enduranceCompliance, gymCompliance, complianceSteps, complianceWord } from "../src/plan-compliance.js";
import { adherenceOf } from "../src/app-training.js";

test("the bands are the same both ways from the plan", () => {
  assert.deepEqual([40, 50, 69, 70, 84, 85, 100, 115, 116, 130, 131, 150, 151].map(complianceBand),
    ["way", "far", "far", "near", "near", "good", "good", "good", "near", "near", "far", "far", "way"]);
  assert.equal(complianceBand(null), null);
  assert.equal(complianceWord(140), "Výrazně víc");
  assert.equal(complianceWord(92), "Podle plánu");
});

test("a ride or run is measured by its load, then time, then distance", () => {
  const ride = enduranceCompliance({ tss: 73, durationHours: 68 / 60 }, { tss: 79, durationHours: 1 });
  assert.equal(ride.percent, 92);
  assert.equal(ride.basis, "tss");
  assert.deepEqual(ride.rows.map(r => [r.kind, r.percent]), [["tss", 92], ["time", 113]]);
  // No TSS on the plan: the time decides.
  assert.equal(enduranceCompliance({ tss: 60, durationHours: 1.5 }, { durationHours: 1 }).percent, 150);
  // Only a distance planned.
  const run = enduranceCompliance({ distance: 11400 }, { distance: 8000 });
  assert.deepEqual([run.percent, run.basis], [143, "distance"]);
  assert.equal(enduranceCompliance({ tss: 50 }, {}), null);
});

test("a gym session counts set by set against weight and rep range", () => {
  const set = (exercise, plannedKg, plannedReps, actualKg, actualReps, completed = true) => ({ type: "WORK", exercise, plannedKg, plannedReps, actualKg, actualReps, completed });
  const out = gymCompliance([
    set("Bench press", 80, "8", 80, 8), set("Bench press", 80, "8", 80, 8), set("Bench press", 80, "8", 80, 7), set("Bench press", 80, "8", 80, 7),
    // Within the 8–12 range is the plan: 12 reps is 100 %, not 150 %.
    set("Shyby", null, "8-12", null, 12), set("Shyby", null, "8-12", null, 13),
    set("Bicepsový zdvih", 15, "10", null, null, false), set("Bicepsový zdvih", 15, "10", null, null, false),
    { type: "WARMUP", exercise: "Bench press", plannedKg: 40, plannedReps: "10", actualKg: 40, actualReps: 10, completed: true }
  ]);
  const by = Object.fromEntries(out.exercises.map(e => [e.name, e]));
  assert.equal(by["Bench press"].percent, 94);
  assert.equal(by["Shyby"].percent, 104);
  assert.equal(by["Bicepsový zdvih"].percent, 0);
  assert.deepEqual(out.sets, { done: 6, plan: 8 });
  assert.equal(out.percent, Math.round((2 + 0.875 * 2 + 1 + 13 / 12) / 8 * 100));
  // Ticked off without numbers: as planned.
  assert.equal(gymCompliance([set("Dřep", 100, "5", null, null, true)]).percent, 100);
  assert.equal(gymCompliance([]), null);
});

test("one exercise counts at most 150 % of its sets", () => {
  const set = (exercise, plannedKg, plannedReps, actualKg, actualReps) => ({ type: "WORK", exercise, plannedKg, plannedReps, actualKg, actualReps, completed: true });
  // 2026-10-23: the pushdown planned at 5 kg, done at 20 and 15 kg with two sets
  // more, made a session with a skipped exercise 143 %.
  const out = gymCompliance([
    set("Low row", 52.5, "5–8", 52.5, 8), set("Low row", 52.5, "5–8", 52.5, 8),
    set("Cable Single Arm Rope Pushdown", 5, "8–12", 20, 7), set("Cable Single Arm Rope Pushdown", 5, "8–12", 20, 7),
    { type: "WORK", exercise: "Cable Single Arm Rope Pushdown", actualKg: 15, actualReps: 10, completed: true },
    set("Dumbbell Cossack Squat", 10, "8–12", null, null), set("Dumbbell Cossack Squat", 10, "8–12", null, null)
  ].map(r => r.exercise === "Dumbbell Cossack Squat" ? { ...r, completed: false } : r));
  const by = Object.fromEntries(out.exercises.map(e => [e.name, e.percent]));
  assert.equal(by["Cable Single Arm Rope Pushdown"], 150);
  assert.equal(out.percent, Math.round((2 + 3 + 0) / 6 * 100));
});

test("the review chart's steps get numbers and the count in band", () => {
  const out = complianceSteps({ steps: [
    { role: "warmup", label: "Rozjetí", seconds: 600, planned: 600, lo: 150, hi: 195, watts: 175, status: "in" },
    { role: "work", label: "Práh", seconds: 480, planned: 480, lo: 285, hi: 300, watts: 291, status: "in", text: "8:00 · 291 W" },
    { role: "work", label: "Práh", seconds: 480, planned: 480, lo: 285, hi: 300, watts: 264, status: "under" },
    { role: "cooldown", label: "Vyjetí", seconds: 360, planned: 360, lo: 135, hi: 180, watts: null, missing: true }
  ] });
  assert.deepEqual(out.steps.map(s => s.label), ["Rozjetí", "Práh 1", "Práh 2", "Vyjetí"]);
  assert.deepEqual([out.inBand, out.of, out.unit], [1, 2, "W"]);
  assert.equal(out.steps[3].status, "missing");
  assert.equal(complianceSteps(null), null);
});

test("adherence follows the percent", () => {
  assert.deepEqual(adherenceOf({ tss: 73, durationHours: 1.13 }, { tss: 79, durationHours: 1 }), { adherence: "good", compliance: 92 });
  const long = adherenceOf({ tss: 63, durationHours: 62 / 60 }, { tss: 45, durationHours: 0.75 });
  assert.equal(long.adherence, "off");
  assert.equal(long.compliance, 140);
  assert.match(long.adherenceReason, /delší než plán/);
  // Gym: the percent from the sets when the day has it, else the share logged.
  assert.deepEqual(adherenceOf({}, {}, { sets: 18, logged: 15, compliance: 82 }).compliance, 82);
  assert.equal(adherenceOf({}, {}, { sets: 10, logged: 10 }).adherence, "good");
  assert.deepEqual(adherenceOf({}, {}), { adherence: "good" });
});
