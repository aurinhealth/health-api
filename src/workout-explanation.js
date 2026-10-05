// Human explanation of a recommended workout: why this one today, how to ride
// it, fuelling, and the step list with % FTP and watts (running: % threshold
// pace and min/km).
import { n, outdoorWidth } from "./workout-model.js";
import { zoneForPercent, formatPace } from "./training-zones.js";
import { rideFtpFor } from "./intervals-athlete.js";

const SYSTEM_LABEL = { recovery: "Recovery", endurance: "Endurance", tempo: "Tempo", sweet_spot: "Sweet Spot", threshold: "Threshold", vo2max: "VO₂max", anaerobic: "Anaerobní kapacita", sprint: "Sprint" };

const HOW = {
  recovery: ["Opravdu lehce: Z1 (pod 55 % FTP), dýchání jen nosem, bez zadýchání.", "Kadence 85–95 rpm, žádné stoupání do kopců silou.", "Cílem je prokrvení a regenerace – když se cítíš hůř, klidně zkrať."],
  endurance: ["Drž Z2 (≈ 56–75 % FTP); měl bys být schopen mluvit v celých větách.", "Stoupání jeď v nižším úsilí a vyšší kadenci, nenech výkon vyskakovat nad 80 %.", "Zbytečně nezrychluj ve skupině – tenhle trénink staví aerobní základ, ne formu na den."],
  tempo: ["Tempo bloky ≈ 80–87 % FTP: „komfortně těžké“, dýchání zrychlené, ale kontrolované.", "Drž rovnoměrný výkon, v pauzách jeď opravdu lehce.", "Kadence 85–95 rpm; u silových bloků podle předpisu nižší."],
  sweet_spot: ["Bloky 88–94 % FTP – těsně pod prahem; posledních pár minut každého bloku má být náročných, ne k smrti.", "Nezačínej první blok moc zostra, drž cílový výkon od začátku do konce.", "Pokud poslední blok nedáš na cílovém výkonu, sniž o 2–3 % a dokonči."],
  threshold: ["Prahové bloky 95–105 % FTP; úsilí RPE 7–8.", "Rozlož síly rovnoměrně – první minuta bloku nesmí být nad cílem.", "Pauzy jeď lehce, ale neslézej z kola; kadence 90–95 rpm."],
  vo2max: ["VO₂ úseky 106–120 % FTP; první minuta je snadná, konec má být velmi těžký (RPE 9).", "Rychlý nástup, pak drž výkon; vyšší kadence 95–105 rpm pomáhá.", "Když výkon v posledních opakováních spadne o víc než 5 %, sérii ukonči – kvalita je důležitější než počet."],
  anaerobic: ["Úseky nad VO₂ (120–150 % FTP) – krátké, velmi intenzivní.", "Před prvním úsekem musíš být dobře rozjetý; mezi úseky úplně lehce.", "Kvalita před kvantitou – ukonči, když už nedáš cílový výkon."],
  sprint: ["Sprinty naplno ze sedla i ve stoje, s plnou regenerací mezi nimi.", "Začni v rozumném převodu a zrychluj, dokud kadence nepřestane růst.", "Každý sprint má být kvalitní – bez únavy z předchozího."]
};

