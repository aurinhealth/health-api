import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { googleWellness, planWellnessSync, syncWellnessToIntervals } from "../src/wellness-sync.js";

function db() {
  const d = createD1();
  d.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, UNIQUE (user_id, source_family, data_type, external_id))`);
  const add = (source, type, sample, value, role = null, start = null) => d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, sample_time, start_time, value_numeric, record_role) VALUES (7, ?, ?, ?, ?, ?, ?)").run(source, type, sample, start, value, role);
  add("google-wearables", "daily-resting-heart-rate", "2026-10-01", 51);
  add("google-wearables", "daily-heart-rate-variability", "2026-10-01", 64.37);
  add("google-wearables", "daily-oxygen-saturation", "2026-10-01", 96.2);
  add("google-wearables", "daily-respiratory-rate", "2026-10-01", 14.4);
  add("google-wearables", "daily-vo2-max", "2026-10-01", 52.3);
  add("google-wearables", "steps", null, 3000, "primary", "2026-10-01T06:00:00Z");
  add("google-wearables", "steps", null, 5000, "primary", "2026-10-01T15:00:00Z");
  add("google-wearables", "steps", null, 99999, "duplicate", "2026-10-01T15:00:00Z");
  add("google-wearables", "daily-resting-heart-rate", "2026-09-01", 70);
  // Heart rate during the night (and one sample after waking up, left out).
  for (const [t, bpm] of [["2026-09-30T22:30:00Z", 58], ["2026-10-01T01:00:00Z", 50], ["2026-10-01T04:00:00Z", 48], ["2026-10-01T06:30:00Z", 95]]) add("google-wearables", "heart-rate", t, bpm);
  return d;
}
const sleep = [{ date: "2026-10-01", durationMin: 412, startTime: "2026-09-30T22:00:00Z", endTime: "2026-10-01T05:30:00Z" }, { date: "2026-10-01", durationMin: 25 }];

test("Google wellness per day: daily values, summed steps, the night's main sleep and its heart rate", async () => {
  const days = await googleWellness(db(), 7, "2026-09-25", sleep);
  assert.deepEqual(days["2026-10-01"], { restingHR: 51, hrv: 64.4, spO2: 96.2, respiration: 14.4, vo2max: 52.3, steps: 8000, sleepSecs: 412 * 60, avgSleepingHR: 52 });
  assert.equal(days["2026-09-01"], undefined);
});

test("only empty fields or values this sync wrote are written", () => {
  const google = { d: { restingHR: 51, hrv: 64, steps: 9000 } };
  // HRV comes from a Garmin in Intervals.icu: left alone. Steps were ours: updated.
  const intervals = { d: { hrv: 70, steps: 8000 } };
  assert.deepEqual(planWellnessSync(google, intervals, { d: { steps: 8000 } }), { d: { restingHR: 51, steps: 9000 } });
  // Nothing changed since the last pass: nothing to write.
  assert.deepEqual(planWellnessSync(google, { d: { restingHR: 51, hrv: 70, steps: 9000 } }, { d: { restingHR: 51, steps: 9000 } }), {});
});

test("one pass writes to Intervals.icu, remembers, and does not repeat", async () => {
  const d = db();
  const puts = [];
  let intervals = [{ id: "2026-10-01", hrv: 70 }];
  const fetchImpl = async (url, opts = {}) => {
    if (opts.method === "PUT") { const body = JSON.parse(opts.body); puts.push(body); intervals = intervals.map(r => r.id === body.id ? { ...r, ...body } : r); if (!intervals.some(r => r.id === body.id)) intervals.push(body); return Response.json({}); }
    return Response.json(intervals);
  };
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "k", CONNECTED_PROVIDERS: ["google", "intervals"] };
  const deps = { fetchImpl, sleepSessions: async () => sleep, now: Date.parse("2026-10-02T10:00:00Z") };
  await syncWellnessToIntervals(env, deps);
  assert.deepEqual(puts, [{ id: "2026-10-01", restingHR: 51, spO2: 96.2, respiration: 14.4, vo2max: 52.3, steps: 8000, sleepSecs: 24720, avgSleepingHR: 52 }]);
  puts.length = 0;
  await syncWellnessToIntervals(env, deps);
  assert.deepEqual(puts, []);
  // Needs both services.
  assert.equal((await syncWellnessToIntervals({ ...env, CONNECTED_PROVIDERS: ["intervals"] }, deps)).status, "skipped");
});
