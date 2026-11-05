// Workouts other apps recorded to Intervals.icu ("Workouts from other apps"
// on its page in Zdroje dat), each app with its own switch, all off at first:
// - Apple Health (Apple Watch or any app writing there; the health type
//   'workouts'), which Intervals.icu cannot read. Aurin's own workouts are not
//   among them (the iPhone leaves them out); they go when they are finished.
// - Wahoo, once the user unpaired it from Intervals.icu to have one place for
//   everything: the ride's FIT file (sync-destinations.js uploadFit).
// - Google Health (Fitbit, Pixel Watch), which Intervals.icu cannot read either.
// Wahoo's and Google's go from the moment they were turned on (or 14 days
// before, when the user asked for the last two weeks too; forwardSince).
//
// A workout goes once, two hours after it ended and only while no other
// source has it: an app that uploads to Intervals.icu itself (Strava, Garmin
// Connect, Zwift, Wahoo still paired) has done so by then, the sync has
// brought that activity back and the matching has paired it (index.js
// matchActivities), so it is not sent a second time. Of two records of one
// workout from apps that are both on (a ride on the Wahoo and the watch), only
// the one the matching kept goes; the other only when its app is off.
import { sendActivity, ensureSyncTables, readSyncPrefs, healthAllowed, normalizeActivity, BACKFILL_DAYS, EXTERNAL_PREFIX, LEGACY_EXTERNAL_PREFIX } from "./sync-destinations.js";
import { intervalsActivities, recordSent } from "./intervals-catchup.js";
import { sameSession } from "./activity-match.js";
import { localDate } from "./user-time.js";
import { L } from "./lang.js";
import { typeName, watchType } from "./activity-type.js";

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
    distance: m.distanceMeters, avgHr: m.averageHeartRateBeatsPerMinute, maxHr: m.maxHeartRateBeatsPerMinute, kcal: m.caloriesKcal
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

// Whether the record goes: not when Intervals.icu or Aurin itself has the
// workout (paired with an 'intervals:' or 'local:' record), not when it was
// deleted, and a copy (record_role 'duplicate') only when the app of the
// record kept instead is off.
export function forwardable(row, on) {
  const matched = String(row.matched_activity_id || "");
  if (matched === "deleted" || /^(intervals|local):/.test(matched)) return false;
  if (row.record_role !== "duplicate") return true;
  const kept = FAMILY_SOURCE[matched.split(":")[0]];
  return Boolean(kept) && !on.includes(kept);
}

