// What went wrong on the server, counted per day in the central database
// (ops_events), and a morning e-mail to the owner that summarises yesterday:
// failed syncs per service, connections that broke, server errors, and how
// full the account capacity is, what AI cost per user and feature, and account
// deletions that keep failing, and the accounts and AI against what Pro brings
// in, with proposals for the limits (accountsReport), every morning.
import { AsyncLocalStorage } from "node:async_hooks";
import { featureName } from "./ai-features.js";
import { emailConfigured, sendEmail } from "./email-sender.js";
import { accountCapacity, openReserveShards, reserveCapacity, RESERVE_OPEN_BELOW, RESERVE_SHARD_USERS } from "./tenancy.js";
import { aiMonthlyLimitUsd, ensureAiUsage } from "./ai-usage.js";
import { ensureStoreColumns } from "./app-store.js";
import { unpaidLimitShare, groupOfSubscription, newAccountSince } from "./ai-limit-share.js";
import { GROUP_NAMES, aiSpendByGroup } from "./ai-total.js";
import { MANY_QUERIES, MANY_ROWS, SLOW_REQUEST_MS, slowness, timed } from "./request-timing.js";
import { opsReportHtml, money } from "./ops-report-html.js";
export { money };

const scope = new AsyncLocalStorage();
const day = (date = new Date()) => date.toISOString().slice(0, 10);
const text = value => String(value?.message ?? value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

export async function ensureOpsEvents(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ops_events (day TEXT NOT NULL,kind TEXT NOT NULL,service TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,last_message TEXT,PRIMARY KEY(day,kind,service))").run();
}

// A slow request keeps the day's slowest message and a slow cron job the one
// that read the most rows (what flags each, request-timing.js slowness), so the
// report's "až" is the worst of the day, not the last.
const slowRank = (message, cron) => Number(String(message || "").match(cron ? /(\d+) řádků/ : /^(\d+) ms/)?.[1]) || 0;
// Never breaks what it watches: a failed write is only logged.
export async function recordOpsEvent(db, kind, service, message = "", count = 1) {
  if (!db || !count) return;
  try {
    await ensureOpsEvents(db);
    const name = String(service || "-"), cron = name.startsWith("cron ");
    let kept = text(message);
    if (kind === "slow") {
      const before = await db.prepare("SELECT last_message FROM ops_events WHERE day=? AND kind='slow' AND service=?").bind(day(), name).first();
      if (before && slowRank(before.last_message, cron) > slowRank(kept, cron)) kept = null;
    }
    await db.prepare("INSERT INTO ops_events(day,kind,service,count,last_message) VALUES(?,?,?,?,?) ON CONFLICT(day,kind,service) DO UPDATE SET count=count+excluded.count,last_message=COALESCE(excluded.last_message,ops_events.last_message)")
      .bind(day(), kind, name, count, kept).run();
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

const usd = value => `${(Number(value) || 0).toFixed(2)} $`;

// rows: one per user and feature for yesterday ({who, feature, calls, cost,
// input, cached}: input tokens and the part of them OpenAI had cached);
// month: one per user since the 1st ({who, cost, owner}). who is "Ty" for
// the owner and "Účet #id · group" for everyone else: the report is an
// e-mail, and an account number is all it needs (no e-mail addresses).
// calls: each call of the day ({group, feature, cost}): the average and p95
// price of a call by group and feature, the five that cost the most in all.
export function callPrices(calls = []) {
  const by = new Map();
  for (const c of calls) {
    const key = c.group + " · " + (c.feature ? featureName(c.feature) : "jiné");
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(Number(c.cost) || 0);
  }
  return [...by.entries()].map(([name, costs]) => {
    const sorted = costs.sort((a, b) => a - b), total = sorted.reduce((a, b) => a + b, 0);
    return { name, calls: sorted.length, total, average: total / sorted.length, p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
  }).sort((a, b) => b.total - a.total).slice(0, 5);
}

export function aiSummary(rows, month, limit, calls = []) {
  if (!rows.length) return null;
  const users = new Map();
  for (const row of rows) {
    const who = row.who ?? row.email;
    const user = users.get(who) || { who, cost: 0, calls: 0, features: [] };
    user.cost += Number(row.cost) || 0; user.calls += Number(row.calls) || 0; user.features.push(row);
    users.set(who, user);
  }
  const list = [...users.values()].sort((a, b) => b.cost - a.cost);
  for (const u of list) u.features = u.features.sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0) || (Number(b.calls) || 0) - (Number(a.calls) || 0)).slice(0, 3)
    .map(f => ({ name: f.feature ? featureName(f.feature) : "jiné", calls: Number(f.calls) || 0 }));
  const sum = key => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0), input = sum("input");
  const months = month.map(m => ({ who: m.who ?? m.email, cost: Number(m.cost) || 0, owner: Boolean(m.owner), share: limit ? Math.round((Number(m.cost) || 0) / limit * 100) : null }));
  // By name only the owner and accounts past half the cap; the rest as one sum.
  const named = months.filter(m => m.owner || (m.share != null && m.share >= 50)).sort((a, b) => b.cost - a.cost);
  const others = months.filter(m => !named.includes(m));
  return {
    total: list.reduce((acc, u) => acc + u.cost, 0), calls: list.reduce((acc, u) => acc + u.calls, 0),
    cachedShare: input > 0 ? Math.round(sum("cached") / input * 100) : null,
    users: list, limit: limit || null, named, others: { count: others.length, cost: others.reduce((acc, m) => acc + m.cost, 0) },
    prices: callPrices(calls)
  };
}

const accountsWord = n => n === 1 ? "účet" : n >= 2 && n <= 4 ? "účty" : "účtů";
export const aiReport = (rows, month, limit) => aiText(aiSummary(rows, month, limit));
export function aiText(ai) {
  if (!ai) return null;
  const cache = ai.cachedShare != null ? ` · z cache ${ai.cachedShare} % vstupu` : "";
  const lines = ai.users.map(u => `- ${u.who}: ${money(u.cost)} · ${u.features.map(f => `${f.name} ${f.calls}×`).join(", ")}`);
  const named = ai.named.map(m => `${m.who} ${money(m.cost)}${m.share != null ? ` (${m.share} %)` : ""}`);
  const others = ai.others.count ? `${ai.named.length ? "ostatní " : ""}${ai.others.count} ${accountsWord(ai.others.count)} dohromady ${money(ai.others.cost)}` : "";
  const monthLine = [...named, others].filter(Boolean).join(" · ");
  const prices = (ai.prices || []).map(p => `- ${p.name}: průměr ${money(p.average)}, p95 ${money(p.p95)} (${p.calls}×)`);
  return `Útrata AI včera: ${money(ai.total)}, ${ai.calls} dotazů${cache}\n${lines.join("\n")}\n\nZa měsíc${ai.limit ? ` (strop ${usd(ai.limit)} na účet)` : ""}: ${monthLine}`
    + (prices.length ? `\n\nCena jednoho dotazu podle skupiny\n${prices.join("\n")}` : "");
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

// stats: { accounts, newWeek, aiUsersWeek, paidMonthly, paidYearly, gift, trial, sandbox,
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
- Platí: ${paid} (měsíčně ${stats.paidMonthly}, ročně ${stats.paidYearly}), pilot a dárky ${stats.gift || 0}, ve zkušebním týdnu ${stats.trial}, nákupy z TestFlightu ${stats.sandbox}
- AI včera všichni dohromady ${usd(stats.totalYesterdayUsd)}${totalLimit != null ? ` z denní brzdy ${usd(totalLimit)}` : ""}${stats.groups?.length ? `\n- AI včera podle skupin: ${stats.groups.map(g => `${GROUP_NAMES[g.grp] || g.grp} ${usd(Number(g.cost_usd) || 0)}${g.brake_usd != null ? ` z ${usd(Number(g.brake_usd))}` : ""}`).join(", ")}` : ""}
- AI za 7 dní ${usd(stats.weekUsd)} (${usd(perUser)} na uživatele s AI), za měsíc zatím ${usd(stats.monthUsd)}, do konce měsíce asi ${usd(projected)}
- Pro vydělá asi ${usd(revenue)} za měsíc${monthly != null ? ` · strop na účet ${usd(monthly)}, bez placení ${usd(monthly * unpaidShare)}` : ""}`];
  const proposals = [];
  for (const row of stats.nearCap) proposals.push(`${row.email} má za měsíc ${usd(row.cost)} z ${usd(row.limit)} (${pct(row.cost, row.limit)} %). Jestli je to běžné používání, zvedni AI_MONTHLY_LIMIT_USD z ${usd(monthly)} na ${usd((monthly || 0) + 2)}; jestli ne, nech to, brzda ho zastaví.`);
  if (stats.aiUsersWeek >= 3 && stats.nearCap.length / stats.aiUsersWeek >= 0.2) proposals.push(`U stropu je ${stats.nearCap.length} z ${stats.aiUsersWeek} lidí s AI. Strop je nejspíš moc nízko: zvedni AI_MONTHLY_LIMIT_USD o 2 USD.`);
  if (paid > 0 && projected > revenue) proposals.push(`AI tento měsíc vyjde asi na ${usd(projected)}, víc, než Pro vydělá (${usd(revenue)} za ${paid} platících). Sniž COACH_WEEKLY_MESSAGES z 30 na 25, nebo strop na účet.`);
  if (totalLimit != null && stats.totalYesterdayUsd >= totalLimit * 0.7) proposals.push(`Včera padlo ${pct(stats.totalYesterdayUsd, totalLimit)} % denní brzdy pro všechny. Než AI vypne všem, zvedni AI_TOTAL_DAILY_LIMIT_USD na ${usd(Math.ceil(totalLimit * 1.5))}${totalAlert != null ? ` a AI_TOTAL_DAILY_ALERT_USD na ${usd(Math.ceil(totalAlert * 1.5))}` : ""}.`);
  for (const g of stats.groups || []) if (g.brake_usd != null && Number(g.cost_usd) >= Number(g.brake_usd) * 0.7) proposals.push(`Skupina „${GROUP_NAMES[g.grp] || g.grp}“ včera vyčerpala ${pct(Number(g.cost_usd), Number(g.brake_usd))} % své denní pojistky. Jestli jde o běžné používání, zvedni její hodnotu v AI_GROUP_BRAKES; jestli ne (hromadné účty, chyba), nech ji, pojistka ji zastaví.`);
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
  const subs = (await db.prepare("SELECT user_id, plan, valid_until, product_id, store_environment, free_trial, offer_type, testflight FROM subscriptions WHERE plan = 'ai' OR testflight = 1").all()).results || [];
  const total = await db.prepare("SELECT cost_usd FROM ai_spend_days WHERE day = ?").bind(date).first().catch(() => null);
  const groups = await aiSpendByGroup(db, date).catch(() => []);
  const stats = { groups, totalYesterdayUsd: Number(total?.cost_usd) || 0, accounts: users.length, newWeek: users.filter(u => String(u.created_at || "").slice(0, 10) >= weekFrom).length, aiUsersWeek: 0, paidMonthly: 0, paidYearly: 0, gift: 0, trial: 0, sandbox: 0, weekUsd: 0, monthUsd: 0, monthDay: d, monthDays, nearCap: [] };
  // whole: the accounts with a paying account's limits (paid, and gifts and offer codes, which bring in nothing).
  const whole = new Set();
  for (const sub of subs) {
    if (!ids.has(Number(sub.user_id))) continue;
    const group = groupOfSubscription(sub, now);
    if (group === "testflight") stats.sandbox++;
    else if (group === "trial") stats.trial++;
    else if (group === "gift") { stats.gift++; whole.add(Number(sub.user_id)); }
    else if (group === "paid") { whole.add(Number(sub.user_id)); if (String(sub.product_id || "").endsWith(".yearly")) stats.paidYearly++; else stats.paidMonthly++; }
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
    const limit = full == null ? null : whole.has(Number(row.user_id)) ? full : full * share;
    if (limit && counted >= limit * 0.8) stats.nearCap.push({ email: row.email, cost: counted, limit });
  }
  return stats;
}

// Where yesterday's barcode scans were found (routes-food.js food search) and
// what went to Open Food Facts (open-food-facts.js), as one line each.
const SCAN_PLACES = [["saved", "uložené u nás"], ["world", "světový katalog"], ["off-live", "živě z Open Food Facts"], ["missing", "nenalezeno"]];
const SHARE_RESULTS = [["sent", "přidáno"], ["exists", "už tam hodnoty měly"], ["failed", "selhalo"]];
export function barcodeReport(rows) {
  const count = (kind, service) => rows.filter(row => row.kind === kind && row.service === service).reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const scans = SCAN_PLACES.reduce((sum, [service]) => sum + count("barcode", service), 0);
  const shared = SHARE_RESULTS.map(([service, name]) => [name, count("off-share", service)]).filter(([, n]) => n);
  if (!scans && !shared.length) return null;
  const lines = [];
  if (scans) {
    const places = SCAN_PLACES.map(([service, name]) => [service, name, count("barcode", service)]).filter(([, , n]) => n);
    lines.push(`- ${scans} ${scans === 1 ? "sken" : scans <= 4 ? "skeny" : "skenů"}: ${places.map(([service, name, n]) => `${name} ${n}${service === "missing" ? ` (${Math.round(n / scans * 100)} %)` : ""}`).join(", ")}`);
  }
  if (shared.length) lines.push(`- Schválené potraviny do Open Food Facts: ${shared.map(([name, n]) => `${name} ${n}`).join(", ")}`);
  return `Čárové kódy včera\n${lines.join("\n")}`;
}

// ai: aiSummary (or its text); accounts: accountsReport's text.
export function opsReport(rows, capacity, date, ai = null, stuckDeletions = [], accounts = null) {
  const of = kind => rows.filter(row => row.kind === kind).sort((a, b) => b.count - a.count);
  const sections = [];
  const list = items => items.map(row => `- ${label(row.service)}: ${row.count}×${row.last_message ? ` (${row.kind === "slow" ? "nejdéle" : "naposledy"}: ${row.last_message})` : ""}`).join("\n");
  if (of("sync").length) sections.push(`Selhané synchronizace\n${list(of("sync"))}`);
  if (of("broken").length) sections.push(`Rozbitá propojení (uživatel musí znovu připojit)\n${list(of("broken"))}`);
  if (of("server").length) sections.push(`Chyby serveru\n${list(of("server"))}`);
  if (of("slow").length) sections.push(`Pomalé požadavky a úlohy (${SLOW_REQUEST_MS / 1000} s a víc, ${MANY_QUERIES} dotazů nebo ${MANY_ROWS / 1e6} M přečtených řádků do D1)\n${list(of("slow"))}`);
  // capacity.reserve: the databases kept in reserve (tenancy.js openReserveShards opens them).
  const reserve = capacity?.reserve || null, spare = reserve?.places ? ` V záloze ${reserve.databases} ${reserve.databases === 1 ? "databáze" : reserve.databases < 5 ? "databáze" : "databází"} (${reserve.places} míst), otevřou se samy, až zbude méně než ${RESERVE_OPEN_BELOW} volných.` : "";
  const low = Boolean(reserve && capacity?.places && capacity.free + reserve.places < 2 * RESERVE_OPEN_BELOW);
  const room = capacity?.places && (capacity.used / capacity.places >= 0.8 || low)
    ? `- Obsazeno ${capacity.used} z ${capacity.places} (${Math.round(capacity.used / capacity.places * 100)} %). Nové registrace se po zaplnění řadí do čekací listiny.${spare}${low ? `\n- Záloha databází dochází (volných ${capacity.free}, v záloze ${reserve.places}): ve wrangler.jsonc zvyšte USER_DATA_SHARD_COUNT o 10 (každá databáze ${RESERVE_SHARD_USERS} míst) a vydejte, nasazení nové databáze založí samo.` : ""}` : null;
  if (room) sections.push(`Místo pro účty\n${room}`);
  const stuck = stuckDeletions?.length ? stuckDeletions.map(row => `- účet #${row.user_id} smazaný ${String(row.requested_at || "").slice(0, 10)}: ${row.attempts}× selhalo${row.last_error ? ` (naposledy: ${row.last_error})` : ""}`).join("\n") : null;
  if (stuck) sections.push(`Nedokončená smazání účtů (cron je opakuje, data zatím zůstávají)\n${stuck}`);
  if (accounts) sections.push(accounts);
  const scans = barcodeReport(rows);
  if (scans) sections.push(scans);
  const aiLines = typeof ai === "string" ? ai : aiText(ai);
  if (aiLines) sections.push(aiLines);
  if (!sections.length) return null;
  return {
    subject: `Aurin: přehled za ${date}`,
    text: `Přehled za ${date} (UTC).\n\n${sections.join("\n\n")}\n\nPodrobnosti jsou v Cloudflare → Workers → health-api → Logs.\n`,
    html: opsReportHtml({ date, rows, room, stuck, accounts, scans, ai: typeof ai === "string" ? null : ai, aiLines, label })
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
  // Also opens a database from reserve if sign-ups have not done it already.
  const room = await openReserveShards(env.DB, env).catch(() => null) || await accountCapacity(env.DB, env).catch(() => null);
  // The test server keeps two databases and no reserve on purpose.
  const reserve = room && env.ENVIRONMENT !== "staging" ? await reserveCapacity(env.DB) : null;
  const capacity = room ? { ...room, ...(reserve ? { reserve } : {}) } : null;
  const ai = await aiData(env, yesterday, now.getTime()).then(({ rows: used, month, calls }) => aiSummary(used, month, aiMonthlyLimitUsd(env), calls)).catch(error => { console.warn("AI usage report failed", error?.message || error); return null; });
  const stuck = await stuckAccountDeletions(env.DB).catch(error => { console.warn("Stuck account deletions read failed", error?.message || error); return []; });
  const setting = value => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  const accounts = await accountStats(env, yesterday).then(stats => accountsReport(stats, { monthly: aiMonthlyLimitUsd(env), unpaidShare: unpaidLimitShare(env), totalAlert: setting(env.AI_TOTAL_DAILY_ALERT_USD), totalLimit: setting(env.AI_TOTAL_DAILY_LIMIT_USD) }))
    .catch(error => { console.warn("Accounts report failed", error?.message || error); return null; });
  const report = opsReport(rows, capacity, yesterday, ai, stuck, accounts);
  const to = String(env.OWNER_EMAIL || "").trim();
  if (report && to && emailConfigured(env)) await sendEmail(env, { to, subject: report.subject, text: report.text, html: report.html });
  await env.DB.prepare("INSERT INTO ops_events(day,kind,service,count) VALUES(?,'report','-',1) ON CONFLICT(day,kind,service) DO NOTHING").bind(today).run();
  await env.DB.prepare("DELETE FROM ops_events WHERE day<?").bind(day(new Date(now.getTime() - 30 * 86400000))).run();
  return { sent: Boolean(report && to && emailConfigured(env)), report };
}

// Yesterday's AI per account and feature, and the month per account. The
// owner is "Ty", everyone else "Účet #id · group" (no e-mail addresses).
export async function aiData(env, date, now = Date.now()) {
  const exists = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_usage'").first();
  if (!exists) return { rows: [], month: [] };
  await ensureAiUsage(env.DB);
  await ensureStoreColumns(env.DB);
  const rows = (await env.DB.prepare(`SELECT a.user_id, a.feature, COUNT(*) AS calls, SUM(a.cost_usd) AS cost, SUM(a.input_tokens) AS input, SUM(a.cached_tokens) AS cached
    FROM ai_usage a WHERE a.day = ? AND a.model NOT IN ('pending', 'carried-over') GROUP BY a.user_id, a.feature`).bind(date).all()).results || [];
  const month = (await env.DB.prepare(`SELECT a.user_id, SUM(a.cost_usd) AS cost
    FROM ai_usage a WHERE a.day >= ? AND a.day <= ? AND a.model NOT IN ('pending', 'carried-over') GROUP BY a.user_id`).bind(date.slice(0, 8) + "01", date).all()).results || [];
  // Each call of the day on its own, for the average and p95 price of a call by group and feature.
  const each = (await env.DB.prepare(`SELECT a.user_id, a.feature, a.cost_usd AS cost
    FROM ai_usage a WHERE a.day = ? AND a.model NOT IN ('pending', 'carried-over') LIMIT 20000`).bind(date).all()).results || [];
  const ids = [...new Set([...rows, ...month].map(r => Number(r.user_id)).filter(id => id > 0))];
  const owner = String(env.OWNER_EMAIL || "").trim().toLowerCase();
  const users = new Map(), subs = new Map();
  if (ids.length) {
    const list = JSON.stringify(ids);
    for (const u of (await env.DB.prepare("SELECT id, email, created_at FROM users WHERE id IN (SELECT value FROM json_each(?))").bind(list).all()).results || []) users.set(Number(u.id), u);
    for (const s of (await env.DB.prepare("SELECT user_id, plan, valid_until, store_environment, free_trial, offer_type, testflight FROM subscriptions WHERE user_id IN (SELECT value FROM json_each(?))").bind(list).all()).results || []) subs.set(Number(s.user_id), s);
  }
  const isOwner = id => Boolean(owner) && String(users.get(id)?.email || "").trim().toLowerCase() === owner;
  const groupOf = id => {
    if (isOwner(id)) return "Ty";
    const user = users.get(id), sub = subs.get(id);
    if (!user) return "smazaný";
    const group = sub ? groupOfSubscription(sub, now) : String(user.created_at || "").replace("T", " ").slice(0, 19) >= newAccountSince(now) ? "new" : "free";
    return ACCOUNT_GROUPS[group] || group;
  };
  const who = id => isOwner(id) ? "Ty" : `Účet #${id} · ${groupOf(id)}`;
  return {
    rows: rows.map(r => ({ who: who(Number(r.user_id)), feature: r.feature, calls: r.calls, cost: r.cost, input: r.input, cached: r.cached })),
    month: month.map(m => ({ who: who(Number(m.user_id)), cost: m.cost, owner: isOwner(Number(m.user_id)) })),
    calls: each.map(c => ({ group: groupOf(Number(c.user_id)), feature: c.feature, cost: c.cost }))
  };
}
const ACCOUNT_GROUPS = { paid: "Pro", gift: "pilot nebo dárek", trial: "týden zdarma", testflight: "TestFlight", free: "bez nákupu", new: "nový účet", system: "server" };
