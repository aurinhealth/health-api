// English versions of the built-in workout catalog (cycling-workouts.js,
// running-workouts.js), which is written in Czech: names, descriptions,
// sources and the step notes that end up in the Intervals.icu workout text.
// A test checks that no Czech is left in the English catalog.
import { intervalsText } from './workout-model.js';

// Names: the Czech words of a name; numbers and the rest stay.
const NAME_RULES = [
  [/^Norský double threshold · dopolední/, 'Norwegian double threshold · morning'],
  [/^Norský double threshold · odpolední/, 'Norwegian double threshold · afternoon'],
  [/^Norský (\S+) \(běh\)/, 'Norwegian $1 (run)'],
  [/^Norský /, 'Norwegian '],
  [/^Tempo se zrychleními /, 'Tempo with surges '],
  [/^Silová vytrvalost /, 'Muscular endurance '],
  [/^Sweet Spot s nástupy /, 'Sweet Spot with bursts '],
  [/^Progresivní threshold /, 'Progressive threshold '],
  [/^Threshold s ostrým startem /, 'Threshold with a hard start '],
  [/^Práh v závěru /, 'Late threshold '],
  [/^Dvě stoupání (\d+) \+ (\d+) min/, 'Two climbs $1 + $2 min'],
  [/^Závodní závěr (\d+) \+ (\d+) min/, 'Race finish $1 + $2 min'],
  [/^VO₂ s ostrým startem /, 'VO₂ with a hard start '],
  [/^VO₂ pyramida /, 'VO₂ pyramid '],
  [/^VO₂ závěrečná stoupání /, 'VO₂ final climbs '],
  [/^Anaerobní /, 'Anaerobic '],
  [/^Závěrečné nástupy /, 'Late attacks '],
  [/^Sprinty z místa /, 'Standing-start sprints '],
  [/^Sprinty v závěru /, 'Late sprints '],
  [/^Sprinty do kopce /, 'Hill sprints '],
  [/^Sprinty /, 'Sprints '],
  [/^Endurance s kadenčními drily/, 'Endurance with cadence drills'],
  [/^Endurance se silovými úseky/, 'Endurance with low-cadence efforts'],
  [/^Progresivní endurance/, 'Progressive endurance'],
  [/^Durability – tempo na konci/, 'Durability – tempo at the end'],
  [/^Recovery se spin-upy/, 'Recovery with spin-ups'],
  [/^Tempový běh /, 'Tempo run '],
  [/^Maratonské tempo /, 'Marathon pace '],
  [/^Prahové úseky /, 'Threshold intervals '],
  [/^Souvislý práh /, 'Continuous threshold '],
  [/^Krátké VO₂ /, 'Short VO₂ '],
  [/^Fartlek pyramida /, 'Fartlek pyramid '],
  [/^Kopce /, 'Hills '],
  [/^Rychlé úseky /, 'Fast repeats '],
  [/^Lehký běh s rovinkami/, 'Easy run with strides'],
  [/^Lehký běh/, 'Easy run'],
  [/^Dlouhý běh s rychlým závěrem/, 'Long run with a fast finish'],
  [/^Dlouhý běh s maratonským tempem/, 'Long run with marathon pace'],
  [/^Dlouhý běh/, 'Long run'],
  [/^Progresivní běh/, 'Progressive run'],
  [/^Běh s chůzí /, 'Run-walk '],
  [/^Regenerační běh/, 'Recovery run']
];

