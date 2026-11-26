// Audit wave 2, topics 7 and 9: Nemoc in Deník, the return after a break or
// an illness, the gym after a gap and the threshold test after a break.
import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withLang } from "../src/lang.js";
import { readinessCheckin, journalSickReturn } from "../src/morning-checkin.js";
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
  // C10: a new athlete's first session is no break; with older data (start)
  // it is, and a session before the window counts as the one before.
  assert.equal(returnAfterBreak([day(-5)], date), null, "first session ever");
  assert.equal(returnAfterBreak([day(-5)], date, { start: day(-90) }), day(-5), "nothing in the 90 days read");
  assert.equal(returnAfterBreak([day(-20), day(-10)], date), null, "the window's first day is no session");
  assert.equal(returnAfterBreak([day(-60), day(-20)], date), day(-20), "the gap began before the window");
  assert.equal(coach({}).recommendation.session.kind, "threshold");
  // R2: after 14 to 27 days off intensity after 2 sessions, after 28 or more after 3 and a week.
  const second = coach({ returns: { ride: day(-3), gap: { ride: 20 }, since: { ride: 1 } } });
  assert.ok(!hard.includes(second.recommendation.session.kind), second.recommendation.session.kind);
  assert.ok(second.recommendation.adaptations.some(a => /intenzita až po 2 trénincích/.test(a)));
  assert.equal(coach({ returns: { ride: day(-3), gap: { ride: 20 }, since: { ride: 2 } } }).recommendation.session.kind, "threshold", "third session back");
  assert.ok(!hard.includes(coach({ returns: { ride: day(-5), gap: { ride: 30 }, since: { ride: 3 } } }).recommendation.session.kind), "28+ days: a week too");
  assert.equal(coach({ returns: { ride: day(-7), gap: { ride: 30 }, since: { ride: 3 } } }).recommendation.session.kind, "threshold", "28+ days: 3 sessions and a week");
  // The first session back: at most 90 min after 14 to 27 days, 60 after 28 or more.
  assert.ok(coach({ week: week([]), returns: { last: { ride: day(-20) } }, availabilityMinutes: 240 }).recommendation.session.durationMinutes <= 90);
  assert.ok(coach({ week: week([]), returns: { last: { ride: day(-30) } }, availabilityMinutes: 240 }).recommendation.session.durationMinutes <= 60);
  // "Trained elsewhere" on Welcome back cancels it.
  assert.equal(coach({ returns: { ride: day(-3), gap: { ride: 20 }, since: { ride: 1 } }, athleteState: { status: "active", elsewhere: day(-23) } }).recommendation.session.kind, "threshold", "trained elsewhere");
  // Another sport's break does not ease the ride.
  assert.equal(coach({ returns: { run: day(-3), gap: { run: 20 }, since: { run: 1 } } }).recommendation.session.kind, "threshold");
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
  // C11: two rides since the break are enough for the test after it.
  const two = [day(-60), day(-58), day(-10), day(-9)].map(d => ({ kind: "ride", date: d, avgPower: 200 }));
  assert.equal(thresholdOffer({ sport: "ride", sessions: two, current: { ftp: 250 }, estimate: null, today: date, back: day(-10) }).reason, "break");
  assert.equal(thresholdOffer({ sport: "ride", sessions: two, current: { ftp: 250 }, estimate: null, today: date }), null);
});

test("the first gym session after Nemoc holds the weights with a set less, then training goes on", async () => {
  const { generateStrengthPlan } = await import("../src/strength-generator.js");
  const session = when => Array.from({ length: 4 }, (_, i) => ({ workout_date: when, exercise: "DB bench press", type: "WORK", completed: 1, set_no: i + 1, actual_kg: 20, actual_reps: 12, rpe: 6 }));
  const base = { date, cycling: { recentRideHours: 0, recentRideTss: 0, recentActivities: [], plannedWorkouts: [], nextRide: null }, recovery: {}, strength: { recentCompletedSets: session(day(-9)) }, recoveryWeek: { recovery: false, known: true } };
  const plan = extra => withLang("cs", () => generateStrengthPlan({ ...base, ...extra }, { durationMinutes: 60 }));
  const back = plan({ athleteState: { status: "active", recoveredAt: day(-2), memories: [] } });
  assert.match(back.planName, /, po nemoci$/);
  assert.match(back.rationale, /První trénink po nemoci: váhy se drží/);
  assert.ok(back.loadEstimates.every(x => x.sets <= 3));
  const bench = back.loadEstimates.find(x => x.exercise === "DB bench press");
  if (bench) assert.equal(bench.kg, 20);
  // Once a gym session is done after it, or two weeks later, as usual.
  assert.doesNotMatch(plan({ athleteState: { status: "active", recoveredAt: day(-10), memories: [] } }).planName, /po nemoci/);
  assert.doesNotMatch(plan({ athleteState: { status: "active", recoveredAt: day(-20), memories: [] } }).planName, /po nemoci/);
});

