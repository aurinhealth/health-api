import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { parseTcx, watchDetail, withWatch, zoneBounds } from "../src/watch-detail.js";

const GOOGLE_ID = "users/me/dataTypes/exercise/dataPoints/abc123";
const ZONES = [{ bpmHigh: 118 }, { bpmHigh: 140 }, { bpmHigh: 156 }, { bpmHigh: 170 }, { bpmHigh: null }];
const tcx = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity><Lap><Track>
<Trackpoint><Time>2026-10-13T06:00:00Z</Time><Position><LatitudeDegrees>50.08</LatitudeDegrees><LongitudeDegrees>14.42</LongitudeDegrees></Position><AltitudeMeters>200</AltitudeMeters><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>101</Value></HeartRateBpm></Trackpoint>
<Trackpoint><Time>2026-10-13T06:00:10Z</Time><AltitudeMeters>201</AltitudeMeters></Trackpoint>
<Trackpoint><Time>2026-10-13T06:00:20Z</Time><Position><LatitudeDegrees>50.081</LatitudeDegrees><LongitudeDegrees>14.421</LongitudeDegrees></Position><AltitudeMeters>202</AltitudeMeters><DistanceMeters>90</DistanceMeters></Trackpoint>
</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;

function database() {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT NOT NULL, record_role TEXT DEFAULT 'primary', matched_activity_id TEXT, updated_at TEXT, UNIQUE (user_id, source_family, data_type, external_id));`);
  const row = (family, type, id, start, end, payload, matched = null) => db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json, matched_activity_id) VALUES (1, ?, ?, ?, ?, ?, ?, ?)")
    .run(family, type, id, start, end, JSON.stringify(payload), matched);
  const sample = (time, bpm) => db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, payload_json) VALUES (1, 'google-wearables', 'heart-rate', ?, ?, ?)")
    .run("hr:" + time, time, JSON.stringify({ heartRate: { beatsPerMinute: String(bpm) } }));
  return { env: { DB: db, USER_ID: 1 }, db, row, sample };
}
const walk = { exercise: { displayName: "Chůze", exerciseType: "WALKING", activeDuration: "1800s", exerciseMetadata: { hasGps: true }, metricsSummary: { caloriesKcal: 150, distanceMillimeters: 2500000 } } };

test("TCX track points become seconds from the start with position, altitude and heart rate", () => {
  const points = parseTcx(tcx, "2026-10-13T06:00:00Z");
  assert.equal(points.length, 2, "a point without a position is left out");
  assert.deepEqual(points[0], { t: 0, lat: 50.08, lon: 14.42, alt: 200, dist: 0, hr: 101 });
  assert.equal(points[1].t, 20);
});

test("a Google walk gets its heart rate from the samples, zones and the route exported once", async () => {
  const { env, row, sample } = database();
  row("google-wearables", "exercise", GOOGLE_ID, "2026-10-13T06:00:00Z", "2026-10-13T06:30:00Z", walk);
  sample("2026-10-13T06:00:02Z", 100); sample("2026-10-13T06:00:05Z", 110); sample("2026-10-13T06:04:00Z", 130); sample("2026-10-13T07:00:00Z", 180);
  let calls = 0;
  const fetchImpl = async url => { calls++; assert.match(url, /abc123:exportExerciseTcx\?alt=media$/); return new Response(tcx); };
  const options = { source: "google-wearables", id: GOOGLE_ID, hrZones: ZONES, token: async () => "t", fetchImpl };
  const detail = await watchDetail(env, options);
  assert.equal(detail.activity.distance, 2500);
  assert.equal(detail.activity.moving_time, 1800);
  assert.equal(detail.activity.average_heartrate, 118, "samples after the end stay out");
  assert.equal(detail.activity.max_heartrate, 130);
  assert.deepEqual(detail.streams.find(s => s.type === "heartrate").points.map(p => p.v), [105, 130]);
  assert.deepEqual(detail.streams.find(s => s.type === "latlng").points[1], { t: 20, v: [50.081, 14.421] });
  assert.equal(detail.hrZones.length, 5);
  assert.equal(detail.watch.route, true);
  await watchDetail(env, options);
  assert.equal(calls, 1, "the route is kept after the first export");
});

test("without the location permission there is no route but the rest stays", async () => {
  const { env, row } = database();
  row("google-wearables", "exercise", GOOGLE_ID, "2026-10-13T06:00:00Z", "2026-10-13T06:30:00Z", walk);
  const detail = await watchDetail(env, { source: "google-wearables", id: GOOGLE_ID, token: null, fetchImpl: () => assert.fail("no export") });
  assert.equal(detail.streams.some(s => s.type === "latlng"), false);
  assert.equal(detail.activity.calories, 150);
});

test("an Apple workout uses its own heart-rate series; unknown sources are refused", async () => {
  const { env, row } = database();
  row("apple-health", "exercise", "apple:U1", "2026-10-13T06:00:00Z", "2026-10-13T07:00:00Z", { exercise: { exerciseType: "BIKING", metricsSummary: { averageHeartRateBeatsPerMinute: 141 } }, samples: { heartRate: [[0, 120], [10, 150]] } });
  const detail = await watchDetail(env, { source: "apple-health", id: "apple:U1", hrZones: ZONES });
  assert.equal(detail.activity.average_heartrate, 141);
  assert.equal(detail.streams[0].points.length, 2);
  assert.equal(await watchDetail(env, { source: "intervals", id: "x" }), null);
});

test("an Intervals.icu ride without heart rate or route takes them from the watch's copy", async () => {
  const { env, row } = database();
  row("intervals", "activity", "activity:i9", "2026-10-13T06:00:00Z", "2026-10-13T07:00:00Z", { id: "i9" });
  row("apple-health", "exercise", "apple:U2", "2026-10-13T06:00:00Z", "2026-10-13T07:00:00Z", { exercise: { exerciseType: "BIKING" }, samples: { heartRate: [[0, 120], [10, 150]] } }, "intervals:activity:i9");
  const merged = await withWatch(env, { status: "ok", streams: [{ type: "watts", points: [{ t: 0, v: 200 }] }] }, "i9", { hrZones: ZONES });
  assert.deepEqual(merged.streams.map(s => s.type), ["watts", "heartrate"]);
  assert.deepEqual(merged.watch.source, "apple-health");
  assert.equal(merged.watch.id, "apple:U2");
  const alone = await withWatch(env, { status: "ok", streams: [] }, "i404", {});
  assert.equal(alone.watch, undefined);
});

test("zone bounds need at least three upper limits", () => {
  assert.deepEqual(zoneBounds(ZONES), [118, 140, 156, 170, 250]);
  assert.deepEqual(zoneBounds([{ bpmHigh: 120 }]), []);
});
