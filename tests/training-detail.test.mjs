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
