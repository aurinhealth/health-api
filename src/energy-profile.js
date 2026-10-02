// Personal energy baseline: resting expenditure from sex, age, height and
// weight (Mifflin-St Jeor) times everyday activity, the weekly goal, and a
// sport estimate for users whose training is not tracked by a connected source.

// Everyday movement outside sport. Sport itself comes from tracked activities
// (Intervals.icu, Google Health) or, without them, from SPORT_HOURS.
export const ACTIVITY_LEVELS = {
  sedentary: { factor: 1.2, label: "Sedavá práce, málo chůze" },
  light: { factor: 1.3, label: "Lehce aktivní: hodně chůze, práce vestoje" },
  active: { factor: 1.45, label: "Aktivní: většinu dne v pohybu" },
  heavy: { factor: 1.6, label: "Fyzicky náročná práce" }
};

// Hours of sport per week, used only when no activity source is connected.
export const SPORT_HOURS = { "0": 0, "1-3": 2, "3-6": 4.5, "6-10": 8, "10+": 12 };

// Weekly weight change; 7700 kcal per kg.
export const GOALS = {
  "lose_0.25": { kgPerWeek: -0.25, label: "Hubnout 0,25 kg týdně" },
  "lose_0.5": { kgPerWeek: -0.5, label: "Hubnout 0,5 kg týdně" },
  "lose_0.75": { kgPerWeek: -0.75, label: "Hubnout 0,75 kg týdně" },
  "lose_1": { kgPerWeek: -1, label: "Hubnout 1 kg týdně" },
  maintain: { kgPerWeek: 0, label: "Udržovat váhu" }
};

// Extra energy of an hour of sport above rest, per kg of body weight.
const SPORT_KCAL_PER_KG_HOUR = 6;

// The owner's calibrated values, used for the owner while their profile has no
// activity level yet, so their numbers do not change until they fill it in.
export const OWNER_CALIBRATION = { baselineRestTDEE: 2550, deficit: 550, floor: 2000, targetWeightKg: 80 };

const num = v => (v === null || v === undefined || v === "" ? NaN : Number(v));

// Cleans a profile posted from the dashboard; unknown values become null.
export function normalizeProfile(p = {}) {
  const inRange = (v, lo, hi) => { const x = num(v); return Number.isFinite(x) && x >= lo && x <= hi ? x : null; };
  return {
    sex: ["male", "female"].includes(p.sex) ? p.sex : "",
    age: inRange(p.age, 18, 100),
    height: inRange(p.height, 100, 230),
    hrmax: inRange(p.hrmax, 100, 230),
    rhr: inRange(p.rhr, 25, 120),
    activity: Object.hasOwn(ACTIVITY_LEVELS, p.activity) ? p.activity : "",
    sportHours: Object.hasOwn(SPORT_HOURS, p.sportHours) ? p.sportHours : "",
    goal: Object.hasOwn(GOALS, p.goal) ? p.goal : "",
    targetWeight: inRange(p.targetWeight, 35, 250)
  };
}

export function restingMetabolicRate({ sex, age, height }, weightKg) {
  return 10 * weightKg + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161);
}

// What the calorie target can rest on. ready=false lists what is missing;
// then there is no target, because it would not describe this person.
export function energyBaseline(profile, weightKg, { isOwner = false, activityTracked = true } = {}) {
  const p = normalizeProfile(profile || {});
  const weight = num(weightKg);
  const missing = [];
  if (!(weight > 0)) missing.push("weight");
  for (const key of ["sex", "age", "height", "activity", "goal"]) if (!p[key]) missing.push(key);
  if (!activityTracked && !p.sportHours) missing.push("sportHours");
  const goal = GOALS[p.goal] || GOALS["lose_0.5"];
  if (missing.length) {
    // The owner keeps the calibrated baseline until the profile is complete;
    // weight stays required for everyone.
    if (isOwner && weight > 0) return { ready: true, source: "owner-calibration", missing, weightKg: weight, bmr: null, sportDaily: 0, targetWeightKg: p.targetWeight ?? OWNER_CALIBRATION.targetWeightKg, ...OWNER_CALIBRATION, deficit: p.goal ? Math.round(-goal.kgPerWeek * 7700 / 7) || 0 : OWNER_CALIBRATION.deficit };
    return { ready: false, source: null, missing, weightKg: weight > 0 ? weight : null };
  }
  const bmr = restingMetabolicRate(p, weight);
  const sportDaily = activityTracked ? 0 : SPORT_HOURS[p.sportHours] * weight * SPORT_KCAL_PER_KG_HOUR / 7;
  return {
    ready: true,
    source: "profile",
    missing: [],
    weightKg: weight,
    bmr: Math.round(bmr),
    baselineRestTDEE: Math.round(bmr * ACTIVITY_LEVELS[p.activity].factor),
    sportDaily: Math.round(sportDaily),
    // Calories below expenditure per day; 0 when maintaining.
    deficit: Math.round(-goal.kgPerWeek * 7700 / 7) || 0,
    // Never plan below resting metabolism, nor below common safe minimums.
    floor: Math.round(Math.max(bmr, p.sex === "male" ? 1500 : 1200)),
    targetWeightKg: p.targetWeight
  };
}

export const MISSING_LABELS = { weight: "váha", sex: "pohlaví", age: "věk", height: "výška", activity: "denní aktivita", goal: "cíl", sportHours: "sport za týden" };
