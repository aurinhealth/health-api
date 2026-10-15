// Sdílet → Týden: one week (Monday to Sunday) for the share image, and the
// week before it for "Proti minulému". Per day the morning readiness, the
// main sport and the training time; for the week the training time, the
// number of sessions, the load, ride and run kilometres, the average night
// and the average readiness. Walks are not training here, as in the streak.
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { activityMeters } from "./app-milestones.js";
import { readinessFor, primaryNights } from "./readiness.js";

const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const round = (v, digits = 0) => (v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits);
const mean = list => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);

export const mondayOf = date => shift(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));

// The activities of the rows (every source, duplicates once) with their metres.
export function weekActivities(rows = []) {
  return dedupeActivities(rows.map(row => {
    const a = activityFromRow(row);
    if (a) a.meters = activityMeters(row);
    return a;
  })).filter(a => a.kind !== "walk");
}

function totals(days, activities, nights) {
  const inWeek = activities.filter(a => a.date >= days[0].date && a.date <= days[6].date);
  const km = kind => round(inWeek.filter(a => a.kind === kind).reduce((s, a) => s + (a.meters || 0), 0) / 1000, 1);
  const sleep = days.map(d => num(nights.get(d.date)?.durationMin)).filter(v => v > 0);
  const readiness = days.map(d => d.readiness).filter(v => v != null);
  return {
    minutes: round(days.reduce((s, d) => s + (d.minutes || 0), 0)),
    sessions: days.reduce((s, d) => s + d.sessions, 0),
    tss: round(inWeek.reduce((s, a) => s + (a.tss || 0), 0)),
    rideKm: km("ride"),
    runKm: km("run"),
    sleepMinutes: round(mean(sleep)),
    readiness: round(mean(readiness))
  };
}

function weekDays(monday, { today, activities, gymDays, scores }) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = shift(monday, i);
    const list = activities.filter(a => a.date === date);
    const gym = gymDays.includes(date) && !list.some(a => a.kind === "strength");
    const byKind = new Map();
    for (const a of list) byKind.set(a.kind, (byKind.get(a.kind) || 0) + (a.minutes || 0));
    if (gym) byKind.set("strength", byKind.get("strength") || 0);
    // The day's sport is the one it spent most time on.
    const sport = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const score = date <= today ? scores(date) : null;
    return {
      date,
      readiness: score?.score ?? null,
      zone: score?.zone ?? null,
      sport,
      minutes: round(list.reduce((s, a) => s + (a.minutes || 0), 0)),
      sessions: list.length + (gym ? 1 : 0),
      tss: round(list.reduce((s, a) => s + (a.tss || 0), 0))
    };
  });
}

// date: a day of the week to show; today: the user's local date (later days
// stay empty); rows: activity rows of health_datapoints from the Monday a
// week earlier on; gymDays: dates with gym sets logged; google / intervals /
// sessions / profile: what readiness.js reads (Today has the same).
export function buildShareWeek({ date, today, rows = [], gymDays = [], google = [], intervals = [], sessions = [], profile = null }) {
  const monday = mondayOf(date > today ? today : date);
  const activities = weekActivities(rows);
  const nights = primaryNights(sessions);
  const cache = new Map();
  const scores = day => {
    if (!cache.has(day)) {
      const r = readinessFor({ date: day, google, intervals, sessions, profile });
      cache.set(day, { score: r.score ?? null, zone: r.score == null ? null : r.zone || null });
    }
    return cache.get(day);
  };
  const days = weekDays(monday, { today, activities, gymDays, scores });
  const before = weekDays(shift(monday, -7), { today, activities, gymDays, scores });
  return { start: monday, end: shift(monday, 6), days, week: totals(days, activities, nights), previous: totals(before, activities, nights) };
}
