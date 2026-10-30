import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './helpers/d1.mjs';
import {scopedDb} from '../src/tenancy.js';
import {trainingHistory} from '../src/training-history.js';
import {swimBestPoints,swimBests} from '../src/performance-trends.js';
const schema=readFileSync(new URL('../staging/schema.sql',import.meta.url),'utf8');
const NOW=Date.now(),DAY=86400000;
function swim(raw,days,payload){
 const start=new Date(NOW-days*DAY).toISOString().slice(0,10)+'T07:00:00';
 raw.sqlite.prepare('INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,sample_time,payload_json) VALUES(1,?,?,?,?,?,?)').run('intervals','activity',crypto.randomUUID(),start,start,JSON.stringify({type:'Swim',moving_time:1800,distance:1500,...payload}));
}

test('the pool of the last pool swim, from the activities already read',async()=>{
 const raw=createD1();raw.sqlite.exec(schema);const db=scopedDb(raw,1);
 assert.equal((await trainingHistory(db,1,{now:NOW})).poolLength,null,'no swims: nothing guessed');
 swim(raw,10,{pool_length:50});swim(raw,3,{pool_length:25});swim(raw,1,{type:'OpenWaterSwim'});swim(raw,2,{pool_length:17});
 assert.equal((await trainingHistory(db,1,{now:NOW})).poolLength,25,'open water and odd lengths are skipped');
});

test('the best 100, 200 and 400 m of the year from the pace curve, read once',async()=>{
 const body={list:[{id:'1y',distance:[50,100,200,400],values:[40,88,190,400],activity_id:['a','b','c','d']}]};
 assert.deepEqual(swimBestPoints(body),[{meters:100,seconds:88,per100:88},{meters:200,seconds:190,per100:95},{meters:400,seconds:400,per100:100}]);
 assert.equal(swimBestPoints({list:[]}),null);
 const urls=[];
 const out=await swimBests({INTERVALS_API_KEY:'k'},'Basic x',async url=>{urls.push(url);return {ok:true,json:async()=>body};});
 assert.equal(out.length,3);
 assert.deepEqual(urls,['https://intervals.icu/api/v1/athlete/0/pace-curves?type=Swim&curves=1y']);
 assert.equal(await swimBests({},'Basic x',async()=>{throw new Error('no key: no read');}),null);
});
