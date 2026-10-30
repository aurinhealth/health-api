import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { googleDashboard } from "../src/google-dashboard.js";
import { rebuildHourSummary, upkeepHourSummary, summaryFrom, wearFromSummary } from "../src/hour-summary.js";
import { compactZoneMinutes, compactHeartRateHours, compactOldData, HEART_RATE_HOUR_TYPE } from "../src/heart-rate-compaction.js";
import { afterGoogleSync, flushGoogleSync } from "../src/apple-health.js";
import { withTimeZone } from "../src/user-time.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
const NOW = Date.parse("2026-10-10T12:00:00Z");
const iso = ms => new Date(ms).toISOString().replace(".000Z", "Z");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  const insert = raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,value_numeric,payload_json,record_role) VALUES(?,?,?,?,?,?,?,?,?)");
  const row = (family, type, start, minutes, value, payload, role = "primary", user = 1) =>
    insert.run(user, family, type, `${family}:${type}:${start}:${JSON.stringify(payload).length}`, iso(start), iso(start + minutes * 60000), value, JSON.stringify(payload), role);
  // Google's zone minutes, a row a minute: light most of the day, some moderate.
  const zone = (start, z, family = "google-wearables", role = "primary") => row(family, "time-in-heart-rate-zone", start, 1, 1, { timeInHeartRateZone: { heartRateZoneType: z, durationMinutes: 1 } }, role);
  return { raw, db: scopedDb(raw, 1), row, zone };
}
// A month and a half of days: every 7th minute moderate, the rest light, 06:00–09:00 UTC;
// hourly steps and energy; Apple's zones a row a day; one Google steps row set aside.
function fill({ row, zone }) {
  for (let d = 0; d < 45; d++) {
    const day = Date.parse("2026-08-27T06:00:00Z") + d * 86400000;
    for (let m = 0; m < 180; m += 3) zone(day + m * 60000, m % 21 === 0 ? "MODERATE" : "LIGHT");
    for (let h = 0; h < 3; h++) {
      row("google-wearables", "steps", day + h * 3600000, 15, null, { steps: { count: 100 + d } });
      row("google-wearables", "active-energy-burned", day + h * 3600000, 60, 30 + h, { activeEnergyBurned: { kcal: 30 + h } });
    }
    row("apple-health", "time-in-heart-rate-zone", day - 6 * 3600000, 25, 25, { timeInHeartRateZone: { heartRateZoneType: "VIGOROUS", durationMinutes: 25 } });
    row("google-wearables", "steps", day + 4 * 3600000, 60, 999, { steps: { count: 999 } }, "duplicate");
  }
}
const pick = s => ({ wellness: s.wellness.map(d => [d.id, d.steps, d.activeCalories, d.hrZoneMinutes]), stepsByHour: s.stepsByHour, coverage: s.coverage });

test("Today reads the same steps, energy and zone minutes from the hourly summary as from the rows", async () => {
  const t = setup();
  fill(t);
  await withTimeZone("Europe/Prague", async () => {
    const before = pick(await googleDashboard(t.db, "2026-10-10"));
    assert.ok(before.wellness.find(d => d[0] === "2026-10-01")[3].moderate > 0);
    // Filled back a day a call until it reaches back far enough.
    let calls = 0;
    while (await upkeepHourSummary(t.db, 1, { now: NOW }) && calls < 60) calls++;
    assert.equal(await summaryFrom(t.db, 1), "2026-08-31");
    // The summary is read now: the zone minutes are gone from the raw rows and Today stays the same.
    t.raw.sqlite.exec("UPDATE health_datapoints SET payload_json = '{}' WHERE data_type = 'time-in-heart-rate-zone' AND start_time >= '2026-09-09'");
    assert.deepEqual(pick(await googleDashboard(t.db, "2026-10-10")), before);
  });
  // ~1,000 rows a month instead of ~4,000 minutes and buckets.
  assert.ok(t.raw.sqlite.prepare("SELECT COUNT(*) n FROM health_hour_summary").get().n < 300);
});

test("the hours worn come from the summary as from the zone minutes", async () => {
  const t = setup();
  fill(t);
  const direct = t.raw.sqlite.prepare("SELECT source_family f, substr(start_time,1,10) d, SUM(value_numeric) / 60.0 h FROM health_datapoints WHERE source_family = 'google-wearables' AND data_type = 'time-in-heart-rate-zone' AND start_time >= '2026-09-10' AND start_time < '2026-10-12' GROUP BY 1, 2").all().map(r => ({ ...r }));
  assert.equal(await wearFromSummary(t.db, 1, "2026-09-10", "2026-10-12"), null, "not complete yet");
  while (await upkeepHourSummary(t.db, 1, { now: NOW }));
  assert.deepEqual(await wearFromSummary(t.db, 1, "2026-09-10", "2026-10-12"), direct);
});

