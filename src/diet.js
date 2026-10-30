// Settings → Nutrition → Diet: what the athlete eats and how the day's
// calories are shared out among protein, carbohydrate and fat. The calories
// themselves come from the goal and the training (index.js, energy-budget.js);
// the diet never changes them, it only splits them. Research and the numbers
// behind each style: audit/typ-stravy-a-vlastni-cile-2026-10-30.md (ISSN 2017
// protein position stand, Morton 2018, AND/DC/ACSM 2016, IOM iron and zinc).
//
// All of it lives in the profile row every target already reads, so a diet
// adds no query and no row.

export const EATING = ["everything", "pescatarian", "vegetarian", "vegan"];
export const STYLES = ["balanced", "high_protein", "lower_carb", "keto", "custom"];

const num = v => (v === null || v === undefined || v === "" ? NaN : Number(v));
const inRange = (v, lo, hi, step) => { const x = num(v); return Number.isFinite(x) && x >= lo && x <= hi ? Number((Math.round(x / step) * step).toFixed(2)) : null; };

// Protein of one's own, g per kg of the reference weight.
export const PROTEIN_RANGE = [1.2, 3.0];
// Keto: the day's net carbs, default 30 g.
export const KETO_CARBS = { min: 20, max: 50, default: 30 };
// Lower carb: a cap on ordinary days, raised on a big training day.
const LOWER_CARB_CAP = 100, LOWER_CARB_TRAINING_PER_KG = 2.0;
// Fat never below this (essential fatty acids, vitamins A, D, E, K).
export const FAT_FLOOR_PER_KG = 0.5;

// The diet fields of the profile, cleaned (normalizeProfile spreads them in).
export function normalizeDiet(p = {}) {
  const style = STYLES.includes(p.dietStyle) ? p.dietStyle : "balanced";
  return {
    dietEating: EATING.includes(p.dietEating) ? p.dietEating : "everything",
    dietStyle: style,
    // null = Auto (by goal and sport).
    proteinPerKg: inRange(p.proteinPerKg, ...PROTEIN_RANGE, 0.1),
    netCarbLimit: inRange(p.netCarbLimit, KETO_CARBS.min, KETO_CARBS.max, 5),
    // Custom: protein, then either carbs (g) or fat (g/kg); the other fills the calories.
    customSet: p.customSet === "carbs" ? "carbs" : "fat",
    customCarbs: inRange(p.customCarbs, 0, 800, 5),
    customFatPerKg: inRange(p.customFatPerKg, FAT_FLOOR_PER_KG, 2.5, 0.1),
    nutrientTargets: cleanTargets(p.nutrientTargets)
  };
}

// Own vitamin and mineral targets, {key: amount}; the keys are checked by
// micronutrients.js, which knows them (this module must not import it).
function cleanTargets(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [key, value] of Object.entries(v)) {
    const x = num(value);
    if (/^[a-z0-9]{1,8}$/.test(key) && Number.isFinite(x) && x > 0 && x < 100000) out[key] = Math.round(x * 100) / 100;
  }
  return out;
}

// What only Aurin Pro may keep (checked once when the profile is saved).
export function withoutProDiet(profile) {
  return { ...profile, dietStyle: profile.dietStyle === "custom" ? "balanced" : profile.dietStyle, proteinPerKg: null, nutrientTargets: {} };
}

// Auto protein, g/kg: by the goal (ISSN 1.4–2.0; more in a deficit to keep
// muscle), +0.2 when the main sport is the gym, +0.2 on a vegan diet
// (less leucine, lower digestibility of plant protein).
export function autoProteinPerKg(profile = {}) {
  const goal = String(profile.goal || "");
  let perKg = goal.startsWith("lose") ? 2.0 : goal.startsWith("gain") ? 1.8 : 1.6;
  if (profile.mainSport === "strength") perKg += 0.2;
  if (profile.dietEating === "vegan") perKg += 0.2;
  return Math.round(perKg * 10) / 10;
}

// Fat on a balanced day, g/kg: less before and on endurance days to leave
// room for glycogen, more on an ordinary rest day (more satiating).
function balancedFatPerKg(context = {}) {
  if (context.endurance || context.preRide) return 0.70;
  if (context.recoveryRide) return 0.75;
  if (context.strength) return 0.85;
  return 0.90;
}

// A day with a lot of training: an hour and a half of endurance, or
// endurance with the gym.
const bigDay = context => Number(context.totalEnduranceHours || 0) >= 1.5 || (context.endurance && context.strength);

