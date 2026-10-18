import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { handleEmailLogin, sendCode, codesPerDay, openCodesPerDay } from "../src/email-login.js";
import { emailConfigured, emailSender, signInCodeEmail, passkeyAddedEmail } from "../src/email-sender.js";
import { ensureTenancy, inviteUser, signInEmailUser, setUserDisabled, _resetTenancyForTest } from "../src/tenancy.js";
import { resolvePrincipal } from "../src/dashboard-auth.js";

const ORIGIN = "https://petrfitnessdata.eu";
const MIGRATION = ["0014_passkeys_email_codes.sql", "0027_email_code_limits.sql"].map(name => readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8")).join("\n");

async function setup(extra = {}) {
  _resetTenancyForTest();
  const sent = [];
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", DB: createD1(), EMAIL: { send: async message => { sent.push(message); return { messageId: "m" + sent.length }; } }, EMAIL_FROM: "noreply@petrfitnessdata.eu", ...extra };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(MIGRATION);
  return { env, sent };
}
const request = (path, body, { origin = ORIGIN, lang, ip } = {}) => new Request(ORIGIN + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(lang ? { "X-Interface-Language": lang } : {}), ...(ip ? { "CF-Connecting-IP": ip } : {}) }, body: JSON.stringify(body) });
async function start(env, email, options) {
  const pending = [];
  const response = await handleEmailLogin(request("/auth/email/start", { email }, options), env, "/auth/email/start", { waitUntil: p => pending.push(p) });
  await Promise.all(pending);
  return response;
}
const verify = (env, email, code, options) => handleEmailLogin(request("/auth/email/verify", { email, code }, options), env, "/auth/email/verify");
const codeIn = message => message.text.match(/\b(\d{6})\b/)[1];
// Runs `work` as if the clock showed `time` (the handlers read Date.now()).
async function at(time, work) {
  const real = Date.now;
  Date.now = () => time;
  try { return await work(); } finally { Date.now = real; }
}
async function quietly(work) {
  const original = console.warn;
  console.warn = () => {};
  try { return await work(); } finally { console.warn = original; }
}

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
  assert.deepEqual(sent[0].from, { email: "noreply@petrfitnessdata.eu", name: "Aurin" });
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
  assert.deepEqual(principal, { kind: "user", userId: user.id, epoch: 0 });
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
  assert.match(sent[0].subject, /^\d{6} is your Aurin sign-in code$/);
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
  assert.equal(cs.subject, "042137 je tvůj kód pro přihlášení do Aurinu");
  assert.match(cs.text, /Platí 10 minut/);
  assert.equal(en.subject, "042137 is your Aurin sign-in code");
  const notice = passkeyAddedEmail("en", "Apple Passwords (iPhone)", new Date("2026-10-07T08:00:00Z"));
  assert.match(notice.text, /“Apple Passwords \(iPhone\)” was added to your Aurin account on 7 October 2026 at 10:00/);
  assert.match(passkeyAddedEmail("cs", "<b>x</b>").html, /&lt;b&gt;x&lt;\/b&gt;/);
});

test("App Review: the review address gets the fixed code, which still needs sending and works once", async () => {
  const { env, sent } = await setup({ APP_REVIEW_EMAIL: "Review@Example.com", APP_REVIEW_CODE: "246810", APP_REVIEW_UNTIL: "2999-12-31" });
  await inviteUser(env.DB, "review@example.com", 1);
  assert.equal((await verify(env, "review@example.com", "246810")).status, 400, "no code sent yet");
  await start(env, "review@example.com");
  assert.equal(codeIn(sent[0]), "246810");
  assert.equal((await verify(env, "review@example.com", "246810")).status, 200);
  assert.equal((await verify(env, "review@example.com", "246810")).status, 400, "used up");
  // Anyone else still gets a random code.
  await inviteUser(env.DB, "friend@example.com", 1);
  await start(env, "friend@example.com");
  assert.notEqual(codeIn(sent[1]), "246810");
});

test("OPEN_SIGNUP: any address gets a code and an account", async () => {
  const { env, sent } = await setup({ OPEN_SIGNUP: "true" });
  await start(env, "stranger@example.com");
  assert.equal(sent.length, 1);
  assert.equal((await verify(env, "stranger@example.com", codeIn(sent[0]))).status, 200);
  assert.ok(env.DB.sqlite.prepare("SELECT id FROM users WHERE email = 'stranger@example.com'").get());
});

test("one caller starts at most five sign-ins a minute, whatever the addresses", async () => {
  const { env, sent } = await setup({ OPEN_SIGNUP: "true" });
  for (let i = 0; i < 5; i++) assert.equal((await start(env, "person" + i + "@example.com", { ip: "203.0.113.5" })).status, 200);
  const refused = await start(env, "person5@example.com", { ip: "203.0.113.5" });
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { message: "Příliš mnoho pokusů o přihlášení. Zkus to za chvíli." });
  assert.equal(sent.length, 5);
  assert.equal((await start(env, "person5@example.com", { ip: "203.0.113.6" })).status, 200, "another caller");
  assert.equal(sent.length, 6);
  // Verifying a code is not limited by this: the code itself allows five tries.
  assert.equal((await verify(env, "person0@example.com", codeIn(sent[0]), { ip: "203.0.113.5" })).status, 200);
});

