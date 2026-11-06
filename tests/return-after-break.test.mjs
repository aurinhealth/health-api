// Audit wave 2, topics 7 and 9: Nemoc in Deník, the return after a break or
// an illness, the gym after a gap and the threshold test after a break.
import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withLang } from "../src/lang.js";
import { readinessCheckin } from "../src/morning-checkin.js";
import { saveJournalEntry, getJournalSettings } from "../src/journal-store.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { rankOptions } from "../src/coach-pick.js";
import { returnAfterBreak, thresholdOffer } from "../src/threshold-check.js";
import { progressionDecision } from "../src/strength-intelligence.js";
import { trainingStatus } from "../src/training-status.js";
import { effectiveAthleteState } from "../src/athlete-state.js";

const date = "2026-10-08";
const day = offset => new Date(Date.parse(date + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const wellness = [...Array.from({ length: 20 }, (_, i) => ({ id: day(-20 + i), ctl: 70, atl: 72, hrv: 80, restingHR: 48 })), { id: date, ctl: 70, atl: 68, hrv: 80, restingHR: 48 }];
const sleep = { sleep: [{ type: "sleep", durationMin: 470, endTime: date + "T06:30:00" }] };
const week = (completed = []) => ({ days: completed.map(a => ({ date: a.date, daily: { training: { completed: [a] } } })) });
const coach = args => withLang("cs", () => buildCyclingCoachV2({ date, today: date, week: week([{ date: day(-3), type: "Ride", name: "Endurance", tss: 60, durationHours: 1.25 }]), fitness: { wellness }, health: sleep, gym: { history: [] }, goal: { focus: "threshold" }, ...args }));
const hard = ["vo2", "threshold", "sweet_spot", "tempo"];

test("Nemoc ticked in Deník today or yesterday makes the day a sick one, a ✕ today ends it", async () => {
  const raw = createD1(), db = scopedDb(raw, 5), other = scopedDb(raw, 6), settings = await getJournalSettings(db);
  assert.equal(await readinessCheckin(db, date), null, "no journal table yet");
  await saveJournalEntry(db, settings, { date: day(-1), key: "sick", answer: 1 });
  assert.equal(await readinessCheckin(db, date), "sick", "yesterday's tick holds today");
  assert.equal(await readinessCheckin(db, day(1)), null, "not the day after");
  await saveJournalEntry(db, settings, { date, key: "sick", answer: 0 });
  assert.equal(await readinessCheckin(db, date), null, "today's ✕ wins");
  await saveJournalEntry(db, settings, { date, key: "sick", answer: 1 });
  assert.equal(await readinessCheckin(db, date), "sick");
  assert.equal(await readinessCheckin(other, date), null, "another user's journal is not read");
});

test("the coach and Aktivita dne rest on a Nemoc day, without the status", () => {
  const sick = coach({ checkin: "sick" });
  assert.equal(sick.recommendation.session.kind, "rest");
  assert.equal(sick.recommendation.decisionRule, "journal_sick");
  assert.equal(sick.athleteState.status, "active", "the status is not set");
  assert.ok(sick.readiness.reasons.includes("Nemoc v Deníku"));
  assert.deepEqual(sick.alternatives, []);
  // Tomorrow is planned as usual (the readiness is still red then).
  assert.notEqual(coach({ checkin: "sick", date: day(1) }).recommendation.decisionRule, "journal_sick");
  const picked = withLang("cs", () => rankOptions({ ride: sick, run: sick }));
  assert.deepEqual(picked.options.map(o => o.kind), ["rest"]);
  assert.match(picked.options[0].reason, /V Deníku máš Nemoc/);
});

test("back after 14+ days off: the whole first week without intensity, then quality again", () => {
  assert.equal(returnAfterBreak([day(-30), day(-29), day(-10), day(-8)], date), day(-10));
  assert.equal(returnAfterBreak([day(-30), day(-25), day(-20), day(-15), day(-10), day(-5)], date), null, "no gap of 14 days");
  assert.equal(returnAfterBreak([day(-5)], date), day(-5), "nothing in the 30 days before");
  assert.equal(coach({}).recommendation.session.kind, "threshold");
  const third = coach({ returns: { ride: day(-3) } });
  assert.ok(!hard.includes(third.recommendation.session.kind), third.recommendation.session.kind);
  assert.ok(third.recommendation.adaptations.some(a => /první týden po pauze/.test(a)));
  assert.equal(coach({ returns: { ride: day(-7) } }).recommendation.session.kind, "threshold", "day 8 back");
  // Another sport's break does not ease the ride.
  assert.equal(coach({ returns: { run: day(-3) } }).recommendation.session.kind, "threshold");
});

test("the return after Nemoc follows how long it lasted, with a stop line", () => {
  const short = { status: "active", recoveredAt: day(-3), sickFrom: day(-6) };
  assert.equal(coach({ athleteState: short }).recommendation.session.kind, "threshold", "3 days ill: 3 easy days");
  const long = { status: "active", recoveredAt: day(-5), sickFrom: day(-15) };
  const sixth = coach({ athleteState: long });
  assert.equal(sixth.recommendation.session.kind, "endurance");
  assert.ok(sixth.recommendation.adaptations.some(a => /6\. den bez intenzity/.test(a)));
  assert.ok(sixth.recommendation.adaptations.some(a => /když se potíže během tréninku vrátí, přestaň a odpočívej/.test(a)));
  assert.equal(coach({ athleteState: { ...long, recoveredAt: day(-7), sickFrom: day(-17) } }).recommendation.session.kind, "threshold", "day 8 back");
  // The day Nemoc ends keeps when it began.
  const ended = effectiveAthleteState({ status: "sick", changedAt: "2026-09-28T07:00:00.000Z", statusUntil: day(-1) }, date);
  assert.deepEqual([ended.status, ended.recoveredAt, ended.sickFrom], ["active", day(-1), "2026-09-28"]);
});

test("Nemoc for more than a week adds a doctor to the guidance", () => {
  const now = new Date().toISOString(), old = new Date(Date.now() - 8 * 864e5).toISOString();
  withLang("cs", () => {
    assert.doesNotMatch(trainingStatus({ status: "sick", changedAt: now }).guidance[0], /lékař/);
    assert.match(trainingStatus({ status: "sick", changedAt: old }).guidance[0], /Když se to nelepší, poraď se s lékařem\./);
    assert.doesNotMatch(trainingStatus({ status: "on_break", changedAt: old }).guidance[0], /lékař/);
  });
});

test("the gym holds the weight after 14 days without the exercise, lighter after 21", () => {
  const sets = when => [1, 2, 3].map(set => ({ exercise: "back squat", workout_date: when, set_no: set, actual_kg: 80, actual_reps: 8, rpe: 7, type: "WORK", completed: 1 }));
  const after = gap => progressionDecision(sets(day(-gap)), "back squat", "6-8", 1, date);
  assert.equal(after(10).decision, "increase");
  assert.deepEqual([after(14).decision, after(14).kg], ["hold", 80]);
  assert.deepEqual([after(21).decision, after(21).kg], ["hold", 80]);
  assert.equal(after(22).decision, "return");
});

test("a threshold test comes 7–21 days after a break, and when the value is 8 weeks old", () => {
  const rides = [day(-40), day(-38), day(-36), day(-6), day(-4), day(-2), day(-1)].map(d => ({ kind: "ride", date: d, avgPower: 200 }));
  const offer = extra => thresholdOffer({ sport: "ride", sessions: rides, current: { ftp: 250 }, estimate: null, today: date, ...extra });
  assert.equal(offer({}), null);
  assert.equal(offer({ back: day(-8) }).reason, "break");
  assert.equal(offer({ back: day(-3) }), null, "the easy week first");
  assert.equal(offer({ back: day(-25) }), null, "too long ago");
  assert.equal(offer({ back: day(-8), check: { status: "dismissed", updatedAt: day(-5) + " 10:00:00" } }), null, "declined after the return");
  assert.equal(offer({ since: day(-60) }).reason, "old");
  assert.equal(offer({ since: day(-40) }), null);
});

test("the first gym session after Nemoc holds the weights with a set less, then training goes on", async () => {
  const { generateStrengthPlan } = await import("../src/strength-generator.js");
  const session = when => Array.from({ length: 4 }, (_, i) => ({ workout_date: when, exercise: "DB bench press", type: "WORK", completed: 1, set_no: i + 1, actual_kg: 20, actual_reps: 12, rpe: 6 }));
  const base = { date, cycling: { recentRideHours: 0, recentRideTss: 0, recentActivities: [], plannedWorkouts: [], nextRide: null }, recovery: {}, strength: { recentCompletedSets: session(day(-9)) }, recoveryWeek: { recovery: false, known: true } };
  const plan = extra => withLang("cs", () => generateStrengthPlan({ ...base, ...extra }, { durationMinutes: 60 }));
  const back = plan({ athleteState: { status: "active", recoveredAt: day(-2), memories: [] } });
  assert.match(back.planName, / · po nemoci$/);
  assert.match(back.rationale, /První trénink po nemoci: váhy se drží/);
  assert.ok(back.loadEstimates.every(x => x.sets <= 3));
  const bench = back.loadEstimates.find(x => x.exercise === "DB bench press");
  if (bench) assert.equal(bench.kg, 20);
  // Once a gym session is done after it, or two weeks later, as usual.
  assert.doesNotMatch(plan({ athleteState: { status: "active", recoveredAt: day(-10), memories: [] } }).planName, /po nemoci/);
  assert.doesNotMatch(plan({ athleteState: { status: "active", recoveredAt: day(-20), memories: [] } }).planName, /po nemoci/);
});
