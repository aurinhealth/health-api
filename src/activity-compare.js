// GET /app/api/activity-compare?id=<Intervals.icu id>: "Minule vs dnes" in a
// ride's or run's detail. The last earlier activity of the same sport with the
// same workout, read from the work intervals Intervals.icu detected: the same
// number of efforts, each about as long. Activities with the same name are
// tried first (a workout from the plan or the library keeps its name), then
// the others whose interval summary has as many efforts. Rides compare watts,
// runs pace, both with heart rate. No AI.
import { cached } from "./api-cache.js";
import { rideIntervals } from "./activity-detail.js";
import { activityKindOf } from "./activity-match.js";
import { L, lang } from "./lang.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const parse = text => { try { return JSON.parse(text || "{}"); } catch { return {}; } };
const DAYS = 180, FETCHES = 6;

// The efforts of a recording: Intervals.icu's WORK intervals of 30 s or more.
export function workIntervals(intervals = []) {
  return (Array.isArray(intervals) ? intervals : []).filter(i => String(i?.type || "").toUpperCase() === "WORK" && num(i.seconds) >= 30);
}

// The same workout: as many efforts, each within 15 % (at least 30 s) of the
// other's length. One effort alone counts only from 5 minutes.
export function sameShape(a = [], b = []) {
  if (!a.length || a.length !== b.length) return false;
  if (a.length === 1 && a[0].seconds < 300) return false;
  return a.every((x, i) => Math.abs(x.seconds - b[i].seconds) <= Math.max(30, 0.15 * Math.max(x.seconds, b[i].seconds)));
}

// "4x 8m 255w" → 4: the number of efforts in Intervals.icu's interval summary.
export function summaryEfforts(summary) {
  const list = Array.isArray(summary) ? summary : [];
  if (!list.length) return null;
  return list.reduce((sum, s) => { const m = String(s).match(/^\s*(\d+)\s*x/i); return sum + (m ? Number(m[1]) : 1); }, 0);
}

const nameKey = name => String(name || "").toLowerCase().replace(/\s+/g, " ").trim();

// The value compared: watts on a ride, seconds per km on a run.
function valueOf(i, metric) {
  if (metric === "watts") return num(i.watts);
  const speed = num(i.speed);
  return speed > 0 ? 1000 / speed : null;
}

const weighted = (list, pick) => {
  let sum = 0, time = 0;
  for (const i of list) { const v = pick(i); if (v == null) return null; sum += v * i.seconds; time += i.seconds; }
  return time ? sum / time : null;
};

// The words under the numbers: what changed, never a judgement in red.
export function compareSentence({ metric, before, after }) {
  const ride = metric === "watts";
  // Better: more watts, or fewer seconds per km.
  const gain = ride ? after.value - before.value : before.value - after.value;
  const hr = before.hr != null && after.hr != null ? after.hr - before.hr : null;
  const same = Math.abs(gain) < 3;
  const more = ride ? L("Víc wattů", "More watts") : L("Rychlejší úseky", "Faster efforts");
  if (same) return hr != null && hr <= -3 ? L("Stejný výkon při nižším tepu.", "The same output at a lower heart rate.") : L("Skoro stejně jako minule.", "Almost the same as last time.");
  if (gain > 0) {
    if (hr == null) return more + ".";
    if (hr <= -3) return more + L(" při nižším tepu.", " at a lower heart rate.");
    if (hr < 3) return more + L(" skoro při stejném tepu.", " at almost the same heart rate.");
    return more + L(", tep o něco výš.", ", heart rate a little higher.");
  }
  return hr != null && hr <= -3 ? L("Dnes volněji a s nižším tepem.", "Easier today, at a lower heart rate.") : L("Dnes volněji než minule.", "Easier than last time.");
}