const RUN_LABEL = { ...SYSTEM_LABEL, endurance: "Lehký / dlouhý běh", threshold: "Práh", anaerobic: "Rychlost", sprint: "Sprinty do kopce", recovery: "Regenerační běh" };
const RUN_HOW = {
  recovery: ["Opravdu pomalu – klidně pomaleji než tabulka; dech nosem, klidně vlož chůzi.", "Krátký krok, měkký došlap, rovina nebo měkký povrch.", "Cílem je prokrvení – když nohy bolí, zkrať nebo jdi."],
  endurance: ["Konverzační tempo: měl bys mluvit v celých větách, tep v Z2.", "Tempo z tabulky je horní hranice – v kopcích a v teple zpomal, řiď se tepem.", "Kadence kolem 165–180 kroků/min, uvolněná ramena; rovinky na konci svižně, ne naplno."],
  tempo: ["Tempo ≈ 89–95 % prahu: „komfortně těžké“, mluvit jde jen v krátkých větách.", "Drž rovnoměrné tempo od začátku, první kilometr nesmí být nejrychlejší.", "Když tep během bloku pořád stoupá nad Z3, uber pár sekund na km."],
  threshold: ["Prahové úseky ≈ tempo, které udržíš zhruba hodinu (RPE 7).", "Rozlož síly rovnoměrně – všechny úseky ve stejném tempu, poslední klidně o chlup rychleji.", "Pauzy klusem, nezastavuj; kontrola: po úseku bys měl zvládnout ještě jeden."],
  vo2max: ["VO₂ úseky ≈ tempo na 3–5 km; první úsek nepřepal, konec série má být velmi těžký.", "Rychlý, ale uvolněný krok, práce paží; do kopce podle úsilí.", "Když tempo v posledních úsecích spadne o víc než 3–4 %, sérii ukonči."],
  anaerobic: ["Rychlé úseky ≈ tempo na 1500 m – rychlost a technika, ne vyčerpání.", "Plná pauza, každý úsek má být kvalitní a stejně rychlý.", "Pozor na lýtka a achilovky – rozklus a rovinky předem jsou povinné."],
  sprint: ["Sprinty do prudkého kopce naplno 8–10 s, dlouhá pauza chůzí dolů.", "Výrazná práce paží, vysoká kolena, došlap pod tělem.", "Jen pokud jsou nohy svěží – jde o kvalitu, ne o únavu."]
};
function runFueling(minutes, system) {
  const hard = ["tempo", "threshold", "vo2max", "anaerobic"].includes(system);
  if (minutes <= 60) return [hard ? "Lehké sacharidové jídlo 2–3 h před během; během nic potřeba není." : "Během nic potřeba není; pij podle žízně.", "Po běhu bílkoviny a sacharidy, doplň tekutiny."];
  if (minutes <= 90) return ["Vezmi si vodu; u tempa nebo v teple 1 gel (~25–30 g sacharidů) po 45 min.", "Po běhu bílkoviny a sacharidy do hodiny."];
  return ["30–60 g sacharidů/h (gely, iontový nápoj) – začni po 30–40 min a pak pravidelně.", "Pití 400–800 ml/h podle tepla, se sodíkem.", "Dlouhý běh je i trénink trávení – zkoušej to, co chceš jíst v závodě."];
}

// ---- Advice built from the workout itself -----------------------------------
const WORK_FROM = { ride: { recovery: 999, endurance: 999, tempo: 76, sweet_spot: 88, threshold: 95, vo2max: 106, anaerobic: 121, sprint: 151 }, run: { recovery: 999, endurance: 999, tempo: 89, threshold: 96, vo2max: 102, anaerobic: 111, sprint: 126 } };
const minLabel = m => { const sec = Math.round(m * 60); return sec < 60 ? sec + " s" : sec % 60 ? Math.floor(sec / 60) + " min " + (sec % 60) + " s" : sec / 60 + " min"; };
const join = parts => parts.length > 1 ? parts.slice(0, -1).join(", ") + " a " + parts.at(-1) : parts[0] || "";

// "91 % FTP (≈ 237 W)" or "99 % prahu (4:37 /km)".
function targetText(power, { sport, ftp, thresholdPace }) {
  const p = Math.round(n(power, 0));
  if (sport === "run") return p + " % prahu" + (thresholdPace ? " (" + formatPace(thresholdPace * 100 / p) + " /km)" : "");
  return p + " % FTP" + (ftp ? " (≈ " + Math.round(ftp * p / 100) + " W)" : "");
}

