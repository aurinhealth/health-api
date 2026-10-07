// What every AI answer cost, per user and day, and a daily limit per user.
// Every model call goes through callOpenAI (coach-assistant.js), which checks
// the limit before asking and records the cost after. The limit is the lever a
// paid tier would raise: AI_DAILY_LIMIT_USD (default 1 USD a day; 0 turns AI
// off for everyone but the owner). The owner is never limited.
import { pragueToday } from "./prague-date.js";

const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Prices in USD per 1M tokens (input, output).
export const MODEL_PRICES = { "gpt-6-luna": [0.10, 0.50], "gpt-6-sol": [2, 10], "gpt-6.1-sol": [2, 10], "gpt-6-astra": [10, 50] };
export function usageCost(model, usage) {
  const key = Object.keys(MODEL_PRICES).sort((a, b) => b.length - a.length).find(k => String(model || "").startsWith(k));
  if (!key || !usage) return null;
  const [i, o] = MODEL_PRICES[key];
  return Math.round(((n(usage.input_tokens) || 0) * i + (n(usage.output_tokens) || 0) * o) / 1e6 * 1e5) / 1e5;
}

export const DEFAULT_AI_DAILY_LIMIT_USD = 1;
export function aiDailyLimitUsd(env) {
  if (env.USER_IS_OWNER === true) return null;
  const limit = n(env.AI_DAILY_LIMIT_USD);
  return limit != null && limit >= 0 ? limit : DEFAULT_AI_DAILY_LIMIT_USD;
}

const tracked = env => Boolean(env?.DB && Number(env.USER_ID) > 0);

async function ensureAiUsage(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, day TEXT NOT NULL, feature TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS ai_usage_user_day ON ai_usage(user_id, day)").run();
}

export async function aiSpentToday(env) {
  if (!tracked(env)) return 0;
  await ensureAiUsage(env.DB);
  const row = await env.DB.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM ai_usage WHERE user_id = ? AND day = ?").bind(env.USER_ID, pragueToday()).first();
  return Math.round(Number(row?.spent || 0) * 1e5) / 1e5;
}

export async function aiAllowance(env) {
  const limitUsd = aiDailyLimitUsd(env);
  return { spentUsd: await aiSpentToday(env), limitUsd };
}

const usd = v => "$" + (Math.round(v * 100) / 100).toFixed(2);

// Throws before a model call once today's spending reached the limit.
export async function assertAiAllowance(env) {
  if (!tracked(env)) return;
  const limit = aiDailyLimitUsd(env);
  if (limit == null) return;
  // A failed read of the log does not cost the user the answer.
  const spent = await aiSpentToday(env).catch(error => { console.error("AI usage read failed", error?.message || error); return 0; });
  if (spent < limit && limit > 0) return;
  const error = new Error(limit > 0 ? `Denní limit AI je vyčerpaný (${usd(limit)}). Zítra se obnoví.` : "AI funkce nejsou pro tento účet zapnuté.");
  error.ai = true;
  error.limit = true;
  error.status = 429;
  throw error;
}

// Best effort: a failed write never costs the user the answer.
export async function recordAiUsage(env, { feature = null, model = null, usage = null } = {}) {
  if (!tracked(env) || !usage) return;
  try {
    await ensureAiUsage(env.DB);
    // An unknown model counts at the default model's price, so it cannot slip past the limit.
    const cost = usageCost(model, usage) ?? usageCost("gpt-6-sol", usage) ?? 0;
    await env.DB.prepare("INSERT INTO ai_usage (user_id, day, feature, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(env.USER_ID, pragueToday(), feature, model, n(usage.input_tokens) || 0, n(usage.output_tokens) || 0, cost).run();
  } catch (error) {
    console.error("AI usage not recorded", error?.message || error);
  }
}
