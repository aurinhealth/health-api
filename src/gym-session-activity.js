// A gym session logged set by set in Aurin is a done activity of its own, with
// its length and calories, even when the watch caught only a part of it.
//
// Fitbit and Pixel Watch detect lifting on their own and often stop after a
// few minutes: a 75-minute session arrived from Google Health as one
// "Strength training" of 14 minutes and 24 kcal. The gym plan itself carries
// no length, so a day whose watch pieces were deleted read "0 min · 0 kcal".
//
// While sets are being logged (each save of the day's gym), the day gets one
// activity in Aurin (source 'local', external_id aurin-gym:<date>): from the
// first set to the last one, widened by the watch's lifting pieces that
// overlap it. The pieces then lie inside it and the activity matching hides
// them as its parts (activity-match.js coversSession). A watch record of the
// whole session still wins over it (richerSession ranks this one below the
// watch), so measured numbers are never replaced by the estimate.
//
// Calories: the lifting estimate of activity-energy-check.js (2.5 kcal per kg
// and hour net of the resting burn, 3.5 MET); without a weight, what the
// watch's pieces counted. Calories the user set by hand stay.
import { localDateTime } from './user-time.js';
import { latestStoredWeight } from './athlete-weight.js';
import { strengthEnergyCheck } from './activity-energy-check.js';
import { mark } from './activity-type.js';

export const GYM_ACTIVITY_PREFIX = 'aurin-gym:';
// Sets typed in afterwards come within seconds of each other: no session.
const MIN_MINUTES = 10;
// Watch pieces this far around the logged sets are the same session (warm-up).
const AROUND_MS = 20 * 60000;

const parse = json => { try { return JSON.parse(json || '{}') || {}; } catch { return {}; } };
// D1 CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS" is UTC.
const utcMs = value => Date.parse(String(value || '').replace(' ', 'T').replace(/Z?$/, 'Z'));
const local = ms => { const s = localDateTime(new Date(ms).toISOString()); return s.length === 16 ? s + ':00' : s.slice(0, 19); };
const isLifting = payload => /STRENGTH|WEIGHT/i.test(String(payload.exercise?.exerciseType || '') + ' ' + String(payload.aurinType || ''));

// The session from the set times and the watch pieces (UTC ms): null when the
// sets were not logged live on that day.
export function gymSessionSpan(date, setTimes, pieces = []) {
  const times = setTimes.map(utcMs).filter(Number.isFinite).sort((a, b) => a - b);
  if (times.length < 2) return null;
  let start = times[0], end = times[times.length - 1];
  if (end - start < MIN_MINUTES * 60000 || local(start).slice(0, 10) !== date) return null;
  const inside = [];
  for (const p of pieces) {
    if (!(p.end > p.start) || p.end < start - AROUND_MS || p.start > end + AROUND_MS) continue;
    inside.push(p);
    start = Math.min(start, p.start); end = Math.max(end, p.end);
  }
  return { start, end, pieces: inside };
}

export function gymActivityPayload({ date, name, span, weightKg, kept = {} }) {
  const seconds = Math.round((span.end - span.start) / 1000);
  const estimate = strengthEnergyCheck({ type: 'WeightTraining', durationHours: seconds / 3600 }, weightKg)?.estimated;
  const watchKcal = span.pieces.reduce((sum, p) => sum + (p.kcal || 0), 0);
  const counted = estimate > 0 ? estimate : watchKcal > 0 ? Math.round(watchKcal) : null;
  const payload = {
    name: name || 'Gym', type: 'WeightTraining', category: 'WORKOUT', start_date_local: local(span.start),
    moving_time: seconds, elapsed_time: seconds, aurinGym: date
  };
  // Set by hand in Aurin (activity-edits.js setActivityKcal): stays.
  if (mark(kept, 'Kcal') != null) Object.assign(payload, { calories: kept.calories, aurinKcal: mark(kept, 'Kcal'), aurinKcalDevice: counted });
  else if (counted) payload.calories = counted;
  return payload;
}

// After a save of the day's gym: writes the day's activity when the sets were
// logged live and something changed. Returns whether it wrote.
export async function syncGymActivity(env, date, { name = '' } = {}) {
  const db = env.DB, user = env.USER_ID;
  const sets = (await db.prepare('SELECT created_at FROM strength_sets WHERE user_id = ? AND workout_date = ? AND completed = 1').bind(user, date).all()).results || [];
  if (sets.length < 2) return false;
  const from = date + 'T00:00:00', to = date + 'T23:59:59';
  const [watch, existing] = await Promise.all([
    db.prepare(`SELECT start_time, end_time, payload_json FROM health_datapoints WHERE user_id = ? AND source_family IN ('google-wearables', 'apple-health')
      AND data_type = 'exercise' AND start_time >= ? AND start_time <= ?`).bind(user, shiftIso(from, -1), shiftIso(to, 1)).all(),
    db.prepare("SELECT payload_json FROM health_datapoints WHERE user_id = ? AND source_family = 'local' AND data_type = 'activity' AND external_id = ?").bind(user, GYM_ACTIVITY_PREFIX + date).first()
  ]);
  const pieces = (watch.results || []).map(row => ({ row, p: parse(row.payload_json) })).filter(({ p }) => isLifting(p))
    .map(({ row, p }) => ({ start: Date.parse(row.start_time), end: Date.parse(row.end_time), kcal: Number(p.exercise?.metricsSummary?.caloriesKcal) || 0 }));
  const span = gymSessionSpan(date, sets.map(s => s.created_at), pieces);
  if (!span) return false;
  const kept = existing ? parse(existing.payload_json) : {};
  const weight = Number((await latestStoredWeight(db, user).catch(() => null))?.value_numeric);
  const payload = gymActivityPayload({ date, name, span, weightKg: weight, kept });
  const json = JSON.stringify(payload);
  if (existing?.payload_json === json) return false;
  const start = local(span.start), end = local(span.end);
  await db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, payload_json, record_role)
    VALUES (?, 'local', 'activity', ?, ?, ?, ?, ?, 'primary')
    ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET sample_time = excluded.sample_time, start_time = excluded.start_time,
      end_time = excluded.end_time, payload_json = excluded.payload_json, updated_at = CURRENT_TIMESTAMP`).bind(user, GYM_ACTIVITY_PREFIX + date, start, start, end, json).run();
  return true;
}

// The workout thrown away (Zahodit trénink): its activity goes with it.
export async function removeGymActivity(env, date) {
  await env.DB.prepare("DELETE FROM health_datapoints WHERE user_id = ? AND source_family = 'local' AND data_type = 'activity' AND external_id = ?").bind(env.USER_ID, GYM_ACTIVITY_PREFIX + date).run();
}

// A day's bounds as UTC ISO strings a day wider, so a zone offset never cuts a piece.
function shiftIso(wall, days) {
  return new Date(Date.parse(wall + 'Z') + days * 86400000).toISOString();
}
