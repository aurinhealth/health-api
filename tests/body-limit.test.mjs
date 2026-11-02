// What a caller who is not signed in may send (src/body-limit.js, security review 2026-11-02, SEC-013).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { _resetTenancyForTest } from "../src/tenancy.js";
import { limitBody, publicBodyLimit, PUBLIC_BODY_LIMIT, WEBHOOK_BODY_LIMIT } from "../src/body-limit.js";
import worker from "../src/entrypoint.js";

const post = (body, headers = {}) => new Request("https://aurin.health/auth/email/start", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
// A body sent in chunks without Content-Length, as a client may stream it.
const streamed = (size, chunk = 16 * 1024) => new Request("https://aurin.health/waitlist", { method: "POST", duplex: "half", body: new ReadableStream({
  start(controller) { for (let sent = 0; sent < size; sent += chunk) controller.enqueue(new Uint8Array(Math.min(chunk, size - sent)).fill(32)); controller.close(); }
}) });

test("a body within the limit reaches the route whole", async () => {
  const { request, response } = await limitBody(post(JSON.stringify({ email: "a@x.cz" }), { "CF-Connecting-IP": "203.0.113.5" }), 1024);
  assert.equal(response, undefined);
  assert.deepEqual(await request.json(), { email: "a@x.cz" });
  assert.equal(request.headers.get("CF-Connecting-IP"), "203.0.113.5");
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://aurin.health/auth/email/start");
});

test("a larger body gets 413, by its declared length or by counting", async () => {
  const declared = await limitBody(post("x".repeat(2048)), 1024);
  assert.equal(declared.response.status, 413);
  assert.equal(declared.request, undefined);
  // No Content-Length: the bytes are counted and reading stops past the limit.
  const counted = await limitBody(streamed(PUBLIC_BODY_LIMIT + 1), PUBLIC_BODY_LIMIT);
  assert.equal(counted.response.status, 413);
  const fits = await limitBody(streamed(PUBLIC_BODY_LIMIT), PUBLIC_BODY_LIMIT);
  assert.equal((await fits.request.arrayBuffer()).byteLength, PUBLIC_BODY_LIMIT);
});

test("a request without a body passes untouched", async () => {
  const get = new Request("https://aurin.health/auth/google?app=1");
  assert.equal((await limitBody(get, 10)).request, get);
});

test("webhooks may send more than the sign-in routes", () => {
  assert.equal(publicBodyLimit("/auth/email/start"), PUBLIC_BODY_LIMIT);
  assert.equal(publicBodyLimit("/waitlist"), PUBLIC_BODY_LIMIT);
  assert.equal(publicBodyLimit("/webhooks/app-store"), WEBHOOK_BODY_LIMIT);
  assert.ok(PUBLIC_BODY_LIMIT === 64 * 1024 && WEBHOOK_BODY_LIMIT === 1024 * 1024);
});

test("the Worker answers 413 to a large body on a public route before the route reads it", async () => {
  _resetTenancyForTest();
  const env = { DB: createD1(), OWNER_EMAIL: "owner@example.com", CONNECTION_KEY: "k".repeat(40), SESSION_SECRET: "s".repeat(40), TURNSTILE_SECRET_KEY: "secret" };
  env.DB.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const big = JSON.stringify({ email: "a@x.cz", token: "t", pad: "x".repeat(PUBLIC_BODY_LIMIT) });
  for (const path of ["/waitlist", "/auth/email/start", "/auth/app/apple", "/auth/passkey/verify"]) {
    const response = await worker.fetch(new Request("https://aurin.health" + path, { method: "POST", headers: { Origin: "https://aurin.health", "Content-Type": "application/json" }, body: big }), env, { waitUntil() {} });
    assert.equal(response.status, 413, path);
  }
  // Nothing was counted or stored for them.
  assert.equal(env.DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('testflight_waitlist', 'request_limits')").all().length, 0);
  // A webhook gets its larger limit: 200 kB is read and goes on to the route.
  const hook = await worker.fetch(new Request("https://aurin.health/webhooks/intervals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: "no", pad: "x".repeat(200 * 1024) }) }), env, { waitUntil() {} });
  assert.equal(hook.status, 401);
});
