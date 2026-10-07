// Human explanation of a recommended workout: why this one today, how to ride
// it, fuelling, and the step list with % FTP and watts (running: % threshold
// pace and min/km).
import { n, outdoorWidth } from "./workout-model.js";
import { zoneForPercent, formatPace } from "./training-zones.js";
import { rideFtpFor } from "./intervals-athlete.js";
import { L } from "./lang.js";

const SYSTEM_LABELS = () => ({ recovery: "Recovery", endurance: "Endurance", tempo: "Tempo", sweet_spot: "Sweet Spot", threshold: "Threshold", vo2max: "VO₂max", anaerobic: L("Anaerobní kapacita", "Anaerobic capacity"), sprint: "Sprint" });

const HOW_CS = {
  recovery: ["Opravdu lehce: Z1 (pod 55 % FTP), dýchej jen nosem, bez zadýchání.", "Kadence 85–95 rpm, žádné stoupání silou.", "Cílem je prokrvení a regenerace – když se cítíš hůř, klidně zkrať."],
  endurance: ["Drž Z2 (≈ 56–75 % FTP); měl bys být schopen mluvit v celých větách.", "Stoupání jeď s nižším úsilím a vyšší kadencí, nenech výkon vyskakovat nad 80 %.", "Zbytečně nezrychluj ve skupině – tenhle trénink staví aerobní základ, ne formu na jeden den."],
  tempo: ["Tempo bloky ≈ 80–87 % FTP: „komfortně těžké“, dýchání zrychlené, ale kontrolované.", "Drž rovnoměrný výkon, v pauzách jeď opravdu lehce.", "Kadence 85–95 rpm; u silových bloků podle předpisu nižší."],
  sweet_spot: ["Bloky 88–94 % FTP – těsně pod prahem; posledních pár minut každého bloku má být náročných, ale ne na doraz.", "Nezačínej první blok moc zostra, drž cílový výkon od začátku do konce.", "Pokud poslední blok nezvládneš na cílovém výkonu, sniž ho o 2–3 % a dokonči."],
  threshold: ["Prahové bloky 95–105 % FTP; úsilí RPE 7–8.", "Rozlož síly rovnoměrně – první minuta bloku nesmí být nad cílem.", "Pauzy jeď lehce, ale nesesedej z kola; kadence 90–95 rpm."],
  vo2max: ["VO₂ úseky 106–120 % FTP; první minuta je snadná, konec má být velmi těžký (RPE 9).", "Rychlý nástup, pak drž výkon; vyšší kadence 95–105 rpm pomáhá.", "Když výkon v posledních opakováních spadne o víc než 5 %, sérii ukonči – kvalita je důležitější než počet."],
  anaerobic: ["Úseky nad VO₂ (120–150 % FTP) – krátké, velmi intenzivní.", "Před prvním úsekem musíš být dobře rozjetý; mezi úseky úplně lehce.", "Kvalita před kvantitou – ukonči, když už cílový výkon nezvládáš."],
  sprint: ["Sprinty naplno ze sedla i ve stoje, s plnou regenerací mezi nimi.", "Začni v rozumném převodu a zrychluj, dokud kadence neroste.", "Každý sprint má být kvalitní – bez únavy z předchozího."]
};
const HOW_EN = {
  recovery: ["Truly easy: Z1 (below 55 % FTP), breathe through your nose, never out of breath.", "Cadence 85–95 rpm, no grinding up climbs.", "The goal is blood flow and recovery – if you feel worse, cut it short."],
  endurance: ["Stay in Z2 (≈ 56–75 % FTP); you should be able to talk in full sentences.", "Climb with less effort and a higher cadence; don't let power jump above 80 %.", "Don't chase the pace in a group – this ride builds your aerobic base, not one day's form."],
  tempo: ["Tempo blocks ≈ 80–87 % FTP: \"comfortably hard\", faster but controlled breathing.", "Keep the power steady and ride the recoveries truly easy.", "Cadence 85–95 rpm; lower in strength blocks, as prescribed."],
  sweet_spot: ["Blocks at 88–94 % FTP – just below threshold; the last few minutes of each block should be demanding, but not all-out.", "Don't start the first block too hard; hold the target power from start to finish.", "If you can't hold the target in the last block, lower it by 2–3 % and finish."],
  threshold: ["Threshold blocks at 95–105 % FTP; effort RPE 7–8.", "Pace yourself evenly – the first minute of a block must not be above target.", "Ride the recoveries easy, but stay on the bike; cadence 90–95 rpm."],
  vo2max: ["VO₂ efforts at 106–120 % FTP; the first minute feels easy, the end should be very hard (RPE 9).", "Start fast, then hold the power; a higher cadence of 95–105 rpm helps.", "If power drops by more than 5 % in the last repeats, end the set – quality matters more than count."],
  anaerobic: ["Efforts above VO₂ (120–150 % FTP) – short and very intense.", "Be well warmed up before the first effort; completely easy between efforts.", "Quality over quantity – stop when you can no longer hit the target power."],
  sprint: ["All-out sprints seated and standing, with full recovery between them.", "Start in a sensible gear and accelerate until your cadence stops rising.", "Every sprint should be high quality – without fatigue from the previous one."]
};
const HOW = () => L(HOW_CS, HOW_EN);

