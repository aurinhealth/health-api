import test from "node:test";
import assert from "node:assert/strict";
import { handleGoogleLogin, verifyGoogleIdToken, _finishLoginForTest, _resetJwksCacheForTest } from "../src/google-login.js";
import { resolvePrincipal, isPublicPath } from "../src/dashboard-auth.js";
import { createD1 } from "./helpers/d1.mjs";
import { _resetTenancyForTest, bumpSessionEpoch } from "../src/tenancy.js";
import { readFileSync } from "node:fs";

const baseEnv = { GOOGLE_CLIENT_ID: "client-123", GOOGLE_CLIENT_SECRET: "secret", SESSION_SECRET: "test-session-secret", OWNER_EMAIL: "Owner@Example.com" };
const CHALLENGES = readFileSync(new URL("../migrations/0014_passkeys_email_codes.sql", import.meta.url), "utf8");
function freshEnv() { _resetTenancyForTest(); const DB = createD1(); DB.sqlite.exec(CHALLENGES); return { ...baseEnv, DB }; }
const env = freshEnv();
const b64 = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1" };

async function idToken(overrides = {}, key = privateKey) {
  const claims = { iss: "https://accounts.google.com", aud: "client-123", sub: "google-owner", exp: Math.floor(Date.now() / 1000) + 300, nonce: "n1", email: "owner@example.com", email_verified: true, ...overrides };
  const data = b64({ alg: "RS256", kid: "k1" }) + "." + b64(claims);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  return data + "." + Buffer.from(sig).toString("base64url");
}
function googleFetch(token) {
  return async url => String(url).includes("certs")
    ? Response.json({ keys: [jwk] })
    : Response.json(token ? { id_token: token } : { error: "invalid_grant" }, { status: token ? 200 : 400 });
}
// Google sign-in serves only the iPhone app: /auth/google?app=<43-character challenge>.
const challenge = "c".repeat(43), appCookie = "pfd_google_login=s1.n1.verifier." + challenge;
const start = (e, query = "?app=" + challenge) => handleGoogleLogin(new Request("https://aurin.health/auth/google" + query), e, "/auth/google");
const callback = (query, cookie = appCookie) => new Request("https://aurin.health/auth/google/callback?" + query, { headers: { Cookie: cookie } });

test("a client id pasted with spaces still reaches Google intact", async () => {
  const padded = { ...freshEnv(), GOOGLE_CLIENT_ID: " client-123 \n", GOOGLE_CLIENT_SECRET: " secret " };
  const response = await start(padded);
  assert.equal(new URL(response.headers.get("Location")).searchParams.get("client_id"), "client-123");
  const missing = await start({ ...padded, GOOGLE_CLIENT_ID: "   " });
  assert.equal(missing.headers.get("Location"), "https://aurin.health/auth/app/return?error=unavailable");
});

test("Google login routes are public", () => {
  assert.equal(isPublicPath("/auth/google"), true);
  assert.equal(isPublicPath("/auth/google/callback"), true);
  assert.equal(isPublicPath("/auth/app/return"), true);
});

// The app's browser sheet closes on https://aurin.health/auth/app/return, an address only
// an app with aurin.health among its associated domains can catch, on the test server too.
test("sign-in returns to aurin.health, and the return page never shows the token", async () => {
  const staging = { ...freshEnv(), APP_ORIGIN: "https://staging.aurin.health" };
  const failed = await _finishLoginForTest(new Request("https://staging.aurin.health/auth/google/callback?error=access_denied&state=s1", { headers: { Cookie: appCookie } }), staging, googleFetch());
  assert.equal(failed.headers.get("Location"), "https://aurin.health/auth/app/return?error=cancelled");
  const shown = await handleGoogleLogin(new Request("https://aurin.health/auth/app/return?token=secret-token"), env, "/auth/app/return");
  assert.equal(shown.status, 200);
  assert.equal(shown.headers.get("cache-control"), "no-store");
  assert.equal(shown.headers.get("Referrer-Policy"), "no-referrer");
  const html = await shown.text();
  assert.match(html, /aktualizuj Aurin|update Aurin/);
  assert.doesNotMatch(html, /secret-token|loadwise:/);
});

