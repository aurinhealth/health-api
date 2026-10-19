// Wahoo (Settings → Zdroje dat → Wahoo): the day's planned ride or run goes to
// the ELEMNT and the KICKR, and the done ones come back as activities.
//
// Needs the app registered at developers.wahooligan.com (var WAHOO_CLIENT_ID,
// secret WAHOO_CLIENT_SECRET); without them Wahoo is not offered. The tokens
// are stored per user (connection-secrets.js, provider "wahoo") as JSON with
// the Wahoo user id, which the webhook names. A refresh gives a new pair, so
// it is saved.
//
// Done workouts arrive by the webhook (/webhooks/wahoo, checked against
// WAHOO_WEBHOOK_TOKEN), on connecting (FIRST_IMPORT_DAYS) and with
// "Synchronizovat vše". They are stored as source_family 'wahoo', data_type
// 'activity', in the shape of an Intervals.icu activity (type, moving_time,
// icu_training_load, …), so the calendar, the load and the coach read them
// like the others; activity-match.js keeps one copy when the same ride also
// came through Intervals.icu or a watch.
//
// Planned rides and runs (local_workouts) are exported as a Wahoo plan (its JSON
// file: header and intervals) and a workout on the day that points to it; the
// export state is a workout_exports row with provider 'wahoo'. Wahoo's
// Sandbox allows 25 requests in 5 minutes and 250 a day for the whole app, so
// nothing polls Wahoo: a failed export waits for the next retry.
//
// Wahoo's terms: data deleted on disconnecting, the connection itself never paid.
import { exportDue, failedExport } from './export-retry.js';
import { saveConnectionSecret, deleteConnectionSecret, refreshConnectionTokens, tokensDue } from './connection-secrets.js';
import { connectReturn, connectReturnUrl } from './connect-return.js';
import { appOrigin } from './app-origin.js';
import { markConnectionBroken, markConnectionOk, clearConnectionHealth } from './connection-health.js';
import { healthPointJson } from './health-point-json.js';
import { localDateTime, localToday, zonedTime, withTimeZone, validTimeZone } from './user-time.js';
import { parseIntervalsWorkoutText } from './planned-workout.js';
import { outdoorWidth, n } from './workout-model.js';
import { readSyncPrefs } from './sync-destinations.js';
import { timingSafeEqualString } from './dashboard-auth.js';
import { athleteThresholds } from './intervals-athlete.js';
import { L } from './lang.js';

export const SOURCE = 'wahoo';
const STATE_COOKIE = 'pfd_wahoo_oauth_state';
const API = 'https://api.wahooligan.com';
const AUTHORIZE = API + '/oauth/authorize';
const TOKEN = API + '/oauth/token';
// The scopes asked for in the Wahoo application, nothing more.
export const WAHOO_SCOPES = ['user_read', 'workouts_read', 'workouts_write', 'plans_read', 'plans_write', 'power_zones_read', 'offline_data'];
export const FIRST_IMPORT_DAYS = 61;

export function wahooConfigured(env) {
  return Boolean(String(env.WAHOO_CLIENT_ID || '').trim() && String(env.WAHOO_CLIENT_SECRET || '').trim());
}

const redirectUri = (env, request) => appOrigin(env, request) + '/oauth/wahoo/callback';
const clearState = STATE_COOKIE + '=; Path=/oauth/wahoo; Max-Age=0; Secure; HttpOnly; SameSite=Lax';
const back = (location, cookie = clearState) => new Response(null, { status: 302, headers: { Location: location, 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });

// The stored tokens as { access_token, refresh_token, expires_at (seconds), user_id }.
export function readWahooTokens(env) {
  try { const t = JSON.parse(env.WAHOO_TOKEN || ''); return t?.access_token ? t : null; } catch { return null; }
}
const tokensText = (data, userId, now = Date.now()) => JSON.stringify({
  access_token: String(data.access_token || ''), refresh_token: String(data.refresh_token || ''),
  expires_at: Number(data.expires_in) ? Math.floor(now / 1000) + Number(data.expires_in) : 0,
  user_id: userId == null ? null : String(userId)
});

async function tokenRequest(env, params, fetchImpl) {
  const response = await fetchImpl(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: String(env.WAHOO_CLIENT_ID).trim(), client_secret: String(env.WAHOO_CLIENT_SECRET).trim(), ...params }),
    signal: AbortSignal.timeout(15000)
  }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) : {};
  return response?.ok && data.access_token ? data : null;
}

