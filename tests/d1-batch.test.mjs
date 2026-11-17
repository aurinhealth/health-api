import test from "node:test";
import assert from "node:assert/strict";
import { batchingD1, MAX_BATCH } from "../src/d1-batch.js";
import { timed } from "../src/request-timing.js";
import { withD1Retry } from "../src/d1-retry.js";
import { createD1 } from "./helpers/d1.mjs";

// A test database that notes every trip: a single statement or a batch.
function counted() {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t VALUES (1,'a'),(2,'b'),(3,'c')");
  const trips = [];
  const prepare = db.prepare, batch = db.batch.bind(db);
  const RAW = Symbol("raw");
  const wrap = (sql, s) => ({ [RAW]: s, bind: (...v) => wrap(sql, s.bind(...v)),
    first: async col => { trips.push("first " + sql); const row = await s.first(); return col ? row?.[col] ?? null : row; },
    all: () => { trips.push("all " + sql); return s.all(); },
    run: () => { trips.push("run " + sql); return s.run(); } });
  db.prepare = sql => wrap(sql, prepare(sql));
  db.batch = statements => { trips.push("batch " + statements.length); return batch(statements.map(s => s[RAW])); };
  return { db, trips };
}

test("reads started side by side go to D1 in one trip, each caller gets its own answer", async () => {
  const { db, trips } = counted();
  const b = batchingD1(db);
  assert.equal(batchingD1(db), b, "one facade per database");
  assert.equal(batchingD1(b), b);
  const [one, all, none] = await timed(() => Promise.all([
    b.prepare("SELECT v FROM t WHERE id=?").bind(1).first(),
    b.prepare("SELECT id FROM t ORDER BY id").all(),
    b.prepare("SELECT v FROM t WHERE id=?").bind(9).first()
  ]));
  assert.deepEqual(one, { v: "a" });
  assert.deepEqual(all.results.map(r => r.id), [1, 2, 3]);
  assert.equal(none, null);
  assert.deepEqual(trips, ["batch 3"]);
});

test("a lone read, first(column), raw reads and writes are asked as before", async () => {
  const { db, trips } = counted();
  const b = batchingD1(db);
  assert.deepEqual(await b.prepare("SELECT v FROM t WHERE id=?").bind(2).first(), { v: "b" });
  assert.equal(await b.prepare("SELECT v FROM t WHERE id=?").bind(3).first("v"), "c");
  await b.prepare("UPDATE t SET v='z' WHERE id=1").run();
  assert.deepEqual(trips, ["first SELECT v FROM t WHERE id=?", "first SELECT v FROM t WHERE id=?", "run UPDATE t SET v='z' WHERE id=1"]);
});

test("a write sends the reads started before it first, in the order the code asked", () => timed(async () => {
  const { db, trips } = counted();
  const b = batchingD1(db);
  const before = b.prepare("SELECT v FROM t WHERE id=2").first();
  const also = b.prepare("SELECT v FROM t WHERE id=3").first();
  const write = b.prepare("UPDATE t SET v='new' WHERE id=1").run();
  assert.deepEqual(await before, { v: "b" });
  assert.deepEqual(await also, { v: "c" });
  await write;
  assert.deepEqual(trips, ["batch 2", "run UPDATE t SET v='new' WHERE id=1"]);
  assert.deepEqual(await b.prepare("SELECT v FROM t WHERE id=1").first(), { v: "new" });
}));

test("a statement that spoils the batch is asked alone, the others still answer, and it is not joined again", () => timed(async () => {
  const { db, trips } = counted();
  const b = batchingD1(db);
  const results = await Promise.allSettled([
    b.prepare("SELECT v FROM t WHERE id=1").first(),
    b.prepare("SELECT x FROM no_such_table_here").all()
  ]);
  assert.deepEqual(results[0].value, { v: "a" });
  assert.match(String(results[1].reason?.message), /no such table/);
  assert.deepEqual(trips, ["batch 2", "first SELECT v FROM t WHERE id=1", "all SELECT x FROM no_such_table_here"]);
  trips.length = 0;
  await Promise.allSettled([b.prepare("SELECT v FROM t WHERE id=2").first(), b.prepare("SELECT x FROM no_such_table_here").all()]);
  assert.deepEqual(trips.sort(), ["all SELECT x FROM no_such_table_here", "first SELECT v FROM t WHERE id=2"]);
}));