// Concrete lines about the main set, the time in the target intensity and pacing.
export function structureHow(structure = [], { system, sport = "ride", ftp = null, thresholdPace = null } = {}) {
  const from = (WORK_FROM[sport] || WORK_FROM.ride)[system] ?? 999, opts = { sport, ftp, thresholdPace };
  const isWork = s => n(s.power, 0) >= from || s.free;
  const lines = [], sets = [];
  let workMinutes = 0, total = 0, longestWork = 0, maxReps = 0;
  for (const block of structure) {
    const reps = Array.isArray(block.steps) ? Math.max(1, n(block.repeats, 1)) : 1, steps = block.steps || [block];
    for (const st of steps) { total += n(st.durationMinutes, 0) * reps; if (isWork(st)) { workMinutes += n(st.durationMinutes, 0) * reps; longestWork = Math.max(longestWork, n(st.durationMinutes, 0)); } }
    const work = steps.filter(isWork);
    // Openers in the warm-up (under 3 min of work in total) are not the main set.
    if (!work.length || (sets.length === 0 && workMinutes <= 3 && work.reduce((x, w) => x + n(w.durationMinutes, 0), 0) * reps < 3 && structure.length > 2)) continue;
    maxReps = Math.max(maxReps, reps);
    const rest = steps.filter(st => !isWork(st));
    if (work.length === 1) {
      const w = work[0];
      const what = w.free ? minLabel(w.durationMinutes) + " naplno" : minLabel(w.durationMinutes) + " na " + targetText(w.ramp ? w.powerEnd : w.power, opts) + (w.ramp ? " (stupňuj od " + Math.round(w.powerStart) + " %)" : "");
      const pause = rest.length ? ", mezi nimi " + minLabel(rest.reduce((x, r) => x + n(r.durationMinutes, 0), 0)) + " " + (sport === "run" ? "klus" : "lehce") : "";
      const cadence = w.cadence && sport !== "run" ? " při " + String(w.cadence).replace(/rpm/i, "").trim().replace("-", "–") + " rpm" : "";
      sets.push((reps > 1 ? reps + "× " : "") + what + cadence + (reps > 1 ? pause : ""));
    } else {
      // Micro-intervals: pair each effort with the easy step after it and
      // group identical pairs ("13× 30 s na 120 % / 15 s lehce").
      const pairs = [];
      steps.forEach((st, i) => { if (!isWork(st)) return; const next = steps[i + 1] && !isWork(steps[i + 1]) && i + 2 < steps.length ? steps[i + 1] : null; pairs.push({ w: st, r: next }); });
      const groups = [];
      for (const pr of pairs) { const key = [pr.w.durationMinutes, pr.w.power, pr.w.free, pr.r?.durationMinutes].join("|"), last = groups.at(-1); if (last && last.key === key) last.count++; else groups.push({ key, count: 1, ...pr }); }
      const parts = groups.map(g => (g.count > 1 ? g.count + "× " : "") + minLabel(g.w.durationMinutes) + (g.w.free ? " naplno" : " na " + targetText(g.w.power, opts)) + (g.r ? " / " + minLabel(g.r.durationMinutes) + " " + (sport === "run" ? "klus" : "lehce") : ""));
      // Alternating patterns (over-unders): "4× (2 min na 88 % …, 1 min na 102 % …)".
      let text = join(parts);
      for (let k = 1; k <= parts.length / 2; k++) if (parts.length % k === 0 && parts.every((x, i) => x === parts[i % k])) { text = parts.length / k + "× (" + parts.slice(0, k).join(", ") + ")"; break; }
      const seriesRest = rest.length && !isWork(steps.at(-1)) ? ", mezi sériemi " + minLabel(steps.at(-1).durationMinutes) + (sport === "run" ? " klus" : " lehce") : "";
      sets.push((reps > 1 ? reps + " série: " : "") + text + (reps > 1 ? seriesRest : ""));
    }
  }
  if (["recovery", "endurance"].includes(system)) {
    const flat = structure.flatMap(b => b.steps ? b.steps.map(st => ({ ...st, durationMinutes: n(st.durationMinutes, 0) * Math.max(1, n(b.repeats, 1)) })) : [b]);
    const main = flat.reduce((a, b) => n(b.durationMinutes, 0) > n(a?.durationMinutes, 0) ? b : a, null);
    if (main) lines.push("Většinu času (" + Math.round(main.durationMinutes) + " min z " + Math.round(total) + ") drž " + targetText(main.power, opts) + ".");
    const extras = structure.filter(b => b.steps && n(b.repeats, 1) > 1).map(b => { const x = b.steps.find(st => st.note && n(st.durationMinutes, 0) <= 5) || b.steps[0]; return b.repeats + "× " + minLabel(x.durationMinutes) + (x.note ? " " + x.note : "") + (x.cadence && sport !== "run" ? " (" + String(x.cadence).replace(/rpm/i, "").trim() + " rpm)" : ""); });
    if (extras.length) lines.push("Navíc " + join(extras) + ".");
    const finish = flat.filter(st => n(st.power, 0) >= (sport === "run" ? 89 : 76) && n(st.durationMinutes, 0) >= 5).at(-1);
    if (finish) lines.push("Ke konci " + Math.round(finish.durationMinutes) + " min na " + targetText(finish.power, opts) + (finish.note ? " – " + finish.note : "") + ".");
    return lines;
  }
  if (sets.length) lines.push("Hlavní část: " + join(sets) + ".");
  if (workMinutes > 0) lines.push("Celkem " + Math.round(workMinutes) + " min práce v cílové intenzitě z " + Math.round(total) + " min tréninku.");
  if (maxReps >= 4) lines.push("První " + (maxReps >= 8 ? "2–3" : "1–2") + " opakování jeď na spodní hranici; když poslední dáš s rezervou, příště se obtížnost zvedne.");
  else if (longestWork >= 15) lines.push("Blok " + minLabel(longestWork) + " rozděl v hlavě na třetiny: první klidně, druhá stabilně, poslední je o vůli.");
  return lines;
}

