import test from "node:test";
import assert from "node:assert/strict";

import { isIntensity } from "../src/strength-context.js";
import { normalizeExerciseName } from "../src/strength-normalization.js";
import { parseStrengthSheet } from "../src/strength-history.js";
import { estimateStartingLoad } from "../src/strength-intelligence.js";
import { generateStrengthPlan } from "../src/strength-generator.js";
import { completedRowsAreSynced } from "../src/strength-sync-guard.js";

test("endurance ride is not marked intense because description contains interval", () => {
  assert.equal(
    isIntensity({
      name: "Endurance – Aerobic Base",
      type: "Ride",
      description: "structured workout; intensity=interval; 4x3 min cadence work"
    }),
    false
  );
});

test("semantic threshold workout is marked intense", () => {
  assert.equal(isIntensity({ name: "Threshold 3×15 min", type: "Ride" }), true);
});

test("explicit boolean intensity wins", () => {
  assert.equal(isIntensity({ name: "Endurance Ride", intensity: false, description: "interval" }), false);
  assert.equal(isIntensity({ name: "Recovery Ride", intensity: true }), true);
});

test("exercise aliases normalize to one canonical name", () => {
  assert.equal(normalizeExerciseName("Prime flat chest press"), "Chest flat press Prime");
  assert.equal(normalizeExerciseName("Leg Curl"), "Prone leg curl Prime");
  assert.equal(normalizeExerciseName("Leg extensions"), "Leg extension Prime");
  assert.equal(normalizeExerciseName("Stahovani triceps"), "Cable triceps extension");
});

test("sheet parser canonicalizes historical exercise names", () => {
  const values = [
    ["Datum", "2026-09-22"],
    ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"],
    ["WORK", "Prime flat chest press", "1", "40", "8–12", "40", "10", "7", "TRUE", "", ""]
  ];
  const parsed = parseStrengthSheet(values);
  assert.equal(parsed.rows[0].exercise, "Chest flat press Prime");
});

test("load estimator uses alias history as own history", () => {
  const estimate = estimateStartingLoad({
    exercise: "Prime flat chest press",
    history: [{
      workout_date: "2026-09-20",
      type: "WORK",
      exercise: "Prime flat chest press",
      actual_kg: 40,
      actual_reps: 10,
      rpe: 7,
      completed: 1,
      set_no: 1
    }],
    targetReps: "8–12",
    fallbackKg: 42.5,
    loadFactor: 1
  });
  assert.equal(estimate.source, "own-history");
  assert.equal(estimate.referenceExercise, "Chest flat press Prime");
});

test("load estimator uses multiple recent performances", () => {
  const estimate = estimateStartingLoad({
    exercise: "Prime flat chest press",
    history: [
      { workout_date: "2026-09-22", type: "WORK", exercise: "Prime flat chest press", actual_kg: 42.5, actual_reps: 10, rpe: 8, completed: 1, set_no: 1 },
      { workout_date: "2026-09-15", type: "WORK", exercise: "Prime flat chest press", actual_kg: 35, actual_reps: 11, rpe: 7.5, completed: 1, set_no: 1 },
      { workout_date: "2026-09-08", type: "WORK", exercise: "Prime flat chest press", actual_kg: 35, actual_reps: 9, rpe: 8, completed: 1, set_no: 1 }
    ],
    targetReps: "8–12",
    fallbackKg: 35,
    loadFactor: 1
  });
  assert.equal(estimate.source, "own-history");
  assert.equal(estimate.performanceCount, 3);
  assert.equal(estimate.kg, 37.5);
});

test("generator treats aliased recent leg curl as the same exercise", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-22",
    cycling: {
      recentRideHours: 2,
      recentRideTss: 100,
      recentActivities: [],
      nextRide: null
    },
    recovery: {},
    strength: {
      recentCompletedSets: [{
        workout_date: "2026-09-21",
        exercise: "Leg Curl",
        type: "WORK",
        completed: 1,
        actual_kg: 40,
        actual_reps: 12,
        rpe: 7,
        set_no: 1
      }]
    }
  }, { focus: "lower", maxExercises: 4 });
  assert.ok(!plan.rows.some(row => row[0] === "WORK" && row[1] === "Prone leg curl Prime"));
});

