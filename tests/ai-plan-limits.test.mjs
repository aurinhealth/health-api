import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { aiAllowance, aiMonthlyLimitUsd, aiWeeklyLimitUsd, aiSpentThisMonth, ensureAiUsage } from "../src/ai-usage.js";
import { aiPlan } from "../src/ai-limit-share.js";
import { ensureStoreColumns } from "../src/app-store.js";
import { savePackTransaction } from "../src/coach-packs.js";
import { localToday } from "../src/user-time.js";
import { mondayOfDate, shiftDate } from "../src/dashboard-shared.js";

// 100k input + 50k output tokens of gpt-6-sol: 0.70 USD a call.
async function withOpenAI(fn) {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ model: "gpt-6-sol", output: [{ content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 100000, output_tokens: 50000 } }); };
  try { await fn(() => calls); } finally { globalThis.fetch = realFetch; }
}
const LIMITS = { AI_MONTHLY_LIMIT_USD: "5", AI_YEARLY_LIMIT_USD: "3", AI_UNPAID_LIMIT_USD: "1.25", AI_UNPAID_LIMIT_SHARE: "0.5", AI_DAILY_LIMIT_USD: "100" };
const future = (days = 30) => new Date(Date.now() + days * 864e5).toISOString();
// 7: monthly Pro; 8: yearly Pro; 9: the free week; 10: no purchase; 11: a yearly offer code;
// 12: a monthly offer code (the pilot's discount); 13: a free offer code (not the free week).
async function accounts() {
  const db = grantAiConsent(createD1(), 7, 8, 9, 10, 11, 12, 13);
  await ensureStoreColumns(db);
  const sub = db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, product_id, store_environment, free_trial, offer_type) VALUES (?, 'ai', ?, ?, 'Production', ?, ?)");
  sub.run(7, future(), "b.pro.monthly", 0, null);
  sub.run(8, future(365), "b.pro.yearly", 0, null);
  sub.run(9, future(3), "b.pro.yearly", 1, 1);
  sub.run(11, future(365), "b.pro.yearly", 0, 3);
  sub.run(12, future(), "b.pro.monthly", 0, 3);
  sub.run(13, future(60), "b.pro.monthly", 1, 3);
  return db;
}
const envFor = (db, id, extra = {}) => ({ DB: scopedDb(db, id), USER_ID: id, OPENAI_API_KEY: "k", ...LIMITS, ...extra });
const spend = (db, id, day, usd) => db.sqlite.prepare("INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) VALUES (?, ?, 'assistant', 'gpt-6-sol', ?)").run(id, day, usd);

test("the monthly brake follows the plan and stays under what it nets", async () => {
  const db = await accounts();
  const plans = await Promise.all([7, 8, 9, 10, 11, 12, 13].map(id => aiPlan(envFor(db, id))));
  assert.deepEqual(plans.map(p => p.plan), ["monthly", "yearly", "unpaid", "unpaid", "yearly", "yearly", "unpaid"]);
  assert.ok(plans[2].since && !plans[6].since, "only the free week is a period of its own");
  const limits = await Promise.all([7, 8, 9, 10, 11, 12, 13].map(id => aiAllowance(envFor(db, id)).then(a => a.monthLimitUsd)));
  assert.deepEqual(limits, [5, 3, 1.25, 1.25, 3, 3, 1.25], "an offer code nets no more than the yearly plan");
  // A Sandbox purchase (TestFlight) is not Pro bought; the live owner has the same brakes.
  db.sqlite.prepare("UPDATE subscriptions SET store_environment = 'Sandbox' WHERE user_id = 7").run();
  assert.equal((await aiAllowance(envFor(db, 7))).monthLimitUsd, 1.25);
  assert.equal((await aiAllowance(envFor(db, 8, { USER_IS_OWNER: true }))).monthLimitUsd, 3);
  assert.equal((await aiAllowance(envFor(db, 8, { USER_IS_OWNER: true, ENVIRONMENT: "staging" }))).monthLimitUsd, null);
  // Unset, every plan has the monthly brake (times the unpaid share), as before.
  assert.equal(aiMonthlyLimitUsd({ AI_MONTHLY_LIMIT_USD: "5" }, 0.5, "unpaid"), 2.5);
  assert.equal(aiMonthlyLimitUsd({ AI_MONTHLY_LIMIT_USD: "5" }, 1, "yearly"), 5);
  // A plan's own brake never goes above the monthly one, and the App Review account keeps its small one.
  assert.equal(aiMonthlyLimitUsd({ AI_MONTHLY_LIMIT_USD: "2", AI_YEARLY_LIMIT_USD: "3" }, 1, "yearly"), 2);
  // Only paid plans have a week, 30 % of their month.
  assert.deepEqual([aiWeeklyLimitUsd(5, "monthly"), aiWeeklyLimitUsd(3, "yearly"), aiWeeklyLimitUsd(1.25, "unpaid"), aiWeeklyLimitUsd(null, "yearly")], [1.5, 0.9, null, null]);
  // What a plan nets a month in Czechia after 21 % VAT and Apple's 15 % at 22.10 Kč a dollar (ČNB 13 Nov 2026):
  // 199 Kč monthly 6.33, 1 490 Kč yearly 3.95, 149 Kč × 12 with the commitment 4.74 USD
  // (the code's 5.9 and 3.7 are the lowest across countries, 27 % VAT in Hungary).
  const net = czk => czk / 1.21 * 0.85 / 22.1;
  assert.ok(5 < net(199) && 3 < net(1490 / 12) && 3 < net(149));
});