test("login start requests only identity scopes with state, nonce and PKCE", async () => {
  const response = await start(env);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin, "https://accounts.google.com");
  assert.equal(location.searchParams.get("scope"), "openid email");
  assert.equal(location.searchParams.get("redirect_uri"), "https://aurin.health/auth/google/callback");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  const [state, nonce] = response.headers.get("Set-Cookie").split(";")[0].split("=")[1].split(".");
  assert.equal(location.searchParams.get("state"), state);
  assert.equal(location.searchParams.get("nonce"), nonce);
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; SameSite=Lax/);
});

test("login is disabled without an owner", async () => {
  const response = await start({ ...env, OWNER_EMAIL: "" });
  assert.equal(response.headers.get("Location"), "https://aurin.health/auth/app/return?error=unavailable");
});

test("sessions are never signed with the owner API key", async () => {
  const response = await start({ ...env, SESSION_SECRET: "", STRENGTH_API_KEY: "owner-key" });
  assert.equal(response.headers.get("Location"), "https://aurin.health/auth/app/return?error=unavailable");
});

test("the owner's Google account is bound to their user and the callback hands off to the app, not a browser session", async () => {
  _resetJwksCacheForTest();
  const e = freshEnv();
  const response = await _finishLoginForTest(callback("code=c1&state=s1"), e, googleFetch(await idToken()));
  assert.equal(response.status, 302);
  assert.ok(!response.headers.getSetCookie().some(c => c.startsWith("pfd_session=")));
  assert.match(response.headers.get("Location"), /^https:\/\/aurin\.health\/auth\/app\/return\?token=/);
  const owner = await e.DB.prepare("SELECT id, google_sub FROM users WHERE email='owner@example.com'").first();
  assert.equal(owner.google_sub, "google-owner");
});

test("an invited account can sign in, an uninvited one cannot", async () => {
  _resetJwksCacheForTest();
  const e = freshEnv();
  const denied = await _finishLoginForTest(callback("code=c1&state=s1"), e, googleFetch(await idToken({ sub: "g2", email: "friend@example.com" })));
  assert.equal(denied.headers.get("Location"), "https://aurin.health/auth/app/return?error=not_invited");
  assert.ok(!denied.headers.getSetCookie().some(c => c.startsWith("pfd_session=")));
  await e.DB.prepare("INSERT INTO user_invites(email) VALUES ('friend@example.com')").run();
  const allowed = await _finishLoginForTest(callback("code=c1&state=s1"), e, googleFetch(await idToken({ sub: "g2", email: "Friend@Example.com" })));
  assert.match(allowed.headers.get("Location"), /\/auth\/app\/return\?token=/);
  assert.ok(await e.DB.prepare("SELECT id FROM users WHERE email='friend@example.com' AND role='user'").first());
});

test("state mismatch is rejected before contacting Google", async () => {
  let called = false;
  const response = await _finishLoginForTest(callback("code=c1&state=other"), env, async () => { called = true; });
  assert.equal(response.headers.get("Location"), "https://aurin.health/auth/app/return?error=expired");
  assert.equal(called, false);
});

test("ID token checks reject forged or mismatched tokens", async () => {
  _resetJwksCacheForTest();
  const f = googleFetch();
  const other = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])).privateKey;
  await assert.rejects(verifyGoogleIdToken(await idToken({}, other), "client-123", "n1", f), /signature/);
  await assert.rejects(verifyGoogleIdToken(await idToken({ aud: "someone-else" }), "client-123", "n1", f), /audience/);
  await assert.rejects(verifyGoogleIdToken(await idToken({ iss: "https://evil.example" }), "client-123", "n1", f), /issuer/);
  await assert.rejects(verifyGoogleIdToken(await idToken({ exp: 1 }), "client-123", "n1", f), /Expired/);
  await assert.rejects(verifyGoogleIdToken(await idToken({ nonce: "other" }), "client-123", "n1", f), /nonce/);
  await assert.rejects(verifyGoogleIdToken(await idToken({ email_verified: false }), "client-123", "n1", f), /verified/);
  await assert.rejects(verifyGoogleIdToken(await idToken({ sub: "" }), "client-123", "n1", f), /subject/);
  assert.equal((await verifyGoogleIdToken(await idToken(), "client-123", "n1", f)).email, "owner@example.com");
});

