import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { heartRateWindow, heartRateKcal } from "../src/manual-heart-rate.js";

function database() {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT NOT NULL, record_role TEXT DEFAULT 'primary', UNIQUE (user_id, source_family, data_type, external_id));`);
  const sample = (user, time, value) => db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, payload_json) VALUES (?, 'google-wearables', 'heart-rate', ?, ?, ?)")
    .run(user, "hr:" + user + time, time, JSON.stringify({ heartRate: { beatsPerMinute: String(value) } }));
  const bucket = (user, time, avg, max, n) => db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (?, 'google-wearables', 'heart-rate-5min', ?, ?, ?, ?)")
    .run(user, "b:" + time, time, avg, JSON.stringify({ avg, max, n }));
  const energy = (start, end, kcal) => db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, value_numeric, payload_json) VALUES (1, 'google-wearables', 'active-energy-burned', ?, ?, ?, ?, '{}')")
    .run("e:" + start, start, end, kcal);
  return { db, sample, bucket, energy };
}

test("the samples inside the workout give its average and maximum, other users and other times stay out", async () => {
  const { db, sample } = database();
  sample(1, "2026-10-13T05:59:00Z", 70);
  sample(1, "2026-10-13T06:10:00Z", 120);
  sample(1, "2026-10-13T06:20:00Z", 140);
  sample(1, "2026-10-13T06:30:00Z", 160);
  sample(2, "2026-10-13T06:30:00Z", 190);
  sample(1, "2026-10-13T07:01:00Z", 80);
  const hr = await heartRateWindow(db, 1, { start: "2026-10-13T06:00:00Z", end: "2026-10-13T07:00:00Z" });
  assert.equal(hr.avgHr, 140);
  assert.equal(hr.maxHr, 160);
  assert.equal(hr.samples, 3);
  assert.equal(hr.kcal, null, "no weight, no estimate");
});

test("older workouts read the 5-minute rows weighted by their sample count", async () => {
  const { db, bucket } = database();
  bucket(1, "2026-09-20T06:00:00Z", 100, 120, 10);
  bucket(1, "2026-09-20T06:05:00Z", 150, 170, 30);
  const hr = await heartRateWindow(db, 1, { start: "2026-09-20T06:00:00Z", end: "2026-09-20T06:10:00Z" });
  assert.equal(hr.avgHr, 138);
  assert.equal(hr.maxHr, 170);
});

test("measured active energy wins over the heart rate estimate", async () => {
  const { db, sample, energy } = database();
  sample(1, "2026-10-13T06:10:00Z", 130);
  for (let m = 0; m < 30; m += 10) energy(`2026-10-13T06:${String(m).padStart(2, "0")}:00Z`, `2026-10-13T06:${String(m + 10).padStart(2, "0")}:00Z`, 80);
  const hr = await heartRateWindow(db, 1, { start: "2026-10-13T06:00:00Z", end: "2026-10-13T06:30:00Z", weightKg: 88, profile: { age: 35, sex: "male" } });
  assert.equal(hr.kcal, 240);
  assert.equal(hr.kcalSource, "energy");
});

test("an impossible window gives nothing", async () => {
  const { db } = database();
  assert.equal(await heartRateWindow(db, 1, { start: "2026-10-13T07:00:00Z", end: "2026-10-13T06:00:00Z" }), null);
  assert.equal(await heartRateWindow(db, 1, { start: "2026-10-13T00:00:00Z", end: "2026-10-14T00:00:00Z" }), null);
});

test("calories from heart rate are net of rest and need a real exercise heart rate", () => {
  const hour = heartRateKcal({ avgHr: 120, minutes: 60, weightKg: 88, age: 35, sex: "male" });
  assert.ok(hour > 350 && hour < 650, String(hour));
  assert.ok(heartRateKcal({ avgHr: 120, minutes: 60, weightKg: 60, age: 35, sex: "female" }) < hour);
  assert.equal(heartRateKcal({ avgHr: 65, minutes: 60, weightKg: 88 }), null);
  assert.equal(heartRateKcal({ avgHr: 120, minutes: 60, weightKg: null }), null);
});
