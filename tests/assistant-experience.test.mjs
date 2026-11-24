import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { getAthleteState,updateAthleteState } from '../src/athlete-state.js';
import { buildCoachCouncil } from '../src/coach-engine.js';
import { withLang } from '../src/lang.js';
import { planValues } from '../src/gym-plan-store.js';
import { parseStrengthPlan } from '../src/strength-history.js';
import { todayGymContext,prepareGymSwap,applyGymSwap } from '../src/coach-gym-adjustment.js';
import { validateCoachActions } from '../src/coach-actions.js';
import { askCoach,assistantTask,aiFailureText } from '../src/coach-assistant.js';
import { partialCoachAnswer,readOpenAIStream,assistantStreamResponse } from '../src/assistant-stream.js';
import { startDashboardSync,dashboardSyncStatus } from '../src/dashboard-sync.js';
const date='2026-10-04';
const make=(exercise,done=false)=>['WORK',exercise,'1','10','8–12','','','',done?'TRUE':'FALSE','Poznámka','','TRUE','A'];
const gym={values:planValues({date,rows:[make('DB Arnold press'),make('Low row',true)]}),history:[]};
test('status expires on the chosen Prague calendar day without losing preferences',async()=>{
  const db=scopedDb(createD1(),1);
  await updateAthleteState(db,{memory:'Nemám rád masáže'},{date});
  await updateAthleteState(db,{status:'sick',note:'Nachlazení',statusUntil:'2026-10-05'},{date});
  assert.equal((await getAthleteState(db,{date})).status,'sick');
  const expired=await getAthleteState(db,{date:'2026-10-05'});
  assert.equal(expired.status,'active');assert.equal(expired.note,'');assert.equal(expired.statusUntil,null);
  assert.deepEqual(expired.memories,['Nemám rád masáže']);
  await updateAthleteState(db,{status:'on_break'},{date:'2026-10-05'});
  assert.equal((await getAthleteState(db,{date:'2027-01-01'})).status,'on_break');
  await assert.rejects(updateAthleteState(db,{status:'sick',statusUntil:'2026-02-30'},{date}),/Konec/);
  await assert.rejects(updateAthleteState(db,{status:'sick',statusUntil:date},{date}),/Konec/);
});
test('gym context includes actual planned sets and usable replacements',()=>{
  const context=todayGymContext(gym,date),arnold=context.exercises[0];
  assert.equal(arnold.name,'DB Arnold press');assert.equal(arnold.sets[0].kg,10);assert.equal(arnold.sets[0].toFailure,true);
  assert.ok(arnold.alternatives.some(a=>a.name==='DB shoulder press'));
  assert.equal(todayGymContext(gym,'2026-10-05'),null);
  // Alternatives and swaps follow the athlete's own equipment, not the default gym.
  const home={...gym,equipment:{equipment:'bodyweight',stations:[]}};
  assert.ok(!todayGymContext(home,date).exercises[0].alternatives.some(a=>a.name==='DB shoulder press'));
  assert.throws(()=>prepareGymSwap(home,'DB Arnold press','DB shoulder press','Náhrada'),/katalogu/);
});
test('confirmed exercise swap preserves logged sets, options and unrelated edits',()=>{
  const action=prepareGymSwap(gym,'DB Arnold press','DB shoulder press','Jednodušší tlak.'),changed=structuredClone(gym.values);
  changed.at(-1)[5]='45';changed.at(-1)[6]='8';
  const values=applyGymSwap(changed,action),context=todayGymContext({values},date);
  assert.deepEqual(values.at(-1),changed.at(-1));assert.deepEqual(values.slice(0,7),changed.slice(0,7));
  assert.equal(context.exercises[0].name,'DB shoulder press');assert.equal(context.exercises[0].sets[0].superset,'A');assert.equal(context.exercises[0].sets[0].toFailure,true);
  // Nothing done before that relates to it: no guessed weight.
  assert.equal(context.exercises[0].sets[0].kg,null);assert.equal(action.kg,null);
  changed[7][8]='TRUE';assert.throws(()=>applyGymSwap(changed,action),/mezitím/);
  assert.throws(()=>prepareGymSwap(gym,'Low row','Lat pulldown','Náhrada'),/Rozcvičený/);
  assert.throws(()=>prepareGymSwap(gym,'DB Arnold press','Pivot leg press','Náhrada'),/partii/);
  // A remembered shoulder pain refuses an overhead press and hides it from the alternatives (Revize 2026-10-16, nález 24).
  assert.throws(()=>prepareGymSwap(gym,'DB Arnold press','DB shoulder press','Náhrada',['Bolí mě rameno']),/bolí|hurts/);
  assert.ok(!todayGymContext(gym,date,['Bolí mě rameno']).exercises[0].alternatives.some(a=>/press/i.test(a.name)));
  assert.ok(todayGymContext(gym,date).exercises[0].alternatives.some(a=>/press/i.test(a.name)));
});
test('adjustment requests offer a swap and do not default to cancelling gym',()=>{
  const context={athleteState:'active',userMessage:'Upravil bys dnešní cvičení?',gymPlan:gym,week:[{date,planned:[{id:'planned:gym',name:'Gym'}]}]};
  const actions=[{type:'rest',eventId:'planned:gym',reason:'Včera jsi jel kolo.'},{type:'gym_swap',date,fromExercise:'DB Arnold press',toExercise:'DB shoulder press',reason:'Jednodušší tlak.'}];
  assert.deepEqual(validateCoachActions(actions,context,date).map(a=>a.type),['gym_swap']);
  assert.equal(validateCoachActions(actions,{...context,userMessage:'Bolí mě rameno, uprav dnešní cvičení'},date)[0].type,'rest');
  assert.deepEqual(validateCoachActions([actions[1]],{...context,athleteState:'sick'},date),[]);
});
test('a short exercise adjustment uses Sol with low reasoning and the current plan',async()=>{
  const original=globalThis.fetch,calls=[];globalThis.fetch=async(_,options)=>{calls.push(JSON.parse(options.body));return Response.json({output_text:'Odpověď'});};
  try{await askCoach({OPENAI_API_KEY:'test'},'Změnil bys něco na dnešním cvičení?',{todayGym:todayGymContext(gym,date)});
    assert.equal(assistantTask('Uprav dnešní cvičení'),'adjustment');assert.equal(calls[0].model,'gpt-6.2-sol');assert.equal(calls[0].reasoning.effort,'low');assert.match(JSON.stringify(calls[0].input),/DB Arnold press/);
  }finally{globalThis.fetch=original;}
});
test('council hides empty nutrition and boilerplate, and follows the athlete sport',()=>{
  assert.deepEqual(buildCoachCouncil({date,daily:{training:{},nutrition:{calorieTarget:2400,foodLog:{totals:{kcal:0}}}}}).coaches,[]);
  const r=buildCoachCouncil({date,focus:{sportLabel:'běh'},gym,daily:{training:{planned:[{name:'Gym',type:'WeightTraining'}]}}});
  assert.equal(r.coaches[0].title,'Silový trenér (běh)');assert.match(r.coaches[0].actions[0],/DB Arnold press/);assert.equal(r.coaches[0].evidence,undefined);
});
test('morning summary combines fresh sleep, yesterday load and current form without inventing missing data',()=>{
  const r=buildCoachCouncil({date,sleepSessions:[{date,durationMin:330}],fitness:{tsb:-28},yesterday:{training:{completed:[{name:'Ride',durationHours:3,tss:180}]}}});
  assert.match(r.morningSummary.text,/5 h 30 min/);assert.match(r.morningSummary.text,/180 TSS/);assert.match(r.morningSummary.recommendation,/nic v plánu/);assert.doesNotMatch(r.morningSummary.recommendation,/posilovn/i);
  assert.match(r.morningSummary.text,/Dnes nemáš nic v plánu\./);assert.equal(r.morningSummary.headline,'Den na odpočinek');
  // The advice names only what today holds: a planned ride gets its own line, no gym unless there is one.
  const short=[{date,durationMin:330}];
  const ride=buildCoachCouncil({date,sleepSessions:short,fitness:{tsb:-5},daily:{training:{planned:[{id:1,name:'Threshold 4×5',type:'Ride'}]}}}).morningSummary;
  assert.match(ride.recommendation,/„Threshold 4×5“/);assert.doesNotMatch(ride.recommendation,/posilovn/i);assert.match(ride.text,/Dnes v plánu: Threshold 4×5\./);
  const lifting=buildCoachCouncil({date,sleepSessions:short,fitness:{tsb:-5},gym}).morningSummary;
  assert.match(lifting.recommendation,/V posilovně uber/);assert.doesNotMatch(lifting.recommendation,/„/);
  const normal=buildCoachCouncil({date,sleepSessions:[{date,durationMin:470}],fitness:{tsb:-5},daily:{training:{planned:[{id:2,name:'Endurance',type:'Ride'}]}}}).morningSummary;
  assert.match(normal.recommendation,/Dnešní plán \(Endurance\) můžeš dodržet/);
  assert.equal(buildCoachCouncil({date,sleepSessions:[{date:'2026-09-01',durationMin:480}]}).morningSummary,null);
  // The client waits for last night's sleep and starts the card at the wake-up time.
  assert.deepEqual(r.morningSummary.sleepSync,{tracked:true,today:true,wokeAt:null});
  const woke=buildCoachCouncil({date,sleepSessions:[{endTime:date+'T05:40:00Z',durationMin:420}],fitness:{tsb:-5}}).morningSummary.sleepSync;
  assert.deepEqual(woke,{tracked:true,today:true,wokeAt:date+'T05:40:00Z'});
  const waiting=buildCoachCouncil({date,sleepSessions:[{date:'2026-10-03',durationMin:420}],fitness:{tsb:-5}}).morningSummary.sleepSync;
  assert.deepEqual(waiting,{tracked:true,today:false,wokeAt:null});
  assert.equal(buildCoachCouncil({date,fitness:{tsb:-5}}).morningSummary.sleepSync.tracked,false);
});
test('morning summary counts a workout already done today instead of saying nothing is planned',()=>{
  // Petr 2026-10-25: a gym session from the watch (no name, only its type), the ride moved to tomorrow, a short night.
  const daily={training:{planned:[],completed:[{id:'apple-health:1',type:'WeightTraining',durationHours:1.1,calories:463}]}};
  const r=withLang('en',()=>buildCoachCouncil({date,sleepSessions:[{date,durationMin:319}],fitness:{tsb:22},daily}));
  const s=r.morningSummary;
  assert.doesNotMatch(s.text,/Nothing planned/);assert.match(s.text,/Done today: Gym, 1 h 6 min\./);
  assert.equal(s.headline,'Time to recover');assert.match(s.recommendation,/^Today's training \(Gym\) is done\. After a short night/);assert.doesNotMatch(s.recommendation,/walk/);
  // The refuel line names the workout in words, not its type.
  assert.match(r.priorities.join(' '),/After Gym, 463 kcal/);assert.doesNotMatch(r.priorities.join(' '),/WeightTraining/);
  // A gym plan done with the watch is not still planned; a ride left for later still is.
  const both=buildCoachCouncil({date,sleepSessions:[{date,durationMin:470}],fitness:{tsb:-5},daily:{training:{planned:[{id:3,name:'Full body',type:'WeightTraining'},{id:4,name:'Endurance',type:'Ride'}],completed:[{id:'g',type:'WeightTraining',durationHours:1}]}}}).morningSummary;
  assert.match(both.text,/Dnes hotovo: Posilovna, 1 h\. Ještě v plánu: Endurance\./);
  // A gym session logged in the app without a watch workout counts too.
  const finished={values:planValues({date,rows:[make('DB Arnold press',true),make('Low row',true)]}),history:[]};
  const app=buildCoachCouncil({date,sleepSessions:[{date,durationMin:470}],fitness:{tsb:-5},gym:finished}).morningSummary;
  assert.match(app.text,/Dnes hotovo: Posilovna\./);assert.match(app.recommendation,/^Dnešní trénink \(Posilovna\) máš za sebou\. Zbytek dne patří regeneraci/);
});
test('partial structured answer handles quotes, Unicode and unfinished escapes',()=>{
  assert.equal(partialCoachAnswer('{"answer":"Ahoj\\nZměň \\"cvik\\"'),'Ahoj\nZměň "cvik"');
  assert.equal(partialCoachAnswer('{"answer":"Ahoj\\u01'),'Ahoj');
  assert.equal(partialCoachAnswer('{"answer":"Ahoj","actions":[{"type":"rest"}]}'),'Ahoj');
  assert.equal(partialCoachAnswer('{"actions":[]}'),'');
});
test('OpenAI stream survives split bytes and requires a completed response',async()=>{
  const encoder=new TextEncoder(),events=[{type:'response.output_text.delta',delta:'Žluťoučký'},{type:'response.completed',response:{output_text:'Žluťoučký',usage:{output_tokens:3}}}];
  const bytes=encoder.encode(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')),chunks=[];
  const response=new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}}));
  const final=await readOpenAIStream(response,delta=>chunks.push(delta));assert.equal(chunks.join(''),'Žluťoučký');assert.equal(final.usage.output_tokens,3);
  await assert.rejects(readOpenAIStream(new Response('data: '+JSON.stringify(events[0])+'\n\n'),()=>{}),/přerušilo/);
  const stream=assistantStreamResponse(async emit=>{emit('Ahoj');return {answer:'Ahoj',actions:[]};});
  const frames=(await stream.text()).trim().split('\n').map(JSON.parse);assert.deepEqual(frames.map(f=>f.type),['start','answer','done']);
});
test('tracked sync deduplicates running work and reports partial failures by user',async()=>{
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2),pending=[];let finish;
  const work=new Promise(resolve=>{finish=resolve;});
  const first=await startDashboardSync(db,{waitUntil:p=>pending.push(p)},()=>work),again=await startDashboardSync(db,{waitUntil:p=>pending.push(p)},()=>{throw Error('Duplicate');});
  assert.equal(first.runId,again.runId);assert.equal(pending.length,1);assert.equal((await dashboardSyncStatus(other)).status,'idle');
  finish([{source:'google',status:'partial'}]);await pending[0];assert.equal((await dashboardSyncStatus(db)).status,'partial');
});
test('coach streams readable answer before returning validated structured output',async()=>{
  const original=globalThis.fetch,reply={answer:'Změň „tlak“.\nNech rezervu.',actions:[]},serialized=JSON.stringify(reply),seen=[];let request;
  globalThis.fetch=async(_,options)=>{
    request=JSON.parse(options.body);const encoder=new TextEncoder();
    return new Response(new ReadableStream({start(c){
      for(let i=0;i<serialized.length;i+=5)c.enqueue(encoder.encode('data: '+JSON.stringify({type:'response.output_text.delta',delta:serialized.slice(i,i+5)})+'\n\n'));
      c.enqueue(encoder.encode('data: '+JSON.stringify({type:'response.completed',response:{model:'gpt-6-sol',output_text:serialized,usage:{output_tokens:50}}})+'\n\n'));c.close();
    }}));
  };
  try{const result=await askCoach({OPENAI_API_KEY:'test'},'Uprav dnešní cvičení',{}, {actions:true,onAnswer:answer=>seen.push(answer)});
    assert.equal(request.stream,true);assert.equal(request.text.format.name,'coach_reply');assert.ok(seen.length>1);assert.equal(seen.at(-1),reply.answer);assert.equal(result.answer,reply.answer);assert.equal(result.usage.output_tokens,50);assert.deepEqual(result.actions,[]);
  }finally{globalThis.fetch=original;}
});
test('the stream names the chat, and a failure reads in the coach\'s voice without a status code (audit 23.1, 23.4)',async()=>{
  const frames=async work=>(await assistantStreamResponse(work).text()).trim().split('\n').map(JSON.parse);
  const named=await frames(async(emit,progress,chat)=>{chat(42);emit('Ahoj');return {answer:'Ahoj',chatId:42,actions:[]};});
  assert.deepEqual(named.map(f=>f.type),['start','chat','answer','done']);assert.equal(named[1].chatId,42);
  const busy=Object.assign(new Error(aiFailureText(429)),{ai:true,status:429}),down=Object.assign(new Error(aiFailureText(503)),{ai:true,status:503});
  for(const [error,text] of [[busy,'Kouč teď neodpověděl, AI služba je přetížená. Zkus to za chvíli.'],[down,'Kouč teď neodpověděl. Zkus to za chvíli.'],[new Error('Database unavailable'),'Kouč teď neodpověděl. Zkus to za chvíli.']]){
    const last=(await frames(async()=>{throw error;})).at(-1);
    assert.equal(last.type,'error');assert.equal(last.message,text);assert.doesNotMatch(last.message,/AI \d{3}|\)\./);
  }
  const limit=Object.assign(new Error('Denní limit AI je vyčerpaný.'),{limit:true});
  assert.equal((await frames(async()=>{throw limit;})).at(-1).message,'Denní limit AI je vyčerpaný.');
  // 617 #6: the reason goes with the text, so the app can say it.
  const reasons=[];for(const error of [limit,busy,down,Object.assign(new Error('t'),{name:'TimeoutError'}),new Error('Database unavailable')])reasons.push((await frames(async()=>{throw error;})).at(-1).reason);
  assert.deepEqual(reasons,['limit','busy','ai','timeout','other']);
});

