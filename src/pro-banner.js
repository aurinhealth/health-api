// The Aurin Pro banner at the top of Today (redesign, KRIT-4, MON-6, HAB-6;
// Petr 2026-11-16: it stays at the top and comes back after a while). The
// server decides when it shows, so every device and a new install agree:
// - never with Pro, which includes the free week, nor without the paywall;
// - after the first and second close it comes back in 7 days, after the
//   third at most once in 30 days; the close is kept here;
// - offer "trial" ("Try Aurin Pro free for 7 days") only while no purchase or
//   free week was ever seen for the account, else "get" ("Get Aurin Pro").
//   The app shows "trial" only when StoreKit's trialEligible agrees too;
//   Apple gives the free week once per subscription group (App Review 3.1.2).
// Always an ✕ and never a countdown (the app's part).
export const BANNER_RETURN_DAYS = 7;
export const BANNER_RARE_AFTER_CLOSES = 3;
export const BANNER_RARE_DAYS = 30;
const DAY_MS = 864e5;
const sqlTime = text => Date.parse(String(text || "").replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(text || "")) ? "" : "Z"));

export async function ensureProBanner(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS pro_banner (user_id INTEGER PRIMARY KEY, closes INTEGER NOT NULL DEFAULT 0, closed_at TEXT)").run();
}

// { show, offer, closes, nextAt } from the plan and the closes. Pure.
export function proBannerState({ paywall = true, pro = false, purchased = false, closes = 0, closedAt = null, now = Date.now() } = {}) {
  const offer = purchased ? "get" : "trial";
  if (!paywall || pro) return { show: false, offer, closes: Number(closes) || 0, nextAt: null };
  const n = Number(closes) || 0, last = sqlTime(closedAt);
  if (!n || !Number.isFinite(last)) return { show: true, offer, closes: n, nextAt: null };
  const wait = (n >= BANNER_RARE_AFTER_CLOSES ? BANNER_RARE_DAYS : BANNER_RETURN_DAYS) * DAY_MS;
  const next = last + wait;
  return { show: now >= next, offer, closes: n, nextAt: now >= next ? null : new Date(next).toISOString() };
}

async function bannerRow(db) {
  try { return await db.prepare("SELECT closes, closed_at FROM pro_banner WHERE user_id = ?").bind(db.userId).first(); }
  catch (error) { if (/no such table/i.test(String(error?.message || error))) return null; throw error; }
}

// Whether the account ever had a purchase or a free week from the App Store
// (subscriptions, app-store.js): one row of the central table.
async function everPurchased(env) {
  try { return Boolean(await env.DB.prepare("SELECT 1 AS x FROM subscriptions WHERE user_id = ? AND store_signed_at IS NOT NULL").bind(env.USER_ID).first()); }
  catch (error) { if (/no such (table|column)/i.test(String(error?.message || error))) return false; throw error; }
}

// status: subscriptionStatus (subscription.js).
export async function proBanner(env, status, now = Date.now()) {
  const paywall = status?.mode === "paid", pro = status?.plan === "ai";
  if (!paywall || pro) return proBannerState({ paywall, pro });
  const [row, purchased] = await Promise.all([bannerRow(env.DB), everPurchased(env)]);
  return proBannerState({ paywall, pro, purchased, closes: row?.closes, closedAt: row?.closed_at, now });
}

export async function closeProBanner(db) {
  await ensureProBanner(db);
  await db.prepare("INSERT INTO pro_banner (user_id, closes, closed_at) VALUES (?, 1, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET closes = closes + 1, closed_at = CURRENT_TIMESTAMP").bind(db.userId).run();
}
