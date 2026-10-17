// One workout recorded twice by two devices: Aurin on the iPhone and the
// Apple Watch's own workout app, both written to Apple Health (Petr,
// 2026-10-17). Activity matching (activity-match.js) pairs a watch with
// Intervals.icu, not two watch records with each other, so the day showed
// two sessions. The training calendar now proposes to merge them
// (mergeProposal), and the user picks the time and whose calories and heart
// rate stay (mergeWorkouts) or keeps both (keepWorkoutsApart).
//
// The record whose calories and heart rate were chosen stays; the other one
// becomes record_role 'duplicate' pointing to it, and activity matching keeps
// that (index.js matchActivities). The kept record carries loadwiseMerge in
// its payload: the chosen time, every device that recorded it and whose
// calories count; the syncs keep it (activity-type.js KEEP_TYPE_SQL).
// A copy already forwarded to Intervals.icu (watch-forward.js) is deleted
// there, so it goes out once.
import { sessionOf, overlapShare, activityKindOf } from "./activity-match.js";
import { localDateTime } from "./user-time.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { L } from "./lang.js";

const parse = json => { if (json && typeof json === "object") return json; try { return JSON.parse(json || "{}") || {}; } catch { return {}; } };
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const WATCH = ["apple-health", "google-wearables"];
const ID = /^[A-Za-z0-9:._-]{1,200}$/;
const MERGE_SHARE = 0.6, SAME_EDGE_MS = 2 * 60000;

export const keyOf = row => row.source_family + ":" + row.external_id;

// Who recorded a watch workout, with the logo the app shows for it
// (IntegrationIcon): Apple Health names the app or device in sourceName.
export function recorderOf(row, payload = parse(row.payload_json)) {
  if (row.source_family === "google-wearables") return { name: "Google Health", logo: "google" };
  const name = String(payload.sourceName || "").trim();
  if (/aurin|loadwise/i.test(name)) return { name: "Aurin", logo: "aurin" };
  if (/watch/i.test(name)) return { name: "Apple Watch", logo: "apple" };
  if (/iphone/i.test(name)) return { name: "iPhone", logo: "apple" };
  return { name: name ? name.slice(0, 40) : "Apple Health", logo: "apple" };
}

// The devices behind a watch workout: both after a merge, else its own.
export function sourcesOf(row, payload = parse(row.payload_json)) {
  const merged = payload.loadwiseMerge;
  if (Array.isArray(merged?.sources) && merged.sources.length) return merged.sources.filter(s => s && s.name).slice(0, 4);
  return [recorderOf(row, payload)];
}

// The time a merged workout keeps: { start, end } instants, else null.
export function mergedSpan(payload) {
  const m = payload?.loadwiseMerge;
  return m?.start && m?.end && Date.parse(m.end) > Date.parse(m.start) ? { start: m.start, end: m.end } : null;
}

// Aurin first: its sets and exercises are the workout.
const order = list => list.slice().sort((a, b) => (b.name === "Aurin") - (a.name === "Aurin"));
const ofName = name => (name === "Aurin" ? L("Aurinu", "Aurin") : name);
const clock = iso => (localDateTime(iso) || "").slice(11, 16) || null;
const minutesOf = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / 60000);

function summary(row) {
  const p = parse(row.payload_json), m = p.exercise?.metricsSummary || {}, span = mergedSpan(p);
  return {
    row, payload: p, id: String(row.external_id), key: keyOf(row), recorder: recorderOf(row, p),
    start: span?.start || row.start_time, end: span?.end || row.end_time,
    kcal: num(m.caloriesKcal) > 0 ? Math.round(num(m.caloriesKcal)) : null,
    avgHr: num(m.averageHeartRateBeatsPerMinute) > 0 ? Math.round(num(m.averageHeartRateBeatsPerMinute)) : null,
    maxHr: num(m.maxHeartRateBeatsPerMinute) > 0 ? Math.round(num(m.maxHeartRateBeatsPerMinute)) : null,
    kind: activityKindOf(p.exercise?.exerciseType || "")
  };
}

