import core from "./v323fix.js";
import { getCookbook } from "./cookbook.js";

const VERSION = "final-5-cookbook-v4.0.0";
const TZ = "Europe/Prague";
const DEFICIT = 550;
const MIN_TARGET = 2000;
const MAX_TARGET = 3200;
const PROTEIN_PER_KG = 2.0;
const FAT_PER_KG = 0.8;
const ENDURANCE_CARB_PER_KG = 5.0;
const TRAINING_CARB_PER_KG = 4.0;
const REST_CARB_PER_KG = 3.0;
const PRE_RIDE_CARB_PER_KG = 1.0;
const POST_RIDE_CARB_PER_KG = 1.0;
const POST_RIDE_PROTEIN_PER_KG = 0.3;

function localDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); }
function n(v, d=0) { const x=Number(v); return Number.isFinite(x)?x:d; }
function round(v,p=0){ const m=10**p; return Math.round(n(v)*m)/m; }
function durationHours(p){
  const active=String(p?.exercise?.activeDuration||"").match(/([0-9.]+)s/i);
  if(active){const x=n(active[1]); if(x>0) return x/3600;}
  for(const k of ["duration","duration_seconds","moving_time","elapsed_time"]){let x=n(p?.[k]); if(x>0){if(x>1000)x/=3600; if(x>12)x/=3600; return x;}}
  return null;
}
function textFor(p){return `${p?.type||""} ${p?.activity_type||""} ${p?.category||""} ${p?.name||p?.title||""} ${p?.description||""} ${p?.exercise?.exerciseType||""} ${p?.exercise?.displayName||""}`.toLowerCase();}
function isRide(p){return /\b(ride|bike|cycling|cycle|gravel|mountain bike|mtb|road cycling|indoor cycling)\b/.test(textFor(p));}
function isIntensity(p){return /(tempo|sweet spot|threshold|interval|intervals|vo2|vo2max|sprint|anaerobic|over-under|over under|race|race pace|ftp)/.test(textFor(p));}
function recipeMinutes(r){return n(String(r?.time||"").match(/\d+/)?.[0],60);}
function calories(r){return n(r?.kcal);}
function macros(r){return {protein_g:n(r?.protein_g),carbs_g:n(r?.carbs_g),fat_g:n(r?.fat_g)};}

async function rowsForDate(env,date,type){
  if(type !== "activity"){
    return (await env.DB.prepare(`SELECT source_family,external_id,start_time,end_time,payload_json FROM health_datapoints WHERE source_family='intervals' AND data_type='planned-workout' AND start_time LIKE ? ORDER BY start_time`).bind(date+"%").all()).results||[];
  }
  const intervals=(await env.DB.prepare(`SELECT source_family,external_id,start_time,end_time,payload_json FROM health_datapoints WHERE source_family='intervals' AND data_type='activity' AND start_time LIKE ? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time`).bind(date+"%").all()).results||[];
  const google=(await env.DB.prepare(`SELECT source_family,external_id,start_time,end_time,payload_json FROM health_datapoints WHERE source_family='google-wearables' AND data_type='exercise' AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time DESC LIMIT 200`).all()).results||[];
  const googleForDate=google.filter(row=>{
    try{
      const p=JSON.parse(row.payload_json||"{}"), i=p.exercise?.interval||p.interval||{};
      return String(i.startTime||i.civilStartTime||row.start_time||"").slice(0,10)===date;
    }catch{return false}
  });
  return [...intervals,...googleForDate];
}
async function weightInfo(env,date){
  const latest=await env.DB.prepare(`SELECT value_numeric,sample_time FROM health_datapoints WHERE data_type='weight' AND value_numeric IS NOT NULL ORDER BY sample_time DESC,id DESC LIMIT 1`).first();
  const windows={7:[],14:[],28:[]};
  for(const [days,arr] of Object.entries(windows)){
    const since=new Date(`${date}T00:00:00+02:00`); since.setDate(since.getDate()-Number(days)+1);
    const r=await env.DB.prepare(`SELECT value_numeric,sample_time FROM health_datapoints WHERE data_type='weight' AND value_numeric IS NOT NULL AND sample_time>=? AND sample_time<=? ORDER BY sample_time`).bind(since.toISOString(),`${date}T23:59:59+02:00`).all();
    arr.push(...(r.results||[]));
  }
  const avg=a=>a.length? a.reduce((s,x)=>s+n(x.value_numeric),0)/a.length:null;
  const a7=avg(windows[7]),a14=avg(windows[14]),a28=avg(windows[28]);
  const firstLast=(a)=>a.length>=2?{first:n(a[0].value_numeric),last:n(a[a.length-1].value_numeric),delta:round(n(a[a.length-1].value_numeric)-n(a[0].value_numeric),2)}:null;
  const trend14=firstLast(windows[14]);
  return {current:latest? n(latest.value_numeric):null, currentAt:latest?.sample_time||null, averages:{days7:round(a7,2),days14:round(a14,2),days28:round(a28,2)},trend14kg:trend14?.delta??null,samples:{days7:windows[7].length,days14:windows[14].length,days28:windows[28].length}};
}

