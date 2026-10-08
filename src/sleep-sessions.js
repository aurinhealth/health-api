// One Google Health sleep row (health_datapoints, data_type 'sleep') as the
// session the app works with: times, minutes asleep, stages, the NSF quality
// indicators and whether Google marks it a nap. Shared by /health/sleep and the
// coaches' recovery inputs.
import { localDate } from "./user-time.js";
const finiteOrNull = v => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
function hoursBetween(start, end) {
  if (!start || !end) return null;
  const a = new Date(start).getTime(), b = new Date(end).getTime();
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.max(0, (b - a) / 3600000);
}

export function sleepSessionFromRow(row) {
  let p = {};
  try { p = JSON.parse(row.payload_json || "{}"); } catch {}
  const sleep = p.sleep || p;
  const interval = sleep.interval || {};
  const stages = sleep.stages || sleep.sleepStages || [];
  const stageMinutes = {};
  for (const stage of stages) {
    const a = new Date(stage.startTime || stage.start_time || 0).getTime();
    const b = new Date(stage.endTime || stage.end_time || 0).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      const type = String(stage.type || "UNKNOWN").toUpperCase();
      stageMinutes[type] = (stageMinutes[type] || 0) + (b-a)/60000;
    }
  }
  const startTime = row.start_time || interval.startTime || interval.civilStartTime || null;
  const endTime = row.end_time || interval.endTime || interval.civilEndTime || null;
  const durationMin = hoursBetween(startTime,endTime) * 60;
  // The night belongs to the day the user wakes up on, in their time zone.
  const day = localDate(endTime || startTime);
  return {
    id: row.external_id,
    date: day,
    startTime,
    endTime,
    timeInBedMin: Number.isFinite(durationMin) ? Math.round(durationMin) : null,
    durationMin: Object.keys(stageMinutes).some(k=>['DEEP','REM','LIGHT'].includes(k)) ? Math.round(['DEEP','REM','LIGHT'].reduce((s,k)=>s+(stageMinutes[k]||0),0)) : Number.isFinite(durationMin) ? Math.round(durationMin) : null,
    type: sleep.type || sleep.sleepType || null,
    stages: Object.fromEntries(Object.entries(stageMinutes).map(([k,v])=>[k,Math.round(v)])),
    minutesToFallAsleep: sleep.minutesToFallAsleep ?? null,
    minutesAfterWakeup: sleep.minutesAfterWakeup ?? null,
    // NSF sleep-quality indicators (Ohayon 2017): time to fall asleep and
    // wake after sleep onset (awake minutes minus falling asleep and the
    // minutes after the final wake-up). A nap is flagged by Google.
    latencyMin: finiteOrNull(sleep.summary?.minutesToFallAsleep ?? sleep.minutesToFallAsleep),
    wasoMin: (() => { const awake = finiteOrNull(sleep.summary?.minutesAwake) ?? (stageMinutes.AWAKE != null ? Math.round(stageMinutes.AWAKE) : null); if (awake == null) return null; return Math.max(0, Math.round(awake - (finiteOrNull(sleep.summary?.minutesToFallAsleep) || 0) - (finiteOrNull(sleep.summary?.minutesAfterWakeUp) || 0))); })(),
    nap: sleep.metadata?.nap === true
  };
}
