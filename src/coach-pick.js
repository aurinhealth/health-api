// Aktivita dne (Dnes): the coach picks the day's activity from anything
// the athlete does, not only the main sport: a ride or run of the kind the
// ride/run coach chose for the morning, the gym (upper body when the legs are
// tired), swimming, the sauna or a day off. Readiness, the plan for the day,
// what was done lately and the main sport rank them; an option the athlete
// turns down loses weight for two weeks (the coach learns from declines).
import { L, paceText, isImperial } from "./lang.js";
import { parsePace } from "./training-zones.js";
import { isHardKind } from "./session-intensity.js";
import { activityKindOf, sessionOf } from "./activity-match.js";
import { addRecovery, ensureRecoveryTable } from "./recovery-plan.js";
import { returnAfterBreak } from "./threshold-check.js";

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
// allowed: the sports the athlete does (Settings → Sports to suggest: ride,
// run, swim, strength), null when never chosen; the others are not offered.
// mains: the main sports as those kinds (several allowed), else mainSport's.
// noSauna: a reason the sauna is no option today (saunaSigns, or alcohol,
// Nemoc or an injury in the journal, journal-store.js saunaRisks).
export function rankOptions({ ride, run, swim = null, mainSport = "general", mains = null, allowed = null, sports = [], today = [], declines = [], less = [], planned = [], done = [], athleteStatus = "active", noSauna = false }) {
  if (athleteStatus && athleteStatus !== "active") return pausedOptions(athleteStatus, noSauna);
  // Nemoc ticked in Deník (cycling-coach-v2.js sickDay): rest, as with the status.
  if ([ride, run].some(c => c?.recommendation?.decisionRule === "journal_sick")) return pausedOptions("sick", noSauna, true);
  const status = ride?.readiness?.status || run?.readiness?.status || "yellow";
  const names = KIND_NAMES();
  const lowerTired = (ride?.load?.lowerBodyGymSignals48h || 0) > 0;
  const asOption = k => k === "strength" ? "gym" : k;
  const practised = new Set([...sports, ...(Array.isArray(allowed) ? allowed : [])]), trainedToday = today.some(k => k !== "walk");
  const main = Array.isArray(mains) && mains.length ? mains.map(asOption) : MAIN[mainSport] || [];
  // Without any known sport (a new account, general fitness) the gym and a
  // run count as done, never the ride (adaptive-week.js fallbackSports).
  if (!main.length && !["ride", "run", "swim", "strength"].some(k => practised.has(k))) { practised.add("run"); practised.add("strength"); }
  const session = coach => coach?.recommendation?.session || {};
  const endurance = (sport, coach) => {
    const s = session(coach), kind = s.kind || "endurance", minutes = Math.round(Number(s.durationMinutes) || (sport === "swim" ? 40 : sport === "run" ? 45 : 75));
    const title = (sport === "run" ? L("Běh", "Run") : sport === "swim" ? L("Plavání", "Swim") : L("Kolo", "Ride")) + ": " + (names[kind] || kind);
    return { kind: sport, title, detail: L(`${minutes} min`, `${minutes} min`) + (isHardKind(kind) ? "" : sport === "run" ? L(", zóna 2", ", zone 2") : sport === "swim" ? L(", plynule", ", steady") : L(", lehce", ", easy")), hard: isHardKind(kind), rest: kind === "rest" || kind === "recovery" };
  };
  const options = [
    endurance("ride", ride),
    endurance("run", run),
    { kind: "gym", title: lowerTired ? L("Posilovna na horní polovinu", "Upper-body gym") : L("Posilovna na celé tělo", "Full-body gym"), detail: lowerTired ? L("60 min, nohy nech odpočinout", "60 min, let the legs rest") : L("60 min", "60 min") },
    swim ? endurance("swim", swim) : { kind: "swim", title: L("Technika plavání", "Swim technique"), detail: L("45 min, 1 800 m", "45 min, 1800 m"), lines: [[L("Rozplavání", "Warm-up"), "200 m"], [L("Technika", "Drills"), L("8 × 50 m, pauza 20 s", "8 × 50 m, 20 s rest")], [L("Plynule", "Steady"), L("1 000 m lehce", "1,000 m easy")], [L("Vyplavání", "Cool-down"), "200 m"]] },
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
    // "Navrhovat méně často" (⋯ on Aktivita dne): another option first when it is close.
    if (less.includes(o.kind) && !planned.includes(o.kind)) score -= 15;
    o.score = score;
  }
  // The sauna is load, not rest: none with a warning sign (noSauna).
  if (noSauna) options.splice(options.findIndex(o => o.kind === "sauna"), 1);
  // A sport the athlete turned off is never offered, not even under Další možnosti.
  if (Array.isArray(allowed)) for (const kind of ["ride", "run", "swim", "gym"]) if (!allowed.map(asOption).includes(kind)) { const i = options.findIndex(o => o.kind === kind); if (i >= 0) options.splice(i, 1); }
  // A sport the athlete does (the main one or done in the last 60 days) wins a
  // tie, and one they never do is never the day's activity while there is one
  // they do: four declined runs must not turn into a ride for someone who
  // doesn't ride (Marie, 2026-11-02). It stays in Další možnosti.
  const SPORT = { ride: "ride", run: "run", swim: "swim", gym: "strength" };
  const known = o => !SPORT[o.kind] || main.includes(o.kind) || practised.has(SPORT[o.kind]);
  options.sort((a, b) => b.score - a.score || Number(known(b)) - Number(known(a)));
  const first = options.findIndex(known);
  if (first > 0) options.unshift(...options.splice(first, 1));
  // A bad morning starts with the day off and a walk; the sauna comes second at most.
  if (status === "red" && options[0].kind === "sauna") { const i = options.findIndex(o => o.kind === "rest"); if (i > 0) options.unshift(...options.splice(i, 1)); }
  const best = options[0];
  // After training the day off is stretching and an evening walk.
  const rest = options.find(o => o.kind === "rest");
  if (trainedToday && rest) { rest.title = L("Protažení", "Stretching"); rest.detail = L("15 min, večer procházka 30 min", "15 min, an evening walk of 30 min"); rest.lines = [[L("Protažení", "Stretching"), "15 min"], [L("Večer", "Evening"), L("procházka 30 min", "a 30 min walk")]]; }
  best.best = true;
  best.reason = reasonFor(best, { status, ride, lowerTired, planned, trainedToday, done });
  // Why the sauna is missing where it would be offered, without naming a cause.
  if (noSauna && best.kind === "rest" && (status === "red" || trainedToday)) best.reason += " " + L("Sauna je taky zátěž, dnes ne.", "Sauna adds load, so not today.");
  return { status, score: ride?.readiness?.score ?? null, lowerTired, options: options.map(({ score, hard, rest, ...o }) => ({ ...o, action: o.kind === "ride" || o.kind === "run" || o.kind === "swim" && swim ? "library" : o.kind === "gym" ? "gym" : "accept" })) };
}

