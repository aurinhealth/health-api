import test from "node:test";
import assert from "node:assert/strict";
import { googleExerciseActivity } from "../src/index.js";
import { ownActiveTime } from "../src/apple-health.js";

// 617 C3: a gym Aurin recorded from 9:27, 6 min of sets, left idle, resumed and
// finished at 10:29. HealthKit's duration leaves the pause out: the row shows 6 min.
const row = (family, payload) => ({ source_family: family, external_id: "w1", start_time: "2026-11-23T08:27:00Z", end_time: "2026-11-23T09:29:00Z",
  payload_json: JSON.stringify({ exercise: { exerciseType: "WEIGHTLIFTING", activeDuration: "360s", metricsSummary: {} }, ...payload }) });

test("Aurin's own Apple Health workout keeps its active time without the pause", () => {
  const a = googleExerciseActivity(row("apple-health", { source: "apple-health", sourceName: "Aurin" }));
  assert.equal(Math.round(a.durationHours * 60), 6);
});

test("Google's short active time (under half the span) still gives way to the span", () => {
  const g = googleExerciseActivity(row("google-wearables", {}));
  assert.equal(Math.round(g.durationHours * 60), 62);
  // Another app's workout in Apple Health keeps the old rule too.
  const other = googleExerciseActivity(row("apple-health", { source: "apple-health", sourceName: "Google Health" }));
  assert.equal(Math.round(other.durationHours * 60), 62);
});

test("ownActiveTime: only Aurin's own Apple Health rows", () => {
  assert.equal(ownActiveTime({ source: "apple-health", sourceName: "Aurin" }), true);
  assert.equal(ownActiveTime({ source: "apple-health", sourceName: "Aurinfit" }), false);
  assert.equal(ownActiveTime({ sourceName: "Aurin" }), false);
  assert.equal(ownActiveTime(null), false);
});
