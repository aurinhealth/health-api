// Strava as a destination only (Settings → Synchronizace → Strava): done
// activities logged in the app and the body weight go there. Nothing is ever
// read from Strava: its API agreement does not allow its data in AI or
// analytics, so the app asks only for activity:write and profile:write.
//
// Needs an app registered at Strava (secrets STRAVA_CLIENT_ID and
// STRAVA_CLIENT_SECRET); without them Strava is not offered. The tokens are
// stored per user like the other connections (connection-secrets.js,
// provider "strava") as JSON; the access token lasts six hours and is
// refreshed with the refresh token when it runs out.
import { saveConnectionSecret, deleteConnectionSecret } from './connection-secrets.js';
import { connectReturn, connectReturnUrl } from './connect-return.js';
import { appOrigin } from './app-origin.js';
import { L } from './lang.js';

const STATE_COOKIE = 'pfd_strava_oauth_state';
const API = 'https://www.strava.com/api/v3';
export const STRAVA_SCOPES = ['activity:write', 'profile:write'];

export function stravaConfigured(env) {
  return Boolean(String(env.STRAVA_CLIENT_ID || '').trim() && String(env.STRAVA_CLIENT_SECRET || '').trim());
}

const redirectUri = (env, request) => appOrigin(env, request) + '/oauth/strava/callback';
const clearState = STATE_COOKIE + '=; Path=/oauth/strava; Max-Age=0; Secure; HttpOnly; SameSite=Lax';
const back = (location, cookie = clearState) => new Response(null, { status: 302, headers: { Location: location, 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });

// The stored tokens as { access_token, refresh_token, expires_at }.
export function readStravaTokens(env) {
  try { const t = JSON.parse(env.STRAVA_TOKEN || ''); return t?.refresh_token ? t : null; } catch { return null; }
}
const tokensText = data => JSON.stringify({ access_token: String(data.access_token || ''), refresh_token: String(data.refresh_token || ''), expires_at: Number(data.expires_at) || 0 });

async function tokenRequest(env, params, fetchImpl) {
  const response = await fetchImpl('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: String(env.STRAVA_CLIENT_ID).trim(), client_secret: String(env.STRAVA_CLIENT_SECRET).trim(), ...params }),
    signal: AbortSignal.timeout(15000)
  }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) : {};
  if (response?.ok && data.access_token && data.refresh_token) return data;
  // The Strava app is in single-player mode (one athlete): Strava answers
  // 403 "Limit of connected athletes exceeded" to everyone else.
  if (stravaAppFull(response?.status, data)) return { full: true };
  return null;
}

export const stravaAppFull = (status, data) => status === 403 || /limit of connected athletes|capacity/i.test(JSON.stringify(data || {}));

export async function handleStravaOAuth(request, env, pathname, fetchImpl = fetch) {
  if (pathname === '/oauth/strava' && request.method === 'GET') {
    if (!stravaConfigured(env)) return back(connectReturnUrl(connectReturn(request), 'strava-failed'));
    const state = crypto.randomUUID();
    const u = new URL('https://www.strava.com/oauth/authorize');
    u.searchParams.set('client_id', String(env.STRAVA_CLIENT_ID).trim());
    u.searchParams.set('redirect_uri', redirectUri(env, request));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('approval_prompt', 'auto');
    u.searchParams.set('scope', STRAVA_SCOPES.join(','));
    u.searchParams.set('state', state);
    return back(u.toString(), STATE_COOKIE + '=' + encodeURIComponent(state + '.' + connectReturn(request)) + '; Max-Age=600; Path=/oauth/strava; Secure; HttpOnly; SameSite=Lax');
  }
  if (pathname !== '/oauth/strava/callback' || request.method !== 'GET') return null;
  const url = new URL(request.url), code = url.searchParams.get('code'), state = url.searchParams.get('state');
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + STATE_COOKIE + '=([^;]+)'));
  const [expected, to] = decodeURIComponent(m?.[1] || '').split('.');
  if (!state || state !== expected) return back(connectReturnUrl('settings', 'strava-failed'));
  if (url.searchParams.get('error') || !code) return back(connectReturnUrl(to, 'strava-cancelled'));
  if (!stravaConfigured(env)) return back(connectReturnUrl(to, 'strava-failed'));
  const data = await tokenRequest(env, { code, grant_type: 'authorization_code' }, fetchImpl);
  if (data?.full) return back(connectReturnUrl(to, 'strava-full'));
  if (!data) { console.error('Strava OAuth token exchange failed'); return back(connectReturnUrl(to, 'strava-failed')); }
  await saveConnectionSecret(env, 'strava', tokensText(data));
  return back(connectReturnUrl(to, 'strava'));
}

