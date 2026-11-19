import test from "node:test";
import assert from "node:assert/strict";
import { applyCheckin } from "../src/recovery-model.js";
import { saveCheckin, getCheckin } from "../src/morning-checkin.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";

const week = days => ({ days: days.map(([date, planned = [], completed = []]) => ({ date, daily: { training: { planned, completed } } })) });
const ride = (date, hours) => [date, [], [{ type: "Ride", name: "Endurance", durationHours: hours, tss: Math.round(hours * 50) }]];
const history = [ride("2026-09-22", 1.5), ride("2026-09-24", 1.25), ride("2026-09-26", 2), ride("2026-09-28", 1.5), ride("2026-09-29", 1.25), ride("2026-09-30", 1.5)];
const coach = extra => buildCyclingCoachV2({ date: "2026-10-01", week: week(history), fitness: { wellness: [{ id: "2026-10-01", ctl: 55, atl: 53 }] }, health: { sleep: [{ type: "sleep", durationMin: 480, endTime: "2026-10-01T06:30:00" }] }, ...extra });

test("the morning answer never changes readiness, only Sick from the Journal does", () => {
  const green = { score: 82, zone: "green", flags: [] };
  for (const feeling of ["fresh", "normal", "tired", null]) {
    const r = applyCheckin(green, feeling);
    assert.deepEqual([r.score, r.zone, r.flags], [82, "green", []], String(feeling));
  }
  assert.deepEqual([applyCheckin(green, "sick").zone, applyCheckin(green, "sick").score], ["red", 25]);
  // Without the body's number Sick alone gives the zone, the answer nothing.
  assert.deepEqual([applyCheckin({ score: null, zone: null }, "sick").zone, applyCheckin({ score: null, zone: null }, "sick").score], ["red", null]);
  assert.equal(applyCheckin({ score: null, zone: null }, "tired").zone, null);
});

test("Tired on Today: same score and zone, one reason to hold back", async () => {
  const { readinessFor } = await import("../src/readiness.js");
  const { adviceSignals } = await import("../src/morning-advice.js");
  const { dayVerdict } = await import("../src/day-verdict.js");
  const day = k => new Date(Date.parse("2026-10-11T12:00:00Z") - k * 86400000).toISOString().slice(0, 10);
  const google = Array.from({ length: 30 }, (_, i) => ({ id: day(29 - i), hrv: 70 + (i % 3), restingHR: 52 }));
  const plain = readinessFor({ date: day(0), google });
  const tired = readinessFor({ date: day(0), google, checkin: "tired" });
  assert.deepEqual([tired.score, tired.zone], [plain.score, plain.zone]);
  assert.deepEqual(adviceSignals({ date: day(0), context: { feeling: "tired" } }).map(s => s.id), ["tired"]);
  assert.deepEqual(adviceSignals({ date: day(0), context: { feeling: "fresh" } }), []);
  // Green with Tired: keep it steady, the zone stays green.
  const v = dayVerdict({ score: 80, zone: "green", date: day(0), context: { feeling: "tired" } });
  assert.deepEqual([v.key, v.shown], ["steady", "green"]);
});

test("the ride and run coach: tired leaves the zone alone, Journal Sick rests", () => {
  const plain = coach({}).readiness.status;
  for (const checkin of ["fresh", "normal", "tired"]) {
    const c = coach({ checkin });
    assert.equal(c.readiness.status, plain, checkin);
    assert.ok(!c.readiness.reasons.some(r => /ranní pocit|morning check-in/.test(r)), checkin);
  }
  const sick = coach({ checkin: "sick" });
  assert.equal(sick.readiness.status, "red");
  assert.equal(sick.recommendation.decisionRule, "journal_sick");
  // A number sent with the request wins over Sick from the Journal.
  assert.equal(coach({ checkin: "sick", manualReadiness: 90 }).readiness.status, plain);
  assert.notEqual(coach({ checkin: "sick", manualReadiness: 90 }).recommendation.decisionRule, "journal_sick");
});

test("one answer a day, cleared with null", async () => {
  const rows = new Map();
  const db = {
    userId: 7,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() { if (/^INSERT/.test(sql)) rows.set(args[0] + ":" + args[1], args[2]); if (/^DELETE/.test(sql)) rows.delete(args[0] + ":" + args[1]); return {}; },
        async first() { return rows.has(args[0] + ":" + args[1]) ? { feeling: rows.get(args[0] + ":" + args[1]) } : null; }
      };
      return stmt;
    }
  };
  await saveCheckin(db, "2026-10-11", "tired");
  await saveCheckin(db, "2026-10-11", "fresh");
  assert.equal(await getCheckin(db, "2026-10-11"), "fresh");
  await saveCheckin(db, "2026-10-11", null);
  assert.equal(await getCheckin(db, "2026-10-11"), null);
  await assert.rejects(saveCheckin(db, "2026-10-11", "great"));
});

test("HRV is compared only with days from the same source", async () => {
  const { recoveryReadiness } = await import("../src/recovery-model.js");
  const day = k => new Date(Date.parse("2026-10-11T12:00:00Z") - k * 86400000).toISOString().slice(0, 10);
  // 20 Google days around 75 ms, then 20 Apple days around 50 ms (SDNN).
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: day(40 - i), hrv: 75 + (i % 3), hrvSource: "google-wearables", restingHR: 55 })),
    ...Array.from({ length: 20 }, (_, i) => ({ id: day(20 - i), hrv: 50 + (i % 3), hrvSource: "apple-health", restingHR: 55 })),
    { id: day(0), hrv: 51, hrvSource: "apple-health", restingHR: 55 }
  ];
  const r = recoveryReadiness({ rows, date: day(0) });
  assert.ok(Math.abs(r.components.hrv.baseline - 51) < 2, String(r.components.hrv.baseline));
  assert.equal(r.components.hrv.days, 20);
});
