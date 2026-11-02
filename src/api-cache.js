// Short-lived cache of expensive per-user inputs (the coach's view of the day,
// FTP and zones) in the Workers Cache API, so the workout library answers in a
// moment instead of rebuilding three weeks of data on every click. A version
// per user, bumped by every change the user makes (sync, plan edit, feedback),
// makes older entries unreachable at once; the TTL covers data that arrives
// by itself (Intervals.icu, Google Health).

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
export const FOOD_FREE = /^(fitness|thresholds|curves|laps|intervals-wellness|activity-detail|training-calendar|milestones|share-milestones|main-sport):?/;
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

export async function cached(env, ctx, key, compute, { ttl = CACHE_TTL_SECONDS, store = globalThis.caches?.default } = {}) {
  if (!store || env.DB?.userId == null) return compute();
  const url = await entryUrl(env, key);
  const hit = await store.match(url).catch(() => null);
  if (hit) return hit.json();
  // Waiting for the one computing it: a copy, as from the cache, since callers change what they get.
  if (computing.has(url)) return computing.get(url).then(value => structuredClone(value));
  const pending = compute();
  computing.set(url, pending);
  let value;
  try { value = await pending; } finally { computing.delete(url); }
  // A failed read (an error answer, the {} callers fall back to, or an answer
  // marked degraded: part of it failed) is not kept: the next request asks
  // again instead of showing nothing for 10 minutes.
  if (failedValue(value)) return value;
  const put = store.put(url, new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + ttl } })).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  return value;
}
