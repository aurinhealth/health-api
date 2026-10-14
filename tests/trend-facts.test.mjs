// Long-term facts for the coach (src/trend-facts.js), the Training text's
// readiness (A2) and the single food lookup (A9), from the 12 Oct 2026 review.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { trendFacts } from "../src/trend-facts.js";
import { coachContext } from "../src/coach-assistant.js";
import { screenText, screenFacts } from "../src/screen-texts.js";
import { lookupFoodWithAI } from "../src/food-ai.js";
import { buildFoodDraft, MAX_LOOKUPS } from "../src/food-chat.js";
import { withLang } from "../src/lang.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const DATE = "2026-10-12";
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
// 49 days: HRV 50 ms and resting HR 52 six weeks ago, 54 ms and 50 now.
const wellness = (source = "apple-health:sdnn") => Array.from({ length: 49 }, (_, i) => {
  const id = shift(DATE, i - 48), recent = id > shift(DATE, -7);
  return { id, hrv: recent ? 54 : 50, hrvSource: source, restingHR: recent ? 50 : 52 };
});
const intervals = Array.from({ length: 49 }, (_, i) => ({ id: shift(DATE, i - 48), ctl: 40 + i * 0.25, atl: 45 }));
// Seven nights: 6 h each the last three, 8 h before.
const sleep = Array.from({ length: 7 }, (_, i) => ({ date: shift(DATE, i - 6), durationMin: i >= 4 ? 360 : 480 }));

test("trend facts: HRV, resting HR, sleep debt, the streak under the need and CTL over six weeks", () => {
  const t = trendFacts({ date: DATE, wellness: wellness(), intervals, sessions: sleep, need: 480 });
  assert.deepEqual(t.hrvChange6w, { percent: 8, nowMs: 54, beforeMs: 50 });
  assert.deepEqual(t.restingHRChange6w, { bpm: -2, now: 50, before: 52 });
  assert.deepEqual(t.sleepDebt7d, { hours: 6, nights: 7, needMinutes: 480 });
  assert.deepEqual(t.nightsUnderNeed, { nights: 3, needMinutes: 480 });
  assert.deepEqual(t.ctlChange6w, { now: 52, before: 41.5, change: 10.5 });
});

test("a fact is left out when the data do not carry it", () => {
  // Two weeks of data: no six-week comparison; four nights: no weekly debt.
  const short = trendFacts({ date: DATE, wellness: wellness().slice(-14), intervals: intervals.slice(-14), sessions: sleep.slice(-4), need: 480 });
  assert.equal(short.hrvChange6w, undefined);
  assert.equal(short.restingHRChange6w, undefined);
  assert.equal(short.ctlChange6w, undefined);
  assert.equal(short.sleepDebt7d, undefined);
  assert.equal(short.nightsUnderNeed.nights, 3);
  // A new HRV source starts its own comparison (SDNN and RMSSD are different scales).
  const switched = wellness().map(r => (r.id > shift(DATE, -7) ? { ...r, hrvSource: "google-wearables" } : r));
  assert.equal(trendFacts({ date: DATE, wellness: switched }).hrvChange6w, undefined);
  // One short night is not a streak; nothing at all is null.
  assert.equal(trendFacts({ date: DATE, sessions: [{ date: DATE, durationMin: 360 }, { date: shift(DATE, -1), durationMin: 500 }], need: 480 }), null);
  assert.equal(trendFacts({ date: DATE }), null);
  assert.equal(trendFacts({ date: "nope" }), null);
});

test("the coach chat gets the trends with its own Czech and English instruction", async () => {
  const context = coachContext({ date: DATE, week: { days: [] }, gym: { history: [] }, fitness: { wellness: intervals }, health: { wellness: wellness(), sleep }, profile: { age: 40 } });
  assert.equal(context.trends.hrvChange6w.percent, 8);
  assert.equal(context.trends.sleepDebt7d.hours, 6);
  assert.equal(coachContext({ date: DATE, week: { days: [] }, gym: { history: [] } }).trends, undefined);
  const { coachInstructionsFor } = await import("../src/coach-assistant.js");
  assert.match(withLang("cs", () => coachInstructionsFor()), /trends obsahuje dlouhodobá fakta.*nejvýš jedno/);
  assert.match(withLang("en", () => coachInstructionsFor()), /trends holds long-term facts.*at most one/);
});

const training = extra => ({ week: 41, thisWeek: { done: 2, planned: 5, doneLoad: 180, plannedLoad: 420 }, form: { fitness: 60, fatigue: 70, form: -10, label: "budování" }, sessions: [], ...extra });

