// The day's verdict matrix (Today audit points 7, 24, 26, 27): the same input
// gives the same verdict on Today (the line under the number and the coach
// card), in the morning push and in the facts for the AI, without any AI.
import test from "node:test";
import assert from "node:assert/strict";
import { withLang } from "../src/lang.js";
import { withTimeZone } from "../src/user-time.js";
import { dayVerdict, verdictText, VERDICT_KEYS } from "../src/day-verdict.js";
import { readinessMessage } from "../src/push.js";
import { buildToday, readinessSummary, strainTarget, todayWorkouts } from "../src/app-today.js";
import { screenFacts, pushesForTest } from "../src/screen-texts.js";

const date = "2026-10-27";
const gym = d => ({ date: d, kind: "strength", minutes: 55 });
const threeGymDays = ["2026-10-24", "2026-10-25", "2026-10-26"].map(gym);
const ride = [{ title: "VO2max 5×4 min", sport: "ride" }];
const KEEPS_PLAN = /drž(?:et)? se plánu|podle plánu|dodrž|stick to (?:the|your) plan|as planned|go for it|do toho/i;

const CASES = [
  ["green", { score: 82, zone: "green", sleep: { minutes: 480 }, planned: ride, date, context: { activities: [] } }, "hard"],
  ["yellow", { score: 58, zone: "yellow", sleep: { minutes: 480 }, planned: ride, date, context: { activities: [] } }, "steady"],
  ["red", { score: 41, zone: "red", sleep: { minutes: 480 }, planned: ride, date, context: { activities: [] } }, "easy"],
  ["green, one reason", { score: 80, zone: "green", sleep: { minutes: 354 }, planned: ride, date, context: { activities: [] } }, "steady"],
  ["green, tired legs", { score: 68, zone: "green", sleep: { minutes: 354 }, date, context: { activities: threeGymDays } }, "legs"],
  ["green, hard tomorrow", { score: 82, zone: "green", sleep: { minutes: 480 }, tomorrow: [{ title: "Threshold 4×8 min", sport: "ride" }], date, context: { activities: [] } }, "easy"],
  ["sick check-in", { score: 80, zone: "green", flags: ["checkin_sick"], checkin: "sick", planned: ride }, "rest"],
  ["signs", { score: 80, zone: "green", flags: ["skin_temp_elevated"], planned: ride }, "no_intensity"],
  ["paused", { score: 80, zone: "green", athleteState: "injured", planned: ride }, "rest"]
];

test("one verdict: the push's title, Today's line and the coach card agree in both languages", () => {
  for (const lang of ["cs", "en"]) withLang(lang, () => {
    for (const [name, input, key] of CASES) {
      const v = dayVerdict(input), push = readinessMessage(input);
      assert.equal(v.key, key, name);
      assert.ok(VERDICT_KEYS.includes(key), name);
      assert.equal(push.verdict, key, name);
      assert.ok(push.alert.title.endsWith(" · " + verdictText(key)), name + ": " + push.alert.title);
      const card = readinessSummary({ headline: "x", text: "t", recommendation: "Stick to the plan." }, { zone: input.zone, flags: input.flags || [] }, input.checkin || null, Boolean(input.planned), false, push.changed || null, key);
      // Yellow, red, illness and anything the days before changed: the card's headline is the verdict.
      if (input.zone !== "green" || push.changed || input.flags?.length || input.athleteState) assert.equal(card.headline, verdictText(key), name);
      if (key !== "hard" && !(key === "steady" && input.zone === "green")) {
        assert.doesNotMatch(push.alert.body, KEEPS_PLAN, name + " push");
        // A paused athlete keeps the coach's own pause guidance (training-status.js).
        if (!input.athleteState) assert.doesNotMatch(card.recommendation, KEEPS_PLAN, name + " card");
      }
    }
  });
});

test("no 'go hard' in the push any more; the strongest words are a good day for a hard workout", () => {
  const title = withLang("en", () => readinessMessage({ score: 90, zone: "green" }).alert.title);
  assert.equal(title, "Readiness 90 · Good day for a hard workout");
  assert.doesNotMatch(title, /go hard|full go/i);
});

test("illness, its signs and a paused athlete set the strain target to rest, whatever the plan", () => {
  const planned = 14, normal = strainTarget({ readiness: 80, zone: "green", planned });
  const rest = strainTarget({ readiness: 80, zone: "green", planned, recover: true });
  assert.ok(normal.high > 10);
  assert.deepEqual(rest, { low: 1.5, high: 4.5 });
});

// Today and the push read the same day: 40 days of wellness, nights ending
// 07:02 in the account's time zone.
const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const DAY = "2026-10-08";
const wellness = Array.from({ length: 40 }, (_, i) => ({ id: shift(DAY, i - 39), hrv: i === 39 ? 66 : 56 + (i % 5), restingHR: i === 39 ? 47 : 50 + (i % 3), steps: 8000 }));
// `date` is the local day of waking, as sleep-sessions.js gives it; in Tokyo
// the night ends the evening before in UTC.
const nights = (utcEnd, dayBefore = false) => Array.from({ length: 20 }, (_, i) => {
  const date = shift(DAY, i - 19), end = new Date(Date.parse((dayBefore ? shift(date, -1) : date) + "T" + utcEnd + ":00Z"));
  return { date, startTime: new Date(end - 434 * 60000).toISOString(), endTime: end.toISOString(), durationMin: 412, timeInBedMin: 434 };
});
const daily = { training: { planned: [{ start: DAY + "T17:30:00", durationHours: 1, tss: 80, name: "VO2max 5×4 min", type: "Ride" }], matched: [] } };

