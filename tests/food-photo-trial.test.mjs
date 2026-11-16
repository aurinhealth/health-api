import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";
import { saveConsent } from "../src/consent.js";
import { assertAIAccess } from "../src/subscription.js";
import { foodPhotoTrial, claimFoodPhoto, returnFoodPhoto } from "../src/food-photo-trial.js";
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
  // A photo AI could not read gives its photo back.
  assert.equal(await claimFoodPhoto(env), true);
  await returnFoodPhoto(env);
  assert.equal((await foodPhotoTrial(env)).used, 0);
  for (let i = 0; i < 5; i++) { const request = { ...env }; await assertAIAccess(request, "food-photo"); assert.equal(await claimFoodPhoto(request), true); await assertAIAccess(request, "food-photo"); }
  assert.deepEqual(await foodPhotoTrial(env), { limit: 5, used: 5, left: 0 });
  assert.equal(await claimFoodPhoto({ ...env }), false, "photos sent at once cannot go over");
  await assert.rejects(assertAIAccess(env, "food-photo"), e => e.status === 402 && /free photo logs|Fotky jídla zdarma/.test(e.message));
  for (const feature of ["barcode", "food-lookup", "food-sentence", "assistant", null]) await assert.rejects(assertAIAccess(env, feature), e => e.status === 402, String(feature));
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
  assert.match(routes, /if\(!await plansUnlocked\(env\)&&\(body\.mode==='front'\|\|body\.mode==='barcode'\|\|!await claimFoodPhoto\(env\)\)\)return Response\.json\(\{status:'subscription_required'/, "without Pro: a photo is taken first, the package front and barcode need Pro");
  assert.match(routes, /if\(!r\.result\)\{await returnFoodPhoto\(env\);/, "an unread photo is given back");
});
