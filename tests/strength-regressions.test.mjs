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
