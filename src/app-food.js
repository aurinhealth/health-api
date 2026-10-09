// The Food screen of the native iPhone app (ios-native/) in one response: what
// was eaten against the day's target (with the training bonus), the macros,
// the day's meals in the slots the athlete chose (profile.meals), each with its
// share of the day's target and a suggestion for the slots still ahead, and
// water. Pure: GET /app/api/food-today loads the inputs.
import { localDateTime } from "./user-time.js";
import { MEAL_DEFAULT_TIMES } from "./food-log.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

export const MEALS = [
  { type: "breakfast", label: "Snídaně", share: 0.25 },
  { type: "snack_am", label: "Dopolední svačina", share: 0.1 },
  { type: "lunch", label: "Oběd", share: 0.3 },
  { type: "snack_pm", label: "Odpolední svačina", share: 0.1 },
  { type: "dinner", label: "Večeře", share: 0.25 },
  { type: "snack_late", label: "Druhá večeře", share: 0.08 }
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

function noteOf(entry) {
  try { const n = JSON.parse(entry?.note || "{}"); return n && typeof n === "object" && !Array.isArray(n) ? n : {}; } catch { return {}; }
}

export function buildFood({ date, hour = null, daily = {}, food = {}, fluids = {}, slots = null }) {
  const chosen = Array.isArray(slots) && slots.length ? MEALS.filter(m => slots.includes(m.type)).map(m => m.type) : USUAL;
  const nutrition = daily.nutrition || {};
  const macros = nutrition.macros || {};
  const breakdown = nutrition.calorieBreakdown || {};
  const bonus = num(breakdown.activityAdjustment) != null ? Math.round(num(breakdown.activityAdjustment) * (num(breakdown.trainingCoverage) ?? 0.7)) : null;
  const target = num(nutrition.calorieTarget);

  const entries = (Array.isArray(food.entries) ? food.entries : [])
    .filter(e => e && !["planned", "cancelled"].includes(e.status))
    .map(e => {
      const note = noteOf(e), time = entryTime(e.consumed_at);
      const amount = num(note.enteredQuantity ?? note.amount), unit = note.enteredUnit || note.unit || null;
      return {
        id: e.id,
        name: String(e.recipe_title || note.product || "Jídlo").slice(0, 120),
        time,
        meal: mealOf(note, time, chosen),
        kcal: round(num(e.kcal)),
        protein: round(num(e.protein_g), 1),
        carbs: round(num(e.carbs_g), 1),
        fat: round(num(e.fat_g), 1),
        fiber: round(num(e.fiber_g), 1),
        sugar: round(num(note.sugar_g), 1),
        salt: round(num(note.salt_g), 2),
        amount: amount != null && unit ? round(amount, 1) + " " + (unit === "portion" ? "porce" : unit === "piece" ? "ks" : unit) : null,
        brand: note.brand || null
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

  return {
    status: "ok",
    date,
    kcal: eaten.kcal,
    target,
    trainingBonus: bonus,
    sentence: sentence({ eaten: eaten.kcal || 0, target, bonus, left, next: meals.find(m => m.suggestion) }),
    macros: {
      carbs: { eaten: eaten.carbs, target: num(macros.carbs_g) },
      protein: { eaten: eaten.protein, target: num(macros.protein_g) },
      fat: { eaten: eaten.fat, target: num(macros.fat_g) },
      fiber: { eaten: eaten.fiber, target: fiberTarget },
      sugar: { eaten: eaten.sugar, target: sugarLimit }
    },
    mealSlots: chosen,
    meals,
    water: {
      ml: num(fluids.hydrationMl ?? fluids.totalMl), target: num(fluids.target?.ml), drunkMl: num(fluids.totalMl),
      entries: (Array.isArray(fluids.entries) ? fluids.entries : []).filter(f => f && f.kind !== "food").length,
      drinks: (Array.isArray(fluids.entries) ? fluids.entries : []).filter(f => f && f.kind !== "food" && Number(f.id) > 0)
        .map(f => ({ id: Number(f.id), kind: f.kind, ml: num(f.ml), hydrationMl: num(f.hydrationMl ?? f.ml), time: entryTime(f.consumedAt) }))
    }
  };
}

function sentence({ eaten, target, bonus, left, next }) {
  if (target == null) return null;
  const parts = [];
  if (bonus > 50) parts.push(`Tréninkový den: o ${bonus} kcal víc.`);
  if (eaten > target + 100) parts.push(`Dnes je to o ${Math.round(eaten - target)} kcal nad cílem.`);
  else if (left != null && left <= 100) parts.push("Cíl na dnešek je splněný.");
  else if (next) parts.push(`Zbývá ${Math.round(left)} kcal, ${next.label.toLowerCase()} kolem ${next.suggestion.kcal} kcal.`);
  else parts.push(`Zbývá ${Math.round(left)} kcal.`);
  return parts.join(" ");
}
