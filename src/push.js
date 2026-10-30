// Push notifications to the iPhone app through Apple's push service (APNs):
// the morning readiness, once a day after the night's data has arrived
// ("Připravenost 72 · Dnes klidně naplno", the night's numbers, today's plan). The app registers its device
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
import { adviceSignals, injuryNote, isHardSession, reasonsSentence } from "./morning-advice.js";

const shiftDay = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

// The app's bundle id (ios-native/project.yml), the topic every push names.
export const APNS_TOPIC = "health.aurin.app";
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
// alert: a text, or {title, subtitle, body}; category names the phone's buttons
// for it (the coach's "Vyměnit" / "Nechat"), data rides along for them;
// mutable lets the app's notification extension add an image (the ring);
// wake also wakes the app in the background (content-available).
export async function sendPush(env, device, alert, { fetchImpl = fetch, now = Date.now(), category = null, data = null, mutable = false, wake = false, topic = APNS_TOPIC } = {}) {
  if (!pushConfigured(env)) return { ok: false, skipped: true };
  const jwt = await apnsJwt(env, now);
  const response = await fetchImpl(`https://${apnsHost(env, device.environment)}/3/device/${device.token}`, {
    method: "POST",
    headers: { authorization: "bearer " + jwt, "apns-topic": topic, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" },
    body: JSON.stringify({ ...(data || {}), aps: { alert, sound: "default", ...(category ? { category } : {}), ...(mutable ? { "mutable-content": 1 } : {}), ...(wake ? { "content-available": 1 } : {}) } })
  });
  if (response.status === 200) return { ok: true };
  const reason = await response.json().then(x => x?.reason || null).catch(() => null);
  // A refused provider token is made again next time.
  if (response.status === 403 && /ProviderToken/.test(String(reason))) cachedJwt = null;
  return { ok: false, status: response.status, reason, gone: response.status === 410 || DEAD_TOKEN.has(reason) };
}

// The morning push (Petr, 2026-10-25): the readiness with one piece of advice
// from its zone as the title ("Readiness 66 · Go easier today"), the night's
// numbers against the athlete's normal as the subtitle ("Sleep 6:40 · HRV
// −14% · Resting HR +2") and what to do with today's planned sessions as the
// body. Signs of illness (breathing or temperature up), a sick check-in or a
// paused athlete never get "go hard". `zone` is the colour of the ring the
// app's notification extension draws (ios-native ReadinessNotification).
// With `date` and `context` (morning-advice.js) the advice also weighs the
// short night, the days before, the journal, an injury and tomorrow: two
// reasons to hold back turn green into yellow, three turn yellow into red,
// and the body starts with them ("3 gym days in a row and a short night.").
export function readinessMessage({ score, zone, flags = [], missing = [], checkin = null, athleteState = null, sleep = null, hrv = null, restingHR = null, planned = [], tomorrow = [], context = null, date = null }) {
  const sick = checkin === "sick" || (flags || []).includes("checkin_sick"), signs = (flags || []).some(f => /^(respiration|skin_temp|wrist_temp)_elevated$/.test(f));
  const rest = sick || (athleteState && athleteState !== "active");
  const noSleep = (missing || []).includes("sleep");
  const sessions = (planned || []).filter(s => s && s.title).slice(0, 2);
  const names = sessions.map(s => s.title).join(", ");
  const sport = sessions.length === 1 ? sessions[0].sport : null;
  const weighed = !rest && !signs && !noSleep && date && context;
  const signals = weighed ? adviceSignals({ date, sleepMinutes: sleep?.minutes, context }) : [];
  const injury = weighed ? injuryNote(context.memories) : null;
  const level = zone === "green" && signals.length >= 2 ? "yellow" : zone === "yellow" && signals.length >= 3 ? "red" : zone;
  const legs = level === "yellow" && signals.some(s => s.legs);
  const saveFor = weighed && level === "green" && !signals.length && !sessions.some(isHardSession) ? (tomorrow || []).filter(s => s && s.title).find(isHardSession) : null;
  const shown = rest ? "red" : signs && level === "green" ? "yellow" : level;
  const advice = rest ? L("Dnes odpočinek", "Rest today") : signs ? L("Dnes bez intenzity", "No intensity today")
    : legs ? L("Dej nohám pauzu", "Give your legs a break")
    : saveFor ? L("Dnes v klidu", "Keep today easy")
    : level === "green" && signals.length === 1 ? L("Můžeš trénovat", "Good to train")
    : level === "green" && injury ? L("Trénuj opatrně", "Train with care")
    : {
      green: L("Dnes klidně naplno", "Go hard today"),
      yellow: L("Dnes spíš lehčeji", "Go easier today"),
      red: L("Dnes odpočinek", "Rest today")
    }[level];
  const title = L("Připravenost", "Readiness") + " " + Math.round(Number(score)) + (advice ? " · " + advice : "");
  const subtitle = nightNumbers({ sleep, hrv, restingHR, noSleep }) || undefined;
  let body;
  if (noSleep) body = L("Otevři Aurin, ať se noc nahraje; skóre se může změnit.", "Open Aurin to sync last night; the score may change.");
  else if (rest) body = names ? L(`${names} dnes vynech a dej tělu klid.`, `Skip today's ${names} and let your body recover.`) : L("Dej tělu klid.", "Let your body recover today.");
  else if (signs) body = L("Dech nebo teplota ve spánku jsou nad tvým normálem. Dnes odpočívej a napiš kouči, jak se cítíš.", "Your breathing or temperature in sleep is above your normal. Rest today and tell the coach how you feel.");
  else if (saveFor) body = L(`Zítra: ${saveFor.title}. Dnes lehce v Z2, ať na něj máš síly.`, `Tomorrow: ${saveFor.title}. Easy Z2 today so you're fresh for it.`);
  else if (level === "green" && signals.length === 1) body = names ? L(`Dnešní plán: ${names}. Odtrénuj ho podle plánu, nic navíc.`, `Today's plan: ${names}. Train as planned, nothing extra.`) : L("Nic naplánováno. Klidně trénuj, jen bez maxim.", "Nothing planned. Train if you like, just no all-out efforts.");
  else if (level === "green") body = names ? L(`Dnešní plán: ${names}. Tělo je připravené, do toho.`, `Today's plan: ${names}. Your body is ready, go for it.`) : L("Nic naplánováno. Dobrý den na těžší trénink.", "Nothing planned. A good day for a harder session.");
  else if (level === "yellow") body = legs && !names ? L("Horní polovina těla nebo lehká jízda v Z2, nohy dnes ne.", "Upper body or an easy Z2 ride, no legs today.")
    : !names ? L("Nic naplánováno. Když budeš trénovat, tak lehce: Z2 nebo lehká posilovna.", "Nothing planned. If you train, keep it easy: Z2 or a light gym session.")
    : sport === "strength" ? L(`Dnešní plán: ${names}. Lehčí váhy, skonči 2–3 opakování před selháním.`, `Today's plan: ${names}. Lighter weights, stop 2–3 reps before failure.`)
    : sport === "ride" || sport === "run" ? L(`Dnešní plán: ${names}. Raději lehce v Z2, intervaly jindy.`, `Today's plan: ${names}. Keep it easy in Z2 instead, intervals another day.`)
    : L(`Dnešní plán: ${names}. Dnes v klidnějším tempu.`, `Today's plan: ${names}. Take it easier than usual.`);
  else if (level === "red") body = names ? L(`${names} dnes vynech. Nanejvýš procházka nebo lehké protažení.`, `Skip today's ${names}. A walk or easy mobility at most.`) : L("Nanejvýš procházka nebo lehké protažení.", "A walk or easy mobility at most.");
  if (body && !saveFor && signals.length) body = reasonsSentence(signals) + " " + body;
  if (body && injury) body += " " + L(`Pamatuj: ${injury}.`, `Keep in mind: ${injury}.`).replace(/\.\.$/, ".");
  // What the days before, the journal, an injury or tomorrow changed: Today's coach card says the same (app-today.js).
  const changed = weighed && (signals.length || saveFor || injury) ? { headline: advice, recommendation: body } : null;
  return { alert: { title, ...(subtitle ? { subtitle } : {}), ...(body ? { body } : {}) }, zone: shown || null, ...(changed ? { changed } : {}) };
}

// "Sleep 6:40 · HRV −14% · Resting HR +2": the night, and HRV and resting
// heart rate against their baseline (the plain value until it has one).
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
export function nightNumbers({ sleep = null, hrv = null, restingHR = null, noSleep = false } = {}) {
  const parts = [];
  const minutes = Number(sleep?.minutes);
  if (minutes > 0) parts.push(L("Spánek", "Sleep") + " " + Math.floor(minutes / 60) + ":" + String(Math.round(minutes % 60)).padStart(2, "0"));
  const h = Number(hrv?.value), hb = Number(hrv?.baseline);
  if (h > 0) parts.push("HRV " + (hb > 0 ? signed(Math.round((h / hb - 1) * 100)) + L(" %", "%") : Math.round(h) + " ms"));
  const r = Number(restingHR?.value), rb = Number(restingHR?.baseline);
  if (r > 0) parts.push(L("Klidový tep", "Resting HR") + " " + (rb > 0 ? signed(Math.round(r - rb)) : Math.round(r)));
  if (noSleep && !(minutes > 0)) parts.push(L("spánek zatím chybí", "no sleep yet"));
  return parts.join(" · ");
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
// allows a push; details(date) the push's numbers and plan, once it goes out.
export async function sendMorningReadiness(env, { readiness, details = null, now = new Date(), fetchImpl = fetch } = {}) {
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
      if (localHour(now) < MORNING_TO_HOUR - 1 || typeof readiness !== "function" || !scored(await Promise.resolve().then(() => readiness(shiftDay(date, -1))).catch(() => null))) return { sent: 0, reason: "no-score", score: value?.score ?? null, missing: value?.missing || [] };
      text = L("Data z noci zatím nedorazila. Otevři Aurin a synchronizuje se.", "Last night's data hasn't arrived yet. Open Aurin to sync.");
    }
    // Without last night the score is HRV and resting HR only: wait for the
    // night's upload until the last hour of the window.
    if (!text && (value.missing || []).includes("sleep") && localHour(now) < MORNING_TO_HOUR - 1) return { sent: 0, reason: "waiting-for-sleep", score: value.score, missing: value.missing };
    // The day is claimed before sending, so an upload and the cron at the same moment send one push.
    const claim = await db.prepare("INSERT INTO push_log(user_id,kind,local_date) VALUES(?,?,?) ON CONFLICT(user_id,kind,local_date) DO NOTHING").bind(db.userId, MORNING_READINESS, date).run();
    if (!Number(claim?.meta?.changes)) return { sent: 0, reason: "already-sent" };
    // A scored morning carries its score and ring colour for the app's
    // notification extension (mutable-content lets it add the ring).
    // details(date) adds the night, the baselines, today's and tomorrow's plan and what else the
    // advice weighs (entrypoint.js todayReadiness, morning-advice.js).
    const more = text || typeof details !== "function" ? null : await Promise.resolve().then(() => details(date)).catch(() => null);
    const full = more ? { ...value, sleep: more.sleep ?? null, hrv: more.hrv ?? null, restingHR: more.restingHR ?? null, planned: more.planned || [], tomorrow: more.tomorrow || [], context: more.context || null, date } : value;
    const message = text ? null : readinessMessage(full);
    const alert = text || message.alert;
    // It also wakes the app, which loads Today for the widgets, so they show
    // the morning before the app is opened (ios-native AppDelegate). Its
    // category lets the app show the morning in full when it is held down.
    const extra = message ? { data: { readiness: { score: Math.round(Number(value.score)), zone: message.zone } }, mutable: true, wake: true, category: "MORNING_READINESS" } : {};
    let sent = 0, removed = 0;
    for (const device of devices) {
      const result = await sendPush(env, device, alert, { fetchImpl, now: now.getTime(), ...extra }).catch(error => ({ ok: false, error: error.message }));
      if (result.ok) sent++;
      else if (result.gone) removed += await deletePushToken(db, device.token);
      else console.error("Push not delivered", result.status || "", result.reason || result.error || "");
    }
    // Nothing reached a phone (APNs down, a network error): a later sync tries again.
    if (!sent) await db.prepare("DELETE FROM push_log WHERE user_id=? AND kind=? AND local_date=?").bind(db.userId, MORNING_READINESS, date).run();
    return { sent, removed, date, text: alert };
  }));
}

