import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import legacy from "../src/index.js";
import { KEEP_TYPE_SQL } from "../src/activity-type.js";
import { mergeProposal, mergeWorkouts, keepWorkoutsApart, recorderOf } from "../src/workout-merge.js";
import { buildCalendar } from "../src/app-calendar.js";
import { googleExerciseActivity } from "../src/index.js";
import { deleteActivity } from "../src/activity-edits.js";

// The girlfriend's gym on 2026-10-17: Aurin on the iPhone and the Apple Watch's workout app.
const aurin = { source_family: "apple-health", data_type: "exercise", external_id: "apple:AAA", start_time: "2026-10-17T18:02:00Z", end_time: "2026-10-17T19:07:00Z",
  payload: { source: "apple-health", sourceName: "Aurin", exercise: { exerciseType: "STRENGTH_TRAINING", activeDuration: "3540s", metricsSummary: { caloriesKcal: 241, averageHeartRateBeatsPerMinute: 109 } } } };
const watch = { source_family: "apple-health", data_type: "exercise", external_id: "apple:WWW", start_time: "2026-10-17T18:03:00Z", end_time: "2026-10-17T19:23:00Z",
  payload: { source: "apple-health", sourceName: "Marie – Apple Watch", exercise: { exerciseType: "STRENGTH_TRAINING", activeDuration: "4860s", metricsSummary: { caloriesKcal: 337, averageHeartRateBeatsPerMinute: 116, maxHeartRateBeatsPerMinute: 168 } } } };

function setup() {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const env = { DB: scopedDb(raw, 1), USER_ID: 1, CONNECTED_PROVIDERS: [], INTERVALS_API_KEY: "key" };
  const insert = row => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,?,?,?,?,?,?)")
    .run(row.source_family, row.data_type, row.external_id, row.start_time, row.end_time, JSON.stringify(row.payload));
  const sync = row => raw.sqlite.prepare(`INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,?,?,?,?,?,?)
    ON CONFLICT(user_id,source_family,data_type,external_id) DO UPDATE SET ${KEEP_TYPE_SQL}`).run(row.source_family, row.data_type, row.external_id, row.start_time, row.end_time, JSON.stringify(row.payload));
  const rows = () => raw.sqlite.prepare("SELECT * FROM health_datapoints WHERE data_type='exercise' ORDER BY start_time").all().map(r => ({ ...r }));
  const live = () => rows().filter(r => r.record_role !== "duplicate");
  const calendar = () => buildCalendar({ start: "2026-10-17", end: "2026-10-17", today: "2026-10-17", google: live() }).days[0];
  return { raw, env, insert, sync, rows, live, calendar };
}

test("Aurin and the Apple Watch recording one gym session: the calendar proposes to merge them", () => {
  const { insert, calendar } = setup();
  insert(aurin); insert(watch);
  const day = calendar();
  assert.equal(day.activities.length, 2);
  assert.deepEqual(day.activities.map(a => a.sources[0].name), ["Aurin", "Apple Watch"]);
  assert.deepEqual(day.merge.ids, ["apple:AAA", "apple:WWW"]);
  // Both together, and Aurin's own time; the watch's is nearly the same as both.
  assert.deepEqual(day.merge.spans.map(s => s.key), ["both", "apple:AAA"]);
  assert.equal(day.merge.spans[0].minutes, 81);
  // The watch's calories and heart rate first.
  assert.deepEqual(day.merge.energy.map(e => [e.name, e.kcal]), [["Apple Watch", 337], ["Aurin", 241]]);
  assert.match(day.merge.energy[0].text, /116.*168/);
  assert.match(day.merge.note, /Aurin/);
});

test("merging keeps one workout with the chosen time and the watch's calories, through the next sync and matching", async () => {
  const { env, insert, sync, rows, live, calendar } = setup();
  insert(aurin); insert(watch);
  const result = await mergeWorkouts(env, { ids: ["apple:AAA", "apple:WWW"], energy: "apple:WWW", span: "both" }, { fetchImpl: async () => { throw new Error("no send"); } });
  assert.equal(result.id, "apple:WWW");
  const dropped = rows().find(r => r.external_id === "apple:AAA");
  assert.deepEqual([dropped.record_role, dropped.matched_activity_id], ["duplicate", "apple-health:apple:WWW"]);
  // The next Apple Health sync and the activity matching keep it.
  sync(watch); sync(aurin);
  await legacy.fetch(new Request("https://internal/sync/match", { method: "POST" }), env, { waitUntil() {} });
  assert.deepEqual(live().map(r => r.external_id), ["apple:WWW"]);
  const day = calendar();
  assert.equal(day.activities.length, 1);
  assert.equal(day.merge, undefined);
  const [one] = day.activities;
  assert.deepEqual([one.minutes, one.kcal, one.time], [81, 337, "20:02"]);
  assert.deepEqual(one.sources.map(s => s.name), ["Aurin", "Apple Watch"]);
  // Today and Training read the same time and devices.
  const activity = googleExerciseActivity(live()[0]);
  assert.equal(Math.round(activity.durationHours * 60), 81);
  assert.equal(activity.start, "2026-10-17T18:02:00Z");
  assert.deepEqual(activity.sources.map(s => s.name), ["Aurin", "Apple Watch"]);
});

