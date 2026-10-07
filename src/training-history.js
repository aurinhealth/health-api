// Measured history and conservative starting templates are separate inputs.
import { L } from './lang.js';
import {activityFromRow} from './coach-reflection.js';
const DAY=86400000;
export const TRAINING_REFERENCES=[
  {name:'WHO 2020: 150–300 min střední intenzity týdně; síla alespoň 2 dny',url:'https://doi.org/10.1136/bjsports-2020-102955'},
  {name:'ACSM: postupná progrese silového tréninku podle zkušeností',url:'https://doi.org/10.1249/MSS.0b013e3181915670'}
];
export async function trainingHistory(db,userId=db.userId,{now=Date.now()}={}){
  const end=new Date(now).toISOString().slice(0,10),since=new Date(now-84*DAY).toISOString().slice(0,10);
  const rows=(await db.prepare("SELECT source_family,data_type,start_time,end_time,sample_time,payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND COALESCE(start_time,sample_time)>=? AND COALESCE(start_time,sample_time)<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY COALESCE(start_time,sample_time)").bind(userId,since,end+'T23:59:59').all().catch(()=>({results:[]}))).results||[];
  const candidates=rows.map(row=>{const a=activityFromRow({...row,start_time:row.start_time||row.sample_time});return a?{...a,source:row.source_family}:null;}).filter(a=>a&&a.minutes>0&&a.minutes<=1440);
  const activities=[];
  for(const a of candidates.sort((a,b)=>(a.source==='intervals'?0:1)-(b.source==='intervals'?0:1))){
    if(activities.some(b=>a.source!==b.source&&a.kind===b.kind&&Math.abs(Date.parse(a.start)-Date.parse(b.start))<=20*60000))continue;
    activities.push(a);
  }
  const training=activities.filter(a=>['ride','run','strength','swim'].includes(a.kind));
  const recent=training.filter(a=>a.date>=new Date(now-28*DAY).toISOString().slice(0,10));
  const focused=training.filter(a=>a.date>=new Date(now-56*DAY).toISOString().slice(0,10));
  const counts={};for(const a of focused)counts[a.kind]=(counts[a.kind]||0)+1;
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const dominant=ranked.length&&(!ranked[1]||ranked[0][1]>ranked[1][1])?ranked[0][0]:null;
  const mainSport=({ride:'cycling',run:'running',strength:'strength'})[dominant]||'general';
  const weekOf=date=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
  const activeWeeks=new Set(training.map(a=>weekOf(a.date))).size,perWeek=training.length/12;
  const experience=perWeek>=4&&activeWeeks>=10?'experienced':perWeek>=2&&activeWeeks>=6?'regular':'beginner';
  const weeklyMinutes=Math.round(recent.reduce((sum,a)=>sum+a.minutes,0)/4);
  const weekdayMinutes=Array(7).fill(0);for(const a of recent)weekdayMinutes[(new Date(a.date+'T12:00:00Z').getUTCDay()+6)%7]+=a.minutes/4;
  return {mainSport,experience,weeklyMinutes,weeklyHours:Math.round(weeklyMinutes/60*10)/10,automaticSportAvailable:recent.length>0,activeWeeks,activityCount:training.length,recentCount:recent.length,recentActiveWeeks:new Set(recent.map(a=>weekOf(a.date))).size,weekdayMinutes,periods:{sportDays:56,experienceDays:84,volumeDays:28}};
}
export function starterPlan(history,experience=history.experience){
  // These are app templates, not published averages of free time. An inactive
  // beginner starts below the WHO target and can increase volume gradually.
  const templates={beginner:[30,0,30,0,0,45,0],regular:[30,0,30,0,30,60,0],experienced:[30,30,0,30,30,60,60]};
  const measured=history.recentCount>=4&&history.recentActiveWeeks>=3;
  const minutes=measured?history.weekdayMinutes.map(m=>m>0?Math.max(20,Math.min(240,Math.round(m/5)*5)):0):templates[experience]||templates.beginner;
  return {source:measured?'history':'starter',availability:minutes.map(minutes=>({minutes,window:'',preferredSports:[]})),weeklyActivities:minutes.filter(m=>m>0).length,weeklyMinutes:minutes.reduce((a,b)=>a+b,0),references:TRAINING_REFERENCES,explanation:measured?L('Výchozí objem a dny vycházejí z posledních 4 týdnů.', 'The default volume and days are based on the last 4 weeks.'):L('Opatrná výchozí šablona; nejde o změřený volný čas. Čas i dny upravíš v Plánu.', 'A careful default template, not your measured free time. You can adjust the time and days in the Plan.')};
}
