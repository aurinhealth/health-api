import { L } from './lang.js';
import { intervalsAuthorization } from './intervals-auth.js';
import { localDateTime } from './user-time.js';
import { grantedExtras, hasGoogleScope, HEALTH_PERMISSIONS } from './google-scopes.js';
import { stravaConfigured, stravaSendActivity, readStravaTokens } from './strava.js';
// Synchronizace: where Loadwise sends what the user records, chosen per
// destination in the app (Settings → Synchronizace): Apple Health (written by
// the iPhone, which keeps its part of the preferences here too), Google
// Health, Intervals.icu and Strava (sent from here). Only destinations the
// app can really send to are listed; Strava only when its app is configured.
//
// Preferences per user and destination (sync_preferences): send planned
// workouts, send done activities, download done activities and which health
// data to send ('all' or a list of HEALTH_TYPES). A user without a row gets
// DEFAULTS, which keep what the app did before this screen existed.
//
// Done activities logged in the app (a manual workout, a gym session) go out
// through sendActivity; each destination's result is kept in sync_sends so
// the app can show it ("Odesláno do 2 aplikací") and try again.
//
// A send is never made twice by accident. A first send that got no answer
// (timeout, network) may well have gone through, so its row becomes 'unknown'
// instead of 'pending': the next try asks Intervals.icu for the day's activity
// with our external_id and updates it, Strava refuses a repeated external_id
// (409) and that counts as sent, and Google Health, which cannot be asked, is
// sent again only by hand ("Zkusit znovu").

export const DESTINATIONS = ['apple', 'google', 'intervals', 'strava'];
// Sent from the server; Apple Health is written by the iPhone.
const SERVER_DESTINATIONS = ['google', 'intervals', 'strava'];

// The health data each destination accepts. Intervals.icu: what
// wellness-sync.js (and weight-sync.js for weight) really writes there.
// Apple Health: what the iPhone writes from the app's own entries. Google
// Health: weight (weight-sync.js, with the weight-writing permission) and
// the food log (food-google-sync.js). Strava takes only the weight.
export const HEALTH_TYPES = {
  apple: ['weight', 'nutrition', 'water'],
  google: ['weight', 'nutrition'],
  intervals: ['weight', 'bodyFat', 'restingHR', 'hrv', 'sleep', 'steps', 'spO2', 'respiration', 'vo2max'],
  strava: ['weight']
};

// What each destination can do at all; the app shows only these rows.
export const SUPPORTS = {
  intervals: { pushPlanned: true, pushActivities: true, pullActivities: true, health: true },
  // Apple Health has no planned workouts; downloading is the HealthKit reading in Zdroje dat.
  apple: { pushPlanned: false, pushActivities: true, pullActivities: true, health: true },
  google: { pushPlanned: false, pushActivities: true, pullActivities: true, health: true },
  // Never read from Strava: its API agreement forbids its data in AI and analytics.
  strava: { pushPlanned: false, pushActivities: true, pullActivities: false, health: true }
};

// Before this screen: Intervals.icu got the plan, the wellness and the
// weight, activities came from it, and a manual workout was promised there
// ("pošle do Intervals.icu"). Google Health got the food log and, with the
// permission, the weight, and its workouts came in; writing workouts there
// needs a permission nobody has yet, so it starts off. Apple Health got
// nothing. Strava is new: whoever connects it wants activities and weight there.
const DEFAULTS = {
  apple: { pushPlanned: false, pushActivities: false, pullActivities: false, health: [] },
  google: { pushPlanned: false, pushActivities: false, pullActivities: true, health: 'all' },
  intervals: { pushPlanned: true, pushActivities: true, pullActivities: true, health: 'all' },
  strava: { pushPlanned: false, pushActivities: true, pullActivities: false, health: 'all' }
};

// Intervals.icu wellness field → the health type that allows it.
const WELLNESS_TYPE = { restingHR: 'restingHR', hrv: 'hrv', spO2: 'spO2', respiration: 'respiration', vo2max: 'vo2max', bodyFat: 'bodyFat', steps: 'steps', sleepSecs: 'sleep', avgSleepingHR: 'sleep', weight: 'weight' };