// Two watch records of one workout from different devices: the same sport
// (or one unnamed) for most of the time, neither merged nor kept apart yet.
function mergeable(a, b) {
  if (a.recorder.name === b.recorder.name) return false;
  if (a.payload.loadwiseMerge?.with || b.payload.loadwiseMerge?.with) return false;
  if ((a.payload.loadwiseMerge?.separate || []).includes(b.key) || (b.payload.loadwiseMerge?.separate || []).includes(a.key)) return false;
  if (a.kind !== b.kind && a.kind !== "other" && b.kind !== "other") return false;
  return overlapShare(a.row, b.row) >= MERGE_SHARE;
}

// The proposal for a day's watch rows (health_datapoints, not duplicates), or
// null: the two records, the times to choose from (both together, and one
// record's own when it differs) and whose calories and heart rate to keep,
// the watch's first.
export function mergeProposal(rows = []) {
  const list = (rows || []).filter(r => r && WATCH.includes(r.source_family) && sessionOf(r)).map(summary);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (!mergeable(list[i], list[j])) continue;
    const [a, b] = Date.parse(list[i].start) <= Date.parse(list[j].start) ? [list[i], list[j]] : [list[j], list[i]];
    const start = a.start, end = Date.parse(b.end) > Date.parse(a.end) ? b.end : a.end;
    const spans = [{ key: "both", start: clock(start), end: clock(end), minutes: minutesOf(start, end), text: L("Od začátku prvního do konce druhého", "From the start of the first to the end of the second") }];
    for (const s of order([a, b].map(x => ({ ...x, name: x.recorder.name })))) {
      if (Math.abs(Date.parse(s.start) - Date.parse(start)) <= SAME_EDGE_MS && Math.abs(Date.parse(s.end) - Date.parse(end)) <= SAME_EDGE_MS) continue;
      spans.push({ key: s.id, start: clock(s.start), end: clock(s.end), minutes: minutesOf(s.start, s.end), text: L("Jen čas z " + ofName(s.recorder.name), "Only " + s.recorder.name + "'s time") });
    }
    const energy = [a, b].sort((x, y) => (x.recorder.name === "Aurin") - (y.recorder.name === "Aurin")).map(s => ({
      key: s.id, name: s.recorder.name, logo: s.recorder.logo, kcal: s.kcal,
      text: s.recorder.name === "Aurin" ? L("Tep, který měl Aurin během tréninku", "The heart rate Aurin had during the workout")
        : [/watch/i.test(s.recorder.name) ? L("Tep z hodinek", "Heart rate from the watch") : L("Tep", "Heart rate"),
           s.avgHr ? L("průměr ", "average ") + s.avgHr : null, s.maxHr ? "max " + s.maxHr : null].filter(Boolean).join(", ")
    }));
    const names = order([a.recorder, b.recorder]).map(r => r.name);
    const aurin = names.includes("Aurin") && (a.kind === "strength" || b.kind === "strength");
    return {
      ids: [a.id, b.id],
      title: L("Jeden trénink ze dvou zařízení?", "One workout from two devices?"),
      text: L(names.join(" a ") + " nahrály trénink ve stejnou dobu.", names.join(" and ") + " recorded a workout at the same time."),
      note: L("Zůstane jeden trénink.", "One workout stays.") + (aurin ? " " + L("Série a cviky jsou z Aurinu.", "The sets and exercises are Aurin's.") : ""),
      spans, energy
    };
  }
  return null;
}

async function watchRow(env, id) {
  const key = String(id || "");
  if (!ID.test(key)) return null;
  return env.DB.prepare(`SELECT id, source_family, data_type, external_id, start_time, end_time, payload_json, record_role FROM health_datapoints
    WHERE user_id = ? AND external_id = ? AND source_family IN ('apple-health', 'google-wearables') AND data_type = 'exercise'
      AND (record_role IS NULL OR record_role != 'duplicate') LIMIT 1`).bind(env.USER_ID, key).first();
}

async function pairOf(env, ids) {
  const [x, y] = Array.isArray(ids) ? ids.map(String) : [];
  if (!x || !y || x === y) throw fail(L("Vyber dva tréninky.", "Choose two workouts."));
  const [a, b] = await Promise.all([watchRow(env, x), watchRow(env, y)]);
  if (!a || !b) throw fail(L("Trénink nebyl nalezen.", "The workout wasn't found."), 404);
  return [a, b];
}

