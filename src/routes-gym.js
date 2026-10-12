// Gym routes of the dashboard API: equipment, exercises, history and loads, the
// day's plan, its confirmation and exercise technique.
import { trainingSetup, updateTrainingSetup } from "./onboarding.js";
import { fitsEquipment } from "./strength-generator.js";
import app from "./strength-gateway.js";
import { bumpCacheVersion } from "./api-cache.js";
import { exercisePreferences } from "./exercise-feedback.js";
import { gymExerciseCatalog, gymAlternatives, gymLoadEstimate } from "./gym-catalog.js";
import { EXERCISE_STATIONS } from "./gym-equipment.js";
import { equipmentCatalog, detectGymEquipment } from "./gym-equipment-ai.js";
import { getStrengthHistory, strengthSessions, importStrengthHistory, removeManualSets } from "./strength-history.js";
import { assertTrainingAllowed, getAthleteState } from "./athlete-state.js";
import { isStrengthEvent, deletePlannedEvent } from "./planned-events.js";
import { exerciseMuscles } from "./fitness-insights.js";
import { EXERCISE_INTELLIGENCE } from "./strength-intelligence.js";
import { cleanGymRows, catalogNames, adjustGymPlan } from "./gym-adjust.js";
import { readGymPlan, moveGymPlan, cancelGymPlan, restoreGymPlan } from "./gym-plan-store.js";
import { writeStrengthPlanToIntervals } from "./intervals-strength.js";
import { saveOwnExerciseVideo, techniqueFor, ownExerciseVideo, storedTechnique, exerciseInUse, generateTechnique } from "./exercise-technique.js";
import { L } from "./lang.js";
import { localToday } from "./user-time.js";
import { shiftDate } from "./dashboard-shared.js";
import { ensureCoachInboxTable } from "./coach-inbox.js";