// ---- A food the owner fixed ---------------------------------------------------

// The owner approved a correction or a report (food-suggestions.js): each
// author gets one push in their language, titled with the food; a tap opens
// the corrected food (the app's FoodPush). raw is the unscoped central DB,
// where every user's push tokens are.
export function foodApprovedMessage(kind, product) {
  return {
    title: String(product?.name || "").slice(0, 80) || L("Potravina", "Food"),
    body: kind === "report"
      ? L("Díky za nahlášení! Hodnoty jsou opravené a teď je vidí všichni.", "Thanks for the report! The values are fixed and everyone sees them now.")
      : L("Tvoje oprava platí. V Aurinu ji teď vidí všichni.", "Your correction is approved. Everyone in Aurin sees it now.")
  };
}

const PUSH_PRODUCT_FIELDS = ["name", "brand", "barcode", "nutrition_basis", "serving_size", "serving_name", "quantity", "catalog_key", "calories_100g", "protein_100g", "carbs_100g", "sugars_100g", "fat_100g", "fiber_100g", "salt_100g"];

export async function sendFoodApproved(env, raw, { users = [], product } = {}, { fetchImpl = fetch } = {}) {
  if (!pushConfigured(env) || !raw || !product?.name) return { sent: 0, reason: "not-configured" };
  // Apple takes 4 KB: the food's label values, without vitamins.
  const food = Object.fromEntries(PUSH_PRODUCT_FIELDS.filter(k => product[k] != null).map(k => [k, product[k]]));
  food.source = "shared";
  let sent = 0;
  for (const { userId, kind } of users) {
    const devices = (await raw.prepare("SELECT token, environment FROM push_tokens WHERE user_id=?").bind(userId).all().catch(() => ({ results: [] }))).results || [];
    if (!devices.length) continue;
    const alert = await withLang(await storedLanguage(raw, userId), () => foodApprovedMessage(kind, product));
    for (const device of devices) {
      const result = await sendPush(env, device, alert, { fetchImpl, data: { food: { kind, product: food } } }).catch(error => ({ ok: false, error: error.message }));
      if (result.ok) sent++;
      else if (result.gone) await raw.prepare("DELETE FROM push_tokens WHERE user_id=? AND token=?").bind(userId, device.token).run();
      else console.error("Food push not delivered", result.status || "", result.reason || result.error || "");
    }
  }
  return { sent };
}
