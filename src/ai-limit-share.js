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

// The group an account's AI spending is counted in (ai-total.js), from its
// subscription now:
// - "paid": a paid Production Pro;
// - "gift": Pro through an offer code or a promotional offer (the pilot's
//   discount, a gift) and the owner: whole limits, counted apart;
// - "trial": the free week (Apple's introductory offer, or a free promotional one);
// - "testflight": a Sandbox purchase, or no purchase in a TestFlight build
//   (subscriptions.testflight, app-store.js saveAppInstall): the testers;
// - "free": no purchase, an account older than NEW_ACCOUNT_DAYS (everyone of
//   the pilot until the paywall is on);
// - "new": no purchase, an account made in the last NEW_ACCOUNT_DAYS (open
//   sign-up), counted apart, so accounts made in bulk never stop the pilot's AI;
// - "system": a call of no account (a job of the server).
export const AI_GROUPS = ["paid", "gift", "trial", "testflight", "free", "new", "system"];
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

async function subscriptionRow(env) {
  const read = () => env.DB.prepare("SELECT plan, valid_until, store_environment, free_trial, offer_type, testflight FROM subscriptions WHERE user_id = ?").bind(env.USER_ID).first();
  try { return await read(); } catch (error) {
    if (!/no such (column|table)|has no column/i.test(String(error?.message || error))) throw error;
    await ensureStoreColumns(env.DB);
    return read();
  }
}

// The request's group, once per request. A failed read counts as "new" (the
// fixed brake and half limits).
export function aiGroup(env) {
  if (!env?.DB || !(Number(env.USER_ID) > 0)) return Promise.resolve("system");
  if (env.USER_IS_OWNER === true) return Promise.resolve("gift");
  if (!groupOnce.has(env)) groupOnce.set(env, (async () => {
    const group = groupOfSubscription(await subscriptionRow(env));
    if (group !== "free") return group;
    const user = await (env.RAW_DB || env.DB).prepare("SELECT created_at FROM users WHERE id = ?").bind(env.USER_ID).first();
    return user?.created_at && String(user.created_at) <= newAccountSince() ? "free" : "new";
  })().catch(error => { console.error("AI group not read", error?.message || error); return "new"; }));
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
