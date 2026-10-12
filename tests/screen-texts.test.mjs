// The coach's AI sentence on the app's screens (src/screen-texts.js): asked
// once a day per screen, cached, written again when the day moved on, and the
// rule-based text without consent or when the AI fails.
import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withLang } from "../src/lang.js";
import { screenText, screenFacts, MAX_PER_DAY, markScreenTextsStale } from "../src/screen-texts.js";

const today = (extra = {}) => ({
  date: "2026-10-11",
  readiness: { score: 71, zone: "yellow" },
  sleep: { minutes: 400, need: 450, index: 74 },
  hrv: { value: 52, baseline: 58, low: 54, high: 64, trend: "down" },
  restingHR: { value: 49, baseline: 47.5 },
  strain: { score: 2.1, planned: 11.4 },
  summary: { text: "Regenerace je střední.", recommendation: "Drž dnešní jízdu lehce." },
  nutrition: { kcal: 600, target: 2600 },
  plan: [{ kind: "workout", title: "Endurance", detail: "60 min", done: false }, { kind: "bedtime", title: "Do postele", time: "22:10", done: false }],
  tonight: { bedtime: "22:10" },
  ...extra
});

const owner = () => ({ DB: scopedDb(createD1(), 1), USER_ID: 1, USER_IS_OWNER: true, OPENAI_API_KEY: "test" });
const reply = (text, advice) => async () => ({ text: JSON.stringify({ text, advice }) });

test("facts, chips and the data shown under Proč? come from the screen's numbers", () => {
  const t = screenFacts("today", today());
  assert.deepEqual(t.chips, ["Spánek 6:40", "HRV 52 ↓", "Tep 49"]);
  assert.deepEqual(t.basis.find(b => b.label === "Spánek"), { label: "Spánek", value: "6:40 z potřebných 7:30" });
  assert.deepEqual(t.fallback, { text: "Regenerace je střední.", advice: "Drž dnešní jízdu lehce." });
  assert.equal(t.facts.plan.length, 1, "bedtime is not a session");
  const food = screenFacts("food", { kcal: 1660, target: 2600, sentence: "Zbývá 940 kcal.", macros: { protein: { eaten: 92, target: 165 }, carbs: { eaten: 180, target: 210 }, fat: { eaten: 40, target: 80 } }, meals: [] });
  assert.deepEqual(food.chips, ["Bílkoviny 92/165 g", "Sacharidy 180/210 g"]);
  const training = screenFacts("training", { week: 41, thisWeek: { done: 3, planned: 5, doneLoad: 240, plannedLoad: 420 }, form: { fitness: 60, fatigue: 78, form: -18, label: "budování", text: "Únava je nad kondicí." }, sessions: [] });
  assert.deepEqual(training.chips, ["Týden 3/5", "240 TSS", "Forma −18"]);
  assert.equal(withLang("en", () => screenFacts("today", today()).chips[0]), "Sleep 6:40");
});

test("the AI is asked once per day state; the same state answers from the cache", async () => {
  const env = owner();
  let asked = 0, loaded = 0, seen = null;
  const ask = async (_env, req) => { asked++; seen = req; return { text: JSON.stringify({ text: "Spal jsi 6 h 40, o 50 minut méně než potřebuješ.", advice: "Drž tep pod 135." }) }; };
  const load = async () => { loaded++; return today(); };
  const first = await screenText(env, { screen: "today", load, ask });
  assert.equal(first.source, "ai");
  assert.equal(first.text, "Spal jsi 6 h 40, o 50 minut méně než potřebuješ.");
  assert.equal(first.advice, "Drž tep pod 135.");
  assert.deepEqual(first.chips, ["Spánek 6:40", "HRV 52 ↓", "Tep 49"]);
  assert.match(first.time, /^\d{2}:\d{2}$/);
  assert.equal(seen.feature, "screen-text");
  assert.match(seen.input, /"sleepMinutes":400/);
  // Every opening loads the data to compare; the same state is not asked again.
  const again = await screenText(env, { screen: "today", load, ask });
  assert.equal(asked, 1);
  assert.equal(loaded, 2);
  await screenText(env, { screen: "today", load, ask, now: Date.now() + 2 * 3600000 });
  assert.equal(asked, 1);
  assert.equal(loaded, 3);
  assert.equal(again.text, first.text);
  assert.deepEqual(again.basis, first.basis);
  // Another screen has its own text.
  await screenText(env, { screen: "food", load: async () => ({ kcal: 0, target: 2600, macros: {}, meals: [] }), ask });
  assert.equal(asked, 2);
});

