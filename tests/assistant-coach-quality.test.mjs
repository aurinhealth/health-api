import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assistantTask, isSimpleMessage, askCoach, coachContext, compactActivity, coachAnswerText, TRUNCATED_NOTE, strengthProgress, nutritionContext, engineSport, focusGoal, sleepNights, pragueNow } from '../src/coach-assistant.js';
import { isFoodLogMessage } from '../src/food-chat.js';
import { validateCoachActions, actionSafetyContext, actionsNote, COACH_ACTION_FORMAT } from '../src/coach-actions.js';
import { explicitPreference } from '../src/athlete-state.js';
import { gymAdjustmentRequest } from '../src/coach-gym-adjustment.js';

const today='2026-10-05';

test('real questions about the athlete get the planning context, small talk stays simple',()=>{
  for(const m of ['Kolik mám dát na bench?','Jak zlepšit dřep?','Můžu dnes dělat mrtvý tah?','Jak se mi povedla včerejší jízda?','Mám dnes jít na intervaly?','Je dnes vhodné jet intervaly?','Bolí mě koleno, co s tím?','Jsem nemocný','A co zítra?','Díky, a v sobotu?','A kdybych měl jen 45 minut?'])
    assert.equal(assistantTask(m),'planning',m);
  // Quick questions about the athlete's own numbers: the same data, the light model.
  for(const m of ['Jaké mám FTP?','Jaké mám zóny?','Jaká je moje forma?','Jak dlouho mám odpočívat mezi sériemi?','Kolik mám dnes bílkovin?','Co mám zítra za trénink?','Kolik TSS mám tento týden?'])
    assert.equal(assistantTask(m),'quick',m);
  // A quick question after a planning chat is still quick; a follow-up is not.
  const chat=t=>[{role:'user',content:t},{role:'assistant',content:'Odpověď'}];
  assert.equal(assistantTask('Jaké mám FTP?',null,chat('Naplánuj mi tento týden')),'quick');
  assert.equal(assistantTask('A co v sobotu?',null,chat('Naplánuj mi tento týden')),'planning');
  for(const m of ['Ahoj','Díky!','Co je sweet spot?','Dobré ráno'])assert.equal(assistantTask(m),'simple',m);
  assert.equal(isSimpleMessage('x'.repeat(130)),false);
  // The open screen and the views about training never get the light context.
  assert.equal(assistantTask('Díky!',{view:'workouts'}),'planning');assert.equal(assistantTask('Díky!',{view:'today',sport:'ride'}),'planning');
});

test('Czech ň and ď reach the gym adjustment; "blok" needs a whole word',()=>{
  assert.equal(assistantTask('Vyměň dřep za leg press',{sport:'gym'}),'adjustment');
  assert.equal(assistantTask('Změň mi ten cvik'),'adjustment');assert.equal(assistantTask('Nahraď bench něčím jiným'),'adjustment');
  assert.equal(assistantTask('Změň to',{sport:'gym'}),'adjustment');
  assert.equal(assistantTask('Zablokovaná záda, co s tím?'),'planning');
  assert.equal(assistantTask('Naplánuj tréninkový blok na zimu'),'block');assert.equal(assistantTask('Analyzuj 12týdenní blok'),'block');
  // A ride change is not a gym adjustment unless the gym screen is open.
  assert.equal(gymAdjustmentRequest('Jiný trénink na kole'),false);assert.equal(gymAdjustmentRequest('Změna tréninku'),false);
  assert.equal(gymAdjustmentRequest('Změna tréninku',{sport:'gym'}),true);
  assert.equal(assistantTask('Jiný trénink na kole'),'planning');
});

test('a short follow-up inherits the depth of the chat',()=>{
  const chat=t=>[{role:'user',content:t},{role:'assistant',content:'Odpověď'}];
  assert.equal(assistantTask('Díky!',null,chat('Mám dnes jít na intervaly?')),'planning');
  assert.equal(assistantTask('Díky!',null,chat('Ahoj')),'simple');
  assert.equal(assistantTask('A co třetí týden?',null,chat('Naplánuj tréninkový blok na zimu')),'block');
  assert.equal(assistantTask('Díky!',null,chat('Uprav dnešní cvičení')),'adjustment');
});

