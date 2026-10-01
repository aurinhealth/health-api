import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { d1Recovery } from "../src/strength-context.js";

test("recovery reads only the latest value per type, even with minute-level heart rate", async () => {
  const db = createD1();
  await db.prepare("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT)").run();
  const rows = [];
  // A week of minute-level heart rate: ~10 000 rows.
  for (let i = 0; i < 10080; i++) { const t = new Date(Date.UTC(2026, 8, 24) + i * 60000).toISOString().slice(0, 19); rows.push([1, "google-health", "heart_rate", t, null, 60 + (i % 40), "bpm", JSON.stringify({ i })]); }
  rows.push([1, "google-health", "sleep_duration_minutes", null, "2026-09-30T22:30:00", 455, "min", "{}"]);
  rows.push([1, "google-health", "sleep_duration_minutes", null, "2026-09-29T22:30:00", 380, "min", "{}"]);
  rows.push([1, "google-health", "hrv", "2026-10-01T06:00:00", null, 88, "ms", "{}"]);
  rows.push([2, "google-health", "hrv", "2026-10-01T07:00:00", null, 40, "ms", "{}"]); // another user
  rows.push([1, "google-health", "steps", "2026-10-01T08:00:00", null, 5000, "count", "{}"]); // not a recovery type
  for (const r of rows) await db.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, sample_time, start_time, value_numeric, value_unit, payload_json) VALUES (?,?,?,?,?,?,?,?)").bind(...r).run();
  const started = performance.now();
  const out = await d1Recovery({ DB: db, USER_ID: 1 }, "2026-09-24", "2026-10-02");
  assert.ok(performance.now() - started < 2000);
  assert.deepEqual(Object.keys(out).sort(), ["heart_rate", "hrv", "sleep_duration_minutes"]);
  for (const v of Object.values(out)) assert.equal(v.length, 1);
  assert.equal(out.sleep_duration_minutes[0].value, 455);
  assert.equal(out.hrv[0].value, 88);
  assert.equal(out.heart_rate[0].sampleTime, "2026-09-30T23:59:00");
});
