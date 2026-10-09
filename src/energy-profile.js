// Personal energy baseline: resting expenditure from sex, age, height and
// weight (Mifflin-St Jeor) times everyday activity, the weekly goal, and a
// sport estimate for users whose training is not tracked by a connected source.
import { bilingual } from "./lang.js";
import { normalizeFocus } from "./athlete-focus.js";

// Everyday movement outside sport. Sport itself comes from tracked activities
// (Intervals.icu, Google Health) or, without them, from SPORT_HOURS.
export const ACTIVITY_LEVELS = {
  sedentary: { factor: 1.2, label: "Sedavá práce, málo chůze" },
  light: { factor: 1.3, label: "Lehce aktivní: hodně chůze, práce vestoje" },
  active: { factor: 1.45, label: "Aktivní: většinu dne v pohybu" },
  heavy: { factor: 1.6, label: "Fyzicky náročná práce" }
};

// Hours of sport per week, used when no recent activity data is available.
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

// Age in whole years on a day; with a birth date the age keeps itself current.
export function ageFrom(birthDate, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate || ""));
  if (!m) return null;
  const today = new Date(now);
  let age = today.getUTCFullYear() - Number(m[1]);
  if (today.getUTCMonth() + 1 < Number(m[2]) || (today.getUTCMonth() + 1 === Number(m[2]) && today.getUTCDate() < Number(m[3]))) age--;
  return age >= 18 && age <= 100 ? age : null;
}

// Cleans a profile posted from the dashboard; unknown values become null.
const clockText = v => { const m = String(v ?? "").trim().match(/^(\d{1,2}):(\d{2})$/); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? m[1].padStart(2, "0") + ":" + m[2] : ""; };