test('questions about food go to the coach, past meals become a food draft',()=>{
  for(const m of ['Mám sníst banán nebo tyčinku před jízdou?','Můžu si dát k snídani ovesnou kaši před intervaly?','Co si mám dát k obědu, když odpoledne jedu 3 hodiny?','Měl jsem dnes jet intervaly, ale nestihl jsem to. Co teď?','Snědl jsem moc sladkého, mám zítra jet déle?','Měl bych sníst víc sacharidů','Měl jsem dnes jet intervaly, ale nestihl jsem to.','Sníst banán před kolem'])
    assert.equal(isFoodLogMessage(m),false,m);
  for(const m of ['Měl jsem snickers a kafe','Snědla jsem jablko','Ke snídani jsem měla ovesnou kaši','Dal jsem si k obědu řízek s bramborem'])assert.equal(isFoodLogMessage(m),true,m);
});

test('completed activities keep power, heart rate and RPE from the Intervals payload',()=>{
  const ride={id:'a1',name:'Sweet spot',type:'Ride',durationHours:1.5,tss:88,calories:900,payload:{icu_weighted_average_watts:231,icu_average_watts:212,average_heartrate:146,max_heartrate:171,icu_rpe:6,feel:2,icu_intensity:82.5,icu_ftp:280,decoupling:3.44,distance:45210,total_elevation_gain:420,icu_zone_times:[{id:'Z2',secs:1800},{id:'Z4',secs:1200},{id:'Z5',secs:0}],icu_hr_zone_times:[600,1200,0]}};
  const a=compactActivity(ride);
  assert.deepEqual([a.normalizedPower,a.averagePower,a.averageHeartRate,a.maxHeartRate,a.rpe,a.feel,a.intensityFactor,a.ftp,a.decouplingPercent,a.distanceKm],[231,212,146,171,6,2,.83,280,3.4,45.2]);
  assert.deepEqual(a.powerZoneMinutes,[{zone:'Z2',minutes:30},{zone:'Z4',minutes:20}]);assert.deepEqual(a.hrZoneMinutes,[{zone:'Z1',minutes:10},{zone:'Z2',minutes:20}]);
  assert.equal(a.payload,undefined);
  // Values on the activity itself win; Google exercises have no payload.
  assert.equal(compactActivity({...ride,averagePower:200}).averagePower,200);assert.equal(compactActivity({name:'Walk',averageHeartRate:100}).averageHeartRate,100);
  const context=coachContext({date:today,daily:{training:{completed:[ride],planned:[{id:'planned:1',name:'Z2',durationHours:1,payload:{huge:'x'.repeat(5000)}}]}},week:{days:[{date:today,daily:{training:{completed:[ride]}}}]},gym:{history:[]}});
  assert.equal(context.week[0].completed[0].normalizedPower,231);assert.equal(context.today.training.completed[0].rpe,6);
  assert.doesNotMatch(JSON.stringify(context.today),/huge|icu_weighted/);
});

test('thresholds, zones and the athlete profile reach the coach',()=>{
  const thresholds={ftp:280,source:'manual',indoorFtp:null,lthr:165,maxHr:190,restHr:48,runThresholdPace:270,runLthr:172,powerZones:[{zone:1,wattsLow:0,wattsHigh:154}],hrZones:[{zone:1,bpmLow:null,bpmHigh:135}],paceZones:[{zone:1,paceSlow:null,paceFast:330}]};
  const context=coachContext({date:today,daily:{weight:{current:74.6}},week:{days:[]},gym:{history:[]},thresholds,profile:{sex:'male',age:41,height:182}});
  assert.equal(context.thresholds.ftp,280);assert.equal(context.thresholds.ftpSource,'manual');assert.equal(context.thresholds.indoorFtp,266);assert.equal(context.thresholds.indoorFtpEstimated,true);
  assert.equal(context.thresholds.lthr,165);assert.equal(context.thresholds.runThresholdPaceText,'4:30/km');assert.equal(context.thresholds.powerZones[0].wattsHigh,154);assert.equal(context.thresholds.paceZones.length,1);
  assert.deepEqual(context.athlete,{weightKg:74.6,sex:'male',age:41,heightCm:182});
  const empty=coachContext({date:today,week:{days:[]},gym:{history:[]}});assert.equal(empty.thresholds,null);assert.equal(empty.athlete,null);
});

