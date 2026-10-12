import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foreignOriginChange, isPublicPath, resolvePrincipal, sessionCookie, sessionSecret, timingSafeEqualString, verifyDashboardSession, sessionMatchesUser, userSessionCookie, signText, handleSignOutEverywhere, SESSION_SECONDS, SESSION_REFRESH_SECONDS, sessionNeedsRefresh, slidingSession } from "../src/dashboard-auth.js";
import { createD1 } from "./helpers/d1.mjs";
import { ensureTenancy, findUser, bumpSessionEpoch, _resetTenancyForTest } from "../src/tenancy.js";

const env = { STRENGTH_API_KEY: "test-secret-key", SESSION_SECRET: "test-session-secret" };
const rejectOidc = async () => { throw new Error("invalid"); };
const req = (headers = {}) => new Request("https://petrfitnessdata.eu/app/api/daily", { headers });
const future = () => Math.floor(Date.now() / 1000) + 60;

test("personal data routes are not public", () => {
  for (const path of ["/app/api/daily", "/app/api/sleep", "/app/api/profile", "/app/api/food/log", "/app/api/inbox", "/app/api/me", "/app/api/admin/users", "/health/sleep", "/health/db", "/sync/google", "/sync/intervals", "/daily/plan", "/food/resolve", "/mcp", "/authorize", "/token", "/register", "/auth-test", "/test/intervals", "/strength/history"]) {
    assert.equal(isPublicPath(path), false, path);
  }
});

test("static pages, Google login and self-authenticating routes stay public", () => {
  for (const path of ["/", "/app/logout", "/auth/google", "/auth/app/apple", "/.well-known/apple-app-site-association", "/oauth/google/callback", "/automation/strength"]) {
    assert.equal(isPublicPath(path), true, path);
  }
  // The old web app and its browser sign-in are gone.
  for (const path of ["/app", "/app/login", "/app/dashboard-client.js", "/manifest.webmanifest", "/auth/apple", "/auth/apple/callback"]) assert.equal(isPublicPath(path), false, path);
});

test("anonymous and wrong-key requests have no principal", async () => {
  assert.equal(await resolvePrincipal(req(), env, rejectOidc), null);
  assert.equal(await resolvePrincipal(req({ Authorization: "Bearer wrong" }), env, rejectOidc), null);
  assert.equal(await resolvePrincipal(req({ Authorization: "Bearer a.b.c" }), env, rejectOidc), null);
  assert.equal(await resolvePrincipal(req({ Authorization: "Bearer test-secret-key" }), {}, rejectOidc), null);
});

test("sessions identify their user; the API key and GitHub OIDC act as owner and system", async () => {
  const cookie = (await sessionCookie(7, future(), env.SESSION_SECRET)).split(";")[0];
  assert.deepEqual(await resolvePrincipal(req({ Cookie: cookie }), env, rejectOidc), { kind: "user", userId: 7, epoch: 0 });
  assert.deepEqual(await resolvePrincipal(req({ Authorization: "Bearer test-secret-key" }), env, rejectOidc), { kind: "owner" });
  assert.deepEqual(await resolvePrincipal(req({ Authorization: "Bearer a.b.c" }), env, async () => ({})), { kind: "system" });
});

test("expired, forged or user-less sessions are rejected", async () => {
  const expired = (await sessionCookie(7, Math.floor(Date.now() / 1000) - 1, env.SESSION_SECRET)).split(";")[0];
  assert.equal(await resolvePrincipal(req({ Cookie: expired }), env, rejectOidc), null);
  const forged = (await sessionCookie(7, future(), "other-secret")).split(";")[0];
  assert.equal(await resolvePrincipal(req({ Cookie: forged }), env, rejectOidc), null);
  const noUser = (await sessionCookie(0, future(), env.SESSION_SECRET)).split(";")[0];
  assert.equal(await verifyDashboardSession(req({ Cookie: noUser }), env.SESSION_SECRET), null);
});

test("session cookies are HttpOnly, Secure and SameSite", async () => {
  assert.match(await sessionCookie(1, future(), env.SESSION_SECRET), /^pfd_session=.+HttpOnly; Secure; SameSite=Lax$/);
});

