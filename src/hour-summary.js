// Per hour and source, what Today, the coach and the source choice add up from the
// raw rows: steps and active energy of the rows that count, minutes in each
// heart-rate zone, and the minutes worn (every Google zone minute, set aside or
// not, as source-priority.js counts them). Google stores a row a minute for the
// zones (~1,400 a day): a month of them was read on every Today and every source
// choice. The summary has at most 24 rows a day and source.
//
// It is rebuilt from the raw rows for the hours a sync changed (apple-health.js),
// and filled back READY_DAYS once per user (upkeepHourSummary). Until it reaches
// far enough back, the readers keep reading the raw rows.
import { localToday, localHour } from './user-time.js';

export const SUMMARY_TYPES = ['steps', 'active-energy-burned', 'time-in-heart-rate-zone'];
const STATUS = 'hour_summary';
const READY_DAYS = 40;
const ZONES = ['light', 'moderate', 'vigorous', 'peak'];
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const hourOf = time => String(time || '').slice(0, 13);

async function tables(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS health_hour_summary (user_id INTEGER NOT NULL, hour TEXT NOT NULL, source_family TEXT NOT NULL, steps REAL, energy REAL, zone_light REAL, zone_moderate REAL, zone_vigorous REAL, zone_peak REAL, wear_minutes REAL, PRIMARY KEY (user_id, hour, source_family))').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))').run();
}

const primary = "record_role = 'primary'";
const zone = "CASE WHEN json_valid(payload_json) THEN lower(json_extract(payload_json, '$.timeInHeartRateZone.heartRateZoneType')) END";
// Minutes as google-dashboard.js counts them: the length of the interval, up to a day.
const minutes = 'ROUND((julianday(end_time) - julianday(start_time)) * 86400) / 60.0';
const zoneSum = z => `SUM(CASE WHEN data_type = 'time-in-heart-rate-zone' AND ${primary} AND ${zone} = '${z}' AND ${minutes} > 0 AND ${minutes} <= 1440 THEN ${minutes} END)`;

const COLUMNS = ['steps', 'energy', 'zone_light', 'zone_moderate', 'zone_vigorous', 'zone_peak', 'wear_minutes'];
const MAX_ROW_WRITES = 50;
const same = (a, b) => (a ?? null) === (b ?? null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-9);

// The summary's rows of a user and range, from the raw rows (binds user, start, end).
const aggregate = `SELECT substr(start_time, 1, 13) || ':00:00Z' AS hour, source_family,
    SUM(CASE WHEN data_type = 'steps' AND ${primary} THEN COALESCE(value_numeric, json_extract(payload_json, '$.steps.count')) END) AS steps,
    SUM(CASE WHEN data_type = 'active-energy-burned' AND ${primary} THEN COALESCE(value_numeric, json_extract(payload_json, '$.activeEnergyBurned.kcal')) END) AS energy,
    ${ZONES.map(z => `${zoneSum(z)} AS zone_${z}`).join(', ')},
    SUM(CASE WHEN data_type = 'time-in-heart-rate-zone' AND source_family = 'google-wearables' THEN value_numeric END) AS wear_minutes
  FROM health_datapoints WHERE user_id = ? AND source_family IN ('google-wearables', 'apple-health') AND data_type IN (${SUMMARY_TYPES.map(t => `'${t}'`).join(', ')})
    AND start_time >= ? AND start_time < ? GROUP BY 1, 2`;

// Rebuilds the hours from `from` (a day or an hour, UTC) up to `to` (exclusive).
// Only the hours whose sums changed are written, and only the hours left with no
// raw row are deleted: every sync rebuilds from its oldest changed hour on, and
// deleting and inserting all of them again cost D1 row writes for hours that
// stayed the same (2026-11-26).
export async function rebuildHourSummary(db, userId, from, to) {
  await tables(db);
  const start = hourOf(from).padEnd(13, 'T00'), end = to ? hourOf(to).padEnd(13, 'T00') : '9999';
  const [fresh, stored] = await db.batch([
    db.prepare(aggregate).bind(userId, start, end),
    db.prepare(`SELECT hour, source_family, ${COLUMNS.join(', ')} FROM health_hour_summary WHERE user_id = ? AND hour >= ? AND hour < ?`).bind(userId, start, end)
  ]);
  const key = r => r.hour + '|' + r.source_family;
  const old = new Map((stored?.results || []).map(r => [key(r), r]));
  const changed = [];
  for (const r of fresh?.results || []) {
    const was = old.get(key(r));
    old.delete(key(r));
    if (!was || !COLUMNS.every(c => same(was[c], r[c]))) changed.push(r);
  }
  // Many changed hours (a first fill, a new day of source choice): the range is
  // written again in two statements, as D1 allows 1,000 queries a request.
  if (changed.length + old.size > MAX_ROW_WRITES) {
    await db.batch([
      db.prepare('DELETE FROM health_hour_summary WHERE user_id = ? AND hour >= ? AND hour < ?').bind(userId, start, end),
      db.prepare(`INSERT INTO health_hour_summary (user_id, hour, source_family, ${COLUMNS.join(', ')}) SELECT ?, * FROM (${aggregate})`).bind(userId, userId, start, end)
    ]);
    return changed.length + old.size;
  }
  // Each hour is summed again inside its own statement, so a sync that wrote the
  // hour meanwhile is not overwritten with the sums read above, and an hour is
  // deleted only while it still has no raw row.
  const plusHour = hour => new Date(Date.parse(hour) + 3600e3).toISOString().replace('.000Z', 'Z');
  const statements = changed.map(r => db.prepare(`INSERT INTO health_hour_summary (user_id, hour, source_family, ${COLUMNS.join(', ')}) SELECT ?, * FROM (${aggregate}) WHERE source_family = ?
      ON CONFLICT (user_id, hour, source_family) DO UPDATE SET ${COLUMNS.map(c => `${c} = excluded.${c}`).join(', ')}`).bind(userId, userId, r.hour, plusHour(r.hour), r.source_family));
  for (const r of old.values()) statements.push(db.prepare(`DELETE FROM health_hour_summary WHERE user_id = ? AND hour = ? AND source_family = ?
      AND NOT EXISTS (SELECT 1 FROM health_datapoints WHERE user_id = ? AND source_family = ? AND data_type IN (${SUMMARY_TYPES.map(t => `'${t}'`).join(', ')}) AND start_time >= ? AND start_time < ?)`)
    .bind(userId, r.hour, r.source_family, userId, r.source_family, r.hour, plusHour(r.hour)));
  if (statements.length) await db.batch(statements);
  return statements.length;
}

