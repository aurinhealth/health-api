import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { generateStrengthPlan, EXERCISES } from '../src/strength-generator.js';
import { configureStrengthCoaching, estimateStrengthTiming } from '../src/strength-timing.js';
import { planValues } from '../src/gym-plan-store.js';
import { strengthPlanToIntervalsEvent } from '../src/intervals-strength.js';
const source=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
const row=(name,n,options={})=>['WORK',name,String(n),'162,5','10','','','','FALSE','[Pauza 75 s]','','FALSE',''].map((v,i)=>i===12?options.group||'':i===8?options.done?'TRUE':'FALSE':v);

function client(rows,storage=new Map(),userId=1){
  const el={hidden:true,innerHTML:''};
  const state={account:{id:userId},gym:{date:'2026-10-04',values:Array.from({length:7},()=>[]).concat(rows)}};
  const context=vm.createContext({state,$:id=>id==='gymMode'?el:null,document:{body:{classList:{add(){},remove(){}}}},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},num:(v,d=0)=>Number.isFinite(Number(v))?Number(v):d,fmt:v=>v,esc:v=>String(v??''),gymDay:()=>state.gym.date,renderToday(){},renderGym(){},renderGymHistory(){},setInterval:()=>1,clearInterval(){},toast(){},jsonFetch:async()=>({}),gymSaveQueue:Promise.resolve()});
  vm.runInContext(source.slice(source.indexOf('// Gym workout mode:'),source.indexOf('function installPhoneLayer(')),context);
  const run=code=>vm.runInContext(code,context);
  const click=action=>{context.event={target:{closest:()=>({dataset:{gm:action}})}};return run("$('gymMode').onclick(event)");};
  return {context,el,state,run,click,storage};
}

test('AI exercise swaps protect edited drafts and preserve other drafts when row numbers change',async()=>{
  const app=client([row('Low row',1),row('Low row',2),row('Leg press',1)]);await app.run('openGymMode()');
  assert.equal(app.run("gymExerciseHasEditedDraft('Low row')"),false);
  app.run('gymMode.kg=190;rememberGymDraft()');assert.equal(app.run("gymExerciseHasEditedDraft('Low row')"),true);
  app.run('gymMode.kg=162.5;rememberGymDraft();moveGymMode(2);gymMode.kg=210;rememberGymDraft();moveGymMode(-2)');
  const warm=row('Lat pulldown',1);warm[0]='WARMUP';app.context.result={values:Array.from({length:7},()=>[]).concat([warm,row('Lat pulldown',1),row('Lat pulldown',2),row('Leg press',1)])};
  app.run("applyGymSwapToScreen({date:'2026-10-04',fromExercise:'Low row',toExercise:'Lat pulldown'},result)");
  assert.match(app.el.innerHTML,/Lat pulldown/);app.run('moveGymMode(3)');assert.equal(app.run('gymMode.kg'),210);assert.equal(app.run('gymSets()[gymMode.pos].r[1]'),'Leg press');
});

test('comma weights and drafts survive navigation, closing and a fresh client for the same user',async()=>{
  const rows=[row('Leg press',1),row('Leg press',2)],a=client(rows);
  await a.run('openGymMode()');assert.match(a.el.innerHTML,/value="162.5"/);
  a.context.input={target:{id:'gmKg',value:'210,5'}};a.run("$('gymMode').oninput(input)");
  await a.click('next');await a.click('prev');assert.match(a.el.innerHTML,/value="210,5"/);
  await a.click('close');await a.run('openGymMode()');assert.match(a.el.innerHTML,/value="210,5"/);
  const b=client(rows,a.storage);await b.run('openGymMode()');assert.match(b.el.innerHTML,/value="210,5"/);
  const other=client(rows,a.storage,2);await other.run('openGymMode()');assert.doesNotMatch(other.el.innerHTML,/value="210,5"/);
  b.state.gym.values[7][5]='190';b.run('gymMode.forIdx=null;renderGymMode()');assert.match(b.el.innerHTML,/value="190"/);
});

test('superset copies show the actual ordinal and the end of an incomplete plan offers remaining sets',async()=>{
  const a=client([row('Curl',1,{group:'A'}),row('Curl',2,{group:'A'}),row('Triceps',1,{group:'A'}),row('Triceps',2,{group:'A'})]);
  await a.run('openGymMode()');assert.match(a.el.innerHTML,/Série 1 z 2/);
  await a.click('next');await a.click('next');assert.match(a.el.innerHTML,/Série 2 z 2/);
  await a.click('next');await a.click('next');assert.match(a.el.innerHTML,/Konec plánu/);assert.doesNotMatch(a.el.innerHTML,/Trénink hotový/);
  await a.click('resume');assert.match(a.el.innerHTML,/Série 1 z 2/);
  const done=client([row('Crunch',1,{done:true}),row('Crunch',2,{done:true})]);await done.run('openGymMode()');assert.match(done.el.innerHTML,/Trénink hotový/);
});

