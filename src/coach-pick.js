// Aktivita dne (Dnes): the coach picks the day's activity from anything
// the athlete does, not only the main sport: a ride or run of the kind the
// ride/run coach chose for the morning, the gym (upper body when the legs are
// tired), swimming, the sauna or a day off. Readiness, the plan for the day,
// what was done lately and the main sport rank them; an option the athlete
// turns down loses weight for two weeks (the coach learns from declines).
import { L } from "./lang.js";
import { isHardKind } from "./session-intensity.js";
import { activityKindOf, sessionOf } from "./activity-match.js";
import { addRecovery, ensureRecoveryTable } from "./recovery-plan.js";

const TABLE = "CREATE TABLE IF NOT EXISTS coach_picks (user_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, top TEXT, created_at TEXT NOT NULL, PRIMARY KEY (user_id, date))";
const KINDS = ["ride", "run", "gym", "swim", "sauna", "rest"];
const SKIP = "skip";
const LESS_TABLE = "CREATE TABLE IF NOT EXISTS coach_pick_less (user_id INTEGER NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, kind))";
const DETAILS_TABLE = "CREATE TABLE IF NOT EXISTS coach_pick_details (user_id INTEGER NOT NULL, date TEXT NOT NULL, signature TEXT NOT NULL, details_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, date))";

const KIND_NAMES = () => ({
  recovery: L("regenerace", "recovery"), endurance: L("vytrvalost", "endurance"), long_endurance: L("dlouhá vytrvalost", "long endurance"),
  tempo: L("tempo", "tempo"), sweet_spot: L("sweet spot", "sweet spot"), threshold: L("práh", "threshold"), vo2: L("VO2max", "VO2max"),
  vo2max: L("VO2max", "VO2max"), anaerobic: L("anaerobní", "anaerobic"), sprint: L("sprinty", "sprints"), rest: L("volno", "rest")
});
// A triathlete has three main sports.
const MAIN = { cycling: ["ride"], running: ["run"], swimming: ["swim"], strength: ["gym"], triathlon: ["ride", "run", "swim"] };

const sentence = text => { const t = String(text || "").trim(); return t ? t[0].toUpperCase() + t.slice(1).replace(/\.?$/, ".") : ""; };

