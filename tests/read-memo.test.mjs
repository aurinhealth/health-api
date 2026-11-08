import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, memoizableSql, writtenTable } from "../src/tenancy.js";

function counted() {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE dashboard_profile(user_id INTEGER,id INTEGER,profile_json TEXT); CREATE TABLE sync_status(user_id INTEGER,sync_name TEXT,status TEXT); INSERT INTO dashboard_profile VALUES(3,1,'{\"age\":30}'); INSERT INTO sync_status VALUES(3,'google','ok')");
  const asked = [];
  const prepare = db.prepare;
  db.prepare = sql => { const s = prepare(sql); const wrap = st => ({ ...st, bind: (...v) => wrap(st.bind(...v)), first: () => { asked.push(sql); return st.first(); }, all: () => { asked.push(sql); return st.all(); }, run: () => { asked.push(sql); return st.run(); } }); return wrap(s); };
  return { db, asked };
}
const PROFILE = "SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=?";

test("within a GET an identical read of the user's tables is asked once, a copy each time", async () => {
  const { db, asked } = counted();
  const scoped = scopedDb(db, 3, { memo: true });
  const [a, b] = await Promise.all([scoped.prepare(PROFILE).bind(3, 1).first(), scoped.prepare(PROFILE).bind(3, 1).first()]);
  const c = await scoped.prepare(PROFILE).bind(3, 1).first();
  assert.equal(asked.length, 1);
  assert.deepEqual([a, b, c].map(r => r.profile_json), Array(3).fill('{"age":30}'));
  a.profile_json = "changed by a caller";
  assert.equal((await scoped.prepare(PROFILE).bind(3, 1).first()).profile_json, '{"age":30}');
  // Other values are another read.
  await scoped.prepare(PROFILE).bind(3, 2).first();
  assert.equal(asked.length, 2);
});

test("a write forgets the kept reads of its table; table creation does not", async () => {
  const { db, asked } = counted();
  const scoped = scopedDb(db, 3, { memo: true });
  await scoped.prepare(PROFILE).bind(3, 1).first();
  await scoped.prepare("CREATE TABLE IF NOT EXISTS dashboard_profile(user_id INTEGER,id INTEGER,profile_json TEXT)").run();
  await scoped.prepare(PROFILE).bind(3, 1).first();
  assert.equal(asked.filter(s => s === PROFILE).length, 1);
  await scoped.prepare("UPDATE dashboard_profile SET profile_json='{\"age\":31}' WHERE user_id=? AND id=1").bind(3).run();
  assert.equal((await scoped.prepare(PROFILE).bind(3, 1).first()).profile_json, '{"age":31}');
  await scoped.batch([scoped.prepare("UPDATE dashboard_profile SET profile_json='{\"age\":32}' WHERE user_id=? AND id=1").bind(3)]);
  assert.equal((await scoped.prepare(PROFILE).bind(3, 1).first()).profile_json, '{"age":32}');
});

test("a write forgets only the kept reads of its own table; reads in a batch forget nothing", async () => {
  const { db, asked } = counted();
  db.sqlite.exec("CREATE TABLE coach_inbox(user_id INTEGER,message TEXT); CREATE TABLE gym_plans(user_id INTEGER,workout_date TEXT,values_json TEXT)");
  const scoped = scopedDb(db, 3, { memo: true });
  const GYM = "SELECT values_json FROM gym_plans WHERE user_id=?";
  await scoped.prepare(PROFILE).bind(3, 1).first(); await scoped.prepare(GYM).bind(3).all();
  // A write of another table keeps both.
  await scoped.prepare("INSERT INTO coach_inbox(user_id,message) VALUES(?,?)").bind(3, "x").run();
  await scoped.batch([scoped.prepare("SELECT message FROM coach_inbox WHERE user_id=?").bind(3), scoped.prepare("SELECT 1 FROM dashboard_profile WHERE user_id=?").bind(3)]);
  await scoped.prepare(PROFILE).bind(3, 1).first(); await scoped.prepare(GYM).bind(3).all();
  assert.equal(asked.filter(s => s === PROFILE).length, 1);
  assert.equal(asked.filter(s => s === GYM).length, 1);
  // A write of gym_plans forgets the gym read only.
  await scoped.prepare("INSERT INTO gym_plans(user_id,workout_date,values_json) VALUES(?,?,?)").bind(3, "2026-11-08", "[]").run();
  assert.equal((await scoped.prepare(GYM).bind(3).all()).results.length, 1);
  await scoped.prepare(PROFILE).bind(3, 1).first();
  assert.equal(asked.filter(s => s === GYM).length, 2);
  assert.equal(asked.filter(s => s === PROFILE).length, 1);
  // A write whose table is not clear forgets everything.
  await scoped.prepare("WITH x AS (SELECT 1) INSERT INTO coach_inbox(user_id,message) SELECT ?, 'y' FROM x").bind(3).run();
  await scoped.prepare(PROFILE).bind(3, 1).first();
  assert.equal(asked.filter(s => s === PROFILE).length, 2);
});

