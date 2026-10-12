// What every AI answer cost, per user and day, and a monthly limit per user.
// Every model call goes through callOpenAI (coach-assistant.js), which checks
// the limit before asking and records the cost after. The monthly limit is the
// user's AI budget and the lever a paid tier would raise: AI_MONTHLY_LIMIT_USD
// (default 5 USD a month). How it is spread over the month is up to the user;
// a daily limit applies only when AI_DAILY_LIMIT_USD is set. 0 in either turns
// AI off for everyone but the owner. The owner is never limited. The App Review
// account (APP_REVIEW_EMAIL) never gets more than REVIEW_AI_MONTHLY_LIMIT_USD.
import { L } from './lang.js';
import { localToday } from "./user-time.js";
import { isReviewAccount, REVIEW_AI_MONTHLY_LIMIT_USD } from "./app-review.js";

const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Prices in USD per 1M tokens (input, output).
export const MODEL_PRICES = { "gpt-6-luna": [0.10, 0.50], "gpt-6-sol": [2, 10], "gpt-6.1-sol": [2, 10], "gpt-6-astra": [10, 50] };
// Each web search the model runs is billed on top of the tokens (10 USD per 1,000 calls).
export const WEB_SEARCH_USD = 0.01;
export function usageCost(model, usage, webSearches = 0) {
  const key = Object.keys(MODEL_PRICES).sort((a, b) => b.length - a.length).find(k => String(model || "").startsWith(k));
  if (!key || !usage) return null;
  const [i, o] = MODEL_PRICES[key];
  return Math.round(((n(usage.input_tokens) || 0) * i + (n(usage.output_tokens) || 0) * o + (n(webSearches) || 0) * WEB_SEARCH_USD * 1e6) / 1e6 * 1e5) / 1e5;
}

export function aiDailyLimitUsd(env) {
  if (env.USER_IS_OWNER === true) return null;
  const limit = n(env.AI_DAILY_LIMIT_USD);
  return limit != null && limit >= 0 ? limit : null;
}

export const DEFAULT_AI_MONTHLY_LIMIT_USD = 5;
export function aiMonthlyLimitUsd(env) {
  if (env.USER_IS_OWNER === true) return null;
  const limit = n(env.AI_MONTHLY_LIMIT_USD), base = limit != null && limit >= 0 ? limit : DEFAULT_AI_MONTHLY_LIMIT_USD;
  // The App Review demo account gets a small fixed budget (app-review.js).
  return isReviewAccount(env) ? Math.min(base, REVIEW_AI_MONTHLY_LIMIT_USD) : base;
}

const tracked = env => Boolean(env?.DB && Number(env.USER_ID) > 0);

async function ensureAiUsage(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, day TEXT NOT NULL, feature TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS ai_usage_user_day ON ai_usage(user_id, day)").run();
}

export async function aiSpentToday(env) {
  if (!tracked(env)) return 0;
  await ensureAiUsage(env.DB);
  const row = await env.DB.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM ai_usage WHERE user_id = ? AND day = ?").bind(env.USER_ID, localToday()).first();
  return Math.round(Number(row?.spent || 0) * 1e5) / 1e5;
}

export async function aiSpentThisMonth(env) {
  if (!tracked(env)) return 0;
  await ensureAiUsage(env.DB);
  const month = localToday().slice(0, 7);
  const row = await env.DB.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM ai_usage WHERE user_id = ? AND day >= ? AND day <= ?").bind(env.USER_ID, month + "-01", month + "-31").first();
  return Math.round(Number(row?.spent || 0) * 1e5) / 1e5;
}

export async function aiAllowance(env) {
  const [spentUsd, monthSpentUsd] = await Promise.all([aiSpentToday(env), aiSpentThisMonth(env)]);
  return { spentUsd, limitUsd: aiDailyLimitUsd(env), monthSpentUsd, monthLimitUsd: aiMonthlyLimitUsd(env) };
}

