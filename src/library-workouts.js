// Scheduled library workouts paired with the completed activity, the RPE sent to
// Intervals.icu, and the athlete's recent feedback on library workouts.
import app from "./strength-gateway.js";
import { pendingScheduledWorkouts, hasFeedback, markScheduleCompleted, recordWorkoutFeedback, getWorkout } from "./workout-library.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { L } from "./lang.js";
import { localToday } from "./user-time.js";

// Marks scheduled library workouts as done once Intervals.icu shows the ride.
// Capability only changes with the athlete's own feedback (see calculateCapabilityUpdate).
// The completed activity paired with a scheduled library workout, and how
// much of it was done (time, or training load when both are known).
export async function matchScheduledActivity(env,ctx,internalAuth,link){
  const response=await app.fetch(new Request('https://internal/analysis/daily?date='+link.scheduled_date,{headers:internalAuth}),env,ctx);
  if(!response.ok)return null;const daily=await response.json().catch(()=>({})),matched=daily.training?.matched||[],completed=daily.training?.completed||[];
  const match=matched.find(m=>String(m.planned?.id||'').replace(/^planned:/,'')===String(link.intervals_event_id||'')||String(m.planned?.name||'').trim().toLowerCase()===String(link.name||'').trim().toLowerCase());
  if(!match)return null;
  const actual=completed.find(a=>String(a.id||'')===String(match.actualId||''))||completed.find(a=>a.pairedEventId!=null&&String(a.pairedEventId)===String(link.intervals_event_id||''));
  if(!actual)return null;
  const actualMinutes=Number(actual.durationHours)>0?Number(actual.durationHours)*60:null;
  if(actualMinutes==null)return null;
  const plannedTss=Number(match.planned?.tss),actualTss=Number(actual.tss);
  const ratio=plannedTss>0&&actualTss>0?actualTss/plannedTss:actualMinutes/Math.max(1,Number(link.duration_minutes));
  const rawRpe=actual.rpe??actual.payload?.icu_rpe??actual.payload?.rpe;
  return {actual,activityId:actual.source==='intervals'?String(actual.payload?.id||actual.id||''):null,completedPercent:Math.round(Math.max(0,Math.min(120,ratio*100))),rpe:Number.isFinite(Number(rawRpe))&&Number(rawRpe)>=1&&Number(rawRpe)<=10?Number(rawRpe):null};
}
export async function reconcileWorkoutLibraryCompletions(env,ctx,internalAuth){
  try{
    for(const link of await pendingScheduledWorkouts(env.DB,localToday())){
      if(await hasFeedback(env.DB,link.workout_id,link.scheduled_date)){await markScheduleCompleted(env.DB,link.id);continue}
      const m=await matchScheduledActivity(env,ctx,internalAuth,link);
      if(!m)continue;
      await recordWorkoutFeedback(env.DB,{workoutId:link.workout_id,scheduledDate:link.scheduled_date,completedPercent:m.completedPercent,rpe:m.rpe,survey:"auto_completed",notes:L("Automaticky spárováno s dokončenou aktivitou v Intervals.icu", "Automatically matched with a completed activity in Intervals.icu")});
    }
  }catch(error){console.error("Workout capability reconciliation failed",error)}
}
// RPE on the completed activity in Intervals.icu (whole numbers 1–10).
export async function writeIntervalsRpe(env,activityId,rpe){
  if(!env.INTERVALS_API_KEY||!activityId)return {status:'skipped'};
  try{
    const r=await fetch('https://intervals.icu/api/v1/activity/'+encodeURIComponent(activityId),{method:'PUT',headers:{Authorization:intervalsAuthorization(env.INTERVALS_API_KEY),Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({icu_rpe:Math.round(Number(rpe))}),signal:AbortSignal.timeout(10000)});
    return r.ok?{status:'ok'}:{status:'error',message:L('Intervals.icu odpovědělo HTTP ', 'Intervals.icu answered HTTP ')+r.status};
  }catch(error){return {status:'error',message:error.message}}
}

// The athlete's recent RPE and notes on library workouts, newest first.
export async function recentWorkoutFeedback(db,since,limit=10){
  const rows=(await db.prepare("SELECT scheduled_date,workout_id,sport,rpe,notes,completed_percent FROM workout_feedback WHERE user_id=? AND survey<>'auto_completed' AND scheduled_date>=? ORDER BY scheduled_date DESC,id DESC LIMIT ?").bind(db.userId,since,limit).all().catch(()=>({results:[]}))).results||[];
  const out=[];
  for(const r of rows){const w=await getWorkout(db,r.workout_id).catch(()=>null);out.push({date:r.scheduled_date,workoutId:r.workout_id,name:w?.name||r.workout_id,system:w?.primary_system||null,sport:r.sport,rpe:r.rpe,notes:r.notes||null,completedPercent:r.completed_percent});}
  return out;
}