test("a D1 blip or one heavy read failing the batch: each read is asked alone", () => timed(async () => {
  const { db, trips } = counted();
  let blips = 1;
  const batch = db.batch;
  db.batch = statements => (blips-- > 0 ? Promise.reject(new Error("D1_ERROR: D1 DB is overloaded. Requests queued for too long.")) : batch(statements));
  const b = batchingD1(db);
  const read = id => withD1Retry(() => b.prepare("SELECT v FROM t WHERE id=?").bind(id).first(), { sleep: async () => {} });
  assert.deepEqual(await Promise.all([read(1), read(2)]), [{ v: "a" }, { v: "b" }]);
  assert.deepEqual(trips, ["first SELECT v FROM t WHERE id=?", "first SELECT v FROM t WHERE id=?"], "after the failed batch each read is asked alone, none failed by the other");
}));

test("a write that returns rows (RETURNING) still goes after the reads started before it", () => timed(async () => {
  const { db, trips } = counted();
  const b = batchingD1(db);
  const before = b.prepare("SELECT COUNT(*) AS n FROM t").first();
  const also = b.prepare("SELECT v FROM t WHERE id=1").first();
  const inserted = b.prepare("INSERT INTO t(v) VALUES('d') RETURNING id").first();
  assert.deepEqual(trips, ["batch 2", "first INSERT INTO t(v) VALUES('d') RETURNING id"]);
  assert.deepEqual(await inserted, { id: 4 });
  await Promise.all([before, also]);
}));

test("reads without d1-retry (sign-in on the central database) count right: one trip per batch, never below zero", async () => {
  const { db } = counted();
  const b = batchingD1(db);
  const work = await timed(async store => {
    await Promise.all([1, 2, 3, 4].map(id => b.prepare("SELECT v FROM t WHERE id=?").bind(id).first()));
    await withD1Retry(() => b.prepare("SELECT v FROM t WHERE id=1").first());
    await withD1Retry(() => b.prepare("UPDATE t SET v='x' WHERE id=2").run());
    return store;
  });
  assert.equal(work.trips, 3);
  assert.equal(work.queries, 6);
});

test("two requests never share a trip, and a read outside a request goes alone", async () => {
  const { db, trips } = counted();
  const b = batchingD1(db);
  const request = () => timed(() => Promise.all([b.prepare("SELECT v FROM t WHERE id=1").first(), b.prepare("SELECT v FROM t WHERE id=2").first()]));
  await Promise.all([request(), request()]);
  assert.deepEqual(trips, ["batch 2", "batch 2"]);
  trips.length = 0;
  await Promise.all([b.prepare("SELECT v FROM t WHERE id=1").first(), b.prepare("SELECT v FROM t WHERE id=2").first()]);
  assert.equal(trips.length, 2);
  assert.ok(trips.every(t => t.startsWith("first ")));
});

test("more reads than a batch holds go in several trips; the slow report counts one trip per batch", async () => {
  const { db, trips } = counted();
  const b = batchingD1(db);
  const count = MAX_BATCH + 5;
  const store = await timed(async work => {
    await Promise.all(Array.from({ length: count }, (_, i) => withD1Retry(() => b.prepare("SELECT ? AS n").bind(i).first())));
    return work;
  });
  assert.deepEqual(trips, ["batch " + MAX_BATCH, "batch 5"]);
  assert.equal(store.queries, count);
  assert.equal(store.trips, 2);
});

test("something that is not a D1 database is left as it is", () => {
  assert.equal(batchingD1(null), null);
  const plain = { prepare() {} };
  assert.equal(batchingD1(plain), plain);
});
