// The AI limits outlive a deleted account. Deleting the account and signing up
// again (the same e-mail, a +alias or a Gmail address with dots, the same
// Apple ID or Google account) does not give the coach's weekly messages or the
// month's AI budget back: every message and dollar would be paid for again.
// On deletion only this is kept, under keyed hashes (HMAC with SESSION_SECRET)
// of the sign-in identifiers, never the identifiers themselves: how many coach
// messages this week, what the AI cost today (outside the coach chat) and this
// month. A new account whose e-mail, Apple ID or Google account gives the same
// hash takes these over. A record is forgotten once both its week and its month
// are over, at most about five weeks (privacy policy). Nothing is kept for an
// account that used no AI this week or month.
import { limitToday } from "./user-time.js";
import { mondayOfDate, shiftDate } from "./dashboard-shared.js";
import { ensureAiUsage, aiSpentToday, aiSpentThisMonth, CARRIED_MODEL, CARRIED_MONTH_FEATURE } from "./ai-usage.js";
import { coachAllowance, ensureCoachCarryover } from "./coach-allowance.js";

// The day's spending under the daily guard, as a new account takes it over.
const CARRIED_DAY_FEATURE = "carried-over";

// The address as a person, not as a mailbox: lowercase, without a +tag, and
// for Gmail without dots (a.b@gmail.com, ab+x@googlemail.com and ab@gmail.com
// are one mailbox).
export function limitEmail(value) {
  const address = String(value || "").trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  let local = address.slice(0, at).split("+")[0], domain = address.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local ? `${local}@${domain}` : null;
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("aurin ai limits\n" + value)));
  return [...signature].map(b => b.toString(16).padStart(2, "0")).join("");
}

// The hashes of a person's sign-in identifiers; none without SESSION_SECRET.
export async function limitKeys(env, { email = null, appleSub = null, googleSub = null } = {}) {
  const secret = String(env?.SESSION_SECRET || "");
  if (!secret) return [];
  const values = [];
  const address = limitEmail(email);
  if (address) values.push("email:" + address);
  if (appleSub) values.push("apple:" + appleSub);
  if (googleSub) values.push("google:" + googleSub);
  return Promise.all(values.map(value => hmac(secret, value)));
}

async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_limit_memory (
    key TEXT PRIMARY KEY, week TEXT, coach_used INTEGER NOT NULL DEFAULT 0, day TEXT, day_usd REAL NOT NULL DEFAULT 0,
    month TEXT, month_usd REAL NOT NULL DEFAULT 0, forget_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}

// The day after which neither the week nor the month counts any more.
export function forgetOn(today) {
  const [y, m] = today.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), nextWeek = shiftDate(mondayOfDate(today), 7);
  return nextMonth > nextWeek ? nextMonth : nextWeek;
}

// On deletion, before the account's rows go: env is the account's own (scoped)
// env. Best effort: a failure is logged and never stops the deletion.
export async function rememberAiLimits(env, user, { today } = {}) {
  try {
    today ??= await limitToday(env);
    const identity = await env.DB.prepare("SELECT subject FROM user_identities WHERE provider = 'apple' AND user_id = ?").bind(env.USER_ID).first().catch(() => null);
    const row = await env.DB.prepare("SELECT google_sub FROM users WHERE id = ?").bind(env.USER_ID).first().catch(() => null);
    const keys = await limitKeys(env, { email: user.email, appleSub: identity?.subject, googleSub: row?.google_sub });
    if (!keys.length) return 0;
    const [coach, dayUsd, monthUsd] = await Promise.all([coachAllowance(env, today).catch(() => null), aiSpentToday(env).catch(() => 0), aiSpentThisMonth(env).catch(() => 0)]);
    const used = Number(coach?.used) || 0;
    if (!used && !(monthUsd > 0)) return 0;
    const db = env.DB;
    await ensure(db);
    const week = mondayOfDate(today), month = today.slice(0, 7), until = forgetOn(today);
    // A later deletion of the same person replaces an older record; within the
    // same period the larger count stays.
    await db.batch(keys.map(key => db.prepare(`INSERT INTO ai_limit_memory (key, week, coach_used, day, day_usd, month, month_usd, forget_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        coach_used = CASE WHEN week = excluded.week THEN MAX(coach_used, excluded.coach_used) ELSE excluded.coach_used END,
        day_usd = CASE WHEN day = excluded.day THEN MAX(day_usd, excluded.day_usd) ELSE excluded.day_usd END,
        month_usd = CASE WHEN month = excluded.month THEN MAX(month_usd, excluded.month_usd) ELSE excluded.month_usd END,
        week = excluded.week, day = excluded.day, month = excluded.month, forget_on = excluded.forget_on, created_at = CURRENT_TIMESTAMP`)
      .bind(key, week, used, today, dayUsd, month, monthUsd, until)));
    return keys.length;
  } catch (error) {
    console.error("AI limits not remembered", error?.message || error);
    return 0;
  }
}