// swim: the swim coach, only for those who swim (main sport or recent swims);
// without it swimming stays a fixed easy option.
// sports: kinds done in the last 60 days (activityKindOf of each), today: kinds
// done today, declines: [{top, date}] of the last two weeks, planned: the
// kinds planned for today.
// done: today's sessions [{kind, minutes, tss}] for the words after training.
export function rankOptions({ ride, run, swim = null, mainSport = "general", sports = [], today = [], declines = [], planned = [], done = [], athleteStatus = "active", illness = false }) {
  if (athleteStatus && athleteStatus !== "active") return pausedOptions(athleteStatus);
  const status = ride?.readiness?.status || run?.readiness?.status || "yellow";
  const names = KIND_NAMES();
  const lowerTired = (ride?.load?.lowerBodyGymSignals48h || 0) > 0;
  const practised = new Set(sports), main = MAIN[mainSport] || [], trainedToday = today.some(k => k !== "walk");
  const session = coach => coach?.recommendation?.session || {};
  const endurance = (sport, coach) => {
    const s = session(coach), kind = s.kind || "endurance", minutes = Math.round(Number(s.durationMinutes) || (sport === "swim" ? 40 : sport === "run" ? 45 : 75));
    const title = (sport === "run" ? L("Běh", "Run") : sport === "swim" ? L("Plavání", "Swim") : L("Kolo", "Ride")) + " · " + (names[kind] || kind);
    return { kind: sport, title, detail: L(`${minutes} min`, `${minutes} min`) + (isHardKind(kind) ? "" : sport === "run" ? L(" · zóna 2", " · zone 2") : sport === "swim" ? L(" · plynule", " · steady") : L(" · lehce", " · easy")), hard: isHardKind(kind), rest: kind === "rest" || kind === "recovery" };
  };
  const options = [
    endurance("ride", ride),
    endurance("run", run),
    { kind: "gym", title: lowerTired ? L("Posilovna · horní polovina", "Gym · upper body") : L("Posilovna · celé tělo", "Gym · full body"), detail: lowerTired ? L("60 min · nohy nech odpočinout", "60 min · let the legs rest") : L("60 min", "60 min") },
    swim ? endurance("swim", swim) : { kind: "swim", title: L("Plavání · technika", "Swim · technique"), detail: L("45 min · 1 800 m", "45 min · 1,800 m"), lines: [[L("Rozplavání", "Warm-up"), "200 m"], [L("Technika", "Drills"), L("8 × 50 m · pauza 20 s", "8 × 50 m · 20 s rest")], [L("Plynule", "Steady"), L("1 000 m lehce", "1,000 m easy")], [L("Vyplavání", "Cool-down"), "200 m"]] },
    { kind: "sauna", title: L("Sauna", "Sauna"), detail: L("3 × 12 min", "3 × 12 min"), lines: [[L("3 kola", "3 rounds"), L("12 min v sauně", "12 min in the sauna")], [L("Mezi tím", "Between"), L("5 min venku nebo sprcha", "5 min outside or a shower")], [L("Pití", "Drink"), L("0,5 l vody", "0.5 l of water")]] },
    { kind: "rest", title: L("Volno", "Day off"), detail: L("Procházka 30 min a protažení", "A 30 min walk and stretching"), lines: [[L("Procházka", "Walk"), "30 min"], [L("Protažení", "Stretching"), "15 min"]] }
  ];
  const base = {
    green: { ride: 80, run: 80, gym: 70, swim: 45, sauna: 30, rest: 10 },
    yellow: { ride: 70, run: 65, gym: 60, swim: 55, sauna: 45, rest: 40 },
    red: { ride: 20, run: 10, gym: 15, swim: 35, sauna: 70, rest: 95 }
  }[status] || {};
  for (const o of options) {
    let score = base[o.kind] ?? 30;
    if (["ride", "run", "gym", "swim"].includes(o.kind)) {
      if (main.includes(o.kind)) score += 15;
      if (!practised.has(o.kind === "gym" ? "strength" : o.kind)) score -= main.includes(o.kind) ? 0 : 25;
      // A triathlete with tired legs: swimming trains without loading them.
      if (o.kind === "swim" && mainSport === "triathlon" && lowerTired) score += 10;
      if (planned.includes(o.kind) && status !== "red") score += 30;
      if (o.hard && status === "green") score += 5;
      if (o.rest) score -= 20;
      if (trainedToday) score -= 60;
    }
    // After training: stretching and a walk first, the sauna next.
    if (trainedToday && o.kind === "rest") score += 60;
    if (trainedToday && o.kind === "sauna") score += 30;
    if (o.kind === "gym" && lowerTired) score -= 5;
    score -= Math.min(30, 10 * declines.filter(d => d.top === o.kind).length);
    o.score = score;
  }
  // Signs of an oncoming illness (illness-check.js): no sauna, it only adds load.
  if (illness) options.splice(options.findIndex(o => o.kind === "sauna"), 1);
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  // A day off on a bad morning comes with the sauna when it helps.
  if (best.kind === "rest" && status === "red" && !trainedToday && !illness) { best.title = L("Volno a sauna", "Day off and sauna"); best.detail = L("Procházka · sauna 3 × 12 min", "A walk · sauna 3 × 12 min"); best.lines = [[L("Procházka", "Walk"), "30 min"], [L("Sauna", "Sauna"), L("3 × 12 min", "3 × 12 min")]]; }
  // After training the day off is stretching and an evening walk.
  const rest = options.find(o => o.kind === "rest");
  if (trainedToday && rest) { rest.title = L("Protažení", "Stretching"); rest.detail = L("15 min · večer procházka 30 min", "15 min · an evening walk of 30 min"); rest.lines = [[L("Protažení", "Stretching"), "15 min"], [L("Večer", "Evening"), L("procházka 30 min", "a 30 min walk")]]; }
  best.best = true;
  best.reason = reasonFor(best, { status, ride, lowerTired, planned, trainedToday, done });
  return { status, score: ride?.readiness?.score ?? null, lowerTired, options: options.map(({ score, hard, rest, ...o }) => ({ ...o, action: o.kind === "ride" || o.kind === "run" || o.kind === "swim" && swim ? "library" : o.kind === "gym" ? "gym" : "accept" })) };
}