// How late it is against tonight's bedtime (Today's tonight.bedtime, "HH:MM"),
// both the athlete's local time: "wind-down" in the last hour before it, "bed"
// once it has passed (until 4:00), else null. Without a bedtime 23:00 stands
// in; a bedtime between noon and 18:00 (a day sleeper) is left alone.
export const DEFAULT_BEDTIME = "23:00";
export function eveningPhase(now, bedtime = null) {
  const minutes = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  let at = minutes(now), bed = minutes(bedtime) ?? minutes(DEFAULT_BEDTIME);
  if (at == null || (bed >= 12 * 60 && bed < 18 * 60)) return null;
  // After midnight both count on from the evening before.
  if (bed < 12 * 60) bed += 1440;
  if (at < 4 * 60) at += 1440;
  return at >= bed ? "bed" : at >= bed - 60 ? "wind-down" : null;
}

// Late in the evening (eveningPhase) the day's activity is the wind-down (no
// walk, no training), past bedtime only bed; the other options stay under
// Další možnosti. A sick day keeps its rest as it is. The route keeps the
// day's ranking for pickSignature, so the day's ready workouts stay.
export function lateOptions(ranked, evening, { today = [], done = [] } = {}) {
  const i = ranked.options.findIndex(o => o.kind === "rest");
  if (!evening || i < 0 || ranked.paused === "sick") return ranked;
  const bed = evening === "bed", trained = today.some(k => k !== "walk");
  const rest = bed
    ? { kind: "rest", title: L("Spánek", "Sleep"), detail: L("Jdi teď spát", "Go to bed now"), lines: [[L("Do postele", "Bed"), L("teď", "now")]] }
    : { kind: "rest", title: L("Zklidnění", "Wind down"), detail: L("5–10 min lehkého protažení, pak spát", "5–10 min of easy stretching, then bed"), lines: [[L("Lehké protažení", "Easy stretching"), "5–10 min"], [L("Pak", "Then"), L("do postele", "bed")]] };
  const why = (trained ? doneSentence(done) + " " : "") + (bed ? L("Je pozdě, jdi teď spát.", "It's late, so go to bed now.")
    : L("Je pozdě večer: už jen zklidni, 5–10 minut lehkého protažení a pak do postele.", "It's late in the evening: just wind down with 5–10 minutes of easy stretching, then bed."));
  const others = ranked.options.filter((_, k) => k !== i).map(({ best, reason, ...o }) => o);
  return { ...ranked, evening, options: [{ ...ranked.options[i], ...rest, best: true, reason: why, action: "accept" }, ...others] };
}

