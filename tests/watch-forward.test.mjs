import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { forwardWatchWorkouts, watchActivity, forwardable } from "../src/watch-forward.js";
import { saveSyncPrefs } from "../src/sync-destinations.js";

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
  // Apple Health's workouts are health data: nothing goes until they are turned on.
  assert.deepEqual(await forwardWatchWorkouts(env, { now: NOW, fetchImpl }), { status: "skipped", reason: "off" });
  assert.equal(posts.length, 0);
  await saveSyncPrefs(d, 7, "intervals", { health: ["workouts"] });
  const first = await forwardWatchWorkouts(env, { now: NOW, fetchImpl });
  assert.deepEqual(first.sent, [{ key: "apple:RUN1", status: "sent" }]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].type, "Run");
  assert.equal(posts[0].distance, 10012);
  assert.equal(posts[0].average_heartrate, 142);
  assert.equal(posts[0].calories, 610);
  assert.equal(posts[0].external_id, "aurin:7:apple:RUN1");
  assert.deepEqual((await forwardWatchWorkouts(env, { now: NOW, fetchImpl })).sent, []);
  assert.equal(posts.length, 1);
  assert.equal((await forwardWatchWorkouts({ ...env, CONNECTED_PROVIDERS: ["google"] }, { now: NOW, fetchImpl })).status, "skipped");
});

