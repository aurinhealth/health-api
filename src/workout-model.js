// Sport-neutral structured workout model. Intensity is always a percentage of
// the athlete's threshold: % FTP for cycling, % threshold pace for running.
// Steps: {durationMinutes, power, [powerStart, powerEnd, ramp], cadence, note, free}
// Blocks: a step, or {repeats, steps:[...]}.

export const n = (v, d = null) => v === null || v === undefined || v === "" ? d : Number.isFinite(Number(v)) ? Number(v) : d;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, digits = 1) => Math.round(x * 10 ** digits) / 10 ** digits;

export function step(durationMinutes, power, cadence = null, note = null) { return { durationMinutes, power, cadence, note }; }
export function ramp(durationMinutes, powerStart, powerEnd, cadence = null, note = null) { return { durationMinutes, power: (powerStart + powerEnd) / 2, powerStart, powerEnd, ramp: true, cadence, note }; }
export function rep(repeats, steps) { return { repeats, steps }; }
export const sec = s => s / 60;

// Every executed step in order (repeats expanded).
export function flattenSteps(structure = []) {
  const out = [];
  for (const block of structure) {
    if (Array.isArray(block.steps)) for (let i = 0; i < (n(block.repeats, 1) || 1); i++) out.push(...block.steps);
    else out.push(block);
  }
  return out;
}
export function totalMinutes(structure = []) { return flattenSteps(structure).reduce((sum, s) => sum + n(s.durationMinutes, 0), 0); }

// Intensity bands, as % of threshold.
export const CYCLING_ZONES = [
  ["recovery", 0, 55], ["endurance", 56, 75], ["tempo", 76, 87], ["sweet_spot", 88, 94],
  ["threshold", 95, 105], ["vo2max", 106, 120], ["anaerobic", 121, 150], ["sprint", 151, 400]
];
export function zoneOf(power, zones = CYCLING_ZONES) { return (zones.find(([, lo, hi]) => power >= lo && power <= hi) || zones.at(-1))[0]; }

export function zoneMinutes(structure = [], zones = CYCLING_ZONES) {
  const out = Object.fromEntries(zones.map(([z]) => [z, 0]));
  for (const s of flattenSteps(structure)) out[zoneOf(n(s.power, 50), zones)] += n(s.durationMinutes, 0);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, round(v, 2)]));
}

// Normalised intensity (fourth-power mean, like NP) and training load.
export function intensityFactor(structure = []) {
  let minutes = 0, sum = 0;
  for (const s of flattenSteps(structure)) { const d = n(s.durationMinutes, 0), p = n(s.power, 50) / 100; minutes += d; sum += d * p ** 4; }
  return round(clamp((sum / Math.max(minutes, 1e-9)) ** 0.25, 0.3, 1.6), 2);
}
export function trainingLoad(structure = []) { const minutes = totalMinutes(structure), f = intensityFactor(structure); return Math.round((minutes / 60) * f * f * 100); }

// Difficulty 1–10 from the structure: time spent at or above the system's
// intensity, how dense the work is, how hard it is relative to the band and
// whether it comes late in a long session. Anchors give each system its scale.
const ANCHORS = {
  recovery: { lo: 0, ref: 50, w0: 20, d0: 1, w1: 60, d1: 2 },
  endurance: { lo: 56, ref: 68, w0: 45, d0: 1.8, w1: 300, d1: 7.5 },
  tempo: { lo: 76, ref: 83, w0: 30, d0: 3.4, w1: 120, d1: 8 },
  sweet_spot: { lo: 88, ref: 91, w0: 24, d0: 3.6, w1: 90, d1: 8.6 },
  threshold: { lo: 95, ref: 99, w0: 20, d0: 4, w1: 60, d1: 8.8 },
  vo2max: { lo: 106, ref: 112, w0: 10, d0: 4, w1: 32, d1: 9 },
  anaerobic: { lo: 121, ref: 135, w0: 4, d0: 4, w1: 16, d1: 9 },
  sprint: { lo: 151, ref: 180, w0: .5, d0: 3, w1: 3, d1: 7.5 }
};
export function difficultyFromStructure(system, structure = []) {
  const a = ANCHORS[system] || ANCHORS.endurance;
  const steps = flattenSteps(structure);
  let work = 0, weighted = 0, rest = 0, elapsed = 0, lateWork = 0;
  const inWork = s => n(s.power, 0) >= a.lo;
  for (const s of steps) {
    const d = n(s.durationMinutes, 0), p = n(s.power, 0);
    if (inWork(s)) { work += d; weighted += d * p; if (elapsed >= 90) lateWork += d; }
    elapsed += d;
  }
  // Recovery between work steps inside interval blocks gives the density.
  for (const block of structure) if (Array.isArray(block.steps)) for (const s of block.steps) if (!inWork(s)) rest += n(s.durationMinutes, 0) * (n(block.repeats, 1) || 1);
  if (system === "recovery" || system === "endurance") work = steps.filter(s => n(s.power, 0) >= a.lo || system === "recovery").reduce((x, s) => x + n(s.durationMinutes, 0), 0);
  const slope = (a.d1 - a.d0) / (a.w1 - a.w0);
  let d = a.d0 + (work - a.w0) * slope;
  if (work > 0 && !["recovery", "endurance"].includes(system)) {
    const avg = weighted / work;
    d += clamp((avg - a.ref) / a.ref * 8, -1, 1.2);
    if (rest > 0) d += clamp((work / (work + rest) - 0.5) * 2.2, -0.9, 0.9);
    if (lateWork > 0) d += clamp(0.3 + lateWork / Math.max(work, 1) * 0.6, 0, 0.9);
  }
  return round(clamp(d, 1, 10), 1);
}

