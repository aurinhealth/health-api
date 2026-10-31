import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb, mayCreateAccount, createAccount, signInEmailUser, signupOpenFor, SignupLimited, NEW_ACCOUNT_LIMITS, ensureTenancy, _resetTenancyForTest } from "../src/tenancy.js";
import { handleEmailLogin } from "../src/email-login.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { groupBrakeUsd, aiSpendingReport } from "../src/ai-total.js";
import { handleAdminApi } from "../src/routes-admin.js";
import { groupOfSubscription } from "../src/ai-limit-share.js";
import { ensureStoreColumns } from "../src/app-store.js";
import { aiSpentToday } from "../src/ai-usage.js";
import { claimCoachMessage, recordCoachMessage, coachAllowance } from "../src/coach-allowance.js";
import { withTimeZone, limitTimeZone, limitToday, LIMIT_ZONE_HOURS, _resetTimeZonesForTest } from "../src/user-time.js";

// 100k input + 50k output tokens of gpt-6-sol: 0.70 USD a call.
async function withOpenAI(fn) {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ model: "gpt-6-sol", output: [{ content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 100000, output_tokens: 50000 } }); };
  try { await fn(() => calls); } finally { globalThis.fetch = realFetch; }
}
const mailer = () => { const sent = []; return { sent, EMAIL: { send: async message => { sent.push(message); return { messageId: "m" }; } }, EMAIL_FROM: "noreply@aurin.health" }; };
const envFor = (db, id, extra = {}) => ({ DB: scopedDb(db, id), RAW_DB: db, USER_ID: id, OPENAI_API_KEY: "k", ...extra });
const ask = env => callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });
const future = new Date(Date.now() + 30 * 86400000).toISOString();

// ---- NET-03: each group of accounts has its own daily brake ----

const BRAKES = { paid: { perAccount: 0.5, min: 1 }, gift: { perAccount: 0.5, min: 1 }, trial: { perAccount: 0.25, min: 0.5 }, testflight: { perAccount: 0.375, min: 0.5, max: 1 }, free: { perAccount: 0.25, min: 1, max: 2 }, new: { usd: 1 }, system: { usd: 1 } };

// 7: no purchase (the pilot); 8: paid Pro; 9: the free week; 10: TestFlight;
// 11: an offer code (the pilot's discount); 12: no purchase, made today.
const OLD = "2026-01-01 00:00:00";
async function accounts() {
  const db = grantAiConsent(createD1(), 7, 8, 9, 10, 11, 12);
  await ensureStoreColumns(db);
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const user = db.sqlite.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)");
  for (const id of [7, 8, 9, 10, 11]) user.run(id, `u${id}@example.com`, OLD);
  db.sqlite.prepare("INSERT INTO users (id, email) VALUES (12, 'new@example.com')").run();
  const sub = db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, store_environment, free_trial, offer_type) VALUES (?, 'ai', ?, ?, ?, ?)");
  sub.run(8, future, "Production", 0, null);
  sub.run(9, future, "Production", 1, 1);
  sub.run(10, future, "Sandbox", 0, null);
  sub.run(11, future, "Production", 0, 3);
  return db;
}
const groupRow = (db, grp) => db.sqlite.prepare("SELECT cost_usd, brake_usd FROM ai_spend_groups WHERE grp = ? AND day = ?").get(grp, new Date().toISOString().slice(0, 10));

test("an account's subscription decides its group", () => {
  const sub = (environment, free_trial = 0, offer_type = null, valid_until = future) => ({ plan: "ai", valid_until, store_environment: environment, free_trial, offer_type });
  assert.equal(groupOfSubscription(null), "free");
  assert.equal(groupOfSubscription(sub("Production")), "paid");
  assert.equal(groupOfSubscription(sub("Production", 0, 3)), "gift");
  assert.equal(groupOfSubscription(sub("Production", 0, 2)), "gift");
  assert.equal(groupOfSubscription(sub("Production", 1, 1)), "trial");
  assert.equal(groupOfSubscription(sub("Sandbox")), "testflight");
  assert.equal(groupOfSubscription(sub("Production", 0, null, new Date(Date.now() - 1000).toISOString())), "free");
});

