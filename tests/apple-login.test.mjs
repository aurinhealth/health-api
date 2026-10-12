import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { handleAppleLogin, handleNativeAppleLogin, revokeApple, appleConfigured, appleClientSecret, appleIdentity, unlinkAppleIdentity, verifyAppleIdToken, _resetAppleJwksCacheForTest } from "../src/apple-login.js";
import { isPublicPath, resolvePrincipal } from "../src/dashboard-auth.js";
import { ensureTenancy, scopedDb, _resetTenancyForTest } from "../src/tenancy.js";
import { deleteAccount } from "../src/account-data.js";

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
// Starts a sign-in and returns what Apple would POST back, with the state cookie.
async function start(env, { path = "/auth/apple", user = null } = {}) {
  const response = await handleAppleLogin(new Request("https://petrfitnessdata.eu" + path), env, "/auth/apple", { user });
  const location = new URL(response.headers.get("Location"));
  return { response, location, cookie: response.headers.get("Set-Cookie").split(";")[0], state: location.searchParams.get("state"), nonce: location.searchParams.get("nonce") };
}
function callback(env, { cookie, state }, fields, fetchImpl) {
  const body = new URLSearchParams({ code: "c1", state, ...fields });
  return handleAppleLogin(new Request("https://petrfitnessdata.eu/auth/apple/callback", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body }), env, "/auth/apple/callback", { fetchImpl });
}
const sessionOf = response => (response.headers.getSetCookie().find(c => c.startsWith("pfd_session=")) || "").split(";")[0];

test("Apple sign-in stays off until its keys are set", async () => {
  assert.equal(appleConfigured({}), false);
  assert.equal(appleConfigured(apple), true);
  assert.equal(isPublicPath("/auth/apple"), true);
  assert.equal(isPublicPath("/auth/apple/callback"), true);
  const response = await handleAppleLogin(new Request("https://petrfitnessdata.eu/auth/apple"), { SESSION_SECRET: "k", OWNER_EMAIL: "o@example.com", DB: createD1() }, "/auth/apple");
  assert.equal(response.status, 503);
});

test("sign-in goes to Apple with a form_post answer, state and nonce", async () => {
  const env = freshEnv();
  const { response, location, cookie } = await start(env);
  assert.equal(response.status, 302);
  assert.equal(location.origin + location.pathname, "https://appleid.apple.com/auth/authorize");
  assert.match(response.headers.get("Location"), /scope=name%20email/);
  assert.equal(location.searchParams.get("response_mode"), "form_post");
  assert.equal(location.searchParams.get("redirect_uri"), "https://petrfitnessdata.eu/auth/apple/callback");
  assert.ok(location.searchParams.get("state") && location.searchParams.get("nonce"));
  // Apple's answer is a cross-site POST, so the state cookie must travel with it.
  assert.match(response.headers.get("Set-Cookie"), /Path=\/auth\/apple; Secure; HttpOnly; SameSite=None$/);
  assert.ok(cookie.includes(location.searchParams.get("state")));
  const staging = await start(freshEnv({ APP_ORIGIN: "https://staging.petrfitnessdata.eu" }));
  assert.equal(staging.location.searchParams.get("redirect_uri"), "https://staging.petrfitnessdata.eu/auth/apple/callback");
});

test("the client secret is an ES256 JWT for Apple, signed with the .p8 key", async () => {
  const jwt = await appleClientSecret({ ...apple, APPLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n") }, 1_800_000_000);
  const [h, p, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "ES256", kid: "KEY1234567" });
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url")), { iss: "TEAM123456", iat: 1_800_000_000, exp: 1_800_000_300, aud: "https://appleid.apple.com", sub: "eu.petrfitnessdata.web" });
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, ec.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(h + "." + p)));
});