// The iPhone app signs in through Safari and redeems a short-lived token in its
// own web view, where only it knows the verifier behind the challenge.
test("the iPhone app signs in through Safari and redeems the token with its verifier", async () => {
  _resetJwksCacheForTest();
  const e = freshEnv();
  const verifier = "v".repeat(43), challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  const begin = await start(e, "?app=" + challenge);
  const cookie = begin.headers.get("Set-Cookie").split(";")[0];
  assert.equal(cookie.split("=")[1].split(".")[3], challenge);
  const state = new URL(begin.headers.get("Location")).searchParams.get("state"), nonce = cookie.split("=")[1].split(".")[1];
  const back = await _finishLoginForTest(callback("code=c1&state=" + state, cookie), e, googleFetch(await idToken({ nonce })));
  assert.equal(back.status, 302);
  assert.ok(!back.headers.getSetCookie().some(c => c.startsWith("pfd_session=")), "Safari gets no session");
  const returned = new URL(back.headers.get("Location"));
  assert.equal(returned.origin + returned.pathname, "https://aurin.health/auth/app/return");
  assert.equal(back.headers.get("Referrer-Policy"), "no-referrer");
  const token = returned.searchParams.get("token");
  const redeem = (body, headers = {}) => handleGoogleLogin(new Request("https://aurin.health/auth/app/session", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }), e, "/auth/app/session");
  assert.equal((await redeem({ token, verifier: "w".repeat(43) })).status, 401);
  assert.equal((await redeem({ token: token.replace(/.$/, c => c === "A" ? "B" : "A"), verifier })).status, 401);
  assert.equal((await redeem({ token, verifier }, { Origin: "https://evil.example" })).status, 401);
  const ok = await redeem({ token, verifier });
  assert.equal(ok.status, 200);
  const session = ok.headers.getSetCookie().find(c => c.startsWith("pfd_session=")).split(";")[0];
  const principal = await resolvePrincipal(new Request("https://aurin.health/app/api/daily", { headers: { Cookie: session } }), e, async () => { throw new Error("no"); });
  const owner = await e.DB.prepare("SELECT id FROM users WHERE email='owner@example.com'").first();
  assert.deepEqual(principal, { kind: "user", userId: owner.id, epoch: 0 });
  assert.equal(isPublicPath("/auth/app/session"), true);
  assert.equal((await redeem({ token, verifier })).status, 401, "a token works once");
});

