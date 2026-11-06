import test from "node:test";
import assert from "node:assert/strict";
import { buildMilestones, activityMeters, multisportDays } from "../src/app-milestones.js";
import { activityFromRow } from "../src/coach-reflection.js";

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
  assert.deepEqual(m, { runKm: 20, rideKm: 121, swimKm: 0, multisportDays: 0, gymSessions: 2, streakDays: 4 });
});

test("streak may end yesterday, walks do not count", () => {
  const rows = [intervals("r1", "2026-10-11", "Run", 5000), intervals("r2", "2026-10-12", "Run", 5000), intervals("w", "2026-10-10", "Walk", 3000)];
  assert.equal(buildMilestones({ rows, today: "2026-10-13" }).streakDays, 2);
  assert.equal(buildMilestones({ rows: [], today: "2026-10-13" }).streakDays, 0);
});

test("only what was done since joining Aurin counts", () => {
  const rows = [intervals("old", "2026-09-30", "Run", 50000), intervals("new", "2026-10-02", "Run", 7000)];
  const m = buildMilestones({ rows, gymDays: ["2026-09-01", "2026-10-03"], today: "2026-10-03", since: "2026-10-01" });
  assert.deepEqual(m, { runKm: 7, rideKm: 0, swimKm: 0, multisportDays: 0, gymSessions: 1, streakDays: 2 });
});

// An activity at a local time with its length (Intervals.icu shape).
const at = (id, start, type, minutes, distance = 0) => ({ source_family: "intervals", external_id: id, start_time: start, end_time: null, payload_json: JSON.stringify({ id, type, distance, moving_time: minutes * 60, start_date_local: start }) });
const legsOf = rows => multisportDays(rows.map(r => Object.assign(activityFromRow(r), { meters: activityMeters(r) })));

test("swim kilometres count like ride and run", () => {
  const rows = [intervals("s1", "2026-10-10", "Swim", 2500), intervals("s2", "2026-10-12", "Swim", 3100)];
  assert.equal(buildMilestones({ rows, today: "2026-10-13" }).swimKm, 6);
});

test("multisport: a triathlon, a duathlon and a brick, each one day; legs in order", () => {
  const days = legsOf([
    at("t1", "2026-10-04T08:00:00", "Swim", 30, 1500), at("t2", "2026-10-04T08:35:00", "Ride", 70, 40000), at("t3", "2026-10-04T09:50:00", "Run", 40, 10000),
    at("d1", "2026-10-05T09:00:00", "Run", 20, 5000), at("d2", "2026-10-05T09:22:00", "Ride", 60, 30000), at("d3", "2026-10-05T10:25:00", "Run", 15, 2500),
    at("b1", "2026-10-07T17:00:00", "Ride", 90, 45000), at("b2", "2026-10-07T18:40:00", "Run", 20, 4000)
  ]);
  assert.deepEqual(days.map(d => [d.date, d.legs.map(l => l.kind).join("-")]), [["2026-10-04", "swim-ride-run"], ["2026-10-05", "run-ride-run"], ["2026-10-07", "ride-run"]]);
  assert.deepEqual(days[0].legs[1], { kind: "ride", minutes: 70, meters: 40000 });
});

test("not multisport: one sport twice, a long break, the next day, gym or a walk", () => {
  assert.equal(legsOf([
    at("r1", "2026-10-04T08:00:00", "Run", 30), at("r2", "2026-10-04T08:35:00", "Run", 30),
    at("b1", "2026-10-05T08:00:00", "Ride", 60), at("r3", "2026-10-05T09:31:00", "Run", 20),
    at("b2", "2026-10-06T23:00:00", "Ride", 50), at("r4", "2026-10-07T00:00:00", "Run", 20),
    at("g", "2026-10-08T08:00:00", "WeightTraining", 40), at("r5", "2026-10-08T08:45:00", "Run", 20), at("w", "2026-10-08T09:10:00", "Walk", 20)
  ]).length, 0);
  const rows = [at("b1", "2026-10-07T17:00:00", "Ride", 60), at("b2", "2026-10-07T18:10:00", "Run", 20)];
  assert.equal(buildMilestones({ rows, today: "2026-10-07" }).multisportDays, 1);
});
