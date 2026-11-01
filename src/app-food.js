// The Food screen of the native iPhone app (ios-native/) in one response: what
// was eaten against the day's target (with the training bonus), the macros,
// the day's meals in the slots the athlete chose (profile.meals), each with its
// share of the day's target and a suggestion for the slots still ahead, and
// water. Pure: GET /app/api/food-today loads the inputs.
import { localDateTime, localToday } from "./user-time.js";
import { MEAL_DEFAULT_TIMES } from "./food-log.js";
import { L } from "./lang.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// The label follows the app language when read (lang.js).
const slot = (type, cs, en, share) => ({ type, share, get label() { return L(cs, en); } });
export const MEALS = [
  slot("breakfast", "Snídaně", "Breakfast", 0.25),
  slot("snack_am", "Dopolední svačina", "Morning snack", 0.1),
  slot("lunch", "Oběd", "Lunch", 0.3),
  slot("snack_pm", "Odpolední svačina", "Afternoon snack", 0.1),
  slot("dinner", "Večeře", "Dinner", 0.25),
  slot("snack_late", "Druhá večeře", "Late snack", 0.08)
];
const USUAL = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"];

// "HH:MM" of an entry: times stored with a zone are converted to the user's
// zone, local ones ("2026-10-08T12:30:00", typed by the user) are as they are.
export function entryTime(at) {
  const s = String(at || "");
  if (!/T\d{2}:\d{2}/.test(s)) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const local = localDateTime(s);
    return /T\d{2}:\d{2}/.test(local) ? local.slice(11, 16) : null;
  }
  return s.slice(11, 16);
}

// The slot of an entry: the meal it was logged to, else by the time of day
// (late in the evening the second dinner, when the athlete has one).
export function mealOf(note, time, slots = USUAL) {
  const type = String(note?.mealType || "");
  if (type === "snack") return time && time < "12:00" ? "snack_am" : time && time >= "20:30" && slots.includes("snack_late") ? "snack_late" : "snack_pm";
  if (MEALS.some(m => m.type === type)) return type;
  if (!time) return "snack_pm";
  if (time >= "20:30" && slots.includes("snack_late")) return "snack_late";
  return time < "10:00" ? "breakfast" : time < "11:30" ? "snack_am" : time < "14:30" ? "lunch" : time < "17:30" ? "snack_pm" : "dinner";
}

// Czech keeps "porce" and "ks" for any amount, as before.
const unitLabel = (unit, amount) => unit === "portion" ? L("porce", amount === 1 ? "serving" : "servings")
  : unit === "piece" ? L("ks", amount === 1 ? "pc" : "pcs") : unit;

function noteOf(entry) {
  try { const n = JSON.parse(entry?.note || "{}"); return n && typeof n === "object" && !Array.isArray(n) ? n : {}; } catch { return {}; }
}

// The day's calorie target split into the everyday intake (what a day without
// training gets: the resting intake, or the safe minimum when that is higher)
// and what training adds. Training counts only for what it really raises the
// target by: on a day held at the safe minimum, a session that ends below it
// adds nothing, so the day never shows "+433 trénink" on a target it did not move.
export function dayCalories(nutrition = {}) {
  const breakdown = nutrition.calorieBreakdown || {};
  const target = num(nutrition.calorieTarget);
  const raw = num(breakdown.activityAdjustment) != null ? Math.round(num(breakdown.activityAdjustment) * (num(breakdown.trainingCoverage) ?? 0.7)) : null;
  if (target == null) return { target: null, everyday: null, bonus: raw };
  // An own goal (Cíle → Kalorie) is the same every day.
  if (nutrition.ownTarget) return { target, everyday: Math.round(target), bonus: null };
  const rest = num(breakdown.restIntakeTarget);
  const everyday = Math.min(Math.round(target), rest != null
    ? Math.max(num(breakdown.minTarget) ?? 0, Math.round(rest + (num(breakdown.sportDailyAverage) ?? 0)))
    : Math.round(target) - Math.max(0, raw ?? 0));
  return { target, everyday, bonus: raw != null ? Math.min(raw, Math.max(0, Math.round(target) - everyday)) : null };
}