const RUN_LABELS = () => ({ ...SYSTEM_LABELS(), ...L({ endurance: "Lehký / dlouhý běh", threshold: "Práh", anaerobic: "Rychlost", sprint: "Sprinty do kopce", recovery: "Regenerační běh" }, { endurance: "Easy / long run", threshold: "Threshold", anaerobic: "Speed", sprint: "Hill sprints", recovery: "Recovery run" }) });
const RUN_HOW_CS = {
  recovery: ["Opravdu pomalu – klidně pomaleji než v tabulce; dýchej nosem, klidně vlož chůzi.", "Krátký krok, měkký došlap, rovina nebo měkký povrch.", "Cílem je prokrvení – když nohy bolí, zkrať nebo jdi."],
  endurance: ["Konverzační tempo: měl bys mluvit v celých větách, tep v Z2.", "Tempo z tabulky je horní hranice – v kopcích a v teple zpomal, řiď se tepem.", "Kadence kolem 165–180 kroků/min, uvolněná ramena; rovinky na konci svižně, ne naplno."],
  tempo: ["Tempo ≈ 89–95 % prahu: „komfortně těžké“, mluvit jde jen v krátkých větách.", "Drž rovnoměrné tempo od začátku, první kilometr nesmí být nejrychlejší.", "Když tep během bloku stále stoupá nad Z3, uber pár sekund na km."],
  threshold: ["Prahové úseky ≈ tempo, které udržíš zhruba hodinu (RPE 7).", "Rozlož síly rovnoměrně – všechny úseky ve stejném tempu, poslední klidně o chlup rychleji.", "Pauzy klusej, nezastavuj; kontrola: po úseku bys měl zvládnout ještě jeden."],
  vo2max: ["VO₂ úseky ≈ tempo na 3–5 km; první úsek nepřepal, konec série má být velmi těžký.", "Rychlý, ale uvolněný krok, práce paží; do kopce podle úsilí.", "Když tempo v posledních úsecích spadne o víc než 3–4 %, sérii ukonči."],
  anaerobic: ["Rychlé úseky ≈ tempo na 1500 m – rychlost a technika, ne vyčerpání.", "Plná pauza, každý úsek má být kvalitní a stejně rychlý.", "Pozor na lýtka a Achillovy šlachy – rozklus a rovinky předem jsou povinné."],
  sprint: ["Sprinty do prudkého kopce naplno 8–10 s, dlouhá pauza chůzí dolů.", "Výrazná práce paží, vysoká kolena, došlap pod tělo.", "Jen pokud jsou nohy svěží – jde o kvalitu, ne o únavu."]
};
const RUN_HOW_EN = {
  recovery: ["Truly slow – slower than the table is fine; breathe through your nose and walk if you like.", "Short stride, soft landing, flat or soft ground.", "The goal is blood flow – if your legs hurt, cut it short or walk."],
  endurance: ["Conversational pace: you should talk in full sentences, heart rate in Z2.", "The pace in the table is the upper limit – slow down on hills and in the heat, go by heart rate.", "Cadence around 165–180 steps/min, relaxed shoulders; strides at the end quick, not all-out."],
  tempo: ["Tempo ≈ 89–95 % of threshold: \"comfortably hard\", you can only talk in short sentences.", "Hold an even pace from the start; the first kilometer must not be the fastest.", "If your heart rate keeps climbing above Z3 during a block, ease off a few seconds per km."],
  threshold: ["Threshold efforts ≈ the pace you can hold for about an hour (RPE 7).", "Pace yourself evenly – every effort at the same pace, the last one a touch faster if you like.", "Jog the recoveries, don't stop; check: after an effort you should be able to do one more."],
  vo2max: ["VO₂ efforts ≈ 3–5 km race pace; don't overcook the first one, the end of the set should be very hard.", "Quick but relaxed stride, use your arms; go by effort on hills.", "If the pace drops by more than 3–4 % in the last efforts, end the set."],
  anaerobic: ["Fast efforts ≈ 1500 m race pace – speed and technique, not exhaustion.", "Full rest; every effort should be good quality and equally fast.", "Mind your calves and Achilles tendons – a warm-up jog and strides beforehand are a must."],
  sprint: ["All-out sprints up a steep hill for 8–10 s, with a long walk back down.", "Strong arm drive, high knees, land under your body.", "Only if your legs are fresh – it's about quality, not fatigue."]
};
const RUN_HOW = () => L(RUN_HOW_CS, RUN_HOW_EN);
function runFueling(minutes, system) {
  const hard = ["tempo", "threshold", "vo2max", "anaerobic"].includes(system);
  if (minutes <= 60) return [hard ? L("Lehké sacharidové jídlo 2–3 h před během; během běhu nic potřeba není.", "A light carb meal 2–3 h before the run; you need nothing during it.") : L("Během běhu nic potřeba není; pij podle žízně.", "You need nothing during the run; drink to thirst."), L("Po běhu bílkoviny a sacharidy, doplň tekutiny.", "After the run, have protein and carbs and rehydrate.")];
  if (minutes <= 90) return [L("Vezmi si vodu; u tempa nebo v teple 1 gel (~25–30 g sacharidů) po 45 min.", "Take water; at tempo or in the heat, 1 gel (~25–30 g of carbs) after 45 min."), L("Po běhu bílkoviny a sacharidy do hodiny.", "Protein and carbs within an hour after the run.")];
  return [L("30–60 g sacharidů/h (gely, iontový nápoj) – začni po 30–40 min a pak pravidelně.", "30–60 g of carbs/h (gels, sports drink) – start after 30–40 min and then regularly."), L("Pití 400–800 ml/h podle tepla, se sodíkem.", "Drink 400–800 ml/h depending on the heat, with sodium."), L("Dlouhý běh je i trénink trávení – zkoušej to, co chceš jíst v závodě.", "A long run also trains your gut – try what you plan to eat in a race.")];
}