function wahooDb() {
  const d = createD1();
  d.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, matched_activity_id TEXT, UNIQUE (user_id, source_family, data_type, external_id))`);
  const ride = (id, startUtc, startLocal, extra = {}) => d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, payload_json, record_role, matched_activity_id) VALUES (7, 'wahoo', 'activity', ?, ?, ?, ?, ?, ?, ?)")
    .run("wahoo:" + id, startLocal, startLocal, startLocal.replace("T16", "T17"), JSON.stringify({ id: "wahoo:" + id, name: "Evening ride", type: "Ride", start_date: startUtc, start_date_local: startLocal, moving_time: 3500, elapsed_time: 3600, distance: 30123, average_heartrate: 138, calories: 700, wahoo: { workoutId: id, file: "https://cdn.wahoo.example/" + id + ".fit" } }), extra.role || "primary", extra.matched || null);
  ride(512031649, "2026-11-02T15:00:00Z", "2026-11-02T16:00:00");
  ride(512000001, "2026-10-01T15:00:00Z", "2026-10-01T16:00:00");
  // The watch's record of the same ride, kept as a copy of Wahoo's.
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json, record_role, matched_activity_id) VALUES (7, 'apple-health', 'exercise', 'apple:W1', '2026-11-02T15:01:00Z', '2026-11-02T16:00:00Z', ?, 'duplicate', 'wahoo:wahoo:512031649')")
    .run(JSON.stringify({ exercise: { exerciseType: "BIKING", activeDuration: "3500s" } }));
  return d;
}

test("Wahoo rides go to Intervals.icu as their FIT file, from the switch's start, once", async () => {
  const NOW_W = Date.parse("2026-11-04T20:00:00Z");
  const d = wahooDb(), uploads = [], gets = [], manual = [];
  const fetchImpl = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith("https://cdn.wahoo.example/")) return new Response(new Uint8Array([14, 16, 1, 2]), { status: 200 });
    if (init.method === "POST" && typeof init.body === "string") { manual.push(JSON.parse(init.body)); return Response.json({ id: "i901" }); }
    if (init.method === "POST") { uploads.push({ url, file: init.body.get("file") }); return Response.json({ id: "u1", activities: [{ id: "i900" }] }, { status: 201 }); }
    gets.push(url);
    return Response.json(uploads.length ? [{ id: "i900", type: "Ride", external_id: "aurin:7:wahoo:512031649", start_date: "2026-11-02T15:00:00Z", start_date_local: "2026-11-02T16:00:00", elapsed_time: 3600 }] : []);
  };
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "Bearer t", CONNECTED_PROVIDERS: ["intervals", "wahoo"] };
  // "Hotové tréninky" (what is logged in Aurin) off: other apps' workouts have their own switch.
  await saveSyncPrefs(d, 7, "intervals", { forward: ["wahoo"], pushActivities: false }, { now: NOW_W });
  // Turned on just now: Monday's ride is older than the switch.
  assert.deepEqual((await forwardWatchWorkouts(env, { now: NOW_W + 60000, fetchImpl })).sent, []);
  // With the last two weeks it goes; the October one stays.
  await saveSyncPrefs(d, 7, "intervals", { forward: [] });
  await saveSyncPrefs(d, 7, "intervals", { forward: ["wahoo"], backfill: true }, { now: NOW_W });
  const first = await forwardWatchWorkouts(env, { now: NOW_W + 60000, fetchImpl });
  assert.deepEqual(first.sent, [{ key: "wahoo:512031649", status: "sent" }]);
  assert.equal(uploads.length, 1);
  const query = new URL(uploads[0].url).searchParams;
  assert.equal(new URL(uploads[0].url).pathname, "/api/v1/athlete/0/activities");
  assert.equal(query.get("external_id"), "aurin:7:wahoo:512031649");
  assert.equal(query.get("name"), "Evening ride");
  assert.equal(uploads[0].file.size, 4);
  // One look at the days, not one per ride.
  assert.equal(gets.length, 1);
  const row = d.sqlite.prepare("SELECT status, remote_id FROM sync_sends WHERE activity_key = 'wahoo:512031649'").get();
  assert.deepEqual({ ...row }, { status: "sent", remote_id: "i900" });
  assert.deepEqual((await forwardWatchWorkouts(env, { now: NOW_W + 120000, fetchImpl })).sent, []);
  assert.equal(uploads.length, 1);
  // The watch's copy of the ride: Apple Health on too, it still does not go.
  await saveSyncPrefs(d, 7, "intervals", { health: ["workouts"] });
  assert.deepEqual((await forwardWatchWorkouts(env, { now: NOW_W + 180000, fetchImpl })).sent, []);
  // Wahoo off: the watch's copy would go in its place, but the ride is there already.
  assert.deepEqual((await forwardWatchWorkouts({ ...env, CONNECTED_PROVIDERS: ["intervals"] }, { now: NOW_W, fetchImpl })).sent, [{ key: "apple:W1", status: "same" }]);
  assert.equal(manual.length, 0);
  assert.equal(uploads.length, 1);
});

test("a ride Intervals.icu already has from elsewhere is left, and not looked at again", async () => {
  const NOW_W = Date.parse("2026-11-04T20:00:00Z");
  const d = wahooDb();
  let gets = 0, posts = 0;
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "POST") { posts++; return Response.json({ id: "x" }); }
    gets++;
    return Response.json([{ id: "i5", type: "Ride", start_date: "2026-11-02T15:00:30Z", start_date_local: "2026-11-02T16:00:30", elapsed_time: 3590, source: "GARMIN_CONNECT" }]);
  };
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "Bearer t", CONNECTED_PROVIDERS: ["intervals", "wahoo"] };
  await saveSyncPrefs(d, 7, "intervals", { forward: ["wahoo"], backfill: true }, { now: NOW_W });
  assert.deepEqual((await forwardWatchWorkouts(env, { now: NOW_W, fetchImpl })).sent, [{ key: "wahoo:512031649", status: "same" }]);
  assert.deepEqual((await forwardWatchWorkouts(env, { now: NOW_W, fetchImpl })).sent, []);
  assert.equal(posts, 0);
  assert.equal(gets, 1);
});

test("which records go: not what Intervals.icu or Aurin has, a copy only while the kept app is off", () => {
  assert.equal(forwardable({ record_role: "primary", matched_activity_id: null }, ["apple"]), true);
  assert.equal(forwardable({ record_role: "primary", matched_activity_id: "intervals:i1" }, ["apple"]), false);
  assert.equal(forwardable({ record_role: "primary", matched_activity_id: "local:manual:3" }, ["apple"]), false);
  assert.equal(forwardable({ record_role: "primary", matched_activity_id: "deleted" }, ["apple"]), false);
  assert.equal(forwardable({ record_role: "primary", matched_activity_id: "apple-health:apple:W1" }, ["wahoo"]), true);
  assert.equal(forwardable({ record_role: "duplicate", matched_activity_id: "wahoo:wahoo:1" }, ["apple", "wahoo"]), false);
  assert.equal(forwardable({ record_role: "duplicate", matched_activity_id: "wahoo:wahoo:1" }, ["apple"]), true);
  assert.equal(forwardable({ record_role: "duplicate", matched_activity_id: "intervals:i1" }, ["apple"]), false);
});

test("a Google Health workout goes as a manual activity under a key without its path", async () => {
  const d = db(), posts = [];
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "POST") { posts.push(JSON.parse(init.body)); return Response.json({ id: "i" + posts.length }); }
    return Response.json([]);
  };
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json, record_role) VALUES (7, 'google-wearables', 'exercise', 'users/me/dataTypes/exercise/dataPoints/987', '2026-10-16T08:00:00Z', '2026-10-16T08:40:00Z', ?, 'primary')")
    .run(JSON.stringify({ exercise: { exerciseType: "WALKING", activeDuration: "2400s" } }));
  await saveSyncPrefs(d, 7, "google", {});
  await saveSyncPrefs(d, 7, "intervals", { forward: ["google"], backfill: true }, { now: NOW });
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "Bearer t", CONNECTED_PROVIDERS: ["intervals", "google"] };
  const result = await forwardWatchWorkouts(env, { now: NOW, fetchImpl });
  // G1 (06:00) and 987 (08:00); Apple Health is off.
  assert.deepEqual(result.sent.map(s => s.key), ["google:G1", "google:987"]);
  assert.equal(posts[1].type, "Walk");
  assert.equal(posts[1].external_id, "aurin:7:google:987");
});