export async function handleWahooOAuth(request, env, pathname, fetchImpl = fetch) {
  if (pathname === '/oauth/wahoo' && request.method === 'GET') {
    if (!wahooConfigured(env)) return back(connectReturnUrl(connectReturn(request), 'wahoo-failed'));
    const state = crypto.randomUUID();
    const u = new URL(AUTHORIZE);
    u.searchParams.set('client_id', String(env.WAHOO_CLIENT_ID).trim());
    u.searchParams.set('redirect_uri', redirectUri(env, request));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', WAHOO_SCOPES.join(' '));
    u.searchParams.set('state', state);
    return back(u.toString(), STATE_COOKIE + '=' + encodeURIComponent(state + '.' + connectReturn(request)) + '; Max-Age=600; Path=/oauth/wahoo; Secure; HttpOnly; SameSite=Lax');
  }
  if (pathname !== '/oauth/wahoo/callback' || request.method !== 'GET') return null;
  const url = new URL(request.url), code = url.searchParams.get('code'), state = url.searchParams.get('state');
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + STATE_COOKIE + '=([^;]+)'));
  const [expected, to] = decodeURIComponent(m?.[1] || '').split('.');
  if (!state || state !== expected) return back(connectReturnUrl('settings', 'wahoo-failed'));
  if (url.searchParams.get('error') || !code) return back(connectReturnUrl(to, 'wahoo-cancelled'));
  if (!wahooConfigured(env)) return back(connectReturnUrl(to, 'wahoo-failed'));
  const data = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(env, request) }, fetchImpl);
  if (!data) { console.error('Wahoo OAuth token exchange failed'); return back(connectReturnUrl(to, 'wahoo-failed')); }
  // The Wahoo user id: the webhook says whose workout it brings by it.
  const user = await fetchImpl(API + '/v1/user', { headers: { Authorization: 'Bearer ' + data.access_token, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  const text = tokensText(data, user?.id ?? null);
  await saveConnectionSecret(env, SOURCE, text);
  await clearConnectionHealth(env, SOURCE);
  env.WAHOO_TOKEN = text;
  return back(connectReturnUrl(to, 'wahoo'));
}

// A valid access token, refreshed (and the new pair saved) when it is about to run out.
export async function wahooAccessToken(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const tokens = readWahooTokens(env);
  if (!tokens) throw new Error(L('Wahoo není připojené.', 'Wahoo isn\'t connected.'));
  if (!tokensDue(tokens, now)) return tokens.access_token;
  if (!tokens.refresh_token || !wahooConfigured(env)) throw Object.assign(new Error('Wahoo HTTP 401'), { status: 401 });
  // One request refreshes at a time; the others take the pair it saved (connection-secrets.js).
  const text = await refreshConnectionTokens(env, SOURCE, env.WAHOO_TOKEN, async t => {
    const data = t?.refresh_token && await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: t.refresh_token }, fetchImpl);
    return data ? tokensText({ refresh_token: t.refresh_token, ...data }, t.user_id ?? tokens.user_id, now) : null;
  }, { now });
  if (!text) throw Object.assign(new Error('Wahoo HTTP 401'), { status: 401 });
  env.WAHOO_TOKEN = text;
  return readWahooTokens(env).access_token;
}

