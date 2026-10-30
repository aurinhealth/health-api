// Measured history and conservative starting templates are separate inputs.
import { L } from './lang.js';
import {activityFromRow,dedupeActivities} from './coach-reflection.js';
import {POOL_LENGTHS} from './training-zones.js';
import {localToday} from './user-time.js';
import {latestStoredWeight} from './athlete-weight.js';
import {yearBySport} from './triathlon-split.js';
const DAY=86400000;
export const TRAINING_REFERENCES=[
  {name:'WHO 2020: 150–300 min střední intenzity týdně; síla alespoň 2 dny',url:'https://doi.org/10.1136/bjsports-2020-102955'},
  {name:'ACSM: postupná progrese silového tréninku podle zkušeností',url:'https://doi.org/10.1249/MSS.0b013e3181915670'}
];
export const EXPERIENCE_LEVELS=['beginner','regular','experienced'];
export const EXPERIENCE_SPORTS=['strength','ride','run','swim'];
const EXPERIENCE_DAYS=730;
// Per-sport experience (gym, cycling, running) from up to two years of history.
// It counts months with training (>=4 sessions of that sport), never how recent
// they are, so a pause for illness or injury does not lower the level.
// The thresholds are approximate rules of thumb, not exact classifications:
// - Strength: bodyweight ratios of the estimated 1RM (Epley: kg*(1+reps/30)) after
//   the strength standards of ExRx.net (https://exrx.net/Testing/WeightLifting/StrengthStandards)
//   and Symmetric Strength (https://symmetricstrength.com): roughly "novice/intermediate"
//   at squat 1.0x / bench 0.75x, "advanced" at squat 1.5x / bench 1.1x / deadlift 1.8x.
// - Cycling: FTP of 3.5 W/kg sits around "moderate/good" (Cat 3-4) in Coggan's power
//   profile (Allen & Coggan, Training and Racing with a Power Meter, 3rd ed.).
// - Running: threshold pace faster than 4:45/km (about a 47-48 min 10 km) and >30 km a
//   week are app rules of thumb for trained recreational runners.
// Another sport raises a level by at most one step (general fitness carries over,
// technique and loading tolerance do not).
const LIFT={squat:/^barbell (back |front )?squat$/i,bench:/^barbell bench press$/i,deadlift:/^(barbell |trap bar |conventional |sumo )?deadlift$/i};
export const epley1rm=(kg,reps)=>Number(kg)>0&&Number(reps)>=1&&Number(reps)<=12?Number(kg)*(1+(Number(reps)===1?0:Number(reps)/30)):null;
export function sportExperience({activities=[],strengthSets=[],weightKg=null,ftp=null,runThresholdPace=null}={}){
  const rank=l=>EXPERIENCE_LEVELS.indexOf(l),max=(a,b)=>rank(a)>=rank(b)?a:b;
  const activeMonths=dates=>{const per={};for(const d of new Set(dates))per[d.slice(0,7)]=(per[d.slice(0,7)]||0)+1;return Object.values(per).filter(n=>n>=4).length;};
  const of=kind=>activities.filter(a=>a&&a.kind===kind&&a.date);
  // Gym: sessions from activities and from logged sets (one per day).
  const gymMonths=activeMonths([...of('strength').map(a=>a.date),...strengthSets.map(s=>String(s.workout_date||'').slice(0,10)).filter(Boolean)]);
  let strength=gymMonths>12?'experienced':gymMonths>=3?'regular':'beginner';
  const kg=Number(weightKg)>=35?Number(weightKg):null;
  if(kg){
    const best={};for(const s of strengthSets){const name=String(s.exercise||'').trim(),rm=epley1rm(s.actual_kg,s.actual_reps);if(rm==null)continue;for(const [lift,re] of Object.entries(LIFT))if(re.test(name))best[lift]=Math.max(best[lift]||0,rm/kg);}
    if((best.squat||0)>=1.5||(best.bench||0)>=1.1||(best.deadlift||0)>=1.8)strength='experienced';
    else if((best.squat||0)>=1.0||(best.bench||0)>=0.75)strength=max(strength,'regular');
  }
  const months=kind=>activeMonths(of(kind).map(a=>a.date)),byMonths=m=>m>24?'experienced':m>=3?'regular':'beginner';
  const latest=(list,key)=>[...list].reverse().find(a=>a[key]>0)?.[key]??null;
  let ride=byMonths(months('ride'));
  const rideFtp=Number(ftp)>0?Number(ftp):latest(of('ride'),'ftp');
  if(kg&&rideFtp&&rideFtp/kg>=3.5)ride='experienced';
  let run=byMonths(months('run'));
  const speed=latest(of('run'),'thresholdSpeed'),pace=Number(runThresholdPace)>0?Number(runThresholdPace):speed?(speed<20?1000/speed:speed):null;
  if(pace&&pace<285)run='experienced';
  const km={};for(const a of of('run'))km[a.date.slice(0,7)]=(km[a.date.slice(0,7)]||0)+(a.distanceKm||0);
  if(Object.values(km).some(v=>v>30*52/12))run=max(run,'regular');
  const own={strength,ride,run},out={};
  for(const sport of Object.keys(own)){const other=Math.max(...Object.keys(own).filter(s=>s!==sport).map(s=>rank(own[s])));out[sport]=EXPERIENCE_LEVELS[Math.max(rank(own[sport]),Math.min(other,rank(own[sport])+1))];}
  // Swimming is technique: fitness from the other sports doesn't make a swimmer.
  out.swim=byMonths(months('swim'));
  return out;
}
export async function trainingHistory(db,userId=db.userId,{now=Date.now()}={}){
  // Days in the user's zone: in the first hours of their day the UTC date is
  // still yesterday, and today's activities would fall outside the window.
  const end=localToday(new Date(now)),daysBack=n=>new Date(Date.parse(end+'T12:00:00Z')-n*DAY).toISOString().slice(0,10),since=daysBack(84);
  // Up to two years for the per-sport experience; the rest uses the last 12 weeks.
  const rows=(await db.prepare("SELECT source_family,data_type,start_time,end_time,sample_time,payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND COALESCE(start_time,sample_time)>=? AND COALESCE(start_time,sample_time)<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY COALESCE(start_time,sample_time)").bind(userId,daysBack(EXPERIENCE_DAYS),end+'T23:59:59').all().catch(()=>({results:[]}))).results||[];
  const all=dedupeActivities(rows.map(row=>{const a=activityFromRow({...row,start_time:row.start_time||row.sample_time});if(a){let p={};try{p=JSON.parse(row.payload_json||'{}');}catch{}const num=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;a.distanceKm=num(p.distance)!=null?num(p.distance)/1000:null;a.ftp=num(p.icu_ftp);a.thresholdSpeed=num(p.threshold_pace);a.poolLength=num(p.pool_length);}return a;}).filter(a=>a&&a.minutes>0&&a.minutes<=1440));
  const activities=all.filter(a=>a.date>=since);
  const sets=(await db.prepare("SELECT workout_date,exercise,actual_kg,actual_reps FROM strength_sets WHERE user_id=? AND completed=1 AND type='WORK' AND workout_date>=?").bind(userId,daysBack(EXPERIENCE_DAYS)).all().catch(()=>({results:[]}))).results||[];
  const weight=await latestStoredWeight(db,userId).catch(()=>null);
  const sportExperienceLevels=sportExperience({activities:all,strengthSets:sets,weightKg:weight?.value_numeric});
  const training=activities.filter(a=>['ride','run','strength','swim'].includes(a.kind));
  const recent=training.filter(a=>a.date>=daysBack(28));
  const focused=training.filter(a=>a.date>=daysBack(56));
  const counts={};for(const a of focused)counts[a.kind]=(counts[a.kind]||0)+1;
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const dominant=ranked.length&&(!ranked[1]||ranked[0][1]>ranked[1][1])?ranked[0][0]:null;
  const mainSport=({ride:'cycling',run:'running',strength:'strength'})[dominant]||'general';
  const weekOf=date=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
  const activeWeeks=new Set(training.map(a=>weekOf(a.date))).size,perWeek=training.length/12;
  const experience=perWeek>=4&&activeWeeks>=10?'experienced':perWeek>=2&&activeWeeks>=6?'regular':'beginner';
  const weeklyMinutes=Math.round(recent.reduce((sum,a)=>sum+a.minutes,0)/4);
  const weekdayMinutes=Array(7).fill(0);for(const a of recent)weekdayMinutes[(new Date(a.date+'T12:00:00Z').getUTCDay()+6)%7]+=a.minutes/4;
  // The last 12 months per sport (sessions, hours) for the triathlon split, from the rows already read.
  const sports=yearBySport(all,daysBack(365));
  // The pool of the last pool swim (25 or 50 m, 25 yd), from the rows already read: the default until one is chosen by hand.
  const poolLength=[...all].reverse().find(a=>a.kind==='swim'&&POOL_LENGTHS.some(m=>Math.abs(m-a.poolLength)<.1))?.poolLength??null;
  return {mainSport,experience,sportExperience:sportExperienceLevels,sports,poolLength,weeklyMinutes,weeklyHours:Math.round(weeklyMinutes/60*10)/10,automaticSportAvailable:recent.length>0,activeWeeks,activityCount:training.length,recentCount:recent.length,recentActiveWeeks:new Set(recent.map(a=>weekOf(a.date))).size,weekdayMinutes,periods:{sportDays:56,experienceDays:84,sportExperienceDays:EXPERIENCE_DAYS,volumeDays:28}};
}
export function starterPlan(history,experience=history.experience){
  // These are app templates, not published averages of free time. An inactive
  // beginner starts below the WHO target and can increase volume gradually.
  const templates={beginner:[30,0,30,0,0,45,0],regular:[30,0,30,0,30,60,0],experienced:[30,30,0,30,30,60,60]};
  const measured=history.recentCount>=4&&history.recentActiveWeeks>=3;
  const minutes=measured?history.weekdayMinutes.map(m=>m>0?Math.max(20,Math.min(240,Math.round(m/5)*5)):0):templates[experience]||templates.beginner;
  return {source:measured?'history':'starter',availability:minutes.map(minutes=>({minutes,window:'',preferredSports:[]})),weeklyActivities:minutes.filter(m=>m>0).length,weeklyMinutes:minutes.reduce((a,b)=>a+b,0),references:TRAINING_REFERENCES,explanation:measured?L('Výchozí objem a dny vycházejí z posledních 4 týdnů.', 'The default volume and days are based on the last 4 weeks.'):L('Opatrná výchozí šablona; nejde o změřený volný čas. Čas i dny upravíš v Plánu.', 'A careful default template, not your measured free time. You can adjust the time and days in the Plan.')};
}
