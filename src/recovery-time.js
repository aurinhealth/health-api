// Regenerace: after a workout, when the athlete is ready for hard training
// again (intervals, heavy legs) and what makes it take longer. Today shows it
// in the coach card, the activity detail shows what one session cost, and the
// coach and the generators read it.
//
// Each session of the last 4 days gets its own time:
// - A ride, run or walk from its training load (TSS), on the TrainingPeaks
//   guide: under 150 TSS fresh by the next day, 150–300 by the second day,
//   300–450 after two days, more lasts several days. That is 24 h per 150 TSS
//   (0.16 h/TSS), at most 96 h. Intensity costs more than the load says: a
//   tempo or threshold session (IF 0.85+) takes at least 36 h before the next
//   hard one, a VO2max session or a race (IF 0.95+) at least 48 h, the same
//   spacing the endurance coach keeps between quality days
//   (cycling-coach-v2.js qualityOk). Without a TSS (a watch workout) the load
//   is estimated from the minutes.
// - A gym session from the muscle model of Trénink → Svaly (muscle-fatigue.js):
//   until the muscles it worked are rested again.
// The athlete is ready when the last of them is, plus the morning's signs:
// two hours for each hour of sleep below the night's need (at most 8), three
// when HRV is below the usual range, two when the resting heart rate is above
// it. Easy training is fine after a third of the session's time (at most 12 h).
import { L } from "./lang.js";
import { fatigueDoses, muscleState, sourceTitle, MUSCLES } from "./muscle-fatigue.js";
import { activityKind } from "./fitness-insights.js";
import { localDate } from "./user-time.js";
import { sessionRecoveryHours, activityRecoveryHours, intensityOf, MAX_HOURS } from "./recovery-hours.js";

export { sessionRecoveryHours, activityRecoveryHours, MAX_HOURS };

const HOUR = 3600000, DAY = 86400000;
export const LOOKBACK_DAYS = 4;
const SLEEP_HOURS_PER_HOUR = 2, SLEEP_MAX = 8, HRV_LOW = 3, RHR_HIGH = 2;
const LIGHT_SHARE = 1 / 3, LIGHT_MAX = 12;

const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// The sessions that still count: {kind, title, detail, end (ms), hours, readyAt (ms)}.
export function sessionTimes({ sets = [], activities = [], now }) {
  const out = [];
  const since = now - LOOKBACK_DAYS * DAY;
  for (const a of activities) {
    const kind = a.kind || activityKind(a);
    if (!["ride", "run", "walk"].includes(kind) || !Number.isFinite(a.end) || a.end > now || a.end < since) continue;
    const r = sessionRecoveryHours({ kind, tss: a.tss, minutes: a.minutes, intensity: intensityOf(a) });
    if (!r.hours) continue;
    // A watch names a workout by its type only ("Ride"): then as Svaly says it.
    const name = a.source === "google" ? "" : String(a.name || "").trim();
    out.push({ kind, title: name || sourceTitle({ kind, distance: a.distance, minutes: a.minutes }), detail: r.tss ? r.tss + " TSS" + (r.estimated ? " " + L("odhad", "est.") : "") : null, end: a.end, hours: r.hours, readyAt: a.end + r.hours * HOUR });
  }
  // A gym day: until the muscles it worked are rested (muscle-fatigue.js).
  const { doses, sources } = fatigueDoses({ sets, activities: activities.filter(a => (a.kind || activityKind(a)) === "strength"), now });
  for (const s of sources) {
    if (s.kind !== "gym" || s.at < since) continue;
    const own = doses.filter(d => d.source === s.key);
    let hours = 0;
    for (const m of MUSCLES) if (own.some(d => d.muscle === m)) hours = Math.max(hours, muscleState(own, m, s.at).hours);
    if (!hours) continue;
    out.push({ kind: "gym", title: sourceTitle(s), detail: null, end: s.at, hours, readyAt: s.at + hours * HOUR });
  }
  return out;
}

// The morning's signs that make it longer: [{kind, hours, value, …}].
export function morningSigns({ sleep = null, hrv = null, restingHR = null } = {}) {
  const out = [];
  const minutes = n(sleep?.minutes), need = n(sleep?.need);
  if (minutes != null && need > 0 && minutes < need - 15) {
    const hours = Math.min(SLEEP_MAX, Math.round((need - minutes) / 60 * SLEEP_HOURS_PER_HOUR));
    if (hours > 0) out.push({ kind: "sleep", hours, minutes: Math.round(minutes), need: Math.round(need) });
  }
  if (n(hrv?.value) != null && n(hrv?.low) != null && n(hrv.value) < n(hrv.low)) {
    out.push({ kind: "hrv", hours: HRV_LOW, value: Math.round(n(hrv.value)), low: Math.round(n(hrv.low)), high: n(hrv.high) != null ? Math.round(n(hrv.high)) : null });
  }
  if (n(restingHR?.value) != null && n(restingHR?.high) != null && n(restingHR.value) > n(restingHR.high)) {
    out.push({ kind: "restingHR", hours: RHR_HIGH, value: Math.round(n(restingHR.value)), high: Math.round(n(restingHR.high)) });
  }
  return out;
}

// Today's Regenerace, null when nothing is left to recover from.
// sets/activities as for muscle-fatigue.js; sleep {minutes, need}; hrv {value,
// low, high}; restingHR {value, high}; now: ms.
export function recoveryTime({ sets = [], activities = [], now, sleep = null, hrv = null, restingHR = null } = {}) {
  const sessions = sessionTimes({ sets, activities, now }).filter(s => s.readyAt > now);
  if (!sessions.length) return null;
  sessions.sort((a, b) => b.readyAt - a.readyAt);
  const main = sessions[0];
  const signs = morningSigns({ sleep, hrv, restingHR });
  const extra = signs.reduce((s, x) => s + x.hours, 0);
  const readyAt = main.readyAt + extra * HOUR;
  const lightAt = Math.max(...sessions.map(s => s.end + Math.min(LIGHT_MAX, s.hours * LIGHT_SHARE) * HOUR)) + extra / 2 * HOUR;
  const total = readyAt - main.end;
  return {
    readyAt: new Date(readyAt).toISOString(),
    readyDate: localDate(new Date(readyAt)),
    hours: Math.ceil((readyAt - now) / HOUR),
    from: new Date(main.end).toISOString(),
    progress: Math.round(Math.max(0, Math.min(1, (now - main.end) / total)) * 100) / 100,
    lightAt: lightAt > now ? new Date(lightAt).toISOString() : null,
    // What makes it take this long: the sessions still recovering (the
    // longest first, at most three) and the morning's signs.
    causes: [
      ...sessions.slice(0, 3).map(s => ({ kind: s.kind, title: s.title, detail: s.detail, date: localDate(new Date(s.end)), hours: s.hours })),
      ...signs
    ]
  };
}
