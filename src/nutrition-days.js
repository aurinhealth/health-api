// The food history (DATA-3, redesign S3, 2026-11-16): the Calories detail and
// the month rings on Food show 30 days to a year of eaten against the day's
// target. Recomputing each old day (/analysis/daily and /food/log per day)
// cost about 330 database reads for 30 days, and an old day's target
// recomputed today is not the one the user saw that day, so the rings would
// change colour after the fact. So:
// - nutrition_days keeps one row a day: eaten kcal and macros and the day's
//   targets. The Food screen (buildFood) writes it when it shows a day; the
//   targets follow the day only while it is today and are frozen once it is
//   over. A day gone by never gets a target recomputed later (it would use
//   today's weight and settings): logged afterwards, it keeps the one it had.
// - The history reads those rows and what was eaten from food_logs in one
//   grouped read each (the food log is the truth for eaten, also for meals
//   logged from the coach or the Plus menu without opening Food).
// - Days from before the table have no target: eaten only, no over or under.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;

export const HISTORY_DAYS = [30, 90, 180, 365];

export async function ensureNutritionDays(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS nutrition_days (user_id INTEGER NOT NULL, date TEXT NOT NULL, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, target_kcal REAL, target_protein_g REAL, target_carbs_g REAL, target_fat_g REAL, logged INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, date))").run();
}

// The row of a day from the Food screen's day (app-food.js buildFood).
export function nutritionDayOf(food) {
  if (!food || !DAY.test(String(food.date || ""))) return null;
  const m = food.macros || {};
  return {
    date: food.date,
    kcal: round(num(food.kcal)), protein: round(num(m.protein?.eaten), 1), carbs: round(num(m.carbs?.eaten), 1), fat: round(num(m.fat?.eaten), 1),
    target: round(num(food.target)), proteinTarget: round(num(m.protein?.target)), carbsTarget: round(num(m.carbs?.target)), fatTarget: round(num(m.fat?.target)),
    logged: (food.meals || []).some(x => (x.entries || []).length > 0)
  };
}

// The same row from Today's nutrition (app-today.js buildToday): the same
// calorie target and macros as the Food screen's, so a day without Food
// opened still keeps its target.
export function nutritionDayOfToday(date, n) {
  if (!n || !DAY.test(String(date || ""))) return null;
  return nutritionDayOf({ date, kcal: n.kcal, target: n.target, macros: { protein: n.protein, carbs: n.carbs, fat: n.fat }, meals: [{ entries: num(n.kcal) > 0 ? [1] : [] }] });
}

// One upsert. Eaten always follows; the targets only while the day is today.
// Unchanged values write nothing.
export async function saveNutritionDay(db, row, today) {
  if (!db || !row || !DAY.test(row.date) || !DAY.test(String(today || ""))) return;
  await ensureNutritionDays(db);
  const open = row.date === today ? 1 : 0;
  await db.prepare(`INSERT INTO nutrition_days (user_id, date, kcal, protein_g, carbs_g, fat_g, target_kcal, target_protein_g, target_carbs_g, target_fat_g, logged)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, logged = excluded.logged,
      target_kcal = CASE WHEN ${open} = 1 THEN excluded.target_kcal ELSE nutrition_days.target_kcal END,
      target_protein_g = CASE WHEN ${open} = 1 THEN excluded.target_protein_g ELSE nutrition_days.target_protein_g END,
      target_carbs_g = CASE WHEN ${open} = 1 THEN excluded.target_carbs_g ELSE nutrition_days.target_carbs_g END,
      target_fat_g = CASE WHEN ${open} = 1 THEN excluded.target_fat_g ELSE nutrition_days.target_fat_g END,
      updated_at = CURRENT_TIMESTAMP
    WHERE nutrition_days.kcal IS NOT excluded.kcal OR nutrition_days.protein_g IS NOT excluded.protein_g OR nutrition_days.carbs_g IS NOT excluded.carbs_g
      OR nutrition_days.fat_g IS NOT excluded.fat_g OR nutrition_days.logged IS NOT excluded.logged
      OR (${open} = 1 AND (nutrition_days.target_kcal IS NOT excluded.target_kcal OR nutrition_days.target_protein_g IS NOT excluded.target_protein_g
        OR nutrition_days.target_carbs_g IS NOT excluded.target_carbs_g OR nutrition_days.target_fat_g IS NOT excluded.target_fat_g))`)
    .bind(db.userId, row.date, row.kcal, row.protein, row.carbs, row.fat, ...(open ? [row.target, row.proteinTarget, row.carbsTarget, row.fatTarget] : [null, null, null, null]), row.logged ? 1 : 0).run();
}

