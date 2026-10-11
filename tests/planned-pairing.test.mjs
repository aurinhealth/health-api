import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import legacy from "../src/index.js";

// Pairing the day's planned sessions with what was done (/analysis/daily).
const ctx = { waitUntil() {} };
const DATE = "2099-01-10";

function db() {
  const d = createD1();
  d.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT);
    CREATE TABLE food_logs (id INTEGER PRIMARY KEY, user_id INTEGER, consumed_date TEXT, consumed_at TEXT, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, status TEXT);
    CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id));`);
  return d;
}
const point = (d, family, type, id, start, payload) =>
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, payload_json) VALUES (7, ?, ?, ?, ?, ?)").run(family, type, id, start, JSON.stringify(payload));
const plan = (d, id, payload, family = "intervals") => point(d, family, "planned-workout", "planned:" + id, DATE + "T09:00:00", { id, start_date_local: DATE + "T09:00:00", moving_time: 7200, ...payload });
const activity = (d, id, payload, start = DATE + "T10:00:00") => point(d, "intervals", "activity", "activity:" + id, start, { id, start_date_local: start, ...payload });
const daily = async d => (await (await legacy.fetch(new Request("https://internal/analysis/daily?date=" + DATE), { DB: d, USER_ID: 7, CONNECTED_PROVIDERS: ["intervals"] }, ctx)).json()).training;

test("Intervals.icu's paired_event_id pairs the activity with planned:<id>", async () => {
  const d = db();
  plan(d, "9001", { name: "Sobotní vyjížďka", type: "Ride" });
  // Neither the name nor the sport would pair them.
  activity(d, "i1", { name: "Evening session", type: "Workout", moving_time: 5400, paired_event_id: 9001 });
  const t = await daily(d);
  assert.deepEqual(t.planned, []);
  assert.deepEqual(t.matched.map(m => [m.planned.id, m.actualId]), [["planned:9001", "activity:i1"]]);
});

test("an app-owned plan pairs through the id it got in Intervals.icu", async () => {
  const d = db();
  d.sqlite.exec("CREATE TABLE workout_exports (user_id INTEGER NOT NULL, local_id TEXT NOT NULL, provider TEXT NOT NULL, remote_id TEXT, status TEXT, revision INTEGER, updated_at TEXT)");
  d.sqlite.prepare("INSERT INTO workout_exports VALUES (7, 'local-abc', 'intervals', '555', 'synced', 1, '')").run();
  plan(d, "local-abc", { name: "Tempo", type: "Ride" }, "local");
  activity(d, "i2", { name: "Evening session", type: "Workout", moving_time: 3600, paired_event_id: 555 });
  const t = await daily(d);
  assert.deepEqual(t.matched.map(m => [m.planned.id, m.actualId]), [["planned:local-abc", "activity:i2"]]);
});

test("a VirtualRide (or a gravel ride) does a planned Ride", async () => {
  for (const type of ["VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"]) {
    const d = db();
    plan(d, "1", { name: "Z2 venku", type: "Ride" });
    activity(d, "i3", { name: "Watopia", type, moving_time: 4000 });
    const t = await daily(d);
    assert.equal(t.planned.length, 0, type);
    assert.equal(t.matched[0]?.actualId, "activity:i3", type);
  }
});

test("one activity does not satisfy two plans", async () => {
  const d = db();
  plan(d, "1", { name: "Ranní jízda", type: "Ride" });
  plan(d, "2", { name: "Odpolední jízda", type: "Ride" });
  activity(d, "i4", { name: "Ride", type: "Ride", moving_time: 3600 });
  const t = await daily(d);
  assert.equal(t.matched.length, 1);
  assert.equal(t.planned.length, 1);
});

test("a Strava stub (no name, no sport) on the day does the planned ride", async () => {
  const d = db();
  plan(d, "1", { name: "Sobotní vyjížďka", type: "Ride" });
  activity(d, "i5", { source: "STRAVA", _note: "STRAVA activities are not available via the API" }, DATE + "T08:00:00");
  const t = await daily(d);
  assert.deepEqual(t.planned, []);
  assert.equal(t.matched[0].actualId, "activity:i5");
  assert.equal(t.completed.length, 1);
});

test("the pairing by id wins over the sport for another plan of the day", async () => {
  const d = db();
  plan(d, "1", { name: "Ranní jízda", type: "Ride" });
  plan(d, "2", { name: "Odpolední jízda", type: "Ride" });
  activity(d, "i6", { name: "Ride", type: "Ride", moving_time: 3600, paired_event_id: "2" });
  const t = await daily(d);
  assert.deepEqual(t.matched.map(m => m.planned.id), ["planned:2"]);
  assert.deepEqual(t.planned.map(w => w.id), ["planned:1"]);
});
