import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { exportAccountStream, deleteAccount, finishAccountDeletions, revokeGoogle, inactiveAccounts } from "../src/account-data.js";
import { exportAccount, readExport } from "./helpers/account-export.mjs";
import { findUser } from "../src/tenancy.js";
import { serverSource } from "./helpers/server-source.mjs";

function database() {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)");
  db.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  db.sqlite.exec(readFileSync(new URL("../migrations/0011_account_deletions.sql", import.meta.url), "utf8"));
  db.sqlite.exec(readFileSync(new URL("../migrations/0021_session_epoch.sql", import.meta.url), "utf8"));
  db.sqlite.exec(readFileSync(new URL("../migrations/0026_account_deletion_retries.sql", import.meta.url), "utf8"));
  for (const [id, email] of [[3, "a@example.com"], [4, "b@example.com"]]) {
    db.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(id, email);
    db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (?, 'manual', 'weight', 'w', '2026-10-01T07:00:00Z', 70, '{}')").run(id);
    db.sqlite.prepare("INSERT INTO dashboard_profile (user_id, id, profile_json) VALUES (?, 1, '{\"sex\":\"female\"}')").run(id);
    db.sqlite.prepare("INSERT INTO connection_credentials (user_id, provider, encrypted, updated_at) VALUES (?, 'intervals', 'secret', '2026-10-01')").run(id);
  }
  return db;
}
const user = { id: 3, email: "a@example.com", isOwner: false };
const count = (db, table, id) => db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === "users" ? "id" : "user_id"} = ?`).get(id).n;
// Heart rate samples, as a long-used Google Health account has by the million.
function addSamples(db, id, n) {
  const insert = db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (?, 'google', 'heart-rate', ?, '2026-10-01T07:00:00Z', 60, '{}')");
  for (let i = 0; i < n; i++) insert.run(id, "hr-" + i);
}

test("the export holds everything of this account and none of its keys or other people's data", async () => {
  const db = database();
  const data = await exportAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, user);
  assert.equal(data.header.account.email, "a@example.com");
  assert.equal(data.tables.health_datapoints.length, 1);
  assert.equal(data.tables.dashboard_profile[0].profile_json, '{"sex":"female"}');
  assert.equal(data.tables.connection_credentials, undefined);
  assert.ok(!JSON.stringify(data).includes("secret"));
  assert.ok(!JSON.stringify(data).includes("user_id"));
});

test("the export is NDJSON: a header line, then one line per row", async () => {
  const db = database();
  const now = new Date("2026-10-12T08:00:00Z");
  const { header, rows, text } = await exportAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, { ...user, name: "A" }, { now });
  assert.deepEqual(header, { format: "loadwise-export", version: 2, exportedAt: "2026-10-12T08:00:00.000Z", account: { email: "a@example.com", name: "A" } });
  assert.equal(text.split("\n").length, rows.length + 2);
  for (const line of rows) assert.deepEqual(Object.keys(line), ["table", "row"]);
  assert.deepEqual(rows.map(line => line.table).sort(), ["dashboard_profile", "health_datapoints"]);
});

test("a large account is exported in keyset pages, never with one query over all its rows", async () => {
  const db = database();
  addSamples(db, 3, 23);
  addSamples(db, 4, 7);
  const selects = [];
  const prepare = db.prepare;
  db.prepare = sql => { if (/FROM health_datapoints/.test(sql)) selects.push(sql); return prepare(sql); };
  const { tables } = await exportAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, user, { pageRows: 5 });
  // 24 rows of this account in pages of 5: five pages, each bounded.
  assert.equal(selects.length, 5);
  assert.ok(selects.every(sql => /WHERE user_id = \? AND rowid > \? ORDER BY rowid LIMIT \?/.test(sql)));
  const ids = tables.health_datapoints.map(row => row.external_id);
  assert.equal(ids.length, 24);
  assert.equal(new Set(ids).size, 24);
  assert.ok(!tables.health_datapoints.some(row => "export_rowid__" in row || "user_id" in row));
});

test("the export stream reads a page only when the reader asks for more, and stops when cancelled", async () => {
  const db = database();
  addSamples(db, 3, 20);
  let queries = 0;
  const prepare = db.prepare;
  db.prepare = sql => { if (/^SELECT rowid AS export_rowid__/.test(sql)) queries++; return prepare(sql); };
  const reader = exportAccountStream({ DB: scopedDb(db, 3), USER_ID: 3 }, user, { pageRows: 5 }).getReader();
  const decoder = new TextDecoder();
  assert.equal(JSON.parse(decoder.decode((await reader.read()).value)).format, "loadwise-export");
  const page = decoder.decode((await reader.read()).value).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(page.length, 5);
  assert.equal(page[0].table, "health_datapoints");
  assert.ok(queries <= 2);
  await reader.cancel();
  assert.ok(queries <= 2);
  assert.equal((await readExport(exportAccountStream({ DB: scopedDb(db, 3), USER_ID: 3 }, user, { pageRows: 5 }))).tables.health_datapoints.length, 21);
});

test("the export route streams NDJSON as a .ndjson download", () => {
  const source = serverSource();
  assert.match(source, /new Response\(exportAccountStream\(env,session\.user\)/);
  assert.match(source, /'Content-Type':'application\/x-ndjson; charset=utf-8'/);
  assert.match(source, /aurin-data-'\+localToday\(\)\+'\.ndjson"/);
  assert.doesNotMatch(source, /exportAccountData/);
});

test("deleting the account removes its data and the account, revokes Google and leaves others alone", async () => {
  const db = database();
  const revoked = [];
  const fetchImpl = async (url, init) => { revoked.push([String(url), String(init.body)]); return new Response("", { status: 200 }); };
  const result = await deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3, GOOGLE_REFRESH_TOKEN: "refresh-3" }, user, { fetchImpl });
  assert.equal(result.google, "revoked");
  assert.deepEqual(revoked, [["https://oauth2.googleapis.com/revoke", "token=refresh-3"]]);
  assert.equal(result.pending, false);
  for (const table of ["health_datapoints", "dashboard_profile", "connection_credentials", "users"]) {
    assert.equal(count(db, table, 3), 0, table);
    assert.equal(count(db, table, 4), 1, table);
  }
});

test("deleting the account also revokes WHOOP, Ultrahuman and Wahoo", async () => {
  const db = database();
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([String(url), init.method]); return new Response("", { status: 200 }); };
  const token = JSON.stringify({ access_token: "a", refresh_token: "r" });
  const result = await deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3, WHOOP_TOKEN: token, ULTRAHUMAN_TOKEN: token, WAHOO_TOKEN: token, ULTRAHUMAN_CLIENT_ID: "id", ULTRAHUMAN_CLIENT_SECRET: "s" }, user, { fetchImpl });
  assert.deepEqual([result.whoop, result.ultrahuman, result.wahoo], ["revoked", "revoked", "revoked"]);
  assert.ok(calls.some(([u, m]) => /whoop.*\/v2\/user\/access$/.test(u) && m === "DELETE"));
  assert.ok(calls.some(([u]) => /ultrahuman.*oauth\/revoke$/.test(u)));
  assert.ok(calls.some(([u, m]) => /wahoo.*\/v1\/permissions$/.test(u) && m === "DELETE"));
  assert.equal(count(db, "users", 3), 0);
});

test("deleting the account gives the Intervals.icu OAuth access back; a personal API key is only deleted", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([String(url), init.method, init.headers?.Authorization]); return new Response(null, { status: 204 }); };
  const oauth = await deleteAccount({ DB: scopedDb(database(), 3), USER_ID: 3, INTERVALS_API_KEY: "Bearer tok-3" }, user, { fetchImpl });
  assert.equal(oauth.intervals, "revoked");
  assert.deepEqual(calls, [["https://intervals.icu/api/v1/disconnect-app", "DELETE", "Bearer tok-3"]]);

  calls.length = 0;
  const db = database();
  const key = await deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3, INTERVALS_API_KEY: "personal-key" }, user, { fetchImpl });
  assert.equal(key.intervals, "none");
  assert.deepEqual(calls, []);
  assert.equal(count(db, "connection_credentials", 3), 0);
  assert.equal(count(db, "connection_credentials", 4), 1);

  // Intervals.icu refusing or offline does not stop the deletion.
  const refused = await deleteAccount({ DB: scopedDb(database(), 3), USER_ID: 3, INTERVALS_API_KEY: "Bearer tok-3" }, user, { fetchImpl: async () => new Response(null, { status: 500 }) });
  assert.deepEqual([refused.intervals, refused.pending], ["failed", false]);
  const offline = await deleteAccount({ DB: scopedDb(database(), 3), USER_ID: 3, INTERVALS_API_KEY: "Bearer tok-3" }, user, { fetchImpl: async () => { throw new Error("offline"); } });
  assert.deepEqual([offline.intervals, offline.pending], ["failed", false]);
});

test("the owner's account cannot be deleted, and deleting needs the typed confirmation", async () => {
  const db = database();
  await assert.rejects(deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, { ...user, isOwner: true }), /správce/);
  await assert.rejects(deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, { ...user, id: 4 }), /ověřit/);
  const entry = serverSource();
  assert.match(entry, /url\.pathname==='\/app\/api\/account\/delete'&&request\.method==='POST'/);
  assert.match(entry, /toUpperCase\(\)!=='SMAZAT'/);
  assert.match(entry, /'Set-Cookie':handleDashboardLogout\(\)\.headers\.get\('Set-Cookie'\)/);
  // Disconnecting Google Health gives up the access at Google too; the owner's token can be the shared Worker secret.
  assert.match(entry, /body\.provider==='google'&&!env\.USER_IS_OWNER\) await revokeGoogle\(env\);/);
});

test("revoking Google: nothing to revoke, revoked, or failed without stopping the caller", async () => {
  const calls = [];
  assert.equal(await revokeGoogle({}, async () => { throw new Error("not called"); }), "none");
  assert.equal(await revokeGoogle({ GOOGLE_REFRESH_TOKEN: "t1" }, async (url, init) => { calls.push([String(url), String(init.body)]); return new Response(null, { status: 200 }); }), "revoked");
  assert.deepEqual(calls, [["https://oauth2.googleapis.com/revoke", "token=t1"]]);
  assert.equal(await revokeGoogle({ GOOGLE_REFRESH_TOKEN: "t2" }, async () => new Response(null, { status: 503 })), "failed");
  assert.equal(await revokeGoogle({ GOOGLE_REFRESH_TOKEN: "t3" }, async () => { throw new Error("offline"); }), "failed");
});

test("Apple sign-in links are exported and deleted with the account", async () => {
  const db = database();
  db.sqlite.exec("CREATE TABLE user_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id INTEGER NOT NULL, email TEXT, created_at TEXT, last_login_at TEXT, PRIMARY KEY (provider, subject))");
  db.sqlite.exec("INSERT INTO user_identities (provider, subject, user_id, email) VALUES ('apple', 'sub-3', 3, 'relay@privaterelay.appleid.com'), ('apple', 'sub-4', 4, NULL)");
  const env = { DB: scopedDb(db, 3), USER_ID: 3 };
  assert.deepEqual((await exportAccount(env, user)).tables.user_identities, [{ provider: "apple", subject: "sub-3", email: "relay@privaterelay.appleid.com", created_at: null, last_login_at: null }]);
  await deleteAccount(env, user, { fetchImpl: async () => new Response("") });
  assert.deepEqual(db.sqlite.prepare("SELECT subject FROM user_identities").all().map(r => r.subject), ["sub-4"]);
});

test("a large account is deleted in chunks, never with one DELETE over all its rows", async () => {
  const db = database();
  addSamples(db, 3, 23);
  addSamples(db, 4, 7);
  const deletes = [];
  const prepare = db.prepare;
  db.prepare = sql => { if (/^\s*DELETE FROM (?!users|account_deletions|testflight_waitlist|signup_waitlist)/.test(sql)) deletes.push(sql); return prepare(sql); };
  const result = await deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, user, { fetchImpl: async () => new Response(""), chunkRows: 5 });
  assert.equal(result.pending, false);
  assert.equal(result.deleted.health_datapoints, 24);
  assert.ok(deletes.length > 0 && deletes.every(sql => /WHERE rowid IN \(SELECT rowid FROM \w+ WHERE user_id = \? LIMIT \?\)/.test(sql)));
  assert.equal(count(db, "health_datapoints", 3), 0);
  assert.equal(count(db, "health_datapoints", 4), 8);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM account_deletions").get().n, 0);
});

test("what the request has no time for, the cron finishes; the account is gone at once and its keys first", async () => {
  const db = database();
  addSamples(db, 3, 40);
  addSamples(db, 4, 3);
  const result = await deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, user, { fetchImpl: async () => new Response(""), chunkRows: 5, budgetMs: -1 });
  assert.equal(result.pending, true);
  assert.equal(count(db, "connection_credentials", 3), 0);
  assert.equal(count(db, "users", 3), 0);
  assert.equal(await findUser(db, 3, {}), null);
  assert.ok(count(db, "health_datapoints", 3) > 0);

  let runs = 0;
  for (let run; (run = await finishAccountDeletions(db, { chunkRows: 5, maxChunks: 3 })); runs++) {
    assert.deepEqual(run.map(r => r.userId), [3]);
    assert.ok(runs < 10, "the cron makes progress on every run");
  }
  assert.ok(runs > 1);
  assert.equal(count(db, "health_datapoints", 3), 0);
  assert.equal(count(db, "dashboard_profile", 3), 0);
  assert.equal(count(db, "health_datapoints", 4), 4);
  assert.equal(count(db, "users", 4), 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM account_deletions").get().n, 0);
});

test("a failure halfway still deletes the account and leaves the rest to the cron", async () => {
  const db = database();
  const prepare = db.prepare;
  db.prepare = sql => { if (/DELETE FROM health_datapoints/.test(sql)) throw new Error("D1_ERROR: timeout"); return prepare(sql); };
  const result = await deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, user, { fetchImpl: async () => new Response("") });
  assert.equal(result.pending, true);
  assert.equal(count(db, "users", 3), 0);
  db.prepare = prepare;
  assert.equal((await finishAccountDeletions(db))[0].done, true);
  assert.equal(count(db, "health_datapoints", 3), 0);
});

test("the cron never touches the data of an account that still exists", async () => {
  const db = database();
  db.sqlite.prepare("INSERT INTO account_deletions (user_id) VALUES (4)").run();
  assert.deepEqual(await finishAccountDeletions(db), [{ userId: 4, done: false, skipped: "account exists" }]);
  assert.equal(count(db, "health_datapoints", 4), 1);
  assert.equal(count(db, "dashboard_profile", 4), 1);
  assert.equal(await finishAccountDeletions(db), null);
});

test("a deletion that keeps failing waits and does not hold up the ones after it", async () => {
  const db = database();
  for (const id of [5, 6]) {
    db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (?, 'manual', 'weight', 'w', '2026-10-01T07:00:00Z', 70, '{}')").run(id);
    db.sqlite.prepare("INSERT INTO account_deletions (user_id, requested_at) VALUES (?, ?)").run(id, id === 5 ? "2026-10-01 08:00:00" : "2026-10-02 08:00:00");
  }
  // With routing on, a finished deletion also removes the account's route.
  db.sqlite.exec("CREATE TABLE user_data_routes (user_id INTEGER PRIMARY KEY, shard_key TEXT NOT NULL)");
  let offline = true;
  const databaseForUser = async id => { if (id === 5 && offline) throw new Error("User data database is offline"); return db; };
  let now = new Date("2026-10-18T10:00:00Z");
  const run = () => finishAccountDeletions(db, { databaseForUser, now: () => now });

  // User 5's data database is unavailable; user 6's deletion still completes in the same run.
  // (tests/user-data-shards.test.mjs does the same with a shard marked offline.)
  const first = await run();
  assert.deepEqual(first.map(r => [r.userId, r.done]), [[5, false], [6, true]]);
  assert.match(first[0].failed, /offline/);
  assert.equal(count(db, "health_datapoints", 6), 0);
  assert.equal(count(db, "health_datapoints", 5), 1);
  assert.deepEqual({ ...db.sqlite.prepare("SELECT user_id, attempts, last_error, retry_after FROM account_deletions").get() }, { user_id: 5, attempts: 1, last_error: "User data database is offline", retry_after: "2026-10-18 10:05:00" });

  // Not tried again until its time; then each failure waits longer.
  assert.equal(await run(), null);
  now = new Date("2026-10-18T10:05:00Z");
  assert.equal((await run())[0].attempts, 2);
  assert.equal(db.sqlite.prepare("SELECT retry_after FROM account_deletions").get().retry_after, "2026-10-18 10:15:00");

  // Back online: the next due run finishes it.
  offline = false;
  now = new Date("2026-10-18T10:15:00Z");
  assert.deepEqual((await run()).map(r => [r.userId, r.done]), [[5, true]]);
  assert.equal(count(db, "health_datapoints", 5), 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM account_deletions").get().n, 0);
});

test("a failing purge is put back too, and one run handles a bounded number of accounts", async () => {
  const db = database();
  for (const id of [5, 6, 7, 8, 9]) db.sqlite.prepare("INSERT INTO account_deletions (user_id, requested_at) VALUES (?, ?)").run(id, `2026-10-0${id - 4} 08:00:00`);
  const prepare = db.prepare;
  db.prepare = sql => ({ ...prepare(sql), bind: (...args) => { const bound = prepare(sql).bind(...args); return /^DELETE FROM health_datapoints/.test(sql) && args[0] === 5 ? { ...bound, run: async () => { throw new Error("D1_ERROR: timeout"); } } : bound; } });
  const results = await finishAccountDeletions(db, { now: () => new Date("2026-10-18T10:00:00Z") });
  assert.deepEqual(results.map(r => [r.userId, r.done]), [[5, false], [6, true], [7, true]]);
  assert.match(results[0].failed, /timeout/);
  assert.deepEqual(db.sqlite.prepare("SELECT user_id, attempts FROM account_deletions ORDER BY user_id").all().map(r => [r.user_id, r.attempts]), [[5, 1], [8, 0], [9, 0]]);
});

test("the every-minute cron finishes deleted accounts", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /if \(controller\.cron === "\* \* \* \* \*"\) await finishAccountDeletions\(env\.DB,/);
});

test("accounts nobody signed in to for two years are picked for deletion, never the owner", async () => {
  const db = database();
  db.sqlite.exec("INSERT INTO users (id, email, created_at, last_login_at) VALUES (5, 'owner@example.com', '2020-01-01 00:00:00', NULL), (6, 'c@example.com', '2020-01-01 00:00:00', '2026-09-01 10:00:00'), (7, 'd@example.com', '2023-01-01 00:00:00', '2024-10-07 23:59:59'), (8, 'e@example.com', '2024-10-09 00:00:00', NULL); UPDATE users SET created_at = '2026-01-01 00:00:00', last_login_at = '2024-10-09 00:00:00' WHERE id = 3; UPDATE users SET created_at = '2024-01-01 00:00:00', last_login_at = NULL WHERE id = 4;");
  const env = { OWNER_EMAIL: "Owner@example.com" };
  const picked = await inactiveAccounts(db, env, { now: new Date("2026-10-08T06:00:00Z") });
  assert.deepEqual(picked.map(u => u.id), [4, 7]);
  assert.ok(picked.every(u => u.isOwner === false));
  const scoped = { DB: scopedDb(db, 7), USER_ID: 7 };
  await deleteAccount(scoped, picked[1], { fetchImpl: async () => ({ ok: true }) });
  assert.equal(count(db, "users", 7), 0);
  assert.deepEqual((await inactiveAccounts(db, env, { now: new Date("2026-10-08T06:00:00Z") })).map(u => u.id), [4]);
});

test("deleting the account takes its address off both waitlists, others stay", async () => {
  const db = database();
  db.sqlite.exec("CREATE TABLE testflight_waitlist (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, invited_at TEXT)");
  db.sqlite.exec(readFileSync(new URL("../migrations/0024_signup_waitlist.sql", import.meta.url), "utf8"));
  for (const email of ["a@example.com", "b@example.com"]) {
    db.sqlite.prepare("INSERT INTO testflight_waitlist (email) VALUES (?)").run(email);
    db.sqlite.prepare("INSERT INTO signup_waitlist (email) VALUES (?)").run(email);
  }
  await deleteAccount({ DB: scopedDb(db, 3), RAW_DB: db, USER_ID: 3 }, user, { fetchImpl: async () => new Response("{}") });
  for (const table of ["testflight_waitlist", "signup_waitlist"]) {
    assert.deepEqual(db.sqlite.prepare(`SELECT email FROM ${table}`).all().map(r => r.email), ["b@example.com"]);
  }
});

test("deleting the account works before any waitlist exists", async () => {
  const db = database();
  const result = await deleteAccount({ DB: scopedDb(db, 3), RAW_DB: db, USER_ID: 3 }, user, { fetchImpl: async () => new Response("{}") });
  assert.equal(result.status, "ok");
});