test("an invited e-mail gets an account and a session; Apple's second visit finds it by the Apple ID", async () => {
  const env = await withUsers();
  const first = await start(env);
  const denied = await callback(env, first, {}, appleFetch({}, { nonce: first.nonce }));
  assert.equal(denied.status, 403, "no invitation yet");
  await env.DB.prepare("INSERT INTO user_invites(email) VALUES ('friend@example.com')").run();
  const again = await start(env);
  const ok = await callback(env, again, { user: JSON.stringify({ name: { firstName: "Jana", lastName: "Nová" } }) }, appleFetch({}, { nonce: again.nonce }));
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get("Location"), "/app");
  const user = await env.DB.prepare("SELECT id, name, role FROM users WHERE email='friend@example.com'").first();
  assert.deepEqual({ name: user.name, role: user.role }, { name: "Jana Nová", role: "user" });
  assert.deepEqual(await resolvePrincipal(new Request("https://petrfitnessdata.eu/app/api/me", { headers: { Cookie: sessionOf(ok) } }), env), { kind: "user", userId: user.id, epoch: 0 });
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM user_invites").first().then(r => r.n), 0);
  // Later Apple sends a relay address: the Apple ID still finds the account.
  const later = await start(env);
  const back = await callback(env, later, {}, appleFetch({ email: "x1y2@privaterelay.appleid.com" }, { nonce: later.nonce }));
  assert.equal(back.status, 302);
  assert.ok(sessionOf(back));
});

test("the token request carries the code, the redirect and a client secret", async () => {
  const env = freshEnv(), seen = {};
  const flow = await start(env); seen.nonce = flow.nonce;
  await callback(env, flow, {}, appleFetch({ email: "owner@example.com" }, seen));
  assert.equal(seen.body.get("code"), "c1");
  assert.equal(seen.body.get("grant_type"), "authorization_code");
  assert.equal(seen.body.get("redirect_uri"), "https://petrfitnessdata.eu/auth/apple/callback");
  assert.equal(seen.body.get("client_secret").split(".").length, 3);
});

test("a forged state, a changed cookie or a wrong nonce are rejected", async () => {
  const env = freshEnv();
  const flow = await start(env);
  assert.equal((await callback(env, { ...flow, state: "other" }, {}, appleFetch({}, { nonce: flow.nonce }))).status, 400);
  // Someone who can set cookies for the domain cannot slip in a user to link to.
  const [state, nonce, , sig] = flow.cookie.split("=")[1].split(".");
  assert.equal((await callback(env, { ...flow, cookie: "pfd_apple_login=" + [state, nonce, "1", sig].join(".") }, {}, appleFetch({}, { nonce }))).status, 400);
  const original = console.error; console.error = () => {};
  try { assert.equal((await callback(env, flow, {}, appleFetch({ email: "owner@example.com", nonce: "not-it" }))).status, 401); }
  finally { console.error = original; }
  assert.equal((await callback(env, flow, { error: "user_cancelled_authorize" }, appleFetch({}))).status, 400);
});

test("a signed-in user links their Apple ID in Settings, even with a hidden e-mail", async () => {
  const env = await withUsers();
  // The owner signs in with Apple by the owner's e-mail.
  const first = await start(env);
  assert.equal((await callback(env, first, {}, appleFetch({ sub: "apple-owner", email: "owner@example.com" }, { nonce: first.nonce }))).status, 302);
  await env.DB.prepare("INSERT INTO users(email, role) VALUES ('friend@example.com', 'user')").run();
  const friend = await env.DB.prepare("SELECT id FROM users WHERE email='friend@example.com'").first();
  const flow = await start(env, { path: "/auth/apple?link=1", user: { id: friend.id } });
  const linked = await callback(env, flow, {}, appleFetch({ email: "hidden@privaterelay.appleid.com" }, { nonce: flow.nonce }));
  assert.equal(linked.status, 302);
  assert.deepEqual(await appleIdentity(env.DB, friend.id), { linked: true, email: "hidden@privaterelay.appleid.com" });
  // Now the hidden address signs in to the friend's account.
  const signIn = await start(env);
  const response = await callback(env, signIn, {}, appleFetch({ email: "hidden@privaterelay.appleid.com" }, { nonce: signIn.nonce }));
  assert.deepEqual(await resolvePrincipal(new Request("https://petrfitnessdata.eu/app", { headers: { Cookie: sessionOf(response) } }), env), { kind: "user", userId: friend.id, epoch: 0 });
  // The owner's Apple ID cannot be taken over by linking it to another account.
  const steal = await start(env, { path: "/auth/apple?link=1", user: { id: friend.id } });
  assert.equal((await callback(env, steal, {}, appleFetch({ sub: "apple-owner", email: "owner@example.com" }, { nonce: steal.nonce }))).status, 409);
  await unlinkAppleIdentity(env.DB, friend.id);
  assert.deepEqual(await appleIdentity(env.DB, friend.id), { linked: false, email: null });
  // Deleting the account takes the Apple link with it.
  const again = await start(env, { path: "/auth/apple?link=1", user: { id: friend.id } });
  await callback(env, again, {}, appleFetch({}, { nonce: again.nonce }));
  env.DB.sqlite.exec(readFileSync(new URL("../migrations/0011_account_deletions.sql", import.meta.url), "utf8"));
  await deleteAccount({ DB: scopedDb(env.DB, friend.id), USER_ID: friend.id }, { id: friend.id, email: "friend@example.com" });
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM user_identities WHERE user_id=?").bind(friend.id).first().then(r => r.n), 0);
});

