import test from 'node:test';
import assert from 'node:assert/strict';
import {completedMealTypes,nextUnloggedMeals} from '../src/nutrition-next.js';

test('suggests lunch after breakfast is logged',()=>{
  const slots=nextUnloggedMeals(new Set(['BREAKFAST']),12);
  assert.equal(slots[0].type,'LUNCH');
  assert.equal(slots.some(slot=>slot.type==='BREAKFAST'),false);
});

test('prefers dinner in the evening even when snack is missing',()=>{
  const slots=nextUnloggedMeals(new Set(['BREAKFAST','LUNCH']),18);
  assert.equal(slots[0].type,'DINNER');
  assert.equal(slots.some(slot=>slot.type==='BREAKFAST'),false);
});

test('does not suggest a logged meal or a past meal',()=>{
  assert.deepEqual(nextUnloggedMeals(new Set(['BREAKFAST','LUNCH','DINNER']),21),[]);
});

test('reads meal type from logged food note',()=>{
  const completed=completedMealTypes([{note:'{"mealType":"breakfast"}'},{note:'{"mealType":"lunch"}'}]);
  assert.deepEqual([...completed],['BREAKFAST','LUNCH']);
  assert.equal(nextUnloggedMeals(completed,18)[0].type,'DINNER');
});