test("a new day state asks again, at most a few times a day", async () => {
  const env = owner();
  let asked = 0, done = 0;
  const ask = async () => { asked++; return { text: JSON.stringify({ text: "Text " + asked, advice: "" }) }; };
  const load = async () => today({ plan: Array.from({ length: done }, (_, i) => ({ kind: "workout", title: "S" + i, done: true })) });
  const start = Date.now();
  for (let i = 0; i < MAX_PER_DAY + 2; i++) { done = i; await screenText(env, { screen: "today", load, ask, now: start + i * 2 * 3600000 }); }
  assert.equal(asked, MAX_PER_DAY);
  const last = await screenText(env, { screen: "today", load, ask, now: start + 20 * 3600000 });
  assert.equal(last.text, "Text " + MAX_PER_DAY);
  assert.equal(last.advice, null);
});

test("without AI consent, a key or the night's data: the rule-based text, no AI call", async () => {
  const never = async () => { throw new Error("must not be called"); };
  const noConsent = { DB: scopedDb(createD1(), 2), USER_ID: 2, OPENAI_API_KEY: "test" };
  assert.deepEqual(await screenText(noConsent, { screen: "today", load: async () => today(), ask: never }).then(r => [r.source, r.reason]), ["rules", "consent"]);
  const noKey = { ...owner(), OPENAI_API_KEY: "" };
  assert.equal((await screenText(noKey, { screen: "today", load: async () => today(), ask: never })).reason, "unavailable");
  const early = await screenText(owner(), { screen: "today", load: async () => today({ sleep: null, readiness: { score: null } }), ask: never });
  assert.equal(early.source, "rules");
  assert.equal(early.text, "Regenerace je střední.");
  await assert.rejects(screenText(owner(), { screen: "health", load: async () => ({}), ask: never }));
});

test("a failed AI call falls back and is not repeated for an hour", async () => {
  const env = owner();
  let asked = 0;
  const failing = async () => { asked++; const e = new Error("limit"); e.ai = true; e.limit = true; throw e; };
  const now = Date.parse("2026-10-11T08:00:00Z");
  const r = await screenText(env, { screen: "today", load: async () => today(), ask: failing, now });
  assert.equal(r.source, "rules");
  assert.equal(r.advice, "Drž dnešní jízdu lehce.");
  assert.ok(r.basis.length > 0);
  await screenText(env, { screen: "today", load: async () => today(), ask: failing, now: now + 10 * 60000 });
  assert.equal(asked, 1);
  const later = await screenText(env, { screen: "today", load: async () => today(), ask: reply("Teď už AI.", "Jeď lehce."), now: now + 61 * 60000 });
  assert.equal(later.source, "ai");
  assert.equal(later.text, "Teď už AI.");
});

test("an English app gets its own cached text", async () => {
  const env = owner();
  const cs = await screenText(env, { screen: "today", load: async () => today(), ask: reply("Česky.", "Rada.") });
  const en = await withLang("en", () => screenText(env, { screen: "today", load: async () => today(), ask: reply("In English.", "Advice.") }));
  assert.equal(cs.text, "Česky.");
  assert.equal(en.text, "In English.");
  assert.equal(en.chips[0], "Sleep 6:40");
});

test("a cancelled session writes the text again at once, even right after the last one", async () => {
  const env = owner();
  let asked = 0, plan = [{ kind: "workout", title: "Posilovna", done: false }];
  const ask = async () => { asked++; return { text: JSON.stringify({ text: asked === 1 ? "V posilovně uber sérii." : "Dnes volno, jdi se projít.", advice: "" }) }; };
  const load = async () => today({ plan });
  await screenText(env, { screen: "today", load, ask });
  plan = [];
  await markScreenTextsStale(env);
  const next = await screenText(env, { screen: "today", load, ask });
  assert.equal(asked, 2);
  assert.equal(next.text, "Dnes volno, jdi se projít.");
  assert.notEqual(screenFacts("today", today({ plan: [] })).fingerprint, screenFacts("today", today()).fingerprint, "the plan is in the fingerprint");
});