// As entrypoint.js todayReadiness hands it to push.js.
const pushOf = t => readinessMessage({ ...t.readiness, sleep: t.sleep, hrv: t.hrv, restingHR: t.restingHR, planned: todayWorkouts(t.plan), tomorrow: [], context: null, date: t.date });

const SCENARIOS = [
  ["Prague", "Europe/Prague", nights("05:02")],
  ["Tokyo (UTC+9)", "Asia/Tokyo", nights("22:02", true)],
  ["Los Angeles (UTC−7)", "America/Los_Angeles", nights("14:02")],
  ["no night", "Europe/Prague", nights("05:02").slice(0, -1)],
  ["a short fragment", "Europe/Prague", [...nights("05:02").slice(0, -1), { date: DAY, startTime: DAY + "T04:10:00Z", endTime: DAY + "T04:55:00Z", durationMin: 45, timeInBedMin: 45 }]],
  // Nights in Prague, then a flight: last night ended 07:02 in Tokyo.
  ["a flight to Tokyo", "Asia/Tokyo", [...nights("05:02").slice(0, -1), { date: DAY, startTime: shift(DAY, -1) + "T14:48:00Z", endTime: shift(DAY, -1) + "T22:02:00Z", durationMin: 412, timeInBedMin: 434 }]]
];

test("Today and the morning push give the same verdict and name the same workouts, in any time zone", () => {
  for (const [name, zone, sessions] of SCENARIOS) withTimeZone(zone, () => withLang("en", () => {
    const t = buildToday({ date: DAY, hour: 8, daily, health: { wellness }, sleep: { sessions }, profile: { age: 38 } });
    const push = pushOf(t);
    assert.equal(t.readiness.verdict, push.verdict ?? null, name);
    if (t.readiness.score != null) {
      assert.ok(t.readiness.verdict, name + ": a score has a verdict");
      assert.ok(push.alert.title.endsWith(verdictText(t.readiness.verdict)), name);
    }
    assert.deepEqual(todayWorkouts(t.plan).map(w => w.title), ["VO2max 5×4 min"], name);
    // The AI gets the same words.
    assert.equal(screenFacts("today", t).facts.dayVerdict, verdictText(t.readiness.verdict), name);
    if (/Prague|Tokyo|Los Angeles|flight/.test(name)) assert.equal(t.sleep?.end, "07:02", name + ": the night ends 07:02 local");
  }));
});

test("an earlier day has no verdict: nothing is left to decide", () => {
  const t = withTimeZone("Europe/Prague", () => buildToday({ date: DAY, hour: null, daily, health: { wellness }, sleep: { sessions: nights("05:02") }, profile: { age: 38 } }));
  assert.ok(t.readiness.score != null);
  assert.equal(t.readiness.verdict, null);
});

test("a sick check-in sets the strain target to rest also on a morning without a score", () => {
  const t = withTimeZone("Europe/Prague", () => buildToday({ date: DAY, hour: 8, daily, health: { wellness: [] }, sleep: { sessions: [] }, profile: { age: 38 }, checkin: "sick" }));
  assert.equal(t.readiness.score, null);
  assert.ok(t.strain.target.high <= 4.5, JSON.stringify(t.strain.target));
});

test("an earlier yellow day keeps the coach's own card", () => {
  const coach = { headline: "How it went", text: "t", recommendation: "r" };
  assert.deepEqual(readinessSummary(coach, { zone: "yellow", flags: [] }, null, true, false, null, null), coach);
});

test("the AI may not say to keep the plan when the verdict is anything but a hard day", () => {
  assert.equal(pushesForTest({ readinessZone: "green", dayVerdict: verdictText("steady") }, "Stick to the plan today."), true);
  assert.equal(pushesForTest({ readinessZone: "green", dayVerdict: verdictText("hard") }, "Stick to the plan today."), false);
});

// Wave 4, 28.2: on a yellow morning a hard ride still ahead says how to do it
// in its own card; an easy one, a green and a red morning get nothing.
test("a yellow morning puts one line under a hard planned session, not under an easy one", () => withTimeZone("Europe/Prague", () => withLang("en", () => {
  const day = (hrv, rhr) => Array.from({ length: 40 }, (_, i) => ({ id: shift(DAY, i - 39), hrv: i === 39 ? hrv : 56 + (i % 5), restingHR: i === 39 ? rhr : 50 + (i % 3), steps: 8000 }));
  const plan = (name, type = "Ride") => ({ training: { planned: [{ start: DAY + "T17:30:00", durationHours: 1, tss: 80, name, type }], matched: [] } });
  const today = (hrv, rhr, name, type) => buildToday({ date: DAY, hour: 8, daily: plan(name, type), health: { wellness: day(hrv, rhr) }, sleep: { sessions: nights("05:02") }, profile: { age: 38 } });
  const steady = t => t.plan.find(i => i.kind === "workout")?.steady;
  const yellow = today(54, 52, "VO2max 5×4 min");
  assert.equal(yellow.readiness.zone, "yellow");
  assert.equal(yellow.readiness.verdict, "steady");
  assert.equal(steady(yellow), "Steady day: ride it easy and save the intensity for another day.");
  assert.match(steady(today(54, 52, "Threshold 3×10 min", "Run")), /^Steady day: run it easy/);
  assert.equal(steady(today(54, 52, "Endurance 2 h")), undefined);
  assert.equal(steady(today(66, 47, "VO2max 5×4 min")), undefined, "green");
  assert.equal(steady(today(45, 55, "VO2max 5×4 min")), undefined, "red: the activity of the day offers the easier one");
})));
