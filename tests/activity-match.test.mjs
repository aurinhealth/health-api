import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import legacy from "../src/index.js";
import { sameSession, pairSessions } from "../src/activity-match.js";
import { activityFromRow, dedupeActivities } from "../src/coach-reflection.js";
import { withTimeZone } from "../src/user-time.js";

// Shapes as stored in production (Prague, October = UTC+2).
const ride = { source_family: "intervals", external_id: "activity:1", start_time: "2026-10-07T16:43:03", payload_json: JSON.stringify({ id: "1", type: "Ride", name: "Z2", start_date_local: "2026-10-07T16:43:03", start_date: "2026-10-07T14:43:03Z", moving_time: 4933, elapsed_time: 5159 }) };
const watchRide = { source_family: "google-wearables", external_id: "g-ride", start_time: "2026-10-07T14:44:10Z", end_time: "2026-10-07T16:10:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: "BIKING", activeDuration: "5100s", interval: { startUtcOffset: "7200s" } } }) };
// Intervals.icu shows Strava activities as a stub whose "local" time is the UTC one.
const stravaStub = { source_family: "intervals", external_id: "activity:2", start_time: "2026-10-02T13:34:38", payload_json: JSON.stringify({ id: "2", start_date_local: "2026-10-02T13:34:38", source: "STRAVA", _note: "STRAVA activities are not available via the API" }) };
const watchGym = { source_family: "google-wearables", external_id: "g-gym", start_time: "2026-10-02T13:34:38Z", end_time: "2026-10-02T14:37:28.025015831Z", payload_json: JSON.stringify({ exercise: { exerciseType: "WEIGHTS", activeDuration: "3765s" } }) };
const walk = { source_family: "google-wearables", external_id: "g-walk", start_time: "2026-10-07T14:50:00Z", end_time: "2026-10-07T15:30:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: "WALKING", activeDuration: "2400s" } }) };
const shortCardio = { source_family: "google-wearables", external_id: "g-cardio", start_time: "2026-10-07T14:47:00Z", end_time: "2026-10-07T15:17:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: "CARDIO_WORKOUT", activeDuration: "1800s" } }) };

test("one ride from Intervals.icu (local time) and Google Health (UTC) is one workout", () => {
  assert.equal(sameSession(ride, watchRide), true);
  assert.deepEqual(pairSessions([ride, watchRide]).map(p => [p.keep.external_id, p.drop.external_id]), [["activity:1", "g-ride"]]);
});

test("a Strava stub and the watch's gym session are one workout; the watch's data is kept", () => {
  assert.equal(sameSession(stravaStub, watchGym), true);
  assert.deepEqual(pairSessions([stravaStub, watchGym]).map(p => [p.keep.external_id, p.drop.external_id]), [["g-gym", "activity:2"]]);
});

test("Google's cardio pieces inside a ride are part of it", () => {
  assert.equal(sameSession(ride, shortCardio), true);
  assert.deepEqual(pairSessions([ride, shortCardio]).map(p => [p.keep.external_id, p.drop.external_id, p.inside]), [["activity:1", "g-cardio", true]]);
  const after = { ...shortCardio, start_time: "2026-10-07T16:05:00Z", end_time: "2026-10-07T16:35:00Z" };
  assert.equal(sameSession(ride, after), false);
});

test("another sport or a different session at the same time stays separate", () => {
  assert.equal(sameSession(ride, walk), false);
  const longer = { ...shortCardio, end_time: "2026-10-07T17:30:00Z" };
  assert.equal(sameSession(ride, longer), false);
  // A full activity is never read as UTC, only a stub.
  const local = { ...ride, payload_json: JSON.stringify({ type: "Ride", name: "Z2", start_date_local: "2026-10-07T14:44:00", elapsed_time: 5159 }) };
  assert.equal(sameSession(local, watchRide), false);
});

test("the coach's activity list keeps the ride once", () => {
  const list = dedupeActivities([watchRide, ride].map(activityFromRow));
  assert.equal(list.length, 1);
  assert.equal(list[0].source, "intervals");
  assert.equal(list[0].start, "2026-10-07T16:43");
  assert.equal(JSON.stringify(list[0]).includes("session"), false);
});

function setup() {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const insert = row => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,?,?,?,?,?,?)")
    .run(row.source_family, row.source_family === "google-wearables" ? "exercise" : "activity", row.external_id, row.start_time, row.end_time || null, row.payload_json);
  const env = { DB: scopedDb(raw, 1), USER_ID: 1, CONNECTED_PROVIDERS: [] };
  const roles = () => Object.fromEntries(raw.sqlite.prepare("SELECT external_id,record_role,matched_activity_id FROM health_datapoints ORDER BY external_id").all().map(r => [r.external_id, [r.record_role, r.matched_activity_id]]));
  const match = () => legacy.fetch(new Request("https://internal/sync/match", { method: "POST" }), env, { waitUntil() {} }).then(r => r.json());
  return { raw, env, insert, roles, match };
}

test("the sync marks the copy as a duplicate and undoes a pair that no longer holds", async () => {
  const { raw, insert, roles, match } = setup();
  for (const row of [ride, watchRide, stravaStub, watchGym, walk]) insert(row);
  assert.deepEqual(await match(), { matched: 2, updated: 4 });
  assert.deepEqual(roles(), {
    "activity:1": ["primary", "google-wearables:g-ride"],
    "activity:2": ["duplicate", "google-wearables:g-gym"],
    "g-gym": ["primary", "intervals:activity:2"],
    "g-ride": ["duplicate", "intervals:activity:1"],
    "g-walk": ["primary", null]
  });
  assert.deepEqual(await match(), { matched: 2, updated: 0 });
  raw.sqlite.prepare("DELETE FROM health_datapoints WHERE external_id='activity:1'").run();
  assert.deepEqual(await match(), { matched: 1, updated: 1 });
  assert.deepEqual(roles()["g-ride"], ["primary", null]);
});

test("a watch workout just after midnight counts on that day, in the user's zone", async () => {
  const { insert, env } = setup();
  // 00:30 on 8 Oct in Prague is 22:30 UTC on 7 Oct.
  insert({ source_family: "google-wearables", external_id: "g-night", start_time: "2026-10-07T22:30:00Z", end_time: "2026-10-07T23:10:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: "RUNNING", activeDuration: "2400s", displayName: "Night run" } }) });
  const day = date => legacy.fetch(new Request("https://internal/analysis/daily?date=" + date), env, { waitUntil() {} }).then(r => r.json()).then(d => (d.training?.completed || []).map(a => a.name));
  assert.deepEqual(await day("2026-10-08"), ["Night run"]);
  assert.deepEqual(await day("2026-10-07"), []);
  // In New York the same run was on the evening of 7 Oct.
  assert.deepEqual(await withTimeZone("America/New_York", () => day("2026-10-07")), ["Night run"]);
});