// Nemoc, Zranění or Pauza set by the athlete: no training on offer, only rest
// (the sauna too during a break, never while ill).
function pausedOptions(athleteStatus) {
  const rest = athleteStatus === "sick"
    ? { kind: "rest", title: L("Odpočinek", "Rest"), detail: L("Spánek, pití a klid", "Sleep, drinks and quiet"), lines: [[L("Pití", "Drink"), L("2–3 l během dne", "2–3 l through the day")], [L("Spánek", "Sleep"), L("o hodinu déle", "an hour longer")]] }
    : { kind: "rest", title: L("Volno", "Day off"), detail: L("Procházka 30 min a protažení", "A 30 min walk and stretching"), lines: [[L("Procházka", "Walk"), "30 min"], [L("Protažení", "Stretching"), "15 min"]] };
  const reason = { sick: L("Máš nastavenou Nemoc. Dnes odpočívej, trénink i sauna počkají, až budeš zdravý.", "Your status is Sick. Rest today; training and the sauna wait until you're well."),
    injured: L("Máš nastavené Zranění. Náhradní trénink navrhnu, až kouči popíšeš svá omezení.", "Your status is Injured. I'll suggest other training once you tell the coach your limitations."),
    on_break: L("Máš nastavenou Pauzu, dnes bez tréninku.", "Your status is Rest, no training today.") }[athleteStatus] || L("Dnes bez tréninku.", "No training today.");
  const options = [{ ...rest, best: true, reason }];
  if (athleteStatus === "on_break") options.push({ kind: "sauna", title: L("Sauna", "Sauna"), detail: L("3 × 12 min", "3 × 12 min"), lines: [[L("3 kola", "3 rounds"), L("12 min v sauně", "12 min in the sauna")], [L("Mezi tím", "Between"), L("5 min venku nebo sprcha", "5 min outside or a shower")], [L("Pití", "Drink"), L("0,5 l vody", "0.5 l of water")]] });
  return { status: "red", score: null, lowerTired: false, paused: athleteStatus, options: options.map(o => ({ ...o, action: "accept" })) };
}

// "Dnes máš za sebou kolo, 1 h 07, 74 TSS." from today's longest session.
export function doneSentence(done = []) {
  const s = [...done].filter(d => d.kind !== "walk").sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0];
  if (!s) return L("Dnes už máš odtrénováno.", "You've already trained today.");
  const verb = { ride: L("Dnes máš za sebou kolo", "You rode"), run: L("Dnes máš za sebou běh", "You ran"), strength: L("Dnes máš za sebou posilovnu", "You did the gym"), swim: L("Dnes máš za sebou plavání", "You swam") }[s.kind] || L("Máš za sebou trénink", "You've trained");
  const m = Math.round(s.minutes || 0), length = m >= 60 ? Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") : m + " min";
  return verb + (m > 0 ? ", " + length : "") + (s.tss > 0 ? ", " + Math.round(s.tss) + " TSS" : "") + ".";
}

