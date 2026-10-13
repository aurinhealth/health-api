// The type of a done activity, changed by the user (Training → an activity →
// ⋯ → Změnit typ aktivity): a watch that logged a walk as a run.
//
// Types are Intervals.icu's activity types, each with the app's sport group
// (ride, run, strength, swim, walk, other) that icons, plans and load read.
//
// Where the change goes:
// - Intervals.icu: the activity is updated there (PUT /activity/{id}).
// - Google Health and Apple Health: only the app that recorded a workout may
//   change it, so the change stays in Loadwise. The stored row is rewritten
//   and marked (loadwiseType), and the syncs keep the mark (KEEP_TYPE_SQL).
import { L } from './lang.js';
import { intervalsAuthorization } from './intervals-auth.js';

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

// Every sync that writes an exercise row (Google Health, Apple Health) keeps
// a type the user chose: use in place of `payload_json = excluded.payload_json`.
export const KEEP_TYPE_SQL = `payload_json = CASE
  WHEN json_valid(health_datapoints.payload_json) AND json_valid(excluded.payload_json)
    AND json_extract(health_datapoints.payload_json, '$.loadwiseType') IS NOT NULL
    AND json_type(excluded.payload_json, '$.exercise') = 'object'
  THEN json_set(excluded.payload_json,
    '$.loadwiseType', json_extract(health_datapoints.payload_json, '$.loadwiseType'),
    '$.exercise.exerciseType', json_extract(health_datapoints.payload_json, '$.loadwiseType'),
    '$.exercise.displayName', json_extract(health_datapoints.payload_json, '$.exercise.displayName'))
  ELSE excluded.payload_json END`;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// POST /app/api/activity/type { id, type }: id is the row's external_id (the
// calendar's activity id). Returns where the change went.
export async function changeActivityType(env, { id, type } = {}, { fetchImpl = fetch } = {}) {
  const entry = BY_TYPE.get(String(type || ''));
  if (!entry) throw fail(L('Neznámý typ aktivity.', 'Unknown activity type.'));
  const key = String(id || '').slice(0, 300);
  if (!key) throw fail(L('Aktivita nebyla nalezena.', 'The activity wasn\'t found.'), 404);
  const row = await env.DB.prepare(`SELECT id, source_family, data_type, external_id, payload_json FROM health_datapoints
    WHERE user_id = ? AND external_id = ? AND ((source_family = 'intervals' AND data_type = 'activity')
      OR (source_family IN ('google-wearables', 'apple-health') AND data_type = 'exercise')) LIMIT 1`).bind(env.USER_ID, key).first();
  if (!row) throw fail(L('Aktivita nebyla nalezena.', 'The activity wasn\'t found.'), 404);
  let payload = {};
  try { payload = JSON.parse(row.payload_json || '{}') || {}; } catch { /* rewritten below */ }

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

  // A watch session from Google Health or Apple Health: kept in Loadwise only.
  payload.exercise = payload.exercise && typeof payload.exercise === 'object' ? payload.exercise : {};
  payload.exercise.exerciseType = entry[0];
  payload.exercise.displayName = L(entry[1], entry[2]);
  payload.loadwiseType = entry[0];
  await env.DB.prepare('UPDATE health_datapoints SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(JSON.stringify(payload), row.id, env.USER_ID).run();
  return { status: 'ok', type: entry[0], sent: [], kept: [row.source_family === 'apple-health' ? 'apple' : 'google'] };
}