// One API call; `form` is sent as Wahoo's form fields (plan[file]=…). A 401 or
// 403 marks the connection broken; a 429 (the Sandbox limit) only waits.
async function wahooApi(env, path, { method = 'GET', form = null, fetchImpl = fetch, now = Date.now() } = {}) {
  const token = await wahooAccessToken(env, { fetchImpl, now });
  let response;
  try {
    response = await fetchImpl(API + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(form ? { body: new URLSearchParams(form) } : {}),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) { throw Object.assign(new Error('No answer: ' + (error?.name || error?.message)), { noAnswer: true }); }
  if (response.status === 401 || response.status === 403) await markConnectionBroken(env, SOURCE, 'Wahoo HTTP ' + response.status);
  if (!response.ok && !(method === 'DELETE' && response.status === 404)) throw Object.assign(new Error('Wahoo HTTP ' + response.status), { status: response.status });
  return response.status === 204 ? null : response.json().catch(() => null);
}

// ---- Done workouts ----

// Wahoo's workout_type_id → the Intervals.icu type the rest of the app reads.
const INDOOR_RIDE = new Set([12, 49, 61, 68]), RIDE = new Set([0, 11, 13, 14, 15, 16, 64, 70]);
const RUN = new Set([1, 3, 4, 67]), INDOOR_RUN = new Set([5, 71]);
export function wahooActivityType(id) {
  const t = Number(id);
  return INDOOR_RIDE.has(t) ? 'VirtualRide' : RIDE.has(t) ? 'Ride' : RUN.has(t) ? 'Run' : INDOOR_RUN.has(t) ? 'VirtualRun' : t === 6 ? 'Walk' : 'Workout';
}
const typeId = (type, indoor) => /run/i.test(type) ? (indoor ? 5 : 1) : (indoor ? 61 : 0);

const num = (v, lo = 0, hi = Infinity) => { const x = Number(v); return v !== null && v !== undefined && v !== '' && Number.isFinite(x) && x >= lo && x <= hi ? x : null; };
const isoOf = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().replace('.000Z', 'Z') : null; };
const round = (v, d = 0) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
const localIn = (zone, iso) => (validTimeZone(zone) ? withTimeZone(zone, () => localDateTime(iso)) : localDateTime(iso)) + ':00';

// A Wahoo workout with its summary as a health_datapoints row; null for a
// workout not done yet (the plans Aurin sent are workouts too).
export function wahooActivityRow(workout, summary = workout?.workout_summary) {
  if (!workout?.id || !summary || typeof summary !== 'object') return null;
  const start = isoOf(workout.starts);
  if (!start) return null;
  const moving = num(summary.duration_active_accum, 1, 86400) ?? (num(workout.minutes, 1, 1440) ? workout.minutes * 60 : null);
  if (!moving) return null;
  const elapsed = num(summary.duration_total_accum, 1, 86400) ?? moving;
  const end = new Date(Date.parse(start) + elapsed * 1000).toISOString().replace('.000Z', 'Z');
  const type = wahooActivityType(workout.workout_type_id);
  const startLocal = localIn(summary.time_zone, start), endLocal = localIn(summary.time_zone, end);
  const payload = {
    id: 'wahoo:' + workout.id, name: String(workout.name || summary.name || '').slice(0, 180) || (/run/i.test(type) ? L('Běh', 'Run') : L('Jízda', 'Ride')), type,
    start_date: start, start_date_local: startLocal, moving_time: Math.round(moving), elapsed_time: Math.round(elapsed),
    distance: round(num(summary.distance_accum)), total_elevation_gain: round(num(summary.ascent_accum)),
    average_heartrate: round(num(summary.heart_rate_avg, 20, 250)), average_cadence: round(num(summary.cadence_avg, 1, 250)),
    average_speed: round(num(summary.speed_avg), 2), calories: round(num(summary.calories_accum, 1, 20000)),
    icu_average_watts: round(num(summary.power_avg, 1, 2500)), icu_weighted_avg_watts: round(num(summary.power_bike_np_last, 1, 2500)),
    icu_training_load: round(num(summary.power_bike_tss_last, 0, 1000)),
    source: 'WAHOO', wahoo: { workoutId: workout.id, planId: workout.plan_id ?? null, token: workout.workout_token ?? null, typeId: workout.workout_type_id ?? null }
  };
  for (const k of Object.keys(payload)) if (payload[k] == null) delete payload[k];
  return { data_type: 'activity', external_id: 'wahoo:' + workout.id, sample_time: startLocal, start_time: startLocal, end_time: endLocal, value_numeric: null, value_unit: null, payload };
}

