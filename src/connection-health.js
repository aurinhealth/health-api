// Whether a connected service still accepts Aurin's access. A connection
// counts as connected while its key is stored; when a sync finds the access
// revoked or expired (Google invalid_grant, Intervals.icu 401/403), the
// provider is marked broken here until the next successful call or a reconnect,
// so the app can ask to connect again instead of failing quietly at each sync.
// Kept in sync_status (one row per provider, already personal and deleted
// with the account) as sync_name 'connection_<provider>'.
import { L } from "./lang.js";
import { recordOpsEvent } from "./ops-report.js";
import { transientD1Error, D1_RETRY_DELAYS_MS } from "./d1-retry.js";

export const HEALTH_PROVIDERS = ["google", "intervals", "ultrahuman", "whoop", "wahoo"];
const name = provider => "connection_" + provider;

const ensured = new WeakSet();
async function ensure(db) {
  if (ensured.has(db)) return;
  await write(db.prepare("CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))"));
  ensured.add(db);
}
const userOf = env => env?.USER_ID ?? env?.DB?.userId;
// The status upserts write the same row with the same values however often
// they run, so a D1 blip (a reset, a lost connection) is tried again like a
// read; it showed as a failed Google Health sync once on 2026-10-30.
async function write(statement, delays = D1_RETRY_DELAYS_MS) {
  for (let attempt = 0; ; attempt++) {
    try { return await statement.run(); }
    catch (error) {
      if (attempt >= delays.length || !transientD1Error(error, { read: true })) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
}
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
    const row = await env.DB.prepare("SELECT status,details_json FROM sync_status WHERE user_id=? AND sync_name=?").bind(userOf(env), name(provider)).first();
    const details = { ...parse(row?.details_json), lastError: String(message || "").slice(0, 300), lastErrorAt: now };
    await write(env.DB.prepare("INSERT INTO sync_status(user_id,sync_name,status,started_at,finished_at,details_json,updated_at) VALUES(?,?,'broken',NULL,?,?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET status='broken',finished_at=excluded.finished_at,details_json=excluded.details_json,updated_at=excluded.updated_at")
      .bind(userOf(env), name(provider), now, JSON.stringify(details)));
    // Counted once per break, for the owner's morning e-mail.
    if (row?.status !== "broken") await recordOpsEvent(env.RAW_DB, "broken", provider, message);
  } catch (error) { console.error("Connection health write failed", provider, error.message); }
}

// A call the provider accepted. Written at most every ten minutes while the
// connection stays healthy, at once when it was broken.
export async function markConnectionOk(env, provider) {
  if (!env?.DB || !userOf(env) || !HEALTH_PROVIDERS.includes(provider)) return;
  try {
    await ensure(env.DB);
    const now = new Date().toISOString();
    await write(env.DB.prepare("INSERT INTO sync_status(user_id,sync_name,status,started_at,finished_at,details_json,updated_at) VALUES(?,?,'ok',NULL,?,?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET status='ok',finished_at=excluded.finished_at,details_json=json_set(COALESCE(sync_status.details_json,'{}'),'$.lastSuccessAt',excluded.finished_at),updated_at=excluded.updated_at WHERE sync_status.status!='ok' OR sync_status.updated_at IS NULL OR sync_status.updated_at<datetime('now','-10 minutes')")
      .bind(userOf(env), name(provider), now, JSON.stringify({ lastSuccessAt: now })));
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
    const rows = (await env.DB.prepare(`SELECT sync_name,status,details_json FROM sync_status WHERE user_id=? AND sync_name IN (${HEALTH_PROVIDERS.map(() => "?").join(",")})`).bind(userOf(env), ...HEALTH_PROVIDERS.map(name)).all()).results || [];
    for (const row of rows) {
      const provider = row.sync_name.slice("connection_".length), details = parse(row.details_json);
      out[provider] = { needsReconnect: row.status === "broken", lastError: row.status === "broken" ? details.lastError || null : null, lastErrorAt: details.lastErrorAt || null, lastSuccessAt: details.lastSuccessAt || null };
    }
  } catch (error) { console.error("Connection health read failed", error.message); }
  return out;
}

// Google Health and Intervals.icu sync every few minutes. A connection the
// service refused waits for the user to connect again (which clears the mark),
// so the cron leaves it out except at the top of each hour, in case the key was
// replaced by hand or the refusal passes. Without this a revoked Google grant
// failed 60+ times a day per user in the owner's morning e-mail.
const RESTING = { google: "GOOGLE_REFRESH_TOKEN", intervals: "INTERVALS_API_KEY" };
export async function withoutBrokenConnections(env, now = new Date()) {
  const connected = env?.CONNECTED_PROVIDERS || [];
  if (now.getUTCMinutes() === 0 || !Object.keys(RESTING).some(p => connected.includes(p))) return env;
  const health = await readConnectionHealth(env);
  const broken = Object.keys(RESTING).filter(p => connected.includes(p) && health[p].needsReconnect);
  if (!broken.length) return env;
  const out = { ...env, CONNECTED_PROVIDERS: connected.filter(p => !broken.includes(p)) };
  for (const p of broken) delete out[RESTING[p]];
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
