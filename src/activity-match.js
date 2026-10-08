// One workout recorded by two sources: an Intervals.icu activity (or one made
// in the app) and a Google Health exercise from the watch. They are compared as
// instants: Intervals.icu stores the local start (start_date_local) next to
// the UTC one (start_date), Google Health stores UTC. Every place that keeps
// one of the two uses sameSession(), and the sync marks the copy as
// record_role='duplicate' (index.js matchActivities), so queries can skip it.
import { zonedTime, localDateTime } from "./user-time.js";

export function activityKindOf(type) {
  const t = String(type || "").toLowerCase();
  if (/weight|strength/.test(t)) return "strength";
  if (/ride|cycl|bik/.test(t)) return "ride";
  if (/run/.test(t)) return "run";
  if (/walk|hike/.test(t)) return "walk";
  if (/swim/.test(t)) return "swim";
  return "other";
}

const ZONED = /(Z|[+-]\d{2}:?\d{2})$/;
const seconds = v => { const n = Number(String(v ?? "").replace(/s$/i, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const parse = json => { if (json && typeof json === "object") return json; try { return JSON.parse(json || "{}"); } catch { return {}; } };

// A row of health_datapoints (or {source, start, end, type, minutes}) as
// {at, alt, kind, minutes, stub, source}. `at` is the start instant (ms).
// Intervals.icu shows Strava activities only as a stub without length and UTC
// time, and their "local" time is the UTC one: `alt` reads it so.
// Read once per row: matching compares every Google exercise with every
// activity, and parsing the JSON on each comparison took most of a second.
const sessions = new WeakMap();
export function sessionOf(row) {
  if (!row) return null;
  if (row.session !== undefined) return row.session;
  if (typeof row !== "object") return readSession(row);
  if (!sessions.has(row)) sessions.set(row, readSession(row));
  return sessions.get(row);
}
function readSession(row) {
  const p = parse(row.payload_json ?? row.payload);
  const google = row.source_family === "google-wearables" || row.source === "google" || row.source === "google-health" || Boolean(p.exercise);
  if (google) {
    const ex = p.exercise || {}, start = row.start_time || row.start || ex.interval?.startTime, end = row.end_time || row.end || ex.interval?.endTime;
    const at = zonedTime(start), span = (zonedTime(end) - at) / 60000;
    if (!Number.isFinite(at)) return null;
    return { at, alt: null, kind: activityKindOf(ex.exerciseType || row.type), minutes: span > 0 ? span : seconds(ex.activeDuration) / 60 || row.minutes || null, stub: false, source: "google" };
  }
  const utc = ZONED.test(String(p.start_date || "")) ? p.start_date : null;
  const local = p.start_date_local || row.start_time || row.start || null;
  const at = utc ? Date.parse(utc) : zonedTime(local);
  if (!Number.isFinite(at)) return null;
  const type = p.type || p.category || row.type || null;
  const elapsed = seconds(p.elapsed_time) ?? seconds(p.moving_time);
  const stub = !elapsed && !utc;
  return { at, alt: (stub || /strava/i.test(String(p.source || ""))) && !utc && !ZONED.test(String(local)) ? Date.parse(String(local) + "Z") : null, kind: type ? activityKindOf(type) : null, minutes: elapsed ? elapsed / 60 : row.minutes || row.durationHours * 60 || null, stub, source: "intervals" };
}

const START_WINDOW = 20 * 60000, STUB_WINDOW = 2 * 60000;
// How far apart (ms) the two starts are when they can be one workout; null when not.
export function sessionGap(x, y) {
  const a = sessionOf(x), b = sessionOf(y);
  if (!a || !b) return null;
  // Different sports are different workouts; an untyped stub or "other" may be anything.
  if (a.kind && b.kind && a.kind !== b.kind && a.kind !== "other" && b.kind !== "other") return null;
  if (a.minutes > 0 && b.minutes > 0 && Math.abs(a.minutes - b.minutes) / Math.max(a.minutes, b.minutes) > 0.25) return null;
  const gaps = [Math.abs(a.at - b.at)].filter(g => g <= START_WINDOW);
  for (const [s, t] of [[a, b], [b, a]]) if (s.alt != null && t.alt == null && Math.abs(s.alt - t.at) <= STUB_WINDOW) gaps.push(Math.abs(s.alt - t.at));
  return gaps.length ? Math.min(...gaps) : null;
}
// A watch session inside a longer activity is part of it: Google Health splits
// a long ride into "cardio" pieces of 15–45 minutes.
const MARGIN = 5 * 60000;
export function coversSession(outer, inner) {
  const o = sessionOf(outer), g = sessionOf(inner);
  if (!o || !g || o.source === "google" || g.source !== "google" || !(o.minutes > 0) || !(g.minutes > 0)) return false;
  if (g.kind !== "other" && g.kind !== o.kind) return false;
  return g.at >= o.at - MARGIN && g.at + g.minutes * 60000 <= o.at + o.minutes * 60000 + MARGIN;
}
export const sameSession = (x, y) => sessionGap(x, y) != null || coversSession(x, y) || coversSession(y, x);

// Which of the two records to keep: a full Intervals.icu activity, then the
// watch's Google exercise, then an Intervals.icu stub.
export function richerSession(x, y) {
  const rank = r => { const s = sessionOf(r); return !s ? 9 : s.source === "intervals" && !s.stub ? 0 : s.source === "google" ? 1 : 2; };
  return rank(y) < rank(x) ? y : x;
}

// Pairs each Google exercise with at most one Intervals.icu/app activity,
// the nearest start first; a Google piece inside a longer activity goes with
// it too (inside: true). Returns [{keep, drop, inside}] of the given rows.
export function pairSessions(rows) {
  const google = [], other = [];
  for (const row of rows) { const s = sessionOf(row); if (s) (s.source === "google" ? google : other).push(row); }
  const candidates = [];
  for (const g of google) for (const o of other) { const gap = sessionGap(g, o); if (gap != null) candidates.push({ g, o, gap }); }
  const used = new Set(), pairs = [];
  for (const c of candidates.sort((a, b) => a.gap - b.gap)) {
    if (used.has(c.g) || used.has(c.o)) continue;
    used.add(c.g); used.add(c.o);
    const keep = richerSession(c.o, c.g);
    pairs.push({ keep, drop: keep === c.o ? c.g : c.o, inside: false });
  }
  for (const g of google) {
    if (used.has(g)) continue;
    const outer = other.find(o => coversSession(o, g));
    if (outer) pairs.push({ keep: outer, drop: g, inside: true });
  }
  return pairs;
}

// The user's local start "YYYY-MM-DDTHH:MM" of a session.
export const sessionLocalStart = row => { const s = sessionOf(row); return s ? localDateTime(new Date(s.at).toISOString()) : null; };
