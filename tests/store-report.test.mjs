// The owner's morning lines about trials and subscriptions and the daily
// snapshot for the charts (src/store-report.js).
import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { storeCounts, storeReport, storeData, saveDailyStats, dailyStats } from "../src/store-report.js";

const DAY = 86400000;
const at = Date.parse("2026-12-03T10:00:00Z");
const event = (type, extra = {}) => ({ original_transaction_id: "1", user_id: 5, type, subtype: null, ownership: "PURCHASED", free_trial: 0, expires_at: null, signed_at: at, ...extra });

test("yesterday's events become counts: a trial's first payment is not a renewal, cancelled trials say the days left", () => {
  const counts = storeCounts([
    event("SUBSCRIBED", { original_transaction_id: "a", free_trial: 1 }),
    event("SUBSCRIBED", { original_transaction_id: "b" }),
    event("DID_RENEW", { original_transaction_id: "c" }),
    event("DID_RENEW", { original_transaction_id: "d" }),
    event("DID_CHANGE_RENEWAL_STATUS", { original_transaction_id: "e", subtype: "AUTO_RENEW_DISABLED", free_trial: 1, expires_at: at + 6 * DAY }),
    event("DID_CHANGE_RENEWAL_STATUS", { original_transaction_id: "f", subtype: "AUTO_RENEW_DISABLED" }),
    event("CONSUMPTION_REQUEST"), event("REFUND"),
    event("SUBSCRIBED", { original_transaction_id: "g", free_trial: 1, ownership: "FAMILY_SHARED" })
  ], [{ original_transaction_id: "c", type: "SUBSCRIBED", free_trial: 1 }, { original_transaction_id: "d", type: "SUBSCRIBED", free_trial: 1 }, { original_transaction_id: "d", type: "DID_RENEW", free_trial: 0 }]);
  assert.deepEqual([counts.trialsStarted, counts.paidStarted, counts.converted, counts.renewed, counts.trialsCancelled, counts.paidCancelled, counts.refundRequests, counts.refunds, counts.familyShared], [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const text = storeReport(counts);
  assert.match(text, /^Předplatné včera/);
  assert.match(text, /- Zkušební období zrušeno: 1 \(zbývalo 6 dní\)/);
  assert.match(text, /- Ze zkušebního období zaplaceno: 1/);
  assert.doesNotMatch(text, /Platba se nepovedla/, "lines with nothing are left out");
  assert.equal(storeReport(storeCounts([])), null);
});

test("only App Store purchases of yesterday count, without the owner's", async () => {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)");
  db.sqlite.exec("INSERT INTO users VALUES (1, 'owner@aurin.health'), (2, 'someone@example.com')");
  db.sqlite.exec("CREATE TABLE store_events (notification_uuid TEXT PRIMARY KEY, user_id INTEGER, original_transaction_id TEXT, type TEXT, subtype TEXT, product_id TEXT, environment TEXT, ownership TEXT, free_trial INTEGER, offer_type INTEGER, auto_renew INTEGER, expiration_intent INTEGER, expires_at INTEGER, revoked_at INTEGER, signed_at INTEGER)");
  const insert = db.sqlite.prepare("INSERT INTO store_events (notification_uuid, user_id, original_transaction_id, type, environment, free_trial, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  insert.run("1", 2, "x", "SUBSCRIBED", "Production", 1, at);
  insert.run("2", 1, "y", "SUBSCRIBED", "Production", 1, at);
  insert.run("3", 2, "z", "SUBSCRIBED", "Sandbox", 1, at);
  insert.run("4", 2, "w", "SUBSCRIBED", "Production", 1, at - DAY);
  const { rows } = await storeData({ DB: db, OWNER_EMAIL: "owner@aurin.health" }, "2026-12-03");
  assert.deepEqual(rows.map(row => row.original_transaction_id), ["x"]);
  assert.deepEqual(await storeData({ DB: createD1() }, "2026-12-03"), { rows: [], earlier: [] }, "no history yet");
});

test("the daily snapshot keeps one row per day and the charts read them oldest first", async () => {
  const db = createD1();
  assert.deepEqual(await dailyStats(db), []);
  await saveDailyStats(db, "2026-12-02", { accounts: 10, newWeek: 3, paidMonthly: 1, paidYearly: 2, gift: 0, trial: 4, aiUsersWeek: 6, totalYesterdayUsd: 0.4567 }, storeCounts([event("SUBSCRIBED", { free_trial: 1 })]));
  await saveDailyStats(db, "2026-12-01", { accounts: 9 }, null);
  await saveDailyStats(db, "2026-12-02", { accounts: 11 }, null);
  const days = await dailyStats(db);
  assert.deepEqual(days.map(row => [row.day, row.accounts]), [["2026-12-01", 9], ["2026-12-02", 11]]);
  assert.equal(days[1].trials_started, null, "a second run that day replaces the row");
});

test("the morning e-mail carries the lines in its text and its HTML", async () => {
  const { opsReport } = await import("../src/ops-report.js");
  const report = opsReport([], null, "2026-12-03", null, [], null, "Předplatné včera\n- Začalo zkušební období: 2");
  assert.match(report.text, /Předplatné včera\n- Začalo zkušební období: 2/);
  assert.match(report.html, /Předplatné včera/);
  assert.match(report.html, /Začalo zkušební období: 2/);
});