// One pass for one user with Intervals.icu connected. `limit`: how many go at
// most (more after turning a source on with the last two weeks).
export async function forwardWatchWorkouts(env, { now = Date.now(), fetchImpl = fetch, limit = LIMIT } = {}) {
  if (!(env.CONNECTED_PROVIDERS || []).includes("intervals")) return { status: "skipped" };
  const prefs = await readSyncPrefs(env.DB, env.USER_ID, "intervals");
  // Apple Health's workouts are health data: they go only once the athlete
  // turned them on for Intervals.icu (the connect sheet or Synchronizace).
  const on = [
    ...(healthAllowed(prefs, "workouts") ? ["apple"] : []),
    ...(prefs.forward || []).filter(source => (env.CONNECTED_PROVIDERS || []).includes(source))
  ];
  if (!on.length) return { status: "skipped", reason: "off" };
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
  const which = on.map(source => `(source_family = '${SOURCES[source].family}' AND data_type = '${SOURCES[source].type}')`).join(" OR ");
  const rows = (await env.DB.prepare(`SELECT source_family, external_id, start_time, end_time, payload_json, record_role, matched_activity_id FROM health_datapoints
    WHERE user_id = ? AND (${which}) AND COALESCE(sample_time, end_time, start_time) >= ? ORDER BY start_time LIMIT 200`)
    .bind(env.USER_ID, lower).all().catch(() => ({ results: [] }))).results || [];
  const due = rows.filter(row => {
    const source = FAMILY_SOURCE[row.source_family];
    return startedAt(row) >= from(source) && endedAt(row) <= now - WAIT_MS && forwardable(row, on);
  });
  if (!due.length) return { status: "ok", sent: [] };
  const keyOf = row => SOURCES[FAMILY_SOURCE[row.source_family]].key(row.external_id);
  const keys = due.map(keyOf), done = new Set();
  // D1 takes at most 100 bound values a query.
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const found = (await env.DB.prepare(`SELECT activity_key FROM sync_sends WHERE user_id = ? AND destination = 'intervals' AND activity_key IN (${part.map(() => "?").join(",")})`)
      .bind(env.USER_ID, ...part).all()).results || [];
    for (const r of found) done.add(r.activity_key);
  }
  const open = due.filter(row => !done.has(keyOf(row)));
  if (!open.length) return { status: "ok", sent: [] };
  const today = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM sync_sends WHERE user_id = ? AND destination = 'intervals' AND created_at >= date('now')
    AND (activity_key LIKE 'apple:%' OR activity_key LIKE 'wahoo:%' OR activity_key LIKE 'google:%') AND status NOT IN ('same', 'skipped')`).bind(env.USER_ID).first())?.n || 0;
  const allowed = Math.min(limit, PER_DAY - today);
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
  // A record that can never go (no time, no length) is marked, so it is not looked at again.
  const mark = (key, status) => env.DB.prepare(`INSERT INTO sync_sends (user_id, activity_key, destination, status, payload_json) VALUES (?, ?, 'intervals', ?, '{}') ON CONFLICT(user_id, activity_key, destination) DO NOTHING`)
    .bind(env.USER_ID, key, status).run();
  const sent = [];
  let sends = 0;
  for (const row of open) {
    if (sends >= allowed) break;
    const raw = row.source_family === "wahoo" ? wahooActivity(row) : watchActivity(row, keyOf(row));
    let activity = null;
    try { activity = raw && normalizeActivity(raw); } catch { activity = null; }
    if (!activity) { await mark(keyOf(row), "skipped"); continue; }
    const ours = list.find(a => [EXTERNAL_PREFIX, LEGACY_EXTERNAL_PREFIX].some(prefix => a?.external_id === prefix + env.USER_ID + ":" + activity.key));
    if (ours?.id != null) { await recordSent(env, activity, ours.id); sent.push({ key: activity.key, status: "there" }); continue; }
    // There already, from elsewhere or sent by Aurin from another app (the
    // watch's copy of a Wahoo ride once Wahoo is off). Not looked at again.
    if (list.some(a => sameSession({ payload: a }, row))) {
      await mark(activity.key, "same");
      sent.push({ key: activity.key, status: "same" });
      continue;
    }
    // Claimed first: a second pass running at the same time (the switch
    // turned on during the five-minute run) finds it taken and leaves it.
    const claim = await env.DB.prepare(`INSERT INTO sync_sends (user_id, activity_key, destination, status, payload_json) VALUES (?, ?, 'intervals', 'pending', ?) ON CONFLICT(user_id, activity_key, destination) DO NOTHING`)
      .bind(env.USER_ID, activity.key, JSON.stringify(activity)).run();
    if (!(claim.meta?.changes > 0)) continue;
    sends++;
    try {
      const result = await sendActivity(env, raw, { fetchImpl, only: ["intervals"], absent: true, forwarded: true });
      sent.push({ key: activity.key, status: result.sends[0]?.status || "off" });
    } catch (error) { console.error("Workout forward failed", error.message); }
  }
  return { status: "ok", sent };
}

// An app's workouts just turned on: the first ones go now, not at the next
// run. At most once in ten minutes, so switching on and off again and again
// does not use up Intervals.icu's requests.
export async function kickForward(env, { fetchImpl = fetch } = {}) {
  try {
    const claim = await env.DB.prepare(`INSERT INTO sync_status (user_id, sync_name, status, updated_at) VALUES (?, 'workout_forward_kick', 'done', datetime('now'))
      ON CONFLICT(user_id, sync_name) DO UPDATE SET updated_at = excluded.updated_at WHERE sync_status.updated_at < datetime('now', '-10 minutes')`).bind(env.USER_ID).run();
    if (!(claim.meta?.changes > 0)) return { status: "skipped", reason: "recent" };
  } catch (error) {
    if (!/no such table/i.test(error.message)) throw error;
  }
  return forwardWatchWorkouts(env, { fetchImpl, limit: 5 });
}
