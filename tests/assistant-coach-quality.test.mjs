import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assistantTask, isSimpleMessage, askCoach, coachContext, compactActivity, coachAnswerText, TRUNCATED_NOTE, strengthProgress, nutritionContext, engineSport, gymDay, strengthDay, focusGoal, sleepNights, sleepNeedContext, localNow } from '../src/coach-assistant.js';
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

test('health, weight loss and today\'s decision never go to the light model',()=>{
  for(const m of ['Je normální, že mě bolí na hrudi?','Jak dlouho mám pauzírovat, když mě bolí koleno?','Jak zhubnout 5 kg do měsíce?','Kolik mám jíst, když chci rychle zhubnout?','Co mám dnes dělat?','Jaký trénink mám dnes dělat?','Jaká mám dnes udělat intervaly?','Je bezpečné trénovat s betablokátory?','Jak dlouho můžu držet 48 h půst?','Je v pořádku mít tep 190?','Jak spát líp?','Is it normal to feel dizzy?'])
    for(const screen of [{view:'today'},null])assert.equal(assistantTask(m,screen),'planning',m);
  // Without an open screen these still get the athlete's data, not small talk.
  for(const m of ['Necítím se dobře','Chci volno'])assert.equal(assistantTask(m),'planning',m);
  for(const m of ['Jaké mám FTP?','Kolik mám dnes bílkovin?','What\'s my FTP?'])assert.equal(assistantTask(m,{view:'today'}),'quick',m);
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
  assert.match(localNow(new Date('2026-10-05T05:30:00Z')),/^2026-10-05 07:30$/);
});

test('the main sport and the event steer the engine',()=>{
  assert.equal(engineSport({sport:'running'}),'run');assert.equal(engineSport({sport:'cycling'}),'ride');assert.equal(engineSport({sport:'running'},{sport:'ride'}),'ride');assert.equal(engineSport(null,{sport:'gym'}),'ride');
  assert.equal(focusGoal({event:{name:'Gran Fondo',date:'2027-06-01',daysLeft:239}}).phase,'base');assert.equal(focusGoal({event:{daysLeft:40}}).phase,'build');assert.equal(focusGoal({event:{daysLeft:10}}).phase,undefined);assert.equal(focusGoal(null),null);
  const context=coachContext({date:today,week:{days:[]},gym:{history:[]},focus:{sport:'running',event:{name:'Maraton',date:'2026-11-14',daysLeft:40}}});
  assert.equal(context.cyclingCoachV2.sport,'run');assert.ok(!context.cyclingCoachV2.missingData.includes('explicit goal/event and phase'));
});

