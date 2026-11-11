// The day strip and the month calendar of Today, Health and Food: the
// readiness, the night against its need, the day's strain and HRV against its
// usual range for each day of a range, the same way Today shows one day.
// Pure: GET /app/api/days loads the inputs (the 91 days of Google/Apple daily
// rows up to the range's end, Intervals.icu wellness and the nights).

import { readinessFor, readinessRows, primaryNights } from "./readiness.js";
import { dayStrainParts } from "./recovery-model.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

// At most six weeks a call: a month grid, or the strip's weeks around a day.
export const DAYS_MAX = 42;

// Days from start to end (today at most), oldest first. `checkin` is today's
// morning answer, which lowers today's number as on Today. A past day's strain
// counts its heart-rate zones and steps; a workout without heart rate adds
// its load only on Today (the done sessions are not loaded here).
export function buildDays({ start, end, today, google = [], intervals = [], sessions = [], profile = null, checkin = null }) {
  const last = end > today ? today : end;
  const rows = readinessRows(google, (intervals || []).filter(r => r?.id <= last), last);
  const list = Array.isArray(sessions) ? sessions : [];
  const nights = primaryNights(list);
  const days = [];
  for (let date = start; date <= last && days.length < DAYS_MAX; date = shift(date, 1)) {
    const r = readinessFor({ date, rows, sessions: list, profile, checkin: date === today ? checkin : null });
    const night = nights.get(date) || null, need = num(r.need?.need);
    const row = (google || []).find(g => g?.id === date) || {};
    const strain = dayStrainParts({ zoneMinutes: row.hrZoneMinutes, steps: num(row.steps) }).score;
    const hrv = r.components?.hrv;
    days.push({
      date,
      readiness: r.score == null ? null : { score: r.score, zone: r.zone || null },
      sleep: night && need > 0 ? { minutes: Math.round(num(night.durationMin)), need: Math.round(need), percent: Math.round(100 * num(night.durationMin) / need) } : null,
      strain: strain == null ? null : Math.round(strain * 10) / 10,
      hrv: hrv && num(hrv.value) > 0 ? { value: Math.round(hrv.value), band: hrv.value > hrv.high ? "above" : hrv.value < hrv.low ? "below" : "within" } : null
    });
  }
  return { start, end: last, days };
}
