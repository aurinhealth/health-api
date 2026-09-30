// Human explanation of a recommended workout: why this one today, how to ride
// it, fuelling, and the step list with % FTP and watts.
import { n } from "./workout-model.js";
import { zoneForPercent } from "./training-zones.js";

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

function fueling(minutes, system) {
  const hard = ["sweet_spot", "threshold", "vo2max", "anaerobic"].includes(system);
  if (minutes <= 75) return hard ? ["Před jízdou lehké sacharidové jídlo; během 30–40 g sacharidů/h je vhodné u intenzity.", "Pití 500–750 ml/h, po jízdě bílkoviny a sacharidy."] : ["Stačí voda nebo iontový nápoj; u jízdy nalačno drž opravdu nízkou intenzitu.", "Pití 500–750 ml/h."];
  if (minutes <= 150) return ["60 g sacharidů/h (gel, tyčinka, iontový nápoj) – začni v první půlhodině.", "Pití 500–750 ml/h, při teple víc a se solí."];
  return ["80–90 g sacharidů/h (kombinace glukózy a fruktózy), jez pravidelně každých 20–30 min.", "Pití 600–900 ml/h se sodíkem 500–1000 mg/l.", "Počítej s jídlem i na konec jízdy – kvalita je vložená mezi aerobní bloky."];
}

// Intervals.icu default power zones (% FTP) for steps planned as a zone.
const ZONE_RANGE = { Z1: [40, 55], Z2: [56, 75], Z3: [76, 90], Z4: [91, 105], Z5: [106, 120], Z6: [121, 150], Z7: [151, 200] };

// Steps grouped as they appear in the workout, with watt targets.
export function stepRows(structure = [], { ftp = null, environment = "indoor", zones = null } = {}) {
  const watts = pct => ftp ? Math.round(ftp * pct / 100) : null;
  const width = p => environment === "outdoor" ? (p >= 106 ? 4 : p >= 76 ? 3 : 5) : 0;
  const row = s => {
    const zone = ZONE_RANGE[String(s.note || "").toUpperCase()];
    const low = zone ? zone[0] : s.ramp ? n(s.powerStart) : n(s.power) - width(n(s.power)), high = zone ? zone[1] : s.ramp ? n(s.powerEnd) : n(s.power) + width(n(s.power));
    return {
      durationSeconds: Math.round(n(s.durationMinutes, 0) * 60), percentLow: Math.round(low), percentHigh: Math.round(high),
      wattsLow: s.free ? null : watts(low), wattsHigh: s.free ? null : watts(high), free: Boolean(s.free), ramp: Boolean(s.ramp),
      cadence: s.cadence || null, note: s.note || null,
      zone: zones && !s.free ? zoneForPercent(zones, (low + high) / 2)?.name || null : null
    };
  };
  return structure.map(block => block.steps ? { repeats: n(block.repeats, 1), note: block.note || null, steps: block.steps.map(row) } : { repeats: 1, steps: [row(block)] });
}

export function explainWorkout(workout, { coach = {}, environment = "indoor", thresholds = {}, planned = null } = {}) {
  let structure = [];
  try { structure = JSON.parse(workout.structure_json || "[]"); } catch {}
  const system = workout.primary_system, minutes = n(workout.duration_minutes, 0);
  const ftp = environment === "indoor" ? (thresholds.indoorFtp || thresholds.ftp) : thresholds.ftp;
  const why = [...(coach.rationale || [])];
  const r = coach.readiness || {};
  if (r.status) {
    const bits = [r.sleepMinutes ? "spánek " + (r.sleepMinutes / 60).toFixed(1) + " h" : null, r.tsb != null && Number.isFinite(Number(r.tsb)) ? "forma (TSB) " + Math.round(r.tsb) : null, ...(r.reasons || []).slice(0, 2)].filter(Boolean);
    why.push("Připravenost " + (r.score ?? "—") + "/100 (" + ({ green: "dobrá", yellow: "střední", red: "nízká" }[r.status] || r.status) + ")" + (bits.length ? ": " + bits.join(", ") : "") + ".");
  }
  for (const a of coach.recommendation?.adaptations || []) why.push("Úprava: " + a + ".");
  const p = coach.recommendation?.progression;
  if (p && ["recovery", "endurance"].includes(system)) why.push(system === "recovery" ? "Regenerační jízda: cílem je zotavení, ne progres – intenzita zůstává v Z1." : "Aerobní jízda: staví základ a nezvyšuje únavu; obtížnost se řídí délkou, ne intenzitou.");
  else if (p) why.push("Tvoje úroveň " + (SYSTEM_LABEL[p.system] || p.system) + " je " + Number(p.capabilityLevel).toFixed(1) + "; dnes cílím obtížnost " + Number(p.targetDifficulty).toFixed(1) + " a tento trénink má " + Number(workout.difficulty).toFixed(1) + ".");
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
