import { L } from './lang.js';
import { trainingStatus } from './training-status.js';
import { readinessFor } from './readiness.js';
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function latestRecovery(recovery,keyMatchers){
  let best=null;
  for(const [key,value] of Object.entries(recovery||{})){
    // Google Health types use hyphens ("daily-heart-rate-variability").
    const k=String(key).toLowerCase().replace(/-/g,"_");
    if(!keyMatchers.some(m=>k.includes(m))) continue;
    const arr=Array.isArray(value)?value:[];
    for(const row of arr){
      const t=String(row.sampleTime||row.startTime||"");
      const v=n(row.value??row.minutes??row.durationMinutes,NaN);
      if(!Number.isFinite(v)) continue;
      if(!best||t>best.time) best={value:v,time:t,unit:row.unit||null,baseline:Number(row.baseline)>0?Number(row.baseline):null};
    }
  }
  return best;
}
// Recovery is the shared model the dashboard shows (src/recovery-model.js):
// HRV, resting HR and sleep against the athlete's 60-day baseline. Training
// load is not part of it; the leg readiness adds it. Without a baseline the
// older rule set below fills in.
function recoveryMetrics(context){
  const rows=context?.wellnessSeries,sleep=latestRecovery(context?.recovery,["sleep"]);
  if(Array.isArray(rows)&&rows.length&&context?.date){
    // The same readiness and inputs as Today (readiness.js): the night, the
    // sleep need with the sleep goal and the day before's strain, the check-in.
    const sessions=Array.isArray(context.sleepSessions)?context.sleepSessions:[];
    const r=readinessFor({date:context.date,rows,sessions,profile:context.profile,checkin:context.checkin});
    const night=r.night,sleepNeed=r.need.need;
    if(r.score!=null)return {score:r.score,zone:r.zone,model:"shared",flags:r.flags,provisional:!!r.provisional,sleepNeed,sleepMinutes:night?.durationMin??sleep?.value??null,hrv:r.components.hrv?.value??null,hrvBaseline:r.components.hrv?Math.round(r.components.hrv.baseline*10)/10:null,restingHr:r.components.restingHR?.value??null,restingHrBaseline:r.components.restingHR?Math.round(r.components.restingHR.baseline*10)/10:null};
  }
  const legacy=legacyRecoveryMetrics(context),cap={tired:60,sick:25}[context?.checkin];
  return cap!=null?{...legacy,score:Math.min(legacy.score,cap)}:legacy;
}
function legacyRecoveryMetrics(context){
  const sleep=latestRecovery(context?.recovery,["sleep"]);
  const hrv=latestRecovery(context?.recovery,["hrv","heart_rate_variability"]);
  const rhr=latestRecovery(context?.recovery,["resting"]);
  let score=100;
  if(sleep?.value!=null){ if(sleep.value<330) score-=18; else if(sleep.value<390) score-=8; else if(sleep.value>=450) score+=3; }
  // Against the athlete's own 4-week average; without it a single value says
  // nothing (an HRV of 45 is normal for one athlete and low for another).
  if(hrv?.value!=null&&hrv.baseline){ const drop=1-hrv.value/hrv.baseline; if(drop>=.2) score-=15; else if(drop>=.1) score-=7; }
  if(rhr?.value!=null&&rhr.baseline){ const rise=rhr.value-rhr.baseline; if(rise>=7) score-=12; else if(rise>=4) score-=6; }
  const tss=n(context?.cycling?.recentRideTss), hours=n(context?.cycling?.recentRideHours);
  if(tss>=900) score-=10; else if(tss>=750) score-=6; else if(tss>=600) score-=3;
  if(hours>=12) score-=5; else if(hours>=9) score-=3;
  const hard=(context?.cycling?.recentActivities||[]).slice(0,4).filter(x=>x?.intensity).length;
  if(hard>=3) score-=7; else if(hard>=2) score-=4;
  return {score:Math.round(clamp(score,0,100)),model:"legacy",sleepMinutes:sleep?.value??null,hrv:hrv?.value??null,hrvBaseline:hrv?.baseline??null,restingHr:rhr?.value??null,restingHrBaseline:rhr?.baseline??null};
}
function calculateLegReadiness(context,recovery){
  let score=recovery.score;
  const tss=n(context?.cycling?.recentRideTss);
  const last48=(context?.cycling?.recentActivities||[]).slice(0,3).reduce((s,x)=>s+n(x.tss),0);
  if(tss>=750) score-=12; else if(tss>=600) score-=7;
  if(last48>=350) score-=8; else if(last48>=250) score-=4;
  // The shared recovery holds no training load, so the recent volume and
  // hard sessions count here (the legacy score already includes them).
  if(recovery.model==="shared"){
    const hours=n(context?.cycling?.recentRideHours),hard=(context?.cycling?.recentActivities||[]).slice(0,4).filter(x=>x?.intensity).length;
    if(hours>=12) score-=5; else if(hours>=9) score-=3;
    if(hard>=3) score-=7; else if(hard>=2) score-=4;
  }
  const next=context?.cycling?.nextRide;
  if(next?.intensity) score-=12;
  if(n(next?.durationHours)>=2.5) score-=10;
  return Math.round(clamp(score,0,100));
}
export function buildAdaptiveDecision(context,food=null){
  const policy=trainingStatus(context?.athleteState);
  const recovery=recoveryMetrics(context);
  const legReadiness=calculateLegReadiness(context,recovery);
  const next=context?.cycling?.nextRide||null;
  const upcoming=(context?.cycling?.plannedWorkouts||[]).slice(0,3);
  const nextHard=!!next?.intensity;
  const nextLong=n(next?.durationHours)>=2.5;
  const protectLegs=legReadiness<70||nextHard||nextLong;
  const volumeModifier=recovery.score<55?0.75:recovery.score<70?0.85:recovery.score<82?0.95:recovery.score>=92?1.05:1;
  const strengthPriority=protectLegs?"balanced_reduced":"normal_strength";
  const foodTotals=food?.totals?.eaten||{};
  const target=food?.nutritionTarget||{};
  const remaining={
    calories:Math.max(0,n(target.calorieTarget)-n(foodTotals.calories)),
    protein_g:Math.max(0,n(target?.macros?.proteinGrams)-n(foodTotals.protein_g)),
    carbs_g:Math.max(0,n(target?.macros?.carbsGrams)-n(foodTotals.carbs_g)),
    fat_g:Math.max(0,n(target?.macros?.fatGrams)-n(foodTotals.fat_g))
  };
  const tomorrow=upcoming[0]||null;
  const recommendations=[];
  if(protectLegs) recommendations.push(L("Sniž objem a náročnost zatížených svalů a uprav načasování vůči klíčovému sportu. Nohy pravidelně posiluj i při cyklistice nebo běhu; sportovní zátěž jejich silový trénink nenahrazuje.", "Reduce the volume and difficulty for the loaded muscles and adjust the timing around your key sport. Keep training your legs regularly even while cycling or running; sport load doesn't replace their strength training."));
  else recommendations.push(L("Recovery a cyklistická zátěž dovolují standardní silový stimul.", "Recovery and cycling load allow a standard strength stimulus."));
  if(tomorrow?.intensity) recommendations.push(L("Před další intenzitou drž dnešní trénink technicky čistý a nejezdi zbytečný objem do selhání.", "Before the next intensity, keep today's workout technically clean and avoid unnecessary volume to failure."));
  if(remaining.protein_g>=30) recommendations.push(L("V jídelníčku ještě chybí významná část bílkovin; další jídlo směruj hlavně na protein.", "Your food log is still missing a big part of your protein; make your next meal mainly about protein."));
  return {
    status:"ok",
    date:context?.date||null,
    recovery,
    legReadiness,
    protectLegs,
    athleteState:policy,
    strengthPriority:policy.paused?'rest':strengthPriority,
    strengthVolumeModifier:policy.paused?0:volumeModifier,
    nextRide:policy.paused?null:next,
    upcomingCycling:policy.paused?[]:upcoming,
    nutrition:{remaining},
    recommendations:policy.paused?policy.guidance:recommendations
  };
}
export { recoveryMetrics, calculateLegReadiness };
