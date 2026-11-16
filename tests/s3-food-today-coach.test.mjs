import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { numbersLine, numbersLineText, NUMBERS_LINE_KEYS } from "../src/day-verdict.js";
import { strainTarget } from "../src/app-today.js";
import { buildFoodHistory, saveNutritionDay, loadFoodHistory, nutritionDayOf } from "../src/nutrition-days.js";
import { carbsPerHour, fuelPlan } from "../src/workout-explanation.js";
import { weeklyGoalKg, heavyTrainingCap } from "../src/energy-profile.js";
import { HYDRATION_FACTORS, hydrationMl } from "../src/fluids.js";
import { proBannerState, closeProBanner, ensureProBanner } from "../src/pro-banner.js";
import { freeRepliesOf, claimFreeReply, nearAt } from "../src/coach-allowance.js";
import { confirmableToday, confirmationOnly } from "../src/coach-chat-confirm.js";
import { saveCoachQuestion, takeChipAnswer, questionChips } from "../src/coach-questions.js";
import { appendChatTurnIds } from "../src/assistant-chats.js";
import { planAroundCard } from "../src/coach-actions.js";
import { updateAthleteState, getAthleteState, pausedSports } from "../src/athlete-state.js";

test("the numbers line: one key per day, paused on rest, signs before the zone", () => {
  assert.equal(numbersLine({}), null);
  assert.equal(numbersLine({ zone: "green" }), "hard");
  assert.equal(numbersLine({ zone: "yellow" }), "steady");
  assert.equal(numbersLine({ zone: "red" }), "easy");
  assert.equal(numbersLine({ zone: "green", rest: true }), "paused");
  assert.equal(numbersLine({ zone: "green", missing: ["sleep"] }), "usual");
  for (const key of NUMBERS_LINE_KEYS) assert.ok(numbersLineText(key), key);
});

test("the strain target keeps its range and adds the middle", () => {
  const t = strainTarget({ zone: "green", planned: 12 });
  if (t) assert.equal(t.mid, Math.round((t.low + t.high) / 2 * 10) / 10);
});

test("the food history: frozen targets, over only above the target, average over logged days", () => {
  const h = buildFoodHistory({ today: "2026-11-16", days: 30,
    stored: [{ date: "2026-11-15", target_kcal: 2400 }, { date: "2026-11-16", target_kcal: 2500 }],
    eaten: [{ date: "2026-11-15", kcal: 2600, entries: 3 }, { date: "2026-11-16", kcal: 2000, entries: 2 }, { date: "2026-11-01", kcal: 1800, entries: 1 }] });
  assert.equal(h.list.length, 30);
  assert.equal(h.from, "2026-10-18");
  assert.equal(h.daysLogged, 3);
  assert.equal(h.average.kcal, 2133);
  assert.equal(h.targetsFrom, "2026-11-15");
  const day = d => h.list.find(x => x.date === d);
  assert.equal(day("2026-11-15").over, true);
  assert.equal(day("2026-11-16").over, false);
  assert.equal(day("2026-11-01").over, null, "no target before the table");
  assert.equal(day("2026-11-02").logged, false);
  assert.equal(buildFoodHistory({ today: "2026-11-16", days: 7 }).days, 30, "only the offered spans");
});

