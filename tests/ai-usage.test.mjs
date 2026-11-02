import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { aiAllowance, aiDailyLimitUsd, aiMonthlyLimitUsd, usageCost } from "../src/ai-usage.js";
import { localToday } from "../src/user-time.js";
import { serverSource } from "./helpers/server-source.mjs";

const answer = usage => Response.json({ model: "gpt-6-sol", output: [{ content: [{ type: "output_text", text: "ok" }] }], usage });

async function withOpenAI(fn) {
  const realFetch = globalThis.fetch;
  let calls = 0;
  // 100k input + 50k output tokens of gpt-6-sol: 0.2 + 0.5 = 0.70 USD.
  globalThis.fetch = async () => { calls++; return answer({ input_tokens: 100000, output_tokens: 50000 }); };
  try { await fn(() => calls); } finally { globalThis.fetch = realFetch; }
}

const envFor = (db, extra = {}) => ({ DB: scopedDb(db, 7), USER_ID: 7, OPENAI_API_KEY: "k", ...extra });

test("every AI answer is recorded with its feature, tokens and cost", async () => {
  const db = grantAiConsent(createD1(), 7, 8);
  await withOpenAI(async () => {
    const env = envFor(db);
    await callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });
    const row = db.sqlite.prepare("SELECT user_id, feature, model, input_tokens, output_tokens, cost_usd, cached_tokens FROM ai_usage").get();
    assert.deepEqual({ ...row }, { user_id: 7, feature: "food-lookup", model: "gpt-6-sol", input_tokens: 100000, output_tokens: 50000, cost_usd: 0.7, cached_tokens: 0 });
    assert.deepEqual(await aiAllowance(env), { spentUsd: 0.7, limitUsd: null, monthSpentUsd: 0.7, monthLimitUsd: 5 });
  });
});

test("web searches are counted on top of the tokens, failed ones are not", async () => {
  const db = grantAiConsent(createD1(), 7, 8), realFetch = globalThis.fetch;
  const search = status => ({ type: "web_search_call", status });
  globalThis.fetch = async () => Response.json({ model: "gpt-6-luna", output: [search("completed"), search("completed"), search("failed"), { content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 10000, output_tokens: 1000 } });
  try {
    await callOpenAI(envFor(db), { feature: "food-lookup", instructions: "x", input: "y", tools: [{ type: "web_search" }] });
  } finally { globalThis.fetch = realFetch; }
  // 0.001 + 0.0005 for tokens, 2 × 0.01 for searches.
  assert.equal(db.sqlite.prepare("SELECT cost_usd FROM ai_usage").get().cost_usd, 0.0215);
  assert.equal(usageCost("gpt-6-luna", { input_tokens: 10000, output_tokens: 1000 }), 0.0015);
});

test("cached input is billed at the cached price and kept in the log", async () => {
  // 20k input of which 15k cached, 1k output of gpt-6-sol: 5k × 2 + 15k × 0.2 + 1k × 10 per 1M = 0.023 USD.
  const usage = { input_tokens: 20000, input_tokens_details: { cached_tokens: 15000 }, output_tokens: 1000 };
  assert.equal(usageCost("gpt-6-sol", usage), 0.023);
  assert.equal(usageCost("gpt-6-sol", { input_tokens: 20000, output_tokens: 1000 }), 0.05);
  // A cached count above the input never makes the cost negative.
  assert.equal(usageCost("gpt-6-luna", { input_tokens: 100, input_tokens_details: { cached_tokens: 500 } }), 0);
  const db = grantAiConsent(createD1(), 7, 8), realFetch = globalThis.fetch;
  globalThis.fetch = async () => answer(usage);
  try { await callOpenAI(envFor(db), { feature: "assistant", instructions: "x", input: "y" }); } finally { globalThis.fetch = realFetch; }
  assert.deepEqual({ ...db.sqlite.prepare("SELECT cached_tokens, cost_usd FROM ai_usage").get() }, { cached_tokens: 15000, cost_usd: 0.023 });
});

test("a table from before the cached column gets it", async () => {
  const db = grantAiConsent(createD1(), 7, 8);
  db.sqlite.exec("CREATE TABLE ai_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, day TEXT NOT NULL, feature TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL)");
  await withOpenAI(async () => { await callOpenAI(envFor(db), { instructions: "x", input: "y" }); });
  assert.equal(db.sqlite.prepare("SELECT cached_tokens FROM ai_usage WHERE model != 'pending'").get().cached_tokens, 0);
});

test("the limit messages name no amount", async () => {
  const db = grantAiConsent(createD1(), 7, 8);
  await withOpenAI(async () => {
    const env = envFor(db, { AI_DAILY_LIMIT_USD: "0.5" });
    await callOpenAI(env, { instructions: "x", input: "y" });
    await assert.rejects(callOpenAI(env, { instructions: "x", input: "y" }), error => /Pro dnešek toho bylo s AI hodně/.test(error.message) && !/\$|USD|\d/.test(error.message));
    db.sqlite.prepare("INSERT INTO ai_usage (user_id, day, cost_usd) VALUES (8, ?, 10)").run(localToday());
    await assert.rejects(callOpenAI({ ...env, DB: scopedDb(db, 8), USER_ID: 8, AI_DAILY_LIMIT_USD: "" }, { instructions: "x", input: "y" }), error => /pozastavená/.test(error.message) && !/\$|USD|\d/.test(error.message));
  });
});

test("a daily limit, when set, stops the next call once it is spent; the owner has none on the test server", async () => {
  const db = grantAiConsent(createD1(), 7, 8);
  await withOpenAI(async calls => {
    const env = envFor(db, { AI_DAILY_LIMIT_USD: "1" });
    await callOpenAI(env, { instructions: "x", input: "y" });
    await callOpenAI(env, { instructions: "x", input: "y" });
    await assert.rejects(callOpenAI(env, { instructions: "x", input: "y" }), error => error.limit === true && error.status === 429 && /Pro dnešek toho bylo s AI hodně/.test(error.message));
    assert.equal(calls(), 2);
    // Another user has their own budget.
    await callOpenAI({ ...env, DB: scopedDb(db, 8), USER_ID: 8 }, { instructions: "x", input: "y" });
    // The owner on the test server is never stopped (live: a paying account's limits).
    const owner = { ...env, USER_IS_OWNER: true, ENVIRONMENT: "staging" };
    await callOpenAI(owner, { instructions: "x", input: "y" });
    assert.equal(calls(), 4);
    assert.equal(aiDailyLimitUsd(owner), null);
  });
});

test("the daily guard leaves the coach chat out: it neither counts nor stops it", async () => {
  const db = grantAiConsent(createD1(), 7, 8);
  await withOpenAI(async calls => {
    const env = envFor(db, { AI_DAILY_LIMIT_USD: "1" });
    // Two coach answers (1.40 USD) are over the daily guard but not in it.
    await callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" });
    await callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" });
    assert.equal((await aiAllowance(env)).spentUsd, 0);
    await callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });
    await callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });
    await assert.rejects(callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" }), /Pro dnešek/);
    // The coach still answers; only the monthly brake would stop it.
    await callOpenAI(env, { feature: "assistant", instructions: "x", input: "y" });
    assert.equal(calls(), 5);
  });
});

