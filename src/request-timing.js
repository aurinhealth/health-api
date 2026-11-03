// How long a request or a cron job took and what it asked D1 for: queries,
// the rows D1 read (what D1 bills) and the time spent waiting for it. Counted
// for everything d1-retry.js runs inside timed(); a statement's first() has
// no meta, so it counts as a query without rows. A batch is one trip to D1
// with many statements: `queries` counts the statements, `trips` the calls.
import { AsyncLocalStorage } from "node:async_hooks";

const current = new AsyncLocalStorage();

export function timed(fn) {
  const store = { started: Date.now(), queries: 0, trips: 0, rowsRead: 0, dbMs: 0, waits: {}, open: {}, since: {} };
  return current.run(store, () => fn(store));
}

// What a request waited for, in wall time: D1, Intervals.icu, the AI, Google,
// other services, and an entry another request of this isolate was already
// computing (api-cache.js). Calls running side by side count once, so the
// numbers say how much of the request's time each kind of waiting took.
export const WAIT_KINDS = { d1: "D1", intervals: "Intervals", ai: "AI", google: "Google", shared: "jiný požadavek", other: "jiné služby" };
export function beginWait(kind) {
  const store = current.getStore();
  if (!store?.waits) return () => {};
  if (!store.open[kind]) store.since[kind] = Date.now();
  store.open[kind] = (store.open[kind] || 0) + 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    if (--store.open[kind] === 0) store.waits[kind] = (store.waits[kind] || 0) + Date.now() - store.since[kind];
  };
}
export function waitKindOfUrl(url) {
  let host = "";
  try { host = new URL(typeof url === "string" ? url : url?.url || String(url)).hostname; } catch { return "other"; }
  if (host === "intervals.icu") return "intervals";
  if (host === "api.openai.com") return "ai";
  if (host === "googleapis.com" || host.endsWith(".googleapis.com")) return "google";
  return "other";
}
// Every fetch made inside a timed request or job is counted by the host it
// goes to; outside one it is the plain fetch. A fetch replaced later (tests)
// is simply not counted.
const plainFetch = globalThis.fetch;
if (typeof plainFetch === "function" && !plainFetch.__timed) {
  const timedFetch = (input, init) => {
    if (!current.getStore()?.waits) return plainFetch(input, init);
    const end = beginWait(waitKindOfUrl(input));
    let pending;
    try { pending = plainFetch(input, init); } catch (error) { end(); throw error; }
    return Promise.resolve(pending).finally(end);
  };
  timedFetch.__timed = true;
  globalThis.fetch = timedFetch;
}
// "D1 1200 ms, Intervals 4100 ms": the kinds the request waited 100 ms or more for.
export function waitSummary(store) {
  const waits = { ...(store?.waits || {}) };
  for (const kind of Object.keys(store?.open || {})) if (store.open[kind] > 0) waits[kind] = (waits[kind] || 0) + Date.now() - store.since[kind];
  return Object.entries(WAIT_KINDS).filter(([kind]) => waits[kind] >= 100).map(([kind, name]) => `${name} ${waits[kind]} ms`).join(", ");
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
  const waits = Object.entries(store.waits || {}).filter(([kind, ms]) => kind !== "d1" && ms > 0).map(([kind, ms]) => `, ${kind};dur=${ms}`).join("");
  return `app;dur=${elapsed(store)}, db;dur=${store.dbMs};desc="${store.queries} queries, ${store.rowsRead} rows read"` + waits;
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
  const waits = waitSummary(store);
  return `${ms} ms, ${queries}, ${store.rowsRead} řádků` + (waits ? `; čekání: ${waits}` : "");
}
