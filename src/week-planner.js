import { L, bilingual } from './lang.js';
import { readGymPlan } from "./gym-plan-store.js";
import { personalBaseline } from "./recovery-model.js";
import { normalizeAvailability, ensureWeekOverrides, weekStartOf, validDay } from './training-availability.js';
import { getAthleteState } from './athlete-state.js';
import {trainingHistory,starterPlan} from './training-history.js';
// Weekly planner: which sports the athlete wants on which weekdays, the
// weather location, and the role of each training day (long, quality, easy,
// recovery, gym upper/full body) so the load is spread sensibly over the week.

export const PLANNER_SPORTS = ["ride", "run", "gym"];
// Weather only for a place the user chose: their device location (with the
// browser's permission) or a place they searched for. Plans saved before that
// carry the old default place without a source; it counts as not chosen.
export const LOCATION_SOURCES = ["device", "search"];
const OLD_DEFAULT = { latitude: 49.9484, longitude: 15.2682 };

// Relative load of a role; the client multiplies the shares by the weekly target.
const SHARE = { long: 1.5, quality: 1.2, endurance: 1, recovery: .5, gym_upper: .4, gym_full: .5 };
export const ROLE_LABELS = bilingual({
  long: "Dlouhý trénink",
  quality: "Kvalita (intervaly)",
  endurance: "Vytrvalost",
  recovery: "Lehce / regenerace",
  gym_upper: "Posilovna · s rezervou",
  gym_full: "Posilovna · celé tělo"
}, {
  long: "Long workout",
  quality: "Quality (intervals)",
  endurance: "Endurance",
  recovery: "Easy / recovery",
  gym_upper: "Gym · with reserve",
  gym_full: "Gym · full body"
});
// What the coach should do with the role (the coach keeps its readiness guardrails).
export const ROLE_FOCUS = { long: "long_endurance", endurance: "endurance", recovery: "recovery", quality: null };

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS week_plan_preferences (user_id INTEGER PRIMARY KEY, prefs_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}

// A day can hold several sessions, the same sport twice included (two rides),
// up to MAX_PER_DAY; they are kept in the order ride, run, gym.
export const MAX_PER_DAY = 4;
export function sanitizeWeekPlan(input = {}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const raw = Array.isArray(input.days?.[i]) ? input.days[i] : [];
    return raw.filter(s => PLANNER_SPORTS.includes(s)).slice(0, MAX_PER_DAY).sort((a, b) => PLANNER_SPORTS.indexOf(a) - PLANNER_SPORTS.indexOf(b));
  });
  const loc = input.location || {};
  const lat = Number(loc.latitude), lon = Number(loc.longitude);
  const source = LOCATION_SOURCES.includes(loc.source) ? loc.source : null;
  const oldDefault = !source && lat === OLD_DEFAULT.latitude && lon === OLD_DEFAULT.longitude;
  const location = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !oldDefault
    ? { name: String(loc.name || "").trim().slice(0, 80) || L("Moje poloha", "My location"), latitude: Math.round(lat * 1e4) / 1e4, longitude: Math.round(lon * 1e4) / 1e4, ...(source ? { source } : {}) }
    : null;
  const count = input.weeklyActivities == null || input.weeklyActivities === '' ? null : Number(input.weeklyActivities);
  if (count != null && (!Number.isInteger(count) || count < 0 || count > 14)) throw new Error(L('Počet aktivit musí být 0 až 14.', 'The number of activities must be 0 to 14.'));
  return { days, location, availability: normalizeAvailability(input.availability), weeklyActivities: count, sessions: sanitizeSessions(input.sessions, days),...(['auto','manual'].includes(input.availabilityMode)?{availabilityMode:input.availabilityMode}:{}) };
}

