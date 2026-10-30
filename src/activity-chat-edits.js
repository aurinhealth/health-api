// Changes to done activities the coach proposes in the chat and the athlete
// confirms (coach-actions.js activity_delete, activity_merge, activity_time).
// They stay in Aurin: the watch, Apple or Google Health and Intervals.icu keep
// their records. Each change can be undone ("Vrátit") with the token it returns.
//
// - Delete hides the activity the way activity-edits.js does (record_role
//   'duplicate', matched_activity_id 'deleted'), whatever its source, so it is
//   never deleted anywhere else from a chat.
// - Merge joins two parts of one session that the watch split ("Ranní běh mi
//   hodinky rozdělily na dva"): a new activity in Aurin (source 'local',
//   external_id merged:…) from the first start to the last end with the sums,
//   both parts hidden. The syncs never touch it, and hidden rows stay hidden.
// - Time moves an activity typed into Aurin (Zapsat trénink) to another start
//   the same day; a watch's record keeps the time the watch measured.
import { L } from './lang.js';
import { localDateTime } from './user-time.js';
import { googleExerciseActivity } from './index.js';
import { DELETED } from './activity-edits.js';

// The longest pause between two parts of one session.
export const MERGE_GAP_MINUTES = 90;
const fail = message => Object.assign(new Error(message), { status: 400 });
const notFound = () => Object.assign(new Error(L('Aktivita nebyla nalezena.', 'The activity wasn\'t found.')), { status: 404 });
const parse = json => { try { return JSON.parse(json || '{}') || {}; } catch { return {}; } };
const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const sum = values => { const xs = values.map(num).filter(v => v != null); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
const ms = wall => Date.parse(String(wall).slice(0, 19) + 'Z');
const wall = t => new Date(t).toISOString().slice(0, 19);
// "YYYY-MM-DDTHH:MM:SS" in the user's time (localDateTime gives minutes).
const local = v => { const s = localDateTime(v); return s.length === 16 ? s + ':00' : s.slice(0, 19); };

async function ensure(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS activity_undo (user_id INTEGER NOT NULL, token TEXT NOT NULL, change_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, token))').run();
}

async function rowOf(env, id) {
  const key = String(id || '').slice(0, 300);
  if (!key || /^gym:/.test(key)) return null;
  return env.DB.prepare(`SELECT id, source_family, data_type, external_id, sample_time, start_time, end_time, payload_json, record_role, matched_activity_id, match_confidence FROM health_datapoints
    WHERE user_id = ? AND external_id = ? AND source_family IN ('intervals', 'local', 'google-wearables', 'apple-health') AND data_type IN ('activity', 'exercise') AND ((source_family IN ('intervals', 'local') AND data_type = 'activity')
      OR (source_family IN ('google-wearables', 'apple-health') AND data_type = 'exercise'))
      AND COALESCE(matched_activity_id, '') != ? LIMIT 1`).bind(env.USER_ID, key, DELETED).first();
}

const isWatch = row => row.source_family === 'google-wearables' || row.source_family === 'apple-health';
// The sport family for "same sport": Run and VirtualRun, Ride and VirtualRide.
const family = type => /run/i.test(type) ? 'run' : /ride|bik|cycl/i.test(type) ? 'ride' : /walk|hike/i.test(type) ? 'walk' : String(type || '').toLowerCase();