// A valid access token, refreshed (and saved) when it is about to run out.
export async function stravaAccessToken(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const tokens = readStravaTokens(env);
  if (!tokens) throw new Error(L('Strava není připojená.', 'Strava isn\'t connected.'));
  if (tokens.access_token && tokens.expires_at * 1000 > now + 120000) return tokens.access_token;
  if (!stravaConfigured(env)) throw new Error('Strava is not configured');
  const data = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, fetchImpl);
  if (!data?.access_token) throw Object.assign(new Error('Strava HTTP 401'), { status: 401 });
  const text = tokensText(data);
  await saveConnectionSecret(env, 'strava', text);
  env.STRAVA_TOKEN = text;
  return data.access_token;
}

const sportType = sport => ({ gym: 'WeightTraining', strength: 'WeightTraining', run: 'Run', ride: 'Ride', walk: 'Walk', swim: 'Swim', yoga: 'Yoga' }[sport] || 'Workout');

// A done activity as a Strava manual activity (POST /activities); with the id
// from an earlier send it is updated instead (PUT /activities/{id}). The
// external_id names the app's activity, so a send whose answer was lost
// cannot make a second copy: Strava answers 409 to a repeated external_id.
export function stravaActivityBody(activity, userId) {
  const body = { name: activity.name, sport_type: sportType(activity.sport), start_date_local: activity.startLocal, elapsed_time: activity.minutes * 60, external_id: 'loadwise:' + userId + ':' + activity.key };
  if (activity.notes) body.description = activity.notes;
  return body;
}

// Returns the Strava id, or null when Strava already had it and did not say which.
export async function stravaSendActivity(env, activity, remoteId, { fetchImpl = fetch } = {}) {
  const token = await stravaAccessToken(env, { fetchImpl });
  const body = stravaActivityBody(activity, env.USER_ID);
  if (remoteId) { delete body.start_date_local; delete body.elapsed_time; delete body.external_id; }
  let response;
  try {
    response = await fetchImpl(remoteId ? API + '/activities/' + encodeURIComponent(remoteId) : API + '/activities', {
      method: remoteId ? 'PUT' : 'POST',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) { throw Object.assign(new Error('No answer: ' + (error?.name || error?.message)), { noAnswer: true }); }
  const saved = await response.json().catch(() => null);
  // Already there (an earlier send whose answer was lost): sent, with the id when Strava names it.
  if (response.status === 409 && !remoteId) return saved?.id != null ? String(saved.id) : null;
  if (!response.ok) throw Object.assign(new Error('Strava HTTP ' + response.status), { status: response.status });
  const id = saved?.id ?? remoteId;
  if (id == null) throw new Error(L('Strava nepotvrdila uložení.', 'Strava didn\'t confirm the save.'));
  return String(id);
}

// The athlete's weight in kg (PUT /athlete, profile:write).
export async function stravaSetWeight(env, kg, { fetchImpl = fetch } = {}) {
  const token = await stravaAccessToken(env, { fetchImpl });
  const response = await fetchImpl(API + '/athlete?weight=' + encodeURIComponent(String(kg)), {
    method: 'PUT', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Object.assign(new Error('Strava HTTP ' + response.status), { status: response.status });
}

// The latest weight of the last two weeks (any source the app has), when it
// differs from what was last sent. A ledger row remembers the sent value.
export async function syncStravaWeight(env, { fetchImpl = fetch, allowed = true } = {}) {
  if (!allowed || !readStravaTokens(env)) return { status: 'skipped' };
  const row = await env.DB.prepare("SELECT value_numeric FROM health_datapoints WHERE user_id = ? AND data_type = 'weight' AND value_numeric BETWEEN 30 AND 300 AND sample_time >= datetime('now', '-14 days') AND (record_role IS NULL OR record_role != 'duplicate') ORDER BY sample_time DESC LIMIT 1").bind(env.USER_ID).first();
  if (!row) return { status: 'ok', written: null };
  const kg = Math.round(Number(row.value_numeric) * 10) / 10;
  const sent = await env.DB.prepare("SELECT value_numeric FROM health_datapoints WHERE user_id = ? AND source_family = 'weight-sync' AND data_type = 'weight-written' AND external_id = 'strava:latest'").bind(env.USER_ID).first();
  if (sent && Math.abs(Number(sent.value_numeric) - kg) < 0.05) return { status: 'ok', written: null };
  await stravaSetWeight(env, kg, { fetchImpl });
  await env.DB.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, value_unit, payload_json)
    VALUES (?, 'weight-sync', 'weight-written', 'strava:latest', ?, ?, 'kg', '{}') ON CONFLICT(user_id, source_family, data_type, external_id) DO UPDATE SET value_numeric = excluded.value_numeric, sample_time = excluded.sample_time`)
    .bind(env.USER_ID, new Date().toISOString(), kg).run();
  return { status: 'ok', written: kg };
}

// Disconnecting gives the access back at Strava too (best effort).
export async function disconnectStrava(env, { fetchImpl = fetch } = {}) {
  const tokens = readStravaTokens(env);
  if (tokens?.access_token) await fetchImpl('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.access_token }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  await deleteConnectionSecret(env, 'strava');
}
