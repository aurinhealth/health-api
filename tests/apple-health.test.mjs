import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { appleRow, saveAppleHealth, disconnectAppleHealth, appleHealthStatus, afterGoogleSync, flushGoogleSync, appleBodyTooLarge, MAX_BODY_BYTES } from "../src/apple-health.js";
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
  // Without "in bed" samples nothing says how long falling asleep took.
  assert.equal(session.latencyMin, null);
});

test("an Apple night with its time in bed has a real efficiency, latency and wake after sleep onset", () => {
  // In bed 21:00–06:00, asleep 21:30–05:30 with 20 min awake inside.
  const night = appleRow({ type: "sleep", id: "sleep:2", inBed: true, start: "2026-10-09T21:00:00Z", end: "2026-10-10T06:00:00Z", stages: [
    { type: "awake", start: "2026-10-09T21:10:00Z", end: "2026-10-09T21:30:00Z" },
    { type: "core", start: "2026-10-09T21:30:00Z", end: "2026-10-10T00:00:00Z" },
    { type: "deep", start: "2026-10-10T00:00:00Z", end: "2026-10-10T01:00:00Z" },
    { type: "awake", start: "2026-10-10T01:00:00Z", end: "2026-10-10T01:20:00Z" },
    { type: "rem", start: "2026-10-10T01:20:00Z", end: "2026-10-10T05:30:00Z" }
  ] });
  assert.deepEqual(night.payload.sleep.summary, { minutesAwake: 30 + 20 + 30, minutesToFallAsleep: 30, minutesAfterWakeUp: 30 });
  const session = sleepSessionFromRow({ external_id: night.external_id, start_time: night.start_time, end_time: night.end_time, payload_json: JSON.stringify(night.payload) });
  assert.equal(session.durationMin, 460);
  assert.equal(session.timeInBedMin, 540);
  assert.equal(session.latencyMin, 30);
  assert.equal(session.wasoMin, 20);
  assert.equal(session.date, "2026-10-10");
});

