import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lookupFoodWithAI, productFromLookup } from "../src/food-ai.js";

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

test("the dashboard offers the AI lookup and saves the confirmed food for next time", () => {
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /url\.pathname==='\/app\/api\/food\/ai-lookup'/);
  assert.match(client, /id="foodAiLookup"/);
  assert.match(client, /async function rememberAiFood\(p\)\{try\{await jsonFetch\('\/app\/api\/food\/personal'/);
  assert.match(client, /for\(const a of ingredients\)if\(a\.product\)await rememberAiFood\(a\.product\);/);
  assert.match(entry, /personal=await savePersonalFood\(env\.DB,p,\{used:true\}\)/);
});
