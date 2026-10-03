import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isFoodLogMessage, buildFoodDraft, foodDraftSummary, itemTotals, parseFoodSentence } from "../src/food-chat.js";
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

test("the assistant returns the draft and the dialog logs it only on confirmation", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  assert.match(entry, /if\(body\.mode!=='coach'&&isFoodLogMessage\(message\)\)/);
  assert.match(client, /if\(result\.kind==='food_draft'\)\{renderFoodDraft\(message,result\);return\}/);
  assert.match(client, /\$\('foodDraftSave'\)\.onclick=async\(\)=>/);
});
