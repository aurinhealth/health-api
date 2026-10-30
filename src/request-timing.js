// How long a request or a cron job took and what it asked D1 for: queries,
// the rows D1 read (what D1 bills) and the time spent waiting for it. Counted
// for everything d1-retry.js runs inside timed(); a statement's first() has
// no meta, so it counts as a query without rows. A batch is one trip to D1
// with many statements: `queries` counts the statements, `trips` the calls.
import { AsyncLocalStorage } from "node:async_hooks";

const current = new AsyncLocalStorage();

export function timed(fn) {
  const store = { started: Date.now(), queries: 0, trips: 0, rowsRead: 0, dbMs: 0 };
  return current.run(store, () => fn(store));
}

export function noteD1(result, ms) {
  const store = current.getStore();
  if (!store) return;
  const results = Array.isArray(result) ? result : [result];
  store.queries += results.length;
  store.trips += 1;
  for (const r of results) store.rowsRead += Number(r?.meta?.rows_read) || 0;
  store.dbMs += ms;
}

export const elapsed = store => Date.now() - store.started;

// For the browser's and the app's network inspector: total time and D1 work.
export function serverTiming(store) {
  return `app;dur=${elapsed(store)}, db;dur=${store.dbMs};desc="${store.queries} queries, ${store.rowsRead} rows read"`;
}

// What the owner's morning report lists as slow: a request the user waits
// for, or a cron job that reads a lot (D1 bills rows read). Many queries means
// many trips to D1: the Google sync saves two days of points every 5 minutes
// in batches of 50 (some 4 600 statements in 90 trips, ~15 000 rows read),
// which is cheap and was listed 145 times a day for nothing.
export const SLOW_REQUEST_MS = 3000;
export const MANY_QUERIES = 400;
export const MANY_ROWS = 1000000;
export function slowness(store, { cron = false } = {}) {
  const ms = elapsed(store), trips = store.trips ?? store.queries;
  if ((cron || ms < SLOW_REQUEST_MS) && trips < MANY_QUERIES && store.rowsRead < MANY_ROWS) return null;
  const queries = trips === store.queries ? `${trips} dotazů` : `${trips} dotazů (${store.queries} příkazů v dávkách)`;
  return `${ms} ms, ${queries}, ${store.rowsRead} řádků`;
}
