import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { mayCreateAccount, accountCapacity } from "../src/tenancy.js";

function database({ shards = 2, perShard = 2, placed = 0, unplaced = 0 } = {}) {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, role TEXT, disabled INTEGER DEFAULT 0);
    CREATE TABLE user_invites (email TEXT PRIMARY KEY);
    CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE user_data_shards (shard_key TEXT PRIMARY KEY, binding_name TEXT, state TEXT, accepting_new INTEGER, max_users INTEGER, max_bytes INTEGER);
    CREATE TABLE user_data_routes (user_id INTEGER PRIMARY KEY, shard_key TEXT);
    CREATE TABLE signup_waitlist (email TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO schema_meta VALUES ('user_data_sharding_enabled', '1');
    INSERT INTO user_data_shards VALUES ('legacy', 'DB', 'ready', 0, 10, 1);
    INSERT INTO user_invites VALUES ('new@example.com');`);
  for (let i = 1; i <= shards; i++) db.sqlite.prepare("INSERT INTO user_data_shards VALUES (?, ?, 'ready', 1, ?, 7000000000)").run("s" + i, "USER_DATA_00" + i, perShard);
  let id = 0;
  for (let i = 0; i < placed; i++) { id++; db.sqlite.prepare("INSERT INTO users (id, email, role) VALUES (?, ?, 'user')").run(id, "p" + id + "@x.cz"); db.sqlite.prepare("INSERT INTO user_data_routes VALUES (?, ?)").run(id, "s" + (1 + (i % shards))); }
  for (let i = 0; i < unplaced; i++) { id++; db.sqlite.prepare("INSERT INTO users (id, email, role) VALUES (?, ?, 'user')").run(id, "u" + id + "@x.cz"); }
  return db;
}
const env = { USER_DATA_ROUTING: "true", OWNER_EMAIL: "owner@example.com" };

test("free places count the accounts already placed and those waiting for their place", async () => {
  assert.deepEqual(await accountCapacity(database({ placed: 1, unplaced: 1 }), env), { places: 4, used: 2, free: 2 });
  assert.equal(await accountCapacity(database(), { OWNER_EMAIL: "owner@example.com" }), null);
});

test("with the user databases full an invited address waits on the list instead of getting a broken account", async () => {
  assert.equal(await mayCreateAccount(database({ placed: 3 }), env, "new@example.com"), true);
  const full = database({ placed: 3, unplaced: 1 });
  assert.equal(await mayCreateAccount(full, env, "new@example.com"), false);
  assert.equal(full.sqlite.prepare("SELECT COUNT(*) AS n FROM signup_waitlist WHERE email='new@example.com'").get().n, 1);
  // The owner always gets in; an address without an invitation is not put on the list.
  assert.equal(await mayCreateAccount(full, env, "owner@example.com"), true);
  assert.equal(await mayCreateAccount(full, env, "stranger@example.com"), false);
  assert.equal(full.sqlite.prepare("SELECT COUNT(*) AS n FROM signup_waitlist").get().n, 1);
});

test("ACCOUNT_LIMIT stops open sign-up at that many accounts, invitations still get in", async () => {
  const open = { ...env, OPEN_SIGNUP: "true", ACCOUNT_LIMIT: "2" };
  assert.equal(await mayCreateAccount(database({ placed: 1 }), open, "stranger@example.com"), true);
  const full = database({ placed: 2 });
  assert.equal(await mayCreateAccount(full, open, "stranger@example.com"), false);
  assert.equal(full.sqlite.prepare("SELECT COUNT(*) AS n FROM signup_waitlist WHERE email='stranger@example.com'").get().n, 1);
  assert.equal(await mayCreateAccount(full, open, "new@example.com"), true);
  assert.equal(await mayCreateAccount(full, open, "owner@example.com"), true);
  assert.equal(await mayCreateAccount(full, { ...open, ACCOUNT_LIMIT: "" }, "stranger@example.com"), true);
});
