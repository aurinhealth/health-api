// Whether a connected service still accepts Loadwise's access. A connection
// counts as connected while its key is stored; when a sync finds the access
// revoked or expired (Google invalid_grant, Intervals.icu 401/403), the
// provider is marked broken here until the next successful call or a reconnect,
// so the app can ask to connect again instead of failing quietly at each sync.
// Kept in sync_status (one row per provider, already personal and deleted
// with the account) as sync_name 'connection_<provider>'.
import { L } from "./lang.js";

export const HEALTH_PROVIDERS = ["google", "intervals"];
const name = provider => "connection_" + provider;

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))").run();
}
const userOf = env => env?.USER_ID ?? env?.DB?.userId;
const parse = text => { try { return JSON.parse(text || "{}") || {}; } catch { return {}; } };

// A refused credential, not an outage: only these ask the user to reconnect.
export function isGoogleAuthFailure(data) {
  return data?.error === "invalid_grant" || data?.error === "unauthorized_client";
}
export function isIntervalsAuthFailure(status) {
  return status === 401 || status === 403;
}

// Health tracking never breaks the sync it watches: errors are logged only.
export async function markConnectionBroken(env, provider, message) {
  if (!env?.DB || !userOf(env) || !HEALTH_PROVIDERS.includes(provider)) return;
  try {
    await ensure(env.DB);
    const now = new Date().toISOString();
    const row = await env.DB.prepare("SELECT details_json FROM sync_status WHERE user_id=? AND sync_name=?").bind(userOf(env), name(provider)).first();
    const details = { ...parse(row?.details_json), lastError: String(message || "").slice(0, 300), lastErrorAt: now };
    await env.DB.prepare("INSERT INTO sync_status(user_id,sync_name,status,started_at,finished_at,details_json,updated_at) VALUES(?,?,'broken',NULL,?,?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET status='broken',finished_at=excluded.finished_at,details_json=excluded.details_json,updated_at=excluded.updated_at")
      .bind(userOf(env), name(provider), now, JSON.stringify(details)).run();
  } catch (error) { console.error("Connection health write failed", provider, error.message); }
}

// A call the provider accepted. Written at most every ten minutes while the
// connection stays healthy, at once when it was broken.
export async function markConnectionOk(env, provider) {
  if (!env?.DB || !userOf(env) || !HEALTH_PROVIDERS.includes(provider)) return;
  try {
    await ensure(env.DB);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO sync_status(user_id,sync_name,status,started_at,finished_at,details_json,updated_at) VALUES(?,?,'ok',NULL,?,?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET status='ok',finished_at=excluded.finished_at,details_json=json_set(COALESCE(sync_status.details_json,'{}'),'$.lastSuccessAt',excluded.finished_at),updated_at=excluded.updated_at WHERE sync_status.status!='ok' OR sync_status.updated_at IS NULL OR sync_status.updated_at<datetime('now','-10 minutes')")
      .bind(userOf(env), name(provider), now, JSON.stringify({ lastSuccessAt: now })).run();
  } catch (error) { console.error("Connection health write failed", provider, error.message); }
}

// A new connection (or a removed one) starts with a clean state.
export async function clearConnectionHealth(env, provider) {
  if (!env?.DB || !userOf(env) || !HEALTH_PROVIDERS.includes(provider)) return;
  try {
    await ensure(env.DB);
    await env.DB.prepare("DELETE FROM sync_status WHERE user_id=? AND sync_name=?").bind(userOf(env), name(provider)).run();
  } catch (error) { console.error("Connection health write failed", provider, error.message); }
}

// {google: {needsReconnect, lastError, lastErrorAt, lastSuccessAt}, intervals: …}
export async function readConnectionHealth(env) {
  const out = Object.fromEntries(HEALTH_PROVIDERS.map(p => [p, { needsReconnect: false, lastError: null, lastErrorAt: null, lastSuccessAt: null }]));
  if (!env?.DB || !userOf(env)) return out;
  try {
    await ensure(env.DB);
    const rows = (await env.DB.prepare("SELECT sync_name,status,details_json FROM sync_status WHERE user_id=? AND sync_name IN ('connection_google','connection_intervals')").bind(userOf(env)).all()).results || [];
    for (const row of rows) {
      const provider = row.sync_name.slice("connection_".length), details = parse(row.details_json);
      out[provider] = { needsReconnect: row.status === "broken", lastError: row.status === "broken" ? details.lastError || null : null, lastErrorAt: details.lastErrorAt || null, lastSuccessAt: details.lastSuccessAt || null };
    }
  } catch (error) { console.error("Connection health read failed", error.message); }
  return out;
}

// The connected providers that need the user: access refused, or Google
// permissions left unticked. Shown on Today and in Settings.
export function connectionProblems(status) {
  return (status?.providers || []).filter(p => p.connected && (p.needsReconnect || p.missingPermissions?.length)).map(p => ({
    provider: p.id, name: p.name, needsReconnect: Boolean(p.needsReconnect), missingPermissions: p.missingPermissions || [],
    message: p.needsReconnect ? L(`${p.name}: přístup vypršel nebo byl odebrán. Připoj službu znovu.`, `${p.name}: access expired or was revoked. Connect the service again.`) : L(`${p.name}: chybí některá oprávnění.`, `${p.name}: some permissions are missing.`)
  }));
}
