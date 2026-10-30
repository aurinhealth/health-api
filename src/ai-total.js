// What AI costs all users together in a UTC day, kept in the central database
// (ai_usage sits in each user's own database). AI_TOTAL_DAILY_ALERT_USD: once
// the day passes it, the owner gets one e-mail and nothing stops.
// AI_TOTAL_DAILY_LIMIT_USD: a brake on the whole day; past it AI waits until the
// next UTC day for everyone but the owner. Only the test server sets it, and
// there it holds the owner too: it caps what testing costs (wrangler.jsonc env.staging).
//
// AI_GROUP_BRAKES: each group of accounts (aiGroup, ai-limit-share.js: paid,
// gift, trial, testflight, free, system) has a brake of its own for the day, so
// one group (free accounts made in bulk, a bug in one feature) never stops the
// AI of another. A group's brake is a fixed {"usd": 5}, or grows with the
// accounts in it, {"perAccount": 0.5, "min": 10, "max": 20}: what a usual day costs is a
// small part of it (5 USD a month is about 0.17 a day), so only a spike or a bug
// reaches it. The accounts are counted once a day, when the group's day starts.
// The account's own limits (ai-usage.js) stay the real cap on what AI costs.
// The owner hears once a day of a group that passes AI_GROUP_ALERT_SHARE of its
// brake (half by default). Unset or not a number is off.
import { L } from "./lang.js";
import { emailConfigured, sendEmail } from "./email-sender.js";
import { isStaging } from "./staging.js";
import { aiGroup, groupOfSubscription, AI_GROUPS } from "./ai-limit-share.js";

const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);
const central = env => env?.RAW_DB || null;
const rounded = v => Math.round(Number(v || 0) * 1e5) / 1e5;
const ownerUnlimited = env => env?.USER_IS_OWNER === true && isStaging(env);

export const GROUP_NAMES = { paid: "platící", gift: "pilot, dárky a ty", trial: "týden zdarma", testflight: "TestFlight", free: "bez nákupu", system: "úlohy serveru" };

export async function ensureAiSpendDays(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_spend_days (day TEXT PRIMARY KEY, cost_usd REAL NOT NULL DEFAULT 0, alerted INTEGER NOT NULL DEFAULT 0)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_spend_groups (day TEXT NOT NULL, grp TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0, brake_usd REAL, alerted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, grp))").run();
}

export async function aiSpentTodayAll(db, now = new Date()) {
  await ensureAiSpendDays(db);
  const row = await db.prepare("SELECT cost_usd FROM ai_spend_days WHERE day = ?").bind(utcDay(now)).first();
  return rounded(row?.cost_usd);
}

// { group: { usd } | { perAccount, min } } from AI_GROUP_BRAKES (an object or its JSON).
export function groupBrakes(env) {
  let value = env?.AI_GROUP_BRAKES;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return {}; } }
  return value && typeof value === "object" ? value : {};
}

// Accounts with Pro now, by group (one read of the subscriptions with Pro).
async function accountsByGroup(db, now = Date.now()) {
  const rows = (await db.prepare("SELECT plan, valid_until, store_environment, free_trial, offer_type FROM subscriptions WHERE plan = 'ai' AND valid_until > ?").bind(new Date(now).toISOString()).all()).results || [];
  const counts = Object.fromEntries(AI_GROUPS.map(group => [group, 0]));
  for (const row of rows) counts[groupOfSubscription(row, now)]++;
  return counts;
}

// A group's brake for today in USD, or null when it has none.
export async function groupBrakeUsd(db, env, group, now = Date.now()) {
  const brake = groupBrakes(env)[group];
  if (!brake || typeof brake !== "object") return null;
  if (n(brake.usd) != null) return Math.max(0, n(brake.usd));
  if (n(brake.perAccount) == null) return n(brake.min);
  const count = (await accountsByGroup(db, now).catch(error => { console.error("Accounts by group not read", error?.message || error); return {}; }))[group] || 0;
  const grown = Math.max(n(brake.min) || 0, rounded(n(brake.perAccount) * count));
  return n(brake.max) != null ? Math.min(n(brake.max), grown) : grown;
}

