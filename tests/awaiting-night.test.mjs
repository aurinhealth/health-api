import test from "node:test";
import assert from "node:assert/strict";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { rankOptions } from "../src/coach-pick.js";
import { withLang } from "../src/lang.js";

// Audit 2026-11-06, 4.1 and 5.7: before last night syncs, Today shows no
// number; the coach waits for the night too instead of using yesterday's
// sleep, calling the day green and planning a threshold session.
const DATE = "2026-10-08";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const wellness = Array.from({ length: 40 }, (_, i) => ({ id: day(i - 39), hrv: 56 + (i % 5), restingHR: 50 + (i % 3) }));
const nights = Array.from({ length: 19 }, (_, i) => {
  const date = day(i - 19);
  return { date, startTime: day(i - 20) + "T21:48:00Z", endTime: date + "T05:02:00Z", durationMin: 470, timeInBedMin: 490, stages: {} };
});
const tonight = { date: DATE, startTime: day(-1) + "T21:30:00Z", endTime: DATE + "T05:10:00Z", durationMin: 460, timeInBedMin: 480, stages: {} };
const ride = (date, name, tss = 70, durationHours = 1.5) => ({ date, name, type: "Ride", tss, durationHours });
const week = { days: [
  { date: day(-3), daily: { training: { planned: [], completed: [ride(day(-3), "Endurance")] } } },
  { date: day(-1), daily: { training: { planned: [], completed: [ride(day(-1), "Endurance")] } } },
  { date: DATE, daily: { training: { planned: [ride(DATE, "Threshold 4x8", 90, 1.25)], completed: [] } } }
] };
const coach = sleep => buildCyclingCoachV2({ date: DATE, today: DATE, week, fitness: { wellness: [{ id: DATE, ctl: 60, atl: 58, tsb: 2 }] }, health: { wellness, sleep }, gym: { history: [] } });

test("with last night in, a fresh day keeps the planned threshold session", () => {
  const r = coach([...nights, tonight]);
  assert.equal(r.readiness.awaitingNight, false);
  assert.equal(r.readiness.status, "green");
  assert.equal(r.recommendation.session.kind, "threshold");
});

test("before last night syncs: no hard session, not yellow, and the right reason", () => {
  const r = withLang("cs", () => coach(nights));
  assert.equal(r.readiness.awaitingNight, true);
  assert.equal(r.readiness.todayScore, null);
  assert.notEqual(r.readiness.status, "yellow");
  assert.equal(r.readiness.sleepMinutes, null, "yesterday's night is not today's");
  assert.equal(r.recommendation.session.kind, "endurance");
  assert.equal(r.recommendation.decisionRule, "await_night");
  assert.ok(r.recommendation.adaptations.some(a => /čekám na tvoji noc/.test(a)));
  assert.ok(r.readiness.reasons.some(x => /noc se ještě nenahrála/.test(x)));
  assert.ok(!r.readiness.reasons.some(x => /chybí HRV/.test(x)), "HRV is there, only the night is missing");
});

test("Aktivita dne says it waits for the night", () => {
  const ride = withLang("cs", () => coach(nights));
  const best = withLang("cs", () => rankOptions({ ride, run: ride, mainSport: "cycling", sports: ["ride"], planned: ["ride"] })).options[0];
  assert.match(best.reason, /^Čekám na tvoji noc/);
});

test("Aktivita dne claims readiness only when there is one (5.7)", () => {
  const green = { readiness: { status: "green", score: null, reasons: [] }, recommendation: { session: { kind: "endurance", durationMinutes: 60 } }, load: {} };
  const reason = (r, planned = []) => withLang("cs", () => rankOptions({ ride: r, run: r, mainSport: "cycling", sports: ["ride"], planned })).options.find(o => o.best).reason;
  assert.equal(reason(green), "Podle zátěže a spánku to dnes stačí v klidném tempu.");
  assert.equal(reason(green, ["ride"]), "Sedí to s plánem na dnešek.");
  const yellow = { ...green, readiness: { status: "yellow", score: 58, reasons: [] } };
  assert.equal(reason(yellow, ["ride"]), "Sedí to s plánem, jen dnes klidněji.");
  const scored = { ...green, readiness: { status: "green", score: 78, reasons: [] } };
  assert.equal(reason(scored, ["ride"]), "Sedí to s plánem na dnešek a připravenost na to máš.");
  assert.equal(reason(scored), "Tělo je odpočaté, dnes to stačí v klidném tempu.");
});
