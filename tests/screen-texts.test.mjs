// The coach's AI sentence on the app's screens (src/screen-texts.js): asked
// once a day per screen, cached, written again when the day moved on, and the
// rule-based text without consent or when the AI fails.
import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withLang } from "../src/lang.js";
import { screenText, screenFacts, lateAdvice, checkedText, MAX_PER_DAY, SLOT_WAIT_MS, BACKGROUND_SLOT_WAIT_MS, FOREGROUND_WAIT_MS, markScreenTextsStale } from "../src/screen-texts.js";
import { bumpCacheVersion } from "../src/api-cache.js";

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
  // Nothing of the user's changed within 10 minutes: not even the data is loaded.
  const again = await screenText(env, { screen: "today", load, ask });
  assert.equal(asked, 1);
  assert.equal(loaded, 1);
  // Later the data is compared again; the same state is not asked again.
  await screenText(env, { screen: "today", load, ask, now: Date.now() + 2 * 3600000 });
  assert.equal(asked, 1);
  assert.equal(loaded, 2);
  assert.equal(again.text, first.text);
  assert.deepEqual(again.basis, first.basis);
  // Another screen has its own text.
  await screenText(env, { screen: "food", load: async () => ({ kcal: 0, target: 2600, macros: {}, meals: [] }), ask });
  assert.equal(asked, 2);
});