test("an account without Pro stops at its small brake", async () => {
  const db = await accounts();
  await withOpenAI(async calls => {
    const env = envFor(db, 10);
    await ensureAiUsage(env.DB);
    spend(db, 10, localToday(), 1.2);
    await callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" });
    await assert.rejects(callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" }), error => error.limit === true && /zase k dispozici od/.test(error.message));
    assert.equal(calls(), 1);
  });
});

test("the free week is a period of its own: a week across two months gets one brake", async () => {
  const db = await accounts();
  const env = envFor(db, 9);
  const plan = await aiPlan(env);
  assert.equal(plan.since, new Date(Date.now() + 3 * 864e5 - 7 * 864e5).toISOString().slice(0, 10));
  await ensureAiUsage(env.DB);
  // Spending from an earlier month counts when the free week began then.
  spend(db, 9, "2000-01-15", 1);
  assert.equal(await aiSpentThisMonth(env), 0);
  assert.equal(await aiSpentThisMonth(env, { since: "2000-01-01" }), 1);
  // A day before the week began in the same month counts too (the month starts earlier).
  assert.equal(await aiSpentThisMonth(env, { since: localToday() }), 0);
  // The brake itself counts from the week's first day.
  await withOpenAI(async calls => {
    spend(db, 9, plan.since, 1);
    await callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" });
    await assert.rejects(callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" }), error => error.limit === true && /zase k dispozici od/.test(error.message));
    assert.equal(calls(), 1);
  });
});

test("a free week that just turned paid does not take the new plan's week", async () => {
  const db = await accounts();
  await withOpenAI(async calls => {
    const today = localToday(), monday = mondayOfDate(today);
    // Bought today after 1.00 USD in the free week, on Monday or later.
    db.sqlite.prepare("UPDATE subscriptions SET store_signed_at = ? WHERE user_id = 8").run(Date.parse(today + "T12:00:00Z"));
    const env = envFor(db, 8);
    await ensureAiUsage(env.DB);
    spend(db, 8, monday, today === monday ? 0 : 1);
    await callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" });
    assert.equal(calls(), 1);
  });
});

test("a paid week may use 30 % of its month; past it AI waits until Monday", async () => {
  const db = await accounts();
  await withOpenAI(async calls => {
    const env = envFor(db, 8);
    await ensureAiUsage(env.DB);
    const today = localToday(), monday = mondayOfDate(today);
    // Last week's spending does not count against this week.
    spend(db, 8, shiftDate(monday, -1), 0.85);
    spend(db, 8, monday, 0.5);
    await callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" });
    // 0.5 + 0.7 = 1.2 is past the yearly plan's 0.9 a week.
    await assert.rejects(callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" }), error => error.limit === true && /v pondělí/.test(error.message) && !/\$|USD|\d/.test(error.message));
    assert.equal(calls(), 1);
    // The monthly Pro has 1.5 a week.
    const monthly = envFor(db, 7);
    await ensureAiUsage(monthly.DB);
    spend(db, 7, monday, 0.5);
    await callOpenAI(monthly, { feature: "assistant", instructions: "x", input: "y" });
    assert.equal(calls(), 2);
    // Bought messages raise the week too: a 100 pack is 5 USD more room.
    await savePackTransaction(env, { productId: "b.coach.messages100", bundleId: "b", transactionId: "t1", environment: "Production", purchaseDate: Date.now() });
    await callOpenAI(envFor(db, 8), { feature: "assistant", instructions: "x", input: "y" });
    assert.equal(calls(), 3);
  });
});

test("the live server and the test server set the brakes by plan", () => {
  const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  for (const [key, value] of [["AI_MONTHLY_LIMIT_USD", "5"], ["AI_YEARLY_LIMIT_USD", "3"], ["AI_UNPAID_LIMIT_USD", "1.25"]]) {
    assert.equal(text.match(new RegExp(`"${key}": "([^"]+)"`, "g")).length, 2, key);
    assert.ok(text.match(new RegExp(`"${key}": "([^"]+)"`, "g")).every(line => line.endsWith(`"${value}"`)), key);
  }
});
