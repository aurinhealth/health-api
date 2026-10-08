import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { withTimeZone, timeZone, validTimeZone, localToday, localHour, localDate, localDateTime, zonedTime, dayStartUtc, localNoon, storedTimeZone, rememberTimeZone, _resetTimeZonesForTest } from "../src/user-time.js";
import { sleepSessionFromRow } from "../src/sleep-sessions.js";

const migration = readFileSync(new URL("../migrations/0012_user_time_zone.sql", import.meta.url), "utf8");

test("without a zone the day is Prague's, as before", () => {
  assert.equal(timeZone(), "Europe/Prague");
  // 23:30 UTC on 7 Oct is already 8 Oct in Prague (CEST).
  assert.equal(localToday(new Date("2026-10-07T23:30:00Z")), "2026-10-08");
  assert.equal(dayStartUtc("2026-10-08"), "2026-10-07T22:00:00");
  assert.equal(dayStartUtc("2026-01-08"), "2026-01-07T23:00:00");
});

test("another user's zone moves the day, the hour and midnight", () => withTimeZone("America/New_York", () => {
  const at = new Date("2026-10-08T02:30:00Z"); // 22:30 on 7 Oct in New York
  assert.equal(localToday(at), "2026-10-07");
  assert.equal(localHour(at), 22);
  assert.equal(localDate("2026-10-08T02:30:00Z"), "2026-10-07");
  assert.equal(localDateTime("2026-10-08T02:30:00Z"), "2026-10-07T22:30");
  assert.equal(dayStartUtc("2026-10-08"), "2026-10-08T04:00:00");
  assert.deepEqual(localNoon("2026-01-05"), { at: "2026-01-05T12:00:00-05:00", offsetSeconds: -18000 });
  // A time without a zone (Intervals.icu start_date_local) is already local.
  assert.equal(localDateTime("2026-10-07T22:30:00"), "2026-10-07T22:30");
}));

test("wall-clock times convert to instants across a DST change", () => withTimeZone("Europe/Prague", () => {
  assert.equal(new Date(zonedTime("2026-10-25T01:30:00")).toISOString(), "2026-10-24T23:30:00.000Z");
  assert.equal(new Date(zonedTime("2026-10-25T12:00:00")).toISOString(), "2026-10-25T11:00:00.000Z");
  assert.equal(new Date(zonedTime("2026-03-29T12:00:00")).toISOString(), "2026-03-29T10:00:00.000Z");
  assert.equal(zonedTime("2026-10-25T12:00:00Z"), Date.parse("2026-10-25T12:00:00Z"));
}));

test("only real zone names are accepted", () => {
  assert.equal(validTimeZone("Asia/Tokyo"), "Asia/Tokyo");
  for (const bad of ["", "Mars/Olympus", "Europe/Prague'; DROP TABLE users", "x".repeat(80), null]) assert.equal(validTimeZone(bad), null);
  assert.equal(withTimeZone("nonsense", timeZone), "Europe/Prague");
});

test("the zone is remembered per user and written only when it changes", async () => {
  _resetTimeZonesForTest();
  const raw = createD1();
  raw.sqlite.exec(migration);
  let writes = 0;
  const db = { prepare: sql => { if (/^INSERT/.test(sql)) writes++; return raw.prepare(sql); } };
  assert.equal(await storedTimeZone(db, 1), "Europe/Prague");
  await rememberTimeZone(db, 1, "Europe/Prague");
  assert.equal(writes, 0);
  await rememberTimeZone(db, 1, "America/New_York");
  await rememberTimeZone(db, 1, "America/New_York");
  assert.equal(writes, 1);
  await rememberTimeZone(db, 2, "Not/AZone");
  assert.equal(writes, 1);
  _resetTimeZonesForTest();
  assert.equal(await storedTimeZone(db, 1), "America/New_York");
  assert.equal(await storedTimeZone(db, 2), "Europe/Prague");
});

test("a night belongs to the day the user wakes up on in their zone", () => {
  const row = { external_id: "n", start_time: "2026-10-07T13:00:00Z", end_time: "2026-10-07T21:30:00Z", payload_json: "{}" };
  assert.equal(sleepSessionFromRow(row).date, "2026-10-07");
  assert.equal(withTimeZone("Asia/Tokyo", () => sleepSessionFromRow(row).date), "2026-10-08");
});
