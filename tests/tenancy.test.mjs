import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { ensureTenancy, scopedDb, signInGoogleUser, inviteUser, setUserDisabled, userEnv, usersWithProviders, _resetTenancyForTest } from "../src/tenancy.js";
import { savePersonalFood, searchPersonalFoods } from "../src/personal-foods.js";
import { logFood, updateFoodEntry } from "../src/food-log.js";

const env = { OWNER_EMAIL: "Owner@Example.com" };

// Schema as it existed before multi-user support (including a table whose
// definition was never part of this repository).
function legacyDb() {
  const db = createD1();
  db.sqlite.exec(`
    CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY AUTOINCREMENT, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT NOT NULL, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, matched_activity_id TEXT, match_confidence REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT (datetime('now')), UNIQUE(source_family, data_type, external_id));
    CREATE INDEX idx_health_datapoints_type_sample ON health_datapoints(data_type, sample_time DESC);
    CREATE TABLE gym_plans (workout_date TEXT PRIMARY KEY, values_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE sync_status (sync_name TEXT PRIMARY KEY, status TEXT NOT NULL, started_at TEXT, finished_at TEXT, details_json TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE connection_credentials (provider TEXT PRIMARY KEY, encrypted TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE dashboard_profile (id INTEGER PRIMARY KEY, profile_json TEXT NOT NULL);
    CREATE TABLE strength_sets (id INTEGER PRIMARY KEY AUTOINCREMENT, workout_date TEXT NOT NULL, plan_row INTEGER NOT NULL, type TEXT NOT NULL, exercise TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'plan', source_key TEXT NOT NULL UNIQUE);
    INSERT INTO health_datapoints(source_family, data_type, external_id, value_numeric) VALUES ('intervals','activity','activity:1',10), ('google-wearables','weight','w1',88);
    INSERT INTO gym_plans(workout_date, values_json) VALUES ('2026-09-30','[]');
    INSERT INTO sync_status(sync_name, status) VALUES ('google','idle');
    INSERT INTO connection_credentials VALUES ('intervals','enc','2026-09-30');
    INSERT INTO dashboard_profile VALUES (1,'{}');
    INSERT INTO strength_sets(workout_date, plan_row, type, exercise, completed, source_key) VALUES ('2026-09-29',2,'WORK','Squat',1,'2026-09-29:2');
  `);
  return db;
}

