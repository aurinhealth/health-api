// The reads of one day's analysis (index.js energyForDate, foodLogForDate,
// nearbyRideContext), done once for a whole week. The coach's three weeks and
// the Week screen analyse seven days each, and every day asked the database
// the same five things for its own day: some 105 of a coach card's queries.
// While a week is being analysed (/app/api/week, readDaysTogether), the first
// day that needs a read asks for the whole week at once and every day of the
// week takes its own rows from that answer, filtered and ordered exactly as
// its own query has them. Anything outside the week, or a week read that
// failed, is the day's own query (readDay), as before.
//
// Nothing on that path writes these tables, and every write a user makes
// bumps the cache version (api-cache.js), so a week read never outlives a
// change that should reach the days.

const windows = new WeakMap();

// Each kind: the day's own query (`one`, its values), the week's (`week`, for
// the range [lo, hi)) and how a day's rows are picked from the week's.
const READS = {
  // energyForDate: the day's last total-calories sample, [date, next day).
  // The week asks each day's LIMIT 1 in one query (a day may have many samples).
  calories: {
    one: `SELECT value_numeric, sample_time FROM health_datapoints
      WHERE user_id = ? AND data_type = 'total-calories' AND sample_time >= ? AND sample_time < ?
      ORDER BY sample_time DESC, id DESC
      LIMIT 1`,
    range: w => [w.from, w.to]
  },
  // energyForDate and nearbyRideContext (up to three days after the day).
  planned: {
    one: `SELECT * FROM health_datapoints
      WHERE user_id = ? AND source_family IN ('intervals','local') AND data_type = 'planned-workout'
        AND start_time >= ? AND start_time < ?
      ORDER BY start_time, id`,
    column: "start_time",
    range: w => [w.from, w.plannedTo]
  },
  // energyForDate: Intervals.icu, Wahoo and Aurin's own activities.
  activities: {
    one: `SELECT * FROM health_datapoints
      WHERE user_id = ? AND source_family IN ('intervals','local','wahoo') AND data_type = 'activity'
        AND start_time >= ? AND start_time < ?
        AND (record_role IS NULL OR record_role != 'duplicate')
      ORDER BY start_time, id`,
    column: "start_time",
    range: w => [w.from, w.to]
  },
  // energyForDate: watch workouts, by the user's local day in UTC.
  exercises: {
    one: `SELECT * FROM health_datapoints
      WHERE user_id = ? AND source_family IN ('google-wearables','apple-health') AND data_type = 'exercise'
        AND start_time >= ? AND start_time < ?
        AND (record_role IS NULL OR record_role != 'duplicate')
      ORDER BY start_time, id`,
    column: "start_time",
    range: w => [w.utcFrom, w.utcTo]
  },
  // foodLogForDate: the meals eaten on the day (consumed_date = date).
  food: {
    one: `SELECT * FROM food_logs
      WHERE user_id = ? AND consumed_date = ? AND (status IS NULL OR status='eaten')
      ORDER BY consumed_at, id`,
    week: `SELECT * FROM food_logs
      WHERE user_id = ? AND consumed_date >= ? AND consumed_date < ? AND (status IS NULL OR status='eaten')
      ORDER BY consumed_date, consumed_at, id`,
    range: w => [w.from, w.to]
  }
};
// The range kinds read the week with their own query over the week's range.
for (const kind of ["planned", "activities", "exercises"]) READS[kind].week = READS[kind].one;

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
  const days = [];
  for (let d = from; d < to && days.length < 31; d = addDays(d, 1)) days.push(d);
  // nearbyRideContext of the week's last day looks at the two days after the next.
  const w = { userId, from, to, days, plannedTo: addDays(to, 2), utcFrom, utcTo, loads: new Map() };
  if (!windows.has(db)) windows.set(db, new Set());
  windows.get(db).add(w);
  return () => windows.get(db)?.delete(w);
}

function weekQuery(db, w, kind) {
  if (kind === "calories") {
    // Each day's own LIMIT 1, all days in one query: (day number, its row).
    const sql = w.days.map((_, i) => `SELECT * FROM (SELECT ${i} AS day, value_numeric, sample_time FROM health_datapoints
      WHERE user_id = ? AND data_type = 'total-calories' AND sample_time >= ? AND sample_time < ?
      ORDER BY sample_time DESC, id DESC LIMIT 1)`).join(" UNION ALL ");
    return db.prepare(sql).bind(...w.days.flatMap(d => [w.userId, d, addDays(d, 1)])).all();
  }
  const [lo, hi] = READS[kind].range(w);
  return db.prepare(READS[kind].week).bind(w.userId, lo, hi).all();
}

function load(db, w, kind) {
  if (!w.loads.has(kind)) {
    const pending = weekQuery(db, w, kind).then(r => r?.results || []);
    // A failed week read is asked again (null below: the day asks for its own), not kept.
    pending.catch(() => { if (w.loads.get(kind) === pending) w.loads.delete(kind); });
    w.loads.set(kind, pending);
  }
  return w.loads.get(kind);
}

// A day's rows from a week being analysed, or null when no such week covers
// it (or its read failed).
async function fromWeek(db, userId, kind, lo, hi) {
  const set = windows.get(db);
  if (!set?.size || typeof lo !== "string") return null;
  for (const w of set) {
    if (w.userId !== userId) continue;
    let pick;
    if (kind === "calories") {
      const i = w.days.indexOf(lo);
      if (i < 0 || hi !== addDays(lo, 1)) continue;
      pick = rows => { const r = rows.find(x => x.day === i); return r ? [{ value_numeric: r.value_numeric, sample_time: r.sample_time }] : []; };
    } else if (kind === "food") {
      if (!w.days.includes(lo)) continue;
      pick = rows => structuredClone(rows.filter(r => r.consumed_date === lo));
    } else {
      const [wlo, whi] = READS[kind].range(w);
      if (typeof hi !== "string" || lo < wlo || hi > whi || lo >= hi) continue;
      // A copy: callers may change the rows they get.
      pick = rows => structuredClone(rows.filter(r => within(r[READS[kind].column], lo, hi)));
    }
    const rows = await load(db, w, kind).catch(() => null);
    return rows ? pick(rows) : null;
  }
  return null;
}

// One day's read of `kind` as D1's all() gives it ({ results }): from the week
// being analysed, or the day's own query. lo/hi: the day's range ([date, next
// day), for exercises its UTC times); food takes the date alone.
export async function readDay(db, userId, kind, lo, hi) {
  if (!READS[kind]) throw new Error("Unknown day read: " + kind);
  const rows = await fromWeek(db, userId, kind, lo, hi);
  if (rows) return { results: rows };
  const statement = db.prepare(READS[kind].one);
  return (kind === "food" ? statement.bind(userId, lo) : statement.bind(userId, lo, hi)).all();
}
