// Half of every AI limit until the account pays for Pro itself: the pilot (no
// purchase, everyone has Pro), TestFlight (its purchases are Sandbox ones) and
// the free week (Apple's introductory offer). A paid Production subscription
// gets the whole limits. AI_UNPAID_LIMIT_SHARE (wrangler.jsonc) is the share;
// unset, every account has the whole limits. The owner has none anyway.
import { ensureStoreColumns } from "./app-store.js";

const paidOnce = new WeakMap();
// The share an unpaid account gets; 1 when unset or not a number below 1.
export const unpaidLimitShare = env => {
  const share = Number(env?.AI_UNPAID_LIMIT_SHARE);
  return env?.AI_UNPAID_LIMIT_SHARE != null && env.AI_UNPAID_LIMIT_SHARE !== "" && Number.isFinite(share) && share >= 0 && share < 1 ? share : 1;
};

// Whether the account has a paid (not trial, not Sandbox) Pro subscription now.
export async function paidPro(env, now = Date.now()) {
  const read = () => env.DB.prepare("SELECT plan, valid_until, store_environment, free_trial FROM subscriptions WHERE user_id = ?").bind(env.USER_ID).first();
  let row;
  try { row = await read(); } catch (error) {
    if (!/no such (column|table)|has no column/i.test(String(error?.message || error))) throw error;
    await ensureStoreColumns(env.DB);
    row = await read();
  }
  return row?.plan === "ai" && Boolean(row.valid_until) && Date.parse(row.valid_until) > now && row.store_environment === "Production" && Number(row.free_trial) !== 1;
}

// Whether the request's account pays (paidPro), once per request. The owner and
// calls of no account (a job of the server) count as paid: the part of the day's
// AI total kept for paying accounts (ai-total.js) is not for scripted free ones.
// A failed read counts as unpaid.
export function aiPaid(env) {
  if (env?.USER_IS_OWNER === true || !env?.DB || !(Number(env.USER_ID) > 0)) return Promise.resolve(true);
  if (!paidOnce.has(env)) paidOnce.set(env, paidPro(env).catch(error => { console.error("Subscription read failed", error?.message || error); return false; }));
  return paidOnce.get(env);
}

// The share of the limits this account gets (1 or AI_UNPAID_LIMIT_SHARE), once per request.
export async function aiLimitShare(env) {
  const share = unpaidLimitShare(env);
  if (share === 1) return 1;
  return await aiPaid(env) ? 1 : share;
}
