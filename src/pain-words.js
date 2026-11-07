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