function desiredWeightAdjustment(weight,trendKg){
  if(!weight || trendKg==null) return {kcal:0,reason:"nedostatek dat pro adaptaci"};
  const weekly=trendKg/2;
  const pct=Math.abs(weekly)/weight;
  if(weekly > 0.25) return {kcal:-100,reason:"14denní trend ukazuje příliš rychlý nárůst hmotnosti"};
  if(weekly < -0.9 || pct > 0.009) return {kcal:100,reason:"14denní trend ukazuje příliš rychlý pokles hmotnosti"};
  return {kcal:0,reason:"trend hmotnosti je v rozumném pásmu"};
}
function activityCalories(row){const p=JSON.parse(row.payload_json||"{}"); return n(p.calories_kcal ?? p.calories ?? p.icu_calories ?? p.exercise?.metricsSummary?.caloriesKcal ?? row.value_numeric);}
function activityObject(row){const p=JSON.parse(row.payload_json||"{}");const e=p.exercise||{};return {id:row.external_id,source:row.source_family,start:row.start_time||e.interval?.startTime,end:row.end_time||e.interval?.endTime,type:p.type||p.category||e.exerciseType||"Unknown",name:p.name||p.title||e.displayName||e.exerciseType||"",calories:activityCalories(row),durationHours:durationHours(p),tss:n(p.tss??p.icu_training_load??p.training_load),pairedEventId:p.paired_event_id||p.pairedEventId||p.event_id||p.eventId||null,cycling:isRide(p),intensity:isIntensity(p),payload:p};}
function plannedObject(row){const p=JSON.parse(row.payload_json||"{}");const d=durationHours(p);const name=String(p.name||p.title||"").trim();const type=String(p.type||p.activity_type||p.category||"").trim();if(/^nutrition\s*[—-]/i.test(name)||/^nutrition$/i.test(type))return null;if((/^weekly$/i.test(name)||/^weekly$/i.test(type))&&!d&&!Number(p.tss??p.icu_training_load??p.planned_tss))return null;return {id:row.external_id,start:row.start_time||p.start_date_local||p.start_date,end:row.end_time||p.end_date_local||p.end_date,type,name,durationHours:d,tss:n(p.tss??p.icu_training_load??p.planned_tss),cycling:isRide(p),intensity:isIntensity(p),enduranceOnly:isRide(p)&&!isIntensity(p),payload:p};}

