// Moving and deleting planned workouts. Intervals.icu stays the source of
// truth: the event is changed there first, then the local copy (planned
// datapoint and library schedule link) follows so the dashboard updates
// without waiting for the next sync.

const BASE = "https://intervals.icu/api/v1/athlete/0/events/";
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

// "planned:123" (dashboard id) or "123" → "123".
export function eventIdOf(value) {
  const id = String(value || "").replace(/^planned:/, "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

// The same time of day on another date ("2026-10-02T17:30:00" → "2026-10-04T17:30:00").
export function shiftEventStart(start, date) {
  const time = String(start || "").match(/T(\d{2}:\d{2}(?::\d{2})?)/)?.[1] || "00:00:00";
  return date + "T" + (time.length === 5 ? time + ":00" : time);
}

function auth(env) {
  if (!env.INTERVALS_API_KEY) throw new Error("Nejprve připoj Intervals.icu.");
  return { Authorization: "Basic " + btoa("API_KEY:" + String(env.INTERVALS_API_KEY)), Accept: "application/json", "Content-Type": "application/json" };
}

async function plannedRow(db, eventId) {
  return db.prepare("SELECT id,payload_json,start_time,end_time FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='planned-workout' AND external_id=?").bind(db.userId, "planned:" + eventId).first();
}

export async function movePlannedEvent(env, { eventId, date }, fetchImpl = fetch) {
  const id = eventIdOf(eventId);
  if (!id) throw new Error("Neplatný plánovaný trénink.");
  if (!validDate(date)) throw new Error("Neplatné datum.");
  const row = await plannedRow(env.DB, id);
  let payload = {}; try { payload = JSON.parse(row?.payload_json || "{}"); } catch {}
  const start = shiftEventStart(payload.start_date_local || row?.start_time, date);
  const response = await fetchImpl(BASE + encodeURIComponent(id), { method: "PUT", headers: auth(env), body: JSON.stringify({ start_date_local: start }) });
  if (!response.ok) throw new Error("Intervals.icu přesun odmítlo (HTTP " + response.status + ").");
  const updated = await response.json().catch(() => ({}));
  const event = { ...payload, ...updated, start_date_local: updated.start_date_local || start };
  const end = event.end_date_local || null;
  if (row) await env.DB.prepare("UPDATE health_datapoints SET sample_time=?,start_time=?,end_time=?,payload_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(event.start_date_local, event.start_date_local, end, JSON.stringify(event), env.DB.userId, row.id).run();
  await env.DB.prepare("UPDATE workout_schedule_links SET scheduled_date=? WHERE user_id=? AND intervals_event_id=?").bind(date, env.DB.userId, id).run().catch(() => {});
  return { status: "ok", eventId: id, date, name: event.name || null };
}

export async function deletePlannedEvent(env, { eventId }, fetchImpl = fetch) {
  const id = eventIdOf(eventId);
  if (!id) throw new Error("Neplatný plánovaný trénink.");
  const response = await fetchImpl(BASE + encodeURIComponent(id), { method: "DELETE", headers: auth(env) });
  // Already gone in Intervals.icu: still remove the local copy.
  if (!response.ok && response.status !== 404) throw new Error("Intervals.icu smazání odmítlo (HTTP " + response.status + ").");
  await env.DB.prepare("DELETE FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='planned-workout' AND external_id=?").bind(env.DB.userId, "planned:" + id).run();
  await env.DB.prepare("DELETE FROM workout_schedule_links WHERE user_id=? AND intervals_event_id=?").bind(env.DB.userId, id).run().catch(() => {});
  return { status: "ok", eventId: id };
}
