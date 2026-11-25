// What happened to trials and subscriptions yesterday, from the history of
// Apple's notifications (app-store.js recordStoreEvent), for the owner's
// morning e-mail (ops-report.js). Counts only: no account numbers, App Store
// purchases only (Sandbox and TestFlight left out), and the owner's and the
// App Review account's own purchases left out. A subscription shared through
// Family Sharing is counted apart, as nobody in Aurin pays for it.
const DAY = 86400000;
const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;

// rows: yesterday's events; earlier: the events before yesterday of the same
// subscriptions (type, free_trial, original_transaction_id), to tell a trial's
// first payment from a renewal.
export function storeCounts(rows, earlier = []) {
  const own = rows.filter(row => row.ownership !== "FAMILY_SHARED");
  const count = test => own.filter(test).length;
  const before = new Map();
  for (const row of earlier) {
    const seen = before.get(row.original_transaction_id) || { trial: false, renewed: false };
    if (Number(row.free_trial) === 1) seen.trial = true;
    if (row.type === "DID_RENEW") seen.renewed = true;
    before.set(row.original_transaction_id, seen);
  }
  const started = own.filter(row => row.type === "SUBSCRIBED");
  const renewals = own.filter(row => row.type === "DID_RENEW");
  const converted = renewals.filter(row => before.get(row.original_transaction_id)?.trial && !before.get(row.original_transaction_id)?.renewed).length;
  const off = own.filter(row => row.type === "DID_CHANGE_RENEWAL_STATUS" && row.subtype === "AUTO_RENEW_DISABLED");
  const offTrial = off.filter(row => Number(row.free_trial) === 1);
  return {
    trialsStarted: started.filter(row => Number(row.free_trial) === 1).length,
    paidStarted: started.filter(row => Number(row.free_trial) !== 1).length,
    converted,
    renewed: renewals.length - converted,
    trialsCancelled: offTrial.length,
    trialDaysLeft: offTrial.filter(row => Number(row.expires_at) > 0).map(row => Math.max(0, Math.round((Number(row.expires_at) - Number(row.signed_at)) / DAY))).sort((a, b) => a - b),
    paidCancelled: off.length - offTrial.length,
    renewOn: count(row => row.type === "DID_CHANGE_RENEWAL_STATUS" && row.subtype === "AUTO_RENEW_ENABLED"),
    toYearly: count(row => row.type === "DID_CHANGE_RENEWAL_PREF" && row.subtype === "UPGRADE"),
    toMonthly: count(row => row.type === "DID_CHANGE_RENEWAL_PREF" && row.subtype === "DOWNGRADE"),
    failed: count(row => row.type === "DID_FAIL_TO_RENEW"),
    expired: count(row => row.type === "EXPIRED" || row.type === "GRACE_PERIOD_EXPIRED"),
    refundRequests: count(row => row.type === "CONSUMPTION_REQUEST"),
    refunds: count(row => row.type === "REFUND"),
    refundsDeclined: count(row => row.type === "REFUND_DECLINED"),
    familyShared: rows.length - own.length
  };
}

export function storeReport(c) {
  if (!c) return null;
  const left = c.trialDaysLeft || [];
  const lines = [
    ["Začalo zkušební období", c.trialsStarted],
    ["Nové placené předplatné", c.paidStarted],
    ["Ze zkušebního období zaplaceno", c.converted],
    ["Obnoveno", c.renewed],
    ["Zkušební období zrušeno", c.trialsCancelled, left.length ? ` (zbývalo ${left.join(", ")} ${plural(left[left.length - 1], "den", "dny", "dní")})` : ""],
    ["Placené předplatné zrušeno", c.paidCancelled, " (do konce období platí dál)"],
    ["Obnovení zase zapnuto", c.renewOn],
    ["Přechod na roční", c.toYearly],
    ["Přechod na měsíční", c.toMonthly],
    ["Platba se nepovedla", c.failed],
    ["Skončilo", c.expired],
    ["Žádost o vrácení peněz", c.refundRequests],
    ["Peníze vráceny", c.refunds],
    ["Vrácení zamítnuto", c.refundsDeclined],
    ["Rodinné sdílení (nikdo neplatí)", c.familyShared]
  ].filter(([, n]) => n > 0).map(([name, n, note = ""]) => `- ${name}: ${n}${note}`);
  return lines.length ? `Předplatné včera\n${lines.join("\n")}` : null;
}

