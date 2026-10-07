// Running workout catalog: original PFD families with progression ladders,
// published research protocols and publicly described sessions. Intensity is
// % of threshold speed (100 % = threshold pace; 90 % = slower, 110 % = faster),
// the "% Pace" target Intervals.icu uses. Paid plans and apps are not copied.
import { buildWorkout, step, rep, sec, totalMinutes } from "./workout-model.js";

const WU = [step(12, 78, null, "rozklus")];
const WU_STRIDES = [step(12, 78, null, "rozklus"), rep(4, [step(sec(20), 115, null, "rovinka – svižně, uvolněně"), step(sec(40), 65, null, "volně / chůze")])];
const CD = [step(8, 76, null, "výklus")];
const jog = (minutes, pace = 72) => step(minutes, pace, null, "klus");

const blocks = (reps, minutes, pace, restMinutes, restPace = 72) => rep(reps, [step(minutes, pace), jog(restMinutes, restPace)]);
const run = (props) => buildWorkout({ sport: "run", ...props });

const FAMILIES = [
  // ---- tempo -------------------------------------------------------------
  { key: "run-tempo", system: "tempo", label: l => l[0] === 1 ? `Tempový běh ${l[1]} min` : `Tempový běh ${l[0]}×${l[1]}`,
    levels: [[1, 15], [1, 20], [2, 12], [1, 25], [2, 15], [1, 30], [3, 12], [2, 20], [1, 40]],
    core: ([r, m]) => [r === 1 ? step(m, 92) : blocks(r, m, 92, 3)], desc: "Komfortně těžké tempo – aerobní síla a schopnost držet rychlost dlouho." },
  { key: "run-mp", system: "tempo", secondary: "endurance", label: l => `Maratonské tempo ${l[0]}×${l[1]}`,
    levels: [[2, 15], [3, 15], [2, 25], [3, 20], [2, 30]],
    core: ([r, m]) => [blocks(r, m, 90, 3, 80)], desc: "Bloky v maratonském tempu – ekonomika běhu a trpělivost v tempu." },
  // ---- threshold ---------------------------------------------------------
  { key: "run-cruise", system: "threshold", label: l => `Prahové úseky ${l[0]}×${l[1]} min`,
    levels: [[4, 5], [5, 5], [3, 8], [6, 5], [4, 8], [3, 10], [5, 8], [4, 10], [3, 12], [2, 15], [3, 15]],
    core: ([r, m]) => [blocks(r, m, 99, Math.max(1, Math.round(m / 5)))], desc: "Úseky v prahovém tempu s krátkým klusem (1 min na 5 min úseku) – zvyšují laktátový práh." },
  { key: "run-subthreshold", system: "threshold", secondary: "tempo", label: l => `Sub-threshold ${l[0]}×${l[1]} min`,
    levels: [[5, 6], [6, 6], [8, 3], [10, 3], [4, 8], [5, 8], [12, 3], [6, 8], [4, 10], [5, 10]],
    core: ([r, m]) => [blocks(r, m, 96, 1)], desc: "Těsně pod prahem s minutovým klusem – hodně času u prahu s malou únavou (princip norské metody)." },
  { key: "run-threshold-continuous", system: "threshold", label: l => `Souvislý práh ${l[0]} min`,
    levels: [[20], [25], [30], [35], [40]],
    core: ([m]) => [step(m, 97)], desc: "Souvislý běh těsně pod prahem – psychická i fyzická odolnost v tempu." },
  // ---- VO2max ------------------------------------------------------------
  { key: "run-vo2", system: "vo2max", label: l => `VO₂ ${l[0]}×${l[1]} min`, warmup: WU_STRIDES,
    levels: [[5, 3], [6, 3], [4, 4], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5]],
    core: ([r, m]) => [blocks(r, m, m >= 4 ? 106 : 107, m >= 4 ? 3 : 2)], desc: "Klasické VO₂max úseky (tempo zhruba na 3–5 km) s klusovou pauzou." },
  { key: "run-vo2-short", system: "vo2max", secondary: "anaerobic", label: l => `Krátké VO₂ ${l[0]}×${l[1] === 2.5 ? "2,5" : l[1]} min`, warmup: WU_STRIDES,
    levels: [[6, 2], [8, 2], [10, 2], [6, 2.5], [8, 2.5]],
    core: ([r, m]) => [blocks(r, m, 108, 1.5)], desc: "Kratší úseky nad VO₂ tempem (~600–800 m) – rychlost a tolerance tempa." },
  { key: "run-30-30", system: "vo2max", secondary: "anaerobic", label: l => `30/30 ${l[0]}×${l[1]}`, warmup: WU_STRIDES,
    levels: [[1, 12], [1, 16], [2, 10], [2, 12], [3, 10], [2, 15]],
    core: ([r, m]) => [rep(r, [...Array.from({ length: m }, () => [step(sec(30), 112), step(sec(30), 75, null, "klus")]).flat(), jog(3)])],
    desc: "30 s rychle / 30 s klus – dlouhý čas u VO₂max s krátkými úseky." },
  { key: "run-fartlek-pyramid", system: "vo2max", secondary: "threshold", label: l => `Fartlek pyramida ${l.join("-")}`, warmup: WU_STRIDES,
    levels: [[1, 2, 3, 2, 1], [1, 2, 3, 4, 3, 2, 1], [2, 3, 4, 3, 2], [1, 2, 3, 4, 5, 4, 3, 2, 1]],
    core: l => [rep(1, l.flatMap(m => [step(m, m >= 3 ? 105 : 108), jog(m, 75)]))], desc: "Pyramida délek s klusem stejně dlouhým – pestrá VO₂ jednotka, jde běžet i v terénu." },
  { key: "run-hills", system: "vo2max", secondary: "anaerobic", label: l => `Kopce ${l[0]}×${l[1] === 1.5 ? "90 s" : l[1] + " min"}`, warmup: WU_STRIDES, tags: ["hills"],
    levels: [[6, 1.5], [8, 1.5], [6, 2], [8, 2], [10, 2]],
    core: ([r, m]) => [rep(r, [step(m, 106, null, "do kopce 5–8 %, tvrdě"), step(m, 65, null, "dolů klusem")])], desc: "Úseky do kopce – síla, odraz a VO₂ bez velkého nárazu na nohy." },
  // ---- anaerobic / speed -------------------------------------------------
  { key: "run-reps", system: "anaerobic", secondary: "vo2max", label: l => `Rychlé úseky ${l[0]}×${l[1] === 1 ? "1 min" : l[1] === .75 ? "45 s" : "90 s"}`, warmup: WU_STRIDES,
    levels: [[8, .75], [10, .75], [8, 1], [10, 1], [12, 1], [6, 1.5], [8, 1.5]],
    core: ([r, m]) => [blocks(r, m, m < 1 ? 118 : 115, m < 1 ? 1.5 : m === 1 ? 2 : 3, 65)], desc: "Krátké rychlé úseky (~200–400 m) s plnou pauzou – rychlost, technika a ekonomika." },
  { key: "run-hill-sprints", system: "sprint", label: l => `Sprinty do kopce ${l[0]}×10 s`, warmup: WU_STRIDES, tags: ["hills"],
    levels: [[6], [8], [10], [12]],
    core: ([r]) => [rep(r, [{ ...step(sec(10), 140, null, "sprint do kopce 8–10 %, naplno"), free: true }, step(2, 55, null, "chůze dolů, plná pauza")])],
    desc: "Maximální 10s sprinty do prudkého kopce – síla a nábor svalových vláken s nízkým rizikem zranění." }
];

