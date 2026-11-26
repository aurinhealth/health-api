import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { heartRateWindow } from "../src/manual-heart-rate.js";
import { storedHeartRate } from "../src/watch-detail.js";
import { heartRateInWindows } from "../src/index.js";
import { d1Recovery } from "../src/strength-context.js";
import { HEART_RATE_BUNDLE_TYPE } from "../src/heart-rate-compaction.js";

// Google's 5-minute heart rate kept as a row an hour (heart-rate-compaction.js):
// every reader of the 5-minute rows reads its 5 minutes the same way.
const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const db = createD1();
  db.sqlite.exec(schema);
  const hour = (user, time, slots) => db.sqlite.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json)
    VALUES (?, 'google-wearables', '${HEART_RATE_BUNDLE_TYPE}', ?, ?, ?, ?, ?, 'bpm', ?)`)
    .run(user, "hr5h:" + Date.parse(time) / 1000, time, time, new Date(Date.parse(time) + 3600e3).toISOString().replace(".000Z", "Z"), 0,
      JSON.stringify({ b: Array.from({ length: 12 }, (_, k) => slots[k] == null ? null : { avg: slots[k], min: slots[k] - 5, max: slots[k] + 5, n: 100, first: 0, last: 0 }) }));
  return { db, hour };
}

test("the 5 minutes of an hour row are read as the 5-minute rows were", async () => {
  const { db, hour } = setup();
  // 06:00 to 07:00: 60 bpm, a 40-minute workout at 140 from 06:20, nothing in the last 5 minutes.
  hour(1, "2026-10-13T06:00:00Z", [60, 60, 60, 60, 140, 140, 140, 140, 140, 140, 140, null]);
  hour(2, "2026-10-13T06:00:00Z", [190, 190, 190, 190, 190, 190, 190, 190, 190, 190, 190, 190]);
  const workout = { start: "2026-10-13T06:20:00Z", end: "2026-10-13T07:00:00Z" };

  const manual = await heartRateWindow(db, 1, workout);
  assert.deepEqual([manual.avgHr, manual.maxHr, manual.samples], [140, 145, 700], "the window's 5 minutes, not the hour's");

  const curve = await storedHeartRate(db, 1, workout.start, workout.end);
  assert.deepEqual(curve.map(([t]) => t), [0, 300, 600, 900, 1200, 1500, 1800]);
  assert.ok(curve.every(([, v]) => v === 140));

  assert.deepEqual(await heartRateInWindows(db, 1, [workout, { start: "2026-10-13T06:00:00Z", end: "2026-10-13T06:15:00Z" }]), [140, 60]);

  const recovery = await d1Recovery({ DB: db, USER_ID: 1 }, "2026-10-13", "2026-10-13");
  assert.deepEqual([recovery["heart-rate"][0].sampleTime, recovery["heart-rate"][0].value], ["2026-10-13T06:50:00Z", 140], "the hour's last 5 minutes");
});
