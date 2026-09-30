// Human explanation of a recommended workout: why this one today, how to ride
// it, fuelling, and the step list with % FTP and watts (running: % threshold
// pace and min/km).
import { n, outdoorWidth } from "./workout-model.js";
import { zoneForPercent, formatPace } from "./training-zones.js";

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
    const low = zone ? zone[0] : s.ramp ? n(s.powerStart) : n(s.power) - width(n(s.power)), high = zone ? zone[1] : s.ramp ? n(s.powerEnd) : n(s.power) + width(n(s.power));
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
  const ftp = environment === "indoor" ? (thresholds.indoorFtp || thresholds.ftp) : thresholds.ftp;
  const why = [...(coach.rationale || []), ...readinessLines(coach)];
  const p = coach.recommendation?.progression;
  if (p && ["recovery", "endurance"].includes(system)) why.push(system === "recovery" ? "Regenerační jízda: cílem je zotavení, ne progres – intenzita zůstává v Z1." : "Aerobní jízda: staví základ a nezvyšuje únavu; obtížnost se řídí délkou, ne intenzitou.");
  else if (p) why.push(progressLine(p, workout, SYSTEM_LABEL));
  if (!coach.rationale?.length && !planned) why.push("V plánu na tento den nic nemáš, proto vybírám podle zátěže posledních dní a tvé úrovně.");
  const how = [...(HOW[system] || HOW.endurance)];
  if (ftp) how.unshift("Watty počítám z tvého " + (environment === "indoor" && thresholds.indoorFtp ? "indoor " : "") + "FTP " + ftp + " W" + ({ manual: " (nastaveno v aplikaci)", "latest-ride": " (z poslední jízdy)" }[thresholds.source] || " (z Intervals.icu)") + ".");
  else how.unshift("FTP neznám – cíle jsou v % FTP. Zadej nebo spočítej FTP v Nastavení → FTP a zóny.");
  return {
    title: SYSTEM_LABEL[system] || system,
    why, how,
    environment: workout.environment_notes || [],
    fueling: fueling(minutes, system),
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
  const how = [...(RUN_HOW[system] || RUN_HOW.endurance)];
  if (pace) how.unshift("Tempa počítám z tvého prahového tempa " + formatPace(pace) + " /km" + ({ manual: " (nastaveno v aplikaci)" }[thresholds.runPaceSource] || " (z Intervals.icu)") + ".");
  else how.unshift("Prahové tempo neznám – cíle jsou v % prahového tempa. Zadej nebo spočítej ho v Nastavení → FTP a zóny → Běh.");
  const lthr = thresholds.runLthr;
  const hrZ2 = (thresholds.runHrZones || []).find(z => z.zone === 2);
  if (["recovery", "endurance"].includes(system) && hrZ2?.bpmHigh) how.push("Tep drž do " + hrZ2.bpmHigh + " bpm (Z2 z LTHR " + lthr + ").");
  const opts = { environment, zones: thresholds.paceZones, sport: "run", thresholdPace: pace };
  return {
    title: RUN_LABEL[system] || system,
    why, how,
    environment: workout.environment_notes || [],
    fueling: runFueling(minutes, system),
    ftp: null, thresholdPace: pace, thresholdPaceFormatted: formatPace(pace), paceSource: thresholds.runPaceSource || null,
    steps: stepRows(structure, opts),
    planned: planned ? { name: planned.name, minutes: planned.minutes, system: planned.system, intensityFactor: planned.intensityFactor, steps: stepRows(planned.structure || [], { ...opts, environment: "indoor" }) } : null
  };
}
