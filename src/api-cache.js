// Short-lived cache of expensive per-user inputs (the coach's view of the day,
// FTP and zones) in the Workers Cache API, so the workout library answers in a
// moment instead of rebuilding three weeks of data on every click. A version
// per user, bumped by every change the user makes (sync, plan edit, feedback),
// makes older entries unreachable at once; the TTL covers data that arrives
// by itself (Intervals.icu, Google Health).

import { beginWait } from "./request-timing.js";

export const CACHE_TTL_SECONDS = 600;

// A closed day: two or more days back (today and yesterday still get late
// watch syncs). Its analysis and food are kept for CLOSED_DAY_TTL_SECONDS
// under the same version: whatever changes such a day bumps the version (the
// user's own changes, Apple Health, Intervals.icu, Wahoo, and a Google sync
// that changed a row of a closed day: index.js saveGooglePointsBatch).
export const CLOSED_DAY_TTL_SECONDS = 6 * 3600;
export function closedDay(day, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) return false;
  const limit = new Date(Date.parse(today + "T12:00:00Z") - 2 * 86400000).toISOString().slice(0, 10);
  return day <= limit;
}
// The same entry being computed in this isolate: Today's coach cards ask for
// the same coach inputs at the same moment, and each used to compute them
// (some 400 database reads each) before the first one was kept.
const computing = new Map();

// { version, food }: food counts only meals and drinks (bumpCacheVersion with
// food: true). Before migration 0030 there is no food counter: food writes
// then bump the version itself. Read once per database object (one request,
// or one user's cron run) until it bumps the version itself: a coach card asks
// for several cached entries.
const versions = new WeakMap();
async function readCacheVersion(db) {
  try { const row = await db.prepare("SELECT version, food FROM api_cache_versions WHERE user_id=?").bind(db.userId).first(); return { version: row?.version || 0, food: row?.food || 0 }; }
  catch {
    try { return { version: (await db.prepare("SELECT version FROM api_cache_versions WHERE user_id=?").bind(db.userId).first())?.version || 0, food: 0 }; }
    catch { return { version: 0, food: 0 }; }
  }
}

export function cacheVersion(db) {
  if (!versions.has(db)) versions.set(db, readCacheVersion(db));
  return versions.get(db);
}

export async function bumpCacheVersion(db, { food = false } = {}) {
  versions.delete(db);
  if (food) {
    try { await db.prepare("INSERT INTO api_cache_versions(user_id,version,food) VALUES(?,0,1) ON CONFLICT(user_id) DO UPDATE SET food=food+1").bind(db.userId).run(); versions.delete(db); return; }
    catch { /* no food counter yet: the whole version below */ }
  }
  try { await db.prepare("INSERT INTO api_cache_versions(user_id,version) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1").bind(db.userId).run(); }
  catch { /* table not migrated yet: entries still expire with the TTL */ }
  versions.delete(db);
}

// Entries that never show food or drinks: a meal logged keeps them.
export const FOOD_FREE = /^(fitness|thresholds|curves|laps|coach-performance|intervals-wellness|activity-detail|training-calendar|milestones|share-milestones|main-sport):?/;
// The routes that change only food and drinks (entrypoint.js).
export const FOOD_WRITE = /^\/app\/api\/(fluids|water|food\/(entry|entries|log|personal|recipes|nutrients\/favorites|suggestions\/decide|report))(\/|$)/;
// A handler that saved nothing new says so, and nothing is made outdated.
export const UNCHANGED_HEADER = "X-Aurin-Unchanged";

function failedValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return value.status === "error" || value.degraded === true || Object.keys(value).length === 0;
}

async function entryUrl(env, key) {
  const scope = encodeURIComponent((env.ENVIRONMENT || 'production') + ':' + (env.USER_DATA_SHARD || 'legacy'));
  const { version, food } = await cacheVersion(env.DB);
  return "https://cache.internal/" + scope + "/" + env.DB.userId + "/" + (FOOD_FREE.test(key) ? version : version + "." + food) + "/" + encodeURIComponent(key);
}

// The kept entry of `key` under the current version, or null; computes nothing.
export async function cachedOnly(env, key, { store = globalThis.caches?.default } = {}) {
  if (!store || env.DB?.userId == null) return null;
  const hit = await store.match(await entryUrl(env, key)).catch(() => null);
  return hit ? hit.json().catch(() => null) : null;
}

