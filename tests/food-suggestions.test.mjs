import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";
import { saveFoodSuggestion, listFoodSuggestions, decideFoodSuggestion, DAILY_SUGGESTIONS } from "../src/food-suggestions.js";
import { savePersonalFood, deletePersonalFood, searchFoodCatalog } from "../src/personal-foods.js";
import { productFromLabel } from "../src/food-sources.js";

const before = { name: "Mini Oreos", brand: "Oreo", barcode: "7622202354892", nutrition_basis: "g", serving_size: "1 g", calories_100g: 474, protein_100g: 5.3, carbs_100g: 68, fat_100g: 20 };
const after = { ...before, serving_size: "19 g", serving_name: "sušenka" };

test("a correction waits for the owner, who sees what changes and approves it into the common catalogue", async () => {
  const raw = createD1(), a = scopedDb(raw, 3), b = scopedDb(raw, 4);
  assert.deepEqual(await saveFoodSuggestion(a, { before, after: before }), { status: "unchanged" });
  const sent = await saveFoodSuggestion(a, { before, after });
  assert.equal(sent.status, "ok");
  // Nothing is shared before the decision.
  assert.equal((await searchFoodCatalog(b, "", before.barcode)).length, 0);

  const { suggestions, counts } = await listFoodSuggestions(raw);
  assert.equal(counts.pending, 1);
  assert.deepEqual(suggestions[0].changes, ["serving_size", "serving_name"]);
  assert.equal(suggestions[0].userId, 3);
  assert.deepEqual(suggestions[0].fromUser, { sent: 1, approved: 0 });

  const decided = await decideFoodSuggestion(raw, scopedDb(raw, 1), { id: sent.id, decision: "approve" });
  assert.deepEqual(decided.notify.users, [{ userId: 3, kind: "correction" }]);
  assert.equal(decided.notify.product.serving_size, "19 g");
  const found = await searchFoodCatalog(b, "", before.barcode);
  assert.equal(found[0].serving_size, "19 g");
  assert.equal(found[0].serving_name, "sušenka");
  assert.equal(found[0].confidence, "verified");
  assert.equal((await listFoodSuggestions(raw, { status: "approved" })).suggestions.length, 1);
  await assert.rejects(decideFoodSuggestion(raw, scopedDb(raw, 1), { id: sent.id, decision: "reject" }), e => e.status === 409);
});

test("a rejected suggestion changes nothing; a newer one replaces the pending one; the daily limit holds", async () => {
  const raw = createD1(), a = scopedDb(raw, 3);
  const first = await saveFoodSuggestion(a, { before, after });
  const second = await saveFoodSuggestion(a, { before, after: { ...after, serving_size: "20 g" } });
  const { suggestions } = await listFoodSuggestions(raw);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].id, second.id);
  assert.notEqual(first.id, second.id);
  assert.equal((await decideFoodSuggestion(raw, scopedDb(raw, 1), { id: second.id, decision: "reject" })).notify, null, "a rejection says nothing");
  assert.equal((await searchFoodCatalog(scopedDb(raw, 4), "", before.barcode)).length, 0);
  for (let i = 0; i < DAILY_SUGGESTIONS; i++) {
    try { await saveFoodSuggestion(a, { before: { ...before, barcode: String(8590000000000 + i) }, after: { ...after, barcode: String(8590000000000 + i) } }); } catch {}
  }
  await assert.rejects(saveFoodSuggestion(a, { before, after }), e => e.status === 429);
});

test("a corrected catalogue food stays the user's own until approved", async () => {
  const raw = createD1(), a = scopedDb(raw, 3), b = scopedDb(raw, 4);
  await savePersonalFood(a, { ...after, origin: "edited" });
  assert.equal((await searchFoodCatalog(a, "", before.barcode))[0].serving_name, "sušenka");
  assert.equal((await searchFoodCatalog(b, "", before.barcode)).length, 0);
  assert.ok(PERSONAL_TABLES.food_suggestions, "deleted and exported with the account");
  assert.equal(productFromLabel(before).serving_name, undefined);
});

