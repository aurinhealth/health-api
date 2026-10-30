// What every AI answer cost, per user and day, and a monthly limit per user.
// Every model call goes through callOpenAI (coach-assistant.js), which holds
// a slot with the call's most possible cost while it runs, checks the limit
// and records the real cost after. The monthly limit is the
// user's AI budget and the lever a paid tier would raise: AI_MONTHLY_LIMIT_USD
// (default 5 USD a month), set high as an emergency brake. AI_DAILY_LIMIT_USD
// guards the AI around the coach (food, plans, reviews) against abuse (a script,
// a loop); the coach chat is not in it, its messages get their own allowance.
// 0 in either turns AI off for everyone but the owner. The owner is never limited. The App Review
// account (APP_REVIEW_EMAIL) never gets more than REVIEW_AI_MONTHLY_LIMIT_USD.
// The messages name no amount: the user is told when it resets, not what it costs.
import { L } from './lang.js';
import { localToday } from "./user-time.js";
import { isReviewAccount, REVIEW_AI_MONTHLY_LIMIT_USD } from "./app-review.js";
import { aiLimitShare } from "./ai-limit-share.js";
import { addAiSpend } from "./ai-total.js";

const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Prices in USD per 1M tokens (input, cached input, output). Input the model
// has seen in the last few minutes with the same beginning is cached by OpenAI
// and billed at the cached price (usage.input_tokens_details.cached_tokens).
export const MODEL_PRICES = { "gpt-6-luna": [0.10, 0.01, 0.50], "gpt-6-sol": [2, 0.20, 10], "gpt-6.1-sol": [2, 0.10, 10], "gpt-6-astra": [10, 1, 50] };
// Each web search the model runs is billed on top of the tokens (10 USD per 1,000 calls).
export const WEB_SEARCH_USD = 0.01;
export const cachedTokens = usage => Math.min(n(usage?.input_tokens_details?.cached_tokens) || 0, n(usage?.input_tokens) || 0);
export function usageCost(model, usage, webSearches = 0) {
  const key = Object.keys(MODEL_PRICES).sort((a, b) => b.length - a.length).find(k => String(model || "").startsWith(k));
  if (!key || !usage) return null;
  const [i, c, o] = MODEL_PRICES[key], cached = cachedTokens(usage);
  return Math.round((((n(usage.input_tokens) || 0) - cached) * i + cached * c + (n(usage.output_tokens) || 0) * o + (n(webSearches) || 0) * WEB_SEARCH_USD * 1e6) / 1e6 * 1e5) / 1e5;
}

// share: the part of the limits the account gets (aiLimitShare, ai-limit-share.js).
export function aiDailyLimitUsd(env, share = 1) {
  if (env.USER_IS_OWNER === true) return null;
  const limit = n(env.AI_DAILY_LIMIT_USD);
  return limit != null && limit >= 0 ? limit * share : null;
}

export const DEFAULT_AI_MONTHLY_LIMIT_USD = 5;
export function aiMonthlyLimitUsd(env, share = 1) {
  if (env.USER_IS_OWNER === true) return null;
  const limit = n(env.AI_MONTHLY_LIMIT_USD), base = (limit != null && limit >= 0 ? limit : DEFAULT_AI_MONTHLY_LIMIT_USD) * share;
  // The App Review demo account gets a small fixed budget (app-review.js).
  return isReviewAccount(env) ? Math.min(base, REVIEW_AI_MONTHLY_LIMIT_USD) : base;
}

const tracked = env => Boolean(env?.DB && Number(env.USER_ID) > 0);

const withCachedColumn = new WeakSet();
export async function ensureAiUsage(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, day TEXT NOT NULL, feature TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL, cached_tokens INTEGER)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS ai_usage_user_day ON ai_usage(user_id, day)").run();
  if (!withCachedColumn.has(db)) { await db.prepare("ALTER TABLE ai_usage ADD COLUMN cached_tokens INTEGER").run().catch(() => { /* already there */ }); withCachedColumn.add(db); }
}

// The coach chat, which the daily guard does not cover.
export const COACH_CHAT_FEATURE = "assistant";
// What a new account took over from a deleted one of the same person
// (ai-limit-memory.js): rows of this model; the rest of the month's spending
// sits on the 1st under CARRIED_MONTH_FEATURE, which the daily guard leaves out.
export const CARRIED_MODEL = "carried-over";
export const CARRIED_MONTH_FEATURE = "carried-over-month";