// The day's target in its parts for the Food screen: the base (resting burn,
// everyday movement and the weight goal, held up by the safe minimum and raised
// when the watch measures a more active day than usual), the workouts already
// done and the ones still planned. Each workout counts with the share of its
// burn the target takes (trainingCoverage), never more than training really
// raised the target by (dayCalories), so the three parts always add up to the
// target. A day gone by keeps only what was done. An own goal has no parts.
export function targetParts(nutrition = {}, { past = false } = {}) {
  const { target, everyday, bonus } = dayCalories(nutrition);
  if (target == null || nutrition.ownTarget) return null;
  const breakdown = nutrition.calorieBreakdown || {};
  const coverage = num(breakdown.trainingCoverage) ?? 0.7;
  const all = (Array.isArray(breakdown.workouts) ? breakdown.workouts : [])
    .filter(w => w && num(w.kcal) > 0 && (w.kind === "done" || (w.kind === "planned" && !past)));
  let room = Math.max(0, bonus ?? 0);
  const part = kind => {
    const list = all.filter(w => w.kind === kind);
    const wanted = Math.round(list.reduce((s, w) => s + num(w.kcal) * coverage, 0));
    const total = Math.min(wanted, room);
    room -= total;
    // Each workout's share of the part, the last one takes the rounding.
    let given = 0;
    const items = list.map((w, i) => {
      const counted = i === list.length - 1 ? total - given : Math.round(total * num(w.kcal) * coverage / Math.max(wanted, 1));
      given += counted;
      return { kind, type: w.type || null, name: w.name ? String(w.name).slice(0, 80) : null, minutes: num(w.minutes) || null, kcal: Math.round(num(w.kcal)), counted };
    });
    return { total, items };
  };
  const done = part("done"), planned = part("planned");
  const base = Math.round(target) - done.total - planned.total;
  const resting = num(breakdown.baselineRestTDEE), movement = num(breakdown.sportDailyAverage) ?? 0, rest = num(breakdown.restIntakeTarget);
  let lines = null;
  if (resting != null && rest != null) {
    // Whole numbers that add up to the base: the goal takes the rounding.
    const expected = Math.round(rest + movement), goal = expected - Math.round(resting) - Math.round(movement);
    const minimum = Math.max(0, (everyday ?? expected) - expected), moreActive = base - expected - minimum;
    // Only at the 4000 kcal ceiling would the lines not add up: then the base alone.
    if (moreActive >= 0) lines = { restingBurn: Math.round(resting), movement: Math.round(movement), goal, minimum, moreActive };
  }
  return { base, workouts: done.total, planned: planned.total, coverage, lines, items: [...done.items, ...planned.items] };
}

