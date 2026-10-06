import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
function run(name,fixture){const nodes={pmcRange:{value:'14'},pmcChart:{},plannedRideReview:{}};const context={state:fixture,$:id=>nodes[id],num:(v,d=0)=>Number.isFinite(Number(v))?Number(v):d,measured:v=>v!=null&&v!==''&&Number.isFinite(Number(v)),pragueToday:()=> '2026-09-26',dateShift:(d,n)=>new Date(new Date(d+'T12:00:00Z').getTime()+n*86400000).toISOString().slice(0,10),dateLabel:d=>d,longDate:d=>d,esc:v=>String(v),fmt:(v,n=0)=>Math.round(Number(v)*10**n)/10**n,hm:v=>v+' min',chartWidth:(svg,max)=>max};vm.createContext(context);const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,end)+'\n'+name+'()',context);return nodes;}
test('PMC renders daily dates, Y labels and never plots missing values as zero',()=>{const nodes=run('renderPmcChart',{fitness:{wellness:[{id:'2026-09-25',ctl:50,atl:70,tsb:-20},{id:'2026-09-26',ctl:51,atl:null,tsb:null}]}});assert.match(nodes.pmcChart.innerHTML,/2026-09-13/);assert.match(nodes.pmcChart.innerHTML,/Zátěž/);assert.equal((nodes.pmcChart.innerHTML.match(/<circle/g)||[]).length,4);});
