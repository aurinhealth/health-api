// The type of a done activity, changed by the user (Training → an activity →
// ⋯ → Změnit typ aktivity): a watch that logged a walk as a run.
//
// Types are Intervals.icu's activity types, each with the app's sport group
// (ride, run, strength, swim, walk, other) that icons, plans and load read.
//
// Where the change goes:
// - Intervals.icu: the activity is updated there (PUT /activity/{id}).
// - Made in the app (a gym session, a workout typed in): kept here and sent
//   again to where it went (Intervals.icu, Google Health); the app replaces
//   its own Apple Health copy (the same sync identifier).
// - Google Health and Apple Health: only the app that recorded a workout may
//   change it, so the change stays in Loadwise. The stored row is rewritten
//   and marked (loadwiseType), and the syncs keep the mark (KEEP_TYPE_SQL).
import { L } from './lang.js';
import { intervalsAuthorization } from './intervals-auth.js';
import { sendActivity } from './sync-destinations.js';

// [Intervals.icu type, Czech, English, group]
export const ACTIVITY_TYPES = [
  ['Run', 'Běh', 'Run', 'run'],
  ['TrailRun', 'Trailový běh', 'Trail run', 'run'],
  ['VirtualRun', 'Běh na pásu', 'Treadmill run', 'run'],
  ['Walk', 'Chůze', 'Walk', 'walk'],
  ['Hike', 'Turistika', 'Hike', 'walk'],
  ['Ride', 'Kolo', 'Ride', 'ride'],
  ['VirtualRide', 'Kolo na trenažéru', 'Indoor ride', 'ride'],
  ['MountainBikeRide', 'Horské kolo', 'Mountain bike', 'ride'],
  ['GravelRide', 'Gravel', 'Gravel ride', 'ride'],
  ['EBikeRide', 'Elektrokolo', 'E-bike ride', 'ride'],
  ['WeightTraining', 'Posilovna', 'Gym', 'strength'],
  ['Crossfit', 'Crossfit', 'Crossfit', 'strength'],
  ['HighIntensityIntervalTraining', 'HIIT', 'HIIT', 'other'],
  ['Swim', 'Plavání', 'Swim', 'swim'],
  ['OpenWaterSwim', 'Plavání ve volné vodě', 'Open water swim', 'swim'],
  ['Rowing', 'Veslování', 'Rowing', 'other'],
  ['VirtualRow', 'Veslovací trenažér', 'Indoor rowing', 'other'],
  ['Kayaking', 'Kajak', 'Kayaking', 'other'],
  ['Canoeing', 'Kanoe', 'Canoeing', 'other'],
  ['StandUpPaddling', 'Paddleboard', 'Stand-up paddling', 'other'],
  ['Surfing', 'Surfování', 'Surfing', 'other'],
  ['Windsurf', 'Windsurfing', 'Windsurfing', 'other'],
  ['Kitesurf', 'Kiteboarding', 'Kitesurfing', 'other'],
  ['Sail', 'Plachtění', 'Sailing', 'other'],
  ['NordicSki', 'Běžky', 'Cross-country skiing', 'other'],
  ['AlpineSki', 'Sjezdové lyžování', 'Alpine skiing', 'other'],
  ['BackcountrySki', 'Skialpy', 'Ski touring', 'other'],
  ['Snowboard', 'Snowboard', 'Snowboard', 'other'],
  ['Snowshoe', 'Sněžnice', 'Snowshoeing', 'walk'],
  ['RollerSki', 'Kolečkové lyže', 'Roller skiing', 'other'],
  ['IceSkate', 'Bruslení', 'Ice skating', 'other'],
  ['InlineSkate', 'Inline brusle', 'Inline skating', 'other'],
  ['RockClimbing', 'Lezení', 'Climbing', 'other'],
  ['Yoga', 'Jóga', 'Yoga', 'other'],
  ['Pilates', 'Pilates', 'Pilates', 'other'],
  ['Elliptical', 'Eliptický trenažér', 'Elliptical', 'other'],
  ['StairStepper', 'Schodový trenažér', 'Stair stepper', 'other'],
  ['Tennis', 'Tenis', 'Tennis', 'other'],
  ['Squash', 'Squash', 'Squash', 'other'],
  ['Badminton', 'Badminton', 'Badminton', 'other'],
  ['TableTennis', 'Stolní tenis', 'Table tennis', 'other'],
  ['Padel', 'Padel', 'Padel', 'other'],
  ['Pickleball', 'Pickleball', 'Pickleball', 'other'],
  ['Soccer', 'Fotbal', 'Football', 'other'],
  ['Hockey', 'Hokej', 'Hockey', 'other'],
  ['Rugby', 'Ragby', 'Rugby', 'other'],
  ['Golf', 'Golf', 'Golf', 'other'],
  ['Workout', 'Jiné', 'Other', 'other']
];
const BY_TYPE = new Map(ACTIVITY_TYPES.map(t => [t[0], t]));

