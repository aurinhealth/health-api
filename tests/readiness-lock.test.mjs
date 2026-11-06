import test from "node:test";
import assert from "node:assert/strict";
import { readinessFor, readinessLockOf } from "../src/readiness.js";
import { lockReadiness, readinessLocks } from "../src/readiness-lock.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const DATE = "2026-10-08";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const wellness = Array.from({ length: 40 }, (_, i) => {
  const offset = i - 39, today = offset === 0;
  return { id: day(offset), hrv: today ? 66 : 56 + (i % 5), restingHR: today ? 50 : 50 + (i % 3), respiration: 14 + (i % 3) * 0.2 };
});
const sessions = Array.from({ length: 20 }, (_, i) => {
  const date = day(i - 19);
  return { date, startTime: day(i - 20) + "T21:48:00Z", endTime: date + "T05:02:00Z", durationMin: 412, timeInBedMin: 434, stages: { DEEP: 80, REM: 90, LIGHT: 230, AWAKE: 12 } };
});
const at = (rows, patch) => rows.map(r => (r.id === DATE ? { ...r, ...patch } : r));

test("the morning readiness stays when the day's resting HR is recomputed", () => {
  const morning = readinessFor({ date: DATE, google: wellness, sessions });
  const lock = readinessLockOf(morning, DATE);
  assert.ok(lock && lock.night, "locked with its night");
  assert.equal(lock.row.restingHR, 50);
  // Evening: the watch recomputed the day's resting HR and the night grew.
  const evening = at(wellness, { restingHR: 62 });
  const longer = sessions.map(s => (s.date === DATE ? { ...s, durationMin: 520 } : s));
  assert.notEqual(readinessFor({ date: DATE, google: evening, sessions: longer }).score, morning.score, "unlocked it drifts");
  const locked = readinessFor({ date: DATE, google: evening, sessions: longer, profile: { readinessLocks: { [DATE]: lock } } });
  assert.equal(locked.score, morning.score);
});

test("a signal missing in the morning still fills in", () => {
  const noHrv = at(wellness, { hrv: null });
  const morning = readinessFor({ date: DATE, google: noHrv, sessions });
  const lock = readinessLockOf(morning, DATE);
  assert.equal(lock.row.hrv, undefined);
  const later = readinessFor({ date: DATE, google: wellness, sessions, profile: { readinessLocks: { [DATE]: lock } } });
  assert.equal(later.components.hrv.value, 66);
});

test("nothing is locked before the night arrives", () => {
  const r = readinessFor({ date: DATE, google: wellness, sessions: sessions.filter(s => s.date !== DATE) });
  assert.equal(readinessLockOf(r, DATE), null);
});

test("a night locked at a wake-up takes the rest of it when it arrives", () => {
  // Synced at 6:17 while up for a moment; asleep again until 9:03.
  const cut = sessions.map(s => (s.date === DATE ? { ...s, endTime: DATE + "T04:17:00Z", durationMin: 368, timeInBedMin: 384 } : s));
  const early = readinessFor({ date: DATE, google: wellness, sessions: cut });
  const lock = readinessLockOf(early, DATE);
  assert.equal(lock.night.durationMin, 368);
  const whole = sessions.map(s => (s.date === DATE ? { ...s, endTime: DATE + "T07:03:00Z", durationMin: 525, timeInBedMin: 555 } : s));
  // The night's HRV and resting HR come with the rest of the night too.
  const rest = at(wellness, { hrv: 72, restingHR: 47 });
  const later = readinessFor({ date: DATE, google: rest, sessions: whole, profile: { readinessLocks: { [DATE]: lock } } });
  assert.equal(later.night.durationMin, 525);
  assert.equal(later.components.hrv.value, 72);
  assert.equal(later.score, readinessFor({ date: DATE, google: rest, sessions: whole }).score);
  // Locked again with the whole night, it stays.
  const relock = readinessLockOf(later, DATE);
  const evening = readinessFor({ date: DATE, google: at(rest, { restingHR: 60 }), sessions: whole, profile: { readinessLocks: { [DATE]: relock } } });
  assert.equal(evening.score, later.score);
});

test("the main device's night arriving after another watch's takes the lock over", () => {
  // 6:30: only the Apple Watch has synced (SDNN 68). 7:40: the Fitbit worn
  // most nights arrives and replaces it (source-priority.js), RMSSD 50.
  const tagged = rows => rows.map(r => ({ ...r, hrvSource: "google-wearables", restingHRSource: "google-wearables" }));
  const apple = tagged(wellness).map(r => (r.id === DATE ? { ...r, hrv: 68, hrvSource: "apple-health:sdnn", restingHRSource: "apple-health" } : r));
  const lock = readinessLockOf(readinessFor({ date: DATE, google: apple, sessions }), DATE);
  assert.equal(lock.row.hrv, 68);
  const fitbit = at(tagged(wellness), { hrv: 50 });
  const later = readinessFor({ date: DATE, google: fitbit, sessions, profile: { readinessLocks: { [DATE]: lock } } });
  assert.equal(later.components.hrv.value, 50);
  assert.equal(later.rows.find(r => r.id === DATE).hrv, 50);
  // The same device recomputing its value later keeps the lock.
  const relock = readinessLockOf(later, DATE);
  const evening = readinessFor({ date: DATE, google: at(fitbit, { hrv: 61 }), sessions, profile: { readinessLocks: { [DATE]: relock } } });
  assert.equal(evening.components.hrv.value, 50);
});

test("a lock from the Intervals.icu copy of the night gives way to the main source's night", () => {
  // 6:00: only the Intervals.icu wellness night (no times, intervals-sleep.js).
  const copy = sessions.map(s => (s.date === DATE ? { id: "intervals-sleep:" + DATE, date: DATE, startTime: null, endTime: null, durationMin: 380, source: "intervals", stages: {} } : s));
  const lock = readinessLockOf(readinessFor({ date: DATE, google: wellness, sessions: copy }), DATE);
  assert.ok(lock && lock.night && !lock.night.startTime, "locked on the copy");
  // 7:30: the Google/Apple night with its times arrives.
  const later = readinessFor({ date: DATE, google: wellness, sessions, profile: { readinessLocks: { [DATE]: lock } } });
  assert.equal(later.night.durationMin, 412);
  assert.equal(later.score, readinessFor({ date: DATE, google: wellness, sessions }).score);
  // A night with its times is not given up for the copy.
  const own = readinessLockOf(later, DATE);
  const kept = readinessFor({ date: DATE, google: wellness, sessions: copy, profile: { readinessLocks: { [DATE]: own } } });
  assert.equal(kept.night.durationMin, 412);
});

test("nothing is locked while the watch's day, fitness or the nights failed to load", async () => {
  const db = scopedDb(createD1(), 1);
  const inputs = { date: DATE, health: { wellness }, fitness: { status: "ok", wellness: [] }, sleep: { sessions }, profile: {} };
  for (const failed of ["health", "fitness", "sleep"]) assert.equal(await lockReadiness(db, { ...inputs, [failed]: {} }), false, failed);
  assert.deepEqual(await readinessLocks(db, DATE), {});
  assert.equal(await lockReadiness(db, inputs), true);
  assert.ok((await readinessLocks(db, DATE))[DATE]);
});
