import test from 'node:test';
import assert from 'node:assert/strict';
import {foodPortionDefaults,foodIntake} from '../src/food-portions.js';
test('a real can size is the package, fractions preserve half a can',()=>{
  const p={quantity:'250 ml',nutrition_basis:'ml',calories_100g:46,carbs_100g:11,protein_100g:0,fat_100g:0};const pack=foodPortionDefaults(p).package;assert.equal(pack.amount,250);assert.equal(pack.unit,'ml');const a=foodIntake(p,'1/2','pack');assert.equal(a.amount,125);assert.equal(a.calories,57.5);
});
test('3 times 100 ml is 300 ml, not 3 ml',()=>{
  const p={nutrition_basis:'ml',calories_100g:46,carbs_100g:11,protein_100g:0,fat_100g:0};const a=foodIntake(p,3*100,'ml');assert.equal(a.amount,300);assert.equal(a.carbs_g,33);
});
