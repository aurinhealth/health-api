import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { exportAccountData, deleteAccount, finishAccountDeletions, revokeGoogle } from "../src/account-data.js";
import { findUser } from "../src/tenancy.js";

function database() {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)");
  db.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  db.sqlite.exec(readFileSync(new URL("../migrations/0011_account_deletions.sql", import.meta.url), "utf8"));
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, google_sub TEXT UNIQUE, name TEXT, role TEXT NOT NULL DEFAULT 'user', disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT, last_login_at TEXT)");
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
  const data = await exportAccountData({ DB: scopedDb(db, 3), USER_ID: 3 }, user);
  assert.equal(data.account.email, "a@example.com");
  assert.equal(data.tables.health_datapoints.length, 1);
  assert.equal(data.tables.dashboard_profile[0].profile_json, '{"sex":"female"}');
  assert.equal(data.tables.connection_credentials, undefined);
  assert.ok(!JSON.stringify(data).includes("secret"));
  assert.ok(!JSON.stringify(data).includes("user_id"));
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

test("the owner's account cannot be deleted, and deleting needs the typed confirmation", async () => {
  const db = database();
  await assert.rejects(deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, { ...user, isOwner: true }), /správce/);
  await assert.rejects(deleteAccount({ DB: scopedDb(db, 3), USER_ID: 3 }, { ...user, id: 4 }), /ověřit/);
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /url\.pathname==='\/app\/api\/account\/delete'&&request\.method==='POST'/);
  assert.match(entry, /toUpperCase\(\)!=='SMAZAT'/);
  assert.match(entry, /'Set-Cookie':handleDashboardLogout\(\)\.headers\.get\('Set-Cookie'\)/);
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  assert.match(client, /user\?\.isOwner\?'':'<button class="btn danger" type="button" id="deleteAccount">Smazat účet<\/button>'/);
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
  assert.deepEqual((await exportAccountData(env, user)).tables.user_identities, [{ provider: "apple", subject: "sub-3", email: "relay@privaterelay.appleid.com", created_at: null, last_login_at: null }]);
  await deleteAccount(env, user, { fetchImpl: async () => new Response("") });
  assert.deepEqual(db.sqlite.prepare("SELECT subject FROM user_identities").all().map(r => r.subject), ["sub-4"]);
});

test("a large account is deleted in chunks, never with one DELETE over all its rows", async () => {
  const db = database();
  addSamples(db, 3, 23);
  addSamples(db, 4, 7);
  const deletes = [];
  const prepare = db.prepare;
  db.prepare = sql => { if (/^\s*DELETE FROM (?!users|account_deletions)/.test(sql)) deletes.push(sql); return prepare(sql); };
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
    assert.equal(run.userId, 3);
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
  assert.equal((await finishAccountDeletions(db)).done, true);
  assert.equal(count(db, "health_datapoints", 3), 0);
});

test("the cron never touches the data of an account that still exists", async () => {
  const db = database();
  db.sqlite.prepare("INSERT INTO account_deletions (user_id) VALUES (4)").run();
  assert.deepEqual(await finishAccountDeletions(db), { userId: 4, done: false, skipped: "account exists" });
  assert.equal(count(db, "health_datapoints", 4), 1);
  assert.equal(count(db, "dashboard_profile", 4), 1);
  assert.equal(await finishAccountDeletions(db), null);
});

test("the every-minute cron finishes deleted accounts", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /if \(controller\.cron === "\* \* \* \* \*"\) await finishAccountDeletions\(env\.DB\)/);
});
