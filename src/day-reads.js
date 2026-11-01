// The reads of one day's analysis (index.js energyForDate, foodLogForDate,
// nearbyRideContext), done once for a whole week. The coach's three weeks and
// the Week screen analyse seven days each, and every day asked the database
// the same five things for its own day: some 105 of a coach card's queries.
// While a week is being analysed (/app/api/week, readDaysTogether), the first
// day that needs a read asks for the whole week at once and every day of the
// week takes its own rows from that answer, filtered and ordered exactly as
// its own query would have them. Anything outside the week, or a week read
// that failed, goes to the day's own query as before.

const windows = new WeakMap();

// Each read: the SQL for a range [lo, hi) of `column`, and the range of the
// week it covers. Rows come in the order the day's own query gives them.
const READS = {
  // energyForDate: the day's last total-calories sample.
  calories: {
    column: "sample_time",
    sql: `SELECT value_numeric, sample_time, id FROM health_datapoints
      WHERE user_id = ? AND data_type = 'total-calories' AND sample_time >= ? AND sample_time < ?
      ORDER BY sample_time DESC, id DESC`,
    range: w => [w.from, w.to]
  },
  // energyForDate and nearbyRideContext (up to three days after the day).
  planned: {
    column: "start_time",
    sql: `SELECT * FROM health_datapoints
      WHERE user_id = ? AND source_family IN ('intervals','local') AND data_type = 'planned-workout'
        AND start_time >= ? AND start_time < ?
      ORDER BY start_time, id`,
    range: w => [w.from, w.plannedTo]
  },
  // energyForDate: Intervals.icu, Wahoo and Aurin's own activities.
  activities: {
    column: "start_time",
    sql: `SELECT * FROM health_datapoints
      WHERE user_id = ? AND source_family IN ('intervals','local','wahoo') AND data_type = 'activity'
        AND start_time >= ? AND start_time < ?
        AND (record_role IS NULL OR record_role != 'duplicate')
      ORDER BY start_time, id`,
    range: w => [w.from, w.to]
  },
  // energyForDate: watch workouts, by the user's local day in UTC.
  exercises: {
    column: "start_time",
    sql: `SELECT * FROM health_datapoints
      WHERE user_id = ? AND source_family IN ('google-wearables','apple-health') AND data_type = 'exercise'
        AND start_time >= ? AND start_time < ?
        AND (record_role IS NULL OR record_role != 'duplicate')
      ORDER BY start_time, id`,
    range: w => [w.utcFrom, w.utcTo]
  },
  // foodLogForDate: the meals eaten (consumed_date = the day).
  food: {
    column: "consumed_date",
    sql: `SELECT * FROM food_logs
      WHERE user_id = ? AND consumed_date >= ? AND consumed_date < ? AND (status IS NULL OR status='eaten')
      ORDER BY consumed_date, consumed_at, id`,
    range: w => [w.from, w.to]
  }
};

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const addDays = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
// SQLite compares TEXT byte by byte; for these ASCII dates and times that is
// JavaScript's string order. A value that is not text (NULL) never matches,
// as in SQL.
const within = (value, lo, hi) => typeof value === "string" && value >= lo && value < hi;

// Days [from, to) are analysed together until the returned function is called.
// dayStart: the user's local midnight of a day in UTC (user-time.js dayStartUtc).
export function readDaysTogether(db, userId, from, to, dayStart) {
  if (!db?.prepare || !isDate(from) || !isDate(to) || from >= to || typeof dayStart !== "function") return () => {};
  let utcFrom, utcTo;
  try { utcFrom = dayStart(from); utcTo = dayStart(to); } catch { return () => {}; }
  // nearbyRideContext of the week's last day looks at the two days after the next.
  const w = { userId, from, to, plannedTo: addDays(to, 2), utcFrom, utcTo, loads: new Map() };
  if (!windows.has(db)) windows.set(db, new Set());
  windows.get(db).add(w);
  return () => windows.get(db)?.delete(w);
}

function load(db, w, kind) {
  if (!w.loads.has(kind)) {
    const [lo, hi] = READS[kind].range(w);
    const pending = db.prepare(READS[kind].sql).bind(w.userId, lo, hi).all().then(r => r?.results || []);
    // A failed week read is asked again by the day itself (null below), not kept.
    pending.catch(() => { if (w.loads.get(kind) === pending) w.loads.delete(kind); });
    w.loads.set(kind, pending);
  }
  return w.loads.get(kind);
}

// The rows of `kind` with column in [lo, hi) from a week being analysed, or
// null when no such week covers the range (the caller asks the database).
async function rowsFor(db, userId, kind, lo, hi, match = r => within(r[READS[kind].column], lo, hi)) {
  const set = windows.get(db);
  if (!set?.size) return null;
  for (const w of set) {
    const [wlo, whi] = READS[kind].range(w);
    if (w.userId !== userId || typeof lo !== "string" || typeof hi !== "string" || lo < wlo || hi > whi || lo >= hi) continue;
    const rows = await load(db, w, kind).catch(() => null);
    if (!rows) return null;
    // A copy: callers may change the rows they get.
    return structuredClone(rows.filter(match));
  }
  return null;
}

// energyForDate's total-calories: {value_numeric, sample_time} of the latest, null for none, undefined when not covered.
export async function dayCalories(db, userId, date, nextDate) {
  const rows = await rowsFor(db, userId, "calories", date, nextDate);
  if (!rows) return undefined;
  return rows.length ? { value_numeric: rows[0].value_numeric, sample_time: rows[0].sample_time } : null;
}
// The others: { results } as D1's all() gives them, or null when not covered.
export async function dayRows(db, userId, kind, lo, hi) {
  if (kind === "calories" || !READS[kind]) return null;
  // Meals of one day (consumed_date = date): read as the range [date, the next
  // day), kept only when equal, as the day's own query has it.
  const rows = kind === "food"
    ? (isDate(lo) ? await rowsFor(db, userId, kind, lo, addDays(lo, 1), r => r.consumed_date === lo) : null)
    : await rowsFor(db, userId, kind, lo, hi);
  return rows ? { results: rows } : null;
}
