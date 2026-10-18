// "Týdenní kalorie" (the widget on Jídlo, off until added): Monday to Sunday,
// the day targets added up, split into the everyday intake and what training
// adds, against what was eaten. Each day is the Food screen's own day
// (app-food.js buildFood), so the week adds up to the days the athlete sees.
// Pure: GET /app/api/food/week loads the days.

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// days: [{ date, kcal, target, trainingBonus }] for Monday to Sunday, as
// buildFood returns them; today: the user's local date.
export function buildFoodWeek({ today, days }) {
  const list = (Array.isArray(days) ? days : []).map(d => {
    const target = num(d?.target);
    // The training part never takes more than the day's target.
    const exercise = target != null ? Math.min(target, Math.max(0, Math.round(num(d?.trainingBonus) ?? 0))) : null;
    const ahead = d.date > today;
    return {
      date: d.date,
      target: target != null ? Math.round(target) : null,
      base: target != null ? Math.round(target) - exercise : null,
      exercise,
      // Nothing is eaten on a day still ahead (meals planned there are not eaten yet).
      eaten: ahead ? null : Math.round(num(d?.kcal) ?? 0),
      ahead
    };
  });
  const known = list.filter(d => d.target != null);
  const sum = (items, key) => items.reduce((s, d) => s + (d[key] ?? 0), 0);
  const eaten = sum(list, "eaten");
  // Without a calorie target (no profile or weight yet) there is no week to fill.
  if (!known.length) return { status: "ok", start: list[0]?.date ?? null, end: list.at(-1)?.date ?? null, today, target: null, base: null, exercise: null, eaten, days: list };
  const target = sum(known, "target");
  // What the days up to today allow: where the bar should be by tonight.
  const byToday = sum(known.filter(d => d.date <= today), "target");
  const left = target - eaten;
  // Today and the days ahead share what is left.
  const remainingDays = list.filter(d => d.date >= today).length;
  return {
    status: "ok",
    start: list[0].date,
    end: list.at(-1).date,
    today,
    target,
    base: sum(known, "base"),
    exercise: sum(known, "exercise"),
    eaten,
    byToday: today >= list[0].date && today <= list.at(-1).date ? byToday : null,
    left: Math.max(0, left),
    over: Math.max(0, -left),
    perDay: left > 0 && remainingDays > 0 ? Math.round(left / remainingDays / 10) * 10 : null,
    days: list
  };
}
