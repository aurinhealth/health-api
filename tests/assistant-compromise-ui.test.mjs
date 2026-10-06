import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
const chatHtml=app=>{const c=app.nodes.get('assistantConversation');return c.innerHTML+c.children.map(x=>x.innerHTML).join('');};
function client({inbox=Promise.resolve(),reply=async()=>Response.json({answer:'Můžeme zkrátit trénink.',actions:[]})}={}){
  const nodes=new Map(),requests=[],toasts=[];
  class Element {
    constructor(id=''){this.id=id;this.html='';this.children=[];this.style={};this.value='';this.scrollTop=0;this.scrollHeight=44;this.classList={add(){},remove(){},toggle(){}};}
    set innerHTML(html){this.html=html;this.children=html?[new Element()]:[];for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],new Element(match[1]));}
    get innerHTML(){return this.html;}
    get lastElementChild(){return this.children.at(-1);}
    insertAdjacentHTML(position,html){if(position==='beforeend'){this.innerHTML=this.html+html;}else for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],new Element(match[1]));}
    querySelector(selector){if(selector==='[type=submit]')return nodes.get('send');if(selector==='.assistant-welcome'&&this.html.includes('assistant-welcome'))return {remove:()=>{this.innerHTML='';}};if(selector==='.coach-message'||selector==='strong')return this.message||=new Element();return null;}
    querySelectorAll(selector){const attribute=selector.slice(1,-1),key=attribute.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return [...this.html.matchAll(new RegExp(attribute+'="(\\d+)"','g'))].map(match=>{const button=new Element();button.dataset={[key]:match[1]};this.children.push(button);return button;});}
    setAttribute(){}
    focus(){this.focusCount=(this.focusCount||0)+1;}
    getBoundingClientRect(){return {bottom:0};}
    show(){this.open=true;}
    showModal(){this.open=true;this.modal=true;}
    remove(){nodes.delete(this.id);}
    append(child){this.children.push(child);}
  }
  for(const id of ['head','assistantDialog','assistantConversation','assistantMessage','assistantForm','assistantStatus','assistantScroll','assistantContext','assistantQuickActions','floatingAssistant','weekProposalCards','send'])nodes.set(id,new Element(id));
  const state={athleteState:{status:'active',conversation:[]},inbox:[]};
  const context=vm.createContext({state,gymMode:null,TextDecoder,selectedHistoryDate:'2026-10-05',pragueToday:()=> '2026-10-05',mondayOf:()=> '2026-10-05',gymDay:()=>state.gymDate||'2026-10-05',gymSets:()=>[{r:['WORK','Leg press']}],$:id=>nodes.get(id),document:{querySelector:selector=>selector==='.view.active'?{id:state.view||'today'}:nodes.get('head'),createElement:()=>new Element()},window:{visualViewport:null},esc:v=>String(v??''),dateLabel:v=>v,longDate:v=>v,hm:v=>v+' min',HUB_SPORTS:{ride:'Kolo',gym:'Gym'},statusCoachingRevision:0,toast:v=>toasts.push(v),loadInbox:()=>inbox,jsonFetch:async()=>({}),showLoginGate(){},fetch:async(url,options)=>{requests.push({url,...JSON.parse(options.body)});return reply();}});
  vm.runInContext(source.slice(source.indexOf('const STATUS_LABELS='),source.indexOf('function availabilityTime(')),context);
  vm.runInContext(source.slice(source.indexOf('function renderAssistantWeekProposal('),source.indexOf('function openGymPreview(')),context);
  const run=code=>vm.runInContext(code,context);
  const button=kind=>{
    if(kind==='week'){context.proposal={start:'2026-10-05',proposal:{items:[{date:'2026-10-06',sport:'ride',minutes:60}]}};run('renderAssistantWeekProposal(proposal)');return nodes.get('discussWeekProposal');}
    if(kind==='recovery'){state.coachAdvice={headline:'Regenerace',reasons:['Málo spánku.'],message:'Zvaž pauzu.'};run('renderAthleteStatus()');return nodes.get('adviceDiscuss');}
    // A proposal is answered in the chat: "Jinou variantu" is the compromise.
    context.actions=[{type:'workout',sport:'gym',date:'2026-10-06',minutes:45,reason:'Slabší regenerace.'}];run("appendCoachTurn('assistant','Navrhuji gym.')");run('renderCoachActionCards(actions)');return nodes.get('assistantConversation').lastElementChild.children.find(x=>x.dataset?.coachReply==='1');
  };
  return {nodes,requests,toasts,state,run,button,context};
}

for(const kind of ['week','recovery','action'])test(kind+' compromise click sends a complete user message and shows the answer',async()=>{
  const app=client();await app.button(kind).onclick();
  // The chat's own reply chips are used inside the already open chat.
  if(kind!=='action')assert.equal(app.nodes.get('assistantDialog').open,true);
  assert.equal(app.requests.length,1);assert.equal(app.requests[0].url,'/app/api/assistant');
  if(kind==='action')assert.equal(app.requests[0].message,'Jinou variantu');
  else{assert.match(app.requests[0].message,/Chci probrat kompromis/);assert.match(app.requests[0].message,kind==='week'?/2026-10-06 · Kolo · 60 min/:/Málo spánku/);}
  const said=app.state.athleteState.conversation.filter(t=>t.role==='user');
  assert.equal(said.at(-1).content,app.requests[0].message);
  assert.match(app.nodes.get('assistantConversation').innerHTML,/<strong>Ty<\/strong>/);
  assert.match(app.nodes.get('assistantConversation').innerHTML,/Můžeme zkrátit trénink/);
  assert.equal(app.nodes.get('assistantMessage').value,'');
});