test("busy AI slots: the screen gives its own words at once and asks again next time", async () => {
  const env = owner();
  let asked = 0, seen = null, busy = true;
  const ask = async (_env, req) => { asked++; seen = req; if (busy) throw Object.assign(new Error("Other AI requests are still running."), { busy: true }); return { text: JSON.stringify({ text: "Spal jsi 6 h 40.", advice: "" }) }; };
  const first = await screenText(env, { screen: "today", load: async () => today(), ask });
  assert.equal(first.source, "rules");
  assert.equal(seen.slotWaitMs, SLOT_WAIT_MS);
  assert.ok(SLOT_WAIT_MS <= 5000);
  // Not marked as failed: the next opening asks the AI again.
  busy = false;
  const second = await screenText(env, { screen: "today", load: async () => today(), ask });
  assert.equal(asked, 2);
  assert.equal(second.source, "ai");
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

test("a red or sick morning never keeps 'stick to the plan', and new numbers write a new text", async () => {
  const { readinessSummary } = await import("../src/app-today.js");
  const summary = { headline: "Jak dnes začít", text: "Spánek 5 h.", recommendation: "Dnešní plán (VO2max 5×4) můžeš dodržet." };
  const red = withLang("cs", () => readinessSummary(summary, { zone: "red", flags: [] }, null, true));
  assert.equal(red.text, "Spánek 5 h.");
  assert.doesNotMatch(red.recommendation, /dodržet|VO2/);
  assert.match(withLang("cs", () => readinessSummary(summary, { zone: "green", flags: ["respiration_elevated"] }, null, true)).recommendation, /bez intenzity/);
  assert.equal(readinessSummary(summary, { zone: "green", flags: [] }, null, true), summary);
  // A red day whose training is already done: rest for the rest of the day, not "take a rest day".
  assert.match(withLang("cs", () => readinessSummary(summary, { zone: "red", flags: [] }, null, false, true)).recommendation, /trénink máš za sebou/);
  // The AI's text on a red day that still pushes the plan is not shown.
  const env = owner();
  const r = await screenText(env, { screen: "today", load: async () => today({ readiness: { score: 25, zone: "red", flags: [] } }), ask: reply("Klidně se drž plánu, VO2max zvládneš.", "Jeď intervaly.") });
  assert.equal(r.source, "rules");
  const ok = await screenText(owner(), { screen: "today", load: async () => today({ readiness: { score: 25, zone: "red", flags: [] } }), ask: reply("Připravenost 25, tělo potřebuje klid.", "Dnes jen procházka.") });
  assert.equal(ok.source, "ai");
  // Readiness 70 → 88 in the same zone is a new state.
  assert.notEqual(screenFacts("today", today({ readiness: { score: 70, zone: "green" } })).fingerprint, screenFacts("today", today({ readiness: { score: 88, zone: "green" } })).fingerprint);
  assert.equal(screenFacts("today", today({ readiness: { score: 70, zone: "green" } })).fingerprint, screenFacts("today", today({ readiness: { score: 71, zone: "green" } })).fingerprint);
});

test("Trénink knows a paused athlete: the status is in the facts and a new status asks for a new text", () => {
  const data = { week: 41, thisWeek: { done: 1, planned: 4 }, next: { date: "2026-10-16", title: "VO2max 5×4", sport: "ride" } };
  const active = screenFacts("training", data), sick = screenFacts("training", { ...data, athleteState: "sick" });
  assert.equal(active.facts.athleteState, null);
  assert.equal(sick.facts.athleteState, "sick");
  assert.notEqual(active.fingerprint, sick.fingerprint);
});

test("no AI sentence over a Today card that failed to load: its empty place is not 'nothing planned'", () => {
  assert.equal(screenFacts("today", today()).ready, true);
  assert.equal(screenFacts("today", today({ unavailable: ["training", "food"] })).ready, false);
  assert.equal(screenFacts("today", today({ unavailable: ["health"] })).ready, false);
  // The drinks or the weight are not in the sentence.
  assert.equal(screenFacts("today", today({ unavailable: ["fluids", "weight"] })).ready, true);
});

test("a change of the user's data loads the screen again at once; the same version waits 10 minutes", async () => {
  const env = owner();
  await env.DB.prepare("CREATE TABLE api_cache_versions (user_id INTEGER PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, food INTEGER NOT NULL DEFAULT 0)").run();
  let loaded = 0;
  const load = async () => { loaded++; return today(); };
  const start = Date.now();
  await screenText(env, { screen: "today", load, ask: reply("Spal jsi 6 h 40.", ""), now: start });
  await screenText(env, { screen: "today", load, ask: reply("x", ""), now: start + 9 * 60000 });
  assert.equal(loaded, 1);
  await bumpCacheVersion(env.DB);
  await screenText(env, { screen: "today", load, ask: reply("x", ""), now: start + 9 * 60000 + 1 });
  assert.equal(loaded, 2, "a new version compares at once");
  // That comparison counts as a check: the next opening skips the loading again.
  await screenText(env, { screen: "today", load, ask: reply("x", ""), now: start + 10 * 60000 });
  assert.equal(loaded, 2);
});

test("background data: the last text at once and the new one written after the answer, once", async () => {
  const env = owner();
  let asked = 0, sleep = 400, seen = null;
  const ask = async (_env, req) => { asked++; seen = req; return { text: JSON.stringify({ text: "Text " + asked, advice: "" }) }; };
  const load = async () => today({ sleep: { minutes: sleep, need: 450, index: 74 } });
  const work = [];
  const later = p => work.push(p);
  const start = Date.now();
  assert.equal((await screenText(env, { screen: "today", load, ask, later, now: start })).text, "Text 1", "the day's first text is waited for");
  assert.equal(work.length, 0);
  sleep = 470;
  const shown = await screenText(env, { screen: "today", load, ask, later, now: start + 11 * 60000 });
  assert.equal(shown.text, "Text 1", "the last text shows at once");
  // Opened again before the background write ends: it is not asked twice.
  await screenText(env, { screen: "today", load, ask, later, now: start + 12 * 60000 });
  assert.equal(work.length, 1);
  await Promise.all(work);
  assert.equal(asked, 2);
  assert.equal(seen.slotWaitMs, BACKGROUND_SLOT_WAIT_MS);
  assert.ok(BACKGROUND_SLOT_WAIT_MS + seen.timeoutMs <= 25000, "within the 30 s after the answer");
  assert.equal((await screenText(env, { screen: "today", load, ask, later, now: start + 23 * 60000 })).text, "Text 2");
});

test("busy slots in the background let the claim go; the user's own change and a red day wait for the new text", async () => {
  const env = owner();
  let asked = 0, busy = false, sleep = 400, plan = today().plan, zone = "yellow";
  const ask = async () => { asked++; if (busy) throw Object.assign(new Error("busy"), { busy: true }); return { text: JSON.stringify({ text: "Text " + asked, advice: "" }) }; };
  const load = async () => today({ sleep: { minutes: sleep, need: 450, index: 74 }, plan, readiness: { score: 71, zone } });
  const work = [];
  const later = p => work.push(p);
  const start = Date.now();
  await screenText(env, { screen: "today", load, ask, later, now: start });
  busy = true; sleep = 470;
  await screenText(env, { screen: "today", load, ask, later, now: start + 11 * 60000 });
  await Promise.all(work.splice(0));
  busy = false;
  await screenText(env, { screen: "today", load, ask, later, now: start + 12 * 60000 });
  assert.equal(work.length, 1, "the next opening claims it again");
  await Promise.all(work.splice(0));
  assert.equal(asked, 3);
  // The user's own change: waited for.
  plan = [];
  await markScreenTextsStale(env);
  assert.equal((await screenText(env, { screen: "today", load, ask, later, now: start + 13 * 60000 })).text, "Text 4");
  // A red morning: waited for, so a text written for yesterday's plan never shows.
  zone = "red";
  assert.equal((await screenText(env, { screen: "today", load, ask, later, now: start + 30 * 60000 })).text, "Text 5");
  assert.equal(work.length, 0);
});

test("a background text never lands over the user's own change, and a stale mark of the same state is let go", async () => {
  const env = owner();
  let asked = 0, sleep = 400, open = () => {};
  const gate = new Promise(resolve => { open = resolve; });
  const ask = async () => { const n = ++asked; if (n === 2) await gate; return { text: JSON.stringify({ text: "Text " + n, advice: "" }) }; };
  const load = async () => today({ sleep: { minutes: sleep, need: 450, index: 74 } });
  const work = [];
  const later = p => work.push(p);
  const start = Date.now();
  await screenText(env, { screen: "today", load, ask, later, now: start });
  sleep = 470;
  await screenText(env, { screen: "today", load, ask, later, now: start + 11 * 60000 });
  assert.equal(work.length, 1);
  // Meanwhile the user's own change marks the text stale; the background write then keeps out.
  await markScreenTextsStale(env);
  open();
  await Promise.all(work.splice(0));
  assert.equal(asked, 2);
  const after = await screenText(env, { screen: "today", load, ask, later, now: start + 12 * 60000 });
  assert.equal(after.text, "Text 3", "the user's change is written at once");
  // The same state after a stale mark: no AI call, the mark is let go and the next opening skips loading.
  await markScreenTextsStale(env);
  let loaded = 0;
  const counted = async () => { loaded++; return load(); };
  assert.equal((await screenText(env, { screen: "today", load: counted, ask, later, now: start + 13 * 60000 })).text, "Text 3");
  await screenText(env, { screen: "today", load: counted, ask, later, now: start + 14 * 60000 });
  assert.equal(loaded, 1);
  assert.equal(asked, 3);
});

test("the night arriving or a new readiness zone is waited for, not left for the next opening", async () => {
  const env = owner();
  let asked = 0, zone = "green";
  const ask = async () => { asked++; return { text: JSON.stringify({ text: "Text " + asked, advice: "" }) }; };
  const load = async () => today({ readiness: { score: 80, zone } });
  const work = [];
  const start = Date.now();
  await screenText(env, { screen: "today", load, ask, later: p => work.push(p), now: start });
  zone = "yellow";
  assert.equal((await screenText(env, { screen: "today", load, ask, later: p => work.push(p), now: start + 11 * 60000 })).text, "Text 2");
  assert.equal(work.length, 0);
});

test("without Aurin Pro once the paywall is on: marked pro, no data read and no AI call (Today audit 40)", async () => {
  const never = async () => { throw new Error("must not be called"); };
  const env = { ...owner(), AI_PAYWALL_ENABLED: "owner" };
  const locked = await screenText(env, { screen: "today", load: never, ask: never });
  assert.deepEqual([locked.source, locked.reason, locked.text], ["rules", "pro", null]);
  // With Pro the AI writes as before.
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS subscriptions (user_id INTEGER PRIMARY KEY,plan TEXT NOT NULL DEFAULT 'free',valid_until TEXT)").run();
  await env.DB.prepare("INSERT INTO subscriptions (user_id, plan, valid_until) VALUES (1, 'ai', ?)").bind(new Date(Date.now() + 86400000).toISOString()).run();
  const pro = await screenText(env, { screen: "today", load: async () => today(), ask: reply("Spánek je kratší.", "Jeď lehce.") });
  assert.equal(pro.source, "ai");
});

test("late in the evening Today's sentence knows the hour and is written again at once (Petr 2026-11-10, 23:49)", async () => {
  const day = screenFacts("today", today());
  assert.equal(day.facts.now, undefined, "without the route's clock no hour");
  const evening = screenFacts("today", today({ clock: "21:40" }));
  assert.equal(evening.facts.now, "21:40");
  assert.equal(evening.facts.evening, "wind-down");
  const late = screenFacts("today", today({ clock: "23:49" }));
  assert.equal(late.facts.evening, "bed");
  assert.notEqual(late.fingerprint, evening.fingerprint);
  assert.equal(screenFacts("today", today({ clock: "15:00" })).fingerprint, day.fingerprint, "earlier in the day the fingerprint stays as it was");
  // Past bedtime the new text is written for this opening, not left for the next one.
  const env = owner();
  let asked = 0, clock = "18:00";
  const ask = async () => { asked++; return { text: JSON.stringify({ text: "Text " + asked, advice: asked === 1 ? "Take an evening walk." : "Go for an evening walk and stretch." }) }; };
  const load = async () => today({ clock });
  const work = [];
  const start = Date.now();
  const first = await screenText(env, { screen: "today", load, ask, later: p => work.push(p), now: start });
  assert.equal(first.advice, "Take an evening walk.");
  clock = "23:49";
  const again = await screenText(env, { screen: "today", load, ask, later: p => work.push(p), now: start + 11 * 60000 });
  assert.equal(again.text, "Text 2");
  assert.equal(work.length, 0);
  assert.equal(again.advice, "Je pozdě, jdi teď spát.", "the walk gives way to bed");
});

test("late advice: a walk or training gives way, bed and winding down stay", () => {
  assert.equal(lateAdvice({}, "Take an evening walk."), "Take an evening walk.");
  assert.equal(lateAdvice({ evening: "wind-down" }, "Dim the lights and read for 10 minutes."), "Dim the lights and read for 10 minutes.");
  assert.equal(withLang("en", () => lateAdvice({ evening: "wind-down" }, "A 30 min walk, then stretching.")), "Just wind down: 5–10 minutes of easy stretching, then bed.");
  assert.equal(lateAdvice({ evening: "bed" }, "Go to bed now."), "Go to bed now.");
  assert.equal(withLang("en", () => lateAdvice({ evening: "bed" }, "Aim for protein and carbs.")), "It's late, so go to bed now.");
  assert.equal(lateAdvice({ evening: "bed" }, "Jdi spát, procházka počká na zítra."), "Jdi spát, procházka počká na zítra.");
  assert.equal(lateAdvice({ evening: "bed" }, "Jdi spát, zítra ráno procházka."), "Je pozdě, jdi teď spát.");
  // Found in review: a bedtime already gone as the target, food, a swim or a short walk before bed.
  const bed = { evening: "bed", bedtimeTonight: "21:10" };
  for (const advice of ["Get to sleep by 21:10.", "Jdi spát ve 21:10.", "A protein snack before sleep.", "Projdi se 10 minut a pak do postele.", "Zaplavej si.", "A short swim, then bed."]) assert.equal(lateAdvice(bed, advice), "Je pozdě, jdi teď spát.", advice);
  assert.equal(lateAdvice(bed, "Your 21:10 bedtime has passed, go to bed now."), "Your 21:10 bedtime has passed, go to bed now.");
  // Eval run 60, S67: good wind-down advice stays, a move that is ruled out is no move.
  const wind = { evening: "wind-down" };
  for (const advice of ["Už netrénuj; dej si 5–10 minut lehkého protažení a pak běž spát.", "Trénink už vynech; dej si 5–10 minut klidného protažení a pak do postele.", "Skip the walk tonight, just stretch and go to bed."]) assert.equal(lateAdvice(wind, advice), advice, advice);
  assert.equal(lateAdvice(wind, "Trénink už vynech, ale dej si 30 min procházku."), "Už jen zklidni: 5–10 minut lehkého protažení a do postele.");
  assert.equal(lateAdvice(bed, "Skip the walk and go to bed now."), "Skip the walk and go to bed now.");
  assert.equal(lateAdvice(bed, "Žádný běh, odpočiň si a jdi spát."), "Žádný běh, odpočiň si a jdi spát.");
  // Eval run 61, S67: two words between the move and the verb that rules it out.
  for (const advice of ["Trénink už dnes vynech a dej si 5–10 minut lehkého protažení, pak do postele.", "Trénink už dnes nezačínej; dej si 5–10 minut klidného protažení a pak do postele."]) assert.equal(lateAdvice(wind, advice), advice, advice);
  for (const advice of ["Trénink dnes už nezačínej, ale projdi se 30 minut.", "Procházku nedělej delší než 10 minut.", "Běh nedělej rychle."]) assert.equal(lateAdvice(wind, advice), "Už jen zklidni: 5–10 minut lehkého protažení a do postele.", advice);
  assert.equal(lateAdvice(wind, "Trénink už dnes radši nezačínej a jdi spát."), "Trénink už dnes radši nezačínej a jdi spát.");
  // Review: a negation of something else keeps the walk out, and the chat's easy spin is a move too.
  for (const advice of ["Don't skip the walk tonight.", "No need to skip the walk, 20 min easy.", "Walk 10 min without your phone, then bed.", "Odlož mobil a projdi se 10 minut.", "Nevynechávej večerní procházku.", "Teď už nejdřív krátká procházka, pak spát.", "Dej si 20 minut lehkého šlapání.", "Projeď se 20 minut.", "Zaběhni si 15 minut."]) assert.equal(lateAdvice(wind, advice), "Už jen zklidni: 5–10 minut lehkého protažení a do postele.", advice);
  // The text itself never aims at a bedtime that has passed: it is not shown.
  assert.throws(() => checkedText(bed, JSON.stringify({ text: "Skip extra training and aim for your 21:10 bedtime.", advice: "Go to bed now." })), /late/);
  assert.equal(checkedText(bed, JSON.stringify({ text: "Your 21:10 bedtime is gone.", advice: "Go to bed now." })).text, "Your 21:10 bedtime is gone.");
});

test("late evening: a day of many texts still gets the late one, and a kept text loses its walk", async () => {
  const env = owner();
  const date = new Date().toISOString().slice(0, 10), start = Date.parse(date + "T18:30:00Z");
  let asked = 0, fail = false, clock = "18:00";
  const ask = async () => { if (fail) throw new Error("down"); asked++; return { text: JSON.stringify({ text: "Text " + asked, advice: "Take an evening walk." }) }; };
  const load = async () => today({ clock });
  await screenText(env, { screen: "today", load, ask, now: start });
  await env.DB.prepare("UPDATE ai_screen_texts SET generations=? WHERE user_id=?").bind(MAX_PER_DAY, 1).run();
  clock = "23:49";
  const late = await screenText(env, { screen: "today", load, ask, now: start + 11 * 60000 });
  assert.equal(late.text, "Text 2", "the late phase is written past the day's cap");
  assert.equal(late.advice, "Je pozdě, jdi teď spát.");
  await screenText(env, { screen: "today", load, ask, now: start + 40 * 60000 });
  assert.equal(asked, 2, "once per phase");
  // A failed write keeps the earlier text, without its walk.
  const env2 = owner();
  clock = "18:00"; fail = false;
  await screenText(env2, { screen: "today", load, ask, now: start });
  clock = "23:49"; fail = true;
  const kept = await screenText(env2, { screen: "today", load, ask, now: start + 11 * 60000 });
  assert.equal(kept.text, "Text 3");
  assert.equal(kept.advice, "Je pozdě, jdi teď spát.");
});

test("a slow AI is not waited for: the rule-based text at once, the new text written after the answer, asked once (report 2026-11-12)", async () => {
  const env = owner();
  let asked = 0, open = () => {}, seen = null;
  const gate = new Promise(resolve => { open = resolve; });
  const ask = async (_env, req) => { asked++; seen = req; await gate; return { text: JSON.stringify({ text: "Pomalý text", advice: "" }) }; };
  const load = async () => today();
  const work = [];
  const later = p => work.push(p);
  const start = Date.now();
  const t0 = Date.now();
  const first = await screenText(env, { screen: "today", load, ask, later, now: start });
  assert.ok(Date.now() - t0 < FOREGROUND_WAIT_MS + 1000, "answered after the short wait");
  assert.equal(first.source, "rules");
  assert.equal(first.text, "Regenerace je střední.");
  assert.equal(first.writing, true, "the app asks again a moment later");
  assert.equal(work.length, 1);
  assert.ok(seen.timeoutMs && BACKGROUND_SLOT_WAIT_MS + seen.timeoutMs <= 25000, "fits the 30 s after the answer");
  // Opened again while it is written: no second AI call.
  const again = await screenText(env, { screen: "today", load, ask, later, now: start + 30000 });
  assert.equal(again.writing, true);
  assert.equal(asked, 1);
  open();
  await Promise.all(work.splice(0));
  const done = await screenText(env, { screen: "today", load, ask, later, now: start + 60000 });
  assert.equal(done.source, "ai");
  assert.equal(done.text, "Pomalý text");
  assert.equal(done.writing, undefined);
  assert.equal(asked, 1);
});
