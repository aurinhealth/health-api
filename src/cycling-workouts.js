// Cycling workout catalog: original PFD families with progression ladders,
// published research protocols and publicly described pro sessions. All
// intensities are % FTP. Proprietary libraries (TrainerRoad, Xert, JOIN,
// Zwift…) are not copied; the families cover the same energy systems with
// independent structures.
import { buildWorkout, step, ramp, rep, sec, totalMinutes } from "./workout-model.js";

const WU15 = [step(15, 58, "90", "progresivně")];
const CD10 = [step(10, 50, "90", "lehce")];
const OPENERS = [step(12, 58, "90", "progresivně"), rep(3, [step(sec(30), 110, "100"), step(sec(90), 55)])];
const easy = (minutes, power = 52) => step(minutes, power, "90", "lehce");
const allOut = (seconds, estimate, cadence, note = "naplno, bez cílových wattů; ERG vypnout") => ({ ...step(sec(seconds), estimate, cadence, note), free: true });

// Core interval sets. Each family returns the core blocks for one ladder level.
const blocks = (reps, minutes, power, restMinutes, cadence, restPower = 55) => rep(reps, [step(minutes, power, cadence), easy(restMinutes, restPower)]);

const FAMILIES = [
  // ---- tempo -------------------------------------------------------------
  { key: "tempo", system: "tempo", label: l => `Tempo ${l[0]}×${l[1]}`, cadence: "85–95 rpm",
    levels: [[2, 10], [2, 15], [3, 12], [2, 20], [3, 15], [2, 25], [3, 20], [2, 30], [1, 60], [3, 25], [2, 40], [2, 45]],
    core: ([r, m]) => [blocks(r, m, 84, 5, "85-95")], desc: "Kontrolovaná tempo práce pro aerobní výkon a svalovou vytrvalost." },
  { key: "tempo-surges", system: "tempo", secondary: "anaerobic", label: l => `Tempo se zrychleními ${l[0]}×${l[1] * 2}`, cadence: "85–95 rpm",
    levels: [[2, 6], [2, 8], [3, 7], [2, 12], [3, 10]],
    core: ([r, m]) => [rep(r, [...Array.from({ length: m }, () => [step(1 + sec(50), 84, "88-92"), step(sec(10), 150, "105")]).flat(), easy(5)])],
    desc: "Tempo bloky s 10s zrychlením každé 2 minuty – simuluje nástupy ve skupině." },
  { key: "tempo-force", system: "tempo", secondary: "sweet_spot", label: l => `Silová vytrvalost ${l[0]}×${l[1]} @ 60 rpm`, cadence: "55–65 rpm v blocích",
    levels: [[3, 8], [3, 10], [4, 10], [3, 15], [4, 12]],
    core: ([r, m]) => [rep(r, [step(m, 82, "55-65", "nízká kadence"), easy(5)])], desc: "Nízká kadence pod pražcem pro sílu v pedálu a stoupání." },
  // ---- sweet spot --------------------------------------------------------
  { key: "ss", system: "sweet_spot", secondary: "threshold", label: l => `Sweet Spot ${l[0]}×${l[1]}`, cadence: "88–95 rpm",
    levels: [[3, 8], [3, 10], [2, 15], [3, 12], [2, 20], [3, 15], [4, 12], [2, 25], [3, 20], [2, 30], [1, 60], [4, 20]],
    core: ([r, m]) => [blocks(r, m, 91, m >= 20 ? 6 : 5, "88-95")], desc: "Nejefektivnější poměr stimulu a únavy pro FTP." },
  { key: "ss-bursts", system: "sweet_spot", secondary: "anaerobic", label: l => `Sweet Spot s nástupy ${l[0]}×${l[1] * 3}`, cadence: "88–95 rpm",
    levels: [[3, 3], [3, 4], [2, 6], [3, 5], [3, 6]],
    core: ([r, m]) => [rep(r, [...Array.from({ length: m }, () => [step(2 + sec(45), 90, "88-94"), step(sec(15), 130, "100-110")]).flat(), easy(5)])],
    desc: "Sweet spot s 15s nástupem každé 3 minuty – odolnost proti změnám tempa." },
  { key: "ss-over-under", system: "sweet_spot", secondary: "threshold", label: l => `Over-Under ${l[0]}×${l[1] * 3} (88/102)`, cadence: "88–95 rpm",
    levels: [[3, 3], [3, 4], [4, 4], [3, 5], [4, 5]],
    core: ([r, m]) => [rep(r, [...Array.from({ length: m }, () => [step(2, 88, "88-94"), step(1, 102, "92-98")]).flat(), easy(5)])],
    desc: "Střídání pod a nad prahem – učí zpracovávat laktát v tempu." },
  // ---- threshold ---------------------------------------------------------
  { key: "thr", system: "threshold", label: l => `Threshold ${l[0]}×${l[1]}`, cadence: "90–95 rpm",
    levels: [[4, 6], [3, 8], [3, 10], [4, 8], [2, 15], [3, 12], [4, 10], [2, 20], [3, 15], [2, 25], [3, 20], [2, 30]],
    core: ([r, m]) => [blocks(r, m, 98, m >= 15 ? 7 : 5, "90-95")], desc: "Práce na FTP – prodlužování času na prahu." },
  { key: "thr-over-under", system: "threshold", secondary: "vo2max", label: l => `Threshold Over-Under ${l[0]}×${l[1] * 3} (95/105)`, cadence: "90–95 rpm",
    levels: [[2, 3], [3, 3], [3, 4], [2, 6], [3, 5]],
    core: ([r, m]) => [rep(r, [...Array.from({ length: m }, () => [step(2, 95, "90-95"), step(1, 105, "95-100")]).flat(), easy(6)])],
    desc: "Nad-pod prahem – závodní změny tempa bez odpočinku." },
  { key: "thr-progressive", system: "threshold", label: l => `Progresivní threshold ${l[0]}×${l[1]}`, cadence: "90–95 rpm",
    levels: [[3, 8], [3, 10], [2, 15], [3, 12], [2, 20]],
    core: ([r, m]) => [rep(r, [ramp(m, 93, 104, "90-95", "postupně zvyšuj"), easy(5)])], desc: "Každý blok začíná pod prahem a končí nad ním." },
  { key: "thr-hard-start", system: "threshold", secondary: "anaerobic", label: l => `Threshold s ostrým startem ${l[0]}×${l[1]}`, cadence: "90–100 rpm",
    levels: [[4, 5], [4, 6], [3, 8], [4, 8], [3, 10]],
    core: ([r, m]) => [rep(r, [step(sec(30), 130, "100-110", "nástup"), step(m - .5, 98, "90-95"), easy(5)])], desc: "Nástup nad VO₂ a pak držet práh – typická únik/stoupání situace." },
  { key: "thr-late", system: "threshold", placement: "late", label: l => `Práh v závěru 2×${l[0]}`, cadence: "90–95 rpm",
    levels: [[8], [10], [12], [15]], core: ([m]) => [blocks(2, m, 98, 3, "90-95")],
    desc: "Nejprve souvislá Z2, potom prahové úseky v závěru. Nácvik závěrečného stoupání v únavě." },
  { key: "thr-split", system: "threshold", placement: "split", label: l => `Dvě stoupání ${l[0]} + ${l[1]} min`, cadence: "90–95 rpm",
    levels: [[8, 10], [10, 12], [12, 15], [15, 20]],
    core: ([a, b]) => [rep(1, [step(a, 98, "90-95", "první stoupání"), easy(3)]), rep(1, [step(b, 100, "90-95", "druhé stoupání po Z2"), easy(3)])],
    desc: "Dva prahové bloky oddělené delší jízdou v Z2. Druhé stoupání přijde až v druhé části tréninku." },
  { key: "thr-race-finish", system: "threshold", placement: "split", label: l => `Závodní závěr ${l[0]} + ${l[1]} min`, cadence: "90–100 rpm",
    levels: [[8, 10], [10, 12], [12, 15]],
    core: ([a, b]) => [rep(1, [step(a, 96, "90-95", "kontrolovaný první blok"), easy(3)]), rep(1, [ramp(b, 98, 105, "90-100", "závěrečné stoupání, postupně zvyšuj"), easy(2)])],
    desc: "Práh na začátku, Z2 uprostřed a stupňovaný závěrečný blok. Simulace závodního finiše bez maximálního sprintu." },
  // ---- VO2max ------------------------------------------------------------
  { key: "vo2", system: "vo2max", label: l => `VO₂ ${l[0]}×${l[1]}`, cadence: "95–105 rpm", warmup: OPENERS,
    levels: [[5, 2, 120], [6, 2, 120], [8, 2, 118], [5, 3, 115], [6, 3, 115], [4, 4, 112], [5, 4, 112], [6, 4, 110], [4, 5, 110], [5, 5, 108], [4, 6, 108], [5, 6, 106]],
    core: ([r, m, p]) => [blocks(r, m, p, m, "95-105", 50)], desc: "Klasické VO₂max intervaly s odpočinkem 1:1." },
  { key: "vo2-30-30", system: "vo2max", secondary: "anaerobic", label: l => `VO₂ 30/30 ${l[0]}×${l[1]}`, cadence: "100–110 rpm", warmup: OPENERS,
    levels: [[2, 8], [3, 8], [3, 10], [4, 10], [3, 12]],
    core: ([r, m]) => [rep(r, [...Array.from({ length: m }, () => [step(sec(30), 125, "100-110"), step(sec(30), 55)]).flat(), easy(5)])],
    desc: "Krátké 30s úseky – hodně času u VO₂max s nízkou mechanickou cenou." },
  { key: "vo2-40-20", system: "vo2max", secondary: "threshold", label: l => `VO₂ 40/20 ${l[0]}×${l[1]}`, cadence: "95–105 rpm", warmup: OPENERS,
    levels: [[2, 8], [3, 8], [3, 10], [3, 12], [4, 10]],
    core: ([r, m]) => [rep(r, [...Array.from({ length: m }, () => [step(sec(40), 120, "95-105"), step(sec(20), 60)]).flat(), easy(5)])],
    desc: "40/20 bloky – rychle dostanou VO₂ nahoru a drží ho." },
  { key: "vo2-hard-start", system: "vo2max", secondary: "anaerobic", label: l => `VO₂ s ostrým startem ${l[0]}×4`, cadence: "95–110 rpm", warmup: OPENERS,
    levels: [[4], [5], [6]],
    core: ([r]) => [rep(r, [step(sec(30), 135, "105-110", "nástup"), step(3.5, 110, "95-105"), easy(4, 50)])], desc: "Rychlý nástup urychlí příjem kyslíku; zbytek úseku drží VO₂." },
  { key: "vo2-pyramid", system: "vo2max", label: l => `VO₂ pyramida ${l.join("-")}`, cadence: "95–105 rpm", warmup: OPENERS,
    levels: [[1, 2, 3, 2, 1], [1, 2, 3, 4, 3, 2, 1], [2, 3, 4, 4, 3, 2]],
    core: l => [rep(1, l.flatMap(m => [step(m, m <= 2 ? 118 : m === 3 ? 114 : 110, "95-105"), easy(m, 50)]))], desc: "Pyramida délek – mentálně snazší a pestrá VO₂ jednotka." },
  { key: "vo2-late", system: "vo2max", placement: "late", label: l => `VO₂ závěrečná stoupání ${l[0]}×3`, cadence: "95–105 rpm", warmup: OPENERS,
    levels: [[3], [4], [5]], core: ([r]) => [blocks(r, 3, 115, 3, "95-105", 50)],
    desc: "Aerobní první část a tříminutová VO₂ stoupání až v závěru. Udrž stejný kontrolovaný výkon ve všech úsecích." },
  // ---- anaerobic ---------------------------------------------------------
  { key: "ana-1min", system: "anaerobic", secondary: "vo2max", label: l => `Anaerobní ${l[0]}×1 min`, cadence: "100–110 rpm", warmup: OPENERS,
    levels: [[6], [8], [10], [12]], core: ([r]) => [blocks(r, 1, 135, 3, "100-110", 50)], desc: "Minutové úseky nad VO₂ – anaerobní kapacita." },
  { key: "ana-2min", system: "anaerobic", secondary: "vo2max", label: l => `Anaerobní ${l[0]}×2 min`, cadence: "95–105 rpm", warmup: OPENERS,
    levels: [[4], [5], [6]], core: ([r]) => [blocks(r, 2, 125, 5, "95-105", 50)], desc: "Dvouminutové úseky – tolerance laktátu." },
  { key: "ana-45-15", system: "anaerobic", secondary: "vo2max", label: l => `Anaerobní 45/15 ${l[0]}×${l[1]}`, cadence: "100–110 rpm", warmup: OPENERS,
    levels: [[2, 6], [3, 6], [3, 8]], core: ([r, m]) => [rep(r, [...Array.from({ length: m }, () => [step(sec(45), 130, "100-110"), step(sec(15), 50)]).flat(), easy(6, 50)])],
    desc: "Téměř bez odpočinku nad prahem – závodní specifika pro krátká stoupání." },
  { key: "ana-late-attacks", system: "anaerobic", placement: "late", label: l => `Závěrečné nástupy ${l[0]}×45 s`, cadence: "100–110 rpm", warmup: OPENERS,
    levels: [[4], [6], [8]], core: ([r]) => [blocks(r, .75, 145, 4.25, "100-110", 50)],
    desc: "45s nástupy v závěru s dlouhou regenerací. Anaerobní kapacita a opakovatelnost útoků, předepsaný výkon místo sprintu naplno." },
  // ---- sprint ------------------------------------------------------------
  { key: "sprint-10", system: "sprint", label: l => `Sprinty ${l[0]}×10 s`, cadence: "110–125 rpm", warmup: OPENERS,
    levels: [[6], [8], [10], [12]], core: ([r]) => [rep(r, [allOut(10, 200, "110-125"), easy(4 + sec(50), 55)])], desc: "Neuromuskulární sprinty s plnou regenerací – kvalita před kvantitou." },
  { key: "sprint-standing", system: "sprint", label: l => `Sprinty z místa ${l[0]}×15 s`, cadence: "start 50 → 110 rpm", warmup: OPENERS,
    levels: [[6], [8], [10]], core: ([r]) => [rep(r, [allOut(15, 190, "50-110", "naplno z nízké rychlosti, těžký převod; ERG vypnout"), easy(5 - sec(15), 55)])], desc: "Rozjezdy z nízké rychlosti pro sílu a točivý moment." },
  { key: "sprint-20", system: "sprint", secondary: "anaerobic", label: l => `Sprinty ${l[0]}×20 s`, cadence: "105–120 rpm", warmup: OPENERS,
    levels: [[5], [6], [8]], core: ([r]) => [rep(r, [allOut(20, 170, "105-120"), easy(5, 55)])], desc: "Delší sprint – finiš a nástupy; s 20s délkou roste i anaerobní podíl." },
  { key: "sprint-late", system: "sprint", placement: "late", label: l => `Sprinty v závěru ${l[0]}×10 s`, cadence: "110–125 rpm", warmup: OPENERS,
    levels: [[4], [6], [8]], core: ([r]) => [rep(r, [allOut(10, 200, "110-125", "maximální finiš, bez cílových wattů; ERG vypnout"), easy(4 + sec(50), 55)])],
    desc: "Z2 a krátké maximální finiše v poslední části jízdy. Mezi sprinty plná regenerace, cílem je špičkový výkon." }
];

