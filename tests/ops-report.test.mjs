import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { recordOpsEvent, withOpsScope, sendDailyOpsReport, opsReport, aiReport, aiSummary, aiData, routeName, stuckAccountDeletions, accountStats, accountsReport } from "../src/ops-report.js";
import { parseSlow } from "../src/ops-report-html.js";
import { ensureAiUsage } from "../src/ai-usage.js";
import { ensureStoreColumns } from "../src/app-store.js";

test("errors a sync job logs and swallows are counted for its service", async () => {
  const db = createD1();
  await withOpsScope(db, "whoop", async () => { console.error("WHOOP sleep failed", "401"); console.error("WHOOP recovery failed", "401"); });
  await withOpsScope(db, "wahoo", async () => {});
  await assert.rejects(withOpsScope(db, "intervals-recent", async () => { throw new Error("boom"); }));
  const rows = db.sqlite.prepare("SELECT kind,service,count FROM ops_events ORDER BY service").all().map(r => ({ ...r }));
  assert.deepEqual(rows, [{ kind: "sync", service: "intervals-recent", count: 1 }, { kind: "sync", service: "whoop", count: 2 }]);
});

test("the morning e-mail lists yesterday's problems once and stays away on a good day", async () => {
  const db = createD1(), sent = [];
  const env = { DB: db, OWNER_EMAIL: "owner@example.com", EMAIL_FROM: "noreply@aurin.health", EMAIL: { send: async message => { sent.push(message); return { messageId: "1" }; } } };
  const now = new Date("2026-10-16T06:00:00Z");
  assert.equal((await sendDailyOpsReport(env, now)).sent, false);
  await recordOpsEvent(db, "sync", "whoop", "x");
  db.sqlite.exec("UPDATE ops_events SET day='2026-10-15' WHERE kind='sync'");
  await recordOpsEvent(db, "server", "GET /app/api/today", "HTTP 500");
  db.sqlite.exec("UPDATE ops_events SET day='2026-10-15' WHERE kind='server'");
  // Already handled today (the quiet run above wrote its mark): nothing more until tomorrow.
  assert.equal((await sendDailyOpsReport(env, now)).already, true);
  const tomorrow = await sendDailyOpsReport({ ...env }, new Date("2026-10-17T06:00:00Z"));
  assert.equal(tomorrow.sent, false);
  db.sqlite.exec("UPDATE ops_events SET day='2026-10-17' WHERE kind!='report'");
  const result = await sendDailyOpsReport(env, new Date("2026-10-18T06:10:00Z"));
  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /WHOOP: 1×/);
  assert.match(sent[0].text, /GET \/app\/api\/today: 1×/);
  assert.equal(sent[0].to, "owner@example.com");
  assert.match(sent[0].html, /^<!doctype html>/);
});

test("the report warns when account places are 80 % full", () => {
  assert.equal(opsReport([], { places: 200, used: 150, free: 50 }, "2026-10-15"), null);
  assert.match(opsReport([], { places: 200, used: 160, free: 40 }, "2026-10-15").text, /Obsazeno 160 z 200 \(80 %\)/);
  assert.equal(routeName("/app/api/workouts/123/feedback"), "/app/api/workouts/:id/feedback");
});