function reasonFor(best, { status, ride, lowerTired, planned, trainedToday, done }) {
  if (trainedToday) return doneSentence(done) + " " + (best.kind === "sauna" ? L("Doporučuju saunu 3 × 12 minut na regeneraci.", "I recommend the sauna, 3 × 12 minutes, to recover.") : best.kind === "rest" ? L("Doporučuju 15 minut protažení a večer lehkou procházku.", "I recommend 15 minutes of stretching and a light walk in the evening.") : L("Další trénink dnes jen lehce.", "Any more training today only easy."));
  const why = (ride?.readiness?.reasons || []).filter(r => !/chybí HRV|no HRV/i.test(r))[0];
  if (status === "red") return [sentence(why) || L("Připravenost je dnes nízká.", "Readiness is low today."), L("Dnes radši odpočívej.", "Rest today instead.")].join(" ");
  if (planned.includes(best.kind)) return L("Sedí to s plánem na dnešek a připravenost na to máš.", "It fits today's plan and you're ready for it.");
  if (best.kind === "gym" && lowerTired) return L("Nohy po posilovně ještě nejsou čerstvé, dnes horní polovina.", "Your legs aren't fresh after the gym yet, so upper body today.");
  // The words follow the option: "quality" only when the pick is a hard session.
  if (status === "green") return lowerTired ? L("Tělo je odpočaté, jen nohy nech ještě odpočinout.", "You're rested, just let the legs recover a bit more.")
    : best.hard ? L("Tělo je odpočaté, dnes je prostor na kvalitu.", "You're rested, today there's room for quality.")
    : best.kind === "ride" || best.kind === "run" ? L("Tělo je odpočaté, dnes to stačí v klidném tempu.", "You're rested, an easy pace is enough today.")
    : L("Tělo je odpočaté, tohle dnes sedí nejlíp.", "You're rested, this fits today best.");
  return best.hard ? L("Připravenost je střední, kvalitu dnes dávkuj opatrně.", "Readiness is moderate, so dose the quality carefully today.")
    : L("Připravenost je střední, dnes spíš lehčí objem.", "Readiness is moderate, so a lighter volume today.");
}

// What the athlete did lately, and today.
export async function recentKinds(db, userId, today) {
  const from = new Date(Date.parse(today + "T00:00:00Z") - 60 * 86400000).toISOString().slice(0, 10);
  const rows = (await db.prepare("SELECT data_type, source_family, start_time, payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND (record_role IS NULL OR record_role!='duplicate')")
    .bind(userId, from).all().catch(() => ({ results: [] }))).results || [];
  const sports = new Set(), todayKinds = new Set(), done = [];
  for (const r of rows) {
    let p = {}; try { p = JSON.parse(r.payload_json || "{}"); } catch {}
    const kind = activityKindOf(p.type || p.exercise?.exerciseType || p.name);
    sports.add(kind);
    if (String(r.start_time || "").slice(0, 10) === today) {
      todayKinds.add(kind);
      const tss = Number(p.icu_training_load ?? p.training_load);
      done.push({ kind, minutes: sessionOf(r)?.minutes || null, tss: Number.isFinite(tss) && tss > 0 ? tss : null });
    }
  }
  const gym = await db.prepare("SELECT COUNT(*) AS n FROM strength_sets WHERE user_id=? AND workout_date>=?").bind(userId, from).first().catch(() => null);
  if (Number(gym?.n) > 0) sports.add("strength");
  return { sports: [...sports], today: [...todayKinds], done };
}

export async function pickState(db, userId, date) {
  await db.prepare(TABLE).run();
  const [chosen, declines] = await Promise.all([
    db.prepare("SELECT kind, top FROM coach_picks WHERE user_id=? AND date=?").bind(userId, date).first(),
    db.prepare("SELECT top, date FROM coach_picks WHERE user_id=? AND date>=? AND top IS NOT NULL AND top!=kind").bind(userId, new Date(Date.parse(date + "T00:00:00Z") - 14 * 86400000).toISOString().slice(0, 10)).all().then(r => r.results || [])
  ]);
  return { chosen: chosen?.kind || null, declines };
}

// The day's activity once taken: the athlete's choice, or a workout already
// in the day's plan that the athlete made (a gym plan they generated, a ride
// or run in the calendar). Aktivita dne then stays hidden like after "Dát na
// dnes" and never shows the athlete's own workout as the coach's proposal.
export function dayChoice({ chosen = null, planned = [] } = {}) {
  return chosen || planned[0] || null;
}