const ENDURANCE = [
  { key: "z2", label: "Endurance", desc: "Stabilní Z2 – aerobní základ a objem.", core: m => [step(m, 69, "85-95")] },
  { key: "z2-cadence", label: "Endurance s kadenčními drily", desc: "Z2 s krátkými úseky vysoké kadence pro efektivitu šlapání.",
    core: m => { const k = Math.max(1, Math.floor(m / 20)); return [rep(k, [step(17, 68, "85-95"), step(1, 72, "110-120", "vysoká kadence"), step(2, 66, "90")]), ...(m - k * 20 > 0 ? [step(m - k * 20, 68, "85-95")] : [])]; } },
  { key: "z2-force", label: "Endurance se silovými úseky", desc: "Z2 s 5min úseky v nízké kadenci.",
    core: m => { const k = Math.min(6, Math.max(2, Math.floor(m / 25))); return [rep(k, [step(5, 76, "55-65", "nízká kadence"), step(Math.max(5, Math.floor((m - k * 5) / k)), 68, "85-95")])]; } },
  { key: "z2-progressive", label: "Progresivní endurance", desc: "Tři bloky se stoupající intenzitou 65 → 72 → 78 %.",
    core: m => { const t = Math.round(m / 3); return [step(t, 65, "85-95"), step(t, 72, "85-95"), step(m - 2 * t, 78, "85-95")]; } },
  { key: "z2-durability", label: "Durability – tempo na konci", desc: "Dlouhá Z2 a tempo blok na konci, kdy je únava nejvyšší.", minTotal: 120, secondary: "tempo",
    core: m => { const tempo = Math.min(40, Math.round(m * .2)); return [step(m - tempo - 5, 68, "85-95"), step(tempo, 85, "88-92", "tempo v únavě"), easy(5, 60)]; } }
];