// Keeps `value` as the entry of `key` under the current version for `ttl` seconds.
export async function keepCached(env, key, value, ttl = CACHE_TTL_SECONDS, { store = globalThis.caches?.default } = {}) {
  if (!store || env.DB?.userId == null) return;
  await store.put(await entryUrl(env, key), new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + ttl } })).catch(() => {});
}

// Drops the kept entry of `key` under the current version (this data center's
// copy): a sync that changed only today's running totals keeps the version
// and refreshes just the day's Google Health and Apple sums.
export async function forgetCached(env, key, { store = globalThis.caches?.default } = {}) {
  if (!store || env.DB?.userId == null) return;
  await store.delete(await entryUrl(env, key)).catch(() => {});
}

// The coach's inputs (some 100–250 database reads and 10–20 thousand rows) are
// asked by Today's coach cards and the day's activity at the same moment, and
// Cloudflare runs those requests in different copies of the server, where
// `computing` does not reach: after a sync each copy computed them on its own,
// all against the one user database (morning report 2026-11-10: 37 slow day's
// activities, D1 waits up to 11.7 s). For these entries a copy that starts
// computing leaves a mark in the data center's cache, and the others wait for
// its answer there instead of reading the database again.
const SHARED = /^coach-(inputs|performance):/;
const MARK_TTL_SECONDS = 30, MARK_SETTLE_MS = 40, SHARED_POLL_MS = 250, SHARED_WAIT_MS = 20000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const markUrl = url => url + "?computing";
async function markText(store, url) {
  const hit = await store.match(markUrl(url)).catch(() => null);
  return hit ? hit.text().catch(() => null) : null;
}
// True when this copy should compute: no other copy is at it. Two copies that
// both find no mark both leave theirs; the cache keeps the last, and after a
// moment only its owner goes on (the cache of one data center has no lock, so
// at worst both compute, as before).
async function takeMark(store, url) {
  if (await markText(store, url)) return false;
  const mine = crypto.randomUUID();
  await store.put(markUrl(url), new Response(mine, { headers: { "Cache-Control": "max-age=" + MARK_TTL_SECONDS } })).catch(() => {});
  await sleep(MARK_SETTLE_MS);
  const kept = await markText(store, url);
  return kept == null || kept === mine;
}
// The other copy's answer once it is kept, or null when its mark is gone without
// one (it failed) or the wait runs out: then this request computes it itself.
async function otherCopys(store, url) {
  const end = beginWait("shared"), until = Date.now() + SHARED_WAIT_MS;
  try {
    while (Date.now() < until) {
      await sleep(SHARED_POLL_MS);
      const hit = await store.match(url).catch(() => null);
      if (hit) return await hit.json().catch(() => null);
      if (!(await markText(store, url))) return null;
    }
    return null;
  } finally { end(); }
}

export async function cached(env, ctx, key, compute, { ttl = CACHE_TTL_SECONDS, store = globalThis.caches?.default } = {}) {
  if (!store || env.DB?.userId == null) return compute();
  const url = await entryUrl(env, key);
  const hit = await store.match(url).catch(() => null);
  if (hit) return hit.json();
  // Waiting for the one computing it: a copy, as from the cache, since callers change what they get.
  if (computing.has(url)) { const end = beginWait("shared"); return computing.get(url).then(value => structuredClone(value)).finally(end); }
  // owner: this copy left the mark and computes; borrowed: another copy's answer.
  const shared = SHARED.test(key), turn = { owner: false, borrowed: false };
  const pending = (async () => {
    if (shared) {
      turn.owner = await takeMark(store, url);
      if (!turn.owner) {
        const other = await otherCopys(store, url);
        if (other != null) { turn.borrowed = true; return other; }
      }
    }
    return compute();
  })();
  computing.set(url, pending);
  // The mark goes once the answer is kept, so a waiting copy finds one or the other;
  // after a failure at once, and the waiting copies compute it themselves.
  const unmark = () => turn.owner ? Promise.resolve(store.delete?.(markUrl(url))).catch(() => {}) : Promise.resolve();
  let value;
  try { value = await pending; } catch (error) { await unmark(); throw error; } finally { computing.delete(url); }
  // A failed read (an error answer, the {} callers fall back to, or an answer
  // marked degraded: part of it failed) is not kept: the next request asks
  // again instead of showing nothing for 10 minutes.
  if (failedValue(value)) { await unmark(); return value; }
  if (turn.borrowed) return value;
  const put = store.put(url, new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + ttl } })).catch(() => {}).then(unmark);
  if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  return value;
}
