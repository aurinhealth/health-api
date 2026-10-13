import { L } from './lang.js';

// The warm-up before a gym session and the stretching after it. Both are
// chosen for the muscles the session works; each move has two photos and
// steps, and the app's timer leads through them.

// Stretching at the end of a gym session: a few static stretches for the
// muscles the session worked hardest, then the child's pose to finish.
// About five to seven minutes; held, not bounced. A stretch with `sides` is
// held on each side; the two muscles worked most get two rounds ("série").
// Photos: the public domain Free Exercise DB (as exercise-photos.js).
const PHOTO_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const STRETCHES = [
  { id: 'hip_flexor', photo: 'Kneeling_Hip_Flexor', muscles: ['quads', 'glutes'], seconds: 30, sides: true,
    cs: 'Kyčelní flexory v kleku', en: 'Kneeling hip flexor stretch',
    stepsCs: ['Klekni si na jedno koleno, druhou nohu postav chodidlem vpřed.', 'Podsaď pánev a posuň boky dopředu, až ucítíš tah v přední části kyčle zadní nohy.', 'Trup drž vzpřímeně, nepropínej se v bedrech.'],
    stepsEn: ['Kneel on one knee with the other foot flat in front of you.', 'Tuck your pelvis and shift your hips forward until you feel a stretch at the front of the back hip.', 'Keep your torso upright; don\'t arch your lower back.'] },
  { id: 'hamstring', photo: 'Seated_Floor_Hamstring_Stretch', muscles: ['hamstrings', 'lower_back'], seconds: 30, sides: true,
    cs: 'Zadní strana stehen v sedu', en: 'Seated hamstring stretch',
    stepsCs: ['Sedni si, jednu nohu natáhni před sebe, druhou pokrč chodidlem k vnitřní straně stehna.', 'S rovnými zády se předkloň z kyčlí ke kotníku natažené nohy.', 'Zastav se na mírném tahu pod kolenem, nehrb se.'],
    stepsEn: ['Sit with one leg straight in front of you and the other bent, foot against the inner thigh.', 'With a straight back, hinge forward from the hips towards the ankle.', 'Stop at a gentle pull behind the knee; don\'t round your back.'] },
  { id: 'quad', photo: 'Standing_Elevated_Quad_Stretch', muscles: ['quads'], seconds: 30, sides: true,
    cs: 'Přední strana stehen s nohou na lavici', en: 'Elevated quad stretch',
    stepsCs: ['Postav se zády k lavici a nárt jedné nohy si polož za sebe na lavici.', 'Stojnou nohu mírně pokrč a podsaď pánev.', 'Tah má být v přední části stehna, ne v koleni.'],
    stepsEn: ['Stand with your back to a bench and rest one instep on it behind you.', 'Bend the standing knee slightly and tuck your pelvis.', 'Feel it at the front of the thigh, not in the knee.'] },
  { id: 'figure_four', photo: 'Ankle_On_The_Knee', muscles: ['glutes', 'abductors'], seconds: 30, sides: true,
    cs: 'Hýždě vleže (čtyřka)', en: 'Figure-four glute stretch',
    stepsCs: ['Lehni si na záda, pokrč kolena a kotník jedné nohy polož na koleno druhé.', 'Chyť spodní stehno a přitáhni obě nohy k hrudníku.', 'Krk a ramena nech volně na zemi.'],
    stepsEn: ['Lie on your back, knees bent, and rest one ankle on the other knee.', 'Hold the bottom thigh and pull both legs towards your chest.', 'Keep your neck and shoulders relaxed on the floor.'] },
  { id: 'calf', photo: 'Calf_Stretch_Hands_Against_Wall', muscles: ['calves'], seconds: 30, sides: true,
    cs: 'Lýtka u zdi', en: 'Wall calf stretch',
    stepsCs: ['Opři se rukama o zeď, jednu nohu dej dozadu.', 'Zadní nohu drž rovně a patu na zemi.', 'Přenes váhu dopředu, až ucítíš tah v lýtku.'],
    stepsEn: ['Put your hands on a wall and step one foot back.', 'Keep the back leg straight and the heel down.', 'Lean forward until you feel it in the calf.'] },
  { id: 'butterfly', photo: 'Groin_and_Back_Stretch', muscles: ['adductors'], seconds: 45, sides: false,
    cs: 'Motýlek', en: 'Butterfly stretch',
    stepsCs: ['Sedni si, spoj chodidla a kolena nech padnout do stran.', 'Chyť se za kotníky a s rovnými zády se mírně předkloň.', 'Kolena netlač dolů rukama, nech je klesat sama.'],
    stepsEn: ['Sit with the soles of your feet together and let the knees fall out.', 'Hold your ankles and lean forward slightly with a straight back.', 'Don\'t push the knees down; let them sink.'] },
  { id: 'chest', photo: 'Elbows_Back', muscles: ['chest', 'shoulders'], seconds: 30, sides: false,
    cs: 'Hrudník: lokty dozadu', en: 'Elbows-back chest stretch',
    stepsCs: ['Postav se rovně a dlaně si polož na bedra, prsty dolů.', 'Stáhni lopatky a lokty tlač dozadu k sobě.', 'Hrudník otevři dopředu, ramena nech dole.'],
    stepsEn: ['Stand tall with your palms on your lower back, fingers down.', 'Squeeze your shoulder blades and pull the elbows back together.', 'Open the chest forward with the shoulders down.'] },
  { id: 'lat', photo: 'One_Arm_Against_Wall', muscles: ['back'], seconds: 30, sides: true,
    cs: 'Široký sval zádový u zdi', en: 'Wall lat stretch',
    stepsCs: ['Pokrčenou paži opři předloktím o zeď nebo zárubeň nad hlavou.', 'Pomalu se nakloň k paži a boky odsuň od zdi.', 'Tah ucítíš po straně zad pod podpaží.'],
    stepsEn: ['Rest a bent arm against a wall or door frame above your head.', 'Slowly lean into the arm and move the hips away from the wall.', 'You\'ll feel it along the side of your back, below the armpit.'] },
  { id: 'triceps', photo: 'Triceps_Stretch', muscles: ['triceps'], seconds: 30, sides: true,
    cs: 'Triceps za hlavou', en: 'Overhead triceps stretch',
    stepsCs: ['Zvedni paži, pokrč ji a dlaň dej mezi lopatky.', 'Druhou rukou chyť loket a jemně ho táhni za hlavu.', 'Hlavu drž rovně, netlač ji dopředu.'],
    stepsEn: ['Raise one arm, bend it and reach your palm between the shoulder blades.', 'With the other hand, hold the elbow and pull it gently behind your head.', 'Keep your head straight.'] },
  { id: 'biceps', photo: 'Standing_Biceps_Stretch', muscles: ['biceps', 'forearms'], seconds: 30, sides: false,
    cs: 'Biceps s rukama za zády', en: 'Standing biceps stretch',
    stepsCs: ['Spoj ruce za zády a narovnej paže.', 'Otoč dlaně dolů a paže pomalu zvedej.', 'Zastav se, jakmile ucítíš tah v bicepsech a předních ramenech.'],
    stepsEn: ['Clasp your hands behind your back and straighten your arms.', 'Turn the palms down and slowly lift the arms.', 'Stop when you feel it in the biceps and the front of the shoulders.'] },
  { id: 'cross_body', photo: 'Shoulder_Stretch', muscles: ['rear_delts', 'side_delts', 'shoulders'], seconds: 30, sides: true,
    cs: 'Rameno přes hrudník', en: 'Cross-body shoulder stretch',
    stepsCs: ['Natáhni paži přes hrudník.', 'Druhou rukou ji přitáhni nad loktem k tělu.', 'Rameno drž dole, nezvedej ho k uchu.'],
    stepsEn: ['Bring one straight arm across your chest.', 'Pull it in above the elbow with the other hand.', 'Keep the shoulder down, away from the ear.'] },
  { id: 'neck', photo: 'Side_Neck_Stretch', muscles: ['traps'], seconds: 20, sides: true,
    cs: 'Krk do strany', en: 'Neck side stretch',
    stepsCs: ['Uvolni ramena a ukloň hlavu k jednomu rameni.', 'Rukou na straně hlavy jen lehce přidej.', 'Opačné rameno táhni dolů.'],
    stepsEn: ['Relax your shoulders and tilt your head towards one shoulder.', 'Add a light pull with the hand on the side of your head.', 'Draw the other shoulder down.'] },
  { id: 'cat', photo: 'Cat_Stretch', muscles: ['core', 'lower_back'], seconds: 30, sides: false,
    cs: 'Kočičí hřbet', en: 'Cat stretch',
    stepsCs: ['Postav se na všechny čtyři, ruce pod rameny, kolena pod boky.', 'Vtáhni břicho a vyhrb záda od beder až po krk.', 'Hlavu nech volně klesnout a dýchej do zad.'],
    stepsEn: ['Get on all fours, hands under shoulders, knees under hips.', 'Pull your belly in and round your back from the lower back to the neck.', 'Let your head drop and breathe into your back.'] }
];
const FINISH = { id: 'child', photo: 'Childs_Pose', muscles: ['back', 'lower_back'], seconds: 45, sides: false,
  cs: 'Dětská pozice', en: "Child's pose",
  stepsCs: ['Z pozice na všech čtyřech si sedni hýžděmi na paty.', 'Paže nech natažené před sebou na zemi a čelo polož na podložku.', 'Zhluboka dýchej a s každým výdechem povol záda.'],
  stepsEn: ['From all fours, sit your hips back onto your heels.', 'Leave your arms stretched out in front and rest your forehead down.', 'Breathe deeply and let your back relax on every breath out.'] };
