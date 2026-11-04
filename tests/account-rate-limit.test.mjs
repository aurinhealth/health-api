import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { accountRateLimit, limiterFor } from "../src/account-rate-limit.js";
import { limitBody, SIGNED_IN_BODY_LIMIT } from "../src/body-limit.js";

const limiter = max => {
  const used = new Map();
  return { keys: used, async limit({ key }) { used.set(key, (used.get(key) || 0) + 1); return { success: used.get(key) <= max }; } };
};
const req = (path, method = "GET") => new Request("https://aurin.health" + path, { method });

test("which requests count against which limit", () => {
  assert.equal(limiterFor("/app/api/today", "GET"), "API_RATE_LIMITER");
  assert.equal(limiterFor("/app/api/sync", "POST"), "SYNC_RATE_LIMITER");
  assert.equal(limiterFor("/app/api/sync/recent", "POST"), "SYNC_RATE_LIMITER");
  assert.equal(limiterFor("/app/api/sync", "GET"), "API_RATE_LIMITER", "reading the sync state is no sync");
  assert.equal(limiterFor("/app/api/sync/activity", "POST"), "API_RATE_LIMITER", "the outbox sends activities one after another");
  assert.equal(limiterFor("/app/api/health/apple", "POST"), "APPLE_RATE_LIMITER", "a first Apple Health import has a bucket of its own");
  assert.equal(limiterFor("/app/api/health/apple", "GET"), "API_RATE_LIMITER");
  assert.equal(limiterFor("/", "GET"), null);
  assert.equal(limiterFor("/auth/email/start", "POST"), null);
});

test("an account over its limit gets 429 with Retry-After, others go on", async () => {
  const env = { API_RATE_LIMITER: limiter(2), SYNC_RATE_LIMITER: limiter(1) };
  assert.equal(await accountRateLimit(req("/app/api/today"), env, 7), null);
  assert.equal(await accountRateLimit(req("/app/api/today"), env, 7), null);
  const refused = await accountRateLimit(req("/app/api/today"), env, 7);
  assert.equal(refused.status, 429);
  assert.equal(refused.headers.get("Retry-After"), "60");
  assert.equal(await accountRateLimit(req("/app/api/today"), env, 8), null, "the limit is per account");
  assert.deepEqual([...env.API_RATE_LIMITER.keys.keys()], ["user:7", "user:8"]);
});

test("a manual sync has its own, smaller limit", async () => {
  const env = { API_RATE_LIMITER: limiter(100), SYNC_RATE_LIMITER: limiter(1) };
  assert.equal(await accountRateLimit(req("/app/api/sync", "POST"), env, 3), null);
  assert.equal((await accountRateLimit(req("/app/api/sync", "POST"), env, 3)).status, 429);
  assert.equal(await accountRateLimit(req("/app/api/today"), env, 3), null);
});

test("Apple Health uploads count only against their own limit", async () => {
  const env = { API_RATE_LIMITER: limiter(1), APPLE_RATE_LIMITER: limiter(2) };
  assert.equal(await accountRateLimit(req("/app/api/health/apple", "POST"), env, 4), null);
  assert.equal(await accountRateLimit(req("/app/api/health/apple", "POST"), env, 4), null);
  assert.equal((await accountRateLimit(req("/app/api/health/apple", "POST"), env, 4)).status, 429);
  assert.equal(await accountRateLimit(req("/app/api/today"), env, 4), null, "an import does not use up the API limit");
});

test("no binding or a failing one never stops the app", async () => {
  assert.equal(await accountRateLimit(req("/app/api/today"), {}, 3), null);
  const broken = { API_RATE_LIMITER: { limit: async () => { throw new Error("down"); } } };
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(await accountRateLimit(req("/app/api/today"), broken, 3), null); } finally { console.warn = warn; }
});

test("a signed-in request larger than the limit is refused with 413", async () => {
  const big = new Request("https://aurin.health/app/api/food/log", { method: "POST", body: "x".repeat(32), headers: { "Content-Length": String(SIGNED_IN_BODY_LIMIT + 1) } });
  assert.equal((await limitBody(big, SIGNED_IN_BODY_LIMIT)).response.status, 413);
  const photos = new Request("https://aurin.health/app/api/gym/equipment/detect", { method: "POST", body: JSON.stringify({ images: Array(8).fill("a".repeat(800_000)) }) });
  const { request, response } = await limitBody(photos, SIGNED_IN_BODY_LIMIT);
  assert.equal(response, undefined, "eight app-sized photos fit");
  assert.equal((await request.json()).images.length, 8);
});

test("both servers have the rate limit bindings", () => {
  const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
  for (const target of [config, config.env.staging]) {
    const names = (target.ratelimits || []).map(r => r.name).sort();
    assert.deepEqual(names, ["API_RATE_LIMITER", "APPLE_RATE_LIMITER", "SYNC_RATE_LIMITER"]);
  }
});

test("a stale or orphaned cookie on a public route gets the public body limit", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const stale = entry.indexOf("if (user && !sessionMatchesUser(principal, user)) { user = null; principal = null; }");
  const limited = entry.indexOf("if (!user && !publicLimited) {", stale);
  assert.ok(stale > 0 && limited > stale && limited - stale < 400, "the limit follows the stale-cookie check");
  assert.match(entry.slice(limited, limited + 200), /limitBody\(request, publicBodyLimit\(url\.pathname\)\)/);
});
