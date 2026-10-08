import test from "node:test";
import assert from "node:assert/strict";
import { handleGoogleLogin, verifyGoogleIdToken, _finishLoginForTest, _resetJwksCacheForTest } from "../src/google-login.js";
import { resolvePrincipal, isPublicPath } from "../src/dashboard-auth.js";
import { createD1 } from "./helpers/d1.mjs";
import { _resetTenancyForTest } from "../src/tenancy.js";

const baseEnv = { GOOGLE_CLIENT_ID: "client-123", GOOGLE_CLIENT_SECRET: "secret", SESSION_SECRET: "test-session-secret", OWNER_EMAIL: "Owner@Example.com" };
function freshEnv() { _resetTenancyForTest(); return { ...baseEnv, DB: createD1() }; }
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
const callback = (query, cookie = "pfd_google_login=s1.n1.verifier") => new Request("https://petrfitnessdata.eu/auth/google/callback?" + query, { headers: { Cookie: cookie } });

test("a client id pasted with spaces still reaches Google intact", async () => {
  const padded = { ...freshEnv(), GOOGLE_CLIENT_ID: " client-123 \n", GOOGLE_CLIENT_SECRET: " secret " };
  const response = await handleGoogleLogin(new Request("https://petrfitnessdata.eu/auth/google"), padded, "/auth/google");
  assert.equal(new URL(response.headers.get("Location")).searchParams.get("client_id"), "client-123");
  const missing = await handleGoogleLogin(new Request("https://petrfitnessdata.eu/auth/google"), { ...padded, GOOGLE_CLIENT_ID: "   " }, "/auth/google");
  assert.equal(missing.status, 503);
});

test("Google login routes are public", () => {
  assert.equal(isPublicPath("/auth/google"), true);
  assert.equal(isPublicPath("/auth/google/callback"), true);
});

test("login start requests only identity scopes with state, nonce and PKCE", async () => {
  const response = await handleGoogleLogin(new Request("https://petrfitnessdata.eu/auth/google"), env, "/auth/google");
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin, "https://accounts.google.com");
  assert.equal(location.searchParams.get("scope"), "openid email");
  assert.equal(location.searchParams.get("redirect_uri"), "https://petrfitnessdata.eu/auth/google/callback");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  const [state, nonce] = response.headers.get("Set-Cookie").split(";")[0].split("=")[1].split(".");
  assert.equal(location.searchParams.get("state"), state);
  assert.equal(location.searchParams.get("nonce"), nonce);
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; SameSite=Lax/);
});

test("login is disabled without an owner", async () => {
  const response = await handleGoogleLogin(new Request("https://petrfitnessdata.eu/auth/google"), { ...env, OWNER_EMAIL: "" }, "/auth/google");
  assert.equal(response.status, 503);
});

test("sessions are never signed with the owner API key", async () => {
  const response = await handleGoogleLogin(new Request("https://petrfitnessdata.eu/auth/google"), { ...env, SESSION_SECRET: "", STRENGTH_API_KEY: "owner-key" }, "/auth/google");
  assert.equal(response.status, 503);
});

test("the owner's Google account gets a session bound to their user", async () => {
  _resetJwksCacheForTest();
  const e = freshEnv();
  const response = await _finishLoginForTest(callback("code=c1&state=s1"), e, googleFetch(await idToken()));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/app");
  const session = response.headers.getSetCookie().find(c => c.startsWith("pfd_session=")).split(";")[0];
  const request = new Request("https://petrfitnessdata.eu/app/api/daily", { headers: { Cookie: session } });
  const principal = await resolvePrincipal(request, e, async () => { throw new Error("no"); });
  const owner = await e.DB.prepare("SELECT id, google_sub FROM users WHERE email='owner@example.com'").first();
  assert.deepEqual(principal, { kind: "user", userId: owner.id });
  assert.equal(owner.google_sub, "google-owner");
});

test("an invited account can sign in, an uninvited one cannot", async () => {
  _resetJwksCacheForTest();
  const e = freshEnv();
  const denied = await _finishLoginForTest(callback("code=c1&state=s1"), e, googleFetch(await idToken({ sub: "g2", email: "friend@example.com" })));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Set-Cookie"), null);
  await e.DB.prepare("INSERT INTO user_invites(email) VALUES ('friend@example.com')").run();
  const allowed = await _finishLoginForTest(callback("code=c1&state=s1"), e, googleFetch(await idToken({ sub: "g2", email: "Friend@Example.com" })));
  assert.equal(allowed.status, 302);
  assert.ok(await e.DB.prepare("SELECT id FROM users WHERE email='friend@example.com' AND role='user'").first());
});

test("state mismatch is rejected before contacting Google", async () => {
  let called = false;
  const response = await _finishLoginForTest(callback("code=c1&state=other"), env, async () => { called = true; });
  assert.equal(response.status, 400);
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
  const start = await handleGoogleLogin(new Request("https://petrfitnessdata.eu/auth/google?app=" + challenge), e, "/auth/google");
  const cookie = start.headers.get("Set-Cookie").split(";")[0];
  assert.equal(cookie.split("=")[1].split(".")[3], challenge);
  const state = new URL(start.headers.get("Location")).searchParams.get("state"), nonce = cookie.split("=")[1].split(".")[1];
  const back = await _finishLoginForTest(callback("code=c1&state=" + state, cookie), e, googleFetch(await idToken({ nonce })));
  assert.equal(back.status, 200);
  assert.ok(!back.headers.getSetCookie().some(c => c.startsWith("pfd_session=")), "Safari gets no session");
  const token = decodeURIComponent((await back.text()).match(/loadwise:\/\/auth\?token=([^"]+)"/)[1]);
  const redeem = (body, headers = {}) => handleGoogleLogin(new Request("https://petrfitnessdata.eu/auth/app/session", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }), e, "/auth/app/session");
  assert.equal((await redeem({ token, verifier: "w".repeat(43) })).status, 401);
  assert.equal((await redeem({ token: token.replace(/.$/, c => c === "A" ? "B" : "A"), verifier })).status, 401);
  assert.equal((await redeem({ token, verifier }, { Origin: "https://evil.example" })).status, 401);
  const ok = await redeem({ token, verifier });
  assert.equal(ok.status, 200);
  const session = ok.headers.getSetCookie().find(c => c.startsWith("pfd_session=")).split(";")[0];
  const principal = await resolvePrincipal(new Request("https://petrfitnessdata.eu/app/api/daily", { headers: { Cookie: session } }), e, async () => { throw new Error("no"); });
  const owner = await e.DB.prepare("SELECT id FROM users WHERE email='owner@example.com'").first();
  assert.deepEqual(principal, { kind: "user", userId: owner.id });
  assert.equal(isPublicPath("/auth/app/session"), true);
});

test("a handoff token is not a session and an invalid app challenge is ignored", async () => {
  const start = await handleGoogleLogin(new Request("https://petrfitnessdata.eu/auth/google?app=short"), env, "/auth/google");
  assert.equal(start.headers.get("Set-Cookie").split(";")[0].split("=")[1].split(".")[3], "");
  const form = await handleGoogleLogin(new Request("https://petrfitnessdata.eu/auth/app/session", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "token=x&verifier=y" }), env, "/auth/app/session");
  assert.equal(form.status, 401);
});
