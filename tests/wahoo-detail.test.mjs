import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { wahooActivityRow } from "../src/wahoo.js";
import { wahooDetail } from "../src/wahoo-detail.js";
import { parseFit } from "../src/fit-file.js";
import { daySessions } from "../src/app-training.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, db: scopedDb(raw, 1) };
}
const FIT_EPOCH = 631065600;

// A FIT file as a bike computer writes it: a record definition, then one
// record a second (timestamp, position, heart rate, cadence, power), the
// last ten with compressed timestamps, and a developer field to skip.
function fitFile(start, seconds, { gps = true } = {}) {
  const out = [];
  const u8 = v => out.push(v & 0xff), u16 = v => { u8(v); u8(v >> 8); }, u32 = v => { u16(v & 0xffff); u16(v >>> 16); };
  // Record definitions with a developer field: local 0 with a timestamp, local 2 without (for compressed headers).
  const fields = [...(gps ? [[0, 4, 0x85], [1, 4, 0x85]] : []), [3, 1, 0x02], [4, 1, 0x02], [7, 2, 0x84], [5, 4, 0x86]];
  const define = (local, list) => { u8(0x60 | local); u8(0); u8(0); u16(20); u8(list.length); for (const [num, size, base] of list) { u8(num); u8(size); u8(base); } u8(1); u8(0); u8(2); u8(0); };
  define(0, [[253, 4, 0x86], ...fields]);
  define(2, fields);
  // A definition of another message (event, global 21), local 1, and one of them.
  u8(0x41); u8(0); u8(0); u16(21); u8(1); u8(253); u8(4); u8(0x86);
  u8(0x01); u32(start - FIT_EPOCH);
  const record = (i, compressed) => {
    const ts = start - FIT_EPOCH + i;
    if (compressed) u8(0x80 | (2 << 5) | (ts & 0x1f)); else { u8(0x00); u32(ts); }
    if (gps) { u32(Math.round((50.08 + i * 1e-5) / (180 / 2 ** 31))); u32(Math.round(14.42 / (180 / 2 ** 31))); }
    u8(120 + (i % 40)); u8(i === 3 ? 0xff : 90); u16(i < 60 ? 150 : 260); u32(i * 800);
    u16(0xbeef);
  };
  for (let i = 0; i < seconds; i++) record(i, i >= seconds - 10);
  const data = Uint8Array.from(out);
  const header = new Uint8Array(14), view = new DataView(header.buffer);
  header[0] = 14; header[1] = 0x20; view.setUint16(2, 2132, true); view.setUint32(4, data.length, true); header.set([46, 70, 73, 84], 8);
  return Uint8Array.from([...header, ...data, 0, 0]);
}

const START = Date.parse("2026-10-21T14:23:00Z") / 1000;
const workout = { id: 900, starts: "2026-10-21T14:23:00.000Z", name: "Indoor Cycling", workout_type_id: 61,
  workout_summary: { duration_active_accum: "600", duration_total_accum: "600", distance_accum: "4380", calories_accum: "96", heart_rate_avg: "138", power_avg: "205", power_bike_np_last: "231", power_bike_tss_last: "12", time_zone: "Europe/Prague", file: { url: "https://cdn.wahooligan.com/files/900.fit" } } };

function insert(raw, row) {
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,'wahoo','activity',?,?,?,?)")
    .run(row.external_id, row.start_time, row.end_time, JSON.stringify(row.payload));
}

