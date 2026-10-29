// "Týdenní kalorie" (the widget on Jídlo, off until added): Monday to Sunday,
// seven times the everyday intake plus what training and movement added on
// each day, against what was eaten. Each day is the Food screen's own day
// (app-food.js buildFood). Pure: GET /app/api/food/week loads the days.

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// days: [{ date, kcal, target, trainingBonus, everyday }] for Monday to
// Sunday, as buildFood returns them; today: the user's local date.
export function buildFoodWeek({ today, days }) {
  const list = (Array.isArray(days) ? days : []).map(d => {
    const target = num(d?.target) != null ? Math.round(num(d.target)) : null;
    // The day without training (an older day without it: the target less the training part).
    const everyday = target != null ? Math.max(0, Math.min(target, Math.round(num(d?.everyday) ?? target - Math.max(0, num(d?.trainingBonus) ?? 0)))) : null;
    const ahead = d.date > today;
    return {
      date: d.date,
      target,
      everyday,
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
  // One everyday intake for all seven days: today's, as Jídlo shows it (in
  // another week the latest day up to today, else the first). Days gone by
  // were worked out without today's weight trend; the week keeps one daily
  // number anyway, and what a day allowed above it is its extra.
  const daily = (known.find(d => d.date === today) ?? known.filter(d => d.date <= today).at(-1) ?? known[0]).everyday;
  const base = daily * list.length;
  // What training and active days raised each day above it.
  for (const d of known) d.exercise = Math.max(0, d.target - daily);
  const exercise = sum(known, "exercise");
  const target = base + exercise;
  const inWeek = today >= list[0].date && today <= list.at(-1).date;
  // Where the bar should be by tonight: the everyday intake of the days up to
  // today and what training added on them.
  const upToToday = list.filter(d => d.date <= today);
  const byToday = daily * upToToday.length + sum(upToToday, "exercise");
  const left = target - eaten;
  // What is left shared by the days after today; it shrinks with every meal
  // logged today. On Sunday (and in a week gone by) there is no day after.
  const daysAfter = list.filter(d => d.date > today).length;
  return {
    status: "ok",
    start: list[0].date,
    end: list.at(-1).date,
    today,
    target,
    base,
    exercise,
    eaten,
    byToday: inWeek ? byToday : null,
    left: Math.max(0, left),
    over: Math.max(0, -left),
    perDay: left > 0 && daysAfter > 0 ? Math.round(left / daysAfter / 10) * 10 : null,
    days: list
  };
}
