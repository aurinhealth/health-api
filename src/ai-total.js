// What AI costs all users together in a UTC day, kept in the central database
// (ai_usage sits in each user's own database). AI_TOTAL_DAILY_ALERT_USD: once
// the day passes it, the owner gets one e-mail and nothing stops.
// AI_TOTAL_DAILY_LIMIT_USD: a brake on the whole day; past it AI waits until the
// next UTC day for everyone but the owner. Only the test server sets it, and
// there it holds the owner too: it caps what testing costs (wrangler.jsonc env.staging).
//
// AI_GROUP_BRAKES: each group of accounts (aiGroup, ai-limit-share.js: paid,
// gift, trial, testflight, free, new, system) has a brake of its own for the
// day, so one group (accounts made in bulk, a bug in one feature) never stops
// the AI of another. A group's brake is a fixed {"usd": 5}, or grows with the
// accounts in it, {"perAccount": 0.5, "min": 10, "max": 20}: what a usual day costs is a
// small part of it (5 USD a month is about 0.17 a day), so only a spike or a bug
// reaches it. The accounts are counted once a day, when the group's day starts;
// a count that fails is not kept, so the next call counts again.
// The account's own limits (ai-usage.js) stay the real cap on what AI costs.
// The owner hears once a day of a group that passes AI_GROUP_ALERT_SHARE of its
// brake (half by default). Unset or not a number is off.
import { L } from "./lang.js";
import { emailConfigured, sendEmail } from "./email-sender.js";
import { isStaging, ownerUnlimited } from "./staging.js";
import { aiGroup, groupOfSubscription, newAccountSince, AI_GROUPS } from "./ai-limit-share.js";

const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);
const central = env => env?.RAW_DB || null;
const rounded = v => Math.round(Number(v || 0) * 1e5) / 1e5;

export const GROUP_NAMES = { paid: "platící", gift: "pilot, dárky a ty", trial: "týden zdarma", testflight: "TestFlight", free: "bez nákupu", new: "nové účty", system: "úlohy serveru" };

