// GET /app/api/plan-compliance: "Splnění plánu" of one done session for its
// detail. ?activity=<Intervals.icu id>&planned=<planned event id> for a ride
// or run (load, time and distance against the plan, the planned steps against
// the recorded intervals), ?gym=<date> for a gym day logged in the app (sets
// and volume, every exercise's percent). The numbers: plan-compliance.js.
import { cached } from "./api-cache.js";
import { rideIntervals } from "./activity-detail.js";
import { athleteThresholds } from "./intervals-athlete.js";
import { buildRideReview } from "./ride-review.js";
import { buildRunReview } from "./run-review.js";
import { readGymPlan } from "./gym-plan-store.js";
import { parseStrengthPlan } from "./strength-history.js";
import { enduranceCompliance, gymCompliance, complianceSteps, complianceBand, complianceWord } from "./plan-compliance.js";
import { L } from "./lang.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const parse = text => { try { return JSON.parse(text || "{}"); } catch { return {}; } };
const seconds = p => num(p.moving_time ?? p.elapsed_time ?? p.duration_seconds ?? p.duration);

const withWord = out => out && { ...out, band: complianceBand(out.percent), word: complianceWord(out.percent) };

export async function planComplianceRoute(env, ctx, url) {
  const gym = url.searchParams.get("gym");
  if (gym) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gym)) return Response.json({ message: L("Neplatné datum.", "Invalid date.") }, { status: 400 });
    const plan = await readGymPlan(env.DB, gym);
    let rows = [];
    try { rows = plan.stored ? parseStrengthPlan(plan.values).rows : []; } catch { rows = []; }
    const out = gymCompliance(rows);
    return Response.json({ status: "ok", compliance: withWord(out) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const id = String(url.searchParams.get("activity") || "").replace(/^activity:/, ""), planned = String(url.searchParams.get("planned") || "");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !/^(planned:)?[a-zA-Z0-9_.:-]{1,120}$/.test(planned)) return Response.json({ message: L("Neplatná aktivita.", "Invalid activity.") }, { status: 400 });
  const [activityRow, planRow] = await Promise.all([
    env.DB.prepare("SELECT payload_json FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='activity' AND external_id=? LIMIT 1").bind(env.USER_ID, "activity:" + id).first(),
    env.DB.prepare("SELECT payload_json FROM health_datapoints WHERE user_id=? AND data_type='planned-workout' AND external_id=? LIMIT 1").bind(env.USER_ID, "planned:" + planned.replace(/^planned:/, "")).first()
  ]);
  if (!activityRow || !planRow) return Response.json({ status: "ok", compliance: null }, { headers: { "Cache-Control": "private, no-store" } });
  const a = parse(activityRow.payload_json), p = parse(planRow.payload_json);
  const done = { tss: num(a.icu_training_load ?? a.training_load), durationHours: seconds(a) / 3600 || null, distance: num(a.distance) };
  let planSecs = seconds(p);
  if (planSecs != null && planSecs < 1000 && p.moving_time == null) planSecs *= 3600; // hours in an old event
  const plan = { tss: num(p.icu_training_load ?? p.training_load), durationHours: planSecs > 0 ? planSecs / 3600 : null, distance: num(p.distance), description: p.description || "" };
  const base = enduranceCompliance(done, plan);
  if (!base) return Response.json({ status: "ok", compliance: null }, { headers: { "Cache-Control": "private, no-store" } });
  // The planned steps against the recorded intervals, as the coach's review pairs them.
  let steps = null, target = null;
  if (plan.description) {
    const run = /run|treadmill/i.test(String(a.type || ""));
    const [detail, thresholds] = await Promise.all([
      cached(env, ctx, "ride-intervals:" + id, () => rideIntervals(env, id), { ttl: 21600 }).catch(() => null),
      run ? cached(env, ctx, "thresholds", () => athleteThresholds(env)).catch(() => ({})) : null
    ]);
    const activity = { payload: a, tss: done.tss, durationHours: done.durationHours, type: a.type };
    const review = run ? buildRunReview({ activity, detail, plan, thresholdPace: thresholds?.runThresholdPace }) : buildRideReview({ activity, detail, plan });
    steps = complianceSteps(review.chart);
    target = review.target || null;
  }
  return Response.json({ status: "ok", compliance: withWord({ ...base, steps, target, planName: p.name || null }) }, { headers: { "Cache-Control": "private, no-store" } });
}