// The day's macros for the reference weight (proteinReferenceKg) and the
// calorie target. fill says which macro takes what the calories leave, so a
// later change of the target (energy-budget.js) moves the same one; carbsMax
// marks carbohydrate as a limit (lower carb, keto), net that it is net carbs.
export function dayMacros(kg, kcal, context = {}, profile = {}) {
  kg = Number(kg); kcal = Number(kcal);
  if (!(kg > 0) || !(kcal > 0)) return null;
  const d = normalizeDiet(profile || {});
  const auto = autoProteinPerKg({ ...profile, dietEating: d.dietEating });
  let perKg = d.proteinPerKg ?? auto;
  if (d.proteinPerKg == null && d.dietStyle === "high_protein") perKg = Math.max(auto, String(profile?.goal || "").startsWith("lose") ? 2.4 : 2.2);
  if (d.proteinPerKg == null && d.dietStyle === "keto") perKg = Math.max(auto, 1.6);
  const protein = Math.round(kg * perKg), floor = Math.round(kg * FAT_FLOOR_PER_KG);
  const rest = kcal - protein * 4;
  let carbs, fat, fill = "carbs", carbsMax = false, net = false;
  if (d.dietStyle === "keto" || d.dietStyle === "lower_carb" || (d.dietStyle === "custom" && d.customSet === "carbs")) {
    const wanted = d.dietStyle === "keto" ? d.netCarbLimit ?? KETO_CARBS.default
      : d.dietStyle === "lower_carb" ? (bigDay(context) ? Math.max(LOWER_CARB_CAP, Math.round(kg * LOWER_CARB_TRAINING_PER_KG)) : LOWER_CARB_CAP)
        : d.customCarbs ?? 200;
    carbs = Math.max(0, Math.min(wanted, Math.floor((rest - floor * 9) / 4)));
    fat = Math.max(floor, Math.round((rest - carbs * 4) / 9));
    fill = "fat"; carbsMax = d.dietStyle !== "custom"; net = d.dietStyle === "keto";
  } else {
    const fatPerKg = d.dietStyle === "custom" ? d.customFatPerKg ?? 0.9 : d.dietStyle === "high_protein" ? 0.7 : balancedFatPerKg(context);
    fat = Math.max(floor, Math.round(kg * fatPerKg));
    carbs = Math.max(0, Math.round((rest - fat * 9) / 4));
  }
  return {
    protein_g: protein, carbs_g: carbs, fat_g: fat,
    fill, carbs_max: carbsMax, net_carbs: net, fat_floor_g: floor,
    protein_per_kg: Math.round(perKg * 10) / 10, protein_auto: d.proteinPerKg == null,
    // About 0.25 g/kg at a meal (ISSN), 20–40 g: what the next meal should bring.
    protein_per_meal_g: Math.max(20, Math.min(40, Math.round(kg * 0.25 / 5) * 5))
  };
}

// A new calorie target for macros already worked out: protein stays, the
// macro that fills (carbs, or fat on keto and lower carb) takes the change.
export function refillMacros(macros, kcal) {
  const m = macros || {}, target = Number(kcal);
  if (!(target > 0)) return m;
  const protein = Number(m.protein_g ?? m.proteinGrams ?? 0), carbs = Number(m.carbs_g ?? 0), fat = Number(m.fat_g ?? m.fatGrams ?? 0);
  if (m.fill === "fat") {
    const floor = Number(m.fat_floor_g) || 0;
    const left = target - protein * 4 - carbs * 4;
    m.fat_g = Math.max(floor, Math.round(left / 9));
    // Too few calories for the carbs and the fat floor: the carbs give way.
    if (left < m.fat_g * 9) m.carbs_g = Math.max(0, Math.round((target - protein * 4 - m.fat_g * 9) / 4));
  } else {
    m.carbs_g = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
  }
  return m;
}

// The diet in a few fields, for the Food screen, the coach and the prompts.
export function dietSummary(profile = {}, macros = null) {
  const d = normalizeDiet(profile || {});
  return {
    eating: d.dietEating, style: d.dietStyle,
    proteinPerKg: macros?.protein_per_kg ?? null, proteinAuto: macros?.protein_auto ?? d.proteinPerKg == null,
    proteinPerMealG: macros?.protein_per_meal_g ?? null,
    carbsLimitG: macros?.carbs_max ? macros.carbs_g : null, netCarbs: Boolean(macros?.net_carbs)
  };
}

// Whether a meal (its name and ingredients, Czech or English) suits what
// the athlete eats. Plant versions ("sójový jogurt", "oat milk", "peanut
// butter") are taken out first, so they never count as dairy.
const PLANT = /(sójov|rostlinn|ovesn|mandlov|kokosov|rýžov|arašídov|\bsoya?\b|\boat\b|\balmond\b|\bcoconut\b|\brice\b|\bplant\b|\bvegan\b|\bpeanut\b|\bnut\b)\p{L}*\s+\S+/giu;
const MEAT = /maso|masem|kuř|krůt|hověz|vepř|šunk|slanin|klobás|párk|salám|kachn|jehně|telecí|zvěřin|játr|hamburg|\b(chicken|turkey|beef|pork|ham|bacon|sausages?|salami|duck|lamb|veal|steak|liver|prosciutto|chorizo|pepperoni|meat)\b/iu;
const FISH = /\bryb(?!íz)|tuňák|losos|tresk|sardin|makrel|krevet|pstruh|ančovič|\b(fish|tuna|salmon|cod|sardines?|mackerel|shrimps?|prawns?|trout|anchov\w*|seafood)\b/iu;
const ANIMAL = /mlék|mléč|sýr|jogurt|skyr|tvaroh|cottage|smetan|másl|vejc|vajíč|vaječ|\bmed(em|u)?\b|medov|mozzarell|parmaz|ricott|mascarpon|\b(milk|cheese|yogh?urt|quark|cream|butter|eggs?|honey|whey|feta|kefir)\b/iu;
export function fitsEating(text, eating) {
  if (!eating || eating === "everything") return true;
  const t = String(text || "").replace(PLANT, " ");
  if (MEAT.test(t)) return false;
  if (eating === "pescatarian") return true;
  if (FISH.test(t)) return false;
  return eating === "vegetarian" || !ANIMAL.test(t);
}