// One activity in the user's wall-clock time with what a merge adds up.
export function activityFacts(row) {
  const payload = parse(row.payload_json);
  if (isWatch(row)) {
    const a = googleExerciseActivity(row), metrics = payload.exercise?.metricsSummary || {};
    const start = local(row.start_time), end = row.end_time ? local(row.end_time) : wall(ms(start) + (a.durationHours || 0) * 36e5);
    const distance = num(metrics.distanceMeters) ?? (num(metrics.distanceMillimeters) != null ? metrics.distanceMillimeters / 1000 : null);
    return { id: row.external_id, type: a.type, name: a.name, start, end, movingSec: Math.round((a.durationHours || 0) * 3600) || null, distanceM: distance, kcal: num(a.calories), avgHr: num(a.averageHeartRate), maxHr: null, tss: null, elevationM: null };
  }
  const start = payload.start_date_local ? String(payload.start_date_local).slice(0, 19) : local(row.start_time);
  const movingSec = num(payload.moving_time) ?? num(payload.elapsed_time);
  const end = row.end_time ? local(row.end_time) : wall(ms(start) + (num(payload.elapsed_time) ?? movingSec ?? 0) * 1000);
  return { id: row.external_id, type: payload.type || 'Workout', name: payload.name || payload.type || '', start, end, movingSec, distanceM: num(payload.distance), kcal: num(payload.calories_kcal ?? payload.calories ?? payload.icu_calories), avgHr: num(payload.average_heartrate), maxHr: num(payload.max_heartrate), tss: num(payload.icu_training_load), elevationM: num(payload.total_elevation_gain) };
}

// The joined session: from the first start to the last end, the sums, the
// heart rate weighted by time.
export function mergedPayload(parts) {
  const [a, b] = [...parts].sort((x, y) => ms(x.start) - ms(y.start));
  const weights = [a, b].map(p => (p.avgHr != null ? p.movingSec || 0 : 0));
  const hrTime = weights[0] + weights[1];
  const avgHr = hrTime > 0 ? Math.round((a.avgHr || 0) * weights[0] / hrTime + (b.avgHr || 0) * weights[1] / hrTime) : null;
  const end = ms(b.end) > ms(a.end) ? b.end : a.end;
  const payload = {
    name: a.name || b.name, type: a.type, category: 'WORKOUT', start_date_local: a.start,
    moving_time: sum([a.movingSec, b.movingSec]), elapsed_time: Math.round((ms(end) - ms(a.start)) / 1000),
    distance: sum([a.distanceM, b.distanceM]), calories: sum([a.kcal, b.kcal]),
    average_heartrate: avgHr, max_heartrate: Math.max(a.maxHr || 0, b.maxHr || 0) || null,
    icu_training_load: sum([a.tss, b.tss]), total_elevation_gain: sum([a.elevationM, b.elevationM]),
    aurinMerged: [a.id, b.id]
  };
  for (const key of Object.keys(payload)) if (payload[key] == null) delete payload[key];
  return { payload, start: a.start, end };
}