test('dates, sleep, nutrition and strength progression are in the context',()=>{
  const history=[['2026-08-20',80,8,7],['2026-09-10',82.5,8,8],['2026-10-01',85,8,8],['2026-10-01',85,7,9]].map(([workout_date,kg,reps,rpe],i)=>({workout_date,exercise:'Bench press',type:'WORK',set_no:i,actual_kg:kg,actual_reps:reps,rpe}));
  const progress=strengthProgress(history,today);
  assert.equal(progress[0].exercise,'Bench press');assert.equal(progress[0].lastDate,'2026-10-01');assert.match(progress[0].lastSets,/85 kg×8 @RPE 8/);assert.equal(progress[0].trend,'roste');assert.equal(progress[0].bestE1rmKg,107.7);
  assert.deepEqual(nutritionContext({calorieTarget:2600,macros:{protein_g:150,carbs_g:320,fat_g:70},foodLog:{totals:{kcal:1100,protein_g:60,carbs_g:120,fat_g:30}}}).remaining,{kcal:1500,protein_g:90,carbs_g:200,fat_g:40});
  assert.deepEqual(sleepNights([{date:'2026-10-05',durationMin:420},{date:'2026-10-05',durationMin:30},{date:'2026-09-20',durationMin:400}],today),[{date:'2026-10-05',minutes:420}]);
  const context=coachContext({date:today,now:'2026-10-05 07:30',week:{days:[{date:'2026-10-08'}]},gym:{history},health:{sleep:[{date:today,durationMin:410}]},availabilityByDate:{'2026-10-08':{minutes:60}}});
  assert.equal(context.weekday,'pondělí');assert.equal(context.now,'2026-10-05 07:30');assert.deepEqual(context.week[0],{date:'2026-10-08',weekday:'čtvrtek',availabilityMinutes:60,planned:undefined,completed:undefined});
  assert.equal(context.sleep[0].minutes,410);assert.equal(context.strengthProgress[0].exercise,'Bench press');assert.deepEqual(Object.keys(context.gym[0]).sort(),['date','exercise','kg','reps','rpe','set']);
  assert.match(pragueNow(new Date('2026-10-05T05:30:00Z')),/^2026-10-05 07:30$/);
});

test('the main sport and the event steer the engine',()=>{
  assert.equal(engineSport({sport:'running'}),'run');assert.equal(engineSport({sport:'cycling'}),'ride');assert.equal(engineSport({sport:'running'},{sport:'ride'}),'ride');assert.equal(engineSport(null,{sport:'gym'}),'ride');
  assert.equal(focusGoal({event:{name:'Gran Fondo',date:'2027-06-01',daysLeft:239}}).phase,'base');assert.equal(focusGoal({event:{daysLeft:40}}).phase,'build');assert.equal(focusGoal({event:{daysLeft:10}}).phase,undefined);assert.equal(focusGoal(null),null);
  const context=coachContext({date:today,week:{days:[]},gym:{history:[]},focus:{sport:'running',event:{name:'Maraton',date:'2026-11-14',daysLeft:40}}});
  assert.equal(context.cyclingCoachV2.sport,'run');assert.ok(!context.cyclingCoachV2.missingData.includes('explicit goal/event and phase'));
});

test('chat proposals respect the day budget and sessions already planned',()=>{
  const days=[{date:'2026-10-04',planned:[{id:'planned:old',name:'Old'}]},{date:'2026-10-06',planned:[{id:'planned:7',name:'Long ride',durationHours:1}]},{date:'2026-10-07',planned:[{id:'planned:n',name:'Nutrition note'}]},{date:'2026-10-08',planned:[]},{date:'2026-10-12',planned:[]}];
  const plans={'2026-10-05':{availability:[{minutes:60},{minutes:90},{minutes:45},{minutes:60},{minutes:0},{minutes:180},{minutes:240}]},'2026-10-12':{availability:[{minutes:30}]}};
  const safety=actionSafetyContext(days,today,d=>plans[d<'2026-10-12'?'2026-10-05':'2026-10-12']);
  assert.deepEqual(safety.availabilityByDate,{'2026-10-06':{minutes:90},'2026-10-07':{minutes:45},'2026-10-08':{minutes:60},'2026-10-12':{minutes:30}});
  assert.deepEqual(safety.remainingPlanned,[{date:'2026-10-06',id:'planned:7',name:'Long ride'}]);
  const context={athleteState:'active',userMessage:'Přesuň dlouhou jízdu',week:days,...safety};
  const workout=(date,minutes)=>({type:'workout',date,sport:'ride',minutes,reason:'Náhrada'});
  assert.deepEqual(validateCoachActions([workout('2026-10-08',90)],context,today),[]);
  assert.deepEqual(validateCoachActions([workout('2026-10-06',60)],context,today),[]);
  assert.equal(validateCoachActions([workout('2026-10-08',60)],context,today)[0].minutes,60);
  assert.deepEqual(validateCoachActions([{type:'move',eventId:'planned:7',date:'2026-10-07',reason:'Více času'}],context,today),[]);
  assert.equal(validateCoachActions([{type:'move',eventId:'planned:7',date:'2026-10-08',reason:'Více času'}],context,today)[0].date,'2026-10-08');
});