// The profile's sleep settings for the recovery model: the goal in minutes
// and the wake times in minutes after midnight.
export function sleepSettings(profile = {}) {
  const minutes = t => { const m = String(t || "").match(/^(\d{2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const goal = num(profile.sleepGoal);
  return { goal: goal >= 360 && goal <= 600 ? goal : null, wake: { workday: minutes(profile.wakeTime), weekend: minutes(profile.wakeTimeWeekend) } };
}

export function normalizeProfile(p = {}) {
  const inRange = (v, lo, hi) => { const x = num(v); return Number.isFinite(x) && x >= lo && x <= hi ? x : null; };
  const birthDate = ageFrom(p.birthDate) != null ? p.birthDate : "";
  return {
    sex: ["male", "female"].includes(p.sex) ? p.sex : "",
    birthDate,
    age: birthDate ? ageFrom(birthDate) : inRange(p.age, 18, 100),
    height: inRange(p.height, 100, 230),
    hrmax: inRange(p.hrmax, 100, 230),
    rhr: inRange(p.rhr, 25, 120),
    activity: Object.hasOwn(ACTIVITY_LEVELS, p.activity) ? p.activity : "",
    sportHours: p.sportHours==='auto'||Object.hasOwn(SPORT_HOURS, p.sportHours) ? p.sportHours : "",
    goal: Object.hasOwn(GOALS, p.goal) ? p.goal : "",
    targetWeight: inRange(p.targetWeight, 35, 250),
    // Sleep: an own goal (6–10 h, in minutes) and the alarm on work days and
    // at the weekend ("HH:MM"); empty means the usual from recorded nights.
    sleepGoal: inRange(p.sleepGoal, 360, 600),
    wakeTime: clockText(p.wakeTime),
    wakeTimeWeekend: clockText(p.wakeTimeWeekend),
    ...normalizeFocus(p)
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
  const goal = GOALS[p.goal] || GOALS["lose_0.5"];
  if (missing.length) {
    // The owner keeps the calibrated baseline until the profile is complete;
    // weight stays required for everyone.
    if (isOwner && weight > 0) return { ready: true, source: "owner-calibration", missing, weightKg: weight, bmr: null, sportDaily: 0, targetWeightKg: p.targetWeight ?? OWNER_CALIBRATION.targetWeightKg, ...OWNER_CALIBRATION, deficit: p.goal ? Math.round(-goal.kgPerWeek * 7700 / 7) || 0 : OWNER_CALIBRATION.deficit };
    return { ready: false, source: null, missing, weightKg: weight > 0 ? weight : null };
  }
  const bmr = restingMetabolicRate(p, weight);
  const sportHours = Object.hasOwn(SPORT_HOURS, p.sportHours) ? SPORT_HOURS[p.sportHours] : p.weeklyHours ?? 0;
  const sportDaily = activityTracked ? 0 : sportHours * weight * SPORT_KCAL_PER_KG_HOUR / 7;
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

// Protein follows lean mass more than total weight: above BMI 30 the weight
// at BMI 27 is the reference, so a heavy beginner is not told to eat 250 g.
export function proteinReferenceKg(weightKg, heightCm) {
  const kg = Number(weightKg), m = Number(heightCm) / 100;
  if (!(kg > 0)) return null;
  if (!(m >= 1 && m <= 2.3) || kg / (m * m) <= 30) return kg;
  return Math.round(27 * m * m * 10) / 10;
}

// A correction from the weight trend by energy balance: intake = expenditure
// + change in body stores (Racette 2012). The gap between the measured weekly
// rate (a least-squares slope of the weigh-ins, see d1WeightTrend) and the
// goal, at 7700 kcal per kg, is how much the day's intake is off. Half of it is
// applied, at most ±250 kcal, rounded to 25: early weight change is partly
// water and glycogen, worth less energy than tissue (Hall 2011), and a
// smaller step keeps the target from chasing noise. Needs 4 weigh-ins over 3
// weeks. No change while the rate is within the goal's range: losing between
// half and 1.5× the goal, maintaining within ±0.25 kg a week.
// The loop also corrects a systematic error of the wearable's energy figures.
export function trendAdjustment(goalKey, trend) {
  const rate = Number(trend?.weeklyRateKg), samples = Number(trend?.samples || 0), span = trend?.spanDays;
  if (trend?.weeklyRateKg == null || !Number.isFinite(rate) || samples < 4 || (span != null && Number(span) < 21)) return { adjustment: 0, reason: "insufficient_weight_history" };
  const goal = (GOALS[goalKey] || GOALS["lose_0.5"]).kgPerWeek;
  const step = gap => { const kcal = Math.max(-250, Math.min(250, -gap * 7700 / 7 * 0.5)); return Math.round(kcal / 25) * 25 || 0; };
  if (goal < 0) {
    if (rate > goal / 2) return { adjustment: step(rate - goal), reason: "loss_below_target" };
    if (rate < goal * 1.5) return { adjustment: step(rate - goal), reason: "loss_above_target" };
    return { adjustment: 0, reason: "within_target_range" };
  }
  if (rate > 0.25) return { adjustment: step(rate), reason: "gaining_while_maintaining" };
  if (rate < -0.25) return { adjustment: step(rate), reason: "losing_while_maintaining" };
  return { adjustment: 0, reason: "within_target_range" };
}
export const TREND_REASONS = bilingual({
  loss_below_target: "váha klesá pomaleji, než je cíl",
  loss_above_target: "váha klesá rychleji, než je cíl",
  gaining_while_maintaining: "váha při udržování roste",
  losing_while_maintaining: "váha při udržování klesá"
}, {
  loss_below_target: "weight is falling slower than the goal",
  loss_above_target: "weight is falling faster than the goal",
  gaining_while_maintaining: "weight is rising while maintaining",
  losing_while_maintaining: "weight is falling while maintaining"
});

export const MISSING_LABELS = bilingual({ weight: "váha", sex: "pohlaví", age: "datum narození", height: "výška", activity: "denní aktivita", goal: "cíl", sportHours: "sport za týden" }, { weight: "weight", sex: "sex", age: "date of birth", height: "height", activity: "daily activity", goal: "goal", sportHours: "sport per week" });

// The user's own values, with what the app worked out itself (height,
// activity, resting and maximum heart rate, birth date) filling only the
// empty fields. A birth date sets the age.
export const SUGGESTED_FIELDS = ["height", "activity", "rhr", "hrmax", "birthDate"];
export function effectiveProfile(saved, suggested) {
  const profile = { ...(saved || {}) };
  for (const key of SUGGESTED_FIELDS) if ((profile[key] == null || profile[key] === "") && suggested?.[key]) profile[key] = suggested[key];
  profile.mainSport = normalizeFocus(profile).mainSport;
  if (ageFrom(profile.birthDate) != null) profile.age = ageFrom(profile.birthDate);
  return profile;
}
