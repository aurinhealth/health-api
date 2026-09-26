import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCoachCouncil} from '../src/coach-engine.js';
const html=fs.readFileSync(new URL('../src/dashboard.js',import.meta.url),'utf8'),client=fs.readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
test('overview has no duplicate sleep dial or guardrail disclosure',()=>{assert.doesNotMatch(client,/dial\("Spánek"/);assert.doesNotMatch(html,/Pravidla a použité důkazy|coachGuardrails/);assert.match(html,/letter-spacing:normal;word-spacing:normal/);});
test('completed cycling summary omits redundant preparation boilerplate',()=>{const result=buildCoachCouncil({daily:{training:{completed:[{id:'a',type:'Ride',name:'Endurance',tss:150,durationHours:2}]}}});assert.doesNotMatch(result.reviews[0].actions.join(' '),/Příprava na tuto jízdu/);});
