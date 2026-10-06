import test from 'node:test';
import assert from 'node:assert/strict';
import { weekReviewContext,fallbackWeekReview,WEEK_REVIEW_REQUEST } from '../src/weekly-plan-review.js';
import { askCoach } from '../src/coach-assistant.js';
import { validateCoachActions } from '../src/coach-actions.js';

const today='2026-10-04',prefs={availability:Array(7).fill({minutes:120}),weeklyActivities:3};
const event=(id,name='Endurance')=>({id:'planned:'+id,name,type:'Ride',durationHours:1,tss:50});
function input(days,extra={}){return weekReviewContext({inputs:{date:today,week:{days},daily:{training:{}},fitness:{wellness:[{id:today,ctl:60,atl:55,tsb:5}]},health:{sleep:[{durationMin:470,endTime:today+'T06:30:00',type:'sleep'}]},gym:{history:[]}},prefs,state:{status:'active'},start:'2026-09-28',today,proposal:{items:[]},...extra});}
const day=(date,planned=[],completed=[],matched=[])=>({date,daily:{training:{planned,completed,matched}}});

test('Sunday review includes next week and excludes completed, past and nutrition entries',()=>{
  const context=input([day('2026-10-03',[event('past')]),day(today,[event('done'),event('next'),{id:'nutrition',name:'Nutrition'}],[{name:'Endurance',id:'actual'}],[{planned:{id:'planned:done'}}]),day('2026-10-06',[event('future','VO2')])]);
  assert.equal(context.date,today);
  assert.equal(context.reviewScope.end,'2026-10-11');
  assert.ok(context.remainingPlanned.some(a=>a.id==='planned:future'));
  assert.ok(context.remainingPlanned.every(a=>a.date>=today&&!/past|done|nutrition/.test(a.id)));
});
test('good measured readiness still respects high RPE and reported fatigue from yesterday',()=>{
  const context=input([day(today,[{...event('gym','Upper body'),type:'WeightTraining'}])],{athleteFeedback:[{date:'2026-10-03',rpe:7,notes:'Těžké nohy, bolest těla a únava'}]});
  const review=fallbackWeekReview(context),actions=validateCoachActions(review.actions,context,today);
  assert.equal(context.cyclingCoachV2.readiness.status,'green');
  assert.equal(actions[0].type,'rest');
  assert.equal(actions[0].eventId,'planned:gym');
  assert.match(actions[0].reason,/RPE 7/);
});
test('consecutive quality sessions produce an actionable move instead of more workouts',()=>{
  const context=input([day('2026-10-06',[event('1','Threshold')]),day('2026-10-07',[event('2','VO2')])]);
  const actions=validateCoachActions(fallbackWeekReview(context).actions,context,today);
  assert.equal(actions[0].type,'move');assert.equal(actions[0].date,'2026-10-08');
  assert.equal(actions[0].eventSnapshot.date,'2026-10-07');
});
test('fallback cannot move a workout onto a day with zero availability',()=>{
  const availability=prefs.availability.map((a,i)=>i===3?{minutes:0}:a);
  const context=input([day('2026-10-06',[event('1','Threshold')]),day('2026-10-07',[event('2','VO2')])],{prefs:{...prefs,availability}});
  assert.deepEqual(fallbackWeekReview(context).actions,[]);
});
test('inactive status yields confirmed-by-user removals and never invents illness',()=>{
  const context=input([day('2026-10-05',[event('1')])],{state:{status:'on_break',note:'Dovolená'}});
  const review=fallbackWeekReview(context);
  assert.equal(review.actions[0].type,'rest');
  assert.match(review.answer,/On break/);assert.match(review.answer,/Dovolená/);
  assert.doesNotMatch(review.answer,/Sick|nemoc/);
});
test('an appropriate plan is explicitly left alone',()=>{
  const review=fallbackWeekReview(input([day('2026-10-06',[event('1')]),day('2026-10-09',[event('2')])]));
  assert.deepEqual(review.actions,[]);assert.match(review.answer,/nevidím jasný důvod/);
});

test('weekly action validation excludes already completed events, duplicates and unavailable days',()=>{
  const context=input([day(today,[event('done')],[{name:'Endurance'}]),day('2026-10-06',[event('future','VO2')])]);
  context.availabilityByDate={'2026-10-07':{minutes:0}};
  const actions=validateCoachActions([{type:'rest',eventId:'planned:done',reason:'Únava'},{type:'workout',date:'2026-10-06',sport:'ride',minutes:60,reason:'Další jízda'},{type:'move',eventId:'planned:future',date:'2026-10-07',reason:'Přesun'}],context,today);
  assert.deepEqual(actions,[]);
});
test('manual weekly review asks the model for concise, structured actions with athlete feedback',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(_,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json({output_text:JSON.stringify({answer:'Vynech dnešní gym.',actions:[{type:'rest',eventId:'planned:1',reason:'Po včerejším tréninku hlásíš únavu.'}]})});};
  try{
    const context=input([day(today,[event('1','Gym')])],{athleteFeedback:[{date:'2026-10-03',rpe:7,notes:'Únava'}]});
    const r=await askCoach({OPENAI_API_KEY:'test'},WEEK_REVIEW_REQUEST,context,{task:'planning',actions:true,concise:true});
    assert.equal(calls[0].text.format.name,'coach_reply');
    assert.match(calls[0].instructions,/nejvýše 90 slov/);
    assert.match(JSON.stringify(calls[0].input),/remainingPlanned/);assert.match(JSON.stringify(calls[0].input),/athleteFeedback/);
    assert.equal(validateCoachActions(r.actions,context,today)[0].type,'rest');
  }finally{globalThis.fetch=original;}
});
