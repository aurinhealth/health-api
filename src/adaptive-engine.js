import { trainingStatus } from './training-status.js';
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
function recoveryMetrics(context){
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
  return {score:Math.round(clamp(score,0,100)),sleepMinutes:sleep?.value??null,hrv:hrv?.value??null,hrvBaseline:hrv?.baseline??null,restingHr:rhr?.value??null,restingHrBaseline:rhr?.baseline??null};
}
function calculateLegReadiness(context,recovery){
  let score=recovery.score;
  const tss=n(context?.cycling?.recentRideTss);
  const last48=(context?.cycling?.recentActivities||[]).slice(0,3).reduce((s,x)=>s+n(x.tss),0);
  if(tss>=750) score-=12; else if(tss>=600) score-=7;
  if(last48>=350) score-=8; else if(last48>=250) score-=4;
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
  if(protectLegs) recommendations.push("Sniž objem a náročnost zatížených svalů a uprav načasování vůči klíčovému sportu. Nohy pravidelně posiluj i při cyklistice nebo běhu; sportovní zátěž jejich silový trénink nenahrazuje.");
  else recommendations.push("Recovery a cyklistická zátěž dovolují standardní silový stimul.");
  if(tomorrow?.intensity) recommendations.push("Před další intenzitou drž dnešní trénink technicky čistý a nejezdi zbytečný objem do selhání.");
  if(remaining.protein_g>=30) recommendations.push("V jídelníčku ještě chybí významná část bílkovin; další jídlo směruj hlavně na protein.");
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
