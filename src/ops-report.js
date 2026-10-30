// What went wrong on the server, counted per day in the central database
// (ops_events), and a morning e-mail to the owner that summarises yesterday:
// failed syncs per service, connections that broke, server errors, and how
// full the account capacity is, what AI cost per user and feature, and account
// deletions that keep failing, and the accounts and AI against what Pro brings
// in, with proposals for the limits (accountsReport), every morning.
import { AsyncLocalStorage } from "node:async_hooks";
import { emailConfigured, sendEmail } from "./email-sender.js";
import { accountCapacity } from "./tenancy.js";
import { aiMonthlyLimitUsd, ensureAiUsage } from "./ai-usage.js";
import { ensureStoreColumns } from "./app-store.js";
import { unpaidLimitShare } from "./ai-limit-share.js";
import { MANY_QUERIES, MANY_ROWS, SLOW_REQUEST_MS, slowness, timed } from "./request-timing.js";

const scope = new AsyncLocalStorage();
const day = (date = new Date()) => date.toISOString().slice(0, 10);
const text = value => String(value?.message ?? value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

export async function ensureOpsEvents(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ops_events (day TEXT NOT NULL,kind TEXT NOT NULL,service TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,last_message TEXT,PRIMARY KEY(day,kind,service))").run();
}

// Never breaks what it watches: a failed write is only logged.
export async function recordOpsEvent(db, kind, service, message = "", count = 1) {
  if (!db || !count) return;
  try {
    await ensureOpsEvents(db);
    await db.prepare("INSERT INTO ops_events(day,kind,service,count,last_message) VALUES(?,?,?,?,?) ON CONFLICT(day,kind,service) DO UPDATE SET count=count+excluded.count,last_message=excluded.last_message")
      .bind(day(), kind, String(service || "-"), count, text(message)).run();
  } catch (error) { original.call(console, "Ops event write failed", error.message); }
}

// Sync code logs its failures with console.error and goes on. Inside
// withOpsScope those calls are also counted for the service the job syncs.
const original = console.error;
if (!console.error.__ops) {
  console.error = function (...args) {
    const store = scope.getStore();
    if (store) { store.errors++; store.last = args.map(text).filter(Boolean).join(" "); }
    return original.apply(this, args);
  };
  console.error.__ops = true;
}
// A job that read a million rows or more is listed as slow too.
export async function withOpsScope(db, service, fn) {
  const store = { errors: 0, last: "" };
  return timed(async work => {
    try { return await scope.run(store, fn); }
    catch (error) { store.errors++; store.last = text(error); throw error; }
    finally {
      const slow = slowness(work, { cron: true });
      if (store.errors) await recordOpsEvent(db, "sync", service, store.last, store.errors);
      if (slow) await recordOpsEvent(db, "slow", "cron " + service, slow);
    }
  });
}

// A path without ids, so one broken route is one row.
export const routeName = pathname => String(pathname || "/").replace(/\/[0-9a-f-]{8,}|\/\d[\w:.-]*/gi, "/:id").slice(0, 80);

const SERVICE_NAMES = {
  sync: "Google Health", "google-food": "Google Health (jídlo)", "intervals-exports": "Intervals (odeslání tréninků)", "sync-sends": "odeslání do aplikací",
  "coach-push": "push kouče", "morning-push": "ranní připravenost", ultrahuman: "Ultrahuman", "wahoo-exports": "Wahoo (odeslání tréninků)", wahoo: "Wahoo", whoop: "WHOOP",
  "intervals-recent": "Intervals", "intervals-wellness": "Intervals (wellness)", google: "Google Health", intervals: "Intervals"
};
const label = service => SERVICE_NAMES[service] || service;

const FEATURE_NAMES = {
  assistant: "chat s koučem", "screen-text": "věty kouče na obrazovkách", reflection: "poznámka po tréninku", "week-revision": "revize týdne",
  "week-plan": "plán týdne", "day-review": "revize dne", "workout-pick": "výběr tréninku dne", "workout-compose": "sestavení tréninku dne",
  "workout-describe": "popis vlastního tréninku", "session-change": "úprava tréninku slovy", "gym-adjust": "úprava posilovny slovy",
  "gym-equipment": "vybavení posilovny", technique: "technika cviku", "food-photo": "jídlo z fotky", "food-lookup": "dohledání potraviny",
  "food-sentence": "jídlo větou", barcode: "čárový kód"
};
const usd = value => `${(Number(value) || 0).toFixed(2)} $`;

// rows: one per user and feature for yesterday ({email, feature, calls, cost,
// input, cached}: input tokens and the part of them OpenAI had cached);
// month: one per user since the 1st ({email, cost}).
export function aiReport(rows, month, limit) {
  if (!rows.length) return null;
  const users = new Map();
  for (const row of rows) {
    const user = users.get(row.email) || { cost: 0, calls: 0, features: [] };
    user.cost += Number(row.cost) || 0; user.calls += Number(row.calls) || 0; user.features.push(row);
    users.set(row.email, user);
  }
  const total = [...users.values()].reduce((sum, u) => sum + u.cost, 0), calls = [...users.values()].reduce((sum, u) => sum + u.calls, 0);
  const sum = key => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0), input = sum("input");
  const cache = input > 0 ? ` · z cache ${Math.round(sum("cached") / input * 100)} % vstupu` : "";
  const lines = [...users.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([email, u]) => {
    const top = u.features.sort((a, b) => b.cost - a.cost).slice(0, 3).map(f => `${FEATURE_NAMES[f.feature] || f.feature || "jiné"} ${usd(f.cost)}`).join(", ");
    return `- ${email}: ${usd(u.cost)} (${u.calls} dotazů) · ${top}`;
  });
  const monthLines = month.sort((a, b) => b.cost - a.cost).map(m => `- ${m.email}: ${usd(m.cost)}${limit ? ` z ${usd(limit)} (${Math.round(m.cost / limit * 100)} %)` : ""}`);
  return `Útrata AI včera: ${usd(total)}, ${calls} dotazů${cache}\n${lines.join("\n")}\n\nOd začátku měsíce${limit ? ` (strop ${usd(limit)} na účet)` : ""}\n${monthLines.join("\n")}`;
}

