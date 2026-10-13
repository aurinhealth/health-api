import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRecipe} from '../src/personal-recipes.js';

test('a recipe portion keeps the sugars, fibre and salt of the ingredients that have them', () => {
  const r = normalizeRecipe({name: 'Kaše', servings: 2, ingredients: [
    {name: 'Ovesné vločky', quantity: 80, calories: 300, protein_g: 10, carbs_g: 48, fat_g: 6, sugar_g: 1, fiber_g: 8, salt_g: 0},
    {name: 'Banán', quantity: 120, calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, sugar_g: 14.6, fiber_g: 3}
  ]});
  assert.equal(r.portion.sugars_100g, 7.8);
  assert.equal(r.portion.fiber_100g, 5.5);
  assert.equal(r.portion.salt_100g, 0);
  assert.equal(r.ingredients[1].sugar_g, 14.6);
});

test('a recipe without sugar values has no sugar in its portion', () => {
  const r = normalizeRecipe({name: 'Rýže', servings: 1, ingredients: [{name: 'Rýže', quantity: 100, calories: 350, protein_g: 7, carbs_g: 78, fat_g: 1}]});
  assert.equal(r.portion.sugars_100g, undefined);
});
