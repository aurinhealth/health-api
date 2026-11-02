import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appUpdateRequired, appApiLevel, MIN_APP_API, APP_API_HEADER } from "../src/app-version.js";

const request = headers => new Request("https://aurin.health/app/api/today", { headers });

test("an app built for an older API is told to update", async () => {
  const response = appUpdateRequired(request({ [APP_API_HEADER]: String(MIN_APP_API - 1) }));
  assert.equal(response.status, 426);
  const body = await response.json();
  assert.equal(body.status, "update_required");
  assert.match(body.message, /Nainstaluj novější verzi/);
});

// Builds from before 2026-11 send the level as X-Loadwise-Api.
test("the app's API level is read from X-Aurin-Api, and from X-Loadwise-Api of an older build", () => {
  assert.equal(APP_API_HEADER, "X-Aurin-Api");
  assert.equal(appApiLevel(request({ "X-Aurin-Api": "1" })), "1");
  assert.equal(appApiLevel(request({ "X-Loadwise-Api": "1" })), "1");
  assert.equal(appApiLevel(request({})), null);
  assert.equal(appUpdateRequired(request({ "X-Loadwise-Api": String(MIN_APP_API - 1) })).status, 426);
});

test("the Worker checks the app version before anything else runs", () => {
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const exported = source.slice(source.lastIndexOf("export default {"));
  assert.ok(exported.indexOf("appUpdateRequired(request)") > 0);
  assert.ok(exported.indexOf("appUpdateRequired(request)") < exported.indexOf("worker.fetch(request"));
});

test("the message follows the app language", async () => {
  const body = await appUpdateRequired(request({ [APP_API_HEADER]: "0", "X-Interface-Language": "en" })).json();
  assert.match(body.message, /Install a newer version/);
});

test("a current app, a garbled header and requests without it", () => {
  assert.equal(appUpdateRequired(request({ [APP_API_HEADER]: String(MIN_APP_API) })), null);
  assert.equal(appUpdateRequired(request({ [APP_API_HEADER]: String(MIN_APP_API + 1) })), null);
  assert.equal(appUpdateRequired(request({})), null);
  assert.equal(appUpdateRequired(request({ [APP_API_HEADER]: "abc" })).status, 426);
});

// Raising MIN_APP_API without the app would lock out even the newest build.
test("the app in ios-native/ is built for at least the minimum API", () => {
  const client = readFileSync(new URL("../ios-native/Aurin/Data/APIClient.swift", import.meta.url), "utf8");
  const level = Number(/static let apiLevel = (\d+)/.exec(client)?.[1]);
  assert.ok(level >= MIN_APP_API, `apiLevel ${level} < MIN_APP_API ${MIN_APP_API}`);
  assert.match(client, new RegExp(`forHTTPHeaderField: "${APP_API_HEADER}"`));
});