/** The sport group of a known type, else null (the caller guesses from the
 *  type and the name). "Workout" says nothing, so its name decides. */
export const groupOfType = type => (type === 'Workout' ? null : BY_TYPE.get(String(type || ''))?.[3] ?? null);
export const typeName = type => { const t = BY_TYPE.get(type); return t ? L(t[1], t[2]) : type; };
/** GET /app/api/activity/types: the list in the user's language. */
export const activityTypes = () => ACTIVITY_TYPES.map(([type, cs, en, group]) => ({ type, name: L(cs, en), group }));

// Every sync that writes an activity or exercise row (Intervals.icu, Google
// Health, Apple Health, Wahoo) keeps a type the user chose and calories set in Aurin
// (activity-edits.js): use in place of `payload_json = excluded.payload_json`.
const TYPED = `CASE
  WHEN json_valid(health_datapoints.payload_json) AND json_valid(excluded.payload_json)
    AND json_extract(health_datapoints.payload_json, '$.loadwiseType') IS NOT NULL
    AND json_type(excluded.payload_json, '$.exercise') = 'object'
  THEN json_set(excluded.payload_json,
    '$.loadwiseType', json_extract(health_datapoints.payload_json, '$.loadwiseType'),
    '$.exercise.exerciseType', json_extract(health_datapoints.payload_json, '$.loadwiseType'),
    '$.exercise.displayName', json_extract(health_datapoints.payload_json, '$.exercise.displayName'))
  -- A Wahoo activity (Intervals.icu's shape): the type sits at the top.
  WHEN json_valid(health_datapoints.payload_json) AND json_valid(excluded.payload_json)
    AND json_extract(health_datapoints.payload_json, '$.loadwiseType') IS NOT NULL
  THEN json_set(excluded.payload_json,
    '$.loadwiseType', json_extract(health_datapoints.payload_json, '$.loadwiseType'),
    '$.type', json_extract(health_datapoints.payload_json, '$.loadwiseType'))
  ELSE excluded.payload_json END`;
const KCAL = "json_extract(health_datapoints.payload_json, '$.loadwiseKcal')";
const DEVICE = "json_extract(health_datapoints.payload_json, '$.loadwiseKcalDevice')";
const KEEP_KCAL = `CASE
  WHEN json_valid(health_datapoints.payload_json) AND json_valid(excluded.payload_json) AND ${KCAL} IS NOT NULL
  THEN CASE WHEN json_type(excluded.payload_json, '$.exercise.metricsSummary') = 'object'
    THEN json_set(${TYPED}, '$.loadwiseKcal', ${KCAL}, '$.loadwiseKcalDevice', ${DEVICE}, '$.exercise.metricsSummary.caloriesKcal', ${KCAL})
    WHEN json_type(excluded.payload_json, '$.exercise') = 'object'
    THEN json_set(${TYPED}, '$.loadwiseKcal', ${KCAL}, '$.loadwiseKcalDevice', ${DEVICE}, '$.exercise.metricsSummary', json_object('caloriesKcal', ${KCAL}))
    ELSE json_replace(json_set(${TYPED}, '$.loadwiseKcal', ${KCAL}, '$.loadwiseKcalDevice', ${DEVICE}, '$.calories', ${KCAL}), '$.calories_kcal', ${KCAL}) END
  ELSE ${TYPED} END`;