// Today's spending under the daily guard: everything but the coach chat (and a
// carried-over month).
// A running call counts at its reservation (claimAiSlot); exceptId leaves one
// row out, the call that is asking.
export async function aiSpentToday(env, { exceptId = 0 } = {}) {
  if (!tracked(env)) return 0;
  await ensureAiUsage(env.DB);
  const row = await env.DB.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM ai_usage WHERE user_id = ? AND day = ? AND COALESCE(feature, '') NOT IN (?, ?) AND id != ?").bind(env.USER_ID, localToday(), COACH_CHAT_FEATURE, CARRIED_MONTH_FEATURE, Number(exceptId) || 0).first();
  return Math.round(Number(row?.spent || 0) * 1e5) / 1e5;
}

export async function aiSpentThisMonth(env, { exceptId = 0 } = {}) {
  if (!tracked(env)) return 0;
  await ensureAiUsage(env.DB);
  const month = localToday().slice(0, 7);
  const row = await env.DB.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM ai_usage WHERE user_id = ? AND day >= ? AND day <= ? AND id != ?").bind(env.USER_ID, month + "-01", month + "-31", Number(exceptId) || 0).first();
  return Math.round(Number(row?.spent || 0) * 1e5) / 1e5;
}

export async function aiAllowance(env) {
  const [spentUsd, monthSpentUsd, share] = await Promise.all([aiSpentToday(env), aiSpentThisMonth(env), aiLimitShare(env)]);
  return { spentUsd, limitUsd: aiDailyLimitUsd(env, share), monthSpentUsd, monthLimitUsd: aiMonthlyLimitUsd(env, share) };
}

// Throws before a model call once this month's or today's spending reached its
// limit; the daily one does not stop the coach chat. exceptId: the asking
// call's own slot, whose reservation does not count against itself.
export async function assertAiAllowance(env, feature = null, { exceptId = 0 } = {}) {
  if (!tracked(env)) return;
  const share = await aiLimitShare(env);
  const monthLimit = aiMonthlyLimitUsd(env, share), dayLimit = feature === COACH_CHAT_FEATURE ? null : aiDailyLimitUsd(env, share);
  if (monthLimit == null && dayLimit == null) return;
  if (monthLimit === 0 || dayLimit === 0) throw limitError(L("AI funkce nejsou pro tento účet zapnuté.", "AI features aren't enabled for this account."));
  // A failed read of the log does not cost the user the answer.
  const failed = error => { console.error("AI usage read failed", error?.message || error); return 0; };
  const [monthSpent, daySpent] = await Promise.all([monthLimit == null ? 0 : aiSpentThisMonth(env, { exceptId }).catch(failed), dayLimit == null ? 0 : aiSpentToday(env, { exceptId }).catch(failed)]);
  if (monthLimit != null && monthSpent >= monthLimit) throw limitError(L("AI je teď pro tvůj účet pozastavená. Ozvi se nám na podporu.", "AI is paused for your account for now. Please contact support."));
  if (dayLimit != null && daySpent >= dayLimit) throw limitError(L("Pro dnešek toho bylo s AI hodně. Pokračovat můžeš zítra.", "That's a lot of AI for today. You can carry on tomorrow."));
}

