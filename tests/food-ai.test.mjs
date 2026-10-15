import assert from "node:assert/strict";
import test from "node:test";
import { lookupFoodWithAI, productFromLookup } from "../src/food-ai.js";
import { serverSource } from "./helpers/server-source.mjs";

const answer = { found: true, name: "Snickers", brand: "Mars", nutrition_basis: "g", calories: 481, protein_g: 8.6, carbs_g: 60.5, fat_g: 22.5, fiber_g: null, salt_g: 0.6, serving_size: "50 g", package_size: "50 g", confidence: "high", note: "" };

function mockOpenAI(body) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify(body), { status: 200 }); };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("AI looks the food up on the web and returns label values with the barcode and sources", async () => {
  const m = mockOpenAI({ model: "m", output: [{ type: "web_search_call" }, { content: [{ type: "output_text", text: JSON.stringify(answer), annotations: [{ type: "url_citation", url: "https://www.mars.com/snickers", title: "Mars" }, { type: "url_citation", url: "javascript:alert(1)", title: "x" }] }] }] });
  try {
    const r = await lookupFoodWithAI({ OPENAI_API_KEY: "sk" }, { name: "snickers", barcode: "5000159461122" });
    assert.deepEqual(m.calls[0].body.tools, [{ type: "web_search" }]);
    assert.equal(m.calls[0].body.text.format.type, "json_schema");
    assert.match(m.calls[0].body.input, /5000159461122/);
    assert.equal(r.product.calories_100g, 481);
    assert.equal(r.product.barcode, "5000159461122");
    assert.equal(r.product.source, "ai");
    assert.deepEqual(r.product.sources.map(s => s.url), ["https://www.mars.com/snickers"]);
  } finally { m.restore(); }
});

test("not found, missing macros or impossible values are not offered", () => {
  assert.equal(productFromLookup({ ...answer, found: false }), null);
  assert.equal(productFromLookup({ ...answer, fat_g: null }), null);
  assert.equal(productFromLookup({ ...answer, carbs_g: 160 }), null);
  assert.equal(productFromLookup("not json"), null);
});

test("the server offers the AI lookup and saves the confirmed food for next time", () => {
  const entry = serverSource();
  assert.match(entry, /url\.pathname==='\/app\/api\/food\/ai-lookup'/);
  assert.match(entry, /const saving=savePersonalFood\(env\.DB,p,\{used:true\}\)/);
  assert.match(entry, /ctx\.waitUntil\(saving\)/);
});

test("AI values are checked against their macros: kJ becomes kcal, impossible ones are dropped, a mismatch is flagged", () => {
  assert.equal(productFromLookup(answer).confidence, "high");
  assert.equal(productFromLookup(answer).warning, undefined);
  // 2013 is the Snickers' energy in kJ.
  assert.equal(productFromLookup({ ...answer, calories: 2013 }).calories_100g, 481);
  assert.equal(productFromLookup({ ...answer, calories: 50, protein_g: 30, carbs_g: 30, fat_g: 20 }), null);
  assert.equal(productFromLookup({ ...answer, protein_g: 40, carbs_g: 40, fat_g: 30 }), null);
  // Beer: alcohol carries energy the macros do not show.
  const beer = productFromLookup({ ...answer, name: "Pivo", nutrition_basis: "ml", calories: 43, protein_g: .5, carbs_g: 3.6, fat_g: 0 });
  assert.equal(beer.calories_100g, 43);
  assert.equal(beer.confidence, "low");
  assert.match(beer.warning, /nesedí/);
});
