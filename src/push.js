// Push notifications to the iPhone app through Apple's push service (APNs):
// the morning readiness, once a day after the night's data has arrived
// ("Připravenost 72 · dnes klidně intervaly"). The app registers its device
// token (POST /app/api/push/token) when notifications are allowed and the
// "Ranní připravenost" switch in Settings → Oznámení is on, and removes it
// (DELETE) when the switch goes off or the user signs out.
//
// APNs speaks HTTP/2 with a short-lived ES256 token signed by the .p8 key from
// the Apple Developer portal. Secrets: APNS_KEY_P8 (the .p8 file's contents),
// APNS_KEY_ID and APPLE_TEAM_ID; APNS_SANDBOX=1 sends to the development
// service. Without the secrets every call here quietly does nothing.
import { L, storedLanguage, withLang } from "./lang.js";
import { localDate, localHour, localToday, storedTimeZone, withTimeZone } from "./user-time.js";

const shiftDay = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

// The app's bundle id (ios-native/project.yml), the topic every push names.
export const APNS_TOPIC = "eu.petrfitnessdata.loadwise.native";
export const MORNING_READINESS = "morning-readiness";
// Not before 5:00 and not after 11:00 in the user's zone.
export const MORNING_FROM_HOUR = 5;
export const MORNING_TO_HOUR = 11;
// Apple refuses provider tokens older than an hour and asks not to make a new
// one more often than every 20 minutes.
const JWT_TTL_MS = 50 * 60 * 1000;
const MAX_TOKENS_PER_USER = 10;
const TOKEN = /^[0-9a-f]{64,200}$/i;
const ENVIRONMENTS = new Set(["production", "development"]);

export const pushConfigured = env => Boolean(env && env.APNS_KEY_P8 && env.APNS_KEY_ID && env.APPLE_TEAM_ID);
export const inMorningWindow = hour => Number.isFinite(hour) && hour >= MORNING_FROM_HOUR && hour < MORNING_TO_HOUR;

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS push_tokens (user_id INTEGER NOT NULL, token TEXT NOT NULL, environment TEXT NOT NULL DEFAULT 'production', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, token))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS push_log (user_id INTEGER NOT NULL, kind TEXT NOT NULL, local_date TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, kind, local_date))").run();
}

// ---- Device tokens ---------------------------------------------------------

// rawDb (the central database, unscoped): the token leaves any other account
// first, so a phone where someone else signs in (after an expired session
// that could not remove it) no longer gets the previous account's pushes.
export async function savePushToken(db, token, environment = "production", { rawDb = null } = {}) {
  const value = String(token || "").trim().toLowerCase();
  if (!TOKEN.test(value)) throw Object.assign(new Error(L("Neplatný token zařízení.", "Invalid device token.")), { status: 400 });
  const env = ENVIRONMENTS.has(environment) ? environment : "production";
  await ensure(db);
  if (rawDb) await rawDb.prepare("DELETE FROM push_tokens WHERE token=? AND user_id<>?").bind(value, db.userId).run();
  await db.prepare("INSERT INTO push_tokens(user_id,token,environment) VALUES(?,?,?) ON CONFLICT(user_id,token) DO UPDATE SET environment=excluded.environment,updated_at=CURRENT_TIMESTAMP").bind(db.userId, value, env).run();
  // A phone gets a new token after a reinstall; the oldest ones go.
  await db.prepare("DELETE FROM push_tokens WHERE user_id=? AND token NOT IN (SELECT token FROM push_tokens WHERE user_id=? ORDER BY updated_at DESC, created_at DESC LIMIT ?)").bind(db.userId, db.userId, MAX_TOKENS_PER_USER).run();
  return { token: value, environment: env };
}

// Without a token: every token of the user.
export async function deletePushToken(db, token = null) {
  await ensure(db);
  const value = token ? String(token).trim().toLowerCase() : null;
  const result = value
    ? await db.prepare("DELETE FROM push_tokens WHERE user_id=? AND token=?").bind(db.userId, value).run()
    : await db.prepare("DELETE FROM push_tokens WHERE user_id=?").bind(db.userId).run();
  return Number(result?.meta?.changes || 0);
}

export async function listPushTokens(db) {
  await ensure(db);
  return (await db.prepare("SELECT token, environment FROM push_tokens WHERE user_id=? ORDER BY updated_at DESC").bind(db.userId).all()).results || [];
}

