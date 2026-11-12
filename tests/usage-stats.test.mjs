import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { noteRequest, recordAppEvents, usageReport, forgetOldUsage, forgetSeen, SERVER_NAMES, APP_NAMES } from "../src/usage-stats.js";

function setup() {
  forgetSeen();
  const db = createD1();
  db.sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  db.sqlite.exec("CREATE TABLE user_consents (user_id INTEGER NOT NULL, kind TEXT NOT NULL, version TEXT NOT NULL, granted_at TEXT NOT NULL, withdrawn_at TEXT, PRIMARY KEY (user_id, kind))");
  db.sqlite.exec(readFileSync(new URL("../migrations/0038_usage_stats.sql", import.meta.url), "utf8"));
  db.sqlite.exec("INSERT INTO users (id, email, created_at) VALUES (1, 'a@x', '2026-11-02 10:00:00'), (2, 'b@x', '2026-11-04 10:00:00')");
  return db;
}
const counts = db => db.sqlite.prepare("SELECT day, name, users FROM usage_counts ORDER BY day, name").all().map(r => ({ ...r }));
const retention = db => db.sqlite.prepare("SELECT cohort_week, day_n, users FROM usage_retention ORDER BY cohort_week, day_n").all().map(r => ({ ...r }));
const consent = (db, user, kind, withdrawn = null) => db.sqlite.prepare("INSERT OR REPLACE INTO user_consents VALUES (?, ?, '2026-11-13', '2026-11-13', ?)").run(user, kind, withdrawn);
const user = id => ({ id, email: `${id}@x` });
const day = iso => new Date(`${iso}T12:00:00Z`);

test("each account adds one per name and day, however many requests", async () => {
  const db = setup();
  for (let i = 0; i < 3; i++) await noteRequest(db, null, user(1), "GET", "/app/api/today", day("2026-11-03"));
  await noteRequest(db, null, user(2), "GET", "/app/api/today", day("2026-11-04"));
  await noteRequest(db, null, user(1), "POST", "/app/api/assistant", day("2026-11-03"));
  // A restarted server (empty memory) still counts the account once.
  forgetSeen();
  await noteRequest(db, null, user(1), "GET", "/app/api/today", day("2026-11-03"));
  await noteRequest(db, null, user(1), "GET", "/app/api/sleep", day("2026-11-09"));
  assert.deepEqual(counts(db), [
    { day: "2026-11-03", name: "active", users: 1 }, { day: "2026-11-03", name: "coach", users: 1 }, { day: "2026-11-03", name: "today", users: 1 },
    { day: "2026-11-04", name: "active", users: 1 }, { day: "2026-11-04", name: "today", users: 1 },
    { day: "2026-11-09", name: "active", users: 1 }
  ]);
  // Returns: days since sign-up per sign-up week (Monday 2026-11-02).
  assert.deepEqual(retention(db), [
    { cohort_week: "2026-11-02", day_n: 0, users: 1 }, { cohort_week: "2026-11-02", day_n: 1, users: 1 }, { cohort_week: "2026-11-02", day_n: 7, users: 1 }
  ]);
  // Per account only the last counted day stays.
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM usage_users WHERE user_id = 1").get().n, 1);
  assert.equal(db.sqlite.prepare("SELECT last_day FROM usage_users WHERE user_id = 1").get().last_day, "2026-11-09");
});

test("Share usage data off: nothing is counted; the owner and App Review never are", async () => {
  const db = setup();
  consent(db, 1, "usage", "2026-11-13");
  await noteRequest(db, null, user(1), "GET", "/app/api/today", day("2026-11-05"));
  await noteRequest(db, null, { ...user(2), isOwner: true }, "GET", "/app/api/today", day("2026-11-05"));
  await noteRequest(db, null, { ...user(2), isReview: true }, "GET", "/app/api/today", day("2026-11-05"));
  assert.deepEqual(counts(db), []);
  assert.deepEqual(retention(db), []);
});

test("app steps only with the opt-in, only allowed names, and not when sharing is off", async () => {
  const db = setup();
  const body = { events: ["onboarding.consent", "paywall.shown", "paywall.shown", "cycle", "x'; DROP TABLE users;--", 7] };
  await recordAppEvents(db, user(1), body, day("2026-11-05"));
  assert.deepEqual(counts(db), []);
  consent(db, 1, "usage_events");
  await recordAppEvents(db, user(1), body, day("2026-11-05"));
  assert.deepEqual(counts(db).map(r => r.name), ["onboarding.consent", "paywall.shown"]);
  consent(db, 1, "usage", "2026-11-13");
  await recordAppEvents(db, user(1), { events: ["onboarding.done"] }, day("2026-11-05"));
  assert.equal(counts(db).length, 2);
});

test("names fit the day mask and say nothing about health", () => {
  assert.ok(SERVER_NAMES.length + APP_NAMES.length <= 52);
  for (const name of [...SERVER_NAMES, ...APP_NAMES]) assert.doesNotMatch(name, /cycle|journal|pause|sleep|weight|metric|illness|injury|sex/);
});

test("the owner's report and the cleanup after 180 days", async () => {
  const db = setup();
  await noteRequest(db, null, user(1), "GET", "/app/api/today", day("2026-11-03"));
  await noteRequest(db, null, user(2), "GET", "/app/api/today", day("2026-11-05"));
  consent(db, 2, "usage", "2026-11-13");
  const report = await usageReport(db, { days: 30, now: day("2026-11-13") });
  assert.equal(report.counts.filter(r => r.name === "active").length, 2);
  assert.deepEqual(report.retention, [{ cohort: "2026-11-02", size: 0, d1: 2, d7: 0, d30: 0 }]);
  assert.equal(report.sharingOff, 1);
  await forgetOldUsage(db, day("2027-05-10"));
  assert.deepEqual(counts(db), []);
  assert.deepEqual(retention(db), []);
});
