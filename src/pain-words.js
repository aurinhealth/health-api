// One rule for "the athlete speaks of a pain or an injury" (Coach memory,
// Today's verdict, the gym plan and the coach's Injured card), so "nebolí",
// "Hill repeats", "I will ride", "a camp in Spain" or "riding in the cold" are
// no pain (audit "Kouč jako skutečný trenér" 2026-11-07, point 7). Each word
// starts a word, which also leaves out "nebolí" and "nezraněný".
const word = parts => new RegExp('(?<!\\p{L})(?:' + parts.join('|') + ')', 'iu');
const PAIN_PARTS = ['bol(?:í|i(?!\\p{L})|el|et|est|av)', 'zran', 'nat[áa]h', 'nata[žz]en', 'podvrt', 'v[ýy]ron', 'natekl',
  'hurt', 'pains?(?!\\p{L})', 'painful', 'sore(?!\\p{L})', 'ache[sd]?(?!\\p{L})', 'aching', 'injur', 'sprain', 'strain(?:s|ed)?(?!\\p{L})', 'swollen', 'pulled'];
export const PAIN_WORDS = word(PAIN_PARTS);
// What passes on its own (the coach asks after a while whether it still holds):
// a pain or an injury, an illness, a pregnancy.
export const PASSING_WORDS = word([...PAIN_PARTS, 'nemoc', 'nachl', 'chřip', 'chrip',
  'sick', 'ill(?!\\p{L})', 'illness', 'flu(?!\\p{L})', 'a cold(?![ -]\\p{L})', 'těhot', 'tehot', 'pregnan']);

// The body parts a remembered pain can name, the sports whose intensity it
// holds back (audit 2026-11-07, point 4: a sore knee gets no run or ride
// intervals, a sore shoulder no hard swim; the other sports go on as usual)
// and the gym exercises that load it (point 5; strength-generator.js
// painfulExercises). Pain blocks hard training (Petr's rule), so the athlete's
// insisting does not lift it; the coach asks after a while whether it still holds.
export const PAIN_AREAS = [
  { id: 'knee', part: /kolen|knee/i, sports: ['run', 'ride'], label: ['kolena', 'knee'],
    exercises: /squat|lunge|leg press|step-up|step-down|leg extension|thruster|jump|pogo/i },
  { id: 'ankle', part: /kotník|kotnik|achil|lýtk|lytk|chodidl|plosk|nárt|nart|holen|ankle|calf|calves|foot|feet|shin/i, sports: ['run'], label: ['kotníku a lýtka', 'ankle and calf'],
    exercises: /calf|soleus|tibialis|lunge|step-up|step-down|cossack|jump|pogo/i },
  { id: 'hip', part: /kyčl|kycl|kyčel|kycel|třísl|trisl|(?<!\p{L})hip(?!\s*thrust)|groin/iu, sports: ['run', 'ride'], label: ['kyčle', 'hip'],
    exercises: /hip thrust|glute bridge|adduction|abduction|lunge|split squat|sumo|cossack|fire hydrant|clamshell|frog pump/i },
  { id: 'back', part: /z[aá]d(?:a|ech|ou)(?!\p{L})|bedr|k[řr][íi][žz]|p[áa]te[řr]|plot[ée]nk|(?<!\p{L})back(?!\p{L})|lumbar/iu, sports: ['run'], label: ['zad', 'lower back'],
    exercises: /deadlift|good morning/i },
  { id: 'shoulder', part: /ramen|shoulder/i, sports: ['swim'], label: ['ramene', 'shoulder'],
    exercises: /shoulder press|overhead press|military press|push press|arnold|landmine press|bench press|incline press|floor press|chest flat press|chest press|standing dumbbell press|clean (?:&|and) press|cuban press|thruster|^dips$|assisted dip|bench dips/i },
  { id: 'arm', part: /zápěst|zapest|(?<!\p{L})lok(?:et|t)|předlok|predlok|wrist|elbow|forearm/iu, sports: [], label: ['zápěstí a lokte', 'wrist and elbow'],
    exercises: /curl|tricep|pushdown|push down|skull|^dips$|assisted dip|bench dips|push-up|push up|wrist/i },
  { id: 'neck', part: /(?<!\p{L})kr[kč]|šíj|(?<!\p{L})sij|neck/iu, sports: ['swim'], label: ['krku', 'neck'],
    exercises: /shrug|upright row|overhead press|military press|push press/i }
];
// The parts the remembered pains name ("Bolí mě koleno"); "nebolí" names none.
export const painAreas = memories => PAIN_AREAS.filter(a => (Array.isArray(memories) ? memories : []).some(m => PAIN_WORDS.test(String(m)) && a.part.test(String(m))));
// The parts that hold back the intensity of one sport (ride, run, swim).
export const sorePartsFor = (sport, memories) => painAreas(memories).filter(a => a.sports.includes(sport));
