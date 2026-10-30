import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, findUser, PERSONAL_TABLES } from "../src/tenancy.js";
import { consentStatus, saveConsent } from "../src/consent.js";
import { pauseHealthData, resumeBlocked, finishHealthPauses, pausedRefusal, healthPaused, KEPT_TABLES, PAUSE_DELETE_ORDER, LAST_PASS_MINUTES } from "../src/health-pause.js";
import { serverSource } from "./helpers/server-source.mjs";

const sql = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
function database() {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)");
  db.sqlite.exec(sql("staging/schema.sql"));
  for (const m of ["0013_cookbook_and_consents", "0019_sync_destinations", "0021_session_epoch", "0032_health_pauses"]) db.sqlite.exec(sql(`migrations/${m}.sql`));
  for (const [id, email] of [[3, "a@example.com"], [4, "b@example.com"]]) {
    db.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(id, email);
    db.sqlite.prepare("INSERT INTO user_consents VALUES (?, 'health', '2026-10-11', '2026-10-12T08:00:00Z', NULL)").run(id);
    db.sqlite.prepare("INSERT INTO user_consents VALUES (?, 'ai', '2026-10-11', '2026-10-12T08:00:00Z', NULL)").run(id);
    db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (?, 'apple', 'weight', 'w', '2026-10-01T07:00:00Z', 70, '{}')").run(id);
    db.sqlite.prepare("INSERT INTO dashboard_profile (user_id, id, profile_json) VALUES (?, 1, '{\"sex\":\"female\",\"height\":170,\"rhr\":50,\"goal\":\"maintain\"}')").run(id);
    db.sqlite.prepare("INSERT INTO dashboard_profile (user_id, id, profile_json) VALUES (?, 2, '{\"ftp\":250}')").run(id);
    db.sqlite.prepare("INSERT INTO connection_credentials (user_id, provider, encrypted, updated_at) VALUES (?, 'intervals', 'secret', '2026-10-01')").run(id);
    db.sqlite.prepare("CREATE TABLE IF NOT EXISTS journal_settings (user_id INTEGER NOT NULL PRIMARY KEY, settings_json TEXT NOT NULL, findings_json TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
    db.sqlite.prepare("INSERT INTO journal_settings (user_id, settings_json, findings_json) VALUES (?, '{\"enabled\":true,\"shareSensitive\":true,\"sensitiveAt\":\"2026-10-30\",\"appleSex\":true,\"appleSexAt\":\"2026-10-30\"}', '[1]')").run(id);
    db.sqlite.prepare("INSERT INTO sync_preferences (user_id, destination, health_json) VALUES (?, 'intervals', '\"all\"')").run(id);
    db.sqlite.prepare("INSERT INTO sync_status (user_id, sync_name, status) VALUES (?, 'read_off', 'ok'), (?, 'apple_health', 'ok'), (?, 'initial_google', 'done')").run(id, id, id);
  }
  return db;
}
const user = { id: 3, email: "a@example.com", isOwner: false };
const envOf = db => ({ DB: scopedDb(db, 3), RAW_DB: db, USER_ID: 3, CONSENT_REQUIRED: true });
const count = (db, table, id = 3) => db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(id).n;

test("every personal table is either kept or deleted on a pause, and health data is deleted", () => {
  for (const table of KEPT_TABLES) assert.ok(PERSONAL_TABLES[table], `${table} is a personal table`);
  for (const table of ["health_datapoints", "health_hour_summary", "food_logs", "strength_sets", "cycle_days", "journal_entries", "morning_checkins", "local_workouts", "assistant_messages", "coach_inbox", "client_requests"]) assert.ok(PAUSE_DELETE_ORDER.includes(table), table);
  for (const table of ["user_consents", "subscriptions", "connection_credentials", "user_passkeys", "ai_usage", "coach_messages"]) assert.ok(!PAUSE_DELETE_ORDER.includes(table), table);
});

test("pausing withdraws both consents, deletes this user's health data and keeps the account", async () => {
  const db = database();
  const result = await pauseHealthData(envOf(db), user);
  assert.equal(result.pending, false);
  const status = await consentStatus(envOf(db));
  assert.equal(status.health, null);
  assert.equal(status.paused, true);
  assert.equal(status.aiAllowed, false);
  assert.equal(count(db, "health_datapoints"), 0);
  assert.equal(count(db, "connection_credentials"), 1, "connections stay, paused");
  assert.deepEqual(db.sqlite.prepare("SELECT sync_name FROM sync_status WHERE user_id = 3 ORDER BY sync_name").all().map(r => r.sync_name), ["apple_health", "read_off"], "the switches and the Apple Health connection stay; Google's import starts over");
  const profiles = db.sqlite.prepare("SELECT id, profile_json FROM dashboard_profile WHERE user_id = 3").all();
  assert.deepEqual(profiles.map(r => r.id), [1]);
  assert.deepEqual(JSON.parse(profiles[0].profile_json), { sex: "female", goal: "maintain" });
  const journal = db.sqlite.prepare("SELECT settings_json, findings_json FROM journal_settings WHERE user_id = 3").get();
  assert.deepEqual(JSON.parse(journal.settings_json), { enabled: true, shareSensitive: false, sensitiveAt: null, appleSex: false, appleSexAt: null }, "the journal's own consents go too, its settings stay");
  assert.equal(journal.findings_json, null);
  assert.equal(db.sqlite.prepare("SELECT health_json FROM sync_preferences WHERE user_id = 3").get().health_json, "[]");
  assert.equal(count(db, "health_datapoints", 4), 1, "nobody else's data");
  assert.equal(count(db, "dashboard_profile", 4), 2);
  assert.equal(await healthPaused(db, 4), false);
});