// A new account (central database, right after it was created): takes over
// what a deleted account of the same person used. The record stays until it
// expires, so a second new account (by the Google account of a deletion that
// an Apple sign-in already took over) starts from the same numbers.
// Returns { coachUsed, dayUsd, monthUsd } or null. Best effort, as above.
export async function inheritAiLimits(db, env, userId, identifiers, { today = new Date().toISOString().slice(0, 10) } = {}) {
  try {
    const keys = await limitKeys(env, identifiers);
    if (!keys.length || !(Number(userId) > 0)) return null;
    await ensure(db);
    const rows = (await db.prepare(`SELECT * FROM ai_limit_memory WHERE key IN (${keys.map(() => "?").join(",")}) AND forget_on > ?`).bind(...keys, today).all()).results || [];
    if (!rows.length) return null;
    // The latest period wins; two records of it (e-mail and Apple ID) are the same person, so the larger one.
    const latest = (period, value) => {
      const last = rows.map(r => r[period]).filter(Boolean).sort().at(-1);
      return [last, Math.max(0, ...rows.filter(r => r[period] === last).map(r => Number(r[value]) || 0))];
    };
    const [week, coachUsed] = latest("week", "coach_used"), [day, dayUsd] = latest("day", "day_usd"), [month, monthUsd] = latest("month", "month_usd");
    const statements = [];
    if (coachUsed > 0) {
      await ensureCoachCarryover(db);
      statements.push(db.prepare("INSERT INTO coach_carryover (user_id, week, used) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET week = excluded.week, used = excluded.used").bind(Number(userId), week, coachUsed));
    }
    if (monthUsd > 0) {
      await ensureAiUsage(db);
      const dayPart = day && day.slice(0, 7) === month ? Math.min(dayUsd, monthUsd) : 0;
      if (dayPart > 0) statements.push(db.prepare("INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) VALUES (?, ?, ?, ?, ?)").bind(Number(userId), day, CARRIED_DAY_FEATURE, CARRIED_MODEL, dayPart));
      if (monthUsd - dayPart > 0) statements.push(db.prepare("INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) VALUES (?, ?, ?, ?, ?)").bind(Number(userId), month + "-01", CARRIED_MONTH_FEATURE, CARRIED_MODEL, Math.round((monthUsd - dayPart) * 1e5) / 1e5));
    }
    if (statements.length) await db.batch(statements);
    return { coachUsed, dayUsd: monthUsd > 0 && day?.slice(0, 7) === month ? Math.min(dayUsd, monthUsd) : 0, monthUsd };
  } catch (error) {
    console.error("AI limits not taken over", error?.message || error);
    return null;
  }
}

// Daily: records whose week and month are over.
export async function forgetExpiredAiLimits(db, { today = new Date().toISOString().slice(0, 10) } = {}) {
  await ensure(db);
  return (await db.prepare("DELETE FROM ai_limit_memory WHERE forget_on <= ?").bind(today).run())?.meta?.changes || 0;
}
