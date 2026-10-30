import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb, mayCreateAccount, signInEmailUser, SignupLimited, NEW_ACCOUNT_LIMITS } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { groupBrakeUsd } from "../src/ai-total.js";
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

const BRAKES = { paid: { perAccount: 0.5, min: 1 }, gift: { perAccount: 0.5, min: 1 }, trial: { perAccount: 0.25, min: 0.5 }, testflight: { perAccount: 0.375, min: 0.5, max: 1 }, free: { usd: 1 }, system: { usd: 1 } };

// 7: no purchase; 8: paid Pro; 9: the free week; 10: TestFlight; 11: an offer code (the pilot's discount).
async function accounts() {
  const db = grantAiConsent(createD1(), 7, 8, 9, 10, 11);
  await ensureStoreColumns(db);
  const sub = db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, store_environment, free_trial, offer_type) VALUES (?, 'ai', ?, ?, ?, ?)");
  sub.run(8, future, "Production", 0, null);
  sub.run(9, future, "Production", 1, 1);
  sub.run(10, future, "Sandbox", 0, null);
  sub.run(11, future, "Production", 0, 3);
  return db;
}
const groupRow = (db, grp) => db.sqlite.prepare("SELECT cost_usd, brake_usd FROM ai_spend_groups WHERE grp = ?").get(grp);

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
    await ask(envFor(db, 7, limits));
    await ask(envFor(db, 7, limits));
    await assert.rejects(ask(envFor(db, 7, limits)), error => error.limit === true && error.status === 429, "no purchase: the fixed 1 USD is used up");
    assert.equal(calls(), 2);
    for (const id of [8, 9, 10, 11]) await ask(envFor(db, id, limits));
    assert.equal(calls(), 6, "free accounts made in bulk never stop the others");
    assert.deepEqual({ ...groupRow(db, "free") }, { cost_usd: 1.4, brake_usd: 1 });
  });
});

test("a group's brake grows with its accounts, within its least and most", async () => {
  const db = await accounts(), sub = db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, store_environment, free_trial) VALUES (?, 'ai', ?, ?, ?)");
  for (let id = 20; id < 24; id++) sub.run(id, future, "Production", 0);
  for (let id = 30; id < 40; id++) sub.run(id, future, "Sandbox", 0);
  const env = { AI_GROUP_BRAKES: JSON.stringify(BRAKES) };
  assert.equal(await groupBrakeUsd(db, env, "paid"), 2.5, "5 paying accounts × 0.5");
  assert.equal(await groupBrakeUsd(db, env, "gift"), 1, "one offer code × 0.5 is below the least");
  assert.equal(await groupBrakeUsd(db, env, "testflight"), 1, "11 testers × 0.375 is above the most");
  assert.equal(await groupBrakeUsd(db, env, "free"), 1);
  assert.equal(await groupBrakeUsd(db, {}, "free"), null);
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

test("an offer code is stored with the purchase", async () => {
  const db = createD1();
  await ensureStoreColumns(db);
  assert.ok(db.sqlite.prepare("SELECT name FROM pragma_table_info('subscriptions') WHERE name = 'offer_type'").get());
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