const TOTALS = { tempo: [45, 60, 75, 90], threshold: [45, 60, 75, 90], vo2max: [45, 60, 75], anaerobic: [45, 50, 60], sprint: [40, 50, 60] };

// Wraps a core set into a session of the requested length; the rest is easy running.
function session(core, total, family) {
  const warm = family.warmup || WU;
  const used = totalMinutes([...warm, ...core, ...CD]);
  const fill = Math.round((total - used) * 10) / 10;
  if (fill < 0) return null;
  // Up to 3 spare minutes lengthen the cool-down instead of a separate block.
  if (fill < 3) return [...warm, ...core, ...(fill > 0 ? [step(CD[0].durationMinutes + fill, 76, null, "výklus")] : CD)];
  return [...warm, ...core, step(fill, 82, null, "volný klus"), ...CD];
}

const ENDURANCE = [
  { key: "run-easy", label: "Lehký běh", totals: [30, 40, 45, 50, 60, 75, 90], desc: "Lehký běh v konverzačním tempu – aerobní základ a objem.",
    build: t => [step(5, 78, null, "rozklus"), step(t - 5, 84, null, "lehce, konverzační tempo")] },
  { key: "run-easy-strides", label: "Lehký běh s rovinkami", totals: [40, 45, 50, 60, 75], desc: "Lehký běh a na konci 6 rovinek – rychlost a technika bez únavy.",
    build: t => [step(5, 78, null, "rozklus"), step(t - 5 - 8 - 3, 84, null, "lehce"), rep(6, [step(sec(20), 118, null, "rovinka – svižně, uvolněně"), step(sec(60), 70, null, "volně / chůze")]), step(3, 76, null, "výklus")] },
  { key: "run-long", label: "Dlouhý běh", totals: [75, 90, 105, 120, 135, 150, 180], desc: "Dlouhý běh v lehkém tempu – vytrvalost, odolnost nohou a práce s palivem.",
    build: t => [step(10, 78, null, "rozklus"), step(t - 10, 83, null, "lehce, stabilně")] },
  { key: "run-long-progressive", label: "Dlouhý běh s rychlým závěrem", secondary: "tempo", totals: [75, 90, 105, 120, 150], desc: "Dlouhý běh, posledních ~20 % v tempu – učí běžet rychle v únavě.",
    build: t => { const fast = Math.round(t * .2); return [step(10, 78, null, "rozklus"), step(t - 10 - fast, 83, null, "lehce"), step(fast, 91, null, "tempo v únavě")]; } },
  { key: "run-long-mp", label: "Dlouhý běh s maratonským tempem", secondary: "tempo", totals: [90, 105, 120, 150, 180], desc: "Dlouhý běh se 2–3 bloky v maratonském tempu ve druhé polovině.",
    build: t => { const r = t >= 120 ? 3 : 2, m = t >= 150 ? 20 : 15, easy = t - 10 - r * (m + 5); return [step(10, 78, null, "rozklus"), step(easy, 83, null, "lehce"), rep(r, [step(m, 90, null, "maratonské tempo"), step(5, 80, null, "lehce")])]; } },
  { key: "run-progression", label: "Progresivní běh", secondary: "tempo", totals: [40, 50, 60, 75], desc: "Tři třetiny se zrychlujícím tempem 80 → 86 → 93 %.",
    build: t => { const x = Math.round(t / 3); return [step(x, 80, null, "lehce"), step(x, 86, null, "svižněji"), step(t - 2 * x, 93, null, "tempo")]; } }
];

