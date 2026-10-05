import { pragueToday } from "./prague-date.js";
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dateKey=v=>String(v||"").slice(0,10);
function daysAgo(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);}
export async function buildWeeklyReview(env,context,date){
  const end=date||context?.date||pragueToday();
  const start=daysAgo(end,6);
  const activities=(context?.cycling?.recentActivities||[]).filter(a=>a.date>=start&&a.date<=end);
  const rides=activities.filter(a=>a.cycling);
  const strength=(context?.strength?.recentCompletedSets||[]).filter(r=>dateKey(r.workout_date)>=start&&dateKey(r.workout_date)<=end&&String(r.type||"WORK").toUpperCase()==="WORK"&&Number(r.completed)===1);
  const byDate=[...new Set(strength.map(r=>dateKey(r.workout_date)).filter(Boolean))];
  // The app's food diary plus ChatGPT's food log entries not linked to it yet.
  const rows=async(sql,...args)=>{try{return (await env.DB.prepare(sql).bind(...args).all()).results||[];}catch{return [];}};
  const food=[
    ...await rows("SELECT consumed_date AS date,kcal AS calories,protein_g,carbs_g,fat_g,'eaten' AS status FROM food_logs WHERE user_id = ? AND consumed_date>=? AND consumed_date<=?",env.USER_ID,start,end),
    ...await rows("SELECT f.date,f.calories,f.protein_g,f.carbs_g,f.fat_g,f.status FROM food_log f WHERE f.user_id = ? AND f.date>=? AND f.date<=? AND NOT EXISTS (SELECT 1 FROM food_logs d WHERE d.user_id=f.user_id AND d.source='food_log:'||f.id)",env.USER_ID,start,end)
  ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const eaten=food.filter(r=>r.status==="eaten");
  const foodDays=[...new Set(eaten.map(r=>r.date))];
  const avg=(arr,key)=>arr.length?Math.round(arr.reduce((s,r)=>s+n(r[key]),0)/arr.length):0;
  const cycling={rides:rides.length,hours:Math.round(rides.reduce((s,r)=>s+n(r.durationHours),0)*100)/100,tss:Math.round(rides.reduce((s,r)=>s+n(r.tss),0)),calories:Math.round(rides.reduce((s,r)=>s+n(r.calories),0))};
  // Sets without an RPE are left out of its average (they are not RPE 0).
  const rated=strength.filter(r=>r.rpe!=null&&r.rpe!==""&&Number(r.rpe)>0);
  const strengthSummary={workouts:byDate.length,completedSets:strength.length,avgRpe:rated.length?Math.round(rated.reduce((s,r)=>s+Number(r.rpe),0)/rated.length*10)/10:null,days:byDate};
  const nutrition={loggedDays:foodDays.length,avgCalories:avg(foodDays.map(d=>({calories:eaten.filter(r=>r.date===d).reduce((s,r)=>s+n(r.calories),0)})),"calories"),avgProtein:avg(foodDays.map(d=>({protein_g:eaten.filter(r=>r.date===d).reduce((s,r)=>s+n(r.protein_g),0)})),"protein_g"),days:foodDays};
  const weight=context?.weightTrend||null;
  const observations=[];
  if(cycling.hours>0) observations.push(`Kolo: ${cycling.hours} h / ${cycling.tss} TSS za 7 dní.`);
  if(strengthSummary.workouts>0) observations.push(`Síla: ${strengthSummary.workouts} tréninků a ${strengthSummary.completedSets} pracovních sérií.`);
  if(nutrition.loggedDays>0) observations.push(`Výživa: zapsáno ${nutrition.loggedDays}/7 dní, průměr ${nutrition.avgCalories} kcal a ${nutrition.avgProtein} g proteinu na zapsaný den.`);
  if(weight?.weeklyRateKg!=null) observations.push(`Trend hmotnosti: ${weight.weeklyRateKg} kg/týden.`);
  return {status:"ok",period:{start,end,days:7},cycling,strength:strengthSummary,nutrition,weightTrend:weight,observations};
}