test("R6: easy days after the main race as a suggestion, the race not the longest run", () => {
  const raced = week([{ date: day(-2), type: "Ride", name: "Race", tss: 200, durationHours: 3 }]);
  const after = coach({ week: raced, focus: { pastRace: { date: day(-2), daysAgo: 2, sport: "ride", km: 90 } } });
  assert.ok(!hard.includes(after.recommendation.session.kind), after.recommendation.session.kind);
  assert.ok(after.recommendation.adaptations.some(a => /2\. den po závodě z 2/.test(a)));
  assert.equal(coach({ week: raced, focus: { pastRace: { date: day(-3), daysAgo: 3, sport: "ride", km: 90 } } }).recommendation.session.kind, "threshold", "3 h race: 2 days only");
});

test("R5: as many easy days as sick days after Nemoc, at least 2, at most 7", async () => {
  const raw = createD1(), db = scopedDb(raw, 5), settings = await getJournalSettings(db);
  assert.equal(await journalSickReturn(db, date), null, "no journal table yet");
  for (const o of [-6, -5, -4]) await saveJournalEntry(db, settings, { date: day(o), key: "sick", answer: 1 });
  // Sick -6..-4, -3 still sick (the day after a tick), -2 is easy day 1 of 3.
  assert.deepEqual(await journalSickReturn(db, day(-3)), null, "the day after the last tick is still a sick day");
  assert.deepEqual(await journalSickReturn(db, day(-2)), { day: 1, of: 3 });
  assert.deepEqual(await journalSickReturn(db, date), { day: 3, of: 3 });
  assert.equal(await journalSickReturn(db, day(1)), null, "after the easy days, as usual");
  const one = scopedDb(raw, 7), s7 = await getJournalSettings(one);
  await saveJournalEntry(one, s7, { date: day(-3), key: "sick", answer: 1 });
  assert.deepEqual(await journalSickReturn(one, date), { day: 2, of: 2 }, "one sick day still gives 2");
  const easy = coach({ sickReturn: { day: 1, of: 3 } });
  assert.ok(!hard.includes(easy.recommendation.session.kind), easy.recommendation.session.kind);
  assert.ok(easy.recommendation.adaptations.some(a => /1\. den z 3 po nemoci/.test(a)));
  assert.equal(coach({ sickReturn: { day: 1, of: 3 }, goal: { focus: "threshold", asked: true, chat: true, insisted: true } }).recommendation.session.kind, "threshold", "insisted: the athlete's call");
});

test("R7: a sore shoulder in the pool: no paddles or pull buoy, a pause offered, long easy swims stay", () => {
  const swim = args => coach({ sport: "swim", athleteState: { status: "active", memories: ["bolí mě rameno"] }, ...args });
  const easy = swim();
  assert.ok(!hard.includes(easy.recommendation.session.kind), easy.recommendation.session.kind);
  assert.ok(easy.recommendation.adaptations.some(a => /bez packelí a piškotu; plavání můžeš na pár dní vynechat/.test(a)));
  assert.equal(swim({ goal: { focus: "long_endurance" } }).recommendation.session.kind, "long_endurance", "a longer swim stays");
  assert.ok(!coach({ sport: "swim" }).recommendation.adaptations.some(a => /packelí/.test(a)), "no shoulder pain, no note");
});

test("R4 gym: after more than 21 days the first 2 sessions held, after more than 56 the first 4, weights 10 or 20 % lighter", async () => {
  const { generateStrengthPlan } = await import("../src/strength-generator.js");
  const { progressionDecision: decide } = await import("../src/strength-intelligence.js");
  const session = when => Array.from({ length: 3 }, (_, i) => ({ workout_date: when, exercise: "DB bench press", type: "WORK", completed: 1, set_no: i + 1, actual_kg: 30, actual_reps: 10, rpe: 7 }));
  const plan = days => withLang("cs", () => generateStrengthPlan({ date, cycling: { recentRideHours: 0, recentRideTss: 0, recentActivities: [], plannedWorkouts: [], nextRide: null }, recovery: {}, strength: { recentCompletedSets: days.flatMap(d => session(day(d))) }, recoveryWeek: { recovery: false, known: true } }, { durationMinutes: 60 }));
  assert.match(plan([-30]).planName, /, po pauze$/);
  assert.match(plan([-30]).rationale, /Návrat do posilovny po 30 dnech/);
  assert.match(plan([-40, -5]).planName, /, po pauze$/, "one session back of 2");
  assert.doesNotMatch(plan([-40, -5, -3]).planName, /po pauze/, "two sessions back: as usual");
  assert.match(plan([-80, -7, -5, -3]).planName, /, po pauze$/, "after 56 days: 4 sessions");
  assert.doesNotMatch(plan([-80, -9, -7, -5, -3]).planName, /po pauze/);
  assert.doesNotMatch(plan([-20, -10]).planName, /po pauze/, "21 days or less: as usual");
  const kg = d => decide(session(day(d)), "DB bench press", 10, 1, date).kg;
  assert.equal(kg(-30), 25, "27 kg rounded down to the 2.5 kg step");
  assert.equal(kg(-70), 22.5, "24 kg rounded down");
});