// Run/walk for beginners: short easy runs with walking breaks, so the legs
// get used to running before continuous jogging. Levels go from 1 min running
// / 2 min walking to 5 / 1; 5 min of walking before and after.
const RUN_WALK = { key: "run-walk", levels: [[1, 2], [2, 2], [3, 1], [5, 1]], totals: [20, 25, 30, 35, 40],
  desc: "Běh střídaný s chůzí pro začátek – nohy, šlachy a klouby si zvykají na běh postupně. Běh velmi lehce, chůze svižně." };
function runWalk([r, w], total) {
  const reps = Math.floor((total - 10) / (r + w));
  if (reps < 2) return null;
  return [step(5, 55, null, "svižná chůze"), rep(reps, [step(r, 80, null, "lehký běh"), step(w, 55, null, "chůze")]), step(total - 5 - reps * (r + w), 55, null, "chůze")];
}

function buildFamilyWorkouts() {
  const out = [];
  for (const f of FAMILIES) {
    f.levels.forEach((level, index) => {
      const core = f.core(level);
      for (const total of TOTALS[f.system]) {
        const structure = session(core, total, f);
        if (!structure) continue;
        out.push(run({
          id: `${f.key}-${level.join("x")}-${total}`, name: `${f.label(level)} · ${total} min`, system: f.system, secondarySystem: f.secondary || null,
          structure, family: f.key, level: index + 1, tags: ["pfd-original", f.key, `${total}min`, ...(f.tags || [])], description: f.desc
        }));
      }
    });
  }
  for (const e of ENDURANCE) for (const total of e.totals) {
    out.push(run({ id: `${e.key}-${total}`, name: `${e.label} · ${total} min`, system: "endurance", secondarySystem: e.secondary || null, structure: e.build(total), family: e.key, tags: ["pfd-original", e.key, `${total}min`], description: e.desc }));
  }
  RUN_WALK.levels.forEach((level, index) => {
    for (const total of RUN_WALK.totals) {
      const structure = runWalk(level, total);
      if (!structure) continue;
      out.push(run({ id: `${RUN_WALK.key}-${level.join("-")}-${total}`, name: `Běh s chůzí ${level[0]}/${level[1]} min · ${total} min`, system: "endurance", structure, family: RUN_WALK.key, level: index + 1, tags: ["pfd-original", RUN_WALK.key, "beginner", `${total}min`], description: RUN_WALK.desc }));
    }
  });
  for (const total of [20, 25, 30, 40, 45]) {
    out.push(run({ id: `run-recovery-${total}`, name: `Regenerační běh · ${total} min`, system: "recovery", structure: [step(total, 72, null, "velmi lehce, klidně s chůzí")], family: "run-recovery", tags: ["pfd-original", "recovery"], description: "Velmi lehký klus po těžkém dni – prokrvení bez další zátěže." }));
  }
  return out;
}

