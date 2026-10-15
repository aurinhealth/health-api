import test from "node:test";
import assert from "node:assert/strict";
import { buildShareMilestones, reachedStep, KM_STEPS, activityClimb, powerRecord, recordCurves, intervalsRecord } from "../src/share-milestone.js";

const intervals = (id, date, type, distance, climb = 0) => ({ source_family: "intervals", external_id: id, start_time: date + "T07:00:00", end_time: null, payload_json: JSON.stringify({ id, type, distance, moving_time: 3600, total_elevation_gain: climb, start_date_local: date + "T07:00:00" }) });
const google = (id, date, type, meters, climb) => ({ source_family: "google-wearables", external_id: id, start_time: date + "T15:00:00Z", end_time: date + "T16:00:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: type, activeDuration: "3600s", metricsSummary: { distanceMeters: meters, elevationGainMillimeters: climb * 1000 } } }) });

test("the last round number crossed", () => {
  assert.equal(reachedStep(KM_STEPS, 9.9), null);
  assert.equal(reachedStep(KM_STEPS, 10), 10);
  assert.equal(reachedStep(KM_STEPS, 1234), 1000);
});

test("climb from both payload shapes", () => {
  assert.equal(activityClimb(intervals("a", "2026-10-01", "Ride", 1000, 420)), 420);
  assert.equal(activityClimb(google("g", "2026-10-01", "BIKING", 1000, 310)), 310);
  assert.equal(activityClimb({ payload_json: "{}" }), 0);
});

test("ride, run, gym and streak milestones since joining, the newest first", () => {
  const rows = [
    intervals("old", "2026-09-20", "Ride", 500000),
    intervals("b1", "2026-10-02", "Ride", 60000, 500),
    google("b2", "2026-10-05", "BIKING", 50000, 300),
    intervals("r1", "2026-10-13", "Run", 12000),
    intervals("r2", "2026-10-14", "Run", 14000),
    intervals("w", "2026-10-12", "Walk", 5000)
  ];
  const gymDays = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-15", "2026-09-01"];
  const m = buildShareMilestones({ rows, gymDays, today: "2026-10-15", since: "2026-10-01" });
  const byKey = Object.fromEntries(m.items.map(i => [i.key, i]));
  assert.deepEqual(m.items.map(i => i.key), ["gym", "streak", "run", "ride"]);
  assert.equal(byKey.ride.value, 100);
  assert.equal(byKey.ride.total, 110);
  assert.equal(byKey.ride.reachedOn, "2026-10-05");
  assert.equal(byKey.ride.elevation, 800);
  assert.deepEqual(byKey.ride.bars.map(b => b.value), [60, 50]);
  assert.equal(byKey.run.value, 25);
  assert.equal(byKey.run.reachedOn, "2026-10-14");
  assert.equal(byKey.gym.value, 5);
  assert.equal(byKey.gym.reachedOn, "2026-10-15");
  // 13, 14, 15 October: walks alone don't count, so the 12th breaks it.
  assert.equal(byKey.streak.total, 3);
  assert.equal(byKey.streak.since, "2026-10-13");
});

test("nothing reached yet", () => {
  assert.deepEqual(buildShareMilestones({ rows: [intervals("r", "2026-10-14", "Run", 4000)], today: "2026-10-15" }).items, []);
});

const curve = pairs => ({ list: [{ id: "x", secs: pairs.map(p => p[0]), values: pairs.map(p => p[1]) }] });

test("a new power record is the biggest gain", () => {
  const r = powerRecord(curve([[5, 900], [60, 450], [300, 320], [1200, 280], [3600, 240]]), curve([[5, 950], [60, 400], [300, 315], [1200, 270], [3600, 245]]));
  assert.equal(r.isNew, true);
  assert.equal(r.seconds, 60);
  assert.equal(r.watts, 450);
  assert.equal(r.previous, 400);
  assert.equal(r.curve.length, 5);
});

test("without a record the 20 minutes stay as the month's best", () => {
  const r = powerRecord(curve([[60, 380], [1200, 260]]), curve([[60, 400], [1200, 270]]));
  assert.deepEqual({ isNew: r.isNew, seconds: r.seconds, watts: r.watts }, { isNew: false, seconds: 1200, watts: 260 });
  assert.equal(powerRecord(null, curve([[60, 400]])), null);
});

test("the curves asked from Intervals.icu", async () => {
  assert.deepEqual(recordCurves("2026-10-15"), ["30d", "r.2025-09-15.2026-09-14"]);
  const asked = [];
  const fetchImpl = async url => { asked.push(url); return { ok: true, json: async () => (url.endsWith("30d") ? curve([[60, 450]]) : curve([[60, 400]])) }; };
  const r = await intervalsRecord({ INTERVALS_API_KEY: "k" }, "Basic x", "2026-10-15", fetchImpl);
  assert.equal(asked.length, 2);
  assert.equal(r.isNew, true);
  assert.equal(await intervalsRecord({}, "", "2026-10-15", fetchImpl), null);
});