async function training(env,date){
  const [ar,pr]=await Promise.all([rowsForDate(env,date,"activity"),rowsForDate(env,date,"planned")]);
  const actualAll=ar.map(activityObject);
  const actual=[];
  for(const a of actualAll){
    const duplicate=actual.some(x=>{
      if(!x.start||!a.start) return false;
      const dt=Math.abs(new Date(x.start).getTime()-new Date(a.start).getTime())/60000;
      return dt<=20 && x.source==="intervals" && a.source==="google-wearables";
    });
    if(!duplicate) actual.push(a);
  }
  const plannedRaw=pr.map(plannedObject).filter(Boolean);
  const planned=[];
  const plannedKeys=new Set();
  for(const p of plannedRaw){
    const key=String(p.start||"").slice(0,10)+"|"+String(p.name||"").toLowerCase()+"|"+Math.round(Number(p.durationHours||0)*100);
    if(plannedKeys.has(key)) continue;
    plannedKeys.add(key); planned.push(p);
  }
  const paired=new Set(actual.flatMap(a=>{const p=a.payload||{};return [p.paired_event_id,p.pairedEventId,p.event_id,p.eventId,p.paired_activity_id,p.pairedActivityId].filter(Boolean).map(String)}));
  const unmatched=planned.filter(p=>{
    if(paired.has(String(p.id))) return false;
    return !actual.some(a=>{
      if(!a.start||!p.start) return false;
      const dt=Math.abs(new Date(a.start).getTime()-new Date(p.start).getTime())/60000;
      if(dt>20) return false;
      const aName=(String(a.name||"")+" "+String(a.type||"")).toLowerCase();
      const pName=(String(p.name||"")+" "+String(p.type||"")).toLowerCase();
      const token=(pName.match(/[a-z0-9áéěíóúůýčďňřšťž]+/gi)||[]).find(t=>t.length>=5);
      const nameMatch=token?aName.includes(token):false;
      const typeMatch=String(p.type||"").toLowerCase()===String(a.type||"").toLowerCase();
      const da=Number(a.durationHours||0),dp=Number(p.durationHours||0);
      const durMatch=!da||!dp||Math.abs(da-dp)/Math.max(da,dp)<0.25;
      return (nameMatch||typeMatch)&&durMatch;
    });
  });
  const rides=actual.filter(x=>x.cycling), plannedRides=unmatched.filter(x=>x.cycling);
  const latest=rides.filter(x=>x.end).sort((a,b)=>new Date(b.end)-new Date(a.end))[0]||null;
  const hoursSince=latest?.end?Math.max(0,(Date.now()-new Date(latest.end).getTime())/3600000):null;
  return {actual,planned,unmatched,rides,plannedRides,actualRideCalories:rides.reduce((s,x)=>s+x.calories,0),plannedRideHours:round(plannedRides.reduce((s,x)=>s+n(x.durationHours),0),2),postRide:Boolean(latest&&hoursSince!=null&&hoursSince<=2.5),latestRideEnd:latest?.end||null,hoursSinceRide:hoursSince==null?null:round(hoursSince,2)};
}
function targetFromEnergy(energy,adjustment){const base=n(energy?.final?.calorieTarget,2900);return Math.max(MIN_TARGET,Math.min(MAX_TARGET,Math.round(base+adjustment)));}
function macroTargets(weight,target,ctx){const kg=weight||85.8;const p=Math.round(kg*PROTEIN_PER_KG),f=Math.round(kg*FAT_PER_KG);const ckg=ctx.endurance?ENDURANCE_CARB_PER_KG:ctx.training?TRAINING_CARB_PER_KG:REST_CARB_PER_KG;const floor=Math.round(kg*ckg);const derived=Math.round(Math.max(0,(target-p*4-f*9)/4));return {protein_g:p,carbs_g:Math.max(floor,derived),fat_g:f};}
function score(r,need,ctx,slot){const m=macros(r),k=calories(r);if(!k)return -1e6;let s=0;if(need.kcal>0){const ratio=k/need.kcal;s+=50-Math.abs(1-ratio)*50;if(k<=need.kcal)s+=20;else s-=Math.min(70,(k-need.kcal)*.35);}else s-=Math.min(100,k*.5);const fatEx=Math.max(0,m.fat_g-need.fat_g);s-=Math.min(55,fatEx*1.8);if(need.carbs_g>0)s+=Math.min(ctx.endurance?35:24,(m.carbs_g/need.carbs_g)*(ctx.endurance?35:24));if(need.protein_g>0)s+=Math.min(20,(m.protein_g/need.protein_g)*20);if(slot==="pre")s+=m.carbs_g*0.35;if(slot==="post")s+=m.carbs_g*0.35+m.protein_g*0.2;if(r.meal_prep)s+=4;if(r.level==="Easy")s+=3;return s;}
function pickRecipes(cookbook,need,ctx,slot,count=3){return cookbook.filter(r=>calories(r)>0).map(r=>({...r,_score:score(r,need,ctx,slot)})).sort((a,b)=>b._score-a._score).slice(0,count).map(({_score,...r})=>({...r,recommendation_score:round(_score,1),slot}));}
async function foodTotals(env,date){const r=await env.DB.prepare(`SELECT COALESCE(SUM(kcal),0) kcal,COALESCE(SUM(protein_g),0) protein_g,COALESCE(SUM(carbs_g),0) carbs_g,COALESCE(SUM(fat_g),0) fat_g,COALESCE(SUM(fiber_g),0) fiber_g FROM food_logs WHERE consumed_date=?`).bind(date).first();return {kcal:n(r?.kcal),protein_g:n(r?.protein_g),carbs_g:n(r?.carbs_g),fat_g:n(r?.fat_g),fiber_g:n(r?.fiber_g)};}

