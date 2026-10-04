import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
function run(from,to,scope={}){const ctx=vm.createContext(scope);vm.runInContext(source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from))),ctx);return ctx;}
test('calorie progress uses logged kcal, normalizes macro shares and distinguishes no food from a tiny entry',()=>{
  const ctx=run('function calorieChartDay(', 'function macroChart(',{num:(v)=>Number(v)||0});
  const row={daily:{nutrition:{calorieTarget:2701}},food:{totals:{kcal:629,protein_g:29,carbs_g:77,fat_g:22}}};
  const day=ctx.calorieChartDay(row);assert.equal(day.progress,629/2701*100);assert.ok(Math.abs(day.macros.reduce((s,m)=>s+m.share,0)-100)<1e-9);
  assert.equal(ctx.calorieChartDay({food:{totals:{kcal:1}}}).logged,true);
  assert.equal(ctx.calorieChartDay({food:{totals:{kcal:0}}}).logged,false);
  assert.equal(ctx.calorieChartDay({food:{totals:{kcal:0},entries:[{id:1}]}}).logged,true);
});
test('today uses current daily data and suppresses the cancelled gym fallback and recurring gym suggestion',()=>{
  const date='2026-10-04',state={daily:{training:{planned:[],completed:[]}},gym:{date,cancelled:true,values:[]},week:{days:[{date,gymCancelled:true,daily:{training:{planned:[{name:'Old gym',type:'WeightTraining'}]}}}]},weekPlan:{roles:{6:{items:[{sport:'gym',label:'Gym'}]}}}};
  const ctx=run('function todayItems(', '// Walks are everyday',{state,selectedHistoryDate:date,hubDays:()=>state.week.days,pragueToday:()=>date,statusPausesTraining:()=>false,gymCancelledOn:()=>true,weekdayOf:()=>6,isNutritionItem:()=>false,activitySport:()=> 'gym'});
  assert.equal(ctx.todayItems(date).length,0);
});
