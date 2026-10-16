// WHOOP as a health source (Settings → Zdroje dat → WHOOP): the night's sleep
// with stage totals, breathing, and the morning recovery's resting heart rate,
// HRV and blood oxygen feed readiness like the ring and the watches do. Nothing
// is written to WHOOP, and its data is not passed on to other services.
//
// Needs the app registered at developer.whoop.com (var WHOOP_CLIENT_ID, secret
// WHOOP_CLIENT_SECRET); without them WHOOP is not offered. The tokens are
// stored per user (connection-secrets.js, provider "whoop") as JSON; WHOOP
// replaces the refresh token on every refresh, so the new pair is saved.
//
// Rows go to health_datapoints as source_family 'whoop' in the shapes of
// apple-health.js. WHOOP's API gives the stage totals of a night, not the
// timeline, so the sleep row carries stageTotals instead of stages
// (sleep-sessions.js reads either). Which device's night counts is
// source-priority.js's call. Disconnecting deletes WHOOP's rows.
import { saveConnectionSecret, deleteConnectionSecret } from './connection-secrets.js';
import { connectReturn, connectReturnUrl } from './connect-return.js';
import { appOrigin } from './app-origin.js';
import { markConnectionBroken, markConnectionOk, clearConnectionHealth } from './connection-health.js';
import { healthPointJson } from './health-point-json.js';
import { localDate } from './user-time.js';
import { L } from './lang.js';
import { resolveSources } from './source-priority.js';

export const SOURCE = 'whoop';
const STATE_COOKIE = 'pfd_whoop_oauth_state';
const AUTHORIZE = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API = 'https://api.prod.whoop.com/developer';
// offline: a refresh token, so the hourly import keeps working.
export const WHOOP_SCOPES = ['read:recovery', 'read:cycles', 'read:sleep', 'read:workout', 'read:profile', 'read:body_measurement', 'offline'];
// As far back as readiness compares (its 60-day baseline).
export const FIRST_IMPORT_DAYS = 61;

export function whoopConfigured(env) {
  return Boolean(String(env.WHOOP_CLIENT_ID || '').trim() && String(env.WHOOP_CLIENT_SECRET || '').trim());
}

const redirectUri = (env, request) => appOrigin(env, request) + '/oauth/whoop/callback';
const clearState = STATE_COOKIE + '=; Path=/oauth/whoop; Max-Age=0; Secure; HttpOnly; SameSite=Lax';
const back = (location, cookie = clearState) => new Response(null, { status: 302, headers: { Location: location, 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });

// The stored tokens as { access_token, refresh_token, expires_at } (seconds).
export function readWhoopTokens(env) {
  try { const t = JSON.parse(env.WHOOP_TOKEN || ''); return t?.access_token ? t : null; } catch { return null; }
}
const tokensText = (data, now = Date.now()) => JSON.stringify({
  access_token: String(data.access_token || ''), refresh_token: String(data.refresh_token || ''),
  expires_at: Number(data.expires_in) ? Math.floor(now / 1000) + Number(data.expires_in) : 0
});

async function tokenRequest(env, params, fetchImpl) {
  const response = await fetchImpl(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: String(env.WHOOP_CLIENT_ID).trim(), client_secret: String(env.WHOOP_CLIENT_SECRET).trim(), ...params }),
    signal: AbortSignal.timeout(15000)
  }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) : {};
  return response?.ok && data.access_token ? data : null;
}

export async function handleWhoopOAuth(request, env, pathname, fetchImpl = fetch) {
  if (pathname === '/oauth/whoop' && request.method === 'GET') {
    if (!whoopConfigured(env)) return back(connectReturnUrl(connectReturn(request), 'whoop-failed'));
    const state = crypto.randomUUID();
    const u = new URL(AUTHORIZE);
    u.searchParams.set('client_id', String(env.WHOOP_CLIENT_ID).trim());
    u.searchParams.set('redirect_uri', redirectUri(env, request));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', WHOOP_SCOPES.join(' '));
    u.searchParams.set('state', state);
    return back(u.toString(), STATE_COOKIE + '=' + encodeURIComponent(state + '.' + connectReturn(request)) + '; Max-Age=600; Path=/oauth/whoop; Secure; HttpOnly; SameSite=Lax');
  }
  if (pathname !== '/oauth/whoop/callback' || request.method !== 'GET') return null;
  const url = new URL(request.url), code = url.searchParams.get('code'), state = url.searchParams.get('state');
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + STATE_COOKIE + '=([^;]+)'));
  const [expected, to] = decodeURIComponent(m?.[1] || '').split('.');
  if (!state || state !== expected) return back(connectReturnUrl('settings', 'whoop-failed'));
  if (url.searchParams.get('error') || !code) return back(connectReturnUrl(to, 'whoop-cancelled'));
  if (!whoopConfigured(env)) return back(connectReturnUrl(to, 'whoop-failed'));
  const data = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(env, request) }, fetchImpl);
  if (!data) { console.error('WHOOP OAuth token exchange failed'); return back(connectReturnUrl(to, 'whoop-failed')); }
  const text = tokensText(data);
  await saveConnectionSecret(env, SOURCE, text);
  await clearConnectionHealth(env, SOURCE);
  env.WHOOP_TOKEN = text;
  return back(connectReturnUrl(to, 'whoop'));
}

