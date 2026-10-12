// Limits on requests nobody is signed in for (asking for a sign-in code, a
// passkey challenge), counted in D1 so every isolate sees the same numbers:
// per caller, under a keyed hash of its address (CF-Connecting-IP), and as
// global budgets ("so many e-mails a day"). One row per key holds the current
// minute, hour and day with their counts; a request is claimed before it is
// served, so two parallel requests never both pass the last slot.
import { signText } from "./dashboard-auth.js";

const STALE_SECONDS = 2 * 24 * 60 * 60;
const ready = new WeakSet();

async function ensureTable(db) {
  if (ready.has(db)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, minute TEXT NOT NULL, minute_count INTEGER NOT NULL DEFAULT 0, hour TEXT NOT NULL, hour_count INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL, day_count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)").run();
  ready.add(db);
}

// The caller's key: a keyed hash of the address, so the table never holds
// addresses. Requests without the header (not from Cloudflare) share one key.
export async function clientKey(request, secret) {
  const ip = String(request.headers.get("CF-Connecting-IP") || "").trim() || "none";
  return "ip:" + (await signText("ip:" + ip, String(secret || ""))).slice(0, 32);
}

// Claims one request for `key` under the given limits ({ minute, hour, day },
// missing ones unlimited). Returns true when it is allowed.
export async function allowRequest(db, key, limits = {}, now = Date.now()) {
  await ensureTable(db);
  const time = new Date(now).toISOString(), seconds = Math.floor(now / 1000);
  const cap = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : Number.MAX_SAFE_INTEGER;
  const claimed = await db.prepare(`INSERT INTO request_limits(key, minute, minute_count, hour, hour_count, day, day_count, updated_at) VALUES(?, ?, 1, ?, 1, ?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      minute_count = CASE WHEN minute = excluded.minute THEN minute_count + 1 ELSE 1 END, minute = excluded.minute,
      hour_count = CASE WHEN hour = excluded.hour THEN hour_count + 1 ELSE 1 END, hour = excluded.hour,
      day_count = CASE WHEN day = excluded.day THEN day_count + 1 ELSE 1 END, day = excluded.day,
      updated_at = excluded.updated_at
    WHERE (request_limits.minute IS NOT excluded.minute OR request_limits.minute_count < ?)
      AND (request_limits.hour IS NOT excluded.hour OR request_limits.hour_count < ?)
      AND (request_limits.day IS NOT excluded.day OR request_limits.day_count < ?)`)
    .bind(key, time.slice(0, 16), time.slice(0, 13), time.slice(0, 10), seconds, cap(limits.minute), cap(limits.hour), cap(limits.day)).run();
  const allowed = Number(claimed.meta?.changes) > 0;
  if (allowed) await db.prepare("DELETE FROM request_limits WHERE updated_at < ?").bind(seconds - STALE_SECONDS).run().catch(() => {});
  return allowed;
}

// What one caller may start per minute and per hour (sign-in codes, passkey challenges).
export const CLIENT_LIMITS = { minute: 5, hour: 30 };
export async function allowClient(db, request, secret, scope, now = Date.now()) {
  return allowRequest(db, scope + ":" + await clientKey(request, secret), CLIENT_LIMITS, now);
}
