// Training routes of the dashboard API: planned workouts, pairing, energy and
// feedback, the threshold check and the training profile.
import { bumpCacheVersion } from "./api-cache.js";
import { setManualPair } from "./manual-pairs.js";
import { setEnergyChoice } from "./activity-energy-choices.js";
import { workoutRatings, saveWorkoutRating, saveExerciseFeedback } from "./exercise-feedback.js";
import { scheduleWorkoutInIntervals } from "./workout-library.js";
import { athleteThresholds } from "./intervals-athlete.js";
import { validDay as validTrainingDay } from "./training-availability.js";
import { getChecks, saveCheck } from "./threshold-check.js";
import { setPlannedEnvironment, movePlannedEvent, deletePlannedEvent } from "./planned-events.js";
import { plannedDestinations, sendPlanned } from "./planned-send.js";
import { saveTrainingProfile, getTrainingProfile } from "./training-profile.js";
import { estimateThresholdPace, estimateFtp, FTP_METHODS, PACE_METHODS, PACE_ZONE_MODELS, POWER_ZONE_MODELS, HR_ZONE_MODELS } from "./training-zones.js";
import { writeIntervalsZones } from "./intervals-zones.js";
import { L } from "./lang.js";
import { localToday } from "./user-time.js";
import { thresholdCheckState, TEST_IDS, manualTestResult } from "./threshold-check-state.js";

