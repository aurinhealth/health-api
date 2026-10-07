// Reads a planned Intervals.icu workout (its workout text) into the shared
// step model and classifies what kind of session it is.
import { L } from './lang.js';
import { step, ramp, rep, flattenSteps, totalMinutes, intensityFactor, zoneMinutes, zonesFor, n } from "./workout-model.js";

// Middle of each Intervals.icu power zone (default 7-zone Coggan model), % FTP,
// and of each default pace zone, % threshold speed.
const ZONE_POWER = { 1: 50, 2: 65, 3: 82, 4: 97, 5: 112, 6: 135, 7: 170 };
const ZONE_PACE = { 1: 72, 2: 83, 3: 91, 4: 97, 5: 102, 6: 107, 7: 115 };

function durationMinutes(token) {
  const m = String(token).toLowerCase().match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return n(m[1], 0) * 60 + n(m[2], 0) + n(m[3], 0) / 60;
}

// "- 10m 55%", "- 48m Z1", "- 5m 88-94%", "- 10m ramp 50-75%", "- 30s 120% 100rpm"
function parseStepLine(line, zoneTargets = ZONE_POWER) {
  const body = line.replace(/^\s*-\s*/, "").trim();
  const parts = body.split(/\s+/);
  const minutes = durationMinutes(parts[0]);
  if (minutes == null || minutes <= 0) return null;
  const rest = parts.slice(1).join(" ");
  const cadence = (rest.match(/(\d{2,3}(?:-\d{2,3})?)\s*rpm/i) || [])[1] || null;
  const rampMatch = rest.match(/ramp\s+(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%/i);
  if (rampMatch) return ramp(minutes, Number(rampMatch[1]), Number(rampMatch[2]), cadence);
  const range = rest.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%/);
  if (range) return step(minutes, (Number(range[1]) + Number(range[2])) / 2, cadence);
  const single = rest.match(/(\d+(?:\.\d+)?)\s*%/);
  if (single) return step(minutes, Number(single[1]), cadence);
  const zone = rest.match(/\bz([1-7])\b/i);
  if (zone) return step(minutes, zoneTargets[zone[1]], cadence, "Z" + zone[1]);
  return step(minutes, zoneTargets[2], cadence, L("bez cíle", "no target"));
}

export function parseIntervalsWorkoutText(text, sport = "ride") {
  const zoneTargets = sport === "run" ? ZONE_PACE : ZONE_POWER;
  const structure = [];
  let block = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { block = null; continue; }
    const repeat = line.match(/^(\d+)\s*x\b/i) || (!line.startsWith("-") && line.match(/\b(\d+)\s*x\s*$/i));
    if (repeat) { block = rep(Number(repeat[1]), []); structure.push(block); continue; }
    if (!line.startsWith("-")) { if (!/^(warm ?up|cool ?down|main set|rozjet|vyjet)/i.test(line)) block = null; continue; }
    const s = parseStepLine(line, zoneTargets);
    if (!s) continue;
    if (block) block.steps.push(s); else structure.push(s);
  }
  return structure.filter(b => !b.steps || b.steps.length);
}

const SYSTEM_BY_IF = [[.6, "recovery"], [.77, "endurance"], [.84, "tempo"], [.9, "sweet_spot"], [.97, "threshold"], [9, "vo2max"]];

// What kind of session is it? Uses the structure when there is one, else the
// planned load and duration (IF = sqrt(load / (hours × 100))), else the name.
const RUN_SYSTEM_BY_IF = [[.8, "recovery"], [.87, "endurance"], [.92, "tempo"], [.97, "threshold"], [9, "vo2max"]];

export function classifyPlannedWorkout(planned = {}, sport = "ride") {
  const run = sport === "run";
  const structure = parseIntervalsWorkoutText(planned.description || planned.workoutText || "", sport);
  const name = String(planned.name || "").toLowerCase();
  let minutes = structure.length ? totalMinutes(structure) : n(planned.durationHours, 0) * 60 || null;
  let factor = null, basis = null, system = null;
  if (structure.length) {
    factor = intensityFactor(structure, sport); basis = "structure";
    // Short hard efforts define the session even when the average is low.
    const hardest = Math.max(...flattenSteps(structure).filter(s => n(s.durationMinutes, 0) >= .5).map(s => n(s.power, 0)));
    const z = zoneMinutes(structure, zonesFor(sport));
    if (run) {
      if (hardest >= 102 && (z.vo2max || 0) + (z.anaerobic || 0) >= 5) system = "vo2max";
      else if (hardest >= 96 && z.threshold >= 10) system = "threshold";
      else if (hardest >= 89 && z.tempo + z.threshold >= 12) system = "tempo";
    }
    else if (hardest >= 106 && z.vo2max + z.anaerobic >= 6) system = "vo2max";
    else if (hardest >= 95 && z.threshold >= 12) system = "threshold";
    else if (hardest >= 88 && z.sweet_spot + z.threshold >= 15) system = "sweet_spot";
    else if (hardest >= 76 && z.tempo + z.sweet_spot >= 15) system = "tempo";
  } else if (n(planned.tss) && minutes) {
    factor = Math.round(Math.sqrt(n(planned.tss) / (minutes / 60 * 100)) * 100) / 100; basis = "load";
  }
  if (!system && (run ? /recover|regener|z1\b|volno/ : /recover|regener|z1\b|easy spin|volno|lehk/).test(name)) system = "recovery";
  if (!system && /vo2|anaerob/.test(name)) system = "vo2max";
  if (!system && /threshold|ftp|prah/.test(name)) system = "threshold";
  if (!system && /sweet/.test(name)) system = "sweet_spot";
  if (!system && /tempo/.test(name)) system = "tempo";
  if (!system && run && /fartlek|kopc|hill|yasso|interval/.test(name)) system = "vo2max";
  if (!system && run && /long|dlouh|easy|lehk/.test(name)) system = "endurance";
  if (!system && factor != null) system = (run ? RUN_SYSTEM_BY_IF : SYSTEM_BY_IF).find(([limit]) => factor < limit)[1];
  if (!system && /endurance|z2|long|dlouh/.test(name)) system = "endurance";
  return { system: system || null, minutes: minutes ? Math.round(minutes) : null, intensityFactor: factor, basis, structure, zoneMinutes: structure.length ? zoneMinutes(structure, zonesFor(sport)) : null };
}
