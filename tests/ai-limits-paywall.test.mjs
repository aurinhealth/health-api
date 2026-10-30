import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb, mayCreateAccount, signInEmailUser, SignupLimited, NEW_ACCOUNT_LIMITS } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { aiSpendToday } from "../src/ai-total.js";
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

// ---- NET-03: a part of the day's brake is kept for paying accounts ----

async function twoAccounts() {
  const db = grantAiConsent(createD1(), 7, 8);
  await ensureStoreColumns(db);
  // 8 pays for Pro (Production, not the free week); 7 does not.
  db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, store_environment, free_trial) VALUES (8, 'ai', ?, 'Production', 0)").run(future);
  return db;
}

test("past their part of the brake unpaid accounts wait, paying ones carry on to the whole brake", async () => {
  const db = await twoAccounts();
  await withOpenAI(async calls => {
    const limits = { AI_TOTAL_DAILY_LIMIT_USD: "3", AI_TOTAL_DAILY_UNPAID_LIMIT_USD: "1" };
    await ask(envFor(db, 7, limits));
    await ask(envFor(db, 7, limits));
    assert.deepEqual(await aiSpendToday(db), { all: 1.4, unpaid: 1.4 });
    await assert.rejects(ask(envFor(db, 7, limits)), error => error.limit === true && error.status === 429);
    assert.equal(calls(), 2);
    // The paying account still has the rest of the brake.
    await ask(envFor(db, 8, limits));
    await ask(envFor(db, 8, limits));
    assert.deepEqual(await aiSpendToday(db), { all: 2.8, unpaid: 1.4 });
    await ask(envFor(db, 8, limits));
    await assert.rejects(ask(envFor(db, 8, limits)), error => error.status === 429, "the whole brake holds the paying ones too");
  });
});

test("the free week counts as unpaid; the owner is never held", async () => {
  const db = await twoAccounts();
  db.sqlite.prepare("UPDATE subscriptions SET free_trial = 1 WHERE user_id = 8").run();
  await withOpenAI(async calls => {
    const limits = { AI_TOTAL_DAILY_LIMIT_USD: "30", AI_TOTAL_DAILY_UNPAID_LIMIT_USD: "0.5" };
    await ask(envFor(db, 8, limits));
    await assert.rejects(ask(envFor(db, 8, limits)), error => error.status === 429);
    await ask(envFor(db, 7, { ...limits, USER_IS_OWNER: true }));
    assert.equal(calls(), 2);
    assert.deepEqual(await aiSpendToday(db), { all: 1.4, unpaid: 0.7 }, "the owner's cost is not the unpaid accounts'");
  });
});

test("the owner hears once a day that the unpaid part is used up", async () => {
  const db = await twoAccounts(), mail = mailer();
  await withOpenAI(async () => {
    const env = envFor(db, 7, { AI_TOTAL_DAILY_UNPAID_LIMIT_USD: "1", OWNER_EMAIL: "owner@example.com", ...mail });
    await ask(env);
    assert.equal(mail.sent.length, 0);
    await ask(env);
    assert.equal(mail.sent.length, 1);
    assert.equal(mail.sent[0].to, "owner@example.com");
    await assert.rejects(ask(env), error => error.status === 429);
    assert.equal(mail.sent.length, 1);
  });
});

test("an older day table gets the unpaid columns", async () => {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE ai_spend_days (day TEXT PRIMARY KEY, cost_usd REAL NOT NULL DEFAULT 0, alerted INTEGER NOT NULL DEFAULT 0); INSERT INTO ai_spend_days (day, cost_usd) VALUES ('2026-10-30', 4)");
  assert.deepEqual(await aiSpendToday(db, new Date("2026-10-30T12:00:00Z")), { all: 4, unpaid: 0 });
});

// ---- NET-04: the limits count days in the account's zone, not the request's ----

test("switching the zone back and forth does not move the day the limits count", async () => {
  _resetTimeZonesForTest();
  const db = createD1(), env = { DB: db, USER_ID: 7 };
  // 11:00 UTC: 1:00 next day in Kiritimati (+14), 23:00 the day before in Baker Island (-12).
  const at = new Date("2026-10-30T11:00:00Z");
  assert.equal(await withTimeZone("Europe/Prague", () => limitToday(env, at)), "2026-10-30");
  _resetTimeZonesForTest(); // another isolate: the stored zone holds
  assert.equal(await withTimeZone("Pacific/Kiritimati", () => limitToday(env, at)), "2026-10-30");
  assert.equal(await withTimeZone("Etc/GMT+12", () => limitToday(env, at)), "2026-10-30");
  // A day later the account moves to the zone it is in now, once.
  const later = new Date(at.getTime() + LIMIT_ZONE_HOURS * 3600000 + 60000);
  assert.equal(await withTimeZone("America/New_York", () => limitTimeZone(db, 7, "America/New_York", later.getTime())), "America/New_York");
  assert.equal(await withTimeZone("Pacific/Kiritimati", () => limitTimeZone(db, 7, "Pacific/Kiritimati", later.getTime() + 3600000)), "America/New_York");
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