// ---- Advice built from the workout itself -----------------------------------
const WORK_FROM = { ride: { recovery: 999, endurance: 999, tempo: 76, sweet_spot: 88, threshold: 95, vo2max: 106, anaerobic: 121, sprint: 151 }, run: { recovery: 999, endurance: 999, tempo: 89, threshold: 96, vo2max: 102, anaerobic: 111, sprint: 126 } };
const minLabel = m => { const sec = Math.round(m * 60); return sec < 60 ? sec + " s" : sec % 60 ? Math.floor(sec / 60) + " min " + (sec % 60) + " s" : sec / 60 + " min"; };
const join = parts => parts.length > 1 ? parts.slice(0, -1).join(", ") + L(" a ", " and ") + parts.at(-1) : parts[0] || "";
const EASY = sport => sport === "run" ? L("klus", "jog") : L("lehce", "easy");

// "91 % FTP (≈ 237 W)" or "99 % prahu (4:37 /km)".
function targetText(power, { sport, ftp, thresholdPace }) {
  const p = Math.round(n(power, 0));
  if (sport === "run") return p + L(" % prahu", " % of threshold") + (thresholdPace ? " (" + formatPace(thresholdPace * 100 / p) + " /km)" : "");
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
      const what = w.free ? minLabel(w.durationMinutes) + L(" naplno", " all-out") : minLabel(w.durationMinutes) + L(" na ", " at ") + targetText(w.ramp ? w.powerEnd : w.power, opts) + (w.ramp ? L(" (stupňuj od ", " (build from ") + Math.round(w.powerStart) + " %)" : "");
      const pause = rest.length ? L(", mezi nimi ", ", with ") + minLabel(rest.reduce((x, r) => x + n(r.durationMinutes, 0), 0)) + " " + EASY(sport) + L("", " between") : "";
      const cadence = w.cadence && sport !== "run" ? L(" při ", " at ") + String(w.cadence).replace(/rpm/i, "").trim().replace("-", "–") + " rpm" : "";
      sets.push((reps > 1 ? reps + "× " : "") + what + cadence + (reps > 1 ? pause : ""));
    } else {
      // Micro-intervals: pair each effort with the easy step after it and
      // group identical pairs ("13× 30 s na 120 % / 15 s lehce").
      const pairs = [];
      steps.forEach((st, i) => { if (!isWork(st)) return; const next = steps[i + 1] && !isWork(steps[i + 1]) && i + 2 < steps.length ? steps[i + 1] : null; pairs.push({ w: st, r: next }); });
      const groups = [];
      for (const pr of pairs) { const key = [pr.w.durationMinutes, pr.w.power, pr.w.free, pr.r?.durationMinutes].join("|"), last = groups.at(-1); if (last && last.key === key) last.count++; else groups.push({ key, count: 1, ...pr }); }
      const parts = groups.map(g => (g.count > 1 ? g.count + "× " : "") + minLabel(g.w.durationMinutes) + (g.w.free ? L(" naplno", " all-out") : L(" na ", " at ") + targetText(g.w.power, opts)) + (g.r ? " / " + minLabel(g.r.durationMinutes) + " " + EASY(sport) : ""));
      // Alternating patterns (over-unders): "4× (2 min na 88 % …, 1 min na 102 % …)".
      let text = join(parts);
      for (let k = 1; k <= parts.length / 2; k++) if (parts.length % k === 0 && parts.every((x, i) => x === parts[i % k])) { text = parts.length / k + "× (" + parts.slice(0, k).join(", ") + ")"; break; }
      const seriesRest = rest.length && !isWork(steps.at(-1)) ? L(", mezi sériemi ", ", ") + minLabel(steps.at(-1).durationMinutes) + " " + EASY(sport) + L("", " between sets") : "";
      sets.push((reps > 1 ? reps + L(" série: ", " sets: ") : "") + text + (reps > 1 ? seriesRest : ""));
    }
  }
  if (["recovery", "endurance"].includes(system)) {
    const flat = structure.flatMap(b => b.steps ? b.steps.map(st => ({ ...st, durationMinutes: n(st.durationMinutes, 0) * Math.max(1, n(b.repeats, 1)) })) : [b]);
    const main = flat.reduce((a, b) => n(b.durationMinutes, 0) > n(a?.durationMinutes, 0) ? b : a, null);
    if (main) lines.push(L("Většinu času (" + Math.round(main.durationMinutes) + " min z " + Math.round(total) + ") drž " + targetText(main.power, opts) + ".", "For most of the time (" + Math.round(main.durationMinutes) + " of " + Math.round(total) + " min) hold " + targetText(main.power, opts) + "."));
    const extras = structure.filter(b => b.steps && n(b.repeats, 1) > 1).map(b => { const x = b.steps.find(st => st.note && n(st.durationMinutes, 0) <= 5) || b.steps[0]; return b.repeats + "× " + minLabel(x.durationMinutes) + (x.note ? " " + x.note : "") + (x.cadence && sport !== "run" ? " (" + String(x.cadence).replace(/rpm/i, "").trim() + " rpm)" : ""); });
    if (extras.length) lines.push(L("Navíc ", "Plus ") + join(extras) + ".");
    const finish = flat.filter(st => n(st.power, 0) >= (sport === "run" ? 89 : 76) && n(st.durationMinutes, 0) >= 5).at(-1);
    if (finish) lines.push(L("Ke konci ", "Toward the end, ") + Math.round(finish.durationMinutes) + L(" min na ", " min at ") + targetText(finish.power, opts) + (finish.note ? " – " + finish.note : "") + ".");
    return lines;
  }
  if (sets.length) lines.push(L("Hlavní část: ", "Main set: ") + join(sets) + ".");
  if (workMinutes > 0) lines.push(L("Celkem " + Math.round(workMinutes) + " min práce v cílové intenzitě z " + Math.round(total) + " min tréninku.", Math.round(workMinutes) + " min of work at the target intensity out of " + Math.round(total) + " min in total."));
  if (maxReps >= 4) lines.push(L("První " + (maxReps >= 8 ? "2–3" : "1–2") + " opakování jeď na spodní hranici; když poslední zvládneš s rezervou, příště se obtížnost zvedne.", "Do the first " + (maxReps >= 8 ? "2–3" : "1–2") + " repeats at the lower end; if you finish the last one with something left, the difficulty goes up next time."));
  else if (longestWork >= 15) lines.push(L("Blok " + minLabel(longestWork) + " si v hlavě rozděl na třetiny: první klidně, druhá stabilně, poslední je o vůli.", "Split the " + minLabel(longestWork) + " block into thirds in your head: the first calm, the second steady, the last is about willpower."));
  return lines;
}