// Two records merged into one (workout-merge.js) stay merged too.
const MERGE = "json_extract(health_datapoints.payload_json, '$.loadwiseMerge')";
export const KEEP_TYPE_SQL = `payload_json = CASE
  WHEN json_valid(health_datapoints.payload_json) AND json_valid(excluded.payload_json) AND json_type(health_datapoints.payload_json, '$.loadwiseMerge') = 'object'
  THEN json_set(${KEEP_KCAL}, '$.loadwiseMerge', json(${MERGE}))
  ELSE ${KEEP_KCAL} END`;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// A type chosen for a gym session saved in the app (gym:<date>).
const OVERRIDES = 'CREATE TABLE IF NOT EXISTS activity_type_overrides (user_id INTEGER NOT NULL, activity_key TEXT NOT NULL, type TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, activity_key))';
const GYM_KEY = /^gym:\d{4}-\d{2}-\d{2}$/;

/** Types chosen for gym sessions, date → type. */
export async function gymTypes(db, userId, from, to) {
  try {
    const rows = (await db.prepare('SELECT activity_key, type FROM activity_type_overrides WHERE user_id = ? AND activity_key >= ? AND activity_key <= ?').bind(userId, 'gym:' + from, 'gym:' + to).all()).results || [];
    return Object.fromEntries(rows.filter(r => BY_TYPE.has(r.type)).map(r => [r.activity_key.slice(4), r.type]));
  } catch (error) {
    if (/no such table/i.test(error.message)) return {};
    throw error;
  }
}

// An activity made in the app goes again to where it was sent, with its new type.
async function sendAgain(env, key, type, options) {
  let row = null;
  try { row = await env.DB.prepare('SELECT payload_json FROM sync_sends WHERE user_id = ? AND activity_key = ? ORDER BY updated_at DESC LIMIT 1').bind(env.USER_ID, key).first(); }
  catch (error) { if (!/no such table/i.test(error.message)) throw error; }
  if (!row) return [];
  let p = {};
  try { p = JSON.parse(row.payload_json || '{}') || {}; } catch { return []; }
  const result = await sendActivity(env, { ...p, start: p.startUtc || '', type }, options).catch(() => ({ sends: [] }));
  return (result.sends || []).filter(s => s.status === 'sent' || s.status === 'ok').map(s => s.destination);
}

