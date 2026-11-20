// One decision of the day (day-decision.js, Petr 2026-11-20): the line under
// the readiness, the coach card, Recovery and the plan say the same thing.
import test from "node:test";
import assert from "node:assert/strict";
import { withLang } from "../src/lang.js";
import { withTimeZone } from "../src/user-time.js";
// app-today.js first: muscle-fatigue.js alone hits an import cycle.
import { buildToday, decisionSummary } from "../src/app-today.js";
import { dayDecision, lighterText, intensityCap, sessionMuscles, recoveringText } from "../src/day-decision.js";
import { numbersLine, verdictText, VERDICT_KEYS } from "../src/day-verdict.js";
import { rankOptions } from "../src/coach-pick.js";
import { readinessMessage } from "../src/push.js";
import { todayRecovery } from "../src/recovery-time.js";

const DATE = "2026-10-08", now = Date.parse(DATE + "T07:00:00Z");
const tired = (id, readyDate) => ({ id, label: { hamstrings: "Hamstrings", quads: "Quads", calves: "Calves" }[id] || id, state: "fatigued", readyDate });

test("a green morning the recovery time holds back is a steady day, and says when hard training is fine again", () => withLang("en", () => {
  const d = dayDecision({ date: DATE, verdict: "hard", zone: "green", recoveryTime: { readyAt: "2026-10-10T06:00:00Z", readyDate: "2026-10-10" }, now });
  assert.equal(d.key, "steady");
  assert.equal(d.recovering, true);
  assert.equal(d.hardFrom, "2026-10-10");
  assert.match(recoveringText(d), /hard training again from Sat/);
  // Recovery already behind: the readiness's hard day stands.
  const ready = dayDecision({ date: DATE, verdict: "hard", zone: "green", recoveryTime: { readyAt: "2026-10-08T05:00:00Z", readyDate: DATE }, now });
  assert.equal(ready.key, "hard");
  assert.equal(ready.hardFrom, null);
  // A yellow morning waits for a greener one, whatever the recovery time.
  const yellow = dayDecision({ date: DATE, verdict: "steady", zone: "yellow", recoveryTime: { readyAt: "2026-10-10T06:00:00Z", readyDate: "2026-10-10" }, now });
  assert.equal(yellow.hardFrom, null);
  assert.equal(yellow.waitsGreener, true);
  assert.equal(dayDecision({ date: DATE, verdict: null }), null);
}));

test("legs planned on hamstrings that are not rested ask for a lighter version", () => withLang("en", () => {
  const gym = todayRecovery({ sets: [], history: [], activities: [] }, { now, today: DATE, gym: { "2026-10-09": { exercises: ["Barbell Romanian deadlift", "Back squat"] } } }).gymMuscles;
  const d = dayDecision({ date: DATE, verdict: "hard", zone: "green", muscles: [tired("hamstrings", "2026-10-10")],
    open: [{ title: "Intervals 6×3 min", sport: "run" }, { title: "Easy spin", sport: "ride" }], tomorrow: [{ title: "Legs", sport: "strength" }], gym, now });
  assert.equal(d.sessions[0].fits, false);
  assert.equal(d.sessions[0].lighter, "Hamstrings still recovering, lighter version?");
  // An easy ride on tired legs is fine.
  assert.equal(d.sessions[1].fits, true);
  assert.equal(d.tomorrow[0].date, "2026-10-09");
  assert.equal(d.tomorrow[0].fits, false);
  assert.deepEqual(d.tomorrow[0].muscles, ["hamstrings"]);
  // Rested by that day: fits.
  assert.equal(dayDecision({ date: DATE, verdict: "hard", zone: "green", muscles: [tired("hamstrings", "2026-10-09")], tomorrow: [{ title: "Legs", sport: "strength" }], gym, now }).tomorrow[0].fits, true);
  assert.ok(sessionMuscles({ sport: "strength" }, gym["2026-10-09"]).includes("hamstrings"));
  assert.equal(lighterText(["hamstrings", "quads", "calves"]), "Hamstrings and quads still recovering, lighter version?");
  withLang("cs", () => assert.equal(lighterText(["hamstringy"]), "Hamstringy se ještě zotavují, lehčí verze?"));
}));

test("the line under the number never says hard when the decision does not", () => {
  assert.equal(numbersLine({ zone: "green" }), "hard");
  assert.equal(numbersLine({ zone: "green", hold: true }), "usual");
  assert.equal(numbersLine({ zone: "yellow", hold: true }), "steady");
});

