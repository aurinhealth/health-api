// Weekly planner: which sports the athlete wants on which weekdays, the
// weather location, and the role of each training day (long, quality, easy,
// recovery, gym upper/full body) so the load is spread sensibly over the week.

export const PLANNER_SPORTS = ["ride", "run", "gym"];
export const DEFAULT_LOCATION = { name: "Kutná Hora", latitude: 49.9484, longitude: 15.2682 };

// Relative load of a role; the client multiplies the shares by the weekly target.
const SHARE = { long: 1.5, quality: 1.2, endurance: 1, recovery: .5, gym_upper: .4, gym_full: .5 };
export const ROLE_LABELS = {
  long: "Dlouhý trénink",
  quality: "Kvalita (intervaly)",
  endurance: "Vytrvalost",
  recovery: "Lehce / regenerace",
  gym_upper: "Gym · horní tělo a core",
  gym_full: "Gym · celé tělo"
};
// What the coach should do with the role (the coach keeps its readiness guardrails).
export const ROLE_FOCUS = { long: "long_endurance", endurance: "endurance", recovery: "recovery", quality: null };

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS week_plan_preferences (user_id INTEGER PRIMARY KEY, prefs_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}

export function sanitizeWeekPlan(input = {}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const raw = Array.isArray(input.days?.[i]) ? input.days[i] : [];
    return PLANNER_SPORTS.filter(s => raw.includes(s));
  });
  const loc = input.location || {};
  const lat = Number(loc.latitude), lon = Number(loc.longitude);
  const location = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { name: String(loc.name || "").trim().slice(0, 80) || DEFAULT_LOCATION.name, latitude: Math.round(lat * 1e4) / 1e4, longitude: Math.round(lon * 1e4) / 1e4 }
    : DEFAULT_LOCATION;
  return { days, location };
}

export async function getWeekPlan(db) {
  await ensure(db);
  const row = await db.prepare("SELECT prefs_json FROM week_plan_preferences WHERE user_id=?").bind(db.userId).first();
  try { return sanitizeWeekPlan(row ? JSON.parse(row.prefs_json) : {}); } catch { return sanitizeWeekPlan({}); }
}

