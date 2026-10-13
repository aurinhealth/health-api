// Ultrahuman Ring as a health source (Settings → Zdroje dat → Ultrahuman): the
// night's sleep and stages, HRV, resting heart rate, skin temperature and
// VO2max feed readiness like Apple Health and Google Health do. Nothing is
// written to Ultrahuman, and the ring's data is not passed on to other
// services (the Intervals.icu wellness copy reads only Apple and Google).
//
// Needs an OAuth app registered in Ultrahuman's developer portal (var
// ULTRAHUMAN_CLIENT_ID, secret ULTRAHUMAN_CLIENT_SECRET); without them
// Ultrahuman is not offered. The tokens are stored per user like the other
// connections (connection-secrets.js, provider "ultrahuman") as JSON and
// refreshed when they run out.
//
// The rows go to health_datapoints as source_family 'ultrahuman' with the
// same data types and payload shapes as Apple Health (apple-health.js), so
// sleep, readiness and the night detail read them without knowing the source.
// The ring also writes to Apple Health, so the same night can arrive twice: on
// the days the ring has a value, the Apple and Google rows of that type become
// record_role 'duplicate' (matched_activity_id 'ultrahuman'). Disconnecting
// deletes the ring's rows and gives those days back to the other sources.
import { saveConnectionSecret, deleteConnectionSecret } from './connection-secrets.js';
import { connectReturn, connectReturnUrl } from './connect-return.js';
import { appOrigin } from './app-origin.js';
import { markConnectionBroken, markConnectionOk, clearConnectionHealth } from './connection-health.js';
import { healthPointJson } from './health-point-json.js';
import { localDate } from './user-time.js';
import { L } from './lang.js';

export const SOURCE = 'ultrahuman';
const STATE_COOKIE = 'pfd_ultrahuman_oauth_state';
const AUTHORIZE = 'https://auth.ultrahuman.com/authorise';
const TOKEN = 'https://partner.ultrahuman.com/api/partners/oauth/token';
const REVOKE = 'https://partner.ultrahuman.com/api/partners/oauth/revoke';
const API = 'https://partner.ultrahuman.com/api/partners/v1';
export const ULTRAHUMAN_SCOPES = ['ring_data', 'profile'];
// The first import reaches back as far as readiness compares (its 60-day baseline).
export const FIRST_IMPORT_DAYS = 61;
// Data types the ring sends; on its days the other wearables' rows of these types step aside.
export const RING_TYPES = ['daily-resting-heart-rate', 'daily-heart-rate-variability', 'daily-vo2-max', 'daily-skin-temperature-deviation', 'sleep'];
const OTHERS = "('apple-health','google-wearables')";
const DAY_OF = "substr(COALESCE(sample_time,end_time,start_time),1,10)";

export function ultrahumanConfigured(env) {
  return Boolean(String(env.ULTRAHUMAN_CLIENT_ID || '').trim() && String(env.ULTRAHUMAN_CLIENT_SECRET || '').trim());
}

const redirectUri = (env, request) => appOrigin(env, request) + '/oauth/ultrahuman/callback';
const clearState = STATE_COOKIE + '=; Path=/oauth/ultrahuman; Max-Age=0; Secure; HttpOnly; SameSite=Lax';
const back = (location, cookie = clearState) => new Response(null, { status: 302, headers: { Location: location, 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });

// The stored tokens as { access_token, refresh_token, expires_at } (seconds).
export function readUltrahumanTokens(env) {
  try { const t = JSON.parse(env.ULTRAHUMAN_TOKEN || ''); return t?.access_token ? t : null; } catch { return null; }
}
const tokensText = (data, now = Date.now()) => JSON.stringify({
  access_token: String(data.access_token || ''), refresh_token: String(data.refresh_token || ''),
  expires_at: Number(data.expires_at) || (Number(data.expires_in) ? Math.floor(now / 1000) + Number(data.expires_in) : 0)
});

async function tokenRequest(env, params, fetchImpl) {
  const response = await fetchImpl(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: String(env.ULTRAHUMAN_CLIENT_ID).trim(), client_secret: String(env.ULTRAHUMAN_CLIENT_SECRET).trim(), ...params }),
    signal: AbortSignal.timeout(15000)
  }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) : {};
  return response?.ok && data.access_token ? data : null;
}