// Account deletions the cron has failed at least this many times in a row
// (account-data.js finishAccountDeletions); [] before the migration that
// counts attempts.
export const STUCK_DELETION_ATTEMPTS = 3;
export async function stuckAccountDeletions(db, { minAttempts = STUCK_DELETION_ATTEMPTS, limit = 10 } = {}) {
  try {
    return (await db.prepare("SELECT user_id, requested_at, attempts, last_error FROM account_deletions WHERE attempts >= ? ORDER BY requested_at, user_id LIMIT ?").bind(minAttempts, limit).all()).results || [];
  } catch (error) {
    if (/no such (table|column)/i.test(String(error?.message || error))) return [];
    throw error;
  }
}

// What a paying account brings in a month after VAT (21 %) and Apple (15 %,
// Small Business Program): 199 Kč monthly, 1 490 Kč yearly
// (audit/aurin-pro-ai-limity-plan-2026-10-18.md).
export const NET_USD_PER_MONTH = { monthly: 5.9, yearly: 3.7 };
// Petr's cap of TestFlight testers; the report warns a little before it.
export const TESTER_CAP = 20;
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;

// stats: { accounts, newWeek, aiUsersWeek, paidMonthly, paidYearly, trial, sandbox,
// weekUsd, monthUsd, monthDay, monthDays, totalYesterdayUsd, nearCap: [{ email, cost, limit }] }
// (accountStats). Every morning: the numbers, what to watch and a proposal
// for each, so a limit is raised before people hit it. limits: the Worker
// settings ({ monthly, unpaidShare, totalAlert, totalLimit }).
export function accountsReport(stats, limits = {}) {
  if (!stats) return null;
  const { monthly = null, unpaidShare = 1, totalAlert = null, totalLimit = null } = limits;
  const paid = stats.paidMonthly + stats.paidYearly;
  const revenue = stats.paidMonthly * NET_USD_PER_MONTH.monthly + stats.paidYearly * NET_USD_PER_MONTH.yearly;
  const projected = stats.monthDay > 0 ? stats.monthUsd / stats.monthDay * stats.monthDays : 0;
  const perUser = stats.aiUsersWeek ? stats.weekUsd / stats.aiUsersWeek : 0;
  const lines = [`Účty a AI (bez tebe)
- Účtů: ${stats.accounts}, nových za 7 dní ${stats.newWeek}, AI za 7 dní použilo ${stats.aiUsersWeek}
- Platí: ${paid} (měsíčně ${stats.paidMonthly}, ročně ${stats.paidYearly}), ve zkušebním týdnu ${stats.trial}, nákupy z TestFlightu ${stats.sandbox}
- AI včera všichni dohromady ${usd(stats.totalYesterdayUsd)}${totalLimit != null ? ` z denní brzdy ${usd(totalLimit)}` : ""}
- AI za 7 dní ${usd(stats.weekUsd)} (${usd(perUser)} na uživatele s AI), za měsíc zatím ${usd(stats.monthUsd)}, do konce měsíce asi ${usd(projected)}
- Pro vydělá asi ${usd(revenue)} za měsíc${monthly != null ? ` · strop na účet ${usd(monthly)}, bez placení ${usd(monthly * unpaidShare)}` : ""}`];
  const proposals = [];
  for (const row of stats.nearCap) proposals.push(`${row.email} má za měsíc ${usd(row.cost)} z ${usd(row.limit)} (${pct(row.cost, row.limit)} %). Jestli je to běžné používání, zvedni AI_MONTHLY_LIMIT_USD z ${usd(monthly)} na ${usd((monthly || 0) + 2)}; jestli ne, nech to, brzda ho zastaví.`);
  if (stats.aiUsersWeek >= 3 && stats.nearCap.length / stats.aiUsersWeek >= 0.2) proposals.push(`U stropu je ${stats.nearCap.length} z ${stats.aiUsersWeek} lidí s AI. Strop je nejspíš moc nízko: zvedni AI_MONTHLY_LIMIT_USD o 2 USD.`);
  if (paid > 0 && projected > revenue) proposals.push(`AI tento měsíc vyjde asi na ${usd(projected)}, víc, než Pro vydělá (${usd(revenue)} za ${paid} platících). Sniž COACH_WEEKLY_MESSAGES z 30 na 25, nebo strop na účet.`);
  if (totalLimit != null && stats.totalYesterdayUsd >= totalLimit * 0.7) proposals.push(`Včera padlo ${pct(stats.totalYesterdayUsd, totalLimit)} % denní brzdy pro všechny. Než AI vypne všem, zvedni AI_TOTAL_DAILY_LIMIT_USD na ${usd(Math.ceil(totalLimit * 1.5))}${totalAlert != null ? ` a AI_TOTAL_DAILY_ALERT_USD na ${usd(Math.ceil(totalAlert * 1.5))}` : ""}.`);
  if (stats.accounts >= TESTER_CAP - 2) proposals.push(`Účtů je ${stats.accounts} z ${TESTER_CAP} testerů v TestFlightu. Rozhodni, jestli limit 20 zvedneš, nebo přestaneš schvalovat zájemce.`);
  lines.push(proposals.length ? `Návrhy\n${proposals.map(p => `- ${p}`).join("\n")}` : "Návrhy\n- Limity stačí, není potřeba nic měnit.");
  return lines.join("\n\n");
}

