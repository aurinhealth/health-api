import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withTimeZone } from "../src/user-time.js";
import { foodsForCoach, checkFoodCard, applyFoodCard, foodCardMessage } from "../src/coach-food-cards.js";
import { undoActivityChange } from "../src/activity-chat-edits.js";
import { lastUndoInChat } from "../src/coach-chat-confirm.js";
import { validateCoachActions, actionSummary, COACH_ACTION_FORMAT } from "../src/coach-actions.js";
import { isFoodLogMessage } from "../src/food-chat.js";
import { OTHER_APP_SOURCES } from "../src/apple-food.js";

const DAY = "2026-11-28";
function setup() {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const env = { DB: scopedDb(raw, 1), USER_ID: 1 };
  const add = (title, kcal, note, source = "manual") => Number(raw.sqlite.prepare("INSERT INTO food_logs(user_id,consumed_date,consumed_at,recipe_title,kcal,protein_g,carbs_g,fat_g,fiber_g,source,note) VALUES(1,?,?,?,?,?,?,?,?,?,?)")
    .run(DAY, DAY + "T12:30", title, kcal, 30, 100, 30, 6, source, JSON.stringify(note)).lastInsertRowid);
  const row = id => raw.sqlite.prepare("SELECT * FROM food_logs WHERE id=?").get(id);
  const entries = () => raw.sqlite.prepare("SELECT * FROM food_logs WHERE user_id=1").all();
  return { raw, env, add, row, entries };
}
const prague = fn => withTimeZone("Europe/Prague", fn);
const meta = { chatId: 7, messageId: 70, draftId: 1, proposal: "p" };
const card = (a, foods) => checkFoodCard({ foodId: "", meal: "", amount: 0, drink: "", ...a }, foods, "Podle tebe.", DAY)[0];

test("a recipe logged as a portion halves to 0.5 portions, and Vrátit brings it back once", async () => {
  const { env, add, row, entries } = setup();
  // A recipe from the library (food thread): counted in portions, not grams.
  const id = add("Pizza Margherita", 820, { mealType: "lunch", enteredQuantity: 1, enteredUnit: "portion", nutrition_basis: "portion", ingredients: [{ name: "Mouka", amount: 200 }] }, "composed");
  const foods = foodsForCoach([{ date: DAY, entries: entries() }]);
  assert.deepEqual(foods, [{ id: String(id), date: DAY, meal: "lunch", time: "12:30", name: "Pizza Margherita", kcal: 820, amount: 1, unit: "portion" }]);
  const a = card({ type: "food_portion", foodId: String(id), amount: 0.5 }, foods);
  assert.equal(a.fromAmount, "1 porce");
  assert.equal(a.toAmount, "0,5 porce");
  assert.equal(a.kcal, 410);
  assert.match(actionSummary(a), /Pizza Margherita: 1 porce → 0,5 porce, 820 → 410 kcal/);
  const done = await prague(() => applyFoodCard(env, a, meta));
  assert.equal(done.kcal, 410);
  const note = JSON.parse(row(id).note);
  assert.equal(note.enteredQuantity, 0.5);
  assert.equal(note.ingredients[0].amount, 100);
  assert.equal(row(id).fat_g, 15);
  // The chat's "vrať to" finds it in its own chat.
  assert.equal((await lastUndoInChat(env.DB, 7, "2000-01-01 00:00:00"))?.token, done.undo);
  const back = await undoActivityChange(env, done.undo);
  assert.equal(back.foodId, id);
  assert.equal(row(id).kcal, 820);
  assert.equal(JSON.parse(row(id).note).enteredQuantity, 1);
  await assert.rejects(undoActivityChange(env, done.undo), /už vrátit nejde/);
});

test("a food moved to dinner goes back only while it is as the card left it", async () => {
  const { raw, env, add, row, entries } = setup();
  const id = add("Kuře s rýží", 650, { mealType: "lunch", amount_g: 400 });
  const foods = foodsForCoach([{ date: DAY, entries: entries() }]);
  assert.equal(card({ type: "food_move", foodId: String(id), meal: "lunch" }, foods), undefined);
  const a = card({ type: "food_move", foodId: String(id), meal: "dinner" }, foods);
  assert.equal(a.fromMealName, "Oběd");
  assert.equal(a.toMealName, "Večeře");
  const done = await prague(() => applyFoodCard(env, a, meta));
  assert.equal(JSON.parse(row(id).note).mealType, "dinner");
  // Edited in Jídlo since: the undo leaves it alone and stays possible to retry never.
  raw.sqlite.prepare("UPDATE food_logs SET kcal=600 WHERE id=?").run(id);
  await assert.rejects(undoActivityChange(env, done.undo), /upravilo/);
  assert.equal(JSON.parse(row(id).note).mealType, "dinner");
});

