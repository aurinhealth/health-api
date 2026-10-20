import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { handleEmailLogin, handleEmailChange } from "../src/email-login.js";
import { ensureTenancy, inviteUser, signInEmailUser, signInGoogleUser, findUser, changeUserEmail, _resetTenancyForTest } from "../src/tenancy.js";
import { resolvePrincipal, sessionMatchesUser } from "../src/dashboard-auth.js";

const ORIGIN = "https://petrfitnessdata.eu";
const MIGRATION = ["0014_passkeys_email_codes.sql", "0027_email_code_limits.sql"].map(name => readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8")).join("\n");

async function setup(extra = {}) {
  _resetTenancyForTest();
  const sent = [];
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", DB: createD1(), EMAIL: { send: async message => { sent.push(message); return { messageId: "m" + sent.length }; } }, EMAIL_FROM: "noreply@petrfitnessdata.eu", ...extra };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(MIGRATION);
  env.RAW_DB = env.DB;
  return { env, sent };
}
const post = (path, body, origin = ORIGIN, ip) => new Request(ORIGIN + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(ip ? { "CF-Connecting-IP": ip } : {}) }, body: JSON.stringify(body) });
const codeIn = message => message.text.match(/\b(\d{6})\b/)[1];
async function change(env, user, path, body, origin, ip) {
  const pending = [];
  const response = await handleEmailChange(post(path, body, origin, ip), env, new URL(ORIGIN + path), { signedIn: true, user }, { waitUntil: p => pending.push(p) });
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
  // Every other device is signed out (the epoch moved on); this one got a fresh cookie.
  assert.equal(moved.sessionEpoch, 1);
  const fresh = (done.headers.get("Set-Cookie") || "").split(";")[0];
  assert.match(fresh, /^pfd_session=/);
  const principal = await resolvePrincipal(new Request(ORIGIN + "/app/api/me", { headers: { Cookie: fresh } }), env);
  assert.equal(principal.epoch, 1);
  assert.equal(sessionMatchesUser(principal, moved), true);
  assert.equal(sessionMatchesUser({ kind: "user", userId: user.id, epoch: 0 }, moved), false);
  assert.equal(sent.at(-1).to, "friend@example.com");
  assert.match(sent.at(-1).text, /změnil na new@example\.com/);
  assert.equal((await change(env, moved, "/app/api/account/email/verify", { email: "new@example.com", code })).status, 400, "a code works once");
});

// Runs `work` as if the clock showed `time` (the handlers read Date.now()).
async function at(time, work) {
  const real = Date.now;
  Date.now = () => time;
  try { return await work(); } finally { Date.now = real; }
}

test("one account asks for at most two e-mail change codes a minute and five an hour, whatever the address", async () => {
  const { env, sent } = await setup();
  const user = await member(env);
  const t0 = Date.parse("2026-10-07T08:00:00Z"), start = (email, time, ip = "203.0.113.5") => at(time, () => change(env, user, "/app/api/account/email/start", { email }, ORIGIN, ip));
  assert.equal((await start("a1@example.com", t0)).status, 200);
  assert.equal((await start("a2@example.com", t0)).status, 200);
  assert.equal((await start("a3@example.com", t0, "198.51.100.7")).status, 429, "the third in a minute, even from another network");
  const later = [];
  for (let i = 4; i <= 7; i++) later.push((await start("a" + i + "@example.com", t0 + (i - 2) * 60_000)).status);
  assert.deepEqual(later, [200, 200, 200, 429], "the sixth in an hour");
  assert.equal(sent.length, 5);
});

test("codes to move an account have their own day's budget and never take the sign-in codes", async () => {
  const { env, sent } = await setup({ EMAIL_CODES_PER_DAY: "1", EMAIL_CHANGE_CODES_PER_DAY: "2" });
  const t0 = Date.parse("2026-10-07T08:00:00Z"), answers = [];
  for (let i = 0; i < 3; i++) {
    const user = await member(env, "m" + i + "@example.com");
    const original = console.warn;
    console.warn = () => {};
    try { answers.push((await at(t0, () => change(env, user, "/app/api/account/email/start", { email: "new" + i + "@example.com" }, ORIGIN, "203.0.113." + i))).status); }
    finally { console.warn = original; }
  }
  assert.deepEqual(answers, [200, 200, 429], "the third change code of the day");
  assert.equal(sent.length, 2);
  const pending = [];
  await at(t0, () => handleEmailLogin(post("/auth/email/start", { email: "m2@example.com" }), env, "/auth/email/start", { waitUntil: p => pending.push(p) }));
  await Promise.all(pending);
  assert.equal(sent.length, 3);
  assert.equal(sent.at(-1).to, "m2@example.com", "another user still gets a sign-in code");
});

test("one caller asks for at most five e-mail change codes a minute, across accounts", async () => {
  const { env } = await setup();
  const t0 = Date.parse("2026-10-07T08:00:00Z"), answers = [];
  for (let i = 0; i < 6; i++) {
    const user = await member(env, "m" + i + "@example.com");
    answers.push((await at(t0, () => change(env, user, "/app/api/account/email/start", { email: "new" + i + "@example.com" }, ORIGIN, "203.0.113.5"))).status);
  }
  assert.deepEqual(answers, [200, 200, 200, 200, 200, 429]);
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

test("after a change the same Google account still signs in to the same account, and its address stays", async () => {
  const { env } = await setup();
  await inviteUser(env.DB, "friend@gmail.com", 1);
  const user = await signInGoogleUser(env.DB, env, { sub: "g-old", email: "friend@gmail.com" });
  assert.deepEqual(await changeUserEmail(env.DB, env, user.id, "friend.new@example.com"), { email: "friend.new@example.com", previous: "friend@gmail.com" });
  const again = await signInGoogleUser(env.DB, env, { sub: "g-old", email: "friend@gmail.com", name: "Friend" });
  assert.equal(again.id, user.id, "the Google account stays linked");
  assert.equal(again.email, "friend.new@example.com");
  assert.equal((await findUser(env.DB, user.id, env)).email, "friend.new@example.com", "the sign-in does not put the Google address back");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 2, "no new empty account (owner and friend)");
  // Another Google account with the new address does not take the account over.
  assert.equal(await signInGoogleUser(env.DB, env, { sub: "g-new", email: "friend.new@example.com" }), null);
  assert.deepEqual(await changeUserEmail(env.DB, env, user.id, "not an address"), { error: "invalid" });
  assert.deepEqual(await changeUserEmail(env.DB, env, 999, "a@example.com"), { error: "missing" });
});

test("a Google account whose address changed keeps the owner's e-mail and the owner's role", async () => {
  const { env } = await setup();
  const owner = await signInGoogleUser(env.DB, env, { sub: "g-owner", email: "owner@example.com" });
  assert.equal(owner.isOwner, true);
  const later = await signInGoogleUser(env.DB, env, { sub: "g-owner", email: "petr.renamed@gmail.com" });
  assert.equal(later.id, owner.id);
  assert.equal(later.isOwner, true);
  assert.equal(later.email, "owner@example.com");
  const row = await env.DB.prepare("SELECT email, role FROM users WHERE id=?").bind(owner.id).first();
  assert.deepEqual({ ...row }, { email: "owner@example.com", role: "admin" });
});