// Fuel for this length: grams of carbohydrate and fluid for the whole session.
function fuelTotals(minutes, rate, fluid) {
  const hours = minutes / 60;
  const gels = Math.max(1, Math.round(rate * hours / 25));
  const carbs = Math.round(rate * hours / 5) * 5, litres = (Math.round(fluid * hours * 2) / 2).toFixed(1);
  return L("Na " + Math.round(minutes) + " min počítej celkem s ~" + carbs + " g sacharidů (≈ " + gels + (gels === 1 ? " gel" : gels <= 4 ? " gely" : " gelů") + " nebo ekvivalent v pití) a ~" + litres.replace(".", ",") + " l tekutin.", "For " + Math.round(minutes) + " min, plan on ~" + carbs + " g of carbs in total (≈ " + gels + (gels === 1 ? " gel" : " gels") + " or the equivalent in drinks) and ~" + litres + " l of fluids.");
}

// Where to ride/run it, from the longest uninterrupted effort.
function terrainLine(structure, { sport, environment, system }) {
  if (environment !== "outdoor" || ["recovery", "endurance"].includes(system)) return null;
  const from = (WORK_FROM[sport] || WORK_FROM.ride)[system] ?? 999;
  const longest = Math.max(0, ...structure.flatMap(b => b.steps || [b]).filter(st => n(st.power, 0) >= from).map(st => n(st.durationMinutes, 0)));
  if (!longest) return null;
  return sport === "run" ? L("Najdi úsek na " + minLabel(longest) + " souvislého běhu bez přechodů a zastavení.", "Find a stretch for " + minLabel(longest) + " of continuous running without crossings or stops.") : L("Najdi silnici nebo stoupání na " + minLabel(longest) + " nerušené jízdy – bez semaforů a křižovatek.", "Find a road or climb for " + minLabel(longest) + " of uninterrupted riding – no traffic lights or junctions.");
}

