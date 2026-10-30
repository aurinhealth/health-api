// The active training plans as the week planner and the screens see them, the
// weather place of Today, the planning history and the saved gym plans per day.
import { cached } from "./api-cache.js";
import { gymTypes } from "./activity-type.js";
import { unpairedGymDays } from "./manual-pairs.js";
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { getCapabilities } from "./workout-library.js";
import { athleteThresholds } from "./intervals-athlete.js";
import { latestStoredWeight } from "./athlete-weight.js";
import { getWeekPlan, planWeekRoles, roleTime } from "./week-planner.js";
import { getAthleteState } from "./athlete-state.js";
import { reviewPlan, planWeek, planQuality, planLoad, applyPlan, activePlan, planSports } from "./training-plans.js";
import { weekWeather, dayHours } from "./adaptive-week.js";
import { weatherKitConfigured, weatherKitDetail } from "./weatherkit.js";
import { ensureGymPlans } from "./gym-plan-store.js";
import { localToday } from "./user-time.js";
import { mondayOfDate, shiftDate } from "./dashboard-shared.js";
import { gymCompliance } from "./plan-compliance.js";

// The athlete's weight in kg from a stored weight row, or null.
export const weightKg=row=>Number(row?.value_numeric)>30?Number(row.value_numeric):null;
// The active training plan in a week (training-plans.js): how many quality
// days and what load the week planner makes, and its sessions on the chips.
export async function planForWeek(env,ctx,start){
  const today=localToday();
  let plan=await syncedPlans(env,today).then(p=>p.active).catch(()=>null);
  // Once a week: a past week's key sessions not done, the plan proposes what next (reviewPlan).
  const thisMonday=mondayOfDate(today);
  if(plan&&!plan.pauseFrom&&!(plan.reviewed>=thisMonday)){
    const last=shiftDate(thisMonday,-7);
    const keyDates=await planKeyDates(env,plan,last).catch(()=>[]);
    plan=(await reviewPlan(env.DB,plan,thisMonday,{keyDates,doneDates:await planSportDates(env,plan.sport,last,thisMonday).catch(()=>[])}).catch(()=>({plan}))).plan;
  }
  const pw=plan&&!plan.pauseFrom?planWeek(plan,start):null;
  if(!pw)return {plan:null,pw:null,roles:{},load:null,apply:t=>t};
  // A triathlon plan: the capabilities of each of its sports.
  const tri=plan.sport==='triathlon',capabilitiesOf=()=>tri?Promise.all(planSports(plan.sport).map(s=>getCapabilities(env.DB,s).catch(()=>({})))).then(list=>Object.fromEntries(planSports(plan.sport).map((s,i)=>[s,list[i]]))):getCapabilities(env.DB,plan.sport).catch(()=>({}));
  const [thresholds,capabilities,weight]=await Promise.all([cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>({})),capabilitiesOf(),plan.sport==='ride'||tri?latestStoredWeight(env.DB).catch(()=>null):null]);
  const options={thresholdPace:thresholds.runThresholdPace,hasPower:Number(thresholds.ftp)>0,shifts:capabilities,ftp:Number(thresholds.ftp)||null,weight:weightKg(weight),swimCss:thresholds.swimCss||null};
  return {plan,pw,roles:{quality:planQuality(pw),prefer:tri?'ride':plan.sport},load:planLoad(pw),apply:t=>applyPlan(t,plan,start,options)};
}
// The endurance and the gym plan with the athlete's status applied: sick,
// injured or on a break pauses them, back to training moves them on
// (training-plans.js planPause).
export async function syncedPlans(env,today=localToday()){
  const state=await getAthleteState(env.DB,{date:today}).catch(()=>null);
  const [active,gym]=await Promise.all([activePlan(env.DB,today,{state}),activePlan(env.DB,today,{gym:true,state})]);
  return {active,gym};
}
// Days with an activity of the sport, from (inclusive) to (exclusive).
export async function planSportDates(env,sport,from,to){
  const rows=(await env.DB.prepare("SELECT data_type,source_family,start_time,end_time,payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate')").bind(env.USER_ID,shiftDate(from,-1),shiftDate(to,1)).all()).results||[];
  return [...new Set(rows.map(activityFromRow).filter(a=>a&&planSports(sport).includes(a.kind)&&a.date>=from&&a.date<to&&(a.minutes==null||a.minutes>=15)).map(a=>a.date))];
}
// Minutes of the sport done, from (inclusive) to (exclusive): a plan's result.
export async function planSportMinutes(env,sport,from,to){
  const rows=(await env.DB.prepare("SELECT data_type,source_family,start_time,end_time,payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate')").bind(env.USER_ID,shiftDate(from,-1),shiftDate(to,1)).all()).results||[];
  return dedupeActivities(rows.map(activityFromRow)).filter(a=>a&&planSports(sport).includes(a.kind)&&a.date>=from&&a.date<to).reduce((sum,a)=>sum+(Number(a.minutes)||0),0);
}
// The key days (quality, test, long) the plan put in a week.
export async function planKeyDates(env,plan,monday){
  const pw=planWeek(plan,monday),prefs=pw?await getWeekPlan(env.DB,monday).catch(()=>null):null;
  if(!prefs?.days)return [];
  const roles=planWeekRoles(prefs.days,{quality:planQuality(pw),prefer:plan.sport==='triathlon'?'ride':plan.sport,...roleTime(prefs)});
  return roles.map((d,i)=>d.items.some(x=>planSports(plan.sport).includes(x.sport)&&['quality','long'].includes(x.role))?shiftDate(monday,i):null).filter(Boolean);
}

