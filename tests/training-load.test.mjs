import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sessionLoad, loadSeries, dailyLoads, sessionsFrom } from "../src/training-load.js";

const athlete = { restHr: 50, maxHr: 190, ftp: 250, sex: "male" };

test("a session's load: the source's own, power, heart rate, gym RPE, or an easy hour", () => {
  assert.equal(sessionLoad({ minutes: 60, tss: 72 }, athlete), 72);
  // One hour at FTP is 100, at 75 % of it 56.
  assert.equal(sessionLoad({ kind: "ride", minutes: 60, avgPower: 250 }, athlete), 100);
  assert.equal(sessionLoad({ kind: "ride", minutes: 60, avgPower: 187.5 }, athlete), 56);
  // Heart rate: an hour at the threshold (82 % of the reserve) is 100; easy riding much less.
  assert.equal(sessionLoad({ kind: "run", minutes: 60, avgHr: 50 + 0.82 * 140 }, athlete), 100);
  const easy = sessionLoad({ kind: "ride", minutes: 60, avgHr: 125 }, athlete);
  assert.ok(easy > 30 && easy < 60, String(easy));
  // A known LTHR moves the threshold.
  assert.equal(sessionLoad({ kind: "run", minutes: 60, avgHr: 165 }, { ...athlete, lthr: 165 }), 100);
  // Women's TRIMP curve is flatter, so the same easy hour weighs a bit more against the threshold.
  assert.ok(sessionLoad({ kind: "ride", minutes: 60, avgHr: 125 }, { ...athlete, sex: "female" }) > easy);
  assert.equal(sessionLoad({ kind: "strength", minutes: 60, rpe: 8 }, athlete), 64);
  assert.equal(sessionLoad({ kind: "strength", minutes: 60 }, athlete), 36);
  assert.equal(sessionLoad({ kind: "walk", minutes: 60 }, {}), 20);
  assert.equal(sessionLoad({ kind: "run", minutes: 60 }, {}), 36);
  assert.equal(sessionLoad({ kind: "run" }, athlete), null);
});

test("CTL and ATL follow 42- and 7-day averages and the warm-up carries the history", () => {
  const loads = new Map();
  for (let i = 0; i < 200; i++) loads.set(new Date(Date.parse("2026-03-01T12:00:00Z") + i * 86400000).toISOString().slice(0, 10), 60);
  const rows = loadSeries(loads, { from: "2026-09-01", to: "2026-09-10", warmup: 120 });
  assert.equal(rows.length, 10);
  assert.deepEqual(Object.keys(rows[0]), ["id", "ctl", "atl", "tsb", "rampRate", "load"]);
  // 60 a day for months: CTL and ATL both near 60, form near zero.
  assert.ok(Math.abs(rows.at(-1).ctl - 57) < 3, String(rows.at(-1).ctl));
  assert.ok(Math.abs(rows.at(-1).atl - 60) < 1);
  // A hard block raises fatigue faster than fitness: form goes negative.
  const block = new Map(loads);
  for (let i = 0; i < 7; i++) block.set("2026-09-0" + (i + 1), 150);
  const tired = loadSeries(block, { from: "2026-09-07", to: "2026-09-07", warmup: 120 })[0];
  assert.ok(tired.tsb < -20, String(tired.tsb));
  assert.ok(tired.rampRate > 5);
});

test("watch workouts carry their heart rate and power; gym days without a workout count as an hour", () => {
  const a = { date: "2026-10-10", kind: "ride", minutes: 90, tss: null }, b = { date: "2026-10-11", kind: "run", minutes: 40, tss: null };
  const rows = new Map([[a, { payload_json: JSON.stringify({ exercise: { metricsSummary: { averageHeartRateBeatsPerMinute: 140, averagePowerWatts: 200 } } }) }], [b, { payload_json: "{}" }]]);
  const sessions = sessionsFrom([a, b], rows, ["2026-10-11", "2026-10-09"]);
  assert.deepEqual(sessions.map(s => [s.date, s.kind, s.avgHr ?? null, s.avgPower ?? null]), [["2026-10-10", "ride", 140, 200], ["2026-10-11", "run", null, null], ["2026-10-11", "strength", null, null], ["2026-10-09", "strength", null, null]]);
  const daily = dailyLoads(sessions, athlete);
  assert.equal(daily.get("2026-10-10"), 96);
  assert.equal(daily.get("2026-10-11"), 24 + 36);
});

test("/app/api/fitness falls back to the athlete's own load without Intervals.icu", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /if \(!apiKey\) return Response\.json\(\{status:"ok",source:"loadwise",connected:false,days,wellness:await ownFitness\(env,isoDate\(oldest\),isoDate\(newest\)\)\}/);
});