test("R4: one trial session after Zranění, then a plan card, never a pain question", async () => {
  const { injuryTrial, trialQuestion, welcomeAnswer } = await import("../src/coach-gap-checkin.js");
  const { updateAthleteState, getAthleteState } = await import("../src/athlete-state.js");
  const raw = createD1(), db = scopedDb(raw, 5);
  await updateAthleteState(db, { status: "injured" }, { date: day(-5) });
  await updateAthleteState(db, { status: "active" }, { date: day(-3) });
  let state = await getAthleteState(db, { date });
  assert.equal(state.injuryBack, day(-3));
  assert.deepEqual(injuryTrial(state, [day(-10)], date), { mode: "trial" }, "nothing since the status ended");
  assert.deepEqual(injuryTrial(state, [day(-1)], date), { mode: "ask" });
  const q = trialQuestion(injuryTrial(state, [day(-1)], date));
  assert.equal(q.text, "Jak pokračovat po zkušebním tréninku?");
  assert.deepEqual(q.answers.map(a => a.label), ["Pomalu přidávat", "Zopakovat zkušební trénink", "Nechat Zranění"]);
  assert.equal(trialQuestion({ mode: "trial" }), null);
  assert.deepEqual(welcomeAnswer(q, "injured").patch, { status: "injured" });
  assert.deepEqual(welcomeAnswer(q, "later").patch, { trial: "repeat" }, "closed: the trial again");
  await updateAthleteState(db, welcomeAnswer(q, "slow").patch, { date });
  state = await getAthleteState(db, { date });
  assert.deepEqual(injuryTrial(state, [day(-1)], date), { mode: "slow" });
  assert.equal(injuryTrial(state, [day(-1), date, day(1)], day(2)), null, "2 sessions after the choice: as usual");
  await updateAthleteState(db, { trial: "repeat" }, { date });
  state = await getAthleteState(db, { date });
  assert.deepEqual(injuryTrial(state, [day(-1)], date), { mode: "trial" }, "repeat: a trial again");
  assert.equal(injuryTrial(state, [], day(40)), null, "six weeks on: nothing");
  // The status that ends on its own date counts the same.
  assert.equal((await import("../src/athlete-state.js")).effectiveAthleteState({ status: "injured", statusUntil: day(-2), trial: { choice: "slow", on: day(-9) } }, date).injuryBack, day(-2));
  // The day coach: capped and easy, firm.
  const run = coach({ sport: "run", injuryTrial: { mode: "trial" }, availabilityMinutes: 90 });
  assert.ok(!hard.includes(run.recommendation.session.kind));
  assert.ok(run.recommendation.session.durationMinutes <= 30, String(run.recommendation.session.durationMinutes));
  assert.ok(run.recommendation.adaptations.some(a => /střídej chůzi a klus/.test(a)));
  assert.ok(coach({ injuryTrial: { mode: "trial" }, availabilityMinutes: 120 }).recommendation.session.durationMinutes <= 45);
  assert.ok(coach({ sport: "swim", injuryTrial: { mode: "trial" }, availabilityMinutes: 60 }).recommendation.session.durationMinutes <= 20);
  assert.ok(!hard.includes(coach({ injuryTrial: { mode: "slow" } }).recommendation.session.kind));
});

test("R8: the fixed physio or doctor sentence with Zranění and a pain remembered 7 days", async () => {
  const { memoryCheck } = await import("../src/athlete-state.js");
  const line = "Aurin není zdravotnický prostředek. Když bolest trvá, zhoršuje se nebo tě znepokojuje, poraď se s fyzioterapeutem nebo lékařem.";
  assert.ok(withLang("cs", () => trainingStatus({ status: "injured" })).guidance[0].endsWith(line));
  assert.ok(!withLang("cs", () => trainingStatus({ status: "sick" })).guidance.join(" ").includes("zdravotnický prostředek"));
  assert.ok(withLang("en", () => trainingStatus({ status: "injured" })).guidance[0].endsWith("Aurin isn't a medical device. If the pain lasts, gets worse or worries you, check in with a physio or doctor."));
  const state = { memories: ["bolí mě koleno"], memoryMeta: { "bolí mě koleno": { at: day(-7), check: day(0), group: "health" } } };
  assert.equal(withLang("cs", () => memoryCheck(state, date)).message, line);
  const cold = { memories: ["jsem nachlazený"], memoryMeta: { "jsem nachlazený": { at: day(-7), check: day(0), group: "health" } } };
  assert.equal(withLang("cs", () => memoryCheck(cold, date))?.message ?? null, null, "no pain, no sentence");
});