export async function saveWeekPlan(db, input) {
  const prefs = sanitizeWeekPlan(input);
  await ensure(db);
  await db.prepare("INSERT INTO week_plan_preferences(user_id,prefs_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET prefs_json=excluded.prefs_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId, JSON.stringify(prefs)).run();
  return prefs;
}

// Roles for the selected weekdays (0 = Monday). Rules:
// - one long session on the weekend (a day without gym first, then the later day);
// - up to two quality days (one with fewer than four endurance days), never on
//   neighbouring days and not right before or after the long day if avoidable;
// - the endurance day after a quality or long day is easy;
// - gym on a quality or long day, or the day before quality, is upper body only.
export function planWeekRoles(days = [], { readiness = "green" } = {}) {
  const has = (i, s) => (days[i] || []).includes(s);
  const endurance = [0, 1, 2, 3, 4, 5, 6].filter(i => has(i, "ride") || has(i, "run"));
  const role = {};
  const weekend = endurance.filter(i => i >= 5).sort((a, b) => Number(has(a, "gym")) - Number(has(b, "gym")) || b - a);
  let long = weekend[0];
  if (long == null && endurance.length >= 3) long = endurance.at(-1);
  if (long != null && endurance.length >= 2) role[long] = "long";
  const wanted = readiness === "red" ? 0 : readiness === "yellow" ? Math.min(1, endurance.length >= 2 ? 1 : 0) : endurance.length >= 4 ? 2 : endurance.length >= 2 ? 1 : 0;
  const quality = [];
  for (const gap of [2, 1]) {
    for (const i of endurance) {
      if (quality.length >= wanted || role[i]) continue;
      const far = quality.every(q => Math.abs(q - i) >= 2) && (role[long] !== "long" || Math.abs(long - i) >= gap);
      if (far) { quality.push(i); role[i] = "quality"; }
    }
  }
  for (const i of endurance) if (!role[i]) role[i] = role[i - 1] === "quality" || role[i - 1] === "long" ? "recovery" : "endurance";
  return Array.from({ length: 7 }, (_, i) => {
    const items = [];
    const sports = (days[i] || []).filter(s => s !== "gym");
    sports.forEach((sport, k) => {
      // A second endurance sport on the same day stays easy.
      const r = k === 0 ? role[i] : "recovery";
      items.push({ sport, role: r, label: ROLE_LABELS[r], share: SHARE[r], focus: ROLE_FOCUS[r] });
    });
    if (has(i, "gym")) {
      // Legs stay fresh for intervals; a long easy ride the next day tolerates leg work.
      const hardSoon = ["quality", "long"].includes(role[i]) || role[i + 1] === "quality";
      const r = hardSoon ? "gym_upper" : "gym_full";
      items.push({ sport: "gym", role: r, label: ROLE_LABELS[r], share: SHARE[r], focus: null });
    }
    return { weekday: i, items };
  });
}

// Role of one sport on one date, for the generator.
export function roleFor(prefs, date, sport, options = {}) {
  const d = new Date(String(date) + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  const weekday = (d.getUTCDay() + 6) % 7;
  return planWeekRoles(prefs?.days || [], options)[weekday].items.find(x => x.sport === sport) || null;
}

// ---- Load targets for the week --------------------------------------------
// One calculation for the calendar chips and the generator, so both say the
// same thing. Maintenance is CTL × 7; after a week well above it (≥ 125 %)
// this one is a recovery week at 70 %. What is already done or planned in
// Intervals.icu counts first; the rest is spread over the open plan chips,
// within sensible limits per role, so one session never carries the week.
const ROLE_IF = { recovery: .55, endurance: .68, long: .68, quality: .82 };
const ROLE_RANGE = { recovery: [.35, .6], endurance: [.8, 1.6], long: [1.4, 2.6], quality: [1, 1.5] };
const GYM_TSS = { gym_full: 35, gym_upper: 25 };
const SPORT_MINUTES = { ride: [30, 300], run: [20, 150] };
const round5 = v => Math.round(v / 5) * 5;

export function weekTargets({ roles = [], ctl = null, lastWeekLoad = 0, days = [], today, weekStart } = {}) {
  const fitness = Number(ctl) > 0 ? Number(ctl) : null;
  if (!fitness) return { status: "no_fitness", items: [] };
  const base = Math.round(fitness * 7);
  const dateAt = i => new Date(Date.parse(weekStart + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10);
  const weekLoad = days.reduce((s, d) => s + (Number(d.done) || 0) + (d.date >= today ? Number(d.planned) || 0 : 0), 0);
  const plannedAhead = days.some(d => d.date > today && Number(d.planned) > 0 && d.date <= dateAt(6));
  const recovery = Number(lastWeekLoad) >= base * 1.25 || (plannedAhead && Number(lastWeekLoad) >= 150 && weekLoad < Number(lastWeekLoad) * .7);
  const target = Math.round(base * (recovery ? .7 : 1.05));
  const dateOf = i => new Date(Date.parse(weekStart + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10);
  const info = date => days.find(d => d.date === date) || { done: 0, planned: 0, sports: [] };
  let committed = 0;
  for (let i = 0; i < 7; i++) { const d = info(dateOf(i)); committed += Number(d.done) || 0; if (dateOf(i) >= today) committed += Number(d.planned) || 0; }
  // Open chips: today or later, and that sport is not already done or planned that day.
  const open = [];
  roles.forEach((day, i) => {
    const date = dateOf(i); if (date < today) return;
    for (const x of day.items || []) if (!(info(date).sports || []).includes(x.sport)) open.push({ date, ...x });
  });
  let remaining = Math.max(0, target - committed - open.filter(x => x.sport === "gym").reduce((s, x) => s + (GYM_TSS[x.role] || 30), 0));
  const endurance = open.filter(x => x.sport !== "gym"), shares = endurance.reduce((s, x) => s + (x.share || 1), 0);
  const items = open.map(x => {
    if (x.sport === "gym") return { date: x.date, sport: x.sport, role: x.role, label: x.label, tss: GYM_TSS[x.role] || 30, minutes: x.role === "gym_upper" ? 50 : 60 };
    const [lo, hi] = ROLE_RANGE[x.role] || [.8, 1.6], cap = recovery ? .85 : 1;
    const tss = Math.round(Math.max(lo * fitness * cap, Math.min(hi * fitness * cap, shares ? remaining * (x.share || 1) / shares : 0)));
    const [min, max] = SPORT_MINUTES[x.sport] || [30, 300], intensity = ROLE_IF[x.role] || .68;
    const minutes = Math.max(min, Math.min(max, round5(tss / (intensity * intensity * 100) * 60)));
    return { date: x.date, sport: x.sport, role: x.role, label: x.label, tss: Math.round(minutes / 60 * intensity * intensity * 100), minutes };
  });
  const assigned = items.reduce((s, x) => s + x.tss, 0), shortfall = Math.max(0, target - committed - assigned);
  return { status: "ok", ctl: Math.round(fitness), base, target, recovery, lastWeekLoad: Math.round(lastWeekLoad), committed: Math.round(committed), items, shortfall: !recovery && shortfall > target * .15 ? Math.round(shortfall) : 0 };
}
export function targetFor(targets, date, sport) { return (targets?.items || []).find(x => x.date === date && x.sport === sport) || null; }
