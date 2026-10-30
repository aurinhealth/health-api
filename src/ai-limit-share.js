// Half of every AI limit until the account pays for Pro itself: the pilot (no
// purchase, everyone has Pro), TestFlight (its purchases are Sandbox ones) and
// the free week (Apple's introductory offer). A paid Production subscription
// (an offer code's too) gets the whole limits. AI_UNPAID_LIMIT_SHARE
// (wrangler.jsonc) is the share; unset, every account has the whole limits.
// The owner has the whole limits of a paying account.
import { ensureStoreColumns } from "./app-store.js";

const groupOnce = new WeakMap();
// The share an unpaid account gets; 1 when unset or not a number below 1.
export const unpaidLimitShare = env => {
  const share = Number(env?.AI_UNPAID_LIMIT_SHARE);
  return env?.AI_UNPAID_LIMIT_SHARE != null && env.AI_UNPAID_LIMIT_SHARE !== "" && Number.isFinite(share) && share >= 0 && share < 1 ? share : 1;
};

// Whether the account has a paid (not trial, not Sandbox) Pro subscription now,
// bought or through an offer code.
export async function paidPro(env, now = Date.now()) {
  return ["paid", "gift"].includes(groupOfSubscription(await subscriptionRow(env), now));
}

// The group an account's AI spending is counted in (ai-total.js), from its
// subscription now:
// - "paid": a paid Production Pro;
// - "gift": Pro through an offer code or a promotional offer (the pilot's
//   discount, a gift) and the owner: whole limits, counted apart;
// - "trial": the free week (Apple's introductory offer, or a free promotional one);
// - "testflight": a Sandbox purchase (TestFlight testers);
// - "free": no purchase (everyone until the paywall is on);
// - "system": a call of no account (a job of the server).
export const AI_GROUPS = ["paid", "gift", "trial", "testflight", "free", "system"];
const OFFER_CODE = 3, PROMOTIONAL = 2;
export function groupOfSubscription(row, now = Date.now()) {
  if (!(row?.plan === "ai" && row.valid_until && Date.parse(row.valid_until) > now)) return "free";
  if (row.store_environment !== "Production") return "testflight";
  if (Number(row.free_trial) === 1) return "trial";
  return [OFFER_CODE, PROMOTIONAL].includes(Number(row.offer_type)) ? "gift" : "paid";
}

async function subscriptionRow(env) {
  const read = () => env.DB.prepare("SELECT plan, valid_until, store_environment, free_trial, offer_type FROM subscriptions WHERE user_id = ?").bind(env.USER_ID).first();
  try { return await read(); } catch (error) {
    if (!/no such (column|table)|has no column/i.test(String(error?.message || error))) throw error;
    await ensureStoreColumns(env.DB);
    return read();
  }
}

// The request's group, once per request. A failed read counts as "free".
export function aiGroup(env) {
  if (!env?.DB || !(Number(env.USER_ID) > 0)) return Promise.resolve("system");
  if (env.USER_IS_OWNER === true) return Promise.resolve("gift");
  if (!groupOnce.has(env)) groupOnce.set(env, subscriptionRow(env).then(row => groupOfSubscription(row), error => { console.error("Subscription read failed", error?.message || error); return "free"; }));
  return groupOnce.get(env);
}

// Whether the account pays (or has Pro as a gift): the whole limits.
export const aiPaid = async env => ["paid", "gift", "system"].includes(await aiGroup(env));

// The share of the limits this account gets (1 or AI_UNPAID_LIMIT_SHARE), once per request.
export async function aiLimitShare(env) {
  const share = unpaidLimitShare(env);
  if (share === 1) return 1;
  return await aiPaid(env) ? 1 : share;
}
