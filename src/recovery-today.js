// "Regenerace na dnes" on the app's Today screen: after a training day, one
// sentence why (what today's or yesterday's session loaded and what tomorrow
// brings) and two or three things to do: the stretching routine for that
// session (recovery-plan.js), a sauna and tonight's bedtime. Pure: buildToday
// (app-today.js) passes the day's sessions, tomorrow's plan and tonight's sleep.
import { L } from "./lang.js";
import { recoveryRoutine, describeRecovery, routineAreas } from "./recovery-plan.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const sportOf = s => (s?.sport === "strength" ? "gym" : ["ride", "run"].includes(s?.sport) ? s.sport : null);
const HARD = /interval|vo2|threshold|práh|sweet|tempo|sprint|závod|race|test/i;
const LOWER = /nohy|dřep|leg|squat|lower|spodn|výpad|lunge|deadlift|mrtv/i;

// A session that asks for recovery: any strength session, or 30 minutes or
// 30 TSS of something else; the day before counts from 60 TSS (or strength,
// whose soreness comes the next day).
function loaded(s, yesterday = false) {
  if (!s || s.status !== "done") return false;
  if (sportOf(s) === "gym") return true;
  const tss = num(s.tss) || 0, minutes = num(s.minutes) || 0;
  return yesterday ? tss >= 60 || minutes >= 90 : tss >= 30 || minutes >= 30;
}

function loadText(s, when, lower) {
  const today = when === "today", sport = sportOf(s), tss = num(s.tss);
  const load = tss ? " (" + Math.round(tss) + " TSS)" : "";
  if (sport === "gym") return lower
    ? L(today ? "Posilovna dala zabrat nohám" : "Včerejší posilovna dala zabrat nohám", today ? "The gym session worked your legs" : "Yesterday's gym session worked your legs")
    : L(today ? "Posilovna dala zabrat horní části těla" : "Včerejší posilovna dala zabrat horní části těla", today ? "The gym session worked your upper body" : "Yesterday's gym session worked your upper body");
  if (sport === "ride") return L((today ? "Dnešní jízda" : "Včerejší jízda") + load + " zatížila nohy a kyčle", (today ? "Today's ride" : "Yesterday's ride") + load + " loaded your legs and hips");
  if (sport === "run") return L((today ? "Dnešní běh" : "Včerejší běh") + load + " zatížil lýtka a stehna", (today ? "Today's run" : "Yesterday's run") + load + " loaded your calves and thighs");
  return L((today ? "Dnešní trénink" : "Včerejší trénink") + load + " tě zatížil", (today ? "Today's workout" : "Yesterday's workout") + load + " loaded you");
}

function tomorrowText(sessions) {
  if (sessions == null) return ".";
  const next = sessions.find(s => s && s.status !== "done");
  if (!next) return L(" a zítra máš volno.", " and tomorrow is a rest day.");
  const sport = sportOf(next), hard = HARD.test(String(next.title || ""));
  if (sport === "ride") return hard ? L(" a zítra jedeš intervaly.", " and tomorrow you ride intervals.") : L(" a zítra jedeš na kolo.", " and tomorrow you ride.");
  if (sport === "run") return hard ? L(" a zítra běžíš intervaly.", " and tomorrow you run intervals.") : L(" a zítra běžíš.", " and tomorrow you run.");
  if (sport === "gym") return L(" a zítra jdeš do posilovny.", " and tomorrow you're at the gym.");
  return L(" a zítra tě čeká další trénink.", " and another workout is planned for tomorrow.");
}

const stretchTitle = sport => sport === "gym" ? L("Protažení po posilovně", "Stretch after the gym")
  : sport === "ride" ? L("Protažení po jízdě", "Stretch after the ride")
  : sport === "run" ? L("Protažení po běhu", "Stretch after the run")
  : L("Protažení", "Stretching");

const sleepText = minutes => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h + " h" + (m ? " " + String(m).padStart(2, "0") : "");
};

// today/yesterday/tomorrow: the days' sessions as daySessions (app-training.js)
// lists them (tomorrow null when not known); gym: {date: gym plan} for the
// exercises of a strength session; tonight: {bedtime, need} or null; saved:
// the day's recovery sessions (listRecovery), to mark what is done already.
export function recoveryToday({ today = [], yesterday = [], tomorrow = null, gym = {}, date = null, tonight = null, saved = [] } = {}) {
  const doneToday = (today || []).filter(s => loaded(s));
  const doneYesterday = (yesterday || []).filter(s => loaded(s, true));
  const when = doneToday.length ? "today" : doneYesterday.length ? "yesterday" : null;
  if (!when) return null;
  const list = when === "today" ? doneToday : doneYesterday;
  // The session that loaded most: strength first (it names the muscles), else the most TSS.
  const main = list.find(s => sportOf(s) === "gym") || [...list].sort((a, b) => (num(b.tss) || 0) - (num(a.tss) || 0))[0];
  const sport = sportOf(main);
  const gymDay = sport === "gym" ? gym?.[main.date || (when === "today" ? date : null)] || null : null;
  const focus = [main.title, ...(gymDay?.exercises || [])].filter(Boolean).join(", ").slice(0, 200);
  const lower = sport === "gym" && LOWER.test(focus);

  const routine = recoveryRoutine({ sport, focus });
  const described = describeRecovery({ kind: "stretch", items: routine.items });
  const done = kind => (saved || []).some(r => r?.kind === kind && r.done);
  const items = [{
    kind: "stretch",
    title: stretchTitle(sport),
    detail: [described.minutes + " min", routineAreas(routine.items).join(", ")].filter(Boolean).join(" · "),
    done: done("stretch"),
    sport,
    focus,
    routine: { title: stretchTitle(sport), minutes: described.minutes, items: described.items }
  }];
  // A sauna on the evening of the training day, not the morning after.
  if (when === "today") items.push({ kind: "sauna", title: "Sauna", detail: L("3× 10 min večer, pak hodně pít", "3× 10 min in the evening, then drink plenty"), done: done("sauna") });
  if (tonight?.bedtime && num(tonight.need) > 0) items.push({ kind: "bedtime", title: L("Do postele v ", "Bed at ") + tonight.bedtime, detail: L("dnes potřebuješ " + sleepText(num(tonight.need)) + " spánku", "you need " + sleepText(num(tonight.need)) + " of sleep tonight"), time: tonight.bedtime, done: false });

  return { title: L("Regenerace na dnes", "Recovery for today"), text: loadText(main, when, lower) + tomorrowText(tomorrow), basedOn: when, items };
}
