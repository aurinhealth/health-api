// The cycle and the words of an injury reach the AI only with consent (Today
// audit 2026-11-04, points 1, 2 and 31): the coach's screen sentence, the
// chat's engine, the day readiness the reviews get, the morning push, and
// the sentence's own records, which go after KEEP_DAYS.
import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withLang } from "../src/lang.js";
import { localToday } from "../src/user-time.js";
import { screenText, screenFacts, KEEP_DAYS } from "../src/screen-texts.js";
import { cycleForCoach, cycleShared, partsForAI } from "../src/cycle-model.js";
import { buildCyclingCoachV2, engineForAI } from "../src/cycling-coach-v2.js";
import { unauthorizedResponse } from "../src/dashboard-auth.js";

const date = "2026-11-04";
// Tracking on, day 2 of a heavy period with cramps.
const cycleOf = share => ({ settings: { enabled: true, shareWithCoach: share, adaptTraining: true, cycleLength: 28, periodLength: 5 }, days: [{ date: "2026-11-03", flow: 2 }, { date, flow: 3, symptoms: ["cramps"] }] });
// Today's own cycle card, shown whenever tracking is on.
const todayCard = { ask: false, hormonal: false, lifeStage: "regular", cycleDay: 2, phase: "menstrual", flow: 3, symptoms: ["cramps"], eased: true, note: "Easy today" };
const today = (extra = {}) => ({
  date, readiness: { score: 71, zone: "yellow" }, sleep: { minutes: 420, need: 450 }, hrv: { value: 52, baseline: 58 }, restingHR: { value: 52, baseline: 49 },
  summary: { text: "Sleep 7 h.", recommendation: "Nothing planned. A good day for a harder session. Keep in mind: Knee pain since Sunday.", remember: "Keep in mind: Knee pain since Sunday." },
  readinessDetail: { parts: [{ key: "restingHR", points: -2, cycle: true }, { key: "hrv", points: -4 }] },
  plan: [{ kind: "pill", title: "Pill 6 of 21", done: false }, { kind: "workout", title: "Endurance", done: false }], cycle: todayCard, ...extra
});
const CYCLE_WORDS = /menstru|period|cycle|cramps|luteal|"phase"|cycleDay|pill|prášek/i;

test("Today's sentence: no cycle without 'Coach knows my cycle', only the shared view with it", () => {
  const hidden = screenFacts("today", today({ coachCycle: null }));
  assert.equal("cycle" in hidden.facts, false);
  assert.doesNotMatch(JSON.stringify(hidden.facts), CYCLE_WORDS);
  const coachCycle = cycleForCoach({ ...cycleOf(true), date });
  const shared = screenFacts("today", today({ coachCycle }));
  assert.deepEqual(shared.facts.cycle, { phase: "menstrual", cycleDay: 2, eased: true, symptoms: ["cramps"] });
  assert.equal(cycleForCoach({ ...cycleOf(false), date }), null);
  // The pill is cycle data too: only with sharing; the user still sees it under Proč?.
  assert.deepEqual(hidden.facts.plan.map(i => i.title), ["Endurance"]);
  assert.match(hidden.basis.find(b => b.label === "Plán dne").value, /Pill 6 of 21/);
  assert.deepEqual(shared.facts.plan.map(i => i.title), ["Pill 6 of 21", "Endurance"]);
  // Turning sharing off (or on) changes the fingerprint, so today's text is written again.
  assert.notEqual(hidden.fingerprint, shared.fingerprint);
  const none = screenFacts("today", today({ coachCycle: null, summary: { text: "Sleep 7 h.", recommendation: "Go." } }));
  assert.doesNotMatch(none.fingerprint, /cycle|injury/);
});

test("Today's sentence: the injury's words stay out, the AI only knows there is one", () => {
  const f = screenFacts("today", today()).facts;
  assert.doesNotMatch(JSON.stringify(f), /Knee|Keep in mind/);
  assert.equal(f.ruleBasedSummary, "Sleep 7 h. Nothing planned. A good day for a harder session.");
  assert.equal(f.injuryNoted, true);
  const plain = screenFacts("today", today({ summary: { text: "Sleep 7 h.", recommendation: "Go." } })).facts;
  assert.equal(plain.ruleBasedSummary, "Sleep 7 h. Go.");
  assert.equal("injuryNoted" in plain, false);
  // The rule-based text the user reads keeps it.
  assert.match(screenFacts("today", today()).fallback.advice, /Knee pain/);
});

test("the AI request itself carries neither", async () => {
  const env = { DB: scopedDb(createD1(), 1), USER_ID: 1, USER_IS_OWNER: true, OPENAI_API_KEY: "test" };
  let input = "";
  const r = await withLang("en", () => screenText(env, { screen: "today", load: async () => today({ coachCycle: null }), ask: async (_e, req) => { input = req.input; return { text: JSON.stringify({ text: "A steady day.", advice: "" }) }; } }));
  assert.equal(r.source, "ai");
  assert.doesNotMatch(input, CYCLE_WORDS);
  assert.doesNotMatch(input, /Knee/);
});