// Warm-up: a few minutes of easy cardio, then dynamic moves for the muscles
// the session works (moved through, not held).
const CARDIO = { id: 'cardio', photo: 'Bicycling_Stationary', muscles: [], seconds: 240, sides: false,
  cs: 'Lehké kardio', en: 'Easy cardio',
  stepsCs: ['Rotoped, veslař nebo rychlá chůze do kopce.', 'Tempo, při kterém ještě zvládneš mluvit.', 'Poslední minutu trochu přidej, ať se zahřeješ.'],
  stepsEn: ['Bike, rower or a brisk uphill walk.', 'A pace at which you can still talk.', 'Pick it up a little in the last minute to get warm.'] };
const WARMUPS = [
  { id: 'worlds_greatest', photo: 'Worlds_Greatest_Stretch', muscles: ['quads', 'glutes', 'hamstrings', 'back'], seconds: 30, sides: true,
    cs: 'Výpad s rotací', en: "World's greatest stretch",
    stepsCs: ['Udělej hluboký výpad a ruce opři vedle přední nohy.', 'Loket stejné strany přibliž k chodidlu, pak paži vytoč ke stropu.', 'Vrať se a pomalu opakuj, pohyb má být plynulý.'],
    stepsEn: ['Step into a deep lunge with your hands beside the front foot.', 'Bring the same-side elbow towards the foot, then rotate that arm to the ceiling.', 'Come back and repeat slowly in one smooth movement.'] },
  { id: 'squat', photo: 'Bodyweight_Squat', muscles: ['quads', 'glutes', 'adductors'], seconds: 40, sides: false,
    cs: 'Dřep s vlastní vahou', en: 'Bodyweight squat',
    stepsCs: ['Nohy na šířku ramen, špičky lehce ven.', 'Pomalu do dřepu tak hluboko, jak ti to jde s rovnými zády.', 'Asi 10–12 opakování v klidném tempu.'],
    stepsEn: ['Feet shoulder-width apart, toes slightly out.', 'Squat down slowly as deep as you can with a straight back.', 'About 10–12 reps at an easy pace.'] },
  { id: 'leg_swings', photo: 'Front_Leg_Raises', muscles: ['hamstrings', 'glutes', 'quads'], seconds: 20, sides: true,
    cs: 'Kmihy nohou', en: 'Leg swings',
    stepsCs: ['Postav se bokem k opoře a chyť se jí.', 'Volnou nohu švihej dopředu a dozadu, rozsah zvětšuj postupně.', 'Trup drž rovně, pohyb vychází z kyčle.'],
    stepsEn: ['Stand side-on to a support and hold it.', 'Swing the free leg forward and back, increasing the range bit by bit.', 'Keep the torso still; the movement comes from the hip.'] },
  { id: 'hip_circles', photo: 'Standing_Hip_Circles', muscles: ['glutes', 'abductors', 'adductors'], seconds: 20, sides: true,
    cs: 'Kroužení kyčlí', en: 'Standing hip circles',
    stepsCs: ['Stoupni si na jednu nohu a chyť se opory.', 'Zvedni koleno do pravého úhlu a opisuj s ním velký kruh do strany a zpět.', 'Po polovině času změň směr.'],
    stepsEn: ['Stand on one leg holding a support.', 'Lift the knee to 90 degrees and draw a big circle out to the side and back.', 'Change direction halfway.'] },
  { id: 'bridge', photo: 'Butt_Lift_Bridge', muscles: ['glutes', 'hamstrings', 'lower_back'], seconds: 30, sides: false,
    cs: 'Most', en: 'Glute bridge',
    stepsCs: ['Lehni si na záda, pokrč kolena, chodidla na šířku pánve.', 'Zatni hýždě a zvedni pánev, až tělo tvoří rovnou linii.', 'Nahoře krátce podrž a pomalu spusť, asi 12×.'],
    stepsEn: ['Lie on your back, knees bent, feet hip-width apart.', 'Squeeze your glutes and lift the hips into a straight line.', 'Pause at the top and lower slowly, about 12 times.'] },
  { id: 'inchworm', photo: 'Inchworm', muscles: ['hamstrings', 'core', 'shoulders', 'chest'], seconds: 40, sides: false,
    cs: 'Housenka', en: 'Inchworm',
    stepsCs: ['Ze stoje se předkloň a dej ruce na zem.', 'Ručkuj dopředu do polohy kliku, pak nohama krátkými kroky za rukama.', 'Zvedni se a opakuj, asi 5×.'],
    stepsEn: ['From standing, bend forward and put your hands on the floor.', 'Walk the hands out to a push-up position, then walk the feet in after them.', 'Stand up and repeat, about 5 times.'] },
  { id: 'arm_circles', photo: 'Arm_Circles', muscles: ['shoulders', 'side_delts', 'rear_delts', 'chest', 'triceps', 'biceps'], seconds: 30, sides: false,
    cs: 'Kroužení pažemi', en: 'Arm circles',
    stepsCs: ['Upaž do stran ve výšce ramen.', 'Začni malými kruhy a postupně je zvětšuj.', 'Po polovině času toč na druhou stranu.'],
    stepsEn: ['Raise your arms out to the sides at shoulder height.', 'Start with small circles and make them bigger.', 'Reverse halfway.'] },
  { id: 'chest_openers', photo: 'Dynamic_Chest_Stretch', muscles: ['chest', 'shoulders', 'biceps'], seconds: 30, sides: false,
    cs: 'Rozpažování', en: 'Chest openers',
    stepsCs: ['Ruce natáhni před sebe, dlaně k sobě.', 'Švihem je rozpaž dozadu, až ucítíš otevření hrudníku.', 'Vrať je zpátky a plynule opakuj.'],
    stepsEn: ['Hold your arms straight out in front, palms together.', 'Swing them open and back until the chest opens.', 'Bring them back and repeat smoothly.'] },
  { id: 'band_pull_apart', photo: 'Band_Pull_Apart', muscles: ['back', 'rear_delts', 'traps'], seconds: 30, sides: false,
    cs: 'Roztahování gumy', en: 'Band pull-apart',
    stepsCs: ['Chyť gumu na šířku ramen, paže před sebou.', 'Roztáhni ji k hrudníku stažením lopatek.', 'Pomalu povol, asi 15×.'],
    stepsEn: ['Hold a band shoulder-width apart, arms in front of you.', 'Pull it apart to your chest by squeezing the shoulder blades.', 'Return slowly, about 15 times.'] },
  { id: 'cat_cow', photo: 'Cat_Stretch', muscles: ['core', 'lower_back', 'back'], seconds: 30, sides: false,
    cs: 'Kočka a kráva', en: 'Cat-cow',
    stepsCs: ['Postav se na všechny čtyři.', 'S výdechem vyhrb záda, s nádechem je prohni a hlavu zvedni.', 'Plynule střídej v rytmu dechu.'],
    stepsEn: ['Get on all fours.', 'Round your back as you breathe out, arch it and lift your head as you breathe in.', 'Alternate smoothly with your breath.'] }
];
// Moving into the next move, and between the sides.
const TRANSITION_SECONDS = 5;

