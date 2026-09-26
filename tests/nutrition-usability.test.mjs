import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFood} from '../src/food-sources.js';
import {foodIntake} from '../src/food-portions.js';
test('nectarine is a generic Czech food and needs no packaged-product lookup',async()=>{const result=await resolveFood({name:'nektarinku'});assert.equal(result.product.calories_100g,48);assert.equal(result.product.source,'nutridatabaze');assert.equal(foodIntake(result.product,125,'g').calories,60);});
test('125ml and half of a 250ml Red Bull give identical intake',()=>{const p={quantity:'250 ml',nutrition_basis:'ml',calories_100g:46,protein_100g:0,carbs_100g:11,fat_100g:0};assert.equal(foodIntake(p,125,'ml').calories,57.5);assert.deepEqual(foodIntake(p,'1/2','pack'),foodIntake(p,125,'ml'));assert.equal(foodIntake({...p,quantity:'473 ml'},'1/2','pack').amount,236.5);});
