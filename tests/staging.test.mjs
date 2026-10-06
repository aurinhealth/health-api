import test from "node:test";
import assert from "node:assert/strict";
import { isStaging, markStaging } from "../src/staging.js";
import { mayUpgradeFrom } from "../src/tenancy.js";
import { googleLoginRedirectUri } from "../src/google-login.js";

const STAGING = { ENVIRONMENT: "staging", APP_ORIGIN: "https://staging.petrfitnessdata.eu" };

test("staging pages carry a badge and stay out of search engines", async () => {
  assert.equal(isStaging(STAGING), true);
  assert.equal(isStaging({}), false);
  const page = await markStaging(new Response("<html><body><p>Hi</p></body></html>", { headers: { "content-type": "text/html; charset=utf-8" } }));
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.match(await page.text(), /TEST · staging<\/div><\/body>/);
  const api = await markStaging(Response.json({ status: "ok" }, { status: 201 }));
  assert.equal(api.status, 201);
  assert.deepEqual(await api.json(), { status: "ok" });
});

test("only production hosts and the staging copy's own host may upgrade the database", () => {
  assert.equal(mayUpgradeFrom(null), true);
  assert.equal(mayUpgradeFrom(new Request("https://petrfitnessdata.eu/app")), true);
  assert.equal(mayUpgradeFrom(new Request("https://abc123-health-api.chelseafc-czsk.workers.dev/app")), false);
  assert.equal(mayUpgradeFrom(new Request(STAGING.APP_ORIGIN + "/app"), STAGING), true);
  assert.equal(mayUpgradeFrom(new Request(STAGING.APP_ORIGIN + "/app"), {}), false);
});

test("Google sign-in returns to the copy it started from", () => {
  assert.equal(googleLoginRedirectUri({}), "https://petrfitnessdata.eu/auth/google/callback");
  assert.equal(googleLoginRedirectUri(STAGING), STAGING.APP_ORIGIN + "/auth/google/callback");
});
