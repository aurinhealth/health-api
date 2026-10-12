import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { changeActivityType, KEEP_TYPE_SQL, groupOfType, activityTypes } from "../src/activity-type.js";
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