test("the upgrade assigns every existing row to the owner and switches to per-user keys", async () => {
  _resetTenancyForTest();
  const db = legacyDb();
  await ensureTenancy(db, env);
  const owner = await db.prepare("SELECT id, role FROM users WHERE email='owner@example.com'").first();
  assert.equal(owner.role, "admin");
  for (const table of ["health_datapoints", "gym_plans", "sync_status", "connection_credentials", "dashboard_profile", "strength_sets"]) {
    const rows = (await db.prepare(`SELECT user_id FROM ${table}`).all()).results;
    assert.ok(rows.length > 0, table);
    assert.ok(rows.every(r => r.user_id === owner.id), table);
  }
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM health_datapoints").first()).n, 2);
  // A second user can now hold the same natural keys.
  await db.prepare("INSERT INTO health_datapoints(user_id, source_family, data_type, external_id) VALUES (99,'intervals','activity','activity:1')").run();
  await db.prepare("INSERT INTO gym_plans(user_id, workout_date, values_json) VALUES (99,'2026-09-30','[]')").run();
  await db.prepare("INSERT INTO strength_sets(user_id, workout_date, plan_row, type, exercise, source_key) VALUES (99,'2026-09-29',2,'WORK','Squat','2026-09-29:2')").run();
  // Per-user uniqueness still holds and defaults survive the rebuild.
  await assert.rejects(db.prepare("INSERT INTO gym_plans(user_id, workout_date, values_json) VALUES (99,'2026-09-30','[]')").run());
  const inserted = await db.prepare("SELECT source FROM strength_sets WHERE user_id=99").first();
  assert.equal(inserted.source, "plan");
  assert.ok((await db.prepare("SELECT updated_at FROM health_datapoints WHERE user_id=99").first()).updated_at);
  const indexes = (await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='health_datapoints'").all()).results.map(r => r.name);
  assert.ok(indexes.includes("idx_health_datapoints_user_0"));
});

test("the upgrade runs once and tolerates tables that do not exist yet", async () => {
  _resetTenancyForTest();
  const db = createD1();
  await ensureTenancy(db, env);
  _resetTenancyForTest();
  await ensureTenancy(db, env);
  assert.equal((await db.prepare("SELECT value FROM schema_meta WHERE key='tenancy_version'").first()).value, "1");
  assert.equal(await db.prepare("SELECT value FROM schema_meta WHERE key='tenancy_lock'").first(), null);
});

test("a concurrent upgrade waits instead of racing", async () => {
  _resetTenancyForTest();
  const db = createD1();
  db.sqlite.exec("CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT); INSERT INTO schema_meta VALUES ('tenancy_lock','" + Date.now() + "',NULL)");
  await assert.rejects(ensureTenancy(db, env), /upgrade in progress/);
});

test("the scoped database refuses personal-data queries without user_id", () => {
  const db = scopedDb(createD1(), 5);
  assert.throws(() => db.prepare("SELECT * FROM health_datapoints WHERE data_type='weight'"), /Unscoped query/);
  assert.throws(() => db.prepare("DELETE FROM food_logs WHERE id=?"), /Unscoped query/);
  assert.doesNotThrow(() => db.prepare("SELECT * FROM health_datapoints WHERE user_id=?"));
  assert.doesNotThrow(() => db.prepare("SELECT * FROM food_products WHERE barcode=?"));
  assert.throws(() => scopedDb(createD1(), 0));
});

test("only the owner, existing users and invited emails can sign in", async () => {
  _resetTenancyForTest();
  const db = createD1();
  await ensureTenancy(db, env);
  const owner = await signInGoogleUser(db, env, { sub: "g-owner", email: "OWNER@example.com" });
  assert.equal(owner.isAdmin, true);
  assert.equal(owner.isOwner, true);
  assert.equal(await signInGoogleUser(db, env, { sub: "g-x", email: "stranger@example.com" }), null);
  await inviteUser(db, "Friend@Example.com", owner.id);
  const friend = await signInGoogleUser(db, env, { sub: "g-friend", email: "friend@example.com" });
  assert.equal(friend.isAdmin, false);
  assert.equal(await db.prepare("SELECT email FROM user_invites").first(), null);
  // Same person signs in again; a different Google account with that email does not.
  assert.equal((await signInGoogleUser(db, env, { sub: "g-friend", email: "friend@example.com" })).id, friend.id);
  assert.equal(await signInGoogleUser(db, env, { sub: "g-impostor", email: "friend@example.com" }), null);
  await setUserDisabled(db, env, friend.id, true);
  assert.equal(await signInGoogleUser(db, env, { sub: "g-friend", email: "friend@example.com" }), null);
  await assert.rejects(setUserDisabled(db, env, owner.id, true), /Správce/);
  await assert.rejects(inviteUser(db, "owner@example.com", owner.id), /už má přístup/);
});

test("users never see each other's foods or food log", async () => {
  _resetTenancyForTest();
  const raw = createD1();
  await ensureTenancy(raw, env);
  const alice = scopedDb(raw, 1), bob = scopedDb(raw, 2);
  await savePersonalFood(alice, { name: "Alice granola", nutrition_basis: "g", calories_100g: 400, protein_100g: 10, carbs_100g: 60, fat_100g: 12 });
  assert.equal((await searchPersonalFoods(alice, "Alice granola")).length, 1);
  assert.equal((await searchPersonalFoods(bob, "Alice granola")).length, 0);
  const logged = await logFood(alice, { date: "2026-09-30", name: "Oats", calories: 300, protein_g: 10, carbs_g: 50, fat_g: 5 });
  const day = db => db.prepare("SELECT id, kcal FROM food_logs WHERE user_id = ? AND consumed_date = ?");
  assert.equal(((await day(bob).bind(2, "2026-09-30").all()).results || []).length, 0);
  await updateFoodEntry(bob, { id: logged.id, servings: 3 }).catch(() => null);
  assert.deepEqual(((await day(alice).bind(1, "2026-09-30").all()).results || []).map(r => r.kcal), [300]);
});

test("user env hides the owner's global credentials from other users", () => {
  const base = { DB: createD1(), GOOGLE_REFRESH_TOKEN: "owner-token", INTERVALS_API_KEY: "owner-key" };
  const other = userEnv(base, { id: 2, email: "b@x", role: "user", isOwner: false });
  assert.equal(other.GOOGLE_REFRESH_TOKEN, undefined);
  assert.equal(other.INTERVALS_API_KEY, undefined);
  assert.equal(other.DB.userId, 2);
  const owner = userEnv(base, { id: 1, email: "a@x", role: "admin", isOwner: true });
  assert.equal(owner.GOOGLE_REFRESH_TOKEN, "owner-token");
});

test("jobs run for the owner and every user with a connection who consented to health data", async () => {
  _resetTenancyForTest();
  const raw = createD1();
  await ensureTenancy(raw, env);
  await raw.prepare("INSERT INTO users(email) VALUES ('a@x'), ('b@x'), ('c@x'), ('d@x'), ('e@x')").run();
  raw.sqlite.exec("CREATE TABLE connection_credentials (user_id INTEGER NOT NULL, provider TEXT NOT NULL, encrypted TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, provider)); INSERT INTO connection_credentials VALUES (2,'intervals','e','t'), (4,'google','e','t'), (5,'google','e','t'), (6,'google','e','t'); UPDATE users SET disabled=1 WHERE email='c@x';");
  // d@x never consented, e@x took the consent back.
  raw.sqlite.exec("CREATE TABLE user_consents (user_id INTEGER NOT NULL, kind TEXT NOT NULL, version TEXT NOT NULL, granted_at TEXT NOT NULL, withdrawn_at TEXT, PRIMARY KEY (user_id, kind)); INSERT INTO user_consents VALUES (2,'health','v','t',NULL), (4,'health','v','t',NULL), (5,'ai','v','t',NULL), (6,'health','v','t','t');");
  const users = await usersWithProviders(raw, env, ["intervals", "google"]);
  assert.deepEqual(users.map(u => u.email), ["owner@example.com", "a@x"]);
});

test("a large table is copied in chunks across runs and resumes where it stopped", async () => {
  _resetTenancyForTest();
  const db = createD1();
  db.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY AUTOINCREMENT, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT NOT NULL, value_numeric REAL, UNIQUE(source_family, data_type, external_id))");
  const insert = db.sqlite.prepare("INSERT INTO health_datapoints(source_family, data_type, external_id, value_numeric) VALUES ('google-wearables','heart-rate',?,?)");
  for (let i = 0; i < 1234; i++) insert.run("hr-" + i, 60 + (i % 40));
  // Without a time budget every run copies one chunk and asks the caller to retry.
  await assert.rejects(ensureTenancy(db, env, { budgetMs: 0, chunkRows: 100 }), /upgrade in progress/);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM health_datapoints__tenancy").first()).n, 100);
  let runs = 0;
  for (;;) {
    runs++;
    try { await ensureTenancy(db, env, { budgetMs: 0, chunkRows: 100 }); break; }
    catch (error) { assert.match(error.message, /upgrade in progress/); }
    assert.ok(runs < 100);
  }
  assert.ok(runs > 10);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE user_id=1").first()).n, 1234);
  assert.equal((await db.prepare("SELECT SUM(value_numeric) s FROM health_datapoints").first()).s, Array.from({ length: 1234 }, (_, i) => 60 + (i % 40)).reduce((a, b) => a + b, 0));
  assert.equal(await db.prepare("SELECT name FROM sqlite_master WHERE name='health_datapoints__tenancy'").first(), null);
  assert.equal(await db.prepare("SELECT key FROM schema_meta WHERE key LIKE 'tenancy_cursor:%'").first(), null);
});

