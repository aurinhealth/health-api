// What AI costs all users together in a UTC day, kept in the central database
// (ai_usage sits in each user's own database). AI_TOTAL_DAILY_ALERT_USD: once
// the day passes it, the owner gets one e-mail and nothing stops.
// AI_TOTAL_DAILY_LIMIT_USD: the emergency brake; past it AI waits until the
// next UTC day for everyone but the owner. On the test server the brake holds
// the owner too: there it caps what testing costs (wrangler.jsonc env.staging).
// Either unset or not a number is off.
import { L } from "./lang.js";
import { emailConfigured, sendEmail } from "./email-sender.js";
import { isStaging } from "./staging.js";

const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);
const central = env => env?.RAW_DB || null;

export async function ensureAiSpendDays(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_spend_days (day TEXT PRIMARY KEY, cost_usd REAL NOT NULL DEFAULT 0, alerted INTEGER NOT NULL DEFAULT 0)").run();
}

export async function aiSpentTodayAll(db, now = new Date()) {
  await ensureAiSpendDays(db);
  const row = await db.prepare("SELECT cost_usd FROM ai_spend_days WHERE day = ?").bind(utcDay(now)).first();
  return Math.round(Number(row?.cost_usd || 0) * 1e5) / 1e5;
}

// Before a model call: refused once the day's total reached the brake.
export async function assertAiTotal(env, now = new Date()) {
  const limit = n(env?.AI_TOTAL_DAILY_LIMIT_USD), db = central(env);
  if (limit == null || limit < 0 || (env.USER_IS_OWNER === true && !isStaging(env)) || !db) return;
  const spent = await aiSpentTodayAll(db, now).catch(error => { console.error("AI total read failed", error?.message || error); return 0; });
  if (spent < limit) return;
  const error = new Error(L("AI je dnes přetížená. Zkus to prosím zítra.", "The AI is overloaded today. Please try again tomorrow."));
  error.ai = true; error.limit = true; error.status = 429;
  throw error;
}

// After a model call: adds its cost, and the first time the day passes the
// alert the owner hears of it. Best effort, like recordAiUsage.
export async function addAiSpend(env, cost, now = new Date()) {
  const db = central(env), usd = n(cost);
  if (!db || !(usd > 0)) return;
  try {
    await ensureAiSpendDays(db);
    const day = utcDay(now);
    await db.prepare("INSERT INTO ai_spend_days(day, cost_usd) VALUES(?, ?) ON CONFLICT(day) DO UPDATE SET cost_usd = cost_usd + excluded.cost_usd").bind(day, usd).run();
    const alert = n(env.AI_TOTAL_DAILY_ALERT_USD);
    if (alert == null || alert < 0) return;
    const claimed = await db.prepare("UPDATE ai_spend_days SET alerted = 1 WHERE day = ? AND alerted = 0 AND cost_usd >= ?").bind(day, alert).run();
    if (!(Number(claimed?.meta?.changes) > 0)) return;
    const to = String(env.OWNER_EMAIL || "").trim();
    if (!to || !emailConfigured(env)) { console.warn("AI spending passed the daily alert", day); return; }
    const spent = await aiSpentTodayAll(db, now), brake = n(env.AI_TOTAL_DAILY_LIMIT_USD);
    await sendEmail(env, { to, subject: `Aurin: AI dnes stojí přes ${alert} USD`, text: `Všichni uživatelé dohromady dnes (${day}, UTC) utratili za AI ${spent.toFixed(2)} USD, víc než upozornění ${alert} USD.\n\n`
      + (brake != null ? `Při ${brake} USD se AI do konce dne vypne všem kromě tebe.\n\n` : "")
      + "Kdo kolik utratil, uvidíš zítra v ranním přehledu." });
  } catch (error) {
    console.error("AI total not recorded", error?.message || error);
  }
}