// POST /app/api/activity/type { id, type }: id is the row's external_id (the
// calendar's activity id), or gym:<date> for a gym session. Returns where the
// change went, and `key` when the app replaces its Apple Health copy.
export async function changeActivityType(env, { id, type } = {}, { fetchImpl = fetch, googleToken = null } = {}) {
  const entry = BY_TYPE.get(String(type || ''));
  if (!entry) throw fail(L('Neznámý typ aktivity.', 'Unknown activity type.'));
  const key = String(id || '').slice(0, 300);
  if (!key) throw fail(L('Aktivita nebyla nalezena.', 'The activity wasn\'t found.'), 404);

  if (GYM_KEY.test(key)) {
    const plan = await env.DB.prepare('SELECT 1 FROM gym_plans WHERE user_id = ? AND workout_date = ?').bind(env.USER_ID, key.slice(4)).first().catch(() => null);
    if (!plan) throw fail(L('Aktivita nebyla nalezena.', 'The activity wasn\'t found.'), 404);
    await env.DB.prepare(OVERRIDES).run();
    await env.DB.prepare('INSERT INTO activity_type_overrides (user_id, activity_key, type) VALUES (?, ?, ?) ON CONFLICT(user_id, activity_key) DO UPDATE SET type = excluded.type, updated_at = CURRENT_TIMESTAMP').bind(env.USER_ID, key, entry[0]).run();
    return { status: 'ok', type: entry[0], sent: await sendAgain(env, key, entry[0], { fetchImpl, googleToken }), kept: [], key };
  }

  const row = await env.DB.prepare(`SELECT id, source_family, data_type, external_id, payload_json FROM health_datapoints
    WHERE user_id = ? AND external_id = ? AND ((source_family IN ('intervals', 'local', 'wahoo') AND data_type = 'activity')
      OR (source_family IN ('google-wearables', 'apple-health') AND data_type = 'exercise')) LIMIT 1`).bind(env.USER_ID, key).first();
  if (!row) throw fail(L('Aktivita nebyla nalezena.', 'The activity wasn\'t found.'), 404);
  let payload = {};
  try { payload = JSON.parse(row.payload_json || '{}') || {}; } catch { /* rewritten below */ }

  // Typed in (Zapsat trénink): the app's own record and its copies.
  if (row.source_family === 'local') {
    const local = String(row.external_id).replace(/^activity:/, '');
    payload.type = entry[0];
    await env.DB.batch([
      env.DB.prepare('UPDATE health_datapoints SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(JSON.stringify(payload), row.id, env.USER_ID),
      env.DB.prepare("UPDATE local_workouts SET event_json = json_set(event_json, '$.type', ?) WHERE user_id = ? AND id = ? AND json_valid(event_json)").bind(entry[0], env.USER_ID, local)
    ]);
    // Paired with the watch's record: the watch's apps have it, nothing was sent.
    const sent = payload.pairedWith ? [] : await sendAgain(env, 'manual:' + local, entry[0], { fetchImpl, googleToken });
    return { status: 'ok', type: entry[0], sent, kept: [], ...(payload.pairedWith ? {} : { key: 'manual:' + local }) };
  }

  if (row.source_family === 'intervals') {
    const remote = String(payload.id || String(row.external_id).replace(/^activity:/, ''));
    if (!env.INTERVALS_API_KEY || !/^[a-zA-Z0-9_-]{1,80}$/.test(remote)) throw fail(L('Intervals.icu není připojené.', 'Intervals.icu isn\'t connected.'));
    const response = await fetchImpl('https://intervals.icu/api/v1/activity/' + encodeURIComponent(remote), {
      method: 'PUT', headers: { Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: entry[0] }), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw fail(L('Intervals.icu změnu nepřijalo (HTTP ', 'Intervals.icu didn\'t accept the change (HTTP ') + response.status + ').', 502);
    payload.type = entry[0];
    await env.DB.prepare('UPDATE health_datapoints SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(JSON.stringify(payload), row.id, env.USER_ID).run();
    return { status: 'ok', type: entry[0], sent: ['intervals'], kept: [] };
  }

  // A Wahoo ride: changed in Aurin only (Wahoo's own type stays), marked so
  // the next Wahoo sync keeps it (KEEP_TYPE_SQL).
  if (row.source_family === 'wahoo') {
    payload.type = entry[0];
    payload.loadwiseType = entry[0];
    await env.DB.prepare('UPDATE health_datapoints SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(JSON.stringify(payload), row.id, env.USER_ID).run();
    return { status: 'ok', type: entry[0], sent: [], kept: ['wahoo'] };
  }
  // A watch session from Google Health or Apple Health: kept in Loadwise only.
  payload.exercise = payload.exercise && typeof payload.exercise === 'object' ? payload.exercise : {};
  payload.exercise.exerciseType = entry[0];
  payload.exercise.displayName = L(entry[1], entry[2]);
  payload.loadwiseType = entry[0];
  await env.DB.prepare('UPDATE health_datapoints SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(JSON.stringify(payload), row.id, env.USER_ID).run();
  return { status: 'ok', type: entry[0], sent: [], kept: [row.source_family === 'apple-health' ? 'apple' : 'google'] };
}
