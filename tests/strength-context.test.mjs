import test from "node:test";
import assert from "node:assert/strict";
import { watchActivity, isRide, isRun } from "../src/strength-context.js";

test("a watch workout reaches the gym's context like an Intervals.icu activity", () => {
  const row = { source_family: "apple-health", start_time: "2026-10-13T16:00:00Z", end_time: "2026-10-13T17:30:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: "RUNNING", displayName: "Běh", activeDuration: "5400s", metricsSummary: { caloriesKcal: 900 } } }) };
  const a = watchActivity(row);
  assert.equal(a.type, "Run");
  assert.equal(a.duration, 1.5);
  assert.equal(a.calories, 900);
  assert.ok(isRun(a) && !isRide(a));
  assert.ok(isRide(watchActivity({ ...row, payload_json: JSON.stringify({ exercise: { exerciseType: "BIKING" } }) })));
  assert.equal(watchActivity({ ...row, payload_json: "{}" }), null);
});
