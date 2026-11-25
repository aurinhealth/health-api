// The Sunday summary of the coach chat (redesign concept 09 page 7, AI-8,
// 2026-11-16): the week's numbers, compared with the week before, by sport, the
// sessions missed and the week's sleep against the usual, all computed here
// from the rules' data, with a template headline. No AI: it costs nothing and
// arrives the same when the USD brake is used up ("arrive as usual", page 6).
// The next week's proposal is /app/api/coach/week-ai (AI through
// sanitizeWeekDays, the rules' proposal without AI). Activity names from other
// services are shown as data only and never go to a model from here.
import { L } from './lang.js';
import { shiftDate } from './dashboard-shared.js';
import { sportOf } from './adaptive-week.js';
import { compactActivity } from './coach-assistant.js';
import { isNap } from './sleep-sessions.js';
import { ensureAssistantChats } from './assistant-chats.js';
import { updateAthleteState } from './athlete-state.js';

export const SUMMARY_SPORTS = ['ride', 'run', 'swim', 'gym'];
// The week's sleep against the usual is worth a sentence from this difference.
const SLEEP_DIFF_MINUTES = 15;
const USUAL_SLEEP_DAYS = 28;

const done = d => (d?.daily?.training?.completed || []).filter(a => sportOf(a));
const planned = d => (d?.daily?.training?.planned || []).filter(p => String(p.id || '').startsWith('planned:') && sportOf(p) && !/nutrition|note/i.test(String(p.category || '')));
const minutesOf = a => Math.max(0, Math.round((Number(a.durationHours) || 0) * 60));
const hm = m => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`; };

function totals(days) {
  const sports = SUMMARY_SPORTS.map(sport => {
    const list = days.flatMap(done).filter(a => sportOf(a) === sport), plan = days.flatMap(planned).filter(p => sportOf(p) === sport);
    const km = sport === 'gym' ? null : list.reduce((n, a) => n + (compactActivity(a).distanceKm || 0), 0);
    return { sport, done: list.length, planned: plan.length, minutes: list.reduce((n, a) => n + minutesOf(a), 0), ...(km ? { km: Math.round(km * 10) / 10 } : {}) };
  });
  return { done: sports.reduce((n, s) => n + s.done, 0), planned: sports.reduce((n, s) => n + s.planned, 0), minutes: sports.reduce((n, s) => n + s.minutes, 0), sports };
}

// A planned session whose day has no done workout of its sport, before today.
function missedOf(days, today) {
  // Today's session can still be done: only the days before count as missed.
  return days.filter(d => d.date < today).flatMap(d => {
    const sports = new Set(done(d).map(sportOf));
    return planned(d).filter(p => !sports.has(sportOf(p))).map(p => ({ date: d.date, sport: sportOf(p), name: String(p.name || '').slice(0, 80) || null }));
  });
}

const avg = list => list.length ? Math.round(list.reduce((n, x) => n + x, 0) / list.length) : null;
function sleepOf(sleep, start, end) {
  const nights = (Array.isArray(sleep) ? sleep : []).filter(s => s && !isNap(s) && Number(s.durationMin) > 0);
  const week = avg(nights.filter(s => s.date >= start && s.date <= end).map(s => Number(s.durationMin)));
  const usual = avg(nights.filter(s => s.date >= shiftDate(start, -USUAL_SLEEP_DAYS) && s.date < start).map(s => Number(s.durationMin)));
  if (week == null) return null;
  const diff = usual == null ? 0 : week - usual;
  const text = L(`Spal jsi v průměru ${hm(week)}`, `Sleep averaged ${hm(week)}`) + (usual == null || Math.abs(diff) < SLEEP_DIFF_MINUTES ? '.'
    : diff < 0 ? L(`, asi o ${hm(-diff)} méně než obvykle.`, `, about ${hm(-diff)} under your usual.`) : L(`, asi o ${hm(diff)} víc než obvykle.`, `, about ${hm(diff)} over your usual.`));
  return { averageMinutes: week, usualMinutes: usual, text };
}

// The share of the plan done: planned sessions minus the missed ones (an extra
// unplanned run does not make up a missed tempo run).
function headline({ done: total, planned: of }, missed) {
  const n = of ? Math.max(0, of - missed) : total;
  if (!of) return n ? L(`Tento týden ${n} ${n === 1 ? 'trénink' : n < 5 ? 'tréninky' : 'tréninků'}.`, `${n} ${n === 1 ? 'workout' : 'workouts'} this week.`) : L('Tento týden bez tréninku.', 'No workouts this week.');
  if (n >= of) return L('Všechny plánované tréninky hotové.', 'Every planned workout done.');
  if (n * 3 >= of * 2) return L(`Dobrý týden, hotovo ${n} z ${of} plánovaných tréninků.`, `Good week: ${n} of ${of} planned workouts done.`);
  return L(`Lehčí týden, než byl plán: hotovo ${n} z ${of}.`, `A lighter week than planned: ${n} of ${of} done.`);
}

// start: the week's Monday; days: /app/api/week days of this and the week
// before; sleep: the nights; load: loadBalance() of the week's end (words only,
// never the ratio, Petr 2026-11-16).
export function weekSummary({ start, today, days = [], sleep = [], load = null }) {
  const end = shiftDate(start, 6), last = today < end ? today : end;
  const week = days.filter(d => d?.date >= start && d.date <= last), before = days.filter(d => d?.date >= shiftDate(start, -7) && d.date < start);
  const now = totals(week), was = before.length ? totals(before) : null, missed = missedOf(week, today);
  return {
    start, end, headline: headline(now, missed.length),
    workouts: { done: now.done, planned: now.planned, ...(was ? { was: { done: was.done, planned: was.planned } } : {}) },
    minutes: { total: now.minutes, ...(was ? { was: was.minutes } : {}) },
    sports: now.sports.filter(s => s.done || s.planned),
    missed,
    ...(load?.text ? { load: { state: load.state, level: load.level, text: load.text } } : {}),
    sleep: sleepOf(sleep, start, last),
    from: L('Z tvých tréninků a spánku tento týden', 'From your workouts and sleep this week')
  };
}

// The week a summary is about: this one on Sunday, the one before on other days.
export const summaryWeek = (today, monday) => (new Date(today + 'T12:00:00Z').getUTCDay() === 0 ? monday : shiftDate(monday, -7));

// The Sunday message in the coach chat (concept 09 page 7): from Sunday 18:00
// to the end of Monday, once a week (state.posted.week). Its text is the
// headline and the week's lines in words; the card's numbers come from
// /app/api/coach/week-summary. Activity names stay out of the text: the text
// goes to the model when the athlete answers, and names from other services
// are untrusted (AI-8).
export const SUMMARY_FROM_HOUR = 18;
export const summaryDue = (today, hour) => { const day = new Date(today + 'T12:00:00Z').getUTCDay(); return (day === 0 && hour >= SUMMARY_FROM_HOUR) || day === 1; };
const SPORT_WORDS = () => L({ ride: 'kolo', run: 'běh', swim: 'plavání', gym: 'posilovna' }, { ride: 'ride', run: 'run', swim: 'swim', gym: 'gym session' });
const ON_DAY = () => L(['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'], ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
export function summaryText(s) {
  const words = SPORT_WORDS(), days = ON_DAY();
  const missed = s.missed.slice(0, 3).map(m => L(`${words[m.sport]} ${days[new Date(m.date + 'T12:00:00Z').getUTCDay()]}`, `the ${words[m.sport]} on ${days[new Date(m.date + 'T12:00:00Z').getUTCDay()]}`));
  const lines = [missed.length ? L(`Vynechané: ${missed.join(', ')}.`, `Missed: ${missed.join(', ')}.`) : null, s.sleep?.text || null, s.load?.text || null].filter(Boolean);
  return [s.headline, lines.join(' ')].filter(Boolean).join('\n\n');
}
export async function postWeekSummary(db, summary, state) {
  if (!summary || state?.posted?.week?.key === summary.start) return null;
  await ensureAssistantChats(db);
  const chat = await db.prepare('INSERT INTO assistant_chats(user_id,title) VALUES(?,?) RETURNING id').bind(db.userId, L('Shrnutí týdne', 'Your week')).first();
  const text = summaryText(summary);
  const message = await db.prepare("INSERT INTO assistant_messages(chat_id,user_id,role,content) VALUES(?,?,'assistant',?) RETURNING id").bind(chat.id, db.userId, text).first();
  await updateAthleteState(db, { posted: { kind: 'week', key: summary.start, chatId: chat.id, messageId: message.id } });
  return { chatId: chat.id, messageId: message.id, text, start: summary.start };
}
