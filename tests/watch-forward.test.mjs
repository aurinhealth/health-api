import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { forwardWatchWorkouts, forwardToGoogle, appleForwardList, appleForwardDone, watchActivity, forwardable, PER_DAY, kickForward } from "../src/watch-forward.js";
import { EXTRA_SCOPES, HEALTH_SCOPES } from "../src/google-scopes.js";
import { saveSyncPrefs, forwardConsent, stopForwarding } from "../src/sync-destinations.js";

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

test("two passes at once send a workout once; one that can never go is not looked at again", async () => {
  const NOW_W = Date.parse("2026-11-04T20:00:00Z");
  const d = wahooDb();
  let posts = 0, gets = 0;
  const fetchImpl = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith("https://cdn.wahoo.example/")) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    if (init.method === "POST") { posts++; await new Promise(r => setTimeout(r, 5)); return Response.json({ activities: [{ id: "i" + posts }] }, { status: 201 }); }
    gets++;
    return Response.json([]);
  };
  // A Wahoo record without a length.
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, payload_json, record_role) VALUES (7, 'wahoo', 'activity', 'wahoo:9', '2026-11-03T10:00:00', '2026-11-03T10:00:00', '2026-11-03T10:00:00', ?, 'primary')")
    .run(JSON.stringify({ start_date: "2026-11-03T09:00:00Z", wahoo: { workoutId: 9 } }));
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "Bearer t", CONNECTED_PROVIDERS: ["intervals", "wahoo"] };
  await saveSyncPrefs(d, 7, "intervals", { forward: ["wahoo"], backfill: true }, { now: NOW_W });
  await Promise.all([forwardWatchWorkouts(env, { now: NOW_W, fetchImpl }), forwardWatchWorkouts(env, { now: NOW_W, fetchImpl })]);
  assert.equal(posts, 1);
  assert.equal(d.sqlite.prepare("SELECT status FROM sync_sends WHERE activity_key = 'wahoo:9'").get().status, "skipped");
  gets = 0;
  assert.deepEqual((await forwardWatchWorkouts(env, { now: NOW_W, fetchImpl })).sent, []);
  assert.equal(gets, 0);
});

test("consent is recorded; switching off drops what has not gone; a day has a ceiling", async () => {
  const NOW_W = Date.parse("2026-11-04T20:00:00Z");
  const d = wahooDb();
  await saveSyncPrefs(d, 7, "intervals", { forward: ["wahoo"], backfill: true }, { now: NOW_W });
  assert.deepEqual(await forwardConsent(d, 7), { wahoo: "2026-11-04T20:00:00.000Z" });
  d.sqlite.prepare("INSERT INTO sync_sends (user_id, activity_key, destination, status, payload_json) VALUES (7, 'wahoo:5', 'intervals', 'error', '{}'), (7, 'wahoo:6', 'intervals', 'sent', '{}')").run();
  await saveSyncPrefs(d, 7, "intervals", { forward: [] }, { now: NOW_W });
  assert.deepEqual(d.sqlite.prepare("SELECT activity_key FROM sync_sends WHERE activity_key LIKE 'wahoo:%'").all().map(r => r.activity_key), ["wahoo:6"]);
  assert.deepEqual(await forwardConsent(d, 7), {});
  // Disconnecting deletes the rest of the record.
  await stopForwarding(d, 7, "wahoo");
  assert.equal(d.sqlite.prepare("SELECT COUNT(*) AS n FROM sync_sends WHERE activity_key LIKE 'wahoo:%'").get().n, 0);
  // The ceiling: a day's sends already used up, nothing more goes.
  await saveSyncPrefs(d, 7, "intervals", { forward: ["wahoo"], backfill: true }, { now: NOW_W });
  const insert = d.sqlite.prepare("INSERT INTO sync_sends (user_id, activity_key, destination, status, payload_json) VALUES (7, ?, 'intervals', 'sent', '{}')");
  for (let i = 0; i < PER_DAY; i++) insert.run("apple:X" + i);
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "Bearer t", CONNECTED_PROVIDERS: ["intervals", "wahoo"] };
  const result = await forwardWatchWorkouts(env, { now: NOW_W, fetchImpl: async () => Response.json([]) });
  assert.equal(result.capped, true);
});

