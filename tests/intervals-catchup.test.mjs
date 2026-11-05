import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { runIntervalsCatchUp, scheduleIntervalsCatchUp, CATCHUP_DAYS } from "../src/intervals-catchup.js";
import { saveSyncPrefs, ensureSyncTables } from "../src/sync-destinations.js";
import { storeLocalEvent, completeLocalWorkout } from "../src/local-workouts.js";

const NOW = Date.parse("2026-11-04T09:45:00Z");
const DAY = 86400000;
const iso = ms => new Date(ms).toISOString();

async function setup() {
  const raw = createD1();
  raw.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source_family TEXT, data_type TEXT, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, matched_activity_id TEXT, match_confidence REAL, updated_at TEXT, UNIQUE(user_id,source_family,data_type,external_id));
    CREATE TABLE workout_schedule_links (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, workout_id TEXT, scheduled_date TEXT, environment TEXT, intervals_external_id TEXT, intervals_event_id TEXT, status TEXT);`);
  const db = scopedDb(raw, 7);
  const env = { DB: db, USER_ID: 7, INTERVALS_API_KEY: "Bearer t", CONNECTED_PROVIDERS: ["intervals"] };
  await ensureSyncTables(db);
  const gym = (date, start, minutes) => raw.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, payload_json) VALUES (7, 'local', 'activity', ?, ?, ?, ?)")
    .run("aurin-gym:" + date, start, start, JSON.stringify({ name: "Push day", type: "WeightTraining", start_date_local: start, moving_time: minutes * 60, elapsed_time: minutes * 60, calories: 320, aurinGym: date }));
  const watch = (id, start, minutes, type, extra = {}) => raw.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json, record_role, matched_activity_id) VALUES (7, 'apple-health', 'exercise', ?, ?, ?, ?, 'primary', ?)")
    .run(id, start, iso(Date.parse(start) + minutes * 60000), JSON.stringify({ exercise: { interval: { startTime: start, endTime: iso(Date.parse(start) + minutes * 60000) }, exerciseType: type, activeDuration: minutes * 60 + "s" } }), extra.matched || null);
  const manual = async (start, minutes, extra = {}) => {
    const saved = await storeLocalEvent(db, { external_id: "manual:" + start, category: "WORKOUT", name: "Easy run", type: "Run", start_date_local: start, moving_time: minutes * 60 });
    await completeLocalWorkout(db, saved.id, { minutes, rpe: 4, ...extra });
    return saved.id;
  };
  const status = () => raw.sqlite.prepare("SELECT status, details_json FROM sync_status WHERE user_id = 7 AND sync_name = 'intervals_catchup'").get();
  const sends = () => raw.sqlite.prepare("SELECT activity_key, status, remote_id FROM sync_sends WHERE user_id = 7 ORDER BY activity_key").all();
  return { raw, db, env, gym, watch, manual, status, sends };
}

// Intervals.icu as a list of activities; POSTs are counted.
function intervals(list = []) {
  const calls = { get: 0, posts: [], events: [] };
  const fetchImpl = async (url, init = {}) => {
    if (/\/events\/bulk/.test(url)) { calls.events.push(JSON.parse(init.body)); return Response.json([{ id: 900 + calls.events.length }]); }
    if (init.method === "POST") { calls.posts.push(JSON.parse(init.body)); return Response.json({ id: "i" + calls.posts.length }); }
    if (/\/athlete\/0\/activities\?/.test(url)) { calls.get++; return Response.json(list); }
    return Response.json([]);
  };
  return { calls, fetchImpl };
}

test("the first run sends only what Intervals.icu is missing, without copies", async () => {
  const { env, db, gym, watch, manual, status, sends } = await setup();
  await saveSyncPrefs(db, 7, "intervals", { health: ["workouts"] });
  gym("2026-10-28", "2026-10-28T17:00:00", 70);
  // A run typed in whose send was answered too late: Intervals.icu has it under our id.
  const runId = await manual("2026-10-30T07:00:00", 40);
  // The watch's ride that Garmin uploaded to Intervals.icu too.
  watch("apple:RIDE", "2026-11-01T08:00:00Z", 90, "BIKING");
  // The watch's swim nobody else has.
  watch("apple:SWIM", "2026-11-02T06:00:00Z", 45, "SWIMMING");
  // Older than the catch-up looks.
  gym("2026-09-20", "2026-09-20T17:00:00", 60);
  const { calls, fetchImpl } = intervals([
    { id: "r1", external_id: "aurin:7:manual:" + runId, type: "Run", start_date_local: "2026-10-30T07:00:00", elapsed_time: 2400 },
    { id: "g1", type: "Ride", source: "GARMIN_CONNECT", start_date: "2026-11-01T08:03:00Z", start_date_local: "2026-11-01T09:03:00", elapsed_time: 5300 }
  ]);
  const result = await runIntervalsCatchUp(env, { now: NOW, fetchImpl });
  assert.equal(result.status, "done");
  assert.deepEqual(result.sent.map(s => s.key + " " + s.status), ["gym:2026-10-28 sent", "manual:" + runId + " there", "apple:RIDE same", "apple:SWIM sent"]);
  // One read of those days, one POST each, no per-day look-up.
  assert.equal(calls.get, 1);
  assert.deepEqual(calls.posts.map(p => [p.type, p.external_id]), [["WeightTraining", "aurin:7:gym:2026-10-28"], ["Swim", "aurin:7:apple:SWIM"]]);
  assert.equal(calls.posts[0].moving_time, 70 * 60);
  assert.equal(calls.posts[0].calories, 320);
  assert.deepEqual(sends().map(s => [s.activity_key, s.status, s.remote_id]), [["apple:SWIM", "sent", "i2"], ["gym:2026-10-28", "sent", "i1"], ["manual:" + runId, "sent", "r1"]]);
  assert.equal(status().status, "done");
  // Done: the next hours only read the state.
  const again = await runIntervalsCatchUp(env, { now: NOW + 3600000, fetchImpl });
  assert.equal(again.status, "idle");
  assert.equal(calls.get, 1);
});

test("a reconnect looks back from the last activity that reached Intervals.icu", async () => {
  const { env, raw, gym, status } = await setup();
  raw.sqlite.prepare("INSERT INTO sync_sends (user_id, activity_key, destination, status, remote_id, updated_at) VALUES (7, 'gym:2026-10-25', 'intervals', 'sent', 'x', '2026-10-25 18:30:00')").run();
  await runIntervalsCatchUp(env, { now: NOW, fetchImpl: intervals().fetchImpl });
  assert.equal(status().status, "done");
  gym("2026-10-25", "2026-10-25T17:00:00", 60);
  gym("2026-11-02", "2026-11-02T17:00:00", 60);
  const since = await scheduleIntervalsCatchUp(env, { now: NOW });
  assert.equal(since, Date.parse("2026-10-24T18:30:00Z"));
  const { calls, fetchImpl } = intervals();
  const result = await runIntervalsCatchUp(env, { now: NOW, fetchImpl });
  // The 25th was sent before; only the 2nd goes.
  assert.deepEqual(result.sent.map(s => s.key), ["gym:2026-11-02"]);
  assert.equal(calls.posts.length, 1);
  // Never further back than CATCHUP_DAYS.
  raw.sqlite.prepare("DELETE FROM sync_sends").run();
  assert.equal(await scheduleIntervalsCatchUp(env, { now: NOW }), NOW - CATCHUP_DAYS * DAY);
});

test("sends refused for good start a catch-up of their own; a broken connection waits", async () => {
  const { env, raw, gym, status } = await setup();
  await runIntervalsCatchUp(env, { now: NOW - 7 * DAY, fetchImpl: intervals().fetchImpl });
  assert.equal(status().status, "done");
  gym("2026-11-02", "2026-11-02T17:00:00", 60);
  raw.sqlite.prepare("INSERT INTO sync_sends (user_id, activity_key, destination, status, attempts, payload_json, created_at, updated_at) VALUES (7, 'gym:2026-11-02', 'intervals', 'error', 3, '{}', '2026-11-02 18:10:00', '2026-11-02 18:40:00')").run();
  raw.sqlite.prepare("INSERT INTO sync_status (user_id, sync_name, status) VALUES (7, 'connection_intervals', 'broken')").run();
  const { calls, fetchImpl } = intervals();
  assert.equal((await runIntervalsCatchUp(env, { now: NOW, fetchImpl })).status, "waiting");
  assert.equal(calls.get, 0);
  raw.sqlite.prepare("UPDATE sync_status SET status = 'ok' WHERE sync_name = 'connection_intervals'").run();
  const result = await runIntervalsCatchUp(env, { now: NOW, fetchImpl });
  assert.deepEqual(result.sent.map(s => s.key + " " + s.status), ["gym:2026-11-02 sent"]);
  assert.equal(calls.posts.length, 1);
  // Refused again for good: not tried every hour, only with the next reconnect.
  raw.sqlite.prepare("UPDATE sync_sends SET status = 'error', attempts = 3, updated_at = '2026-11-04 13:00:00'").run();
  assert.equal((await runIntervalsCatchUp(env, { now: NOW + 3600000, fetchImpl })).status, "idle");
  assert.equal(calls.get, 1);
  // A send still being tried (fewer than three attempts) is left to retrySyncSends.
  raw.sqlite.prepare("UPDATE sync_sends SET status = 'error', attempts = 1").run();
  raw.sqlite.prepare("DELETE FROM sync_status WHERE sync_name = 'intervals_catchup'").run();
  assert.equal((await runIntervalsCatchUp(env, { now: NOW, fetchImpl })).sent.length, 0);
  assert.equal(calls.posts.length, 1);
});

test("a long gap goes a few at a time and goes on next hour", async () => {
  const { env, gym, status } = await setup();
  for (let d = 1; d <= 12; d++) gym("2026-10-" + String(d + 10).padStart(2, "0"), "2026-10-" + String(d + 10).padStart(2, "0") + "T17:00:00", 60);
  const { calls, fetchImpl } = intervals();
  const first = await runIntervalsCatchUp(env, { now: NOW, fetchImpl });
  assert.equal(first.status, "pending");
  assert.equal(calls.posts.length, 8);
  assert.ok(Number.isFinite(JSON.parse(status().details_json).cursor));
  const second = await runIntervalsCatchUp(env, { now: NOW + 3600000, fetchImpl });
  assert.equal(second.status, "done");
  assert.equal(calls.posts.length, 12);
  assert.equal(new Set(calls.posts.map(p => p.external_id)).size, 12);
});

test("activities off for Intervals.icu: nothing is read or sent", async () => {
  const { env, db, gym, status } = await setup();
  await saveSyncPrefs(db, 7, "intervals", { pushActivities: false });
  gym("2026-11-02", "2026-11-02T17:00:00", 60);
  const { calls, fetchImpl } = intervals();
  assert.equal((await runIntervalsCatchUp(env, { now: NOW, fetchImpl })).status, "done");
  assert.equal(calls.get + calls.posts.length, 0);
  assert.equal(status().status, "done");
});

test("coming plans whose export gave up are tried again with the catch-up", async () => {
  const { env, db, raw } = await setup();
  const plan = await storeLocalEvent(db, { external_id: "plan-a", category: "WORKOUT", type: "Ride", name: "Tempo", start_date_local: "2026-11-06T17:00:00", moving_time: 3600 });
  const far = await storeLocalEvent(db, { external_id: "plan-far", category: "WORKOUT", type: "Ride", name: "Later", start_date_local: "2026-12-20T17:00:00", moving_time: 3600 });
  raw.sqlite.prepare("UPDATE workout_exports SET status = 'failed', attempts = 8").run();
  const result = await runIntervalsCatchUp(env, { now: NOW, fetchImpl: intervals().fetchImpl });
  assert.equal(result.plans, 1);
  const state = id => raw.sqlite.prepare("SELECT status, attempts FROM workout_exports WHERE local_id = ?").get(id);
  assert.deepEqual({ ...state(plan.id) }, { status: "pending", attempts: 0 });
  assert.equal(state(far.id).status, "failed");
});

test("a gym session still going on waits for the app's own send", async () => {
  const { env, gym, sends } = await setup();
  // NOW is 10:45 in Prague: sets since 09:30, the last a quarter of an hour ago.
  gym("2026-11-04", "2026-11-04T09:30:00", 60);
  gym("2026-11-02", "2026-11-02T17:00:00", 60);
  const { calls, fetchImpl } = intervals([]);
  const r = await runIntervalsCatchUp(env, { now: NOW, fetchImpl });
  assert.deepEqual(calls.posts.map(p => p.external_id), ["aurin:7:gym:2026-11-02"]);
  assert.deepEqual(sends().map(s => s.activity_key), ["gym:2026-11-02"]);
  assert.equal(r.status, "done");
});

test("every five minutes only while pending; a refusal or the day's sends stop it", async () => {
  const { env, gym, status } = await setup();
  // Nothing pending: the five-minute run reads its row and stops.
  await runIntervalsCatchUp(env, { now: NOW, fetchImpl: intervals([]).fetchImpl });
  assert.equal(status().status, "done");
  assert.deepEqual(await runIntervalsCatchUp(env, { now: NOW + 300000, pendingOnly: true, fetchImpl: () => { throw new Error("no request"); } }), { status: "idle" });
  // A reconnect: three missed sessions; Intervals.icu answers the first send with 429.
  for (const day of ["2026-10-30", "2026-10-31", "2026-11-01"]) gym(day, day + "T17:00:00", 60);
  await scheduleIntervalsCatchUp(env, { now: NOW });
  const posts = [];
  const busy = async (url, init = {}) => {
    if (init.method === "POST") { posts.push(url); return new Response("", { status: 429 }); }
    return Response.json([]);
  };
  const r = await runIntervalsCatchUp(env, { now: NOW + 600000, pendingOnly: true, fetchImpl: busy });
  assert.equal(r.status, "pending");
  assert.equal(posts.length, 1, "no further sends after a 429");
  // The five-minute runs wait an hour, the :45 one tries.
  assert.deepEqual(await runIntervalsCatchUp(env, { now: NOW + 900000, pendingOnly: true, fetchImpl: busy }), { status: "waiting" });
  // The day's sends used up: no request until the next UTC day.
  const state = JSON.parse(status().details_json);
  await env.DB.prepare("UPDATE sync_status SET details_json = ? WHERE user_id = ? AND sync_name = 'intervals_catchup'").bind(JSON.stringify({ ...state, sent: 24, wait: 0 }), 7).run();
  const quiet = await runIntervalsCatchUp(env, { now: NOW + 3600000, fetchImpl: () => { throw new Error("no request"); } });
  assert.equal(quiet.status, "pending");
  assert.ok(JSON.parse(status().details_json).wait >= Date.parse("2026-11-05T00:00:00Z"));
});
