import {editLocalWorkout} from './local-workouts.js';
// App-owned plans change locally, then export through the outbox. Legacy
// imported plans still change at their provider before updating the cache.

import { cancelGymPlan, moveGymPlan } from './gym-plan-store.js';
import { intervalsAuthorization } from "./intervals-auth.js";

const BASE = "https://intervals.icu/api/v1/athlete/0/events/";
export const isStrengthEvent = event => /^(WeightTraining|Strength|Gym)$/i.test(String(event?.type || ''));
const eventDate = event => String(event?.start_date_local || event?.start_date || event?.date || '').slice(0, 10);
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
  return { Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: "application/json", "Content-Type": "application/json" };
}

async function plannedRow(db, eventId) {
  return db.prepare("SELECT id,payload_json,start_time,end_time FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local') AND data_type='planned-workout' AND external_id=?").bind(db.userId, "planned:" + eventId).first();
}

export async function movePlannedEvent(env, { eventId, date }, fetchImpl = fetch) {
  const id = eventIdOf(eventId);
  if (!id) throw new Error("Neplatný plánovaný trénink.");
  if (!validDate(date)) throw new Error("Neplatné datum.");
  const row = await plannedRow(env.DB, id);
  let payload = {}; try { payload = JSON.parse(row?.payload_json || "{}"); } catch {}
  const start = shiftEventStart(payload.start_date_local || row?.start_time, date);
  if(id.startsWith('local-')){const result=await editLocalWorkout(env,id,{start_date_local:start,end_date_local:null},fetchImpl);const gym=isStrengthEvent(payload)?await moveGymPlan(env.DB,eventDate(payload),date):{moved:false};return {...result,date,gymPlanMoved:gym.moved};}
  const response = await fetchImpl(BASE + encodeURIComponent(id), { method: "PUT", headers: auth(env), body: JSON.stringify({ start_date_local: start }) });
  if (!response.ok) throw new Error("Intervals.icu přesun odmítlo (HTTP " + response.status + ").");
  const updated = await response.json().catch(() => ({}));
  const event = { ...payload, ...updated, start_date_local: updated.start_date_local || start };
  const end = event.end_date_local || null;
  if (row) await env.DB.prepare("UPDATE health_datapoints SET sample_time=?,start_time=?,end_time=?,payload_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(event.start_date_local, event.start_date_local, end, JSON.stringify(event), env.DB.userId, row.id).run();
  await env.DB.prepare("UPDATE workout_schedule_links SET scheduled_date=? WHERE user_id=? AND intervals_event_id=?").bind(date, env.DB.userId, id).run().catch(() => {});
  // A moved gym session keeps its exercises.
  const from = eventDate(payload) || String(row?.start_time || "").slice(0, 10);
  const gym = isStrengthEvent(payload) ? await moveGymPlan(env.DB, from, date).catch(() => ({ moved: false })) : { moved: false };
  return { status: "ok", eventId: id, date, name: event.name || null, gymPlanMoved: gym.moved };
}

// Outdoors or on the trainer: Intervals.icu tells them apart by the event type
// (Ride / VirtualRide, Run / VirtualRun). A workout scheduled from the library
// keeps the environment on its link, so its steps are drawn for that place.
export async function setPlannedEnvironment(env, { eventId, environment }, fetchImpl = fetch) {
  const id = eventIdOf(eventId);
  if (!id) throw new Error("Neplatný plánovaný trénink.");
  if (!["indoor", "outdoor"].includes(environment)) throw new Error("Vyber venku, nebo uvnitř.");
  const row = await plannedRow(env.DB, id);
  let payload = {}; try { payload = JSON.parse(row?.payload_json || "{}"); } catch {}
  if (isStrengthEvent(payload)) throw new Error("Prostředí jde změnit jen u kola a běhu.");
  const run = /run/i.test(String(payload.type || ""));
  const type = run ? (environment === "indoor" ? "VirtualRun" : "Run") : (environment === "indoor" ? "VirtualRide" : "Ride");
  if(id.startsWith('local-'))return {...await editLocalWorkout(env,id,{type,indoor:environment==='indoor'},fetchImpl),environment,type};
  const response = await fetchImpl(BASE + encodeURIComponent(id), { method: "PUT", headers: auth(env), body: JSON.stringify({ type }) });
  if (!response.ok) throw new Error("Intervals.icu změnu odmítlo (HTTP " + response.status + ").");
  const updated = await response.json().catch(() => ({}));
  const event = { ...payload, ...updated, type: updated.type || type, indoor: environment === "indoor" };
  if (row) await env.DB.prepare("UPDATE health_datapoints SET payload_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(JSON.stringify(event), env.DB.userId, row.id).run();
  await env.DB.prepare("UPDATE workout_schedule_links SET environment=? WHERE user_id=? AND intervals_event_id=?").bind(environment, env.DB.userId, id).run().catch(() => {});
  return { status: "ok", eventId: id, environment, type: event.type, name: event.name || null };
}

export async function deletePlannedEvent(env, { eventId }, fetchImpl = fetch) {
  const id = eventIdOf(eventId);
  if (!id) throw new Error("Neplatný plánovaný trénink.");
  const row = await plannedRow(env.DB, id);
  let event = {}; try { event = JSON.parse(row?.payload_json || '{}'); } catch {}
  if(id.startsWith('local-')){if(isStrengthEvent(event))await cancelGymPlan(env.DB,eventDate(event),event);return editLocalWorkout(env,id,{deleted:true},fetchImpl);}
  const response = await fetchImpl(BASE + encodeURIComponent(id), { method: "DELETE", headers: auth(env) });
  // Already gone in Intervals.icu: still remove the local copy.
  if (!response.ok && response.status !== 404) throw new Error("Intervals.icu smazání odmítlo (HTTP " + response.status + ").");
  if (isStrengthEvent(event)) {
    const date=eventDate(event)||String(row.start_time).slice(0,10);
    const remaining=(await env.DB.prepare("SELECT payload_json FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='planned-workout' AND external_id!=? AND start_time>=? AND start_time<?").bind(env.DB.userId,'planned:'+id,date,date+'T23:59:59.999').all()).results||[];
    const another=remaining.some(r=>{try{return isStrengthEvent(JSON.parse(r.payload_json))}catch{return false}});
    if(!another)await cancelGymPlan(env.DB,date,event);
  }
  await env.DB.prepare("DELETE FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local') AND data_type='planned-workout' AND external_id=?").bind(env.DB.userId, "planned:" + id).run();
  await env.DB.prepare("DELETE FROM workout_schedule_links WHERE user_id=? AND intervals_event_id=?").bind(env.DB.userId, id).run().catch(() => {});
  return { status: "ok", eventId: id };
}

// Also honor cancellations made directly in Intervals. Only disappearance of
// a previously imported strength event cancels its local plan; an unscheduled
// local plan remains valid. Moving an event keeps its date handled separately.
export async function reconcileCancelledGymPlans(db, previous, events, today) {
  if (!Array.isArray(events)) throw new Error('Invalid Intervals event response');
  const ids = new Set(events.map(e => String(e.id ?? e.event_id ?? '')));
  const strengthDates = new Set(events.filter(isStrengthEvent).map(eventDate));
  for (const row of previous) {
    let event; try { event = JSON.parse(row.payload_json); } catch { continue; }
    const date = eventDate(event) || String(row.start_time || '').slice(0, 10);
    if (date >= today && isStrengthEvent(event) && !ids.has(String(event.id ?? event.event_id ?? String(row.external_id || '').replace(/^planned:/, ''))) && !strengthDates.has(date)) await cancelGymPlan(db, date, event);
  }
}
