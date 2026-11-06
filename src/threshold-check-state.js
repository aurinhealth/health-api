// The threshold check's state for /app/api/threshold-check (threshold-check.js).
import { cached } from "./api-cache.js";
import { rideIntervals, boundedJson } from "./activity-detail.js";
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { athleteThresholds } from "./intervals-athlete.js";
import { getWeekPlan, planWeekRoles, roleTime, roleFor } from "./week-planner.js";
import { weekRoleOptions } from "./plan-context.js";
import { availabilityOn } from "./training-availability.js";
import { getChecks, thresholdSessions, estimateRideFtp, estimateRunPace, saveCheck, testResult, curveTestResult, getTestWorkout, thresholdOffer, recommendTestDay, testFor } from "./threshold-check.js";
import { intervalsReads } from "./intervals-reads.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { wahooStreams } from "./wahoo-detail.js";
import { activePlan, planWeek } from "./training-plans.js";
import { L } from "./lang.js";
import { shiftDate, dashboardProfile, mondayOfDate } from "./dashboard-shared.js";

// Thresholds from the data and the test to confirm them (threshold-check.js):
// what to offer, the planned tests and the measured results waiting for the
// athlete's confirmation. A planned test that has passed is read from the
// day's activity (Intervals.icu intervals); without them the app asks for the
// values.
export const TEST_IDS={ride:['test-ride-ftp20','test-ride-lthr30'],run:['test-run-tt30'],swim:['test-swim-css']};
// The last 90 days of rides and runs (threshold-check.js sessions), the
// athlete's thresholds and the heart-rate anchors the estimates use. Shared
// with the coach's performance trends (performance-trends.js).
export async function loadThresholdSessions(env,ctx,today){
  const from=shiftDate(today,-90);
  const [rows,thresholds,profile,rest]=await Promise.all([
    env.DB.prepare("SELECT start_time,end_time,source_family,payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time").bind(env.USER_ID,from,shiftDate(today,1)).all().then(r=>r.results||[]).catch(()=>[]),
    cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>({})),
    dashboardProfile(env).catch(()=>null),
    env.DB.prepare("SELECT value_numeric FROM health_datapoints WHERE user_id=? AND data_type='daily-resting-heart-rate' AND sample_time>=? AND value_numeric>0").bind(env.USER_ID,shiftDate(today,-30)).all().then(r=>(r.results||[]).map(x=>Number(x.value_numeric)).sort((a,b)=>a-b)).catch(()=>[])
  ]);
  const byActivity=new Map(),activities=[];
  for(const row of rows){const a=activityFromRow(row);if(a){byActivity.set(a,row);activities.push(a);}}
  const sessions=thresholdSessions(dedupeActivities(activities),byActivity);
  const age=Number(profile?.age)||null;
  const athlete={ftp:thresholds.ftp,lthr:thresholds.lthr,runLthr:thresholds.runLthr,maxHr:thresholds.maxHr||(age?Math.round(208-0.7*age):null),restHr:thresholds.restHr||(rest.length?rest[Math.floor(rest.length/2)]:null)};
  return {sessions,thresholds,athlete};
}
// The test ride's own curves (time, watts) when its laps hold no 20-min effort:
// Intervals.icu's streams of the activity (no per-ride power curve in its
// API that the app uses), or the Wahoo workout's FIT file (wahoo-detail.js,
// read once and kept).
async function testCurves(env,id){
  let streams=[];
  if(String(id||'').startsWith('wahoo:')){
    const row=await env.DB.prepare("SELECT external_id,start_time,end_time,payload_json FROM health_datapoints WHERE user_id=? AND source_family='wahoo' AND data_type='activity' AND external_id=?").bind(env.USER_ID,String(id)).first();
    if(row)streams=await wahooStreams(env,row);
  }else if(env.INTERVALS_API_KEY&&/^[a-zA-Z0-9_-]{1,80}$/.test(id||'')){
    streams=await intervalsReads(env)('https://intervals.icu/api/v1/activity/'+encodeURIComponent(id)+'/streams?types=time,watts',{headers:{Authorization:intervalsAuthorization(env.INTERVALS_API_KEY),Accept:'application/json'},signal:AbortSignal.timeout(10000)}).then(r=>boundedJson(r,4*1024*1024));
  }
  const s=type=>(Array.isArray(streams)?streams:[]).find(x=>x.type===type)?.data||[];
  return {time:s('time'),watts:s('watts')};
}