test("a day's targets are kept only while it is today; a day gone by keeps the one it had", async () => {
  const db = scopedDb(createD1(), 1);
  const food = (date, kcal, target) => nutritionDayOf({ date, kcal, target, macros: { protein: { eaten: 100, target: 150 } }, meals: [{ entries: [1] }] });
  await saveNutritionDay(db, food("2026-11-15", 1800, 2400), "2026-11-15");
  await saveNutritionDay(db, food("2026-11-15", 2100, 3000), "2026-11-16");
  await saveNutritionDay(db, food("2026-11-14", 1500, 2900), "2026-11-16");
  const { stored, eaten } = await loadFoodHistory(db, "2026-11-01", "2026-11-16");
  assert.deepEqual(stored.map(r => [r.date, r.target_kcal]), [["2026-11-14", null], ["2026-11-15", 2400]]);
  assert.deepEqual(eaten, [], "eaten comes from the food log");
  // Nothing changed: no write.
  const before = (await db.prepare("SELECT updated_at FROM nutrition_days WHERE user_id = 1 AND date='2026-11-15'").first()).updated_at;
  await db.prepare("UPDATE nutrition_days SET updated_at='2000-01-01 00:00:00' WHERE user_id = 1 AND date='2026-11-15'").run();
  await saveNutritionDay(db, food("2026-11-15", 2100, 3000), "2026-11-16");
  assert.equal((await db.prepare("SELECT updated_at FROM nutrition_days WHERE user_id = 1 AND date='2026-11-15'").first()).updated_at, "2000-01-01 00:00:00");
  assert.ok(before);
});

test("carbs per hour: 60/75/90 by experience, up to 120 only on an experienced rider's ride over 3 h", () => {
  const free = carbsPerHour(240, "endurance", "ride");
  assert.ok(carbsPerHour(240, "endurance", "ride", "beginner") <= 60);
  assert.ok(carbsPerHour(240, "endurance", "ride", "regular") <= 75);
  assert.ok(carbsPerHour(240, "endurance", "ride", "experienced") <= 90);
  assert.equal(carbsPerHour(240, "endurance", "ride", null), free, "no experience, the table as before");
  assert.equal(fuelPlan(240, "endurance", "ride", "experienced").upTo, 120);
  assert.ok(fuelPlan(240, "endurance", "ride", "experienced").practise);
  assert.equal(fuelPlan(170, "endurance", "ride", "experienced").upTo, undefined);
  assert.equal(fuelPlan(240, "endurance", "ride", "regular").upTo, undefined);
  assert.equal(fuelPlan(240, "endurance", "run", "experienced")?.upTo, undefined);
  assert.equal(fuelPlan(60, "endurance", "swim"), null);
});

test("heavy training (10 h a week) loses at most 0.5 % of weight a week", () => {
  const light = weeklyGoalKg("lose", 80, 180, 5), heavy = weeklyGoalKg("lose", 80, 180, 12);
  assert.ok(heavy >= -0.4 - 1e-9, String(heavy));
  assert.ok(heavy >= light);
  assert.equal(heavyTrainingCap("lose", 80, 180, 5), false);
  assert.equal(heavyTrainingCap("maintain", 80, 180, 12), false);
});

test("beer counts 0 towards drinking", () => {
  assert.equal(HYDRATION_FACTORS.beer, 0);
  assert.equal(hydrationMl(500, "beer"), 0);
});

test("the Pro banner: back in 7 days, after 3 closes once in 30, never with Pro", () => {
  const day = 864e5, now = Date.parse("2026-11-16T10:00:00Z"), at = ms => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
  assert.deepEqual(proBannerState({ now }), { show: true, offer: "trial", closes: 0, nextAt: null });
  assert.equal(proBannerState({ pro: true, now }).show, false);
  assert.equal(proBannerState({ paywall: false, now }).show, false);
  assert.equal(proBannerState({ closes: 1, closedAt: at(now - 6 * day), now }).show, false);
  assert.equal(proBannerState({ closes: 2, closedAt: at(now - 7 * day), now }).show, true);
  assert.equal(proBannerState({ closes: 3, closedAt: at(now - 20 * day), now }).show, false);
  assert.equal(proBannerState({ closes: 3, closedAt: at(now - 30 * day), now }).show, true);
  assert.equal(proBannerState({ purchased: true, now }).offer, "get");
});

test("closing the banner counts each close", async () => {
  const db = scopedDb(createD1(), 1);
  await closeProBanner(db); await closeProBanner(db);
  await ensureProBanner(db);
  assert.equal((await db.prepare("SELECT closes FROM pro_banner WHERE user_id = 1").first()).closes, 2);
});

