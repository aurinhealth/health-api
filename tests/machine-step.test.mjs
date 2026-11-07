// A machine stack in 5 kg steps (Petr 2026-11-07): the plan learns the step
// from what the athlete logged instead of a planned load in between.
import test from "node:test";
import assert from "node:assert/strict";
import { progressionDecision, estimateStartingLoad } from "../src/strength-intelligence.js";

const sets = (date, kg, reps, planned = kg) => [1, 2, 3].map(set_no => ({ workout_date: date, set_no, planned_kg: planned, actual_kg: kg, actual_reps: reps, rpe: 8, type: "WORK", completed: 1, exercise: "Lat pulldown" }));

test("without a skipped load a machine steps by 2.5 kg", () => {
  const rows = [...sets("2026-10-20", 40, 10), ...sets("2026-10-27", 45, 12)];
  assert.equal(progressionDecision(rows, "Lat pulldown", "8–12").kg, 47.5);
});

test("50 kg logged for a planned 47.5 kg makes the machine step by 5 kg", () => {
  const rows = [...sets("2026-10-27", 45, 12), ...sets("2026-11-03", 50, 12, 47.5)];
  const up = progressionDecision(rows, "Lat pulldown", "8–12");
  assert.equal(up.step, 5);
  assert.equal(up.kg, 55);
  const down = progressionDecision([...sets("2026-10-27", 45, 12, 47.5), ...sets("2026-11-03", 50, 5)], "Lat pulldown", "8–12");
  assert.equal(down.decision, "decrease");
  assert.equal(down.kg, 45);
  const est = estimateStartingLoad({ exercise: "Lat pulldown", history: rows, targetReps: "8–12", today: "2026-11-07" });
  assert.equal(est.kg, 55);
  assert.equal(est.step, 5);
});

test("the learned step holds while the plan is already in 5 kg", () => {
  const rows = [...sets("2026-10-13", 45, 10, 47.5), ...sets("2026-10-20", 45, 12), ...sets("2026-10-27", 50, 10), ...sets("2026-11-03", 50, 12)];
  assert.equal(progressionDecision(rows, "Lat pulldown", "8–12").kg, 55);
});

test("a load in between logged again brings back 2.5 kg", () => {
  const rows = [...sets("2026-10-27", 50, 12, 47.5), ...sets("2026-11-03", 52.5, 12)];
  assert.equal(progressionDecision(rows, "Lat pulldown", "8–12").kg, 55);
  assert.equal(progressionDecision(rows, "Lat pulldown", "8–12").step, 2.5);
});

test("dumbbells and barbells keep their own steps", () => {
  const bar = [1, 2, 3].map(set_no => ({ workout_date: "2026-11-03", set_no, planned_kg: 62.5, actual_kg: 60, actual_reps: 10, rpe: 8 }));
  assert.equal(progressionDecision(bar, "Barbell bench press", "6–10").step, 2.5);
});
