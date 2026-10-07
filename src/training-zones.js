// FTP estimation methods and power / heart-rate zone models. Zones are stored
// as ascending upper bounds in % of the reference (FTP, LTHR, HRmax or HR
// reserve); the last zone is open-ended.

import { L } from './lang.js';

const round = x => Math.round(x);
const positive = v => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;

// Each method takes the athlete's test results and returns an FTP in watts.
export const FTP_METHODS = {
  test20: { label: "20min test × 0,95", inputs: [["power20", "Průměrný výkon 20 min (W)"]], ftp: ({ power20 }) => positive(power20) && power20 * .95 },
  test8: { label: "2× 8min test × 0,90", inputs: [["power8", "Průměr obou 8min úseků (W)"]], ftp: ({ power8 }) => positive(power8) && power8 * .9 },
  ramp: { label: "Ramp test × 0,75", inputs: [["rampMinute", "Průměr poslední dokončené minuty (W)"]], ftp: ({ rampMinute }) => positive(rampMinute) && rampMinute * .75 },
  test60: { label: "60 min na maximum", inputs: [["power60", "Průměrný výkon 60 min (W)"]], ftp: ({ power60 }) => positive(power60) && power60 },
  criticalPower: { label: "Critical Power (3 min + 12 min)", inputs: [["power3", "Nejlepší 3 min (W)"], ["power12", "Nejlepších 12 min (W)"]],
    // Monod two-parameter model: CP = (P12·t12 − P3·t3) / (t12 − t3); FTP ≈ CP.
    ftp: ({ power3, power12 }) => positive(power3) && positive(power12) && power3 > power12 ? (power12 * 720 - power3 * 180) / (720 - 180) : null },
  weight: { label: "Odhad z hmotnosti (W/kg)", inputs: [["weightKg", "Hmotnost (kg)"], ["wattsPerKg", "Odhad W/kg (začátečník ~2,5, trénovaný ~3,5)"]], ftp: ({ weightKg, wattsPerKg }) => positive(weightKg) && positive(wattsPerKg) && weightKg * wattsPerKg }
};

export function estimateFtp(method, inputs = {}) {
  const m = FTP_METHODS[method];
  if (!m) throw new Error(L("Neznámá metoda výpočtu FTP.", "Unknown FTP calculation method."));
  const values = Object.fromEntries(m.inputs.map(([key]) => [key, Number(inputs[key])]));
  const ftp = m.ftp(values);
  if (!positive(ftp) || ftp < 50 || ftp > 600) throw new Error(L("Zkontroluj zadané hodnoty – vypočtené FTP je mimo rozumný rozsah.", "Check the values you entered – the calculated FTP is outside a reasonable range."));
  return { method, label: m.label, ftp: round(ftp) };
}

export const POWER_ZONE_MODELS = {
  coggan7: { label: "Coggan 7 zón (výchozí v Intervals.icu)", names: ["Z1 Regenerace", "Z2 Vytrvalost", "Z3 Tempo", "Z4 Práh", "Z5 VO₂max", "Z6 Anaerobní", "Z7 Neuromuskulární"], bounds: [55, 75, 90, 105, 120, 150] },
  five: { label: "5 zón (zjednodušené)", names: ["Z1 Regenerace", "Z2 Vytrvalost", "Z3 Tempo", "Z4 Práh", "Z5 Nad prahem"], bounds: [55, 75, 90, 105] },
  sweetSpot: { label: "7 zón se sweet spotem", names: ["Z1 Regenerace", "Z2 Vytrvalost", "Z3 Tempo", "SS Sweet spot", "Z4 Práh", "Z5 VO₂max", "Z6+ Anaerobní"], bounds: [55, 75, 87, 94, 105, 120] },
  seiler3: { label: "Seiler 3 zóny (polarizovaný trénink, orientačně)", names: ["Z1 Pod aerobním prahem", "Z2 Mezi prahy", "Z3 Nad anaerobním prahem"], bounds: [75, 100] }
};