test("all codes together stay under the day's budget (EMAIL_CODES_PER_DAY, 500 by default)", async () => {
  assert.equal(codesPerDay({}), 500);
  assert.equal(codesPerDay({ EMAIL_CODES_PER_DAY: "20" }), 20);
  assert.equal(codesPerDay({ EMAIL_CODES_PER_DAY: "nonsense" }), 500);
  const { env, sent } = await setup({ EMAIL_CODES_PER_DAY: "2" });
  for (const email of ["a@example.com", "b@example.com", "c@example.com"]) await inviteUser(env.DB, email, 1);
  const now = Date.parse("2026-10-07T08:00:00Z");
  assert.equal(await sendCode(env, "a@example.com", "cs", { now }), true);
  assert.equal(await sendCode(env, "b@example.com", "cs", { now }), true);
  const warnings = [], original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try { assert.equal(await sendCode(env, "c@example.com", "cs", { now }), false, "the third code of the day"); }
  finally { console.warn = original; }
  assert.deepEqual(warnings, ["Sign-in code e-mail budget of the day is used up"]);
  assert.equal(sent.length, 2);
  // The next day the budget is back.
  assert.equal(await sendCode(env, "c@example.com", "cs", { now: Date.parse("2026-10-08T00:01:00Z") }), true);
  assert.equal(sent.length, 3);
});

test("one caller starts at most fifty sign-ins a day, and an IPv6 caller is its whole /64", async () => {
  const { env, sent } = await setup({ OPEN_SIGNUP: "true" });
  const t0 = Date.parse("2026-10-07T00:00:00Z"), answers = [];
  // 24 an hour, under the minute and hour limits.
  for (let i = 0; i < 51; i++) answers.push((await at(t0 + i * 150_000, () => start(env, "p" + i + "@example.com", { ip: "203.0.113.5" }))).status);
  assert.deepEqual(answers.slice(0, 50), Array(50).fill(200));
  assert.equal(answers[50], 429, "the fifty-first of the day");
  assert.equal(sent.length, 50);
  assert.equal((await at(Date.parse("2026-10-08T00:00:30Z"), () => start(env, "p51@example.com", { ip: "203.0.113.5" }))).status, 200, "a new day");
  for (let i = 0; i < 5; i++) assert.equal((await at(t0, () => start(env, "v" + i + "@example.com", { ip: "2001:db8:1:2::" + (i + 1) }))).status, 200);
  assert.equal((await at(t0, () => start(env, "v5@example.com", { ip: "2001:0DB8:0001:0002:ffff:1:2:3" }))).status, 429, "another address of the same /64");
  assert.equal((await at(t0, () => start(env, "v6@example.com", { ip: "2001:db8:1:3::1" }))).status, 200, "the next /64");
});

test("addresses that get a code only through OPEN_SIGNUP use at most four fifths of the day's budget", async () => {
  assert.equal(openCodesPerDay({}), 400);
  assert.equal(openCodesPerDay({ EMAIL_CODES_PER_DAY: "5" }), 4);
  assert.equal(openCodesPerDay({ EMAIL_CODES_PER_DAY: "1" }), 0);
  const { env, sent } = await setup({ OPEN_SIGNUP: "true", EMAIL_CODES_PER_DAY: "5" });
  await inviteUser(env.DB, "member@example.com", 1);
  await signInEmailUser(env.DB, env, "member@example.com");
  const now = Date.parse("2026-10-07T08:00:00Z");
  for (let i = 0; i < 4; i++) assert.equal(await sendCode(env, "junk" + i + "@example.com", "cs", { now }), true);
  assert.equal(await quietly(() => sendCode(env, "junk4@example.com", "cs", { now })), false, "the open share is used up");
  assert.equal(await sendCode(env, "member@example.com", "cs", { now }), true, "an account still gets its code");
  assert.equal(await quietly(() => sendCode(env, "owner@example.com", "cs", { now })), false, "then the whole budget is used");
  assert.equal(sent.length, 5);
  // The page answers the same either way.
  assert.deepEqual(await (await quietly(() => start(env, "junk5@example.com"))).json(), { status: "ok" });
});

test("a send that is refused leaves the address's pending code as it was", async () => {
  const { env, sent } = await setup({ EMAIL_CODES_PER_DAY: "1" });
  const now = Date.parse("2026-10-07T08:00:00Z");
  assert.equal(await sendCode(env, "owner@example.com", "cs", { now }), true);
  assert.equal(await quietly(() => sendCode(env, "owner@example.com", "cs", { now: now + 61_000 })), false, "the day's budget is used up");
  assert.equal(env.DB.sqlite.prepare("SELECT day_count FROM email_login_codes").get().day_count, 1, "nor is it counted for the address");
  assert.equal((await at(now + 120_000, () => verify(env, "owner@example.com", codeIn(sent[0])))).status, 200);
});

