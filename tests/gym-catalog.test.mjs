import test from 'node:test';
import assert from 'node:assert/strict';
import {gymExerciseCatalog,findGymExercises} from '../src/gym-catalog.js';
import {EXERCISES} from '../src/strength-generator.js';
import {readFileSync} from 'node:fs';

test('picker offers only canonical plan exercises with set prescriptions',()=>{
  const catalog=gymExerciseCatalog();
  assert.equal(catalog.length,Object.keys(EXERCISES).length);
  assert.ok(catalog.every(item=>EXERCISES[item.name]&&item.sets>0&&item.reps));
  assert.equal(findGymExercises('dřep',catalog).some(item=>item.name==='Pendulum squat'),true);
  assert.equal(findGymExercises('triceps',catalog).some(item=>item.name==='Cable triceps extension'),true);
  assert.deepEqual(findGymExercises('náhodný cvik',catalog),[]);
});

test('gym no longer accepts arbitrary exercise text through browser prompt',()=>{
  const src=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
  assert.doesNotMatch(src,/prompt\("Název cviku:/);
  assert.match(src,/gymExerciseCatalog\.find\(item=>item\.name===exercise\?\.name\)/);
});