export const HR_ZONE_MODELS = {
  frielLthr: { label: "Friel – % LTHR (cyklistika)", reference: "lthr", names: ["Z1 Regenerace", "Z2 Aerobní", "Z3 Tempo", "Z4 Pod prahem", "Z5a Práh", "Z5b Aerobní kapacita", "Z5c Anaerobní"], bounds: [81, 89, 93, 99, 102, 106] },
  frielRun: { label: "Friel – % LTHR (běh)", reference: "lthr", names: ["Z1 Regenerace", "Z2 Aerobní", "Z3 Tempo", "Z4 Pod prahem", "Z5a Práh", "Z5b Aerobní kapacita", "Z5c Anaerobní"], bounds: [85, 89, 94, 99, 102, 106] },
  hrMax5: { label: "5 zón – % max. tepu", reference: "maxHr", names: ["Z1 Velmi lehce", "Z2 Lehce", "Z3 Středně", "Z4 Těžce", "Z5 Maximum"], bounds: [60, 70, 80, 90] },
  karvonen: { label: "Karvonen – % tepové rezervy", reference: "reserve", names: ["Z1 Velmi lehce", "Z2 Lehce", "Z3 Středně", "Z4 Těžce", "Z5 Maximum"], bounds: [60, 70, 80, 90] }
};

function validBounds(bounds, max) {
  return Array.isArray(bounds) && bounds.length >= 1 && bounds.length <= 9 && bounds.every((b, i) => Number.isFinite(Number(b)) && Number(b) > 0 && Number(b) <= max && (i === 0 || Number(b) > Number(bounds[i - 1])));
}

// Stored profile (sanitised), from the settings form.
export function sanitizeTrainingProfile(input = {}) {
  const out = {};
  const ftp = positive(input.ftp);
  if (ftp != null) { if (ftp < 50 || ftp > 600) throw new Error(L("FTP musí být 50–600 W.", "FTP must be 50–600 W.")); out.ftp = round(ftp); }
  if (input.ftpMethod && FTP_METHODS[input.ftpMethod]) out.ftpMethod = input.ftpMethod;
  const powerModel = String(input.powerZoneModel || "coggan7");
  out.powerZoneModel = POWER_ZONE_MODELS[powerModel] || powerModel === "custom" ? powerModel : "coggan7";
  if (out.powerZoneModel === "custom") {
    if (!validBounds(input.powerZoneBounds, 400)) throw new Error(L("Hranice výkonových zón musí být rostoucí čísla v % FTP.", "Power zone limits must be increasing numbers in % of FTP."));
    out.powerZoneBounds = input.powerZoneBounds.map(Number);
  }
  for (const [key, lo, hi, label] of [["lthr", 100, 220, "LTHR"], ["maxHr", 110, 230, L("Max. tep", "Max HR")], ["restHr", 30, 100, L("Klidový tep", "Resting HR")]]) {
    const v = positive(input[key]);
    if (v != null) { if (v < lo || v > hi) throw new Error(label + L(" musí být ", " must be ") + lo + "–" + hi + " bpm."); out[key] = round(v); }
  }
  const hrModel = String(input.hrZoneModel || "frielLthr");
  out.hrZoneModel = HR_ZONE_MODELS[hrModel] || hrModel === "custom" ? hrModel : "frielLthr";
  if (out.hrZoneModel === "custom") {
    if (!Array.isArray(input.hrZoneBounds) || !input.hrZoneBounds.every((b, i, a) => Number(b) >= 60 && Number(b) <= 230 && (i === 0 || Number(b) > Number(a[i - 1])))) throw new Error(L("Hranice tepových zón musí být rostoucí tepy (bpm).", "Heart rate zone limits must be increasing heart rates (bpm)."));
    out.hrZoneBounds = input.hrZoneBounds.map(Number);
  }
  const pace = parsePace(input.runThresholdPace);
  if (pace != null) { if (pace < 150 || pace > 600) throw new Error(L("Prahové tempo musí být 2:30–10:00 /km.", "Threshold pace must be 2:30–10:00 /km.")); out.runThresholdPace = round(pace); }
  if (input.paceMethod && PACE_METHODS[input.paceMethod]) out.paceMethod = input.paceMethod;
  const runLthr = positive(input.runLthr);
  if (runLthr != null) { if (runLthr < 100 || runLthr > 220) throw new Error(L("Běžecký LTHR musí být 100–220 bpm.", "Running LTHR must be 100–220 bpm.")); out.runLthr = round(runLthr); }
  const paceModel = String(input.paceZoneModel || "friel");
  out.paceZoneModel = PACE_ZONE_MODELS[paceModel] || paceModel === "custom" ? paceModel : "friel";
  if (out.paceZoneModel === "custom") {
    if (!validBounds(input.paceZoneBounds, 200)) throw new Error(L("Hranice tempových zón musí být rostoucí čísla v % prahové rychlosti.", "Pace zone limits must be increasing numbers in % of threshold speed."));
    out.paceZoneBounds = input.paceZoneBounds.map(Number);
  }
  return out;
}

