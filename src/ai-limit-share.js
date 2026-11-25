// Half of every AI limit until the account pays for Pro itself: the pilot (no
// purchase, everyone has Pro), TestFlight (its purchases are Sandbox ones) and
// the free week (Apple's introductory offer). A paid Production subscription
// (an offer code's too) gets the whole limits. AI_UNPAID_LIMIT_SHARE
// (wrangler.jsonc) is the share; unset, every account has the whole limits.
// The owner's account has a paying account's limits whatever it bought: it
// tests the live server from TestFlight every day (Petr 2026-11-25).
import { ensureStoreColumns } from "./app-store.js";
import { packMessagesLeft } from "./coach-packs.js";

const groupOnce = new WeakMap();
// The share an unpaid account gets; 1 when unset or not a number below 1.
export const unpaidLimitShare = env => {
  const share = Number(env?.AI_UNPAID_LIMIT_SHARE);
  return env?.AI_UNPAID_LIMIT_SHARE != null && env.AI_UNPAID_LIMIT_SHARE !== "" && Number.isFinite(share) && share >= 0 && share < 1 ? share : 1;
};

// The group an account's AI spending is counted in (ai-total.js), from its
// subscription now:
// - "paid": a paid Production Pro, or bought coach messages still left
//   (coach-packs.js; a Sandbox pack counts only on the test server);
// - "packs": a coach message paid with a bought pack (coach-packs.js), the
//   whole request (env.AI_PACK_MESSAGE, set by the coach chat), so what the
//   packs cost shows apart from the subscriptions (Petr 2026-11-22);
// - "gift": Pro through an offer code or a promotional offer (the pilot's
//   discount, a gift): whole limits, counted apart;
// - "trial": the free week (Apple's introductory offer, or a free promotional one);
// - "testflight": a Sandbox purchase, or no purchase in a TestFlight build
//   (subscriptions.testflight, app-store.js saveAppInstall): the testers;
// - "free": no purchase, an account older than NEW_ACCOUNT_DAYS (everyone of
//   the pilot until the paywall is on);
// - "owner": the owner's own account, apart from the testers, whatever it
//   bought (a paying account's limits, aiPaid and aiPlan);
// - "new": no purchase, an account made in the last NEW_ACCOUNT_DAYS (open
//   sign-up), counted apart, so accounts made in bulk never stop the pilot's AI;
// - "system": a call of no account (a job of the server) and the coach
//   evaluation on the test server (env.COACH_EVAL, coach-eval.js).
export const AI_GROUPS = ["paid", "packs", "gift", "trial", "testflight", "free", "owner", "new", "system"];
export const NEW_ACCOUNT_DAYS = 7;
// users.created_at (CURRENT_TIMESTAMP) of an account made NEW_ACCOUNT_DAYS before now.
export const newAccountSince = (now = Date.now()) => new Date(now - NEW_ACCOUNT_DAYS * 864e5).toISOString().replace("T", " ").slice(0, 19);
const OFFER_CODE = 3, PROMOTIONAL = 2;
export function groupOfSubscription(row, now = Date.now()) {
  if (!(row?.plan === "ai" && row.valid_until && Date.parse(row.valid_until) > now)) return Number(row?.testflight) === 1 ? "testflight" : "free";
  if (row.store_environment !== "Production") return "testflight";
  if (Number(row.free_trial) === 1) return "trial";
  return [OFFER_CODE, PROMOTIONAL].includes(Number(row.offer_type)) ? "gift" : "paid";
}

// Once per request (the group and the plan both read it).
const rowOnce = new WeakMap();
function subscriptionRow(env) {
  if (!rowOnce.has(env)) rowOnce.set(env, readSubscriptionRow(env));
  return rowOnce.get(env);
}
async function readSubscriptionRow(env) {
  const read = () => env.DB.prepare("SELECT plan, valid_until, store_signed_at, store_environment, free_trial, offer_type, testflight FROM subscriptions WHERE user_id = ?").bind(env.USER_ID).first();
  try { return await read(); } catch (error) {
    if (!/no such (column|table)|has no column/i.test(String(error?.message || error))) throw error;
    await ensureStoreColumns(env.DB);
    return read();
  }
}