test('warmups accept effort below six, failure can be corrected and rest follows the prescription',async()=>{
  const a=client([row('Crunch',1)]);await a.run('openGymMode()');
  a.context.event={target:{closest:()=>({dataset:{gmRpe:'4'}})}};await a.run("$('gymMode').onclick(event)");assert.equal(a.run('gymMode.rpe'),4);
  a.run('gymMode.toFailure=true');a.context.event={target:{closest:()=>({dataset:{gmRpe:'8'}})}};await a.run("$('gymMode').onclick(event)");assert.equal(a.run('gymMode.toFailure'),false);
  a.context.cur={r:['WARMUP']};a.context.next={r:['WORK']};assert.equal(a.run('gymRestSeconds(cur,next)'),60);
  a.context.cur={r:row('Curl',1),superset:'A',round:0};a.context.next={r:row('Triceps',1),superset:'A',round:0};assert.equal(a.run('gymRestSeconds(cur,next)'),0);
  a.context.next.round=1;assert.equal(a.run('gymRestSeconds(cur,next)'),75);
  assert.equal(a.run('gymRestSeconds(cur,null)'),0);
});

test('saving the final set ends the workout and lists a skipped work set instead of jumping back',async()=>{
  const a=client([row('Leg press',1),row('Crunch',1,{done:true}),row('Crunch',2)]);
  await a.run('openGymMode()');assert.equal(a.run('gymMode.pos'),2);
  await a.click('done');assert.match(a.el.innerHTML,/Konec plánu/);assert.match(a.el.innerHTML,/Leg press · 1×/);assert.doesNotMatch(a.el.innerHTML,/<h2>Leg press/);
  assert.equal(a.state.gym.values[9][8],'TRUE');assert.equal(a.state.gym.values[7][8],'FALSE');
  await a.click('resume');assert.match(a.el.innerHTML,/<h2>Leg press<\/h2>/);
});

test('skipped warm-ups are never offered again and do not block the finished workout',async()=>{
  const warm=(name,n)=>{const r=row(name,n);r[0]='WARMUP';return r;};
  const a=client([warm('Bench',1),warm('Bench',2),row('Bench',1),row('Bench',2),warm('Row',1),row('Row',1)]);
  await a.run('openGymMode()');assert.equal(a.run('gymMode.pos'),0);
  await a.click('next');await a.click('next');await a.click('done');assert.equal(a.run('gymMode.pos'),3);
  assert.match(a.el.innerHTML,/1 \/ 4 sérií/);
  await a.click('done');assert.equal(a.run('gymSets()[gymMode.pos].r[1]'),'Row');
  await a.click('next');await a.click('done');
  assert.match(a.el.innerHTML,/Trénink hotový/);assert.doesNotMatch(a.el.innerHTML,/Přeskočené/);
  await a.click('close');await a.run('openGymMode()');assert.match(a.el.innerHTML,/Trénink hotový/);
});

test('controls do not trigger swipes and vertical scrolling leaves the current set unchanged',async()=>{
  const a=client([row('Crunch',1),row('Crunch',2)]);await a.run('openGymMode()');
  a.context.start={target:{closest:()=>({})},touches:[{clientX:200,clientY:100}]};a.context.end={changedTouches:[{clientX:20,clientY:100}]};
  a.run("$('gymMode').ontouchstart(start);$('gymMode').ontouchend(end)");assert.equal(a.run('gymMode.pos'),0);
  a.context.start.target.closest=()=>null;a.context.end.changedTouches[0].clientY=400;
  a.run("$('gymMode').ontouchstart(start);$('gymMode').ontouchend(end)");assert.equal(a.run('gymMode.pos'),0);
  a.context.end.changedTouches[0].clientY=100;
  a.run("$('gymMode').ontouchstart(start);$('gymMode').ontouchend(end)");assert.equal(a.run('gymMode.pos'),1);
});