test('a workout proposal carries only a library workout the coach was offered',()=>{
  const context={athleteState:'active',workoutLibraryRecommendations:[{id:'ss-3x15',name:'Sweet spot 3×15',sport:'ride'}]};
  const action=id=>({type:'workout',date:'2026-10-08',sport:'ride',minutes:75,reason:'Sweet spot',workoutId:id});
  assert.deepEqual(validateCoachActions([action('ss-3x15')],context,today)[0],{type:'workout',date:'2026-10-08',sport:'ride',minutes:75,reason:'Sweet spot',workoutId:'ss-3x15',workoutName:'Sweet spot 3×15'});
  assert.equal(validateCoachActions([action('invented')],context,today)[0].workoutId,undefined);
  assert.equal(validateCoachActions([{...action('ss-3x15'),sport:'run'}],context,today)[0].workoutId,undefined);
  const schema=COACH_ACTION_FORMAT.schema.properties.actions.items;assert.ok(schema.required.includes('workoutId')&&schema.required.includes('statusUntil'));
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
  assert.match(entry,/a\.workoutId&&a\.sport!=='gym'\?\{workoutId:a\.workoutId,resizeTo:a\.minutes\}/);
});

test('status proposals accept common words for illness and injury, with an optional end',()=>{
  const status=(s,words,extra={})=>validateCoachActions([{type:'status',status:s,reason:'Stav',...extra}],{userMessage:words},today);
  for(const m of ['Mám chřipku','Jsem nachlazený','Mám rýmu','Mám covid','Asi nějaký viróza','Mám teplotu'])assert.equal(status('sick',m).length,1,m);
  for(const m of ['Natáhl jsem si lýtko','Podvrtnutý kotník','Mám výron','Nateklé koleno'])assert.equal(status('injured',m).length,1,m);
  assert.deepEqual(status('sick','Jsem unavený'),[]);assert.deepEqual(status('injured','Mám chřipku'),[]);
  assert.equal(status('sick','Mám chřipku',{statusUntil:'2026-10-09'})[0].statusUntil,'2026-10-09');
  assert.equal(status('sick','Mám chřipku',{statusUntil:today})[0].statusUntil,undefined);assert.equal(status('sick','Mám chřipku',{statusUntil:'2026-02-30'})[0].statusUntil,undefined);
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
  assert.match(entry,/updateAthleteState\(env\.DB,\{status:a\.status,note:a\.reason,statusUntil:/);
});

test('passing remarks are not remembered and preferences are saved after the answer',()=>{
  for(const m of ['Nechci dnes nohy','Nechci zítra běhat','Nechci tento týden kolo','Nechci teď posilovat','Nechci běhat?'])assert.equal(explicitPreference(m),null,m);
  assert.equal(explicitPreference('Nechci běhat po asfaltu'),'Nechci běhat po asfaltu');assert.equal(explicitPreference('Nemám rád intervaly na trenažéru'),'Nemám rád intervaly na trenažéru');
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8'),start=entry.indexOf("url.pathname==='/app/api/assistant'&&request.method==='POST'"),block=entry.slice(start,entry.indexOf("if(body.stream)return assistantStreamResponse(reply);",start));
  assert.ok(block.lastIndexOf('await saveMemory();')>block.indexOf('await askCoach(env,message,coachCtx'));
  assert.doesNotMatch(block,/updateAthleteState\(env\.DB,\{memory\}\):await getAthleteState/);assert.doesNotMatch(block,/turn:\[/);
});

test('a reply cut off by the token limit keeps its answer and never shows raw JSON',async()=>{
  assert.deepEqual(coachAnswerText('{"answer":"Začni lehce","actions":[{"type":"re',{actions:true,incomplete:true}),{answer:'Začni lehce\n\n'+TRUNCATED_NOTE,visuals:[],actions:[]});
  assert.doesNotMatch(coachAnswerText('{"actions":[{"type":"rest"',{actions:true}).answer,/[{}]/);
  assert.equal(coachAnswerText('Obyčejný text',{actions:true}).answer,'Obyčejný text');
  const original=globalThis.fetch,calls=[];
  try{
    globalThis.fetch=async(_,options)=>{calls.push(JSON.parse(options.body));return Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'message',content:[{type:'output_text',text:'{"answer":"Dnes jeď 60 min v Z2 a'}]}]});};
    const r=await askCoach({OPENAI_API_KEY:'test'},'Mám dnes jet?',{date:today},{task:'planning',actions:true});
    assert.equal(r.incomplete,true);assert.equal(r.answer,'Dnes jeď 60 min v Z2 a\n\n'+TRUNCATED_NOTE);assert.deepEqual(r.actions,[]);assert.equal(calls[0].max_output_tokens,16000);
    // Streaming: the part that arrived is kept instead of an error.
    const encoder=new TextEncoder(),serialized='{"answer":"Ahoj, dnes',seen=[];
    globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(encoder.encode('data: '+JSON.stringify({type:'response.output_text.delta',delta:serialized})+'\n\n'));c.enqueue(encoder.encode('data: '+JSON.stringify({type:'response.incomplete',response:{model:'gpt-6-sol',status:'incomplete',output:[]}})+'\n\n'));c.close();}}));
    const streamed=await askCoach({OPENAI_API_KEY:'test'},'Naplánuj zimní tréninkový blok',{date:today},{actions:true,onAnswer:a=>seen.push(a)});
    assert.equal(streamed.answer,'Ahoj, dnes\n\n'+TRUNCATED_NOTE);assert.equal(seen.at(-1),'Ahoj, dnes');assert.equal(streamed.incomplete,true);
    globalThis.fetch=async()=>Response.json({status:'incomplete',output:[]});
    await assert.rejects(askCoach({OPENAI_API_KEY:'test'},'Ahoj',{}),/nevešla/);
  }finally{globalThis.fetch=original;}
});

