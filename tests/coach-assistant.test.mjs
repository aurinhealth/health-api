import test from 'node:test';
import assert from 'node:assert/strict';
import {coachInstructions,coachContext,askCoach} from '../src/coach-assistant.js';

test('coach uses individual activity targets without claiming a pro-team job',()=>{
  assert.match(coachInstructions,/Počet aktivit vezmi z weeklyActivities/);
  assert.match(coachInstructions,/Nejsi zaměstnanec žádného profesionálního týmu/);
  const context=coachContext({date:'2026-09-28',daily:{training:{planned:[{name:'Z2'}]}},week:{days:[{date:'2026-09-28',daily:{training:{completed:[]}}}]},fitness:{wellness:[{id:'2026-09-28',ctl:50}]},health:{wellness:[]},gym:{history:[]}});
  assert.equal(context.rhythm,null);
  assert.equal(context.week[0].date,'2026-09-28');
});
test('assistant without API key returns explicit unavailable state',async()=>{
  assert.equal((await askCoach({},'Týdenní plán',{})).status,'unavailable');
});
