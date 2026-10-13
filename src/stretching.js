import { L } from './lang.js';

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
// Moving into the next stretch, and between the sides.
const TRANSITION_SECONDS = 10;

const holdSeconds = s => s.seconds * (s.sides ? 2 : 1) * s.rounds;
const itemSeconds = s => holdSeconds(s) + TRANSITION_SECONDS * (s.sides ? 2 : 1) * s.rounds;

/**
 * The stretches for a session's work sets (`muscleOf` maps an exercise to its
 * main muscle): the muscles with the most sets first, `count` stretches and
 * the child's pose. Null without any work set.
 */
export function stretchingFor(rows, muscleOf, { count = 4 } = {}) {
  const sets = new Map();
  for (const r of rows || []) {
    if (r?.[0] !== 'WORK') continue;
    const muscle = muscleOf(r[1]);
    if (muscle) sets.set(muscle, (sets.get(muscle) || 0) + 1);
  }
  if (!sets.size) return null;
  const score = s => s.muscles.reduce((sum, m, i) => sum + (sets.get(m) || 0) * (i ? 0.5 : 1), 0);
  const picked = STRETCHES.map((s, order) => ({ s, score: score(s), order })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order).slice(0, count)
    .map((x, i) => ({ ...x.s, rounds: i < 2 ? 2 : 1 }));
  const items = [...picked, { ...FINISH, rounds: 1 }];
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

// The stretching lives in the stored plan's sixth row (values[5]), which the
// older layout left empty: ["Protažení", "<json>"].
export const STRETCHING_ROW = 5;
export function stretchingRow(stretching) {
  return stretching?.items?.length ? ['Protažení', JSON.stringify({ minutes: stretching.minutes, items: stretching.items })] : [];
}
export function readStretching(values) {
  const row = Array.isArray(values) ? values[STRETCHING_ROW] : null;
  if (!Array.isArray(row) || row[0] !== 'Protažení') return null;
  try {
    const parsed = JSON.parse(row[1]);
    return Array.isArray(parsed?.items) ? parsed : null;
  } catch { return null; }
}