// Fuel for this length: grams of carbohydrate and fluid for the whole session.
function fuelTotals(minutes, rate, fluid) {
  const hours = minutes / 60;
  const gels = Math.max(1, Math.round(rate * hours / 25));
  return "Na " + Math.round(minutes) + " min počítej celkem s ~" + Math.round(rate * hours / 5) * 5 + " g sacharidů (≈ " + gels + (gels === 1 ? " gel" : gels <= 4 ? " gely" : " gelů") + " nebo ekvivalent v pití) a ~" + (Math.round(fluid * hours * 2) / 2).toFixed(1).replace(".", ",") + " l tekutin.";
}

// Where to ride/run it, from the longest uninterrupted effort.
function terrainLine(structure, { sport, environment, system }) {
  if (environment !== "outdoor" || ["recovery", "endurance"].includes(system)) return null;
  const from = (WORK_FROM[sport] || WORK_FROM.ride)[system] ?? 999;
  const longest = Math.max(0, ...structure.flatMap(b => b.steps || [b]).filter(st => n(st.power, 0) >= from).map(st => n(st.durationMinutes, 0)));
  if (!longest) return null;
  return sport === "run" ? "Najdi úsek na " + minLabel(longest) + " souvislého běhu bez přechodů a zastavení." : "Najdi silnici nebo stoupání na " + minLabel(longest) + " nerušené jízdy – bez semaforů a křižovatek.";
}

function fueling(minutes, system) {
  const hard = ["sweet_spot", "threshold", "vo2max", "anaerobic"].includes(system);
  if (minutes <= 75) return hard ? ["Před jízdou lehké sacharidové jídlo; během 30–40 g sacharidů/h je vhodné u intenzity.", "Pití 500–750 ml/h, po jízdě bílkoviny a sacharidy."] : ["Stačí voda nebo iontový nápoj; u jízdy nalačno drž opravdu nízkou intenzitu.", "Pití 500–750 ml/h."];
  if (minutes <= 150) return ["60 g sacharidů/h (gel, tyčinka, iontový nápoj) – začni v první půlhodině.", "Pití 500–750 ml/h, při teple víc a se solí."];
  return ["80–90 g sacharidů/h (kombinace glukózy a fruktózy), jez pravidelně každých 20–30 min.", "Pití 600–900 ml/h se sodíkem 500–1000 mg/l.", "Počítej s jídlem i na konec jízdy – kvalita je vložená mezi aerobní bloky."];
}

// Intervals.icu default power zones (% FTP) and pace zones (% threshold
// speed) for steps planned as a zone.
const ZONE_RANGE = { Z1: [40, 55], Z2: [56, 75], Z3: [76, 90], Z4: [91, 105], Z5: [106, 120], Z6: [121, 150], Z7: [151, 200] };
const RUN_ZONE_RANGE = { Z1: [65, 77], Z2: [78, 88], Z3: [88, 94], Z4: [94, 100], Z5: [100, 103], Z6: [103, 111], Z7: [111, 120] };

