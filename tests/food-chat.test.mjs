import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isFoodLogMessage, buildFoodDraft, foodDraftSummary, itemTotals, parseFoodSentence, foodParseInstructionsText } from "../src/food-chat.js";
import { withLang } from "../src/lang.js";
import { lightModel } from "../src/coach-assistant.js";

test("food sentences go to the food draft, training requests do not", () => {
  for (const m of ["Měl jsem snickers", "k snídani jsem měl 2 rohlíky s máslem", "Vypil jsem kafe s mlékem", "Dala jsem si banán"]) assert.ok(isFoodLogMessage(m), m);
  for (const m of ["Vygeneruj mi kolo na týden", "Zhodnoť dnešní jízdu", "Měl jsem těžký trénink na kole"]) assert.ok(!isFoodLogMessage(m), m);
});

const snickers = { name: "Snickers", brand: "Mars", nutrition_basis: "g", calories_100g: 481, protein_100g: 8.6, carbs_100g: 60.5, fat_100g: 22.5 };

test("saved foods are used first; only new foods are looked up on the web", async () => {
  const lookups = [];
  const draft = await buildFoodDraft({ DB: {} }, "včera jsem měl snickers a kafe", "2026-10-03", {
    parse: async () => ({ dayOffset: -1, items: [{ name: "Snickers", brand: "", grams: 50, basis: "g", meal: "snack_pm", portion: "1 tyčinka" }, { name: "káva s mlékem", brand: "", grams: 250, basis: "ml", meal: "", portion: "1 hrnek" }, { name: "neznámá věc", brand: "", grams: 100, basis: "g", meal: "", portion: "" }] }),
    saved: async (db, name) => /snickers/i.test(name) ? [snickers] : [],
    lookup: async (env, { name }) => { lookups.push(name); return { product: /káva/.test(name) ? { name: "Káva s mlékem", nutrition_basis: "ml", calories_100g: 20, protein_100g: 1, carbs_100g: 2, fat_100g: 1, source: "ai" } : null }; }
  });
  assert.equal(draft.date, "2026-10-02");
  assert.deepEqual(lookups, ["káva s mlékem", "neznámá věc"]);
  assert.equal(draft.items[0].product.source, "personal");
  assert.equal(draft.items[0].totals.kcal, 240.5);
  assert.equal(draft.items[1].totals.kcal, 50);
  assert.equal(draft.items[2].product, null);
  const text = foodDraftSummary(draft);
  assert.match(text, /celkem asi 291 kcal/);
  assert.match(text, /„neznámá věc“ jsem hodnoty nenašel/);
});

test("the sentence is parsed by the light model with a JSON schema", async () => {
  const original = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (url, init) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ day_offset: 0, items: [{ name: "Snickers", brand: "", grams: 50, basis: "g", meal: "", portion: "1 tyčinka" }, { name: "", brand: "", grams: 10, basis: "g", meal: "", portion: "" }] }) }] }] }), { status: 200 }); };
  try {
    const r = await parseFoodSentence({ OPENAI_API_KEY: "sk" }, "měl jsem snickers");
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.text.format.name, "food_sentence");
    assert.equal(r.items.length, 1);
  } finally { globalThis.fetch = original; }
  assert.equal(lightModel({ OPENAI_LIGHT_MODEL: "gpt-5.4-mini" }), "gpt-5.4-mini");
  assert.deepEqual(itemTotals(snickers, 100), { kcal: 481, protein_g: 8.6, carbs_g: 60.5, fat_g: 22.5 });
});

test("the assistant returns a food draft instead of logging the sentence", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /if\(body\.mode!=='coach'&&isFoodLogMessage\(message\)\)/);
});

test("English food sentences go to the food draft too; questions and training do not", () => {
  for (const m of ["I had a banana and a coffee", "I ate oats with milk for breakfast", "Snack: an apple and some nuts", "I've just had two eggs", "Log my lunch: chicken and rice"]) assert.ok(isFoodLogMessage(m), m);
  for (const m of ["I had a hard ride today", "Should I eat before the ride", "I had a great run", "Can I have a banana"]) assert.ok(!isFoodLogMessage(m), m);
  assert.match(withLang("en", foodParseInstructionsText), /^From the user's sentence \(in English\)/);
  assert.doesNotMatch(withLang("en", foodParseInstructionsText), /[ěščřžýůňťď]/);
  assert.match(withLang("cs", foodParseInstructionsText), /^Z věty uživatele \(česky\)/);
});

test("food sentences without 'I had', with an iPhone apostrophe or around a ride still log", () => {
  for (const m of ["Lunch was chicken and rice", "Dneska k obědu kuře s rýží", "I’ve just had a banana", "Po jízdě jsem snědl banán", "Vypil jsem kolu", "After the ride I ate a bagel"]) assert.ok(isFoodLogMessage(m), m);
  for (const m of ["K obědu bych si dal něco lehkého", "Na večeři půjdu do restaurace", "Po jízdě jsem měl křeče", "Měl jsem těžký trénink na kole", "I had a hard ride today"]) assert.ok(!isFoodLogMessage(m), m);
});
