import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCoachCouncil} from '../src/coach-engine.js';
test('completed cycling summary omits redundant preparation boilerplate',()=>{const result=buildCoachCouncil({daily:{training:{completed:[{id:'a',type:'Ride',name:'Endurance',tss:150,durationHours:2}]}}});assert.doesNotMatch(result.reviews[0].actions.join(' '),/Příprava na tuto jízdu/);});
