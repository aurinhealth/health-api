import test from 'node:test';
import assert from 'node:assert/strict';
import {activityDetail,sampleActivityStreams,heartRateZones} from '../src/activity-detail.js';
test('GPS and streams never turn missing values into zero coordinates',()=>{const out=sampleActivityStreams([{type:'time',data:[0,1,2]},{type:'latlng',data:[[50,14],[null,null],[91,10]]},{type:'watts',data:[100,null,200]}]);assert.equal(out.find(s=>s.type==='latlng').points.length,1);assert.deepEqual(out.find(s=>s.type==='watts').points.map(p=>p.v),[100,200]);});
test('long streams are bounded and retain endpoint',()=>{const data=Array.from({length:10000},(_,i)=>i);const out=sampleActivityStreams([{type:'watts',data}],1200)[0];assert.ok(out.points.length<=1201);assert.equal(out.points.at(-1).v,9999);});
test('private activity detail cannot disclose GPS without session',async()=>{let fetched=false;const old=globalThis.fetch;globalThis.fetch=async()=>{fetched=true;};try{const r=await activityDetail(new Request('https://example.com'),{INTERVALS_API_KEY:'test'},'i123',false);assert.equal(r.status,401);assert.equal(fetched,false);}finally{globalThis.fetch=old;}});
test('activity identifiers reject arbitrary URLs and path traversal',async()=>{const r=await activityDetail(new Request('https://example.com'),{INTERVALS_API_KEY:'test'},'../../secret',true);assert.equal(r.status,400);});

test('heart-rate zones carry their bpm range and time', () => {
  const zones = heartRateZones({ icu_hr_zones: [128, 146, 160, 172, 190], icu_hr_zone_times: [480, 2040, 720, 540, 120] });
  assert.equal(zones.length, 5);
  assert.deepEqual(zones[0], { zone: 1, min: null, max: 128, seconds: 480, percent: 12.307692307692308 });
  assert.equal(zones[1].min, 129);
  assert.equal(zones[4].max, null);
  const counted = heartRateZones({ icu_hr_zones: [120, 150, 180] }, [0, 10, 20, 30], [100, 110, 140, 170]);
  assert.deepEqual(counted.map(z => z.seconds), [10, 10, 10]);
  assert.deepEqual(heartRateZones({}), []);
});
