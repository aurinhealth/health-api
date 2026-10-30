import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { handleNativeAppleLogin, revokeApple, appleClientSecret, verifyAppleIdToken, _resetAppleJwksCacheForTest } from "../src/apple-login.js";
import { isPublicPath } from "../src/dashboard-auth.js";
import { ensureTenancy, _resetTenancyForTest } from "../src/tenancy.js";

const b64 = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const ec = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pem = "-----BEGIN PRIVATE KEY-----\n" + Buffer.from(await crypto.subtle.exportKey("pkcs8", ec.privateKey)).toString("base64").replace(/(.{64})/g, "$1\n") + "\n-----END PRIVATE KEY-----";
const rsa = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", rsa.publicKey)), kid: "apple-1" };
const apple = { APPLE_CLIENT_ID: "eu.petrfitnessdata.web", APPLE_TEAM_ID: "TEAM123456", APPLE_KEY_ID: "KEY1234567", APPLE_PRIVATE_KEY: pem, SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com" };
function freshEnv(extra = {}) { _resetTenancyForTest(); _resetAppleJwksCacheForTest(); return { ...apple, DB: createD1(), ...extra }; }
// With the users and invitations tables (the owner included).
async function withUsers(extra) { const env = freshEnv(extra); await ensureTenancy(env.DB, env); return env; }

async function idToken(claims = {}) {
  const body = { iss: "https://appleid.apple.com", aud: apple.APPLE_CLIENT_ID, sub: "apple-friend", exp: Math.floor(Date.now() / 1000) + 300, email: "friend@example.com", email_verified: "true", ...claims };
  const data = b64({ alg: "RS256", kid: "apple-1" }) + "." + b64(body);
  return data + "." + Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rsa.privateKey, new TextEncoder().encode(data))).toString("base64url");
}
// Apple's token endpoint and keys; remembers what the token request carried.
function appleFetch(claims, seen = {}) {
  return async (url, init) => {
    if (String(url).endsWith("/auth/keys")) return Response.json({ keys: [jwk] });
    seen.body = new URLSearchParams(String(init.body));
    return Response.json({ id_token: await idToken({ nonce: seen.nonce, ...claims }) });
  };
}
const sessionOf = response => (response.headers.getSetCookie().find(c => c.startsWith("pfd_session=")) || "").split(";")[0];



test("the client secret is an ES256 JWT for Apple, signed with the .p8 key", async () => {
  const jwt = await appleClientSecret({ ...apple, APPLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n") }, 1_800_000_000);
  const [h, p, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "ES256", kid: "KEY1234567" });
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url")), { iss: "TEAM123456", iat: 1_800_000_000, exp: 1_800_000_300, aud: "https://appleid.apple.com", sub: "health.aurin.app" });
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, ec.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(h + "." + p)));
});






// The iPhone app: the token's audience is the bundle ID and its nonce the SHA-256 (hex) of the app's nonce.
const APP_NONCE = "app-nonce-0123456789abcdef";
const hex = async text => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("hex");
function nativeFetch(claims, seen = {}) {
  return async (url, init) => {
    if (String(url).endsWith("/auth/keys")) return Response.json({ keys: [jwk] });
    seen.calls = [...(seen.calls || []), { url: String(url), body: new URLSearchParams(String(init.body)) }];
    return Response.json({ refresh_token: "apple-refresh-1", ...claims });
  };
}
async function nativeRequest(env, body, { fetchImpl, saveRefreshToken, headers = { "Content-Type": "application/json" } } = {}) {
  const request = new Request("https://aurin.health/auth/app/apple", { method: "POST", headers, body: JSON.stringify(body) });
  return handleNativeAppleLogin(request, env, "/auth/app/apple", { fetchImpl, saveRefreshToken });
}

test("the app signs in with Apple natively and keeps the token that deleting the account revokes", async () => {
  assert.equal(isPublicPath("/auth/app/apple"), true);
  const env = await withUsers();
  await env.DB.prepare("INSERT INTO user_invites(email) VALUES ('friend@example.com')").run();
  const token = await idToken({ aud: "health.aurin.app", nonce: await hex(APP_NONCE) });
  const seen = {}, saved = [];
  const ok = await nativeRequest(env, { identityToken: token, authorizationCode: "code-1", nonce: APP_NONCE, name: "Jana  Nová" }, { fetchImpl: nativeFetch({}, seen), saveRefreshToken: async (user, value) => saved.push([user.email, value]) });
  assert.equal(ok.status, 200);
  assert.ok(sessionOf(ok));
  assert.equal((await env.DB.prepare("SELECT name FROM users WHERE email='friend@example.com'").first()).name, "Jana Nová");
  assert.deepEqual(saved, [["friend@example.com", "apple-refresh-1"]]);
  const exchange = seen.calls.find(c => c.url.endsWith("/auth/token")).body;
  assert.equal(exchange.get("client_id"), "health.aurin.app");
  assert.equal(exchange.get("code"), "code-1");
  const sub = JSON.parse(Buffer.from(exchange.get("client_secret").split(".")[1], "base64url")).sub;
  assert.equal(sub, "health.aurin.app");

  const revoked = {};
  assert.equal(await revokeApple({ ...apple, APPLE_REFRESH_TOKEN: "apple-refresh-1" }, nativeFetch({}, revoked)), "revoked");
  assert.equal(revoked.calls[0].url, "https://appleid.apple.com/auth/revoke");
  assert.equal(revoked.calls[0].body.get("token"), "apple-refresh-1");
  assert.equal(await revokeApple({ ...apple }), "none");
});