// POST {token, environment} saves the phone's token, DELETE {token?} removes it.
export async function handlePushToken(request, env, { signedIn, origin }) {
  if (!["POST", "DELETE"].includes(request.method)) return Response.json({ message: L("Nepodporovaná metoda.", "Unsupported method.") }, { status: 405 });
  if (!signedIn) return Response.json({ message: L("Přihlas se do dashboardu.", "Sign in to the app.") }, { status: 401 });
  if (request.headers.get("Origin") !== origin) return Response.json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({})) || {};
    if (request.method === "DELETE") return Response.json({ status: "ok", removed: await deletePushToken(env.DB, body.token || null) }, { headers: { "Cache-Control": "no-store" } });
    const saved = await savePushToken(env.DB, body.token, String(body.environment || "production"), { rawDb: env.RAW_DB || null });
    return Response.json({ status: "ok", environment: saved.environment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.status) return Response.json({ status: "error", message: error.message }, { status: error.status });
    console.error("Push token failed", error.message);
    return Response.json({ status: "error", message: error.message }, { status: 500 });
  }
}

// ---- The provider token (ES256 JWT) -----------------------------------------

let cachedJwt = null;
export function _resetPushForTest() { cachedJwt = null; }

const base64url = bytes => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const textBytes = value => new TextEncoder().encode(value);

