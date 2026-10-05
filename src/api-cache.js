// Short-lived cache of expensive per-user inputs (the coach's view of the day,
// FTP and zones) in the Workers Cache API, so the workout library answers in a
// moment instead of rebuilding three weeks of data on every click. A version
// per user, bumped by every change the user makes (sync, plan edit, feedback),
// makes older entries unreachable at once; the TTL covers data that arrives
// by itself (Intervals.icu, Google Health).

export const CACHE_TTL_SECONDS = 600;

export async function cacheVersion(db) {
  try { return (await db.prepare("SELECT version FROM api_cache_versions WHERE user_id=?").bind(db.userId).first())?.version || 0; }
  catch { return 0; }
}

export async function bumpCacheVersion(db) {
  try { await db.prepare("INSERT INTO api_cache_versions(user_id,version) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1").bind(db.userId).run(); }
  catch { /* table not migrated yet: entries still expire with the TTL */ }
}

export async function cached(env, ctx, key, compute, { ttl = CACHE_TTL_SECONDS, store = globalThis.caches?.default } = {}) {
  if (!store || env.DB?.userId == null) return compute();
  const url = "https://cache.internal/" + env.DB.userId + "/" + (await cacheVersion(env.DB)) + "/" + encodeURIComponent(key);
  const hit = await store.match(url).catch(() => null);
  if (hit) return hit.json();
  const value = await compute();
  const put = store.put(url, new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + ttl } })).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  return value;
}