test('failed streamed work never publishes a completed reply or proposed actions',async()=>{
  const response=assistantStreamResponse(async emit=>{emit('Část odpovědi');throw new Error('Database unavailable');});
  const frames=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(frames.map(f=>f.type),['start','answer','error']);assert.doesNotMatch(frames.at(-1).message,/Database/);
});

test('a one-leg press replacing the leg press takes no weight from it (Coach evaluation run 26, S19)',()=>{
  const date='2026-10-16',history=[-14,-10,-7,-3].flatMap(d=>[1,2,3].map(n=>({workout_date:new Date(Date.parse(date+'T12:00:00Z')+d*86400000).toISOString().slice(0,10),exercise:'Pivot leg press',set_no:n,actual_kg:150,actual_reps:10,rpe:8,completed:1,type:'WORK'})));
  const values=planValues({date,planName:'Celé tělo',rows:[1,2,3].map(n=>['WORK','Pivot leg press',String(n),'150','8-12','','','','FALSE','[Pauza 120 s]','','FALSE','',''])});
  const swap=prepareGymSwap({values,history},'Pivot leg press','Single-Leg Press','Leg press je obsazený.');
  assert.equal(swap.kg,null);assert.ok(swap.replacementRows.filter(r=>r[0]==='WORK').every(r=>r[3]===''),JSON.stringify(swap.replacementRows));
});
// Petr 2026-11-14: One Arm Dumbbell Bench Press (3 sets, each left and right)
// swapped for DB bench press gave 6 work sets and lost the intensity labels.
test('a swap keeps the sets of a one-sided exercise and their labels',()=>{
  const row=(n,side,intensity)=>['WORK','One Arm Dumbbell Bench Press',String(n),'16','8–12','','','','FALSE','','','FALSE','',side,intensity];
  const values=planValues({date,rows:[1,2,3].flatMap(n=>[row(n,'L',n===3?'H':'M'),row(n,'P',n===3?'H':'M')]).concat([row(4,'L','H')])});
  const action=prepareGymSwap({values,history:[]},'One Arm Dumbbell Bench Press','DB bench press','Oboustranný tlak.');
  // The weaker side's extra set stays with the one-sided exercise.
  assert.equal(action.sets,3);
  const work=todayGymContext({values:applyGymSwap(values,action)},date).exercises[0].sets;
  assert.equal(work.length,3);assert.deepEqual(work.map(s=>s.set),[1,2,3]);
  const parsed=applyGymSwap(values,action).filter(r=>r[0]==='WORK');
  assert.deepEqual(parsed.map(r=>r[14]),['M','M','H']);assert.ok(parsed.every(r=>r[13]===''));
  // Back to one-sided: each set left and right again.
  const two=planValues({date,rows:[1,2,3].map(n=>['WORK','DB bench press',String(n),'20','6–10','','','','FALSE','','','FALSE','','','M'])});
  const back=prepareGymSwap({values:two,history:[]},'DB bench press','One Arm Dumbbell Bench Press','Jednoruč.');
  assert.equal(back.sets,3);assert.deepEqual(back.replacementRows.filter(r=>r[0]==='WORK').map(r=>r[13]),['L','P','L','P','L','P']);
});

