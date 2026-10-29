import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { recordOpsEvent, withOpsScope, sendDailyOpsReport, opsReport, aiReport, routeName, stuckAccountDeletions, accountStats, accountsReport } from "../src/ops-report.js";
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
});

test("the report warns when account places are 80 % full", () => {
  assert.equal(opsReport([], { places: 200, used: 150, free: 50 }, "2026-10-15"), null);
  assert.match(opsReport([], { places: 200, used: 160, free: 40 }, "2026-10-15").text, /Obsazeno 160 z 200 \(80 %\)/);
  assert.equal(routeName("/app/api/workouts/123/feedback"), "/app/api/workouts/:id/feedback");
});

test("the AI section lists yesterday's cost per user with the costliest features and the month against the cap", () => {
  const text = aiReport([
    { email: "a@x.cz", feature: "assistant", calls: 10, cost: 0.08, input: 150000, cached: 90000 },
    { email: "a@x.cz", feature: "food-photo", calls: 3, cost: 0.02 },
    { email: "b@x.cz", feature: "screen-text", calls: 4, cost: 0.004 }
  ], [{ email: "a@x.cz", cost: 1 }, { email: "b@x.cz", cost: 0.2 }], 4);
  assert.match(text, /Útrata AI včera: 0\.10 \$, 17 dotazů · z cache 60 % vstupu/);
  assert.match(text, /- a@x\.cz: 0\.10 \$ \(13 dotazů\) · chat s koučem 0\.08 \$, jídlo z fotky 0\.02 \$/);
  assert.match(text, /- a@x\.cz: 1\.00 \$ z 4\.00 \$ \(25 %\)/);
  assert.ok(text.indexOf("a@x.cz") < text.indexOf("b@x.cz"));
  assert.equal(aiReport([], [], 4), null);
  assert.match(opsReport([], null, "2026-10-15", text).text, /Útrata AI včera/);
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

test("accounts and AI against what Pro brings in: warnings daily, the numbers on Mondays", async () => {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  db.sqlite.exec("INSERT INTO users (id, email, created_at) VALUES (1, 'owner@example.com', '2026-10-01'), (2, 'paid@x.cz', '2026-10-01'), (3, 'free@x.cz', '2026-10-27'), (4, 'trial@x.cz', '2026-10-28')");
  await ensureAiUsage(db);
  await ensureStoreColumns(db);
  const until = new Date(Date.now() + 86400000).toISOString();
  db.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, product_id, store_environment, free_trial) VALUES (2, 'ai', ?, 'health.aurin.app.pro.monthly', 'Production', 0), (4, 'ai', ?, 'health.aurin.app.pro.yearly', 'Production', 1)").run(until, until);
  const add = db.sqlite.prepare("INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) VALUES (?, ?, 'assistant', ?, ?)");
  add.run(1, "2026-10-28", "gpt-6-sol", 9);
  add.run(2, "2026-10-28", "gpt-6-sol", 1);
  add.run(3, "2026-10-28", "gpt-6-sol", 2);
  add.run(3, "2026-10-01", "carried-over", 0.5);
  const env = { DB: db, OWNER_EMAIL: "owner@example.com", AI_MONTHLY_LIMIT_USD: "6", AI_UNPAID_LIMIT_SHARE: "0.5" };
  const stats = await accountStats(env, "2026-10-28");
  assert.deepEqual([stats.accounts, stats.newWeek, stats.aiUsersWeek, stats.paidMonthly, stats.paidYearly, stats.trial], [3, 2, 2, 1, 0, 1]);
  assert.equal(stats.monthUsd, 3, "the owner and carried-over rows are not spending");
  assert.deepEqual(stats.nearCap, [{ email: "free@x.cz", cost: 2.5, limit: 3 }], "an unpaid account at 83 % of its halved cap");

  const daily = accountsReport(stats, { monthlyLimit: 6, unpaidShare: 0.5 });
  assert.match(daily, /Pozor\n- free@x\.cz má za měsíc 2\.50 \$ z 3\.00 \$ \(83 %\)/);
  assert.doesNotMatch(daily, /Účty a AI/);
  const monday = accountsReport(stats, { monday: true, monthlyLimit: 6, unpaidShare: 0.5 });
  assert.match(monday, /Platí: 1 \(měsíčně 1, ročně 0\), ve zkušebním týdnu 1/);
  assert.match(monday, /Pro vydělá asi 5\.90 \$ za měsíc · strop na účet 6\.00 \$, bez placení 3\.00 \$/);
  assert.match(accountsReport({ ...stats, nearCap: [], monthUsd: 10 }, {}), /AI tento měsíc vyjde asi na 11\.07 \$, víc, než Pro vydělá \(5\.90 \$ za 1 platících\)/);
  assert.equal(accountsReport({ ...stats, nearCap: [] }, {}), null, "a quiet day sends nothing");
  assert.match(accountsReport({ ...stats, nearCap: [], accounts: 18 }, {}), /Účtů je 18 z 20 testerů/);
});