test("only SESSION_SECRET signs sessions, never the owner API key", async () => {
  assert.equal(sessionSecret(env), "test-session-secret");
  assert.equal(sessionSecret({ STRENGTH_API_KEY: "test-secret-key" }), "");
  // Whoever holds the API key cannot make up a session for another user.
  const minted = (await sessionCookie(7, future(), env.STRENGTH_API_KEY)).split(";")[0];
  assert.equal(await resolvePrincipal(req({ Cookie: minted }), env, rejectOidc), null);
  assert.equal(await resolvePrincipal(req({ Cookie: minted }), { STRENGTH_API_KEY: "test-secret-key" }, rejectOidc), null);
  assert.deepEqual(await resolvePrincipal(req({ Authorization: "Bearer test-secret-key" }), env, rejectOidc), { kind: "owner" });
});

test("sessions and GitHub automations work without the owner API key", async () => {
  const withoutKey = { SESSION_SECRET: "test-session-secret" };
  const cookie = (await sessionCookie(7, future(), withoutKey.SESSION_SECRET)).split(";")[0];
  assert.deepEqual(await resolvePrincipal(req({ Cookie: cookie }), withoutKey, rejectOidc), { kind: "user", userId: 7, epoch: 0 });
  assert.deepEqual(await resolvePrincipal(req({ Authorization: "Bearer a.b.c" }), withoutKey, async () => ({})), { kind: "system" });
  for (const token of ["test-secret-key", "undefined", "null"]) assert.equal(await resolvePrincipal(req({ Authorization: "Bearer " + token }), withoutKey, rejectOidc), null);
});

test("bearer comparison is exact", () => {
  assert.equal(timingSafeEqualString("Bearer abc", "Bearer abc"), true);
  assert.equal(timingSafeEqualString("Bearer abd", "Bearer abc"), false);
  assert.equal(timingSafeEqualString("Bearer ab", "Bearer abc"), false);
  assert.equal(timingSafeEqualString("", "Bearer abc"), false);
});

test("changes made with the session come only from pages of this address", () => {
  const user = { kind: "user", userId: 7, epoch: 0 };
  const change = (origin, method = "POST") => new Request("https://petrfitnessdata.eu/app/api/food/log", { method, headers: origin ? { Origin: origin } : {} });
  assert.equal(foreignOriginChange(change("https://petrfitnessdata.eu"), user), false);
  for (const method of ["PATCH", "PUT", "DELETE"]) assert.equal(foreignOriginChange(change("https://petrfitnessdata.eu", method), user), false, method);
  // The browser counts the test copy as the same site and sends the cookie along.
  assert.equal(foreignOriginChange(change("https://staging.petrfitnessdata.eu"), user), true);
  assert.equal(foreignOriginChange(change("https://example.com"), user), true);
  assert.equal(foreignOriginChange(change("http://petrfitnessdata.eu"), user), true);
  assert.equal(foreignOriginChange(change("null"), user), true);
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) assert.equal(foreignOriginChange(change(null, method), user), true, method);
  // Reading changes nothing.
  for (const method of ["GET", "HEAD", "OPTIONS"]) assert.equal(foreignOriginChange(change("https://example.com", method), user), false, method);
  // A browser never adds an API key or a GitHub token on its own.
  for (const principal of [{ kind: "owner" }, { kind: "system" }, null]) assert.equal(foreignOriginChange(change(null), principal), false);
});

const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");

test("sessions carry the user's epoch; cookies from before the epoch count as 0", async () => {
  const current = (await sessionCookie(7, future(), env.SESSION_SECRET, 2)).split(";")[0];
  assert.deepEqual(await resolvePrincipal(req({ Cookie: current }), env, rejectOidc), { kind: "user", userId: 7, epoch: 2 });
  // A cookie made before the epoch existed ({uid, exp} only) still signs in, as epoch 0.
  const payload = b64({ uid: 7, exp: future() });
  const legacy = "pfd_session=" + payload + "." + await signText(payload, env.SESSION_SECRET);
  const legacyExp = JSON.parse(Buffer.from(payload, "base64url")).exp;
  assert.deepEqual(await verifyDashboardSession(req({ Cookie: legacy }), env.SESSION_SECRET), { uid: 7, exp: legacyExp, epoch: 0, iat: legacyExp - SESSION_SECONDS });
  const odd = b64({ uid: 7, exp: future(), se: -1 });
  assert.equal(await verifyDashboardSession(req({ Cookie: "pfd_session=" + odd + "." + await signText(odd, env.SESSION_SECRET) }), env.SESSION_SECRET), null);
  // The cookie is good only for the user row's epoch.
  assert.equal(sessionMatchesUser({ kind: "user", userId: 7, epoch: 0 }, { id: 7, sessionEpoch: 0 }), true);
  assert.equal(sessionMatchesUser({ kind: "user", userId: 7, epoch: 0 }, { id: 7 }), true, "a row without the column is epoch 0");
  assert.equal(sessionMatchesUser({ kind: "user", userId: 7, epoch: 0 }, { id: 7, sessionEpoch: 1 }), false);
  assert.equal(sessionMatchesUser({ kind: "user", userId: 7, epoch: 1 }, { id: 7, sessionEpoch: 1 }), true);
  for (const principal of [{ kind: "owner" }, { kind: "system" }, null]) assert.equal(sessionMatchesUser(principal, { id: 7, sessionEpoch: 3 }), true);
});

