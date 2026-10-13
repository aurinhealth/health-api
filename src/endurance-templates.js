// Own ride and run workouts (Moje tréninky): sections and repeats with a
// length (time, or distance when running) and an intensity range as % of FTP
// or of threshold pace. Kept in % so a friend's link turns into the friend's
// own watts and paces; distances become minutes at the athlete's own pace.
import { L } from "./lang.js";
import { buildWorkout, zoneOf, zonesFor, flattenSteps, totalMinutes } from "./workout-model.js";

export const ENDURANCE_SPORTS = ["ride", "run"];
const MAX_BLOCKS = 20, MAX_STEPS = 6, MAX_REPEATS = 30, MAX_MINUTES = 360;
// Without the athlete's threshold pace a kilometre takes 5:00 at 100 %.
const DEFAULT_PACE = 300;

const text = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const num = v => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

// Zone presets in the editor (Z1–Z5, SS on the bike), as % of threshold.
export const ZONES = {
  ride: { Z1: [45, 55], Z2: [56, 75], Z3: [76, 87], SS: [88, 93], Z4: [95, 105], Z5: [106, 120] },
  run: { Z1: [70, 77], Z2: [78, 88], Z3: [89, 95], Z4: [96, 101], Z5: [102, 110] }
};

function cleanStep(input = {}, sport) {
  const label = text(input.label, 40);
  const seconds = num(input.seconds), km = sport === "run" ? num(input.km) : null;
  let low = Math.round(num(input.low) ?? 0), high = Math.round(num(input.high) ?? low);
  if (high < low) [low, high] = [high, low];
  if (!(low >= 30 && high <= 200)) throw new Error(L("Intenzita musí být mezi 30 a 200 %.", "Intensity must be between 30 and 200 %."));
  const out = { label, low, high };
  if (km != null) {
    if (!(km >= 0.1 && km <= 50)) throw new Error(L("Vzdálenost úseku musí být 0,1 až 50 km.", "A section's distance must be 0.1 to 50 km."));
    out.km = Math.round(km * 100) / 100;
  } else {
    if (!(seconds >= 10 && seconds <= MAX_MINUTES * 60)) throw new Error(L("Úsek musí trvat aspoň 10 sekund.", "A section must last at least 10 seconds."));
    out.seconds = Math.round(seconds);
  }
  const cadence = sport === "ride" ? num(input.cadence) : null;
  if (cadence != null && cadence >= 40 && cadence <= 140) out.cadence = Math.round(cadence);
  return out;
}

// The workout as the app sends it, checked. Blocks are {repeats, steps}; a
// single section is a block with one repeat.
export function cleanEnduranceTemplate(input = {}) {
  const sport = input.sport === "run" ? "run" : "ride";
  const name = text(input.name, 80);
  if (!name) throw new Error(L("Pojmenuj trénink.", "Name the workout."));
  const raw = Array.isArray(input.blocks) ? input.blocks : [];
  if (!raw.length) throw new Error(L("Přidej aspoň jeden úsek.", "Add at least one section."));
  if (raw.length > MAX_BLOCKS) throw new Error(L("Trénink může mít nejvýše 20 bloků.", "A workout can have at most 20 blocks."));
  const blocks = raw.map(b => {
    const list = Array.isArray(b?.steps) ? b.steps : [b];
    if (!list.length || list.length > MAX_STEPS) throw new Error(L("Opakování musí mít 1 až 6 úseků.", "A repeat must have 1 to 6 sections."));
    const repeats = Math.round(num(b?.repeats) ?? 1);
    if (!(repeats >= 1 && repeats <= MAX_REPEATS)) throw new Error(L("Počet opakování musí být 1 až 30.", "Repeats must be between 1 and 30."));
    return { repeats, steps: list.map(s => cleanStep(s, sport)) };
  });
  const template = { sport, name, blocks };
  if (totalMinutes(enduranceStructure(template)) > MAX_MINUTES) throw new Error(L("Trénink může trvat nejvýše 6 hodin.", "A workout can last at most 6 hours."));
  return template;
}

// The model's structure for the athlete (workout-model.js): minutes and the
// middle of the range, the range kept for watts, paces and Intervals.icu.
export function enduranceStructure(template, { thresholdPace = null } = {}) {
  const pace = Number(thresholdPace) >= 150 && Number(thresholdPace) <= 600 ? Number(thresholdPace) : DEFAULT_PACE;
  const step = s => {
    const power = (s.low + s.high) / 2;
    const minutes = s.km != null ? s.km * pace * 100 / power / 60 : s.seconds / 60;
    const out = { durationMinutes: Math.round(minutes * 100) / 100, power, cadence: s.cadence || null, note: s.label || null };
    if (s.high > s.low) Object.assign(out, { powerLow: s.low, powerHigh: s.high });
    return out;
  };
  return template.blocks.map(b => b.repeats > 1 || b.steps.length > 1 ? { repeats: b.repeats, steps: b.steps.map(step) } : step(b.steps[0]));
}