async function dayPlan(env,url){
  const date=url.searchParams.get("date")||localDate();
  const [energyResp,food,ctx,weight]=await Promise.all([core.fetch(new Request(new URL(`/analysis/energy?date=${encodeURIComponent(date)}`,url)),env),foodTotals(env,date),training(env,date),weightInfo(env,date)]);
  const energy=await energyResp.json();const adapt=desiredWeightAdjustment(weight.current,weight.trend14kg);const target=targetFromEnergy(energy,adapt.kcal);const context={endurance:ctx.rides.length>0||ctx.plannedRides.length>0,training:ctx.actual.length>0||ctx.unmatched.length>0,postRide:ctx.postRide};const macrosTarget=macroTargets(weight.current,target,context);const remaining={kcal:Math.max(0,target-food.kcal),protein_g:Math.max(0,macrosTarget.protein_g-food.protein_g),carbs_g:Math.max(0,macrosTarget.carbs_g-food.carbs_g),fat_g:Math.max(0,macrosTarget.fat_g-food.fat_g)};
  const cookbookData=await getCookbook();const cookbook=Array.isArray(cookbookData)?cookbookData:(cookbookData?.recipes||[]);const rideHours=ctx.rides.reduce((s,x)=>s+n(x.durationHours),0)+ctx.plannedRides.reduce((s,x)=>s+n(x.durationHours),0);
  let fueling=null;if(rideHours>=1){const carbsPerHour=rideHours>=3?75:rideHours>=1.5?60:40;fueling={carbs_g_per_hour:carbsPerHour,ride_hours:round(rideHours,2),during_ride_carbs_g:round(carbsPerHour*rideHours),guidance:rideHours>=1.5?"U delší jízdy rozlož sacharidy průběžně; nezačínej dohánět energii až po jízdě.":"Na kratší jízdě stačí lehčí fueling podle intenzity a pocitu."};}
  const kg=weight.current||85.8;const pre=rideHours>=1?{carbs_g:Math.round(kg*PRE_RIDE_CARB_PER_KG),window:"1–3 h před jízdou"}:null;const post=ctx.postRide?{carbs_g:Math.round(kg*POST_RIDE_CARB_PER_KG),protein_g:Math.round(kg*POST_RIDE_PROTEIN_PER_KG),window:"během 0–2,5 h po jízdě"}:null;const meals=[];
  if(pre) meals.push({type:"pre_ride",target:{kcal:Math.round(Math.min(remaining.kcal,pre.carbs_g*4+150)),carbs_g:pre.carbs_g},recommendations:pickRecipes(cookbook,{...remaining,kcal:Math.min(remaining.kcal,pre.carbs_g*4+150),carbs_g:Math.max(remaining.carbs_g,pre.carbs_g),fat_g:Math.min(remaining.fat_g,15)},context,"pre",3)});
  if(post) meals.push({type:"post_ride",target:post,recommendations:pickRecipes(cookbook,{...remaining,kcal:Math.min(remaining.kcal,post.carbs_g*4+post.protein_g*4+150),carbs_g:Math.max(remaining.carbs_g,post.carbs_g),protein_g:Math.max(remaining.protein_g,post.protein_g),fat_g:Math.min(remaining.fat_g,20)},context,"post",3)});
  meals.push({type:"main_meal",recommendations:pickRecipes(cookbook,remaining,context,"main",rideHours>=1?4:3)});
  return Response.json({status:"ok",version:VERSION,date,energy:{...energy.final,adaptiveAdjustmentKcal:adapt.kcal},weight,trainingContext:ctx,foodTotals:food,targets:{calories:target,...macrosTarget},remaining,preRide:pre,duringRide:fueling,postRide:post,meals,coaching:[adapt.reason,ctx.postRide?"Jsi krátce po jízdě: priorita jsou sacharidy + protein.":ctx.plannedRides.length?"Jízda je zatím plánovaná: po dokončení se odhad nahradí skutečným výdejem.":"Bez jízdy není potřeba navyšovat sacharidy jen kvůli tréninku."]});
}

async function adaptiveEnergy(env,url){const date=url.searchParams.get("date")||localDate();const baseResp=await core.fetch(new Request(new URL(`/analysis/energy?date=${encodeURIComponent(date)}`,url)),env);const data=await baseResp.json();const weight=await weightInfo(env,date);const adapt=desiredWeightAdjustment(weight.current,weight.trend14kg);const base=n(data.final?.calorieTarget,2900);const target=Math.max(MIN_TARGET,Math.min(MAX_TARGET,Math.round(base+adapt.kcal)));return Response.json({...data,version:VERSION,final:{...data.final,calorieTarget:target,adaptiveAdjustmentKcal:adapt.kcal},weightTrend:weight,adaptiveCoaching:adapt.reason});}

export default {async scheduled(controller,env,ctx){return core.scheduled(controller,env,ctx);},async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==="/")return Response.json({status:"ok",service:"health-api",version:VERSION});if(url.pathname==="/analysis/day-plan"||url.pathname==="/food/day-plan")return dayPlan(env,url);if(url.pathname==="/analysis/energy")return adaptiveEnergy(env,url);return core.fetch(request,env,ctx);}};
