// Done workouts that never reached Intervals.icu while it was not connected
// or kept refusing, sent afterwards, and the coming plans whose export gave up.
//
// A gym session, a workout typed in and an Apple Watch workout go to
// Intervals.icu when they are saved (sync-destinations.js sendActivity,
// watch-forward.js). With Intervals.icu disconnected nothing is sent and
// nothing is kept to send later; a send Intervals.icu refused three times is
// not tried again (retrySyncSends). A catch-up covers that gap, and only it:
// - after (re)connecting: from the last activity that did reach Intervals.icu,
//   at most CATCHUP_DAYS back (scheduleIntervalsCatchUp);
// - after sends that failed for good: from the first of them;
// - once for everyone connected before it existed: CATCHUP_DAYS back.
// Otherwise the job (every five minutes while one is pending, else hourly) only
// reads its own sync_status row.
//
// No copies: Intervals.icu's activities of those days are read once, and a
// workout is left out when one of them carries our external_id (then it is
// only recorded as sent) or is the same session from another app (a Garmin,
// Wahoo or Strava upload: activity-match.js sameSession, the rule the import
// pairs records by: same sport, starts within 20 minutes, length within 25 %).
//
// State in sync_status 'intervals_catchup': status 'pending' with
// {since, cursor} (UTC ms), or 'done' with finished_at.
import { sendActivity, ensureSyncTables, readSyncPrefs, healthAllowed, EXTERNAL_PREFIX, LEGACY_EXTERNAL_PREFIX, sentByAurin } from "./sync-destinations.js";
import { watchActivity } from "./watch-forward.js";
import { sameSession } from "./activity-match.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { zonedTime, localDateTime, localToday } from "./user-time.js";
import { GYM_ACTIVITY_PREFIX } from "./gym-session-activity.js";
import { ensureLocalWorkouts } from "./local-workouts.js";

export const CATCHUP_DAYS = 30;
const DAY_MS = 86400000;
const NAME = "intervals_catchup";
// Workouts looked at per run; sends per run (each one request, the OAuth app
// has 100 requests per athlete a day).
const BATCH = 40, SENDS = 8;
// A watch workout waits for other apps to upload it first (watch-forward.js).
const WATCH_WAIT_MS = 2 * 3600000;
// A gym session is sent by the app when it is finished; one written while its
// sets are still coming would go with part of its length.
const GYM_WAIT_MS = 2 * 3600000;
// Sends a UTC day, so a long gap does not use up the OAuth app's 100 requests
// a day: three runs' worth, the rest the next day.
const SENDS_A_DAY = 24;
// How far ahead given-up plans are tried again (as Wahoo's, wahoo.js retryWahooExports).
const PLAN_DAYS = 14;

const parse = text => { try { return JSON.parse(text || "{}") || {}; } catch { return {}; } };
const d1Time = ms => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
const d1Ms = value => Date.parse(String(value || "").replace(" ", "T").replace(/Z?$/, "Z"));
const shiftDay = (day, days) => new Date(Date.parse(day + "T12:00:00Z") + days * DAY_MS).toISOString().slice(0, 10);

const ensured = new WeakSet();
async function ensureStatus(db) {
  if (ensured.has(db)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))").run();
  ensured.add(db);
}

// `day`/`sent`: the sends of that UTC day (SENDS_A_DAY).
async function savePending(env, since, cursor = null, count = null) {
  await env.DB.prepare(`INSERT INTO sync_status(user_id,sync_name,status,details_json,updated_at) VALUES(?,?,'pending',?,datetime('now'))
    ON CONFLICT(user_id,sync_name) DO UPDATE SET status='pending',details_json=excluded.details_json,updated_at=excluded.updated_at`)
    .bind(env.USER_ID, NAME, JSON.stringify({ since, cursor, ...(count ? { day: count.day, sent: count.sent } : {}), ...(count?.wait ? { wait: count.wait } : {}) })).run();
}
async function saveDone(env, now) {
  await env.DB.prepare(`INSERT INTO sync_status(user_id,sync_name,status,finished_at,details_json,updated_at) VALUES(?,?,'done',?,'{}',datetime('now'))
    ON CONFLICT(user_id,sync_name) DO UPDATE SET status='done',finished_at=excluded.finished_at,details_json='{}',updated_at=excluded.updated_at`)
    .bind(env.USER_ID, NAME, d1Time(now)).run();
}

