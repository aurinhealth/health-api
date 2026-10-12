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
  // Session RPE (Foster): RPE × minutes × 0.1.
  assert.equal(sessionLoad({ kind: "strength", minutes: 60, rpe: 8 }, athlete), 48);
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

test("a gym session's load follows its RPE and length from the logged sets, not a fixed 36", async () => {
  const { gymSessions, strengthLoad, SRPE_SCALE } = await import("../src/training-load.js");
  const set = (date, exercise, set_no, kg, reps, rpe, type = "WORK") => ({ workout_date: date, type, exercise, set_no, actual_kg: kg, actual_reps: reps, rpe });
  const sets = [
    set("2026-10-06", "Squat", 0, 40, 10, null, "WARMUP"),
    ...[1, 2, 3, 4].map(i => set("2026-10-06", "Squat", i, 100, 5, 9)),
    ...[1, 2, 3].map(i => set("2026-10-06", "Bench press", i, 80, 6, 8)),
    ...[1, 2].map(i => set("2026-10-08", "Push-up", i, 0, 15, 5)),
    ...[1, 2, 3].map(i => set("2026-10-10", "Row", i, 60, 10, null))
  ];
  const [hard, light, noRpe] = gymSessions(sets);
  assert.deepEqual([hard.date, light.date, noRpe.date], ["2026-10-06", "2026-10-08", "2026-10-10"]);
  // RPE is the mean of the working sets (the warm-up has none), volume kg × reps.
  assert.equal(hard.rpe, 8.6);
  assert.equal(hard.volume, 4 * 500 + 3 * 480);
  assert.ok(hard.minutes > light.minutes && hard.minutes >= 15 && hard.minutes <= 60, String(hard.minutes));
  const hardLoad = strengthLoad(hard), lightLoad = strengthLoad(light);
  assert.equal(hardLoad, Math.round(hard.minutes * 8.6 * SRPE_SCALE));
  assert.ok(hardLoad > 2 * lightLoad, hardLoad + " vs " + lightLoad);
  // Without RPE the volume stands in, between an easy and a maximal session of that length.
  const v = strengthLoad(noRpe);
  assert.ok(v >= Math.round(noRpe.minutes * 0.3) && v <= Math.round(noRpe.minutes * 1.0), String(v));
  // The athlete's rating of the day fills a session without set RPE.
  assert.equal(gymSessions(sets, { "2026-10-10": 7 }).at(-1).rpe, 7);
  // Neither RPE nor volume: a moderate session (RPE 6) of the estimated length.
  assert.equal(strengthLoad({ minutes: 60 }), 36);
});

test("a watch strength workout on a gym day takes the sets' RPE instead of the heart rate", async () => {
  const { gymSessions } = await import("../src/training-load.js");
  const watch = { date: "2026-10-06", kind: "strength", minutes: 70, tss: null };
  const rows = new Map([[watch, { payload_json: JSON.stringify({ exercise: { metricsSummary: { averageHeartRateBeatsPerMinute: 105 } } }) }]]);
  const gym = gymSessions([{ workout_date: "2026-10-06", type: "WORK", exercise: "Squat", set_no: 1, actual_kg: 100, actual_reps: 5, rpe: 8 }]);
  const [session] = sessionsFrom([watch], rows, gym);
  assert.equal(session.minutes, 70);
  assert.equal(session.rpe, 8);
  assert.equal(dailyLoads([session], athlete).get("2026-10-06"), 56);
  // Without logged sets the watch's heart rate decides as before.
  const [plain] = sessionsFrom([watch], rows, []);
  assert.ok(sessionLoad(plain, athlete) < 56);
});

test("watch-only workouts are added to the Intervals.icu CTL without counting a workout twice", async () => {
  const { watchOnly, addLoads } = await import("../src/training-load.js");
  const act = (start, kind, minutesOff = 0) => ({ date: start.slice(0, 10), start, kind, session: { at: Date.parse(start + ":00Z") + minutesOff * 60000 } });
  const intervals = [act("2026-10-01T07:00", "ride"), act("2026-10-05T18:00", "run")];
  const watch = [
    act("2026-10-01T07:00", "ride", 8),      // the same ride, 8 min apart
    act("2026-10-05T18:00", "other", -5),    // "other" may be the run
    act("2026-10-05T18:00", "strength", 0),  // another sport at the same time
    act("2026-10-07T12:00", "run", 0),       // only on the watch
    act("2026-10-01T07:00", "run", 15),      // 15 min after a ride and another sport
    act("2026-09-20T07:00", "ride", 0)       // before Intervals.icu's history here
  ];
  assert.deepEqual(watchOnly(watch, intervals).map(a => a.start + " " + a.kind), ["2026-10-05T18:00 strength", "2026-10-07T12:00 run", "2026-10-01T07:00 run"]);
  assert.deepEqual(watchOnly(watch, []), []);
  const base = [{ id: "2026-10-07", ctl: 50, atl: 60, tsb: -10, rampRate: 3, ctlLoad: 40, atlLoad: 40 }, { id: "2026-10-08", ctl: 49, atl: 55, tsb: -6, rampRate: 2 }];
  const extra = loadSeries(new Map([["2026-10-07", 42]]), { from: "2026-10-07", to: "2026-10-08", warmup: 0 });
  const [d1, d2] = addLoads(base, extra);
  assert.equal(d1.ctl, Math.round((50 + extra[0].ctl) * 10) / 10);
  assert.equal(d1.atl, Math.round((60 + extra[0].atl) * 10) / 10);
  assert.equal(d1.tsb, Math.round((d1.ctl - d1.atl) * 10) / 10);
  assert.equal(d1.ctlLoad, 82);
  assert.equal(d1.watchLoad, 42);
  assert.ok(d2.ctl > 49 && d2.watchLoad === 0);
  assert.equal(addLoads(base, []), base);
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /const watchExtra = await watchOnlyFitness\(env,ctx,isoDate\(oldest\),isoDate\(newest\)\)/);
  assert.match(entry, /const wellness = watchExtra \? addLoads\(intervalsRows,watchExtra\) : intervalsRows;/);
});