test("the monthly limit stops AI for the rest of the month and counts only this month", async () => {
  const db = grantAiConsent(createD1(), 7, 8);
  await withOpenAI(async calls => {
    const env = envFor(db, { AI_DAILY_LIMIT_USD: "100" });
    await callOpenAI(env, { instructions: "x", input: "y" });
    const month = localToday().slice(0, 7);
    // Earlier this month and last month: only this month counts.
    db.sqlite.prepare("INSERT INTO ai_usage (user_id, day, cost_usd) VALUES (7, ?, 4.5), (7, '2000-01-15', 50)").run(month + "-01");
    assert.deepEqual(await aiAllowance(env), { spentUsd: localToday().endsWith("-01") ? 5.2 : 0.7, limitUsd: 100, monthSpentUsd: 5.2, monthLimitUsd: 5 });
    await assert.rejects(callOpenAI(env, { instructions: "x", input: "y" }), error => error.limit === true && /pozastavená/.test(error.message));
    assert.equal(calls(), 1);
  });
  assert.equal(aiMonthlyLimitUsd({ AI_MONTHLY_LIMIT_USD: "12" }), 12);
  assert.equal(aiMonthlyLimitUsd({ USER_IS_OWNER: true, ENVIRONMENT: "staging" }), null);
  assert.equal(aiMonthlyLimitUsd({ USER_IS_OWNER: true }), 5, "live, the owner has a paying account's limit");
});


test("the limit is set per deployment, and 0 turns AI off for everyone but the owner", async () => {
  assert.equal(aiDailyLimitUsd({ AI_DAILY_LIMIT_USD: "2.5" }), 2.5);
  // Without the setting there is no daily limit, only the monthly one.
  assert.equal(aiDailyLimitUsd({}), null);
  assert.equal(aiDailyLimitUsd({ AI_DAILY_LIMIT_USD: "nonsense" }), null);
  await withOpenAI(async calls => {
    const env = envFor(grantAiConsent(createD1(), 7), { AI_DAILY_LIMIT_USD: "0" });
    await assert.rejects(callOpenAI(env, { instructions: "x", input: "y" }), /nejsou pro tento účet zapnuté/);
    assert.equal(calls(), 0);
  });
  // An unknown model still costs something.
  assert.equal(usageCost("gpt-6-luna-mini", { input_tokens: 1e6, output_tokens: 0 }), 0.1);
});

test("the AI limit reaches the user as a message, and every AI call names its feature", () => {
  const entry = serverSource();
  assert.match(entry, /if\(error\.limit\)return Response\.json\(\{message:error\.message\},\{status:error\.status\|\|429\}\)/);
  assert.match(entry, /aiAllowance\(env\)/);
  for (const file of ["coach-assistant", "coach-reflection", "coach-review", "exercise-technique", "food-ai", "food-chat", "food-photo", "gym-adjust"]) {
    const source = readFileSync(new URL(`../src/${file}.js`, import.meta.url), "utf8");
    const calls = source.match(/(?:await|return) callOpenAI\(env, \{/g) || [];
    const named = source.match(/(?:await|return) callOpenAI\(env, \{ ?feature: ?["'][a-z-]+["']/g) || [];
    assert.ok(calls.length && calls.length === named.length, file);
  }
});

test("the AI intro is remembered per account", async () => {
  const { subscriptionStatus, markAiIntroSeen } = await import("../src/subscription.js");
  const { createD1 } = await import("./helpers/d1.mjs");
  const { scopedDb } = await import("../src/tenancy.js");
  const raw = createD1(), env = { DB: scopedDb(raw, 7), USER_ID: 7 };
  raw.sqlite.exec("CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id))");
  assert.equal((await subscriptionStatus(env)).introSeen, false);
  await markAiIntroSeen(env);
  assert.equal((await subscriptionStatus(env)).introSeen, true);
  assert.equal((await subscriptionStatus({ DB: scopedDb(raw, 8), USER_ID: 8 })).introSeen, false);
});