// Steps grouped as they appear in the workout, with watt targets (running:
// pace targets in s/km, paceFast from the upper % and paceSlow from the lower).
export function stepRows(structure = [], { ftp = null, environment = "indoor", zones = null, sport = "ride", thresholdPace = null } = {}) {
  const run = sport === "run";
  const watts = pct => ftp ? Math.round(ftp * pct / 100) : null;
  const pace = pct => thresholdPace && pct > 0 ? Math.round(thresholdPace * 100 / pct) : null;
  const width = p => environment === "outdoor" ? outdoorWidth(p, sport) : 0;
  const ranges = run ? RUN_ZONE_RANGE : ZONE_RANGE;
  const row = s => {
    const zone = ranges[String(s.note || "").toUpperCase()];
    const range = !zone && !s.ramp && s.powerLow != null && s.powerHigh != null;
    const low = zone ? zone[0] : s.ramp ? n(s.powerStart) : range ? n(s.powerLow) : n(s.power) - width(n(s.power)), high = zone ? zone[1] : s.ramp ? n(s.powerEnd) : range ? n(s.powerHigh) : n(s.power) + width(n(s.power));
    const out = {
      durationSeconds: Math.round(n(s.durationMinutes, 0) * 60), percentLow: Math.round(low), percentHigh: Math.round(high),
      wattsLow: s.free || run ? null : watts(low), wattsHigh: s.free || run ? null : watts(high), free: Boolean(s.free), ramp: Boolean(s.ramp),
      cadence: run ? null : s.cadence || null, note: s.note || null,
      zone: zones && !s.free ? zoneForPercent(zones, (low + high) / 2)?.name || null : null
    };
    if (run) Object.assign(out, { paceSlow: s.free ? null : formatPace(pace(low)), paceFast: s.free ? null : formatPace(pace(high)) });
    return out;
  };
  return structure.map(block => block.steps ? { repeats: n(block.repeats, 1), note: block.note || null, steps: block.steps.map(row) } : { repeats: 1, steps: [row(block)] });
}

export function explainWorkout(workout, { coach = {}, environment = "indoor", thresholds = {}, planned = null, sport = workout.sport || "ride" } = {}) {
  let structure = [];
  try { structure = JSON.parse(workout.structure_json || "[]"); } catch {}
  const system = workout.primary_system, minutes = n(workout.duration_minutes, 0);
  if (sport === "run") return explainRun(workout, structure, { coach, environment, thresholds, planned, system, minutes });
  const { ftp, estimated } = rideFtpFor(thresholds, environment);
  const why = [...(coach.rationale || []), ...readinessLines(coach)];
  const p = coach.recommendation?.progression;
  if (p && ["recovery", "endurance"].includes(system)) why.push(system === "recovery" ? "Regenerační jízda: cílem je zotavení, ne progres – intenzita zůstává v Z1." : "Aerobní jízda: staví základ a nezvyšuje únavu; obtížnost se řídí délkou, ne intenzitou.");
  else if (p) why.push(progressLine(p, workout, SYSTEM_LABEL));
  if (!coach.rationale?.length && !planned) why.push("V plánu na tento den nic nemáš, proto vybírám podle zátěže posledních dní a tvé úrovně.");
  const how = [...structureHow(structure, { system, sport: "ride", ftp }), ...(HOW[system] || HOW.endurance).slice(0, 2)];
  if (ftp && estimated) how.unshift("Na trenažéru počítám watty z indoor FTP " + ftp + " W – odhad 95 % z tvého FTP " + thresholds.ftp + " W, protože indoor se stejný výkon drží hůř. Vlastní indoor FTP nastavíš v Intervals.icu.");
  else if (ftp) how.unshift("Watty počítám z tvého " + (environment === "indoor" && thresholds.indoorFtp ? "indoor " : "") + "FTP " + ftp + " W" + ({ manual: " (nastaveno v aplikaci)", "latest-ride": " (z poslední jízdy)" }[thresholds.source] || " (z Intervals.icu)") + ".");
  else how.unshift("FTP neznám – cíle jsou v % FTP. Zadej nebo spočítej FTP v Nastavení → FTP a zóny.");
  return {
    title: SYSTEM_LABEL[system] || system,
    why, how,
    environment: [terrainLine(structure, { sport: "ride", environment, system }), ...(workout.environment_notes || [])].filter(Boolean),
    fueling: [...fueling(minutes, system), ...(minutes > 75 ? [fuelTotals(minutes, minutes <= 150 ? 60 : 85, .65)] : [])],
    ftp: ftp || null, ftpSource: thresholds.source || null,
    steps: stepRows(structure, { ftp, environment, zones: thresholds.powerZones }),
    planned: planned ? { name: planned.name, minutes: planned.minutes, system: planned.system, intensityFactor: planned.intensityFactor, steps: stepRows(planned.structure || [], { ftp, environment: "indoor", zones: thresholds.powerZones }) } : null
  };
}

