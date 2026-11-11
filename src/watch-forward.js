// Workouts other apps recorded, passed on to the user's other services
// ("Workouts from other apps" on the destination's page in Zdroje dat), each
// app with its own switch, all off at first:
// - to Intervals.icu: Apple Health's (Apple Watch or any app writing there;
//   the health type 'workouts'), which Intervals.icu cannot read; Wahoo's,
//   once the user unpaired it from Intervals.icu to have one place for
//   everything (the ride's FIT file, sync-destinations.js uploadFit); Google
//   Health's (Fitbit and other watches), which Intervals.icu cannot read either.
//   Aurin's own workouts are not among them; they go when they are finished.
// - to Google Health: Wahoo's (forwardToGoogle). Not Apple Health's: the
//   Google Health app reads Apple Health itself.
// - to Apple Health: Wahoo's and Google Health's, written by the iPhone, which
//   asks for the list (appleForwardList) and says what it did (appleForwardDone).
// Wahoo's and Google's go from the moment they were turned on (or 14 days
// before, when the user asked for the last two weeks too; forwardSince).
//
// A workout goes once, two hours after it ended and only while the
// destination does not have it: an app that writes there itself (Strava,
// Garmin Connect, Zwift or Wahoo still paired with Intervals.icu, the Wahoo
// app writing to Apple Health) has done so by then, the sync has brought that
// record back and it is found by its time (activity-match.js sameSession), so
// it is not sent a second time. Of two records of one workout from apps that
// are both on (a ride on the Wahoo and the watch), only the one the matching
// kept goes; the other only when its app is off.
import { sendActivity, ensureSyncTables, readSyncPrefs, healthAllowed, normalizeActivity, intervalsActivity, BACKFILL_DAYS, EXTERNAL_PREFIX, LEGACY_EXTERNAL_PREFIX } from "./sync-destinations.js";
import { intervalsActivities, recordSent } from "./intervals-catchup.js";
import { sameSession } from "./activity-match.js";
import { localDate } from "./user-time.js";
import { L } from "./lang.js";
import { typeName, watchType } from "./activity-type.js";
import { grantedExtras } from "./google-scopes.js";