// A valid access token, refreshed (and the new pair saved) when it is about to run out.
export async function whoopAccessToken(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const tokens = readWhoopTokens(env);
  if (!tokens) throw new Error(L('WHOOP není připojený.', 'WHOOP isn\'t connected.'));
  if (!tokens.expires_at || tokens.expires_at * 1000 > now + 120000) return tokens.access_token;
  if (!tokens.refresh_token || !whoopConfigured(env)) throw Object.assign(new Error('WHOOP HTTP 401'), { status: 401 });
  const data = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, scope: 'offline' }, fetchImpl);
  if (!data) throw Object.assign(new Error('WHOOP HTTP 401'), { status: 401 });
  const text = tokensText({ refresh_token: tokens.refresh_token, ...data }, now);
  await saveConnectionSecret(env, SOURCE, text);
  env.WHOOP_TOKEN = text;
  return data.access_token;
}

// Every record of a collection (/v2/activity/sleep, /v2/recovery) from `start` on, 25 a page.
export async function fetchWhoopCollection(token, path, start, { fetchImpl = fetch, maxPages = 20 } = {}) {
  const out = [];
  let next = '';
  for (let page = 0; page < maxPages; page++) {
    const u = new URL(API + path);
    u.searchParams.set('start', start);
    u.searchParams.set('limit', '25');
    if (next) u.searchParams.set('nextToken', next);
    let response;
    try { response = await fetchImpl(u.toString(), { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) }); }
    catch (error) { throw Object.assign(new Error('No answer: ' + (error?.name || error?.message)), { noAnswer: true }); }
    if (!response.ok) throw Object.assign(new Error('WHOOP HTTP ' + response.status), { status: response.status });
    const data = await response.json().catch(() => null);
    if (Array.isArray(data?.records)) out.push(...data.records);
    next = data?.next_token || '';
    if (!next) break;
  }
  return out;
}

const num = (v, lo, hi) => { const n = Number(v); return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const isoOf = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().replace('.000Z', 'Z') : null; };
const dateParts = d => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) });
// The day the night ends on where it was slept (WHOOP's "+02:00"), else in the user's time zone.
function wakeDay(sleep) {
  const end = Date.parse(sleep?.end || '');
  if (!Number.isFinite(end)) return null;
  const m = String(sleep.timezone_offset || '').match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return localDate(new Date(end).toISOString());
  const offset = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000;
  return new Date(end + offset).toISOString().slice(0, 10);
}
// [data type, payload key, payload field, unit, low, high]
const DAILY = {
  rhr: ['daily-resting-heart-rate', 'dailyRestingHeartRate', 'beatsPerMinute', 'bpm', 25, 140],
  hrv: ['daily-heart-rate-variability', 'dailyHeartRateVariability', 'averageHeartRateVariabilityMilliseconds', 'ms', 1, 400],
  spo2: ['daily-oxygen-saturation', 'dailyOxygenSaturation', 'percentage', '%', 50, 100],
  resp: ['daily-respiratory-rate', 'dailyRespiratoryRate', 'breathsPerMinute', 'breaths/min', 4, 60]
};
const minutes = ms => { const n = Number(ms); return Number.isFinite(n) && n >= 0 ? Math.round(n / 60000) : 0; };