test("the owner cannot pause, nor can a request for another account", async () => {
  const db = database();
  await assert.rejects(pauseHealthData(envOf(db), { ...user, isOwner: true }), /admin|správce/i);
  await assert.rejects(pauseHealthData(envOf(db), { ...user, id: 4 }), /ověřit|verified/);
  assert.equal(count(db, "health_datapoints"), 1);
});

test("the session knows a paused account; a paused account reaches only the account, consent, Pro and settings", async () => {
  const db = database();
  assert.equal((await findUser(db, 3, {})).healthPaused, false);
  await pauseHealthData(envOf(db), user);
  assert.equal((await findUser(db, 3, {})).healthPaused, true);
  for (const path of ["/app/api/me", "/app/api/consent", "/app/api/account/export", "/app/api/account/delete", "/app/api/subscription", "/app/api/subscription/transaction", "/app/api/app-settings", "/app/api/passkeys", "/app/api/push/token", "/app/api/health-pause", "/app/login", "/privacy"]) assert.equal(pausedRefusal("GET", path), null, path);
  assert.equal(pausedRefusal("DELETE", "/app/api/connections"), null, "disconnecting works");
  for (const [method, path] of [["GET", "/app/api/today"], ["POST", "/app/api/health/apple"], ["POST", "/app/api/assistant"], ["POST", "/app/api/food/log"], ["GET", "/app/api/connections"], ["POST", "/app/api/connections"], ["POST", "/app/api/connect/start"], ["GET", "/oauth/google/start"], ["GET", "/oauth/intervals/callback"], ["GET", "/auth/app/connect"], ["POST", "/app/api/sync/retry"]]) {
    const response = pausedRefusal(method, path);
    assert.equal(response?.status, 403, path);
    assert.equal((await response.json()).status, "health_paused");
  }
});

test("turning health data back on runs the last pass first, then the consent is given again", async () => {
  const db = database();
  await pauseHealthData(envOf(db), user);
  // A sync that was running at that moment wrote one more row.
  db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (3, 'google', 'steps', 'late', '2026-10-01T08:00:00Z', 10, '{}')").run();
  assert.equal(await resumeBlocked(envOf(db)), null);
  assert.equal(count(db, "health_datapoints"), 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM health_pauses").get().n, 0);
  const { consent } = await saveConsent(envOf(db), { health: true });
  assert.equal(consent.paused, false);
  assert.equal(consent.needed, false);
  assert.equal((await findUser(db, 3, {})).healthPaused, false);
});

test("the cron finishes the deletion and the last pass, and drops an entry whose consent was given again", async () => {
  const db = database();
  const now = new Date("2026-10-30T20:00:00Z");
  await pauseHealthData(envOf(db), user, { now });
  db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (3, 'google', 'steps', 'late', '2026-10-01T08:00:00Z', 10, '{}')").run();
  assert.equal(await finishHealthPauses(db, { now: () => now }), null, "not before the last pass is due");
  const later = () => new Date(now.getTime() + (LAST_PASS_MINUTES + 1) * 60000);
  assert.deepEqual(await finishHealthPauses(db, { now: later }), [{ userId: 3, done: true }]);
  assert.equal(count(db, "health_datapoints"), 0);
  assert.equal(count(db, "health_datapoints", 4), 1);
  assert.equal(await finishHealthPauses(db, { now: later }), null);

  db.sqlite.prepare("INSERT INTO health_pauses (user_id, retry_after) VALUES (4, '2026-10-30 19:00:00')").run();
  assert.deepEqual(await finishHealthPauses(db, { now: later }), [{ userId: 4, done: true, skipped: "consent given again" }]);
  assert.equal(count(db, "health_datapoints", 4), 1);
});

test("a large account is deleted in chunks, the rest by the cron", async () => {
  const db = database();
  const insert = db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (3, 'google', 'heart-rate', ?, '2026-10-01T07:00:00Z', 60, '{}')");
  for (let i = 0; i < 30; i++) insert.run("hr-" + i);
  const result = await pauseHealthData(envOf(db), user, { budgetMs: -1, chunkRows: 10 });
  assert.equal(result.pending, true);
  assert.ok(count(db, "health_datapoints") > 0);
  const later = () => new Date(Date.now() + (LAST_PASS_MINUTES + 1) * 60000);
  for (let i = 0; i < 10 && count(db, "health_datapoints"); i++) await finishHealthPauses(db, { now: later, chunkRows: 10 });
  assert.equal(count(db, "health_datapoints"), 0);
});

test("the server wires the pause: the gate before every route, the route, resuming and the cron", () => {
  const source = serverSource();
  assert.match(source, /user\.healthPaused && !user\.isOwner\) \{ const paused = pausedRefusal\(request\.method, url\.pathname\)/);
  assert.ok(source.indexOf("pausedRefusal(request.method") < source.indexOf("handleGoogleOAuth(request"), "before connecting a service");
  assert.ok(source.indexOf("pausedRefusal(request.method") < source.indexOf("needsAIAccess(request.method"), "before the AI");
  assert.match(source, /url\.pathname==='\/app\/api\/health-pause'&&request\.method==='POST'/);
  assert.match(source, /toUpperCase\(\)!=='PAUSE'/);
  assert.match(source, /resumeBlocked\(env\)/);
  assert.match(source, /reimportAfterPause\(env,ctx\)/);
  assert.match(source, /finishHealthPauses\(env\.DB/);
});
