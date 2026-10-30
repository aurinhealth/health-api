// Changes to a done activity that stay in Aurin: its calories set by hand (or
// by the coach on request) and deleting it.
//
// Calories: the source keeps its number; the stored row gets the user's
// (Intervals.icu `calories`, Google/Apple Health `metricsSummary.caloriesKcal`)
// with the marks aurinKcal and aurinKcalDevice (what the device said),
// and the syncs keep them (activity-type.js KEEP_TYPE_SQL). The calorie check
// (activity-energy-check.js) leaves such an activity alone.
//
// Deleting:
// - made in the app (typed in, or sent to Intervals.icu by the app): removed
//   here and in Intervals.icu;
// - from Intervals.icu: removed there too when the user asks (`everywhere`),
//   otherwise only hidden here;
// - from a watch (Google Health, Apple Health): only the recording app may
//   delete it, so it is hidden here.
// Hidden rows are record_role 'duplicate' with matched_activity_id 'deleted':
// every list skips them and the activity matching leaves them (index.js).
import { L } from './lang.js';
import { mark, renameMarks } from './activity-type.js';
import { ownExternalId } from './sync-destinations.js';
import { intervalsAuthorization } from './intervals-auth.js';
import { cancelGymPlan } from './gym-plan-store.js';

export const DELETED = 'deleted';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const notFound = () => fail(L('Aktivita nebyla nalezena.', 'The activity wasn\'t found.'), 404);
const GYM_KEY = /^gym:\d{4}-\d{2}-\d{2}$/;
const REMOTE = /^[a-zA-Z0-9_-]{1,80}$/;

const parse = json => { try { return JSON.parse(json || '{}') || {}; } catch { return {}; } };

async function activityRow(env, id) {
  const key = String(id || '').slice(0, 300);
  if (!key) return null;
  return env.DB.prepare(`SELECT id, source_family, data_type, external_id, start_time, payload_json FROM health_datapoints
    WHERE user_id = ? AND external_id = ? AND source_family IN ('intervals', 'local', 'wahoo', 'google-wearables', 'apple-health') AND data_type IN ('activity', 'exercise') AND ((source_family IN ('intervals', 'local', 'wahoo') AND data_type = 'activity')
      OR (source_family IN ('google-wearables', 'apple-health') AND data_type = 'exercise')) LIMIT 1`).bind(env.USER_ID, key).first();
}

const isWatch = row => row.source_family === 'google-wearables' || row.source_family === 'apple-health';