export async function handleUltrahumanOAuth(request, env, pathname, fetchImpl = fetch) {
  if (pathname === '/oauth/ultrahuman' && request.method === 'GET') {
    if (!ultrahumanConfigured(env)) return back(connectReturnUrl(connectReturn(request), 'ultrahuman-failed'));
    const state = crypto.randomUUID();
    const u = new URL(AUTHORIZE);
    u.searchParams.set('client_id', String(env.ULTRAHUMAN_CLIENT_ID).trim());
    u.searchParams.set('redirect_uri', redirectUri(env, request));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', ULTRAHUMAN_SCOPES.join(' '));
    u.searchParams.set('state', state);
    return back(u.toString(), STATE_COOKIE + '=' + encodeURIComponent(state + '.' + connectReturn(request)) + '; Max-Age=600; Path=/oauth/ultrahuman; Secure; HttpOnly; SameSite=Lax');
  }
  if (pathname !== '/oauth/ultrahuman/callback' || request.method !== 'GET') return null;
  const url = new URL(request.url), code = url.searchParams.get('code'), state = url.searchParams.get('state');
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + STATE_COOKIE + '=([^;]+)'));
  const [expected, to] = decodeURIComponent(m?.[1] || '').split('.');
  if (!state || state !== expected) return back(connectReturnUrl('settings', 'ultrahuman-failed'));
  if (url.searchParams.get('error') || !code) return back(connectReturnUrl(to, 'ultrahuman-cancelled'));
  if (!ultrahumanConfigured(env)) return back(connectReturnUrl(to, 'ultrahuman-failed'));
  const data = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(env, request) }, fetchImpl);
  if (!data) { console.error('Ultrahuman OAuth token exchange failed'); return back(connectReturnUrl(to, 'ultrahuman-failed')); }
  const text = tokensText(data);
  await saveConnectionSecret(env, SOURCE, text);
  await clearConnectionHealth(env, SOURCE);
  env.ULTRAHUMAN_TOKEN = text;
  return back(connectReturnUrl(to, 'ultrahuman'));
}

// A valid access token, refreshed (and saved) when it is about to run out.
export async function ultrahumanAccessToken(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const tokens = readUltrahumanTokens(env);
  if (!tokens) throw new Error(L('Ultrahuman není připojený.', 'Ultrahuman isn\'t connected.'));
  if (!tokens.expires_at || tokens.expires_at * 1000 > now + 120000) return tokens.access_token;
  if (!tokens.refresh_token || !ultrahumanConfigured(env)) throw Object.assign(new Error('Ultrahuman HTTP 401'), { status: 401 });
  const data = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, fetchImpl);
  if (!data) throw Object.assign(new Error('Ultrahuman HTTP 401'), { status: 401 });
  // A refresh that names no new refresh token keeps the old one.
  const text = tokensText({ refresh_token: tokens.refresh_token, ...data }, now);
  await saveConnectionSecret(env, SOURCE, text);
  env.ULTRAHUMAN_TOKEN = text;
  return data.access_token;
}

// One day's metrics: [{ type, object }, …] (data.metric_data).
export async function fetchUltrahumanDay(token, date, { fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(API + '/user_data/metrics?date=' + encodeURIComponent(date), {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: AbortSignal.timeout(15000)
    });
  } catch (error) { throw Object.assign(new Error('No answer: ' + (error?.name || error?.message)), { noAnswer: true }); }
  if (!response.ok) throw Object.assign(new Error('Ultrahuman HTTP ' + response.status), { status: response.status });
  const data = await response.json().catch(() => null);
  return Array.isArray(data?.data?.metric_data) ? data.data.metric_data : [];
}

