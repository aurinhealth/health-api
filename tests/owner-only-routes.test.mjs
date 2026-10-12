import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { ownerOnlyPath, ownerOnlyRefusal } from "../src/owner-only-routes.js";

const owner = { id: 1, isOwner: true, isAdmin: true };
const friend = { id: 2, isOwner: false, isAdmin: false };

test("routes only the old web dashboard used are the owner's", () => {
  for (const path of ["/app/api/daily", "/app/api/sleep", "/app/api/activities", "/app/api/nutrition", "/app/api/nutrition/log", "/app/api/fitness", "/app/api/week", "/app/api/food/recipe", "/app/api/me/apple", "/app/api/account/email/start", "/app/api/training-profile/estimate", "/cookbook/page", "/cookbook/search", "/food/today", "/food/log", "/food/recommend", "/sync/google", "/sync/google/status", "/sync/intervals", "/health/sleep", "/analysis/daily", "/strength/write-plan"]) {
    assert.equal(ownerOnlyPath(path), true, path);
  }
});

test("the iPhone app's routes stay open to every user", () => {
  const root = new URL("../ios-native/", import.meta.url);
  const swift = readdirSync(root, { recursive: true }).filter(name => name.endsWith(".swift"))
    .map(name => readFileSync(new URL(name, root), "utf8")).join("\n");
  const called = [...new Set([...swift.matchAll(/"(\/app\/api\/[A-Za-z0-9_/.-]*)/g)].map(m => m[1].replace(/\/$/, "")))];
  assert.ok(called.length > 20, "the app's API paths were found");
  for (const path of called) assert.equal(ownerOnlyPath(path), false, path);
  for (const path of ["/app/api/food/recipes", "/app/api/food/log", "/app/api/today", "/app/api/me", "/auth/app/session", "/oauth/google", "/automation/strength", "/"]) {
    assert.equal(ownerOnlyPath(path), false, path);
  }
});

test("only a signed-in user other than the owner is refused", async () => {
  const refused = ownerOnlyRefusal("/app/api/daily", { signedIn: true, user: friend });
  assert.equal(refused.status, 404);
  assert.equal((await refused.json()).status, "error");
  assert.equal(ownerOnlyRefusal("/app/api/daily", { signedIn: true, user: owner }), null);
  // The owner's API key and GitHub Actions are not a signed-in session.
  assert.equal(ownerOnlyRefusal("/app/api/daily", { signedIn: false, user: owner }), null);
  assert.equal(ownerOnlyRefusal("/app/api/today", { signedIn: true, user: friend }), null);
  assert.equal(ownerOnlyRefusal("/cookbook/page", { signedIn: true, user: friend }).status, 404);
});
