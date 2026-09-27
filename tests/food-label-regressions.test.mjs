import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNutritionLabel} from '../src/food-label.js';
import {calculateAmount,productFromLabel,searchOpenFoodFacts} from '../src/food-sources.js';
test('Czech label distinguishes total fat and carbs from saturated fat and sugars',()=>{
 const p=parseNutritionLabel('na 100 g\nEnergie 340 kJ / 81 kcal\nTuky 1,6 g\nz toho nasycené mastné kyseliny 1,1 g\nSacharidy 6,4 g\nz toho cukry 4,2 g\nBílkoviny 10 g\nSůl 0,28 g');
 assert.deepEqual(p,{calories_100g:81,fat_100g:1.6,carbs_100g:6.4,protein_100g:10,salt_100g:0.28});
 assert.equal(calculateAmount(p,200).calories,162);
});
test('unreadable values remain missing instead of becoming zero',()=>{
 assert.deepEqual(parseNutritionLabel('Bílkoviny nečitelné\nEnergie 340 kJ'),{});
 assert.equal(productFromLabel({calories_100g:null,protein_100g:null,carbs_100g:null,fat_100g:null}),null);
});
test('name search uses official full-text service with Czech-market filter',async()=>{
 const old=globalThis.fetch;let request;
 globalThis.fetch=async url=>{request||=new URL(url);return Response.json({hits:[{code:'12345678',product_name:'Yogurt',product_name_cs:'Jogurt',nutriments:{'energy-kcal_100g':65}}]});};
 try {const result=await searchOpenFoodFacts('Hollandia jogurt');assert.equal(request.hostname,'search.openfoodfacts.org');assert.ok(request.searchParams.get('q').includes('Hollandia jogurt'));assert.ok(request.searchParams.get('q').includes('en:czech-republic'));assert.equal(result.products[0].name,'Jogurt');assert.equal(result.products[0].protein_100g,null);}finally{globalThis.fetch=old;}
});