// A copy of the dropped record that watch-forward.js sent to Intervals.icu
// goes from there and from here.
async function removeForwarded(env, row, fetchImpl) {
  if (row.source_family !== "apple-health") return false;
  const sent = await env.DB.prepare("SELECT remote_id FROM sync_sends WHERE user_id = ? AND destination = 'intervals' AND activity_key = ? AND remote_id IS NOT NULL")
    .bind(env.USER_ID, "apple:" + String(row.external_id).replace(/^apple:/, "")).first().catch(() => null);
  const remote = sent?.remote_id ? String(sent.remote_id) : null;
  if (!remote || !/^[a-zA-Z0-9_-]{1,80}$/.test(remote) || !env.INTERVALS_API_KEY) return false;
  const response = await fetchImpl("https://intervals.icu/api/v1/activity/" + encodeURIComponent(remote), {
    method: "DELETE", headers: { Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: "application/json" }, signal: AbortSignal.timeout(10000)
  }).catch(() => null);
  if (!response || (!response.ok && response.status !== 404)) return false;
  await env.DB.prepare("DELETE FROM health_datapoints WHERE user_id = ? AND source_family = 'intervals' AND data_type = 'activity' AND external_id IN (?, ?)")
    .bind(env.USER_ID, remote, "activity:" + remote).run();
  return true;
}

// POST /app/api/activity/merge { ids: [a, b], energy: id, span: "both" | id }.
export async function mergeWorkouts(env, { ids, energy, span = "both" } = {}, { fetchImpl = fetch } = {}) {
  const [a, b] = await pairOf(env, ids);
  const keep = String(energy) === String(b.external_id) ? b : a, drop = keep === a ? b : a;
  const keepPayload = parse(keep.payload_json), dropPayload = parse(drop.payload_json);
  const own = String(span) === String(drop.external_id) ? drop : String(span) === String(keep.external_id) ? keep : null;
  const start = own ? own.start_time : [a.start_time, b.start_time].sort()[0];
  const end = own ? own.end_time : [a.end_time, b.end_time].sort()[1];
  const sources = order([recorderOf(keep, keepPayload), recorderOf(drop, dropPayload)]);
  keepPayload.loadwiseMerge = { with: keyOf(drop), start, end, sources, energy: recorderOf(keep, keepPayload).name };
  await env.DB.batch([
    env.DB.prepare("UPDATE health_datapoints SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(JSON.stringify(keepPayload), keep.id, env.USER_ID),
    env.DB.prepare("UPDATE health_datapoints SET record_role = 'duplicate', matched_activity_id = ?, match_confidence = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(keyOf(keep), drop.id, env.USER_ID)
  ]);
  const removed = await removeForwarded(env, drop, fetchImpl).catch(() => false);
  return { status: "ok", id: String(keep.external_id), merged: String(drop.external_id), removedFromIntervals: removed };
}

// POST /app/api/activity/merge { ids: [a, b], separate: true }: two workouts
// after all; the proposal does not come back.
export async function keepWorkoutsApart(env, { ids } = {}) {
  const [a, b] = await pairOf(env, ids);
  const put = (row, other) => {
    const p = parse(row.payload_json);
    p.loadwiseMerge = { ...(p.loadwiseMerge || {}), separate: [...new Set([...(p.loadwiseMerge?.separate || []), keyOf(other)])] };
    return env.DB.prepare("UPDATE health_datapoints SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(JSON.stringify(p), row.id, env.USER_ID);
  };
  await env.DB.batch([put(a, b), put(b, a)]);
  return { status: "ok", ids: [String(a.external_id), String(b.external_id)], separate: true };
}

// The merges activity matching keeps: dropped key → kept key.
export function heldMerges(rows = []) {
  const out = new Map();
  for (const row of rows) {
    const merged = parse(row.payload_json).loadwiseMerge;
    if (WATCH.includes(row.source_family) && typeof merged?.with === "string") out.set(merged.with, keyOf(row));
  }
  return out;
}
