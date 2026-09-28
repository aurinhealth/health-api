import test from 'node:test';
import assert from 'node:assert/strict';
import {coachInstructions,coachContext,askCoach} from '../src/coach-assistant.js';
import {dailyStrain} from '../src/daily-strain.js';

test('coach keeps the 4:3 rhythm without claiming a pro-team job',()=>{
  assert.match(coachInstructions,/4 cyklistické a 3 posilovací/);
  assert.match(coachInstructions,/Nejsi zaměstnanec týmu UAE/);
  const context=coachContext({date:'2026-09-28',daily:{training:{planned:[{name:'Z2'}]}},week:{days:[{date:'2026-09-28',daily:{training:{completed:[]}}}]},fitness:{wellness:[{id:'2026-09-28',ctl:50}]},health:{wellness:[]},gym:{history:[]}});
  assert.deepEqual(context.rhythm,{cycling:4,gym:3});
  assert.equal(context.week[0].date,'2026-09-28');
});
test('assistant without API key returns explicit unavailable state',async()=>{
  assert.equal((await askCoach({},'Týdenní plán',{})).status,'unavailable');
});
test('daywide load requires measured energy and personal baseline',()=>{
  const history=Array.from({length:7},(_,i)=>({id:`2026-09-${String(i+20).padStart(2,'0')}`,activeCalories:500}));
  assert.equal(dailyStrain({id:'2026-09-28',activeCalories:500},history).score,11.9);
  assert.equal(dailyStrain({id:'2026-09-28',activeCalories:500},[]).score,null);
  assert.equal(dailyStrain({id:'2026-09-28'},history),null);
});
