import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";
import { saveConsent } from "../src/consent.js";
import { assertAIAccess } from "../src/subscription.js";
import { foodPhotoTrial, countFoodPhoto } from "../src/food-photo-trial.js";
import { aiRouteFeature } from "../src/ai-routes.js";
import { KEPT_TABLES } from "../src/health-pause.js";

const migration = readFileSync(new URL("../migrations/0013_cookbook_and_consents.sql", import.meta.url), "utf8");
function setup(extra = {}) {
  const raw = createD1();
  raw.sqlite.exec(migration);
  return { DB: scopedDb(raw, 2), USER_ID: 2, CONSENT_REQUIRED: true, AI_PAYWALL_ENABLED: "true", ...extra };
}

test("without Pro, AI reads 5 photos of food a month; words and the web stay Pro", async () => {
  const env = setup();
  await saveConsent(env, { health: true });
  await assert.rejects(assertAIAccess(env, "food-photo"), e => e.status === 403 && e.consent === true, "the AI consent comes first");
  await saveConsent(env, { ai: true });
  assert.deepEqual(await foodPhotoTrial(env), { limit: 5, used: 0, left: 5 });
  for (let i = 0; i < 5; i++) { await assertAIAccess(env, "food-photo"); await assertAIAccess(env, "barcode"); await countFoodPhoto(env); }
  assert.deepEqual(await foodPhotoTrial(env), { limit: 5, used: 5, left: 0 });
  await assert.rejects(assertAIAccess(env, "food-photo"), e => e.status === 402 && /free photo logs|Fotky jídla zdarma/.test(e.message));
  await assert.rejects(assertAIAccess(env, "barcode"), e => e.status === 402, "the barcode photo goes with them");
  for (const feature of ["food-lookup", "food-sentence", "assistant", null]) await assert.rejects(assertAIAccess(env, feature), e => e.status === 402, String(feature));
});

test("the number is a Worker setting and 0 turns the free photos off", async () => {
  const env = setup({ FOOD_PHOTO_TRIAL: "0" });
  await saveConsent(env, { health: true, ai: true });
  await assert.rejects(assertAIAccess(env, "food-photo"), e => e.status === 402);
  assert.equal((await foodPhotoTrial(setup({ FOOD_PHOTO_TRIAL: "8" }))).limit, 8);
});

test("the gate names the photo route, the table goes and stays with the account", () => {
  assert.equal(aiRouteFeature("/app/api/food/photo"), "food-photo");
  assert.equal(aiRouteFeature("/app/api/food/ai-lookup"), null);
  assert.ok(PERSONAL_TABLES.food_photo_trial);
  assert.ok(KEPT_TABLES.has("food_photo_trial"), "pausing health data does not start the photos over");
  const routes = readFileSync(new URL("../src/routes-food.js", import.meta.url), "utf8");
  assert.match(routes, /const photoTrial=await plansUnlocked\(env\)\?null:await countFoodPhoto\(env\);/, "only a read photo counts, and only without Pro");
});