const WAIT_MS = 2 * 3600000;
const DAYS = 3;
const LIMIT = 10;
// At most this many sends a day (an OAuth app has 100 requests per athlete a
// day, shared with the plan, the wellness and the import).
export const PER_DAY = 25;
const shiftDay = (day, days) => new Date(Date.parse(day + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

// Google's exerciseType (as apple-health.js stores HealthKit's) as Intervals.icu's type.
const TYPE = {
  RUNNING: "Run", TREADMILL_RUNNING: "VirtualRun", BIKING: "Ride", INDOOR_BIKING: "VirtualRide", MOUNTAIN_BIKING: "MountainBikeRide",
  WALKING: "Walk", HIKING: "Hike", SWIMMING: "Swim", WEIGHTLIFTING: "WeightTraining", STRENGTH_TRAINING: "WeightTraining",
  HIIT: "HighIntensityIntervalTraining", YOGA: "Yoga", ROWING: "Rowing", ELLIPTICAL: "Elliptical", CROSS_TRAINING: "Crossfit",
  CORE_TRAINING: "WeightTraining", PILATES: "Pilates", SOCCER: "Soccer", TENNIS: "Tennis", CROSS_COUNTRY_SKIING: "NordicSki",
  SKIING: "AlpineSki", STAIR_CLIMBING: "StairStepper"
};
const NAME = {
  Run: ["Běh", "Run"], VirtualRun: ["Běh na pásu", "Treadmill run"], Ride: ["Jízda na kole", "Ride"], VirtualRide: ["Kolo uvnitř", "Indoor ride"],
  MountainBikeRide: ["Horské kolo", "Mountain bike ride"], Walk: ["Chůze", "Walk"], Hike: ["Turistika", "Hike"], Swim: ["Plavání", "Swim"],
  WeightTraining: ["Silový trénink", "Strength training"], Yoga: ["Jóga", "Yoga"]
};

// Each app: where its workouts are stored and the key a send is kept under.
const SOURCES = {
  apple: { family: "apple-health", type: "exercise", key: id => "apple:" + String(id).replace(/^apple:/, "") },
  google: { family: "google-wearables", type: "exercise", key: id => "google:" + String(id).split("/").pop().replace(/^google:/, "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 100) },
  wahoo: { family: "wahoo", type: "activity", key: id => "wahoo:" + String(id).replace(/^wahoo:/, "") }
};
const FAMILY_SOURCE = Object.fromEntries(Object.entries(SOURCES).map(([source, s]) => [s.family, source]));
// The key a stored workout's send is kept under (sync_sends), or null for another source.
export const forwardKey = row => FAMILY_SOURCE[row?.source_family] ? SOURCES[FAMILY_SOURCE[row.source_family]].key(row.external_id) : null;

const parse = json => { try { return JSON.parse(json || "{}"); } catch { return null; } };

// A stored Apple Health or Google Health workout as the activity sendActivity takes, or null.
export function watchActivity(row, key = SOURCES.apple.key(row.external_id)) {
  const payload = parse(row.payload_json);
  if (!payload) return null;
  const ex = payload.exercise || {}, start = row.start_time || ex.interval?.startTime, end = row.end_time || ex.interval?.endTime;
  const active = Number(String(ex.activeDuration || "").replace(/s$/, ""));
  const minutes = Math.round((active > 0 ? active : (Date.parse(end) - Date.parse(start)) / 1000) / 60);
  if (!start || !(minutes > 0)) return null;
  const type = TYPE[ex.exerciseType] || watchType(ex.exerciseType) || "Workout", m = ex.metricsSummary || {};
  const name = String(ex.displayName || "").trim() || (NAME[type] ? L(...NAME[type]) : type !== "Workout" ? typeName(type) : L("Trénink", "Workout"));
  return {
    key, sport: "", type, name, date: localDate(start), start, minutes,
    distance: m.distanceMeters ?? (m.distanceMillimeters != null ? m.distanceMillimeters / 1000 : undefined), avgHr: m.averageHeartRateBeatsPerMinute, maxHr: m.maxHeartRateBeatsPerMinute, kcal: m.caloriesKcal
  };
}

// A stored Wahoo workout (wahoo.js wahooActivityRow): its FIT file goes, the
// summary only when Wahoo no longer gives the file.
export function wahooActivity(row) {
  const p = parse(row.payload_json);
  const workoutId = String(p?.wahoo?.workoutId ?? "");
  const seconds = Number(p?.moving_time) || Number(p?.elapsed_time);
  if (!p?.start_date || !/^\d{1,15}$/.test(workoutId) || !(seconds > 0)) return null;
  return {
    key: SOURCES.wahoo.key(row.external_id), sport: "", type: p.type || "Ride", name: p.name || L("Jízda", "Ride"), date: localDate(p.start_date), start: p.start_date,
    minutes: Math.max(1, Math.round(seconds / 60)), distance: p.distance, avgHr: p.average_heartrate, kcal: p.calories, wahoo: workoutId
  };
}

// When the stored workout ended (ms), whatever the source.
function endedAt(row) {
  if (row.source_family === "wahoo") {
    const p = parse(row.payload_json);
    return Date.parse(p?.start_date) + (Number(p?.elapsed_time) || Number(p?.moving_time) || 0) * 1000;
  }
  return Date.parse(row.end_time);
}
const startedAt = row => row.source_family === "wahoo" ? Date.parse(parse(row.payload_json)?.start_date) : Date.parse(row.start_time);

// Each destination: the family of its own records in health_datapoints (the
// ones Aurin reads from it) and, where the check is made here, their type.
const TO = {
  intervals: { family: "intervals" },
  google: { family: "google-wearables", type: "exercise" },
  apple: { family: "apple-health", type: "exercise" }
};

// Whether the record goes to `to`: not when the destination or Aurin itself
// has the workout (paired with its record or a 'local:' one), not when it was
// deleted, and a copy (record_role 'duplicate') only when the record kept
// instead is not one that goes too: its app is off, or it is a record that
// never goes there itself (Intervals.icu's, kept over a ride Wahoo also
// uploaded there, goes nowhere but Intervals.icu).
export function forwardable(row, on, to = "intervals") {
  const matched = String(row.matched_activity_id || ""), family = matched.split(":")[0];
  if (matched === "deleted" || family === "local" || family === TO[to].family) return false;
  if (row.record_role !== "duplicate") return true;
  const kept = FAMILY_SOURCE[family];
  return !kept || !on.includes(kept);
}

// The destination's preferences and the connected apps switched on for it.
async function switchedOn(env, to) {
  const prefs = await readSyncPrefs(env.DB, env.USER_ID, to), connected = env.CONNECTED_PROVIDERS || [];
  // Apple Health's workouts are health data: they go to Intervals.icu only once
  // the athlete turned them on (the connect sheet or Synchronizace).
  const on = [...(to === "intervals" && healthAllowed(prefs, "workouts") ? ["apple"] : []), ...(prefs.forward || []).filter(source => connected.includes(source))];
  return { prefs, on };
}

// The workouts due for `to`: ended two hours ago, each app's from its start,
// not paired with the destination's record and not sent or looked at before
// (sync_sends). `there`: the destination's own records of those days.
async function dueWorkouts(env, to, prefs, on, now) {
  const since = prefs.since || {};
  const recent = now - DAYS * 86400000, oldest = now - (BACKFILL_DAYS + 1) * 86400000;
  // Each app from its start: three days back, further only while a start of
  // the last two weeks asks for it.
  const from = source => {
    const start = Date.parse(since[source]);
    return source === "apple" || !Number.isFinite(start) ? recent : start >= oldest && start < recent ? start : Math.max(start, recent);
  };
  await ensureSyncTables(env.DB);
  // A day of slack on the bound: Wahoo's times are local.
  const lower = new Date(Math.min(...on.map(from)) - 86400000).toISOString();
  const kinds = [...on.map(source => SOURCES[source]), ...(TO[to].type ? [TO[to]] : [])];
  const which = kinds.map(k => `(source_family = '${k.family}' AND data_type = '${k.type}')`).join(" OR ");
  const rows = (await env.DB.prepare(`SELECT source_family, external_id, start_time, end_time, payload_json, record_role, matched_activity_id FROM health_datapoints
    WHERE user_id = ? AND (${which}) AND COALESCE(sample_time, end_time, start_time) >= ? ORDER BY start_time LIMIT 300`)
    .bind(env.USER_ID, lower).all().catch(() => ({ results: [] }))).results || [];
  const there = rows.filter(row => row.source_family === TO[to].family);
  const due = rows.filter(row => {
    const source = FAMILY_SOURCE[row.source_family];
    return on.includes(source) && row.source_family !== TO[to].family && startedAt(row) >= from(source) && endedAt(row) <= now - WAIT_MS && forwardable(row, on, to);
  });
  if (!due.length) return { open: [], there };
  const keys = due.map(forwardKey), done = new Set();
  // D1 takes at most 100 bound values a query.
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const found = (await env.DB.prepare(`SELECT activity_key FROM sync_sends WHERE user_id = ? AND destination = ? AND activity_key IN (${part.map(() => "?").join(",")})`)
      .bind(env.USER_ID, to, ...part).all()).results || [];
    for (const r of found) done.add(r.activity_key);
  }
  return { open: due.filter(row => !done.has(forwardKey(row))), there };
}

// How many more may go to `to` today (at most PER_DAY, at most `limit` now).
async function leftToday(env, to, limit) {
  const today = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM sync_sends WHERE user_id = ? AND destination = ? AND created_at >= date('now')
    AND (activity_key LIKE 'apple:%' OR activity_key LIKE 'wahoo:%' OR activity_key LIKE 'google:%') AND status NOT IN ('same', 'skipped')`).bind(env.USER_ID, to).first())?.n || 0;
  return Math.min(limit, PER_DAY - today);
}

// A record that can never go (no time, no length) or that is there already:
// marked, so it is not looked at again.
const mark = (env, to, key, status) => env.DB.prepare(`INSERT INTO sync_sends (user_id, activity_key, destination, status, payload_json) VALUES (?, ?, ?, ?, '{}') ON CONFLICT(user_id, activity_key, destination) DO NOTHING`)
  .bind(env.USER_ID, key, to, status).run();
// Claimed first: a second pass running at the same time (the switch turned on
// during the five-minute run) finds it taken and leaves it.
const claim = async (env, to, activity) => ((await env.DB.prepare(`INSERT INTO sync_sends (user_id, activity_key, destination, status, payload_json) VALUES (?, ?, ?, 'pending', ?) ON CONFLICT(user_id, activity_key, destination) DO NOTHING`)
  .bind(env.USER_ID, activity.key, to, JSON.stringify(activity)).run()).meta?.changes || 0) > 0;

// The stored workout as the activity sendActivity takes (`raw`) and as it goes (`activity`), or null.
function prepared(row) {
  const raw = row.source_family === "wahoo" ? wahooActivity(row) : watchActivity(row, forwardKey(row));
  try { return raw ? { raw, activity: normalizeActivity(raw) } : null; } catch { return null; }
}

// One pass for one user with Intervals.icu connected. `limit`: how many go at
// most (more after turning a source on with the last two weeks).
export async function forwardWatchWorkouts(env, { now = Date.now(), fetchImpl = fetch, limit = LIMIT } = {}) {
  if (!(env.CONNECTED_PROVIDERS || []).includes("intervals")) return { status: "skipped" };
  const { prefs, on } = await switchedOn(env, "intervals");
  if (!on.length) return { status: "skipped", reason: "off" };
  const { open } = await dueWorkouts(env, "intervals", prefs, on, now);
  if (!open.length) return { status: "ok", sent: [] };
  const allowed = await leftToday(env, "intervals", limit);
  if (allowed <= 0) return { status: "ok", sent: [], capped: true };
  // One look at those days in Intervals.icu instead of one per workout (an
  // OAuth app has 100 requests per athlete a day): what is there under our
  // external_id is only recorded, what is there from elsewhere is left.
  const day = row => localDate(new Date(startedAt(row)).toISOString());
  let list;
  try {
    list = await intervalsActivities(env, shiftDay(day(open[0]), -1), shiftDay(day(open[open.length - 1]), 1), fetchImpl);
  } catch (error) {
    console.error("Workout forward read failed", error.message);
    return { status: "error", sent: [] };
  }
  const sent = [];
  let sends = 0;
  for (const row of open) {
    if (sends >= allowed) break;
    const ready = prepared(row);
    if (!ready) { await mark(env, "intervals", forwardKey(row), "skipped"); continue; }
    const { raw, activity } = ready;
    const ours = list.find(a => [EXTERNAL_PREFIX, LEGACY_EXTERNAL_PREFIX].some(prefix => a?.external_id === prefix + env.USER_ID + ":" + activity.key));
    if (ours?.id != null) { await recordSent(env, activity, ours.id); sent.push({ key: activity.key, status: "there" }); continue; }
    // There already, from elsewhere or sent by Aurin from another app (the
    // watch's copy of a Wahoo ride once Wahoo is off). Not looked at again.
    if (list.some(a => sameSession({ payload: a }, row))) {
      await mark(env, "intervals", activity.key, "same");
      sent.push({ key: activity.key, status: "same" });
      continue;
    }
    if (!(await claim(env, "intervals", activity))) continue;
    sends++;
    try {
      const result = await sendActivity(env, raw, { fetchImpl, only: ["intervals"], absent: true, forwarded: true });
      const status = result.sends[0]?.status || "off";
      sent.push({ key: activity.key, status });
      // There now: a second record of this workout later in this pass (two
      // apps wrote it to Apple Health) finds it and stays.
      if (status === "sent") list.push(intervalsActivity(env.USER_ID, activity));
    } catch (error) { console.error("Workout forward failed", error.message); }
  }
  return { status: "ok", sent };
}

// One pass to Google Health for one user with it and Wahoo connected: Wahoo's
// workouts as an exercise each, with what Wahoo measured. What Google Health
// has of those days Aurin read (index.js syncGoogle): a workout with the same
// time there (the watch's, or one Aurin wrote) is not sent.
export async function forwardToGoogle(env, { now = Date.now(), fetchImpl = fetch, googleToken = null, limit = LIMIT } = {}) {
  const connected = env.CONNECTED_PROVIDERS || [];
  if (!connected.includes("google") || !connected.includes("wahoo")) return { status: "skipped" };
  const { prefs, on: chosen } = await switchedOn(env, "google");
  // Wahoo's going to Apple Health too: the Google Health app reads Apple
  // Health, so it gets that copy, and one sent here would be a second.
  const toApple = chosen.length ? (await readSyncPrefs(env.DB, env.USER_ID, "apple")).forward || [] : [];
  const on = chosen.filter(source => !toApple.includes(source));
  if (!on.length) return { status: "skipped", reason: chosen.length ? "via-apple" : "off" };
  // Without the permission to write workouts the page asks for it (googleMissingScopes).
  if (!grantedExtras(env).activityWrite) return { status: "skipped", reason: "scope" };
  const { open, there } = await dueWorkouts(env, "google", prefs, on, now);
  if (!open.length) return { status: "ok", sent: [] };
  const allowed = await leftToday(env, "google", limit);
  if (allowed <= 0) return { status: "ok", sent: [], capped: true };
  const sent = [];
  let sends = 0;
  for (const row of open) {
    if (sends >= allowed) break;
    const ready = prepared(row);
    if (!ready) { await mark(env, "google", forwardKey(row), "skipped"); continue; }
    const { raw, activity } = ready;
    if (there.some(t => sameSession(t, row))) {
      await mark(env, "google", activity.key, "same");
      sent.push({ key: activity.key, status: "same" });
      continue;
    }
    if (!(await claim(env, "google", activity))) continue;
    sends++;
    try {
      const result = await sendActivity(env, raw, { fetchImpl, googleToken, only: ["google"], forwarded: true });
      sent.push({ key: activity.key, status: result.sends[0]?.status || "off" });
    } catch (error) { console.error("Workout forward to Google failed", error.message); }
  }
  return { status: "ok", sent };
}

// GET /app/api/sync/forward/apple: what the iPhone writes to Apple Health,
// at most PER_DAY at a time. What Apple Health has of those days Aurin read is
// marked 'same' here; the iPhone also looks in Apple Health itself before it writes.
export async function appleForwardList(env, { now = Date.now() } = {}) {
  const { prefs, on } = await switchedOn(env, "apple");
  if (!on.length) return [];
  const { open, there } = await dueWorkouts(env, "apple", prefs, on, now);
  const out = [];
  for (const row of open) {
    if (out.length >= PER_DAY) break;
    const ready = prepared(row);
    if (!ready) { await mark(env, "apple", forwardKey(row), "skipped"); continue; }
    const { raw, activity } = ready;
    if (there.some(t => sameSession(t, row))) { await mark(env, "apple", activity.key, "same"); continue; }
    const start = new Date(raw.start);
    if (!Number.isFinite(+start)) { await mark(env, "apple", activity.key, "skipped"); continue; }
    out.push({ key: activity.key, type: activity.type || "Workout", name: activity.name, start: start.toISOString(), minutes: activity.minutes,
      ...(activity.distance ? { distance: activity.distance } : {}), ...(activity.kcal ? { kcal: activity.kcal } : {}) });
  }
  return out;
}

// POST /app/api/sync/forward/apple { key, status: 'sent' | 'same' }: the
// iPhone wrote the workout to Apple Health, or found it there already.
export async function appleForwardDone(env, body = {}) {
  const key = String(body.key || ""), status = String(body.status || "");
  if (!/^(wahoo|google):[A-Za-z0-9._-]{1,110}$/.test(key) || !["sent", "same"].includes(status)) throw Object.assign(new Error(L("Neplatný trénink.", "Invalid workout.")), { status: 400 });
  await ensureSyncTables(env.DB);
  await env.DB.prepare(`INSERT INTO sync_sends (user_id, activity_key, destination, status, payload_json) VALUES (?, ?, 'apple', ?, '{}')
    ON CONFLICT(user_id, activity_key, destination) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`).bind(env.USER_ID, key, status).run();
  return { status: "ok" };
}

// An app's workouts just turned on: the first ones go now, not at the next
// run. At most once in ten minutes per destination, so switching on and off
// again and again does not use up Intervals.icu's requests.
export async function kickForward(env, { fetchImpl = fetch, to = "intervals", googleToken = null } = {}) {
  try {
    const claim = await env.DB.prepare(`INSERT INTO sync_status (user_id, sync_name, status, updated_at) VALUES (?, ?, 'done', datetime('now'))
      ON CONFLICT(user_id, sync_name) DO UPDATE SET updated_at = excluded.updated_at WHERE sync_status.updated_at < datetime('now', '-10 minutes')`).bind(env.USER_ID, to === "google" ? "workout_forward_kick_google" : "workout_forward_kick").run();
    if (!(claim.meta?.changes > 0)) return { status: "skipped", reason: "recent" };
  } catch (error) {
    if (!/no such table/i.test(error.message)) throw error;
  }
  return to === "google" ? forwardToGoogle(env, { fetchImpl, googleToken, limit: 5 }) : forwardWatchWorkouts(env, { fetchImpl, limit: 5 });
}
