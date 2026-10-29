import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { timed, serverTiming, slowness, MANY_ROWS } from "../src/request-timing.js";
import { withD1Retry } from "../src/d1-retry.js";
import { withOpsScope, opsReport } from "../src/ops-report.js";

const answer = rows => async () => ({ results: [], meta: { rows_read: rows } });

test("queries, rows read and database time are counted for the request they ran in", async () => {
  const work = await timed(async store => {
    await withD1Retry(answer(120));
    await Promise.all([withD1Retry(answer(5)), withD1Retry(async () => [{ meta: { rows_read: 3 } }, { meta: { rows_read: 4 } }])]);
    await withD1Retry(async () => ({ id: 1 })); // first(): a row, no meta
    return store;
  });
  assert.equal(work.queries, 5);
  assert.equal(work.rowsRead, 132);
  assert.match(serverTiming(work), /^app;dur=\d+, db;dur=\d+;desc="5 queries, 132 rows read"$/);
  // Outside a request nothing is counted and nothing breaks.
  assert.deepEqual(await withD1Retry(answer(9)), { results: [], meta: { rows_read: 9 } });
});

test("a request is slow from 3 s, 400 queries or a million rows; a cron job only by its queries and rows", () => {
  const store = (ms, queries, rowsRead) => ({ started: Date.now() - ms, queries, rowsRead, dbMs: 0 });
  assert.equal(slowness(store(500, 40, 2000)), null);
  assert.match(slowness(store(3500, 40, 2000)), /^35\d\d ms, 40 dotazů, 2000 řádků$/);
  assert.match(slowness(store(100, 450, 0)), /450 dotazů/);
  assert.match(slowness(store(100, 1, MANY_ROWS)), /1000000 řádků/);
  assert.equal(slowness(store(60000, 10, 10), { cron: true }), null);
  assert.ok(slowness(store(10, 10, MANY_ROWS + 1), { cron: true }));
});

test("a cron job that reads a million rows lands in the morning report", async () => {
  const db = createD1();
  await withOpsScope(db, "sync", async () => { await withD1Retry(answer(MANY_ROWS + 5)); });
  await withOpsScope(db, "whoop", async () => { await withD1Retry(answer(10)); });
  const rows = db.sqlite.prepare("SELECT kind,service,count,last_message FROM ops_events").all().map(r => ({ ...r }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "slow");
  assert.equal(rows[0].service, "cron sync");
  assert.match(rows[0].last_message, /1000005 řádků/);
  assert.match(opsReport(rows, null, "2026-10-29").text, /Pomalé požadavky a úlohy[^\n]*\n- cron sync: 1× \(naposledy: \d+ ms, 1 dotazů, 1000005 řádků\)/);
});

test("every answer of the Worker carries Server-Timing", () => {
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const exported = source.slice(source.lastIndexOf("export default {"));
  assert.match(exported, /return timed\(async work => \{/);
  assert.match(exported, /withTiming\(await withPlainErrors\(request, answered\), work, route, env, ctx\)/);
});
