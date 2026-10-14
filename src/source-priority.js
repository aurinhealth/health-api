// Which device's data counts when several measure the same thing (Apple Health,
// Google Health, the Ultrahuman ring). The other copies become duplicates
// (record_role 'duplicate', matched_activity_id MARK), which every reader skips.
//
// Night (sleep, HRV, resting heart rate, breathing, oxygen, temperature, and the
// VO2max estimate of the same device): the
// devices are never mixed, each measures HRV its own way and a blend would
// break the trend. Automatically the "home" source holds: the one with the
// most full nights in the 30 days up to that day; another source fills only the
// nights the home source missed.
// Day (steps, energy, distance): hour by hour. In each hour the home source of
// the day counts when it measured that hour, otherwise the other one does, so
// an hour without the band is filled and none is counted twice. The day's home
// source is the device worn longest over the 30 days (hours with heart rate).
// The user can name the source for either part instead; it then wins wherever
// it has data, and the automatic rule fills the rest.
const PRIORITY = 'source_priority';
export const MARK = 'source-priority';
// Markers of the rules this replaces (apple-health.js, ultrahuman.js): rows they
// set aside are this module's to bring back.
const OURS = `('${MARK}','apple-health','ultrahuman')`;
export const FAMILIES = ['ultrahuman', 'apple-health', 'google-wearables'];
const FAMILY_SQL = `(${FAMILIES.map(f => `'${f}'`).join(',')})`;
// The app's names for them.
export const PROVIDER_FAMILY = { ultrahuman: 'ultrahuman', apple: 'apple-health', google: 'google-wearables' };
const FAMILY_PROVIDER = Object.fromEntries(Object.entries(PROVIDER_FAMILY).map(([p, f]) => [f, p]));

// Each group is one measurement; the temperature types are three names for it.
const NIGHT = [['sleep'], ['daily-resting-heart-rate'], ['daily-heart-rate-variability'], ['daily-respiratory-rate'], ['daily-oxygen-saturation'], ['daily-vo2-max'],
  // Google's and the ring's nightly temperature are the same reading (google-dashboard.js
  // skinTempDeviation); Apple Watch's wrist temperature is its own (the cycle uses it).
  ['daily-sleep-temperature-derivations', 'daily-skin-temperature-deviation']];
const DAY_HOURLY = [['steps'], ['active-energy-burned'], ['distance']];
const DAY_DAILY = [['time-in-heart-rate-zone']];
const WEAR_TYPE = 'daily-wear-hours';
export const MANAGED_TYPES = [...NIGHT, ...DAY_HOURLY, ...DAY_DAILY].flat();
const PART = Object.fromEntries([...NIGHT.flat().map(t => [t, 'night']), ...[...DAY_HOURLY, ...DAY_DAILY].flat().map(t => [t, 'day'])]);

const DAY_OF = "substr(COALESCE(sample_time,end_time,start_time),1,10)";
const HOUR_OF = 'substr(start_time,1,13)';
const WINDOW_DAYS = 30;
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const VALID = { night: ['auto', 'ultrahuman', 'apple', 'google'], day: ['auto', 'apple', 'google'] };

async function table(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))").run();
}

// { night: 'auto' | 'ultrahuman' | 'apple' | 'google', day: 'auto' | 'apple' | 'google' }
export async function readSourcePriority(db, userId) {
  const out = { night: 'auto', day: 'auto' };
  try {
    await table(db);
    const row = await db.prepare('SELECT details_json FROM sync_status WHERE user_id = ? AND sync_name = ?').bind(userId, PRIORITY).first();
    const saved = JSON.parse(row?.details_json || '{}') || {};
    for (const part of ['night', 'day']) if (VALID[part].includes(saved[part])) out[part] = saved[part];
  } catch (error) { console.error('Source priority read failed', error.message); }
  return out;
}