// The group's day: what it spent and its brake. The first call of a day counts
// the accounts and keeps the brake in the row, so later calls read one row.
async function groupDay(db, env, group, now) {
  const day = utcDay(now);
  const read = () => db.prepare("SELECT cost_usd, brake_usd FROM ai_spend_groups WHERE day = ? AND grp = ?").bind(day, group).first();
  let row = await read();
  if (!row || row.brake_usd == null) {
    const brake = await groupBrakeUsd(db, env, group, now.getTime());
    if (brake == null) return { spent: rounded(row?.cost_usd), brake: null };
    await db.prepare("INSERT INTO ai_spend_groups (day, grp, brake_usd) VALUES (?, ?, ?) ON CONFLICT(day, grp) DO UPDATE SET brake_usd = COALESCE(brake_usd, excluded.brake_usd)").bind(day, group, brake).run();
    row = await read();
  }
  return { spent: rounded(row?.cost_usd), brake: row?.brake_usd == null ? null : Number(row.brake_usd) };
}

function overloaded() {
  const error = new Error(L("AI je dnes přetížená. Zkus to prosím zítra.", "The AI is overloaded today. Please try again tomorrow."));
  error.ai = true; error.limit = true; error.status = 429;
  return error;
}

// Before a model call: refused once the day's total reached its brake (test
// server), or the account's group reached its own.
export async function assertAiTotal(env, now = new Date()) {
  const db = central(env);
  if (!db) return;
  const limit = n(env?.AI_TOTAL_DAILY_LIMIT_USD), failed = what => error => { console.error(what, error?.message || error); return null; };
  if (limit != null && limit >= 0 && !(env.USER_IS_OWNER === true && !isStaging(env))) {
    const spent = await aiSpentTodayAll(db, now).catch(failed("AI total read failed"));
    if (spent != null && spent >= limit) throw overloaded();
  }
  if (ownerUnlimited(env) || !Object.keys(groupBrakes(env)).length) return;
  await ensureAiSpendDays(db);
  const group = await groupDay(db, env, await aiGroup(env), now).catch(failed("AI group read failed"));
  if (group?.brake != null && group.spent >= group.brake) throw overloaded();
}

// After a model call: adds its cost to the day and to the account's group, and
// the first time the day passes the alert (or the group passes its share of the
// brake) the owner hears of it. Best effort, like recordAiUsage.
export async function addAiSpend(env, cost, now = new Date()) {
  const db = central(env), usd = n(cost);
  if (!db || !(usd > 0)) return;
  try {
    await ensureAiSpendDays(db);
    const day = utcDay(now), group = await aiGroup(env);
    await db.prepare("INSERT INTO ai_spend_days(day, cost_usd) VALUES(?, ?) ON CONFLICT(day) DO UPDATE SET cost_usd = cost_usd + excluded.cost_usd").bind(day, usd).run();
    const row = await db.prepare("INSERT INTO ai_spend_groups(day, grp, cost_usd) VALUES(?, ?, ?) ON CONFLICT(day, grp) DO UPDATE SET cost_usd = cost_usd + excluded.cost_usd RETURNING cost_usd, brake_usd, alerted").bind(day, group, usd).first();
    await alertGroup(env, db, day, group, row);
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

// Once a day per group: its spending passed AI_GROUP_ALERT_SHARE of its brake.
async function alertGroup(env, db, day, group, row) {
  const share = n(env.AI_GROUP_ALERT_SHARE) ?? 0.5, brake = row?.brake_usd == null ? null : Number(row.brake_usd);
  if (brake == null || Number(row.alerted) === 1 || Number(row.cost_usd) < brake * share) return;
  const claimed = await db.prepare("UPDATE ai_spend_groups SET alerted = 1 WHERE day = ? AND grp = ? AND alerted = 0").bind(day, group).run();
  if (!(Number(claimed?.meta?.changes) > 0)) return;
  const to = String(env.OWNER_EMAIL || "").trim(), name = GROUP_NAMES[group] || group;
  if (!to || !emailConfigured(env)) { console.warn("AI group passed its alert", day, group); return; }
  await sendEmail(env, { to, subject: `Aurin: skupina „${name}“ má dnes ${Math.round(share * 100)} % denní pojistky AI`, text: `Účty ve skupině „${name}“ dnes (${day}, UTC) utratily za AI ${Number(row.cost_usd).toFixed(2)} USD z denní pojistky ${brake.toFixed(2)} USD. Při ${brake.toFixed(2)} USD se AI této skupině do konce dne zastaví, ostatním skupinám ne.\n\n`
    + "Jestli to není běžné používání (hromadně založené účty, chyba v kódu), uvidíš podrobnosti zítra v ranním přehledu v části Účty a AI." });
}

// Yesterday's (or any day's) spending by group, for the morning report.
export async function aiSpendByGroup(db, day) {
  await ensureAiSpendDays(db);
  return (await db.prepare("SELECT grp, cost_usd, brake_usd FROM ai_spend_groups WHERE day = ?").bind(day).all()).results || [];
}