test("a copy of the dropped record already sent to Intervals.icu is deleted there", async () => {
  const { env, insert, raw } = setup();
  insert(aurin); insert(watch);
  raw.sqlite.exec("CREATE TABLE IF NOT EXISTS sync_sends (user_id INTEGER NOT NULL, activity_key TEXT NOT NULL, destination TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', remote_id TEXT, message TEXT, payload_json TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, activity_key, destination))");
  raw.sqlite.exec("INSERT INTO sync_sends(user_id,activity_key,destination,status,remote_id) VALUES(1,'apple:AAA','intervals','sent','i555')");
  const calls = [];
  const result = await mergeWorkouts(env, { ids: ["apple:AAA", "apple:WWW"], energy: "apple:WWW" }, { fetchImpl: async (url, init) => { calls.push([init.method, url]); return new Response("{}", { status: 200 }); } });
  assert.equal(result.removedFromIntervals, true);
  assert.deepEqual(calls, [["DELETE", "https://intervals.icu/api/v1/activity/i555"]]);
});

test("kept apart, the proposal does not come back; a single device never gets one", async () => {
  const { env, insert, calendar } = setup();
  insert(aurin); insert(watch);
  await keepWorkoutsApart(env, { ids: ["apple:AAA", "apple:WWW"] });
  const day = calendar();
  assert.equal(day.activities.length, 2);
  assert.equal(day.merge, undefined);
  assert.equal(mergeProposal([{ ...watch, payload_json: JSON.stringify(watch.payload) }, { ...watch, external_id: "apple:W2", payload_json: JSON.stringify(watch.payload) }]), null);
});

test("who recorded a watch workout", () => {
  const row = sourceName => ({ source_family: "apple-health", payload_json: JSON.stringify({ sourceName }) });
  assert.deepEqual(recorderOf(row("Aurin")), { name: "Aurin", logo: "aurin" });
  assert.deepEqual(recorderOf(row("Petr's Apple Watch")), { name: "Apple Watch", logo: "apple" });
  assert.deepEqual(recorderOf(row("Strava")), { name: "Strava", logo: "apple" });
  assert.deepEqual(recorderOf(row("")), { name: "Apple Health", logo: "apple" });
  assert.deepEqual(recorderOf({ source_family: "google-wearables", payload_json: "{}" }), { name: "Google Health", logo: "google" });
});

test("deleting a merged workout takes the other device's record with it", async () => {
  const { env, insert, live } = setup();
  insert(aurin); insert(watch);
  await mergeWorkouts(env, { ids: ["apple:AAA", "apple:WWW"], energy: "apple:WWW" }, { fetchImpl: async () => new Response("{}") });
  await deleteActivity(env, { id: "apple:WWW" });
  await legacy.fetch(new Request("https://internal/sync/match", { method: "POST" }), env, { waitUntil() {} });
  assert.deepEqual(live(), []);
});

test("a merged copy written to Apple Health again under a new id stays merged (Petr's gym, 2026-10-18)", async () => {
  const { raw, env, insert, live } = setup();
  const google = id => ({ ...watch, external_id: id, payload: { ...watch.payload, sourceName: "Google Health", exercise: { ...watch.payload.exercise, metricsSummary: { caloriesKcal: 465 } } } });
  insert(aurin); insert(google("apple:OLD"));
  await mergeWorkouts(env, { ids: ["apple:AAA", "apple:OLD"], energy: "apple:AAA", span: "both" }, { fetchImpl: async () => { throw new Error("no send"); } });
  // Google Health writes the workout again: the old copy goes, a new one comes.
  raw.sqlite.prepare("DELETE FROM health_datapoints WHERE external_id = 'apple:OLD'").run();
  insert(google("apple:NEW"));
  assert.equal(live().length, 2);
  await legacy.fetch(new Request("https://internal/sync/match", { method: "POST" }), env, { waitUntil() {} });
  assert.deepEqual(live().map(r => r.external_id), ["apple:AAA"]);
  const kept = live()[0];
  assert.equal(JSON.parse(kept.payload_json).loadwiseMerge.with, "apple-health:apple:NEW");
  // A workout from another device at another time is left alone.
  insert({ ...google("apple:RUN"), start_time: "2026-10-17T20:06:00Z", end_time: "2026-10-17T20:31:00Z" });
  await legacy.fetch(new Request("https://internal/sync/match", { method: "POST" }), env, { waitUntil() {} });
  assert.deepEqual(live().map(r => r.external_id), ["apple:AAA", "apple:RUN"]);
});

test("a watch workout with only heart-rate samples gets their mean", () => {
  const row = { ...watch, payload_json: JSON.stringify({ ...watch.payload, exercise: { exerciseType: "RUNNING", metricsSummary: { caloriesKcal: 187 } }, samples: { heartRate: [[0, 100], [20, 104], [40, 98], [60, 110], [80, 108]] } }) };
  assert.equal(googleExerciseActivity(row).averageHeartRate, 104);
});
