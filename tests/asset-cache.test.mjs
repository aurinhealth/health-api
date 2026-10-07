import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assetVersion, scriptCacheControl } from "../src/asset-version.js";
import { dashboardPage } from "../src/dashboard.js";
import { englishScript, langBoot } from "../src/i18n.js";

test("a script's fingerprint changes with its text", () => {
  assert.equal(assetVersion("a"), assetVersion("a"));
  assert.notEqual(assetVersion("console.log(1)"), assetVersion("console.log(2)"));
});

test("versioned scripts are kept by the browser, unversioned ones are checked again", () => {
  const v = assetVersion("x");
  assert.match(scriptCacheControl(new URL("https://h/app/x.js?v=" + v), v), /immutable/);
  assert.equal(scriptCacheControl(new URL("https://h/app/x.js?v=old"), v), "public, max-age=300");
  assert.equal(scriptCacheControl(new URL("https://h/app/x.js"), v), "public, max-age=300");
});

test("the app page asks for the client script by its fingerprint", async () => {
  const html = await dashboardPage({ clientVersion: "abc123" }).text();
  assert.match(html, /\/app\/dashboard-client\.js\?v=abc123/);
});

test("the English script is cached under the version the page asks for", () => {
  const v = langBoot.match(/i18n-en\.js\?v=([a-z0-9]+)/)[1];
  assert.match(englishScript(new URL("https://h/app/i18n-en.js?v=" + v)).headers.get("cache-control"), /immutable/);
});

test("switching the day does not read the whole history again", () => {
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  assert.match(client, /const DAY_INDEPENDENT=\['athleteState','fitness','weight','activities','nutrition','sleep'\]/);
  assert.match(client, /markDataChanged\(path\)/);
  // The saved day on this device goes away with the session.
  assert.match(client, /async function logout\(\)\{forgetAccount\(\);/);
  assert.match(client, /function showLoginGate\(\)\{if\(\$\("loginGate"\)\)return;forgetAccount\(\);/);
  assert.match(client, /function forgetAccount\(\)\{forgetDashboard\(\);/);
});
