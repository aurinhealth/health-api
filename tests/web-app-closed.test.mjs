import test from "node:test";
import assert from "node:assert/strict";
import { closedToBrowser, webAppClosed } from "../src/web-app-closed.js";
import { sessionCookie } from "../src/dashboard-auth.js";

const env = { SESSION_SECRET: "test-session-secret" };
const BASE = "https://aurin.health";
const challenge = "a".repeat(43);
const cookie = async () => (await sessionCookie(6, Math.floor(Date.now() / 1000) + 3600, env.SESSION_SECRET)).split(";")[0];
const iPhone = { "X-Loadwise-Api": "1" };

test("the old web address /app leads to the overview page", async () => {
  for (const path of ["/app", "/app/"]) {
    const response = await closedToBrowser(new Request(BASE + path, { headers: { Cookie: await cookie() } }), env);
    assert.equal(response.status, 301, path);
    assert.equal(response.headers.get("Location"), "/", path);
  }
});

test("the browser session can neither read nor change anything", async () => {
  const Cookie = await cookie();
  const write = await closedToBrowser(new Request(BASE + "/app/api/weight", { method: "POST", headers: { Cookie, Origin: BASE, "Content-Type": "application/json" }, body: "{}" }), env);
  assert.equal(write.status, 410);
  assert.equal((await write.json()).status, "web_app_closed");
  const read = await closedToBrowser(new Request(BASE + "/app/api/today", { headers: { Cookie } }), env);
  assert.equal(read.status, 302);
  assert.equal(read.headers.get("Location"), "/");
  assert.equal((await closedToBrowser(new Request(BASE + "/sync/google", { method: "POST", headers: { Cookie } }), env)).status, 410);
});

test("browser sign-in is closed, the iPhone app's Google sheet is not", async () => {
  assert.equal((await closedToBrowser(new Request(BASE + "/auth/google"), env)).status, 302);
  assert.equal((await closedToBrowser(new Request(BASE + "/auth/google?app=short"), env)).headers.get("Location"), "/");
  assert.equal(await closedToBrowser(new Request(BASE + "/auth/google?app=" + challenge), env), null);
  assert.equal(await closedToBrowser(new Request(BASE + "/auth/google/callback?code=x&state=y"), env), null);
  for (const path of ["/auth/email/start", "/auth/email/verify", "/auth/passkey/options", "/auth/passkey/verify", "/auth/apple/callback", "/auth/app/session"]) {
    assert.equal((await closedToBrowser(new Request(BASE + path, { method: "POST", body: "{}" }), env)).status, 410, path);
  }
});

test("the iPhone app keeps working with the same session", async () => {
  const Cookie = await cookie();
  assert.equal(await closedToBrowser(new Request(BASE + "/app/api/today", { headers: { Cookie, ...iPhone } }), env), null);
  assert.equal(await closedToBrowser(new Request(BASE + "/app/api/weight", { method: "POST", headers: { Cookie, Origin: BASE, ...iPhone }, body: "{}" }), env), null);
  assert.equal(await closedToBrowser(new Request(BASE + "/auth/email/start", { method: "POST", headers: iPhone, body: "{}" }), env), null);
  assert.equal(await closedToBrowser(new Request(BASE + "/auth/app/session", { method: "POST", headers: iPhone, body: "{}" }), env), null);
});

test("connecting a service from the iPhone app still goes through the browser", async () => {
  const Cookie = await cookie();
  for (const path of ["/auth/app/connect?ticket=x", "/oauth/google?return=native", "/oauth/google/callback?code=x", "/oauth/intervals/callback?code=x"]) {
    assert.equal(await closedToBrowser(new Request(BASE + path, { headers: { Cookie } }), env), null, path);
  }
});

test("public pages, the API key, GitHub Actions and anonymous requests carry on", async () => {
  for (const path of ["/", "/privacy", "/terms", "/support", "/logo.svg"]) {
    assert.equal(await closedToBrowser(new Request(BASE + path, { headers: { Cookie: await cookie() } }), env), null, path);
  }
  assert.equal(await closedToBrowser(new Request(BASE + "/app/api/daily", { headers: { Authorization: "Bearer key" } }), env), null);
  assert.equal(await closedToBrowser(new Request(BASE + "/app/api/me"), env), null);
  assert.equal(await closedToBrowser(new Request(BASE + "/app/logout", { method: "POST", headers: { Cookie: await cookie() } }), env), null);
});

test("the wrapper passes through what is open and keeps the cron jobs", async () => {
  const calls = [];
  const app = webAppClosed({ fetch: async request => { calls.push(new URL(request.url).pathname); return new Response("app"); }, scheduled: async () => calls.push("cron") });
  assert.equal(await (await app.fetch(new Request(BASE + "/privacy"), env, {})).text(), "app");
  assert.equal((await app.fetch(new Request(BASE + "/app/api/fluids", { method: "POST", headers: { Cookie: await cookie() } }), env, {})).status, 410);
  await app.scheduled({ cron: "* * * * *" }, env, {});
  assert.deepEqual(calls, ["/privacy", "cron"]);
});