test("the table a write changes", () => {
  assert.equal(writtenTable("INSERT INTO coach_inbox(user_id) VALUES(?)"), "coach_inbox");
  assert.equal(writtenTable("INSERT OR REPLACE INTO gym_plans VALUES(?)"), "gym_plans");
  assert.equal(writtenTable(" UPDATE athlete_state SET state_json=? WHERE user_id=?"), "athlete_state");
  assert.equal(writtenTable("DELETE FROM coach_pick_details WHERE user_id=?"), "coach_pick_details");
  assert.equal(writtenTable("REPLACE INTO training_profile VALUES(?)"), "training_profile");
  assert.equal(writtenTable("WITH x AS (SELECT 1) INSERT INTO food_logs SELECT * FROM x"), null);
});

test("ADD COLUMN goes to D1 once per database: after it ran or found the column there", async () => {
  const { db, asked } = counted();
  const ALTER = "ALTER TABLE sync_status ADD COLUMN source TEXT";
  for (let i = 0; i < 3; i++) {
    const scoped = scopedDb(db, 3, { memo: true });
    await scoped.prepare(PROFILE).bind(3, 1).first();
    await scoped.prepare(ALTER).run().catch(() => {});
    await scoped.prepare(PROFILE).bind(3, 1).first();
  }
  assert.equal(asked.filter(s => s === ALTER).length, 1);
  // The memo is not emptied by it: one profile read per request.
  assert.equal(asked.filter(s => s === PROFILE).length, 3);
  // A column already there: the first try fails, later ones are not sent.
  const { db: other, asked: otherAsked } = counted();
  other.sqlite.exec("ALTER TABLE sync_status ADD COLUMN source TEXT");
  await assert.rejects(scopedDb(other, 3).prepare(ALTER).run(), /duplicate column/);
  await scopedDb(other, 3).prepare(ALTER).run();
  assert.equal(otherAsked.filter(s => s === ALTER).length, 1);
});

test("without memo, and for tables other requests change, every read goes to D1", async () => {
  const { db, asked } = counted();
  const plain = scopedDb(db, 3);
  await plain.prepare(PROFILE).bind(3, 1).first(); await plain.prepare(PROFILE).bind(3, 1).first();
  assert.equal(asked.length, 2);
  const scoped = scopedDb(db, 3, { memo: true });
  const SYNC = "SELECT status FROM sync_status WHERE user_id=? AND sync_name='google'";
  await scoped.prepare(SYNC).bind(3).first(); await scoped.prepare(SYNC).bind(3).first();
  assert.equal(asked.filter(s => s === SYNC).length, 2);
});

test("only reads of the listed tables are kept", () => {
  assert.equal(memoizableSql("SELECT * FROM health_datapoints WHERE user_id=? AND data_type='weight'"), true);
  assert.equal(memoizableSql("SELECT * FROM food_logs f JOIN dashboard_profile p ON p.user_id=f.user_id WHERE f.user_id=?"), true);
  assert.equal(memoizableSql("SELECT * FROM health_datapoints h JOIN sync_status s ON s.user_id=h.user_id WHERE h.user_id=?"), false);
  assert.equal(memoizableSql("SELECT * FROM health_datapoints, connection_credentials WHERE health_datapoints.user_id=?"), false);
  assert.equal(memoizableSql("SELECT secret FROM connection_credentials WHERE user_id=?"), false);
  assert.equal(memoizableSql("INSERT INTO food_logs(user_id) VALUES(?) RETURNING id"), false);
  assert.equal(memoizableSql("SELECT * FROM users WHERE id=?"), false);
  assert.equal(memoizableSql("SELECT * FROM training_plans WHERE user_id=? AND status='active'"), true);
});