// What an option without a workout puts into Plán dne (recovery-plan.js):
// the day off is a walk and stretching. A ride or run is in the calendar and
// the gym in its plan already (the app saves those before the choice).
export const PICK_PLAN = { swim: ["swim"], sauna: ["sauna"], rest: ["walk", "stretch"] };

// The athlete's choice for the day; another than the coach's top is a decline of it.
// "skip" (Odmítnout) takes nothing: Aktivita dne leaves Dnes for the day and
// the coach's top counts as declined.
// The choice goes into the day's plan; a changed mind takes the earlier
// choice's rows out again (unless already done).
export async function savePick(db, userId, { date, kind, top }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !(KINDS.includes(kind) || kind === SKIP)) throw new Error(L("Neplatná volba.", "Invalid choice."));
  await db.prepare(TABLE).run();
  const before = (await db.prepare("SELECT kind FROM coach_picks WHERE user_id=? AND date=?").bind(userId, date).first())?.kind || null;
  if (before && before !== kind && PICK_PLAN[before]) {
    await ensureRecoveryTable(db);
    for (const k of PICK_PLAN[before]) await db.prepare("DELETE FROM recovery_sessions WHERE user_id=? AND date=? AND kind=? AND done_at IS NULL").bind(userId, date, k).run();
  }
  if (PICK_PLAN[kind]) {
    await ensureRecoveryTable(db);
    const there = new Set(((await db.prepare("SELECT kind FROM recovery_sessions WHERE user_id=? AND date=?").bind(userId, date).all()).results || []).map(r => r.kind));
    for (const k of PICK_PLAN[kind]) if (!there.has(k)) await addRecovery(db, { date, kind: k });
  }
  await db.prepare("INSERT INTO coach_picks (user_id, date, kind, top, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET kind=excluded.kind, top=COALESCE(coach_picks.top, excluded.top), created_at=excluded.created_at")
    .bind(userId, date, kind, KINDS.includes(top) ? top : null, new Date().toISOString()).run();
  return { status: "ok", chosen: kind };
}

// "Vrátit" after Odmítnout: the day's activity is back, the decline gone.
export async function undoSkip(db, userId, date) {
  await db.prepare(TABLE).run();
  await db.prepare("DELETE FROM coach_picks WHERE user_id=? AND date=? AND kind=?").bind(userId, date, SKIP).run();
  return { status: "ok", chosen: null };
}

// "Doporučovat méně": kinds the athlete rarely wants. They leave Další
// možnosti; the coach still gives one as the day's activity when it is the best.
export async function lessKinds(db, userId) {
  await db.prepare(LESS_TABLE).run();
  return ((await db.prepare("SELECT kind FROM coach_pick_less WHERE user_id=?").bind(userId).all()).results || []).map(r => r.kind);
}

// Today's recovery tip in the coach's card (recovery-today.js) takes the same
// list; stretching is only there.
const LESS_KINDS = [...KINDS, "stretch"];

export async function setLess(db, userId, kind, less = true) {
  if (!LESS_KINDS.includes(kind)) throw new Error(L("Neplatná volba.", "Invalid choice."));
  await db.prepare(LESS_TABLE).run();
  if (less) await db.prepare("INSERT INTO coach_pick_less (user_id, kind, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, kind) DO NOTHING").bind(userId, kind, new Date().toISOString()).run();
  else await db.prepare("DELETE FROM coach_pick_less WHERE user_id=? AND kind=?").bind(userId, kind).run();
  return { status: "ok", less: await lessKinds(db, userId) };
}

// The ready workouts of the day's options, kept while the options stay the
// same (the same kinds, titles and lengths): new data that changes nothing
// reuses them, so the AI is asked again only when the day really changes.
export function pickSignature(ranked) {
  return JSON.stringify([ranked.status, ranked.lowerTired ? 1 : 0, ...ranked.options.map(o => [o.kind, o.title, o.best ? 1 : 0])]);
}