const num = (v, lo, hi) => { const n = Number(v); return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const iso = seconds => { const n = Number(seconds); return Number.isFinite(n) && n > 1e9 && n < 1e10 ? new Date(n * 1000).toISOString().replace('.000Z', 'Z') : null; };
const dateParts = d => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) });
const STAGES = { deep_sleep: 'DEEP', light_sleep: 'LIGHT', rem_sleep: 'REM', awake: 'AWAKE' };
// [data type, payload key, payload field, unit, low, high]
const DAILY = {
  sleep_rhr: ['daily-resting-heart-rate', 'dailyRestingHeartRate', 'beatsPerMinute', 'bpm', 25, 140],
  avg_sleep_hrv: ['daily-heart-rate-variability', 'dailyHeartRateVariability', 'averageHeartRateVariabilityMilliseconds', 'ms', 1, 400],
  vo2_max: ['daily-vo2-max', 'dailyVo2Max', 'vo2Max', 'ml/kg/min', 10, 95],
  temperature_deviation: ['daily-skin-temperature-deviation', 'dailySkinTemperatureDeviation', 'celsius', '°C', -5, 5]
};

// One day's metrics as health_datapoints rows (the shapes of apple-health.js).
export function ultrahumanRows(date, metrics) {
  const rows = [], byType = {};
  for (const m of Array.isArray(metrics) ? metrics : []) if (m && typeof m.type === 'string' && m.object && typeof m.object === 'object') byType[m.type] = m.object;
  const row = (data_type, extra) => ({ data_type, external_id: 'ultrahuman:' + date, sample_time: null, start_time: null, end_time: null, value_numeric: null, value_unit: null, ...extra });
  // The night's resting heart rate; the sleep-time average when the single value is missing.
  if (!byType.sleep_rhr && byType.night_rhr?.avg != null) byType.sleep_rhr = { value: byType.night_rhr.avg };
  for (const [type, [dataType, key, field, unit, lo, hi]] of Object.entries(DAILY)) {
    const value = num(byType[type]?.value, lo, hi);
    if (value == null) continue;
    const body = { date: dateParts(date), [field]: value };
    // The ring measures HRV as RMSSD, like Google's wearables.
    if (dataType === 'daily-heart-rate-variability') body.metric = 'rmssd';
    rows.push(row(dataType, { sample_time: date, value_numeric: value, value_unit: unit, payload: { [key]: body, source: SOURCE } }));
  }
  const night = byType.Sleep;
  const start = iso(night?.bedtime_start), end = iso(night?.bedtime_end);
  if (start && end && Date.parse(end) > Date.parse(start) && Date.parse(end) - Date.parse(start) <= 24 * 3600000) {
    const graph = Array.isArray(night.sleep_graph?.data) ? night.sleep_graph.data : [];
    const stages = graph.map(s => ({ type: STAGES[s?.type], startTime: iso(s?.start), endTime: iso(s?.end) }))
      .filter(s => s.type && s.startTime && s.endTime && Date.parse(s.endTime) > Date.parse(s.startTime)).sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 400);
    const awake = stages.filter(s => s.type === 'AWAKE').reduce((sum, s) => sum + (Date.parse(s.endTime) - Date.parse(s.startTime)) / 60000, 0);
    const sleep = { interval: { startTime: start, endTime: end }, stages, type: stages.some(s => s.type === 'DEEP' || s.type === 'REM') ? 'STAGES' : 'CLASSIC', metadata: { nap: false }, summary: { minutesAwake: Math.round(awake) } };
    rows.push(row('sleep', { start_time: start, end_time: end, payload: { sleep, source: SOURCE } }));
  }
  return rows;
}

const upsert = (db, userId, r) => db.prepare(
  `INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json, record_role)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'primary')
   ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET
     sample_time = excluded.sample_time, start_time = excluded.start_time, end_time = excluded.end_time,
     value_numeric = excluded.value_numeric, value_unit = excluded.value_unit, payload_json = excluded.payload_json, updated_at = CURRENT_TIMESTAMP
   WHERE health_datapoints.payload_json IS NOT excluded.payload_json OR health_datapoints.start_time IS NOT excluded.start_time OR health_datapoints.end_time IS NOT excluded.end_time`
).bind(userId, SOURCE, r.data_type, r.external_id, r.sample_time, r.start_time, r.end_time, r.value_numeric, r.value_unit, healthPointJson(r.payload));