// What the source said the activity burned.
export function deviceKcal(row, payload = parse(row.payload_json)) {
  if (mark(payload, 'KcalDevice') != null) return Number(mark(payload, 'KcalDevice'));
  const v = isWatch(row) ? payload.exercise?.metricsSummary?.caloriesKcal : payload.calories_kcal ?? payload.calories ?? payload.icu_calories;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function withKcal(row, payload, kcal) {
  const device = deviceKcal(row, payload);
  const next = renameMarks({ ...payload });
  if (kcal == null) {
    delete next.aurinKcal; delete next.aurinKcalDevice;
    kcal = device;
  } else {
    next.aurinKcal = kcal;
    next.aurinKcalDevice = device;
  }
  if (isWatch(row)) {
    next.exercise = { ...(next.exercise || {}) };
    next.exercise.metricsSummary = { ...(next.exercise.metricsSummary || {}) };
    if (kcal == null) delete next.exercise.metricsSummary.caloriesKcal; else next.exercise.metricsSummary.caloriesKcal = kcal;
  } else {
    if (kcal == null) delete next.calories; else next.calories = kcal;
    if ('calories_kcal' in next) next.calories_kcal = kcal;
  }
  return next;
}

// POST /app/api/activity/kcal { id, kcal }: kcal null goes back to the device's.
export async function setActivityKcal(env, { id, kcal } = {}) {
  const value = kcal == null || kcal === '' ? null : Math.round(Number(kcal));
  if (value != null && !(value > 0 && value <= 6000)) throw fail(L('Zadej kalorie mezi 1 a 6000.', 'Enter calories between 1 and 6000.'));
  const row = await activityRow(env, id);
  if (!row) throw notFound();
  const payload = withKcal(row, parse(row.payload_json), value);
  await env.DB.prepare('UPDATE health_datapoints SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(JSON.stringify(payload), row.id, env.USER_ID).run();
  return { status: 'ok', id: row.external_id, kcal: value ?? deviceKcal(row, payload), device: deviceKcal(row, payload), edited: value != null };
}

// The Intervals.icu id the app's own copy of a typed-in workout has there.
async function sentIntervalsId(env, local) {
  try {
    const row = await env.DB.prepare("SELECT remote_id FROM sync_sends WHERE user_id = ? AND activity_key = ? AND destination = 'intervals' AND remote_id IS NOT NULL").bind(env.USER_ID, 'manual:' + local).first();
    return row?.remote_id ? String(row.remote_id) : null;
  } catch { return null; }
}
async function sentByApp(env, remote) {
  try { return Boolean(await env.DB.prepare("SELECT 1 FROM sync_sends WHERE user_id = ? AND destination = 'intervals' AND remote_id = ?").bind(env.USER_ID, remote).first()); }
  catch { return false; }
}

async function deleteInIntervals(env, remote, fetchImpl) {
  if (!env.INTERVALS_API_KEY || !REMOTE.test(remote)) throw fail(L('Intervals.icu není připojené.', 'Intervals.icu isn\'t connected.'));
  const response = await fetchImpl('https://intervals.icu/api/v1/activity/' + encodeURIComponent(remote), {
    method: 'DELETE', headers: { Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: 'application/json' }, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok && response.status !== 404) throw fail(L('Intervals.icu smazání nepřijalo (HTTP ', 'Intervals.icu didn\'t accept the delete (HTTP ') + response.status + ').', 502);
}

// Intervals.icu shows a Strava activity only as a stub (Strava's API terms keep
// its data from other apps) and its API refuses to delete it (HTTP 422): it can
// only be deleted in Strava, here it is only hidden.
const stravaStub = (row, p) => /strava/i.test(String(p.source || '')) || (Boolean(p._note) && !/^i\d/.test(String(p.id || row.external_id).replace(/^activity:/, '')));

const hide = (env, row) => env.DB.prepare(`UPDATE health_datapoints SET record_role = 'duplicate', matched_activity_id = ?, match_confidence = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND user_id = ?`).bind(DELETED, row.id, env.USER_ID);

// What the app offers for an activity: { app } made in the app (deleted
// everywhere), { intervals } an Intervals.icu activity (here or there too),
// { watch } a watch's record (hidden here only).
export async function deleteOptions(env, id) {
  if (GYM_KEY.test(String(id || ''))) return { kind: 'app' };
  const row = await activityRow(env, id);
  if (!row) throw notFound();
  if (row.source_family === 'local') return { kind: 'app' };
  if (row.source_family === 'intervals') {
    const p = parse(row.payload_json), remote = String(p.id || row.external_id);
    if (stravaStub(row, p)) return { kind: 'watch', source: 'strava' };
    return { kind: ownExternalId(p.external_id) || await sentByApp(env, remote) ? 'app' : 'intervals' };
  }
  // A Wahoo ride stays in Wahoo; here it is only hidden, like a watch's record.
  if (row.source_family === 'wahoo') return { kind: 'watch', source: 'wahoo' };
  return { kind: 'watch', source: row.source_family === 'apple-health' ? 'apple' : 'google' };
}

// POST /app/api/activity/delete { id, everywhere }.
export async function deleteActivity(env, { id, everywhere = false } = {}, { fetchImpl = fetch } = {}) {
  const key = String(id || '');
  // A gym session saved in the app: its plan for the day is cancelled.
  if (GYM_KEY.test(key)) {
    const plan = await env.DB.prepare('SELECT 1 FROM gym_plans WHERE user_id = ? AND workout_date = ?').bind(env.USER_ID, key.slice(4)).first().catch(() => null);
    if (!plan) throw notFound();
    await cancelGymPlan(env.DB, key.slice(4));
    return { status: 'ok', id: key, removed: ['aurin'] };
  }
  const row = await activityRow(env, key);
  if (!row) throw notFound();
  const payload = parse(row.payload_json);

  if (row.source_family === 'local') {
    const local = String(row.external_id).replace(/^activity:/, ''), remote = await sentIntervalsId(env, local), removed = ['aurin'];
    if (remote && env.INTERVALS_API_KEY) { await deleteInIntervals(env, remote, fetchImpl); removed.push('intervals'); }
    const batch = [
      env.DB.prepare('DELETE FROM health_datapoints WHERE id = ? AND user_id = ?').bind(row.id, env.USER_ID),
      env.DB.prepare("UPDATE local_workouts SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?").bind(env.USER_ID, local)
    ];
    // The watch's record it was paired with stays hidden with it.
    if (/^(google-wearables|apple-health):./.test(String(payload.pairedWith || ''))) {
      const at = payload.pairedWith.indexOf(':');
      batch.push(env.DB.prepare(`UPDATE health_datapoints SET matched_activity_id = ? WHERE user_id = ? AND source_family = ? AND data_type = 'exercise' AND external_id = ?`)
        .bind(DELETED, env.USER_ID, payload.pairedWith.slice(0, at), payload.pairedWith.slice(at + 1)));
    }
    await env.DB.batch(batch);
    return { status: 'ok', id: row.external_id, removed };
  }

  if (row.source_family === 'intervals' && !stravaStub(row, payload)) {
    const remote = String(payload.id || row.external_id);
    const own = ownExternalId(payload.external_id) || await sentByApp(env, remote);
    if (own || everywhere) {
      await deleteInIntervals(env, remote, fetchImpl);
      await env.DB.prepare('DELETE FROM health_datapoints WHERE id = ? AND user_id = ?').bind(row.id, env.USER_ID).run();
      return { status: 'ok', id: row.external_id, removed: ['aurin', 'intervals'] };
    }
  }
  // Merged with another device's record (workout-merge.js): that one goes too.
  const merged = typeof mark(payload, 'Merge')?.with === 'string' ? mark(payload, 'Merge').with : null;
  const at = merged ? merged.indexOf(':') : -1;
  await env.DB.batch([hide(env, row), ...(at > 0 ? [env.DB.prepare(`UPDATE health_datapoints SET record_role = 'duplicate', matched_activity_id = ?, match_confidence = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND source_family = ? AND data_type = 'exercise' AND external_id = ?`).bind(DELETED, env.USER_ID, merged.slice(0, at), merged.slice(at + 1))] : [])]);
  return { status: 'ok', id: row.external_id, removed: ['aurin'] };
}

// The coach's proposal to set an activity's calories (coach-actions.js): one
// of the done activities it was shown, with a sane number.
export function kcalTargets(context = {}) {
  const lists = [];
  for (const d of context.week || []) lists.push(d.completed, d.daily?.training?.completed);
  lists.push(context.training?.completed, context.today?.training?.completed, context.appContext?.selectedDay?.completed);
  const out = new Map();
  for (const list of lists) for (const a of Array.isArray(list) ? list : []) if (a && a.id != null) out.set(String(a.id), a);
  return out;
}