test("the coach card's headline is the decision", () => withLang("en", () => {
  const engine = { headline: "A day to recover", text: "Sleep 5 h 40 min.", recommendation: "Take a rest day." };
  assert.equal(decisionSummary(engine, { key: "hard", done: false }, true).headline, verdictText("hard"));
  assert.doesNotMatch(decisionSummary(engine, { key: "hard", done: false }, true).recommendation, /rest day/);
  assert.equal(decisionSummary(engine, { key: "hard", done: true }).headline, "Time to recover");
  assert.equal(decisionSummary(engine, { key: "steady", recovering: true, hardFrom: "2026-10-10" }).headline, verdictText("steady"));
  for (const key of VERDICT_KEYS) assert.equal(decisionSummary({ headline: "How to start today" }, { key }).headline, verdictText(key));
}));

test("Activity of the day keeps to the decision's cap", () => {
  const coach = kind => ({ readiness: { status: "green", score: 80 }, recommendation: { session: { kind, durationMinutes: 60 } }, load: {} });
  const free = rankOptions({ ride: coach("vo2max"), run: coach("threshold"), mainSport: "cycling", sports: ["ride", "run"] });
  assert.equal(free.options[0].kind, "ride");
  assert.match(free.options[0].title, /VO2max/);
  const capped = rankOptions({ ride: coach("vo2max"), run: coach("threshold"), mainSport: "cycling", sports: ["ride", "run"], cap: "steady" });
  assert.ok(capped.options.filter(o => o.kind === "ride" || o.kind === "run").every(o => !/VO2max|threshold|práh/i.test(o.title)), JSON.stringify(capped.options.map(o => o.title)));
  const rest = rankOptions({ ride: coach("vo2max"), run: coach("threshold"), mainSport: "cycling", sports: ["ride", "run"], cap: "rest" });
  assert.equal(rest.options[0].kind, "rest");
  const legs = rankOptions({ ride: coach("endurance"), run: coach("endurance"), mainSport: "strength", sports: ["strength"], tiredLegs: true });
  assert.equal(legs.lowerTired, true);
  assert.equal(intensityCap({ key: "hard", done: true }), "rest");
  assert.equal(intensityCap({ key: "legs" }), "steady");
});

// 40 days of a stable baseline, today a little better: a green morning.
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const wellness = Array.from({ length: 40 }, (_, i) => ({ id: day(i - 39), hrv: i === 39 ? 66 : 56 + (i % 5), restingHR: i === 39 ? 47 : 50 + (i % 3), steps: 8000 }));
const sessions = Array.from({ length: 20 }, (_, i) => ({ date: day(i - 19), startTime: day(i - 20) + "T21:30:00Z", endTime: day(i - 19) + "T05:30:00Z", durationMin: 470, timeInBedMin: 480 }));
const bigRide = { kind: "ride", type: "Ride", source: "intervals", name: "Long ride", tss: 420, icu_intensity: 75, minutes: 300, end: now - 20 * 3600000 };

test("Today: the line under the number, the verdict, the coach card and Recovery agree", () => withTimeZone("UTC", () => withLang("en", () => {
  const base = { date: DATE, hour: 9, now, health: { wellness }, sleep: { sessions }, coaches: { morningSummary: { headline: "How to start today", text: "Sleep 7 h 50 min.", recommendation: "Stick to the plan." } } };
  const fresh = buildToday({ ...base, training: todayRecovery({ sets: [], history: [], activities: [], today: DATE }, { now, today: DATE }) });
  assert.equal(fresh.readiness.zone, "green");
  assert.equal(fresh.day.key, "hard");
  assert.equal(fresh.readiness.numbersLine, "hard");
  const t = buildToday({ ...base, training: todayRecovery({ sets: [], history: [], activities: [bigRide], today: DATE }, { now, today: DATE }) });
  assert.ok(t.recoveryTime, "Recovery counts down");
  assert.equal(t.day.key, "steady");
  assert.equal(t.day.hardFrom, t.recoveryTime.readyDate);
  assert.equal(t.readiness.verdict, t.day.key);
  assert.equal(t.readiness.numbersLine, "usual");
  assert.equal(t.summary.headline, verdictText("steady"));
  assert.doesNotMatch(t.summary.recommendation, /Stick to the plan/);
})));

test("the morning push holds a hard day back for the recovery time as Today does", () => withLang("en", () => {
  const input = { score: 85, zone: "green", sleep: { minutes: 480 }, planned: [{ title: "VO2max 5×4 min", sport: "ride" }] };
  assert.equal(readinessMessage(input).verdict, "hard");
  const held = readinessMessage({ ...input, recovering: true, hardFrom: "2026-10-10" });
  assert.equal(held.verdict, "steady");
  assert.ok(held.alert.title.endsWith(verdictText("steady")));
  assert.match(held.alert.body, /hard training again from Sat/);
}));
