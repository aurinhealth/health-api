// Aktivita dne (Dnes): the coach picks the day's activity from anything
// the athlete does, not only the main sport: a ride or run of the kind the
// ride/run coach chose for the morning, the gym (upper body when the legs are
// tired), swimming, the sauna or a day off. Readiness, the plan for the day,
// what was done lately and the main sport rank them; an option the athlete
// turns down loses weight for two weeks (the coach learns from declines).
import { L } from "./lang.js";
import { activityKindOf, sessionOf } from "./activity-match.js";

const TABLE = "CREATE TABLE IF NOT EXISTS coach_picks (user_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, top TEXT, created_at TEXT NOT NULL, PRIMARY KEY (user_id, date))";
const KINDS = ["ride", "run", "gym", "swim", "sauna", "rest"];
const LESS_TABLE = "CREATE TABLE IF NOT EXISTS coach_pick_less (user_id INTEGER NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, kind))";
const DETAILS_TABLE = "CREATE TABLE IF NOT EXISTS coach_pick_details (user_id INTEGER NOT NULL, date TEXT NOT NULL, signature TEXT NOT NULL, details_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, date))";

const KIND_NAMES = () => ({
  recovery: L("regenerace", "recovery"), endurance: L("vytrvalost", "endurance"), long_endurance: L("dlouhá vytrvalost", "long endurance"),
  tempo: L("tempo", "tempo"), sweet_spot: L("sweet spot", "sweet spot"), threshold: L("práh", "threshold"), vo2: L("VO2max", "VO2max"),
  vo2max: L("VO2max", "VO2max"), anaerobic: L("anaerobní", "anaerobic"), sprint: L("sprinty", "sprints"), rest: L("volno", "rest")
});
const HARD = new Set(["tempo", "sweet_spot", "threshold", "vo2", "vo2max", "anaerobic", "sprint"]);
const MAIN = { cycling: "ride", running: "run", strength: "gym", triathlon: "ride" };

const sentence = text => { const t = String(text || "").trim(); return t ? t[0].toUpperCase() + t.slice(1).replace(/\.?$/, ".") : ""; };

