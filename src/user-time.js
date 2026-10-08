// The user's own time zone: when their day starts, which day a meal, a night or
// a workout belongs to, when the daily AI limit resets. The app sends the
// browser's zone with every request (X-Time-Zone) and the server remembers it
// per user, so cron jobs use it too. Accounts that never sent one stay on
// Europe/Prague, where the app started.
//
// Like the language (lang.js), the zone is held for the duration of a request
// or a per-user job, so date helpers deep in the code need no parameter.
import { AsyncLocalStorage } from "node:async_hooks";
import { dateFormat } from "./date-format.js";

export const DEFAULT_TIME_ZONE = "Europe/Prague";
const current = new AsyncLocalStorage();

// An IANA zone name the runtime knows ("Europe/Prague", "America/New_York"), or null.
export function validTimeZone(value) {
  const zone = String(value || "").trim();
  if (!zone || zone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(zone)) return null;
  try { dateFormat("en-GB", { timeZone: zone }); return zone; } catch { return null; }
}
export const timeZone = () => current.getStore() || DEFAULT_TIME_ZONE;
export function withTimeZone(value, fn) { return current.run(validTimeZone(value) || DEFAULT_TIME_ZONE, fn); }

const ZONED = /(Z|[+-]\d{2}:?\d{2})$/;
const parts = (at, options) => Object.fromEntries(dateFormat("en-GB", { timeZone: timeZone(), hourCycle: "h23", ...options }).formatToParts(at).map(x => [x.type, x.value]));
const FULL = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" };

// Wall-clock time "YYYY-MM-DDTHH:MM:SS" in the user's zone of an instant.
function wallClock(at) {
  const p = parts(at, FULL);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

// Today's date in the user's zone ("2026-10-05"). Between midnight and the
// zone's offset the UTC date is still yesterday (or already tomorrow).
export function localToday(at = new Date()) { return wallClock(at).slice(0, 10); }
// The hour (0–23) in the user's zone.
export function localHour(at = new Date()) { return Number(parts(at, { hour: "2-digit" }).hour); }
// The user's wall-clock time "YYYY-MM-DD HH:MM" (the assistant's "now").
export function localNow(at = new Date()) { return wallClock(at).slice(0, 16).replace("T", " "); }

// "YYYY-MM-DDTHH:MM" in the user's zone. A time with a zone (Google, UTC) is
// converted; a time without one (Intervals.icu start_date_local) is already local.
export function localDateTime(value) {
  const s = String(value || "");
  if (!ZONED.test(s)) return s.slice(0, 16);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 16) : wallClock(d).slice(0, 16);
}
// The user's day ("YYYY-MM-DD") of a time, a date stays as it is.
export function localDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : wallClock(value).slice(0, 10);
  const s = String(value || "");
  if (!s) return null;
  return localDateTime(s).slice(0, 10) || null;
}

// The user's zone offset in milliseconds at an instant (+2 h in Prague in summer).
export function zoneOffsetMs(at) {
  const ms = at instanceof Date ? at.getTime() : Number(at);
  return Date.parse(wallClock(new Date(ms)) + "Z") - Math.floor(ms / 1000) * 1000;
}
// An instant as the user's wall-clock time with its offset,
// {at: "2026-01-05T12:00:00+01:00", offsetSeconds: 3600}, as Google Health takes it.
export function zonedIso(at = new Date()) {
  const d = at instanceof Date ? at : new Date(at), offsetSeconds = Math.round(zoneOffsetMs(d) / 1000), a = Math.abs(offsetSeconds);
  const offset = (offsetSeconds < 0 ? "-" : "+") + String(Math.floor(a / 3600)).padStart(2, "0") + ":" + String(Math.floor(a % 3600 / 60)).padStart(2, "0");
  return { at: wallClock(d) + offset, offsetSeconds };
}
// Noon of the user's day, for a value that belongs to a day but has no time (a weigh-in).
export const localNoon = date => zonedIso(new Date(zonedTime(String(date).slice(0, 10) + "T12:00:00")));

// The instant (ms) of a wall-clock time "YYYY-MM-DDTHH:MM[:SS]" in the user's
// zone; a time with a zone is read as it is.
export function zonedTime(value) {
  const s = String(value || "");
  if (!s) return NaN;
  if (ZONED.test(s)) return Date.parse(s);
  const asUtc = Date.parse(s.length === 10 ? s + "T00:00:00Z" : s + "Z");
  if (!Number.isFinite(asUtc)) return NaN;
  // The offset at the guess, then at the result (they differ only around a DST change).
  const first = asUtc - zoneOffsetMs(asUtc);
  return asUtc - zoneOffsetMs(first);
}
// Midnight of the user's day as a UTC time "YYYY-MM-DDTHH:MM:SS", the bound for
// rows stored in UTC (Google Health). Compares as text with "…Z" times.
export function dayStartUtc(date) {
  const ms = zonedTime(String(date).slice(0, 10) + "T00:00:00");
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 19) : String(date).slice(0, 10) + "T00:00:00";
}

// ---- The remembered zone of each user (migrations/0012_user_time_zone.sql) ----
const known = new Map();
// fresh skips this isolate's memory (cron jobs: the zone may have changed in another isolate).
export async function storedTimeZone(db, userId, { fresh = false } = {}) {
  if (!db || userId == null) return DEFAULT_TIME_ZONE;
  if (!fresh && known.has(userId)) return known.get(userId);
  try {
    const row = await db.prepare("SELECT time_zone FROM user_time_zone WHERE user_id=?").bind(userId).first();
    const zone = validTimeZone(row?.time_zone) || DEFAULT_TIME_ZONE;
    known.set(userId, zone);
    return zone;
  } catch { return DEFAULT_TIME_ZONE; }
}
// Saves the zone a request came with when it changed; one write per change.
export async function rememberTimeZone(db, userId, value) {
  const zone = validTimeZone(value);
  if (!db || userId == null || !zone) return;
  if (known.get(userId) === zone) return;
  if (await storedTimeZone(db, userId) === zone) return;
  try {
    await db.prepare("INSERT INTO user_time_zone(user_id,time_zone,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET time_zone=excluded.time_zone,updated_at=CURRENT_TIMESTAMP").bind(userId, zone).run();
    known.set(userId, zone);
  } catch { /* remembered on the next request */ }
}
export function _resetTimeZonesForTest() { known.clear(); }