test("the AI section lists yesterday's cost per account with the most used features and the month against the cap", () => {
  const text = aiReport([
    { who: "Ty", feature: "assistant", calls: 10, cost: 0.08, input: 150000, cached: 90000 },
    { who: "Ty", feature: "food-photo", calls: 3, cost: 0.02 },
    { who: "Účet #6 · TestFlight", feature: "screen-text", calls: 21, cost: 0.003 }
  ], [{ who: "Ty", cost: 1, owner: true }, { who: "Účet #6 · TestFlight", cost: 0.004 }, { who: "Účet #9 · Pro", cost: 3 }], 4);
  assert.match(text, /Útrata AI včera: 0\.10 \$, 34 dotazů · z cache 60 % vstupu/);
  assert.match(text, /- Ty: 0\.10 \$ · chat s koučem 10×, jídlo z fotky 3×/);
  assert.match(text, /- Účet #6 · TestFlight: 0\.3 ¢ · věty kouče na obrazovkách 21×/, "below a cent in cents, not 0.00 $");
  assert.match(text, /Za měsíc \(strop 4\.00 \$ na účet\): Účet #9 · Pro 3\.00 \$ \(75 %\) · Ty 1\.00 \$ \(25 %\) · ostatní 1 účet dohromady 0\.4 ¢/, "by name only the owner and accounts past half the cap");
  assert.ok(text.indexOf("Ty:") < text.indexOf("Účet #6"));
  assert.doesNotMatch(text, /@/);
  assert.equal(aiReport([], [], 4), null);
  assert.match(opsReport([], null, "2026-10-15", text).text, /Útrata AI včera/);
});

test("the AI report names accounts by number and group, never by e-mail", async () => {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  db.sqlite.exec("INSERT INTO users (id, email, created_at) VALUES (1, 'Owner@example.com', '2026-10-01 08:00:00'), (6, 'tester@x.cz', '2026-10-01 08:00:00'), (12, 'new@x.cz', '2026-11-01 08:00:00'), (14, 'free@x.cz', '2026-10-01 08:00:00')");
  await ensureAiUsage(db);
  await ensureStoreColumns(db);
  db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, product_id, store_environment, free_trial, testflight) VALUES (6, 'free', NULL, NULL, NULL, 0, 1)").run();
  const add = db.sqlite.prepare("INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) VALUES (?, '2026-11-02', ?, 'gpt', ?)");
  add.run(1, "assistant", 0.07); add.run(6, "screen-text", 0.002); add.run(12, "workout-pick", 0.0002); add.run(14, "screen-text", 0.001); add.run(99, "screen-text", 0.001);
  const env = { DB: db, OWNER_EMAIL: "owner@example.com" };
  const { rows, month } = await aiData(env, "2026-11-02", Date.parse("2026-11-03T06:00:00Z"));
  assert.deepEqual([...new Set(rows.map(r => r.who))].sort(), ["Ty", "Účet #12 · nový účet", "Účet #14 · bez nákupu", "Účet #6 · TestFlight", "Účet #99 · smazaný"]);
  assert.deepEqual(month.filter(m => m.owner).map(m => m.who), ["Ty"]);
  const report = opsReport([], null, "2026-11-02", aiSummary(rows, month, 5));
  assert.doesNotMatch(report.text + report.html, /@x\.cz|@example\.com/);
});

test("the morning e-mail comes as a page too: what matters today first, slow requests with a traffic light", () => {
  const rows = [
    { kind: "sync", service: "sync", count: 2, last_message: "D1_ERROR: Internal error in D1 DB storage caused object to be reset; reference = x" },
    { kind: "slow", service: "GET /app/api/coach/revision", count: 20, last_message: "10133 ms, 176 dotazů, 22373 řádků; čekání: D1 900 ms, Intervals 8100 ms" },
    { kind: "slow", service: "GET /app/api/today", count: 56, last_message: "3800 ms, 113 dotazů, 7923 řádků" },
    ...Array.from({ length: 7 }, (_, i) => ({ kind: "slow", service: `GET /app/api/x${i}`, count: 1, last_message: "3100 ms, 5 dotazů, 5 řádků" })),
    { kind: "slow", service: "GET /app/api/<script>", count: 1, last_message: "3000 ms, 1 dotazů, 1 řádků" }
  ];
  const ai = aiSummary([{ who: "Ty", feature: "assistant", calls: 1, cost: 0.07 }, { who: "Účet #6 · TestFlight", feature: "screen-text", calls: 21, cost: 0.003 }], [{ who: "Ty", cost: 0.45, owner: true }, { who: "Účet #6 · TestFlight", cost: 0.01 }], 5);
  const { html, text } = opsReport(rows, null, "2026-11-02", ai, [], "Účty a AI (bez tebe)\n- Účtů: 2\n\nNávrhy\n- Limity stačí, není potřeba nic měnit.");
  assert.match(html, /2 věci k řešení/);
  assert.match(html, /Revize týdne trvalo až 10,1 s \(20×\)/);
  assert.match(html, /Google Health 2× selhal kvůli chybě D1 u Cloudflare/);
  assert.match(html, /🔴 Revize týdne/);
  assert.match(html, /🟠 Dnes/);
  assert.match(html, />Intervals</, "the longest wait of the request");
  assert.match(html, /Čekal na/);
  assert.doesNotMatch(opsReport([rows[2]], null, "2026-11-02").html, /Čekal na/, "no waits column before the requests say what they waited for");
  assert.match(html, /Další: /, "the rest of the slow list in one line");
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Ty 0\.45 \$ \(9 %\) · ostatní 1 účet dohromady 0\.01 \$/);
  assert.match(html, /Účty a limity 🟢/);
  assert.match(text, /Pomalé požadavky a úlohy/, "the plain text stays for mail apps without HTML");
  assert.match(opsReport([], null, "2026-11-02", null, [], "Účty a AI (bez tebe)\n- Účtů: 2\n\nNávrhy\n- Limity stačí, není potřeba nic měnit.").html, /Vše v pořádku/);
  assert.deepEqual(parseSlow("4255 ms, 256 dotazů, 36926 řádků"), { ms: 4255, rows: 36926, waited: null });
});