test("a repeated chunk after an interrupted run does not duplicate rows", async () => {
  _resetTenancyForTest();
  const db = createD1();
  db.sqlite.exec("CREATE TABLE food_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, consumed_date TEXT NOT NULL, kcal REAL); INSERT INTO food_logs(consumed_date,kcal) VALUES ('2026-09-01',100),('2026-09-02',200),('2026-09-03',300)");
  await assert.rejects(ensureTenancy(db, env, { budgetMs: 0, chunkRows: 2 }));
  // Simulate a crash after the copy but before the cursor was saved.
  await db.prepare("UPDATE schema_meta SET value='0' WHERE key='tenancy_cursor:food_logs'").run();
  _resetTenancyForTest();
  await ensureTenancy(db, env, { chunkRows: 2 });
  assert.equal((await db.prepare("SELECT COUNT(*) n, SUM(kcal) s FROM food_logs").first()).n, 3);
});

test("preview deployments cannot upgrade the shared production database", async () => {
  _resetTenancyForTest();
  const db = legacyDb();
  const preview = new Request("https://040dc7e4-health-api.chelseafc-czsk.workers.dev/app/api/me");
  await assert.rejects(ensureTenancy(db, env, { request: preview }), /previews cannot upgrade/);
  assert.equal(await db.prepare("SELECT name FROM sqlite_master WHERE name='users'").first(), null);
  await ensureTenancy(db, env, { request: new Request("https://petrfitnessdata.eu/app/api/me") });
  assert.ok(await db.prepare("SELECT id FROM users").first());
  // Once upgraded, previews simply use the new schema.
  _resetTenancyForTest();
  await ensureTenancy(db, env, { request: preview });
});