test("a group that used up its brake waits; the other groups go on", async () => {
  const db = await accounts();
  await withOpenAI(async calls => {
    const limits = { AI_GROUP_BRAKES: BRAKES };
    await ask(envFor(db, 12, limits));
    await ask(envFor(db, 12, limits));
    await assert.rejects(ask(envFor(db, 12, limits)), error => error.limit === true && error.status === 429, "a new account: the fixed 1 USD is used up");
    assert.equal(calls(), 2);
    for (const id of [7, 8, 9, 10, 11]) await ask(envFor(db, id, limits));
    assert.equal(calls(), 7, "accounts made in bulk never stop the pilot (no purchase, older than a week) or the others");
    assert.deepEqual({ ...groupRow(db, "new") }, { cost_usd: 1.4, brake_usd: 1 });
    assert.deepEqual({ ...groupRow(db, "free") }, { cost_usd: 0.7, brake_usd: 1 });
  });
});

test("a group's brake grows with its accounts, within its least and most", async () => {
  const db = await accounts(), sub = db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, store_environment, free_trial) VALUES (?, 'ai', ?, ?, ?)");
  for (let id = 20; id < 24; id++) sub.run(id, future, "Production", 0);
  for (let id = 30; id < 40; id++) sub.run(id, future, "Sandbox", 0);
  const env = { AI_GROUP_BRAKES: JSON.stringify(BRAKES) }, usd = async (group, e = env) => (await groupBrakeUsd(db, e, group)).usd;
  assert.equal(await usd("paid"), 2.5, "5 paying accounts × 0.5");
  assert.equal(await usd("gift"), 1, "one offer code × 0.5 is below the least");
  assert.equal(await usd("testflight"), 1, "11 testers × 0.375 is above the most");
  assert.equal(await usd("free"), 1, "one account without a purchase × 0.25 is below the least");
  const user = db.sqlite.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)");
  for (let id = 60; id < 66; id++) user.run(id, `p${id}@example.com`, OLD);
  for (let id = 70; id < 80; id++) user.run(id, `n${id}@example.com`, new Date().toISOString().replace("T", " ").slice(0, 19));
  assert.equal(await usd("free"), 1.75, "7 accounts older than a week × 0.25; the new ones are not counted");
  assert.equal(await usd("new"), 1, "new accounts have a fixed brake");
  assert.equal(await usd("free", {}), null);
});

// The database, with the count of accounts failing.
const countFails = db => ({ ...db, prepare: sql => /COUNT\(\*\)/.test(sql) ? { bind: () => ({ first: async () => { throw new Error("D1 down"); } }) } : db.prepare(sql) });

test("a failed count of accounts is not kept for the day", async () => {
  const db = await accounts(), yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  db.sqlite.prepare("CREATE TABLE IF NOT EXISTS ai_spend_groups (day TEXT NOT NULL, grp TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0, brake_usd REAL, alerted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, grp))").run();
  db.sqlite.prepare("INSERT INTO ai_spend_groups (day, grp, brake_usd) VALUES (?, 'free', 1.75)").run(yesterday);
  const env = { AI_GROUP_BRAKES: BRAKES };
  assert.deepEqual(await groupBrakeUsd(countFails(db), env, "free"), { usd: 1.75, counted: false }, "yesterday's brake, not the least");
  assert.deepEqual(await groupBrakeUsd(countFails(db), env, "paid"), { usd: 1, counted: false }, "no brake before: the least");
  await withOpenAI(async () => {
    await ask({ ...envFor(db, 7, env), RAW_DB: countFails(db) });
    assert.equal(groupRow(db, "free").brake_usd, null, "the brake waits for a count that works");
    await ask(envFor(db, 7, env));
    assert.equal(groupRow(db, "free").brake_usd, 1);
  });
});

test("the brake is counted once when the group's day starts", async () => {
  const db = await accounts();
  await withOpenAI(async () => {
    const limits = { AI_GROUP_BRAKES: BRAKES };
    await ask(envFor(db, 8, limits));
    db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, store_environment, free_trial) VALUES (50, 'ai', ?, 'Production', 0)").run(future);
    await ask(envFor(db, 8, limits));
    assert.equal(groupRow(db, "paid").brake_usd, 1, "a new subscriber the same day does not change today's brake");
  });
});

