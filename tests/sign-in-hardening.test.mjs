// Sign-in fixes of the security review of 2026-11-04 (points 11, 30, 32 and 41; points 4, 6 and 31
// are in email-login, native-connect and apple-login tests).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { handleAccountApi } from "../src/routes-account.js";
import { handleSignOut } from "../src/dashboard-auth.js";
import { handleEmailChange } from "../src/email-login.js";
import { signedOutEverywhereEmail } from "../src/email-sender.js";
import { withTimeZone } from "../src/user-time.js";
import { ensureTenancy, inviteUser, signInEmailUser, signInGoogleUser, findUser, mayCreateAccount, changeUserEmail, plainEmail, _resetTenancyForTest } from "../src/tenancy.js";

const ORIGIN = "https://aurin.health";
const MIGRATION = ["0014_passkeys_email_codes.sql", "0027_email_code_limits.sql"].map(name => readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8")).join("\n");

async function setup(extra = {}) {
  _resetTenancyForTest();
  const sent = [];
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", DB: createD1(), EMAIL: { send: async message => { sent.push(message); return { messageId: "m" + sent.length }; } }, EMAIL_FROM: "noreply@aurin.health", ...extra };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(MIGRATION);
  env.DB.sqlite.exec("CREATE TABLE IF NOT EXISTS push_tokens (user_id INTEGER NOT NULL, token TEXT NOT NULL, environment TEXT NOT NULL DEFAULT 'production', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, token))");
  env.RAW_DB = env.DB;
  return { env, sent };
}
async function member(env, email = "friend@example.com") {
  await inviteUser(env.DB, email, 1);
  const signedIn = await signInEmailUser(env.DB, env, email);
  return findUser(env.DB, signedIn.id, env);
}
const PHONE = "a".repeat(64), OLD_PHONE = "b".repeat(64), OTHER = "c".repeat(64);
function addTokens(env, userId, tokens) {
  for (const token of tokens) env.DB.sqlite.prepare("INSERT INTO push_tokens(user_id, token) VALUES(?, ?)").run(userId, token);
}
const tokensOf = (env, userId) => env.DB.sqlite.prepare("SELECT token FROM push_tokens WHERE user_id = ? ORDER BY token").all(userId).map(row => row.token);
const call = (env, user, path, { method = "POST", body } = {}) => handleAccountApi(
  new Request(ORIGIN + path, { method, headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }),
  env, { waitUntil() {} }, new URL(ORIGIN + path), { signedIn: true, user });

test("signing out the other devices stops their notifications, but not the caller's (point 11)", async () => {
  const { env } = await setup();
  const user = await member(env), other = await member(env, "other@example.com");
  addTokens(env, user.id, [PHONE, OLD_PHONE]);
  addTokens(env, other.id, [OTHER]);
  // An app from before sends no token: nothing changes, so its own phone keeps its notifications.
  assert.equal((await call(env, user, "/app/api/account/sign-out-everywhere", { body: {} })).status, 200);
  assert.deepEqual(tokensOf(env, user.id), [PHONE, OLD_PHONE]);
  // The app sends its own token: only that one stays, and no other account's is touched.
  const fresh = await findUser(env.DB, user.id, env);
  assert.equal((await call(env, fresh, "/app/api/account/sign-out-everywhere", { body: { pushToken: PHONE.toUpperCase() } })).status, 200);
  assert.deepEqual(tokensOf(env, user.id), [PHONE]);
  assert.deepEqual(tokensOf(env, other.id), [OTHER]);
  // A phone without notifications sends null: none stays.
  await call(env, await findUser(env.DB, user.id, env), "/app/api/account/sign-out-everywhere", { body: { pushToken: null } });
  assert.deepEqual(tokensOf(env, user.id), []);
});

test("moving the account to another address keeps only the caller's notifications too (point 11)", async () => {
  const { env, sent } = await setup();
  const user = await member(env);
  addTokens(env, user.id, [PHONE, OLD_PHONE]);
  const pending = [];
  const post = async (path, body) => { const response = await handleEmailChange(new Request(ORIGIN + path, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, new URL(ORIGIN + path), { signedIn: true, user }, { waitUntil: p => pending.push(p) }); await Promise.all(pending); return response; };
  await post("/app/api/account/email/start", { email: "new@example.com" });
  const code = sent.at(-1).text.match(/\b(\d{6})\b/)[1];
  assert.equal((await post("/app/api/account/email/verify", { email: "new@example.com", code, pushToken: PHONE })).status, 200);
  assert.deepEqual(tokensOf(env, user.id), [PHONE]);
});

test("\"Odhlásit se\" ends every session of the account, and so all its notifications (point 11)", async () => {
  const { env } = await setup();
  const user = await member(env);
  addTokens(env, user.id, [PHONE, OLD_PHONE]);
  // A copy already signed out (an old epoch) only clears its cookie.
  await handleSignOut(new Request(ORIGIN + "/app/logout", { method: "POST" }), env, { ...user, sessionEpoch: user.sessionEpoch + 7 });
  assert.deepEqual(tokensOf(env, user.id), [PHONE, OLD_PHONE]);
  await handleSignOut(new Request(ORIGIN + "/app/logout", { method: "POST" }), env, user);
  assert.deepEqual(tokensOf(env, user.id), []);
});

test("a fresh session after signing out the other devices counts as a sign-in (point 30)", async () => {
  const { env } = await setup();
  const user = await member(env);
  env.DB.sqlite.exec(`UPDATE users SET last_login_at = '2024-01-01 00:00:00' WHERE id = ${user.id}`);
  await call(env, user, "/app/api/account/sign-out-everywhere", { body: {} });
  const row = env.DB.sqlite.prepare("SELECT last_login_at FROM users WHERE id = ?").get(user.id);
  assert.ok(row.last_login_at > "2026-01-01", row.last_login_at);
});

test("signing out the other devices is told to the account's e-mail (point 41)", async () => {
  const { env, sent } = await setup();
  const user = await member(env);
  await call(env, user, "/app/api/account/sign-out-everywhere", { body: {} });
  assert.equal(sent.at(-1).to, "friend@example.com");
  assert.equal(sent.at(-1).subject, "Ostatní zařízení se odhlásila z tvého účtu Aurin");
  // At most two notices an hour: the button cannot spend the day's e-mails.
  const before = sent.length;
  for (let i = 0; i < 3; i++) await call(env, await findUser(env.DB, user.id, env), "/app/api/account/sign-out-everywhere", { body: {} });
  assert.equal(sent.length, before + 1);
  const en = withTimeZone("Europe/London", () => signedOutEverywhereEmail("en", new Date("2026-11-04T10:00:00Z")));
  assert.match(en.text, /^Every device but one was signed out of your Aurin account on 4 November 2026 at 10:00 GMT/);
  assert.match(en.text, /Settings → Account/);
});

test("unlinking the Apple ID asks to confirm it's you (point 41)", async () => {
  const { env } = await setup();
  const user = await member(env);
  env.DB.sqlite.exec("CREATE TABLE IF NOT EXISTS user_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id INTEGER NOT NULL, email TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT, PRIMARY KEY (provider, subject))");
  env.DB.sqlite.prepare("INSERT INTO user_identities(provider, subject, user_id) VALUES('apple', 'apple-1', ?)").run(user.id);
  const response = await call(env, user, "/app/api/me/apple", { method: "DELETE" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).status, "step_up_required");
  assert.ok(env.DB.sqlite.prepare("SELECT 1 FROM user_identities WHERE user_id = ?").get(user.id), "still linked");
});

test("only plain addresses open an account or become one's new address (point 32)", async () => {
  const kelvin = "Karel@example.com";
  assert.equal(plainEmail("karel@example.com"), true);
  assert.equal(plainEmail(" Karel@Example.com "), true);
  assert.equal(plainEmail(kelvin), false);
  assert.equal(plainEmail("jiří@example.com"), false);
  const { env } = await setup({ OPEN_SIGNUP: "true" });
  assert.equal(await mayCreateAccount(env.DB, env, "jiří@example.com"), false);
  // An existing account is not taken over by a Google account whose address folds into it.
  const karel = await member(env, "karel@example.com");
  assert.equal(await signInGoogleUser(env.DB, env, { sub: "google-stranger", email: kelvin }), null);
  assert.equal(env.DB.sqlite.prepare("SELECT google_sub FROM users WHERE id = ?").get(karel.id).google_sub, null);
  // Its own Google account, linked before, still signs it in.
  assert.ok(await signInGoogleUser(env.DB, env, { sub: "google-karel", email: "karel@example.com" }));
  assert.ok(await signInGoogleUser(env.DB, env, { sub: "google-karel", email: kelvin }), "linked by its sub, not the address");
  assert.deepEqual(await changeUserEmail(env.DB, env, karel.id, kelvin), { error: "invalid" });
  const refused = await call(env, karel, "/app/api/account/email/start", { body: { email: kelvin } });
  assert.equal(refused.status, 400);
});