test("a report without values marks the food for everyone until the owner fixes it", async () => {
  const { saveFoodReport, markReported, foodRef } = await import("../src/food-suggestions.js");
  const raw = createD1(), a = scopedDb(raw, 3), b = scopedDb(raw, 4);
  const world = { name: "Tyčinka Margot", brand: "Orion", barcode: "8594001234567", nutrition_basis: "g", calories_100g: 259, protein_100g: 10, carbs_100g: 36, fat_100g: 9, source: "catalog", catalog_key: "gtin:08594001234567" };
  await assert.rejects(saveFoodReport(a, { product: world, reason: "nonsense" }), e => e.status === 400);
  const sent = await saveFoodReport(a, { product: world, reason: "values", note: "na obalu je 207 kcal na kus" });
  await saveFoodReport(b, { product: world, reason: "serving" });
  assert.equal(foodRef(world), "gtin:08594001234567");

  const [mine, own] = await markReported(raw, [world, { ...world, source: "personal" }], 3);
  assert.equal(mine.reported, true);
  assert.equal(mine.reported_by_me, true);
  assert.equal(own.reported, undefined, "the user's own copy carries no label");
  assert.equal((await markReported(raw, [world], 9))[0].reported_by_me, false);

  // Corrections and reports are listed apart.
  assert.equal((await listFoodSuggestions(raw)).suggestions.length, 0);
  const { suggestions, pending } = await listFoodSuggestions(raw, { kind: "report" });
  assert.deepEqual(pending, { correction: 0, report: 2 });
  const first = suggestions.find(s => s.id === sent.id);
  assert.equal(first.reason, "values");
  assert.equal(first.note, "na obalu je 207 kcal na kus");
  assert.equal(first.reports, 2);

  // Approving needs the corrected values; it settles both reports.
  await assert.rejects(decideFoodSuggestion(raw, scopedDb(raw, 1), { id: sent.id, decision: "approve" }), e => e.status === 400);
  const decided = await decideFoodSuggestion(raw, scopedDb(raw, 1), { id: sent.id, decision: "approve", after: { ...world, calories_100g: 207 } });
  // Both reporters hear about it, with the fixed food.
  assert.deepEqual(decided.notify.users, [{ userId: 3, kind: "report" }, { userId: 4, kind: "report" }]);
  assert.equal(decided.notify.product.calories_100g, 207);
  assert.equal((await listFoodSuggestions(raw, { kind: "report" })).suggestions.length, 0);
  assert.equal((await markReported(raw, [world], 3))[0].reported, undefined);
  assert.equal((await searchFoodCatalog(b, "", world.barcode))[0].calories_100g, 207);
});

test("a verified food stays verified for everyone when another user logs, changes or deletes the same values", async () => {
  const raw = createD1(), a = scopedDb(raw, 3), b = scopedDb(raw, 4), c = scopedDb(raw, 5);
  const sent = await saveFoodSuggestion(a, { before, after });
  await decideFoodSuggestion(raw, scopedDb(raw, 1), { id: sent.id, decision: "approve" });
  const verified = async () => (await searchFoodCatalog(c, "", before.barcode)).find(f => f.serving_size === "19 g");
  assert.equal((await verified())?.confidence, "verified");
  // The same values saved as b's own food, twice, then changed and deleted.
  const own = await savePersonalFood(b, after);
  await savePersonalFood(b, { ...after, id: own.id });
  assert.equal((await verified())?.confidence, "verified");
  await savePersonalFood(b, { ...after, id: own.id, calories_100g: 480 });
  assert.equal((await verified())?.confidence, "verified");
  await deletePersonalFood(b, own.id);
  assert.equal((await verified())?.confidence, "verified");
});
