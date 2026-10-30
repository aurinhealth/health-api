// Measured history and conservative starting templates are separate inputs.
import { L } from './lang.js';
import {activityFromRow,dedupeActivities} from './coach-reflection.js';
import {POOL_LENGTHS} from './training-zones.js';
import {localToday} from './user-time.js';
import {latestStoredWeight} from './athlete-weight.js';
import {mondayOfDate,shiftDate} from './dashboard-shared.js';
import {supportSports} from './athlete-focus.js';
export const TRAINING_REFERENCES=[
  {name:'WHO 2020: 150–300 min střední intenzity týdně; síla alespoň 2 dny',url:'https://doi.org/10.1136/bjsports-2020-102955'},
  {name:'ACSM: postupná progrese silového tréninku podle zkušeností',url:'https://doi.org/10.1249/MSS.0b013e3181915670'}
];
export const EXPERIENCE_LEVELS=['beginner','regular','experienced'];
export const EXPERIENCE_SPORTS=['strength','ride','run','swim'];
const EXPERIENCE_DAYS=730;
// The experience thresholds are approximate rules of thumb, not exact classifications:
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
const SPORT_KINDS=['ride','run','swim','strength'];
// One row a week (Monday): minutes and sessions per sport, running km, the
// latest FTP and threshold pace and the best estimated 1RM of the main lifts.
// Gym sessions count each day once, from activities and from logged sets.
export function summarizeWeeks({activities=[],strengthSets=[]}={},mondays=null){
  const weeks=new Map();
  const row=date=>{const week=mondayOfDate(date);if(!weeks.has(week))weeks.set(week,{week,ride_min:0,ride_n:0,run_min:0,run_n:0,run_km:0,swim_min:0,swim_n:0,gym_min:0,gym_n:0,ftp:null,run_pace:null,squat:null,bench:null,deadlift:null,pool:null,gymDays:new Set()});return weeks.get(week);};
  for(const a of [...activities].filter(a=>a&&a.date&&SPORT_KINDS.includes(a.kind)).sort((x,y)=>x.date<y.date?-1:1)){
    const w=row(a.date),key=a.kind==='strength'?'gym':a.kind;
    w[key+'_min']+=Number(a.minutes)||0;
    if(a.kind==='strength')w.gymDays.add(a.date);else w[key+'_n']++;
    if(a.kind==='run')w.run_km+=Number(a.distanceKm)||0;
    if(a.kind==='ride'&&a.ftp>0)w.ftp=a.ftp;
    if(a.kind==='run'&&a.thresholdSpeed>0)w.run_pace=a.thresholdSpeed<20?1000/a.thresholdSpeed:a.thresholdSpeed;
    if(a.kind==='swim'&&POOL_LENGTHS.some(m=>Math.abs(m-a.poolLength)<.1))w.pool=a.poolLength;
  }
  for(const s of strengthSets){
    const date=String(s.workout_date||'').slice(0,10);if(!date)continue;
    const w=row(date);w.gymDays.add(date);
    const name=String(s.exercise||'').trim(),rm=epley1rm(s.actual_kg,s.actual_reps);
    if(rm!=null)for(const [lift,re] of Object.entries(LIFT))if(re.test(name))w[lift]=Math.max(w[lift]||0,rm);
  }
  for(const m of mondays||[])row(m);
  for(const w of weeks.values()){w.gym_n=w.gymDays.size;delete w.gymDays;w.run_km=Math.round(w.run_km*10)/10;}
  return [...weeks.values()].sort((x,y)=>x.week<y.week?-1:1);
}
// Per-sport experience (gym, cycling, running) from up to two years of weeks.
// It counts months with training (>=4 sessions of that sport; a week belongs to
// the month of its Thursday), never how recent they are, so a pause for illness
// or injury does not lower the level.
export function experienceFromWeeks(weeks=[],{weightKg=null,ftp=null,runThresholdPace=null}={}){
  const rank=l=>EXPERIENCE_LEVELS.indexOf(l),max=(a,b)=>rank(a)>=rank(b)?a:b;
  const monthOf=w=>shiftDate(w.week,3).slice(0,7);
  const activeMonths=key=>{const per={};for(const w of weeks)per[monthOf(w)]=(per[monthOf(w)]||0)+(Number(w[key])||0);return Object.values(per).filter(n=>n>=4).length;};
  let strength=activeMonths('gym_n')>12?'experienced':activeMonths('gym_n')>=3?'regular':'beginner';
  const kg=Number(weightKg)>=35?Number(weightKg):null;
  if(kg){
    const best=lift=>Math.max(0,...weeks.map(w=>Number(w[lift])||0))/kg;
    if(best('squat')>=1.5||best('bench')>=1.1||best('deadlift')>=1.8)strength='experienced';
    else if(best('squat')>=1.0||best('bench')>=0.75)strength=max(strength,'regular');
  }
  const byMonths=m=>m>24?'experienced':m>=3?'regular':'beginner';
  const latest=key=>[...weeks].reverse().find(w=>w[key]>0)?.[key]??null;
  let ride=byMonths(activeMonths('ride_n'));
  const rideFtp=Number(ftp)>0?Number(ftp):latest('ftp');
  if(kg&&rideFtp&&rideFtp/kg>=3.5)ride='experienced';
  let run=byMonths(activeMonths('run_n'));
  const pace=Number(runThresholdPace)>0?Number(runThresholdPace):latest('run_pace');
  if(pace&&pace<285)run='experienced';
  const km={};for(const w of weeks)km[monthOf(w)]=(km[monthOf(w)]||0)+(Number(w.run_km)||0);
  if(Object.values(km).some(v=>v>30*52/12))run=max(run,'regular');
  const own={strength,ride,run},out={};
  for(const sport of Object.keys(own)){const other=Math.max(...Object.keys(own).filter(s=>s!==sport).map(s=>rank(own[s])));out[sport]=EXPERIENCE_LEVELS[Math.max(rank(own[sport]),Math.min(other,rank(own[sport])+1))];}
  // Swimming is technique: fitness from the other sports doesn't make a swimmer.
  out.swim=byMonths(activeMonths('swim_n'));
  return out;
}
export function sportExperience({activities=[],strengthSets=[],weightKg=null,ftp=null,runThresholdPace=null}={}){
  return experienceFromWeeks(summarizeWeeks({activities,strengthSets}),{weightKg,ftp,runThresholdPace});
}

