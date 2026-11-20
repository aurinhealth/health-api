// One decision of the day (Petr 2026-11-20, decision 1 of the redesign 602
// review): the readiness verdict (day-verdict.js), the recovery time
// (recovery-time.js) and the muscles (muscle-fatigue.js) judged once, by rules
// and never by the AI (AI-7). Today's line under the number, its coach card
// and plan, Recovery, Activity of the day (coach-pick.js) and the coach's text
// on Training read this one result, so no screen says "hard" while another
// says "recover". /app/api/today builds it and keeps it per day
// (saveDayDecision) for the parts that load on their own.
import { L } from "./lang.js";
import { isHardSession } from "./session-intensity.js";

const TABLE = "CREATE TABLE IF NOT EXISTS day_decisions (user_id INTEGER NOT NULL, date TEXT NOT NULL, decision_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, date))";

// The muscles a ride, run or swim leans on; the gym's come from its exercises.
const LEGS = ["quads", "hamstrings", "glutes", "calves"];
const SPORT_MUSCLES = { run: ["hamstrings", "quads", "calves", "glutes"], ride: ["quads", "glutes"], swim: ["back", "shoulders"] };

// The muscles a planned session works: a gym plan's (recovery-time.js
// todayRecovery: the main muscle of each exercise), else its sport's. No
// import of muscle-fatigue.js here: app-today.js imports this module and
// muscle-fatigue.js sits in an import cycle with strength-generator.js.
export function sessionMuscles(session, gymMuscles = null) {
  if (!session) return [];
  // A gym session without its exercises (from Intervals.icu): the legs when its name says so.
  if (session.sport === "strength") return Array.isArray(gymMuscles) && gymMuscles.length ? gymMuscles : /\b(legs?|lower)\b|nohy|dolní/i.test(String(session.title || "")) ? LEGS : [];
  return SPORT_MUSCLES[session.sport] || [];
}

// Muscles still recovering after `day` (muscle-fatigue.js muscles: {id, label,
// state, readyDate}), the most tired first.
const tiredOn = (muscles, ids, day) => (muscles || []).filter(m => ids.includes(m.id) && m.state !== "rested" && m.readyDate && m.readyDate > day);

// "Hamstrings still recovering, lighter version?" with at most two names.
export function lighterText(labels) {
  const names = labels.slice(0, 2);
  if (!names.length) return null;
  const cs = names.join(" a "), en = names.join(" and ");
  return L(`${cs[0].toUpperCase() + cs.slice(1)} se ještě zotavují, lehčí verze?`, `${en[0].toUpperCase() + en.slice(1)} still recovering, lighter version?`);
}

// A planned session against the muscles: a gym session or a hard ride, run or
// swim on muscles that are not rested by that day asks for a lighter version,
// and so does a long one (90 min and more: a long run loads the hamstrings
// most). A short easy aerobic session on tired legs is fine. session: {title,
// sport, minutes, tss, type} as the plan has it, so the load counts too.
const LONG_MINUTES = 90;
function judged(session, day, muscles, gymDay) {
  const loads = session.sport === "strength" || isHardSession(session, session.sport) || Number(session.minutes) >= LONG_MINUTES;
  const tired = loads ? tiredOn(muscles, sessionMuscles(session, gymDay), day) : [];
  return {
    date: day, title: session.title, sport: session.sport,
    fits: !tired.length,
    ...(tired.length ? { muscles: tired.map(m => m.id), readyDate: tired.map(m => m.readyDate).sort().at(-1), lighter: lighterText(tired.map(m => String(m.label || m.id).toLowerCase())) } : {})
  };
}

