import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { buildHealthSeries, bandState, latestState, loadDays, SERIES_METRICS } from "../src/health-series.js";
import { seriesRows } from "../src/health-series-store.js";
import { friendBands, vo2maxView, aurinAgeView, estimateSeries, profileAge } from "../src/health-estimates.js";
import { buildHealth, sleepNeedParts } from "../src/app-health.js";
import { recoveryReadiness, sleepNeedFor } from "../src/recovery-model.js";
import { withTimeZone } from "../src/user-time.js";

const DATE = "2026-11-16";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
// 400 days: resting heart rate 50–52 every day, 62 today; HRV from WHOOP until 30 days ago, then Apple Watch.
const rows = Array.from({ length: 400 }, (_, i) => {
  const offset = i - 399, whoop = offset < -30;
  return { id: day(offset), restingHR: offset === 0 ? 62 : 50 + (i % 3), hrv: whoop ? 80 + (i % 4) : 50 + (i % 4), hrvSource: whoop ? "whoop" : "apple-health:sdnn", respiration: 14 + (i % 3) * 0.2, steps: 8000 + (i % 5) * 500 };
});

test("the state counts SDs from the usual mean as readiness does: 1 SD within, 2 SD slightly, beyond far", () => {
  assert.equal(bandState(0), "within");
  assert.equal(bandState(-1), "within");
  assert.equal(bandState(1.5), "slightly");
  assert.equal(bandState(-2), "slightly");
  assert.equal(bandState(2.01), "far");
  assert.equal(bandState(null), null);
});

test("30 days of resting heart rate: a point a day with readiness's own band, today far above", () => {
  const s = buildHealthSeries({ metric: "restingHR", range: "30d", date: DATE, rows });
  assert.equal(s.points.length, 30);
  assert.equal(s.weekly, false);
  const today = s.points.at(-1), c = recoveryReadiness({ rows, date: DATE }).components.restingHR;
  assert.equal(today.date, DATE);
  assert.equal(today.low, Math.round(c.low));
  assert.equal(today.high, Math.round(c.high));
  assert.equal(today.state, "far");
  assert.equal(today.side, "above");
  assert.ok(s.points.slice(0, -1).every(p => p.state === "within"));
  assert.deepEqual(latestState(rows, DATE, "restingHR"), { date: DATE, state: "far", side: "above" });
  // The last 7 days against the 7 days 90 days before.
  assert.equal(typeof s.change90, "number");
});

test("over 90 days the points are weekly averages starting on Mondays", () => {
  const s = buildHealthSeries({ metric: "respiration", range: "1y", date: DATE, rows });
  assert.equal(s.weekly, true);
  assert.ok(s.points.length >= 52 && s.points.length <= 54, String(s.points.length));
  assert.ok(s.points.every(p => new Date(p.date + "T12:00:00Z").getUTCDay() === 1));
  assert.ok(s.points.every(p => p.low != null && p.state));
});

test("HRV from the source of the newest morning only, with the stretches of each source", () => {
  const s = buildHealthSeries({ metric: "hrv", range: "3m", date: DATE, rows });
  // WHOOP days have no Apple Watch value: they are left out, not mixed in.
  assert.ok(s.points.every(p => p.value < 60));
  assert.deepEqual(s.sources.map(x => x.source), ["whoop", "apple-health"]);
  assert.equal(s.sources[1].from, day(-30));
  assert.equal(s.sources[1].to, DATE);
});

test("no series and no usual range for readiness, Form, Fitness or Fatigue; unknown ranges refused", () => {
  for (const metric of ["readiness", "form", "fitness", "fatigue"]) assert.equal(buildHealthSeries({ metric, range: "30d", date: DATE, rows }), null);
  assert.equal(buildHealthSeries({ metric: "hrv", range: "2y", date: DATE, rows }), null);
  // Under 14 days of baseline: points without a band or state.
  const young = buildHealthSeries({ metric: "respiration", range: "30d", date: DATE, rows: rows.slice(-10) });
  assert.ok(young.points.every(p => p.low == null && p.state == null));
});

test("the loader reads one daily metric from the day index and steps from the hourly summary", async () => {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, payload_json TEXT, record_role TEXT); CREATE TABLE health_hour_summary (user_id INTEGER NOT NULL, hour TEXT NOT NULL, source_family TEXT NOT NULL, steps REAL, energy REAL, zone_light REAL, zone_moderate REAL, zone_vigorous REAL, zone_peak REAL, wear_minutes REAL, PRIMARY KEY (user_id, hour, source_family)); CREATE TABLE sync_status (user_id INTEGER NOT NULL, sync_name TEXT NOT NULL, status TEXT, started_at TEXT, finished_at TEXT, details_json TEXT, updated_at TEXT, PRIMARY KEY (user_id, sync_name));");
  const insert = db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, sample_time, value_numeric, payload_json, record_role) VALUES (?, ?, ?, ?, ?, '{}', ?)");
  for (let i = 0; i < 200; i++) insert.run(7, "apple-health", "daily-resting-heart-rate", day(-i), 50 + (i % 3), "primary");
  insert.run(7, "apple-health", "daily-resting-heart-rate", day(0), 90, "duplicate");
  insert.run(8, "apple-health", "daily-resting-heart-rate", day(0), 99, "primary");
  insert.run(7, "apple-health", "daily-respiratory-rate", day(0), 15, "primary");
  const hours = db.sqlite.prepare("INSERT INTO health_hour_summary (user_id, hour, source_family, steps) VALUES (?, ?, 'apple-health', ?)");
  for (let i = 0; i < 20; i++) for (const h of ["08", "12", "18"]) hours.run(7, day(-i) + "T" + h, 1000);
  db.sqlite.prepare("INSERT INTO sync_status (user_id, sync_name, details_json) VALUES (7, 'hour_summary', ?)").run(JSON.stringify({ from: day(-15) }));
  const rhr = await withTimeZone("Europe/Prague", () => seriesRows(db, 7, { metric: "restingHR", range: "30d", date: DATE }));
  assert.equal(rhr.length, loadDays("30d") + 1);
  assert.equal(rhr.at(-1).restingHR, 50);
  assert.ok(rhr.every(r => r.respiration == null));
  const steps = await withTimeZone("Europe/Prague", () => seriesRows(db, 7, { metric: "steps", range: "30d", date: DATE }));
  // Only the days the summary covers, the first (part of a local day) left out.
  assert.equal(steps[0].id, day(-14));
  assert.equal(steps.at(-1).steps, 3000);
  const s = buildHealthSeries({ metric: "steps", range: "30d", date: DATE, rows: steps });
  assert.equal(s.points.length, 15);
});

