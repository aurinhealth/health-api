// Writes the app may send twice. The iOS app keeps a write it could not send
// (no signal) and sends it again later; when the first attempt did reach the
// server and only the answer got lost, the replay must not log the meal, the
// drink or the weigh-in a second time. Such a write carries the client's
// requestId (a UUID); the first answer is kept per user and returned again for
// a repeated id instead of running the write once more.
const ROUTES = new Set(["/app/api/food/log", "/app/api/fluids", "/app/api/weight"]);
const VALID_ID = /^[A-Za-z0-9_-]{10,80}$/;
// Kept long enough for a phone that was offline for a week or two.
const KEEP_DAYS = 30;
const MAX_BODY = 16000;

// The scoped database runs a CREATE ... IF NOT EXISTS once per database.
async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS client_requests (
    user_id INTEGER NOT NULL,
    route TEXT NOT NULL,
    request_id TEXT NOT NULL,
    status INTEGER,
    body TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, route, request_id)
  )`).run();
}

export function idempotentRoute(request, url) {
  return request.method === "POST" && ROUTES.has(url.pathname);
}

// The client's requestId of a write, or null when it has none (or a bad one).
export function requestIdOf(body) {
  const id = String(body?.requestId ?? "");
  return VALID_ID.test(id) ? id : null;
}

// Runs handler(request) once per (user, route, requestId). A repeated id gets
// the first successful answer back; a failed first attempt is forgotten, so
// the same id can be retried. A repeat that arrives while the first one still
// runs gets a plain ok (the first one is doing the write).
export async function withIdempotency(request, env, url, handler) {
  if (!env?.DB || !idempotentRoute(request, url)) return handler(request);
  let id = null;
  try { id = requestIdOf(JSON.parse(await request.clone().text())); } catch { id = null; }
  if (!id) return handler(request);
  const db = env.DB, user = Number(env.USER_ID ?? db.userId), route = url.pathname;
  await ensure(db);
  const claim = await db.prepare("INSERT INTO client_requests(user_id,route,request_id) VALUES(?,?,?) ON CONFLICT(user_id,route,request_id) DO NOTHING").bind(user, route, id).run();
  if (!claim?.meta?.changes) {
    const seen = await db.prepare("SELECT status,body,created_at < datetime('now','-2 minutes') AS stale FROM client_requests WHERE user_id=? AND route=? AND request_id=?").bind(user, route, id).first();
    // A first attempt that never finished (the Worker was stopped) does not block the id.
    if (seen && !seen.status && seen.stale) {
      await db.prepare("DELETE FROM client_requests WHERE user_id=? AND route=? AND request_id=?").bind(user, route, id).run();
      return withIdempotency(request, env, url, handler);
    }
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Idempotent-Replay": "1" };
    if (seen?.status) return new Response(seen.body || "{}", { status: Number(seen.status), headers });
    return new Response(JSON.stringify({ status: "ok", duplicate: true }), { status: 200, headers });
  }
  const forget = () => db.prepare("DELETE FROM client_requests WHERE user_id=? AND route=? AND request_id=?").bind(user, route, id).run().catch(() => {});
  let response;
  try { response = await handler(request); } catch (error) { await forget(); throw error; }
  if (!response.ok) { await forget(); return response; }
  const text = await response.clone().text().catch(() => "");
  await db.prepare("UPDATE client_requests SET status=?,body=? WHERE user_id=? AND route=? AND request_id=?")
    .bind(response.status, text.length <= MAX_BODY ? text : JSON.stringify({ status: "ok" }), user, route, id).run();
  // Old ids go now and then, one user's at a time.
  if (Math.random() < 0.05) await db.prepare("DELETE FROM client_requests WHERE user_id=? AND created_at < datetime('now', ?)").bind(user, `-${KEEP_DAYS} days`).run().catch(() => {});
  return response;
}
