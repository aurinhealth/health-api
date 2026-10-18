// Limits on requests nobody is signed in for (asking for a sign-in code, a
// passkey challenge), counted in D1 so every isolate sees the same numbers:
// per caller, under a keyed hash of its address (CF-Connecting-IP; an IPv6
// caller is its /64), and as global budgets ("so many e-mails a day"). One
// row per key holds the current minute, hour and day with their counts; a
// request is claimed before it is served, so two parallel requests never both
// pass the last slot.
import { signText } from "./dashboard-auth.js";

const STALE_SECONDS = 2 * 24 * 60 * 60;
const ready = new WeakSet();

async function ensureTable(db) {
  if (ready.has(db)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, minute TEXT NOT NULL, minute_count INTEGER NOT NULL DEFAULT 0, hour TEXT NOT NULL, hour_count INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL, day_count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)").run();
  ready.add(db);
}

// The caller's key: a keyed hash of its network (callerNetwork), so the table
// never holds addresses. Requests without the header (not from Cloudflare)
// share one key.
export async function clientKey(request, secret) {
  return "ip:" + (await signText("ip:" + callerNetwork(request.headers.get("CF-Connecting-IP")), String(secret || ""))).slice(0, 32);
}

// Who counts as one caller: an IPv4 address, or a whole IPv6 /64, the
// smallest block a provider hands out, so stepping through the addresses of
// one network does not make a new caller each time. IPv4-mapped IPv6
// addresses are their IPv4 address; text that is no address is kept as it came.
export function callerNetwork(value) {
  const ip = String(value || "").trim().toLowerCase().replace(/%.*$/, "");
  if (!ip) return "none";
  if (!ip.includes(":")) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  if (groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff) return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".");
  return groups.slice(0, 4).map(group => group.toString(16)).join(":") + "::/64";
}

// The eight 16-bit groups of an IPv6 address, or null when it is none.
function ipv6Groups(ip) {
  let text = ip;
  // An IPv4 address at the end ("::ffff:203.0.113.5") is the last two groups.
  const v4 = /:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const bytes = v4.slice(1).map(Number);
    if (bytes.some(byte => byte > 255)) return null;
    text = text.slice(0, v4.index + 1) + ((bytes[0] << 8) | bytes[1]).toString(16) + ":" + ((bytes[2] << 8) | bytes[3]).toString(16);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [], tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 ? head.length !== 8 : head.length + tail.length > 7) return null;
  const groups = [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
  return groups.every(group => /^[0-9a-f]{1,4}$/.test(group)) ? groups.map(group => parseInt(group, 16)) : null;
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

// What one caller may start per minute and per hour (sign-in codes, passkey
// challenges), unless the route gives its own limits.
export const CLIENT_LIMITS = { minute: 5, hour: 30 };
export async function allowClient(db, request, secret, scope, now = Date.now(), limits = CLIENT_LIMITS) {
  return allowRequest(db, scope + ":" + await clientKey(request, secret), limits, now);
}
