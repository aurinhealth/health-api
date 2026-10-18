import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import legacy from "../src/index.js";
import { googleWellness } from "../src/wellness-sync.js";
import { ownFitness, fitnessDays } from "../src/own-fitness.js";
import { withTimeZone } from "../src/user-time.js";

// Google stores a heart-rate sample every few seconds, ~50,000 a day.
function setup() {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const env = { DB: scopedDb(raw, 1), USER_ID: 1, CONNECTED_PROVIDERS: [] };
  const sample = raw.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (1, 'google-wearables', ?, ?, ?, ?, ?)");
  // Samples every `step` seconds from `from` (inclusive) to `to` (exclusive), as Google's payload.
  const samples = (from, to, step, bpm) => {
    raw.sqlite.exec("BEGIN");
    for (let t = Date.parse(from); t < Date.parse(to); t += step * 1000) {
      const time = new Date(t).toISOString().replace(".000Z", "Z");
      sample.run("heart-rate", "hr:" + time, time, null, JSON.stringify({ heartRate: { beatsPerMinute: String(typeof bpm === "function" ? bpm(t) : bpm) } }));
    }
    raw.sqlite.exec("COMMIT");
  };
  const exercise = (id, start, end, payload) => raw.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json, record_role) VALUES (1, 'google-wearables', 'exercise', ?, ?, ?, ?, 'primary')")
    .run(id, start, end, JSON.stringify(payload));
  return { raw, env, sample, samples, exercise };
}

test("a morning Google workout without its own average gets the heart rate of its own window", async () => {
  const { env, sample, samples, exercise } = setup();
  // 07:00–08:00 in Prague, then 4 hours of the day afterwards (7,200 newer samples).
  exercise("g-run", "2026-10-14T05:00:00Z", "2026-10-14T06:00:00Z", { exercise: { exerciseType: "RUNNING", displayName: "Běh", activeDuration: "3600s", metricsSummary: { caloriesKcal: 600 } } });
  samples("2026-10-14T04:00:00Z", "2026-10-14T05:00:00Z", 2, 60);
  samples("2026-10-14T05:00:00Z", "2026-10-14T06:00:00Z", 2, t => (t / 2000) % 2 ? 148 : 152);
  samples("2026-10-14T06:00:02Z", "2026-10-14T10:00:00Z", 2, 70);
  // Bad values are left out like heartRateFromSamples does; a 5-minute row counts by its value.
  sample.run("heart-rate", "bad-low", "2026-10-14T05:10:01Z", null, JSON.stringify({ heartRate: { beatsPerMinute: "0" } }));
  sample.run("heart-rate", "bad-high", "2026-10-14T05:10:03Z", 300, "{}");
  sample.run("heart-rate", "bad-json", "2026-10-14T05:10:05Z", null, "not json");
  sample.run("heart-rate-5min", "hr5", "2026-10-14T05:20:01Z", 150, JSON.stringify({ avg: 150, n: 150 }));
  const day = await withTimeZone("Europe/Prague", () => legacy.fetch(new Request("https://internal/analysis/daily?date=2026-10-14"), env, { waitUntil() {} }).then(r => r.json()));
  const run = day.training.completed.find(a => a.id === "g-run");
  assert.equal(run.averageHeartRate, 150);
  assert.equal(run.heartRateSource, "samples");
});

test("the night's average sleeping heart rate counts every sample of the night", async () => {
  const { env, samples } = setup();
  // 22:00–06:00 UTC every 2 s: 14,401 samples, the first 9,401 at 50, the last 5,000 at 60.
  const switchAt = Date.parse("2026-10-13T22:00:00Z") + 9401 * 2000;
  samples("2026-10-13T22:00:00Z", "2026-10-14T06:00:02Z", 2, t => t < switchAt ? 50 : 60);
  const night = { source: "google", date: "2026-10-14", durationMin: 480, startTime: "2026-10-13T22:00:00Z", endTime: "2026-10-14T06:00:00Z" };
  const days = await withTimeZone("Europe/Prague", () => googleWellness(env.DB, 1, "2026-10-01", [night]));
  assert.equal(days["2026-10-14"].avgSleepingHR, Math.round((9401 * 50 + 5000 * 60) / 14401));
  // Fewer than 3 valid samples give no average, as before.
  const empty = { ...night, date: "2026-10-12", startTime: "2026-10-11T22:00:00Z", endTime: "2026-10-12T06:00:00Z" };
  assert.equal((await withTimeZone("Europe/Prague", () => googleWellness(env.DB, 1, "2026-10-01", [empty])))["2026-10-12"].avgSleepingHR, undefined);
});

test("/app/api/fitness ends on the user's today, not UTC's", () => {
  // 07:30 on 19 October in Sydney is still 18 October in UTC.
  const at = new Date("2026-10-18T20:30:00Z");
  assert.deepEqual(withTimeZone("Australia/Sydney", () => fitnessDays(42, at)), { from: "2026-09-07", to: "2026-10-19" });
  // 00:30 in Prague, the same.
  assert.deepEqual(withTimeZone("Europe/Prague", () => fitnessDays(90, new Date("2026-10-18T22:30:00Z"))), { from: "2026-07-21", to: "2026-10-19" });
  // 21:00 in New York is already 19 October in UTC.
  assert.deepEqual(withTimeZone("America/New_York", () => fitnessDays(42, new Date("2026-10-19T01:00:00Z"))), { from: "2026-09-06", to: "2026-10-18" });
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /const \{from,to\} = fitnessDays\(days\);/);
});

test("today's own load counts a Sydney morning and a New York evening workout", async () => {
  const run = { exercise: { exerciseType: "RUNNING", displayName: "Run", activeDuration: "3600s" } };
  const last = rows => rows[rows.length - 1];
  {
    const { env, exercise } = setup();
    // 06:00–07:00 on 19 October in Sydney.
    exercise("g-sydney", "2026-10-18T19:00:00Z", "2026-10-18T20:00:00Z", run);
    const rows = await withTimeZone("Australia/Sydney", () => { const { from, to } = fitnessDays(42, new Date("2026-10-18T20:30:00Z")); return ownFitness(env, from, to); });
    assert.equal(last(rows).id, "2026-10-19");
    assert.ok(last(rows).load > 0, JSON.stringify(last(rows)));
  }
  {
    const { env, exercise } = setup();
    // 20:30–21:30 on 18 October in New York, after midnight UTC.
    exercise("g-ny", "2026-10-19T00:30:00Z", "2026-10-19T01:30:00Z", run);
    const rows = await withTimeZone("America/New_York", () => { const { from, to } = fitnessDays(42, new Date("2026-10-19T02:30:00Z")); return ownFitness(env, from, to); });
    assert.equal(last(rows).id, "2026-10-18");
    assert.ok(last(rows).load > 0, JSON.stringify(last(rows)));
  }
});