// The athlete's own length or place for one plan chip, keyed "weekday|sport|slot"
// (slot = the n-th session of that sport that day). Gym has no place to choose.
export const SESSION_MINUTES = { gym: [30, 45, 60, 75, 90], ride: [30, 45, 60, 75, 90, 120, 150, 180, 240, 300], run: [20, 30, 45, 60, 75, 90, 120] };
export function sanitizeSessions(raw, days) {
  const out = {};
  for (const [key, value] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    const m = String(key).match(/^([0-6])\|(ride|run|gym)\|([0-3])$/);
    if (!m || (days[m[1]] || []).filter(s => s === m[2]).length <= Number(m[3])) continue;
    const minutes = Number(value?.minutes), entry = {};
    if (Number.isInteger(minutes) && minutes >= 20 && minutes <= 360 && minutes % 5 === 0) entry.minutes = minutes;
    if (m[2] !== "gym" && ["indoor", "outdoor"].includes(value?.environment)) entry.environment = value.environment;
    if (Object.keys(entry).length) out[key] = entry;
  }
  return out;
}

export async function getWeekPlan(db, date = null) {
  await ensure(db);
  const row = await db.prepare("SELECT prefs_json FROM week_plan_preferences WHERE user_id=?").bind(db.userId).first();
  let defaults; try { defaults = sanitizeWeekPlan(row ? JSON.parse(row.prefs_json) : {}); } catch { defaults = sanitizeWeekPlan({}); }
  // Onboarding does not collect availability. Until the athlete saves a time
  // budget in Plan, use current history or the documented starting template.
  if(defaults.availabilityMode==='auto'||defaults.availability.every(day=>day.minutes==null)){
    const setup=await db.prepare('SELECT completed_at,training_json FROM user_setup WHERE user_id=?').bind(db.userId).first().catch(()=>null);
    if(setup?.completed_at){
      let training={};try{training=JSON.parse(setup.training_json||'{}');}catch{}
      const history=await trainingHistory(db),experience=training.experience&&training.experience!=='auto'?training.experience:history.experience;
      const automatic=starterPlan(history,experience);
      defaults={...defaults,availability:automatic.availability,availabilityMode:'auto',weeklyActivities:defaults.weeklyActivities??automatic.weeklyActivities,automatic};
    }
  }
  if (!date) return defaults;
  await ensureWeekOverrides(db);
  const override = await db.prepare('SELECT prefs_json FROM week_plan_overrides WHERE user_id=? AND week_start=?').bind(db.userId, weekStartOf(date)).first();
  return override ? { ...sanitizeWeekPlan({ ...defaults, ...JSON.parse(override.prefs_json) }), source: 'week' } : { ...defaults, source: 'default' };
}

// Why the nightly gym plan is not made for `date`, or null to make it: the
// week plan has no gym that day (an empty week plan does not decide), or a
// plan made or edited by the athlete is already stored.
export async function nightlyGymSkip(db, date) {
  if ((await getAthleteState(db)).status !== 'active') return L('Aktuální stav pozastavuje tréninky.', 'Your current status pauses training.');
  const prefs = await getWeekPlan(db, date);
  const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  if (prefs.availability[weekday].minutes === 0) return L('Tento den nemáš čas na aktivitu.', 'You don\'t have time for an activity on this day.');
  if (prefs.days.some(d => d.length) && !prefs.days[weekday].includes("gym")) return L("Podle týdenního plánu není tento den gym.", "The week plan has no gym on this day.");
  const gym = await readGymPlan(db, date);
  if (gym.cancelled) return L("Gym na tento den jsi zrušil.", "You cancelled the gym for this day.");
  if (gym.stored) return L("Na tento den už gym plán je.", "There's already a gym plan for this day.");
  return null;
}

