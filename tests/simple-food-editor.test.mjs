import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {foodPortionDefaults,foodIntake} from '../src/food-portions.js';
const source=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
function options(product){const ctx=vm.createContext({foodPortionDefaults});vm.runInContext(source.slice(source.indexOf('function simpleFoodPortions('),source.indexOf('function installSimpleFoodEditor(')),ctx);return ctx.simpleFoodPortions(product);}
test('simple editor offers a real can size, fractions preserve half a can',()=>{
  const p={quantity:'250 ml',nutrition_basis:'ml',calories_100g:46,carbs_100g:11,protein_100g:0,fat_100g:0};const choices=options(p);assert.equal(choices[0].label,'Balení (250 ml)');const a=foodIntake(p,'1/2',choices[0].unit);assert.equal(a.amount,125);assert.equal(a.calories,57.5);
});
test('simple selector supports 3 times 100 ml without treating it as 3 ml',()=>{
  const p={nutrition_basis:'ml',calories_100g:46,carbs_100g:11,protein_100g:0,fat_100g:0},choice=options(p).find(o=>o.key==='ml100');const a=foodIntake(p,3*choice.size,choice.unit);assert.equal(a.amount,300);assert.equal(a.carbs_g,33);
});
test('unknown food piece weight is not invented and manual portions remain portions',()=>{
  assert.ok(options({nutrition_basis:'g'}).every(o=>o.unit==='g'));assert.equal(options({nutrition_basis:'portion'})[0].unit,'portion');
});
test('technical editor is collapsible and never advertises unverified food certification',()=>{
  const simple=source.slice(source.indexOf('function installSimpleFoodEditor('));assert.match(simple,/document.createElement\('details'\)/);assert.match(simple,/Přidat do seznamu/);assert.doesNotMatch(simple,/Verified|Ověřené hodnoty/);
});
