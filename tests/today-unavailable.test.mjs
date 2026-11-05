import test from "node:test";
import assert from "node:assert/strict";
import { buildToday, todayUnavailable } from "../src/app-today.js";

test("Today names the parts that failed by their card", () => {
  assert.deepEqual(todayUnavailable(new Set(["/health/sleep", "/health/weight", "/app/api/fluids", "/health/sleep"])), ["sleep", "weight", "fluids"]);
  assert.deepEqual(todayUnavailable(new Set()), []);
  assert.deepEqual(buildToday({ date: "2026-10-08", unavailable: ["sleep"] }).unavailable, ["sleep"]);
  assert.deepEqual(buildToday({ date: "2026-10-08" }).unavailable, []);
});

test("the watch's day, fitness, the day's analysis and the gym plans fail as their cards", () => {
  assert.deepEqual(todayUnavailable(new Set(["google-health", "/app/api/fitness"])), ["health"]);
  assert.deepEqual(todayUnavailable(new Set(["/analysis/daily", "gym-plans"])), ["training", "food"]);
  assert.deepEqual(todayUnavailable(new Set(["/app/api/coaches", "recovery", "unknown"])), ["coach", "recovery"]);
});