// Published research protocols (running), wrapped into a standard warm-up and cool-down.
const RESEARCH = [
  { id: "run-research-helgerud-4x4", name: "Norský 4×4 (běh)", system: "vo2max",
    core: [blocks(4, 4, 105, 3, 70)],
    citation: "Helgerud J, Høydal K, Wang E, et al. Aerobic high-intensity intervals improve VO2max more than moderate training. Med Sci Sports Exerc. 2007;39(4):665–671.",
    description: "4× 4 min při 90–95 % max. tepu, 3 min aktivní pauza (~70 % max. tepu) – ve studii nejvyšší nárůst VO₂max." },
  { id: "run-research-billat-30-30", name: "Billat 30-30", system: "vo2max", secondary: "anaerobic",
    core: [rep(2, [...Array.from({ length: 10 }, () => [step(sec(30), 112, null, "vVO₂max"), step(sec(30), 60, null, "volný klus")]).flat(), jog(4)])],
    citation: "Billat VL, Slawinski J, Bocquet V, et al. Intermittent runs at the velocity associated with maximal oxygen uptake enables subjects to remain at maximal oxygen uptake for a longer time than intense but submaximal runs. Eur J Appl Physiol. 2000;81:188–196.",
    description: "30 s rychlostí VO₂max / 30 s na polovině této rychlosti – původní běžecký protokol, zde ve 2 sériích po 10." },
  { id: "run-research-seiler-4x8", name: "Seiler 4×8 min", system: "threshold", secondary: "vo2max",
    core: [blocks(4, 8, 101, 2, 70)],
    citation: "Seiler S, Jøranson K, Olesen BV, Hetlelid KJ. Adaptations to aerobic interval training: interactive effects of exercise intensity and total work duration. Scand J Med Sci Sports. 2013;23:74–83.",
    description: "4× 8 min s 2 min pauzou – ve studii nejlepší poměr intenzity a objemu práce (běh na páse)." },
  { id: "run-research-daniels-cruise", name: "Daniels cruise intervals 5×6 min", system: "threshold",
    core: [blocks(5, 6, 99, 1)],
    citation: "Daniels J. Daniels' Running Formula. 3rd ed. Human Kinetics; 2014.",
    description: "Úseky v T tempu (≈ tempo na hodinový závod) s minutovou pauzou – klasika z Daniels' Running Formula." }
];