// Saves the choice and applies it to the data already stored.
export async function saveSourcePriority(db, userId, input = {}, { now = Date.now() } = {}) {
  const current = await readSourcePriority(db, userId);
  const next = { ...current };
  for (const part of ['night', 'day']) {
    if (input[part] === undefined) continue;
    if (!VALID[part].includes(input[part])) return { status: 'error', code: 400, message: 'Unknown source.' };
    next[part] = input[part];
  }
  await table(db);
  await db.prepare("INSERT INTO sync_status(user_id,sync_name,status,finished_at,details_json,updated_at) VALUES(?,?,'ok',datetime('now'),?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET details_json=excluded.details_json,updated_at=excluded.updated_at")
    .bind(userId, PRIORITY, JSON.stringify(next)).run();
  const today = new Date(now).toISOString().slice(0, 10);
  // Nights are a row a day, so their whole history follows; hours only the last three months.
  const changed = (next.night !== current.night ? await resolveSources(db, userId, { part: 'night', since: addDays(today, -400), now }) : 0)
    + (next.day !== current.day ? await resolveSources(db, userId, { part: 'day', since: addDays(today, -92), now }) : 0);
  return { status: 'ok', priority: next, changed };
}

// Per family and day: full nights (sleep of 3 h or more) and hours worn.
async function history(db, userId, from, to) {
  const [nights, worn, zones] = await Promise.all([
    db.prepare(`SELECT source_family f, ${DAY_OF} d FROM health_datapoints WHERE user_id = ? AND data_type = 'sleep' AND source_family IN ${FAMILY_SQL}
      AND end_time >= ? AND end_time < ? AND (julianday(end_time) - julianday(start_time)) * 24 >= 3 GROUP BY 1, 2`).bind(userId, from, to).all(),
    // Hours with heart rate: Apple Watch's from the phone, Google's from its zone minutes (every minute worn).
    db.prepare(`SELECT source_family f, sample_time d, MAX(value_numeric) h FROM health_datapoints WHERE user_id = ? AND data_type = '${WEAR_TYPE}' AND sample_time >= ? AND sample_time < ? GROUP BY 1, 2`).bind(userId, from, to).all(),
    db.prepare(`SELECT source_family f, substr(start_time,1,10) d, SUM(value_numeric) / 60.0 h FROM health_datapoints WHERE user_id = ? AND source_family = 'google-wearables' AND data_type = 'time-in-heart-rate-zone'
      AND start_time >= ? AND start_time < ? GROUP BY 1, 2`).bind(userId, from, to).all()
  ]);
  const night = new Map(), wear = new Map();
  const add = (map, f, d, v) => { if (!map.has(f)) map.set(f, new Map()); map.get(f).set(d, Math.min(24, (map.get(f).get(d) || 0) + v)); };
  for (const r of nights.results || []) add(night, r.f, r.d, 1);
  for (const r of [...(worn.results || []), ...(zones.results || [])]) add(wear, r.f, r.d, Number(r.h) || 0);
  return { night, wear };
}

// The home source on a day: the most over the 30 days up to it; ties go by FAMILIES.
function home(map, date) {
  const from = addDays(date, -WINDOW_DAYS);
  let best = null, bestTotal = 0;
  for (const family of FAMILIES) {
    let total = 0;
    for (const [d, v] of map.get(family) || []) if (d > from && d <= date) total += v;
    if (total > bestTotal) { best = family; bestTotal = total; }
  }
  return best;
}

// A source the user disconnected (Apple Health keeps its data) only fills what no other has.
function winner(candidates, chosen, homeFamily, off) {
  if (chosen && candidates.has(chosen) && !off.has(chosen)) return chosen;
  if (homeFamily && candidates.has(homeFamily) && !off.has(homeFamily)) return homeFamily;
  return FAMILIES.find(f => candidates.has(f) && !off.has(f)) || FAMILIES.find(f => candidates.has(f)) || null;
}