// When something last reached Intervals.icu (index user_id, destination, status, updated_at).
async function lastSent(env) {
  try {
    const row = await env.DB.prepare("SELECT MAX(updated_at) AS at FROM sync_sends WHERE user_id = ? AND destination = 'intervals' AND status = 'sent'").bind(env.USER_ID).first();
    const ms = d1Ms(row?.at);
    return Number.isFinite(ms) ? ms : null;
  } catch (error) {
    if (/no such table/i.test(error.message)) return null;
    throw error;
  }
}

// Intervals.icu (re)connected: a catch-up from the last activity that reached
// it (a day earlier, for one saved just before that failed), at most
// CATCHUP_DAYS back. The job does the work within five minutes.
export async function scheduleIntervalsCatchUp(env, { now = Date.now() } = {}) {
  if (!env?.DB || env.USER_ID == null) return null;
  await ensureStatus(env.DB);
  const floor = now - CATCHUP_DAYS * DAY_MS, last = await lastSent(env);
  let since = last == null ? floor : Math.max(floor, last - DAY_MS);
  const row = await env.DB.prepare("SELECT status,details_json FROM sync_status WHERE user_id = ? AND sync_name = ?").bind(env.USER_ID, NAME).first();
  if (row?.status === "pending") since = Math.min(since, Number(parse(row.details_json).since) || since);
  await savePending(env, since);
  return since;
}