const TOTALS = { tempo: [60, 75, 90, 105, 120, 150, 180, 240], sweet_spot: [60, 75, 90, 105, 120, 150, 180, 240], threshold: [60, 75, 90, 105, 120, 150, 180], vo2max: [45, 60, 75, 90, 105, 120, 150, 180], anaerobic: [45, 60, 75, 90, 120], sprint: [45, 60, 75, 90, 120] };

// Families prescribe the placement of quality, including late race efforts
// and separate climbs with an aerobic section between them.
function session(core, total, family) {
  const warm = family.warmup || WU15;
  const used = totalMinutes([...warm, ...core, ...CD10]);
  const fill = Math.round((total - used) * 10) / 10;
  if (fill < 0 || (fill > 0 && fill < 3)) return null;
  if (family.placement && fill < 15) return null;
  const structure = [...warm];
  const early = family.placement === "late" ? fill : family.placement === "split" ? 0 : total >= 150 ? Math.round(fill * .5) : 0;
  if (early > 0) structure.push(step(early, 67, "85-95", "aerobní blok"));
  if (family.placement === "split") structure.push(core[0], step(fill, 67, "85-95", "Z2 mezi stoupáními"), ...core.slice(1));
  else {
    structure.push(...core);
    if (fill - early > 0) structure.push(step(Math.round((fill - early) * 10) / 10, 65, "85-95", "aerobní dojezd"));
  }
  structure.push(...CD10);
  return structure;
}

