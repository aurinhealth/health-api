import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { handleEmailLogin, handleEmailChange } from "../src/email-login.js";
import { ensureTenancy, inviteUser, signInEmailUser, signInGoogleUser, findUser, changeUserEmail, _resetTenancyForTest } from "../src/tenancy.js";

const ORIGIN = "https://petrfitnessdata.eu";
const MIGRATION = readFileSync(new URL("../migrations/0014_passkeys_email_codes.sql", import.meta.url), "utf8");

async function setup() {
  _resetTenancyForTest();
  const sent = [];
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", DB: createD1(), EMAIL: { send: async message => { sent.push(message); return { messageId: "m" + sent.length }; } }, EMAIL_FROM: "noreply@petrfitnessdata.eu" };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(MIGRATION);
  env.RAW_DB = env.DB;
  return { env, sent };
}
const post = (path, body, origin = ORIGIN) => new Request(ORIGIN + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const codeIn = message => message.text.match(/\b(\d{6})\b/)[1];
async function change(env, user, path, body, origin) {
  const pending = [];
  const response = await handleEmailChange(post(path, body, origin), env, new URL(ORIGIN + path), { signedIn: true, user }, { waitUntil: p => pending.push(p) });
  await Promise.all(pending);
  return response;
}
async function member(env, email = "friend@example.com") {
  await inviteUser(env.DB, email, 1);
  return signInEmailUser(env.DB, env, email);
}

test("the code sign-in tells the page when it has just created the account", async () => {
  const { env, sent } = await setup();
  await inviteUser(env.DB, "new@example.com", 1);
  await handleEmailLogin(post("/auth/email/start", { email: "new@example.com" }), env, "/auth/email/start");
  const first = await handleEmailLogin(post("/auth/email/verify", { email: "new@example.com", code: codeIn(sent[0]) }), env, "/auth/email/verify");
  assert.deepEqual(await first.json(), { status: "ok", created: true });
  // A next code can be asked for after a minute.
  env.DB.sqlite.exec("UPDATE email_login_codes SET sent_at = sent_at - 120");
  await handleEmailLogin(post("/auth/email/start", { email: "new@example.com" }), env, "/auth/email/start");
  const again = await handleEmailLogin(post("/auth/email/verify", { email: "new@example.com", code: codeIn(sent[1]) }), env, "/auth/email/verify");
  assert.deepEqual(await again.json(), { status: "ok", created: false });
});

test("a user moves the account to another address with a code sent there, and the old address is told", async () => {
  const { env, sent } = await setup();
  const user = await member(env);
  assert.equal((await change(env, user, "/app/api/account/email/start", { email: " New@Example.com " })).status, 200);
  assert.equal(sent.at(-1).to, "new@example.com");
  assert.match(sent.at(-1).subject, /kód pro změnu e-mailu/);
  const code = codeIn(sent.at(-1));
  // The code changes only this account's address; it never signs anyone in.
  assert.equal((await handleEmailLogin(post("/auth/email/verify", { email: "new@example.com", code }), env, "/auth/email/verify")).status, 400);
  const done = await change(env, user, "/app/api/account/email/verify", { email: "new@example.com", code });
  assert.deepEqual(await done.json(), { status: "ok", email: "new@example.com" });
  const moved = await findUser(env.DB, user.id, env);
  assert.equal(moved.email, "new@example.com", "same account id, new address");
  assert.equal(sent.at(-1).to, "friend@example.com");
  assert.match(sent.at(-1).text, /změnil na new@example\.com/);
  assert.equal((await change(env, moved, "/app/api/account/email/verify", { email: "new@example.com", code })).status, 400, "a code works once");
});

test("a code for one account cannot move another account", async () => {
  const { env, sent } = await setup();
  const alice = await member(env, "alice@example.com"), bob = await member(env, "bob@example.com");
  await change(env, alice, "/app/api/account/email/start", { email: "shared@example.com" });
  const code = codeIn(sent.at(-1));
  assert.equal((await change(env, bob, "/app/api/account/email/verify", { email: "shared@example.com", code })).status, 400);
  assert.equal((await findUser(env.DB, bob.id, env)).email, "bob@example.com");
});

test("the change is refused for a taken, the same or the owner's address, and from another site", async () => {
  const { env } = await setup();
  const user = await member(env);
  await member(env, "other@example.com");
  const owner = await signInEmailUser(env.DB, env, "owner@example.com");
  assert.equal((await change(env, user, "/app/api/account/email/start", { email: "other@example.com" })).status, 409);
  assert.equal((await change(env, user, "/app/api/account/email/start", { email: "friend@example.com" })).status, 400);
  assert.equal((await change(env, user, "/app/api/account/email/start", { email: "owner@example.com" })).status, 400);
  assert.equal((await change(env, owner, "/app/api/account/email/start", { email: "boss@example.com" })).status, 400);
  assert.equal((await change(env, user, "/app/api/account/email/start", { email: "x@example.com" }, "https://evil.example")).status, 403);
  assert.equal((await handleEmailChange(post("/app/api/account/email/start", { email: "x@example.com" }), env, new URL(ORIGIN + "/app/api/account/email/start"), { signedIn: false })).status, 401);
});

test("after a change the old Google account is unlinked and the new address can bind its own", async () => {
  const { env } = await setup();
  await inviteUser(env.DB, "friend@gmail.com", 1);
  const user = await signInGoogleUser(env.DB, env, { sub: "g-old", email: "friend@gmail.com" });
  assert.deepEqual(await changeUserEmail(env.DB, env, user.id, "friend.new@gmail.com"), { email: "friend.new@gmail.com", previous: "friend@gmail.com" });
  assert.equal(await signInGoogleUser(env.DB, env, { sub: "g-old", email: "friend@gmail.com" }), null, "the old Google account no longer gets in");
  assert.equal((await signInGoogleUser(env.DB, env, { sub: "g-new", email: "friend.new@gmail.com" })).id, user.id);
  assert.deepEqual(await changeUserEmail(env.DB, env, user.id, "not an address"), { error: "invalid" });
  assert.deepEqual(await changeUserEmail(env.DB, env, 999, "a@example.com"), { error: "missing" });
});
