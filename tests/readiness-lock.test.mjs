import test from "node:test";
import assert from "node:assert/strict";
import { readinessFor, readinessLockOf } from "../src/readiness.js";

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