// Intervals.icu workout text. Outdoor workouts get ranges instead of exact
// targets; free efforts ("all out") have no target the head unit can hold.
function stepDuration(minutes) {
  const s = Math.round(minutes * 60);
  if (s % 60 === 0) return s / 60 + "m";
  if (s > 60) return Math.floor(s / 60) + "m" + (s % 60) + "s";
  return s + "s";
}
function stepTarget(s, { sport, environment }) {
  const unit = sport === "run" ? "% Pace" : "%";
  const width = environment === "outdoor" ? (n(s.power, 0) >= 106 ? 4 : n(s.power, 0) >= 76 ? 3 : 5) : 0;
  if (s.ramp && n(s.powerStart) != null && n(s.powerEnd) != null) return "ramp " + Math.round(s.powerStart) + "-" + Math.round(s.powerEnd) + unit;
  const p = Math.round(n(s.power, 55));
  if (s.free) return (sport === "run" ? "" : p + "% ") + "max";
  return width ? (p - width) + "-" + (p + width) + unit : p + unit;
}
function stepLine(s, opts) {
  const cadence = opts.sport === "ride" && s.cadence && opts.environment !== "outdoor" ? " " + String(s.cadence).replace(/[^0-9-]/g, "") + "rpm" : "";
  const note = s.note ? " " + s.note : "";
  return "- " + stepDuration(n(s.durationMinutes, 0)) + " " + stepTarget(s, opts) + cadence + note;
}
export function intervalsText(structure = [], { sport = "ride", environment = "indoor" } = {}) {
  const opts = { sport, environment }, parts = [];
  structure.forEach((block, i) => {
    if (Array.isArray(block.steps)) parts.push((block.repeats > 1 ? block.repeats + "x" : "Main Set 1x") + "\n" + block.steps.map(s => stepLine(s, opts)).join("\n"));
    else {
      const label = i === 0 ? "Warmup" : i === structure.length - 1 && n(block.power, 100) <= 60 ? "Cooldown" : "";
      parts.push((label ? label + "\n" : "") + stepLine(block, opts));
    }
  });
  return parts.join("\n\n");
}

// Converts a (trainer-style) workout for riding or running outside: longer
// warm-up, rounded step lengths, very short efforts become free efforts and
// micro-intervals get a terrain hint. Indoor keeps the exact prescription.
export function adaptStructure(structure = [], environment = "indoor", sport = "ride", system = null) {
  if (environment !== "outdoor") return structure;
  const roundStep = s => {
    const d = n(s.durationMinutes, 0);
    const rounded = d >= 3 ? Math.round(d * 2) / 2 : d >= 1 ? Math.round(d * 4) / 4 : Math.max(sec(10), Math.round(d * 12) / 12);
    const out = { ...s, durationMinutes: rounded };
    if (n(s.power, 0) >= 151 || (n(s.power, 0) >= 121 && d <= sec(30))) { out.free = true; out.note = sport === "run" ? "sprint naplno" : "sprint naplno, vyšší převod"; }
    return out;
  };
  const out = structure.map(block => Array.isArray(block.steps)
    ? { ...block, steps: block.steps.map(roundStep), note: block.steps.some(s => n(s.durationMinutes, 0) < 1 && n(s.power, 0) >= 106) ? "rovný úsek nebo mírné stoupání bez křižovatek" : block.note }
    : roundStep(block));
  const first = out[0];
  // Only sessions with real intensity need the longer outdoor warm-up.
  const easy = system === "recovery" || system === "endurance";
  if (!easy && first && !first.steps && n(first.durationMinutes, 0) < 15 && n(first.power, 100) <= 65) out[0] = { ...first, durationMinutes: 15 };
  return out;
}

