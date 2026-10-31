import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { readSending, computeSending, sendingChecks } from "../src/source-sending.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, db: scopedDb(raw, 1) };
}
const NOW = Date.parse("2026-10-31T10:00:00Z");
function row(raw, user, family, type, time, id = Math.random().toString(36)) {
  raw.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, payload_json, record_role) VALUES (?,?,?,?,?,?,?,1,'{}','primary')")
    .run(user, family, type, id, time, time, time);
}

test("only services with data of the type in the last 7 days count", async () => {
  const { raw, db } = setup();
  row(raw, 1, "google-wearables", "heart-rate", "2026-10-31T09:00:00Z");
  row(raw, 1, "google-wearables", "sleep", "2026-10-20T23:00:00Z"); // too old
  row(raw, 1, "google-sources", "weight", "2026-10-25T07:00:00Z");
  row(raw, 1, "whoop", "daily-resting-heart-rate", "2026-10-30");
  row(raw, 1, "intervals", "activity", "2026-10-29T17:00:00Z");
  row(raw, 1, "wahoo", "activity", "2026-10-01T17:00:00Z"); // too old
  row(raw, 2, "ultrahuman", "sleep", "2026-10-31T06:00:00Z"); // someone else's
  const { sending, days } = await readSending(db, 1, { now: NOW });
  assert.equal(days, 7);
  assert.deepEqual(sending.google.sort(), ["body", "heart"]);
  assert.deepEqual(sending.whoop, ["resting"]);
  assert.deepEqual(sending.ultrahuman, []);
  assert.deepEqual(sending.intervals, ["workouts"]);
  assert.deepEqual(sending.wahoo, []);
});

test("the result is kept for an hour, then worked out again", async () => {
  const { raw, db } = setup();
  await readSending(db, 1, { now: NOW });
  row(raw, 1, "google-wearables", "steps", "2026-10-31T09:30:00Z");
  assert.deepEqual((await readSending(db, 1, { now: NOW + 30 * 60000 })).sending.google, [], "cached");
  assert.deepEqual((await readSending(db, 1, { now: NOW + 61 * 60000 })).sending.google, ["steps"]);
});

test("Google food counts from the last recent sync that found some", async () => {
  const { raw, db } = setup();
  raw.sqlite.exec("CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))");
  raw.sqlite.prepare("INSERT INTO sync_status(user_id,sync_name,status,details_json,updated_at) VALUES(1,'google_recent','ok',?,'2026-10-30 12:00:00')")
    .run(JSON.stringify({ results: [{ type: "food", status: "ok", saved: 3 }] }));
  const out = await computeSending(db, 1, { now: NOW });
  assert.deepEqual(out.google, ["food"]);
  // A later sync without food keeps it for the week.
  raw.sqlite.prepare("UPDATE sync_status SET details_json=?, updated_at='2026-11-02 12:00:00' WHERE sync_name='google_recent'").run(JSON.stringify({ results: [{ type: "food", status: "ok", saved: 0 }] }));
  assert.deepEqual((await computeSending(db, 1, { now: NOW + 2 * 86400000, before: out })).google, ["food"]);
  assert.deepEqual((await computeSending(db, 1, { now: NOW + 9 * 86400000, before: out })).google, []);
});

test("every check reads at most one row", () => {
  assert.ok(sendingChecks().length <= 25);
});