test("readiness parts lose the luteal mark unless the cycle is shared", () => {
  const parts = [{ key: "restingHR", points: -2, cycle: true }, { key: "hrv", points: 3 }];
  assert.deepEqual(partsForAI(parts, false), [{ key: "restingHR", points: -2 }, { key: "hrv", points: 3 }]);
  assert.equal(partsForAI(parts, true), parts);
  assert.equal(cycleShared(cycleOf(true)), true);
  assert.equal(cycleShared(cycleOf(false)), false);
  assert.equal(cycleShared({ settings: { enabled: false, shareWithCoach: true } }), false);
  assert.equal(cycleShared(null), false);
});

test("the coach engine eases a period day for the app, the AI sees no reason unless shared", () => withLang("en", () => {
  const engine = {
    readiness: { todayParts: [{ key: "restingHR", points: -2, cycle: true }] },
    rationale: ["Duration 30 of 60 min: period.", "Other reason."],
    recommendation: { adaptations: ["period with heavy flow, cramps or fatigue: easy and short today"], session: { kind: "endurance" } }
  };
  const ai = engineForAI(engine, { cycleShared: false });
  assert.doesNotMatch(JSON.stringify(ai), CYCLE_WORDS);
  assert.deepEqual(ai.rationale, ["Duration 30 of 60 min: an easier day.", "Other reason."]);
  assert.deepEqual(ai.recommendation.adaptations, ["easy and short today"]);
  assert.equal(ai.recommendation.session.kind, "endurance");
  assert.match(JSON.stringify(engine), /period/, "the app's own copy is untouched");
  assert.equal(engineForAI(engine, { cycleShared: true }), engine);
}));

test("a real engine run on a heavy period day: eased, and no cycle words for the AI", () => withLang("en", () => {
  const engine = buildCyclingCoachV2({ date, daily: { training: { planned: [{ name: "VO2max 5×4", type: "Ride", durationHours: 1, tss: 80 }] } }, week: { days: [] }, fitness: { wellness: [] }, health: {}, gym: {}, availabilityMinutes: 90, profile: { sex: "female", cycle: cycleOf(false) }, sport: "ride" });
  assert.match(JSON.stringify(engine), /period/);
  assert.doesNotMatch(JSON.stringify(engineForAI(engine, { cycleShared: false })), /menstru|period/i);
}));

test("the sentence's records of earlier days go after KEEP_DAYS", async () => {
  const raw = createD1(), env = { DB: scopedDb(raw, 1), USER_ID: 1, USER_IS_OWNER: true, OPENAI_API_KEY: "test" };
  const ask = async () => ({ text: JSON.stringify({ text: "A steady day.", advice: "" }) });
  await screenText(env, { screen: "today", load: async () => today(), ask });
  const day = localToday(), back = n => new Date(Date.parse(day + "T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);
  for (const d of [back(KEEP_DAYS + 3), back(KEEP_DAYS + 1), back(KEEP_DAYS), back(1)]) await env.DB.prepare("INSERT INTO ai_screen_texts (user_id, day, screen, lang, text, generations) VALUES (1, ?, 'food', 'cs', 'x', 1)").bind(d).run();
  await env.DB.prepare("INSERT INTO ai_screen_texts (user_id, day, screen, lang, text, generations) VALUES (1, ?, 'training', 'cs', 'x', 1)").bind(back(KEEP_DAYS + 3)).run();
  await screenText(env, { screen: "food", load: async () => ({ kcal: 0, target: 2600, macros: {}, meals: [] }), ask });
  const days = (await env.DB.prepare("SELECT day FROM ai_screen_texts WHERE user_id=1 AND screen IN ('today','food') ORDER BY day").all()).results.map(r => r.day);
  assert.deepEqual(days, [back(KEEP_DAYS), back(1), day, day].sort());
  // Another screen's old text goes with that screen's next first text of a day.
  assert.ok(await env.DB.prepare("SELECT 1 FROM ai_screen_texts WHERE user_id=1 AND screen='training'").first());
});

test("'Sign in' follows the app's language before the user is known", async () => {
  const en = await unauthorizedResponse(new Request("https://x/app/api/today", { headers: { "X-Interface-Language": "en" } })).json();
  assert.equal(en.message, "Sign in to the app.");
  const cookie = await unauthorizedResponse(new Request("https://x/", { headers: { cookie: "a=1; lw-lang=en" } })).json();
  assert.equal(cookie.message, "Sign in to the app.");
  assert.equal((await unauthorizedResponse().json()).message, "Přihlas se do dashboardu.");
});
