import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');

function planner(){
  const nodes=[];
  class Node{
    constructor(classes='',dataset={},parent=null,tag='DIV'){this.classes=new Set(classes.split(' '));this.dataset=dataset;this.parent=parent;this.tag=tag;this.handlers={};nodes.push(this);this.classList={add:v=>this.classes.add(v),remove:v=>this.classes.delete(v),toggle:v=>this.classes.has(v)?this.classes.delete(v):this.classes.add(v)};}
    closest(selector){for(let n=this;n;n=n.parent){if(selector.split(',').some(s=>s.startsWith('.')?s.split('.').filter(Boolean).every(c=>n.classes.has(c)):s==='[data-hub-day]'?Boolean(n.dataset.hubDay):s==='[data-chip-remove]'?Boolean(n.dataset.chipRemove):n.tag.toLowerCase()===s))return n;}return null;}
    addEventListener(event,fn){this.handlers[event]=fn;}
    querySelectorAll(selector){return nodes.filter(n=>n!==this&&this.contains(n)&&n.closest(selector)===n);}
    contains(n){for(;n;n=n.parent)if(n===this)return true;return false;}
    setPointerCapture(id){this.capture=id;}hasPointerCapture(id){return this.capture===id;}releasePointerCapture(){this.capture=null;}
  }
  const root=new Node(),week=new Node('',{},root),day=new Node('',{hubDay:'2026-10-11'},week),ride=new Node('hub-item editable',{eventId:'planned:ride'},day),palette=new Node('planner-chip palette',{chipSport:'gym'},root,'BUTTON'),chip=new Node('planner-chip',{chipSport:'gym',chipDay:'0'},week);
  const state={weekPlan:{prefs:{days:[['gym'],[],[],[],[],[],['ride']]}},plannerPick:null},changed=[];
  const context=vm.createContext({state,document:{querySelector:()=>root,elementFromPoint:()=>ride},$:id=>id==='hubWeek'?week:{addEventListener(){}},HUB_SPORTS:{gym:'Gym',ride:'Kolo'},Date,Math,weekdayOf:()=>6,plannerChanged:()=>changed.push(JSON.parse(JSON.stringify(state.weekPlan.prefs.days))),renderPlanner(){},renderWeekHub(){},pragueToday:()=> '2026-10-05'});
  vm.runInContext(source.slice(source.indexOf('function plannerPlace('),source.indexOf('async function saveWeekPlanner(')),context);
  vm.runInContext(source.slice(source.indexOf('function installPlannerDrag('),source.indexOf('// The gym panel suggests')),context);
  vm.runInContext(source.slice(source.indexOf('function installPlannedEditing('),source.indexOf('function installPlannedEditing(')+source.slice(source.indexOf('function installPlannedEditing(')).indexOf('\n}\n')+2),context);
  vm.runInContext('installPlannerDrag();installPlannedEditing();',context);
  const event=(target,extra={})=>({target,preventDefault(){},dataTransfer:{setData(){},dropEffect:'none'},...extra});
  const click=target=>{const e=event(target);if(week.contains(target))week.handlers.click(e);root.handlers.click(e);};
  return {state,changed,root,week,ride,palette,chip,event,click};
}

test('tap on an occupied Sunday adds Gym without opening or removing the ride',()=>{
  const p=planner();p.click(p.palette);p.click(p.ride);assert.deepEqual(p.state.weekPlan.prefs.days[6],['ride','gym']);assert.equal(p.ride.classes.has('open'),false);assert.equal(p.state.plannerPick,null);assert.equal(p.changed.length,1);
});
test('native drag moves Gym onto occupied Sunday and cancelled drag preserves it',()=>{
  const p=planner();p.root.handlers.dragstart(p.event(p.chip));p.root.handlers.dragend(p.event(p.chip));assert.deepEqual(p.state.weekPlan.prefs.days[0],['gym']);assert.equal(p.changed.length,0);
  p.root.handlers.dragstart(p.event(p.chip));p.root.handlers.drop(p.event(p.ride));p.root.handlers.dragend(p.event(p.chip));assert.deepEqual(Array.from(p.state.weekPlan.prefs.days[0]),[]);assert.deepEqual(p.state.weekPlan.prefs.days[6],['ride','gym']);
});
test('touch dragging over the ride adds Gym once and suppresses the following click',()=>{
  const p=planner(),extra={pointerType:'touch',pointerId:1,clientX:10,clientY:10};p.root.handlers.pointerdown(p.event(p.palette,extra));p.root.handlers.pointermove(p.event(p.palette,{...extra,clientY:120}));p.root.handlers.pointerup(p.event(p.palette,{...extra,clientY:120}));p.click(p.palette);assert.deepEqual(p.state.weekPlan.prefs.days[6],['ride','gym']);assert.equal(p.state.plannerPick,null);assert.equal(p.changed.length,1);
});
test('touch cancellation keeps sports and ordinary taps still select the palette',()=>{
  const p=planner(),extra={pointerType:'touch',pointerId:1,clientX:10,clientY:10};p.root.handlers.pointerdown(p.event(p.palette,extra));p.root.handlers.pointerup(p.event(p.palette,extra));p.click(p.palette);assert.equal(p.state.plannerPick,'gym');
  p.root.handlers.pointerdown(p.event(p.palette,extra));p.root.handlers.pointermove(p.event(p.palette,{...extra,clientY:120}));p.root.handlers.pointercancel(p.event(p.palette,extra));assert.deepEqual(p.state.weekPlan.prefs.days[6],['ride']);assert.equal(p.changed.length,0);
});

test('tap selection moves an existing Gym to the occupied Sunday',()=>{
  const p=planner();p.click(p.chip);assert.equal(p.state.plannerFrom,0);p.click(p.ride);assert.deepEqual(Array.from(p.state.weekPlan.prefs.days[0]),[]);assert.deepEqual(p.state.weekPlan.prefs.days[6],['ride','gym']);assert.equal(p.state.plannerFrom,null);
});
test('touch dragging an existing Gym moves it without duplicating or removing the ride',()=>{
  const p=planner(),extra={pointerType:'touch',pointerId:1,clientX:10,clientY:10};p.root.handlers.pointerdown(p.event(p.chip,extra));p.root.handlers.pointermove(p.event(p.chip,{...extra,clientY:120}));p.root.handlers.pointerup(p.event(p.chip,{...extra,clientY:120}));assert.deepEqual(Array.from(p.state.weekPlan.prefs.days[0]),[]);assert.deepEqual(p.state.weekPlan.prefs.days[6],['ride','gym']);assert.equal(p.changed.length,1);
});