const holdSeconds = s => s.seconds * (s.sides ? 2 : 1) * s.rounds;
const itemSeconds = s => holdSeconds(s) + TRANSITION_SECONDS * (s.sides ? 2 : 1) * s.rounds;

function workedMuscles(rows, muscleOf) {
  const sets = new Map();
  for (const r of rows || []) {
    if (r?.[0] !== 'WORK') continue;
    const muscle = muscleOf(r[1]);
    if (muscle) sets.set(muscle, (sets.get(muscle) || 0) + 1);
  }
  return sets;
}
// The catalog's moves that fit the worked muscles best (a move's first muscle counts fully).
function bestFor(catalog, sets, count) {
  const score = s => s.muscles.reduce((sum, m, i) => sum + (sets.get(m) || 0) * (i ? 0.5 : 1), 0);
  return catalog.map((s, order) => ({ s, score: score(s), order })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order).slice(0, count).map(x => x.s);
}
function routine(items) {
  const seconds = items.reduce((sum, s) => sum + itemSeconds(s), 0);
  return {
    minutes: Math.ceil(seconds / 60),
    seconds,
    items: items.map(s => ({
      id: s.id, name: L(s.cs, s.en), seconds: s.seconds, sides: s.sides, rounds: s.rounds,
      steps: L(s.stepsCs, s.stepsEn), photos: [0, 1].map(i => PHOTO_BASE + s.photo + '/' + i + '.jpg')
    }))
  };
}