// Planned workouts moved or deleted, pairs, session energy and feedback.
export async function handleTrainingEditsApi(request,env,ctx,url,session,internalAuth){
  // Planned workouts: move (drag between days) or delete, in Intervals.icu and locally.
  if(url.pathname==='/app/api/planned/move'||url.pathname==='/app/api/planned/delete'||url.pathname==='/app/api/planned/environment'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json().catch(()=>({}));
      if(url.pathname.endsWith('/move')&&String(body.date||'')<localToday())return Response.json({status:'error',message:L('Trénink jde přesunout jen na dnešek nebo pozdější den.', 'A workout can only be moved to today or a later day.')},{status:400});
      if(url.pathname.endsWith('/environment')){const result=await setPlannedEnvironment(env,body);return Response.json(result,{headers:{'Cache-Control':'no-store'}});}
      return Response.json(url.pathname.endsWith('/move')?await movePlannedEvent(env,body):await deletePlannedEvent(env,body),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  // "Send to" on a planned ride or run: where it went, and a send by hand (planned-send.js).
  if(url.pathname==='/app/api/planned/destinations'||url.pathname==='/app/api/planned/send'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const send=url.pathname.endsWith('/send');
    if(request.method!==(send?'POST':'GET'))return Response.json({message:'Method not allowed'},{status:405});
    if(send&&request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const result=send?await sendPlanned(env,await request.json().catch(()=>({}))):await plannedDestinations(env,url.searchParams.get('id'));
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  // Pairing a planned session with the activity that fulfilled it by hand
  // (manual-pairs.js); every view built from the day sees it after the bump.
  if(url.pathname==='/app/api/training/pair'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const result=await setManualPair(env.DB,env.USER_ID,await request.json().catch(()=>({})));
    if(result.code)return Response.json({status:'error',message:result.message},{status:result.code});
    await bumpCacheVersion(env.DB);
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }
  // Calories of a flagged session (activity-energy-choices.js): count the
  // estimate or keep the watch's number; the energy budget follows it.
  if(url.pathname==='/app/api/training/energy'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const result=await setEnergyChoice(env.DB,env.USER_ID,await request.json().catch(()=>({})));
    if(result.code)return Response.json({status:'error',message:result.message},{status:result.code});
    await bumpCacheVersion(env.DB);
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }
  // The athlete's thumbs up or down on an exercise (the gym plans follow it)
  // and how well a generated workout of any sport fitted (exercise-feedback.js).
  if(url.pathname==='/app/api/feedback/exercise'||url.pathname==='/app/api/feedback/workout'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const workout=url.pathname.endsWith('/workout');
    if(workout&&request.method==='GET')return Response.json({status:'ok',ratings:await workoutRatings(env.DB,url.searchParams.get('date'))},{headers:{'Cache-Control':'no-store'}});
    if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json().catch(()=>({}));
      const result=workout?await saveWorkoutRating(env.DB,body):await saveExerciseFeedback(env.DB,body);
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
}

// The threshold check and the training profile.
export async function handleThresholdApi(request,env,ctx,url,session,internalAuth){
  if(url.pathname==='/app/api/threshold-check'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const today=localToday();
      if(request.method==='GET')return Response.json(await thresholdCheckState(env,ctx,today),{headers:{'Cache-Control':'no-store'}});
      if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      const body=await request.json().catch(()=>({})),sport=body.sport==='run'?'run':'ride',checks=await getChecks(env.DB),check=checks[sport]||null;
      const estimate=body.estimate&&Number(body.estimate.value)>0?{value:Number(body.estimate.value),basis:String(body.estimate.basis||'').slice(0,30)}:check?.estimate||null;
      if(body.action==='schedule'){
        const testId=TEST_IDS[sport].includes(body.testId)?body.testId:TEST_IDS[sport][0];
        if(!validTrainingDay(body.date)||body.date<today)throw new Error(L('Vyber den testu.','Choose the test day.'));
        const planned=await scheduleWorkoutInIntervals(env,env.DB,{workoutId:testId,date:body.date,confirm:true,environment:body.environment==='indoor'?'indoor':'outdoor'});
        await saveCheck(env.DB,sport,{status:'scheduled',testId,testDate:body.date,estimate});
        return Response.json({status:'ok',planned:{date:body.date,eventId:planned.eventId||null}},{headers:{'Cache-Control':'no-store'}});
      }
      if(body.action==='dismiss'||body.action==='cancel'){await saveCheck(env.DB,sport,{status:'dismissed',testId:check?.testId||null,testDate:check?.testDate||null,estimate});return Response.json({status:'ok'});}
      if(body.action==='result'){
        if(!check?.testId)throw new Error(L('Žádný test k vyhodnocení.','No test to evaluate.'));
        const result=manualTestResult(check.testId,body.values||{});
        await saveCheck(env.DB,sport,{...check,status:'measured',result});
        return Response.json({status:'ok',result});
      }
      if(body.action==='apply'){
        // The confirmed values go to the training profile (and to Intervals.icu, as from Nastavení → Zóny).
        const v=body.values||{},num=x=>Number.isFinite(Number(x))&&Number(x)>0?Math.round(Number(x)):null,patch={};
        if(sport==='ride'){if(num(v.ftp)&&num(v.ftp)<=1000)patch.ftp=num(v.ftp);if(num(v.lthr)&&num(v.lthr)<=230)patch.lthr=num(v.lthr);}
        else {if(num(v.runThresholdPace)>=150&&num(v.runThresholdPace)<=600)patch.runThresholdPace=num(v.runThresholdPace);if(num(v.runLthr)&&num(v.runLthr)<=230)patch.runLthr=num(v.runLthr);}
        if(!Object.keys(patch).length)throw new Error(L('Chybí hodnota k uložení.','There is no value to save.'));
        await saveTrainingProfile(env.DB,{...await getTrainingProfile(env.DB),...patch});
        const t=await athleteThresholds(env);
        const intervals=env.INTERVALS_API_KEY?await writeIntervalsZones(env,t).catch(error=>({status:'error',message:error.message})):null;
        await saveCheck(env.DB,sport,{status:'applied',testId:check?.testId||null,testDate:check?.testDate||null,estimate,result:check?.result||null});
        return Response.json({status:'ok',saved:patch,intervals},{headers:{'Cache-Control':'no-store'}});
      }
      throw new Error(L('Neznámá akce.','Unknown action.'));
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  if(url.pathname==='/app/api/training-profile'||url.pathname==='/app/api/training-profile/estimate'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      if(request.method==='POST'&&url.pathname.endsWith('/estimate')){const body=await request.json().catch(()=>({}));return Response.json({status:'ok',...(body.kind==='pace'?estimateThresholdPace(String(body.method||''),body.inputs||{}):estimateFtp(String(body.method||''),body.inputs||{}))});}
      let body=null;
      if(request.method==='POST'){body=await request.json().catch(()=>({}));await saveTrainingProfile(env.DB,body);}
      else if(request.method!=='GET')return Response.json({message:'Method not allowed'},{status:405});
      const t=await athleteThresholds(env);
      // Saved zones go to Intervals.icu too, unless the form says not to.
      const intervals=body&&body.writeIntervals!==false?await writeIntervalsZones(env,t):null;
      return Response.json({status:'ok',intervals,intervalsConnected:Boolean(env.INTERVALS_API_KEY),profile:t.profile,resolved:{ftp:t.ftp,ftpSource:t.source,indoorFtp:t.indoorFtp,intervalsFtp:t.intervalsFtp,latestRideFtp:t.latestRideFtp,lthr:t.lthr,maxHr:t.maxHr,restHr:t.restHr,runThresholdPace:t.runThresholdPace,runPaceSource:t.runPaceSource,intervalsRunPace:t.intervalsRunPace,runLthr:t.runLthr,swimCss:t.swimCss,swimCssSource:t.swimCssSource,poolLength:t.poolLength,openWater:t.openWater},swimZones:t.swimZones,powerZones:t.powerZones,hrZones:t.hrZones,paceZones:t.paceZones,runHrZones:t.runHrZones,
        ftpMethods:Object.entries(FTP_METHODS).map(([id,m])=>({id,label:m.label,inputs:m.inputs.map(([key,label])=>({key,label}))})),
        paceMethods:Object.entries(PACE_METHODS).map(([id,m])=>({id,label:m.label,inputs:m.inputs.map(([key,label])=>({key,label}))})),
        paceZoneModels:Object.entries(PACE_ZONE_MODELS).map(([id,m])=>({id,label:m.label,bounds:m.bounds})),
        powerZoneModels:Object.entries(POWER_ZONE_MODELS).map(([id,m])=>({id,label:m.label,bounds:m.bounds})),hrZoneModels:Object.entries(HR_ZONE_MODELS).map(([id,m])=>({id,label:m.label,reference:m.reference}))},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
}
