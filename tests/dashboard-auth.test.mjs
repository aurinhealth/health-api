import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foreignOriginChange, isPublicPath, resolvePrincipal, sessionCookie, sessionSecret, timingSafeEqualString, verifyDashboardSession, sessionMatchesUser, userSessionCookie, signText, handleSignOutEverywhere, handleSignOut, connectSessionCookie, endConnectSession, CONNECT_SESSION_SECONDS, SESSION_SECONDS, SESSION_REFRESH_SECONDS, SESSION_MAX_SECONDS, sessionNeedsRefresh, slidingSession } from "../src/dashboard-auth.js";
import { createD1 } from "./helpers/d1.mjs";
import { ensureTenancy, findUser, bumpSessionEpoch, _resetTenancyForTest } from "../src/tenancy.js";

const env = { STRENGTH_API_KEY: "test-secret-key", SESSION_SECRET: "test-session-secret" };
const rejectOidc = async () => { throw new Error("invalid"); };
const req = (headers = {}) => new Request("https://aurin.health/app/api/daily", { headers });
const future = () => Math.floor(Date.now() / 1000) + 60;

test("personal data routes are not public", () => {
  for (const path of ["/app/api/daily", "/app/api/sleep", "/app/api/profile", "/app/api/food/log", "/app/api/me", "/app/api/admin/users", "/health/sleep", "/health/db", "/sync/google", "/sync/intervals", "/daily/plan", "/food/resolve", "/mcp", "/authorize", "/token", "/register", "/auth-test", "/test/intervals", "/strength/history"]) {
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

test("sessions identify their user; GitHub OIDC acts as system; the old owner API key opens nothing", async () => {
  const cookie = (await sessionCookie(7, future(), env.SESSION_SECRET)).split(";")[0];
  assert.deepEqual(await resolvePrincipal(req({ Cookie: cookie }), env, rejectOidc), { kind: "user", userId: 7, epoch: 0 });
  assert.equal(await resolvePrincipal(req({ Authorization: "Bearer test-secret-key" }), env, async () => ({})), null);
  assert.deepEqual(await resolvePrincipal(req({ Authorization: "Bearer a.b.c" }), env, async () => ({})), { kind: "system" });
});

test("the deploy token acts as the owner only on the routes the smoke test calls", async () => {
  const at = (path, method = "GET") => new Request("https://aurin.health" + path, { method, headers: { Authorization: "Bearer a.b.c" } });
  const accept = async () => ({});
  for (const [path, method] of [["/automation/strength", "POST"], ["/health/nutrition"], ["/app/api/today"], ["/app/api/daily"], ["/app/api/sleep"], ["/app/api/gym"], ["/app/api/activities"], ["/app/api/week"], ["/app/api/food/search", "POST"]]) {
    assert.deepEqual(await resolvePrincipal(at(path, method), env, accept), { kind: "system" }, path);
  }
  for (const [path, method] of [["/app/api/account/export"], ["/app/api/account/delete", "POST"], ["/app/api/me"], ["/app/api/food/log", "POST"], ["/app/api/today", "POST"], ["/app/api/admin/users"], ["/strength/history"], ["/sync/google"]]) {
    assert.equal(await resolvePrincipal(at(path, method), env, accept), null, method + " " + path);
  }
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
  assert.equal(await resolvePrincipal(req({ Authorization: "Bearer test-secret-key" }), env, rejectOidc), null);
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
  assert.equal(timingSafeEqualString("Bearer abcd", "Bearer abc"), false);
  assert.equal(timingSafeEqualString("Bearer abc\u0000", "Bearer abc"), false);
  // The secret is the second argument: a guess of any length reads only as many characters as it has.
  let reads = 0;
  const secret = "s".repeat(40), original = String.prototype.charCodeAt;
  String.prototype.charCodeAt = function (i) { reads++; return original.call(this, i); };
  try { timingSafeEqualString("x".repeat(500), secret); timingSafeEqualString("y", secret); } finally { String.prototype.charCodeAt = original; }
  assert.equal(reads, 4 * secret.length);
});

test("changes made with the session come only from pages of this address", () => {
  const user = { kind: "user", userId: 7, epoch: 0 };
  const change = (origin, method = "POST") => new Request("https://aurin.health/app/api/food/log", { method, headers: origin ? { Origin: origin } : {} });
  assert.equal(foreignOriginChange(change("https://aurin.health"), user), false);
  for (const method of ["PATCH", "PUT", "DELETE"]) assert.equal(foreignOriginChange(change("https://aurin.health", method), user), false, method);
  // The browser counts the test copy as the same site and sends the cookie along.
  assert.equal(foreignOriginChange(change("https://staging.aurin.health"), user), true);
  assert.equal(foreignOriginChange(change("https://example.com"), user), true);
  assert.equal(foreignOriginChange(change("http://aurin.health"), user), true);
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
  assert.deepEqual(await verifyDashboardSession(req({ Cookie: legacy }), env.SESSION_SECRET), { uid: 7, exp: legacyExp, epoch: 0, iat: legacyExp - SESSION_SECONDS, at: legacyExp - SESSION_SECONDS });
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
  const url = new URL("https://aurin.health/app/api/account/sign-out-everywhere");
  const post = (origin = "https://aurin.health") => new Request(url, { method: "POST", headers: origin ? { Origin: origin } : {} });
  assert.equal((await handleSignOutEverywhere(post(), { ...e, RAW_DB: DB }, url, { signedIn: false })).status, 401);
  assert.equal((await handleSignOutEverywhere(post("https://evil.example"), { ...e, RAW_DB: DB }, url, { signedIn: true, user })).status, 403);
  assert.equal((await handleSignOutEverywhere(new Request(url), { ...e, RAW_DB: DB }, url, { signedIn: true, user })).status, 405);
  assert.equal(await handleSignOutEverywhere(post(), e, new URL("https://aurin.health/app/api/me"), { signedIn: true, user }), null);
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

test("signing out ends every session of the account, also the copies elsewhere", async () => {
  _resetTenancyForTest();
  const DB = createD1(), e = { ...env, OWNER_EMAIL: "owner@example.com", DB };
  await ensureTenancy(DB, e);
  await DB.prepare("INSERT INTO users(email) VALUES ('friend@example.com')").run();
  const phone = (await userSessionCookie(DB, 2, env.SESSION_SECRET)).split(";")[0];
  const watch = (await userSessionCookie(DB, 2, env.SESSION_SECRET)).split(";")[0];
  const logout = cookie => new Request("https://aurin.health/app/logout", { method: "POST", headers: { Cookie: cookie, Origin: "https://aurin.health" } });
  const response = await handleSignOut(logout(phone), e, await findUser(DB, 2, e));
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.match(response.headers.get("Set-Cookie"), /^pfd_session=; Path=\/; Max-Age=0/);
  const moved = await findUser(DB, 2, e);
  assert.equal(moved.sessionEpoch, 1);
  for (const cookie of [phone, watch]) assert.equal(sessionMatchesUser(await resolvePrincipal(req({ Cookie: cookie }), env, rejectOidc), moved), false);
  // A cookie already signed out (or none) is only cleared: an old copy cannot sign the user out again.
  for (const user of [null, { ...moved, sessionEpoch: 0 }]) {
    const again = await handleSignOut(logout(watch), e, user);
    assert.match(again.headers.get("Set-Cookie"), /^pfd_session=; /);
  }
  assert.equal((await findUser(DB, 2, e)).sessionEpoch, 1);
  // A database that fails still clears this device's cookie.
  const broken = await handleSignOut(logout(phone), { ...e, DB: { prepare() { throw new Error("down"); } } }, moved);
  assert.match(broken.headers.get("Set-Cookie"), /^pfd_session=; /);
});

test("the connect sheet's cookie is good only for connecting, for a quarter of an hour", async () => {
  _resetTenancyForTest();
  const DB = createD1(), e = { ...env, OWNER_EMAIL: "owner@example.com", DB };
  await ensureTenancy(DB, e);
  await DB.prepare("INSERT INTO users(email) VALUES ('friend@example.com')").run();
  await bumpSessionEpoch(DB, 2);
  const header = await connectSessionCookie(DB, 2, env.SESSION_SECRET);
  assert.match(header, new RegExp("^pfd_session=.+; Path=/; Max-Age=" + CONNECT_SESSION_SECONDS + "; HttpOnly; Secure; SameSite=Lax$"));
  assert.equal(CONNECT_SESSION_SECONDS, 15 * 60);
  const cookie = header.split(";")[0];
  const at = path => new Request("https://aurin.health" + path, { headers: { Cookie: cookie } });
  for (const path of ["/auth/app/connect", "/oauth/google", "/oauth/intervals/callback", "/oauth/wahoo/callback"]) {
    assert.deepEqual(await resolvePrincipal(at(path), env, rejectOidc), { kind: "user", userId: 2, epoch: 1 }, path);
  }
  for (const path of ["/app/api/today", "/app/api/account/export", "/app/api/me", "/app/logout", "/health/nutrition", "/oauth/other", "/oauth/google/other"]) {
    assert.equal(await resolvePrincipal(at(path), env, rejectOidc), null, path);
  }
  // It never slides into a month-long session.
  const day = Math.floor(Date.now() / 1000) + DAY;
  assert.equal((await slidingSession(at("/app/api/today"), okResponse(), env.SESSION_SECRET, day)).headers.get("Set-Cookie"), null);
  // A cookie with a scope it does not know is no session.
  const odd = b64({ uid: 2, exp: future(), se: 1, iat: 1, at: 1, sc: "admin" });
  const oddCookie = "pfd_session=" + odd + "." + await signText(odd, env.SESSION_SECRET);
  assert.equal(await verifyDashboardSession(new Request("https://aurin.health/oauth/google", { headers: { Cookie: oddCookie } }), env.SESSION_SECRET), null);
  // Coming back to the app clears it; any other answer is left alone.
  const back = endConnectSession(new Response(null, { status: 302, headers: { Location: "loadwise://connected?event=google", "Set-Cookie": "pfd_google_oauth_state=; Path=/oauth/google; Max-Age=0" } }));
  assert.equal(back.headers.get("Location"), "loadwise://connected?event=google");
  assert.deepEqual(back.headers.getSetCookie(), ["pfd_google_oauth_state=; Path=/oauth/google; Max-Age=0", "pfd_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"]);
  const onward = new Response(null, { status: 302, headers: { Location: "https://accounts.google.com/o/oauth2/v2/auth" } });
  assert.equal(endConnectSession(onward), onward);
  assert.equal(endConnectSession(null), null);
});

// ---- Sliding sessions ----
const NOW = 1_800_000_000;
const DAY = 24 * 60 * 60;
const cookieOf = header => header.split(";")[0];
const payloadOf = header => JSON.parse(Buffer.from(cookieOf(header).slice("pfd_session=".length).split(".")[0], "base64url").toString());
const apiRequest = cookie => new Request("https://aurin.health/app/api/today", { headers: cookie ? { Cookie: cookie } : {} });
const okResponse = () => Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
const hmac = async (payload, secret) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))).toString("base64url");
};

test("the cookie carries when it was issued; older cookies count as issued 30 days before they expire", async () => {
  const fresh = await sessionCookie(7, NOW + SESSION_SECONDS, env.SESSION_SECRET, 0, NOW);
  assert.deepEqual(payloadOf(fresh), { uid: 7, exp: NOW + SESSION_SECONDS, se: 0, iat: NOW, at: NOW });
  assert.deepEqual(await verifyDashboardSession(apiRequest(cookieOf(fresh)), env.SESSION_SECRET), { uid: 7, exp: NOW + SESSION_SECONDS, epoch: 0, iat: NOW, at: NOW });
  // A cookie from before the sliding sessions: {uid, exp} only.
  const legacyPayload = Buffer.from(JSON.stringify({ uid: 7, exp: NOW + SESSION_SECONDS })).toString("base64url");
  const legacy = "pfd_session=" + legacyPayload + "." + await hmac(legacyPayload, env.SESSION_SECRET);
  assert.deepEqual(await verifyDashboardSession(apiRequest(legacy), env.SESSION_SECRET), { uid: 7, exp: NOW + SESSION_SECONDS, epoch: 0, iat: NOW, at: NOW });
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
  assert.deepEqual(payloadOf(header), { uid: 7, exp: NOW + SESSION_SECONDS, se: 3, iat: NOW, at: issued }, "the same user, epoch and sign-in, new times");
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
  const apiKey = new Request("https://aurin.health/app/api/today", { headers: { Authorization: "Bearer test-secret-key" } });
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

test("a session in use still ends a year after its sign-in", async () => {
  const real = Math.floor(Date.now() / 1000), signedIn = real - SESSION_MAX_SECONDS + DAY;
  // Refreshed yesterday, signed in 364 days ago: still good, and the fresh cookie keeps the sign-in time and ends with the year.
  const yesterday = cookieOf(await sessionCookie(7, real + SESSION_SECONDS, env.SESSION_SECRET, 0, real - DAY, signedIn));
  const session = await verifyDashboardSession(apiRequest(yesterday), env.SESSION_SECRET);
  assert.equal(session.at, signedIn);
  const header = (await slidingSession(apiRequest(yesterday), okResponse(), env.SESSION_SECRET, real)).headers.get("Set-Cookie");
  assert.deepEqual({ at: payloadOf(header).at, exp: payloadOf(header).exp }, { at: signedIn, exp: signedIn + SESSION_MAX_SECONDS });
  // Signed in more than a year ago: no session, however fresh the cookie.
  const stale = cookieOf(await sessionCookie(7, real + SESSION_SECONDS, env.SESSION_SECRET, 0, real - DAY, real - SESSION_MAX_SECONDS - 1));
  assert.equal(await verifyDashboardSession(apiRequest(stale), env.SESSION_SECRET), null);
});