// Petr 2026-11-14: "chtěl bych tam i něco na biceps" got "neumím přidat"; a changed
// exercise should go where it belongs, not just take the old place.
test('the coach adds and removes an exercise, and the plan keeps a sensible order',async()=>{
  const { prepareGymAdd,applyGymAdd,prepareGymRemove,applyGymRemove,placeExercise,applyGymChange }=await import('../src/coach-gym-adjustment.js');
  const work=(name,n=3,kg='20')=>Array.from({length:n},(_,i)=>['WORK',name,String(i+1),kg,'8–12','','','','FALSE','','','FALSE','','','']);
  const warm=name=>[1,2,3].map(i=>['WARMUP',name,String(i),'10',['8','5','3'][i-1],'','','','FALSE','[WARMUP]','','FALSE','','','']);
  const values=planValues({date,rows:[...warm('Low row'),...work('Low row'),...work('Cable triceps extension'),...work('Lat pulldown')]});
  const plan={values,history:[]};
  const context=todayGymContext(plan,date,[],[],['biceps']);
  assert.ok(context.addable.biceps.some(a=>a.name==='DB curl'));
  const add=prepareGymAdd(plan,'DB curl','Biceps navíc.');
  assert.equal(add.sets,3);assert.deepEqual([add.position,add.of],[4,4]);
  const added=applyGymChange(values,add),names=rows=>[...new Set(parseStrengthPlan(rows).rows.map(r=>r.exercise))];
  // The others keep their order; the curl goes behind them, with the small muscles.
  assert.deepEqual(names(added),['Low row','Cable triceps extension','Lat pulldown','DB curl']);
  assert.equal(parseStrengthPlan(added).rows.filter(r=>r.exercise==='DB curl').length,3);
  // A one-sided exercise goes left and right, as the generator writes it.
  assert.deepEqual(parseStrengthPlan(applyGymChange(values,prepareGymAdd(plan,'Dumbbell Concentration Curl','r'))).rows.filter(r=>r.exercise==='Dumbbell Concentration Curl').map(r=>r.side),['L','P','L','P','L','P']);
  assert.throws(()=>applyGymAdd(added,add),/změnil|changed/);
  assert.throws(()=>prepareGymAdd(plan,'Low row','r'),/už v plánu|already/);
  assert.throws(()=>prepareGymAdd(plan,'DB curl','r',['Bolí mě loket']),/bolí|hurts/);
  const remove=prepareGymRemove(plan,'Cable triceps extension','Bez tricepsu.');
  assert.deepEqual(names(applyGymRemove(values,remove)),['Low row','Lat pulldown']);
  assert.throws(()=>prepareGymRemove({values:applyGymRemove(values,remove)},'Lat pulldown','r'),/dva|two/);
  const logged=structuredClone(values);logged[7+3][8]='TRUE';
  assert.throws(()=>prepareGymRemove({values:logged},'Low row','r'),/Rozcvičený|warmed/);
  // Only the changed exercise moves; the rest stays row for row (review of #1087).
  const two=planValues({date,rows:[...warm('Low row'),...work('Low row'),...work('Cable triceps extension'),...warm('Lat pulldown'),...work('Lat pulldown')]});
  const moved=placeExercise(two,'Lat pulldown'),rows=parseStrengthPlan(moved).rows;
  assert.deepEqual([...new Set(rows.map(r=>r.exercise))],['Low row','Lat pulldown','Cable triceps extension']);
  // Behind Low row the second main lift keeps one warm-up set; Low row keeps its three.
  assert.deepEqual(rows.filter(r=>r.type==='WARMUP').map(r=>r.exercise+r.setNo),['Low row1','Low row2','Low row3','Lat pulldown1']);
  // A swap of an unrelated exercise leaves the others' rows as they were.
  const swapPlan={values:two,history:[]},swap=prepareGymSwap(swapPlan,'Cable triceps extension','Cable overhead triceps extension','r');
  const swapped=applyGymSwap(two,swap),keep=v=>v.filter(r=>['Low row','Lat pulldown'].includes(r[1]));
  assert.deepEqual(keep(swapped),keep(two));
  // A started exercise stays first.
  const startedFirst=planValues({date,rows:[...work('Cable triceps extension'),...warm('Lat pulldown'),...work('Lat pulldown')]});startedFirst[7][8]='TRUE';
  assert.equal(parseStrengthPlan(placeExercise(startedFirst,'Lat pulldown')).rows[0].exercise,'Cable triceps extension');
  // Supersets with warm-ups and drop sets are not taken apart; nothing goes into the middle of one.
  const sup=(type,name,n,letter)=>[type,name,String(n),'20','8–12','','','','FALSE','','','FALSE',letter,'',''];
  const withSuper=planValues({date,rows:[...work('Cable triceps extension'),...warm('Lat pulldown'),sup('WORK','Lat pulldown',1,'A'),sup('WORK','Cable curl',1,'A'),sup('WORK','Lat pulldown',2,'A'),sup('DROP','Lat pulldown',3,''),sup('WORK','Cable curl',2,'A')]});
  assert.deepEqual(placeExercise(withSuper,'Lat pulldown'),withSuper);
  const intoSuper=applyGymAdd(withSuper,prepareGymAdd({values:withSuper,history:[]},'Low row','r'));
  assert.deepEqual(intoSuper.filter(r=>r[1]!=='Low row'),withSuper);
  assert.equal(intoSuper.findIndex(r=>r[1]==='Low row'),7);
  // Removing one half of a superset leaves the other as a normal exercise.
  const alone=applyGymRemove(withSuper,prepareGymRemove({values:withSuper},'Cable curl','r'));
  assert.ok(alone.filter(r=>r[1]==='Lat pulldown').every(r=>r[12]===''));
});

test('add and remove cards pass the checks, an app before API 2 gets none',()=>{
  const values=planValues({date,rows:[['WORK','Low row','1','20','8–12','','','','FALSE','','','FALSE','','',''],['WORK','Lat pulldown','1','40','8–12','','','','FALSE','','','FALSE','','',''],['WORK','Cable triceps extension','1','15','8–12','','','','FALSE','','','FALSE','','','']]});
  const context={athleteState:'active',userMessage:'Přidej tam biceps a vynech triceps',gymPlan:{values,history:[]},week:[]};
  const actions=[{type:'gym_add',date,toExercise:'DB curl',reason:'Biceps navíc.'},{type:'gym_remove',date,fromExercise:'Cable triceps extension',reason:'Bez tricepsu.'},{type:'gym_add',date,toExercise:'DB curl',reason:'Znovu.'}];
  assert.deepEqual(validateCoachActions(actions,context,date).map(a=>a.type),['gym_add','gym_remove']);
  assert.deepEqual(validateCoachActions(actions,{...context,oldAppCards:true},date),[]);
});
