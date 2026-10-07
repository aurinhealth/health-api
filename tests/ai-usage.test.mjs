import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { aiAllowance, aiDailyLimitUsd, aiMonthlyLimitUsd, usageCost } from "../src/ai-usage.js";
import { pragueToday } from "../src/prague-date.js";

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
  const db = createD1();
  await withOpenAI(async () => {
    const env = envFor(db);
    await callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });
    const row = db.sqlite.prepare("SELECT user_id, feature, model, input_tokens, output_tokens, cost_usd FROM ai_usage").get();
    assert.deepEqual({ ...row }, { user_id: 7, feature: "food-lookup", model: "gpt-6-sol", input_tokens: 100000, output_tokens: 50000, cost_usd: 0.7 });
    assert.deepEqual(await aiAllowance(env), { spentUsd: 0.7, limitUsd: 1, monthSpentUsd: 0.7, monthLimitUsd: 5 });
  });
});

test("web searches are counted on top of the tokens, failed ones are not", async () => {
  const db = createD1(), realFetch = globalThis.fetch;
  const search = status => ({ type: "web_search_call", status });
  globalThis.fetch = async () => Response.json({ model: "gpt-6-luna", output: [search("completed"), search("completed"), search("failed"), { content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 10000, output_tokens: 1000 } });
  try {
    await callOpenAI(envFor(db), { feature: "food-lookup", instructions: "x", input: "y", tools: [{ type: "web_search" }] });
  } finally { globalThis.fetch = realFetch; }
  // 0.001 + 0.0005 for tokens, 2 × 0.01 for searches.
  assert.equal(db.sqlite.prepare("SELECT cost_usd FROM ai_usage").get().cost_usd, 0.0215);
  assert.equal(usageCost("gpt-6-luna", { input_tokens: 10000, output_tokens: 1000 }), 0.0015);
});

test("the daily limit stops the next call once it is spent; the owner has none", async () => {
  const db = createD1();
  await withOpenAI(async calls => {
    const env = envFor(db);
    await callOpenAI(env, { instructions: "x", input: "y" });
    await callOpenAI(env, { instructions: "x", input: "y" });
    await assert.rejects(callOpenAI(env, { instructions: "x", input: "y" }), error => error.limit === true && error.status === 429 && /Denní limit AI/.test(error.message));
    assert.equal(calls(), 2);
    // Another user has their own budget.
    await callOpenAI({ ...env, DB: scopedDb(db, 8), USER_ID: 8 }, { instructions: "x", input: "y" });
    // The owner is never stopped.
    const owner = { ...env, USER_IS_OWNER: true };
    await callOpenAI(owner, { instructions: "x", input: "y" });
    assert.equal(calls(), 4);
    assert.equal(aiDailyLimitUsd(owner), null);
  });
});

test("the monthly limit stops AI for the rest of the month and counts only this month", async () => {
  const db = createD1();
  await withOpenAI(async calls => {
    const env = envFor(db, { AI_DAILY_LIMIT_USD: "100" });
    await callOpenAI(env, { instructions: "x", input: "y" });
    const month = pragueToday().slice(0, 7);
    // Earlier this month and last month: only this month counts.
    db.sqlite.prepare("INSERT INTO ai_usage (user_id, day, cost_usd) VALUES (7, ?, 4.5), (7, '2000-01-15', 50)").run(month + "-01");
    assert.deepEqual(await aiAllowance(env), { spentUsd: pragueToday().endsWith("-01") ? 5.2 : 0.7, limitUsd: 100, monthSpentUsd: 5.2, monthLimitUsd: 5 });
    await assert.rejects(callOpenAI(env, { instructions: "x", input: "y" }), error => error.limit === true && /Měsíční limit AI/.test(error.message));
    assert.equal(calls(), 1);
  });
  assert.equal(aiMonthlyLimitUsd({ AI_MONTHLY_LIMIT_USD: "12" }), 12);
  assert.equal(aiMonthlyLimitUsd({ USER_IS_OWNER: true }), null);
});

test("settings show this month's AI spending against the limit in the app language", () => {
  const source = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function aiUsageHtml("), source.indexOf("\nasync function loadAccount("));
  for (const lang of ["cs", "en"]) {
    const uiText = (cs, en) => lang === "en" ? en : cs, esc = v => String(v);
    const html = new Function("uiText", "esc", fn + "; return aiUsageHtml;")(uiText, esc)({ spentUsd: 0.02, limitUsd: 1, monthSpentUsd: 0.1, monthLimitUsd: 5 });
    assert.match(html, lang === "en" ? /AI this month: <strong>0\.10 USD of 5\.00 USD<\/strong> · today 0\.02 USD of 1\.00 USD/ : /AI tento měsíc: <strong>0,10 USD z 5,00 USD<\/strong> · dnes 0,02 USD z 1,00 USD/);
    assert.match(html, /width:2\.0%/);
  }
});

test("the limit is set per deployment, and 0 turns AI off for everyone but the owner", async () => {
  assert.equal(aiDailyLimitUsd({ AI_DAILY_LIMIT_USD: "2.5" }), 2.5);
  assert.equal(aiDailyLimitUsd({ AI_DAILY_LIMIT_USD: "nonsense" }), 1);
  await withOpenAI(async calls => {
    const env = envFor(createD1(), { AI_DAILY_LIMIT_USD: "0" });
    await assert.rejects(callOpenAI(env, { instructions: "x", input: "y" }), /nejsou pro tento účet zapnuté/);
    assert.equal(calls(), 0);
  });
  // An unknown model still costs something.
  assert.equal(usageCost("gpt-6-luna-mini", { input_tokens: 1e6, output_tokens: 0 }), 0.1);
});

test("the AI limit reaches the user as a message, and every AI call names its feature", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /if\(error\.limit\)return Response\.json\(\{message:error\.message\},\{status:error\.status\|\|429\}\)/);
  assert.match(entry, /aiAllowance\(env\)/);
  for (const file of ["coach-assistant", "coach-reflection", "coach-review", "exercise-technique", "food-ai", "food-chat", "food-photo", "gym-adjust"]) {
    const source = readFileSync(new URL(`../src/${file}.js`, import.meta.url), "utf8");
    const calls = source.match(/(?:await|return) callOpenAI\(env, \{/g) || [];
    const named = source.match(/(?:await|return) callOpenAI\(env, \{ ?feature: ?["'][a-z-]+["']/g) || [];
    assert.ok(calls.length && calls.length === named.length, file);
  }
});

test("the AI plans pop up once at the first AI use during the pilot, and on every locked feature later", async () => {
  const { subscriptionStatus, markAiIntroSeen } = await import("../src/subscription.js");
  const { createD1 } = await import("./helpers/d1.mjs");
  const { scopedDb } = await import("../src/tenancy.js");
  const raw = createD1(), env = { DB: scopedDb(raw, 7), USER_ID: 7 };
  raw.sqlite.exec("CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id))");
  assert.equal((await subscriptionStatus(env)).introSeen, false);
  await markAiIntroSeen(env);
  assert.equal((await subscriptionStatus(env)).introSeen, true);
  assert.equal((await subscriptionStatus({ DB: scopedDb(raw, 8), USER_ID: 8 })).introSeen, false);
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  assert.match(client, /async function jsonFetch\(path,options=\{\}\)\{if\(typeof aiIntroBefore==='function'\)await aiIntroBefore\(path,options\);/);
  assert.match(client, /if\(s\.mode!=='pilot'\|\|s\.introSeen\)return;/);
  assert.match(client, /if\(r\.status===402&&typeof showAiPlans==='function'\)subscriptionInfo\(\)\.then\(s=>showAiPlans\(s,\{locked:true\}\)\)/);
  assert.match(client, /if\(typeof aiIntroBefore==='function'\)await aiIntroBefore\('\/app\/api\/assistant',\{method:'POST'\}\);/);
});