// verdict: day-verdict.js dayVerdict's key (null without a number); zone: the
// readiness zone; recoveryTime: recovery-time.js recoveryTime (null when
// nothing is left to recover from); muscles: muscle-fatigue.js muscles;
// open, tomorrow: [{title, sport}] still planned today and planned tomorrow;
// trained: today's training is done and nothing is left; gym: the muscles of
// each day's gym plan by date ({date: [ids]}).
// Without a readiness number (no watch yet, a new account) the key is null:
// the muscles are still judged.
export function dayDecision({ date, verdict = null, zone = null, recoveryTime = null, muscles = [], open = [], tomorrow = [], trained = false, gym = {}, now = Date.now() } = {}) {
  if (!date) return null;
  // Hard training waits for the recovery time when it runs past today: a
  // green morning two days after a long ride is still a steady day (the
  // readiness alone said "hard"). Ready later today (after an evening Z2
  // ride) is no reason: the session can be in the afternoon.
  const waiting = Boolean(recoveryTime?.readyAt && Date.parse(recoveryTime.readyAt) > now && recoveryTime.readyDate && recoveryTime.readyDate > date);
  const recovering = verdict === "hard" && waiting;
  const key = recovering ? "steady" : verdict;
  const next = d => new Date(Date.parse(d + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  return {
    date,
    // A key of day-verdict.js VERDICT_KEYS: what to do today.
    key: key || null,
    // The readiness said hard and only the recovery time holds it back.
    recovering,
    // When hard training is fine again by the recovery time: null when it is
    // already, or when a yellow or red morning waits for a greener one.
    hardFrom: waiting && zone === "green" ? recoveryTime.readyDate || null : null,
    waitsGreener: zone === "yellow" || zone === "red",
    // Legs not rested by the end of today (Activity of the day: upper-body gym, swimming).
    legsTired: tiredOn(muscles, LEGS, date).length > 0,
    // The day's training is done: the rest of the day is recovery.
    done: Boolean(trained),
    // Today's sessions still ahead and tomorrow's, each judged against the muscles.
    sessions: (open || []).filter(s => s?.title).map(s => judged(s, date, muscles, gym?.[date])),
    tomorrow: (tomorrow || []).filter(s => s?.title).map(s => judged(s, next(date), muscles, gym?.[next(date)]))
  };
}

// Recovery's words for a hard day that waits ("Hard training from Tue").
export function recoveringText(decision) {
  if (!decision?.recovering) return null;
  const day = decision.hardFrom ? new Date(decision.hardFrom + "T12:00:00Z").getUTCDay() : null;
  const name = day == null ? null : L(["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"][day], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]);
  return name ? L(`Tělo se ještě zotavuje z posledních tréninků: dnes s mírou, tvrdý trénink zase ${name}.`, `Your body is still recovering from recent training: keep today steady, hard training again from ${name}.`)
    : L("Tělo se ještě zotavuje z posledních tréninků: dnes s mírou.", "Your body is still recovering from recent training: keep today steady.");
}

// The cap the day puts on Activity of the day (coach-pick.js rankOptions):
// "hard", "steady" (nothing hard), "easy" or "rest".
export function intensityCap(decision) {
  if (!decision?.key) return null;
  if (decision.key === "rest") return "rest";
  if (decision.done) return "rest";
  return decision.key === "hard" ? "hard" : decision.key === "easy" ? "easy" : "steady";
}

// Kept per day: one row, written only when it changed.
export async function saveDayDecision(db, userId, decision, now = new Date()) {
  if (!db || userId == null || !decision?.date) return false;
  const json = JSON.stringify(decision);
  const upsert = () => db.prepare("INSERT INTO day_decisions (user_id, date, decision_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET decision_json=excluded.decision_json, updated_at=excluded.updated_at WHERE day_decisions.decision_json != excluded.decision_json")
    .bind(userId, decision.date, json, now.toISOString()).run();
  // The table only when it is missing: no extra statement on every Today.
  await upsert().catch(async error => {
    if (!/no such table/i.test(String(error?.message))) throw error;
    await db.prepare(TABLE).run();
    await upsert();
  });
  return true;
}

export async function readDayDecision(db, userId, date) {
  if (!db || userId == null || !date) return null;
  const row = await db.prepare("SELECT decision_json FROM day_decisions WHERE user_id=? AND date=?").bind(userId, date).first()
    .catch(error => /no such table/i.test(String(error?.message)) ? null : Promise.reject(error));
  try { return row ? JSON.parse(row.decision_json) : null; } catch { return null; }
}
