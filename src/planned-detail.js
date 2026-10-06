// The structure of a planned Intervals.icu event in the library's format
// ([{durationMinutes, power | powerStart/powerEnd + ramp, cadence, note}] and
// repeat blocks {repeats, steps}), so the week's detail can draw the same
// profile and step table as a library workout. A structured workout_doc wins;
// otherwise the workout text ("- 10m 55-70% 90rpm", "3x") is read.
const ZONE_PERCENT = { 1: 50, 2: 65, 3: 82, 4: 97, 5: 112, 6: 135, 7: 160 };
const n = (v, d = null) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

function durationMinutes(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, '');
  const m = t.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!i))?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!m || !(m[1] || m[2] || m[3])) return null;
  return n(m[1], 0) * 60 + n(m[2], 0) + n(m[3], 0) / 60;
}
// "1m30" and "1:30" are also used for durations.
function durationToken(token) {
  const clock = token.match(/^(\d+):(\d{2})$/);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  const short = token.match(/^(\d+)m(\d{1,2})$/);
  if (short) return Number(short[1]) + Number(short[2]) / 60;
  return durationMinutes(token);
}

export function parseStepLine(line) {
  const text = String(line || '').replace(/^\s*[-•]\s*/, '').trim();
  if (!text) return null;
  const tokens = text.split(/\s+/);
  let minutes = null, low = null, high = null, ramp = false, cadence = null, free = false;
  const note = [];
  for (const raw of tokens) {
    const token = raw.replace(/,$/, ''), lower = token.toLowerCase();
    if (minutes == null && durationToken(lower) != null) { minutes = durationToken(lower); continue; }
    if (lower === 'ramp') { ramp = true; continue; }
    if (lower === 'freeride' || lower === 'free') { free = true; continue; }
    const pct = lower.match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?%(?:ftp|lthr|pace)?$/);
    if (pct && low == null) { low = Number(pct[1]); high = pct[2] ? Number(pct[2]) : null; continue; }
    const zone = lower.match(/^z([1-7])(?:-z?([1-7]))?$/);
    if (zone && low == null) { low = ZONE_PERCENT[zone[1]]; high = zone[2] ? ZONE_PERCENT[zone[2]] : null; continue; }
    const rpm = lower.match(/^(\d+)(?:-(\d+))?rpm$/);
    if (rpm) { cadence = rpm[2] ? rpm[1] + '–' + rpm[2] : rpm[1]; continue; }
    note.push(token);
  }
  if (minutes == null || minutes <= 0) return null;
  const step = { durationMinutes: Math.round(minutes * 100) / 100 };
  if (free || low == null) step.free = true;
  else if (ramp && high != null) Object.assign(step, { ramp: true, powerStart: low, powerEnd: high });
  else step.power = high != null ? Math.round((low + high) / 2) : low;
  if (high != null && !ramp && !free) Object.assign(step, { powerLow: low, powerHigh: high });
  if (cadence) step.cadence = cadence;
  if (note.length) step.note = note.join(' ').slice(0, 80);
  return step;
}

export function parseIntervalsDescription(text) {
  const out = [];
  let block = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { block = null; continue; }
    if (/^[-•]/.test(line)) {
      const step = parseStepLine(line);
      if (!step) continue;
      if (block) block.steps.push(step); else out.push(step);
      continue;
    }
    // A header: "Main set 3x" or "3x" starts a repeat block for the steps below.
    const reps = line.match(/(?:^|\s)(\d{1,2})\s*x\s*$/i);
    block = reps ? { repeats: Number(reps[1]), note: line.replace(/(?:^|\s)\d{1,2}\s*x\s*$/i, '').trim() || null, steps: [] } : null;
    if (block) out.push(block);
  }
  return out.filter(x => !x.steps || x.steps.length);
}

function docValue(target) {
  if (!target || typeof target !== 'object') return {};
  const units = String(target.units || '%ftp').toLowerCase();
  const scale = v => units === 'power_zone' || units === 'hr_zone' || units === 'pace_zone' ? ZONE_PERCENT[Math.round(v)] : v;
  if (!/%|zone/.test(units)) return {};
  if (target.start != null && target.end != null) return { low: scale(n(target.start)), high: scale(n(target.end)) };
  return target.value != null ? { low: scale(n(target.value)) } : {};
}
function docStep(s) {
  const minutes = n(s.duration) ? n(s.duration) / 60 : null;
  if (!minutes) return null;
  const { low, high } = docValue(s.power || s.pace || s.hr), step = { durationMinutes: Math.round(minutes * 100) / 100 };
  if (low == null) step.free = true;
  else if (s.ramp && high != null) Object.assign(step, { ramp: true, powerStart: low, powerEnd: high });
  else step.power = high != null ? Math.round((low + high) / 2) : low;
  const c = s.cadence;
  if (c) step.cadence = c.start != null && c.end != null ? c.start + '–' + c.end : c.value != null ? String(c.value) : null;
  if (!step.cadence) delete step.cadence;
  if (s.text) step.note = String(s.text).slice(0, 80);
  return step;
}
export function structureFromWorkoutDoc(doc) {
  const steps = Array.isArray(doc?.steps) ? doc.steps : [];
  return steps.map(s => Array.isArray(s.steps) ? { repeats: n(s.reps, 1), note: s.text || null, steps: s.steps.map(docStep).filter(Boolean) } : docStep(s)).filter(x => x && (!x.steps || x.steps.length));
}

export function structureMinutes(structure) {
  return structure.reduce((sum, b) => sum + (b.steps ? n(b.repeats, 1) * b.steps.reduce((s, x) => s + n(x.durationMinutes, 0), 0) : n(b.durationMinutes, 0)), 0);
}

// A planned event as a workout the dashboard can draw like a library one.
export function plannedEventWorkout(event = {}) {
  const type = String(event.type || ''), text = (type + ' ' + String(event.name || '')).toLowerCase();
  const sport = /run|běh/.test(text) ? 'run' : 'ride';
  // A place the athlete picked in the app wins over the event's type and name.
  const environment = event.indoor === true ? 'indoor' : event.indoor === false ? 'outdoor' : /virtual|indoor|trainer|treadmill|pás|zwift/.test(text) ? 'indoor' : 'outdoor';
  let structure = structureFromWorkoutDoc(event.workout_doc);
  if (!structure.length) structure = parseIntervalsDescription(event.description);
  const minutes = n(event.moving_time) ? n(event.moving_time) / 60 : structureMinutes(structure) || null;
  const load = n(event.icu_training_load, n(event.load_target));
  const intensity = n(event.icu_intensity) ? n(event.icu_intensity) / 100 : load && minutes ? Math.sqrt(load / (minutes / 60 * 100)) : null;
  const notes = String(event.description || '').split(/\r?\n/).map(x => x.trim()).filter(x => x && !/^[-•]/.test(x) && !/(?:^|\s)\d{1,2}\s*x\s*$/i.test(x) && x.length > 25).slice(0, 3);
  return { id: null, name: event.name || 'Trénink', sport, environment, duration_minutes: minutes, target_load: load, intensity_factor: intensity, structure_json: JSON.stringify(structure), description: notes.join(' '), source: 'intervals' };
}
