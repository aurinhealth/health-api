import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { handleEmailLogin, sendCode } from "../src/email-login.js";
import { emailConfigured, emailSender, signInCodeEmail, passkeyAddedEmail } from "../src/email-sender.js";
import { ensureTenancy, inviteUser, signInEmailUser, setUserDisabled, _resetTenancyForTest } from "../src/tenancy.js";
import { resolvePrincipal } from "../src/dashboard-auth.js";

const ORIGIN = "https://petrfitnessdata.eu";
const MIGRATION = readFileSync(new URL("../migrations/0014_passkeys_email_codes.sql", import.meta.url), "utf8");

async function setup(extra = {}) {
  _resetTenancyForTest();
  const sent = [];
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", DB: createD1(), EMAIL: { send: async message => { sent.push(message); return { messageId: "m" + sent.length }; } }, EMAIL_FROM: "noreply@petrfitnessdata.eu", ...extra };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(MIGRATION);
  return { env, sent };
}
const request = (path, body, { origin = ORIGIN, lang } = {}) => new Request(ORIGIN + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(lang ? { "X-Interface-Language": lang } : {}) }, body: JSON.stringify(body) });
async function start(env, email, options) {
  const pending = [];
  const response = await handleEmailLogin(request("/auth/email/start", { email }, options), env, "/auth/email/start", { waitUntil: p => pending.push(p) });
  await Promise.all(pending);
  return response;
}
const verify = (env, email, code, options) => handleEmailLogin(request("/auth/email/verify", { email, code }, options), env, "/auth/email/verify");
const codeIn = message => message.text.match(/\b(\d{6})\b/)[1];

test("e-mail sign-in stays off until the binding and the sender address exist", async () => {
  assert.equal(emailConfigured({}), false);
  assert.equal(emailConfigured({ EMAIL: { send() {} } }), false);
  assert.equal(emailConfigured({ EMAIL: { send() {} }, EMAIL_FROM: "not an address" }), false);
  assert.equal(emailConfigured({ EMAIL_FROM: "noreply@petrfitnessdata.eu" }), false);
  assert.equal(emailConfigured({ EMAIL: { send() {} }, EMAIL_FROM: " noreply@petrfitnessdata.eu " }), true);
  assert.equal(emailSender({ EMAIL_FROM: " noreply@petrfitnessdata.eu " }), "noreply@petrfitnessdata.eu");
  const { env } = await setup({ EMAIL_FROM: "" });
  assert.equal((await start(env, "owner@example.com")).status, 404);
  assert.equal(await handleEmailLogin(request("/auth/google", {}), env, "/auth/google"), null);
});

test("an invited address gets a code and signs in with it once", async () => {
  const { env, sent } = await setup();
  await inviteUser(env.DB, "friend@example.com", 1);
  const response = await start(env, " Friend@Example.com ");
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "friend@example.com");
  assert.deepEqual(sent[0].from, { email: "noreply@petrfitnessdata.eu", name: "Loadwise" });
  const code = codeIn(sent[0]);
  assert.match(sent[0].subject, new RegExp("^" + code + " je tvůj kód"));
  assert.match(sent[0].html, new RegExp(code));
  // Only a keyed hash is stored, never the code itself.
  const row = env.DB.sqlite.prepare("SELECT * FROM email_login_codes").get();
  assert.ok(row.code_hash && !JSON.stringify(row).includes(code));

  const login = await verify(env, "friend@example.com", code.slice(0, 3) + " " + code.slice(3));
  assert.equal(login.status, 200);
  const cookie = login.headers.get("Set-Cookie").split(";")[0];
  const principal = await resolvePrincipal(new Request(ORIGIN + "/app", { headers: { Cookie: cookie } }), env);
  const user = env.DB.sqlite.prepare("SELECT id, role, last_login_at FROM users WHERE email = 'friend@example.com'").get();
  // Signing in counts as activity: accounts unused for two years are deleted by last_login_at.
  assert.ok(user.last_login_at);
  assert.deepEqual(principal, { kind: "user", userId: user.id });
  assert.equal(user.role, "user");
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM user_invites").get().n, 0, "the invitation is used up");
  assert.equal((await verify(env, "friend@example.com", code)).status, 400, "a code works once");
});

