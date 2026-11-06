import test from "node:test";
import assert from "node:assert/strict";
import { offRecord, lookupOpenFoodFacts, shareWithOpenFoodFacts } from "../src/open-food-facts.js";

const product = {
  code: "8594001234567", product_name: "Bílý jogurt", lang: "cs", brands: "Olma, Agro", quantity: "150 g", serving_size: "150 g",
  nutriments: { "energy-kcal_100g": 62, proteins_100g: 4.2, carbohydrates_100g: 5.1, fat_100g: 3, sugars_100g: 5.1, salt_100g: 0.12 }
};
// A cache like the data centre's: what was put is matched again.
function memoryCache() {
  const map = new Map();
  return { map, match: async key => map.has(key) ? new Response(map.get(key)) : undefined, put: async (key, r) => { map.set(key, await r.text()); } };
}
const answer = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("an OFF product becomes a catalogue food; one without plausible values does not", () => {
  const r = offRecord(product);
  assert.equal(r.k, "gtin:08594001234567");
  assert.equal(r.cs, "Bílý jogurt");
  assert.equal(r.br, "Olma, Agro");
  assert.equal(r.e, 62);
  assert.equal(offRecord({ ...product, nutriments: { proteins_100g: 4 } }), null);
  assert.equal(offRecord({ ...product, product_name: "" }), null);
  assert.equal(offRecord({ ...product, nutriments: { energy_100g: 418.4, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } }).e, 100, "kJ only");
  assert.equal(offRecord({ ...product, product_quantity_unit: "ml" }).u, "ml");
});

test("a barcode the catalogue lacks is asked of OFF once, then the cache answers, misses too", async () => {
  const store = memoryCache(), calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return url.includes("8594001234567") ? answer({ status: 1, product }) : answer({ status: 0 }, 404); };
  const [found] = await lookupOpenFoodFacts({}, "8594001234567", { fetchImpl, store, language: "cs" });
  assert.equal(found.name, "Bílý jogurt");
  assert.equal(found.source_name, "Open Food Facts");
  assert.equal(found.source_url, "https://world.openfoodfacts.org/product/8594001234567");
  assert.equal(found.calories_100g, 62);
  assert.match(calls[0].init.headers["User-Agent"], /^Aurin\//);
  assert.equal((await lookupOpenFoodFacts({}, "8594001234567", { fetchImpl, store })).length, 1);
  assert.deepEqual(await lookupOpenFoodFacts({}, "4006381333931", { fetchImpl, store }), []);
  assert.deepEqual(await lookupOpenFoodFacts({}, "4006381333931", { fetchImpl, store }), []);
  assert.equal(calls.length, 2, "one request per barcode");
  assert.deepEqual(await lookupOpenFoodFacts({}, "123", { fetchImpl, store }), [], "not a barcode");
  assert.equal(calls.length, 2);
});

test("OFF down or slow: the scan goes on without it and nothing is cached", async () => {
  const store = memoryCache();
  assert.deepEqual(await lookupOpenFoodFacts({}, "8594001234567", { fetchImpl: async () => answer({}, 503), store }), []);
  assert.deepEqual(await lookupOpenFoodFacts({}, "8594001234567", { fetchImpl: async () => { throw new Error("timeout"); }, store }), []);
  assert.equal(store.map.size, 0);
});

const approved = { barcode: "4006381333931", name: "Proteinová tyčinka", brand: "Aurin", quantity: "60 g", nutrition_basis: "g", calories_100g: 380, protein_100g: 33, carbs_100g: 30, fat_100g: 12, fiber_100g: null, salt_100g: 0.4 };
const account = { OFF_USER_ID: "aurin", OFF_PASSWORD: "secret" };

test("an approved food goes to OFF only when OFF has no values for its barcode", async () => {
  const posts = [];
  const fetchImpl = async (url, init) => {
    if (init?.method === "POST") { posts.push({ url, form: new URLSearchParams(init.body.toString()) }); return answer({ status: 1, status_verbose: "fields saved" }); }
    return answer({ status: 0 }, 404);
  };
  assert.equal(await shareWithOpenFoodFacts(account, approved, { fetchImpl }), "sent");
  const { url, form } = posts[0];
  assert.equal(url, "https://world.openfoodfacts.org/cgi/product_jqm2.pl");
  assert.equal(form.get("code"), "4006381333931");
  assert.equal(form.get("nutriment_energy-kcal"), "380");
  assert.equal(form.get("nutriment_proteins"), "33");
  assert.equal(form.get("nutriment_salt"), "0.4");
  assert.equal(form.get("nutriment_fiber"), null, "an empty value stays empty");
  assert.equal(form.get("nutrition_data_per"), "100g");
  assert.equal(form.get("app_name"), "Aurin");
  // OFF already has values: nothing is overwritten.
  assert.equal(await shareWithOpenFoodFacts(account, approved, { fetchImpl: async (u, init) => init?.method === "POST" ? assert.fail("no write") : answer({ status: 1, product: { ...product, code: approved.barcode } }) }), "exists");
});

test("no account, no valid barcode or a portion-only food: nothing is sent; the test server writes to OFF's test site", async () => {
  const never = async () => assert.fail("no request");
  assert.equal(await shareWithOpenFoodFacts({}, approved, { fetchImpl: never }), "skipped");
  assert.equal(await shareWithOpenFoodFacts(account, { ...approved, barcode: "4006381333932" }, { fetchImpl: never }), "skipped", "wrong check digit");
  assert.equal(await shareWithOpenFoodFacts(account, { ...approved, nutrition_basis: "portion" }, { fetchImpl: never }), "skipped");
  assert.equal(await shareWithOpenFoodFacts(account, { ...approved, fat_100g: null }, { fetchImpl: never }), "skipped");
  const urls = [];
  const fetchImpl = async (url, init) => { urls.push([url, init.headers.Authorization]); return init?.method === "POST" ? answer({ status: 0, status_verbose: "bad" }) : answer({ status: 0 }, 404); };
  assert.equal(await shareWithOpenFoodFacts({ ...account, ENVIRONMENT: "staging" }, approved, { fetchImpl }), "failed");
  assert.ok(urls.every(([u, auth]) => u.startsWith("https://world.openfoodfacts.net/") && auth === "Basic " + btoa("off:off")));
});
