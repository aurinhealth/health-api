// The Food screen of the native iPhone app (ios-native/) in one response: what
// was eaten against the day's target (with the training bonus), the macros,
// the day's meals in their slots with a suggestion for the slots still ahead,
// and water. Pure: GET /app/api/food-today loads the inputs.
import { localDateTime } from "./user-time.js";
import { MEAL_DEFAULT_TIMES } from "./food-log.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

export const MEALS = [
  { type: "breakfast", label: "Snídaně", share: 0.25 },
  { type: "snack_am", label: "Dopolední svačina", share: 0.1 },
  { type: "lunch", label: "Oběd", share: 0.3 },
  { type: "snack_pm", label: "Odpolední svačina", share: 0.1 },
  { type: "dinner", label: "Večeře", share: 0.25 }
];

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

// The slot of an entry: the meal it was logged to, else by the time of day.
export function mealOf(note, time) {
  const type = String(note?.mealType || "");
  if (type === "snack") return time && time < "12:00" ? "snack_am" : "snack_pm";
  if (MEALS.some(m => m.type === type)) return type;
  if (!time) return "snack_pm";
  return time < "10:00" ? "breakfast" : time < "11:30" ? "snack_am" : time < "14:30" ? "lunch" : time < "17:30" ? "snack_pm" : "dinner";
}

function noteOf(entry) {
  try { const n = JSON.parse(entry?.note || "{}"); return n && typeof n === "object" && !Array.isArray(n) ? n : {}; } catch { return {}; }
}

export function buildFood({ date, hour = null, daily = {}, food = {}, fluids = {} }) {
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
        meal: mealOf(note, time),
        kcal: round(num(e.kcal)),
        protein: round(num(e.protein_g), 1),
        carbs: round(num(e.carbs_g), 1),
        fat: round(num(e.fat_g), 1),
        amount: amount != null && unit ? round(amount, 1) + " " + (unit === "portion" ? "porce" : unit === "piece" ? "ks" : unit) : null,
        brand: note.brand || null
      };
    });
  const sum = key => round(entries.reduce((s, e) => s + (e[key] || 0), 0), key === "kcal" ? 0 : 1);
  const totals = food.totals || {};
  const eaten = { kcal: round(num(totals.kcal)) ?? sum("kcal"), protein: round(num(totals.protein_g)) ?? sum("protein"), carbs: round(num(totals.carbs_g)) ?? sum("carbs"), fat: round(num(totals.fat_g)) ?? sum("fat") };

  // Slots still ahead get a share of what is left of the target, in the
  // proportions of a usual day (a quarter for breakfast and dinner, …).
  const now = hour == null ? null : String(hour).padStart(2, "0") + ":00";
  const open = MEALS.filter(m => !entries.some(e => e.meal === m.type) && (now == null || MEAL_DEFAULT_TIMES[m.type] >= now));
  const left = target != null ? Math.max(0, target - (eaten.kcal || 0)) : null;
  const shares = open.reduce((s, m) => s + m.share, 0);
  const proteinLeft = num(macros.protein_g) != null ? Math.max(0, num(macros.protein_g) - (eaten.protein || 0)) : null;

  const meals = MEALS.map(m => {
    const items = entries.filter(e => e.meal === m.type).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    const isOpen = open.includes(m);
    return {
      type: m.type,
      label: m.label,
      time: items.find(e => e.time)?.time || MEAL_DEFAULT_TIMES[m.type],
      kcal: items.length ? round(items.reduce((s, e) => s + (e.kcal || 0), 0)) : null,
      entries: items,
      suggestion: isOpen && left != null && shares > 0 ? {
        kcal: Math.round(left * m.share / shares / 10) * 10,
        protein: proteinLeft != null ? Math.round(proteinLeft * m.share / shares / 5) * 5 : null
      } : null
    };
  }).filter(m => m.entries.length || m.suggestion);

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
      fat: { eaten: eaten.fat, target: num(macros.fat_g) }
    },
    meals,
    water: { ml: num(fluids.totalMl), target: num(fluids.target?.ml), entries: (Array.isArray(fluids.entries) ? fluids.entries : []).filter(f => f && f.kind !== "food").length }
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