test('opening the assistant alone does not send anything or replace a typed draft',async()=>{
  const app=client();app.nodes.get('assistantMessage').value='Vlastní otázka';
  await app.run('openFloatingAssistant()');
  assert.equal(app.requests.length,0);assert.equal(app.nodes.get('assistantMessage').value,'Vlastní otázka');
  assert.equal(app.nodes.get('assistantMessage').focusCount||0,0);
});

test('repeated compromise taps while opening and replying send only one request',async()=>{
  let open,answer;
  const inbox=new Promise(resolve=>{open=resolve;}),response=new Promise(resolve=>{answer=resolve;});
  const app=client({inbox,reply:()=>response}),button=app.button('week');
  const first=button.onclick();await button.onclick();assert.equal(app.requests.length,1);
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

test('a gym message captures the selected day and exercise from the application',async()=>{
  const app=client();app.state.view='workouts';app.state.workoutSport='gym';app.state.gymDate='2026-10-11';app.state.hubWeek='2026-10-05';app.run('gymMode={pos:0,finished:false}');
  await app.run("sendAssistantMessage('Uprav to')");
  assert.deepEqual(app.requests[0].appContext,{view:'workouts',date:'2026-10-11',weekStart:'2026-10-05',sport:'gym',exercise:'Leg press'});
});

test('retry keeps the original context when the athlete changes screens',async()=>{
  let calls=0;const app=client({reply:async()=>{if(++calls===1)throw Error('Spojení přerušeno');return Response.json({answer:'Hotovo',actions:[]});}});
  app.state.view='workouts';app.state.openDetail={date:'2026-10-11',sport:'gym'};
  await app.run("sendAssistantMessage('Uprav to')");app.state.view='today';
  const retry=app.nodes.get('assistantConversation').children.find(x=>x.className==='assistant-retry');retry.children.find(x=>x.textContent==='Zkusit znovu').onclick();await new Promise(setImmediate);
  assert.deepEqual(app.requests[1].appContext,app.requests[0].appContext);assert.equal(app.requests[1].appContext.date,'2026-10-11');
});

test('quick gym help opens above workout mode and sends the current exercise',async()=>{
  const app=client();app.state.gymDate='2026-10-09';app.state.workoutSport='gym';app.run('gymMode={pos:0}');await app.run('openFloatingAssistant()');
  assert.equal(app.nodes.get('assistantDialog').modal,true);assert.match(app.nodes.get('assistantContext').textContent,/2026-10-09.*Leg press/);
  await app.nodes.get('assistantQuickActions').children.find(x=>x.dataset?.assistantQuick==='0').onclick();assert.equal(app.requests[0].appContext.exercise,'Leg press');assert.match(app.requests[0].message,/2026-10-09.*Leg press/);
});

test('slow inbox refresh cannot replace action cards from the latest reply',async()=>{
  let finish;const inbox=new Promise(resolve=>{finish=resolve;}),app=client({inbox,reply:async()=>Response.json({answer:'Navrhuji gym.',actions:[{type:'week_sport',date:'2026-10-11',sport:'gym',reason:'Vedle kola.'}]})});
  await app.run('openFloatingAssistant()');await app.run("sendAssistantMessage('Přidej gym')");finish();await new Promise(setImmediate);
  assert.equal(app.requests.length,1);assert.match(chatHtml(app),/Přidat Gym do týdne/);
});

test('browser consumes streamed progress and answer frames before final proposal cards',async()=>{
  const frames=[{type:'start'},{type:'progress',message:'Načítám plán'},{type:'answer',answer:'Navrhuji gym.'},{type:'done',result:{answer:'Navrhuji gym.',actions:[{type:'week_sport',date:'2026-10-11',sport:'gym',reason:'Vedle kola.'}]}}];
  const app=client({reply:async()=>new Response(frames.map(f=>JSON.stringify(f)).join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson'}})});await app.run("sendAssistantMessage('Přidej gym')");
  assert.equal(app.state.athleteState.conversation.at(-1).content,'Navrhuji gym.');assert.match(chatHtml(app),/Přidat Gym do týdne/);
});

test('a generator tab left selected is not the topic: the assistant talks about the day',async()=>{
  const app=client();app.state.workoutSport='gym';app.state.gymDate='2026-10-11';app.state.view='workouts';
  await app.run("sendAssistantMessage('Jaké mám FTP?')");
  assert.equal(app.requests[0].appContext.sport,null);
});

test('"ok, potvrzuji" confirms the open proposals without asking the AI; "nechci" rejects them',async()=>{
  const app=client({reply:async()=>Response.json({answer:'Navrhuji gym.',actions:[{type:'week_sport',date:'2026-10-11',sport:'gym',reason:'Vedle kola.',draftId:7}]})});
  await app.run("sendAssistantMessage('Přidej gym')");
  assert.match(chatHtml(app),/Přidat Gym do týdne/);assert.match(chatHtml(app),/Potvrzuji/);
  app.context.decisions=[];app.run("decideCoachAction=async(a,d)=>{decisions.push(d);return {message:'Gym je v týdnu.'};}");
  await app.run("sendAssistantMessage('Ok, potvrzuji')");
  assert.equal(app.requests.length,1);assert.deepEqual([...app.context.decisions],['confirm']);
  assert.match(chatHtml(app),/✓ Gym je v týdnu/);
  // Without open proposals the same words go to the AI.
  await app.run("sendAssistantMessage('ok')");assert.equal(app.requests.length,2);
  assert.equal(app.run("coachReplyDecision('nechci')"),'reject');assert.equal(app.run("coachReplyDecision('chci delší trénink')"),null);
});