// In the free week (Apple's introductory offer): bought coach messages are not
// offered then, since the coach chat locks when the week ends unpaid.
export async function inFreeWeek(env) {
  if (!env?.DB || !(Number(env.USER_ID) > 0)) return false;
  return groupOfSubscription(await subscriptionRow(env)) === "trial";
}

// The group of the account's purchase, once per request. A failed read counts
// as "new" (the fixed brake and half limits).
function purchaseGroup(env) {
  if (!groupOnce.has(env)) groupOnce.set(env, (async () => {
    const group = groupOfSubscription(await subscriptionRow(env));
    if (group !== "paid" && group !== "gift" && await packMessagesLeft(env).catch(() => 0) > 0) return "paid";
    if (group !== "free") return group;
    const user = await (env.RAW_DB || env.DB).prepare("SELECT created_at FROM users WHERE id = ?").bind(env.USER_ID).first();
    return user?.created_at && String(user.created_at) <= newAccountSince() ? "free" : "new";
  })().catch(error => { console.error("AI group not read", error?.message || error); return "new"; }));
  return groupOnce.get(env);
}

const noAccount = env => !env?.DB || !(Number(env.USER_ID) > 0) || env.COACH_EVAL === true;

// The group the request's AI spending is counted in (ai-total.js).
export function aiGroup(env) {
  if (noAccount(env)) return Promise.resolve("system");
  if (env.USER_IS_OWNER === true) return Promise.resolve("owner");
  if (env.AI_PACK_MESSAGE === true) return Promise.resolve("packs");
  return purchaseGroup(env);
}

// Whether the account pays (or has Pro as a gift): the whole limits.
export const aiPaid = async env => noAccount(env) || env.USER_IS_OWNER === true || ["paid", "gift"].includes(await purchaseGroup(env));

// The plan the account's monthly AI brake follows (aiMonthlyLimitUsd,
// ai-usage.js), from its subscription now: "paid" (Pro bought, any plan or
// an offer code, or a call of no account: every paying user the same brake,
// Petr 2026-11-16) or "unpaid" (no Pro bought: the free week, TestFlight, no
// purchase, only bought coach messages). The free week (Apple's
// introductory offer) counts as a period of its own: since is the day it began
// (valid_until less FREE_WEEK_DAYS), so a week across two months does not get
// two months' brakes. paidSince: the day of the newest paid record, so the
// spending of a free week that just turned paid does not take the new plan's
// week. Once per request; a failed read counts as "unpaid" (fail closed: one
// request may be refused).
export const FREE_WEEK_DAYS = 7;
const planOnce = new WeakMap();
export function aiPlan(env) {
  if (noAccount(env) || env.USER_IS_OWNER === true) return Promise.resolve({ plan: "paid" });
  if (!planOnce.has(env)) planOnce.set(env, subscriptionRow(env).then(row => {
    const group = groupOfSubscription(row);
    const paidSince = Number(row?.store_signed_at) > 0 ? new Date(Number(row.store_signed_at)).toISOString().slice(0, 10) : null;
    if (group === "paid" || group === "gift") return { plan: "paid", paidSince };
    if (group === "trial" && Number(row.offer_type) === 1) return { plan: "unpaid", since: new Date(Date.parse(row.valid_until) - FREE_WEEK_DAYS * 864e5).toISOString().slice(0, 10) };
    return { plan: "unpaid" };
  }).catch(error => { console.error("AI plan not read", error?.message || error); return { plan: "unpaid" }; }));
  return planOnce.get(env);
}

// The share of the limits this account gets (1 or AI_UNPAID_LIMIT_SHARE), once per request.
export async function aiLimitShare(env) {
  const share = unpaidLimitShare(env);
  if (share === 1) return 1;
  return await aiPaid(env) ? 1 : share;
}
