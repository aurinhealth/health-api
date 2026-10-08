import test from "node:test";
import assert from "node:assert/strict";
import { foreignOriginChange, isPublicPath, resolvePrincipal, sessionCookie, sessionSecret, timingSafeEqualString, verifyDashboardSession } from "../src/dashboard-auth.js";

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
  for (const path of ["/", "/app", "/app/dashboard-client.js", "/app/logout", "/auth/google", "/.well-known/apple-developer-domain-association.txt", "/oauth/google/callback", "/automation/strength"]) {
    assert.equal(isPublicPath(path), true, path);
  }
  assert.equal(isPublicPath("/app/login"), false);
});

test("anonymous and wrong-key requests have no principal", async () => {
  assert.equal(await resolvePrincipal(req(), env, rejectOidc), null);
  assert.equal(await resolvePrincipal(req({ Authorization: "Bearer wrong" }), env, rejectOidc), null);
  assert.equal(await resolvePrincipal(req({ Authorization: "Bearer a.b.c" }), env, rejectOidc), null);
  assert.equal(await resolvePrincipal(req({ Authorization: "Bearer test-secret-key" }), {}, rejectOidc), null);
});

test("sessions identify their user; the API key and GitHub OIDC act as owner and system", async () => {
  const cookie = (await sessionCookie(7, future(), env.SESSION_SECRET)).split(";")[0];
  assert.deepEqual(await resolvePrincipal(req({ Cookie: cookie }), env, rejectOidc), { kind: "user", userId: 7 });
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
  assert.deepEqual(await resolvePrincipal(req({ Cookie: cookie }), withoutKey, rejectOidc), { kind: "user", userId: 7 });
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
  const user = { kind: "user", userId: 7 };
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