test("sign out everywhere moves the epoch on, keeps this device signed in and signs the others out", async () => {
  _resetTenancyForTest();
  const DB = createD1(), e = { ...env, OWNER_EMAIL: "owner@example.com", DB };
  await ensureTenancy(DB, e);
  await DB.prepare("INSERT INTO users(email) VALUES ('friend@example.com')").run();
  const user = await findUser(DB, 2, e);
  assert.equal(user.sessionEpoch, 0);
  const before = (await userSessionCookie(DB, 2, env.SESSION_SECRET)).split(";")[0];
  assert.equal((await resolvePrincipal(req({ Cookie: before }), env, rejectOidc)).epoch, 0);
  const url = new URL("https://petrfitnessdata.eu/app/api/account/sign-out-everywhere");
  const post = (origin = "https://petrfitnessdata.eu") => new Request(url, { method: "POST", headers: origin ? { Origin: origin } : {} });
  assert.equal((await handleSignOutEverywhere(post(), { ...e, RAW_DB: DB }, url, { signedIn: false })).status, 401);
  assert.equal((await handleSignOutEverywhere(post("https://evil.example"), { ...e, RAW_DB: DB }, url, { signedIn: true, user })).status, 403);
  assert.equal((await handleSignOutEverywhere(new Request(url), { ...e, RAW_DB: DB }, url, { signedIn: true, user })).status, 405);
  assert.equal(await handleSignOutEverywhere(post(), e, new URL("https://petrfitnessdata.eu/app/api/me"), { signedIn: true, user }), null);
  const response = await handleSignOutEverywhere(post(), { ...e, RAW_DB: DB }, url, { signedIn: true, user });
  assert.deepEqual(await response.json(), { status: "ok" });
  const after = response.headers.get("Set-Cookie").split(";")[0];
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Secure; SameSite=Lax$/);
  const moved = await findUser(DB, 2, e);
  assert.equal(moved.sessionEpoch, 1);
  assert.equal(sessionMatchesUser(await resolvePrincipal(req({ Cookie: after }), env, rejectOidc), moved), true, "this device");
  assert.equal(sessionMatchesUser(await resolvePrincipal(req({ Cookie: before }), env, rejectOidc), moved), false, "every other device");
  assert.equal(await bumpSessionEpoch(DB, 2), 2);
  assert.equal(await bumpSessionEpoch(DB, 999), 0);
});

// ---- Sliding sessions ----
const NOW = 1_800_000_000;
const DAY = 24 * 60 * 60;
const cookieOf = header => header.split(";")[0];
const payloadOf = header => JSON.parse(Buffer.from(cookieOf(header).slice("pfd_session=".length).split(".")[0], "base64url").toString());
const apiRequest = cookie => new Request("https://petrfitnessdata.eu/app/api/today", { headers: cookie ? { Cookie: cookie } : {} });
const okResponse = () => Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
const hmac = async (payload, secret) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))).toString("base64url");
};

test("the cookie carries when it was issued; older cookies count as issued 30 days before they expire", async () => {
  const fresh = await sessionCookie(7, NOW + SESSION_SECONDS, env.SESSION_SECRET, 0, NOW);
  assert.deepEqual(payloadOf(fresh), { uid: 7, exp: NOW + SESSION_SECONDS, se: 0, iat: NOW });
  assert.deepEqual(await verifyDashboardSession(apiRequest(cookieOf(fresh)), env.SESSION_SECRET), { uid: 7, exp: NOW + SESSION_SECONDS, epoch: 0, iat: NOW });
  // A cookie from before the sliding sessions: {uid, exp} only.
  const legacyPayload = Buffer.from(JSON.stringify({ uid: 7, exp: NOW + SESSION_SECONDS })).toString("base64url");
  const legacy = "pfd_session=" + legacyPayload + "." + await hmac(legacyPayload, env.SESSION_SECRET);
  assert.deepEqual(await verifyDashboardSession(apiRequest(legacy), env.SESSION_SECRET), { uid: 7, exp: NOW + SESSION_SECONDS, epoch: 0, iat: NOW });
});

