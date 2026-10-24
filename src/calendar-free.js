import { L } from './lang.js';
import { validDay, weekStartOf } from './training-availability.js';
// Free time from the iPhone calendar (ios-native App/CalendarTime.swift). The
// app reads the athlete's calendar on the phone and sends only the minutes
// free for training on each day, never the events themselves. The week plan
// of a week (getWeekPlan with a date) caps each day's time with them, so the
// week's AI plan, Aktivita dne and the generator keep to the calendar.

// The app sends today and the next 13 days; older days are dropped.
export const CALENDAR_DAYS = 14;
const KEEP_PAST_DAYS = 7;
// Less than the shortest workout counts as no time.
const SHORTEST = 20;
// A free calendar day does not make a day without set time a long one.
const LONGEST = 240;

const shift = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const missingTable = error => /no such table/i.test(String(error?.message || error));

export async function ensureCalendarFree(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS calendar_free (user_id INTEGER NOT NULL, date TEXT NOT NULL, minutes INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,date))').run();
}

// [{date, minutes}] from the app, kept to today … today + CALENDAR_DAYS.
export function sanitizeCalendarDays(days, today) {
  if (!Array.isArray(days)) throw new Error(L('Chybí dny z kalendáře.', 'The calendar days are missing.'));
  const last = shift(today, CALENDAR_DAYS), out = new Map();
  for (const day of days) {
    const date = String(day?.date || ''), minutes = Number(day?.minutes);
    if (!validDay(date) || date < shift(today, -1) || date > last) continue;
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) throw new Error(L('Volný čas musí být mezi 0 a 24 hodinami.', 'Free time must be between 0 and 24 hours.'));
    out.set(date, Math.round(minutes));
  }
  return [...out].map(([date, minutes]) => ({ date, minutes })).sort((a, b) => a.date.localeCompare(b.date));
}

// Replaces the days the app sent; the days before them stay a week for the
// plan already built from them, then go.
export async function saveCalendarFree(db, days, today) {
  const clean = sanitizeCalendarDays(days, today);
  await ensureCalendarFree(db);
  const from = clean[0]?.date || today;
  await db.batch([
    db.prepare('DELETE FROM calendar_free WHERE user_id=? AND (date>=? OR date<?)').bind(db.userId, from, shift(today, -KEEP_PAST_DAYS)),
    ...clean.map(d => db.prepare('INSERT INTO calendar_free(user_id,date,minutes) VALUES(?,?,?)').bind(db.userId, d.date, d.minutes))
  ]);
  return clean;
}

// "Číst kalendář" turned off: the calendar no longer limits any day.
export async function clearCalendarFree(db) {
  try { await db.prepare('DELETE FROM calendar_free WHERE user_id=?').bind(db.userId).run(); }
  catch (error) { if (!missingTable(error)) throw error; }
}

// { "2026-10-14": 45, … } for the dates from … to.
export async function calendarFree(db, from, to) {
  try {
    const rows = (await db.prepare('SELECT date, minutes FROM calendar_free WHERE user_id=? AND date>=? AND date<=?').bind(db.userId, from, to).all()).results || [];
    return Object.fromEntries(rows.map(r => [r.date, Number(r.minutes)]));
  } catch (error) {
    if (missingTable(error)) return {};
    throw error;
  }
}

// The day's time with the calendar: the smaller of the athlete's own time and
// the calendar's free time. A day without own time takes the calendar's only
// when it is short.
export function calendarMinutes(own, free) {
  if (free == null) return own;
  const usable = free < SHORTEST ? 0 : free;
  if (own == null) return usable < LONGEST ? usable : null;
  return Math.min(own, usable);
}

// The week's plan with each day capped by the calendar. `ownMinutes` keeps the
// athlete's time, which is what the plan saves back (normalizeAvailability),
// and `calendarMinutes` the calendar's free time.
export function withCalendarFree(prefs, monday, free = {}) {
  if (!prefs?.availability || !Object.keys(free).length) return prefs;
  const availability = prefs.availability.map((day, i) => {
    const minutes = free[shift(monday, i)];
    if (minutes == null) return day;
    return { ...day, minutes: calendarMinutes(day.minutes, minutes), ownMinutes: day.minutes, calendarMinutes: minutes };
  });
  return { ...prefs, availability, calendar: true };
}

export async function weekWithCalendar(db, prefs, date) {
  const monday = weekStartOf(date);
  return withCalendarFree(prefs, monday, await calendarFree(db, monday, shift(monday, 6)));
}