test('45 minute strength proposals fit including equipment time, both sides, rests and a buffer',()=>{
  for(const focus of [undefined,'upper','lower']){
    const plan=generateStrengthPlan({date:'2026-10-04',strength:{recentCompletedSets:[]},cycling:{recentActivities:[],plannedWorkouts:[]},recovery:{}},{durationMinutes:45,focus});
    assert.ok(plan.timing.totalSeconds<=2700);assert.ok(plan.timing.bufferSeconds>=180);
    assert.deepEqual(estimateStrengthTiming(plan.rows,EXERCISES,45),plan.timing);
    assert.equal(planValues(plan)[4][1],45);
  }
  const def={'Left':{unilateral:true},'Both':{unilateral:false}};
  assert.ok(estimateStrengthTiming([row('Left',1)],def).workSeconds>estimateStrengthTiming([row('Both',1)],def).workSeconds);
});

test('coach pairs compatible accessory equipment, prescribes one failure set only when recovered and exports the instructions',()=>{
  const rows=[row('Cable curl',1),row('Cable curl',2),row('Cable triceps extension',1),row('Cable triceps extension',2),row('Pivot leg press',1)];
  configureStrengthCoaching(rows,EXERCISES);assert.equal(rows[0][12],'A');assert.equal(rows[2][12],'A');assert.equal(rows.filter(r=>r[11]==='TRUE').length,1);assert.equal(rows.at(-1)[11],'FALSE');
  const event=strengthPlanToIntervalsEvent({date:'2026-10-04',rows},{durationMinutes:45});assert.match(event.description,/supersérie A/);assert.match(event.description,/technického selhání/);assert.match(event.description,/pauza 75 s/);
  configureStrengthCoaching(rows,EXERCISES,{factor:.9});assert.equal(rows.filter(r=>r[11]==='TRUE').length,0);
});

test('delayed table saves retain newer edits and recover after a network failure',async()=>{
  const a=client([row('Press',1),row('Row',1)]),requests=[];let fail=true;
  a.context.clearTimeout=()=>{};a.context.notice={textContent:''};
  a.context.$=id=>id==='gymNotice'?a.context.notice:null;
  a.context.jsonFetch=async(_url,options)=>{requests.push(JSON.parse(options.body));if(fail){fail=false;throw new Error('offline');}return {history:[]};};
  a.run(source.slice(source.indexOf('function gymRowValues('),source.indexOf('function renderGymHistory(')));
  const tr=(n,kg)=>({dataset:{row:n},querySelectorAll:()=>[{dataset:{col:5},value:kg}]});
  await a.context.persistGymRow(tr(0,'190')).catch(()=>{});
  const first=a.context.persistGymRow(tr(0,'195')),second=a.context.persistGymRow(tr(1,'40'));
  await Promise.all([first,second]);
  assert.equal(a.state.gym.values[7][5],'195');assert.equal(a.state.gym.values[8][5],'40');
  assert.equal(requests.at(-1).fullValues[7][5],'195');assert.equal(requests.at(-1).fullValues[8][5],'40');
});

test('a 30 minute strength session still fits with warm-up, rests and a buffer',()=>{
  for(const focus of [undefined,'upper','lower']){
    const plan=generateStrengthPlan({date:'2026-10-04',strength:{recentCompletedSets:[]},cycling:{recentActivities:[],plannedWorkouts:[]},recovery:{}},{durationMinutes:30,focus});
    assert.ok(plan.timing.totalSeconds<=1800);assert.ok(plan.rows.some(r=>r[0]==='WORK'));
  }
});

