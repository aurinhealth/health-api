import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { saveSyncPrefs, readSyncPrefs, othersSince } from "../src/sync-destinations.js";
import { appleHealthForward } from "../src/apple-health-forward.js";

const migration = readFileSync(new URL("../migrations/0019_sync_destinations.sql", import.meta.url), "utf8");
const NOW = Date.parse("2026-11-11T12:00:00Z");
function db() {
  const d = createD1();
  d.sqlite.exec(migration);
  d.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, updated_at TEXT)");
  const add = (family, type, start, end, value, payload) => d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, sample_time, value_numeric, payload_json) VALUES (7, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(family, type, type + start, start, end, start, value, JSON.stringify(payload || {}));
  add("google-wearables", "sleep", "2026-11-10T22:00:00.000Z", "2026-11-11T06:00:00.000Z", null, { sleep: { stages: [
    { type: "LIGHT", startTime: "2026-11-10T22:00:00Z", endTime: "2026-11-11T01:00:00Z" }, { type: "DEEP", startTime: "2026-11-11T01:00:00Z", endTime: "2026-11-11T02:00:00Z" }, { type: "UNKNOWN", startTime: "2026-11-11T02:00:00Z", endTime: "2026-11-11T03:00:00Z" }] } });
  // Apple Health's own night and WHOOP's never go back or on.
  add("apple-health", "sleep", "2026-11-10T22:10:00.000Z", "2026-11-11T06:00:00.000Z", null, {});
  add("whoop", "daily-resting-heart-rate", "2026-11-11T00:00:00Z", null, 50, {});
  add("google-wearables", "daily-resting-heart-rate", "2026-11-11T00:00:00Z", null, null, { dailyRestingHeartRate: { date: { year: 2026, month: 11, day: 11 }, beatsPerMinute: 52 } });
  add("google-wearables", "heart-rate-5min", null, null, 61.24, { n: 40 });
  d.sqlite.prepare("UPDATE health_datapoints SET sample_time = '2026-11-11T08:00:00Z' WHERE data_type = 'heart-rate-5min'").run();
  add("google-wearables", "steps", "2026-11-11T08:00:00.000Z", "2026-11-11T09:00:00.000Z", 1200, {});
  // Before the yes: not sent.
  add("google-wearables", "steps", "2026-11-01T08:00:00.000Z", "2026-11-01T09:00:00.000Z", 900, {});
  return d;
}

test("other apps' health data goes to Apple Health only after the yes, and only Google's watch data", async () => {
  const d = db(), env = { DB: d, USER_ID: 7 };
  // Ticked without the yes (an older app's "All"): nothing.
  await saveSyncPrefs(d, 7, "apple", { health: "all" }, { now: NOW });
  assert.equal(await othersSince(d, 7), null);
  assert.deepEqual(await appleHealthForward(env, { now: NOW }), {});
  // The yes, with the last 14 days.
  await saveSyncPrefs(d, 7, "apple", { health: ["sleep", "restingHR", "heartRate", "steps", "weight"], consent: true, backfill: true }, { now: NOW });
  assert.equal(await othersSince(d, 7), "2026-10-28T12:00:00.000Z");
  assert.deepEqual((await readSyncPrefs(d, 7, "apple")).health, ["sleep", "restingHR", "heartRate", "steps", "weight"]);
  const out = await appleHealthForward(env, { now: NOW, days: 14 });
  assert.deepEqual(Object.keys(out).sort(), ["heartRate", "restingHR", "sleep", "steps"]);
  assert.equal(out.sleep.length, 1);
  assert.deepEqual(out.sleep[0].stages.map(s => s.type), ["core", "deep"]);
  assert.deepEqual(out.restingHR, [{ date: "2026-11-11", value: 52 }]);
  assert.deepEqual(out.heartRate, [{ start: "2026-11-11T08:00:00.000Z", value: 61.2 }]);
  assert.deepEqual(out.steps.map(s => s.value), [900, 1200]);
  // Saving again keeps the first yes; turning every such type off ends it.
  await saveSyncPrefs(d, 7, "apple", { health: ["sleep"] }, { now: NOW + 86400000 });
  assert.equal(await othersSince(d, 7), "2026-10-28T12:00:00.000Z");
  await saveSyncPrefs(d, 7, "apple", { health: ["weight"] }, { now: NOW });
  assert.equal(await othersSince(d, 7), null);
  await saveSyncPrefs(d, 7, "apple", { health: ["sleep"] }, { now: NOW });
  assert.deepEqual(await appleHealthForward(env, { now: NOW }), {});
});

test("without backfill sending starts at the yes; days are capped", async () => {
  const d = db(), env = { DB: d, USER_ID: 7 };
  await saveSyncPrefs(d, 7, "apple", { health: ["steps"], consent: true }, { now: Date.parse("2026-11-11T08:30:00Z") });
  assert.deepEqual((await appleHealthForward(env, { now: NOW, days: 99 })).steps, []);
});