test("sync guard accepts matching null values", () => {
  const completed = [{
    sheetRow: 10,
    type: "WORK",
    exercise: "DB curl",
    setNo: 1,
    plannedKg: 10,
    plannedReps: "8–15",
    actualKg: null,
    actualReps: null,
    rpe: null
  }];
  const dbRows = [{
    sheet_row: 10,
    type: "WORK",
    exercise: "DB curl",
    set_no: 1,
    planned_kg: 10,
    planned_reps: "8–15",
    actual_kg: null,
    actual_reps: null,
    rpe: null,
    completed: 1
  }];
  assert.equal(completedRowsAreSynced(completed, dbRows), true);
});

test("sync guard rejects mismatched completed row", () => {
  const completed = [{
    sheetRow: 10,
    type: "WORK",
    exercise: "DB curl",
    setNo: 1,
    plannedKg: 10,
    plannedReps: "8–15",
    actualKg: 10,
    actualReps: 12,
    rpe: 8
  }];
  const dbRows = [{
    sheet_row: 10,
    type: "WORK",
    exercise: "DB curl",
    set_no: 1,
    planned_kg: 10,
    planned_reps: "8–15",
    actual_kg: 10,
    actual_reps: 11,
    rpe: 8,
    completed: 1
  }];
  assert.equal(completedRowsAreSynced(completed, dbRows), false);
});


test("generator protects legs when multiple hard rides are upcoming", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-23",
    cycling: {
      recentRideHours: 8,
      recentRideTss: 700,
      recentActivities: [
        { name: "Threshold", type: "Ride", tss: 100 },
        { name: "Endurance", type: "Ride", tss: 80 }
      ],
      plannedWorkouts: [
        { name: "Endurance", type: "Ride", durationHours: 1.5 },
        { name: "Threshold 3x15", type: "Ride", durationHours: 1.5 },
        { name: "VO2 intervals", type: "Ride", durationHours: 1.25 }
      ],
      nextRide: { name: "Endurance", type: "Ride", durationHours: 1.5 }
    },
    recovery: {},
    strength: { recentCompletedSets: [] }
  }, { maxExercises: 5 });
  assert.equal(plan.protectedLegs, true);
  assert.equal(plan.planName, "Upper Body");
  assert.ok(plan.rows.length > 0);
  assert.ok(!plan.loadEstimates.some(x => ["Pivot leg press", "Pendulum squat", "Prone leg curl Prime", "Hip thrust", "DB Romanian deadlift", "DB Bulgarian split squat", "Leg extension Prime"].includes(x.exercise)));
});

test("lower-body plan includes a unilateral movement when fresh", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-23",
    cycling: {
      recentRideHours: 2,
      recentRideTss: 100,
      recentActivities: [],
      plannedWorkouts: [],
      nextRide: null
    },
    recovery: {},
    strength: { recentCompletedSets: [] }
  }, { focus: "lower", maxExercises: 4 });
  assert.ok(plan.rows.some(row => row[0] === "WORK" && row[1] === "DB Bulgarian split squat"));
});

test("generated plan survives sheet serialization round-trip", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-23",
    cycling: {
      recentRideHours: 2,
      recentRideTss: 100,
      recentActivities: [],
      plannedWorkouts: [],
      nextRide: null
    },
    recovery: {},
    strength: { recentCompletedSets: [] }
  }, { focus: "upper", maxExercises: 5 });
  const values = [
    ["Datum", plan.date],
    ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"],
    ...plan.rows.map(row => row.slice(0, 11))
  ];
  const parsed = parseStrengthSheet(values);
  const workRows = plan.rows.filter(row => row[0] === "WORK");
  assert.equal(parsed.date, plan.date);
  assert.equal(parsed.rows.filter(row => row.type === "WORK").length, workRows.length);
  assert.deepEqual(
    parsed.rows.filter(row => row.type === "WORK").map(row => row.exercise),
    workRows.map(row => row[1])
  );
});