// The training type: the zone with the most minutes above easy riding or
// running; endurance (or recovery) when there is no harder work.
export function enduranceSystem(structure, sport = "ride") {
  const zones = zonesFor(sport), minutes = {};
  for (const s of flattenSteps(structure)) { const z = zoneOf(Number(s.power) || 50, zones); minutes[z] = (minutes[z] || 0) + (Number(s.durationMinutes) || 0); }
  const hard = Object.entries(minutes).filter(([z]) => !["recovery", "endurance"].includes(z)).sort((a, b) => b[1] - a[1]);
  if (hard.length && hard[0][1] >= 2) return hard[0][0];
  return (minutes.endurance || 0) >= (minutes.recovery || 0) ? "endurance" : "recovery";
}

// A saved ride or run as a library workout ("own-<id>"), for planning,
// Intervals.icu and the calendar (workout-library.js getWorkout).
export function ownLibraryWorkout(row) {
  let structure = [];
  try { structure = JSON.parse(row.structure_json || "[]"); } catch { return null; }
  if (!structure.length) return null;
  const sport = row.sport === "run" ? "run" : "ride";
  return buildWorkout({ id: "own-" + row.id, sport, name: row.name, system: enduranceSystem(structure, sport), structure, sourceName: L("Vlastní trénink", "Own workout"), sourceKind: "own", licenseNote: "" });
}

// A library workout as an own one: its sections with their ranges (a fixed
// target becomes a range of the zone's width around it).
export function templateFromStructure(sport, name, structure = []) {
  const step = s => {
    const p = Number(s.power) || 55;
    const low = s.ramp ? Number(s.powerStart) : num(s.powerLow) ?? Math.max(30, Math.round(p - 2)), high = s.ramp ? Number(s.powerEnd) : num(s.powerHigh) ?? Math.min(200, Math.round(p + 2));
    return { label: text(s.note, 40), seconds: Math.max(10, Math.round((Number(s.durationMinutes) || 0) * 60)), low: Math.round(Math.min(low, high)), high: Math.round(Math.max(low, high)), ...(sport === "ride" && num(s.cadence) ? { cadence: num(s.cadence) } : {}) };
  };
  return cleanEnduranceTemplate({ sport, name, blocks: structure.slice(0, MAX_BLOCKS).map(b => Array.isArray(b.steps) ? { repeats: b.repeats || 1, steps: b.steps.slice(0, MAX_STEPS).map(step) } : { repeats: 1, steps: [step(b)] }) });
}

// "4× 8 min · 2 min 95 % / 2 min 105 %", per block, for the link page and the AI.
export function blockLines(template) {
  const unit = template.sport === "run" ? L(" % tempa", " % pace") : " % FTP";
  const length = s => s.km != null ? String(s.km).replace(".", L(",", ".")) + " km" : s.seconds % 60 ? Math.floor(s.seconds / 60) + ":" + String(s.seconds % 60).padStart(2, "0") + " min" : s.seconds / 60 + " min";
  const range = s => (s.low === s.high ? s.low : s.low + "–" + s.high) + unit;
  return template.blocks.map(b => ({
    repeats: b.repeats,
    steps: b.steps.map(s => ({ label: s.label || zoneName(template.sport, (s.low + s.high) / 2), length: length(s), target: range(s), percent: (s.low + s.high) / 2 }))
  }));
}

export function zoneName(sport, percent) {
  const entry = Object.entries(ZONES[sport === "run" ? "run" : "ride"]).find(([, [lo, hi]]) => percent >= lo - 0.5 && percent <= hi + 0.5);
  return entry ? entry[0] : percent < 50 ? "Z1" : "Z5+";
}

// Zwift's .zwo for a ride from the link page: every section as a steady
// block at the middle of its range, in fractions of FTP.
export function zwoFile(template) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
  const steps = [];
  for (const b of template.blocks) for (let i = 0; i < b.repeats; i++) for (const s of b.steps) {
    const cadence = s.cadence ? ` Cadence="${s.cadence}"` : "";
    steps.push(`    <SteadyState Duration="${s.seconds}" Power="${((s.low + s.high) / 200).toFixed(3)}"${cadence}/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workout_file>\n  <author>Aurin</author>\n  <name>${esc(template.name)}</name>\n  <description></description>\n  <sportType>bike</sportType>\n  <tags/>\n  <workout>\n${steps.join("\n")}\n  </workout>\n</workout_file>\n`;
}
