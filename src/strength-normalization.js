const ALIASES = new Map([
  ["db bench press", "DB bench press"],
  ["low row", "Low row"],
  ["standing multi flight", "Standing multi flight"],
  ["db shoulder press", "DB shoulder press"],
  ["pivot leg press", "Pivot leg press"],
  ["leg press", "Pivot leg press"],
  ["prone leg curl prime", "Prone leg curl Prime"],
  ["leg curl", "Prone leg curl Prime"],
  ["cable curl", "Cable curl"],
  ["db curl", "DB curl"],
  ["hammer curl", "Hammer curl"],
  ["cable triceps extension", "Cable triceps extension"],
  ["cable triceps pushdown", "Cable triceps extension"],
  ["stahovani triceps", "Cable triceps extension"],
  ["stahování triceps", "Cable triceps extension"],
  ["abs bench crunch", "Abs bench crunch"],
  ["chest flat press prime", "Chest flat press Prime"],
  ["prime flat chest press", "Chest flat press Prime"],
  ["prime flat chest press machine", "Chest flat press Prime"],
  ["shoulder press prime", "Shoulder press Prime"],
  ["seated smith machine shoulder press", "Shoulder press Prime"],
  ["lat pulldown", "Lat pulldown"],
  ["standing rowing machine", "Standing rowing machine"],
  ["pendulum squat", "Pendulum squat"],
  ["leg extension prime", "Leg extension Prime"],
  ["leg extensions", "Leg extension Prime"],
  ["leg extension", "Leg extension Prime"],
  ["hip thrust", "Hip thrust"],
  ["db romanian deadlift", "DB Romanian deadlift"],
  ["barbell romanian deadlift", "Barbell Romanian deadlift"],
  ["db bulgarian split squat", "DB Bulgarian split squat"],
  ["adduction machine", "Adduction machine"],
  ["abduction machine", "Abduction machine"],
  ["pec deck", "Pec deck"],
  ["rear delt pec deck", "Rear delt pec deck"],
  ["cable lateral raise", "Cable lateral raise"],
  ["cable pullover", "Cable pullover"],
  ["cable rear delt fly", "Cable rear delt fly"],
  ["pallof press", "Pallof press"],
  ["cable woodchop", "Cable woodchop"],
  ["roman chair", "Roman chair"],
  ["standing calf raise", "Standing calf raise"],
  ["cable crunch", "Cable crunch"]
]);

function key(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeExerciseName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return ALIASES.get(key(raw)) || raw;
}

export function exerciseAliases(canonical) {
  const target = normalizeExerciseName(canonical);
  return [...new Set([...ALIASES.entries()]
    .filter(([, value]) => value === target)
    .map(([alias]) => alias)
    .concat(key(target)))];
}

export const EXERCISE_ALIASES = Object.fromEntries(ALIASES);