// A call's cost is known only after it, so parallel requests would all pass
// the limit before the first cost lands. Each limited user therefore has at
// most AI_PARALLEL_CALLS calls running at once: a running call is a 'pending'
// row in ai_usage, claimed in one statement (D1 runs them one at a time), and
// the row holds what the call can cost at most (estimateAiCostUsd), so the
// limit sees the calls still running. The answer's real cost replaces it
// (recordAiUsage with the slot's id); a call that ends without one removes it.
// A row left by a Worker that died keeps its slot for AI_PENDING_MINUTES and
// its reservation for good: the call may well have been billed. A call over
// the parallel limit waits in line for a free slot (five food photos in a row,
// the coach's texts beside them) and is refused only after AI_SLOT_WAIT_MS.
// The returned release function carries the row's id.
export const AI_PARALLEL_CALLS = 3;
export const AI_SLOT_WAIT_MS = 90000;
const AI_PENDING_MINUTES = 5;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function claimAiSlot(env, { waitMs = AI_SLOT_WAIT_MS, pollMs = 800, feature = null, reserveUsd = 0 } = {}) {
  if (!tracked(env) || (aiMonthlyLimitUsd(env) == null && aiDailyLimitUsd(env) == null)) return async () => {};
  await ensureAiUsage(env.DB);
  const reserve = Math.max(0, n(reserveUsd) || 0);
  const claim = () => env.DB.prepare(`INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) SELECT ?, ?, ?, 'pending', ?
    WHERE (SELECT COUNT(*) FROM ai_usage WHERE user_id = ? AND model = 'pending' AND created_at > datetime('now', '-${AI_PENDING_MINUTES} minutes')) < ? RETURNING id`)
    .bind(env.USER_ID, localToday(), feature || 'pending', reserve, env.USER_ID, AI_PARALLEL_CALLS).first();
  const deadline = Date.now() + Math.max(0, waitMs);
  let claimed = await claim();
  while (!claimed && Date.now() < deadline) {
    await pause(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    claimed = await claim();
  }
  if (!claimed) throw limitError(L("Ještě běží jiné dotazy na AI. Zkus to za chvíli.", "Other AI requests are still running. Try again in a moment."));
  const release = () => env.DB.prepare("DELETE FROM ai_usage WHERE id = ? AND user_id = ? AND model = 'pending'").bind(claimed.id, env.USER_ID).run().catch(error => console.error("AI slot not released", error?.message || error));
  release.id = claimed.id;
  return release;
}

// The most a call can cost: its input (about 3 characters a token, an image
// as IMAGE_TOKENS), all of max_output_tokens and a few web searches, at the
// model's price (an unknown model at gpt-6-sol's). Held while the call runs.
const IMAGE_TOKENS = 1600, RESERVED_WEB_SEARCHES = 3;
export function estimateAiCostUsd(model, { instructions = "", input = "", maxOutputTokens = 0, tools = null } = {}) {
  let chars = 0, images = 0;
  const walk = value => {
    if (typeof value === "string") { if (value.startsWith("data:")) images++; else chars += value.length; }
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(instructions); walk(input);
  const usage = { input_tokens: Math.ceil(chars / 3) + images * IMAGE_TOKENS, output_tokens: Math.max(0, n(maxOutputTokens) || 0) };
  const searches = Array.isArray(tools) && tools.some(tool => String(tool?.type || "").startsWith("web_search")) ? RESERVED_WEB_SEARCHES : 0;
  return usageCost(model, usage, searches) ?? usageCost("gpt-6-sol", usage, searches) ?? 0;
}

function limitError(message) {
  const error = new Error(message);
  error.ai = true;
  error.limit = true;
  error.status = 429;
  return error;
}

// A call that broke off after it was sent (a stream cut short, a timeout, a
// lost connection) leaves no usage, yet the model may have worked on it:
// its reservation stays as its cost. Best effort, as recordAiUsage.
export async function keepAiReservation(env, slotId, { feature = null, model = null } = {}) {
  if (!tracked(env) || !slotId) return;
  await env.DB.prepare("UPDATE ai_usage SET feature = ?, model = ? WHERE id = ? AND user_id = ? AND model = 'pending'")
    .bind(feature, model || "unknown", slotId, env.USER_ID).run().catch(error => console.error("AI reservation not kept", error?.message || error));
}

// Best effort: a failed write never costs the user the answer. slotId: the
// call's pending row (claimAiSlot), which becomes the record.
export async function recordAiUsage(env, { feature = null, model = null, usage = null, webSearches = 0, slotId = null } = {}) {
  if (!tracked(env) || !usage) return;
  try {
    await ensureAiUsage(env.DB);
    // An unknown model counts at the default model's price, so it cannot slip past the limit.
    const cost = usageCost(model, usage, webSearches) ?? usageCost("gpt-6-sol", usage, webSearches) ?? 0;
    const values = [feature, model, n(usage.input_tokens) || 0, n(usage.output_tokens) || 0, cost, cachedTokens(usage)];
    // All users' total of the day (ai-total.js), the owner's included.
    await addAiSpend(env, cost);
    if (slotId) {
      const settled = await env.DB.prepare("UPDATE ai_usage SET feature = ?, model = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, cached_tokens = ? WHERE id = ? AND user_id = ? AND model = 'pending'")
        .bind(...values, slotId, env.USER_ID).run();
      if (Number(settled?.meta?.changes) > 0) return;
    }
    await env.DB.prepare("INSERT INTO ai_usage (user_id, day, feature, model, input_tokens, output_tokens, cost_usd, cached_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(env.USER_ID, localToday(), ...values).run();
  } catch (error) {
    console.error("AI usage not recorded", error?.message || error);
  }
}
