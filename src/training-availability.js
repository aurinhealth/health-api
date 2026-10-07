import { L } from './lang.js';
// Availability is the total time available for sport on a day.
export const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
export const weekStartOf = date => {
  if (!validDay(date)) throw new Error(L('Neplatné datum týdne.', 'Invalid week date.'));
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
};
export function parseTimeWindow(value) {
  if (value == null || String(value).trim() === '') return null;
  const m = String(value).trim().match(/^(\d{1,2})(?::([0-5]\d))?\s*[-–—]\s*(\d{1,2})(?::([0-5]\d))?$/);
  if (!m) throw new Error(L('Časové okno zadej například 10–15 nebo 10:30–15:00.', 'Enter the time window like 10–15 or 10:30–15:00.'));
  const start = Number(m[1]) * 60 + Number(m[2] || 0), end = Number(m[3]) * 60 + Number(m[4] || 0);
  if (start >= 1440 || end > 1440 || end <= start) throw new Error(L('Konec okna musí být po začátku ve stejném dni.', 'The window must end after it starts, on the same day.'));
  const clock = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  return { start: clock(start), end: clock(end), minutes: end - start };
}
export function normalizeAvailability(days = []) {
  return Array.from({ length: 7 }, (_, i) => {
    const raw = days[i] || {};
    const minutes = raw.minutes == null || raw.minutes === '' ? null : Number(raw.minutes);
    if (minutes != null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440)) throw new Error(L('Dostupný čas musí být mezi 0 a 24 hodinami.', 'Available time must be between 0 and 24 hours.'));
    // Preserve a legacy clock window's duration when no budget was saved,
    // then retire clock positions and sport preferences from availability.
    const legacyMinutes = minutes == null && raw.window ? parseTimeWindow(raw.window)?.minutes : null;
    return { window: '', minutes: minutes == null ? legacyMinutes : Math.round(minutes), preferredSports: [] };
  });
}
export const availabilityOn = (prefs, date) => prefs?.availability?.[(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7] || { minutes: null, window: '', preferredSports: [] };
export function trainingBudget(prefs, date, requested = null, { userInitiated = false } = {}) {
  // Saved availability guides automatic planning; an athlete's explicit choice wins.
  if (userInitiated) return requested;
  const limit = availabilityOn(prefs, date).minutes;
  return limit == null ? requested : requested == null ? limit : Math.min(limit, requested);
}
export async function ensureWeekOverrides(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS week_plan_overrides (user_id INTEGER NOT NULL, week_start TEXT NOT NULL, prefs_json TEXT NOT NULL, PRIMARY KEY(user_id,week_start))').run();
}