test("the owner is held live like a paying account, on the test server only by the day's brake", async () => {
  const db = await accounts();
  await withOpenAI(async calls => {
    const limits = { AI_GROUP_BRAKES: { gift: { usd: 0.5 } } };
    await ask(envFor(db, 1, { ...limits, USER_IS_OWNER: true }));
    await assert.rejects(ask(envFor(db, 1, { ...limits, USER_IS_OWNER: true })), error => error.status === 429, "live: the owner's group (with the pilot and gifts) has its brake");
    await ask(envFor(db, 1, { ...limits, USER_IS_OWNER: true, ENVIRONMENT: "staging" }));
    assert.equal(calls(), 2);
  });
});

test("the owner hears once a day that a group passed half of its brake", async () => {
  const db = await accounts(), mail = mailer();
  await withOpenAI(async () => {
    const env = envFor(db, 7, { AI_GROUP_BRAKES: { free: { usd: 2 } }, OWNER_EMAIL: "owner@example.com", ...mail });
    await ask(env);
    assert.equal(mail.sent.length, 0);
    await ask(env);
    assert.equal(mail.sent.length, 1);
    assert.match(mail.sent[0].subject, /bez nákupu/);
    await ask(env);
    assert.equal(mail.sent.length, 1);
  });
});

test("the owner sees today's spending by group against its brake, yesterday and the month", async () => {
  const db = await accounts();
  await withOpenAI(async () => {
    await ask(envFor(db, 7, { AI_GROUP_BRAKES: BRAKES }));
    await ask(envFor(db, 8, { AI_GROUP_BRAKES: BRAKES }));
  });
  const today = new Date().toISOString().slice(0, 10), yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  db.sqlite.prepare("INSERT INTO ai_spend_days (day, cost_usd) VALUES (?, 2.5)").run(yesterday);
  const report = await aiSpendingReport({ RAW_DB: db, AI_GROUP_BRAKES: BRAKES });
  assert.equal(report.today, 1.4);
  const counted = async owner => Object.fromEntries((await aiSpendingReport({ RAW_DB: db, AI_GROUP_BRAKES: BRAKES, OWNER_EMAIL: owner })).groups.map(g => [g.group, g.accounts]));
  assert.deepEqual([(await counted(" U7@example.com ")).gift, (await counted(" U7@example.com ")).free], [2, 0], "the owner without a purchase counts in gift, not free");
  assert.deepEqual([(await counted("u8@example.com")).gift, (await counted("u8@example.com")).paid], [2, 0], "the owner with a purchase counts once, in gift");
  assert.equal(report.yesterday, 2.5);
  assert.equal(report.month, yesterday.slice(0, 7) === today.slice(0, 7) ? 3.9 : 1.4);
  assert.equal(report.resetsAt.slice(11), "00:00:00.000Z");
  assert.deepEqual(report.groups.map(g => g.group), ["paid", "gift", "trial", "testflight", "free", "new", "system"]);
  const by = Object.fromEntries(report.groups.map(g => [g.group, g]));
  assert.deepEqual(by.paid, { group: "paid", spent: 0.7, brake: 1, accounts: 1 });
  assert.deepEqual(by.free, { group: "free", spent: 0.7, brake: 1, accounts: 1 }, "accounts without a purchase older than a week");
  assert.deepEqual(by.new, { group: "new", spent: 0, brake: 1, accounts: null }, "a fixed brake has no accounts");
  assert.deepEqual(by.testflight, { group: "testflight", spent: 0, brake: 0.5, accounts: 1 }, "a group with no spending yet shows the brake it would get");

  const user = { isAdmin: true, isOwner: false }, url = new URL("https://aurin.health/app/api/admin/ai-spending");
  const get = who => handleAdminApi(new Request(url), { RAW_DB: db, AI_GROUP_BRAKES: BRAKES }, url, { signedIn: true, user: who });
  assert.equal((await get(user)).status, 403, "an admin who isn't the owner");
  const response = await get({ ...user, isOwner: true });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).today, 1.4);
});

test("an offer code is stored with the purchase", async () => {
  const db = createD1();
  await ensureStoreColumns(db);
  assert.ok(db.sqlite.prepare("SELECT name FROM pragma_table_info('subscriptions') WHERE name = 'offer_type'").get());
});

// ---- NET-04: the limits count days in the account's zone, not the request's ----