test("the app page asks for the Apple button only when Apple is set up, and Settings can link Apple", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  assert.match(entry, /dashboardPage\(\{ clientVersion: CLIENT_VERSION, account: .*, signIn: \{ apple: appleConfigured\(env\), email: emailConfigured\(env\) \} \}\)/);
  assert.match(entry, /handleAppleLogin\(request, rawEnv, url\.pathname, \{ user: signedIn \? user : null \}\)/);
  assert.match(client, /href="\/auth\/apple\?link=1"/);
  assert.match(client, /fetch\('\/app\/api\/me\/apple',\{method:'DELETE'/);
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
  const request = new Request("https://petrfitnessdata.eu/auth/app/apple", { method: "POST", headers, body: JSON.stringify(body) });
  return handleNativeAppleLogin(request, env, "/auth/app/apple", { fetchImpl, saveRefreshToken });
}

test("the app signs in with Apple natively and keeps the token that deleting the account revokes", async () => {
  assert.equal(isPublicPath("/auth/app/apple"), true);
  const env = await withUsers();
  await env.DB.prepare("INSERT INTO user_invites(email) VALUES ('friend@example.com')").run();
  const token = await idToken({ aud: "eu.petrfitnessdata.loadwise.native", nonce: await hex(APP_NONCE) });
  const seen = {}, saved = [];
  const ok = await nativeRequest(env, { identityToken: token, authorizationCode: "code-1", nonce: APP_NONCE, name: "Jana  Nová" }, { fetchImpl: nativeFetch({}, seen), saveRefreshToken: async (user, value) => saved.push([user.email, value]) });
  assert.equal(ok.status, 200);
  assert.ok(sessionOf(ok));
  assert.equal((await env.DB.prepare("SELECT name FROM users WHERE email='friend@example.com'").first()).name, "Jana Nová");
  assert.deepEqual(saved, [["friend@example.com", "apple-refresh-1"]]);
  const exchange = seen.calls.find(c => c.url.endsWith("/auth/token")).body;
  assert.equal(exchange.get("client_id"), "eu.petrfitnessdata.loadwise.native");
  assert.equal(exchange.get("code"), "code-1");
  const sub = JSON.parse(Buffer.from(exchange.get("client_secret").split(".")[1], "base64url")).sub;
  assert.equal(sub, "eu.petrfitnessdata.loadwise.native");

  const revoked = {};
  assert.equal(await revokeApple({ ...apple, APPLE_REFRESH_TOKEN: "apple-refresh-1" }, nativeFetch({}, revoked)), "revoked");
  assert.equal(revoked.calls[0].url, "https://appleid.apple.com/auth/revoke");
  assert.equal(revoked.calls[0].body.get("token"), "apple-refresh-1");
  assert.equal(await revokeApple({ ...apple }), "none");
});

test("the app's Apple sign-in refuses a web token, a wrong nonce, a form post and an uninvited e-mail", async () => {
  const env = await withUsers();
  const fetchImpl = nativeFetch({});
  const web = await idToken({ nonce: await hex(APP_NONCE) });
  assert.equal((await nativeRequest(env, { identityToken: web, nonce: APP_NONCE }, { fetchImpl })).status, 401);
  const app = await idToken({ aud: "eu.petrfitnessdata.loadwise.native", nonce: await hex(APP_NONCE) });
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
