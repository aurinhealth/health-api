import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNutritionPortion} from '../src/food-label.js';
test('partial OCR keeps known macros, food name and missing fat instead of inventing it',()=>{const r=parseNutritionPortion('14:36 A\nve F i ya py\n<) (oped)\nQuesadilla\n714 kcal 82,9 g 50,6 g 1819\nKalorie Sacharidy Bilkoviny Tuky\nSuroviny\nKuřecí 120 g');assert.equal(r.name,'Quesadilla');assert.equal(r.values.protein_100g,50.6);assert.equal(r.values.carbs_100g,82.9);assert.equal(r.values.fat_100g,undefined);});
