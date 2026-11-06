// Settings → Ikona aplikace: what unlocks the sport icons. Ride, run and swim
// kilometres, multisport days, gym sessions and the current run of active days since the
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

// Multisport: a triathlon, a duathlon or a brick, two different sports of
// ride, run and swim one right after the other (each starts at most 30
// minutes after the one before ended). Once a day, the day's longest such
// chain; its legs in the order they were done. activities: activityFromRow
// with `meters`, duplicates once.
const LEGS = new Set(["ride", "run", "swim"]);
const GAP = 30 * 60000;
const at = a => Date.parse(a.start + ":00Z");
export function multisportDays(activities = []) {
  const list = activities.filter(a => LEGS.has(a.kind) && a.start).sort((a, b) => a.start.localeCompare(b.start));
  const days = new Map();
  let chain = [];
  const close = () => {
    if (new Set(chain.map(a => a.kind)).size >= 2 && chain.length > (days.get(chain[0].date)?.legs.length || 0)) {
      days.set(chain[0].date, { date: chain[0].date, legs: chain.map(a => ({ kind: a.kind, minutes: a.minutes || 0, meters: a.meters || 0 })) });
    }
  };
  for (const a of list) {
    const last = chain[chain.length - 1];
    if (last && last.date === a.date && at(a) - (at(last) + (last.minutes || 0) * 60000) <= GAP) chain.push(a);
    else { close(); chain = [a]; }
  }
  close();
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
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
  return { runKm: km("run"), rideKm: km("ride"), swimKm: km("swim"), multisportDays: multisportDays(activities).length, gymSessions: gym.size, streakDays: streak };
}
