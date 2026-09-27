import test from 'node:test';
import assert from 'node:assert/strict';
import {searchReferenceFoods,foodReferenceDataset} from '../src/food-reference.js';
import {resolveFood,searchOpenFoodFacts,lookupOpenFoodFactsBarcode} from '../src/food-sources.js';

test('130 Czech reference foods keep numeric macros, citations and redistribution licence',()=>{
 assert.equal(foodReferenceDataset.products.length,130);
 assert.match(foodReferenceDataset.license_text,/Open Database License/);
 assert.match(foodReferenceDataset.contents_license_text,/OpenNutrition/);
 for(const p of foodReferenceDataset.products){assert.ok(p.citations.length);for(const k of ['calories_100g','protein_100g','carbs_100g','fat_100g'])assert.ok(Number.isFinite(p[k])&&p[k]>=0,p.name+' '+k);assert.equal(p.nutrition_basis,'g');}
});
test('Czech words, diacritics and minor generic typos work, brands do not become generic food',()=>{
 for(const q of ['ovesné vločky','ovesne vlocky','kuřecí prsa','cocka','nektarinka','nektarink'])assert.ok(searchReferenceFoods(q).length,q);
 assert.equal(searchReferenceFoods('monstert').length,0);
 assert.equal(searchReferenceFoods('kuřecí prsa Hollandia').length,0);
 assert.ok(searchReferenceFoods('rýže vařená').every(p=>p.name.includes('vařená')));
});
test('cooked and dry rice never share the same nutritional profile',()=>{
 const dry=searchReferenceFoods('rýže suchá')[0],cooked=searchReferenceFoods('rýže vařená')[0];
 assert.ok(dry.calories_100g>cooked.calories_100g*2);
});
test('basic ingredients resolve even when the external product database is offline',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('offline');};
 try{const r=await resolveFood({name:'ovesné vločky'});assert.equal(r.status,'ok');assert.equal(r.product.source,'opennutrition');}finally{globalThis.fetch=old;}
});
test('invalid Czech hits cannot suppress a usable global branded product',async()=>{
 const old=globalThis.fetch,queries=[];globalThis.fetch=async url=>{const q=new URL(url).searchParams.get('q');queries.push(q);return Response.json({hits:q.includes('countries_tags')?[{code:'1',product_name:'Monster',nutriments:{}}]:[{code:'12345678',product_name:'Monster',quantity:'500 ml',nutriments:{'energy-kcal_100g':47,carbohydrates_100g:12,proteins_100g:0,fat_100g:0}}]});};
 try{const r=await searchOpenFoodFacts('Monster');assert.equal(queries.length,2);assert.equal(r.products[0].calories_100g,47);assert.equal(r.products[0].nutrition_basis,'ml');}finally{globalThis.fetch=old;}
});
test('per-serving energy must not masquerade as per-100g energy',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({status:1,product:{code:'12345678',product_name:'Test',nutriments:{'energy-kcal_value':200,proteins_100g:10,fat_100g:3,carbohydrates_100g:20}}});
 try{const r=await lookupOpenFoodFactsBarcode('12345678');assert.equal(r.product.calories_100g,null);}finally{globalThis.fetch=old;}
});