// Descriptions, sources and notes; longer texts first, so a sentence wins over
// a word inside it.
const TEXT = {
  // cycling: research protocols
  '3 série 13× 30 s / 15 s s 3 min mezi sériemi – ve studii lepší adaptace než 4×5 min.': '3 sets of 13× 30 s / 15 s with 3 min between sets – better adaptations than 4×5 min in the study.',
  'Publikovaný výzkum': 'Published research',
  'Protokol převzatý z publikované studie; intenzita přepočtená na % FTP.': 'Protocol taken from a published study; intensity converted to % FTP.',
  '4× 8 min s 2 min pauzou – ve studii nejlepší poměr intenzity a objemu práce.': '4× 8 min with 2 min rest – the best balance of intensity and work volume in the study.',
  '4× 8 min s 2 min pauzou – ve studii nejlepší poměr intenzity a objemu práce (běh na páse).': '4× 8 min with 2 min rest – the best balance of intensity and work volume in the study (treadmill running).',
  '4× 4 min při 90–95 % max. tepu, 3 min aktivní pauza – klasický protokol pro VO₂max.': '4× 4 min at 90–95 % of max heart rate, 3 min active rest – the classic VO₂max protocol.',
  '30 s na úrovni VO₂max / 30 s lehce – původně běžecký protokol, zde upravený pro kolo.': '30 s at VO₂max / 30 s easy – originally a running protocol, adapted here for the bike.',
  '8× 20 s na ~170 % VO₂max / 10 s pauza. Vhodné na trenažér v režimu odporu.': '8× 20 s at ~170 % of VO₂max / 10 s rest. Suited to a trainer in resistance mode.',
  '4–6× 30 s naplno (Wingate) se 4 min pauzou – vysoká kvalita za krátký čas.': '4–6× 30 s all-out (Wingate) with 4 min rest – high quality in little time.',
  // cycling: families
  'Kontrolovaná tempo práce pro aerobní výkon a svalovou vytrvalost.': 'Controlled tempo work for aerobic power and muscular endurance.',
  'Tempo bloky s 10s zrychlením každé 2 minuty – simuluje nástupy ve skupině.': 'Tempo blocks with a 10-second surge every 2 minutes – simulates attacks in a group.',
  'Nízká kadence pod pražcem pro sílu v pedálu a stoupání.': 'Low cadence below threshold for pedal strength and climbing.',
  'Nejefektivnější poměr stimulu a únavy pro FTP.': 'The most efficient ratio of stimulus to fatigue for FTP.',
  'Sweet spot s 15s nástupem každé 3 minuty – odolnost proti změnám tempa.': 'Sweet spot with a 15-second burst every 3 minutes – resilience to changes of pace.',
  'Střídání pod a nad prahem – učí zpracovávat laktát v tempu.': 'Alternating below and above threshold – teaches the body to clear lactate at pace.',
  'Práce na FTP – prodlužování času na prahu.': 'Work at FTP – extending time at threshold.',
  'Nad-pod prahem – závodní změny tempa bez odpočinku.': 'Over-under threshold – race-like changes of pace without rest.',
  'Každý blok začíná pod prahem a končí nad ním.': 'Each block starts below threshold and finishes above it.',
  'Nástup nad VO₂ a pak držet práh – typická únik/stoupání situace.': 'A surge above VO₂ and then hold threshold – a typical breakaway or climb.',
  'Nejprve souvislá Z2, potom prahové úseky v závěru. Nácvik závěrečného stoupání v únavě.': 'Continuous Z2 first, then threshold efforts at the end. Practice for a final climb on tired legs.',
  'Dva prahové bloky oddělené delší jízdou v Z2. Druhé stoupání přijde až v druhé části tréninku.': 'Two threshold blocks separated by a longer Z2 section. The second climb comes in the second half of the workout.',
  'Práh na začátku, Z2 uprostřed a stupňovaný závěrečný blok. Simulace závodního finiše bez maximálního sprintu.': 'Threshold at the start, Z2 in the middle and a building final block. Simulates a race finish without an all-out sprint.',
  'Klasické VO₂max intervaly s odpočinkem 1:1.': 'Classic VO₂max intervals with 1:1 rest.',
  'Krátké 30s úseky – hodně času u VO₂max s nízkou mechanickou cenou.': 'Short 30-second efforts – lots of time near VO₂max at a low mechanical cost.',
  '40/20 bloky – rychle dostanou VO₂ nahoru a drží ho.': '40/20 blocks – raise VO₂ quickly and hold it there.',
  'Rychlý nástup urychlí příjem kyslíku; zbytek úseku drží VO₂.': 'A fast start speeds up oxygen uptake; the rest of the effort holds VO₂.',
  'Pyramida délek – mentálně snazší a pestrá VO₂ jednotka.': 'A pyramid of durations – a varied VO₂ session that is easier mentally.',
  'Aerobní první část a tříminutová VO₂ stoupání až v závěru. Udrž stejný kontrolovaný výkon ve všech úsecích.': 'An aerobic first part and three-minute VO₂ climbs at the end. Hold the same controlled power in every effort.',
  'Minutové úseky nad VO₂ – anaerobní kapacita.': 'One-minute efforts above VO₂ – anaerobic capacity.',
  'Dvouminutové úseky – tolerance laktátu.': 'Two-minute efforts – lactate tolerance.',
  'Téměř bez odpočinku nad prahem – závodní specifika pro krátká stoupání.': 'Above threshold with almost no rest – race-specific work for short climbs.',
  '45s nástupy v závěru s dlouhou regenerací. Anaerobní kapacita a opakovatelnost útoků, předepsaný výkon místo sprintu naplno.': '45-second attacks at the end with long recoveries. Anaerobic capacity and repeatable attacks at a prescribed power instead of an all-out sprint.',
  'Neuromuskulární sprinty s plnou regenerací – kvalita před kvantitou.': 'Neuromuscular sprints with full recovery – quality over quantity.',
  'Rozjezdy z nízké rychlosti pro sílu a točivý moment.': 'Starts from low speed for strength and torque.',
  'Delší sprint – finiš a nástupy; s 20s délkou roste i anaerobní podíl.': 'Longer sprints – finishes and attacks; at 20 seconds the anaerobic share grows too.',
  'Z2 a krátké maximální finiše v poslední části jízdy. Mezi sprinty plná regenerace, cílem je špičkový výkon.': 'Z2 and short all-out finishes in the last part of the ride. Full recovery between sprints; the goal is peak power.',
  'Kvalita je vložená mezi aerobní bloky – vyžaduje palivo na cestu.': 'The quality work sits between aerobic blocks – bring fuel for the ride.',
  'Stabilní Z2 – aerobní základ a objem.': 'Steady Z2 – aerobic base and volume.',
  'Z2 s krátkými úseky vysoké kadence pro efektivitu šlapání.': 'Z2 with short high-cadence efforts for pedaling efficiency.',
  'Z2 s 5min úseky v nízké kadenci.': 'Z2 with 5-minute low-cadence efforts.',
  'Tři bloky se stoupající intenzitou 65 → 72 → 78 %.': 'Three blocks of rising intensity 65 → 72 → 78 %.',
  'Dlouhá Z2 a tempo blok na konci, kdy je únava nejvyšší.': 'A long Z2 ride with a tempo block at the end, when fatigue is highest.',
  'Velmi lehké protočení nohou po těžkém dni.': 'A very easy spin after a hard day.',
  'Regenerace s krátkými lehkými spin-upy pro svěží nohy.': 'Recovery with short, easy spin-ups for fresh legs.',
  '55–65 rpm v blocích': '55–65 rpm in the blocks',
  // running
  '4× 4 min při 90–95 % max. tepu, 3 min aktivní pauza (~70 % max. tepu) – ve studii nejvyšší nárůst VO₂max.': '4× 4 min at 90–95 % of max heart rate, 3 min active rest (~70 % of max heart rate) – the largest VO₂max gain in the study.',
  'Protokol převzatý z publikované studie nebo knihy; intenzita přepočtená na % prahového tempa.': 'Protocol taken from a published study or book; intensity converted to % of threshold pace.',
  '30 s rychlostí VO₂max / 30 s na polovině této rychlosti – původní běžecký protokol, zde ve 2 sériích po 10.': '30 s at VO₂max speed / 30 s at half that speed – the original running protocol, here as 2 sets of 10.',
  'Úseky v T tempu (≈ tempo na hodinový závod) s minutovou pauzou – klasika z Daniels\' Running Formula.': 'Efforts at T pace (≈ your one-hour race pace) with one-minute rests – a classic from Daniels\' Running Formula.',
  'Klasická maratonská příprava: úseky ~800 m (≈ 3,5 min) s klusem stejně dlouhým.': 'Classic marathon preparation: ~800 m repeats (≈ 3.5 min) with an equally long jog.',
  'Veřejně popsaný tréninkový princip; časy úseků převedené na % prahového tempa.': 'A publicly described training principle; repeat times converted to % of threshold pace.',
  'Yasso 800s: 800 m úseky v čase (min:s) odpovídajícím cílovému času maratonu (h:min), klus stejně dlouhý.': 'Yasso 800s: 800 m repeats in a time (min:s) matching your marathon goal time (h:min), with an equally long jog.',
  'Dopolední část norského double threshold dne – úseky těsně pod prahem, laktát drží nízko.': 'The morning part of a Norwegian double-threshold day – efforts just below threshold that keep lactate low.',
  'Veřejně popsaná norská metoda': 'Publicly described Norwegian method',
  'Veřejně popsaný princip (kontrola laktátu 2–3 mmol/l); nejde o interní plán sportovce.': 'A publicly described principle (lactate control at 2–3 mmol/l); not any athlete\'s internal plan.',
  'Norská metoda popsaná v rozhovorech a článcích (např. Marius Bakken): dvě prahové jednotky v jednom dni s nízkým laktátem.': 'The Norwegian method described in interviews and articles (e.g. Marius Bakken): two threshold sessions in one day at low lactate.',
  'Norská metoda popsaná v rozhovorech a článcích (např. Marius Bakken).': 'The Norwegian method described in interviews and articles (e.g. Marius Bakken).',
  'Odpolední část – kratší úseky (~1000 m) v prahovém tempu s minutovou pauzou.': 'The afternoon part – shorter repeats (~1000 m) at threshold pace with one-minute rests.',
  'Veřejně popsaný princip; úseky převedené na čas a % prahového tempa.': 'A publicly described principle; repeats converted to time and % of threshold pace.',
  'Komfortně těžké tempo – aerobní síla a schopnost držet rychlost dlouho.': 'Comfortably hard pace – aerobic strength and the ability to hold speed for long.',
  'Bloky v maratonském tempu – ekonomika běhu a trpělivost v tempu.': 'Blocks at marathon pace – running economy and patience at pace.',
  'Úseky v prahovém tempu s krátkým klusem (1 min na 5 min úseku) – zvyšují laktátový práh.': 'Efforts at threshold pace with a short jog (1 min per 5 min of work) – raise the lactate threshold.',
  'Těsně pod prahem s minutovým klusem – hodně času u prahu s malou únavou (princip norské metody).': 'Just below threshold with a one-minute jog – lots of time near threshold with little fatigue (the Norwegian method principle).',
  'Souvislý běh těsně pod prahem – psychická i fyzická odolnost v tempu.': 'A continuous run just below threshold – mental and physical resilience at pace.',
  'Klasické VO₂max úseky (tempo zhruba na 3–5 km) s klusovou pauzou.': 'Classic VO₂max repeats (roughly 3–5 km race pace) with a jog recovery.',
  'Kratší úseky nad VO₂ tempem (~600–800 m) – rychlost a tolerance tempa.': 'Shorter repeats above VO₂ pace (~600–800 m) – speed and pace tolerance.',
  '30 s rychle / 30 s klus – dlouhý čas u VO₂max s krátkými úseky.': '30 s fast / 30 s jog – long time near VO₂max with short efforts.',
  'Pyramida délek s klusem stejně dlouhým – pestrá VO₂ jednotka, jde běžet i v terénu.': 'A pyramid of durations with equally long jogs – a varied VO₂ session that also works off-road.',
  'Úseky do kopce – síla, odraz a VO₂ bez velkého nárazu na nohy.': 'Uphill repeats – strength, push-off and VO₂ without much impact on the legs.',
  'Krátké rychlé úseky (~200–400 m) s plnou pauzou – rychlost, technika a ekonomika.': 'Short fast repeats (~200–400 m) with full rest – speed, technique and economy.',
  'Maximální 10s sprinty do prudkého kopce – síla a nábor svalových vláken s nízkým rizikem zranění.': 'All-out 10-second sprints up a steep hill – strength and muscle fiber recruitment with a low injury risk.',
  'Lehký běh v konverzačním tempu – aerobní základ a objem.': 'An easy run at conversational pace – aerobic base and volume.',
  'Lehký běh a na konci 6 rovinek – rychlost a technika bez únavy.': 'An easy run with 6 strides at the end – speed and technique without fatigue.',
  'Dlouhý běh v lehkém tempu – vytrvalost, odolnost nohou a práce s palivem.': 'A long run at an easy pace – endurance, durable legs and fueling practice.',
  'Dlouhý běh, posledních ~20 % v tempu – učí běžet rychle v únavě.': 'A long run with the last ~20 % at tempo – teaches you to run fast when tired.',
  'Dlouhý běh se 2–3 bloky v maratonském tempu ve druhé polovině.': 'A long run with 2–3 marathon-pace blocks in the second half.',
  'Tři třetiny se zrychlujícím tempem 80 → 86 → 93 %.': 'Three thirds at an increasing pace 80 → 86 → 93 %.',
  'Běh střídaný s chůzí pro začátek – nohy, šlachy a klouby si zvykají na běh postupně. Běh velmi lehce, chůze svižně.': 'Running alternated with walking for beginners – legs, tendons and joints get used to running gradually. Run very easily, walk briskly.',
  'Velmi lehký klus po těžkém dni – prokrvení bez další zátěže.': 'A very easy jog after a hard day – blood flow without extra load.',
  // step notes (Intervals.icu workout text)
  'naplno, bez cílových wattů; ERG vypnout': 'all-out, no power target; ERG off',
  'naplno z nízké rychlosti, těžký převod; ERG vypnout': 'all-out from low speed, big gear; ERG off',
  'maximální finiš, bez cílových wattů; ERG vypnout': 'all-out finish, no power target; ERG off',
  'závěrečné stoupání, postupně zvyšuj': 'final climb, build gradually',
  'druhé stoupání po Z2': 'second climb after Z2',
  'kontrolovaný první blok': 'controlled first block',
  'Z2 mezi stoupáními': 'Z2 between climbs',
  'rovinka – svižně, uvolněně': 'stride – quick and relaxed',
  'do kopce 5–8 %, tvrdě': 'uphill 5–8 %, hard',
  'sprint do kopce 8–10 %, naplno': 'uphill sprint 8–10 %, all-out',
  'chůze dolů, plná pauza': 'walk down, full rest',
  'lehce, konverzační tempo': 'easy, conversational pace',
  'velmi lehce, klidně s chůzí': 'very easy, walk if you like',
  'vysoká kadence, lehce': 'high cadence, easy',
  'postupně zvyšuj': 'build gradually',
  'první stoupání': 'first climb',
  'aerobní dojezd': 'aerobic finish',
  'aerobní blok': 'aerobic block',
  'nízká kadence': 'low cadence',
  'vysoká kadence': 'high cadence',
  'tempo v únavě': 'tempo on tired legs',
  'volně / chůze': 'easy / walk',
  'lehce, stabilně': 'easy, steady',
  'maratonské tempo': 'marathon pace',
  'dolů klusem': 'jog down',
  'svižná chůze': 'brisk walk',
  'volný klus': 'easy jog',
  'lehký běh': 'easy run',
  'progresivně': 'progressive',
  'svižněji': 'a bit faster',
  'rozjetí': 'warm-up',
  'rozklus': 'warm-up jog',
  'výklus': 'cool-down jog',
  'lehce': 'easy',
  'klus': 'jog',
  'chůze': 'walk',
  'nástup': 'surge'
};
const PHRASES = Object.entries(TEXT).sort((a, b) => b[0].length - a[0].length);

