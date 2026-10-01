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