const upsert = (db, userId, r) => db.prepare(
  `INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json, record_role)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'primary')
   ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET
     sample_time = excluded.sample_time, start_time = excluded.start_time, end_time = excluded.end_time, payload_json = excluded.payload_json, updated_at = CURRENT_TIMESTAMP
   WHERE health_datapoints.payload_json IS NOT excluded.payload_json OR health_datapoints.start_time IS NOT excluded.start_time`
).bind(userId, SOURCE, r.data_type, r.external_id, r.sample_time, r.start_time, r.end_time, r.value_numeric, r.value_unit, healthPointJson(r.payload));

async function saveRows(env, rows) {
  const userId = env.USER_ID ?? env.DB.userId;
  for (let i = 0; i < rows.length; i += 50) await env.DB.batch(rows.slice(i, i + 50).map(r => upsert(env.DB, userId, r)));
  return rows.length;
}
const pulling = async env => (await readSyncPrefs(env.DB, env.USER_ID ?? env.DB.userId, SOURCE)).pullActivities;

// Done workouts of the last `days` days, newest first, 30 a page.
export async function syncWahoo(env, { days = 3, fetchImpl = fetch, now = Date.now(), maxPages = 4 } = {}) {
  if (!readWahooTokens(env)) return { status: 'skipped' };
  if (!(await pulling(env))) return { status: 'off' };
  const since = now - days * 86400000, rows = [];
  try {
    for (let page = 1; page <= maxPages; page++) {
      const data = await wahooApi(env, '/v1/workouts?page=' + page + '&per_page=30', { fetchImpl, now });
      const list = Array.isArray(data?.workouts) ? data.workouts : [];
      for (const w of list) { const row = wahooActivityRow(w); if (row && Date.parse(row.payload.start_date) >= since) rows.push(row); }
      const oldest = Math.min(...list.map(w => Date.parse(w.starts)).filter(Number.isFinite));
      if (list.length < 30 || !(oldest >= since)) break;
    }
  } catch (error) {
    return { status: 'error', message: error.message };
  }
  const saved = await saveRows(env, rows);
  await markConnectionOk(env, SOURCE);
  return { status: 'ok', saved };
}

// POST /webhooks/wahoo: a finished workout. `forUser(wahooUserId, fn)` runs fn
// with the env of the Aurin user connected to that Wahoo account. Anything
// else than our token is refused; a workout of nobody we know is acknowledged,
// so Wahoo does not keep sending it.
export async function handleWahooWebhook(request, env, forUser) {
  const expected = String(env.WAHOO_WEBHOOK_TOKEN || '');
  const body = await request.json().catch(() => null);
  if (!expected || !body || !timingSafeEqualString(String(body.webhook_token || ''), expected)) return new Response(null, { status: 401 });
  const summary = body.workout_summary, workout = summary?.workout;
  if (body.event_type !== 'workout_summary' || !workout || body.user?.id == null) return Response.json({ status: 'ignored' });
  const row = wahooActivityRow(workout, summary);
  if (!row) return Response.json({ status: 'ignored' });
  await forUser(String(body.user.id), async scoped => {
    if (!(await pulling(scoped))) return { status: 'off' };
    // Within the user's zone: wahooActivityRow reads the local start in it.
    return { status: 'ok', saved: await saveRows(scoped, [wahooActivityRow(workout, summary)]) };
  });
  return Response.json({ status: 'ok' });
}