export function workoutNameEn(name) {
  let out = String(name || '');
  for (const [re, en] of NAME_RULES) if (re.test(out)) { out = out.replace(re, en); break; }
  return out;
}
// A text made of known sentences and notes; anything unknown stays as is.
export function workoutTextEn(text) {
  let out = String(text ?? '');
  if (!out) return out;
  if (Object.hasOwn(TEXT, out)) return TEXT[out];
  for (const [cs, en] of PHRASES) if (cs.length > 8 && out.includes(cs)) out = out.split(cs).join(en);
  return out;
}
const noteEn = note => note == null ? note : Object.hasOwn(TEXT, note) ? TEXT[note] : workoutTextEn(note);
export function structureEn(structure = []) {
  return structure.map(block => Array.isArray(block.steps)
    ? { ...block, ...(block.note ? { note: noteEn(block.note) } : {}), steps: block.steps.map(s => ({ ...s, note: noteEn(s.note) })) }
    : { ...block, note: noteEn(block.note) });
}

// One catalog workout in English (the shape of buildWorkout).
export function workoutEn(w) {
  if (!w) return w;
  let structure = null;
  try { structure = JSON.parse(w.structure_json || 'null'); } catch { structure = null; }
  const translated = Array.isArray(structure) ? structureEn(structure) : null;
  return {
    ...w,
    name: workoutNameEn(w.name),
    description: workoutTextEn(w.description),
    source_name: workoutTextEn(w.source_name),
    license_note: workoutTextEn(w.license_note),
    attribution: workoutTextEn(w.attribution),
    cadence: workoutTextEn(w.cadence),
    ...(translated ? { structure_json: JSON.stringify(translated), intervals_description: intervalsText(translated, { sport: w.sport || 'ride' }) } : {})
  };
}