test("the iPhone app keeps in-bed samples and gives breathing and oxygen to the night's wake-up day", () => {
  const swift = readFileSync(new URL("../ios-native/Aurin/App/AppleHealth.swift", import.meta.url), "utf8");
  assert.match(swift, /var inBed: Bool\? = nil/);
  assert.match(swift, /record\.inBed = true/);
  assert.match(swift, /nightly\(\.respiratoryRate,/);
  assert.match(swift, /nightly\(\.oxygenSaturation,/);
  assert.match(swift, /private func wakeDay\(_ date: Date\) -> String/);
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
  assert.deepEqual(await saveAppleHealth(db, 1, body), { status: "ok", saved: 4, changed: 4, skipped: 1, removed: 0, replaced: 0 });
  const before = rows(raw).map(r => r.updated_at + r.payload_json);
  raw.sqlite.exec("UPDATE health_datapoints SET updated_at='2000-01-01'");
  // The same hours again: nothing changed, so the cached screens stay valid.
  assert.equal((await saveAppleHealth(db, 1, body)).changed, 0);
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
  await flushGoogleSync({ DB: db, USER_ID: 1 });
  assert.equal(role("late"), "duplicate");

  await disconnectAppleHealth(db, 1);
  assert.equal(rows(raw, "source_family='apple-health'").length, 2);
  assert.equal((await googleDashboard(db, "2026-10-10")).today.steps, 3000);
  // Nothing new replaces Google once disconnected.
  google(raw, "steps", "2026-10-09", 130, "after");
  await afterGoogleSync({ DB: db, USER_ID: 1 }, "steps", [{}]);
  await flushGoogleSync({ DB: db, USER_ID: 1 });
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
  assert.equal(none.removed, 0, "a window with no workouts sent deletes nothing");
  assert.deepEqual(rows(raw, "data_type='exercise'").map(r => r.external_id), ["apple:W1"]);
});

const night = d => ({ type: "sleep", id: "sleep:2026-" + d + "T21:00:00Z", start: "2026-" + d + "T21:00:00Z", end: new Date(Date.parse("2026-" + d + "T21:00:00Z") + 8 * 3600000).toISOString(),
  stages: [{ type: "CORE", start: "2026-" + d + "T21:00:00Z", end: new Date(Date.parse("2026-" + d + "T21:00:00Z") + 8 * 3600000).toISOString() }] });
const nights = n => Array.from({ length: n }, (_, i) => night("09-" + String(i + 1).padStart(2, "0")));
const sleepWindow = { sleep: { from: "2026-08-31T12:00:00Z", to: "2026-10-12T00:00:00Z" } };

test("an empty sleep read (access denied, Health restoring) keeps the nights a window covers", async () => {
  const { raw, db } = setup();
  await saveAppleHealth(db, 1, { records: nights(20), windows: sleepWindow }, { now: NOW });
  assert.equal(rows(raw, "data_type='sleep'").length, 20);
  const empty = await saveAppleHealth(db, 1, { records: [], windows: sleepWindow, categories: ["sleep"] }, { now: NOW });
  assert.equal(empty.removed, 0);
  assert.equal(rows(raw, "data_type='sleep'").length, 20);
  // Records of other types do not make an empty sleep window count either.
  const steps = { type: "steps", id: "steps:2026-10-10T08", start: "2026-10-10T08:00:00Z", end: "2026-10-10T09:00:00Z", value: 300 };
  assert.equal((await saveAppleHealth(db, 1, { records: [steps], windows: sleepWindow }, { now: NOW })).removed, 0);
  assert.equal(rows(raw, "data_type='sleep'").length, 20);
});

test("a night deleted on the phone goes; most of the window missing at once is kept", async () => {
  const { raw, db } = setup();
  const all = nights(20);
  await saveAppleHealth(db, 1, { records: all, windows: sleepWindow }, { now: NOW });
  const one = await saveAppleHealth(db, 1, { records: all.filter((_, i) => i !== 4), windows: sleepWindow }, { now: NOW });
  assert.equal(one.removed, 1);
  assert.equal(rows(raw, "data_type='sleep'").length, 19);
  assert.equal(rows(raw, `external_id='apple:${all[4].id}'`).length, 0);
  // A partial read (three nights of nineteen) deletes nothing.
  const partial = await saveAppleHealth(db, 1, { records: all.slice(0, 3), windows: sleepWindow }, { now: NOW });
  assert.equal(partial.removed, 0);
  assert.equal(rows(raw, "data_type='sleep'").length, 19);
  // Up to five at once still go, even when that is most of a short window.
  const short = await saveAppleHealth(db, 1, { records: all.slice(0, 1), windows: { sleep: { from: "2026-08-31T12:00:00Z", to: "2026-09-07T12:00:00Z" } } }, { now: NOW });
  assert.equal(short.removed, 4);
  assert.equal(rows(raw, "data_type='sleep'").length, 15);
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

const NOW = Date.parse("2026-10-12T12:00:00Z");

test("days have to exist and lie within the last 400 days up to tomorrow; instants too", () => {
  const daily = (date, extra = {}) => appleRow({ type: "daily-resting-heart-rate", id: "rhr:" + date, date, value: 50, ...extra }, NOW);
  assert.equal(daily("2026-10-10").sample_time, "2026-10-10");
  assert.equal(daily("2026-10-13").sample_time, "2026-10-13", "tomorrow (the phone may be a day ahead)");
  assert.equal(daily("2026-10-14"), null, "the day after tomorrow");
  assert.equal(daily("2025-09-07").sample_time, "2025-09-07", "400 days back");
  assert.equal(daily("2025-09-06"), null, "401 days back");
  assert.equal(daily("2026-02-30"), null, "no such day");
  assert.equal(daily("2026-13-01"), null);
  assert.equal(daily("2026-1-01"), null);
  const steps = (start, end) => appleRow({ type: "steps", id: "s", start, end, value: 10 }, NOW);
  assert.ok(steps("2026-10-12T10:00:00Z", "2026-10-12T11:00:00Z"));
  assert.equal(steps("2024-10-12T10:00:00Z", "2024-10-12T11:00:00Z"), null, "two years ago");
  assert.equal(steps("2026-10-13T11:00:00Z", "2026-10-13T13:00:00Z"), null, "past tomorrow noon");
  assert.equal(appleRow({ type: "weight", id: "w", time: "2026-10-20T07:00:00Z", value: 80 }, NOW), null);
  assert.equal(appleRow({ type: "exercise", id: "W", activity: "running", start: "2025-01-01T06:00:00Z", end: "2025-01-01T07:00:00Z" }, NOW), null);
});

test("heart-rate points and sleep stages are capped, not refused", () => {
  const ride = appleRow({ type: "exercise", id: "W1", activity: "cycling", start: "2026-10-10T06:00:00Z", end: "2026-10-10T07:30:00Z", heartRate: Array.from({ length: 1000 }, (_, i) => [i * 5, 100 + (i % 50)]) }, NOW);
  assert.equal(ride.payload.samples.heartRate.length, 720);
  assert.deepEqual(ride.payload.samples.heartRate[719], [3595, 100 + (719 % 50)]);
  const stage = i => ({ type: i % 2 ? "core" : "deep", start: new Date(Date.parse("2026-10-09T21:00:00Z") + i * 60000).toISOString(), end: new Date(Date.parse("2026-10-09T21:00:00Z") + (i + 1) * 60000).toISOString() });
  const night = appleRow({ type: "sleep", id: "N1", start: "2026-10-09T21:00:00Z", end: "2026-10-10T05:30:00Z", stages: Array.from({ length: 500 }, (_, i) => stage(i)) }, NOW);
  assert.equal(night.payload.sleep.stages.length, 400);
});

test("only accepted rows set how far back Google is replaced, and a window never reaches past the range", async () => {
  const { raw, db } = setup();
  google(raw, "steps", "2024-10-10", 2900, "ancient");
  google(raw, "steps", "2026-10-10", 3100, "recent");
  const result = await saveAppleHealth(db, 1, { records: [
    { type: "steps", id: "steps:old", start: "2024-10-10T08:00:00Z", end: "2024-10-10T09:00:00Z", value: 1 },
    { type: "steps", id: "steps:2026-10-10T08", start: "2026-10-10T08:00:00Z", end: "2026-10-10T09:00:00Z", value: 3000 }
  ] }, { now: NOW });
  assert.deepEqual([result.saved, result.skipped, result.replaced], [1, 1, 1]);
  const role = id => rows(raw, `external_id='${id}'`)[0].record_role;
  assert.equal(role("recent"), "duplicate");
  assert.equal(role("ancient"), "primary", "the refused old row did not widen the replacement");
  // Workouts from before the range stay when the phone's window starts further back than the app reads.
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,'apple-health','exercise','apple:W0','2024-06-01T06:00:00Z','2024-06-01T07:00:00Z','{}')").run();
  const w = { type: "exercise", id: "W1", activity: "running", start: "2026-10-01T06:00:00Z", end: "2026-10-01T07:00:00Z" };
  await saveAppleHealth(db, 1, { records: [w], windows: { exercise: { from: "2024-01-01T00:00:00Z", to: "2026-10-12T00:00:00Z" } } }, { now: NOW });
  assert.deepEqual(rows(raw, "data_type='exercise'").map(r => r.external_id), ["apple:W0", "apple:W1"]);
  const w2 = { ...w, id: "W2", start: "2026-10-02T06:00:00Z", end: "2026-10-02T07:00:00Z" };
  const gone = await saveAppleHealth(db, 1, { records: [w2], windows: { exercise: { from: "2024-01-01T00:00:00Z", to: "2026-10-12T00:00:00Z" } } }, { now: NOW });
  assert.equal(gone.removed, 1, "inside the range the window still deletes what the phone no longer has");
  assert.deepEqual(rows(raw, "data_type='exercise'").map(r => r.external_id), ["apple:W0", "apple:W2"]);
});

test("a request declared over 4 MB is refused before it is read", () => {
  const request = size => new Request("https://aurin.health/app/api/health/apple", { method: "POST", headers: size == null ? {} : { "Content-Length": String(size) }, body: "{}" });
  assert.equal(MAX_BODY_BYTES, 4 * 1024 * 1024);
  assert.equal(appleBodyTooLarge(request(MAX_BODY_BYTES)), false);
  assert.equal(appleBodyTooLarge(request(MAX_BODY_BYTES + 1)), true);
  assert.equal(appleBodyTooLarge(request(null)), false);
});

test("a Fitbit workout counts as Google Health has it; the Apple Watch's as Apple Health has it, matched by time", async () => {
  const { raw, db } = setup();
  const watch = (id, start, end, type, extra = {}) => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json,record_role,matched_activity_id) VALUES(1,'google-wearables','exercise',?,?,?,?,?,?)")
    .run(id, start, end, JSON.stringify({ exercise: { exerciseType: type } }), extra.role ?? "primary", extra.matched ?? null);
  // The Fitbit's walk, changed from a run in Google Health; hidden by the old day-wide rule.
  watch("g-walk", "2026-10-22T13:49:00Z", "2026-10-22T14:22:00Z", "WALKING", { role: "duplicate", matched: "apple-health" });
  // Google Health's import of the morning Apple Watch ride.
  watch("g-ride", "2026-10-22T05:00:30Z", "2026-10-22T06:00:00Z", "BIKING");
  await saveAppleHealth(db, 1, { records: [
    // Google Health's iPhone app wrote the run into Apple Health before the change.
    { type: "exercise", id: "W1", activity: "running", start: "2026-10-22T13:49:00Z", end: "2026-10-22T14:22:00Z", sourceName: "Google Health" },
    { type: "exercise", id: "W2", activity: "cycling", start: "2026-10-22T05:00:00Z", end: "2026-10-22T06:00:00Z", sourceName: "Apple Watch uživatele Petr" }
  ] });
  const role = id => { const r = rows(raw, `external_id='${id}'`)[0]; return [r.record_role, r.matched_activity_id]; };
  assert.deepEqual(role("g-walk"), ["primary", null]);
  assert.deepEqual(role("apple:W1"), ["duplicate", "google-wearables"]);
  assert.deepEqual(role("g-ride"), ["duplicate", "apple-health"]);
  assert.deepEqual(role("apple:W2"), ["primary", null]);
  // A Google workout at another time that day stays.
  watch("g-later", "2026-10-22T18:00:00Z", "2026-10-22T18:30:00Z", "WALKING");
  await afterGoogleSync({ DB: db, USER_ID: 1 }, "exercise", [{}]);
  assert.deepEqual(role("g-later"), ["primary", null]);
  // Google gone (disconnected, or the workout deleted there): the Apple copy shows again.
  raw.sqlite.exec("DELETE FROM health_datapoints WHERE external_id='g-walk'");
  await afterGoogleSync({ DB: db, USER_ID: 1 }, "exercise", [{}]);
  assert.deepEqual(role("apple:W1"), ["primary", null]);
});

// E in audit/zrychleni-aplikace-mereni-2026-10-29.md: the app sends the same
// hours on most syncs; only rows written or deleted choose sources again.
test("a sync with nothing new chooses no source again; a changed hour does", async () => {
  const { raw, db } = setup();
  google(raw, "steps", "2026-10-10", 500);
  const records = [{ type: "steps", id: "steps:2026-10-10T08", start: "2026-10-10T08:00:00Z", end: "2026-10-10T09:00:00Z", value: 1200 }, { type: "daily-resting-heart-rate", id: "rhr:2026-10-10", date: "2026-10-10", value: 52 }];
  const now = Date.parse("2026-10-11T12:00:00Z");
  const seen = [], prepare = raw.prepare.bind(raw);
  raw.prepare = sql => { seen.push(sql); return prepare(sql); };
  const choosing = () => seen.filter(sql => /MAX\(record_role = 'primary'\) kept/.test(sql)).length;
  await saveAppleHealth(db, 1, { records }, { now });
  assert.ok(choosing() > 0);
  assert.equal(rows(raw, "source_family='google-wearables' AND data_type='steps'")[0].record_role, "duplicate");
  seen.length = 0;
  const again = await saveAppleHealth(db, 1, { records: records.map(r => ({ ...r })) }, { now });
  assert.equal(again.changed, 0);
  assert.equal(choosing(), 0, "nothing new, nothing chosen again");
  seen.length = 0;
  await saveAppleHealth(db, 1, { records: [{ ...records[0], value: 1300 }, records[1]] }, { now });
  assert.ok(choosing() > 0);
  assert.equal(rows(raw, "source_family='google-wearables' AND data_type='steps'")[0].record_role, "duplicate");
});

test("sexual activity is kept only while the app says Sex is in the journal; otherwise what came before goes", async () => {
  const { raw, db } = setup();
  const now = Date.parse("2026-10-16T12:00:00Z");
  const records = [{ type: "daily-sexual-activity", id: "journal:daily-sexual-activity:2026-10-15", date: "2026-10-15", value: 1 }];
  const stored = () => raw.sqlite.prepare("SELECT COUNT(*) AS n FROM health_datapoints WHERE data_type='daily-sexual-activity'").get().n;
  await saveAppleHealth(db, 1, { records, sexualActivity: true }, { now });
  assert.equal(stored(), 1);
  // An app too old to say, or Sex taken out of the journal: not kept, the old days deleted.
  await saveAppleHealth(db, 1, { records }, { now });
  assert.equal(stored(), 0);
  await saveAppleHealth(db, 1, { records: [], sexualActivity: true }, { now });
  await saveAppleHealth(db, 1, { records, sexualActivity: true }, { now });
  assert.equal(stored(), 1);
  await saveAppleHealth(db, 1, { records: [], sexualActivity: false }, { now });
  assert.equal(stored(), 0);
});
