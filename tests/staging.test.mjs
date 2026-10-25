import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isStaging, markStaging, internalTester } from "../src/staging.js";
import { mayUpgradeFrom } from "../src/tenancy.js";
import { parseConfig } from "../scripts/provision-user-shards.mjs";

const config = parseConfig(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const STAGING = config.env.staging.vars;

test("test server pages carry a badge and stay out of search engines", async () => {
  assert.equal(isStaging(STAGING), true);
  assert.equal(isStaging(config.vars), false);
  const page = await markStaging(new Response("<html><body><p>Hi</p></body></html>", { headers: { "content-type": "text/html; charset=utf-8" } }));
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.match(await page.text(), /TEST · staging<\/div><\/body>/);
  const api = await markStaging(Response.json({ status: "ok" }, { status: 401, headers: { "X-Storage-Routing": "1" } }));
  assert.equal(api.status, 401);
  assert.equal(api.headers.get("X-Storage-Routing"), "1");
  assert.deepEqual(await api.json(), { status: "ok" });
});

test("only live hosts, and the test server on its own address, may upgrade their database", () => {
  assert.equal(mayUpgradeFrom(null), true);
  assert.equal(mayUpgradeFrom(new Request("https://aurin.health/app")), true);
  assert.equal(mayUpgradeFrom(new Request("https://abc123-health-api.chelseafc-czsk.workers.dev/app")), false);
  assert.equal(mayUpgradeFrom(new Request("https://staging.aurin.health/app"), STAGING), true);
  assert.equal(mayUpgradeFrom(new Request("https://aurin.health/app"), STAGING), false);
  assert.equal(mayUpgradeFrom(new Request("https://staging.aurin.health/app"), config.vars), false);
});

test("the test server shares no data, background jobs or sign-in keys with the live server", () => {
  const live = config, stage = config.env.staging;
  assert.equal(stage.name, "health-api-staging");
  assert.equal(new URL(STAGING.APP_ORIGIN).hostname + "/*", stage.routes[0].pattern);
  // Its own Cloudflare account: the route sits on that account's zone, never on aurin.health.
  assert.equal(stage.routes[0].zone_name, "aurin-staging.com");
  const ids = new Set(live.d1_databases.map(d => d.database_id));
  assert.ok(stage.d1_databases.every(d => !ids.has(d.database_id) && d.database_name.includes("staging")));
  assert.equal(stage.services.find(s => s.binding === "USER_JOBS").service, "health-api-staging");
  // Bindings and vars are not inherited by a wrangler environment: each one the live server has is set here too.
  for (const key of ["r2_buckets", "services"]) assert.ok(stage[key]?.length, key);
  // The test account is on Workers Free, where Email Sending is not available.
  assert.equal(stage.send_email, undefined);
  for (const key of Object.keys(live.vars)) if (key !== "USER_DATA_SHARD_COUNT") assert.ok(key in STAGING, key);
  const workflow = readFileSync(new URL("../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
  assert.match(workflow, /for name in SESSION_SECRET CONNECTION_KEY; do/);
});

test("the server switch is offered to the owner and the internal testers only, and to everyone on the test server", () => {
  const live = { ...config.vars, INTERNAL_TESTERS: "Partner@Example.com, other@example.com" };
  assert.equal(internalTester(live, { email: "owner@example.com", isOwner: true }), true);
  assert.equal(internalTester(live, { email: "partner@example.com", isOwner: false }), true);
  assert.equal(internalTester(live, { email: "tester@example.com", isOwner: false }), false);
  assert.equal(internalTester(config.vars, { email: "partner@example.com" }), false);
  assert.equal(internalTester(live, null), false);
  assert.equal(internalTester(STAGING, { email: "tester@example.com" }), true);
});

test("the owner's address is not in the repository: the deploy passes the environment's secret", () => {
  assert.equal("OWNER_EMAIL" in config.vars, false);
  assert.equal("OWNER_EMAIL" in STAGING, false);
  assert.doesNotMatch(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"), /@gmail\.com/);
  assert.equal(config.vars.CONTACT_EMAIL, "support@aurin.health");
  const workflow = readFileSync(new URL("../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
  assert.match(workflow, /command: deploy --config wrangler\.runtime\.jsonc \$\{\{ env\.ENV_ARGS \}\} --var OWNER_EMAIL:\$\{\{ secrets\.OWNER_EMAIL \}\}/);
  // Checked before anything changes on the server.
  assert.ok(workflow.indexOf("Check the owner e-mail") < workflow.indexOf("d1 "));
});
