// Long-term facts for the coach (texts on the screens and the chat): a few
// numbers over weeks instead of days, computed here so the AI never has to
// do the arithmetic. A fact is left out when the data does not carry it.
//   hrvChange6w       the last 7 days' HRV mean against the 7 days six weeks
//                     earlier, in percent, only within one source and measure
//                     (Apple's SDNN and Google's RMSSD are different scales)
//   restingHRChange6w the same windows for the resting heart rate, in bpm
//   sleepDebt7d       the sleep debt over the last 7 nights, in hours
//   nightsUnderNeed   nights in a row (up to last night) shorter than the need
//   ctlChange6w       fitness (CTL) now against six weeks ago
import { mergeWellnessRows, sleepDebtMinutes, sleepNeedMinutes } from "./recovery-model.js";

const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const positive = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length;
// At least this many measured days in each 7-day window.
const MIN_DAYS = 4;
const WEEKS = 6;

// The 7-day means of `key` now and six weeks earlier for the rows of one
// source (the source of the latest measured day).
function windows(rows, date, key, sourceKey) {
  const measured = rows.filter(r => r && r.id <= date && positive(r[key]) != null);
  const latest = measured.filter(r => r.id > shift(date, -7)).at(-1);
  if (!latest) return null;
  const same = measured.filter(r => (r[sourceKey] || null) === (latest[sourceKey] || null));
  const span = (from, to) => same.filter(r => r.id >= from && r.id <= to).map(r => positive(r[key]));
  const now = span(shift(date, -6), date), before = span(shift(date, -6 - WEEKS * 7), shift(date, -WEEKS * 7));
  if (now.length < MIN_DAYS || before.length < MIN_DAYS) return null;
  return { now: mean(now), before: mean(before) };
}

// Each day's sleep (naps aside), in minutes.
function nightsByDay(sessions) {
  const byDay = new Map();
  for (const s of sessions || []) {
    const day = s && (s.date || String(s.endTime || "").slice(0, 10)), minutes = positive(s?.durationMin);
    if (!day || minutes == null || s.nap || minutes < 180) continue;
    byDay.set(day, (byDay.get(day) || 0) + minutes);
  }
  return byDay;
}

// wellness: the Google/Apple rows (health.wellness), intervals: Intervals.icu's
// (fitness.wellness, with CTL); sessions: the sleep sessions; need: the sleep
// need in minutes (else from the age).
export function trendFacts({ date, wellness = [], intervals = [], sessions = [], need = null, age = null } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const rows = mergeWellnessRows(Array.isArray(wellness) ? wellness : [], Array.isArray(intervals) ? intervals : []);
  const facts = {};

  const hrv = windows(rows, date, "hrv", "hrvSource");
  if (hrv) facts.hrvChange6w = { percent: round((hrv.now / hrv.before - 1) * 100), nowMs: round(hrv.now), beforeMs: round(hrv.before) };
  const rhr = windows(rows, date, "restingHR", "restingHRSource");
  if (rhr) facts.restingHRChange6w = { bpm: round(rhr.now - rhr.before, 1), now: round(rhr.now), before: round(rhr.before) };

  const want = positive(need) ?? sleepNeedMinutes({ age });
  const nights = nightsByDay(sessions);
  const week = [...nights.keys()].filter(d => d > shift(date, -7) && d <= date);
  if (week.length >= 5) {
    const debt = sleepDebtMinutes([...nights].map(([d, m]) => ({ date: d, durationMin: m })), date, want);
    if (debt) facts.sleepDebt7d = { hours: round(debt.minutes / 60, 1), nights: debt.nights, needMinutes: want };
  }
  // Last night is today's date (sleep ends in the morning); yesterday's when
  // today's is not synced yet.
  const last = nights.has(date) ? date : nights.has(shift(date, -1)) ? shift(date, -1) : null;
  if (last) {
    let streak = 0;
    for (let d = last; nights.has(d) && nights.get(d) < want; d = shift(d, -1)) streak++;
    if (streak >= 2) facts.nightsUnderNeed = { nights: streak, needMinutes: want };
  }

  const ctl = (Array.isArray(intervals) ? intervals : []).filter(r => r && r.id <= date && Number.isFinite(Number(r.ctl)) && r.ctl !== null && r.ctl !== "");
  const ctlNow = ctl.filter(r => r.id > shift(date, -3)).at(-1);
  // The day closest to six weeks ago, within three days.
  const then = shift(date, -WEEKS * 7), gap = r => Math.abs(Date.parse(r.id + "T12:00:00Z") - Date.parse(then + "T12:00:00Z"));
  const ctlThen = ctl.filter(r => gap(r) <= 3 * DAY).sort((a, b) => gap(a) - gap(b))[0];
  if (ctlNow && ctlThen) facts.ctlChange6w = { now: round(Number(ctlNow.ctl), 1), before: round(Number(ctlThen.ctl), 1), change: round(Number(ctlNow.ctl) - Number(ctlThen.ctl), 1) };

  return Object.keys(facts).length ? facts : null;
}