// Sleeps and recoveries as health_datapoints rows (the shapes of apple-health.js).
export function whoopRows(sleeps = [], recoveries = []) {
  const rows = [], days = new Map();
  const daily = (date, key, value) => {
    const [dataType, payloadKey, field, unit, lo, hi] = DAILY[key];
    const v = num(value, lo, hi);
    if (v == null || !date) return;
    const body = { date: dateParts(date), [field]: Math.round(v * 10) / 10 };
    // WHOOP measures HRV as RMSSD in the last slow-wave sleep.
    if (dataType === 'daily-heart-rate-variability') body.metric = 'rmssd';
    rows.push({ data_type: dataType, external_id: 'whoop:' + date, sample_time: date, start_time: null, end_time: null, value_numeric: body[field], value_unit: unit, payload: { [payloadKey]: body, source: SOURCE } });
  };
  for (const s of Array.isArray(sleeps) ? sleeps : []) {
    const start = isoOf(s?.start), end = isoOf(s?.end);
    if (!s?.id || !start || !end || Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 24 * 3600000) continue;
    const day = wakeDay(s), nap = s.nap === true;
    if (!nap && day) days.set(String(s.id), day);
    const st = s.score_state === 'SCORED' ? s.score?.stage_summary : null;
    const stageTotals = st ? { DEEP: minutes(st.total_slow_wave_sleep_time_milli), LIGHT: minutes(st.total_light_sleep_time_milli), REM: minutes(st.total_rem_sleep_time_milli), AWAKE: minutes(st.total_awake_time_milli) } : null;
    const sleep = { interval: { startTime: start, endTime: end }, stages: [], ...(stageTotals ? { stageTotals } : {}), type: stageTotals ? 'STAGES' : 'CLASSIC', metadata: { nap }, summary: stageTotals ? { minutesAwake: stageTotals.AWAKE } : {} };
    rows.push({ data_type: 'sleep', external_id: 'whoop:sleep:' + s.id, sample_time: null, start_time: start, end_time: end, value_numeric: null, value_unit: null, payload: { sleep, source: SOURCE } });
    if (!nap && s.score_state === 'SCORED') daily(day, 'resp', s.score?.respiratory_rate);
  }
  for (const r of Array.isArray(recoveries) ? recoveries : []) {
    if (r?.score_state !== 'SCORED' || r.score?.user_calibrating === true) continue;
    const day = days.get(String(r.sleep_id));
    daily(day, 'rhr', r.score?.resting_heart_rate);
    daily(day, 'hrv', r.score?.hrv_rmssd_milli);
    daily(day, 'spo2', r.score?.spo2_percentage);
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

// Imports the nights of the last `days` days (today included).
export async function syncWhoop(env, { days = 3, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!readWhoopTokens(env)) return { status: 'skipped' };
  let token;
  try { token = await whoopAccessToken(env, { fetchImpl, now }); }
  catch (error) { if (error.status === 401) await markConnectionBroken(env, SOURCE, error.message); return { status: 'error', message: error.message }; }
  const userId = env.USER_ID ?? env.DB.userId;
  // From noon of the day before the first day, so its whole night comes along.
  const start = new Date(now - days * 86400000 - 12 * 3600000).toISOString();
  let sleeps, recoveries;
  try {
    sleeps = await fetchWhoopCollection(token, '/v2/activity/sleep', start, { fetchImpl });
    recoveries = await fetchWhoopCollection(token, '/v2/recovery', start, { fetchImpl });
  } catch (error) {
    if (error.status === 401 || error.status === 403) await markConnectionBroken(env, SOURCE, error.message);
    return { status: 'error', message: error.message };
  }
  const rows = whoopRows(sleeps, recoveries);
  for (let i = 0; i < rows.length; i += 50) await env.DB.batch(rows.slice(i, i + 50).map(r => upsert(env.DB, userId, r)));
  const replaced = rows.length ? await resolveSources(env.DB, userId, { part: 'night', since: start.slice(0, 10), now }) : 0;
  await markConnectionOk(env, SOURCE);
  return { status: 'ok', saved: rows.length, replaced };
}

// WHOOP forgets Aurin's access (also when the Aurin account is deleted).
export async function revokeWhoop(env, fetchImpl = fetch) {
  const tokens = readWhoopTokens(env);
  if (!tokens) return 'none';
  // An expired access token is refreshed first, else the revoke is refused.
  const token = await whoopAccessToken(env, { fetchImpl }).catch(() => tokens.access_token);
  const response = await fetchImpl(API + '/v2/user/access', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  return response?.ok ? 'revoked' : 'failed';
}
// Disconnecting: WHOOP's access is revoked and its data deleted; the nights it
// covered go back to the other sources.
export async function disconnectWhoop(env, { fetchImpl = fetch } = {}) {
  await revokeWhoop(env, fetchImpl);
  const userId = env.USER_ID ?? env.DB.userId;
  await env.DB.prepare(`DELETE FROM health_datapoints WHERE user_id = ? AND source_family = '${SOURCE}'`).bind(userId).run();
  await resolveSources(env.DB, userId, { part: 'night', since: new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10) });
  await deleteConnectionSecret(env, SOURCE);
  await clearConnectionHealth(env, SOURCE);
  delete env.WHOOP_TOKEN;
  return { status: 'ok' };
}
