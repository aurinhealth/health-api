import test from "node:test";
import assert from "node:assert/strict";
import { resizeWorkout, CYCLING_WORKOUTS, RUNNING_WORKOUTS } from "../src/workout-library.js";

const byId = id => [...CYCLING_WORKOUTS, ...RUNNING_WORKOUTS].find(w => w.id === id);
const MAX_WORK = { ride: { tempo: 90, sweet_spot: 60, threshold: 45, vo2max: 25 }, run: { tempo: 50, threshold: 40, vo2max: 20 } };

test("a longer threshold ride keeps its main set without a target difficulty", () => {
  const r = resizeWorkout(byId("pfd-thr-4x6-75"), 150);
  assert.equal(r.id, "pfd-thr-4x6-150");
  assert.equal(r.work_minutes, 24);
});

test("on a green day a longer threshold ride takes the family's level with the most work within the difficulty", () => {
  const base = byId("pfd-thr-4x6-75");
  assert.equal(resizeWorkout(base, 150, { maxDifficulty: 4.9 }).id, "pfd-thr-4x6-150");
  const r = resizeWorkout(base, 150, { maxDifficulty: 6 });
  assert.equal(r.id, "pfd-thr-3x10-150");
  assert.ok(r.difficulty <= 6);
  assert.match(r.resize_notes.join(" "), /Threshold 3×10/);
  assert.equal(resizeWorkout(base, 150, { maxDifficulty: 8 }).work_minutes, 45);
  // Never past the work cap, whatever the difficulty.
  // (45 min, as the AI's hard-minute cap on a green day in ai-workout-pick.js).
  assert.equal(resizeWorkout(base, 150, { maxDifficulty: 10 }).work_minutes, 45);
  assert.equal(resizeWorkout(byId("pfd-ss-3x8-75"), 150, { maxDifficulty: 10 }).work_minutes, 60);
});

test("on a yellow day the extra time is easy riding only, with a note", () => {
  const r = resizeWorkout(byId("pfd-thr-4x6-75"), 150, { maxDifficulty: 10, easyOnly: true });
  assert.equal(r.work_minutes, 24);
  assert.match(r.resize_notes.join(" "), /only|jen lehká/);
});

test("shortening ignores the difficulty and never adds work", () => {
  const base = byId("pfd-thr-3x10-150");
  assert.ok(resizeWorkout(base, 75, { maxDifficulty: 10 }).work_minutes <= base.work_minutes);
});

test("across the library a longer hard session stays within the difficulty and the work cap", () => {
  for (const base of [...CYCLING_WORKOUTS, ...RUNNING_WORKOUTS]) {
    const cap = MAX_WORK[base.sport === "run" ? "run" : "ride"][base.primary_system];
    if (!base.family || n(base.duration_minutes) > 120) continue;
    for (const maxDifficulty of [3, 6, 9]) {
      const r = resizeWorkout(base, n(base.duration_minutes) + 60, { maxDifficulty });
      if (!cap) {
        if (["anaerobic", "sprint"].includes(base.primary_system)) assert.ok(r.work_minutes <= base.work_minutes + .5, base.id + " gained work");
        continue;
      }
      if (r.work_minutes <= base.work_minutes) continue;
      assert.ok(r.difficulty <= maxDifficulty, `${base.id} → ${r.id} difficulty ${r.difficulty} > ${maxDifficulty}`);
      assert.ok(r.work_minutes <= cap, `${base.id} → ${r.id} work ${r.work_minutes} > ${cap}`);
      assert.equal(r.family, base.family);
      assert.ok(Math.abs(r.duration_minutes - (n(base.duration_minutes) + 60)) <= 2, `${base.id} → ${r.id} length ${r.duration_minutes}`);
    }
  }
});

function n(x) { return Number(x) || 0; }
