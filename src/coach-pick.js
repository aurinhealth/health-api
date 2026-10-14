// Doporučení trenéra (Dnes): the coach picks the day's activity from anything
// the athlete does, not only the main sport: a ride or run of the kind the
// ride/run coach chose for the morning, the gym (upper body when the legs are
// tired), swimming, the sauna or a day off. Readiness, the plan for the day,
// what was done lately and the main sport rank them; an option the athlete
// turns down loses weight for two weeks (the coach learns from declines).
import { L } from "./lang.js";
import { activityKindOf } from "./activity-match.js";

const TABLE = "CREATE TABLE IF NOT EXISTS coach_picks (user_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, top TEXT, created_at TEXT NOT NULL, PRIMARY KEY (user_id, date))";
const KINDS = ["ride", "run", "gym", "swim", "sauna", "rest"];

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
export function rankOptions({ ride, run, mainSport = "general", sports = [], today = [], declines = [], planned = [] }) {
  const status = ride?.readiness?.status || run?.readiness?.status || "yellow";
  const names = KIND_NAMES();
  const lowerTired = (ride?.load?.lowerBodyGymSignals48h || 0) > 0;
  const done = new Set(sports), main = MAIN[mainSport] || null, trainedToday = today.some(k => k !== "walk");
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
    { kind: "swim", title: L("Plavání · technika", "Swim · technique"), detail: L("45 min · lehce", "45 min · easy") },
    { kind: "sauna", title: L("Sauna", "Sauna"), detail: L("3 × 12 min · po tréninku nebo místo něj", "3 × 12 min · after training or instead of it") },
    { kind: "rest", title: L("Volno", "Day off"), detail: L("Procházka a protažení", "A walk and stretching") }
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
      if (!done.has(o.kind === "gym" ? "strength" : o.kind)) score -= o.kind === main ? 0 : 25;
      if (planned.includes(o.kind) && status !== "red") score += 30;
      if (o.hard && status === "green") score += 5;
      if (o.rest) score -= 20;
      if (trainedToday) score -= 60;
    }
    if (trainedToday && (o.kind === "sauna" || o.kind === "rest")) score += 30;
    if (o.kind === "gym" && lowerTired) score -= 5;
    score -= Math.min(30, 10 * declines.filter(d => d.top === o.kind).length);
    o.score = score;
  }
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  // A day off on a bad morning comes with the sauna when it helps.
  if (best.kind === "rest" && status === "red") { best.title = L("Volno a sauna", "Day off and sauna"); best.detail = L("Procházka · sauna 3 × 12 min", "A walk · sauna 3 × 12 min"); }
  best.best = true;
  best.reason = reasonFor(best, { status, ride, lowerTired, planned, trainedToday });
  return { status, score: ride?.readiness?.score ?? null, options: options.map(({ score, hard, rest, ...o }) => ({ ...o, action: o.kind === "ride" || o.kind === "run" ? "library" : o.kind === "gym" ? "gym" : "accept" })) };
}

function reasonFor(best, { status, ride, lowerTired, planned, trainedToday }) {
  if (trainedToday) return L("Dnes už máš odtrénováno, teď je na řadě regenerace.", "You've already trained today, now it's time to recover.");
  const why = (ride?.readiness?.reasons || []).filter(r => !/chybí HRV|no HRV/i.test(r))[0];
  if (status === "red") return [sentence(why) || L("Připravenost je dnes nízká.", "Readiness is low today."), L("Dnes radši odpočívej.", "Rest today instead.")].join(" ");
  if (planned.includes(best.kind)) return L("Sedí to s plánem na dnešek a připravenost na to máš.", "It fits today's plan and you're ready for it.");
  if (best.kind === "gym" && lowerTired) return L("Nohy po posilovně ještě nejsou čerstvé, dnes horní polovina.", "Your legs aren't fresh after the gym yet, so upper body today.");
  if (status === "green") return lowerTired ? L("Odpočatý jsi, jen nohy nech ještě odpočinout.", "You're rested, just let the legs recover a bit more.") : L("Jsi odpočatý, dnes je prostor na kvalitu.", "You're rested, today there's room for quality.");
  return L("Připravenost je střední, dnes spíš lehčí objem.", "Readiness is moderate, so a lighter volume today.");
}

// What the athlete did lately, and today.
export async function recentKinds(db, userId, today) {
  const from = new Date(Date.parse(today + "T00:00:00Z") - 60 * 86400000).toISOString().slice(0, 10);
  const rows = (await db.prepare("SELECT data_type, source_family, start_time, payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND (record_role IS NULL OR record_role!='duplicate')")
    .bind(userId, from).all().catch(() => ({ results: [] }))).results || [];
  const sports = new Set(), todayKinds = new Set();
  for (const r of rows) {
    let p = {}; try { p = JSON.parse(r.payload_json || "{}"); } catch {}
    const kind = activityKindOf(p.type || p.exercise?.exerciseType || p.name);
    sports.add(kind);
    if (String(r.start_time || "").slice(0, 10) === today) todayKinds.add(kind);
  }
  const gym = await db.prepare("SELECT COUNT(*) AS n FROM strength_sets WHERE user_id=? AND workout_date>=?").bind(userId, from).first().catch(() => null);
  if (Number(gym?.n) > 0) sports.add("strength");
  return { sports: [...sports], today: [...todayKinds] };
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
