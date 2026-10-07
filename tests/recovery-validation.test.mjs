import test from 'node:test';
import assert from 'node:assert/strict';
import { pearson, repeatedMeasuresCorrelation, validationPairs, summarizeValidation, loadRecoveryValidation } from '../src/recovery-validation.js';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';

const day=i=>new Date(Date.UTC(2026,5,1)+i*86400000).toISOString().slice(0,10);

test('Pearson r with a Fisher-z confidence interval',()=>{
  const r=pearson([1,2,3,4,5,6,7,8,9,10],[2,4,5,4,5,7,8,9,10,12]);
  assert.ok(r.r>0.9&&r.ci[0]>0.6&&r.ci[1]<1);
  assert.equal(pearson([1,2,3],[1,2,3]).r,null);
});
test('repeated-measures correlation ignores differences between athletes',()=>{
  // Within each athlete y falls with x; between athletes the means rise together.
  const g=(base)=>[0,1,2,3,4,5].map(i=>({x:base+i,y:base*2-i+(i%2)*0.3}));
  const between=pearson([...g(0),...g(10),...g(20)].map(p=>p.x),[...g(0),...g(10),...g(20)].map(p=>p.y));
  const within=repeatedMeasuresCorrelation([g(0),g(10),g(20)]);
  assert.ok(between.r>0.8);assert.ok(within.r<-0.9);assert.equal(within.athletes,3);assert.equal(within.df,18-3-1);
});
test('pairs: a better morning goes with more output per beat and an easier-feeling session',()=>{
  const rows=Array.from({length:70},(_,i)=>({id:day(i),hrv:i<60?60+(i%5):[45,70,52,72,48,74,50,71,46,73][i-60],restingHR:50}));
  const activities=Array.from({length:10},(_,k)=>{const good=[0,1,0,1,0,1,0,1,0,1][k];return {start_date_local:day(60+k)+'T17:00:00',type:'Ride',icu_efficiency_factor:good?1.9+k*0.001:1.6,icu_rpe:good?5:7,icu_intensity:70+(k%3)};});
  const pairs=validationPairs({rows,activities});
  assert.equal(pairs.length,10);
  const s=summarizeValidation(pairs);
  assert.equal(s.efficiency.verdict,'supports');assert.equal(s.rpeResidual.verdict,'supports');
  assert.equal(summarizeValidation(pairs.slice(0,5)).efficiency.verdict,'insufficient_data');
});
test('the loader reads Google daily values and Intervals activities of the signed-in athlete',async()=>{
  const raw=createD1();
  raw.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT DEFAULT 'primary')");
  const today='2026-08-15',d=i=>new Date(Date.parse(today+'T12:00:00Z')-i*86400000).toISOString().slice(0,10);
  for(let i=80;i>=0;i--){raw.sqlite.prepare("INSERT INTO health_datapoints (user_id,source_family,data_type,sample_time,value_numeric,payload_json) VALUES (1,'google-wearables','daily-heart-rate-variability',?,?,'{}')").run(d(i),60+(i%4));}
  raw.sqlite.prepare("INSERT INTO health_datapoints (user_id,source_family,data_type,start_time,payload_json) VALUES (1,'intervals','activity',?,?)").run(d(2)+'T17:00:00',JSON.stringify({start_date_local:d(2)+'T17:00:00',type:'Ride',icu_efficiency_factor:1.8}));
  raw.sqlite.prepare("INSERT INTO health_datapoints (user_id,source_family,data_type,start_time,payload_json) VALUES (2,'intervals','activity',?,?)").run(d(3)+'T17:00:00',JSON.stringify({start_date_local:d(3)+'T17:00:00',type:'Ride',icu_efficiency_factor:1.8}));
  const out=await loadRecoveryValidation(scopedDb(raw,1),{today,days:30});
  assert.equal(out.status,'ok');assert.deepEqual(out.pairs.map(p=>p.date),[d(2)]);assert.equal(out.summary.efficiency.verdict,'insufficient_data');
});
