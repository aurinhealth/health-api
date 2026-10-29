// Short-lived cache of expensive per-user inputs (the coach's view of the day,
// FTP and zones) in the Workers Cache API, so the workout library answers in a
// moment instead of rebuilding three weeks of data on every click. A version
// per user, bumped by every change the user makes (sync, plan edit, feedback),
// makes older entries unreachable at once; the TTL covers data that arrives
// by itself (Intervals.icu, Google Health).

export const CACHE_TTL_SECONDS = 600;
// The same entry being computed in this isolate: Today's coach cards ask for
// the same coach inputs at the same moment, and each used to compute them
// (some 400 database reads each) before the first one was kept.
const computing = new Map();

export async function cacheVersion(db) {
  try { return (await db.prepare("SELECT version FROM api_cache_versions WHERE user_id=?").bind(db.userId).first())?.version || 0; }
  catch { return 0; }
}

export async function bumpCacheVersion(db) {
  try { await db.prepare("INSERT INTO api_cache_versions(user_id,version) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1").bind(db.userId).run(); }
  catch { /* table not migrated yet: entries still expire with the TTL */ }
}

function failedValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return value.status === "error" || value.degraded === true || Object.keys(value).length === 0;
}

export async function cached(env, ctx, key, compute, { ttl = CACHE_TTL_SECONDS, store = globalThis.caches?.default } = {}) {
  if (!store || env.DB?.userId == null) return compute();
  const scope = encodeURIComponent((env.ENVIRONMENT || 'production') + ':' + (env.USER_DATA_SHARD || 'legacy'));
  const url = "https://cache.internal/" + scope + "/" + env.DB.userId + "/" + (await cacheVersion(env.DB)) + "/" + encodeURIComponent(key);
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
