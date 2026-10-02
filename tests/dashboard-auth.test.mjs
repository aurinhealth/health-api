import test from "node:test";
import assert from "node:assert/strict";
import { isPublicPath, resolvePrincipal, sessionCookie, sessionSecret, timingSafeEqualString, verifyDashboardSession } from "../src/dashboard-auth.js";

const env = { STRENGTH_API_KEY: "test-secret-key" };
const rejectOidc = async () => { throw new Error("invalid"); };
const req = (headers = {}) => new Request("https://petrfitnessdata.eu/app/api/daily", { headers });
const future = () => Math.floor(Date.now() / 1000) + 60;

test("personal data routes are not public", () => {
  for (const path of ["/app/api/daily", "/app/api/sleep", "/app/api/profile", "/app/api/food/log", "/app/api/inbox", "/app/api/me", "/app/api/admin/users", "/health/sleep", "/health/db", "/sync/google", "/sync/intervals", "/daily/plan", "/food/resolve", "/auth-test", "/test/intervals", "/test/google-sheets-auth", "/strength/history"]) {
    assert.equal(isPublicPath(path), false, path);
  }
});

test("static pages, Google login and self-authenticating routes stay public", () => {
  for (const path of ["/", "/app", "/app/dashboard-client.js", "/app/logout", "/auth/google", "/mcp", "/mcp/health", "/token", "/authorize", "/.well-known/oauth-authorization-server", "/oauth/google/callback", "/automation/strength"]) {
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
  const cookie = (await sessionCookie(7, future(), env.STRENGTH_API_KEY)).split(";")[0];
  assert.deepEqual(await resolvePrincipal(req({ Cookie: cookie }), env, rejectOidc), { kind: "user", userId: 7 });
  assert.deepEqual(await resolvePrincipal(req({ Authorization: "Bearer test-secret-key" }), env, rejectOidc), { kind: "owner" });
  assert.deepEqual(await resolvePrincipal(req({ Authorization: "Bearer a.b.c" }), env, async () => ({})), { kind: "system" });
});

test("expired, forged or user-less sessions are rejected", async () => {
  const expired = (await sessionCookie(7, Math.floor(Date.now() / 1000) - 1, env.STRENGTH_API_KEY)).split(";")[0];
  assert.equal(await resolvePrincipal(req({ Cookie: expired }), env, rejectOidc), null);
  const forged = (await sessionCookie(7, future(), "other-secret")).split(";")[0];
  assert.equal(await resolvePrincipal(req({ Cookie: forged }), env, rejectOidc), null);
  const noUser = (await sessionCookie(0, future(), env.STRENGTH_API_KEY)).split(";")[0];
  assert.equal(await verifyDashboardSession(req({ Cookie: noUser }), env.STRENGTH_API_KEY), null);
});

test("session cookies are HttpOnly, Secure and SameSite", async () => {
  assert.match(await sessionCookie(1, future(), env.STRENGTH_API_KEY), /^pfd_session=.+HttpOnly; Secure; SameSite=Lax$/);
});

test("SESSION_SECRET signs sessions instead of the owner API key", async () => {
  const separate = { ...env, SESSION_SECRET: "session-only-secret" };
  assert.equal(sessionSecret(separate), "session-only-secret");
  assert.equal(sessionSecret(env), env.STRENGTH_API_KEY);
  const signed = (await sessionCookie(7, future(), separate.SESSION_SECRET)).split(";")[0];
  assert.deepEqual(await resolvePrincipal(req({ Cookie: signed }), separate, rejectOidc), { kind: "user", userId: 7 });
  // Whoever holds the API key can no longer mint a session for another user.
  const minted = (await sessionCookie(7, future(), env.STRENGTH_API_KEY)).split(";")[0];
  assert.equal(await resolvePrincipal(req({ Cookie: minted }), separate, rejectOidc), null);
  assert.deepEqual(await resolvePrincipal(req({ Authorization: "Bearer test-secret-key" }), separate, rejectOidc), { kind: "owner" });
});

test("bearer comparison is exact", () => {
  assert.equal(timingSafeEqualString("Bearer abc", "Bearer abc"), true);
  assert.equal(timingSafeEqualString("Bearer abd", "Bearer abc"), false);
  assert.equal(timingSafeEqualString("Bearer ab", "Bearer abc"), false);
  assert.equal(timingSafeEqualString("", "Bearer abc"), false);
});
