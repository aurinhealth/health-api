// The coach's question after a training gap (redesign Coach chat, AI-7,
// concept 09 page 4, 2026-11-16): a server template, never the model's text,
// so it costs nothing, reads the same every time and stays inside MDR.
// - Only a gap in planned training: at least GAP_MISSED planned sessions since
//   the last done workout, and GAP_DAYS days without one.
// - Only once the watch has synced after the last missed session (a sleep or
//   a morning value dated later): a phone that did not sync would show a
//   false "I don't see a workout" (ai-coach-engineer AI-7).
// - Asked once per gap (state.gapAsked = the last done workout's day), never
//   while Sick or Injured is on.
// - The chips are always our statuses, in the same order, none preselected,
//   and the data never reorders them or asks about illness (privacy-compliance
//   2026-11-16, MDR art. 2(1), MDCG 2019-11). Data may add one neutral line.
// A tap on a chip is a free reply (coach-questions.js, coach-allowance.js).
import { L } from './lang.js';
import { shiftDate } from './dashboard-shared.js';
import { saveCoachQuestion } from './coach-questions.js';
import { ensureAssistantChats } from './assistant-chats.js';
import { updateAthleteState } from './athlete-state.js';
import { sportOf } from './adaptive-week.js';
import { isHardSession } from './session-intensity.js';

export const GAP_DAYS = 3;
export const GAP_MISSED = 2;
// The neutral data line from this many nights in a row below the usual HRV range.
const LOW_NIGHTS = 3;

export const gapChips = () => [L('V pohodě', 'All good'), L('Odpočinek', 'Rest'), L('Nemoc', 'Sick'), L('Zranění', 'Injured')];

