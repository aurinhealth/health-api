import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNutritionLabel} from '../src/food-label.js';
import {calculateAmount,productFromLabel} from '../src/food-sources.js';
test('Czech label distinguishes total fat and carbs from saturated fat and sugars',()=>{
 const p=parseNutritionLabel('na 100 g\nEnergie 340 kJ / 81 kcal\nTuky 1,6 g\nz toho nasycené mastné kyseliny 1,1 g\nSacharidy 6,4 g\nz toho cukry 4,2 g\nBílkoviny 10 g\nSůl 0,28 g');
 assert.deepEqual(p,{calories_100g:81,fat_100g:1.6,carbs_100g:6.4,protein_100g:10,salt_100g:0.28});
 assert.equal(calculateAmount(p,200).calories,162);
});
test('unreadable values remain missing instead of becoming zero',()=>{
 // Energy read only in kJ is converted; the unreadable protein stays missing.
 assert.deepEqual(parseNutritionLabel('Bílkoviny nečitelné\nEnergie 340 kJ'),{calories_100g:81});
 assert.equal(productFromLabel({calories_100g:null,protein_100g:null,carbs_100g:null,fat_100g:null}),null);
});
test('product name with a nutrient word does not replace the table value',()=>{
 const p=parseNutritionLabel('PROTEIN PUDDING 200 g\nVýživové údaje na 100 g\nEnergie kJ/kcal 368/87\nTuky 1,5 g\nz toho nasycené mastné kyseliny 1,0 g\nSacharidy 6,1 g\nz toho cukry 5,8 g\nBílkoviny 12 g\nSůl 0,2 g');
 assert.deepEqual(p,{calories_100g:87,fat_100g:1.5,carbs_100g:6.1,protein_100g:12,salt_100g:0.2});
});
test('English label, a missing unit and a serving note before the table',()=>{
 const p=parseNutritionLabel('1 serving (30 g) = 120 kcal\nNutrition per 100 g\nEnergy 1680 kJ / 400 kcal\nTotal Fat 12\nCarbohydrate 60 g\nProtein 10 g\nFibre 5 g\nSalt 0.8 g\nIngredients: sulphites');
 assert.deepEqual(p,{calories_100g:400,fat_100g:12,carbs_100g:60,protein_100g:10,fiber_100g:5,salt_100g:0.8});
});
test('energy that does not match the macronutrients is flagged',async()=>{
 const {nutritionConsistency}=await import('../src/food-label.js');
 assert.equal(nutritionConsistency({calories_100g:81,protein_100g:10,carbs_100g:6.4,fat_100g:1.6}),null);
 assert.match(nutritionConsistency({calories_100g:810,protein_100g:10,carbs_100g:6.4,fat_100g:1.6}),/nesedí/);
});
