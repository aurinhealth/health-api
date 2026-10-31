// Workouts recorded on Apple Watch (or any app writing to Apple Health) to
// Intervals.icu, which cannot read Apple Health. Aurin's own workouts are not
// among them (the iPhone leaves them out); they go when they are finished.
//
// Only with "Tréninky z Apple Health" on for Intervals.icu (off at first).
//
// A workout goes once, two hours after it ended and only while no other
// source has it: an app that uploads to Intervals.icu itself (Strava, Garmin
// Connect, Zwift) has done so by then, the sync has brought that activity
// back and the matching has paired it with the watch's copy
// (index.js matchActivities), so it is not sent a second time.
import { sendActivity, ensureSyncTables, readSyncPrefs, healthAllowed } from "./sync-destinations.js";
import { localDate } from "./user-time.js";
import { L } from "./lang.js";
import { typeName, watchType } from "./activity-type.js";

const WAIT_MS = 2 * 3600000;
const DAYS = 3;
const LIMIT = 10;

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

// A stored Apple Health workout as the activity sendActivity takes, or null.
export function watchActivity(row) {
  let payload = {};
  try { payload = JSON.parse(row.payload_json || "{}"); } catch { return null; }
  const ex = payload.exercise || {}, start = row.start_time || ex.interval?.startTime, end = row.end_time || ex.interval?.endTime;
  const active = Number(String(ex.activeDuration || "").replace(/s$/, ""));
  const minutes = Math.round((active > 0 ? active : (Date.parse(end) - Date.parse(start)) / 1000) / 60);
  if (!start || !(minutes > 0)) return null;
  const type = TYPE[ex.exerciseType] || watchType(ex.exerciseType) || "Workout", m = ex.metricsSummary || {};
  const name = String(ex.displayName || "").trim() || (NAME[type] ? L(...NAME[type]) : type !== "Workout" ? typeName(type) : L("Trénink", "Workout"));
  return {
    key: "apple:" + String(row.external_id).replace(/^apple:/, ""), sport: "", type, name, date: localDate(start), start, minutes,
    distance: m.distanceMeters, avgHr: m.averageHeartRateBeatsPerMinute, maxHr: m.maxHeartRateBeatsPerMinute, kcal: m.caloriesKcal
  };
}

// One pass for one user with Intervals.icu connected.
export async function forwardWatchWorkouts(env, { now = Date.now(), fetchImpl = fetch } = {}) {
  if (!(env.CONNECTED_PROVIDERS || []).includes("intervals")) return { status: "skipped" };
  // Apple Health's workouts are health data: they go only once the athlete
  // turned them on for Intervals.icu (the connect sheet or Synchronizace).
  if (!healthAllowed(await readSyncPrefs(env.DB, env.USER_ID, "intervals"), "workouts")) return { status: "skipped", reason: "off" };
  await ensureSyncTables(env.DB);
  const rows = (await env.DB.prepare(`SELECT external_id, start_time, end_time, payload_json FROM health_datapoints h
    WHERE user_id = ? AND source_family = 'apple-health' AND data_type = 'exercise' AND start_time >= ? AND end_time <= ?
    AND (record_role IS NULL OR record_role != 'duplicate') AND matched_activity_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM sync_sends s WHERE s.user_id = h.user_id AND s.destination = 'intervals' AND s.activity_key = 'apple:' || replace(h.external_id, 'apple:', ''))
    ORDER BY start_time LIMIT ?`)
    .bind(env.USER_ID, new Date(now - DAYS * 86400000).toISOString(), new Date(now - WAIT_MS).toISOString(), LIMIT).all().catch(() => ({ results: [] }))).results || [];
  const sent = [];
  for (const row of rows) {
    const activity = watchActivity(row);
    if (!activity) continue;
    try {
      const result = await sendActivity(env, activity, { fetchImpl, only: ["intervals"] });
      sent.push({ key: activity.key, status: result.sends[0]?.status || "off" });
    } catch (error) { console.error("Watch workout forward failed", error.message); }
  }
  return { status: "ok", sent };
}
