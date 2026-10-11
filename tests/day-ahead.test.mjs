import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setPlannedEnvironment } from "../src/planned-events.js";
import { plannedEventWorkout } from "../src/planned-detail.js";
import { mealConsumedAt } from "../src/food-log.js";
import { buildCoachCouncil } from "../src/coach-engine.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
const entrypoint = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");

async function setup(type = "VirtualRide") {
  const raw = createD1();
  raw.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source_family TEXT, data_type TEXT, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, updated_at TEXT);
    CREATE TABLE workout_schedule_links (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, workout_id TEXT, scheduled_date TEXT, intervals_event_id TEXT, environment TEXT);`);
  const event = { id: 88, name: "Endurance 90", type, start_date_local: "2026-10-08T17:00:00" };
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,payload_json) VALUES(1,'intervals','planned-workout','planned:88',?,?,?)").run(event.start_date_local, event.start_date_local, JSON.stringify(event));
  raw.sqlite.prepare("INSERT INTO workout_schedule_links(user_id,workout_id,scheduled_date,intervals_event_id,environment) VALUES(1,'pfd-x','2026-10-08','88','indoor')").run();
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, ...init }); return new Response(JSON.stringify({ id: 88, type: JSON.parse(init.body).type }), { status: 200 }); };
  return { raw, env: { DB: scopedDb(raw, 1), INTERVALS_API_KEY: "key" }, calls, fetchImpl };
}

test("a planned ride moves outdoors in Intervals.icu, the local copy and the library link", async () => {
  const { raw, env, calls, fetchImpl } = await setup();
  const r = await setPlannedEnvironment(env, { eventId: "planned:88", environment: "outdoor" }, fetchImpl);
  assert.equal(r.type, "Ride");
  assert.deepEqual(JSON.parse(calls[0].body), { type: "Ride" });
  const payload = JSON.parse(raw.sqlite.prepare("SELECT payload_json FROM health_datapoints").get().payload_json);
  assert.equal(payload.indoor, false);
  assert.equal(plannedEventWorkout(payload).environment, "outdoor");
  assert.equal(raw.sqlite.prepare("SELECT environment FROM workout_schedule_links").get().environment, "outdoor");
});

test("a run goes onto the treadmill as VirtualRun; a bad place is refused", async () => {
  const { env, calls, fetchImpl } = await setup("Run");
  assert.equal((await setPlannedEnvironment(env, { eventId: "88", environment: "indoor" }, fetchImpl)).type, "VirtualRun");
  await assert.rejects(setPlannedEnvironment(env, { eventId: "88", environment: "space" }, fetchImpl), /venku, nebo uvnitř/);
  assert.equal(calls.length, 1);
});

test("food for another day gets its meal's usual time, today keeps the time of logging", () => {
  assert.equal(mealConsumedAt("2099-01-01", "breakfast"), "2099-01-01T07:00:00");
  assert.equal(mealConsumedAt("2099-01-01", "snack_am"), "2099-01-01T10:00:00");
  assert.equal(mealConsumedAt("2099-01-01", "dinner"), "2099-01-01T19:00:00");
  assert.equal(mealConsumedAt("2099-01-01", "snack"), "2099-01-01T12:00:00");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  assert.equal(mealConsumedAt(today, "lunch"), null);
  assert.match(entrypoint, /consumed_at:mealConsumedAt\(body\.date,body\.mealType,body\.time\)/);
});

test("a meal sent later from the phone keeps the time it was logged", () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  assert.equal(mealConsumedAt(today, "lunch", "12:40"), today + "T12:40:00");
  assert.equal(mealConsumedAt("2099-01-01", "dinner", "19:05"), "2099-01-01T19:05:00");
  // Anything but HH:MM falls back to the usual rule.
  assert.equal(mealConsumedAt(today, "lunch", "25:00"), null);
  assert.equal(mealConsumedAt("2099-01-01", "dinner", "7pm"), "2099-01-01T19:00:00");
});

test("a day ahead has no coach notes and its timeline uses only notes of that day", () => {
  assert.match(entrypoint, /if\(date&&!validDay\(date\)\)return Response\.json\(\{status:'ok',reflections:\[\]\}/);
  assert.match(client, /\(state\.reflections\?\.\[selectedHistoryDate\]\|\|\[\]\)\.filter\(r=>!r\.date\|\|r\.date===selectedHistoryDate\)/);
});

test("the endurance coach names the purpose, the steady watts, the cadence work and the heart-rate cap", () => {
  const ride = { id: 1, name: "Endurance s kadenčními drily", type: "Ride", durationHours: 1.5, tss: 62, description: "Rozjetí\n- 15m 55-65%\n6x\n- 1m 65% 105-115rpm\n- 4m 65%\nVyjetí\n- 10m 50%" };
  const coach = buildCoachCouncil({ date: "2026-10-07", daily: { training: { planned: [ride], completed: [] } }, fitness: { tsb: 5 }, thresholds: { ftp: 260, lthr: 172 } }).coaches[0];
  const text = coach.actions.join("\n");
  assert.match(text, /^Drž rovnoměrné vytrvalostní tempo/);
  assert.match(text, /Cíl: aerobní základ/);
  assert.match(text, /30 min rovnoměrně · 65 % FTP \(169 W\)/);
  assert.match(text, /Kadence: 6× 1 min na 105–115 rpm/);
  assert.match(text, /Tep drž do ~153 bpm/);
  assert.match(text, /Plán: 90 min · TSS 62 · IF 0,64 · FTP 260 W/);
  assert.doesNotMatch(text, /mezi úseky/);
});

test("intervals are a main set in watts of the indoor FTP; a day ahead has no morning summary", () => {
  const ride = { id: 2, name: "Threshold 4x8", type: "VirtualRide", durationHours: 1.33, tss: 95, description: "Rozjetí\n- 15m ramp 50-75%\nHlavní 4x\n- 8m 95-100%\n- 4m 55%\n- 10m 50%" };
  const council = buildCoachCouncil({ date: "2026-10-09", ahead: true, daily: { training: { planned: [ride], completed: [] } }, fitness: { tsb: 5 }, thresholds: { ftp: 260 } });
  assert.match(council.coaches[0].actions.join("\n"), /4× 8 min · 95–100 % FTP \(235–247 W\), mezi úseky 4 min lehce/);
  assert.equal(council.morningSummary, null);
});

test("picking a day in the training card or moving the week selects that day for the whole screen", () => {
  assert.match(client, /if\(s\)\{pickTodayDay\(s\.dataset\.strip\);return\}/);
  assert.match(client, /if\(state\.todayPick<=lastSelectableDay\(\)&&state\.todayPick!==selectedHistoryDate\)await selectDay\(state\.todayPick\)/);
  assert.match(client, /const STATUS_LABELS=\{active:'Trénink',/);
});
