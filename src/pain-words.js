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
const ILLNESS_PARTS = ['nemoc', 'nachl', 'chřip', 'chrip', 'sick', 'ill(?!\\p{L})', 'illness', 'flu(?!\\p{L})', 'a cold(?![ -]\\p{L})'];
const PREGNANCY_PARTS = ['těhot', 'tehot', 'pregnan'];
export const PASSING_WORDS = word([...PAIN_PARTS, ...ILLNESS_PARTS, ...PREGNANCY_PARTS]);
// After how many days the coach asks whether such a memory still holds
// (athlete-state.js memoryCheck; audit 2026-11-07, point 6): an illness
// passes in days, a pain in a week or so, a pregnancy lasts months.
const ILLNESS_WORDS = word(ILLNESS_PARTS), PREGNANCY_WORDS = word(PREGNANCY_PARTS);
// Chest pain, pressure or stabbing, a near blackout or fainting, a pounding or
// irregular heartbeat: the coach asks the next day and after the next training
// whether it is still there (Petr 2026-11-11), not in a week like other pains.
// "Hrudník" alone is the gym's chest, no symptom.
const E = '(?!\\p{L})';
const HEART = new RegExp('(?<!\\p{L})(?:' + [
  'zatm[ěe]l', 'zatm[ěe]n', 'mdl[oe]b', 'omdl', 'faint', 'passed\\s+out', 'black(?:ed|ing)?\\s?out', 'vision\\s+(?:went\\s+)?(?:dim|dark|black|blurr)', 'dimmed\\s+vision',
  'závra[ťt]', 'zavrat', 'zatočil\\p{L}*\\s+(?:se\\s+)?(?:mi\\s+)?hlav', 'motal\\p{L}*\\s+(?:se\\s+)?(?:mi\\s+)?hlav', 'dizz', 'light-?\\s?headed',
  'buš\\p{L}*\\s+(?:mi\\s+)?srdce', 'srdce\\s+(?:mi\\s+)?buš', 'splašen\\p{L}*\\s+(?:tep|srdce)', '(?:racing|pounding)\\s+heart', 'heart\\s+(?:was\\s+|is\\s+)?(?:racing|pounding)', 'palpita',
  'nepravideln\\p{L}*\\s+tep', 'irregular\\s+(?:heart|pulse)', '(?:srdce|tep)\\s+(?:\\p{L}+\\s+){0,4}vynech', 'vynech\\p{L}*\\s+(?:\\p{L}+\\s+){0,2}(?:srdce|úder)',
  'skip\\p{L}*\\s+(?:a\\s+)?(?:heart)?beats?' + E, 'heart\\s+skips', 'missed\\s+(?:a\\s+)?(?:heart)?beat',
  'dušnost', 'dušn[ýáé]' + E, 'breathless', 'short(?:ness)?\\s+of\\s+breath'
].join('|') + ')', 'iu');
// The chest with a feeling of pain or pressure in the same clause, a few words apart;
// gym words ("chest press", "chest day", "hrudní páteř", "chest strap") are no symptom.
const CHEST_PART = '(?:hrud\\p{L}*|chest)';
const CHEST_FEEL = '(?:bol(?:í|i|el|ela|elo|est|esti|ístk\\p{L}*)|pích\\p{L}*|pich\\p{L}*|tlak|tlač(?:í|il\\p{L}*)|tlaci|svír\\p{L}*|svir\\p{L}*|sevř\\p{L}*|pál(?:í|il\\p{L}*|en\\p{L}*)|hurt(?:s|ing)?|pains?|painful|ache[sd]?|aching|pressure|tight(?:ness)?|stab(?:s|bing|bed)?|sting(?:s|ing)?|burn(?:s|ing)?)' + E;
const NEAR = '[^\\S\\n]*(?:[^\\s,.;!?]+[^\\S\\n]+){0,4}';
const CHEST = new RegExp('(?<!\\p{L})(?:' + CHEST_PART + E + NEAR + CHEST_FEEL + '|' + CHEST_FEEL.replace(E, '') + E + NEAR + CHEST_PART + E + ')', 'iu');
const GYM_CHEST = /(?:chest|hrud\p{L}*)\s+(?:press|day|fly|flies|workouts?|exercises?|strap|páteř\p{L}*|pater\p{L}*)|(?:bench|tlak\p{L}*)\s+(?:\p{L}+\s+){0,2}(?:na\s+)?hrudník\p{L}*/giu;
export const heartSymptom = text => { const t = String(text || ''); return HEART.test(t) || CHEST.test(t.replace(GYM_CHEST, ' ')); };
export const checkDays = text => heartSymptom(text) ? 1 : !PASSING_WORDS.test(text) ? null : PREGNANCY_WORDS.test(text) ? 90 : ILLNESS_WORDS.test(text) ? 3 : 7;

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

// The athlete says they are ill now, in their own words: "jsem nemocný",
// "mám horečku", "chytil jsem chřipku", "I have the flu", "I'm sick". Not
// "nejsem", "byl jsem", "když jsem", "if I'm" or someone else's illness
// (audit 2026-11-07, point 1: the coach then always offers Nemoc).
const ILL_PARTS = [
  '(?<!(?:když|kdyz|kdybych|až|az|byl|byla)\\s)(?<!\\p{L})(?:jsem|cítím\\s+se|citim\\s+se)\\s+(?:(?!byla?\\s)\\p{L}+\\s+)?(?:nemocn|nachla[zd]|marod)',
  '(?<!(?:když|kdyz|až|az)\\s)(?<!\\p{L})mám\\s+(?:\\p{L}+\\s+)?(?:horečk|horeck|chřipk|chripk|viróz|viroz|covid|teplotu|angín|angin)',
  '(?<!\\p{L})chytil[a]?\\s+(?:jsem\\s+)?(?:\\p{L}+\\s+)?(?:chřipk|chripk|viróz|viroz|covid|nachlazen)',
  "(?<!(?:if|when|was|were)\\s)(?<!\\p{L})(?:i'm|im|i\\s+am|i\\s+feel|feeling)\\s+(?:(?:a\\s+bit|a\\s+little|still|kinda|quite|really|so|pretty)\\s+)?(?:sick|ill|unwell|feverish)(?!\\p{L})",
  "(?<!(?:if|when)\\s)(?<!\\p{L})(?:i\\s+have|i've\\s+got|i\\s+got|i'm\\s+down\\s+with|down\\s+with)\\s+(?:a\\s+|the\\s+)?(?:fever|flu|covid|temperature|cold(?![ -]\\p{L}))(?!\\p{L})"
];
const prose = text => String(text || '').replace(/[’`]/g, "'");
const ILL_NOW = new RegExp(ILL_PARTS.join('|'), 'iu');
export const illNow = text => ILL_NOW.test(prose(text));
// A lighter cold said now ("mám rýmu", "bolí mě v krku", "sore throat"): no
// hard training today, but no Nemoc forced on all sports (point 2).
const UNWELL = /(?<!(?:nemám|nemam|no|not|without)\s)(?<!\p{L})(?:rým\p{L}*|rym[aeuy](?!\p{L})|sore\s+throat|runny\s+nose|stuffy\s+nose|ucpan\p{L}*\s+nos|(?:bolí|boli)\s+(?:mě|me)\s+v\s+krku|bolest\s+v\s+krku|škrábe\s+(?:mě|me)\s+v\s+krku)/iu;
export const unwellNow = text => illNow(text) || UNWELL.test(prose(text));