function buildFamilyWorkouts() {
  const out = [];
  for (const f of FAMILIES) {
    f.levels.forEach((level, index) => {
      const core = f.core(level);
      for (const total of TOTALS[f.system]) {
        const structure = session(core, total, f);
        if (!structure) continue;
        out.push(buildWorkout({
          id: `pfd-${f.key}-${level.join("x")}-${total}`, name: `${f.label(level)} · ${total} min`, system: f.system, secondarySystem: f.secondary || null,
          structure, family: f.key, level: index + 1, cadence: f.cadence, tags: ["pfd-original", f.key, `${total}min`, ...(f.placement ? [f.placement + "-quality"] : [])],
          description: f.desc + (total >= 150 && !f.placement ? " Kvalita je vložená mezi aerobní bloky – vyžaduje palivo na cestu." : "")
        }));
      }
    });
  }
  for (const e of ENDURANCE) {
    for (const total of [45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360]) {
      if (total < (e.minTotal || 0)) continue;
      const main = total - 20;
      const structure = [step(10, 55, "90", "rozjetí"), ...e.core(main), easy(10, 50)];
      out.push(buildWorkout({ id: `pfd-${e.key}-${total}`, name: `${e.label} · ${total} min`, system: "endurance", secondarySystem: e.secondary || null, structure, family: e.key, cadence: "85–95 rpm", tags: ["pfd-original", e.key, `${total}min`], description: e.desc }));
    }
  }
  for (const total of [30, 45, 60]) {
    out.push(buildWorkout({ id: `pfd-recovery-${total}`, name: `Recovery · ${total} min`, system: "recovery", structure: [easy(5, 48), step(total - 10, 52, "85-95"), easy(5, 48)], family: "recovery", tags: ["pfd-original", "recovery"], description: "Velmi lehké protočení nohou po těžkém dni." }));
    out.push(buildWorkout({ id: `pfd-recovery-spinups-${total}`, name: `Recovery se spin-upy · ${total} min`, system: "recovery", structure: [easy(8, 48), rep(Math.max(2, Math.floor((total - 16) / 6)), [step(sec(30), 55, "110-120", "vysoká kadence, lehce"), step(5.5, 50, "85-95")]), easy(8, 48)], family: "recovery-spinups", tags: ["pfd-original", "recovery"], description: "Regenerace s krátkými lehkými spin-upy pro svěží nohy." }));
  }
  return out;
}

