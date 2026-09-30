import test from 'node:test';
import assert from 'node:assert/strict';
import {updateFoodEntry,copyFoodEntry,deleteFoodEntry} from '../src/food-entry-management.js';
import {createD1} from './helpers/d1.mjs';
import {scopedDb} from '../src/tenancy.js';

const NOTE=JSON.stringify({mealType:'lunch',ingredients:[{name:'Rýže',amount:120,unit:'g'}]});
function database(){
  const raw=createD1();
  raw.sqlite.exec(`CREATE TABLE food_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, consumed_date TEXT NOT NULL, consumed_at TEXT, cookbook_page INTEGER, recipe_title TEXT, servings REAL, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, fiber_g REAL, source TEXT, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  raw.sqlite.prepare("INSERT INTO food_logs(id,user_id,consumed_date,consumed_at,cookbook_page,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,fiber_g,source,note) VALUES (7,1,'2026-09-28','2026-09-28T12:30:00.000Z',70,'Oběd',1,550,35,60,18,5,'cookbook',?)").run(NOTE);
  return {raw,owner:scopedDb(raw,1),other:scopedDb(raw,2)};
}
const row=(raw,id)=>raw.sqlite.prepare('SELECT * FROM food_logs WHERE id=?').get(id);

test('editing food preserves recipe and ingredient provenance while moving its date and meal',async()=>{
  const {raw,owner}=database();
  await updateFoodEntry(owner,7,{date:'2026-09-29',mealType:'dinner',name:'Večeře',kcal:575,protein_g:37,carbs_g:62,fat_g:18});
  const r=row(raw,7);
  assert.equal(r.consumed_date,'2026-09-29');
  assert.equal(r.consumed_at,'2026-09-29T12:30:00.000Z');
  assert.equal(r.recipe_title,'Večeře');
  assert.equal(r.kcal,575);
  assert.equal(r.cookbook_page,70);
  assert.equal(JSON.parse(r.note).mealType,'dinner');
  assert.equal(JSON.parse(r.note).ingredients[0].name,'Rýže');
});

test('copy creates a separate dated meal and delete removes only the selected entry',async()=>{
  const {raw,owner}=database();
  const copy=await copyFoodEntry(owner,7,'2026-09-30');
  assert.equal(row(raw,copy.id).consumed_date,'2026-09-30');
  assert.equal(row(raw,copy.id).kcal,550);
  assert.equal(row(raw,copy.id).user_id,1);
  await deleteFoodEntry(owner,7);
  assert.equal(row(raw,7),undefined);
  assert.ok(row(raw,copy.id));
});

test('another user can neither see, change, copy nor delete the entry',async()=>{
  const {raw,other}=database();
  await assert.rejects(updateFoodEntry(other,7,{kcal:1}),/už v deníku není/);
  await assert.rejects(copyFoodEntry(other,7,'2026-09-30'),/už v deníku není/);
  await assert.rejects(deleteFoodEntry(other,7),/už v deníku není/);
  assert.equal(row(raw,7).kcal,550);
  assert.equal(raw.sqlite.prepare('SELECT COUNT(*) n FROM food_logs').get().n,1);
});

test('food changes reject invalid identifiers, dates, meals and nutrition',async()=>{
  const {raw,owner}=database();
  await assert.rejects(updateFoodEntry(owner,7,{mealType:'night'}),/Neplatný typ/);
  await assert.rejects(updateFoodEntry(owner,7,{kcal:-1}),/Zkontroluj energii/);
  await assert.rejects(copyFoodEntry(owner,7,'2026-02-30'),/platné datum/);
  await assert.rejects(deleteFoodEntry(owner,'7 OR 1=1'),/Neplatné jídlo/);
  assert.equal(raw.sqlite.prepare('SELECT COUNT(*) n FROM food_logs').get().n,1);
});