// Applies the rules to the rows of one part ('night' or 'day', or both) from
// `since` on, or only to the groups of `types`. Returns the rows changed.
export async function resolveSources(db, userId, { part, types, since, now = Date.now() } = {}) {
  const wanted = types ? new Set(types.filter(t => PART[t])) : null;
  const pick = groups => groups.filter(g => (!part || PART[g[0]] === part) && (!wanted || g.some(t => wanted.has(t))));
  const night = pick(NIGHT), hourly = pick(DAY_HOURLY), daily = pick(DAY_DAILY);
  if (!night.length && !hourly.length && !daily.length) return 0;
  const today = new Date(now).toISOString().slice(0, 10);
  const from = String(since || addDays(today, -35)).slice(0, 10);
  const priority = await readSourcePriority(db, userId);
  const hist = await history(db, userId, addDays(from, -WINDOW_DAYS), addDays(today, 2));
  const chosen = { night: PROVIDER_FAMILY[priority.night], day: PROVIDER_FAMILY[priority.day] };
  const apple = await db.prepare("SELECT status FROM sync_status WHERE user_id = ? AND sync_name = 'apple_health'").bind(userId).first().catch(() => null);
  const off = new Set(apple?.status === 'disconnected' ? ['apple-health'] : []);

  const statements = [];
  const apply = async (group, keyExpr, partName, homeOf) => {
    const names = group.map(t => `'${t}'`).join(',');
    // Every key with the families that have a row for it, the ones set aside by these rules included.
    const keys = (await db.prepare(`SELECT ${keyExpr} k, source_family f, MAX(record_role = 'primary') kept, MAX(record_role = 'duplicate') aside FROM health_datapoints WHERE user_id = ? AND data_type IN (${names}) AND source_family IN ${FAMILY_SQL}
      AND COALESCE(sample_time,end_time,start_time) >= ? AND (record_role = 'primary' OR (record_role = 'duplicate' AND matched_activity_id IN ${OURS})) GROUP BY 1, 2`).bind(userId, from).all()).results || [];
    const byKey = new Map();
    for (const r of keys) { if (!r.k) continue; if (!byKey.has(r.k)) byKey.set(r.k, new Map()); byKey.get(r.k).set(r.f, r); }
    // Only the keys whose rows change: a winner with rows set aside, a loser with rows still counted.
    const keep = new Map(FAMILIES.map(f => [f, []])), drop = new Map(FAMILIES.map(f => [f, []]));
    for (const [key, families] of byKey) {
      const win = winner(families, chosen[partName], homeOf(key.slice(0, 10)), off);
      for (const [f, r] of families) {
        if (f === win) { if (Number(r.aside)) keep.get(f).push(key); }
        else if (Number(r.kept)) drop.get(f).push(key);
      }
    }
    for (const f of FAMILIES) {
      if (drop.get(f).length) statements.push(db.prepare(`UPDATE health_datapoints SET record_role = 'duplicate', matched_activity_id = '${MARK}', match_confidence = 0, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND source_family = ? AND data_type IN (${names}) AND record_role = 'primary' AND COALESCE(sample_time,end_time,start_time) >= ? AND ${keyExpr} IN (SELECT value FROM json_each(?))`).bind(userId, f, from, JSON.stringify(drop.get(f))));
      if (keep.get(f).length) statements.push(db.prepare(`UPDATE health_datapoints SET record_role = 'primary', matched_activity_id = NULL, match_confidence = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND source_family = ? AND data_type IN (${names}) AND record_role = 'duplicate' AND matched_activity_id IN ${OURS} AND COALESCE(sample_time,end_time,start_time) >= ? AND ${keyExpr} IN (SELECT value FROM json_each(?))`).bind(userId, f, from, JSON.stringify(keep.get(f))));
    }
  };
  for (const g of night) await apply(g, DAY_OF, 'night', d => home(hist.night, d));
  for (const g of hourly) await apply(g, HOUR_OF, 'day', d => home(hist.wear, d));
  for (const g of daily) await apply(g, DAY_OF, 'day', d => home(hist.wear, d));
  let changed = 0;
  for (let i = 0; i < statements.length; i += 50) {
    for (const result of await db.batch(statements.slice(i, i + 50))) changed += Number(result?.meta?.changes || 0);
  }
  return changed;
}

// The parts the user can choose for and their options, for the app.
export function priorityChoices(connected = []) {
  const has = id => connected.includes(id);
  return {
    night: ['ultrahuman', 'google', 'apple'].filter(has),
    day: ['google', 'apple'].filter(has)
  };
}

export { FAMILY_PROVIDER };
