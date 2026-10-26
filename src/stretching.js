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
    stepsEn: ['Get on all fours, hands under shoulders, knees under hips.', 'Pull your belly in and round your back from the lower back to the neck.', 'Let your head drop and breathe into your back.'] },
  // From the MoveKit list (names only; our own texts). `needs`: stations the move needs at the active place.
  { id: 'adductor_stretch', video: '9Hv2TztJwGI', muscles: ['adductors', 'glutes'], seconds: 30, sides: true,
    cs: 'Protažení třísel', en: 'Adductor stretch',
    stepsCs: ['Postav se do širokého stoje, špičky mírně ven.', 'Přenes váhu na jednu nohu a pokrč ji, druhá zůstane natažená.', 'Zastav se, až ucítíš tah na vnitřní straně natažené nohy, záda drž rovná.'],
    stepsEn: ['Stand with your feet wide, toes turned out a little.', 'Shift your weight onto one leg and bend it, keeping the other straight.', 'Stop when you feel a pull along the inside of the straight leg; keep your back flat.'] },
  { id: 'abs_stretch', video: 'GKewpymSBjM', muscles: ['core'], seconds: 30, sides: false,
    cs: 'Protažení břicha', en: 'Abdominal stretch',
    stepsCs: ['Lehni si na břicho, dlaně polož vedle hrudníku.', 'Pomalu se vytlač do napjatých paží, boky zůstanou na zemi.', 'Ramena drž dole od uší a dýchej do břicha.'],
    stepsEn: ['Lie on your front with your palms beside your chest.', 'Slowly press up into straight arms while your hips stay on the floor.', 'Keep your shoulders away from your ears and breathe into your belly.'] },
  { id: 'wall_shoulder_opener', video: '2e4yBgr2pZI', muscles: ['chest', 'shoulders', 'biceps'], seconds: 30, sides: true,
    cs: 'Otevření ramene u zdi', en: 'Wall shoulder opener',
    stepsCs: ['Postav se bokem ke zdi a dlaň natažené paže opři o zeď ve výšce ramen.', 'Pomalu otáčej trup od zdi, dokud neucítíš tah v hrudníku a přední části ramene.', 'Rameno drž dole a nepřetahuj, tah má být příjemný.'],
    stepsEn: ['Stand side-on to a wall and put the palm of your straight arm on it at shoulder height.', 'Slowly turn your torso away until you feel a pull across the chest and the front of the shoulder.', 'Keep the shoulder down and don\'t force it; the pull should feel easy.'] },
  { id: 'dead_hang', video: '3CEmHJXbNpc', needs: ['pullup_bar'], muscles: ['back', 'shoulders', 'forearms'], seconds: 20, sides: false,
    cs: 'Vis na hrazdě', en: 'Dead hang',
    stepsCs: ['Chyť hrazdu nadhmatem o něco šířeji než ramena.', 'Zvedni nohy a nech tělo volně viset na natažených pažích.', 'Dýchej klidně a seskoč dřív, než ti povolí úchop.'],
    stepsEn: ['Take the bar overhand, a little wider than your shoulders.', 'Lift your feet and let your body hang freely on straight arms.', 'Breathe calmly and step down before your grip gives out.'] },
  { id: 'foam_roller_thoracic', video: '9Y11Kc0E0og', needs: ['foam_roller'], muscles: ['back', 'traps', 'shoulders'], seconds: 40, sides: false,
    cs: 'Hrudní páteř na válci', en: 'Thoracic extension on a foam roller',
    stepsCs: ['Lehni si na záda s válcem napříč pod lopatkami, kolena pokrč.', 'Ruce dej za hlavu a pomalu se zakloň přes válec, bedra zůstanou na místě.', 'Vrať se, posuň válec o kousek výš a opakuj.'],
    stepsEn: ['Lie on your back with the roller across your shoulder blades and your knees bent.', 'Put your hands behind your head and slowly lean back over the roller without moving your lower back.', 'Come back up, move the roller a little higher and repeat.'] }
];
const FINISH = { id: 'child', photo: 'Childs_Pose', muscles: ['back', 'lower_back'], seconds: 45, sides: false,
  cs: 'Dětská pozice', en: "Child's pose",
  stepsCs: ['Z pozice na všech čtyřech si sedni hýžděmi na paty.', 'Paže nech natažené před sebou na zemi a čelo polož na podložku.', 'Zhluboka dýchej a s každým výdechem povol záda.'],
  stepsEn: ['From all fours, sit your hips back onto your heels.', 'Leave your arms stretched out in front and rest your forehead down.', 'Breathe deeply and let your back relax on every breath out.'] };
// Warm-up: dynamic moves for the muscles
// the session works (moved through, not held); CARDIO is the older warm-up opener.
const CARDIO = { id: 'cardio', photo: 'Bicycling_Stationary', muscles: [], seconds: 240, sides: false,
  cs: 'Lehké kardio', en: 'Easy cardio',
  stepsCs: ['Rotoped, veslař nebo rychlá chůze do kopce.', 'Tempo, při kterém ještě zvládneš mluvit.', 'Poslední minutu trochu přidej, ať se zahřeješ.'],
  stepsEn: ['Bike, rower or a brisk uphill walk.', 'A pace at which you can still talk.', 'Pick it up a little in the last minute to get warm.'] };