/** Shorter routines for a shorter session, so most of the time stays for the lifting. */
export function routineSize(minutes) {
  if (minutes <= 30) return { warmup: { count: 2, cardioSeconds: 60 }, stretching: { count: 2, doubled: 0 } };
  if (minutes <= 45) return { warmup: { count: 2, cardioSeconds: 120 }, stretching: { count: 2, doubled: 0 } };
  if (minutes <= 75) return { warmup: { count: 3, cardioSeconds: 180 }, stretching: { count: 3, doubled: 1 } };
  return { warmup: {}, stretching: {} };
}

/** The warm-up for a session's work sets: easy cardio (unless `cardio` is false) and `count` dynamic moves. Null without work sets. */
export function warmupFor(rows, muscleOf, { count = 4, cardioSeconds = CARDIO.seconds, cardio = true } = {}) {
  const sets = workedMuscles(rows, muscleOf);
  if (!sets.size) return null;
  return routine([...(cardio ? [{ ...CARDIO, seconds: cardioSeconds, rounds: 1 }] : []), ...bestFor(WARMUPS, sets, count).map(s => ({ ...s, rounds: 1 }))]);
}

/**
 * The stretches for a session's work sets (`muscleOf` maps an exercise to its
 * main muscle): the muscles with the most sets first, `count` stretches and
 * the child's pose. Null without any work set.
 */