function buildResearchWorkouts() {
  return RESEARCH.map(r => run({
    id: r.id, name: r.name, system: r.system, secondarySystem: r.secondary || null,
    structure: [...WU_STRIDES, ...r.core, ...CD], family: r.id, sourceName: "Publikovaný výzkum", sourceKind: "research",
    licenseNote: "Protokol převzatý z publikované studie nebo knihy; intenzita přepočtená na % prahového tempa.", citation: r.citation, attribution: r.citation,
    tags: ["research"], description: r.description
  }));
}

const PUBLIC_REFERENCES = [
  ...[6, 8, 10].map(r => run({ id: `run-public-yasso-${r}x800`, name: `Yasso 800s · ${r}×800 m`, sourceName: "Bart Yasso · Runner's World", sourceKind: "public_reference",
    licenseNote: "Veřejně popsaný tréninkový princip; časy úseků převedené na % prahového tempa.", attribution: "Yasso 800s: 800 m úseky v čase (min:s) odpovídajícím cílovému času maratonu (h:min), klus stejně dlouhý.",
    system: "vo2max", secondarySystem: "threshold", structure: [...WU_STRIDES, blocks(r, 3.5, 107, 3.5, 68), ...CD], family: "run-public-yasso",
    tags: ["public-reference", "yasso", "marathon"], description: "Klasická maratonská příprava: úseky ~800 m (≈ 3,5 min) s klusem stejně dlouhým." })),
  run({ id: "run-public-norwegian-double-am", name: "Norský double threshold · dopolední 5×6 min", sourceName: "Veřejně popsaná norská metoda", sourceKind: "public_reference",
    licenseNote: "Veřejně popsaný princip (kontrola laktátu 2–3 mmol/l); nejde o interní plán sportovce.", attribution: "Norská metoda popsaná v rozhovorech a článcích (např. Marius Bakken): dvě prahové jednotky v jednom dni s nízkým laktátem.",
    system: "threshold", secondarySystem: "tempo", structure: [...WU, blocks(5, 6, 96, 1), ...CD], family: "run-public-norwegian",
    tags: ["public-reference", "norwegian", "double-threshold"], description: "Dopolední část norského double threshold dne – úseky těsně pod prahem, laktát drží nízko." }),
  run({ id: "run-public-norwegian-double-pm", name: "Norský double threshold · odpolední 10×1000 m", sourceName: "Veřejně popsaná norská metoda", sourceKind: "public_reference",
    licenseNote: "Veřejně popsaný princip; úseky převedené na čas a % prahového tempa.", attribution: "Norská metoda popsaná v rozhovorech a článcích (např. Marius Bakken).",
    system: "threshold", structure: [...WU, blocks(10, 3.5, 98, 1), ...CD], family: "run-public-norwegian",
    tags: ["public-reference", "norwegian", "double-threshold"], description: "Odpolední část – kratší úseky (~1000 m) v prahovém tempu s minutovou pauzou." })
];

export const RUNNING_WORKOUTS = [...buildResearchWorkouts(), ...PUBLIC_REFERENCES, ...buildFamilyWorkouts()];
