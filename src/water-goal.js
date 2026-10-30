// The daily water goal the athlete chose (Nastavení → Cíle → Pití): Auto is the
// target from body weight and training (fluids.js hydrationTarget), Custom a fixed
// amount, Build-up a start that moves day by day with what the athlete drinks,
// up to the Auto target. Training days add their extra on top of Custom and
// Build-up, and a day is judged against its own goal with that extra.
import { L } from "./lang.js";
import { hydrationMl, activityHoursByDay, hydrationTarget, drinkFromFoodEntry } from "./fluids.js";
import { shiftDate } from "./dashboard-shared.js";

const MIN_ML = 1000, MAX_ML = 6000, STEP = 100, MAX_JUMP = 300, OVER_AVERAGE = 500, CATCH_UP_DAYS = 14;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const floor100 = ml => Math.floor(ml / 100) * 100;

// Tomorrow's base (the goal without training) after the finished days in
// `days` (oldest first: { goalMl, extraMl, drunkMl, logged }). What the athlete
// managed two days in a row (the smaller of the two, without the training
// extra) raises it: both days at 95 % of their goal = the higher of +0.1 l and
// that amount, at most +0.3 l a day. One day under 60 %, or two under 80 %,
// takes 0.1 l off. A day with nothing logged keeps it. Never above the Auto
// base (cap), nor more than 0.5 l over the average of the logged days.
export function nextBase(base, days, { capMl = MAX_ML } = {}) {
  const y = days.at(-1), x = days.at(-2);
  if (!y?.logged) return base;
  const share = d => d.drunkMl / Math.max(1, d.goalMl);
  let next = base;
  if (share(y) < 0.6 || (share(y) < 0.8 && x?.logged && share(x) < 0.8)) next = base - STEP;
  else if (share(y) >= 0.95 && x?.logged && share(x) >= 0.95) {
    const managed = floor100(Math.min(x.drunkMl - x.extraMl, y.drunkMl - y.extraMl));
    next = Math.min(Math.max(base + STEP, managed), base + MAX_JUMP);
    const logged = days.filter(d => d.logged), average = logged.reduce((s, d) => s + d.drunkMl - d.extraMl, 0) / logged.length;
    next = Math.min(next, Math.max(base, floor100(average + OVER_AVERAGE)));
  }
  return clamp(next, MIN_ML, Math.max(MIN_ML, Number(capMl) || MAX_ML));
}

// Seven finished days in one line: the average drunk and goal of the logged
// days and how many of them met the goal (95 %). Null when none was logged.
function weekOf(days) {
  const logged = days.filter(d => d.logged);
  if (!logged.length) return null;
  const avg = key => Math.round(logged.reduce((n, d) => n + d[key], 0) / logged.length);
  return { drunkMl: avg("drunkMl"), goalMl: avg("goalMl"), met: logged.filter(d => d.drunkMl >= d.goalMl * 0.95).length, days: logged.length };
}

// The day's goal: auto = hydrationTarget() of the day; built = loadBuild() for Build-up.
export function waterGoal(auto, profile = {}, built = null) {
  const extra = Number(auto?.exerciseMl) || 0, autoMl = Number(auto?.ml) || null;
  const mode = profile?.waterMode;
  if (mode === "custom" && Number(profile.waterGoal) > 0)
    return { ...auto, ml: Math.min(MAX_ML, Number(profile.waterGoal) + extra), autoMl, mode };
  if (mode === "build" && built) {
    const baseMl = Math.min(built.baseMl, Math.max(MIN_ML, Number(auto?.baseMl) || MAX_ML));
    return { ...auto, ml: Math.min(MAX_ML, baseMl + extra), autoMl, mode,
      build: { baseMl, done: baseMl >= (Number(auto?.baseMl) || MAX_ML), days: built.days.slice(-2).reverse(), weeks: [weekOf(built.days.slice(-7)), weekOf(built.days.slice(-14, -7))].filter(Boolean) } };
  }
  return { ...auto, autoMl, mode: "auto" };
}

