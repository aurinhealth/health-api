import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { getAthleteState,updateAthleteState } from '../src/athlete-state.js';
import { buildCoachCouncil } from '../src/coach-engine.js';
import { planValues } from '../src/gym-plan-store.js';
import { todayGymContext,prepareGymSwap,applyGymSwap } from '../src/coach-gym-adjustment.js';
import { validateCoachActions } from '../src/coach-actions.js';
import { askCoach,assistantTask } from '../src/coach-assistant.js';
import { partialCoachAnswer,readOpenAIStream,assistantStreamResponse } from '../src/assistant-stream.js';
import { startDashboardSync,dashboardSyncStatus } from '../src/dashboard-sync.js';
const date='2026-10-04';
const make=(exercise,done=false)=>['WORK',exercise,'1','10','8–12','','','',done?'TRUE':'FALSE','Poznámka','','TRUE','A'];
const gym={values:planValues({date,rows:[make('DB Arnold press'),make('Low row',true)]}),history:[]};
test('status expires on the chosen Prague calendar day without losing preferences',async()=>{
  const db=scopedDb(createD1(),1);
  await updateAthleteState(db,{memory:'Nemám rád masáže',turn:[{role:'user',content:'Ahoj'}]},{date});
  await updateAthleteState(db,{status:'sick',note:'Nachlazení',statusUntil:'2026-10-05'},{date});
  assert.equal((await getAthleteState(db,{date})).status,'sick');
  const expired=await getAthleteState(db,{date:'2026-10-05'});
  assert.equal(expired.status,'active');assert.equal(expired.note,'');assert.equal(expired.statusUntil,null);
  assert.deepEqual(expired.memories,['Nemám rád masáže']);assert.equal(expired.conversation.length,1);
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
});
test('confirmed exercise swap preserves logged sets, options and unrelated edits',()=>{
  const action=prepareGymSwap(gym,'DB Arnold press','DB shoulder press','Jednodušší tlak.'),changed=structuredClone(gym.values);
  changed.at(-1)[5]='45';changed.at(-1)[6]='8';
  const values=applyGymSwap(changed,action),context=todayGymContext({values},date);
  assert.deepEqual(values.at(-1),changed.at(-1));assert.deepEqual(values.slice(0,7),changed.slice(0,7));
  assert.equal(context.exercises[0].name,'DB shoulder press');assert.equal(context.exercises[0].sets[0].superset,'A');assert.equal(context.exercises[0].sets[0].toFailure,true);
  assert.equal(context.exercises[0].sets[0].kg,null);assert.equal(action.kg,null);
  changed[7][8]='TRUE';assert.throws(()=>applyGymSwap(changed,action),/mezitím/);
  assert.throws(()=>prepareGymSwap(gym,'Low row','Lat pulldown','Náhrada'),/Rozcvičený/);
  assert.throws(()=>prepareGymSwap(gym,'DB Arnold press','Pivot leg press','Náhrada'),/partii/);
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
    assert.equal(assistantTask('Uprav dnešní cvičení'),'adjustment');assert.equal(calls[0].model,'gpt-6-sol');assert.equal(calls[0].reasoning.effort,'low');assert.match(calls[0].input,/DB Arnold press/);
  }finally{globalThis.fetch=original;}
});
test('council hides empty nutrition and boilerplate, and follows the athlete sport',()=>{
  assert.deepEqual(buildCoachCouncil({date,daily:{training:{},nutrition:{calorieTarget:2400,foodLog:{totals:{kcal:0}}}}}).coaches,[]);
  const r=buildCoachCouncil({date,focus:{sportLabel:'běh'},gym,daily:{training:{planned:[{name:'Gym',type:'WeightTraining'}]}}});
  assert.equal(r.coaches[0].title,'Silový trenér · běh');assert.match(r.coaches[0].actions[0],/DB Arnold press/);assert.equal(r.coaches[0].evidence,undefined);
});
test('morning summary combines fresh sleep, yesterday load and current form without inventing missing data',()=>{
  const r=buildCoachCouncil({date,sleepSessions:[{date,durationMin:330}],fitness:{tsb:-28},yesterday:{training:{completed:[{name:'Ride',durationHours:3,tss:180}]}}});
  assert.match(r.morningSummary.text,/5 h 30 min/);assert.match(r.morningSummary.text,/180 TSS/);assert.match(r.morningSummary.recommendation,/rezervu/);
  assert.equal(buildCoachCouncil({date,sleepSessions:[{date:'2026-09-01',durationMin:480}]}).morningSummary,null);
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
test('failed streamed work never publishes a completed reply or proposed actions',async()=>{
  const response=assistantStreamResponse(async emit=>{emit('Část odpovědi');throw new Error('Database unavailable');});
  const frames=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(frames.map(f=>f.type),['start','answer','error']);assert.doesNotMatch(frames.at(-1).message,/Database/);
});
