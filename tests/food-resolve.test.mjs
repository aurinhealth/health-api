import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './helpers/d1.mjs';
import {scopedDb} from '../src/tenancy.js';
import {resolveFoodProduct,logResolvedFood} from '../src/food-log.js';
import {savePersonalFood} from '../src/personal-foods.js';

// No external food database: label values, then the user's saved foods.
test('a food resolves from the label, then from saved foods, and never from the network',async()=>{
 const db=scopedDb(createD1(),1),old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('no network expected');};
 try{
  const label=await resolveFoodProduct(db,{name:'Pudink',calories_100g:81,protein_100g:10,carbs_100g:6.4,fat_100g:1.6});
  assert.deepEqual([label.status,label.match,label.product.calories_100g],['ok','package_label',81]);
  assert.equal((await resolveFoodProduct(db,{name:'banán'})).status,'not_found');
  await savePersonalFood(db,{name:'Skyr bílý',brand:'Milko',barcode:'8594001234567',calories_100g:63,protein_100g:11,carbs_100g:4,fat_100g:0.2});
  const byName=await resolveFoodProduct(db,{name:'skyr bily'}),byCode=await resolveFoodProduct(db,{barcode:'8594001234567'});
  assert.deepEqual([byName.match,byName.product.name,byCode.product.brand],['personal','Skyr bílý','Milko']);
  await assert.rejects(logResolvedFood(db,{name:'Pizza',grams:200}),/label values/);
 }finally{globalThis.fetch=old;}
});
