import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { changeActivityType, KEEP_TYPE_SQL, groupOfType, activityTypes, mark, renameMarks } from "../src/activity-type.js";
import { readFileSync } from "node:fs";
import { buildCalendar } from "../src/app-calendar.js";

const schema = db => db.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, updated_at TEXT, UNIQUE (user_id, source_family, data_type, external_id))`);
const run = { exercise: { exerciseType: "RUNNING", displayName: "Run", activeDuration: "1560s", metricsSummary: { caloriesKcal: 251, distanceMeters: 1200 } } };
const upsert = (db, payload) => db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json)
  VALUES (3, 'google-wearables', 'exercise', 'g1', '2026-10-12T13:36:00Z', '2026-10-12T14:02:00Z', ?)
  ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET ${KEEP_TYPE_SQL}`).bind(JSON.stringify(payload)).run();

test("a Google walk logged as a run becomes a walk in the app and stays one after the next sync", async () => {
  const DB = createD1(); schema(DB);
  await upsert(DB, run);
  const result = await changeActivityType({ DB, USER_ID: 3 }, { id: "g1", type: "Walk" });
  assert.deepEqual(result, { status: "ok", type: "Walk", sent: [], kept: ["google"] });
  // Google sends the session again with its own type: the user's choice stays.
  await upsert(DB, { ...run, exercise: { ...run.exercise, metricsSummary: { caloriesKcal: 255 } } });
  const row = DB.sqlite.prepare("SELECT * FROM health_datapoints").get();
  const payload = JSON.parse(row.payload_json);
  assert.equal(payload.exercise.exerciseType, "Walk");
  assert.equal(payload.exercise.metricsSummary.caloriesKcal, 255, "the rest of Google's update lands");
  const cal = buildCalendar({ start: "2026-10-12", end: "2026-10-12", today: "2026-10-12", google: [{ ...row, data_type: "exercise" }] });
  const a = cal.days[0].activities[0];
  assert.equal(a.sport, "walk");
  assert.equal(a.type, "Walk");
  assert.equal(a.source, "google-wearables");
});

test("an Intervals.icu activity is changed there too; a known type beats the name", async () => {
  const DB = createD1(); schema(DB);
  DB.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, payload_json) VALUES (3, 'intervals', 'activity', 'activity:i55', '2026-10-12T13:36:00Z', ?)").run(JSON.stringify({ id: "i55", type: "Run", name: "Afternoon Run", moving_time: 1500 }));
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([init.method, url, init.body]); return Response.json({}); };
  const result = await changeActivityType({ DB, USER_ID: 3, INTERVALS_API_KEY: "k" }, { id: "activity:i55", type: "Hike" }, { fetchImpl });
  assert.deepEqual(result.sent, ["intervals"]);
  assert.deepEqual(calls, [["PUT", "https://intervals.icu/api/v1/activity/i55", JSON.stringify({ type: "Hike" })]]);
  const row = DB.sqlite.prepare("SELECT * FROM health_datapoints").get();
  const cal = buildCalendar({ start: "2026-10-12", end: "2026-10-12", today: "2026-10-12", activities: [row] });
  assert.equal(cal.days[0].activities[0].sport, "walk", "Hike, not the run in its name");
  await assert.rejects(changeActivityType({ DB, USER_ID: 3, INTERVALS_API_KEY: "k" }, { id: "activity:i55", type: "Run" }, { fetchImpl: async () => new Response("", { status: 422 }) }), e => e.status === 502);
  await assert.rejects(changeActivityType({ DB, USER_ID: 3 }, { id: "activity:i55", type: "Flying" }), e => e.status === 400);
  await assert.rejects(changeActivityType({ DB, USER_ID: 4 }, { id: "activity:i55", type: "Run" }), e => e.status === 404, "another user's activity is not found");
});

test("the type list has a group for each type; Workout leaves the guess to the name", () => {
  const types = activityTypes();
  assert.ok(types.length >= 40);
  assert.equal(new Set(types.map(t => t.type)).size, types.length);
  assert.ok(types.every(t => ["ride", "run", "strength", "swim", "walk", "other"].includes(t.group)));
  assert.equal(groupOfType("TrailRun"), "run");
  assert.equal(groupOfType("Workout"), null);
});

test("a workout typed in the app changes in the app and goes again to where it was sent", async () => {
  const DB = createD1(); schema(DB);
  DB.sqlite.exec("CREATE TABLE local_workouts (id TEXT, user_id INTEGER, event_json TEXT)");
  DB.sqlite.exec("CREATE TABLE sync_sends (user_id INTEGER, activity_key TEXT, destination TEXT, status TEXT, remote_id TEXT, message TEXT, attempts INTEGER DEFAULT 0, payload_json TEXT, updated_at TEXT, PRIMARY KEY (user_id, activity_key, destination))");
  DB.sqlite.prepare("INSERT INTO local_workouts VALUES ('l1', 3, ?)").run(JSON.stringify({ type: "Run", name: "Běh" }));
  DB.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, payload_json) VALUES (3, 'local', 'activity', 'activity:l1', '2026-10-12T10:00:00', ?)").run(JSON.stringify({ type: "Run", name: "Běh", moving_time: 1800 }));
  const result = await changeActivityType({ DB, USER_ID: 3 }, { id: "activity:l1", type: "Hike" });
  assert.equal(result.key, "manual:l1", "the app replaces its Apple Health copy");
  assert.deepEqual(result.sent, [], "nothing was sent before, nothing now");
  const row = DB.sqlite.prepare("SELECT * FROM health_datapoints").get();
  assert.equal(JSON.parse(row.payload_json).type, "Hike");
  assert.equal(JSON.parse(DB.sqlite.prepare("SELECT event_json FROM local_workouts").get().event_json).type, "Hike");
  const cal = buildCalendar({ start: "2026-10-12", end: "2026-10-12", today: "2026-10-12", activities: [row] });
  assert.equal(cal.days[0].activities[0].sport, "walk");
});