const KEY = /^[A-Za-z0-9:._-]{3,120}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const defaultSyncPrefs = destination => structuredClone(DEFAULTS[destination] || { pushPlanned: false, pushActivities: false, pullActivities: false, health: [] });

export async function ensureSyncTables(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS sync_preferences (user_id INTEGER NOT NULL, destination TEXT NOT NULL, push_planned INTEGER NOT NULL DEFAULT 0, push_activities INTEGER NOT NULL DEFAULT 0, pull_activities INTEGER NOT NULL DEFAULT 0, health_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, destination))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS sync_sends (user_id INTEGER NOT NULL, activity_key TEXT NOT NULL, destination TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', remote_id TEXT, message TEXT, payload_json TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, activity_key, destination))").run();
}

// The preferences as given, cleaned up: unknown health types go, missing
// fields keep `base`, switches a destination cannot do stay off.
export function normalizeSyncPrefs(destination, input = {}, base = defaultSyncPrefs(destination)) {
  const types = HEALTH_TYPES[destination] || [];
  const flag = name => typeof input?.[name] === 'boolean' ? input[name] : Boolean(base[name]);
  let health = input?.health === undefined ? base.health : input.health;
  if (health !== 'all') health = Array.isArray(health) ? [...new Set(health.map(String))].filter(t => types.includes(t)) : (base.health === 'all' ? 'all' : [...(base.health || [])]);
  const out = { pushPlanned: flag('pushPlanned'), pushActivities: flag('pushActivities'), pullActivities: flag('pullActivities'), health };
  const supports = SUPPORTS[destination] || {};
  for (const name of ['pushPlanned', 'pushActivities', 'pullActivities']) if (!supports[name]) out[name] = false;
  return out;
}

const fromRow = (destination, row) => {
  let health = [];
  try { health = JSON.parse(row.health_json || '[]'); } catch { health = []; }
  return normalizeSyncPrefs(destination, { pushPlanned: Boolean(row.push_planned), pushActivities: Boolean(row.push_activities), pullActivities: Boolean(row.pull_activities), health });
};

// One destination's preferences; the defaults when there is no row (or no
// table yet, e.g. before the migration ran).
export async function readSyncPrefs(db, userId, destination) {
  try {
    const row = await db.prepare('SELECT push_planned, push_activities, pull_activities, health_json FROM sync_preferences WHERE user_id = ? AND destination = ?').bind(userId, destination).first();
    return row ? { ...fromRow(destination, row), stored: true } : { ...defaultSyncPrefs(destination), stored: false };
  } catch (error) {
    if (!/no such table/i.test(error.message)) console.error('Sync preferences read failed', error.message);
    return { ...defaultSyncPrefs(destination), stored: false };
  }
}

export async function saveSyncPrefs(db, userId, destination, input) {
  if (!DESTINATIONS.includes(destination)) throw Object.assign(new Error(L('Neznámá aplikace.', 'Unknown app.')), { status: 404 });
  await ensureSyncTables(db);
  const { stored, ...current } = await readSyncPrefs(db, userId, destination); void stored;
  const next = normalizeSyncPrefs(destination, input, current);
  await db.prepare(`INSERT INTO sync_preferences (user_id, destination, push_planned, push_activities, pull_activities, health_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, destination) DO UPDATE SET push_planned = excluded.push_planned, push_activities = excluded.push_activities, pull_activities = excluded.pull_activities, health_json = excluded.health_json, updated_at = excluded.updated_at`)
    .bind(userId, destination, next.pushPlanned ? 1 : 0, next.pushActivities ? 1 : 0, next.pullActivities ? 1 : 0, JSON.stringify(next.health), new Date().toISOString()).run();
  return next;
}

export const healthAllowed = (prefs, type) => prefs?.health === 'all' || (Array.isArray(prefs?.health) && prefs.health.includes(type));

