import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { mainSportFromWeeks, trainingWeeks, summarizeWeeks } from "../src/training-history.js";
const shiftDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
import { sportFromText } from "../src/athlete-focus.js";
import { effectiveProfile } from "../src/energy-profile.js";
import { shiftDate } from "../src/dashboard-shared.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
// 52 weeks, oldest first; `fill(i)` gives week i its sessions: { ride: [n, minutes each], ... }.
const year = fill => Array.from({ length: 52 }, (_, i) => {
  const w = { week: shiftDate("2025-11-03", i * 7) };
  for (const [kind, [n, min]] of Object.entries(fill(i) || {})) { const key = kind === "strength" ? "gym" : kind; w[key + "_n"] = n; w[key + "_min"] = n * min; }
  return w;
});
const winter = i => i < 8 || i >= 44;

test("a winter in the gym does not take the main sport from the bike", () => {
  const r = mainSportFromWeeks(year(i => winter(i) ? { strength: [4, 60] } : { ride: [3, 90], strength: [1, 45] }));
  assert.equal(r.mainSport, "cycling");
  assert.deepEqual(r.supportSports, ["strength"]);
});

test("ride and run: more hours is the main sport, the other supports it", () => {
  const r = mainSportFromWeeks(year(() => ({ ride: [2, 150], run: [3, 40] })));
  assert.equal(r.mainSport, "cycling");
  assert.deepEqual(r.supportSports, ["run"]);
  assert.equal(mainSportFromWeeks(year(() => ({ ride: [1, 60], run: [4, 60] }))).mainSport, "running");
});

test("a swimmer with a gym day is a swimmer", () => {
  assert.equal(mainSportFromWeeks(year(() => ({ swim: [3, 60], strength: [1, 45] }))).mainSport, "swimming");
});

test("triathlon only with all three of ride, run and swim", () => {
  assert.equal(mainSportFromWeeks(year(() => ({ ride: [2, 90], run: [2, 45], swim: [2, 45], strength: [1, 45] }))).mainSport, "triathlon");
  assert.deepEqual(mainSportFromWeeks(year(() => ({ ride: [2, 90], run: [2, 45], swim: [2, 45], strength: [1, 45] }))).supportSports, ["strength"]);
  assert.notEqual(mainSportFromWeeks(year(i => ({ ride: [2, 90], run: [2, 45], ...(i % 10 ? {} : { swim: [1, 30] }) }))).mainSport, "triathlon", "a swim now and then");
});

test("the gym is the main sport only when it rules the whole year", () => {
  const r = mainSportFromWeeks(year(i => ({ strength: [4, 70], ...(i % 3 ? {} : { run: [1, 30] }) })));
  assert.equal(r.mainSport, "strength");
  assert.deepEqual(r.supportSports, ["run"]);
  // Gym logged only as sets (no watch workout) still counts its hours.
  const sets = summarizeWeeks({ strengthSets: Array.from({ length: 52 * 3 }, (_, i) => ({ workout_date: shiftDays("2025-11-03", Math.floor(i / 3) * 7 + i % 3), exercise: "Barbell Bench Press", actual_kg: 60, actual_reps: 5 })),
    activities: Array.from({ length: 17 }, (_, i) => ({ kind: "run", date: shiftDays("2025-11-03", i * 21), minutes: 30 })) });
  assert.equal(mainSportFromWeeks(sets).mainSport, "strength");
  // Gym every week but the rides take real hours: the gym prepares for the bike.
  assert.equal(mainSportFromWeeks(year(() => ({ strength: [3, 60], ride: [1, 120] }))).mainSport, "cycling");
});

test("a new account without a regular sport takes the most frequent of the last 8 weeks", () => {
  const recent = [{ kind: "run" }, { kind: "run" }, { kind: "ride" }];
  assert.equal(mainSportFromWeeks([], recent).mainSport, "running");
  assert.equal(mainSportFromWeeks([], [{ kind: "run" }, { kind: "ride" }]).mainSport, "general");
});