test("account deletions that keep failing are in the morning e-mail", async () => {
  const db = createD1();
  assert.deepEqual(await stuckAccountDeletions(db), []);
  db.sqlite.exec("CREATE TABLE account_deletions (user_id INTEGER PRIMARY KEY, requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  assert.deepEqual(await stuckAccountDeletions(db), []);
  db.sqlite.exec("ALTER TABLE account_deletions ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0; ALTER TABLE account_deletions ADD COLUMN last_error TEXT; ALTER TABLE account_deletions ADD COLUMN retry_after TEXT;");
  db.sqlite.exec("INSERT INTO account_deletions (user_id, requested_at, attempts, last_error) VALUES (5, '2026-10-10 08:00:00', 4, 'User data database is offline'), (6, '2026-10-11 08:00:00', 1, 'timeout')");
  const stuck = await stuckAccountDeletions(db);
  assert.deepEqual(stuck.map(r => r.user_id), [5]);
  const text = opsReport([], null, "2026-10-15", null, stuck).text;
  assert.match(text, /Nedokončená smazání účtů/);
  assert.match(text, /- účet #5 smazaný 2026-10-10: 4× selhalo \(naposledy: User data database is offline\)/);
  assert.equal(opsReport([], null, "2026-10-15", null, []), null);
});

test("every morning: accounts and AI against what Pro brings in, with a proposal for each limit", async () => {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  db.sqlite.exec("INSERT INTO users (id, email, created_at) VALUES (1, 'owner@example.com', '2026-10-01'), (2, 'paid@x.cz', '2026-10-01'), (3, 'free@x.cz', '2026-10-27'), (4, 'trial@x.cz', '2026-10-28'), (5, 'pilot@x.cz', '2026-10-01')");
  await ensureAiUsage(db);
  await ensureStoreColumns(db);
  const until = new Date(Date.now() + 86400000).toISOString();
  db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, product_id, store_environment, free_trial) VALUES (2, 'ai', ?, 'health.aurin.app.pro.monthly', 'Production', 0), (4, 'ai', ?, 'health.aurin.app.pro.yearly', 'Production', 1)").run(until, until);
  db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, product_id, store_environment, free_trial, offer_type) VALUES (5, 'ai', ?, 'health.aurin.app.pro.yearly', 'Production', 0, 3)").run(until);
  const add = db.sqlite.prepare("INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) VALUES (?, ?, 'assistant', ?, ?)");
  add.run(1, "2026-10-28", "gpt-6-sol", 9);
  add.run(2, "2026-10-28", "gpt-6-sol", 1);
  add.run(3, "2026-10-28", "gpt-6-sol", 2);
  add.run(3, "2026-10-01", "carried-over", 0.5);
  const env = { DB: db, OWNER_EMAIL: "owner@example.com", AI_MONTHLY_LIMIT_USD: "6", AI_UNPAID_LIMIT_SHARE: "0.5" };
  const stats = await accountStats(env, "2026-10-28");
  assert.deepEqual([stats.accounts, stats.newWeek, stats.aiUsersWeek, stats.paidMonthly, stats.paidYearly, stats.gift, stats.trial], [4, 2, 2, 1, 0, 1, 1], "an offer code is the pilot or a gift, not revenue");
  assert.equal(stats.monthUsd, 3, "the owner and carried-over rows are not spending");
  assert.deepEqual(stats.nearCap, [{ email: "free@x.cz", cost: 2.5, limit: 3 }], "an unpaid account at 83 % of its halved cap");

  const limits = { monthly: 6, unpaidShare: 0.5, totalAlert: 10, totalLimit: 30 };
  const daily = accountsReport(stats, limits);
  assert.match(daily, /Platí: 1 \(měsíčně 1, ročně 0\), pilot a dárky 1, ve zkušebním týdnu 1/);
  assert.match(daily, /Pro vydělá asi 5\.90 \$ za měsíc · strop na účet 6\.00 \$, bez placení 3\.00 \$/);
  assert.match(daily, /Návrhy\n- free@x\.cz má za měsíc 2\.50 \$ z 3\.00 \$ \(83 %\)\. Jestli je to běžné používání, zvedni AI_MONTHLY_LIMIT_USD z 6\.00 \$ na 8\.00 \$/);
  const quiet = { ...stats, nearCap: [] };
  assert.match(accountsReport(quiet, limits), /Návrhy\n- Limity stačí, není potřeba nic měnit\./, "the numbers come every day, quiet or not");
  const grouped = accountsReport({ ...quiet, groups: [{ grp: "paid", cost_usd: 1.2, brake_usd: 10 }, { grp: "free", cost_usd: 4, brake_usd: 5 }] }, limits);
  assert.match(grouped, /AI včera podle skupin: platící 1\.20 \$ z 10\.00 \$, bez nákupu 4\.00 \$ z 5\.00 \$/);
  assert.match(grouped, /Skupina „bez nákupu“ včera vyčerpala 80 % své denní pojistky/);
  assert.match(accountsReport({ ...quiet, monthUsd: 10 }, limits), /AI tento měsíc vyjde asi na 11\.07 \$, víc, než Pro vydělá \(5\.90 \$ za 1 platících\)\. Sniž COACH_WEEKLY_MESSAGES/);
  assert.match(accountsReport({ ...quiet, totalYesterdayUsd: 22 }, limits), /Včera padlo 73 % denní brzdy pro všechny\. Než AI vypne všem, zvedni AI_TOTAL_DAILY_LIMIT_USD na 45\.00 \$ a AI_TOTAL_DAILY_ALERT_USD na 15\.00 \$/);
  assert.match(accountsReport({ ...quiet, accounts: 18 }, limits), /Účtů je 18 z 20 testerů/);
});
