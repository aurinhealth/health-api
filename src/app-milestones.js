// Settings → Ikona aplikace: what unlocks the sport icons. Run and ride
// kilometres, gym sessions and the current run of active days since the
// account was made in Aurin (history synced from before does not count),
// from the activities the app holds (every source, duplicates once) and the
// gym plans with sets logged.
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";

const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

// Metres of one health_datapoints activity: Intervals.icu/app payloads carry
// `distance`, Google and Apple exercises a metricsSummary.
export function activityMeters(row) {
  let p = {};
  try { p = JSON.parse(row.payload_json || "{}"); } catch { p = {}; }
  const m = p.exercise?.metricsSummary;
  if (m) return num(m.distanceMeters) ?? (num(m.distanceMillimeters) != null ? m.distanceMillimeters / 1000 : null) ?? 0;
  return num(p.distance) ?? num(p.icu_distance) ?? 0;
}

// rows: health_datapoints activities; gymDays: dates with a gym plan whose
// sets were logged; today: the user's local date; since: the day the account
// was made (YYYY-MM-DD), nothing before it counts.
export function buildMilestones({ rows = [], gymDays = [], today, since = "" }) {
  const activities = dedupeActivities(rows.map(row => {
    const a = activityFromRow(row);
    if (a) a.meters = activityMeters(row);
    return a;
  })).filter(a => a.date >= since);
  gymDays = gymDays.filter(d => d >= since);
  const km = kind => Math.round(activities.filter(a => a.kind === kind).reduce((s, a) => s + (a.meters || 0), 0) / 1000);
  const gym = new Set([...activities.filter(a => a.kind === "strength").map(a => a.date), ...gymDays]);
  // Walks alone do not keep the run going (as the coach's streak).
  const active = new Set([...activities.filter(a => a.kind !== "walk").map(a => a.date), ...gymDays]);
  let day = active.has(today) ? today : shift(today, -1), streak = 0;
  while (active.has(day)) { streak++; day = shift(day, -1); }
  return { runKm: km("run"), rideKm: km("ride"), gymSessions: gym.size, streakDays: streak };
}
