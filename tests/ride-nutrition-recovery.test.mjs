import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {analyzeRide,rideReviewSections} from '../src/ride-analysis.js';
import {foodIntake} from '../src/food-portions.js';
test('manual cycling drink uses whole portion and permits zero protein and fat',()=>{
  const result=foodIntake({nutrition_basis:'portion',calories_100g:586,protein_100g:0,carbs_100g:144,fat_100g:0},1,'portion');
  assert.equal(result.calories,586);assert.equal(result.carbs_g,144);assert.equal(result.protein_g,0);assert.equal(result.fat_g,0);
});
test('ride review uses actual Intervals aliases and time weighted stream zones',()=>{
  const a=analyzeRide({icu_ftp:200,icu_weighted_avg_watts:190,icu_average_watts:170},[{type:'time',data:[0,10,20,30]},{type:'watts',data:[100,200,0,100]},{type:'cadence',data:[80,100,0,80]}]);
  assert.equal(a.averageWatts,100);assert.equal(a.normalizedWatts,190);assert.equal(a.intensity,.95);assert.equal(a.zones.reduce((s,z)=>s+z.seconds,0),30);assert.ok(rideReviewSections(a).some(s=>s.label==='Čas v pásmech výkonu'));
});
test('missing power and gaps are not fabricated as zero or interpolated across long pauses',()=>{
  const a=analyzeRide({icu_ftp:200},[{type:'time',data:[0,5,1000,1005]},{type:'watts',data:[null,150,100,100]}]);
  assert.equal(a.powerSeconds,5);assert.equal(a.averageWatts,100);assert.equal(a.normalizedWatts,null);assert.equal(a.aerobicDrift,null);
});
test('recovery compares current Google metrics to prior baseline without invented percentage',()=>{
  const src=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8'),code=src.slice(src.indexOf('function recoverySignals('),src.indexOf('function renderTrainingClarity(')),ctx=vm.createContext({Math,Number,measured:v=>v!=null&&Number.isFinite(Number(v)),num:v=>Number(v)||0,fmt:v=>String(v),hm:v=>v+' min',dateShift:()=> '2026-08-27'});vm.runInContext(code,ctx);
  const rows=Array.from({length:10},(_,i)=>({id:'2026-09-'+String(i+10).padStart(2,'0'),hrv:100,restingHR:50}));rows.push({id:'2026-09-26',hrv:60,restingHR:60});
  const result=ctx.recoverySignals(rows,{date:'2026-09-26',durationMin:300},'2026-09-26');assert.match(result.title,/zvolni/);assert.match(result.text,/HRV 60/);assert.doesNotMatch(result.text,/%/);
});