// Published research protocols – the prescription is taken from the paper,
// sessions are wrapped into a standard warm-up and cool-down.
const RESEARCH = [
  { id: "research-ronnestad-30-15", name: "Rønnestad 30/15 · 3×13", system: "vo2max", secondary: "anaerobic",
    core: [rep(3, [...Array.from({ length: 13 }, () => [step(sec(30), 120, "100-110"), step(sec(15), 55)]).flat(), easy(3, 50)])],
    citation: "Rønnestad BR, Hansen J, Vegge G, Tønnessen E, Slettaløkken G. Short intervals induce superior training adaptations compared with long intervals in cyclists. Scand J Med Sci Sports. 2015;25:143–151.",
    description: "3 série 13× 30 s / 15 s s 3 min mezi sériemi – ve studii lepší adaptace než 4×5 min." },
  { id: "research-seiler-4x8", name: "Seiler 4×8 min", system: "threshold", secondary: "vo2max",
    core: [blocks(4, 8, 104, 2, "90-100", 50)],
    citation: "Seiler S, Jøranson K, Olesen BV, Hetlelid KJ. Adaptations to aerobic interval training: interactive effects of exercise intensity and total work duration. Scand J Med Sci Sports. 2013;23:74–83.",
    description: "4× 8 min s 2 min pauzou – ve studii nejlepší poměr intenzity a objemu práce." },
  { id: "research-helgerud-4x4", name: "Norský 4×4", system: "vo2max",
    core: [blocks(4, 4, 112, 3, "95-105", 60)],
    citation: "Helgerud J, et al. Aerobic high-intensity intervals improve VO2max more than moderate training. Med Sci Sports Exerc. 2007;39(4):665–671.",
    description: "4× 4 min při 90–95 % max. tepu, 3 min aktivní pauza – klasický protokol pro VO₂max." },
  { id: "research-billat-30-30", name: "Billat 30-30", system: "vo2max", secondary: "anaerobic",
    core: [rep(2, [...Array.from({ length: 10 }, () => [step(sec(30), 125, "100-110"), step(sec(30), 60)]).flat(), easy(5, 50)])],
    citation: "Billat VL, et al. Intermittent runs at the velocity associated with maximal oxygen uptake enables subjects to remain at maximal oxygen uptake for a longer time than intense but submaximal runs. Eur J Appl Physiol. 2000;81:188–196.",
    description: "30 s na úrovni VO₂max / 30 s lehce – původně běžecký protokol, zde upravený pro kolo." },
  { id: "research-tabata", name: "Tabata 2×8 × 20/10", system: "anaerobic", secondary: "vo2max", indoorOnly: true,
    core: [rep(2, [...Array.from({ length: 8 }, () => [step(sec(20), 170, "105-115"), step(sec(10), 50)]).flat(), easy(8, 50)])],
    citation: "Tabata I, et al. Effects of moderate-intensity endurance and high-intensity intermittent training on anaerobic capacity and VO2max. Med Sci Sports Exerc. 1996;28(10):1327–1330.",
    description: "8× 20 s na ~170 % VO₂max / 10 s pauza. Vhodné na trenažér v režimu odporu." },
  { id: "research-sit-4-6x30", name: "Sprint interval 6×30 s", system: "anaerobic", secondary: "sprint",
    core: [rep(6, [allOut(30, 175, "100-120"), easy(4, 50)])],
    citation: "Burgomaster KA, et al. Six sessions of sprint interval training increases muscle oxidative potential and cycle endurance capacity in humans. J Appl Physiol. 2005;98:1985–1990.",
    description: "4–6× 30 s naplno (Wingate) se 4 min pauzou – vysoká kvalita za krátký čas." }
];

