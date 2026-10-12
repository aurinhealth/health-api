import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appleAppSiteAssociation, appleAppSiteAssociationBody, APP_BUNDLE_ID } from "../src/apple-app-site-association.js";
import { isPublicPath } from "../src/dashboard-auth.js";

const env = { APPLE_TEAM_ID: "ABCDE12345" };
const get = (path, method = "GET") => new Request("https://petrfitnessdata.eu" + path, { method });

test("the file names the app for passkeys (webcredentials) with the team id", async () => {
  assert.deepEqual(appleAppSiteAssociationBody(env), { webcredentials: { apps: ["ABCDE12345.eu.petrfitnessdata.loadwise.native"] } });
  const response = appleAppSiteAssociation(get("/.well-known/apple-app-site-association"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { webcredentials: { apps: ["ABCDE12345." + APP_BUNDLE_ID] } });
  assert.equal(appleAppSiteAssociation(get("/.well-known/apple-app-site-association.json"), env).status, 200);
});

test("without a team id the file is not served; other paths and methods pass", () => {
  assert.equal(appleAppSiteAssociationBody({}), null);
  assert.equal(appleAppSiteAssociationBody({ APPLE_TEAM_ID: "short" }), null);
  assert.equal(appleAppSiteAssociation(get("/.well-known/apple-app-site-association"), {}).status, 404);
  assert.equal(appleAppSiteAssociation(get("/.well-known/apple-developer-domain-association.txt"), env), null);
  assert.equal(appleAppSiteAssociation(get("/app/api/today"), env), null);
  assert.equal(appleAppSiteAssociation(get("/.well-known/apple-app-site-association", "POST"), env).status, 405);
});

test("iOS reads it anonymously, and the app's entitlement names the same domain", () => {
  assert.equal(isPublicPath("/.well-known/apple-app-site-association"), true);
  const project = readFileSync(new URL("../ios-native/project.yml", import.meta.url), "utf8");
  assert.match(project, /com\.apple\.developer\.associated-domains:\s*\n\s*- webcredentials:petrfitnessdata\.eu/);
  assert.match(project, new RegExp("PRODUCT_BUNDLE_IDENTIFIER: " + APP_BUNDLE_ID.replace(/\./g, "\\.") + "\\b"));
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.ok(source.includes("appleAppSiteAssociation(request, rawEnv, url.pathname)"));
});
