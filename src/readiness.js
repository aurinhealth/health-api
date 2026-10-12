// One readiness for every place that shows or uses it: Today and Health in the
// app (app-today.js, app-health.js), the ride and run coach
// (cycling-coach-v2.js), the gym coach (adaptive-engine.js) and the day review
// (coach-review.js). Each used to call the recovery model with its own inputs
// (no sleep goal, no strain of the day before, a shorter wellness history), so
// the coach could quote another number than Today. They all come here now
// with the same inputs:
// - the wellness rows: Google Health / Apple Health days merged with 90 days of
//   Intervals.icu wellness (mergeWellnessRows), up to the day;
// - the sleep sessions (Google Health, Apple Health, Intervals.icu nights) and
//   the main night of the day (primaryNights);
// - the sleep need from the profile's age and sleep goal, the strain of the
//   day before and the sleep history (sleepNeedFor);
// - the morning check-in on top (applyCheckin).
// Pure: the callers load the inputs.
import { mergeWellnessRows, recoveryReadiness, applyCheckin, sleepNeedFor, sleepIndexScore, heartRateLoad, strainScore } from "./recovery-model.js";
import { sleepSettings } from "./energy-profile.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const nightDate = s => s?.date || String(s?.endTime || "").slice(0, 10);

// Days of Intervals.icu wellness every caller loads: the 60-day baseline and
// the 30-day settling of its spread need the two months before the day.
export const READINESS_WELLNESS_DAYS = 90;

// The main night of each day (naps and short fragments left out).
export function primaryNights(sessions) {
  const byDay = new Map();
  for (const s of sessions || []) {
    if (!s || s.nap || !(num(s.durationMin) >= 180)) continue;
    const d = nightDate(s), best = byDay.get(d);
    if (d && (!best || num(s.durationMin) > num(best.durationMin))) byDay.set(d, s);
  }
  return byDay;
}

// The wellness rows the readiness reads: Google and Apple days first,
// Intervals.icu filling the rest, nothing after the day.
export function readinessRows(google, intervals, date) {
  const upTo = list => (Array.isArray(list) ? list : []).filter(r => r && r.id && (!date || r.id <= date));
  return mergeWellnessRows(upTo(google), upTo(intervals));
}

// The day's strain on the 0–21 scale from its heart-rate zones, null without.
export function strainOn(rows, date) {
  const load = heartRateLoad((rows || []).find(r => r && r.id === date)?.hrZoneMinutes);
  return load == null ? null : strainScore(load);
}

// Readiness for `date`. `rows` are merged wellness rows when the caller has
// them already, otherwise `google` (Google/Apple days) and `intervals`
// (Intervals.icu wellness) are merged here. `profile` gives the age and the
// sleep goal, `checkin` the morning answer (only for the day it was given).
// Returns the readiness after the check-in (score, zone, components, flags,
// missing, provisional, checkin) with the body's own number (`body`), the
// sleep need (`need`: need, base, hrv, debt, naps), the night and the rows.
export function readinessFor({ date, rows = null, google = [], intervals = [], sessions = [], profile = null, checkin = null } = {}) {
  const merged = Array.isArray(rows) ? rows.filter(r => r && r.id && r.id <= date) : readinessRows(google, intervals, date);
  const list = Array.isArray(sessions) ? sessions : [];
  const sleepSet = sleepSettings(profile || {});
  const need = sleepNeedFor({ date, age: num(profile?.age), goal: sleepSet.goal, strain: strainOn(merged, shift(date, -1)), rows: merged, sessions: list });
  const night = primaryNights(list).get(date) || null;
  const body = recoveryReadiness({ rows: merged, date, night, sleepNeed: need.need });
  return { ...applyCheckin(body, checkin), body, need, night, rows: merged };
}

// The sleep index of a night: the model's own (sleepIndexScore) when the night
// has its time in bed, else the score the device gave it (Intervals.icu
// sleepScore, 0–100) when there is one.
export function sleepIndexFor(night, need) {
  if (!night) return null;
  const own = sleepIndexScore(night, need);
  if (own != null) return own;
  const score = num(night.score);
  return score > 0 && score <= 100 ? Math.round(score) : null;
}
