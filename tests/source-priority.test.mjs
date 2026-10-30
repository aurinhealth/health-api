import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { saveAppleHealth } from "../src/apple-health.js";
import { resolveSources, saveSourcePriority, readSourcePriority, priorityChoices } from "../src/source-priority.js";
import { connectionStatus } from "../src/connections.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, db: scopedDb(raw, 1) };
}
const NOW = Date.parse("2026-10-12T12:00:00Z");
const day = n => new Date(Date.parse("2026-10-12T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);
const insert = (raw, family, type, id, { sample = null, start = null, end = null, value = null } = {}) =>
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,end_time,value_numeric,payload_json) VALUES(1,?,?,?,?,?,?,?,'{}')")
    .run(family, type, id, sample, start, end, value);
const role = (raw, family, id) => raw.sqlite.prepare("SELECT record_role FROM health_datapoints WHERE source_family=? AND external_id=?").get(family, id).record_role;
// The Fitbit worn every night and all day; the watch only on some days.
function fitbitEveryDay(raw, days = 10) {
  for (let i = 0; i < days; i++) {
    const d = day(i), prev = day(i + 1);
    insert(raw, "google-wearables", "sleep", "gs" + d, { start: prev + "T22:00:00Z", end: d + "T06:00:00Z" });
    insert(raw, "google-wearables", "daily-resting-heart-rate", "grhr" + d, { sample: d, value: 50 });
    insert(raw, "google-wearables", "time-in-heart-rate-zone", "gz" + d, { start: d + "T00:00:00Z", end: d + "T23:00:00Z", value: 1380 });
  }
}

test("the night stays with the device worn most nights; the watch fills only nights it missed", async () => {
  const { raw, db } = setup();
  fitbitEveryDay(raw);
  // The watch worn in the day: a resting heart rate on two days, one of them a day the Fitbit lacks.
  insert(raw, "apple-health", "daily-resting-heart-rate", "arhr" + day(0), { sample: day(0), value: 58 });
  insert(raw, "apple-health", "daily-resting-heart-rate", "arhr" + day(20), { sample: day(20), value: 57 });
  await resolveSources(db, 1, { since: day(30), now: NOW });
  assert.equal(role(raw, "apple-health", "arhr" + day(0)), "duplicate", "Fitbit is the home source of the night");
  assert.equal(role(raw, "google-wearables", "grhr" + day(0)), "primary");
  assert.equal(role(raw, "apple-health", "arhr" + day(20)), "primary", "a day only the watch has is kept");
  // Running again changes nothing.
  assert.equal(await resolveSources(db, 1, { since: day(30), now: NOW }), 0);
});

test("steps are merged hour by hour: the home device's hours, the other one's where it has none", async () => {
  const { raw, db } = setup();
  fitbitEveryDay(raw);
  insert(raw, "google-wearables", "steps", "g08", { start: day(0) + "T08:00:00Z", end: day(0) + "T08:01:00Z", value: 900 });
  // The phone (and the watch for two hours a day) send hourly steps and the hours worn.
  await saveAppleHealth(db, 1, { records: [
    { type: "steps", id: "a08", start: day(0) + "T08:00:00Z", end: day(0) + "T09:00:00Z", value: 700 },
    { type: "steps", id: "a14", start: day(0) + "T14:00:00Z", end: day(0) + "T15:00:00Z", value: 400 },
    { type: "daily-wear-hours", id: "wear:" + day(0), date: day(0), value: 2 }
  ] }, { now: NOW });
  assert.equal(role(raw, "apple-health", "apple:a08"), "duplicate", "both measured 8 o'clock: the Fitbit, worn longer, counts");
  assert.equal(role(raw, "google-wearables", "g08"), "primary");
  assert.equal(role(raw, "apple-health", "apple:a14"), "primary", "the hour without the Fitbit comes from the phone");
});

test("a chosen source wins where it has data and the choice can go back to automatic", async () => {
  const { raw, db } = setup();
  fitbitEveryDay(raw);
  insert(raw, "apple-health", "daily-resting-heart-rate", "arhr" + day(0), { sample: day(0), value: 58 });
  await resolveSources(db, 1, { since: day(30), now: NOW });
  assert.equal(role(raw, "apple-health", "arhr" + day(0)), "duplicate");
  const saved = await saveSourcePriority(db, 1, { night: "apple" }, { now: NOW });
  assert.deepEqual(saved.priority, { night: "apple", day: "auto" });
  assert.equal(role(raw, "apple-health", "arhr" + day(0)), "primary");
  assert.equal(role(raw, "google-wearables", "grhr" + day(0)), "duplicate");
  assert.equal(role(raw, "google-wearables", "grhr" + day(1)), "primary", "a night the watch did not measure keeps the Fitbit");
  await saveSourcePriority(db, 1, { night: "auto" }, { now: NOW });
  assert.equal(role(raw, "apple-health", "arhr" + day(0)), "duplicate");
  assert.equal((await saveSourcePriority(db, 1, { day: "ultrahuman" })).code, 400, "the ring has no day data");
  assert.deepEqual(await readSourcePriority(db, 1), { night: "auto", day: "auto" });
  assert.deepEqual((await connectionStatus({ DB: db, USER_ID: 1 })).priority, { night: "auto", day: "auto" });
});

test("the choices offered follow the connected sources", () => {
  assert.deepEqual(priorityChoices(["google", "apple", "intervals"]), { night: ["google", "apple"], day: ["google", "apple"] });
  assert.deepEqual(priorityChoices(["ultrahuman", "apple"]), { night: ["ultrahuman", "apple"], day: ["apple"] });
});

test("an evening nap from the band stays when the watch's night wins the day", async () => {
  const { raw, db } = setup();
  const sleep = (family, id, start, end, nap) => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,?,'sleep',?,?,?,?)")
    .run(family, id, start, end, JSON.stringify({ sleep: { interval: { startTime: start, endTime: end }, metadata: { nap } } }));
  // The watch every night, the band only some: the watch is home.
  for (let i = 0; i < 10; i++) sleep("apple-health", "an" + i, day(i + 1) + "T22:00:00Z", day(i) + "T05:00:00Z", false);
  sleep("google-wearables", "gn", day(1) + "T22:00:00Z", day(0) + "T05:00:00Z", false);
  sleep("google-wearables", "gnap", day(0) + "T17:26:00Z", day(0) + "T18:53:00Z", true);
  await resolveSources(db, 1, { since: day(30), now: NOW });
  assert.equal(role(raw, "google-wearables", "gn"), "duplicate", "the night is the watch's");
  assert.equal(role(raw, "apple-health", "an0"), "primary");
  assert.equal(role(raw, "google-wearables", "gnap"), "primary", "the nap only the band measured is kept");
  // Both measured the nap: the home device's copy counts, once.
  sleep("apple-health", "anap", day(0) + "T17:30:00Z", day(0) + "T18:50:00Z", true);
  await resolveSources(db, 1, { since: day(30), now: NOW });
  assert.equal(role(raw, "apple-health", "anap"), "primary");
  assert.equal(role(raw, "google-wearables", "gnap"), "duplicate");
  assert.equal(await resolveSources(db, 1, { since: day(30), now: NOW }), 0);
});