const MAIN_OF={ride:'cycling',run:'running',swim:'swimming',strength:'strength'};
// The main sport from the last year of weeks (oldest first). A sport is
// regular with 12+ sessions in 8+ different weeks. Triathlon needs all three
// of ride, run and swim; of the regular ride, run and swim the one with more
// hours is main and the others support sports. The gym is main only when it rules the whole year
// (26+ weeks and twice the endurance hours), so a winter in the gym does not
// flip it; otherwise it supports the endurance sport. Without a regular sport
// (a new account) the most frequent sport of the last 8 weeks decides.
export function mainSportFromWeeks(weeks=[],recent=[]){
  const year=weeks.slice(-52),sum=key=>year.reduce((n,w)=>n+(Number(w[key])||0),0),inWeeks=key=>year.filter(w=>w[key]>0).length;
  const stat=Object.fromEntries(SPORT_KINDS.map(k=>{const p=k==='strength'?'gym':k;return [k,{hours:sum(p+'_min')/60,count:sum(p+'_n'),weeks:inWeeks(p+'_n')}];}));
  const regular=SPORT_KINDS.filter(k=>stat[k].count>=12&&stat[k].weeks>=8);
  const endurance=['ride','run','swim'].filter(k=>regular.includes(k)),enduranceHours=['ride','run','swim'].reduce((n,k)=>n+stat[k].hours,0);
  const yearCount=SPORT_KINDS.reduce((n,k)=>n+stat[k].count,0),out=mainSport=>({mainSport,regularSports:regular,supportSports:supportSports(mainSport,regular),yearCount});
  if(['ride','run','swim'].every(k=>regular.includes(k)))return out('triathlon');
  if(regular.includes('strength')&&stat.strength.weeks>=26&&stat.strength.hours>=2*enduranceHours)return out('strength');
  const byHours=[...endurance].sort((a,b)=>stat[b].hours-stat[a].hours||stat[b].count-stat[a].count);
  if(byHours.length)return out(MAIN_OF[byHours[0]]);
  if(regular.includes('strength'))return out('strength');
  const counts={};for(const a of recent)counts[a.kind]=(counts[a.kind]||0)+1;
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const dominant=ranked.length&&(!ranked[1]||ranked[0][1]>ranked[1][1])?ranked[0][0]:null;
  return {mainSport:MAIN_OF[dominant]||'general',regularSports:regular,supportSports:[],yearCount};
}