test('automatic proposals respect availability while user initiated chat actions may exceed it and add sessions',()=>{
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
  const user={userInitiated:true};
  for(const a of [workout('2026-10-08',90),workout('2026-10-06',180),workout('2026-10-12',60)])assert.equal(validateCoachActions([a],context,today,user)[0].minutes,a.minutes);
  const noTime={...context,availabilityByDate:{'2026-10-07':{minutes:0}}};
  assert.equal(validateCoachActions([workout('2026-10-07',60)],noTime,today,user)[0].minutes,60);
  assert.equal(validateCoachActions([{type:'move',eventId:'planned:7',date:'2026-10-07',reason:'Přesun na žádost'}],noTime,today,user)[0].date,'2026-10-07');
  assert.deepEqual(validateCoachActions([workout('2026-02-30',90)],context,today,user),[]);
  assert.deepEqual(validateCoachActions([workout('2026-10-08',90)],{...context,athleteState:'sick'},today,user),[]);
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

test('no hard workout is prepared for today on a red day or with signs of illness',()=>{
  const ride=(kind,date=today,extra={})=>({type:'workout',date,sport:'ride',minutes:75,reason:'Intervaly',kind,...extra});
  const ctx=readiness=>({athleteState:'active',cyclingCoachV2:{readiness},workoutLibraryRecommendations:[{id:'v5x4',name:'VO2max 5×4',sport:'ride',system:'vo2max'}]});
  const red=ctx({status:'red',flags:[]}),breath=ctx({status:'yellow',flags:['respiration_elevated']}),sick=ctx({status:'green',flags:['checkin_sick']}),green=ctx({status:'green',flags:[]});
  for(const c of [red,breath,sick])for(const k of ['vo2max','threshold','tempo','sweet_spot']){
    assert.deepEqual(validateCoachActions([ride(k)],c,today),[],k);
    assert.deepEqual(validateCoachActions([ride(k)],c,today,{userInitiated:true}),[],k);
  }
  assert.deepEqual(validateCoachActions([ride('',today,{workoutId:'v5x4'})],red,today),[]);
  // Easy work today, hard work on a later day and a green day stay.
  assert.equal(validateCoachActions([ride('recovery')],red,today)[0].kind,'recovery');
  assert.equal(validateCoachActions([ride('vo2max','2026-10-07')],red,today)[0].kind,'vo2max');
  assert.equal(validateCoachActions([ride('vo2max')],green,today)[0].kind,'vo2max');
});

test('hard workouts in one answer keep 48 h apart and at most two in 7 days, with the week counted',()=>{
  const ride=(kind,date,extra={})=>({type:'workout',date,sport:'ride',minutes:75,reason:'Intervaly',kind,...extra});
  const lib={athleteState:'active',workoutLibraryRecommendations:[{id:'v5x4',name:'VO2max 5×4',sport:'ride',system:'vo2max'}]};
  // Three VO2max days in a row: the middle one goes, the third keeps 48 h from the first.
  assert.deepEqual(validateCoachActions([ride('vo2max','2026-10-06'),ride('vo2max','2026-10-07'),ride('vo2max','2026-10-08')],lib,today).map(a=>a.date),['2026-10-06','2026-10-08']);
  // 48 h apart stays; a library workout counts the same as a kind.
  assert.deepEqual(validateCoachActions([ride('vo2max','2026-10-06'),ride('',  '2026-10-08',{workoutId:'v5x4'})],lib,today).map(a=>a.date),['2026-10-06','2026-10-08']);
  assert.deepEqual(validateCoachActions([ride('vo2max','2026-10-06'),ride('',  '2026-10-07',{workoutId:'v5x4'})],lib,today).map(a=>a.date),['2026-10-06']);
  // A hard ride done yesterday blocks today; two in the week block a third, easy work stays.
  const week=days=>({...lib,week:days});
  assert.deepEqual(validateCoachActions([ride('threshold',today)],week([{date:'2026-10-04',completed:[{name:'VO2max 5x4',type:'Ride'}]}]),today),[]);
  const two=week([{date:'2026-10-01',completed:[{name:'Threshold 3x10',type:'Ride'}]},{date:'2026-10-03',completed:[{name:'Sweet Spot',type:'Ride'}]}]);
  assert.deepEqual(validateCoachActions([ride('vo2max','2026-10-06')],two,today),[]);
  assert.equal(validateCoachActions([ride('endurance','2026-10-06')],two,today)[0].kind,'endurance');
  assert.equal(validateCoachActions([ride('vo2max','2026-10-09')],two,today)[0].kind,'vo2max');
  // A hard session planned on the proposed day is the one it replaces.
  assert.equal(validateCoachActions([ride('threshold','2026-10-06')],week([{date:'2026-10-06',planned:[{id:'planned:1',name:'VO2max',type:'Ride'}]}]),today,{userInitiated:true})[0].kind,'threshold');
});

test('a library workout and a confirmed proposal pass the coach\'s check for their day',()=>{
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
  assert.match(entry,/hardDay=isHardKind\(coachKind\);/);assert.match(entry,/if\(workoutId&&isHardKind\(libraryFocus\)&&!hardDay\)workoutId=null;/);
  assert.match(entry,/const fresh=await workoutPreview\(env,ctx,a\)/);
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
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8'),start=entry.indexOf("url.pathname==='/app/api/assistant'&&request.method==='POST'"),block=entry.slice(start,entry.indexOf("if(body.stream)return assistantStreamResponse(reply",start));
  assert.ok(block.lastIndexOf('await saveMemory();')>block.indexOf('await askCoach(env,message,coachCtx'));
  assert.doesNotMatch(block,/updateAthleteState\(env\.DB,\{memory\}\):await getAthleteState/);assert.doesNotMatch(block,/turn:\[/);
});

test('a reply cut off by the token limit keeps its answer and never shows raw JSON',async()=>{
  assert.deepEqual(coachAnswerText('{"answer":"Začni lehce","actions":[{"type":"re',{actions:true,incomplete:true}),{answer:'Začni lehce\n\n'+TRUNCATED_NOTE,visuals:[],actions:[],memory:{forget:[],update:[]}});
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
    await assert.rejects(askCoach({OPENAI_API_KEY:'test'},'Ahoj',{}),/moc dlouhá/);
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
  // The time and the open screen go after the earlier turns, so the long context stays cacheable.
  try{
    globalThis.fetch=async(url,init)=>{body=JSON.parse(init.body);return Response.json({model:'gpt-6-sol',output:[{content:[{type:'output_text',text:'ok'}]}]});};
    await askCoach({OPENAI_API_KEY:'test'},'A co zítra?',{date:today,now:today+'T10:57',week:[],appContext:{screen:'today'},conversation:[{role:'user',content:'Mám dnes jet?'},{role:'assistant',content:'Ano.'}]},{task:'planning'});
    assert.deepEqual(body.input.map(m=>m.role),['user','user','assistant','user','user']);
    assert.doesNotMatch(body.input[0].content,/"now"|appContext/);assert.match(body.input[0].content,/"week"/);
    assert.match(body.input[3].content,/^Kontext aplikace.*"now":".*T10:57".*"appContext"/);assert.equal(body.input.at(-1).content,'Požadavek: A co zítra?');
  }finally{globalThis.fetch=original;}
  const move={type:'move',eventId:'planned:7',date:'2026-10-08',reason:'x',eventSnapshot:{name:'Long ride',date:'2026-10-06'}};
  assert.equal(actionsNote([move,{type:'status',status:'sick',statusUntil:'2026-10-09'}]),'[Návrhy: Přesunout Long ride na čt 8. 10.; Stav Nemoc (znovu Aktivní od pá 9. 10.)]');assert.equal(actionsNote([]),'');
});

test('assistant proposals are kept as drafts of this chat',()=>{
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
  assert.match(entry,/UPDATE coach_inbox SET status='expired' WHERE user_id=\? AND status='draft' AND created_at<\?/);
});

test('a proposal is confirmed once: the claim comes before the change, a failure puts it back',async()=>{
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
  const route=entry.slice(entry.indexOf("url.pathname==='/app/api/assistant/action'"));
  const claim=route.indexOf("SET status='applying'"),first=route.indexOf("if(body.decision==='confirm'){");
  assert.ok(claim>0&&claim<first,'claimed before any action runs');
  assert.match(route,/if\(claimed\.meta\?\.changes!==1\)return Response\.json\(\{status:'ok',message:L\('Návrh už byl vyřízen\./);
  assert.match(route,/catch\(error\)\{await env\.DB\.prepare\("UPDATE coach_inbox SET status='draft',confirmed_at=NULL WHERE user_id=\? AND id=\? AND status='applying'"\)/);
  // The claim itself: of two at once only one gets the row.
  const {createD1}=await import('./helpers/d1.mjs');const db=createD1();
  db.sqlite.exec("CREATE TABLE coach_inbox (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, confirmed_at TEXT)");db.sqlite.exec("INSERT INTO coach_inbox VALUES (1,1,'draft',NULL)");
  const sql=route.slice(route.indexOf('"UPDATE coach_inbox SET status=\'applying\'')+1);const statement=sql.slice(0,sql.indexOf('"'));
  const tries=await Promise.all([1,2].map(()=>db.prepare(statement).bind(1,1).run()));
  assert.deepEqual(tries.map(t=>t.meta.changes).sort(),[0,1]);
});

test('the coach picks at most two known pictures for an answer',()=>{
  const r=coachAnswerText(JSON.stringify({answer:'Forma roste.',visuals:['form','bogus','sleep','zones'],actions:[]}),{actions:true});
  assert.deepEqual(r.visuals,['form','sleep']);
  assert.deepEqual(coachAnswerText('Obyčejný text',{actions:true}).visuals,[]);
});

test('a proposed workout keeps the kind the answer recommends, and confirming plans it',()=>{
  const context={athleteState:'active',workoutLibraryRecommendations:[]};
  const action={type:'workout',date:'2026-10-08',sport:'ride',minutes:60,reason:'Nohy jsou unavené',workoutId:'',kind:'endurance'};
  assert.equal(validateCoachActions([action],context,today)[0].kind,'endurance');
  assert.equal(validateCoachActions([{...action,kind:'gym'}],context,today)[0].kind,undefined);
  assert.equal(validateCoachActions([{...action,sport:'gym',minutes:45,kind:'endurance'}],context,today)[0].kind,undefined);
  const schema=COACH_ACTION_FORMAT.schema.properties.actions.items;assert.ok(schema.required.includes('kind'));
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
  // The kind reaches the generator, and Potvrdit schedules the ride or run and saves the gym draft.
  assert.match(entry,/FOCUS_OF\[a\.kind\]\?\{focus:FOCUS_OF\[a\.kind\]\}/);
  assert.match(entry,/scheduleWorkoutInIntervals\(env,env\.DB,\{workoutId:preview\.workout\.id,date:a\.date,confirm:true/);
  assert.match(entry,/\/app\/api\/gym\/confirm'\),saved=await handleDashboardApi/);
});

test('watch sessions reach the coach with distance, pace, power and elevation, and VO2max is in the wellness',()=>{
  const run=compactActivity({id:'apple-1',type:'Run',durationHours:1,payload:{exercise:{exerciseType:'RUNNING',metricsSummary:{distanceMeters:12000,averagePowerWatts:250,averageHeartRateBeatsPerMinute:150,maxHeartRateBeatsPerMinute:172,elevationGainMeters:120,caloriesKcal:800}}}});
  assert.deepEqual([run.distanceKm,run.pace,run.averagePower,run.averageHeartRate,run.maxHeartRate,run.elevationM,run.calories],[12,'5:00/km',250,150,172,120,800]);
  // Google gives the distance in millimetres.
  assert.equal(compactActivity({type:'Ride',durationHours:2,payload:{exercise:{metricsSummary:{distanceMillimeters:60000000}}}}).distanceKm,60);
  const context=coachContext({date:'2026-10-14',health:{wellness:[{id:'2026-10-14',vo2max:52.4}]}});
  assert.equal(context.health.at(-1).vo2max,52.4);
});

test('remarks about the proposal are not kept as lasting preferences; the question picks the sport',()=>{
  for(const m of ['I like this plan, but make Thursday shorter','I prefer the first option','Nechci to, dej mi jinou variantu','Líbí se mi tenhle návrh'])assert.equal(explicitPreference(m),null,m);
  assert.equal(explicitPreference('I prefer riding outdoors'),'I prefer riding outdoors');
  assert.equal(engineSport({sport:'cycling'},null,'Můžu zítra běžet tempo?'),'run');
  assert.equal(engineSport({sport:'running'},null,'Should I ride hard today?'),'ride');
  assert.equal(engineSport({sport:'cycling'},null,'Should I run or ride?'),'ride');
  const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
  // Dropped proposals are named in the answer; the plan's week and the cycle reach the coach.
  assert.match(entry,/neprošl'\+\(dropped===1\?'':'y'\)\+' kontrolou aplikace/);
  assert.match(entry,/coachCtx\.trainingPlan=\{name:targets\.plan\.name/);
  assert.match(entry,/sleepGoal:profile\.sleepGoal,cycle:profile\.cycle\|\|null/);
});

test('the coach\'s food view carries the weight goal, deficit, minimum, burned energy, drinks and the last days', () => {
  const n = { calorieTarget: 2400, macros: { protein_g: 150 }, foodLog: { totals: { kcal: 900, protein_g: 50 } }, calorieBreakdown: { minTarget: 1900, weightLossDeficit: 400 }, targetWeightKg: 80, reason: 'Zítřejší kolo je zohledněné už dnes.', energyBudget: { active: 600 } };
  const daily = { weight: { current: 86.4, average7d: 86.6, average30d: 87.9 }, burned: { total: 2900, activity: 700 } };
  const week = { days: [{ date: '2026-10-12', daily: { nutrition: { calorieTarget: 2500, foodLog: { totals: { kcal: 2300, protein_g: 140 } } } } }, { date: '2026-10-13', daily: { nutrition: { foodLog: { totals: { kcal: 0 } } } } }, { date: '2026-10-14', daily: {} }] };
  const c = nutritionContext(n, { daily, week, fluids: { hydrationMl: 900, target: { ml: 2600 } }, date: '2026-10-14' });
  assert.equal(c.minimumKcal, 1900);
  assert.equal(c.deficitKcal, 400);
  assert.deepEqual(c.weight, { currentKg: 86.4, average7dKg: 86.6, average30dKg: 87.9, goalKg: 80 });
  assert.deepEqual(c.burned, { dayKcal: 2900, activityKcal: 700, activeSoFarKcal: 600 });
  assert.deepEqual(c.drinks, { drunkMl: 900, targetMl: 2600 });
  assert.deepEqual(c.lastDays, [{ date: '2026-10-12', eatenKcal: 2300, proteinG: 140, targetKcal: 2500 }]);
  assert.match(c.targetReason, /kolo/);
  assert.equal(nutritionContext({ calorieTarget: 2000 }).weight, undefined);
});

test('the coach sees VO2max, walking heart rate, heart rate recovery and the athlete\'s own wellness marks', async () => {
  const { compactWellnessRow } = await import('../src/coach-assistant.js');
  const row = compactWellnessRow({ id: '2026-10-13', vo2max: 52.34, walkingHR: 96.4, hrRecovery: 31, fatigue: 3, soreness: 2, mood: null, stress: 9 });
  assert.equal(row.vo2max, 52.3);
  assert.equal(row.walkingHR, 96);
  assert.equal(row.hrRecovery, 31);
  assert.deepEqual(row.feelings, { fatigue: 3, soreness: 2, scale: '1 best, 4 worst' });
  assert.equal(compactWellnessRow({ id: '2026-10-13' }).feelings, undefined);
});

test('the coach sees how the nights went, not only how long, and the sleep debt',()=>{
  const night={date:'2026-10-05',durationMin:390,timeInBedMin:450,stages:{DEEP:42,REM:70,LIGHT:278,AWAKE:55},latencyMin:25};
  assert.deepEqual(sleepNights([night,{date:'2026-10-05',durationMin:40,nap:true}],'2026-10-05'),[{date:'2026-10-05',minutes:390,deep:42,rem:70,light:278,awake:55,fallAsleep:25,efficiency:87}]);
  const short=[1,2,3,4,5].map(k=>({date:`2026-10-0${k}`,durationMin:360}));
  const need=sleepNeedContext(short,{date:'2026-10-05',profile:{age:35}});
  assert.ok(need.debt7dMinutes>=200);
  assert.ok(need.tonightMinutes>=420);
  assert.equal(sleepNeedContext([],{date:'2026-10-05'}),null);
});

test('a strength athlete gets a gym day from the engine; a ride, run or swim only when asked or planned (nález 20b)', () => {
  const today = '2026-10-30', strength = { sport: 'strength' };
  assert.equal(gymDay(strength), true);
  assert.equal(gymDay(strength, { message: 'Můžu dnes jet na kolo?' }), false);
  assert.equal(gymDay(strength, { message: 'Can I go for a run?' }), false);
  assert.equal(gymDay(strength, { message: 'A co plavání?' }), false);
  assert.equal(gymDay(strength, { appContext: { sport: 'run' } }), false);
  assert.equal(gymDay(strength, { appContext: { sport: 'swim' } }), false);
  assert.equal(gymDay({ sport: 'cycling' }), false);
  // Ordinary words are no ride or run: during, around, rounds, a cycle.
  for (const message of ['Mám čas kolem 40 minut', 'Co během obědové pauzy?', 'Kolik kol dřepů?', 'Jsem na začátku cyklu', 'My cycle started']) assert.equal(gymDay(strength, { message }), true, message);
  // A ride planned for today stays the day's session.
  assert.equal(gymDay(strength, { daily: { training: { planned: [{ type: 'Ride', name: 'Endurance' }] } } }), false);
  assert.equal(gymDay(strength, { daily: { training: { planned: [{ type: 'WeightTraining', name: 'Legs' }] } } }), true);
  const context = coachContext({ date: today, week: { days: [] }, gym: { history: [] }, focus: strength, availabilityMinutes: 50 });
  const rec = context.cyclingCoachV2.recommendation;
  assert.equal(context.gymDay, true);
  assert.equal(context.cyclingCoachV2.sport, 'gym');
  assert.match(rec.session.kind, /^gym/);
  assert.equal(rec.session.durationMinutes, 50);
  assert.equal(rec.decisionRule, 'strength_main_sport');
  assert.ok(context.cyclingCoachV2.alternatives.every(a => a.onlyWhenAsked));
  assert.ok(context.cyclingCoachV2.readiness, 'readiness stays');
  // Asked about a ride: the engine's ride, not a gym day.
  const asked = coachContext({ date: today, week: { days: [] }, gym: { history: [] }, focus: strength, message: 'Dlouhá jízda dnes?' });
  assert.equal(asked.gymDay, undefined);
  assert.notEqual(asked.cyclingCoachV2.sport, 'gym');
  // The week plan's time for the day sizes it; 0 minutes is no training.
  const base = { readiness: { status: 'green' }, load: {}, constraints: { autoLength: true, availableMinutes: 75 }, recommendation: { session: { kind: 'endurance' } }, alternatives: [] };
  assert.equal(strengthDay(base, { dayMinutes: 30 }).recommendation.session.durationMinutes, 30);
  assert.equal(strengthDay({ ...base, constraints: { autoLength: false, availableMinutes: 40 } }).recommendation.session.durationMinutes, 40);
  assert.equal(strengthDay(base).recommendation.session.durationMinutes, 60);
  const none = strengthDay(base, { availabilityMinutes: 0, dayMinutes: 60 }).recommendation.session;
  assert.equal(none.kind, 'rest'); assert.equal(none.durationMinutes, 0);
  // Red readiness: mobility; legs trained in 48 h (gym sets, a hard run, a long ride): upper body.
  const red = strengthDay({ ...base, readiness: { status: 'red' } });
  assert.equal(red.recommendation.session.kind, 'gym_recovery');
  assert.equal(strengthDay({ ...base, load: { lowerBodyGymSignals48h: 2 } }).recommendation.session.focus, 'upper');
  const ran = { days: [{ date: '2026-10-29', daily: { training: { completed: [{ type: 'Run', name: 'Intervals', durationHours: 1, intensity: true }] } } }] };
  assert.equal(strengthDay(base, { week: ran, date: today }).recommendation.session.focus, 'upper');
  const rode = { days: [{ date: '2026-10-28', daily: { training: { completed: [{ type: 'Ride', name: 'Long ride', durationHours: 3, intensity: false }] } } }] };
  assert.equal(strengthDay(base, { week: rode, date: today }).recommendation.session.focus, 'upper');
  const old = { days: [{ date: '2026-10-26', daily: { training: { completed: [{ type: 'Run', name: 'Intervals', durationHours: 1, intensity: true }] } } }] };
  assert.equal(strengthDay(base, { week: old, date: today }).recommendation.session.focus, 'full');
  const paused = { athleteState: { paused: true }, recommendation: { session: { kind: 'rest' } } };
  assert.equal(strengthDay(paused), paused, 'illness or injury keeps the pause');
});

test('the engine sport reads whole words only', () => {
  assert.equal(engineSport({ sport: 'running' }, null, 'Mám čas kolem 40 minut'), 'run');
  assert.equal(engineSport({ sport: 'cycling' }, null, 'Co během obědové pauzy?'), 'ride');
  assert.equal(engineSport({ sport: 'cycling' }, null, 'Zítra běh?'), 'run');
  assert.equal(engineSport({ sport: 'running' }, null, 'Na kole v sobotu?'), 'ride');
  assert.equal(engineSport({ sport: 'running' }, null, 'Plavání v bazénu'), 'swim');
});