test("FRIEND 2015 bands by sex and age group, none outside 20 to 79 or without a sex", () => {
  assert.deepEqual(friendBands(35, "male"), { registry: "FRIEND", year: 2015, test: "treadmill", sex: "male", ageFrom: 30, ageTo: 39, p10: 30.2, p25: 35.9, p50: 42.4, p75: 49.2, p90: 56.5 });
  assert.equal(friendBands(29, "female").p50, 37.6);
  assert.equal(friendBands(79, "female").p90, 23.1);
  assert.equal(friendBands(18, "male"), null);
  assert.equal(friendBands(80, "male"), null);
  assert.equal(friendBands(35, null), null);
  assert.equal(profileAge({ birthDate: "1990-11-17" }, DATE), 35);
  assert.equal(profileAge({ age: 40 }, DATE), 40);
});

const estimates = Array.from({ length: 120 }, (_, i) => ({ date: day(i - 119), vo2max: 45 + i * 0.05, compositeAge: 36 - i * 0.01, fitnessAge: 33, details: i === 119 ? { sources: ["apple-health", "intervals"], composite: { parts: { vo2max: -1.2, sleep: 0.4 }, gains: { sleep: 0.4 } } } : {} }));

test("VO2max: Aurin's estimate, its sources, the 3-month change and the FRIEND group", () => {
  const v = vo2maxView({ rows: estimates, age: 35, sex: "male" });
  assert.equal(v.value, 51);
  assert.equal(v.date, DATE);
  assert.deepEqual(v.sources, ["apple-health", "intervals"]);
  // 50.95 now against the average of days −96…−90 (46.15…46.45).
  assert.equal(v.change3m, 4.7);
  assert.equal(v.compared.ageFrom, 30);
  assert.equal(vo2maxView({ rows: [] }), null);
  // A short history: no change.
  assert.equal(vo2maxView({ rows: estimates.slice(-30) }).change3m, null);
  const weekly = estimateSeries({ rows: estimates, key: "vo2max", days: 182, date: DATE });
  assert.ok(weekly.every(p => new Date(p.date + "T12:00:00Z").getUTCDay() === 1));
  assert.equal(estimateSeries({ rows: estimates, key: "vo2max", days: 30, date: DATE }).length, 30);
});

test("Aurin age: the stored value with its parts, gains and 90-day change", () => {
  const a = aurinAgeView({ rows: estimates, age: 35 });
  assert.equal(a.value, 34.8);
  assert.equal(a.age, 35);
  assert.deepEqual(a.parts, { vo2max: -1.2, sleep: 0.4 });
  assert.deepEqual(a.gains, { sleep: 0.4 });
  assert.equal(a.change90, -0.9);
});

test("tonight's sleep need lines add up to the need sleepNeedFor gives", () => {
  for (const n of [{ need: 520, base: 490, hrv: 15, debt: 30, naps: 15 }, { need: 540, base: 500, hrv: 15, debt: 30, naps: 0 }, { need: 480, base: 480, hrv: 0, debt: 0, naps: 0 }]) {
    const parts = sleepNeedParts(n, { age: 38 });
    assert.equal(parts.reduce((t, p) => t + p.minutes, 0), n.need, JSON.stringify(parts));
    assert.equal(parts[0].key, "base");
  }
  assert.deepEqual(sleepNeedParts({ need: 480, base: 480, hrv: 0, debt: 0, naps: 0 }, { age: 38 }), [{ key: "base", minutes: 480 }]);
  assert.equal(sleepNeedParts({ need: 420, base: 420, hrv: 0, debt: 0, naps: 0 }, { age: 38, goal: 420 })[0].key, "goal");
  // The real function's output adds up too.
  const n = sleepNeedFor({ date: DATE, age: 38, strain: 18, rows: [], sessions: [] });
  assert.equal(sleepNeedParts(n, { age: 38 }).reduce((t, p) => t + p.minutes, 0), n.need);
});

test("/app/api/health sends a state per metric and the need's lines, nothing new for readiness", () => {
  const wellness = rows.slice(-60).map(r => ({ ...r, hrvSource: "apple-health:sdnn", hrv: 50 + (r.id.charCodeAt(9) % 4) }));
  const h = buildHealth({ date: DATE, health: { wellness }, profile: { age: 38 } });
  assert.equal(h.states.restingHR.state, "far");
  assert.ok(Array.isArray(h.sleep.tonight.parts));
  assert.equal(h.readiness.low, undefined);
  assert.equal(h.readiness.high, undefined);
  assert.ok(Object.keys(SERIES_METRICS).every(k => !["readiness", "form", "fitness", "fatigue"].includes(k)));
});