// The weather place of the week plan and today's forecast for Today (app-today.js
// todayWeather). The forecast is cached for 30 minutes per place and week; a
// failed fetch is not cached. Only for today: past days show no weather.
export async function todayPlace(env,ctx,date){
  try{
    if(date!==localToday())return {location:null,forecast:null};
    const location=(await getWeekPlan(env.DB,date).catch(()=>null))?.location||null;
    if(!location)return {location:null,forecast:null};
    const monday=mondayOfDate(date);
    const week=await cached(env,ctx,'weather:'+location.latitude+','+location.longitude+':'+monday,async()=>{
      const w=await weekWeather(location,monday,env);
      if(!Object.keys(w).length)throw new Error('no forecast');
      return w;
    },{ttl:1800}).catch(()=>({}));
    const hours=await cached(env,ctx,'weather-hours:'+location.latitude+','+location.longitude+':'+date,async()=>{
      const h=await dayHours(location,date,env);
      if(!h.length)throw new Error('no forecast');
      return h;
    },{ttl:1800}).catch(()=>[]);
    // The detail's hours and week, only from Apple Weather.
    const detail=weatherKitConfigured(env)?await cached(env,ctx,'weather-detail:'+location.latitude+','+location.longitude+':'+date,async()=>{
      const d=await weatherKitDetail(env,location,date);
      if(!d.week.length)throw new Error('no forecast');
      return d;
    },{ttl:1800}).catch(()=>null):null;
    return {location,forecast:week?.[date]?{...week[date],hours,...(detail||{})}:null};
  }catch{return {location:null,forecast:null};}
}

