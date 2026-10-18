import test from "node:test";
import assert from "node:assert/strict";
import { buildToday, todayUnavailable } from "../src/app-today.js";

test("Today names the parts that failed by their card", () => {
  assert.deepEqual(todayUnavailable(new Set(["/health/sleep", "/health/weight", "/app/api/fluids", "/health/sleep"])), ["sleep", "fluids"]);
  assert.deepEqual(todayUnavailable(new Set()), []);
  assert.deepEqual(buildToday({ date: "2026-10-08", unavailable: ["sleep"] }).unavailable, ["sleep"]);
  assert.deepEqual(buildToday({ date: "2026-10-08" }).unavailable, []);
});