test("turning a source on starts a pass at most once in ten minutes", async () => {
  const d = wahooDb();
  d.sqlite.exec("CREATE TABLE sync_status (user_id INTEGER NOT NULL, sync_name TEXT NOT NULL, status TEXT, started_at TEXT, finished_at TEXT, details_json TEXT, updated_at TEXT, PRIMARY KEY (user_id, sync_name))");
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "Bearer t", CONNECTED_PROVIDERS: ["intervals"] };
  assert.equal((await kickForward(env, { fetchImpl: async () => Response.json([]) })).reason, "off");
  assert.equal((await kickForward(env, { fetchImpl: async () => Response.json([]) })).reason, "recent");
});

test("which records go elsewhere: not what that destination has", () => {
  // Paired with Intervals.icu's activity: Google Health and Apple Health don't have it.
  assert.equal(forwardable({ record_role: "primary", matched_activity_id: "intervals:i1" }, ["wahoo"], "google"), true);
  assert.equal(forwardable({ record_role: "primary", matched_activity_id: "google-wearables:g1" }, ["wahoo"], "google"), false);
  assert.equal(forwardable({ record_role: "primary", matched_activity_id: "apple-health:apple:W1" }, ["wahoo"], "apple"), false);
  assert.equal(forwardable({ record_role: "primary", matched_activity_id: "local:manual:3" }, ["wahoo"], "apple"), false);
  // A copy whose kept record is the destination's own stays.
  assert.equal(forwardable({ record_role: "duplicate", matched_activity_id: "apple-health:apple:W1" }, ["wahoo"], "apple"), false);
  assert.equal(forwardable({ record_role: "duplicate", matched_activity_id: "wahoo:wahoo:1" }, ["google"], "apple"), true);
});

const NOW_W = Date.parse("2026-11-04T20:00:00Z");
const GOOGLE = { GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.activityWrite] };
const googleToken = async () => "token";

test("Wahoo rides go to Google Health once, with what Wahoo measured; not what Google Health has", async () => {
  const d = wahooDb(), posts = [];
  const fetchImpl = async (url, init = {}) => {
    posts.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ done: true, response: { name: "users/me/dataTypes/exercise/dataPoints/g" + posts.length } });
  };
  const env = { DB: d, USER_ID: 7, ...GOOGLE, CONNECTED_PROVIDERS: ["google", "wahoo"] };
  assert.deepEqual(await forwardToGoogle(env, { now: NOW_W, fetchImpl, googleToken }), { status: "skipped", reason: "off" });
  await saveSyncPrefs(d, 7, "google", { forward: ["wahoo"], backfill: true }, { now: NOW_W });
  // Without the permission to write workouts nothing goes (the page asks for it).
  assert.equal((await forwardToGoogle({ ...env, GOOGLE_SCOPES: HEALTH_SCOPES }, { now: NOW_W, fetchImpl, googleToken })).reason, "scope");
  assert.deepEqual((await forwardToGoogle(env, { now: NOW_W, fetchImpl, googleToken })).sent, [{ key: "wahoo:512031649", status: "sent" }]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints");
  const ex = posts[0].body.exercise;
  assert.equal(ex.exerciseType, "BIKING");
  assert.equal(ex.interval.startTime, "2026-11-02T15:00:00.000Z");
  assert.deepEqual(ex.metricsSummary, { distanceMillimeters: 30123000, caloriesKcal: 700, averageHeartRateBeatsPerMinute: "138" });
  assert.deepEqual((await forwardToGoogle(env, { now: NOW_W, fetchImpl, googleToken })).sent, []);
  assert.equal(posts.length, 1);
  // A ride whose time Google Health has already (the watch's) is left.
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, payload_json, record_role) VALUES (7, 'wahoo', 'activity', 'wahoo:512031700', '2026-11-03T16:00:00', '2026-11-03T16:00:00', '2026-11-03T17:00:00', ?, 'primary')")
    .run(JSON.stringify({ name: "Ride", type: "Ride", start_date: "2026-11-03T15:00:00Z", elapsed_time: 3600, wahoo: { workoutId: 512031700 } }));
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json, record_role) VALUES (7, 'google-wearables', 'exercise', 'google:G9', '2026-11-03T15:02:00Z', '2026-11-03T16:00:00Z', ?, 'primary')")
    .run(JSON.stringify({ exercise: { exerciseType: "BIKING" } }));
  assert.deepEqual((await forwardToGoogle(env, { now: NOW_W, fetchImpl, googleToken })).sent, [{ key: "wahoo:512031700", status: "same" }]);
  assert.equal(posts.length, 1);
  assert.equal((await forwardToGoogle({ ...env, CONNECTED_PROVIDERS: ["google"] }, { now: NOW_W, fetchImpl, googleToken })).status, "skipped");
});