test("when the e-mail with a new code fails, the code before it still works", async () => {
  const sent = [];
  let down = false;
  const { env } = await setup({ EMAIL: { send: async message => { if (down) throw new Error("down"); sent.push(message); return { messageId: "m" }; } } });
  const now = Date.parse("2026-10-07T08:00:00Z");
  assert.equal(await sendCode(env, "owner@example.com", "cs", { now }), true);
  const wrong = codeIn(sent[0]) === "000000" ? "111111" : "000000";
  assert.equal((await at(now + 10_000, () => verify(env, "owner@example.com", wrong))).status, 400);
  down = true;
  await assert.rejects(sendCode(env, "owner@example.com", "cs", { now: now + 61_000 }), /down/);
  assert.equal(env.DB.sqlite.prepare("SELECT attempts FROM email_login_codes").get().attempts, 1, "its tries so far still count");
  assert.equal((await at(now + 120_000, () => verify(env, "owner@example.com", codeIn(sent[0])))).status, 200);
});

test("one caller checks at most ten codes a minute, thirty an hour and a hundred a day", async () => {
  const { env } = await setup();
  const t0 = Date.parse("2026-10-07T00:00:00Z"), ip = "203.0.113.7";
  for (let i = 0; i < 10; i++) assert.equal((await at(t0, () => verify(env, "x" + i + "@example.com", "123456", { ip }))).status, 400);
  const refused = await at(t0, () => verify(env, "x10@example.com", "123456", { ip }));
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { message: "Příliš mnoho pokusů o přihlášení. Zkus to za chvíli." });
  assert.equal((await at(t0, () => verify(env, "x10@example.com", "123456", { ip: "2001:db8::1" }))).status, 400, "another caller");
  // One every 100 seconds: the thirty-first of the hour is refused.
  const hourly = [];
  for (let i = 0; i < 31; i++) hourly.push((await at(t0 + i * 100_000, () => verify(env, "h" + i + "@example.com", "123456", { ip: "203.0.113.8" }))).status);
  assert.deepEqual(hourly, [...Array(30).fill(400), 429]);
  // From the next hour on, 27 an hour: ninety more, then the day's limit.
  const answers = [];
  for (let i = 0; i < 100; i++) answers.push((await at(t0 + 3_600_000 + i * 130_000, () => verify(env, "y" + i + "@example.com", "123456", { ip }))).status);
  assert.deepEqual(answers, [...Array(90).fill(400), ...Array(10).fill(429)], "a hundred a day in all");
});

test("after twenty wrong codes in a day an address is locked until midnight (UTC)", async () => {
  const { env, sent } = await setup();
  const t0 = Date.parse("2026-10-07T08:00:00Z");
  let caller = 0;
  const guess = (code, time) => at(time, () => verify(env, "owner@example.com", code, { ip: "198.51.100." + (++caller) }));
  // Five codes with four wrong tries each: each code alone would still allow a fifth.
  for (let round = 0; round < 5; round++) {
    const time = t0 + round * 61_000;
    assert.equal(await sendCode(env, "owner@example.com", "cs", { now: time }), true);
    const wrong = codeIn(sent.at(-1)) === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) assert.equal((await guess(wrong, time + 1000)).status, 400);
  }
  const locked = await guess(codeIn(sent.at(-1)), t0 + 5 * 61_000);
  assert.equal(locked.status, 429, "even the right code");
  assert.deepEqual(await locked.json(), { message: "Na tenhle e-mail bylo zadáno příliš mnoho špatných kódů. Zkus to zítra." });
  assert.equal(await sendCode(env, "owner@example.com", "cs", { now: t0 + 6 * 61_000 }), false, "no code goes out while it is locked");
  assert.equal(sent.length, 5);
  const tomorrow = Date.parse("2026-10-08T00:01:00Z");
  assert.equal(await sendCode(env, "owner@example.com", "cs", { now: tomorrow }), true);
  assert.equal((await guess(codeIn(sent.at(-1)), tomorrow + 1000)).status, 200, "a new day");
});

test("a right code is no failure: nineteen wrong ones and a sign-in leave nineteen", async () => {
  const { env, sent } = await setup();
  const t0 = Date.parse("2026-10-07T08:00:00Z");
  let caller = 0;
  const guess = (code, time) => at(time, () => verify(env, "owner@example.com", code, { ip: "198.51.100." + (++caller) }));
  for (let round = 0; round < 5; round++) {
    const time = t0 + round * 61_000;
    await sendCode(env, "owner@example.com", "cs", { now: time });
    const wrong = codeIn(sent.at(-1)) === "000000" ? "111111" : "000000";
    for (let i = 0; i < (round === 4 ? 3 : 4); i++) await guess(wrong, time + 1000);
  }
  assert.equal((await guess(codeIn(sent.at(-1)), t0 + 5 * 61_000)).status, 200);
  assert.equal(env.DB.sqlite.prepare("SELECT fail_count FROM email_login_codes").get().fail_count, 19);
});
