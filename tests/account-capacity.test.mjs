import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { mayCreateAccount, accountCapacity, signInEmailUser, signInGoogleUser, openReserveShards, reserveCapacity } from "../src/tenancy.js";
import { registrySql } from "../scripts/provision-user-shards.mjs";
import { opsReport } from "../src/ops-report.js";
import { signInAppleUser } from "../src/apple-login.js";

function database({ shards = 2, perShard = 2, placed = 0, unplaced = 0 } = {}) {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT, disabled INTEGER DEFAULT 0, google_sub TEXT, last_login_at TEXT);
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

test("sign-ins racing for the last free place create one account; the others wait on the list", async () => {
  const open = { ...env, OPEN_SIGNUP: "true" };
  const signIns = {
    email: (db, address) => signInEmailUser(db, open, address),
    google: (db, address) => signInGoogleUser(db, open, { sub: "g-" + address, email: address }),
    apple: (db, address) => signInAppleUser(db, open, { sub: "a-" + address, email: address })
  };
  for (const [how, signIn] of Object.entries(signIns)) {
    const db = database({ placed: 3 });
    assert.equal((await accountCapacity(db, open)).free, 1);
    const users = await Promise.all(["a@example.com", "b@example.com", "c@example.com"].map(address => signIn(db, address)));
    assert.equal(users.filter(Boolean).length, 1, how + ": one account");
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 4, how);
    assert.deepEqual(db.sqlite.prepare("SELECT email FROM signup_waitlist ORDER BY email").all().map(r => r.email), ["a@example.com", "b@example.com", "c@example.com"].filter(address => address !== users.find(Boolean).email), how);
    assert.equal((await accountCapacity(db, open)).free, 0);
  }
});

test("sign-ins racing for the last place under ACCOUNT_LIMIT create one account", async () => {
  const open = { OWNER_EMAIL: "owner@example.com", OPEN_SIGNUP: "true", ACCOUNT_LIMIT: "3" };
  const db = database({ placed: 2 });
  const users = await Promise.all(["a@example.com", "b@example.com"].map(address => signInEmailUser(db, open, address)));
  assert.equal(users.filter(Boolean).length, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 3);
  // An invitation still gets in past the limit, and so does the owner.
  assert.ok(await signInEmailUser(db, open, "new@example.com"));
  assert.ok(await signInEmailUser(db, open, "owner@example.com"));
});

test("with fewer than 100 free places the next database in reserve opens by itself, only one the Worker is bound to", async () => {
  const db = database({ shards: 2, perShard: 25, placed: 0 });
  db.sqlite.exec("ALTER TABLE user_data_shards ADD COLUMN reserve INTEGER NOT NULL DEFAULT 0");
  db.sqlite.exec("INSERT INTO user_data_shards VALUES ('s3','USER_DATA_003','ready',0,25,7000000000,1),('s4','USER_DATA_004','ready',0,25,7000000000,1),('s5','USER_DATA_005','ready',0,25,7000000000,0)");
  // s3 has no binding in this Worker, s5 was closed by hand: neither opens.
  const bound = { ...env, OPEN_SIGNUP: "true", DB: db, USER_DATA_004: { prepare() {} } };
  assert.deepEqual(await reserveCapacity(db), { databases: 2, places: 50 });
  assert.equal(await mayCreateAccount(db, bound, "stranger@example.com"), true);
  const rows = Object.fromEntries(db.sqlite.prepare("SELECT shard_key, accepting_new, reserve FROM user_data_shards").all().map(r => [r.shard_key, [r.accepting_new, r.reserve]]));
  assert.deepEqual([rows.s3, rows.s4, rows.s5], [[0, 1], [1, 0], [0, 0]]);
  assert.equal((await accountCapacity(db, bound)).places, 75);
  // Nothing left that can open: the capacity stays as it is.
  assert.equal((await openReserveShards(db, bound)).places, 75);
  // Plenty of room: nothing opens.
  const roomy = database({ shards: 5, perShard: 25 });
  roomy.sqlite.exec("ALTER TABLE user_data_shards ADD COLUMN reserve INTEGER NOT NULL DEFAULT 0; INSERT INTO user_data_shards VALUES ('s9','USER_DATA_009','ready',0,25,7000000000,1)");
  await openReserveShards(roomy, { ...env, DB: roomy, USER_DATA_009: { prepare() {} } });
  assert.equal(roomy.sqlite.prepare("SELECT accepting_new FROM user_data_shards WHERE shard_key='s9'").get().accepting_new, 0);
  // Before the migration the reserve is simply not there.
  assert.equal(await reserveCapacity(database()), null);
});

test("a deploy registers new databases in reserve once one already takes accounts", () => {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE user_data_shards (shard_key TEXT PRIMARY KEY, binding_name TEXT, state TEXT, accepting_new INTEGER, reserve INTEGER NOT NULL DEFAULT 0, max_users INTEGER, max_bytes INTEGER); INSERT INTO user_data_shards VALUES ('legacy','DB','ready',0,0,10,1)");
  for (const n of ["001", "002", "003"]) db.sqlite.exec(registrySql({ key: "data-" + n, binding: "USER_DATA_" + n }));
  db.sqlite.exec("UPDATE user_data_shards SET max_users=40 WHERE shard_key='data-002'");
  db.sqlite.exec(registrySql({ key: "data-002", binding: "USER_DATA_002" }));
  assert.deepEqual(db.sqlite.prepare("SELECT shard_key, accepting_new, reserve, max_users FROM user_data_shards WHERE shard_key!='legacy' ORDER BY shard_key").all().map(r => [r.shard_key, r.accepting_new, r.reserve, r.max_users]),
    [["data-001", 1, 0, 25], ["data-002", 0, 1, 40], ["data-003", 0, 1, 25]]);
});

test("the morning report says when the reserve of databases runs low", () => {
  assert.equal(opsReport([], { places: 500, used: 10, free: 490, reserve: { databases: 10, places: 250 } }, "2026-11-02"), null);
  const low = opsReport([], { places: 750, used: 600, free: 90, reserve: { databases: 2, places: 50 } }, "2026-11-02").text;
  assert.match(low, /V záloze 2 databáze \(50 míst\)/);
  assert.match(low, /zvyšte USER_DATA_SHARD_COUNT o 10/);
});