// Yesterday's App Store events (UTC day) and what came before them.
export async function storeData(env, date) {
  const db = env.DB;
  const from = Date.parse(date + "T00:00:00Z"), to = from + DAY;
  const left = [String(env.OWNER_EMAIL || "").trim().toLowerCase(), String(env.APP_REVIEW_EMAIL || "").trim().toLowerCase()].filter(Boolean);
  try {
    const skip = left.length ? ((await db.prepare(`SELECT id FROM users WHERE lower(email) IN (${left.map(() => "?").join(",")})`).bind(...left).all()).results || []).map(row => Number(row.id)) : [];
    const rows = ((await db.prepare("SELECT original_transaction_id, user_id, type, subtype, ownership, free_trial, expires_at, signed_at FROM store_events WHERE environment = 'Production' AND signed_at >= ? AND signed_at < ?").bind(from, to).all()).results || [])
      .filter(row => !skip.includes(Number(row.user_id)));
    const ids = [...new Set(rows.filter(row => row.type === "DID_RENEW" && row.original_transaction_id).map(row => row.original_transaction_id))];
    const earlier = ids.length ? (await db.prepare("SELECT original_transaction_id, type, free_trial FROM store_events WHERE original_transaction_id IN (SELECT value FROM json_each(?)) AND signed_at < ?").bind(JSON.stringify(ids), from).all()).results || [] : [];
    return { rows, earlier };
  } catch (error) {
    if (/no such table/i.test(String(error?.message))) return { rows: [], earlier: [] };
    throw error;
  }
}

// ---- The daily snapshot for the owner's charts ----
// One row per day (UTC), written with the morning e-mail: the state of the
// accounts and subscriptions then and what happened that day, so the charts
// read a year as 365 rows instead of counting the history again. Counts only,
// no account in it. Days before the first snapshot cannot be made up later.
const STATS = ["accounts", "new_week", "paid_monthly", "paid_yearly", "gift", "trials", "ai_users_week", "ai_usd",
  "trials_started", "paid_started", "converted", "trials_cancelled", "paid_cancelled", "failed", "expired", "refund_requests", "refunds"];

export async function saveDailyStats(db, date, stats, counts) {
  if (!stats && !counts) return false;
  const values = {
    accounts: stats?.accounts, new_week: stats?.newWeek, paid_monthly: stats?.paidMonthly, paid_yearly: stats?.paidYearly, gift: stats?.gift,
    trials: stats?.trial, ai_users_week: stats?.aiUsersWeek, ai_usd: stats ? Math.round((Number(stats.totalYesterdayUsd) || 0) * 100) / 100 : null,
    trials_started: counts?.trialsStarted, paid_started: counts?.paidStarted, converted: counts?.converted, trials_cancelled: counts?.trialsCancelled,
    paid_cancelled: counts?.paidCancelled, failed: counts?.failed, expired: counts?.expired, refund_requests: counts?.refundRequests, refunds: counts?.refunds
  };
  await db.prepare(`CREATE TABLE IF NOT EXISTS daily_stats (day TEXT PRIMARY KEY, ${STATS.map(name => `${name} ${name === "ai_usd" ? "REAL" : "INTEGER"}`).join(", ")})`).run();
  await db.prepare(`INSERT INTO daily_stats (day, ${STATS.join(", ")}) VALUES (?, ${STATS.map(() => "?").join(", ")}) ON CONFLICT(day) DO UPDATE SET ${STATS.map(name => `${name}=excluded.${name}`).join(", ")}`)
    .bind(date, ...STATS.map(name => values[name] ?? null)).run();
  return true;
}

// GET /app/api/admin/overview: the snapshots of the last 400 days, oldest first.
export async function dailyStats(db) {
  try { return (await db.prepare("SELECT * FROM daily_stats ORDER BY day DESC LIMIT 400").all()).results?.reverse() || []; }
  catch (error) { if (/no such table/i.test(String(error?.message))) return []; throw error; }
}
