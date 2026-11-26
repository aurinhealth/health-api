// Google sends steps, active energy and minutes in heart-rate zones as a point a
// minute (~3,500 a day), and every point was its own row: ~5 D1 row writes each
// with the indexes, and the zone minutes again when compacted (2026-11-26). Apple
// Health arrives from the phone already summed per hour. From the hour this first
// runs for a user (hourlyFrom), a Google hour is one row per type (and zone): its
// sum, with the 60 minutes kept in the payload (m), so the walk calories still
// read minutes (activity-energy-check.js) and a page or a late watch upload only
// fills its own minutes. Hours before that keep their minute rows: an hour never
// has both, which would count it twice (here and in Apple Health, which gets the
// rows as they are, apple-health-forward.js).
// Known limits: two syncs writing the same hour at once keep the later one's
// minutes, until the next sync of that hour sees them differ and writes them; in a
// half-hour time zone a raw reader that keys rows by local hour or day puts the
// whole UTC hour in its first local hour (the hour summary keys UTC hours anyway).
// Readers of the minutes ask from an hour before the walk or day (an hour row
// starts at the full hour).
export const HOURLY_TYPES = {
  'steps': { prefix: 'steps1h', unit: 'count', key: 'steps', field: 'count' },
  'active-energy-burned': { prefix: 'kcal1h', unit: 'kcal', key: 'activeEnergyBurned', field: 'kcal' },
  // As the zone compaction stores an hour (heart-rate-compaction.js): the interval
  // as long as the minutes, the zone in the payload, no value: Google's minute rows
  // have none (checked on production 2026-11-26), and the hours worn sum the value.
  'time-in-heart-rate-zone': { prefix: 'zone1h', unit: 'min', zone: true }
};
const MARK = 'google_hourly';
const HOUR = 3600e3, MINUTE = 60e3;
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
const round = v => Math.round(v * 1000) / 1000;

// The first hour stored this way for the user: the next full hour the first time.
export async function hourlyFrom(db, userId, now = Date.now(), mark = MARK) {
  const row = await db.prepare('SELECT details_json FROM sync_status WHERE user_id = ? AND sync_name = ?').bind(userId, mark).first().catch(() => null);
  try { const from = JSON.parse(row?.details_json || '{}').from; if (Date.parse(from)) return from; } catch { /* written below */ }
  const from = iso(Math.ceil(now / HOUR) * HOUR);
  await db.prepare("INSERT INTO sync_status(user_id,sync_name,status,finished_at,details_json,updated_at) VALUES(?,?,'ok',datetime('now'),?,datetime('now')) ON CONFLICT(user_id,sync_name) DO NOTHING")
    .bind(userId, mark, JSON.stringify({ from })).run();
  return hourlyFrom(db, userId, now, mark);
}

// The points from `from` on, as minutes per hour (and zone): a point's value split
// over the minutes it covers (a zone point counts its minutes). The rest is
// returned as it came.
export function hourlySlots(type, points, infoOf, from) {
  const spec = HOURLY_TYPES[type], cut = Date.parse(from), hours = new Map(), rest = [];
  for (const point of points) {
    const i = infoOf(point), s = Date.parse(i.start || i.sample || ''), e = Date.parse(i.end || '') || s;
    if (!Number.isFinite(s) || s < cut) { rest.push(point); continue; }
    const zone = spec.zone ? String(point?.timeInHeartRateZone?.heartRateZoneType || '') : '';
    const value = spec.zone ? null : Number(i.value);
    if (!spec.zone && !Number.isFinite(value)) continue;
    const add = (at, share) => {
      const h = Math.floor(at / HOUR) * HOUR, key = `${zone}|${h}`, entry = hours.get(key) || { hour: iso(h), zone, slots: new Map() };
      const m = Math.floor((at - h) / MINUTE);
      entry.slots.set(m, round((entry.slots.get(m) || 0) + share));
      hours.set(key, entry);
    };
    if (!(e > s)) { add(s, spec.zone ? 0 : value); continue; }
    for (let t = s; t < e;) {
      const next = Math.min(e, (Math.floor(t / MINUTE) + 1) * MINUTE), part = (next - t) / (e - s);
      add(t, spec.zone ? (next - t) / MINUTE : value * part);
      t = next;
    }
  }
  return { hours, rest };
}

export const hourlyId = (type, entry) => `${HOURLY_TYPES[type].prefix}:${entry.zone ? entry.zone + ':' : ''}${entry.hour}`;

// The hour's row: the stored minutes with the new ones over them.
export function hourlyRow(type, entry, storedPayload) {
  const spec = HOURLY_TYPES[type];
  let m = null;
  try { m = JSON.parse(storedPayload || '{}').m; } catch { /* a new hour */ }
  m = Array.isArray(m) && m.length === 60 ? [...m] : Array(60).fill(null);
  for (const [k, v] of entry.slots) m[k] = v;
  const total = round(m.reduce((s, v) => s + (v || 0), 0)), start = Date.parse(entry.hour);
  if (spec.zone) {
    const minutes = round(Math.min(60, total)), end = iso(start + Math.round(minutes * 60) * 1000);
    return { id: hourlyId(type, entry), i: { sample: null, start: entry.hour, end, value: null, unit: spec.unit },
      payload: JSON.stringify({ timeInHeartRateZone: { interval: { startTime: entry.hour, endTime: end }, heartRateZoneType: entry.zone }, m }) };
  }
  return { id: hourlyId(type, entry), i: { sample: null, start: entry.hour, end: iso(start + HOUR), value: total, unit: spec.unit },
    payload: JSON.stringify({ [spec.key]: { [spec.field]: total }, m }) };
}

// An hour row back as its minutes, for readers that need them (walk calories);
// any other row as it is.
export function minuteRows(rows) {
  return rows.flatMap(row => {
    if (!row?.payload_json || !String(row.payload_json).includes('"m":[')) return [row];
    let m;
    try { m = JSON.parse(row.payload_json).m; } catch { return [row]; }
    const start = Date.parse(row.start_time);
    if (!Array.isArray(m) || m.length !== 60 || !Number.isFinite(start)) return [row];
    return m.map((v, k) => v == null ? null : { ...row, start_time: iso(start + k * MINUTE), end_time: iso(start + (k + 1) * MINUTE), value_numeric: v }).filter(Boolean);
  });
}