export async function thresholdCheckState(env,ctx,today){
  const [{sessions,thresholds,athlete},checks]=await Promise.all([loadThresholdSessions(env,ctx,today),getChecks(env.DB)]);
  const current={ftp:thresholds.ftp||null,lthr:thresholds.lthr||null,runThresholdPace:thresholds.runThresholdPace||null,swimCss:thresholds.swimCss||null};
  const estimates={ride:estimateRideFtp(sessions,athlete,today),run:estimateRunPace(sessions,athlete,today)};
  // The active plan's weeks set the days' roles (weekRoleOptions, as on Today).
  const active=await activePlan(env.DB,today).catch(()=>null);
  const live=active&&!active.pauseFrom?active:null;
  const weekOf=monday=>{const pw=live?planWeek(live,monday):null;return {pw,options:weekRoleOptions(env,ctx,live,pw).catch(()=>({}))};};
  // The week plan's next 10 days for the recommended test day.
  const plans=new Map(),weeks=new Map();
  const days=[];
  for(let k=1;k<=10;k++){
    const date=shiftDate(today,k),monday=mondayOfDate(date);
    if(!plans.has(monday))plans.set(monday,await getWeekPlan(env.DB,date).catch(()=>null));
    if(!weeks.has(monday))weeks.set(monday,weekOf(monday));
    const prefs=plans.get(monday),weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
    days.push({date,prefs,options:await weeks.get(monday).options,sports:prefs?.days?.[weekday]||[],minutes:prefs?availabilityOn(prefs,date).minutes:null});
  }
  // A plan with tests (ride FTP: the first and the last week) schedules each
  // on its week's first quality day, so the coach eases the days before it.
  for(const monday of live?[mondayOfDate(today),shiftDate(mondayOfDate(today),7)]:[]){
    if(!weeks.has(monday))weeks.set(monday,weekOf(monday));
    const {pw,options}=weeks.get(monday);
    if(!pw?.spec.q[0]?.test)continue;
    const prefs=await getWeekPlan(env.DB,monday).catch(()=>null),roles=prefs?planWeekRoles(prefs.days,{...await options,...roleTime(prefs,monday)}):[];
    const i=roles.findIndex(d=>d.items.some(x=>x.sport===active.sport&&x.role==='quality'));
    const testDate=i>=0?shiftDate(monday,i):null,c=checks[active.sport];
    if(!testDate||testDate<=today||testDate>shiftDate(today,10))continue;
    if(c&&(['scheduled','measured'].includes(c.status)||String(c.updatedAt||'').slice(0,10)>=shiftDate(testDate,-14)))continue;
    const testId=testFor(active.sport,Number(thresholds.ftp)>0);
    await saveCheck(env.DB,active.sport,{status:'scheduled',testId,testDate,estimate:estimates[active.sport]});
    checks[active.sport]={sport:active.sport,status:'scheduled',testId,testDate,estimate:estimates[active.sport]};
  }
  const offers=[],scheduled=[],results=[],manual=[];
  // Swimming: only the plan's CSS test, no estimate to offer one from.
  for(const sport of ['ride','run','swim']){
    const check=checks[sport];
    // A planned test that has passed: its result, or the athlete's values.
    if(check?.status==='scheduled'&&check.testDate<=today){
      const done=sessions.filter(x=>x.kind===sport&&x.date===check.testDate).sort((a,b)=>(b.minutes||0)-(a.minutes||0))[0];
      if(done){
        const detail=done.id?await rideIntervals(env,done.id).catch(()=>null):null;
        let result=detail?testResult(check.testId,detail.intervals):null;
        // No lap of about 20 minutes (a 20-min FTP test): the ride's best 20
        // minutes, still only a value to confirm. Tried once per ride (kept in
        // the check), and only on a ride as long as the test: a short ride
        // earlier that day leaves the test ride to come.
        const w=getTestWorkout(check.testId),long=(done.minutes||0)>=(w?.duration_minutes||45)*0.8;
        if(!result&&done.id&&check.testId==='test-ride-ftp20'&&long&&check.result?.curveTried!==done.id){
          const c=await testCurves(env,done.id).catch(()=>null);
          result=c?curveTestResult(c.time,c.watts,current.ftp):null;
          if(!result){await saveCheck(env.DB,sport,{...check,result:{curveTried:done.id}});checks[sport]={...check,result:{curveTried:done.id}};}
        }
        if(result){await saveCheck(env.DB,sport,{...check,status:'measured',result});checks[sport]={...check,status:'measured',result};}
        else {manual.push({sport,testId:check.testId,testDate:check.testDate});continue;}
      }else if(check.testDate<shiftDate(today,-3)){await saveCheck(env.DB,sport,{...check,status:'dismissed'});checks[sport]={...check,status:'dismissed',updatedAt:today};}
      else if(check.testDate<today||sport==='swim'){manual.push({sport,testId:check.testId,testDate:check.testDate});continue;}
    }
    const c=checks[sport];
    if(c?.status==='scheduled'){const w=getTestWorkout(c.testId);scheduled.push({sport,testId:c.testId,testDate:c.testDate,name:w?.name||null,minutes:w?.duration_minutes||null});continue;}
    if(c?.status==='measured'){results.push({sport,testId:c.testId,testDate:c.testDate,result:c.result,current});continue;}
    if(sport==='swim')continue;
    const offer=thresholdOffer({sport,sessions,current,estimate:estimates[sport],check:c,today});
    if(!offer)continue;
    const w=getTestWorkout(offer.testId);
    const when=recommendTestDay({today,sport,minutes:w.duration_minutes,days:days.map(d=>({date:d.date,sports:d.sports,minutes:d.minutes,role:d.prefs?roleFor(d.prefs,d.date,sport,d.options)?.role||null:null}))});
    offers.push({...offer,testName:w.name,testMinutes:w.duration_minutes,testDescription:w.description,...when});
  }
  // Where a confirmed result goes besides Aurin; the app shows only those whose switch is on.
  return {status:'ok',current,estimates,offers,scheduled,results,manual,connected:{intervals:Boolean(env.INTERVALS_API_KEY),wahoo:Boolean(env.WAHOO_TOKEN)}};
}