// The numbers for accountsReport from the central database (users,
// subscriptions, ai_usage), the owner left out. date: yesterday (UTC).
export async function accountStats(env, date, { now = Date.now() } = {}) {
  const db = env.DB, owner = String(env.OWNER_EMAIL || "").trim().toLowerCase();
  await ensureAiUsage(db);
  await ensureStoreColumns(db);
  const weekFrom = new Date(Date.parse(date + "T00:00:00Z") - 6 * 86400000).toISOString().slice(0, 10), monthFrom = date.slice(0, 8) + "01";
  const [y, m, d] = date.split("-").map(Number), monthDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const users = (await db.prepare("SELECT id, email, created_at FROM users WHERE lower(email) <> ?").bind(owner).all()).results || [];
  const ids = new Set(users.map(u => Number(u.id)));
  const subs = (await db.prepare("SELECT user_id, plan, valid_until, product_id, store_environment, free_trial FROM subscriptions WHERE plan = 'ai'").all()).results || [];
  const total = await db.prepare("SELECT cost_usd FROM ai_spend_days WHERE day = ?").bind(date).first().catch(() => null);
  const stats = { totalYesterdayUsd: Number(total?.cost_usd) || 0, accounts: users.length, newWeek: users.filter(u => String(u.created_at || "").slice(0, 10) >= weekFrom).length, aiUsersWeek: 0, paidMonthly: 0, paidYearly: 0, trial: 0, sandbox: 0, weekUsd: 0, monthUsd: 0, monthDay: d, monthDays, nearCap: [] };
  const paid = new Set();
  for (const sub of subs) {
    if (!ids.has(Number(sub.user_id)) || !(Date.parse(sub.valid_until) > now)) continue;
    if (sub.store_environment !== "Production") stats.sandbox++;
    else if (Number(sub.free_trial) === 1) stats.trial++;
    else { paid.add(Number(sub.user_id)); if (String(sub.product_id || "").endsWith(".yearly")) stats.paidYearly++; else stats.paidMonthly++; }
  }
  const spend = (await db.prepare("SELECT user_id, SUM(cost_usd) AS week FROM ai_usage WHERE day >= ? AND day <= ? AND model NOT IN ('pending', 'carried-over') GROUP BY user_id").bind(weekFrom, date).all()).results || [];
  // counted: what the account's limit sees (with what a deleted account of the same person carried over).
  const monthRows = (await db.prepare("SELECT a.user_id, u.email, SUM(CASE WHEN a.model = 'carried-over' THEN 0 ELSE a.cost_usd END) AS cost, SUM(a.cost_usd) AS counted FROM ai_usage a JOIN users u ON u.id = a.user_id WHERE a.day >= ? AND a.day <= ? AND a.model != 'pending' GROUP BY a.user_id").bind(monthFrom, date).all()).results || [];
  for (const row of spend) {
    if (!ids.has(Number(row.user_id))) continue;
    if (Number(row.week) > 0) { stats.aiUsersWeek++; stats.weekUsd += Number(row.week); }
  }
  const full = aiMonthlyLimitUsd(env), share = unpaidLimitShare(env);
  for (const row of monthRows) {
    if (!ids.has(Number(row.user_id))) continue;
    const counted = Number(row.counted) || 0;
    stats.monthUsd += Number(row.cost) || 0;
    const limit = full == null ? null : paid.has(Number(row.user_id)) ? full : full * share;
    if (limit && counted >= limit * 0.8) stats.nearCap.push({ email: row.email, cost: counted, limit });
  }
  return stats;
}

