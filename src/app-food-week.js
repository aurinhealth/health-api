// "Týdenní kalorie" (the widget on Jídlo, off until added): Monday to Sunday,
// seven times the everyday intake plus what training and movement added on
// each day, against what was eaten. Each day is the Food screen's own day
// (app-food.js buildFood). Pure: GET /app/api/food/week loads the days.

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// days: [{ date, kcal, target, trainingBonus, everyday, logged }] for Monday
// to Sunday, as buildFood returns them (logged: false when nothing was
// logged); today: the user's local date.
export function buildFoodWeek({ today, days }) {
  const list = (Array.isArray(days) ? days : []).map(d => {
    const target = num(d?.target) != null ? Math.round(num(d.target)) : null;
    // The day without training (an older day without it: the target less the training part).
    const everyday = target != null ? Math.max(0, Math.min(target, Math.round(num(d?.everyday) ?? target - Math.max(0, num(d?.trainingBonus) ?? 0)))) : null;
    const ahead = d.date > today;
    // A day gone by with nothing logged was forgotten or logged elsewhere, not
    // a day without food: it is "nezapsáno" and the rest of the week leaves it
    // out, so nobody is asked to eat it back.
    const unlogged = d.date < today && d?.logged === false;
    return {
      date: d.date,
      target,
      everyday,
      // Nothing is eaten on a day still ahead (meals planned there are not eaten yet).
      eaten: ahead || unlogged ? null : Math.round(num(d?.kcal) ?? 0),
      ahead,
      ...(unlogged ? { unlogged: true } : {})
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
  const upToToday = list.filter(d => d.date <= today && !d.unlogged);
  const byToday = daily * upToToday.length + sum(upToToday, "exercise");
  // The rest counts only the days that can be eaten in: an unlogged day takes
  // its own target with it.
  const unlogged = list.filter(d => d.unlogged);
  const left = target - eaten - daily * unlogged.length - sum(unlogged, "exercise");
  // What is left shared evenly by today and the days after it: on Saturday
  // morning 3 500 left is about 1 750 for Saturday and for Sunday, not 3 500
  // for Sunday alone. Once today has eaten more than that share, the rest is
  // only the days after today's, and it shrinks with every meal. On Sunday
  // (and in a week gone by) there is no day after to share it with.
  const daysAfter = list.filter(d => d.date > today).length;
  const eatenToday = inWeek ? list.find(d => d.date === today)?.eaten ?? 0 : 0;
  const share = daysAfter > 0 ? Math.min((left + eatenToday) / (daysAfter + 1), left / daysAfter) : null;
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
    perDay: left > 0 && share != null ? Math.round(share / 10) * 10 : null,
    // What today can still eat of its share; 0 once today is past it (the
    // rest is the days after today's). None on Sunday.
    todayLeft: left > 0 && share != null ? Math.max(0, Math.round((share - eatenToday) / 10) * 10) : null,
    unlogged: unlogged.length,
    days: list
  };
}