// Power zones in % FTP and watts.
export function powerZones(profile = {}, ftp = null) {
  const custom = profile.powerZoneModel === "custom" && profile.powerZoneBounds;
  const model = custom ? null : POWER_ZONE_MODELS[profile.powerZoneModel] || POWER_ZONE_MODELS.coggan7;
  const bounds = custom ? profile.powerZoneBounds : model.bounds;
  // Custom bounds keep the names of the preset with the same number of zones.
  const names = model?.names || Object.values(POWER_ZONE_MODELS).find(m => m.bounds.length === bounds.length && m !== POWER_ZONE_MODELS.sweetSpot)?.names || bounds.concat([null]).map((_, i) => "Z" + (i + 1));
  return names.slice(0, bounds.length + 1).map((name, i) => {
    const low = i === 0 ? 0 : bounds[i - 1] + 1, high = i < bounds.length ? bounds[i] : null;
    // Watt ranges follow on from the previous zone's top, so bounds typed in
    // watts (stored as fractional %) come back as the same watts.
    const wattsLow = !ftp ? null : i === 0 ? 0 : round(ftp * bounds[i - 1] / 100) + 1;
    return { zone: i + 1, name, percentLow: low, percentHigh: high, wattsLow, wattsHigh: ftp && high != null ? round(ftp * high / 100) : null };
  });
}

// Heart-rate zones in bpm.
export function hrZones(profile = {}) {
  if (profile.hrZoneModel === "custom" && profile.hrZoneBounds) {
    return profile.hrZoneBounds.concat([null]).map((high, i) => ({ zone: i + 1, name: "Z" + (i + 1), bpmLow: i === 0 ? null : profile.hrZoneBounds[i - 1] + 1, bpmHigh: high }));
  }
  const model = HR_ZONE_MODELS[profile.hrZoneModel] || HR_ZONE_MODELS.frielLthr;
  const reserve = profile.maxHr && profile.restHr ? profile.maxHr - profile.restHr : null;
  const toBpm = pct => model.reference === "lthr" ? (profile.lthr ? profile.lthr * pct / 100 : null)
    : model.reference === "maxHr" ? (profile.maxHr ? profile.maxHr * pct / 100 : null)
    : reserve != null ? profile.restHr + reserve * pct / 100 : null;
  return model.names.map((name, i) => {
    const low = i === 0 ? null : toBpm(model.bounds[i - 1]), high = i < model.bounds.length ? toBpm(model.bounds[i]) : null;
    return { zone: i + 1, name, bpmLow: low == null ? null : round(low) + 1, bpmHigh: high == null ? (i === model.names.length - 1 && profile.maxHr ? profile.maxHr : null) : round(high) };
  });
}

// Which power zone a % FTP value falls into.
export function zoneForPercent(zones, percent) {
  return zones.find(z => z.percentHigh == null || percent <= z.percentHigh) || zones.at(-1);
}

// ---- Running: threshold pace and pace zones --------------------------------
// Paces are seconds per km. Zone bounds are % of threshold *speed* (as in
// Intervals.icu, 100 % = threshold pace, higher % = faster).