test("addresses without access get the same answer and no e-mail", async () => {
  const { env, sent } = await setup();
  await inviteUser(env.DB, "blocked@example.com", 1);
  const blocked = await signInEmailUser(env.DB, env, "blocked@example.com");
  await setUserDisabled(env.DB, env, blocked.id, true);
  for (const email of ["stranger@example.com", "blocked@example.com"]) {
    const response = await start(env, email);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  }
  assert.equal(sent.length, 0);
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM email_login_codes").get().n, 0);
  assert.equal((await verify(env, "stranger@example.com", "123456")).status, 400);
  assert.equal((await start(env, "not-an-email")).status, 400);
  assert.equal((await start(env, "owner@example.com", { origin: "https://evil.example" })).status, 403);
});

test("the owner signs in by code as the admin, in the language of the app", async () => {
  const { env, sent } = await setup();
  await start(env, "owner@example.com", { lang: "en" });
  assert.match(sent[0].subject, /^\d{6} is your Loadwise sign-in code$/);
  assert.match(sent[0].html, /<html lang="en">/);
  const response = await verify(env, "owner@example.com", codeIn(sent[0]));
  assert.equal(response.status, 200);
  assert.equal(env.DB.sqlite.prepare("SELECT role FROM users WHERE email = 'owner@example.com'").get().role, "admin");
});

test("five wrong tries use the code up", async () => {
  const { env, sent } = await setup();
  await start(env, "owner@example.com");
  const code = codeIn(sent[0]), wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i++) assert.equal((await (await verify(env, "owner@example.com", wrong)).json()).message, "Kód nesedí. Zkontroluj ho, nebo si nech poslat nový.");
  assert.equal((await (await verify(env, "owner@example.com", wrong)).json()).message, "Kód už neplatí. Nech si poslat nový.");
  const late = await verify(env, "owner@example.com", code);
  assert.equal(late.status, 400, "the right code is refused after five wrong tries");
  assert.equal((await verify(env, "owner@example.com", "12345")).status, 400);
});

test("codes expire after ten minutes", async () => {
  const { env, sent } = await setup();
  await start(env, "owner@example.com");
  env.DB.sqlite.exec("UPDATE email_login_codes SET expires_at = expires_at - 601");
  assert.equal((await verify(env, "owner@example.com", codeIn(sent[0]))).status, 400);
});

test("an address gets at most one code a minute and ten a day", async () => {
  const { env, sent } = await setup();
  const now = Date.parse("2026-10-07T08:00:00Z");
  assert.equal(await sendCode(env, "owner@example.com", "cs", { now }), true);
  assert.equal(await sendCode(env, "owner@example.com", "cs", { now: now + 30_000 }), false);
  for (let i = 1; i < 10; i++) assert.equal(await sendCode(env, "owner@example.com", "cs", { now: now + i * 61_000 }), true);
  assert.equal(await sendCode(env, "owner@example.com", "cs", { now: now + 11 * 61_000 }), false, "the eleventh code of the day");
  assert.equal(await sendCode(env, "owner@example.com", "cs", { now: Date.parse("2026-10-08T00:01:00Z") }), true, "a new day");
  assert.equal(sent.length, 11);
  // A new code replaces the old one and resets the tries.
  const latest = codeIn(sent.at(-1)), earlier = codeIn(sent.at(-2));
  if (latest !== earlier) assert.equal((await verify(env, "owner@example.com", earlier)).status, 400);
});

test("a failed e-mail never shows in the answer", async () => {
  const { env } = await setup({ EMAIL: { send: async () => { throw Object.assign(new Error("Domain not onboarded"), { code: "E_SENDER_DOMAIN_NOT_AVAILABLE" }); } } });
  const errors = [], original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try { assert.deepEqual(await (await start(env, "owner@example.com")).json(), { status: "ok" }); }
  finally { console.error = original; }
  assert.deepEqual(errors, ["Sign-in code e-mail failed E_SENDER_DOMAIN_NOT_AVAILABLE"]);
});

test("e-mail texts in Czech and English", () => {
  const cs = signInCodeEmail("cs", "042137"), en = signInCodeEmail("en", "042137");
  assert.equal(cs.subject, "042137 je tvůj kód pro přihlášení do Loadwise");
  assert.match(cs.text, /Platí 10 minut/);
  assert.equal(en.subject, "042137 is your Loadwise sign-in code");
  const notice = passkeyAddedEmail("en", "Apple Passwords (iPhone)", new Date("2026-10-07T08:00:00Z"));
  assert.match(notice.text, /“Apple Passwords \(iPhone\)” was added to your Loadwise account on 7 October 2026 at 10:00/);
  assert.match(passkeyAddedEmail("cs", "<b>x</b>").html, /&lt;b&gt;x&lt;\/b&gt;/);
});
