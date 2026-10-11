import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { appleRow, saveAppleHealth, disconnectAppleHealth, appleHealthStatus, afterGoogleSync } from "../src/apple-health.js";
import { googleDashboard } from "../src/google-dashboard.js";
import { sleepSessionFromRow } from "../src/sleep-sessions.js";
import { averageRestingHeartRate } from "../src/profile-suggestions.js";
import { connectionStatus } from "../src/connections.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, db: scopedDb(raw, 1) };
}
const rows = (raw, where = "1=1") => raw.sqlite.prepare(`SELECT * FROM health_datapoints WHERE ${where} ORDER BY id`).all().map(r => ({ ...r }));
const google = (raw, type, day, value, id = type + day) => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,sample_time,value_numeric,payload_json) VALUES(1,'google-wearables',?,?,?,?,?,?,?)")
  .run(type, id, type === "steps" ? day + "T08:00:00Z" : null, type === "steps" ? day + "T09:00:00Z" : null, type === "steps" ? null : day, value, JSON.stringify(type === "steps" ? { steps: { count: value } } : { dailyRestingHeartRate: { date: { year: 2026, month: 10, day: Number(day.slice(8)) }, beatsPerMinute: value } }));

test("HealthKit records become Google-shaped rows; invalid ones are left out", () => {
  const hrv = appleRow({ type: "daily-heart-rate-variability", id: "hrv:2026-10-10", date: "2026-10-10", value: 62.4, metric: "rmssd" });
  assert.equal(hrv.sample_time, "2026-10-10");
  assert.deepEqual(hrv.payload.dailyHeartRateVariability, { date: { year: 2026, month: 10, day: 10 }, averageHeartRateVariabilityMilliseconds: 62.4, metric: "rmssd" });
  const steps = appleRow({ type: "steps", id: "steps:2026-10-10T08", start: "2026-10-10T10:00:00+02:00", end: "2026-10-10T11:00:00+02:00", value: 1200 });
  assert.equal(steps.start_time, "2026-10-10T08:00:00Z");
  assert.equal(steps.payload.steps.count, 1200);
  const ride = appleRow({ type: "exercise", id: "W1", activity: "cycling", start: "2026-10-10T06:00:00Z", end: "2026-10-10T07:30:00Z", kcal: 900.4, avgHr: 141.2, maxHr: 176, distanceMeters: 42000, activeSeconds: 5300, heartRate: [[0, 95], [10, 120], [20, "x"]] });
  assert.equal(ride.payload.exercise.exerciseType, "BIKING");
  assert.equal(ride.payload.exercise.activeDuration, "5300s");
  assert.deepEqual(ride.payload.exercise.metricsSummary, { caloriesKcal: 900, distanceMeters: 42000, averageHeartRateBeatsPerMinute: 141, maxHeartRateBeatsPerMinute: 176 });
  assert.deepEqual(ride.payload.samples.heartRate, [[0, 95], [10, 120]]);
  assert.equal(appleRow({ type: "steps", id: "x", start: "2026-10-10T10:00", end: "2026-10-10T11:00", value: 1 }), null, "times need a zone");
  assert.equal(appleRow({ type: "daily-resting-heart-rate", id: "x", date: "2026-10-10", value: 400 }), null);
  assert.equal(appleRow({ type: "nope", id: "x" }), null);
  assert.equal(appleRow({ type: "weight", id: "bad id!", time: "2026-10-10T07:00:00Z", value: 80 }), null);
});

test("an Apple night reads as a session with stages and minutes asleep", () => {
  const night = appleRow({ type: "sleep", id: "sleep:1", start: "2026-10-09T21:30:00Z", end: "2026-10-10T05:30:00Z", stages: [
    { type: "core", start: "2026-10-09T21:30:00Z", end: "2026-10-10T00:00:00Z" },
    { type: "deep", start: "2026-10-10T00:00:00Z", end: "2026-10-10T01:00:00Z" },
    { type: "awake", start: "2026-10-10T01:00:00Z", end: "2026-10-10T01:20:00Z" },
    { type: "rem", start: "2026-10-10T01:20:00Z", end: "2026-10-10T05:30:00Z" }
  ] });
  const session = sleepSessionFromRow({ external_id: night.external_id, start_time: night.start_time, end_time: night.end_time, payload_json: JSON.stringify(night.payload) });
  assert.deepEqual(session.stages, { LIGHT: 150, DEEP: 60, AWAKE: 20, REM: 250 });
  assert.equal(session.durationMin, 460);
  assert.equal(session.timeInBedMin, 480);
  assert.equal(session.nap, false);
});

