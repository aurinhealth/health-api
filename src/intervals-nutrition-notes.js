import { buildStrengthContext } from "./strength-context.js";
import { buildNutritionPlan } from "./nutrition-intelligence.js";
const BASE_URL = "https://intervals.icu/api/v1";
const auth = env => "Basic " + btoa("API_KEY:" + env.INTERVALS_API_KEY);
const addDays = (date, days) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
function note(date,n){
  const f=n.fueling?.plannedRide;
  return [
    "Daily nutrition target — Health & Strength","",
    `Calories: ${n.calorieTarget} kcal`,
    `Protein: ${n.macros.proteinGrams} g`,
    `Carbohydrates: ${n.macros.carbsGrams} g`,
    `Fat: ${n.macros.fatGrams} g`,"",
    `Estimated training calories: ${n.training.estimatedTrainingCalories} kcal`,
    n.training.strengthMinutes ? `Strength: ~${n.training.strengthMinutes} min / ~${n.training.strengthCalories} kcal` : "",
    n.training.cyclingTrainingCalories ? `Cycling: ~${n.training.cyclingTrainingCalories} kcal` : "",
    f ? `Ride fueling: ${f.carbsDuringRideGrams} g during (${f.carbsPerHourGrams} g/h), ~${f.fluidMl} ml fluid` : "",
    f?.preRideCarbsGrams ? `Pre-ride carbs: ~${f.preRideCarbsGrams} g` : "",
    "",`Day type: ${n.dayType}`
  ].filter(Boolean).join("\n");
}
export async function syncDailyNutritionNotes(env, options={}){
  const oldest=String(options.oldest), newest=String(options.newest||oldest);
  let weightKg=Number(options.weightKg); if(!Number.isFinite(weightKg)||weightKg<=0) weightKg=88;
  const events=[]; let date=oldest;
  while(date<=newest){
    const context=await buildStrengthContext(env,date);
    if(context.status!=="ok") throw new Error(`Strength context not ready for ${date}`);
    const nutrition=buildNutritionPlan(context,{weightKg});
    events.push({external_id:`health-nutrition-${date}`,category:"NOTE",start_date_local:`${date}T00:00:00`,name:`Nutrition — ${date}`,description:note(date,nutrition)});
    date=addDays(date,1);
  }
  const results=[];
  for (const event of events) {
    const r=await fetch(`${BASE_URL}/athlete/0/events`,{method:"POST",headers:{Authorization:auth(env),"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(event)});
    const t=await r.text(); let data; try{data=JSON.parse(t)}catch{data=t}
    if(!r.ok) throw new Error(`Intervals.icu HTTP ${r.status}: ${JSON.stringify(data)}`);
    results.push({id:data?.id ?? null,date:data?.start_date_local ?? event.start_date_local,name:data?.name ?? event.name});
  }
  return {status:"ok",oldest,newest,weightKg,updatedCount:results.length,events:results};
}