export function stretchingFor(rows, muscleOf, { count = 4, doubled = 2 } = {}) {
  const sets = workedMuscles(rows, muscleOf);
  if (!sets.size) return null;
  const picked = bestFor(STRETCHES, sets, count).map((s, i) => ({ ...s, rounds: i < doubled ? 2 : 1 }));
  return routine([...picked, { ...FINISH, rounds: 1 }]);
}

// The warm-up and the stretching live in the stored plan's sixth row
// (values[5]), which the older layout left empty:
// ["Rozcvička a protažení", "{warmup:{minutes,items}, stretching:{minutes,items}}"].
export const ROUTINES_ROW = 5;
export const ROUTINES_LABEL = 'Rozcvička a protažení';
const stored = r => r?.items?.length ? { minutes: r.minutes, items: r.items } : null;
export function routinesRow({ warmup = null, stretching = null } = {}) {
  const value = { warmup: stored(warmup), stretching: stored(stretching) };
  return value.warmup || value.stretching ? [ROUTINES_LABEL, JSON.stringify(value)] : [];
}
export function readRoutines(values) {
  const row = Array.isArray(values) ? values[ROUTINES_ROW] : null;
  if (!Array.isArray(row) || row[0] !== ROUTINES_LABEL) return { warmup: null, stretching: null };
  try {
    const parsed = JSON.parse(row[1]);
    return { warmup: parsed?.warmup?.items ? parsed.warmup : null, stretching: parsed?.stretching?.items ? parsed.stretching : null };
  } catch { return { warmup: null, stretching: null }; }
}