test("saving is idempotent and the Health summary reads Apple rows", async () => {
  const { raw, db } = setup();
  const body = { categories: ["heart", "activity"], records: [
    { type: "daily-resting-heart-rate", id: "rhr:2026-10-10", date: "2026-10-10", value: 51 },
    { type: "daily-heart-rate-variability", id: "hrv:2026-10-10", date: "2026-10-10", value: 70, metric: "rmssd" },
    { type: "steps", id: "steps:2026-10-10T08", start: "2026-10-10T08:00:00Z", end: "2026-10-10T09:00:00Z", value: 3000 },
    { type: "time-in-heart-rate-zone", id: "zone:2026-10-10:MODERATE", zone: "MODERATE", minutes: 42, start: "2026-10-09T22:00:00Z" },
    { type: "bogus", id: "x" }
  ] };
  assert.deepEqual(await saveAppleHealth(db, 1, body), { status: "ok", saved: 4, skipped: 1, removed: 0, replaced: 0 });
  const before = rows(raw).map(r => r.updated_at + r.payload_json);
  raw.sqlite.exec("UPDATE health_datapoints SET updated_at='2000-01-01'");
  await saveAppleHealth(db, 1, body);
  assert.ok(rows(raw).every(r => r.updated_at === "2000-01-01"), "unchanged records are not written again");
  assert.equal(before.length, 4);
  assert.ok(rows(raw).every(r => r.record_role === "primary"));

  const summary = await googleDashboard(db, "2026-10-10");
  assert.equal(summary.today.restingHR, 51);
  assert.equal(summary.today.hrv, 70);
  assert.equal(summary.today.steps, 3000);
  assert.deepEqual(summary.wellness.find(d => d.id === "2026-10-10").hrZoneMinutes, { light: 0, moderate: 42, vigorous: 0, peak: 0 });
  const status = await appleHealthStatus(db, 1);
  assert.equal(status.connected, true);
  assert.deepEqual(status.categories, ["heart", "activity"]);
  const providers = (await connectionStatus({ DB: db, USER_ID: 1 })).providers;
  assert.equal(providers.find(p => p.id === "apple").connected, true);
});

test("Google rows of the days Apple covers become duplicates; disconnecting keeps the data", async () => {
  const { raw, db } = setup();
  google(raw, "steps", "2026-10-10", 2900);
  google(raw, "steps", "2026-10-08", 5000);
  google(raw, "daily-resting-heart-rate", "2026-10-10", 52);
  await saveAppleHealth(db, 1, { records: [
    { type: "steps", id: "steps:2026-10-10T08", start: "2026-10-10T08:00:00Z", end: "2026-10-10T09:00:00Z", value: 3000 },
    { type: "steps", id: "steps:2026-10-09T08", start: "2026-10-09T08:00:00Z", end: "2026-10-09T09:00:00Z", value: 100 }
  ] });
  const role = id => rows(raw, `external_id='${id}'`)[0].record_role;
  assert.equal(role("steps2026-10-10"), "duplicate");
  assert.equal(role("steps2026-10-08"), "primary", "a day Apple did not send keeps Google");
  assert.equal(role("daily-resting-heart-rate2026-10-10"), "primary", "a type Apple did not send keeps Google");
  assert.equal((await googleDashboard(db, "2026-10-10")).today.steps, 3000, "the day is counted once");

  // A later Google sync writes a new row for a covered day.
  google(raw, "steps", "2026-10-09", 120, "late");
  await afterGoogleSync({ DB: db, USER_ID: 1 }, "steps", [{}]);
  assert.equal(role("late"), "duplicate");

  await disconnectAppleHealth(db, 1);
  assert.equal(rows(raw, "source_family='apple-health'").length, 2);
  assert.equal((await googleDashboard(db, "2026-10-10")).today.steps, 3000);
  // Nothing new replaces Google once disconnected.
  google(raw, "steps", "2026-10-09", 130, "after");
  await afterGoogleSync({ DB: db, USER_ID: 1 }, "steps", [{}]);
  assert.equal(role("after"), "primary");
  assert.equal((await appleHealthStatus(db, 1)).connected, false);
  assert.equal((await connectionStatus({ DB: db, USER_ID: 1 })).providers.some(p => p.id === "apple"), false);
});

test("a workout deleted on the phone is removed inside the window it sent", async () => {
  const { raw, db } = setup();
  const w = id => ({ type: "exercise", id, activity: "running", start: "2026-10-0" + id.slice(1) + "T06:00:00Z", end: "2026-10-0" + id.slice(1) + "T07:00:00Z" });
  await saveAppleHealth(db, 1, { records: [w("W1"), w("W2"), w("W5")], windows: { exercise: { from: "2026-10-01T00:00:00Z", to: "2026-10-06T00:00:00Z" } } });
  assert.equal(rows(raw, "data_type='exercise'").length, 3);
  const result = await saveAppleHealth(db, 1, { records: [w("W1")], windows: { exercise: { from: "2026-10-02T00:00:00Z", to: "2026-10-06T00:00:00Z" } } });
  assert.equal(result.removed, 2);
  assert.deepEqual(rows(raw, "data_type='exercise'").map(r => r.external_id), ["apple:W1"]);
  const none = await saveAppleHealth(db, 1, { records: [], windows: { exercise: { from: "2026-10-01T00:00:00Z", to: "2026-10-06T00:00:00Z" } } });
  assert.equal(none.removed, 1);
});

test("profile suggestions take Apple's resting heart rate", async () => {
  const { db } = setup();
  const now = Date.parse("2026-10-11T12:00:00Z");
  await saveAppleHealth(db, 1, { records: ["07", "08", "09", "10"].map((d, i) => ({ type: "daily-resting-heart-rate", id: "rhr:" + d, date: "2026-10-" + d, value: 50 + i })) });
  assert.equal(await averageRestingHeartRate(db, 1, now), 52);
});

test("too many records are refused", async () => {
  const { db } = setup();
  const result = await saveAppleHealth(db, 1, { records: Array.from({ length: 5001 }, () => ({})) });
  assert.equal(result.code, 413);
});