const tableReady = new WeakSet();
async function ensureTable(db) {
  if (tableReady.has(db)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS water_build (user_id INTEGER NOT NULL, since TEXT NOT NULL, date TEXT NOT NULL, goal_ml INTEGER NOT NULL, extra_ml INTEGER NOT NULL, drunk_ml INTEGER NOT NULL, logged INTEGER NOT NULL, next_ml INTEGER NOT NULL, PRIMARY KEY (user_id, since, date))").run();
  tableReady.add(db);
}

// Build-up's finished days are stored (water_build) so the goal does not have to
// be worked out from the run's start each time. Every request counts the last
// 14 finished days again in three reads (drinks, food-diary drinks, training)
// and from the first day that changed (a drink added late, a sync, a workout
// uploaded the next day) works the goal out again and stores those days. Today
// and later days are never judged, whatever date is asked for. A new start in
// Cíle starts a new run (since).
export async function loadBuild(db, profile, date, auto, today = date) {
  const start = Number(profile?.waterStart);
  if (profile?.waterMode !== "build" || !(start > 0)) return null;
  await ensureTable(db);
  const upto = date < today ? date : today, cap = Number(auto?.baseMl) || MAX_ML;
  // A run without a start day (an older save) begins two days back.
  const first = profile.waterFrom || shiftDate(upto, -2), since = `${profile.waterFrom}|${start}`;
  const from = first > shiftDate(upto, -CATCH_UP_DAYS) ? first : shiftDate(upto, -CATCH_UP_DAYS);
  const stored = ((await db.prepare("SELECT date,goal_ml,extra_ml,drunk_ml,logged,next_ml FROM water_build WHERE user_id=? AND since=? AND date<? ORDER BY date DESC LIMIT ?")
    .bind(db.userId, since, upto, CATCH_UP_DAYS + 1).all()).results || [])
    .map(r => ({ date: r.date, goalMl: Number(r.goal_ml), extraMl: Number(r.extra_ml), drunkMl: Number(r.drunk_ml), logged: Boolean(r.logged), nextMl: Number(r.next_ml) }));
  const before = stored.find(r => r.date < from);
  let base = before ? before.nextMl : clamp(start, MIN_ML, Math.max(MIN_ML, cap));
  if (!(from < upto)) return { baseMl: base, days: [] };
  const [drunk, hours] = await Promise.all([drunkByDay(db, from, upto), activityHoursByDay(db, db.userId, from, upto)]);
  const known = new Map(stored.map(r => [r.date, r])), days = [], writes = [];
  for (let day = from; day < upto; day = shiftDate(day, 1)) {
    const extraMl = hydrationTarget(hours[day] || {}).exerciseMl;
    const d = { date: day, goalMl: base + extraMl, extraMl, drunkMl: drunk[day] || 0, logged: drunk[day] > 0 };
    days.push(d);
    base = nextBase(base, days, { capMl: cap });
    const s = known.get(day);
    if (!s || s.goalMl !== d.goalMl || s.extraMl !== extraMl || s.drunkMl !== d.drunkMl || s.logged !== d.logged || s.nextMl !== base)
      writes.push(db.prepare("INSERT INTO water_build(user_id,since,date,goal_ml,extra_ml,drunk_ml,logged,next_ml) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,since,date) DO UPDATE SET goal_ml=excluded.goal_ml,extra_ml=excluded.extra_ml,drunk_ml=excluded.drunk_ml,logged=excluded.logged,next_ml=excluded.next_ml")
        .bind(db.userId, since, day, d.goalMl, extraMl, d.drunkMl, d.logged ? 1 : 0, base));
  }
  if (writes.length) await db.batch(writes);
  return { baseMl: base, days };
}

// Hydration ml per day from `from` to the day before `to`: the drinks logged in
// Aurin and the drinks in the food diary, as Pití counts them (fluids GET).
export async function drunkByDay(db, from, to) {
  if (!from || from >= to) return {};
  const [rows, food] = await Promise.all([
    db.prepare("SELECT date,kind,SUM(ml) AS ml FROM fluid_log WHERE user_id=? AND date>=? AND date<? GROUP BY date,kind").bind(db.userId, from, to).all().catch(() => ({ results: [] })),
    db.prepare("SELECT id,consumed_date AS date,consumed_at,recipe_title,note FROM food_logs WHERE user_id=? AND consumed_date>=? AND consumed_date<? AND (status IS NULL OR status='eaten')").bind(db.userId, from, to).all().catch(() => ({ results: [] }))
  ]);
  const out = {};
  for (const r of rows.results || []) out[r.date] = (out[r.date] || 0) + hydrationMl(r.ml, r.kind);
  for (const r of food.results || []) {
    const drink = drinkFromFoodEntry(r);
    if (drink) out[r.date] = (out[r.date] || 0) + hydrationMl(drink.ml, drink.kind);
  }
  return out;
}

// One push when the day is behind: at 14:00 and 18:00 (local), below 70 % of what
// the hours so far (8:00–21:00) should have brought. Null when on track.
export function waterNudge({ hour, drunkMl, goalMl }) {
  const goal = Number(goalMl);
  if (!(goal > 0) || ![14, 18].includes(hour)) return null;
  const due = goal * clamp((hour - 8) / 13, 0, 1), drunk = Number(drunkMl) || 0;
  if (drunk >= due * 0.7) return null;
  const litres = ml => (Math.round(ml / 100) / 10).toLocaleString(L("cs-CZ", "en-US"), { minimumFractionDigits: 1 });
  return {
    title: L("Pití", "Water"),
    body: L(`Zatím ${litres(drunk)} l. Sklenice teď tě vrátí na cestu k ${litres(goal)} l.`,
      `${litres(drunk)} l so far. A glass now gets you back on track for ${litres(goal)} l today.`)
  };
}