test("a deleted food comes back with its id; another app's food gets no card", async () => {
  const { env, add, row, entries } = setup();
  const coffee = add("Káva s mlékem", 45, { mealType: "breakfast", amount_g: 200 });
  const apple = add("Jogurt", 120, { mealType: "breakfast", app: "MyFitnessPal" }, OTHER_APP_SOURCES[0]);
  const foods = foodsForCoach([{ date: DAY, entries: entries() }]);
  assert.equal(foods.find(f => f.id === String(apple)).otherApp, true);
  assert.equal(card({ type: "food_delete", foodId: String(apple) }, foods), undefined);
  const a = card({ type: "food_delete", foodId: String(coffee) }, foods);
  const done = await prague(() => applyFoodCard(env, a, meta));
  assert.equal(done.deleted, true);
  assert.equal(row(coffee), undefined);
  const back = await undoActivityChange(env, done.undo);
  assert.equal(back.foodId, coffee);
  assert.equal(row(coffee).recipe_title, "Káva s mlékem");
  assert.equal(row(coffee).kcal, 45);
});

test("a card made before the food changed is refused", async () => {
  const { raw, env, add, entries } = setup();
  const id = add("Pizza", 820, { mealType: "lunch", amount_g: 300 });
  const a = card({ type: "food_delete", foodId: String(id) }, foodsForCoach([{ date: DAY, entries: entries() }]));
  raw.sqlite.prepare("UPDATE food_logs SET kcal=500 WHERE id=?").run(id);
  await assert.rejects(prague(() => applyFoodCard(env, a, meta)), /změnilo/);
});

test("water goes to Pití and Vrátit takes it out while it is as logged", async () => {
  const { raw, env } = setup();
  const a = card({ type: "fluid_add", amount: 500, drink: "water" }, []);
  assert.deepEqual([a.ml, a.drink, a.foodName], [500, "water", "Voda"]);
  assert.equal(card({ type: "fluid_add", amount: 5000, drink: "water" }, []), undefined);
  const done = await prague(() => applyFoodCard(env, a, meta));
  assert.equal(raw.sqlite.prepare("SELECT ml FROM fluid_log WHERE id=?").get(done.entry.id).ml, 500);
  await undoActivityChange(env, done.undo);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM fluid_log").get().n, 0);
  const again = await prague(() => applyFoodCard(env, a, meta));
  raw.sqlite.prepare("UPDATE fluid_log SET ml=750 WHERE id=?").run(again.entry.id);
  await assert.rejects(undoActivityChange(env, again.undo), /upravilo/);
});

test("food cards only from the athlete's own message, in an app that shows them", () => {
  const foods = [{ id: "5", date: DAY, meal: "lunch", name: "Pizza", kcal: 820, amount: 1, unit: "portion" }];
  const context = { today: { nutrition: { foods } } };
  const action = { type: "food_delete", foodId: "5", meal: "", amount: 0, drink: "", reason: "Řekl jsi, že ji nejedl." };
  assert.equal(validateCoachActions([action], context, DAY, { userInitiated: true }).length, 1);
  assert.equal(validateCoachActions([action], context, DAY).length, 0);
  assert.equal(validateCoachActions([action], { ...context, foodCards: false }, DAY, { userInitiated: true }).length, 0);
  const required = COACH_ACTION_FORMAT.schema.properties.actions.items.required;
  for (const field of ["foodId", "meal", "amount", "drink"]) assert.ok(required.includes(field));
});

test("corrections and water go to the coach's cards, the rest logs as before", () => {
  for (const t of ["Byla to jen půlka pizzy", "To nebyl oběd, ale večeře", "Smaž tu kávu ze snídaně", "Vypil jsem 2 sklenice vody"]) {
    assert.ok(foodCardMessage(t), t);
    assert.equal(isFoodLogMessage(t), false, t);
  }
  assert.equal(isFoodLogMessage("Vypil jsem 2 sklenice vody", { cards: false }), true);
  for (const t of ["Měl jsem snickers a kafe s mlékem", "Snědl jsem půl pizzy", "Vypil jsem vodu a snědl banán"]) assert.equal(isFoodLogMessage(t), true, t);
});
