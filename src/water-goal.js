// The daily water goal the athlete chose (Nastavení → Cíle → Pití): Auto is the
// target from body weight and training (fluids.js hydrationTarget), Custom a fixed
// amount, Build-up a start that moves each week by how the last week went, up to
// the Auto target. Training days add their extra on top of Custom and Build-up.
import { L } from "./lang.js";
import { hydrationMl } from "./fluids.js";
import { shiftDate, mondayOfDate } from "./dashboard-shared.js";

export const WATER_STEPS = ["auto", "100", "250", "500"];
const MIN_ML = 1000, MAX_ML = 6000, MAX_WEEKS = 52;
const round50 = ml => Math.round(ml / 50) * 50;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The next week's step from the share of the goal drunk on average: with Auto
// +0.25 l at 95 % and more, +0.1 l at 80 %, the same at 60 %, −0.25 l below;
// a chosen step goes up by itself at 80 %, stays at 60 % and goes back below.
export function weekStep(share, step = "auto") {
  if (step === "auto") return share >= 0.95 ? 250 : share >= 0.8 ? 100 : share >= 0.6 ? 0 : -250;
  const s = Number(step) || 250;
  return share >= 0.8 ? s : share >= 0.6 ? 0 : -s;
}

// The Build-up target of the week of `date`, and the finished weeks it came
// from. drunk: { "YYYY-MM-DD": hydration ml } of the days since the start.
export function buildUp({ startMl, step = "auto", from, date, capMl, drunk = {} }) {
  const cap = Math.max(MIN_ML, Number(capMl) || MAX_ML);
  let target = clamp(round50(Number(startMl) || 2000), MIN_ML, cap);
  const weeks = [], first = mondayOfDate(from || date), current = mondayOfDate(date);
  for (let monday = first; monday < current && weeks.length < MAX_WEEKS; monday = shiftDate(monday, 7)) {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += Number(drunk[shiftDate(monday, i)]) || 0;
    const avg = Math.round(sum / 7), share = avg / target;
    weeks.push({ week: monday, targetMl: target, avgMl: avg, percent: Math.round(share * 100) });
    target = clamp(target + weekStep(share, step), MIN_ML, cap);
  }
  return { targetMl: target, weeks };
}

// The day's goal: auto = hydrationTarget() of the day; built = loadBuild() for Build-up.
export function waterGoal(auto, profile = {}, built = null) {
  const extra = Number(auto?.exerciseMl) || 0, autoMl = Number(auto?.ml) || null;
  const mode = profile?.waterMode;
  if (mode === "custom" && Number(profile.waterGoal) > 0)
    return { ...auto, ml: Math.min(MAX_ML, Number(profile.waterGoal) + extra), autoMl, mode };
  if (mode === "build" && built) {
    const weekMl = Math.min(built.targetMl, Math.max(MIN_ML, Number(auto?.baseMl) || MAX_ML));
    return { ...auto, ml: Math.min(MAX_ML, weekMl + extra), autoMl, mode, build: { weekMl, step: profile.waterStep || "auto", weeks: built.weeks.slice(-2).reverse() } };
  }
  return { ...auto, autoMl, mode: "auto" };
}

const tableReady = new WeakSet();

// Build-up's weeks are stored once each (water_build), so a day reads at most three
// rows; only the first request of a new week reads that week's drinks (7 days of
// fluid_log). A start or a step changed in Cíle starts a new run (since).
export async function loadBuild(db, profile, date, capMl) {
  const start = Number(profile?.waterStart);
  if (profile?.waterMode !== "build" || !(start > 0)) return null;
  const step = profile.waterStep || "auto", since = `${profile.waterFrom || date}|${start}|${step}`;
  if (!tableReady.has(db)) { await db.prepare("CREATE TABLE IF NOT EXISTS water_build (user_id INTEGER NOT NULL, since TEXT NOT NULL, week TEXT NOT NULL, target_ml INTEGER NOT NULL, avg_ml INTEGER NOT NULL, percent INTEGER NOT NULL, PRIMARY KEY (user_id, since, week))").run(); tableReady.add(db); }
  const stored = ((await db.prepare("SELECT week,target_ml,avg_ml,percent FROM water_build WHERE user_id=? AND since=? ORDER BY week DESC LIMIT 2")
    .bind(db.userId, since).all()).results || []).reverse().map(r => ({ week: r.week, targetMl: Number(r.target_ml), avgMl: Number(r.avg_ml), percent: Number(r.percent) }));
  const current = mondayOfDate(date), last = stored.at(-1);
  // The target the last stored week ended with is where the next one starts.
  const next = last ? shiftDate(last.week, 7) : mondayOfDate(profile.waterFrom || date);
  const from = next < shiftDate(current, -56) ? shiftDate(current, -56) : next;
  const startMl = last ? Math.max(MIN_ML, last.targetMl + weekStep(last.percent / 100, step)) : start;
  if (from >= current) return { targetMl: clamp(startMl, MIN_ML, Math.max(MIN_ML, Number(capMl) || MAX_ML)), weeks: stored };
  const built = buildUp({ startMl, step, from, date, capMl, drunk: await drunkByDay(db, from, current) });
  for (const w of built.weeks) await db.prepare("INSERT INTO water_build(user_id,since,week,target_ml,avg_ml,percent) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,since,week) DO NOTHING")
    .bind(db.userId, since, w.week, w.targetMl, w.avgMl, w.percent).run();
  return { targetMl: built.targetMl, weeks: [...stored, ...built.weeks].slice(-2) };
}

// Hydration ml per day from `from` to the day before `to` (the drinks logged in Aurin).
export async function drunkByDay(db, from, to) {
  if (!from || from >= to) return {};
  const rows = (await db.prepare("SELECT date,kind,SUM(ml) AS ml FROM fluid_log WHERE user_id=? AND date>=? AND date<? GROUP BY date,kind")
    .bind(db.userId, from, to).all().catch(() => ({ results: [] }))).results || [];
  const out = {};
  for (const r of rows) out[r.date] = (out[r.date] || 0) + hydrationMl(r.ml, r.kind);
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