test("the Training text gets today's readiness, the trends and the zone rule in both languages", async () => {
  const readiness = { date: DATE, score: 32, zone: "red", parts: [{ key: "hrv", points: -20 }], flags: ["hrv_low"], missing: [], checkin: null };
  const trends = { hrvChange6w: { percent: 8, nowMs: 54, beforeMs: 50 } };
  const info = screenFacts("training", training({ readiness, coachTrends: trends }));
  assert.deepEqual(info.facts.readiness, { score: 32, zone: "red", parts: [{ key: "hrv", points: -20 }], flags: ["hrv_low"], checkin: null });
  assert.deepEqual(info.facts.trends, trends);
  // Nothing visible changes: the same chips and basis with or without them.
  assert.deepEqual(info.chips, screenFacts("training", training()).chips);
  assert.deepEqual(info.basis, screenFacts("training", training()).basis);
  // A new zone asks for a new text; trends alone do not.
  assert.notEqual(info.fingerprint, screenFacts("training", training()).fingerprint);
  assert.equal(info.fingerprint, screenFacts("training", training({ readiness })).fingerprint);
  assert.notEqual(info.fingerprint, screenFacts("training", training({ readiness: { ...readiness, zone: "yellow" } })).fingerprint);
  assert.equal(screenFacts("training", training()).facts.readiness, null);
  assert.equal(screenFacts("today", { readiness: { score: 70, zone: "green" }, coachTrends: trends }).facts.trends.hrvChange6w.percent, 8);

  const asked = [];
  const ask = async (_env, req) => { asked.push(req); return { text: JSON.stringify({ text: "Dnes jen lehce.", advice: "Volno nebo Z1." }) }; };
  const env = () => ({ DB: scopedDb(createD1(), 1), USER_ID: 1, USER_IS_OWNER: true, OPENAI_API_KEY: "test" });
  await screenText(env(), { screen: "training", load: async () => training({ readiness, coachTrends: trends }), ask });
  await withLang("en", () => screenText(env(), { screen: "training", load: async () => training({ readiness, coachTrends: trends }), ask }));
  await screenText(env(), { screen: "food", load: async () => ({ kcal: 0, target: 2600, macros: {}, meals: [] }), ask });
  const [cs, en, food] = asked;
  assert.match(cs.input, /"readiness":\{"score":32,"zone":"red"/);
  assert.match(cs.input, /"trends":\{"hrvChange6w"/);
  assert.match(cs.instructions, /red = jen volno nebo lehký trénink, yellow = žádná nová intenzita/);
  assert.match(cs.instructions, /trends jsou dlouhodobá fakta.*nejvýš jedno/);
  assert.match(en.instructions, /red = rest or an easy session only, yellow = no new intensity/);
  assert.match(en.instructions, /trends are long-term facts.*at most one/);
  assert.doesNotMatch(en.instructions, /[ěščřžýáíéůú]/, "the English prompt is its own text");
  assert.doesNotMatch(food.instructions, /readiness je|trends jsou/);
});

test("the coach-text route adds the readiness and trends in one place", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.equal(entry.match(/\bdayReadiness\(/g).length, 3, "the day review, the screen texts and the note after a workout");
  assert.match(entry, /async function coachTextExtras\(env,ctx,internalAuth,screen\)/);
  assert.match(entry, /coachTextExtras\(env,ctx,internalAuth,screen\)\.catch/);
});

function mockOpenAI(answers) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    return Response.json({ model: "m", usage: { input_tokens: 100, output_tokens: 20 }, output: [{ content: [{ type: "output_text", text: JSON.stringify(a), annotations: [{ type: "url_citation", url: "https://example.com/label", title: "Label" }] }] }] });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("a food is looked up in one call whose prompt gives the language order", async () => {
  const m = mockOpenAI([{ found: false }]);
  try {
    const r = await lookupFoodWithAI({ OPENAI_API_KEY: "test" }, { name: "Jogurt", language: "pl" });
    assert.equal(m.calls.length, 1);
    assert.equal(r.product, null);
    assert.deepEqual(m.calls[0].tools, [{ type: "web_search" }]);
    assert.match(m.calls[0].instructions, /nejdřív v jazyce pl, potom v jazyce en, a teprve když konkrétní výrobek nenajdeš, v jakémkoli jazyce/);
  } finally { m.restore(); }
  const e = mockOpenAI([{ found: false }]);
  try {
    await withLang("en", () => lookupFoodWithAI({ OPENAI_API_KEY: "test" }, { name: "Yoghurt", language: "en" }));
    assert.equal(e.calls.length, 1);
    assert.match(e.calls[0].instructions, /the language en first, and only when the specific product is not found there, any language/);
    assert.doesNotMatch(e.calls[0].instructions, /[ěščřžýáíéůú]/);
  } finally { e.restore(); }
});

test("a sentence looks up at most three unknown foods; the rest stay without values", async () => {
  const lookups = [];
  const names = ["a", "b", "c", "d", "e", "f"];
  const draft = await buildFoodDraft({ DB: {} }, "měl jsem hodně věcí", DATE, {
    parse: async () => ({ dayOffset: 0, items: names.map(name => ({ name, brand: "", grams: 100, basis: "g", meal: "", portion: "" })) }),
    saved: async (db, name) => (name === "b" ? [{ name: "B", nutrition_basis: "g", calories_100g: 100, protein_100g: 1, carbs_100g: 1, fat_100g: 1 }] : []),
    lookup: async (env, { name }) => { lookups.push(name); return { product: { name, nutrition_basis: "g", calories_100g: 50, protein_100g: 1, carbs_100g: 1, fat_100g: 1, source: "ai" } }; }
  });
  assert.equal(MAX_LOOKUPS, 3);
  assert.deepEqual(lookups, ["a", "c", "d"], "a saved food does not use up a lookup");
  assert.equal(draft.items.length, 6);
  assert.deepEqual(draft.items.map(i => Boolean(i.product)), [true, true, true, true, false, false]);
});

test("sleep debt is measured against the athlete's own sleep goal", async () => {
  const { trendFacts } = await import("../src/trend-facts.js");
  const sessions = Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.parse("2026-10-14T12:00:00Z") - i * 86400000).toISOString().slice(0, 10), durationMin: 420 }));
  assert.equal(trendFacts({ date: "2026-10-14", sessions, sleepGoal: 420 }).sleepDebt7d.hours, 0);
  assert.ok(trendFacts({ date: "2026-10-14", sessions })?.sleepDebt7d?.hours > 0);
});
