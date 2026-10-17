// One Google Health sleep row (health_datapoints, data_type 'sleep') as the
// session the app works with: times, minutes asleep, stages, the NSF quality
// indicators and whether Google marks it a nap. Shared by /health/sleep and the
// coaches' recovery inputs.
import { localDate, localDateTime } from "./user-time.js";
const finiteOrNull = v => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
function hoursBetween(start, end) {
  if (!start || !end) return null;
  const a = new Date(start).getTime(), b = new Date(end).getTime();
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.max(0, (b - a) / 3600000);
}

function leadingAwakeMinutes(stages) {
  const t = v => new Date(v || 0).getTime();
  const sorted = [...stages].filter(x => t(x.endTime || x.end_time) > t(x.startTime || x.start_time)).sort((a, b) => t(a.startTime || a.start_time) - t(b.startTime || b.start_time));
  if (!sorted.some(x => String(x.type || "").toUpperCase() !== "AWAKE")) return null;
  let minutes = 0;
  for (const x of sorted) {
    if (String(x.type || "").toUpperCase() !== "AWAKE") break;
    minutes += (t(x.endTime || x.end_time) - t(x.startTime || x.start_time)) / 60000;
  }
  return Math.round(minutes);
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
  // WHOOP gives the night's stage totals, not the timeline (whoop.js).
  if (!stages.length && sleep.stageTotals) for (const [type, min] of Object.entries(sleep.stageTotals)) if (Number(min) > 0) stageMinutes[type] = Number(min);
  const startTime = row.start_time || interval.startTime || interval.civilStartTime || null;
  const endTime = row.end_time || interval.endTime || interval.civilEndTime || null;
  const durationMin = hoursBetween(startTime,endTime) * 60;
  // Fitbit sends 0 minutes to fall asleep and starts the night with an awake
  // stage instead: those minutes are the time it took to fall asleep.
  const said = finiteOrNull(sleep.summary?.minutesToFallAsleep ?? sleep.minutesToFallAsleep);
  const lead = leadingAwakeMinutes(stages);
  const latency = said > 0 ? said : lead > 0 ? lead : said;
  // The night belongs to the day the user wakes up on, in their time zone.
  const day = localDate(endTime || startTime);
  return {
    id: row.external_id,
    ...(row.source_family ? { source: row.source_family } : {}),
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
    latencyMin: latency,
    wasoMin: (() => { const awake = finiteOrNull(sleep.summary?.minutesAwake) ?? (stageMinutes.AWAKE != null ? Math.round(stageMinutes.AWAKE) : null); if (awake == null) return null; return Math.max(0, Math.round(awake - (latency || 0) - (finiteOrNull(sleep.summary?.minutesAfterWakeUp) || 0))); })(),
    nap: sleep.metadata?.nap === true
  };
}

// Up in the morning for a while and asleep again: Google and Apple keep the
// second sleep as its own session (Google flags it a nap), so the night ended
// at the first wake-up and the rest of it lowered the next night's need as a
// nap. A sleep from the same source that begins at most 3 h after a night ends
// and before noon is the rest of that night: one night with the asleep minutes
// and the time in bed of both, the time up between them left out.
const JOIN_GAP_MIN = 180;
export function joinSplitNights(sessions) {
  const out = [], open = new Map();
  const at = s => Date.parse(s.startTime || "") || 0;
  for (const s of [...(sessions || [])].filter(Boolean).sort((a, b) => at(a) - at(b))) {
    if (!s.startTime || !s.endTime || s.source === "intervals") { out.push(s); continue; }
    const key = s.source || "", i = open.get(key), prev = i == null ? null : out[i];
    const gap = prev ? (Date.parse(s.startTime) - Date.parse(prev.endTime)) / 60000 : NaN;
    if (prev && !prev.nap && gap >= 0 && gap <= JOIN_GAP_MIN && localDateTime(s.startTime).slice(11, 13) < "12") {
      out[i] = joinTwo(prev, s, gap);
      continue;
    }
    open.set(key, out.push(s) - 1);
  }
  return out;
}

function joinTwo(a, b, gap) {
  const add = (x, y) => (x == null && y == null ? null : (Number(x) || 0) + (Number(y) || 0));
  const stages = { ...(a.stages || {}) };
  for (const [k, v] of Object.entries(b.stages || {})) stages[k] = (stages[k] || 0) + v;
  const out = {
    ...a,
    date: localDate(b.endTime) || b.date || a.date,
    endTime: b.endTime,
    timeInBedMin: add(a.timeInBedMin, b.timeInBedMin),
    durationMin: add(a.durationMin, b.durationMin),
    stages,
    minutesAfterWakeup: b.minutesAfterWakeup ?? null,
    wasoMin: a.wasoMin == null && b.wasoMin == null ? null : add(a.wasoMin, b.wasoMin),
    nap: false,
    // Minutes up between the parts of the night.
    upMin: add(a.upMin, Math.round(gap))
  };
  // The night's own timeline (night-detail.js): the time up is awake.
  if (a.payload && b.payload) {
    const list = p => p.stages || p.sleepStages || [];
    out.payload = { ...a.payload, stages: [...list(a.payload), { type: "AWAKE", startTime: a.endTime, endTime: b.startTime }, ...list(b.payload)] };
  }
  return out;
}