// A triathlete's history for the week split (triathlon-split.js): the year per
// sport as the profile suggestions last saved it and the levels chosen by hand.
// Two single-row reads, only for a triathlete; never the activity history again.
export async function triathlonHistory(env){
  const [suggestions,setup]=await Promise.all([
    env.DB.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=2').bind(env.USER_ID).first().catch(()=>null),
    env.DB.prepare('SELECT training_json FROM user_setup WHERE user_id=?').bind(env.USER_ID).first().catch(()=>null)
  ]);
  const parse=t=>{try{return JSON.parse(t||'{}')||{};}catch{return {};}};
  return {year:parse(suggestions?.profile_json).trainingHistory?.sports??null,levels:parse(setup?.training_json).experienceBySport||{}};
}
export async function planningHistory(env,date,days=84){
  const from=shiftDate(date,-days),to=shiftDate(date,1);
  const [rows,gymDays]=await Promise.all([
    env.DB.prepare("SELECT start_time,end_time,payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time").bind(env.USER_ID,from,to).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare('SELECT DISTINCT workout_date FROM strength_sets WHERE user_id=? AND workout_date>=? AND workout_date<?').bind(env.USER_ID,from,to).all().then(r=>r.results||[]).catch(()=>[])
  ]);
  const activities=dedupeActivities(rows.map(activityFromRow)),byDate=new Map();
  for(const a of activities){if(!byDate.has(a.date))byDate.set(a.date,[]);byDate.get(a.date).push({name:a.name,type:a.kind==='strength'?'WeightTraining':a.kind,durationHours:a.minutes==null?null:a.minutes/60,tss:a.tss});}
  for(const g of gymDays){if(!byDate.has(g.workout_date))byDate.set(g.workout_date,[]);if(!byDate.get(g.workout_date).some(a=>a.type==='WeightTraining'))byDate.get(g.workout_date).push({type:'WeightTraining',name:'Gym'});}
  return [...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,completed])=>({date,daily:{training:{completed}}}));
}

// Saved gym plans per day (not cancelled): the name and the exercises in order;
// unpaired: the user unpaired it from that day's lifting session (manual-pairs.js).
export async function trainingGymPlans(env,from,to){
  await ensureGymPlans(env.DB);
  const [plans,cancelled,unpaired]=await Promise.all([
    env.DB.prepare('SELECT workout_date,values_json FROM gym_plans WHERE user_id=? AND workout_date>=? AND workout_date<=?').bind(env.USER_ID,from,to).all(),
    env.DB.prepare('SELECT workout_date FROM gym_plan_cancellations WHERE user_id=? AND workout_date>=? AND workout_date<=?').bind(env.USER_ID,from,to).all(),
    unpairedGymDays(env.DB,env.USER_ID,from,to)
  ]);
  const skip=new Set((cancelled.results||[]).map(r=>r.workout_date)),out={},types=await gymTypes(env.DB,env.USER_ID,from,to).catch(()=>({}));
  for(const r of plans.results||[]){
    if(skip.has(r.workout_date))continue;
    let v=[];try{v=JSON.parse(r.values_json);}catch{}
    const rows=(Array.isArray(v)?v.slice(7):[]).filter(x=>x?.[1]);
    // done: sets per exercise that were ticked off (Hotovo) or have reps written in.
    const isDone=x=>['TRUE','true','1','ANO','ano','✓','☑'].includes(String(x?.[8]??''))||Number(x?.[6])>0,count=list=>list.reduce((m,x)=>{const n=String(x[1]).slice(0,80);m[n]=(m[n]||0)+1;return m;},{});
    if(rows.length)out[r.workout_date]={name:String(v[2]?.[3]||'').slice(0,120),exercises:[...new Set(rows.map(x=>String(x[1]).slice(0,80)))],sets:rows.length,logged:rows.filter(isDone).length,compliance:gymCompliance(rows.map(x=>({type:String(x[0]||'WORK'),exercise:String(x[1]).slice(0,80),plannedKg:x[3],plannedReps:x[4],actualKg:x[5],actualReps:x[6],completed:['TRUE','true','1','ANO','ano','✓','☑'].includes(String(x?.[8]??''))})))?.percent??null,setsBy:count(rows),done:count(rows.filter(isDone)),...(types[r.workout_date]?{type:types[r.workout_date]}:{}),...(unpaired.has(r.workout_date)?{unpaired:true}:{})};
  }
  return out;
}