test("a FIT file gives a record a second: compressed timestamps, positions, gaps and developer fields", async () => {
  const points = await parseFit(fitFile(START, 120));
  assert.equal(points.length, 120);
  assert.deepEqual(points.slice(0, 2).map(p => [p.t, p.hr, p.watts, p.dist]), [[0, 120, 150, 0], [1, 121, 150, 8]]);
  assert.equal(points[3].cadence, null);
  assert.deepEqual(points.slice(-3).map(p => p.t), [117, 118, 119]);
  assert.equal(points[0].time, START);
  assert.ok(Math.abs(points[0].lat - 50.08) < 1e-6 && Math.abs(points[0].lon - 14.42) < 1e-6);
  // Gzipped as some services send it.
  const gz = new Uint8Array(await new Response(new Blob([fitFile(START, 30)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  assert.equal((await parseFit(gz)).length, 30);
  assert.deepEqual(await parseFit(new Uint8Array([1, 2, 3])), []);
  // A small file that would unpack past the limit is not read.
  const bomb = new Uint8Array(await new Response(new Blob([new Uint8Array(80 * 1024 * 1024)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  assert.deepEqual(await parseFit(bomb), []);
});

test("a Wahoo ride opens with its power and heart-rate curves from the FIT file, read once", async () => {
  const { raw, db } = setup();
  const row = wahooActivityRow(workout);
  assert.equal(row.payload.wahoo.file, "https://cdn.wahooligan.com/files/900.fit");
  insert(raw, row);
  const calls = [];
  const fetchImpl = async url => { calls.push(String(url)); return new Response(fitFile(START, 600, { gps: false })); };
  const env = { DB: db, USER_ID: 1 };
  const hrZones = [{ bpmHigh: 130 }, { bpmHigh: 145 }, { bpmHigh: 160 }, { bpmHigh: 175 }];
  const detail = await wahooDetail(env, { id: "wahoo:900", hrZones, thresholds: { ftp: 280, indoorFtp: 250 }, fetchImpl });
  assert.equal(detail.status, "ok");
  assert.deepEqual(detail.origin, { name: "Wahoo", logo: "wahoo" });
  assert.deepEqual(detail.watch, { source: "wahoo", id: "wahoo:900" });
  assert.deepEqual([detail.activity.icu_normalized_watts, detail.activity.icu_training_load, detail.activity.icu_ftp, detail.activity.icu_intensity, detail.activity.max_heartrate], [231, 12, 250, 0.92, 159]);
  assert.deepEqual(detail.streams.map(s => s.type).sort(), ["cadence", "heartrate", "time", "watts"]);
  assert.ok(detail.streams.find(s => s.type === "watts").points.length > 100);
  assert.ok(detail.hrZones.length === 5 && detail.hrZones.reduce((a, z) => a + z.seconds, 0) > 500);
  assert.ok(detail.analysis.zones.length === 7 && detail.analysis.source === "wahoo");
  // The second open reads the kept curves.
  await wahooDetail(env, { id: "wahoo:900", hrZones, fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(await wahooDetail(env, { id: "wahoo:901", fetchImpl }), null);
  assert.equal(await wahooDetail(env, { id: "google:1", fetchImpl }), null);
});

test("an expired file link is asked of Wahoo again; without any file the watch's heart rate stands in", async () => {
  const { raw, db } = setup();
  insert(raw, wahooActivityRow(workout));
  const calls = [];
  const fetchImpl = async url => {
    const u = new URL(url); calls.push(u.pathname);
    if (u.pathname === "/v1/workouts/900/workout_summary") return Response.json({ file: { url: "https://cdn.wahooligan.com/files/900-new.fit" } });
    if (u.pathname.endsWith("900-new.fit")) return new Response(fitFile(START, 90));
    return new Response("gone", { status: 403 });
  };
  const env = { DB: db, USER_ID: 1, WAHOO_TOKEN: JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: Date.now() + 3600e3, user_id: "55" }) };
  const detail = await wahooDetail(env, { id: "wahoo:900", fetchImpl });
  assert.deepEqual(calls, ["/files/900.fit", "/v1/workouts/900/workout_summary", "/files/900-new.fit"]);
  assert.ok(detail.streams.some(s => s.type === "latlng" && s.points.length === 90));

  const other = setup();
  insert(other.raw, wahooActivityRow({ ...workout, workout_summary: { ...workout.workout_summary, file: null } }));
  for (let i = 0; i < 60; i++) other.raw.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (1, 'google-wearables', 'heart-rate', ?, ?, ?, '{}')")
    .run("hr" + i, new Date((START + i * 10) * 1000).toISOString().replace(".000Z", "Z"), 130 + i % 5);
  const watch = await wahooDetail({ DB: other.db, USER_ID: 1 }, { id: "wahoo:900", fetchImpl: async () => new Response("", { status: 404 }) });
  assert.ok(watch.streams.find(s => s.type === "heartrate").points.length >= 50);
  assert.equal(watch.analysis, null);
});

test("a Wahoo ride in Training opens its own detail", () => {
  const row = wahooActivityRow(workout);
  const { sessions } = daySessions("2026-10-21", "2026-10-21", { completed: [{ id: row.external_id, source: "intervals", type: "VirtualRide", name: "Indoor Cycling", start: row.start_time, durationHours: 0.17, payload: row.payload }] });
  assert.deepEqual(sessions[0].watch, { source: "wahoo", id: "wahoo:900" });
  assert.equal(sessions[0].activityId, null);
});