// ---- Planned workouts ----

// The intensity label Wahoo shows with a step.
function intensity(power, first, last) {
  if (first && power <= 75) return 'wu';
  if (last && power <= 60) return 'cd';
  return power < 56 ? 'recover' : power < 76 ? 'active' : power < 88 ? 'tempo' : power < 106 ? 'lt' : power < 121 ? 'map' : 'ac';
}
// % FTP (ride) or % threshold speed (run) as perceived effort, when the athlete's own value is unknown.
const RPE = [[56, 2], [76, 3], [88, 5], [95, 6], [106, 7], [121, 8], [Infinity, 9]];
const rpeOf = p => RPE.find(([hi]) => p < hi)[1];

// One step's targets: relative to the FTP or threshold speed in the header, a
// range outside, the cadence after it (the head unit shows only the first).
function targets(step, { sport, outdoor, relative }) {
  if (/bez cíle|no target/i.test(String(step.note || ''))) return [];
  const p = n(step.power, 55), w = outdoor ? outdoorWidth(p, sport) : 0;
  const out = relative
    ? [{ type: sport === 'run' ? 'threshold_speed' : 'ftp', low: round((p - w) / 100, 2), high: round((p + w) / 100, 2) }]
    : [{ type: 'rpe', low: rpeOf(p), high: rpeOf(p) }];
  const cad = String(step.cadence || '').match(/(\d{2,3})(?:-(\d{2,3}))?/);
  if (sport === 'ride' && cad) out.push({ type: 'rpm', low: Number(cad[1]), high: Number(cad[2] || cad[1]) });
  return out;
}
// A ramp has no Wahoo target of its own: a few steps of a minute or more.
function expand(step) {
  if (!step.ramp || n(step.powerStart) == null || n(step.powerEnd) == null) return [step];
  const parts = Math.max(1, Math.min(6, Math.floor(n(step.durationMinutes, 0))));
  return Array.from({ length: parts }, (_, i) => ({ ...step, ramp: false, durationMinutes: step.durationMinutes / parts, power: step.powerStart + (step.powerEnd - step.powerStart) * (i + .5) / parts }));
}

