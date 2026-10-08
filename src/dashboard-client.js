// The device's time zone; the server learns it from X-Time-Zone and uses the same days.
const USER_TZ=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"Europe/Prague"}catch{return "Europe/Prague"}})();
const $=id=>document.getElementById(id);
// The cookbook (recipes from the owner's printed book, cookbook.js) is hidden for
// now: no recipe search, no meal suggestions from it, no upload. true shows it again.
const COOKBOOK_SHOWN=false;
let coachRefreshRunning=false;
// Plan edits not yet in Intervals.icu (see "Plan changes" below); declared first
// because the week can render before that part of the file runs.
const plannedQueue=new Map(),pendingAdds=new Map();
// Week requests in flight (see fetchWeek), declared early for the first load.
const weekRequests=new Map();
// Days whose coach notes were asked for (see renderToday), also declared early.
const reflectionDays=new Set();
let statusCoachingRevision=0;
let planDataRevision=0;
let coachRefreshTimer;
// When each part of the dashboard data was last read (see load), declared early
// because a change can be saved before the first load ends.
let loadedAt={},loadedWeek=null,loadsRunning=0;
// A saved change makes the data it touches old: food only the nutrition history,
// anything else everything. The shown day is read again on every load anyway.
function markDataChanged(path){if(/\/(food|nutrition|fluids)\//.test(path))delete loadedAt.nutrition;else loadedAt={};loadedWeek=null;}
function scheduleCoachRefresh(){clearTimeout(coachRefreshTimer);coachRefreshTimer=setTimeout(refreshCoachLifecycle,250);}
async function refreshCoachLifecycle(){
  // A load in progress reads the day and the advisers anyway.
  if(document.hidden||coachRefreshRunning||loadsRunning||selectedHistoryDate!==localToday())return;
  coachRefreshRunning=true;
  const revision=statusCoachingRevision;
  const planRevision=planDataRevision;
  try{
    const [daily,coaches,fitness,sleep,gym]=await Promise.all([jsonFetch('/app/api/daily'),jsonFetch('/app/api/coaches'),jsonFetch('/app/api/fitness?days=90'),jsonFetch('/app/api/sleep?start='+dateShift(localToday(),-31)+'&end='+dateShift(localToday(),1)),jsonFetch('/app/api/gym?date='+gymDay())]);
    if(revision!==statusCoachingRevision||planRevision!==planDataRevision||selectedHistoryDate!==localToday())return;
    const oldStatus=state.athleteState?.status;
    state.daily=daily;state.coaches=coaches;state.fitness=fitness;
    const gymChanged=JSON.stringify(state.gym?.values)!==JSON.stringify(gym.values)||state.gym?.cancelled!==gym.cancelled;
    const gymEditing=Boolean(document.activeElement?.closest('#workoutsGym,#gymMode'));
    if(gym.cancelled||!gymEditing)state.gym=gym;updateCachedDay(localToday(),daily,gym);
    const dates=new Set((sleep.sessions||[]).map(s=>s.date));state.sleep={...sleep,sessions:[...(sleep.sessions||[]),...(state.sleep?.sessions||[]).filter(s=>!dates.has(s.date))]};
    if(coaches.athleteState)state.athleteState={...state.athleteState,...coaches.athleteState};
    if(oldStatus&&oldStatus!==state.athleteState?.status){statusCoachingRevision++;state.coachAdvice=null;state.proposals={};state.generated=null;if($('generatedWorkout'))$('generatedWorkout').innerHTML='';if($('weekProposalCards'))$('weekProposalCards').innerHTML='';await loadWeekPlan(true);}
    renderOverview();renderCoachCouncil();renderToday();renderNutrition();if(gymChanged&&(gym.cancelled||!gymEditing))renderGym();try{correctDataPresentation();}catch{}await renderWeekHub();
  }catch{}finally{coachRefreshRunning=false;}
}
// New activities arrive through the five-minute sync, so two minutes keep the advisers current.
setInterval(refreshCoachLifecycle,120000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCoachLifecycle();});
let weekStart=localMonday(),selectedHistoryDate=localToday(),state={};
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function czPlural(n,one,few,many){return n+' '+(n===1?one:n>=2&&n<=4?few:many)}
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function fmt(v,d=0){return Math.round(num(v)*10**d)/10**d}
// Numbers in Czech notation: dec() keeps the decimals ("0,85"), cz() rounds and drops trailing zeros ("12,5", "12").
function dec(v,d=1){const x=Number(v);return Number.isFinite(x)?x.toFixed(d).replace('.',','):''}
function cz(v,d=1){return String(fmt(v,d)).replace('.',',')}
function dateShift(date,days){const p=date.split("-").map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]+days)).toISOString().slice(0,10)}
function localToday(){const p=new Intl.DateTimeFormat("en-GB",{timeZone:USER_TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());return p.find(x=>x.type==="year").value+"-"+p.find(x=>x.type==="month").value+"-"+p.find(x=>x.type==="day").value}
function localMonday(){const d=localToday().split("-").map(Number),x=new Date(Date.UTC(d[0],d[1]-1,d[2])),wd=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-wd);return x.toISOString().slice(0,10)}
function mondayOf(date){const d=date.split('-').map(Number),x=new Date(Date.UTC(d[0],d[1]-1,d[2])),wd=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-wd);return x.toISOString().slice(0,10)}
// Dates follow the app language; English spells the month ("7 Oct").
function dateFormat(opts){const en=document.documentElement.lang==='en';if(en&&opts.day&&/numeric|2-digit/.test(opts.month||''))opts={...opts,day:'numeric',month:'short'};return new Intl.DateTimeFormat(en?'en-GB':'cs-CZ',opts);}
function dateLabel(d){return dateFormat({day:"2-digit",month:"2-digit"}).format(new Date(d+"T12:00:00Z"))}
function longDate(d){return dateFormat({weekday:"long",day:"numeric",month:"numeric"}).format(new Date(d+"T12:00:00Z"))}
// A date that opens a line or heading starts with a capital: "Středa 7. 10.", not "středa 7. 10.".
function capFirst(t){t=String(t??"");return t.charAt(0).toUpperCase()+t.slice(1);}
function dayTitle(d){return capFirst(longDate(d));}
// Form (TSB) with a word and a decimal near zero: a bare "0" read like a missing value.
function formText(tsb){if(!measured(tsb))return '—';const v=Number(tsb),word=v>=15?'velmi svěží':v>=5?'svěží':v>-10?'vyrovnaná':v>-25?'únava':'velká únava';return fmt(v,Math.abs(v)<10?1:0)+' <small class="form-word">'+word+'</small>';}
// Rounded first, so 359.6 min is "6h 0m" and never "5h 60m".
function hm(min){if(!Number.isFinite(Number(min)))return "—";const m=Math.round(Number(min));return Math.floor(m/60)+"h "+(m%60)+"m"}
function isNutritionItem(x){const n=String(x?.name||"").trim(),t=String(x?.type||"").trim();return /nutrition/i.test(n)||/^nutrition$/i.test(t)}
function scoreClass(v){return v>=80?"":" "+(v>=60?"mid":"low")}
function scoreBadge(v,label="Skóre"){return '<span class="score'+scoreClass(v)+'">'+label+" "+fmt(v)+"%</span>"}
function trendArrow(current,previous,invert=false,unit=""){
  const a=Number(current),b=Number(previous);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a===b)return "";
  const delta=a-b,good=invert?delta<0:delta>0,arrow=delta>0?"↑":"↓";
  return '<div class="trend '+(good?"good":"bad")+'">'+arrow+" "+(delta>0?"+":"")+fmt(delta,1)+" "+esc(unit)+'</div>';
}
// Change chip: arrow, signed value, unit and what it is compared against ("+12 min vs 30 days").
// Neutral unless lowerIsGood says which way is better; zero shows as a flat ±0.
function deltaChip(delta,show=true,unit='',basis='',lowerIsGood=null){
  const d=Number(delta);if(!show||!Number.isFinite(d))return '';
  const tone=d===0||lowerIsGood==null?'flat':(d<0)===lowerIsGood?'good':'bad',sign=d>0?'+':d<0?'−':'±';
  return '<span class="trend '+tone+'"><span class="nowrap">'+(d>0?'↑ ':d<0?'↓ ':'')+sign+Math.abs(d)+esc(unit)+'</span>'+(basis?' <span class="nowrap">'+esc(basis.trim())+'</span>':'')+'</span>';
}
function macroTargetsOf(d){
  const m=d?.daily?.nutrition?.macros||d?.daily?.macros||d?.daily?.calories?.macros||{};
  return {
    protein:Number(m.protein_g ?? m.proteinGrams ?? d?.daily?.nutrition?.protein ?? 0),
    carbs:Number(m.carbs_g ?? m.carbsGrams ?? 0),
    fat:Number(m.fat_g ?? m.fatGrams ?? 0)
  };
}
function nutritionScore(food,target){
  const kcal=Number(food?.kcal||0),p=Number(food?.protein_g||0),c=Number(food?.carbs_g||0),f=Number(food?.fat_g||0);
  if(kcal<=0 && p<=0 && c<=0 && f<=0) return null;
  const vals=[["kcal",target.calorieTarget],["protein_g",target.macros?.protein],["carbs_g",target.macros?.carbs],["fat_g",target.macros?.fat]];
  const scores=vals.filter(([,t])=>Number(t)>0).map(([k,t])=>Math.min(1,Number(food?.[k]||0)/Number(t)));
  return scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100):null;
}
function calorieChartDay(d){
  const food=d.food?.totals||{},target=Math.max(0,num(d.daily?.nutrition?.calorieTarget??d.daily?.calories?.target)),eaten=Math.max(0,num(food.kcal));
  const macros=[{label:'Bílkoviny',grams:num(food.protein_g),energy:num(food.protein_g)*4,color:'#60a5fa'},{label:'Sacharidy',grams:num(food.carbs_g),energy:num(food.carbs_g)*4,color:'#f59e0b'},{label:'Tuky',grams:num(food.fat_g),energy:num(food.fat_g)*9,color:'#a78bfa'}];
  const energy=macros.reduce((sum,m)=>sum+m.energy,0);
  return {target,eaten,logged:eaten>0||(d.food?.entries||[]).length>0,progress:target?eaten/target*100:null,macros:macros.map(m=>({...m,share:energy>0?m.energy/energy*100:0}))};
}
function macroChart(id,days){
  let chart=$(id);if(chart.tagName.toLowerCase()==='svg'){const replacement=document.createElement('div');replacement.id=id;chart.replaceWith(replacement);chart=replacement;}
  chart.className='macro-week-chart';const shown=(days||[]).slice(-7);
  if(!shown.length){chart.innerHTML='<p class="small">Bez dat</p>';return}
  chart.innerHTML='<div class="macro-legend"><span><i style="background:#60a5fa"></i>Bílkoviny</span><span><i style="background:#f59e0b"></i>Sacharidy</span><span><i style="background:#a78bfa"></i>Tuky</span></div><p class="small">Zapsaný příjem / denní cíl · kcal</p><div class="macro-chart-scroll"><div class="macro-columns">'+shown.map(d=>{
    const v=calorieChartDay(d),label=dateFormat({weekday:'short'}).format(new Date(d.date+'T12:00:00Z')),tip=v.macros.map(m=>m.label+' '+fmt(m.grams,1)+' g').join(' · '),fill=v.progress==null?0:Math.min(100,v.progress),progress=v.progress==null?'Cíl chybí':!v.logged?'Bez zápisu':v.progress>0&&v.progress<1?'<1 % cíle':fmt(v.progress)+' % cíle';
    const segments=v.macros.some(m=>m.share>0)?v.macros.filter(m=>m.share>0).map(m=>'<i style="height:'+m.share+'%;background:'+m.color+'" title="'+esc(m.label+' '+fmt(m.grams,1)+' g')+'"></i>').join(''):'<i style="height:100%;background:#91e5c9"></i>';
    return '<div class="macro-day'+(d.date===localToday()?' current':'')+'" title="'+esc(longDate(d.date)+' · '+(v.logged?v.eaten+' kcal · '+tip:uiText('bez zápisu','no entries')))+'"><span class="macro-day-name">'+esc(label)+'</span><strong>'+(v.logged?fmt(v.eaten):'—')+'</strong><small>/ '+(v.target?fmt(v.target):'—')+'</small><div class="macro-day-track" role="img" aria-label="'+esc(longDate(d.date)+': '+(v.logged?v.eaten+uiText(' z ',' of ')+v.target+' kcal':uiText('bez zapsaného příjmu','no intake logged')))+'"><div class="macro-day-fill" style="height:'+fill+'%">'+(v.logged?segments:'')+'</div></div><span class="macro-day-progress'+(v.progress>100?' over':'')+'">'+progress+'</span></div>';
  }).join('')+'</div></div>';
}
function isoWeek(date){
  const d=new Date(date+"T12:00:00Z"), th=new Date(d);
  th.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const y=th.getUTCFullYear(), jan=new Date(Date.UTC(y,0,1));
  return String(Math.ceil((((th-jan)/86400000)+1)/7)).padStart(2,"0");
}
function populateWeekSelectors(weekId,dayId,days){
  const ws=$(weekId),ds=dayId?$(dayId):null;
  if(!ws)return;
  const opts=[];
  for(let i=-12;i<=8;i++){
    const d=dateShift(localMonday(),i*7);
    opts.push('<option value="'+d+'" '+(d===weekStart?"selected":"")+uiText('>Týden ', '>Week ')+isoWeek(d)+' · '+dateLabel(d)+'–'+dateLabel(dateShift(d,6))+'</option>');
  }
  ws.innerHTML=opts.join("");
  if(ds){
    ds.innerHTML=days.map(x=>'<option value="'+x.date+'" '+(x.date===selectedHistoryDate?"selected":"")+'>'+esc(longDate(x.date))+'</option>').join("");
    ds.onchange=()=>{selectedHistoryDate=ds.value;renderTraining();renderNutrition()};
  }
  ws.onchange=()=>{weekStart=ws.value;selectedHistoryDate=weekStart;load()};
}
// A modal dialog covers the page, so messages and tips move into it while open.
function overlayHost(){try{return document.querySelector('dialog:modal')||document.body}catch{return document.body}}
function toast(msg){const t=$("toast"),host=overlayHost();if(t.parentNode!==host)host.appendChild(t);t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
async function jsonFetch(path,options={}){if(typeof aiIntroBefore==='function')await aiIntroBefore(path,options);const r=await fetch(path,{credentials:"same-origin",...options,headers:{...options.headers,"X-Interface-Language":document.documentElement.lang||"cs","X-Time-Zone":USER_TZ}});const d=await r.json().catch(()=>({message:"Invalid response"}));if(r.status===401)showLoginGate();if(r.status===402&&typeof showAiPlans==='function')subscriptionInfo().then(s=>showAiPlans(s,{locked:true})).catch(()=>{});if(!r.ok)throw new Error(d.message||"HTTP "+r.status);if(options.method&&options.method!=='GET'&&!/\/food\/(?:label|photo|search|ai-lookup)|\/workouts\/generate|\/estimate|\/assistant/.test(path))markDataChanged(path);if(options.method&&options.method!=='GET'&&!/\/food\/(?:label|photo|search|ai-lookup)|\/workouts\/generate|\/estimate/.test(path)&&typeof clearLibraryCache==='function')clearLibraryCache();if(options.method&&options.method!=='GET'&&!/\/assistant|\/sync|\/athlete-state|\/food\/(?:label|photo|search|ai-lookup)|\/workouts\/(?:generate|schedule)|\/estimate|\/week-plan|\/planned\//.test(path))scheduleCoachRefresh();return d}
// ---- AI plan: the comparison of Free and AI ----
// During the pilot everything is free; the first use of an AI feature shows
// once what will belong to the AI plan (remembered per account on the server).
// Once the paid split is on, a locked AI feature (HTTP 402) shows it each time.
// Paying is not live yet: the button only says so.
const AI_PATHS=['/app/api/assistant','/app/api/coach/review','/app/api/gym/adjust','/app/api/gym/equipment/ai','/app/api/food/ai-lookup','/app/api/food/photo'];
let subscriptionPromise=null;
function subscriptionInfo(){return subscriptionPromise||(subscriptionPromise=fetch('/app/api/subscription',{credentials:'same-origin'}).then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status))).catch(error=>{subscriptionPromise=null;throw error;}));}
async function aiIntroBefore(path,options={}){
  if(String(options.method||'GET').toUpperCase()!=='POST'||!AI_PATHS.includes(String(path).split('?')[0]))return;
  let s;try{s=await subscriptionInfo();}catch{return;}
  if(s.aiConsent===false){if(!(await askAiConsent()))throw new Error(uiText('Bez souhlasu s posíláním dat do OpenAI AI funkce nepoběží.','Without consent to send data to OpenAI, AI features won\'t run.'));s.aiConsent=true;}
  if(s.mode!=='pilot'||s.introSeen)return;
  s.introSeen=true;
  fetch('/app/api/subscription/intro',{method:'POST',credentials:'same-origin'}).catch(()=>{});
  await showAiPlans(s,{pilot:true});
}
// compact: the free features as one line, so the pop-up fits a phone screen.
function aiPlansHtml(s,{compact=false}={}){
  const free=(s.features||[]).filter(f=>!f.ai);
  const shown=compact?[{name:'Základ aplikace: profil a kalorie, ruční záznamy, potraviny, plánování tréninků a propojení služeb',ai:false},...(s.features||[]).filter(f=>f.ai)]:(s.features||[]);
  if(compact&&!free.length)shown.shift();
  const rows=shown.map(f=>'<tr><th scope="row">'+esc(f.name)+'</th><td>'+(f.ai?'<span class="plan-no">—</span>':'<span class="plan-yes">✓</span>')+'</td><td><span class="plan-yes">✓</span></td></tr>').join('');
  return '<table class="plan-table"><thead><tr><th scope="col"><span class="sr-only">Funkce</span></th><th scope="col">Free</th><th scope="col">AI</th></tr></thead><tbody>'+rows+'<tr class="plan-price"><th scope="row">Cena</th><td>Zdarma</td><td>Bude oznámena</td></tr></tbody></table>';
}
function showAiPlans(s,{pilot=false,locked=false}={}){
  if($('aiPlans'))return Promise.resolve();
  return new Promise(resolve=>{
    document.body.insertAdjacentHTML('beforeend','<div id="aiPlans" role="dialog" aria-modal="true" aria-labelledby="aiPlansTitle" style="'+gateStyle+'"><div class="card ai-plans-card"><div class="eyebrow">'+(pilot?'Pilot · AI zdarma':'AI předplatné')+'</div><h2 id="aiPlansTitle">'+(locked?'Tahle funkce je v AI předplatném':'Používáš AI funkci')+'</h2><p class="small">'+(pilot?'Během pilotu máš všechno zdarma. Až spustíme předplatné, AI funkce budou v placeném tarifu a základ aplikace zůstane zdarma.':'Základ aplikace je zdarma. AI trenér, rozpoznání jídla z fotky a další AI funkce jsou v předplatném.')+'</p>'+aiPlansHtml(s,{compact:true})+'<p class="small" id="aiPlansNote" role="status"></p><div class="setup-actions ai-plans-actions"><button class="btn" type="button" id="aiPlansClose">'+(pilot?'Pokračovat zdarma':'Zavřít')+'</button><button class="btn primary" type="button" id="aiPlansBuy">Předplatit AI</button></div></div></div>');
    const close=()=>{$('aiPlans')?.remove();resolve();};
    $('aiPlansClose').onclick=close;
    $('aiPlansBuy').onclick=()=>{$('aiPlansNote').textContent=pilot?'Platby zatím nejsou spuštěné. Během pilotu máš AI zdarma, nic platit nemusíš.':'Platby zatím nejsou spuštěné. Dáme vědět, až půjde předplatné objednat.';};
    $('aiPlansClose').focus({preventScroll:true});
  });
}
{const css=document.createElement('style');css.textContent='.ai-plans-card{width:min(560px,100%);display:grid;gap:14px;max-height:calc(100vh - 32px);overflow:auto}.ai-plans-card h2{margin:0}.ai-plans-card>p{margin:0}.plan-table{width:100%;border-collapse:collapse;font-size:var(--fs-body)}.plan-table th,.plan-table td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.plan-table thead th{font-size:var(--fs-meta);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.plan-table td{text-align:center;width:64px}.plan-table thead th:not(:first-child){text-align:center}.plan-table tbody th{font-weight:500;text-transform:none;letter-spacing:normal;color:var(--text);font-size:var(--fs-body);line-height:1.35}.plan-table thead th{padding-top:0}.plan-yes{color:var(--ok);font-weight:700}.plan-no{color:var(--muted)}.plan-price th,.plan-price td{font-weight:700;border-bottom:0}.plan-price td{font-size:var(--fs-small)}.ai-plans-actions{position:sticky;bottom:-1px;background:inherit;padding:10px 0 2px;margin:0}.ai-plans-card{padding-bottom:12px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}';document.head.append(css);}
// Every data API requires a session; the first 401 swaps the dashboard for a login screen.
const gateStyle='position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:var(--bg);overflow:auto';
// The sign-in buttons come from the page (<template id="signInButtons">), which knows which
// providers are set up and draws them by Google's and Apple's branding rules.
function showLoginGate(){if($("loginGate"))return;forgetAccount();if(new URLSearchParams(location.search).get('deleted')==='1')queueMicrotask(()=>toast('Účet a data jsou smazané.'));const mode=(t,r)=>'<span data-for="signin">'+t+'</span><span data-for="register">'+r+'</span>';document.body.insertAdjacentHTML("beforeend",'<div id="loginGate" role="dialog" aria-modal="true" aria-labelledby="loginGateTitle" style="'+gateStyle+'"><div class="card login-card" data-mode="'+(/^#registrace$|^#register$/.test(location.hash)||new URLSearchParams(location.search).has('register')?'register':'signin')+'"><img class="login-logo" src="/logo.svg" alt="" width="48" height="48"><h2 id="loginGateTitle">'+mode('Přihlášení do Loadwise','Registrace do Loadwise')+'</h2><div class="login-tabs" role="tablist" aria-label="Přihlášení nebo registrace"><button type="button" role="tab" data-tab="signin">Přihlásit se</button><button type="button" role="tab" data-tab="register">Registrace</button></div><p class="small" data-for="register">Účet si zatím může založit jen pozvaný e-mail. Použij adresu, na kterou ti přišla pozvánka.</p><p class="small">Přihlášení slouží pouze k založení účtu; přístup ke Google Health povolíš zvlášť a dobrovolně.</p><div class="sign-in-buttons">'+($("signInButtons")?.innerHTML||'')+'</div><p class="small">'+mode('Přihlášením souhlasíš s podmínkami použití.','Registrací souhlasíš s podmínkami použití.')+'</p><p class="small login-links"><a href="/terms">Podmínky použití</a><span aria-hidden="true">·</span><a href="/privacy">Ochrana soukromí</a></p></div></div>');installLoginGate();}
// Passkeys (WebAuthn) and one-time codes by e-mail. The browser API speaks ArrayBuffers, the server base64url.
const b64uBuf=s=>{s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;};
const bufB64u=b=>{let s='';for(const x of new Uint8Array(b))s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
function credentialJson(c){const r=c.response,o={id:c.id,rawId:bufB64u(c.rawId),type:c.type,authenticatorAttachment:c.authenticatorAttachment||null,response:{clientDataJSON:bufB64u(r.clientDataJSON)},clientExtensionResults:{}};
  if(r.attestationObject){o.response.attestationObject=bufB64u(r.attestationObject);o.response.transports=typeof r.getTransports==='function'?r.getTransports():[];}
  else{o.response.authenticatorData=bufB64u(r.authenticatorData);o.response.signature=bufB64u(r.signature);o.response.userHandle=r.userHandle?bufB64u(r.userHandle):null;}return o;}
const passkeysSupported=()=>Boolean(window.PublicKeyCredential&&navigator.credentials&&typeof navigator.credentials.create==='function');
function passkeyError(error,unfinished){if(error?.name==='NotAllowedError'||error?.name==='AbortError')return unfinished;if(error?.name==='InvalidStateError')return 'Tohle zařízení už přístupový klíč pro Loadwise má.';return error?.message||unfinished;}
// A plain fetch: jsonFetch would bring the sign-in screen back on a 401.
async function authFetch(path,body,method='POST'){const r=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Interface-Language':document.documentElement.lang||'cs'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.message||'HTTP '+r.status);e.data=d;throw e;}return d;}
// Safari only lets a tap open the passkey sheet for a moment, so the options are fetched ahead of the tap.
function prefetched(path){let at=0,p=null;const get=()=>{if(!p||Date.now()-at>4*60*1000){at=Date.now();p=authFetch(path,{});p.catch(()=>{p=null;});}return p;};return {get,reset(){p=null;}};}
const loginOptions=prefetched('/auth/passkey/options'),newPasskeyOptions=prefetched('/app/api/passkeys/options');
// Which passkeys this device made or used, by e-mail, so the e-mail step can ask for the passkey
// instead of sending a code. Kept on the device: the server never says whether an address has an account.
const PASSKEYS_KEY='lw-passkeys',mailKey=v=>String(v||'').trim().toLowerCase();
function devicePasskeys(){try{const v=JSON.parse(localStorage.getItem(PASSKEYS_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function saveDevicePasskeys(all){try{for(const k of Object.keys(all))if(!all[k]?.length)delete all[k];localStorage.setItem(PASSKEYS_KEY,JSON.stringify(all));}catch{}}
const knownPasskeys=email=>{const ids=devicePasskeys()[mailKey(email)];return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];};
function rememberPasskey(email,id){if(!mailKey(email)||!id)return;const all=devicePasskeys();all[mailKey(email)]=[...new Set([...knownPasskeys(email),id])].slice(-5);saveDevicePasskeys(all);}
// Keeps only the passkeys the account still has (Settings knows the full list).
function keepPasskeys(email,ids){const all=devicePasskeys(),k=mailKey(email);if(!all[k])return;all[k]=knownPasskeys(email).filter(id=>ids.includes(id));saveDevicePasskeys(all);}
function forgetPasskey(id){const all=devicePasskeys();for(const k of Object.keys(all))all[k]=(Array.isArray(all[k])?all[k]:[]).filter(x=>x!==id);saveDevicePasskeys(all);}
// allowCredentials narrows the browser's sheet to the passkeys this device knows for the address.
async function signInWithPasskey(ids=[]){const o=await loginOptions.get();loginOptions.reset();
  const c=await navigator.credentials.get({publicKey:{challenge:b64uBuf(o.challenge),rpId:o.rpId,timeout:o.timeout,userVerification:o.userVerification,allowCredentials:ids.map(id=>({type:'public-key',id:b64uBuf(id)}))}});
  return finishPasskeySignIn(c);}
async function finishPasskeySignIn(c){try{const d=await authFetch('/auth/passkey/verify',{credential:credentialJson(c)});rememberPasskey(d.email,c.id);return d;}
  catch(error){// Lets the password manager drop a passkey this app no longer knows.
    if(error.data?.unknownCredential){forgetPasskey(c.id);try{PublicKeyCredential.signalUnknownCredential?.({rpId:error.data.rpId,credentialId:c.id});}catch{}}throw error;}}
// The options carry the account's e-mail as the passkey's user name, so the device remembers it.
async function addPasskey(){const o=await newPasskeyOptions.get();newPasskeyOptions.reset();
  const c=await navigator.credentials.create({publicKey:{...o,challenge:b64uBuf(o.challenge),user:{...o.user,id:b64uBuf(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(x=>({...x,id:b64uBuf(x.id)}))}});
  const d=await authFetch('/app/api/passkeys',{credential:credentialJson(c)});rememberPasskey(o.user.name,c.id);return d;}
// Where the browser can, the e-mail field itself offers the device's passkeys (conditional mediation).
let passkeyAutofill=null;
async function startPasskeyAutofill(show){try{if(!$('loginEmail')||!passkeysSupported()||!(await PublicKeyCredential.isConditionalMediationAvailable?.()))return false;}catch{return false;}
  passkeyAutofill?.abort();const ctl=passkeyAutofill=new AbortController();
  (async()=>{try{const o=await authFetch('/auth/passkey/options',{});if(ctl.signal.aborted)return;
    const c=await navigator.credentials.get({mediation:'conditional',signal:ctl.signal,publicKey:{challenge:b64uBuf(o.challenge),rpId:o.rpId,timeout:o.timeout,userVerification:o.userVerification,allowCredentials:[]}});
    await finishPasskeySignIn(c);location.reload();}
  // Only the server's answer to a chosen passkey is worth showing; the browser's own refusals are not.
  catch(error){if(!ctl.signal.aborted&&error?.data)show(error.message);}})();return true;}
function installLoginGate(){// The iPhone app signs in with Google through Safari (nativeLogin).
  if(nativeApp())document.querySelector('#loginGate .sign-in-google')?.addEventListener('click',e=>{e.preventDefault();nativeLogin();});
  const status=$('loginStatus'),show=text=>{if(status)status.textContent=text||'';},card=document.querySelector('#loginGate .login-card');
  const mode=()=>card?.dataset.mode==='register'?'register':'signin';
  // Two tabs over the same buttons: the card's data-mode swaps the words (see signInButtonsCss).
  const tabs=[...document.querySelectorAll('#loginGate [data-tab]')],pick=(tab,focus)=>{if(card)card.dataset.mode=tab;tabs.forEach(b=>{const on=b.dataset.tab===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;if(on&&focus)b.focus();});show('');};
  tabs.forEach((b,i)=>{b.onclick=()=>pick(b.dataset.tab);b.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();pick(tabs[(i+1)%tabs.length].dataset.tab,true);}};});pick(mode());
  const pk=$('passkeySignIn');if(passkeysSupported())loginOptions.get().catch(()=>{});
  startPasskeyAutofill(show).then(inField=>{if(inField||!pk||!passkeysSupported())return;pk.hidden=false;pk.onclick=async()=>{pk.disabled=true;show('');try{await signInWithPasskey();location.reload();}catch(error){show(passkeyError(error,'Přihlášení přístupovým klíčem se nedokončilo.'));pk.disabled=false;loginOptions.get().catch(()=>{});}};});
  const start=$('emailStartForm'),codeForm=$('emailCodeForm');if(!start||!codeForm)return;let address='',timer=0;
  const cooldown=()=>{const b=$('resendCode');b.disabled=true;clearTimeout(timer);timer=setTimeout(()=>{b.disabled=false;},60000);};
  const send=async()=>{await authFetch('/auth/email/start',{email:address});$('codeAddress').textContent=address;start.hidden=true;$('emailHint').hidden=true;codeForm.hidden=false;$('loginCode').value='';$('loginCode').focus();cooldown();};
  start.onsubmit=async e=>{e.preventDefault();const b=start.querySelector('button');address=$('loginEmail').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){show('Zadej platný e-mail.');$('loginEmail').focus();return;}b.disabled=true;show('');
    // A passkey this device knows for the address comes first; without one, or when it is not used, a code goes out.
    const ids=mode()==='signin'&&passkeysSupported()?knownPasskeys(address):[];
    if(ids.length){passkeyAutofill?.abort();try{await signInWithPasskey(ids);location.reload();return;}
      catch(error){loginOptions.get().catch(()=>{});startPasskeyAutofill(show);if(error.data&&!error.data.unknownCredential){show(error.message);b.disabled=false;return;}}}
    try{await send();if(ids.length)show('Přístupový klíč se nepoužil, tak jsme ti poslali kód.');}catch(error){show(error.message);}b.disabled=false;};
  $('resendCode').onclick=async()=>{show('');try{await send();show('Poslali jsme nový kód.');}catch(error){show(error.message);}};
  $('changeEmail').onclick=()=>{codeForm.hidden=true;start.hidden=false;$('emailHint').hidden=false;show('');$('loginEmail').focus();};
  codeForm.onsubmit=async e=>{e.preventDefault();const b=codeForm.querySelector('button[type=submit]');b.disabled=true;show('');try{const d=await authFetch('/auth/email/verify',{email:address,code:$('loginCode').value});passkeyAutofill?.abort();await offerPasskey({created:Boolean(d.created),email:address});}catch(error){show(error.message);b.disabled=false;}};}
// Right after a code sign-in: a passkey makes the next sign-in one tap. A new account always gets the
// offer (on a phone, a computer or a password manager); a sign-in only once per device that has its own.
async function offerPasskey({created=false,email=''}={}){let offer=false;try{offer=passkeysSupported()&&!knownPasskeys(email).length&&(created||(localStorage.getItem('lw-passkey-offer')!=='no'&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));}catch{}
  const card=document.querySelector('#loginGate .login-card');if(!offer||!card){location.reload();return;}newPasskeyOptions.get().catch(()=>{});
  card.innerHTML='<img class="login-logo" src="/logo.svg" alt="" width="48" height="48"><h2 id="loginGateTitle">'+(created?'Účet je založený':'Příště rychleji')+'</h2><p class="small">'+(created?'Chceš se příště přihlašovat bez kódu? Přidej si přístupový klíč (passkey) do telefonu, počítače nebo správce hesel. Přihlásíš se pak otiskem prstu, obličejem nebo zámkem obrazovky.':'Přidej si přístupový klíč a příště se přihlásíš otiskem prstu, obličejem nebo zámkem obrazovky, bez čekání na e-mail.')+'</p><div class="sign-in-buttons"><button class="btn primary" type="button" id="offerPasskey">Přidat přístupový klíč</button><button class="btn" type="button" id="skipPasskey">Teď ne</button></div><p class="small">Přidat nebo odebrat ho můžeš kdykoli v Nastavení → Účet.</p><p id="loginStatus" class="small login-status" role="status" aria-live="polite"></p>';
  $('skipPasskey').onclick=()=>{try{localStorage.setItem('lw-passkey-offer','no');}catch{}location.reload();};
  $('offerPasskey').onclick=async()=>{const b=$('offerPasskey');b.disabled=true;try{await addPasskey();location.reload();}catch(error){$('loginStatus').textContent=passkeyError(error,'Přidání přístupového klíče se nedokončilo.');b.disabled=false;newPasskeyOptions.get().catch(()=>{});}};}
// ---- iPhone app (mobile/, Capacitor) ----
// Google refuses sign-in inside an app's web view, so the app signs in in
// Safari and comes back through loadwise://auth with a short-lived token. Only
// this web view knows the verifier that redeems it (see src/google-login.js).
// E-mail codes work in the app as they are; Apple sign-in and passkeys would
// need a paid Apple developer account, so the app hides their buttons.
function nativeApp(){return Boolean(window.Capacitor?.isNativePlatform?.());}
// The app draws under the status bar and the home indicator: the page gets the
// iPhone's safe areas (viewport-fit=cover) and the top bar and the sign-in
// screens leave room for them. The bottom bar and sheets already do.
if(nativeApp()){
  document.documentElement.classList.add('native-app');
  const viewport=document.querySelector('meta[name="viewport"]');if(viewport&&!/viewport-fit/.test(viewport.content))viewport.content+=',viewport-fit=cover';
  const style=document.createElement('style');style.textContent='.native-app .topbar{box-sizing:content-box!important;top:0!important;padding-top:env(safe-area-inset-top)!important}.native-app .sign-in-apple,.native-app #passkeySignIn{display:none!important}.native-app #loginGate,.native-app #onboardingGate{padding-top:calc(16px + env(safe-area-inset-top))!important;padding-bottom:calc(16px + env(safe-area-inset-bottom))!important}';document.head.append(style);
}
let appVerifier='';
async function nativeLogin(){
  const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  appVerifier=b64(crypto.getRandomValues(new Uint8Array(32)));try{sessionStorage.setItem('lw-app-verifier',appVerifier);}catch{}
  const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(appVerifier))));
  try{await window.Capacitor.nativePromise('Browser','open',{url:location.origin+'/auth/google?app='+challenge});}catch(error){toast(error?.message||String(error));}
}
async function finishNativeLogin(url){
  window.Capacitor.nativePromise('Browser','close').catch(()=>{});
  let verifier=appVerifier;try{verifier||=sessionStorage.getItem('lw-app-verifier')||'';}catch{}
  const token=new URL(url).searchParams.get('token');
  const r=token&&verifier?await fetch('/auth/app/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,verifier})}).catch(()=>null):null;
  if(r?.ok){try{sessionStorage.removeItem('lw-app-verifier');}catch{}location.replace('/app');}
  else toast(uiText('Přihlášení se nepodařilo dokončit. Zkus to znovu.','Sign-in could not be completed. Please try again.'));
}
if(nativeApp())window.Capacitor.addListener('App','appUrlOpen',e=>{if(String(e?.url||'').startsWith('loadwise://auth'))finishNativeLogin(e.url);});
// Complete the saved profile before opening the dashboard; providers are optional.
function showOnboarding(){showAccountSetup().catch(error=>toast(error.message));}
// Google Health data policy: before Google's consent screen the app says which data it reads and
// writes, what for and who else gets it, and the user agrees with a box that is never pre-ticked.
// Every link to /oauth/google opens this first and keeps its parameters (extra=1, return=setup);
// the server sends direct visits back here too.
function googleHealthConsent(href){$('googleConsent')?.remove();const target=new URL(href,location.origin),extra=target.searchParams.get('extra')==='1';const d=document.createElement('dialog');d.id='googleConsent';d.className='consent-dialog';d.setAttribute('aria-labelledby','googleConsentTitle');
  const item=(label,text)=>'<li><strong>'+label+'</strong> '+text+'</li>';
  d.innerHTML='<h3 id="googleConsentTitle">'+(extra?'Rozšířit oprávnění Google':'Připojení Google Health')+'</h3><p class="small">Než tě pošleme na souhlas Google, shrneme, co Loadwise s daty udělá.</p><ul class="consent-list">'+
    (extra?item('Co navíc čteme:','Datum narození z tvého Google účtu, aby se věk v profilu doplnil sám.')+item('Co navíc zapisujeme:','Do Google Health váhu, kterou zapíšeš tady nebo v Intervals.icu.')
      :item('Co čteme:','Z Google Health aktivitu a kondici (kroky, vzdálenost, aktivní energii, tréninky), zdravotní měření (tep, HRV, okysličení krve, dech, VO₂max, váhu, výšku, tělesný tuk), spánek a záznamy jídla.')+item('Co zapisujeme:','Do Google Health jen jídlo a pití, které si tady zapíšeš.'))+
    item('K čemu:','Jen pro funkce aplikace: přehled dne, regenerace, kalorický cíl, plán tréninků a osobní asistent.')+
    item('Kdo data dostane:','Tvůj účet Intervals.icu, když ho připojíš (zkopírujeme do něj spánek, tep, HRV, kroky, váhu a další wellness). OpenAI, když použiješ AI funkce, a to jen data potřebná pro odpověď. Nikomu dalšímu je nedáváme, neprodáváme je a nepoužíváme k reklamě.')+
    item('Kdykoli:','Google Health odpojíš v Nastavení a tam taky smažeš účet i se všemi daty.')+
    '</ul><label class="consent-check"><input type="checkbox" id="googleConsentAgree"><span>Souhlasím, aby Loadwise takto používal moje data z Google Health.</span></label><p class="small"><a href="/privacy" target="_blank" rel="noopener">Zásady ochrany soukromí</a></p><div class="consent-actions"><button class="btn" type="button" id="googleConsentCancel">Zrušit</button><button class="btn primary" type="button" id="googleConsentGo" disabled>Pokračovat na Google</button></div>';
  document.body.appendChild(d);d.addEventListener('close',()=>d.remove());
  $('googleConsentAgree').onchange=e=>{$('googleConsentGo').disabled=!e.target.checked;};
  $('googleConsentCancel').onclick=()=>d.close();
  $('googleConsentGo').onclick=()=>{if(!$('googleConsentAgree').checked)return;target.searchParams.set('consent','1');location.href=target.pathname+target.search;};
  d.showModal();}
document.addEventListener('click',e=>{const a=e.target.closest?.('a[href^="/oauth/google"]');if(!a)return;e.preventDefault();googleHealthConsent(a.getAttribute('href'));});
// /oauth/google without the consent above lands here as /app?connect=google (or google-extra, plus return=setup).
function openRequestedConsent(){const params=new URLSearchParams(location.search),c=params.get('connect');if(c!=='google'&&c!=='google-extra')return;const back=params.get('return')==='setup'?'return=setup':'';params.delete('connect');params.delete('return');history.replaceState(null,'',location.pathname+(params.toString()?'?'+params:'')+location.hash);googleHealthConsent('/oauth/google?'+(c==='google-extra'?'extra=1&':'')+back);}
// Service cards (Google Health, Intervals.icu) with the button that connects
// each, shared by the setup window and Settings → Propojení. Connecting goes to
// the provider's page, which sends the user back (/app?connected=…).
const ACTIVITY_OPTIONS=[['sedentary','Sedavá práce, málo chůze'],['light','Lehce aktivní: hodně chůze, práce vestoje'],['active','Aktivní: většinu dne v pohybu'],['heavy','Fyzicky náročná práce']];
const SPORT_HOURS_OPTIONS=[['0','Žádný'],['1-3','1–3 hodiny'],['3-6','3–6 hodin'],['6-10','6–10 hodin'],['10+','Víc než 10 hodin']];
const GOAL_OPTIONS=[['lose_0.25','Hubnout 0,25 kg týdně'],['lose_0.5','Hubnout 0,5 kg týdně'],['lose_0.75','Hubnout 0,75 kg týdně'],['lose_1','Hubnout 1 kg týdně'],['maintain','Udržovat váhu']];
const GOOGLE_PERMISSION_LABELS=uiTable({activity:'aktivity a kroky',metrics:'tep, HRV a váha',sleep:'spánek',nutritionRead:'čtení jídla',nutritionWrite:'zápis jídla'},{activity:'activity and steps',metrics:'heart rate, HRV and weight',sleep:'sleep',nutritionRead:'reading food',nutritionWrite:'writing food'});
// Texts put together from parts (a list of names): the page translator only
// knows whole texts, so these pick the language themselves.
function uiText(cs,en){return document.documentElement.lang==='en'?en:cs;}
// A label table whose values follow the app language when read.
function uiTable(cs,en){const t={};for(const k of Object.keys(cs))Object.defineProperty(t,k,{get:()=>uiText(cs[k],en[k]??cs[k]),enumerable:true});return t;}
// Which services this account has connected (from /app/api/me, refreshed with
// the connection cards). Until it is known everything counts as connected, so
// nothing flickers away for existing users.
let connectedServices=null;
function serviceConnected(id){return !connectedServices||connectedServices.has(id);}
function setConnectedServices(ids){connectedServices=new Set(ids);}
// One service: what it brings, its state and the button that connects it.
// back is where the provider's page returns: the wizard or Settings.
function serviceCardHtml(p,back,{cls='service-card',more=''}={}){
  const google=p.id==='google',connect=p.connectUrl?p.connectUrl+(p.connectUrl.includes('?')?'&':'?')+'return='+back:null;
  const brings=google?'Spánek včetně fází, kroky, tep, HRV, váha a jídlo z aplikace Google Health (Fitbit, Pixel Watch, iPhone přes import z Apple Health).':'Tréninky z Garminu, Wahoo, COROS, Polaru, Suunta a dalších, plánované tréninky, kondice, únava a forma. Wellness i z Apple Health.';
  const missing=(p.missingPermissions||[]).map(k=>GOOGLE_PERMISSION_LABELS[k]||k);
  let action='',warning='';
  if(p.connected){
    if(p.id==='intervals')action='<button class="btn" type="button" data-intervals-refresh>Obnovit</button>';
    if(missing.length){warning='<p class="small service-warning"><span>Google nepovolil:</span> '+missing.map(m=>'<span>'+esc(m)+'</span>').join(', ')+'. <span>Tahle data chybí, dokud je nepovolíš.</span></p>';if(connect)action='<a class="btn" href="'+esc(connect)+'">Povolit chybějící</a>';}
  }else if(google){
    action=connect?'<a class="btn primary" href="'+esc(connect)+'">Připojit Google Health</a>':'<p class="small">Připojení Google Health není na serveru nastavené.</p>';
  }else if(connect){
    action='<a class="btn primary" href="'+esc(connect)+'">Připojit Intervals.icu</a>';
  }else{
    action='<button class="btn primary" type="button" data-intervals-key>Připojit Intervals.icu</button>'+intervalsKeyFormHtml(p);
  }
  const buttons=action+more;
  return '<article class="'+cls+'" data-provider="'+esc(p.id)+'"><div class="service-head"><h3>'+esc(p.name)+'</h3>'+(p.connected?'<span class="pill good">Připojeno</span>':'<span class="pill">Nepřipojeno</span>')+'</div><p class="small">'+esc(brings)+'</p>'+warning+(buttons?'<div class="service-action">'+buttons+'</div>':'')+(p.connected&&p.id==='intervals'?'<p class="small" data-provider-sync-status aria-live="polite"></p>':'')+'</article>';
}
// Connecting Intervals.icu with a personal API key, step by step.
function intervalsKeyFormHtml(p){return '<form class="intervals-key-form" hidden><ol class="small key-steps"><li>Otevři v Intervals.icu <a href="'+esc(p.keyUrl||'https://intervals.icu/settings')+'" target="_blank" rel="noopener noreferrer">Settings</a> a sjeď dolů na Developer Settings.</li><li>Zkopíruj API Key (Athlete ID nepotřebuješ).</li><li>Vlož ho sem. Ověříme ho u Intervals a uložíme zašifrovaný.</li></ol><div class="select-row"><input type="password" autocomplete="off" required placeholder="API klíč Intervals.icu" aria-label="API klíč Intervals.icu" class="food-input"><button class="btn primary" type="submit">Ověřit a připojit</button></div><div class="small" aria-live="polite" data-key-result></div></form>';}
// The API key form inside a service card; onConnected runs after Intervals accepted the key.
function wireIntervalsKey(root,onConnected){
  root.querySelectorAll('[data-intervals-key]').forEach(b=>b.onclick=()=>{const form=b.nextElementSibling;b.hidden=true;form.hidden=false;form.querySelector('input').focus();});
  root.querySelectorAll('.intervals-key-form').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const input=form.querySelector('input'),button=form.querySelector('button'),out=form.querySelector('[data-key-result]');button.disabled=true;out.textContent='Ověřuji klíč…';
    try{const r=await jsonFetch('/app/api/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'intervals',key:input.value.trim()})});input.value='';out.textContent=r.message;toast(r.message);await onConnected();}
    catch(error){out.textContent=error.message;}finally{button.disabled=false;}});
}
// Back from a provider's page: say what happened and drop it from the address.
function connectedNotice(){
  const params=new URLSearchParams(location.search),event=params.get('connected');if(!event)return;
  params.delete('connected');history.replaceState(null,'',location.pathname+(params.toString()?'?'+params:'')+location.hash);
  const messages={google:'Google Health je připojené.','google-cancelled':'Připojení Google Health bylo zrušeno.',intervals:'Intervals.icu je připojené.','intervals-cancelled':'Připojení Intervals.icu bylo zrušeno.','intervals-failed':'Intervals.icu se nepodařilo připojit. Zkus to znovu, nebo vlož API klíč.'};
  if(messages[event])toast(messages[event]);
}
connectedNotice();
// ---- Nastavení: a list of sections, one open at a time ----
// Each line shows what is set; links elsewhere in the app open the right section
// (openSettings('connections'), data-open-section, #settings-connections).
function lineIcon(name){const paths=(typeof window!=='undefined'&&window.LW_ICONS||{})[name];return paths?'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+paths+'</svg>':'';}
function settingsSectionHtml(key,icon,title,summary,body,hidden=false){return '<details class="settings-section" id="settings-'+key+'" name="settings"'+(hidden?' hidden':'')+'><summary><span class="settings-icon">'+lineIcon(icon)+'</span><span class="settings-label"><strong>'+esc(title)+'</strong><small data-settings-summary="'+key+'">'+esc(summary)+'</small></span></summary><div class="settings-body" id="settingsBody-'+key+'">'+body+'</div></details>';}
function settingsSection(key){return $('settings-'+key)||$('settings');}
function settingsBody(key){return $('settingsBody-'+key)||$('settings');}
function setSettingsSummary(key,text){const el=document.querySelector('[data-settings-summary="'+key+'"]');if(el&&text)el.textContent=text;}
function openSettings(key,focusId){
  activate('settings');const section=$('settings-'+key);if(!section)return;
  section.hidden=false;section.open=true;
  requestAnimationFrame(()=>($(focusId)||section).scrollIntoView({behavior:'smooth',block:'start'}));
}
// The profile line: what the calorie target still needs, or that it is complete.
function renderProfileSummary(){
  const p={...suggestedProfile(),...Object.fromEntries(Object.entries(savedProfile()).filter(([,v])=>v!==null&&v!==''))};
  const missing=[['sex','pohlaví','sex'],['age','datum narození','birth date'],['height','výška','height'],['activity','pohyb přes den','daily activity'],['goal','cíl','goal']].filter(([k])=>k==='age'?!(p.birthDate||p.age):!p[k]).map(([,cs,en])=>uiText(cs,en));
  const sport=p.mainSport?uiText(MAIN_SPORT_OPTIONS.find(([v])=>v===p.mainSport)?.[1]||'',{cycling:'Cycling',running:'Running',triathlon:'Triathlon',strength:'Strength training',general:'General fitness'}[p.mainSport]||''):'';
  setSettingsSummary('profile',missing.length?uiText('Chybí: ','Missing: ')+missing.join(', '):uiText('Vyplněno','Complete')+(sport?' · '+sport:''));
}
{const css=document.createElement('style');css.textContent='.settings-list{display:grid;gap:10px}.settings-section{border:1px solid var(--line);border-radius:18px;background:var(--panel);overflow:hidden}.settings-section>summary{display:flex;align-items:center;gap:14px;padding:16px 18px;cursor:pointer;list-style:none}.settings-section>summary::-webkit-details-marker{display:none}.settings-section>summary::after{content:"";margin-left:auto;flex:none;width:9px;height:9px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(-45deg);transition:transform .2s}.settings-section[open]>summary::after{transform:rotate(45deg)}.settings-section>summary:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}.settings-icon{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--primary-surface);color:var(--primary-text)}.settings-icon .icon{width:20px;height:20px}.settings-label{display:grid;gap:2px;min-width:0}.settings-label strong{font-size:16px}.settings-label small{color:var(--muted);font-size:var(--fs-small);overflow-wrap:anywhere}.settings-body{display:grid;gap:12px;padding:0 14px 14px}.settings-body>.card{margin:0}.settings-body .grid2{margin:0}'+
  '.setup-card{width:min(560px,100%);display:grid;gap:16px}#setupBody{display:grid;gap:12px}#setupBody>*{margin:0}.setup-card h2{margin:0}.setup-progress{display:flex;gap:6px;margin:0;padding:0;list-style:none;flex-wrap:wrap}.setup-progress li{display:flex;align-items:center;gap:6px;font-size:var(--fs-small);color:var(--muted)}.setup-progress li+li::before{content:"";width:16px;height:1px;background:var(--line)}.setup-dot{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid var(--line);font-size:var(--fs-small)}.setup-progress li.current{color:var(--text);font-weight:600}.setup-progress li.current .setup-dot{background:var(--primary);border-color:var(--primary);color:var(--primary-ink)}.setup-progress li.done .setup-dot{background:var(--primary-surface);border-color:var(--primary-line);color:var(--primary-text)}'+
  '.btn.danger{color:color-mix(in srgb,var(--bad) 82%,var(--text));border-color:color-mix(in srgb,var(--bad) 45%,var(--line))}.btn.danger:hover{background:color-mix(in srgb,var(--bad) 12%,transparent)}'+
  '.service-list{display:grid;gap:10px}.service-card{border:1px solid var(--line);border-radius:14px;padding:14px;display:grid;gap:8px;background:color-mix(in srgb,var(--text) 3%,var(--panel))}.service-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.service-head h3{margin:0;font-size:16px}.service-card p{margin:0}.service-action{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.service-action .intervals-key-form{flex-basis:100%}.service-action .btn{text-decoration:none}.service-warning{color:var(--warn)}.intervals-key-form{display:grid;gap:8px;width:100%}.intervals-key-form .select-row{display:flex;gap:8px;flex-wrap:wrap}.intervals-key-form .food-input{flex:1;min-width:0}.key-steps{margin:0;padding-left:18px;display:grid;gap:4px}'+
  '.setup-form label small{display:block;margin-top:4px}.setup-actions{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.setup-actions .btn.primary:only-child{margin-left:auto}.setup-foot{display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:10px}.setup-target{padding:14px;border-radius:14px;background:var(--primary-surface)}.setup-target strong{display:block;font-size:28px;letter-spacing:-.03em;margin:2px 0 4px}.setup-target p{margin:0}.setup-services,.setup-next{margin:0;padding-left:0;list-style:none;display:grid;gap:6px}.setup-next{padding-left:18px;list-style:disc}';
  document.head.append(css);}
// #settings-connections (back from a provider's page) or #settings-profile opens that section.
{const m=location.hash.match(/^#settings-(\w+)$/);if(m)queueMicrotask(()=>openSettings(m[1]));}
async function logout(){forgetAccount();await fetch("/app/logout",{method:"POST",credentials:"same-origin"}).catch(()=>{});location.href="/app";}
function activate(view){if(!$(view)?.classList.contains('view'))return;try{localStorage.setItem('pfd-active-view',view);}catch{}document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===view));const title=document.querySelector('.navbtn[data-view="'+view+'"] span')?.textContent;if(title&&$('topTitle'))$('topTitle').textContent=title;window.scrollTo({top:0,behavior:'instant'});}
// Open coach proposals (the assistant's action cards read them).
async function loadInbox(){try{const r=await jsonFetch("/app/api/inbox");state.inbox=r.items||[];}catch{/* the cards stay as they are */}}
// Charts draw in a coordinate system as wide as they are on screen, so their
// labels keep their size on a phone instead of shrinking with the SVG.
// A chart drawn while its view is hidden has no width yet: the window decides.
function chartWidth(svg,max){const w=Math.round(svg?.getBoundingClientRect?.().width||0)||(typeof window!=='undefined'&&window.innerWidth?window.innerWidth-48:max);return Math.max(300,Math.min(max,w));}
function chartSvg(id,values,targets,labels,opts={}){
  const svg=$(id),W=opts.W||700,H=opts.H||250,padL=opts.axis?58:34,padR=20,padB=42,padT=28;
  const vals=values.map(v=>Number(v)).filter(Number.isFinite),tar=(targets||[]).map(v=>Number(v)).filter(Number.isFinite),all=vals.concat(tar);
  if(!all.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="color-mix(in srgb,var(--muted) 86%,var(--bg))">Bez dat</text>';return}
  let min=opts.min!=null?opts.min:Math.min(...all),max=opts.max!=null?opts.max:Math.max(...all);
  if(min===max){min-=1;max+=1}
  const x=i=>padL+(W-padL-padR)*(values.length<=1?.5:i/(values.length-1)),y=v=>H-padB-(H-padB-padT)*(v-min)/(max-min);
  let out='<line x1="'+padL+'" y1="'+(H-padB)+'" x2="'+(W-padR)+'" y2="'+(H-padB)+'" stroke="color-mix(in srgb,var(--cyan) 18%,var(--bg))"/>';
  if(opts.axis){for(let tick=0;tick<=4;tick++){const v=min+(max-min)*tick/4, yy=y(v);out+='<line x1="'+padL+'" y1="'+yy+'" x2="'+(W-padR)+'" y2="'+yy+'" stroke="color-mix(in srgb,var(--blue) 19%,var(--bg))"/><text x="'+(padL-8)+'" y="'+(yy+4)+'" text-anchor="end" fill="color-mix(in srgb,var(--muted) 89%,var(--bg))" font-size="10">'+fmt(v,opts.decimals??0)+(opts.unit||"")+'</text>';}}
  const pts=[];values.forEach((v,i)=>{if(Number.isFinite(Number(v))){pts.push(x(i)+","+y(Number(v)));out+='<circle cx="'+x(i)+'" cy="'+y(Number(v))+'" r="3" fill="#7c5cff"/>'}if(labels[i]&&(i===0||i===labels.length-1||i%Math.max(1,Math.ceil(labels.length/6))===0))out+='<text x="'+x(i)+'" y="'+(H-13)+'" text-anchor="middle" fill="color-mix(in srgb,var(--muted) 86%,var(--bg))" font-size="10">'+esc(labels[i])+'</text>'});
  if(pts.length>1)out+='<polyline points="'+pts.join(" ")+'" fill="none" stroke="#7c5cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  if(targets?.length){const p=targets.map((v,i)=>Number.isFinite(Number(v))?x(i)+","+y(Number(v)):null).filter(Boolean);if(p.length>1)out+='<polyline points="'+p.join(" ")+'" fill="none" stroke="#34d399" stroke-width="2" stroke-dasharray="6 5"/>'}
  svg.innerHTML=out
}
function barChart(id,values,targets,labels){const svg=$(id),W=700,H=250,pad=28,all=values.concat(targets||[]).map(num),max=Math.max(1,...all)*1.12,bw=(W-pad*2)/Math.max(1,values.length)*.58;let out="";values.forEach((v,i)=>{const x=pad+i*(W-pad*2)/Math.max(1,values.length)+(W-pad*2)/Math.max(1,values.length)*.21,h=num(v)/max*(H-55),ht=num(targets?.[i])/max*(H-55);out+='<rect x="'+x+'" y="'+(H-30-ht)+'" width="'+bw+'" height="'+ht+'" rx="4" fill="#34d399" opacity=".25"/><rect x="'+x+'" y="'+(H-30-h)+'" width="'+bw+'" height="'+h+'" rx="4" fill="#7c5cff"/><text x="'+(x+bw/2)+'" y="'+(H-9)+'" text-anchor="middle" fill="color-mix(in srgb,var(--muted) 86%,var(--bg))" font-size="10">'+esc(labels[i])+'</text>'});svg.innerHTML=out}
function primarySleepSessions(sessions){
  return (sessions||[])
    .filter(x=>num(x?.durationMin)>=180)
    .slice()
    // Nights from Intervals.icu have only a date (no bed or wake time).
    .sort((a,b)=>new Date(b?.endTime||b?.startTime||(b?.date?b.date+'T07:00:00':0))-new Date(a?.endTime||a?.startTime||(a?.date?a.date+'T07:00:00':0)));
}

// "How to start today" belongs to the morning, on the device's own clock (the user's time zone).
// When the athlete's nights reach the app, it waits for last night's sleep and shows from
// waking up until noon (at least 4 hours after a late wake-up); without sleep data 4:00–11:59.
function morningWindow(now=new Date(),sync=null){
  const noon=new Date(now);noon.setHours(12,0,0,0);
  if(sync?.tracked&&!sync.today)return false;
  if(sync?.today){const woke=sync.wokeAt?new Date(sync.wokeAt):null,valid=woke&&!isNaN(woke);
    if(valid&&woke>now)return false;
    const until=valid?Math.max(+noon,+woke+4*3600e3):+noon;return +now<until&&(valid||now.getHours()>=4);}
  const h=now.getHours();return h>=4&&h<12;
}
// Last night in detail on the morning card: stage timeline, heart rate with its
// spikes, HRV and the previous nights, loaded once per day.
const NIGHT_STAGES=[['AWAKE','Bdění','Awake','#ffc45c'],['REM','REM','REM','#b184ff'],['LIGHT','Lehký','Light','#66d4ff'],['DEEP','Hluboký','Deep','#7563ff']];
function nightWidth(){return window.innerWidth<640?Math.max(300,Math.min(560,window.innerWidth-56)):760;}
function nightClock(iso,m){return new Date(Date.parse(iso)+m*60000).toLocaleTimeString(uiText('cs-CZ','en-GB'),{hour:'2-digit',minute:'2-digit'});}
function clockLabel(min){const m=((Math.round(min)%1440)+1440)%1440;return Math.floor(m/60)+':'+String(m%60).padStart(2,'0');}
function loadNight(date){
  if(state.night?.date===date||state.nightLoading===date)return;
  state.nightLoading=date;
  jsonFetch('/app/api/night?date='+date).then(d=>{state.night={date,data:d};const el=$('morningNight');if(el)el.innerHTML=nightHtml(d);}).catch(()=>{state.night={date,data:null};}).finally(()=>{state.nightLoading=null;});
}
function nightChart(n){
  const total=Math.max(1,(Date.parse(n.end)-Date.parse(n.start))/60000),W=nightWidth(),L=W<640?58:64,R=12,T=4,laneH=16,gap=4;
  const x=m=>L+Math.max(0,Math.min(total,m))/total*(W-L-R),grid='color-mix(in srgb,var(--muted) 18%,var(--bg))',ink='color-mix(in srgb,var(--muted) 87%,var(--text))';
  let out='';const hypH=T+NIGHT_STAGES.length*(laneH+gap);
  NIGHT_STAGES.forEach(([k,cs,en,c],i)=>{
    const y=T+i*(laneH+gap);
    out+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+(y+laneH/2)+'" y2="'+(y+laneH/2)+'" stroke="'+grid+'"/><text x="'+(L-8)+'" y="'+(y+laneH/2+4)+'" font-size="12" text-anchor="end" fill="'+ink+'">'+uiText(cs,en)+'</text>';
    for(const s of (n.segments||[]).filter(s=>s.type===k)){const x0=x(s.s),w=Math.max(1.5,x(s.e)-x0-.5);out+='<rect x="'+x0+'" y="'+y+'" width="'+w+'" height="'+laneH+'" rx="2" fill="'+c+'"><title>'+esc(uiText(cs,en)+' '+nightClock(n.start,s.s)+'–'+nightClock(n.start,s.e)+' · '+(s.e-s.s)+' min')+'</title></rect>';}
  });
  let H=hypH+6;const hr=n.hr||[];
  if(hr.length>3){
    const top=hypH+18,h=84,lo=Math.floor(Math.min(...hr.map(b=>b.min??b.avg))/5)*5-2,hi=Math.ceil(Math.max(...hr.map(b=>b.max??b.avg))/5)*5+2,y=v=>top+(1-(v-lo)/(hi-lo))*h,avg=n.stats?.avgHr;
    // Lowest and highest value on the axis, the night's average as a dashed line.
    const bottom=Math.round(Math.min(...hr.map(b=>b.min??b.avg))),peak=Math.round(Math.max(...hr.map(b=>b.max??b.avg)));
    for(const v of [bottom,peak])out+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="'+grid+'"/><text x="'+(L-8)+'" y="'+(y(v)+4)+'" font-size="12" text-anchor="end" fill="'+ink+'">'+v+'</text>';
    if(avg!=null)out+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(avg)+'" y2="'+y(avg)+'" stroke="color-mix(in srgb,var(--text) 40%,var(--bg))" stroke-dasharray="4 4"/><text x="'+(W-R)+'" y="'+(y(avg)-5)+'" font-size="12" text-anchor="end" fill="'+ink+'">'+uiText('průměr ','avg ')+avg+'</text>';
    out+='<text x="'+(L-8)+'" y="'+(top+h/2+4)+'" font-size="12" text-anchor="end" fill="'+ink+'">bpm</text>';
    const pts=hr.filter(b=>b.min!=null&&b.max!=null);
    if(pts.length>1)out+='<polygon points="'+pts.map(b=>x(b.m+2.5)+','+y(b.max)).join(' ')+' '+pts.slice().reverse().map(b=>x(b.m+2.5)+','+y(b.min)).join(' ')+'" fill="#ff9b80" fill-opacity=".16"/>';
    out+='<polyline points="'+hr.map(b=>x(b.m+2.5)+','+y(b.avg)).join(' ')+'" fill="none" stroke="#ff9b80" stroke-width="2" stroke-linejoin="round"/>';
    for(const s of n.stats?.spikes||[])out+='<circle cx="'+x(s.m+2.5)+'" cy="'+y(s.max)+'" r="4" fill="#ff6478" stroke="var(--card,var(--bg))" stroke-width="2"><title>'+esc(uiText('Výkyv tepu ','Heart-rate spike ')+nightClock(n.start,s.m)+' · '+s.max+' bpm')+'</title></circle>';
    const low=n.stats?.lowHrAt;if(low!=null)out+='<circle cx="'+x(low+2.5)+'" cy="'+y(n.stats.lowHr)+'" r="4" fill="#3fda9c" stroke="var(--card,var(--bg))" stroke-width="2"><title>'+esc(uiText('Nejnižší tep ','Lowest heart rate ')+nightClock(n.start,low)+' · '+n.stats.lowHr+' bpm')+'</title></circle>';
    H=top+h+6;
  }
  // Full hours on the time axis.
  const first=Math.ceil(Date.parse(n.start)/3600000)*3600000;let ticks='';
  for(let t=first;t<Date.parse(n.end);t+=3600000){const m=(t-Date.parse(n.start))/60000;if(x(m)-x(0)<44||x(total)-x(m)<50)continue;ticks+='<line x1="'+x(m)+'" x2="'+x(m)+'" y1="'+T+'" y2="'+H+'" stroke="'+grid+'" stroke-dasharray="2 4"/><text x="'+x(m)+'" y="'+(H+14)+'" font-size="12" text-anchor="middle" fill="'+ink+'">'+nightClock(n.start,m).replace(/:00$/,'')+'</text>';}
  ticks+='<text x="'+L+'" y="'+(H+14)+'" font-size="12" fill="'+ink+'">'+nightClock(n.start,0)+'</text><text x="'+(W-R)+'" y="'+(H+14)+'" font-size="12" text-anchor="end" fill="'+ink+'">'+nightClock(n.start,total)+'</text>';
  const key=(hr.length>3?'<span><i style="background:#ff9b80"></i>'+uiText('Tep (5 min)','Heart rate (5 min)')+'</span>'+(n.stats?.spikes?.length?'<span><i style="background:#ff6478;border-radius:50%"></i>'+uiText('Výkyv tepu','Spike')+'</span>':'')+(n.stats?.lowHrAt!=null?'<span><i style="background:#3fda9c;border-radius:50%"></i>'+uiText('Nejnižší tep','Lowest')+'</span>':''):'');
  return '<div class="review-chart"><svg class="experience-chart" viewBox="0 0 '+W+' '+(H+20)+'" role="img" aria-label="'+uiText('Průběh noci: fáze spánku a tep','The night: sleep stages and heart rate')+'">'+ticks+out+'</svg><div class="review-key">'+key+'</div></div>';
}
function nightTiles(n){
  const s=n.stats||{},u=n.usual||{},tiles=[],ok='#3fda9c',warn='#ff9a4d',bad='#ff6478',dev=(a,b)=>a!=null&&b!=null?Math.round(a-b):null;
  const eff=n.inBedMin?Math.round(n.asleepMin/n.inBedMin*100):null;
  tiles.push([uiText('Spánek','Sleep'),hm(n.asleepMin),(u.asleepMin!=null?uiText('obvykle ','usual ')+hm(u.asleepMin):'')+(eff!=null?' · '+eff+' %':''),n.asleepMin<360?bad:u.asleepMin!=null&&n.asleepMin<u.asleepMin-45?warn:ok]);
  const bed=dev(n.bedClock,u.bedClock);
  tiles.push([uiText('Do postele','Bedtime'),clockLabel(n.bedClock),(s.latencyMin!=null?uiText('usnutí za ','asleep in ')+s.latencyMin+' min':'')+(bed!=null&&Math.abs(bed)>=30?' · '+uiText('o ','')+Math.abs(bed)+' min '+(bed>0?uiText('později','later'):uiText('dříve','earlier')):''),bed!=null&&bed>=60?warn:ok]);
  if(s.wakeups!=null)tiles.push([uiText('Probuzení','Wake-ups'),s.wakeups+'×',uiText('vzhůru ','awake ')+s.wasoMin+' min',s.wakeups>=5||s.wasoMin>=40?bad:s.wakeups>=3||s.wasoMin>=20?warn:ok]);
  for(const [k,cs,en] of [['DEEP','Hluboký','Deep'],['REM','REM','REM']]){const v=num(n.stages?.[k]),a=k==='DEEP'?u.deep:u.rem;if(measured(n.stages?.[k]))tiles.push([uiText(cs,en),hm(v),a!=null?uiText('obvykle ','usual ')+hm(a):'',a!=null&&v<a*.75?warn:ok]);}
  if(s.lowHr!=null)tiles.push([uiText('Nejnižší tep','Lowest HR'),s.lowHr+' bpm',nightClock(n.start,s.lowHrAt)+(s.avgHr!=null?uiText(' · průměr ',' · avg ')+s.avgHr:''),ok]);
  if(s.spikes)tiles.push([uiText('Výkyvy tepu','HR spikes'),s.spikes.length+'×',uiText('o 15+ bpm nad průměr','15+ bpm above avg'),s.spikes.length>=6?bad:s.spikes.length>=3?warn:ok]);
  if(s.hrv!=null)tiles.push([uiText('HRV v noci','Night HRV'),s.hrv+' ms',s.hrvLow+'–'+s.hrvHigh+' ms',ok]);
  return '<div class="rating-signals">'+tiles.map(([l,v,sub,c])=>'<div class="rating-tile"><span class="label">'+l+'</span><b class="ink" style="--c:'+c+'">'+esc(v)+'</b><small>'+esc(sub)+'</small></div>').join('')+'</div>';
}
// The previous nights side by side, today last: how much the nights swing.
function nightHistory(n,history){
  const rows=[...(history||[])].reverse().concat([{date:null,asleepMin:n.asleepMin,stages:n.stages,today:true}]);if(rows.length<3)return '';
  const W=nightWidth(),L=W<640?58:64,R=12,T=20,h=64,max=Math.max(...rows.map(r=>num(r.asleepMin)),480),bw=(W-L-R)/rows.length,y=v=>T+(1-v/max)*h;
  const ink='color-mix(in srgb,var(--muted) 87%,var(--text))',avg=rows.filter(r=>!r.today).reduce((s,r)=>s+num(r.asleepMin),0)/Math.max(1,rows.length-1);
  let out='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(avg)+'" y2="'+y(avg)+'" stroke="color-mix(in srgb,var(--text) 45%,var(--bg))" stroke-dasharray="4 4"/><text x="'+(L-8)+'" y="'+(y(avg)+4)+'" font-size="12" text-anchor="end" fill="'+ink+'">'+uiText('průměr','avg')+'</text>';
  rows.forEach((r,i)=>{
    let top=T+h;const x0=L+i*bw+bw*.18,w=bw*.64,parts=[...NIGHT_STAGES].reverse().filter(([k])=>k!=='AWAKE');
    const staged=parts.some(([k])=>measured(r.stages?.[k]));
    if(staged)for(const [k,cs,en,c] of parts){const v=num(r.stages?.[k]);if(!v)continue;const hh=v/max*h;top-=hh;out+='<rect x="'+x0+'" y="'+(top+1)+'" width="'+w+'" height="'+Math.max(1,hh-2)+'" rx="2" fill="'+c+'"'+(r.today?'':' fill-opacity=".55"')+'><title>'+esc((r.today?uiText('Dnešní noc','Last night'):dateLabel(r.date))+' · '+uiText(cs,en)+' '+hm(v))+'</title></rect>';}
    else out+='<rect x="'+x0+'" y="'+y(num(r.asleepMin))+'" width="'+w+'" height="'+(num(r.asleepMin)/max*h)+'" rx="2" fill="#66d4ff" fill-opacity="'+(r.today?1:.55)+'"/>';
    out+='<text x="'+(x0+w/2)+'" y="'+(T+h+16)+'" font-size="12" text-anchor="middle" fill="'+(r.today?'var(--text)':ink)+'">'+(r.today?uiText('Dnes','Today'):W<640?Number(String(r.date).slice(8))+'.':dateLabel(r.date))+'</text><text x="'+(x0+w/2)+'" y="'+(y(num(r.asleepMin))-4)+'" font-size="12" text-anchor="middle" fill="'+ink+'">'+clockLabel(num(r.asleepMin))+'</text>';
  });
  return '<div class="label night-label">'+uiText('Poslední noci','Recent nights')+'</div><div class="review-chart"><svg class="experience-chart" viewBox="0 0 '+W+' '+(T+h+22)+'" role="img" aria-label="'+uiText('Délka spánku v posledních nocích','Sleep length over recent nights')+'">'+out+'</svg></div>';
}
// One sentence on what disturbed the night, with the times.
function nightNote(n){
  const s=n.stats||{},spikes=[...(s.spikes||[])].sort((a,b)=>b.max-a.max).slice(0,3).sort((a,b)=>a.m-b.m),parts=[];
  if(s.wakeups>=3)parts.push(uiText(s.wakeups+'× probuzení (celkem '+s.wasoMin+' min vzhůru)',s.wakeups+' wake-ups ('+s.wasoMin+' min awake in total)'));
  if(spikes.length)parts.push(uiText('tep vyskočil v ','heart rate jumped at ')+spikes.map(x=>nightClock(n.start,x.m)).join(', ')+' (max '+Math.max(...spikes.map(x=>x.max))+' bpm)');
  if(!parts.length)return '<p class="night-note">'+uiText('Klidná noc bez větších výkyvů tepu a probouzení.','A calm night without bigger heart-rate swings or wake-ups.')+'</p>';
  const text=parts.join('; ');return '<p class="night-note">'+esc(text.charAt(0).toUpperCase()+text.slice(1))+'.</p>';
}
function nightHtml(d){
  const n=d?.night;if(!n||!(n.segments?.length||n.hr?.length))return '';
  return '<div class="label night-label">'+uiText('Průběh noci','The night')+'</div>'+nightChart(n)+nightNote(n)+nightTiles(n)+nightHistory(n,d.history);
}
function renderCoachCouncil(){
  const council=state.coaches||{},cards=[...(council.coaches||[]),...(council.reviews||[])];
  const p=$("coachPriorities"),c=$("coachCards");if(!p||!c)return;
  let summary=$('morningSummary');if(!summary){p.insertAdjacentHTML('beforebegin','<div id="morningSummary" class="morning-summary"></div>');summary=$('morningSummary');}
  const morning=council.morningSummary&&morningWindow(new Date(),council.morningSummary.sleepSync)&&selectedHistoryDate===localToday()?council.morningSummary:null;summary.hidden=!morning;summary.innerHTML=morning?'<div class="eyebrow">DNEŠNÍ PŘIPRAVENOST</div><h3>'+esc(morning.headline)+'</h3><p>'+esc(morning.text)+'</p><strong>'+esc(morning.recommendation)+'</strong><div id="morningNight" class="morning-night" data-no-i18n data-raw>'+(state.night?.date===morning.date?nightHtml(state.night.data):'')+'</div>':'';
  if(morning&&morning.sleepSync?.today)loadNight(morning.date);
  // A priority that only repeats a card's headline and first line is left to the card.
  const heads=cards.map(x=>String(x.headline||'')).filter(Boolean),priorities=(council.priorities||[]).filter(x=>!heads.some(h=>String(x).startsWith(h)));
  p.hidden=!priorities.length;p.innerHTML=priorities.length?'<div class="eyebrow">KOORDINÁTOR · DNEŠNÍ PRIORITY</div><ol class="coach-actions">'+priorities.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ol>':'';
  c.onclick=e=>{const b=e.target.closest('[data-add-recovery]');if(b)chooseRecoveryDay(b.dataset);};
  c.innerHTML=withRatings(cards,(state.reflections?.[selectedHistoryDate]||[]).filter(r=>!r.date||r.date===selectedHistoryDate),selectedHistoryDate).map(x=>x.rating?ratingCard(x):x.sections||x.chart||x.sets?rideReviewCard(x):'<article class="coach-card '+esc(x.status||'')+'"><div class="eyebrow">'+esc(x.title)+'</div><h3>'+esc(x.headline)+'</h3><ul class="coach-actions">'+(x.actions||[]).map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>'+((x.analysis||[]).length?'<div class="coach-analysis">'+x.analysis.map(a=>'<div><strong>'+esc(a.label)+'</strong><p>'+esc(a.text)+'</p></div>').join('')+'</div>':'')+((x.resources||[]).length?'<div class="small" style="margin-top:8px">'+x.resources.filter(r=>/^https:\/\//.test(String(r.url||''))).map(r=>'<a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">'+esc(r.label||'Otevřít postup')+'</a>').join('<br>')+'</div>':'')+'</article>').join('');
}

// The athlete's own rating of a session (RPE, note) and the coach's answer sit
// inside that session's "Po tréninku" card, for any day shown. A note saved from
// Today starts with the session name; otherwise a day with one review gets it.
function withRatings(cards,reflections,date=null){
  const out=[...cards],reviews=cards.filter(x=>x.sections||x.chart||x.sets);
  for(const r of reflections.filter(r=>r.text||r.rpe!=null)){
    const notes=String(r.notes||''),own=reviews.find(x=>x.headline&&notes.startsWith(x.headline+': '))||(reviews.length===1?reviews[0]:null);
    const note=own&&notes.startsWith(own.headline+': ')?notes.slice(own.headline.length+2):notes;
    const rated={rating:true,sport:own?(/Kolo|Bike/.test(own.title||'')?'ride':/Běh|Run/.test(own.title||'')?'run':/Posilovna|Gym/.test(own.title||'')?'gym':null):null,name:own?.headline||null,rpe:r.rpe,note,text:r.text,ai:r.source==='ai',date:r.date||date};
    const at=own?out.indexOf(own):-1;if(at>=0)out[at]={...own,rated};else out.push(rated);
  }
  return out;
}
function ratingBody(x){
  const rpe=Number(x.rpe),has=x.rpe!=null&&rpe>=1&&rpe<=10;
  const gauge=has?'<div class="rpe-gauge" role="img" aria-label="RPE '+fmt(rpe,1)+' / 10"><div class="rpe-cells">'+Array.from({length:10},(_,k)=>'<i class="'+(k<Math.round(rpe)?'on':'')+'" style="--c:'+rpeColor(k+1)+'"></i>').join('')+'</div><span class="rpe-word"><b class="ink" style="--c:'+rpeColor(rpe)+'">RPE '+fmt(rpe,Number.isInteger(rpe)?0:1)+'</b> · '+rpeWord(rpe)+'</span></div>':'';
  const note=x.note?'<blockquote class="rating-note" data-no-i18n>'+esc(x.note)+'</blockquote>':'';
  return gauge+note+ratingSignals(x.date)+(x.text?coachAdvice(x.text,x.ai):'')+(x.date&&x.date>=dateShift(localToday(),-1)?'<div class="rating-actions"><button type="button" class="btn" data-add-recovery data-date="'+esc(x.date)+'" data-sport="'+esc(x.sport||'')+'" data-focus="'+esc(x.name||'')+'" data-note="'+esc(x.note||'')+'">🧘 '+uiText('Přidat protažení do plánu','Add stretching to the plan')+'</button></div>':'')+'';
}
// A rating whose session has no review card stands on its own.
function ratingCard(x){
  return '<article class="coach-card review rating"><div class="eyebrow">'+uiText('Po tréninku','After the session')+'</div><h3 data-no-i18n>'+esc(x.name||uiText('Trénink','Session'))+'</h3>'+ratingBody(x)+'</article>';
}
function rpeColor(v){return v<=3?'#3fda9c':v<=5?'#9ad46a':v<=7?'#ffc274':v<=8?'#ff9a4d':'#ff6478';}
function rpeWord(v){return v<=2?uiText('velmi lehké','very easy'):v<=4?uiText('lehké','easy'):v<=6?uiText('střední','moderate'):v<=8?uiText('těžké','hard'):v<9.5?uiText('velmi těžké','very hard'):uiText('maximální','maximal');}
// The day's recovery signals beside the rating: sleep, HRV and form against the athlete's own previous week.
function ratingSignals(date){
  if(!date)return '';
  const nights=primarySleepSessions(state.sleep?.sessions),day=s=>s.date||String(s.endTime||'').slice(0,10),night=nights.find(s=>day(s)===date);
  const before=nights.filter(s=>day(s)<date).slice(0,7).map(s=>num(s.durationMin)),avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  const rows=(state.fitness?.wellness||[]).filter(r=>r.id<=date),today=rows.find(r=>r.id===date)||{},week=rows.filter(r=>r.id<date).slice(-7).map(r=>num(r.hrv)).filter(v=>v>0);
  const tsb=today.tsb!=null?num(today.tsb):today.ctl!=null&&today.atl!=null?num(today.ctl)-num(today.atl):null,tiles=[];
  if(night){const m=num(night.durationMin),a=avg(before),low=m<390||a!=null&&m<a-45;tiles.push([uiText('Spánek','Sleep'),hm(m),a!=null?uiText('průměr ','avg ')+hm(a):'',low?'#ff9a4d':'#3fda9c']);}
  if(num(today.hrv)>0){const a=avg(week),low=a!=null&&num(today.hrv)<a*.85;tiles.push(['HRV',Math.round(num(today.hrv))+' ms',a!=null?uiText('průměr ','avg ')+Math.round(a)+' ms':'',low?'#ff6478':'#3fda9c']);}
  if(tsb!=null)tiles.push([uiText('Forma','Form'),String(Math.round(tsb)).replace('-','−'),'TSB · '+(tsb<-20?uiText('vysoká únava','high fatigue'):tsb<-10?uiText('únava','fatigued'):tsb>5?uiText('odpočatý','fresh'):uiText('v rovnováze','balanced')),tsb<-20?'#ff6478':tsb<-10?'#ff9a4d':'#3fda9c']);
  return tiles.length?'<div class="rating-signals">'+tiles.map(([l,v,s,c])=>'<div class="rating-tile"><span class="label">'+l+'</span><b class="ink" style="--c:'+c+'">'+esc(v)+'</b><small>'+esc(s)+'</small></div>').join('')+'</div>':'';
}
// The coach's answer as a lead sentence and short points with an icon each;
// tomorrow's advice and a health warning stand out at the end.
function coachAdvice(text,ai){
  const parts=String(text).split(/(?<=[.!?])\s+|;\s+/).map(t=>t.trim()).filter(Boolean).map(t=>t[0].toUpperCase()+t.slice(1));
  const strong=t=>esc(t).replace(/(\d+\s?h\s\d+\s?min|[−-]?\d+(?:[.,]\d+)?(?:\s?(?:%|ms|TSS|h|min|g|kcal|W|km|bpm)\b)?)/g,'<b>$1</b>');
  const icon=t=>/HRV|tep|puls|heart/i.test(t)?'❤️':/spal|spánek|spánk|sleep/i.test(t)?'😴':/TSB|únav|fatigue|form/i.test(t)?'🔋':/sacharid|jídl|tekutin|carb|fluid|eat/i.test(t)?'🍝':/křeč|cramp/i.test(t)?'⚡':/RPE|interval|sprint|tempo|úsek/i.test(t)?'🚴':'•';
  const tomorrow=parts.filter(t=>/^(zítra|tomorrow)|\bzítra\b|\btomorrow\b/i.test(t)),warn=parts.filter(t=>!tomorrow.includes(t)&&/odborník|lékař|bolí|bolest|doctor|pain/i.test(t));
  const recover=parts.filter(t=>!tomorrow.includes(t)&&!warn.includes(t)&&/saun|vířiv|plav|protaž|protahov|mobilit|válc|jóg|dech|relax|masáž|masážn|sprch|ledov|kompres|nohy nahoru|zdřímn|stretch|sauna|hot tub|swim|foam roll|yoga|breath|massage|shower|ice bath|compression|legs up|nap\b/i.test(t)),rest=parts.filter(t=>!tomorrow.includes(t)&&!warn.includes(t)&&!recover.includes(t));
  const lead=rest.shift();
  return '<div class="coach-advice" data-no-i18n><small class="coach-by">'+esc(ai?'AI':uiText('Doporučení','Advice'))+'</small>'+(lead?'<p class="advice-lead">'+strong(lead)+'</p>':'')+(rest.length?'<ul class="advice-points">'+rest.map(t=>'<li><span class="advice-icon" aria-hidden="true">'+icon(t)+'</span><span>'+strong(t)+'</span></li>').join('')+'</ul>':'')+
    tomorrow.map(t=>'<div class="advice-call next"><span aria-hidden="true">📅</span><span>'+strong(t)+'</span></div>').join('')+recover.map(t=>'<div class="advice-call recover"><span aria-hidden="true">'+(/saun|vířiv|hot tub/i.test(t)?'♨️':/plav|swim/i.test(t)?'🏊':/ledov|studen|sprch|ice|cold|shower/i.test(t)?'🧊':/masáž|masážn|válc|massage|foam/i.test(t)?'💆':/zdřímn|spán|nap\b|sleep/i.test(t)?'😴':/kompres|nohy nahoru|compression|legs up/i.test(t)?'🦵':'🧘')+'</span><span>'+strong(t)+'</span></div>').join('')+warn.map(t=>'<div class="advice-call warn"><span aria-hidden="true">⚠️</span><span>'+strong(t)+'</span></div>').join('')+'</div>';
}
// Stretching sessions added from the coach's note: a Today item with the moves.
async function loadRecovery(){
  try{const r=await jsonFetch('/app/api/recovery?from='+dateShift(localToday(),-14)+'&to='+dateShift(localToday(),14));state.recovery=r.sessions||[];renderToday();if(state.hubWeek)renderWeekHub();}catch{}
}
function chooseRecoveryDay(d){
  const days=[...new Set([d.date,localToday(),dateShift(localToday(),1)])].filter(x=>x>=localToday()).sort();
  openSheet(uiText('Protažení do plánu','Stretching to the plan'),'<p class="small">'+uiText('Sestava na partie, které dnes pracovaly (asi 10 minut). Kam ji dát?','A routine for the muscles that worked today (about 10 minutes). Which day?')+'</p><div class="sheet-days">'+days.map(x=>'<button type="button" class="btn" data-recovery-day="'+x+'"><b>'+(x===localToday()?uiText('Dnes','Today'):x===dateShift(localToday(),1)?uiText('Zítra','Tomorrow'):esc(dateLabel(x)))+'</b>'+esc(dateLabel(x))+'</button>').join('')+'</div>',body=>body.addEventListener('click',async e=>{const b=e.target.closest('[data-recovery-day]');if(!b)return;b.disabled=true;
    try{const r=await jsonFetch('/app/api/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:b.dataset.recoveryDay,sport:d.sport||null,focus:d.focus||'',note:d.note||''})});state.recovery=[...(state.recovery||[]).filter(x=>!(x.date===r.session.date&&x.kind===r.session.kind&&!x.done)),r.session];closeSheet();renderToday();if(state.hubWeek)renderWeekHub();toast(uiText('🧘 Protažení je v plánu na ','🧘 Stretching added for ')+dateLabel(r.session.date)+'.');}
    catch(error){toast(error.message);b.disabled=false;}}));
}
function openRecoverySheet(id){
  const r=(state.recovery||[]).find(x=>x.id===id);if(!r)return;
  openSheet(r.title+' · '+r.minutes+' min','<ol class="recovery-list" data-no-i18n>'+r.items.map(i=>'<li><div><strong>'+esc(i.name)+'</strong><span class="recovery-dose">'+esc(i.dose)+'</span></div><small>'+esc(i.cue)+'</small></li>').join('')+'</ol><p class="small">'+uiText('Pomalu, s klidným dechem, do mírného tahu, ne do bolesti.','Slowly, breathing calmly, to a mild pull, never into pain.')+'</p><div class="workout-filter-actions"><button type="button" class="btn primary" data-recovery-done>'+(r.done?uiText('Vrátit jako nehotové','Mark as not done'):uiText('✓ Hotovo','✓ Done'))+'</button><button type="button" class="btn" data-recovery-remove>'+uiText('Odebrat z plánu','Remove from the plan')+'</button></div>',body=>body.addEventListener('click',async e=>{
    const done=e.target.closest('[data-recovery-done]'),remove=e.target.closest('[data-recovery-remove]');if(!done&&!remove)return;
    try{await jsonFetch('/app/api/recovery',{method:remove?'DELETE':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,done:!r.done})});
      state.recovery=remove?state.recovery.filter(x=>x.id!==id):state.recovery.map(x=>x.id===id?{...x,done:!r.done}:x);closeSheet();renderToday();if(state.hubWeek)renderWeekHub();}
    catch(error){toast(error.message);}}));
}
// A ride review: verdict, plan vs. reality per step, the main set as a table,
// then what went well, what to do better and load with recovery. The texts come
// from the server already in the app language.
function rideReviewCard(x){
  const table=x.table?.rows?.length?'<div class="review-table-wrap"><table class="review-table"><thead><tr>'+x.table.columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+x.table.rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'';
  const sections=(x.sections||[]).map(s=>'<div class="review-sec '+esc(s.kind||'')+'"><strong>'+esc(s.label)+'</strong><ul>'+(s.items||[]).map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul></div>').join('');
  return '<article class="coach-card review '+esc(x.status||'')+'"><div class="eyebrow">'+esc(x.title)+'</div><h3>'+esc(x.headline)+'</h3><div data-no-i18n data-raw>'+(x.verdict?'<p class="review-verdict">'+esc(x.verdict)+'</p>':'')+((x.actions||[]).length?'<p class="small">'+x.actions.map(esc).join(' ')+'</p>':'')+'</div>'+rideReviewChart(x.chart)+gymSetsChart(x.sets)+'<div data-no-i18n data-raw>'+table+(x.target?'<p class="small review-target">'+esc(x.target)+'</p>':'')+sections+'</div>'+(x.rated?'<div class="review-rating"><div class="label">'+uiText('Tvoje hodnocení a AI','Your rating and the coach')+'</div>'+ratingBody(x.rated)+'</div>':'')+'</article>';
}
// Every set of a finished gym session as a chip, coloured against the planned rep range.
function gymSetsChart(list){
  if(!(list||[]).length)return '';
  const has=k=>list.some(e=>e.sets.some(x=>x.status===k)),key=[['in','V rozsahu'],['under','Pod rozsahem'],['over','Nad rozsahem'],['missing','Neodcvičeno']].filter(([k])=>has(k)).map(([k,l])=>'<span><i class="chip-key '+k+'"></i>'+l+'</span>').join('');
  return '<div class="set-grid" data-no-i18n data-raw>'+list.map(e=>'<div class="set-row"><span class="set-name">'+esc(e.name)+'</span><span class="set-chips">'+e.sets.map(x=>'<span class="set-chip '+esc(x.status)+'">'+esc(x.label)+'</span>').join('')+'</span></div>').join('')+'</div><div class="review-key">'+key+'</div>';
}
function rideReviewChart(c){
  const steps=c?.steps||[];if(!steps.length||!(c.ftp>0))return '';
  let t=0;const xs=steps.map(s=>{const start=Number.isFinite(s.start)?s.start:t;t=start+(s.seconds||0);return {...s,x0:start,x1:t};});
  const total=Math.max(1,...xs.map(s=>s.x1)),caps=xs.filter(s=>s.role!=='sprint').flatMap(s=>[s.hi,s.watts]).filter(Number.isFinite);
  const {ticks}=niceTicks(0,Math.max(c.ftp*1.25,...caps)*1.08,4),top=ticks.at(-1),W=window.innerWidth<640?420:760,H=window.innerWidth<640?200:220,L=48,R=12,T=16,B=30;
  const x=v=>L+v/total*(W-L-R),y=v=>T+(1-Math.min(v,top)/top)*(H-T-B),base=y(0);
  const color={in:'var(--green)',over:'var(--amber)',under:'var(--sky)'};
  let out=ticks.map(v=>'<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="color-mix(in srgb,var(--muted) 18%,var(--bg))"/><text x="'+(L-8)+'" y="'+(y(v)+4)+'" font-size="12" text-anchor="end" fill="color-mix(in srgb,var(--muted) 87%,var(--text))">'+v+(c.unit==='%'?' %':'')+'</text>').join('');
  for(const s of xs){
    const x0=x(s.x0)+.5,w=Math.max(1.5,x(s.x1)-x(s.x0)-1),fill=s.missing?'none':color[s.status]||'var(--violet)';
    if(Number.isFinite(s.lo)&&s.role!=='sprint')out+='<rect x="'+x0+'" y="'+y(s.hi)+'" width="'+w+'" height="'+Math.max(2,y(s.lo)-y(s.hi))+'" fill="color-mix(in srgb,var(--text) 9%,transparent)" stroke="color-mix(in srgb,var(--text) 45%,var(--bg))" stroke-dasharray="3 3"/>';
    if(s.missing)out+='<rect x="'+x0+'" y="'+y(s.hi||0)+'" width="'+w+'" height="'+Math.max(2,base-y(s.hi||0))+'" fill="none" stroke="color-mix(in srgb,var(--muted) 70%,var(--bg))" stroke-dasharray="2 4"><title>'+esc(s.tip||'')+'</title></rect>';
    else if(Number.isFinite(s.watts)){out+='<rect class="review-bar" x="'+x0+'" y="'+y(s.watts)+'" width="'+w+'" height="'+Math.max(1,base-y(s.watts))+'" rx="1.5" fill="'+fill+'" fill-opacity=".72"><title>'+esc(s.tip||'')+'</title></rect>';if(s.watts>top)out+='<text x="'+(x0+w/2)+'" y="'+(T-3)+'" font-size="11" text-anchor="middle" fill="color-mix(in srgb,var(--text) 80%,var(--bg))">'+s.watts+'</text>';}
  }
  out+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(c.ftp)+'" y2="'+y(c.ftp)+'" stroke="color-mix(in srgb,var(--text) 55%,var(--bg))" stroke-dasharray="6 4"/><text x="'+(W-R)+'" y="'+(y(c.ftp)-5)+'" font-size="12" text-anchor="end" fill="color-mix(in srgb,var(--text) 75%,var(--bg))">'+esc(c.refLabel||'FTP '+c.ftp+' W')+'</text>';
  out+='<text x="'+L+'" y="'+(H-8)+'" font-size="12" fill="color-mix(in srgb,var(--muted) 87%,var(--text))">0 min</text><text x="'+(W-R)+'" y="'+(H-8)+'" font-size="12" text-anchor="end" fill="color-mix(in srgb,var(--muted) 87%,var(--text))">'+Math.round(total/60)+' min</text>';
  const key=[['in','V pásmu'],['over','Nad pásmem'],['under','Pod pásmem']].filter(([k])=>xs.some(s=>s.status===k)).map(([k,l])=>'<span><i style="background:'+color[k]+'"></i>'+l+'</span>').join('')+(xs.some(s=>s.role==='sprint')?'<span><i style="background:var(--violet)"></i>Sprint</span>':'')+'<span><i class="band"></i>Cílové pásmo</span>'+(xs.some(s=>s.missing)?'<span><i class="gap"></i>Chybí</span>':'');
  return '<div class="review-chart"><svg class="experience-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Plán a skutečnost po úsecích">'+out+'</svg><div class="review-key">'+key+'</div></div>';
}

function renderOverview(){
  const d=state.daily||{},f=d.nutrition?.foodLog?.totals||{},target=d.nutrition||{};
  $("overviewDate").textContent=longDate(selectedHistoryDate);
  const completed=(d.training?.completed||[]).filter(x=>!isNutritionItem(x));
  const planned=(d.training?.planned||[]).filter(x=>!isNutritionItem(x));
  const sleepSessions=primarySleepSessions(state.sleep?.sessions).filter(s=>(s.date||String(s.endTime||'').slice(0,10))<=selectedHistoryDate);
  const lastSleep=sleepSessions[0];
  const sleepRecovery=sleepIndex;
  const recovery30=sleepSessions.slice(1,31).map(sleepRecovery).filter(Number.isFinite),avgRecovery=recovery30.length?recovery30.reduce((a,b)=>a+b,0)/recovery30.length:null,lastRecovery=sleepRecovery(lastSleep);
  // Every Denní signály chip compares the big number above it and says against what.
  const sleep30=sleepSessions.slice(1,31).map(s=>Number(s.durationMin)).filter(v=>Number.isFinite(v)&&v>0),avgSleepMin=sleep30.length?sleep30.reduce((a,b)=>a+b,0)/sleep30.length:null;
  $("oSleep").innerHTML=lastSleep?hm(lastSleep.durationMin)+deltaChip(Math.round(num(lastSleep.durationMin)-avgSleepMin),avgSleepMin!=null,' min',uiText(' proti 30 dnům',' vs 30 days')):"—";
  $("oSleepMeta").textContent=lastRecovery==null?uiText("Skóre spánku zatím nemám","No sleep score yet"):uiText("Skóre spánku ","Sleep score ")+lastRecovery+'/100';
  const plannedLoad=planned.reduce((sum,x)=>sum+num(x.tss),0),actualLoad=completed.reduce((sum,x)=>sum+num(x.tss),0),loadPct=Math.min(100,Math.round((actualLoad||plannedLoad||0)/1.8));
  const recoveryTone=lastRecovery==null?"#60a5fa":lastRecovery>=67?"#35c48b":lastRecovery>=40?"#e9b44c":"#ef6b73",recoveryWord=lastRecovery==null?"Čekám na data":lastRecovery>=67?"Dobrá připravenost":lastRecovery>=40?"Střední připravenost":"Dnes opatrně";
  $("readinessOrb").style.setProperty("--orb-value",lastRecovery??0);$("readinessOrb").style.setProperty("--orb-color",recoveryTone);$("readinessScore").textContent=lastRecovery??"—";$("readinessTitle").textContent=recoveryWord;$("readinessCaption").textContent=lastRecovery==null?"spánek nedostupný":'vs 30 dní '+(avgRecovery==null?"—":(lastRecovery-avgRecovery>=0?"+":"")+fmt(lastRecovery-avgRecovery,1)+" bodu");
  $("readinessInsight").textContent=lastRecovery==null?"Po načtení spánku vyhodnotím připravenost pro dnešní trénink.":lastRecovery>=67?"Spánek a regenerace dávají prostor držet plánovanou kvalitu. Trénink přizpůsob konkrétní únavě ve svalech.":"Regenerace není na plný plyn. Drž kvalitu, ale sniž objem nebo intenzitu, pokud se necítíš svěže.";
  const dial=(label,value,color)=>'<div class="dial"><div class="dial-ring" style="--dial-value:'+value+';--dial-color:'+color+'"><strong>'+value+'</strong></div><label>'+label+'</label></div>';
  $("readinessDials").innerHTML=dial("Zátěž",loadPct,"#a78bfa")+dial("Form",Math.round(Math.max(0,Math.min(100,50+num(state.fitness?.wellness?.slice(-1)[0]?.tsb)*3))),"#f59e0b");
  $("readinessFocus").textContent=planned.length?"Dnešní priorita · "+(planned[0].name||"Plánovaná aktivita"):completed.length?"Dnešní priorita · regenerace po aktivitě":"Dnešní priorita · výživa a regenerace";
  const calTarget=Number(target.calorieTarget||d.calories?.target||0);
  const score=nutritionScore({kcal:f.kcal,protein_g:f.protein_g,carbs_g:f.carbs_g,fat_g:f.fat_g},{calorieTarget:calTarget,macros:{protein:target.macros?.protein_g??target.macros?.proteinGrams,carbs:target.macros?.carbs_g??target.macros?.carbsGrams,fat:target.macros?.fat_g??target.macros?.fatGrams}});
  $("oFood").textContent=fmt(f.kcal)+" / "+fmt(calTarget)+" kcal";
  $("oFoodNote").innerHTML=(score==null?"Zatím bez záznamu":scoreBadge(score,"Výživa"));
  const m=macroTargetsOf({daily:{nutrition:{macros:target.macros}}});
  $("oMacros").innerHTML='<div class="macro-line"><b class="ink" style="--c:#60a5fa">P</b><span>'+fmt(f.protein_g)+' / '+fmt(m.protein)+' g</span></div><div class="macro-line"><b class="ink" style="--c:#f59e0b">C</b><span>'+fmt(f.carbs_g)+' / '+fmt(m.carbs)+' g</span></div><div class="macro-line"><b class="ink" style="--c:#a78bfa">F</b><span>'+fmt(f.fat_g)+' / '+fmt(m.fat)+' g</span></div>';
  const days=state.week?.days||[];
  const fw=(state.fitness?.wellness||[]).filter(r=>r.id<=selectedHistoryDate),latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};
  // Fitness and form come only from Intervals.icu; without it the cards say so.
  const weekAgo=uiText(' za 7 dní',' in 7 days');
  const ownLoad=serviceConnected('intervals');
  $("oFitness").innerHTML=ownLoad?(measured(latest.ctl)?fmt(latest.ctl):"—")+(measured(latest.ctl)&&measured(prev.ctl)?deltaChip(fmt(latest.ctl-prev.ctl,1),true,'',weekAgo):''):"—";
  $("oForm").innerHTML=ownLoad?formText(latest.tsb)+(measured(latest.tsb)&&measured(prev.tsb)?deltaChip(fmt(latest.tsb-prev.tsb,1),true,'',weekAgo):''):"—";
  const wr=(d.weight?.records||[]).filter(x=>x.value_numeric!=null&&String(x.sample_time).slice(0,10)<=selectedHistoryDate).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time)));
  const currentW=wr.length?Number(wr[wr.length-1].value_numeric):selectedHistoryDate===localToday()?Number(d.weight?.current):NaN;
  const startW=wr[0];
  const weightDelta=Number.isFinite(currentW)&&startW?currentW-num(startW.value_numeric):null;
  const weightTrend=weightDelta==null?"":deltaChip(fmt(weightDelta,1),true,' kg',uiText(' od začátku',' since start'),true);
  // Without a target weight in the profile there is no goal line.
  const targetW=Number(d.nutrition?.targetWeightKg)||null,remainingW=targetW&&Number.isFinite(currentW)?currentW-targetW:null; $("oWeight").innerHTML=Number.isFinite(currentW)?fmt(currentW,1)+" kg"+weightTrend:"—"; const lastWeighed=wr.length?String(wr[wr.length-1].sample_time).slice(0,10):null; $("oWeightMeta").textContent=targetW?uiText("Cíl ","Goal ")+fmt(targetW,1)+" kg"+(Number.isFinite(remainingW)?uiText(" · zbývá "," · ")+fmt(Math.max(0,remainingW),1)+uiText(" kg"," kg to go"):""):lastWeighed?uiText("Váženo ","Weighed ")+dateFormat({day:"numeric",month:"numeric"}).format(new Date(lastWeighed+"T12:00:00Z")):Number.isFinite(currentW)?uiText("Aktuální váha","Current weight"):uiText("Bez vážení","No weigh-in");
  macroChart("calChart",days);
  renderMealDiary();
}
// Round axis ticks (steps of 1, 2 or 5 × 10ⁿ): 40 / 60 / 80 instead of 40,2 / 80,4.
// With extend the range grows to the nearest ticks, so the outer lines frame the chart.
function niceTicks(lo,hi,count,extend=false){
  const raw=(hi-lo)/count||1,p=10**Math.floor(Math.log10(raw)),e=raw/p,step=(e<1.5?1:e<3?2:e<7?5:10)*p,eps=1e-9,ticks=[];
  const first=extend?Math.floor(lo/step+eps):Math.ceil(lo/step-eps),last=extend?Math.ceil(hi/step-eps):Math.floor(hi/step+eps);
  for(let k=first;k<=last;k++)ticks.push(Number((k*step).toPrecision(12)));
  return {ticks,digits:step<1?Math.ceil(-Math.log10(step)-eps):0};
}
function renderPmcChart(){
  const box=$('pmcRange'),range=num(box.dataset?.value??box.value,14),rows=(state.fitness?.wellness||[]).filter(r=>r.id>=dateShift(localToday(),1-range)&&r.id<=localToday()),svg=$('pmcChart'),W=chartWidth(svg,1000),H=W<600?300:420,L=W<600?44:72,R=30,T=48,B=40;
  svg.setAttribute?.('viewBox','0 0 '+W+' '+H);if(svg.style)svg.style.height=H+'px';
  box.onclick=e=>{const b=e.target.closest?.('button[data-value]');if(!b)return;box.dataset.value=b.dataset.value;box.querySelectorAll('button').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderPmcChart();};
  const series=[[uiText('Kondice','Fitness'),'ctl','#3b82f6'],[uiText('Únava','Fatigue'),'atl','#ef6b73'],[uiText('Forma','Form'),'tsb','#35c48b']],values=rows.flatMap(r=>series.map(s=>r[s[1]]).filter(measured).map(Number));
  if(!values.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="color-mix(in srgb,var(--muted) 89%,var(--bg))">Bez dat v tomto období</text>';return}
  const vmin=Math.min(0,...values),axis=niceTicks(vmin,Math.max(vmin+10,...values),W<600?4:5,true),lo=axis.ticks[0],hi=axis.ticks.at(-1),x=date=>L+(W-L-R)*(new Date(date+'T12:00:00Z')-new Date(dateShift(localToday(),1-range)+'T12:00:00Z'))/((range-1)*86400000),y=v=>H-B-(H-T-B)*(v-lo)/(hi-lo);
  let out='';for(const v of axis.ticks){const yy=y(v);out+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'" stroke="color-mix(in srgb,var(--cyan) 22%,var(--bg))"/><text x="'+(L-12)+'" y="'+(yy+5)+'" text-anchor="end" fill="color-mix(in srgb,var(--muted) 86%,var(--text))" font-size="15">'+fmt(v)+'</text>'}
  out+='<line x1="'+L+'" x2="'+L+'" y1="'+T+'" y2="'+(H-B)+'" stroke="color-mix(in srgb,var(--cyan) 18%,var(--bg))"/><text x="12" y="25" fill="color-mix(in srgb,var(--muted) 86%,var(--text))" font-size="13">Zátěž</text>';
  // Dates stay horizontal: every n-th day, counted back from the last one, so labels never overlap.
  const perDay=(W-L-R)/Math.max(1,range-1),step=[1,2,3,7,14,30].find(n=>n*perDay>=58)||30;for(let i=range-1;i>=0;i-=step){const date=dateShift(localToday(),i+1-range),xx=x(date);out+='<line x1="'+xx+'" x2="'+xx+'" y1="'+T+'" y2="'+(H-B)+'" stroke="color-mix(in srgb,var(--cyan) 18%,var(--bg))"/><text x="'+xx+'" y="'+(H-B+24)+'" text-anchor="middle" fill="color-mix(in srgb,var(--muted) 86%,var(--text))" font-size="13">'+esc(dateLabel(date))+'</text>'}
  series.forEach(([name,key,color],i)=>{let segment=[];const flush=()=>{if(segment.length>1)out+='<polyline points="'+segment.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3"/>';segment=[]};rows.forEach((r,j)=>{if(j&&dateShift(rows[j-1].id,1)!==r.id)flush();if(!measured(r[key])){flush();return}const xx=x(r.id),yy=y(Number(r[key]));segment.push(xx+','+yy);out+='<circle cx="'+xx+'" cy="'+yy+'" r="3" fill="'+color+'"><title>'+esc(dateLabel(r.id)+' · '+name+': '+fmt(r[key],1))+'</title></circle>'});flush();out+='<text x="'+(Math.max(L,70)+i*Math.min(150,(W-Math.max(L,70))/3))+'" y="25" class="ink" style="--c:'+color+'" font-size="16">'+name+'</text>'});svg.innerHTML=out;
}

function renderTraining(){
  const days=state.week?.days||[],fw=(state.fitness?.wellness||[]).filter(r=>r.id<=selectedHistoryDate);
  $("trainingRange").textContent="Týden "+isoWeek(weekStart)+" · "+dateLabel(weekStart)+" – "+dateLabel(dateShift(weekStart,6));
  populateWeekSelectors("trainingWeekSelect",null,days);
  const selected=days.find(x=>x.date===selectedHistoryDate)||days.find(x=>x.date===localToday())||days[0];
  const latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};
  $("tFitness").innerHTML=(measured(latest.ctl)?fmt(latest.ctl):"—")+trendArrow(latest.ctl,prev.ctl,false,"");
  $("tFatigue").innerHTML=(measured(latest.atl)?fmt(latest.atl):"—")+trendArrow(latest.atl,prev.atl,true,"");
  $("tForm").innerHTML=formText(latest.tsb)+trendArrow(latest.tsb,prev.tsb,false,"");
  $("tRamp").innerHTML=(Number.isFinite(Number(latest.rampRate))?fmt(latest.rampRate,1):"—")+trendArrow(latest.rampRate,prev.rampRate,false,"");
  renderPmcChart();
  const form=num(latest.tsb),ramp=num(latest.rampRate);
  $("pmcInsight").textContent=!Number.isFinite(form)?"Bez aktuálních wellness dat.":form<0?"Form je záporný: zátěž je vyšší než dlouhodobá připravenost. Zaměř se na regeneraci a nepřidávej další intenzitu bez důvodu.":ramp>5?"Fitness roste rychleji. Sleduj kumulovanou únavu; další zvyšování objemu má smysl jen při stabilní regeneraci.":"Kondice a forma jsou v relativně stabilním pásmu. Pokračuj podle plánu a sleduj vývoj TSB.";
  const tssDays=days.map(x=>{const p=[...(x.daily?.training?.planned||[]),...(x.daily?.training?.matched||[]).map(m=>m.planned)].filter(z=>!isNutritionItem(z)),a=(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z));return {date:x.date,planned:p.reduce((s,z)=>s+num(z.tss),0),actual:a.reduce((s,z)=>s+num(z.tss),0)};});
  barChart("tssChart",tssDays.map(x=>x.actual),tssDays.map(x=>x.planned),tssDays.map(x=>dateLabel(x.date)));
  const totalP=tssDays.reduce((s,x)=>s+x.planned,0),totalA=tssDays.reduce((s,x)=>s+x.actual,0);
  $("tssInsight").innerHTML=(totalP?scoreBadge(Math.min(100,Math.round(totalA/totalP*100)),"Splněno"):"Bez plánované zátěže")+" · skutečnost "+fmt(totalA)+" TSS, plán "+fmt(totalP)+" TSS. <span class=\"muted\">TSS vyjadřuje kombinaci délky a intenzity. Sloupce ukazují každý den; důležitá je kumulace týdne, ne přesné trefení jediného dne.</span>";
  const load=fw.slice(-42); chartSvg("loadChart",load.map(x=>num(x.atlLoad||x.ctlLoad||0)),[],load.map(x=>dateLabel(String(x.id||"").slice(0,10))),{W:1000,H:250});
  const totalHours=days.reduce((s,x)=>s+(x.daily?.training?.completed||[]).reduce((a,z)=>a+num(z.durationHours),0),0);
  $("trainingSummary").innerHTML='<div class="metric-line"><span>Fitness</span><strong>'+fmt(latest.ctl)+trendArrow(latest.ctl,prev.ctl,false,"")+'</strong></div><div class="metric-line"><span>Fatigue</span><strong>'+fmt(latest.atl)+trendArrow(latest.atl,prev.atl,true,"")+'</strong></div><div class="metric-line"><span>Form</span><strong>'+fmt(latest.tsb)+trendArrow(latest.tsb,prev.tsb,false,"")+'</strong></div><div class="metric-line"><span>TSS skutečnost / plán</span><strong>'+fmt(totalA)+' / '+fmt(totalP)+'</strong></div><div class="metric-line"><span>Čas tento týden</span><strong>'+fmt(totalHours,1)+' h</strong></div>';
  const selectedActs=(selected?.daily?.training?.completed||[]).filter(x=>!isNutritionItem(x));
  $("trainingActivityTable").innerHTML='<div class="notice" style="margin-bottom:8px">Vybraný den: <strong>'+esc(selected?longDate(selected.date):"—")+'</strong></div>'+(selectedActs.length?'<div class="scroll"><table><thead><tr><th>Aktivita</th><th>Typ</th><th>TSS</th><th>Délka</th><th>Dokončení</th></tr></thead><tbody>'+selectedActs.map(x=>{const p=(selected?.daily?.training?.planned||[]).find(z=>!isNutritionItem(z)&&(String(x.pairedEventId||"")===String(z.id||"")||String(z.name||"").toLowerCase().slice(0,12)===String(x.name||"").toLowerCase().slice(0,12)));const ratio=p&&num(p.tss)>0?Math.round(num(x.tss)/num(p.tss)*100):(p&&num(p.durationHours)>0?Math.round(num(x.durationHours)/num(p.durationHours)*100):100);return '<tr><td>'+esc(x.name||x.type||"Aktivita")+'</td><td>'+esc(x.type||"")+'</td><td>'+fmt(x.tss)+'</td><td>'+fmt(x.durationHours,1)+' h</td><td>'+scoreBadge(ratio)+'</td></tr>'}).join("")+'</tbody></table></div>':'<div class="muted">Vybraný den nemá dokončenou aktivitu.</div>');
}
function renderNutrition(){
  const days=state.week?.days||[];
  $("nutritionRange").textContent="Týden "+isoWeek(weekStart)+" · "+dateLabel(weekStart)+" – "+dateLabel(dateShift(weekStart,6));
  populateWeekSelectors("nutritionWeekSelect",null,days);
  const today=days.find(x=>x.date===selectedHistoryDate)||days[days.length-1];
  $("nutritionReason").textContent=today?.daily?.nutrition?.reason||"Denní cíl se adaptuje podle tréninku, hmotnosti a cíle.";
  const tn=today?.daily?.nutrition||{},cb=tn.calorieBreakdown||{},targetCal=num(tn.calorieTarget||today?.daily?.calories?.target),trainingCal=Math.max(0,num(cb.activityAdjustment)),restTarget=Math.max(0,targetCal-trainingCal),burn=today?.daily?.burned||{};
  $("nutritionTargetSummary").innerHTML=uiText('<strong>Dnešní cíl: ', '<strong>Today\'s goal: ')+fmt(targetCal)+uiText(' kcal</strong> · klidový cíl ', ' kcal</strong> · resting goal ')+fmt(restTarget)+' kcal + '+fmt(trainingCal)+uiText(' kcal z tréninku.<br><strong>Výdej dnes: ', ' kcal from training.<br><strong>Burned today: ')+fmt(burn.total)+' kcal</strong> · '+fmt(burn.activity)+uiText(' kcal z evidovaných aktivit (chůze, gym i cyklistika). <span class="muted">', ' kcal from recorded activities (walking, gym and cycling). <span class="muted">')+(burn.source==="observed"?"Celkový denní výdej je z naměřených dat.":"Celkový denní výdej je průběžný odhad.")+'</span>';  $("nutritionDays").innerHTML=days.map(x=>{
    const t=num(x.daily?.calories?.target),e=num(x.food?.totals?.kcal),m=macroTargetsOf(x);
    const p=num(x.food?.totals?.protein_g),c=num(x.food?.totals?.carbs_g),f=num(x.food?.totals?.fat_g);
    const score=nutritionScore({kcal:e,protein_g:p,carbs_g:c,fat_g:f},{calorieTarget:t,macros:m});
    return '<div class="day '+(x.date===localToday()?"today":"")+'"><div class="dayhead">'+esc(dayTitle(x.date))+' '+(score==null?'<span class="pill">Bez záznamu</span>':scoreBadge(score))+'</div><div class="value day-kcal">'+fmt(e)+' / '+fmt(t)+' <small>kcal</small></div><div class="bar"><i style="width:'+Math.min(100,t?e/t*100:0)+'%"></i></div><div class="macro-lines"><div class="macro-line"><b class="ink" style="--c:#60a5fa">Protein</b><span>'+fmt(p)+' / '+fmt(m.protein)+' g</span></div><div class="macro-line"><b class="ink" style="--c:#f59e0b">Sacharidy</b><span>'+fmt(c)+' / '+fmt(m.carbs)+' g</span></div><div class="macro-line"><b class="ink" style="--c:#a78bfa">Tuky</b><span>'+fmt(f)+' / '+fmt(m.fat)+' g</span></div></div></div>';
  }).join("");
  macroChart("nutritionChart",days);

  const selected=today;
  const allMealGroups=selected?.recommendations?.mealRecommendations||[];
  const nextMeal=COOKBOOK_SHOWN?allMealGroups[0]:null;
  const stores=selected?.recommendations?.storeAlternatives||[];
  const selectedMacros=macroTargetsOf(selected||{});
  const selectedFood=selected?.food?.totals||{};
  const remKcal=Math.max(0,targetCal-num(selectedFood.kcal));
  const rem={protein_g:Math.max(0,num(selectedMacros.protein)-num(selectedFood.protein_g)),carbs_g:Math.max(0,num(selectedMacros.carbs)-num(selectedFood.carbs_g)),fat_g:Math.max(0,num(selectedMacros.fat)-num(selectedFood.fat_g))};
  const nextRide=days.slice(days.findIndex(x=>x.date===selected?.date)+1).flatMap(x=>x.daily?.training?.planned||[]).find(x=>/ride|cycling|bike|endurance|threshold|sweet spot|tempo/i.test(String(x.name||"")+" "+String(x.type||"")));
  const nextRideNote=nextRide?'Zítra/nejbližší den máš '+esc(nextRide.name||"cyklistický trénink")+(nextRide.durationHours?' ('+fmt(nextRide.durationHours,1)+' h)':'')+' — sacharidy nech hlavně na jídlo před a během jízdy.':'Další evidované kolo není v plánu; sacharidy rozděl podle hladu a běžné aktivity.';
  const coaching=trainingCal>100?"Dnešní cíl už zahrnuje započtený trénink.":nextRideNote;
  const fallback='<div style="margin-top:12px"><h3 style="margin-bottom:6px">Nejbližší jídlo</h3><div class="foodrow"><div><strong>'+ (rem.protein_g>=30?'Jídlo s 30–45 g bílkovin':'Vyvážené běžné jídlo') +'</strong><div class="small">'+(rem.carbs_g>=60?'Přidej zdroj sacharidů podle zbývajících '+fmt(rem.carbs_g)+' g; ':'')+(rem.fat_g>=15?'tuk doplň běžnou porcí, ne celým cílem najednou.':'')+'</div></div><div class="right">'+fmt(remKcal)+' kcal zbývá</div></div></div>';
  $("foodPlan").innerHTML=selected?uiText('<div class="reason"><strong>Zbývá ', '<div class="reason"><strong>Left: ')+fmt(remKcal)+' kcal</strong> · P '+fmt(rem.protein_g)+' g · C '+fmt(rem.carbs_g)+' g · F '+fmt(rem.fat_g)+' g<br>'+esc(coaching)+'</div>'+
    (nextMeal?'<div class="next-meal"><h3>'+esc(nextMeal.label)+uiText(' · z kuchařky</h3>', ' · from the cookbook</h3>')+
      (nextMeal.recommendations?.length?nextMeal.recommendations.slice(0,3).map(r=>'<div class="foodrow"><div><strong>'+esc(r.title||r.name||"Jídlo")+'</strong><div class="small">'+esc(r.recommendation_reason||"")+'</div><div class="small">1 porce · '+fmt(r.kcal||r.calories)+' kcal · P '+fmt(r.protein_g)+' · C '+fmt(r.carbs_g)+' · F '+fmt(r.fat_g)+'</div></div><div class="right">'+fmt(r.kcal||r.calories)+' kcal</div></div>').join(""):'<div class="muted">Pro tuto část dne nemám vhodný recept.</div>')+'</div>':(COOKBOOK_SHOWN?'<div class="muted">Dnešní jídla jsou zapsaná nebo už je po jejich obvyklém čase.</div>':''))+
    (nextMeal?'':fallback)+
    (stores.length?'<div class="next-meal"><h3>Rychle z běžných potravin</h3>'+stores.slice(0,2).map(r=>'<div class="foodrow"><div><strong>'+esc(r.name)+'</strong><div class="small">'+esc(r.reason||"")+' · P '+fmt(r.protein_g)+' g · C '+fmt(r.carbs_g)+' g</div></div><div class="right">'+fmt(r.kcal)+' kcal</div></div>').join("")+'</div>':''):'—';

  const nr=state.nutrition?.records||[];
  const selectedFoods=nr.filter(x=>String(x.startTime||"").slice(0,10)===String(selected?.date||""));
  $("nutritionInfo").textContent=selectedFoods.length+" záznamů z Google Health pro "+(selected?.date||"vybraný den");
  $("nutritionRows").innerHTML=layeredHistory(nr,x=>x.startTime,x=>'<div class="history-workout"><strong>'+esc(x.foodDisplayName||"Jídlo")+' · '+fmt(x.kcal)+' kcal</strong><div class="small">'+esc(x.startTime?new Date(x.startTime).toLocaleString("cs-CZ"):"—")+' · '+esc(x.mealType||"—")+' · P '+fmt(x.protein_g,1)+' g · C '+fmt(x.carbs_g,1)+' g · F '+fmt(x.fat_g,1)+' g</div></div>');
}
function renderRecovery(){
  const ss=primarySleepSessions(state.sleep?.sessions).filter(s=>(s.date||String(s.endTime||'').slice(0,10))<=selectedHistoryDate),last=ss[0],range=Number($("sleepRange")?.value||30);
  const filtered=ss.filter(x=>{const t=new Date(x.endTime||x.startTime||(x.date?x.date+'T07:00:00':0)).getTime();return range>=3000||t>=Date.now()-range*86400000;});
  $("rLast").textContent=last?hm(last.durationMin):"—";
  $("rLastMeta").textContent=last?(last.startTime?new Date(last.startTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"")+" → "+(last.endTime?new Date(last.endTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):""):"";
  const avg=filtered.length?filtered.reduce((a,x)=>a+num(x.durationMin),0)/filtered.length:0;
  $("rAvg").textContent=avg?hm(avg):"—";
  $("rAvgLabel").textContent=range>=3000?"all time":range===365?"poslední rok":range===180?"posledních 6 měsíců":range===30?"poslední měsíc":"posledních 7 dní";
  const sleepScore=sleepIndex(last);
  const baselineRows=ss.filter(x=>new Date(x.endTime||x.startTime||(x.date?x.date+'T07:00:00':0)).getTime()>=Date.now()-30*86400000),baselineScores=baselineRows.map(sleepIndex).filter(v=>v!=null),baseline=baselineScores.length?baselineScores.reduce((a,v)=>a+v,0)/baselineScores.length:null,delta=sleepScore!=null&&baseline!=null?Math.round(sleepScore-baseline):null,restorative=num(last?.stages?.DEEP)+num(last?.stages?.REM),sleepWord=sleepScore==null?"Čekám na spánek":sleepScore>=85?"Silná regenerace":sleepScore>=65?"Použitelná regenerace":"Regenerace pod tlakem";
  $("rRestorative").textContent=last?hm(restorative):"—";
  $("recoveryOrb").style.setProperty("--orb-value",sleepScore??0);$("recoveryOrb").style.setProperty("--orb-color",sleepScore>=85?"#35c48b":sleepScore>=65?"#e9b44c":"#ef6b73");$("recoveryScore").textContent=sleepScore??"—";$("recoveryTitle").textContent=sleepWord;$("recoveryVsBaseline").textContent=delta==null?"čekám na 30denní baseline":"vs. 30 dní "+(delta>=0?"+":"")+delta+" bodů";$("recoverySignal").textContent=last?"Spánek · poslední noc":"Bez aktuálního záznamu";$("recoveryInsight").textContent=last?(delta!=null&&delta>=0?"Dnešní spánek je nad tvou osobní normou. Drž plán, ale respektuj lokální únavu nohou.":"Dnešní spánek je pod osobní normou. Kvalitu můžeš držet, ale objem uprav podle pocitu."):"Po načtení spánku vyhodnotím připravenost proti vlastnímu trendu.";$("recoveryGuide").textContent=sleepScore==null?"Doplň data":sleepScore>=85?"Kvalita může zůstat":sleepScore>=65?"Drž plán s rezervou":"Sniž objem";$("recoveryGuideMeta").textContent=sleepScore==null?"bez poslední noci":sleepScore>=85?"dnes není potřeba kompenzovat únavu":sleepScore>=65?"nechoď zbytečně do selhání":"priorita je spánek a lehká aktivita";
  $("sleepScore").innerHTML=sleepScore!=null?scoreBadge(sleepScore,"Kvalita"):'<span class="muted">Bez dat</span>';
  chartSvg("sleepChart",filtered.slice().reverse().map(x=>num(x.durationMin)/60),[],filtered.slice().reverse().map(x=>dateLabel(x.date)),{W:700,H:250,axis:true,unit:" h",decimals:1,min:range===7?4:undefined});
  $("sleepTrendMeta").textContent=filtered.length?"Průměr "+hm(avg)+" · "+filtered.length+" nocí · cíl není dokonalé číslo, ale stabilní osobní trend.":"Bez dostatečné historie.";
  const selected=last;
  if(selected){
    const total=Object.values(selected.stages||{}).reduce((a,b)=>a+num(b),0)||1;
    $("sleepStages").innerHTML='<div class="metric-line"><span>Deep</span><strong>'+hm(selected.stages?.DEEP)+'</strong></div><div class="sleep-stage"><i class="stage-deep" style="width:'+num(selected.stages?.DEEP)/total*100+'%"></i></div><div class="metric-line"><span>REM</span><strong>'+hm(selected.stages?.REM)+'</strong></div><div class="sleep-stage"><i class="stage-rem" style="width:'+num(selected.stages?.REM)/total*100+'%"></i></div><div class="metric-line"><span>Light</span><strong>'+hm(selected.stages?.LIGHT)+'</strong></div><div class="sleep-stage"><i class="stage-light" style="width:'+num(selected.stages?.LIGHT)/total*100+'%"></i></div><div class="metric-line"><span>Awake</span><strong>'+hm(selected.stages?.AWAKE)+'</strong></div><div class="sleep-stage"><i class="stage-awake" style="width:'+num(selected.stages?.AWAKE)/total*100+'%"></i></div>';
   } else { $("sleepStages").innerHTML='<div class="muted">Bez dat.</div>'; }
  $("sleepRows").innerHTML=layeredHistory(ss,x=>x.date||x.endTime,x=>'<div class="history-workout"><strong>'+esc(dayTitle(x.date||String(x.endTime).slice(0,10)))+' · '+hm(x.durationMin)+'</strong><div class="small">'+esc(x.startTime?new Date(x.startTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"—")+' → '+esc(x.endTime?new Date(x.endTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"—")+' · Deep '+hm(x.stages?.DEEP)+' · REM '+hm(x.stages?.REM)+'</div></div>');
}
function layeredHistory(records,dateOf,rowOf){
  const years={};(records||[]).forEach(r=>{const date=String(dateOf(r)||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;const y=date.slice(0,4),m=date.slice(0,7);(((years[y]||(years[y]={}))[m]||(years[y][m]=[]))).push(r);});
  return Object.keys(years).sort().reverse().map(y=>'<details '+(y===localToday().slice(0,4)?"open":"")+'><summary>'+y+'</summary>'+Object.keys(years[y]).sort().reverse().map(m=>'<details><summary>'+capFirst(dateFormat({month:"long",year:"numeric"}).format(new Date(m+"-01T12:00:00Z")))+'</summary><div class="history-sets">'+years[y][m].sort((a,b)=>String(dateOf(b)).localeCompare(String(dateOf(a)))).map(rowOf).join("")+'</div></details>').join("")+'</details>').join("")||'<div class="muted">Bez historie.</div>';
}
function renderHealth(){
  const w=state.weight||{},weightDisplay=v=>Number.isFinite(Number(v))&&Number(v)>0?fmt(v,1):"—",historical=(w.records||[]).filter(x=>String(x.sample_time||'').slice(0,10)<=selectedHistoryDate).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time))),lastWeight=historical.at(-1),mean=days=>{const values=historical.filter(x=>String(x.sample_time).slice(0,10)>=dateShift(selectedHistoryDate,-days+1)).map(x=>Number(x.value_numeric)).filter(x=>Number.isFinite(x)&&x>0);return values.length?values.reduce((s,x)=>s+x,0)/values.length:null;};
  $("hWeight").textContent=weightDisplay(lastWeight?.value_numeric);$("hAvg30").textContent=weightDisplay(mean(30));const latest=num(lastWeight?.value_numeric),avg7=num(mean(7)),avg30=num(mean(30)),diff=latest&&avg30?fmt(latest-avg30,1):null;$("weightSignal").textContent=diff==null?"bez baseline":(diff>=0?"+":"")+diff+" kg vs. 30 dní";
  const wr=(w.records||[]).filter(x=>num(x.value_numeric)>0&&/^\d{4}-\d{2}-\d{2}/.test(String(x.sample_time||""))).slice(-365);
  chartSvg("healthWeightChart",wr.map(x=>num(x.value_numeric)),[],wr.map(x=>dateLabel(String(x.sample_time).slice(0,10))),{W:760,H:300,axis:true,unit:" kg",decimals:1});
  $("weightTrendMeta").textContent=historical.length?"K "+dateLabel(selectedHistoryDate)+" "+weightDisplay(lastWeight?.value_numeric)+" kg · 7 dní "+weightDisplay(avg7)+" kg · 30 dní "+weightDisplay(avg30)+" kg.":"Bez záznamů hmotnosti.";
  const sessions=primarySleepSessions(state.sleep?.sessions).filter(s=>(s.date||String(s.endTime||'').slice(0,10))<=selectedHistoryDate),last=sessions[0],activityCount=state.activities?.count||0;$("healthContext").innerHTML='<div class="metric-line"><span>Hmotnost vs. 30 dní</span><strong>'+esc(diff==null?"—":(diff>=0?"+":"")+diff+" kg")+'</strong></div><div class="metric-line"><span>Poslední noc</span><strong>'+esc(last?hm(last.durationMin):"—")+'</strong></div><div class="metric-line"><span>Záznamy aktivit</span><strong>'+esc(activityCount)+'</strong></div><div class="notice" style="margin-top:12px">Trend hmotnosti a spánku je kontext pro rozhodnutí o zátěži; jednotlivý den není verdikt.</div>';
  $("weightHistory").innerHTML=layeredHistory(wr,x=>x.sample_time,x=>'<div class="history-workout"><strong>'+esc(dayTitle(String(x.sample_time).slice(0,10)))+'</strong><div class="small">'+fmt(x.value_numeric,1)+' kg · '+esc(x.source_family||"zdroj")+'</div></div>');
}
let gymSaveQueue=Promise.resolve();
let gymExerciseCatalog=[],visibleGymExercises=[],gymExerciseIndex=0;
function gymRowValues(tr){const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]),idx=Number(tr.dataset.row)+7;if(!values[idx])values[idx]=[];tr.querySelectorAll("input[data-col]").forEach(inp=>{const c=Number(inp.dataset.col);values[idx][c]=inp.type==="checkbox"?(inp.checked?"TRUE":"FALSE"):inp.value;});upgradeGymOptionsHeader(values);if(gymRowDone(values[idx]))values[idx][11]=gymNumber(values[idx][7])===10?'TRUE':'FALSE';return {values,idx};}
function persistGymRow(tr){
  clearTimeout(tr._saveTimer);const {values,idx}=gymRowValues(tr),row=values[idx].slice(),date=gymDay();
  state.gym={...state.gym,values};
  gymSaveQueue=gymSaveQueue.catch(()=>{}).then(async()=>{
    const current=(state.gym?.date===date||gymDay()===date?state.gym.values:values).map(r=>r.slice());current[idx]=row;upgradeGymOptionsHeader(current);
    const result=await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:current.slice(7),fullValues:current,date})});
    if(gymDay()!==date)return;
    // A save response must not replace the focused field or newer pending edits.
    state.gym={...state.gym,history:result.history||state.gym?.history||[]};renderGymHistory(state.gym.history);
    $('gymNotice').textContent='✓ Uloženo do Gym historie · '+new Date().toLocaleTimeString('cs-CZ');
  });return gymSaveQueue.catch(e=>{$('gymNotice').textContent='Uložení selhalo: '+e.message;throw e;});
}
function renderGymHistory(history){$("gymHistory").innerHTML=layeredHistory(history,x=>x.workout_date||x.date||x.started_at,x=>'<div class="history-workout"><strong>'+esc(x.exercise||"Cvik")+'</strong><div class="small">'+esc(String(x.actual_kg??x.actualKg??x.weightKg??"—"))+' kg × '+esc(String(x.actual_reps??x.actualReps??x.reps??"—"))+'</div>'+(x.toFailure?'<span class="gym-set-badge">Do selhání</span>':'')+(x.superset?'<span class="gym-set-badge">Supersérie '+esc(x.superset)+'</span>':'')+'</div>');}
function gymPlanEdit(action,idx,item){
  const target=(state.gym?.values||[])[idx+7];
  if((action==='remove-set'&&gymRowDone(target)||action==='remove-exercise'&&(state.gym?.values||[]).slice(7).some(r=>r[1]===target?.[1]&&gymRowDone(r)))&&!confirm('Odebrat i uložené série? Zmizí také z historie.'))return;
  return editGymPlan(rows=>{const row=rows[idx];
    if(action==='remove-set')return row?{rows:rows.filter(r=>r!==row)}:null;
    if(action==='add-set')return row?addGymSet(rows,row[1]):null;
    if(action==='remove-exercise')return row?{rows:rows.filter(r=>r[1]!==row[1])}:null;
    if(action==='add-exercise')return addGymExercise(rows,item);
    if(action==='swap')return row?swapGymExercise(rows,row[1],item):null;
    return null;
  }).then(edit=>{if(edit&&action==='add-exercise')toast('Cvik přidán do plánu.');if(edit&&action==='swap')toast('Cvik vyměněn.');}).catch(e=>toast("Úprava plánu selhala: "+e.message));
}
// Replacements for an exercise of the table: same muscle, possible in the gym.
async function openGymSwapSheet(idx){
  const name=(state.gym?.values||[])[idx+7]?.[1];if(!name)return;
  const sheet=openSheet('Vyměnit '+name,'<p class="small">Hledám náhrady pro stejnou partii…</p>');
  try{const r=await jsonFetch('/app/api/gym/alternatives?date='+gymDay()+'&exercise='+encodeURIComponent(name)),list=r.alternatives||[];
    if(!sheetStill(sheet))return;
    const done=(state.gym?.values||[]).slice(7).filter(x=>x[1]===name),allDone=done.length&&done.every(gymRowDone);
    $('sheetBody').innerHTML=(allDone?'<p class="small">Všechny série jsou uložené: výměna opraví název cviku i v historii, váhy a opakování zůstanou.</p>':'<p class="small">Uložené série zůstanou, vymění se jen zbývající.</p>')+(list.length?'<div class="gm-alt-list">'+list.map((a,i)=>'<button type="button" class="gm-alt" data-alt="'+i+'"><strong>'+esc(a.name)+'</strong><small>'+esc(a.muscle)+' · '+esc(a.reps)+' op.'+(a.kg!=null?' · '+fmt(a.kg,1)+' kg':'')+(a.station?' · '+esc(a.station):'')+'</small></button>').join('')+'</div>':'<p>Pro tuto partii tu není jiný cvik.</p>');
    $('sheetBody').onclick=e=>{const b=e.target.closest('[data-alt]');if(!b)return;closeSheet();gymPlanEdit('swap',idx,list[Number(b.dataset.alt)]);};
  }catch(error){$('sheetBody').innerHTML='<p>'+esc(error.message)+'</p>';}
}
function renderGymExerciseChoices(){
  const query=$('gymExerciseSearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs').trim(),words=query.split(/\s+/).filter(Boolean),existing=new Set((state.gym?.values||[]).slice(7).map(row=>String(row?.[1]||'')));
  const recent=new Set((state.gym?.history||[]).slice(0,100).map(row=>String(row.exercise||'')));
  visibleGymExercises=gymExerciseCatalog.filter(item=>!existing.has(item.name)&&words.every(word=>[item.name,item.muscle,item.search].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs').includes(word))).sort((a,b)=>Number(recent.has(b.name))-Number(recent.has(a.name))||a.name.localeCompare(b.name,'cs')).slice(0,40);
  gymExerciseIndex=Math.min(gymExerciseIndex,Math.max(0,visibleGymExercises.length-1));
  $('gymExerciseResults').innerHTML=visibleGymExercises.map((item,i)=>'<button type="button" role="option" id="gymExerciseOption'+i+'" aria-selected="'+(i===gymExerciseIndex)+'" data-index="'+i+'" title="'+esc(item.note)+'"><strong>'+esc(item.name)+'</strong><small>'+esc(item.muscle)+' · '+esc(item.sets)+' × '+esc(item.reps)+(item.station?' · '+esc(item.station):'')+'</small></button>').join('');
  $('gymExerciseHint').textContent=visibleGymExercises.length?visibleGymExercises.length+uiText(' cviků k výběru · podle tvého vybavení.', ' exercises to choose from · based on your equipment.'):'Žádný další cvik v katalogu neodpovídá hledání.';
  $('gymExerciseSearch').setAttribute('aria-activedescendant',visibleGymExercises.length?'gymExerciseOption'+gymExerciseIndex:'');
}
async function openGymExercisePicker(){
  // Also from workout mode or Today, where the gym tab around it is hidden.
  const dialog=$('gymExerciseDialog');if(dialog.parentElement!==document.body)document.body.appendChild(dialog);$('gymExerciseSearch').value='';$('gymExerciseResults').innerHTML='';$('gymExerciseHint').textContent='Načítám katalog cviků…';dialog.showModal();$('gymExerciseSearch').focus();
  try{gymExerciseCatalog=(await jsonFetch('/app/api/gym/exercises')).exercises||[];gymExerciseIndex=0;renderGymExerciseChoices();}
  catch(error){$('gymExerciseHint').textContent='Katalog cviků se nepodařilo načíst: '+error.message;}
}
// The coach's estimated load for exercises without a weight (own history, a
// similar exercise, or the catalogue's starting load).
async function gymEstimates(names){if(!names.length)return {};try{return (await jsonFetch('/app/api/gym/estimate?names='+encodeURIComponent(JSON.stringify(names)))).estimates||{};}catch{return {};}}
async function chooseGymExercise(index){const found=visibleGymExercises[index];if(!found)return;const pick=state.gymPick;state.gymPick=null;$('gymExerciseDialog').close();const item={...found,kg:(await gymEstimates([found.name]))[found.name]?.kg??null};if(pick)return pick(item);if(gymMode&&!$('gymMode')?.hidden)return editGymFromMode((rows,row)=>addGymExercise(rows,item,row?.[1]));gymPlanEdit('add-exercise',0,item);}
function renderGym(){const values=state.gym?.values||[];const rows=values.slice(7).filter(r=>r.some(v=>String(v??"").trim()!==""));$("gymMeta").textContent=(values[2]?.[1]||"Silový trénink")+" · "+(gymDay()===localToday()?"dnes":longDate(gymDay()));$("gymNotice").textContent=rows.length?czPlural(rows.filter(r=>String(r[0]||"")==="WORK").length,"pracovní série","pracovní série","pracovních sérií")+" · plán i výsledky jsou v interní databázi":"Dnešní plán je prázdný. Přidej cvik nebo vygeneruj plán.";const start=values.slice(7).findIndex(r=>r.some(v=>String(v??"").trim()!==""));const actualRows=start<0?[]:values.slice(7+start);$("gymRows").innerHTML=actualRows.map((r,i)=>{const idx=i+(start<0?0:start),type=r[0]||"",exercise=r[1]||"";const rawVideo=state.gym?.videoLinks?.[idx+7]||r[10]||"";const formula=String(rawVideo);const formulaUrl=formula.match(/HYPERLINK\(\s*"([^"]+)"/i)?.[1]||"";const video=/^https?:\/\//i.test(formula)?formula:/^https?:\/\//i.test(formulaUrl)?formulaUrl:("https://www.youtube.com/results?search_query="+encodeURIComponent(String(exercise||"")+" exercise technique"));const prev=actualRows[i-1]||[],next=actualRows[i+1]||[],kind=String(type).toUpperCase()==='WARMUP'?'WARMUP':'WORK';return '<tr data-row="'+idx+'" data-type="'+kind+'" class="'+(prev[1]===exercise?'':'gym-first ')+(next[1]===exercise?'':'gym-last')+'"><td><span class="gym-type">'+esc(type)+'</span></td><td><strong>'+esc(exercise)+'</strong></td><td>'+esc(r[2]||"")+'</td><td>'+esc(r[3]||"")+'</td><td>'+esc(r[4]||"")+'</td><td><input data-col="5" value="'+esc(r[5]||"")+'" inputmode="decimal"></td><td><input data-col="6" value="'+esc(r[6]||"")+'" inputmode="numeric"></td><td><input data-col="7" value="'+esc(r[7]||"")+'" inputmode="decimal"></td><td><input data-col="8" type="checkbox" '+(String(r[8]).toUpperCase()==="TRUE"||r[8]===true?"checked":"")+'></td>'+gymOptionsCell(r)+'<td class="gym-video-cell"><a href="'+esc(video)+'" target="_blank" rel="noopener noreferrer">▶ Video</a></td><td class="gym-actions-cell"><button class="btn gym-action" data-action="add-set" data-idx="'+idx+'">+ série</button> <button class="btn gym-action" data-action="remove-set" data-idx="'+idx+'">− série</button> '+(prev[1]===exercise?'':'<button class="btn gym-action" data-action="swap" data-idx="'+idx+'">⇄ cvik</button> <button class="btn gym-action" data-action="remove-exercise" data-idx="'+idx+'">🗑 cvik</button>')+'</td></tr>'}).join("")||'<tr><td colspan="12" class="muted">Žádný plán.</td></tr>'}
// The gym plan of the chosen day (today unless another day is picked).
function gymDay(){return state.gymDate||localToday()}
async function loadGym(){state.gym=await jsonFetch("/app/api/gym"+(gymDay()!==localToday()?"?date="+gymDay():""));renderGym();renderGymHistory(state.gym.history||[])}
async function saveGym(){const b=$("saveGym");b.disabled=true;b.textContent="Ukládám…";try{for(const tr of document.querySelectorAll("#gymRows tr[data-row]"))await persistGymRow(tr);await loadGym();toast((state.gym?.values||[]).slice(7).some(gymRowDone)?"Trénink uložen a historie obnovena":"Uloženo. Do historie se propíší série označené Hotovo.");}catch(e){toast("Uložení selhalo: "+e.message)}finally{b.disabled=false;b.textContent="Uložit trénink"}}
async function generateGym(){return withGymEquipment(generateGymNow);}
async function generateGymNow(){const b=$("generateGym");b.disabled=true;b.textContent="Generuji…";try{await jsonFetch("/app/api/gym/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:gymDay()})});toast("Dnešní plán vygenerován");await loadGym()}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent="Generovat"}}
const selectedGymMuscles=new Set();
function renderGymFocus(){
  document.querySelectorAll('.gym-focus-builder [data-muscle]').forEach(el=>el.setAttribute('aria-pressed',String(selectedGymMuscles.has(el.dataset.muscle))));
  $('gymFocusCount').textContent=selectedGymMuscles.size+uiText(' / 5 partií', ' / 5 muscle groups');
  $('generateFocusedGym').disabled=selectedGymMuscles.size===0;
  $('gymFocusStatus').textContent=selectedGymMuscles.size?('Vybráno: '+[...selectedGymMuscles].map(id=>$('gymFocusChoices').querySelector('[data-muscle="'+id+'"]').textContent).join(', ')+'.'):'Vyber až 5 partií na postavě nebo v seznamu.';
}
function toggleGymMuscle(id){
  if(!$('gymFocusChoices').querySelector('[data-muscle="'+id+'"]'))return;
  if(selectedGymMuscles.has(id))selectedGymMuscles.delete(id);
  else if(selectedGymMuscles.size<5)selectedGymMuscles.add(id);
  else{$('gymFocusStatus').textContent='Nejvýše 5 partií v jednom tréninku.';return;}
  renderGymFocus();
}
async function generateFocusedGym(){
  if(!selectedGymMuscles.size)return;
  return withGymEquipment(generateFocusedGymNow);
}
async function generateFocusedGymNow(){
  if(!selectedGymMuscles.size)return;
  const button=$('generateFocusedGym'),day=$('gymFocusDate')?.value||localToday();if(day<localToday()){$('gymFocusStatus').textContent='Vyber dnešek nebo pozdější den.';return;}
  state.gymDate=day;button.disabled=true;button.textContent='Generuji…';
  $('gymFocusStatus').textContent='Sestavuji trénink podle zvolených partií a dostupné zátěže…';
  try{
    const result=await jsonFetch('/app/api/gym/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:gymDay(),focusMuscles:[...selectedGymMuscles]})});
    await loadGym();
    $('gymFocusStatus').textContent=result.rationale||'Cílený plán je připraven.';
    toast('Cílený plán vygenerován');reloadWeek();openTrainingDetail({kind:'gym',date:day,sport:'gym'});
  }catch(error){$('gymFocusStatus').textContent='Generování selhalo: '+error.message;toast(error.message)}
  finally{button.disabled=false;button.textContent='Generovat pro vybrané partie';}
}
window.addEventListener("error",e=>{try{toast("Chyba aplikace: "+(e.error?.message||e.message||"neznámá chyba"))}catch{}});
window.addEventListener("unhandledrejection",e=>{try{toast("Chyba aplikace: "+(e.reason?.message||String(e.reason||"Promise rejected")))}catch{}});
function workoutSport(){return state.recSport||(state.workoutSport==='run'?'run':'ride')}
function capabilityLabel(system,sport=workoutSport()){return (sport==='run'?{recovery:"Regenerace",endurance:"Lehký / dlouhý běh",tempo:"Tempo",threshold:"Práh",vo2max:"VO₂max",anaerobic:"Rychlost",sprint:"Sprinty do kopce"}:{recovery:"Regenerace",endurance:"Vytrvalost",tempo:"Tempo",sweet_spot:"Sweet spot",threshold:"Práh",vo2max:"VO₂max",anaerobic:"Anaerobní",sprint:"Sprint"})[system]||system}
// Kolo / Běh switch: one sport for the generator and the library.
// Kolo / Běh / Gym: the endurance generator and library, or the gym builder.
function setWorkoutSport(sport){
  state.workoutSport=['run','gym'].includes(sport)?sport:'ride';const run=state.workoutSport==='run',gym=state.workoutSport==='gym';
  document.querySelectorAll('.sport-switch [data-sport]').forEach(b=>{const on=b.dataset.sport===state.workoutSport;b.classList.toggle('primary',on);b.setAttribute('aria-pressed',String(on))});
  const eyebrow=$('workoutsEyebrow');if(eyebrow)eyebrow.textContent=gym?'Posilovna':'Plán a knihovna · '+(run?'běh':'kolo');
  $('workoutsEndurance').hidden=gym;$('workoutsGym').hidden=!gym;
  if(!gym)state.recSport=state.workoutSport;syncRecSportUi();
  try{localStorage.setItem('pfdWorkoutSport',state.workoutSport)}catch{}
  if($('assistantDialog')?.open&&!assistantBusy)renderAssistantContext();
}
// Kolo / Běh inside Doporučené tréninky; the type names follow the sport.
function syncRecSportUi(){
  const run=workoutSport()==='run';
  document.querySelectorAll('[data-rec-sport]').forEach(b=>{const on=b.dataset.recSport===workoutSport();b.classList.toggle('primary',on);b.setAttribute('aria-pressed',String(on))});
  document.querySelectorAll('#workoutSystem option').forEach(o=>{if(o.value)o.textContent=capabilityLabel(o.value);if(o.hasAttribute('data-ride-only')){o.hidden=run;if(run&&o.selected)$('workoutSystem').value=''}});
}
function workoutProfile(workout){
  let structure=[];try{structure=JSON.parse(workout.structure_json||'[]')}catch{}
  const steps=[];
  for(const block of structure){if(Array.isArray(block.steps)){for(let i=0;i<Math.min(Number(block.repeats)||1,50);i++)steps.push(...block.steps)}else steps.push(block)}
  const total=steps.reduce((sum,step)=>sum+Math.max(0,num(step.durationMinutes)),0);
  if(!total)return '';
  let elapsed=0;
  const bars=steps.map(step=>{
    const duration=Math.max(0,num(step.durationMinutes)),x=elapsed/total*1000,width=duration/total*1000;elapsed+=duration;
    const from=Math.max(0,Math.min(190,num(step.powerStart,step.power))),to=Math.max(0,Math.min(190,num(step.powerEnd,step.power)));
    // Running % of threshold pace mapped onto the cycling colour scale.
    const scale=v=>workout.sport==='run'?50+(v-72)*1.78:v,hi=scale(Math.max(from,to));
    const color=hi>=125?'#ed7393':hi>=105?'#f3a65a':hi>=85?'#e6c76b':hi>=70?'#60c4ba':'#52a8c9';
    const y1=76-from/190*64,y2=76-to/190*64;
    const shape=step.ramp?'<polygon points="'+x+',76 '+x+','+y1+' '+(x+width)+','+y2+' '+(x+width)+',76" fill="'+color+'"/>':'<rect x="'+x+'" y="'+y1+'" width="'+width+'" height="'+(76-y1)+'" fill="'+color+'"/>';
    return '<g><title>'+fmt(duration,1)+' min · '+(step.free?'naplno, bez cílového výkonu; výška profilu je orientační':fmt(from)+'–'+fmt(to)+(workout.sport==='run'?' % prahového tempa':' % FTP'))+'</title>'+shape+'</g>';
  }).join('');
  return '<div class="workout-profile"><div class="workout-profile-head"><span>'+(workout.sport==='run'?'Profil tempa':'Profil výkonu')+'</span><strong>'+hm(total)+'</strong></div><svg role="img" aria-label="Profil cílového výkonu v čase" viewBox="0 0 1000 84" preserveAspectRatio="none"><path d="M0 42H1000 M0 76H1000" stroke="color-mix(in srgb,var(--muted) 39%,var(--bg))" stroke-width="1"/>'+bars+'</svg><div class="workout-profile-foot"><span>0 min</span><span>'+Math.round(total)+' min</span></div></div>';
}
// Level 1–10 per training system, learned from rated library workouts.
function renderWorkoutCapabilities(capabilities={}){
  const el=$("workoutCapabilities");if(!el)return;
  const order=workoutSport()==='run'?["endurance","tempo","threshold","vo2max","anaerobic","sprint","recovery"]:["endurance","tempo","sweet_spot","threshold","vo2max","anaerobic","sprint","recovery"];
  const rows=order.map(k=>({k,...(capabilities[k]||{level:3,confidence:.2,attempts:0})}));
  const uncalibrated=rows.every(x=>!num(x.attempts))?'<div class="notice" style="grid-column:1/-1">Výchozí odhad podle zkušeností v profilu: začátečník 1, běžně 3, zkušený 4 z 10. Nejde o měření kondice. Odhad pro každý typ se zpřesňuje po odjetých workoutech s hodnocením RPE.</div>':'';
  el.innerHTML=uncalibrated+rows.map(x=>'<div class="capability-card"><span class="label">'+esc(capabilityLabel(x.k))+'</span><strong>'+fmt(x.level,1)+' <span class="small">/ 10</span></strong><div class="capability-bar"><i style="width:'+Math.min(100,num(x.level)*10)+'%"></i></div><div class="small">'+(num(x.attempts)?'jistota '+Math.round(num(x.confidence,.2)*100)+' % · '+num(x.attempts)+' hodnocení':'výchozí odhad · bez hodnocení')+'</div></div>').join("");
}
// The day a card schedules to: the next two weeks, the chosen day first.
function scheduleDayOptions(selected){
  const today=localToday(),pick=selected&&selected>=today?selected:today;
  return Array.from({length:14},(_,i)=>dateShift(today,i)).map(d=>'<option value="'+d+'"'+(d===pick?' selected':'')+'>'+esc(dayShort(d))+'</option>').join('');
}
function dayShort(d){return dateFormat({weekday:'short',day:'numeric',month:'numeric'}).format(new Date(d+'T12:00:00Z'))}
// One library workout: the ride itself on the left; where, when and the key
// numbers next to the button on the right.
function workoutCardHtml(w,i,athlete){
  const reason=(w.reasons||[]).slice(0,4).join(" · "),run=w.sport==='run',env=w.environment==='indoor'?'indoor':'outdoor',day=$("workoutScheduleDate")?.value||localToday();
  const ftp=run?null:(env==='indoor'?athlete.indoorFtp:athlete.ftp)||athlete.ftp||null;
  const facts=[['Délka',hm(num(w.duration_minutes))],['Load',Math.round(num(w.target_load))+' TSS'],['IF',dec(w.intensity_factor,2)],['Obtížnost',fmt(w.difficulty,1)+' / 10'],['Odhad pro tento typ',fmt(w.capability_level,1)+' / 10'+(!num(w.capability_attempts)?uiText(' · výchozí odhad', ' · initial estimate'):'')],...(run?[]:[['Kadence',w.cadence||'dle bloku']]),...(ftp?[[env==='indoor'?'Indoor FTP':'FTP',ftp+' W'+(env==='indoor'&&athlete.indoorFtpEstimated?' · odhad':'')]]:[])];
  const steps=run?stepTableHtml(w.steps||[],null,{sport:'run',pace:athlete.runThresholdPace}):stepTableHtml(w.steps||[],ftp);
  return '<article class="workout-result" data-workout-id="'+esc(w.id)+'"><div><div class="workout-result-head"><div><div class="eyebrow">#'+(i+1)+' · '+esc(capabilityLabel(w.primary_system))+'</div><h3 style="margin:3px 0">'+esc(w.name)+'</h3></div><div><div class="workout-score">'+num(w.suitability)+'%</div><div class="small">vhodnost</div></div></div>'+workoutProfile(w)+'<details class="explain-block"><summary>Rozpis kroků</summary>'+steps+'</details><p>'+esc(w.description||"")+'</p>'+(w.environment_notes?.length?'<ul class="env-notes">'+w.environment_notes.slice(0,2).map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':'')+'<div class="reason">'+esc(reason||"Seřazeno podle cíle, tvé úrovně a aktuálního kontextu.")+'</div></div>'+
    '<aside class="workout-side"><div class="env-toggle" role="group" aria-label="Kde trénink pojedeš">'+['outdoor','indoor'].map(e=>'<button type="button" class="btn'+(e===env?' primary':'')+'" data-workout-env="'+e+'" aria-pressed="'+(e===env)+'"'+(e==='outdoor'&&Number(w.indoor_only)?' disabled title="Tento trénink je jen na trenažér"':'')+'>'+(e==='outdoor'?(run?'🌳 Venku':'🌤 Outdoor'):(run?'🏃 Pás':'🏠 Indoor'))+'</button>').join('')+'</div>'+
    '<label class="schedule-day-label"><span class="small">Den</span><select class="schedule-day" aria-label="Den, na který trénink přidat">'+scheduleDayOptions(day)+'</select></label><button class="btn primary schedule-workout" type="button" data-id="'+esc(w.id)+uiText('">Přidat na ', '">Add on ')+esc(dayShort(day>=localToday()?day:localToday()))+'</button>'+
    '<dl class="workout-facts">'+facts.map(([k,v])=>'<div><dt>'+esc(k)+(k==='Odhad pro tento typ'?' '+infoTip('capability',k):'')+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl></aside></article>';
}
// Outdoor ↔ indoor for one card: the server renders the workout for that
// place (indoor watts from indoor FTP, outdoor ranges and warm-up).
async function switchWorkoutEnvironment(card,environment){
  const id=card.dataset.workoutId,list=state.workoutLibrary?.workouts||[],at=list.findIndex(x=>x.id===id);if(at<0)return;
  card.querySelectorAll('[data-workout-env]').forEach(b=>b.disabled=true);
  try{const r=await jsonFetch('/app/api/workouts/render?id='+encodeURIComponent(id)+'&environment='+environment+'&sport='+workoutSport());
    const day=card.querySelector('.schedule-day')?.value;list[at]={...list[at],...r.workout,suitability:list[at].suitability,reasons:list[at].reasons,capability_level:list[at].capability_level};
    const athlete={...(state.workoutLibrary.athlete||{}),...(r.athlete||{})},i=[...card.parentNode.children].indexOf(card);
    card.outerHTML=workoutCardHtml(list[at],i,athlete);
    const fresh=$('workoutResults').querySelector('[data-workout-id="'+CSS.escape(id)+'"] .schedule-day');if(fresh&&day){fresh.value=day;fresh.dispatchEvent(new Event('change',{bubbles:true}));}
  }catch(error){toast('Převod se nepovedl: '+error.message);card.querySelectorAll('[data-workout-env]').forEach(b=>b.disabled=false);}
}
function renderWorkoutLibrary(result){
  renderWorkoutCapabilities(result.capabilities||{});
  const ctx=result.rankingContext||{},context=$("workoutRankingContext");
  const readinessWord={green:'dobrá',yellow:'střední',red:'nízká'}[ctx.readiness]||'—',pick=result.coachPick||{};
  if(context)context.innerHTML=uiText('<strong>Podle čeho řadím:</strong> připravenost ', '<strong>How I rank:</strong> readiness ')+esc(readinessWord)+(Number.isFinite(Number(ctx.tsb))?' · forma (TSB) '+fmt(ctx.tsb,1):'')+uiText(' · kvalitní dny za 7 dní ', ' · quality days in 7 days ')+num(ctx.hardBikeDaysRolling7d)+(pick.system?' · trenér na dnešek doporučuje '+esc(capabilityLabel(pick.system))+(pick.durationMinutes?' kolem '+hm(pick.durationMinutes):''):'')+'.';
  if(context)context.innerHTML+=' '+esc(result.sort==='difficulty'?'Řazení od nejtěžších; vhodnost pro daný den je uvedena zvlášť.':result.sort==='duration'?'Řazení od nejbližší délky.':'Pestrý výběr podle vhodnosti: střídám struktury, délky a umístění intervalů.');
  const el=$("workoutResults"),rows=result.workouts||[];
  if(!rows.length){el.innerHTML='<div class="notice">Pro tuto kombinaci filtrů jsem nenašel vhodný workout. Zvětši toleranci délky nebo zruš limit obtížnosti.</div>';return}
  // A short list first; the rest on request.
  const shown=state.workoutShowAll?rows:rows.slice(0,5);
  el.innerHTML=shown.map((w,i)=>workoutCardHtml(w,i,result.athlete||{})).join("")+(rows.length>shown.length?uiText('<button class="btn more-results" type="button" id="moreWorkouts">Zobrazit další (', '<button class="btn more-results" type="button" id="moreWorkouts">Show more (')+(rows.length-shown.length)+')</button>':'');
  const more=$('moreWorkouts');if(more)more.onclick=()=>{state.workoutShowAll=true;renderWorkoutLibrary(result)};
}
// Completion comes from the activity paired in Intervals.icu; the athlete adds RPE and a note.
function renderScheduledWorkouts(rows){
  const el=$("scheduledWorkouts"),today=localToday();
  el.innerHTML=rows.length?rows.map(w=>{
    const local=w.intervals_event_id?.startsWith('local-');
    const reviewed=Boolean(w.feedback_id),paired=w.status==='completed'||w.completed_percent!=null,due=w.scheduled_date<=today;
    const done=w.completed_percent!=null?' · dokončeno '+Math.round(num(w.completed_percent))+' %':'';
    const status=reviewed?'Hodnoceno · RPE '+(w.feedback_rpe!=null?fmt(w.feedback_rpe,1):'—')+done:paired?(local?'Dokončeno v aplikaci':'Spárováno s aktivitou v Intervals.icu')+done:due?(local?'Potvrď dokončení nebo zapiš skutečnou délku':'Čekám na aktivitu z Intervals.icu'):'Naplánováno';
    const note=reviewed&&(state.coachNotes||[]).find(r=>r.workoutId===w.workout_id&&r.date===w.scheduled_date);
    return '<article class="scheduled-workout" data-id="'+esc(w.workout_id)+'" data-date="'+esc(w.scheduled_date)+'"><div><strong>'+esc(w.name)+'</strong><div class="small">'+esc(dayTitle(w.scheduled_date))+' · '+esc(capabilityLabel(w.primary_system,w.sport))+' · '+num(w.duration_minutes)+' min · '+status+'</div>'+(note?'<p class="coach-note-inline">💬 '+esc(note.text)+'</p>':'')+'</div>'+
      (reviewed?'<span class="small">✓ Uloženo</span>':due?'<form class="workout-feedback rpe-form">'+(local?'<label>Skutečná délka · min<input name="minutes" type="number" min="1" max="1440" required value="'+num(w.duration_minutes)+'"></label><label><input name="manualComplete" type="checkbox" required> Trénink jsem dokončil/a</label>':'')+'<label><span class="small">RPE 1–10 <button type="button" class="info-tip" data-info="rpe" aria-label="Vysvětlivka: RPE">i</button></span><input name="rpe" type="number" min="1" max="10" step="1" required></label><label><span class="small">Pocit / poznámka (volitelně)</span><input name="notes" type="text" maxlength="300" placeholder="např. těžké nohy, horko"></label><button class="btn primary" type="submit">Uložit RPE</button></form>':'<span class="small">'+(w.sport==='run'?'Čeká na běh':'Čeká na jízdu')+'</span>')+(!paired&&!reviewed&&w.intervals_event_id?'<button type="button" class="btn" data-delete-event="'+esc(w.intervals_event_id)+'" data-name="'+esc(w.name)+'">Smazat</button>':'')+'</article>';
  }).join(''):'<div class="small">Zatím není naplánovaný žádný workout.</div>';
}
async function loadScheduledWorkouts(){
  try{const [result,notes]=await Promise.all([jsonFetch('/app/api/workouts/scheduled'),jsonFetch('/app/api/coach/reflections').catch(()=>({}))]);state.coachNotes=notes.reflections||[];renderScheduledWorkouts(result.workouts||[])}
  catch(error){$('scheduledWorkouts').innerHTML='<div class="notice status-error">'+esc(error.message)+'</div>'}
}
// Only the newest search renders, so quick filter clicks never show stale results.
let workoutLibraryRequest=0;
// The search for a set of filters; the same text for the dialog and the prefetch.
function librarySearchQuery(f){
  const p=new URLSearchParams();p.set("sport",f.sport);if(f.system)p.set("system",f.system);p.set("environment",f.environment||"outdoor");
  if(f.duration){p.set("duration",f.duration);if(f.tolerance)p.set("durationTolerance",f.tolerance);}if(f.load)p.set("load",f.load);if(f.difficulty)p.set("maxDifficulty",f.difficulty);if(f.phase)p.set("phase",f.phase);if(f.date)p.set("date",f.date);p.set("limit","15");
  if(f.sort&&f.sort!=='recommended')p.set('sort',f.sort);
  return p.toString();
}
// Results kept for a few minutes: the dialog shows them at once, then refreshes quietly.
const LIBRARY_CACHE_MS=10*60*1000,libraryCache=new Map();
function fetchLibrary(query){
  const hit=libraryCache.get(query);if(hit&&Date.now()-hit.at<LIBRARY_CACHE_MS&&hit.promise)return hit.promise;
  const promise=jsonFetch("/app/api/workouts/search?"+query).then(r=>{libraryCache.set(query,{at:Date.now(),data:r,promise:Promise.resolve(r)});return r;}).catch(e=>{libraryCache.delete(query);throw e;});
  libraryCache.set(query,{at:Date.now(),promise,data:hit?.data||null});return promise;
}
async function loadWorkoutLibrary(){
  const date=$("workoutScheduleDate");if(date&&!date.value)date.value=localToday();if(date)date.min=localToday();
  const query=librarySearchQuery({sport:workoutSport(),system:$("workoutSystem")?.value,environment:$("workoutEnvironment")?.value,duration:$("workoutDuration")?.value,tolerance:$("workoutDurationTolerance")?.value,load:$("workoutLoad")?.value,difficulty:$("workoutDifficulty")?.value,sort:$("workoutSort")?.value,phase:$("workoutPhase")?.value,date:date?.value});
  state.workoutShowAll=false;const request=++workoutLibraryRequest;if(typeof renderRecommendChrome==='function')renderRecommendChrome();
  const ready=libraryCache.get(query)?.data;
  if(ready){state.workoutLibrary=ready;renderWorkoutLibrary(ready);}else $("workoutResults").innerHTML='<div class="small">Počítám vhodnost workoutů…</div>';
  try{const r=await fetchLibrary(query);if(request!==workoutLibraryRequest||r===ready)return;state.workoutLibrary=r;renderWorkoutLibrary(r)}
  catch(e){if(request===workoutLibraryRequest&&!ready)$("workoutResults").innerHTML='<div class="notice status-error">'+esc(e.message)+'</div>'}
}
// After the week has been still, the workouts for each upcoming ride and run
// chip are fetched in the background, so a click on a proposal opens at once.
let libraryPrefetchTimer=null;
function prefetchChipLibraries(){
  clearTimeout(libraryPrefetchTimer);
  libraryPrefetchTimer=setTimeout(async()=>{
    // Only the next few chips, one at a time, and never next to other heavy work.
    const busy=()=>plannerQuiet()||document.hidden||state.proposalsBusy||!$('workouts')?.classList.contains('active');
    if(busy())return;
    const queries=[...document.querySelectorAll('#hubWeek [data-chip-suggest][data-minutes]')].filter(b=>b.dataset.sport!=='gym'&&b.dataset.date>=localToday()).slice(0,3).map(b=>librarySearchQuery({sport:b.dataset.sport,system:ROLE_SYSTEM[b.dataset.role]??'',environment:b.dataset.env,duration:b.dataset.minutes,tolerance:Number(b.dataset.minutes)>=150?'30':'15',difficulty:b.dataset.role==='recovery'?'':$("workoutDifficulty")?.value,phase:$("workoutPhase")?.value,date:b.dataset.date}));
    for(const q of [...new Set(queries)]){if(busy())return;const hit=libraryCache.get(q);if(hit&&Date.now()-hit.at<LIBRARY_CACHE_MS)continue;await fetchLibrary(q).catch(()=>{});await new Promise(r=>setTimeout(r,1500));}
  },4000);
}
// Anything the athlete changes can change the ranking: start over.
function clearLibraryCache(){libraryCache.clear();}
async function scheduleLibraryWorkout(id,dateOverride=null,environment=null){
  const date=dateOverride||$("workoutScheduleDate")?.value;if(!date){toast("Vyber datum.");return}
  const row=[...(state.workoutLibrary?.workouts||[]),state.generated?.workout,...(state.generated?.alternatives||[])].find(x=>x&&x.id===id),name=row?.name||id;
  // "Vyměnit za jiný" from a planned training's detail: the new one replaces it.
  const replace=state.replaceEvent;
  const pending=showPendingAdd(row||{id,name},date,row?.sport||workoutSport());
  try{const r=await jsonFetch("/app/api/workouts/schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workoutId:id,date,confirm:true,environment:environment||$("workoutEnvironment")?.value||"outdoor"})});settlePendingAdd(pending,r.status!=='already_scheduled',r.eventId);
    if(replace&&r.status!=='already_scheduled'){state.replaceEvent=null;deletePlanned(replace.id,replace.name,false);}toast(r.status==='already_scheduled'?'Workout už je na tento den naplánovaný.':r.workout.name+uiText(' je v plánu na ', ' is planned for ')+longDate(r.date)+(r.sync?.status==='synced'?uiText(' a odeslaný do Intervals.icu.', ' and sent to Intervals.icu.'):r.sync?.status==='error'?uiText('. Export se nepodařil; trénink zůstává uložený.', '. The export failed; the workout stays saved.'):'.'))}
  catch(e){settlePendingAdd(pending,false);toast(uiText("Uložení tréninku selhalo: ", "Saving the workout failed: ")+e.message)}
}
async function saveWorkoutFeedback(form){
  const row=form.closest('.scheduled-workout'),button=form.querySelector('button[type=submit]');
  button.disabled=true;
  try{
    const body={workoutId:row.dataset.id,scheduledDate:row.dataset.date,rpe:Number(form.elements.rpe.value),notes:form.elements.notes.value,manualComplete:form.elements.manualComplete?.checked===true,minutes:form.elements.minutes?Number(form.elements.minutes.value):undefined};
    const r=await jsonFetch('/app/api/workouts/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    toast(r.intervals?.status==='ok'?'RPE je uložené i u aktivity v Intervals.icu.':r.intervals?.status==='error'?uiText('RPE je uložené; zápis do Intervals.icu selhal: ', 'RPE is saved; writing to Intervals.icu failed: ')+r.intervals.message:'RPE je uložené.');await loadScheduledWorkouts();if(r.reflection==='pending'){toast('Uloženo. AI teď připravuje zpětnou vazbu…');awaitReflection(body.scheduledDate);}
  }catch(error){toast('Hodnocení se neuložilo: '+error.message);button.disabled=false}
}

// "Generovat": one recommended workout for the chosen day.
function environmentLabel(env){return env==="outdoor"?"Outdoor":"Indoor"}
function fmtPace(sec){sec=Math.round(Number(sec));return sec>0?Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'):''}
function fmtStepTime(sec){sec=Math.round(sec);if(sec<60)return sec+' s';const m=Math.floor(sec/60),r=sec%60;return m>=60?Math.floor(m/60)+' h '+(m%60?m%60+' min':''):m+(r?' min '+r+' s':' min')}
// Step table from server rows ({repeats, steps:[{durationSeconds, percentLow/High, wattsLow/High, free, ramp, cadence, note}]}).
function stepTableHtml(rows,ftp,opts={}){
  const target=s=>s.free?'naplno':s.ramp?s.percentLow+' → '+s.percentHigh+' %':s.percentLow===s.percentHigh?s.percentLow+' %':s.percentLow+'–'+s.percentHigh+' %';
  if(opts.sport==='run'){
    // Running: pace per km (the faster pace belongs to the higher %).
    const pace=s=>s.free?'naplno':!s.paceFast&&!s.paceSlow?'—':s.ramp?s.paceSlow+' → '+s.paceFast:s.paceFast===s.paceSlow?s.paceFast:s.paceFast+'–'+s.paceSlow;
    const line=s=>'<tr><td>'+esc(fmtStepTime(s.durationSeconds))+'</td><td>'+esc(target(s))+'</td><td><strong>'+esc(pace(s))+'</strong>'+(s.paceFast||s.paceSlow?' <span class="small">/km</span>':'')+'</td><td class="small">'+esc(s.zone||'')+'</td><td class="small">'+esc(s.note||'')+'</td></tr>';
    return '<div class="step-table-wrap"><table class="step-table"><thead><tr><th>Čas</th><th>% prahu</th><th>Tempo'+(opts.pace?uiText(' (práh ', ' (threshold ')+esc(fmtPace(opts.pace))+' /km)':'')+'</th><th>Zóna</th><th>Poznámka</th></tr></thead><tbody>'+
      rows.map(g=>g.repeats>1?'<tr class="step-repeat"><td colspan="5">'+g.repeats+'× opakuj'+(g.note?' · '+esc(g.note):'')+'</td></tr>'+g.steps.map(line).join('')+'<tr class="step-repeat-end"><td colspan="5"></td></tr>':g.steps.map(line).join('')).join('')+'</tbody></table></div>';
  }
  const watts=s=>s.free||s.wattsLow==null?'—':s.ramp?s.wattsLow+' → '+s.wattsHigh+' W':s.wattsLow===s.wattsHigh?s.wattsLow+' W':s.wattsLow+'–'+s.wattsHigh+' W';
  const line=s=>'<tr><td>'+esc(fmtStepTime(s.durationSeconds))+'</td><td>'+esc(target(s))+'</td><td><strong>'+esc(watts(s))+'</strong></td><td class="small">'+esc(s.zone||'')+'</td><td>'+esc(s.cadence?String(s.cadence).replace(/rpm/i,'')+' rpm':'')+'</td><td class="small">'+esc(s.note||'')+'</td></tr>';
  return '<div class="step-table-wrap"><table class="step-table"><thead><tr><th>Čas</th><th>% FTP</th><th>Výkon'+(ftp?' (FTP '+esc(ftp)+' W)':'')+'</th><th>Zóna</th><th>Kadence</th><th>Poznámka</th></tr></thead><tbody>'+
    rows.map(g=>g.repeats>1?'<tr class="step-repeat"><td colspan="6">'+g.repeats+'× opakuj'+(g.note?' · '+esc(g.note):'')+'</td></tr>'+g.steps.map(line).join('')+'<tr class="step-repeat-end"><td colspan="6"></td></tr>':g.steps.map(line).join('')).join('')+'</tbody></table></div>';
}
function explainList(title,items){return items&&items.length?'<div class="explain-block"><h4>'+esc(title)+'</h4><ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':''}
function renderGeneratedWorkout(r){
  const el=$("generatedWorkout");if(!el)return;
  if(r.status!=="ok"){el.innerHTML='<div class="notice">'+esc(r.message||"Trénink se nepodařilo vygenerovat.")+'</div>';return}
  const w=r.workout,x=r.explanation||{};
  const source=w.citation?esc(w.citation):w.source_url?'<a href="'+esc(w.source_url)+'" target="_blank" rel="noopener">'+esc(w.source_name)+'</a>':esc(w.source_name||"");
  const run=r.sport==='run',stepOpts=run?{sport:'run',pace:x.thresholdPace}:{};
  const planned=x.planned?'<details class="explain-block" open><summary><strong>Tvůj plán v Intervals.icu:</strong> '+esc(x.planned.name||'trénink')+(x.planned.minutes?' · '+x.planned.minutes+' min':'')+(x.planned.intensityFactor?' · IF '+fmt(x.planned.intensityFactor,2):'')+'</summary>'+(x.planned.steps?.length?stepTableHtml(x.planned.steps,x.ftp,stepOpts):'<p class="small">Plán nemá strukturu kroků.</p>')+'<p class="small">Níže je odpovídající trénink z knihovny, pokud chceš strukturu podle PFD – jinak klidně jeď svůj plán.</p></details>':'';
  const role=r.weekRole?'<div class="notice" style="margin-bottom:10px">Plán týdne: <strong>'+esc(r.weekRole.label)+'</strong> – podle toho trenér volil typ tréninku (únava a připravenost mají přednost).</div>':'';
  el.innerHTML=role+planned+'<article class="workout-result generated"><div><div class="workout-result-head"><div><div class="eyebrow">'+esc(longDate(r.date))+' · '+esc(capabilityLabel(w.primary_system,r.sport))+' · '+environmentLabel(r.environment,r.sport)+'</div><h3 style="margin:3px 0">'+esc(w.name)+'</h3></div><div><div class="workout-score">'+num(w.suitability)+'%</div><div class="small">vhodnost</div></div></div>'+
    '<div class="workout-meta"><span class="pill">'+hm(num(w.duration_minutes))+'</span><span class="pill">load '+Math.round(num(w.target_load))+'</span><span class="pill">IF '+fmt(w.intensity_factor,2)+uiText('</span><span class="pill">obtížnost ', '</span><span class="pill">difficulty ')+fmt(w.difficulty,1)+'</span>'+(x.ftp?'<span class="pill">FTP '+esc(x.ftp)+' W</span>':'')+(x.thresholdPace?uiText('<span class="pill">práh ', '<span class="pill">threshold ')+esc(fmtPace(x.thresholdPace))+' /km</span>':'')+'</div>'+
    '<p>'+esc(w.description||"")+'</p>'+
    '<div class="explain-grid">'+explainList('Proč tento trénink',x.why)+explainList('Jak ho jet',x.how)+explainList(r.environment==='outdoor'?'Venku':run?'Na páse':'Na trenažéru',x.environment)+explainList('Jídlo a pití',x.fueling)+'</div>'+
    '<h4 style="margin:14px 0 6px">Rozpis</h4>'+stepTableHtml(x.steps||[],x.ftp,stepOpts)+workoutProfile(w)+
    '<p class="small">Zdroj: '+source+'</p>'+
    (r.existing?'<p class="notice">Alternativa k naplánovanému tréninku. Změnu prober s AI nebo uprav původní událost v kalendáři.</p>':'')+
    '<div class="workout-filter-actions" style="margin-top:10px;flex-wrap:wrap">'+(!r.existing?'<button class="btn primary" id="scheduleGenerated">Přidat do Intervals.icu</button>':'')+(r.variantCount>1?'<button class="btn" id="anotherGenerated">Jiný návrh</button>':'')+'<label class="small" style="display:flex;gap:6px;align-items:center">Délka <input id="resizeMinutes" type="number" min="'+(run?20:30)+'" max="'+(run?240:360)+'" step="5" value="'+num(w.duration_minutes)+'" style="width:80px;background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px"> min</label><button class="btn" id="resizeGenerated" title="Stejný trénink, jen jiná délka – hlavní série zůstává">Změnit délku</button></div></div></article>'+
    (r.alternatives?.length?uiText('<div class="small" style="margin-top:8px">Další možnosti: ', '<div class="small" style="margin-top:8px">More options: ')+r.alternatives.map(a=>esc(a.name)).join(' · ')+'</div>':'');
  const schedule=$("scheduleGenerated");if(schedule)schedule.onclick=()=>scheduleLibraryWorkout(w.id,r.date,r.environment);
  const again=$("anotherGenerated");if(again)again.onclick=()=>generateWorkoutForDay((state.generatedVariant||0)+1);
  $("resizeGenerated").onclick=()=>resizeGeneratedWorkout(w.id,Number($("resizeMinutes").value));
}
// Same proposal, another length: the main set stays, the aerobic part changes.
async function resizeGeneratedWorkout(id,minutes){
  if(!(minutes>0)){toast('Zadej délku v minutách.');return}
  const b=$("resizeGenerated");b.disabled=true;b.textContent='Upravuji…';
  try{
    const body={date:state.generated?.date||$("generateDate")?.value||localToday(),environment:$("generateEnvironment").value,sport:workoutSport(),workoutId:id,resizeTo:minutes};
    const r=await jsonFetch("/app/api/workouts/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    r.existing=state.generated?.existing;state.generated=r;renderGeneratedWorkout(r);
  }catch(e){toast(e.message);b.disabled=false;b.textContent='Změnit délku'}
}
async function generateWorkoutForDay(variant=0){
  const revision=statusCoachingRevision;
  const b=$("generateWorkoutBtn"),date=$("generateDate");if(date&&!date.value)date.value=localToday();
  b.disabled=true;$("generatedWorkout").innerHTML='<div class="small">Trenér vybírá trénink…</div>';
  try{
    const body={date:date?.value||localToday(),environment:$("generateEnvironment").value,variant,sport:workoutSport()};
    const minutes=Number($("generateMinutes").value);if(minutes>0)body.availabilityMinutes=minutes;
    const r=await jsonFetch("/app/api/workouts/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(revision!==statusCoachingRevision)return;
    r.existing=state.generated?.existing&&state.generated.date===r.date&&state.generated.sport===r.sport;state.generated=r;state.generatedVariant=variant;renderGeneratedWorkout(r);
  }catch(e){if(revision===statusCoachingRevision)$("generatedWorkout").innerHTML='<div class="notice status-error">'+esc(e.message)+'</div>'}
  finally{b.disabled=false}
}
let dashboardLoadRevision=0;
const DAY_INDEPENDENT=['athleteState','fitness','weight','activities','nutrition','sleep'];
// The last loaded day stays on this device, so opening the app shows it at once
// while the fresh data loads. Only today, never older than half a day; the
// largest parts are left out when the browser's storage is too small.
const SNAPSHOT_KEY='lw-dashboard-snapshot',SNAPSHOT_PARTS=['athleteState','daily','coaches','gym','week','fitness','weight','activities','sleep','nutrition'];
function saveDashboardSnapshot(){
  const data={};for(const key of SNAPSHOT_PARTS)if(state[key]!=null)data[key]=state[key];
  for(const drop of [null,'nutrition','sleep','activities','week']){
    if(drop)delete data[drop];
    try{const text=JSON.stringify({date:localToday(),weekStart,lang:document.documentElement.lang||'cs',savedAt:Date.now(),data});if(text.length>2e6)continue;localStorage.setItem(SNAPSHOT_KEY,text);return;}catch{}
  }
  try{localStorage.removeItem(SNAPSHOT_KEY);}catch{}
}
function showDashboardSnapshot(){
  try{
    const snap=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');
    if(!snap||snap.date!==localToday()||selectedHistoryDate!==snap.date||Date.now()-snap.savedAt>12*3600e3||(snap.lang||'cs')!==(document.documentElement.lang||'cs'))return;
    for(const key of SNAPSHOT_PARTS){if(snap.data[key]==null||(key==='week'&&snap.weekStart!==weekStart))continue;state[key]=snap.data[key];renderLoadedData(key);}
    $('topStatus').textContent='Aktualizuji…';
  }catch{}
}
function forgetDashboard(){try{localStorage.removeItem('lw-dashboard-ready');localStorage.removeItem(SNAPSHOT_KEY);}catch{}}
// Signing out, or a session that ended, leaves nothing of the account on the
// device: the profile (the server keeps it) and the open chat go with the last
// day, so the next person on this browser does not start with them.
function forgetAccount(){forgetDashboard();try{for(const key of ['fitnessProfile','fitnessProfileSuggested','pfd-assistant-chat'])localStorage.removeItem(key);}catch{}}
// What this device keeps belongs to the account that saved it. The page says
// who is signed in (meta lw-account); signing in as someone else on the same
// browser drops the previous account's last day, profile and chat before
// anything is shown or saved with them.
const PAGE_ACCOUNT=document.querySelector('meta[name="lw-account"]')?.content||'';
function bindDeviceToAccount(){try{if(PAGE_ACCOUNT&&localStorage.getItem('lw-account')!==PAGE_ACCOUNT){forgetAccount();localStorage.setItem('lw-account',PAGE_ACCOUNT);}}catch{}}
bindDeviceToAccount();
function renderLoadedData(key){
  const renderers=key==='coaches'?[renderCoachCouncil]:key==='gym'?[renderGym]:key==='nutrition'?[renderNutrition]:key==='athleteState'?[renderAthleteStatus,renderCoachMemories,renderToday]:
    key==='week'?[renderTraining,renderToday]:key==='sleep'?[renderOverview,renderRecovery,renderHealth,renderToday]:key==='fitness'?[renderOverview,renderTraining,renderRecovery,renderHealth,renderToday]:
    key==='daily'?[renderOverview,renderNutrition,renderToday]:[renderOverview,renderHealth];
  for(const render of renderers){try{render();}catch{/* Other inputs may still be arriving. */}}
}
async function load(){loadsRunning++;try{await loadDashboardData();}finally{loadsRunning--;}}
async function loadDashboardData(){
  const revision=++dashboardLoadRevision,statusRevision=statusCoachingRevision,date=selectedHistoryDate;
  $('topStatus').textContent=state.daily?'Aktualizuji…':'Načítám…';
  // Switching the day reads only what depends on it: the history (sleep, weight,
  // nutrition, fitness) and the shown week stay until a change or five minutes.
  const now=Date.now(),fresh=key=>state[key]!=null&&now-(loadedAt[key]||0)<300000;
  const jobs=[['athleteState','/app/api/athlete-state'],['daily','/app/api/daily?date='+date],['coaches','/app/api/coaches?date='+date],['fitness','/app/api/fitness?days=90'],['week','/app/api/week?start='+weekStart],['weight','/app/api/weight'],['activities','/app/api/activities'],['nutrition','/app/api/nutrition?start='+dateShift(localToday(),-365)+'&end='+dateShift(localToday(),1)],['sleep','/app/api/sleep?start='+dateShift(localToday(),-365)+'&end='+dateShift(localToday(),1)],['gym','/app/api/gym?date='+gymDay()]].filter(([key])=>key==='week'?!(loadedWeek===weekStart&&fresh('week')):!DAY_INDEPENDENT.includes(key)||!fresh(key));
  const shownWeek=weekStart;
  // What stays is drawn for the new day at once, before any answer arrives.
  for(const key of [...DAY_INDEPENDENT,'week'])if(!jobs.some(([k])=>k===key))renderLoadedData(key);
  const results=await Promise.allSettled(jobs.map(async([key,url])=>{
    const result=key==='week'?await fetchWeek(weekStart):await jsonFetch(url);
    if(revision!==dashboardLoadRevision||date!==selectedHistoryDate)return;
    if(['athleteState','coaches'].includes(key)&&statusRevision!==statusCoachingRevision)return;
    state[key]=key==='athleteState'?result.state:result;loadedAt[key]=Date.now();if(key==='week')loadedWeek=shownWeek;renderLoadedData(key);
  }));
  if(revision!==dashboardLoadRevision)return;
  const failures=jobs.map(([key],i)=>results[i].status==='rejected'?{key,message:results[i].reason?.message||''}:null).filter(Boolean),failed=failures.length;
  if(date===localToday())saveDashboardSnapshot();
  loadInbox().catch(()=>{});
  // Nothing to say when everything loaded: the data on the page is current.
  $('topStatus').textContent=failed===0?'':failed<jobs.length?'Částečně načteno':'Data nejsou dostupná';
  $('topStatus').className=failed===0?'status-label small':failed<jobs.length?'status-label small status-partial':'status-label small status-error';
  // Which part did not load and why, so the message says what to fix.
  if(failed){for(const f of failures)console.warn('Dashboard part failed',f.key,f.message);const en=document.documentElement.lang==='en';toast((en?'Could not load: ':'Nepodařilo se načíst: ')+failures.map(f=>(LOAD_PART_LABELS[f.key]||[f.key,f.key])[en?1:0]).join(', ')+(failures[0].message?' ('+failures[0].message.slice(0,140)+')':''));}
}
// Czech and English names of the parts loadDashboardData reads.
const LOAD_PART_LABELS={athleteState:['stav','status'],daily:['přehled dne','day overview'],coaches:['doporučení','recommendations'],fitness:['kondice','fitness'],week:['týden','week'],weight:['váha','weight'],activities:['aktivity','activities'],nutrition:['jídlo z Google Health','food from Google Health'],sleep:['spánek','sleep'],gym:['posilovna','gym']};
document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>{activate(b.dataset.view);if(b.dataset.view==="workouts")openWorkouts();});
// Empty states link to the place where the missing data is set up.
document.addEventListener('click',e=>{const go=e.target.closest('[data-open-view]');if(go){e.preventDefault();if(go.dataset.openSection)openSettings(go.dataset.openSection);else activate(go.dataset.openView);}});
$("searchWorkouts").onclick=loadWorkoutLibrary;
document.querySelectorAll('.sport-switch [data-sport]').forEach(b=>b.onclick=()=>{setWorkoutSport(b.dataset.sport);if(state.workoutSport==='gym')loadGym().catch(e=>toast(e.message));else loadScheduledWorkouts()});
{let saved='ride';try{saved=localStorage.getItem('pfdWorkoutSport')||'ride'}catch{}setWorkoutSport(saved);}
$("generateWorkoutBtn").onclick=()=>generateWorkoutForDay(0);{const d=$("generateDate");if(d){d.value=localToday();d.min=localToday();}}
$("workoutResults").addEventListener("click",e=>{const card=e.target.closest(".workout-result");const env=e.target.closest("[data-workout-env]");if(env&&card&&env.getAttribute('aria-pressed')!=='true'){switchWorkoutEnvironment(card,env.dataset.workoutEnv);return}const b=e.target.closest(".schedule-workout");if(b){const w=(state.workoutLibrary?.workouts||[]).find(x=>x.id===b.dataset.id);scheduleLibraryWorkout(b.dataset.id,card?.querySelector('.schedule-day')?.value||null,w?.environment||null);}});
$("workoutResults").addEventListener("change",e=>{const sel=e.target.closest(".schedule-day");if(!sel)return;const b=sel.closest(".workout-side")?.querySelector(".schedule-workout");if(b)b.textContent='Přidat na '+dayShort(sel.value);});
$("scheduledWorkouts").addEventListener("submit",e=>{if(e.target.matches('.workout-feedback')){e.preventDefault();saveWorkoutFeedback(e.target)}});
["workoutSystem","workoutDurationTolerance","workoutDifficulty","workoutSort","workoutPhase","workoutScheduleDate","workoutEnvironment"].forEach(id=>{const el=$(id);if(el)el.onchange=()=>{if($('recommendDialog')?.open)loadWorkoutLibrary()}});
$('refresh').onclick=async()=>{
  const b=$('refresh');b.disabled=true;b.textContent='Synchronizuji…';
  try{
    const started=await jsonFetch('/app/api/sync',{method:'POST'});let status=started.status==='accepted'?'running':started.status;
    renderAccountImportStatus({...started,status});
    for(let i=0;i<30&&status==='running';i++){
      await new Promise(resolve=>setTimeout(resolve,2000));
      const current=await jsonFetch('/app/api/sync');status=current.status;
      renderAccountImportStatus(current);
      if(i%5===4&&status==='running')await refreshCoachLifecycle();
    }
    b.textContent='Obnovuji…';markDataChanged('');await load();
    toast(status==='running'?'Synchronizace pokračuje na pozadí; doporučení průběžně obnovujeme.':status==='partial'||status==='error'?'Část služeb se neobnovila. Dostupná data jsou načtená.':status==='idle'?started.message||'Není co synchronizovat.':'Nová data jsou načtená.');
    if(status==='running')pollAccountImport();
  }catch(error){toast('Synchronizace selhala: '+error.message);}
  finally{b.disabled=false;b.textContent='Obnovit';}
};
$("prevWeek").onclick=()=>{weekStart=dateShift(weekStart,-7);selectedHistoryDate=weekStart;load()};
$("nextWeek").onclick=()=>{weekStart=dateShift(weekStart,7);selectedHistoryDate=weekStart;load()};
$("thisWeek").onclick=()=>{weekStart=localMonday();selectedHistoryDate=weekStart;load()};
$("saveGym").onclick=saveGym;$("generateGym").onclick=generateGym;$("addGymExercise").onclick=openGymExercisePicker;$("gymRows").addEventListener("click",e=>{const b=e.target.closest(".gym-action");if(!b)return;if(b.dataset.action==='swap')return openGymSwapSheet(Number(b.dataset.idx));gymPlanEdit(b.dataset.action,Number(b.dataset.idx));});
$('gymFocusChoices').addEventListener('click',e=>{const choice=e.target.closest('[data-muscle]');if(choice)toggleGymMuscle(choice.dataset.muscle);});
document.querySelector('.gym-figures').addEventListener('click',e=>{const muscle=e.target.closest('[data-muscle]');if(muscle)toggleGymMuscle(muscle.dataset.muscle);});
document.querySelector('.gym-figures').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const muscle=e.target.closest('[data-muscle]');if(muscle){e.preventDefault();toggleGymMuscle(muscle.dataset.muscle);}}});
document.querySelector('.gym-view-switch').addEventListener('click',e=>{
  const side=e.target.closest('[data-side]')?.dataset.side;
  if(!['front','back'].includes(side))return;
  document.querySelectorAll('.gym-view-switch [data-side]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.side===side)));
  document.querySelectorAll('.gym-figure[data-side]').forEach(figure=>figure.classList.toggle('active',figure.dataset.side===side));
});
$('generateFocusedGym').onclick=generateFocusedGym;if($('gymFocusDate')){$('gymFocusDate').value=localToday();$('gymFocusDate').min=localToday();}
$("closeGymExercise").onclick=()=>$("gymExerciseDialog").close();$("gymExerciseSearch").oninput=()=>{gymExerciseIndex=0;renderGymExerciseChoices();};$("gymExerciseResults").onclick=e=>{const option=e.target.closest('[data-index]');if(option)chooseGymExercise(Number(option.dataset.index));};$("gymExerciseSearch").onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!visibleGymExercises.length)return;gymExerciseIndex=(gymExerciseIndex+(e.key==='ArrowDown'?1:-1)+visibleGymExercises.length)%visibleGymExercises.length;renderGymExerciseChoices();$('gymExerciseResults').querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'){e.preventDefault();chooseGymExercise(gymExerciseIndex);}};
$('closeAssistant').onclick=()=>$('assistantDialog').close();
$('assistantDialog').addEventListener('close',()=>$('floatingAssistant')?.classList.remove('is-open'));
$('assistantMessage').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!$('assistantForm').querySelector('[type=submit]').disabled)$('assistantForm').requestSubmit();}});
// "Měl jsem snickers": the assistant's draft of food entries, logged only on confirmation.
function renderFoodDraft(message,result){
  const d=result.draft,items=d.items,mealOptions=v=>mealSlots.map(m=>'<option value="'+m.id+'"'+(m.id===v?' selected':'')+'>'+esc(m.name)+'</option>').join('');
  const guess=()=>{const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:USER_TZ,hour:'2-digit',hourCycle:'h23'}).format(new Date()));return h<10?'breakfast':h<12?'snack_am':h<15?'lunch':h<18?'snack_pm':'dinner'};
  const per=(p,g,k)=>p&&p[k]!=null?Math.round(Number(p[k])*Number(g)/10)/10:null;
  const row=(it,i)=>'<div class="food-draft-row" data-i="'+i+'"><div><strong>'+esc(it.name)+'</strong><small>'+(it.product?(it.product.source==='personal'?'uložená potravina':'dohledáno AI'+(it.product.confidence?uiText(' · jistota ', ' · confidence ')+esc({high:'vysoká',medium:'střední',low:'nízká'}[it.product.confidence]||it.product.confidence):'')+(it.product.sources?.length?' · <a href="'+esc(it.product.sources[0].url)+'" target="_blank" rel="noopener noreferrer">zdroj</a>':'')):'hodnoty nenalezeny, zadej je ve Výživě')+(it.portion?' · '+esc(it.portion):'')+'</small></div>'+(it.product&&it.basis!=='portion'?'<label><input type="number" min="1" max="5000" value="'+it.grams+'" data-grams> '+esc(it.basis)+'</label><span data-kcal>'+fmt(per(it.product,it.grams,'calories_100g'))+' kcal</span>':'<span></span><span>—</span>')+'</div>';
  $('assistantConversation').querySelector('.food-draft')?.remove();
  $('assistantConversation').insertAdjacentHTML('beforeend','<div class="notice food-draft"><p>'+esc(result.answer)+'</p>'+items.map(row).join('')+'<div class="food-draft-foot"><label class="small">Den <input type="date" id="foodDraftDate" value="'+esc(d.date)+'" max="'+localToday()+'"></label><label class="small">Jídlo <select id="foodDraftMeal">'+mealOptions(items.find(i=>i.meal)?.meal||guess())+'</select></label><button class="btn primary" type="button" id="foodDraftSave">Zapsat do jídelníčku</button></div></div>');
  $('assistantConversation').querySelectorAll('[data-grams]').forEach(input=>input.oninput=()=>{const r=input.closest('.food-draft-row'),it=items[Number(r.dataset.i)];it.grams=Number(input.value)||0;r.querySelector('[data-kcal]').textContent=fmt(per(it.product,it.grams,'calories_100g'))+' kcal';});
  $('assistantStatus').textContent='Nic není zapsané, dokud zápis nepotvrdíš.';
  $('foodDraftSave').onclick=async()=>{const b=$('foodDraftSave');b.disabled=true;let done=0;try{for(const it of items){if(!it.product||!(it.grams>0))continue;const unit=it.product.nutrition_basis==='portion'?'portion':it.basis;await jsonFetch('/app/api/food/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:it.product,quantity:unit==='portion'?1:it.grams,unit,date:$('foodDraftDate').value,mealType:$('foodDraftMeal').value})});done++;if(it.product.source==='ai')await rememberAiFood(it.product);}
    $('assistantStatus').textContent='Zapsáno '+done+' z '+items.length+' položek.';b.textContent='✓ Zapsáno';await load();await loadEnteredFood();}catch(error){$('assistantStatus').textContent=uiText('Zápis selhal: ', 'Saving failed: ')+error.message;b.disabled=false;}};
}
// Days ahead can be opened too, so food can be logged as a meal plan for the coming days.
const DAYS_AHEAD=14,lastSelectableDay=()=>dateShift(localToday(),DAYS_AHEAD);
$('viewDate').max=lastSelectableDay();$('viewDate').value=selectedHistoryDate;
async function selectDay(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>lastSelectableDay())return;selectedHistoryDate=date;weekStart=mondayOf(date);state.todayPick=date;$('viewDate').value=date;$('nextDay').disabled=date>=lastSelectableDay();await load();}
$('previousDay').onclick=()=>selectDay(dateShift(selectedHistoryDate,-1));$('nextDay').onclick=()=>selectDay(dateShift(selectedHistoryDate,1));$('viewDate').onchange=e=>selectDay(e.target.value);
$("gymRows").addEventListener("change",e=>{if(e.target.matches("input[data-col]")){const tr=e.target.closest("tr[data-row]");if(tr)persistGymRow(tr).catch(()=>{});}});
$("gymRows").addEventListener("input",e=>{if(e.target.matches("input[data-col]:not([type=checkbox])")){const tr=e.target.closest("tr[data-row]");if(!tr)return;
  // Writing what was actually lifted means the set was done: it goes to history.
  const done=tr.querySelector('input[data-col="8"]');if(done&&!done.checked&&/^[56]$/.test(e.target.dataset.col)&&e.target.value.trim())done.checked=true;clearTimeout(tr._saveTimer);tr._saveTimer=setTimeout(()=>persistGymRow(tr).catch(()=>{}),700);}});

$("sleepRange").onchange=()=>{renderRecovery();renderDetails();};

// Shared metric detail: actual observations, previous 30-day baseline, range and point inspection.
let detailRanges={sleep:30,hrv:30,rhr:30,weight:30,load:30,strength:90};
let selectedStrengthExercise='';
function measured(v){return v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));}
function mean(rows){return rows.length?rows.reduce((s,r)=>s+r.value,0)/rows.length:null;}
function metricDetail(id,title,rows,unit,color,{bars=false}={}){
  const el=$(id);if(!el)return;
  rows=rows.filter(r=>measured(r.value)&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)).map(r=>({...r,value:Number(r.value)})).sort((a,b)=>a.date.localeCompare(b.date));
  const range=detailRanges[id.replace("detail-","")]||30,shown=rows.filter(r=>r.date>=dateShift(localToday(),-range+1)),last=rows.at(-1),prior=last?rows.filter(r=>r.date<last.date&&r.date>=dateShift(last.date,-30)):[],avg=mean(prior),std=prior.length>1?Math.sqrt(prior.reduce((s,r)=>s+(r.value-avg)**2,0)/prior.length):null;
  const value=v=>v==null?"—":fmt(v,1)+" "+unit,delta=last&&avg!=null?last.value-avg:null;
  el.innerHTML='<div class="detail-heading"><div><div class="label">Osobní trend'+infoTip('trend','osobní trend')+'</div><h3>'+esc(title)+'</h3></div><div class="range-tabs">'+[7,30,90].map(n=>'<button class="btn '+(n===range?'selected':'')+'" data-range="'+n+'">'+n+' dní</button>').join('')+'</div></div><div class="detail-stats"><div><span>Poslední záznam</span><strong class="ink" style="--c:'+color+'">'+value(last?.value)+'</strong><small>'+esc(last?dayTitle(last.date):"Bez měření")+'</small></div><div><span>Osobní průměr · předchozích 30 dní</span><strong>'+value(avg)+'</strong><small>'+prior.length+' měření</small></div><div><span>Rozdíl od průměru</span><strong>'+((delta??0)>0?'+':'')+value(delta)+'</strong><small>'+((std!=null&&last)?(Math.abs(delta)<=std?'V běžném rozmezí':'Mimo běžné rozmezí'):'Čekám na historii')+'</small></div></div><svg class="detail-chart" viewBox="0 0 800 280" role="img" aria-label="'+esc(title)+'"></svg><div class="chart-readout" aria-live="polite"></div>';
  el.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{detailRanges[id.replace('detail-','')]=Number(b.dataset.range);renderDetails();});
  const svg=el.querySelector('svg'),W=chartWidth(svg,1200),R=W-24,PW=R-64;svg.setAttribute('viewBox','0 0 '+W+' 280');if(!shown.length){svg.innerHTML='<text x="'+W/2+'" y="140" text-anchor="middle" fill="color-mix(in srgb,var(--muted) 93%,var(--bg))" font-size="17">Bez měření v tomto období</text>';return;}
  const vals=shown.map(r=>r.value);if(avg!=null)vals.push(avg,avg-(std||0),avg+(std||0));let low=Math.min(...vals),high=Math.max(...vals),span=high-low||Math.max(1,Math.abs(high)*.1);low-=span*.12;high+=span*.12;if(bars)low=Math.min(0,low+span*.12);
  const y=v=>232-(v-low)/(high-low)*200,start=dateShift(localToday(),-range+1),x=d=>64+(Date.parse(d)-Date.parse(start))/(Math.max(1,range-1)*86400000)*PW;
  const axis=niceTicks(low,high,3);let out='';for(const v of axis.ticks){out+='<line x1="64" x2="'+R+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="color-mix(in srgb,var(--muted) 21%,var(--bg))"/><text x="54" y="'+(y(v)+4)+'" fill="color-mix(in srgb,var(--muted) 93%,var(--bg))" font-size="13" text-anchor="end">'+fmt(v,axis.digits)+'</text>';}
  if(avg!=null){out+='<rect x="64" y="'+y(avg+(std||0))+'" width="'+PW+'" height="'+Math.max(1,y(avg-(std||0))-y(avg+(std||0)))+'" fill="'+color+'" opacity=".1"/><line x1="64" x2="'+R+'" y1="'+y(avg)+'" y2="'+y(avg)+'" stroke="'+color+'" stroke-dasharray="6 6" opacity=".65"/>';}
  // Daily totals are bars (nothing happens between days); continuous signals are lines broken across missing days.
  const barW=Math.max(3,PW/range*.7);
  shown.forEach((r,i)=>{const p=shown[i-1];if(bars)out+='<rect x="'+(x(r.date)-barW/2)+'" y="'+Math.min(y(r.value),y(0))+'" width="'+barW+'" height="'+Math.max(1,Math.abs(y(0)-y(r.value)))+'" rx="2" fill="'+color+'" opacity=".85"/>';else if(p&&Date.parse(r.date)-Date.parse(p.date)<=2*86400000)out+='<line x1="'+x(p.date)+'" x2="'+x(r.date)+'" y1="'+y(p.value)+'" y2="'+y(r.value)+'" stroke="'+color+'" stroke-width="3"/>';out+='<g data-point="'+i+'" tabindex="0" role="button" aria-label="'+esc(longDate(r.date)+' '+value(r.value))+'"><title>'+esc(longDate(r.date)+' · '+value(r.value))+'</title><circle cx="'+x(r.date)+'" cy="'+y(r.value)+'" r="12" fill="transparent"/>'+(bars?'':'<circle cx="'+x(r.date)+'" cy="'+y(r.value)+'" r="4" fill="'+color+'"/>')+'</g>';});
  out+='<text x="64" y="265" fill="color-mix(in srgb,var(--muted) 93%,var(--bg))" font-size="13">'+esc(dateLabel(start))+'</text><text x="'+R+'" y="265" text-anchor="end" fill="color-mix(in srgb,var(--muted) 93%,var(--bg))" font-size="13">'+esc(dateLabel(localToday()))+'</text>';svg.innerHTML=out;
  svg.querySelectorAll('[data-point]').forEach(p=>{const show=()=>{const r=shown[Number(p.dataset.point)];el.querySelector('.chart-readout').textContent=dayTitle(r.date)+' · '+value(r.value)+(avg!=null?' · '+(r.value>=avg?'+':'')+fmt(r.value-avg,1)+' '+unit+' od průměru':'');};p.onmouseenter=show;p.onfocus=show;p.onclick=show;p.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')show();};});
}
function renderDetails(){
  const sleep=primarySleepSessions(state.sleep?.sessions),wellness=state.fitness?.wellness||[],weights=state.weight?.records||[];
  metricDetail('detail-sleep','Délka spánku',sleep.map(r=>({date:r.date||String(r.endTime).slice(0,10),value:r.durationMin/60})),'h','#b184ff');
  metricDetail('detail-hrv','Variabilita srdečního tepu · HRV',wellness.map(r=>({date:r.id,value:r.hrv})),'ms','#3fda9c');
  metricDetail('detail-rhr','Klidový tep',wellness.map(r=>({date:r.id,value:r.restingHR})),'bpm','#ff9b80');
  metricDetail('detail-weight','Hmotnost',weights.map(r=>({date:String(r.sample_time).slice(0,10),value:r.value_numeric})),'kg','#64d2ff');
  metricDetail('detail-load','Denní tréninková zátěž',wellness.map(r=>({date:r.id,value:r.ctlLoad??r.atlLoad})),'TSS','#a978ff',{bars:true});
  const last=sleep[0],stages=['DEEP','REM','LIGHT','AWAKE'],colors=['#7563ff','#b184ff','#66d4ff','#ffc45c'],names=['Hluboký','REM','Lehký','Bdění'];
  $('readinessCaption').textContent=uiText('Orientační index spánku · ','Approximate sleep index · ')+(last?uiText('poslední záznam ','last record ')+dateLabel(last.date||String(last.endTime).slice(0,10)):'bez záznamu');
  if(last){const age=Math.floor((Date.parse(localToday())-Date.parse(last.date||String(last.endTime).slice(0,10)))/86400000);if(age>1){$('readinessTitle').textContent='Chybí aktuální spánek';$('readinessInsight').textContent='Poslední noc je stará '+age+' dní. Dnešní připravenost nelze odvodit ze staršího záznamu.';$('recoveryTitle').textContent='Poslední dostupný spánek';$('recoverySignal').textContent='Záznam '+dateLabel(last.date||String(last.endTime).slice(0,10));$('recoveryGuide').textContent='Doplň aktuální noc';$('recoveryGuideMeta').textContent='Ze staršího spánku nelze určit dnešní regeneraci.';$('recoveryInsight').textContent='Zobrazuji poslední dostupný spánek. Pro dnešní rozhodnutí chybí aktuální noc.';}}
  const total=last?stages.reduce((s,k)=>s+num(last.stages?.[k]),0):0;
  $('sleepBreakdown').innerHTML=last&&total?'<div class="label">Složení poslední noci · souhrn, nikoli časová osa</div><div class="sleep-composition">'+stages.map((k,i)=>'<span style="width:'+num(last.stages?.[k])/total*100+'%;background:'+colors[i]+'" title="'+names[i]+' '+hm(last.stages?.[k])+'"></span>').join('')+'</div><div class="stage-details">'+stages.map((k,i)=>{const mins=num(last.stages?.[k]),history=sleep.slice(1).filter(r=>r.date>=dateShift(last.date||localToday(),-30)&&measured(r.stages?.[k])),average=history.length?history.reduce((s,r)=>s+num(r.stages[k]),0)/history.length:null;return '<div><span><i style="background:'+colors[i]+'"></i>'+names[i]+'</span><strong>'+hm(mins)+'</strong><small>'+fmt(mins/total*100)+' % · baseline '+(average==null?'—':hm(average))+'</small></div>';}).join('')+'</div>':'<div class="muted">Fáze spánku nejsou dostupné.</div>';
  const recent=sleep.filter(r=>r.date>=dateShift(localToday(),-6)&&r.date<=localToday()),debt=recent.reduce((s,r)=>s+Math.max(0,480-num(r.durationMin)),0);
  $('sleepSummary').innerHTML='<div class="detail-stats"><div><span>Délka vs. orientační cíl 8 h</span><strong>'+((last&&last.durationMin>=480)?'+':'')+(last?fmt(last.durationMin-480)+' min':'—')+'</strong></div><div><span>Součet deficitů · 7 dní</span><strong>'+hm(debt)+'</strong><small>'+recent.length+uiText('/7 zaznamenaných nocí · vůči 8 h, bez kompenzace</small></div><div><span>Průměr zaznamenaných nocí · 7 dní</span><strong>', '/7 recorded nights · against 8 h, no compensation</small></div><div><span>Average of recorded nights · 7 days</span><strong>')+(recent.length?hm(recent.reduce((s,r)=>s+num(r.durationMin),0)/recent.length):'—')+'</strong></div></div>';
  const days=state.week?.days||[],logged=days.filter(d=>num(d.food?.totals?.kcal)>0),actual=logged.reduce((s,d)=>s+num(d.food.totals.kcal),0),target=logged.reduce((s,d)=>s+num(d.daily?.nutrition?.calorieTarget||d.daily?.calories?.target),0),p=logged.reduce((s,d)=>s+num(d.food.totals.protein_g)*4,0),c=logged.reduce((s,d)=>s+num(d.food.totals.carbs_g)*4,0),f=logged.reduce((s,d)=>s+num(d.food.totals.fat_g)*9,0),energy=p+c+f;
  $('nutritionInsights').innerHTML='<div class="detail-stats"><div><span>Zaznamenaná energie</span><strong>'+fmt(actual)+'</strong><small>'+logged.length+uiText(' zaznamenaných dní · kcal</small></div><div><span>Rozdíl od cíle zaznamenaných dní</span><strong>', ' recorded days · kcal</small></div><div><span>Difference from goal on recorded days</span><strong>')+(actual-target>0?'+':'')+fmt(actual-target)+'</strong><small>Nezapsané dny nejsou počítané jako deficit.</small></div><div><span>Poměr energie z maker</span><strong>'+ (energy?[p,c,f].map(v=>fmt(v/energy*100)+'%').join(' / '):'—')+'</strong><small>Protein / sacharidy / tuk</small></div></div>';
  renderGymInsights();renderSourceCoverage();renderStrengthTrend();renderExperience();
  document.querySelectorAll('[data-training-date]').forEach(day=>{const open=()=>{selectedHistoryDate=day.dataset.trainingDate;activate('training');renderTraining();renderDetails();$('trainingActivityTable').scrollIntoView({behavior:'smooth',block:'center'});};day.onclick=open;day.onkeydown=e=>{if(e.key==='Enter')open();};});
}
function renderGymInsights(){
  const rows=(state.gym?.values||[]).slice(7).filter(r=>r[0]==='WORK'),done=rows.filter(r=>r[8]===true||String(r[8]).toUpperCase()==='TRUE'),volume=done.filter(r=>measured(r[5])&&measured(r[6])).reduce((s,r)=>s+Number(r[5])*Number(r[6]),0),rpes=done.filter(r=>measured(r[7])),rpe=rpes.length?rpes.reduce((s,r)=>s+Number(r[7]),0)/rpes.length:null;
  $('gymInsights').innerHTML='<div class="detail-stats"><div><span>Dokončené pracovní série</span><strong>'+done.length+' / '+rows.length+'</strong></div><div><span>Zaznamenaný objem</span><strong>'+fmt(volume)+' kg</strong><small>Součet kg × opakování dokončených sérií</small></div><div><span>Průměrné úsilí · RPE</span><strong>'+ (rpe==null?'—':fmt(rpe,1))+'</strong><small>'+rpes.length+uiText(' sérií s vyplněným RPE</small></div></div>', ' sets with RPE filled in</small></div></div>');
}
function renderStrengthTrend(){
  const history=state.gym?.history||[],exercises=[...new Set(history.map(r=>r.exercise).filter(Boolean))].sort();
  if(!selectedStrengthExercise||!exercises.includes(selectedStrengthExercise))selectedStrengthExercise=exercises[0]||'';
  $('strengthExercise').innerHTML=exercises.map(name=>'<option '+(name===selectedStrengthExercise?'selected':'')+'>'+esc(name)+'</option>').join('')||'<option>Bez uložených sérií</option>';
  const days=new Map();history.filter(r=>r.exercise===selectedStrengthExercise&&measured(r.actual_kg??r.actualKg)).forEach(r=>{const date=String(r.workout_date||r.date).slice(0,10),value=Number(r.actual_kg??r.actualKg),old=days.get(date);if(!old||value>old.value)days.set(date,{date,value});});
  metricDetail('detail-strength',selectedStrengthExercise||'Progres cviku',[...days.values()],'kg','#ffc15c');
  $('strengthExercise').onchange=e=>{selectedStrengthExercise=e.target.value;renderStrengthTrend();};
}
function renderSourceCoverage(){const w=state.fitness?.wellness||[],latest=w.at(-1);$('sourceCoverage').innerHTML='<div class="label">Dostupnost signálů</div>'+[['Spánek',primarySleepSessions(state.sleep?.sessions).length+' nocí'],['HRV',w.filter(r=>measured(r.hrv)).length+' měření'],['Klidový tep',w.filter(r=>measured(r.restingHR)).length+' měření'],['Wellness z Intervals',latest?.id||'Bez dat']].map(([name,value])=>'<div class="metric-line"><span>'+name+'</span><strong>'+esc(value)+'</strong></div>').join('')+'<button class="btn" id="openSources">Spravovat zdroje dat →</button>';$('openSources').onclick=()=>openSettings('connections');}
// Apple Health has no web API: its data reaches the app through Intervals.icu
// or the Google Health app on the iPhone.
function appleHealthGuideHtml(providers){
  const on=id=>providers.some(p=>p.id===id&&p.connected);
  return '<article class="card connection-card apple-guide" data-provider="apple"><div class="detail-heading"><h3>Apple Health · Apple Watch</h3><span class="pill">'+(on('intervals')||on('google')?'Přes připojenou službu':'Návod')+'</span></div><p class="small">Apple Health nemá webové rozhraní. Data dostaneš do aplikace přes Intervals.icu nebo Google Health.</p>'+
    '<details class="apple-how"><summary>Jak připojit</summary><ol class="apple-steps"><li><strong>Přes Intervals.icu</strong> (bez Google účtu). Na iPhonu nainstaluj <a href="https://www.intervalswellnesssync.com/" target="_blank" rel="noopener noreferrer">IntervalsWellnessSync</a> (nebo Intervals Companion či Health Sync) a propoj ji s Intervals.icu. Tady připoj Intervals.icu. Spánek, HRV, klidový tep, váhu a tréninky pak beru z Intervals.'+(on('intervals')?' <span class="pill good">Intervals.icu je připojené</span>':'')+'</li>'+
    '<li><strong>Přes Google Health.</strong> Na iPhonu nainstaluj aplikaci Google Health, v profilu otevři Partnerské aplikace (Partner apps) a povol import z Apple Health. Tady pak připoj Google Health. HRV se touto cestou zatím nepřenáší.'+(on('google')?' <span class="pill good">Google Health je připojené</span>':'')+'</li></ol>'+
    '<p class="small">Spánek z Intervals.icu má jen délku a skóre, ne fáze spánku. Když jsou připojené obě služby, má přednost Google Health.</p></details></article>';
}
async function loadConnections(){try{const data=await jsonFetch('/app/api/connections');setConnectedServices(data.providers.filter(p=>p.connected).map(p=>p.id));$('connectionCards').innerHTML=data.providers.map(p=>serviceCardHtml(p,'settings',{cls:'card connection-card service-card',more:(p.id==='google'&&p.connected&&p.extrasUrl?googleExtrasHtml(p):'')+(p.id==='intervals'&&p.connected&&p.via==='key'?'<button class="btn" type="button" data-intervals-key>Vyměnit API klíč</button>'+intervalsKeyFormHtml(p):'')+(p.connected?'<button class="btn" type="button" data-disconnect="'+esc(p.id)+'">Odpojit</button>':'')})).join('')+appleHealthGuideHtml(data.providers);setSettingsSummary('connections',data.providers.map(p=>p.name+': '+(p.connected?uiText('připojeno','connected'):uiText('nepřipojeno','not connected'))).join(' · '));wireIntervalsKey($('connectionCards'),async()=>{await loadConnections();await load();});document.querySelectorAll('[data-disconnect]').forEach(b=>b.onclick=async()=>{const name=b.closest('.connection-card').querySelector('h3').textContent;if(!confirm(uiText('Opravdu odpojit '+name+'? Data z této služby se přestanou načítat.','Disconnect '+name+'? Data from this service will stop loading.')))return;try{await jsonFetch('/app/api/connections',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:b.dataset.disconnect})});location.reload();}catch(error){toast(error.message);}});}catch(e){$('connectionCards').innerHTML=uiText('<div class="notice">Nastavení nelze načíst: ', '<div class="notice">Settings couldn\'t be loaded: ')+esc(e.message)+'</div>';}}
function installDetailViews(){
  const style=document.createElement('style');style.textContent='#detail-strength{margin-top:14px}.detail-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.detail-heading h3{margin:4px 0 15px;font-size:18px}.range-tabs{display:flex;gap:3px}.range-tabs .btn{font-size:var(--fs-small);padding:6px 8px}.range-tabs .selected{background:var(--primary-surface);border-color:var(--primary)}.detail-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:15px 0}.detail-stats span,.detail-stats small{display:block;color:color-mix(in srgb,var(--muted) 93%,var(--bg));font-size:var(--fs-small)}.detail-stats strong{display:block;font-size:26px;letter-spacing:-.04em;margin:4px 0}.detail-chart{width:100%;height:280px;display:block}.chart-readout{min-height:24px;color:color-mix(in srgb,var(--muted) 26%,var(--text));font-size:var(--fs-small)}.sleep-composition{display:flex;height:26px;border-radius:8px;overflow:hidden;margin:18px 0}.stage-details{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.stage-details span,.stage-details strong,.stage-details small{display:block}.stage-details strong{font-size:22px;margin:5px 0}.stage-details small{font-size:var(--fs-small);color:color-mix(in srgb,var(--muted) 93%,var(--bg))}.stage-details i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.connection-metrics{display:flex;flex-wrap:wrap;gap:6px}.connection-card .btn{display:inline-block;text-decoration:none}.metric-link{cursor:pointer}.metric-link:hover{border-color:var(--primary)}.view-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}@media(max-width:700px){.detail-stats{gap:12px;grid-template-columns:1fr}.detail-stats strong{font-size:24px}.view-detail-grid{grid-template-columns:1fr}.stage-details{grid-template-columns:1fr 1fr}.detail-chart{height:auto}.detail-heading{align-items:flex-start;flex-direction:column}}';document.head.appendChild(style);
  $('recovery').insertAdjacentHTML('beforeend','<div class="section">Podrobnosti a osobní baseline</div><div class="card" id="sleepSummary"></div><div class="card" id="sleepBreakdown" style="margin-top:12px"></div><div class="card" id="detail-sleep" style="margin-top:12px"></div><div class="view-detail-grid"><div class="card" id="detail-hrv"></div><div class="card" id="detail-rhr"></div></div><div class="card" id="detail-weight" style="margin-top:12px"></div><div class="card" id="sourceCoverage" style="margin-top:12px"></div>');
  $('training').insertAdjacentHTML('beforeend','<div class="section">Zátěž proti vlastnímu normálu</div><div class="card" id="detail-load"></div>');
  $('nutrition').insertAdjacentHTML('afterbegin','<div class="card" id="nutritionInsights" style="margin-bottom:16px"></div>');
  // Gym statistics live in Trénink; the gym builder is part of Workouty.
  $('gymHistory').closest('.card').insertAdjacentHTML('beforebegin','<div class="card" id="gymInsights" style="margin-bottom:12px"></div>');
  $('gymHistory').closest('.card').insertAdjacentHTML('afterend','<div class="section">Silový progres'+infoTip('strengthTrend','silový progres')+'</div><div class="card"><div class="select-row"><label for="strengthExercise" class="small">Vyber cvik</label><select id="strengthExercise"></select></div><div id="detail-strength"></div></div>');
  // Settings as a list of sections that open one at a time (Propojení, Profil
  // a cíl, Trénink, Vzhled a jazyk, Účet, Uživatelé); each line says what is set.
  document.querySelector('.content').insertAdjacentHTML('beforeend','<section class="view" id="settings"><div class="hero section-hero"><div><div class="eyebrow">Účet, data a aplikace</div><h1>Nastavení</h1></div></div><div class="settings-list">'+
    settingsSectionHtml('connections','device','Propojení','Google Health a Intervals.icu','<div class="grid2" id="connectionCards"><div class="notice">Načítám propojení…</div></div>')+
    settingsSectionHtml('profile','scale','Profil a cíl','Pohlaví, věk, výška, pohyb a cíl','')+
    settingsSectionHtml('training','bike','Trénink','FTP, zóny a časové možnosti','')+
    settingsSectionHtml('appearance','moon','Vzhled a jazyk','Světlý nebo tmavý vzhled, čeština nebo angličtina','<div class="card theme-card"><div><h3>Vzhled</h3><p class="small">Řídí se zařízením, dokud nezvolíš jinak.</p></div><div class="theme-choices" role="group" aria-label="Vzhled"><button class="btn" type="button" data-theme-choice="light">Světlý</button><button class="btn" type="button" data-theme-choice="dark">Tmavý</button></div></div><div class="card theme-card"><div><h3>Jazyk</h3><p class="small">Řídí se jazykem zařízení, dokud nezvolíš jinak.</p></div><div class="theme-choices" role="group" aria-label="Jazyk"><button class="btn" type="button" data-lang-choice="cs" lang="cs" data-no-i18n>Čeština</button><button class="btn" type="button" data-lang-choice="en" lang="en" data-no-i18n>English</button></div></div>')+
    settingsSectionHtml('account','sliders','Účet','Přihlášení a průvodce nastavením','<div class="card" id="accountCard"><div class="small">Načítám účet…</div></div>')+
    settingsSectionHtml('users','chat','Uživatelé','Pozvánky a přístupy','',true)+
    '</div></section>');
// Light / dark: the lw-theme cookie (read again before paint in the page head) or the system setting.
// Without the lw-theme cookie the device decides; picking the device's own theme clears the cookie.
function systemTheme(){return window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}
function themeChoice(){const m=document.cookie.match(/(?:^|; )lw-theme=(light|dark)/);return m?m[1]:systemTheme();}
function syncThemeUi(){const choice=themeChoice();
  document.querySelectorAll('[data-theme-choice]').forEach(b=>{const on=b.dataset.themeChoice===choice;b.setAttribute(b.getAttribute('role')==='radio'?'aria-checked':'aria-pressed',String(on));b.classList.toggle('selected',on);});
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{m.content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();});}
function setTheme(choice){
  if(choice===systemTheme()){document.cookie='lw-theme=; path=/; max-age=0; samesite=lax';delete document.documentElement.dataset.theme;}
  else{document.cookie='lw-theme='+choice+'; path=/; max-age=31536000; samesite=lax';document.documentElement.dataset.theme=choice;}
  syncThemeUi();}
document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>setTheme(b.dataset.themeChoice));
// Jazyk: Čeština / English. Without the lw-lang cookie the device language decides
// (src/i18n.js); picking the device's own language clears it. The page reloads,
// because the English texts are applied while the page is built.
document.querySelectorAll('[data-lang-choice]').forEach(b=>{const on=b.dataset.langChoice===(document.documentElement.lang||'cs');b.setAttribute('aria-pressed',String(on));b.classList.toggle('selected',on);
  b.onclick=()=>{const choice=b.dataset.langChoice;if(choice===(document.documentElement.lang||'cs'))return;
    document.cookie=choice===document.documentElement.dataset.deviceLang?'lw-lang=; path=/; max-age=0; samesite=lax':'lw-lang='+choice+'; path=/; max-age=31536000; samesite=lax';location.reload();};});
if(window.matchMedia)matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',syncThemeUi);
syncThemeUi();
  // Keep the summary first, metric details next, and raw history last.
  const recovery=$('recovery'),history=recovery.querySelector('.recovery-history');
  recovery.querySelectorAll('.section').forEach(el=>{if(el.textContent==='Podrobnosti a osobní baseline')el.remove();});
  recovery.querySelectorAll('.recovery-dashboard').forEach(el=>el.hidden=true);
  const detailBlock=document.createElement('div');detailBlock.innerHTML='<div class="section">Podrobnosti a osobní baseline</div>';
  ['sleepSummary','sleepBreakdown','detail-sleep'].forEach(id=>detailBlock.appendChild($(id)));
  detailBlock.appendChild($('detail-hrv').parentElement);
  ['detail-weight','sourceCoverage'].forEach(id=>detailBlock.appendChild($(id)));
  recovery.insertBefore(detailBlock,history);
  // Legacy graphs use their actual viewBox rather than a second, conflicting coordinate system.
  $('tssChart').setAttribute('viewBox','0 0 700 250');
  $('sleepChart').setAttribute('viewBox','0 0 700 250');
  document.querySelectorAll('#overview .score-orb span,#recovery .score-orb span').forEach(el=>el.textContent='spánek');
  document.querySelectorAll('.quick-grid .card').forEach((card,i)=>{card.classList.add('metric-link');card.tabIndex=0;card.setAttribute('role','button');const open=()=>{activate(i<2?'recovery':'training');};card.onclick=open;card.onkeydown=e=>{if(e.key==='Enter')open();};});
}
const previousLoad=load;load=async()=>{await previousLoad();renderDetails();};
const previousRenderGym=renderGym;renderGym=()=>{previousRenderGym();renderGymInsights();renderStrengthTrend();};
let foodCandidates=[],foodSelected=null,foodLibraryPromises={};
function parseFoodQuantity(value){
  const text=String(value??'').trim().replace(',','.');
  const fraction=text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  const result=fraction?Number(fraction[1])/Number(fraction[2]):Number(text);
  return text&&Number.isFinite(result)&&result>0?result:null;
}
function foodPackageSize(value){
  const text=String(value||'').toLowerCase().replace(',','.');
  const multi=text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  const single=text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/),match=multi||single;
  if(!match)return null;const count=multi?Number(match[1]):1,amount=Number(match[multi?2:1]),unit=match[multi?3:2];
  return {amount:amount*(unit==='kg'||unit==='l'?1000:unit==='cl'?10:1),unit:/ml|cl|^l$/.test(unit)?'ml':'g',count};
}
function foodPortionDefaults(product){
  const pack=foodPackageSize(product?.quantity),serving=foodPackageSize(product?.serving_size);
  const basis=product?.nutrition_basis==='ml'?'ml':product?.nutrition_basis==='g'?'g':pack?.unit||serving?.unit||'g';
  return {basis,package:pack,serving,unit:pack?'pack':basis,quantity:1*(pack?1:100)};
}
function foodIntake(product,quantity,unit,options={}){
  const q=parseFoodQuantity(quantity);if(!q||q>10000)throw new Error('Zadej množství, například 100, 0,5 nebo 1/2.');
  const meta=foodPortionDefaults(product);let amount=q,amountUnit=unit;
  if(unit==='pack'){if(!meta.package)throw new Error('Velikost balení není známá. Zadej g/ml nebo velikost jednoho kusu.');amount=q*meta.package.amount;amountUnit=meta.package.unit;}
  else if(unit==='piece'){const saved=foodPackageSize(product?.piece_size),piece=parseFoodQuantity(options.pieceAmount)||saved?.amount;if(!piece)throw new Error('Doplň velikost jednoho kusu podle etikety nebo vážení.');amount=q*piece;amountUnit=options.pieceUnit||saved?.unit||meta.basis;}
  else if(unit!=='g'&&unit!=='ml'&&unit!=='portion')throw new Error('Neplatná jednotka.');
  if(product?.nutrition_basis==='portion'){if(unit!=='portion')throw new Error('Hodnoty jsou za celou porci. Zadej počet porcí.');amount=q;amountUnit='portion';}
  else if(unit==='portion'){if(!meta.serving)throw new Error('Doplň velikost jedné porce v g/ml.');amount=q*meta.serving.amount;amountUnit=meta.serving.unit;}
  if(amountUnit!==meta.basis&&amountUnit!=='portion'){const density=parseFoodQuantity(options.density);if(!density)throw new Error('Převod g ↔ ml vyžaduje hustotu v g/ml. Nebo použij jednotku nutriční tabulky.');amount=amountUnit==='ml'?amount*density:amount/density;amountUnit=meta.basis;}
  if(amount>100000)throw new Error('Množství je příliš velké.');
  const factor=amountUnit==='portion'?q:amount/100,result={amount,unit:amountUnit,factor};
  for(const [key,field]of [['calories','calories_100g'],['protein_g','protein_100g'],['carbs_g','carbs_100g'],['fat_g','fat_100g'],['fiber_g','fiber_100g'],['salt_g','salt_100g']])result[key]=product?.[field]==null||product[field]===''?null:Number(product[field])*factor;
  return result;
}

function loadFoodLibrary(url,globalName){if(window[globalName])return Promise.resolve(window[globalName]);if(!foodLibraryPromises[url])foodLibraryPromises[url]=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=()=>resolve(window[globalName]);script.onerror=()=>{delete foodLibraryPromises[url];reject(new Error('Čtečku se nepodařilo načíst. Zkontroluj připojení.'));};document.head.appendChild(script);});return foodLibraryPromises[url];}
function foodMessage(text){$('foodEntryStatus').textContent=text;}
function foodEditorProduct(){const p={...foodSelected,name:$('foodProductName').value.trim(),brand:$('foodBrand').value.trim(),nutrition_basis:$('foodBasis').value};for(const field of ['calories_100g','protein_100g','carbs_100g','fat_100g','fiber_100g','salt_100g']){const value=$('food-'+field).value.trim().replace(',','.');p[field]=value===''?null:Number(value);}return p;}
function updateFoodPreview(){const p=foodEditorProduct(),unit=$('foodUnit').value; $('foodPieceSettings').hidden=unit!=='piece';const inputUnit=unit==='piece'?$('foodPieceUnit').value:unit==='pack'?foodPortionDefaults(p).package?.unit:unit;$('foodDensitySettings').hidden=!(inputUnit&&inputUnit!=='portion'&&inputUnit!==p.nutrition_basis);$('foodBasisLabel').textContent=p.nutrition_basis==='portion'?'Hodnoty za jednu uvedenou porci':'Hodnoty na 100 '+p.nutrition_basis;try{const amount=foodIntake(p,$('foodGrams').value,unit,{pieceAmount:$('foodPieceAmount').value,pieceUnit:$('foodPieceUnit').value,density:$('foodDensity').value});$('foodPortionPreview').textContent=fmt(amount.amount,2)+' '+({portion:'porce'}[amount.unit]||amount.unit)+' · '+[['calories','kcal'],['protein_g','g bílkovin'],['carbs_g','g sacharidů'],['fat_g','g tuku']].map(([k,label])=>(amount[k]==null?'—':fmt(amount[k],1))+' '+label).join(' · ');$('foodSaveButton').disabled=false;}catch(error){$('foodPortionPreview').textContent=error.message;$('foodSaveButton').disabled=true;}}
function selectFoodProduct(p){foodSelected={...p};$('foodEditor').hidden=false;$('foodProductName').value=p.name||'';$('foodBrand').value=p.brand||'';const meta=foodPortionDefaults(p);$('foodBasis').value=p.nutrition_basis==='portion'?'portion':meta.basis;$('foodUnit').value=p.nutrition_basis==='portion'?'portion':meta.package?.unit==='ml'?'ml':meta.unit;$('foodGrams').value=p.nutrition_basis==='portion'?'1':meta.package?.unit==='ml'?meta.package.amount:String(meta.quantity);$('foodPieceAmount').value=meta.serving?.amount||'';$('foodPieceUnit').value=meta.serving?.unit||meta.basis;$('foodDensity').value='';if(p.preferred_unit&&['pack','piece','portion'].includes(p.preferred_unit)){$('foodUnit').value=p.preferred_unit;$('foodGrams').value='1';}for(const field of ['calories_100g','protein_100g','carbs_100g','fat_100g','fiber_100g','salt_100g'])$('food-'+field).value=p[field]??'';$('foodSource').textContent=(p.nutrition_basis==='portion'?'Přepsané hodnoty za uvedenou porci':'Hodnoty z etikety')+(p.quantity?' · balení '+p.quantity:'')+(p.barcode?' · EAN '+p.barcode:'');updateFoodPreview();}
async function searchFood(){const b=$('foodSearchButton');b.disabled=true;foodMessage('Dohledávám potravinu…');try{const name=$('foodQuery').value.trim(),barcode=$('foodBarcode').value.trim();if(!name&&!barcode)throw new Error('Napiš název nebo čárový kód.');const r=await jsonFetch('/app/api/food/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,barcode})});foodCandidates=r.candidates?.length?r.candidates:r.product?[r.product]:[];$('foodResults').innerHTML=foodCandidates.map((p,i)=>'<button type="button" class="food-result" data-food-index="'+i+'"><strong>'+esc(p.name)+'</strong><span class="small">'+esc(p.brand||'Bez značky')+(p.quantity?' · '+esc(p.quantity):'')+' · '+(p.calories_100g==null?'energie neuvedena':fmt(p.calories_100g)+' kcal / 100 '+(p.nutrition_basis||'g'))+'</span></button>').join('');$('foodResults').querySelectorAll('[data-food-index]').forEach(b=>b.onclick=()=>selectFoodProduct(foodCandidates[Number(b.dataset.foodIndex)]));if(foodCandidates.length===1)selectFoodProduct(foodCandidates[0]);foodMessage((r.suggestion?'Výsledky pro „'+r.suggestion+'“. ':'')+(foodCandidates.length?(r.providerUnavailable?'Výrobková databáze neodpovídá. Zobrazuji dostupné uložené potraviny.':'Vyber správnou variantu a množství. U surovin rozlišuj suchou, syrovou a vařenou hmotnost.'):'Potravinu nemáme. Dohledej ji přes AI, načti etiketu nebo zadej hodnoty ručně.'));if(!foodCandidates.length)$('foodResults').innerHTML='<button type="button" class="btn primary" id="foodAiLookup">🔎 Dohledat nutriční hodnoty přes AI</button>';const ai=$('foodAiLookup');if(ai)ai.onclick=lookupFoodAi;}catch(e){foodMessage(e.message);}finally{b.disabled=false;}}
// A food found by AI and confirmed by logging it becomes the user's own food,
// with its barcode, so the next search or scan finds it without AI.
async function rememberAiFood(p){try{await jsonFetch('/app/api/food/personal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,source:'personal'})});toast('„'+p.name+'“ je uložené pro příště'+(p.barcode?' i s čárovým kódem.':'.'));}catch(error){toast('Jídlo je zapsané, ale potravina pro příště se neuložila: '+error.message);}}
// AI looks the food up on the web; the values go to the editor to be checked.
async function lookupFoodAi(){
  const b=$('foodAiLookup'),name=$('foodQuery').value.trim(),barcode=$('foodBarcode').value.trim();
  if(!name&&!barcode){foodMessage('Napiš název potraviny (u naskenovaného kódu pomůže i značka).');$('foodQuery').focus();return}
  if(b){b.disabled=true;b.textContent='AI hledá na webu…';}foodMessage('Dohledávám „'+(name||barcode)+'“ na webu…');
  try{const r=await jsonFetch('/app/api/food/ai-lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,barcode})});
    if(r.status!=='ok'||!r.product){foodMessage(r.message||'AI výrobek nenašla. Načti etiketu nebo zadej hodnoty ručně.');return}
    selectFoodProduct(r.product);
    const p=r.product,conf={high:'vysoká',medium:'střední',low:'nízká'}[p.confidence]||p.confidence;
    $('foodSource').textContent='Dohledáno AI · jistota '+conf+(p.barcode?' · EAN '+p.barcode:'');$('foodResults').innerHTML=foodAiCard(p);
    foodMessage('Zkontroluj hodnoty proti obalu. Po uložení jídla si potravinu zapamatuji'+(p.barcode?' i s čárovým kódem':'')+' a příště ji najdu bez AI.');
  }catch(e){foodMessage(e.message);}finally{if(b){b.disabled=false;b.textContent='🔎 Dohledat nutriční hodnoty přes AI';}}
}
// What the AI found, as a card: the product, how sure it is, its values and
// sources; links the model wrote into its note become source chips.
function foodAiCard(p){
  const level={high:3,medium:2,low:1}[p.confidence]||0,conf={high:'vysoká',medium:'střední',low:'nízká'}[p.confidence]||p.confidence||'neznámá',basis=p.nutrition_basis==='portion'?'porci':'100 '+(p.nutrition_basis==='100ml'?'ml':'g');
  const sources=[...(p.sources||[])],seen=new Set(sources.map(x=>x.url));
  let note=String(p.note||'').replace(/\(?\[([^\]]+)\]\((https?:[^)\s]+)\)\)?/g,(m,text,url)=>{if(!seen.has(url)){seen.add(url);sources.push({url,title:text});}return '';}).replace(/\(?https?:\/\/\S+\)?/g,'').replace(/\s*Nutriční údaje jsou (uvedeny )?na 100 ?(g|ml)\.?/i,'').replace(/\s{2,}/g,' ').replace(/\s+([.,;])/g,'$1').trim();
  const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u}};
  const val=(v,unit,label)=>'<div><b>'+(v==null||v===''?'—':esc(unit==='kcal'?fmt(v):cz(v,1)))+'</b><span>'+(unit==='kcal'?'kcal':unit+' '+label)+'</span></div>';
  return '<div class="food-ai-card"><div class="fac-head"><span class="fac-badge">✦ Dohledáno AI</span><span class="fac-conf conf-'+level+'" title="Jistota AI">'+[1,2,3].map(i=>'<i'+(i<=level?' class="on"':'')+'></i>').join('')+'jistota '+esc(conf)+'</span></div>'+
    '<strong class="fac-name">'+esc(p.name||'Výrobek')+'</strong><span class="fac-meta">'+esc([p.brand,p.quantity,p.barcode?'EAN '+p.barcode:''].filter(Boolean).join(' · '))+'</span>'+
    '<div class="fac-values"><small>Na '+esc(basis)+'</small>'+val(p.calories_100g,'kcal')+val(p.protein_100g,'g','bílk.')+val(p.carbs_100g,'g','sach.')+val(p.fat_100g,'g','tuky')+'</div>'+
    (note?'<p class="fac-note">⚠ '+esc(note)+'</p>':'')+
    (sources.length?'<div class="fac-sources">'+sources.slice(0,4).map(x=>'<a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer" title="'+esc(x.title||x.url)+'">🔗 '+esc(host(x.url))+' ↗</a>').join('')+'</div>':'')+'</div>';
}
async function recognizeFoodPhotoSummary(worker,file,object){
  const first=await worker.recognize(object),line=(first.data.lines||[]).find(l=>/kcal/i.test(l.text)&&/\d[.,]\d\s*g/i.test(l.text));
  if(!line?.bbox)return first;
  const bitmap=await createImageBitmap(file);try{const box=line.bbox,h=Math.max(20,box.y1-box.y0),top=Math.max(0,Math.floor(box.y0-h*3)),height=Math.min(bitmap.height-top,Math.ceil(h*12)),scale=Math.min(2,2400/bitmap.width),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(height*scale);const c=canvas.getContext('2d');c.drawImage(bitmap,0,top,bitmap.width,height,0,0,canvas.width,canvas.height);const pixel=c.getImageData(0,0,1,1).data;if((pixel[0]+pixel[1]+pixel[2])/3<120){c.filter='invert(1) grayscale(1)';c.drawImage(bitmap,0,top,bitmap.width,height,0,0,canvas.width,canvas.height);}await worker.setParameters({tessedit_pageseg_mode:'6'});const cropped=await worker.recognize(canvas),parsed=await jsonFetch('/app/api/food/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:cropped.data.text,mode:'portion'})});return ['calories_100g','protein_100g','carbs_100g','fat_100g'].every(k=>parsed.values[k]!=null)?cropped:first;}finally{bitmap.close();}
}
// The photo goes to AI vision first (label, portion summary or a meal on a
// plate); OCR on the device is the fallback when AI is not available.
async function foodPhotoDataUrl(file,max=1600){
  const bitmap=await createImageBitmap(file);
  try{const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.88);}
  finally{bitmap.close();}
}
async function readFoodPhotoAi(file,kind){
  if(state.foodPhotoAi===false)return false;
  try{
    foodMessage('Čtu fotografii pomocí AI…');
    const r=await jsonFetch('/app/api/food/photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:await foodPhotoDataUrl(file),mode:kind==='portion'?'portion':'label'})});
    if(r.status!=='ok'){foodMessage(r.message);return true;}
    const portion=r.basis==='portion';
    $('foodOcrText').value=r.text;$('foodPhotoMode').value=portion?'portion':'label';
    selectFoodProduct({...(portion?{}:foodSelected),name:r.name||(portion?'Jídlo z fotografie':foodSelected?.name||$('foodQuery').value.trim()),barcode:portion?null:foodSelected?.barcode||$('foodBarcode').value.trim(),quantity:portion?'':foodSelected?.quantity||'',serving_size:r.servingSize||foodSelected?.serving_size,...r.values,nutrition_basis:portion?'portion':r.basis==='100ml'?'ml':'g',source:'package_label'});
    const conf={high:'vysoká',medium:'střední',low:'nízká'}[r.confidence]||r.confidence;
    $('foodSource').textContent=(r.kind==='meal_photo'?'Odhad AI z fotky jídla':portion?'Přečteno AI · hodnoty za porci':uiText('Přečteno AI z etikety · na 100 ', 'Read by AI from the label · per 100 ')+(r.basis==='100ml'?'ml':'g'))+uiText(' · jistota ', ' · confidence ')+conf;
    foodMessage([r.warning,r.note,r.kind==='meal_photo'?'Jde o odhad podle fotky: uprav gramy nebo hodnoty, pokud víš víc.':'Zkontroluj hodnoty proti fotce; přepis můžeš opravit níže.'].filter(Boolean).join(' '));
    return true;
  }catch(error){
    // No AI on the server: remember it for this visit and read on the device.
    if(/AI není připojena/.test(error.message))state.foodPhotoAi=false;
    return false;
  }
}
// A barcode photo in any orientation: the bars are decoded straight and
// turned by 90°, 180° and 270°; when that fails, AI reads the printed digits.
const BARCODE_FORMATS=['ean_13','ean_8','upc_a','upc_e'];
function zxingHints(ZX){return new Map([[ZX.DecodeHintType?.TRY_HARDER??3,true]])}
function barcodeCanvas(bitmap,deg,max=1600){
  const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale),side=deg%180!==0;
  const canvas=document.createElement('canvas');canvas.width=side?h:w;canvas.height=side?w:h;
  const c=canvas.getContext('2d');c.translate(canvas.width/2,canvas.height/2);c.rotate(deg*Math.PI/180);c.drawImage(bitmap,-w/2,-h/2,w,h);return canvas;
}
async function decodeBarcodePhoto(file){
  const bitmap=await createImageBitmap(file),valid=v=>/^\d{8,14}$/.test(String(v||''));
  try{
    const turns=[0,90,270,180].map(deg=>barcodeCanvas(bitmap,deg));
    if('BarcodeDetector'in window){try{const detector=new BarcodeDetector({formats:BARCODE_FORMATS});for(const canvas of turns){const code=(await detector.detect(canvas)).map(c=>c.rawValue).find(valid);if(code)return code;}}catch{}}
    try{const ZX=await loadFoodLibrary('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js','ZXingBrowser'),reader=new ZX.BrowserMultiFormatReader(zxingHints(ZX));
      for(const canvas of turns){try{const code=(await reader.decodeFromImageUrl(canvas.toDataURL('image/png'))).getText();if(valid(code))return code;}catch{}}}catch{}
    if(state.foodPhotoAi!==false){
      foodMessage('Čtu číslo pod čárovým kódem pomocí AI…');
      try{const r=await jsonFetch('/app/api/food/photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:await foodPhotoDataUrl(file),mode:'barcode'})});if(valid(r.barcode))return r.barcode;}
      catch(error){if(/AI není připojena/.test(error.message))state.foodPhotoAi=false;}
    }
    return '';
  }finally{bitmap.close();}
}
// A scanned or typed code: saved foods first, then AI on the web when unknown.
async function lookupBarcode(code){
  $('foodBarcode').value=code;$('foodQuery').value='';
  await searchFood();
  if(!foodCandidates.length&&$('foodBarcode').value===code)await lookupFoodAi();
}
async function readFoodPhoto(file,kind){if(!file)return;if(!file.type.startsWith('image/')||file.size>15*1024*1024){foodMessage('Vyber fotografii JPG/PNG do 15 MB.');return;}const object=URL.createObjectURL(file);let worker;try{foodMessage(kind==='barcode'?'Čtu čárový kód…':'Načítám čtečku etikety…');if(kind==='barcode'){
    const code=await decodeBarcodePhoto(file);
    if(!code)throw new Error('Čárový kód není čitelný. Vyfoť ho zblízka, nebo opiš číslo.');await lookupBarcode(code);
  }else{if(await readFoodPhotoAi(file,kind))return;const OCR=await loadFoodLibrary('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','Tesseract');worker=await OCR.createWorker('ces+eng',1,{logger:m=>{if(m.status==='recognizing text')foodMessage('Čtu fotografii: '+Math.round(m.progress*100)+' %');}});const result=kind==='portion'?await recognizeFoodPhotoSummary(worker,file,object):await worker.recognize(object);$('foodOcrText').value=result.data.text;$('foodOcrDetails').open=true;$('foodPhotoMode').value=kind==='portion'?'portion':'label';await applyFoodLabel();if(kind==='portion'&&['protein_100g','carbs_100g','fat_100g'].some(k=>!$('food-'+k).value)){await worker.setParameters({tessedit_pageseg_mode:'6'});const second=await worker.recognize(object);const r=await jsonFetch('/app/api/food/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:second.data.text,mode:'portion'})});if(['calories_100g','protein_100g','carbs_100g','fat_100g'].every(k=>r.values[k]!=null)){$('foodOcrText').value=second.data.text;await applyFoodLabel();}else foodMessage('Některé hodnoty na fotce jsou nečitelné. Přepsané údaje zůstaly v návrhu; chybějící pole doplň ručně.');}}
  }catch(e){foodMessage(kind==='barcode'?'Kód se nepodařilo přečíst. Opiš číslo pod čárovým kódem nebo zkus ostřejší fotografii.':e.message);}finally{if(worker)await worker.terminate();URL.revokeObjectURL(object);}}
async function applyFoodLabel(mode=$('foodPhotoMode').value){try{const r=await jsonFetch('/app/api/food/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:$('foodOcrText').value,mode})});selectFoodProduct({...(mode==='portion'?{}:foodSelected),name:mode==='portion'?r.name:foodSelected?.name||$('foodQuery').value.trim(),barcode:mode==='portion'?null:foodSelected?.barcode||$('foodBarcode').value.trim(),quantity:mode==='portion'?'':foodSelected?.quantity,...r.values,nutrition_basis:mode==='portion'?'portion':/100\s*ml/i.test($('foodOcrText').value)?'ml':'g',source:'package_label'});foodMessage((r.warning?r.warning+' ':'')+(mode==='portion'?(r.ambiguous?'Fotka obsahuje také sloupec na 100 g/ml. Použil jsem poslední sloupec; porovnej přepsané hodnoty s fotkou.':'Hodnoty jsou za celou porci. Počet porcí může být i 1/2. Před uložením můžeš opravit přepis.'):'Přepsané hodnoty můžeš upravit. Zvol základ 100 g nebo 100 ml podle etikety.'));}catch(e){foodMessage(e.message);}}
// The meal is in the diary the moment it is saved; the server's answer then
// replaces it, or takes it out again with the reason when saving failed.
async function saveFoodEntry(e){e.preventDefault();const b=$('foodSaveButton');b.disabled=true;let shown=null;try{const p=foodEditorProduct(),intake=foodIntake(p,$('foodGrams').value,$('foodUnit').value,{pieceAmount:$('foodPieceAmount').value,pieceUnit:$('foodPieceUnit').value,density:$('foodDensity').value}),meal=$('foodMeal').value;
  const body=JSON.stringify({product:p,quantity:$('foodGrams').value,unit:$('foodUnit').value,pieceAmount:$('foodPieceAmount').value,pieceUnit:$('foodPieceUnit').value,density:$('foodDensity').value,date:$('foodDate').value,mealType:meal});
  shown=showFoodNow({recipe_title:p.name||'Jídlo',consumed_date:$('foodDate').value||localToday(),kcal:intake.calories,protein_g:intake.protein_g,carbs_g:intake.carbs_g,fat_g:intake.fat_g,note:JSON.stringify({mealType:meal})});closeFoodLogger();
  const r=await jsonFetch('/app/api/food/log',{method:'POST',headers:{'Content-Type':'application/json'},body});foodMessage(r.message);toast(r.message);$('basketClear').onclick();
  loadEnteredFood();load();return r;}catch(e){foodMessage(e.message);if(shown!=null){forgetFoodNow(shown);toast(uiText('Jídlo se neuložilo: ', 'The meal wasn\'t saved: ')+e.message);openFoodLogger();}}finally{b.disabled=false;}}
let pendingFoodId=-1;
function renderFoodViews(){for(const render of [renderMealDiary,renderMealList,renderDayOverview,renderDayTimeline])try{render();}catch{/* that part of the page is not built yet */}}
function showFoodNow(entry){const id=pendingFoodId--;mealEntries=[...(mealEntries||[]),{...entry,id,pending:true}];renderFoodViews();return id;}
function forgetFoodNow(id){mealEntries=(mealEntries||[]).filter(e=>e.id!==id);renderFoodViews();}
const mealSlots=[{id:'breakfast',name:'Snídaně',time:'07:00',share:25},{id:'snack_am',name:'Dopolední svačina',time:'10:00',share:10},{id:'lunch',name:'Oběd',time:'12:00',share:30},{id:'snack_pm',name:'Odpolední svačina',time:'16:00',share:10},{id:'dinner',name:'Večeře',time:'19:00',share:25}];
let mealEntries=[],mealDiaryPreview=false,mealEnabled=['breakfast','snack_am','lunch','snack_pm','dinner'];
try{const saved=JSON.parse(localStorage.getItem('pfd-meals-v1')||'null');if(Array.isArray(saved)&&saved.some(id=>mealSlots.some(s=>s.id===id)))mealEnabled=mealSlots.filter(s=>saved.includes(s.id)).map(s=>s.id);}catch{}
function foodMealSlot(entry){try{const note=JSON.parse(entry.note||'{}');return note.mealType==='snack'?'snack_pm':note.mealType||'unassigned';}catch{return 'unassigned'}}
function mealEntryRow(entry){
  if(entry.pending)return '<div class="meal-row is-pending"><div class="meal-row-main"><strong>'+esc(entry.recipe_title||'Jídlo')+'</strong><span>'+fmt(entry.kcal)+uiText(' kcal · ukládám…</span></div></div>', ' kcal · saving…</span></div></div>');
  let ingredients=[];try{ingredients=JSON.parse(entry.note||'{}').ingredients||[]}catch{}
  const slot=foodMealSlot(entry),name=entry.recipe_title||'Jídlo',options=(slot==='unassigned'?'<option value="" selected>Přesunout do…</option>':'')+mealSlots.map(s=>'<option value="'+s.id+'" '+(slot===s.id?'selected':'')+'>'+s.name+'</option>').join('');
  return '<div class="meal-row" data-food-id="'+Number(entry.id)+'"><div class="meal-row-main"><strong>'+esc(name)+'</strong><span>'+fmt(entry.kcal)+' kcal · B '+fmt(entry.protein_g,1)+' g · S '+fmt(entry.carbs_g,1)+' g · T '+fmt(entry.fat_g,1)+' g</span></div>'+(ingredients.length?'<div class="small">'+ingredients.map(a=>esc(a.name)+' '+fmt(a.amount,1)+' '+esc(a.unit)).join(' · ')+'</div>':'')+'<div class="meal-row-actions"><select class="food-input" data-move-food="'+Number(entry.id)+uiText('" aria-label="Přesunout ', '" aria-label="Move ')+esc(name)+uiText(' do jiného jídla">', ' to another meal">')+options+'</select><button type="button" class="btn" data-edit-food="'+Number(entry.id)+'">Upravit</button><button type="button" class="btn" data-copy-food="'+Number(entry.id)+'">Kopírovat</button><button type="button" class="btn" data-delete-food="'+Number(entry.id)+'">Smazat</button></div></div>';
}
function openFoodManage(id,copy=false){
  const entry=mealEntries.find(e=>Number(e.id)===Number(id));if(!entry)return;
  const form=$('foodManageForm');form.elements.id.value=entry.id;form.elements.name.value=entry.recipe_title||'';form.elements.date.value=entry.consumed_date||$('foodDate').value;form.elements.mealType.value=foodMealSlot(entry)==='unassigned'?'snack_pm':foodMealSlot(entry);
  for(const key of ['kcal','protein_g','carbs_g','fat_g'])form.elements[key].value=fmt(entry[key],1);
  $('foodCopyDate').value=dateShift(entry.consumed_date||$('foodDate').value,1);
  $('foodManageDialog').showModal();if(copy)$('foodCopyDate').focus();else form.elements.name.focus();
}
async function refreshFoodDiary(){const date=$('foodDate').value;loadEnteredFood();await load();$('foodDate').value=date;await loadEnteredFood()}
async function changeFoodMeal(id,mealType){
  const entry=(mealEntries||[]).find(e=>Number(e.id)===Number(id));if(entry){try{entry.note=JSON.stringify({...JSON.parse(entry.note||'{}'),mealType});}catch{entry.note=JSON.stringify({mealType});}renderFoodViews();}
  try{await jsonFetch('/app/api/food/entry',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,mealType})});toast('Jídlo je přesunuté.');await refreshFoodDiary()}
  catch(error){toast('Přesun selhal: '+error.message);renderMealDiary()}
}
function renderMealDiary(){
  if(!$('enteredFood'))return;const active=mealSlots.filter(s=>mealEnabled.includes(s.id)),weight=active.reduce((sum,s)=>sum+s.share,0),date=$('foodDate').value||localToday(),nutrition=date===localToday()?state.daily?.nutrition:state.week?.days?.find(d=>d.date===date)?.daily?.nutrition,macros=nutrition?.macros||{},target=num(nutrition?.calorieTarget),totals=entries=>entries.reduce((sum,e)=>{for(const k of ['kcal','protein_g','carbs_g','fat_g'])sum[k]+=num(e[k]);return sum},{kcal:0,protein_g:0,carbs_g:0,fat_g:0});
  const showEntries=entries=>entries.length?entries.map(mealEntryRow).join(''):'<div class="small">Zatím nic zapsáno</div>';
  $('enteredFood').innerHTML=uiText('<div class="detail-heading"><h3>Jídla během dne · ', '<div class="detail-heading"><h3>Meals during the day · ')+esc(longDate(date))+'</h3><input type="date" class="food-input meal-diary-date" value="'+esc(date)+'" aria-label="Datum deníku jídel"><span class="pill">'+fmt(totals(mealEntries).kcal)+' kcal</span></div><div class="meal-preferences">'+mealSlots.map(s=>'<label><input type="checkbox" data-meal-toggle="'+s.id+'" '+(mealEnabled.includes(s.id)?'checked':'')+'> '+s.name+'</label>').join('')+'</div><p class="small">Vyber 3–5 jídel nebo vlastní kombinaci. Volba se ukládá v tomto prohlížeči. Cíle jsou orientační rozložení denního plánu, ne povinnost jíst přesně v tento čas.</p><div class="meal-grid">'+active.map(s=>{const entries=mealEntries.filter(e=>foodMealSlot(e)===s.id),f=totals(entries),share=s.share/weight;return '<section class="card meal-card"><div class="detail-heading"><h3>'+s.name+'</h3><span class="small">'+s.time+'</span></div><div class="meal-target">'+(target?'Cíl '+fmt(target*share)+' kcal · B '+fmt(num(macros.protein_g??macros.proteinGrams)*share)+' g · S '+fmt(num(macros.carbs_g??macros.carbsGrams)*share)+' g · T '+fmt(num(macros.fat_g??macros.fatGrams)*share)+' g':'Denní cíl pro toto datum není dostupný')+'</div><div class="small">Zapsáno '+fmt(f.kcal)+' kcal · B '+fmt(f.protein_g,1)+' g · S '+fmt(f.carbs_g,1)+' g · T '+fmt(f.fat_g,1)+' g</div>'+showEntries(entries)+'<button class="btn" data-add-meal="'+s.id+'" style="margin-top:10px">＋ Zapsat jídlo</button></section>';}).join('')+'</div>';
  $('enteredFood').querySelectorAll('.meal-diary-date').forEach(input=>input.onchange=()=>{$('foodDate').value=input.value;loadEnteredFood()});
  const other=mealEntries.filter(e=>!mealEnabled.includes(foodMealSlot(e)));if(other.length)$('enteredFood').insertAdjacentHTML('beforeend','<h3 style="margin-top:16px">Ostatní a nezařazené záznamy</h3>'+showEntries(other));
  if(mealDiaryPreview)$('enteredFood').insertAdjacentHTML('afterbegin','<div class="notice" style="margin-bottom:12px">Místní náhled: ukázková jídla. Změny zůstávají jen tady.</div>');
  $('enteredFood').querySelectorAll('[data-meal-toggle]').forEach(input=>input.onchange=()=>{const selected=[...$('enteredFood').querySelectorAll('[data-meal-toggle]:checked')].map(i=>i.dataset.mealToggle);if(!selected.length){input.checked=true;toast('Nech vybrané alespoň jedno jídlo.');return}mealEnabled=selected;try{localStorage.setItem('pfd-meals-v1',JSON.stringify(selected));}catch{}renderMealDiary();});
  $('enteredFood').querySelectorAll('[data-add-meal]').forEach(b=>b.onclick=()=>{$('foodMeal').value=b.dataset.addMeal;$('foodQuery').focus();$('foodEntry').scrollIntoView({behavior:'smooth',block:'start'});foodMessage('Zapisuješ: '+mealSlots.find(s=>s.id===b.dataset.addMeal).name);});
  if($('mealDistribution')&&typeof renderNutritionExperience==='function')renderNutritionExperience(state.daily?.nutrition?.foodLog?.totals||{},num(state.daily?.nutrition?.calorieTarget),state.daily||{});
}
let enteredFoodRequest=0;
async function loadEnteredFood(){const request=++enteredFoodRequest;try{const date=$('foodDate').value||localToday(),r=await jsonFetch('/app/api/food/day?date='+date);if(request!==enteredFoodRequest)return;mealEntries=r.entries||[];mealDiaryPreview=Boolean(r.preview);renderMealDiary();foodFeedbackAfterLoad();}catch(e){if(request===enteredFoodRequest)$('enteredFood').textContent=e.message;}}
function installExperience(){
  $('overview').insertAdjacentHTML('afterbegin','<div id="dailyPulse"></div>');
  $('recovery').insertAdjacentHTML('beforeend','<div class="experience-grid"><article class="card" id="sleepNights"></article><article class="card" id="sleepRegularity"></article></div><div class="section">Dlouhodobé zdraví</div><article class="card healthspan-card" id="healthspan"></article>');
  $('nutrition').insertAdjacentHTML('afterbegin','<div class="experience-grid" style="margin-bottom:18px"><article class="card" id="nutritionBalance"></article><article class="card" id="mealDistribution"></article></div>');
  $('training').insertAdjacentHTML('beforeend','<div class="section">Aktivity · detail výkonu a trasy</div><div id="activityGallery" class="activity-gallery"></div><article class="card activity-profile" id="activityProfile" hidden></article>');
  const nights=$('sleepNights').parentElement,recovery=$('recovery');recovery.insertBefore(nights,recovery.querySelector('.recovery-metrics')?.nextSibling||recovery.querySelector('.recovery-history'));
}
function experienceRing(label,value,progress,tone,title,caption){return '<article class="pulse-card" style="--tone:'+tone+'"><div class="pulse-ring" style="--progress:'+Math.min(100,Math.max(0,num(progress)))+'"><strong>'+esc(value)+'</strong></div><div><div class="label">'+esc(label)+'</div><h3>'+esc(title)+'</h3><p>'+esc(caption)+'</p></div></article>';}
function experienceBars(rows,{height=260,max=10,colors=['#7ec8ff'],labels=true}={}){
  const W=typeof window!=='undefined'&&window.innerWidth<700?390:760,H=height,left=45,bottom=38,top=25,plot=H-top-bottom,slot=(W-left-15)/Math.max(1,rows.length),bw=Math.min(44,slot*.7);let out='';
  // Round steps (0–7–14–21, 0–2.5–5…) instead of quarters like 5.3 or 15.8.
  const ticks=max%7===0&&max<=28?max/7:max%4===0||max%2.5===0?4:max%3===0?3:4;
  for(let j=0;j<=ticks;j++){const v=max*j/ticks,y=H-bottom-v/max*plot;out+='<line x1="'+left+'" x2="'+(W-15)+'" y1="'+y+'" y2="'+y+'" stroke="color-mix(in srgb,var(--muted) 21%,var(--bg))"/><text x="36" y="'+(y+5)+'" text-anchor="end" fill="color-mix(in srgb,var(--muted) 96%,var(--bg))" font-size="13">'+fmt(v,Number.isInteger(v)?0:1)+'</text>';}
  if(!rows.some(r=>r.values.some(v=>v!=null)))out+='<text x="'+(left+(W-left-15)/2)+'" y="'+(top+plot/2)+'" text-anchor="middle" fill="color-mix(in srgb,var(--muted) 96%,var(--bg))" font-size="15">Za toto období zatím nejsou měření</text>';
  // Day labels thin out (every 2nd or 3rd, counted from today) once they would touch each other.
  const labelSize=W===390?11:14,labelW=Math.max(0,...rows.map(r=>String(r.label||'').length))*labelSize*.56+8,labelStep=Math.max(1,Math.ceil(labelW/slot));
  rows.forEach((r,i)=>{let y=H-bottom;const x=left+i*slot+(slot-bw)/2;r.values.forEach((v,k)=>{if(v==null)return;const h=Math.max(0,v)/max*plot;y-=h;out+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="3" fill="'+colors[k%colors.length]+'"><title>'+esc(r.title||r.label)+' · '+fmt(v,1)+'</title></rect>';});if(labels&&(rows.length-1-i)%labelStep===0)out+='<text x="'+(x+bw/2)+'" y="'+(H-12)+'" fill="color-mix(in srgb,var(--muted) 85%,var(--text))" font-size="'+labelSize+'" text-anchor="middle">'+esc(r.label)+'</text>';});
  return '<svg class="experience-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Denní hodnoty se stupnicí">'+out+'</svg>';
}
function renderExperience(){
  if(!$('dailyPulse'))return;
  const daily=state.daily||{},food=daily.nutrition?.foodLog?.totals||{},target=num(daily.nutrition?.calorieTarget),sessions=primarySleepSessions(state.sleep?.sessions).map(r=>({...r,date:r.date||String(r.endTime||r.startTime||'').slice(0,10)})).filter(r=>r.date<=selectedHistoryDate),last=sessions[0],wellness=(state.fitness?.wellness||[]).filter(r=>r.id<=selectedHistoryDate),latest=wellness.at(-1)||{},done=(daily.training?.completed||[]).filter(a=>!isNutritionItem(a)),plan=(daily.training?.planned||[]).filter(a=>!isNutritionItem(a)),actualTss=done.reduce((s,a)=>s+num(a.tss),0),plannedTss=plan.reduce((s,m)=>s+num(m.tss),0)||(daily.training?.matched||[]).reduce((s,m)=>s+num(m.planned?.tss),0),hasSleep=last&&last.date>=dateShift(selectedHistoryDate,-1),sleepScore=hasSleep?Math.round(Math.min(100,num(last.durationMin)/480*100)):null;
  $('dailyPulse').innerHTML='<div class="pulse-header"><div><div class="eyebrow">'+uiText('TVŮJ DEN · ','YOUR DAY · ')+esc(longDate(localToday()))+'</div><h1>Výkon začíná rovnováhou.</h1><p>Spánek, pohyb a jídlo v jednom pohledu.</p></div><button class="btn" id="pulseHealth">Prozkoumat zdravotní data ↗</button></div><div class="pulse-grid">'+experienceRing('Spánek vs. 8 h',sleepScore==null?'—':sleepScore+'%',sleepScore,'#a99bff',last?hm(last.durationMin):'Čekám na noc',last?'Poslední záznam '+dateLabel(last.date)+' · '+(hasSleep?'orientační cíl, ne recovery skóre':'starší noc, ne dnešní připravenost'):'Připoj zdroj spánku')+experienceRing('Tréninková zátěž',actualTss?fmt(actualTss):'—',plannedTss?actualTss/plannedTss*100:0,'#83e9c3',actualTss?'TSS dokončených aktivit':'Dnes bez evidované zátěže',plannedTss?'Plán '+fmt(plannedTss)+' TSS · poměr není známka kvality':'Bez srovnatelného TSS plánu; žádné fiktivní strain skóre')+experienceRing('Příjem energie',target?fmt(num(food.kcal)/target*100)+'%':'—',target?num(food.kcal)/target*100:0,'#ffc274',fmt(food.kcal)+' / '+(target?fmt(target):'—')+' kcal','Z evidovaných jídel · '+(target?fmt(Math.max(0,target-num(food.kcal)))+' kcal zbývá':'čekám na denní cíl'))+'</div><div class="pulse-insight"><span>↗</span><span>'+esc(done.length?'Aktivita je dokončená. Níže najdeš její hodnocení a zbývající výživu.':plan.length?'Před tebou je '+(plan[0].name||'plánovaný trénink')+'. Zkontroluj připravenost a doporučení trenéra.':'Dnes bez evidovaného tréninku. Přehled se změní, jakmile přijde nová aktivita.')+'</span></div>';
  $('pulseHealth').onclick=()=>activate('recovery');
  // The Spánek card's line under the duration is written by renderOverview (score), not here.
  $('recoveryScore').textContent=last?hm(last.durationMin):'—';$('recoveryScore').style.fontSize='25px';$('recoveryOrb').style.setProperty('--orb-value',sleepScore??0);$('recoveryVsBaseline').textContent=last?'Záznam '+dateLabel(last.date)+' · délka spánku, ne recovery skóre':'Čekám na noc';
  const stages=['DEEP','REM','LIGHT','AWAKE'],stageColors=['#7564e9','#afa2ff','#83c7ff','#ffcb83'],recent=sessions.filter(r=>r.date>=dateShift(localToday(),-13)).sort((a,b)=>a.date.localeCompare(b.date)),nightRows=recent.map(r=>({label:dateLabel(r.date),title:longDate(r.date),values:stages.map(k=>measured(r.stages?.[k])?Number(r.stages[k])/60:null)})),maximum=Math.max(10,...nightRows.map(r=>r.values.reduce((s,v)=>s+(v||0),0)));
  $('sleepNights').innerHTML='<div class="experience-heading"><h3>Jak vypadaly tvoje noci</h3><small>Posledních 14 dní · hodiny</small></div><div class="experience-legend">'+['Hluboký','REM','Lehký','Bdění'].map((n,i)=>'<span><i style="background:'+stageColors[i]+'"></i>'+n+'</span>').join('')+'</div>'+(nightRows.length?experienceBars(nightRows,{max:maximum,colors:stageColors}):'<div class="data-gap">Pro toto období chybí fáze spánku.</div>');
  const bedtimes=recent.filter(r=>Number.isFinite(Date.parse(r.startTime))).map(r=>{const parts=new Intl.DateTimeFormat('cs-CZ',{timeZone:USER_TZ,hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date(r.startTime));const h=Number(parts.find(p=>p.type==='hour')?.value),m=Number(parts.find(p=>p.type==='minute')?.value);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m+(h<12?1440:0):null;}).filter(v=>v!=null),average=bedtimes.length?bedtimes.reduce((s,v)=>s+v,0)/bedtimes.length:null,std=bedtimes.length>1?Math.sqrt(bedtimes.reduce((s,v)=>s+(v-average)**2,0)/bedtimes.length):null,clock=v=>v==null?'—':String(Math.floor(v/60)%24).padStart(2,'0')+':'+String(Math.round(v)%60).padStart(2,'0');
  $('sleepRegularity').innerHTML='<div class="experience-heading"><h3>Tvůj spánkový rytmus'+infoTip('rhythm','spánkový rytmus')+'</h3><small>Posledních 14 dní</small></div><div class="experience-stats"><div><span>Obvyklé usnutí</span><strong>'+clock(average)+'</strong></div><div><span>Rozptyl času · SD</span><strong>'+(std==null?'—':fmt(std)+' min')+'</strong></div><div><span>Zaznamenané noci</span><strong>'+recent.length+' / 14</strong></div></div><div class="notice">'+(std==null?'Pro srovnání pravidelnosti potřebujeme více nocí.':'Čas usnutí se od průměru typicky liší o '+fmt(std)+' minut.')+'</div>';
  const recentWell=wellness.filter(r=>r.id>=dateShift(localToday(),-29)),meanKey=key=>{const xs=recentWell.filter(r=>measured(r[key]));return xs.length?xs.reduce((s,r)=>s+Number(r[key]),0)/xs.length:null;},rhr=meanKey('restingHR'),hrv=meanKey('hrv'),vo2=recentWell.filter(r=>measured(r.vo2max)).at(-1)?.vo2max,meanSleep=recent.length?recent.reduce((s,r)=>s+num(r.durationMin),0)/recent.length:null;
  $('healthspan').innerHTML='<div class="eyebrow">DLOUHODOBÉ ZDRAVÍ</div><h3 class="healthspan-title">Návyky a kondice. Ne vymyšlený věk.</h3><p class="small">Sleduj svůj vlastní trend napříč spánkem a fyziologickými měřeními.</p><div class="healthspan-metrics">'+[['Klidový tep',rhr==null?'—':fmt(rhr,1)+' bpm','Průměr dostupných měření · 30 dní'],['HRV',hrv==null?'—':fmt(hrv,1)+' ms','Průměr dostupných měření · 30 dní'],['VO₂ max',vo2==null?'—':fmt(vo2,1),'Poslední měření, nikoli odhad z CTL'],['Délka spánku',meanSleep==null?'—':hm(meanSleep),'Průměr zaznamenaných nocí · 14 dní']].map(([label,value,note])=>'<div><span class="label">'+label+'</span><strong>'+value+'</strong><small>'+note+'</small></div>').join('')+'</div><div class="healthspan-note"><strong>WHOOP Age · není dostupný</strong><br>Ve veřejném WHOOP API není tento ukazatel vystavený. Bez validovaného modelu z těchto dat nepočítáme biologický věk. Naměřené HRV, tep a VO₂ max zůstávají oddělené signály.</div>';
  renderNutritionExperience(food,target,daily);renderActivityGallery();renderRequestedExperience(done,latest,vo2,daily);
}
// savedProfile: what the user entered (and what the form saves). appProfile
// adds what the app worked out itself for the empty fields: height, activity,
// resting and maximum heart rate.
function savedProfile(){try{return JSON.parse(localStorage.getItem('fitnessProfile')||'{}');}catch{return {};}}
function suggestedProfile(){try{return JSON.parse(localStorage.getItem('fitnessProfileSuggested')||'{}');}catch{return {};}}
// Optional Google permissions: birth date (age) and writing weight to Google Health.
function googleExtrasHtml(p){const x=p.extras||{},missing=[!x.birthday&&uiText('datum narození','date of birth'),!x.weightWrite&&uiText('zápis váhy','weight logging')].filter(Boolean);return missing.length?' <a class="btn primary" href="'+esc(p.extrasUrl)+'">'+uiText('Rozšířit oprávnění Google','Extend Google permissions')+'</a><p class="small">'+uiText('Povolí ','Allows ')+esc(missing.join(uiText(' a ',' and ')))+uiText(': věk se pak doplní z Google účtu a váha zapsaná tady nebo v Intervals.icu se propíše i do Google Health.</p>', ': your age is then filled in from your Google account, and weight logged here or in Intervals.icu is copied to Google Health too.</p>'):'<p class="small"><span class="pill good">'+uiText('Datum narození a zápis váhy povoleny','Date of birth and weight logging allowed')+'</span></p>';}
function appProfile(){const p=savedProfile(),s=suggestedProfile();for(const k of ['height','activity','rhr','hrmax','birthDate'])if((p[k]==null||p[k]==='')&&s[k])p[k]=s[k];const age=ageFromBirthDate(p.birthDate);if(age!=null)p.age=age;return p;}
// Age from a birth date, so it stays current without editing the profile.
function ageFromBirthDate(value){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));if(!m)return null;const t=new Date();let age=t.getFullYear()-Number(m[1]);if(t.getMonth()+1<Number(m[2])||(t.getMonth()+1===Number(m[2])&&t.getDate()<Number(m[3])))age--;return age>=18&&age<=100?age:null;}
function googleWellness(){return state.googleHealth?.wellness||[];}
// HRV and resting HR from Google Health, with the Intervals.icu wellness
// filling the days Google has none: Apple Watch, Garmin and other sources
// sync there, and those athletes would otherwise see no recovery at all.
function vitalWellness(){
  const byDate=new Map(googleWellness().map(r=>[r.id,{...r}]));
  for(const r of state.fitness?.wellness||[]){const row=byDate.get(r.id)||{id:r.id};let filled=false;for(const key of ['hrv','restingHR','respiration'])if(!measured(row[key])&&measured(r[key])&&Number(r[key])>0){row[key]=Number(r[key]);filled=true;}if(filled)byDate.set(r.id,row);}
  return [...byDate.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
}
function latestGoogleMetric(key){return googleWellness().filter(r=>measured(r[key])).at(-1);}
function latestVo2(){const google=latestGoogleMetric('vo2max'),intervals=(state.fitness?.wellness||[]).filter(r=>r.id<=selectedHistoryDate&&measured(r.vo2max??r.vo2Max)).at(-1);if(google&&(!intervals||google.id>=intervals.id))return {value:Number(google.vo2max),date:google.id,source:'Google Health'};if(intervals)return {value:Number(intervals.vo2max??intervals.vo2Max),date:intervals.id,source:'Intervals.icu'};return null;}
function labelSelectedDay(){
  // Headings are matched by their text: their order changes as sections are added.
  const past=selectedHistoryDate!==localToday(),future=selectedHistoryDate>localToday();
  // [today, another past day, a day ahead]
  const names=[['Denní signály','Signály dne','Výhled dne'],['Dnešní poradci a hodnocení','Poradci a hodnocení dne','Poradci a hodnocení dne']];
  for(const el of document.querySelectorAll('#overview>.section,#todayMore>.section')){const t=el.textContent;for(const n of names)if(n.includes(t))el.textContent=n[future?2:past?1:0];}
  const heading=document.querySelector('#nutritionBalance h3');if(heading?.firstChild?.nodeType===3)heading.firstChild.nodeValue='Energie dne';
  for(const node of document.querySelectorAll('#nutritionBalance .experience-stats span')){
    if(node.textContent==='Dnešní cíl'||node.textContent==='Cíl dne')node.textContent=past?'Cíl dne':'Dnešní cíl';
    if(node.textContent==='Kroky dnes'||node.textContent==='Kroky dne')node.textContent=past?'Kroky dne':'Kroky dnes';
  }
}
// <recovery-model>
// Generated from src/recovery-model.js by scripts/sync-recovery-model.mjs; edit the module, not this copy.
function personalBaseline(rows, date, key, options) {
  const days = (options && options.days) || 60, min = (options && options.min) || 14, log = !!(options && options.log);
  const end = Date.parse(date + "T12:00:00Z"), values = [];
  for (const r of rows || []) {
    if (!r || !(r.id < date)) continue;
    const age = (end - Date.parse(r.id + "T12:00:00Z")) / 86400000, v = Number(r[key]);
    if (age > days || !Number.isFinite(v) || v <= 0) continue;
    values.push(log ? Math.log(v) : v);
  }
  if (values.length < min) return { count: values.length, mean: null, sd: null };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
  return { count: values.length, mean, sd };
}
function sleepNeedMinutes(options) {
  const age = options && options.age != null ? Number(options.age) : null, strain = options && options.strain != null ? Number(options.strain) : null;
  let need = age != null && age >= 65 ? 450 : 480;
  if (strain >= 18) need += 30; else if (strain >= 14) need += 15;
  return Math.max(420, Math.min(540, need));
}
function sleepDebtMinutes(nights, date, need) {
  const want = need || 480, end = Date.parse(date + "T12:00:00Z"), byDay = new Map();
  for (const s of nights || []) {
    const d = s && (s.date || String(s.endTime || "").slice(0, 10));
    const age = d ? (end - Date.parse(d + "T12:00:00Z")) / 86400000 : NaN;
    if (age >= 0 && age <= 6 && Number(s.durationMin) > 0) byDay.set(d, (byDay.get(d) || 0) + Number(s.durationMin));
  }
  if (!byDay.size) return null;
  const days = [...byDay.values()];
  const net = days.reduce((s, m) => s + Math.max(-60, want - m), 0);
  return { minutes: Math.max(0, Math.round(net)), nights: days.length, average: days.reduce((s, m) => s + m, 0) / days.length, need: want };
}
function hrvStatusLow(rows, date) {
  const end = Date.parse(date + "T12:00:00Z"), start = new Date(end - 6 * 86400000).toISOString().slice(0, 10);
  const week = (rows || []).filter(r => r && r.id >= start && r.id <= date && Number(r.hrv) > 0).map(r => Math.log(Number(r.hrv)));
  const base = personalBaseline(rows, start, "hrv", { log: true });
  if (week.length < 3 || base.mean == null) return false;
  return week.reduce((s, v) => s + v, 0) / week.length < base.mean - 0.5 * Math.max(base.sd, 0.05);
}
function sleepNeedFor(input) {
  const date = input.date, prev = new Date(Date.parse(date + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
  const rows = input.rows || [], sessions = input.sessions || [];
  const prevRow = rows.find(r => r && r.id === prev);
  const strain = input.strain != null ? input.strain : (prevRow ? strainScore(heartRateLoad(prevRow.hrZoneMinutes)) : null);
  const base = sleepNeedMinutes({ age: input.age, strain });
  const hrv = hrvStatusLow(rows, prev) ? 15 : 0;
  const debtState = sleepDebtMinutes(sessions.filter(s => (s.date || String(s.endTime || "").slice(0, 10)) <= prev), prev, sleepNeedMinutes({ age: input.age }));
  const debt = debtState ? Math.min(30, Math.round(debtState.minutes / 4)) : 0;
  const naps = sessions.filter(s => (s.nap || Number(s.durationMin) < 180) && (s.date || String(s.endTime || "").slice(0, 10)) === prev).reduce((t, s) => t + (Number(s.durationMin) || 0), 0);
  const need = Math.max(420, Math.min(540, base + hrv + debt) - Math.round(naps));
  return { need, base, hrv, debt, naps: Math.round(naps) };
}
function bedtimePlan(input) {
  const date = input.date, need = Number(input.need) || 480, end = Date.parse(date + "T12:00:00Z");
  const morning = new Date(end + 86400000).getUTCDay(), weekend = d => [0, 6].includes(new Date(Date.parse(d + "T12:00:00Z")).getUTCDay());
  const recent = (input.nights || []).filter(n => {
    const age = n && n.date ? (end - Date.parse(n.date + "T12:00:00Z")) / 86400000 : NaN;
    return age >= -1 && age <= 13 && Number.isFinite(Number(n.wakeMin)) && Number(n.durationMin) > 0;
  });
  if (!recent.length) return null;
  const median = xs => { const v = [...xs].sort((a, b) => a - b), m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const alike = recent.filter(n => weekend(n.date) === [0, 6].includes(morning)), wakeNights = alike.length >= 3 ? alike : recent;
  const wake = Math.round(median(wakeNights.map(n => Number(n.wakeMin))));
  const ratios = recent.filter(n => Number(n.timeInBedMin) >= Number(n.durationMin)).map(n => Number(n.durationMin) / Number(n.timeInBedMin));
  const efficiency = ratios.length ? Math.max(0.8, Math.min(0.97, median(ratios))) : 0.9;
  const inBed = Math.round(need / efficiency / 5) * 5;
  return { wake, inBed, need, efficiency, bed: ((Math.round((wake - inBed) / 5) * 5) % 1440 + 1440) % 1440, nights: wakeNights.length, weekend: [0, 6].includes(morning) };
}
function sleepIndexScore(night, need) {
  if (!night || !(Number(night.durationMin) > 0)) return null;
  const duration = Number(night.durationMin), bed = Number(night.timeInBedMin), want = need || 480;
  if (!(bed >= duration)) return null;
  const durationPoints = 50 * Math.max(0, Math.min(1, (duration / want - 0.5) / 0.5));
  const efficiency = Math.max(0, Math.min(1, (duration / bed - 0.65) / 0.2));
  const latency = Number(night.latencyMin), waso = Number(night.wasoMin);
  const hasLatency = night.latencyMin != null && Number.isFinite(latency), hasWaso = night.wasoMin != null && Number.isFinite(waso);
  // With the device's sleep summary, 35 points split into efficiency (20),
  // falling asleep within 30 min (7.5, none from 60) and wake after sleep
  // onset up to 20 min (7.5, none from 50): the NSF good-quality ranges.
  const efficiencyPoints = hasLatency && hasWaso
    ? 20 * efficiency + 7.5 * Math.max(0, Math.min(1, (60 - latency) / 30)) + 7.5 * Math.max(0, Math.min(1, (50 - waso) / 30))
    : 35 * efficiency;
  const deep = Number(night.stages && night.stages.DEEP), rem = Number(night.stages && night.stages.REM);
  if (!Number.isFinite(deep) || !Number.isFinite(rem)) return Math.round((durationPoints + efficiencyPoints) / 85 * 100);
  const stagePoints = 7.5 * Math.min(1, deep / duration / 0.13) + 7.5 * Math.min(1, rem / duration / 0.2);
  return Math.round(durationPoints + efficiencyPoints + stagePoints);
}
function recoveryComponentScore(z) {
  return Math.round(Math.max(0, Math.min(100, 70 + 20 * z)));
}
function recoveryReadiness(input) {
  const rows = (input && input.rows) || [], date = input && input.date, night = input && input.night, need = (input && input.sleepNeed) || 480;
  const today = rows.find(r => r && r.id === date) || {};
  const end = Date.parse(date + "T12:00:00Z"), components = {}, flags = [];
  const hb = personalBaseline(rows, date, "hrv", { log: true });
  if (Number(today.hrv) > 0 && hb.mean != null) {
    const sd = Math.max(hb.sd, 0.05), z = (Math.log(Number(today.hrv)) - hb.mean) / sd;
    const week = rows.filter(r => r && r.id <= date && (end - Date.parse(r.id + "T12:00:00Z")) / 86400000 < 7 && Number(r.hrv) > 0).map(r => Math.log(Number(r.hrv)));
    const diff = week.length >= 3 ? week.reduce((s, v) => s + v, 0) / week.length - hb.mean : null, swc = 0.5 * sd;
    components.hrv = { value: Number(today.hrv), baseline: Math.exp(hb.mean), low: Math.exp(hb.mean - sd), high: Math.exp(hb.mean + sd), z, score: recoveryComponentScore(z), trend: diff == null ? null : diff < -swc ? "down" : diff > swc ? "up" : "stable", days: hb.count };
    if (components.hrv.trend === "down") flags.push("hrv_trend_down");
  }
  const rb = personalBaseline(rows, date, "restingHR");
  if (Number(today.restingHR) > 0 && rb.mean != null) {
    const sd = Math.max(rb.sd, 1.5), z = (Number(today.restingHR) - rb.mean) / sd;
    components.restingHR = { value: Number(today.restingHR), baseline: rb.mean, z, score: recoveryComponentScore(-z), days: rb.count };
  }
  const bb = personalBaseline(rows, date, "respiration");
  if (Number(today.respiration) > 0 && bb.mean != null) {
    const rise = Number(today.respiration) - bb.mean, elevated = rise >= 1 && rise >= 2 * Math.max(bb.sd, 0.3);
    components.respiration = { value: Number(today.respiration), baseline: bb.mean, elevated };
    if (elevated) flags.push("respiration_elevated");
  }
  // Skin temperature in sleep against Google's 30-day baseline: ≥ 0.5 °C and
  // two of its nightly SDs above it is flagged and costs 10 points. Nightly
  // skin temperature from a wearable picks up fever onset, often before
  // symptoms (Smarr 2020); Oura counts the deviation in its readiness. The
  // luteal phase alone raises it by less than this.
  const dev = Number(today.skinTempDeviation);
  if (today.skinTempDeviation != null && Number.isFinite(dev)) {
    const sd = Number(today.skinTempSd), elevated = dev >= 0.5 && (!(sd > 0) || dev >= 2 * sd);
    components.skinTemp = { deviation: dev, sd: sd > 0 ? sd : null, elevated };
    if (elevated) flags.push("skin_temp_elevated");
  }
  const nightDate = night && (night.date || String(night.endTime || "").slice(0, 10));
  if (night && nightDate === date && Number(night.durationMin) > 0) {
    const performance = Math.min(105, Number(night.durationMin) / need * 100);
    components.sleep = { minutes: Number(night.durationMin), need, performance: Math.round(performance), score: Math.round(Math.max(0, Math.min(100, 70 + 2 * (performance - 90)))) };
  }
  const weights = { hrv: 0.5, restingHR: 0.25, sleep: 0.25 };
  const used = Object.keys(weights).filter(k => components[k]);
  const missing = Object.keys(weights).filter(k => !components[k]);
  if (!(components.hrv || components.restingHR) || used.reduce((s, k) => s + weights[k], 0) < 0.5) return { score: null, zone: null, components, flags, missing };
  let score = used.reduce((s, k) => s + weights[k] * components[k].score, 0) / used.reduce((s, k) => s + weights[k], 0);
  if (components.respiration && components.respiration.elevated) score -= 10;
  if (components.skinTemp && components.skinTemp.elevated) score -= 10;
  score = Math.round(Math.max(0, Math.min(100, score)));
  return { score, zone: score >= 67 ? "green" : score >= 34 ? "yellow" : "red", components, flags, missing };
}
function heartRateLoad(zoneMinutes) {
  if (!zoneMinutes) return null;
  const z = zoneMinutes, total = ["light", "moderate", "vigorous", "peak"].reduce((s, k) => s + (Number(z[k]) || 0), 0);
  if (!(total > 0)) return null;
  return Math.round(2 * (Number(z.light) || 0) + 3 * (Number(z.moderate) || 0) + 4 * (Number(z.vigorous) || 0) + 5 * (Number(z.peak) || 0));
}
function strainScore(load) {
  return load > 0 ? Math.round(21 * (1 - Math.exp(-load / 225)) * 10) / 10 : 0;
}
// </recovery-model>
// Sleep, recovery and strain come from the shared model in src/recovery-model.js
// (copied above between the recovery-model markers). Sleep need: age from the
// profile, the strain of the day before, HRV status, sleep debt and naps
// (sleepNeedFor).
function nightNeed(date){return date?sleepNeedFor({date,age:appProfile().age,strain:daywideStrain(dateShift(date,-1))?.score??null,rows:vitalWellness(),sessions:state.sleep?.sessions||[]}).need:sleepNeedMinutes({age:appProfile().age});}
function sleepIndex(night){return night?sleepIndexScore(night,nightNeed(night.date||String(night.endTime||'').slice(0,10))):null;}
function recoveryIndex(rows,night,today){return {...recoveryReadiness({rows,date:today,night,sleepNeed:nightNeed(today)}),current:rows.find(r=>r.id===today)};}
// Sleep in hours against the night's need, and tonight's bedtime (bedtimePlan):
// the need of the coming night from today's load so far, the usual wake time.
function localClockMin(iso){const t=Date.parse(iso);if(!Number.isFinite(t))return null;const parts=new Intl.DateTimeFormat('en-GB',{timeZone:USER_TZ,hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date(t)),h=Number(parts.find(p=>p.type==='hour')?.value),m=Number(parts.find(p=>p.type==='minute')?.value);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null;}
function clockText(min){return String(Math.floor(min/60)%24).padStart(2,'0')+':'+String(min%60).padStart(2,'0');}
function tonightPlan(){
  const today=localToday(),sessions=state.sleep?.sessions||[],info=sleepNeedFor({date:dateShift(today,1),age:appProfile().age,strain:daywideStrain(today)?.score??null,rows:vitalWellness(),sessions});
  const nights=primarySleepSessions(sessions).map(n=>({date:n.date||String(n.endTime||'').slice(0,10),wakeMin:localClockMin(n.endTime),durationMin:n.durationMin,timeInBedMin:n.timeInBedMin}));
  const plan=bedtimePlan({date:today,need:info.need,nights});return plan&&{...plan,info};
}
function needBreakdown(info){
  const base=sleepNeedMinutes({age:appProfile().age}),min=v=>Math.round(Math.abs(v))+' min',parts=[uiText('základ ','base ')+hm(base)];
  if(info.base>base)parts.push(uiText('náročný den +','hard day +')+min(info.base-base));
  if(info.hrv)parts.push(uiText('nízké HRV +','low HRV +')+min(info.hrv));
  if(info.debt)parts.push(uiText('spánkový dluh +','sleep debt +')+min(info.debt));
  if(info.naps)parts.push(uiText('zdřímnutí −','naps −')+min(info.naps));
  return parts.join(' · ');
}
function bedtimeHtml(){
  if(selectedHistoryDate!==localToday())return '';const p=tonightPlan();if(!p)return '';
  return '<div class="sleep-bedtime"><span class="label">'+uiText('Dnes do postele','Bed tonight')+'</span><strong>'+clockText(p.bed)+'</strong><span class="small">'+uiText('Vstáváš obvykle v ','You usually wake at ')+clockText(p.wake)+' · '+uiText('potřeba ','need ')+hm(p.need)+' · '+uiText('v posteli ','in bed ')+hm(p.inBed)+'</span><span class="small">'+needBreakdown(p.info)+'</span></div>';
}
function sleepTile(last){
  if(!last)return '<div class="vital-tile sleep-tile"><span class="label">'+uiText('Spánek','Sleep')+'</span><strong>—</strong><span class="small">'+uiText('Čekám na noc','Waiting for a night')+'</span>'+bedtimeHtml()+'</div>';
  const need=nightNeed(last.date),slept=num(last.durationMin),gap=need-slept;
  return '<div class="vital-tile sleep-tile"><span class="label">'+uiText('Spánek · ','Sleep · ')+dateLabel(last.date)+'</span><strong>'+hm(slept)+'</strong><span class="small">'+uiText('z potřeby ','need ')+hm(need)+'</span><div class="sleep-bar"><i style="width:'+Math.min(100,slept/need*100)+'%"></i></div><span class="small">'+(gap>5?uiText('Chybí ','Short by ')+hm(gap):uiText('Potřeba splněna','Need met'))+(last.timeInBedMin?' · '+uiText('v posteli ','in bed ')+hm(last.timeInBedMin):'')+'</span>'+bedtimeHtml()+'</div>';
}
function correctDataPresentation(){
  const nights=primarySleepSessions(state.sleep?.sessions).filter(n=>(n.date||String(n.endTime||'').slice(0,10))<=selectedHistoryDate),last=nights[0],prior=nights.filter(n=>n.date<last?.date&&n.date>=dateShift(last?.date||selectedHistoryDate,-30)),avg=prior.length?prior.reduce((s,n)=>s+num(n.durationMin),0)/prior.length:null;
  const pulseDay=$('dailyPulse')?.querySelector('.pulse-header .eyebrow');if(pulseDay)pulseDay.textContent=uiText('TVŮJ DEN · ','YOUR DAY · ')+longDate(selectedHistoryDate);
  const score=sleepIndex(last),delta=last&&avg!=null?last.durationMin-avg:null,cards=$('dailyPulse')?.querySelectorAll('.pulse-card'),stale=last?.date!==selectedHistoryDate;
  if(cards?.[0]){const need=last?nightNeed(last.date):null,tonight=selectedHistoryDate===localToday()?tonightPlan():null;
    cards[0].outerHTML=experienceRing('Spánek',last?hm(last.durationMin):'—',last?num(last.durationMin)/need*100:0,'#a99bff',last?uiText('z potřeby ','need ')+hm(need):uiText('Spánek','Sleep'),(last?(need-num(last.durationMin)>5?uiText('chybí ','short by ')+hm(need-num(last.durationMin))+' · ':'')+dateLabel(last.date)+(stale?' · starší noc':''):'Čekám na noc')+(tonight?' · '+uiText('dnes do postele ','bed tonight ')+clockText(tonight.bed):''));}
  const food=state.daily?.nutrition?.foodLog?.totals||{},target=num(state.daily?.nutrition?.calorieTarget),macroEnergy=num(food.protein_g)*4+num(food.carbs_g)*4+num(food.fat_g)*9,fill=target?Math.min(100,num(food.kcal)/target*100):0,p=macroEnergy?num(food.protein_g)*4/macroEnergy*fill:0,c=macroEnergy?num(food.carbs_g)*4/macroEnergy*fill:0;
  const calorieCard=$('dailyPulse')?.querySelectorAll('.pulse-card')[2];if(calorieCard){calorieCard.querySelector('.label').textContent='Kalorie';
    const m=state.daily?.nutrition?.macros||{},goal=k=>num(m[k+'_g']??m[k+'Grams']),row=(label,key,color,eat)=>{const g=goal(key==='carbs'?'carbs':key);return '<div class="pulse-macro"><span><i style="background:'+color+'"></i>'+label+'</span><span class="pulse-macro-bar"><i style="width:'+(g?Math.min(100,eat/g*100):0)+'%;background:'+color+'"></i></span><b>'+fmt(eat)+(g?' / '+fmt(g):'')+' g</b></div>';};
    calorieCard.querySelector('.pulse-macros')?.remove();
    calorieCard.querySelector('div:not(.pulse-ring)')?.insertAdjacentHTML('beforeend','<div class="pulse-macros">'+row('Bílkoviny','protein','#60a5fa',num(food.protein_g))+row('Sacharidy','carbs','#f59e0b',num(food.carbs_g))+row('Tuky','fat','#a78bfa',num(food.fat_g))+'</div>');const ring=calorieCard.querySelector('.pulse-ring');if(ring){ring.style.background='conic-gradient(#60a5fa 0 '+p+'%,#f59e0b '+p+'% '+(p+c)+'%,#a78bfa '+(p+c)+'% '+fill+'%,color-mix(in srgb,var(--muted) 22%,var(--bg)) '+fill+'% 100%)';const strong=ring.querySelector('strong');if(strong)strong.textContent='';}}

  $('recoveryTitle').textContent='Spánek a regenerace';$('recoveryInsight').textContent=last?uiText('Poslední noc ','Last night ')+dateLabel(last.date)+uiText(' · skutečný spánek ',' · actual sleep ')+hm(last.durationMin)+(last.timeInBedMin?uiText(' · v posteli ',' · in bed ')+hm(last.timeInBedMin):''):'Čekám na měření';
  const signal=recoverySignals(vitalWellness(),last,selectedHistoryDate);$('recoveryGuide').textContent=signal.title;$('recoveryGuideMeta').textContent=signal.text;
  const recovery=recoveryIndex(vitalWellness(),last,selectedHistoryDate);
  let panel=$('recoveryIndices');if(!panel){panel=document.createElement('div');panel.id='recoveryIndices';panel.className='recovery-indices';$('recoveryOrb').parentElement.after(panel);}
  // One index on Zdraví, Regenerace; sleep shows in hours against the need.
  $('recoveryScore').textContent=recovery.score??'—';$('recoveryOrb').style.setProperty('--orb-value',recovery.score??0);$('recoveryOrb').style.setProperty('--orb-color','#83e9c3');$('recoveryOrb').querySelector('span').textContent='Regenerace';
  panel.innerHTML=sleepTile(last);
  let metrics=$('recoveryVitals');if(!metrics){metrics=document.createElement('div');metrics.id='recoveryVitals';metrics.className='recovery-vitals';document.querySelector('.recovery-command').append(metrics);}
  const rc=recovery.components||{};metrics.innerHTML=[['HRV',recovery.current?.hrv,rc.hrv,'ms',1,2],['Klidový tep',recovery.current?.restingHR,rc.restingHR,'bpm',-1,1]].map(([label,value,c,unit,dir,flat])=>'<div class="vital-tile"><span class="label">'+label+'</span><strong>'+(value>0?fmt(value,1)+' <small>'+unit+'</small>':'—')+'</strong>'+(c?'<span class="vital-delta">'+deltaBadge(value-c.baseline,unit,dir,flat,1)+'<span class="small">'+(c.low!=null?uiText('Běžné pásmo ','Normal range ')+fmt(c.low)+'–'+fmt(c.high)+' '+unit:uiText('Průměr ','Average ')+fmt(c.baseline,1)+' '+unit)+' · '+c.days+uiText(' dní',' days')+'</span></span>':'<span class="small">Čekám na aktuální data a 14 dní historie</span>')+'</div>').join('');
  $('recoveryScore').style.fontSize='39px';$('recoveryVsBaseline').textContent='Vlastní index · 0–100';{const cap=$('recoveryVsBaseline');if(!cap.nextElementSibling?.matches('.info-tip'))cap.insertAdjacentHTML('afterend',infoTip('recoveryScore','index regenerace'));}$('sleepScore').innerHTML=score==null?'Bez dostatečných dat':scoreBadge(score,'Spánek');
  const w=vitalWellness();metricDetail('detail-hrv','Variabilita srdečního tepu · HRV',w.map(r=>({date:r.id,value:r.hrv})),'ms','#3fda9c');metricDetail('detail-rhr','Klidový tep',w.map(r=>({date:r.id,value:r.restingHR})),'bpm','#ff9b80');
  const healthMetrics=$('healthspan').querySelectorAll('.healthspan-metrics>div');for(const [i,key,unit]of [[0,'restingHR','bpm'],[1,'hrv','ms'],[2,'vo2max','ml/kg/min']]){const rows=w.filter(r=>measured(r[key])),reading=key==='vo2max'?latestVo2():null,value=reading?.value??(rows.length?rows.reduce((s,r)=>s+Number(r[key]),0)/rows.length:null);if(healthMetrics[i]){healthMetrics[i].querySelector('strong').textContent=value==null?'—':fmt(value,1)+' '+unit;healthMetrics[i].querySelector('small').textContent=reading?reading.source+' · '+reading.date:rows.length?uiText('průměr · poslední ','average · last ')+dateLabel(rows.at(-1).id):'bez měření';}}
  document.querySelector('.recovery-command .eyebrow')?.remove();
  const g=state.googleHealth||{};$('sourceCoverage').innerHTML='<h3>Dostupnost dat · Google Health</h3>'+[['Spánek',last?.date],['HRV',latestGoogleMetric('hrv')?.id],['Klidový tep',latestGoogleMetric('restingHR')?.id],['Kroky',g.coverage?.steps],['Aktivní energie',g.coverage?.['active-energy-burned']]].map(([label,date])=>'<div class="metric-line"><span>'+label+'</span><strong>'+(date?dateLabel(date):'Bez měření')+'</strong></div>').join('')+'<p class="small">Synchronizace: '+esc(g.sync?.status||'neznámý stav')+(g.sync?.error?' · '+esc(g.sync.error):'')+'</p>';
  const labels={P:'Bílkoviny',C:'Sacharidy',F:'Tuky',Protein:'Bílkoviny',Tuk:'Tuky',Deep:'Hluboký spánek',Light:'Lehký spánek',Awake:'Bdění','Daily readiness':'Denní připravenost','Recovery & Health':'Spánek a zdraví','Recovery & Health ↗':'Spánek a zdraví ↗','rolling average':'klouzavý průměr','all time':'celá historie'};
  Object.assign(labels,{Fitness:'Kondice',Form:'Forma',Fatigue:'Únava',Refresh:'Obnovit','Private training workspace':'Osobní tréninkový přehled','Data is loaded server-side':'Data načítá server','Performance Command Center':'Trénink, zdraví a výživa','Training intelligence · Health · Nutrition':'Trénink · Zdraví · Výživa','Sleep consistency':'Pravidelnost spánku','Sleep architecture':'Fáze spánku','Body baseline':'Hmotnost a osobní trend','Health context':'Zdravotní souvislosti','Deep + REM':'Hluboký spánek + REM','Historie recovery a spánku':'Historie spánku a regenerace'});
  if(document.documentElement.lang==='en')return;
  const walker=document.createTreeWalker(document.querySelector('.shell'),NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){const text=node.textContent.trim();if(labels[text])node.textContent=node.textContent.replace(text,labels[text]);else node.textContent=node.textContent.replace(/ · P (?=\d)/g,' · B ').replace(/ · C (?=\d)/g,' · S ').replace(/ · F (?=\d)/g,' · T ').replace(/kg · rolling average/g,'kg · klouzavý průměr');}
}
// All-day strain: time in Google Health's heart-rate zones as Edwards' TRIMP
// (heartRateLoad, strainScore). It already holds training. Without zone data,
// a fallback from active calories against the 30-day median.
function daywideStrain(date){
  const rows=googleWellness(),row=rows.find(r=>r.id===date),load=heartRateLoad(row?.hrZoneMinutes);
  if(load!=null)return {score:strainScore(load),load,source:'heart-rate',zones:row.hrZoneMinutes,activeCalories:measured(row.activeCalories)?Math.round(Number(row.activeCalories)):null};
  if(!row||!measured(row.activeCalories))return null;
  const prior=rows.filter(r=>r.id<date&&r.id>=dateShift(date,-30)&&measured(r.activeCalories)&&Number(r.activeCalories)>0).map(r=>Number(r.activeCalories)).sort((a,b)=>a-b);
  const activeCalories=Math.round(Number(row.activeCalories)),baseline=prior.length>=7?prior[Math.floor(prior.length/2)]:null;
  return {source:'energy',activeCalories,baseline:baseline?Math.round(baseline):null,score:baseline?Math.round(Math.min(21,21*(1-Math.exp(-activeCalories/(baseline*1.2))))*10)/10:null};
}
// Planned or completed training on the same 0–21 scale, from TSS (1 h
// endurance ≈ 10, 2 h ≈ 15, a hard 3–4 h ≈ 19). With heart-rate zones the
// all-day strain counts alone (it holds the training); otherwise the higher
// of the two, because active calories already include training.
function trainingStrain(tss){return tss>0?Math.round(21*(1-Math.exp(-tss/90))*10)/10:0}
function strainBand(s){return s>=18?'Maximální':s>=14?'Vysoká':s>=10?'Střední':'Lehká'}
function dayStrain(date,tss){const d=daywideStrain(date);if(d?.source==='heart-rate')return d.score>0?d.score:null;const s=Math.max(d?.score||0,trainingStrain(tss));return s>0?Math.round(s*10)/10:null}
function strainCaption(s){if(!s)return 'Celodenní tep ani aktivní energie nejsou dostupné. Wahoo aktivita sama nezměří celý den.';if(s.source==='heart-rate'){const z=s.zones||{};return uiText('Google Health · tepové zóny: lehká ','Google Health · heart-rate zones: light ')+fmt(num(z.light))+uiText(' · střední ',' · moderate ')+fmt(num(z.moderate))+uiText(' · intenzivní ',' · vigorous ')+fmt(num(z.vigorous))+uiText(' · špičková ',' · peak ')+fmt(num(z.peak))+' min.';}return s.score!=null?uiText('Odhad z aktivní energie: ','Estimate from active energy: ')+s.activeCalories+uiText(' kcal · osobní baseline ',' kcal · personal baseline ')+s.baseline+uiText(' kcal. Přesnější je z tepových zón.',' kcal. Heart-rate zones are more accurate.'):'Google Health · '+s.activeCalories+uiText(' aktivních kcal. Pro skóre potřebuji 7 předchozích dní.',' active kcal. I need 7 previous days for a score.');}
function recoverySignals(rows,last,today){
  const r=recoveryIndex(rows,last,today),c=r.components||{},details=[];
  if(c.hrv)details.push('HRV '+fmt(c.hrv.value,1)+' ms, tvoje běžné pásmo '+fmt(c.hrv.low)+'–'+fmt(c.hrv.high)+' ms'+(c.hrv.trend==='down'?', 7denní průměr klesá':''));
  if(c.restingHR)details.push('klidový tep '+fmt(c.restingHR.value)+' proti '+fmt(c.restingHR.baseline,1)+' bpm');
  if(c.sleep)details.push('spánek '+hm(c.sleep.minutes)+' z potřeby '+hm(c.sleep.need));
  if(c.respiration?.elevated)details.push('dech '+fmt(c.respiration.value,1)+' proti '+fmt(c.respiration.baseline,1)+' za minutu');
  if(c.skinTemp?.elevated)details.push('teplota kůže ve spánku +'+fmt(c.skinTemp.deviation,1)+' °C nad průměrem');
  if(r.score==null)return {title:'Regenerace · čekám na dnešní měření',text:(details.length?details.join(' · ')+'. ':'')+'Pro srovnání potřebuji dnešní HRV nebo klidový tep a aspoň 14 předchozích měření.'};
  return {title:r.zone==='red'?'Regenerace · dnes zvolni':r.zone==='yellow'?'Regenerace · slabší den':'Regenerace · obvyklé pásmo',text:details.join(' · ')+'. '+(r.zone==='red'?'Signály jsou výrazně mimo tvoje běžné pásmo. Upřednostni odpočinek nebo lehký trénink.':r.zone==='yellow'?'Část signálů je mimo tvoje běžné pásmo. Intenzitu přizpůsob pocitu únavy.':'Signály jsou v tvém běžném pásmu.')+(c.hrv?.trend==='down'&&r.zone==='green'?' HRV ale týden klesá; sleduj, jestli únava neroste.':'')+(c.respiration?.elevated||c.skinTemp?.elevated?' Zvýšený dech nebo teplota ve spánku mohou předcházet nemoci.':'')};
}
function renderTrainingClarity(){
  const days=state.week?.days||[],rows=days.map(d=>{const s=daywideStrain(d.date);return {label:dateLabel(d.date),values:[s?.score??null],title:longDate(d.date)+(s?.score!=null?uiText(' · celodenní zátěž ',' · all-day strain ')+fmt(s.score,1)+(s.source==='heart-rate'?uiText(' z tepových zón',' from heart-rate zones'):uiText(' z aktivní energie',' from active energy')):s?' · '+s.activeCalories+uiText(' kcal aktivní energie, čekám na 7 dní baseline',' kcal active energy, waiting for a 7-day baseline'):uiText(' · celodenní tep ani aktivní energie nejsou dostupné',' · neither all-day heart rate nor active energy is available'))};});
  const chart=$('loadChart'),card=chart.parentElement;card.querySelector('h3').innerHTML='Celodenní zátěž · vybraný týden'+infoTip('allDayLoad','celodenní zátěž');chart.outerHTML='<div id="loadChart">'+(rows.some(r=>r.values[0]!=null)?experienceBars(rows,{max:21,height:290,colors:['#a99bff']}):'<div class="empty-state">Za tento týden chybí celodenní tep i aktivní energie. Zátěž se spočítá z tepových zón Google Health, jakmile bude připojený. <button type="button" class="link-btn" data-open-view="settings" data-open-section="connections">Zkontrolovat propojení</button></div>')+'</div>';
  const selected=days.find(d=>d.date===selectedHistoryDate)||days.find(d=>d.date===localToday())||days[0],activities=(selected?.daily?.training?.completed||[]).filter(a=>!isNutritionItem(a));
  $('trainingActivityTable').innerHTML='<div class="notice">Vybraný den: <strong>'+esc(selected?longDate(selected.date):'—')+'</strong></div>'+(activities.length?'<div class="scroll"><table><thead><tr><th>Aktivita</th><th>Délka</th><th>Stav</th></tr></thead><tbody>'+activities.map(a=>'<tr><td>'+esc(a.name||'Aktivita')+'</td><td>'+hm(num(a.durationHours)*60)+'</td><td><span class="pill good">Dokončeno</span></td></tr>').join('')+'</tbody></table></div>':'<p class="small">Zatím žádná dokončená aktivita.</p>');
}
function renderRequestedExperience(done,latest,vo2,daily){
  const strain=daywideStrain(selectedHistoryDate),cards=$('dailyPulse').querySelectorAll('.pulse-card');
  if(cards[1])cards[1].outerHTML=experienceRing('Celodenní zátěž',strain?.score!=null?fmt(strain.score,1):'—',strain?.score!=null?strain.score/21*100:0,'#83e9c3','Zátěž',strainCaption(strain));
  const vo2Reading=latestVo2();vo2=vo2Reading?.value;const note=$('healthspan').querySelector('.healthspan-note');
  $('healthspan').querySelector('.healthspan-title').textContent='Kondice a dlouhodobý trend';
  note.innerHTML='<strong>VO₂ max · '+(measured(vo2)?fmt(vo2,1)+' ml/kg/min':'bez měření')+'</strong><p>'+(vo2Reading?esc(vo2Reading.source)+' · '+esc(vo2Reading.date)+'. ':'')+'Intervals.icu využívám pro jízdy a tréninkovou zátěž; samotné Wahoo aktivity nejsou přímé měření VO₂ max. Kondiční věk z jediné hodnoty nevyvozuji.</p>';
}
// Why the target is not exactly profile minus goal: the safety floor, or the weight trend.
function calorieTargetNotes(n){const b=n?.calorieBreakdown||{},notes=[];
  if(b.floorApplied)notes.push(uiText('Cíl drží bezpečné minimum ', 'The goal stays at the safe minimum of ')+Math.round(b.minTarget)+uiText(' kcal, takže hubnutí půjde pomaleji než zvolené tempo.', ' kcal, so weight loss will be slower than the chosen rate.'));
  if(b.trendAdjustment)notes.push(b.trendAdjustment<0?uiText('Podle vývoje váhy ubírám ', 'Based on your weight trend I\'m taking off ')+Math.abs(b.trendAdjustment)+uiText(' kcal denně.', ' kcal a day.'):uiText('Podle vývoje váhy přidávám ', 'Based on your weight trend I\'m adding ')+b.trendAdjustment+uiText(' kcal denně.', ' kcal a day.'));
  return notes.map(t=>'<p class="small calorie-note">'+esc(t)+'</p>').join('');}
function renderFuelingBreakdown(daily){
  const profile=appProfile(),done=(daily.training?.completed||[]).filter(a=>!isNutritionItem(a));
  const weight=Number(daily.weight?.current??daily.nutrition?.currentWeight),bmr=weight>0&&profile.age&&profile.height&&profile.sex?10*weight+6.25*Number(profile.height)-5*Number(profile.age)+(profile.sex==='male'?5:-161):null;
  const today=googleWellness().find(r=>r.id===selectedHistoryDate)||{},active=measured(today.activeCalories)?Number(today.activeCalories):null,steps=measured(today.steps)?fmt(today.steps):'—';
  const budget=daily.nutrition?.energyBudget;
  if(budget)$('nutritionBalance').insertAdjacentHTML('beforeend','<p class="small">'+(budget.basis==='profile'?'Cíl podle profilu':'Průběžný cíl podle naměřeného výdeje, během dne se mění')+(budget.deficit>0?' · deficit '+fmt(budget.deficit)+' kcal':'')+'.</p>');
  $('nutritionBalance').insertAdjacentHTML('beforeend',calorieTargetNotes(daily.nutrition));
  $('nutritionBalance').insertAdjacentHTML('beforeend','<div class="experience-stats"><div><span>Dnešní cíl</span><strong>'+fmt(daily.nutrition?.calorieTarget)+' kcal</strong></div><div><span title="Výpočet Mifflin–St Jeor z hmotnosti, věku, výšky a referenčního pohlaví">Bazální metabolismus</span>'+(bmr?'<strong>'+fmt(bmr)+' kcal</strong>':'<strong class="is-empty"><button type="button" class="link-btn" data-open-view="settings" data-open-section="profile">Doplň profil v Nastavení</button></strong>')+'</div><div><span>Aktivní výdej · celý den</span>'+(active==null?'<strong class="is-empty">'+(serviceConnected('google')?'Čeká na data z Google Health':'Jen s Google Health')+'</strong>':'<strong>'+fmt(active)+' kcal</strong>')+'</div><div><span>Kroky dnes</span>'+(steps==='—'?'<strong class="is-empty">Bez měření</strong>':'<strong>'+steps+'</strong>')+'</div></div><p class="small">'+done.map(a=>esc(a.name)+esc(activityEnergyLabel(a)||' · výdej chybí')).join(' · ')+'</p>'+(active==null?'<p class="small">Dnešní energie z Googlu zatím chybí, cíl vychází z tréninkového plánu.</p>':''));
}
function installRequestedExperience(){
  $('foodProductName').required=false;
  let ingredients=[],editingIngredient=-1,restoringIngredient=false;
  $('foodSaveButton').insertAdjacentHTML('beforebegin','<button class="btn" id="ingredientAdd" type="button" style="margin-right:8px">Přidat surovinu do jídla</button>');
  $('foodEntry').insertAdjacentHTML('beforeend','<div class="notice" id="ingredientBasket" hidden style="margin-top:16px"><h3>Rozpracované jídlo</h3><input id="basketName" class="food-input" placeholder="Název jídla · například domácí oběd"><div id="basketRows"></div><button type="button" class="btn primary" id="basketSave">Uložit celé jídlo</button><button type="button" class="btn" id="basketClear">Vyprázdnit návrh</button></div>');
  const drawBasket=()=>{$('ingredientBasket').hidden=!ingredients.length;$('basketRows').innerHTML=ingredients.map((a,i)=>'<div class="metric-line"><span>'+esc(a.name)+' · '+fmt(a.amount,1)+' '+esc(a.unit)+'</span><strong>'+fmt(a.calories)+' kcal</strong><button type="button" class="btn" data-edit-ingredient="'+i+'">Upravit</button><button type="button" class="btn" aria-label="Odebrat '+esc(a.name)+'" data-remove-ingredient="'+i+'">×</button></div>').join('')+'<p><strong>Celkem '+fmt(ingredients.reduce((s,a)=>s+num(a.calories),0))+' kcal</strong></p>';$('basketRows').querySelectorAll('[data-remove-ingredient]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.removeIngredient);ingredients.splice(i,1);if(editingIngredient===i){editingIngredient=-1;$('foodEditor').hidden=true;}else if(editingIngredient>i)editingIngredient--;drawBasket();});$('basketRows').querySelectorAll('[data-edit-ingredient]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.editIngredient),a=ingredients[i];editingIngredient=-1;selectFoodProduct(a.product);editingIngredient=i;$('foodUnit').value=a.inputUnit;$('foodGrams').value=a.quantity;$('foodPieceAmount').value=a.options.pieceAmount;$('foodPieceUnit').value=a.options.pieceUnit;$('foodDensity').value=a.options.density;updateFoodPreview();});};
  const syncIngredient=()=>{if(!foodSelected)return;try{const product=foodEditorProduct(),quantity=$('foodGrams').value,inputUnit=$('foodUnit').value,options={pieceAmount:$('foodPieceAmount').value,pieceUnit:$('foodPieceUnit').value,density:$('foodDensity').value};if(['calories_100g','protein_100g','carbs_100g','fat_100g'].some(k=>product[k]==null))return;const a={...foodIntake(product,quantity,inputUnit,options),name:product.name,product,quantity,inputUnit,options};if(editingIngredient<0){editingIngredient=ingredients.length;ingredients.push(a);}else ingredients[editingIngredient]=a;drawBasket();}catch{}};
  const selectIngredient=selectFoodProduct;selectFoodProduct=function(p){editingIngredient=ingredients.findIndex(a=>a.product===p);restoringIngredient=editingIngredient>=0;p.__draftRestore=restoringIngredient;selectIngredient(p);if(!restoringIngredient)syncIngredient();};
  $('foodEditor').addEventListener('input',()=>{if(editingIngredient>=ingredients.length)editingIngredient=-1;syncIngredient();});$('foodEditor').addEventListener('change',syncIngredient);
  $('foodEditor').addEventListener('click',()=>queueMicrotask(syncIngredient));
  $('ingredientAdd').textContent='Hledat další surovinu';$('foodSaveButton').hidden=true;
  $('ingredientAdd').onclick=()=>{syncIngredient();editingIngredient=-1;$('foodEditor').hidden=true;foodSelected=null;$('foodQuery').value='';$('foodBarcode').value='';$('foodQuery').focus();foodMessage('Přidej další surovinu. Celý seznam zapíšeš najednou.');};
  $('basketClear').onclick=()=>{ingredients=[];editingIngredient=-1;foodSelected=null;$('foodEditor').hidden=true;drawBasket();};
  $('basketSave').onclick=async()=>{const button=$('basketSave');button.disabled=true;try{if(!ingredients.length)return;const totals=ingredients.reduce((s,a)=>{for(const k of ['calories','protein_g','carbs_g','fat_g'])s[k]+=num(a[k]);return s;},{calories:0,protein_g:0,carbs_g:0,fat_g:0}),meal=$('foodMeal').selectedOptions[0].textContent,name=$('basketName').value.trim()||meal;await jsonFetch('/app/api/food/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:{name,calories_100g:totals.calories,protein_100g:totals.protein_g,carbs_100g:totals.carbs_g,fat_100g:totals.fat_g,nutrition_basis:'portion',source:'composed'},quantity:1,unit:'portion',date:$('foodDate').value,mealType:$('foodMeal').value,ingredients:ingredients.map(a=>({name:a.name,amount:a.amount,unit:a.unit}))})});for(const a of ingredients)if(a.product)await rememberAiFood(a.product);ingredients=[];drawBasket();foodMessage('Celé jídlo je uložené jednou, včetně seznamu surovin.');await load();await loadEnteredFood();}catch(e){foodMessage(e.message);}finally{button.disabled=false;}};
  settingsBody('profile').insertAdjacentHTML('beforeend','<article class="card"><h3>Profil pro vlastní výpočty'+infoTip('profile','profil')+'</h3><p class="small">Vyplň pohlaví, datum narození a cíl. Ostatní doplníme automaticky.</p><form id="fitnessProfileForm" class="food-editor-grid"><label>Referenční pohlaví<select class="food-input" id="profileSex"><option value="">Vyber</option><option value="male">Muž</option><option value="female">Žena</option></select></label><label>Věk<input id="profileAge" class="food-input" type="number" min="18" max="100"></label><label>Výška · cm<input id="profileHeight" class="food-input" type="number" min="100" max="230"></label><label>Maximální tep · bpm<input id="profileHrmax" class="food-input" type="number" min="100" max="230"></label><button class="btn primary">Uložit profil</button></form></article>');
  const profile=savedProfile();for(const [id,key]of [['profileSex','sex'],['profileAge','age'],['profileHeight','height'],['profileHrmax','hrmax']])$(id).value=profile[key]||'';
  $('fitnessProfileForm').onsubmit=e=>{e.preventDefault();localStorage.setItem('fitnessProfile',JSON.stringify({...savedProfile(),sex:$('profileSex').value,age:$('profileAge').value,height:$('profileHeight').value,hrmax:$('profileHrmax').value}));renderExperience();toast('Profil uložen.');};
  if(COOKBOOK_SHOWN){$('foodEntry').insertAdjacentHTML('beforeend','<div style="margin-top:18px"><h3>Z kuchařky podle stránky</h3><div class="food-controls"><input id="recipeRequest" class="food-input" placeholder="Měl jsem 1 porci ze stránky 70"><button class="btn" id="recipeLookup" type="button">Načíst recept</button></div><p class="small">Také k fotce můžeš zadat „strana 65“. Načtení receptu nahradí návrh z fotografie; nezapisuje ho podruhé.</p></div>');
  $('recipeLookup').onclick=async()=>{try{const text=$('recipeRequest').value,match=text.match(/(?:str[aá]n(?:ka|ky|ce|u|a)?|page)\s*(\d{1,3})/i)||text.match(/^\s*(\d{1,3})\s*$/);if(!match)throw new Error('Zadej například strana 70.');const r=await jsonFetch('/app/api/food/recipe?page='+match[1]),recipe=r.recipe;selectFoodProduct({name:recipe.title||recipe.name,calories_100g:recipe.kcal??recipe.calories,protein_100g:recipe.protein_g,carbs_100g:recipe.carbs_g,fat_100g:recipe.fat_g,nutrition_basis:'portion',source:'package_label'});const portion=text.match(/(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*porc/i);$('foodGrams').value=portion?portion[1]:'1';updateFoodPreview();foodMessage('Recept ze stránky '+match[1]+' je připravený. Ulož ho jako jedno jídlo.');}catch(e){foodMessage(e.message);}};}
}
function installPortionControls(){
  const layout=document.createElement('div');layout.className='food-selection-layout';$('foodResults').before(layout);const choices=document.createElement('div');layout.append(choices,$('foodEditor'));choices.append($('foodResults'),$('foodOcrDetails'));layout.after($('ingredientBasket'));
  const css=document.createElement('style');css.textContent='.food-selection-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start}.food-selection-layout .food-editor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.food-selection-layout #foodEditor{margin-top:0!important;padding:16px;background:color-mix(in srgb,var(--cyan) 5%,var(--bg));border-radius:18px}.food-selection-layout #foodResults{max-height:700px;overflow:auto}.food-selection-layout .food-input{min-width:0;width:100%;box-sizing:border-box}#foodQuickAmounts{flex-wrap:wrap}@media(max-width:900px){.food-selection-layout{grid-template-columns:1fr}}';document.head.append(css);
  $('foodGrams').insertAdjacentHTML('afterend','<label id="foodMultiplierLabel">Počet × uvedené množství<input id="foodMultiplier" class="food-input" inputmode="decimal" value="1"></label><small id="foodMultiplierHelp" class="small">Například 3 × 100 ml = 300 ml</small>');
  const preview=updateFoodPreview;updateFoodPreview=function(){const q=$('foodGrams').value,m=parseFoodQuantity($('foodMultiplier').value);try{if(m&&m!==1)$('foodGrams').value=String(parseFoodQuantity(q)*m);preview();}finally{$('foodGrams').value=q;}};
  $('foodMultiplier').addEventListener('input',()=>{const q=parseFoodQuantity($('foodGrams').value),m=parseFoodQuantity($('foodMultiplier').value);if(q&&m&&m!==1){$('foodGrams').value=String(q*m);$('foodMultiplier').value='1';$('foodGrams').dispatchEvent(new Event('input',{bubbles:true}));}});
  $('foodGrams').parentElement.firstChild.textContent='Kolik jsi snědl / vypil?';
  $('foodGrams').insertAdjacentHTML('afterend','<small class="small" id="foodAmountHelp">Množství se vztahuje k vybrané jednotce.</small>');
  $('foodPortionPreview').insertAdjacentHTML('beforebegin','<div class="food-actions" id="foodQuickAmounts"></div><div class="food-editor-grid" id="foodPackEditor" hidden><label>Velikost jednoho balení<input id="foodPackAmount" class="food-input" inputmode="decimal"></label><label>Jednotka balení<select id="foodPackUnit" class="food-input"><option value="ml">ml</option><option value="g">g</option></select></label></div>');
  const original=selectFoodProduct;
  selectFoodProduct=function(p){original(p);const meta=foodPortionDefaults(p);$('foodPackEditor').hidden=p.nutrition_basis==='portion';$('foodPackAmount').value=meta.package?.amount||'';$('foodPackUnit').value=meta.package?.unit||meta.basis;if(meta.package&&!p.preferred_unit){$('foodUnit').value='pack';$('foodGrams').value='1';}refreshPortionButtons();updateFoodPreview();};
  function refreshPortionButtons(){const unit=$('foodUnit').value,p=foodEditorProduct(),pack=foodPortionDefaults(p).package;$('foodAmountHelp').textContent=unit==='pack'?'Počet balení: 1/2 znamená půlku uvedeného balení'+(pack?' ('+fmt(pack.amount/2)+' '+pack.unit+')':'')+'.':unit==='ml'?'Zadej vypité mililitry, například 125.':unit==='g'?'Zadej snědené gramy.':unit==='portion'?'Počet porcí: například 1 nebo 1/2.':'Počet kusů; níže nastav velikost jednoho kusu.';const buttons=pack?[['½ balení','pack','1/2'],['Celé balení','pack','1']]:p.nutrition_basis==='portion'?[['½ porce','portion','1/2'],['1 porce','portion','1']]:[];if(p.nutrition_basis==='ml')buttons.push(['125 ml','ml','125'],['250 ml','ml','250']);$('foodQuickAmounts').innerHTML=buttons.map(([label,u,q])=>'<button class="btn" type="button" data-unit="'+u+'" data-amount="'+q+'">'+label+'</button>').join('');$('foodQuickAmounts').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('foodUnit').value=b.dataset.unit;$('foodGrams').value=b.dataset.amount;refreshPortionButtons();updateFoodPreview();});}
  $('foodUnit').addEventListener('change',()=>{if($('foodUnit').value==='pack'||$('foodUnit').value==='portion')$('foodGrams').value='1';refreshPortionButtons();updateFoodPreview();});
  const updatePack=()=>{const amount=parseFoodQuantity($('foodPackAmount').value);if(foodSelected&&amount)foodSelected.quantity=amount+' '+$('foodPackUnit').value;refreshPortionButtons();updateFoodPreview();};
  $('foodPackAmount').addEventListener('input',updatePack);$('foodPackUnit').addEventListener('change',updatePack);
  if(!$('foodMeal').value)$('foodMeal').value=mealEnabled[0]||'breakfast';
  const quick=$('foodQuickAmounts');quick.addEventListener('click',()=>{const unit=$('foodUnit').value;if(['pack','piece','portion'].includes(unit)&&!quick.querySelector('[data-fraction]'))addFractions(unit);});
  function addFractions(unit){for(const q of ['1/4','2/4','3/4','1/3','2/3','1']){const b=document.createElement('button');b.type='button';b.className='btn';b.dataset.fraction=q;b.textContent=q==='1'?'1 celý kus / porce':q;b.onclick=()=>{$('foodUnit').value=unit;$('foodGrams').value=q;updateFoodPreview();$('foodGrams').dispatchEvent(new Event('input',{bubbles:true}));};quick.append(b);}}
  const selected=selectFoodProduct;selectFoodProduct=function(p){selected(p);addFractions(foodPortionDefaults(p).package?'pack':p.nutrition_basis==='portion'?'portion':'piece');$('foodMultiplier').value='1';if(!p.__draftRestore)$('foodGrams').dispatchEvent(new Event('input',{bubbles:true}));};
}
function renderNutritionExperience(food,target,daily){
  const macros=daily.nutrition?.macros||{},p=num(food.protein_g)*4,c=num(food.carbs_g)*4,f=num(food.fat_g)*9,energy=p+c+f,ps=energy?p/energy*100:0,cs=energy?c/energy*100:0,donut=energy?'conic-gradient(#83c7ff 0 '+ps+'%,#ffc274 '+ps+'% '+(ps+cs)+'%,#b3a1ff '+(ps+cs)+'% 100%)':'color-mix(in srgb,var(--muted) 22%,var(--bg))';
  const rows=[['Bílkoviny','protein_g',macros.protein_g??macros.proteinGrams,'#83c7ff'],['Sacharidy','carbs_g',macros.carbs_g??macros.carbsGrams,'#ffc274'],['Tuky','fat_g',macros.fat_g??macros.fatGrams,'#b3a1ff']];
  $('nutritionBalance').innerHTML='<div class="experience-heading"><h3>Energie dne'+infoTip('energy','energie dne')+'</h3><small>'+fmt(food.kcal)+' / '+(target?fmt(target):'—')+' kcal</small></div><div class="nutrition-layout"><div class="nutrition-donut" style="--donut:'+donut+'"><strong>'+fmt(food.kcal)+'</strong></div><div>'+rows.map(([name,key,tone,color])=>{const goal=num(tone),value=num(food[key]),share=energy?(key==='fat_g'?f:key==='carbs_g'?c:p)/energy*100:0;return '<div class="nutrient-row"><span>'+name+'<small class="small" style="display:block">'+fmt(share)+' % energie</small></span><div class="nutrient-track"><i style="width:'+Math.min(100,goal?value/goal*100:0)+'%;background:'+color+'"></i></div><strong>'+fmt(value)+' / '+(goal?fmt(goal):'—')+' g</strong></div>';}).join('')+'</div></div>';
  const entries=mealEntries||[],enabled=mealSlots.filter(s=>mealEnabled.includes(s.id)),mealRows=enabled.map(s=>({label:s.name.replace('Dopolední svačina','Sv. dopo.').replace('Odpolední svačina','Sv. odpo.'),values:[entries.filter(e=>foodMealSlot(e)===s.id).reduce((sum,e)=>sum+num(e.kcal),0)]})),max=Math.max(400,...mealRows.map(r=>r.values[0]))*1.15;
  $('mealDistribution').innerHTML='<div class="experience-heading"><h3>Energie během dne</h3><small>'+esc($('foodDate')?.value||localToday())+' · kcal</small></div>'+experienceBars(mealRows,{max,colors:['#83e9c3'],height:240})+'<p class="small">Pouze zapsaná jídla v deníku. Nezapsané jídlo neznamená, že jsi nejedl.</p>';
  renderFuelingBreakdown(daily);
}
// Completed activities of the week plus gym sessions from the strength history; every card opens a detail.
function weekGymSessions(days){
  const dates=new Set((days||[]).map(d=>d.date)),byDate=new Map();
  for(const r of state.gym?.history||[]){const date=String(r.workout_date||r.date||'').slice(0,10);if(!dates.has(date))continue;if(!byDate.has(date))byDate.set(date,[]);byDate.get(date).push(r);}
  return [...byDate].map(([date,sets])=>({date,sets}));
}
function isStrengthActivity(a){return /weight|strength|gym|posil/i.test(String(a?.type||'')+' '+String(a?.name||''))}
function renderActivityGallery(){
  const days=state.week?.days||[],gym=weekGymSessions(days);
  const activities=days.flatMap(d=>(d.daily?.training?.completed||[]).filter(a=>!isNutritionItem(a)).map(a=>({...a,date:d.date})));
  // A strength activity recorded by the watch carries that day's sets; otherwise the sets get their own card.
  for(const g of gym){const a=activities.find(x=>x.date===g.date&&isStrengthActivity(x));if(a)a.gymSets=g.sets;else activities.push({date:g.date,name:'Posilovna',type:'Gym',gymSets:g.sets,gymOnly:true});}
  activities.sort((x,y)=>String(y.start||y.date).localeCompare(String(x.start||x.date)));
  const shown=activities.slice(0,8);
  const card=(a,i)=>{
    if(a.gymSets){const exercises=new Set(a.gymSets.map(r=>r.exercise)).size,volume=a.gymSets.reduce((s,r)=>s+num(r.actual_kg??r.actualKg)*num(r.actual_reps??r.actualReps),0),hr=a.payload?.average_heartrate;
      return '<button class="activity-summary-card gym" data-activity-detail="'+i+'"><div class="eyebrow">'+esc(longDate(a.date))+' · <span>Posilovna</span></div><h3>'+esc(a.gymOnly?'Posilovna':a.name||'Posilovna')+'</h3><div class="activity-numbers"><div><strong>'+exercises+'</strong><small>cviků</small></div><div><strong>'+a.gymSets.length+'</strong><small>sérií</small></div><div><strong>'+(measured(hr)?fmt(hr):fmt(volume))+'</strong><small>'+(measured(hr)?'Ø tep · bpm':'objem · kg')+'</small></div></div><p class="small">Otevřít cviky a série ↗</p></button>';}
    const hr=a.payload?.average_heartrate??a.averageHeartRate;
    return '<button class="activity-summary-card" data-activity-detail="'+i+'"><div class="eyebrow">'+esc(longDate(a.date))+' · <span>'+esc(activityTypeLabel(a.type))+'</span></div><h3>'+esc(a.name||'Aktivita')+'</h3><div class="activity-numbers"><div><strong>'+hm(num(a.durationHours)*60)+'</strong><small>Doba pohybu</small></div><div><strong>'+(measured(hr)?fmt(hr):'—')+'</strong><small>Ø tep · bpm</small></div><div><strong>'+(measured(a.calories)?fmt(a.calories):'—')+'</strong><small>kcal</small></div></div><p class="small">'+(a.source==='google-health'?'Google Health · detail ↗':'Otevřít výkon, tep a GPS trasu ↗')+'</p></button>';
  };
  $('activityGallery').innerHTML=shown.length?shown.map(card).join(''):'<div class="data-gap">V tomto týdnu nejsou dostupné dokončené aktivity.</div>';
  $('activityGallery').querySelectorAll('[data-activity-detail]').forEach(b=>b.onclick=()=>{const a=shown[Number(b.dataset.activityDetail)];if(a.gymSets)openGymSessionProfile(a);else openActivityProfile(a);});
}
function openGymSessionProfile(a){
  const el=$('activityProfile');el.hidden=false;
  const groups=new Map();for(const r of a.gymSets){if(!groups.has(r.exercise))groups.set(r.exercise,[]);groups.get(r.exercise).push(r);}
  const volume=a.gymSets.reduce((s,r)=>s+num(r.actual_kg??r.actualKg)*num(r.actual_reps??r.actualReps),0);
  el.innerHTML='<div class="experience-heading"><h3>'+esc(a.gymOnly?'Posilovna':a.name||'Posilovna')+' · '+esc(longDate(a.date))+'</h3><span class="pill">Posilovna · uložené série</span></div><div class="experience-stats">'+[['Cviky',groups.size],['Série',a.gymSets.length],['Objem',fmt(volume)+' kg'],['Ø tep',measured(a.payload?.average_heartrate)?fmt(a.payload.average_heartrate)+' bpm':'—']].map(([l,v])=>'<div><span>'+l+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div><div class="scroll"><table><thead><tr><th>Cvik</th><th>Série</th><th>Nejvyšší váha</th><th>Opakování</th></tr></thead><tbody>'+[...groups].map(([name,sets])=>'<tr><td>'+esc(name||'Cvik')+'</td><td>'+sets.length+'</td><td>'+fmt(Math.max(...sets.map(r=>num(r.actual_kg??r.actualKg))),1)+' kg</td><td class="small">'+sets.map(r=>esc(String(r.actual_kg??r.actualKg??'—'))+' × '+esc(String(r.actual_reps??r.actualReps??'—'))).join(' · ')+'</td></tr>').join('')+'</tbody></table></div>';
  el.scrollIntoView({behavior:'smooth',block:'start'});
}
function activityStreamChart(stream,color,label,unit){
  const pts=stream?.points||[];if(!pts.length)return '<div class="data-gap">'+esc(label)+uiText(' není v této aktivitě dostupný.</div>', ' isn\'t available for this activity.</div>');const max=Math.max(1,...pts.map(p=>p.v))*1.1,tmax=Math.max(1,...pts.map(p=>p.t)),y=v=>220-v/max*190,x=t=>55+t/tmax*675;let out='';for(let j=0;j<4;j++){const v=max*j/3;out+='<line x1="55" x2="730" y1="'+y(v)+'" y2="'+y(v)+'" stroke="color-mix(in srgb,var(--muted) 21%,var(--bg))"/><text x="47" y="'+(y(v)+5)+'" font-size="13" fill="color-mix(in srgb,var(--cyan) 8%,var(--muted))" text-anchor="end">'+fmt(v)+'</text>';}
  out+='<polyline points="'+pts.map(p=>x(p.t)+','+y(p.v)).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2"/><text x="55" y="255" fill="color-mix(in srgb,var(--muted) 87%,var(--text))" font-size="14">0 min</text><text x="730" y="255" fill="color-mix(in srgb,var(--muted) 87%,var(--text))" font-size="14" text-anchor="end">'+fmt(tmax/60)+' min</text>';return '<h3>'+esc(label)+' · '+unit+'</h3><svg class="experience-chart" viewBox="0 0 760 275" role="img" aria-label="'+esc(label)+'">'+out+'</svg>';
}
function activityRouteSvg(stream){
  const points=stream?.points||[];if(points.length<2)return '<div class="data-gap">GPS trasa není dostupná. Indoor aktivita nebo zdroj bez GPS není vykreslený jako smyšlená mapa.</div>';const latMean=points.reduce((s,p)=>s+p.v[0],0)/points.length,coords=points.map(p=>[p.v[1]*Math.cos(latMean*Math.PI/180),p.v[0]]),xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min(700/Math.max(.00001,maxX-minX),310/Math.max(.00001,maxY-minY)),project=p=>[30+(p[0]-minX)*scale+(700-(maxX-minX)*scale)/2,345-(p[1]-minY)*scale-(310-(maxY-minY)*scale)/2],route=coords.map(project),start=route[0],end=route.at(-1);
  return '<div class="route-map"><svg class="experience-chart" viewBox="0 0 760 380" role="img" aria-label="Skutečná GPS trasa"><defs><pattern id="routeGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="color-mix(in srgb,var(--primary) 24%,var(--bg))" stroke-width="1"/></pattern></defs><rect width="760" height="380" fill="url(#routeGrid)"/><polyline points="'+route.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="color-mix(in srgb,var(--primary) 81%,var(--text))" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="'+start[0]+'" cy="'+start[1]+'" r="7" fill="var(--text)" stroke="color-mix(in srgb,var(--green) 10%,var(--bg))" stroke-width="3"/><circle cx="'+end[0]+'" cy="'+end[1]+'" r="6" fill="#ffc274"/><text x="710" y="28" fill="color-mix(in srgb,var(--muted) 53%,var(--text))" font-size="16">N ↑</text></svg></div><p class="route-caption">Skutečný průběh GPS · bílá = start, oranžová = cíl. Bez mapových dlaždic: souřadnice neposíláme externím mapovým službám.</p>';
}
async function openActivityProfile(activity){
  const el=$('activityProfile');el.hidden=false;el.innerHTML='<h3>'+esc(activity.name||'Detail aktivity')+'</h3><div class="notice">Načítám detail z Intervals.icu…</div>';el.scrollIntoView({behavior:'smooth',block:'start'});
  if(activity.source&&activity.source!=='intervals'){const m=activity.payload?.exercise?.metricsSummary||{},hr=activity.payload?.average_heartrate??activity.averageHeartRate,dist=num(m.distanceMillimeters)/1e6;el.innerHTML='<div class="experience-heading"><h3>'+esc(activity.name||'Detail aktivity')+'</h3><span class="pill">'+esc(activity.source==='google-health'?'Google Health':activity.source)+' · souhrn</span></div><div class="experience-stats">'+[['Doba pohybu',hm(num(activity.durationHours)*60)],['Průměrný tep',measured(hr)?fmt(hr)+' bpm':'neměřeno'],['Energie',measured(activity.calories)?fmt(activity.calories)+' kcal':'—'],['Vzdálenost',dist>0?fmt(dist,2)+' km':'—'],['Kroky',measured(m.steps)?fmt(m.steps):'—']].map(([l,v])=>'<div><span>'+l+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div><p class="small">Zdroj poskytuje souhrn aktivity (i automaticky rozpoznané chůze), ne průběh výkonu ani GPS stopu. Trasu ani průběh nevymýšlíme.</p>';return;}
  const id=activity.payload?.id||activity.externalId||activity.sourceId||String(activity.id||'').replace(/^intervals[:_-]/,'');
  try{const result=await jsonFetch('/app/api/activity-detail?id='+encodeURIComponent(id));state.lastActivityDetail={id,result};const a=result.activity||{},streams=result.streams||[],np=a.icu_normalized_watts??a.icu_weighted_average_watts;
    el.innerHTML='<div class="experience-heading"><h3>'+esc(a.name||activity.name)+'</h3><span class="pill">Intervals.icu · naměřené hodnoty</span></div><div class="experience-stats">'+[['Vzdálenost',measured(a.distance)?fmt(a.distance/1000,1)+' km':'—'],['Převýšení',measured(a.total_elevation_gain)?fmt(a.total_elevation_gain)+' m':'—'],['Normalizovaný výkon',measured(np)?fmt(np)+' W':'—']].map(([label,value])=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>').join('')+'</div>'+activityRouteSvg(streams.find(s=>s.type==='latlng'))+'<div class="experience-grid"><div>'+activityStreamChart(streams.find(s=>s.type==='watts'),'#83e9c3','Výkon','W')+'</div><div>'+activityStreamChart(streams.find(s=>s.type==='heartrate'),'#ff9c97','Tep','bpm')+'</div></div><p class="small">Průběh je zmenšený na nejvýše přibližně 1200 bodů na signál. Nejde o automatické hodnocení jednotlivých intervalů.</p>';
  }catch(error){el.innerHTML='<h3>'+esc(activity.name||'Detail aktivity')+'</h3><div class="data-gap">'+esc(error.message)+'</div><button class="btn" id="profileSettings" style="margin-top:12px">Přejít do Nastavení</button>';$('profileSettings').onclick=()=>openSettings('profile');}
}
function installFoodEntry(){
  const style=document.createElement('style');style.textContent='.food-controls{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.food-controls input{flex:1;min-width:150px}.food-input{background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);border:1px solid color-mix(in srgb,var(--lilac) 24%,var(--bg));border-radius:9px;padding:10px;max-width:100%;font:inherit}.food-actions{display:flex;gap:8px;flex-wrap:wrap}.food-result{display:block;text-align:left;width:100%;background:color-mix(in srgb,var(--cyan) 9%,var(--bg));color:var(--text);border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));border-radius:10px;padding:12px;margin:7px 0}.food-result strong,.food-result span{display:block}.food-editor-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0}.food-editor-grid label{display:grid;gap:5px;color:color-mix(in srgb,var(--muted) 93%,var(--text));font-size:var(--fs-small)}.food-editor-grid input,.food-editor-grid select{width:100%;min-width:0}.food-upload{display:inline-block;cursor:pointer}.food-ocr-text{width:100%;min-height:130px;resize:vertical}.food-result:hover{border-color:var(--primary)}@media(max-width:700px){.food-editor-grid{grid-template-columns:1fr 1fr}.food-actions .btn{flex:1}.food-controls{flex-direction:column}}';document.head.appendChild(style);
  $('nutrition').insertAdjacentHTML('afterbegin','<div class="card" style="margin-bottom:16px" id="foodEntry"><div class="eyebrow">Potraviny a výrobky</div><h3 style="font-size:22px;margin-top:5px">Co jsi snědl?</h3><p class="small">Vyhledej běžnou potravinu, přesný výrobek a značku nebo načti jeho obal.</p><div class="food-controls"><input class="food-input" id="foodQuery" placeholder="Např. jogurt Hollandia, rohlík, banán" aria-label="Název potraviny"><input class="food-input" id="foodBarcode" inputmode="numeric" placeholder="Čárový kód / EAN" aria-label="Čárový kód"><button type="button" class="btn primary" id="foodSearchButton">Dohledat</button></div><div class="food-actions"><label class="btn food-upload">Fotka čárového kódu<input hidden id="foodBarcodePhoto" type="file" accept="image/*" capture="environment"></label><label class="btn food-upload">Fotka nutriční etikety<input hidden id="foodLabelPhoto" type="file" accept="image/*" capture="environment"></label><button type="button" class="btn" id="foodManual">Zadat hodnoty ručně</button></div><div class="small" id="foodEntryStatus" role="status" style="margin-top:12px">Hledá v tvých uložených potravinách. Fotografie se čtou v prohlížeči.</div><div id="foodResults"></div><details id="foodOcrDetails" style="margin-top:12px"><summary>Text z etikety / vložit zkopírovaný text</summary><textarea id="foodOcrText" class="food-input food-ocr-text" placeholder="Energie 81 kcal&#10;Tuky 1,6 g&#10;Sacharidy 6,4 g&#10;Bílkoviny 10 g"></textarea><button type="button" class="btn" id="foodApplyLabel">Načíst hodnoty z textu</button></details><form id="foodEditor" hidden style="margin-top:16px"><h3>Zkontroluj výrobek a porci</h3><div class="small" id="foodSource"></div><div class="food-editor-grid"><label>Název<input class="food-input" id="foodProductName" required></label><label>Značka<input class="food-input" id="foodBrand"></label><label>Množství · g<input class="food-input" id="foodGrams" inputmode="decimal" value="100" required></label><label>Datum<input type="date" class="food-input" id="foodDate" required></label><label>Jídlo<select class="food-input" id="foodMeal"><option value="breakfast">Snídaně</option><option value="lunch">Oběd</option><option value="dinner">Večeře</option><option value="snack" selected>Svačina</option></select></label></div><div class="label">Hodnoty na 100 g · u tekutin na 100 ml, množství pak zadej v ml</div><div class="food-editor-grid">'+[['calories_100g','Energie · kcal'],['protein_100g','Bílkoviny · g'],['carbs_100g','Sacharidy · g'],['fat_100g','Tuky · g'],['fiber_100g','Vláknina · g'],['salt_100g','Sůl · g']].map(([k,label])=>'<label>'+label+'<input class="food-input" id="food-'+k+'" inputmode="decimal" '+(['fiber_100g','salt_100g'].includes(k)?'':'required')+'></label>').join('')+'</div><div class="notice" id="foodPortionPreview"></div><label class="small" style="display:block;margin:12px 0"><input type="checkbox" id="foodConfirmed" required> Ověřil jsem výrobek, množství a hodnoty na 100 g / ml.</label><button type="submit" class="btn primary" id="foodSaveButton">Zapsat snědené jídlo</button></form></div><div id="enteredFood" style="margin-bottom:16px"></div>');
  $('enteredFood').insertAdjacentHTML('afterend','<dialog id="foodManageDialog" aria-labelledby="foodManageTitle"><form id="foodManageForm"><input type="hidden" name="id"><div class="detail-heading"><h3 id="foodManageTitle">Upravit zapsané jídlo</h3><button type="button" class="btn" id="foodManageClose" aria-label="Zavřít">✕</button></div><div class="food-manage-grid"><label>Název<input class="food-input" name="name" required maxlength="180"></label><label>Datum<input class="food-input" name="date" type="date" required></label><label>Část dne<select class="food-input" name="mealType">'+mealSlots.map(s=>'<option value="'+s.id+'">'+s.name+'</option>').join('')+'</select></label><label>Kalorie · kcal<input class="food-input" name="kcal" type="number" min="0" max="10000" step="0.1" required></label><label>Bílkoviny · g<input class="food-input" name="protein_g" type="number" min="0" max="1000" step="0.1" required></label><label>Sacharidy · g<input class="food-input" name="carbs_g" type="number" min="0" max="1000" step="0.1" required></label><label>Tuky · g<input class="food-input" name="fat_g" type="number" min="0" max="1000" step="0.1" required></label></div><div class="food-manage-actions"><button class="btn primary" type="submit">Uložit změny</button><button class="btn" type="button" id="foodManageDelete">Smazat záznam</button></div><div class="food-copy-controls"><label>Kopírovat do dne<input class="food-input" id="foodCopyDate" type="date"></label><button type="button" class="btn" id="foodManageCopy">Kopírovat jídlo</button></div></form></dialog>');
  $('foodEntry').before($('enteredFood'));
  $('enteredFood').addEventListener('click',event=>{const edit=event.target.closest('[data-edit-food]'),copy=event.target.closest('[data-copy-food]'),remove=event.target.closest('[data-delete-food]');if(edit)openFoodManage(edit.dataset.editFood);else if(copy)openFoodManage(copy.dataset.copyFood,true);else if(remove){openFoodManage(remove.dataset.deleteFood);$('foodManageDelete').focus()}});
  $('enteredFood').addEventListener('change',event=>{if(event.target.matches('[data-move-food]')&&event.target.value)changeFoodMeal(Number(event.target.dataset.moveFood),event.target.value)});
  $('foodManageClose').onclick=()=>$('foodManageDialog').close();
  $('foodManageForm').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('[type="submit"]');button.disabled=true;try{const body=Object.fromEntries(new FormData(form));await jsonFetch('/app/api/food/entry',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('foodManageDialog').close();toast('Změny v jídle jsou uložené.');await refreshFoodDiary()}catch(error){toast('Úprava selhala: '+error.message)}finally{button.disabled=false}};
  $('foodManageCopy').onclick=async()=>{const button=$('foodManageCopy'),targetDate=$('foodCopyDate').value;if(!targetDate){toast('Vyber den pro kopii.');return}button.disabled=true;try{await jsonFetch('/app/api/food/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:$('foodManageForm').elements.id.value,targetDate})});$('foodManageDialog').close();toast('Jídlo je zkopírované do '+dateLabel(targetDate)+'.');await refreshFoodDiary()}catch(error){toast('Kopie selhala: '+error.message)}finally{button.disabled=false}};
  $('foodManageDelete').onclick=async()=>{const id=$('foodManageForm').elements.id.value,name=$('foodManageForm').elements.name.value;if(!window.confirm('Opravdu smazat „'+name+'“ z deníku?'))return;const button=$('foodManageDelete');button.disabled=true;const before=mealEntries;$('foodManageDialog').close();mealEntries=(mealEntries||[]).filter(e=>String(e.id)!==String(id));renderFoodViews();toast('Jídlo je smazané.');try{await jsonFetch('/app/api/food/entry',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});await refreshFoodDiary()}catch(error){mealEntries=before;renderFoodViews();toast('Smazání selhalo: '+error.message)}finally{button.disabled=false}};
  $('foodLabelPhoto').closest('label').insertAdjacentHTML('afterend','<label class="btn food-upload">Fotka hodnot za moji porci<input hidden id="foodPortionPhoto" type="file" accept="image/*"></label>');
  $('foodOcrText').insertAdjacentHTML('beforebegin','<label>Základ fotografie<select class="food-input" id="foodPhotoMode"><option value="label">Na 100 g / ml</option><option value="portion">Za celou moji porci</option></select></label>');
  $('foodGrams').parentElement.firstChild.textContent='Množství · například 1/2';$('foodGrams').inputMode='text';
  $('foodGrams').parentElement.insertAdjacentHTML('afterend','<label>Jednotka<select id="foodUnit" class="food-input"><option value="g">g</option><option value="ml">ml</option><option value="piece">kus</option><option value="pack">balení / jednotlivý obal</option><option value="portion">porce</option></select></label><label>Nutriční hodnoty<select id="foodBasis" class="food-input"><option value="g">Na 100 g</option><option value="ml">Na 100 ml</option><option value="portion">Za jednu porci</option></select></label>');
  $('foodEditor').querySelector('.label').id='foodBasisLabel';
  $('foodPortionPreview').insertAdjacentHTML('beforebegin','<div id="foodPieceSettings" class="food-editor-grid" hidden><label>Velikost jednoho kusu<input id="foodPieceAmount" class="food-input" inputmode="decimal" placeholder="Podle obalu nebo vážení"></label><label>Jednotka kusu<select id="foodPieceUnit" class="food-input"><option value="g">g</option><option value="ml">ml</option></select></label></div><div id="foodDensitySettings" hidden><label>Hustota · g/ml<input id="foodDensity" class="food-input" inputmode="decimal" placeholder="Nutná pouze pro převod g ↔ ml"></label></div>');
  $('foodConfirmed').closest('label').remove();
  $('foodDate').value=localToday();$('foodDate').onchange=loadEnteredFood;$('foodSearchButton').onclick=searchFood;for(const id of ['foodQuery','foodBarcode'])$(id).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchFood();}};
  $('foodBarcodePhoto').onchange=e=>readFoodPhoto(e.target.files[0],'barcode');$('foodBarcode').addEventListener('change',e=>{const code=e.target.value.replace(/\D/g,'');if(/^\d{8,14}$/.test(code)&&!$('foodQuery').value.trim())lookupBarcode(code);});$('foodLabelPhoto').onchange=e=>readFoodPhoto(e.target.files[0],'label');$('foodPortionPhoto').onchange=e=>readFoodPhoto(e.target.files[0],'portion');$('foodApplyLabel').onclick=()=>applyFoodLabel();$('foodManual').onclick=()=>selectFoodProduct({name:$('foodQuery').value.trim(),barcode:$('foodBarcode').value.trim(),source:'package_label'});$('foodEditor').onsubmit=saveFoodEntry;$('foodEditor').oninput=()=>{updateFoodPreview();};loadEnteredFood();
}
installDetailViews();installFoodEntry();installExperience();installRequestedExperience();installPortionControls();
if(location.hash==='#settings')activate('settings');
function installDataCorrections(){
  $('foodEditor').addEventListener('input',()=>{for(const span of $('basketRows').querySelectorAll('span'))span.textContent=span.textContent.replace(/\bportion\b/g,'porce');});
  const originalTraining=renderTraining;renderTraining=function(){originalTraining();renderTrainingClarity();};
  $('foodManual').onclick=()=>{selectFoodProduct({name:$('foodQuery').value.trim(),barcode:$('foodBarcode').value.trim(),source:'package_label',nutrition_basis:'g'});foodMessage('Zadej hodnoty na 100 g a hmotnost balení. Porci nebo kus můžeš doplnit podle obalu.');};
  $('foodBasis').addEventListener('change',()=>{if($('foodBasis').value==='portion'){$('foodUnit').value='portion';$('foodGrams').value='1';}else if($('foodUnit').value==='portion'){$('foodUnit').value=$('foodBasis').value;$('foodGrams').value='100';}updateFoodPreview();$('foodGrams').dispatchEvent(new Event('input',{bubbles:true}));});
  const saveBasket=$('basketSave').onclick;$('basketSave').onclick=async()=>{try{if(!$('foodEditor').hidden){const p=foodEditorProduct();if(['calories_100g','protein_100g','carbs_100g','fat_100g'].some(k=>p[k]==null||!Number.isFinite(p[k])||p[k]<0))throw new Error('Doplň energii a všechna makra. Nula je platná hodnota.');foodIntake(p,$('foodGrams').value,$('foodUnit').value,{pieceAmount:$('foodPieceAmount').value,pieceUnit:$('foodPieceUnit').value,density:$('foodDensity').value});$('foodGrams').dispatchEvent(new Event('input',{bubbles:true}));if(!$('basketName').value.trim()&&$('basketRows').querySelectorAll('[data-edit-ingredient]').length===1)$('basketName').value=p.name;}await saveBasket();}catch(e){foodMessage(e.message);}};
  const css=document.createElement('style');css.textContent='#calChart,#nutritionChart{width:100%;display:block}.experience-stats{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.macro-line{gap:4px 12px;flex-wrap:wrap}.pulse-card{min-width:0}.pulse-card h3{font-size:19px}.pulse-card p{overflow-wrap:anywhere}.stack-chart{max-width:none!important}';document.head.append(css);
  $('profileHrmax').parentElement.insertAdjacentHTML('afterend','<label>Klidový tep · bpm<input id="profileRhr" class="food-input" type="number" min="25" max="120" placeholder="Automaticky z dat"></label>');$('profileRhr').value=savedProfile().rhr||'';
  const saveProfile=$('fitnessProfileForm').onsubmit;$('fitnessProfileForm').onsubmit=async e=>{saveProfile(e);localStorage.setItem('fitnessProfile',JSON.stringify({...savedProfile(),rhr:$('profileRhr').value}));try{await jsonFetch('/app/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(savedProfile())});await load();toast('Profil uložen a výpočty aktualizované.');}catch(error){toast('Profil je pouze v prohlížeči: '+error.message);}renderExperience();correctDataPresentation();};
  $('foodSaveButton').insertAdjacentHTML('beforebegin','<button type="button" class="btn" id="savePersonalFood">Uložit potravinu pro příště</button>');$('savePersonalFood').onclick=async()=>{try{await jsonFetch('/app/api/food/personal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(foodEditorProduct())});foodMessage('Potravina je uložená v tvojí databázi. Příště ji najdeš podle názvu i podobného zadání.');}catch(e){foodMessage(e.message);}};
  const selectWithSource=selectFoodProduct;selectFoodProduct=function(p){selectWithSource(p);if(p.source==='personal')$('foodSource').textContent='Moje databáze · tvoje uložené nutriční hodnoty';};
  const oldExperience=renderExperience;renderExperience=function(){oldExperience();correctDataPresentation();};
  const oldLoad=load;load=async()=>{$('viewDate').value=selectedHistoryDate;$('nextDay').disabled=selectedHistoryDate>=lastSelectableDay();if($('foodDate'))$('foodDate').value=selectedHistoryDate;const shownDay=selectedHistoryDate,health=shownDay>localToday()?Promise.resolve({wellness:[],sync:{status:'future'}}):jsonFetch('/app/api/google-health?date='+shownDay).catch(e=>({wellness:[],sync:{status:'error',error:e.message}}));await oldLoad();{const g=await health;if(shownDay===selectedHistoryDate){state.googleHealth=g;try{renderOverview();renderNutrition();}catch{}}}if(selectedHistoryDate!==localToday()){try{const coaches=state.coaches?.date===selectedHistoryDate?state.coaches:await jsonFetch('/app/api/coaches?date='+selectedHistoryDate);if(coaches.date!==selectedHistoryDate)throw new Error('Historická data poradců chybí.');state.coaches=coaches;renderCoachCouncil();}catch{$('coachPriorities').hidden=false;$('coachPriorities').textContent=selectedHistoryDate>localToday()?'Hodnocení poradců bude k dispozici v ten den.':'Historické hodnocení není dostupné.';$('coachCards').innerHTML='';}}const today=state.week?.days?.find(d=>d.date===selectedHistoryDate);if(today&&state.daily?.nutrition?.energyBudget){today.daily.nutrition=state.daily.nutrition;today.daily.calories=state.daily.calories;renderOverview();renderNutrition();}correctDataPresentation();labelSelectedDay();if($('enteredFood'))loadEnteredFood();};
  const oldActivate=activate;activate=function(id){oldActivate(id);if(state.daily)correctDataPresentation();};
}
function simpleFoodPortions(product){
  const meta=foodPortionDefaults(product),options=[];
  if(product.nutrition_basis==='portion')return [{key:'portion',label:'Porce',unit:'portion',size:1}];
  if(meta.package)options.push({key:'pack',label:uiText('Balení (', 'Package (')+meta.package.amount+' '+meta.package.unit+')',unit:'pack',size:1});
  if(meta.serving)options.push({key:'serving',label:'Porce ('+meta.serving.amount+' '+meta.serving.unit+')',unit:'portion',size:1});const piece=foodPackageSize(product.piece_size);if(piece)options.push({key:'piece',label:'Kus ('+piece.amount+' '+piece.unit+')',unit:'piece',size:1});
  if(meta.basis==='ml')options.push({key:'ml100',label:'100 ml',unit:'ml',size:100},{key:'ml',label:'Mililitry',unit:'ml',size:1});
  else options.push({key:'g100',label:'100 g',unit:'g',size:100},{key:'g',label:'Gramy',unit:'g',size:1});
  return options;
}
function installSimpleFoodEditor(){
  const editor=$('foodEditor'),advanced=document.createElement('details');advanced.id='foodAdvanced';advanced.innerHTML='<summary>Upravit název a nutriční hodnoty</summary><div class="food-editor-grid" id="foodAdvancedFields"></div>';
  const fields=advanced.querySelector('#foodAdvancedFields'),context=document.createElement('div');context.id='simpleFoodContext';context.className='simple-food-context';
  editor.append(advanced);
  for(const id of ['foodDate','foodMeal'])context.append($(id).closest('label'));
  $('foodEntry').querySelector('.food-controls').before(context);
  for(const label of [...editor.querySelectorAll('.food-editor-grid>label')])fields.append(label);
  const source=$('foodSource');advanced.append(source,$('foodBasisLabel'),$('foodPieceSettings'),$('foodDensitySettings'),$('foodPackEditor'),$('savePersonalFood'));
  $('foodMultiplierLabel').hidden=true;$('foodMultiplierHelp').hidden=true;$('foodAmountHelp').hidden=true;
  for(const grid of [...editor.querySelectorAll(':scope>.food-editor-grid')])if(!grid.children.length)grid.remove();
  editor.querySelector('h3').hidden=true;
  editor.prepend(Object.assign(document.createElement('div'),{id:'simpleFoodHero',className:'simple-food-hero'}));
  $('simpleFoodHero').innerHTML='<div class="eyebrow" id="simpleFoodBrand"></div><h3 id="simpleFoodName"></h3><div id="simpleFoodMacros" class="simple-food-macros"></div>';
  const controls=document.createElement('div');controls.className='simple-food-controls';controls.innerHTML='<div class="simple-food-picker"><label>Množství<input id="simpleFoodAmount" class="food-input" inputmode="decimal" value="1" aria-label="Počet porcí nebo množství"></label><label>Porce<select id="simpleFoodPortion" class="food-input" aria-label="Velikost porce"></select></label></div><div class="simple-food-fractions">'+['1/4','1/3','1/2','3/4','1','2'].map(q=>'<button type="button" class="btn" data-simple-amount="'+q+'">'+q+'</button>').join('')+'</div>';
  $('simpleFoodHero').after(controls);controls.after($('foodPortionPreview'),$('ingredientAdd'),advanced);
  $('ingredientAdd').textContent='Přidat do seznamu';$('ingredientAdd').classList.add('primary','simple-food-add');
  $('foodQuickAmounts').hidden=true;
  let portions=[],updating=false;
  function updateSimple(){
    if(!foodSelected)return;
    const p=foodEditorProduct();$('simpleFoodName').textContent=p.name||'Vlastní jídlo';$('simpleFoodBrand').textContent=p.brand||'Vybraná potravina';
    try{const a=foodIntake(p,$('foodGrams').value,$('foodUnit').value,{pieceAmount:$('foodPieceAmount').value,pieceUnit:$('foodPieceUnit').value,density:$('foodDensity').value});
      $('simpleFoodMacros').innerHTML=[['Kalorie',a.calories,'kcal'],['Sacharidy',a.carbs_g,'g'],['Bílkoviny',a.protein_g,'g'],['Tuky',a.fat_g,'g']].map(([label,value,unit])=>'<div><strong>'+(value==null?'—':fmt(value,1))+' <small>'+unit+'</small></strong><span>'+label+'</span></div>').join('');
      $('foodPortionPreview').textContent='Vybráno '+fmt(a.amount,2)+' '+(a.unit==='portion'?'porce':a.unit);$('ingredientAdd').disabled=['calories','carbs_g','protein_g','fat_g'].some(k=>a[k]==null||!Number.isFinite(a[k])||a[k]<0);
    }catch(e){$('simpleFoodMacros').innerHTML='<p class="small">Zkontroluj množství a hodnoty.</p>';$('foodPortionPreview').textContent=e.message;$('ingredientAdd').disabled=true;}
  }
  function chooseAmount(){
    const amount=parseFoodQuantity($('simpleFoodAmount').value),portion=portions.find(p=>p.key===$('simpleFoodPortion').value);if(!portion)return;
    updating=true;try{$('foodUnit').value=portion.unit;if(portion.key==='piece'){$('foodPieceAmount').value=foodPackageSize(foodEditorProduct().piece_size)?.amount||$('foodPieceAmount').value;}foodSelected.preferred_unit=portion.key==='serving'?'portion':portion.unit;$('foodGrams').value=amount?String(amount*portion.size):$('simpleFoodAmount').value;$('foodMultiplier').value='1';updateFoodPreview();$('foodGrams').dispatchEvent(new Event('input',{bubbles:true}));}finally{updating=false;}updateSimple();
  }
  function prepareSimple(openOnSelect=false){
    const p=foodEditorProduct();portions=simpleFoodPortions(p);$('simpleFoodPortion').innerHTML=portions.map(o=>'<option value="'+o.key+'">'+esc(o.label)+'</option>').join('');
    const unit=$('foodUnit').value,amount=parseFoodQuantity($('foodGrams').value),chosen=portions.find(o=>o.unit===unit&&(o.size===amount||o.key==='pack'||o.key==='portion'))||portions.find(o=>o.unit===unit&&o.size===1)||portions[0];
    $('simpleFoodPortion').value=chosen.key;$('simpleFoodAmount').value=amount?String(amount/chosen.size):'1';if(openOnSelect)advanced.open=['calories_100g','carbs_100g','protein_100g','fat_100g'].some(k=>p[k]==null);updateSimple();
  }
  $('simpleFoodAmount').oninput=chooseAmount;$('simpleFoodPortion').onchange=chooseAmount;
  controls.querySelectorAll('[data-simple-amount]').forEach(b=>b.onclick=()=>{$('simpleFoodAmount').value=b.dataset.simpleAmount;chooseAmount();});
  const originalSelect=selectFoodProduct;selectFoodProduct=function(p){originalSelect(p);prepareSimple(true);};
  const originalPreview=updateFoodPreview;updateFoodPreview=function(){originalPreview();if($('simpleFoodMacros'))updateSimple();};
  editor.addEventListener('input',()=>{updateSimple();});editor.addEventListener('change',e=>{if(!updating&&e.target.id!=='simpleFoodPortion')prepareSimple();});
  const style=document.createElement('style');style.textContent='#foodEditor{border:1px solid color-mix(in srgb,var(--muted) 29%,var(--bg));border-radius:20px!important;padding:24px!important}.simple-food-hero h3{display:block!important;font-size:27px;margin:9px 0 22px;line-height:1.2}.simple-food-macros{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:18px 0;border-top:1px solid color-mix(in srgb,var(--muted) 25%,var(--bg));border-bottom:1px solid color-mix(in srgb,var(--muted) 25%,var(--bg));margin-bottom:20px}.simple-food-macros strong{display:block;font-size:21px;white-space:nowrap}.simple-food-macros strong small{font-size:var(--fs-small);font-weight:500}.simple-food-macros span{display:block;font-size:var(--fs-small);color:color-mix(in srgb,var(--muted) 92%,var(--text));margin-top:6px}.simple-food-picker{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px}.simple-food-picker label{display:grid;gap:6px;color:color-mix(in srgb,var(--muted) 92%,var(--text));font-size:var(--fs-small)}.simple-food-picker .food-input{font-size:16px;padding:13px}.simple-food-fractions{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.simple-food-fractions .btn{padding:7px 12px;min-width:40px}#foodEditor #foodPortionPreview{border:0;background:none;padding:0;color:color-mix(in srgb,var(--muted) 92%,var(--text));font-size:var(--fs-small);margin:12px 0}.simple-food-add{width:100%;padding:14px!important;border-radius:14px!important;font-size:16px}#foodAdvanced{margin-top:18px;border-top:1px solid color-mix(in srgb,var(--muted) 25%,var(--bg));padding-top:15px}#foodAdvanced summary{cursor:pointer;color:color-mix(in srgb,var(--muted) 92%,var(--text));font-size:var(--fs-small)}#foodAdvanced .food-editor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#foodAdvanced #savePersonalFood{margin-top:12px}.simple-food-context{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.simple-food-context label{display:grid;gap:5px;font-size:var(--fs-small);color:color-mix(in srgb,var(--muted) 92%,var(--text))}.simple-food-context .food-input{min-height:42px}.food-selection-layout #foodResults{max-height:550px}.food-selection-layout{grid-template-columns:minmax(0,1fr) minmax(360px,1fr)}@media(max-width:900px){.food-selection-layout{grid-template-columns:minmax(0,1fr)}#foodEditor{padding:18px!important}.simple-food-macros{gap:6px}.simple-food-macros strong{font-size:19px}.simple-food-macros span{font-size:var(--fs-small)}}';document.head.append(style);
}
// Food editor: full width and low (portion on the left, values on the right),
// without fibre, salt and the pasted-label text; photos are still read.
function installCompactFoodEditor(){
  for(const id of ['food-fiber_100g','food-salt_100g'])$(id).closest('label').hidden=true;
  $('foodOcrDetails').hidden=true;
  const style=document.createElement('style');style.textContent='.food-selection-layout{grid-template-columns:minmax(0,1fr)!important;gap:14px!important}.food-selection-layout #foodResults{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;max-height:280px}#foodEditor:not([hidden]){display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.5fr);column-gap:28px;align-items:start;padding:18px 22px!important}#foodEditor>*{grid-column:1;min-width:0}#foodEditor>#foodAdvanced{grid-column:2;grid-row:1/span 12;margin-top:0;border-top:0;padding-top:0}#foodAdvanced .food-editor-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 10px}#foodAdvanced .food-editor-grid label{font-size:var(--fs-small)}#foodAdvanced .food-input{padding:8px 9px;min-height:0}.simple-food-hero h3{font-size:21px!important;margin:4px 0 12px!important}.simple-food-macros{padding:10px 0!important;margin-bottom:12px!important}.simple-food-macros strong{font-size:18px!important}.simple-food-picker .food-input{padding:9px!important;font-size:15px!important}.simple-food-fractions{margin:8px 0!important}#foodEditor #foodPortionPreview{margin:6px 0!important}.simple-food-add{padding:10px!important}@media(max-width:1100px){#foodAdvanced .food-editor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:900px){#foodEditor:not([hidden]){display:block}#foodEditor>#foodAdvanced{margin-top:14px;border-top:1px solid color-mix(in srgb,var(--muted) 25%,var(--bg));padding-top:12px}}';document.head.append(style);
}

// Settings → FTP a zóny: FTP (manual, calculated or from Intervals), power and heart-rate zones.
const inputStyle='background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);border:1px solid color-mix(in srgb,var(--lilac) 24%,var(--bg));border-radius:9px;padding:8px;min-width:0';
async function loadTrainingProfile(){
  const card=$('trainingProfileCard');if(!card)return;
  try{const d=await jsonFetch('/app/api/training-profile');state.trainingProfile=d;renderTrainingProfile(d)}
  catch(e){card.innerHTML='<h3>FTP a zóny</h3><div class="notice">'+esc(e.message)+'</div>'}
}
function zoneBoundsEditor(id,bounds,unit){return '<div class="select-row" style="flex-wrap:wrap;gap:6px">'+bounds.map((b,i)=>'<label class="small">Z'+(i+1)+' do <input data-bound="'+id+'" type="number" value="'+esc(b)+'" style="'+inputStyle+';width:70px"> '+unit+'</label>').join('')+'</div>'}
// Power zone bounds can be typed in % FTP or in watts; the two fields stay in sync.
function powerBoundsEditor(bounds,ftp){
  const pct=b=>Math.round(b*10)/10;
  return '<p class="small" style="margin:8px 0 4px">Horní hranice zón – zadej v % FTP nebo ve wattech'+(ftp?uiText(' (z FTP ', ' (from FTP ')+esc(ftp)+uiText(' W; uloží se v %, takže se při změně FTP přepočítají)', ' W; saved in %, so they recalculate when FTP changes)'):uiText(' (watty jdou zadat po nastavení FTP)', ' (watts can be entered once FTP is set)'))+'.</p><div style="display:grid;gap:6px">'+bounds.map((b,i)=>'<div class="select-row" style="gap:6px;flex-wrap:wrap"><span class="small" style="min-width:34px">Z'+(i+1)+' do</span><input data-bound="power" data-index="'+i+'" type="number" step="0.1" value="'+esc(pct(b))+'" aria-label="Z'+(i+1)+uiText(' horní hranice v % FTP" style="', ' upper limit in % of FTP" style="')+inputStyle+';width:80px"><span class="small">%</span><input data-bound-watts="'+i+'" type="number" value="'+(ftp?Math.round(ftp*b/100):'')+'"'+(ftp?'':' disabled')+' aria-label="Z'+(i+1)+uiText(' horní hranice ve wattech" style="', ' upper limit in watts" style="')+inputStyle+';width:80px"><span class="small">W</span></div>').join('')+'</div>';
}
// Pace zone bounds in % of threshold speed or as a pace (m:ss /km).
function paceBoundsEditor(bounds,pace){
  const pct=b=>Math.round(b*10)/10,at=b=>pace?fmtPace(pace*100/b):'';
  return '<p class="small" style="margin:8px 0 4px">Hranice zón (rychlejší konec zóny) – zadej v % prahového tempa nebo jako tempo m:ss /km'+(pace?'':uiText(' (tempo jde zadat po nastavení prahového tempa)', ' (pace can be entered once threshold pace is set)'))+'.</p><div style="display:grid;gap:6px">'+bounds.map((b,i)=>'<div class="select-row" style="gap:6px;flex-wrap:wrap"><span class="small" style="min-width:34px">Z'+(i+1)+' do</span><input data-bound="pace" data-index="'+i+'" type="number" step="0.1" value="'+esc(pct(b))+'" aria-label="Z'+(i+1)+uiText(' hranice v % prahového tempa" style="', ' limit in % of threshold pace" style="')+inputStyle+';width:80px"><span class="small">%</span><input data-bound-pace="'+i+'" type="text" inputmode="numeric" placeholder="m:ss" value="'+esc(at(b))+'"'+(pace?'':' disabled')+' aria-label="Z'+(i+1)+' hranice jako tempo" style="'+inputStyle+';width:80px"><span class="small">/km</span></div>').join('')+'</div>';
}
function parsePaceInput(v){const m=String(v||'').trim().match(/^(\d{1,2})[:.](\d{1,2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function wirePaceBoundsEditor(pace){
  if(!pace)return;
  document.querySelectorAll('[data-bound-pace]').forEach(t=>{const p=document.querySelector('[data-bound="pace"][data-index="'+t.dataset.boundPace+'"]');
    t.oninput=()=>{const sec=parsePaceInput(t.value);if(sec)p.value=Math.round(pace/sec*1000)/10};
    p.oninput=()=>{if(Number(p.value)>0)t.value=fmtPace(pace*100/Number(p.value))}});
}
function wirePowerBoundsEditor(ftp){
  if(!ftp)return;
  document.querySelectorAll('[data-bound-watts]').forEach(w=>{const p=document.querySelector('[data-bound="power"][data-index="'+w.dataset.boundWatts+'"]');
    w.oninput=()=>{if(w.value)p.value=Math.round(Number(w.value)/ftp*1000)/10};
    p.oninput=()=>{if(p.value)w.value=Math.round(ftp*Number(p.value)/100)}});
}
// Compact, Intervals-style panels: the key numbers on top, one dense zone table each.
function zoneCode(name){const m=String(name||'').match(/^(\S+)\s+(.*)$/);return m?[m[1],m[2]]:[String(name||''),'']}
function zoneRows(rows){return '<table class="zone-table"><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
function renderTrainingProfile(d){
  const p=d.profile||{},r=d.resolved||{},card=$('trainingProfileCard');
  const src={manual:'ručně','intervals-settings':'z Intervals.icu','latest-ride':'z poslední jízdy'}[r.ftpSource]||'nenastaveno';
  const powerModel=p.powerZoneModel||'coggan7',hrModel=p.hrZoneModel||'frielLthr';
  const powerBounds=powerModel==='custom'?(p.powerZoneBounds||[55,75,90,105,120,150]):(d.powerZoneModels.find(m=>m.id===powerModel)?.bounds||[]);
  const hrBounds=p.hrZoneBounds||d.hrZones.slice(0,-1).map(z=>z.bpmHigh).filter(Boolean);
  const hrRef=(d.hrZoneModels.find(m=>m.id===hrModel)?.reference)||'lthr',refBpm=hrRef==='maxHr'?r.maxHr:r.lthr,pctOf=v=>refBpm&&v!=null?Math.round(v/refBpm*100):null;
  const figure=(label,value)=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>';
  const field=(id,label,value,placeholder)=>'<div><span>'+label+'</span><input id="'+id+'" type="number" value="'+esc(value||'')+'" placeholder="'+esc(placeholder||'—')+'" aria-label="'+esc(label)+'"></div>';
  const power='<section class="zone-panel"><h4>⚡ Výkon</h4><div class="zone-figures">'+field('tpFtp','FTP (ručně)',p.ftp,r.ftp?String(r.ftp):'W')+figure('Platné FTP',r.ftp?esc(r.ftp)+' W':'—')+figure('Indoor FTP',r.indoorFtp?esc(r.indoorFtp)+' W':'—')+figure('eFTP',r.latestRideFtp?esc(r.latestRideFtp)+' W':'—')+'</div>'+
    '<p class="small" style="margin:0 0 8px">Zdroj FTP: '+esc(src)+(r.intervalsFtp?' · Intervals.icu '+esc(r.intervalsFtp)+' W':'')+'. Ruční FTP má přednost. '+(p.ftp?'<button class="btn" type="button" id="tpClearFtp">Použít FTP z Intervals</button>':'')+'</p>'+
    '<select id="tpPowerModel" style="'+inputStyle+'">'+d.powerZoneModels.map(m=>'<option value="'+esc(m.id)+'"'+(m.id===powerModel?' selected':'')+'>'+esc(m.label)+'</option>').join('')+'<option value="custom"'+(powerModel==='custom'?' selected':'')+'>Vlastní hranice</option></select>'+
    zoneRows(d.powerZones.map(z=>{const [code,label]=zoneCode(z.name);return [esc(code),esc(label),Math.round(z.percentLow)+(z.percentHigh!=null?'–'+Math.round(z.percentHigh):'+')+' %',z.wattsLow!=null?z.wattsLow+(z.wattsHigh!=null?'–'+z.wattsHigh:'+')+' W':'—']}))+
    (powerModel==='custom'?powerBoundsEditor(powerBounds,r.ftp):'<button class="btn" type="button" id="tpEditPower" style="margin-top:8px">Upravit hranice</button>')+
    '<details class="explain-block"><summary>Spočítat FTP z testu</summary><div class="select-row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><select id="tpMethod" style="'+inputStyle+'">'+d.ftpMethods.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.label)+'</option>').join('')+'</select><span id="tpMethodInputs"></span><button class="btn" type="button" id="tpEstimate">Spočítat</button></div><div class="small" id="tpEstimateResult" aria-live="polite"></div></details></section>';
  const heart='<section class="zone-panel"><h4>❤ Tep</h4><div class="zone-figures">'+field('tpLthr','Prahový tep',r.lthr,'bpm')+field('tpMaxHr','Max. tep',r.maxHr,'bpm')+field('tpRestHr','Klidový tep',r.restHr,'bpm')+'</div>'+
    '<select id="tpHrModel" style="'+inputStyle+'">'+d.hrZoneModels.map(m=>'<option value="'+esc(m.id)+'"'+(m.id===hrModel?' selected':'')+'>'+esc(m.label)+'</option>').join('')+'<option value="custom"'+(hrModel==='custom'?' selected':'')+'>Vlastní hranice (bpm)</option></select>'+
    zoneRows(d.hrZones.map(z=>{const [code,label]=zoneCode(z.name),lo=pctOf(z.bpmLow),hi=pctOf(z.bpmHigh);return [esc(code),esc(label),hrModel==='custom'||(lo==null&&hi==null)?'':(lo==null?'0':lo)+(hi!=null?'–'+hi:'+')+' %',z.bpmLow==null&&z.bpmHigh==null?'—':z.bpmLow==null?uiText('Do ','Up to ')+z.bpmHigh:z.bpmLow+(z.bpmHigh!=null?'–'+z.bpmHigh:'+')]}))+
    (hrModel==='custom'?zoneBoundsEditor('hr',hrBounds.length?hrBounds:[130,145,155,165],'bpm'):'<button class="btn" type="button" id="tpEditHr" style="margin-top:8px">Upravit hranice</button>')+
    (d.hrZones.every(z=>z.bpmHigh==null&&z.bpmLow==null)?'<p class="small">Doplň prahový tep (LTHR), max. tep, nebo max. a klidový tep podle zvoleného modelu.</p>':'')+'</section>';
  card.innerHTML='<h3>FTP a zóny</h3><div class="zone-columns">'+power+heart+runProfileHtml(d)+'</div>'+
    '<div class="workout-filter-actions" style="margin-top:12px"><button class="btn primary" type="button" id="tpSave">Uložit</button><span class="small" id="tpResult" aria-live="polite"></span></div>';
  const methodInputs=()=>{const m=d.ftpMethods.find(x=>x.id===$('tpMethod').value);$('tpMethodInputs').innerHTML=m.inputs.map(i=>'<label class="small">'+esc(i.label)+' <input data-ftp-input="'+esc(i.key)+'" type="number" step="0.1" style="'+inputStyle+';width:90px"></label>').join(' ')};
  $('tpMethod').onchange=methodInputs;methodInputs();
  $('tpEstimate').onclick=async()=>{const inputs={};document.querySelectorAll('[data-ftp-input]').forEach(i=>inputs[i.dataset.ftpInput]=i.value);try{const r2=await jsonFetch('/app/api/training-profile/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:$('tpMethod').value,inputs})});$('tpEstimateResult').innerHTML='FTP ≈ <strong>'+r2.ftp+' W</strong> <button class="btn" type="button" id="tpUseEstimate">Použít</button>';$('tpUseEstimate').onclick=()=>{$('tpFtp').value=r2.ftp;state.tpFtpMethod=$('tpMethod').value;toast('FTP '+r2.ftp+' W – ulož nastavení.')}}catch(e){$('tpEstimateResult').textContent=e.message}};
  // Switching to custom bounds starts from the zones shown now.
  const paceModel=p.paceZoneModel||'friel';
  state.tpSeed={power:powerBounds,hr:hrBounds.length?hrBounds:[130,145,155,165],pace:paceModel==='custom'?(p.paceZoneBounds||[]):(d.paceZoneModels?.find(m=>m.id===paceModel)?.bounds||[77.5,87.7,94.3,100,103.4,111.5])};
  wireRunProfile(d);
  wirePowerBoundsEditor(r.ftp);
  const editPower=$('tpEditPower');if(editPower)editPower.onclick=()=>{$('tpPowerModel').value='custom';saveTrainingProfileForm()};
  const editHr=$('tpEditHr');if(editHr)editHr.onclick=()=>{$('tpHrModel').value='custom';saveTrainingProfileForm()};
  // Changing a model saves right away so the tables show the new zones.
  $('tpPowerModel').onchange=saveTrainingProfileForm;$('tpHrModel').onchange=saveTrainingProfileForm;
  const clear=$('tpClearFtp');if(clear)clear.onclick=()=>{$('tpFtp').value='';saveTrainingProfileForm()};
  $('tpSave').onclick=saveTrainingProfileForm;
}
function collectTrainingProfile(){
  const v=id=>$(id)?.value?Number($(id).value):undefined,bounds=k=>[...document.querySelectorAll('[data-bound="'+k+'"]')].map(i=>Number(i.value));
  const out={ftp:v('tpFtp'),ftpMethod:state.tpFtpMethod,powerZoneModel:$('tpPowerModel').value,lthr:v('tpLthr'),maxHr:v('tpMaxHr'),restHr:v('tpRestHr'),hrZoneModel:$('tpHrModel').value};
  if(out.powerZoneModel==='custom'){const b=bounds('power');out.powerZoneBounds=b.length?b:(state.tpSeed?.power||[55,75,90,105,120,150])}
  if(out.hrZoneModel==='custom'){const b=bounds('hr');out.hrZoneBounds=b.length?b:(state.tpSeed?.hr||[130,145,155,165])}
  if($('tpPaceModel')){
    Object.assign(out,{runThresholdPace:$('tpRunPace').value.trim()||undefined,runLthr:v('tpRunLthr'),paceZoneModel:$('tpPaceModel').value,paceMethod:state.tpPaceMethod});
    if(out.paceZoneModel==='custom'){const b=bounds('pace');out.paceZoneBounds=b.length?b:state.tpSeed?.pace}
  }
  return out;
}
async function saveTrainingProfileForm(){
  try{const d=await jsonFetch('/app/api/training-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(collectTrainingProfile())});state.trainingProfile=d;renderTrainingProfile(d);toast('FTP a zóny jsou uložené.')}
  catch(e){const el=$('tpResult');if(el)el.textContent=e.message;toast(e.message)}
}
// Running: threshold pace (manual, from a race or from Intervals) and pace zones.
function runProfileHtml(d){
  const p=d.profile||{},r=d.resolved||{},paceModel=p.paceZoneModel||'friel',pace=r.runThresholdPace;
  const src={manual:'ručně','intervals-settings':'z Intervals.icu'}[r.runPaceSource]||'nenastaveno';
  const bounds=paceModel==='custom'?(p.paceZoneBounds||[]):(d.paceZoneModels||[]).find(m=>m.id===paceModel)?.bounds||[];
  const zoneRange=z=>!pace?'—':z.paceSlow==null?'> '+fmtPace(z.paceFast):z.paceFast==null?'< '+fmtPace(z.paceSlow):fmtPace(z.paceSlow)+'–'+fmtPace(z.paceFast);
  return '<section class="zone-panel"><h4>🏃 Běh</h4><div class="zone-figures"><div><span>Prahové tempo (ručně)</span><input id="tpRunPace" type="text" inputmode="numeric" placeholder="'+esc(pace?fmtPace(pace):'m:ss')+'" value="'+esc(p.runThresholdPace?fmtPace(p.runThresholdPace):'')+'" aria-label="Ruční prahové tempo"></div><div><span>Platné tempo</span><strong>'+(pace?esc(fmtPace(pace))+' /km':'—')+'</strong></div><div><span>Prahový tep běh</span><input id="tpRunLthr" type="number" value="'+esc(p.runLthr||'')+'" placeholder="'+esc(r.runLthr||'bpm')+'" aria-label="Běžecký prahový tep"></div></div>'+
    '<p class="small" style="margin:0 0 8px">Zdroj: '+esc(src)+(r.intervalsRunPace&&r.runPaceSource==='manual'?' · Intervals.icu '+esc(fmtPace(r.intervalsRunPace))+' /km':'')+'. Prahové tempo ≈ tempo, které udržíš zhruba hodinu. '+(p.runThresholdPace?'<button class="btn" type="button" id="tpClearPace">Použít tempo z Intervals</button>':'')+'</p>'+
    '<select id="tpPaceModel" style="'+inputStyle+'">'+(d.paceZoneModels||[]).map(m=>'<option value="'+esc(m.id)+'"'+(m.id===paceModel?' selected':'')+'>'+esc(m.label)+'</option>').join('')+'<option value="custom"'+(paceModel==='custom'?' selected':'')+'>Vlastní hranice</option></select>'+
    zoneRows((d.paceZones||[]).map(z=>{const [code,label]=zoneCode(z.name);return [esc(code),esc(label),(z.percentLow?Math.round(z.percentLow*10)/10:0)+(z.percentHigh!=null?'–'+Math.round(z.percentHigh*10)/10:'+')+' %',esc(zoneRange(z))]}))+
    (paceModel==='custom'?paceBoundsEditor(bounds,pace):'<button class="btn" type="button" id="tpEditPace" style="margin-top:8px">Upravit hranice</button>')+
    '<details class="explain-block"><summary>Spočítat prahové tempo ze závodu nebo testu</summary><div class="select-row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><select id="tpPaceMethod" style="'+inputStyle+'">'+(d.paceMethods||[]).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.label)+'</option>').join('')+'</select><span id="tpPaceInputs"></span><button class="btn" type="button" id="tpPaceEstimate">Spočítat</button></div><div class="small" id="tpPaceResult" aria-live="polite"></div><p class="small">Ze závodu přepočítávám na tempo na 60 min (Riegel). Test 30 min: průměrné tempo posledních 20 min (Friel).</p></details></section>';
}
function wireRunProfile(d){
  if(!$('tpPaceModel'))return;
  const inputs=()=>{const m=(d.paceMethods||[]).find(x=>x.id===$('tpPaceMethod').value);$('tpPaceInputs').innerHTML=(m?.inputs||[]).map(i=>'<label class="small">'+esc(i.label)+' <input data-pace-input="'+esc(i.key)+'" type="text" style="'+inputStyle+';width:90px"></label>').join(' ')};
  $('tpPaceMethod').onchange=inputs;inputs();
  $('tpPaceEstimate').onclick=async()=>{const values={};document.querySelectorAll('[data-pace-input]').forEach(i=>values[i.dataset.paceInput]=i.value);try{const r=await jsonFetch('/app/api/training-profile/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'pace',method:$('tpPaceMethod').value,inputs:values})});$('tpPaceResult').innerHTML='Prahové tempo ≈ <strong>'+esc(r.formatted)+' /km</strong> <button class="btn" type="button" id="tpUsePace">Použít</button>';$('tpUsePace').onclick=()=>{$('tpRunPace').value=r.formatted;state.tpPaceMethod=$('tpPaceMethod').value;toast('Prahové tempo '+r.formatted+' /km – ulož nastavení.')}}catch(e){$('tpPaceResult').textContent=e.message}};
  $('tpPaceModel').onchange=saveTrainingProfileForm;
  const edit=$('tpEditPace');if(edit)edit.onclick=()=>{$('tpPaceModel').value='custom';saveTrainingProfileForm()};
  const clear=$('tpClearPace');if(clear)clear.onclick=()=>{$('tpRunPace').value='';saveTrainingProfileForm()};
  wirePaceBoundsEditor(d.resolved?.runThresholdPace);
}
// ---- Consent (consent.js) ----
// Health data needs the user's explicit consent (GDPR Art. 9) before the app shows
// or loads anything. The one consent covers sending data to OpenAI for AI
// features too and is withdrawn by deleting the account. An account that agreed
// only to health data (the AI part was separate before) is asked once at its
// first AI use (askAiConsent).
const AI_CONSENT_TEXT=()=>uiText('Souhlasím, aby Loadwise při použití AI funkcí (asistent, rozpoznání jídla z fotky, hodnocení tréninku a týdne) posílal potřebné údaje, včetně údajů o zdraví a fotek jídla, společnosti OpenAI v USA.','I agree that when I use AI features (the assistant, food recognition from photos, workout and week reviews), Loadwise sends the data they need, including health data and food photos, to OpenAI in the USA.');
function consentDataList(){return '<ul class="consent-points"><li>'+uiText('<strong>Co:</strong> tep, variabilita tepu (HRV), spánek, váha a tělesný tuk, jídlo a pití, tréninky a jak ti šly.','<strong>What:</strong> heart rate, heart rate variability (HRV), sleep, weight and body fat, food and drinks, workouts and how they went.')+'</li><li>'+uiText('<strong>Odkud:</strong> ze služeb, které připojíš (Google Health, Intervals.icu), a z toho, co zadáš sám.','<strong>From:</strong> the services you connect (Google Health, Intervals.icu) and what you enter yourself.')+'</li><li>'+uiText('<strong>K čemu:</strong> jen k přehledům, výpočtům a plánům v Loadwise. Data neprodáváme a nepoužíváme k reklamě.','<strong>Why:</strong> only for overviews, calculations and plans in Loadwise. We don\'t sell your data or use it for advertising.')+'</li><li>'+uiText('<strong>AI:</strong> když použiješ AI funkci (asistent, rozpoznání jídla z fotky, hodnocení tréninku a týdne), pošle Loadwise potřebné údaje, včetně údajů o zdraví a fotek jídla, společnosti OpenAI v USA.','<strong>AI:</strong> when you use an AI feature (the assistant, food recognition from photos, workout and week reviews), Loadwise sends the data it needs, including health data and food photos, to OpenAI in the USA.')+'</li><li>'+uiText('<strong>Odvolání:</strong> smazáním účtu v Nastavení → Účet, kde si předtím můžeš stáhnout všechna svoje data.','<strong>Withdrawing:</strong> delete your account in Settings → Account, where you can first download all your data.')+'</li></ul>';}
// The consent as a form field: in the setup guide for a new account, or on its
// own screen for an account set up before consents were asked. It covers the AI
// features too (Petr, 2026-10-08); it is withdrawn by deleting the account.
function consentFieldsHtml(consent){return consentDataList()+
  '<label class="consent-option"><input type="checkbox" id="consentHealth" required><span>'+uiText('Souhlasím, aby Loadwise zpracovával moje údaje o zdraví, jak je popsáno výše, včetně AI funkcí. <em>Nutné pro používání aplikace.</em>','I agree that Loadwise processes my health data as described above, including the AI features. <em>Required to use the app.</em>')+'</span></label>'+
  '<p class="small"><a href="/privacy" target="_blank" rel="noopener">'+uiText('Zásady ochrany soukromí','Privacy Policy')+'</a></p>';}
async function submitConsent(){const r=await jsonFetch('/app/api/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({health:true,ai:true})});subscriptionPromise=null;accountConsent=r.consent;return r.consent;}
let accountConsent=null;
function showConsentGate(me){
  return new Promise(resolve=>{
    $('consentGate')?.remove();
    document.body.insertAdjacentHTML('beforeend','<div id="consentGate" role="dialog" aria-modal="true" aria-labelledby="consentTitle" style="'+gateStyle+'"><form class="card consent-card" id="consentForm"><h2 id="consentTitle">'+uiText('Souhlas se zpracováním údajů o zdraví','Consent to process health data')+'</h2><p class="small">'+(me.consent?.health?uiText('Upravili jsme podmínky zpracování, proto se ptáme znovu.','We changed how data is processed, so we\'re asking again.'):uiText('Loadwise pracuje s údaji o tvém zdraví. Podle GDPR k tomu potřebujeme tvůj výslovný souhlas.','Loadwise works with data about your health. Under the GDPR it needs your explicit consent for that.'))+'</p>'+consentFieldsHtml(me.consent)+
      '<p class="small" id="consentError" role="alert"></p><div class="consent-buttons"><button class="btn" type="button" id="consentLogout">'+uiText('Nesouhlasím a odhlásit','Decline and sign out')+'</button><button class="btn primary" type="submit" id="consentSubmit" disabled>'+uiText('Pokračovat','Continue')+'</button></div></form></div>');
    $('consentHealth').onchange=e=>{$('consentSubmit').disabled=!e.target.checked;};
    $('consentLogout').onclick=logout;
    $('consentForm').onsubmit=async e=>{e.preventDefault();$('consentSubmit').disabled=true;
      try{me.consent=await submitConsent();$('consentGate').remove();resolve(me);}
      catch(error){$('consentError').textContent=error.message;$('consentSubmit').disabled=false;}};
    $('consentHealth').focus({preventScroll:true});
  });
}
// Asked at the first use of an AI feature without the AI consent; true when given.
// A modal dialog, so it also shows above an open editor dialog.
function askAiConsent(){
  return new Promise(resolve=>{
    $('aiConsentDialog')?.remove();
    const d=document.createElement('dialog');d.id='aiConsentDialog';d.className='card consent-card';d.setAttribute('aria-labelledby','aiConsentTitle');
    d.innerHTML='<h2 id="aiConsentTitle">'+uiText('Zapnout AI funkce?','Turn on AI features?')+'</h2><p>'+AI_CONSENT_TEXT()+'</p><p class="small">'+uiText('OpenAI data poslaná přes své rozhraní nepoužívá k trénování modelů a uchovává je nejvýš 30 dní. Souhlas vypneš v Nastavení → Účet.','OpenAI doesn\'t use data sent through its API to train its models and keeps it for up to 30 days. You can turn the consent off in Settings → Account.')+' <a href="/privacy" target="_blank" rel="noopener">'+uiText('Zásady ochrany soukromí','Privacy Policy')+'</a></p><p class="small" id="aiConsentError" role="alert"></p><div class="consent-buttons"><button class="btn" type="button" id="aiConsentNo">'+uiText('Teď ne','Not now')+'</button><button class="btn primary" type="button" id="aiConsentYes">'+uiText('Souhlasím','I agree')+'</button></div>';
    document.body.appendChild(d);
    let answer=false;
    // Escape or "Teď ne" closes it as "not now".
    d.addEventListener('close',()=>{d.remove();resolve(answer);});
    $('aiConsentNo').onclick=()=>d.close();
    $('aiConsentYes').onclick=async e=>{e.target.disabled=true;try{await setAiConsent(true);answer=true;d.close();}catch(error){$('aiConsentError').textContent=error.message;e.target.disabled=false;}};
    d.showModal();
  });
}
async function setAiConsent(on){const r=await jsonFetch('/app/api/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ai:on})});subscriptionPromise=null;return r.consent;}
{const css=document.createElement('style');css.textContent='.consent-card{width:min(560px,100%);display:grid;gap:12px;max-height:calc(100vh - 32px);overflow:auto}.consent-card h2,.consent-card p{margin:0}.consent-points{margin:0;padding-left:18px;display:grid;gap:6px;font-size:var(--fs-small);line-height:1.5}.consent-option{display:flex;gap:10px;align-items:flex-start;font-size:var(--fs-small);line-height:1.5;cursor:pointer}.consent-option input{margin-top:3px;flex:none;width:18px;height:18px}.consent-option em{color:var(--muted);font-style:normal}.consent-buttons{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}.consent-card a{color:inherit;text-decoration:underline}dialog.consent-card:not([open]){display:none}dialog.consent-card{color:var(--text);border:1px solid var(--line);padding:22px}dialog.consent-card::backdrop{background:color-mix(in srgb,var(--bg) 70%,transparent)}';document.head.appendChild(css);}
// Account, onboarding and (for admins) user management.
// Sign in with Apple, once it is set up: Apple can hide the real e-mail, so the Apple ID is linked here.
function appleSignInHtml(apple){if(!apple)return '';return '<div class="metric-line apple-sign-in"><span>Přihlášení přes Apple<br><small>'+(apple.linked?'<span>Připojeno</span>'+(apple.email?' · '+esc(apple.email):''):'Nepřipojeno')+'</small></span>'+(apple.linked?'<button class="btn" type="button" id="appleUnlink">Odpojit</button>':'<a class="btn" href="/auth/apple?link=1">Připojit Apple</a>')+'</div>';}
function installAppleSignIn(){const b=$('appleUnlink');if(!b)return;b.onclick=async()=>{b.disabled=true;try{const r=await fetch('/app/api/me/apple',{method:'DELETE',credentials:'same-origin'});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).message||'HTTP '+r.status);b.closest('.apple-sign-in').outerHTML=appleSignInHtml({linked:false});}catch(error){toast(error.message);b.disabled=false;}};}
// Settings → Účet: moving the account to another e-mail. The code goes to the new address; the data stay.
function emailChangeHtml(){return '<div id="emailChange"><div class="metric-line"><span>E-mail pro přihlášení<br><small>Data zůstanou u účtu. Kód přijde na novou adresu.</small></span><button class="btn" type="button" id="emailChangeOpen">Změnit e-mail</button></div>'
  +'<form id="emailChangeStart" class="email-code-row" novalidate hidden><input id="emailChangeNew" type="email" autocomplete="email" inputmode="email" required placeholder="nový e-mail" aria-label="Nový e-mail"><button class="btn" type="submit">Poslat kód</button></form>'
  +'<form id="emailChangeCode" class="email-code-row" novalidate hidden><input id="emailChangeCodeInput" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required placeholder="123456" aria-label="Kód z e-mailu"><button class="btn primary" type="submit">Potvrdit změnu</button></form>'
  +'<p class="small" id="emailChangeStatus" role="status" aria-live="polite"></p></div>';}
function installEmailChange(current){const open=$('emailChangeOpen');if(!open)return;const start=$('emailChangeStart'),code=$('emailChangeCode'),status=$('emailChangeStatus');let address='';
  open.onclick=()=>{start.hidden=!start.hidden;code.hidden=true;status.textContent='';if(!start.hidden)$('emailChangeNew').focus();};
  start.onsubmit=async e=>{e.preventDefault();const b=start.querySelector('button');address=$('emailChangeNew').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){status.textContent=say('Zadej platný e-mail.');return;}b.disabled=true;status.textContent='';
    try{await authFetch('/app/api/account/email/start',{email:address});status.textContent=say('Kód jsme poslali na novou adresu. Platí 10 minut.');code.hidden=false;$('emailChangeCodeInput').value='';$('emailChangeCodeInput').focus();}catch(error){status.textContent=error.message;}b.disabled=false;};
  code.onsubmit=async e=>{e.preventDefault();const b=code.querySelector('button');b.disabled=true;status.textContent='';
    try{const d=await authFetch('/app/api/account/email/verify',{email:address,code:$('emailChangeCodeInput').value});
      // The passkeys this device knows move with the account to the new address.
      const all=devicePasskeys(),from=mailKey(current);if(all[from]){all[mailKey(d.email)]=all[from];delete all[from];saveDevicePasskeys(all);}
      toast('E-mail je změněný.');loadAccount().catch(error=>toast(error.message));}
    catch(error){status.textContent=error.message;b.disabled=false;}};}
// Settings → Účet: the account's passkeys. Dates come from the browser in the app's language.
const passkeyDate=v=>{const d=new Date(String(v||'').replace(' ','T')+'Z');return isNaN(d)?'':'<time data-no-i18n datetime="'+esc(d.toISOString())+'">'+esc(d.toLocaleDateString(document.documentElement.lang==='en'?'en-GB':'cs-CZ',{day:'numeric',month:'short',year:'numeric'}))+'</time>';};
function passkeysHtml(list){const supported=passkeysSupported();
  const rows=(list||[]).map(p=>'<div class="metric-line passkey-row"><span>'+esc(p.name)+'<br><small><span>Přidán</span> '+passkeyDate(p.createdAt)+(p.lastUsedAt?' · <span>naposledy použit</span> '+passkeyDate(p.lastUsedAt):'')+'</small></span><button class="btn" type="button" data-passkey="'+esc(p.id)+'">Odebrat</button></div>').join('');
  return '<div id="accountPasskeys"><div class="metric-line"><span>Přístupové klíče (passkeys)<br><small>'+(supported?'Přihlášení otiskem prstu, obličejem nebo zámkem zařízení, bez hesla.':'Tento prohlížeč přístupové klíče nepodporuje.')+'</small></span>'+(supported?'<button class="btn" type="button" id="addPasskey">Přidat</button>':'')+'</div>'+rows+'</div>';}
// The English dictionary for text the page cannot translate itself, like a confirm() question.
const say=text=>(window.LW_EN&&window.LW_EN[text])||text;
function installPasskeys(){const box=$('accountPasskeys');if(!box)return;const render=d=>{box.outerHTML=passkeysHtml(d.passkeys);installPasskeys();};
  const add=$('addPasskey');if(add){const warm=()=>newPasskeyOptions.get().catch(()=>{});add.onpointerdown=warm;add.onfocus=warm;
    add.onclick=async()=>{add.disabled=true;try{render(await addPasskey());toast('Přístupový klíč je přidaný.');}catch(error){toast(passkeyError(error,'Přidání přístupového klíče se nedokončilo.'));add.disabled=false;}};}
  box.querySelectorAll('[data-passkey]').forEach(b=>b.onclick=async()=>{if(!confirm(say('Odebrat tento přístupový klíč? Do Loadwise se s ním už nepřihlásíš.')))return;b.disabled=true;
    try{const d=await authFetch('/app/api/passkeys?id='+encodeURIComponent(b.dataset.passkey),undefined,'DELETE');forgetPasskey(b.dataset.passkey);
      // Tells the password manager which passkeys still work here, so it can hide the removed one.
      if(d.userHandle)try{PublicKeyCredential.signalAllAcceptedCredentials?.({rpId:d.rpId,userId:d.userHandle,allAcceptedCredentialIds:d.passkeys.map(p=>p.id)});}catch{}
      render(d);}catch(error){toast(error.message);b.disabled=false;}});}
// Your data: a download of everything, and deleting the account with it.
function accountDataHtml(user){return '<h3 style="margin-top:16px">Tvoje data</h3><p class="small">Stáhni si všechno, co o tobě aplikace ukládá (soubor JSON). Smazání účtu odstraní profil, záznamy, tréninky i propojení a zruší přístup ke Google Health; nejde vrátit.</p><div class="select-row"><a class="btn" href="/app/api/account/export" download>Stáhnout moje data</a>'+(user?.isOwner?'':'<button class="btn danger" type="button" id="deleteAccount">Smazat účet</button>')+'</div>';}
function confirmDeleteAccount(){
  openSheet('Smazat účet','<p>Smaže se tvůj účet a všechna data v aplikaci: profil, váha, jídlo, tréninky, chat i propojení. Přístup aplikace ke Google Health se zruší. Data v Intervals.icu a Google Health zůstanou u nich.</p><p class="small">Chceš je mít? Nejdřív si je <a href="/app/api/account/export" download>stáhni</a>.</p><form id="deleteAccountForm" style="display:grid;gap:10px"><label>Pro potvrzení napiš SMAZAT<input class="food-input" id="deleteAccountConfirm" autocomplete="off" required></label><button class="btn danger" type="submit">Smazat účet natrvalo</button><p class="small" id="deleteAccountResult" role="alert"></p></form>');
  $('deleteAccountForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;
    try{await jsonFetch('/app/api/account/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:$('deleteAccountConfirm').value})});forgetAccount();try{localStorage.clear();}catch{}location.href='/app?deleted=1';}
    catch(error){$('deleteAccountResult').textContent=error.message;b.disabled=false;}};
}
// Today's AI spending against the daily limit (ai-usage.js); the owner has none.
// The user's AI budget: this month's spending against the monthly limit, and today's against the daily one.
function aiUsageHtml(ai){if(!ai)return '';const usd=v=>Number(v||0).toFixed(2).replace('.',uiText(',','.'))+' USD',of=uiText(' z ',' of ');
  if(ai.limitUsd===0||ai.monthLimitUsd===0)return '<p class="small" id="aiUsage">'+uiText('AI funkce nejsou pro tento účet zapnuté.','AI features aren\'t enabled for this account.')+'</p>';
  if(ai.monthLimitUsd==null)return '<p class="small" id="aiUsage">'+uiText('AI tento měsíc: ','AI this month: ')+'<strong>'+usd(ai.monthSpentUsd)+'</strong>'+uiText(' · bez limitu',' · no limit')+'</p>';
  const pct=Math.min(100,ai.monthLimitUsd?ai.monthSpentUsd/ai.monthLimitUsd*100:0);
  return '<div id="aiUsage"><p class="small" style="margin-bottom:4px">'+uiText('AI tento měsíc: ','AI this month: ')+'<strong>'+usd(ai.monthSpentUsd)+of+usd(ai.monthLimitUsd)+'</strong>'+(ai.limitUsd==null?'':' · '+uiText('dnes ','today ')+usd(ai.spentUsd)+of+usd(ai.limitUsd))+'</p><div class="bar" role="img" aria-label="'+esc(uiText('Vyčerpáno ','Used ')+Math.round(pct)+' %'+uiText(' měsíčního limitu AI',' of the monthly AI limit'))+'"><i style="width:'+pct.toFixed(1)+'%"></i></div></div>';}
async function loadAccount(){const me=await jsonFetch('/app/api/me');setConnectedServices(['google','intervals'].filter(id=>!(me.missingProviders||[]).includes(id)));const card=$('accountCard');if(card){card.innerHTML='<div class="detail-heading"><h3>Účet</h3><button class="btn" type="button" id="logoutBtn">Odhlásit</button></div><p class="small" style="margin:0">Přihlášen jako <strong>'+esc(me.user?.email||'')+'</strong>'+(me.user?.isAdmin?' · správce':'')+'</p>'+(me.emailLogin&&!me.user?.isOwner?emailChangeHtml():'')+passkeysHtml(me.passkeys)+appleSignInHtml(me.apple)+aiUsageHtml(me.ai)+'<p class="small">Průvodce tě znovu provede propojením služeb, profilem a tréninkem.</p><button class="btn" type="button" id="restartSetup">Spustit průvodce nastavením</button>'+accountDataHtml(me.user);$('logoutBtn').onclick=logout;keepPasskeys(me.user?.email,(me.passkeys||[]).map(p=>p.id));installPasskeys();installEmailChange(me.user?.email);installAppleSignIn();$('restartSetup').onclick=()=>showAccountSetup({edit:true}).catch(error=>toast(error.message));if($('deleteAccount'))$('deleteAccount').onclick=confirmDeleteAccount;setSettingsSummary('account',me.user?.email||'');}accountSetup=me.onboarding;if(me.onboarding?.profile)localStorage.setItem('fitnessProfile',JSON.stringify({...me.onboarding.profile,mainSport:me.onboarding.savedProfile?.mainSport||'general'}));accountConsent=me.consent;if(!me.onboarding?.completed)showOnboarding();if(!$('trainingProfileCard')&&$('settings')){settingsBody('training').insertAdjacentHTML('afterbegin','<article class="card" id="trainingProfileCard"><h3>FTP a zóny</h3><div class="small">Načítám…</div></article>');loadTrainingProfile();}if(me.user?.isAdmin)installAdmin(me);return me;}
function installAdmin(me={}){if($('adminCard'))return;settingsSection('users').hidden=false;settingsBody('users').insertAdjacentHTML('beforeend','<article class="card" id="adminCard"><h3>Uživatelé</h3><p class="small">'+(me.emailLogin?'Přihlásit se mohou jen pozvaní. Pozvi jejich e-mail a pošli jim odkaz na aplikaci. Přihlásí se přes Google, nebo kódem, který jim přijde e-mailem. Připojení Google Health a Intervals si každý nastaví sám.':'Přihlásit se přes Google mohou jen pozvaní. Pozvi e-mail Google účtu a pošli uživateli odkaz na aplikaci. Připojení Google Health a Intervals si každý nastaví sám.')+'</p><form id="inviteForm" class="select-row"><input id="inviteEmail" type="email" required placeholder="email@gmail.com" aria-label="E-mail pozvaného uživatele" style="background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);border:1px solid color-mix(in srgb,var(--lilac) 24%,var(--bg));border-radius:9px;padding:10px;min-width:0;flex:1"><button class="btn primary" type="submit">Pozvat</button></form><p class="small">Dokud Google aplikaci neověří, připojí Google Health nejvýš 100 lidí. Když je projekt v Google Cloud v testovacím režimu, přidej každého i mezi Test users a souhlas mu po 7 dnech vyprší. Po zveřejnění projektu stačí, když uživatel potvrdí varování, že aplikace není ověřená.</p><div id="adminUsers" class="small">Načítám…</div></article>');$('inviteForm').onsubmit=async e=>{e.preventDefault();try{const r=await jsonFetch('/app/api/admin/invites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('inviteEmail').value})});$('inviteEmail').value='';toast(r.message);loadAdmin();}catch(error){toast(error.message);}};loadAdmin();if(me.user?.isOwner&&COOKBOOK_SHOWN)installCookbookUpload();}
// The owner's printed cookbook is copyrighted, so it lives only in the database:
// he uploads his private copy (JSON) here (cookbook.js).
function installCookbookUpload(){$('adminCard').insertAdjacentHTML('beforeend','<h3 style="margin-top:16px">'+uiText('Kuchařka','Cookbook')+'</h3><p class="small">'+uiText('Recepty z tištěné kuchařky nejsou ve veřejném kódu. Nahraj sem svoji soukromou kopii (kucharka.json); nahrání nahradí předchozí.','The printed cookbook\'s recipes aren\'t in the public code. Upload your private copy (kucharka.json) here; it replaces the previous one.')+'</p><label class="btn" style="display:inline-flex">'+uiText('Nahrát kuchařku','Upload cookbook')+'<input type="file" id="cookbookFile" accept="application/json,.json" hidden></label>');
  $('cookbookFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;
    try{const r=await jsonFetch('/app/api/admin/cookbook',{method:'POST',headers:{'Content-Type':'application/json'},body:await file.text()});toast(r.message);}catch(error){toast(error.message);}finally{e.target.value='';}};}
async function loadAdmin(){try{const d=await jsonFetch('/app/api/admin/users');const users=d.users.map(u=>'<div class="metric-line"><span>'+esc(u.email)+(u.role==='admin'?' · správce':'')+(u.disabled?' · zablokovaný':'')+'<br><small>'+(u.last_login_at?'Naposledy '+esc(new Date(u.last_login_at+'Z').toLocaleString('cs-CZ')):'Zatím se nepřihlásil')+'</small></span>'+(u.role==='admin'?'':'<span class="select-row"><button class="btn" type="button" data-user-email="'+u.id+'" data-email="'+esc(u.email)+'">Změnit e-mail</button><button class="btn" type="button" data-user="'+u.id+'" data-disabled="'+(u.disabled?0:1)+'">'+(u.disabled?'Obnovit přístup':'Zablokovat')+'</button></span>')+'</div>').join('');const invites=d.invites.map(i=>'<div class="metric-line"><span>'+esc(i.email)+uiText(' · pozvánka čeká</span><button class="btn" type="button" data-invite="', ' · invitation pending</span><button class="btn" type="button" data-invite="')+esc(i.email)+'">Zrušit</button></div>').join('');$('adminUsers').innerHTML=users+(invites||'');document.querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{try{const r=await jsonFetch('/app/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(b.dataset.user),disabled:b.dataset.disabled==='1'})});toast(r.message);loadAdmin();}catch(error){toast(error.message);}});document.querySelectorAll('[data-user-email]').forEach(b=>b.onclick=async()=>{const email=prompt(say('Nový e-mail pro účet')+' '+b.dataset.email,'');if(!email)return;try{const r=await jsonFetch('/app/api/admin/users/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(b.dataset.userEmail),email:email.trim()})});toast(r.message);loadAdmin();}catch(error){toast(error.message);}});document.querySelectorAll('[data-invite]').forEach(b=>b.onclick=async()=>{try{const r=await jsonFetch('/app/api/admin/invites',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:b.dataset.invite})});toast(r.message);loadAdmin();}catch(error){toast(error.message);}});}catch(e){$('adminUsers').textContent=e.message;}}
installDataCorrections();installSimpleFoodEditor();installCompactFoodEditor();{// A device that opened the dashboard before asks for the data together with the
// account check instead of after it; the first visit waits for the check (setup).
let ready=false;try{ready=localStorage.getItem('lw-dashboard-ready')==='1';}catch{}
// After the rest of this file has run: later parts extend load().
// Wait for identity before restoring any account's cached dashboard.
loadAccount().then(async me=>{if(me.consent?.needed&&me.onboarding?.completed){forgetDashboard();await showConsentGate(me);me=await loadAccount();}loadConnections();openRequestedConsent();const open=me.onboarding?.completed===true;try{if(open)localStorage.setItem('lw-dashboard-ready','1');else forgetDashboard();}catch{}if(open){if(ready)showDashboardSnapshot();load();pollAccountImport();}}).catch(()=>{});}

// ---- Workouts hub: info tips, week overview with weather, weekly planner ----
// A small (i) button; the text lives in INFO_TEXTS so screens stay short.
function infoTip(key,label){return '<button type="button" class="info-tip" data-info="'+key+'" aria-label="Vysvětlivka: '+esc(label)+'" aria-expanded="false">i</button>';}
// Paragraphs are plain text; an {href,text} item becomes a link.
function infoParagraphs(items){return items.map(p=>typeof p==='string'?'<p>'+esc(p)+'</p>':'<p><a href="'+esc(p.href)+'" target="_blank" rel="noopener noreferrer">'+esc(p.text)+'</a></p>').join('');}
const INFO_TEXTS={
  difficulty:['Obtížnost 1–10','Interní stupnice náročnosti workoutu v daném typu tréninku: délka a intenzita pracovních úseků, poměr práce a pauz a práce v únavě. Není to RPE ani procento tvého maximálního výkonu.','„Max. obtížnost“ je horní limit výběru. Pro nejtěžší workouty zvol řazení „Nejtěžší první“. Doporučený výběr zohledňuje také tvou odhadovanou úroveň a připravenost.'],
  phase:['Fáze přípravy','Auto: trenér fázi odvodí z plánu a zátěže týdne.','Základ (Base): hodně vytrvalosti a tempa, buduje se motor.','Rozvoj (Build): víc prahových a VO₂max intervalů, blok před cílem.','Regenerace: týden bez intenzity, tělo vstřebá trénink.','Ladění (Taper): méně objemu a krátká intenzita před závodem, abys byl svěží.'],
  capability:['Odhad úrovně podle typu','Odhad obtížnosti workoutů, které zvládáš v daném typu tréninku. 4/10 znamená odhad pro workouty kolem obtížnosti 4; není to VO₂max, FTP ani srovnání s ostatními sportovci.','Bez hodnocení jde o výchozí odhad podle zkušeností v profilu: začátečník 1, běžně 3, zkušený 4. RPE a dokončení odjetých workoutů zpřesňují každý typ zvlášť. Samotné spárování aktivity úroveň nezvyšuje.'],
  workoutSystems:['VO₂max, anaerobní a sprint','VO₂max: cílem je vysoký příjem kyslíku. Typicky úseky 2–5 minut nebo husté série 30/30 či 40/20; krátké pauzy drží kyslíkovou spotřebu vysoko.','Anaerobní: cílem je kapacita pro tvrdé nástupy, typicky 30–120 sekund s delší regenerací. Úseky mohou mít předepsaný výkon, 30s Wingate je naopak maximální úsilí.','Sprint: krátké maximální úseky přibližně 8–15 sekund s plnou regenerací, zaměřené na špičkový výkon a nervosvalovou koordinaci. Delší sprint má větší anaerobní podíl.','Systémy se překrývají. Typ tréninku určuje cíl celé struktury a pauzy, ne jen výkonová zóna jednoho úseku. Maximální sprint nepředepisujeme jako pevné procento FTP.'],
  suitability:['Vhodnost','Jak dobře workout sedí na vybraný den: typ, doporučená délka a load, obtížnost proti odhadované úrovni, připravenost a kvalitní dny v týdnu.','Procento je skóre shody, ne pravděpodobnost úspěchu. Doporučený výběr střídá podobně vhodné struktury a délky, proto nemusí být procenta sestupně. Řazení podle obtížnosti nebo délky zvolíš ve filtrech.'],
  duration:['Čas na trénink','Nech prázdné a trenér určí nejvhodnější délku sám – podle plánu v Intervals.icu, kondice (CTL), formy (TSB), spánku a plánu týdne. Může to být 50 minut i 4 hodiny.','Vyplň jen tehdy, když máš opravdu časový limit.'],
  libraryDuration:['Délka','Prázdné = délku doporučí trenér. Vyplněná délka s tolerancí vymezí povolené rozmezí: 90 ± 30 minut znamená 60–120 minut. Doporučený výběr nabízí různé délky v tomto rozmezí; pro přesnou délku zvol „Nejbližší délka“.'],
  load:['Load (TSS) a IF','Load je tréninková zátěž v TSS – stejné číslo, ze kterého Intervals.icu počítá kondici (CTL) a únavu (ATL). Spojuje délku a intenzitu: hodina přesně na FTP = 100 TSS.','IF (intensity factor) říká, jak tvrdě se jede vůči prahu: 0,55–0,65 regenerace, 0,65–0,75 vytrvalost, 0,75–0,85 tempo / sweet spot, 0,85–1,0 práh, nad 1,0 VO₂max a víc. Platí TSS = hodiny × IF² × 100, takže 2 h na IF 0,7 ≈ 98 TSS.','Ve filtru vyplň load jen tehdy, když chceš konkrétní zátěž – jinak ho neřeš.'],
  rpe:['RPE 1–10','Jak těžký trénink subjektivně byl: 1–2 velmi lehce, 3–4 lehce, 5–6 středně, 7–8 těžce, 9 velmi těžce, 10 maximum.','Uložím ho k aktivitě i do Intervals.icu. Pro trenéra je to nejdůležitější signál, jestli byl trénink přiměřený.'],
  feedback:['Naplánované tréninky','Jak velkou část tréninku jsi odjel, spočítám sám z aktivity spárované v Intervals.icu (zátěž nebo čas proti plánu).','Ty doplníš jen RPE a případně pocit. RPE se zapíše i k aktivitě v Intervals.icu.'],
  planner:['Plán týdne','Přetáhni Kolo, Běh nebo Gym přímo do kalendáře na dny, kdy chceš trénovat – klidně víc aktivit v jeden den (třeba kolo i gym). Kartičky ve dnech přesouváš tažením, ✕ je odebere. Na mobilu ťukni na sport (nebo kartičku) a pak na den. Ukládá se to samo a platí pro zobrazený týden.','Když se plán 5 vteřin nemění, objeví se u každé kartičky návrh dne, třeba „2h 0m · ~98 TSS · IF 0,70 · Vytrvalost“. Klikni na něj a uvidíš nejvhodnější tréninky z knihovny přesně na ten den.','Trenér rozloží týden: jeden dlouhý trénink o víkendu, až dva kvalitní dny s odstupem, po nich lehčí den, a gym před intervaly se sníženou dávkou pro nohy. Únava a připravenost mají vždy přednost.'],
  generateWeek:['Vygenerovat tréninky','Na pozadí připraví konkrétní tréninky pro dny z plánu týdne podle časových možností, únavy, spánku, poslední zátěže a počasí: kolo a běh z knihovny, gym jako sestavu cviků.','Kolo a běh se do Intervals.icu zapíšou samy do 15 s (v kartičce je můžeš zastavit). Gym se uloží rovnou do plánu, stejně jako když Gym přetáhneš na den: klikni na něj a uvidíš panáčka a cviky, upravíš je ručně nebo s AI a spustíš režim tréninku.','Změny už naplánovaných tréninků probereš s AI.'],
  recommend:['Doporučené tréninky','Knihovna workoutů seřazená podle toho, jak sedí na vybraný den: typ, délka, obtížnost proti tvé úrovni, únava a pestrost.','Nahoře přepínáš zaměření (vytrvalost, práh…), filtry rozbalíš tlačítkem Filtry. Když na dnešek nemáš nic v plánu, nahoře je i denní doporučení pro jakýkoli sport.'],
  trend:['Osobní trend','Přerušovaná čára je tvůj průměr z předchozích 30 dní, pásmo kolem ní běžné rozmezí (±1 směrodatná odchylka).','Klikni nebo ťukni na bod a uvidíš jeho hodnotu.'],
  allDayLoad:['Celodenní zátěž','Stupnice 0–21: čas ve čtyřech tepových zónách Google Health za celý den, vážený jako TRIMP podle Edwardse (lehká ×2, střední ×3, intenzivní ×4, špičková ×5). Zóny počítá Google z tvé tepové rezervy, takže stejný trénink je pro trénovanějšího lehčí.','Body přibývají stále pomaleji: hodina ve střední zóně ≈ 12, dlouhá smíšená jízda ≈ 19–20. Zahrnuje běžný pohyb i trénink.','Bez tepových zón odhad z aktivní energie proti tvému mediánu za 30 dní. Je méně přesný: hodinky se u kalorií mýlí o 20 % i víc.',{href:'https://pubmed.ncbi.nlm.nih.gov/11708692/',text:'Foster 2001: TRIMP a vnímaná námaha ↗'},{href:'https://pubmed.ncbi.nlm.nih.gov/28538708/',text:'Shcherbina 2017: přesnost kalorií z hodinek ↗'}],
  muscleLoad:['Svalová zátěž','Zátěž za posledních 7 dní proti průměrnému týdnu za 6 týdnů. Zelený oblouk je produktivní pásmo.','Počítá se ze sérií v posilovně (váha a opakování, únavnost cviku, RPE) a z kola a běhu (TSS na zapojené svaly).'],
  cardioPoints:['Kardio body','Čas v zóně se násobí její intenzitou, takže krátké tvrdé intervaly váží víc než dlouhá lehká jízda.','Pruhy ukazují, jaký podíl bodů připadá na lehkou aerobní, tvrdou aerobní a anaerobní zónu.'],
  records:['Osobní rekordy','Rekord je nejlepší výkon v období, šipka ukazuje změnu proti nejlepšímu před ním (FTP: platné na konci proti začátku období).','Když starší data chybí, porovnávám s prvním záznamem v období. U tempa je šipka dolů zlepšení.'],
  strengthTrend:['Silový progres','Nejvyšší použitá váha z dokončených pracovních sérií každého dne.','Vyšší váha sama o sobě neznamená progres, pokud se změnil počet opakování nebo technika.'],
  sleepScore:['Spánkový index','Index 0–100: délka spánku proti tvé potřebě (50 bodů, nula při polovině potřeby), kvalita podle NSF (35: efektivita od 85 %, usnutí do 30 min a bdění během noci do 20 min) a podíl hlubokého spánku a REM proti běžným hodnotám dospělých (15).','Potřeba spánku je 8 h (od 65 let 7,5 h); po náročném dni až o 30 min víc, při nízkém HRV o 15 min, se spánkovým dluhem až o 30 min. Zdřímnutí ji sníží. Vždy v rozmezí 7–9 h. Fáze spánku mají nejmenší váhu: hodinky je určují mnohem méně přesně než délku spánku.',{href:'https://pubmed.ncbi.nlm.nih.gov/29073412/',text:'NSF: doporučená délka spánku ↗'},{href:'https://doi.org/10.1016/j.sleh.2016.11.006',text:'NSF: ukazatele kvality spánku ↗'}],
  recoveryScore:['Index regenerace','Index 0–100: HRV (50 %), klidový tep (25 %) a spánek proti potřebě (25 %). Každý ukazatel porovnávám s tvým průměrem a rozptylem za 60 dní; HRV v logaritmu (lnRMSSD), jak to dělají studie.','Tvůj běžný den je kolem 70. Hodnota o směrodatnou odchylku horší dává 50, o dvě 30. 67 a víc je zelená, 34–66 žlutá, pod 34 červená. Dech ve spánku výrazně nad průměrem ubere 10 bodů, teplota kůže o 0,5 °C a víc nad průměrem dalších 10.','Šipka trendu porovnává 7denní průměr HRV s nejmenší významnou změnou (0,5 SD). Potřebuje aspoň 14 předchozích měření. Stejné číslo používá i trenér.',{href:'https://pubmed.ncbi.nlm.nih.gov/22367011/',text:'Plews 2012: 7denní průměr HRV ↗'},{href:'https://pubmed.ncbi.nlm.nih.gov/24578692/',text:'Buchheit 2014: HRV a klidový tep ↗'}],
  rhythm:['Spánkový rytmus','Rozptyl (SD) ukazuje, o kolik se čas usnutí typicky liší od tvého průměru. Menší rozptyl znamená pravidelnější režim, ne automaticky kvalitnější spánek.','Usnutí po půlnoci patří ke stejnému večeru. Chybějící noci se nepočítají jako nuly.'],
  water:['Pití','Počítáme vypitý objem včetně kávy, čaje a mléka. Nápoje z jídelníčku v ml se přičtou automaticky.',{href:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3886980/',text:'Proč se počítá i káva ↗'}],
  energy:['Energie dne','Cíl dne vychází z profilu: klidový výdej × tvoje běžná denní aktivita, minus deficit, plus trénink. Když se hýbeš víc než obvykle, přepne se na průběžný cíl z naměřeného výdeje: bazální metabolismus + aktivní energie + trávení (10 %), minus deficit.','Celodenní aktivní výdej zahrnuje běžný pohyb i sport. Stejné aktivity ani kroky nepřičítám podruhé.','Podíl maker vychází z 4 kcal/g bílkovin a sacharidů a 9 kcal/g tuku. Energie z obalu se může lišit.'],
  sportFocus:['Hlavní sport a cíl','Podle toho AI, Revize dne a poznámky k tréninku volí roli i směr.','Bez vyplnění zůstává obecný trenér vytrvalosti a síly.'],
  profile:['Profil pro vlastní výpočty','Z pohlaví, věku, výšky, váhy a denní aktivity počítáme klidový výdej, z cíle denní kalorický cíl. Trénink přidávají propojené zdroje.','Prázdná pole s „Automaticky“ doplňujeme z Google Health a Intervals.icu a denně aktualizujeme. Vlastní hodnota je přepíše, smazáním se vrátíš k automatické.','Váhu zapisuješ v přehledu váhy.']
};
function installInfoTips(){
  if($('infoPop'))return;
  document.body.insertAdjacentHTML('beforeend','<div id="infoPop" role="dialog" aria-live="polite" hidden></div>');
  const pop=$('infoPop');let current=null;
  const close=()=>{pop.hidden=true;if(current)current.setAttribute('aria-expanded','false');current=null;};
  document.addEventListener('click',e=>{
    const tip=e.target.closest('.info-tip');
    if(!tip){if(!e.target.closest('#infoPop'))close();return;}
    e.preventDefault();e.stopPropagation();
    if(current===tip){close();return;}
    const [title,...paragraphs]=INFO_TEXTS[tip.dataset.info]||['Nápověda','Bez popisu.'];
    pop.innerHTML='<strong>'+esc(title)+'</strong>'+infoParagraphs(paragraphs);
    const host=tip.closest('dialog[open]')||document.body;if(pop.parentNode!==host)host.appendChild(pop);
    pop.hidden=false;if(current)current.setAttribute('aria-expanded','false');current=tip;tip.setAttribute('aria-expanded','true');
    const r=tip.getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight;
    pop.style.left=Math.max(12,Math.min(window.innerWidth-w-12,r.left-w/2))+'px';
    pop.style.top=(r.bottom+8+h>window.innerHeight?Math.max(12,r.top-h-8):r.bottom+8)+'px';
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  window.addEventListener('scroll',close,{passive:true});
  document.addEventListener('scroll',e=>{if(e.target!==document&&!pop.contains(e.target))close();},{passive:true,capture:true});
}

const HUB_SPORTS={ride:'🚴 Kolo',run:'🏃 Běh',gym:'🏋️ Posilovna'};
// Intervals.icu / Google Health activity types in the app's language; unknown types stay as they are.
const ACTIVITY_TYPE_LABELS={Ride:'Kolo',VirtualRide:'Kolo',GravelRide:'Kolo',MountainBikeRide:'Kolo',EBikeRide:'Kolo',Run:'Běh',VirtualRun:'Běh',TrailRun:'Běh',Walk:'Chůze',Hike:'Turistika',Swim:'Plavání',WeightTraining:'Posilovna',Yoga:'Jóga',Rowing:'Veslování',NordicSki:'Běžky',AlpineSki:'Lyžování',Workout:'Trénink'};
function activityTypeLabel(type){return ACTIVITY_TYPE_LABELS[type]||type||'Aktivita';}
function activitySport(a){const t=(String(a?.type||'')+' '+String(a?.name||'')+' '+String(a?.payload?.type||'')).toLowerCase();if(/weight|strength|gym|posil/.test(t))return 'gym';if(/ride|cycl|bike|kolo/.test(t))return 'ride';if(/\brun|běh|virtualrun/.test(t))return 'run';return null;}
const WEATHER_ICONS=[[0,'☀️','jasno'],[2,'🌤️','polojasno'],[3,'☁️','zataženo'],[48,'🌫️','mlha'],[57,'🌦️','mrholení'],[67,'🌧️','déšť'],[77,'🌨️','sníh'],[82,'🌧️','přeháňky'],[86,'🌨️','sněhové přeháňky'],[99,'⛈️','bouřky']];
function weatherIcon(code){const c=num(code,-1);return (WEATHER_ICONS.find(([max])=>c<=max)||[0,'·',''])}
async function loadWeather(){
  const loc=state.weekPlan?.prefs?.location;if(!loc){state.weather={};state.weatherKey=null;return;}
  const key=loc.latitude+','+loc.longitude+','+state.hubWeek;if(state.weatherKey===key)return;if(state.weatherFailed?.key===key&&Date.now()-state.weatherFailed.at<6e5)return;
  try{
    const url='https://api.open-meteo.com/v1/forecast?latitude='+loc.latitude+'&longitude='+loc.longitude+'&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone='+encodeURIComponent(USER_TZ)+'&past_days=14&forecast_days=16';
    const r=await fetch(url),d=await r.json();if(!r.ok)throw new Error(d.reason||'HTTP '+r.status);
    state.weather=Object.fromEntries((d.daily?.time||[]).map((t,i)=>[t,{code:d.daily.weather_code[i],max:d.daily.temperature_2m_max[i],min:d.daily.temperature_2m_min[i],rainProb:d.daily.precipitation_probability_max?.[i],rain:d.daily.precipitation_sum?.[i],wind:d.daily.wind_speed_10m_max?.[i]}]));state.weatherKey=key;
  }catch(error){state.weather={};state.weatherError=error.message;state.weatherFailed={key,at:Date.now()};}
}
// Weather only for a place the user chose: a searched place, or the device
// location once the browser has their permission. A device location follows
// them (refreshed once per app start while the permission stays granted) and
// is rounded to about 1 km before it is saved or sent to Open-Meteo.
function showWeatherPlace(){const loc=state.weekPlan?.prefs?.location;$('hubLocationName').textContent=loc?.name||uiText('Počasí','Weather');$('hubLocationOff').hidden=!loc;}
function devicePosition(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error(uiText('Prohlížeč polohu neumí.','This browser cannot share its location.')));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:Math.round(p.coords.latitude*100)/100,longitude:Math.round(p.coords.longitude*100)/100}),()=>reject(new Error(uiText('Polohu se nepodařilo zjistit. Povol ji v prohlížeči, nebo místo vyhledej.','Could not get your location. Allow it in the browser, or search for a place.'))),{maximumAge:36e5,timeout:15000});});}
async function setWeatherPlace(loc){state.weekPlan.prefs.location=loc;state.weatherKey=null;showWeatherPlace();$('hubLocationForm').hidden=true;$('hubLocationResults').innerHTML='';await saveWeekPlanner();}
async function refreshDeviceLocation(){
  const loc=state.weekPlan?.prefs?.location;if(state.deviceLocationChecked||loc?.source!=='device')return;state.deviceLocationChecked=true;
  try{const perm=await navigator.permissions?.query({name:'geolocation'});if(perm?.state!=='granted')return;const pos=await devicePosition();
    if(Math.abs(pos.latitude-loc.latitude)<0.05&&Math.abs(pos.longitude-loc.longitude)<0.05)return;
    await setWeatherPlace({name:uiText('Moje poloha','My location'),...pos,source:'device'});await renderWeekHub();}catch{}
}
async function loadWeekPlan(force=false){const start=state.hubWeek||localMonday();if(state.weekPlan&&!force&&state.weekPlan.start===start)return state.weekPlan;try{state.weekPlan=await jsonFetch('/app/api/week-plan?start='+start);}catch{if(state.weekPlan)return state.weekPlan;state.weekPlan={start,prefs:{days:[[],[],[],[],[],[],[]],location:null},roles:Array.from({length:7},(_,i)=>({weekday:i,items:[]}))};}return state.weekPlan;}
// One request per week at a time: the dashboard and the workouts hub ask for
// the same week when the app opens, and the week is the slowest read.
function fetchWeek(start){
  if(!weekRequests.has(start)){const request=jsonFetch('/app/api/week?start='+start).finally(()=>setTimeout(()=>weekRequests.delete(start),1500));weekRequests.set(start,request);}
  return weekRequests.get(start);
}
async function hubWeekData(){
  if(state.hubWeek===weekStart&&state.week?.days)return state.week;
  if(state.hubWeekData?.start===state.hubWeek)return state.hubWeekData;
  state.hubWeekData=await fetchWeek(state.hubWeek);return state.hubWeekData;
}
// Targets for the chips come from the server, the same numbers the generator uses.
function chipTarget(date,sport,slot=0){return (state.weekPlan?.targets?.items||[]).find(x=>x.date===date&&x.sport===sport&&(x.slot||0)===slot)||null}
// Proposals of the first session keep the old key; a second ride that day is date|ride|1.
function proposalKey(date,sport,slot=0){return date+'|'+sport+(Number(slot)?'|'+Number(slot):'')}
// Chips of one weekday: every planned session (the same sport may repeat) and
// any proposal without a chip, each with its slot among the same sport.
function planChips(i,date){
  const seen={},chips=(state.weekPlan?.prefs?.days?.[i]||[]).map((sport,index)=>({sport,slot:(seen[sport]=(seen[sport]??-1)+1),index}));
  for(const key of Object.keys(state.proposals||{})){const [d,sport,slot]=key.split('|');if(d!==date||!HUB_SPORTS[sport])continue;const n=Number(slot)||0;if(!chips.some(c=>c.sport===sport&&c.slot===n))chips.push({sport,slot:n,index:null});}
  return chips;
}
function weekTargetText(){
  const t=state.weekPlan?.targets;if(!t||t.status!=='ok')return '';
  return (t.recovery?uiText('Regenerační týden ', 'Recovery week ')+(t.recoveryReason==='three_weeks'?uiText('po třech týdnech nad udržovací zátěží', 'after three weeks above maintenance load'):t.recoveryReason==='hrv_trend'?uiText('· HRV za poslední týden pod tvým běžným pásmem','· HRV over the last week below your usual range'):uiText('po náročném týdnu (', 'after a hard week (')+t.lastWeekLoad+' TSS)')+uiText(' · platí i pro posilovnu · cíl ≈ ', ' · applies to the gym too · goal ≈ ')+t.target+uiText(' TSS (70 % z udržovacích ', ' TSS (70 % of maintenance ')+t.base+')':uiText('Cíl týdne ≈ ', 'Weekly goal ≈ ')+t.target+' TSS ('+(t.rampHold?uiText('CTL roste o víc než 8 za týden, proto jen udržení CTL ','CTL is rising by more than 8 a week, so only maintaining CTL ')+t.ctl+' × 7':uiText('udržení kondice CTL ','maintaining fitness CTL ')+t.ctl+' × 7 + 5 %')+')')+uiText(' · hotovo a v plánu ', ' · done and planned ')+t.committed+' TSS'+(t.shortfall?uiText(' · do cíle chybí ~', ' · ~')+t.shortfall+uiText(' TSS, přidej další den', ' TSS short of the goal, add another day'):'')+(t.runCap?.limited?uiText(' · běh tento týden nejvýš ', ' · running this week at most ')+hm(t.runCap.cap)+uiText(' (+10 % proti posledním týdnům, ', ' (+10 % over recent weeks, ')+hm(t.runCap.base)+uiText('); návrhy běhu jsou kratší', '); run proposals are shorter'):'');
}
// IF from load and length (TSS = h × IF² × 100); gym load has no IF.
function intensityOf(tss,minutes){const t=num(tss),h=num(minutes)/60;return t>0&&h>0?Math.sqrt(t/(h*100)):null}
function ifText(tss,minutes,sport){const v=sport==='gym'?null:intensityOf(tss,minutes);return v&&v<1.6?' · IF '+dec(v,2):''}
// The day's proposal on a plan chip: length, load, IF and focus for rides and
// runs; the gym role for gym. A click opens the matching workouts.
// The athlete's own length or place for one chip (prefs.sessions), shown at
// once while the server recalculates the week.
const SESSION_MINUTES={gym:[30,45,60,75,90],ride:[30,45,60,75,90,120,150,180,240,300],run:[20,30,45,60,75,90,120]};
function chipSession(key){return state.weekPlan?.prefs?.sessions?.[key]||{}}
function chipEnvironment(key,target){return chipSession(key).environment||target?.environment||'outdoor'}
function withSession(key,target,sport){
  if(!target)return null;const own=chipSession(key),out={...target};
  if(own.minutes&&own.minutes!==target.minutes){const f=target.intensity||intensityOf(target.tss,target.minutes);out.minutes=own.minutes;out.tss=sport==='gym'?Math.round(target.tss*own.minutes/target.minutes):f?Math.round(own.minutes/60*f*f*100):target.tss;}
  return out;
}
// The day's proposal on a plan chip: length (a menu), load, IF and focus for
// rides and runs; the gym role for gym. A click on the text opens the matching workouts.
function chipSuggestion(date,sport,role,target,key){
  const focus=String(role.label||'').replace(/^(Gym|Posilovna) · /,''),t=withSession(key,target,sport),own=chipSession(key);
  const time=t?'<button type="button" class="chip-time'+(own.minutes?' chosen':'')+'" data-chip-time data-key="'+esc(key)+'" data-sport="'+sport+'" aria-haspopup="menu" title="Změnit délku tréninku">⏱ '+esc(hm(t.minutes))+' ▾</button>':'';
  if(sport==='gym')return '<span class="chip-line">'+time+'<button type="button" class="chip-suggest" data-chip-suggest data-date="'+esc(date)+'" data-sport="gym"'+(t?' data-minutes="'+num(t.minutes)+'"':'')+' title="Otevřít gym na tento den">'+esc(focus)+' ›</button></span>';
  const f=t?t.intensity||intensityOf(t.tss,t.minutes):null,parts=t?['~'+t.tss+' TSS',f?'IF '+dec(f,2):'',focus]:[focus];
  return '<span class="chip-line">'+time+'<button type="button" class="chip-suggest" data-chip-suggest data-date="'+esc(date)+'" data-sport="'+sport+'" data-role="'+esc(role.role||'')+'" data-label="'+esc(focus)+'" data-env="'+esc(chipEnvironment(key,target))+'"'+(t?' data-minutes="'+num(t.minutes)+'" data-tss="'+num(t.tss)+'"':'')+' title="Ukázat nejvhodnější tréninky na tento den">'+esc(parts.filter(Boolean).join(' · '))+' ›</button></span>';
}
// Outdoor or indoor next to the sport name: from the forecast, or the athlete's choice.
function chipEnvBadge(key,sport,target,date){
  if(sport==='gym'||date<localToday())return '';
  const env=chipEnvironment(key,target),own=chipSession(key).environment,reason=own?'Zvoleno ručně · klikni pro změnu':(target?.reason||'Podle předpovědi a sezóny')+' · klikni pro změnu';
  return '<button type="button" class="chip-env '+env+(own?' chosen':'')+'" data-chip-env data-key="'+esc(key)+'" data-env="'+env+'" data-auto="'+esc(target?.autoEnvironment||target?.environment||'outdoor')+'" title="'+esc(reason)+'">'+(env==='indoor'?(sport==='run'?uiText('🏃 Pás','🏃 Treadmill'):uiText('🏠 Uvnitř','🏠 Indoor')):uiText('🌤 Venku','🌤 Outdoors'))+'</button>';
}
// Proposals wait until the plan has been still for 5 s, so moving chips
// around does not flood the days with suggestions.
const PLANNER_QUIET_MS=5000;
let plannerQuietTimer=null;
function plannerQuiet(){return Boolean(state.weekPlan?.dirty)||Date.now()<(state.plannerQuietUntil||0)}
async function renderWeekHub(){
  const el=$('hubWeek');if(!el)return;
  if(!state.hubWeek)state.hubWeek=localMonday();
  $('hubWeekTitle').textContent=uiText('Týden ','Week ')+isoWeek(state.hubWeek)+' · '+dateLabel(state.hubWeek)+' – '+dateLabel(dateShift(state.hubWeek,6));
  const plan=await loadWeekPlan();showWeatherPlace();refreshDeviceLocation();
  let week;try{[week]=await Promise.all([hubWeekData(),loadWeather()]);}catch(error){el.innerHTML='<div class="notice status-error">'+esc(error.message)+'</div>';return;}
  applyPendingPlanned(week.days);
  const days=week.days||[],gym=weekGymSessions(days),today=localToday();
  const roles=plan.roles||[];
  let doneTss=0,plannedTss=0;
  // Every training in the week opens its detail; the registry maps the click back.
  const details=state.hubDetails=[],detail=entry=>{details.push(entry);return ' data-detail="'+(details.length-1)+'" role="button" tabindex="0"';},autoGym=[];
  el.innerHTML=days.map((d,i)=>{
    const t=d.daily?.training||{},items=[],covered={},cover=sport=>{covered[sport]=(covered[sport]||0)+1;};
    const completed=(t.completed||[]).filter(a=>!isNutritionItem(a)),sports=new Set();
    for(const a of completed){const sport=activitySport(a);if(!sport)continue;sports.add(sport);cover(sport);doneTss+=num(a.tss);items.push('<div class="hub-item done"'+detail({kind:'done',date:d.date,sport,item:a,plan:(t.matched||[]).find(m=>String(m.actualId)===String(a.id))?.planned||null})+'>✓ '+esc(HUB_SPORTS[sport])+' · '+esc(a.name||'')+activityEnvironmentBadge(a,sport)+'<span class="meta">'+hm(num(a.durationHours)*60)+(measured(a.tss)?' · TSS '+fmt(a.tss)+ifText(a.tss,num(a.durationHours)*60,sport):'')+'</span></div>');}
    if(gym.some(g=>g.date===d.date)&&!sports.has('gym')){sports.add('gym');cover('gym');const g=gym.find(x=>x.date===d.date);items.push('<div class="hub-item done"'+detail({kind:'gym',date:d.date,done:true,sets:gym.find(x=>x.date===d.date).sets})+'>✓ '+HUB_SPORTS.gym+'<span class="meta">'+new Set(g.sets.map(r=>r.exercise)).size+' cviků · '+g.sets.length+' sérií</span></div>');}
    const paired=new Set((t.matched||[]).map(m=>String(m.planned?.id||'')));
    for(const p of (t.planned||[]).filter(x=>!isNutritionItem(x)&&!paired.has(String(x.id||'')))){const sport=activitySport(p);if(!sport)continue;sports.add(sport);cover(sport);plannedTss+=num(p.tss);const editable=/^planned:/.test(String(p.id||''))&&!p.pending;items.push('<div class="hub-item planned'+(editable?' editable':'')+'"'+detail({kind:'planned',date:d.date,sport,item:p,editable})+(editable?' draggable="true" data-event-id="'+esc(p.id)+'" data-sport="'+sport+'" data-name="'+esc(p.name||'Plán')+'" title="Klikni pro detail a úpravy, nebo přetáhni na jiný den"':'')+'>'+esc(HUB_SPORTS[sport])+' · '+esc(p.name||'Plán')+activityEnvironmentBadge(p,sport)+'<span class="meta">'+(p.pending?uiText('Ukládám do Intervals…','Saving to Intervals…'):uiText('Plán','Plan'))+(p.durationHours?' · '+hm(num(p.durationHours)*60):'')+(measured(p.tss)?' · TSS '+fmt(p.tss)+ifText(p.tss,num(p.durationHours)*60,sport):'')+'</span></div>');}
    // A saved gym plan without its Intervals.icu event is a planned session too.
    const openGym=d.date===gymDay()&&!state.gym?.cancelled&&(state.gym?.values||[]).slice(7).filter(r=>r?.[1]),gymPlan=openGym?.length?{name:state.gym.values[2]?.[3]||'',exercises:new Set(openGym.map(r=>r[1])).size,sets:openGym.filter(gymRowWork).length}:d.gymPlan;
    if(gymPlan&&!sports.has('gym')&&!d.gymCancelled&&d.date>=today){sports.add('gym');cover('gym');items.push('<div class="hub-item planned editable"'+detail({kind:'gym',date:d.date,done:false})+' draggable="true" data-gym-date="'+d.date+'" data-sport="gym" data-name="Gym" title="Klikni pro cviky, nebo přetáhni na jiný den">'+HUB_SPORTS.gym+' · '+esc(gymPlan.name||(d.date===today?'plán na dnes':'plán'))+'<span class="meta">'+czPlural(gymPlan.exercises,'cvik','cviky','cviků')+' · '+czPlural(gymPlan.sets,'série','série','sérií')+'</span></div>');}
    // Stretching belongs to the week plan too: its sessions show on their day.
    for(const r of (state.recovery||[]).filter(r=>r.date===d.date))items.push('<div class="hub-item planned'+(r.done?' done':'')+'"'+detail({kind:'recovery',id:r.id})+'>🧘 '+esc(r.title)+'<span class="meta">'+r.minutes+' min · '+czPlural(r.items.length,'cvik','cviky','cviků')+(r.done?uiText(' · hotovo',' · done'):'')+'</span></div>');
    // Planner suggestions for the days still ahead.
    // The weekly plan for this weekday: chips that move between days or come off with ✕.
    // A chip whose training is already planned or done gives way to the training itself.
    const plan=planChips(i,d.date).filter(c=>c.slot>=(covered[c.sport]||0)).map(({sport,slot,index})=>{const quiet=plannerQuiet(),x=quiet?null:(roles[i]?.items||[]).filter(r=>r.sport===sport)[slot],tg=quiet?null:chipTarget(d.date,sport,slot),key=proposalKey(d.date,sport,slot),pr=state.proposals?.[key],cancelled=sport==='gym'&&gymCancelledOn(d.date),attrs=' data-date="'+d.date+'" data-sport="'+sport+'" data-slot="'+slot+'"';
      if(sport==='gym'&&!quiet&&!pr&&!cancelled&&d.date>=today)autoGym.push({date:d.date,sport,slot,key,role:x?.role,minutes:withSession(i+'|gym|'+slot,tg,'gym')?.minutes||tg?.minutes||null});
      const deploy=pr?.existing?'<span class="small">Alternativa k revizi</span>':pr?.scheduled?'<span class="small deploy-live">✓ v Intervals.icu</span>':pr?.deploying?'<span class="small">Zapisuji do Intervals.icu…</span>':proposalWaiting(pr)?'<span class="small deploy-wait">→ Intervals.icu do 15 s</span><button type="button" class="btn" data-proposal="keep"'+attrs+'>Nezapisovat</button>':'<button type="button" class="btn primary" data-proposal="add"'+attrs+'>Do Intervals</button>';
      const proposal=pr?.status==='busy'?'<small class="proposal">Navrhuji…</small>':pr?.workout?'<small class="proposal">'+esc(pr.workout.name)+'</small><span class="chip-actions"><button type="button" class="btn" data-proposal="open"'+attrs+'>Detail</button>'+deploy+'</span>':pr?.gym?'<button type="button" class="proposal proposal-open" data-proposal="gym"'+attrs+'>'+(pr.scheduled?'✓ Potvrzeno · ':pr.existing?'Rozpis · ':'Návrh · ')+pr.gym+uiText(' cviků ›</button>', ' exercises ›</button>')+(gymProposalOpen(pr)?'<span class="chip-actions"><button type="button" class="btn primary" data-proposal="gym"'+attrs+'>Náhled</button></span>':''):pr?.error?'<small class="proposal">'+esc(friendlyProposalError(pr.error))+'</small>'+(pr.item?'<span class="chip-actions"><button type="button" class="btn" data-proposal="retry"'+attrs+'>Zkusit znovu</button></span>':''):'';
      const picked=state.plannerPick===sport&&state.plannerFrom===i&&(state.plannerFromIndex===-1?index==null:state.plannerFromIndex==null||state.plannerFromIndex===index);
      return '<span class="planner-chip'+(picked?' picked':'')+(cancelled?' cancelled':'')+'" draggable="true" data-chip-sport="'+sport+'" data-chip-day="'+i+'"'+' data-chip-index="'+(index??-1)+'"'+' data-chip-slot="'+slot+'" title="Přetáhni na jiný den, nebo ťukni a pak ťukni na den">'+HUB_SPORTS[sport]+(slot?' <b class="chip-slot">'+(slot+1)+'.</b>':'')+(index!=null?chipEnvBadge(i+'|'+sport+'|'+slot,sport,tg||chipTarget(d.date,sport,slot),d.date):'')+'<button type="button" data-chip-remove aria-label="Odebrat '+esc(HUB_SPORTS[sport])+' z plánu">✕</button>'+(cancelled?'<small>Gym na tento den je zrušený</small>':!pr&&x&&d.date>=today?chipSuggestion(d.date,sport,x,tg,i+'|'+sport+'|'+slot):'')+proposal+'</span>'}).join('');
    const w=state.weather?.[d.date],[,icon,word]=w?weatherIcon(w.code):[0,'',''];
    const av=state.weekPlan?.prefs?.availability?.[i],avText=av?.minutes===0?'Nemám čas':av?.minutes!=null?hm(av.minutes)+(av.window?' · '+av.window:''):av?.window||'';
    const weather=(w?'<div class="hub-weather" title="'+esc(word+(w.rainProb!=null?' · srážky '+w.rainProb+' %':'')+(w.wind!=null?' · vítr '+fmt(w.wind)+' km/h':''))+'"><span>'+icon+'</span><b>'+fmt(w.max)+'°</b><span>'+fmt(w.min)+'°</span>'+(w.rainProb!=null&&w.rainProb>=30?'<span>💧'+fmt(w.rainProb)+' %</span>':'')+'</div>':'<div class="hub-weather"></div>')+(avText?'<div class="hub-availability">'+esc(avText)+'</div>':'');
    return '<div class="hub-day'+(d.date===today?' today':d.date<today?' past':'')+(state.plannerPick?' pickable':'')+'" data-hub-day="'+esc(d.date)+'"><div class="hub-day-head"><strong>'+esc(dateFormat({weekday:'short'}).format(new Date(d.date+'T12:00:00Z')))+'</strong><span>'+esc(dateLabel(d.date))+'</span></div>'+weather+(items.join('')||(plan?'':'<div class="hub-empty">Volno</div>'))+(plan?'<div class="hub-plan">'+plan+'</div>':'')+'</div>';
  }).join('');
  if(!plannerQuiet()&&typeof prefetchChipLibraries==='function')prefetchChipLibraries();
  if(autoGym.length&&typeof autoPlanGym==='function')autoPlanGym(autoGym);
  $('hubWeekLoad').textContent=(state.weekPlan?.prefs?.source==='week'?'Vlastní nastavení týdne · ':'Běžný týden · ')+(weekTargetText()||'odjeto '+fmt(doneTss)+' TSS'+(plannedTss?' · v plánu dalších '+fmt(plannedTss)+' TSS':''))+(state.weatherError?' · počasí nedostupné':'');
}
// Planner: three sport chips dragged onto days (several per day), moved
// between days or removed; on a phone a tap picks the chip and a tap places it.
// Every change saves itself.
// Plan of the week: three sport chips dragged straight onto the calendar days
// (several per day), moved between days or removed; on a phone a tap picks the
// chip and a tap on a day places it. The plan repeats every week and saves itself.
function renderPlanner(){
  const box=$('plannerPalette');if(!box||!state.weekPlan)return;
  box.innerHTML=Object.entries(HUB_SPORTS).map(([sport,label])=>'<button type="button" class="planner-chip palette" draggable="true" data-chip-sport="'+sport+'" aria-pressed="'+(state.plannerPick===sport)+'" title="Přetáhni na den, nebo ťukni a pak ťukni na den">'+label+'</button>').join('');
}
const weekdayOf=date=>(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
let plannerSaveTimer=null;
// Length or place of one chip: shown at once, saved without the 5 s pause.
function setChipSession(key,patch){
  const prefs=state.weekPlan?.prefs;if(!prefs||!key)return;
  const all=prefs.sessions||(prefs.sessions={}),entry={...(all[key]||{}),...patch};
  for(const k of Object.keys(entry))if(entry[k]==null)delete entry[k];
  if(Object.keys(entry).length)all[key]=entry;else delete all[key];
  delete state.proposals?.[proposalKey(dateShift(state.weekPlan.start||state.hubWeek,Number(key.split('|')[0])),key.split('|')[1],Number(key.split('|')[2]))];
  if(typeof planEdited==='function')planEdited();
  renderWeekHub();clearTimeout(plannerSaveTimer);plannerSaveTimer=setTimeout(saveWeekPlanner,300);
}
function openChipTimeMenu(button){
  closeChipMenu();const key=button.dataset.key,sport=button.dataset.sport,own=chipSession(key).minutes;
  document.body.insertAdjacentHTML('beforeend','<div id="chipMenu" class="chip-menu" role="menu" aria-label="Délka tréninku"><button type="button" role="menuitem" data-minutes=""'+(own?'':' aria-checked="true"')+'>Automaticky</button>'+(SESSION_MINUTES[sport]||[]).map(m=>'<button type="button" role="menuitem" data-minutes="'+m+'"'+(own===m?' aria-checked="true"':'')+'>'+hm(m)+'</button>').join('')+'</div>');
  const menu=$('chipMenu'),r=button.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,r.left))+'px';menu.style.top=(r.bottom+6+menu.offsetHeight>innerHeight?Math.max(8,r.top-menu.offsetHeight-6):r.bottom+6)+'px';
  menu.onclick=e=>{const b=e.target.closest('[data-minutes]');if(!b)return;closeChipMenu();setChipSession(key,{minutes:b.dataset.minutes?Number(b.dataset.minutes):null});};
  menu.querySelector('button')?.focus();
  setTimeout(()=>document.addEventListener('click',closeChipMenuOutside,true),0);
}
function closeChipMenuOutside(e){if(!e.target.closest('#chipMenu'))closeChipMenu();}
function closeChipMenu(){$('chipMenu')?.remove();document.removeEventListener('click',closeChipMenuOutside,true);}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeChipMenu();});
window.addEventListener('scroll',()=>closeChipMenu(),{passive:true});
function plannerChanged(){if(typeof planEdited==='function')planEdited();state.weekPlan.dirty=true;state.plannerQuietUntil=Date.now()+PLANNER_QUIET_MS;clearTimeout(plannerQuietTimer);plannerQuietTimer=setTimeout(()=>renderWeekHub(),PLANNER_QUIET_MS+50);$('plannerStatus').textContent='Ukládám…';renderPlanner();renderWeekHub();clearTimeout(plannerSaveTimer);plannerSaveTimer=setTimeout(saveWeekPlanner,500);}
// fromIndex: the chip's position in the plan (-1 for a chip that only shows a
// proposal); fromSlot: its number among the same sport that day.
function plannerPlace(sport,day,fromDay=null,fromIndex=null,fromSlot=null){
  const days=state.weekPlan.prefs.days;if(!HUB_SPORTS[sport]||!days[day])return;
  // Dropped back on its own day: nothing changes.
  if(fromDay===day&&days[day].includes(sport)){renderPlanner();renderWeekHub();return;}
  if(days[day].length>=MAX_PER_DAY){if(typeof toast==='function')toast('Jeden den pojme nejvýš '+MAX_PER_DAY+' tréninky.');renderPlanner();renderWeekHub();return;}
  const start=state.weekPlan.start||state.hubWeek,dateOf=i=>start&&typeof dateShift==='function'?dateShift(start,i):null;
  if(fromDay!=null&&days[fromDay]){
    const at=fromIndex===-1?-1:fromIndex!=null&&days[fromDay][fromIndex]===sport?fromIndex:days[fromDay].indexOf(sport);
    const slot=at>=0?days[fromDay].slice(0,at).filter(x=>x===sport).length:Number(fromSlot)||0;
    if(at>=0){days[fromDay].splice(at,1);moveChipSession(fromDay,sport,slot,day,days[day].filter(x=>x===sport).length);}
    // A proposal made for the old day must not keep the chip there.
    if(state.proposals&&dateOf(fromDay))delete state.proposals[proposalKey(dateOf(fromDay),sport,slot)];
  }
  // Several sessions a day are fine, the same sport twice included; gym onto
  // a day whose gym was cancelled brings that one back instead of a second.
  const revive=sport==='gym'&&days[day].includes('gym')&&dateOf(day)&&typeof gymCancelledOn==='function'&&gymCancelledOn(dateOf(day));
  if(!revive)days[day].push(sport);
  if(sport==='gym'&&dateOf(day)&&typeof restoreCancelledGym==='function')restoreCancelledGym(dateOf(day));
  plannerChanged();
}
const MAX_PER_DAY=4;
// A chip's own length/place travels with it; the later sessions of that sport
// on the old day move up one slot. to=null drops it (the chip was removed).
function moveChipSession(fromDay,sport,slot,toDay=null,toSlot=0){
  const all=state.weekPlan?.prefs?.sessions;if(!all)return;
  const own=all[fromDay+'|'+sport+'|'+slot];delete all[fromDay+'|'+sport+'|'+slot];
  for(let n=slot+1;n<4;n++){const k=fromDay+'|'+sport+'|'+n;if(all[k]){all[fromDay+'|'+sport+'|'+(n-1)]=all[k];delete all[k];}}
  if(own&&toDay!=null)all[toDay+'|'+sport+'|'+toSlot]=own;
}
async function saveWeekPlanner(){
  $('plannerStatus').textContent='Ukládám…';
  const sent=JSON.stringify(state.weekPlan.prefs),start=state.weekPlan.start||state.hubWeek||localMonday();
  try{const saved=await jsonFetch('/app/api/week-plan?start='+start,{method:'POST',headers:{'Content-Type':'application/json'},body:sent});
    // A newer edit made meanwhile has its own save queued; keep it.
    if(state.weekPlan.start!==start||JSON.stringify(state.weekPlan.prefs)!==sent)return;
    state.weekPlan=saved;$('plannerStatus').textContent='✓ Uloženo · generátor se podle plánu řídí';renderPlanner();renderGymPlanHint();await renderWeekHub();}
  catch(error){$('plannerStatus').innerHTML='Neuloženo: '+esc(error.message)+' <button type="button" class="btn" id="plannerRetry">Zkusit znovu</button>';const retry=$('plannerRetry');if(retry)retry.onclick=saveWeekPlanner;}
}
function installPlannerDrag(){
  // Where a dragged or tapped chip comes from (the palette has no day).
  const chipOrigin=chip=>({sport:chip.dataset.chipSport,from:chip.dataset.chipDay==null?null:Number(chip.dataset.chipDay),index:chip.dataset.chipDay==null||chip.dataset.chipIndex==null?null:Number(chip.dataset.chipIndex),slot:Number(chip.dataset.chipSlot)||0});
  const box=document.querySelector('#workouts .week-hub');let drag=null,touchDrag=null,suppressClickUntil=0;
  const clearTargets=()=>box.querySelectorAll('.drop-target').forEach(d=>d.classList.remove('drop-target'));
  box.addEventListener('pointerdown',e=>{const chip=e.target.closest('.planner-chip');if(e.pointerType!=='touch'||!chip||e.target.closest('[data-chip-remove],[data-chip-time],[data-chip-env]'))return;touchDrag={...chipOrigin(chip),x:e.clientX,y:e.clientY,id:e.pointerId,chip,active:false};});
  box.addEventListener('pointermove',e=>{if(!touchDrag||e.pointerId!==touchDrag.id)return;if(!touchDrag.active&&Math.hypot(e.clientX-touchDrag.x,e.clientY-touchDrag.y)<12)return;e.preventDefault();if(!touchDrag.active){touchDrag.active=true;box.setPointerCapture(e.pointerId);touchDrag.chip.classList.add('dragging');}clearTargets();const day=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-hub-day]');if(day&&box.contains(day))day.classList.add('drop-target');});
  const finishTouch=(e,cancelled=false)=>{if(!touchDrag||e.pointerId!==touchDrag.id)return;const current=touchDrag;touchDrag=null;current.chip.classList.remove('dragging');clearTargets();if(!current.active)return;suppressClickUntil=Date.now()+500;if(box.hasPointerCapture(e.pointerId))box.releasePointerCapture(e.pointerId);if(cancelled)return;const day=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-hub-day]');if(day&&box.contains(day)){state.plannerPick=null;state.plannerFrom=null;plannerPlace(current.sport,weekdayOf(day.dataset.hubDay),current.from,current.index,current.slot);}};
  box.addEventListener('pointerup',e=>finishTouch(e));box.addEventListener('pointercancel',e=>finishTouch(e,true));
  document.addEventListener?.('keydown',e=>{if(e.key==='Escape'&&state.plannerPick){state.plannerPick=null;state.plannerFrom=null;renderPlanner();renderWeekHub();}});
  box.addEventListener('dragstart',e=>{const chip=e.target.closest('.planner-chip');drag=null;if(!chip)return;drag=chipOrigin(chip);e.dataTransfer.effectAllowed=drag.from==null?'copy':'move';e.dataTransfer.setData('text/plain',drag.sport);chip.classList.add('dragging');});
  box.addEventListener('dragend',e=>{e.target.closest?.('.planner-chip')?.classList.remove('dragging');box.querySelectorAll('.drop-target').forEach(d=>d.classList.remove('drop-target'));
    // A cancelled drag keeps the plan; removal has its own explicit button.
    drag=null;});
  box.addEventListener('dragover',e=>{const day=e.target.closest('[data-hub-day]');if(!drag||!day)return;e.preventDefault();e.dataTransfer.dropEffect=drag.from==null?'copy':'move';box.querySelectorAll('.drop-target').forEach(d=>{if(d!==day)d.classList.remove('drop-target')});day.classList.add('drop-target');});
  box.addEventListener('dragleave',e=>{const day=e.target.closest('[data-hub-day]');if(day&&!day.contains(e.relatedTarget))day.classList.remove('drop-target');});
  box.addEventListener('drop',e=>{const day=e.target.closest('[data-hub-day]');if(!drag||!day)return;e.preventDefault();const d=drag;drag=null;plannerPlace(d.sport,weekdayOf(day.dataset.hubDay),d.from,d.index,d.slot);});
  box.addEventListener('click',e=>{
    if(Date.now()<suppressClickUntil)return;
    const remove=e.target.closest('[data-chip-remove]');
    if(remove){const chip=remove.closest('.planner-chip'),o=chipOrigin(chip),date=chip.closest('[data-hub-day]').dataset.hubDay,list=state.weekPlan.prefs.days[o.from];if(state.proposals)delete state.proposals[typeof proposalKey==='function'?proposalKey(date,o.sport,o.slot):date+'|'+o.sport];const at=o.index===-1?-1:o.index!=null&&list[o.index]===o.sport?o.index:list.indexOf(o.sport);if(at>=0){list.splice(at,1);if(typeof moveChipSession==='function')moveChipSession(o.from,o.sport,o.slot);}plannerChanged();return}
    const time=e.target.closest('[data-chip-time]');
    if(time&&!state.plannerPick){openChipTimeMenu(time);return}
    const envButton=e.target.closest('[data-chip-env]');
    if(envButton&&!state.plannerPick){const next=envButton.dataset.env==='indoor'?'outdoor':'indoor';setChipSession(envButton.dataset.key,{environment:next===envButton.dataset.auto?null:next});return}
    const suggest=e.target.closest('[data-chip-suggest]');
    if(suggest&&!state.plannerPick){openChipSuggestion(suggest.dataset);return}
    const palette=e.target.closest('.planner-chip.palette');
    if(palette){state.plannerPick=state.plannerPick===palette.dataset.chipSport&&state.plannerFrom==null?null:palette.dataset.chipSport;state.plannerFrom=null;state.plannerFromIndex=null;renderPlanner();renderWeekHub();return}
    const chip=e.target.closest('.planner-chip');
    if(chip&&!state.plannerPick){const o=chipOrigin(chip);state.plannerPick=o.sport;state.plannerFrom=o.from;state.plannerFromIndex=o.index;state.plannerFromSlot=o.slot;renderPlanner();renderWeekHub();return;}
    const day=e.target.closest('[data-hub-day]');
    if(day&&state.plannerPick&&!e.target.closest('button,input,select,textarea,a')){const sport=state.plannerPick,from=state.plannerFrom??null,index=state.plannerFromIndex??null,slot=state.plannerFromSlot??null;state.plannerPick=null;state.plannerFrom=null;state.plannerFromIndex=null;state.plannerFromSlot=null;plannerPlace(sport,weekdayOf(day.dataset.hubDay),from,index,slot);}
  });
}
// The gym panel suggests muscle groups from the day's planner role.
const ROLE_MUSCLES={gym_upper:['quads','hamstrings','chest','upper_back','abs'],gym_full:['quads','hamstrings','chest','upper_back','abs']};
function renderGymPlanHint(){
  const el=$('gymPlanHint');if(!el||!state.weekPlan)return;
  const weekday=(new Date(gymDay()+'T12:00:00Z').getUTCDay()+6)%7,role=(state.weekPlan.roles?.[weekday]?.items||[]).find(x=>x.sport==='gym');
  el.innerHTML=role?'Plán týdne '+(gymDay()===localToday()?'na dnes':'na '+esc(longDate(gymDay())))+': <strong>'+esc(role.label)+'</strong>'+(role.role==='gym_upper'?' – nohy šetřím kvůli kvalitě na kole/běhu.':'.')+' <button class="btn" type="button" id="gymUsePlan">Vybrat partie podle plánu</button>':'Vyber partie, nebo nech trenéra sestavit trénink podle týdne a únavy. Dny pro gym si nastavíš v plánovači týdne.';
  const use=$('gymUsePlan');if(use)use.onclick=()=>{selectedGymMuscles.clear();for(const id of ROLE_MUSCLES[role.role]||[])if($('gymFocusChoices').querySelector('[data-muscle="'+id+'"]'))selectedGymMuscles.add(id);renderGymFocus();};
}
async function openWorkouts(){
  if(state.workoutSport==='gym')loadGym().catch(e=>toast(e.message));else loadScheduledWorkouts();
  await loadWeekPlan();renderPlanner();renderGymPlanHint();renderWeekHub();
}
function installWorkoutsHub(){
  installInfoTips();
  const goWeek=async next=>{clearTimeout(plannerSaveTimer);if(state.weekPlan?.dirty)await saveWeekPlanner();if(state.weekPlan?.dirty){toast('Plán týdne se neuložil. Zkus to znovu, ať o změnu nepřijdeš.');return;}state.hubWeek=next;await renderWeekHub();renderPlanner();};
  $('hubPrevWeek').onclick=()=>goWeek(dateShift(state.hubWeek||localMonday(),-7));
  $('hubNextWeek').onclick=()=>goWeek(dateShift(state.hubWeek||localMonday(),7));
  $('hubThisWeek').onclick=()=>goWeek(localMonday());
  $('hubLocation').onclick=()=>{const f=$('hubLocationForm');f.hidden=!f.hidden;if(!f.hidden)$('hubLocationQuery').focus();};
  $('hubLocationDevice').onclick=async()=>{const out=$('hubLocationResults');out.innerHTML='<span class="small">'+uiText('Zjišťuji polohu…','Getting your location…')+'</span>';
    try{const pos=await devicePosition();await setWeatherPlace({name:uiText('Moje poloha','My location'),...pos,source:'device'});await renderWeekHub();}catch(error){out.innerHTML='<span class="small">'+esc(error.message)+'</span>';}};
  $('hubLocationOff').onclick=async()=>{await setWeatherPlace(null);await renderWeekHub();};
  $('hubLocationForm').onsubmit=async e=>{
    e.preventDefault();const q=$('hubLocationQuery').value.trim(),out=$('hubLocationResults');if(!q)return;out.innerHTML='<span class="small">Hledám…</span>';
    try{const r=await fetch('https://geocoding-api.open-meteo.com/v1/search?count=5&language=cs&format=json&name='+encodeURIComponent(q)),d=await r.json(),rows=d.results||[];
      out.innerHTML=rows.length?rows.map((x,i)=>'<button class="btn" type="button" data-loc="'+i+'">'+esc(x.name+(x.admin1?', '+x.admin1:'')+(x.country_code?' ('+x.country_code+')':''))+'</button>').join(''):'<span class="small">Nic nenalezeno.</span>';
      out.querySelectorAll('[data-loc]').forEach(b=>b.onclick=async()=>{const x=rows[Number(b.dataset.loc)];await setWeatherPlace({name:x.name,latitude:x.latitude,longitude:x.longitude,source:'search'});await renderWeekHub();});
    }catch(error){out.innerHTML='<span class="small">'+esc(error.message)+'</span>';}
  };
  installPlannerDrag();
  installPlannedEditing();
}
// Planned workouts from Intervals.icu: drag between days (desktop) or the
// item's menu (any device); deleting removes them in Intervals.icu too.
// The change shows at once; Intervals.icu is updated in the background and a
// refused change is rolled back.
function hubDays(){return state.hubWeek===weekStart&&state.week?.days?state.week.days:state.hubWeekData?.days||null}
function updateCachedDay(date,daily,gym){
  for(const days of [state.week?.days,state.hubWeekData?.days]){const day=days?.find(d=>d.date===date);if(!day)continue;if(daily){day.daily=daily;if(daily.nutrition?.foodLog)day.food=daily.nutrition.foodLog;}if(gym?.date===date)day.gymCancelled=Boolean(gym.cancelled);}
}
function gymCancelledOn(date){return (state.gym?.date===date&&state.gym.cancelled)||[...(state.week?.days||[]),...(state.hubWeekData?.days||[])].some(d=>d.date===date&&d.gymCancelled)}
// Gym placed on a day where it was cancelled: the plan wants it again.
async function restoreCancelledGym(date){
  if(!gymCancelledOn(date))return;
  for(const day of [...(state.week?.days||[]),...(state.hubWeekData?.days||[])])if(day.date===date)day.gymCancelled=false;
  if(state.gym?.date===date)state.gym={...state.gym,cancelled:false};
  renderWeekHub();
  try{await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,action:'uncancel'})});planEdited();}
  catch(error){toast('Gym se na '+longDate(date)+' nepodařilo vrátit: '+error.message);for(const day of [...(state.week?.days||[]),...(state.hubWeekData?.days||[])])if(day.date===date)day.gymCancelled=true;renderWeekHub();}
}
function takePlanned(days,eventId){for(const d of days){const list=d.daily?.training?.planned||[],i=list.findIndex(x=>String(x.id)===String(eventId));if(i>=0)return list.splice(i,1)[0];}return null}
// The shown week again from the server (the current week lives in state.week).
async function reloadWeek(){state.hubWeekData=null;if(state.hubWeek===weekStart)await refreshAfterPlanChange().catch(()=>{});await renderWeekHub();}
async function refreshAfterPlanChange(){
  const revision=++planDataRevision;
  const results=await Promise.allSettled([fetchWeek(weekStart),jsonFetch('/app/api/daily?date='+selectedHistoryDate),jsonFetch('/app/api/gym?date='+gymDay())]);
  if(revision!==planDataRevision)return;
  if(results[0].status==='fulfilled'){state.week=results[0].value;applyPendingPlanned(state.week.days);}
  if(results[1].status==='fulfilled')state.daily=results[1].value;
  if(results[2].status==='fulfilled')state.gym=results[2].value;
  updateCachedDay(selectedHistoryDate,state.daily,state.gym);
  renderTraining();renderOverview();renderNutrition();renderGym();renderToday();scheduleCoachRefresh();
  if(state.hubWeek!==weekStart)state.hubWeekData=null;
  await renderWeekHub();loadScheduledWorkouts();
}
// ---- Plan changes: the week shows them at once, the rest of the app after
// 5 s without further changes, Intervals.icu within 15 s. Moves and deletes
// of one event are merged, so dragging a session around sends one change.
const PLAN_SETTLE_MS=5000,INTERVALS_DELAY_MAX_MS=15000;
let plannedQueueSince=0,plannedFlushTimer=null,planSettleTimer=null,plannedFlushing=null;
function planEdited(){clearTimeout(planSettleTimer);planSettleTimer=setTimeout(planSettled,PLAN_SETTLE_MS);}
async function planSettled(){await flushPlannedQueue();await refreshAfterPlanChange();}
function cachedWeeks(){return [state.week?.days,state.hubWeekData?.days].filter((days,i,all)=>days&&all.indexOf(days)===i)}
function plannedDate(days,eventId){for(const d of days||[])if((d.daily?.training?.planned||[]).some(x=>String(x.id)===String(eventId)))return d.date;return null}
// Queued changes stay visible over any data fetched before they reach the server.
function applyPendingPlanned(days){
  if(!days||!plannedQueue.size&&!pendingAdds.size)return;
  for(const [eventId,op] of plannedQueue){
    takePlanned(days,eventId);
    const target=op.type==='move'&&op.item?days.find(d=>d.date===op.date):null;
    if(target)((target.daily||={}).training||={},target.daily.training.planned||=[]).push({...op.item,start:op.date+String(op.item.start||'').slice(10)});
  }
  for(const [id,item] of pendingAdds){if(days.some(d=>(d.daily?.training?.planned||[]).some(x=>String(x.id)===id)))continue;const target=days.find(d=>d.date===item.date);if(target)((target.daily||={}).training||={},target.daily.training.planned||=[]).push(item);}
}
function queuePlanned(eventId,op){
  const id=String(eventId),prev=plannedQueue.get(id);
  plannedQueue.set(id,{...op,from:prev?prev.from:op.from,item:op.item||prev?.item||null});
  if(!plannedQueueSince)plannedQueueSince=Date.now();
  clearTimeout(plannedFlushTimer);
  plannedFlushTimer=setTimeout(flushPlannedQueue,Math.max(0,Math.min(PLAN_SETTLE_MS,plannedQueueSince+INTERVALS_DELAY_MAX_MS-Date.now())));
  planEdited();
}
async function flushPlannedQueue(){
  clearTimeout(plannedFlushTimer);
  while(plannedFlushing)await plannedFlushing;
  if(!plannedQueue.size)return;
  const ops=[...plannedQueue];plannedQueue.clear();plannedQueueSince=0;
  plannedFlushing=(async()=>{
    const failed=[];
    for(const [eventId,op] of ops){
      // Moved back where it was: nothing to tell Intervals.icu.
      if(op.type==='move'&&op.date===op.from)continue;
      try{await jsonFetch(op.type==='move'?'/app/api/planned/move':'/app/api/planned/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op.type==='move'?{eventId,date:op.date}:{eventId}),keepalive:true});}
      catch(error){failed.push('„'+(op.name||'Trénink')+'“: '+error.message);}
    }
    if(failed.length){toast('Intervals.icu změnu nepřijalo, vracím ji zpět. '+failed.join(' · '));state.hubWeekData=null;}
  })();
  try{await plannedFlushing;}finally{plannedFlushing=null;}
  if(document.visibilityState!=='hidden')await refreshAfterPlanChange();
}
// Leaving the page sends what is waiting right away.
window.addEventListener('pagehide',()=>{if(plannedQueue.size)flushPlannedQueue();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&plannedQueue.size)flushPlannedQueue();});
function movePlanned(eventId,date,name){
  if(!eventId||!date)return;
  if(date<localToday()){toast('Trénink jde přesunout jen na dnešek nebo pozdější den.');return}
  planDataRevision++;
  let item=null,from=null;
  for(const days of cachedWeeks()){from=from||plannedDate(days,eventId);const x=takePlanned(days,eventId);item=item||x;}
  queuePlanned(eventId,{type:'move',date,name,from,item:item?{...item}:null});
  for(const days of cachedWeeks())applyPendingPlanned(days);
  renderWeekHub();
  toast('„'+(name||'Trénink')+'“ je na '+longDate(date)+'. Do Intervals.icu se propíše během pár vteřin.');
}
function deletePlanned(eventId,name,ask=true){
  if(!eventId||ask&&!window.confirm('Smazat „'+(name||'trénink')+'“ z plánu i z Intervals.icu?'))return;
  planDataRevision++;
  for(const days of cachedWeeks())takePlanned(days,eventId);
  queuePlanned(eventId,{type:'delete',name});
  renderWeekHub();
  toast('„'+(name||'Trénink')+'“ je smazaný. Z Intervals.icu zmizí během pár vteřin.');
}
// A workout added from the library or a proposal shows in the week at once
// (pendingAdds, declared at the top).
function showPendingAdd(workout,date,sport){
  const id='pending:'+(workout?.id||'w')+':'+date,item={id,date,name:workout?.name||'Trénink',type:sport==='run'?'Run':sport==='gym'?'WeightTraining':'Ride',durationHours:num(workout?.duration_minutes)/60||null,tss:workout?.target_load??null,start:date,pending:true};
  pendingAdds.set(id,item);for(const days of cachedWeeks())applyPendingPlanned(days);renderWeekHub();return id;
}
// ok: the server took it (eventId makes it editable at once); otherwise it goes.
function settlePendingAdd(id,ok,eventId=null){
  const item=pendingAdds.get(id);pendingAdds.delete(id);
  for(const days of cachedWeeks())for(const d of days){const list=d.daily?.training?.planned||[],i=list.findIndex(x=>String(x.id)===id);if(i<0)continue;if(ok&&item)list[i]={...item,id:eventId||item.id,pending:!eventId};else list.splice(i,1);}
  renderWeekHub();planEdited();
}
// Detail of a training in the week: a planned one shows its plan and the
// changes (move, swap, cancel); a done one compares the plan with the result.
function workoutPlanHtml(description){
  const lines=String(description||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,40);
  if(!lines.length)return '<p class="small">Plán nemá v Intervals.icu popsanou strukturu.</p>';
  return '<div class="plan-steps">'+lines.map(l=>/^[-•]/.test(l)?'<div class="plan-step">'+esc(l.replace(/^[-•]\s*/,''))+'</div>':'<div class="plan-step-head">'+esc(l)+'</div>').join('')+'</div>';
}
function planDiff(plan,actual){return num(plan)>0&&measured(actual)?Math.round((num(actual)-num(plan))/num(plan)*100):null}
function compareTableHtml(rows){
  const body=rows.filter(r=>r[1]!=null||r[2]!=null).map(([label,plan,actual,show])=>{const d=planDiff(plan,actual),cls=d==null?'':Math.abs(d)<=10?'ok':d>0?'over':'under';return '<tr><th>'+label+'</th><td>'+(plan!=null?esc(show(plan)):'—')+'</td><td>'+(actual!=null?esc(show(actual)):'—')+'</td><td class="'+cls+'">'+(d==null?'':(d>0?'+':'')+d+' %')+'</td></tr>';}).join('');
  return '<table class="plan-compare"><thead><tr><th></th><th>Plán</th><th>Skutečnost</th><th>Rozdíl</th></tr></thead><tbody>'+body+'</tbody></table>';
}
function planVerdict(plan,a){
  const dur=planDiff(num(plan.durationHours)*60,num(a.durationHours)*60),tss=planDiff(plan.tss,a.tss),main=tss??dur;
  if(main==null)return '';
  return '<p class="plan-verdict '+(Math.abs(main)<=10?'ok':main>0?'over':'under')+'">'+(Math.abs(main)<=10?'✓ Splněno podle plánu':main>0?'Odjeto náročněji než plán':'Odjeto lehčeji než plán')+(tss!=null&&dur!=null?' · zátěž '+(tss>0?'+':'')+tss+' %, délka '+(dur>0?'+':'')+dur+' %':'')+'</p>';
}
function trainingFacts(item,sport){
  const minutes=num(item.durationHours)*60,f=sport==='gym'?null:intensityOf(item.tss,minutes);
  return '<div class="training-facts">'+[minutes>0?['Délka',hm(minutes)]:null,measured(item.tss)?['TSS',fmt(item.tss)]:null,f&&f<1.6?['IF',dec(f,2)]:null].filter(Boolean).map(([l,v])=>'<div><span>'+l+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>';
}
// Body figure of a gym session: every muscle the sets load, brighter for more sets.
function gymMuscleLoad(muscles,sets){const load={};for(const {exercise,count} of sets)for(const [m,w] of Object.entries(muscles?.[exercise]||{}))load[m]=(load[m]||0)+num(w)*count;return load;}
function gymMuscleFigure(load,bare=false){
  const max=Math.max(0,...Object.values(load)),tpl=$('muscleMapTemplate');if(!tpl||!max)return '';
  const box=document.createElement('div');box.append(tpl.content.cloneNode(true));
  const one=v=>cz(v,1);
  box.querySelectorAll('[data-muscle]').forEach(el=>{const v=load[el.dataset.muscle]||0,r=v/max;el.style.setProperty('--fresh-fill',r>=.6?'#a77bff':r>=.3?'#7a5cc4':r>0?'color-mix(in srgb,var(--lilac) 40%,var(--bg))':'color-mix(in srgb,var(--muted) 22%,var(--bg))');const t=document.createElementNS('http://www.w3.org/2000/svg','title');t.textContent=(MUSCLE_LABELS[el.dataset.muscle]||el.dataset.muscle)+(v?' · '+one(v)+' sérií':' · bez zátěže');el.appendChild(t);});
  const main=Object.entries(load).sort((a,b)=>b[1]-a[1]).filter(([,v])=>v/max>=.3).slice(0,6).map(([m])=>MUSCLE_LABELS[m]||m);
  if(bare)return '<div class="gym-detail-figure">'+box.innerHTML+'</div>';
  return '<div class="gym-detail-figure">'+box.innerHTML+'<div class="gym-figure-legend"><span><i style="background:#a77bff"></i>hlavně</span><span><i style="background:#7a5cc4"></i>středně</span><span><i style="background:color-mix(in srgb,var(--lilac) 40%,var(--bg))"></i>doplňkově</span></div>'+(main.length?uiText('<p class="small">Hlavně: ', '<p class="small">Mainly: ')+esc(main.join(', '))+'</p>':'')+'</div>';
}
// The day's exercises in a few lines: sets × reps and the weight.
function gymCompactList(values,muscles){
  const rows=(values||[]).slice(7).filter(r=>r?.[1]&&String(r[0]).toUpperCase()==='WORK'),names=[...new Set(rows.map(r=>r[1]))],kg=v=>String(v??'').trim().replace('.',',');
  if(!names.length)return '<p class="small">Pro tento den není uložený gym plán.</p>';
  return '<ol class="gym-compact">'+names.map(name=>{const sets=rows.filter(r=>r[1]===name),top=Object.entries(muscles?.[name]||{}).sort((a,b)=>b[1]-a[1])[0]?.[0];
    return '<li><div><b>'+esc(name)+'</b>'+(top?'<small>'+esc(MUSCLE_LABELS[top]||top)+'</small>':'')+'</div><span>'+sets.length+' × '+esc(sets[0][4]||'—')+(kg(sets[0][3])?' · '+esc(kg(sets[0][3]))+' kg':'')+'</span></li>';}).join('')+'</ol>';
}
// ---- One gym session as one view (week detail, proposal, Workouty): the body
// figure, every exercise with its warm-up and work sets, video and records.
// Planned days and proposals change here; a finished day gets its weights.
const gsKg=v=>String(v??'').trim().replace('.',',');
function gymSessionExercises(rows){const out=[],by=new Map();(rows||[]).forEach((r,i)=>{if(!r?.[1])return;let ex=by.get(r[1]);if(!ex){ex={name:r[1],sets:[]};by.set(r[1],ex);out.push(ex);}ex.sets.push({r,i});});return out;}
// Records of a day: a heavier set, or a better estimated 1RM (up to 12 reps),
// than every earlier set of that exercise. A first try is not a record.
function gymDayRecords(rows,history,date){
  const e1=(kg,reps)=>kg>0&&reps>0&&reps<=12?kg*(1+reps/30):0,out={},val=v=>Number(String(v??'').replace(',','.'))||0;
  const day=(rows||[]).filter(r=>r?.[1]&&String(r[0]||'WORK').toUpperCase()!=='WARMUP'&&String(r[8]).toUpperCase()==='TRUE').map(r=>({exercise:r[1],kg:val(r[5]),reps:val(r[6])}));
  for(const name of new Set(day.map(x=>x.exercise))){
    const before=(history||[]).filter(h=>h.exercise===name&&String(h.workout_date||'').slice(0,10)<date).map(h=>({kg:val(h.actual_kg),reps:val(h.actual_reps)}));if(!before.length)continue;
    const mine=day.filter(x=>x.exercise===name),heavy=Math.max(...mine.map(x=>x.kg)),prevHeavy=Math.max(...before.map(x=>x.kg));
    const best=mine.reduce((a,x)=>e1(x.kg,x.reps)>e1(a.kg,a.reps)?x:a,mine[0]),prevE1=Math.max(...before.map(x=>e1(x.kg,x.reps)));
    if(heavy>0&&heavy>prevHeavy){const set=mine.filter(x=>x.kg===heavy).sort((a,b)=>b.reps-a.reps)[0];out[name]={kind:'weight',kg:set.kg,reps:set.reps,before:prevHeavy};}
    else if(prevE1>0&&e1(best.kg,best.reps)>prevE1)out[name]={kind:'e1rm',kg:best.kg,reps:best.reps,value:e1(best.kg,best.reps),before:prevE1};
  }
  return out;
}
function gymSessionHtml(s){
  const ex=gymSessionExercises(s.rows),done=s.mode==='done',log=done||s.mode==='plan'&&s.date<=localToday(),recs=s.records||{};
  const add=s.editable?'<div class="gs-tools"><button type="button" class="btn" data-gs="add">'+(done?'＋ Přidat cvik, který jsem dělal':'＋ Přidat cvik')+'</button></div>':'';
  if(!ex.length)return '<div class="gym-session"><p class="small">Pro tento den zatím nejsou žádné cviky.</p>'+add+'</div>';
  const rows=s.rows.filter(r=>r?.[1]),work=rows.filter(gymRowWork),warm=rows.length-work.length,did=work.filter(gymRowDone).length,nRec=Object.keys(recs).length;
  const load=gymMuscleLoad(s.muscles,ex.map(e=>({exercise:e.name,count:e.sets.filter(x=>gymRowWork(x.r)&&(!done||gymRowDone(x.r))).length})));
  const stats=[...(s.facts||[]),[uiText('Cviky','Exercises'),ex.length],[done?uiText('Odcvičeno','Trained'):uiText('Série','Sets'),done?did+' / '+work.length+uiText(' sérií',' sets'):work.length+uiText(' pracovních',' working')],...(warm?[[uiText('Rozcvička','Warm-up'),warm+' '+uiText(warm<5?'série':'sérií',warm===1?'set':'sets')]]:[])];
  const max=Math.max(0,...Object.values(load)),groups=[['Hlavně','#a77bff',.6,1.01],['Středně','#7a5cc4',.3,.6],['Doplňkově','color-mix(in srgb,var(--lilac) 40%,var(--bg))',0.0001,.3]].map(([label,color,lo,hi])=>[label,color,Object.entries(load).filter(([,v])=>max&&v/max>=lo&&v/max<hi).sort((a,b)=>b[1]-a[1]).map(([m])=>MUSCLE_LABELS[m]||m)]).filter(g=>g[2].length);
  const muscles=groups.length?'<div class="gs-muscles">'+groups.map(([label,color,list])=>'<div class="gs-mg"><span class="gs-mg-h"><i style="background:'+color+'"></i>'+label+'</span><div class="gs-mg-list">'+list.map(m=>'<span>'+esc(m)+'</span>').join('')+'</div></div>').join('')+'</div>':'';
  const prs=nRec?'<div class="gs-prs"><b>🏆 '+(nRec===1?uiText('Nový osobní rekord','New personal record'):uiText(nRec+(nRec<5?' nové osobní rekordy':' nových osobních rekordů'),nRec+' new personal records'))+'</b><ul>'+Object.entries(recs).map(([name,r])=>'<li><span>'+esc(name)+'</span><strong>'+esc(gsKg(r.kg)+' kg × '+r.reps)+'</strong><small>'+(r.kind==='weight'?uiText('dosud max ','previous best ')+esc(gsKg(Math.round(r.before*10)/10))+' kg':uiText('odhad 1RM ', 'estimated 1RM ')+esc(gsKg(Math.round(r.value*10)/10))+' kg')+'</small></li>').join('')+'</ul></div>':'';
  const input=(i,col,v,ph,label)=>'<input class="gs-in" data-gs-row="'+i+'" data-gs-col="'+col+'" inputmode="decimal" value="'+esc(gsKg(v))+'" placeholder="'+esc(ph)+'" aria-label="'+esc(label)+'">';
  const set=(e,{r,i},n)=>{const warmup=!gymRowWork(r),ok=gymRowDone(r),plan=gsKg(r[3])||r[4]?(gsKg(r[3])?gsKg(r[3])+' kg':'dle RPE')+' × '+(r[4]||'—'):'—',what=e.name+(warmup?' rozcvička':' série '+n);
    const failure=!warmup&&(gymPrescribedFailure(r)||ok&&gymFailureValue(r[11]));
    let body;
    if(log)body='<span class="gs-plan">'+esc(plan)+'</span><span class="gs-actual">'+(s.editable?input(i,5,r[5],gsKg(r[3])||'kg',what+' · kg')+'<i>×</i>'+input(i,6,r[6],String(r[4]||'').split(/[–-]/)[0]||'opak.',what+' · opakování'):ok?esc(gsKg(r[5])+' kg × '+(r[6]||'—')):'—')+'</span><span class="gs-ok" aria-label="'+(ok?'Hotovo':'Nezapsáno')+'">'+(ok?'✓':'')+'</span>';
    else if(s.editable&&!ok)body='<span class="gs-actual">'+input(i,3,r[3],'kg',what+' · kg')+'<i>kg ×</i>'+input(i,4,r[4],'opak.',what+' · opakování')+'</span>';
    else body='<span class="gs-plan">'+esc(plan)+'</span>';
    return '<div class="gs-set'+(warmup?' warm':'')+(ok?' done':'')+(log?' log':'')+'"><span class="gs-tag" title="'+(warmup?'Rozcvička':'Pracovní série')+'">'+(warmup?'R':n)+'</span>'+body+(failure?'<span class="gs-badge">do selhání</span>':'')+'</div>';};
  const swap=e=>{if(s.swap!==e.name)return '';const list=s.swapList;
    return '<div class="gs-swap">'+(list==null?'<p class="small">Hledám náhrady pro stejnou partii…</p>':typeof list==='string'?'<p class="small">'+esc(list)+'</p>':list.length?list.map((a,k)=>'<button type="button" class="gm-alt" data-gs="alt" data-name="'+esc(e.name)+'" data-alt="'+k+'"><strong>'+esc(a.name)+'</strong><small>'+esc(a.muscle)+' · '+esc(a.reps)+' op.'+(a.kg!=null?' · '+fmt(a.kg,1)+' kg':'')+(a.station?' · '+esc(a.station):'')+'</small></button>').join(''):'<p class="small">Pro tuto partii tu není jiný cvik.</p>')+'</div>';};
  const card=(e,k)=>{let n=0;const top=Object.entries(s.muscles?.[e.name]||{}).sort((a,b)=>b[1]-a[1])[0]?.[0],group=e.sets.find(x=>/^[A-F]$/.test(x.r[12]||''))?.r[12],rec=recs[e.name],name=' data-name="'+esc(e.name)+'"';
    return '<section class="gs-ex"><header><span class="gs-num">'+(k+1)+'</span><div class="gs-name"><b>'+esc(e.name)+'</b><small>'+esc([top?MUSCLE_LABELS[top]||top:'',group?'supersérie '+group:''].filter(Boolean).join(' · '))+'</small></div><div class="gs-ex-actions"><button type="button" class="btn gs-video" data-gs="video"'+name+'>▶ Video</button>'+(s.editable&&!done?'<button type="button" class="btn" data-gs="swap"'+name+' aria-expanded="'+(s.swap===e.name)+uiText('" aria-label="Vyměnit ', '" aria-label="Swap ')+esc(e.name)+'">⇄</button>':'')+(s.editable?'<button type="button" class="btn" data-gs="remove"'+name+' aria-label="Odebrat '+esc(e.name)+'">✕</button>':'')+'</div></header>'+
      (rec?uiText('<p class="gs-record">🏆 Osobní rekord · ', '<p class="gs-record">🏆 Personal record · ')+(rec.kind==='weight'?uiText('nejtěžší váha ', 'heaviest weight '):uiText('odhad 1RM ', 'estimated 1RM ')+gsKg(Math.round(rec.value*10)/10)+uiText(' kg z ', ' kg from '))+esc(gsKg(rec.kg)+' kg × '+rec.reps)+' <small>dosud '+esc(gsKg(Math.round(rec.before*10)/10))+' kg</small></p>':'')+
      (log?'<div class="gs-set log gs-head" aria-hidden="true"><span></span><span>Plán</span><span>Skutečně</span><span></span></div>':'')+
      e.sets.map(x=>set(e,x,gymRowWork(x.r)?++n:0)).join('')+swap(e)+
      (s.editable?'<div class="gs-ex-tools"><button type="button" class="btn" data-gs="add-set"'+name+'>+ série</button>'+(e.sets.length>1?'<button type="button" class="btn" data-gs="remove-set"'+name+'>− série</button>':'')+'</div>':'')+'</section>';};
  const ai=s.editable&&!done&&!rows.some(gymRowDone)?'<form class="gs-ai" data-gs-ai><label for="gsAi'+s.uid+'">✦ Upravit s AI trenérem</label><div><input id="gsAi'+s.uid+'" maxlength="300" placeholder="Např. bez nohou, kratší o 15 min, víc zad"'+(s.aiBusy?' disabled':'')+'><button class="btn" type="submit"'+(s.aiBusy?' disabled':'')+'>'+(s.aiBusy?'Upravuji…':'Upravit')+'</button></div>'+(s.aiNote?'<p class="small gs-ai-note" role="status">'+esc(s.aiNote)+'</p>':'')+'</form>':'';
  return '<div class="gym-session"><div class="gs-stats">'+stats.map(([l,v])=>'<div><span>'+esc(l)+'</span><b>'+esc(v)+'</b></div>').join('')+'</div>'+prs+'<div class="gs-top">'+gymMuscleFigure(load,true)+muscles+'</div><div class="gs-list">'+ex.map(card).join('')+'</div>'+add+ai+(done&&s.editable?'<p class="small">Zapsané série se uloží samy a propíší se do historie i osobních rekordů.</p>':'')+'</div>';
}
// Missing muscles of exercises added or swapped in (the figure).
async function gymMusclesFor(rows,muscles){const miss=[...new Set((rows||[]).map(r=>r?.[1]).filter(n=>n&&!muscles[n]))];if(!miss.length)return false;try{Object.assign(muscles,(await jsonFetch('/app/api/gym/muscles?names='+encodeURIComponent(JSON.stringify(miss)))).muscles||{});return true;}catch{return false;}}
// The day's results as typed: kept at once, saved after a short pause.
function gymSessionSave(date){
  const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]);upgradeGymOptionsHeader(values);
  gymSaveQueue=gymSaveQueue.catch(()=>{}).then(async()=>{const r=await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:values.slice(7),fullValues:values,date})});if(gymDay()===date){state.gym={...state.gym,history:r.history||state.gym?.history||[]};renderGymHistory(state.gym.history);}});
  return gymSaveQueue.catch(error=>toast('Uložení selhalo: '+error.message));
}
let gymSessionUid=0;
// src: {mode:'plan'|'done'|'draft', date, editable, draft?:{rows,muscles}, back?, changed?}
// A stored day works on state.gym (that day loaded); a proposal on its own rows.
function mountGymSession(host,src){
  const view={swap:null,swapList:null,aiBusy:false,aiNote:'',uid:++gymSessionUid},stored=!src.draft;let timer=null;
  const data=()=>stored?{rows:(state.gym?.values||[]).slice(7),muscles:state.gym?.muscles||(state.gym&&(state.gym.muscles={}))||{},history:state.gym?.history||[]}:{rows:src.draft.rows,muscles:src.draft.muscles,history:state.gym?.history||[]};
  const render=()=>{const d=data();host.innerHTML=gymSessionHtml({...view,rows:d.rows,muscles:d.muscles,mode:src.mode,date:src.date,editable:src.editable,facts:src.facts,records:stored?gymDayRecords(d.rows,d.history,src.date):{}});};
  const ready=async()=>{if(stored&&gymDay()!==src.date){state.gymDate=src.date;await loadGym();}};
  const change=async fn=>{
    if(stored){await ready();clearTimeout(timer);if(!await editGymPlan(fn))return;}
    else{const rows=src.draft.rows.map(r=>r.slice()),out=fn(rows);if(!out)return;src.draft.rows=renumberGymRows(out.rows);}
    render();const d=data();if(await gymMusclesFor(d.rows,d.muscles))render();src.changed?.();
  };
  host.oninput=e=>{const inp=e.target.closest('[data-gs-col]');if(!inp)return;const i=Number(inp.dataset.gsRow),col=Number(inp.dataset.gsCol),rows=stored?null:src.draft.rows;
    const apply=r=>{if(!r)return;r[col]=inp.value.trim();if(col===5||col===6){r[8]=String(r[5]||'').trim()||String(r[6]||'').trim()?'TRUE':'FALSE';const line=inp.closest('.gs-set');line?.classList.toggle('done',r[8]==='TRUE');const ok=line?.querySelector('.gs-ok');if(ok)ok.textContent=r[8]==='TRUE'?'✓':'';}};
    if(!stored)return apply(rows[i]);
    const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]);apply(values[i+7]);state.gym={...state.gym,values};
    clearTimeout(timer);timer=setTimeout(()=>gymSessionSave(src.date),700);};
  host.onchange=e=>{if(stored&&e.target.closest('[data-gs-col]')&&timer){clearTimeout(timer);timer=null;gymSessionSave(src.date);}};
  host.onclick=async e=>{const b=e.target.closest('[data-gs]');if(!b||b.disabled)return;const a=b.dataset.gs,name=b.dataset.name;
    if(a==='video')return openTechnique(name,src.back);
    if(a==='add'){await ready();state.gymPick=item=>change(rows=>addGymExercise(rows,item));return openGymExercisePicker();}
    if(a==='remove'){if(data().rows.some(r=>r[1]===name&&gymRowDone(r))&&!confirm('Odebrat '+name+' i s uloženými sériemi? Zmizí také z historie.'))return;return change(rows=>({rows:rows.filter(r=>r[1]!==name)}));}
    if(a==='add-set')return change(rows=>addGymSet(rows,name));
    if(a==='remove-set')return change(rows=>{const mine=rows.filter(r=>r[1]===name);if(mine.length<2)return null;const last=[...mine].reverse().find(r=>!gymRowDone(r))||mine.at(-1);if(gymRowDone(last)&&!confirm('Odebrat i uloženou sérii? Zmizí také z historie.'))return null;return {rows:rows.filter(r=>r!==last)};});
    if(a==='swap'){view.swap=view.swap===name?null:name;view.swapList=null;render();if(!view.swap)return;
      try{const r=await jsonFetch('/app/api/gym/alternatives?date='+src.date+'&exercise='+encodeURIComponent(name)),inPlan=new Set(data().rows.map(r=>r[1]));view.swapList=(r.alternatives||[]).filter(x=>!inPlan.has(x.name));}catch(error){view.swapList=error.message;}
      if(view.swap===name)render();return;}
    if(a==='alt'){const alt=Array.isArray(view.swapList)?view.swapList[Number(b.dataset.alt)]:null;view.swap=null;view.swapList=null;return change(rows=>swapGymExercise(rows,name,alt));}
  };
  host.onsubmit=async e=>{if(!e.target.matches('[data-gs-ai]'))return;e.preventDefault();const text=e.target.querySelector('input')?.value.trim();if(!text)return;
    view.aiBusy=true;view.aiNote='';render();
    try{const r=await jsonFetch('/app/api/gym/adjust',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:src.date,rows:data().rows,request:text})});
      Object.assign(data().muscles,r.muscles||{});await change(()=>({rows:r.rows.map(x=>x.slice())}));view.aiNote=r.answer||'Trénink je upravený.';}
    catch(error){view.aiNote=error.message;}finally{view.aiBusy=false;render();}
  };
  render();
  if(src.editable&&src.mode!=='done'&&src.date>=localToday())fillMissingLoads();
  async function fillMissingLoads(){
    const names=[...new Set(data().rows.filter(r=>r?.[1]&&gymRowWork(r)&&!gymRowDone(r)&&!String(r[3]??'').trim()).map(r=>r[1]))];if(!names.length)return;
    const est=await gymEstimates(names),found=names.filter(n=>est[n]?.kg!=null);if(!found.length)return;
    const kg=v=>String(Math.round(v*2)/2).replace('.',',');
    await change(rows=>{let n=0;for(const r of rows)if(found.includes(r[1])&&gymRowWork(r)&&!gymRowDone(r)&&!String(r[3]??'').trim()){r[3]=kg(est[r[1]].kg);n++;}
      for(const name of found){const warm=rows.filter(r=>r[1]===name&&!gymRowWork(r)&&!String(r[3]??'').trim());warm.forEach((r,i)=>{r[3]=kg(est[name].kg*(warm.length>1&&i===warm.length-1?.75:.5));});}
      return n?{rows}:null;});
    toast('Doplnil jsem odhad váhy podle tvé historie: '+found.map(n=>n+(est[n].reference&&est[n].reference!==n?' (z '+est[n].reference+')':'')).join(', ')+'.');
  }
  return render;
}
// A planned ride or run drawn like a recommended workout: profile, numbers, steps.
function plannedWorkoutHtml(w,athlete={}){
  const run=w.sport==='run',env=w.environment==='indoor'?'indoor':'outdoor',ftp=run?null:(env==='indoor'?athlete.indoorFtp:athlete.ftp)||athlete.ftp||null;
  const facts=[['Délka',num(w.duration_minutes)?hm(num(w.duration_minutes)):null],['Load',measured(w.target_load)?Math.round(num(w.target_load))+' TSS':null],['IF',num(w.intensity_factor)?dec(w.intensity_factor,2):null],['Obtížnost',measured(w.difficulty)?fmt(w.difficulty,1)+' / 10':null],...(run?[]:[['Kadence',w.cadence||null]]),...(ftp?[[env==='indoor'?'Indoor FTP':'FTP',ftp+' W'+(env==='indoor'&&athlete.indoorFtpEstimated?' · odhad':'')]]:[])].filter(([,v])=>v);
  const rows=w.steps||[],steps=rows.length?(run?stepTableHtml(rows,null,{sport:'run',pace:athlete.runThresholdPace}):stepTableHtml(rows,ftp)):'';
  return workoutProfile(w)+'<dl class="workout-facts">'+facts.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>'+(steps?'<details class="explain-block" open><summary>Rozpis kroků</summary>'+steps+'</details>':'<p class="small">Trénink nemá v Intervals.icu popsanou strukturu kroků.</p>')+(w.description?'<p>'+esc(w.description)+'</p>':'')+(w.environment_notes?.length?'<ul class="env-notes">'+w.environment_notes.slice(0,2).map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':'');
}
// The recorded activity: numbers, route, power and heart rate, intervals.
function activityDetailHtml(result,sport){
  const a=result.activity||{},streams=result.streams||[],run=sport==='run',one=v=>cz(v,1);
  const pace=run&&num(a.distance)>0&&num(a.moving_time)>0?fmtPace(a.moving_time/(a.distance/1000))+' /km':null;
  const stats=[['Čas',num(a.moving_time)?hm(a.moving_time/60):null],['Vzdálenost',num(a.distance)?one(a.distance/1000)+' km':null],['Převýšení',measured(a.total_elevation_gain)?Math.round(a.total_elevation_gain)+' m':null],[run?'Tempo':'Ø výkon',run?pace:num(a.average_watts)?Math.round(a.average_watts)+' W':null],['NP',!run&&num(a.icu_normalized_watts)?Math.round(a.icu_normalized_watts)+' W':null],['Ø tep',num(a.average_heartrate)?Math.round(a.average_heartrate)+' bpm':null],['Max tep',num(a.max_heartrate)?Math.round(a.max_heartrate)+' bpm':null],['Kadence',num(a.average_cadence)?Math.round(a.average_cadence)+(run?' spm':' rpm'):null],['TSS',measured(a.icu_training_load)?Math.round(a.icu_training_load):null],['IF',num(a.icu_intensity)?dec(a.icu_intensity/100,2):null],['Energie',num(a.calories)?Math.round(a.calories)+' kcal':null]].filter(([,v])=>v!=null);
  const route=streams.find(s=>s.type==='latlng')?.points?.length>1?activityRouteSvg(streams.find(s=>s.type==='latlng')):'';
  const chart=(type,color,label,unit)=>streams.find(s=>s.type===type)?.points?.length?activityStreamChart(streams.find(s=>s.type===type),color,label,unit):'';
  return '<div class="activity-sheet"><div class="training-facts">'+stats.map(([l,v])=>'<div><span>'+l+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+route+chart('watts','#83e9c3','Výkon','W')+chart('heartrate','#ff9c97','Tep','bpm')+'<div class="activity-extras">'+activityExtras(result)+'</div></div>';
}
function activityIdOf(a){return a.payload?.id||a.externalId||a.sourceId||String(a.id||'').replace(/^intervals[:_-]/,'');}
// Gym off a day from the week: its strength events go, the plan stays restorable.
async function cancelGymDay(date,button){
  if(!window.confirm('Zrušit gym na '+longDate(date)+'? Plán zůstane uložený a jde obnovit.'))return;
  button.disabled=true;planDataRevision++;
  try{const r=await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,action:'cancel'})});
    for(const days of cachedWeeks())for(const d of days)if(d.date===date&&d.daily?.training)d.daily.training.planned=(d.daily.training.planned||[]).filter(p=>activitySport(p)!=='gym');
    if(gymDay()===date)state.gym={...state.gym,cancelled:true,recoverable:true,values:[]};
    closeSheet();renderWeekHub();toast(r.message);await refreshAfterPlanChange();
  }catch(error){toast(error.message);button.disabled=false;}
}
// Planned workout structures are fetched once in the background when the week
// is drawn, so a detail opens with its steps already there.
const plannedDetails=new Map();
function plannedDetail(id){
  const hit=plannedDetails.get(id);if(hit&&Date.now()-hit.at<10*60000)return hit.promise;
  const entry={at:Date.now(),done:false};entry.promise=jsonFetch('/app/api/workouts/planned?id='+encodeURIComponent(id)).then(r=>{entry.done=true;return r;},e=>{plannedDetails.delete(id);throw e;});plannedDetails.set(id,entry);return entry.promise;
}
const plannedDetailReady=id=>Boolean(plannedDetails.get(id)?.done);
function prefetchPlannedDetails(){
  const ids=(hubDays()||state.week?.days||[]).filter(d=>d.date>=localToday()).flatMap(d=>(d.daily?.training?.planned||[]).filter(p=>/^planned:/.test(String(p.id||''))&&['ride','run'].includes(activitySport(p))).map(p=>p.id)).filter(id=>!plannedDetails.has(id)).slice(0,8);
  ids.forEach((id,i)=>setTimeout(()=>plannedDetail(id).catch(()=>{}),300*i));
}
function plannedPlace(item){return /Virtual|Indoor|Treadmill/i.test(String(item.type||''))||/\bindoor\b|trenaž|trenaz|zwift|treadmill|běžecký pás/i.test(String(item.name||''))?'indoor':'outdoor';}
async function switchPlannedPlace(entry,button){
  const item=entry.item,environment=button.dataset.env;button.disabled=true;
  try{const r=await jsonFetch('/app/api/planned/environment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:item.id,environment})});
    item.type=r.type;plannedDetails.delete(item.id);
    toast((environment==='indoor'?'Uvnitř':'Venku')+' · změna je v Intervals.icu.');openTrainingDetail(entry);refreshAfterPlanChange().catch(()=>{});
  }catch(error){toast(error.message);button.disabled=false;}
}
async function openTrainingDetail(entry){
  state.openDetail={date:entry.date,sport:entry.sport||'gym'};
  const {kind,date,sport='gym'}=entry,today=localToday(),title=HUB_SPORTS[sport]+' · '+longDate(date);
  // A strength session (planned, done, or a plan in Intervals.icu) opens as one
  // view: the figure, every set with the warm-up, video, records and its changes.
  if(kind==='gym'||sport==='gym'&&(kind==='planned'||kind==='done')){
    const event=kind==='planned'?entry.item:null,finished=Boolean(entry.done||kind==='done'||date<today);
    const sheet=openSheet(title,'<p class="small">Načítám gym…</p>',null,'training-detail'),current=()=>sheetStill(sheet);
    try{state.gymDate=date;await loadGym();if(!current())return;
      const values=state.gym?.values||[],stored=values.slice(7).some(r=>r?.[1]),name=values[2]?.[3]||event?.name||'';
      // Saved sets without the day's plan (older imports) are shown as they are.
      const fresh=(state.gym?.history||[]).filter(r=>String(r.workout_date||'').slice(0,10)===date);
      const legacy=!stored&&fresh.length?fresh.map(r=>['WORK',r.exercise,String(r.set_no??''),gsKg(r.planned_kg),String(r.planned_reps??''),gsKg(r.actual_kg),String(r.actual_reps??''),'','TRUE','','',r.toFailure?'TRUE':'FALSE',r.superset||'']):null;
      const minutes=num((event||entry.item)?.durationHours)*60,facts=minutes>0?[['Délka',hm(minutes)]]:[];
      const head='<div class="eyebrow">'+(finished?'Odcvičeno · plán a skutečnost':'Naplánovaný gym')+'</div>'+(name?'<h4 class="training-name">'+esc(name)+'</h4>':'')+(!finished&&stored?'<button type="button" class="btn primary gs-mode" data-td="gym-mode">▶ Režim tréninku</button>':'');
      // Workout mode and cancelling belong to the session itself; moving is a drag in the week.
      const actions='<div class="training-actions">'+(!finished&&date>=today&&(stored||event)?'<button type="button" class="btn sheet-danger" data-td="gym-cancel">Zrušit trénink</button>':'')+'</div>'+(!finished&&date>=today?'<p class="small">Na jiný den ho přesuneš tažením v týdnu (na mobilu podrž a táhni).</p>':'');
      if(!stored&&!legacy&&event?.description)$('sheetBody').innerHTML=head+'<h4>Plán</h4>'+workoutPlanHtml(event.description)+actions;
      else{
        $('sheetBody').innerHTML=head+'<div class="gs-host"></div>'+actions;const host=$('sheetBody').querySelector('.gs-host'),back=()=>openTrainingDetail(entry);
        if(legacy){host.innerHTML=gymSessionHtml({rows:legacy,muscles:state.gym?.muscles||{},mode:'done',date,editable:false,facts,records:gymDayRecords(legacy,state.gym?.history||[],date)});host.onclick=e=>{const b=e.target.closest('[data-gs="video"]');if(b)openTechnique(b.dataset.name,back);};}
        else mountGymSession(host,{mode:finished?'done':'plan',date,editable:finished||date>=today,facts,back,changed:()=>reloadWeek()});
      }
    }catch(error){$('sheetBody').innerHTML='<p>'+esc(error.message)+'</p>';}
    $('sheetBody').onclick=async e=>{
      const b=e.target.closest('[data-td]');if(!b)return;const a=b.dataset.td;
      if(a==='gym-cancel')return cancelGymDay(date,b);
      if(a==='gym-mode'){closeSheet();await openGymDay(date,false);openGymMode();}
    };
    return;
  }
  const item=entry.item,plan=kind==='done'?entry.plan:item,env=activityEnvironmentBadge(item,sport);
  let body='<div class="eyebrow">'+(kind==='done'?'Hotovo':item.pending?'Ukládám do Intervals.icu…':'Naplánováno')+'</div><h4 class="training-name">'+esc(item.name||'Trénink')+env+'</h4>';
  if(kind==='done'){
    body+=plan?planVerdict(plan,item)+compareTableHtml([['Délka',num(plan.durationHours)*60||null,num(item.durationHours)*60||null,hm],['TSS',measured(plan.tss)?num(plan.tss):null,measured(item.tss)?num(item.tss):null,v=>fmt(v)],['IF',intensityOf(plan.tss,num(plan.durationHours)*60),intensityOf(item.tss,num(item.durationHours)*60),v=>dec(v,2)]])+'<details class="training-plan"><summary>Plán „'+esc(plan.name||'trénink')+'“</summary>'+workoutPlanHtml(plan.description)+'</details>':trainingFacts(item,sport);
    body+='<div id="tdActivity"><p class="small">Načítám záznam aktivity…</p></div>';
  }else{
    body+='<div id="tdPlan">'+trainingFacts(item,sport)+(/^planned:/.test(String(item.id||''))?'<p class="small">'+(plannedDetailReady(item.id)?'':'Načítám strukturu tréninku…')+'</p>':'<h4>Plán</h4>'+workoutPlanHtml(item.description))+'</div>';
    if(entry.editable&&date>=today&&['ride','run'].includes(sport)&&/^planned:/.test(String(item.id||''))){const place=plannedPlace(item);body+='<div class="env-toggle" role="group" aria-label="Kde trénink absolvuješ"><span class="small">Kde</span>'+[['outdoor','Venku'],['indoor','Uvnitř']].map(([v,l])=>'<button type="button" class="btn'+(place===v?' selected':'')+'" data-td="env" data-env="'+v+'" aria-pressed="'+(place===v)+'">'+l+'</button>').join('')+'</div>';}
    if(entry.editable&&date>=today)body+='<div class="training-actions"><button type="button" class="btn" data-td="swap">Vyměnit za jiný</button><button type="button" class="btn sheet-danger" data-td="delete">Zrušit trénink</button></div><p class="small">Na jiný den ho přesuneš tažením v týdnu (na mobilu podrž a táhni).</p>';
    else if(entry.editable)body+='<p class="small">Minulý trénink už nejde přesunout ani zrušit.</p>';
  }
  const sheet=openSheet(title,body,el=>{el.onclick=e=>{
    const b=e.target.closest('[data-td]');if(!b)return;const a=b.dataset.td;
    if(a==='delete'){closeSheet();return deletePlanned(item.id,item.name);}
    if(a==='env'){if(b.getAttribute('aria-pressed')==='true')return;return switchPlannedPlace(entry,b);}
    if(a==='swap'){closeSheet();state.replaceEvent={id:item.id,name:item.name,date};return openChipSuggestion({date,sport,minutes:num(item.durationHours)*60?Math.round(num(item.durationHours)*60):null,env:/indoor|virtual|trainer|pás|treadmill/i.test(String(item.type||'')+' '+String(item.name||''))?'indoor':'outdoor'});}
  };},'training-detail'),current=()=>sheetStill(sheet);
  // The plan's structure and the recorded activity load after the sheet is open.
  if(kind!=='done'&&/^planned:/.test(String(item.id||''))){
    try{const r=await plannedDetail(item.id);if(current()&&$('tdPlan'))$('tdPlan').innerHTML=plannedWorkoutHtml({...r.workout,name:item.name},r.athlete);}
    catch{if(current()&&$('tdPlan'))$('tdPlan').innerHTML=trainingFacts(item,sport)+'<h4>Plán</h4>'+workoutPlanHtml(item.description);}
  }
  if(kind==='done'){
    const box=()=>current()?$('tdActivity'):null;
    if(item.source&&item.source!=='intervals'){const m=item.payload?.exercise?.metricsSummary||{},hr=item.payload?.average_heartrate??item.averageHeartRate;if(box())box().innerHTML='<div class="training-facts">'+[['Čas',hm(num(item.durationHours)*60)],['Ø tep',measured(hr)?Math.round(hr)+' bpm':null],['Energie',measured(item.calories)?Math.round(item.calories)+' kcal':null],['Kroky',measured(m.steps)?fmt(m.steps):null]].filter(([,v])=>v).map(([l,v])=>'<div><span>'+l+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div><p class="small">Zdroj poskytuje jen souhrn aktivity, ne průběh výkonu ani trasu.</p>';return;}
    try{const result=await jsonFetch('/app/api/activity-detail?id='+encodeURIComponent(activityIdOf(item)));if(box())box().innerHTML=activityDetailHtml(result,sport);}
    catch(error){if(box())box().innerHTML='<p class="small">'+esc(error.message)+'</p>';}
  }
}
// A session dragged to another day. A gym takes its plan chip along, so the
// old day does not get a new gym generated in its place.
function moveHubItem(item,to){
  const from=item.closest('[data-hub-day]')?.dataset.hubDay;if(!from||from===to)return;
  if(item.dataset.sport==='gym')followGymChip(from,to);
  if(item.dataset.gymDate)return moveLocalGym(from,to);
  movePlanned(item.dataset.eventId,to,item.dataset.name);
}
function followGymChip(from,to){
  const start=state.weekPlan?.start||state.hubWeek,days=state.weekPlan?.prefs?.days;if(!start||!days)return;
  const a=weekdayOf(from),b=weekdayOf(to);if(dateShift(start,a)!==from||dateShift(start,b)!==to)return;
  const i=days[a].indexOf('gym');if(i<0||days[b].includes('gym'))return;
  if(state.proposals){const pa=state.proposals[proposalKey(from,'gym',0)];delete state.proposals[proposalKey(from,'gym',0)];if(pa)state.proposals[proposalKey(to,'gym',0)]=pa;}
  plannerPlace('gym',b,a,i,0);
}
async function moveLocalGym(from,to){
  try{await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:from,action:'move',to})});
    if(gymDay()===from)state.gymDate=to;toast('Gym je na '+longDate(to)+'.');}
  catch(error){toast(error.message);}
  await reloadWeek();
}
function installPlannedEditing(){
  const week=$('hubWeek');let dragged=null;
  // The week re-renders on a drop, so the dragged node may never see dragend:
  // every new drag starts clean.
  week.addEventListener('dragstart',e=>{const item=e.target.closest('.hub-item.editable');dragged=null;if(!item||e.target.closest('.planner-chip'))return;dragged=item;item.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.dataset.eventId);});
  week.addEventListener('dragend',()=>{dragged?.classList.remove('dragging');dragged=null;week.querySelectorAll('.drop-target').forEach(d=>d.classList.remove('drop-target'));});
  week.addEventListener('dragover',e=>{const day=e.target.closest('[data-hub-day]');if(!dragged||!day||day.dataset.hubDay<localToday())return;e.preventDefault();e.dataTransfer.dropEffect='move';week.querySelectorAll('.drop-target').forEach(d=>{if(d!==day)d.classList.remove('drop-target')});day.classList.add('drop-target');});
  week.addEventListener('dragleave',e=>{const day=e.target.closest('[data-hub-day]');if(day&&!day.contains(e.relatedTarget))day.classList.remove('drop-target');});
  week.addEventListener('drop',e=>{const day=e.target.closest('[data-hub-day]');if(!dragged||!day)return;e.preventDefault();day.classList.remove('drop-target');const item=dragged;dragged=null;if(item.closest('[data-hub-day]')===day)return;moveHubItem(item,day.dataset.hubDay);});
  // Phones have no drag and drop: hold a planned session for a moment, then
  // drag it to another day (the page does not scroll while it is held).
  let hold=null,suppressClickUntil=0;
  const clearTargets=()=>week.querySelectorAll('.drop-target').forEach(d=>d.classList.remove('drop-target'));
  const dayAt=t=>{const day=document.elementFromPoint(t.clientX,t.clientY)?.closest('[data-hub-day]');return day&&week.contains(day)&&day.dataset.hubDay>=localToday()?day:null;};
  week.addEventListener('touchstart',e=>{const item=e.target.closest('.hub-item.editable');if(!item||e.touches.length!==1||e.target.closest('button,a,.planner-chip'))return;const t=e.touches[0];
    hold={item,x:t.clientX,y:t.clientY,active:false,timer:setTimeout(()=>{if(hold?.item!==item)return;hold.active=true;item.classList.add('dragging');navigator.vibrate?.(15);},380)};},{passive:true});
  week.addEventListener('touchmove',e=>{if(!hold)return;const t=e.touches[0];
    if(!hold.active){if(Math.hypot(t.clientX-hold.x,t.clientY-hold.y)>10){clearTimeout(hold.timer);hold=null;}return;}
    e.preventDefault();clearTargets();dayAt(t)?.classList.add('drop-target');
    if(t.clientY<90)window.scrollBy(0,-14);else if(t.clientY>innerHeight-110)window.scrollBy(0,14);},{passive:false});
  const endHold=(e,cancelled)=>{if(!hold)return;const h=hold;hold=null;clearTimeout(h.timer);h.item.classList.remove('dragging');clearTargets();if(!h.active)return;
    suppressClickUntil=Date.now()+600;if(e.cancelable)e.preventDefault();if(cancelled)return;
    const day=dayAt(e.changedTouches[0]);if(day&&h.item.closest('[data-hub-day]')!==day)moveHubItem(h.item,day.dataset.hubDay);};
  week.addEventListener('touchend',e=>endHold(e));week.addEventListener('touchcancel',e=>endHold(e,true));
  week.addEventListener('contextmenu',e=>{if(e.target.closest('.hub-item.editable')&&(hold||Date.now()<suppressClickUntil))e.preventDefault();});
  const open=item=>{const entry=state.hubDetails?.[Number(item.dataset.detail)];if(entry?.kind==='recovery')openRecoverySheet(entry.id);else if(entry)openTrainingDetail(entry);};
  week.addEventListener('click',e=>{
    if(state.plannerPick||Date.now()<suppressClickUntil)return;
    const item=e.target.closest('.hub-item[data-detail]');if(item&&!e.target.closest('a,button,select,input'))open(item);
  });
  week.addEventListener('keydown',e=>{const item=e.target.closest('.hub-item[data-detail]');if(item&&e.target===item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open(item);}});
  $('scheduledWorkouts').addEventListener('click',e=>{const b=e.target.closest('[data-delete-event]');if(b)deletePlanned(b.dataset.deleteEvent,b.dataset.name);});
}
installWorkoutsHub();

// ---- Fitness insights: muscle freshness & load, cardio focus, records, timeline ----
const MUSCLE_LABELS=uiTable({chest:'Hrudník',upper_back:'Horní záda',lats:'Široký zádový',front_delts:'Přední ramena',side_delts:'Boční ramena',rear_delts:'Zadní ramena',biceps:'Biceps',triceps:'Triceps',abs:'Břicho',obliques:'Šikmé břišní',quads:'Přední stehna',hamstrings:'Zadní stehna',hips:'Hýždě a kyčle',calves:'Lýtka',forearms:'Předloktí',traps:'Trapézy',lower_back:'Spodní záda'},{chest:'Chest',upper_back:'Upper back',lats:'Lats',front_delts:'Front delts',side_delts:'Side delts',rear_delts:'Rear delts',biceps:'Biceps',triceps:'Triceps',abs:'Abs',obliques:'Obliques',quads:'Quads',hamstrings:'Hamstrings',hips:'Glutes and hips',calves:'Calves',forearms:'Forearms',traps:'Traps',lower_back:'Lower back'});
const FRESH_LABEL=uiTable({recovered:'Zotavené',fatigued:'Unavené',depleted:'Vyčerpané',calibrating:'Kalibruji'},{recovered:'Recovered',fatigued:'Fatigued',depleted:'Depleted',calibrating:'Calibrating'});
const LOAD_LABEL=uiTable({detraining:'Detrénink',maintaining:'Udržování',productive:'Produktivní',peaking:'Vrchol formy',overtraining:'Přetížení',calibrating:'Kalibruji'},{detraining:'Detraining',maintaining:'Maintaining',productive:'Productive',peaking:'Peaking',overtraining:'Overreaching',calibrating:'Calibrating'});
function freshColor(x){if(!x||x.freshness==null)return 'color-mix(in srgb,var(--muted) 42%,var(--bg))';const f=x.freshness;if(f>=75)return '#3fda9c';if(f>=55)return '#d9d45a';if(f>=35)return '#ffa64d';return '#ff6478'}
function paintMuscleMap(root,fresh){root.querySelectorAll('[data-muscle]').forEach(el=>{const x=fresh?.[el.dataset.muscle];el.style.setProperty('--fresh-fill',freshColor(x));const t=document.createElementNS('http://www.w3.org/2000/svg','title');t.textContent=(MUSCLE_LABELS[el.dataset.muscle]||el.dataset.muscle)+' · '+(x?.freshness==null?uiText('kalibruji (potřebuji 3 tréninkové dny)','calibrating (needs 3 training days)'):x.freshness+' % · '+FRESH_LABEL[x.status]);el.querySelector('title')?.remove();el.appendChild(t);});}
function loadGauge(o){
  const max=Math.max(10,o.range[1]*1.45,o.acute*1.1),a=v=>Math.PI*(1-Math.min(1,Math.max(0,v/max))),pt=(v,r)=>[100+r*Math.cos(a(v)),100-r*Math.sin(a(v))];
  const arc=(v1,v2,r)=>{const [x1,y1]=pt(v1,r),[x2,y2]=pt(v2,r);return 'M'+x1.toFixed(1)+' '+y1.toFixed(1)+' A'+r+' '+r+' 0 0 1 '+x2.toFixed(1)+' '+y2.toFixed(1)};
  const [mx,my]=pt(o.acute,80);
  return uiText('<svg class="load-gauge" viewBox="0 0 200 118" role="img" aria-label="Svalová zátěž ', '<svg class="load-gauge" viewBox="0 0 200 118" role="img" aria-label="Muscle load ')+o.acute+', optimum '+o.range[0]+'–'+o.range[1]+'"><path d="'+arc(0,max,80)+'" stroke="color-mix(in srgb,var(--cyan) 19%,var(--bg))" stroke-width="12" fill="none" stroke-linecap="round"/><path d="'+arc(o.range[0],o.range[1],80)+'" stroke="#3fda9c" stroke-width="12" fill="none"/><circle cx="'+mx.toFixed(1)+'" cy="'+my.toFixed(1)+'" r="9" fill="#64d2ff" stroke="color-mix(in srgb,var(--violet) 3%,var(--bg))" stroke-width="3"/><text x="100" y="96" text-anchor="middle" fill="var(--text)" font-size="34" font-weight="800">'+o.acute+'</text><text x="100" y="114" text-anchor="middle" fill="color-mix(in srgb,var(--muted) 94%,var(--bg))" font-size="10">7 dní · optimum '+o.range[0]+'–'+o.range[1]+'</text></svg>';
}
function sparkBars(series,color){const max=Math.max(1,...series.map(x=>x.load));return '<svg class="spark-bars" viewBox="0 0 420 60" preserveAspectRatio="none" role="img" aria-label="Svalová zátěž za 42 dní">'+series.map((x,i)=>'<rect x="'+(i*10)+'" y="'+(58-x.load/max*54).toFixed(1)+'" width="7" height="'+(x.load/max*54).toFixed(1)+'" rx="2" fill="'+color+'"><title>'+esc(dateLabel(x.date))+' · '+x.load+'</title></rect>').join('')+'</svg>'}
// Records with their progress over a chosen period: the last 1 (default), 3
// or 6 months, a calendar year, or all data in the app. Blocks without data
// for the period (no rides, no power meter, no runs) are left out.
function prPeriod(t){let v=null;try{v=localStorage.getItem('pfd-pr-period');}catch{}return t?.periods?.[v]?v:t?.defaultPeriod||'1m'}
function trendBadge(change,{unit='',lowerIsBetter=false,format=v=>cz(Math.abs(v),1)}={}){
  if(!change)return '';
  const d=change.delta,good=lowerIsBetter?d<0:d>0,arrow=d>0?'↑':d<0?'↓':'=',sign=d>0?'+':d<0?'−':'';
  const from=(lowerIsBetter?fmtPaceText(change.from):String(change.from).replace('.',',')+(unit?' '+unit:''))+' ('+dateLabel(change.fromDate)+(change.basis==='first'?', první záznam v období':'')+')';
  return '<span class="trend '+(d===0?'flat':good?'up':'down')+'" title="Proti '+esc(from)+'">'+arrow+(d?' '+sign+format(d)+(unit?' '+unit:''):'')+'</span>';
}
function fmtPaceText(sec){sec=Math.round(Math.abs(Number(sec)));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')}
function prPeriodControls(t,key){
  const periods=Object.entries(t.periods||{}),months=periods.filter(([,p])=>p.kind==='months'),years=periods.filter(([,p])=>p.kind==='year'),all=t.periods?.all,kind=t.periods?.[key]?.kind;
  // An inactive select shows its name, so picking its first option still changes the period.
  const select=(list,name,label)=>{const on=list.some(([k])=>k===key);return '<select class="pr-select'+(on?' active':'')+'" data-pr-select aria-label="'+label+'">'+(on?'':'<option value="" selected disabled hidden>'+name+'</option>')+list.map(([k,p])=>'<option value="'+k+'"'+(k===key?' selected':'')+'>'+esc(p.label)+'</option>').join('')+'</select>';};
  return '<div class="pr-period" role="group" aria-label="Období rekordů">'+select(months,'Měsíce','Posledních měsíců')+select(years,'Rok','Rok')+(all?'<button type="button" class="btn'+(kind==='all'?' primary':'')+'" data-pr-period="all" aria-pressed="'+(kind==='all')+uiText('" title="Všechna data uložená v aplikaci od ', '" title="All data saved in the app since ')+esc(dateFormat({day:'numeric',month:'numeric',year:'numeric'}).format(new Date(all.start+'T12:00:00Z')))+'">Vše</button>':'')+'</div>';
}
function recordsCardHtml(rec){
  const t=rec.trends||{},key=prPeriod(t),period=t.periods?.[key],c=t.cardio||{},at=m=>m?.change?.[key]||null;
  const rows=(t.strength||[]).map(x=>({x,ch:at(x)})).filter(r=>r.ch).slice(0,10);
  const tile=(icon,label,value,badge,date)=>'<div><span>'+icon+'</span><strong>'+value+'</strong>'+badge+'<small>'+esc(label)+' · '+esc(dateLabel(date))+'</small></div>';
  // Two rows: the bike (FTP, longest ride, most climbing), then the run (pace, longest run).
  const distance=k=>at(c[k])&&at(c[k]).value>0?tile({longestRide:'🚴',mostElevation:'⛰',longestRun:'🏃'}[k],{longestRide:uiText('Nejdelší jízda','Longest ride'),mostElevation:uiText('Nejvíc převýšení','Most climbing'),longestRun:uiText('Nejdelší běh','Longest run')}[k],cz(at(c[k]).value,1)+' '+c[k].unit,trendBadge(at(c[k]),{unit:c[k].unit}),at(c[k]).date):'';
  const ride=[at(c.ftp)&&at(c.longestRide)?tile('⚡','FTP',fmt(at(c.ftp).value)+' W',trendBadge(at(c.ftp),{unit:'W',format:v=>fmt(Math.abs(v))}),at(c.ftp).date):'',distance('longestRide'),distance('mostElevation')].filter(Boolean);
  const run=[at(c.runPace)?tile('⏱',uiText('Nejrychlejší běh 5 km+','Fastest run 5 km+'),fmtPaceText(at(c.runPace).value)+' /km',trendBadge(at(c.runPace),{lowerIsBetter:true,format:v=>fmtPaceText(v)}),at(c.runPace).date):'',distance('longestRun')].filter(Boolean);
  const tiles=[ride,run].filter(r=>r.length).map(r=>'<div class="pr-cardio">'+r.join('')+'</div>');
  const day=d=>dateFormat({day:'numeric',month:'numeric',year:'numeric'}).format(new Date(d+'T12:00:00Z')),span=period?(period.kind==='all'?uiText('Všechna data v aplikaci od ','All data in the app since ')+day(period.start):period.kind==='year'?uiText('Rok ','Year ')+period.label:uiText('Od ','From ')+day(period.start)+uiText(' do dneška',' to today')):'';
  return '<article class="card insight-records"><div class="detail-heading"><div><div class="label">Výkonnost</div><h3>Osobní rekordy'+infoTip('records','osobní rekordy')+'</h3><p class="small pr-span">'+esc(span)+'</p></div>'+prPeriodControls(t,key)+'</div>'+
    (rows.length?'<div class="scroll"><table class="pr-table"><thead><tr><th>Cvik</th><th>Max. váha</th><th>Datum</th><th>Změna</th></tr></thead><tbody>'+rows.map(({x,ch})=>'<tr><td>'+esc(x.exercise)+'</td><td>'+cz(ch.value,1)+' kg'+(ch.reps?' <span class="small">× '+ch.reps+'</span>':'')+'</td><td>'+esc(dateLabel(ch.date))+'</td><td>'+(trendBadge(ch,{unit:'kg'})||'—')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="small">V tomto období žádné série s váhou.</p>')+
    tiles.join('')+'</article>';
}
function renderFitnessInsights(){
  const box=$('fitnessInsights'),r=state.insights;if(!box)return;
  if(!r||r.status!=='ok'){box.innerHTML='<div class="notice">'+esc(r?.message||'Načítám svaly, zátěž a rekordy…')+'</div>';return}
  const fresh=r.muscles.freshness,load=r.muscles.load.overall,cf=r.cardioFocus,rec=r.records;
  const calibrated=Object.entries(fresh).filter(([,x])=>x.freshness!=null).sort((a,b)=>a[1].freshness-b[1].freshness);
  const overall=calibrated.length?Math.round(calibrated.reduce((s,[,x])=>s+x.freshness,0)/calibrated.length):null;
  box.innerHTML='<div class="insight-grid">'+
    '<article class="card insight-fresh"><div class="detail-heading"><div><div class="label">Posilovna i sport</div><h3>Zotavení svalů</h3></div><span class="pill">'+(overall==null?'Kalibruji':'Celkem '+overall+' %')+'</span></div><div class="fresh-layout"><div id="freshMap"></div><div class="fresh-list">'+(calibrated.length?calibrated.map(([m,x])=>'<div class="fresh-row"><span>'+esc(MUSCLE_LABELS[m])+'</span><span class="fresh-bar"><i style="width:'+x.freshness+'%;background:'+freshColor(x)+'"></i></span><strong>'+x.freshness+' %</strong><small>'+FRESH_LABEL[x.status]+'</small></div>').join(''):'<p class="small">Každá partie potřebuje aspoň 3 tréninkové dny se zátěží.</p>')+(Object.values(fresh).some(x=>x.freshness==null)?uiText('<p class="small">Šedé partie se kalibrují: ', '<p class="small">Grey muscle groups are calibrating: ')+Object.entries(fresh).filter(([,x])=>x.freshness==null).map(([m])=>MUSCLE_LABELS[m]).join(', ')+'.</p>':'')+'</div></div><div class="fresh-legend"><span><i style="background:#3fda9c"></i>Zotavené ≥ 75 %</span><span><i style="background:#ffa64d"></i>Unavené 35–75 %</span><span><i style="background:#ff6478"></i>Vyčerpané &lt; 35 %</span><span><i style="background:color-mix(in srgb,var(--muted) 42%,var(--bg))"></i>Kalibruji</span></div></article>'+
    '<article class="card insight-load"><div class="label">7 dní proti 6 týdnům</div><h3>Svalová zátěž'+infoTip('muscleLoad','svalová zátěž')+'</h3>'+loadGauge(load)+'<div class="load-status '+esc(load.status)+'">'+esc(LOAD_LABEL[load.status])+'</div>'+(load.status==='calibrating'?'<p class="small">Pro stav potřebuji aspoň 10 tréninkových dní za 6 týdnů.</p>':'')+sparkBars(load.series,'#a978ff')+(()=>{const off=Object.entries(r.muscles.load.perMuscle).filter(([,x])=>x.status==='detraining'||x.status==='overtraining');return off.length?'<div class="load-muscles"><span class="small">Mimo produktivní pásmo:</span>'+off.map(([m,x])=>'<span class="pill load-'+x.status+'">'+esc(MUSCLE_LABELS[m])+' · '+(x.status==='overtraining'?uiText('přetížené','overloaded'):uiText('podtrénované','undertrained'))+'</span>').join('')+'</div>':''})()+'</article>'+
    '<article class="card insight-cardio"><div class="label">Kardio · '+cf.days+' dní</div><h3>Kam míří kardio trénink'+infoTip('cardioPoints','kardio body')+'</h3>'+(cf.points?'<div class="focus-bar"><i class="low" style="width:'+cf.percent.low+'%"></i><i class="high" style="width:'+cf.percent.high+'%"></i><i class="anaerobic" style="width:'+cf.percent.anaerobic+'%"></i></div><div class="focus-legend"><div><b>'+cf.percent.low+' %</b><span><i class="low"></i>Lehká aerobní · Z1–Z2</span></div><div><b>'+cf.percent.high+' %</b><span><i class="high"></i>Tvrdá aerobní · Z3–Z4</span></div><div><b>'+cf.percent.anaerobic+' %</b><span><i class="anaerobic"></i>Anaerobní · Z5+</span></div></div><div class="focus-weeks">'+cf.weeks.map((w,i)=>{const t=w.low+w.high+w.anaerobic||1;return '<div><span class="focus-week" style="--h:'+Math.min(100,t/Math.max(1,...cf.weeks.map(x=>x.low+x.high+x.anaerobic))*100)+'%"><i class="anaerobic" style="height:'+w.anaerobic/t*100+'%"></i><i class="high" style="height:'+w.high/t*100+'%"></i><i class="low" style="height:'+w.low/t*100+'%"></i></span><small>'+(i===3?uiText('Tento týden','This week'):(3-i)+uiText(' týd. zpět',' wk ago'))+'</small></div>'}).join('')+'</div><p class="small">'+cf.activities+uiText(' aktivit · ', ' activities · ')+hm(cf.minutes)+uiText(' v zónách · ', ' in zones · ')+fmt(cf.points)+uiText(' kardio bodů.</p>', ' cardio points.</p>'):uiText('<div class="data-gap">Aktivity za ', '<div class="data-gap">Activities from the last ')+cf.days+uiText(' dní nemají časy v zónách.</div>', ' days have no time in zones.</div>'))+'</article>'+
    recordsCardHtml(rec)+
  '</div>';
  const map=$('freshMap');map.appendChild($('muscleMapTemplate').content.cloneNode(true));paintMuscleMap(map,fresh);
  // The gym builder figure shows the same freshness behind the selection.
  const builder=document.querySelector('#workoutsGym .gym-figures');if(builder){paintMuscleMap(builder,fresh);if(!$('gymFreshLegend'))builder.insertAdjacentHTML('afterend','<div class="fresh-legend" id="gymFreshLegend"><span><i style="background:#3fda9c"></i>Zotavené</span><span><i style="background:#ffa64d"></i>Unavené</span><span><i style="background:#ff6478"></i>Vyčerpané</span><span><i style="background:color-mix(in srgb,var(--muted) 42%,var(--bg))"></i>Kalibruji</span></div>');}
}
// Period of the records: the Vše button or the month / year selects.
function setPrPeriod(key,from){try{localStorage.setItem('pfd-pr-period',key);}catch{}const card=from.closest('.insight-records');if(card&&state.insights?.records)card.outerHTML=recordsCardHtml(state.insights.records);}
document.addEventListener('click',e=>{const b=e.target.closest('[data-pr-period]');if(b)setPrPeriod(b.dataset.prPeriod,b);});
document.addEventListener('change',e=>{const sel=e.target.closest('[data-pr-select]');if(sel&&sel.value)setPrPeriod(sel.value,sel);});
async function loadInsights(){try{state.insights=await jsonFetch('/app/api/fitness-insights');}catch(error){state.insights={status:'error',message:'Svaly a rekordy se nepodařilo načíst: '+error.message};}renderFitnessInsights();}

// Day timeline: sleep, activities, planned workouts and meals in one order.
function renderDayTimeline(){
  const el=$('dayTimeline');if(!el)return;
  // A time without a zone is already local (Prague); one with a zone is converted.
  const date=selectedHistoryDate,clock=v=>{const local=String(v||'').match(/T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);if(local)return local[1];const d=new Date(v);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('cs-CZ',{timeZone:USER_TZ,hour:'2-digit',minute:'2-digit'}).format(d)};
  // Each source is drawn on its own: one bad record must not empty the whole day.
  const items=[],add=(source,fn)=>{try{fn();}catch(error){console.error('Timeline: '+source,error);}};
  add('sleep',()=>{const night=primarySleepSessions(state.sleep?.sessions).find(s=>(s.date||String(s.endTime||'').slice(0,10))===date);
  if(night)items.push({t:night.endTime,icon:'🌙',cls:'sleep',title:'Spánek · '+hm(night.durationMin),meta:clock(night.startTime)+' – '+clock(night.endTime)+(measured(night.stages?.DEEP)?' · hluboký '+hm(night.stages.DEEP)+' · REM '+hm(night.stages.REM):'')});});
  const t=state.daily?.training||{};
  add('activities',()=>{for(const a of (t.completed||[]).filter(x=>!isNutritionItem(x))){const hr=a.payload?.average_heartrate??a.averageHeartRate;const kind=activitySport(a)||(/walk|hike|chůze|procház/i.test(String(a.type)+' '+String(a.name))?'walk':'other');items.push({t:a.start,kind,icon:{ride:'🚴',run:'🏃',gym:'🏋️'}[kind]||'🚶',cls:'activity',title:a.name||a.type||'Aktivita',meta:clock(a.start)+' · '+hm(num(a.durationHours)*60)+(measured(a.tss)?' · TSS '+fmt(a.tss):'')+(measured(hr)?' · Ø '+fmt(hr)+' bpm':'')+activityEnergyLabel(a)});}});
  // Walks, runs and other sessions the day view leaves out (it lists Intervals.icu
  // rides and Google Health exercises) come from the full activity list.
  add('other activities',()=>{const shown=items.filter(x=>x.cls==='activity').map(x=>({kind:x.kind,at:Date.parse(date+'T'+(clock(x.t)||'00:00')+':00Z')}));
    for(const row of state.activities?.activities||[]){if(!['activity','exercise'].includes(row.data_type)||row.record_role==='duplicate')continue;const a=activityRow(row);if(!a||localDay(a.start)!==date)continue;
      const at=Date.parse(date+'T'+(clock(a.start)||'00:00')+':00Z');if(shown.some(x=>x.kind===a.kind&&Math.abs(x.at-at)<=20*60000))continue;shown.push({kind:a.kind,at});
      items.push({t:a.start,kind:a.kind,icon:{ride:'🚴',run:'🏃',gym:'🏋️',walk:'🚶'}[a.kind]||'•',cls:'activity',title:a.name,meta:clock(a.start)+(a.minutes?' · '+hm(a.minutes):'')+(measured(a.tss)?' · TSS '+fmt(a.tss):'')});}});
  add('planned',()=>{const paired=new Set((t.matched||[]).map(m=>String(m.planned?.id||'')));
  for(const p of (t.planned||[]).filter(x=>!isNutritionItem(x)&&!paired.has(String(x.id||''))))items.push({t:/T(?!00:00)\d{2}:\d{2}/.test(String(p.start||''))?p.start:date+'T23:59',icon:'⏳',cls:'planned',title:'Plán · '+(p.name||'Trénink'),meta:(p.durationHours?hm(num(p.durationHours)*60):'')+(measured(p.tss)?' · TSS '+fmt(p.tss):'')});});
  // Foods logged for the same meal are one group with summed macros.
  add('food',()=>{const groups=new Map();for(const e of (mealEntries||[]).filter(e=>(e.consumed_date||date)===date)){const slot=foodMealSlot(e),key=slot+'|'+(slot==='unassigned'?String(e.consumed_at||'').slice(11,16):'');if(!groups.has(key))groups.set(key,{slot,entries:[]});groups.get(key).entries.push(e);}
  for(const g of groups.values()){const s=mealSlots.find(x=>x.id===g.slot),sum=k=>g.entries.reduce((a,e)=>a+num(e[k]),0),first=g.entries.map(e=>e.consumed_at).filter(v=>v&&localDay(v)===date).sort()[0];items.push({t:first||(date+'T'+(s?.time||'12:00')+':00'),icon:'🍽',cls:'food',title:(s?.name||'Jídlo')+' · '+fmt(sum('kcal'))+' kcal',meta:g.entries.map(e=>esc(e.recipe_title||'Jídlo')).join(', ')+' · B '+fmt(sum('protein_g'))+' g · S '+fmt(sum('carbs_g'))+' g · T '+fmt(sum('fat_g'))+' g',raw:true});}});
  // Weigh-ins of the day with the change against the last earlier one. A weight
  // written to Google Health comes back from it as the same point: shown once.
  // A record without a valid time is skipped.
  add('weight',()=>{const weights=(state.weight?.records||[]).filter(r=>measured(r.value_numeric)).map(r=>({...r,day:localDay(r.sample_time),at:clock(r.sample_time)})).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&!Number.isNaN(Date.parse(r.day+'T12:00:00Z'))).sort((a,b)=>(a.day+(a.at||'12:00')).localeCompare(b.day+(b.at||'12:00'))),before=weights.filter(r=>r.day<date).at(-1),seen=new Set();
  for(const w of weights.filter(r=>r.day===date)){const kg=num(w.value_numeric),key=w.at+'|'+fmt(kg,1);if(seen.has(key))continue;seen.add(key);const delta=before?kg-num(before.value_numeric):null;items.push({t:date+'T'+(w.at||'12:00')+':00',icon:'⚖',cls:'weight',title:uiText('Váha · ','Weight · ')+fmt(kg,1)+' kg',meta:delta==null?uiText('první záznam','first entry'):(Math.abs(delta)<.05?'±':delta>0?'+':'−')+fmt(Math.abs(delta),1)+uiText(' kg od ',' kg since ')+dateLabel(before.day)});}});
  add('drinks',()=>{const f=state.fluids?.[date];if(f?.entries?.length)items.push({t:f.entries.at(-1).consumedAt,icon:'💧',cls:'water',title:'Pití · '+fluidLabel(f.totalMl),meta:f.entries.length+uiText('× · cíl ','× · goal ')+fluidLabel(f.target.ml)});});
  // Intervals.icu times are local, Google Health ones UTC: order by Prague time.
  items.sort((a,b)=>(clock(a.t)||'').localeCompare(clock(b.t)||''));
  el.innerHTML='<div class="detail-heading"><div><div class="label">Timeline</div><h3>'+(date===localToday()?'Tvůj den':'Den '+esc(longDate(date)))+'</h3></div><div class="actions"><button class="btn" type="button" id="timelineWeight">⚖ <span class="tl-verb">Zapsat váhu</span><span class="tl-short">Váha</span></button><button class="btn" type="button" id="timelineFood">＋ <span class="tl-verb">Zapsat jídlo</span><span class="tl-short">Jídlo</span></button></div></div>'+(items.length?'<ol class="timeline">'+items.map(x=>'<li class="tl-'+x.cls+'"><span class="tl-icon">'+x.icon+'</span><div><strong>'+esc(x.title)+'</strong><small>'+(x.raw?x.meta:esc(x.meta))+'</small></div><time>'+esc(x.label||(x.cls==='planned'&&/T23:59/.test(x.t)?'plán':clock(x.t)))+'</time></li>').join('')+'</ol>':'<div class="data-gap">Pro tento den zatím nic nemám.</div>');
  $('timelineFood').onclick=()=>openFoodLogger();
  $('timelineWeight').disabled=date>localToday();$('timelineWeight').onclick=()=>openWeightSheet(date);
}
// ---- AI notes after an RPE, written in the background ----
async function loadReflections(date=selectedHistoryDate){
  try{const r=await jsonFetch('/app/api/coach/reflections?date='+date);state.reflections={...(state.reflections||{}),[date]:r.reflections||[]};if(date===selectedHistoryDate){renderDayTimeline();renderCoachCouncil();}return state.reflections[date];}catch{return state.reflections?.[date]||[];}
}
// The note after an RPE is written on the server; check back a few times.
async function awaitReflection(date){
  const before=(await loadReflections(date)).length;
  for(let i=0;i<6;i++){await new Promise(r=>setTimeout(r,5000));const now=await loadReflections(date);if(now.length>before){toast(uiText('✦ AI napsala zpětnou vazbu k tréninku – najdeš ji v Radách a hodnocení.','✦ AI replied to your session – see Advisors and ratings.'));loadScheduledWorkouts?.();return now[0];}}
}
// One stored activity row (Intervals.icu activity or Google Health exercise).
function activityRow(row){let p={};try{p=JSON.parse(row.payload_json||'{}');}catch{}const ex=p.exercise&&typeof p.exercise==='object'?p.exercise:null,type=String(ex?ex.exerciseType:p.type||p.category||''),start=row.start_time||p.start_date_local||p.start_date;if(!start)return null;
  const t=type.toLowerCase(),kind=/weight|strength/.test(t)?'gym':/ride|cycl|bik/.test(t)?'ride':/run/.test(t)?'run':/walk|hike/.test(t)?'walk':'other';
  const secs=ex?Number(String(ex.activeDuration||'').replace(/s$/i,'')):Number(p.moving_time??p.elapsed_time),span=row.end_time?(Date.parse(row.end_time)-Date.parse(start))/1000:NaN,minutes=secs>0?secs/60:span>0?span/60:null;
  return {start,kind,name:(ex?ex.displayName:p.name)||({walk:'Chůze',run:'Běh',ride:'Jízda',gym:'Posilovna'}[kind])||type||'Aktivita',minutes,tss:p.icu_training_load??p.training_load??null};}
// The Prague calendar day of a timestamp; one without a zone is already local.
function localDay(v){const s=String(v||'');if(!/(Z|[+-]\d{2}:?\d{2})$/.test(s))return s.slice(0,10);const d=new Date(s);if(Number.isNaN(d.getTime()))return s.slice(0,10);const p=new Intl.DateTimeFormat('en-GB',{timeZone:USER_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),g=t=>p.find(x=>x.type===t).value;return g('year')+'-'+g('month')+'-'+g('day');}

// Copy a food entry to several days at once (also ahead, as a meal plan).
function installMultiCopy(){
  const date=$('foodCopyDate');if(!date||$('foodCopyDays'))return;
  date.closest('label').insertAdjacentHTML('beforebegin','<div class="copy-days" id="foodCopyDays" role="group" aria-label="Kopírovat do dnů"></div>');
  const draw=()=>{const base=$('foodManageForm').elements.date.value||localToday();$('foodCopyDays').innerHTML=[['Dnes',localToday()],['Zítra',dateShift(localToday(),1)],...[2,3,4,5,6].map(i=>[dateFormat({weekday:'short',day:'numeric',month:'numeric'}).format(new Date(dateShift(localToday(),i)+'T12:00:00Z')),dateShift(localToday(),i)])].filter(([,d])=>d!==base).map(([l,d])=>'<label><input type="checkbox" value="'+d+'"> '+esc(l)+'</label>').join('');};
  const dialog=$('foodManageDialog'),open=dialog.showModal.bind(dialog);dialog.showModal=()=>{draw();open();};
  $('foodManageCopy').textContent='Kopírovat';
  $('foodManageCopy').onclick=async()=>{const button=$('foodManageCopy'),days=[...$('foodCopyDays').querySelectorAll('input:checked')].map(i=>i.value),extra=$('foodCopyDate').value,targets=[...new Set([...days,...(extra&&!days.length?[extra]:[])])];if(!targets.length){toast('Vyber den nebo dny pro kopii.');return}button.disabled=true;try{for(const targetDate of targets)await jsonFetch('/app/api/food/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:$('foodManageForm').elements.id.value,targetDate})});dialog.close();toast('Jídlo je zkopírované do '+targets.map(dateLabel).join(', ')+(targets.some(d=>d>localToday())?' · na budoucí dny jako plán jídelníčku':'')+'.');await refreshFoodDiary()}catch(error){toast('Kopie selhala: '+error.message)}finally{button.disabled=false}};
}

// Activity detail: intervals, heart rate recovery and a cadence chart.
function activityExtras(result){
  const hrr=result.hrr,rows=result.intervals||[],work=rows.filter(r=>/WORK/i.test(r.type||'')),list=(work.length?work:rows).slice(0,20),streams=result.streams||[];
  const hrrHtml=hrr?'<div class="hrr-card"><div><span class="label">Zotavení tepu · HRR</span><strong>−'+hrr.drop+' bpm</strong><small>z '+hrr.peak+' na '+hrr.after+' bpm za '+hrr.seconds+uiText(' s po posledním úseku v zóně 4+ (od ', ' s after the last effort in zone 4+ (from ')+hrr.threshold+' bpm)</small></div><p class="small">Čím rychleji tep klesá, tím lépe se srdce zotavuje. Sleduj trend, ne jednotlivou hodnotu.</p></div>':'';
  const intervals=list.length?'<h3>Intervaly</h3><div class="scroll"><table class="pr-table"><thead><tr><th>#</th><th>Čas</th><th>Výkon</th><th>NP</th><th>Tep</th><th>Kadence</th></tr></thead><tbody>'+list.map((r,i)=>'<tr><td>'+(i+1)+(r.label?' · '+esc(r.label):'')+'</td><td>'+esc(fmtStepTime(r.seconds))+'</td><td>'+(r.watts!=null?r.watts+' W':'—')+'</td><td>'+(r.np!=null?r.np+' W':'—')+'</td><td>'+(r.hr!=null?r.hr+(r.maxHr?' / '+r.maxHr:'')+' bpm':'—')+'</td><td>'+(r.cadence!=null?r.cadence+' rpm':'—')+'</td></tr>').join('')+'</tbody></table></div>':'';
  const cadence=streams.find(s=>s.type==='cadence')?.points?.length?activityStreamChart(streams.find(s=>s.type==='cadence'),'#64d2ff','Kadence','rpm'):'';
  return hrrHtml+intervals+(cadence?'<div class="experience-grid"><div>'+cadence+'</div></div>':'');
}

function installFitnessInsights(){
  $('training').insertAdjacentHTML('beforeend','<div class="section">Svaly, kardio a rekordy</div><div id="fitnessInsights"><div class="notice">Načítám svaly, zátěž a rekordy…</div></div>');
  // Keep it high up: right after the performance capacity tiles.
  const anchor=$('trainingInsightsAnchor');
  if(anchor){const sec=$('fitnessInsights').previousElementSibling;anchor.before(sec,$('fitnessInsights'));}
  $('dailyPulse')?.insertAdjacentHTML('afterend','<article class="card" id="dayTimeline"></article>');
  installMultiCopy();
  const previous=load;load=async()=>{await previous();renderDayTimeline();loadInsights();loadReflections();loadRecovery();};
  const diary=renderMealDiary;renderMealDiary=function(){diary();renderDayTimeline();};
  const openDetail=openActivityProfile;openActivityProfile=async function(activity){
    await openDetail(activity);
    if(!activity||activity.source&&activity.source!=='intervals')return;
    const id=activity.payload?.id||activity.externalId||activity.sourceId||String(activity.id||'').replace(/^intervals[:_-]/,'');
    const r=state.lastActivityDetail?.id===id?state.lastActivityDetail.result:null,extra=r?activityExtras(r):'';if(extra)$('activityProfile').insertAdjacentHTML('beforeend','<div class="activity-extras">'+extra+'</div>');
  };
}
installFitnessInsights();

// ---- Phone layer: "Dnes" home, quick-add button, bottom sheets, gym workout mode ----
const isPhone=()=>window.matchMedia('(max-width:700px)').matches;
let sheetCloseTimer;
function closeSheet(){state.openDetail=null;const s=$('sheet');if(!s||s.hidden)return;s.classList.remove('open');document.body.classList.remove('sheet-open');sheetCloseTimer=setTimeout(()=>{s.hidden=true;$('sheetBody').innerHTML='';},180);}
// Each openSheet() gets an id, so async loaders can tell whether their sheet is still
// the one shown. Comparing the title text fails: the icon swap and the EN translator
// rewrite the title in the DOM.
let sheetSeq=0;
const sheetStill=id=>id===sheetSeq&&$('sheet')&&!$('sheet').hidden;
function openSheet(title,body,onMount,panelClass=''){
  sheetSeq++;
  if(!$('sheet'))document.body.insertAdjacentHTML('beforeend','<div id="sheet" class="sheet" hidden><div class="sheet-backdrop" data-sheet-close></div><section class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"><div class="sheet-handle" data-sheet-close></div><div class="sheet-head"><h3 id="sheetTitle"></h3><button type="button" class="btn" data-sheet-close aria-label="Zavřít">✕</button></div><div id="sheetBody"></div></section></div>');
  clearTimeout(sheetCloseTimer);const s=$('sheet');s.className='sheet '+panelClass;$('sheetTitle').textContent=title;$('sheetBody').innerHTML=body;s.hidden=false;s.querySelector('.sheet-panel').scrollTop=0;document.body.classList.add('sheet-open');requestAnimationFrame(()=>s.classList.add('open'));
  s.onclick=e=>{if(e.target.closest('[data-sheet-close]'))closeSheet();};
  if(onMount)onMount($('sheetBody'));
  return sheetSeq;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
const SPORT_ICON={ride:'🚴',run:'🏃',gym:'🏋️',recovery:'🧘'};
function miniRing(label,value,progress,color,sub,view){return '<button type="button" class="mini-ring" data-go="'+view+'"><span class="mini-ring-dial" style="--p:'+Math.max(0,Math.min(100,num(progress)))+';--c:'+color+'"><b>'+esc(value)+'</b></span><span class="mini-ring-label">'+esc(label)+'</span><small>'+esc(sub)+'</small></button>';}
function todayItems(date){
  const days=hubDays()||state.week?.days||[],d=date===selectedHistoryDate&&state.daily?{date,daily:state.daily}:days.find(x=>x.date===date),t=d?.daily?.training||{},out=[];
  for(const a of (t.completed||[]).filter(x=>!isNutritionItem(x)))out.push({kind:'done',sport:activitySport(a),name:a.name||a.type,meta:hm(num(a.durationHours)*60)+(measured(a.tss)?' · TSS '+fmt(a.tss):''),a,date});
  const sessions=out.filter(x=>!isWalkActivity(x.a)).length;for(const x of out)x.daySessions=sessions;
  const paired=new Set((t.matched||[]).map(m=>String(m.planned?.id||'')));
  for(const p of (t.planned||[]).filter(x=>!isNutritionItem(x)&&!paired.has(String(x.id||''))))out.push({kind:'planned',sport:activitySport(p),name:p.name||'Plán',meta:(p.durationHours?hm(num(p.durationHours)*60):'')+(measured(p.tss)?' · TSS '+fmt(p.tss):''),p});
  const sports=new Set(out.map(x=>x.sport));
  if(date===localToday()&&(state.gym?.date||localToday())===date&&!gymCancelledOn(date)&&(state.gym?.values||[]).slice(7).some(r=>r?.[1])&&!sports.has('gym')){out.push({kind:'gymplan',sport:'gym',name:state.gym.values[2]?.[3]||state.gym.values[1]?.[0]||'Silový trénink',meta:czPlural(state.gym.values.slice(7).filter(r=>r?.[1]).length,'série','série','sérií')+' v plánu'});sports.add('gym');}
  const role=date>=localToday()&&!statusPausesTraining()?(state.weekPlan?.roles?.[weekdayOf(date)]?.items||[]):[];
  for(const x of role)if(!sports.has(x.sport)&&!(x.sport==='gym'&&gymCancelledOn(date)))out.push({kind:'role',sport:x.sport,name:x.label,meta:'podle plánu týdne'});
  for(const r of (state.recovery||[]).filter(r=>r.date===date))out.push({kind:'recovery',sport:'recovery',name:r.title,meta:r.minutes+' min · '+r.items.length+uiText(' cviků',' moves')+(r.done?uiText(' · hotovo',' · done'):''),r});
  return out;
}
// A finished session already rated (RPE in Intervals.icu, a coach note that
// names it, the only session of a rated day, or rated here) shows its RPE, or
// a tick when the rating has no number. Returns the RPE, true or false.
function sessionRated(x){
  const a=x.a||{},rpe=Number(a.rpe??a.icu_rpe??a.payload?.icu_rpe??a.payload?.rpe),name=String(x.name||'Trénink'),valid=v=>v!=null&&v!==''&&Number(v)>=1&&Number(v)<=10;
  if(valid(rpe))return rpe;
  const key=x.date+'|'+name;
  if(state.ratedSessions?.has(key)){const v=state.ratedSessions.get?.(key);return valid(v)?Number(v):true;}
  const notes=(state.reflections?.[x.date]||[]).filter(r=>r.rpe!=null||r.notes);
  const own=notes.find(r=>String(r.notes||'').startsWith(name+':'))||(x.daySessions===1?notes.find(r=>r.rpe!=null):null);
  return own?(valid(own.rpe)?Number(own.rpe):true):false;
}
function ratedLabel(r){return typeof r==='number'?'✓ RPE '+fmt(r,Number.isInteger(r)?0:1):uiText('✓ ohodnoceno','✓ rated');}
// Walks are everyday movement, not training: they get no rating.
function isWalkActivity(a){return !activitySport(a)&&/walk|hike|chůze|procház|túra/i.test(String(a?.type||'')+' '+String(a?.name||''))}
function todayItemHtml(x){
  const actions=x.kind==='recovery'?'<button class="btn'+(x.r.done?'':' primary')+'" data-today="recovery" data-id="'+esc(x.r.id)+'">'+(x.r.done?uiText('✓ Hotovo','✓ Done'):uiText('Otevřít','Open'))+'</button>':x.kind==='planned'&&/^planned:/.test(String(x.p?.id||''))?'<button class="btn" data-today="move" data-id="'+esc(x.p.id)+'" data-name="'+esc(x.name)+'">Přesunout</button>':
    x.kind==='role'&&x.sport!=='gym'?'<button class="btn primary" data-today="generate" data-sport="'+x.sport+'">Generovat</button>':
    (x.kind==='gymplan'||x.kind==='role'&&x.sport==='gym')&&!(statusPausesTraining()&&(state.todayPick||localToday())>=localToday())?'<button class="btn primary" data-today="gym">▶ Začít</button>':
    x.kind==='done'&&!isWalkActivity(x.a)?((r=>r?'<span class="today-rated" data-no-i18n>'+esc(ratedLabel(r))+'</span>':'<button class="btn" data-today="rate" data-name="'+esc(x.name||'Trénink')+'">Hodnocení</button>')(sessionRated(x))):'';
  return '<div class="today-item '+x.kind+'"><span class="today-icon">'+(SPORT_ICON[x.sport]||'•')+'</span><div><strong>'+esc(x.name)+'</strong><small>'+(x.kind==='done'?uiText('✓ Hotovo · ','✓ Done · '):x.kind==='planned'?uiText('Plán · ','Plan · '):x.kind==='role'?uiText('Návrh · ','Suggestion · '):'')+esc(x.meta||'')+'</small></div>'+actions+'</div>';
}
function renderToday(){
  const el=$('today');if(!el||!state.daily)return;
  const date=selectedHistoryDate,food=state.daily?.nutrition?.foodLog?.totals||{},target=num(state.daily?.nutrition?.calorieTarget);
  const night=primarySleepSessions(state.sleep?.sessions).find(s=>(s.date||String(s.endTime||'').slice(0,10))===date);
  const t=state.daily?.training||{},done=(t.completed||[]).filter(a=>!isNutritionItem(a)).reduce((s,a)=>s+num(a.tss),0),plan=(t.planned||[]).filter(a=>!isNutritionItem(a)).reduce((s,a)=>s+num(a.tss),0);
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:USER_TZ,hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  const days=(hubDays()||state.week?.days||[]).map(d=>d.date);if(!state.todayPick||!days.includes(state.todayPick))state.todayPick=days.includes(date)?date:days[0];
  const strip=days.map(d=>{const items=todayItems(d),icons=[...new Set(items.map(x=>x.sport).filter(Boolean))].slice(0,3).map(s=>SPORT_ICON[s]).join('');return '<button type="button" class="strip-day'+(d===state.todayPick?' active':'')+(d===localToday()?' today':'')+'" data-strip="'+d+'"><span>'+esc(dateFormat({weekday:'short'}).format(new Date(d+'T12:00:00Z')))+'</span><b>'+Number(d.slice(8))+'</b><i>'+(icons||'·')+'</i></button>';}).join('');
  const pick=state.todayPick,pickItems=todayItems(pick);
  // The coach's notes of the picked day decide which sessions are rated.
  if(pick&&pick<=localToday()&&!state.reflections?.[pick]&&!reflectionDays.has(pick)){reflectionDays.add(pick);loadReflections(pick).then(()=>{if(state.todayPick===pick&&state.reflections?.[pick]?.length)renderToday();});}
  // The timeline may sit in this screen: park it back in Přehled before the
  // screen is rebuilt, or the rebuild would delete it.
  const parked=$('dayTimeline');if(parked&&el.contains(parked))$('dailyPulse')?.after(parked);
  ($('todayTop')||el).innerHTML='<div class="today-layout"><div class="today-main"><div class="today-head"><div class="eyebrow">'+esc(longDate(date))+(()=>{const p=savedProfile(),days=p.eventDate?Math.round((Date.parse(p.eventDate+'T12:00:00Z')-Date.parse(localToday()+'T12:00:00Z'))/864e5):null;return days!=null&&days>=0?' · 🏁 '+esc(p.eventName||uiText('Závod','Race'))+uiText(' za ',' in ')+days+uiText(' dní', ' days'):'';})()+'</div><h1>'+(date!==localToday()?'Den':hour<10?'Dobré ráno':hour<18?'Dnes':'Dobrý večer')+'</h1></div>'+
    '<div class="mini-rings">'+(()=>{const need=night?nightNeed(date):null,bed=date===localToday()?tonightPlan():null,slept=night?num(night.durationMin):0;return miniRing('Spánek',night?fmt(slept/60,1)+' h':'—',night?slept/need*100:0,'#a99bff',[night?uiText('z ','of ')+fmt(need/60,1)+' h':uiText('Bez záznamu','No record'),bed?uiText('spát v ','bed at ')+clockText(bed.bed):''].filter(Boolean).join(' · '),'recovery');})()+(()=>{const s=dayStrain(date,done),goal=trainingStrain(Math.max(plan,done));return miniRing('Námaha',s==null?'—':fmt(s,1),s==null?0:s/21*100,'#83e9c3',s==null?(plan?uiText('Plán ~','Plan ~')+fmt(goal,1):uiText('Zatím klid','All quiet so far')):capFirst(strainBand(s))+(plan>done?uiText(' · plán ~',' · plan ~')+fmt(goal,1):''),'training');})()+miniRing('Kalorie',target?fmt(num(food.kcal)/target*100)+'%':'—',target?num(food.kcal)/target*100:0,'#ffc274',fmt(food.kcal)+' / '+fmt(target)+' kcal','nutrition')+(()=>{const f=state.fluids?.[date];return miniRing('Pití',f?fluidLabel(f.totalMl):'—',f?f.totalMl/Math.max(1,f.target.ml)*100:0,'#64d2ff',f?uiText('Cíl ','Goal ')+fluidLabel(f.target.ml):uiText('Načítám…','Loading…'),'water');})()+'</div>'+
    uiText('<article class="card today-card"><div class="today-card-head"><div class="label">Trénink · ', '<article class="card today-card"><div class="today-card-head"><div class="label">Training · ')+esc(pick===localToday()?'dnes':longDate(pick))+'</div><div class="today-card-tools">'+(()=>{const wk=mondayOf(pick),cur=wk===localMonday();return '<span class="today-week-nav" role="group" aria-label="Týden"><button type="button" class="btn review-btn" data-week-step="-1" aria-label="Předchozí týden">‹</button><span class="small">Týden '+isoWeek(wk)+'</span><button type="button" class="btn review-btn" data-week-step="1" aria-label="Další týden">›</button>'+(cur?'':'<button type="button" class="btn review-btn" data-week-step="0">Tento týden</button>')+'</span>';})()+'<button type="button" class="btn review-btn" data-review="'+esc(pick)+'">🔍 Revize dne</button></div></div>'+(pickItems.length?pickItems.map(todayItemHtml).join(''):'<p class="small">Volno. Sport na tento den přidáš ve Workoutech v plánu týdne.</p>')+'<div class="week-strip" role="group" aria-label="Dny týdne">'+strip+'</div></article>'+
    '</div><div id="todayTimelineSlot"></div></div>';
  // One timeline for both screens: it moves here only while Dnes is shown,
  // otherwise a data reload would take it out of the visible Přehled.
  const tl=$('dayTimeline');if(tl&&el.classList.contains('active'))$('todayTimelineSlot').appendChild(tl);
  renderAthleteStatus();
}
// Dnes → Trénink browses whole weeks: the same weekday a week back or ahead,
// or back to today. The week is shared with the plan in Workouty.
// A day picked in the training card is the day of the whole screen: timeline,
// signals, advisers and nutrition follow it (days past the date limit only change the card).
function pickTodayDay(date){
  if(date<=lastSelectableDay()&&date!==selectedHistoryDate){selectDay(date);return}
  state.todayPick=date;renderToday();
}
async function shiftTodayWeek(step){
  const base=mondayOf(state.todayPick||selectedHistoryDate),next=step?dateShift(base,7*step):localMonday();
  const offset=Math.round((Date.parse((state.todayPick||base)+'T12:00:00Z')-Date.parse(base+'T12:00:00Z'))/864e5);
  state.hubWeek=next;state.todayPick=step?dateShift(next,Math.max(0,Math.min(6,offset))):localToday();
  const card=document.querySelector('#today .today-card');if(card)card.classList.add('loading');
  try{await Promise.all([hubWeekData(),loadWeekPlan(true)]);}catch(error){toast('Týden se nenačetl: '+error.message);}
  renderToday();
  if(state.todayPick<=lastSelectableDay()&&state.todayPick!==selectedHistoryDate)await selectDay(state.todayPick);
}
async function todayAction(b){
  const a=b.dataset.today;
  if(a==='move'){const id=b.dataset.id,name=b.dataset.name;openSheet('Přesunout „'+name+'“',dayChips(),body=>body.addEventListener('click',e=>{const c=e.target.closest('[data-move-to]');if(c){closeSheet();movePlanned(id,c.dataset.moveTo,name);}if(e.target.closest('[data-delete-planned]')){closeSheet();deletePlanned(id,name);}}));return}
  if(a==='generate'){await openDailyRecommendation({date:state.todayPick||localToday(),sport:b.dataset.sport});return}
  if(a==='gym'){await openGymDay(state.todayPick||localToday(),false);openGymMode();return}
  if(a==='recovery'){openRecoverySheet(Number(b.dataset.id));return}
  if(a==='rpe'){openRpeSheet();}if(a==='rate')openRatingSheet({date:state.todayPick||localToday(),name:b.dataset.name});
}
function dayChips(){const today=localToday();return '<p class="small">Vyber den. Změna se propíše i do Intervals.icu.</p><div class="sheet-days">'+Array.from({length:10},(_,i)=>{const d=dateShift(today,i);return '<button type="button" class="btn" data-move-to="'+d+'"><b>'+esc(dateFormat({weekday:'short'}).format(new Date(d+'T12:00:00Z')))+'</b>'+esc(dateLabel(d))+'</button>'}).join('')+'</div><button type="button" class="btn sheet-danger" data-delete-planned>Smazat z plánu i z Intervals.icu</button>';}
async function openRpeSheet(){
  openSheet('RPE k tréninku','<p class="small">Načítám naplánované workouty…</p>');
  let rows=[];try{rows=(await jsonFetch('/app/api/workouts/scheduled')).workouts||[];}catch{}
  const due=rows.filter(w=>!w.feedback_id&&w.scheduled_date<=localToday());
  $('sheetBody').innerHTML=due.length?due.map(w=>'<div class="rpe-pick" data-id="'+esc(w.workout_id)+'" data-date="'+esc(w.scheduled_date)+'"><strong>'+esc(w.name)+'</strong><small>'+esc(dayTitle(w.scheduled_date))+(w.completed_percent!=null?' · dokončeno '+Math.round(w.completed_percent)+' %':'')+'</small><div class="rpe-scale">'+[1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" data-rpe="'+n+'">'+n+'</button>').join('')+'</div></div>').join('')+'<p class="small">1–2 velmi lehce · 5–6 středně · 9–10 maximum. Uloží se i do Intervals.icu.</p>':'<p class="small">Žádný odjetý workout z knihovny nečeká na RPE.</p>';
  $('sheetBody').onclick=async e=>{const b=e.target.closest('[data-rpe]');if(!b)return;const row=b.closest('.rpe-pick');b.disabled=true;try{const r=await jsonFetch('/app/api/workouts/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workoutId:row.dataset.id,scheduledDate:row.dataset.date,rpe:Number(b.dataset.rpe)})});row.innerHTML=uiText('<strong>✓ RPE ', '<strong>✓ RPE ')+b.dataset.rpe+uiText(' uloženo</strong><small>', ' saved</strong><small>')+(r.intervals?.status==='ok'?uiText('i v Intervals.icu', 'in Intervals.icu too'):uiText('v aplikaci', 'in the app'))+(r.reflection==='pending'?' · AI připravuje zpětnou vazbu':'')+'</small>';if(r.reflection==='pending')awaitReflection(row.dataset.date);}catch(error){toast(error.message);b.disabled=false;}};
}
function openWeightSheet(date=localToday()){
  // The last weight, or an empty field to type the first one.
  if(typeof date!=='string'||date>localToday())date=localToday();
  const last=Number((state.weight?.records||[]).filter(r=>measured(r.value_numeric)).at(-1)?.value_numeric)||null;
  openSheet('Zapsat váhu','<div class="stepper big"><button type="button" data-step="-0.1">−</button><input id="weightValue" class="food-input" type="text" inputmode="decimal" autocomplete="off" placeholder="kg" aria-label="Váha v kg" style="width:7ch;text-align:center;font-size:inherit" value="'+(last?last.toFixed(1):'')+'"><button type="button" data-step="0.1">+</button></div><p class="small" style="text-align:center">kg · '+esc(date===localToday()?'dnes':longDate(date))+'</p><button type="button" class="btn primary sheet-wide" id="weightSave">Uložit</button>',body=>{
    const read=()=>Number(String($('weightValue').value).replace(',','.'));
    body.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const v=read();if(v>0)$('weightValue').value=(Math.round((v+Number(b.dataset.step))*10)/10).toFixed(1);});
    $('weightSave').onclick=async()=>{const v=Math.round(read()*10)/10;if(!(v>=30&&v<=300))return toast('Zadej váhu v kg.');closeSheet();toast('Váha '+fmt(v,1)+' kg je uložená.');try{await jsonFetch('/app/api/weight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kg:v,date})});load();}catch(error){toast(uiText('Váha se neuložila: ', 'The weight wasn\'t saved: ')+error.message);}};
  });
}
function openQuickAdd(){
  openSheet('Rychle zapsat','<div class="quick-actions">'+[['assistant','✦',$('floatingAssistant')?.classList.contains('has-advice')?'AI · návrh':'AI'],['food','🍽','Jídlo'],['barcode','▥','Čárový kód'],['label','📷','Fotka etikety'],['water','💧','Pití'],['weight','⚖','Váha'],['rpe','💬','Hodnocení'],['gym','🏋️','Posilovna']].map(([k,i,l])=>'<button type="button" data-quick="'+k+'"><span>'+i+'</span>'+l+'</button>').join('')+'</div>',body=>body.onclick=e=>{const b=e.target.closest('[data-quick]');if(!b)return;const k=b.dataset.quick;
    if(k==='assistant'){closeSheet();return openFloatingAssistant();}
    if(k==='water')return openFluidSheet(selectedHistoryDate);if(k==='weight')return openWeightSheet();if(k==='rpe')return openRatingSheet({date:selectedHistoryDate});closeSheet();
    if(k==='gym')return openGymMode();
    if(k==='barcode')return openBarcodeScanner();openFoodLogger();if(k==='label')$('foodLabelPhoto')?.click();});
}

// Gym workout mode: one set at a time, steppers for weight and reps, RPE, rest timer.
let gymMode=null;
// Plan edits from the gym table and workout mode use the full save, so the
// history follows: a removed saved set leaves it, a corrected exercise is renamed.
async function saveGymValues(values){
  const rows=values.slice(7);while(rows.length&&rows[rows.length-1].every(v=>String(v??'').trim()===''))rows.pop();
  const full=values.slice(0,7).concat(rows);upgradeGymOptionsHeader(full);
  const result=await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:rows,fullValues:full,date:gymDay()})});
  state.gym={...state.gym,values:result.values||full,history:result.history||state.gym?.history||[]};try{renderGym();renderGymHistory(state.gym.history);}catch{}
}
// ---- Gym plan edits (table and workout mode). Rows are the plan below the
// seven header rows; set numbers follow the order after every change.
function gymRowWork(r){return String(r?.[0]||'WORK').toUpperCase()!=='WARMUP';}
function gymRowDone(r){return String(r?.[8]).toUpperCase()==='TRUE';}
const GYM_FAILURE_NOTE='; poslední série do technického selhání, jen při čistém provedení';
// The coach's prescription: the set to take to technical failure.
function gymPrescribedFailure(r){return gymRowWork(r)&&(String(r?.[9]||'').includes(GYM_FAILURE_NOTE.slice(2))||!gymRowDone(r)&&gymFailureValue(r?.[11]));}
function renumberGymRows(rows){const seen=new Map();for(const r of rows){if(!r?.[1])continue;const key=String(r[0]||'WORK').toUpperCase()+'|'+r[1],n=(seen.get(key)||0)+1;seen.set(key,n);r[2]=String(n);}return rows;}
function lastGymKg(name){const h=(state.gym?.history||[]).find(r=>r.exercise===name&&Number(r.actual_kg)>0);return h?String(h.actual_kg).replace('.',','):'';}
function addGymSet(rows,name){const mine=rows.filter(r=>r[1]===name);if(!mine.length)return null;const copy=(mine.filter(gymRowWork).at(-1)||mine.at(-1)).slice();copy[0]='WORK';copy[5]='';copy[6]='';copy[7]='';copy[8]='FALSE';copy[9]=String(copy[9]||'').replace(GYM_FAILURE_NOTE,'');copy[11]='FALSE';rows.splice(rows.indexOf(mine.at(-1))+1,0,copy);return {rows};}
// Workout mode skips the rest of an exercise (saved sets stay); with nothing
// left open, the exercise goes with its saved sets.
function removeGymExercise(rows,name){const open=rows.filter(r=>r[1]===name&&!gymRowDone(r));return {rows:rows.filter(r=>r[1]!==name||(open.length?gymRowDone(r):false))};}
// Only an exercise from the gym's catalog, never free text.
function addGymExercise(rows,exercise,after){
  const item=gymExerciseCatalog.find(item=>item.name===exercise?.name);
  if(!item||rows.some(r=>r[1]===item.name))return null;
  const kg=lastGymKg(item.name)||(exercise?.kg!=null?String(exercise.kg).replace('.',','):'');
  const fresh=Array.from({length:Math.max(1,Number(item.sets)||3)},()=>['WORK',item.name,'',kg,String(item.reps||'10'),'','','','FALSE',item.note||'','','FALSE','']);
  const last=after?rows.map(r=>r[1]).lastIndexOf(after):-1;rows.splice(last<0?rows.length:last+1,0,...fresh);return {rows};
}
// Another exercise for the same muscle in place of the open sets; with every
// set saved (a finished session) it corrects the name of the saved sets.
function swapGymExercise(rows,from,alt){
  if(!alt?.name||rows.some(r=>r[1]===alt.name))return null;
  const mine=rows.filter(r=>r[1]===from),open=mine.filter(r=>!gymRowDone(r)),work=open.filter(gymRowWork);
  if(!mine.length)return null;
  if(!work.length){for(const r of mine){r[1]=alt.name;r[10]='';}return {rows,focus:mine[0]};}
  const kg=alt.kg==null?'':String(alt.kg).replace('.',','),pause=String(work[0][9]||'').match(/\[Pauza \d+ s\]/)?.[0]||'',failure=work.some(gymPrescribedFailure),group=work.find(r=>/^[A-F]$/.test(r[12]||''))?.[12]||'',note=(alt.note?alt.note+'; ':'')+'místo '+from,fresh=[];
  if(alt.warmup&&alt.kg!=null&&!mine.some(gymRowDone)&&open.some(r=>!gymRowWork(r)))for(const [f,reps] of [[.5,'8'],[.75,'4']])fresh.push(['WARMUP',alt.name,'',String(Math.round(alt.kg*f*2)/2).replace('.',','),reps,'','','','FALSE','[WARMUP]','','FALSE','']);
  work.forEach((r,i)=>{const last=failure&&i===work.length-1;fresh.push(['WORK',alt.name,'',kg,String(alt.reps||r[4]||''),'','','','FALSE',note+(last?GYM_FAILURE_NOTE:'')+(pause?' '+pause:''),'',last?'TRUE':'FALSE',group]);});
  const out=[];let placed=false;for(const r of rows){if(open.includes(r)){if(!placed){out.push(...fresh);placed=true;}continue;}out.push(r);}
  return {rows:out,focus:fresh[0]};
}
// Applies one change, saves it and says where each old row went.
async function editGymPlan(change){
  const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]),head=values.slice(0,7),rows=values.slice(7),origin=new Map(rows.map((r,i)=>[r,i+7]));
  const result=change(rows);if(!result)return null;
  renumberGymRows(result.rows);
  const moved=new Map();result.rows.forEach((r,i)=>{if(origin.has(r))moved.set(origin.get(r),i+7);});
  gymSaveQueue=gymSaveQueue.catch(()=>{}).then(()=>saveGymValues(head.concat(result.rows)));
  await gymSaveQueue;
  return {moved,focus:result.focus?result.rows.indexOf(result.focus)+7:-1};
}
function gymNumber(v,fallback=null){const text=String(v??'').trim().replace(',','.');return text!==''&&Number.isFinite(Number(text))?Number(text):fallback;}
function gymDraftKey(){return 'pfd-gym-draft:'+state.account?.id+':'+gymDay()+':'+JSON.stringify((state.gym?.values||[]).slice(7).map(r=>r.slice(0,5)));}
function rememberGymDraft(){
  if(!gymMode)return;
  const cur=gymSets().find(x=>x.i===gymMode.forIdx);
  if(cur)gymMode.drafts[cur.i]={kg:gymMode.kg,reps:gymMode.reps,rpe:gymMode.rpe,toFailure:gymMode.toFailure,kgText:gymMode.kgText,repsText:gymMode.repsText,base:JSON.stringify(cur.r.slice(5,9))};
  if(state.account?.id)try{sessionStorage.setItem(gymMode.draftKey,JSON.stringify({startedAt:gymMode.startedAt,drafts:gymMode.drafts}));}catch{}
}
function restoreGymDraft(cur,same){
  const draft=gymMode.drafts[cur.i],saved=draft?.base===JSON.stringify(cur.r.slice(5,9))?draft:null;
  const kg=gymNumber(cur.r[5],gymNumber(cur.r[3],gymNumber(same.find(x=>gymNumber(x.r[5])!=null)?.r[5],0)));
  Object.assign(gymMode,saved||{kg,reps:gymNumber(cur.r[6],Number(String(cur.r[4]||'10').match(/\d+/)?.[0])||10),rpe:gymNumber(cur.r[7]),toFailure:gymNumber(cur.r[7])===10,kgText:null,repsText:null},{forIdx:cur.i});
}
function gymExerciseHasEditedDraft(exercise){
  if(!gymMode)return false;rememberGymDraft();const sets=gymSets();
  return sets.filter(x=>x.r[1]===exercise).some(cur=>{
    const draft=gymMode.drafts[cur.i];if(!draft||draft.base!==JSON.stringify(cur.r.slice(5,9)))return false;
    const same=sets.filter(x=>x.r[1]===exercise&&x.r[0]===cur.r[0]);
    const kg=gymNumber(cur.r[5],gymNumber(cur.r[3],gymNumber(same.find(x=>gymNumber(x.r[5])!=null)?.r[5],0)));
    return draft.kg!==kg||draft.reps!==gymNumber(cur.r[6],Number(String(cur.r[4]||'10').match(/\d+/)?.[0])||10)||draft.rpe!==gymNumber(cur.r[7]);
  });
}
function applyGymSwapToScreen(action,result){
  if(gymDay()!==action.date)return;
  const before=gymMode?gymSets():[],current=before[gymMode?.pos],drafts=gymMode?.drafts||{},key=x=>JSON.stringify(x?.r?.slice(0,3)||[]);
  state.gym={...state.gym,...result};renderGym();
  if(!gymMode)return;const after=gymSets();gymMode.drafts={};
  for(const row of before){if(row.r[1]===action.fromExercise||!drafts[row.i])continue;const match=after.find(x=>key(x)===key(row));if(match)gymMode.drafts[match.i]=drafts[row.i];}
  const position=after.findIndex(x=>current?.r[1]===action.fromExercise?x.r[1]===action.toExercise:key(x)===key(current));
  gymMode.pos=Math.max(0,position);gymMode.forIdx=null;gymMode.draftKey=gymDraftKey();renderGymMode();rememberGymDraft();
}
function gymRestSeconds(cur,next){if(!next)return 0;if(cur.superset&&cur.superset===next.superset&&cur.round===next.round)return 0;return Number(String(cur.r[9]||'').match(/\[Pauza (\d+) s\]/)?.[1])||(String(cur.r[0]).toUpperCase()==='WARMUP'?60:90);}
function gymBudgetMinutes(){const values=state.gym?.values||[];return Number(values[4]?.[0]==='Časový limit (min)'?values[4][1]:String(values[3]?.[1]||'').match(/Časový plán: přibližně \d+ z (\d+) minut/)?.[1])||0;}
function updateGymClock(){const el=$('gmClock');if(!el||!gymMode)return;const elapsed=Math.floor((Date.now()-gymMode.startedAt)/60000),budget=gymBudgetMinutes();el.textContent='Uplynulo '+elapsed+' min'+(budget?' · '+(elapsed<budget?uiText('zbývá ', '')+(budget-elapsed)+uiText(' min z ', ' min left of ')+budget:uiText('časový limit ', 'time limit ')+budget+uiText(' min překročen; dokonči aktuální sérii a zvaž konec', ' min exceeded; finish the current set and consider stopping')):'');el.classList.toggle('over',budget>0&&elapsed>=budget);}
function moveGymMode(delta){if(!gymMode||gymMode.saving)return;rememberGymDraft();clearInterval(gymMode.timer);gymMode.rest=null;const next=gymMode.pos+delta;gymMode.finished=next>=gymSets().length;gymMode.pos=Math.max(0,Math.min(gymSets().length-1,next));gymMode.forIdx=null;renderGymMode();}
function gymFailureValue(value){return value===true||/^(true|1|ano)$/i.test(String(value||''));}
// The coach decides which set goes to technical failure and which exercises
// pair in a superset; the athlete sees the prescription and logs the effort
// (RPE 10 = failure reached).
function gymSupersetPartners(r,sets){const group=/^[A-F]$/.test(r?.[12]||'')?r[12]:'';return group?[...new Set(sets.filter(x=>x.r[12]===group&&x.r[1]!==r[1]&&gymRowWork(x.r)).map(x=>x.r[1]))]:[];}
function gymOptionsCell(r){
  if(!gymRowWork(r))return '<td class="gym-options-cell">—</td>';
  const failed=gymRowDone(r)&&gymFailureValue(r[11]),prescribed=gymPrescribedFailure(r),group=/^[A-F]$/.test(r[12]||'')?r[12]:'';
  const badges=(failed?'<span class="gym-set-badge">Do selhání</span>':prescribed?'<span class="gym-set-badge coach">Trenér: do selhání</span>':'')+(group?'<span class="gym-set-badge coach">Supersérie '+esc(group)+'</span>':'');
  return '<td class="gym-options-cell">'+(badges||'—')+'</td>';
}
function gymModeOptionsHtml(r,sets=[]){
  if(!gymRowWork(r))return '';
  const group=/^[A-F]$/.test(r[12]||'')?r[12]:'',partners=gymSupersetPartners(r,sets),lines=[];
  if(gymPrescribedFailure(r))lines.push('<p class="gm-coach">Trenér: tuhle sérii do technického selhání, jen při čistém provedení. Když selžeš, zapiš RPE 10.</p>');
  if(group)lines.push(uiText('<p class="gm-coach">Supersérie ', '<p class="gm-coach">Superset ')+esc(group)+(partners.length?uiText(' s cvikem ', ' with ')+partners.map(esc).join(', '):'')+uiText(': cviky se střídají, pauza až po celém kole.</p>', ': alternate the exercises, rest only after the full round.</p>'));
  return lines.join('');
}
function upgradeGymOptionsHeader(values){if(!values[6])values[6]=['Typ','Cvik','Série','Plán kg','Plán reps','Skutečně kg','Skutečně reps','RPE','Hotovo','Poznámka','Video'];values[6][11]='Do selhání';values[6][12]='Supersérie';}
function orderGymSets(values){
  const sets=values.map((r,i)=>({r,i})).filter(x=>x.i>=7&&x.r?.[1]&&/^(WORK|WARMUP)$/i.test(String(x.r[0]||'WORK'))),groups=new Map(),emitted=new Set(),out=[];
  for(const x of sets)if(String(x.r[0]).toUpperCase()==='WORK'&&/^[A-F]$/.test(x.r[12]||''))groups.set(x.r[1],x.r[12]);
  for(const x of sets){const group=groups.get(x.r[1]);if(!group){out.push(x);continue;}if(emitted.has(group))continue;emitted.add(group);const members=sets.filter(s=>groups.get(s.r[1])===group),work=members.filter(s=>String(s.r[0]).toUpperCase()!=='WARMUP'),exercises=[...new Set(work.map(s=>s.r[1]))];out.push(...members.filter(s=>String(s.r[0]).toUpperCase()==='WARMUP'));const queues=exercises.map(name=>work.filter(s=>s.r[1]===name));for(let round=0;queues.some(q=>q[round]);round++)for(const q of queues)if(q[round])out.push({...q[round],superset:group,round});}
  return out;
}
function gymSets(){return orderGymSets(state.gym?.values||[]);}
// A set is done once saved. Warm-ups are optional: one left behind a later
// logged set was skipped and is never offered again; only unfinished work
// sets count as missing at the end.
function gymSetDone(x){return String(x?.r?.[8]).toUpperCase()==='TRUE';}
function gymIsWarmup(x){return String(x?.r?.[0]).toUpperCase()==='WARMUP';}
function gymLastDone(sets){return sets.reduce((m,x,i)=>gymSetDone(x)?i:m,-1);}
function gymCounted(sets){const last=gymLastDone(sets);return sets.filter((x,i)=>gymSetDone(x)||!(gymIsWarmup(x)&&i<last));}
function gymMissingWork(sets){return sets.filter(x=>!gymIsWarmup(x)&&!gymSetDone(x));}
function gymNextOpen(sets,after){return sets.findIndex((x,i)=>i>after&&!gymSetDone(x));}
async function saveGymSet(idx,{kg,reps,rpe}){
  await gymSaveQueue.catch(()=>{});
  const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]);const row=values[idx];row[5]=String(kg);row[6]=String(reps);row[7]=rpe?String(rpe):'';row[8]='TRUE';row[11]=Number(rpe)===10?'TRUE':'FALSE';upgradeGymOptionsHeader(values);
  const used=values.slice(7);while(used.length&&used[used.length-1].every(v=>String(v??'').trim()===''))used.pop();
  const result=await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:used,fullValues:values.slice(0,7).concat(used),date:gymDay()})});
  state.gym={...state.gym,values:result.values||values,history:result.history||state.gym?.history||[]};try{renderGym();}catch{}
}
async function openGymMode(){
  if(!state.gym?.values)await loadGym().catch(()=>{});
  if(!state.account){const account=await jsonFetch('/app/api/me').catch(()=>null);state.account=account?.user;}
  if(!$('gymMode'))document.body.insertAdjacentHTML('beforeend','<div id="gymMode" class="gym-mode" hidden role="dialog" aria-modal="true" aria-label="Režim tréninku"></div>');
  const sets=gymSets();const first=gymNextOpen(sets,gymLastDone(sets));
  const draftKey=gymDraftKey();let saved;try{saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');}catch{}
  gymMode={pos:first<0?0:first,finished:first<0&&sets.length>0,rest:null,drafts:saved?.drafts||{},startedAt:saved?.startedAt||Date.now(),draftKey};$('gymMode').hidden=false;document.body.classList.add('gym-mode-open');renderGymMode();gymMode.clockTimer=setInterval(updateGymClock,10000);
}
function closeGymMode(){rememberGymDraft();clearInterval(gymMode?.timer);clearInterval(gymMode?.clockTimer);$('gymMode').hidden=true;document.body.classList.remove('gym-mode-open');gymMode=null;try{renderToday();}catch{}}
// Changes during the workout: swap, add or remove an exercise or a set.
// Saved sets are history: removing one asks first; drafts follow their rows.
function gymEditPanelHtml(cur,sets){
  const name=cur.r[1],open=sets.filter(x=>x.r[1]===name&&!gymSetDone(x)).length,confirm=gymMode.confirm;
  if(gymMode.panel==='swap'){
    const list=gymMode.alternatives;
    return '<div class="gm-edit"><h3>Vyměnit '+esc(name)+'</h3>'+(list==null?'<p class="small">Hledám náhrady pro stejnou partii…</p>':list.length?'<div class="gm-alt-list">'+list.map((a,i)=>'<button type="button" class="gm-alt" data-gm-alt="'+i+'"><strong>'+esc(a.name)+'</strong><small>'+esc(a.muscle)+' · '+esc(a.reps)+' op.'+(a.kg!=null?' · '+fmt(a.kg,1)+' kg':'')+(a.station?' · '+esc(a.station):'')+'</small></button>').join('')+'</div>':'<p class="small">Pro tuto partii tu jiný cvik není. Můžeš cvik odebrat a přidat jiný z katalogu.</p>')+(sets.some(x=>x.r[1]===name&&gymSetDone(x))?'<p class="small">Uložené série zůstanou, vymění se jen zbývající.</p>':'')+'<button type="button" class="btn" data-gm="edit">Zpět</button></div>';
  }
  return '<div class="gm-edit"><h3>Upravit trénink</h3><div class="gm-edit-grid">'+
    '<button type="button" class="btn" data-gm="swap">⇄ Vyměnit cvik</button>'+
    '<button type="button" class="btn" data-gm="add-set">＋ Přidat sérii</button>'+
    '<button type="button" class="btn'+(confirm==='remove-set'?' sheet-danger':'')+'" data-gm="remove-set">'+(confirm==='remove-set'?'Opravdu smazat uloženou sérii?':'− Odebrat tuto sérii')+'</button>'+
    '<button type="button" class="btn" data-gm="add-exercise">＋ Přidat cvik</button>'+
    '<button type="button" class="btn'+(confirm==='remove-exercise'?' sheet-danger':'')+'" data-gm="remove-exercise">'+(confirm==='remove-exercise'?(open?uiText('Opravdu vynechat zbývající série (', 'Really skip the remaining sets (')+open+')?':uiText('Opravdu smazat cvik i s uloženými sériemi?', 'Really delete the exercise with its saved sets?')):'🗑 Odebrat cvik')+'</button>'+
    '</div><button type="button" class="btn primary" data-gm="edit-close">Hotovo</button></div>';
}
async function editGymFromMode(change){
  if(!gymMode||gymMode.saving)return;rememberGymDraft();
  const sets=gymSets(),current=sets[gymMode.pos],drafts=gymMode.drafts;
  gymMode.saving=true;let edit;
  try{edit=await editGymPlan(rows=>change(rows,current?rows[current.i-7]:null));}
  catch(error){if(gymMode)gymMode.saving=false;toast('Úprava se neuložila: '+error.message);return;}
  if(!gymMode)return;gymMode.saving=false;gymMode.panel=null;gymMode.confirm=null;gymMode.alternatives=null;
  if(!edit){toast('Tuhle změnu nejde udělat.');return renderGymMode();}
  gymMode.drafts={};for(const [from,draft] of Object.entries(drafts)){const to=edit.moved.get(Number(from));if(to!=null)gymMode.drafts[to]=draft;}
  const after=gymSets(),target=edit.focus>=7?edit.focus:edit.moved.get(current?.i);let pos=after.findIndex(x=>x.i===target);
  if(pos<0)pos=gymNextOpen(after,gymMode.pos-1);
  gymMode.finished=pos<0&&after.length>0;gymMode.pos=Math.max(0,pos);gymMode.forIdx=null;gymMode.draftKey=gymDraftKey();rememberGymDraft();renderGymMode();
}
function renderGymMode(){
  const el=$('gymMode');if(!el||!gymMode)return;const sets=gymSets();
  if(!sets.length){el.innerHTML='<div class="gm-top"><button class="btn" data-gm="close">✕</button></div><div class="gm-empty"><h2>Dnes bez plánu</h2><p class="small">Nech trenéra sestavit trénink podle týdne a únavy.</p><button class="btn primary" data-gm="generate">Generovat trénink</button></div>';return wireGymMode();}
  const counted=gymCounted(sets),doneCount=sets.filter(gymSetDone).length,total=counted.length;
  if(gymMode.finished){const vol=sets.filter(gymSetDone).reduce((s,x)=>s+gymNumber(x.r[5],0)*gymNumber(x.r[6],0),0),missing=gymMissingWork(sets),allDone=!missing.length,byExercise=[...new Set(missing.map(x=>x.r[1]))].map(name=>esc(name)+' · '+missing.filter(x=>x.r[1]===name).length+'×');el.innerHTML='<div class="gm-top"><span></span><button class="btn" data-gm="close">✕</button></div><div class="gm-empty"><div class="gm-check">'+(allDone?'✓':'…')+'</div><h2>'+(allDone?'Trénink hotový':'Konec plánu')+'</h2><p>'+doneCount+' sérií · objem '+fmt(vol)+' kg</p>'+(allDone?'<button class="btn" data-gm="review">Prohlédnout série</button>':uiText('<p>Přeskočené pracovní série: ', '<p>Skipped work sets: ')+byExercise.join(', ')+'.</p><p class="small">Nemusíš je dodělávat, trénink se uloží i bez nich.</p><button class="btn" data-gm="resume">Doplnit přeskočené série</button>')+'<button class="btn primary" data-gm="close">'+(allDone?'Zavřít':'Ukončit trénink')+'</button></div>';return wireGymMode();}
  gymMode.pos=Math.max(0,Math.min(sets.length-1,gymMode.pos));const cur=sets[gymMode.pos],r=cur.r,name=r[1],warm=x=>String(x.r[0]).toUpperCase()==='WARMUP',same=sets.filter(x=>x.r[1]===name&&warm(x)===warm(cur)),k=same.findIndex(x=>x.i===cur.i)+1;
  const exercises=[...new Set(sets.map(x=>x.r[1]))],ex=exercises.indexOf(name)+1,done=String(r[8]).toUpperCase()==='TRUE';
  if(gymMode.forIdx!==cur.i)restoreGymDraft(cur,same);
  const rest=gymMode.rest?'<div class="gm-rest"><div class="gm-rest-ring" style="--p:'+(gymMode.rest.left/gymMode.rest.total*100)+'"><b>'+Math.floor(gymMode.rest.left/60)+':'+String(gymMode.rest.left%60).padStart(2,'0')+'</b><small>pauza</small></div><div class="gm-rest-actions"><button class="btn" data-gm="rest+">+30 s</button><button class="btn primary" data-gm="rest-skip">Pokračovat</button></div></div>':'';
  el.innerHTML='<div class="gm-top"><span class="small">Cvik '+ex+' / '+exercises.length+' · '+doneCount+' / '+total+' sérií</span><button class="btn" data-gm="close" aria-label="Zavřít režim tréninku">✕</button></div><div class="gm-progress"><i style="width:'+(total?doneCount/total*100:0)+'%"></i></div><div id="gmClock" class="gm-clock" role="status"></div>'+
    '<div class="gm-body" id="gmBody"><div class="eyebrow"'+(warm(cur)?' style="color:#f5c26b"':'')+'>'+(warm(cur)?uiText('Rozcvička ','Warm-up '):uiText('Série ','Set '))+k+uiText(' z ',' of ')+same.length+(done?uiText(' · ✓ hotovo',' · ✓ done'):'')+'</div><h2>'+esc(name)+'</h2><p class="small">'+uiText('Plán ','Plan ')+esc(r[3]||'—')+' kg × '+esc(r[4]||'—')+'</p>'+(()=>{const why=!warm(cur)&&String(r[9]||'').replace(/\s*\[Pauza \d+ s\]/g,'').split('; ').find(x=>/^(↑|↓|= |po delší pauze)/.test(x));return why?'<p class="small gm-why">'+esc(why)+'</p>':'';})()+(gymMode.panel?'':gymModeOptionsHtml(r,sets))+'<div class="gm-help"><button type="button" class="btn gm-technique" data-gm="technique">📖 Technika a video</button><button type="button" class="btn gm-edit-toggle" data-gm="edit" aria-pressed="'+Boolean(gymMode.panel)+'">✎ Upravit</button><button type="button" class="btn gm-assistant" data-gm="assistant" aria-label="Zeptat se AI trenéra">✦ AI</button></div>'+
    (gymMode.panel?gymEditPanelHtml(cur,sets):rest||'<div class="gm-steppers"><div><label class="label" for="gmKg">Váha · kg</label><div class="stepper"><button type="button" data-gm="kg-" aria-label="Ubrat 2,5 kg">−</button><input id="gmKg" type="text" inputmode="decimal" autocomplete="off" aria-label="Váha v kg" value="'+esc(gymMode.kgText??gymMode.kg??'')+'"><button type="button" data-gm="kg+" aria-label="Přidat 2,5 kg">+</button></div></div><div><label class="label" for="gmReps">Opakování</label><div class="stepper"><button type="button" data-gm="reps-" aria-label="Ubrat opakování">−</button><input id="gmReps" type="text" inputmode="numeric" autocomplete="off" aria-label="Počet opakování" value="'+esc(gymMode.repsText??gymMode.reps??'')+'"><button type="button" data-gm="reps+" aria-label="Přidat opakování">+</button></div></div></div><p class="gm-input-hint">Číslo můžeš napsat přímo. Rozepsané hodnoty se při přechodu zachovají.</p><div class="label" style="margin-top:10px">RPE (volitelně)</div><div class="gm-rpe">'+[1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" data-gm-rpe="'+n+'" aria-pressed="'+(gymMode.rpe===n)+'">'+n+'</button>').join('')+'</div><p class="gm-rpe-hint">'+(warm(cur)?uiText('Lehkou rozcvičku označ RPE 1–5 nebo RPE vynech.','Mark an easy warm-up RPE 1–5, or leave RPE out.'):uiText('6–7: velká rezerva · 8: asi 2 opakování · 9: asi 1 · 10: bez rezervy.','6–7: plenty in reserve · 8: about 2 reps left · 9: about 1 · 10: nothing left.'))+'</p><button type="button" class="btn primary gm-done" data-gm="done">'+(done?'Uložit znovu ✓':'Série hotová ✓')+'</button>')+
    '</div><div class="gm-nav"><button class="btn" data-gm="prev">◀ Předchozí</button><button class="btn" data-gm="next">Další ▶</button></div>';
  wireGymMode();updateGymClock();
}
function wireGymMode(){
  const el=$('gymMode');
  el.oninput=e=>{if(!gymMode||gymMode.saving)return;const key=e.target.id==='gmKg'?'kg':e.target.id==='gmReps'?'reps':null;if(!key)return;gymMode[key+'Text']=e.target.value;gymMode[key]=gymNumber(e.target.value);rememberGymDraft();};
  el.onclick=async e=>{const b=e.target.closest('[data-gm],[data-gm-rpe],[data-gm-alt]');if(!b||!gymMode||gymMode.saving)return;const a=b.dataset.gm,sets=gymSets();
    if(b.dataset.gmAlt){const alt=gymMode.alternatives?.[Number(b.dataset.gmAlt)],name=sets[gymMode.pos]?.r[1];return alt&&name?editGymFromMode(rows=>swapGymExercise(rows,name,alt)):undefined;}
    if(a==='edit'){rememberGymDraft();gymMode.panel=gymMode.panel==='edit'?null:'edit';gymMode.confirm=null;return renderGymMode();}
    if(a==='edit-close'){gymMode.panel=null;gymMode.confirm=null;return renderGymMode();}
    if(a==='swap'){const name=sets[gymMode.pos]?.r[1];gymMode.panel='swap';gymMode.alternatives=null;renderGymMode();
      try{const r=await jsonFetch('/app/api/gym/alternatives?date='+gymDay()+'&exercise='+encodeURIComponent(name));if(gymMode?.panel==='swap')gymMode.alternatives=r.alternatives||[];}
      catch(error){if(gymMode)gymMode.alternatives=[];toast('Náhrady se nenačetly: '+error.message);}
      return gymMode&&renderGymMode();}
    if(a==='add-set')return editGymFromMode((rows,row)=>row?addGymSet(rows,row[1]):null);
    if(a==='remove-set'){if(gymSetDone(sets[gymMode.pos])&&gymMode.confirm!=='remove-set'){gymMode.confirm='remove-set';return renderGymMode();}return editGymFromMode((rows,row)=>row?{rows:rows.filter(r=>r!==row)}:null);}
    if(a==='remove-exercise'){if(gymMode.confirm!=='remove-exercise'){gymMode.confirm='remove-exercise';return renderGymMode();}const name=sets[gymMode.pos]?.r[1];return editGymFromMode(rows=>removeGymExercise(rows,name));}
    if(a==='add-exercise'){rememberGymDraft();return openGymExercisePicker();}
    if(b.dataset.gmRpe){gymMode.rpe=gymMode.rpe===Number(b.dataset.gmRpe)?null:Number(b.dataset.gmRpe);gymMode.toFailure=gymMode.rpe===10;rememberGymDraft();return renderGymMode();}
    if(a==='close')return closeGymMode();
    if(a==='assistant'){rememberGymDraft();return openFloatingAssistant();}
    if(a==='technique'){rememberGymDraft();return openTechnique(sets[gymMode.pos]?.r[1]);}
    if(a==='resume'||a==='review'){gymMode.finished=false;gymMode.pos=a==='review'?0:Math.max(0,sets.indexOf(gymMissingWork(sets)[0]));gymMode.forIdx=null;return renderGymMode();}
    if(a==='generate'){b.disabled=true;b.textContent='Generuji…';try{await jsonFetch('/app/api/gym/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:gymDay()})});await loadGym();}catch(error){toast(error.message);}gymMode.pos=0;return renderGymMode();}
    if(a==='kg-'||a==='kg+'){gymMode.kg=Math.max(0,Math.round(((gymMode.kg??0)+(a==='kg+'?2.5:-2.5))*10)/10);gymMode.kgText=null;rememberGymDraft();return renderGymMode();}
    if(a==='reps-'||a==='reps+'){gymMode.reps=Math.max(0,(gymMode.reps??0)+(a==='reps+'?1:-1));gymMode.repsText=null;rememberGymDraft();return renderGymMode();}
    if(a==='prev'||a==='next')return moveGymMode(a==='next'?1:-1);
    if(a==='rest+'){gymMode.rest.left+=30;gymMode.rest.total+=30;return renderGymMode();}
    if(a==='rest-skip'){clearInterval(gymMode.timer);gymMode.rest=null;return renderGymMode();}
    if(a==='done'){if(!(gymMode.kg>=0&&gymMode.kg!=null&&gymMode.reps>0&&Number.isInteger(gymMode.reps)))return toast('Zadej nezápornou váhu a celý počet opakování.');rememberGymDraft();gymMode.saving=true;b.disabled=true;const cur=sets[gymMode.pos];try{await saveGymSet(cur.i,{kg:gymMode.kg,reps:gymMode.reps,rpe:gymMode.rpe});delete gymMode.drafts[cur.i];gymMode.forIdx=null;rememberGymDraft();gymMode.saving=false;}catch(error){gymMode.saving=false;toast('Série se neuložila: '+error.message);b.disabled=false;return}
      // Forward only: after the last set the summary lists anything skipped
      // instead of jumping back to an exercise that is already behind.
      const next=gymNextOpen(gymSets(),gymMode.pos);if(next<0){clearInterval(gymMode.timer);gymMode.rest=null;gymMode.finished=true;return renderGymMode();}
      gymMode.pos=next;const upcoming=gymSets()[gymMode.pos],seconds=gymRestSeconds(cur,upcoming);clearInterval(gymMode.timer);gymMode.rest=seconds?{left:seconds,total:seconds}:null;if(gymMode.rest)gymMode.timer=setInterval(()=>{if(!gymMode?.rest)return clearInterval(gymMode?.timer);gymMode.rest.left--;if(gymMode.rest.left<=0){clearInterval(gymMode.timer);gymMode.rest=null;try{navigator.vibrate?.(200)}catch{}}renderGymMode();},1000);return renderGymMode();}
  };
  // Swipe left / right between sets.
  let start=null;el.ontouchstart=e=>{start=e.target.closest('button,input,select,label,.stepper,.gm-rpe')?null:{x:e.touches[0].clientX,y:e.touches[0].clientY};};el.ontouchcancel=()=>{start=null;};el.ontouchend=e=>{if(!start||!gymMode)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;start=null;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5&&!gymMode.rest&&!gymMode.finished)moveGymMode(dx<0?1:-1);};
}

// Technique card of an exercise: setup, movement, mistakes, breathing and a
// video from the library (or the athlete's own link).
const techniqueCache=new Map();
function techniqueHtml(t){
  const list=(items,tag='ol')=>items.length?'<'+tag+'>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</'+tag+'>':'';
  const video=t.video?'<div class="tech-video"><iframe src="https://www.youtube-nocookie.com/embed/'+esc(t.video.id)+'?rel=0&playsinline=1" title="Video: '+esc(t.exercise)+'" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div><p class="small tech-video-note">'+(t.video.source==='own'?'Tvoje video':'Ukázka techniky'+(t.video.title?' · '+esc(t.video.title):''))+'</p>':(t.ownUrl?'<a class="btn" href="'+esc(t.ownUrl)+'" target="_blank" rel="noopener">▶ Tvoje video</a>':'');
  const meta=[t.muscles.join(', '),t.station].filter(Boolean).join(' · ');
  const feel=(t.feel||[]).length?'<h4>Kde to cítit</h4><ul class="tech-feel">'+t.feel.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'';
  const sourceNote=t.source==='library'?'<p class="small">Připravený návod z katalogu. Zobrazení nevolá AI.</p>':'';
  const body=t.steps.length?(t.setup.length?'<h4>Nastavení</h4>'+list(t.setup):'')+sourceNote+'<h4>Provedení</h4>'+list(t.steps)+feel+(t.mistakes.length?'<h4>Časté chyby</h4>'+list(t.mistakes,'ul'):'')+(t.breathing?'<h4>Dýchání</h4><p>'+esc(t.breathing)+'</p>':'')+(t.source==='ai'?'<p class="small">AI doplnila chybějící techniku pro cvik mimo katalog. Návod je uložený a společný; zobrazení jej znovu negeneruje. Pro vlastní úpravy se zeptej AI trenéra.</p>':''):'<p class="small">Popis techniky k tomuto cviku zatím chybí.</p>'+(t.note?'<p>'+esc(t.note)+'</p>':'');
  return '<div class="technique">'+(meta?'<p class="small tech-meta">'+esc(meta)+'</p>':'')+video+body+
    '<div class="tech-actions"><a class="btn" href="'+esc(t.searchUrl)+'" target="_blank" rel="noopener">Další videa na YouTube ↗</a><button type="button" class="btn" data-tech="ai">✦ Zeptat se AI trenéra</button></div>'+
    '<details class="tech-own"'+(t.ownUrl?' open':'')+'><summary>Vlastní video ke cviku</summary><p class="small">Odkaz z YouTube se přehraje přímo tady, jiný odkaz se otevře v prohlížeči.</p><input id="techOwnUrl" type="url" inputmode="url" placeholder="https://youtu.be/…" value="'+esc(t.ownUrl||'')+'"><div class="tech-own-actions"><button type="button" class="btn primary" data-tech="save">Uložit</button>'+(t.ownUrl?'<button type="button" class="btn" data-tech="remove">Odebrat</button>':'')+'</div></details></div>';
}
async function openTechnique(exercise,back=null){
  if(!exercise)return;
  const wire=body=>{if(back)body.insertAdjacentHTML('afterbegin','<button type="button" class="btn tech-back" data-tech="back">← Zpět na trénink</button>');body.onclick=async e=>{const b=e.target.closest('[data-tech]');if(!b)return;
    if(b.dataset.tech==='back')return back();
    if(b.dataset.tech==='ai'){closeSheet();return openFloatingAssistant('Jak správně provádět '+exercise+'? Na co si dát pozor?');}
    b.disabled=true;try{const r=await jsonFetch('/app/api/gym/technique',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exercise,url:b.dataset.tech==='remove'?'':$('techOwnUrl')?.value||''})});techniqueCache.set(exercise,r.technique);body.innerHTML=techniqueHtml(r.technique);wire(body);toast(b.dataset.tech==='remove'?'Vlastní video odebráno.':'Video uloženo.');}catch(error){toast(error.message);b.disabled=false;}};};
  const cached=techniqueCache.get(exercise);
  const sheet=openSheet(exercise,cached?techniqueHtml(cached):'<p class="small">Načítám techniku…</p>',body=>wire(body),'technique-sheet');
  if(cached)return;
  try{const r=await jsonFetch('/app/api/gym/technique?exercise='+encodeURIComponent(exercise));techniqueCache.set(exercise,r.technique);if(sheetStill(sheet)){$('sheetBody').innerHTML=techniqueHtml(r.technique);wire($('sheetBody'));}}
  catch(error){if(sheetStill(sheet)){$('sheetBody').innerHTML='<p>'+esc(error.message)+'</p><div class="tech-actions"><button type="button" class="btn" data-tech="ai">✦ Zeptat se AI trenéra</button></div>';wire($('sheetBody'));}}
}

function installPhoneLayer(){
  document.body.insertAdjacentHTML('beforeend','<button type="button" class="fab" id="quickAdd" aria-label="Rychle zapsat">+</button>');
  $('quickAdd').onclick=openQuickAdd;
  $('today').addEventListener('click',e=>{const go=e.target.closest('[data-go]');if(go){if(go.dataset.go==='water')openFluidSheet(selectedHistoryDate);else activate(go.dataset.go);return}const s=e.target.closest('[data-strip]');if(s){pickTodayDay(s.dataset.strip);return}const rv=e.target.closest('[data-review]');if(rv){openReviewSheet(rv.dataset.review);return}const ws=e.target.closest('[data-week-step]');if(ws){shiftTodayWeek(Number(ws.dataset.weekStep));return}const b=e.target.closest('[data-today]');if(b)todayAction(b);});
  // On a phone the small menus become bottom sheets.
  window.addEventListener('click',e=>{
    if(!isPhone())return;
    const tip=e.target.closest('.info-tip');
    if(tip){e.preventDefault();e.stopPropagation();const [title,...ps]=INFO_TEXTS[tip.dataset.info]||['Nápověda','Bez popisu.'];openSheet(title,infoParagraphs(ps));return}
  },true);
  // The gym panel gets the workout mode on every screen size.
  $('generateGym')?.insertAdjacentHTML('beforebegin','<button class="btn primary" id="startGymMode" type="button">▶ Režim tréninku</button>');
  $('startGymMode').onclick=openGymMode;
  const previous=load;load=async()=>{const plan=loadWeekPlan().catch(()=>{});await previous();await plan;renderToday();};
  const wasActivate=activate;activate=function(id){wasActivate(id);$('quickAdd').hidden=id==='settings';if(id!=='today'){const tl=$('dayTimeline'),pulse=$('dailyPulse');if(id==='overview'&&tl&&pulse)pulse.after(tl);}else renderToday();};
  let restored='today';try{const saved=localStorage.getItem('pfd-active-view');if($(saved)?.classList.contains('view'))restored=saved;}catch{}activate(restored);
}
installPhoneLayer();

// ---- Proposals for the plan of the week and the gym day ----
// "Vygenerovat tréninky" turns every open plan chip (today and later) into a
// concrete session: rides and runs from the generator (with the chip's length),
// gym days as a plan for that day. Nothing goes to Intervals.icu until asked.
async function proposeWeek(){
  return showAdaptiveWeekProposal();
}
// A server that is busy (D1 queue, CPU limit) answers with an error page or
// "overloaded": one more try after a pause usually goes through.
const TRANSIENT_ERROR=/Invalid response|overloaded|queued for too long|HTTP 5\d\d|exceeded|network|Failed to fetch/i;
function friendlyProposalError(message){return TRANSIENT_ERROR.test(String(message))?'Server byl přetížený, návrh se nepřipravil.':String(message||'Bez návrhu')}
// A gym day of the plan becomes a planned session at once: the exercises are
// generated and saved, the week shows it and its detail changes them.
async function planGymChip(x){
  const g=await jsonFetch('/app/api/gym/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:x.date,preview:true,durationMinutes:x.minutes,startTime:x.startTime,focus:x.role==='gym_upper'?'upper':undefined,focusSource:'week'})});
  const result={gym:new Set((g.plan?.rows||[]).map(r=>r?.[1]).filter(Boolean)).size,gymPreview:g,existing:x.existing};
  if(x.existing||!g.draftId)return result;
  const pending=showPendingAdd({id:'gym',name:g.plan?.planName||'Gym'},x.date,'gym');
  try{const r=await jsonFetch('/app/api/gym/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draftId:g.draftId})});
    settlePendingAdd(pending,true,r.eventId||null);if(r.intervals?.status==='error')toast('Gym je v plánu, zápis do Intervals.icu selhal: '+r.intervals.message);
    if(gymDay()===x.date)loadGym().catch(()=>{});
    return {...result,scheduled:true};}
  catch(error){settlePendingAdd(pending,false);if(/již existuje gym plán/.test(error.message))return {...result,scheduled:true};throw error;}
}
// Gym chips in the week (today and later) once the plan has been quiet for 5 s.
let autoGymRunning=false;
async function autoPlanGym(list){
  if(autoGymRunning||state.proposalsBusy||statusPausesTraining())return;
  state.proposals=state.proposals||{};const todo=list.filter(x=>!state.proposals[x.key]);if(!todo.length)return;
  autoGymRunning=true;
  try{for(const x of todo){if(state.proposals[x.key])continue;state.proposals[x.key]={status:'busy'};renderWeekHub();
      try{state.proposals[x.key]=await planGymChip(x);}catch(error){state.proposals[x.key]={error:friendlyProposalError(error.message),item:x};}}}
  finally{autoGymRunning=false;reloadWeek();}
}
async function proposalFor(x){
  if(x.sport==='gym')return planGymChip(x);
  const r=await jsonFetch('/app/api/workouts/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:x.date,sport:x.sport,environment:x.environment||'auto',availabilityMinutes:x.minutes})});
  return r.status==='ok'?{workout:r.workout,result:r,existing:x.existing}:{error:r.message||'Bez návrhu',item:x};
}
// One proposal at a time (the server builds each from the whole week), with
// one retry after a pause when the server was only busy. Returns how it went.
async function generateWeekProposals(items){
  const revision=statusCoachingRevision,b=$('proposeWeek'),done={ok:0,failed:[]};
  b.disabled=true;state.proposals=state.proposals||{};state.proposalsBusy=true;
  try{
    let n=0;for(const x of items){if(revision!==statusCoachingRevision)return done;n++;$('plannerStatus').textContent='Připravuji '+n+' / '+items.length+'…';const key=proposalKey(x.date,x.sport,x.slot);state.proposals[key]={status:'busy',existing:x.existing};renderWeekHub();renderDeploySteps();
      let result=null;
      for(let attempt=0;attempt<2&&!result;attempt++){
        try{result=await proposalFor(x);}
        catch(error){if(attempt===0&&TRANSIENT_ERROR.test(error.message)){await new Promise(r=>setTimeout(r,2500));continue;}result={error:friendlyProposalError(error.message),item:x};}
      }
      if(revision!==statusCoachingRevision)return done;
      state.proposals[key]=result;if(result.error)done.failed.push(x);else done.ok++;
      renderWeekHub();queueProposalPush();
    }
    const open=Object.values(state.proposals).filter(proposalWaiting).length;
    $('plannerStatus').innerHTML='Hotovo · připraveno '+done.ok+(done.failed.length?' · nepovedlo se '+done.failed.length+' <button type="button" class="btn" id="proposeRetry">Zkusit znovu</button>':'')+(open?uiText(' <button type="button" class="btn" id="proposeAddAll">Uložit do plánu hned (', ' <button type="button" class="btn" id="proposeAddAll">Save to the plan now (')+open+')</button>':'');
    const all=$('proposeAddAll');if(all)all.onclick=addAllProposals;
    const again=$('proposeRetry');if(again)again.onclick=()=>generateWeekProposals(done.failed);
    renderDeploySteps();
    return done;
  }finally{b.disabled=false;state.proposalsBusy=false;}
}
async function scheduleProposal(key){
  const pr=state.proposals?.[key];if(!pr?.workout||pr.existing)return false;const [date,sport]=key.split('|');
  pr.scheduled=true;const pending=showPendingAdd(pr.workout,date,sport);
  try{const r=await jsonFetch('/app/api/workouts/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workoutId:pr.workout.id,date,confirm:true,environment:pr.result?.environment||'outdoor'})});settlePendingAdd(pending,r.status!=='already_scheduled',r.eventId);}
  catch(error){pr.scheduled=false;settlePendingAdd(pending,false);throw error;}
  return true;
}
// ---- Approved proposals go to Intervals.icu by themselves, in the same 15 s
// as the other plan changes (moves, deletes). Until then "Nezapisovat" keeps
// one out; leaving the page sends the rest at once.
let proposalPushTimer=null;
// A gym proposal waits for "Potvrdit trénink" in its preview, rides and runs go by themselves.
function proposalWaiting(p){return Boolean(p?.workout&&!p.existing&&!p.scheduled&&!p.skip&&!p.deploying);}
function gymProposalOpen(p){return Boolean(p?.gymPreview&&!p.existing&&!p.scheduled);}
function queueProposalPush(){
  clearTimeout(proposalPushTimer);
  const waiting=Object.values(state.proposals||{}).filter(proposalWaiting),now=Date.now();
  for(const p of waiting)p.pushAt??=now+INTERVALS_DELAY_MAX_MS;
  if(waiting.length)proposalPushTimer=setTimeout(()=>pushApprovedProposals(),Math.max(0,Math.min(...waiting.map(p=>p.pushAt))-now));
  renderDeploySteps();
}
async function deployProposal(key){
  const pr=state.proposals[key];
  if(pr.gymPreview){
    const [date]=key.split('|'),plan=pr.gymPreview.plan||{},pending=showPendingAdd({id:'gym',name:plan.planName||'Posilovna'},date,'gym');
    try{const r=await jsonFetch('/app/api/gym/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draftId:pr.gymPreview.draftId}),keepalive:true});pr.scheduled=true;settlePendingAdd(pending,true);if(r.intervals?.status==='error')toast('Gym je uložený, zápis do Intervals.icu selhal: '+r.intervals.message);}
    catch(error){settlePendingAdd(pending,false);throw error;}
    return true;
  }
  return scheduleProposal(key);
}
async function pushApprovedProposals(all=false){
  clearTimeout(proposalPushTimer);
  if(statusPausesTraining()){for(const p of Object.values(state.proposals||{}))if(proposalWaiting(p))p.skip=true;renderWeekHub();return renderDeploySteps();}
  const keys=Object.keys(state.proposals||{}).filter(k=>proposalWaiting(state.proposals[k])&&(all||state.proposals[k].pushAt<=Date.now()+250));
  for(const k of keys){const pr=state.proposals[k];pr.deploying=true;renderDeploySteps();
    try{await deployProposal(k);}catch(error){pr.skip=true;pr.deployError=error.message;toast(uiText('Uložení tréninku selhalo: ', 'Saving the workout failed: ')+error.message);}
    finally{pr.deploying=false;}
  }
  renderWeekHub();queueProposalPush();
}
async function addAllProposals(){await pushApprovedProposals(true);const live=Object.values(state.proposals||{}).filter(p=>p.scheduled&&!p.existing).length;$('plannerStatus').textContent='✓ '+live+uiText(' v plánu aplikace', ' in the app plan');}
window.addEventListener('pagehide',()=>{if(Object.values(state.proposals||{}).some(proposalWaiting))pushApprovedProposals(true);});
// Where a plan stands: generated, approved, in Intervals.icu. Shown under the
// week plan and in the assistant's answer, updated as it goes.
function deployStepsHtml(keys=null){
  const list=(keys?keys.map(k=>state.proposals?.[k]).filter(Boolean):Object.values(state.proposals||{})).filter(p=>!p.existing&&!p.item?.existing);if(!list.length)return '';
  const busy=list.filter(p=>p.status==='busy').length,ready=list.filter(p=>p.workout||p.gymPreview).length,failed=list.filter(p=>p.error).length;
  const waiting=list.filter(proposalWaiting).length,deploying=list.filter(p=>p.deploying).length,live=list.filter(p=>p.scheduled).length,kept=list.filter(p=>p.skip&&!p.scheduled).length,gymOpen=list.filter(gymProposalOpen).length;
  const step=(cls,label,detail)=>'<li class="'+cls+'"><b>'+label+'</b>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</li>';
  return '<ol class="deploy-steps" role="status" aria-live="polite">'+
    (busy?step('active','Generuji',ready+' z '+list.length):step(ready?'done':'fail',ready?'✓ Vygenerováno':'Vygenerováno',ready+' z '+list.length+(failed?' · '+failed+' se nepovedlo':'')))+
    (gymOpen?step('active','Ke schválení',gymOpen+' gym · otevři návrh a potvrď'):step(ready?'done':'',ready?'✓ Schváleno':'Schváleno',ready?'automaticky':''))+
    (waiting||deploying?step('active','Nasazuji',deploying?'ukládám do aplikace…':uiText('do plánu aplikace do 15 s · ', 'to the app plan within 15 s · ')+waiting):live?step('done','✓ Nasazeno',live+uiText(' v plánu aplikace', ' in the app plan')+(kept?' · '+kept+uiText(' nezapsáno', ' not written'):'')):step(kept?'fail':'','Nasazeno',kept?kept+uiText(' nezapsáno', ' not written'):''))+
  '</ol>';
}
function renderDeploySteps(){document.querySelectorAll('[data-deploy-steps]').forEach(el=>{el.innerHTML=deployStepsHtml(el.dataset.deploySteps?el.dataset.deploySteps.split(','):null);});}
function installProposals(){
  $('proposeWeek').onclick=proposeWeek;
  if(!document.querySelector('#hubWeek [data-deploy-steps],[data-deploy-steps].hub-deploy'))$('plannerStatus').insertAdjacentHTML('afterend','<div class="hub-deploy" data-deploy-steps></div>');
  $('hubWeek').addEventListener('click',async e=>{
    const b=e.target.closest('[data-proposal]');if(!b)return;e.stopPropagation();
    const key=proposalKey(b.dataset.date,b.dataset.sport||'gym',b.dataset.slot),pr=state.proposals?.[key];
    if(b.dataset.proposal==='retry'&&pr?.item){await generateWeekProposals([pr.item]);return}
    if(b.dataset.proposal==='keep'&&pr){pr.skip=true;renderWeekHub();queueProposalPush();return;}
    if(b.dataset.proposal==='add'&&pr){b.disabled=true;pr.skip=false;pr.deployError=null;try{pr.deploying=true;renderDeploySteps();await deployProposal(key);toast((pr.workout?.name||'Posilovna')+uiText(' je v plánu aplikace.', ' is in the app plan.'));}catch(error){toast(uiText('Zápis selhal: ', 'Saving failed: ')+error.message);b.disabled=false;}finally{pr.deploying=false;renderWeekHub();renderDeploySteps();}}
    if(b.dataset.proposal==='open'){state.generatedVariant=0;await openDailyRecommendation({date:b.dataset.date,sport:b.dataset.sport,generated:{...pr.result,existing:pr.existing},title:'Návrh na '+longDate(b.dataset.date)});}
    if(b.dataset.proposal==='gym'){if(pr?.gymPreview)openGymPreview(b.dataset.date,pr);else openTrainingDetail({kind:'gym',date:b.dataset.date,sport:'gym'});}
  },true);
  // Gym: any day, not only today.
  const input=$('gymDate');input.value=gymDay();input.min=dateShift(localToday(),-30);
  input.onchange=()=>openGymDay(input.value,false);
  const previous=load;load=async()=>{await previous();if(gymDay()!==localToday())await loadGym().catch(()=>{});};
}
async function openGymDay(date,show=true){
  state.gymDate=date||localToday();$('gymDate').value=state.gymDate;
  if(show){activate('workouts');setWorkoutSport('gym');}
  try{await loadGym();}catch(error){toast(error.message);}
  renderGymPlanHint();
}
installProposals();

// ---- Doporučené tréninky: the workout library in one dialog ----
// Opened from the planner button (first the daily recommendation when today
// has no plan), from a day's proposal on a plan chip (the five best workouts
// for that day, other focuses one tap away) or with a generated workout.
const ROLE_SYSTEM={endurance:'endurance',long:'endurance',recovery:'recovery',quality:''};
const REC_SYSTEMS={ride:['endurance','tempo','sweet_spot','threshold','vo2max','anaerobic','sprint','recovery'],run:['endurance','tempo','threshold','vo2max','anaerobic','sprint','recovery']};
function showRecommendDialog(){const d=$('recommendDialog');if(!d.open){try{d.showModal();}catch{d.show();}}d.querySelector('.recommend-scroll').scrollTop=0;}
function setRecSport(sport){state.recSport=sport==='run'?'run':'ride';syncRecSportUi();}
function renderRecommendChrome(){
  const ctx=state.recContext,sys=$('workoutSystem').value,sport=workoutSport();
  $('recommendFocus').innerHTML=[['',ctx?.role==='quality'?'Kvalita · vybere trenér':'Doporučí trenér'],...REC_SYSTEMS[sport].map(k=>[k,capabilityLabel(k)])].map(([k,label])=>'<button type="button" class="btn focus-tab'+(sys===k?' primary':'')+'" data-rec-system="'+k+'" aria-pressed="'+(sys===k)+'">'+esc(label)+(ctx&&(ROLE_SYSTEM[ctx.role]??null)===k?' <small>★ návrh dne</small>':'')+'</button>').join('');
  const parts=[];const dur=$('workoutDuration').value,load=$('workoutLoad').value,diff=$('workoutDifficulty').value,phase=$('workoutPhase');
  parts.push(dur?dur+' min ± '+$('workoutDurationTolerance').value:'délka podle trenéra');if(load)parts.push('~'+load+' TSS');if(diff)parts.push('obtížnost ≤ '+diff);if(phase.value)parts.push(phase.selectedOptions[0].textContent);
  if($('workoutSort')?.value!=='recommended')parts.push($('workoutSort')?.selectedOptions[0]?.textContent||'');
  parts.push($('workoutEnvironment').value==='indoor'?'indoor':'outdoor');if($('workoutScheduleDate').value)parts.push(dateLabel($('workoutScheduleDate').value));
  $('recommendFilterSummary').textContent=parts.join(' · ');
}
function renderRecommendTarget(){
  const el=$('recommendTarget'),ctx=state.recContext;el.hidden=!ctx;if(!ctx)return;
  const minutes=num(ctx.minutes),tss=num(ctx.tss),intensity=intensityOf(tss,minutes);
  el.innerHTML='<span class="eyebrow">'+esc(longDate(ctx.date))+' · '+esc(HUB_SPORTS[ctx.sport])+(ctx.environment?' · '+(ctx.environment==='indoor'?'indoor':'venku'):'')+'</span><strong>'+esc([minutes?hm(minutes):'',tss?'~'+tss+' TSS':'',intensity?'IF '+dec(intensity,2):'',ctx.label].filter(Boolean).join(' · '))+'</strong><span class="small">Nejvhodnější tréninky na tento den. Jiné zaměření vybereš níže.</span><button type="button" class="btn" id="clearRecommendTarget">Celá knihovna</button>';
  $('clearRecommendTarget').onclick=()=>{state.recContext=null;$('workoutDuration').value='';$('workoutLoad').value='';$('workoutSystem').value='';renderRecommendTarget();loadWorkoutLibrary();};
}
// What today already holds: planned sessions, plan chips or a gym plan.
function todayHasPlan(){
  const today=localToday(),day=[...(state.week?.days||[]),...(state.hubWeekData?.days||[])].find(d=>d.date===today);
  const planned=(day?.daily?.training?.planned||[]).some(p=>!isNutritionItem(p)&&activitySport(p));
  const chips=state.weekPlan&&(state.weekPlan.start||state.hubWeek)===localMonday()?(state.weekPlan.prefs?.days?.[weekdayOf(today)]||[]).length>0:false;
  const gym=state.gym?.date===today&&!state.gym.cancelled&&(state.gym.values||[]).slice(7).some(r=>r?.[1]);
  return planned||chips||gym;
}
// Any sport for a free day: the main sport, or gym when it has been a while
// and the main sport was trained recently.
function dailySport(){
  const today=localToday(),last={};
  for(const d of [...(state.week?.days||[]),...(state.hubWeekData?.days||[])])if(d.date<=today)for(const a of d.daily?.training?.completed||[]){const sport=activitySport(a);if(sport&&(!last[sport]||d.date>last[sport]))last[sport]=d.date;}
  for(const r of state.gym?.history||[]){const date=String(r.workout_date||r.date||'').slice(0,10);if(date&&date<=today&&(!last.gym||date>last.gym))last.gym=date;}
  const ago=sport=>last[sport]?Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(last[sport]+'T12:00:00Z'))/864e5):null;
  const focus=savedProfile().mainSport||'general';
  if(focus==='general'){const sport=['gym','run','ride'].sort((a,b)=>(ago(b)??Infinity)-(ago(a)??Infinity))[0];return {sport,reason:uiText('Všeobecná kondice: střídáme sílu a vytrvalost podle posledních tréninků.','General fitness: alternate strength and endurance based on recent training.')};}
  const main={running:'run',strength:'gym'}[focus]||'ride';
  const endurance=main==='gym'?'ride':main;
  if(main!=='gym'&&(ago('gym')==null||ago('gym')>=4)&&ago(endurance)!=null&&ago(endurance)<=1)return {sport:'gym',reason:ago('gym')==null?'Posilovnu tu zatím nevidím a '+HUB_SPORTS[endurance]+' bylo nedávno – síla je dobrý doplněk.':'Posilovna byla naposledy před '+ago('gym')+' dny, '+HUB_SPORTS[endurance]+' včera nebo dnes.'};
  return {sport:main,reason:main==='gym'?'Hlavní sport je silový trénink.':ago(main)==null?'Podle hlavního sportu.':'Hlavní sport, naposledy před '+ago(main)+' '+(ago(main)===1?'dnem':'dny')+'.'};
}
function renderDailySports(active){
  $('dailyRecSports').innerHTML=['ride','run','gym'].map(sport=>'<button type="button" class="btn'+(sport===active?' primary':'')+'" data-daily-sport="'+sport+'" aria-pressed="'+(sport===active)+'">'+HUB_SPORTS[sport]+'</button>').join('');
}
async function generateDailyGym(date){
  const el=$('generatedWorkout');el.innerHTML='<div class="small">Sestavuji gym…</div>';
  try{
    const g=await jsonFetch('/app/api/gym/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,preview:true,focusSource:'week'})}),plan=g.plan||{};
    const groups=[];for(const row of plan.rows||[]){if(!row?.[1])continue;let x=groups.find(g=>g.name===row[1]);if(!x){x={name:row[1],sets:0,reps:row[4],kg:row[3]};groups.push(x);}x.sets++;}
    el.innerHTML='<article class="workout-result generated"><div><div class="eyebrow">'+esc(longDate(date))+' · '+HUB_SPORTS.gym+'</div><h3 style="margin:3px 0">'+esc(plan.planName||'Silový trénink')+'</h3>'+(plan.rationale?'<p>'+esc(plan.rationale)+'</p>':'')+'<div class="gym-preview-rows">'+groups.map(x=>'<div><b>'+esc(x.name)+'</b><span>'+x.sets+' × '+esc(x.reps||'—')+(x.kg?' · '+esc(x.kg)+' kg':'')+'</span></div>').join('')+'</div><div class="workout-filter-actions" style="margin-top:10px;flex-wrap:wrap"><button type="button" class="btn primary" id="saveDailyGym">Uložit tento gym plán</button><button type="button" class="btn" id="openDailyGym">Upravit v gymu</button></div></div></article>';
    $('saveDailyGym').onclick=async()=>{const b=$('saveDailyGym');b.disabled=true;try{const r=await jsonFetch('/app/api/gym/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draftId:g.draftId})});$('recommendDialog').close();toast(r.intervals?.status==='error'?'Gym je uložený, zápis do Intervals selhal: '+r.intervals.message:'Gym plán uložený.');await openGymDay(date);state.hubWeekData=null;await refreshAfterPlanChange();}catch(error){toast(error.message);b.disabled=false;}};
    $('openDailyGym').onclick=()=>{$('recommendDialog').close();openTrainingDetail({kind:'gym',date,sport:'gym'});};
  }catch(error){el.innerHTML='<div class="notice status-error">'+esc(error.message)+'</div>';}
}
async function runDailyRecommendation(sport,date){
  renderDailySports(sport);state.dailySport=sport;
  if(sport==='gym'){$('generateWorkoutBtn').hidden=true;$('generateEnvironment').closest('label').hidden=true;await generateDailyGym(date);return}
  $('generateWorkoutBtn').hidden=false;$('generateEnvironment').closest('label').hidden=false;
  if(workoutSport()!==sport){setRecSport(sport);loadWorkoutLibrary();}
  await generateWorkoutForDay(0);
}
// The daily recommendation section: a generated workout for one day.
async function openDailyRecommendation({date=localToday(),sport=null,generated=null,title=null,reason='',libraryContext=null}={}){
  const pick=sport?{sport,reason}:dailySport();
  state.recContext=libraryContext;$('generateDate').value=date;$('generateMinutes').value='';
  $('workoutScheduleDate').value=date>=localToday()?date:localToday();
  $('workoutDuration').value='';$('workoutLoad').value='';$('workoutSystem').value='';
  $('dailyRecommendation').hidden=false;$('dailyRecEyebrow').textContent=generated?'Detail návrhu':'Denní doporučení';
  $('dailyRecTitle').textContent=title||(date===localToday()?'Na dnešek nemáš nic v plánu':'Trénink na '+longDate(date));$('dailyRecReason').textContent=pick.reason||'';
  if(pick.sport!=='gym')setRecSport(pick.sport);
  renderRecommendTarget();showRecommendDialog();
  if(generated){renderDailySports(pick.sport);$('generateWorkoutBtn').hidden=false;state.generated=generated;renderGeneratedWorkout(generated);}
  else runDailyRecommendation(pick.sport,date);
  loadWorkoutLibrary();
}
// From the planner button: the daily recommendation only when today is free.
async function openRecommendations(){
  if(!todayHasPlan()){await openDailyRecommendation({});return}
  state.recContext=null;$('dailyRecommendation').hidden=true;$('generatedWorkout').innerHTML='';
  $('workoutDuration').value='';$('workoutLoad').value='';$('workoutSystem').value='';$('workoutScheduleDate').value=localToday();
  if(state.workoutSport!=='gym')setRecSport(state.workoutSport);
  renderRecommendTarget();showRecommendDialog();loadWorkoutLibrary();
}
// A day's proposal on a plan chip.
function openChipSuggestion(data){
  if(data.sport==='gym'){openTrainingDetail({kind:'gym',date:data.date,sport:'gym'});return}
  const ctx={date:data.date,sport:data.sport,role:data.role,label:data.label,minutes:data.minutes?Number(data.minutes):null,tss:data.tss?Number(data.tss):null,environment:data.env==='indoor'?'indoor':'outdoor'};
  $('workoutEnvironment').value=ctx.environment;
  state.recContext=ctx;$('dailyRecommendation').hidden=true;$('generatedWorkout').innerHTML='';
  setRecSport(ctx.sport);$('generateDate').value=ctx.date;
  $('workoutScheduleDate').value=ctx.date>=localToday()?ctx.date:localToday();
  $('workoutDuration').value=ctx.minutes||'';$('workoutDurationTolerance').value=ctx.minutes>=150?'30':'15';$('workoutLoad').value='';$('workoutSystem').value=ROLE_SYSTEM[ctx.role]??'';
  if(ctx.role==='recovery')$('workoutDifficulty').value='';
  renderRecommendTarget();showRecommendDialog();loadWorkoutLibrary();
}
function installRecommendations(){
  const dialog=$('recommendDialog');document.body.appendChild(dialog);
  $('openRecommendations').onclick=()=>openRecommendations();
  $('closeRecommend').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{state.replaceEvent=null;});
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.querySelectorAll('[data-rec-sport]').forEach(b=>b.onclick=()=>{setRecSport(b.dataset.recSport);if(state.recContext&&state.recContext.sport!==b.dataset.recSport){state.recContext=null;renderRecommendTarget();}loadWorkoutLibrary();});
  $('recommendFocus').addEventListener('click',e=>{const b=e.target.closest('[data-rec-system]');if(!b)return;$('workoutSystem').value=b.dataset.recSystem;loadWorkoutLibrary();});
  $('dailyRecSports').addEventListener('click',e=>{const b=e.target.closest('[data-daily-sport]');if(b){$('dailyRecReason').textContent='';runDailyRecommendation(b.dataset.dailySport,$('generateDate').value||localToday());}});
  $('hideDailyRec').onclick=()=>{$('dailyRecommendation').hidden=true;};
  let open=false;try{open=localStorage.getItem('pfd-rec-filters')==='open';}catch{}
  const setFilters=v=>{$('recommendFilters').hidden=!v;$('toggleRecommendFilters').setAttribute('aria-expanded',String(v));$('toggleRecommendFilters').textContent=v?'⚙ Skrýt filtry':'⚙ Filtry';try{localStorage.setItem('pfd-rec-filters',v?'open':'closed');}catch{}};
  setFilters(open);$('toggleRecommendFilters').onclick=()=>setFilters($('recommendFilters').hidden);
  $('resetRecommendFilters').onclick=()=>{for(const id of ['workoutDuration','workoutLoad'])$(id).value='';for(const id of ['workoutSystem','workoutDifficulty','workoutPhase'])$(id).value='';$('workoutSort').value='recommended';$('workoutDurationTolerance').value='15';loadWorkoutLibrary();};
  for(const id of ['workoutDuration','workoutLoad'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadWorkoutLibrary();}});
  syncRecSportUi();
}
installRecommendations();
// Personal calorie target: everyday activity, sport (only without a connected
// source), weekly goal and target weight, stored with the rest of the profile.
// Without weight or a complete profile the server returns no target; say what
// is missing instead of showing 0 kcal.
const ENERGY_MISSING={weight:'váha',sex:'pohlaví',age:'datum narození',height:'výška',activity:'denní aktivita',goal:'cíl',sportHours:'sport za týden'};
function installEnergyProfile(){
  const form=$('fitnessProfileForm');if(!form)return;
  const select=(id,label,options)=>'<label>'+label+'<select class="food-input" id="'+id+'"><option value="">Vyber</option>'+options.map(([v,t])=>'<option value="'+v+'">'+esc(t)+'</option>').join('')+'</select></label>';
  form.querySelector('button.primary').insertAdjacentHTML('beforebegin',
    select('profileActivity','Pohyb přes den mimo trénink (práce, chůze, venčení psa)',ACTIVITY_OPTIONS)+
    select('profileSportHours','Sport za týden · nepovinný odhad',[['auto','Automaticky z historie'],...SPORT_HOURS_OPTIONS])+
    select('profileGoal','Cíl',GOAL_OPTIONS)+
    '<label>Cílová váha · kg<input id="profileTargetWeight" class="food-input" type="number" min="35" max="250" step="0.1"></label>');
  $('profileAge').parentElement.insertAdjacentHTML('beforebegin','<label>Datum narození<input id="profileBirthDate" class="food-input" type="date"></label>');
  // With a birth date the age is computed (and stays current); the age field shows it.
  const syncAge=()=>{const age=ageFromBirthDate($('profileBirthDate').value);$('profileAge').readOnly=age!=null;if(age!=null)$('profileAge').value=age;};
  $('profileBirthDate').addEventListener('input',syncAge);
  const fields=[['profileSex','sex'],['profileBirthDate','birthDate'],['profileAge','age'],['profileHeight','height'],['profileHrmax','hrmax'],['profileRhr','rhr'],['profileActivity','activity'],['profileSportHours','sportHours'],['profileGoal','goal'],['profileTargetWeight','targetWeight']];
  const fill=()=>{const p=savedProfile();for(const [id,key] of fields)if($(id))$(id).value=p[key]??'';syncAge();};
  fill();
  // The server profile wins, so the form is the same on every device.
  jsonFetch('/app/api/profile').then(r=>{
    if(r?.profile){const server=Object.fromEntries(Object.entries(r.profile).filter(([,v])=>v!==null&&v!==''));localStorage.setItem('fitnessProfile',JSON.stringify({...savedProfile(),...server}));fill();}
    // What the app works out itself stays automatic (it is refreshed daily) and
    // shows as the placeholder of an empty field; a typed value overrides it.
    const s=r?.suggestions||{};
    const sportAuto=$('profileSportHours').querySelector('option[value=auto]'),history=s.trainingHistory;
    sportAuto.disabled=!history?.automaticSportAvailable;sportAuto.textContent=history?.automaticSportAvailable?uiText('Automaticky z historie · ', 'Automatic from history · ')+fmt(history.weeklyHours,1)+uiText(' h týdně', ' h a week'):'Automaticky · čeká na historii';
    if(history?.automaticSportAvailable&&!$('profileSportHours').value)$('profileSportHours').value='auto';
    try{localStorage.setItem('fitnessProfileSuggested',JSON.stringify(s));}catch{}
    const auto=(id,value,text)=>{if(!value||!$(id))return;if($(id).tagName==='SELECT')$(id).options[0].textContent='Automaticky: '+text;else $(id).placeholder='Automaticky: '+text;};
    auto('profileHeight',s.height,s.height+' (Google Health)');
    auto('profileActivity',s.activity,({sedentary:'sedavý',light:'lehce aktivní',active:'aktivní',heavy:'velmi aktivní'}[s.activity]||s.activity)+' · '+Number(s.averageSteps).toLocaleString('cs-CZ')+' kroků/den');
    auto('profileRhr',s.rhr,s.rhr+uiText(' (průměr 30 dní)', ' (30-day average)'));
    auto('profileHrmax',s.hrmax,s.hrmax+(s.sources?.hrmax==='age-estimate'?uiText(' (odhad podle věku, upřesní se z aktivit)', ' (estimate from age, refined from activities)'):uiText(' (max. z aktivit, 6 měs.)', ' (max from activities, 6 months)')));
    // A date field has no placeholder: show the Google birth date under it.
    if(s.birthDate&&!$('profileBirthDate').value&&!$('profileBirthDateAuto')){$('profileBirthDate').insertAdjacentHTML('afterend',uiText('<small class="small" id="profileBirthDateAuto">Automaticky z Google účtu: ', '<small class="small" id="profileBirthDateAuto">Automatically from your Google account: ')+esc(dateFormat({day:'numeric',month:'numeric',year:'numeric'}).format(new Date(s.birthDate+'T12:00:00Z')))+'</small>');const age=ageFromBirthDate(s.birthDate);if(age!=null&&!$('profileAge').value)$('profileAge').placeholder='Automaticky: '+age;}
    try{renderExperience();}catch{}
  }).catch(()=>{});
  const previous=form.onsubmit;form.onsubmit=e=>{e.preventDefault();localStorage.setItem('fitnessProfile',JSON.stringify({...savedProfile(),birthDate:$('profileBirthDate').value,activity:$('profileActivity').value,sportHours:$('profileSportHours').value,goal:$('profileGoal').value,targetWeight:$('profileTargetWeight').value}));return previous(e);};
}
function renderEnergyProfileNotice(){
  const n=state.daily?.nutrition||{},missing=n.calorieTarget==null&&state.daily?.status==='ok'?(n.missing||[]):[];
  for(const view of ['overview','nutrition']){const host=$(view);if(!host)continue;let box=host.querySelector('.energy-profile-notice');
    if(!missing.length){box?.remove();continue;}
    if(!box){box=document.createElement('article');box.className='card energy-profile-notice';box.style.margin='0 0 16px';host.prepend(box);}
    const needsWeight=missing.includes('weight'),needsProfile=missing.some(k=>k!=='weight');
    box.innerHTML='<h3>Kalorický cíl zatím nepočítám</h3><p class="small">Chybí: '+esc(missing.map(k=>ENERGY_MISSING[k]||k).join(', '))+'.</p><div class="select-row">'+(needsWeight?'<button class="btn primary" type="button" data-energy="weight">Zapsat váhu</button>':'')+(needsProfile?'<button class="btn'+(needsWeight?'':' primary')+'" type="button" data-energy="profile">Doplnit profil</button>':'')+'</div>';
    box.querySelectorAll('[data-energy]').forEach(b=>b.onclick=()=>{if(b.dataset.energy==='weight')return openWeightSheet();openSettings('profile','fitnessProfileForm');});}
}
installEnergyProfile();
const renderNutritionWithoutNotice=renderNutrition;renderNutrition=function(){renderNutritionWithoutNotice();renderEnergyProfileNotice();};

// ---- Výživa like a food diary app: day overview with drinks, meals, quick logging ----
// Drinks of the shown day and the day's target, from /app/api/fluids.
const FLUID_KINDS=[['water','💧','Voda'],['coffee','☕','Káva'],['tea','🍵','Čaj'],['milk','🥛','Mléko'],['other','🧃','Jiné']];
function fluidLabel(ml){return ml>=1000?cz(ml/1000,2)+' l':fmt(ml)+' ml';}
async function loadFluids(date=nutritionDay()){try{const r=await jsonFetch('/app/api/fluids?date='+date);state.fluids={...(state.fluids||{}),[date]:r};}catch{}renderDayOverview();if(date===selectedHistoryDate){renderDayTimeline();if($('today')?.classList.contains('active'))renderToday();}return state.fluids?.[date];}
async function addFluidDrink(date,ml,kind='water'){
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:USER_TZ,hour:'2-digit',minute:'2-digit'}).format(new Date());
  // Counted on the screen at once; the saved day replaces it.
  const at=date+'T'+(date===localToday()?now:'12:00'),f=state.fluids?.[date];
  if(f){f.entries=[...(f.entries||[]),{id:'pending',date,consumedAt:at,ml,kind}];f.totalMl=num(f.totalMl)+ml;renderDayOverview();if(date===selectedHistoryDate)try{renderDayTimeline();}catch{}}
  toast('💧 +'+fluidLabel(ml));
  try{await jsonFetch('/app/api/fluids',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,ml,kind,at})});}catch(error){toast(uiText('Pití se neuložilo: ', 'The drink wasn\'t saved: ')+error.message);}
  await loadFluids(date);
}
function openFluidSheet(date=nutritionDay()){
  const f=state.fluids?.[date],entries=f?.entries||[];let kind='water';
  openSheet('Pití · '+(date===localToday()?'dnes':longDate(date)),'<p class="small">'+(f?fluidLabel(f.totalMl)+' z '+fluidLabel(f.target.ml):'Načítám…')+'</p><div class="fluid-kinds" role="group" aria-label="Nápoj">'+FLUID_KINDS.map(([k,i,l])=>'<button type="button" class="btn'+(k==='water'?' active':'')+'" data-kind="'+k+'">'+i+' '+l+'</button>').join('')+'</div><div class="fluid-amounts">'+[150,250,330,500,750].map(ml=>'<button type="button" class="btn" data-ml="'+ml+'">+'+ml+' ml</button>').join('')+'</div><div class="food-controls"><input id="fluidCustom" class="food-input" inputmode="numeric" placeholder="Jiné množství v ml"><button type="button" class="btn primary" id="fluidCustomAdd">Přidat</button></div>'+(entries.length?'<h3 style="margin:14px 0 6px">Zapsáno</h3>'+entries.slice().reverse().map(e=>e.kind==='food'?'<div class="fluid-row"><span>🍽 '+esc(String(e.consumedAt).slice(11,16))+' · '+esc(e.name)+'<small>z jídelníčku'+(e.alcohol?' · alkohol se do pití nepočítá':'')+'</small></span><strong>'+(e.alcohol?'0 ml':fluidLabel(e.ml))+'</strong><span></span></div>':'<div class="fluid-row"><span>'+(FLUID_KINDS.find(x=>x[0]===e.kind)?.[1]||'💧')+' '+esc(String(e.consumedAt).slice(11,16))+'</span><strong>'+fluidLabel(e.ml)+'</strong><button type="button" class="btn" data-delete-fluid="'+e.id+'" aria-label="Smazat">✕</button></div>').join(''):''),body=>{
    body.onclick=async e=>{const k=e.target.closest('[data-kind]');if(k){kind=k.dataset.kind;body.querySelectorAll('[data-kind]').forEach(b=>b.classList.toggle('active',b===k));return}
      const a=e.target.closest('[data-ml]');if(a){await addFluidDrink(date,Number(a.dataset.ml),kind);openFluidSheet(date);return}
      if(e.target.id==='fluidCustomAdd'){const ml=Number(String($('fluidCustom').value).replace(',','.'));if(!(ml>=10&&ml<=3000))return toast('Zadej 10–3000 ml.');await addFluidDrink(date,ml,kind);openFluidSheet(date);return}
      const d=e.target.closest('[data-delete-fluid]');if(d){try{await jsonFetch('/app/api/fluids?id='+d.dataset.deleteFluid,{method:'DELETE'});await loadFluids(date);openFluidSheet(date);}catch(error){toast(error.message);}}};
  });
}
// The day the food diary shows.
function nutritionDay(){return $('foodDate')?.value||selectedHistoryDate||localToday();}
function dayNutrition(date){return date===selectedHistoryDate?state.daily?.nutrition:state.week?.days?.find(d=>d.date===date)?.daily?.nutrition||null;}
function mealTotals(entries){return entries.reduce((s,e)=>{for(const k of ['kcal','protein_g','carbs_g','fat_g'])s[k]+=num(e[k]);return s},{kcal:0,protein_g:0,carbs_g:0,fat_g:0});}

// Denní přehled: eaten / remaining / burned, macros and drinks.
function renderDayOverview(){
  const el=$('dayOverview');if(!el)return;
  const date=nutritionDay(),n=dayNutrition(date)||{},target=num(n.calorieTarget),m=n.macros||{},eaten=mealTotals((mealEntries||[]).filter(e=>(e.consumed_date||date)===date));
  const training=date===selectedHistoryDate?state.daily?.training?.completed||[]:[],burned=measured(n.energyBudget?.active)?num(n.energyBudget.active):training.filter(a=>!isNutritionItem(a)).reduce((s,a)=>s+num(a.calories),0);
  const left=target-eaten.kcal,p=target?Math.min(100,eaten.kcal/target*100):0;
  const macro=(label,v,t,c)=>'<div class="do-macro"><span>'+label+'</span><i><b style="width:'+(t?Math.min(100,v/t*100):0)+'%;background:'+c+'"></b></i><small>'+fmt(v)+' / '+(t?fmt(t):'—')+' g</small></div>';
  const f=state.fluids?.[date],water=f?Math.min(100,f.totalMl/Math.max(1,f.target.ml)*100):0;
  if(!f&&!(state.fluidRequests||=new Set()).has(date)){state.fluidRequests.add(date);loadFluids(date);}
  el.innerHTML='<div class="do-head"><h3>Denní přehled</h3><small>'+esc(date===localToday()?uiText('Dnes','Today'):dayTitle(date))+'</small></div>'+
    '<div class="do-ring-row"><div><b>'+fmt(eaten.kcal)+'</b><span>Snědeno</span></div><div class="do-ring" style="--p:'+p+'"><b>'+(target?fmt(Math.abs(left)):'—')+'</b><span>'+(target?left>=0?'Zbývá kcal':'Nad cílem':'Cíl chybí')+'</span></div><div><b>'+(burned?fmt(burned):'—')+'</b><span>'+(measured(n.energyBudget?.active)?'Aktivní výdej dne':'Aktivní výdej')+'</span><small class="do-burned-source">'+(measured(n.energyBudget?.active)?'Google · veškerý pohyb dne':uiText('Ze záznamů aktivit','From activity records'))+'</small></div></div>'+
    '<div class="do-macros">'+macro('Sacharidy',eaten.carbs_g,num(m.carbs_g??m.carbsGrams),'#ffb347')+macro('Bílkoviny',eaten.protein_g,num(m.protein_g??m.proteinGrams),'#6fb7ff')+macro('Tuky',eaten.fat_g,num(m.fat_g??m.fatGrams),'#b48cff')+'</div>'+
    hydrationOverviewHtml(date,f,water);
  installHydrationOverview(el,date);
}
function hydrationOverviewHtml(date,f,progress){
  const draft=(state.fluidDrafts||={})[date]||={kind:'water',custom:''},entries=(f?.entries||[]).slice().reverse().slice(0,3);
  return '<section class="do-water"><div class="do-water-head"><div><h4>Pití'+infoTip('water','pití')+'</h4></div><div class="hydration-total"><strong>'+(f?fluidLabel(f.totalMl):'…')+'</strong><span>'+uiText('Cíl ','Goal ')+(f?fluidLabel(f.target.ml):'…')+'</span></div></div><i class="do-water-bar"><b style="width:'+progress+'%"></b></i><div class="hydration-kinds" role="group" aria-label="Druh nápoje">'+FLUID_KINDS.map(([kind,icon,label])=>'<button type="button" data-water-kind="'+kind+'" class="hydration-kind'+(draft.kind===kind?' active':'')+'" aria-pressed="'+(draft.kind===kind)+'"><span aria-hidden="true">'+icon+'</span>'+label+'</button>').join('')+'</div><div class="do-water-actions">'+[150,250,330,500,750,1000].map(ml=>'<button type="button" class="btn" data-water="'+ml+'">+ '+(ml===1000?'1 l':ml+' ml')+'</button>').join('')+'</div><form class="hydration-custom" id="inlineFluidForm"><label class="sr-only" for="inlineFluidAmount">Vlastní množství nápoje v ml</label><div><input id="inlineFluidAmount" inputmode="decimal" type="text" placeholder="Vlastní množství" value="'+esc(draft.custom)+'"><span>ml</span></div><button type="submit" class="btn primary">Přidat</button></form>'+(entries.length?'<div class="hydration-recent"><div class="hydration-recent-head"><span>Poslední zápisy</span><button type="button" data-water-more>Všechny zápisy ↗</button></div>'+entries.map(entry=>{const kind=FLUID_KINDS.find(k=>k[0]===entry.kind)||['food','🍽',entry.name||'Nápoj'];return '<div class="hydration-entry"><span>'+kind[1]+'</span><div><strong>'+esc(entry.name||kind[2])+'</strong><small>'+esc(String(entry.consumedAt||'').slice(11,16))+(entry.kind==='food'?' · z jídelníčku':'')+'</small></div><b>'+fluidLabel(entry.ml)+'</b>'+(entry.kind!=='food'?'<button type="button" data-inline-delete-fluid="'+entry.id+'" aria-label="Smazat '+esc(kind[2])+' '+entry.ml+' ml">×</button>':'<span></span>')+'</div>';}).join('')+'</div>':'<button class="hydration-history-link" type="button" data-water-more>Historie pití ↗</button>')+'</section>';
}
function installHydrationOverview(el,date){
  const draft=state.fluidDrafts[date];
  el.querySelectorAll('[data-water-kind]').forEach(b=>b.onclick=()=>{draft.kind=b.dataset.waterKind;renderDayOverview();});
  const amount=$('inlineFluidAmount');amount.oninput=()=>{draft.custom=amount.value;};
  const add=async(button,ml)=>{button.disabled=true;try{await addFluidDrink(date,ml,draft.kind);}finally{if(button.isConnected)button.disabled=false;}};
  el.querySelectorAll('[data-water]').forEach(b=>b.onclick=()=>add(b,Number(b.dataset.water)));
  $('inlineFluidForm').onsubmit=async e=>{e.preventDefault();const ml=Number(amount.value.trim().replace(',','.'));if(!(ml>=10&&ml<=3000))return toast('Zadej 10–3000 ml.');draft.custom='';await add(e.target.querySelector('[type=submit]'),ml);};
  el.querySelector('[data-water-more]').onclick=()=>openFluidSheet(date);
  el.querySelectorAll('[data-inline-delete-fluid]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await jsonFetch('/app/api/fluids?id='+b.dataset.inlineDeleteFluid,{method:'DELETE'});await loadFluids(date);}catch(error){toast(error.message);b.disabled=false;}});
}

// Meals as compact rows: eaten / target, the foods, + to log into that meal.
const MEAL_ICON={breakfast:'☕',snack_am:'🍎',lunch:'🍝',snack_pm:'🥨',dinner:'🥗',unassigned:'🍽'};
function renderMealList(){
  const el=$('mealList');if(!el)return;
  const date=nutritionDay(),n=dayNutrition(date)||{},target=num(n.calorieTarget),active=mealSlots.filter(s=>mealEnabled.includes(s.id)),weight=active.reduce((s,x)=>s+x.share,0)||1,entries=(mealEntries||[]).filter(e=>(e.consumed_date||date)===date),open=new Set(state.openMeals||[]);
  const rows=active.map(s=>({id:s.id,name:s.name,share:s.share/weight,entries:entries.filter(e=>foodMealSlot(e)===s.id)}));
  const other=entries.filter(e=>!mealEnabled.includes(foodMealSlot(e)));if(other.length)rows.push({id:'other',name:'Ostatní',share:0,entries:other});
  el.innerHTML='<div class="do-head"><h3>Jídla</h3><button type="button" class="btn ml-settings" id="mealSettings">Upravit jídla</button></div>'+rows.map(r=>{const t=mealTotals(r.entries),isOpen=open.has(r.id);return '<div class="ml-row'+(isOpen?' open':'')+'" data-meal-row="'+r.id+'"><button type="button" class="ml-main" data-meal-toggle-row="'+r.id+'" aria-expanded="'+isOpen+'"><span class="ml-icon">'+(MEAL_ICON[r.id]||'🍽')+'</span><span class="ml-text"><strong>'+esc(r.name)+'</strong><small>'+fmt(t.kcal)+(r.share&&target?' / '+fmt(target*r.share):'')+' kcal'+(r.entries.length?' · '+esc(r.entries.map(e=>e.recipe_title||'Jídlo').join(', ')):'')+'</small></span></button>'+(r.id==='other'?'':'<button type="button" class="ml-add" data-meal-add="'+r.id+'" aria-label="Zapsat do: '+esc(r.name)+'">+</button>')+
    (isOpen?'<div class="ml-entries">'+(r.entries.length?r.entries.map(e=>'<div class="ml-entry"><span>'+esc(e.recipe_title||'Jídlo')+'<small>'+fmt(e.kcal)+' kcal · B '+fmt(e.protein_g)+' · S '+fmt(e.carbs_g)+' · T '+fmt(e.fat_g)+' g</small>'+foodAssessmentHtml(e,{dayTarget:target,date})+foodExportHtml(e)+'</span>'+(e.id?'<span class="ml-entry-actions"><button type="button" class="btn" data-meal-move="'+esc(e.id)+'">Přesunout</button><button type="button" class="btn" data-meal-copy="'+esc(e.id)+'">Kopírovat</button><button type="button" class="btn" data-meal-edit="'+esc(e.id)+'">Upravit</button></span>':'')+'</div>').join(''):'<p class="small">Zatím nic. Přidej jídlo tlačítkem +.</p>')+'</div>':'')+'</div>';}).join('')+
    '<div id="mealSettingsBox" hidden><p class="small">Která jídla během dne sleduješ:</p><div class="meal-preferences">'+mealSlots.map(s=>'<label><input type="checkbox" data-meal-pref="'+s.id+'" '+(mealEnabled.includes(s.id)?'checked':'')+'> '+s.name+'</label>').join('')+'</div></div>';
  el.onclick=e=>{
    const add=e.target.closest('[data-meal-add]');if(add){startMealLog(add.dataset.mealAdd);return}
    const retry=e.target.closest('[data-food-sync]');if(retry){retry.disabled=true;jsonFetch('/app/api/food/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(retry.dataset.foodSync)})}).then(()=>{toast('Zápis do Google zkouším znovu.');loadEnteredFood();}).catch(error=>{toast(error.message);retry.disabled=false;});return}const edit=e.target.closest('[data-meal-edit]');if(edit){openFoodManage(edit.dataset.mealEdit);return}
    const move=e.target.closest('[data-meal-move]');if(move){openFoodQuickSheet(move.dataset.mealMove,'move');return}
    const copy=e.target.closest('[data-meal-copy]');if(copy){openFoodQuickSheet(copy.dataset.mealCopy,'copy');return}
    const row=e.target.closest('[data-meal-toggle-row]');if(row){const id=row.dataset.mealToggleRow,s=new Set(state.openMeals||[]);s.has(id)?s.delete(id):s.add(id);state.openMeals=[...s];renderMealList();return}
    if(e.target.id==='mealSettings'){$('mealSettingsBox').hidden=!$('mealSettingsBox').hidden;}
  };
  el.querySelectorAll('[data-meal-pref]').forEach(input=>input.onchange=()=>{const selected=[...el.querySelectorAll('[data-meal-pref]:checked')].map(i=>i.dataset.mealPref);if(!selected.length){input.checked=true;return toast('Nech vybrané alespoň jedno jídlo.');}mealEnabled=selected;try{localStorage.setItem('pfd-meals-v1',JSON.stringify(selected));}catch{}renderMealDiary();});
}
// Move a logged food to another meal or day, or copy it to other days, in two taps.
function openFoodQuickSheet(id,mode){
  const entry=(mealEntries||[]).find(e=>String(e.id)===String(id));if(!entry)return;
  const from=entry.consumed_date||nutritionDay(),slot=foodMealSlot(entry),today=localToday();
  const days=[-1,0,1,2,3,4,5,6].map(i=>dateShift(today,i)).filter(d=>mode==='copy'?d!==from:true);
  const dayLabel=d=>d===today?'Dnes':d===dateShift(today,-1)?'Včera':d===dateShift(today,1)?'Zítra':dateFormat({weekday:'short',day:'numeric',month:'numeric'}).format(new Date(d+'T12:00:00Z'));
  const type=mode==='copy'?'checkbox':'radio';
  openSheet((mode==='copy'?'Kopírovat: ':'Přesunout: ')+(entry.recipe_title||'jídlo'),
    '<p class="small">'+(mode==='copy'?'Vyber dny a část dne pro kopii.':'Vyber, kam jídlo patří.')+'</p>'+
    '<div class="label">Část dne</div><div class="copy-days quick-meals">'+mealSlots.map(s=>'<label><input type="radio" name="quickMeal" value="'+s.id+'" '+(s.id===(slot==='unassigned'?mealByTime():slot)?'checked':'')+'> '+(MEAL_ICON[s.id]||'')+' '+esc(s.name)+'</label>').join('')+'</div>'+
    '<div class="label">Den</div><div class="copy-days quick-days">'+days.map(d=>'<label><input type="'+type+'" name="quickDay" value="'+d+'" '+(mode==='move'&&d===from?'checked':'')+'> '+esc(dayLabel(d))+'</label>').join('')+'</div>'+
    '<button type="button" class="btn primary" id="quickFoodApply">'+(mode==='copy'?'Kopírovat':'Přesunout')+'</button>',
    body=>{body.querySelector('#quickFoodApply').onclick=async()=>{
      const button=body.querySelector('#quickFoodApply'),meal=body.querySelector('[name=quickMeal]:checked')?.value,targets=[...body.querySelectorAll('[name=quickDay]:checked')].map(i=>i.value);
      if(!targets.length)return toast('Vyber den.');button.disabled=true;
      try{
        if(mode==='move'){await jsonFetch('/app/api/food/entry',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:entry.id,date:targets[0],mealType:meal})});toast('Přesunuto: '+(mealSlots.find(s=>s.id===meal)?.name||'jídlo')+' · '+dayLabel(targets[0]).toLowerCase()+'.');}
        else{for(const targetDate of targets){const copy=await jsonFetch('/app/api/food/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:entry.id,targetDate})});if(copy?.id&&meal&&meal!==slot)await jsonFetch('/app/api/food/entry',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:copy.id,mealType:meal})});}toast('Zkopírováno do: '+targets.map(d=>dayLabel(d).toLowerCase()).join(', ')+'.');}
        closeSheet();await refreshFoodDiary();
      }catch(error){toast((mode==='copy'?'Kopie':'Přesun')+' selhal: '+error.message);button.disabled=false;}
    };});
}
// After a food is added (any way: search, label, photo, quick add, assistant)
// a short note says what it brought and what is left for the day.
let knownFoodIds=null,knownFoodDate=null;
function foodFeedbackAfterLoad(){
  const date=nutritionDay(),ids=new Set((mealEntries||[]).map(e=>String(e.id)));
  if(knownFoodIds&&knownFoodDate===date){
    const added=(mealEntries||[]).filter(e=>!knownFoodIds.has(String(e.id))&&(e.consumed_date||date)===date);
    if(added.length){
      const n=dayNutrition(date)||{},target=num(n.calorieTarget),t=mealTotals(mealEntries.filter(e=>(e.consumed_date||date)===date)),a=mealTotals(added),protein=num(n.macros?.proteinGrams);
      const tag=foodAssessment(added.length===1?added[0]:{...a,consumed_date:date},{dayTarget:target,date}).find(([kind])=>kind!=='info');
      const slotName=mealSlots.find(s=>s.id===foodMealSlot(added[0]))?.name;
      toast('Zapsáno'+(slotName?' do: '+slotName.toLowerCase():'')+' · '+fmt(a.kcal)+' kcal · B '+fmt(a.protein_g)+' g'+(tag?' · '+tag[1]:'')+'.'+(target?' Dnes zbývá '+fmt(Math.max(0,target-t.kcal))+' kcal'+(protein?' a '+fmt(Math.max(0,protein-t.protein_g))+' g bílkovin':'')+'.':''));
    }
  }
  knownFoodIds=ids;knownFoodDate=date;
}
// "+" on a meal: log into it.
function startMealLog(slot){openFoodLogger(slot);}
function setFoodMeal(slot){if(!$('foodMeal'))return;$('foodMeal').value=slot;document.querySelectorAll('[data-meal-chip]').forEach(b=>b.classList.toggle('active',b.dataset.mealChip===slot));const add=$('foodAddDirect');if(add)add.textContent='Přidat · '+(mealSlots.find(s=>s.id===slot)?.name||'jídlo');}
function mealByTime(){const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:USER_TZ,hour:'2-digit',hourCycle:'h23'}).format(new Date()));return h<10?'breakfast':h<12?'snack_am':h<15?'lunch':h<18?'snack_pm':'dinner';}

// Rolling amount picker: whole number, fraction and portion, like a phone's date wheel.
const WHEEL_FRACTIONS=[[0,'–'],[1/8,'⅛'],[1/4,'¼'],[1/3,'⅓'],[1/2,'½'],[2/3,'⅔'],[3/4,'¾']];
function wheelColumn(items,index,onPick){
  const col=document.createElement('div');col.className='wheel-col';col.innerHTML='<div class="wheel-pad"></div>'+items.map((x,i)=>'<div class="wheel-item" data-i="'+i+'">'+esc(x.label)+'</div>').join('')+'<div class="wheel-pad"></div>';
  let timer=null,silent=false;const H=36;
  col.set=i=>{silent=true;col.scrollTop=Math.max(0,i)*H;col.querySelectorAll('.wheel-item').forEach(el=>el.classList.toggle('on',Number(el.dataset.i)===i));setTimeout(()=>{silent=false;},80);};
  col.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{const i=Math.max(0,Math.min(items.length-1,Math.round(col.scrollTop/H)));col.querySelectorAll('.wheel-item').forEach(el=>el.classList.toggle('on',Number(el.dataset.i)===i));if(!silent)onPick(items[i],i);},90);});
  col.addEventListener('click',e=>{const it=e.target.closest('.wheel-item');if(it)col.scrollTo({top:Number(it.dataset.i)*H,behavior:'smooth'});});
  requestAnimationFrame(()=>col.set(index));return col;
}
function installAmountWheel(){
  const picker=document.querySelector('#foodEditor .simple-food-picker');if(!picker||$('amountWheel'))return;
  const box=document.createElement('div');box.id='amountWheel';box.className='amount-wheel';picker.after(box);
  document.querySelector('#foodEditor .simple-food-fractions')?.setAttribute('hidden','');
  const amountInput=$('simpleFoodAmount'),portionSelect=$('simpleFoodPortion');let building=false;
  const grams=()=>{const o=portionSelect.selectedOptions[0];return o&&/^\s*1\s*(g|ml)\b/i.test(o.textContent);};
  function build(){
    if(building)return;building=true;try{
    box.innerHTML='';const amount=Math.max(0,parseFoodQuantity(amountInput.value)||0),fine=grams();
    const wholes=fine?Array.from({length:401},(_,i)=>({value:i*5,label:String(i*5)})):Array.from({length:31},(_,i)=>({value:i,label:String(i)}));
    const whole=fine?Math.round(amount/5):Math.floor(amount+1e-6),rest=amount-Math.floor(amount+1e-6),fi=WHEEL_FRACTIONS.reduce((b,f,i)=>Math.abs(f[0]-rest)<Math.abs(WHEEL_FRACTIONS[b][0]-rest)?i:b,0);
    let w=Math.min(wholes.length-1,whole),fr=fine?0:fi;
    const apply=()=>{const v=wholes[w].value+(fine?0:WHEEL_FRACTIONS[fr][0]);amountInput.value=fine||!WHEEL_FRACTIONS[fr][0]?String(v):v<1?(['','1/8','1/4','1/3','1/2','2/3','3/4'][fr]):String(Math.round(v*1000)/1000).replace('.',',');amountInput.dispatchEvent(new Event('input',{bubbles:true}));};
    box.append(wheelColumn(wholes,w,(x,i)=>{w=i;apply();}));
    if(!fine)box.append(wheelColumn(WHEEL_FRACTIONS.map(([v,l])=>({value:v,label:l})),fr,(x,i)=>{fr=i;apply();}));
    const options=[...portionSelect.options].map(o=>({value:o.value,label:o.textContent}));
    box.append(wheelColumn(options,Math.max(0,portionSelect.selectedIndex),x=>{if(portionSelect.value===x.value)return;portionSelect.value=x.value;portionSelect.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(build,0);}));
    box.classList.toggle('two',fine);
    }finally{building=false;}
  }
  amountInput.addEventListener('change',build);portionSelect.addEventListener('change',()=>setTimeout(build,0));
  const select=selectFoodProduct;selectFoodProduct=function(p){select(p);setTimeout(build,0);};
}

// Live barcode scanning with the camera: the native detector where the browser
// has one, ZXing elsewhere (iPhone). A code fills the EAN and searches; an
// unknown product is looked up with AI right away.
let scanStop=null;
// One camera stream per visit: each scanner gets a clone, so scanning the
// next product doesn't ask for camera access again (iPhone asks on every new
// request, above all in the app added to the home screen). Between scans the
// stream is disabled and it is released after a longer pause.
const CAMERA_IDLE_MS=10*60*1000;
let cameraStream=null,cameraRequest=null,cameraIdleTimer=null;
function releaseCamera(){clearTimeout(cameraIdleTimer);cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;}
async function borrowCamera(){
  clearTimeout(cameraIdleTimer);
  if(!cameraStream?.getVideoTracks().some(t=>t.readyState==='live')){
    cameraRequest??=navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}).then(s=>{s.getTracks().forEach(t=>{t.enabled=false;});cameraStream=s;return s;}).finally(()=>{cameraRequest=null;});
    await cameraRequest;
  }
  const copy=cameraStream.clone();copy.getTracks().forEach(t=>{t.enabled=true;});return copy;
}
function returnCamera(copy){copy?.getTracks().forEach(t=>t.stop());clearTimeout(cameraIdleTimer);cameraIdleTimer=setTimeout(releaseCamera,CAMERA_IDLE_MS);}
addEventListener('pagehide',releaseCamera);
async function openBarcodeScanner(){
  openSheet('Skenovat čárový kód','<div class="scan-box"><video id="scanVideo" playsinline muted autoplay></video><div class="scan-frame"></div></div><p class="small" id="scanStatus">Spouštím kameru…</p><div class="food-controls"><input id="scanManual" class="food-input" inputmode="numeric" placeholder="Nebo opiš číslo EAN"><button type="button" class="btn" id="scanManualOk">OK</button></div><label class="btn sheet-wide scan-photo">📷 Vyfotit místo skenování<input hidden id="scanPhoto" type="file" accept="image/*" capture="environment"></label>',body=>{
    $('scanManualOk').onclick=()=>{const code=$('scanManual').value.replace(/\D/g,'');if(!/^\d{8,14}$/.test(code))return toast('EAN má 8–14 číslic.');barcodeFound(code);};
    $('scanPhoto').onchange=e=>{const file=e.target.files[0];closeSheet();openFoodLogger();readFoodPhoto(file,'barcode');};
  });
  const video=$('scanVideo'),status=$('scanStatus');let stream=null,stop=null;
  // Closing the sheet while the camera starts must not leave it running.
  const gone=()=>!video.isConnected||!document.body.classList.contains('sheet-open');
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Prohlížeč nemá přístup ke kameře.');
    const native='BarcodeDetector'in window&&(await BarcodeDetector.getSupportedFormats?.().catch(()=>[]))?.includes?.('ean_13');
    let ZX=null;if(!native){status.textContent='Načítám čtečku…';ZX=await loadFoodLibrary('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js','ZXingBrowser');}
    if(gone())return;
    stream=await borrowCamera();
    if(native){
      let live=true;stop=scanStop=()=>{live=false;returnCamera(stream);};if(gone()){stopScanner();return}
      video.srcObject=stream;await video.play().catch(()=>{});
      const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});
      const tick=async()=>{if(!live)return;try{const codes=await detector.detect(video);const code=codes.find(c=>/^\d{8,14}$/.test(c.rawValue))?.rawValue;if(code){barcodeFound(code);return}}catch{}setTimeout(tick,200);};tick();
    }else{
      if(gone()){returnCamera(stream);return}
      const reader=new ZX.BrowserMultiFormatReader(zxingHints(ZX));
      const controls=await reader.decodeFromStream(stream,video,result=>{const code=result?.getText?.();if(code&&/^\d{8,14}$/.test(code))barcodeFound(code);});
      stop=scanStop=()=>{controls.stop();returnCamera(stream);};if(gone()){stopScanner();return}
    }
    status.textContent='Namiř kameru na čárový kód.';
  }catch(error){if(stream&&!stop)returnCamera(stream);status.textContent=(error?.name==='NotAllowedError'?'Přístup ke kameře je zakázaný. Povol ho v nastavení prohlížeče, nebo kód vyfoť či opiš.':'Kameru se nepodařilo spustit: '+(error?.message||error))+'';}
}
function stopScanner(){try{scanStop?.();}catch{}scanStop=null;}
async function barcodeFound(code){
  stopScanner();navigator.vibrate?.(60);closeSheet();openFoodLogger();
  await lookupBarcode(code);
}

function installNutritionHome(){
  const nutrition=$('nutrition');if(!nutrition||$('dayOverview'))return;
  nutrition.insertAdjacentHTML('afterbegin','<div class="nutrition-home"><article class="card day-overview" id="dayOverview"></article><article class="card meal-list" id="mealList"></article></div>');
  $('mealList').closest('.nutrition-home').after($('foodEntry'));
  // Meals and "what next" share the right column, so it is as tall as the day overview.
  const side=document.createElement('div');side.className='meal-column';$('mealList').before(side);side.append($('mealList'));const next=$('mealDistribution'),grid=next?.parentElement;if(next){side.append(next);grid?.classList.add('single');}
  // Meals: breakfast, two snacks, lunch, dinner (the diary's five slots).
  const meal=$('foodMeal');if(meal){meal.innerHTML=mealSlots.map(s=>'<option value="'+s.id+'">'+s.name+'</option>').join('');meal.value=mealByTime();}
  // Short labels that fit a phone; the barcode button opens the live scanner.
  const barcodeLabel=$('foodBarcodePhoto')?.closest('label');
  if(barcodeLabel){barcodeLabel.insertAdjacentHTML('beforebegin','<button type="button" class="btn food-quick" id="foodScan">▥<span>Skenovat</span></button>');barcodeLabel.hidden=true;$('foodScan').onclick=openBarcodeScanner;}
  const relabel=(el,icon,text)=>{if(!el)return;const input=el.querySelector('input');el.textContent='';el.classList.add('food-quick');el.insertAdjacentHTML('afterbegin',icon+'<span>'+text+'</span>');if(input)el.append(input);};
  relabel($('foodLabelPhoto')?.closest('label'),'📷','Etiketa');relabel($('foodPortionPhoto')?.closest('label'),'🍽','Moje porce');relabel($('foodManual'),'✎','Ručně');
  const hint=[...$('foodEntry').querySelectorAll('.small')].find(x=>/Hledá v tvých uložených/.test(x.textContent));if(hint)hint.textContent='Nejdřív hledám ve tvých potravinách a společném katalogu; co neznám, dohledám přes AI.';
  $('foodBarcode').placeholder='EAN';
  // Meal chips in the food editor and a button that logs straight into that meal.
  const add=$('ingredientAdd');
  if(add){add.insertAdjacentHTML('beforebegin','<div class="meal-chips" role="group" aria-label="Do kterého jídla">'+mealSlots.map(s=>'<button type="button" class="btn" data-meal-chip="'+s.id+'">'+(MEAL_ICON[s.id]||'')+' '+s.name.replace('Dopolední svačina','Svačina dop.').replace('Odpolední svačina','Svačina odp.')+'</button>').join('')+'</div><button type="button" class="btn primary simple-food-add" id="foodAddDirect">Přidat</button>');
    add.textContent='+ Složit jídlo z více potravin';add.classList.remove('primary','simple-food-add');add.classList.add('food-compose');
    $('foodEntry').addEventListener('click',e=>{const chip=e.target.closest('[data-meal-chip]');if(chip)setFoodMeal(chip.dataset.mealChip);});
    $('foodAddDirect').onclick=async()=>{const button=$('foodAddDirect');button.disabled=true;try{await saveFoodEntry({preventDefault(){}});}finally{button.disabled=false;}};
    setFoodMeal($('foodMeal').value);}
  // Cookbook by name or page.
  const recipeInput=$('recipeRequest');if(recipeInput){recipeInput.placeholder='Název receptu nebo strana, např. rizoto, strana 70';recipeInput.closest('div').previousElementSibling.textContent='Z kuchařky';const tip=recipeInput.closest('div').nextElementSibling;if(tip?.classList.contains('small'))tip.textContent='Hledej podle názvu nebo čísla strany. Porce napiš třeba „1,5 porce rizota“.';
    const byPage=$('recipeLookup').onclick;$('recipeLookup').textContent='Najít recept';
    // The amount goes through the editor's amount field, so the wheel follows.
    const setPortions=text=>{const q=text.match(/(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*porc/i)?.[1];if(q&&$('simpleFoodAmount')){$('simpleFoodAmount').value=q;$('simpleFoodAmount').dispatchEvent(new Event('input',{bubbles:true}));$('simpleFoodAmount').dispatchEvent(new Event('change',{bubbles:true}));}};
    $('recipeLookup').onclick=async()=>{const text=recipeInput.value.trim();if(/(?:str[aá]n(?:ka|ky|ce|u|a)?|page)\s*\d{1,3}|^\s*\d{1,3}\s*$/i.test(text)){await byPage();setPortions(text);return}
      const name=text.replace(/\d+(?:[.,]\d+)?(?:\/\d+)?\s*porc\w*/i,'').replace(/^(měl|mela|měla|snědl|snědla)\s+jsem\s+/i,'').trim();if(name.length<2)return foodMessage('Napiš název receptu nebo číslo strany.');
      try{const r=await jsonFetch('/app/api/food/recipes?q='+encodeURIComponent(name)),list=r.recipes||[];if(!list.length)return foodMessage('V kuchařce jsem „'+name+'“ nenašel. Zkus jiné slovo nebo číslo strany.');
        const pick=x=>{selectFoodProduct({name:x.name,calories_100g:x.calories,protein_100g:x.protein_g,carbs_100g:x.carbs_g,fat_100g:x.fat_g,nutrition_basis:'portion',source:'package_label'});setPortions(text);foodMessage('Recept „'+x.name+'“'+(x.page?' (str. '+x.page+')':'')+' je připravený.');};
        $('foodResults').innerHTML=list.map((x,i)=>'<button type="button" class="food-result" data-recipe="'+i+'"><strong>'+esc(x.name)+'</strong><span class="small">'+(x.page?'str. '+x.page+' · ':'')+(x.calories==null?'energie neuvedena':fmt(x.calories)+' kcal / porce')+'</span></button>').join('');
        $('foodResults').querySelectorAll('[data-recipe]').forEach(b=>b.onclick=()=>pick(list[Number(b.dataset.recipe)]));if(list.length===1)pick(list[0]);else foodMessage('Vyber recept.');
      }catch(error){foodMessage(error.message);}};}
  installAmountWheel();
  // An unknown barcode is looked up with AI straight away.
  const search=searchFood;searchFood=async function(){await search();if($('foodBarcode').value.trim()&&!foodCandidates.length&&$('foodAiLookup'))await lookupFoodAi();};
  const close=closeSheet;closeSheet=function(){stopScanner();close();};
  // Redraw with the day's data.
  const diary=renderMealDiary;renderMealDiary=function(){diary();renderMealList();renderDayOverview();};
  const previous=load;load=async()=>{await previous();renderMealList();renderDayOverview();loadFluids();};
  renderMealList();renderDayOverview();
}
installNutritionHome();

// ---- Revize dne: the coach checks one planned day ----
const REVIEW_VERDICT={ok:['✅','V pohodě'],adjust:['✏️','Upravit'],swap:['🔁','Prohodit s jiným dnem'],rest:['😴','Raději volno']};
function reviewHtml(r){if(r.error)return '<div class="notice status-error">'+esc(r.model)+': '+esc(r.error)+'</div>';const v=r.review||{},[icon,label]=REVIEW_VERDICT[v.verdict]||['•',v.verdict||''];
  return '<div class="review-card verdict-'+esc(v.verdict||'')+'"><div class="review-verdict">'+icon+' '+esc(label)+'</div><p class="review-headline">'+esc(v.headline||'')+'</p>'+(v.reasons?.length?'<ul>'+v.reasons.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+(v.changes?.length?'<h4>Co bych změnil</h4><ul>'+v.changes.map(c=>'<li><strong>'+esc(c.what)+'</strong> · '+esc(c.why)+'</li>').join('')+'</ul>':'')+(v.missing?'<p class="small">Chybí: '+esc(v.missing)+'</p>':'')+'</div>';}
async function openReviewSheet(date){
  openSheet('Revize · '+(date===localToday()?'dnes':longDate(date)),'<p class="small">AI kontroluje plán dne v kontextu týdne, formy, spánku a tvých hodnocení…</p>');
  try{const r=await jsonFetch('/app/api/coach/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date})});
    $('sheetBody').innerHTML=r.reviews.map(reviewHtml).join('')+'<p class="small">Jen návrh; plán se sám nemění. Úpravy uděláš ve Workoutech.</p>';
  }catch(error){$('sheetBody').innerHTML='<p class="small">'+esc(error.message)+'</p>';}
}

// ---- One "Dnes" screen: the day at a glance, then the rest of the former Přehled ----
function installOneDayScreen(){
  const today=$('today'),overview=$('overview');if(!today||!overview||$('todayTop'))return;
  today.insertAdjacentHTML('afterbegin','<div id="todayTop"></div><div id="todayMore"></div>');
  const keep=el=>el.id==='dailyPulse'||el.id==='dayTimeline'||el.classList.contains('readiness-hero')||el.classList.contains('overview-nutrition');
  for(const el of [...overview.children])if(!keep(el))$('todayMore').append(el);
  document.querySelector('.nav button[data-view="overview"]')?.remove();
  const act=activate;activate=function(id){act(id==='overview'?'today':id);};
}
installOneDayScreen();

// ---- Food logging in a panel: "+" on a meal (or quick add, timeline, scan) opens it ----
function openFoodLogger(slot){
  const panel=$('foodPanel');if(!panel)return;
  if(slot)setFoodMeal(slot);
  $('foodPanelTitle').textContent='Přidat · '+(mealSlots.find(s=>s.id===$('foodMeal').value)?.name||'jídlo');
  panel.hidden=false;document.body.classList.add('food-panel-open');
  if(!isPhone())setTimeout(()=>$('foodQuery')?.focus({preventScroll:true}),60);
}
function closeFoodLogger(){const panel=$('foodPanel');if(!panel||panel.hidden)return;panel.hidden=true;document.body.classList.remove('food-panel-open');}
function installFoodPanel(){
  const entry=$('foodEntry');if(!entry||$('foodPanel'))return;
  document.body.insertAdjacentHTML('beforeend','<div id="foodPanel" class="food-panel" hidden><div class="food-panel-backdrop" data-food-close></div><section class="food-panel-sheet" role="dialog" aria-modal="true" aria-labelledby="foodPanelTitle"><div class="food-panel-head"><h3 id="foodPanelTitle">Přidat jídlo</h3><button type="button" class="btn" data-food-close aria-label="Zavřít">✕</button></div><div id="foodPanelBody"></div></section></div>');
  $('foodPanelBody').append(entry);
  // The panel has its own title: the card's heading and intro go.
  for(const el of [...entry.children].slice(0,4))if(/Potraviny a výrobky|Co jsi snědl|Vyhledej běžnou potravinu/i.test(el.textContent)&&!el.querySelector('input,button'))el.hidden=true;
  $('foodPanel').addEventListener('click',e=>{if(e.target.closest('[data-food-close]'))closeFoodLogger();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('sheet')?.hidden!==false)closeFoodLogger();});
  $('foodMeal').addEventListener('change',()=>{$('foodPanelTitle').textContent='Přidat · '+(mealSlots.find(s=>s.id===$('foodMeal').value)?.name||'jídlo');});
  // A saved meal closes the panel (the basket empties on success).
  const save=$('basketSave').onclick;$('basketSave').onclick=async()=>{const before=(mealEntries||[]).length;await save();if((mealEntries||[]).length>before){closeFoodLogger();}};
  // "Co dál dnes?" takes the place of the energy-by-meal chart.
  const next=$('foodPlan')?.closest('.card'),chart=$('mealDistribution');if(next&&chart){chart.classList.add('replaced');chart.after(next);}
}
installFoodPanel();

// ---- Hodnocení: RPE and how it felt for any finished session ----
// A library workout scheduled that day gets the RPE (also to Intervals.icu)
// and the coach's note in the background; any other session goes straight to
// the coach with the same RPE and note.
function openRatingSheet({date=localToday(),name=null}={}){
  const done=(date===selectedHistoryDate?state.daily?.training?.completed||[]:[]).filter(a=>!isNutritionItem(a)&&!isWalkActivity(a)).map(a=>a.name||a.type||'Trénink');
  let pick=name||done.at(-1)||null,rpe=null;
  openSheet('Hodnocení'+(pick?' · '+pick:''),(done.length>1?'<div class="fluid-kinds" role="group" aria-label="Trénink">'+done.map(n=>'<button type="button" class="btn'+(n===pick?' active':'')+'" data-rate-pick="'+esc(n)+'">'+esc(n)+'</button>').join('')+'</div>':'')+
    '<p class="small">Jak náročné to bylo? 1–2 velmi lehce · 5–6 středně · 9–10 maximum</p><div class="rpe-scale" id="rateRpe">'+[1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" data-rpe="'+n+'">'+n+'</button>').join('')+'</div>'+
    '<label class="coach-ask"><span class="small">Jak ses cítil? Co bylo jinak? (volitelné)</span><textarea id="rateNotes" rows="3" maxlength="1000" placeholder="např. těžké nohy, ráno procházka se psy, horko"></textarea></label>'+
    '<button type="button" class="btn primary sheet-wide" id="rateSave">Uložit hodnocení</button><div id="rateResult"></div>',body=>{
    body.onclick=async e=>{
      const p=e.target.closest('[data-rate-pick]');if(p){pick=p.dataset.ratePick;body.querySelectorAll('[data-rate-pick]').forEach(b=>b.classList.toggle('active',b===p));$('sheetTitle').textContent='Hodnocení · '+pick;return}
      const r=e.target.closest('#rateRpe [data-rpe]');if(r){rpe=Number(r.dataset.rpe);body.querySelectorAll('#rateRpe [data-rpe]').forEach(b=>b.classList.toggle('active',b===r));return}
      if(e.target.id!=='rateSave')return;
      const notes=$('rateNotes').value.trim(),btn=$('rateSave');if(!rpe&&!notes)return toast('Vyber RPE nebo napiš, jak ses cítil.');
      btn.disabled=true;btn.textContent='Ukládám…';
      try{
        const scheduled=(await jsonFetch('/app/api/workouts/scheduled').catch(()=>({}))).workouts||[];
        const library=scheduled.filter(w=>w.scheduled_date===date&&!w.feedback_id);
        const match=library.find(w=>pick&&String(pick).toLowerCase().includes(String(w.name).toLowerCase().slice(0,12)))||(library.length===1?library[0]:null);
        if(match&&rpe){
          const res=await jsonFetch('/app/api/workouts/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workoutId:match.workout_id,scheduledDate:date,rpe,notes})});
          $('rateResult').innerHTML=uiText('<p class="small">✓ Uloženo', '<p class="small">✓ Saved')+(res.intervals?.status==='ok'?uiText(' i v Intervals.icu', ' in Intervals.icu too'):'')+uiText('. AI připravuje zpětnou vazbu, objeví se v Radách a hodnocení.</p>', '. AI is preparing feedback; it will appear in Advisors and ratings.</p>');awaitReflection(date);
        }else{
          const res=await jsonFetch('/app/api/coach/reflections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,rpe,notes:(pick?pick+': ':'')+notes})});
          state.reflections={...(state.reflections||{}),[date]:[res.reflection,...(state.reflections?.[date]||[])]};renderDayTimeline();
          $('rateResult').innerHTML='<div class="coach-note"><small>✦ AI</small><p data-no-i18n>'+esc(res.reflection.text)+'</p></div>';
        }
        btn.textContent='✓ Uloženo';
        state.ratedSessions=(state.ratedSessions||new Map()).set(date+'|'+String(pick||'Trénink'),rpe||null);try{renderToday();}catch{}
      }catch(error){toast(error.message);btn.disabled=false;btn.textContent='Uložit hodnocení';}
    };
  });
}
// ---- Zdraví: the tiles that matter. Sleep and weight as in Dnes, sleep debt
// and VO₂ max instead of the averages; the long-term card is gone. ----
// Naps count toward the day's sleep, so all sessions go in, not only the nights.
function sleepDebt(sessions,date){return sleepDebtMinutes((state.sleep?.sessions||sessions).filter(s=>(s.date||String(s.endTime||'').slice(0,10))<=date),date,sleepNeedMinutes({age:appProfile().age}));}
function healthTile(label,value,meta,tone=''){return '<div class="metric-tile'+(tone?' tone-'+tone:'')+'"><div class="label">'+label+'</div><div class="metric-number">'+value+'</div><div class="small">'+meta+'</div></div>';}
function renderHealthTiles(){
  const recovery=$('recovery');if(!recovery)return;
  let box=$('healthTiles');
  if(!box){box=document.createElement('div');box.id='healthTiles';box.className='recovery-metrics health-tiles';const old=recovery.querySelector('.recovery-metrics');if(old){old.before(box);old.hidden=true;}else recovery.querySelector('.recovery-command')?.after(box);}
  const date=selectedHistoryDate,sessions=primarySleepSessions(state.sleep?.sessions).map(s=>({...s,date:s.date||String(s.endTime||'').slice(0,10)})).filter(s=>s.date<=date),last=sessions[0];
  const older=sessions.filter(s=>last&&s.date<last.date&&s.date>=dateShift(last.date,-30)),mean=older.length?older.reduce((s,r)=>s+num(r.durationMin),0)/older.length:null,score=sleepIndex(last);
  const sleepDelta=last&&mean!=null?Math.round(last.durationMin-mean):null;
  const vs30=uiText(' proti 30 dnům',' vs 30 days');
  const sleep=healthTile('Spánek',last?hm(last.durationMin)+(sleepDelta!=null?deltaBadge(sleepDelta,'min',1,15,0,vs30):''):'—',last?uiText('Noc ','Night ')+esc(dateLabel(last.date))+(score!=null?uiText(' · skóre ',' · score ')+score+'/100':''):'Bez záznamu');
  const debt=sleepDebt(sessions,date);
  const debtTile=healthTile('Spánkový dluh',debt?(debt.minutes?hm(debt.minutes):'0 h'):'—',debt?uiText('7 nocí vs. potřeba ','7 nights vs. a need of ')+'<span class="nowrap">'+hm(debt.need)+'</span> · <span class="nowrap">Ø '+hm(debt.average)+'</span>'+(debt.nights<7?uiText(' · změřeno ', ' · measured ')+debt.nights+'/7':''):'Chybí noci za posledních 7 dní',debt?(debt.minutes<120?'good':debt.minutes<300?'warn':'bad'):'');
  const vo2=latestVo2(),prev=vo2?googleWellness().concat(state.fitness?.wellness||[]).filter(r=>r.id<=dateShift(vo2.date,-28)&&measured(r.vo2max??r.vo2Max)).sort((a,b)=>a.id.localeCompare(b.id)).at(-1):null,vo2Delta=prev?Number(vo2.value)-Number(prev.vo2max??prev.vo2Max):null;
  const vo2Tile=healthTile('VO₂ max',vo2&&measured(vo2.value)?fmt(vo2.value,1)+' <small>ml/kg/min</small>'+(vo2Delta!=null?deltaBadge(vo2Delta,'',1,0.5,1,uiText(' za 4 týdny',' in 4 weeks')):''):'—',vo2?esc(vo2.source||'')+' · '+esc(dateLabel(vo2.date)):'Bez měření z hodinek');
  const w=state.weight||{},hist=(w.records||[]).filter(x=>num(x.value_numeric)>0&&/^\d{4}-\d{2}-\d{2}/.test(String(x.sample_time||''))&&String(x.sample_time).slice(0,10)<=date).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time))),lastW=hist.at(-1);
  const mean30=(()=>{const xs=hist.filter(x=>String(x.sample_time).slice(0,10)>=dateShift(date,-29)).map(x=>num(x.value_numeric));return xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;})();
  const targetW=num(state.daily?.nutrition?.targetWeightKg)||null,lw=lastW?num(lastW.value_numeric):null;
  const weightTile=healthTile('Hmotnost',lw?fmt(lw,1)+' <small>kg</small>'+(mean30!=null?deltaBadge(lw-mean30,'kg',targetW&&targetW<lw?-1:targetW&&targetW>lw?1:0,0.3,1,vs30):''):'—',lw?[mean30!=null?uiText('Průměr 30 dní ','30-day average ')+fmt(mean30,1)+' kg':'',targetW?uiText('cíl ','goal ')+fmt(targetW,1)+' kg':''].filter(Boolean).join(' · ').replace(/^./,c=>c.toUpperCase())||uiText('Poslední vážení','Latest weigh-in'):'Bez vážení');
  box.innerHTML=sleep+debtTile+vo2Tile+weightTile;
  const hs=$('healthspan');if(hs){hs.hidden=true;const head=hs.previousElementSibling;if(head?.classList.contains('section'))head.hidden=true;}
}
// A coloured change: dir 1 = higher is better, -1 = lower is better, 0 = neutral.
// basis says what the change is measured against (" vs 30 days"), so the chip reads on its own.
function deltaBadge(delta,unit,dir,flat,decimals=0,basis=''){
  if(delta==null||!Number.isFinite(delta))return '';
  const tone=Math.abs(delta)<flat||!dir?'flat':(delta>0)===(dir>0)?'good':'bad';
  return '<span class="delta-badge '+tone+'"><span class="nowrap">'+(delta>0?'↑ +':delta<0?'↓ −':'±')+fmt(Math.abs(delta),decimals)+(unit?' '+unit:'')+'</span>'+(basis?' <span class="nowrap">'+esc(basis.trim())+'</span>':'')+'</span>';
}
function installHealthTiles(){
  const previous=load;load=async()=>{await previous();try{renderHealthTiles();}catch(error){console.error('Health tiles',error);}};
}
installHealthTiles();
// ---- Nastavení: hlavní sport a cíl. Saved with the profile; the coach,
// the day review and the training notes take their direction from it. ----
const MAIN_SPORT_OPTIONS=[['cycling','Cyklistika'],['running','Běh'],['triathlon','Triatlon'],['strength','Silový trénink'],['general','Všeobecná kondice']];
function installSportFocus(){
  const profileCard=$('fitnessProfileForm')?.closest('.card');if(!profileCard||$('sportFocusForm'))return;
  profileCard.insertAdjacentHTML('beforebegin','<article class="card" id="sportFocusCard"><h3>Hlavní sport a cíl'+infoTip('sportFocus','hlavní sport')+'</h3><form id="sportFocusForm" class="food-editor-grid">'+
    '<label>Hlavní sport<select class="food-input" id="focusSport">'+MAIN_SPORT_OPTIONS.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select></label>'+
    '<label class="wide">Cíl<input id="focusGoal" class="food-input" maxlength="300" placeholder="např. FTP 300 W, maraton pod 3:30, udržet kondici"></label>'+
    '<label>Hlavní závod<input id="focusEvent" class="food-input" maxlength="120" placeholder="např. L’Etape Czech Republic"></label>'+
    '<label>Datum závodu<input id="focusEventDate" class="food-input" type="date"></label>'+
    '<button class="btn primary" type="submit">Uložit sport a cíl</button><p class="small" id="focusStatus"></p></form></article>');
  const fields=[['focusSport','mainSport'],['focusGoal','sportGoal'],['focusEvent','eventName'],['focusEventDate','eventDate']];
  const fill=()=>{const p=savedProfile();for(const [id,key] of fields)if(document.activeElement!==$(id))$(id).value=key==='mainSport'?p[key]||'general':p[key]??'';$('focusStatus').textContent=focusSummary(p);};
  fill();
  $('sportFocusForm').onsubmit=async e=>{
    e.preventDefault();const next={...savedProfile()};for(const [id,key] of fields)next[key]=$(id).value.trim();
    localStorage.setItem('fitnessProfile',JSON.stringify(next));
    try{const r=await jsonFetch('/app/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});if(r?.profile)localStorage.setItem('fitnessProfile',JSON.stringify({...next,...r.profile}));fill();markDataChanged('');await load();toast('Sport a cíl uloženy.');}
    catch(error){toast('Neuložilo se: '+error.message);}
  };
  const wasActivate=activate;activate=function(id){wasActivate(id);if(id==='settings')fill();};
}
function focusSummary(p){
  const sport=MAIN_SPORT_OPTIONS.find(([v])=>v===p.mainSport)?.[1],days=p.eventDate?Math.round((Date.parse(p.eventDate+'T12:00:00Z')-Date.parse(localToday()+'T12:00:00Z'))/864e5):null;
  return [sport,p.eventDate&&days>=0?(p.eventName||uiText('Závod','Race'))+uiText(' za ',' in ')+days+uiText(' dní', ' days'):''].filter(Boolean).join(' · ');
}
installSportFocus();
// The section lines in Nastavení follow what is saved.
function installSettingsSummaries(){
  // The lw-theme cookie, or the device setting without it (as in installDetailViews).
  const light=()=>{const m=document.cookie.match(/(?:^|; )lw-theme=(light|dark)/);return m?m[1]==='light':Boolean(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches);};
  const appearance=()=>setSettingsSummary('appearance',(light()?uiText('Světlý','Light'):uiText('Tmavý','Dark'))+' · '+uiText('Čeština','English'));
  const prior=activate;activate=function(id){prior(id);if(id==='settings'){try{renderProfileSummary();appearance();}catch{/* summaries are optional */}}};
  document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',appearance));
  $('fitnessProfileForm')?.addEventListener('submit',()=>setTimeout(renderProfileSummary,0));
  $('sportFocusForm')?.addEventListener('submit',()=>setTimeout(renderProfileSummary,0));
  try{renderProfileSummary();appearance();}catch{/* summaries are optional */}
}
installSettingsSummaries();

// Availability, week exceptions and the persistent personal coach.
const STATUS_LABELS={active:'Trénink',sick:'Nemoc',injured:'Zranění',on_break:'Pauza'};
const STATUS_DESCRIPTIONS={active:'Připravený na pohyb a trénink',sick:'Odpočinek během nemoci',injured:'Prostor pro zotavení ze zranění',on_break:'Čas na pauzu a regeneraci'};
function statusIcon(status){
  const paths={active:'<circle cx="15" cy="5.5" r="2.5" fill="currentColor" stroke="none"/><path d="m10 11 4-3 4 4 4 1M14 9l-3 8-5 3m5-3 5 3-1 5M9 11l-4 5"/>',sick:'<path d="M4 7v17m0-5h22v5m0-5v-5a3 3 0 0 0-3-3H13v8M4 11h5v5H4"/><path d="M17 5h6m-3-3v6"/>',injured:'<g transform="rotate(-42 15 15)"><rect x="8" y="3" width="14" height="24" rx="6"/><rect x="10.5" y="10" width="9" height="10" rx="2"/><path d="M12 6h.01M18 6h.01M12 24h.01M18 24h.01M13 13h.01M17 17h.01"/></g>',on_break:'<path d="M15 10c-5-5-10-3-11 0 5-1 8 0 11 3m0-3c4-5 9-3 11 0-5-1-8 0-11 3m0-3c0-5 3-7 6-6-2 2-3 4-6 6m0 3-2 12m-6 1h15"/>'};
  return '<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[status]||paths.active)+'</svg>';
}
function renderAthleteStatus(){
  const head=document.querySelector('#today .today-head');if(!head)return;
  $('athleteStatusBox')?.remove();
  const s=state.athleteState||{status:'active'},a=state.coachAdvice;
  head.insertAdjacentHTML('beforeend','<div id="athleteStatusBox"><button type="button" class="athlete-status status-'+esc(s.status)+'" id="changeAthleteStatus"><span class="status-orb">'+statusIcon(s.status)+'</span><span class="status-current-copy"><strong>'+esc(STATUS_LABELS[s.status]||STATUS_LABELS.active)+'</strong><small>'+esc(statusValidityLabel(s)+(s.note?' · '+s.note:''))+'</small></span><svg class="status-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button></div>');
  $('changeAthleteStatus').onclick=openAthleteStatus;
  $('athleteStatusNotice')?.remove();
  if(statusPausesTraining())head.insertAdjacentHTML('beforeend','<div class="notice" id="athleteStatusNotice" role="status"><strong>'+esc(STATUS_LABELS[s.status])+uiText(' · tréninky pozastavené</strong><p>', ' · training paused</strong><p>')+esc(s.status==='injured'?'AI zohlední tvoje omezení. Před návrhem náhradního sportu je potřeba je upřesnit.':'AI nyní doporučuje odpočinek a respektuje tvoji pauzu.')+' '+(s.statusUntil?'Od '+dateLabel(s.statusUntil)+' se stav vrátí na Active.':'Běžná doporučení obnovíš přepnutím na Active.')+'</p><small>Plán v kalendáři zůstává uložený.</small></div>');
  $('coachAdviceCard')?.remove();
  if(a){$('assistantConversation').insertAdjacentHTML('beforebegin','<div class="notice coach-advice" id="coachAdviceCard"><strong>'+esc(a.headline)+'</strong><p>'+esc(a.message)+'</p><div class="select-row"><button class="btn primary" type="button" id="adviceAccept">Změnit na On break</button><button class="btn" type="button" id="adviceDiscuss">Probrat kompromis</button><button class="btn" type="button" id="adviceDecline">Teď ne</button></div></div>');
    $('adviceAccept').onclick=()=>saveAthleteStatus('on_break','Pauza podle doporučení regenerace');
    $('adviceDiscuss').onclick=()=>discussWithAssistant('Chci probrat kompromis k doporučení regenerace: '+(a.reasons||[]).join(' ')+' '+a.message+' Najdeme kompromis místo úplné pauzy?');
    $('adviceDecline').onclick=async()=>{await athleteStatePost({dismiss:a.id});state.coachAdvice=null;renderAthleteStatus();};
  }
  const fab=$('floatingAssistant');if(fab){fab.textContent=a?'✦ AI · návrh':'✦ AI';fab.classList.toggle('has-advice',!!a);}$('quickAdd')?.classList.toggle('has-advice',!!a);
}
async function athleteStatePost(body){const r=await jsonFetch('/app/api/athlete-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});state.athleteState=r.state;return r.state;}
function statusPausesTraining(){return ['sick','injured','on_break'].includes(state.athleteState?.status);}
async function refreshStatusCoaching(){
  const revision=++statusCoachingRevision,date=selectedHistoryDate;
  state.proposals={};state.generated=null;state.coachAdvice=null;
  if($('generatedWorkout'))$('generatedWorkout').innerHTML='';
  if($('weekProposalCards'))$('weekProposalCards').innerHTML='';
  if($('plannerStatus'))$('plannerStatus').textContent='Stav změněn · předchozí návrhy byly zrušeny.';
  state.coaches={coaches:[],reviews:[],priorities:['Obnovuji doporučení podle aktuálního stavu…']};
  renderCoachCouncil();renderToday();
  const results=await Promise.allSettled([jsonFetch('/app/api/coaches?date='+date),loadWeekPlan(true)]);
  if(revision!==statusCoachingRevision||date!==selectedHistoryDate)return;
  const coaches=results[0];
  state.coaches=coaches.status==='fulfilled'?coaches.value:{coaches:[],reviews:[],priorities:['Doporučení se nepodařilo obnovit. Zkus obnovit stránku; uložený stav platí dál.']};
  renderCoachCouncil();renderToday();await renderWeekHub();
}
async function saveAthleteStatus(status,note='',statusUntil=null){
  try{await athleteStatePost({status,note,statusUntil});closeSheet();renderAthleteStatus();toast('Stav: '+STATUS_LABELS[status]);await refreshStatusCoaching();}catch(error){toast(error.message);}
}
function statusValidityLabel(s){return 'Stav pro trenéra'+(s.statusUntil?' · do '+dateLabel(dateShift(s.statusUntil,-1)):'');}
function openAthleteStatus(){
  const s=state.athleteState||{status:'active',note:''};
  openSheet('Aktuální stav','<form id="athleteStatusForm"><p class="status-intro">Jak se právě cítíš? Přizpůsobíme tomu nové návrhy tréninků.</p><div class="status-choices">'+Object.entries(STATUS_LABELS).map(([value,label])=>'<label class="status-choice status-'+value+'"><input type="radio" name="status" value="'+value+'"'+(s.status===value?' checked':'')+'><span class="status-orb">'+statusIcon(value)+'</span><span class="status-choice-copy"><strong>'+label+'</strong><small>'+STATUS_DESCRIPTIONS[value]+'</small></span><span class="status-radio" aria-hidden="true"></span></label>').join('')+'</div><div class="status-duration"><label for="athleteStatusDuration">◷ Platnost stavu</label><select id="athleteStatusDuration"><option value="indefinite">Do další změny</option><option value="tomorrow">Do zítřka</option><option value="7">Na 7 dní</option><option value="14">Na 14 dní</option><option value="custom">Vlastní datum</option></select><label id="athleteStatusCustomWrap" hidden>Poslední den stavu<input id="athleteStatusUntil" type="date" min="'+localToday()+'" value="'+(s.statusUntil?dateShift(s.statusUntil,-1):dateShift(localToday(),6))+'"></label><small id="athleteStatusExpiryHint"></small></div><details class="status-note"><summary>Přidat poznámku nebo omezení</summary><label class="sr-only" for="athleteStatusNote">Poznámka nebo omezení</label><textarea id="athleteStatusNote" maxlength="500" placeholder="Například: citlivé koleno, vynechat běh…">'+esc(s.note||'')+'</textarea></details><div class="control-sheet-footer"><button class="btn primary status-save" type="submit">Uložit stav</button></div></form>',body=>{
    if(s.note)body.querySelector('details').open=true;
    const duration=$('athleteStatusDuration'),custom=$('athleteStatusUntil'),hint=$('athleteStatusExpiryHint');
    if(s.statusUntil)duration.value='custom';
    const until=()=>duration.value==='indefinite'?null:duration.value==='custom'?dateShift(custom.value,1):dateShift(localToday(),duration.value==='tomorrow'?1:Number(duration.value));
    const update=()=>{const active=body.querySelector('[name=status]:checked').value==='active';duration.disabled=active;$('athleteStatusCustomWrap').hidden=active||duration.value!=='custom';custom.required=!active&&duration.value==='custom';hint.textContent=active?'Stav Trénink platí, dokud si nevybereš jiný.':duration.value==='indefinite'?'Zpět na Trénink přepneš sám.':'Od '+dateLabel(until())+' se stav automaticky vrátí na Trénink.';};
    duration.onchange=update;custom.oninput=()=>{if(custom.value)update();};body.querySelectorAll('[name=status]').forEach(input=>input.onchange=update);update();
    body.querySelector('form').onsubmit=e=>{e.preventDefault();const status=body.querySelector('[name=status]:checked').value;saveAthleteStatus(status,$('athleteStatusNote').value,status==='active'?null:until());};
  },'status-sheet');
}
// What the assistant talks about: what is really open (workout mode, a
// training's detail), otherwise the day itself. A tab left selected in the
// generators says nothing about the question.
function captureAssistantContext(){
  if(gymMode&&!$('gymMode')?.hidden){const date=gymDay(),exercise=!gymMode.finished?gymSets()[gymMode.pos]?.r[1]:null;return {view:'workouts',date,weekStart:mondayOf(date),sport:'gym',exercise:exercise||null};}
  const detail=state.openDetail&&!$('sheet')?.hidden?state.openDetail:null;
  if(detail)return {view:'workouts',date:detail.date,weekStart:mondayOf(detail.date),sport:detail.sport||null,exercise:null};
  const active=document.querySelector('.view.active')?.id||'today',view=active==='workouts'?'today':active;
  const date=active==='today'?state.todayPick||localToday():['training','health','nutrition'].includes(active)?selectedHistoryDate:localToday();
  return {view,date,weekStart:active==='workouts'?state.hubWeek||mondayOf(date):mondayOf(date),sport:null,exercise:null};
}
function renderAssistantContext(context=captureAssistantContext()){
  const el=$('assistantContext');if(!el)return;
  const names={today:'Den',workouts:'Tréninky',training:'Historie',health:'Zdraví',nutrition:'Výživa',settings:'Nastavení'};
  el.textContent=(context.sport?HUB_SPORTS[context.sport]:names[context.view])+' · '+(context.date===localToday()?'dnes':longDate(context.date))+(context.exercise?' · '+context.exercise:'');
  const quick=$('assistantQuickActions');if(!quick)return;
  const items=[context.sport==='gym'?['Upravit tento gym','Prober otevřený gym na '+context.date+(context.exercise?', právě jsem u cviku '+context.exercise:'')+'. Doporučil bys něco upravit podle uloženého plánu a aktuální regenerace?']:['Probrat tento den','Prober plán na vybraný den '+context.date+' a jeho návaznost na regeneraci.'],['Probrat týden','Prober otevřený týden od '+context.weekStart+'. Zohledni moje zvolené sporty, časové možnosti a regeneraci.'],['Moje regenerace','Zhodnoť moji aktuální regeneraci a navrhni, jak jí přizpůsobit nejbližší trénink.']];
  quick.innerHTML=items.map((x,i)=>'<button class="assistant-quick" type="button" data-assistant-quick="'+i+'"'+(assistantBusy?' disabled':'')+'>'+esc(x[0])+'</button>').join('');
  quick.querySelectorAll('[data-assistant-quick]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.assistantQuick);return discussWithAssistant(items[i][1],{appContext:i===1?{...context,sport:null,exercise:null,date:context.weekStart}:i===2?{view:'today',date:localToday(),weekStart:mondayOf(localToday()),sport:null,exercise:null}:context});});
}
// Chats: the current one is remembered on the device; the list lives on the
// server. After 3 hours of silence, or on a new day, the chat stays in the
// history and a new one starts, so old context does not leak into today.
const ASSISTANT_CHAT_IDLE_MS=3*3600e3;
function assistantChatFresh(){if(!assistantChat.id)return false;const day=new Date(assistantChat.lastAt).toLocaleDateString('sv-SE',{timeZone:USER_TZ});return Date.now()-assistantChat.lastAt<ASSISTANT_CHAT_IDLE_MS&&day===localToday();}
let assistantChat={id:null,lastAt:0};
try{const saved=JSON.parse(localStorage.getItem('pfd-assistant-chat')||'null');if(saved?.id)assistantChat={id:Number(saved.id),lastAt:Number(saved.lastAt)||0};}catch{}
function rememberAssistantChat(id){assistantChat={id:id||null,lastAt:id?Date.now():0};try{localStorage.setItem('pfd-assistant-chat',JSON.stringify(assistantChat));}catch{}}
const ASSISTANT_WELCOME='<div class="assistant-welcome"><span>✦</span><strong>Co dnes upravíme?</strong>Projdeme plán, regeneraci nebo výživu.<br>Návrhy můžeš potvrdit, odmítnout i probrat.</div>';
function startAssistantChat(auto=false){
  if(assistantBusy)return toast('AI právě odpovídá. Počkej na dokončení odpovědi.');
  rememberAssistantChat(null);if(state.athleteState)state.athleteState.conversation=[];
  $('assistantConversation').innerHTML=ASSISTANT_WELCOME+(auto?'<p class="assistant-new-note">Po odmlce začínám nový chat. Předchozí rozhovor najdeš v ☰ Chaty.</p>':'');$('weekProposalCards')&&($('weekProposalCards').innerHTML='');
  hideAssistantHistory();$('assistantStatus').textContent='Nový chat';updateAssistantComposer();
}
// Picked from the list, a chat counts as fresh again; resumed on open, it keeps its time.
async function showAssistantChat(id,picked=true){
  const {chat}=await jsonFetch('/app/api/assistant/chats/'+id);
  assistantChat={id:chat.id,lastAt:picked?Date.now():assistantChat.lastAt};try{localStorage.setItem('pfd-assistant-chat',JSON.stringify(assistantChat));}catch{}
  if(state.athleteState)state.athleteState.conversation=chat.messages.map(m=>({role:m.role,content:m.content}));
  $('assistantConversation').innerHTML=chat.messages.map(m=>coachTurnHtml(m.role,m.content)).join('')||ASSISTANT_WELCOME;
  hideAssistantHistory();$('assistantStatus').textContent=chat.title;scrollAssistant();
}
function chatTimeLabel(value){
  const d=new Date(String(value||'').replace(' ','T')+'Z');if(isNaN(d))return '';
  const day=d.toLocaleDateString('sv-SE',{timeZone:USER_TZ});
  return day===localToday()?d.toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit',timeZone:USER_TZ}):day===dateShift(localToday(),-1)?'včera':dateFormat({day:'numeric',month:'numeric',timeZone:USER_TZ}).format(d);
}
function hideAssistantHistory(){const h=$('assistantHistory');if(h)h.hidden=true;$('assistantChats')?.setAttribute('aria-expanded','false');}
async function toggleAssistantHistory(){
  const h=$('assistantHistory');if(!h)return;
  if(!h.hidden)return hideAssistantHistory();
  h.hidden=false;h.style.top=($('assistantDialog').querySelector('.assistant-panel-header')?.offsetHeight||64)+'px';$('assistantChats').setAttribute('aria-expanded','true');h.innerHTML='<p class="small">Načítám chaty…</p>';
  try{
    const {chats}=await jsonFetch('/app/api/assistant/chats');
    h.innerHTML='<div class="assistant-history-head"><strong>Chaty</strong><button type="button" class="btn" data-chat-new>＋ Nový chat</button></div>'+(chats.length?'<ul>'+chats.map(c=>'<li class="'+(c.id===assistantChat.id?'current':'')+'"><button type="button" class="assistant-chat-open" data-chat-open="'+c.id+'"><span>'+esc(c.title)+'</span><small>'+esc(chatTimeLabel(c.updatedAt))+' · '+Math.ceil(c.messages/2)+'× dotaz</small></button><button type="button" class="assistant-chat-delete" data-chat-delete="'+c.id+'" aria-label="Smazat chat „'+esc(c.title)+'“">✕</button></li>').join('')+'</ul>':'<p class="small">Zatím žádné uložené chaty.</p>')+'<p class="small assistant-history-note">Chaty se ukládají 90 dní od poslední zprávy.</p>';
  }catch(error){h.innerHTML='<p>'+esc(error.message)+'</p>';}
}
function installAssistantChats(){
  const button=$('assistantChats');if(!button?.dataset||button.dataset.ready)return;
  button.dataset.ready='1';
  $('assistantChats').onclick=toggleAssistantHistory;
  $('assistantNewChat').onclick=()=>startAssistantChat();
  $('assistantHistory').onclick=async e=>{
    const open=e.target.closest('[data-chat-open]'),del=e.target.closest('[data-chat-delete]');
    if(e.target.closest('[data-chat-new]'))return startAssistantChat();
    if(open){if(assistantBusy)return toast('AI právě odpovídá. Počkej na dokončení odpovědi.');try{await showAssistantChat(Number(open.dataset.chatOpen));}catch(error){toast(error.message);}return;}
    if(del){const id=Number(del.dataset.chatDelete);del.disabled=true;try{await jsonFetch('/app/api/assistant/chats/'+id,{method:'DELETE'});if(id===assistantChat.id)startAssistantChat();del.closest('li')?.remove();}catch(error){toast(error.message);del.disabled=false;}}
  };
}
async function openFloatingAssistant(message=''){
  if(!$('assistantDialog').open){if(gymMode)$('assistantDialog').showModal();else $('assistantDialog').show();}
  $('floatingAssistant')?.classList.add('is-open');
  if(message)setAssistantDraft(message);
  installAssistantChats();
  // The last chat continues while it is fresh; after a pause a new one starts,
  // also when the panel was left open with the old conversation.
  const stale=assistantChat.id&&!assistantChatFresh()&&!assistantBusy;
  if(!$('assistantConversation').children.length||stale){
    if(assistantChatFresh())await showAssistantChat(assistantChat.id,false).catch(()=>startAssistantChat());else startAssistantChat(Boolean(stale));
  }
  renderAssistantContext();
  if(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches)$('assistantMessage').focus();
  updateAssistantComposer();
  positionAssistantInViewport();
  const replyRevision=assistantReplyRevision;
  loadInbox().then(()=>{if(!assistantBusy&&replyRevision===assistantReplyRevision&&$('assistantDialog').open){renderCoachActionCards((state.inbox||[]).filter(openCoachDraft).map(x=>({...x.draft.action,draftId:x.id})));scrollAssistant();}}).catch(()=>{});
  scrollAssistant();
}
// Open proposals worth showing again: made today, for today or later, in this
// chat (week-review proposals have no chat). Older ones expire on the server.
function openCoachDraft(x){
  const a=x.draft?.action,created=new Date(String(x.created_at||'').replace(' ','T')+'Z'),day=isNaN(created)?'':created.toLocaleDateString('sv-SE',{timeZone:USER_TZ});
  return x.status==='draft'&&x.draft?.kind==='coach_action'&&day===localToday()&&(!a?.date||a.date>=localToday())&&(x.draft.chatId==null||x.draft.chatId===assistantChat.id);
}
function coachRichText(value){
  const inline=s=>esc(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  let out='',paragraph=[],list=null;
  const flush=()=>{if(paragraph.length){out+='<p>'+inline(paragraph.join(' '))+'</p>';paragraph=[];}if(list){out+='</'+list+'>';list=null;}};
  for(const raw of String(value||'').split(/\r?\n/)){const line=raw.trim(),heading=line.match(/^#{1,6}\s+(.+)/),item=line.match(/^(?:[-*]|(\d+)[.)])\s+(.+)/);if(!line){flush();continue;}if(heading){flush();out+='<h4>'+inline(heading[1])+'</h4>';}else if(item){if(paragraph.length){out+='<p>'+inline(paragraph.join(' '))+'</p>';paragraph=[];}const kind=item[1]?'ol':'ul';if(list!==kind){if(list)out+='</'+list+'>';out+='<'+kind+'>';list=kind;}out+='<li>'+inline(item[2])+'</li>';}else{if(list){out+='</'+list+'>';list=null;}paragraph.push(line);}}
  flush();return out;
}
function coachTurnHtml(role,content){return '<div class="coach-turn '+(role==='user'?'user':'assistant')+'"><strong>'+esc(role==='user'?'Ty':'AI')+'</strong><div class="coach-message">'+coachRichText(content)+'</div></div>';}
function appendCoachTurn(role,content){$('assistantConversation').querySelector('.assistant-welcome')?.remove();$('assistantConversation').insertAdjacentHTML('beforeend',coachTurnHtml(role,content));scrollAssistant(true);}
function scrollAssistant(focusConversation=false){const el=$('assistantScroll'),turn=focusConversation?$('assistantConversation')?.lastElementChild:null;if(!el)return;if(turn)el.scrollTop+=turn.getBoundingClientRect().bottom-el.getBoundingClientRect().bottom;else el.scrollTop=el.scrollHeight;}
let assistantBusy=false,assistantDiscussionPending=false,assistantReplyRevision=0;
async function discussWithAssistant(message,{appContext=captureAssistantContext()}={}){
  if(assistantBusy||assistantDiscussionPending){toast('AI právě odpovídá. Počkej na dokončení odpovědi.');return;}
  assistantDiscussionPending=true;
  try{await openFloatingAssistant();await sendAssistantMessage(message,{appContext});}
  catch(error){$('assistantStatus').textContent=error.message;}
  finally{assistantDiscussionPending=false;}
}
function updateAssistantComposer(){
  const input=$('assistantMessage'),button=$('assistantForm').querySelector('[type=submit]');
  input.style.height='auto';input.style.height=Math.min(144,Math.max(44,input.scrollHeight))+'px';
  input.style.overflowY=input.scrollHeight>144?'auto':'hidden';
  button.disabled=assistantBusy||!input.value.trim();
  $('assistantForm').setAttribute('aria-busy',String(assistantBusy));
}
function setAssistantDraft(message){$('assistantMessage').value=message;updateAssistantComposer();}
function positionAssistantInViewport(){
  const dialog=$('assistantDialog'),viewport=window.visualViewport;if(!dialog||!viewport)return;
  const keyboard=innerHeight-viewport.height-viewport.offsetTop;
  if(dialog.open&&innerWidth<=700&&keyboard>100){dialog.style.bottom=(keyboard+10)+'px';dialog.style.height=Math.min(650,viewport.height-20)+'px';dialog.style.maxHeight=(viewport.height-20)+'px';}
  else{dialog.style.removeProperty('bottom');dialog.style.removeProperty('height');dialog.style.removeProperty('max-height');}
}
function rememberCoachTurn(role,content){
  state.athleteState=state.athleteState||{status:'active'};
  state.athleteState.conversation=[...(state.athleteState.conversation||[]),{role,content}].slice(-20);
}
async function fetchAssistantReply(message,onAnswer,appContext,onProgress){
  if(typeof aiIntroBefore==='function')await aiIntroBefore('/app/api/assistant',{method:'POST'});
  const response=await fetch('/app/api/assistant',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Interface-Language':document.documentElement?.lang||'cs','X-Time-Zone':USER_TZ},body:JSON.stringify({message,stream:true,appContext,chatId:assistantChat.id})});
  if(response.status===401)showLoginGate();
  if(!response.headers.get('Content-Type')?.includes('application/x-ndjson')){const result=await response.json();if(!response.ok)throw new Error(result.message||'Odpověď se nepodařilo načíst.');return result;}
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;
  const receive=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='answer')onAnswer(event.answer);if(event.type==='progress')onProgress?.(event.message);if(event.type==='done')result=event.result;if(event.type==='error')throw new Error(event.message);};
  try{
    while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let index;while((index=buffer.indexOf('\n'))>=0){receive(buffer.slice(0,index));buffer=buffer.slice(index+1);}if(done)break;}
    if(buffer.trim())receive(buffer);if(!result)throw new Error('Spojení se přerušilo. Zkus to znovu.');return result;
  }finally{reader.releaseLock();}
}
async function sendAssistantMessage(message,{retry=false,appContext=captureAssistantContext()}={}){
  if(assistantBusy||!message.trim())return;
  const decision=!retry&&openCoachActions.length?coachReplyDecision(message):null;
  if(decision){assistantBusy=true;try{await answerCoachActions(message,decision);}finally{assistantBusy=false;updateAssistantComposer();}return;}
  assistantBusy=true;assistantReplyRevision++;const revision=statusCoachingRevision;
  renderAssistantContext(appContext);
  if(!retry){appendCoachTurn('user',message);rememberCoachTurn('user',message);}
  if(!retry)setAssistantDraft('');else updateAssistantComposer();
  $('assistantConversation').insertAdjacentHTML('beforeend','<div class="assistant-typing" id="assistantTyping" role="status" aria-label="AI připravuje odpověď"><span></span><span></span><span></span><small>AI odpovídá</small></div>');
  $('assistantStatus').textContent='Zpráva odeslána';scrollAssistant(true);
  // Each frame carries the whole answer so far; it is re-rendered at most every 100 ms.
  let streamedTurn=null,pendingAnswer=null,paintedAt=0;
  const paint=()=>{if(pendingAnswer==null||!streamedTurn)return;streamedTurn.querySelector('.coach-message').innerHTML=coachRichText(pendingAnswer);pendingAnswer=null;paintedAt=Date.now();scrollAssistant(true);};
  try{
    const r=await fetchAssistantReply(message,answer=>{
      if(revision!==statusCoachingRevision)return;
      $('assistantTyping')?.remove();
      if(!streamedTurn){appendCoachTurn('assistant','');streamedTurn=$('assistantConversation').lastElementChild;streamedTurn.classList.add('streaming');}
      pendingAnswer=answer;if(Date.now()-paintedAt>=100)paint();
    },appContext,progress=>{if(revision!==statusCoachingRevision)return;$('assistantStatus').textContent=progress;const typing=$('assistantTyping')?.querySelector('small');if(typing)typing.textContent=progress;});
    pendingAnswer=null;
    $('assistantTyping')?.remove();
    if(r.chatId)rememberAssistantChat(r.chatId);
    if(revision!==statusCoachingRevision){streamedTurn?.remove();appendCoachTurn('assistant','Stav se mezitím změnil. Pošli požadavek znovu pro aktuální doporučení.');return;}
    if(r.kind==='food_draft'){renderFoodDraft(message,r);scrollAssistant();return;}
    if(streamedTurn){streamedTurn.querySelector('.coach-message').innerHTML=coachRichText(r.answer);streamedTurn.classList.remove('streaming');scrollAssistant(true);}else appendCoachTurn('assistant',r.answer);rememberCoachTurn('assistant',r.answer);
    if(r.visuals?.length){await renderCoachVisuals(streamedTurn||$('assistantConversation').lastElementChild,r.visuals);scrollAssistant();}
    if(r.actions?.length){renderCoachActionCards(r.actions,streamedTurn);scrollAssistant();}
    $('assistantStatus').textContent=r.memorySaved?'Preference uložena. Najdeš ji v Nastavení.':'Návrh potvrdíš nebo upravíš zprávou.';
    if(r.memorySaved){state.athleteState.memories=[...new Set([...(state.athleteState.memories||[]),r.memorySaved])];renderCoachMemories();}
  }catch(error){
    $('assistantTyping')?.remove();
    if(streamedTurn){paint();streamedTurn.classList.remove('streaming');streamedTurn.querySelector('strong').textContent='AI · nedokončená odpověď';}
    const notice=document.createElement('div');notice.className='assistant-retry';notice.setAttribute('role','alert');
    const copy=document.createElement('p');copy.textContent=error.message;notice.append(copy);
    const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Zkusit znovu';
    button.onclick=()=>{if(assistantBusy)return;notice.remove();streamedTurn?.remove();sendAssistantMessage(message,{retry:true,appContext});};notice.append(button);
    $('assistantConversation').append(notice);$('assistantStatus').textContent='Zprávu se nepodařilo vyřídit.';scrollAssistant(true);
  }finally{assistantBusy=false;updateAssistantComposer();renderAssistantContext();}
}
// Pictures under an answer, drawn from the athlete's own data (the coach
// only picks which): form, recovery, sleep, nutrition, week, training, zones.
function miniLine(values,color='#8fd3b6',h=36){
  const v=values.map(Number).filter(Number.isFinite);if(v.length<2)return '';
  const min=Math.min(...v),max=Math.max(...v),span=max-min||1,pts=v.map((x,i)=>(i/(v.length-1)*100).toFixed(1)+','+(h-2-(x-min)/span*(h-4)).toFixed(1)).join(' ');
  return '<svg class="cv-line" viewBox="0 0 100 '+h+'" preserveAspectRatio="none" aria-hidden="true"><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
}
function cvBar(label,value,target,unit=''){const pct=target>0?Math.min(100,Math.round(value/target*100)):0;return '<div class="cv-bar"><span>'+esc(label)+'</span><i><b style="width:'+pct+'%"></b></i><small>'+esc(fmt(value)+(target>0?' / '+fmt(target):'')+unit)+'</small></div>';}
function cvTile(title,body){return body?'<div class="coach-vis"><div class="cv-title">'+esc(title)+'</div>'+body+'</div>':'';}
// A third item true means the value is already HTML (formText).
function cvStats(items){return '<div class="cv-stats">'+items.filter(([,v])=>v!=null&&v!=='').map(([k,v,html])=>'<div><span>'+esc(k)+'</span><strong>'+(html?v:esc(v))+'</strong></div>').join('')+'</div>';}
const COACH_VISUAL={
  form(){const w=(state.fitness?.wellness||[]).filter(r=>measured(r.ctl));const last=w.at(-1);if(!last)return '';const tsb=measured(last.tsb)?Number(last.tsb):Number(last.ctl)-Number(last.atl);
    return cvTile('Kondice · únava · forma',cvStats([['Kondice (CTL)',fmt(last.ctl)],['Únava (ATL)',fmt(last.atl)],['Forma',formText(tsb),true]])+miniLine(w.slice(-42).map(r=>measured(r.tsb)?r.tsb:r.ctl-r.atl),'#b393ff')+'<small class="cv-note">Forma za 6 týdnů</small>');},
  recovery(){const w=vitalWellness().slice(-28),hrv=w.filter(r=>measured(r.hrv)),rhr=w.filter(r=>measured(r.restingHR));if(!hrv.length&&!rhr.length)return '';const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
    return cvTile('Regenerace',cvStats([['HRV',hrv.length?fmt(hrv.at(-1).hrv)+' ms':null],['průměr 4 týdny',hrv.length?fmt(avg(hrv.map(r=>Number(r.hrv))))+' ms':null],['Klidový tep',rhr.length?fmt(rhr.at(-1).restingHR)+' bpm':null]])+miniLine(hrv.slice(-14).map(r=>r.hrv),'#8fd3b6')+(hrv.length?'<small class="cv-note">HRV za 14 dní</small>':''));},
  sleep(){const nights=primarySleepSessions(state.sleep?.sessions).slice(0,7).reverse();if(!nights.length)return '';const max=Math.max(480,...nights.map(n=>num(n.durationMin)));
    return cvTile('Spánek',cvStats([['Poslední noc',hm(nights.at(-1).durationMin)],['Průměr 7 nocí',hm(nights.reduce((s,n)=>s+num(n.durationMin),0)/nights.length)]])+'<div class="cv-cols">'+nights.map(n=>'<i title="'+esc(hm(n.durationMin))+'" style="height:'+Math.round(num(n.durationMin)/max*100)+'%"></i>').join('')+'</div>');},
  nutrition(){const n=state.daily?.nutrition||{},t=n.foodLog?.totals||{},m=n.macros||{};if(!measured(n.calorieTarget))return '';
    return cvTile('Jídlo dnes',cvBar('Energie',num(t.kcal),num(n.calorieTarget),' kcal')+cvBar('Bílkoviny',num(t.protein_g),num(m.protein_g),' g')+cvBar('Sacharidy',num(t.carbs_g),num(m.carbs_g),' g')+cvBar('Tuky',num(t.fat_g),num(m.fat_g),' g'));},
  week(){const t=state.weekPlan?.targets;if(!t||t.status!=='ok')return '';return cvTile(t.recovery?'Týden · regenerační':'Zátěž týdne',cvBar('TSS',num(t.committed),num(t.target))+(t.runCap?.limited?uiText('<small class="cv-note">Běh nejvýš ', '<small class="cv-note">Running at most ')+esc(hm(t.runCap.cap))+'</small>':''));},
  training(){const items=todayItems(localToday()).filter(x=>x.kind!=='role'||x.sport);if(!items.length)return cvTile('Dnes','<p class="small">Dnes nic v plánu.</p>');
    return cvTile('Dnes',items.map(x=>'<div class="cv-item"><span>'+(SPORT_ICON[x.sport]||'•')+'</span><b>'+esc(x.name)+'</b><small>'+esc((x.kind==='done'?uiText('✓ Hotovo','✓ Done'):x.kind==='role'?uiText('Návrh','Suggestion'):uiText('Plán','Plan'))+(x.meta?' · '+x.meta:''))+'</small></div>').join(''));},
  zones(){const d=state.trainingProfile;if(!d)return null;const ftp=d.resolved?.ftp,z=(d.powerZones||[]).filter(x=>x.wattsLow!=null);if(!ftp)return cvTile('Zóny','<p class="small">FTP zatím není nastavené.</p>');
    return cvTile('FTP '+fmt(ftp)+' W',z.map(x=>'<div class="cv-zone"><b>Z'+x.zone+'</b><span>'+esc(String(x.name||'').replace(/^Z\d+\s*/,''))+'</span><small>'+fmt(x.wattsLow)+(x.wattsHigh!=null?'–'+fmt(x.wattsHigh):'+')+' W</small></div>').join(''));}
};
async function renderCoachVisuals(turn,kinds=[]){
  if(!turn||!kinds.length)return;
  if(kinds.includes('zones')&&!state.trainingProfile)state.trainingProfile=await jsonFetch('/app/api/training-profile').catch(()=>null);
  const html=kinds.map(k=>{try{return COACH_VISUAL[k]?.()||'';}catch{return '';}}).join('');
  if(html)turn.insertAdjacentHTML('beforeend','<div class="coach-visuals">'+html+'</div>');
}
// Proposals sit inside the assistant's own answer: one visual card each (the
// workout's profile, a gym's exercises on the body figure), answered by
// writing ("potvrzuji", "nechci", "delší") or tapping the same words below.
let openCoachActions=[];
function coachActionLabel(a){return a.type==='gym_swap'?'Vyměnit '+a.fromExercise+' → '+a.toExercise:a.type==='week_sport'?'Přidat '+HUB_SPORTS[a.sport]+' do týdne · '+longDate(a.date):a.type==='status'?'Změnit stav na '+STATUS_LABELS[a.status]+(a.statusUntil?' · znovu '+STATUS_LABELS.active+' od '+longDate(a.statusUntil):''):a.type==='move'?'Přesunout '+(a.eventSnapshot?.name||'trénink')+' na '+longDate(a.date):a.type==='rest'?'Odstranit '+(a.eventSnapshot?.name||'trénink')+' · '+longDate(a.date):HUB_SPORTS[a.sport]+(a.preview?.workout?.name?' · '+a.preview.workout.name:a.workoutName?' · '+a.workoutName:'')+' · '+longDate(a.date)+' · '+hm(a.minutes);}
function coachActionVisual(a){
  const p=a.preview;
  if(a.type==='workout'&&p?.plan?.rows){
    const rows=p.plan.rows,work=rows.filter(r=>String(r[0]).toUpperCase()==='WORK'),sets=[...new Set(work.map(r=>r[1]))].map(exercise=>({exercise,count:work.filter(r=>r[1]===exercise).length}));
    return '<div class="gym-detail coach-visual">'+gymMuscleFigure(gymMuscleLoad(p.muscles,sets))+'<div>'+gymCompactList(Array.from({length:7},()=>[]).concat(rows),p.muscles)+'</div></div>';
  }
  if(a.type==='workout'&&p?.workout){const w=p.workout,f=[['Délka',num(w.duration_minutes)?hm(num(w.duration_minutes)):null],['Load',measured(w.target_load)?Math.round(num(w.target_load))+' TSS':null],['IF',num(w.intensity_factor)?dec(w.intensity_factor,2):null]].filter(([,v])=>v);return '<div class="coach-visual">'+workoutProfile(w)+'<dl class="workout-facts">'+f.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl></div>';}
  if(a.type==='gym_swap')return '<p class="small">'+esc(a.sets+' × '+a.reps+(a.kg==null?' · zátěž doplníš':' · '+String(a.kg).replace('.',',')+' kg'))+'</p>';
  return '';
}
function renderCoachActionCards(actions=[],turn=null){
  openCoachActions=actions.slice();
  $('assistantConversation').querySelectorAll('.coach-proposals').forEach(el=>el.remove());
  if(!actions.length)return;
  const host=turn||$('assistantConversation').lastElementChild;if(!host)return;
  const replies=['Potvrzuji',...(actions.some(a=>a.type==='workout')?['Jinou variantu','Kratší','Delší']:['Nechci'])];
  host.insertAdjacentHTML('beforeend','<div class="coach-proposals">'+actions.map(a=>'<div class="coach-action"><strong>'+esc(coachActionLabel(a))+'</strong>'+coachActionVisual(a)+(a.reason?'<p class="small">'+esc(a.reason)+'</p>':'')+'</div>').join('')+'<div class="coach-replies">'+replies.map((t,i)=>'<button type="button" class="assistant-quick" data-coach-reply="'+i+'">'+esc(t)+'</button>').join('')+'</div><p class="small coach-reply-hint">Odpověz zprávou: potvrzuji, nechci, nebo co upravit.</p></div>');
  host.querySelectorAll('[data-coach-reply]').forEach(b=>b.onclick=()=>sendAssistantMessage(replies[Number(b.dataset.coachReply)]));
}
// "Ok, potvrzuji" or "nechci" answers the open proposals without the AI.
const COACH_YES=/^(?:\s*(?:ok(?:ay)?|ano|jo|jj|potvrzuj[iu]|potvrdit|potvrzeno|souhlas[ií]m|souhlas|beru|plat[ií]|dobře|jasně|super|výborně|perfektní|jdeme na to|tak jo|klidně)\s*[,.!👍]*)+$/iu;
const COACH_NO=/^(?:\s*(?:ne|nechci|nebrat|zamítám|zamítnout|zruš(?:it)?|radši ne|to ne)\s*[,.!]*)+$/iu;
function coachReplyDecision(message){const m=String(message||'').trim();return COACH_YES.test(m)?'confirm':COACH_NO.test(m)?'reject':null;}
// One proposal confirmed or rejected; returns the line for the chat and, for a
// workout, the key of its proposal on the way to Intervals.icu.
async function decideCoachAction(a,decision){
  if(decision==='confirm'&&a.type==='gym_swap'&&gymDay()===a.date&&gymExerciseHasEditedDraft(a.fromExercise))throw new Error('U tohoto cviku máš rozepsané hodnoty. Nejdřív sérii ulož, nebo vrať hodnoty na původní zadání.');
  const r=await jsonFetch('/app/api/assistant/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draftId:a.draftId,decision})});
  if(decision!=='confirm')return {message:r.message};
  if(a.type==='status'){state.athleteState=r.result;state.coachAdvice=null;renderAthleteStatus();await refreshStatusCoaching();}
  else if(a.type==='gym_swap'){applyGymSwapToScreen(a,r.result);scheduleCoachRefresh();}
  else if(a.type==='week_sport'){state.hubWeek=mondayOf(a.date);state.hubWeekData=null;await loadWeekPlan(true);renderPlanner();await renderWeekHub();}
  else if(a.type==='workout'&&r.result){
    // Approved here: it goes to Intervals.icu by itself, like the week's proposals.
    state.proposals=state.proposals||{};let slot=0;while(state.proposals[proposalKey(a.date,a.sport,slot)])slot++;
    const key=proposalKey(a.date,a.sport,slot);state.proposals[key]=a.sport==='gym'?{gym:new Set((r.result.plan?.rows||[]).map(x=>x?.[1]).filter(Boolean)).size,gymPreview:r.result}:{workout:r.result.workout,result:r.result};
    queueProposalPush();renderWeekHub();return {message:r.message,key};
  }
  else{state.hubWeekData=null;await refreshAfterPlanChange();}
  return {message:r.message};
}
async function answerCoachActions(message,decision){
  const actions=openCoachActions;openCoachActions=[];
  appendCoachTurn('user',message);rememberCoachTurn('user',message);setAssistantDraft('');
  $('assistantConversation').querySelectorAll('.coach-replies').forEach(el=>el.remove());$('assistantConversation').querySelectorAll('.coach-reply-hint').forEach(el=>el.remove());
  const lines=[],keys=[];
  for(const a of actions){try{const r=await decideCoachAction(a,decision);lines.push((decision==='confirm'?'✓ ':'✕ ')+(r.message||coachActionLabel(a)));if(r.key)keys.push(r.key);}catch(error){lines.push('⚠ '+coachActionLabel(a)+': '+error.message);}}
  const text=lines.join('\n')+(decision==='reject'?'\n\nDobře, nic neměním. Napiš, co chceš jinak.':keys.length?'\n\nDo aplikace se uloží samo do 15 s; propojené Intervals.icu se synchronizuje; v plánu týdne ho můžeš zastavit.':'');
  appendCoachTurn('assistant',text);rememberCoachTurn('assistant',text);
  if(keys.length){$('assistantConversation').lastElementChild?.insertAdjacentHTML('beforeend','<div data-deploy-steps="'+esc(keys.join(','))+'"></div>');renderDeploySteps();}
  scrollAssistant(true);
}
function availabilityTime(minutes){return minutes==null?'Neurčeno':minutes===0?'Bez sportu':(Math.floor(minutes/60)?Math.floor(minutes/60)+' h':'')+(minutes%60?' '+minutes%60+' min':'');}
function availabilityEditorHtml(prefs,historyEstimate){
  return (prefs.automatic?'<p class="notice">'+esc(prefs.automatic.explanation)+uiText(' Výchozí objem: ', ' Default volume: ')+availabilityTime(prefs.automatic.weeklyMinutes)+uiText(' týdně. Uložením nastavíš vlastní čas.</p>', ' a week. Saving sets your own time.</p>'):'')+'<div class="availability-intro"><span class="availability-eyebrow">Časová dostupnost</span><p>Kolik času můžeš každý den věnovat sportu?</p><div class="availability-total"><strong id="availabilityTotal"></strong><span>za týden</span></div></div><div class="availability-grid">'+['Pondělí','Úterý','Středa','Čtvrtek','Pátek','Sobota','Neděle'].map((label,i)=>{const a=prefs.availability?.[i]||{},m=a.minutes;return '<div class="availability-row" data-availability-day="'+i+'" data-specified="'+(m==null?'false':'true')+'"><div class="availability-day-head"><label for="availabilitySlider'+i+'">'+label+'</label><button class="availability-duration" type="button" data-edit-duration aria-expanded="false"><span data-time-label>'+availabilityTime(m)+'</span><span aria-hidden="true">⌄</span></button></div><input id="availabilitySlider'+i+'" data-minutes type="range" min="0" max="'+Math.max(360,Math.ceil((m||0)/60)*60)+'" step="'+(m!=null&&m%15?'1':'15')+'" value="'+(m||0)+uiText('" aria-label="Čas pro sport · ', '" aria-label="Time for sport · ')+label+'"><div class="availability-exact" hidden><label>Hodiny<input data-hours type="number" min="0" max="24" step="1" value="'+Math.floor((m||0)/60)+'"></label><label>Minuty<input data-edit-minutes type="number" min="0" max="59" step="1" value="'+((m||0)%60)+'"></label><button type="button" class="btn" data-set-duration>Nastavit</button></div></div>';}).join('')+'</div><section class="availability-frequency"><div class="availability-frequency-head"><label for="availabilityCount">Aktivit za týden</label><div class="availability-frequency-controls"><input id="availabilityCount" type="number" min="0" max="14" step="1" aria-label="Počet aktivit za týden" value="'+(prefs.weeklyActivities??historyEstimate?.count??3)+'"'+(prefs.weeklyActivities==null?' disabled':' required')+'><label class="history-toggle"><input id="availabilityByHistory" type="checkbox"'+(prefs.weeklyActivities==null?' checked':'')+'> <span>Podle historie</span></label></div></div><p id="availabilityHistoryNote" class="availability-history-note" data-history-message="'+esc(historyEstimate?.message||'Historie zatím není dostupná. Do jejího načtení použijeme nejvýše 3 aktivity týdně podle dostupného času.')+'"></p></section>';
}
function installAvailabilityControls(root){
  const updateRow=row=>{const input=row.querySelector('[data-minutes]'),m=Number(input.value);input.style.setProperty('--fill',(m/Number(input.max)*100)+'%');input.setAttribute('aria-valuetext',row.dataset.specified==='true'?availabilityTime(m):'Neurčeno');row.querySelector('[data-time-label]').textContent=row.dataset.specified==='true'?availabilityTime(m):'Neurčeno';row.classList.toggle('no-time',m===0);row.classList.toggle('unspecified',row.dataset.specified!=='true');};
  const updateTotal=()=>{const rows=[...root.querySelectorAll('[data-availability-day]')],known=rows.filter(r=>r.dataset.specified==='true'),total=known.reduce((n,r)=>n+Number(r.querySelector('[data-minutes]').value),0);$('availabilityTotal').textContent=known.length?total?availabilityTime(total):'0 h':'Nastav svůj rytmus';};
  root.querySelectorAll('[data-availability-day]').forEach(row=>{
    const slider=row.querySelector('[data-minutes]');updateRow(row);
    slider.oninput=()=>{row.dataset.specified='true';row.querySelector('[data-hours]').value=Math.floor(Number(slider.value)/60);row.querySelector('[data-edit-minutes]').value=Number(slider.value)%60;updateRow(row);updateTotal();};
    row.querySelector('[data-edit-duration]').onclick=()=>{const panel=row.querySelector('.availability-exact');panel.hidden=!panel.hidden;row.querySelector('[data-edit-duration]').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)row.querySelector('[data-hours]').focus();};
    row.querySelector('[data-set-duration]').onclick=()=>{const hours=Number(row.querySelector('[data-hours]').value),minutes=Number(row.querySelector('[data-edit-minutes]').value),total=hours*60+minutes;if(!Number.isInteger(hours)||hours<0||hours>24||!Number.isInteger(minutes)||minutes<0||minutes>59||total>1440)return toast('Zadej délku od 0 do 24 hodin.');slider.max=Math.max(360,Math.ceil(total/60)*60);slider.step='1';slider.value=total;row.dataset.specified='true';row.querySelector('.availability-exact').hidden=true;row.querySelector('[data-edit-duration]').setAttribute('aria-expanded','false');updateRow(row);updateTotal();};
  });updateTotal();
  const mode=$('availabilityByHistory'),count=$('availabilityCount'),note=$('availabilityHistoryNote');
  const updateMode=()=>{count.disabled=mode.checked;count.required=!mode.checked;if(!mode.checked&&count.value==='')count.value='3';note.textContent=mode.checked?note.dataset.historyMessage:'Plánovač zohlední tento počet i čas dostupný v jednotlivých dnech.';note.classList.toggle('from-history',mode.checked);};mode.onchange=updateMode;updateMode();
}
function readAvailabilityEditor(root,prefs){
  return {...prefs,availabilityMode:'manual',weeklyActivities:$('availabilityByHistory').checked?null:Number($('availabilityCount').value),availability:[...root.querySelectorAll('[data-availability-day]')].map(row=>({window:'',minutes:row.dataset.specified==='true'?Number(row.querySelector('[data-minutes]').value):null,preferredSports:[]}))};
}
async function openAvailabilityEditor(scope){
  try{
    const weekly=scope==='week',start=state.hubWeek||localMonday(),data=weekly?await loadWeekPlan(true):await jsonFetch('/app/api/week-plan');
    openSheet('Časové možnosti','<form id="availabilityForm"><div class="availability-scope">'+(weekly?dateLabel(start)+' – '+dateLabel(dateShift(start,6)):'Běžný týden')+'</div>'+availabilityEditorHtml(data.prefs,data.historyEstimate)+'<div class="control-sheet-footer"><p class="small">'+(weekly?'Platí jen pro vybraný týden.':'Základ pro týdny bez vlastní výjimky.')+'</p><div id="availabilityError" class="small" role="status"></div><button class="btn primary availability-save" type="submit">Uložit</button>'+(weekly&&data.prefs.source==='week'?' <button class="btn availability-reset" type="button" id="resetAvailabilityWeek">Vrátit běžný týden</button>':'')+(weekly?' <button class="btn" type="button" id="editUsualWeek">Upravit běžný týden</button>':'')+'</div></form>',body=>{
      installAvailabilityControls(body);
      body.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=body.querySelector('[type=submit]');b.disabled=true;try{await jsonFetch('/app/api/week-plan'+(weekly?'?start='+start:''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(readAvailabilityEditor(body,data.prefs))});closeSheet();await loadWeekPlan(true);renderWeekHub();renderAvailabilitySummary();toast('Časové možnosti uloženy.');}catch(error){$('availabilityError').textContent=error.message;b.disabled=false;}};
      if($('editUsualWeek'))$('editUsualWeek').onclick=()=>{closeSheet();openAvailabilityEditor('default');};
      if($('resetAvailabilityWeek'))$('resetAvailabilityWeek').onclick=async()=>{try{await jsonFetch('/app/api/week-plan?start='+start,{method:'DELETE'});closeSheet();await loadWeekPlan(true);renderWeekHub();toast('Používám běžný týden.');}catch(error){$('availabilityError').textContent=error.message}};
    },'availability-sheet');
  }catch(error){toast(error.message);}
}
async function renderAvailabilitySummary(){
  const el=$('availabilitySummary');if(!el)return;
  try{const {prefs}=await jsonFetch('/app/api/week-plan');const specified=prefs.availability?.filter(a=>a.minutes!=null)||[];el.textContent=specified.length?specified.length+' dní s nastavenou dostupností · '+fmt(specified.reduce((s,a)=>s+a.minutes,0)/60,1)+' h/týden'+(prefs.weeklyActivities!=null?' · '+prefs.weeklyActivities+' aktivit':' · počet podle historie'):'Běžný týden zatím nemá nastavený čas na trénink.';}catch(error){el.textContent=error.message;}
}
// "Vygenerovat tréninky" works in the background: the week's open plan chips
// become sessions in the plan itself (a gym proposal is opened and confirmed there).
async function showAdaptiveWeekProposal(){
  const b=$('proposeWeek'),revision=statusCoachingRevision,start=state.hubWeek||localMonday(),status=$('plannerStatus');
  if(statusPausesTraining()){status.textContent='Tréninky jsou teď pozastavené, nic negeneruji.';return;}
  b.disabled=true;status.textContent='Připravuji tréninky na zbytek týdne…';
  try{
    const r=await jsonFetch('/app/api/coach/week',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start})});
    if(revision!==statusCoachingRevision)return;
    const p=r.proposal||{},items=(p.items||[]).filter(x=>!state.proposals?.[proposalKey(x.date,x.sport,x.slot)]?.scheduled);
    if(!items.length){
      if(p.missingAvailability){status.innerHTML='Nejdřív nastav časové možnosti. <button type="button" class="btn" id="proposeAvailability">Nastavit</button>';$('proposeAvailability').onclick=()=>openAvailabilityEditor('week');}
      else status.textContent=p.warnings?.[0]?.text||'Na zbytek týdne není co připravit.';
      return;
    }
    if(p.prefs){state.weekPlan=await jsonFetch('/app/api/week-plan?start='+r.start,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p.prefs)});state.hubWeek=r.start;renderPlanner();}
    const done=await generateWeekProposals(items);
    if(Object.values(state.proposals||{}).some(gymProposalOpen))status.insertAdjacentHTML('beforeend','<span class="gym-confirm-hint"> · gym otevři ve fialové kartičce a potvrď</span>');
    return done;
  }catch(error){status.textContent=error.message;}finally{b.disabled=false;}
}
function renderAssistantWeekProposal(r){
  const el=$('weekProposalCards'),p=r.proposal||{},items=p.items||[],paused=statusPausesTraining();
  el.innerHTML=(p.warnings||[]).map(w=>'<p class="small">'+esc((w.date?dateLabel(w.date)+' · ':'')+w.text)+'</p>').join('')+
    (p.missingAvailability?'<p class="small">Pro nový plán nastav časové možnosti.</p><button class="btn" id="proposalAvailability">Nastavit dostupnost</button>':'')+
    (items.length?uiText('<h4>Nové aktivity · ', '<h4>New activities · ')+dateLabel(r.start)+'</h4><div class="week-proposal-list">'+items.map(x=>'<div><strong>'+esc(longDate(x.date))+'</strong><span>'+esc(HUB_SPORTS[x.sport])+' · '+hm(x.minutes)+' · '+(x.environment==='indoor'?'indoor':'outdoor')+'</span><small>'+esc(x.reason||x.label||'')+'</small></div>').join('')+'</div>':'')+
    '<div class="assistant-week-tools">'+(items.length&&!paused?'<button class="btn primary" id="confirmWeekProposal">Připravit tyto tréninky</button>':'')+(!paused?'<button class="btn" id="detailExistingWeek">Rozpracovat plánované</button>':'')+'<button class="btn" id="discussWeekProposal">Probrat kompromis</button></div>';
  if($('proposalAvailability'))$('proposalAvailability').onclick=()=>openAvailabilityEditor('week');
  if($('confirmWeekProposal'))$('confirmWeekProposal').onclick=async()=>{const button=$('confirmWeekProposal'),tools=button.closest('.assistant-week-tools');tools.querySelectorAll('button').forEach(x=>x.disabled=true);button.textContent='Připravuji…';
    try{state.weekPlan=await jsonFetch('/app/api/week-plan?start='+r.start,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p.prefs)});state.hubWeek=r.start;renderPlanner();
      const done=await generateWeekProposals(items);
      // The proposal is answered: the list and its buttons give way to the result.
      $('weekProposalCards').innerHTML=uiText('<div class="notice week-proposal-done"><strong>✓ Plán týdne je schválený.</strong><p>Připraveno ', '<div class="notice week-proposal-done"><strong>✓ The week plan is approved.</strong><p>Prepared ')+done.ok+' z '+items.length+uiText(' tréninků', ' workouts')+(done.failed.length?', '+done.failed.length+uiText(' se nepovedlo – zkus je znovu', ' failed – try them again'):'')+'. Do Intervals.icu se zapíšou samy do 15 s; v plánu týdne můžeš kterýkoli zastavit tlačítkem Nezapisovat.</p><div data-deploy-steps></div><div class="assistant-week-tools"><button class="btn primary" type="button" id="showWeekProposals">Otevřít plán týdne</button>'+(done.failed.length?'<button class="btn" type="button" id="retryWeekProposals">Zkusit znovu ('+done.failed.length+')</button>':'')+'</div></div>';
      $('showWeekProposals').onclick=()=>{$('assistantDialog').close();activate('workouts');openWorkouts();$('hubWeek').scrollIntoView({behavior:'smooth',block:'start'});};
      if($('retryWeekProposals'))$('retryWeekProposals').onclick=async()=>{$('retryWeekProposals').disabled=true;const again=await generateWeekProposals(done.failed);$('retryWeekProposals')?.remove();appendCoachTurn('assistant','Znovu připraveno '+again.ok+' z '+done.failed.length+'.');};
      renderDeploySteps();
      appendCoachTurn('assistant',done.failed.length?'Připravil jsem '+done.ok+' z '+items.length+' tréninků. '+done.failed.length+' se nepovedlo, server byl přetížený – můžeš je zkusit znovu.':'Tréninky jsou připravené a do 15 s je uložím do aplikace. Průběh vidíš tady i v plánu týdne.');
    }catch(error){$('assistantStatus').textContent=error.message;tools.querySelectorAll('button').forEach(x=>x.disabled=false);button.textContent='Připravit tyto tréninky';}};
  $('discussWeekProposal').onclick=()=>discussWithAssistant('Chci probrat kompromis k návrhu pro týden '+r.start+'. '+(items.length?'Navržené aktivity: '+items.map(x=>x.date+' · '+HUB_SPORTS[x.sport]+' · '+hm(x.minutes)).join('; ')+'. ':'')+'Navrhni mírnější variantu, která zohlední regeneraci, dostupný čas a můj cíl. Pokud potřebuješ něco upřesnit, zeptej se.',{appContext:{view:'workouts',date:r.start,weekStart:r.start,sport:null,exercise:null}});
  if($('detailExistingWeek'))$('detailExistingWeek').onclick=async()=>{const button=$('detailExistingWeek');button.disabled=true;try{const week=await hubWeekData(),detail=[];for(const d of week.days||[]){if(d.date<localToday())continue;for(const a of d.daily?.training?.planned||[]){const sport=activitySport(a);if(!['ride','run','gym'].includes(sport))continue;detail.push({date:d.date,sport,slot:detail.filter(x=>x.date===d.date&&x.sport===sport).length,minutes:Math.round((a.durationHours||1)*60),environment:sport==='gym'?'indoor':'auto',existing:a.id});}}if(detail.length){await generateWeekProposals(detail);appendCoachTurn('assistant','Podrobnosti k naplánovaným tréninkům jsou připravené v plánu týdne.');}else $('assistantStatus').textContent='V tomto týdnu nejsou zbývající plánované tréninky.';}catch(error){$('assistantStatus').textContent=error.message;}finally{button.disabled=false;}};
}
// A gym proposal before it is planned: the same view as a planned day, changed
// by hand or by the AI coach, and written to the plan by "Potvrdit trénink".
function openGymPreview(date,pr){
  const g=pr.gymPreview,plan=g.plan||{},draft=pr.draft||(pr.draft={rows:(plan.rows||[]).map(r=>r.slice()),muscles:{...(g.muscles||{})}}),open=gymProposalOpen(pr);
  const minutes=plan.timing?.estimatedMinutes||plan.timing?.requestedMinutes;
  const head='<div class="eyebrow">'+(pr.scheduled?'✓ Potvrzeno · je v plánu':pr.existing?'Rozpis naplánovaného gymu':'Návrh · čeká na potvrzení')+'</div><h4 class="training-name">'+esc(plan.planName||'Gym')+'</h4>'+(plan.rationale?'<p class="small">'+esc(plan.rationale)+'</p>':'');
  const foot=open?'<div class="gs-confirm"><button type="button" class="btn primary" id="confirmGymPreview">✓ Potvrdit trénink</button><p class="small">Uloží se do aplikace. Propojené Intervals.icu se synchronizuje.</p></div>':pr.existing?'<p class="small">Jde o rozpis už naplánovaného gymu. Úpravy dělej v jeho detailu.</p>':'';
  openSheet('Gym · '+longDate(date),head+'<div class="gs-host"></div>'+foot,body=>{
    const host=body.querySelector('.gs-host');
    mountGymSession(host,{mode:'draft',date,editable:open,draft,facts:minutes?[['Délka','~'+hm(minutes)]]:[],back:()=>openGymPreview(date,pr)});
    const b=$('confirmGymPreview');if(!b)return;
    b.onclick=async()=>{b.disabled=true;b.textContent='Ukládám…';const pending=showPendingAdd({id:'gym',name:plan.planName||'Gym'},date,'gym');
      try{const r=await jsonFetch('/app/api/gym/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draftId:g.draftId,rows:draft.rows})});
        pr.scheduled=true;pr.gym=new Set(draft.rows.map(x=>x[1])).size;settlePendingAdd(pending,true);closeSheet();renderDeploySteps();if(!Object.values(state.proposals||{}).some(gymProposalOpen))document.querySelector('.gym-confirm-hint')?.remove();
        toast(r.intervals?.status==='error'?'Gym je v plánu, zápis do Intervals.icu selhal: '+r.intervals.message:'Gym je v plánu.');
        if(gymDay()===date)loadGym().catch(()=>{});await reloadWeek();}
      catch(error){settlePendingAdd(pending,false);toast(error.message);b.disabled=false;b.textContent='✓ Potvrdit trénink';}};
  },'training-detail');
}
function installAdaptivePlanning(){
  // Training time is set in one place, the week plan (Plán → Časové možnosti);
  // Settings only shows it and leads there.
  settingsBody('training').insertAdjacentHTML('beforeend','<article class="card" id="availabilitySettings"><h3>Časové možnosti</h3><p class="small" id="availabilitySummary">Načítám…</p><p class="small">Čas na trénink nastavuješ v Plánu, u týdne i pro běžný týden.</p><button class="btn primary" id="editDefaultAvailability" type="button">Otevřít Plán</button><div id="coachMemories"></div></article>');
  $('editDefaultAvailability').onclick=()=>activate('workouts');
  $('proposeWeek').closest('.planner-actions').insertAdjacentHTML('afterbegin','<button class="btn" id="editWeekAvailability" type="button">🕒 Časové možnosti</button>');
  $('editWeekAvailability').onclick=()=>openAvailabilityEditor('week');
  document.body.insertAdjacentHTML('beforeend','<button class="assistant-fab" id="floatingAssistant" type="button" aria-label="Otevřít AI">✦ AI</button>');
  // The same button opens and closes the chat.
  $('floatingAssistant').onclick=()=>$('assistantDialog')?.open?$('assistantDialog').close():openFloatingAssistant();
  const auto=$('generateEnvironment');if(auto){auto.insertAdjacentHTML('afterbegin','<option value="auto">Podle počasí a sezóny</option>');auto.value='auto';}
  $('assistantForm').onsubmit=async e=>{
    e.preventDefault();await sendAssistantMessage($('assistantMessage').value.trim());
  };
  $('assistantMessage').addEventListener('input',updateAssistantComposer);updateAssistantComposer();
  window.visualViewport?.addEventListener('resize',positionAssistantInViewport);window.visualViewport?.addEventListener('scroll',positionAssistantInViewport);
  const previous=load;load=async()=>{await previous();try{if(!state.athleteState){const r=await jsonFetch('/app/api/athlete-state');state.athleteState=r.state;}renderCoachMemories();renderToday();const signature=JSON.stringify([localToday(),state.athleteState.status,(state.fitness?.wellness||[]).at(-1),(state.sleep?.sessions||[]).filter(s=>s.date===localToday())]);if(state.checkInSignature!==signature){const check=await jsonFetch('/app/api/coach/check-in');state.coachAdvice=check.advice;state.checkInSignature=signature;renderAthleteStatus();}}catch{};};
  const priorActivate=activate;activate=function(id){priorActivate(id);if(id==='settings'){renderAvailabilitySummary();renderCoachMemories();}if(id==='today')renderAthleteStatus();if($('assistantDialog').open&&!assistantBusy)renderAssistantContext();};
  document.addEventListener('change',e=>{if(['generateDate','gymDate','viewDate'].includes(e.target.id)&&$('assistantDialog').open&&!assistantBusy)renderAssistantContext();});
}
function renderCoachMemories(){
  const el=$('coachMemories');if(!el)return;const memories=state.athleteState?.memories||[];
  el.innerHTML='<h4>AI si pamatuje</h4>'+(memories.length?memories.map((m,i)=>'<div class="memory-row"><span>'+esc(m)+'</span><button class="btn" type="button" data-forget-memory="'+i+'">Zapomenout</button></div>').join(''):'<p class="small">Výslovné preference sdělené AI se uloží sem.</p>');
  el.querySelectorAll('[data-forget-memory]').forEach(b=>b.onclick=async()=>{try{await athleteStatePost({forget:memories[Number(b.dataset.forgetMemory)]});renderCoachMemories();}catch(error){toast(error.message)}});
}
installAdaptivePlanning();

function activityEnvironmentBadge(activity,sport){
  if(sport==='gym'||/weight|strength/i.test(activity.type||''))return '';
  const p=activity.payload||{},type=String(activity.type||'')+' '+String(p.type||p.exercise?.exerciseType||''),text=String(activity.name||p.name||'');
  const indoor=activity.environment==='indoor'||p.environment==='indoor'||p.indoor===true||/Virtual|Indoor|Treadmill|POOL_SWIMMING/i.test(type)||/\bindoor\b|trenaž|trenaz|zwift|treadmill|běžecký pás/i.test(text);
  const outdoor=activity.environment==='outdoor'||p.environment==='outdoor'||p.indoor===false||p.exercise?.exerciseMetadata?.hasGps===true||Number(p.distance)>0||/OUTDOOR|OPEN_WATER/i.test(type)||/\boutdoor\b|venku|silnice|trail/i.test(text)||/^(Ride|Run|Walk|Hike|EBikeRide|MountainBikeRide|GravelRide)( |$)/.test(type);
  return '<span class="activity-environment '+(indoor?'indoor':outdoor?'outdoor':'unknown')+'">'+(indoor?'Uvnitř':outdoor?'Venku':'Prostředí neuvedeno')+'</span>';
}
function weeklyEnergySummary(days,today){
  const total=items=>items.reduce((sum,d)=>sum+num(d.daily?.nutrition?.calorieTarget??d.daily?.calories?.target),0);
  const elapsed=days.filter(d=>d.date<=today),logged=elapsed.filter(d=>num(d.food?.totals?.kcal)>0||(d.food?.entries||[]).length);
  const consumed=logged.reduce((sum,d)=>sum+num(d.food?.totals?.kcal),0),closed=logged.filter(d=>d.date<today);
  return {target:total(days),consumed,remaining:Math.max(0,total(days)-consumed),logged:logged.length,elapsed:elapsed.length,
    missing:elapsed.length-logged.length,closedDifference:total(closed)-closed.reduce((sum,d)=>sum+num(d.food?.totals?.kcal),0),closed:closed.length,
    targets:days.filter(d=>measured(d.daily?.nutrition?.calorieTarget??d.daily?.calories?.target)).length};
}
function renderWeeklyEnergy(){
  let card=$('weeklyEnergy');if(!card){card=document.createElement('article');card.id='weeklyEnergy';card.className='card weekly-energy';$('nutritionWeekly')?.append(card);}
  const days=state.week?.days||[];if(!days.length){card.hidden=true;return}card.hidden=false;
  const b=weeklyEnergySummary(days,localToday()),difference=Math.round(b.closedDifference);
  card.innerHTML='<div class="do-head"><h3>Kalorie za týden</h3><small>'+esc(dateLabel(weekStart)+' – '+dateLabel(dateShift(weekStart,6)))+'</small></div><div class="weekly-energy-values"><div><span>Cíl za celý týden</span><strong>'+(b.targets===days.length?fmt(b.target):'Neúplný cíl')+' <small>kcal</small></strong></div><div><span>Zapsaný příjem</span><strong>'+fmt(b.consumed)+' <small>kcal</small></strong></div><div><span>Do týdenního cíle</span><strong>'+(b.targets===days.length?fmt(b.remaining):'—')+' <small>kcal</small></strong></div></div><div class="weekly-energy-bar"><i style="width:'+Math.min(100,b.target?b.consumed/b.target*100:0)+'%"></i></div>'+
    (b.closed?'<p class="weekly-energy-difference">'+(difference>=0?'Pod cílem zaznamenaných minulých dní o ':'Nad cílem zaznamenaných minulých dní o ')+'<strong>'+fmt(Math.abs(difference))+' kcal</strong>.</p>':'')+
    '<p class="small">'+b.logged+' z '+b.elapsed+' uplynulých dní má záznam'+(b.missing?' · '+(b.missing===1?uiText('1 den', '1 day'):b.missing<5?b.missing+uiText(' dny', ' days'):b.missing+uiText(' dní', ' days'))+uiText(' bez zápisu se do rozdílu nepočítá', ' without entries aren\'t counted in the difference'):'')+'.</p>';
}
function activityEnergyLabel(a){
  if(!measured(a.calories))return '';
  const c=a.energyCheck;
  let text=' · '+fmt(a.calories)+' kcal '+(c?.telemetry?'z minutových dat':'ze souhrnu zařízení');
  if(c?.telemetry&&c.summaryMismatch)text+=' · původní souhrn '+fmt(c.summaryCalories)+' kcal';
  if(c?.status==='review')text+=c.telemetry?uiText(' · ⚠ výdej chůze k ověření', ' · ⚠ walking expenditure to check'):uiText(' · ⚠ výdej k ověření; pro plán orientačně ', ' · ⚠ expenditure to check; for planning about ')+fmt(a.caloriesForPlanning)+uiText(' kcal (odhad podle hmotnosti a délky chůze)', ' kcal (estimate from weight and walk duration)');
  return text;
}
// What a logged food brings, in a few short tags: protein per 100 kcal, its
// share of the day, carbs next to a ride or run, fibre and salt when known.
function enduranceSoon(date){const days=[...(state.week?.days||[]),...(state.hubWeekData?.days||[])];return [date,dateShift(date,1)].some(d=>(days.find(x=>x.date===d)?.daily?.training?.planned||[]).concat(d===date?days.find(x=>x.date===d)?.daily?.training?.completed||[]:[]).some(a=>/ride|run|cycl|bike|běh/i.test(String(a.type||'')+' '+String(a.name||''))&&num(a.durationHours)>=1));}
function foodAssessment(entry,{dayTarget=0,date=null}={}){
  const p=num(entry.protein_g),c=num(entry.carbs_g),f=num(entry.fat_g),kcal=num(entry.kcal)||p*4+c*4+f*9,energy=p*4+c*4+f*9;
  if(!energy||!kcal)return [];
  const tags=[],density=p/kcal*100;
  if(density>=8)tags.push(['good',uiText('výborný zdroj bílkovin (', 'excellent protein source (')+fmt(density,1)+' g/100 kcal)']);
  else if(density>=5)tags.push(['good','dobrý zdroj bílkovin · '+fmt(p)+' g']);
  else if(kcal>=250&&density<2.5)tags.push(['warn','málo bílkovin na '+fmt(kcal)+' kcal']);
  if(c*4/energy>=.6)tags.push(enduranceSoon(date||entry.consumed_date||localToday())?['good','sacharidy se hodí k jízdě nebo běhu']:['info','převážně sacharidy · '+fmt(c)+' g']);
  else if(f*9/energy>=.55)tags.push(['warn','hodně tuku · '+fmt(f)+' g']);
  if(num(entry.fiber_g)>=5)tags.push(['good','hodně vlákniny · '+fmt(entry.fiber_g)+' g']);
  let note={};try{note=JSON.parse(entry.note||'{}');}catch{}
  if(num(note.salt_g)>=1.5)tags.push(['warn','sůl '+fmt(note.salt_g,1)+' g']);
  if(dayTarget>0&&kcal/dayTarget>=.15)tags.push(['info',fmt(kcal/dayTarget*100)+' % denního cíle']);
  return tags.slice(0,3);
}
function foodAssessmentHtml(entry,options){
  const tags=foodAssessment(entry,options);
  return tags.length?'<span class="food-tags" title="Přehled podle zapsané porce a maker">'+tags.map(([kind,text])=>'<small class="food-tag tag-'+kind+'">'+esc(text)+'</small>').join('')+'</span>':'';
}
function foodExportHtml(entry){
  if(!serviceConnected('google'))return '';
  const status=entry.google?.status||'not_exported',labels={synced:'✓ Google Health',queued:'Google · čeká na odeslání',syncing:'Google · odesílám',operation:'Google · potvrzuji zápis',planned:'Plán · do Google až v daný den',error:'Google · zápis se nepodařil',uncertain:'Google · výsledek není potvrzený',disconnected:'Google · není připojené',not_exported:'Google · dosud neodesláno'};
  return '<small class="food-export export-'+esc(status)+'" title="'+esc(entry.google?.message||'')+'">'+esc(labels[status]||status)+(['error','not_exported'].includes(status)?' <button type="button" data-food-sync="'+Number(entry.id)+'">Odeslat znovu</button>':'')+'</small>';
}
function installReliableFoodEditor(){
  const grid=$('foodAdvancedFields'),editor=$('foodEditor');
  // The older compact editor moved the piece labels into the main grid.
  // Restore them once, before the user starts editing, to keep extras optional.
  $('foodPieceSettings').append($('foodPieceAmount').closest('label'),$('foodPieceUnit').closest('label'));
  for(const id of ['foodGrams','foodUnit'])$(id).closest('label').hidden=true;
  grid.append($('foodPackEditor'));$('foodPackEditor').classList.add('manual-food-package');
  $('foodAdvanced').querySelector('summary').textContent='Název a hodnoty z etikety';
  const extra=document.createElement('details');extra.id='foodExtraSizes';extra.innerHTML='<summary>Porce, kus a další údaje</summary><div class="food-editor-grid"><label>Velikost jedné porce<input id="foodServingAmount" class="food-input" inputmode="decimal" placeholder="Např. 150"></label><label>Jednotka porce<select id="foodServingUnit" class="food-input"><option value="g">g</option><option value="ml">ml</option></select></label></div>';
  grid.after(extra);extra.append($('foodBrand').closest('label'),$('foodPieceSettings'),$('foodDensitySettings'));
  $('foodPieceSettings').hidden=false;
  const originalProduct=foodEditorProduct;
  foodEditorProduct=function(){
    const p=originalProduct(),pack=parseFoodQuantity($('foodPackAmount').value),serving=parseFoodQuantity($('foodServingAmount').value),piece=parseFoodQuantity($('foodPieceAmount').value);
    p.quantity=pack?pack+' '+$('foodPackUnit').value:'';p.serving_size=serving?serving+' '+$('foodServingUnit').value:'';p.piece_size=piece?piece+' '+$('foodPieceUnit').value:'';
    const choice=$('simpleFoodPortion')?.value;p.preferred_unit=choice==='serving'?'portion':choice==='piece'?'piece':choice==='pack'?'pack':p.nutrition_basis==='portion'?'portion':p.nutrition_basis;
    return p;
  };
  const select=selectFoodProduct;
  selectFoodProduct=function(p){
    const portion=foodPackageSize(p.serving_size),piece=foodPackageSize(p.piece_size);
    $('foodServingAmount').value=portion?.amount||'';$('foodServingUnit').value=portion?.unit||p.nutrition_basis||'g';
    select(p);$('foodPieceAmount').value=piece?.amount||'';$('foodPieceUnit').value=piece?.unit||foodPortionDefaults(p).basis;
    $('foodPieceSettings').hidden=false;extra.open=false;
    $('foodEditor').dispatchEvent(new Event('change',{bubbles:true}));
  };
  const preview=updateFoodPreview;updateFoodPreview=function(){preview();$('foodPieceSettings').hidden=false;};
  for(const id of ['foodPackAmount','foodPackUnit','foodServingAmount','foodServingUnit','foodPieceAmount','foodPieceUnit'])$(id).addEventListener('input',()=>{
    if(id.startsWith('foodPack')&&parseFoodQuantity($('foodPackAmount').value)&&!['piece','portion'].includes($('foodUnit').value)){$('foodUnit').value='pack';$('foodGrams').value='1';}
    editor.dispatchEvent(new Event('change',{bubbles:true}));updateFoodPreview();
  });
  $('savePersonalFood').textContent='Uložit do katalogu potravin';
  $('savePersonalFood').onclick=async()=>{const b=$('savePersonalFood');b.disabled=true;try{const r=await jsonFetch('/app/api/food/personal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(foodEditorProduct())});toast(r.product.nutrition_basis==='portion'?'Porce uložena pro tebe. Pro společný katalog doplň hmotnost a hodnoty na 100 g/ml.':'Potravina uložená pro tebe i do společného katalogu.');foodMessage('✓ Potravina uložena.');}catch(error){foodMessage(error.message);toast(error.message);}finally{b.disabled=false;}};
  $('foodEntry').querySelector('.food-controls').insertAdjacentHTML('afterend','<button type="button" class="btn" id="myFoodLibrary">Moje potraviny</button><p class="small food-catalog-note">Po zápisu uložíme hodnoty na 100 g/ml a známé velikosti porcí do společného katalogu. Osobní jídelníček a oblíbená jednotka zůstávají soukromé.</p>');
  $('myFoodLibrary').onclick=async()=>{
    openSheet('Moje potraviny','<p class="small">Načítám uložené potraviny…</p>');
    try{const r=await jsonFetch('/app/api/food/personal'),products=r.products||[];$('sheetBody').innerHTML=products.length?'<input type="search" class="food-input library-search" id="libraryFoodSearch" placeholder="Hledat v mých potravinách" aria-label="Hledat v mých potravinách" autocomplete="off"><p class="small" id="libraryFoodCount">'+products.length+' potravin z tvého účtu.</p>'+products.map((p,i)=>'<button type="button" class="food-result" data-library-food="'+i+'"><strong>'+esc(p.name)+'</strong><span>'+fmt(p.calories_100g)+' kcal / '+(p.nutrition_basis==='portion'?'porce':'100 '+p.nutrition_basis)+(p.quantity?' · '+esc(p.quantity):'')+'</span></button>').join(''):'<p class="small">Zatím tu nemáš uloženou žádnou potravinu.</p>';$('sheetBody').querySelectorAll('[data-library-food]').forEach(b=>b.onclick=()=>{const p=products[Number(b.dataset.libraryFood)];closeSheet();openFoodLogger();selectFoodProduct(p);});
      // Search ignores case and diacritics, so "jogurt reck" finds "Řecký jogurt".
      const plain=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),search=$('libraryFoodSearch');
      if(search){search.oninput=()=>{const words=plain(search.value).split(/\s+/).filter(Boolean);let shown=0;$('sheetBody').querySelectorAll('[data-library-food]').forEach(b=>{const p=products[Number(b.dataset.libraryFood)],hit=words.every(w=>plain(p.name+' '+(p.brand||'')).includes(w));b.hidden=!hit;if(hit)shown++;});$('libraryFoodCount').textContent=words.length?(shown?shown+' z '+products.length+' potravin':'Nic neodpovídá hledání.'):products.length+' potravin z tvého účtu.';};if(!isPhone())search.focus();}
    }catch(error){$('sheetBody').textContent=error.message;}
  };
  const nutrition=renderNutrition;renderNutrition=function(){nutrition();renderWeeklyEnergy();};
  const style=document.createElement('style');style.textContent='.weekly-energy{margin:16px 0}.weekly-energy-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.weekly-energy-values span{display:block;font-size:var(--fs-small);color:color-mix(in srgb,var(--muted) 96%,var(--bg))}.weekly-energy-values strong{display:block;font-size:25px;margin:7px 0}.weekly-energy-values small{font-size:var(--fs-small)}.weekly-energy-bar{height:6px;background:color-mix(in srgb,var(--muted) 22%,var(--bg));border-radius:10px;overflow:hidden;margin:16px 0}.weekly-energy-bar i{display:block;height:100%;background:#91e5c9}.food-assessment{color:color-mix(in srgb,var(--primary) 38%,var(--muted))!important;margin-top:5px}.food-export{color:color-mix(in srgb,var(--muted) 87%,var(--bg))!important;margin-top:4px}.food-export button{font:inherit;color:#91e5c9;background:none;border:0;text-decoration:underline;cursor:pointer;padding:0}.export-error,.export-uncertain{color:#ffc184!important}.activity-environment{display:table;font-size:var(--fs-small);padding:3px 6px;border:1px solid color-mix(in srgb,var(--muted) 32%,var(--bg));border-radius:5px;margin:5px 0;color:color-mix(in srgb,var(--primary) 44%,var(--muted))}.activity-environment.indoor{color:#c3b0ee}.manual-food-package{grid-column:1/-1!important}#foodExtraSizes{margin-top:12px}#foodExtraSizes .food-editor-grid{margin-top:10px}#foodAdvancedFields .food-input,#foodExtraSizes .food-input{font-size:16px!important}#foodAddDirect:disabled{opacity:.4}#myFoodLibrary{margin-top:8px}.library-search{width:100%;margin:0 0 6px;font-size:16px}.food-catalog-note{margin:10px 0}.ml-entry>span{min-width:0}.ml-entry small{white-space:normal;overflow-wrap:anywhere}@media(max-width:600px){.weekly-energy-values{gap:8px}.weekly-energy-values strong{font-size:20px}.weekly-energy-values span{font-size:var(--fs-small)}#foodAdvancedFields{grid-template-columns:repeat(2,minmax(0,1fr))!important}#foodProductName{font-size:16px!important}}';document.head.append(style);
}
installReliableFoodEditor();
setInterval(()=>{if(!document.hidden&&(mealEntries||[]).some(e=>['queued','syncing','operation'].includes(e.google?.status)))loadEnteredFood();},10000);

function installGymCancellation(){
  $('generateGym').insertAdjacentHTML('afterend','<button type="button" class="btn" id="cancelGym" hidden>Zrušit posilovnu</button><button type="button" class="btn" id="restoreGym" hidden>Obnovit původní plán</button>');
  const original=renderGym;renderGym=function(){original();const cancelled=Boolean(state.gym?.cancelled);$('cancelGym').hidden=cancelled||!(state.gym?.values||[]).slice(7).some(r=>r?.[1]);$('restoreGym').hidden=!state.gym?.recoverable;$('saveGym').disabled=cancelled;$('addGymExercise').disabled=cancelled;const past=gymDay()<localToday();$('generateGym').hidden=past;$('gymPlanHint')?.toggleAttribute('hidden',past);if(cancelled)$('gymNotice').textContent='Posilovna na tento den je zrušená. Původní plán a zapsané výsledky zůstaly uložené.';};
  for(const action of ['cancel','restore'])$(action+'Gym').onclick=async()=>{const b=$(action+'Gym');b.disabled=true;planDataRevision++;try{await gymSaveQueue.catch(()=>{});const r=await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:gymDay(),action})});if(action==='cancel'){state.gym={...state.gym,cancelled:true,recoverable:true,values:[]};updateCachedDay(gymDay(),null,state.gym);delete state.proposals?.[gymDay()+'|gym'];renderToday();renderGym();}toast(r.message);await refreshAfterPlanChange();}catch(error){toast(error.message)}finally{b.disabled=false;}};
  const style=document.createElement('style');style.textContent='.nutrition-weekly{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,1fr);gap:16px;margin-top:16px;align-items:stretch}.nutrition-weekly>.card{min-width:0;margin:0}.nutrition-weekly .weekly-energy-values{grid-template-columns:1fr;gap:4px}.nutrition-weekly .weekly-energy-values strong{font-size:28px}.nutrition-weekly .weekly-energy-values>div{padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--muted) 22%,var(--bg))}.macro-week-chart{height:auto!important;aspect-ratio:auto!important}.macro-legend{display:flex;flex-wrap:wrap;gap:14px;margin:14px 0 10px;color:color-mix(in srgb,var(--muted) 78%,var(--text));font-size:var(--fs-small)}.macro-legend span{display:flex;gap:6px;align-items:center}.macro-legend i{width:8px;height:8px;border-radius:50%}.macro-chart-scroll{overflow-x:auto;padding-bottom:6px}.macro-columns{display:grid;grid-template-columns:repeat(7,minmax(62px,1fr));gap:10px;min-width:480px}.macro-day{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}.macro-day-name{text-transform:capitalize;font-size:var(--fs-small);color:color-mix(in srgb,var(--muted) 88%,var(--text))}.macro-day strong{font-size:20px}.macro-day small{font-size:var(--fs-small);color:color-mix(in srgb,var(--muted) 88%,var(--text))}.macro-day-track{height:190px;width:100%;max-width:64px;border:1px solid color-mix(in srgb,var(--muted) 32%,var(--bg));border-radius:10px;background:color-mix(in srgb,var(--cyan) 7%,var(--bg));display:flex;align-items:flex-end;overflow:hidden;margin:8px 0}.macro-day-fill{display:flex;flex-direction:column-reverse;width:100%;overflow:hidden}.macro-day-fill i{display:block;width:100%;flex-shrink:0}.macro-day-progress{font-size:var(--fs-small);line-height:1.25;text-align:center;overflow-wrap:anywhere;max-width:100%;color:color-mix(in srgb,var(--muted) 96%,var(--bg))}.macro-day-progress.over{color:var(--warn)}.macro-day.current .macro-day-name{color:var(--primary-text)}.macro-day.current .macro-day-track{border-color:#91e5c9}@media(max-width:900px){.nutrition-weekly{grid-template-columns:1fr}.nutrition-weekly .weekly-energy-values{grid-template-columns:repeat(3,minmax(0,1fr))}.nutrition-weekly .weekly-energy-values strong{font-size:21px}.nutrition-weekly .weekly-energy-values span{font-size:var(--fs-small)}}@media(max-width:800px){#nutrition>.nutrition-weekly{order:6;margin-top:12px}#nutrition>.nutrition-next{order:1;margin-bottom:12px}}';document.head.append(style);
}
installGymCancellation();

// ---- A day ahead: the signal tiles show an outlook, not today's measurements ----
// Fitness and form are projected from today's values with the planned load
// (CTL/ATL time constants 42 and 7 days, as Intervals.icu); a day without a
// loaded plan counts as rest and the tile says so.
function plannedLoads(){
  const m=new Map();for(const d of [...(state.week?.days||[]),...(hubDays()||[])]){const p=(d.daily?.training?.planned||[]).filter(x=>!isNutritionItem(x));if(d.date&&!m.has(d.date))m.set(d.date,p.reduce((s,x)=>s+num(x.tss),0));}
  return m;
}
function projectedForm(date){
  const rows=(state.fitness?.wellness||[]).filter(r=>r.id<=localToday()&&measured(r.ctl)&&measured(r.atl)),last=rows.at(-1);if(!last)return null;
  const loads=plannedLoads();let ctl=Number(last.ctl),atl=Number(last.atl),day=last.id,unknown=0,form=ctl-atl;
  while(day<date){day=dateShift(day,1);form=ctl-atl;const tss=loads.has(day)?loads.get(day):(unknown++,0);ctl+=(tss-ctl)/42;atl+=(tss-atl)/7;}
  return {ctl,atl,form,unknown,from:last};
}
function renderFutureSignals(){
  const date=selectedHistoryDate,future=date>localToday();if(!$('oFitness'))return;
  const ownLoad=serviceConnected('intervals');
  for(const [id,text,none] of [['oFitness','CTL · odhad','Kondice · jen s Intervals.icu'],['oForm','TSB · odhad na ráno','Forma · jen s Intervals.icu']]){const small=$(id).closest('.card')?.querySelector(':scope>.small');if(!small)continue;if(small.dataset.original==null)small.dataset.original=small.textContent;small.textContent=!ownLoad?none:future?text:small.dataset.original;}
  if(!future)return;
  const p=projectedForm(date),note=p?(p.unknown?'odhad · '+p.unknown+' '+(p.unknown===1?'den':p.unknown<5?'dny':'dní')+' bez plánu počítám jako volno':'odhad podle plánu'):'';
  if(!ownLoad){$('oFitness').innerHTML='—';$('oForm').innerHTML='—';}
  else if(p){$('oFitness').innerHTML=fmt(p.ctl,1)+'<div class="trend">'+esc(note)+'</div>';$('oForm').innerHTML=formText(p.form)+'<div class="trend">'+esc(note)+'</div>';}
  else{$('oFitness').innerHTML='<span class="is-empty">Bez dat z Intervals.icu</span>';$('oForm').innerHTML='<span class="is-empty">Bez dat z Intervals.icu</span>';}
  const weights=(state.weight?.records||[]).filter(r=>measured(r.value_numeric)).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time))),w=weights.at(-1);
  $('oWeight').innerHTML=w?fmt(num(w.value_numeric),1)+' kg':'<span class="is-empty">Bez záznamu</span>';
  if($('oWeightMeta'))$('oWeightMeta').textContent=w?'Poslední záznam '+dateLabel(localDay(w.sample_time))+(Number(state.daily?.nutrition?.targetWeightKg)?' · cíl '+fmt(Number(state.daily.nutrition.targetWeightKg),1)+' kg':''):'';
  $('oSleep').innerHTML='<span class="is-empty">Noc ještě nebyla</span>';
  const nights=primarySleepSessions(state.sleep?.sessions).slice(0,30),avg=nights.length?nights.reduce((s,r)=>s+num(r.durationMin),0)/nights.length:null;
  if($('oSleepMeta'))$('oSleepMeta').textContent='Cíl 8 h'+(avg?' · tvůj průměr '+hm(avg):'');
}
{const previous=load;load=async()=>{await previous();renderFutureSignals();};}
$('gymExerciseDialog').addEventListener('close',()=>setTimeout(()=>{state.gymPick=null;},0));

// ---- Training sub-tabs: one topic at a time instead of a 5000 px page ----
// Sections are grouped by their heading; everything after a heading belongs to it
// until the next heading, so cards injected later land in the right tab.
const TRAINING_TABS=[['load','Zátěž a forma'],['muscles','Svaly a rekordy'],['gym','Posilovna'],['activities','Aktivity']];
// Headings may already be translated, so each group matches both languages.
const TRAINING_TAB_OF=[[/^(Výkonnostní kapacita|Vývoj v čase|Zátěž proti|Performance capacity|Trend over time|Load vs)/,'load'],[/^(Svaly|Muscles)/,'muscles'],[/^(Posilovna|Silový progres|Gym|Strength progress)/,'gym'],[/^(Aktivity|Activities)/,'activities']];
let trainingTab='load';try{trainingTab=localStorage.getItem('lw-training-tab')||'load';}catch{}
function applyTrainingTab(){
  const root=$('training');if(!root)return;let tab=null;
  for(const el of root.children){
    if(el.classList.contains('weekbar')||el.id==='trainingTabs')continue;
    if(el.classList.contains('section')){const t=el.textContent.trim(),hit=TRAINING_TAB_OF.find(([r])=>r.test(t));if(hit)tab=hit[1];}
    const hide=tab!=null&&tab!==trainingTab;if(el.hasAttribute('data-tab-hidden')!==hide)el.toggleAttribute('data-tab-hidden',hide);
  }
  root.querySelectorAll('#trainingTabs [data-training-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.trainingTab===trainingTab)));
}
function setTrainingTab(tab){trainingTab=tab;try{localStorage.setItem('lw-training-tab',tab);}catch{}applyTrainingTab();}
function installTrainingTabs(){
  const root=$('training');if(!root||$('trainingTabs'))return;
  root.querySelector('.weekbar')?.insertAdjacentHTML('afterend','<div id="trainingTabs" class="subtabs" role="tablist" aria-label="Části tréninku">'+TRAINING_TABS.map(([k,l])=>'<button type="button" role="tab" data-training-tab="'+k+'">'+l+'</button>').join('')+'</div>');
  $('trainingTabs').onclick=e=>{const b=e.target.closest('[data-training-tab]');if(b)setTrainingTab(b.dataset.trainingTab);};
  if(typeof MutationObserver!=='undefined')new MutationObserver(applyTrainingTab).observe(root,{childList:true});
  applyTrainingTab();
  // An opened activity detail lives in the Aktivity tab.
  const open=openActivityProfile;openActivityProfile=async function(...args){setTrainingTab('activities');return open.apply(this,args);};
}
installTrainingTabs();
{const week=renderWeekHub;renderWeekHub=async function(...args){const r=await week.apply(this,args);prefetchPlannedDetails();return r;};const day=renderToday;renderToday=function(...args){const r=day.apply(this,args);prefetchPlannedDetails();return r;};}

// Decimal separator of the app language in rendered numbers. Czech: "82.4 kg" → "82,4 kg", "+16.2" →
// "+16,2", chart labels included. Dates ("05.10."), versions ("1.2.3"),
// times and form fields stay as they are; [data-raw] opts out.
const DECIMAL_DOT=/(^|[^\p{L}\d.:/+−-])([+−-]?\d+)\.(\d+)(?![.\d:/])/gu;
// In English the other way round: "82,4 kg" written by Czech formatting → "82.4 kg".
const DECIMAL_COMMA=/(^|[^\p{L}\d,])([+−-]?\d+),(\d+)(?![,\d])/gu;
function czechDecimals(root){
  if(!root||typeof document==='undefined')return;
  const en=document.documentElement.lang==='en',test=en?/\d,\d/:/\d\.\d/,pattern=en?DECIMAL_COMMA:DECIMAL_DOT,mark=en?'$1$2.$3':'$1$2,$3';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('script,style,textarea,code,pre,[data-raw]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  let node;while((node=walker.nextNode())){const t=node.textContent;if(test.test(t)){const next=t.replace(pattern,mark);if(next!==t)node.textContent=next;}}
}
// ---- One icon set: UI emoji become the line icons from icons.js (served as window.LW_ICONS) ----
// Food and weather pictures stay emoji: they illustrate content, not controls.
const EMOJI_ICON={'🚴':'bike','🏃':'run','🚶':'walk','🏋':'gym','🍽':'meal','💧':'drop','⚖':'scale','💬':'chat','✦':'spark','✨':'spark','📷':'camera','📍':'pin','📚':'book','📖':'book','🕒':'clock','⏱':'clock','⏳':'clock','🔎':'search','🔍':'search','✎':'edit','✏':'edit','🗑':'trash','🌙':'moon','▶':'play','⚙':'sliders','⚠':'alert','▥':'barcode','🏠':'home','⛰':'mountain','🌳':'mountain','🏁':'flag','⚡':'bolt','🔁':'repeat','✅':'check'};
const ICON_RE=new RegExp('('+Object.keys(EMOJI_ICON).join('|')+')\\uFE0F?','u'),ICON_SKIP='option,select,textarea,input,script,style,title,svg,[contenteditable]';
function svgIcon(name){const paths=(typeof window!=='undefined'&&window.LW_ICONS||{})[name];if(!paths)return null;const t=document.createElement('template');t.innerHTML='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+paths+'</svg>';return t.content.firstChild;}
function swapIcons(root){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>ICON_RE.test(n.nodeValue)&&!n.parentElement?.closest(ICON_SKIP)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  const nodes=[];let n;while((n=walker.nextNode()))nodes.push(n);
  for(const node of nodes){
    const frag=document.createDocumentFragment();let rest=node.nodeValue,m,swapped=false;
    while((m=rest.match(ICON_RE))){const svg=svgIcon(EMOJI_ICON[m[1]]);if(!svg)break;if(m.index)frag.append(rest.slice(0,m.index));frag.append(svg);swapped=true;rest=rest.slice(m.index+m[0].length).replace(/^ /,' ');}
    if(!swapped)continue;if(rest)frag.append(rest);node.replaceWith(frag);
  }
}
if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'&&document.body){
  let queued=false;const run=()=>{queued=false;swapIcons(document.body);};
  new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(run);}}).observe(document.body,{childList:true,subtree:true,characterData:true});
  swapIcons(document.body);
}
if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'&&document.querySelector('.shell')){
  let queued=false;const shell=document.querySelector('.shell'),run=()=>{queued=false;czechDecimals(shell);};
  new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(run);}}).observe(shell,{childList:true,subtree:true});
  czechDecimals(shell);
}

// Account setup is saved on the server, independently of provider consent.
let accountSetup=null;
async function showAccountSetup({edit=false}={}){
  if($('loginGate')||$('onboardingGate')||$('consentGate'))return;
  await jsonFetch('/app/api/profile').catch(()=>{});
  let setup=await jsonFetch('/app/api/onboarding');accountSetup=setup;
  let providers=(await jsonFetch('/app/api/connections').catch(()=>({providers:[]}))).providers||[];
  const draft={profile:{...setup.profile,mainSport:setup.savedProfile?.mainSport||'general'},weightKg:setup.weightKg||'',training:{experience:setup.training.experienceMode==='manual'?setup.training.experience:'auto',limitations:setup.training.limitations||''}};
  if(!draft.profile.sportHours&&setup.history.automaticSportAvailable)draft.profile.sportHours='auto';
  if(!draft.profile.goal)draft.profile.goal='maintain';
  let step=edit?1:0,refreshing=false,askConsent=Boolean(accountConsent?.needed)&&!edit;
  const experienceNames={beginner:'začátečník',regular:'pravidelně sportující',experienced:'vysoká pravidelnost tréninku'};
  document.body.insertAdjacentHTML('beforeend','<div id="onboardingGate" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle" style="'+gateStyle+'"><div class="card" style="width:min(620px,100%);display:grid;gap:14px" id="setupBody"></div></div>');
  const field=(id,label,value,type='text',attrs='')=>'<label>'+label+'<input class="food-input" id="'+id+'" type="'+type+'" value="'+esc(value??'')+'" '+attrs+'></label>';
  const select=(id,label,value,options,empty='Zatím nevyplněno')=>'<label>'+label+'<select class="food-input" id="'+id+'"><option value="">'+esc(empty)+'</option>'+options.map(([v,l])=>'<option value="'+v+'"'+(value===v?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>';
  const remember=()=>{
    if(step===1){const age=draft.profile.age;for(const key of ['sex','age','height','activity','sportHours','goal'])draft.profile[key]=$('setup-'+key).value;if(Number(age)!==Number(draft.profile.age))draft.profile.birthDate='';draft.weightKg=$('setup-weight').value;}
    if(step===2){draft.profile.mainSport=$('setup-mainSport').value;draft.profile.sportGoal=$('setup-sportGoal').value;draft.training.experience=$('setup-experience').value||'auto';draft.training.limitations=$('setup-limitations').value;}
  };
  const refresh=async()=>{
    if(refreshing||!$('onboardingGate'))return;refreshing=true;
    try{remember();const before=JSON.stringify({history:setup.history,profile:draft.profile,weight:draft.weightKg}),fresh=await jsonFetch('/app/api/onboarding');if(!$('onboardingGate'))return;setup=fresh;for(const [key,value] of Object.entries(fresh.profile||{}))if(key!=='mainSport'&&(draft.profile[key]==null||draft.profile[key]===''))draft.profile[key]=value;
      draft.weightKg=draft.weightKg||fresh.weightKg||'';if(!draft.profile.sportHours&&fresh.history.automaticSportAvailable)draft.profile.sportHours='auto';if(before!==JSON.stringify({history:setup.history,profile:draft.profile,weight:draft.weightKg}))render();
    }catch(error){$('setupError')&&($('setupError').textContent=error.message);}finally{refreshing=false;}
  };
  const finish=async()=>{
    remember();const b=$('setupFinish');if(b)b.disabled=true;
    try{
      const body={...draft,profile:{...draft.profile}};
      // Untouched provider suggestions stay automatic; only edited values become overrides.
      for(const key of ['height','activity','rhr','hrmax','birthDate'])if(!setup.savedProfile?.[key]&&String(body.profile[key]??'')===String(setup.profile[key]??''))body.profile[key]='';
      if(!setup.savedProfile?.age&&setup.suggestions?.birthDate&&Number(body.profile.age)===Number(setup.profile.age))body.profile.age='';
      if(Number(body.weightKg)===Number(setup.weightKg)&&setup.weightKg)delete body.weightKg;
      const r=await jsonFetch('/app/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});localStorage.setItem('fitnessProfile',JSON.stringify({...r.profile,mainSport:r.savedProfile?.mainSport||'general'}));$('onboardingGate').remove();if(location.hash==='#setup')history.replaceState(null,'',location.pathname+location.search);accountSetup=r;toast(r.baseline.ready?'Profil je uložený. Kalorický základ je vypočítaný.':'Nastavení je uložené. Údaje pro kalorie můžeš doplnit později.');await load();pollAccountImport();}
    catch(error){$('setupError')&&($('setupError').textContent=error.message);if(b)b.disabled=false;}
  };
  const render=()=>{
    const h=setup.history;
    // A new account starts with the consent to health data (consent.js).
    if(askConsent){
      $('setupBody').innerHTML=uiText('<div class="eyebrow">Nastavení účtu · souhlas</div><h2 id="onboardingTitle">Tvoje data o zdraví</h2>','<div class="eyebrow">Account setup · consent</div><h2 id="onboardingTitle">Your health data</h2>')+'<p>'+uiText('Loadwise pracuje s údaji o tvém zdraví. Podle GDPR k tomu potřebujeme tvůj výslovný souhlas.','Loadwise works with data about your health. Under the GDPR it needs your explicit consent for that.')+'</p>'+consentFieldsHtml(accountConsent)+'<p class="small" id="setupError" role="alert"></p><div class="consent-buttons"><button class="btn" id="setupLogout" type="button">'+uiText('Nesouhlasím a odhlásit','Decline and sign out')+'</button><button class="btn primary" id="consentSubmit" type="button" disabled>'+uiText('Pokračovat','Continue')+'</button></div>';
      $('setupLogout').onclick=logout;$('consentHealth').onchange=e=>{$('consentSubmit').disabled=!e.target.checked;};
      $('consentSubmit').onclick=async()=>{$('consentSubmit').disabled=true;try{await submitConsent();askConsent=false;if(setup.baseline.ready)return finish();render();}catch(error){$('setupError').textContent=error.message;$('consentSubmit').disabled=false;}};
      return;
    }
    let html=uiText('<div class="eyebrow">Nastavení účtu · krok ', '<div class="eyebrow">Account setup · step ')+(step+1)+uiText(' ze 3</div><h2 id="onboardingTitle">', ' of 3</div><h2 id="onboardingTitle">')+['Zdroje dat','Profil a kalorie · volitelné','Tvůj trénink · volitelné'][step]+'</h2>';
    if(step===0){
      // The same service cards as Settings → Propojení; the provider's page returns here.
      html+='<p>Přihlášení přes Google založí účet. Přístup ke Google Health povoluješ zvlášť a je dobrovolný. Aplikace funguje i s ručními záznamy.</p><div class="service-list">'+providers.map(p=>serviceCardHtml(p,'setup')).join('')+'</div><p class="small" id="setupSync" aria-live="polite"></p><button class="btn primary" id="setupNext">'+(setup.baseline.ready?'Otevřít aplikaci':'Pokračovat')+'</button>';
    }else if(step===1){
      html+='<p>Tento krok můžeš přeskočit. Známé údaje předvyplníme z propojených služeb. Kalorický cíl zobrazíme, až budeme znát potřebné údaje; bez nich můžeš používat ostatní funkce.</p><form id="setupProfile"><div class="food-editor-grid">'+select('setup-sex','Pohlaví pro výpočet metabolismu',draft.profile.sex,[['male','Muž'],['female','Žena']])+field('setup-age','Věk',draft.profile.age,'number','min="18" max="100"')+field('setup-height','Výška · cm',draft.profile.height,'number','min="100" max="230"')+field('setup-weight','Hmotnost · kg',draft.weightKg,'number','min="35" max="250" step="0.1"')+select('setup-activity','Běžný pohyb mimo sport',draft.profile.activity,[['sedentary','Sedavá práce, málo chůze'],['light','Hodně chůze nebo práce vestoje'],['active','Většinu dne v pohybu'],['heavy','Fyzicky náročná práce']])+select('setup-sportHours','Sport za týden · nepovinný odhad',draft.profile.sportHours,[...(h.automaticSportAvailable?[['auto',uiText('Automaticky z historie · ', 'Automatic from history · ')+fmt(h.weeklyHours,1)+uiText(' h týdně', ' h a week')]]:[]),['0','Žádný'],['1-3','1–3 hodiny'],['3-6','3–6 hodin'],['6-10','6–10 hodin'],['10+','Více než 10 hodin']],h.automaticSportAvailable?'Bez ručního odhadu':'Zatím bez odhadu')+select('setup-goal','Cíl hmotnosti · volitelné',draft.profile.goal,[['maintain','Udržovat váhu'],['lose_0.25','Hubnout 0,25 kg týdně'],['lose_0.5','Hubnout 0,5 kg týdně'],['lose_0.75','Hubnout 0,75 kg týdně'],['lose_1','Hubnout 1 kg týdně']])+'</div><p class="small" id="setupHistoryNote">'+(h.automaticSportAvailable?'Sport vychází z dokončených aktivit za poslední 4 týdny. Záznamy z více služeb započítáme jednou.':'Automaticky nabídneme po načtení historie s délkou aktivit. Propojení samotné nestačí; odhad není povinný.')+'</p><button class="btn" type="button" id="setupRefresh">Aktualizovat údaje z historie</button><button class="btn primary" type="submit">Pokračovat</button><button class="btn" id="setupSkipProfile" type="button">Přeskočit a otevřít aplikaci</button><button class="btn" id="setupEditTraining" type="button">Upravit tréninkové zaměření</button></form>';
    }else{
      html+='<form id="setupTraining"><div class="food-editor-grid">'+select('setup-mainSport','Hlavní sport',draft.profile.mainSport,[['cycling','Cyklistika'],['running','Běh'],['triathlon','Triatlon'],['strength','Síla'],['general','Všeobecná kondice']],'Všeobecná kondice (výchozí)')+field('setup-sportGoal','Čeho chceš dosáhnout · volitelné',draft.profile.sportGoal,'text','maxlength="300" placeholder="Může zůstat prázdné"')+select('setup-experience','Tréninková zkušenost',draft.training.experience,[['auto','Automaticky: '+experienceNames[h.experience]],['beginner','Začínám'],['regular','Sportuji pravidelně'],['experienced','Jsem zkušený/á']],'Automaticky')+field('setup-limitations','Omezení nebo poznámka pro trenéra · volitelné',draft.training.limitations,'text','maxlength="500"')+'</div><p class="small">Výchozí zaměření je všeobecná kondice. Sport a cíl jsou volitelné a doporučení zpřesní. Zkušenost odhadujeme podle pravidelnosti za 12 týdnů; bez historie začínáme opatrně jako u začátečníka.</p><p>Časové možnosti nastavíš v Plánu. Do té doby použijeme dostupnou historii, případně opatrný výchozí rozvrh. Pro silový trénink bez nastavení místa nabízíme cviky s vlastní vahou.</p><p class="small">Při nemoci nebo zranění nastav příslušný stav v aplikaci.</p><button class="btn primary" id="setupFinish" type="submit">Otevřít aplikaci</button></form>';
    }
    html+='<p class="small" id="setupError" role="alert"></p>'+(step?'<button class="btn" id="setupBack" type="button">Zpět</button>':'')+'<button class="btn" id="setupLogout" type="button">Odhlásit</button>';
    $('setupBody').innerHTML=html;$('setupLogout').onclick=logout;
    if(step===0){
      $('setupNext').onclick=async()=>{await refresh();if(!edit&&setup.baseline.ready)return finish();step=1;render();};
      wireIntervalsKey($('setupBody'),async()=>{providers=(await jsonFetch('/app/api/connections')).providers;await refresh();});
      jsonFetch('/app/api/sync').then(s=>{if($('setupSync'))$('setupSync').textContent=s.status==='running'?'Načítáme historii na pozadí. Můžeš pokračovat.':s.status==='partial'||s.status==='error'?'Část historie se nepodařilo načíst. Import můžeš zopakovat v Nastavení.':'';}).catch(()=>{});
    }
    if(step===1){$('setupProfile').onsubmit=e=>{e.preventDefault();remember();if(!edit)return finish();step=2;render();};$('setupSkipProfile').onclick=finish;$('setupEditTraining').onclick=()=>{remember();step=2;render();};$('setupRefresh').onclick=refresh;}
    if(step===2)$('setupTraining').onsubmit=e=>{e.preventDefault();finish();};
    if(step)$('setupBack').onclick=()=>{remember();step--;render();};
  };
  render();
  if(!edit&&!askConsent&&setup.baseline.ready)return finish();
  if(setup.connectedProviders.length){
    jsonFetch('/app/api/sync',{method:'POST'}).catch(()=>{});
    (async()=>{for(let i=0;i<60&&$('onboardingGate');i++){await new Promise(resolve=>setTimeout(resolve,5000));if(!$('onboardingGate'))return;await refresh();const sync=await jsonFetch('/app/api/sync').catch(()=>({status:'error'}));if(sync.status!=='running')return;}})();
  }
}
function accountImportMessage(s){
  let message=s.status==='running'?'Načítáme historii. Výpočty se zpřesní podle dostupných dat.':s.status==='partial'||s.status==='error'?'Část importu se nepodařila. Dostupná data zůstávají uložená. Zkus Obnovit u příslušné služby v Propojení.':s.status==='done'?'Historie je načtená. Doporučení používají dostupná data.':'Bez propojení používáme tvůj profil a ruční záznamy.';
  if(s.status==='partial'||s.status==='error'){
    const names={activities:uiText('aktivity','activities'),planned:uiText('kalendář','calendar'),weight:uiText('váha','weight')},failed=[];
    for(const r of s.results||[])for(const [key,part] of Object.entries(r.parts||{}))if(part?.status==='error')failed.push((r.source==='intervals'?'Intervals.icu · ':'')+(names[key]||key)+(part.message?' ('+part.message+')':''));
    if(failed.length)message+=' '+[...new Set(failed)].join(' · ');
  }
  return message;
}
function renderAccountImportStatus(s){
  const settings=$('settings');if(!settings)return;
  if(!$('importStatus'))settings.insertAdjacentHTML('afterbegin','<p class="notice" id="importStatus" aria-live="polite"></p>');
  $('importStatus').textContent=accountImportMessage(s);
}
let intervalsRefreshing=false;
async function refreshIntervals(){
  if(intervalsRefreshing)return;
  intervalsRefreshing=true;
  const buttons=[...document.querySelectorAll('[data-intervals-refresh]')];
  const show=message=>document.querySelectorAll('[data-provider="intervals"] [data-provider-sync-status]').forEach(el=>el.textContent=message);
  buttons.forEach(b=>{b.disabled=true;b.textContent=uiText('Načítám…','Loading…');});
  show(uiText('Načítáme historii z Intervals.icu…','Loading history from Intervals.icu…'));
  try{
    let current=await jsonFetch('/app/api/connections/intervals/sync',{method:'POST'});
    renderAccountImportStatus({status:'running'});
    for(let i=0;i<30&&current.status==='running';i++){
      await new Promise(resolve=>setTimeout(resolve,2000));
      current=await jsonFetch('/app/api/connections/intervals/sync');
    }
    show(current.status==='running'?uiText('Import pokračuje na pozadí.','The import continues in the background.'):current.status==='done'?uiText('Intervals.icu je obnovené. Dostupná data jsou načtená.','Intervals.icu is refreshed. Available data is loaded.'):accountImportMessage(current));
    renderAccountImportStatus(await jsonFetch('/app/api/sync'));
    markDataChanged('');await load();
    if(current.status==='running')pollAccountImport();
  }catch(error){show(uiText('Obnova se nepodařila: ','Refresh failed: ')+error.message);}
  finally{intervalsRefreshing=false;buttons.forEach(b=>{b.disabled=false;b.textContent=uiText('Obnovit','Refresh');});}
}
document.addEventListener('click',e=>{if(e.target.closest('[data-intervals-refresh]')){e.preventDefault();refreshIntervals();}});
async function pollAccountImport(){
  if(!$('settings'))return;
  for(let i=0;i<60;i++){
    const s=await jsonFetch('/app/api/sync').catch(()=>({status:'error'}));
    renderAccountImportStatus(s);
    if(s.status!=='running'){if(['done','partial','error'].includes(s.status)){markDataChanged('');await load();}return;}await new Promise(resolve=>setTimeout(resolve,5000));
  }
}
async function showSubscription(){
  openSheet('Předplatné','<p>Načítám přehled…</p>');
  try{const s=await jsonFetch('/app/api/subscription');$('sheetBody').innerHTML='<p class="notice">'+(s.mode==='pilot'?'Pilot pro pozvané · všechny dostupné funkce máš zdarma':s.aiAccess?'Tvůj tarif: AI':'Tvůj tarif: Free')+'</p><div style="overflow:auto">'+aiPlansHtml(s)+'</div><h3>Podmínky</h3><p>'+esc(s.terms)+'</p><p class="small">Cena a limity AI tarifu zatím nejsou stanovené. Objednávky ani platby nejsou spuštěné. Dostupnost AI vyžaduje funkční připojení služby; při jejím výpadku zůstává základ aplikace použitelný.</p>';}
  catch(error){$('sheetBody').textContent=error.message;}
}
function installSubscription(){if($('subscriptionCard')||!$('settings'))return;settingsBody('account').insertAdjacentHTML('beforeend','<article class="card" id="subscriptionCard" style="margin-top:12px"><h3>Předplatné</h3><p>V pilotu pro pozvané jsou dostupné AI funkce zdarma.</p><button class="btn" id="subscriptionDetails">Free a AI · funkce a podmínky</button></article>');$('subscriptionDetails').onclick=showSubscription;}

async function openOwnFoodLibrary(){
  openSheet('Moje potraviny','<p>Načítám…</p>');
  try{const {products}=await jsonFetch('/app/api/food/personal');$('sheetBody').innerHTML='<input class="food-input" id="ownFoodFilter" type="search" placeholder="Hledat v mých potravinách"><p class="small">Úprava mění uloženou potravinu, nikoli dříve zapsaná jídla. Osobní poznámky a jídelníček se nesdílejí.</p><div id="ownFoodRows"></div>';
    const render=()=>{$('ownFoodRows').innerHTML=products.map((p,i)=>({p,i})).filter(({p})=>foodTextKey(p.name+' '+(p.brand||'')).includes(foodTextKey($('ownFoodFilter').value))).map(({p,i})=>'<article class="notice"><strong>'+esc(p.name)+'</strong><p>'+fmt(p.calories_100g)+' kcal / '+(p.nutrition_basis==='portion'?'porce':'100 '+esc(p.nutrition_basis))+'</p><button class="btn" data-use-food="'+i+'">Zapsat</button><button class="btn" data-edit-food="'+i+'">Upravit</button><button class="btn" data-remove-food="'+i+'">Smazat</button></article>').join('')||'<p>Žádné uložené potraviny.</p>';
      $('ownFoodRows').querySelectorAll('[data-use-food]').forEach(b=>b.onclick=()=>{const p=products[Number(b.dataset.useFood)];closeSheet();openFoodLogger();selectFoodProduct(p);});
      $('ownFoodRows').querySelectorAll('[data-edit-food]').forEach(b=>b.onclick=()=>editOwnFood(products[Number(b.dataset.editFood)]));
      $('ownFoodRows').querySelectorAll('[data-remove-food]').forEach(b=>b.onclick=()=>{const p=products[Number(b.dataset.removeFood)];openSheet('Smazat potravinu',uiText('<p>Smazat ', '<p>Delete ')+esc(p.name)+uiText(' z tvé knihovny? Záznamy v jídelníčku zůstanou zachované.</p><button class="btn" id="confirmFoodDelete">Smazat</button><button class="btn" id="cancelFoodDelete">Zpět</button>', ' from your library? Your food log entries stay as they are.</p><button class="btn" id="confirmFoodDelete">Delete</button><button class="btn" id="cancelFoodDelete">Back</button>'));$('cancelFoodDelete').onclick=openOwnFoodLibrary;$('confirmFoodDelete').onclick=async()=>{try{await jsonFetch('/app/api/food/personal',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id})});await openOwnFoodLibrary();}catch(error){toast(error.message);}};});
    };$('ownFoodFilter').oninput=render;render();
  }catch(error){$('sheetBody').textContent=error.message;}
}
const foodTextKey=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function editOwnFood(p){
  const fields=[['name','Název','text'],['brand','Značka','text'],['barcode','Čárový kód','text'],['quantity','Velikost balení','text'],['serving_size','Velikost porce (např. 150 g)','text'],['calories_100g','kcal','number'],['protein_100g','Bílkoviny · g','number'],['carbs_100g','Sacharidy · g','number'],['fat_100g','Tuky · g','number']];
  openSheet('Upravit potravinu','<form id="ownFoodEdit"><p>Hodnoty pro '+(p.nutrition_basis==='portion'?'jednu porci':'100 '+esc(p.nutrition_basis))+'.</p><div class="food-editor-grid">'+fields.map(([k,l,t])=>'<label>'+l+'<input class="food-input" id="own-'+k+'" type="'+t+'" '+(t==='number'?'min="0" step="any" required':'maxlength="180"')+' value="'+esc(p[k]??'')+'"></label>').join('')+'</div><button class="btn primary" type="submit">Uložit změny</button><button class="btn" id="ownFoodCancel" type="button">Zpět</button><p id="ownFoodError" role="alert"></p></form>');$('ownFoodCancel').onclick=openOwnFoodLibrary;
  $('ownFoodEdit').onsubmit=async e=>{e.preventDefault();try{const body={...p};for(const [k,,t]of fields)body[k]=t==='number'?Number($('own-'+k).value):$('own-'+k).value;await jsonFetch('/app/api/food/personal',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await openOwnFoodLibrary();}catch(error){$('ownFoodError').textContent=error.message;}};
}
async function openOwnRecipes(){
  openSheet('Moje jídla','<p>Načítám…</p>');
  try{const {recipes}=await jsonFetch('/app/api/food/recipes');$('sheetBody').innerHTML='<p>Vlastní recepty se surovinami a porcemi. Sdílení do katalogu si volíš při uložení.</p><button class="btn primary" id="newOwnRecipe">Přidat jídlo</button>'+recipes.map((r,i)=>'<article class="notice"><strong>'+esc(r.name)+'</strong><p>'+fmt(r.portion.calories_100g)+uiText(' kcal / porce · ', ' kcal / serving · ')+r.servings+uiText(' porcí</p><button class="btn" data-log-recipe="', ' servings</p><button class="btn" data-log-recipe="')+i+'">Zapsat porci</button><button class="btn" data-edit-recipe="'+i+'">Upravit</button><button class="btn" data-delete-recipe="'+i+'">Smazat</button></article>').join('');$('newOwnRecipe').onclick=()=>editOwnRecipe();
    $('sheetBody').querySelectorAll('[data-log-recipe]').forEach(b=>b.onclick=()=>{const r=recipes[Number(b.dataset.logRecipe)];closeSheet();openFoodLogger();selectFoodProduct(r.portion);});
    $('sheetBody').querySelectorAll('[data-edit-recipe]').forEach(b=>b.onclick=()=>editOwnRecipe(recipes[Number(b.dataset.editRecipe)]));
    $('sheetBody').querySelectorAll('[data-delete-recipe]').forEach(b=>b.onclick=()=>{const r=recipes[Number(b.dataset.deleteRecipe)];openSheet('Smazat jídlo',uiText('<p>Smazat ', '<p>Delete ')+esc(r.name)+uiText(' z knihovny? Historie jídelníčku zůstane zachovaná.</p><button class="btn" id="confirmRecipeDelete">Smazat</button><button class="btn" id="cancelRecipeDelete">Zpět</button>', ' from the library? Your food log history stays as it is.</p><button class="btn" id="confirmRecipeDelete">Delete</button><button class="btn" id="cancelRecipeDelete">Back</button>'));$('cancelRecipeDelete').onclick=openOwnRecipes;$('confirmRecipeDelete').onclick=async()=>{try{await jsonFetch('/app/api/food/recipes',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id})});await openOwnRecipes();}catch(error){toast(error.message);}};});
  }catch(error){$('sheetBody').textContent=error.message;}
}
function editOwnRecipe(recipe={}){
  let ingredients=(recipe.ingredients||[{name:'',quantity:100,unit:'g',calories:0,protein_g:0,carbs_g:0,fat_g:0}]).map(i=>({...i}));
  openSheet(recipe.id?'Upravit jídlo':'Nové jídlo','<form id="recipeEditor"><label>Název<input class="food-input" id="ownRecipeName" required maxlength="180" value="'+esc(recipe.name||'')+'"></label><label>Počet porcí<input class="food-input" id="ownRecipeServings" type="number" min="0.1" max="100" step="0.1" required value="'+(recipe.servings||1)+'"></label><p>U každé suroviny zadej hodnoty pro použité množství. Kalorie a makra jedné porce spočítáme ze součtu.</p><div id="recipeIngredients"></div><button class="btn" id="addRecipeIngredient" type="button">Přidat surovinu</button><label><input id="shareOwnRecipe" type="checkbox" '+(recipe.shared?'checked':'')+'> Sdílet název, suroviny a výživové hodnoty do společného vyhledávání. Účet a jídelníček zůstávají soukromé.</label><button class="btn primary" type="submit">Uložit jídlo</button><button class="btn" id="cancelRecipeEdit" type="button">Zpět</button><p id="recipeEditError" role="alert"></p></form>');
  const remember=()=>{$('recipeIngredients').querySelectorAll('[data-ingredient]').forEach(el=>{const i=Number(el.dataset.ingredient);el.querySelectorAll('[data-recipe-field]').forEach(input=>{const k=input.dataset.recipeField;ingredients[i][k]=['name','unit'].includes(k)?input.value:Number(input.value);});});};
  const render=()=>{$('recipeIngredients').innerHTML=ingredients.map((i,n)=>'<fieldset data-ingredient="'+n+'"><legend>Surovina '+(n+1)+'</legend><div class="food-editor-grid">'+[['name','Název','text'],['quantity','Množství','number'],['calories','kcal','number'],['protein_g','Bílkoviny · g','number'],['carbs_g','Sacharidy · g','number'],['fat_g','Tuky · g','number']].map(([k,l,t])=>'<label>'+l+'<input class="food-input" data-recipe-field="'+k+'" type="'+t+'" required '+(t==='number'?'min="0" step="any"':'maxlength="180"')+' value="'+esc(i[k]??'')+'"></label>').join('')+'<label>Jednotka<select class="food-input" data-recipe-field="unit">'+[['g','g'],['ml','ml'],['piece','kus']].map(([v,l])=>'<option value="'+v+'" '+(i.unit===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label></div><button class="btn" data-remove-ingredient="'+n+'" type="button">Odebrat surovinu</button></fieldset>').join('');$('recipeIngredients').querySelectorAll('[data-remove-ingredient]').forEach(b=>b.onclick=()=>{remember();ingredients.splice(Number(b.dataset.removeIngredient),1);render();});};render();
  $('addRecipeIngredient').onclick=()=>{remember();ingredients.push({name:'',quantity:100,unit:'g',calories:0,protein_g:0,carbs_g:0,fat_g:0});render();};$('cancelRecipeEdit').onclick=openOwnRecipes;
  $('recipeEditor').onsubmit=async e=>{e.preventDefault();remember();try{await jsonFetch('/app/api/food/recipes',{method:recipe.id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:recipe.id,name:$('ownRecipeName').value,servings:Number($('ownRecipeServings').value),ingredients,shared:$('shareOwnRecipe').checked})});await openOwnRecipes();}catch(error){$('recipeEditError').textContent=error.message;}};
}
if($('myFoodLibrary')){$('myFoodLibrary').onclick=openOwnFoodLibrary;$('myFoodLibrary').insertAdjacentHTML('afterend','<button class="btn" id="myRecipeLibrary" type="button">Moje jídla</button>');$('myRecipeLibrary').onclick=openOwnRecipes;}
installSubscription();
const selectWithCatalogueNotice=selectFoodProduct;
selectFoodProduct=function(p){selectWithCatalogueNotice(p);$('catalogueQualityNotice')?.remove();if(p.catalog_id){$('foodEditor').insertAdjacentHTML('beforeend','<div class="notice" id="catalogueQualityNotice"><p>'+(p.reports?'U této položky byla nahlášena nesrovnalost. Ověř hodnoty podle etikety.':'Komunitní hodnoty zadané uživateli; nejsou automaticky ověřené.')+'</p><button class="btn" id="reportCatalogueFood" type="button">Nahlásit nesprávné údaje</button></div>');$('reportCatalogueFood').onclick=()=>{openSheet('Nahlásit potravinu','<form id="foodReportForm"><label>Co nesedí?<textarea class="food-input" id="foodReportReason" required maxlength="500"></textarea></label><button class="btn" type="submit">Odeslat hlášení</button><p id="foodReportResult" role="status"></p></form>');$('foodReportForm').onsubmit=async e=>{e.preventDefault();try{await jsonFetch('/app/api/food/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({catalogId:p.catalog_id,reason:$('foodReportReason').value})});$('foodReportResult').textContent='Hlášení je uložené. Ostatním zobrazíme upozornění.';e.target.querySelector('button').disabled=true;}catch(error){$('foodReportResult').textContent=error.message;}};};}};
function openManualWorkout(){
 const requestId=crypto.randomUUID();
 openSheet('Vlastní trénink','<form id="manualWorkoutForm"><div class="food-editor-grid"><label>Název<input class="food-input" name="name" required maxlength="180"></label><label>Sport<select class="food-input" name="sport"><option value="ride">Kolo</option><option value="run">Běh</option><option value="gym">Síla</option></select></label><label>Datum<input class="food-input" name="date" type="date" value="'+localToday()+'" required></label><label>Délka · min<input class="food-input" name="minutes" type="number" min="1" max="1440" required></label><label>Poznámka<input class="food-input" name="notes" maxlength="1000"></label></div><label><input type="checkbox" name="completed"> Trénink už je dokončený (zapsat do historie)</label><button class="btn primary" type="submit">Uložit do aplikace</button><p class="small">Plán se může odeslat do propojených Intervals.icu. Ruční záznam dokončení zůstává v aplikaci.</p><p id="manualWorkoutError" role="alert"></p></form>');
 $('manualWorkoutForm').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;try{const body=Object.fromEntries(new FormData(f));body.completed=f.elements.completed.checked;body.requestId=requestId;const r=await jsonFetch('/app/api/workouts/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});closeSheet();toast(r.sync?.status==='error'?'Trénink je uložený. Export zkus později.':'Trénink je uložený v aplikaci.');await load();}catch(error){$('manualWorkoutError').textContent=error.message;b.disabled=false;}};
}
if($('workouts')){const sw=$('workouts').querySelector('.section-hero .sport-switch');(sw||$('workouts')).insertAdjacentHTML(sw?'afterend':'afterbegin','<button class="btn" id="addManualWorkout" type="button">Přidat vlastní trénink</button>');$('addManualWorkout').onclick=openManualWorkout;}
// My foods and meals are part of adding food: a row under the quick actions.
if($('foodEntry')&&$('myFoodLibrary')){
 const style=document.createElement('style');style.textContent='#foodEntry .food-library-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}#foodEntry .food-library-row .btn{margin:0}';document.head.append(style);
 const row=document.createElement('div');row.className='food-library-row';row.id='ownFoodLibraryButtons';row.append($('myFoodLibrary'),$('myRecipeLibrary'));
 ($('foodEntry').querySelector('.food-actions')||$('foodEntry').querySelector('.food-controls')).after(row);
}

// My equipment: what the athlete's gym or home has. Generated workouts, the
// exercise picker and replacements use only exercises it allows. The tick
// list works without AI; AI can read a gym's website or a list into ticks,
// which the athlete then checks before saving. Until it is ticked once, the
// app asks before the first generated workout.
let gymEquipment=null;
async function loadGymEquipment(){return gymEquipment||(gymEquipment=await jsonFetch('/app/api/gym/equipment'));}
async function withGymEquipment(run){
  try{const e=await loadGymEquipment();if(!e.equipmentChosen)return showGymEquipment(run);}catch{/* the server keeps the last setting */}
  return run();
}
async function showGymEquipment(then=null){
  let data;try{data=await loadGymEquipment();}catch(error){toast(error.message);return;}
  const picked=new Set(data.stations||[]);let changed=new Set();
  const presetButtons=[['bodyweight',uiText('Doma bez nářadí','Home, no equipment')],['dumbbells',uiText('Doma s jednoručkami','Home with dumbbells')],['gym',uiText('Celá posilovna','Full gym')]];
  const allowed=()=>Object.values(data.exercises||{}).filter(ids=>ids.every(id=>picked.has(id))).length;
  const intro=then?uiText('Než sestavím trénink, zaškrtni vybavení, které máš. Podle něj vybírám cviky.','Before I build the workout, tick the equipment you have. I pick the exercises from it.'):uiText('Zaškrtni, co máš k dispozici. Generované tréninky, výběr cviků i náhrady použijí jen tohle vybavení.','Tick what you have. Generated workouts, the exercise picker and replacements use only this equipment.');
  openSheet(uiText('Moje vybavení','My equipment'),'<form id="gymEquipmentForm" class="equip-form"><p>'+esc(intro)+'</p>'
    +'<div class="equip-presets" role="group" aria-label="'+esc(uiText('Rychlá volba','Quick choice'))+'">'+presetButtons.map(([id,label])=>'<button type="button" class="btn" data-preset="'+id+'">'+esc(label)+'</button>').join('')+'</div>'
    +'<details class="equip-ai"><summary>'+esc(uiText('Načíst vybavení posilovny přes AI','Read your gym\'s equipment with AI'))+'</summary><p class="small">'+esc(uiText('Vlož odkaz na web posilovny nebo napiš, co tam mají. AI zaškrtne, co najde, a ty to pak zkontroluješ a uložíš.','Paste a link to the gym\'s website or write what it has. AI ticks what it finds; you check it and save.'))+'</p>'
    +'<textarea class="food-input" id="equipAiText" rows="3" maxlength="4000" placeholder="'+esc(uiText('https://… nebo např. leg press, kladky, jednoručky do 30 kg, benchpress','https://… or e.g. leg press, cables, dumbbells up to 30 kg, bench press'))+'"></textarea>'
    +'<button type="button" class="btn" id="equipAiRun">'+esc(uiText('Načíst','Read'))+'</button><div id="equipAiResult" class="small" role="status"></div></details>'
    +(data.zones||[]).map(z=>'<fieldset class="equip-zone"><legend>'+esc(z.label)+'</legend><div class="equip-grid">'+z.items.map(item=>'<label class="equip-item" data-station="'+esc(item.id)+'"><input type="checkbox" value="'+esc(item.id)+'"> <span>'+esc(item.label)+'</span></label>').join('')+'</div></fieldset>').join('')
    +'<p class="small" id="equipCount" role="status"></p><p class="small">'+esc(uiText('Změna se použije při příštím generování. Uložené tréninky zůstávají stejné.','The change applies the next time a workout is generated. Saved workouts stay the same.'))+'</p>'
    +'<button class="btn primary" type="submit" id="equipSave">'+esc(then?uiText('Uložit a sestavit trénink','Save and build the workout'):uiText('Uložit','Save'))+'</button></form>',body=>{
    const sync=()=>{
      body.querySelectorAll('.equip-item').forEach(el=>{const id=el.dataset.station;el.querySelector('input').checked=picked.has(id);el.classList.toggle('changed',changed.has(id));});
      const n=allowed();
      $('equipCount').textContent=n?uiText('S tímto vybavením je k dispozici '+czPlural(n,'cvik','cviky','cviků')+'.','This equipment allows '+n+(n===1?' exercise.':' exercises.')):uiText('Zaškrtni aspoň podložku nebo jednu pomůcku.','Tick at least the floor mat or one piece of equipment.');
      $('equipSave').disabled=!n;
    };
    sync();
    body.querySelector('.equip-presets').onclick=e=>{const b=e.target.closest('[data-preset]');if(!b)return;picked.clear();(data.presets?.[b.dataset.preset]||[]).forEach(id=>picked.add(id));changed=new Set();sync();};
    body.addEventListener('change',e=>{const input=e.target.closest('.equip-item input');if(!input)return;if(input.checked)picked.add(input.value);else picked.delete(input.value);changed.delete(input.value);sync();});
    $('equipAiRun').onclick=async()=>{
      const text=$('equipAiText').value.trim(),out=$('equipAiResult'),b=$('equipAiRun');
      if(!text){out.textContent=uiText('Vlož odkaz nebo seznam vybavení.','Paste a link or a list of equipment.');return;}
      b.disabled=true;b.textContent=uiText('Načítám…','Reading…');out.textContent='';
      try{
        const r=await jsonFetch('/app/api/gym/equipment/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
        const extra=r.unsupported?.length?'<p>'+esc(uiText('Tohle aplikace zatím neumí využít: ','The app can\'t use these yet: ')+r.unsupported.join(', ')+'.')+'</p>':'';
        if(r.status!=='ok'){out.innerHTML='<p>'+esc(r.message||'')+'</p>'+extra;return;}
        const before=new Set(picked);picked.clear();r.stations.forEach(id=>picked.add(id));
        changed=new Set([...picked].filter(id=>!before.has(id)).concat([...before].filter(id=>!picked.has(id))));
        sync();
        out.innerHTML='<p>'+esc(r.note||'')+' '+esc(uiText('Zkontroluj zaškrtnutí (změny jsou zvýrazněné) a ulož.','Check the ticks (changes are highlighted) and save.'))+'</p>'+extra
          +(r.sources?.length?'<p>'+r.sources.map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.title)+'</a>').join(' · ')+'</p>':'');
      }catch(error){out.textContent=error.message;}
      finally{b.disabled=false;b.textContent=uiText('Načíst','Read');}
    };
    body.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const b=$('equipSave');b.disabled=true;
      try{
        const {training}=await jsonFetch('/app/api/training-setup',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({stations:[...picked]})});
        gymEquipment={...data,stations:training.stations,equipment:training.equipment,equipmentChosen:true};
        gymExerciseCatalog=[];closeSheet();toast(uiText('Vybavení je uložené.','Your equipment is saved.'));
        if(then)await then();
      }catch(error){toast(error.message);b.disabled=false;}
    };
  });
}
if($('generateGym')&&!$('gymEquipmentButton')){
  const style=document.createElement('style');style.textContent='.equip-presets{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}.equip-ai{margin:0 0 14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px}.equip-ai summary{cursor:pointer;font-weight:650}.equip-ai textarea{width:100%;margin:8px 0;box-sizing:border-box}.equip-ai p{margin:6px 0}.equip-ai a{color:var(--primary-text)}.equip-zone{border:0;padding:0;margin:0 0 12px;min-width:0}.equip-zone legend{font-weight:700;font-size:var(--fs-small);color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;padding:0}.equip-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px}.equip-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;font-size:var(--fs-small);cursor:pointer}.equip-item input{accent-color:var(--accent);width:18px;height:18px;flex:none;margin:0}.equip-item.changed{border-color:var(--accent);background:rgba(var(--primary-rgb),.08)}';document.head.append(style);
  $('generateGym').insertAdjacentHTML('beforebegin','<button class="btn" type="button" id="gymEquipmentButton">Moje vybavení</button>');$('gymEquipmentButton').onclick=()=>showGymEquipment();
}
