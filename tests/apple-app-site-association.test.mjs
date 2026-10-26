import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appleAppSiteAssociation, appleAppSiteAssociationBody, APP_BUNDLE_ID } from "../src/apple-app-site-association.js";
import { isPublicPath } from "../src/dashboard-auth.js";

const env = { APPLE_TEAM_ID: "ABCDE12345" };
const get = (path, method = "GET") => new Request("https://aurin.health" + path, { method });

test("the file names the app for passkeys (webcredentials) with the team id", async () => {
  assert.deepEqual(appleAppSiteAssociationBody(env).webcredentials, { apps: ["ABCDE12345.health.aurin.app", "ABCDE12345.eu.petrfitnessdata.loadwise.native"] });
  assert.deepEqual(appleAppSiteAssociationBody(env).applinks.details[0], { appIDs: ["ABCDE12345.health.aurin.app", "ABCDE12345.eu.petrfitnessdata.loadwise.native"], components: [{ "/": "/t/*", comment: "Shared workouts" }] });
  const response = appleAppSiteAssociation(get("/.well-known/apple-app-site-association"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual((await response.json()).webcredentials, { apps: ["ABCDE12345." + APP_BUNDLE_ID, "ABCDE12345.eu.petrfitnessdata.loadwise.native"] });
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

test("iOS reads it anonymously, and the app's entitlement names the server it talks to", () => {
  assert.equal(isPublicPath("/.well-known/apple-app-site-association"), true);
  const project = readFileSync(new URL("../ios-native/project.yml", import.meta.url), "utf8");
  // The live server (Data/ServerChoice.swift); passkeys are off on the test server.
  const client = readFileSync(new URL("../ios-native/Aurin/Data/ServerChoice.swift", import.meta.url), "utf8");
  const server = new URL(client.match(/case \.live: URL\(string: "([^"]+)"\)!/)[1]).hostname;
  assert.match(client, /var passkeys: Bool \{ self == \.live \}/);
  assert.equal(server, "aurin.health");
  const domains = project.match(/com\.apple\.developer\.associated-domains:\s*\n((?:\s*- .+\n)+)/)[1];
  assert.match(domains, new RegExp("- webcredentials:" + server.replace(/\./g, "\\.") + "\n"));
  assert.match(domains, /- applinks:aurin\.health\n/);
  assert.match(project, new RegExp("PRODUCT_BUNDLE_IDENTIFIER: " + APP_BUNDLE_ID.replace(/\./g, "\\.") + "\\b"));
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.ok(source.includes("appleAppSiteAssociation(request, rawEnv, url.pathname)"));
});
