const key=v=>String(v||'').slice(0,10);
const age=(a,b)=>(Date.parse(key(b)+'T12:00:00Z')-Date.parse(key(a)+'T12:00:00Z'))/86400000;
// Other sports affect the dose; only completed gym sets count as strength coverage.
export function sportMuscleLoad(context){
  const activities=[...(context?.sports?.recentActivities||[]),...(context?.cycling?.recentActivities||[])],seen=new Set(),load=new Map();
  for(const a of activities){
    const identity=a.id||[a.start||a.date,a.type,a.name].join('|');if(seen.has(identity))continue;seen.add(identity);
    const days=age(a.date||a.start,context.date);if(!Number.isFinite(days)||days<0||days>3)continue;
    const type=String((a.type||'')+' '+(a.name||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    let muscles=[];
    if(/ride|cycl|bike|run|hike|walk|beh|kolo/.test(type))muscles=['quads','hamstrings','glutes','calves'];
    else if(/climb|boulder|horolez/.test(type))muscles=['back','lats','upper_back','biceps','forearms','core','abs'];
    else if(/swim|plav/.test(type))muscles=['back','lats','upper_back','shoulders','front_delts','side_delts','chest'];
    else if(/row|vesl/.test(type))muscles=['quads','hamstrings','back','upper_back','lats','biceps'];
    if(!muscles.length)continue;
    const minutes=Number(a.durationHours)*60||Number(a.durationMinutes)||Number(a.moving_time)/60||0;
    const dose=Math.min(2,Math.max(Number(a.tss)/80||0,minutes/90))*(days<=1?1:.5);
    for(const muscle of muscles)load.set(muscle,Math.min(3,(load.get(muscle)||0)+dose));
  }
  return load;
}
export function strengthCoverage(context,catalog){
  const last={},sets={};
  for(const row of context?.strength?.recentCompletedSets||[]){
    if(String(row.type||'WORK').toUpperCase()!=='WORK'||row.planned||row.completed===false||row.completed===0)continue;
    const muscle=catalog[row.exercise]?.muscle,days=age(row.workout_date,context.date);if(!muscle||!Number.isFinite(days)||days<0||days>14)continue;
    const date=key(row.workout_date);if(!last[muscle]||date>last[muscle])last[muscle]=date;
    if(days<=7)sets[muscle]=(sets[muscle]||0)+1;
  }
  return {lastStrengthDateByMuscle:last,setsLast7Days:sets,undertrainedMuscles:['quads','hamstrings','chest','back'].filter(m=>!sets[m])};
}