// Apple and Google rows of the types and days the ring has become duplicates.
// Also run after an Apple Health upload or a Google sync (their new rows of a ring day).
export async function preferUltrahuman(db, userId, types = RING_TYPES, since = '2000-01-01') {
  let changed = 0;
  for (const type of types.filter(t => RING_TYPES.includes(t))) {
    const result = await db.prepare(
      `UPDATE health_datapoints SET record_role = 'duplicate', matched_activity_id = '${SOURCE}', match_confidence = 0, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND source_family IN ${OTHERS} AND data_type = ? AND COALESCE(sample_time,end_time,start_time) >= ?
         AND COALESCE(record_role,'primary') != 'duplicate'
         AND ${DAY_OF} IN (SELECT DISTINCT ${DAY_OF} FROM health_datapoints WHERE user_id = ? AND source_family = '${SOURCE}' AND data_type = ? AND COALESCE(sample_time,end_time,start_time) >= ?)`
    ).bind(userId, type, since, userId, type, since).run();
    changed += Number(result?.meta?.changes || 0);
  }
  return changed;
}

// Imports the last `days` days (today included) into the user's data.
export async function syncUltrahuman(env, { days = 3, fetchImpl = fetch, today = localDate(new Date()) } = {}) {
  if (!readUltrahumanTokens(env)) return { status: 'skipped' };
  let token;
  try { token = await ultrahumanAccessToken(env, { fetchImpl }); }
  catch (error) { if (error.status === 401) await markConnectionBroken(env, SOURCE, error.message); return { status: 'error', message: error.message }; }
  const userId = env.USER_ID ?? env.DB.userId;
  let saved = 0, failed = 0, oldest = today;
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.parse(today + 'T12:00:00Z') - i * 86400000).toISOString().slice(0, 10);
    let metrics;
    try { metrics = await fetchUltrahumanDay(token, date, { fetchImpl }); }
    catch (error) {
      if (error.status === 401 || error.status === 403) { await markConnectionBroken(env, SOURCE, error.message); return { status: 'error', message: error.message, saved }; }
      failed++; continue;
    }
    const rows = ultrahumanRows(date, metrics);
    if (rows.length) await env.DB.batch(rows.map(r => upsert(env.DB, userId, r)));
    saved += rows.length; oldest = date;
  }
  // A night ends on the morning of its day, a day earlier in UTC west of Greenwich.
  const since = new Date(Date.parse(oldest + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const replaced = saved ? await preferUltrahuman(env.DB, userId, RING_TYPES, since) : 0;
  await markConnectionOk(env, SOURCE);
  return { status: failed && !saved ? 'error' : 'ok', saved, failed, replaced };
}

// Disconnecting: Ultrahuman gets its access back and the ring's data is deleted
// (as the application to Ultrahuman says); the days it covered go back to the
// Apple and Google rows it had replaced.
export async function disconnectUltrahuman(env, { fetchImpl = fetch } = {}) {
  const tokens = readUltrahumanTokens(env);
  if (tokens && ultrahumanConfigured(env)) {
    await fetchImpl(REVOKE, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.access_token, client_id: String(env.ULTRAHUMAN_CLIENT_ID).trim(), client_secret: String(env.ULTRAHUMAN_CLIENT_SECRET).trim() }),
      signal: AbortSignal.timeout(10000)
    }).catch(() => null);
  }
  const userId = env.USER_ID ?? env.DB.userId;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM health_datapoints WHERE user_id = ? AND source_family = '${SOURCE}'`).bind(userId),
    env.DB.prepare(`UPDATE health_datapoints SET record_role = 'primary', matched_activity_id = NULL, match_confidence = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND source_family IN ${OTHERS} AND record_role = 'duplicate' AND matched_activity_id = '${SOURCE}'`).bind(userId)
  ]);
  await deleteConnectionSecret(env, SOURCE);
  await clearConnectionHealth(env, SOURCE);
  delete env.ULTRAHUMAN_TOKEN;
  return { status: 'ok' };
}
