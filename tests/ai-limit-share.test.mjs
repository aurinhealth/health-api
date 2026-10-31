import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { aiLimitShare, aiGroup } from "../src/ai-limit-share.js";
import { aiAllowance, assertAiAllowance, ensureAiUsage } from "../src/ai-usage.js";
import { coachAllowance } from "../src/coach-allowance.js";
import { ensureStoreColumns } from "../src/app-store.js";
import { localToday } from "../src/user-time.js";

const LIMITS = { AI_MONTHLY_LIMIT_USD: "6", AI_DAILY_LIMIT_USD: "1", COACH_WEEKLY_MESSAGES: "30", AI_UNPAID_LIMIT_SHARE: "0.5" };
const future = new Date(Date.now() + 30 * 86400000).toISOString();

async function account({ plan = null, environment = "Production", trial = 0, until = future, ...extra } = {}) {
  const raw = createD1();
  await ensureStoreColumns(raw);
  if (plan) raw.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, store_environment, free_trial) VALUES (7, ?, ?, ?, ?)").run(plan, until, environment, trial);
  return { ...LIMITS, DB: scopedDb(raw, 7), USER_ID: 7, ...extra };
}

test("without a purchase (the pilot) every limit is half: 15 messages, 0.5 USD a day, 3 USD a month", async () => {
  const env = await account();
  assert.equal(await aiLimitShare(env), 0.5);
  assert.equal((await coachAllowance(env)).limit, 15);
  const allowance = await aiAllowance(env);
  assert.deepEqual([allowance.limitUsd, allowance.monthLimitUsd], [0.5, 3]);
});

test("a paid Production subscription gets the whole limits", async () => {
  const env = await account({ plan: "ai" });
  assert.equal(await aiGroup(env), "paid");
  assert.equal((await coachAllowance(env)).limit, 30);
  const allowance = await aiAllowance(env);
  assert.deepEqual([allowance.limitUsd, allowance.monthLimitUsd], [1, 6]);
});

test("the free week, a TestFlight (Sandbox) purchase and an expired one stay at half", async () => {
  for (const options of [{ plan: "ai", trial: 1 }, { plan: "ai", environment: "Sandbox" }, { plan: "ai", until: new Date(Date.now() - 1000).toISOString() }, { plan: "free" }]) {
    assert.equal(await aiLimitShare(await account(options)), 0.5, JSON.stringify(options));
  }
});

test("unset share: everyone has the whole limits; the owner has a paying account's, none on the test server", async () => {
  assert.equal(await aiLimitShare(await account({ AI_UNPAID_LIMIT_SHARE: "" })), 1);
  assert.equal(await aiLimitShare(await account({ AI_UNPAID_LIMIT_SHARE: "nonsense" })), 1);
  const owner = await account({ USER_IS_OWNER: true });
  assert.equal(await aiLimitShare(owner), 1);
  assert.equal((await coachAllowance(owner)).limit, 30);
  assert.equal(await coachAllowance(await account({ USER_IS_OWNER: true, ENVIRONMENT: "staging" })), null);
});

test("the halved month stops AI at 3 USD", async () => {
  const env = await account();
  await ensureAiUsage(env.DB);
  env.DB.prepare("INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) VALUES (7, ?, 'assistant', 'gpt-6-sol', 3)").bind(localToday()).run();
  await assert.rejects(assertAiAllowance(env, "assistant"), error => error.status === 429);
  await assert.doesNotReject(assertAiAllowance(await account({ plan: "ai" }), "assistant"));
});