test("measured values Google Health refuses: the workout goes without them", async () => {
  const d = wahooDb(), bodies = [];
  const fetchImpl = async (url, init = {}) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (body.exercise.metricsSummary) return Response.json({ error: { code: 400 } }, { status: 400 });
    return Response.json({ done: true, response: { name: "users/me/dataTypes/exercise/dataPoints/g1" } });
  };
  const env = { DB: d, USER_ID: 7, ...GOOGLE, CONNECTED_PROVIDERS: ["google", "wahoo"] };
  await saveSyncPrefs(d, 7, "google", { forward: ["wahoo"], backfill: true }, { now: NOW_W });
  assert.deepEqual((await forwardToGoogle(env, { now: NOW_W, fetchImpl, googleToken })).sent, [{ key: "wahoo:512031649", status: "sent" }]);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].exercise.metricsSummary, undefined);
});

test("the iPhone gets the workouts to write to Apple Health; what Apple Health has is left", async () => {
  const d = wahooDb();
  const env = { DB: d, USER_ID: 7, CONNECTED_PROVIDERS: ["wahoo", "google"] };
  assert.deepEqual(await appleForwardList(env, { now: NOW_W }), []);
  await saveSyncPrefs(d, 7, "apple", { forward: ["wahoo"], backfill: true }, { now: NOW_W });
  // The watch wrote Monday's ride to Apple Health: it stays as it is.
  assert.deepEqual(await appleForwardList(env, { now: NOW_W }), []);
  assert.equal(d.sqlite.prepare("SELECT status FROM sync_sends WHERE activity_key = 'wahoo:512031649' AND destination = 'apple'").get().status, "same");
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, payload_json, record_role) VALUES (7, 'wahoo', 'activity', 'wahoo:512031700', '2026-11-03T16:00:00', '2026-11-03T16:00:00', '2026-11-03T17:00:00', ?, 'primary')")
    .run(JSON.stringify({ name: "Tempo", type: "Ride", start_date: "2026-11-03T15:00:00Z", elapsed_time: 3600, moving_time: 3500, distance: 30123, calories: 700, wahoo: { workoutId: 512031700 } }));
  assert.deepEqual(await appleForwardList(env, { now: NOW_W }), [{ key: "wahoo:512031700", type: "Ride", name: "Tempo", start: "2026-11-03T15:00:00.000Z", minutes: 58, distance: 30123, kcal: 700 }]);
  assert.deepEqual(await appleForwardDone(env, { key: "wahoo:512031700", status: "sent" }), { status: "ok" });
  assert.deepEqual(await appleForwardList(env, { now: NOW_W }), []);
  await assert.rejects(appleForwardDone(env, { key: "apple:W1", status: "sent" }), /Invalid workout|Neplatný/);
  await assert.rejects(appleForwardDone(env, { key: "wahoo:1", status: "pending" }), /Invalid workout|Neplatný/);
  // Wahoo disconnected: switched off everywhere, Aurin's record of what went deleted.
  await saveSyncPrefs(d, 7, "google", { forward: ["wahoo"] }, { now: NOW_W });
  await stopForwarding(d, 7, "wahoo");
  assert.equal(d.sqlite.prepare("SELECT COUNT(*) AS n FROM sync_sends WHERE activity_key LIKE 'wahoo:%'").get().n, 0);
  assert.deepEqual((await saveSyncPrefs(d, 7, "apple", {})).forward, []);
  assert.deepEqual((await saveSyncPrefs(d, 7, "google", {})).forward, []);
});
