import test from "node:test";
import assert from "node:assert/strict";
import { withLang } from "../src/lang.js";
import { readinessMessage } from "../src/push.js";
import { adviceSignals, trainingStreak, injuryNote, isHardSession } from "../src/morning-advice.js";

const date = "2026-10-27";
const gym = d => ({ date: d, kind: "strength", minutes: 55 });
const threeGymDays = ["2026-10-24", "2026-10-25", "2026-10-26"].map(gym);
const night = { sleep: { minutes: 354 }, hrv: { value: 62, baseline: 50 }, restingHR: { value: 55, baseline: 56 } };
const en = v => withLang("en", () => readinessMessage(v));

test("training days in a row up to yesterday, walks and short sessions aside", () => {
  assert.deepEqual(trainingStreak(threeGymDays, date), { days: 3, gym: true });
  assert.deepEqual(trainingStreak([...threeGymDays, { date: "2026-10-25", kind: "ride", minutes: 90 }], date), { days: 3, gym: false });
  assert.deepEqual(trainingStreak([gym("2026-10-26"), { date: "2026-10-25", kind: "walk", minutes: 60 }, gym("2026-10-24")], date), { days: 1, gym: true });
  assert.deepEqual(trainingStreak([{ date: "2026-10-26", kind: "run", minutes: 10 }], date), { days: 0, gym: false });
  // Today's own session does not count yet.
  assert.equal(trainingStreak([...threeGymDays, gym(date)], date).days, 3);
});

test("Petr's morning: a 68 after 5:54 and three gym days gives the legs a break", () => {
  const m = en({ score: 68, zone: "green", ...night, date, context: { activities: threeGymDays } });
  assert.equal(m.zone, "yellow");
  assert.equal(m.alert.title, "Readiness 68 · Give your legs a break");
  assert.equal(m.alert.body, "3 gym days in a row and a short night. Upper body or an easy Z2 ride, no legs today.");
  assert.equal(withLang("cs", () => readinessMessage({ score: 68, zone: "green", ...night, date, context: { activities: threeGymDays } })).alert.body,
    "3 dny posilovny po sobě a krátká noc. Horní polovina těla nebo lehká jízda v Z2, nohy dnes ne.");
});

test("one reason keeps green but no all-out", () => {
  const m = en({ score: 80, zone: "green", ...night, date, context: { activities: [] } });
  assert.equal(m.zone, "green");
  assert.equal(m.alert.title, "Readiness 80 · Good to train");
  assert.equal(m.alert.body, "A short night. Nothing planned. Train if you like, just no all-out efforts.");
});

test("three reasons on a yellow day make it a rest day", () => {
  const m = en({ score: 55, zone: "yellow", ...night, date, planned: [{ title: "Tempo 3×10 min", sport: "ride" }], context: { activities: threeGymDays, lowDays: 2, alcohol: true } });
  assert.equal(m.zone, "red");
  assert.equal(m.alert.title, "Readiness 55 · Rest today");
  assert.equal(m.alert.body, "3 gym days in a row and a short night. Skip today's Tempo 3×10 min. A walk or easy mobility at most.");
});

test("a fresh green day before a hard session keeps today easy", () => {
  const fresh = { ...night, sleep: { minutes: 470 } };
  const m = en({ score: 82, zone: "green", ...fresh, date, tomorrow: [{ title: "Threshold 4×8 min", sport: "ride" }], context: { activities: [] } });
  assert.equal(m.alert.title, "Readiness 82 · Keep today easy");
  assert.equal(m.alert.body, "Tomorrow: Threshold 4×8 min. Easy Z2 today so you're fresh for it.");
  // A hard session today too: today's plan goes first.
  assert.equal(en({ score: 82, zone: "green", ...fresh, date, planned: [{ title: "VO2 5×4 min", sport: "ride" }], tomorrow: [{ title: "Threshold 4×8 min", sport: "ride" }], context: { activities: [] } }).alert.title, "Readiness 82 · Go hard today");
  // An easy ride tomorrow changes nothing.
  assert.equal(en({ score: 82, zone: "green", ...fresh, date, tomorrow: [{ title: "Endurance 90 min", sport: "ride" }], context: { activities: [] } }).alert.title, "Readiness 82 · Go hard today");
});

test("an injury the coach knows about is remembered", () => {
  assert.equal(injuryNote(["Likes morning rides", "Knee pain since Sunday"]), "Knee pain since Sunday");
  assert.equal(injuryNote(["Had a cold last week"]), null);
  const m = en({ score: 84, zone: "green", ...night, sleep: { minutes: 470 }, date, context: { activities: [], memories: ["Knee pain since Sunday"] } });
  assert.equal(m.alert.title, "Readiness 84 · Train with care");
  assert.equal(m.alert.body, "Nothing planned. A good day for a harder session. Keep in mind: Knee pain since Sunday.");
});

test("status and illness still win over everything", () => {
  assert.equal(en({ score: 74, zone: "green", ...night, athleteState: "sick", date, context: { activities: threeGymDays } }).alert.body, "Let your body recover today.");
  assert.equal(en({ score: 74, zone: "green", ...night, flags: ["respiration_elevated"], date, context: { activities: threeGymDays } }).alert.title, "Readiness 74 · No intensity today");
});

test("without context the advice is the score's alone", () => {
  assert.equal(en({ score: 68, zone: "green", ...night }).alert.title, "Readiness 68 · Go hard today");
  assert.deepEqual(adviceSignals({ date, sleepMinutes: 470, context: {} }), []);
  assert.equal(isHardSession({ title: "Upper body", sport: "strength" }), false);
  assert.equal(isHardSession({ title: "Threshold 4×8 min", sport: "ride" }), true);
});

test("Today's coach card says what the morning push says", async () => {
  const { readinessSummary } = await import("../src/app-today.js");
  const changed = en({ score: 68, zone: "green", ...night, date, context: { activities: threeGymDays } }).changed;
  assert.deepEqual(changed, { headline: "Give your legs a break", recommendation: "3 gym days in a row and a short night. Upper body or an easy Z2 ride, no legs today." });
  const coach = { headline: "How to start today", text: "Sleep 5 h 54 min.", recommendation: "Nothing is planned today: room to recover." };
  assert.deepEqual(readinessSummary(coach, { zone: "green" }, null, false, false, changed), { ...coach, ...changed });
  // Nothing changed by the days before: the coach's own card.
  assert.equal(en({ score: 86, zone: "green", ...night, sleep: { minutes: 480 }, date, context: { activities: [] } }).changed, undefined);
  assert.equal(readinessSummary(coach, { zone: "green" }, null, false, false, null), coach);
  // Once today's training is done, the coach's recovery card stays.
  assert.equal(readinessSummary(coach, { zone: "green" }, null, true, true, changed), coach);
  // Red and illness keep their own lines.
  assert.equal(withLang("en", () => readinessSummary(coach, { zone: "red" }, null, false, false, changed)).headline, "A day to recover");
});