// The .p8 file: a PKCS#8 key in PEM armour (the secret may keep or lose its line breaks).
export function pkcs8FromP8(p8) {
  const body = String(p8 || "").replace(/-----(BEGIN|END) [A-Z ]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// Web Crypto signs ECDSA as r‖s (64 bytes), the form a JWS ES256 signature takes.
export async function apnsJwt(env, now = Date.now()) {
  const id = env.APNS_KEY_ID + "|" + env.APPLE_TEAM_ID + "|" + env.APNS_KEY_P8;
  if (cachedJwt && cachedJwt.id === id && now - cachedJwt.at >= 0 && now - cachedJwt.at < JWT_TTL_MS) return cachedJwt.token;
  const key = await crypto.subtle.importKey("pkcs8", pkcs8FromP8(env.APNS_KEY_P8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = base64url(textBytes(JSON.stringify({ alg: "ES256", kid: env.APNS_KEY_ID })));
  const claims = base64url(textBytes(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: Math.floor(now / 1000) })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textBytes(header + "." + claims)));
  const token = header + "." + claims + "." + base64url(signature);
  cachedJwt = { id, at: now, token };
  return token;
}

// ---- Sending ----------------------------------------------------------------

const apnsHost = (env, environment) => env.APNS_SANDBOX === "1" || env.APNS_SANDBOX === "true" || environment === "development" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
// Answers that mean the token is no longer this app's on any phone.
const DEAD_TOKEN = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic", "ExpiredToken"]);

// One alert to one device: {ok}, {ok:false, gone:true} for a dead token.
// alert: a text, or {title, body}; category names the phone's buttons for it
// (the coach's "Vyměnit" / "Nechat"), data rides along for them.
export async function sendPush(env, device, alert, { fetchImpl = fetch, now = Date.now(), category = null, data = null } = {}) {
  if (!pushConfigured(env)) return { ok: false, skipped: true };
  const jwt = await apnsJwt(env, now);
  const response = await fetchImpl(`https://${apnsHost(env, device.environment)}/3/device/${device.token}`, {
    method: "POST",
    headers: { authorization: "bearer " + jwt, "apns-topic": APNS_TOPIC, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" },
    body: JSON.stringify({ ...(data || {}), aps: { alert, sound: "default", ...(category ? { category } : {}) } })
  });
  if (response.status === 200) return { ok: true };
  const reason = await response.json().then(x => x?.reason || null).catch(() => null);
  // A refused provider token is made again next time.
  if (response.status === 403 && /ProviderToken/.test(String(reason))) cachedJwt = null;
  return { ok: false, status: response.status, reason, gone: response.status === 410 || DEAD_TOKEN.has(reason) };
}

// The readiness and one short piece of advice from its zone.
// Signs of illness (breathing or temperature up), a sick check-in or a paused
// athlete never get "intervals are fine".
export function readinessMessage({ score, zone, flags = [], checkin = null, athleteState = null }) {
  const sick = checkin === "sick" || (flags || []).includes("checkin_sick"), signs = (flags || []).some(f => /^(respiration|skin_temp|wrist_temp)_elevated$/.test(f));
  const head = L("Připravenost", "Readiness") + " " + Math.round(Number(score));
  if (sick || (athleteState && athleteState !== "active")) return head + " · " + L("dnes odpočinek", "rest today");
  if (signs) return head + " · " + L("dech nebo teplota jsou vyšší, dnes bez intenzity", "breathing or temperature is up, no intensity today");
  const advice = {
    green: L("dnes klidně intervaly", "intervals are fine today"),
    yellow: L("dnes spíš lehčeji, bez intervalů", "go easier today, skip the intervals"),
    red: L("dnes odpočinek nebo jen lehký pohyb", "rest or only light movement today")
  }[zone];
  return advice ? head + " · " + advice : head;
}

// Did the Apple Health upload bring the night that ended today?
export function hasLastNight(records, now = new Date()) {
  const today = localToday(now);
  return (Array.isArray(records) ? records : []).some(r => r && r.type === "sleep" && r.nap !== true && localDate(String(r.end || "")) === today);
}

// The morning push for the user of env, in their language and time zone: in
// the 5–11 window, once a local day, only to a user with a device token and
// only when today's readiness has a score (or, in the last hour, a line that
// the night hasn't arrived when yesterday had one). readiness(date) computes it
// (entrypoint.js: as /app/api/today does) and runs only when everything else
// allows a push.
export async function sendMorningReadiness(env, { readiness, now = new Date(), fetchImpl = fetch } = {}) {
  if (!pushConfigured(env) || !env.DB) return { sent: 0, reason: "not-configured" };
  const db = env.DB;
  const [language, zone] = await Promise.all([storedLanguage(db, db.userId ?? env.USER_ID), storedTimeZone(db, db.userId ?? env.USER_ID)]);
  return withLang(language, () => withTimeZone(zone, async () => {
    if (!inMorningWindow(localHour(now))) return { sent: 0, reason: "outside-window" };
    const devices = await listPushTokens(db);
    if (!devices.length) return { sent: 0, reason: "no-tokens" };
    const date = localToday(now);
    if (await db.prepare("SELECT 1 AS sent FROM push_log WHERE user_id=? AND kind=? AND local_date=?").bind(db.userId, MORNING_READINESS, date).first()) return { sent: 0, reason: "already-sent" };
    const value = typeof readiness === "function" ? await readiness(date) : readiness;
    const scored = v => v && v.score != null && Number.isFinite(Number(v.score));
    // No night by the last hour of the window, while yesterday had a score: one
    // line, so the athlete knows the watch hasn't synced (opening the app syncs).
    // A new account without enough history gets nothing.
    let text = null;
    if (!scored(value)) {
      if (localHour(now) < MORNING_TO_HOUR - 1 || typeof readiness !== "function" || !scored(await Promise.resolve().then(() => readiness(shiftDay(date, -1))).catch(() => null))) return { sent: 0, reason: "no-score" };
      text = L("Data z noci zatím nedorazila. Otevři Aurin a synchronizuje se.", "Last night's data hasn't arrived yet. Open Aurin to sync.");
    }
    // Without last night the score is HRV and resting HR only: wait for the
    // night's upload until the last hour of the window.
    if (!text && (value.missing || []).includes("sleep") && localHour(now) < MORNING_TO_HOUR - 1) return { sent: 0, reason: "waiting-for-sleep" };
    // The day is claimed before sending, so an upload and the cron at the same moment send one push.
    const claim = await db.prepare("INSERT INTO push_log(user_id,kind,local_date) VALUES(?,?,?) ON CONFLICT(user_id,kind,local_date) DO NOTHING").bind(db.userId, MORNING_READINESS, date).run();
    if (!Number(claim?.meta?.changes)) return { sent: 0, reason: "already-sent" };
    text ||= readinessMessage(value);
    let sent = 0, removed = 0;
    for (const device of devices) {
      const result = await sendPush(env, device, text, { fetchImpl, now: now.getTime() }).catch(error => ({ ok: false, error: error.message }));
      if (result.ok) sent++;
      else if (result.gone) removed += await deletePushToken(db, device.token);
      else console.error("Push not delivered", result.status || "", result.reason || result.error || "");
    }
    // Nothing reached a phone (APNs down, a network error): a later sync tries again.
    if (!sent) await db.prepare("DELETE FROM push_log WHERE user_id=? AND kind=? AND local_date=?").bind(db.userId, MORNING_READINESS, date).run();
    return { sent, removed, date, text };
  }));
}