// Readiness and the coach's adjustments, as sentences.
function readinessLines(coach) {
  const out = [], r = coach.readiness || {};
  if (r.status) {
    const bits = [r.sleepMinutes ? "spánek " + (r.sleepMinutes / 60).toFixed(1) + " h" : null, r.tsb != null && Number.isFinite(Number(r.tsb)) ? "forma (TSB) " + Math.round(r.tsb) : null, ...(r.reasons || []).slice(0, 2)].filter(Boolean);
    out.push("Připravenost " + (r.score ?? "—") + "/100 (" + ({ green: "dobrá", yellow: "střední", red: "nízká" }[r.status] || r.status) + ")" + (bits.length ? ": " + bits.join(", ") : "") + ".");
  }
  for (const a of coach.recommendation?.adaptations || []) out.push("Úprava: " + a + ".");
  return out;
}
function progressLine(p, workout, labels) {
  return "Tvoje úroveň " + (labels[p.system] || p.system) + " je " + Number(p.capabilityLevel).toFixed(1) + "; dnes cílím obtížnost " + Number(p.targetDifficulty).toFixed(1) + " a tento trénink má " + Number(workout.difficulty).toFixed(1) + ".";
}

function explainRun(workout, structure, { coach, environment, thresholds, planned, system, minutes }) {
  const pace = thresholds.runThresholdPace || null;
  const why = [...(coach.rationale || []), ...readinessLines(coach)];
  const p = coach.recommendation?.progression;
  if (p && ["recovery", "endurance"].includes(system)) why.push(system === "recovery" ? "Regenerační běh: cílem je zotavení, ne progres." : "Lehký běh staví aerobní základ a odolnost nohou; obtížnost se řídí délkou, ne tempem.");
  else if (p) why.push(progressLine(p, workout, RUN_LABEL));
  if (!coach.rationale?.length && !planned) why.push("V plánu na tento den žádný běh nemáš, proto vybírám podle běhů posledních dní a tvé úrovně.");
  const how = [...structureHow(structure, { system, sport: "run", thresholdPace: pace }), ...(RUN_HOW[system] || RUN_HOW.endurance).slice(0, 2)];
  if (pace) how.unshift("Tempa počítám z tvého prahového tempa " + formatPace(pace) + " /km" + ({ manual: " (nastaveno v aplikaci)" }[thresholds.runPaceSource] || " (z Intervals.icu)") + ".");
  else how.unshift("Prahové tempo neznám – cíle jsou v % prahového tempa. Zadej nebo spočítej ho v Nastavení → FTP a zóny → Běh.");
  const lthr = thresholds.runLthr;
  const hrZ2 = (thresholds.runHrZones || []).find(z => z.zone === 2);
  if (["recovery", "endurance"].includes(system) && hrZ2?.bpmHigh) how.push("Tep drž do " + hrZ2.bpmHigh + " bpm (Z2 z LTHR " + lthr + ").");
  const opts = { environment, zones: thresholds.paceZones, sport: "run", thresholdPace: pace };
  return {
    title: RUN_LABEL[system] || system,
    why, how,
    environment: [terrainLine(structure, { sport: "run", environment, system }), ...(workout.environment_notes || [])].filter(Boolean),
    fueling: [...runFueling(minutes, system), ...(minutes > 90 ? [fuelTotals(minutes, 45, .6)] : [])],
    ftp: null, thresholdPace: pace, thresholdPaceFormatted: formatPace(pace), paceSource: thresholds.runPaceSource || null,
    steps: stepRows(structure, opts),
    planned: planned ? { name: planned.name, minutes: planned.minutes, system: planned.system, intensityFactor: planned.intensityFactor, steps: stepRows(planned.structure || [], { ...opts, environment: "indoor" }) } : null
  };
}