const usd = v => "$" + (Math.round(v * 100) / 100).toFixed(2);

// Throws before a model call once this month's or today's spending reached its limit.
export async function assertAiAllowance(env) {
  if (!tracked(env)) return;
  const monthLimit = aiMonthlyLimitUsd(env), dayLimit = aiDailyLimitUsd(env);
  if (monthLimit == null && dayLimit == null) return;
  if (monthLimit === 0 || dayLimit === 0) throw limitError(L("AI funkce nejsou pro tento účet zapnuté.", "AI features aren't enabled for this account."));
  // A failed read of the log does not cost the user the answer.
  const failed = error => { console.error("AI usage read failed", error?.message || error); return 0; };
  const [monthSpent, daySpent] = await Promise.all([monthLimit == null ? 0 : aiSpentThisMonth(env).catch(failed), dayLimit == null ? 0 : aiSpentToday(env).catch(failed)]);
  if (monthLimit != null && monthSpent >= monthLimit) throw limitError(L(`Měsíční limit AI je vyčerpaný (${usd(monthLimit)}). Obnoví se prvního dne dalšího měsíce.`, `The monthly AI limit is used up (${usd(monthLimit)}). It resets on the first day of next month.`));
  if (dayLimit != null && daySpent >= dayLimit) throw limitError(L(`Denní limit AI je vyčerpaný (${usd(dayLimit)}). Zítra se obnoví.`, `The daily AI limit is used up (${usd(dayLimit)}). It resets tomorrow.`));
}

// Limits are checked before a call and its cost recorded after it, so parallel
// requests would all pass the check before the first cost lands. Each limited
// user therefore has at most AI_PARALLEL_CALLS calls running at once: a running
// call is a 'pending' row in ai_usage, claimed in one statement (D1 runs them
// one at a time) and removed when the call ends. A row left by a Worker that
// died counts for AI_PENDING_MINUTES at most.
export const AI_PARALLEL_CALLS = 3;
const AI_PENDING_MINUTES = 5;
export async function claimAiSlot(env) {
  if (!tracked(env) || (aiMonthlyLimitUsd(env) == null && aiDailyLimitUsd(env) == null)) return async () => {};
  await ensureAiUsage(env.DB);
  const claimed = await env.DB.prepare(`INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) SELECT ?, ?, 'pending', 'pending', 0
    WHERE (SELECT COUNT(*) FROM ai_usage WHERE user_id = ? AND model = 'pending' AND created_at > datetime('now', '-${AI_PENDING_MINUTES} minutes')) < ? RETURNING id`)
    .bind(env.USER_ID, localToday(), env.USER_ID, AI_PARALLEL_CALLS).first();
  if (!claimed) throw limitError(L("Ještě běží jiné dotazy na AI. Zkus to za chvíli.", "Other AI requests are still running. Try again in a moment."));
  return () => env.DB.prepare("DELETE FROM ai_usage WHERE id = ? AND user_id = ? AND model = 'pending'").bind(claimed.id, env.USER_ID).run().catch(error => console.error("AI slot not released", error?.message || error));
}

function limitError(message) {
  const error = new Error(message);
  error.ai = true;
  error.limit = true;
  error.status = 429;
  return error;
}

// Best effort: a failed write never costs the user the answer.
export async function recordAiUsage(env, { feature = null, model = null, usage = null, webSearches = 0 } = {}) {
  if (!tracked(env) || !usage) return;
  try {
    await ensureAiUsage(env.DB);
    // An unknown model counts at the default model's price, so it cannot slip past the limit.
    const cost = usageCost(model, usage, webSearches) ?? usageCost("gpt-6-sol", usage, webSearches) ?? 0;
    await env.DB.prepare("INSERT INTO ai_usage (user_id, day, feature, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(env.USER_ID, localToday(), feature, model, n(usage.input_tokens) || 0, n(usage.output_tokens) || 0, cost).run();
  } catch (error) {
    console.error("AI usage not recorded", error?.message || error);
  }
}
