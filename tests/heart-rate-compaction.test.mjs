import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { compactHeartRate, HEART_RATE_BUCKET_TYPE } from "../src/heart-rate-compaction.js";
import { heartRateFromSamples } from "../src/index.js";

function database() {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, record_role TEXT DEFAULT 'primary', UNIQUE (user_id, source_family, data_type, external_id));`);
  const insert = db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, payload_json) VALUES (?, ?, 'heart-rate', ?, ?, ?)");
  const sample = (user, time, bpm, family = "google-wearables") => insert.run(user, family, `${family}:${time}`, time, JSON.stringify({ heartRate: { beatsPerMinute: String(bpm) } }));
  return { db, sample, rows: sql => db.sqlite.prepare(sql).all().map(r => ({ ...r })) };
}
const now = Date.parse("2026-10-11T15:00:00Z");

test("heart rate older than two weeks becomes 5-minute rows, newer samples stay", async () => {
  const { db, sample, rows } = database();
  // 10 minutes of samples every 2 s, a month ago: 60, 62, 64, … in the first bucket.
  for (let i = 0; i < 300; i++) sample(1, new Date(Date.parse("2026-09-10T22:00:00Z") + i * 2000).toISOString().replace(".000Z", "Z"), i < 150 ? 60 + (i % 3) * 2 : 70);
  sample(1, "2026-10-10T08:00:00Z", 80);
  sample(2, "2026-09-10T22:00:00Z", 90);
  sample(1, "2026-09-10T22:00:00Z", 55, "apple-health");
  let runs = 0;
  while (await compactHeartRate(db, 1, { now })) runs++;
  assert.equal(runs, 1);
  const buckets = rows(`SELECT external_id, sample_time, end_time, value_numeric, payload_json FROM health_datapoints WHERE data_type = '${HEART_RATE_BUCKET_TYPE}' ORDER BY sample_time`);
  assert.deepEqual(buckets.map(b => [b.sample_time, b.end_time, b.value_numeric, JSON.parse(b.payload_json)]), [
    ["2026-09-10T22:00:00Z", "2026-09-10T22:05:00Z", 62, { avg: 62, min: 60, max: 64, n: 150 }],
    ["2026-09-10T22:05:00Z", "2026-09-10T22:10:00Z", 70, { avg: 70, min: 70, max: 70, n: 150 }]
  ]);
  // Recent samples, another user's and other sources stay as they were.
  assert.deepEqual(rows("SELECT user_id, source_family, sample_time FROM health_datapoints WHERE data_type = 'heart-rate' ORDER BY user_id, sample_time"), [
    { user_id: 1, source_family: "apple-health", sample_time: "2026-09-10T22:00:00Z" },
    { user_id: 1, source_family: "google-wearables", sample_time: "2026-10-10T08:00:00Z" },
    { user_id: 2, source_family: "google-wearables", sample_time: "2026-09-10T22:00:00Z" }
  ]);
  // A sample arriving late is merged into its bucket, weighted by count.
  for (let i = 0; i < 150; i++) sample(1, new Date(Date.parse("2026-09-10T22:05:00Z") + i * 2000 + 1000).toISOString().replace(".000Z", "Z"), 80);
  await compactHeartRate(db, 1, { now });
  const late = rows(`SELECT value_numeric, payload_json FROM health_datapoints WHERE external_id = 'hr5:' || ${Date.parse("2026-09-10T22:05:00Z") / 1000}`)[0];
  assert.deepEqual([late.value_numeric, JSON.parse(late.payload_json)], [75, { avg: 75, min: 70, max: 80, n: 300 }]);
  // The 5-minute rows still give an activity's average heart rate.
  const compacted = rows(`SELECT sample_time, value_numeric, payload_json FROM health_datapoints WHERE data_type = '${HEART_RATE_BUCKET_TYPE}'`);
  assert.equal(heartRateFromSamples({ start: "2026-09-10T21:55:00Z", end: "2026-09-10T22:20:00Z" }, [...compacted, { ...compacted[0], sample_time: "2026-09-10T22:10:00Z" }]), 66);
});