// sports: kinds done in the last 60 days (activityKindOf of each), today: kinds
// done today, declines: [{top, date}] of the last two weeks, planned: the
// kinds planned for today.
// done: today's sessions [{kind, minutes, tss}] for the words after training.
export function rankOptions({ ride, run, mainSport = "general", sports = [], today = [], declines = [], planned = [], done = [] }) {
  const status = ride?.readiness?.status || run?.readiness?.status || "yellow";
  const names = KIND_NAMES();
  const lowerTired = (ride?.load?.lowerBodyGymSignals48h || 0) > 0;
  const practised = new Set(sports), main = MAIN[mainSport] || null, trainedToday = today.some(k => k !== "walk");
  const session = coach => coach?.recommendation?.session || {};
  const endurance = (sport, coach) => {
    const s = session(coach), kind = s.kind || "endurance", minutes = Math.round(Number(s.durationMinutes) || (sport === "run" ? 45 : 75));
    const title = (sport === "run" ? L("Běh", "Run") : L("Kolo", "Ride")) + " · " + (names[kind] || kind);
    return { kind: sport, title, detail: L(`${minutes} min`, `${minutes} min`) + (HARD.has(kind) ? "" : sport === "run" ? L(" · zóna 2", " · zone 2") : L(" · lehce", " · easy")), hard: HARD.has(kind), rest: kind === "rest" || kind === "recovery" };
  };
  const options = [
    endurance("ride", ride),
    endurance("run", run),
    { kind: "gym", title: lowerTired ? L("Posilovna · horní polovina", "Gym · upper body") : L("Posilovna · celé tělo", "Gym · full body"), detail: lowerTired ? L("60 min · nohy nech odpočinout", "60 min · let the legs rest") : L("60 min", "60 min") },
    { kind: "swim", title: L("Plavání · technika", "Swim · technique"), detail: L("45 min · 1 800 m", "45 min · 1,800 m"), lines: [[L("Rozplavání", "Warm-up"), "200 m"], [L("Technika", "Drills"), L("8 × 50 m · pauza 20 s", "8 × 50 m · 20 s rest")], [L("Plynule", "Steady"), L("1 000 m lehce", "1,000 m easy")], [L("Vyplavání", "Cool-down"), "200 m"]] },
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
      if (o.kind === main) score += 15;
      if (!practised.has(o.kind === "gym" ? "strength" : o.kind)) score -= o.kind === main ? 0 : 25;
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
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  // A day off on a bad morning comes with the sauna when it helps.
  if (best.kind === "rest" && status === "red" && !trainedToday) { best.title = L("Volno a sauna", "Day off and sauna"); best.detail = L("Procházka · sauna 3 × 12 min", "A walk · sauna 3 × 12 min"); best.lines = [[L("Procházka", "Walk"), "30 min"], [L("Sauna", "Sauna"), L("3 × 12 min", "3 × 12 min")]]; }
  // After training the day off is stretching and an evening walk.
  const rest = options.find(o => o.kind === "rest");
  if (trainedToday && rest) { rest.title = L("Protažení", "Stretching"); rest.detail = L("15 min · večer procházka 30 min", "15 min · an evening walk of 30 min"); rest.lines = [[L("Protažení", "Stretching"), "15 min"], [L("Večer", "Evening"), L("procházka 30 min", "a 30 min walk")]]; }
  best.best = true;
  best.reason = reasonFor(best, { status, ride, lowerTired, planned, trainedToday, done });
  return { status, score: ride?.readiness?.score ?? null, lowerTired, options: options.map(({ score, hard, rest, ...o }) => ({ ...o, action: o.kind === "ride" || o.kind === "run" ? "library" : o.kind === "gym" ? "gym" : "accept" })) };
}

// "Odjel jsi kolo, 1 h 07, 74 TSS." from today's longest session.
export function doneSentence(done = []) {
  const s = [...done].filter(d => d.kind !== "walk").sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0];
  if (!s) return L("Dnes už máš odtrénováno.", "You've already trained today.");
  const verb = { ride: L("Odjel jsi kolo", "You rode"), run: L("Odběhl jsi běh", "You ran"), strength: L("Odcvičil jsi posilovnu", "You did the gym"), swim: L("Odplaval jsi plavání", "You swam") }[s.kind] || L("Máš za sebou trénink", "You've trained");
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
  if (status === "green") return lowerTired ? L("Odpočatý jsi, jen nohy nech ještě odpočinout.", "You're rested, just let the legs recover a bit more.")
    : best.hard ? L("Jsi odpočatý, dnes je prostor na kvalitu.", "You're rested, today there's room for quality.")
    : best.kind === "ride" || best.kind === "run" ? L("Jsi odpočatý, dnes to stačí v klidném tempu.", "You're rested, an easy pace is enough today.")
    : L("Jsi odpočatý, tohle dnes sedí nejlíp.", "You're rested, this fits today best.");
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

// The athlete's choice for the day; another than the coach's top is a decline of it.
export async function savePick(db, userId, { date, kind, top }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !KINDS.includes(kind)) throw new Error(L("Neplatná volba.", "Invalid choice."));
  await db.prepare(TABLE).run();
  await db.prepare("INSERT INTO coach_picks (user_id, date, kind, top, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET kind=excluded.kind, top=COALESCE(coach_picks.top, excluded.top), created_at=excluded.created_at")
    .bind(userId, date, kind, KINDS.includes(top) ? top : null, new Date().toISOString()).run();
  return { status: "ok", chosen: kind };
}

// "Doporučovat méně": kinds the athlete rarely wants. They leave Další
// možnosti; the coach still gives one as the day's activity when it is the best.
export async function lessKinds(db, userId) {
  await db.prepare(LESS_TABLE).run();
  return ((await db.prepare("SELECT kind FROM coach_pick_less WHERE user_id=?").bind(userId).all()).results || []).map(r => r.kind);
}

export async function setLess(db, userId, kind, less = true) {
  if (!KINDS.includes(kind)) throw new Error(L("Neplatná volba.", "Invalid choice."));
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

// The table rows of a gym plan: each exercise with its work sets.
export function gymLines(rows = []) {
  const by = new Map();
  for (const r of rows) if (r?.[0] === "WORK" && r[1]) { const e = by.get(r[1]) || { sets: 0, reps: r[4], kg: r[3] }; e.sets += 1; by.set(r[1], e); }
  return [...by].slice(0, 10).map(([name, e]) => [name, [e.sets + " × " + (e.reps || ""), e.kg ? e.kg + " kg" : ""].filter(Boolean).join(" · ")]);
}