// The comparison of two recordings of the same workout, or null.
export function compareIntervals(nowIntervals, beforeIntervals, sport) {
  const now = workIntervals(nowIntervals), before = workIntervals(beforeIntervals);
  if (!sameShape(now, before)) return null;
  const metric = sport === "run" ? "pace" : "watts";
  const after = { value: weighted(now, i => valueOf(i, metric)), hr: weighted(now, i => num(i.hr)) };
  const prev = { value: weighted(before, i => valueOf(i, metric)), hr: weighted(before, i => num(i.hr)) };
  if (after.value == null || prev.value == null) return null;
  const round = v => (v == null ? null : Math.round(v));
  const kmReps = sport === "run" && now.every(i => num(i.distance) && Math.abs(i.distance - 1000) <= 30);
  const label = n => sport === "run" ? (kmReps ? L(`${n}. km`, `km ${n}`) : L(`${n}. úsek`, `Effort ${n}`)) : L(`${n}. interval`, `Interval ${n}`);
  return {
    metric,
    before: { value: round(prev.value), hr: round(prev.hr) },
    after: { value: round(after.value), hr: round(after.hr) },
    sentence: compareSentence({ metric, before: prev, after }),
    rows: now.slice(0, 12).map((i, k) => ({
      label: label(k + 1),
      before: { value: round(valueOf(before[k], metric)), hr: round(num(before[k].hr)) },
      after: { value: round(valueOf(i, metric)), hr: round(num(i.hr)) }
    }))
  };
}

// The candidates to read, best first: the same name, then as many efforts in
// the summary, newest first within each.
export function candidates(rows, { id, sport, name, efforts }) {
  const key = nameKey(name), list = [];
  for (const r of rows) {
    const p = parse(r.payload_json), rid = String(p.id || String(r.external_id || "").replace(/^activity:/, ""));
    if (!rid || rid === id || !/^[a-zA-Z0-9_-]{1,80}$/.test(rid) || activityKindOf(p.type || p.name) !== sport) continue;
    const sameName = key && nameKey(p.name) === key;
    const count = summaryEfforts(p.interval_summary);
    if (!sameName && (efforts == null || count !== efforts)) continue;
    list.push({ id: rid, row: r, payload: p, rank: sameName ? 0 : 1 });
  }
  return list.sort((a, b) => a.rank - b.rank || String(b.row.start_time).localeCompare(String(a.row.start_time)));
}

// The earlier activity as the week list's session, so the app opens its detail.
function sessionOf(c, sport) {
  const p = c.payload, start = String(p.start_date_local || c.row.start_time || "");
  const seconds = num(p.moving_time) ?? num(p.elapsed_time);
  return {
    id: String(c.row.external_id || "activity:" + c.id), kind: "activity", status: "done",
    date: start.slice(0, 10), time: start.slice(11, 16) || null,
    title: String(p.name || (sport === "run" ? L("Běh", "Run") : L("Kolo", "Ride"))).slice(0, 120), sport,
    minutes: seconds ? Math.round(seconds / 60) : null, tss: num(p.icu_training_load),
    activityId: c.id, eventId: null
  };
}

export async function activityCompareRoute(env, ctx, url) {
  const headers = { "Cache-Control": "private, no-store" };
  const id = String(url.searchParams.get("id") || "").replace(/^activity:/, "");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return Response.json({ message: L("Neplatná aktivita.", "Invalid activity.") }, { status: 400 });
  const row = await env.DB.prepare("SELECT start_time, payload_json FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='activity' AND external_id=? LIMIT 1").bind(env.USER_ID, "activity:" + id).first();
  const payload = parse(row?.payload_json), sport = activityKindOf(payload.type || payload.name);
  if (!row || !env.INTERVALS_API_KEY || !["ride", "run"].includes(sport)) return Response.json({ status: "ok", comparison: null }, { headers });
  const comparison = await cached(env, ctx, "activity-compare:" + lang() + ":" + id, async () => {
    const intervals = id => cached(env, ctx, "ride-intervals:" + id, () => rideIntervals(env, id), { ttl: 21600 });
    const now = await intervals(id);
    const efforts = workIntervals(now?.intervals);
    if (!efforts.length) return { found: null };
    const from = new Date(Date.parse(row.start_time) - DAYS * 86400000).toISOString();
    const rows = (await env.DB.prepare("SELECT external_id, start_time, payload_json FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='activity' AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time DESC LIMIT 400").bind(env.USER_ID, from, row.start_time).all()).results || [];
    for (const c of candidates(rows, { id, sport, name: payload.name, efforts: efforts.length }).slice(0, FETCHES)) {
      const before = await intervals(c.id).catch(() => null);
      const out = before && compareIntervals(now.intervals, before.intervals, sport);
      if (out) return { found: { ...out, session: sessionOf(c, sport) } };
    }
    return { found: null };
  }, { ttl: 21600 }).catch(() => ({ found: null }));
  return Response.json({ status: "ok", comparison: comparison.found }, { headers });
}