// The planned event (Intervals.icu shape: type, name, description with the
// steps, moving_time) as Wahoo's plan file.
export function wahooPlan(event, { ftp = null, thresholdPace = null } = {}) {
  const sport = /run/i.test(String(event.type || '')) ? 'run' : 'ride', outdoor = !/virtual/i.test(String(event.type || ''));
  const speed = thresholdPace > 0 ? round(1000 / thresholdPace, 3) : null;
  const relative = sport === 'run' ? Boolean(speed) : Boolean(ftp);
  const structure = parseIntervalsWorkoutText(event.description || '', sport);
  const opts = { sport, outdoor, relative };
  const interval = (s, first, last, rest = false) => ({
    ...(s.note && !/bez cíle|no target/i.test(s.note) ? { name: String(s.note).slice(0, 60) } : {}),
    exit_trigger_type: 'time', exit_trigger_value: Math.max(1, Math.round(n(s.durationMinutes, 0) * 60)),
    intensity_type: rest && n(s.power, 55) < 66 ? 'rest' : intensity(n(s.power, 55), first, last),
    targets: targets(s, opts)
  });
  const intervals = [];
  structure.forEach((block, i) => {
    const first = i === 0, last = i === structure.length - 1;
    if (Array.isArray(block.steps)) {
      const inner = block.steps.flatMap(expand).map((s, j, all) => interval(s, false, false, all.length > 1 && j === all.length - 1));
      intervals.push(block.repeats > 1 ? { exit_trigger_type: 'repeat', exit_trigger_value: block.repeats - 1, intervals: inner } : { exit_trigger_type: 'repeat', exit_trigger_value: 0, intervals: inner });
    } else intervals.push(...expand(block).map(s => interval(s, first, last)));
  });
  // A plan without steps (typed in by hand): its length only.
  if (!intervals.length) intervals.push({ exit_trigger_type: 'time', exit_trigger_value: Math.max(60, Math.round(n(event.moving_time, 3600))), intensity_type: 'active', targets: [] });
  const notes = String(event.description || '').split(/\r?\n/).filter(l => l.trim() && !/^\s*-/.test(l) && !/^(\d+\s*x|warm ?up|cool ?down|main set)\b/i.test(l.trim())).join('\n').slice(0, 5000);
  return {
    header: {
      name: String(event.name || '').slice(0, 120) || (sport === 'run' ? L('Běh', 'Run') : L('Jízda', 'Ride')), version: '1.0.0',
      ...(notes ? { description: notes } : {}),
      workout_type_family: sport === 'run' ? 1 : 0, workout_type_location: outdoor ? 1 : 0,
      ...(sport === 'ride' && ftp ? { ftp: Math.round(ftp) } : {}), ...(sport === 'run' && speed ? { threshold_speed: speed } : {})
    },
    intervals
  };
}
const b64 = text => { const bytes = new TextEncoder().encode(text); let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const planFile = plan => 'data:application/json;base64,' + b64(JSON.stringify(plan));

// Rides and runs only; the gym and nutrition events stay out of Wahoo.
const exportable = event => /^(Virtual)?(Ride|Run)$|^(Gravel|MountainBike)Ride$/i.test(String(event?.type || '')) && !/nutrition/i.test(String(event?.category || ''));
const eventDay = event => String(event?.start_date_local || '').slice(0, 10);

// When the plan starts on the head unit's calendar: the planned time, or 6:00 for a whole-day plan.
function startsAt(event) {
  const local = String(event.start_date_local || '');
  const at = zonedTime(/T00:00(:00)?$/.test(local) || local.length === 10 ? local.slice(0, 10) + 'T06:00:00' : local.slice(0, 19));
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

async function exportRow(db, userId, localId) {
  return db.prepare("SELECT * FROM workout_exports WHERE user_id=? AND local_id=? AND provider='wahoo'").bind(userId, localId).first();
}
const setExport = (db, userId, localId, fields) => {
  const keys = Object.keys(fields);
  return db.prepare(`INSERT INTO workout_exports(user_id,local_id,provider,${keys.join(',')}) VALUES(?,?,'wahoo',${keys.map(() => '?').join(',')})
    ON CONFLICT(user_id,local_id,provider) DO UPDATE SET ${keys.map(k => k + '=excluded.' + k).join(',')},updated_at=CURRENT_TIMESTAMP`).bind(userId, localId, ...keys.map(k => fields[k])).run();
};

// Sends one planned workout (local_workouts id) to Wahoo, changes or removes
// it there. `thresholds` gives the FTP and threshold pace for the plan's targets.
export async function syncWahooWorkout(env, localId, { fetchImpl = fetch, now = Date.now(), thresholds = null } = {}) {
  if (!readWahooTokens(env)) return { status: 'not_connected' };
  const db = env.DB, userId = env.USER_ID ?? db.userId;
  const row = await db.prepare('SELECT * FROM local_workouts WHERE user_id=? AND id=?').bind(userId, String(localId).replace(/^planned:/, '')).first().catch(() => null);
  if (!row) return { status: 'not_found' };
  const event = JSON.parse(row.event_json || '{}');
  if (!exportable(event)) return { status: 'skipped' };
  const exported = await exportRow(db, userId, row.id);
  const [planId, workoutId] = String(exported?.remote_id || '').split(':');
  if (exported?.status === 'synced' && exported.revision === row.revision) return { status: 'synced', eventId: exported.remote_id };
  // Only what is still ahead goes out; something already there is still changed or removed.
  if (!workoutId && (row.status !== 'scheduled' || eventDay(event) < localToday(new Date(now)) || !(await readSyncPrefs(db, userId, SOURCE)).pushPlanned)) {
    if (exported) await setExport(db, userId, row.id, { status: 'off', revision: row.revision });
    return { status: 'off' };
  }
  if (row.status === 'completed' && workoutId) { await setExport(db, userId, row.id, { status: 'synced', revision: row.revision }); return { status: 'synced', eventId: exported.remote_id }; }
  const claimed = await db.prepare("UPDATE workout_exports SET status='running',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND local_id=? AND provider='wahoo' AND (status!='running' OR updated_at<datetime('now','-5 minutes'))").bind(userId, row.id).run();
  if (exported && !claimed.meta?.changes) return { status: 'pending' };
  if (!exported) await setExport(db, userId, row.id, { status: 'running', revision: 0 });
  try {
    let remote = exported?.remote_id || null;
    if (row.status === 'deleted') {
      if (workoutId) await wahooApi(env, '/v1/workouts/' + encodeURIComponent(workoutId), { method: 'DELETE', fetchImpl, now });
      if (planId) await wahooApi(env, '/v1/plans/' + encodeURIComponent(planId), { method: 'DELETE', fetchImpl, now });
      remote = null;
    } else {
      const plan = wahooPlan(event, { ftp: thresholds?.ftp ? (/virtual/i.test(event.type) ? thresholds.indoorFtp || Math.round(thresholds.ftp * .95) : thresholds.ftp) : null, thresholdPace: thresholds?.runThresholdPace || null });
      const updated = new Date(now).toISOString(), starts = startsAt(event), minutes = Math.max(1, Math.round(n(event.moving_time, 3600) / 60));
      const workout = { 'workout[name]': plan.header.name, 'workout[workout_type_id]': String(typeId(event.type, /virtual/i.test(event.type))), 'workout[starts]': starts, 'workout[minutes]': String(minutes) };
      const file = { 'plan[file]': planFile(plan), 'plan[filename]': 'aurin-' + row.id + '.json', 'plan[provider_updated_at]': updated };
      let plannedId = planId;
      if (plannedId) await wahooApi(env, '/v1/plans/' + encodeURIComponent(plannedId), { method: 'PUT', form: file, fetchImpl, now });
      else {
        const saved = await wahooApi(env, '/v1/plans', { method: 'POST', form: { ...file, 'plan[external_id]': row.id }, fetchImpl, now });
        if (saved?.id == null) throw new Error(L('Wahoo nepotvrdilo uložení plánu.', 'Wahoo didn\'t confirm the plan.'));
        plannedId = String(saved.id);
        // Kept at once: a lost answer to the workout must not make a second plan.
        await setExport(db, userId, row.id, { remote_id: plannedId + ':' });
      }
      let doneId = workoutId;
      if (doneId) await wahooApi(env, '/v1/workouts/' + encodeURIComponent(doneId), { method: 'PUT', form: workout, fetchImpl, now });
      else {
        const saved = await wahooApi(env, '/v1/workouts', { method: 'POST', form: { ...workout, 'workout[workout_token]': row.id, 'workout[plan_id]': plannedId }, fetchImpl, now });
        if (saved?.id == null) throw new Error(L('Wahoo nepotvrdilo uložení tréninku.', 'Wahoo didn\'t confirm the workout.'));
        doneId = String(saved.id);
      }
      remote = plannedId + ':' + doneId;
    }
    await db.prepare("UPDATE workout_exports SET remote_id=?,revision=?,status=CASE WHEN ?=(SELECT revision FROM local_workouts WHERE user_id=? AND id=?) THEN 'synced' ELSE 'pending' END,attempts=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND local_id=? AND provider='wahoo'")
      .bind(remote, row.revision, row.revision, userId, row.id, userId, row.id).run();
    return { status: 'synced', eventId: remote };
  } catch (error) {
    // Wahoo's limit (429) counts as a failure too: it waits like any other.
    await db.prepare(`UPDATE workout_exports SET ${failedExport},updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND local_id=? AND provider='wahoo'`).bind(userId, row.id).run();
    return { status: 'error', message: L('Trénink je uložený v aplikaci. Do Wahoo se zatím neodeslal; zkusí se to znovu.', 'The workout is saved in the app. It hasn\'t reached Wahoo yet; it will be tried again.') };
  }
}

// Exports waiting or failed, and the plans of the next 14 days Wahoo has not
// had yet (after connecting, or turning Plánované tréninky on). Few at a time:
// the Sandbox limit is the whole app's.
export async function retryWahooExports(env, { limit = 4, fetchImpl = fetch, now = Date.now(), thresholds = null } = {}) {
  if (!readWahooTokens(env)) return [];
  const db = env.DB, userId = env.USER_ID ?? db.userId, today = localToday(new Date(now));
  const until = new Date(Date.parse(today + 'T12:00:00Z') + 14 * 86400000).toISOString().slice(0, 10);
  const due = (await db.prepare(`SELECT l.id FROM local_workouts l LEFT JOIN workout_exports e ON e.user_id=l.user_id AND e.local_id=l.id AND e.provider='wahoo'
    WHERE l.user_id=? AND (((e.local_id IS NULL OR (e.status='off' AND e.remote_id IS NULL)) AND l.status='scheduled' AND substr(json_extract(l.event_json,'$.start_date_local'),1,10) BETWEEN ? AND ?)
      OR ${exportDue('e.')})
    ORDER BY l.updated_at LIMIT 20`).bind(userId, today, until).all().catch(() => ({ results: [] }))).results || [];
  const results = [];
  // The FTP and threshold pace for the targets, asked for only when something goes out.
  if (due.length && !thresholds) thresholds = await athleteThresholds(env, fetchImpl).catch(() => null);
  for (const { id } of due) {
    if (results.filter(r => r.status !== 'skipped' && r.status !== 'off').length >= limit) break;
    results.push(await syncWahooWorkout(env, id, { fetchImpl, now, thresholds }));
  }
  return results;
}

// Wahoo forgets Aurin's access (also when the Aurin account is deleted).
export async function revokeWahoo(env, fetchImpl = fetch) {
  const tokens = readWahooTokens(env);
  if (!tokens) return 'none';
  // An expired access token is refreshed first, else the revoke is refused.
  const token = await wahooAccessToken(env, { fetchImpl }).catch(() => tokens.access_token);
  const response = await fetchImpl(API + '/v1/permissions', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  return response?.ok ? 'revoked' : 'failed';
}
// Disconnecting: Wahoo's access is revoked (Wahoo removes the plans Aurin
// made, as set in its app settings) and every Wahoo activity is deleted here.
export async function disconnectWahoo(env, { fetchImpl = fetch } = {}) {
  await revokeWahoo(env, fetchImpl);
  const userId = env.USER_ID ?? env.DB.userId;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM health_datapoints WHERE user_id = ? AND source_family = '${SOURCE}'`).bind(userId),
    // Copies that stood aside for a Wahoo activity count again (activity matching pairs them anew).
    env.DB.prepare("UPDATE health_datapoints SET record_role='primary',matched_activity_id=NULL,match_confidence=NULL WHERE user_id=? AND matched_activity_id LIKE 'wahoo:%' AND record_role='duplicate'").bind(userId)
  ]);
  await env.DB.prepare("DELETE FROM workout_exports WHERE user_id=? AND provider='wahoo'").bind(userId).run().catch(() => null);
  await deleteConnectionSecret(env, SOURCE);
  await clearConnectionHealth(env, SOURCE);
  delete env.WAHOO_TOKEN;
  return { status: 'ok' };
}