test("switching the zone back and forth does not move the day the limits count", async () => {
  _resetTimeZonesForTest();
  const db = createD1(), env = () => ({ DB: db, USER_ID: 7 });
  // 11:00 UTC: 1:00 next day in Kiritimati (+14), 23:00 the day before in Baker Island (-12).
  const at = new Date("2026-10-30T11:00:00Z");
  assert.equal(await withTimeZone("Europe/Prague", () => limitToday(env(), at)), "2026-10-30");
  _resetTimeZonesForTest(); // another isolate: the stored zone holds
  assert.equal(await withTimeZone("Pacific/Kiritimati", () => limitToday(env(), at)), "2026-10-30");
  assert.equal(await withTimeZone("Etc/GMT+12", () => limitToday(env(), at)), "2026-10-30");
  // A day later the account moves to the zone it is in now, once.
  const later = new Date(at.getTime() + LIMIT_ZONE_HOURS * 3600000 + 60000);
  assert.equal(await withTimeZone("America/New_York", () => limitTimeZone(db, 7, "America/New_York", later.getTime())), "America/New_York");
  assert.equal(await withTimeZone("Pacific/Kiritimati", () => limitTimeZone(db, 7, "Pacific/Kiritimati", later.getTime() + 3600000)), "America/New_York");
});

test("an isolate's copy of the zone gives way to the database once a switch is possible", async () => {
  _resetTimeZonesForTest();
  const db = createD1(), at = Date.parse("2026-10-30T11:00:00Z"), later = at + LIMIT_ZONE_HOURS * 3600000 + 60000;
  assert.equal(await limitTimeZone(db, 7, "Europe/Prague", at), "Europe/Prague");
  // Another isolate moves the account to New York once the day is over.
  db.sqlite.prepare("UPDATE user_time_zone SET limit_zone = 'America/New_York', limit_zone_at = ? WHERE user_id = 7").run(later);
  assert.equal(await limitTimeZone(db, 7, "Europe/Prague", later + 3600000), "America/New_York", "this isolate's Prague is not used");
});

test("the AI spending of the day and the coach's week stay on the account's days", async () => {
  _resetTimeZonesForTest();
  const db = grantAiConsent(createD1(), 7, 8), env = envFor(db, 7, { COACH_WEEKLY_MESSAGES: "2" });
  db.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, data_type TEXT, source_family TEXT, start_time TEXT, end_time TEXT, payload_json TEXT, record_role TEXT)");
  const prague = await withTimeZone("Europe/Prague", () => limitToday(env));
  await withOpenAI(async () => {
    await withTimeZone("Pacific/Kiritimati", () => ask(env));
    assert.equal(db.sqlite.prepare("SELECT day FROM ai_usage").get().day, prague, "recorded on the account's day");
    assert.equal(await withTimeZone("Etc/GMT+12", () => aiSpentToday(env)), 0.7, "every zone reads the same day");
  });
  await withTimeZone("Pacific/Kiritimati", async () => {
    for (let i = 1; i <= 2; i++) { const claim = await claimCoachMessage(env, i); await recordCoachMessage(env, i, claim); }
  });
  await withTimeZone("Etc/GMT+12", () => assert.rejects(claimCoachMessage(env, 3), error => error.status === 429, "another zone does not open another week's messages"));
  assert.equal((await withTimeZone("Pacific/Kiritimati", () => coachAllowance(env))).left, 0);
  _resetTimeZonesForTest();
});

// ---- NET-03: new accounts per network ----