test("zone minutes older than 35 days become an hour per zone and role; the summary stays", async () => {
  const t = setup();
  fill(t);
  t.zone(Date.parse("2026-08-28T06:01:00Z"), "LIGHT", "google-wearables", "duplicate");
  t.raw.sqlite.exec("UPDATE health_datapoints SET matched_activity_id = 'source-priority' WHERE record_role = 'duplicate'");
  await rebuildHourSummary(t.db, 1, "2026-08-01", "2026-11-01");
  const summary = () => t.raw.sqlite.prepare("SELECT * FROM health_hour_summary ORDER BY hour, source_family").all().map(r => ({ ...r }));
  const before = summary();
  const zones = () => t.raw.sqlite.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE data_type = 'time-in-heart-rate-zone' AND source_family = 'google-wearables'").get().n;
  const count = zones();
  let runs = 0;
  while (await withTimeZone("Europe/Prague", () => compactZoneMinutes(t.db, 1, { now: NOW }))) runs++;
  // 27 August to 4 September (35 days back from 10 October, Prague midnight).
  assert.equal(runs, 9);
  assert.ok(zones() < count - 400);
  const hour = t.raw.sqlite.prepare("SELECT end_time, value_numeric, record_role, matched_activity_id, payload_json FROM health_datapoints WHERE external_id LIKE 'zone1h:MODERATE:2026-08-27T06:%'").all().map(r => ({ ...r }));
  assert.deepEqual(hour.map(r => [r.end_time, r.value_numeric, r.record_role, JSON.parse(r.payload_json).timeInHeartRateZone.durationMinutes]), [["2026-08-27T06:03:00Z", 3, "primary", 3]]);
  const aside = t.raw.sqlite.prepare("SELECT record_role, matched_activity_id, value_numeric FROM health_datapoints WHERE external_id LIKE 'zone1h:LIGHT:2026-08-28T06:%:duplicate:%'").get();
  assert.deepEqual({ ...aside }, { record_role: "duplicate", matched_activity_id: "source-priority", value_numeric: 1 });
  // Newer minutes stay a row a minute.
  assert.equal(t.raw.sqlite.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE data_type = 'time-in-heart-rate-zone' AND start_time >= '2026-09-06' AND external_id LIKE 'zone1h:%'").get().n, 0);
  await rebuildHourSummary(t.db, 1, "2026-08-01", "2026-11-01");
  assert.deepEqual(summary(), before);
  // Done days are not read again.
  assert.equal(await withTimeZone("Europe/Prague", () => compactZoneMinutes(t.db, 1, { now: NOW })), null);
});

test("5-minute heart rate older than a month becomes hourly rows, weighted by count", async () => {
  const t = setup();
  const five = (time, avg, n, min, max) => t.raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,end_time,value_numeric,value_unit,payload_json) VALUES(1,'google-wearables','heart-rate-5min',?,?,?,?,?,'bpm',?)")
    .run("hr5:" + time, time, time, time, avg, JSON.stringify({ avg, min, max, n }));
  five("2026-09-01T06:00:00Z", 60, 100, 55, 66);
  five("2026-09-01T06:05:00Z", 90, 50, 80, 120);
  five("2026-09-01T07:00:00Z", 70, 10, 70, 70);
  five("2026-10-05T06:00:00Z", 65, 100, 60, 70);
  let runs = 0;
  while (await withTimeZone("Europe/Prague", () => compactHeartRateHours(t.db, 1, { now: NOW }))) runs++;
  assert.equal(runs, 1);
  const rows = t.raw.sqlite.prepare("SELECT data_type, sample_time, end_time, value_numeric, payload_json FROM health_datapoints ORDER BY sample_time").all().map(r => [r.data_type, r.sample_time, r.end_time, r.value_numeric, JSON.parse(r.payload_json)]);
  assert.deepEqual(rows, [
    [HEART_RATE_HOUR_TYPE, "2026-09-01T06:00:00Z", "2026-09-01T07:00:00Z", 70, { avg: 70, min: 55, max: 120, n: 150 }],
    [HEART_RATE_HOUR_TYPE, "2026-09-01T07:00:00Z", "2026-09-01T08:00:00Z", 70, { avg: 70, min: 70, max: 70, n: 10 }],
    ["heart-rate-5min", "2026-10-05T06:00:00Z", "2026-10-05T06:00:00Z", 65, { avg: 65, min: 60, max: 70, n: 100 }]
  ]);
  // One step a call: samples first, then 5-minute rows, then zone minutes.
  assert.equal(await withTimeZone("Europe/Prague", () => compactOldData(t.db, 1, { now: NOW })), null);
});

test("a Google sync marks what changed; the source is chosen and the summary rebuilt once after it", async () => {
  const t = setup();
  const env = { DB: t.db, USER_ID: 1 };
  t.row("google-wearables", "steps", Date.parse("2026-10-30T05:00:00Z"), 60, 500, { steps: { count: 500 } });
  t.row("google-wearables", "steps", Date.parse("2026-10-30T06:00:00Z"), 60, 700, { steps: { count: 700 } });
  await afterGoogleSync(env, "steps", [{}], { since: "2026-10-30T06" });
  await afterGoogleSync(env, "steps", [{}], { since: "2026-10-30T05" });
  await afterGoogleSync(env, "sleep", [{}], { since: "2026-10-29" });
  assert.deepEqual(t.raw.sqlite.prepare("SELECT data_type, since, marks FROM health_pending ORDER BY data_type").all().map(r => ({ ...r })),
    [{ data_type: "sleep", since: "2026-10-29", marks: 1 }, { data_type: "steps", since: "2026-10-30T05", marks: 2 }]);
  assert.equal(t.raw.sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'health_hour_summary'").get().n, 0, "nothing ran per page");
  await flushGoogleSync(env);
  assert.equal(t.raw.sqlite.prepare("SELECT COUNT(*) n FROM health_pending").get().n, 0);
  assert.deepEqual(t.raw.sqlite.prepare("SELECT hour, steps FROM health_hour_summary ORDER BY hour").all().map(r => ({ ...r })),
    [{ hour: "2026-10-30T05:00:00Z", steps: 500 }, { hour: "2026-10-30T06:00:00Z", steps: 700 }]);
  assert.equal(await flushGoogleSync(env), 0, "nothing left to do");
});