export function formatPace(secondsPerKm) {
  const s = Math.round(Number(secondsPerKm));
  if (!Number.isFinite(s) || s <= 0) return null;
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
// "4:35", "4.35", "275" (seconds) → seconds per km.
export function parsePace(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim().replace(",", ".");
  const m = text.match(/^(\d{1,2})[:.](\d{1,2})$/);
  const s = m ? Number(m[1]) * 60 + Number(m[2]) : Number(text);
  return Number.isFinite(s) && s > 0 ? s : null;
}
function parseTime(value) {
  const parts = String(value ?? "").trim().split(":").map(Number);
  if (!parts.length || parts.some(x => !Number.isFinite(x) || x < 0)) return null;
  return parts.reduce((sum, x) => sum * 60 + x, 0) || null;
}

// Riegel (T2 = T1 · (D2/D1)^1.06): the distance runnable in 60 min is the
// usual definition of threshold pace.
function thresholdFromRace(meters, seconds) {
  if (!positive(meters) || !positive(seconds)) return null;
  const distance60 = meters * (3600 / seconds) ** (1 / 1.06);
  return 3600 / (distance60 / 1000);
}
export const PACE_METHODS = {
  test30: { label: "30min test – tempo posledních 20 min (Friel)", inputs: [["pace20", "Průměrné tempo posledních 20 min (m:ss/km)"]], pace: ({ pace20 }) => parsePace(pace20) },
  race5k: { label: "Závod / test 5 km", inputs: [["time", "Čas na 5 km (mm:ss)"]], pace: ({ time }) => thresholdFromRace(5000, parseTime(time)) },
  race10k: { label: "Závod 10 km", inputs: [["time", "Čas na 10 km (mm:ss nebo h:mm:ss)"]], pace: ({ time }) => thresholdFromRace(10000, parseTime(time)) },
  half: { label: "Půlmaraton", inputs: [["time", "Čas půlmaratonu (h:mm:ss)"]], pace: ({ time }) => thresholdFromRace(21097.5, parseTime(time)) },
  race: { label: "Jiný závod (vzdálenost + čas)", inputs: [["distanceKm", "Vzdálenost (km)"], ["time", "Čas (h:mm:ss)"]], pace: ({ distanceKm, time }) => thresholdFromRace(Number(String(distanceKm).replace(",", ".")) * 1000, parseTime(time)) }
};
export function estimateThresholdPace(method, inputs = {}) {
  const m = PACE_METHODS[method];
  if (!m) throw new Error(L("Neznámá metoda výpočtu prahového tempa.", "Unknown threshold pace calculation method."));
  const values = Object.fromEntries(m.inputs.map(([key]) => [key, inputs[key]]));
  const pace = m.pace(values);
  if (!positive(pace) || pace < 150 || pace > 600) throw new Error(L("Zkontroluj zadané hodnoty – vypočtené tempo je mimo rozumný rozsah (2:30–10:00 /km).", "Check the values you entered – the calculated pace is outside a reasonable range (2:30–10:00 /km)."));
  return { method, label: m.label, thresholdPace: round(pace), formatted: formatPace(pace) };
}

export const PACE_ZONE_MODELS = {
  // Intervals.icu default run pace zones (Friel, % of threshold speed).
  friel: { label: "Friel 7 zón (výchozí v Intervals.icu)", names: ["Z1 Regenerace", "Z2 Aerobní", "Z3 Tempo", "Z4 Pod prahem", "Z5a Práh", "Z5b VO₂max", "Z5c Anaerobní"], bounds: [77.5, 87.7, 94.3, 100, 103.4, 111.5] },
  daniels: { label: "Daniels E / M / T / I / R", names: ["E Easy", "M Maraton", "T Práh", "I Interval", "R Opakování"], bounds: [84, 94, 101, 108] },
  five: { label: "5 zón (zjednodušené)", names: ["Z1 Regenerace", "Z2 Aerobní", "Z3 Tempo", "Z4 Práh", "Z5 Nad prahem"], bounds: [78, 88, 95, 101] }
};

// Pace zones: % of threshold speed and pace (s/km; slow is the lower speed).
export function paceZones(profile = {}, thresholdPace = null) {
  const custom = profile.paceZoneModel === "custom" && profile.paceZoneBounds;
  const model = custom ? null : PACE_ZONE_MODELS[profile.paceZoneModel] || PACE_ZONE_MODELS.friel;
  const bounds = custom ? profile.paceZoneBounds : model.bounds;
  const names = model?.names || Object.values(PACE_ZONE_MODELS).find(m => m.bounds.length === bounds.length)?.names || bounds.concat([null]).map((_, i) => "Z" + (i + 1));
  const paceAt = pct => thresholdPace && pct ? round(thresholdPace * 100 / pct) : null;
  return names.slice(0, bounds.length + 1).map((name, i) => {
    const low = i === 0 ? 0 : bounds[i - 1], high = i < bounds.length ? bounds[i] : null;
    return { zone: i + 1, name, percentLow: low, percentHigh: high, paceSlow: i === 0 ? null : paceAt(low), paceFast: high == null ? null : paceAt(high) };
  });
}

// Labels, zone names and input names in English (lang.js), read through getters
// so each request gets its own language.
const ZONE_TEXT_EN = {
 "20min test × 0,95": "20-min test × 0.95",
 "Průměrný výkon 20 min (W)": "Average power 20 min (W)",
 "2× 8min test × 0,90": "2× 8-min test × 0.90",
 "Průměr obou 8min úseků (W)": "Average of both 8-min efforts (W)",
 "Ramp test × 0,75": "Ramp test × 0.75",
 "Průměr poslední dokončené minuty (W)": "Average of the last completed minute (W)",
 "60 min na maximum": "60 min all-out",
 "Průměrný výkon 60 min (W)": "Average power 60 min (W)",
 "Critical Power (3 min + 12 min)": "Critical Power (3 min + 12 min)",
 "Nejlepší 3 min (W)": "Best 3 min (W)",
 "Nejlepších 12 min (W)": "Best 12 min (W)",
 "Odhad z hmotnosti (W/kg)": "Estimate from body weight (W/kg)",
 "Hmotnost (kg)": "Weight (kg)",
 "Odhad W/kg (začátečník ~2,5, trénovaný ~3,5)": "Estimated W/kg (beginner ~2.5, trained ~3.5)",
 "30min test – tempo posledních 20 min (Friel)": "30-min test – pace of the last 20 min (Friel)",
 "Průměrné tempo posledních 20 min (m:ss/km)": "Average pace of the last 20 min (m:ss/km)",
 "Závod / test 5 km": "5 km race / test",
 "Čas na 5 km (mm:ss)": "5 km time (mm:ss)",
 "Závod 10 km": "10 km race",
 "Čas na 10 km (mm:ss nebo h:mm:ss)": "10 km time (mm:ss or h:mm:ss)",
 "Půlmaraton": "Half marathon",
 "Čas půlmaratonu (h:mm:ss)": "Half marathon time (h:mm:ss)",
 "Jiný závod (vzdálenost + čas)": "Other race (distance + time)",
 "Vzdálenost (km)": "Distance (km)",
 "Čas (h:mm:ss)": "Time (h:mm:ss)",
 "Coggan 7 zón (výchozí v Intervals.icu)": "Coggan 7 zones (Intervals.icu default)",
 "Z1 Regenerace": "Z1 Recovery",
 "Z2 Vytrvalost": "Z2 Endurance",
 "Z3 Tempo": "Z3 Tempo",
 "Z4 Práh": "Z4 Threshold",
 "Z5 VO₂max": "Z5 VO₂max",
 "Z6 Anaerobní": "Z6 Anaerobic",
 "Z7 Neuromuskulární": "Z7 Neuromuscular",
 "5 zón (zjednodušené)": "5 zones (simplified)",
 "Z5 Nad prahem": "Z5 Above threshold",
 "7 zón se sweet spotem": "7 zones with sweet spot",
 "SS Sweet spot": "SS Sweet spot",
 "Z6+ Anaerobní": "Z6+ Anaerobic",
 "Seiler 3 zóny (polarizovaný trénink, orientačně)": "Seiler 3 zones (polarized training, approximate)",
 "Z1 Pod aerobním prahem": "Z1 Below aerobic threshold",
 "Z2 Mezi prahy": "Z2 Between thresholds",
 "Z3 Nad anaerobním prahem": "Z3 Above anaerobic threshold",
 "Friel – % LTHR (cyklistika)": "Friel – % LTHR (cycling)",
 "Z2 Aerobní": "Z2 Aerobic",
 "Z4 Pod prahem": "Z4 Sub-threshold",
 "Z5a Práh": "Z5a Threshold",
 "Z5b Aerobní kapacita": "Z5b Aerobic capacity",
 "Z5c Anaerobní": "Z5c Anaerobic",
 "Friel – % LTHR (běh)": "Friel – % LTHR (running)",
 "5 zón – % max. tepu": "5 zones – % of max HR",
 "Z1 Velmi lehce": "Z1 Very easy",
 "Z2 Lehce": "Z2 Easy",
 "Z3 Středně": "Z3 Moderate",
 "Z4 Těžce": "Z4 Hard",
 "Z5 Maximum": "Z5 Maximum",
 "Karvonen – % tepové rezervy": "Karvonen – % of heart rate reserve",
 "Friel 7 zón (výchozí v Intervals.icu)": "Friel 7 zones (Intervals.icu default)",
 "Z5b VO₂max": "Z5b VO₂max",
 "Daniels E / M / T / I / R": "Daniels E / M / T / I / R",
 "E Easy": "E Easy",
 "M Maraton": "M Marathon",
 "T Práh": "T Threshold",
 "I Interval": "I Interval",
 "R Opakování": "R Repetition"
};
const zoneText = cs => L(cs, ZONE_TEXT_EN[cs] || cs);
for (const table of [FTP_METHODS, PACE_METHODS, POWER_ZONE_MODELS, HR_ZONE_MODELS, PACE_ZONE_MODELS]) for (const item of Object.values(table)) {
  const { label, names, inputs } = item;
  Object.defineProperty(item, 'label', { get: () => zoneText(label), enumerable: true });
  if (names) Object.defineProperty(item, 'names', { get: () => names.map(zoneText), enumerable: true });
  if (inputs) Object.defineProperty(item, 'inputs', { get: () => inputs.map(([key, text]) => [key, zoneText(text)]), enumerable: true });
}