function accountsDb() {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT, disabled INTEGER DEFAULT 0, google_sub TEXT, last_login_at TEXT, session_epoch INTEGER DEFAULT 0);
    CREATE TABLE user_invites (email TEXT PRIMARY KEY);
    CREATE TABLE signup_waitlist (email TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO user_invites VALUES ('invited@example.com');`);
  return db;
}
const open = { OPEN_SIGNUP: "true", OWNER_EMAIL: "owner@example.com", SESSION_SECRET: "s".repeat(32) };
const from = ip => new Request("https://aurin.health/auth/email/verify", { headers: { "CF-Connecting-IP": ip } });

test("one network opens a few new accounts a day; invited addresses, the owner and other networks are not held", async () => {
  const db = accountsDb();
  for (let i = 0; i < NEW_ACCOUNT_LIMITS.hour; i++) assert.equal(await mayCreateAccount(db, open, `a${i}@example.com`, { request: from("203.0.113.5") }), true);
  await assert.rejects(mayCreateAccount(db, open, "more@example.com", { request: from("203.0.113.5") }), error => error instanceof SignupLimited && error.status === 429);
  assert.equal(await mayCreateAccount(db, open, "invited@example.com", { request: from("203.0.113.5") }), true);
  assert.equal(await mayCreateAccount(db, open, "owner@example.com", { request: from("203.0.113.5") }), true);
  assert.equal(await mayCreateAccount(db, open, "other@example.com", { request: from("198.51.100.7") }), true);
  // Every address of one IPv6 /64 is the same network.
  for (let i = 1; i <= NEW_ACCOUNT_LIMITS.hour; i++) await mayCreateAccount(db, open, `v${i}@example.com`, { request: from(`2001:db8:1:2::${i}`) });
  await assert.rejects(mayCreateAccount(db, open, "v9@example.com", { request: from("2001:db8:1:2::99") }), SignupLimited);
});

test("signing in to an existing account is never held by the new-account limit", async () => {
  const db = accountsDb();
  for (let i = 0; i < NEW_ACCOUNT_LIMITS.hour; i++) await signInEmailUser(db, open, `a${i}@example.com`, { request: from("203.0.113.5") });
  await assert.rejects(signInEmailUser(db, open, "new@example.com", { request: from("203.0.113.5") }), SignupLimited);
  assert.equal((await signInEmailUser(db, open, "a0@example.com", { request: from("203.0.113.5") })).email, "a0@example.com");
});

test("a network gets its place back when no account comes of the sign-in", async () => {
  const db = accountsDb(), request = from("203.0.113.5");
  await signInEmailUser(db, open, "a0@example.com", { request: from("203.0.113.5") });
  // Another sign-in made the account in the meantime: "exists", the place is given back.
  assert.equal(await mayCreateAccount(db, open, "a0@example.com", { request }), true);
  assert.equal(await createAccount(db, open, "a0@example.com", null, { request }), "exists");
  for (let i = 1; i < NEW_ACCOUNT_LIMITS.hour; i++) assert.equal(await mayCreateAccount(db, open, `b${i}@example.com`, { request: from("203.0.113.5") }), true);
  await assert.rejects(mayCreateAccount(db, open, "more@example.com", { request: from("203.0.113.5") }), SignupLimited);
});

test("a full network hears it before a sign-in code goes out; a code that met a full network still works", async () => {
  _resetTenancyForTest();
  const ORIGIN = "https://aurin.health", sent = [];
  const env = { ...open, DB: createD1(), EMAIL: { send: async message => { sent.push(message); return { messageId: "m" }; } }, EMAIL_FROM: "noreply@aurin.health" };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(["0014_passkeys_email_codes.sql", "0027_email_code_limits.sql"].map(name => readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8")).join("\n"));
  const post = (path, body, ip = "203.0.113.5") => handleEmailLogin(new Request(ORIGIN + path, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify(body) }), env, path);
  assert.equal((await post("/auth/email/start", { email: "late@example.com" })).status, 200);
  const code = sent[0].text.match(/\b(\d{6})\b/)[1];
  // The network opens its accounts for today while the code is on its way.
  for (let i = 0; i < NEW_ACCOUNT_LIMITS.hour; i++) await signInEmailUser(env.DB, env, `n${i}@example.com`, { request: from("203.0.113.5") });
  assert.equal(await signupOpenFor(env.DB, env, "late@example.com", from("203.0.113.5")), false);
  assert.equal(await signupOpenFor(env.DB, env, "n0@example.com", from("203.0.113.5")), true, "an existing account is never held");
  const refused = await post("/auth/email/verify", { email: "late@example.com", code });
  assert.equal(refused.status, 429);
  assert.equal((await post("/auth/email/verify", { email: "late@example.com", code }, "198.51.100.7")).status, 200, "the same code signs in from another network");
  const start = await post("/auth/email/start", { email: "other@example.com" });
  assert.equal(start.status, 429, "no code for a new address from the full network");
  assert.match((await start.json()).message, /příliš mnoho nových účtů|Too many new accounts/);
  assert.equal(sent.length, 1);
});