// The tables are made once per database and isolate, not on every model call.
const ready = new WeakSet();
export async function ensureAiSpendDays(db) {
  if (ready.has(db)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_spend_days (day TEXT PRIMARY KEY, cost_usd REAL NOT NULL DEFAULT 0, alerted INTEGER NOT NULL DEFAULT 0)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_spend_groups (day TEXT NOT NULL, grp TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0, brake_usd REAL, alerted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, grp))").run();
  ready.add(db);
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

// Accounts by group now: the subscriptions with Pro, and the accounts without a
// purchase older than NEW_ACCOUNT_DAYS ("free"; the new ones get a fixed brake,
// so they are not counted). Throws when a read fails.
async function accountsByGroup(db, now = Date.now(), owner = "") {
  // The owner is in "gift" whatever the subscription says (aiGroup), so counted there.
  const until = new Date(now).toISOString(), isOwner = id => `EXISTS (SELECT 1 FROM users o WHERE o.id = ${id} AND lower(trim(o.email)) = ?)`;
  const notOwner = id => owner ? ` AND NOT ${isOwner(id)}` : "", ownerBind = owner ? [owner] : [];
  const [subs, free, owners] = await Promise.all([
    db.prepare(`SELECT s.plan, s.valid_until, s.store_environment, s.free_trial, s.offer_type FROM subscriptions s WHERE s.plan = 'ai' AND s.valid_until > ?${notOwner("s.user_id")}`).bind(until, ...ownerBind).all().then(r => r.results || []),
    db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE u.disabled = 0 AND u.created_at <= ?${notOwner("u.id")} AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.plan = 'ai' AND s.valid_until > ?)`).bind(newAccountSince(now), ...ownerBind, until).first(),
    owner ? db.prepare("SELECT COUNT(*) AS n FROM users u WHERE u.disabled = 0 AND lower(trim(u.email)) = ?").bind(owner).first() : null
  ]);
  const counts = Object.fromEntries(AI_GROUPS.map(group => [group, 0]));
  for (const row of subs) counts[groupOfSubscription(row, now)]++;
  counts.free = Number(free?.n) || 0;
  counts.gift += Number(owners?.n) || 0;
  return counts;
}

// A brake that grows with the accounts grows with them: it needs them counted.
const growing = brake => Boolean(brake && typeof brake === "object" && n(brake.usd) == null && n(brake.perAccount) != null);

// A group's brake in USD for this many accounts, or null when it has none: a
// fixed usd, or perAccount each, at least min, at most max.
function brakeFor(brake, count = 0) {
  if (!brake || typeof brake !== "object") return null;
  if (n(brake.usd) != null) return Math.max(0, n(brake.usd));
  if (n(brake.perAccount) == null) return n(brake.min);
  const grown = Math.max(n(brake.min) || 0, rounded(n(brake.perAccount) * count));
  return n(brake.max) != null ? Math.min(n(brake.max), grown) : grown;
}

// A group's brake for today. counted: false when its accounts could not be
// counted; the brake is then the group's last stored one (or its least) and is
// not kept for the day, so the next call counts again.
export async function groupBrakeUsd(db, env, group, now = Date.now()) {
  const brake = groupBrakes(env)[group];
  if (!growing(brake)) return { usd: brakeFor(brake), counted: true };
  try {
    return { usd: brakeFor(brake, (await accountsByGroup(db, now, String(env?.OWNER_EMAIL || "").trim().toLowerCase()))[group] || 0), counted: true };
  } catch (error) {
    console.error("Accounts by group not read", error?.message || error);
    const last = await db.prepare("SELECT brake_usd FROM ai_spend_groups WHERE grp = ? AND day < ? AND brake_usd IS NOT NULL ORDER BY day DESC LIMIT 1").bind(group, utcDay(new Date(now))).first().catch(() => null);
    return { usd: last?.brake_usd != null ? Number(last.brake_usd) : brakeFor(brake, 0), counted: false };
  }
}

// The group's day: what it spent and its brake. The first call of a day counts
// the accounts and keeps the brake in the row, so later calls read one row.
async function groupDay(db, env, group, now) {
  const day = utcDay(now);
  const read = () => db.prepare("SELECT cost_usd, brake_usd FROM ai_spend_groups WHERE day = ? AND grp = ?").bind(day, group).first();
  let row = await read();
  if (!row || row.brake_usd == null) {
    const { usd: brake, counted } = await groupBrakeUsd(db, env, group, now.getTime());
    if (brake == null || !counted) return { spent: rounded(row?.cost_usd), brake };
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

// The owner's Nastavení → Správa → Útraty AI: what each group spent today
// against its brake, the day's total, yesterday and the month so far (UTC days,
// like the brakes). One read of the days, one of the groups, one of the
// subscriptions with Pro; a group's brake not set yet today is worked out the
// way groupDay would.
export async function aiSpendingReport(env, now = new Date()) {
  const db = central(env) || env?.DB;
  await ensureAiSpendDays(db);
  const today = utcDay(now), yesterday = utcDay(new Date(now.getTime() - 864e5)), monthStart = `${today.slice(0, 7)}-01`;
  const [days, groups, counts] = await Promise.all([
    db.prepare("SELECT day, cost_usd FROM ai_spend_days WHERE day >= ? AND day <= ?").bind(yesterday < monthStart ? yesterday : monthStart, today).all().then(r => r.results || []),
    db.prepare("SELECT grp, cost_usd, brake_usd FROM ai_spend_groups WHERE day = ?").bind(today).all().then(r => r.results || []),
    accountsByGroup(db, now.getTime(), String(env?.OWNER_EMAIL || "").trim().toLowerCase()).catch(error => { console.error("Accounts by group not read", error?.message || error); return {}; })
  ]);
  const spentOn = day => rounded(days.find(row => row.day === day)?.cost_usd);
  const brakes = groupBrakes(env), byGroup = Object.fromEntries(groups.map(row => [row.grp, row]));
  const next = new Date(`${today}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return {
    today: spentOn(today), yesterday: spentOn(yesterday),
    month: rounded(days.filter(row => row.day >= monthStart).reduce((sum, row) => sum + Number(row.cost_usd || 0), 0)),
    resetsAt: next.toISOString(),
    groups: AI_GROUPS.filter(group => brakes[group] || byGroup[group]).map(group => {
      const row = byGroup[group], brake = brakes[group];
      return { group, spent: rounded(row?.cost_usd), brake: row?.brake_usd != null ? Number(row.brake_usd) : brakeFor(brake, counts[group] || 0), accounts: growing(brake) ? counts[group] ?? null : null };
    })
  };
}