test('workout mode swaps, adds and removes exercises and sets; saved sets stay and drafts follow their rows',async()=>{
  const done=row('Bench',1,{done:true});done[5]='60';done[6]='8';
  const a=client([done,row('Bench',2),row('Bench',3),row('Row',1),row('Row',2)]);
  a.context.gymExerciseCatalog=[];
  const save=[];a.context.jsonFetch=async(url,options)=>{if(String(url).includes('/alternatives'))return {alternatives:[{name:'Chest flat press Prime',muscle:'Hrudník',reps:'8–12',kg:40,note:'Prime stroj'}]};save.push(JSON.parse(options.body));return {};};
  await a.run('openGymMode()');assert.equal(a.run('gymSets()[gymMode.pos].r[2]'),'2');
  a.run('gymMode.kg=62.5;rememberGymDraft()');
  await a.click('edit');assert.match(a.el.innerHTML,/Upravit trénink/);assert.match(a.el.innerHTML,/Vyměnit cvik/);
  // One more set: the draft stays on its set, the new one is numbered after the others.
  await a.click('add-set');
  assert.deepEqual(a.state.gym.values.slice(7).filter(r=>r[1]==='Bench').map(r=>r[2]),['1','2','3','4']);
  assert.equal(a.run('gymSets()[gymMode.pos].r[2]'),'2');assert.equal(a.run('gymMode.kg'),62.5);
  // Saved through the full save, so the history follows the plan.
  assert.ok(save.at(-1).fullValues&&Array.isArray(save.at(-1).values));
  // An open set goes at once; the workout continues on the next open set.
  await a.click('edit');await a.click('remove-set');
  assert.equal(a.state.gym.values.slice(7).filter(r=>r[1]==='Bench').length,3);
  assert.equal(a.run('gymSets()[gymMode.pos].r[1]'),'Bench');assert.equal(a.run('gymSetDone(gymSets()[gymMode.pos])'),false);
  // Swap: the open Bench sets become the machine press, the saved set stays Bench.
  await a.click('edit');await a.click('swap');assert.match(a.el.innerHTML,/Chest flat press Prime/);
  a.context.event={target:{closest:()=>({dataset:{gmAlt:'0'}})}};await a.run("$('gymMode').onclick(event)");
  const plan=a.state.gym.values.slice(7);
  assert.deepEqual(plan.map(r=>r[1]),['Bench','Chest flat press Prime','Chest flat press Prime','Row','Row']);
  assert.equal(plan[0][8],'TRUE');assert.equal(plan[1][3],'40');assert.match(plan[1][9],/místo Bench/);
  assert.equal(a.run('gymSets()[gymMode.pos].r[1]'),'Chest flat press Prime');
  // Removing an exercise asks first and keeps saved sets.
  await a.click('edit');await a.click('remove-exercise');assert.match(a.el.innerHTML,/Opravdu vynechat zbývající série \(2\)/);
  await a.click('remove-exercise');
  assert.deepEqual(a.state.gym.values.slice(7).map(r=>r[1]),['Bench','Row','Row']);
  assert.equal(a.run('gymSets()[gymMode.pos].r[1]'),'Row');
  // A saved set is removed only after a second tap.
  a.run('gymMode.pos=0;gymMode.forIdx=null;renderGymMode()');await a.click('edit');await a.click('remove-set');
  assert.match(a.el.innerHTML,/Opravdu smazat uloženou sérii/);assert.equal(a.state.gym.values.slice(7).length,3);
  await a.click('remove-set');assert.deepEqual(a.state.gym.values.slice(7).map(r=>r[1]),['Row','Row']);
});

test('the coach prescribes failure and supersets; the athlete only logs the effort',async()=>{
  const last=row('Curl',2,{group:'A'});last[9]='Biceps [Pauza 75 s]; poslední série do technického selhání, jen při čistém provedení';last[11]='TRUE';
  const a=client([row('Curl',1,{group:'A'}),row('Triceps',1,{group:'A'}),last,row('Triceps',2,{group:'A'})]);
  await a.run('openGymMode()');
  assert.doesNotMatch(a.el.innerHTML,/type="checkbox"|<select/);
  assert.match(a.el.innerHTML,/Supersérie A s cvikem Triceps/);assert.doesNotMatch(a.el.innerHTML,/do technického selhání/);
  await a.click('next');await a.click('next');assert.match(a.el.innerHTML,/Trenér: tuhle sérii do technického selhání/);
  // Not reaching failure is logged as it was; RPE 10 records the failure.
  a.context.event={target:{closest:()=>({dataset:{gmRpe:'9'}})}};await a.run("$('gymMode').onclick(event)");
  await a.click('done');assert.equal(a.state.gym.values[9][7],'9');assert.equal(a.state.gym.values[9][11],'FALSE');
  a.run('gymMode.pos=0;gymMode.forIdx=null;renderGymMode()');
  a.context.event={target:{closest:()=>({dataset:{gmRpe:'10'}})}};await a.run("$('gymMode').onclick(event)");
  await a.click('done');assert.equal(a.state.gym.values[7][7],'10');assert.equal(a.state.gym.values[7][11],'TRUE');
});

test('a finished exercise swapped later corrects its name, saved weights and reps stay',()=>{
  const a=client([]);
  const done=n=>{const r=row('Low row',n,{done:true});r[5]='50';r[6]='10';return r;};
  const result=a.run("swapGymExercise").call(null,[done(1),done(2),row('Leg press',1)],'Low row',{name:'Standing rowing machine',reps:'8–12',kg:45});
  assert.deepEqual(result.rows.map(r=>r[1]+':'+r[5]),['Standing rowing machine:50','Standing rowing machine:50','Leg press:']);
  assert.equal(a.run("swapGymExercise").call(null,[done(1)],'Low row',{name:'Low row'}),null);
});
