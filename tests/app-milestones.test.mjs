import test from "node:test";
import assert from "node:assert/strict";
import { buildMilestones, activityMeters } from "../src/app-milestones.js";

const intervals = (id, date, type, distance) => ({ source_family: "intervals", external_id: id, start_time: date + "T07:00:00", end_time: null, payload_json: JSON.stringify({ id, type, distance, moving_time: 3600, start_date_local: date + "T07:00:00" }) });
const google = (id, date, type, meters) => ({ source_family: "google-wearables", external_id: id, start_time: date + "T15:00:00Z", end_time: date + "T16:00:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: type, activeDuration: "3600s", metricsSummary: { distanceMeters: meters } } }) });

test("activityMeters reads both payload shapes", () => {
  assert.equal(activityMeters(intervals("a", "2026-10-01", "Run", 10000)), 10000);
  assert.equal(activityMeters(google("g", "2026-10-01", "RUNNING", 5200)), 5200);
  assert.equal(activityMeters({ payload_json: "{}" }), 0);
});

test("totals per sport, gym days once, streak back from today", () => {
  const rows = [
    intervals("r1", "2026-10-10", "Run", 12000),
    intervals("r2", "2026-10-11", "TrailRun", 8400),
    intervals("b1", "2026-10-12", "Ride", 80000),
    google("b2", "2026-09-01", "BIKING", 41000),
    intervals("w1", "2026-10-13", "WeightTraining", 0)
  ];
  const m = buildMilestones({ rows, gymDays: ["2026-10-13", "2026-10-05"], today: "2026-10-13" });
  assert.deepEqual(m, { runKm: 20, rideKm: 121, gymSessions: 2, streakDays: 4 });
});

test("streak may end yesterday, walks do not count", () => {
  const rows = [intervals("r1", "2026-10-11", "Run", 5000), intervals("r2", "2026-10-12", "Run", 5000), intervals("w", "2026-10-10", "Walk", 3000)];
  assert.equal(buildMilestones({ rows, today: "2026-10-13" }).streakDays, 2);
  assert.equal(buildMilestones({ rows: [], today: "2026-10-13" }).streakDays, 0);
});

test("only what was done since joining Aurin counts", () => {
  const rows = [intervals("old", "2026-09-30", "Run", 50000), intervals("new", "2026-10-02", "Run", 7000)];
  const m = buildMilestones({ rows, gymDays: ["2026-09-01", "2026-10-03"], today: "2026-10-03", since: "2026-10-01" });
  assert.deepEqual(m, { runKm: 7, rideKm: 0, gymSessions: 1, streakDays: 2 });
});