function buildResearchWorkouts() {
  return RESEARCH.map(r => buildWorkout({
    id: r.id, name: r.name, system: r.system, secondarySystem: r.secondary || null,
    structure: [...OPENERS, ...r.core, ...CD10], family: r.id, sourceName: "Publikovaný výzkum", sourceKind: "research",
    licenseNote: "Protokol převzatý z publikované studie; intenzita přepočtená na % FTP.", citation: r.citation, attribution: r.citation,
    indoorOnly: r.indoorOnly === true, tags: ["research"], description: r.description
  }));
}

const PUBLIC_REFERENCES = [
  buildWorkout({id:"public-uae-torque-bursts",name:"UAE-style Torque Bursts · scaled",sourceName:"Cycling Weekly · UAE training feature",sourceKind:"public_reference",sourceUrl:"https://www.cyclingweekly.com/fitness/training/how-tadej-pogacar-and-uae-team-emirates-train-to-be-the-1-team-in-cycling",licenseNote:"Publicly described workout principle; this is an independently scaled implementation.",attribution:"Public training feature describing UAE Team Emirates-XRG torque work.",system:"vo2max",secondarySystem:"sprint",structure:[...WU15,rep(7,[step(4,70,"85-90"),step(.5833,130,"50"),step(.25,170,"110-125"),step(3.1667,68,"90")]),step(10,65),...CD10],tags:["pro-inspired","uae","torque","sprint"],description:"Scaled implementation of a publicly described torque-burst concept; not an internal UAE workout.",cadence:"mixed"}),
  buildWorkout({id:"public-uae-40-20",name:"UAE-style 40/20 Over-Unders",sourceName:"Cycling Weekly · UAE training feature",sourceKind:"public_reference",sourceUrl:"https://www.cyclingweekly.com/fitness/training/how-tadej-pogacar-and-uae-team-emirates-train-to-be-the-1-team-in-cycling",licenseNote:"Publicly described workout principle; implementation normalized for this app.",attribution:"Public feature describing 3×8 min 40/20 over-unders.",system:"vo2max",secondarySystem:"threshold",structure:[...WU15,rep(3,[step(.6667,115,"95-105"),step(.3333,85,"90-95"),step(.6667,115,"95-105"),step(.3333,85,"90-95"),step(.6667,115,"95-105"),step(.3333,85,"90-95"),step(.6667,115,"95-105"),step(.3333,85,"90-95"),step(.6667,115,"95-105"),step(.3333,85,"90-95"),step(.6667,115,"95-105"),step(.3333,85,"90-95"),step(.6667,115,"95-105"),step(.3333,85,"90-95"),step(.6667,115,"95-105"),step(.3333,85,"90-95"),step(6,55)]),step(11,65),...CD10],tags:["pro-inspired","uae","40-20","over-under"],description:"Amateur-scaled version of publicly described UAE-style 40/20 over-unders.",cadence:"90–105 rpm"}),
  buildWorkout({id:"public-uae-steady-torque",name:"UAE-style 3×10 Steady Torque",sourceName:"Cycling Weekly · UAE training feature",sourceKind:"public_reference",sourceUrl:"https://www.cyclingweekly.com/fitness/training/how-tadej-pogacar-and-uae-team-emirates-train-to-be-the-1-team-in-cycling",licenseNote:"Publicly described workout prescription.",attribution:"Public feature describes 3×10 min at 90–95% FTP around 50 rpm with 5 min recovery.",system:"sweet_spot",secondarySystem:"tempo",structure:[...WU15,rep(3,[step(10,92,"50"),step(5,55,"90")]),step(20,68),...CD10],tags:["pro-inspired","uae","torque","low-cadence"],description:"Low-cadence muscular endurance based on a publicly described UAE session.",cadence:"50 rpm work"}),
  buildWorkout({id:"public-join-2x20-threshold",name:"Public reference · 2×20 Threshold",sourceName:"JOIN public workout library",sourceKind:"public_reference",sourceUrl:"https://join.cc/workouts/cycling-workouts/2x-20-min-threshold-2hours-00minutes",licenseNote:"Publicly visible workout outline; intensity normalized to 98% FTP by Petr Fitness Data.",attribution:"JOIN publicly describes 2×20 min threshold, 10 min recovery, ~95 rpm.",system:"threshold",structure:[...WU15,rep(2,[step(20,98,"95"),step(10,55)]),step(45,68),...CD10],tags:["public-reference","join","threshold"],description:"Independent normalization of a publicly visible JOIN workout outline.",cadence:"95 rpm"}),
  buildWorkout({id:"public-join-increasing-threshold",name:"Public reference · 2×5×3 Threshold",sourceName:"JOIN public workout library",sourceKind:"public_reference",sourceUrl:"https://join.cc/workouts/cycling-workouts/increasing-threshold-sets-1hours-35minutes",licenseNote:"Publicly visible workout outline; target percentages normalized by Petr Fitness Data.",attribution:"JOIN publicly describes two sets of five 3-minute threshold intervals with 15 min between sets.",system:"threshold",secondarySystem:"vo2max",structure:[...WU15,rep(5,[step(3,100,"90-95"),step(2,55)]),step(15,55),rep(5,[step(3,100,"90-95"),step(2,55)]),step(5,65),...CD10],tags:["public-reference","join","threshold","repeatability"],description:"Independent power normalization of JOIN's publicly visible interval pattern."}),
  buildWorkout({id:"public-tp-4x4-vo2",name:"Public sample · 4×4 VO₂",sourceName:"TrainingPeaks public sample week",sourceKind:"public_reference",sourceUrl:"https://www.trainingpeaks.com/training-plans/cycling/road-cycling/tp-275216/tc-rad-build-beginner-intermediate-fokus-vo2max",licenseNote:"Public sample workout outline; power target normalized independently.",attribution:"Public TrainingPeaks sample week lists a 4×4 high-intensity session.",system:"vo2max",structure:[...WU15,rep(4,[step(4,112,"90-105"),step(4,50)]),step(3,65),...CD10],tags:["public-reference","trainingpeaks","4x4"],description:"Independent implementation of a public 4×4 VO₂ sample.",cadence:"90–105 rpm"}),
  buildWorkout({id:"public-pro-pidcock-mtb-45",name:"Pro-inspired · Pidcock MTB Champs 45",sourceName:"TrainingPeaks public Pro MTB sample",sourceKind:"public_reference",sourceUrl:"https://www.trainingpeaks.com/training-plans/cycling/mountain-biking/tp-620030/train-like-the-pros-7-mtb-pro-cyclist-training-sessions",licenseNote:"Publicly visible sample workout. Stored with attribution; not claimed to be the athlete's private training file.",attribution:"TrainingPeaks labels the public sample as inspired by Tom Pidcock.",system:"anaerobic",secondarySystem:"vo2max",structure:[ramp(10,40,75),step(4,90),step(3,55),step(.3333,140),step(2.3333,90),step(.3333,140),step(3,70),step(.3333,140),step(2.3333,90),step(.3333,140),step(3,70),step(.3333,140),step(2.3333,90),step(.3333,140),step(3,70),rep(5,[step(.5,140),step(.5,65)]),ramp(5,60,45)],tags:["pro-inspired","pidcock","mtb","repeatability"],description:"Publicly visible pro-inspired race-repeatability workout; source attribution retained.",cadence:"mixed"}),
  buildWorkout({id:"public-pro-langvad-vo2-80",name:"Pro-inspired · Langvad VO₂ 7×3",sourceName:"TrainingPeaks public Pro MTB sample",sourceKind:"public_reference",sourceUrl:"https://www.trainingpeaks.com/training-plans/cycling/mountain-biking/tp-620030/train-like-the-pros-7-mtb-pro-cyclist-training-sessions",licenseNote:"Publicly visible sample workout. Stored with attribution; not claimed to be the athlete's private training file.",attribution:"TrainingPeaks labels the public sample as inspired by Annika Langvad.",system:"vo2max",structure:[ramp(7,40,75),step(.5,109),step(3,50),step(.5,109),step(8,50),rep(7,[step(3,115,"95-105"),step(5,50)]),ramp(5,50,45)],tags:["pro-inspired","langvad","vo2max","3min"],description:"High-volume 3-minute VO₂ session from a publicly visible pro-inspired sample.",cadence:"95–105 rpm"})
];

export const CYCLING_WORKOUTS = [...buildResearchWorkouts(), ...PUBLIC_REFERENCES, ...buildFamilyWorkouts()];