export function buildFood({ date, hour = null, daily = {}, food = {}, fluids = {}, slots = null }) {
  const chosen = Array.isArray(slots) && slots.length ? MEALS.filter(m => slots.includes(m.type)).map(m => m.type) : USUAL;
  const nutrition = daily.nutrition || {};
  const macros = nutrition.macros || {};
  const breakdown = nutrition.calorieBreakdown || {};
  const { target, everyday, bonus } = dayCalories(nutrition);

  const entries = (Array.isArray(food.entries) ? food.entries : [])
    .filter(e => e && !["planned", "cancelled"].includes(e.status))
    .map(e => {
      const note = noteOf(e), time = entryTime(e.consumed_at);
      const amount = num(note.enteredQuantity ?? note.amount), unit = note.enteredUnit || note.unit || null;
      return {
        id: e.id,
        name: String(e.recipe_title || note.product || L("Jídlo", "Food")).slice(0, 120),
        time,
        meal: mealOf(note, time, chosen),
        kcal: round(num(e.kcal)),
        protein: round(num(e.protein_g), 1),
        carbs: round(num(e.carbs_g), 1),
        fat: round(num(e.fat_g), 1),
        fiber: round(num(e.fiber_g), 1),
        sugar: round(num(note.sugar_g), 1),
        salt: round(num(note.salt_g), 2),
        amount: amount != null && unit ? round(amount, 1) + " " + unitLabel(unit, round(amount, 1)) : null,
        brand: note.brand || null,
        // Logged in another app and read from Apple or Google Health, or such a
        // food moved in Aurin (food-entry-management.js): shown with its name;
        // only its meal and day change.
        ...(e.source === "apple-health" || e.source === "google-health" ? { app: String(note.app || (e.source === "google-health" ? "Google Health" : "Apple Health")).slice(0, 60) }
          : note.from_app ? { app: String(note.from_app).slice(0, 60) } : {}),
        ...(note.estimate === true ? { estimate: true } : {})
      };
    });
  const sum = key => round(entries.reduce((s, e) => s + (e[key] || 0), 0), key === "kcal" ? 0 : 1);
  const totals = food.totals || {};
  const eaten = { kcal: round(num(totals.kcal)) ?? sum("kcal"), protein: round(num(totals.protein_g)) ?? sum("protein"), carbs: round(num(totals.carbs_g)) ?? sum("carbs"), fat: round(num(totals.fat_g)) ?? sum("fat"), fiber: round(num(totals.fiber_g)) ?? sum("fiber"), sugar: sum("sugar") };
  // Fibre: 14 g per 1000 kcal (US Dietary Guidelines), at least the EFSA 25 g.
  const fiberTarget = target != null ? Math.max(25, Math.round(target / 1000 * 14)) : 30;
  // Added and free sugars: at most a tenth of the energy (WHO), 4 kcal per gram.
  const sugarLimit = target != null ? Math.round(target * 0.1 / 4) : 50;
  // The chosen slots, plus any other slot something was logged to.
  const active = MEALS.filter(m => chosen.includes(m.type) || entries.some(e => e.meal === m.type));
  const allShares = active.reduce((s, m) => s + m.share, 0);

  // Slots still ahead get a share of what is left of the target, in the
  // proportions of a usual day (a quarter for breakfast and dinner, …).
  const now = hour == null ? null : String(hour).padStart(2, "0") + ":00";
  const open = active.filter(m => !entries.some(e => e.meal === m.type) && (now == null || MEAL_DEFAULT_TIMES[m.type] >= now));
  const left = target != null ? Math.max(0, target - (eaten.kcal || 0)) : null;
  const shares = open.reduce((s, m) => s + m.share, 0);
  const leftOf = (key, eatenValue) => num(macros[key]) != null ? Math.max(0, num(macros[key]) - (eatenValue || 0)) : null;
  const proteinLeft = leftOf("protein_g", eaten.protein), carbsLeft = leftOf("carbs_g", eaten.carbs), fatLeft = leftOf("fat_g", eaten.fat);
  const slice = (value, m, step) => value != null ? Math.round(value * m.share / shares / step) * step : null;
  // The meal's part of the whole day's target: what to aim for at that meal.
  const part = (value, m, step) => value != null && allShares > 0 ? Math.round(value * m.share / allShares / step) * step : null;

  const meals = active.map(m => {
    const items = entries.filter(e => e.meal === m.type).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    const isOpen = open.includes(m);
    return {
      type: m.type,
      label: m.label,
      time: items.find(e => e.time)?.time || MEAL_DEFAULT_TIMES[m.type],
      kcal: items.length ? round(items.reduce((s, e) => s + (e.kcal || 0), 0)) : null,
      entries: items,
      target: target != null ? {
        kcal: part(target, m, 10),
        protein: part(num(macros.protein_g), m, 5),
        carbs: part(num(macros.carbs_g), m, 5),
        fat: part(num(macros.fat_g), m, 1)
      } : null,
      suggestion: isOpen && left != null && shares > 0 ? {
        kcal: slice(left, m, 10),
        protein: slice(proteinLeft, m, 5),
        carbs: slice(carbsLeft, m, 5),
        fat: slice(fatLeft, m, 5)
      } : null
    };
  });

  const weight = daily.weight || {};
  return {
    status: "ok",
    date,
    kcal: eaten.kcal,
    target,
    trainingBonus: bonus,
    // The day's target without what training and movement add (Týdenní kalorie).
    everyday,
    // The target in its parts: base, workouts done and planned (Food screen).
    targetParts: targetParts(nutrition, { past: date < localToday() }),
    // For the coach's text (screen-texts.js): the hour, the safe minimum and the weight goal.
    hour,
    minimumKcal: num(breakdown.minTarget),
    goal: {
      weightKg: num(weight.current ?? nutrition.currentWeight), average7dKg: num(weight.average7d), average30dKg: num(weight.average30d),
      targetWeightKg: num(nutrition.targetWeightKg), deficitKcal: num(breakdown.weightLossDeficit)
    },
    sentence: sentence({ eaten: eaten.kcal || 0, target, bonus, left, next: meals.find(m => m.suggestion) }),
    macros: {
      // On keto and lower carb the carbs are a limit, on keto net carbs (diet.js).
      carbs: { eaten: eaten.carbs, target: num(macros.carbs_g), ...(macros.carbs_max ? { limit: true } : {}), ...(macros.net_carbs ? { net: true } : {}) },
      protein: { eaten: eaten.protein, target: num(macros.protein_g) },
      fat: { eaten: eaten.fat, target: num(macros.fat_g) },
      fiber: { eaten: eaten.fiber, target: fiberTarget },
      sugar: { eaten: eaten.sugar, target: sugarLimit }
    },
    mealSlots: chosen,
    // Settings → Nutrition → Diet as it applies today (Diet page, coach texts).
    diet: nutrition.diet ? { ...nutrition.diet, carbsLimitG: macros.carbs_max ? num(macros.carbs_g) : null } : null,
    meals,
    water: {
      ml: num(fluids.hydrationMl ?? fluids.totalMl), target: num(fluids.target?.ml), drunkMl: num(fluids.totalMl),
      entries: (Array.isArray(fluids.entries) ? fluids.entries : []).filter(f => f && f.kind !== "food").length,
      drinks: (Array.isArray(fluids.entries) ? fluids.entries : []).filter(f => f && f.kind !== "food" && Number(f.id) > 0)
        .map(f => ({ id: Number(f.id), kind: f.kind, ml: num(f.ml), hydrationMl: num(f.hydrationMl ?? f.ml), time: entryTime(f.consumedAt), ...(f.app ? { app: String(f.app) } : {}) }))
    }
  };
}

function sentence({ eaten, target, bonus, left, next }) {
  if (target == null) return null;
  const parts = [];
  if (bonus > 50) parts.push(L(`Tréninkový den: o ${bonus} kcal víc.`, `Training day: ${bonus} kcal extra.`));
  if (eaten > target + 100) parts.push(L(`Dnes je to o ${Math.round(eaten - target)} kcal nad cílem.`, `${Math.round(eaten - target)} kcal over today's target.`));
  else if (left != null && left <= 100) parts.push(L("Cíl na dnešek je splněný.", "Today's target is reached."));
  else if (next) parts.push(L(`Zbývá ${Math.round(left)} kcal, ${next.label.toLowerCase()} kolem ${next.suggestion.kcal} kcal.`, `${Math.round(left)} kcal left, ${next.label.toLowerCase()} around ${next.suggestion.kcal} kcal.`));
  else parts.push(L(`Zbývá ${Math.round(left)} kcal.`, `${Math.round(left)} kcal left.`));
  return parts.join(" ");
}