// Wellness updates ({ date: { field: value } }) without the fields the user
// does not send to Intervals.icu.
export function allowedWellness(updates, prefs) {
  const out = {};
  for (const [date, fields] of Object.entries(updates || {})) {
    for (const [field, value] of Object.entries(fields)) {
      const type = WELLNESS_TYPE[field];
      if (type && healthAllowed(prefs, type)) (out[date] ||= {})[field] = value;
    }
  }
  return out;
}

// Google permissions the chosen settings need and the user has not given, by
// name: writing workouts and weight are extras (EXTRA_SCOPES) granted in the
// "Rozšířit oprávnění Google" flow; writing food is one of the base ones.
export function googleMissingScopes(env, prefs) {
  const extras = grantedExtras(env), missing = [];
  if (prefs.pushActivities && !extras.activityWrite) missing.push('activityWrite');
  if (healthAllowed(prefs, 'weight') && !extras.weightWrite) missing.push('weightWrite');
  if (healthAllowed(prefs, 'nutrition') && !hasGoogleScope(env, HEALTH_PERMISSIONS.nutritionWrite)) missing.push('nutritionWrite');
  return missing;
}

export function destinationConnected(env, id) {
  if (id === 'intervals') return Boolean(env.INTERVALS_API_KEY);
  if (id === 'google') return Boolean(env.GOOGLE_REFRESH_TOKEN);
  if (id === 'strava') return Boolean(readStravaTokens(env));
  return null; // Apple Health is connected on the iPhone; the server cannot tell.
}

// Strava is offered only with its app configured (STRAVA_CLIENT_ID/SECRET).
const offered = (env, id) => id !== 'strava' || stravaConfigured(env);

// GET /app/api/sync/prefs: every destination with its state and preferences.
export async function syncOverview(env) {
  const destinations = [];
  for (const id of DESTINATIONS.filter(d => offered(env, d))) {
    const { stored, ...prefs } = await readSyncPrefs(env.DB, env.USER_ID, id);
    const row = { id, connected: destinationConnected(env, id), stored, prefs, supports: SUPPORTS[id], healthTypes: HEALTH_TYPES[id] };
    if (id === 'google' && row.connected) row.missingScopes = googleMissingScopes(env, prefs);
    destinations.push(row);
  }
  return { status: 'ok', destinations };
}

// ---- Done activities ----

