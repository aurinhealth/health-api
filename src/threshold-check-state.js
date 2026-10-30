// The threshold check's state for /app/api/threshold-check (threshold-check.js).
import { cached } from "./api-cache.js";
import { rideIntervals } from "./activity-detail.js";
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { athleteThresholds } from "./intervals-athlete.js";
import { getWeekPlan, planWeekRoles, roleTime, roleFor, planRoleOptions } from "./week-planner.js";
import { availabilityOn } from "./training-availability.js";
import { getChecks, thresholdSessions, estimateRideFtp, estimateRunPace, saveCheck, testResult, getTestWorkout, thresholdOffer, recommendTestDay } from "./threshold-check.js";
import { activePlan, planWeek, planQuality } from "./training-plans.js";
import { L } from "./lang.js";
import { shiftDate, dashboardProfile, mondayOfDate } from "./dashboard-shared.js";

// Thresholds from the data and the test to confirm them (threshold-check.js):
// what to offer, the planned tests and the measured results waiting for the
// athlete's confirmation. A planned test that has passed is read from the
// day's activity (Intervals.icu intervals); without them the app asks for the
// values.
export const TEST_IDS={ride:['test-ride-ftp20','test-ride-lthr30'],run:['test-run-tt30']};
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
export async function thresholdCheckState(env,ctx,today){
  const [{sessions,thresholds,athlete},checks]=await Promise.all([loadThresholdSessions(env,ctx,today),getChecks(env.DB)]);
  const current={ftp:thresholds.ftp||null,lthr:thresholds.lthr||null,runThresholdPace:thresholds.runThresholdPace||null};
  const estimates={ride:estimateRideFtp(sessions,athlete,today),run:estimateRunPace(sessions,athlete,today)};
  // The week plan's next 10 days for the recommended test day.
  const plans=new Map();
  const days=[];
  for(let k=1;k<=10;k++){
    const date=shiftDate(today,k),monday=mondayOfDate(date);
    if(!plans.has(monday))plans.set(monday,await getWeekPlan(env.DB,date).catch(()=>null));
    const prefs=plans.get(monday),weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
    days.push({date,prefs,sports:prefs?.days?.[weekday]||[],minutes:prefs?availabilityOn(prefs,date).minutes:null});
  }
  // A plan with tests (ride FTP: the first and the last week) schedules each
  // on its week's first quality day, so the coach eases the days before it.
  const active=await activePlan(env.DB,today).catch(()=>null);
  for(const monday of active&&!active.pauseFrom?[mondayOfDate(today),shiftDate(mondayOfDate(today),7)]:[]){
    const pw=planWeek(active,monday);
    if(!pw?.spec.q[0]?.test)continue;
    const prefs=await getWeekPlan(env.DB,monday).catch(()=>null),roles=prefs?planWeekRoles(prefs.days,{...planRoleOptions(active,planQuality(pw)),...roleTime(prefs)}):[];
    const i=roles.findIndex(d=>d.items.some(x=>x.sport===active.sport&&x.role==='quality'));
    const testDate=i>=0?shiftDate(monday,i):null,c=checks[active.sport];
    if(!testDate||testDate<=today||testDate>shiftDate(today,10))continue;
    if(c&&(['scheduled','measured'].includes(c.status)||String(c.updatedAt||'').slice(0,10)>=shiftDate(testDate,-14)))continue;
    const testId=active.sport==='run'?'test-run-tt30':Number(thresholds.ftp)>0?'test-ride-ftp20':'test-ride-lthr30';
    await saveCheck(env.DB,active.sport,{status:'scheduled',testId,testDate,estimate:estimates[active.sport]});
    checks[active.sport]={sport:active.sport,status:'scheduled',testId,testDate,estimate:estimates[active.sport]};
  }
  const offers=[],scheduled=[],results=[],manual=[];
  for(const sport of ['ride','run']){
    const check=checks[sport];
    // A planned test that has passed: its result, or the athlete's values.
    if(check?.status==='scheduled'&&check.testDate<=today){
      const done=sessions.filter(x=>x.kind===sport&&x.date===check.testDate).sort((a,b)=>(b.minutes||0)-(a.minutes||0))[0];
      if(done){
        const detail=done.id?await rideIntervals(env,done.id).catch(()=>null):null;
        const result=detail?testResult(check.testId,detail.intervals):null;
        if(result){await saveCheck(env.DB,sport,{...check,status:'measured',result});checks[sport]={...check,status:'measured',result};}
        else {manual.push({sport,testId:check.testId,testDate:check.testDate});continue;}
      }else if(check.testDate<shiftDate(today,-3)){await saveCheck(env.DB,sport,{...check,status:'dismissed'});checks[sport]={...check,status:'dismissed',updatedAt:today};}
      else if(check.testDate<today){manual.push({sport,testId:check.testId,testDate:check.testDate});continue;}
    }
    const c=checks[sport];
    if(c?.status==='scheduled'){const w=getTestWorkout(c.testId);scheduled.push({sport,testId:c.testId,testDate:c.testDate,name:w?.name||null,minutes:w?.duration_minutes||null});continue;}
    if(c?.status==='measured'){results.push({sport,testId:c.testId,testDate:c.testDate,result:c.result,current});continue;}
    const offer=thresholdOffer({sport,sessions,current,estimate:estimates[sport],check:c,today});
    if(!offer)continue;
    const w=getTestWorkout(offer.testId);
    const when=recommendTestDay({today,sport,minutes:w.duration_minutes,days:days.map(d=>({date:d.date,sports:d.sports,minutes:d.minutes,role:d.prefs?roleFor(d.prefs,d.date,sport)?.role||null:null}))});
    offers.push({...offer,testName:w.name,testMinutes:w.duration_minutes,testDescription:w.description,...when});
  }
  return {status:'ok',current,estimates,offers,scheduled,results,manual};
}

// A manually entered test result into the values to confirm.
export function manualTestResult(testId,values={}){
  const num=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
  if(testId==='test-ride-ftp20'){const p=num(values.power20);if(!p||p>1500)throw new Error(L('Zadej průměrný výkon za 20 minut.','Enter your average power over 20 minutes.'));return {ftp:Math.round(p*.95),power20:p};}
  if(testId==='test-ride-lthr30'){const hr=num(values.hr);if(!hr||hr<80||hr>230)throw new Error(L('Zadej průměrný tep posledních 20 minut.','Enter the average heart rate of the last 20 minutes.'));return {lthr:Math.round(hr)};}
  const km=num(String(values.distanceKm??'').replace(',','.')),pace=km?Math.round(1800/km):null;
  if(!pace||pace<150||pace>600)throw new Error(L('Zadej vzdálenost uběhnutou za 30 minut.','Enter the distance you ran in 30 minutes.'));
  const hr=num(values.hr);
  return {runThresholdPace:pace,runLthr:hr&&hr>=80&&hr<=230?Math.round(hr):null,distance:Math.round(km*1000)};
}