function fueling(minutes, system) {
  const hard = ["sweet_spot", "threshold", "vo2max", "anaerobic"].includes(system);
  if (minutes <= 75) return hard ? [L("Před jízdou lehké sacharidové jídlo; během jízdy se u intenzity hodí 30–40 g sacharidů/h.", "A light carb meal before the ride; 30–40 g of carbs/h during the ride helps with intensity."), L("Pití 500–750 ml/h, po jízdě bílkoviny a sacharidy.", "Drink 500–750 ml/h; protein and carbs after the ride.")] : [L("Stačí voda nebo iontový nápoj; při jízdě nalačno drž opravdu nízkou intenzitu.", "Water or a sports drink is enough; if you ride fasted, keep the intensity truly low."), L("Pití 500–750 ml/h.", "Drink 500–750 ml/h.")];
  if (minutes <= 150) return [L("60 g sacharidů/h (gel, tyčinka, iontový nápoj) – začni v první půlhodině.", "60 g of carbs/h (gel, bar, sports drink) – start within the first half hour."), L("Pití 500–750 ml/h, v teple víc a se solí.", "Drink 500–750 ml/h, more and with salt in the heat.")];
  return [L("80–90 g sacharidů/h (kombinace glukózy a fruktózy), jez pravidelně každých 20–30 min.", "80–90 g of carbs/h (a glucose and fructose mix); eat regularly every 20–30 min."), L("Pití 600–900 ml/h se sodíkem 500–1000 mg/l.", "Drink 600–900 ml/h with 500–1000 mg/l of sodium."), L("Nech si jídlo i na konec jízdy – kvalita je vložená mezi aerobní bloky.", "Save food for the end of the ride too – the quality work sits between aerobic blocks.")];
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

// Without watts, pace or heart rate an easy session is steered by breathing.
const TALK_TEST = () => L("Bez měřiče se řiď dechem: jeď nebo běž tak, abys zvládl mluvit v celých větách (námaha 2–4 z 10). Když mluvíš jen po slovech, zpomal.", "Without a meter, go by your breathing: ride or run so that you can talk in full sentences (effort 2–4 out of 10). If you can only get out single words, slow down.");

// Where the heart-rate zone comes from, in words.
function hrReference(model, lthr) {
  if (model === "karvonen") return L("Z2 z tepové rezervy, max. a klidový tep z profilu", "Z2 from heart rate reserve, max and resting heart rate from your profile");
  if (model === "hrMax5") return L("Z2 ze 70 % max. tepu", "Z2 from 70 % of max heart rate");
  return lthr ? L("Z2 z LTHR ", "Z2 from LTHR ") + lthr : "Z2";
}

export function explainWorkout(workout, { coach = {}, environment = "indoor", thresholds = {}, planned = null, sport = workout.sport || "ride" } = {}) {
  let structure = [];
  try { structure = JSON.parse(workout.structure_json || "[]"); } catch {}
  const system = workout.primary_system, minutes = n(workout.duration_minutes, 0);
  if (sport === "run") return explainRun(workout, structure, { coach, environment, thresholds, planned, system, minutes });
  const { ftp, estimated } = rideFtpFor(thresholds, environment);
  const why = [...(coach.rationale || []), ...readinessLines(coach)];
  const p = coach.recommendation?.progression;
  if (p && ["recovery", "endurance"].includes(system)) why.push(system === "recovery" ? L("Regenerační jízda: cílem je zotavení, ne progres – intenzita zůstává v Z1.", "Recovery ride: the goal is recovery, not progress – intensity stays in Z1.") : L("Aerobní jízda: staví základ a nezvyšuje únavu; obtížnost se řídí délkou, ne intenzitou.", "Aerobic ride: builds your base without adding fatigue; difficulty comes from duration, not intensity."));
  else if (p) why.push(progressLine(p, workout, SYSTEM_LABELS()));
  if (!coach.rationale?.length && !planned) why.push(L("Na tento den nemáš nic v plánu, proto vybírám podle zátěže posledních dní a tvé úrovně.", "You have nothing planned for this day, so I'm choosing based on your recent load and your level."));
  const how = [...structureHow(structure, { system, sport: "ride", ftp }), ...(HOW()[system] || HOW().endurance).slice(0, 2)];
  const source = { manual: L(" (nastaveno v aplikaci)", " (set in the app)"), "latest-ride": L(" (z poslední jízdy)", " (from your latest ride)") }[thresholds.source] || L(" (z Intervals.icu)", " (from Intervals.icu)");
  if (ftp && estimated) how.unshift(L("Na trenažéru počítám watty z indoor FTP " + ftp + " W – odhad 95 % z tvého FTP " + thresholds.ftp + " W, protože indoor se stejný výkon drží hůř. Vlastní indoor FTP nastavíš v Intervals.icu.", "On the trainer I calculate watts from an indoor FTP of " + ftp + " W – an estimate of 95 % of your FTP of " + thresholds.ftp + " W, because the same power is harder to hold indoors. You can set your own indoor FTP in Intervals.icu."));
  else if (ftp) how.unshift(L("Watty počítám z tvého " + (environment === "indoor" && thresholds.indoorFtp ? "indoor " : "") + "FTP " + ftp + " W", "I calculate watts from your " + (environment === "indoor" && thresholds.indoorFtp ? "indoor " : "") + "FTP of " + ftp + " W") + source + ".");
  else how.unshift(L("FTP neznám – cíle jsou v % FTP. Zadej nebo spočítej FTP v Nastavení → FTP a zóny.", "I don't know your FTP – targets are in % FTP. Enter or calculate your FTP in Settings → FTP and zones."));
  // Without FTP an easy ride is steered by heart rate.
  const rideZ2 = (thresholds.hrZones || []).find(z => z.zone === 2);
  if (!ftp && ["recovery", "endurance"].includes(system) && rideZ2?.bpmHigh) how.push(L("Tep drž do ", "Keep your heart rate under ") + rideZ2.bpmHigh + " bpm (" + hrReference(thresholds.hrModel, thresholds.lthr) + ").");
  else if (!ftp && ["recovery", "endurance"].includes(system)) how.push(TALK_TEST());
  return {
    title: SYSTEM_LABELS()[system] || system,
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
    const hours = (r.sleepMinutes / 60).toFixed(1);
    const bits = [r.sleepMinutes ? L("spánek " + hours.replace(".", ",") + " h", "sleep " + hours + " h") : null, r.tsb != null && Number.isFinite(Number(r.tsb)) ? L("forma (TSB) ", "form (TSB) ") + Math.round(r.tsb) : null, ...(r.reasons || []).slice(0, 2)].filter(Boolean);
    out.push(L("Připravenost ", "Readiness ") + (r.score ?? "—") + "/100 (" + (L({ green: "dobrá", yellow: "střední", red: "nízká" }, { green: "good", yellow: "moderate", red: "low" })[r.status] || r.status) + ")" + (bits.length ? ": " + bits.join(", ") : "") + ".");
  }
  for (const a of coach.recommendation?.adaptations || []) out.push(L("Úprava: ", "Adjustment: ") + a + ".");
  return out;
}
function progressLine(p, workout, labels) {
  const f = v => { const s = Number(v).toFixed(1); return L(s.replace(".", ","), s); };
  return L("Tvoje úroveň v typu " + (labels[p.system] || p.system) + " je " + f(p.capabilityLevel) + "; dnes cílím na obtížnost " + f(p.targetDifficulty) + " a tento trénink má " + f(workout.difficulty) + ".", "Your " + (labels[p.system] || p.system) + " level is " + f(p.capabilityLevel) + "; today I'm targeting difficulty " + f(p.targetDifficulty) + " and this workout is " + f(workout.difficulty) + ".");
}

function explainRun(workout, structure, { coach, environment, thresholds, planned, system, minutes }) {
  const pace = thresholds.runThresholdPace || null;
  const why = [...(coach.rationale || []), ...readinessLines(coach)];
  const p = coach.recommendation?.progression;
  if (p && ["recovery", "endurance"].includes(system)) why.push(system === "recovery" ? L("Regenerační běh: cílem je zotavení, ne progres.", "Recovery run: the goal is recovery, not progress.") : L("Lehký běh staví aerobní základ a odolnost nohou; obtížnost se řídí délkou, ne tempem.", "An easy run builds your aerobic base and durable legs; difficulty comes from duration, not pace."));
  else if (p) why.push(progressLine(p, workout, RUN_LABELS()));
  if (!coach.rationale?.length && !planned) why.push(L("Na tento den nemáš v plánu žádný běh, proto vybírám podle běhů posledních dní a tvé úrovně.", "You have no run planned for this day, so I'm choosing based on your recent runs and your level."));
  const how = [...structureHow(structure, { system, sport: "run", thresholdPace: pace }), ...(RUN_HOW()[system] || RUN_HOW().endurance).slice(0, 2)];
  if (pace) how.unshift(L("Tempa počítám z tvého prahového tempa ", "I calculate paces from your threshold pace of ") + formatPace(pace) + " /km" + ({ manual: L(" (nastaveno v aplikaci)", " (set in the app)") }[thresholds.runPaceSource] || L(" (z Intervals.icu)", " (from Intervals.icu)")) + ".");
  else how.unshift(L("Prahové tempo neznám – cíle jsou v % prahového tempa. Zadej nebo spočítej ho v Nastavení → FTP a zóny → Běh.", "I don't know your threshold pace – targets are in % of threshold pace. Enter or calculate it in Settings → FTP and zones → Run."));
  const lthr = thresholds.runLthr;
  const hrZ2 = (thresholds.runHrZones || []).find(z => z.zone === 2);
  if (["recovery", "endurance"].includes(system) && hrZ2?.bpmHigh) how.push(L("Tep drž do ", "Keep your heart rate under ") + hrZ2.bpmHigh + " bpm (" + hrReference(thresholds.runHrModel, lthr) + ").");
  else if (["recovery", "endurance"].includes(system) && !pace) how.push(TALK_TEST());
  const opts = { environment, zones: thresholds.paceZones, sport: "run", thresholdPace: pace };
  return {
    title: RUN_LABELS()[system] || system,
    why, how,
    environment: [terrainLine(structure, { sport: "run", environment, system }), ...(workout.environment_notes || [])].filter(Boolean),
    fueling: [...runFueling(minutes, system), ...(minutes > 90 ? [fuelTotals(minutes, 45, .6)] : [])],
    ftp: null, thresholdPace: pace, thresholdPaceFormatted: formatPace(pace), paceSource: thresholds.runPaceSource || null,
    steps: stepRows(structure, opts),
    planned: planned ? { name: planned.name, minutes: planned.minutes, system: planned.system, intensityFactor: planned.intensityFactor, steps: stepRows(planned.structure || [], { ...opts, environment: "indoor" }) } : null
  };
}