const WARMUPS = [
  { id: 'worlds_greatest', video: '-CiWQ2IvY34', photo: 'Worlds_Greatest_Stretch', muscles: ['quads', 'glutes', 'hamstrings', 'back'], seconds: 30, sides: true,
    cs: 'Výpad s rotací', en: "World's greatest stretch",
    stepsCs: ['Udělej hluboký výpad a ruce opři vedle přední nohy.', 'Loket stejné strany přibliž k chodidlu, pak paži vytoč ke stropu.', 'Vrať se a pomalu opakuj, pohyb má být plynulý.'],
    stepsEn: ['Step into a deep lunge with your hands beside the front foot.', 'Bring the same-side elbow towards the foot, then rotate that arm to the ceiling.', 'Come back and repeat slowly in one smooth movement.'] },
  { id: 'squat', photo: 'Bodyweight_Squat', muscles: ['quads', 'glutes', 'adductors'], seconds: 40, sides: false,
    cs: 'Dřep s vlastní vahou', en: 'Bodyweight squat',
    stepsCs: ['Nohy na šířku ramen, špičky lehce ven.', 'Pomalu do dřepu tak hluboko, jak ti to jde s rovnými zády.', 'Asi 10–12 opakování v klidném tempu.'],
    stepsEn: ['Feet shoulder-width apart, toes slightly out.', 'Squat down slowly as deep as you can with a straight back.', 'About 10–12 reps at an easy pace.'] },
  { id: 'leg_swings', video: 'ajxRz9Dx4BM', photo: 'Front_Leg_Raises', muscles: ['hamstrings', 'glutes', 'quads'], seconds: 20, sides: true,
    cs: 'Kmihy nohou', en: 'Leg swings',
    stepsCs: ['Postav se bokem k opoře a chyť se jí.', 'Volnou nohu švihej dopředu a dozadu, rozsah zvětšuj postupně.', 'Trup drž rovně, pohyb vychází z kyčle.'],
    stepsEn: ['Stand side-on to a support and hold it.', 'Swing the free leg forward and back, increasing the range bit by bit.', 'Keep the torso still; the movement comes from the hip.'] },
  { id: 'hip_circles', video: 'aA0VqayOb70', photo: 'Standing_Hip_Circles', muscles: ['glutes', 'abductors', 'adductors'], seconds: 20, sides: true,
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
  { id: 'arm_circles', video: 'JfJn-e2UYc4', photo: 'Arm_Circles', muscles: ['shoulders', 'side_delts', 'rear_delts', 'chest', 'triceps', 'biceps'], seconds: 30, sides: false,
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
  { id: 'cat_cow', video: '1cs3SKwQZpM', photo: 'Cat_Stretch', muscles: ['core', 'lower_back', 'back'], seconds: 30, sides: false,
    cs: 'Kočka a kráva', en: 'Cat-cow',
    stepsCs: ['Postav se na všechny čtyři.', 'S výdechem vyhrb záda, s nádechem je prohni a hlavu zvedni.', 'Plynule střídej v rytmu dechu.'],
    stepsEn: ['Get on all fours.', 'Round your back as you breathe out, arch it and lift your head as you breathe in.', 'Alternate smoothly with your breath.'] },
  // From the MoveKit list (names only; our own texts). `needs`: stations the move needs at the active place.
  { id: 'dumbbell_halo', video: 'kYo2fBLGpQs', needs: ['dumbbells'], muscles: ['shoulders', 'traps', 'triceps', 'core'], seconds: 30, sides: false,
    cs: 'Kroužení jednoručkou kolem hlavy', en: 'Dumbbell halo',
    stepsCs: ['Lehkou jednoručku drž oběma rukama za hlavičku před obličejem.', 'Pomalu s ní obkroužíš hlavu těsně kolem uší a týla.', 'Trup drž zpevněný a po několika kruzích změň směr.'],
    stepsEn: ['Hold a light dumbbell by its head with both hands in front of your face.', 'Slowly circle it around your head, close to your ears and the back of your head.', 'Keep your trunk braced and change direction after a few circles.'] },
  { id: 'goblet_prying', video: '28YoUHBMCyA', needs: ['dumbbells'], muscles: ['adductors', 'glutes', 'quads'], seconds: 40, sides: false,
    cs: 'Výdrž v hlubokém dřepu s jednoručkou', en: 'Goblet squat prying hold',
    stepsCs: ['Jednoručku drž svisle u hrudníku a sjeď do hlubokého dřepu.', 'Lokty zapři zevnitř o kolena a jemně je roztlačuj.', 'Pomalu přenášej váhu ze strany na stranu, paty zůstanou na zemi.'],
    stepsEn: ['Hold a dumbbell upright at your chest and sink into a deep squat.', 'Put your elbows inside your knees and gently push them apart.', 'Slowly shift your weight from side to side with your heels down.'] },
  { id: 'band_dislocates', video: 'riVxa9By-pM', needs: ['resistance_bands'], muscles: ['shoulders', 'chest', 'rear_delts'], seconds: 30, sides: false,
    cs: 'Přetahování gumy za hlavu', en: 'Band shoulder dislocates',
    stepsCs: ['Chyť gumu široko před boky, paže natažené.', 'Plynule ji přenes přes hlavu až za záda a zase zpět.', 'Když to drhne, chyť ji šířeji, žebra drž dole.'],
    stepsEn: ['Hold a band wide in front of your hips with straight arms.', 'Bring it smoothly over your head to behind your back and back again.', 'If it feels stuck, take a wider grip; keep your ribs down.'] },
  { id: 'band_ankle', video: 'jI1WkcXZde4', needs: ['resistance_bands'], muscles: ['calves', 'quads'], seconds: 30, sides: true,
    cs: 'Mobilizace kotníku s gumou', en: 'Banded ankle mobilisation',
    stepsCs: ['Gumu uchyť nízko za sebou a smyčku dej přes přední stranu kotníku.', 'Postav se do mírného výpadu, chodidlo vpředu celé na zemi.', 'Posouvej koleno dopředu nad špičku a zpět, pata zůstane dole.'],
    stepsEn: ['Anchor a band low behind you and loop it over the front of your ankle.', 'Step into a short lunge with the front foot flat.', 'Move the knee forward over the toes and back; keep the heel down.'] },
  { id: 'hip_switch_90_90', video: 'HUZimFZJZWU', muscles: ['glutes', 'abductors', 'adductors'], seconds: 40, sides: false,
    cs: 'Přetáčení kolen 90/90', en: '90/90 hip switches',
    stepsCs: ['Sedni si s pokrčenými koleny, chodidla na zemi šířeji než boky, ruce opři za sebou.', 'Obě kolena polož na jednu stranu, až budou obě nohy v pravém úhlu.', 'Pomalu je přetoč na druhou stranu a střídej.'],
    stepsEn: ['Sit with your knees bent, feet wider than your hips and hands behind you.', 'Lower both knees to one side until both legs form right angles.', 'Slowly swing them over to the other side and keep alternating.'] },
  { id: 'jefferson_curl', video: 'C44fjSS7X5k', muscles: ['hamstrings', 'lower_back'], seconds: 30, sides: false,
    cs: 'Postupné rolování páteře', en: 'Bodyweight Jefferson curl',
    stepsCs: ['Stoupni si rovně, bradu přitáhni k hrudníku.', 'Obratel po obratli se sroluj dolů k zemi, kolena jen lehce povol.', 'Stejně pomalu se vyroluj nahoru, bez váhy a jen kam to jde bez bolesti.'],
    stepsEn: ['Stand tall and tuck your chin to your chest.', 'Roll down one vertebra at a time towards the floor, knees only slightly soft.', 'Roll back up just as slowly, with no weight and only as far as is pain-free.'] },
  { id: 'squat_to_stand', video: 'G5iP1-kE4-4', muscles: ['hamstrings', 'adductors', 'glutes', 'quads'], seconds: 40, sides: false,
    cs: 'Z předklonu do dřepu', en: 'Squat to stand',
    stepsCs: ['Předkloň se a chyť se za špičky.', 'Drž se a sjeď do hlubokého dřepu, lokty mezi koleny, hrudník nahoru.', 'Zvedni boky a natáhni nohy, ruce stále na špičkách, a opakuj.'],
    stepsEn: ['Bend forward and hold your toes.', 'Keep hold and drop into a deep squat, elbows between the knees and chest up.', 'Lift your hips and straighten your legs with your hands still on your toes, then repeat.'] },
  { id: 'stick_pass_through', video: 'YW20zO__f_c', muscles: ['shoulders', 'chest', 'rear_delts'], seconds: 30, sides: false,
    cs: 'Přetahování tyče za hlavu', en: 'Broomstick pass-throughs',
    stepsCs: ['Tyč nebo násadu drž širokým úchopem před stehny.', 'S napjatými pažemi ji přenes přes hlavu za záda a zpět.', 'Pohyb veď pomalu, žebra drž dole a záda neprohýbej.'],
    stepsEn: ['Hold a stick or broom handle with a wide grip in front of your thighs.', 'With straight arms bring it over your head to behind your back and back.', 'Move slowly, keep your ribs down and don\'t arch your back.'] },
  { id: 'frog_rock_back', video: 'iM3EDuJlpDw', muscles: ['adductors', 'glutes'], seconds: 30, sides: false,
    cs: 'Žába s houpáním', en: 'Frog rock-backs',
    stepsCs: ['Klekni na předloktí a roztáhni kolena co nejšíř, chodidla ven.', 'Záda drž rovná a pomalu posouvej boky dozadu k patám.', 'Vrať se dopředu a opakuj, tah má být ve vnitřních stehnech.'],
    stepsEn: ['Kneel on your forearms with your knees as wide as is comfortable, feet out.', 'Keep your back flat and slowly push your hips back towards your heels.', 'Come forward again and repeat; feel it in your inner thighs.'] },
  { id: 'hip_flexor_rock', video: 'kRw1NX1nfVE', muscles: ['quads', 'glutes'], seconds: 30, sides: true,
    cs: 'Houpání v kleku na jednom koleni', en: 'Half-kneeling hip flexor rock',
    stepsCs: ['Klekni na jedno koleno, druhou nohu měj vpředu chodidlem na zemi.', 'Podsaď pánev a zhoupni boky dopředu, až ucítíš tah v kyčli zadní nohy.', 'Vrať se a v klidném rytmu opakuj.'],
    stepsEn: ['Kneel on one knee with the other foot flat in front.', 'Tuck your pelvis and rock your hips forward until you feel the front of the back hip.', 'Rock back and repeat at an easy pace.'] },
  { id: 'hip_hinge_drill', video: 'ctMrDzw8LYQ', muscles: ['hamstrings', 'glutes', 'lower_back'], seconds: 30, sides: false,
    cs: 'Nácvik předklonu z kyčlí', en: 'Hip hinge drill',
    stepsCs: ['Stoupni si na šířku boků, kolena lehce pokrč, ruce na boky nebo tyč podél zad.', 'Posouvej boky dozadu a trup sklápěj s rovnými zády.', 'Jakmile ucítíš tah pod hýžděmi, vrať se vzpřímeně stisknutím hýždí.'],
    stepsEn: ['Stand hip-width apart with soft knees, hands on hips or a stick along your back.', 'Push your hips back and tip your torso forward with a flat back.', 'When you feel the backs of your thighs, squeeze your glutes to stand tall.'] },
  { id: 'open_book', video: 'rDviWORCWEw', muscles: ['back', 'chest', 'shoulders'], seconds: 30, sides: true,
    cs: 'Otevírání knihy', en: 'Open book rotation',
    stepsCs: ['Lehni si na bok, kolena pokrč před sebe a paže natáhni před hrudník.', 'Horní paži přenes obloukem na druhou stranu a hlavou ji sleduj.', 'Kolena drž u sebe na zemi a vrať se zpět.'],
    stepsEn: ['Lie on your side with knees bent in front and arms straight in front of your chest.', 'Sweep the top arm over to the other side and follow it with your eyes.', 'Keep your knees together on the floor and come back.'] },
  { id: 'quadruped_rotation', video: 'z2zv526I7M8', muscles: ['back', 'shoulders'], seconds: 30, sides: true,
    cs: 'Rotace na všech čtyřech', en: 'Quadruped thoracic rotation',
    stepsCs: ['Postav se na všechny čtyři a jednu ruku dej za hlavu.', 'Loket stoč dolů k opačné ruce a pak ho vytoč ke stropu.', 'Pohyb veď z hrudní páteře, boky zůstanou na místě.'],
    stepsEn: ['Get on all fours and put one hand behind your head.', 'Turn the elbow down towards the other hand, then up towards the ceiling.', 'Move from your upper back; your hips stay still.'] },
  { id: 'single_leg_balance', video: '-MUBv4YfNX8', muscles: ['calves', 'glutes'], seconds: 30, sides: true,
    cs: 'Stoj na jedné noze', en: 'Single-leg balance',
    stepsCs: ['Stoupni si na jednu nohu, koleno lehce povol.', 'Druhou nohu zvedni a drž rovnováhu, pánev drž rovně.', 'Když je to snadné, zavři oči nebo otáčej hlavou.'],
    stepsEn: ['Stand on one leg with a soft knee.', 'Lift the other foot and hold your balance with your pelvis level.', 'When it gets easy, close your eyes or turn your head.'] },
  { id: 'single_leg_reach', video: 'TShLyAkKU9c', muscles: ['glutes', 'hamstrings', 'quads'], seconds: 30, sides: true,
    cs: 'Stoj na jedné noze s dosahem', en: 'Single-leg balance reach',
    stepsCs: ['Stoupni si na jednu nohu, koleno lehce pokrč.', 'Volnou nohou pomalu sahej dopředu, do strany a dozadu.', 'Koleno stojné nohy drž nad chodidlem, nepadá dovnitř.'],
    stepsEn: ['Stand on one leg with the knee slightly bent.', 'Slowly reach the free foot forward, out to the side and back.', 'Keep the standing knee over your foot; don\'t let it fall inwards.'] },
  { id: 'spiderman', video: 'ZGg8cHXgPAY', muscles: ['adductors', 'quads', 'glutes', 'back'], seconds: 30, sides: true,
    cs: 'Spiderman výpad', en: 'Spiderman stretch',
    stepsCs: ['Z pozice vzporu přenes jednu nohu vedle ruky na stejné straně.', 'Boky spusť k zemi, zadní noha zůstane natažená.', 'Vrať nohu zpět a vyměň strany.'],
    stepsEn: ['From a push-up position, step one foot outside the hand on the same side.', 'Lower your hips towards the floor with the back leg straight.', 'Step back and switch sides.'] },
  { id: 'step_down_balance', video: 'Or4C-UQ63Xc', needs: ['plyo_box'], muscles: ['quads', 'glutes'], seconds: 30, sides: true,
    cs: 'Sestup z bedny do rovnováhy', en: 'Step-down to balance',
    stepsCs: ['Stoupni si na nízkou bednu nebo schod.', 'Pomalu spusť jednu nohu k zemi, koleno stojné nohy míří nad špičku.', 'Patou se jen dotkni a vrať se nahoru do stoje na jedné noze.'],
    stepsEn: ['Stand on a low box or step.', 'Slowly lower one foot towards the floor with the standing knee over your toes.', 'Just touch the heel down and come back up to stand on one leg.'] },
  { id: 'walking_knee_hugs', video: 'GVU4paANHoE', muscles: ['glutes', 'hamstrings', 'lower_back'], seconds: 30, sides: false,
    cs: 'Přitahování kolen v chůzi', en: 'Walking knee hugs',
    stepsCs: ['Při chůzi zvedni koleno a obejmi ho oběma rukama.', 'Přitáhni ho k hrudníku a vytáhni se na špičku stojné nohy.', 'Pusť, udělej krok a vyměň nohy.'],
    stepsEn: ['As you walk, lift one knee and hug it with both hands.', 'Pull it to your chest and rise onto the toes of the standing leg.', 'Let go, step forward and switch legs.'] },
  { id: 'scapular_pullup', video: 'iKnjSB9VIGo', needs: ['pullup_bar'], muscles: ['back', 'traps', 'rear_delts'], seconds: 30, sides: false,
    cs: 'Stahování lopatek ve visu', en: 'Scapular pull-up',
    stepsCs: ['Zavěs se na hrazdu nadhmatem s nataženými pažemi.', 'Bez pokrčení loktů stáhni lopatky dolů, tělo se trochu zvedne.', 'Pomalu povol zpátky do visu a opakuj.'],
    stepsEn: ['Hang from the bar overhand with straight arms.', 'Without bending your elbows, pull your shoulder blades down so your body rises a little.', 'Slowly let go back into the hang and repeat.'] }
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
// The moves possible at the place: with `stations` (the active place's), a
// move that needs a station is left out without it.
const possible = (catalog, stations) => Array.isArray(stations)
  ? catalog.filter(s => (s.needs || []).every(id => stations.includes(id)))
  : catalog.filter(s => !s.needs);
// Moves that suit the main sport besides the day's muscles: a cyclist sits bent
// forward for hours (hip flexors, hamstrings, chest, upper back), a runner needs
// calves, hips and the back of the legs, a triathlete swims too (lats, chest).
const SPORT_MOVES = {
  cycling: { warmup: ['open_book', 'hip_flexor_rock', 'cat_cow', 'worlds_greatest'], stretching: ['hip_flexor', 'hamstring', 'figure_four', 'chest', 'cat'] },
  running: { warmup: ['leg_swings', 'hip_circles', 'walking_knee_hugs', 'single_leg_balance', 'band_ankle'], stretching: ['calf', 'hip_flexor', 'hamstring', 'quad', 'figure_four'] },
  triathlon: { warmup: ['arm_circles', 'leg_swings', 'open_book', 'hip_flexor_rock'], stretching: ['hip_flexor', 'calf', 'hamstring', 'lat', 'chest'] }
};
/** The catalog's moves that fit, best first: the worked muscles (a move's first muscle counts fully) and the main sport's moves. */
function ranked(catalog, sets, sportIds = []) {
  const fit = s => s.muscles.reduce((sum, m, i) => sum + (sets.get(m) || 0) * (i ? 0.5 : 1), 0);
  const top = Math.max(0, ...catalog.map(fit));
  const bonus = Math.max(1, top * 0.5);
  return catalog.map((s, order) => ({ s, score: fit(s) + (sportIds.includes(s.id) ? bonus : 0), order })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
}
// A small seeded random, so a day's routine stays the same however often it is built.
function seeded(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * The moves in the order they are taken: without a date the best fits; with a
 * date the moves that fit well (at least 40 % of the best) are drawn by the
 * date, likelier the better they fit, so the same kind of session gets other
 * moves on another day. The rest follow, best first.
 */
function inTurn(catalog, sets, { date, sport, kind } = {}) {
  const list = ranked(catalog, sets, SPORT_MOVES[sport]?.[kind] || []);
  if (!date || list.length < 2) return list;
  const good = list.filter(x => x.score >= list[0].score * 0.4), rest = list.slice(good.length);
  const random = seeded(date + '|' + kind), drawn = [];
  while (good.length) {
    let pick = random() * good.reduce((sum, x) => sum + x.score, 0), i = 0;
    while (i < good.length - 1 && (pick -= good[i].score) > 0) i++;
    drawn.push(good.splice(i, 1)[0]);
  }
  return [...drawn, ...rest];
}
/**
 * `count` moves, or with `minutes` as many as fill that time (`finish` already
 * counted in): best fit first. A short list repeats its moves in rounds to fill it.
 */
function pickMoves(catalog, sets, { count, minutes, finishSeconds = 0, ...turn }) {
  const order = inTurn(catalog, sets, turn);
  let picked;
  if (minutes > 0) {
    const target = minutes * 60 - finishSeconds;
    picked = [];
    let total = 0;
    for (const x of order) {
      if (total >= target - 20) break;
      picked.push({ ...x, rounds: 1 });
      total += itemSeconds({ ...x.s, rounds: 1 });
    }
    for (let i = 0; picked.length && total < target - 20 && i < 40; i++) {
      const x = picked[i % picked.length];
      total += itemSeconds({ ...x.s, rounds: 1 });
      x.rounds++;
    }
  } else picked = order.slice(0, count).map(x => ({ ...x, rounds: 1 }));
  return picked.sort((a, b) => b.score - a.score || a.order - b.order).map(x => ({ ...x.s, rounds: x.rounds }));
}
function routine(items) {
  const seconds = items.reduce((sum, s) => sum + itemSeconds(s), 0);
  return {
    minutes: Math.ceil(seconds / 60),
    seconds,
    items: items.map(s => ({
      id: s.id, name: L(s.cs, s.en), seconds: s.seconds, sides: s.sides, rounds: s.rounds,
      steps: L(s.stepsCs, s.stepsEn), photos: s.photo ? [0, 1].map(i => PHOTO_BASE + s.photo + '/' + i + '.jpg') : [],
      ...(s.video ? { video: s.video } : {})
    }))
  };
}

/** Shorter routines for a shorter session, so most of the time stays for the lifting. */
export function routineSize(minutes) {
  if (minutes <= 30) return { warmup: { count: 2, cardioSeconds: 60 }, stretching: { count: 2, doubled: 0 }, cardio: { start: 5, end: 5 } };
  if (minutes <= 45) return { warmup: { count: 2, cardioSeconds: 120 }, stretching: { count: 2, doubled: 0 }, cardio: { start: 5, end: 10 } };
  if (minutes <= 75) return { warmup: { count: 3, cardioSeconds: 180 }, stretching: { count: 3, doubled: 1 }, cardio: { start: 10, end: 10 } };
  return { warmup: {}, stretching: {}, cardio: { start: 10, end: 15 } };
}

/**
 * The warm-up for a session's work sets: `count` dynamic moves (with easy
 * cardio first only when `cardio` is true; the cardio is its own part now,
 * see cardioFor). Null without work sets.
 */
export function warmupFor(rows, muscleOf, { count = 4, cardioSeconds = CARDIO.seconds, cardio = false, stations, minutes, date, sport } = {}) {
  const sets = workedMuscles(rows, muscleOf);
  if (!sets.size) return null;
  return routine([...(cardio ? [{ ...CARDIO, seconds: cardioSeconds, rounds: 1 }] : []), ...pickMoves(possible(WARMUPS, stations), sets, { count, minutes, date, sport, kind: 'warmup' })]);
}

/**
 * The stretches for a session's work sets (`muscleOf` maps an exercise to its
 * main muscle): the muscles with the most sets first, `count` stretches and
 * the child's pose. Null without any work set.
 */
export function stretchingFor(rows, muscleOf, { count = 4, doubled = 2, stations, minutes, date, sport } = {}) {
  const sets = workedMuscles(rows, muscleOf);
  if (!sets.size) return null;
  const finish = { ...FINISH, rounds: 1 };
  const moves = pickMoves(possible(STRETCHES, stations), sets, { count, minutes, finishSeconds: itemSeconds(finish), date, sport, kind: 'stretching' });
  const picked = minutes > 0 ? moves : moves.map((s, i) => ({ ...s, rounds: i < doubled ? 2 : 1 }));
  return routine([...picked, finish]);
}

// The athlete's own warm-ups and stretchings (Nastavení → Posilovna): each a
// name and moves, a move from the catalog by its id or their own with a name,
// seconds and sides. Up to 10 of each, 20 moves in one.
const ROUTINE_KINDS = ['warmup', 'stretching'];
const catalogOf = kind => kind === 'warmup' ? WARMUPS : [...STRETCHES, FINISH];
const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export function normalizeMyRoutines(input) {
  const out = {};
  for (const kind of ROUTINE_KINDS) {
    const list = Array.isArray(input?.[kind]) ? input[kind] : [];
    const ids = new Set();
    out[kind] = list.slice(0, 10).map((r, n) => {
      const items = (Array.isArray(r?.items) ? r.items : []).slice(0, 20).map(item => {
        if (item?.move && catalogOf(kind).some(s => s.id === item.move)) return { move: String(item.move) };
        const name = cleanText(item?.name, 60), seconds = Math.round(Number(item?.seconds));
        return name && seconds >= 5 && seconds <= 3600 ? { name, seconds, sides: item.sides === true } : null;
      }).filter(Boolean);
      let id = /^[A-Za-z0-9_-]{1,40}$/.test(String(r?.id || '')) ? String(r.id) : kind + '-' + (n + 1);
      while (ids.has(id)) id += 'x';
      ids.add(id);
      return items.length ? { id, name: cleanText(r?.name, 40) || L('Moje', 'Mine') + ' ' + (n + 1), items } : null;
    }).filter(Boolean);
  }
  return out;
}
/** One own warm-up or stretching as a routine, as the generated ones. */
export function ownRoutine(kind, saved) {
  if (!saved?.items?.length) return null;
  const catalog = catalogOf(kind);
  const items = saved.items.map((item, i) => {
    const move = item.move && catalog.find(s => s.id === item.move);
    return move ? { ...move, rounds: 1 } : { id: 'own-' + (i + 1), cs: item.name, en: item.name, seconds: item.seconds, sides: !!item.sides, rounds: 1, stepsCs: [], stepsEn: [] };
  });
  return { ...routine(items), own: saved.id, name: saved.name };
}
/** The own routines with their minutes and their moves named, for the app. */
export function myRoutinesView(setup = {}) {
  const mine = normalizeMyRoutines(setup.myRoutines);
  return Object.fromEntries(ROUTINE_KINDS.map(kind => [kind, mine[kind].map(r => {
    const built = ownRoutine(kind, r);
    return { id: r.id, name: r.name, minutes: built.minutes, items: r.items.map((item, i) => ({ ...item, name: built.items[i].name, seconds: built.items[i].seconds, sides: built.items[i].sides })) };
  })]));
}
/** The moves to build an own routine from (all of them; `needs` lists the equipment). */
export function routineMoves() {
  const view = s => ({ id: s.id, name: L(s.cs, s.en), seconds: s.seconds, sides: s.sides, needs: s.needs || [], photos: s.photo ? [0, 1].map(i => PHOTO_BASE + s.photo + '/' + i + '.jpg') : [], ...(s.video ? { video: s.video } : {}) });
  return { warmup: WARMUPS.map(view), stretching: [...STRETCHES, FINISH].map(view) };
}
/** A length from the settings or the app: 5–30 minutes, else auto (null). */
export function routineLength(value) {
  const n = Math.round(Number(value));
  return value !== 'auto' && n >= 5 && n <= 30 ? n : null;
}

/**
 * The warm-up and the stretching for the work sets, on or off: an own routine
 * when the setup picks one (`warmupRoutine`), else built for the muscles, the
 * main sport and the date, as long as the setup's length (`warmupLength`) or
 * sized to the session. `override` changes one day: {warmup: {length, routine}}.
 */
export function routinesFor(rows, muscleOf, setup = {}, minutes = 60, { date, sport, override = {} } = {}) {
  const size = routineSize(minutes), stations = setup?.stations, mine = normalizeMyRoutines(setup?.myRoutines);
  const build = (kind, make, sized) => {
    const choice = { routine: setup?.[kind + 'Routine'], length: setup?.[kind + 'Length'], ...override[kind] };
    const own = choice.routine && choice.routine !== 'auto' ? mine[kind].find(r => r.id === choice.routine) : null;
    if (own) return ownRoutine(kind, own);
    const length = routineLength(choice.length);
    return make(rows, muscleOf, { ...sized, stations, date, sport, ...(length ? { minutes: length } : {}) });
  };
  return { warmup: build('warmup', warmupFor, size.warmup), stretching: build('stretching', stretchingFor, size.stretching) };
}

/**
 * The warm-up and the stretching of a plan as the setup wants them (null when
 * turned off), and the ones turned off as `spare`, offered switched off.
 */
export function planRoutines(rows, muscleOf, setup = {}, minutes = 60, options = {}) {
  const size = routineSize(minutes);
  const all = routinesFor(rows, muscleOf, setup, minutes, options);
  const on = { warmup: setup?.warmup !== false, stretching: setup?.stretching !== false };
  const spare = { warmup: on.warmup ? null : all.warmup, stretching: on.stretching ? null : all.stretching };
  return { warmup: on.warmup ? all.warmup : null, stretching: on.stretching ? all.stretching : null, spare: spare.warmup || spare.stretching ? spare : null, cardio: cardioFor(setup || {}, size.cardio) };
}

// Cardio at the start, at the end or both (Nastavení → Posilovna → Kardio). The machines are the active place's cardio stations;
// the jump rope fits anywhere.
export const CARDIO_MODES = ['none', 'start', 'end', 'both'];
const CARDIO_MACHINES = [
  ['exercise_bike', 'Rotoped', 'Exercise bike'],
  ['treadmill', 'Běžecký pás', 'Treadmill'],
  ['rowing_ergometer', 'Veslo', 'Rowing machine'],
  ['elliptical', 'Eliptický trenažér', 'Elliptical'],
  ['stairmaster', 'Schody', 'Stair climber'],
  ['air_bike', 'Air bike', 'Air bike'],
  ['ski_erg', 'SkiErg', 'SkiErg'],
  ['jump_rope', 'Švihadlo', 'Jump rope']
];
/** The cardio machines to pick from at a place with `stations` (all of them without a list). */
export function cardioOptions(stations) {
  return CARDIO_MACHINES.filter(([id]) => id === 'jump_rope' || !Array.isArray(stations) || stations.includes(id))
    .map(([id, cs, en]) => ({ id, name: L(cs, en) }));
}
/** The saved cardio mode; an older setup has only warmupCardio (false → none, else start). */
export function cardioMode(setup = {}) {
  if (CARDIO_MODES.includes(setup?.cardio)) return setup.cardio;
  return setup?.warmupCardio === false ? 'none' : 'start';
}
/** The machine in use: the chosen one when the place has it, else the first there is. */
export function cardioType(setup = {}) {
  const options = cardioOptions(setup?.stations);
  return (options.find(o => o.id === setup?.cardioType) || options[0]).id;
}
/** The day's cardio parts: {type, start, end} in minutes (null when off), or null for none. */
export function cardioFor(setup = {}, size = routineSize(60).cardio) {
  const mode = cardioMode(setup);
  if (mode === 'none') return null;
  return { type: cardioType(setup), start: mode === 'start' || mode === 'both' ? size.start : null, end: mode === 'end' || mode === 'both' ? size.end : null };
}

// The warm-up, the stretching and the cardio live in the stored plan's sixth
// row (values[5]), which the older layout left empty:
// ["Rozcvička a protažení", "{warmup:{minutes,items}, stretching:{minutes,items}, cardio:{type,start,end}}"].
export const ROUTINES_ROW = 5;
export const ROUTINES_LABEL = 'Rozcvička a protažení';
const stored = r => r?.items?.length ? { minutes: r.minutes, items: r.items, ...(r.name ? { name: String(r.name) } : {}) } : null;
const storedCardio = c => c && (c.start || c.end) ? { type: String(c.type || 'exercise_bike'), start: Number(c.start) || null, end: Number(c.end) || null } : null;
// A part turned off in Posilovna is still stored (`spare`) and listed in `off`,
// so the app offers it switched off and it can be turned on for the day.
export function routinesRow({ warmup = null, stretching = null, cardio = null, spare = null } = {}) {
  const value = { warmup: stored(warmup), stretching: stored(stretching) };
  const off = ['warmup', 'stretching'].filter(k => !value[k] && stored(spare?.[k]));
  for (const k of off) value[k] = stored(spare[k]);
  if (off.length) value.off = off;
  const c = storedCardio(cardio);
  if (c) value.cardio = c;
  return value.warmup || value.stretching || c ? [ROUTINES_LABEL, JSON.stringify(value)] : [];
}
export function readRoutines(values) {
  const row = Array.isArray(values) ? values[ROUTINES_ROW] : null;
  if (!Array.isArray(row) || row[0] !== ROUTINES_LABEL) return { warmup: null, stretching: null };
  try {
    const parsed = JSON.parse(row[1]);
    const out = { warmup: parsed?.warmup?.items ? parsed.warmup : null, stretching: parsed?.stretching?.items ? parsed.stretching : null };
    if (Array.isArray(parsed?.off) && parsed.off.length) out.off = parsed.off.filter(k => k === 'warmup' || k === 'stretching');
    const c = storedCardio(parsed?.cardio);
    return c ? { ...out, cardio: c } : out;
  } catch { return { warmup: null, stretching: null }; }
}

// A plan stored before saved workouts got their routines (or with a length
// of 600 min, the old saved-workout limit) is read with the warm-up, the
// cardio and the stretching from today's Posilovna and its real length.
export function withRoutines(values, setup, muscleOf) {
  if (!Array.isArray(values) || values[ROUTINES_ROW + 1]?.[0] !== 'Typ') return values;
  const out = values.map(r => Array.isArray(r) ? [...r] : r), timing = out[4];
  const limit = Number(timing?.[1]), estimate = Number(timing?.[3]);
  if (timing?.[0] === 'Časový limit (min)' && limit > 180 && estimate > 0) out[4] = [timing[0], estimate, timing[2], estimate];
  if (out[ROUTINES_ROW]?.[0] === ROUTINES_LABEL || out[ROUTINES_ROW]?.length) return out;
  const minutes = Number(out[4]?.[1]) > 0 ? Number(out[4][1]) : 60;
  out[ROUTINES_ROW] = routinesRow(planRoutines(out.slice(ROUTINES_ROW + 2).filter(r => r?.[1]), muscleOf, setup || {}, minutes));
  return out;
}

// Typical minutes the warm-up, the cardio and the stretching add to each
// session length, for the length picker before a plan exists (a full-body
// session; 0 when off).
export function typicalExtraMinutes({ warmup = true, warmupCardio = true, cardio, stretching = true, warmupMinutes = null, stretchingMinutes = null } = {}) {
  const rows = ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'glutes'].map(m => ['WORK', m]);
  const muscleOf = name => name;
  const mode = cardioMode({ cardio, warmupCardio });
  return Object.fromEntries([30, 45, 60, 75, 90].map(minutes => {
    const size = routineSize(minutes);
    const parts = cardioFor({ cardio: mode }, size.cardio);
    return [minutes, {
      warmup: warmup ? warmupMinutes || warmupFor(rows, muscleOf, size.warmup).minutes : 0,
      cardio: (parts?.start || 0) + (parts?.end || 0),
      stretching: stretching ? stretchingMinutes || stretchingFor(rows, muscleOf, size.stretching).minutes : 0
    }];
  }));
}