test("a session a day old needs a fresh cookie, a newer one does not", () => {
  assert.equal(SESSION_REFRESH_SECONDS, DAY);
  const session = { uid: 7, exp: NOW + SESSION_SECONDS, iat: NOW };
  assert.equal(sessionNeedsRefresh(session, NOW + DAY - 1), false);
  assert.equal(sessionNeedsRefresh(session, NOW + DAY), true);
  assert.equal(sessionNeedsRefresh(session, NOW + 29 * DAY), true);
  assert.equal(sessionNeedsRefresh(null, NOW), false);
});

test("an API answer to a day-old session sets a fresh 30-day cookie for the same user", async () => {
  const issued = NOW - 25 * 60 * 60;
  const cookie = cookieOf(await sessionCookie(7, issued + SESSION_SECONDS, env.SESSION_SECRET, 3, issued));
  const response = await slidingSession(apiRequest(cookie), okResponse(), env.SESSION_SECRET, NOW);
  const header = response.headers.get("Set-Cookie");
  assert.match(header, /^pfd_session=.+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
  assert.deepEqual(payloadOf(header), { uid: 7, exp: NOW + SESSION_SECONDS, se: 3, iat: NOW }, "the same user and epoch, new times");
  // The body and the other headers are untouched.
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  // The new cookie signs the user in.
  assert.deepEqual(await resolvePrincipal(apiRequest(cookieOf(header)), env, rejectOidc), { kind: "user", userId: 7, epoch: 3 });
});

test("a session used within the day, no session, an expired one and a sign-in answer get no new cookie", async () => {
  const recent = cookieOf(await sessionCookie(7, NOW - 3600 + SESSION_SECONDS, env.SESSION_SECRET, 0, NOW - 3600));
  assert.equal((await slidingSession(apiRequest(recent), okResponse(), env.SESSION_SECRET, NOW)).headers.get("Set-Cookie"), null);
  assert.equal((await slidingSession(apiRequest(null), okResponse(), env.SESSION_SECRET, NOW)).headers.get("Set-Cookie"), null);
  const apiKey = new Request("https://petrfitnessdata.eu/app/api/today", { headers: { Authorization: "Bearer test-secret-key" } });
  assert.equal((await slidingSession(apiKey, okResponse(), env.SESSION_SECRET, NOW)).headers.get("Set-Cookie"), null);
  // Expired: verifyDashboardSession reads the real clock, so a past exp is refused whatever "now" says.
  const expired = cookieOf(await sessionCookie(7, Math.floor(Date.now() / 1000) - 1, env.SESSION_SECRET, 0, NOW - 40 * DAY));
  assert.equal((await slidingSession(apiRequest(expired), okResponse(), env.SESSION_SECRET, NOW)).headers.get("Set-Cookie"), null);
  // Without the secret nothing can be signed.
  assert.equal((await slidingSession(apiRequest(recent), okResponse(), "", NOW)).headers.get("Set-Cookie"), null);
  // An answer that already sets the session (a sign-in, a logout) keeps its own cookie.
  const old = cookieOf(await sessionCookie(7, NOW - 2 * DAY + SESSION_SECONDS, env.SESSION_SECRET, 0, NOW - 2 * DAY));
  const ownCookie = await sessionCookie(9, NOW + 60, env.SESSION_SECRET, 0, NOW);
  const kept = await slidingSession(apiRequest(old), new Response("{}", { headers: { "Set-Cookie": ownCookie } }), env.SESSION_SECRET, NOW);
  assert.equal(kept.headers.getSetCookie().length, 1);
  assert.equal(kept.headers.get("Set-Cookie"), ownCookie);
});

test("the Worker slides the session on every /app/api/* answer", () => {
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const block = source.slice(source.indexOf('if (url.pathname.startsWith("/app/api/")) {'));
  const end = block.indexOf("\n    }\n");
  assert.ok(end > 0);
  assert.match(block.slice(0, end), /return slidingSession\(request, response, sessionSecret\(rawEnv\)\);/);
});