export function opsReport(rows, capacity, date, ai = null, stuckDeletions = [], accounts = null) {
  const of = kind => rows.filter(row => row.kind === kind).sort((a, b) => b.count - a.count);
  const sections = [];
  const list = items => items.map(row => `- ${label(row.service)}: ${row.count}×${row.last_message ? ` (naposledy: ${row.last_message})` : ""}`).join("\n");
  if (of("sync").length) sections.push(`Selhané synchronizace\n${list(of("sync"))}`);
  if (of("broken").length) sections.push(`Rozbitá propojení (uživatel musí znovu připojit)\n${list(of("broken"))}`);
  if (of("server").length) sections.push(`Chyby serveru\n${list(of("server"))}`);
  if (of("slow").length) sections.push(`Pomalé požadavky a úlohy (${SLOW_REQUEST_MS / 1000} s a víc, ${MANY_QUERIES} dotazů nebo ${MANY_ROWS / 1e6} M přečtených řádků do D1)\n${list(of("slow"))}`);
  if (capacity?.places && capacity.used / capacity.places >= 0.8) sections.push(`Místo pro účty\n- Obsazeno ${capacity.used} z ${capacity.places} (${Math.round(capacity.used / capacity.places * 100)} %). Nové registrace se po zaplnění řadí do čekací listiny.`);
  if (stuckDeletions?.length) sections.push(`Nedokončená smazání účtů (cron je opakuje, data zatím zůstávají)\n${stuckDeletions.map(row => `- účet #${row.user_id} smazaný ${String(row.requested_at || "").slice(0, 10)}: ${row.attempts}× selhalo${row.last_error ? ` (naposledy: ${row.last_error})` : ""}`).join("\n")}`);
  if (accounts) sections.push(accounts);
  if (ai) sections.push(ai);
  if (!sections.length) return null;
  return {
    subject: `Aurin: přehled za ${date}`,
    text: `Přehled za ${date} (UTC).\n\n${sections.join("\n\n")}\n\nPodrobnosti jsou v Cloudflare → Workers → health-api → Logs.\n`
  };
}

// Sent from the minute cron at 6:00 UTC, tried every ten minutes until 7:00
// in case a minute is missed; ops_events keeps a 'report' row once it is done.
export async function sendDailyOpsReport(env, now = new Date()) {
  if (!env?.DB) return { sent: false };
  await ensureOpsEvents(env.DB);
  const today = day(now), yesterday = day(new Date(now.getTime() - 86400000));
  if (await env.DB.prepare("SELECT 1 FROM ops_events WHERE day=? AND kind='report'").bind(today).first()) return { sent: false, already: true };
  const rows = (await env.DB.prepare("SELECT kind,service,count,last_message FROM ops_events WHERE day=? AND kind!='report'").bind(yesterday).all()).results || [];
  const capacity = await accountCapacity(env.DB, env).catch(() => null);
  const ai = await aiSection(env, yesterday).catch(error => { console.warn("AI usage report failed", error?.message || error); return null; });
  const stuck = await stuckAccountDeletions(env.DB).catch(error => { console.warn("Stuck account deletions read failed", error?.message || error); return []; });
  const setting = value => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  const accounts = await accountStats(env, yesterday).then(stats => accountsReport(stats, { monthly: aiMonthlyLimitUsd(env), unpaidShare: unpaidLimitShare(env), totalAlert: setting(env.AI_TOTAL_DAILY_ALERT_USD), totalLimit: setting(env.AI_TOTAL_DAILY_LIMIT_USD) }))
    .catch(error => { console.warn("Accounts report failed", error?.message || error); return null; });
  const report = opsReport(rows, capacity, yesterday, ai, stuck, accounts);
  const to = String(env.OWNER_EMAIL || "").trim();
  if (report && to && emailConfigured(env)) await sendEmail(env, { to, subject: report.subject, text: report.text });
  await env.DB.prepare("INSERT INTO ops_events(day,kind,service,count) VALUES(?,'report','-',1) ON CONFLICT(day,kind,service) DO NOTHING").bind(today).run();
  await env.DB.prepare("DELETE FROM ops_events WHERE day<?").bind(day(new Date(now.getTime() - 30 * 86400000))).run();
  return { sent: Boolean(report && to && emailConfigured(env)), report };
}

async function aiSection(env, date) {
  const exists = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_usage'").first();
  if (!exists) return null;
  await ensureAiUsage(env.DB);
  const rows = (await env.DB.prepare(`SELECT COALESCE(u.email, '#' || a.user_id) AS email, a.feature, COUNT(*) AS calls, SUM(a.cost_usd) AS cost, SUM(a.input_tokens) AS input, SUM(a.cached_tokens) AS cached
    FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id WHERE a.day = ? AND a.model NOT IN ('pending', 'carried-over') GROUP BY a.user_id, a.feature`).bind(date).all()).results || [];
  const month = (await env.DB.prepare(`SELECT COALESCE(u.email, '#' || a.user_id) AS email, SUM(a.cost_usd) AS cost
    FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id WHERE a.day >= ? AND a.day <= ? AND a.model NOT IN ('pending', 'carried-over') GROUP BY a.user_id`).bind(date.slice(0, 8) + "01", date).all()).results || [];
  return aiReport(rows, month, aiMonthlyLimitUsd(env));
}
