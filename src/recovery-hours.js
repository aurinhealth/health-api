// Regenerace of one ride, run or walk (recovery-time.js has the model): kept
// apart from the muscle model so the activity details can read it without
// loading the gym catalog.
import { activityKind } from "./fitness-insights.js";

export const MAX_HOURS = 96;
const HOURS_PER_TSS = 24 / 150;
// TSS per minute of a session without one: a moderate effort of each sport.
const TSS_PER_MINUTE = { ride: 0.75, run: 0.9, walk: 0.3 };
const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
export const intensityOf = a => { const raw = n(a?.intensityFactor ?? a?.icu_intensity ?? a?.payload?.icu_intensity); return raw > 0 ? (raw > 3 ? raw / 100 : raw) : null; };

// One ride, run or walk: {hours, tss, estimated}. hours 0 for an easy short one.
export function sessionRecoveryHours({ kind, tss = null, minutes = null, intensity = null } = {}) {
  let load = n(tss), estimated = false;
  if (!(load > 0)) {
    const per = TSS_PER_MINUTE[kind];
    if (!per || !(n(minutes) > 0)) return { hours: 0, tss: null, estimated: true };
    load = n(minutes) * per; estimated = true;
  }
  let hours = load * HOURS_PER_TSS;
  const f = n(intensity);
  if (f >= 0.95) hours = Math.max(hours, 48);
  else if (f >= 0.85) hours = Math.max(hours, 36);
  hours = Math.min(MAX_HOURS, Math.round(hours));
  return { hours: hours < 4 ? 0 : hours, tss: Math.round(load), estimated };
}

// One activity's Regenerace for its detail (activity-detail.js, watch-detail.js):
// hours, or null for a short easy one and for the gym.
export function activityRecoveryHours(activity = {}) {
  const kind = activityKind(activity);
  if (!["ride", "run", "walk"].includes(kind)) return null;
  const r = sessionRecoveryHours({ kind, tss: activity.icu_training_load, minutes: n(activity.moving_time) / 60, intensity: intensityOf(activity) });
  return r.hours || null;
}