// A manually entered test result into the values to confirm.
export function manualTestResult(testId,values={}){
  const num=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
  if(testId==='test-ride-ftp20'){const p=num(values.power20);if(!p||p>1500)throw new Error(L('Zadej průměrný výkon za 20 minut.','Enter your average power over 20 minutes.'));return {ftp:Math.round(p*.95),power20:p};}
  // The CSS test: the two times in seconds (or "m:ss"), CSS = (t400 − t200) / 2 a 100 m.
  if(testId==='test-swim-css'){
    const time=v=>{const m=String(v??'').trim().match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):num(v);};
    const t400=time(values.t400),t200=time(values.t200),css=t400&&t200&&t400>t200&&t200/2<t400/4?Math.round((t400-t200)/2):null;
    if(!css||css<60||css>240)throw new Error(L('Zadej časy na 400 m a 200 m (m:ss).','Enter your 400 m and 200 m times (m:ss).'));
    return {swimCss:css,t400,t200};
  }
  if(testId==='test-ride-lthr30'){const hr=num(values.hr);if(!hr||hr<80||hr>230)throw new Error(L('Zadej průměrný tep posledních 20 minut.','Enter the average heart rate of the last 20 minutes.'));return {lthr:Math.round(hr)};}
  const km=num(String(values.distanceKm??'').replace(',','.')),pace=km?Math.round(1800/km):null;
  if(!pace||pace<150||pace>600)throw new Error(L('Zadej vzdálenost uběhnutou za 30 minut.','Enter the distance you ran in 30 minutes.'));
  const hr=num(values.hr);
  return {runThresholdPace:pace,runLthr:hr&&hr>=80&&hr<=230?Math.round(hr):null,distance:Math.round(km*1000)};
}
