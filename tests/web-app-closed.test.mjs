import test from "node:test";
import assert from "node:assert/strict";
import { closedToBrowser, webAppClosed } from "../src/web-app-closed.js";
import { sessionCookie } from "../src/dashboard-auth.js";

const env = { SESSION_SECRET: "test-session-secret" };
const BASE = "https://aurin.health";
const challenge = "a".repeat(43);
const cookie = async () => (await sessionCookie(6, Math.floor(Date.now() / 1000) + 3600, env.SESSION_SECRET)).split(";")[0];
const iPhone = { "X-Aurin-Api": "1" };

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
  assert.equal(await closedToBrowser(new Request(BASE + "/auth/app/return?error=cancelled"), env), null);
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
  for (const path of ["/auth/app/connect?ticket=x", "/oauth/google?return=app", "/oauth/google/callback?code=x", "/oauth/intervals/callback?code=x"]) {
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

test("the owner's overview and its passkey sign-in open only with Cloudflare Access's token for the owner", async () => {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "owner-k" };
  const b64 = v => Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = async claims => { const data = b64({ alg: "RS256", kid: "owner-k" }) + "." + b64(claims); return data + "." + Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(data))).toString("base64url"); };
  const live = { ...env, OWNER_EMAIL: "owner@example.com", ACCESS_TEAM_DOMAIN: "owner-team.cloudflareaccess.com", ACCESS_AUD: "aud-owner" };
  const claims = { iss: "https://owner-team.cloudflareaccess.com", aud: ["aud-owner"], email: "owner@example.com", exp: Math.floor(Date.now() / 1000) + 60 };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  try {
    const owner = "CF_Authorization=" + await token(claims), stranger = "CF_Authorization=" + await token({ ...claims, email: "someone@example.com" });
    const session = await cookie();
    const post = (path, Cookie) => new Request(BASE + path, { method: "POST", headers: { Cookie, Origin: BASE, "Content-Type": "application/json" }, body: "{}" });
    for (const path of ["/auth/passkey/options", "/auth/passkey/verify"]) {
      assert.equal(await closedToBrowser(post(path, owner), live), null, path);
      assert.equal((await closedToBrowser(post(path, stranger), live)).status, 410, path + " for another e-mail");
      assert.equal((await closedToBrowser(post(path, owner), env)).status, 410, path + " without Access set up");
    }
    for (const path of ["/app/owner", "/app/owner/data"]) {
      assert.equal(await closedToBrowser(new Request(BASE + path, { headers: { Cookie: session + "; " + owner } }), live), null, path);
      assert.equal((await closedToBrowser(new Request(BASE + path, { headers: { Cookie: session + "; " + stranger } }), live)).status, 302, path + " for another e-mail");
    }
    // The header Access adds inside /app/owner counts the same.
    assert.equal(await closedToBrowser(new Request(BASE + "/app/owner/data", { headers: { Cookie: session, "Cf-Access-Jwt-Assertion": await token(claims) } }), live), null);
    // Nothing else opens with it.
    assert.equal((await closedToBrowser(post("/auth/email/start", owner), live)).status, 410);
    assert.equal((await closedToBrowser(new Request(BASE + "/app/api/today", { headers: { Cookie: session + "; " + owner } }), live)).status, 302);
  } finally { globalThis.fetch = realFetch; }
});