export async function storedDetails(db, userId, date, signature) {
  await db.prepare(DETAILS_TABLE).run();
  const row = await db.prepare("SELECT signature, details_json FROM coach_pick_details WHERE user_id=? AND date=?").bind(userId, date).first();
  if (!row || row.signature !== signature) return null;
  try { return JSON.parse(row.details_json); } catch { return null; }
}

export async function storeDetails(db, userId, date, signature, details) {
  await db.prepare(DETAILS_TABLE).run();
  await db.prepare("INSERT INTO coach_pick_details (user_id, date, signature, details_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET signature=excluded.signature, details_json=excluded.details_json, updated_at=excluded.updated_at")
    .bind(userId, date, signature, JSON.stringify(details), new Date().toISOString()).run();
  await db.prepare("DELETE FROM coach_pick_details WHERE user_id=? AND date<?").bind(userId, new Date(Date.parse(date + "T00:00:00Z") - 7 * 86400000).toISOString().slice(0, 10)).run();
}

// The table rows of a ride or run: each section's length and target.
export function workoutLines(steps = [], sport = "ride") {
  if (sport === "swim") return swimLines(steps);
  const run = sport === "run";
  const minutes = s => Math.round((s.durationSeconds || 0) / 60);
  const target = s => run ? (s.paceFast ? s.paceFast + "/km" : null) : s.wattsLow != null ? Math.round((s.wattsLow + (s.wattsHigh ?? s.wattsLow)) / 2) + " W" : Math.round((s.percentLow + s.percentHigh) / 2) + " % FTP";
  const value = s => [minutes(s) + " min", target(s)].filter(Boolean).join(" · ");
  const name = (s, i, last) => s.note || (i === 0 ? (run ? L("Rozklus", "Warm-up") : L("Rozjetí", "Warm-up")) : i === last ? (run ? L("Výklus", "Cool-down") : L("Vyjetí", "Cool-down")) : L("Úsek", "Section"));
  const last = steps.length - 1;
  return steps.slice(0, 8).map((b, i) => {
    const list = b.steps || [];
    if ((b.repeats || 1) > 1 && list.length) {
      const work = [...list].sort((x, y) => (y.percentHigh || 0) - (x.percentHigh || 0))[0];
      return [b.repeats + " × " + (work.note || L("úsek", "effort")), value(work)];
    }
    return list[0] ? [name(list[0], i, last), value(list[0])] : null;
  }).filter(Boolean);
}

// A swim's rows: each set in metres with its pace per 100 m and rest.
function swimLines(steps = []) {
  const one = s => [s.meters ? s.meters + " m" : Math.round((s.durationSeconds || 0) / 60) + " min", s.paceFast ? s.paceFast + "/100 m" : null].filter(Boolean).join(" · ");
  return steps.slice(0, 8).map(b => {
    const list = (b.steps || []).filter(s => !s.rest), rest = (b.steps || []).find(s => s.rest);
    if (!list.length) return null;
    if ((b.repeats || 1) > 1 || list.length > 1) return [(b.repeats > 1 ? b.repeats + " × " : "") + (list[0].note || L("úsek", "set")), one(list[0]) + (rest ? L(" · pauza ", " · rest ") + Math.round(rest.durationSeconds) + " s" : "")];
    return [list[0].note || L("Plavání", "Swim"), one(list[0])];
  }).filter(Boolean);
}

// The table rows of a gym plan: each exercise with its work sets.
export function gymLines(rows = []) {
  const by = new Map();
  for (const r of rows) if (r?.[0] === "WORK" && r[1]) { const e = by.get(r[1]) || { sets: 0, reps: r[4], kg: r[3] }; e.sets += 1; by.set(r[1], e); }
  return [...by].slice(0, 10).map(([name, e]) => [name, [e.sets + " × " + (e.reps || ""), e.kg ? e.kg + " kg" : ""].filter(Boolean).join(" · ")]);
}
