import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { forwardWatchWorkouts, watchActivity } from "../src/watch-forward.js";

const NOW = Date.parse("2026-10-16T12:00:00Z");
function db() {
  const d = createD1();
  d.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, matched_activity_id TEXT, UNIQUE (user_id, source_family, data_type, external_id))`);
  const add = (id, start, end, type, extra = {}) => d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json, record_role, matched_activity_id) VALUES (7, ?, 'exercise', ?, ?, ?, ?, ?, ?)")
    .run(extra.family || "apple-health", id, start, end, JSON.stringify({ exercise: { interval: { startTime: start, endTime: end }, exerciseType: type, activeDuration: "3000s", metricsSummary: { distanceMeters: 10012.4, averageHeartRateBeatsPerMinute: 141.6, caloriesKcal: 610 } } }), extra.role || "primary", extra.matched || null);
  add("apple:RUN1", "2026-10-16T06:00:00Z", "2026-10-16T06:52:00Z", "RUNNING");
  // Ended an hour ago: Strava may still bring it.
  add("apple:RIDE", "2026-10-16T10:00:00Z", "2026-10-16T11:00:00Z", "BIKING");
  // Paired with an activity Intervals.icu already has.
  add("apple:MATCHED", "2026-10-15T06:00:00Z", "2026-10-15T07:00:00Z", "BIKING", { matched: "intervals:i1" });
  add("apple:OLD", "2026-10-10T06:00:00Z", "2026-10-10T07:00:00Z", "RUNNING");
  add("google:G1", "2026-10-16T06:00:00Z", "2026-10-16T06:52:00Z", "RUNNING", { family: "google-wearables" });
  return d;
}

test("an Apple Health workout as an Intervals.icu activity", () => {
  const a = watchActivity({ external_id: "apple:RUN1", start_time: "2026-10-16T06:00:00Z", end_time: "2026-10-16T06:52:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: "RUNNING", activeDuration: "3000s", metricsSummary: { distanceMeters: 10012.4 } } }) });
  assert.equal(a.key, "apple:RUN1");
  assert.equal(a.type, "Run");
  assert.equal(a.minutes, 50);
  assert.equal(a.distance, 10012.4);
});

test("watch workouts nobody else brought go to Intervals.icu once", async () => {
  const d = db(), posts = [];
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "POST") { posts.push(JSON.parse(init.body)); return Response.json({ id: "i" + posts.length }); }
    return Response.json([]);
  };
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "Bearer t", CONNECTED_PROVIDERS: ["intervals"] };
  const first = await forwardWatchWorkouts(env, { now: NOW, fetchImpl });
  assert.deepEqual(first.sent, [{ key: "apple:RUN1", status: "sent" }]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].type, "Run");
  assert.equal(posts[0].distance, 10012);
  assert.equal(posts[0].average_heartrate, 142);
  assert.equal(posts[0].calories, 610);
  assert.equal(posts[0].external_id, "loadwise:7:apple:RUN1");
  assert.deepEqual((await forwardWatchWorkouts(env, { now: NOW, fetchImpl })).sent, []);
  assert.equal(posts.length, 1);
  assert.equal((await forwardWatchWorkouts({ ...env, CONNECTED_PROVIDERS: ["google"] }, { now: NOW, fetchImpl })).status, "skipped");
});