// D1 rows read (2026-10-30): the 30-day history read ~60 k zone-minute rows on
// every Google sync. It is read only when a key has two sources, and the sync
// keeps it an hour.
test("the history behind the home source is read only when two sources meet, and kept an hour for the sync", async () => {
  const { raw } = setup();
  fitbitEveryDay(raw);
  let reads = 0;
  const counted = scopedDb({ ...raw, prepare: sql => { if (/SUM\(value_numeric\) \/ 60\.0/.test(sql)) reads++; return raw.prepare(sql); } }, 1);
  await resolveSources(counted, 1, { types: ["time-in-heart-rate-zone"], since: day(2), now: NOW, cacheHistory: true });
  assert.equal(reads, 0, "Google alone: nothing to choose between");
  insert(raw, "apple-health", "time-in-heart-rate-zone", "az" + day(1), { start: day(1) + "T00:00:00Z", end: day(1) + "T02:00:00Z", value: 120 });
  await resolveSources(counted, 1, { types: ["time-in-heart-rate-zone"], since: day(2), now: NOW, cacheHistory: true });
  assert.equal(reads, 1);
  assert.equal(role(raw, "apple-health", "az" + day(1)), "duplicate", "the Fitbit is the home source of the day");
  await resolveSources(counted, 1, { types: ["time-in-heart-rate-zone"], since: day(2), now: NOW + 60000, cacheHistory: true });
  assert.equal(reads, 1, "the next sync within the hour reuses it");
  await resolveSources(counted, 1, { types: ["time-in-heart-rate-zone"], since: day(2), now: NOW + 2 * 3600000, cacheHistory: true });
  assert.equal(reads, 2);
  await resolveSources(counted, 1, { types: ["time-in-heart-rate-zone"], since: day(2), now: NOW + 2 * 3600000 });
  assert.equal(reads, 3, "other callers read it fresh");
});
