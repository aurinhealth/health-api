import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
function client({inbox=Promise.resolve(),reply=async()=>Response.json({answer:'Můžeme zkrátit trénink.',actions:[]})}={}){
  const nodes=new Map(),requests=[],toasts=[];
  class Element {
    constructor(id=''){this.id=id;this.html='';this.children=[];this.style={};this.value='';this.scrollTop=0;this.scrollHeight=44;this.classList={add(){},remove(){},toggle(){}};}
    set innerHTML(html){this.html=html;this.children=html?[new Element()]:[];for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],new Element(match[1]));}
    get innerHTML(){return this.html;}
    get lastElementChild(){return this.children.at(-1);}
    insertAdjacentHTML(position,html){if(position==='beforeend'){this.innerHTML=this.html+html;}else for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],new Element(match[1]));}
    querySelector(selector){if(selector==='[type=submit]')return nodes.get('send');if(selector==='.assistant-welcome'&&this.html.includes('assistant-welcome'))return {remove:()=>{this.innerHTML='';}};return null;}
    querySelectorAll(selector){return [...this.html.matchAll(new RegExp(selector==='[data-coach-feedback]'?'data-coach-feedback="(\\d+)"':'data-coach-action="(\\d+)"','g'))].map(match=>{const button=new Element();button.dataset=selector==='[data-coach-feedback]'?{coachFeedback:match[1]}:{coachAction:match[1]};this.children.push(button);return button;});}
    setAttribute(){}
    focus(){}
    getBoundingClientRect(){return {bottom:0};}
    show(){this.open=true;}
    remove(){nodes.delete(this.id);}
    append(child){this.children.push(child);}
  }
  for(const id of ['head','assistantDialog','assistantConversation','assistantMessage','assistantForm','assistantStatus','assistantScroll','floatingAssistant','weekProposalCards','send'])nodes.set(id,new Element(id));
  const state={athleteState:{status:'active',conversation:[]},inbox:[]};
  const context=vm.createContext({state,$:id=>nodes.get(id),document:{querySelector:()=>nodes.get('head'),createElement:()=>new Element()},window:{visualViewport:null},esc:v=>String(v??''),dateLabel:v=>v,longDate:v=>v,hm:v=>v+' min',HUB_SPORTS:{ride:'Kolo',gym:'Gym'},statusCoachingRevision:0,toast:v=>toasts.push(v),loadInbox:()=>inbox,jsonFetch:async()=>({}),showLoginGate(){},fetch:async(url,options)=>{requests.push({url,...JSON.parse(options.body)});return reply();}});
  vm.runInContext(source.slice(source.indexOf('const STATUS_LABELS='),source.indexOf('function availabilityTime(')),context);
  vm.runInContext(source.slice(source.indexOf('function renderAssistantWeekProposal('),source.indexOf('function openGymPreview(')),context);
  const run=code=>vm.runInContext(code,context);
  const button=kind=>{
    if(kind==='week'){context.proposal={start:'2026-10-05',proposal:{items:[{date:'2026-10-06',sport:'ride',minutes:60}]}};run('renderAssistantWeekProposal(proposal)');return nodes.get('discussWeekProposal');}
    if(kind==='recovery'){state.coachAdvice={headline:'Regenerace',reasons:['Málo spánku.'],message:'Zvaž pauzu.'};run('renderAthleteStatus()');return nodes.get('adviceDiscuss');}
    context.actions=[{type:'workout',sport:'gym',date:'2026-10-06',minutes:45,reason:'Slabší regenerace.'}];run('renderCoachActionCards(actions)');return nodes.get('coachActionCards').children.find(x=>x.dataset?.coachFeedback==='0');
  };
  return {nodes,requests,toasts,state,run,button};
}

for(const kind of ['week','recovery','action'])test(kind+' compromise click sends a complete user message and shows the answer',async()=>{
  const app=client();await app.button(kind).onclick();
  assert.equal(app.nodes.get('assistantDialog').open,true);
  assert.equal(app.requests.length,1);assert.equal(app.requests[0].url,'/app/api/assistant');
  assert.match(app.requests[0].message,/Chci probrat kompromis/);
  assert.match(app.requests[0].message,kind==='week'?/2026-10-06 · Kolo · 60 min/:kind==='recovery'?/Málo spánku/:/Gym.*Slabší regenerace/);
  assert.equal(app.state.athleteState.conversation[0].role,'user');
  assert.equal(app.state.athleteState.conversation[0].content,app.requests[0].message);
  assert.match(app.nodes.get('assistantConversation').innerHTML,/<strong>Ty<\/strong>/);
  assert.match(app.nodes.get('assistantConversation').innerHTML,/Můžeme zkrátit trénink/);
  assert.equal(app.nodes.get('assistantMessage').value,'');
});

test('opening the assistant alone does not send anything or replace a typed draft',async()=>{
  const app=client();app.nodes.get('assistantMessage').value='Vlastní otázka';
  await app.run('openFloatingAssistant()');
  assert.equal(app.requests.length,0);assert.equal(app.nodes.get('assistantMessage').value,'Vlastní otázka');
});

test('repeated compromise taps while opening and replying send only one request',async()=>{
  let open,answer;
  const inbox=new Promise(resolve=>{open=resolve;}),response=new Promise(resolve=>{answer=resolve;});
  const app=client({inbox,reply:()=>response}),button=app.button('week');
  const first=button.onclick();await button.onclick();assert.equal(app.requests.length,0);
  open();await new Promise(setImmediate);assert.equal(app.requests.length,1);
  await button.onclick();assert.equal(app.requests.length,1);assert.equal(app.toasts.length,2);
  answer(Response.json({answer:'Kompromis',actions:[]}));await first;
  assert.equal(app.state.athleteState.conversation.filter(t=>t.role==='user').length,1);
});

test('a failed compromise request uses the existing retry without duplicating the user turn',async()=>{
  let calls=0;
  const app=client({reply:async()=>{if(++calls===1)throw Error('Spojení přerušeno');return Response.json({answer:'Kompromis',actions:[]});}});
  await app.button('recovery').onclick();
  const retry=app.nodes.get('assistantConversation').children.find(x=>x.className==='assistant-retry');
  assert.ok(retry);retry.children.find(x=>x.textContent==='Zkusit znovu').onclick();await new Promise(setImmediate);
  assert.equal(app.requests.length,2);assert.equal(app.requests[0].message,app.requests[1].message);
  assert.equal(app.state.athleteState.conversation.filter(t=>t.role==='user').length,1);
  assert.equal(app.state.athleteState.conversation.at(-1).content,'Kompromis');
});