// The workouts after `from` (UTC ms) that may be missing: Aurin's own (the
// day's gym session, a workout typed in) when activities go to Intervals.icu,
// and the watch's when its workouts do too. Each as {key, at, session, input}.
async function candidates(env, from, now, prefs) {
  const db = env.DB, out = [];
  if (prefs.pushActivities) {
    await ensureLocalWorkouts(db);
    // start_time of a local activity is the user's local time.
    const rows = (await db.prepare(`SELECT h.external_id, h.start_time, h.payload_json,
        (SELECT l.event_key FROM local_workouts l WHERE l.user_id = h.user_id AND l.id = substr(h.external_id, 10)) AS origin
      FROM health_datapoints h WHERE h.user_id = ? AND h.source_family = 'local' AND h.data_type = 'activity' AND h.start_time >= ?
        AND (h.external_id LIKE 'aurin-gym:%' OR h.external_id LIKE 'activity:%')
      ORDER BY h.start_time LIMIT ?`).bind(env.USER_ID, localDateTime(new Date(from).toISOString()), BATCH).all()).results || [];
    for (const row of rows) {
      const p = parse(row.payload_json), at = zonedTime(p.start_date_local || row.start_time), minutes = Math.round(Number(p.moving_time) / 60);
      if (!(at > from) || !(minutes > 0)) continue;
      const start = new Date(at).toISOString(), date = String(p.start_date_local || row.start_time).slice(0, 10);
      if (row.external_id.startsWith(GYM_ACTIVITY_PREFIX)) {
        // A session still going on (its last set within GYM_WAIT_MS) waits: the
        // app sends it with its full length when it is finished.
        if (at + minutes * 60000 > now - GYM_WAIT_MS) continue;
        out.push({ key: "gym:" + row.external_id.slice(GYM_ACTIVITY_PREFIX.length), at, session: { payload: p },
          input: { key: "gym:" + row.external_id.slice(GYM_ACTIVITY_PREFIX.length), sport: "gym", type: "WeightTraining", name: p.name || "Gym", date, start, minutes, kcal: p.calories } });
      } else if (String(row.origin || "").startsWith("manual:") && !p.pairedWith) {
        // A workout typed in (POST /app/api/workouts/manual), not a plan marked done.
        // One paired with the watch's record went on from the watch (entrypoint.js).
        const key = "manual:" + row.external_id.slice("activity:".length);
        out.push({ key, at, session: { payload: p },
          input: { key, sport: "", type: p.type, name: p.name, date, start, minutes, notes: p.description, rpe: p.rpe, avgHr: p.average_heartrate, maxHr: p.max_heartrate, kcal: p.calories } });
      }
    }
    if (healthAllowed(prefs, "workouts")) {
      const watch = (await db.prepare(`SELECT source_family, external_id, start_time, end_time, payload_json FROM health_datapoints
        WHERE user_id = ? AND source_family = 'apple-health' AND data_type = 'exercise' AND start_time > ? AND end_time <= ?
          AND (record_role IS NULL OR record_role != 'duplicate') AND matched_activity_id IS NULL
        ORDER BY start_time LIMIT ?`).bind(env.USER_ID, new Date(from).toISOString(), new Date(now - WATCH_WAIT_MS).toISOString(), BATCH).all()).results || [];
      for (const row of watch) {
        const input = watchActivity(row), at = Date.parse(row.start_time);
        if (input && at > from) out.push({ key: input.key, at, session: row, input });
      }
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out.slice(0, BATCH);
}

// The candidates already sent, or still being tried (retrySyncSends).
async function handled(env, keys) {
  if (!keys.length) return new Set();
  await ensureSyncTables(env.DB);
  const rows = (await env.DB.prepare(`SELECT activity_key, status, attempts FROM sync_sends WHERE user_id = ? AND destination = 'intervals' AND activity_key IN (${keys.map(() => "?").join(",")})`)
    .bind(env.USER_ID, ...keys).all()).results || [];
  return new Set(rows.filter(r => r.status === "sent" || r.status === "off" || Number(r.attempts) < 3).map(r => r.activity_key));
}

export async function intervalsActivities(env, oldest, newest, fetchImpl) {
  const response = await fetchImpl(`https://intervals.icu/api/v1/athlete/0/activities?oldest=${oldest}&newest=${newest}`, {
    headers: { Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: "application/json" }, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Intervals.icu HTTP " + response.status);
  const list = await response.json().catch(() => null);
  if (!Array.isArray(list)) throw new Error("Intervals.icu: no activity list");
  return list;
}

// Found at Intervals.icu under our external_id (a send whose answer was lost):
// recorded as sent, so the import skips it (sentIntervalsIds) and it is not sent again.
export async function recordSent(env, item, remoteId) {
  await env.DB.prepare(`INSERT INTO sync_sends (user_id, activity_key, destination, status, remote_id, payload_json, updated_at) VALUES (?, ?, 'intervals', 'sent', ?, '{}', CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, activity_key, destination) DO UPDATE SET status = 'sent', remote_id = excluded.remote_id, message = NULL, updated_at = CURRENT_TIMESTAMP`)
    .bind(env.USER_ID, item.key, String(remoteId)).run();
}

// Plans for the next PLAN_DAYS days whose export to Intervals.icu gave up
// ('failed' after EXPORT_ATTEMPTS while it refused): back to 'pending', so
// retryWorkoutExports sends them within five minutes. Plans made while it was
// not connected wait as 'pending' already and go out with that job.
export async function reviveFailedPlans(env, { now = Date.now() } = {}) {
  await ensureLocalWorkouts(env.DB);
  const today = localToday(new Date(now));
  const result = await env.DB.prepare(`UPDATE workout_exports SET status = 'pending', attempts = 0, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND provider = 'intervals' AND status = 'failed' AND local_id IN (SELECT id FROM local_workouts WHERE user_id = ? AND status = 'scheduled'
      AND substr(json_extract(event_json, '$.start_date_local'), 1, 10) BETWEEN ? AND ?)`).bind(env.USER_ID, env.USER_ID, today, shiftDay(today, PLAN_DAYS)).run();
  return Number(result?.meta?.changes) || 0;
}

// The job for a user with Intervals.icu connected: every five minutes while a
// catch-up is pending (after a reconnect it starts within minutes, not at the
// next :45), hourly (`pendingOnly` false) it also looks for sends refused for good.
export async function runIntervalsCatchUp(env, { now = Date.now(), fetchImpl = fetch, pendingOnly = false } = {}) {
  if (!env?.DB || !env.INTERVALS_API_KEY) return { status: "skipped" };
  await ensureStatus(env.DB);
  const rows = (await env.DB.prepare("SELECT sync_name, status, details_json, finished_at FROM sync_status WHERE user_id = ? AND sync_name IN (?, 'connection_intervals')").bind(env.USER_ID, NAME).all()).results || [];
  const state = rows.find(r => r.sync_name === NAME);
  // Refused access: a reconnect schedules it again (and clears this).
  if (rows.some(r => r.sync_name === "connection_intervals" && r.status === "broken")) return { status: "waiting" };
  if (pendingOnly && state?.status !== "pending") return { status: "idle" };
  const today = new Date(now).toISOString().slice(0, 10);
  const before = state?.status === "pending" ? parse(state.details_json) : {};
  const count = { day: today, sent: before.day === today ? Number(before.sent) || 0 : 0 };
  // After a refusal or "too many", or with the day's sends used up, the
  // five-minute runs wait (an hour, or the next UTC day) instead of asking again.
  if (pendingOnly && Number(before.wait) > now) return { status: "waiting" };
  if (count.sent >= SENDS_A_DAY) {
    count.wait = Date.parse(today + "T00:00:00Z") + DAY_MS;
    await savePending(env, Number(before.since) || now - CATCHUP_DAYS * DAY_MS, before.cursor ?? null, count);
    return { status: "pending", plans: 0, sent: [] };
  }
  let since, cursor = null;
  if (!state) since = now - CATCHUP_DAYS * DAY_MS;
  else if (state.status === "pending") ({ since, cursor = null } = parse(state.details_json));
  else {
    // Workouts saved since the last catch-up that Intervals.icu kept refusing
    // (index user_id, destination, status). By saving time, not by the last
    // attempt: one it refuses for good (a send the catch-up tried again) does
    // not start a catch-up every hour.
    const failed = await env.DB.prepare("SELECT MIN(created_at) AS first FROM sync_sends WHERE user_id = ? AND destination = 'intervals' AND status IN ('error', 'unknown') AND attempts >= 3 AND created_at > ?")
      .bind(env.USER_ID, state.finished_at || "").first().catch(() => null);
    const first = d1Ms(failed?.first);
    if (!Number.isFinite(first)) return { status: "idle" };
    since = Math.max(now - CATCHUP_DAYS * DAY_MS, first - DAY_MS);
  }
  since = Number(since) || now - CATCHUP_DAYS * DAY_MS;
  // Plans once per catch-up, with its first run.
  const plans = cursor == null ? await reviveFailedPlans(env, { now }).catch(error => { console.error("Intervals.icu plans revive failed", error.message); return 0; }) : 0;
  const prefs = await readSyncPrefs(env.DB, env.USER_ID, "intervals");
  const found = await candidates(env, Math.max(since, Number(cursor) || 0), now, prefs);
  const done = await handled(env, found.map(c => c.key));
  const open = found.filter(c => !done.has(c.key));
  if (!open.length) {
    if (found.length >= BATCH) { await savePending(env, since, found[found.length - 1].at, count); return { status: "pending", plans, sent: [] }; }
    await saveDone(env, now);
    return { status: "done", plans, sent: [] };
  }
  let list;
  try {
    list = await intervalsActivities(env, shiftDay(localDateTime(new Date(open[0].at).toISOString()).slice(0, 10), -1), shiftDay(localDateTime(new Date(open[open.length - 1].at).toISOString()).slice(0, 10), 1), fetchImpl);
  } catch (error) {
    // Tried again next hour.
    console.error("Intervals.icu catch-up read failed", error.message);
    await savePending(env, since, cursor, count);
    return { status: "error", plans, sent: [] };
  }
  const sent = [];
  let last = cursor, sends = 0, stopped = false;
  // The answer to the last request: a refusal (401, 403) or "too many" (429)
  // ends the run, the rest waits for the next one.
  let answered = 0;
  const watched = async (url, init) => { const response = await fetchImpl(url, init); answered = response.status; return response; };
  const allowed = Math.min(SENDS, SENDS_A_DAY - count.sent);
  for (const item of open) {
    const ours = list.find(a => [EXTERNAL_PREFIX, LEGACY_EXTERNAL_PREFIX].some(prefix => a?.external_id === prefix + env.USER_ID + ":" + item.key));
    if (ours?.id != null) { await recordSent(env, item, ours.id); sent.push({ key: item.key, status: "there" }); }
    else if (list.some(a => !sentByAurin(a) && sameSession({ payload: a }, item.session))) sent.push({ key: item.key, status: "same" });
    else if (sends >= allowed) { stopped = true; break; }
    else {
      sends++;
      count.sent++;
      answered = 0;
      const result = await sendActivity(env, item.input, { fetchImpl: watched, only: ["intervals"], absent: true }).catch(error => ({ sends: [{ status: "error", message: error.message }] }));
      sent.push({ key: item.key, status: result.sends?.[0]?.status || "off" });
      if ([401, 403, 429].includes(answered)) { stopped = true; count.wait = now + 3600000; break; }
    }
    last = item.at;
  }
  if (stopped || found.length >= BATCH) { await savePending(env, since, last, count); return { status: "pending", plans, sent }; }
  await saveDone(env, now);
  return { status: "done", plans, sent };
}
