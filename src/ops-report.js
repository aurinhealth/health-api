// What went wrong on the server, counted per day in the central database
// (ops_events), and a morning e-mail to the owner that summarises yesterday:
// failed syncs per service, connections that broke, server errors, and how
// full the account capacity is, and what AI cost per user and feature. No
// e-mail when there is nothing to report.
import { AsyncLocalStorage } from "node:async_hooks";
import { emailConfigured, sendEmail } from "./email-sender.js";
import { accountCapacity } from "./tenancy.js";
import { aiMonthlyLimitUsd } from "./ai-usage.js";

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
export async function withOpsScope(db, service, fn) {
  const store = { errors: 0, last: "" };
  try { return await scope.run(store, fn); }
  catch (error) { store.errors++; store.last = text(error); throw error; }
  finally { if (store.errors) await recordOpsEvent(db, "sync", service, store.last, store.errors); }
}

// A path without ids, so one broken route is one row.
export const routeName = pathname => String(pathname || "/").replace(/\/[0-9a-f-]{8,}|\/\d[\w:.-]*/gi, "/:id").slice(0, 80);

const SERVICE_NAMES = {
  sync: "Google Health", "google-food": "Google Health (jídlo)", "intervals-exports": "Intervals (odeslání tréninků)", "sync-sends": "odeslání do aplikací",
  ultrahuman: "Ultrahuman", "wahoo-exports": "Wahoo (odeslání tréninků)", wahoo: "Wahoo", whoop: "WHOOP", "strava-weight": "Strava",
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

// rows: one per user and feature for yesterday ({email, feature, calls, cost});
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
  const lines = [...users.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([email, u]) => {
    const top = u.features.sort((a, b) => b.cost - a.cost).slice(0, 3).map(f => `${FEATURE_NAMES[f.feature] || f.feature || "jiné"} ${usd(f.cost)}`).join(", ");
    return `- ${email}: ${usd(u.cost)} (${u.calls} dotazů) · ${top}`;
  });
  const monthLines = month.sort((a, b) => b.cost - a.cost).map(m => `- ${m.email}: ${usd(m.cost)}${limit ? ` z ${usd(limit)} (${Math.round(m.cost / limit * 100)} %)` : ""}`);
  return `Útrata AI včera: ${usd(total)}, ${calls} dotazů\n${lines.join("\n")}\n\nOd začátku měsíce${limit ? ` (strop ${usd(limit)} na účet)` : ""}\n${monthLines.join("\n")}`;
}

export function opsReport(rows, capacity, date, ai = null) {
  const of = kind => rows.filter(row => row.kind === kind).sort((a, b) => b.count - a.count);
  const sections = [];
  const list = items => items.map(row => `- ${label(row.service)}: ${row.count}×${row.last_message ? ` (naposledy: ${row.last_message})` : ""}`).join("\n");
  if (of("sync").length) sections.push(`Selhané synchronizace\n${list(of("sync"))}`);
  if (of("broken").length) sections.push(`Rozbitá propojení (uživatel musí znovu připojit)\n${list(of("broken"))}`);
  if (of("server").length) sections.push(`Chyby serveru\n${list(of("server"))}`);
  if (capacity?.places && capacity.used / capacity.places >= 0.8) sections.push(`Místo pro účty\n- Obsazeno ${capacity.used} z ${capacity.places} (${Math.round(capacity.used / capacity.places * 100)} %). Nové registrace se po zaplnění řadí do čekací listiny.`);
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
  const report = opsReport(rows, capacity, yesterday, await aiSection(env, yesterday).catch(error => { console.warn("AI usage report failed", error?.message || error); return null; }));
  const to = String(env.OWNER_EMAIL || "").trim();
  if (report && to && emailConfigured(env)) await sendEmail(env, { to, subject: report.subject, text: report.text });
  await env.DB.prepare("INSERT INTO ops_events(day,kind,service,count) VALUES(?,'report','-',1) ON CONFLICT(day,kind,service) DO NOTHING").bind(today).run();
  await env.DB.prepare("DELETE FROM ops_events WHERE day<?").bind(day(new Date(now.getTime() - 30 * 86400000))).run();
  return { sent: Boolean(report && to && emailConfigured(env)), report };
}

async function aiSection(env, date) {
  const exists = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_usage'").first();
  if (!exists) return null;
  const rows = (await env.DB.prepare(`SELECT COALESCE(u.email, '#' || a.user_id) AS email, a.feature, COUNT(*) AS calls, SUM(a.cost_usd) AS cost
    FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id WHERE a.day = ? AND a.model != 'pending' GROUP BY a.user_id, a.feature`).bind(date).all()).results || [];
  const month = (await env.DB.prepare(`SELECT COALESCE(u.email, '#' || a.user_id) AS email, SUM(a.cost_usd) AS cost
    FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id WHERE a.day >= ? AND a.day <= ? AND a.model != 'pending' GROUP BY a.user_id`).bind(date.slice(0, 8) + "01", date).all()).results || [];
  return aiReport(rows, month, aiMonthlyLimitUsd(env));
}
