import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { handleAdminApi } from "../src/routes-admin.js";
import { ensureTenancy, inviteUser, signInEmailUser, findUser, publicUser, _resetTenancyForTest } from "../src/tenancy.js";

// Security audit 2026-11: SEC-002 (an admin moved any account to another
// e-mail without confirming it's them) and SEC-006 (the admin role stayed with
// an earlier OWNER_EMAIL).
const ORIGIN = "https://aurin.health";

async function setup() {
  _resetTenancyForTest();
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", DB: createD1() };
  await ensureTenancy(env.DB, env);
  env.RAW_DB = env.DB;
  const owner = await signInEmailUser(env.DB, env, "owner@example.com");
  await inviteUser(env.DB, "friend@example.com", owner.id);
  const friend = await signInEmailUser(env.DB, env, "friend@example.com");
  return { env, owner, friend };
}
const call = (env, user, path, method = "GET", body) => {
  const url = new URL(ORIGIN + path);
  const request = new Request(url, { method, headers: { Origin: ORIGIN, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return handleAdminApi(request, env, url, { signedIn: true, user });
};

test("no route lists, invites, blocks or moves other accounts, not even for the owner", async () => {
  const { env, owner, friend } = await setup();
  for (const [path, method, body] of [
    ["/app/api/admin/users"],
    ["/app/api/admin/users", "POST", { id: friend.id, disabled: true }],
    ["/app/api/admin/users/email", "POST", { id: friend.id, email: "attacker@evil.example" }],
    ["/app/api/admin/invites", "POST", { email: "someone@example.com" }],
    ["/app/api/admin/invites", "DELETE", { email: "someone@example.com" }]
  ]) assert.equal((await call(env, owner, path, method, body)).status, 404, (method || "GET") + " " + path);
  const row = await env.DB.prepare("SELECT email, disabled FROM users WHERE id=?").bind(friend.id).first();
  assert.deepEqual({ ...row }, { email: "friend@example.com", disabled: 0 }, "the account is untouched");
  assert.equal(await env.DB.prepare("SELECT email FROM user_invites WHERE email='someone@example.com'").first(), null);
});

test("an account with the admin role in the database but not OWNER_EMAIL gets nothing", async () => {
  const { env, friend } = await setup();
  env.DB.sqlite.exec("UPDATE users SET role = 'admin' WHERE email = 'friend@example.com'");
  const user = await findUser(env.DB, friend.id, env);
  assert.equal(user.isAdmin, false);
  assert.equal(user.isOwner, false);
  for (const path of ["/app/api/admin/waitlist", "/app/api/admin/ai-spending"]) assert.equal((await call(env, user, path)).status, 403, path);
});

test("after OWNER_EMAIL changes, the earlier owner is no longer the admin and the new one is", async () => {
  const { env, owner } = await setup();
  const row = await env.DB.prepare("SELECT id, email, name, role FROM users WHERE id=?").bind(owner.id).first();
  assert.equal(row.role, "admin", "the role written for the owner of the day stays in the database");
  assert.equal(publicUser(row, env).isAdmin, true);
  const moved = { ...env, OWNER_EMAIL: "new.owner@example.com" };
  const before = publicUser(row, moved);
  assert.deepEqual({ isAdmin: before.isAdmin, isOwner: before.isOwner, role: before.role }, { isAdmin: false, isOwner: false, role: "user" });
  assert.equal((await call(moved, before, "/app/api/admin/waitlist")).status, 403);
  const next = publicUser({ id: 9, email: "New.Owner@example.com", role: "user" }, moved);
  assert.equal(next.isAdmin, true);
});

test("the owner's own admin routes still answer, and writes still need the app's origin", async () => {
  const { env, owner } = await setup();
  const url = new URL(ORIGIN + "/app/api/admin/waitlist");
  const foreign = await handleAdminApi(new Request(url, { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" }), env, url, { signedIn: true, user: owner });
  assert.equal(foreign.status, 403);
  assert.equal((await call(env, owner, "/app/api/admin/nothing-here")).status, 404);
  assert.equal((await handleAdminApi(new Request(url), env, url, { signedIn: false })).status, 403);
});