test("a handoff token issued before signing out everywhere no longer signs in", async () => {
  _resetJwksCacheForTest();
  const e = freshEnv();
  const verifier = "v".repeat(43), challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  const handoff = async () => {
    const begin = await start(e, "?app=" + challenge);
    const cookie = begin.headers.get("Set-Cookie").split(";")[0];
    const state = new URL(begin.headers.get("Location")).searchParams.get("state"), nonce = cookie.split("=")[1].split(".")[1];
    const back = await _finishLoginForTest(callback("code=c1&state=" + state, cookie), e, googleFetch(await idToken({ nonce })));
    return new URL(back.headers.get("Location")).searchParams.get("token");
  };
  const redeem = token => handleGoogleLogin(new Request("https://aurin.health/auth/app/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, verifier }) }), e, "/auth/app/session");
  const stale = await handoff();
  const owner = await e.DB.prepare("SELECT id FROM users WHERE email='owner@example.com'").first();
  assert.equal(await bumpSessionEpoch(e.DB, owner.id), 1);
  assert.equal((await redeem(stale)).status, 401);
  // A token issued after it still works, with the new epoch.
  const ok = await redeem(await handoff());
  assert.equal(ok.status, 200);
  const session = ok.headers.getSetCookie().find(c => c.startsWith("pfd_session=")).split(";")[0];
  const principal = await resolvePrincipal(new Request("https://aurin.health/app/api/daily", { headers: { Cookie: session } }), e, async () => { throw new Error("no"); });
  assert.deepEqual(principal, { kind: "user", userId: owner.id, epoch: 1 });
});

test("a handoff token is not a session and sign-in without a valid app challenge is refused", async () => {
  for (const query of ["", "?app=short"]) {
    const refused = await start(env, query);
    assert.equal(refused.status, 400);
    assert.match(refused.headers.get("content-type"), /text\/html/);
    assert.equal(refused.headers.get("Set-Cookie"), null);
  }
  const form = await handleGoogleLogin(new Request("https://aurin.health/auth/app/session", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "token=x&verifier=y" }), env, "/auth/app/session");
  assert.equal(form.status, 401);
});

// A failed sign-in started by the app goes back to it, so its browser sheet
// closes and the app can say why; a callback without the app's challenge gets an HTML page.
test("a failed app sign-in returns to the app with an error code", async () => {
  _resetJwksCacheForTest();
  const e = freshEnv();
  const back = response => {
    assert.equal(response.status, 302);
    assert.match(response.headers.getSetCookie().join("\n"), /pfd_google_login=; Max-Age=0/);
    assert.ok(!response.headers.getSetCookie().some(c => c.startsWith("pfd_session=")));
    return response.headers.get("Location");
  };
  assert.equal(back(await _finishLoginForTest(callback("code=c1&state=s1", appCookie), e, googleFetch(await idToken({ sub: "g9", email: "stranger@example.com" })))), "https://aurin.health/auth/app/return?error=not_invited");
  assert.equal(back(await _finishLoginForTest(callback("error=access_denied&state=s1", appCookie), e, googleFetch())), "https://aurin.health/auth/app/return?error=cancelled");
  assert.equal(back(await _finishLoginForTest(callback("code=c1&state=other", appCookie), e, googleFetch())), "https://aurin.health/auth/app/return?error=expired");
  assert.equal(back(await _finishLoginForTest(callback("code=c1&state=s1", appCookie), e, googleFetch())), "https://aurin.health/auth/app/return?error=failed");
  assert.equal(back(await _finishLoginForTest(callback("code=c1&state=s1", appCookie), e, googleFetch(await idToken({ nonce: "other" })))), "https://aurin.health/auth/app/return?error=failed");
  assert.equal(back(await start({ ...e, OWNER_EMAIL: "" })), "https://aurin.health/auth/app/return?error=unavailable");

  let called = false;
  const web = await _finishLoginForTest(callback("code=c1&state=s1", "pfd_google_login=s1.n1.verifier"), e, async () => { called = true; });
  assert.equal(web.status, 400);
  assert.match(web.headers.get("content-type"), /text\/html/);
  assert.equal(called, false);
  assert.ok(!web.headers.getSetCookie().some(c => c.startsWith("pfd_session=")));
  assert.equal((await _finishLoginForTest(callback("error=access_denied&state=s1", "pfd_google_login=s1.n1.verifier"), e, googleFetch())).status, 400);
});

test("a token signed with a key Google rotated in fetches the keys again, at most once a minute", async () => {
  _resetJwksCacheForTest();
  const rotated = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const newJwk = { ...(await crypto.subtle.exportKey("jwk", rotated.publicKey)), kid: "k2" };
  const claims = { iss: "https://accounts.google.com", aud: "client-123", sub: "google-owner", exp: Math.floor(Date.now() / 1000) + 300, nonce: "n1", email: "owner@example.com", email_verified: true };
  const data = b64({ alg: "RS256", kid: "k2" }) + "." + b64(claims);
  const token = data + "." + Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rotated.privateKey, new TextEncoder().encode(data))).toString("base64url");
  const fetches = [];
  const fetchImpl = async (url, init) => { fetches.push(init); return Response.json({ keys: fetches.length === 1 ? [jwk] : [jwk, newJwk] }); };
  assert.equal((await verifyGoogleIdToken(await idToken(), "client-123", "n1", fetchImpl)).sub, "google-owner");
  assert.equal((await verifyGoogleIdToken(token, "client-123", "n1", fetchImpl)).sub, "google-owner");
  assert.equal(fetches.length, 2);
  assert.deepEqual(fetches[1], { cache: "no-store" });
  const unknown = b64({ alg: "RS256", kid: "k3" }) + "." + b64(claims) + "." + b64("x");
  await assert.rejects(verifyGoogleIdToken(unknown, "client-123", "n1", fetchImpl), /Signing key not found/);
  assert.equal(fetches.length, 2, "no second forced fetch within a minute");
});