test("a token the Loadwise app got is revoked as that app", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = new URLSearchParams(String(init.body));
    calls.push(body.get("client_id"));
    return body.get("client_id") === "eu.petrfitnessdata.loadwise.native" ? new Response("") : Response.json({ error: "invalid_grant" }, { status: 400 });
  };
  assert.equal(await revokeApple({ ...apple, APPLE_REFRESH_TOKEN: "legacy-refresh" }, fetchImpl), "revoked");
  assert.deepEqual(calls, ["health.aurin.app", "eu.petrfitnessdata.loadwise.native"]);
  const refused = async () => Response.json({ error: "invalid_grant" }, { status: 400 });
  assert.equal(await revokeApple({ ...apple, APPLE_REFRESH_TOKEN: "unknown" }, refused), "failed");
});

test("the old Loadwise app no longer signs in with Apple", async () => {
  const env = await withUsers();
  const token = await idToken({ aud: "eu.petrfitnessdata.loadwise.native", nonce: await hex(APP_NONCE) });
  const refused = await nativeRequest(env, { identityToken: token, authorizationCode: "code-2", nonce: APP_NONCE }, { fetchImpl: nativeFetch({}), saveRefreshToken: async () => {} });
  assert.equal(refused.status, 401);
});

test("the app's Apple sign-in refuses a web token, a wrong nonce, a form post and an uninvited e-mail", async () => {
  const env = await withUsers();
  const fetchImpl = nativeFetch({});
  const web = await idToken({ nonce: await hex(APP_NONCE) });
  assert.equal((await nativeRequest(env, { identityToken: web, nonce: APP_NONCE }, { fetchImpl })).status, 401);
  const app = await idToken({ aud: "health.aurin.app", nonce: await hex(APP_NONCE) });
  assert.equal((await nativeRequest(env, { identityToken: app, nonce: APP_NONCE + "x" }, { fetchImpl })).status, 401);
  assert.equal((await nativeRequest(env, { identityToken: app, nonce: APP_NONCE }, { fetchImpl, headers: { "Content-Type": "text/plain" } })).status, 415);
  const denied = await nativeRequest(env, { identityToken: app, nonce: APP_NONCE }, { fetchImpl });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error, "not_invited");
  // OPEN_SIGNUP: anyone Apple vouches for gets an account.
  const open = await nativeRequest({ ...env, OPEN_SIGNUP: "true" }, { identityToken: app, nonce: APP_NONCE }, { fetchImpl });
  assert.equal(open.status, 200);
  assert.ok(await env.DB.prepare("SELECT id FROM users WHERE email='friend@example.com'").first());
});

test("a token signed with a key Apple rotated in fetches the keys again, at most once a minute", async () => {
  _resetAppleJwksCacheForTest();
  const rotated = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const newJwk = { ...(await crypto.subtle.exportKey("jwk", rotated.publicKey)), kid: "apple-2" };
  const body = { iss: "https://appleid.apple.com", aud: apple.APPLE_CLIENT_ID, sub: "apple-friend", exp: Math.floor(Date.now() / 1000) + 300, nonce: "n1" };
  const data = b64({ alg: "RS256", kid: "apple-2" }) + "." + b64(body);
  const token = data + "." + Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rotated.privateKey, new TextEncoder().encode(data))).toString("base64url");
  // The key appears only on the second fetch; the first fetch is cached from an old token's check.
  const fetches = [];
  const fetchImpl = async (url, init) => { fetches.push(init); return Response.json({ keys: fetches.length === 1 ? [jwk] : [jwk, newJwk] }); };
  assert.equal((await verifyAppleIdToken(await idToken({ nonce: "n1" }), apple.APPLE_CLIENT_ID, "n1", fetchImpl)).sub, "apple-friend");
  assert.equal((await verifyAppleIdToken(token, apple.APPLE_CLIENT_ID, "n1", fetchImpl)).sub, "apple-friend");
  assert.equal(fetches.length, 2);
  assert.deepEqual(fetches[1], { cache: "no-store" }, "the forced fetch goes past the cache");
  // A third unknown key within the minute does not fetch again.
  const unknown = b64({ alg: "RS256", kid: "apple-3" }) + "." + b64(body) + "." + b64("x");
  await assert.rejects(verifyAppleIdToken(unknown, apple.APPLE_CLIENT_ID, "n1", fetchImpl), /Signing key not found/);
  assert.equal(fetches.length, 2);
});
