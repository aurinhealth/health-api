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
  assert.equal(work.trips, 4);
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
  // The Google sync's batches: thousands of statements in a few trips are not slow.
  assert.equal(slowness({ ...store(18000, 4660, 14497), trips: 93 }, { cron: true }), null);
  assert.match(slowness({ ...store(100, 4660, 0), trips: 450 }, { cron: true }), /^\d+ ms, 450 dotazů \(4660 příkazů v dávkách\), 0 řádků$/);
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

test("every answer of the app's API carries Server-Timing, sign-in and the site none", () => {
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const exported = source.slice(source.lastIndexOf("export default {"));
  assert.match(exported, /return timed\(async work => \{/);
  assert.match(exported, /withTiming\(await withPlainErrors\(request, answered\), work, route, env, ctx\)/);
  assert.match(source, /function withTiming\(response, work, route, env, ctx\) \{\n  if \(!route\.includes\(" \/app\/api\/"\)\) return response;/);
});

test("the slow report says what the request waited for: D1, Intervals, AI, another request", async () => {
  const { beginWait, waitKindOfUrl } = await import("../src/request-timing.js");
  const { cached } = await import("../src/api-cache.js");
  assert.equal(waitKindOfUrl("https://intervals.icu/api/v1/athlete/0/wellness"), "intervals");
  assert.equal(waitKindOfUrl(new Request("https://api.openai.com/v1/responses")), "ai");
  assert.equal(waitKindOfUrl("https://health.googleapis.com/v4/x"), "google");
  assert.equal(waitKindOfUrl("https://api.open-meteo.com/v1"), "other");
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const work = await timed(async store => {
    // Two Intervals calls side by side count once; D1 alongside counts for itself.
    await Promise.all([
      (async () => { const end = beginWait("intervals"); await pause(150); end(); })(),
      (async () => { const end = beginWait("intervals"); await pause(120); end(); })(),
      withD1Retry(async () => { await pause(110); return { results: [], meta: { rows_read: 1 } }; })
    ]);
    return store;
  });
  assert.ok(work.waits.intervals >= 140 && work.waits.intervals < 260, String(work.waits.intervals));
  assert.ok(work.waits.d1 >= 100);
  const slow = slowness({ ...work, started: Date.now() - 3200 });
  assert.match(slow, /^3\d{3} ms, 1 dotazů, 1 řádků; čekání: D1 \d+ ms, Intervals \d+ ms$/);
  assert.match(serverTiming(work), /, intervals;dur=\d+$/);
  // Waiting for the coach inputs another request is computing.
  const store = { match: async () => undefined, put: async () => {} };
  const env = { DB: { userId: 7, prepare: () => ({ bind: () => ({ first: async () => ({ version: 1, food: 0 }) }) }) } };
  let release;
  const first = cached(env, null, "coach-inputs:x", () => new Promise(resolve => { release = resolve; }), { store });
  const second = timed(async s => { const p = cached(env, null, "coach-inputs:x", async () => ({ again: true }), { store }); await pause(120); release({ a: 1 }); await p; return s; });
  const waited = await second; await first;
  assert.ok(waited.waits.shared >= 100, JSON.stringify(waited.waits));
});