// Equipment, exercises, alternatives, history, estimates, muscles and the adjusted plan.
export async function handleGymToolsApi(request,env,ctx,url,session,internalAuth){
  // The athlete's gym: the stations it has (equipment "custom"), and AI that
  // picks them from a photo of the gym or its web page (nothing is saved there).
  if(url.pathname==='/app/api/gym/equipment'){
    if(request.method==='GET'){const training=await trainingSetup(env.DB);return Response.json({status:'ok',stations:equipmentCatalog(),equipment:training.equipment,selected:training.stations||[],gymName:training.gymName||'',gymUrl:training.gymUrl||'',dumbbellWeights:training.dumbbellWeights||[],places:training.places||[],activePlace:training.activePlace||'bodyweight'},{headers:{'Cache-Control':'no-store'}});}
    if(request.method==='POST'){
      if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      // Places (several gyms, home) with the active one; or the flat fields of older clients.
      try{const body=await request.json().catch(()=>({}));const input=Array.isArray(body.places)?{places:body.places,activePlace:body.activePlace}:{equipment:body.equipment,stations:body.stations,gymName:body.gymName,gymUrl:body.gymUrl,...(Array.isArray(body.dumbbellWeights)?{dumbbellWeights:body.dumbbellWeights}:{})};const training=await updateTrainingSetup(env.DB,input);await bumpCacheVersion(env.DB);return Response.json({status:'ok',equipment:training.equipment,selected:training.stations||[],gymName:training.gymName||'',gymUrl:training.gymUrl||'',dumbbellWeights:training.dumbbellWeights||[],places:training.places||[],activePlace:training.activePlace||'bodyweight'});}
      catch(error){return Response.json({message:error.message},{status:400});}
    }
  }
  if(url.pathname==='/app/api/gym/equipment/detect'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(!env.OPENAI_API_KEY)return Response.json({message:L('AI není připojena (chybí OPENAI_API_KEY).', 'AI is not connected (OPENAI_API_KEY is missing).')},{status:503});
    try{const body=await request.json().catch(()=>({}));const r=await detectGymEquipment(env,{images:body.images||(body.image?[body.image]:[]),url:body.url});return Response.json({status:r.found?'ok':'not_found',...r,message:r.found?null:L('Vybavení se nepodařilo poznat. Zkus jinou fotku nebo vyber stroje ručně.', 'The equipment couldn\'t be recognised. Try another photo or pick the machines by hand.')},{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({status:'error',message:error.limit?error.message:String(error.message).slice(0,200)},{status:error.limit?(error.status||429):400});}
  }
  if(url.pathname==='/app/api/gym/exercises'&&request.method==='GET'){
    // fits: possible with the athlete's equipment (the active place), so the app can offer those first.
    // fatigue: how tiring it is, so the app puts an added exercise among the others (big lifts first).
    // liked: the athlete's thumbs up (true) or down (false), so the picker offers the disliked ones last.
    const [setup,taste]=await Promise.all([trainingSetup(env.DB).catch(()=>null),exercisePreferences(env.DB)]);
    const liked=new Set(taste.liked),disliked=new Set(taste.disliked);
    return Response.json({status:'ok',exercises:gymExerciseCatalog().map(e=>({...e,stations:EXERCISE_STATIONS[e.name]||[],muscles:exerciseMuscles(e.name),fits:fitsEquipment(e.name,setup),fatigue:EXERCISE_INTELLIGENCE[e.name]?.fatigue??null,liked:liked.has(e.name)?true:disliked.has(e.name)?false:null}))},{headers:{'Cache-Control':'no-store'}});
  }
  // Replacements for one exercise of a day's plan (workout mode, gym table).
  if(url.pathname==='/app/api/gym/alternatives'&&request.method==='GET'){
    const date=/^\d{4}-\d{2}-\d{2}$/.test(String(url.searchParams.get('date')||''))?url.searchParams.get('date'):localToday(),exercise=String(url.searchParams.get('exercise')||'').slice(0,120);
    const [plan,history,setup,taste]=await Promise.all([readGymPlan(env.DB,date).catch(()=>null),getStrengthHistory(env.DB,500).catch(()=>[]),trainingSetup(env.DB).catch(()=>null),exercisePreferences(env.DB)]);
    // The plan being built is sent along (not saved yet); else the saved day's.
    let sent=[];try{sent=JSON.parse(url.searchParams.get('inPlan')||'[]');}catch{/* none */}
    const inPlan=[...new Set([...(plan?.values||[]).slice(7).map(r=>r?.[1]),...(Array.isArray(sent)?sent:[])].filter(Boolean).map(String))];
    // Only what the athlete's gym has (the active place's stations).
    return Response.json({status:'ok',exercise,alternatives:gymAlternatives(exercise,history,inPlan,taste).filter(a=>fitsEquipment(a.name,setup))},{headers:{'Cache-Control':'no-store'}});
  }
  // The work sets of the last months by exercise and day (the app's exercise
  // history, "minule 82,5 kg × 6" and the suggested load of the next sets).
  if(url.pathname==='/app/api/gym/history'&&request.method==='GET'){
    const exercises=await strengthSessions(env.DB,{days:url.searchParams.get('days')||180,today:localToday()}).catch(error=>{console.error('Gym history read failed',error);return [];});
    return Response.json({status:'ok',exercises},{headers:{'Cache-Control':'no-store'}});
  }
  // Loads for exercises added by hand, or a plan's sets left without a weight.
  if(url.pathname==='/app/api/gym/estimate'&&request.method==='GET'){
    let names=[];try{names=JSON.parse(url.searchParams.get('names')||'[]');}catch{}
    const list=(Array.isArray(names)?names:[]).slice(0,30).map(n=>String(n).slice(0,120)).filter(Boolean);
    const history=await getStrengthHistory(env.DB,500).catch(()=>[]);
    return Response.json({status:'ok',estimates:Object.fromEntries(list.map(name=>[name,gymLoadEstimate(name,history)]).filter(([,e])=>e))},{headers:{'Cache-Control':'no-store'}});
  }
  // Muscles of exercises added to a proposal (its body figure).
  if(url.pathname==='/app/api/gym/muscles'&&request.method==='GET'){
    let names=[];try{names=JSON.parse(url.searchParams.get('names')||'[]');}catch{}
    const list=(Array.isArray(names)?names:[]).slice(0,30).map(n=>String(n).slice(0,120)).filter(Boolean);
    return Response.json({status:'ok',muscles:Object.fromEntries(list.map(name=>[name,exerciseMuscles(name)]))},{headers:{'Cache-Control':'no-store'}});
  }
  // A plan changed by the athlete's words in its preview; nothing is saved here.
  if(url.pathname==='/app/api/gym/adjust'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(!env.OPENAI_API_KEY)return Response.json({message:L('AI není připojena (chybí OPENAI_API_KEY).', 'AI is not connected (OPENAI_API_KEY is missing).')},{status:503});
    try{
      const body=await request.json().catch(()=>({})),text=String(body.request||'').trim().slice(0,300);
      if(!text)throw new Error(L('Napiš, co v tréninku změnit.', 'Write what to change in the workout.'));
      const rows=cleanGymRows(body.rows,new Set([...catalogNames(),...(Array.isArray(body.rows)?body.rows:[]).map(r=>String(r?.[1]??'').trim()).filter(Boolean)]));
      const [history,taste]=await Promise.all([getStrengthHistory(env.DB,300).catch(()=>[]),exercisePreferences(env.DB)]);
      const result=await adjustGymPlan(env,{rows,request:text,history,taste});
      const muscles=Object.fromEntries([...new Set(result.rows.map(r=>r[1]))].map(name=>[name,exerciseMuscles(name)]));
      return Response.json({status:'ok',...result,muscles},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.limit?error.message:error.ai?L('AI úprava se nepovedla: ', 'The AI edit failed: ')+error.message:error.message},{status:error.limit?(error.status||429):error.ai?502:400})}
  }
}

// The day's gym plan, its confirmation and an exercise's technique.
export async function handleGymPlanApi(request,env,ctx,url,session,internalAuth){
  if (url.pathname === "/app/api/gym") {
    if (request.method === "GET") {
      // The day's plan and the history both live in D1.
      const date=/^\d{4}-\d{2}-\d{2}$/.test(String(url.searchParams.get('date')||''))?url.searchParams.get('date'):localToday();
      let data={status:"ok",values:[],videoLinks:[]};
      try { const plan=await readGymPlan(env.DB,date); data={status:"ok",date,values:plan.stored?plan.values:[],videoLinks:[],stored:plan.stored,cancelled:plan.cancelled,recoverable:plan.recoverable}; }
      catch(error) { console.error("Gym plan read failed",error); data={status:"partial",values:[],videoLinks:[],message:L("Plán se nepodařilo načíst.", "The plan couldn't be loaded.")}; }
      let history=[];
      try { history=await getStrengthHistory(env.DB,500); } catch(error) { console.error("Gym history read failed",error); }
      // Muscles each exercise of the day loads (plan and saved sets), for the body figure.
      const names=new Set([...(data.values||[]).slice(7).map(r=>r?.[1]),...history.filter(r=>String(r.workout_date||'').slice(0,10)===date).map(r=>r.exercise)].filter(Boolean));
      const muscles=Object.fromEntries([...names].map(name=>[name,exerciseMuscles(name)]));
      return Response.json({...data,history,muscles,storage:"d1"},{headers:{"Cache-Control":"no-store"}});
    }
    if (request.method === "POST") {
      try {
      const body = await request.json().catch(() => ({}));
      const date = body?.date || localToday();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return Response.json({message:L('Neplatné datum.', 'Invalid date.')},{status:400});
      // A saved plan without its Intervals.icu event, dragged to another day in the week.
      if(body.action==='move'){
        const to=String(body.to||'');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<localToday())return Response.json({message:L('Gym jde přesunout jen na dnešek nebo pozdější den.', 'The gym session can only be moved to today or a later day.')},{status:400});
        const moved=await moveGymPlan(env.DB,date,to);
        if(!moved.moved)return Response.json({message:L('Gym se nepodařilo přesunout: cílový den už má gym plán, nebo jsou v tréninku zapsané série.', 'The gym session couldn\'t be moved: the target day already has a gym plan, or the workout has logged sets.')},{status:409});
        return Response.json({status:'ok',date:to,message:L('Gym je přesunutý.', 'The gym session has been moved.')},{headers:{'Cache-Control':'no-store'}});
      }
      if(body.action==='cancel'){
        const rows=(await env.DB.prepare("SELECT external_id,payload_json FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local') AND data_type='planned-workout' AND start_time>=? AND start_time<?").bind(env.USER_ID,date,shiftDate(date,1)).all()).results||[];
        for(const row of rows){let event;try{event=JSON.parse(row.payload_json)}catch{continue}if(isStrengthEvent(event))await deletePlannedEvent(env,{eventId:row.external_id});}
        await cancelGymPlan(env.DB,date);
        return Response.json({status:'ok',date,cancelled:true,message:L('Posilovna je zrušená. Původní plán a výsledky zůstaly uložené.', 'The gym session is cancelled. The original plan and results stay saved.')},{headers:{'Cache-Control':'no-store'}});
      }
      // Gym put back on the day in the week plan: only the cancellation goes,
      // nothing is written to Intervals.icu until a plan is saved or confirmed.
      if(body.action==='uncancel'){
        await restoreGymPlan(env.DB,date);
        return Response.json({status:'ok',date,cancelled:false,message:L('Gym je na tento den znovu v plánu.', 'The gym session is back in the plan for this day.')},{headers:{'Cache-Control':'no-store'}});
      }
      if(body.action==='restore'){
        assertTrainingAllowed(await getAthleteState(env.DB));
        const plan=await readGymPlan(env.DB,date,{includeCancelled:true});
        if(!plan.cancelled||!plan.stored)return Response.json({message:L('Není tu zrušený plán k obnovení.', 'There\'s no cancelled plan to restore.')},{status:409});
        const event=plan.cancelledEvent;
        let intervals=null;
        if(env.INTERVALS_API_KEY)intervals=await writeStrengthPlanToIntervals(env,{date,rows:plan.values.slice(7),planName:plan.values[2]?.[3]||'Gym',rationale:plan.values[3]?.[1]||''},{durationMinutes:event?.moving_time?event.moving_time/60:60,startTime:String(event?.start_date_local||'').slice(11,16)||'00:00'});
        await restoreGymPlan(env.DB,date);
        return Response.json({status:'ok',date,intervals,message:L('Původní plán obnoven.', 'Original plan restored.')},{headers:{'Cache-Control':'no-store'}});
      }
      const storedPlan=await readGymPlan(env.DB,date);
      if(storedPlan.cancelled)return Response.json({message:L('Tento plán je zrušený. Nejdřív jej obnov, nebo vytvoř nový.', 'This plan is cancelled. Restore it first or create a new one.')},{status:409});
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gym_plans (user_id INTEGER NOT NULL, workout_date TEXT NOT NULL, values_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, workout_date))`).run();

      if (body?.action === "plan") {
        const values = Array.isArray(body?.values) ? body.values : null;
        if (!values) return Response.json({status:"error",message:"values must be a 2D array"},{status:400});
        await env.DB.prepare(`INSERT INTO gym_plans(user_id,workout_date,values_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,workout_date) DO UPDATE SET values_json=excluded.values_json,updated_at=CURRENT_TIMESTAMP`).bind(env.USER_ID,date,JSON.stringify(values)).run();
        return Response.json({status:"ok",storage:"d1",message:L("Plán uložen.", "Plan saved.")},{headers:{"Cache-Control":"no-store"}});
      }

      const values = Array.isArray(body?.values) ? body.values : null;
      if (!values) return Response.json({status:"error",message:"values must be a 2D array"},{status:400});
      const completedSets = rows => rows.map((r,i)=>({
        type:String(r?.[0]||"WORK").toUpperCase(), exercise:r?.[1]||"", setNo:r?.[2],
        plannedKg:r?.[3], plannedReps:r?.[4], actualKg:r?.[5], actualReps:r?.[6],
        rpe:r?.[7], completed:["TRUE","true","1","ANO","ano","✓","☑"].includes(String(r?.[8]??"")), note:r?.[9]||"",toFailure:r?.[11]||false,superset:r?.[12]||''
      })).filter(x=>x.exercise && /^(WARMUP|WORK)$/.test(x.type) && x.completed);
      const sets = completedSets(values);
      let historyResult=null;
      if(sets.length) historyResult=await importStrengthHistory(env.DB,{date,sets});
      // A saved set or exercise taken out of the day leaves the history too
      // (only the keys this day's own saves wrote).
      const before = storedPlan.stored ? completedSets(storedPlan.values.slice(7)).length : 0;
      if(before>sets.length) await removeManualSets(env.DB,date,sets.length,before);
      // Keep the editable workout snapshot together with the completed-set
      // history.  The UI can then be safely reloaded after every autosave.
      const storedValues = Array.isArray(body?.fullValues) ? body.fullValues : values;
      await env.DB.prepare(`INSERT INTO gym_plans(user_id,workout_date,values_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,workout_date) DO UPDATE SET values_json=excluded.values_json,updated_at=CURRENT_TIMESTAMP`).bind(env.USER_ID,date,JSON.stringify(storedValues)).run();
      const history=await getStrengthHistory(env.DB,500);
      return Response.json({status:"ok",storage:"d1",values:storedValues,history,historySaved:historyResult,message:sets.length?L("Workout uložen do interní databáze.", "Workout saved to the app database."):L("Změny plánu jsou uložené; dokončené série označ Hotovo.", "Plan changes are saved; mark completed sets as Done.")},{headers:{"Cache-Control":"no-store"}});
      } catch(error) {
        console.error("Gym save failed", error);
        return Response.json({status:"error",message:"Gym save: "+(error?.message||"unknown error")},{status:500,headers:{"Cache-Control":"no-store"}});
      }
    }
    return Response.json({status:"error",message:"Method not allowed"},{status:405});
  }

  if(url.pathname==='/app/api/gym/confirm'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      assertTrainingAllowed(await getAthleteState(env.DB));
      const body=await request.json();await ensureCoachInboxTable(env.DB);
      const row=await env.DB.prepare('SELECT * FROM coach_inbox WHERE user_id=? AND id=?').bind(env.USER_ID,Number(body.draftId)).first();
      if(!row)throw new Error(L('Návrh už neexistuje.', 'The proposal no longer exists.'));
      if(row.status==='confirmed')return Response.json({status:'ok',message:L('Návrh už je uložený.', 'The proposal is already saved.')});
      const draft=JSON.parse(row.draft_json),plan=draft.plan;
      if(draft.kind!=='gym_preview'||!plan||plan.date<localToday())throw new Error(L('Neplatný nebo starý návrh.', 'Invalid or outdated proposal.'));
      // The proposal as changed in its preview (exercises from the catalog or the proposal itself).
      if(Array.isArray(body.rows))plan.rows=cleanGymRows(body.rows,new Set([...catalogNames(),...(plan.rows||[]).map(r=>r?.[1]).filter(Boolean)]));
      if((await readGymPlan(env.DB,plan.date)).stored)throw new Error(L('Na tento den již existuje gym plán. Otevři jej a uprav ho.', 'A gym plan already exists for this day. Open it and edit it.'));
      const r=await app.fetch(new Request('https://internal/strength/write-plan',{method:'POST',headers:{...internalAuth,'Content-Type':'application/json'},body:JSON.stringify(plan)}),env,ctx);
      if(!r.ok)throw new Error(L('Gym plán se nepodařilo uložit.', 'The gym plan couldn\'t be saved.'));
      const intervals=await writeStrengthPlanToIntervals(env,plan,{durationMinutes:draft.minutes,startTime:draft.startTime||'00:00'}).catch(error=>({status:'error',message:error.message}));
      await env.DB.prepare("UPDATE coach_inbox SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(env.USER_ID,row.id).run();
      return Response.json({status:'ok',intervals,eventId:intervals?.eventId!=null?'planned:'+intervals.eventId:null,message:L('Gym plán je uložený.', 'The gym plan is saved.')},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:409})}
  }
  // Technique card of one exercise (text and video), plus the athlete's own video link.
  if(url.pathname==='/app/api/gym/technique'){
    if(request.method==='POST'){
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      const body=await request.json().catch(()=>({}));
      try{await saveOwnExerciseVideo(env.DB,body.exercise,body.url);}catch(error){return Response.json({message:error.message},{status:400});}
      return Response.json({status:'ok',technique:techniqueFor(body.exercise,await ownExerciseVideo(env.DB,body.exercise))},{headers:{'Cache-Control':'no-store'}});
    }
    const exercise=String(url.searchParams.get('exercise')||'').slice(0,120),own=exercise?await ownExerciseVideo(env.DB,exercise).catch(()=>null):null;
    let technique=techniqueFor(exercise,own);
    // Outside the catalog: the stored card, or one written now (once) and kept.
    if(exercise&&!technique?.steps?.length){
      let stored=await storedTechnique(env.DB,exercise).catch(()=>null);
      if(!stored&&env.OPENAI_API_KEY&&await exerciseInUse(env.DB,exercise))stored=await generateTechnique(env,exercise).catch(error=>{console.error('Technique generation failed',error.message);return null;});
      if(stored)technique=techniqueFor(exercise,own,stored);
    }
    return technique?Response.json({status:'ok',technique},{headers:{'Cache-Control':'no-store'}}):Response.json({message:L('Cvik není v databázi.', 'The exercise isn\'t in the database.')},{status:404});
  }
}
