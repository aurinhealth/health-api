import test from 'node:test';
import assert from 'node:assert/strict';
import { strengthSetOptions,strengthOptionNote } from '../src/gym-set-options.js';
import { planValues,saveGymPlan,readGymPlan,syncGymPlanHistory } from '../src/gym-plan-store.js';
import { getStrengthHistory,parseStrengthPlan,importStrengthHistory } from '../src/strength-history.js';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
const row=(exercise,n,type='WORK',group='A')=>[type,exercise,String(n),'40','10','','','','FALSE','Moje poznámka','','FALSE',group];

test('options use bounded groups and preserve plain notes without duplicating tags',()=>{
  const note=strengthOptionNote({note:'Moje poznámka',toFailure:true,superset:'A'});
  assert.equal(note,'Moje poznámka [Do selhání] [Supersérie A]');
  assert.equal(strengthOptionNote({note}),note);
  assert.equal(strengthOptionNote({note,toFailure:false,superset:''}),'Moje poznámka');
  assert.deepEqual(strengthSetOptions({superset:'<script>'}),{toFailure:false,superset:''});
});
test('plan reload and completed-set history retain both options and failure effort',async()=>{
  const db=scopedDb(createD1(),1),set=row('Lat pulldown',1);set[5]='45';set[6]='8';set[8]='TRUE';set[11]='TRUE';
  const values=planValues({date:'2026-10-04',rows:[set]});
  await saveGymPlan(db,'2026-10-04',values);
  assert.equal((await readGymPlan(db,'2026-10-04')).values[7][11],'TRUE');
  assert.equal(parseStrengthPlan(values).rows[0].superset,'A');
  await syncGymPlanHistory(db,values);
  const history=await getStrengthHistory(db);
  assert.equal(history[0].toFailure,true);assert.equal(history[0].superset,'A');assert.equal(history[0].rpe,10);
  assert.match(history[0].note,/Moje poznámka/);assert.equal(history[0].actual_reps,8);
  await importStrengthHistory(db,{date:'2026-10-04',sets:[{exercise:'Lat pulldown',actualKg:45,actualReps:8,note:history[0].note,toFailure:false,superset:''}]});
  assert.equal((await getStrengthHistory(db))[0].toFailure,false);
  assert.equal((await getStrengthHistory(db))[0].superset,'');
});
test('legacy replacement and execution columns are not read as new options',()=>{
  const generated=planValues({date:'2026-10-04',rows:[['WORK','Lat pulldown','1','40','10','','','','FALSE','','','','BILATERAL']]});
  assert.equal(generated[7][11],'FALSE');assert.equal(generated[7][12],'');
  const values=planValues({date:'2026-10-04',rows:[row('Lat pulldown',1)]});values[6][11]='Náhrada cviku';values[6][12]='Provedení';values[7][11]='TRUE';values[7][12]='A';
  const parsed=parseStrengthPlan(values);
  assert.equal(parsed.rows[0].toFailure,false);assert.equal(parsed.rows[0].superset,'');
  assert.equal(parsed.rows[0].replacement,'TRUE');
});