const hide = (env, row) => env.DB.prepare("UPDATE health_datapoints SET record_role = 'duplicate', matched_activity_id = ?, match_confidence = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(DELETED, row.id, env.USER_ID);
const before = row => ({ id: row.id, record_role: row.record_role ?? null, matched_activity_id: row.matched_activity_id ?? null, match_confidence: row.match_confidence ?? null });

async function remember(env, change) {
  await ensure(env.DB);
  const token = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO activity_undo (user_id, token, change_json) VALUES (?, ?, ?)').bind(env.USER_ID, token, JSON.stringify(change)).run();
  return token;
}

// "Smaž tu jízdu z úterý": hidden in Aurin only.
export async function hideActivity(env, id) {
  const row = await rowOf(env, id);
  if (!row) throw notFound();
  const undo = await remember(env, { kind: 'hide', rows: [before(row)] });
  await hide(env, row).run();
  return { status: 'ok', id: row.external_id, undo };
}

// Two parts of one session become one activity in Aurin.
export async function mergeActivities(env, ids) {
  const [first, second] = await Promise.all((ids || []).slice(0, 2).map(id => rowOf(env, id)));
  if (!first || !second || first.id === second.id) throw notFound();
  const parts = [activityFacts(first), activityFacts(second)];
  if (family(parts[0].type) !== family(parts[1].type)) throw fail(L('Sloučit jde jen dvě části stejného sportu.', 'Only two parts of the same sport can be merged.'));
  if (parts[0].start.slice(0, 10) !== parts[1].start.slice(0, 10)) throw fail(L('Sloučit jde jen aktivity ze stejného dne.', 'Only activities from the same day can be merged.'));
  const [a, b] = [...parts].sort((x, y) => ms(x.start) - ms(y.start));
  const gap = (ms(b.start) - ms(a.end)) / 60000;
  if (gap > MERGE_GAP_MINUTES) throw fail(L(`Mezi částmi je víc než ${MERGE_GAP_MINUTES} minut, to už jsou dva tréninky.`, `There are more than ${MERGE_GAP_MINUTES} minutes between the parts; those are two sessions.`));
  const { payload, start, end } = mergedPayload(parts);
  const key = 'merged:' + [a.id, b.id].join('+').slice(0, 280);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, payload_json, record_role)
      VALUES (?, 'local', 'activity', ?, ?, ?, ?, ?, 'primary')
      ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET sample_time = excluded.sample_time, start_time = excluded.start_time, end_time = excluded.end_time,
        payload_json = excluded.payload_json, record_role = 'primary', matched_activity_id = NULL, match_confidence = NULL, updated_at = CURRENT_TIMESTAMP`).bind(env.USER_ID, key, start, start, end, JSON.stringify(payload)),
    hide(env, first), hide(env, second)
  ]);
  const undo = await remember(env, { kind: 'merge', created: key, rows: [before(first), before(second)] });
  return { status: 'ok', id: key, undo, merged: { start, end, distanceM: payload.distance ?? null, movingSec: payload.moving_time ?? null } };
}

// The new start "HH:MM" of an activity typed into Aurin, the same length.
export async function setActivityTime(env, id, time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) throw fail(L('Zadej čas ve tvaru 18:00.', 'Enter the time as 18:00.'));
  const row = await rowOf(env, id);
  if (!row) throw notFound();
  const payload = parse(row.payload_json);
  if (row.source_family !== 'local' || payload.pairedWith) throw fail(L('Čas změřily hodinky, ten se nemění.', 'The watch measured the time; it doesn\'t change.'));
  const facts = activityFacts(row), start = facts.start.slice(0, 11) + time + ':00';
  const length = ms(facts.end) - ms(facts.start), end = row.end_time ? wall(ms(start) + length) : null;
  const undo = await remember(env, { kind: 'time', id: row.id, sample_time: row.sample_time, start_time: row.start_time, end_time: row.end_time, start_date_local: payload.start_date_local ?? null });
  await env.DB.prepare('UPDATE health_datapoints SET sample_time = ?, start_time = ?, end_time = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .bind(start, start, end, JSON.stringify({ ...payload, start_date_local: start }), row.id, env.USER_ID).run();
  return { status: 'ok', id: row.external_id, undo, from: facts.start.slice(11, 16), to: time };
}

// "Vrátit": the change behind the token goes back, once.
export async function undoActivityChange(env, token) {
  await ensure(env.DB);
  const stored = await env.DB.prepare('SELECT change_json FROM activity_undo WHERE user_id = ? AND token = ?').bind(env.USER_ID, String(token || '')).first();
  if (!stored) throw fail(L('Tuhle změnu už vrátit nejde.', 'This change can no longer be undone.'));
  const change = parse(stored.change_json), batch = [];
  for (const r of change.rows || []) batch.push(env.DB.prepare('UPDATE health_datapoints SET record_role = ?, matched_activity_id = ?, match_confidence = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(r.record_role, r.matched_activity_id, r.match_confidence, r.id, env.USER_ID));
  if (change.kind === 'merge') batch.push(env.DB.prepare("DELETE FROM health_datapoints WHERE user_id = ? AND source_family = 'local' AND data_type = 'activity' AND external_id = ?").bind(env.USER_ID, change.created));
  if (change.kind === 'time') {
    const row = await env.DB.prepare('SELECT payload_json FROM health_datapoints WHERE id = ? AND user_id = ?').bind(change.id, env.USER_ID).first();
    if (row) batch.push(env.DB.prepare('UPDATE health_datapoints SET sample_time = ?, start_time = ?, end_time = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
      .bind(change.sample_time, change.start_time, change.end_time, JSON.stringify({ ...parse(row.payload_json), start_date_local: change.start_date_local }), change.id, env.USER_ID));
  }
  batch.push(env.DB.prepare('DELETE FROM activity_undo WHERE user_id = ? AND token = ?').bind(env.USER_ID, String(token)));
  await env.DB.batch(batch);
  return { status: 'ok' };
}