const days = (from, to) => Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 864e5);
// A done ride, run, swim or gym (a walk or yoga alone hides no gap, as night-check.js
// trainedOut), and a planned session of the plan (planned:…, not a note or a holiday).
const doneWorkouts = list => (Array.isArray(list) ? list : []).filter(a => a && sportOf(a));
const plannedSessions = list => (Array.isArray(list) ? list : []).filter(p => p && String(p.id || '').startsWith('planned:') && !/nutrition|note/i.test(String(p.category || '')));
const WEEKDAYS = () => L(['neděle', 'pondělí', 'úterý', 'středy', 'čtvrtka', 'pátku', 'soboty'], ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "since Friday" within a week, "since 3 November" before that.
function since(day, today) {
  const d = new Date(day + 'T12:00:00Z');
  if (days(day, today) < 7) return WEEKDAYS()[d.getUTCDay()];
  return L(`${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`, `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`);
}

// Nights in a row up to today whose HRV is under the usual range's low end.
function lowNights(wellness = [], low, today) {
  if (!(Number(low) > 0)) return 0;
  const hrv = new Map((Array.isArray(wellness) ? wellness : []).filter(w => w && Number(w.hrv) > 0).map(w => [w.id || w.date, Number(w.hrv)]));
  let count = 0;
  // This morning may not have synced yet: then the streak counts from last night's morning.
  const start = hrv.has(today) ? today : shiftDate(today, -1);
  for (let day = start; hrv.has(day) && hrv.get(day) < low; day = shiftDate(day, -1)) count++;
  return count;
}

// The question for today, or null. `weekDays` are the coach inputs' days
// (week.days: daily.training.planned and completed), `sleep` and `wellness`
// the watch's nights and mornings, `hrvLow` the usual range's low end (readiness.js).
export function gapCheckin({ date, weekDays = [], sleep = [], wellness = [], hrvLow = null, state = {} }) {
  if ((state.status || 'active') !== 'active') return null;
  const past = weekDays.filter(d => d?.date && d.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const done = past.filter(d => doneWorkouts(d.daily?.training?.completed).length).map(d => d.date);
  const last = done.at(-1);
  // No workout in the whole span: a new account or a longer break, not this question.
  if (!last || last === date || days(last, date) < GAP_DAYS || state.gapAsked === last) return null;
  const missed = past.filter(d => d.date > last && d.date < date && plannedSessions(d.daily?.training?.planned).length).map(d => d.date);
  if (missed.length < GAP_MISSED) return null;
  const lastMissed = missed.at(-1);
  const synced = (Array.isArray(sleep) ? sleep : []).some(s => s?.date > lastMissed) || (Array.isArray(wellness) ? wellness : []).some(w => (w?.id || w?.date) > lastMissed && (Number(w.hrv) > 0 || Number(w.restingHR) > 0));
  if (!synced) return null;
  const nights = lowNights(wellness, hrvLow, date);
  return {
    key: last,
    text: L(`Od ${since(last, date)} nevidím žádný trénink.`, `I don't see a workout since ${since(last, date)}.`) + '\n\n' + L('Jak se máš?', 'How are things?'),
    chips: gapChips(),
    ...(nights >= LOW_NIGHTS ? { note: L(`Tvoje hodnoty regenerace jsou už ${nights} ${nights < 5 ? 'noci' : 'nocí'} pod tvým obvyklým rozmezím. Může to způsobit spánek, stres, horko, alkohol nebo tvrdý trénink.`,
      `Your recovery numbers have been below your usual range for ${nights} nights. Sleep, stress, heat, alcohol or hard training can do this.`) } : {})
  };
}

// The question as a new chat with one coach message and its chips. The gap is
// marked asked first: a failure after it loses the question, never repeats it.
export async function postGapCheckin(db, question) {
  if (!question) return null;
  await updateAthleteState(db, { gapAsked: question.key });
  await ensureAssistantChats(db);
  const title = L('Dotaz po pauze', 'Check-in after a break');
  const chat = await db.prepare('INSERT INTO assistant_chats(user_id,title) VALUES(?,?) RETURNING id').bind(db.userId, title).first();
  const content = question.text + (question.note ? '\n\n' + question.note : '');
  const message = await db.prepare("INSERT INTO assistant_messages(chat_id,user_id,role,content) VALUES(?,?,'assistant',?) RETURNING id").bind(chat.id, db.userId, content).first();
  await saveCoachQuestion(db, { chatId: chat.id, messageId: message.id, chips: question.chips });
  return { chatId: chat.id, messageId: message.id, text: question.text, chips: question.chips, ...(question.note ? { note: question.note } : {}) };
}

// ---- Welcome back: one question, one flow (Petr 2026-11-26) -----------------
// The gap question moves from a new chat to the Welcome back screen: the same
// trigger as gapCheckin (no "days without opening the app"), asked once per
// gap, the answers our statuses in a fixed order, none preselected, with one
// line on what each does and "Not now". The easier week (R2) only after 14
// days: 3 to 6 days change nothing, 7 to 13 keep the day coach's first day
// without intensity. Nothing goes to the AI.
const validEnd = (on, date) => typeof on === 'string' && on <= date && days(on, date) <= 3;
export const WELCOME_ANSWERS = ['elsewhere', 'break', 'sick', 'injured', 'later', 'keep'];
export function welcomeBack(args) {
  const q = gapCheckin(args);
  if (!q) return null;
  const gap = days(q.key, args.date);
  // Rest with an end date the athlete set ended: the reason is known, so no
  // question; Welcome back shows the easier week (from 14 days) with Extend.
  const ended = args.state?.ended;
  if (ended?.status === 'on_break' && validEnd(ended.on, args.date))
    return { key: q.key, days: gap, ended: true, title: L('Vítej zpátky.', 'Welcome back.'), text: L('Pauza dnes skončila.', 'Rest ended today.'), answers: [] };
  return {
    key: q.key, days: gap,
    title: L('Vítej zpátky.', 'Welcome back.'),
    text: L(`Od ${since(q.key, args.date)} nevidím žádný trénink. Jak se máš teď?`, `I don't see a workout since ${since(q.key, args.date)}. How are things now?`),
    answers: [
      { id: 'elsewhere', label: L('Trénoval jsem jinde', 'Trained elsewhere') },
      { id: 'break', label: L('Dal jsem si pauzu', 'Took a break') },
      { id: 'sick', label: L('Nemoc', 'Sick') },
      { id: 'injured', label: L('Zranění', 'Injured') }
    ],
    outcomes: gap >= 14
      ? L('Pauza: lehčí první týden. Jinde: plán zůstává. Nemoc nebo Zranění: stav, dokud ho neukončíš.', 'Took a break: an easier first week. Trained elsewhere: your plan stays. Sick or Injured: a status until you end it.')
      : L('Pauza nebo jinde: plán zůstává. Nemoc nebo Zranění: stav, dokud ho neukončíš.', 'Took a break or trained elsewhere: your plan stays. Sick or Injured: a status until you end it.'),
    later: L('Teď ne', 'Not now'),
    ...(q.note ? { note: q.note } : {})
  };
}

// The coach's one sentence after an answer, and what to save: the gap is asked
// first (gapAsked), "Trained elsewhere" and "Keep as is" mark it (elsewhere),
// Sick and Injured switch the status on as the Status card does.
export function welcomeAnswer(question, answer) {
  if (!question || !WELCOME_ANSWERS.includes(answer)) return null;
  const patch = { gapAsked: question.key };
  if (answer === 'elsewhere' || answer === 'keep') patch.elsewhere = question.key;
  if (answer === 'sick' || answer === 'injured') patch.status = answer;
  const long = question.days >= 28;
  const coach = answer === 'elsewhere' ? L('Rozumím. Plán jede dál, jak je.', 'Got it. Your plan goes on as it is.')
    : answer === 'keep' ? L('Dobře, plán zůstává, jak je.', 'Okay, your plan stays as it is.')
    : answer === 'break' ? (question.days >= 14
      ? L(`Nic nedoháníme. Nejdřív ${long ? '3 lehké tréninky' : '2 lehké tréninky'}, pak zase intenzita a dlouhé tréninky.`, `No catching up. ${long ? 'Three' : 'Two'} easy sessions first, then intensity and long sessions again.`)
      : question.days >= 7 ? L('Rozumím. Dnes lehce, pak plán jede dál.', 'Got it. Today stays easy, then your plan goes on.')
      : L('Rozumím. Plán jede dál.', 'Got it. Your plan goes on.'))
    : null;
  return { patch, coach, easierWeek: answer === 'break' && question.days >= 14 };
}

// The easier week on Welcome back after "Took a break" (R2): the plan's
// sessions from today to the end of the plan's week, each ride, run and swim
// until intensity is back (2 sessions after 14 to 27 days, 3 after 28 or more)
// easy and without a long one; the first one at most 90 min (run and swim 45),
// after 28 days 60 (30), the others 90 (45). The gym stays (R2 leaves it).
// The day coach applies the same rules each day; this only shows them.
const EASY = { ride: ['Lehká jízda', 'Easy ride'], run: ['Lehký běh', 'Easy run'], swim: ['Lehké plavání', 'Easy swim'] };
const LONG = /long|dlouh/i;
export function easierWeek({ date, weekDays = [], since }) {
  const seen = {}, gapOf = {};
  const rows = [];
  for (const d of [...weekDays].filter(d => d?.date >= date).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7)) {
    for (const p of plannedSessions(d.daily?.training?.planned)) {
      const sport = sportOf(p), minutes = Math.round((Number(p.durationHours) || 0) * 60) || Number(p.minutes) || null;
      if (!['ride', 'run', 'swim'].includes(sport)) { rows.push({ date: d.date, sport, name: p.name, minutes, was: null }); continue; }
      // The break as the day coach counts it: from the last session to this sport's first one back.
      const gapDays = gapOf[sport] ??= days(since, d.date), long = gapDays >= 28, need = long ? 3 : 2;
      if (gapDays < 14) { rows.push({ date: d.date, sport, name: p.name, minutes, was: null }); continue; }
      const index = seen[sport] = (seen[sport] || 0) + 1, short = sport !== 'ride';
      if (index > need) { rows.push({ date: d.date, sport, name: p.name, minutes, was: null }); continue; }
      const cap = index === 1 && long ? (short ? 30 : 60) : short ? 45 : 90;
      const easy = isHardSession(p, sport) || LONG.test(String(p.name || '')), capped = minutes && minutes > cap ? cap : minutes;
      if (!easy && capped === minutes) { rows.push({ date: d.date, sport, name: p.name, minutes, was: null }); continue; }
      rows.push({ date: d.date, sport, name: easy ? L(...EASY[sport]) : p.name, minutes: capped, was: { name: p.name, minutes } });
    }
  }
  const sum = list => list.reduce((t, r) => t + (Number(r.minutes) || 0), 0);
  return { rows, minutes: sum(rows), planMinutes: sum(rows.map(r => r.was || r)) };
}
