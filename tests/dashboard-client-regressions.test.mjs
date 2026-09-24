import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
const entrypointSource = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
const wranglerSource = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("dashboard client remains valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(clientSource));
});

test("entrypoint serves the dashboard client as a text module", () => {
  assert.match(entrypointSource, /import dashboardClient from "\.\/dashboard-client\.js"/);
  assert.match(entrypointSource, /new Response\(dashboardClient,/);
  assert.doesNotMatch(entrypointSource, /new Response\("const \$=/);
});

test("dashboard text module rule does not fall through to JavaScript processing", () => {
  assert.match(wranglerSource, /"type": "Text"/);
  assert.match(wranglerSource, /"fallthrough": false/);
});

test("gym video URL parsing keeps its regular expressions intact", () => {
  assert.match(clientSource, /HYPERLINK\\\(\\s\*/);
  assert.match(clientSource, /\^https\?:\\\/\\\//);
});