// The stored days and the eaten totals of [from, to]: two reads on the tables' keys.
export async function loadFoodHistory(db, from, to) {
  const [stored, eaten] = await Promise.all([
    db.prepare("SELECT date, target_kcal, target_protein_g, target_carbs_g, target_fat_g FROM nutrition_days WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date")
      .bind(db.userId, from, to).all().then(r => r.results || [], error => { if (/no such table/i.test(String(error?.message || error))) return []; throw error; }),
    db.prepare("SELECT consumed_date AS date, SUM(kcal) AS kcal, SUM(protein_g) AS protein_g, SUM(carbs_g) AS carbs_g, SUM(fat_g) AS fat_g, COUNT(*) AS entries FROM food_logs WHERE user_id = ? AND consumed_date >= ? AND consumed_date <= ? AND (status IS NULL OR status='eaten') GROUP BY consumed_date")
      .bind(db.userId, from, to).all().then(r => r.results || [], error => { if (/no such table/i.test(String(error?.message || error))) return []; throw error; })
  ]);
  return { stored, eaten };
}

const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 864e5).toISOString().slice(0, 10);

// The answer of GET /app/api/food/history: each day from the oldest to today
// with eaten (null when nothing was logged), the frozen targets (null before
// the table) and `over` from the first kcal above the target (Petr 2026-11-16,
// all goals). daysLogged counts days with food; average over those days only;
// targetsFrom is the first day with a kept target ("Targets are kept from …").
export function buildFoodHistory({ today, days = 30, stored = [], eaten = [] }) {
  const span = HISTORY_DAYS.includes(Number(days)) ? Number(days) : 30;
  const targets = new Map((stored || []).map(r => [r.date, r]));
  const ate = new Map((eaten || []).filter(r => Number(r.entries) > 0).map(r => [r.date, r]));
  const list = Array.from({ length: span }, (_, i) => shift(today, i - span + 1)).map(date => {
    const t = targets.get(date), e = ate.get(date);
    const kcal = e ? round(num(e.kcal)) : null, target = t ? round(num(t.target_kcal)) : null;
    return {
      date,
      kcal, protein: e ? round(num(e.protein_g)) : null, carbs: e ? round(num(e.carbs_g)) : null, fat: e ? round(num(e.fat_g)) : null,
      target, proteinTarget: t ? round(num(t.target_protein_g)) : null, carbsTarget: t ? round(num(t.target_carbs_g)) : null, fatTarget: t ? round(num(t.target_fat_g)) : null,
      logged: Boolean(e),
      over: kcal != null && target != null && target > 0 ? kcal > target : null
    };
  });
  const logged = list.filter(d => d.logged);
  const avg = key => logged.length ? round(logged.reduce((s, d) => s + (d[key] || 0), 0) / logged.length) : null;
  return {
    status: "ok", today, days: span, from: list[0].date, to: today,
    daysLogged: logged.length,
    average: { kcal: avg("kcal"), protein: avg("protein"), carbs: avg("carbs"), fat: avg("fat") },
    targetsFrom: list.find(d => d.target != null)?.date ?? null,
    list
  };
}