export async function saveWeekPlan(db, input, date = null) {
  const prefs = sanitizeWeekPlan(input);
  await ensure(db);
  if (date) {
    await ensureWeekOverrides(db);
    // A week keeps only what differs from the usual week, so a later change of
    // the usual week (the time for a weekday, the place) still reaches it.
    const own = weekOverride(prefs, await getWeekPlan(db));
    if (!Object.keys(own).length) {
      await db.prepare('DELETE FROM week_plan_overrides WHERE user_id=? AND week_start=?').bind(db.userId, weekStartOf(date)).run();
      return { ...prefs, source: 'default' };
    }
    await db.prepare('INSERT INTO week_plan_overrides(user_id,week_start,prefs_json) VALUES(?,?,?) ON CONFLICT(user_id,week_start) DO UPDATE SET prefs_json=excluded.prefs_json').bind(db.userId, weekStartOf(date), JSON.stringify(own)).run();
    return { ...prefs, source: 'week' };
  }
  await db.prepare("INSERT INTO week_plan_preferences(user_id,prefs_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET prefs_json=excluded.prefs_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId, JSON.stringify(prefs)).run();
  return prefs;
}

// The keys of a week's plan that differ from the usual week. The lengths of
// the plan chips belong to the days they are keyed by, so they go together.
export function weekOverride(prefs, defaults = {}) {
  const same = key => JSON.stringify(prefs[key] ?? null) === JSON.stringify(defaults[key] ?? null);
  const own = {};
  for (const key of ['days', 'location', 'availability', 'weeklyActivities', 'sessions', 'availabilityMode']) if (key in prefs && !same(key)) own[key] = prefs[key];
  if ('days' in own || 'sessions' in own) Object.assign(own, { days: prefs.days, sessions: prefs.sessions });
  // Time for a weekday set by hand is the athlete's, not the starting template's.
  if ('availability' in own && prefs.availabilityMode) own.availabilityMode = prefs.availabilityMode;
  return own;
}

export async function addWeekSport(db,date,sport) {
  if(!validDay(date)||!PLANNER_SPORTS.includes(sport))throw new Error(L('Neplatný den nebo sport.', 'Invalid day or sport.'));
  const prefs=await getWeekPlan(db,date),weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
  if(!prefs.days[weekday].includes(sport)&&prefs.days[weekday].length<MAX_PER_DAY)prefs.days[weekday].push(sport);
  return saveWeekPlan(db,prefs,date);
}

export async function resetWeekPlan(db, date) {
  await ensureWeekOverrides(db);
  await db.prepare('DELETE FROM week_plan_overrides WHERE user_id=? AND week_start=?').bind(db.userId, weekStartOf(date)).run();
  return getWeekPlan(db, date);
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
    const slot = sport => items.filter(x => x.sport === sport).length;
    sports.forEach((sport, k) => {
      // A second endurance session on the same day stays easy.
      const r = k === 0 ? role[i] : "recovery";
      items.push({ sport, slot: slot(sport), role: r, label: ROLE_LABELS[r], share: SHARE[r], focus: ROLE_FOCUS[r] });
    });
    for (const _ of (days[i] || []).filter(s => s === "gym")) {
      // Legs stay fresh for intervals; a long easy ride the next day tolerates leg work.
      const hardSoon = ["quality", "long"].includes(role[i]) || role[i + 1] === "quality";
      const r = hardSoon ? "gym_upper" : "gym_full";
      items.push({ sport: "gym", slot: slot("gym"), role: r, label: ROLE_LABELS[r], share: SHARE[r], focus: null });
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

// ---- One recovery week for the whole app -----------------------------------
// The week plan, the ride/run coach and the gym share it: a recovery week
// follows a week at 125 % of maintenance (CTL × 7) or more, or three weeks in a
// row at maintenance or more (3 + 1). A light plan alone never makes one: early
// in the week little is planned yet, and a lower target would only lower the
// plan further. Loads are Intervals.icu's daily training load (all sports),
// last week first.
// The body can call one sooner: when the 7-day HRV average before the week
// is below the athlete's normal range by more than the smallest worthwhile
// change (hrvDown, see hrvWeekTrendDown), as in HRV-guided training (Plews
// 2012; Javaloyes 2019). Deloads are otherwise coaches' consensus, usually
// every 4–6 weeks (Bell 2022, 2023).
export function recoveryWeek({ base, weekLoads = [], hrvDown = false }) {
  const loads = (weekLoads || []).map(Number).filter(Number.isFinite);
  if (hrvDown) return { recovery: true, reason: "hrv_trend" };
  if (!(Number(base) > 0) || !loads.length) return { recovery: false, reason: null };
  if (loads[0] >= base * 1.25) return { recovery: true, reason: "heavy_last_week" };
  if (loads.length >= 3 && loads.slice(0, 3).every(w => w >= base)) return { recovery: true, reason: "three_weeks" };
  return { recovery: false, reason: null };
}
// Is the 7-day lnRMSSD average before `weekStart` below the 60-day baseline
// before it by more than the smallest worthwhile change (0.5 SD)? Needs 5 of
// the 7 mornings and 14 baseline values. Rows: Intervals.icu wellness or the
// merged Google Health rows (id, hrv).
export function hrvWeekTrendDown(wellness, weekStart) {
  const day = n => new Date(Date.parse(weekStart + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10), from = day(-7);
  const week = (wellness || []).filter(r => r?.id >= from && r.id < weekStart && Number(r.hrv) > 0).map(r => Math.log(Number(r.hrv)));
  const base = personalBaseline(wellness || [], from, "hrv", { log: true });
  if (week.length < 5 || base.mean == null) return false;
  return week.reduce((a, v) => a + v, 0) / week.length < base.mean - 0.5 * Math.max(base.sd, 0.05);
}
// Training load of the three weeks before `weekStart` from Intervals.icu
// wellness rows (last week first); a week with too few rows ends the series.
export function weekLoadsBefore(wellness, weekStart) {
  const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const rows = (wellness || []).filter(r => r?.id && r.id < weekStart);
  const loads = [];
  for (let k = 1; k <= 3; k++) {
    const from = shift(weekStart, -7 * k), to = shift(weekStart, -7 * k + 7), week = rows.filter(r => r.id >= from && r.id < to);
    if (week.length < 5) break;
    loads.push(Math.round(week.reduce((sum, r) => sum + (Number(r.ctlLoad ?? r.atlLoad) || 0), 0)));
  }
  return loads;
}

// ---- Load targets for the week --------------------------------------------
// One calculation for the calendar chips and the generator, so both say the
// same thing. Maintenance is CTL × 7; a recovery week (see recoveryWeek) is
// at 70 %. What is already done or planned in
// Intervals.icu counts first; the rest is spread over the open plan chips,
// within sensible limits per role, so one session never carries the week.
// Load is TSS (what Intervals.icu calls Load and builds CTL/ATL from); the
// intensity factor (IF) of the role says how hard it is: TSS = h × IF² × 100.
const ROLE_IF = { recovery: .55, endurance: .68, long: .68, quality: .82 };
// Running IF is pace against threshold pace: an easy run is ~0.78, not the
// 0.68 of an easy ride, so the same load means a shorter run.
const RUN_IF = { recovery: .7, endurance: .78, long: .78, quality: .9 };
const ROLE_RANGE = { recovery: [.35, .6], endurance: [.8, 1.6], long: [1.4, 2.6], quality: [1, 1.5] };
const GYM_TSS = { gym_full: 35, gym_upper: 25 };
const SPORT_MINUTES = { ride: [30, 300], run: [20, 150] };
const round5 = v => Math.round(v / 5) * 5;

export function weekTargets({ roles = [], ctl = null, lastWeekLoad = 0, weekLoads = null, days = [], today, weekStart, hrvDown = false, rampRate = null } = {}) {
  const fitness = Number(ctl) > 0 ? Number(ctl) : null;
  if (!fitness) return { status: "no_fitness", items: [] };
  const base = Math.round(fitness * 7);
  const rule = recoveryWeek({ base, weekLoads: weekLoads?.length ? weekLoads : [Number(lastWeekLoad) || 0], hrvDown }), recovery = rule.recovery;
  // +5 % raises CTL by about CTL/120 a week, well under the 5–8 a week Friel
  // (TrainingPeaks) calls sustainable; a ramp already above 8 only holds.
  const hold = Number(rampRate) > 8;
  const target = Math.round(base * (recovery ? .7 : hold ? 1 : 1.05));
  const dateOf = i => new Date(Date.parse(weekStart + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10);
  const info = date => days.find(d => d.date === date) || { done: 0, planned: 0, sports: [] };
  let committed = 0;
  for (let i = 0; i < 7; i++) { const d = info(dateOf(i)); committed += Number(d.done) || 0; if (dateOf(i) >= today) committed += Number(d.planned) || 0; }
  // Open chips: today or later, and not covered by a session of that sport
  // already done or planned that day (two planned rides cover two ride chips).
  const open = [];
  roles.forEach((day, i) => {
    const date = dateOf(i); if (date < today) return;
    const covered = sport => (info(date).sports || []).filter(s => s === sport).length;
    for (const x of day.items || []) if ((x.slot || 0) >= covered(x.sport)) open.push({ date, ...x });
  });
  let remaining = Math.max(0, target - committed - open.filter(x => x.sport === "gym").reduce((s, x) => s + (GYM_TSS[x.role] || 30), 0));
  const endurance = open.filter(x => x.sport !== "gym"), shares = endurance.reduce((s, x) => s + (x.share || 1), 0);
  const items = open.map(x => {
    if (x.sport === "gym") return { date: x.date, sport: x.sport, slot: x.slot || 0, role: x.role, label: x.label, tss: GYM_TSS[x.role] || 30, minutes: (x.role === "gym_upper" ? 60 : 70) - (recovery ? 10 : 0) };
    const [lo, hi] = ROLE_RANGE[x.role] || [.8, 1.6], cap = recovery ? .85 : 1;
    const tss = Math.round(Math.max(lo * fitness * cap, Math.min(hi * fitness * cap, shares ? remaining * (x.share || 1) / shares : 0)));
    const [min, max] = SPORT_MINUTES[x.sport] || [30, 300], intensity = (x.sport === "run" ? RUN_IF : ROLE_IF)[x.role] || .68;
    const minutes = Math.max(min, Math.min(max, round5(tss / (intensity * intensity * 100) * 60)));
    return { date: x.date, sport: x.sport, slot: x.slot || 0, role: x.role, label: x.label, tss: Math.round(minutes / 60 * intensity * intensity * 100), minutes, intensity };
  });
  const assigned = items.reduce((s, x) => s + x.tss, 0), shortfall = Math.max(0, target - committed - assigned);
  return { status: "ok", ctl: Math.round(fitness), base, target, recovery, rampHold: hold, recoveryReason: rule.reason, weekLoads: weekLoads || null, lastWeekLoad: Math.round(lastWeekLoad), committed: Math.round(committed), items, shortfall: !recovery && shortfall > target * .15 ? Math.round(shortfall) : 0 };
}
// Running grows slowly: tendons and bones adapt later than heart and lungs.
// A week's running (done, planned and proposed together) stays within 10 %
// above the more of last week and the 4-week average; 60 min is always
// allowed for a fresh start. `history` is days with completed activities.
export const RUN_FLOOR_MINUTES = 60;
const dayShift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export const isRunActivity = a => /run/i.test(String(a?.type || a?.sport || "")) && !/walk/i.test(String(a?.type || ""));
const runMinutes = list => (list || []).filter(isRunActivity).reduce((n, a) => n + (Number(a.durationHours) || 0) * 60, 0);
export function weeklyRunCap(history = [], weekStart) {
  const weeks = [1, 2, 3, 4].map(k => { const from = dayShift(weekStart, -7 * k), to = dayShift(weekStart, -7 * (k - 1)); return Math.round((history || []).filter(d => d.date >= from && d.date < to).reduce((n, d) => n + runMinutes(d.daily?.training?.completed), 0)); });
  const base = Math.max(weeks[0], weeks.reduce((a, b) => a + b, 0) / 4);
  return { cap: Math.max(RUN_FLOOR_MINUTES, round5(base * 1.1)), base: Math.round(base), weeks };
}
// Proposed runs share what is left under the cap (at least 20 min each).
export function capRunVolume(targets, runCap, committed = 0) {
  if (!runCap || !["ok", "estimated"].includes(targets?.status)) return targets;
  const runs = targets.items.filter(x => x.sport === "run"), proposed = runs.reduce((n, x) => n + x.minutes, 0), room = Math.max(0, runCap.cap - committed);
  const info = { ...runCap, committed: Math.round(committed), proposed, limited: false };
  if (!runs.length || proposed <= room) return { ...targets, runCap: info };
  const items = targets.items.map(x => { if (x.sport !== "run") return x; const minutes = Math.max(20, round5(x.minutes * room / proposed)), intensity = x.intensity || RUN_IF[x.role] || .78; return { ...x, minutes, tss: Math.round(minutes / 60 * intensity * intensity * 100), capped: true }; });
  return { ...targets, items, runCap: { ...info, proposed: items.filter(x => x.sport === "run").reduce((n, x) => n + x.minutes, 0), limited: true } };
}
export function targetFor(targets, date, sport) { return (targets?.items || []).find(x => x.date === date && x.sport === sport) || null; }
