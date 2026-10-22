// "Kontrola týdne" (Petr, 2026-10-21): the coach looks at the athlete's state
// (today's readiness, the last days' readiness and how hard the last sessions
// felt) together with the load still ahead (the form, TSB, carried forward
// day by day over the planned sessions) and, when it is too much, proposes
// changes: the second activity of a heavy day moved or cancelled, a hard
// session eased, a session swapped for stretching. Nothing changes until the
// athlete taps "Upravit"; "Nechat" keeps the plan.
//
// It runs on the week built in Plán týdne (before it is saved) and every
// morning on Today over the calendar of the next seven days. The rules decide
// here; the server's routes collect the data and apply the changes.
import { L } from "./lang.js";
import { HARD_KINDS, qualityDomain } from "./session-intensity.js";
import { EASIER } from "./week-ai.js";
import { EXPECTED_RPE } from "./coach-reflection.js";
import { readinessFor } from "./readiness.js";

const DAY = 86400000;
const shift = (date, n) => new Date(Date.parse(date + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const gap = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round5 = m => Math.round(m / 5) * 5;
export const MAX_CHANGES = 3;

// Intensity factor of a kind: TSS = h × IF² × 100 (week-planner.js ROLE_IF).
const KIND_IF = { recovery: .55, endurance: .68, long: .7, tempo: .8, sweet_spot: .85, threshold: .88, vo2max: .85 };
const GYM_TSS = 35;
// A long session: from this length an easy ride or run counts as the long day.
const LONG_MINUTES = { ride: 150, run: 90 };
const MIN_MINUTES = { ride: 30, run: 20, gym: 30 };

// The kind of a planned session from its name and length, when no library
// workout says it: hard by name (session-intensity.js), long by length.
export function kindOfPlanned({ sport, name, minutes }) {
  if (sport === "gym") return "gym";
  const domain = qualityDomain(name, sport);
  if (domain === "high") return "vo2max";
  if (domain === "moderate") return /tempo/i.test(String(name || "")) ? "tempo" : "threshold";
  return num(minutes) >= LONG_MINUTES[sport] ? "long" : "endurance";
}

export const isHard = s => s.sport !== "gym" && HARD_KINDS.has(s.kind);
export const isLong = s => s.sport !== "gym" && (s.kind === "long" || num(s.minutes) >= (LONG_MINUTES[s.sport] || 150));

// The training load (TSS) of a planned session: its own, else from the kind and length.
export function sessionLoad(s) {
  if (num(s.tss) > 0) return num(s.tss);
  const minutes = num(s.minutes) || 0;
  if (s.sport === "gym") return minutes >= 60 ? GYM_TSS + 5 : GYM_TSS - 5;
  const f = KIND_IF[s.kind] || KIND_IF.endurance;
  return Math.round(minutes / 60 * f * f * 100);
}

// Fitness (CTL, 42 days) and fatigue (ATL, 7 days) carried forward from the
// last known day over each day's load; the form (TSB) of a day is their
// difference after it, as Intervals.icu shows it.
// start: { date, ctl, atl } (a wellness row); loads: { date: tss }.
export function forecastForm(start, loads, to) {
  if (!start || num(start.ctl) == null || num(start.atl) == null) return [];
  let ctl = num(start.ctl), atl = num(start.atl);
  const out = [];
  for (let d = shift(start.date, 1); d <= to; d = shift(d, 1)) {
    const load = num(loads[d]) || 0;
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
    out.push({ date: d, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, tsb: Math.round(ctl - atl) });
  }
  return out;
}

const weekdayIn = date => L(["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"], ["on Sunday", "on Monday", "on Tuesday", "on Wednesday", "on Thursday", "on Friday", "on Saturday"])[new Date(date + "T12:00:00Z").getUTCDay()];
const weekdayTo = date => L(["na neděli", "na pondělí", "na úterý", "na středu", "na čtvrtek", "na pátek", "na sobotu"], ["to Sunday", "to Monday", "to Tuesday", "to Wednesday", "to Thursday", "to Friday", "to Saturday"])[new Date(date + "T12:00:00Z").getUTCDay()];
const minus = v => String(v).replace("-", "−");
const weekdayShort = date => L(["ne", "po", "út", "st", "čt", "pá", "so"], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])[new Date(date + "T12:00:00Z").getUTCDay()];
const dayIn = (date, today) => date === today ? L("dnes", "today") : date === shift(today, 1) ? L("zítra", "tomorrow") : weekdayIn(date);
const capital = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// How the athlete is: 0 fresh, 1 strained, 2 tired. From today's readiness
// (red 2, yellow 1), the two days before it (two of them below green: 1), the
// sessions of the last three days (one that felt much harder than its kind,
// or 9 of 10 and more when the kind isn't known: 1)
// and the form today (TSB −20: 1, −30: 2). Each sign is one chip on the card.
// readiness: { score, zone }; past: [{ date, zone }]; efforts: [{ date, rpe, kind }]
export function strainOf({ today, readiness = null, past = [], efforts = [], tsb = null } = {}) {
  const chips = [];
  let points = 0;
  const zone = readiness?.zone || null, score = num(readiness?.score);
  if (zone === "red" || zone === "yellow") {
    points += zone === "red" ? 2 : 1;
    chips.push(score != null ? L("Připravenost ", "Readiness ") + score : L("Nízká připravenost", "Low readiness"));
  }
  const low = past.filter(p => p?.date < today && p.date >= shift(today, -2) && ["red", "yellow"].includes(p.zone)).map(p => p.date).sort();
  if (low.length >= 2) {
    points += 1;
    chips.push(L("Nižší připravenost ", "Lower readiness ") + low.map(weekdayShort).join(L(" a ", " and ")));
  }
  const hard = efforts.filter(e => e?.date < today && e.date >= shift(today, -3) && num(e.rpe) > 0)
    .filter(e => { const r = EXPECTED_RPE[e.kind]; return num(e.rpe) >= 9 || (r && num(e.rpe) >= r[1] + 2); })
    .sort((a, b) => b.date.localeCompare(a.date));
  if (hard.length) {
    points += 1;
    const e = hard[0];
    chips.push((e.date === shift(today, -1) ? L("Včera", "Yesterday") : capital(weekdayShort(e.date))) + L(": náročnost ", ": effort ") + num(e.rpe) + L("/10", "/10"));
  }
  if (num(tsb) != null && num(tsb) <= -20) {
    points += num(tsb) <= -30 ? 2 : 1;
    chips.push(L("Forma ", "Form ") + minus(Math.round(num(tsb))));
  }
  return { level: Math.min(2, points), chips };
}

// The lowest form allowed ahead: −30 (Intervals.icu's high-risk zone) when
// fresh, −25 strained, −20 tired.
export const formFloor = level => [-30, -25, -20][Math.max(0, Math.min(2, level || 0))];

// sessions: [{ id, date, sport, minutes, kind, tss, name, fixed? }] from
// `from` on (fixed ones count but don't change); done: { date: tss } of the
// days already behind (today included); start: the wellness row to carry the
// form from; freeOn(date): true when the day may take a moved session;
// morning: today's own rules (readiness) apply.
export function checkWeek({ today, from, to, sessions = [], done = {}, start = null, strain = { level: 0, chips: [] }, readiness = null, freeOn = () => true, morning = false, moveUntil = null }) {
  let list = sessions.filter(s => s.date >= from && s.date <= to).map(s => ({ ...s, kind: s.kind || kindOfPlanned(s) }));
  const changes = [], changed = new Set();
  const level = strain?.level || 0, floor = formFloor(level);
  const loads = () => { const out = { ...done }; for (const s of list) out[s.date] = (out[s.date] || 0) + sessionLoad(s); return out; };
  const forecast = () => forecastForm(start, loads(), to).filter(f => f.date >= from);
  const open = s => !s.fixed && !changed.has(s.id);
  const add = (s, change) => { changes.push({ id: s.id, date: s.date, sport: s.sport, from: { name: s.name || null, minutes: num(s.minutes), kind: s.kind || null }, ...change }); changed.add(s.id); };
  const ease = s => {
    const kind = isHard(s) ? EASIER[s.kind] || "endurance" : "endurance";
    const minutes = Math.max(MIN_MINUTES[s.sport], round5((num(s.minutes) || 60) * (isLong(s) ? .7 : .85)));
    add(s, { type: "ease", to: { kind, minutes } });
    list = list.map(x => x.id === s.id ? { ...x, kind, minutes, tss: null } : x);
  };
  const remove = (s, type, to = null) => { add(s, { type, to }); list = list.filter(x => x.id !== s.id); };
  const move = (s, date) => { add(s, { type: "move", to: { date } }); list = list.map(x => x.id === s.id ? { ...x, date } : x); };
  // A free day after `date`: nothing planned, and the athlete has time then.
  const freeAfter = date => { for (let d = shift(date, 1); d <= (moveUntil || shift(date, 3)) && d <= shift(date, 3); d = shift(d, 1)) if (!list.some(x => x.date === d) && freeOn(d) && !list.some(x => (isHard(x) || isLong(x)) && x.date === shift(d, 1))) return d; return null; };
  let reason = null;
  // The lowest form ahead as planned, before any change.
  const lowest = [...forecast()].sort((a, b) => a.tsb - b.tsb)[0] || null;

  // 1. The morning: a red day eases today's hard or long session to a short
  // recovery one and swaps today's gym for stretching; a yellow day of a
  // strained athlete eases today's hard session.
  if (morning) {
    const zone = readiness?.zone || null;
    for (const s of list.filter(x => x.date === today && open(x))) {
      if (changes.length >= MAX_CHANGES) break;
      if (zone === "red") {
        if (s.sport === "gym") remove(s, "recovery");
        else if (isHard(s) || isLong(s) || num(s.minutes) > 60) { add(s, { type: "ease", to: { kind: "recovery", minutes: Math.min(45, num(s.minutes) || 45) } }); list = list.map(x => x.id === s.id ? { ...x, kind: "recovery", minutes: Math.min(45, num(s.minutes) || 45), tss: null } : x); }
        reason = reason || "readiness";
      } else if (zone === "yellow" && level >= 1 && isHard(s)) { ease(s); reason = reason || "readiness"; }
    }
  }

  // 2. A heavy day of two activities soon while the athlete is strained, or the
  // form ahead falls below the floor around it: one of them goes. The gym goes
  // when a hard or long ride or run is that day or the next (legs), else the
  // session with more load ("v sobotu jen gym"); it moves to a free day within
  // three days, else a gym becomes stretching and a ride or run is cancelled.
  const days = [...new Set(list.map(s => s.date))].sort();
  for (const date of days) {
    if (changes.length >= MAX_CHANGES) break;
    const here = list.filter(s => s.date === date && s.sport !== "walk");
    if (here.length < 2 || !here.some(open)) continue;
    const f = forecast(), near = f.filter(x => x.date >= date && x.date <= shift(date, 1));
    // The state reaches three days ahead (all the week when tired); a double
    // day under one and a half times a usual day's load (CTL) is no burden.
    const dayLoad = here.reduce((n, s) => n + sessionLoad(s), 0), usual = num(start?.ctl) || 50;
    const strained = level >= 1 && dayLoad >= usual * 1.5 && (level >= 2 || gap(today, date) <= 3);
    const heavy = strained || near.some(x => x.tsb < floor);
    if (!heavy) continue;
    const gym = here.find(s => s.sport === "gym" && open(s));
    const keyNearby = list.some(s => s.sport !== "gym" && s.date >= date && s.date <= shift(date, 1) && (isHard(s) || isLong(s)));
    const drop = keyNearby && gym ? gym : [...here].filter(open).sort((a, b) => sessionLoad(b) - sessionLoad(a))[0];
    if (!drop) continue;
    const to = freeAfter(date);
    if (to) move(drop, to);
    else if (drop.sport === "gym") remove(drop, "recovery");
    else remove(drop, "cancel");
    reason = reason || (near.some(x => x.tsb < floor) ? "form" : "strain");
  }

  // 3. The form ahead: while a day falls below the floor, the latest hard
  // session before it is eased, else the latest long one is shortened, else a
  // gym before it becomes stretching.
  while (changes.length < MAX_CHANGES) {
    const worst = forecast().filter(x => x.tsb < floor).sort((a, b) => a.tsb - b.tsb)[0];
    if (!worst) break;
    const before = list.filter(s => s.date <= worst.date && open(s)).sort((a, b) => b.date.localeCompare(a.date));
    const s = before.find(isHard) || before.find(isLong) || before.find(x => x.sport === "gym");
    if (!s) break;
    if (s.sport === "gym") remove(s, "recovery"); else ease(s);
    reason = reason || "form";
  }

  changes.sort((a, b) => a.date.localeCompare(b.date));
  return { changes, reason, lowest, forecast: forecast(), floor };
}

// The card's sentence: why, and the first change in words.
export function checkSummary({ changes, reason, strain, lowest, today }) {
  if (!changes.length) return null;
  const why = reason === "readiness" ? L("Připravenost je dnes nízká.", "Readiness is low today.")
    : reason === "form" && lowest ? L(`Forma by ${dayIn(lowest.date, today)} spadla na ${minus(lowest.tsb)}.`, `Your form would drop to ${minus(lowest.tsb)} ${dayIn(lowest.date, today)}.`)
    : (strain?.level || 0) >= 2 ? L("Tělo je po posledních dnech unavené.", "Your body is tired after the last few days.")
    : L("Po posledních dnech je toho dopředu moc.", "After the last few days there is too much ahead.");
  const c = changes[0], when = dayIn(c.date, today), what = { ride: L("kolo", "the ride"), run: L("běh", "the run"), gym: L("posilovnu", "the gym") }[c.sport] || L("trénink", "the session");
  const keep = { ride: L("jen gym", "only the gym"), run: L("jen gym", "only the gym"), gym: L("jen vytrvalost", "only the endurance session") }[c.sport];
  const act = c.type === "move" ? L(`${capital(when)} bych ${what} přesunul ${weekdayTo(c.to.date)}.`, `I'd move ${what} ${when} ${weekdayTo(c.to.date)}.`)
    : c.type === "recovery" ? L(`${capital(when)} bych místo ${c.sport === "gym" ? "posilovny" : "tréninku"} dal protažení.`, `${capital(when)} I'd do stretching instead of ${what}.`)
    : c.type === "cancel" ? L(`${capital(when)} bych nechal ${keep}.`, `${capital(when)} I'd keep ${keep}.`)
    : L(`${capital(when)} bych ${what} odlehčil.`, `${capital(when)} I'd make ${what} easier.`);
  return why + " " + act;
}

// The chips: the athlete's state, and the lowest form ahead when it is below the floor.
export function checkChips({ strain, lowest, floor, today }) {
  const chips = [...(strain?.chips || [])];
  if (lowest && lowest.tsb < floor && lowest.date > today) chips.push(L("Forma ", "Form ") + weekdayIn(lowest.date) + " " + minus(lowest.tsb));
  return chips.slice(0, 4);
}

// What a check was made from: the sessions and the state. A new session, a
// moved one or another readiness makes a new check.
export function checkSignature(sessions, strain, readiness) {
  return [...sessions.map(s => [s.id, s.date, s.sport, Math.round(num(s.minutes) || 0), s.kind || ""].join(":")).sort(),
    "r:" + (readiness?.zone || "") + "/" + (readiness?.score ?? ""), "l:" + (strain?.level || 0)].join("|");
}

// The same check for the AI coach (coach-assistant.js coachContext weekLoad),
// from the data the chat has: the planned sessions of the next seven days,
// the readiness the coach uses today, the two days before it, the RPE given in
// Intervals.icu and the form. Null when the athlete is fresh and nothing would
// change, so the chat's data stay small.
export function weekCheckForCoach({ date, week, fitness, health, profile = null, readiness = null }) {
  const days = week?.days || [], wellness = fitness?.wellness || [], to = shift(date, 6);
  const sportOf = a => /ride|bike|cycl/i.test(a?.type || "") ? "ride" : /run/i.test(a?.type || "") ? "run" : /weight|strength|gym/i.test(a?.type || "") ? "gym" : null;
  const sessions = [];
  for (const d of days.filter(d => d.date >= date && d.date <= to)) for (const a of d.daily?.training?.planned || []) {
    const sport = sportOf(a); if (!sport) continue;
    const minutes = Math.round((num(a.durationHours) || 1) * 60);
    sessions.push({ id: String(a.id || d.date + ":" + sessions.length), date: d.date, sport, minutes, tss: num(a.tss), name: a.name || null, kind: kindOfPlanned({ sport, name: a.name, minutes }), fixed: /race|závod|zavod|\btest\b/i.test(String(a.name || "")) });
  }
  const past = [shift(date, -1), shift(date, -2)].map(d => ({ date: d, zone: readinessFor({ date: d, google: health?.wellness || [], intervals: wellness, sessions: health?.sleep || [], profile })?.zone || null }));
  const efforts = [];
  for (const d of days.filter(d => d.date >= shift(date, -3) && d.date < date)) for (const a of d.daily?.training?.completed || []) {
    const rpe = num(a.rpe ?? a.payload?.icu_rpe ?? a.payload?.perceived_exertion); if (!(rpe > 0)) continue;
    const raw = num(a.intensityFactor ?? a.payload?.icu_intensity), fi = raw > 3 ? raw / 100 : raw;
    efforts.push({ date: d.date, rpe, kind: fi >= .88 ? "threshold" : fi >= .8 ? "tempo" : fi > 0 ? "endurance" : null });
  }
  const start = [...wellness].filter(w => w?.id < date && num(w.ctl) != null && num(w.atl) != null).sort((a, b) => String(a.id).localeCompare(String(b.id))).at(-1);
  const row = wellness.find(w => w?.id === date) || start, tsb = row ? num(row.tsb ?? (num(row.ctl) - num(row.atl))) : null;
  const done = {};
  if (start) for (const d of days.filter(d => d.date > start.id && d.date <= date)) done[d.date] = (d.daily?.training?.completed || []).reduce((n, a) => n + (num(a.tss) || 0), 0);
  const today = { score: num(readiness?.score), zone: readiness?.status || readiness?.zone || null };
  const strain = strainOf({ today: date, readiness: today, past, efforts, tsb });
  const r = checkWeek({ today: date, from: date, to, sessions, done, start: start ? { date: start.id, ctl: num(start.ctl), atl: num(start.atl) } : null, strain, readiness: today, morning: true });
  if (!r.changes.length && !strain.level) return null;
  return {
    state: strain.level === 2 ? "tired" : strain.level === 1 ? "strained" : "fresh", signs: strain.chips,
    ...(r.lowest ? { lowestForm: { date: r.lowest.date, tsb: r.lowest.tsb }, formFloor: r.floor } : {}),
    proposedChanges: r.changes.map(c => ({ date: c.date, sport: c.sport, session: c.from?.name || c.sport, eventId: String(c.id).startsWith("planned:") ? c.id : null,
      change: c.type === "move" ? "move to " + c.to.date : c.type === "cancel" ? "cancel" : c.type === "recovery" ? "stretching instead" : "easier: " + c.to.kind + " " + c.to.minutes + " min" })),
  };
}

// ---- Stored morning checks: one a day, pending until the athlete decides ----

export async function ensureWeekCheckTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS week_checks (
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TEXT,
    PRIMARY KEY (user_id, date)
  )`).run();
}

export async function readWeekCheck(db, date) {
  await ensureWeekCheckTable(db);
  const row = await db.prepare("SELECT * FROM week_checks WHERE user_id=? AND date=?").bind(db.userId, date).first();
  if (!row) return null;
  let payload = {}; try { payload = JSON.parse(row.payload_json || "{}"); } catch { payload = {}; }
  return { ...payload, date: row.date, signature: row.signature, status: row.status, createdAt: row.created_at || null, decidedAt: row.decided_at || null };
}

export async function saveWeekCheck(db, { date, signature, check }) {
  await ensureWeekCheckTable(db);
  await db.prepare(`INSERT INTO week_checks(user_id,date,signature,status,payload_json) VALUES(?,?,?,'pending',?)
    ON CONFLICT(user_id,date) DO UPDATE SET signature=excluded.signature,status='pending',payload_json=excluded.payload_json,created_at=CURRENT_TIMESTAMP,decided_at=NULL`)
    .bind(db.userId, date, signature, JSON.stringify(check)).run();
  return { ...check, date, signature, status: "pending" };
}

export async function decideWeekCheck(db, date, status, check = null) {
  await ensureWeekCheckTable(db);
  if (check) await db.prepare("UPDATE week_checks SET status=?,payload_json=?,decided_at=CURRENT_TIMESTAMP WHERE user_id=? AND date=?").bind(status, JSON.stringify(check), db.userId, date).run();
  else await db.prepare("UPDATE week_checks SET status=?,decided_at=CURRENT_TIMESTAMP WHERE user_id=? AND date=?").bind(status, db.userId, date).run();
}

// A decided check stays on Today for an hour ("Upraveno i v kalendáři"), a
// pending one until the day ends; "Nechat" hides it.
export const CHECK_SHOWN_MS = 60 * 60000;
export function shownWeekCheck(check, { today, now = Date.now() } = {}) {
  if (!check || check.date !== today || check.status === "kept") return null;
  if (check.status === "pending") return (check.changes || []).length ? check : null;
  const t = Date.parse(String(check.decidedAt || "").replace(" ", "T") + (/Z$/.test(String(check.decidedAt || "")) ? "" : "Z"));
  return Number.isFinite(t) && now - t < CHECK_SHOWN_MS ? check : null;
}