test("a gym session gets the chosen type in the calendar", async () => {
  const DB = createD1();
  DB.sqlite.exec("CREATE TABLE gym_plans (user_id INTEGER, workout_date TEXT, values_json TEXT)");
  DB.sqlite.prepare("INSERT INTO gym_plans VALUES (3, '2026-10-12', '[]')").run();
  const result = await changeActivityType({ DB, USER_ID: 3 }, { id: "gym:2026-10-12", type: "Crossfit" });
  assert.equal(result.key, "gym:2026-10-12");
  await assert.rejects(changeActivityType({ DB, USER_ID: 3 }, { id: "gym:2026-10-13", type: "Crossfit" }), e => e.status === 404);
  const { gymTypes } = await import("../src/activity-type.js");
  assert.deepEqual(await gymTypes(DB, 3, "2026-10-01", "2026-10-31"), { "2026-10-12": "Crossfit" });
  assert.deepEqual(await gymTypes(DB, 4, "2026-10-01", "2026-10-31"), {});
  const cal = buildCalendar({ start: "2026-10-12", end: "2026-10-12", today: "2026-10-12", gym: { "2026-10-12": { name: "Nohy", exercises: ["Dřep"], sets: 3, logged: 3, setsBy: { "Dřep": 3 }, done: { "Dřep": 3 }, type: "Run" } } });
  const a = cal.days[0].activities[0];
  assert.equal(a.sport, "run");
  assert.equal(a.type, "Run");
});

// Marks written as loadwise… before 2026-11: migration 0032 renames them, and again once the
// new version is live (after-deploy/), for a row the old version wrote while the deploy ran.
// Until then the app reads the old mark; the sync's SQL reads only the new one.
test("a mark under its old name is read, renamed after the deploy and then kept by the sync", async () => {
  assert.equal(mark({ loadwiseKcal: 300 }, "Kcal"), 300);
  assert.equal(mark({ aurinKcal: 310, loadwiseKcal: 300 }, "Kcal"), 310);
  assert.deepEqual(renameMarks({ loadwiseType: "Walk", loadwiseMerge: { with: "x" }, a: 1 }), { aurinType: "Walk", aurinMerge: { with: "x" }, a: 1 });

  const old = createD1(); schema(old);
  old.sqlite.exec("CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  await upsert(old, { ...run, loadwiseType: "Walk", loadwiseKcal: 300, loadwiseKcalDevice: 251, loadwiseMerge: { with: "apple-health:a1" } });
  old.sqlite.exec(readFileSync(new URL("../migrations/0032_aurin_marks.sql", import.meta.url), "utf8"));
  const renamed = JSON.parse(old.sqlite.prepare("SELECT payload_json FROM health_datapoints").get().payload_json);
  assert.deepEqual([renamed.aurinType, renamed.aurinKcal, renamed.aurinKcalDevice, renamed.aurinMerge.with, renamed.loadwiseType], ["Walk", 300, 251, "apple-health:a1", undefined]);
  await upsert(old, { ...run, exercise: { ...run.exercise, metricsSummary: { caloriesKcal: 255 } } });
  const kept = JSON.parse(old.sqlite.prepare("SELECT payload_json FROM health_datapoints").get().payload_json);
  assert.deepEqual([kept.aurinType, kept.exercise.exerciseType, kept.aurinKcal, kept.exercise.metricsSummary.caloriesKcal, kept.aurinMerge.with], ["Walk", "Walk", 300, 300, "apple-health:a1"]);

  // After the deploy: renamed once, then the file reads nothing (schema_meta).
  const afterDeploy = readFileSync(new URL("../after-deploy/0032_aurin_marks.sql", import.meta.url), "utf8");
  old.sqlite.prepare("UPDATE health_datapoints SET payload_json = replace(payload_json, '\"aurinKcal\":', '\"loadwiseKcal\":')").run();
  old.sqlite.exec(afterDeploy);
  assert.equal(JSON.parse(old.sqlite.prepare("SELECT payload_json FROM health_datapoints").get().payload_json).aurinKcal, 300);
  old.sqlite.prepare("UPDATE health_datapoints SET payload_json = replace(payload_json, '\"aurinKcal\":', '\"loadwiseKcal\":')").run();
  old.sqlite.exec(afterDeploy);
  assert.equal(JSON.parse(old.sqlite.prepare("SELECT payload_json FROM health_datapoints").get().payload_json).loadwiseKcal, 300);
});

test("a merge mark that is not an object does not stop the sync", async () => {
  const DB = createD1(); schema(DB);
  await upsert(DB, { ...run, aurinMerge: "text" });
  await upsert(DB, { ...run, exercise: { ...run.exercise, metricsSummary: { caloriesKcal: 255 } } });
  assert.equal(JSON.parse(DB.sqlite.prepare("SELECT payload_json FROM health_datapoints").get().payload_json).exercise.metricsSummary.caloriesKcal, 255);
});
