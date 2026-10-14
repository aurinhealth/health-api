// CTL, ATL and TSB from the athlete's own workouts (training-load.js).
import { cached } from "./api-cache.js";
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { loadSeries, dailyLoads, sessionsFrom, gymSessions, watchOnly } from "./training-load.js";
import { athleteThresholds } from "./intervals-athlete.js";
import { shiftDate, dashboardProfile } from "./dashboard-shared.js";

// CTL, ATL and TSB from the athlete's own workouts when Intervals.icu is not
// connected. 120 days before `from` warm the averages up, so CTL is close to
// what it would be with the full history.
export async function ownFitness(env,from,to){
  const warmup=120,start=shiftDate(from,-warmup);
  const [rows,sets,ratings,athlete]=await Promise.all([
    loadActivityRows(env,start,to),
    // The logged sets give each gym session its length, RPE and volume (training-load.js gymSessions).
    env.DB.prepare('SELECT workout_date,type,exercise,set_no,actual_kg,actual_reps,rpe FROM strength_sets WHERE user_id=? AND workout_date>=? AND workout_date<=?').bind(env.USER_ID,start,to).all().then(r=>r.results||[]).catch(()=>[]),
    // The athlete's RPE of the day's session (Po tréninku), for a gym session without set RPE.
    env.DB.prepare('SELECT date,rpe FROM coach_reflections WHERE user_id=? AND date>=? AND date<=? AND workout_id IS NULL AND rpe IS NOT NULL ORDER BY id').bind(env.USER_ID,start,to).all().then(r=>r.results||[]).catch(()=>[]),
    loadAthlete(env,to)
  ]);
  const byActivity=new Map(),activities=[];
  for(const row of rows){const a=activityFromRow(row);if(a){byActivity.set(a,row);activities.push(a);}}
  const kept=dedupeActivities(activities);
  // The day's rating is the gym's only when nothing else was trained that day.
  const otherDays=new Set(kept.filter(a=>a.kind!=='strength').map(a=>a.date)),dayRpe={};
  for(const r of ratings)if(!otherDays.has(r.date))dayRpe[r.date]=r.rpe;
  return loadSeries(dailyLoads(sessionsFrom(kept,byActivity,gymSessions(sets,dayRpe)),athlete),{from,to,warmup});
}
// Workouts of the watch and Intervals.icu from `start` to `to` (duplicates marked by the sync left out).
export function loadActivityRows(env,start,to){
  return env.DB.prepare("SELECT start_time,end_time,source_family,payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time").bind(env.USER_ID,start,shiftDate(to,1)).all().then(r=>r.results||[]).catch(()=>[]);
}
// FTP, LTHR, heart-rate range and sex for the load of a session (training-load.js).
export async function loadAthlete(env,to,ctx=null){
  const [thresholds,profile,rest]=await Promise.all([
    (ctx?cached(env,ctx,'thresholds',()=>athleteThresholds(env)):athleteThresholds(env)).catch(()=>({})),
    dashboardProfile(env).catch(()=>null),
    env.DB.prepare("SELECT value_numeric FROM health_datapoints WHERE user_id=? AND data_type='daily-resting-heart-rate' AND sample_time>=? AND value_numeric>0").bind(env.USER_ID,shiftDate(to,-30)).all().then(r=>(r.results||[]).map(x=>Number(x.value_numeric)).sort((a,b)=>a-b)).catch(()=>[])
  ]);
  const age=Number(profile?.age)||null;
  return {ftp:thresholds.ftp,lthr:thresholds.lthr,maxHr:thresholds.maxHr||(age?Math.round(208-0.7*age):null),restHr:thresholds.restHr||(rest.length?rest[Math.floor(rest.length/2)]:null),sex:profile?.sex||null};
}
// With Intervals.icu connected: the load of the workouts only the watch
// recorded (Apple Health, Google Health) or Wahoo brought, as rows to add to its CTL and ATL
// (training-load.js watchOnly, addLoads); null when there are none.
export async function watchOnlyFitness(env,ctx,from,to){
  const warmup=120,start=shiftDate(from,-warmup);
  const rows=await loadActivityRows(env,start,to);
  const byActivity=new Map(),watch=[],intervals=[];
  for(const row of rows){const a=activityFromRow(row);if(!a)continue;byActivity.set(a,row);
    if(row.source_family==='google-wearables'||row.source_family==='apple-health'||row.source_family==='wahoo')watch.push(a);else if(row.source_family==='intervals')intervals.push(a);}
  const extra=watchOnly(dedupeActivities(watch),intervals);
  if(!extra.length)return null;
  return loadSeries(dailyLoads(sessionsFrom(extra,byActivity,[]),await loadAthlete(env,to,ctx)),{from,to,warmup});
}
