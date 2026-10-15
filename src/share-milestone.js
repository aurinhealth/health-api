// Sdílet → Milník: what the athlete has reached since joining Aurin, as the
// app icons count it (app-milestones.js): ride and run kilometres, gym
// sessions and days in a row, each at the last round number crossed, with
// the sessions behind it for the poster's bars and the way there; and a new
// power record from Intervals.icu (the last 30 days against the year before).
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { activityMeters } from "./app-milestones.js";

const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const round = (v, digits = 0) => (v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

export const KM_STEPS = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 25000, 30000, 40000, 50000];
export const GYM_STEPS = [5, 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
export const STREAK_STEPS = [3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 100, 150, 200, 300, 365];
const BARS = 60;

/** The highest step at or below `value`, null below the first. */
export const reachedStep = (steps, value) => steps.filter(s => s <= value).pop() ?? null;

// Metres climbed in one activity row (Intervals.icu, the app, Apple or Google).
export function activityClimb(row) {
  let p = {};
  try { p = JSON.parse(row.payload_json || "{}"); } catch { p = {}; }
  const m = p.exercise?.metricsSummary;
  if (m) return num(m.elevationGainMeters) ?? (num(m.elevationGainMillimeters) != null ? m.elevationGainMillimeters / 1000 : null) ?? 0;
  return num(p.total_elevation_gain) ?? num(p.elevationGainMeters) ?? 0;
}

function distanceItem(key, list, since) {
  const total = list.reduce((s, a) => s + a.meters, 0) / 1000;
  const value = reachedStep(KM_STEPS, total);
  if (!value) return null;
  let sum = 0, reachedOn = null;
  for (const a of list) { sum += a.meters / 1000; if (!reachedOn && sum >= value) reachedOn = a.date; }
  return {
    key, value, unit: "km", total: round(total, 1), since, reachedOn,
    sessions: list.length,
    minutes: round(list.reduce((s, a) => s + (a.minutes || 0), 0)),
    elevation: round(list.reduce((s, a) => s + (a.climb || 0), 0)),
    // One bar per session (the last 60), kilometres.
    bars: list.slice(-BARS).map(a => ({ date: a.date, value: round(a.meters / 1000, 1) })),
    // How far the sessions before the bars got, so the way there adds up.
    start: round(list.slice(0, -BARS).reduce((s, a) => s + a.meters, 0) / 1000, 1)
  };
}

// rows: activity rows of health_datapoints; gymDays: dates with gym sets
// logged; today: the user's local date; since: the day the account was made.
export function buildShareMilestones({ rows = [], gymDays = [], today, since = "" }) {
  const activities = dedupeActivities(rows.map(row => {
    const a = activityFromRow(row);
    if (a) { a.meters = activityMeters(row); a.climb = activityClimb(row); }
    return a;
  })).filter(a => a.date >= since && a.date <= today);
  const items = [];
  for (const kind of ["ride", "run"]) {
    const item = distanceItem(kind, activities.filter(a => a.kind === kind && a.meters > 0), since);
    if (item) items.push(item);
  }

  // Gym: a strength activity or a plan with sets logged, once a day.
  const gymMinutes = new Map();
  for (const d of gymDays.filter(d => d >= since && d <= today)) gymMinutes.set(d, gymMinutes.get(d) || 0);
  for (const a of activities.filter(a => a.kind === "strength")) gymMinutes.set(a.date, (gymMinutes.get(a.date) || 0) + (a.minutes || 0));
  const gymList = [...gymMinutes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const gymValue = reachedStep(GYM_STEPS, gymList.length);
  if (gymValue) {
    items.push({
      key: "gym", value: gymValue, unit: "", total: gymList.length, since, reachedOn: gymList[gymValue - 1][0],
      sessions: gymList.length, minutes: round(gymList.reduce((s, [, m]) => s + m, 0)), elevation: null,
      bars: gymList.slice(-BARS).map(([date, minutes]) => ({ date, value: round(minutes) })), start: 0
    });
  }

  // Days in a row with training (walks alone do not count), ending today or yesterday.
  const perDay = new Map();
  for (const a of activities.filter(a => a.kind !== "walk")) perDay.set(a.date, (perDay.get(a.date) || 0) + (a.minutes || 0));
  for (const [d, m] of gymMinutes) perDay.set(d, Math.max(perDay.get(d) || 0, m));
  let day = perDay.has(today) ? today : shift(today, -1);
  const streak = [];
  while (perDay.has(day)) { streak.unshift(day); day = shift(day, -1); }
  const streakValue = reachedStep(STREAK_STEPS, streak.length);
  if (streakValue) {
    items.push({
      key: "streak", value: streakValue, unit: "", total: streak.length, since: streak[0], reachedOn: streak[streakValue - 1],
      sessions: streak.reduce((s, d) => s + activities.filter(a => a.date === d && a.kind !== "walk").length, 0) || streak.length,
      minutes: round(streak.reduce((s, d) => s + (perDay.get(d) || 0), 0)), elevation: null,
      bars: streak.slice(-BARS).map(date => ({ date, value: round(perDay.get(date) || 0) })), start: 0
    });
  }
  // The newest first: the default of the share sheet.
  items.sort((a, b) => String(b.reachedOn).localeCompare(String(a.reachedOn)));
  return { since, today, items };
}

// ---- Power record ------------------------------------------------------------
// Intervals.icu power curves: the last 30 days against the year before them.
// A duration whose 30-day best beats the older best is a new record; the one
// with the biggest gain is shown. Without one, the 20 minutes stay as the
// month's best (isNew false). Null without both curves.
export const RECORD_SECONDS = [5, 60, 300, 1200, 3600];
const CURVE_SECONDS = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

function curveOf(body) {
  const curve = (Array.isArray(body?.list) ? body.list : [])[0];
  const watts = Array.isArray(curve?.values) ? curve.values : curve?.watts;
  if (!curve || !Array.isArray(curve.secs) || !Array.isArray(watts)) return null;
  const at = s => { const i = curve.secs.indexOf(s); return i >= 0 ? num(watts[i]) : null; };
  return at;
}

export function powerRecord(recentBody, beforeBody) {
  const recent = curveOf(recentBody), before = curveOf(beforeBody);
  if (!recent || !before) return null;
  const gains = RECORD_SECONDS.map(seconds => ({ seconds, watts: recent(seconds), previous: before(seconds) }))
    .filter(r => r.watts && r.previous);
  if (!gains.length) return null;
  const best = gains.filter(r => r.watts > r.previous).sort((a, b) => b.watts / b.previous - a.watts / a.previous)[0];
  const shown = best || gains.find(r => r.seconds === 1200) || gains[0];
  const points = at => CURVE_SECONDS.map(seconds => ({ seconds, watts: round(at(seconds)) })).filter(p => p.watts);
  return { isNew: !!best, seconds: shown.seconds, watts: round(shown.watts), previous: round(shown.previous), curve: points(recent), previousCurve: points(before) };
}

// The two curve ids for Intervals.icu: the last 30 days, and the year before them.
export const recordCurves = today => ["30d", "r." + shift(today, -395) + "." + shift(today, -31)];

/** The power record from Intervals.icu; null without it or when it doesn't answer. */
export async function intervalsRecord(env, authorization, today, fetchImpl = fetch) {
  if (!env.INTERVALS_API_KEY) return null;
  const get = id => fetchImpl("https://intervals.icu/api/v1/athlete/0/power-curves?type=Ride&curves=" + id, { headers: { Authorization: authorization, Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
  const [recent, before] = await Promise.all(recordCurves(today).map(get));
  return powerRecord(recent, before);
}
