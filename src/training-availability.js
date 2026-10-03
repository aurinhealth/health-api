// Availability is a local clock window plus a training budget, not a workout duration.
export const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
export const weekStartOf = date => {
  if (!validDay(date)) throw new Error('Neplatné datum týdne.');
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
};
export function parseTimeWindow(value) {
  if (value == null || String(value).trim() === '') return null;
  const m = String(value).trim().match(/^(\d{1,2})(?::([0-5]\d))?\s*[-–—]\s*(\d{1,2})(?::([0-5]\d))?$/);
  if (!m) throw new Error('Časové okno zadej například 10–15 nebo 10:30–15:00.');
  const start = Number(m[1]) * 60 + Number(m[2] || 0), end = Number(m[3]) * 60 + Number(m[4] || 0);
  if (start >= 1440 || end > 1440 || end <= start) throw new Error('Konec okna musí být po začátku ve stejném dni.');
  const clock = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  return { start: clock(start), end: clock(end), minutes: end - start };
}
export function normalizeAvailability(days = []) {
  return Array.from({ length: 7 }, (_, i) => {
    const raw = days[i] || {}, window = parseTimeWindow(raw.window);
    const minutes = raw.minutes == null || raw.minutes === '' ? null : Number(raw.minutes);
    if (minutes != null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440)) throw new Error('Dostupný čas musí být mezi 0 a 24 hodinami.');
    return { window: window ? window.start + '–' + window.end : '', minutes: minutes == null ? (window?.minutes ?? null) : Math.min(Math.round(minutes), window?.minutes ?? 1440), preferredSports: ['ride', 'run', 'gym'].filter(s => raw.preferredSports?.includes(s)) };
  });
}
export const availabilityOn = (prefs, date) => prefs?.availability?.[(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7] || { minutes: null, window: '', preferredSports: [] };
export function trainingBudget(prefs, date, requested = null) {
  const limit = availabilityOn(prefs, date).minutes;
  return limit == null ? requested : requested == null ? limit : Math.min(limit, requested);
}
export async function ensureWeekOverrides(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS week_plan_overrides (user_id INTEGER NOT NULL, week_start TEXT NOT NULL, prefs_json TEXT NOT NULL, PRIMARY KEY(user_id,week_start))').run();
}
