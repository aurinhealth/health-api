import test from "node:test";
import assert from "node:assert/strict";
import { movePlannedEvent, deletePlannedEvent, eventIdOf, shiftEventStart } from "../src/planned-events.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

async function setup() {
  const raw = createD1();
  raw.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source_family TEXT, data_type TEXT, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, updated_at TEXT);
    CREATE TABLE workout_schedule_links (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, workout_id TEXT, scheduled_date TEXT, intervals_event_id TEXT);`);
  const event = { id: 77, name: "Threshold 4×8", start_date_local: "2026-10-02T17:30:00" };
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,payload_json) VALUES(1,'intervals','planned-workout','planned:77',?,?,?)").run(event.start_date_local, event.start_date_local, JSON.stringify(event));
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,payload_json) VALUES(2,'intervals','planned-workout','planned:77','2026-10-02','2026-10-02','{}')").run();
  raw.sqlite.prepare("INSERT INTO workout_schedule_links(user_id,workout_id,scheduled_date,intervals_event_id) VALUES(1,'pfd-x','2026-10-02','77')").run();
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, ...init }); return new Response(init.method === "PUT" ? JSON.stringify({ id: 77, start_date_local: JSON.parse(init.body).start_date_local }) : "", { status: 200 }); };
  return { raw, env: { DB: scopedDb(raw, 1), INTERVALS_API_KEY: "key" }, calls, fetchImpl };
}

test("ids and start times", () => {
  assert.equal(eventIdOf("planned:123"), "123");
  assert.equal(eventIdOf("../x"), null);
  assert.equal(shiftEventStart("2026-10-02T17:30:00", "2026-10-04"), "2026-10-04T17:30:00");
  assert.equal(shiftEventStart(null, "2026-10-04"), "2026-10-04T00:00:00");
});

test("moving a planned workout changes Intervals.icu first, then the local copy", async () => {
  const { raw, env, calls, fetchImpl } = await setup();
  const r = await movePlannedEvent(env, { eventId: "planned:77", date: "2026-10-04" }, fetchImpl);
  assert.equal(r.status, "ok");
  assert.equal(calls[0].method, "PUT");
  assert.match(calls[0].url, /\/athlete\/0\/events\/77$/);
  assert.deepEqual(JSON.parse(calls[0].body), { start_date_local: "2026-10-04T17:30:00" });
  const row = raw.sqlite.prepare("SELECT start_time,payload_json FROM health_datapoints WHERE user_id=1").get();
  assert.equal(row.start_time, "2026-10-04T17:30:00");
  assert.equal(JSON.parse(row.payload_json).name, "Threshold 4×8");
  assert.equal(raw.sqlite.prepare("SELECT scheduled_date FROM workout_schedule_links").get().scheduled_date, "2026-10-04");
  // Another user's copy is untouched.
  assert.equal(raw.sqlite.prepare("SELECT start_time FROM health_datapoints WHERE user_id=2").get().start_time, "2026-10-02");
});

test("deleting removes the event in Intervals.icu and locally; a refused call keeps everything", async () => {
  const { raw, env, calls, fetchImpl } = await setup();
  await assert.rejects(deletePlannedEvent(env, { eventId: "77" }, async () => new Response("", { status: 403 })), /HTTP 403/);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE user_id=1").get().n, 1);
  await deletePlannedEvent(env, { eventId: "77" }, fetchImpl);
  assert.equal(calls[0].method, "DELETE");
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE user_id=1").get().n, 0);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE user_id=2").get().n, 1);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM workout_schedule_links").get().n, 0);
});