const WEEK_COLUMNS=['ride_min','ride_n','run_min','run_n','run_km','swim_min','swim_n','gym_min','gym_n','ftp','run_pace','squat','bench','deadlift','pool'];
const weeksReady=new WeakSet();
async function ensureWeeks(db){
  if(weeksReady.has(db))return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS training_weeks (user_id INTEGER NOT NULL, week TEXT NOT NULL, ${WEEK_COLUMNS.map(c=>c+' REAL').join(', ')}, built TEXT NOT NULL, PRIMARY KEY (user_id, week))`).run();
  weeksReady.add(db);
}
const REBUILD_DAYS=28,FRESH_DAYS=14;
async function readActivities(db,userId,from,to){
  // Source and type in front so the read seeks (user_id, source_family, data_type, start_time).
  const rows=(await db.prepare("SELECT source_family,data_type,start_time,end_time,sample_time,payload_json FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local','wahoo','google-wearables','apple-health') AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time").bind(userId,from,to+'T23:59:59').all().catch(()=>({results:[]}))).results||[];
  return dedupeActivities(rows.map(row=>{const a=activityFromRow({...row,start_time:row.start_time||row.sample_time});if(a){let p={};try{p=JSON.parse(row.payload_json||'{}');}catch{}const num=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;a.distanceKm=num(p.distance)!=null?num(p.distance)/1000:null;a.ftp=num(p.icu_ftp);a.thresholdSpeed=num(p.threshold_pace);a.poolLength=num(p.pool_length);}return a;}).filter(a=>a&&a.minutes>0&&a.minutes<=1440));
}
// Two years of finished weeks (training_weeks): stored once each, so a day
// reads at most 104 rows instead of every activity. Missing weeks, and once a
// day the last two (late uploads), are counted from the activities of just those days;
// every 4 weeks the whole two years count again (a service connected later
// brings old activities). Nothing is stored while there are no activities.
export async function trainingWeeks(db,userId,today){
  await ensureWeeks(db);
  const thisMonday=mondayOfDate(today),first=shiftDate(thisMonday,-104*7);
  const stored=(await db.prepare(`SELECT week,${WEEK_COLUMNS.join(',')},built FROM training_weeks WHERE user_id=? AND week>=? AND week<? ORDER BY week`).bind(userId,first,thisMonday).all().catch(()=>({results:[]}))).results||[];
  const all=[];for(let m=first;m<thisMonday;m=shiftDate(m,7))all.push(m);
  const rebuild=!stored.length||stored.some(r=>r.built<shiftDate(today,-REBUILD_DAYS));
  const have=new Map(stored.map(r=>[r.week,r]));
  const todo=rebuild?all:all.filter(m=>!have.has(m)||(have.get(m).built<shiftDate(m,7+FRESH_DAYS)&&have.get(m).built<today));
  if(!todo.length)return stored;
  const from=todo[0],to=shiftDate(thisMonday,-1);
  const activities=await readActivities(db,userId,from,to);
  const sets=(await db.prepare("SELECT workout_date,exercise,actual_kg,actual_reps FROM strength_sets WHERE user_id=? AND completed=1 AND type='WORK' AND workout_date>=? AND workout_date<?").bind(userId,from,thisMonday).all().catch(()=>({results:[]}))).results||[];
  const fresh=new Map(summarizeWeeks({activities,strengthSets:sets},all.filter(m=>m>=from)).map(w=>[w.week,{...w,built:today}]));
  if(!activities.length&&!sets.length&&!stored.length)return [...fresh.values()];
  const write=all.filter(m=>m>=from&&(rebuild||todo.includes(m)));
  const statements=write.map(m=>{const w=fresh.get(m);return db.prepare(`INSERT INTO training_weeks(user_id,week,${WEEK_COLUMNS.join(',')},built) VALUES(?,?,${WEEK_COLUMNS.map(()=>'?').join(',')},?) ON CONFLICT(user_id,week) DO UPDATE SET ${WEEK_COLUMNS.map(c=>c+'=excluded.'+c).join(',')},built=excluded.built`).bind(userId,m,...WEEK_COLUMNS.map(c=>w[c]??null),today);});
  if(rebuild)await db.prepare('DELETE FROM training_weeks WHERE user_id=?').bind(userId).run();
  for(let i=0;i<statements.length;i+=50)await (db.batch?db.batch(statements.slice(i,i+50)):Promise.all(statements.slice(i,i+50).map(s=>s.run())));
  return all.map(m=>m>=from&&write.includes(m)?fresh.get(m):have.get(m)).filter(Boolean);
}
// Forgets the stored weeks, e.g. after a new service is connected.
export async function forgetTrainingWeeks(db,userId=db.userId){
  await ensureWeeks(db);
  await db.prepare('DELETE FROM training_weeks WHERE user_id=?').bind(userId).run();
}

export async function trainingHistory(db,userId=db.userId,{now=Date.now()}={}){
  // Days in the user's zone: in the first hours of their day the UTC date is
  // still yesterday, and today's activities would fall outside the window.
  const end=localToday(new Date(now)),daysBack=n=>shiftDate(end,-n);
  // Finished weeks (up to two years) from training_weeks; the last 12 weeks of
  // activities for the overall experience, the volume, the weekdays and a new
  // account's sport.
  const weeks=await trainingWeeks(db,userId,end);
  const activities=await readActivities(db,userId,daysBack(84),end);
  const weight=await latestStoredWeight(db,userId).catch(()=>null);
  const sportExperienceLevels=experienceFromWeeks(weeks,{weightKg:weight?.value_numeric});
  const training=activities.filter(a=>SPORT_KINDS.includes(a.kind));
  const recent=training.filter(a=>a.date>=daysBack(28));
  const {mainSport,regularSports,supportSports:support,yearCount}=mainSportFromWeeks(weeks,training.filter(a=>a.date>=daysBack(56)));
  const activeWeeks=new Set(training.map(a=>mondayOfDate(a.date))).size,perWeek=training.length/12;
  const experience=perWeek>=4&&activeWeeks>=10?'experienced':perWeek>=2&&activeWeeks>=6?'regular':'beginner';
  const weeklyMinutes=Math.round(recent.reduce((sum,a)=>sum+a.minutes,0)/4);
  const weekdayMinutes=Array(7).fill(0);for(const a of recent)weekdayMinutes[(new Date(a.date+'T12:00:00Z').getUTCDay()+6)%7]+=a.minutes/4;
  // The last 12 months per sport (sessions, hours) for the triathlon split, from the weeks.
  const sports={};for(const w of weeks.filter(w=>w.week>=mondayOfDate(daysBack(364))))for(const [kind,key] of [['ride','ride'],['run','run'],['swim','swim'],['strength','gym']]){if(!(w[key+'_n']>0))continue;const o=sports[kind]||(sports[kind]={count:0,hours:0});o.count+=Number(w[key+'_n']);o.hours+=(Number(w[key+'_min'])||0)/60;}
  for(const o of Object.values(sports))o.hours=Math.round(o.hours*10)/10;
  // The pool of the last pool swim (25 or 50 m, 25 yd): the default until one is chosen by hand.
  const poolLength=[...activities].reverse().find(a=>a.kind==='swim'&&POOL_LENGTHS.some(m=>Math.abs(m-a.poolLength)<.1))?.poolLength??[...weeks].reverse().find(w=>w.pool>0)?.pool??null;
  return {mainSport,supportSports:support,regularSports,experience,sportExperience:sportExperienceLevels,sports,poolLength,weeklyMinutes,weeklyHours:Math.round(weeklyMinutes/60*10)/10,automaticSportAvailable:recent.length>0||yearCount>0,activeWeeks,activityCount:training.length,yearCount,recentCount:recent.length,recentActiveWeeks:new Set(recent.map(a=>mondayOfDate(a.date))).size,weekdayMinutes,periods:{sportDays:364,experienceDays:84,sportExperienceDays:EXPERIENCE_DAYS,volumeDays:28}};
}
export function starterPlan(history,experience=history.experience){
  // These are app templates, not published averages of free time. An inactive
  // beginner starts below the WHO target and can increase volume gradually.
  const templates={beginner:[30,0,30,0,0,45,0],regular:[30,0,30,0,30,60,0],experienced:[30,30,0,30,30,60,60]};
  const measured=history.recentCount>=4&&history.recentActiveWeeks>=3;
  const minutes=measured?history.weekdayMinutes.map(m=>m>0?Math.max(20,Math.min(240,Math.round(m/5)*5)):0):templates[experience]||templates.beginner;
  return {source:measured?'history':'starter',availability:minutes.map(minutes=>({minutes,window:'',preferredSports:[]})),weeklyActivities:minutes.filter(m=>m>0).length,weeklyMinutes:minutes.reduce((a,b)=>a+b,0),references:TRAINING_REFERENCES,explanation:measured?L('Výchozí objem a dny vycházejí z posledních 4 týdnů.', 'The default volume and days are based on the last 4 weeks.'):L('Opatrná výchozí šablona; nejde o změřený volný čas. Čas i dny upravíš v Plánu.', 'A careful default template, not your measured free time. You can adjust the time and days in the Plan.')};
}
