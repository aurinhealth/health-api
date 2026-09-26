import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseNutritionPortion} from '../src/food-label.js';
const src=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
test('cardio strain does not use TSS and requires heart-rate calibration',()=>{const code=src.slice(src.indexOf('function cardioStrain('),src.indexOf('function renderRequestedExperience(')),ctx=vm.createContext({Math,Number,String});vm.runInContext(code,ctx);assert.equal(ctx.cardioStrain([{tss:175,durationHours:2}],45,190),null);const a=ctx.cardioStrain([{durationHours:2,payload:{average_heartrate:150}}],45,190);assert.ok(a.score>0&&a.score<21);assert.equal(ctx.fitnessAge(49,'male'),'35');assert.equal(ctx.fitnessAge(40,'female'),'35');assert.equal(ctx.fitnessAge(40,''),null);});
test('meal screenshots use summary totals and not ingredient calories',()=>{const a=parseNutritionPortion('Snídaně\n370 kcal 36,5 g\nKalorie Sacharidy\n33,0 g 9,9 g\nBílkoviny Tuky\nMed\n5 g\n15 kcal');assert.deepEqual(a.values,{calories_100g:370,carbs_100g:36.5,protein_100g:33,fat_100g:9.9});assert.equal(a.name,'Snídaně');const b=parseNutritionPortion('Oběd\nQuesadilla\n714 kcal 82,9 g 50,6 g 18,1 g\nKalorie Sacharidy Bílkoviny Tuky\nSuroviny\nKuřecí prsa 120 g');assert.equal(b.values.calories_100g,714);assert.equal(b.values.protein_100g,50.6);});