export function environmentNotes(environment, sport = "ride", system = null) {
  const easy = system === "recovery" || system === "endurance";
  if (sport === "run") return environment === "outdoor"
    ? ["Venku řiď úseky tempem; v kopcích drž úsilí a tep, ne tempo.", "Rozklus a výklus zvol po rovině."]
    : ["Na páse nastav sklon 1 % – kompenzuje chybějící odpor vzduchu.", "Tempo na pásu je přesné, tep může být o pár úderů vyšší."];
  if (easy) return environment === "outdoor"
    ? ["Zvol rovinatou trasu; do kopců lehký převod, ať výkon nepřeleze horní hranici pásma.", "Rozsah výkonu je orientační – důležitější je nízké úsilí a klidný tep.", "Vyhni se skupinovým jízdám, kde se tempo snadno zvedne."]
    : ["Na trenažéru stačí ERG nebo konstantní odpor; hlídej, aby výkon nepřesáhl pásmo.", "Zajisti chlazení a pití – i lehká jízda indoor hodně potí."];
  return environment === "outdoor"
    ? ["Venku drž rozsah výkonu místo přesné hodnoty; ERG není k dispozici.", "Intervaly nad prahem jeď do kopce nebo proti větru, regenerace po rovině.", "Krátké sprinty jeď naplno bez cílového výkonu."]
    : ["Na trenažéru použij ERG pro prahové a sweet-spot bloky; sprinty a 30/15 jeď v režimu odporu (level/slope).", "Kadence je součást předpisu; zajisti chlazení (ventilátor) a pití."];
}

// A catalog record in the shape the dashboard, ranking and Intervals use.
export function buildWorkout({ id, sport = "ride", name, system, secondarySystem = null, structure, family = null, level = null, sourceName = "PFD Coach Lab", sourceKind = "original", sourceUrl = null, licenseNote = "Original structured workout for Petr Fitness Data.", attribution = null, citation = null, description = "", tags = [], cadence = null, indoorOnly = false, difficulty = null }) {
  const duration = Math.round(totalMinutes(structure));
  const zones = zoneMinutes(structure);
  return {
    id, sport, name, family, level,
    source_name: sourceName, source_kind: sourceKind, source_url: sourceUrl, license_note: licenseNote, attribution, citation, external_id: null,
    primary_system: system, secondary_system: secondarySystem,
    duration_minutes: duration,
    work_minutes: round(Object.entries(zones).filter(([z]) => !["recovery", "endurance"].includes(z)).reduce((s, [, v]) => s + v, 0), 1),
    difficulty: difficulty ?? difficultyFromStructure(system, structure),
    intensity_factor: intensityFactor(structure),
    target_load: trainingLoad(structure),
    cadence, description, indoor_only: indoorOnly ? 1 : 0,
    intervals_description: intervalsText(structure, { sport }),
    tags_json: JSON.stringify([...new Set([system, ...tags])]),
    structure_json: JSON.stringify(structure),
    zone_minutes_json: JSON.stringify(zones),
    verified: sourceKind === "original" || sourceKind === "research" ? 1 : 0,
    popularity: 0
  };
}

// The workout as it should be ridden/run in the given environment.
export function renderForEnvironment(workout, environment = "indoor") {
  const sport = workout.sport || "ride";
  let structure = [];
  try { structure = JSON.parse(workout.structure_json || "[]"); } catch {}
  const env = environment === "outdoor" && !workout.indoor_only ? "outdoor" : "indoor";
  const adapted = adaptStructure(structure, env, sport, workout.primary_system);
  return {
    ...workout,
    environment: env,
    structure_json: JSON.stringify(adapted),
    duration_minutes: Math.round(totalMinutes(adapted)),
    intervals_description: intervalsText(adapted, { sport, environment: env }),
    intervals_type: sport === "run" ? (env === "indoor" ? "VirtualRun" : "Run") : (env === "indoor" ? "VirtualRide" : "Ride"),
    environment_notes: environmentNotes(env, sport, workout.primary_system)
  };
}