test("chip answers and confirmations are free up to half the weekly limit, then they count", async () => {
  assert.equal(freeRepliesOf(30), 15);
  assert.equal(nearAt(15), 4, "the counter shows from 4 left of the trial's 15");
  const env = { DB: createD1(), USER_ID: 7, COACH_WEEKLY_MESSAGES: "4" };
  const kinds = [];
  for (let i = 0; i < 3; i++) kinds.push((await claimFreeReply(env, 1, "confirm", { today: "2026-11-16" }))?.free === true);
  assert.deepEqual(kinds, [true, true, false]);
  const counted = env.DB.sqlite.prepare("SELECT SUM(counted) AS n FROM coach_messages WHERE user_id = 7").get().n;
  assert.equal(counted, 1);
});

test("a typed yes confirms only today's change", () => {
  const today = "2026-11-16";
  assert.equal(confirmableToday({ type: "gym_swap", date: today }, today), true);
  assert.equal(confirmableToday({ type: "gym_swap", date: "2026-11-17" }, today), false);
  assert.equal(confirmableToday({ type: "week_sport", date: today }, today), false);
  assert.equal(confirmableToday({ type: "rest", date: today }, today), false);
  assert.equal(confirmationOnly("Potvrzuji."), true);
  assert.equal(confirmationOnly("Potvrzuju a přidej bicepsy"), false);
  assert.equal(confirmationOnly("Proč?"), false);
});

test("a chip is a free answer once, only on the chat's last coach message and only its own chip", async () => {
  const db = scopedDb(createD1(), 1);
  const turn = await appendChatTurnIds(db, null, "Ahoj", "Jak ses měl o pauze?");
  const qid = await saveCoachQuestion(db, { chatId: turn.chatId, messageId: turn.messageId, chips: ["All good", "Rest", "Sick", "Injured"] });
  assert.ok(qid);
  assert.deepEqual(await questionChips(db, turn.chatId, turn.messageId), ["All good", "Rest", "Sick", "Injured"]);
  assert.equal(await takeChipAnswer(db, turn.chatId, { messageId: turn.messageId, chip: "Maybe" }, "Maybe"), false);
  assert.equal(await takeChipAnswer(db, turn.chatId, { messageId: turn.messageId, chip: "Rest" }, "Something else"), false);
  assert.equal(await takeChipAnswer(db, turn.chatId, { messageId: turn.messageId, chip: "Rest" }, "Rest"), true);
  assert.equal(await takeChipAnswer(db, turn.chatId, { messageId: turn.messageId, chip: "Rest" }, "Rest"), false, "one answer per question");
  assert.equal(await takeChipAnswer(scopedDb(createD1(), 1), 1, { messageId: 1, chip: "Rest" }, "Rest"), false, "no table, no free answer");
});

test("pain in one spot asks to plan around it; injured stays manual", async () => {
  const knee = "Bolí mě levé koleno";
  const card = planAroundCard([{ text: knee }], { date: "2026-11-16" });
  assert.equal(card.type, "plan_around");
  assert.ok(card.sports.length);
  assert.equal(planAroundCard([{ text: "Chci víc spát" }]), null);
  assert.equal(planAroundCard([{ text: knee }], { paused: card.sports }), null, "not again once paused");
  const db = scopedDb(createD1(), 1);
  await updateAthleteState(db, { memory: knee }, { date: "2026-11-16" });
  await updateAthleteState(db, { planAround: { memory: knee, sports: ["run"] } }, { date: "2026-11-16" });
  const state = await getAthleteState(db, { date: "2026-11-16" });
  assert.deepEqual(pausedSports(state), ["run"]);
  assert.notEqual(state.status, "injured");
  assert.deepEqual(pausedSports({ ...state, memoryOff: true }), []);
  await updateAthleteState(db, { forget: knee }, { date: "2026-11-16" });
  assert.deepEqual(pausedSports(await getAthleteState(db, { date: "2026-11-16" })), [], "the pause ends with the memory");
});