// The night's signs that take the sauna off the list, any one of them: a
// raised temperature or breathing rate in sleep, or a resting heart rate two
// usual spreads above its normal (readiness components, recovery-model.js).
// The resting heart rate alone is a cautious choice without direct evidence
// (docs/methodology.md 2.9).
export function saunaSigns(readiness) {
  const c = readiness?.components || {};
  return !!(c.wristTemp?.raised || c.skinTemp?.elevated || c.respiration?.elevated || (c.restingHR?.z != null && c.restingHR.z >= 2));
}

// Nemoc, Zranění or Pauza set by the athlete: no training on offer, only rest
// (the sauna too during a break, never while ill or with noSauna).
function pausedOptions(athleteStatus, noSauna = false, journal = false) {
  const rest = athleteStatus === "sick"
    ? { kind: "rest", title: L("Odpočinek", "Rest"), detail: L("Spánek, pití a klid", "Sleep, drinks and quiet"), lines: [[L("Pití", "Drink"), L("2–3 l během dne", "2–3 l through the day")], [L("Spánek", "Sleep"), L("o hodinu déle", "an hour longer")]] }
    : { kind: "rest", title: L("Volno", "Day off"), detail: L("Procházka 30 min a protažení", "A 30 min walk and stretching"), lines: [[L("Procházka", "Walk"), "30 min"], [L("Protažení", "Stretching"), "15 min"]] };
  const reason = journal ? L("V Deníku máš Nemoc. Dnes odpočívej, trénink i sauna počkají, až budeš zdravý.", "You marked Sick in your Journal. Rest today; training and the sauna wait until you're well.") : { sick: L("Máš nastavenou Nemoc. Dnes odpočívej, trénink i sauna počkají, až budeš zdravý.", "Your status is Sick. Rest today; training and the sauna wait until you're well."),
    injured: L("Máš nastavené Zranění. Náhradní trénink navrhnu, až kouči popíšeš svá omezení.", "Your status is Injured. I'll suggest other training once you tell the coach your limitations."),
    on_break: L("Máš nastavenou Pauzu, dnes bez tréninku.", "Your status is Rest, no training today.") }[athleteStatus] || L("Dnes bez tréninku.", "No training today.");
  const options = [{ ...rest, best: true, reason }];
  if (athleteStatus === "on_break" && !noSauna) options.push({ kind: "sauna", title: L("Sauna", "Sauna"), detail: L("3 × 12 min", "3 × 12 min"), lines: [[L("3 kola", "3 rounds"), L("12 min v sauně", "12 min in the sauna")], [L("Mezi tím", "Between"), L("5 min venku nebo sprcha", "5 min outside or a shower")], [L("Pití", "Drink"), L("0,5 l vody", "0.5 l of water")]] });
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
  const why = (ride?.readiness?.reasons || []).filter(r => !/chybí HRV|no HRV|noc se ještě nenahrála|night hasn't synced/i.test(r))[0];
  if (status === "red") return [sentence(why) || L("Připravenost je dnes nízká.", "Readiness is low today."), L("Dnes radši odpočívej.", "Rest today instead.")].join(" ");
  // Before last night syncs (cycling-coach-v2.js awaitingNight) the coach
  // waits for it and says so, without a colour (audit 2026-11-06, 4.1).
  const coach = ride?.readiness || {};
  if (coach.awaitingNight) return L("Čekám na tvoji noc. Do té doby jen lehce, tvrdší trénink navrhnu, až ji uvidím.", "Waiting for your night. Keep it easy until then; I'll suggest something harder once I see it.");
  // Only words the readiness backs (audit 2026-11-06, 5.7): ready for the
  // plan only on a green day, the body rested only with a readiness number;
  // without one (a new athlete) the load and sleep decided.
  const scored = coach.score != null;
  if (planned.includes(best.kind)) return status === "green" ? (scored ? L("Sedí to s plánem na dnešek a připravenost na to máš.", "It fits today's plan and you're ready for it.") : L("Sedí to s plánem na dnešek.", "It fits today's plan."))
    : L("Sedí to s plánem, jen dnes klidněji.", "It fits today's plan, just take it easier today.");
  if (best.kind === "gym" && lowerTired) return L("Nohy po posilovně ještě nejsou čerstvé, dnes horní polovina.", "Your legs aren't fresh after the gym yet, so upper body today.");
  // The words follow the option: "quality" only when the pick is a hard session.
  if (status === "green" && scored) return lowerTired ? L("Tělo je odpočaté, jen nohy nech ještě odpočinout.", "You're rested, just let the legs recover a bit more.")
    : best.hard ? L("Tělo je odpočaté, dnes je prostor na kvalitu.", "You're rested, today there's room for quality.")
    : best.kind === "ride" || best.kind === "run" ? L("Tělo je odpočaté, dnes to stačí v klidném tempu.", "You're rested, an easy pace is enough today.")
    : L("Tělo je odpočaté, tohle dnes sedí nejlíp.", "You're rested, this fits today best.");
  if (status === "green") return lowerTired ? L("Podle zátěže a spánku můžeš trénovat, jen nohy nech ještě odpočinout.", "Going by your load and sleep you can train, just let the legs recover a bit more.")
    : best.hard ? L("Podle zátěže a spánku je dnes prostor na kvalitu.", "Going by your load and sleep, today there's room for quality.")
    : best.kind === "ride" || best.kind === "run" ? L("Podle zátěže a spánku to dnes stačí v klidném tempu.", "Going by your load and sleep, an easy pace is enough today.")
    : L("Podle zátěže a spánku tohle dnes sedí nejlíp.", "Going by your load and sleep, this fits today best.");
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

// The day each of ride, run and swim came back after 14 or more days without
// it (threshold-check.js returnAfterBreak), for the coach's first week back.
// One read of 35 days of activities, kept with the coach's inputs.
export async function sportReturns(db, userId, today) {
  const from = new Date(Date.parse(today + "T00:00:00Z") - 35 * 86400000).toISOString().slice(0, 10);
  const rows = (await db.prepare("SELECT start_time, payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND (record_role IS NULL OR record_role!='duplicate')")
    .bind(userId, from).all().catch(() => ({ results: [] }))).results || [];
  const dates = { ride: [], run: [], swim: [] };
  for (const r of rows) {
    let p = {}; try { p = JSON.parse(r.payload_json || "{}"); } catch { /* no type */ }
    const kind = activityKindOf(p.type || p.exercise?.exerciseType || p.name), day = String(p.start_date_local || r.start_time || "").slice(0, 10);
    if (dates[kind] && day) dates[kind].push(day);
  }
  return Object.fromEntries(Object.entries(dates).map(([kind, list]) => [kind, returnAfterBreak(list, today)]));
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
// Late in the evening (lateOptions) the day off is only the stretching, past bedtime nothing.
const LATE_REST = { "wind-down": ["stretch"], bed: [] };

// The athlete's choice for the day; another than the coach's top is a decline of it.
// evening (the late card the athlete saw, pickEvening): the rest puts no walk
// into the plan, and the late card's top is no recommendation to learn from.
// "skip" (Odmítnout) takes nothing: Aktivita dne leaves Dnes for the day and
// the coach's top counts as declined.
// The choice goes into the day's plan; a changed mind takes the earlier
// choice's rows out again (unless already done).
export async function savePick(db, userId, { date, kind, top, evening = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !(KINDS.includes(kind) || kind === SKIP)) throw new Error(L("Neplatná volba.", "Invalid choice."));
  await db.prepare(TABLE).run();
  const before = (await db.prepare("SELECT kind FROM coach_picks WHERE user_id=? AND date=?").bind(userId, date).first())?.kind || null;
  if (before && before !== kind && PICK_PLAN[before]) {
    await ensureRecoveryTable(db);
    for (const k of PICK_PLAN[before]) await db.prepare("DELETE FROM recovery_sessions WHERE user_id=? AND date=? AND kind=? AND done_at IS NULL").bind(userId, date, k).run();
  }
  const plan = kind === "rest" && LATE_REST[evening] ? LATE_REST[evening] : PICK_PLAN[kind];
  if (plan?.length) {
    await ensureRecoveryTable(db);
    const there = new Set(((await db.prepare("SELECT kind FROM recovery_sessions WHERE user_id=? AND date=?").bind(userId, date).all()).results || []).map(r => r.kind));
    for (const k of plan) if (!there.has(k)) await addRecovery(db, { date, kind: k });
  }
  if (LATE_REST[evening]) top = null;
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

// The ready workouts of the day's options, kept while the options that have
// one (ride, run, swim, gym) stay the same (kinds, titles, which is best): new
// data that changes nothing reuses them, so the AI is asked again only when
// the day really changes, not when only the sauna or the day off moves.
const DETAILED = new Set(["ride", "run", "swim", "gym"]);
export function pickSignature(ranked) {
  // Imperial units are added only for imperial users: the run lines carry "/mi", a metric user's signature stays as before.
  return JSON.stringify([ranked.status, ranked.lowerTired ? 1 : 0, ...ranked.options.filter(o => DETAILED.has(o.kind)).map(o => [o.kind, o.title, o.best ? 1 : 0]), ...(isImperial() ? ["imperial"] : [])]);
}

export async function storedDetails(db, userId, date, signature) {
  await db.prepare(DETAILS_TABLE).run();
  const row = await db.prepare("SELECT signature, details_json FROM coach_pick_details WHERE user_id=? AND date=?").bind(userId, date).first();
  if (!row || row.signature !== signature) return null;
  try { return JSON.parse(row.details_json); } catch { return null; }
}

// The late phase the day's card was last shown in (lateOptions), kept with the day's details.
export async function pickEvening(db, userId, date) {
  await db.prepare(DETAILS_TABLE).run();
  const row = await db.prepare("SELECT json_extract(details_json, '$.evening') AS evening FROM coach_pick_details WHERE user_id=? AND date=?").bind(userId, date).first().catch(() => null);
  return LATE_REST[row?.evening] ? row.evening : null;
}
export async function markEvening(db, userId, date, evening) {
  await db.prepare("UPDATE coach_pick_details SET details_json=json_set(details_json, '$.evening', ?) WHERE user_id=? AND date=?").bind(evening, userId, date).run();
}

export async function storeDetails(db, userId, date, signature, details) {
  await db.prepare(DETAILS_TABLE).run();
  await db.prepare("INSERT INTO coach_pick_details (user_id, date, signature, details_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET signature=excluded.signature, details_json=excluded.details_json, updated_at=excluded.updated_at")
    .bind(userId, date, signature, JSON.stringify(details), new Date().toISOString()).run();
  await db.prepare("DELETE FROM coach_pick_details WHERE user_id=? AND date<?").bind(userId, new Date(Date.parse(date + "T00:00:00Z") - 7 * 86400000).toISOString().slice(0, 10)).run();
}

// The best ride or run's AI workout is written after the answer (entrypoint.js
// coach/pick): the rules' workouts are stored first with aiPending, and only
// the request whose write lands asks the AI, so two at once ask it once. An
// entry still pending after AI_RETRY_MS (the background work ended early) may
// be claimed again.
export const AI_RETRY_MS = 120000;
// How long the AI may take after the answer: Cloudflare keeps the work going ~30 s.
export const AI_BUDGET_MS = 22000;
export async function claimDetails(db, userId, date, signature, details, now = new Date()) {
  await db.prepare(DETAILS_TABLE).run();
  const result = await db.prepare("INSERT INTO coach_pick_details (user_id, date, signature, details_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET signature=excluded.signature, details_json=excluded.details_json, updated_at=excluded.updated_at WHERE coach_pick_details.signature!=excluded.signature OR (coach_pick_details.updated_at<? AND json_extract(coach_pick_details.details_json, '$.aiPending') IS NOT NULL)")
    .bind(userId, date, signature, JSON.stringify(details), now.toISOString(), new Date(now.getTime() - AI_RETRY_MS).toISOString()).run();
  const claimed = Number(result?.meta?.changes) > 0;
  if (claimed) await db.prepare("DELETE FROM coach_pick_details WHERE user_id=? AND date<?").bind(userId, new Date(Date.parse(date + "T00:00:00Z") - 7 * 86400000).toISOString().slice(0, 10)).run();
  return claimed;
}
// The AI's workouts in place of the provisional ones, while the options are still the same.
export async function finishDetails(db, userId, date, signature, details) {
  await db.prepare("UPDATE coach_pick_details SET details_json=?, updated_at=? WHERE user_id=? AND date=? AND signature=?")
    .bind(JSON.stringify(details), new Date().toISOString(), userId, date, signature).run();
}

// The table rows of a ride or run: each section's length and target.
export function workoutLines(steps = [], sport = "ride") {
  if (sport === "swim") return swimLines(steps);
  const run = sport === "run";
  const minutes = s => Math.round((s.durationSeconds || 0) / 60);
  const target = s => run ? (s.paceFast ? paceText(parsePace(s.paceFast)) : null) : s.wattsLow != null ? Math.round((s.wattsLow + (s.wattsHigh ?? s.wattsLow)) / 2) + " W" : Math.round((s.percentLow + s.percentHigh) / 2) + " % FTP";
  const value = s => [minutes(s) + " min", target(s)].filter(Boolean).join(", ");
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
  const one = s => [s.meters ? s.meters + " m" : Math.round((s.durationSeconds || 0) / 60) + " min", s.paceFast ? s.paceFast + "/100 m" : null].filter(Boolean).join(", ");
  return steps.slice(0, 8).map(b => {
    const list = (b.steps || []).filter(s => !s.rest), rest = (b.steps || []).find(s => s.rest);
    if (!list.length) return null;
    if ((b.repeats || 1) > 1 || list.length > 1) return [(b.repeats > 1 ? b.repeats + " × " : "") + (list[0].note || L("úsek", "set")), one(list[0]) + (rest ? L(", pauza ", ", rest ") + Math.round(rest.durationSeconds) + " s" : "")];
    return [list[0].note || L("Plavání", "Swim"), one(list[0])];
  }).filter(Boolean);
}

// The table rows of a gym plan: each exercise with its work sets.
export function gymLines(rows = []) {
  const by = new Map();
  for (const r of rows) if (r?.[0] === "WORK" && r[1]) { const e = by.get(r[1]) || { sets: 0, reps: r[4], kg: r[3] }; e.sets += 1; by.set(r[1], e); }
  return [...by].slice(0, 10).map(([name, e]) => [name, [e.sets + " × " + (e.reps || ""), e.kg ? e.kg + " kg" : ""].filter(Boolean).join(", ")]);
}