test("the goal or the main race names the sport before the history", () => {
  assert.equal(sportFromText("Gran Fondo Praha"), "cycling");
  assert.equal(sportFromText("půlmaraton pod 1:40"), "running");
  assert.equal(sportFromText("Ironman 70.3"), "triathlon");
  assert.equal(sportFromText("nabrat svaly v posilovně"), "strength");
  assert.equal(sportFromText("přeplavat Lipno"), "swimming");
  assert.equal(sportFromText("kolo a posilovna"), "cycling", "the gym prepares for the bike");
  assert.equal(sportFromText("běh a kolo"), null);
  assert.equal(sportFromText("váha kolem 80 kg"), null);
  // Common words are not running: "během" (during), "bez" (without).
  assert.equal(sportFromText("nabrat svaly během zimy"), "strength");
  assert.equal(sportFromText("posilovat bez bolesti zad"), "strength");
  assert.equal(sportFromText("zhubnout 5 kg během léta"), null);
  assert.equal(sportFromText("běhat 3× týdně"), "running");
  assert.equal(sportFromText("10 km běh pod 45 minut"), "running");
  const suggested = { mainSport: "strength", trainingHistory: { mainSport: "strength", yearCount: 200, regularSports: ["strength", "ride"] } };
  const p = effectiveProfile({ mainSport: "auto", sportGoal: "Zajet L'Étape pod 6 hodin" }, suggested);
  assert.equal(p.mainSport, "cycling");
  assert.equal(effectiveProfile({ mainSport: "auto" }, suggested).mainSport, "strength");
  assert.equal(effectiveProfile({ mainSport: "running" }, suggested).mainSport, "running", "a chosen sport stays");
});

test("finished weeks are stored once; only the last two count again, all of them every 7 days", async () => {
  const raw = createD1(); raw.sqlite.exec(schema); const db = scopedDb(raw, 1);
  const ride = date => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,sample_time,payload_json) VALUES(1,'intervals','activity',?,?,?,?)").run(crypto.randomUUID(), date + "T08:00:00", date + "T08:00:00", JSON.stringify({ type: "Ride", moving_time: 3600 }));
  const today = "2026-10-30";
  for (const d of ["2025-06-10", "2026-03-03", "2026-10-21"]) ride(d);
  let reads = 0; const prepare = raw.prepare.bind(raw);
  raw.prepare = sql => { if (/FROM health_datapoints/.test(sql)) reads++; return prepare(sql); };
  const { weeks } = await trainingWeeks(db, 1, today);
  assert.equal(weeks.length, 104);
  assert.equal(weeks.reduce((n, w) => n + (w.ride_n || 0), 0), 3);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM training_weeks").get().n, 104);
  // The next day only the two freshest weeks are read again: a ride uploaded
  // late into last week counts, one in March waits for the rebuild.
  ride("2026-10-22"); ride("2026-03-04");
  reads = 0; let again = (await trainingWeeks(db, 1, "2026-10-31")).weeks; assert.equal(reads, 1);
  assert.equal(again.reduce((n, w) => n + (w.ride_n || 0), 0), 4);
  // The same day nothing is read again.
  reads = 0; await trainingWeeks(db, 1, "2026-10-31"); assert.equal(reads, 0);
  again = (await trainingWeeks(db, 1, "2026-11-08")).weeks;
  assert.equal(again.reduce((n, w) => n + (w.ride_n || 0), 0), 5, "the weekly rebuild finds the March ride");
});

test("no activities stores nothing, so the first sync still counts", async () => {
  const raw = createD1(); raw.sqlite.exec(schema); const db = scopedDb(raw, 1);
  assert.equal((await trainingWeeks(db, 1, "2026-10-30")).weeks.length, 104);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM training_weeks").get().n, 0);
});

test("the activity read seeks the source and type index", () => {
  const db = new DatabaseSync(":memory:"); db.exec(schema);
  const src = readFileSync(new URL("../src/training-history.js", import.meta.url), "utf8");
  const sql = src.match(/SELECT source_family,data_type,start_time,end_time,sample_time,payload_json FROM health_datapoints[^"]*/)[0];
  const plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all(1, "2026-01-01", "2026-10-30").map(r => r.detail).join(" | ");
  assert.match(plan, /idx_health_datapoints_user_1 \(user_id=\? AND source_family=\? AND data_type=\? AND start_time>\? AND start_time<\?\)/, plan);
});