test('earlier turns go to the model as messages with the data first and the question last',async()=>{
  const original=globalThis.fetch;let body;
  globalThis.fetch=async(_,options)=>{body=JSON.parse(options.body);return Response.json({output_text:'Ok'});};
  try{
    await askCoach({OPENAI_API_KEY:'test'},'A co zítra?',{date:today,week:[],conversation:[{role:'user',content:'Mám dnes jet?'},{role:'assistant',content:'Ano, 60 min.\n\n[Návrhy: Připravit kolo 60 min na po 5. 10.]'}]},{task:'planning'});
    assert.deepEqual(body.input.map(m=>m.role),['user','user','assistant','user']);
    assert.match(body.input[0].content,/^Kontext aplikace/);assert.doesNotMatch(body.input[0].content,/conversation/);assert.equal(body.input.at(-1).content,'Požadavek: A co zítra?');
  }finally{globalThis.fetch=original;}
  const move={type:'move',eventId:'planned:7',date:'2026-10-08',reason:'x',eventSnapshot:{name:'Long ride',date:'2026-10-06'}};
  assert.equal(actionsNote([move,{type:'status',status:'sick',statusUntil:'2026-10-09'}]),'[Návrhy: Přesunout Long ride na čt 8. 10.; Stav Sick (znovu Active od pá 9. 10.)]');assert.equal(actionsNote([]),'');
});

test('the panel shows only open proposals from today and this chat; streaming repaints are throttled',()=>{
  const client=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
  assert.match(client,/renderCoachActionCards\(\(state\.inbox\|\|\[\]\)\.filter\(openCoachDraft\)/);
  assert.match(client,/day===pragueToday\(\)&&\(!a\?\.date\|\|a\.date>=pragueToday\(\)\)&&\(x\.draft\.chatId==null\|\|x\.draft\.chatId===assistantChat\.id\)/);
  assert.match(client,/pendingAnswer=answer;if\(Date\.now\(\)-paintedAt>=100\)paint\(\);/);
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
  assert.match(entry,/UPDATE coach_inbox SET status='expired' WHERE user_id=\? AND status='draft' AND created_at<\?/);
});

test('the coach picks at most two known pictures for an answer',()=>{
  const r=coachAnswerText(JSON.stringify({answer:'Forma roste.',visuals:['form','bogus','sleep','zones'],actions:[]}),{actions:true});
  assert.deepEqual(r.visuals,['form','sleep']);
  assert.deepEqual(coachAnswerText('Obyčejný text',{actions:true}).visuals,[]);
});