// { key, sport, name, date, start?, minutes, notes?, rpe? } as the app sends it.
export function normalizeActivity(input = {}) {
  const key = String(input.key || ''), date = String(input.date || ''), minutes = Number(input.minutes);
  const name = String(input.name || '').trim().slice(0, 180), sport = String(input.sport || '').toLowerCase();
  if (!KEY.test(key) || !DAY.test(date) || !name || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) throw Object.assign(new Error(L('Aktivitě chybí název, den nebo délka.', 'The activity is missing a name, day or duration.')), { status: 400 });
  // The local start: a time with a zone (the gym's clock) in the user's zone, else noon.
  const raw = String(input.start || ''), start = raw ? localDateTime(raw) : '';
  const timed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(start) && start.slice(0, 10) === date;
  const startLocal = timed ? start.slice(0, 16) + ':00' : date + 'T12:00:00';
  const startUtc = timed && /(Z|[+-]\d{2}:?\d{2})$/.test(raw) && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  const rpe = Number(input.rpe);
  return { key, sport, name, date, startLocal, startUtc, minutes: Math.round(minutes), notes: String(input.notes || '').slice(0, 2000), rpe: Number.isInteger(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null };
}

const intervalsType = sport => ({ gym: 'WeightTraining', strength: 'WeightTraining', run: 'Run', ride: 'Ride', walk: 'Walk', swim: 'Swim', yoga: 'Yoga' }[sport] || 'Workout');

// The activity as Intervals.icu's manual activity. external_id marks it as the
// app's, so the import does not bring it back as a second copy.
export function intervalsActivity(userId, activity) {
  const body = {
    start_date_local: activity.startLocal,
    type: intervalsType(activity.sport),
    name: activity.name,
    moving_time: activity.minutes * 60,
    elapsed_time: activity.minutes * 60,
    description: activity.notes || undefined,
    external_id: 'loadwise:' + userId + ':' + activity.key
  };
  if (activity.rpe) body.icu_rpe = activity.rpe;
  return body;
}

// A fetch whose missing answer (timeout, network) is told apart from a
// refusal: the request may well have gone through.
async function reach(fetchImpl, url, init) {
  try { return await fetchImpl(url, init); }
  catch (error) { throw Object.assign(new Error('No answer: ' + (error?.name || error?.message)), { noAnswer: true }); }
}

// The day's activity Intervals.icu already has with our external_id (a send
// whose answer was lost), so it is updated instead of made twice.
async function intervalsActivityId(headers, body, fetchImpl) {
  const day = body.start_date_local.slice(0, 10), next = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const response = await fetchImpl('https://intervals.icu/api/v1/athlete/0/activities?oldest=' + day + '&newest=' + next, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Intervals.icu HTTP ' + response.status);
  const list = await response.json().catch(() => []);
  const match = (Array.isArray(list) ? list : []).find(a => a?.external_id === body.external_id);
  return match?.id == null ? null : String(match.id);
}

async function pushIntervals(env, row, { fetchImpl }) {
  const activity = JSON.parse(row.payload_json || '{}'), body = intervalsActivity(env.USER_ID, activity);
  const headers = { Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: 'application/json', 'Content-Type': 'application/json' };
  // Sent before: the same activity is updated instead of made twice.
  const known = row.remote_id || await intervalsActivityId(headers, body, fetchImpl);
  const url = known ? 'https://intervals.icu/api/v1/activity/' + encodeURIComponent(known) : 'https://intervals.icu/api/v1/athlete/0/activities/manual';
  const response = await reach(fetchImpl, url, { method: known ? 'PUT' : 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Intervals.icu HTTP ' + response.status);
  const saved = await response.json().catch(() => null);
  const id = saved?.id ?? known;
  if (id == null) throw new Error(L('Intervals.icu nepotvrdilo uložení.', 'Intervals.icu didn\'t confirm the save.'));
  return String(id);
}

// Google Health: the activity as an exercise data point (the shape the app
// reads back, apple-health.js and index.js googleExerciseActivity). A known
// record (its resource name) is patched instead of made again.
const GOOGLE_EXERCISE = /^users\/[^/]+\/dataTypes\/exercise\/dataPoints\/[^/?#]+$/;
const googleExerciseType = sport => ({ gym: 'STRENGTH_TRAINING', strength: 'STRENGTH_TRAINING', run: 'RUNNING', ride: 'BIKING', walk: 'WALKING', swim: 'SWIMMING', yoga: 'YOGA' }[sport] || 'EXERCISE');
export function googleExercise(activity) {
  const start = new Date(activity.startUtc ? Date.parse(activity.startUtc) : Date.parse(activity.startLocal + 'Z'));
  const end = new Date(+start + activity.minutes * 60000);
  const exercise = { interval: { startTime: start.toISOString(), endTime: end.toISOString() }, exerciseType: googleExerciseType(activity.sport), displayName: activity.name.slice(0, 80), activeDuration: activity.minutes * 60 + 's' };
  if (activity.notes) exercise.notes = activity.notes.slice(0, 1000);
  return { exercise };
}
async function pushGoogle(env, row, { fetchImpl, googleToken }) {
  if (!grantedExtras(env).activityWrite) throw Object.assign(new Error('Google scope missing'), { scope: 'activityWrite' });
  if (!googleToken) throw new Error('Google token unavailable');
  const activity = JSON.parse(row.payload_json || '{}'), known = GOOGLE_EXERCISE.test(row.remote_id || '');
  const access = await googleToken(env);
  const url = 'https://health.googleapis.com/v4/' + (known ? row.remote_id : 'users/me/dataTypes/exercise/dataPoints');
  const response = await reach(fetchImpl, url, { method: known ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + access, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(googleExercise(activity)), signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Google Health HTTP ' + response.status);
  if (data.error) throw new Error('Google operation failed');
  // A long-running write answers with its operation; the record name comes later.
  return String(data.response?.name || data.name || row.remote_id || 'accepted');
}

async function pushStrava(env, row, { fetchImpl }) {
  return stravaSendActivity(env, JSON.parse(row.payload_json || '{}'), row.remote_id || null, { fetchImpl });
}

const NAMES = { google: 'Google Health', intervals: 'Intervals.icu', strava: 'Strava' };
const PUSH = { google: pushGoogle, intervals: pushIntervals, strava: pushStrava };

function failure(destination, error) {
  if (error.scope) return L('Povol Loadwise zápis tréninků do Google Health (Rozšířit oprávnění Google).', 'Allow Loadwise to write workouts to Google Health (Extend Google permissions).');
  if (/HTTP 40[13]/.test(error.message)) return L(NAMES[destination] + ' odmítlo přístup. Připoj ho znovu.', NAMES[destination] + ' refused access. Connect it again.');
  return L('Odeslání se nepodařilo. Zkus to znovu.', 'Sending failed. Try again.');
}

const setStatus = (env, row, status, message, remoteId = null) => env.DB.prepare(`UPDATE sync_sends SET status = ?, message = ?, remote_id = COALESCE(?, remote_id), attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ? AND activity_key = ? AND destination = ?`).bind(status, message, remoteId, env.USER_ID, row.activity_key, row.destination).run();

const NO_ANSWER = () => L('Odpověď nedorazila; aktivita už tam může být. Zkus to znovu, až si to ověříš.', 'No answer came; the activity may already be there. Try again once you have checked.');
// A first send Google Health never answered: only "Zkusit znovu" sends it again.
const googleUnsure = row => row.destination === 'google' && row.status === 'unknown' && !GOOGLE_EXERCISE.test(row.remote_id || '');

// Sends one stored activity to one destination and records the result.
// `force` is the user's own "Zkusit znovu".
async function deliver(env, row, options) {
  if (!PUSH[row.destination]) return { destination: row.destination, status: row.status, message: row.message || null };
  if (!destinationConnected(env, row.destination)) {
    const message = L(NAMES[row.destination] + ' není připojené.', NAMES[row.destination] + ' isn\'t connected.');
    await setStatus(env, row, 'error', message);
    return { destination: row.destination, status: 'error', message };
  }
  if (googleUnsure(row) && !options.force) return { destination: row.destination, status: 'unknown', message: row.message || NO_ANSWER() };
  try {
    const remoteId = await PUSH[row.destination](env, row, options);
    await setStatus(env, row, 'sent', null, remoteId);
    return { destination: row.destination, status: 'sent', remoteId: remoteId ?? row.remote_id ?? null };
  } catch (error) {
    console.error('Activity send failed', row.destination, error.message);
    // No answer to a first send: it may be there, so the next try looks before it sends again.
    if (error.noAnswer && !row.remote_id) {
      const message = NO_ANSWER();
      await setStatus(env, row, 'unknown', message);
      return { destination: row.destination, status: 'unknown', message };
    }
    const message = failure(row.destination, error);
    await setStatus(env, row, 'error', message);
    return { destination: row.destination, status: 'error', message, ...(error.scope ? { needsScope: error.scope } : {}) };
  }
}

// A done activity to every destination the user sends activities to. Returns
// one entry per destination it went to (sent or error); Apple Health is
// written by the iPhone and is not in the list. `googleToken` makes the
// Google access token (index.js googleToken).
export async function sendActivity(env, input, { fetchImpl = fetch, googleToken = null } = {}) {
  const activity = normalizeActivity(input);
  await ensureSyncTables(env.DB);
  const sends = [];
  for (const destination of SERVER_DESTINATIONS) {
    const prefs = await readSyncPrefs(env.DB, env.USER_ID, destination);
    if (!prefs.pushActivities || !offered(env, destination) || !destinationConnected(env, destination)) continue;
    // A changed activity (the same key) is sent again with its new content; a
    // first send nobody answered stays 'unknown', so Google Health is not sent twice.
    await env.DB.prepare(`INSERT INTO sync_sends (user_id, activity_key, destination, status, payload_json) VALUES (?, ?, ?, 'pending', ?)
      ON CONFLICT(user_id, activity_key, destination) DO UPDATE SET payload_json = excluded.payload_json,
        status = CASE WHEN sync_sends.status = 'unknown' AND sync_sends.remote_id IS NULL THEN 'unknown' ELSE 'pending' END,
        message = CASE WHEN sync_sends.status = 'unknown' AND sync_sends.remote_id IS NULL THEN sync_sends.message ELSE NULL END, attempts = 0, updated_at = CURRENT_TIMESTAMP`)
      .bind(env.USER_ID, activity.key, destination, JSON.stringify(activity)).run();
    const row = await env.DB.prepare('SELECT * FROM sync_sends WHERE user_id = ? AND activity_key = ? AND destination = ?').bind(env.USER_ID, activity.key, destination).first();
    sends.push(await deliver(env, row, { fetchImpl, googleToken }));
  }
  return { status: 'ok', key: activity.key, sends };
}

// GET /app/api/sync/sends?key=…: the activity's state per destination.
export async function activitySends(env, key) {
  if (!KEY.test(String(key || ''))) return [];
  try {
    const rows = (await env.DB.prepare('SELECT destination, status, remote_id, message, updated_at FROM sync_sends WHERE user_id = ? AND activity_key = ?').bind(env.USER_ID, key).all()).results || [];
    return rows.map(r => ({ destination: r.destination, status: r.status, remoteId: r.remote_id || null, message: r.message || null, updatedAt: r.updated_at }));
  } catch (error) {
    if (/no such table/i.test(error.message)) return [];
    throw error;
  }
}

// "Zkusit znovu": one destination of one activity again.
export async function retrySend(env, key, destination, { fetchImpl = fetch, googleToken = null } = {}) {
  await ensureSyncTables(env.DB);
  const row = await env.DB.prepare('SELECT * FROM sync_sends WHERE user_id = ? AND activity_key = ? AND destination = ?').bind(env.USER_ID, String(key || ''), String(destination || '')).first();
  if (!row) throw Object.assign(new Error(L('Odeslání nebylo nalezeno.', 'The send wasn\'t found.')), { status: 404 });
  return deliver(env, row, { fetchImpl, googleToken, force: true });
}

// Cron: sends that never started, failed only a few times or got no answer
// where a second try is safe (Intervals.icu looks the activity up first,
// Strava refuses a repeated external_id). Google Health waits for the user.
export async function retrySyncSends(env, { fetchImpl = fetch, googleToken = null, limit = 10 } = {}) {
  let rows = [];
  try {
    rows = (await env.DB.prepare("SELECT * FROM sync_sends WHERE user_id = ? AND destination IN ('google', 'intervals', 'strava') AND status IN ('pending', 'error', 'unknown') AND NOT (destination = 'google' AND status = 'unknown') AND attempts < 3 AND updated_at < datetime('now', '-5 minutes') ORDER BY updated_at LIMIT ?").bind(env.USER_ID, limit).all()).results || [];
  } catch (error) {
    if (/no such table/i.test(error.message)) return [];
    throw error;
  }
  const results = [];
  for (const row of rows) if (destinationConnected(env, row.destination)) results.push(await deliver(env, row, { fetchImpl, googleToken }));
  return results;
}

// The Intervals.icu ids of activities the app sent there, so the activity
// import skips them (the app keeps its own copy).
export async function sentIntervalsIds(db, userId) {
  try {
    const rows = (await db.prepare("SELECT remote_id FROM sync_sends WHERE user_id = ? AND destination = 'intervals' AND remote_id IS NOT NULL").bind(userId).all()).results || [];
    return new Set(rows.map(r => String(r.remote_id)));
  } catch { return new Set(); }
}
export const sentByLoadwise = activity => /^loadwise:/.test(String(activity?.external_id || ''));
