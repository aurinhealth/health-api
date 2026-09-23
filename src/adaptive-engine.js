const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function latestRecovery(recovery,keyMatchers){
  let best=null;
  for(const [key,value] of Object.entries(recovery||{})){
    const k=String(key).toLowerCase();
    if(!keyMatchers.some(m=>k.includes(m))) continue;
    const arr=Array.isArray(value)?value:[];
    for(const row of arr){
      const t=String(row.sampleTime||row.startTime||"");
      const v=n(row.value??row.minutes??row.durationMinutes,NaN);
      if(!Number.isFinite(v)) continue;
      if(!best||t>best.time) best={value:v,time:t,unit:row.unit||null};
    }
  }
  return best;
}
function recoveryMetrics(context){
  const sleep=latestRecovery(context?.recovery,["sleep"]);
  const hrv=latestRecovery(context?.recovery,["hrv","heart_rate_variability"]);
  const rhr=latestRecovery(context?.recovery,["resting","heart_rate"]);
  let score=100;
  if(sleep?.value!=null){ if(sleep.value<330) score-=18; else if(sleep.value<390) score-=8; else if(sleep.value>=450) score+=3; }
  if(hrv?.value!=null){ if(hrv.value<70) score-=10; else if(hrv.value<85) score-=5; }
  if(rhr?.value!=null){ if(rhr.value>=60) score-=10; else if(rhr.value>=55) score-=5; }
  const tss=n(context?.cycling?.recentRideTss), hours=n(context?.cycling?.recentRideHours);
  if(tss>=900) score-=10; else if(tss>=750) score-=6; else if(tss>=600) score-=3;
  if(hours>=12) score-=5; else if(hours>=9) score-=3;
  const hard=(context?.cycling?.recentActivities||[]).slice(0,4).filter(x=>x?.intensity).length;
  if(hard>=3) score-=7; else if(hard>=2) score-=4;
  return {score:Math.round(clamp(score,0,100)),sleepMinutes:sleep?.value??null,hrv:hrv?.value??null,restingHr:rhr?.value??null};
}
function legReadiness(context,recovery){
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
  const recovery=recoveryMetrics(context);
  const legReadiness=legReadiness(context,recovery);
  const next=context?.cycling?.nextRide||null;
  const upcoming=(context?.cycling?.plannedWorkouts||[]).slice(0,3);
  const nextHard=!!next?.intensity;
  const nextLong=n(next?.durationHours)>=2.5;
  const protectLegs=legReadiness<70||nextHard||nextLong;
  const volumeModifier=recovery.score<55?0.75:recovery.score<70?0.85:recovery.score<82?0.95:recovery.score>=92?1.05:1;
  const strengthPriority=protectLegs?"upper_or_recovery":"normal_strength";
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
  if(protectLegs) recommendations.push("Chraň dnes nohy před vysokým silovým objemem; preferuj upper body nebo lehčí lower-body variantu.");
  else recommendations.push("Recovery a cyklistická zátěž dovolují standardní silový stimul.");
  if(tomorrow?.intensity) recommendations.push("Před další intenzitou drž dnešní trénink technicky čistý a nejezdi zbytečný objem do selhání.");
  if(remaining.protein_g>=30) recommendations.push("V jídelníčku ještě chybí významná část bílkovin; další jídlo směruj hlavně na protein.");
  return {
    status:"ok",
    date:context?.date||null,
    recovery,
    legReadiness,
    protectLegs,
    strengthPriority,
    strengthVolumeModifier:volumeModifier,
    nextRide:next,
    upcomingCycling:upcoming,
    nutrition:{remaining},
    recommendations
  };
}
export { recoveryMetrics, legReadiness };