async function readMark(db, userId) {
  const row = await db.prepare('SELECT details_json FROM sync_status WHERE user_id = ? AND sync_name = ?').bind(userId, STATUS).first().catch(() => null);
  try { return JSON.parse(row?.details_json || '{}') || {}; } catch { return {}; }
}
async function writeMark(db, userId, mark) {
  await db.prepare("INSERT INTO sync_status(user_id,sync_name,status,finished_at,details_json,updated_at) VALUES(?,?,'ok',datetime('now'),?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET details_json=excluded.details_json,updated_at=excluded.updated_at")
    .bind(userId, STATUS, JSON.stringify(mark)).run();
}

// The first day (UTC) from which the summary is complete, or null.
export async function summaryFrom(db, userId) {
  const mark = await readMark(db, userId);
  return /^\d{4}-\d{2}-\d{2}$/.test(mark.from || '') ? mark.from : null;
}

// Fills the summary back a day per call until READY_DAYS, and once a night (the
// user's 0:00–6:00) builds the last two days again, in case a change slipped past
// the sync. Returns what it did, or null.
export async function upkeepHourSummary(db, userId, { now = Date.now() } = {}) {
  await tables(db);
  const today = new Date(now).toISOString().slice(0, 10);
  const mark = await readMark(db, userId);
  if (!mark.from) {
    await rebuildHourSummary(db, userId, addDays(today, -1), addDays(today, 2));
    await writeMark(db, userId, { ...mark, from: addDays(today, -1), night: localToday(new Date(now)) });
    return { built: addDays(today, -1) };
  }
  if (mark.from > addDays(today, -READY_DAYS)) {
    const day = addDays(mark.from, -1);
    await rebuildHourSummary(db, userId, day, mark.from);
    await writeMark(db, userId, { ...mark, from: day });
    return { built: day };
  }
  const night = localToday(new Date(now));
  if (mark.night !== night && localHour(new Date(now)) < 6) {
    await rebuildHourSummary(db, userId, addDays(today, -2), addDays(today, 2));
    await writeMark(db, userId, { ...mark, night });
    return { rebuilt: addDays(today, -2) };
  }
  return null;
}

// Hours worn per source and UTC day from the Google zone minutes, as
// source-priority.js history() reads them; null while the summary is not complete
// from `from` on.
export async function wearFromSummary(db, userId, from, to) {
  const ready = await summaryFrom(db, userId).catch(() => null);
  if (!ready || ready > from) return null;
  return (await db.prepare(`SELECT source_family f, substr(hour, 1, 10) d, SUM(wear_minutes) / 60.0 h FROM health_hour_summary WHERE user_id = ? AND source_family = 'google-wearables'
    AND hour >= ? AND hour < ? AND wear_minutes IS NOT NULL GROUP BY 1, 2`).bind(userId, from, to).all()).results || [];
}

// The rows google-dashboard.js reads for steps, energy and zone minutes, made from
// the summary: one per hour and source, the zones as an interval of their minutes.
// null while the summary is not complete from `from` on.
export async function dashboardRowsFromSummary(db, userId, from, to) {
  // The month's hours are read alongside the mark (one database trip, not two in a
  // row); they are dropped while the summary does not reach back that far yet.
  const [ready, read] = await Promise.all([summaryFrom(db, userId).catch(() => null),
    db.prepare(`SELECT hour, source_family, steps, energy, zone_light, zone_moderate, zone_vigorous, zone_peak FROM health_hour_summary
    WHERE user_id = ? AND hour >= ? AND hour < ? ORDER BY hour`).bind(userId, from, to).all().then(r => r, error => ({ error }))]);
  if (!ready || ready > from) return null;
  if (read.error) throw read.error;
  const rows = read.results || [];
  const intervals = [], zones = [];
  const plus = (time, min) => new Date(Date.parse(time) + min * 60000).toISOString();
  for (const r of rows) {
    const base = { source_family: r.source_family, sample_time: null, start_time: r.hour, end_time: plus(r.hour, 60), payload_json: '{}' };
    if (r.steps != null) intervals.push({ ...base, data_type: 'steps', value_numeric: Number(r.steps) });
    if (r.energy != null) intervals.push({ ...base, data_type: 'active-energy-burned', value_numeric: Number(r.energy) });
    for (const z of ZONES) {
      const m = Number(r['zone_' + z]);
      if (m > 0) zones.push({ source_family: r.source_family, start_time: r.hour, end_time: plus(r.hour, m), zone: z.toUpperCase() });
    }
  }
  return { intervals, zones };
}
