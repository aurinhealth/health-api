import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { recordOpsEvent, withOpsScope, sendDailyOpsReport, opsReport, routeName } from "../src/ops-report.js";

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
