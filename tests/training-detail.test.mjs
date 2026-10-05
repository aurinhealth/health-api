import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
function client(){
  const context=vm.createContext({esc:v=>String(v??''),num:(v,d=0)=>Number.isFinite(Number(v))?Number(v):d,measured:v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)),fmt:v=>Math.round(Number(v)),hm:m=>m+' min'});
  vm.runInContext(source.slice(source.indexOf('function intensityOf('),source.indexOf('function ifText(')),context);
  vm.runInContext(source.slice(source.indexOf('// Detail of a training in the week'),source.indexOf('async function openTrainingDetail(')),context);
  return code=>vm.runInContext(code,context);
}

test('a done ride is compared with its plan and judged by load',()=>{
  const run=client();
  assert.match(run("planVerdict({durationHours:1.5,tss:90},{durationHours:1.45,tss:86})"),/Splněno podle plánu/);
  assert.match(run("planVerdict({durationHours:1.5,tss:90},{durationHours:1,tss:60})"),/lehčeji/);
  assert.match(run("planVerdict({durationHours:1.5,tss:90},{durationHours:2,tss:130})"),/náročněji/);
  assert.equal(run("planVerdict({},{durationHours:1})"),'');
  const table=run("compareTableHtml([['Délka',90,60,hm],['TSS',null,null,String]])");
  assert.match(table,/Délka.*90 min.*60 min.*-33 %/);assert.doesNotMatch(table,/TSS/);
});

test('the planned structure keeps steps and headings from the Intervals.icu text',()=>{
  const run=client(),html=run("workoutPlanHtml('Rozjetí\\n- 15m 55%\\n3x\\n- 12m 90%')");
  assert.equal((html.match(/plan-step"/g)||[]).length,2);assert.match(html,/plan-step-head">3x/);
  assert.match(run("workoutPlanHtml('')"),/nemá v Intervals.icu popsanou strukturu/);
});

test('a done gym compares the plan with the saved sets, including exercises outside the plan',()=>{
  const run=client(),values=JSON.stringify([[],[],[],[],[],[],[],['WORK','Bench','1','40','10','','','','FALSE'],['WORK','Bench','2','40','10','','','','FALSE'],['WORK','Row','1','50','10','42','10','','TRUE']]);
  const history=JSON.stringify([{type:'WORK',exercise:'Bench',actual_kg:40,actual_reps:10},{type:'WARMUP',exercise:'Bench',actual_kg:20,actual_reps:8},{type:'WORK',exercise:'Curl',actual_kg:12,actual_reps:12}]);
  const html=run('gymCompareHtml('+values+',true,'+history+')');
  assert.match(html,/Bench<\/th><td>2 × 10 · 40 kg<\/td><td class="under">40×10<\/td>/);
  assert.match(html,/Row<\/th><td>1 × 10 · 50 kg<\/td><td class="ok">42×10<\/td>/);
  assert.match(html,/Curl<\/th><td>mimo plán<\/td><td class="ok">12×12<\/td>/);
  assert.doesNotMatch(run('gymCompareHtml('+values+',false)'),/Odcvičeno/);
});
