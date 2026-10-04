const $=id=>document.getElementById(id);
let coachRefreshRunning=false;
let statusCoachingRevision=0;
let coachRefreshTimer;
function scheduleCoachRefresh(){clearTimeout(coachRefreshTimer);coachRefreshTimer=setTimeout(refreshCoachLifecycle,250);}
async function refreshCoachLifecycle(){
  if(document.hidden||coachRefreshRunning||selectedHistoryDate!==pragueToday())return;
  coachRefreshRunning=true;
  const revision=statusCoachingRevision;
  try{
    const [daily,coaches,fitness,sleep]=await Promise.all([jsonFetch('/app/api/daily'),jsonFetch('/app/api/coaches'),jsonFetch('/app/api/fitness?days=90'),jsonFetch('/app/api/sleep?start='+dateShift(pragueToday(),-31)+'&end='+dateShift(pragueToday(),1))]);
    if(revision!==statusCoachingRevision||selectedHistoryDate!==pragueToday())return;
    const oldStatus=state.athleteState?.status;
    state.daily=daily;state.coaches=coaches;state.fitness=fitness;
    const dates=new Set((sleep.sessions||[]).map(s=>s.date));state.sleep={...sleep,sessions:[...(sleep.sessions||[]),...(state.sleep?.sessions||[]).filter(s=>!dates.has(s.date))]};
    if(coaches.athleteState)state.athleteState={...state.athleteState,...coaches.athleteState};
    if(oldStatus&&oldStatus!==state.athleteState?.status){statusCoachingRevision++;state.coachAdvice=null;state.proposals={};state.generated=null;if($('generatedWorkout'))$('generatedWorkout').innerHTML='';if($('weekProposalCards'))$('weekProposalCards').innerHTML='';await loadWeekPlan(true);}
    renderOverview();renderCoachCouncil();renderToday();
  }catch{}finally{coachRefreshRunning=false;}
}
setInterval(refreshCoachLifecycle,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCoachLifecycle();});
let weekStart=pragueMonday(),selectedHistoryDate=pragueToday(),state={};
let inboxChannel="cycling";
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function fmt(v,d=0){return Math.round(num(v)*10**d)/10**d}
function dateShift(date,days){const p=date.split("-").map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]+days)).toISOString().slice(0,10)}
function pragueToday(){const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());return p.find(x=>x.type==="year").value+"-"+p.find(x=>x.type==="month").value+"-"+p.find(x=>x.type==="day").value}
function pragueMonday(){const d=pragueToday().split("-").map(Number),x=new Date(Date.UTC(d[0],d[1]-1,d[2])),wd=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-wd);return x.toISOString().slice(0,10)}
function mondayOf(date){const d=date.split('-').map(Number),x=new Date(Date.UTC(d[0],d[1]-1,d[2])),wd=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-wd);return x.toISOString().slice(0,10)}
function dateLabel(d){return new Intl.DateTimeFormat("cs-CZ",{day:"2-digit",month:"2-digit"}).format(new Date(d+"T12:00:00Z"))}
function longDate(d){return new Intl.DateTimeFormat("cs-CZ",{weekday:"long",day:"numeric",month:"numeric"}).format(new Date(d+"T12:00:00Z"))}
function hm(min){if(!Number.isFinite(Number(min)))return "—";return Math.floor(Number(min)/60)+"h "+Math.round(Number(min)%60)+"m"}
function isNutritionItem(x){const n=String(x?.name||"").trim(),t=String(x?.type||"").trim();return /nutrition/i.test(n)||/^nutrition$/i.test(t)}
function scoreClass(v){return v>=80?"":" "+(v>=60?"mid":"low")}
function scoreBadge(v,label="Skóre"){return '<span class="score'+scoreClass(v)+'">'+label+" "+fmt(v)+"%</span>"}
function trendArrow(current,previous,invert=false,unit=""){
  const a=Number(current),b=Number(previous);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a===b)return "";
  const delta=a-b,good=invert?delta<0:delta>0,arrow=delta>0?"↑":"↓";
  return '<div class="trend '+(good?"good":"bad")+'">'+arrow+" "+(delta>0?"+":"")+fmt(delta,1)+" "+esc(unit)+'</div>';
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
function macroChart(id,days){
  const svg=$(id),shown=(days||[]).slice(-7);if(!shown.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#91a0b5">Bez dat</text>';return}
  const compact=true,W=1000,H=440,top=96,bottom=18,left=12,plot=H-top-bottom,slot=(W-left-12)/shown.length,bw=slot*.86,dayNames=["Neděle","Pondělí","Úterý","Středa","Čtvrtek","Pátek","Sobota"];svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.style.height='auto';svg.style.width='100%';svg.style.aspectRatio='1000 / 440';
  let out='';
  shown.forEach((d,i)=>{const food=d.food?.totals||{},target=Math.max(1,num(d.daily?.nutrition?.calorieTarget||d.daily?.calories?.target)),eaten=Math.max(0,num(food.kcal)),macroKcal=num(food.protein_g)*4+num(food.carbs_g)*4+num(food.fat_g)*9,vals=[{kcal:num(food.protein_g)*4,color:"#60a5fa"},{kcal:num(food.carbs_g)*4,color:"#f59e0b"},{kcal:num(food.fat_g)*9,color:"#a78bfa"}],x=left+i*slot+(slot-bw)/2,base=top+plot;
    out+='<text x="'+(x+bw/2)+'" y="32" text-anchor="middle" fill="#f4f7fb" font-size="19" font-weight="800">'+dayNames[new Date(d.date+"T12:00:00").getDay()]+'</text><rect x="'+x+'" y="'+top+'" width="'+bw+'" height="'+plot+'" rx="12" fill="#14253a" stroke="#355270" stroke-width="2"/>';
    const totalY=62;out+='<text x="'+(x+bw/2)+'" y="'+totalY+'" text-anchor="middle" fill="#f4f7fb" font-size="23" font-weight="850">'+fmt(eaten)+'</text><text x="'+(x+bw/2)+'" y="'+(totalY+24)+'" text-anchor="middle" fill="#aebcd0" font-size="17">/ '+fmt(target)+'</text>';
    let y=base,remaining=Math.min(target,eaten),visible=vals.filter(v=>Math.min(remaining,v.kcal)>0).length;vals.forEach(v=>{const amount=Math.min(remaining,v.kcal),raw=amount/target*plot;remaining-=amount;if(raw>0){const h=Math.max(4,raw-(visible>1?4:0)),share=macroKcal>0?Math.round(v.kcal/macroKcal*100):0;y-=h;out+='<rect x="'+(x+3)+'" y="'+y+'" width="'+(bw-6)+'" height="'+h+'" rx="6" fill="'+v.color+'"/>';if(h>=15)out+='<text x="'+(x+bw/2)+'" y="'+(y+h/2+5)+'" text-anchor="middle" fill="#07101d" font-size="'+(h<24?'13':'16')+'" font-weight="900">'+share+'%</text>';y-=4;}});});
  svg.innerHTML=out;
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
    const d=dateShift(pragueMonday(),i*7);
    opts.push('<option value="'+d+'" '+(d===weekStart?"selected":"")+'>Týden '+isoWeek(d)+' · '+dateLabel(d)+'–'+dateLabel(dateShift(d,6))+'</option>');
  }
  ws.innerHTML=opts.join("");
  if(ds){
    ds.innerHTML=days.map(x=>'<option value="'+x.date+'" '+(x.date===selectedHistoryDate?"selected":"")+'>'+esc(longDate(x.date))+'</option>').join("");
    ds.onchange=()=>{selectedHistoryDate=ds.value;renderTraining();renderNutrition()};
  }
  ws.onchange=()=>{weekStart=ws.value;selectedHistoryDate=weekStart;load()};
}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
async function jsonFetch(path,options={}){const r=await fetch(path,{credentials:"same-origin",...options,headers:{...options.headers,"X-Interface-Language":document.documentElement.lang||"cs"}});const d=await r.json().catch(()=>({message:"Invalid response"}));if(r.status===401)showLoginGate();if(r.status===409&&d.status==="onboarding")showOnboarding(d.missingProviders||[]);if(!r.ok)throw new Error(d.message||"HTTP "+r.status);if(options.method&&options.method!=='GET'&&!/\/assistant|\/sync|\/athlete-state/.test(path))scheduleCoachRefresh();return d}
// Every data API requires a session; the first 401 swaps the dashboard for a login screen.
const gateStyle='position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:#0a0d12;overflow:auto';
function showLoginGate(){if($("loginGate"))return;document.body.insertAdjacentHTML("beforeend",'<div id="loginGate" role="dialog" aria-modal="true" aria-labelledby="loginGateTitle" style="'+gateStyle+'"><div class="card" style="width:min(380px,100%);display:grid;gap:12px"><h2 id="loginGateTitle" style="margin:0">Přihlášení</h2><p class="small" style="margin:0">Do aplikace se přihlašuješ svým Google účtem. Přístup mají jen pozvaní uživatelé.</p><a class="btn primary" href="/auth/google" style="text-align:center;text-decoration:none">Přihlásit přes Google</a></div></div>');}
// Until Google Health and Intervals.icu are connected the dashboard shows only the setup steps.
// Connections are optional: the user may continue with manual entries.
function onboardingSkipped(){try{return localStorage.getItem('onboardingSkipped')==='1';}catch{return false;}}
function showOnboarding(missing){if($("loginGate")||$("onboardingGate"))return;const need=id=>missing.includes(id);document.body.insertAdjacentHTML("beforeend",'<div id="onboardingGate" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle" style="'+gateStyle+'"><div class="card" style="width:min(520px,100%);display:grid;gap:14px"><div><div class="eyebrow">Vítej</div><h2 id="onboardingTitle" style="margin:4px 0 6px">Připoj svoje data</h2><p class="small" style="margin:0">Propoj Google Health a Intervals.icu a data se budou načítat sama. Můžeš pokračovat i bez nich: váhu a jídlo pak zapisuješ ručně a kalorický cíl spočítáme z profilu. Každý uživatel vidí jen svoje vlastní data.</p></div><div class="notice"><strong>1. Google Health</strong> '+(need("google")?'<span class="pill">Nepřipojeno</span><p class="small">Spánek, aktivity, hmotnost a jídlo. Budeš přesměrován na souhlas Google.</p><a class="btn primary" href="/oauth/google" style="display:inline-block;text-decoration:none">Připojit Google Health</a>':'<span class="pill good">Připojeno</span>')+'</div><div class="notice"><strong>2. Intervals.icu</strong> '+(need("intervals")?'<span class="pill">Nepřipojeno</span><p class="small">API klíč najdeš v Intervals.icu → Settings → Developer Settings. Athlete ID zadávat nemusíš.</p><form id="onboardingIntervals" class="select-row"><input id="onboardingIntervalsKey" type="password" autocomplete="off" placeholder="API klíč Intervals.icu" aria-label="API klíč Intervals.icu" required style="background:#0d1119;color:#fff;border:1px solid #393245;border-radius:9px;padding:10px;min-width:0;flex:1"><button class="btn primary" type="submit">Ověřit a připojit</button></form><div class="small" id="onboardingIntervalsResult" aria-live="polite"></div>':'<span class="pill good">Připojeno</span>')+'</div><button class="btn primary" id="onboardingSkip" type="button">Pokračovat bez propojení</button><button class="btn" id="onboardingLogout" type="button">Odhlásit</button></div></div>');$("onboardingSkip").onclick=()=>{try{localStorage.setItem('onboardingSkipped','1');}catch{}$("onboardingGate").remove();load();toast('Propojit služby můžeš kdykoli v Nastavení.');};const form=$("onboardingIntervals");if(form)form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector("button");b.disabled=true;try{await jsonFetch("/app/api/connections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:"intervals",key:$("onboardingIntervalsKey").value.trim()})});location.reload();}catch(error){$("onboardingIntervalsResult").textContent=error.message;b.disabled=false;}};$("onboardingLogout").onclick=logout;}
async function logout(){await fetch("/app/logout",{method:"POST",credentials:"same-origin"}).catch(()=>{});location.href="/app";}
function activate(view){if(!$(view)?.classList.contains('view'))return;try{localStorage.setItem('pfd-active-view',view);}catch{}document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===view));window.scrollTo({top:0,behavior:'instant'});}
function renderInboxHistory(items=[]){const el=$("inboxHistory");if(!el)return;el.innerHTML=items.length?items.map(x=>'<div class="inbox-item"><div class="small"><b>'+esc(({cycling:"Kolo",gym:"Gym",nutrition:"Výživa"}[x.channel]||x.channel))+'</b><span>'+esc(String(x.status)==="confirmed"?"Potvrzeno":"Návrh")+'</span></div><p>'+esc(x.message)+'</p><div class="small">'+esc(x.draft?.reply||"")+'</div></div>').join(""):'<div class="small">Zatím tu nejsou žádné požadavky.</div>'}
function renderInboxDraft(draftId,draft){const el=$("inboxDraft");if(!el)return;el.innerHTML='<div class="notice"><strong>Návrh trenéra</strong><div style="margin-top:6px">'+esc(draft.reply||"Návrh připraven.")+'</div><div style="margin-top:10px"><button class="btn primary" id="confirmInbox" data-id="'+esc(draftId)+'">Potvrdit a provést</button></div></div>';const confirm=$("confirmInbox");if(confirm)confirm.onclick=async()=>{confirm.disabled=true;confirm.textContent="Provádím…";try{const r=await jsonFetch("/app/api/inbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"confirm",draftId})});toast(r.message||"Potvrzeno");el.innerHTML='<div class="notice">✓ '+esc(r.message||"Potvrzeno")+'</div>';await loadInbox();if(draft.action?.type==="gym_generate")await loadGym();if(draft.action?.type==="food_log")await load();}catch(e){toast("Potvrzení selhalo: "+e.message);confirm.disabled=false;confirm.textContent="Potvrdit a provést";}}}
async function loadInbox(){try{const r=await jsonFetch("/app/api/inbox");state.inbox=r.items||[];renderInboxHistory(state.inbox)}catch(e){const el=$("inboxHistory");if(el)el.innerHTML='<div class="small">Schránku se nepodařilo načíst.</div>';}}
async function sendInbox(){const text=$("inboxMessage")?.value.trim();if(!text){toast("Napiš požadavek pro trenéra.");return}const b=$("sendInbox");b.disabled=true;b.textContent="Připravuji…";try{const r=await jsonFetch("/app/api/inbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel:inboxChannel,message:text})});renderInboxDraft(r.draftId,r.draft);$("inboxMessage").value="";await loadInbox()}catch(e){toast("Návrh se nepodařilo připravit: "+e.message)}finally{b.disabled=false;b.textContent="Připravit návrh"}}
function multiLineChart(id,series,labels,opts={}){const svg=$(id),W=opts.W||1000,H=opts.H||300,pad=40,all=series.flatMap(s=>s.values.map(Number).filter(Number.isFinite));if(!all.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#91a0b5">Bez dat</text>';return}let min=Math.min(...all),max=Math.max(...all);if(min===max){min-=1;max+=1}const x=i=>pad+(W-pad*2)*(labels.length<=1?.5:i/(labels.length-1)),y=v=>H-pad-(H-pad*2)*(v-min)/(max-min);let out='<line x1="'+pad+'" y1="'+(H-pad)+'" x2="'+(W-pad)+'" y2="'+(H-pad)+'" stroke="#24364d"/>';for(let i=0;i<labels.length;i++){if(i===0||i===labels.length-1||i%Math.max(1,Math.floor(labels.length/6))===0)out+='<text x="'+x(i)+'" y="'+(H-10)+'" text-anchor="middle" fill="#91a0b5" font-size="10">'+esc(labels[i])+'</text>'}series.forEach(s=>{const pts=[];s.values.forEach((v,i)=>{if(Number.isFinite(Number(v)))pts.push(x(i)+","+y(Number(v)))});if(pts.length>1)out+='<polyline points="'+pts.join(" ")+'" fill="none" stroke="'+s.stroke+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'});let lx=pad;series.forEach(s=>{out+='<line x1="'+lx+'" y1="16" x2="'+(lx+18)+'" y2="16" stroke="'+s.stroke+'" stroke-width="3"/><text x="'+(lx+24)+'" y="20" fill="#91a0b5" font-size="11">'+esc(s.label)+'</text>';lx+=95+String(s.label).length*4});svg.innerHTML=out}
function chartSvg(id,values,targets,labels,opts={}){
  const svg=$(id),W=opts.W||700,H=opts.H||250,padL=opts.axis?58:34,padR=20,padB=42,padT=28;
  const vals=values.map(v=>Number(v)).filter(Number.isFinite),tar=(targets||[]).map(v=>Number(v)).filter(Number.isFinite),all=vals.concat(tar);
  if(!all.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#8d99aa">Bez dat</text>';return}
  let min=opts.min!=null?opts.min:Math.min(...all),max=opts.max!=null?opts.max:Math.max(...all);
  if(min===max){min-=1;max+=1}
  const x=i=>padL+(W-padL-padR)*(values.length<=1?.5:i/(values.length-1)),y=v=>H-padB-(H-padB-padT)*(v-min)/(max-min);
  let out='<line x1="'+padL+'" y1="'+(H-padB)+'" x2="'+(W-padR)+'" y2="'+(H-padB)+'" stroke="#26303d"/>';
  if(opts.axis){for(let tick=0;tick<=4;tick++){const v=min+(max-min)*tick/4, yy=y(v);out+='<line x1="'+padL+'" y1="'+yy+'" x2="'+(W-padR)+'" y2="'+yy+'" stroke="#1d2b3c"/><text x="'+(padL-8)+'" y="'+(yy+4)+'" text-anchor="end" fill="#91a0b5" font-size="10">'+fmt(v,opts.decimals??0)+(opts.unit||"")+'</text>';}}
  const pts=[];values.forEach((v,i)=>{if(Number.isFinite(Number(v))){pts.push(x(i)+","+y(Number(v)));out+='<circle cx="'+x(i)+'" cy="'+y(Number(v))+'" r="3" fill="#7c5cff"/>'}if(labels[i]&&(i===0||i===labels.length-1||i%Math.max(1,Math.ceil(labels.length/6))===0))out+='<text x="'+x(i)+'" y="'+(H-13)+'" text-anchor="middle" fill="#8d99aa" font-size="10">'+esc(labels[i])+'</text>'});
  if(pts.length>1)out+='<polyline points="'+pts.join(" ")+'" fill="none" stroke="#7c5cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  if(targets?.length){const p=targets.map((v,i)=>Number.isFinite(Number(v))?x(i)+","+y(Number(v)):null).filter(Boolean);if(p.length>1)out+='<polyline points="'+p.join(" ")+'" fill="none" stroke="#34d399" stroke-width="2" stroke-dasharray="6 5"/>'}
  svg.innerHTML=out
}
function barChart(id,values,targets,labels){const svg=$(id),W=700,H=250,pad=28,all=values.concat(targets||[]).map(num),max=Math.max(1,...all)*1.12,bw=(W-pad*2)/Math.max(1,values.length)*.58;let out="";values.forEach((v,i)=>{const x=pad+i*(W-pad*2)/Math.max(1,values.length)+(W-pad*2)/Math.max(1,values.length)*.21,h=num(v)/max*(H-55),ht=num(targets?.[i])/max*(H-55);out+='<rect x="'+x+'" y="'+(H-30-ht)+'" width="'+bw+'" height="'+ht+'" rx="4" fill="#34d399" opacity=".25"/><rect x="'+x+'" y="'+(H-30-h)+'" width="'+bw+'" height="'+h+'" rx="4" fill="#7c5cff"/><text x="'+(x+bw/2)+'" y="'+(H-9)+'" text-anchor="middle" fill="#8d99aa" font-size="10">'+esc(labels[i])+'</text>'});svg.innerHTML=out}
function primarySleepSessions(sessions){
  return (sessions||[])
    .filter(x=>num(x?.durationMin)>=180)
    .slice()
    .sort((a,b)=>new Date(b?.endTime||b?.startTime||0)-new Date(a?.endTime||a?.startTime||0));
}
function trainingDayMarkup(x){
  const training=x?.daily?.training||{};
  const planned=(training.planned||[]).filter(z=>!isNutritionItem(z));
  const completed=(training.completed||[]).filter(z=>!isNutritionItem(z));
  const matched=training.matched||[];
  const paired=new Map(matched.map(m=>[String(m.actualId),m.planned]));
  // Defensive UI pairing while older cached API responses are still in flight.
  // A distinctive matching title on the same daily response is one session.
  const norm=v=>String(v||"").toLowerCase().replace(/[^a-z0-9áéěíóúůýčďňřšťž]+/g," ").trim();
  planned.forEach(plan=>{const key=norm(plan.name);if(!key)return;const candidate=completed.find(actual=>!paired.has(String(actual.id))&&(norm(actual.name).includes(key)||key.includes(norm(actual.name))));if(candidate)paired.set(String(candidate.id),plan);});
  const entries=[];
  completed.forEach(actual=>entries.push({actual,planned:paired.get(String(actual.id))||null}));
  planned.filter(plan=>!Array.from(paired.values()).includes(plan)).forEach(plan=>entries.push({planned:plan,actual:null}));
  const items=entries.map(({planned,actual})=>{
    const item=actual||planned, done=Boolean(actual), linked=Boolean(actual&&planned);
    const label=linked?"✓ Podle plánu":done?"✓ Mimo plán":"Plánováno";
    const tone=linked?"done":done?"unplanned":"";
    const planName=linked&&planned.name&&planned.name!==actual.name?'<div class="small">Plán: '+esc(planned.name)+'</div>':"";
    return '<div class="plan-item '+tone+'"><div class="name">'+esc(actual?.name||planned?.name||actual?.type||planned?.type||"Aktivita")+activityEnvironmentBadge(item,activitySport(item))+'</div><div class="meta">'+label+(item.durationHours?" · "+fmt(item.durationHours,1)+" h":"")+(actual?.tss?" · TSS "+fmt(actual.tss):planned?.tss?" · TSS "+fmt(planned.tss):"")+(actual?.calories?" · "+fmt(actual.calories)+" kcal":"")+'</div>'+planName+'</div>';
  }).join("");
  return '<div class="plan-day '+(x.date===pragueToday()?"today":"")+'" data-training-date="'+esc(x.date)+'" tabindex="0" role="button" aria-label="Detail tréninku '+esc(longDate(x.date))+'"><div class="dow">'+esc(longDate(x.date))+'</div>'+(items||'<div class="muted">Volno</div>')+'</div>';
}

function renderCoachCouncil(){
  const council=state.coaches||{},cards=[...(council.coaches||[]),...(council.reviews||[])];
  const p=$("coachPriorities"),c=$("coachCards");if(!p||!c)return;
  let summary=$('morningSummary');if(!summary){p.insertAdjacentHTML('beforebegin','<div id="morningSummary" class="morning-summary"></div>');summary=$('morningSummary');}
  const morning=council.morningSummary;summary.hidden=!morning;summary.innerHTML=morning?'<div class="eyebrow">DNEŠNÍ PŘIPRAVENOST</div><h3>'+esc(morning.headline)+'</h3><p>'+esc(morning.text)+'</p><strong>'+esc(morning.recommendation)+'</strong>':'';
  p.hidden=!council.priorities?.length;p.innerHTML=council.priorities?.length?'<div class="eyebrow">KOORDINÁTOR · DNEŠNÍ PRIORITY</div><ol class="coach-actions">'+council.priorities.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ol>':'';
  c.innerHTML=cards.map(x=>'<article class="coach-card '+esc(x.status||'')+'"><div class="eyebrow">'+esc(x.title)+'</div><h3>'+esc(x.headline)+'</h3><ul class="coach-actions">'+(x.actions||[]).map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>'+((x.analysis||[]).length?'<div class="coach-analysis">'+x.analysis.map(a=>'<div><strong>'+esc(a.label)+'</strong><p>'+esc(a.text)+'</p></div>').join('')+'</div>':'')+((x.resources||[]).length?'<div class="small" style="margin-top:8px">'+x.resources.filter(r=>/^https:\/\//.test(String(r.url||''))).map(r=>'<a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">'+esc(r.label||'Otevřít postup')+'</a>').join('<br>')+'</div>':'')+'</article>').join('');
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
  $("oSleep").innerHTML=lastSleep?hm(lastSleep.durationMin):"—";
  $("oSleepMeta").innerHTML=lastRecovery==null?"bez dat pro recovery":'Recovery '+lastRecovery+'/100'+trendArrow(lastRecovery,avgRecovery,false," b vs 30 dní");
  const plannedLoad=planned.reduce((sum,x)=>sum+num(x.tss),0),actualLoad=completed.reduce((sum,x)=>sum+num(x.tss),0),sleepPct=lastSleep?Math.min(100,Math.round(num(lastSleep.durationMin)/480*100)):0,loadPct=Math.min(100,Math.round((actualLoad||plannedLoad||0)/1.8));
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
  $("oMacros").innerHTML='<div class="macro-line"><b style="color:#60a5fa">P</b><span>'+fmt(f.protein_g)+' / '+fmt(m.protein)+' g</span></div><div class="macro-line"><b style="color:#f59e0b">C</b><span>'+fmt(f.carbs_g)+' / '+fmt(m.carbs)+' g</span></div><div class="macro-line"><b style="color:#a78bfa">F</b><span>'+fmt(f.fat_g)+' / '+fmt(m.fat)+' g</span></div>';
  const days=state.week?.days||[];
  $("overviewWeekPlan").innerHTML=days.map(trainingDayMarkup).join("");
  const fw=(state.fitness?.wellness||[]).filter(r=>r.id<=selectedHistoryDate),latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};
  $("oFitness").innerHTML=(Number.isFinite(Number(latest.ctl))?fmt(latest.ctl):"—")+trendArrow(latest.ctl,prev.ctl,false,"");
  $("oForm").innerHTML=(Number.isFinite(Number(latest.tsb))?fmt(latest.tsb):"—")+trendArrow(latest.tsb,prev.tsb,false,"");
  const wr=(d.weight?.records||[]).filter(x=>x.value_numeric!=null&&String(x.sample_time).slice(0,10)<=selectedHistoryDate).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time)));
  const currentW=wr.length?Number(wr[wr.length-1].value_numeric):selectedHistoryDate===pragueToday()?Number(d.weight?.current):NaN;
  const startW=wr[0];
  const weightDelta=Number.isFinite(currentW)&&startW?currentW-num(startW.value_numeric):null;
  const weightTrend=weightDelta==null||Math.abs(weightDelta)<.05?"":'<div class="trend '+(weightDelta<0?"good":"bad")+'">'+(weightDelta>0?"↑ +":"↓ ")+fmt(weightDelta,1)+' kg od počáteční váhy</div>';
  const targetW=Number(d.nutrition?.targetWeightKg||80),remainingW=Number.isFinite(currentW)?currentW-targetW:null; $("oWeight").innerHTML=Number.isFinite(currentW)?fmt(currentW,1)+" kg"+weightTrend:"—"; $("oWeightMeta").textContent=Number.isFinite(remainingW)?"Aktuálně · cíl "+fmt(targetW,1)+" kg · zbývá "+fmt(Math.max(0,remainingW),1)+" kg":"aktuálně · cíl "+fmt(targetW,1)+" kg";
  macroChart("calChart",days);
  renderMealDiary();
}
function renderPmcChart(){
  const range=num($('pmcRange').value,14),rows=(state.fitness?.wellness||[]).filter(r=>r.id>=dateShift(pragueToday(),1-range)&&r.id<=pragueToday()),svg=$('pmcChart'),W=1000,H=420,L=72,R=26,T=48,B=52;
  $('pmcRange').onchange=renderPmcChart;
  const series=[['Fitness','ctl','#3b82f6'],['Fatigue','atl','#ef6b73'],['Form','tsb','#35c48b']],values=rows.flatMap(r=>series.map(s=>r[s[1]]).filter(measured).map(Number));
  if(!values.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#91a0b5">Bez dat v tomto období</text>';return}
  const lo=Math.floor(Math.min(0,...values)/20)*20,hi=Math.max(lo+20,Math.ceil(Math.max(...values)/20)*20),x=date=>L+(W-L-R)*(new Date(date+'T12:00:00Z')-new Date(dateShift(pragueToday(),1-range)+'T12:00:00Z'))/((range-1)*86400000),y=v=>H-B-(H-T-B)*(v-lo)/(hi-lo);
  let out='';for(let i=0;i<=5;i++){const v=lo+(hi-lo)*i/5,yy=y(v);out+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'" stroke="#2c3745"/><text x="'+(L-12)+'" y="'+(yy+5)+'" text-anchor="end" fill="#aeb9c9" font-size="15">'+fmt(v)+'</text>'}
  out+='<line x1="'+L+'" x2="'+L+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#728096"/><text x="12" y="25" fill="#aeb9c9" font-size="13">Zátěž</text>';
const step=range<=14?1:range<=30?3:7;for(let i=0;i<range;i++){if(i%step&&i!==range-1)continue;if(step>1&&i===range-1&&(range-1)%step>0&&(range-1)%step<step/2)continue;const date=dateShift(pragueToday(),i+1-range),xx=x(date);out+='<line x1="'+xx+'" x2="'+xx+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#24303d"/><text transform="translate('+xx+','+(H-25)+') rotate(-35)" text-anchor="end" fill="#aeb9c9" font-size="13">'+esc(dateLabel(date))+'</text>'}
  series.forEach(([name,key,color],i)=>{let segment=[];const flush=()=>{if(segment.length>1)out+='<polyline points="'+segment.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3"/>';segment=[]};rows.forEach((r,j)=>{if(j&&dateShift(rows[j-1].id,1)!==r.id)flush();if(!measured(r[key])){flush();return}const xx=x(r.id),yy=y(Number(r[key]));segment.push(xx+','+yy);out+='<circle cx="'+xx+'" cy="'+yy+'" r="3" fill="'+color+'"><title>'+esc(dateLabel(r.id)+' · '+name+': '+fmt(r[key],1))+'</title></circle>'});flush();out+='<text x="'+(L+i*150)+'" y="25" fill="'+color+'" font-size="16">'+name+'</text>'});svg.innerHTML=out;
}

function renderTraining(){
  const days=state.week?.days||[],fw=(state.fitness?.wellness||[]).filter(r=>r.id<=selectedHistoryDate);
  $("trainingRange").textContent="Týden "+isoWeek(weekStart)+" · "+dateLabel(weekStart)+" – "+dateLabel(dateShift(weekStart,6));
  populateWeekSelectors("trainingWeekSelect",null,days);
  const selected=days.find(x=>x.date===selectedHistoryDate)||days.find(x=>x.date===pragueToday())||days[0];
  const planned=days.flatMap(x=>(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z)).map(z=>({...z,date:x.date})));
  const completed=days.flatMap(x=>(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z)).map(z=>({...z,date:x.date})));
  const matched=days.flatMap(x=>(x.daily?.training?.matched||[]).map(z=>({...z,date:x.date})));
  $("trainingWeekOverview").innerHTML=days.map(trainingDayMarkup).join("");
  const latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};
  $("tFitness").innerHTML=(Number.isFinite(Number(latest.ctl))?fmt(latest.ctl):"—")+trendArrow(latest.ctl,prev.ctl,false,"");
  $("tFatigue").innerHTML=(Number.isFinite(Number(latest.atl))?fmt(latest.atl):"—")+trendArrow(latest.atl,prev.atl,true,"");
  $("tForm").innerHTML=(Number.isFinite(Number(latest.tsb))?fmt(latest.tsb):"—")+trendArrow(latest.tsb,prev.tsb,false,"");
  $("tRamp").innerHTML=(Number.isFinite(Number(latest.rampRate))?fmt(latest.rampRate,1):"—")+trendArrow(latest.rampRate,prev.rampRate,false,"");
  renderPmcChart();
  const form=num(latest.tsb),ramp=num(latest.rampRate);
  $("pmcInsight").textContent=!Number.isFinite(form)?"Bez aktuálních wellness dat.":form<0?"Form je záporný: zátěž je vyšší než dlouhodobá připravenost. Zaměř se na regeneraci a nepřidávej další intenzitu bez důvodu.":ramp>5?"Fitness roste rychleji. Sleduj kumulovanou únavu; další zvyšování objemu má smysl jen při stabilní regeneraci.":"Fitness/form jsou v relativně stabilním pásmu. Pokračuj podle plánu a sleduj vývoj TSB.";
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
  $("nutritionTargetSummary").innerHTML='<strong>Dnešní cíl: '+fmt(targetCal)+' kcal</strong> · klidový cíl '+fmt(restTarget)+' kcal + '+fmt(trainingCal)+' kcal z tréninku.<br><strong>Výdej dnes: '+fmt(burn.total)+' kcal</strong> · '+fmt(burn.activity)+' kcal z evidovaných aktivit (chůze, gym i cyklistika). <span class="muted">'+(burn.source==="observed"?"Celkový denní výdej je z naměřených dat.":"Celkový denní výdej je průběžný odhad.")+'</span>';  $("nutritionDays").innerHTML=days.map(x=>{
    const t=num(x.daily?.calories?.target),e=num(x.food?.totals?.kcal),m=macroTargetsOf(x);
    const p=num(x.food?.totals?.protein_g),c=num(x.food?.totals?.carbs_g),f=num(x.food?.totals?.fat_g);
    const score=nutritionScore({kcal:e,protein_g:p,carbs_g:c,fat_g:f},{calorieTarget:t,macros:m});
    return '<div class="day '+(x.date===pragueToday()?"today":"")+'"><div class="dayhead">'+esc(longDate(x.date))+' '+(score==null?'<span class="pill">Bez záznamu</span>':scoreBadge(score))+'</div><div class="value" style="font-size:20px">'+fmt(e)+' / '+fmt(t)+' kcal</div><div class="bar"><i style="width:'+Math.min(100,t?e/t*100:0)+'%"></i></div><div class="macro-lines"><div class="macro-line"><b style="color:#60a5fa">Protein</b><span>'+fmt(p)+' / '+fmt(m.protein)+' g</span></div><div class="macro-line"><b style="color:#f59e0b">Sacharidy</b><span>'+fmt(c)+' / '+fmt(m.carbs)+' g</span></div><div class="macro-line"><b style="color:#a78bfa">Tuk</b><span>'+fmt(f)+' / '+fmt(m.fat)+' g</span></div></div></div>';
  }).join("");
  macroChart("nutritionChart",days);

  const selected=today;
  const allMealGroups=selected?.recommendations?.mealRecommendations||[];
  const nextMeal=allMealGroups[0];
  const stores=selected?.recommendations?.storeAlternatives||[];
  const selectedMacros=macroTargetsOf(selected||{});
  const selectedFood=selected?.food?.totals||{};
  const remKcal=Math.max(0,targetCal-num(selectedFood.kcal));
  const rem={protein_g:Math.max(0,num(selectedMacros.protein)-num(selectedFood.protein_g)),carbs_g:Math.max(0,num(selectedMacros.carbs)-num(selectedFood.carbs_g)),fat_g:Math.max(0,num(selectedMacros.fat)-num(selectedFood.fat_g))};
  const nextRide=days.slice(days.findIndex(x=>x.date===selected?.date)+1).flatMap(x=>x.daily?.training?.planned||[]).find(x=>/ride|cycling|bike|endurance|threshold|sweet spot|tempo/i.test(String(x.name||"")+" "+String(x.type||"")));
  const nextRideNote=nextRide?'Zítra/nejbližší den máš '+esc(nextRide.name||"cyklistický trénink")+(nextRide.durationHours?' ('+fmt(nextRide.durationHours,1)+' h)':'')+' — sacharidy nech hlavně na jídlo před a během jízdy.':'Další evidované kolo není v plánu; sacharidy rozděl podle hladu a běžné aktivity.';
  const coaching=trainingCal>100?"Dnešní cíl už zahrnuje započtený trénink.":nextRideNote;
  const fallback='<div style="margin-top:12px"><h3 style="margin-bottom:6px">Nejbližší jídlo</h3><div class="foodrow"><div><strong>'+ (rem.protein_g>=30?'Jídlo s 30–45 g bílkovin':'Vyvážené běžné jídlo') +'</strong><div class="small">'+(rem.carbs_g>=60?'Přidej zdroj sacharidů podle zbývajících '+fmt(rem.carbs_g)+' g; ':'')+(rem.fat_g>=15?'tuk doplň běžnou porcí, ne celým cílem najednou.':'')+'</div></div><div class="right">'+fmt(remKcal)+' kcal zbývá</div></div></div>';
  $("foodPlan").innerHTML=selected?'<div class="reason"><strong>Zbývá '+fmt(remKcal)+' kcal</strong> · P '+fmt(rem.protein_g)+' g · C '+fmt(rem.carbs_g)+' g · F '+fmt(rem.fat_g)+' g<br>'+esc(coaching)+'</div>'+
    (nextMeal?'<div class="next-meal"><h3>'+esc(nextMeal.label)+' · z kuchařky</h3>'+
      (nextMeal.recommendations?.length?nextMeal.recommendations.slice(0,3).map(r=>'<div class="foodrow"><div><strong>'+esc(r.title||r.name||"Jídlo")+'</strong><div class="small">'+esc(r.recommendation_reason||"")+'</div><div class="small">1 porce · '+fmt(r.kcal||r.calories)+' kcal · P '+fmt(r.protein_g)+' · C '+fmt(r.carbs_g)+' · F '+fmt(r.fat_g)+'</div></div><div class="right">'+fmt(r.kcal||r.calories)+' kcal</div></div>').join(""):'<div class="muted">Pro tuto část dne nemám vhodný recept.</div>')+'</div>':'<div class="muted">Dnešní jídla jsou zapsaná nebo už je po jejich obvyklém čase.</div>')+
    (nextMeal?'':fallback)+
    (stores.length?'<div class="next-meal"><h3>Rychle z běžných potravin</h3>'+stores.slice(0,2).map(r=>'<div class="foodrow"><div><strong>'+esc(r.name)+'</strong><div class="small">'+esc(r.reason||"")+' · P '+fmt(r.protein_g)+' g · C '+fmt(r.carbs_g)+' g</div></div><div class="right">'+fmt(r.kcal)+' kcal</div></div>').join("")+'</div>':''):'—';

  const nr=state.nutrition?.records||[];
  const selectedFoods=nr.filter(x=>String(x.startTime||"").slice(0,10)===String(selected?.date||""));
  $("nutritionInfo").textContent=selectedFoods.length+" záznamů z Google Health pro "+(selected?.date||"vybraný den");
  $("nutritionRows").innerHTML=layeredHistory(nr,x=>x.startTime,x=>'<div class="history-workout"><strong>'+esc(x.foodDisplayName||"Jídlo")+' · '+fmt(x.kcal)+' kcal</strong><div class="small">'+esc(x.startTime?new Date(x.startTime).toLocaleString("cs-CZ"):"—")+' · '+esc(x.mealType||"—")+' · P '+fmt(x.protein_g,1)+' g · C '+fmt(x.carbs_g,1)+' g · F '+fmt(x.fat_g,1)+' g</div></div>');
}
function renderRecovery(){
  const ss=primarySleepSessions(state.sleep?.sessions).filter(s=>(s.date||String(s.endTime||'').slice(0,10))<=selectedHistoryDate),last=ss[0],range=Number($("sleepRange")?.value||30);
  const filtered=ss.filter(x=>{const t=new Date(x.endTime||x.startTime||0).getTime();return range>=3000||t>=Date.now()-range*86400000;});
  $("rLast").textContent=last?hm(last.durationMin):"—";
  $("rLastMeta").textContent=last?(last.startTime?new Date(last.startTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"")+" → "+(last.endTime?new Date(last.endTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):""):"";
  const avg=filtered.length?filtered.reduce((a,x)=>a+num(x.durationMin),0)/filtered.length:0;
  $("rAvg").textContent=avg?hm(avg):"—";
  $("rAvgLabel").textContent=range>=3000?"all time":range===365?"poslední rok":range===180?"posledních 6 měsíců":range===30?"poslední měsíc":"posledních 7 dní";
  const sleepScore=sleepIndex(last);
  const baselineRows=ss.filter(x=>new Date(x.endTime||x.startTime||0).getTime()>=Date.now()-30*86400000),baseline=baselineRows.length?baselineRows.reduce((a,x)=>a+Math.min(100,Math.max(0,(num(x.durationMin)/480)*70+(num(x.stages?.DEEP)/90)*15+(num(x.stages?.REM)/90)*15)),0)/baselineRows.length:null,delta=sleepScore!=null&&baseline!=null?Math.round(sleepScore-baseline):null,restorative=num(last?.stages?.DEEP)+num(last?.stages?.REM),sleepWord=sleepScore==null?"Čekám na spánek":sleepScore>=85?"Silná regenerace":sleepScore>=65?"Použitelná regenerace":"Regenerace pod tlakem";
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
  $("sleepRows").innerHTML=layeredHistory(ss,x=>x.date||x.endTime,x=>'<div class="history-workout"><strong>'+esc(longDate(x.date||String(x.endTime).slice(0,10)))+' · '+hm(x.durationMin)+'</strong><div class="small">'+esc(x.startTime?new Date(x.startTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"—")+' → '+esc(x.endTime?new Date(x.endTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"—")+' · Deep '+hm(x.stages?.DEEP)+' · REM '+hm(x.stages?.REM)+'</div></div>');
}
function layeredHistory(records,dateOf,rowOf){
  const years={};(records||[]).forEach(r=>{const date=String(dateOf(r)||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;const y=date.slice(0,4),m=date.slice(0,7);(((years[y]||(years[y]={}))[m]||(years[y][m]=[]))).push(r);});
  return Object.keys(years).sort().reverse().map(y=>'<details '+(y==="2026"?"open":"")+'><summary>'+y+'</summary>'+Object.keys(years[y]).sort().reverse().map(m=>'<details><summary>'+new Intl.DateTimeFormat("cs-CZ",{month:"long",year:"numeric"}).format(new Date(m+"-01T12:00:00Z"))+'</summary><div class="history-sets">'+years[y][m].sort((a,b)=>String(dateOf(b)).localeCompare(String(dateOf(a)))).map(rowOf).join("")+'</div></details>').join("")+'</details>').join("")||'<div class="muted">Bez historie.</div>';
}
function renderHealth(){
  const w=state.weight||{},weightDisplay=v=>Number.isFinite(Number(v))&&Number(v)>0?fmt(v,1):"—",historical=(w.records||[]).filter(x=>String(x.sample_time||'').slice(0,10)<=selectedHistoryDate).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time))),lastWeight=historical.at(-1),mean=days=>{const values=historical.filter(x=>String(x.sample_time).slice(0,10)>=dateShift(selectedHistoryDate,-days+1)).map(x=>Number(x.value_numeric)).filter(x=>Number.isFinite(x)&&x>0);return values.length?values.reduce((s,x)=>s+x,0)/values.length:null;};
  $("hWeight").textContent=weightDisplay(lastWeight?.value_numeric);$("hAvg30").textContent=weightDisplay(mean(30));const latest=num(lastWeight?.value_numeric),avg7=num(mean(7)),avg30=num(mean(30)),diff=latest&&avg30?fmt(latest-avg30,1):null;$("weightSignal").textContent=diff==null?"bez baseline":(diff>=0?"+":"")+diff+" kg vs. 30 dní";
  const wr=(w.records||[]).filter(x=>num(x.value_numeric)>0&&/^\d{4}-\d{2}-\d{2}/.test(String(x.sample_time||""))).slice(-365);
  chartSvg("healthWeightChart",wr.map(x=>num(x.value_numeric)),[],wr.map(x=>dateLabel(String(x.sample_time).slice(0,10))),{W:760,H:300,axis:true,unit:" kg",decimals:1});
  $("weightTrendMeta").textContent=historical.length?"K "+dateLabel(selectedHistoryDate)+" "+weightDisplay(lastWeight?.value_numeric)+" kg · 7 dní "+weightDisplay(avg7)+" kg · 30 dní "+weightDisplay(avg30)+" kg.":"Bez záznamů hmotnosti.";
  const sessions=primarySleepSessions(state.sleep?.sessions).filter(s=>(s.date||String(s.endTime||'').slice(0,10))<=selectedHistoryDate),last=sessions[0],activityCount=state.activities?.count||0;$("healthContext").innerHTML='<div class="metric-line"><span>Hmotnost vs. 30 dní</span><strong>'+esc(diff==null?"—":(diff>=0?"+":"")+diff+" kg")+'</strong></div><div class="metric-line"><span>Poslední noc</span><strong>'+esc(last?hm(last.durationMin):"—")+'</strong></div><div class="metric-line"><span>Záznamy aktivit</span><strong>'+esc(activityCount)+'</strong></div><div class="notice" style="margin-top:12px">Trend hmotnosti a spánku je kontext pro rozhodnutí o zátěži; jednotlivý den není verdikt.</div>';
  $("weightHistory").innerHTML=layeredHistory(wr,x=>x.sample_time,x=>'<div class="history-workout"><strong>'+esc(longDate(String(x.sample_time).slice(0,10)))+'</strong><div class="small">'+fmt(x.value_numeric,1)+' kg · '+esc(x.source_family||"zdroj")+'</div></div>');
}
let gymSaveQueue=Promise.resolve();
let gymExerciseCatalog=[],visibleGymExercises=[],gymExerciseIndex=0;
function gymRowValues(tr){const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]),idx=Number(tr.dataset.row)+7;if(!values[idx])values[idx]=[];tr.querySelectorAll("input[data-col]").forEach(inp=>{const c=Number(inp.dataset.col);values[idx][c]=inp.type==="checkbox"?(inp.checked?"TRUE":"FALSE"):inp.value;});upgradeGymOptionsHeader(values);if(values[idx][11]==='TRUE'&&values[idx][8]==='TRUE')values[idx][7]='10';return {values,idx};}
function persistGymRow(tr){const {values}=gymRowValues(tr),used=values.slice(7);while(used.length&&used[used.length-1].every(v=>String(v??"").trim()===""))used.pop();const fullValues=values.slice(0,7).concat(used);gymSaveQueue=gymSaveQueue.then(async()=>{const result=await jsonFetch("/app/api/gym",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({values:used,fullValues,date:gymDay()})});state.gym={...state.gym,values:result.values||fullValues,history:result.history||state.gym?.history||[]};renderGym();renderGymHistory(state.gym.history);$("gymNotice").textContent=result.status==="error"?"Uložení do databáze selhalo: "+(result.message||"neznámá chyba"):"✓ Uloženo do Gym historie · "+new Date().toLocaleTimeString("cs-CZ");});return gymSaveQueue.catch(e=>{$("gymNotice").textContent="Uložení selhalo: "+e.message;throw e;});}
function renderGymHistory(history){$("gymHistory").innerHTML=layeredHistory(history,x=>x.workout_date||x.date||x.started_at,x=>'<div class="history-workout"><strong>'+esc(x.exercise||"Cvik")+'</strong><div class="small">'+esc(String(x.actual_kg??x.actualKg??x.weightKg??"—"))+' kg × '+esc(String(x.actual_reps??x.actualReps??x.reps??"—"))+'</div>'+(x.toFailure?'<span class="gym-set-badge">Do selhání</span>':'')+(x.superset?'<span class="gym-set-badge">Supersérie '+esc(x.superset)+'</span>':'')+'</div>');}
async function saveGymPlanValues(values){const rows=values.slice(7);while(rows.length&&rows[rows.length-1].every(v=>String(v??'').trim()===''))rows.pop();values=values.slice(0,7).concat(rows);await jsonFetch("/app/api/gym",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"plan",date:gymDay(),values})});state.gym={...state.gym,values};renderGym();}
function gymPlanEdit(action,idx,exercise){const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]);const rows=values.slice(7);if(action==="remove-set"){rows.splice(idx,1);}else if(action==="add-set"){const src=rows[idx]||["WORK","","1","","10","","","","FALSE","",""];const copy=src.slice();copy[2]=String(Number(src[2]||1)+1);copy[5]="";copy[6]="";copy[7]="";copy[8]="FALSE";rows.splice(idx+1,0,copy);}else if(action==="remove-exercise"){const ex=String(rows[idx]?.[1]||"");for(let i=rows.length-1;i>=0;i--)if(String(rows[i]?.[1]||"")===ex)rows.splice(i,1);}else if(action==="add-exercise"){const selected=gymExerciseCatalog.find(item=>item.name===exercise?.name);if(!selected||rows.some(row=>row[1]===selected.name))return;for(let n=1;n<=selected.sets;n++)rows.push(["WORK",selected.name,String(n),"",selected.reps,"","","","FALSE","",""]);}values.splice(7,values.length-7,...rows);saveGymPlanValues(values).then(()=>{if(action==='add-exercise')toast('Cvik přidán do plánu.');}).catch(e=>toast("Úprava plánu selhala: "+e.message));}
function renderGymExerciseChoices(){
  const query=$('gymExerciseSearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs').trim(),words=query.split(/\s+/).filter(Boolean),existing=new Set((state.gym?.values||[]).slice(7).map(row=>String(row?.[1]||'')));
  const recent=new Set((state.gym?.history||[]).slice(0,100).map(row=>String(row.exercise||'')));
  visibleGymExercises=gymExerciseCatalog.filter(item=>!existing.has(item.name)&&words.every(word=>[item.name,item.muscle,item.search].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs').includes(word))).sort((a,b)=>Number(recent.has(b.name))-Number(recent.has(a.name))||a.name.localeCompare(b.name,'cs')).slice(0,40);
  gymExerciseIndex=Math.min(gymExerciseIndex,Math.max(0,visibleGymExercises.length-1));
  $('gymExerciseResults').innerHTML=visibleGymExercises.map((item,i)=>'<button type="button" role="option" id="gymExerciseOption'+i+'" aria-selected="'+(i===gymExerciseIndex)+'" data-index="'+i+'" title="'+esc(item.note)+'"><strong>'+esc(item.name)+'</strong><small>'+esc(item.muscle)+' · '+esc(item.sets)+' × '+esc(item.reps)+(item.station?' · '+esc(item.station):'')+'</small></button>').join('');
  $('gymExerciseHint').textContent=visibleGymExercises.length?visibleGymExercises.length+' cviků k výběru · vybavení METAGYM Kutná Hora.':'Žádný další cvik v katalogu neodpovídá hledání.';
  $('gymExerciseSearch').setAttribute('aria-activedescendant',visibleGymExercises.length?'gymExerciseOption'+gymExerciseIndex:'');
}
async function openGymExercisePicker(){
  const dialog=$('gymExerciseDialog');$('gymExerciseSearch').value='';$('gymExerciseResults').innerHTML='';$('gymExerciseHint').textContent='Načítám katalog cviků…';dialog.showModal();$('gymExerciseSearch').focus();
  try{gymExerciseCatalog=(await jsonFetch('/app/api/gym/exercises')).exercises||[];gymExerciseIndex=0;renderGymExerciseChoices();}
  catch(error){$('gymExerciseHint').textContent='Katalog cviků se nepodařilo načíst: '+error.message;}
}
function chooseGymExercise(index){const item=visibleGymExercises[index];if(!item)return;$('gymExerciseDialog').close();gymPlanEdit('add-exercise',0,item);}
function renderGym(){const values=state.gym?.values||[];const rows=values.slice(7).filter(r=>r.some(v=>String(v??"").trim()!==""));$("gymMeta").textContent=(values[2]?.[1]||"Silový trénink")+" · "+(gymDay()===pragueToday()?"dnes":longDate(gymDay()));$("gymNotice").textContent=rows.length?rows.filter(r=>String(r[0]||"")==="WORK").length+" pracovních řádků · plán i výsledky jsou v interní databázi":"Dnešní plán je prázdný. Přidej cvik nebo vygeneruj plán.";const start=values.slice(7).findIndex(r=>r.some(v=>String(v??"").trim()!==""));const actualRows=start<0?[]:values.slice(7+start);$("gymRows").innerHTML=actualRows.map((r,i)=>{const idx=i+(start<0?0:start),type=r[0]||"",exercise=r[1]||"";const rawVideo=state.gym?.videoLinks?.[idx+7]||r[10]||"";const formula=String(rawVideo);const formulaUrl=formula.match(/HYPERLINK\(\s*"([^"]+)"/i)?.[1]||"";const video=/^https?:\/\//i.test(formula)?formula:formulaUrl||("https://www.youtube.com/results?search_query="+encodeURIComponent(String(exercise||"")+" exercise technique"));const prev=actualRows[i-1]||[],next=actualRows[i+1]||[],kind=String(type).toUpperCase()==='WARMUP'?'WARMUP':'WORK';return '<tr data-row="'+idx+'" data-type="'+kind+'" class="'+(prev[1]===exercise?'':'gym-first ')+(next[1]===exercise?'':'gym-last')+'"><td><span class="gym-type">'+esc(type)+'</span></td><td><strong>'+esc(exercise)+'</strong></td><td>'+esc(r[2]||"")+'</td><td>'+esc(r[3]||"")+'</td><td>'+esc(r[4]||"")+'</td><td><input data-col="5" value="'+esc(r[5]||"")+'" inputmode="decimal"></td><td><input data-col="6" value="'+esc(r[6]||"")+'" inputmode="numeric"></td><td><input data-col="7" value="'+esc(r[7]||"")+'" inputmode="decimal"></td><td><input data-col="8" type="checkbox" '+(String(r[8]).toUpperCase()==="TRUE"||r[8]===true?"checked":"")+'></td>'+gymOptionsCell(r)+'<td class="gym-video-cell"><a href="'+esc(video)+'" target="_blank" rel="noopener noreferrer">▶ Video</a></td><td class="gym-actions-cell"><button class="btn gym-action" data-action="add-set" data-idx="'+idx+'">+ série</button> <button class="btn gym-action" data-action="remove-set" data-idx="'+idx+'">− série</button> <button class="btn gym-action" data-action="remove-exercise" data-idx="'+idx+'">🗑 cvik</button></td></tr>'}).join("")||'<tr><td colspan="12" class="muted">Žádný plán.</td></tr>'}
// The gym plan of the chosen day (today unless another day is picked).
function gymDay(){return state.gymDate||pragueToday()}
async function loadGym(){state.gym=await jsonFetch("/app/api/gym"+(gymDay()!==pragueToday()?"?date="+gymDay():""));renderGym();renderGymHistory(state.gym.history||[])}
async function saveGym(){const b=$("saveGym");b.disabled=true;b.textContent="Ukládám…";try{for(const tr of document.querySelectorAll("#gymRows tr[data-row]"))await persistGymRow(tr);await loadGym();toast("Trénink uložen a historie obnovena");}catch(e){toast("Uložení selhalo: "+e.message)}finally{b.disabled=false;b.textContent="Uložit trénink"}}
async function generateGym(){const b=$("generateGym");b.disabled=true;b.textContent="Generuji…";try{await jsonFetch("/app/api/gym/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:gymDay()})});toast("Dnešní plán vygenerován");await loadGym()}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent="Generovat"}}
const selectedGymMuscles=new Set();
function renderGymFocus(){
  document.querySelectorAll('.gym-focus-builder [data-muscle]').forEach(el=>el.setAttribute('aria-pressed',String(selectedGymMuscles.has(el.dataset.muscle))));
  $('gymFocusCount').textContent=selectedGymMuscles.size+' / 5 partií';
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
  const button=$('generateFocusedGym');button.disabled=true;button.textContent='Generuji…';
  $('gymFocusStatus').textContent='Sestavuji trénink podle zvolených partií a dostupné zátěže…';
  try{
    const result=await jsonFetch('/app/api/gym/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:gymDay(),focusMuscles:[...selectedGymMuscles],durationMinutes:Number($('gymFocusDuration').value)})});
    await loadGym();
    $('gymFocusStatus').textContent=result.rationale||'Cílený plán je připraven.';
    toast('Cílený plán vygenerován');
  }catch(error){$('gymFocusStatus').textContent='Generování selhalo: '+error.message;toast(error.message)}
  finally{button.disabled=false;button.textContent='Generovat pro vybrané partie';}
}
window.addEventListener("error",e=>{try{toast("Chyba aplikace: "+(e.error?.message||e.message||"neznámá chyba"))}catch{}});
window.addEventListener("unhandledrejection",e=>{try{toast("Chyba aplikace: "+(e.reason?.message||String(e.reason||"Promise rejected")))}catch{}});
function workoutSport(){return state.workoutSport==='run'?'run':'ride'}
function capabilityLabel(system,sport=workoutSport()){return (sport==='run'?{recovery:"Regenerace",endurance:"Lehký / dlouhý běh",tempo:"Tempo",threshold:"Práh",vo2max:"VO₂max",anaerobic:"Rychlost",sprint:"Sprinty do kopce"}:{recovery:"Regenerace",endurance:"Vytrvalost",tempo:"Tempo",sweet_spot:"Sweet spot",threshold:"Práh",vo2max:"VO₂max",anaerobic:"Anaerobní",sprint:"Sprint"})[system]||system}
// Kolo / Běh switch: one sport for the generator and the library.
// Kolo / Běh / Gym: the endurance generator and library, or the gym builder.
function setWorkoutSport(sport){
  state.workoutSport=['run','gym'].includes(sport)?sport:'ride';const run=state.workoutSport==='run',gym=state.workoutSport==='gym';
  document.querySelectorAll('.sport-switch [data-sport]').forEach(b=>{const on=b.dataset.sport===state.workoutSport;b.classList.toggle('primary',on);b.setAttribute('aria-pressed',String(on))});
  const eyebrow=$('workoutsEyebrow');if(eyebrow)eyebrow.textContent=gym?'Strength · posilovna':'Adaptive library · '+(run?'running':'cycling');
  $('workoutsEndurance').hidden=gym;$('workoutsGym').hidden=!gym;
  document.querySelectorAll('#workoutSystem option').forEach(o=>{if(o.value)o.textContent=capabilityLabel(o.value);if(o.hasAttribute('data-ride-only')){o.hidden=run;if(run&&o.selected)$('workoutSystem').value=''}});
  $('generatedWorkout').innerHTML='';
  try{localStorage.setItem('pfdWorkoutSport',state.workoutSport)}catch{}
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
    return '<g><title>'+fmt(duration,1)+' min · '+fmt(from)+'–'+fmt(to)+(workout.sport==='run'?' % prahového tempa':' % FTP')+'</title>'+shape+'</g>';
  }).join('');
  return '<div class="workout-profile"><div class="workout-profile-head"><span>'+(workout.sport==='run'?'Profil tempa':'Profil výkonu')+'</span><strong>'+hm(total)+'</strong></div><svg role="img" aria-label="Profil cílového výkonu v čase" viewBox="0 0 1000 84" preserveAspectRatio="none"><path d="M0 42H1000 M0 76H1000" stroke="#40505f" stroke-width="1"/>'+bars+'</svg><div class="workout-profile-foot"><span>0 min</span><span>'+Math.round(total)+' min</span></div></div>';
}
// Level 1–10 per training system, learned from rated library workouts.
function renderWorkoutCapabilities(capabilities={}){
  const el=$("workoutCapabilities");if(!el)return;
  const order=workoutSport()==='run'?["endurance","tempo","threshold","vo2max","anaerobic","sprint","recovery"]:["endurance","tempo","sweet_spot","threshold","vo2max","anaerobic","sprint","recovery"];
  const rows=order.map(k=>({k,...(capabilities[k]||{level:3,confidence:.2,attempts:0})}));
  if(rows.every(x=>!num(x.attempts))){el.innerHTML='<div class="notice" style="grid-column:1/-1">Zatím nekalibrováno: všechny systémy začínají na úrovni 3 z 10. Úroveň se začne upravovat po prvních odjetých workoutech z knihovny, ke kterým doplníš RPE. Do té doby trenér vybírá obtížnost opatrně.</div>';return}
  el.innerHTML=rows.map(x=>'<div class="capability-card"><span class="label">'+esc(capabilityLabel(x.k))+'</span><strong>'+fmt(x.level,1)+' <span class="small">/ 10</span></strong><div class="capability-bar"><i style="width:'+Math.min(100,num(x.level)*10)+'%"></i></div><div class="small">jistota '+Math.round(num(x.confidence,.2)*100)+' % · '+num(x.attempts)+' '+(num(x.attempts)===1?'hodnocení':num(x.attempts)>=2&&num(x.attempts)<=4?'hodnocení':'hodnocení')+'</div></div>').join("");
}
function renderWorkoutLibrary(result){
  renderWorkoutCapabilities(result.capabilities||{});
  const ctx=result.rankingContext||{},context=$("workoutRankingContext");
  const readinessWord={green:'dobrá',yellow:'střední',red:'nízká'}[ctx.readiness]||'—',pick=result.coachPick||{};
  if(context)context.innerHTML='<strong>Podle čeho řadím:</strong> připravenost '+esc(readinessWord)+(Number.isFinite(Number(ctx.tsb))?' · forma (TSB) '+fmt(ctx.tsb,1):'')+' · kvalitní dny za 7 dní '+num(ctx.hardBikeDaysRolling7d)+(pick.system?' · trenér na dnešek doporučuje '+esc(capabilityLabel(pick.system))+(pick.durationMinutes?' kolem '+hm(pick.durationMinutes):''):'')+'.';
  const el=$("workoutResults"),rows=result.workouts||[];
  if(!rows.length){el.innerHTML='<div class="notice">Pro tuto kombinaci filtrů jsem nenašel vhodný workout. Zvětši toleranci délky nebo zruš limit obtížnosti.</div>';return}
  // A short list first; the rest on request.
  const shown=state.workoutShowAll?rows:rows.slice(0,5);
  el.innerHTML=shown.map((w,i)=>{
    const reason=(w.reasons||[]).slice(0,4).join(" · ");
    return '<article class="workout-result" data-workout-id="'+esc(w.id)+'"><div><div class="workout-result-head"><div><div class="eyebrow">#'+(i+1)+' · '+esc(capabilityLabel(w.primary_system))+'</div><h3 style="margin:3px 0">'+esc(w.name)+'</h3></div><div><div class="workout-score">'+num(w.suitability)+'%</div><div class="small">vhodnost</div></div></div><div class="workout-meta"><span class="pill">'+num(w.duration_minutes)+' min</span><span class="pill">load '+Math.round(num(w.target_load))+'</span><span class="pill">IF '+fmt(w.intensity_factor,2)+'</span><span class="pill">obtížnost '+fmt(w.difficulty,1)+'</span><span class="pill">tvoje úroveň '+fmt(w.capability_level,1)+'</span>'+(w.sport==='run'?'':'<span class="pill">'+esc(w.cadence||"kadence dle bloku")+'</span>')+'</div>'+workoutProfile(w)+'<details class="explain-block"><summary>Rozpis kroků</summary>'+(()=>{const a=result.athlete||{};if(w.sport==='run')return stepTableHtml(w.steps||[],null,{sport:'run',pace:a.runThresholdPace});const ftp=a[w.environment==='indoor'&&a.indoorFtp?'indoorFtp':'ftp']||null;return stepTableHtml(w.steps||[],ftp)})()+'</details><p>'+esc(w.description||"")+'</p><div class="reason">'+esc(reason||"Seřazeno podle cíle, tvé úrovně a aktuálního kontextu.")+'</div></div><div><details class="workout-details"><summary>Intervalový předpis</summary><div class="workout-structure">'+esc(w.intervals_description||"")+'</div></details><button class="btn primary schedule-workout" data-id="'+esc(w.id)+'" style="width:100%;margin-top:10px">Přidat na vybraný den</button></div></article>'
  }).join("")+(rows.length>shown.length?'<button class="btn more-results" type="button" id="moreWorkouts">Zobrazit další ('+(rows.length-shown.length)+')</button>':'');
  const more=$('moreWorkouts');if(more)more.onclick=()=>{state.workoutShowAll=true;renderWorkoutLibrary(result)};
}
// Completion comes from the activity paired in Intervals.icu; the athlete adds RPE and a note.
function renderScheduledWorkouts(rows){
  const el=$("scheduledWorkouts"),today=pragueToday();
  el.innerHTML=rows.length?rows.map(w=>{
    const reviewed=Boolean(w.feedback_id),paired=w.status==='completed'||w.completed_percent!=null,due=w.scheduled_date<=today;
    const done=w.completed_percent!=null?' · dokončeno '+Math.round(num(w.completed_percent))+' %':'';
    const status=reviewed?'Hodnoceno · RPE '+(w.feedback_rpe!=null?fmt(w.feedback_rpe,1):'—')+done:paired?'Spárováno s aktivitou v Intervals.icu'+done:due?'Čekám na aktivitu z Intervals.icu':'Naplánováno';
    const note=reviewed&&(state.coachNotes||[]).find(r=>r.workoutId===w.workout_id&&r.date===w.scheduled_date);
    return '<article class="scheduled-workout" data-id="'+esc(w.workout_id)+'" data-date="'+esc(w.scheduled_date)+'"><div><strong>'+esc(w.name)+'</strong><div class="small">'+esc(longDate(w.scheduled_date))+' · '+esc(capabilityLabel(w.primary_system,w.sport))+' · '+num(w.duration_minutes)+' min · '+status+'</div>'+(note?'<p class="coach-note-inline">💬 '+esc(note.text)+'</p>':'')+'</div>'+
      (reviewed?'<span class="small">✓ Uloženo</span>':due?'<form class="workout-feedback rpe-form"><label><span class="small">RPE 1–10 <button type="button" class="info-tip" data-info="rpe" aria-label="Vysvětlivka: RPE">i</button></span><input name="rpe" type="number" min="1" max="10" step="1" required></label><label><span class="small">Pocit / poznámka (volitelně)</span><input name="notes" type="text" maxlength="300" placeholder="např. těžké nohy, horko"></label><button class="btn primary" type="submit">Uložit RPE</button></form>':'<span class="small">'+(w.sport==='run'?'Čeká na běh':'Čeká na jízdu')+'</span>')+(!paired&&!reviewed&&w.intervals_event_id?'<button type="button" class="btn" data-delete-event="'+esc(w.intervals_event_id)+'" data-name="'+esc(w.name)+'">Smazat</button>':'')+'</article>';
  }).join(''):'<div class="small">Zatím není naplánovaný žádný workout.</div>';
}
async function loadScheduledWorkouts(){
  try{const [result,notes]=await Promise.all([jsonFetch('/app/api/workouts/scheduled'),jsonFetch('/app/api/coach/reflections').catch(()=>({}))]);state.coachNotes=notes.reflections||[];renderScheduledWorkouts(result.workouts||[])}
  catch(error){$('scheduledWorkouts').innerHTML='<div class="notice status-error">'+esc(error.message)+'</div>'}
}
async function loadWorkoutLibrary(){
  const date=$("workoutScheduleDate");if(date&&!date.value)date.value=pragueToday();if(date)date.min=pragueToday();
  const p=new URLSearchParams(),system=$("workoutSystem")?.value,duration=$("workoutDuration")?.value,tol=$("workoutDurationTolerance")?.value,load=$("workoutLoad")?.value,difficulty=$("workoutDifficulty")?.value,phase=$("workoutPhase")?.value;
  p.set("sport",workoutSport());if(system)p.set("system",system);p.set("environment",$("workoutEnvironment")?.value||"outdoor");if(duration){p.set("duration",duration);if(tol)p.set("durationTolerance",tol);}if(load)p.set("load",load);if(difficulty)p.set("maxDifficulty",difficulty);if(phase)p.set("phase",phase);if(date?.value)p.set("date",date.value);p.set("limit","15");
  $("workoutResults").innerHTML='<div class="small">Počítám vhodnost workoutů…</div>';state.workoutShowAll=false;
  try{const r=await jsonFetch("/app/api/workouts/search?"+p.toString());state.workoutLibrary=r;renderWorkoutLibrary(r);await loadScheduledWorkouts()}
  catch(e){$("workoutResults").innerHTML='<div class="notice status-error">'+esc(e.message)+'</div>'}
}
async function scheduleLibraryWorkout(id,dateOverride=null,environment=null){
  const date=dateOverride||$("workoutScheduleDate")?.value;if(!date){toast("Vyber datum.");return}
  const row=[...(state.workoutLibrary?.workouts||[]),state.generated?.workout,...(state.generated?.alternatives||[])].find(x=>x&&x.id===id),name=row?.name||id;
  if(!window.confirm('Přidat „'+name+'“ na '+date+' do Intervals.icu?'))return;
  try{const r=await jsonFetch("/app/api/workouts/schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workoutId:id,date,confirm:true,environment:environment||$("workoutEnvironment")?.value||"outdoor"})});toast(r.status==='already_scheduled'?'Workout už je na tento den naplánovaný.':r.workout.name+' přidán do Intervals.icu na '+r.date);await loadScheduledWorkouts()}
  catch(e){toast("Zápis do Intervals.icu selhal: "+e.message)}
}
async function saveWorkoutFeedback(form){
  const row=form.closest('.scheduled-workout'),button=form.querySelector('button[type=submit]');
  button.disabled=true;
  try{
    const body={workoutId:row.dataset.id,scheduledDate:row.dataset.date,rpe:Number(form.elements.rpe.value),notes:form.elements.notes.value};
    const r=await jsonFetch('/app/api/workouts/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    toast(r.intervals?.status==='ok'?'RPE je uložené i u aktivity v Intervals.icu.':r.intervals?.status==='error'?'RPE je uložené; zápis do Intervals.icu selhal: '+r.intervals.message:'RPE je uložené.');await loadWorkoutLibrary();if(r.reflection==='pending'){toast('Uloženo. Kouč teď připravuje zpětnou vazbu…');awaitReflection(body.scheduledDate);}
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
    return '<div class="step-table-wrap"><table class="step-table"><thead><tr><th>Čas</th><th>% prahu</th><th>Tempo'+(opts.pace?' (práh '+esc(fmtPace(opts.pace))+' /km)':'')+'</th><th>Zóna</th><th>Poznámka</th></tr></thead><tbody>'+
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
    '<div class="workout-meta"><span class="pill">'+hm(num(w.duration_minutes))+'</span><span class="pill">load '+Math.round(num(w.target_load))+'</span><span class="pill">IF '+fmt(w.intensity_factor,2)+'</span><span class="pill">obtížnost '+fmt(w.difficulty,1)+'</span>'+(x.ftp?'<span class="pill">FTP '+esc(x.ftp)+' W</span>':'')+(x.thresholdPace?'<span class="pill">práh '+esc(fmtPace(x.thresholdPace))+' /km</span>':'')+'</div>'+
    '<p>'+esc(w.description||"")+'</p>'+
    '<div class="explain-grid">'+explainList('Proč tento trénink',x.why)+explainList('Jak ho jet',x.how)+explainList(r.environment==='outdoor'?'Venku':run?'Na páse':'Na trenažéru',x.environment)+explainList('Jídlo a pití',x.fueling)+'</div>'+
    '<h4 style="margin:14px 0 6px">Rozpis</h4>'+stepTableHtml(x.steps||[],x.ftp,stepOpts)+workoutProfile(w)+
    '<p class="small">Zdroj: '+source+'</p>'+
    (r.existing?'<p class="notice">Alternativa k naplánovanému tréninku. Změnu prober s asistentem nebo uprav původní událost v kalendáři.</p>':'')+
    '<div class="workout-filter-actions" style="margin-top:10px;flex-wrap:wrap">'+(!r.existing?'<button class="btn primary" id="scheduleGenerated">Přidat do Intervals.icu</button>':'')+(r.variantCount>1?'<button class="btn" id="anotherGenerated">Jiný návrh</button>':'')+'<label class="small" style="display:flex;gap:6px;align-items:center">Délka <input id="resizeMinutes" type="number" min="'+(run?20:30)+'" max="'+(run?240:360)+'" step="5" value="'+num(w.duration_minutes)+'" style="width:80px;background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px"> min</label><button class="btn" id="resizeGenerated" title="Stejný trénink, jen jiná délka – hlavní série zůstává">Změnit délku</button></div></div></article>'+
    (r.alternatives?.length?'<div class="small" style="margin-top:8px">Další možnosti: '+r.alternatives.map(a=>esc(a.name)).join(' · ')+'</div>':'');
  const schedule=$("scheduleGenerated");if(schedule)schedule.onclick=()=>scheduleLibraryWorkout(w.id,r.date,r.environment);
  const again=$("anotherGenerated");if(again)again.onclick=()=>generateWorkoutForDay((state.generatedVariant||0)+1);
  $("resizeGenerated").onclick=()=>resizeGeneratedWorkout(w.id,Number($("resizeMinutes").value));
}
// Same proposal, another length: the main set stays, the aerobic part changes.
async function resizeGeneratedWorkout(id,minutes){
  if(!(minutes>0)){toast('Zadej délku v minutách.');return}
  const b=$("resizeGenerated");b.disabled=true;b.textContent='Upravuji…';
  try{
    const body={date:state.generated?.date||$("generateDate")?.value||pragueToday(),environment:$("generateEnvironment").value,sport:workoutSport(),workoutId:id,resizeTo:minutes};
    const r=await jsonFetch("/app/api/workouts/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    r.existing=state.generated?.existing;state.generated=r;renderGeneratedWorkout(r);
  }catch(e){toast(e.message);b.disabled=false;b.textContent='Změnit délku'}
}
async function generateWorkoutForDay(variant=0){
  const revision=statusCoachingRevision;
  const b=$("generateWorkoutBtn"),date=$("generateDate");if(date&&!date.value)date.value=pragueToday();
  b.disabled=true;$("generatedWorkout").innerHTML='<div class="small">Trenér vybírá trénink…</div>';
  try{
    const body={date:date?.value||pragueToday(),environment:$("generateEnvironment").value,variant,sport:workoutSport()};
    const minutes=Number($("generateMinutes").value);if(minutes>0)body.availabilityMinutes=minutes;
    const r=await jsonFetch("/app/api/workouts/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(revision!==statusCoachingRevision)return;
    r.existing=state.generated?.existing&&state.generated.date===r.date&&state.generated.sport===r.sport;state.generated=r;state.generatedVariant=variant;renderGeneratedWorkout(r);
  }catch(e){if(revision===statusCoachingRevision)$("generatedWorkout").innerHTML='<div class="notice status-error">'+esc(e.message)+'</div>'}
  finally{b.disabled=false}
}
let dashboardLoadRevision=0;
function renderLoadedData(key){
  const renderers=key==='coaches'?[renderCoachCouncil]:key==='gym'?[renderGym]:key==='nutrition'?[renderNutrition]:key==='athleteState'?[renderAthleteStatus,renderCoachMemories,renderToday]:
    key==='week'?[renderTraining,renderToday]:key==='sleep'?[renderOverview,renderRecovery,renderHealth,renderToday]:key==='fitness'?[renderOverview,renderTraining,renderRecovery,renderHealth,renderToday]:
    key==='daily'?[renderOverview,renderNutrition,renderToday]:[renderOverview,renderHealth];
  for(const render of renderers){try{render();}catch{/* Other inputs may still be arriving. */}}
}
async function load(){
  const revision=++dashboardLoadRevision,statusRevision=statusCoachingRevision,date=selectedHistoryDate;
  $('topStatus').textContent='Načítám…';
  const jobs=[['athleteState','/app/api/athlete-state'],['daily','/app/api/daily?date='+date],['coaches','/app/api/coaches?date='+date],['fitness','/app/api/fitness?days=90'],['week','/app/api/week?start='+weekStart],['weight','/app/api/weight'],['activities','/app/api/activities'],['nutrition','/app/api/nutrition?start=2026-01-01&end='+dateShift(pragueToday(),1)],['sleep','/app/api/sleep?start='+dateShift(pragueToday(),-365)+'&end='+dateShift(pragueToday(),1)],['gym','/app/api/gym?date='+gymDay()]];
  const results=await Promise.allSettled(jobs.map(async([key,url])=>{
    const result=await jsonFetch(url);
    if(revision!==dashboardLoadRevision||date!==selectedHistoryDate)return;
    if(['athleteState','coaches'].includes(key)&&statusRevision!==statusCoachingRevision)return;
    state[key]=key==='athleteState'?result.state:result;renderLoadedData(key);
  }));
  if(revision!==dashboardLoadRevision)return;
  const failed=results.filter(r=>r.status==='rejected').length;
  loadInbox().catch(()=>{});
  $('topStatus').textContent=failed===0?'Live · '+new Date().toLocaleTimeString('cs-CZ'):failed<jobs.length?'Částečně načteno':'Data nejsou dostupná';
  $('topStatus').className=failed===0?'status-label small':failed<jobs.length?'status-label small status-partial':'status-label small status-error';
  if(failed)toast('Některá datová služba není dostupná.');
}
document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>{activate(b.dataset.view);if(b.dataset.view==="workouts")openWorkouts();});
$("searchWorkouts").onclick=loadWorkoutLibrary;
document.querySelectorAll('.sport-switch [data-sport]').forEach(b=>b.onclick=()=>{setWorkoutSport(b.dataset.sport);if(state.workoutSport==='gym')loadGym().catch(e=>toast(e.message));else loadWorkoutLibrary()});
{let saved='ride';try{saved=localStorage.getItem('pfdWorkoutSport')||'ride'}catch{}setWorkoutSport(saved);}
$("generateWorkoutBtn").onclick=()=>generateWorkoutForDay(0);{const d=$("generateDate");if(d){d.value=pragueToday();d.min=pragueToday();}}
$("workoutResults").addEventListener("click",e=>{const b=e.target.closest(".schedule-workout");if(b)scheduleLibraryWorkout(b.dataset.id);});
$("scheduledWorkouts").addEventListener("submit",e=>{if(e.target.matches('.workout-feedback')){e.preventDefault();saveWorkoutFeedback(e.target)}});
["workoutSystem","workoutDurationTolerance","workoutDifficulty","workoutPhase","workoutScheduleDate"].forEach(id=>{const el=$(id);if(el)el.onchange=()=>{if(document.getElementById("workouts").classList.contains("active"))loadWorkoutLibrary()}});
$('refresh').onclick=async()=>{
  const b=$('refresh');b.disabled=true;b.textContent='Synchronizuji…';
  try{
    const started=await jsonFetch('/app/api/sync',{method:'POST'});let status=started.status==='accepted'?'running':started.status;
    for(let i=0;i<30&&status==='running';i++){
      await new Promise(resolve=>setTimeout(resolve,2000));
      const current=await jsonFetch('/app/api/sync');status=current.status;
      if(i%5===4&&status==='running')await refreshCoachLifecycle();
    }
    b.textContent='Obnovuji…';await load();
    toast(status==='running'?'Synchronizace pokračuje na pozadí; doporučení průběžně obnovujeme.':status==='partial'||status==='error'?'Část služeb se neobnovila. Dostupná data jsou načtená.':status==='idle'?started.message||'Není co synchronizovat.':'Nová data jsou načtená.');
  }catch(error){toast('Synchronizace selhala: '+error.message);}
  finally{b.disabled=false;b.textContent='Obnovit';}
};
$("prevWeek").onclick=()=>{weekStart=dateShift(weekStart,-7);selectedHistoryDate=weekStart;load()};
$("nextWeek").onclick=()=>{weekStart=dateShift(weekStart,7);selectedHistoryDate=weekStart;load()};
$("thisWeek").onclick=()=>{weekStart=pragueMonday();selectedHistoryDate=weekStart;load()};
$("saveGym").onclick=saveGym;$("generateGym").onclick=generateGym;$("addGymExercise").onclick=openGymExercisePicker;$("gymRows").addEventListener("click",e=>{const b=e.target.closest(".gym-action");if(b)gymPlanEdit(b.dataset.action,Number(b.dataset.idx));});
$('gymFocusChoices').addEventListener('click',e=>{const choice=e.target.closest('[data-muscle]');if(choice)toggleGymMuscle(choice.dataset.muscle);});
document.querySelector('.gym-figures').addEventListener('click',e=>{const muscle=e.target.closest('[data-muscle]');if(muscle)toggleGymMuscle(muscle.dataset.muscle);});
document.querySelector('.gym-figures').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const muscle=e.target.closest('[data-muscle]');if(muscle){e.preventDefault();toggleGymMuscle(muscle.dataset.muscle);}}});
document.querySelector('.gym-view-switch').addEventListener('click',e=>{
  const side=e.target.closest('[data-side]')?.dataset.side;
  if(!['front','back'].includes(side))return;
  document.querySelectorAll('.gym-view-switch [data-side]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.side===side)));
  document.querySelectorAll('.gym-figure[data-side]').forEach(figure=>figure.classList.toggle('active',figure.dataset.side===side));
});
$('generateFocusedGym').onclick=generateFocusedGym;
$("closeGymExercise").onclick=()=>$("gymExerciseDialog").close();$("gymExerciseSearch").oninput=()=>{gymExerciseIndex=0;renderGymExerciseChoices();};$("gymExerciseResults").onclick=e=>{const option=e.target.closest('[data-index]');if(option)chooseGymExercise(Number(option.dataset.index));};$("gymExerciseSearch").onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!visibleGymExercises.length)return;gymExerciseIndex=(gymExerciseIndex+(e.key==='ArrowDown'?1:-1)+visibleGymExercises.length)%visibleGymExercises.length;renderGymExerciseChoices();$('gymExerciseResults').querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'){e.preventDefault();chooseGymExercise(gymExerciseIndex);}};
$('closeAssistant').onclick=()=>$('assistantDialog').close();
$('assistantDialog').addEventListener('close',()=>$('floatingAssistant')?.classList.remove('is-open'));
$('assistantMessage').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!$('assistantForm').querySelector('[type=submit]').disabled)$('assistantForm').requestSubmit();}});
// "Měl jsem snickers": the assistant's draft of food entries, logged only on confirmation.
function renderFoodDraft(message,result){
  const d=result.draft,items=d.items,mealOptions=v=>mealSlots.map(m=>'<option value="'+m.id+'"'+(m.id===v?' selected':'')+'>'+esc(m.name)+'</option>').join('');
  const guess=()=>{const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',hourCycle:'h23'}).format(new Date()));return h<10?'breakfast':h<12?'snack_am':h<15?'lunch':h<18?'snack_pm':'dinner'};
  const per=(p,g,k)=>p&&p[k]!=null?Math.round(Number(p[k])*Number(g)/10)/10:null;
  const row=(it,i)=>'<div class="food-draft-row" data-i="'+i+'"><div><strong>'+esc(it.name)+'</strong><small>'+(it.product?(it.product.source==='personal'?'uložená potravina':'dohledáno AI'+(it.product.confidence?' · jistota '+esc({high:'vysoká',medium:'střední',low:'nízká'}[it.product.confidence]||it.product.confidence):'')+(it.product.sources?.length?' · <a href="'+esc(it.product.sources[0].url)+'" target="_blank" rel="noopener noreferrer">zdroj</a>':'')):'hodnoty nenalezeny, zadej je ve Výživě')+(it.portion?' · '+esc(it.portion):'')+'</small></div>'+(it.product&&it.basis!=='portion'?'<label><input type="number" min="1" max="5000" value="'+it.grams+'" data-grams> '+esc(it.basis)+'</label><span data-kcal>'+fmt(per(it.product,it.grams,'calories_100g'))+' kcal</span>':'<span></span><span>—</span>')+'</div>';
  $('assistantConversation').querySelector('.food-draft')?.remove();
  $('assistantConversation').insertAdjacentHTML('beforeend','<div class="notice food-draft"><p>'+esc(result.answer)+'</p>'+items.map(row).join('')+'<div class="food-draft-foot"><label class="small">Den <input type="date" id="foodDraftDate" value="'+esc(d.date)+'" max="'+pragueToday()+'"></label><label class="small">Jídlo <select id="foodDraftMeal">'+mealOptions(items.find(i=>i.meal)?.meal||guess())+'</select></label><button class="btn primary" type="button" id="foodDraftSave">Zapsat do jídelníčku</button></div></div>');
  $('assistantConversation').querySelectorAll('[data-grams]').forEach(input=>input.oninput=()=>{const r=input.closest('.food-draft-row'),it=items[Number(r.dataset.i)];it.grams=Number(input.value)||0;r.querySelector('[data-kcal]').textContent=fmt(per(it.product,it.grams,'calories_100g'))+' kcal';});
  $('assistantStatus').textContent='Nic není zapsané, dokud zápis nepotvrdíš.';
  $('foodDraftSave').onclick=async()=>{const b=$('foodDraftSave');b.disabled=true;let done=0;try{for(const it of items){if(!it.product||!(it.grams>0))continue;const unit=it.product.nutrition_basis==='portion'?'portion':it.basis;await jsonFetch('/app/api/food/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:it.product,quantity:unit==='portion'?1:it.grams,unit,date:$('foodDraftDate').value,mealType:$('foodDraftMeal').value})});done++;if(it.product.source==='ai')await rememberAiFood(it.product);}
    $('assistantStatus').textContent='Zapsáno '+done+' z '+items.length+' položek.';b.textContent='✓ Zapsáno';await load();await loadEnteredFood();}catch(error){$('assistantStatus').textContent='Zápis selhal: '+error.message;b.disabled=false;}};
}
$('viewDate').max=pragueToday();$('viewDate').value=selectedHistoryDate;
async function selectDay(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>pragueToday())return;selectedHistoryDate=date;weekStart=mondayOf(date);$('viewDate').value=date;$('nextDay').disabled=date>=pragueToday();await load();}
$('previousDay').onclick=()=>selectDay(dateShift(selectedHistoryDate,-1));$('nextDay').onclick=()=>selectDay(dateShift(selectedHistoryDate,1));$('viewDate').onchange=e=>selectDay(e.target.value);
$("gymRows").addEventListener("change",e=>{if(e.target.matches('[data-superset]')){setGymSuperset(Number(e.target.closest('tr').dataset.row)+7,e.target.value).catch(error=>toast(error.message));return;}if(e.target.matches("input[data-col]")){const tr=e.target.closest("tr[data-row]");if(tr)persistGymRow(tr).catch(()=>{});}});
$("gymRows").addEventListener("input",e=>{if(e.target.matches("input[data-col]:not([type=checkbox])")){const tr=e.target.closest("tr[data-row]");if(!tr)return;clearTimeout(tr._saveTimer);tr._saveTimer=setTimeout(()=>persistGymRow(tr).catch(()=>{}),700);}});

$("sleepRange").onchange=()=>{renderRecovery();renderDetails();};

// Shared metric detail: actual observations, previous 30-day baseline, range and point inspection.
let detailRanges={sleep:30,hrv:30,rhr:30,weight:30,load:30,strength:90};
let selectedStrengthExercise='';
function measured(v){return v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));}
function mean(rows){return rows.length?rows.reduce((s,r)=>s+r.value,0)/rows.length:null;}
function metricDetail(id,title,rows,unit,color){
  const el=$(id);if(!el)return;
  rows=rows.filter(r=>measured(r.value)&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)).map(r=>({...r,value:Number(r.value)})).sort((a,b)=>a.date.localeCompare(b.date));
  const range=detailRanges[id.replace("detail-","")]||30,shown=rows.filter(r=>r.date>=dateShift(pragueToday(),-range+1)),last=rows.at(-1),prior=last?rows.filter(r=>r.date<last.date&&r.date>=dateShift(last.date,-30)):[],avg=mean(prior),std=prior.length>1?Math.sqrt(prior.reduce((s,r)=>s+(r.value-avg)**2,0)/prior.length):null;
  const value=v=>v==null?"—":fmt(v,1)+" "+unit,delta=last&&avg!=null?last.value-avg:null;
  el.innerHTML='<div class="detail-heading"><div><div class="label">Osobní trend</div><h3>'+esc(title)+'</h3></div><div class="range-tabs">'+[7,30,90].map(n=>'<button class="btn '+(n===range?'selected':'')+'" data-range="'+n+'">'+n+' dní</button>').join('')+'</div></div><div class="detail-stats"><div><span>Poslední záznam</span><strong style="color:'+color+'">'+value(last?.value)+'</strong><small>'+esc(last?longDate(last.date):"Bez měření")+'</small></div><div><span>Baseline · předchozích 30 dní</span><strong>'+value(avg)+'</strong><small>'+prior.length+' měření</small></div><div><span>Rozdíl od baseline</span><strong>'+((delta??0)>0?'+':'')+value(delta)+'</strong><small>'+((std!=null&&last)?(Math.abs(delta)<=std?'V běžném rozmezí':'Mimo běžné rozmezí'):'Čekám na historii')+'</small></div></div><svg class="detail-chart" viewBox="0 0 800 280" role="img" aria-label="'+esc(title)+'"></svg><div class="chart-readout" aria-live="polite">Vyber bod pro konkrétní hodnotu.</div><div class="small detail-foot">'+(shown.length?shown.length+' měření v období · přerušovaná čára = baseline · pásmo = ±1 směrodatná odchylka předchozích 30 dní.':'Pro toto období nejsou dostupná měření.')+'</div>';
  el.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{detailRanges[id.replace('detail-','')]=Number(b.dataset.range);renderDetails();});
  const svg=el.querySelector('svg');if(!shown.length){svg.innerHTML='<text x="400" y="140" text-anchor="middle" fill="#9ba4b4" font-size="17">Bez měření v tomto období</text>';return;}
  const vals=shown.map(r=>r.value);if(avg!=null)vals.push(avg,avg-(std||0),avg+(std||0));let low=Math.min(...vals),high=Math.max(...vals),span=high-low||Math.max(1,Math.abs(high)*.1);low-=span*.12;high+=span*.12;
  const y=v=>232-(v-low)/(high-low)*200,start=dateShift(pragueToday(),-range+1),x=d=>64+(Date.parse(d)-Date.parse(start))/(Math.max(1,range-1)*86400000)*712;
  let out='';for(let i=0;i<4;i++){const v=low+(high-low)*i/3;out+='<line x1="64" x2="776" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#2a303a"/><text x="54" y="'+(y(v)+4)+'" fill="#9ba4b4" font-size="13" text-anchor="end">'+fmt(v,1)+'</text>';}
  if(avg!=null){out+='<rect x="64" y="'+y(avg+(std||0))+'" width="712" height="'+Math.max(1,y(avg-(std||0))-y(avg+(std||0)))+'" fill="'+color+'" opacity=".1"/><line x1="64" x2="776" y1="'+y(avg)+'" y2="'+y(avg)+'" stroke="'+color+'" stroke-dasharray="6 6" opacity=".65"/>';}
  // Break lines across missing days so a data gap is visible.
  shown.forEach((r,i)=>{const p=shown[i-1];if(p&&Date.parse(r.date)-Date.parse(p.date)<=2*86400000)out+='<line x1="'+x(p.date)+'" x2="'+x(r.date)+'" y1="'+y(p.value)+'" y2="'+y(r.value)+'" stroke="'+color+'" stroke-width="3"/>';out+='<g data-point="'+i+'" tabindex="0" role="button" aria-label="'+esc(longDate(r.date)+' '+value(r.value))+'"><title>'+esc(longDate(r.date)+' · '+value(r.value))+'</title><circle cx="'+x(r.date)+'" cy="'+y(r.value)+'" r="12" fill="transparent"/><circle cx="'+x(r.date)+'" cy="'+y(r.value)+'" r="4" fill="'+color+'"/></g>';});
  out+='<text x="64" y="265" fill="#9ba4b4" font-size="13">'+esc(dateLabel(start))+'</text><text x="776" y="265" text-anchor="end" fill="#9ba4b4" font-size="13">'+esc(dateLabel(pragueToday()))+'</text>';svg.innerHTML=out;
  svg.querySelectorAll('[data-point]').forEach(p=>{const show=()=>{const r=shown[Number(p.dataset.point)];el.querySelector('.chart-readout').textContent=longDate(r.date)+' · '+value(r.value)+(avg!=null?' · '+(r.value>=avg?'+':'')+fmt(r.value-avg,1)+' '+unit+' od baseline':'');};p.onmouseenter=show;p.onfocus=show;p.onclick=show;p.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')show();};});
}
function renderDetails(){
  const sleep=primarySleepSessions(state.sleep?.sessions),wellness=state.fitness?.wellness||[],weights=state.weight?.records||[];
  metricDetail('detail-sleep','Délka spánku',sleep.map(r=>({date:r.date||String(r.endTime).slice(0,10),value:r.durationMin/60})),'h','#b184ff');
  metricDetail('detail-hrv','Variabilita srdečního tepu · HRV',wellness.map(r=>({date:r.id,value:r.hrv})),'ms','#3fda9c');
  metricDetail('detail-rhr','Klidový tep',wellness.map(r=>({date:r.id,value:r.restingHR})),'bpm','#ff9b80');
  metricDetail('detail-weight','Hmotnost',weights.map(r=>({date:String(r.sample_time).slice(0,10),value:r.value_numeric})),'kg','#64d2ff');
  metricDetail('detail-load','Denní tréninková zátěž',wellness.map(r=>({date:r.id,value:r.ctlLoad??r.atlLoad})),'TSS','#a978ff');
  const last=sleep[0],stages=['DEEP','REM','LIGHT','AWAKE'],colors=['#7563ff','#b184ff','#66d4ff','#ffc45c'],names=['Hluboký','REM','Lehký','Bdění'];
  $('readinessCaption').textContent='Orientační index spánku · '+(last?'poslední záznam '+dateLabel(last.date||String(last.endTime).slice(0,10)):'bez záznamu');
  $('recoveryVsBaseline').textContent=$('recoveryVsBaseline').textContent.replace(/ · orientační index spánku/g,'')+' · orientační index spánku';
  if(last){const age=Math.floor((Date.parse(pragueToday())-Date.parse(last.date||String(last.endTime).slice(0,10)))/86400000);if(age>1){$('readinessTitle').textContent='Chybí aktuální spánek';$('readinessInsight').textContent='Poslední noc je stará '+age+' dní. Dnešní připravenost nelze odvodit ze staršího záznamu.';$('recoveryTitle').textContent='Poslední dostupný spánek';$('recoverySignal').textContent='Záznam '+dateLabel(last.date||String(last.endTime).slice(0,10));$('recoveryGuide').textContent='Doplň aktuální noc';$('recoveryGuideMeta').textContent='Ze staršího spánku nelze určit dnešní regeneraci.';$('recoveryInsight').textContent='Zobrazuji poslední dostupný spánek. Pro dnešní rozhodnutí chybí aktuální noc.';}}
  const total=last?stages.reduce((s,k)=>s+num(last.stages?.[k]),0):0;
  $('sleepBreakdown').innerHTML=last&&total?'<div class="label">Složení poslední noci · souhrn, nikoli časová osa</div><div class="sleep-composition">'+stages.map((k,i)=>'<span style="width:'+num(last.stages?.[k])/total*100+'%;background:'+colors[i]+'" title="'+names[i]+' '+hm(last.stages?.[k])+'"></span>').join('')+'</div><div class="stage-details">'+stages.map((k,i)=>{const mins=num(last.stages?.[k]),history=sleep.slice(1).filter(r=>r.date>=dateShift(last.date||pragueToday(),-30)&&measured(r.stages?.[k])),average=history.length?history.reduce((s,r)=>s+num(r.stages[k]),0)/history.length:null;return '<div><span><i style="background:'+colors[i]+'"></i>'+names[i]+'</span><strong>'+hm(mins)+'</strong><small>'+fmt(mins/total*100)+' % · baseline '+(average==null?'—':hm(average))+'</small></div>';}).join('')+'</div>':'<div class="muted">Fáze spánku nejsou dostupné.</div>';
  const recent=sleep.filter(r=>r.date>=dateShift(pragueToday(),-6)&&r.date<=pragueToday()),debt=recent.reduce((s,r)=>s+Math.max(0,480-num(r.durationMin)),0);
  $('sleepSummary').innerHTML='<div class="detail-stats"><div><span>Délka vs. orientační cíl 8 h</span><strong>'+((last&&last.durationMin>=480)?'+':'')+(last?fmt(last.durationMin-480)+' min':'—')+'</strong></div><div><span>Součet deficitů · 7 dní</span><strong>'+hm(debt)+'</strong><small>'+recent.length+'/7 zaznamenaných nocí · vůči 8 h, bez kompenzace</small></div><div><span>Fyziologická recovery</span><strong>HRV + tep</strong><small>Skóre nahoře je orientační index spánku, ne skóre WHOOP.</small></div></div>';
  const days=state.week?.days||[],logged=days.filter(d=>num(d.food?.totals?.kcal)>0),actual=logged.reduce((s,d)=>s+num(d.food.totals.kcal),0),target=logged.reduce((s,d)=>s+num(d.daily?.nutrition?.calorieTarget||d.daily?.calories?.target),0),p=logged.reduce((s,d)=>s+num(d.food.totals.protein_g)*4,0),c=logged.reduce((s,d)=>s+num(d.food.totals.carbs_g)*4,0),f=logged.reduce((s,d)=>s+num(d.food.totals.fat_g)*9,0),energy=p+c+f;
  $('nutritionInsights').innerHTML='<div class="detail-stats"><div><span>Zaznamenaná energie</span><strong>'+fmt(actual)+'</strong><small>'+logged.length+' zaznamenaných dní · kcal</small></div><div><span>Rozdíl od cíle zaznamenaných dní</span><strong>'+(actual-target>0?'+':'')+fmt(actual-target)+'</strong><small>Nezapsané dny nejsou počítané jako deficit.</small></div><div><span>Poměr energie z maker</span><strong>'+ (energy?[p,c,f].map(v=>fmt(v/energy*100)+'%').join(' / '):'—')+'</strong><small>Protein / sacharidy / tuk</small></div></div>';
  renderGymInsights();renderSourceCoverage();renderStrengthTrend();renderExperience();
  document.querySelectorAll('[data-training-date]').forEach(day=>{const open=()=>{selectedHistoryDate=day.dataset.trainingDate;activate('training');renderTraining();renderDetails();$('trainingActivityTable').scrollIntoView({behavior:'smooth',block:'center'});};day.onclick=open;day.onkeydown=e=>{if(e.key==='Enter')open();};});
}
function renderGymInsights(){
  const rows=(state.gym?.values||[]).slice(7).filter(r=>r[0]==='WORK'),done=rows.filter(r=>r[8]===true||String(r[8]).toUpperCase()==='TRUE'),volume=done.filter(r=>measured(r[5])&&measured(r[6])).reduce((s,r)=>s+Number(r[5])*Number(r[6]),0),rpes=done.filter(r=>measured(r[7])),rpe=rpes.length?rpes.reduce((s,r)=>s+Number(r[7]),0)/rpes.length:null;
  $('gymInsights').innerHTML='<div class="detail-stats"><div><span>Dokončené pracovní série</span><strong>'+done.length+' / '+rows.length+'</strong></div><div><span>Zaznamenaný objem</span><strong>'+fmt(volume)+' kg</strong><small>Součet kg × opakování dokončených sérií</small></div><div><span>Průměrné úsilí · RPE</span><strong>'+ (rpe==null?'—':fmt(rpe,1))+'</strong><small>'+rpes.length+' sérií s vyplněným RPE</small></div></div>';
}
function renderStrengthTrend(){
  const history=state.gym?.history||[],exercises=[...new Set(history.map(r=>r.exercise).filter(Boolean))].sort();
  if(!selectedStrengthExercise||!exercises.includes(selectedStrengthExercise))selectedStrengthExercise=exercises[0]||'';
  $('strengthExercise').innerHTML=exercises.map(name=>'<option '+(name===selectedStrengthExercise?'selected':'')+'>'+esc(name)+'</option>').join('')||'<option>Bez uložených sérií</option>';
  const days=new Map();history.filter(r=>r.exercise===selectedStrengthExercise&&measured(r.actual_kg??r.actualKg)).forEach(r=>{const date=String(r.workout_date||r.date).slice(0,10),value=Number(r.actual_kg??r.actualKg),old=days.get(date);if(!old||value>old.value)days.set(date,{date,value});});
  metricDetail('detail-strength',selectedStrengthExercise||'Progres cviku',[...days.values()],'kg','#ffc15c');
  $('strengthExercise').onchange=e=>{selectedStrengthExercise=e.target.value;renderStrengthTrend();};
}
function renderSourceCoverage(){const w=state.fitness?.wellness||[],latest=w.at(-1);$('sourceCoverage').innerHTML='<div class="label">Dostupnost signálů</div>'+[['Spánek',primarySleepSessions(state.sleep?.sessions).length+' nocí'],['HRV',w.filter(r=>measured(r.hrv)).length+' měření'],['Klidový tep',w.filter(r=>measured(r.restingHR)).length+' měření'],['Wellness z Intervals',latest?.id||'Bez dat']].map(([name,value])=>'<div class="metric-line"><span>'+name+'</span><strong>'+esc(value)+'</strong></div>').join('')+'<button class="btn" id="openSources">Spravovat zdroje dat →</button>';$('openSources').onclick=()=>activate('settings');}
async function loadConnections(){try{const data=await jsonFetch('/app/api/connections');$('connectionCards').innerHTML=data.providers.map(p=>'<article class="card connection-card" data-provider="'+esc(p.id)+'"><div class="detail-heading"><h3>'+esc(p.name)+'</h3><span class="pill '+(p.connected?'good':'')+'">'+(p.connected?'Připojeno':p.configured?'Vyžaduje připojení':'Vyžaduje nastavení')+'</span></div><div class="connection-metrics">'+p.metrics.map(m=>'<span class="pill">'+esc(m)+'</span>').join('')+'</div><p class="small">'+esc(p.note)+'</p>'+(p.id==='google'&&p.connectUrl?'<a class="btn" href="'+esc(p.connectUrl)+'">'+(p.connected?'Obnovit oprávnění':'Připojit '+esc(p.name))+'</a>':'')+(p.id==='google'&&p.connected&&p.extrasUrl?googleExtrasHtml(p):'')+(p.id==='intervals'?'<a class="btn" href="'+esc(p.connectUrl)+'" target="_blank" rel="noopener noreferrer">Otevřít nastavení Intervals</a>':'')+(p.connected?' <button class="btn" type="button" data-disconnect="'+esc(p.id)+'">Odpojit</button>':'')+'</article>').join('');document.querySelectorAll('[data-disconnect]').forEach(b=>b.onclick=async()=>{if(!confirm('Opravdu odpojit '+b.closest('.connection-card').querySelector('h3').textContent+'? Bez obou připojení se data nezobrazí.'))return;try{await jsonFetch('/app/api/connections',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:b.dataset.disconnect})});location.reload();}catch(error){toast(error.message);}});}catch(e){$('connectionCards').innerHTML='<div class="notice">Nastavení nelze načíst: '+esc(e.message)+'</div>';}}
function installDetailViews(){
  const style=document.createElement('style');style.textContent='.detail-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.detail-heading h3{margin:4px 0 15px;font-size:18px}.range-tabs{display:flex;gap:3px}.range-tabs .btn{font-size:11px;padding:6px 8px}.range-tabs .selected{background:#513879;border-color:#a978ff}.detail-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:15px 0}.detail-stats span,.detail-stats small{display:block;color:#9ba4b4;font-size:11px}.detail-stats strong{display:block;font-size:26px;letter-spacing:-.04em;margin:4px 0}.detail-chart{width:100%;height:280px;display:block}.chart-readout{min-height:24px;color:#dde2ef;font-size:12px}.detail-foot{padding-top:8px;border-top:1px solid #292f3b}.sleep-composition{display:flex;height:26px;border-radius:8px;overflow:hidden;margin:18px 0}.stage-details{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.stage-details span,.stage-details strong,.stage-details small{display:block}.stage-details strong{font-size:22px;margin:5px 0}.stage-details small{font-size:11px;color:#9ba4b4}.stage-details i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.connection-metrics{display:flex;flex-wrap:wrap;gap:6px}.connection-card .btn{display:inline-block;text-decoration:none}.metric-link{cursor:pointer}.metric-link:hover{border-color:#9b6bff}.view-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}@media(max-width:700px){.detail-stats{gap:12px;grid-template-columns:1fr}.detail-stats strong{font-size:24px}.view-detail-grid{grid-template-columns:1fr}.stage-details{grid-template-columns:1fr 1fr}.detail-chart{height:auto}.detail-heading{align-items:flex-start;flex-direction:column}}';document.head.appendChild(style);
  $('recovery').insertAdjacentHTML('beforeend','<div class="section">Podrobnosti a osobní baseline</div><div class="card" id="sleepSummary"></div><div class="card" id="sleepBreakdown" style="margin-top:12px"></div><div class="card" id="detail-sleep" style="margin-top:12px"></div><div class="view-detail-grid"><div class="card" id="detail-hrv"></div><div class="card" id="detail-rhr"></div></div><div class="card" id="detail-weight" style="margin-top:12px"></div><div class="card" id="sourceCoverage" style="margin-top:12px"></div>');
  $('training').insertAdjacentHTML('beforeend','<div class="section">Zátěž proti vlastnímu normálu</div><div class="card" id="detail-load"></div>');
  $('nutrition').insertAdjacentHTML('afterbegin','<div class="card" id="nutritionInsights" style="margin-bottom:16px"></div>');
  // Gym statistics live in Trénink; the gym builder is part of Workouty.
  $('gymHistory').closest('.card').insertAdjacentHTML('beforebegin','<div class="card" id="gymInsights" style="margin-bottom:12px"></div>');
  $('gymHistory').closest('.card').insertAdjacentHTML('afterend','<div class="section">Silový progres</div><div class="card"><div class="select-row"><label for="strengthExercise" class="small">Vyber cvik</label><select id="strengthExercise"></select></div><p class="small">Nejvyšší použitá váha z dokončených pracovních sérií každého dne. Vyšší váha sama o sobě neznamená progres, pokud se změnil počet opakování nebo technika.</p><div id="detail-strength"></div></div>');
  document.querySelector('.content').insertAdjacentHTML('beforeend','<section class="view" id="settings"><div class="hero section-hero"><div><div class="eyebrow">Zdroje dat</div><h1>Nastavení a propojení</h1><p>Jedno místo pro trénink, spánek, regeneraci a výživu.</p></div></div><div class="grid2" id="connectionCards"><div class="notice">Načítám propojení…</div></div><div class="card" style="margin-top:12px"><h3>Jak pracujeme s více zdroji</h3><p class="small">Tréninkový plán a zátěž čerpáme z Intervals.icu. Spánek, hmotnost a výživa přicházejí z Google Health. HRV a klidový tep zobrazujeme, pokud jsou v Intervals wellness skutečně naměřené. Každý uživatel má vlastní připojení a vidí jen svoje data.</p><p class="small">Stav „Nakonfigurováno“ znamená, že jsou na serveru dostupné přihlašovací údaje. Dostupnost jednotlivých měření najdeš v Recovery & Health.</p><button class="btn" id="checkConnections">Zkontrolovat propojení</button></div></section>');
  $('checkConnections').onclick=loadConnections;
  $('connectionCards').insertAdjacentHTML('beforebegin','<div class="card" id="accountCard" style="margin-bottom:12px"><div class="small">Načítám účet…</div></div>');
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
const previousConnections=loadConnections;loadConnections=async()=>{await previousConnections();const card=[...document.querySelectorAll('.connection-card')].find(el=>el.querySelector('h3')?.textContent==='Intervals.icu');if(!card)return;card.insertAdjacentHTML('beforeend','<form id="intervalsConnect" style="margin-top:15px"><label class="small" for="intervalsKey">Připojit nebo aktualizovat API klíč</label><div class="select-row" style="margin-top:6px"><input id="intervalsKey" type="password" autocomplete="off" placeholder="Osobní API klíč" required style="background:#0d1119;color:#fff;border:1px solid #393245;border-radius:9px;padding:10px;max-width:100%;min-width:0"><button class="btn primary" type="submit">Ověřit a připojit</button></div><div class="small" id="intervalsResult" aria-live="polite"></div></form>');$('intervalsConnect').onsubmit=async e=>{e.preventDefault();const input=$('intervalsKey'),b=e.currentTarget.querySelector('button');b.disabled=true;try{const result=await jsonFetch('/app/api/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'intervals',key:input.value.trim()})});input.value='';$('intervalsResult').textContent=result.message;toast(result.message);await loadConnections();await load();}catch(error){$('intervalsResult').textContent=error.message;}finally{b.disabled=false;}};};
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
    if(r.status!=='ok'){foodMessage(r.message);return}
    selectFoodProduct(r.product);
    const p=r.product,conf={high:'vysoká',medium:'střední',low:'nízká'}[p.confidence]||p.confidence;
    const info='Dohledáno AI · jistota '+esc(conf)+(p.barcode?' · EAN '+esc(p.barcode):'')+(p.note?' · '+esc(p.note):'')+(p.sources?.length?'<br>Zdroje: '+p.sources.map(x=>'<a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title||x.url)+'</a>').join(' · '):'');
    $('foodSource').innerHTML=info;$('foodResults').innerHTML='<div class="notice food-ai-info">'+info+'</div>';
    foodMessage('Zkontroluj hodnoty proti obalu. Po uložení jídla si potravinu zapamatuji'+(p.barcode?' i s čárovým kódem':'')+' a příště ji najdu bez AI.');
  }catch(e){foodMessage(e.message);}finally{if(b){b.disabled=false;b.textContent='🔎 Dohledat nutriční hodnoty přes AI';}}
}
async function recognizeFoodPhotoSummary(worker,file,object){
  const first=await worker.recognize(object),line=(first.data.lines||[]).find(l=>/kcal/i.test(l.text)&&/\d[.,]\d\s*g/i.test(l.text));
  if(!line?.bbox)return first;
  const bitmap=await createImageBitmap(file);try{const box=line.bbox,h=Math.max(20,box.y1-box.y0),top=Math.max(0,Math.floor(box.y0-h*3)),height=Math.min(bitmap.height-top,Math.ceil(h*12)),scale=Math.min(2,2400/bitmap.width),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(height*scale);const c=canvas.getContext('2d');c.drawImage(bitmap,0,top,bitmap.width,height,0,0,canvas.width,canvas.height);const pixel=c.getImageData(0,0,1,1).data;if((pixel[0]+pixel[1]+pixel[2])/3<120){c.filter='invert(1) grayscale(1)';c.drawImage(bitmap,0,top,bitmap.width,height,0,0,canvas.width,canvas.height);}await worker.setParameters({tessedit_pageseg_mode:'6'});const cropped=await worker.recognize(canvas),parsed=await jsonFetch('/app/api/food/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:cropped.data.text,mode:'portion'})});return ['calories_100g','protein_100g','carbs_100g','fat_100g'].every(k=>parsed.values[k]!=null)?cropped:first;}finally{bitmap.close();}
}
async function readFoodPhoto(file,kind){if(!file)return;if(!file.type.startsWith('image/')||file.size>15*1024*1024){foodMessage('Vyber fotografii JPG/PNG do 15 MB.');return;}const object=URL.createObjectURL(file);let worker;try{foodMessage(kind==='barcode'?'Čtu čárový kód…':'Načítám čtečku etikety…');if(kind==='barcode'){
    let code='';if('BarcodeDetector'in window){try{const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']}),bitmap=await createImageBitmap(file);try{const codes=await detector.detect(bitmap);code=codes[0]?.rawValue||'';}finally{bitmap.close();}}catch{}}
    if(!code){const ZX=await loadFoodLibrary('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js','ZXingBrowser'),reader=new ZX.BrowserMultiFormatReader();const result=await reader.decodeFromImageUrl(object);code=result.getText();}
    if(!/^\d{8,14}$/.test(code))throw new Error('Čárový kód není čitelný. Vyfoť ho rovně a zblízka, nebo opiš číslo.');$('foodBarcode').value=code;$('foodQuery').value='';await searchFood();
  }else{const OCR=await loadFoodLibrary('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','Tesseract');worker=await OCR.createWorker('ces+eng',1,{logger:m=>{if(m.status==='recognizing text')foodMessage('Čtu fotografii: '+Math.round(m.progress*100)+' %');}});const result=kind==='portion'?await recognizeFoodPhotoSummary(worker,file,object):await worker.recognize(object);$('foodOcrText').value=result.data.text;$('foodOcrDetails').open=true;$('foodPhotoMode').value=kind==='portion'?'portion':'label';await applyFoodLabel();if(kind==='portion'&&['protein_100g','carbs_100g','fat_100g'].some(k=>!$('food-'+k).value)){await worker.setParameters({tessedit_pageseg_mode:'6'});const second=await worker.recognize(object);const r=await jsonFetch('/app/api/food/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:second.data.text,mode:'portion'})});if(['calories_100g','protein_100g','carbs_100g','fat_100g'].every(k=>r.values[k]!=null)){$('foodOcrText').value=second.data.text;await applyFoodLabel();}else foodMessage('Některé hodnoty na fotce jsou nečitelné. Přepsané údaje zůstaly v návrhu; chybějící pole doplň ručně.');}}
  }catch(e){foodMessage(kind==='barcode'?'Kód se nepodařilo přečíst. Opiš číslo pod čárovým kódem nebo zkus ostřejší fotografii.':e.message);}finally{if(worker)await worker.terminate();URL.revokeObjectURL(object);}}
async function applyFoodLabel(mode=$('foodPhotoMode').value){try{const r=await jsonFetch('/app/api/food/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:$('foodOcrText').value,mode})});selectFoodProduct({...(mode==='portion'?{}:foodSelected),name:mode==='portion'?r.name:foodSelected?.name||$('foodQuery').value.trim(),barcode:mode==='portion'?null:foodSelected?.barcode||$('foodBarcode').value.trim(),quantity:mode==='portion'?'':foodSelected?.quantity,...r.values,nutrition_basis:mode==='portion'?'portion':/100\s*ml/i.test($('foodOcrText').value)?'ml':'g',source:'package_label'});foodMessage(mode==='portion'?(r.ambiguous?'Fotka obsahuje také sloupec na 100 g/ml. Použil jsem poslední sloupec; porovnej přepsané hodnoty s fotkou.':'Hodnoty jsou za celou porci. Počet porcí může být i 1/2. Před uložením můžeš opravit přepis.'):'Přepsané hodnoty můžeš upravit. Zvol základ 100 g nebo 100 ml podle etikety.');}catch(e){foodMessage(e.message);}}
async function saveFoodEntry(e){e.preventDefault();const b=$('foodSaveButton');b.disabled=true;try{const p=foodEditorProduct();foodIntake(p,$('foodGrams').value,$('foodUnit').value,{pieceAmount:$('foodPieceAmount').value,pieceUnit:$('foodPieceUnit').value,density:$('foodDensity').value});const r=await jsonFetch('/app/api/food/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:p,quantity:$('foodGrams').value,unit:$('foodUnit').value,pieceAmount:$('foodPieceAmount').value,pieceUnit:$('foodPieceUnit').value,density:$('foodDensity').value,date:$('foodDate').value,mealType:$('foodMeal').value})});foodMessage(r.message);toast(r.message);$('basketClear').onclick();closeFoodLogger();await load();await loadEnteredFood();return r;}catch(e){foodMessage(e.message);}finally{b.disabled=false;}}
const mealSlots=[{id:'breakfast',name:'Snídaně',time:'07:30',share:25},{id:'snack_am',name:'Dopolední svačina',time:'10:00',share:10},{id:'lunch',name:'Oběd',time:'12:30',share:30},{id:'snack_pm',name:'Odpolední svačina',time:'16:00',share:10},{id:'dinner',name:'Večeře',time:'19:00',share:25}];
let mealEntries=[],mealDiaryPreview=false,mealEnabled=['breakfast','snack_am','lunch','snack_pm','dinner'];
try{const saved=JSON.parse(localStorage.getItem('pfd-meals-v1')||'null');if(Array.isArray(saved)&&saved.some(id=>mealSlots.some(s=>s.id===id)))mealEnabled=mealSlots.filter(s=>saved.includes(s.id)).map(s=>s.id);}catch{}
function foodMealSlot(entry){try{const note=JSON.parse(entry.note||'{}');return note.mealType==='snack'?'snack_pm':note.mealType||'unassigned';}catch{return 'unassigned'}}
function mealEntryRow(entry){
  let ingredients=[];try{ingredients=JSON.parse(entry.note||'{}').ingredients||[]}catch{}
  const slot=foodMealSlot(entry),name=entry.recipe_title||'Jídlo',options=(slot==='unassigned'?'<option value="" selected>Přesunout do…</option>':'')+mealSlots.map(s=>'<option value="'+s.id+'" '+(slot===s.id?'selected':'')+'>'+s.name+'</option>').join('');
  return '<div class="meal-row" data-food-id="'+Number(entry.id)+'"><div class="meal-row-main"><strong>'+esc(name)+'</strong><span>'+fmt(entry.kcal)+' kcal · B '+fmt(entry.protein_g,1)+' g · S '+fmt(entry.carbs_g,1)+' g · T '+fmt(entry.fat_g,1)+' g</span></div>'+(ingredients.length?'<div class="small">'+ingredients.map(a=>esc(a.name)+' '+fmt(a.amount,1)+' '+esc(a.unit)).join(' · ')+'</div>':'')+'<div class="meal-row-actions"><select class="food-input" data-move-food="'+Number(entry.id)+'" aria-label="Přesunout '+esc(name)+' do jiného jídla">'+options+'</select><button type="button" class="btn" data-edit-food="'+Number(entry.id)+'">Upravit</button><button type="button" class="btn" data-copy-food="'+Number(entry.id)+'">Kopírovat</button><button type="button" class="btn" data-delete-food="'+Number(entry.id)+'">Smazat</button></div></div>';
}
function openFoodManage(id,copy=false){
  const entry=mealEntries.find(e=>Number(e.id)===Number(id));if(!entry)return;
  const form=$('foodManageForm');form.elements.id.value=entry.id;form.elements.name.value=entry.recipe_title||'';form.elements.date.value=entry.consumed_date||$('foodDate').value;form.elements.mealType.value=foodMealSlot(entry)==='unassigned'?'snack_pm':foodMealSlot(entry);
  for(const key of ['kcal','protein_g','carbs_g','fat_g'])form.elements[key].value=fmt(entry[key],1);
  $('foodCopyDate').value=dateShift(entry.consumed_date||$('foodDate').value,1);
  $('foodManageDialog').showModal();if(copy)$('foodCopyDate').focus();else form.elements.name.focus();
}
async function refreshFoodDiary(){const date=$('foodDate').value;await load();$('foodDate').value=date;await loadEnteredFood()}
async function changeFoodMeal(id,mealType){
  try{await jsonFetch('/app/api/food/entry',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,mealType})});toast('Jídlo je přesunuté.');await refreshFoodDiary()}
  catch(error){toast('Přesun selhal: '+error.message);renderMealDiary()}
}
function renderMealDiary(){
  if(!$('enteredFood'))return;const active=mealSlots.filter(s=>mealEnabled.includes(s.id)),weight=active.reduce((sum,s)=>sum+s.share,0),date=$('foodDate').value||pragueToday(),nutrition=date===pragueToday()?state.daily?.nutrition:state.week?.days?.find(d=>d.date===date)?.daily?.nutrition,macros=nutrition?.macros||{},target=num(nutrition?.calorieTarget),totals=entries=>entries.reduce((sum,e)=>{for(const k of ['kcal','protein_g','carbs_g','fat_g'])sum[k]+=num(e[k]);return sum},{kcal:0,protein_g:0,carbs_g:0,fat_g:0});
  const showEntries=entries=>entries.length?entries.map(mealEntryRow).join(''):'<div class="small">Zatím nic zapsáno</div>';
  $('enteredFood').innerHTML='<div class="detail-heading"><h3>Jídla během dne · '+esc(longDate(date))+'</h3><input type="date" class="food-input meal-diary-date" value="'+esc(date)+'" aria-label="Datum deníku jídel"><span class="pill">'+fmt(totals(mealEntries).kcal)+' kcal</span></div><div class="meal-preferences">'+mealSlots.map(s=>'<label><input type="checkbox" data-meal-toggle="'+s.id+'" '+(mealEnabled.includes(s.id)?'checked':'')+'> '+s.name+'</label>').join('')+'</div><p class="small">Vyber 3–5 jídel nebo vlastní kombinaci. Volba se ukládá v tomto prohlížeči. Cíle jsou orientační rozložení denního plánu, ne povinnost jíst přesně v tento čas.</p><div class="meal-grid">'+active.map(s=>{const entries=mealEntries.filter(e=>foodMealSlot(e)===s.id),f=totals(entries),share=s.share/weight;return '<section class="card meal-card"><div class="detail-heading"><h3>'+s.name+'</h3><span class="small">'+s.time+'</span></div><div class="meal-target">'+(target?'Cíl '+fmt(target*share)+' kcal · B '+fmt(num(macros.protein_g??macros.proteinGrams)*share)+' g · S '+fmt(num(macros.carbs_g??macros.carbsGrams)*share)+' g · T '+fmt(num(macros.fat_g??macros.fatGrams)*share)+' g':'Denní cíl pro toto datum není dostupný')+'</div><div class="small">Zapsáno '+fmt(f.kcal)+' kcal · B '+fmt(f.protein_g,1)+' g · S '+fmt(f.carbs_g,1)+' g · T '+fmt(f.fat_g,1)+' g</div>'+showEntries(entries)+'<button class="btn" data-add-meal="'+s.id+'" style="margin-top:10px">＋ Zapsat jídlo</button></section>';}).join('')+'</div>';
  $('enteredFood').querySelectorAll('.meal-diary-date').forEach(input=>input.onchange=()=>{$('foodDate').value=input.value;loadEnteredFood()});
  const other=mealEntries.filter(e=>!mealEnabled.includes(foodMealSlot(e)));if(other.length)$('enteredFood').insertAdjacentHTML('beforeend','<h3 style="margin-top:16px">Ostatní a nezařazené záznamy</h3>'+showEntries(other));
  if(mealDiaryPreview)$('enteredFood').insertAdjacentHTML('afterbegin','<div class="notice" style="margin-bottom:12px">Místní náhled: ukázková jídla. Změny zůstávají jen tady.</div>');
  $('enteredFood').querySelectorAll('[data-meal-toggle]').forEach(input=>input.onchange=()=>{const selected=[...$('enteredFood').querySelectorAll('[data-meal-toggle]:checked')].map(i=>i.dataset.mealToggle);if(!selected.length){input.checked=true;toast('Nech vybrané alespoň jedno jídlo.');return}mealEnabled=selected;try{localStorage.setItem('pfd-meals-v1',JSON.stringify(selected));}catch{}renderMealDiary();});
  $('enteredFood').querySelectorAll('[data-add-meal]').forEach(b=>b.onclick=()=>{$('foodMeal').value=b.dataset.addMeal;$('foodQuery').focus();$('foodEntry').scrollIntoView({behavior:'smooth',block:'start'});foodMessage('Zapisuješ: '+mealSlots.find(s=>s.id===b.dataset.addMeal).name);});
  if($('mealDistribution')&&typeof renderNutritionExperience==='function')renderNutritionExperience(state.daily?.nutrition?.foodLog?.totals||{},num(state.daily?.nutrition?.calorieTarget),state.daily||{});
}
async function loadEnteredFood(){try{const date=$('foodDate').value||pragueToday(),r=await jsonFetch('/app/api/food/day?date='+date);mealEntries=r.entries||[];mealDiaryPreview=Boolean(r.preview);renderMealDiary();}catch(e){$('enteredFood').textContent=e.message;}}
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
  for(let j=0;j<=4;j++){const v=max*j/4,y=H-bottom-v/max*plot;out+='<line x1="'+left+'" x2="'+(W-15)+'" y1="'+y+'" y2="'+y+'" stroke="#29323d"/><text x="36" y="'+(y+5)+'" text-anchor="end" fill="#9caabd" font-size="13">'+fmt(v,1)+'</text>';}
  rows.forEach((r,i)=>{let y=H-bottom;const x=left+i*slot+(slot-bw)/2;r.values.forEach((v,k)=>{if(v==null)return;const h=Math.max(0,v)/max*plot;y-=h;out+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="3" fill="'+colors[k%colors.length]+'"><title>'+esc(r.title||r.label)+' · '+fmt(v,1)+'</title></rect>';});if(labels&&(W>390||rows.length<=7||i%2===0||i===rows.length-1))out+='<text x="'+(x+bw/2)+'" y="'+(H-12)+'" fill="#a9b9cc" font-size="'+(W===390?11:14)+'" text-anchor="middle">'+esc(r.label)+'</text>';});
  return '<svg class="experience-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Denní hodnoty se stupnicí">'+out+'</svg>';
}
function renderExperience(){
  if(!$('dailyPulse'))return;
  const daily=state.daily||{},food=daily.nutrition?.foodLog?.totals||{},target=num(daily.nutrition?.calorieTarget),sessions=primarySleepSessions(state.sleep?.sessions).map(r=>({...r,date:r.date||String(r.endTime||r.startTime||'').slice(0,10)})).filter(r=>r.date<=selectedHistoryDate),last=sessions[0],wellness=(state.fitness?.wellness||[]).filter(r=>r.id<=selectedHistoryDate),latest=wellness.at(-1)||{},done=(daily.training?.completed||[]).filter(a=>!isNutritionItem(a)),plan=(daily.training?.planned||[]).filter(a=>!isNutritionItem(a)),actualTss=done.reduce((s,a)=>s+num(a.tss),0),plannedTss=plan.reduce((s,m)=>s+num(m.tss),0)||(daily.training?.matched||[]).reduce((s,m)=>s+num(m.planned?.tss),0),hasSleep=last&&last.date>=dateShift(selectedHistoryDate,-1),sleepScore=hasSleep?Math.round(Math.min(100,num(last.durationMin)/480*100)):null;
  $('dailyPulse').innerHTML='<div class="pulse-header"><div><div class="eyebrow">TVŮJ DEN · '+esc(longDate(pragueToday()))+'</div><h1>Výkon začíná rovnováhou.</h1><p>Spánek, pohyb a jídlo v jednom pohledu.</p></div><button class="btn" id="pulseHealth">Prozkoumat zdravotní data ↗</button></div><div class="pulse-grid">'+experienceRing('Spánek vs. 8 h',sleepScore==null?'—':sleepScore+'%',sleepScore,'#a99bff',last?hm(last.durationMin):'Čekám na noc',last?'Poslední záznam '+dateLabel(last.date)+' · '+(hasSleep?'orientační cíl, ne recovery skóre':'starší noc, ne dnešní připravenost'):'Připoj zdroj spánku')+experienceRing('Tréninková zátěž',actualTss?fmt(actualTss):'—',plannedTss?actualTss/plannedTss*100:0,'#83e9c3',actualTss?'TSS dokončených aktivit':'Dnes bez evidované zátěže',plannedTss?'Plán '+fmt(plannedTss)+' TSS · poměr není známka kvality':'Bez srovnatelného TSS plánu; žádné fiktivní strain skóre')+experienceRing('Příjem energie',target?fmt(num(food.kcal)/target*100)+'%':'—',target?num(food.kcal)/target*100:0,'#ffc274',fmt(food.kcal)+' / '+(target?fmt(target):'—')+' kcal','Z evidovaných jídel · '+(target?fmt(Math.max(0,target-num(food.kcal)))+' kcal zbývá':'čekám na denní cíl'))+'</div><div class="pulse-insight"><span>↗</span><span>'+esc(done.length?'Aktivita je dokončená. Níže najdeš její hodnocení a zbývající výživu.':plan.length?'Před tebou je '+(plan[0].name||'plánovaný trénink')+'. Zkontroluj připravenost a doporučení trenéra.':'Dnes bez evidovaného tréninku. Přehled se změní, jakmile přijde nová aktivita.')+'</span></div>';
  $('pulseHealth').onclick=()=>activate('recovery');
  const older=sessions.filter(r=>r.date<last?.date&&r.date>=dateShift(last?.date||pragueToday(),-30)),sleepMean=older.length?older.reduce((s,r)=>s+num(r.durationMin),0)/older.length:null;
  $('oSleepMeta').textContent=last?'Poslední noc '+dateLabel(last.date)+(sleepMean==null?'':' · '+(last.durationMin>=sleepMean?'+':'')+fmt(last.durationMin-sleepMean)+' min vs. 30 dní'):'Bez měření';
  $('recoveryScore').textContent=last?hm(last.durationMin):'—';$('recoveryScore').style.fontSize='25px';$('recoveryOrb').style.setProperty('--orb-value',sleepScore??0);$('recoveryVsBaseline').textContent=last?'Záznam '+dateLabel(last.date)+' · délka spánku, ne recovery skóre':'Čekám na noc';
  const stages=['DEEP','REM','LIGHT','AWAKE'],stageColors=['#7564e9','#afa2ff','#83c7ff','#ffcb83'],recent=sessions.filter(r=>r.date>=dateShift(pragueToday(),-13)).sort((a,b)=>a.date.localeCompare(b.date)),nightRows=recent.map(r=>({label:dateLabel(r.date),title:longDate(r.date),values:stages.map(k=>measured(r.stages?.[k])?Number(r.stages[k])/60:null)})),maximum=Math.max(10,...nightRows.map(r=>r.values.reduce((s,v)=>s+(v||0),0)));
  $('sleepNights').innerHTML='<div class="experience-heading"><h3>Jak vypadaly tvoje noci</h3><small>Posledních 14 dní · hodiny</small></div><div class="experience-legend">'+['Hluboký','REM','Lehký','Bdění'].map((n,i)=>'<span><i style="background:'+stageColors[i]+'"></i>'+n+'</span>').join('')+'</div>'+(nightRows.length?experienceBars(nightRows,{max:maximum,colors:stageColors}):'<div class="data-gap">Pro toto období chybí fáze spánku.</div>')+'<p class="small">Každý sloupec je skutečná zaznamenaná noc. Bez fází nezobrazuji smyšlený hypnogram.</p>';
  const bedtimes=recent.filter(r=>Number.isFinite(Date.parse(r.startTime))).map(r=>{const parts=new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date(r.startTime));const h=Number(parts.find(p=>p.type==='hour')?.value),m=Number(parts.find(p=>p.type==='minute')?.value);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m+(h<12?1440:0):null;}).filter(v=>v!=null),average=bedtimes.length?bedtimes.reduce((s,v)=>s+v,0)/bedtimes.length:null,std=bedtimes.length>1?Math.sqrt(bedtimes.reduce((s,v)=>s+(v-average)**2,0)/bedtimes.length):null,clock=v=>v==null?'—':String(Math.floor(v/60)%24).padStart(2,'0')+':'+String(Math.round(v)%60).padStart(2,'0');
  $('sleepRegularity').innerHTML='<div class="experience-heading"><h3>Tvůj spánkový rytmus</h3><small>Osobní trend, ne diagnóza</small></div><div class="experience-stats"><div><span>Obvyklé usnutí</span><strong>'+clock(average)+'</strong></div><div><span>Rozptyl času · SD</span><strong>'+(std==null?'—':fmt(std)+' min')+'</strong></div><div><span>Zaznamenané noci</span><strong>'+recent.length+' / 14</strong></div></div><div class="notice">'+(std==null?'Pro srovnání pravidelnosti potřebujeme více nocí.':'Čas usnutí se od průměru typicky liší o '+fmt(std)+' minut. Menší rozptyl znamená pravidelnější režim, ne automaticky kvalitnější spánek.')+'</div><p class="small">Usnutí po půlnoci patří ke stejné večerní časové ose. Chybějící noci nejsou nuly.</p>';
  const recentWell=wellness.filter(r=>r.id>=dateShift(pragueToday(),-29)),meanKey=key=>{const xs=recentWell.filter(r=>measured(r[key]));return xs.length?xs.reduce((s,r)=>s+Number(r[key]),0)/xs.length:null;},rhr=meanKey('restingHR'),hrv=meanKey('hrv'),vo2=recentWell.filter(r=>measured(r.vo2max)).at(-1)?.vo2max,meanSleep=recent.length?recent.reduce((s,r)=>s+num(r.durationMin),0)/recent.length:null;
  $('healthspan').innerHTML='<div class="eyebrow">HEALTHSPAN · DLOUHODOBÝ POHLED</div><h3 class="healthspan-title">Návyky a kondice. Ne vymyšlený věk.</h3><p class="small">Sleduj svůj vlastní trend napříč spánkem a fyziologickými měřeními.</p><div class="healthspan-metrics">'+[['Klidový tep',rhr==null?'—':fmt(rhr,1)+' bpm','Průměr dostupných měření · 30 dní'],['HRV',hrv==null?'—':fmt(hrv,1)+' ms','Průměr dostupných měření · 30 dní'],['VO₂ max',vo2==null?'—':fmt(vo2,1),'Poslední měření, nikoli odhad z CTL'],['Délka spánku',meanSleep==null?'—':hm(meanSleep),'Průměr zaznamenaných nocí · 14 dní']].map(([label,value,note])=>'<div><span class="label">'+label+'</span><strong>'+value+'</strong><small>'+note+'</small></div>').join('')+'</div><div class="healthspan-note"><strong>WHOOP Age · není dostupný</strong><br>Ve veřejném WHOOP API není tento ukazatel vystavený. Bez validovaného modelu z těchto dat nepočítáme biologický věk. Naměřené HRV, tep a VO₂ max zůstávají oddělené signály.</div>';
  renderNutritionExperience(food,target,daily);renderActivityGallery();renderRequestedExperience(done,latest,vo2,daily);
}
// savedProfile: what the user entered (and what the form saves). appProfile
// adds what the app worked out itself for the empty fields: height, activity,
// resting and maximum heart rate.
function savedProfile(){try{return JSON.parse(localStorage.getItem('fitnessProfile')||'{}');}catch{return {};}}
function suggestedProfile(){try{return JSON.parse(localStorage.getItem('fitnessProfileSuggested')||'{}');}catch{return {};}}
// Optional Google permissions: birth date (age) and writing weight to Google Health.
function googleExtrasHtml(p){const x=p.extras||{},missing=[!x.birthday&&'datum narození',!x.weightWrite&&'zápis váhy'].filter(Boolean);return missing.length?' <a class="btn primary" href="'+esc(p.extrasUrl)+'">Rozšířit oprávnění Google</a><p class="small">Povolí '+esc(missing.join(' a '))+': věk se pak doplní z Google účtu a váha zapsaná tady nebo v Intervals.icu se propíše i do Google Health.</p>':'<p class="small"><span class="pill good">Datum narození a zápis váhy povoleny</span></p>';}
function appProfile(){const p=savedProfile(),s=suggestedProfile();for(const k of ['height','activity','rhr','hrmax','birthDate'])if((p[k]==null||p[k]==='')&&s[k])p[k]=s[k];const age=ageFromBirthDate(p.birthDate);if(age!=null)p.age=age;return p;}
// Age from a birth date, so it stays current without editing the profile.
function ageFromBirthDate(value){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));if(!m)return null;const t=new Date();let age=t.getFullYear()-Number(m[1]);if(t.getMonth()+1<Number(m[2])||(t.getMonth()+1===Number(m[2])&&t.getDate()<Number(m[3])))age--;return age>=18&&age<=100?age:null;}
function googleWellness(){return state.googleHealth?.wellness||[];}
function latestGoogleMetric(key){return googleWellness().filter(r=>measured(r[key])).at(-1);}
function latestVo2(){const google=latestGoogleMetric('vo2max'),intervals=(state.fitness?.wellness||[]).filter(r=>r.id<=selectedHistoryDate&&measured(r.vo2max??r.vo2Max)).at(-1);if(google&&(!intervals||google.id>=intervals.id))return {value:Number(google.vo2max),date:google.id,source:'Google Health'};if(intervals)return {value:Number(intervals.vo2max??intervals.vo2Max),date:intervals.id,source:'Intervals.icu'};return null;}
function labelSelectedDay(){
  // Headings are matched by their text: their order changes as sections are added.
  const past=selectedHistoryDate!==pragueToday(),rename={'Denní signály':'Signály dne','Dnešní poradci a hodnocení':'Poradci a hodnocení dne'};
  for(const el of document.querySelectorAll('#overview>.section,#todayMore>.section')){const t=el.textContent;for(const [today,day] of Object.entries(rename))if(t===today||t===day)el.textContent=past?day:today;}
  const heading=document.querySelector('#nutritionBalance h3');if(heading)heading.textContent='Energie dne';
  for(const node of document.querySelectorAll('#nutritionBalance .experience-stats span')){
    if(node.textContent==='Dnešní cíl'||node.textContent==='Cíl dne')node.textContent=past?'Cíl dne':'Dnešní cíl';
    if(node.textContent==='Kroky dnes'||node.textContent==='Kroky dne')node.textContent=past?'Kroky dne':'Kroky dnes';
  }
}
function sleepIndex(night){
  if(!night||!(Number(night.durationMin)>0))return null;
  const duration=Number(night.durationMin),bed=Number(night.timeInBedMin),deep=Number(night.stages?.DEEP),rem=Number(night.stages?.REM);
  if(!(bed>=duration)||!Number.isFinite(deep)||!Number.isFinite(rem))return null;
  return Math.round(50*Math.min(1,duration/480)+30*Math.min(1,duration/bed)+10*Math.min(1,deep/90)+10*Math.min(1,rem/90));
}
function recoveryIndex(rows,night,today){
  const current=rows.find(r=>r.id===today),prior=rows.filter(r=>r.id<today&&r.id>=dateShift(today,-30));
  const stats=key=>{const values=prior.map(r=>Number(r[key])).filter(v=>Number.isFinite(v)&&v>0),mean=values.reduce((s,v)=>s+v,0)/values.length,sd=Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length);return {count:values.length,mean,sd};};
  const h=stats('hrv'),r=stats('restingHR'),sleep=sleepIndex(night);
  if(night?.date!==today||sleep==null||!(Number(current?.hrv)>0)||!(Number(current?.restingHR)>0)||h.count<14||r.count<14)return {score:null,current,h,r};
  const clamp=v=>Math.max(0,Math.min(100,v)),hrv=clamp(50+20*(Number(current.hrv)-h.mean)/Math.max(5,h.sd)),heart=clamp(50-20*(Number(current.restingHR)-r.mean)/Math.max(3,r.sd));
  return {score:Math.round(.5*hrv+.3*heart+.2*sleep),current,h,r};
}
function correctDataPresentation(){
  const nights=primarySleepSessions(state.sleep?.sessions).filter(n=>(n.date||String(n.endTime||'').slice(0,10))<=selectedHistoryDate),last=nights[0],prior=nights.filter(n=>n.date<last?.date&&n.date>=dateShift(last?.date||selectedHistoryDate,-30)),avg=prior.length?prior.reduce((s,n)=>s+num(n.durationMin),0)/prior.length:null;
  const pulseDay=$('dailyPulse')?.querySelector('.pulse-header .eyebrow');if(pulseDay)pulseDay.textContent='TVŮJ DEN · '+longDate(selectedHistoryDate);
  const score=sleepIndex(last),delta=last&&avg!=null?last.durationMin-avg:null,cards=$('dailyPulse')?.querySelectorAll('.pulse-card'),stale=last?.date!==selectedHistoryDate;
  if(cards?.[0])cards[0].outerHTML=experienceRing('Spánek',score==null?'—':score+'%',score||0,'#a99bff','Spánkový index',last?(delta==null?'':(delta>=0?'+':'−')+hm(Math.abs(delta))+' proti průměru 30 dní · ')+dateLabel(last.date)+(stale?' · starší noc':''):'Čekám na noc');
  const food=state.daily?.nutrition?.foodLog?.totals||{},target=num(state.daily?.nutrition?.calorieTarget),macroEnergy=num(food.protein_g)*4+num(food.carbs_g)*4+num(food.fat_g)*9,fill=target?Math.min(100,num(food.kcal)/target*100):0,p=macroEnergy?num(food.protein_g)*4/macroEnergy*fill:0,c=macroEnergy?num(food.carbs_g)*4/macroEnergy*fill:0;
  const calorieCard=$('dailyPulse')?.querySelectorAll('.pulse-card')[2];if(calorieCard){calorieCard.querySelector('.label').textContent='Kalorie';
    const m=state.daily?.nutrition?.macros||{},goal=k=>num(m[k+'_g']??m[k+'Grams']),row=(label,key,color,eat)=>{const g=goal(key==='carbs'?'carbs':key);return '<div class="pulse-macro"><span><i style="background:'+color+'"></i>'+label+'</span><span class="pulse-macro-bar"><i style="width:'+(g?Math.min(100,eat/g*100):0)+'%;background:'+color+'"></i></span><b>'+fmt(eat)+(g?' / '+fmt(g):'')+' g</b></div>';};
    calorieCard.querySelector('.pulse-macros')?.remove();
    calorieCard.querySelector('div:not(.pulse-ring)')?.insertAdjacentHTML('beforeend','<div class="pulse-macros">'+row('Bílkoviny','protein','#60a5fa',num(food.protein_g))+row('Sacharidy','carbs','#f59e0b',num(food.carbs_g))+row('Tuky','fat','#a78bfa',num(food.fat_g))+'</div>');const ring=calorieCard.querySelector('.pulse-ring');if(ring){ring.style.background='conic-gradient(#60a5fa 0 '+p+'%,#f59e0b '+p+'% '+(p+c)+'%,#a78bfa '+(p+c)+'% '+fill+'%,#2a343e '+fill+'% 100%)';const strong=ring.querySelector('strong');if(strong)strong.textContent='';}}
  $('recoveryScore').textContent=score==null?'—':score+'%';$('recoveryOrb').style.setProperty('--orb-value',score||0);$('recoveryOrb').querySelector('span').textContent='Spánek';$('recoveryVsBaseline').textContent='';
  $('recoveryTitle').textContent='Spánek a regenerace';$('recoveryInsight').textContent=last?'Poslední noc '+dateLabel(last.date)+' · skutečný spánek '+hm(last.durationMin)+(last.timeInBedMin?' · v posteli '+hm(last.timeInBedMin):''):'Čekám na měření';
  const signal=recoverySignals(googleWellness(),last,selectedHistoryDate);$('recoveryGuide').textContent=signal.title;$('recoveryGuideMeta').textContent=signal.text;
  const recovery=recoveryIndex(googleWellness(),last,selectedHistoryDate);
  let panel=$('recoveryIndices');if(!panel){panel=document.createElement('div');panel.id='recoveryIndices';panel.className='recovery-indices';$('recoveryOrb').parentElement.after(panel);}
  panel.innerHTML='<div class="score-orb" style="--orb-value:'+(recovery.score??0)+';--orb-color:#83e9c3"><div><strong>'+(recovery.score??'—')+'</strong><span>Regenerace</span></div></div><div class="score-caption">Vlastní index · 0–100</div>';
  let metrics=$('recoveryVitals');if(!metrics){metrics=document.createElement('div');metrics.id='recoveryVitals';metrics.className='recovery-vitals';document.querySelector('.recovery-command').append(metrics);}
  metrics.innerHTML=[['HRV',recovery.current?.hrv,recovery.h,'ms',1,2],['Klidový tep',recovery.current?.restingHR,recovery.r,'bpm',-1,1]].map(([label,value,baseline,unit,dir,flat])=>'<div class="vital-tile"><span class="label">'+label+'</span><strong>'+(value>0?fmt(value,1)+' <small>'+unit+'</small>':'—')+'</strong>'+(baseline.count>=14&&value>0?'<span class="vital-delta">'+deltaBadge(value-baseline.mean,unit,dir,Math.max(flat,baseline.sd*.5),1)+'<span class="small">proti 30dennímu průměru '+fmt(baseline.mean,1)+' '+unit+'</span></span>':'<span class="small">Čekám na aktuální data a 14 dní historie</span>')+'</div>').join('')+'<details class="index-method"><summary>O skóre</summary><p>Spánek: délka vůči 8 h (50 bodů), efektivita spánku (30), hluboký spánek a REM vůči 90 minutám (po 10). Každá složka má vlastní strop. Jde o vlastní index, ne skóre Google nebo Bevel.</p><p>Regenerace: HRV 50 %, klidový tep 30 %, spánek 20 %. Tep a HRV porovnáváme s předchozími 30 dny: osobní průměr odpovídá 50 bodům v každé tepové složce. Minimálně 14 měření, pouze dnešní hodnoty. Index není procento zotavení ani klinicky ověřený model WHOOP.</p></details>';
  $('recoveryScore').style.fontSize='39px';$('recoveryVsBaseline').textContent='Vlastní spánkový index';$('sleepScore').innerHTML=score==null?'Bez dostatečných dat':scoreBadge(score,'Spánek');
  const w=googleWellness();metricDetail('detail-hrv','Variabilita srdečního tepu · HRV',w.map(r=>({date:r.id,value:r.hrv})),'ms','#3fda9c');metricDetail('detail-rhr','Klidový tep',w.map(r=>({date:r.id,value:r.restingHR})),'bpm','#ff9b80');
  const healthMetrics=$('healthspan').querySelectorAll('.healthspan-metrics>div');for(const [i,key,unit]of [[0,'restingHR','bpm'],[1,'hrv','ms'],[2,'vo2max','ml/kg/min']]){const rows=w.filter(r=>measured(r[key])),reading=key==='vo2max'?latestVo2():null,value=reading?.value??(rows.length?rows.reduce((s,r)=>s+Number(r[key]),0)/rows.length:null);if(healthMetrics[i]){healthMetrics[i].querySelector('strong').textContent=value==null?'—':fmt(value,1)+' '+unit;healthMetrics[i].querySelector('small').textContent=reading?reading.source+' · '+reading.date:'Google Health · '+(rows.at(-1)?.id||'bez měření');}}
  document.querySelector('.recovery-command .eyebrow').textContent='Spánek a regenerace';
  const g=state.googleHealth||{};$('sourceCoverage').innerHTML='<h3>Dostupnost dat · Google Health</h3>'+[['Spánek',last?.date],['HRV',latestGoogleMetric('hrv')?.id],['Klidový tep',latestGoogleMetric('restingHR')?.id],['Kroky',g.coverage?.steps],['Aktivní energie',g.coverage?.['active-energy-burned']]].map(([label,date])=>'<div class="metric-line"><span>'+label+'</span><strong>'+(date?dateLabel(date):'Bez měření')+'</strong></div>').join('')+'<p class="small">Synchronizace: '+esc(g.sync?.status||'neznámý stav')+(g.sync?.error?' · '+esc(g.sync.error):'')+'</p>';
  const labels={P:'Bílkoviny',C:'Sacharidy',F:'Tuky',Protein:'Bílkoviny',Tuk:'Tuky',Deep:'Hluboký spánek',Light:'Lehký spánek',Awake:'Bdění','Daily readiness':'Denní připravenost','Recovery & Health':'Spánek a zdraví','Recovery & Health ↗':'Spánek a zdraví ↗','rolling average':'klouzavý průměr','all time':'celá historie'};
  Object.assign(labels,{Fitness:'Kondice',Form:'Forma',Fatigue:'Únava',Refresh:'Obnovit','Private training workspace':'Osobní tréninkový přehled','Data is loaded server-side':'Data načítá server','Performance Command Center':'Trénink, zdraví a výživa','Training intelligence · Health · Nutrition':'Trénink · Zdraví · Výživa','Sleep consistency':'Pravidelnost spánku','Sleep architecture':'Fáze spánku','Body baseline':'Hmotnost a osobní trend','Health context':'Zdravotní souvislosti','Deep + REM':'Hluboký spánek + REM','Historie recovery a spánku':'Historie spánku a regenerace'});
  const walker=document.createTreeWalker(document.querySelector('.shell'),NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){const text=node.textContent.trim();if(labels[text])node.textContent=node.textContent.replace(text,labels[text]);else node.textContent=node.textContent.replace(/ · P (?=\d)/g,' · B ').replace(/ · C (?=\d)/g,' · S ').replace(/ · F (?=\d)/g,' · T ').replace(/kg · rolling average/g,'kg · klouzavý průměr');}
}
function daywideStrain(date){
  const rows=googleWellness(),row=rows.find(r=>r.id===date);
  if(!row||!measured(row.activeCalories))return null;
  const prior=rows.filter(r=>r.id<date&&r.id>=dateShift(date,-30)&&measured(r.activeCalories)&&Number(r.activeCalories)>0).map(r=>Number(r.activeCalories)).sort((a,b)=>a-b);
  const activeCalories=Math.round(Number(row.activeCalories)),baseline=prior.length>=7?prior[Math.floor(prior.length/2)]:null;
  return {activeCalories,baseline:baseline?Math.round(baseline):null,score:baseline?Math.round(Math.min(21,21*(1-Math.exp(-activeCalories/(baseline*1.2))))*10)/10:null};
}
// Day strain on the Whoop scale 0–21: the higher of the all-day activity score
// (active calories against the 30-day median) and the training load, whose TSS
// is put on a saturating curve (1 h endurance ≈ 10, 2 h ≈ 15, a hard 3–4 h ≈ 19).
// The higher one counts, because active calories already include training.
function trainingStrain(tss){return tss>0?Math.round(21*(1-Math.exp(-tss/90))*10)/10:0}
function strainBand(s){return s>=18?'Maximální':s>=14?'Vysoká':s>=10?'Střední':'Lehká'}
function dayStrain(date,tss){const s=Math.max(daywideStrain(date)?.score||0,trainingStrain(tss));return s>0?Math.round(s*10)/10:null}
function recoverySignals(rows,last,today){
  const current=rows.find(r=>r.id===today),baseline=rows.filter(r=>r.id<today&&r.id>=dateShift(today,-30)),summarize=key=>{const values=baseline.map(r=>r[key]).filter(v=>measured(v)).map(Number),mean=values.length?values.reduce((s,v)=>s+v,0)/values.length:null,sd=mean==null?null:Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length);return {count:values.length,mean,sd};},h=summarize('hrv'),r=summarize('restingHR'),details=[];
  let adverse=0,signals=0;
  if(measured(current?.hrv)&&h.count>=7){signals++;if(Number(current.hrv)<h.mean-Math.max(5,h.sd))adverse++;details.push('HRV '+fmt(current.hrv,1)+' ms proti průměru '+fmt(h.mean,1)+' ms');}
  if(measured(current?.restingHR)&&r.count>=7){signals++;if(Number(current.restingHR)>r.mean+Math.max(3,r.sd))adverse++;details.push('klidový tep '+fmt(current.restingHR)+' proti '+fmt(r.mean,1)+' bpm');}
  if(last?.date===today){signals++;if(num(last.durationMin)<360)adverse++;details.push('spánek '+hm(last.durationMin));}
  return {title:!signals?'Regenerace · čekám na dnešní měření':adverse>=2?'Regenerace · dnes zvolni':adverse===1?'Regenerace · jeden slabší signál':'Regenerace · obvyklé pásmo',text:details.join(' · ')+(signals?' . '+(adverse>=2?'Více signálů je oslabených. Upřednostni odpočinek a další intenzitu přizpůsob pocitu únavy.':adverse?'Sleduj únavu; jeden ukazatel sám nerozhoduje o tréninku.':'Dostupné signály nejsou výrazně oslabené; zohledni i svalovou únavu.'):' Pro srovnání potřebuji aktuální měření a alespoň 7 předchozích hodnot.')};
}
function renderTrainingClarity(){
  const days=state.week?.days||[],rows=days.map(d=>{const s=daywideStrain(d.date);return {label:dateLabel(d.date),values:[s?.score??null],title:longDate(d.date)+(s?.score!=null?' · celodenní zátěž '+fmt(s.score,1):s?' · '+s.activeCalories+' kcal aktivní energie, čekám na 7 dní baseline':' · celodenní aktivní energie není dostupná')};});
  const chart=$('loadChart'),card=chart.parentElement;card.querySelector('h3').textContent='Celodenní zátěž · vybraný týden';chart.outerHTML='<div id="loadChart">'+experienceBars(rows,{max:21,height:290,colors:['#a99bff']})+'</div>';let note=card.querySelector('.load-explanation');if(!note){note=document.createElement('p');note.className='small load-explanation';card.append(note);}note.textContent='Vlastní stupnice 0–21 z celodenní aktivní energie Google Health vůči osobnímu mediánu posledních 30 dní (minimálně 7 dní). Zahrnuje měřený běžný pohyb i sport, nikoli jen dokončené aktivity. Není to skóre WHOOP/Bevel. Chybějící měření není nula.';
  const selected=days.find(d=>d.date===selectedHistoryDate)||days.find(d=>d.date===pragueToday())||days[0],activities=(selected?.daily?.training?.completed||[]).filter(a=>!isNutritionItem(a));
  $('trainingActivityTable').innerHTML='<div class="notice">Vybraný den: <strong>'+esc(selected?longDate(selected.date):'—')+'</strong></div>'+(activities.length?'<div class="scroll"><table><thead><tr><th>Aktivita</th><th>Délka</th><th>Stav</th></tr></thead><tbody>'+activities.map(a=>'<tr><td>'+esc(a.name||'Aktivita')+'</td><td>'+hm(num(a.durationHours)*60)+'</td><td><span class="pill good">Dokončeno</span></td></tr>').join('')+'</tbody></table></div>':'<p class="small">Zatím žádná dokončená aktivita.</p>');
}
function renderRequestedExperience(done,latest,vo2,daily){
  const strain=daywideStrain(selectedHistoryDate),cards=$('dailyPulse').querySelectorAll('.pulse-card');
  if(cards[1])cards[1].outerHTML=experienceRing('Celodenní zátěž',strain?.score!=null?fmt(strain.score,1):'—',strain?.score!=null?strain.score/21*100:0,'#83e9c3','Zátěž',strain?.score!=null?'Google Health · '+strain.activeCalories+' aktivních kcal · osobní baseline '+strain.baseline+' kcal.':strain?'Google Health · '+strain.activeCalories+' aktivních kcal. Pro skóre potřebuji 7 předchozích dní.':'Celodenní aktivní energie není dostupná. Wahoo aktivita sama nezměří celý den.');
  const vo2Reading=latestVo2();vo2=vo2Reading?.value;const note=$('healthspan').querySelector('.healthspan-note');
  $('healthspan').querySelector('.healthspan-title').textContent='Kondice a dlouhodobý trend';
  note.innerHTML='<strong>VO₂ max · '+(measured(vo2)?fmt(vo2,1)+' ml/kg/min':'bez měření')+'</strong><p>'+(vo2Reading?esc(vo2Reading.source)+' · '+esc(vo2Reading.date)+'. ':'')+'Intervals.icu využívám pro jízdy a tréninkovou zátěž; samotné Wahoo aktivity nejsou přímé měření VO₂ max. Kondiční věk z jediné hodnoty nevyvozuji.</p>';
}
function renderFuelingBreakdown(daily){
  const profile=appProfile(),done=(daily.training?.completed||[]).filter(a=>!isNutritionItem(a));
  const weight=Number(daily.weight?.current??daily.nutrition?.currentWeight),bmr=weight>0&&profile.age&&profile.height&&profile.sex?10*weight+6.25*Number(profile.height)-5*Number(profile.age)+(profile.sex==='male'?5:-161):null;
  const current=state.week?.days?.find(d=>d.date===selectedHistoryDate)?.daily?.nutrition||daily.nutrition||{},breakdown=current.calorieBreakdown||{},burned=done.reduce((s,a)=>s+num(a.calories),0);
  const today=googleWellness().find(r=>r.id===selectedHistoryDate)||{},active=measured(today.activeCalories)?Number(today.activeCalories):null,steps=measured(today.steps)?fmt(today.steps):'—';
  const budget=daily.nutrition?.energyBudget;
  if(budget)$('nutritionBalance').insertAdjacentHTML('beforeend','<p class="small">'+(budget.basis==='profile'?'Cíl dne: klidový výdej × tvoje běžná denní aktivita, minus deficit '+fmt(budget.deficit)+' kcal, plus trénink. Zvýší se, jakmile naměřený pohyb z Google Health (teď '+fmt(budget.active)+' kcal aktivní energie) přesáhne obvyklý den.':'Průběžný cíl: dnes se hýbeš víc než obvykle, takže cíl počítáme z naměřeného výdeje: bazální metabolismus + aktivní energie + trávení (10 %), minus deficit '+fmt(budget.deficit)+' kcal. Cíl se během dne mění s novými daty.')+'</p>');
  $('nutritionBalance').insertAdjacentHTML('beforeend','<div class="experience-stats"><div><span>Dnešní cíl</span><strong>'+fmt(daily.nutrition?.calorieTarget)+' kcal</strong></div><div><span title="Výpočet Mifflin–St Jeor z hmotnosti, věku, výšky a referenčního pohlaví">Bazální metabolismus</span><strong>'+(bmr?fmt(bmr)+' kcal':'Doplň profil')+'</strong></div><div><span>Aktivní výdej · celý den</span><strong>'+(active==null?'Čekám na Google':fmt(active)+' kcal')+'</strong></div><div><span>Kroky dnes</span><strong>'+steps+'</strong></div></div><p class="small">'+done.map(a=>esc(a.name)+esc(activityEnergyLabel(a)||' · výdej chybí')).join(' · ')+'</p><p class="small">'+(active==null?'Dnešní celodenní energie z Googlu chybí. Starší kroky ani energii nepřičítám k dnešku; cíl zatím vychází z tréninkového plánu.':'Celodenní aktivní výdej zahrnuje běžný pohyb i sport. Stejné aktivity ani kroky nepřičítám podruhé.')+'</p>');
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
  $('settings').insertAdjacentHTML('beforeend','<article class="card" style="margin-top:16px"><h3>Profil pro vlastní výpočty</h3><p class="small">Pouze v tomto prohlížeči. Cardio strain je vlastní logaritmický odhad z délky a průměrného tepu vůči tepové rezervě, nikoli převod TSS ani WHOOP algoritmus.</p><form id="fitnessProfileForm" class="food-editor-grid"><label>Referenční pohlaví<select class="food-input" id="profileSex"><option value="">Vyber</option><option value="male">Muž</option><option value="female">Žena</option></select></label><label>Věk<input id="profileAge" class="food-input" type="number" min="18" max="100"></label><label>Výška · cm<input id="profileHeight" class="food-input" type="number" min="100" max="230"></label><label>Maximální tep · bpm<input id="profileHrmax" class="food-input" type="number" min="100" max="230"></label><button class="btn primary">Uložit profil</button></form></article>');
  const profile=savedProfile();for(const [id,key]of [['profileSex','sex'],['profileAge','age'],['profileHeight','height'],['profileHrmax','hrmax']])$(id).value=profile[key]||'';
  $('fitnessProfileForm').onsubmit=e=>{e.preventDefault();localStorage.setItem('fitnessProfile',JSON.stringify({...savedProfile(),sex:$('profileSex').value,age:$('profileAge').value,height:$('profileHeight').value,hrmax:$('profileHrmax').value}));renderExperience();toast('Profil uložen.');};
  $('foodEntry').insertAdjacentHTML('beforeend','<div style="margin-top:18px"><h3>Z kuchařky podle stránky</h3><div class="food-controls"><input id="recipeRequest" class="food-input" placeholder="Měl jsem 1 porci ze stránky 70"><button class="btn" id="recipeLookup" type="button">Načíst recept</button></div><p class="small">Také k fotce můžeš zadat „strana 65“. Načtení receptu nahradí návrh z fotografie; nezapisuje ho podruhé.</p></div>');
  $('recipeLookup').onclick=async()=>{try{const text=$('recipeRequest').value,match=text.match(/(?:str[aá]n(?:ka|ky|ce|u|a)?|page)\s*(\d{1,3})/i)||text.match(/^\s*(\d{1,3})\s*$/);if(!match)throw new Error('Zadej například strana 70.');const r=await jsonFetch('/app/api/food/recipe?page='+match[1]),recipe=r.recipe;selectFoodProduct({name:recipe.title||recipe.name,calories_100g:recipe.kcal??recipe.calories,protein_100g:recipe.protein_g,carbs_100g:recipe.carbs_g,fat_100g:recipe.fat_g,nutrition_basis:'portion',source:'package_label'});const portion=text.match(/(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*porc/i);$('foodGrams').value=portion?portion[1]:'1';updateFoodPreview();foodMessage('Recept ze stránky '+match[1]+' je připravený. Ulož ho jako jedno jídlo.');}catch(e){foodMessage(e.message);}};
}
function installPortionControls(){
  const layout=document.createElement('div');layout.className='food-selection-layout';$('foodResults').before(layout);const choices=document.createElement('div');layout.append(choices,$('foodEditor'));choices.append($('foodResults'),$('foodOcrDetails'));layout.after($('ingredientBasket'));
  const css=document.createElement('style');css.textContent='.food-selection-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start}.food-selection-layout .food-editor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.food-selection-layout #foodEditor{margin-top:0!important;padding:16px;background:#101820;border-radius:18px}.food-selection-layout #foodResults{max-height:700px;overflow:auto}.food-selection-layout .food-input{min-width:0;width:100%;box-sizing:border-box}#foodQuickAmounts{flex-wrap:wrap}@media(max-width:900px){.food-selection-layout{grid-template-columns:1fr}}';document.head.append(css);
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
  const macros=daily.nutrition?.macros||{},p=num(food.protein_g)*4,c=num(food.carbs_g)*4,f=num(food.fat_g)*9,energy=p+c+f,ps=energy?p/energy*100:0,cs=energy?c/energy*100:0,donut=energy?'conic-gradient(#83c7ff 0 '+ps+'%,#ffc274 '+ps+'% '+(ps+cs)+'%,#b3a1ff '+(ps+cs)+'% 100%)':'#2a343e';
  const rows=[['Bílkoviny','protein_g',macros.protein_g??macros.proteinGrams,'#83c7ff'],['Sacharidy','carbs_g',macros.carbs_g??macros.carbsGrams,'#ffc274'],['Tuky','fat_g',macros.fat_g??macros.fatGrams,'#b3a1ff']];
  $('nutritionBalance').innerHTML='<div class="experience-heading"><h3>Energie dne</h3><small>'+fmt(food.kcal)+' / '+(target?fmt(target):'—')+' kcal</small></div><div class="nutrition-layout"><div class="nutrition-donut" style="--donut:'+donut+'"><strong>'+fmt(food.kcal)+'</strong></div><div>'+rows.map(([name,key,tone,color])=>{const goal=num(tone),value=num(food[key]),share=energy?(key==='fat_g'?f:key==='carbs_g'?c:p)/energy*100:0;return '<div class="nutrient-row"><span>'+name+'<small class="small" style="display:block">'+fmt(share)+' % energie z maker</small></span><div class="nutrient-track"><i style="width:'+Math.min(100,goal?value/goal*100:0)+'%;background:'+color+'"></i></div><strong>'+fmt(value)+' / '+(goal?fmt(goal):'—')+' g</strong></div>';}).join('')+'</div></div><p class="small">Poměr vychází z 4 kcal/g bílkovin a sacharidů, 9 kcal/g tuku. Energie z obalu se může lišit.</p>';
  const entries=mealEntries||[],enabled=mealSlots.filter(s=>mealEnabled.includes(s.id)),mealRows=enabled.map(s=>({label:s.name.replace('Dopolední svačina','Sv. dopo.').replace('Odpolední svačina','Sv. odpo.'),values:[entries.filter(e=>foodMealSlot(e)===s.id).reduce((sum,e)=>sum+num(e.kcal),0)]})),max=Math.max(400,...mealRows.map(r=>r.values[0]))*1.15;
  $('mealDistribution').innerHTML='<div class="experience-heading"><h3>Energie během dne</h3><small>'+esc($('foodDate')?.value||pragueToday())+' · kcal</small></div>'+experienceBars(mealRows,{max,colors:['#83e9c3'],height:240})+'<p class="small">Pouze zapsaná jídla v deníku. Nezapsané jídlo neznamená, že jsi nejedl.</p>';
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
      return '<button class="activity-summary-card gym" data-activity-detail="'+i+'"><div class="eyebrow">'+esc(longDate(a.date))+' · Gym</div><h3>'+esc(a.gymOnly?'Posilovna':a.name||'Posilovna')+'</h3><div class="activity-numbers"><div><strong>'+exercises+'</strong><small>cviků</small></div><div><strong>'+a.gymSets.length+'</strong><small>sérií</small></div><div><strong>'+(measured(hr)?fmt(hr):fmt(volume))+'</strong><small>'+(measured(hr)?'Ø tep · bpm':'objem · kg')+'</small></div></div><p class="small">Otevřít cviky a série ↗</p></button>';}
    const hr=a.payload?.average_heartrate??a.averageHeartRate;
    return '<button class="activity-summary-card" data-activity-detail="'+i+'"><div class="eyebrow">'+esc(longDate(a.date))+' · '+esc(a.type||'Aktivita')+'</div><h3>'+esc(a.name||'Aktivita')+'</h3><div class="activity-numbers"><div><strong>'+hm(num(a.durationHours)*60)+'</strong><small>Doba pohybu</small></div><div><strong>'+(measured(hr)?fmt(hr):'—')+'</strong><small>Ø tep · bpm</small></div><div><strong>'+(measured(a.calories)?fmt(a.calories):'—')+'</strong><small>kcal</small></div></div><p class="small">'+(a.source==='google-health'?'Google Health · detail ↗':'Otevřít výkon, tep a GPS trasu ↗')+'</p></button>';
  };
  $('activityGallery').innerHTML=shown.length?shown.map(card).join(''):'<div class="data-gap">V tomto týdnu nejsou dostupné dokončené aktivity.</div>';
  $('activityGallery').querySelectorAll('[data-activity-detail]').forEach(b=>b.onclick=()=>{const a=shown[Number(b.dataset.activityDetail)];if(a.gymSets)openGymSessionProfile(a);else openActivityProfile(a);});
}
function openGymSessionProfile(a){
  const el=$('activityProfile');el.hidden=false;
  const groups=new Map();for(const r of a.gymSets){if(!groups.has(r.exercise))groups.set(r.exercise,[]);groups.get(r.exercise).push(r);}
  const volume=a.gymSets.reduce((s,r)=>s+num(r.actual_kg??r.actualKg)*num(r.actual_reps??r.actualReps),0);
  el.innerHTML='<div class="experience-heading"><h3>'+esc(a.gymOnly?'Posilovna':a.name||'Posilovna')+' · '+esc(longDate(a.date))+'</h3><span class="pill">Gym · uložené série</span></div><div class="experience-stats">'+[['Cviky',groups.size],['Série',a.gymSets.length],['Objem',fmt(volume)+' kg'],['Ø tep',measured(a.payload?.average_heartrate)?fmt(a.payload.average_heartrate)+' bpm':'—']].map(([l,v])=>'<div><span>'+l+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div><div class="scroll"><table><thead><tr><th>Cvik</th><th>Série</th><th>Nejvyšší váha</th><th>Opakování</th></tr></thead><tbody>'+[...groups].map(([name,sets])=>'<tr><td>'+esc(name||'Cvik')+'</td><td>'+sets.length+'</td><td>'+fmt(Math.max(...sets.map(r=>num(r.actual_kg??r.actualKg))),1)+' kg</td><td class="small">'+sets.map(r=>esc(String(r.actual_kg??r.actualKg??'—'))+' × '+esc(String(r.actual_reps??r.actualReps??'—'))).join(' · ')+'</td></tr>').join('')+'</tbody></table></div>';
  el.scrollIntoView({behavior:'smooth',block:'start'});
}
function activityStreamChart(stream,color,label,unit){
  const pts=stream?.points||[];if(!pts.length)return '<div class="data-gap">'+esc(label)+' není v této aktivitě dostupný.</div>';const max=Math.max(1,...pts.map(p=>p.v))*1.1,tmax=Math.max(1,...pts.map(p=>p.t)),y=v=>220-v/max*190,x=t=>55+t/tmax*675;let out='';for(let j=0;j<4;j++){const v=max*j/3;out+='<line x1="55" x2="730" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#29323d"/><text x="47" y="'+(y(v)+5)+'" font-size="13" fill="#a0b1c5" text-anchor="end">'+fmt(v)+'</text>';}
  out+='<polyline points="'+pts.map(p=>x(p.t)+','+y(p.v)).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2"/><text x="55" y="255" fill="#a9b8c8" font-size="14">0 min</text><text x="730" y="255" fill="#a9b8c8" font-size="14" text-anchor="end">'+fmt(tmax/60)+' min</text>';return '<h3>'+esc(label)+' · '+unit+'</h3><svg class="experience-chart" viewBox="0 0 760 275" role="img" aria-label="'+esc(label)+'">'+out+'</svg>';
}
function activityRouteSvg(stream){
  const points=stream?.points||[];if(points.length<2)return '<div class="data-gap">GPS trasa není dostupná. Indoor aktivita nebo zdroj bez GPS není vykreslený jako smyšlená mapa.</div>';const latMean=points.reduce((s,p)=>s+p.v[0],0)/points.length,coords=points.map(p=>[p.v[1]*Math.cos(latMean*Math.PI/180),p.v[0]]),xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min(700/Math.max(.00001,maxX-minX),310/Math.max(.00001,maxY-minY)),project=p=>[30+(p[0]-minX)*scale+(700-(maxX-minX)*scale)/2,345-(p[1]-minY)*scale-(310-(maxY-minY)*scale)/2],route=coords.map(project),start=route[0],end=route.at(-1);
  return '<div class="route-map"><svg class="experience-chart" viewBox="0 0 760 380" role="img" aria-label="Skutečná GPS trasa"><defs><pattern id="routeGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#284438" stroke-width="1"/></pattern></defs><rect width="760" height="380" fill="url(#routeGrid)"/><polyline points="'+route.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#8ff0ca" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="'+start[0]+'" cy="'+start[1]+'" r="7" fill="#fff" stroke="#13231b" stroke-width="3"/><circle cx="'+end[0]+'" cy="'+end[1]+'" r="6" fill="#ffc274"/><text x="710" y="28" fill="#b8d6c8" font-size="16">N ↑</text></svg></div><p class="route-caption">Skutečný průběh GPS · bílá = start, oranžová = cíl. Bez mapových dlaždic: souřadnice neposíláme externím mapovým službám.</p>';
}
async function openActivityProfile(activity){
  const el=$('activityProfile');el.hidden=false;el.innerHTML='<h3>'+esc(activity.name||'Detail aktivity')+'</h3><div class="notice">Načítám detail z Intervals.icu…</div>';el.scrollIntoView({behavior:'smooth',block:'start'});
  if(activity.source&&activity.source!=='intervals'){const m=activity.payload?.exercise?.metricsSummary||{},hr=activity.payload?.average_heartrate??activity.averageHeartRate,dist=num(m.distanceMillimeters)/1e6;el.innerHTML='<div class="experience-heading"><h3>'+esc(activity.name||'Detail aktivity')+'</h3><span class="pill">'+esc(activity.source==='google-health'?'Google Health':activity.source)+' · souhrn</span></div><div class="experience-stats">'+[['Doba pohybu',hm(num(activity.durationHours)*60)],['Průměrný tep',measured(hr)?fmt(hr)+' bpm':'neměřeno'],['Energie',measured(activity.calories)?fmt(activity.calories)+' kcal':'—'],['Vzdálenost',dist>0?fmt(dist,2)+' km':'—'],['Kroky',measured(m.steps)?fmt(m.steps):'—']].map(([l,v])=>'<div><span>'+l+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div><p class="small">Zdroj poskytuje souhrn aktivity (i automaticky rozpoznané chůze), ne průběh výkonu ani GPS stopu. Trasu ani průběh nevymýšlíme.</p>';return;}
  const id=activity.payload?.id||activity.externalId||activity.sourceId||String(activity.id||'').replace(/^intervals[:_-]/,'');
  try{const result=await jsonFetch('/app/api/activity-detail?id='+encodeURIComponent(id));state.lastActivityDetail={id,result};const a=result.activity||{},streams=result.streams||[],np=a.icu_normalized_watts??a.icu_weighted_average_watts;
    el.innerHTML='<div class="experience-heading"><h3>'+esc(a.name||activity.name)+'</h3><span class="pill">Intervals.icu · naměřené hodnoty</span></div><div class="experience-stats">'+[['Vzdálenost',measured(a.distance)?fmt(a.distance/1000,1)+' km':'—'],['Převýšení',measured(a.total_elevation_gain)?fmt(a.total_elevation_gain)+' m':'—'],['Normalizovaný výkon',measured(np)?fmt(np)+' W':'—']].map(([label,value])=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>').join('')+'</div>'+activityRouteSvg(streams.find(s=>s.type==='latlng'))+'<div class="experience-grid"><div>'+activityStreamChart(streams.find(s=>s.type==='watts'),'#83e9c3','Výkon','W')+'</div><div>'+activityStreamChart(streams.find(s=>s.type==='heartrate'),'#ff9c97','Tep','bpm')+'</div></div><p class="small">Průběh je zmenšený na nejvýše přibližně 1200 bodů na signál. Nejde o automatické hodnocení jednotlivých intervalů.</p>';
  }catch(error){el.innerHTML='<h3>'+esc(activity.name||'Detail aktivity')+'</h3><div class="data-gap">'+esc(error.message)+'</div><button class="btn" id="profileSettings" style="margin-top:12px">Přejít do Nastavení</button>';$('profileSettings').onclick=()=>activate('settings');}
}
function installFoodEntry(){
  const style=document.createElement('style');style.textContent='.food-controls{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.food-controls input{flex:1;min-width:150px}.food-input{background:#0d1119;color:#f6f7fb;border:1px solid #393245;border-radius:9px;padding:10px;max-width:100%;font:inherit}.food-actions{display:flex;gap:8px;flex-wrap:wrap}.food-result{display:block;text-align:left;width:100%;background:#181e29;color:#f6f7fb;border:1px solid #343b4b;border-radius:10px;padding:12px;margin:7px 0}.food-result strong,.food-result span{display:block}.food-editor-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0}.food-editor-grid label{display:grid;gap:5px;color:#aab3c2;font-size:12px}.food-editor-grid input,.food-editor-grid select{width:100%;min-width:0}.food-upload{display:inline-block;cursor:pointer}.food-ocr-text{width:100%;min-height:130px;resize:vertical}.food-result:hover{border-color:#a978ff}@media(max-width:700px){.food-editor-grid{grid-template-columns:1fr 1fr}.food-actions .btn{flex:1}.food-controls{flex-direction:column}}';document.head.appendChild(style);
  $('nutrition').insertAdjacentHTML('afterbegin','<div class="card" style="margin-bottom:16px" id="foodEntry"><div class="eyebrow">Potraviny a výrobky</div><h3 style="font-size:22px;margin-top:5px">Co jsi snědl?</h3><p class="small">Vyhledej běžnou potravinu, přesný výrobek a značku nebo načti jeho obal.</p><div class="food-controls"><input class="food-input" id="foodQuery" placeholder="Např. jogurt Hollandia, rohlík, banán" aria-label="Název potraviny"><input class="food-input" id="foodBarcode" inputmode="numeric" placeholder="Čárový kód / EAN" aria-label="Čárový kód"><button type="button" class="btn primary" id="foodSearchButton">Dohledat</button></div><div class="food-actions"><label class="btn food-upload">Fotka čárového kódu<input hidden id="foodBarcodePhoto" type="file" accept="image/*" capture="environment"></label><label class="btn food-upload">Fotka nutriční etikety<input hidden id="foodLabelPhoto" type="file" accept="image/*" capture="environment"></label><button type="button" class="btn" id="foodManual">Zadat hodnoty ručně</button></div><div class="small" id="foodEntryStatus" role="status" style="margin-top:12px">Hledá v tvých uložených potravinách. Fotografie se čtou v prohlížeči.</div><div id="foodResults"></div><details id="foodOcrDetails" style="margin-top:12px"><summary>Text z etikety / vložit zkopírovaný text</summary><textarea id="foodOcrText" class="food-input food-ocr-text" placeholder="Energie 81 kcal&#10;Tuky 1,6 g&#10;Sacharidy 6,4 g&#10;Bílkoviny 10 g"></textarea><button type="button" class="btn" id="foodApplyLabel">Načíst hodnoty z textu</button></details><form id="foodEditor" hidden style="margin-top:16px"><h3>Zkontroluj výrobek a porci</h3><div class="small" id="foodSource"></div><div class="food-editor-grid"><label>Název<input class="food-input" id="foodProductName" required></label><label>Značka<input class="food-input" id="foodBrand"></label><label>Množství · g<input class="food-input" id="foodGrams" inputmode="decimal" value="100" required></label><label>Datum<input type="date" class="food-input" id="foodDate" required></label><label>Jídlo<select class="food-input" id="foodMeal"><option value="breakfast">Snídaně</option><option value="lunch">Oběd</option><option value="dinner">Večeře</option><option value="snack" selected>Svačina</option></select></label></div><div class="label">Hodnoty na 100 g · u tekutin na 100 ml, množství pak zadej v ml</div><div class="food-editor-grid">'+[['calories_100g','Energie · kcal'],['protein_100g','Bílkoviny · g'],['carbs_100g','Sacharidy · g'],['fat_100g','Tuky · g'],['fiber_100g','Vláknina · g'],['salt_100g','Sůl · g']].map(([k,label])=>'<label>'+label+'<input class="food-input" id="food-'+k+'" inputmode="decimal" '+(['fiber_100g','salt_100g'].includes(k)?'':'required')+'></label>').join('')+'</div><div class="notice" id="foodPortionPreview"></div><label class="small" style="display:block;margin:12px 0"><input type="checkbox" id="foodConfirmed" required> Ověřil jsem výrobek, množství a hodnoty na 100 g / ml.</label><button type="submit" class="btn primary" id="foodSaveButton">Zapsat snědené jídlo</button></form></div><div id="enteredFood" style="margin-bottom:16px"></div>');
  $('enteredFood').insertAdjacentHTML('afterend','<dialog id="foodManageDialog" aria-labelledby="foodManageTitle"><form id="foodManageForm"><input type="hidden" name="id"><div class="detail-heading"><h3 id="foodManageTitle">Upravit zapsané jídlo</h3><button type="button" class="btn" id="foodManageClose" aria-label="Zavřít">✕</button></div><div class="food-manage-grid"><label>Název<input class="food-input" name="name" required maxlength="180"></label><label>Datum<input class="food-input" name="date" type="date" required></label><label>Část dne<select class="food-input" name="mealType">'+mealSlots.map(s=>'<option value="'+s.id+'">'+s.name+'</option>').join('')+'</select></label><label>Kalorie · kcal<input class="food-input" name="kcal" type="number" min="0" max="10000" step="0.1" required></label><label>Bílkoviny · g<input class="food-input" name="protein_g" type="number" min="0" max="1000" step="0.1" required></label><label>Sacharidy · g<input class="food-input" name="carbs_g" type="number" min="0" max="1000" step="0.1" required></label><label>Tuky · g<input class="food-input" name="fat_g" type="number" min="0" max="1000" step="0.1" required></label></div><div class="food-manage-actions"><button class="btn primary" type="submit">Uložit změny</button><button class="btn" type="button" id="foodManageDelete">Smazat záznam</button></div><div class="food-copy-controls"><label>Kopírovat do dne<input class="food-input" id="foodCopyDate" type="date"></label><button type="button" class="btn" id="foodManageCopy">Kopírovat jídlo</button></div></form></dialog>');
  $('foodEntry').before($('enteredFood'));
  $('enteredFood').addEventListener('click',event=>{const edit=event.target.closest('[data-edit-food]'),copy=event.target.closest('[data-copy-food]'),remove=event.target.closest('[data-delete-food]');if(edit)openFoodManage(edit.dataset.editFood);else if(copy)openFoodManage(copy.dataset.copyFood,true);else if(remove){openFoodManage(remove.dataset.deleteFood);$('foodManageDelete').focus()}});
  $('enteredFood').addEventListener('change',event=>{if(event.target.matches('[data-move-food]')&&event.target.value)changeFoodMeal(Number(event.target.dataset.moveFood),event.target.value)});
  $('foodManageClose').onclick=()=>$('foodManageDialog').close();
  $('foodManageForm').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('[type="submit"]');button.disabled=true;try{const body=Object.fromEntries(new FormData(form));await jsonFetch('/app/api/food/entry',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('foodManageDialog').close();toast('Změny v jídle jsou uložené.');await refreshFoodDiary()}catch(error){toast('Úprava selhala: '+error.message)}finally{button.disabled=false}};
  $('foodManageCopy').onclick=async()=>{const button=$('foodManageCopy'),targetDate=$('foodCopyDate').value;if(!targetDate){toast('Vyber den pro kopii.');return}button.disabled=true;try{await jsonFetch('/app/api/food/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:$('foodManageForm').elements.id.value,targetDate})});$('foodManageDialog').close();toast('Jídlo je zkopírované do '+dateLabel(targetDate)+'.');await refreshFoodDiary()}catch(error){toast('Kopie selhala: '+error.message)}finally{button.disabled=false}};
  $('foodManageDelete').onclick=async()=>{const id=$('foodManageForm').elements.id.value,name=$('foodManageForm').elements.name.value;if(!window.confirm('Opravdu smazat „'+name+'“ z deníku?'))return;const button=$('foodManageDelete');button.disabled=true;try{await jsonFetch('/app/api/food/entry',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});$('foodManageDialog').close();toast('Jídlo je smazané.');await refreshFoodDiary()}catch(error){toast('Smazání selhalo: '+error.message)}finally{button.disabled=false}};
  $('foodLabelPhoto').closest('label').insertAdjacentHTML('afterend','<label class="btn food-upload">Fotka hodnot za moji porci<input hidden id="foodPortionPhoto" type="file" accept="image/*"></label>');
  $('foodOcrText').insertAdjacentHTML('beforebegin','<label>Základ fotografie<select class="food-input" id="foodPhotoMode"><option value="label">Na 100 g / ml</option><option value="portion">Za celou moji porci</option></select></label>');
  $('foodGrams').parentElement.firstChild.textContent='Množství · například 1/2';$('foodGrams').inputMode='text';
  $('foodGrams').parentElement.insertAdjacentHTML('afterend','<label>Jednotka<select id="foodUnit" class="food-input"><option value="g">g</option><option value="ml">ml</option><option value="piece">kus</option><option value="pack">balení / jednotlivý obal</option><option value="portion">porce</option></select></label><label>Nutriční hodnoty<select id="foodBasis" class="food-input"><option value="g">Na 100 g</option><option value="ml">Na 100 ml</option><option value="portion">Za jednu porci</option></select></label>');
  $('foodEditor').querySelector('.label').id='foodBasisLabel';
  $('foodPortionPreview').insertAdjacentHTML('beforebegin','<div id="foodPieceSettings" class="food-editor-grid" hidden><label>Velikost jednoho kusu<input id="foodPieceAmount" class="food-input" inputmode="decimal" placeholder="Podle obalu nebo vážení"></label><label>Jednotka kusu<select id="foodPieceUnit" class="food-input"><option value="g">g</option><option value="ml">ml</option></select></label></div><div id="foodDensitySettings" hidden><label>Hustota · g/ml<input id="foodDensity" class="food-input" inputmode="decimal" placeholder="Nutná pouze pro převod g ↔ ml"></label></div>');
  $('foodConfirmed').closest('label').remove();
  $('foodDate').value=pragueToday();$('foodDate').onchange=loadEnteredFood;$('foodSearchButton').onclick=searchFood;for(const id of ['foodQuery','foodBarcode'])$(id).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchFood();}};
  $('foodBarcodePhoto').onchange=e=>readFoodPhoto(e.target.files[0],'barcode');$('foodLabelPhoto').onchange=e=>readFoodPhoto(e.target.files[0],'label');$('foodPortionPhoto').onchange=e=>readFoodPhoto(e.target.files[0],'portion');$('foodApplyLabel').onclick=()=>applyFoodLabel();$('foodManual').onclick=()=>selectFoodProduct({name:$('foodQuery').value.trim(),barcode:$('foodBarcode').value.trim(),source:'package_label'});$('foodEditor').onsubmit=saveFoodEntry;$('foodEditor').oninput=()=>{updateFoodPreview();};loadEnteredFood();
}
installDetailViews();installFoodEntry();installExperience();installRequestedExperience();installPortionControls();
if(location.hash==='#settings')activate('settings');
function installDataCorrections(){
  $('foodEditor').addEventListener('input',()=>{for(const span of $('basketRows').querySelectorAll('span'))span.textContent=span.textContent.replace(/\bportion\b/g,'porce');});
  const originalTraining=renderTraining;renderTraining=function(){originalTraining();renderTrainingClarity();};
  $('foodManual').onclick=()=>{selectFoodProduct({name:$('foodQuery').value.trim(),barcode:$('foodBarcode').value.trim(),source:'package_label',nutrition_basis:'g'});foodMessage('Zadej hodnoty na 100 g a hmotnost balení. Porci nebo kus můžeš doplnit podle obalu.');};
  $('foodBasis').addEventListener('change',()=>{if($('foodBasis').value==='portion'){$('foodUnit').value='portion';$('foodGrams').value='1';}else if($('foodUnit').value==='portion'){$('foodUnit').value=$('foodBasis').value;$('foodGrams').value='100';}updateFoodPreview();$('foodGrams').dispatchEvent(new Event('input',{bubbles:true}));});
  const saveBasket=$('basketSave').onclick;$('basketSave').onclick=async()=>{try{if(!$('foodEditor').hidden){const p=foodEditorProduct();if(['calories_100g','protein_100g','carbs_100g','fat_100g'].some(k=>p[k]==null||!Number.isFinite(p[k])||p[k]<0))throw new Error('Doplň energii a všechna makra. Nula je platná hodnota.');foodIntake(p,$('foodGrams').value,$('foodUnit').value,{pieceAmount:$('foodPieceAmount').value,pieceUnit:$('foodPieceUnit').value,density:$('foodDensity').value});$('foodGrams').dispatchEvent(new Event('input',{bubbles:true}));if(!$('basketName').value.trim()&&$('basketRows').querySelectorAll('[data-edit-ingredient]').length===1)$('basketName').value=p.name;}await saveBasket();}catch(e){foodMessage(e.message);}};
  for(const heading of $('settings').querySelectorAll('h3')){if(heading.textContent==='Jak pracujeme s více zdroji'){heading.parentElement.querySelector('p').textContent='Cyklistické aktivity čerpáme z Intervals.icu. Spánek, HRV, klidový tep, kroky, celodenní aktivní energii a ostatní dokončené aktivity čerpáme z Google Health. Dostupnost a stáří konkrétních měření najdeš v části Spánek a zdraví.';}}
  $('fitnessProfileForm').previousElementSibling.textContent='Profil se ukládá na server i do tohoto prohlížeče. Celodenní zátěž vychází z aktivní energie Google Health a osobní baseline; nejde o algoritmus WHOOP ani Bevel.';
  const css=document.createElement('style');css.textContent='#calChart,#nutritionChart{height:auto!important;width:100%;aspect-ratio:1000/440;display:block}.experience-stats{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.macro-line{gap:12px;white-space:nowrap}.pulse-card{min-width:0}.pulse-card h3{font-size:19px}.pulse-card p{overflow-wrap:anywhere}.stack-chart{max-width:none!important}';document.head.append(css);
  $('profileHrmax').parentElement.insertAdjacentHTML('afterend','<label>Klidový tep · bpm<input id="profileRhr" class="food-input" type="number" min="25" max="120" placeholder="Automaticky z Googlu"></label>');$('profileRhr').value=savedProfile().rhr||'';
  const saveProfile=$('fitnessProfileForm').onsubmit;$('fitnessProfileForm').onsubmit=async e=>{saveProfile(e);localStorage.setItem('fitnessProfile',JSON.stringify({...savedProfile(),rhr:$('profileRhr').value}));try{await jsonFetch('/app/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(savedProfile())});await load();toast('Profil uložen a výpočty aktualizované.');}catch(error){toast('Profil je pouze v prohlížeči: '+error.message);}renderExperience();correctDataPresentation();};
  $('foodSaveButton').insertAdjacentHTML('beforebegin','<button type="button" class="btn" id="savePersonalFood">Uložit potravinu pro příště</button>');$('savePersonalFood').onclick=async()=>{try{await jsonFetch('/app/api/food/personal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(foodEditorProduct())});foodMessage('Potravina je uložená v tvojí databázi. Příště ji najdeš podle názvu i podobného zadání.');}catch(e){foodMessage(e.message);}};
  const selectWithSource=selectFoodProduct;selectFoodProduct=function(p){selectWithSource(p);if(p.source==='personal')$('foodSource').textContent='Moje databáze · tvoje uložené nutriční hodnoty';};
  const oldExperience=renderExperience;renderExperience=function(){oldExperience();correctDataPresentation();};
  const oldLoad=load;load=async()=>{$('viewDate').value=selectedHistoryDate;$('nextDay').disabled=selectedHistoryDate>=pragueToday();if($('foodDate'))$('foodDate').value=selectedHistoryDate;try{state.googleHealth=await jsonFetch('/app/api/google-health?date='+selectedHistoryDate);}catch(e){state.googleHealth={wellness:[],sync:{status:'error',error:e.message}};}await oldLoad();if(selectedHistoryDate!==pragueToday()){try{const coaches=await jsonFetch('/app/api/coaches?date='+selectedHistoryDate);if(coaches.date!==selectedHistoryDate)throw new Error('Historická data poradců chybí.');state.coaches=coaches;renderCoachCouncil();}catch{$('coachPriorities').textContent='Historické hodnocení není dostupné.';$('coachCards').innerHTML='';}}const today=state.week?.days?.find(d=>d.date===selectedHistoryDate);if(today&&state.daily?.nutrition?.energyBudget){today.daily.nutrition=state.daily.nutrition;today.daily.calories=state.daily.calories;renderOverview();renderNutrition();}correctDataPresentation();labelSelectedDay();if($('enteredFood'))loadEnteredFood();};
  const oldActivate=activate;activate=function(id){oldActivate(id);if(state.daily)correctDataPresentation();};
}
function simpleFoodPortions(product){
  const meta=foodPortionDefaults(product),options=[];
  if(product.nutrition_basis==='portion')return [{key:'portion',label:'Porce',unit:'portion',size:1}];
  if(meta.package)options.push({key:'pack',label:'Balení ('+meta.package.amount+' '+meta.package.unit+')',unit:'pack',size:1});
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
  const style=document.createElement('style');style.textContent='#foodEditor{border:1px solid #33404a;border-radius:20px!important;padding:24px!important}.simple-food-hero h3{display:block!important;font-size:27px;margin:9px 0 22px;line-height:1.2}.simple-food-macros{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:18px 0;border-top:1px solid #2d3944;border-bottom:1px solid #2d3944;margin-bottom:20px}.simple-food-macros strong{display:block;font-size:21px;white-space:nowrap}.simple-food-macros strong small{font-size:12px;font-weight:500}.simple-food-macros span{display:block;font-size:12px;color:#a6b5c4;margin-top:6px}.simple-food-picker{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px}.simple-food-picker label{display:grid;gap:6px;color:#a6b5c4;font-size:12px}.simple-food-picker .food-input{font-size:16px;padding:13px}.simple-food-fractions{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.simple-food-fractions .btn{padding:7px 12px;min-width:40px}#foodEditor #foodPortionPreview{border:0;background:none;padding:0;color:#a6b5c4;font-size:13px;margin:12px 0}.simple-food-add{width:100%;padding:14px!important;border-radius:14px!important;font-size:16px}#foodAdvanced{margin-top:18px;border-top:1px solid #2d3944;padding-top:15px}#foodAdvanced summary{cursor:pointer;color:#a6b5c4;font-size:13px}#foodAdvanced .food-editor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#foodAdvanced #savePersonalFood{margin-top:12px}.simple-food-context{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.simple-food-context label{display:grid;gap:5px;font-size:12px;color:#a6b5c4}.simple-food-context .food-input{min-height:42px}.food-selection-layout #foodResults{max-height:550px}.food-selection-layout{grid-template-columns:minmax(0,1fr) minmax(360px,1fr)}@media(max-width:900px){.food-selection-layout{grid-template-columns:minmax(0,1fr)}#foodEditor{padding:18px!important}.simple-food-macros{gap:6px}.simple-food-macros strong{font-size:19px}.simple-food-macros span{font-size:11px}}';document.head.append(style);
}
// Food editor: full width and low (portion on the left, values on the right),
// without fibre, salt and the pasted-label text; photos are still read.
function installCompactFoodEditor(){
  for(const id of ['food-fiber_100g','food-salt_100g'])$(id).closest('label').hidden=true;
  $('foodOcrDetails').hidden=true;
  const style=document.createElement('style');style.textContent='.food-selection-layout{grid-template-columns:minmax(0,1fr)!important;gap:14px!important}.food-selection-layout #foodResults{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;max-height:280px}#foodEditor:not([hidden]){display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.5fr);column-gap:28px;align-items:start;padding:18px 22px!important}#foodEditor>*{grid-column:1;min-width:0}#foodEditor>#foodAdvanced{grid-column:2;grid-row:1/span 12;margin-top:0;border-top:0;padding-top:0}#foodAdvanced .food-editor-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 10px}#foodAdvanced .food-editor-grid label{font-size:11px}#foodAdvanced .food-input{padding:8px 9px;min-height:0}.simple-food-hero h3{font-size:21px!important;margin:4px 0 12px!important}.simple-food-macros{padding:10px 0!important;margin-bottom:12px!important}.simple-food-macros strong{font-size:18px!important}.simple-food-picker .food-input{padding:9px!important;font-size:15px!important}.simple-food-fractions{margin:8px 0!important}#foodEditor #foodPortionPreview{margin:6px 0!important}.simple-food-add{padding:10px!important}@media(max-width:1100px){#foodAdvanced .food-editor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:900px){#foodEditor:not([hidden]){display:block}#foodEditor>#foodAdvanced{margin-top:14px;border-top:1px solid #2d3944;padding-top:12px}}';document.head.append(style);
}

// Settings → FTP a zóny: FTP (manual, calculated or from Intervals), power and heart-rate zones.
const inputStyle='background:#0d1119;color:#fff;border:1px solid #393245;border-radius:9px;padding:8px;min-width:0';
async function loadTrainingProfile(){
  const card=$('trainingProfileCard');if(!card)return;
  try{const d=await jsonFetch('/app/api/training-profile');state.trainingProfile=d;renderTrainingProfile(d)}
  catch(e){card.innerHTML='<h3>FTP a zóny</h3><div class="notice">'+esc(e.message)+'</div>'}
}
function zoneBoundsEditor(id,bounds,unit){return '<div class="select-row" style="flex-wrap:wrap;gap:6px">'+bounds.map((b,i)=>'<label class="small">Z'+(i+1)+' do <input data-bound="'+id+'" type="number" value="'+esc(b)+'" style="'+inputStyle+';width:70px"> '+unit+'</label>').join('')+'</div>'}
// Power zone bounds can be typed in % FTP or in watts; the two fields stay in sync.
function powerBoundsEditor(bounds,ftp){
  const pct=b=>Math.round(b*10)/10;
  return '<p class="small" style="margin:8px 0 4px">Horní hranice zón – zadej v % FTP nebo ve wattech'+(ftp?' (z FTP '+esc(ftp)+' W; uloží se v %, takže se při změně FTP přepočítají)':' (watty jdou zadat po nastavení FTP)')+'.</p><div style="display:grid;gap:6px">'+bounds.map((b,i)=>'<div class="select-row" style="gap:6px;flex-wrap:wrap"><span class="small" style="min-width:34px">Z'+(i+1)+' do</span><input data-bound="power" data-index="'+i+'" type="number" step="0.1" value="'+esc(pct(b))+'" aria-label="Z'+(i+1)+' horní hranice v % FTP" style="'+inputStyle+';width:80px"><span class="small">%</span><input data-bound-watts="'+i+'" type="number" value="'+(ftp?Math.round(ftp*b/100):'')+'"'+(ftp?'':' disabled')+' aria-label="Z'+(i+1)+' horní hranice ve wattech" style="'+inputStyle+';width:80px"><span class="small">W</span></div>').join('')+'</div>';
}
// Pace zone bounds in % of threshold speed or as a pace (m:ss /km).
function paceBoundsEditor(bounds,pace){
  const pct=b=>Math.round(b*10)/10,at=b=>pace?fmtPace(pace*100/b):'';
  return '<p class="small" style="margin:8px 0 4px">Hranice zón (rychlejší konec zóny) – zadej v % prahového tempa nebo jako tempo m:ss /km'+(pace?'':' (tempo jde zadat po nastavení prahového tempa)')+'.</p><div style="display:grid;gap:6px">'+bounds.map((b,i)=>'<div class="select-row" style="gap:6px;flex-wrap:wrap"><span class="small" style="min-width:34px">Z'+(i+1)+' do</span><input data-bound="pace" data-index="'+i+'" type="number" step="0.1" value="'+esc(pct(b))+'" aria-label="Z'+(i+1)+' hranice v % prahového tempa" style="'+inputStyle+';width:80px"><span class="small">%</span><input data-bound-pace="'+i+'" type="text" inputmode="numeric" placeholder="m:ss" value="'+esc(at(b))+'"'+(pace?'':' disabled')+' aria-label="Z'+(i+1)+' hranice jako tempo" style="'+inputStyle+';width:80px"><span class="small">/km</span></div>').join('')+'</div>';
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
    zoneRows(d.hrZones.map(z=>{const [code,label]=zoneCode(z.name),lo=pctOf(z.bpmLow),hi=pctOf(z.bpmHigh);return [esc(code),esc(label),hrModel==='custom'||(lo==null&&hi==null)?'':(lo==null?'0':lo)+(hi!=null?'–'+hi:'+')+' %',z.bpmLow==null&&z.bpmHigh==null?'—':z.bpmLow==null?'do '+z.bpmHigh:z.bpmLow+(z.bpmHigh!=null?'–'+z.bpmHigh:'+')]}))+
    (hrModel==='custom'?zoneBoundsEditor('hr',hrBounds.length?hrBounds:[130,145,155,165],'bpm'):'<button class="btn" type="button" id="tpEditHr" style="margin-top:8px">Upravit hranice</button>')+
    (d.hrZones.every(z=>z.bpmHigh==null&&z.bpmLow==null)?'<p class="small">Doplň prahový tep (LTHR), max. tep, nebo max. a klidový tep podle zvoleného modelu.</p>':'')+'</section>';
  card.innerHTML='<h3>FTP a zóny</h3><p class="small" style="margin:0">Watty a tempa v trénincích se počítají z těchto hodnot. Změna modelu se uloží hned.</p><div class="zone-columns">'+power+heart+runProfileHtml(d)+'</div>'+
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
// Account, onboarding and (for admins) user management.
async function loadAccount(){const me=await jsonFetch('/app/api/me');const card=$('accountCard');if(card){card.innerHTML='<div class="detail-heading"><h3>Účet</h3><button class="btn" type="button" id="logoutBtn">Odhlásit</button></div><p class="small" style="margin:0">Přihlášen jako <strong>'+esc(me.user?.email||'')+'</strong>'+(me.user?.isAdmin?' · správce':'')+'</p>';$('logoutBtn').onclick=logout;}if(me.missingProviders?.length&&!onboardingSkipped())showOnboarding(me.missingProviders);if(!$('trainingProfileCard')&&$('settings')){$('connectionCards').insertAdjacentHTML('afterend','<article class="card" id="trainingProfileCard" style="margin-top:12px"><h3>FTP a zóny</h3><div class="small">Načítám…</div></article>');loadTrainingProfile();}if(me.user?.isAdmin)installAdmin();return me;}
function installAdmin(){if($('adminCard'))return;$('settings').insertAdjacentHTML('beforeend','<article class="card" id="adminCard" style="margin-top:12px"><h3>Uživatelé</h3><p class="small">Přihlásit se přes Google mohou jen pozvaní. Pozvi e-mail Google účtu a pošli uživateli odkaz na aplikaci. Připojení Google Health a Intervals si každý nastaví sám.</p><form id="inviteForm" class="select-row"><input id="inviteEmail" type="email" required placeholder="email@gmail.com" aria-label="E-mail pozvaného uživatele" style="background:#0d1119;color:#fff;border:1px solid #393245;border-radius:9px;padding:10px;min-width:0;flex:1"><button class="btn primary" type="submit">Pozvat</button></form><p class="small">Google Health je v testovacím režimu Google Cloud: každý nový uživatel musí být přidaný i mezi Test users v OAuth consent screen, jinak připojení Google Health odmítne.</p><div id="adminUsers" class="small">Načítám…</div></article>');$('inviteForm').onsubmit=async e=>{e.preventDefault();try{const r=await jsonFetch('/app/api/admin/invites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('inviteEmail').value})});$('inviteEmail').value='';toast(r.message);loadAdmin();}catch(error){toast(error.message);}};loadAdmin();}
async function loadAdmin(){try{const d=await jsonFetch('/app/api/admin/users');const users=d.users.map(u=>'<div class="metric-line"><span>'+esc(u.email)+(u.role==='admin'?' · správce':'')+(u.disabled?' · zablokovaný':'')+'<br><small>'+(u.last_login_at?'Naposledy '+esc(new Date(u.last_login_at+'Z').toLocaleString('cs-CZ')):'Zatím se nepřihlásil')+'</small></span>'+(u.role==='admin'?'':'<button class="btn" type="button" data-user="'+u.id+'" data-disabled="'+(u.disabled?0:1)+'">'+(u.disabled?'Obnovit přístup':'Zablokovat')+'</button>')+'</div>').join('');const invites=d.invites.map(i=>'<div class="metric-line"><span>'+esc(i.email)+' · pozvánka čeká</span><button class="btn" type="button" data-invite="'+esc(i.email)+'">Zrušit</button></div>').join('');$('adminUsers').innerHTML=users+(invites||'');document.querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{try{const r=await jsonFetch('/app/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(b.dataset.user),disabled:b.dataset.disabled==='1'})});toast(r.message);loadAdmin();}catch(error){toast(error.message);}});document.querySelectorAll('[data-invite]').forEach(b=>b.onclick=async()=>{try{const r=await jsonFetch('/app/api/admin/invites',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:b.dataset.invite})});toast(r.message);loadAdmin();}catch(error){toast(error.message);}});}catch(e){$('adminUsers').textContent=e.message;}}
installDataCorrections();installSimpleFoodEditor();installCompactFoodEditor();loadAccount().then(me=>{loadConnections();if(!me.missingProviders?.length||onboardingSkipped())load();}).catch(()=>{});

// ---- Workouts hub: info tips, week overview with weather, weekly planner ----
const INFO_TEXTS={
  difficulty:['Obtížnost 1–10','Každý workout má obtížnost od 1 (velmi lehké, jen točení nohou) po 10 (maximum, co zvládneš). Počítá se z intenzity, délky a počtu tvrdých úseků.','Filtr „Max. obtížnost“ jen skryje těžší workouty. Bez limitu trenér sám cílí obtížnost kousek nad tvou aktuální úroveň, když jsi odpočatý, a pod ni, když jsi unavený.'],
  phase:['Fáze přípravy','Auto: trenér fázi odvodí z plánu a zátěže týdne.','Základ (Base): hodně vytrvalosti a tempa, buduje se motor.','Rozvoj (Build): víc prahových a VO₂max intervalů, blok před cílem.','Regenerace: týden bez intenzity, tělo vstřebá trénink.','Ladění (Taper): méně objemu a krátká intenzita před závodem, abys byl svěží.'],
  capability:['Moje úroveň','Trenérův odhad tvé úrovně 1–10 v každém typu tréninku (vytrvalost, tempo, práh…). Podle ní volí, jak těžký workout ti dát, aby tě posunul a nepřetížil.','Každý začíná na 3 z 10 s nízkou jistotou. Úroveň se mění po odjetých workoutech z knihovny: dokončení se převezme z Intervals.icu, ty doplníš RPE. Lehce zvládnutý trénink úroveň zvedne, nedokončený ji sníží. Jistota roste s počtem hodnocení.'],
  suitability:['Vhodnost','Jak dobře workout sedí na vybraný den: typ, který trenér doporučuje, délka, obtížnost proti tvé úrovni, únava a počet kvalitních dnů v týdnu, plus pestrost oproti nedávným tréninkům.','100 % = nejlepší možná shoda s danými filtry. Bez vyplněné délky řadím podle délky, kterou trenér na den doporučuje, ale žádnou délku nevyřazuji.'],
  duration:['Čas na trénink','Nech prázdné a trenér určí nejvhodnější délku sám – podle plánu v Intervals.icu, kondice (CTL), formy (TSB), spánku a plánu týdne. Může to být 50 minut i 4 hodiny.','Vyplň jen tehdy, když máš opravdu časový limit.'],
  libraryDuration:['Délka','Prázdné = délku doporučí trenér a seznam se podle ní jen seřadí. Když vyplníš délku, ukážu workouty v toleranci kolem ní.'],
  load:['Cílový load','Tréninková zátěž (TSS): kombinace délky a intenzity. Hodina na FTP ≈ 100. Vyplň, když chceš konkrétní zátěž – jinak ji neřeš.'],
  rpe:['RPE 1–10','Jak těžký trénink subjektivně byl: 1–2 velmi lehce, 3–4 lehce, 5–6 středně, 7–8 těžce, 9 velmi těžce, 10 maximum.','Uložím ho k aktivitě i do Intervals.icu. Pro trenéra je to nejdůležitější signál, jestli byl trénink přiměřený.'],
  feedback:['Naplánované workouty','Jak velkou část workoutu jsi odjel, spočítám sám z aktivity spárované v Intervals.icu (zátěž nebo čas proti plánu).','Ty doplníš jen RPE a případně pocit. RPE se zapíše i k aktivitě v Intervals.icu.'],
  planner:['Plán týdne','Přetáhni Kolo, Běh nebo Gym přímo do kalendáře na dny, kdy chceš trénovat – klidně víc aktivit v jeden den. Plán se opakuje každý týden. Kartičky ve dnech přesouváš tažením, ✕ je odebere. Na mobilu ťukni na sport a pak na den. Ukládá se to samo.','Trenér z toho rozloží týden: jeden dlouhý trénink o víkendu, až dva kvalitní dny s odstupem, po nich lehčí den, a gym před intervaly se sníženou dávkou pro zatížené svaly. Generátor se podle toho řídí, ale únava a připravenost mají vždy přednost.']
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
    pop.innerHTML='<strong>'+esc(title)+'</strong>'+paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('');
    pop.hidden=false;if(current)current.setAttribute('aria-expanded','false');current=tip;tip.setAttribute('aria-expanded','true');
    const r=tip.getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight;
    pop.style.left=Math.max(12,Math.min(window.innerWidth-w-12,r.left-w/2))+'px';
    pop.style.top=(r.bottom+8+h>window.innerHeight?Math.max(12,r.top-h-8):r.bottom+8)+'px';
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  window.addEventListener('scroll',close,{passive:true});
}

const HUB_SPORTS={ride:'🚴 Kolo',run:'🏃 Běh',gym:'🏋️ Gym'};
function activitySport(a){const t=(String(a?.type||'')+' '+String(a?.name||'')+' '+String(a?.payload?.type||'')).toLowerCase();if(/weight|strength|gym|posil/.test(t))return 'gym';if(/ride|cycl|bike|kolo/.test(t))return 'ride';if(/\brun|běh|virtualrun/.test(t))return 'run';return null;}
const WEATHER_ICONS=[[0,'☀️','jasno'],[2,'🌤️','polojasno'],[3,'☁️','zataženo'],[48,'🌫️','mlha'],[57,'🌦️','mrholení'],[67,'🌧️','déšť'],[77,'🌨️','sníh'],[82,'🌧️','přeháňky'],[86,'🌨️','sněhové přeháňky'],[99,'⛈️','bouřky']];
function weatherIcon(code){const c=num(code,-1);return (WEATHER_ICONS.find(([max])=>c<=max)||[0,'·',''])}
async function loadWeather(){
  const loc=state.weekPlan?.prefs?.location;if(!loc)return;
  const key=loc.latitude+','+loc.longitude+','+state.hubWeek;if(state.weatherKey===key)return;
  try{
    const url='https://api.open-meteo.com/v1/forecast?latitude='+loc.latitude+'&longitude='+loc.longitude+'&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=Europe%2FPrague&past_days=14&forecast_days=16';
    const r=await fetch(url),d=await r.json();if(!r.ok)throw new Error(d.reason||'HTTP '+r.status);
    state.weather=Object.fromEntries((d.daily?.time||[]).map((t,i)=>[t,{code:d.daily.weather_code[i],max:d.daily.temperature_2m_max[i],min:d.daily.temperature_2m_min[i],rainProb:d.daily.precipitation_probability_max?.[i],rain:d.daily.precipitation_sum?.[i],wind:d.daily.wind_speed_10m_max?.[i]}]));state.weatherKey=key;
  }catch(error){state.weather={};state.weatherError=error.message;}
}
async function loadWeekPlan(force=false){const start=state.hubWeek||pragueMonday();if(state.weekPlan&&!force&&state.weekPlan.start===start)return state.weekPlan;try{state.weekPlan=await jsonFetch('/app/api/week-plan?start='+start);}catch{if(state.weekPlan)return state.weekPlan;state.weekPlan={prefs:{days:[[],[],[],[],[],[],[]],location:{name:'Kutná Hora',latitude:49.9484,longitude:15.2682}},roles:Array.from({length:7},(_,i)=>({weekday:i,items:[]}))};}return state.weekPlan;}
async function hubWeekData(){
  if(state.hubWeek===weekStart&&state.week?.days)return state.week;
  if(state.hubWeekData?.start===state.hubWeek)return state.hubWeekData;
  state.hubWeekData=await jsonFetch('/app/api/week?start='+state.hubWeek);return state.hubWeekData;
}
// Targets for the chips come from the server, the same numbers the generator uses.
function chipTarget(date,sport){return (state.weekPlan?.targets?.items||[]).find(x=>x.date===date&&x.sport===sport)||null}
function weekTargetText(){
  const t=state.weekPlan?.targets;if(!t||t.status!=='ok')return '';
  return (t.recovery?'Regenerační týden · cíl ≈ '+t.target+' TSS (70 % z udržovacích '+t.base+', minulý týden '+t.lastWeekLoad+' TSS)':'Cíl týdne ≈ '+t.target+' TSS (udržení kondice CTL '+t.ctl+' × 7 + 5 %)')+' · hotovo a v plánu '+t.committed+' TSS'+(t.shortfall?' · do cíle chybí ~'+t.shortfall+' TSS, přidej další den':'');
}
async function renderWeekHub(){
  const el=$('hubWeek');if(!el)return;
  if(!state.hubWeek)state.hubWeek=pragueMonday();
  $('hubWeekTitle').textContent='Týden '+isoWeek(state.hubWeek)+' · '+dateLabel(state.hubWeek)+' – '+dateLabel(dateShift(state.hubWeek,6));
  const plan=await loadWeekPlan();$('hubLocationName').textContent=plan.prefs?.location?.name||'Kutná Hora';
  let week;try{[week]=await Promise.all([hubWeekData(),loadWeather()]);}catch(error){el.innerHTML='<div class="notice status-error">'+esc(error.message)+'</div>';return;}
  const days=week.days||[],gym=weekGymSessions(days),today=pragueToday();
  const roles=plan.roles||[];
  let doneTss=0,plannedTss=0;
  el.innerHTML=days.map((d,i)=>{
    const t=d.daily?.training||{},items=[];
    const completed=(t.completed||[]).filter(a=>!isNutritionItem(a)),sports=new Set();
    for(const a of completed){const sport=activitySport(a);if(!sport)continue;sports.add(sport);doneTss+=num(a.tss);items.push('<div class="hub-item done">✓ '+esc(HUB_SPORTS[sport])+' · '+esc(a.name||'')+activityEnvironmentBadge(a,sport)+'<span class="meta">'+hm(num(a.durationHours)*60)+(measured(a.tss)?' · TSS '+fmt(a.tss):'')+'</span></div>');}
    if(gym.some(g=>g.date===d.date)&&!sports.has('gym')){sports.add('gym');const g=gym.find(x=>x.date===d.date);items.push('<div class="hub-item done">✓ '+HUB_SPORTS.gym+'<span class="meta">'+new Set(g.sets.map(r=>r.exercise)).size+' cviků · '+g.sets.length+' sérií</span></div>');}
    const paired=new Set((t.matched||[]).map(m=>String(m.planned?.id||'')));
    for(const p of (t.planned||[]).filter(x=>!isNutritionItem(x)&&!paired.has(String(x.id||'')))){const sport=activitySport(p);if(!sport)continue;sports.add(sport);plannedTss+=num(p.tss);const editable=/^planned:/.test(String(p.id||''));items.push('<div class="hub-item planned'+(editable?' editable':'')+'"'+(editable?' draggable="true" tabindex="0" data-event-id="'+esc(p.id)+'" data-name="'+esc(p.name||'Plán')+'" title="Přetáhni na jiný den, nebo klikni pro možnosti"':'')+'>'+esc(HUB_SPORTS[sport])+' · '+esc(p.name||'Plán')+activityEnvironmentBadge(p,sport)+'<span class="meta">plán'+(p.durationHours?' · '+hm(num(p.durationHours)*60):'')+(measured(p.tss)?' · TSS '+fmt(p.tss):'')+'</span>'+(editable?'<span class="hub-actions"><label class="small">Přesunout na <input type="date" data-hub-date min="'+today+'" value="'+esc(d.date<today?today:d.date)+'"></label><button type="button" class="btn" data-hub-move>Přesunout</button><button type="button" class="btn" data-hub-delete>Smazat</button></span>':'')+'</div>');}
    if(d.date===gymDay()&&(state.gym?.values||[]).slice(7).some(r=>r?.[1])&&!sports.has('gym')){sports.add('gym');items.push('<div class="hub-item planned">'+HUB_SPORTS.gym+' · '+(d.date===today?'plán na dnes':'plán připraven')+'</div>');}
    // Planner suggestions for the days still ahead.
    // The weekly plan for this weekday: chips that move between days or come off with ✕.
    const plan=[...new Set([...(state.weekPlan?.prefs?.days?.[i]||[]),...Object.keys(state.proposals||{}).filter(k=>k.startsWith(d.date+'|')).map(k=>k.split('|')[1])])].map(sport=>{const x=state.weekPlan.dirty?null:(roles[i]?.items||[]).find(r=>r.sport===sport),tg=state.weekPlan.dirty?null:chipTarget(d.date,sport),pr=state.proposals?.[d.date+'|'+sport];
      const proposal=pr?.status==='busy'?'<small class="proposal">Navrhuji…</small>':pr?.workout?'<small class="proposal">'+esc(pr.workout.name)+'</small><span class="chip-actions"><button type="button" class="btn" data-proposal="open" data-date="'+d.date+'" data-sport="'+sport+'">Detail</button>'+(pr.existing?'<span class="small">Alternativa k revizi</span>':pr.scheduled?'<span class="small">✓ v Intervals</span>':'<button type="button" class="btn primary" data-proposal="add" data-date="'+d.date+'" data-sport="'+sport+'">Do Intervals</button>')+'</span>':pr?.gym?'<small class="proposal">Návrh · '+pr.gym+' cviků</small><span class="chip-actions"><button type="button" class="btn" data-proposal="gym" data-date="'+d.date+'">Prohlédnout</button></span>':pr?.error?'<small class="proposal">'+esc(pr.error)+'</small>':'';
      return '<span class="planner-chip" draggable="true" data-chip-sport="'+sport+'" data-chip-day="'+i+'" title="Plán týdne · přetáhni na jiný den">'+HUB_SPORTS[sport]+'<button type="button" data-chip-remove aria-label="Odebrat '+esc(HUB_SPORTS[sport])+' z plánu">✕</button>'+(x?'<small>'+esc(x.label.replace(/^Gym · /,''))+(tg&&sport!=='gym'?' · '+hm(tg.minutes)+' · ~'+tg.tss+' TSS':'')+'</small>':'')+(!pr&&!tg&&sports.has(sport)&&d.date>=today?'<small class="proposal">✓ trénink už je naplánovaný</small>':'')+proposal+'</span>'}).join('');
    const w=state.weather?.[d.date],[,icon,word]=w?weatherIcon(w.code):[0,'',''];
    const av=state.weekPlan?.prefs?.availability?.[i],avText=av?.minutes===0?'Nemám čas':av?.minutes!=null?hm(av.minutes)+(av.window?' · '+av.window:''):av?.window||'';
    const weather=(w?'<div class="hub-weather" title="'+esc(word+(w.rainProb!=null?' · srážky '+w.rainProb+' %':'')+(w.wind!=null?' · vítr '+fmt(w.wind)+' km/h':''))+'"><span>'+icon+'</span><b>'+fmt(w.max)+'°</b><span>'+fmt(w.min)+'°</span>'+(w.rainProb!=null&&w.rainProb>=30?'<span>💧'+fmt(w.rainProb)+' %</span>':'')+'</div>':'<div class="hub-weather"></div>')+(avText?'<div class="hub-availability">'+esc(avText)+'</div>':'');
    return '<div class="hub-day'+(d.date===today?' today':d.date<today?' past':'')+(state.plannerPick?' pickable':'')+'" data-hub-day="'+esc(d.date)+'"><div class="hub-day-head"><strong>'+esc(new Intl.DateTimeFormat('cs-CZ',{weekday:'short'}).format(new Date(d.date+'T12:00:00Z')))+'</strong><span>'+esc(dateLabel(d.date))+'</span></div>'+weather+(items.join('')||(plan?'':'<div class="hub-empty">Volno</div>'))+(plan?'<div class="hub-plan">'+plan+'</div>':'')+'</div>';
  }).join('');
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
function plannerChanged(){state.weekPlan.dirty=true;$('plannerStatus').textContent='Ukládám…';renderPlanner();renderWeekHub();clearTimeout(plannerSaveTimer);plannerSaveTimer=setTimeout(saveWeekPlanner,500);}
function plannerPlace(sport,day,fromDay=null){
  const days=state.weekPlan.prefs.days;if(!HUB_SPORTS[sport]||!days[day])return;
  if(fromDay!=null&&fromDay!==day)days[fromDay]=days[fromDay].filter(x=>x!==sport);
  if(!days[day].includes(sport))days[day].push(sport);
  plannerChanged();
}
async function saveWeekPlanner(){
  $('plannerStatus').textContent='Ukládám…';
  const sent=JSON.stringify(state.weekPlan.prefs),start=state.weekPlan.start||state.hubWeek||pragueMonday();
  try{const saved=await jsonFetch('/app/api/week-plan?start='+start,{method:'POST',headers:{'Content-Type':'application/json'},body:sent});
    // A newer edit made meanwhile has its own save queued; keep it.
    if(state.weekPlan.start!==start||JSON.stringify(state.weekPlan.prefs)!==sent)return;
    state.weekPlan=saved;$('plannerStatus').textContent='✓ Uloženo · generátor se podle plánu řídí';renderPlanner();renderGymPlanHint();await renderWeekHub();}
  catch(error){$('plannerStatus').textContent='Neuloženo: '+error.message;}
}
function installPlannerDrag(){
  const box=document.querySelector('#workouts .week-hub');let drag=null;
  box.addEventListener('dragstart',e=>{const chip=e.target.closest('.planner-chip');if(!chip)return;drag={sport:chip.dataset.chipSport,from:chip.dataset.chipDay==null?null:Number(chip.dataset.chipDay)};e.dataTransfer.effectAllowed=drag.from==null?'copy':'move';e.dataTransfer.setData('text/plain',drag.sport);chip.classList.add('dragging');});
  box.addEventListener('dragend',e=>{e.target.closest?.('.planner-chip')?.classList.remove('dragging');box.querySelectorAll('.drop-target').forEach(d=>d.classList.remove('drop-target'));
    // A chip dragged off the days is removed.
    if(drag&&drag.from!=null&&e.dataTransfer.dropEffect==='none'){state.weekPlan.prefs.days[drag.from]=state.weekPlan.prefs.days[drag.from].filter(x=>x!==drag.sport);plannerChanged();}drag=null;});
  box.addEventListener('dragover',e=>{const day=e.target.closest('[data-hub-day]');if(!drag||!day)return;e.preventDefault();e.dataTransfer.dropEffect=drag.from==null?'copy':'move';box.querySelectorAll('.drop-target').forEach(d=>{if(d!==day)d.classList.remove('drop-target')});day.classList.add('drop-target');});
  box.addEventListener('dragleave',e=>{const day=e.target.closest('[data-hub-day]');if(day&&!day.contains(e.relatedTarget))day.classList.remove('drop-target');});
  box.addEventListener('drop',e=>{const day=e.target.closest('[data-hub-day]');if(!drag||!day)return;e.preventDefault();const d=drag;drag=null;plannerPlace(d.sport,weekdayOf(day.dataset.hubDay),d.from);});
  box.addEventListener('click',e=>{
    const remove=e.target.closest('[data-chip-remove]');
    if(remove){const chip=remove.closest('.planner-chip'),i=Number(chip.dataset.chipDay),date=chip.closest('[data-hub-day]').dataset.hubDay;delete state.proposals?.[date+'|'+chip.dataset.chipSport];state.weekPlan.prefs.days[i]=state.weekPlan.prefs.days[i].filter(x=>x!==chip.dataset.chipSport);plannerChanged();return}
    const palette=e.target.closest('.planner-chip.palette');
    if(palette){state.plannerPick=state.plannerPick===palette.dataset.chipSport?null:palette.dataset.chipSport;$('plannerStatus').textContent=state.plannerPick?'Ťukni na den, kam '+HUB_SPORTS[state.plannerPick]+' patří':'';renderPlanner();renderWeekHub();return}
    const day=e.target.closest('[data-hub-day]');
    if(day&&state.plannerPick&&!e.target.closest('.hub-item,.planner-chip')){const sport=state.plannerPick;state.plannerPick=null;plannerPlace(sport,weekdayOf(day.dataset.hubDay));}
  });
}
// The gym panel suggests muscle groups from the day's planner role.
const ROLE_MUSCLES={gym_upper:['quads','hamstrings','chest','upper_back','abs'],gym_full:['quads','hamstrings','chest','upper_back','abs']};
function renderGymPlanHint(){
  const el=$('gymPlanHint');if(!el||!state.weekPlan)return;
  const weekday=(new Date(gymDay()+'T12:00:00Z').getUTCDay()+6)%7,role=(state.weekPlan.roles?.[weekday]?.items||[]).find(x=>x.sport==='gym');
  el.innerHTML=role?'Plán týdne '+(gymDay()===pragueToday()?'na dnes':'na '+esc(longDate(gymDay())))+': <strong>'+esc(role.label)+'</strong>'+(role.role==='gym_upper'?' – nohy šetřím kvůli kvalitě na kole/běhu.':'.')+' <button class="btn" type="button" id="gymUsePlan">Vybrat partie podle plánu</button>':'Vyber partie, nebo nech trenéra sestavit trénink podle týdne a únavy. Dny pro gym si nastavíš v plánovači týdne.';
  const use=$('gymUsePlan');if(use)use.onclick=()=>{selectedGymMuscles.clear();for(const id of ROLE_MUSCLES[role.role]||[])if($('gymFocusChoices').querySelector('[data-muscle="'+id+'"]'))selectedGymMuscles.add(id);renderGymFocus();};
}
async function openWorkouts(){
  if(state.workoutSport==='gym')loadGym().catch(e=>toast(e.message));else loadWorkoutLibrary();
  await loadWeekPlan();renderPlanner();renderGymPlanHint();renderWeekHub();
}
function installWorkoutsHub(){
  installInfoTips();
  const goWeek=async next=>{clearTimeout(plannerSaveTimer);if(state.weekPlan?.dirty)await saveWeekPlanner();if(state.weekPlan?.dirty)return;state.hubWeek=next;await renderWeekHub();renderPlanner();};
  $('hubPrevWeek').onclick=()=>goWeek(dateShift(state.hubWeek||pragueMonday(),-7));
  $('hubNextWeek').onclick=()=>goWeek(dateShift(state.hubWeek||pragueMonday(),7));
  $('hubThisWeek').onclick=()=>goWeek(pragueMonday());
  $('hubLocation').onclick=()=>{const f=$('hubLocationForm');f.hidden=!f.hidden;if(!f.hidden)$('hubLocationQuery').focus();};
  $('hubLocationForm').onsubmit=async e=>{
    e.preventDefault();const q=$('hubLocationQuery').value.trim(),out=$('hubLocationResults');if(!q)return;out.innerHTML='<span class="small">Hledám…</span>';
    try{const r=await fetch('https://geocoding-api.open-meteo.com/v1/search?count=5&language=cs&format=json&name='+encodeURIComponent(q)),d=await r.json(),rows=d.results||[];
      out.innerHTML=rows.length?rows.map((x,i)=>'<button class="btn" type="button" data-loc="'+i+'">'+esc(x.name+(x.admin1?', '+x.admin1:'')+(x.country_code?' ('+x.country_code+')':''))+'</button>').join(''):'<span class="small">Nic nenalezeno.</span>';
      out.querySelectorAll('[data-loc]').forEach(b=>b.onclick=async()=>{const x=rows[Number(b.dataset.loc)];state.weekPlan.prefs.location={name:x.name,latitude:x.latitude,longitude:x.longitude};$('hubLocationForm').hidden=true;out.innerHTML='';state.weatherKey=null;await saveWeekPlanner();});
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
function takePlanned(days,eventId){for(const d of days){const list=d.daily?.training?.planned||[],i=list.findIndex(x=>String(x.id)===String(eventId));if(i>=0)return list.splice(i,1)[0];}return null}
async function refreshAfterPlanChange(){
  try{const fresh=await jsonFetch('/app/api/week?start='+weekStart);state.week=fresh;try{renderTraining();renderOverview();}catch{}}catch{}
  if(state.hubWeek!==weekStart)state.hubWeekData=null;
  await renderWeekHub();loadScheduledWorkouts();
}
async function changePlanned(path,body,apply,done){
  const days=hubDays(),snapshot=days?JSON.stringify(days):null;
  if(days){apply(days);renderWeekHub();if(typeof renderToday==='function')renderToday();}
  try{await jsonFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});toast(done);refreshAfterPlanChange();}
  catch(error){if(days)days.splice(0,days.length,...JSON.parse(snapshot));renderWeekHub();if(typeof renderToday==='function')renderToday();toast('Změna se neuložila, vracím ji zpět: '+error.message);}
}
function movePlanned(eventId,date,name){
  if(!eventId||!date)return;
  if(date<pragueToday()){toast('Trénink jde přesunout jen na dnešek nebo pozdější den.');return}
  changePlanned('/app/api/planned/move',{eventId,date},days=>{const item=takePlanned(days,eventId),target=days.find(d=>d.date===date);if(item&&target)(target.daily.training.planned||=[]).push({...item,start:date});},'„'+(name||'Trénink')+'“ je na '+longDate(date)+' i v Intervals.icu.');
}
function deletePlanned(eventId,name){
  if(!eventId||!window.confirm('Smazat „'+(name||'trénink')+'“ z plánu i z Intervals.icu?'))return;
  changePlanned('/app/api/planned/delete',{eventId},days=>takePlanned(days,eventId),'„'+(name||'Trénink')+'“ je smazaný i z Intervals.icu.');
}
function installPlannedEditing(){
  const week=$('hubWeek');let dragged=null;
  week.addEventListener('dragstart',e=>{const item=e.target.closest('.hub-item.editable');if(!item||e.target.closest('.planner-chip'))return;dragged=item;item.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.dataset.eventId);});
  week.addEventListener('dragend',()=>{dragged?.classList.remove('dragging');dragged=null;week.querySelectorAll('.drop-target').forEach(d=>d.classList.remove('drop-target'));});
  week.addEventListener('dragover',e=>{const day=e.target.closest('[data-hub-day]');if(!dragged||!day||day.dataset.hubDay<pragueToday())return;e.preventDefault();e.dataTransfer.dropEffect='move';week.querySelectorAll('.drop-target').forEach(d=>{if(d!==day)d.classList.remove('drop-target')});day.classList.add('drop-target');});
  week.addEventListener('dragleave',e=>{const day=e.target.closest('[data-hub-day]');if(day&&!day.contains(e.relatedTarget))day.classList.remove('drop-target');});
  week.addEventListener('drop',e=>{const day=e.target.closest('[data-hub-day]');if(!dragged||!day)return;e.preventDefault();day.classList.remove('drop-target');const item=dragged;if(item.closest('[data-hub-day]')===day)return;movePlanned(item.dataset.eventId,day.dataset.hubDay,item.dataset.name);});
  week.addEventListener('click',e=>{
    const item=e.target.closest('.hub-item.editable');if(!item)return;
    if(e.target.closest('[data-hub-move]')){movePlanned(item.dataset.eventId,item.querySelector('[data-hub-date]').value,item.dataset.name);return}
    if(e.target.closest('[data-hub-delete]')){deletePlanned(item.dataset.eventId,item.dataset.name);return}
    if(e.target.closest('.hub-actions'))return;
    week.querySelectorAll('.hub-item.open').forEach(x=>{if(x!==item)x.classList.remove('open')});item.classList.toggle('open');
  });
  week.addEventListener('keydown',e=>{const item=e.target.closest('.hub-item.editable');if(item&&e.target===item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();item.classList.toggle('open');}});
  $('scheduledWorkouts').addEventListener('click',e=>{const b=e.target.closest('[data-delete-event]');if(b)deletePlanned(b.dataset.deleteEvent,b.dataset.name);});
}
installWorkoutsHub();

// ---- Fitness insights: muscle freshness & load, cardio focus, records, timeline ----
const MUSCLE_LABELS={chest:'Hrudník',upper_back:'Horní záda',lats:'Široký zádový',front_delts:'Přední ramena',side_delts:'Boční ramena',rear_delts:'Zadní ramena',biceps:'Biceps',triceps:'Triceps',abs:'Břicho',obliques:'Šikmé břišní',quads:'Přední stehna',hamstrings:'Zadní stehna',hips:'Hýždě a kyčle',calves:'Lýtka'};
const FRESH_LABEL={recovered:'Zotavené',fatigued:'Unavené',depleted:'Vyčerpané',calibrating:'Kalibruji'};
const LOAD_LABEL={detraining:'Detrénink',maintaining:'Udržování',productive:'Produktivní',peaking:'Vrchol formy',overtraining:'Přetížení',calibrating:'Kalibruji'};
function freshColor(x){if(!x||x.freshness==null)return '#4a5361';const f=x.freshness;if(f>=75)return '#3fda9c';if(f>=55)return '#d9d45a';if(f>=35)return '#ffa64d';return '#ff6478'}
function paintMuscleMap(root,fresh){root.querySelectorAll('[data-muscle]').forEach(el=>{const x=fresh?.[el.dataset.muscle];el.style.setProperty('--fresh-fill',freshColor(x));const t=document.createElementNS('http://www.w3.org/2000/svg','title');t.textContent=(MUSCLE_LABELS[el.dataset.muscle]||el.dataset.muscle)+' · '+(x?.freshness==null?'kalibruji (potřebuji 3 tréninkové dny)':x.freshness+' % · '+FRESH_LABEL[x.status]);el.querySelector('title')?.remove();el.appendChild(t);});}
function loadGauge(o){
  const max=Math.max(10,o.range[1]*1.45,o.acute*1.1),a=v=>Math.PI*(1-Math.min(1,Math.max(0,v/max))),pt=(v,r)=>[100+r*Math.cos(a(v)),100-r*Math.sin(a(v))];
  const arc=(v1,v2,r)=>{const [x1,y1]=pt(v1,r),[x2,y2]=pt(v2,r);return 'M'+x1.toFixed(1)+' '+y1.toFixed(1)+' A'+r+' '+r+' 0 0 1 '+x2.toFixed(1)+' '+y2.toFixed(1)};
  const [mx,my]=pt(o.acute,80);
  return '<svg class="load-gauge" viewBox="0 0 200 118" role="img" aria-label="Svalová zátěž '+o.acute+', optimum '+o.range[0]+'–'+o.range[1]+'"><path d="'+arc(0,max,80)+'" stroke="#2a3140" stroke-width="12" fill="none" stroke-linecap="round"/><path d="'+arc(o.range[0],o.range[1],80)+'" stroke="#3fda9c" stroke-width="12" fill="none"/><circle cx="'+mx.toFixed(1)+'" cy="'+my.toFixed(1)+'" r="9" fill="#64d2ff" stroke="#0d1119" stroke-width="3"/><text x="100" y="96" text-anchor="middle" fill="#f6f7fb" font-size="34" font-weight="800">'+o.acute+'</text><text x="100" y="114" text-anchor="middle" fill="#9ca6b5" font-size="10">7 dní · optimum '+o.range[0]+'–'+o.range[1]+'</text></svg>';
}
function sparkBars(series,color){const max=Math.max(1,...series.map(x=>x.load));return '<svg class="spark-bars" viewBox="0 0 420 60" preserveAspectRatio="none" role="img" aria-label="Svalová zátěž za 42 dní">'+series.map((x,i)=>'<rect x="'+(i*10)+'" y="'+(58-x.load/max*54).toFixed(1)+'" width="7" height="'+(x.load/max*54).toFixed(1)+'" rx="2" fill="'+color+'"><title>'+esc(dateLabel(x.date))+' · '+x.load+'</title></rect>').join('')+'</svg>'}
const RECORD_ICONS={e1rm:['1','Odhad 1RM','kg'],heaviest:['⚖','Nejvyšší váha','kg'],setVolume:['▤','Objem série','kg'],sessionVolume:['Σ','Objem tréninku','kg'],setReps:['×','Nejvíc opakování','opak.']};
function renderFitnessInsights(){
  const box=$('fitnessInsights'),r=state.insights;if(!box)return;
  if(!r||r.status!=='ok'){box.innerHTML='<div class="notice">'+esc(r?.message||'Načítám svaly, zátěž a rekordy…')+'</div>';return}
  const fresh=r.muscles.freshness,load=r.muscles.load.overall,cf=r.cardioFocus,rec=r.records;
  const calibrated=Object.entries(fresh).filter(([,x])=>x.freshness!=null).sort((a,b)=>a[1].freshness-b[1].freshness);
  const overall=calibrated.length?Math.round(calibrated.reduce((s,[,x])=>s+x.freshness,0)/calibrated.length):null;
  const recent=rec.strength.flatMap(x=>x.recent.map(k=>({k,x}))).slice(0,6);
  const pace=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  const cardio=[['longestRide','🚴','Nejdelší jízda'],['mostElevation','⛰','Nejvíc převýšení'],['bestRidePower','⚡','Nejvyšší NP (20 min+)'],['longestRun','🏃','Nejdelší běh'],['fastestRun5k','⏱','Nejrychlejší běh 5 km+']].filter(([k])=>rec.cardio[k]);
  box.innerHTML='<div class="insight-grid">'+
    '<article class="card insight-fresh"><div class="detail-heading"><div><div class="label">Muscle Freshness</div><h3>Zotavení svalů</h3></div><span class="pill">'+(overall==null?'Kalibruji':'Celkem '+overall+' %')+'</span></div><div class="fresh-layout"><div id="freshMap"></div><div class="fresh-list">'+(calibrated.length?calibrated.map(([m,x])=>'<div class="fresh-row"><span>'+esc(MUSCLE_LABELS[m])+'</span><span class="fresh-bar"><i style="width:'+x.freshness+'%;background:'+freshColor(x)+'"></i></span><strong>'+x.freshness+' %</strong><small>'+FRESH_LABEL[x.status]+'</small></div>').join(''):'<p class="small">Každá partie potřebuje aspoň 3 tréninkové dny se zátěží.</p>')+(Object.values(fresh).some(x=>x.freshness==null)?'<p class="small">Šedé partie se kalibrují: '+Object.entries(fresh).filter(([,x])=>x.freshness==null).map(([m])=>MUSCLE_LABELS[m]).join(', ')+'.</p>':'')+'</div></div><div class="fresh-legend"><span><i style="background:#3fda9c"></i>Zotavené ≥ 75 %</span><span><i style="background:#ffa64d"></i>Unavené 35–75 %</span><span><i style="background:#ff6478"></i>Vyčerpané &lt; 35 %</span><span><i style="background:#4a5361"></i>Kalibruji</span></div></article>'+
    '<article class="card insight-load"><div class="label">Muscular Load</div><h3>Svalová zátěž</h3>'+loadGauge(load)+'<div class="load-status '+esc(load.status)+'">'+esc(LOAD_LABEL[load.status])+'</div><p class="small">Zátěž za 7 dní proti průměrnému týdnu za 6 týdnů (poměr '+fmt(load.ratio,2)+'). Počítá se ze sérií v posilovně (váha opakování, únavnost cviku, RPE) a z kola a běhu (TSS na zapojené svaly).'+(load.status==='calibrating'?' Pro stav potřebuji aspoň 10 tréninkových dní za 6 týdnů.':'')+'</p>'+sparkBars(load.series,'#a978ff')+'<div class="load-muscles">'+Object.entries(r.muscles.load.perMuscle).filter(([,x])=>x.status!=='calibrating').map(([m,x])=>'<span class="pill load-'+x.status+'">'+esc(MUSCLE_LABELS[m])+' · '+esc(LOAD_LABEL[x.status])+'</span>').join('')+'</div></article>'+
    '<article class="card insight-cardio"><div class="label">Cardio Focus · '+cf.days+' dní</div><h3>Kam míří kardio trénink</h3>'+(cf.points?'<div class="focus-bar"><i class="low" style="width:'+cf.percent.low+'%"></i><i class="high" style="width:'+cf.percent.high+'%"></i><i class="anaerobic" style="width:'+cf.percent.anaerobic+'%"></i></div><div class="focus-legend"><div><b>'+cf.percent.low+' %</b><span><i class="low"></i>Lehká aerobní · Z1–Z2</span></div><div><b>'+cf.percent.high+' %</b><span><i class="high"></i>Tvrdá aerobní · Z3–Z4</span></div><div><b>'+cf.percent.anaerobic+' %</b><span><i class="anaerobic"></i>Anaerobní · Z5+</span></div></div><div class="focus-weeks">'+cf.weeks.map((w,i)=>{const t=w.low+w.high+w.anaerobic||1;return '<div><span class="focus-week" style="--h:'+Math.min(100,t/Math.max(1,...cf.weeks.map(x=>x.low+x.high+x.anaerobic))*100)+'%"><i class="anaerobic" style="height:'+w.anaerobic/t*100+'%"></i><i class="high" style="height:'+w.high/t*100+'%"></i><i class="low" style="height:'+w.low/t*100+'%"></i></span><small>'+(i===3?'tento týden':(3-i)+' týd. zpět')+'</small></div>'}).join('')+'</div><p class="small">'+cf.activities+' aktivit · '+hm(cf.minutes)+' v zónách · '+fmt(cf.points)+' kardio bodů. Čas v zóně se násobí její intenzitou, takže krátké tvrdé intervaly váží víc než dlouhá lehká jízda.</p>':'<div class="data-gap">Aktivity za '+cf.days+' dní nemají časy v zónách.</div>')+'</article>'+
    '<article class="card insight-records"><div class="label">Personal Records</div><h3>Osobní rekordy</h3>'+(recent.length?'<div class="pr-badges">'+recent.map(({k,x})=>{const [icon,label,unit]=RECORD_ICONS[k];return '<div class="pr-badge pr-'+k+'"><span>'+icon+'</span><strong>'+fmt(x[k].value,k==='e1rm'?1:0)+' '+unit+'</strong><small>'+esc(label)+'<br>'+esc(x.exercise)+' · '+esc(dateLabel(x[k].date))+'</small></div>'}).join('')+'</div>':'<p class="small">Za posledních 14 dní žádný nový rekord.</p>')+'<div class="scroll"><table class="pr-table"><thead><tr><th>Cvik</th><th>Odhad 1RM</th><th>Nejvyšší váha</th><th>Objem tréninku</th></tr></thead><tbody>'+rec.strength.slice(0,8).map(x=>'<tr><td>'+esc(x.exercise)+'</td><td>'+(x.e1rm?fmt(x.e1rm.value,1)+' kg':'—')+'</td><td>'+(x.heaviest?fmt(x.heaviest.value)+' kg × '+x.heaviest.reps:'—')+'</td><td>'+(x.sessionVolume?fmt(x.sessionVolume.value)+' kg':'—')+'</td></tr>').join('')+'</tbody></table></div>'+(cardio.length?'<div class="pr-cardio">'+cardio.map(([k,icon,label])=>{const v=rec.cardio[k];return '<div><span>'+icon+'</span><strong>'+(k==='fastestRun5k'?pace(v.value)+' /km':fmt(v.value,1)+' '+v.unit)+'</strong><small>'+esc(label)+' · '+esc(dateLabel(v.date))+'</small></div>'}).join('')+'</div>':'')+'<p class="small">1RM podle Epleyho ze sérií do 12 opakování. Kardio rekordy ze souhrnů aktivit za poslední rok.</p></article>'+
  '</div>';
  const map=$('freshMap');map.appendChild($('muscleMapTemplate').content.cloneNode(true));paintMuscleMap(map,fresh);
  // The gym builder figure shows the same freshness behind the selection.
  const builder=document.querySelector('#workoutsGym .gym-figures');if(builder){paintMuscleMap(builder,fresh);if(!$('gymFreshLegend'))builder.insertAdjacentHTML('afterend','<div class="fresh-legend" id="gymFreshLegend"><span><i style="background:#3fda9c"></i>Zotavené</span><span><i style="background:#ffa64d"></i>Unavené</span><span><i style="background:#ff6478"></i>Vyčerpané</span><span><i style="background:#4a5361"></i>Kalibruji</span></div>');}
}
async function loadInsights(){try{state.insights=await jsonFetch('/app/api/fitness-insights');}catch(error){state.insights={status:'error',message:'Svaly a rekordy se nepodařilo načíst: '+error.message};}renderFitnessInsights();}

// Day timeline: sleep, activities, planned workouts and meals in one order.
function renderDayTimeline(){
  const el=$('dayTimeline');if(!el)return;
  // A time without a zone is already local (Prague); one with a zone is converted.
  const date=selectedHistoryDate,clock=v=>{const local=String(v||'').match(/T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);if(local)return local[1];const d=new Date(v);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit'}).format(d)};
  // Each source is drawn on its own: one bad record must not empty the whole day.
  const items=[],add=(source,fn)=>{try{fn();}catch(error){console.error('Timeline: '+source,error);}};
  add('sleep',()=>{const night=primarySleepSessions(state.sleep?.sessions).find(s=>(s.date||String(s.endTime||'').slice(0,10))===date);
  if(night)items.push({t:night.endTime,icon:'🌙',cls:'sleep',title:'Spánek · '+hm(night.durationMin),meta:clock(night.startTime)+' – '+clock(night.endTime)+(measured(night.stages?.DEEP)?' · hluboký '+hm(night.stages.DEEP)+' · REM '+hm(night.stages.REM):'')});});
  const t=state.daily?.training||{};
  add('activities',()=>{for(const a of (t.completed||[]).filter(x=>!isNutritionItem(x))){const hr=a.payload?.average_heartrate??a.averageHeartRate;const kind=activitySport(a)||(/walk|hike|chůze|procház/i.test(String(a.type)+' '+String(a.name))?'walk':'other');items.push({t:a.start,kind,icon:{ride:'🚴',run:'🏃',gym:'🏋️'}[kind]||'🚶',cls:'activity',title:a.name||a.type||'Aktivita',meta:clock(a.start)+' · '+hm(num(a.durationHours)*60)+(measured(a.tss)?' · TSS '+fmt(a.tss):'')+(measured(hr)?' · Ø '+fmt(hr)+' bpm':'')+activityEnergyLabel(a)});}});
  // Walks, runs and other sessions the day view leaves out (it lists Intervals.icu
  // rides and Google Health exercises) come from the full activity list.
  add('other activities',()=>{const shown=items.filter(x=>x.cls==='activity').map(x=>({kind:x.kind,at:Date.parse(date+'T'+(clock(x.t)||'00:00')+':00Z')}));
    for(const row of state.activities?.activities||[]){if(!['activity','exercise'].includes(row.data_type)||row.record_role==='duplicate')continue;const a=activityRow(row);if(!a||pragueDay(a.start)!==date)continue;
      const at=Date.parse(date+'T'+(clock(a.start)||'00:00')+':00Z');if(shown.some(x=>x.kind===a.kind&&Math.abs(x.at-at)<=20*60000))continue;shown.push({kind:a.kind,at});
      items.push({t:a.start,kind:a.kind,icon:{ride:'🚴',run:'🏃',gym:'🏋️',walk:'🚶'}[a.kind]||'•',cls:'activity',title:a.name,meta:clock(a.start)+(a.minutes?' · '+hm(a.minutes):'')+(measured(a.tss)?' · TSS '+fmt(a.tss):'')});}});
  add('planned',()=>{const paired=new Set((t.matched||[]).map(m=>String(m.planned?.id||'')));
  for(const p of (t.planned||[]).filter(x=>!isNutritionItem(x)&&!paired.has(String(x.id||''))))items.push({t:/T(?!00:00)\d{2}:\d{2}/.test(String(p.start||''))?p.start:date+'T23:59',icon:'⏳',cls:'planned',title:'Plán · '+(p.name||'Trénink'),meta:(p.durationHours?hm(num(p.durationHours)*60):'')+(measured(p.tss)?' · TSS '+fmt(p.tss):'')});});
  // Foods logged for the same meal are one group with summed macros.
  add('food',()=>{const groups=new Map();for(const e of (mealEntries||[]).filter(e=>(e.consumed_date||date)===date)){const slot=foodMealSlot(e),key=slot+'|'+(slot==='unassigned'?String(e.consumed_at||'').slice(11,16):'');if(!groups.has(key))groups.set(key,{slot,entries:[]});groups.get(key).entries.push(e);}
  for(const g of groups.values()){const s=mealSlots.find(x=>x.id===g.slot),sum=k=>g.entries.reduce((a,e)=>a+num(e[k]),0),first=g.entries.map(e=>e.consumed_at).filter(Boolean).sort()[0];items.push({t:first||(date+'T'+(s?.time||'12:00')+':00'),icon:'🍽',cls:'food',title:(s?.name||'Jídlo')+' · '+fmt(sum('kcal'))+' kcal',meta:g.entries.map(e=>esc(e.recipe_title||'Jídlo')).join(', ')+' · B '+fmt(sum('protein_g'))+' g · S '+fmt(sum('carbs_g'))+' g · T '+fmt(sum('fat_g'))+' g',raw:true});}});
  // Weigh-ins of the day with the change against the last earlier one. A weight
  // written to Google Health comes back from it as the same point: shown once.
  // A record without a valid time is skipped.
  add('weight',()=>{const weights=(state.weight?.records||[]).filter(r=>measured(r.value_numeric)).map(r=>({...r,day:pragueDay(r.sample_time),at:clock(r.sample_time)})).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&!Number.isNaN(Date.parse(r.day+'T12:00:00Z'))).sort((a,b)=>(a.day+(a.at||'12:00')).localeCompare(b.day+(b.at||'12:00'))),before=weights.filter(r=>r.day<date).at(-1),seen=new Set();
  for(const w of weights.filter(r=>r.day===date)){const kg=num(w.value_numeric),key=w.at+'|'+fmt(kg,1);if(seen.has(key))continue;seen.add(key);const delta=before?kg-num(before.value_numeric):null;items.push({t:date+'T'+(w.at||'12:00')+':00',icon:'⚖',cls:'weight',title:'Váha · '+fmt(kg,1)+' kg',meta:delta==null?'první záznam':(delta>0?'+':delta<0?'−':'±')+fmt(Math.abs(delta),1)+' kg od '+dateLabel(before.day)});}});
  add('drinks',()=>{const f=state.fluids?.[date];if(f?.entries?.length)items.push({t:f.entries.at(-1).consumedAt,icon:'💧',cls:'water',title:'Pití · '+fluidLabel(f.totalMl),meta:f.entries.length+'× · cíl '+fluidLabel(f.target.ml)+' · naposledy'});});
  add('coach',()=>{for(const r of (state.reflections?.[date]||[]))items.push({t:date+'T23:58',icon:'💬',cls:'coach',title:'Kouč'+(r.rpe!=null?' · RPE '+fmt(r.rpe):'')+(r.notes?' · „'+r.notes+'“':''),meta:r.text,label:r.source==='ai'?'AI':'kouč'});});
  // Intervals.icu times are local, Google Health ones UTC: order by Prague time.
  items.sort((a,b)=>(clock(a.t)||'').localeCompare(clock(b.t)||''));
  el.innerHTML='<div class="detail-heading"><div><div class="label">Timeline</div><h3>'+(date===pragueToday()?'Tvůj den':'Den '+esc(longDate(date)))+'</h3></div><div class="actions"><button class="btn" type="button" id="timelineWeight">⚖ <span class="tl-verb">Zapsat </span>váhu</button><button class="btn" type="button" id="timelineFood">＋ <span class="tl-verb">Zapsat </span>jídlo</button><button class="btn" type="button" id="timelineCoach">💬 Kouč</button></div></div>'+(items.length?'<ol class="timeline">'+items.map(x=>'<li class="tl-'+x.cls+'"><span class="tl-icon">'+x.icon+'</span><div><strong>'+esc(x.title)+'</strong><small>'+(x.raw?x.meta:esc(x.meta))+'</small></div><time>'+esc(x.label||(x.cls==='planned'&&/T23:59/.test(x.t)?'plán':clock(x.t)))+'</time></li>').join('')+'</ol>':'<div class="data-gap">Pro tento den zatím nic nemám.</div>');
  $('timelineFood').onclick=()=>openFoodLogger();
  $('timelineWeight').disabled=date>pragueToday();$('timelineWeight').onclick=()=>openWeightSheet(date);
  $('timelineCoach').disabled=date>pragueToday();$('timelineCoach').onclick=()=>openCoachSheet(date);
}
// ---- Coach's notes: after RPE in the background, or asked for any day ----
async function loadReflections(date=selectedHistoryDate){
  try{const r=await jsonFetch('/app/api/coach/reflections?date='+date);state.reflections={...(state.reflections||{}),[date]:r.reflections||[]};if(date===selectedHistoryDate)renderDayTimeline();return state.reflections[date];}catch{return state.reflections?.[date]||[];}
}
// The note after an RPE is written on the server; check back a few times.
async function awaitReflection(date){
  const before=(await loadReflections(date)).length;
  for(let i=0;i<6;i++){await new Promise(r=>setTimeout(r,5000));const now=await loadReflections(date);if(now.length>before){toast('💬 Kouč napsal zpětnou vazbu k tréninku – najdeš ji v timeline dne.');loadScheduledWorkouts?.();return now[0];}}
}
function openCoachSheet(date){
  const notes=(state.reflections?.[date]||[]).map(r=>'<div class="coach-note"><small>'+esc(r.source==='ai'?'AI kouč':'Kouč')+(r.rpe!=null?' · RPE '+fmt(r.rpe):'')+(r.notes?' · „'+esc(r.notes)+'“':'')+'</small><p>'+esc(r.text)+'</p></div>').join('');
  openSheet('Kouč · '+(date===pragueToday()?'dnes':longDate(date)),notes+'<label class="coach-ask"><span class="small">Jak ses cítil? Co bylo jinak? (volitelné)</span><textarea id="coachNotes" rows="3" maxlength="1000" placeholder="např. těžké nohy, ráno procházka se psy"></textarea></label><div class="rpe-scale" id="coachRpe" role="group" aria-label="RPE">'+[1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" data-rpe="'+n+'">'+n+'</button>').join('')+'</div><p class="small">RPE je volitelné. Kouč projde timeline dne, předchozí dny, formu (TSB), spánek, HRV a tvoje poznámky.</p><button type="button" class="btn primary sheet-wide" id="coachAsk">Zeptat se kouče</button>',body=>{
    let rpe=null;$('coachRpe').onclick=e=>{const b=e.target.closest('[data-rpe]');if(!b)return;rpe=rpe===Number(b.dataset.rpe)?null:Number(b.dataset.rpe);$('coachRpe').querySelectorAll('button').forEach(x=>x.classList.toggle('active',Number(x.dataset.rpe)===rpe));};
    $('coachAsk').onclick=async()=>{const b=$('coachAsk');b.disabled=true;b.textContent='Kouč přemýšlí…';try{const r=await jsonFetch('/app/api/coach/reflections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,notes:$('coachNotes').value,rpe})});state.reflections={...(state.reflections||{}),[date]:[r.reflection,...(state.reflections?.[date]||[])]};renderDayTimeline();openCoachSheet(date);}catch(error){toast(error.message);b.disabled=false;b.textContent='Zeptat se kouče';}};
  });
}
// One stored activity row (Intervals.icu activity or Google Health exercise).
function activityRow(row){let p={};try{p=JSON.parse(row.payload_json||'{}');}catch{}const ex=p.exercise&&typeof p.exercise==='object'?p.exercise:null,type=String(ex?ex.exerciseType:p.type||p.category||''),start=row.start_time||p.start_date_local||p.start_date;if(!start)return null;
  const t=type.toLowerCase(),kind=/weight|strength/.test(t)?'gym':/ride|cycl|bik/.test(t)?'ride':/run/.test(t)?'run':/walk|hike/.test(t)?'walk':'other';
  const secs=ex?Number(String(ex.activeDuration||'').replace(/s$/i,'')):Number(p.moving_time??p.elapsed_time),span=row.end_time?(Date.parse(row.end_time)-Date.parse(start))/1000:NaN,minutes=secs>0?secs/60:span>0?span/60:null;
  return {start,kind,name:(ex?ex.displayName:p.name)||({walk:'Chůze',run:'Běh',ride:'Jízda',gym:'Posilovna'}[kind])||type||'Aktivita',minutes,tss:p.icu_training_load??p.training_load??null};}
// The Prague calendar day of a timestamp; one without a zone is already local.
function pragueDay(v){const s=String(v||'');if(!/(Z|[+-]\d{2}:?\d{2})$/.test(s))return s.slice(0,10);const d=new Date(s);if(Number.isNaN(d.getTime()))return s.slice(0,10);const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),g=t=>p.find(x=>x.type===t).value;return g('year')+'-'+g('month')+'-'+g('day');}

// Copy a food entry to several days at once (also ahead, as a meal plan).
function installMultiCopy(){
  const date=$('foodCopyDate');if(!date||$('foodCopyDays'))return;
  date.closest('label').insertAdjacentHTML('beforebegin','<div class="copy-days" id="foodCopyDays" role="group" aria-label="Kopírovat do dnů"></div>');
  const draw=()=>{const base=$('foodManageForm').elements.date.value||pragueToday();$('foodCopyDays').innerHTML=[['Dnes',pragueToday()],['Zítra',dateShift(pragueToday(),1)],...[2,3,4,5,6].map(i=>[new Intl.DateTimeFormat('cs-CZ',{weekday:'short',day:'numeric',month:'numeric'}).format(new Date(dateShift(pragueToday(),i)+'T12:00:00Z')),dateShift(pragueToday(),i)])].filter(([,d])=>d!==base).map(([l,d])=>'<label><input type="checkbox" value="'+d+'"> '+esc(l)+'</label>').join('');};
  const dialog=$('foodManageDialog'),open=dialog.showModal.bind(dialog);dialog.showModal=()=>{draw();open();};
  $('foodManageCopy').textContent='Kopírovat';
  $('foodManageCopy').onclick=async()=>{const button=$('foodManageCopy'),days=[...$('foodCopyDays').querySelectorAll('input:checked')].map(i=>i.value),extra=$('foodCopyDate').value,targets=[...new Set([...days,...(extra&&!days.length?[extra]:[])])];if(!targets.length){toast('Vyber den nebo dny pro kopii.');return}button.disabled=true;try{for(const targetDate of targets)await jsonFetch('/app/api/food/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:$('foodManageForm').elements.id.value,targetDate})});dialog.close();toast('Jídlo je zkopírované do '+targets.map(dateLabel).join(', ')+(targets.some(d=>d>pragueToday())?' · na budoucí dny jako plán jídelníčku':'')+'.');await refreshFoodDiary()}catch(error){toast('Kopie selhala: '+error.message)}finally{button.disabled=false}};
}

// Activity detail: intervals, heart rate recovery and a cadence chart.
function activityExtras(result){
  const hrr=result.hrr,rows=result.intervals||[],work=rows.filter(r=>/WORK/i.test(r.type||'')),list=(work.length?work:rows).slice(0,20),streams=result.streams||[];
  const hrrHtml=hrr?'<div class="hrr-card"><div><span class="label">Zotavení tepu · HRR</span><strong>−'+hrr.drop+' bpm</strong><small>z '+hrr.peak+' na '+hrr.after+' bpm za '+hrr.seconds+' s po posledním úseku v zóně 4+ (od '+hrr.threshold+' bpm)</small></div><p class="small">Čím rychleji tep klesá, tím lépe se srdce zotavuje. Sleduj trend, ne jednotlivou hodnotu.</p></div>':'';
  const intervals=list.length?'<h3>Intervaly</h3><div class="scroll"><table class="pr-table"><thead><tr><th>#</th><th>Čas</th><th>Výkon</th><th>NP</th><th>Tep</th><th>Kadence</th></tr></thead><tbody>'+list.map((r,i)=>'<tr><td>'+(i+1)+(r.label?' · '+esc(r.label):'')+'</td><td>'+esc(fmtStepTime(r.seconds))+'</td><td>'+(r.watts!=null?r.watts+' W':'—')+'</td><td>'+(r.np!=null?r.np+' W':'—')+'</td><td>'+(r.hr!=null?r.hr+(r.maxHr?' / '+r.maxHr:'')+' bpm':'—')+'</td><td>'+(r.cadence!=null?r.cadence+' rpm':'—')+'</td></tr>').join('')+'</tbody></table></div>':'';
  const cadence=streams.find(s=>s.type==='cadence')?.points?.length?activityStreamChart(streams.find(s=>s.type==='cadence'),'#64d2ff','Kadence','rpm'):'';
  return hrrHtml+intervals+(cadence?'<div class="experience-grid"><div>'+cadence+'</div></div>':'');
}

function installFitnessInsights(){
  $('training').insertAdjacentHTML('beforeend','<div class="section">Svaly, kardio a rekordy</div><div id="fitnessInsights"><div class="notice">Načítám svaly, zátěž a rekordy…</div></div>');
  // Keep it high up: right after the performance capacity tiles.
  const anchor=[...$('training').querySelectorAll('.section')].find(s=>s.textContent.startsWith('Týdenní rytmus'));
  if(anchor){const sec=$('fitnessInsights').previousElementSibling;anchor.before(sec,$('fitnessInsights'));}
  $('dailyPulse')?.insertAdjacentHTML('afterend','<article class="card" id="dayTimeline"></article>');
  installMultiCopy();
  const previous=load;load=async()=>{await previous();renderDayTimeline();loadInsights();loadReflections();};
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
function closeSheet(){const s=$('sheet');if(!s||s.hidden)return;s.classList.remove('open');document.body.classList.remove('sheet-open');sheetCloseTimer=setTimeout(()=>{s.hidden=true;$('sheetBody').innerHTML='';},180);}
function openSheet(title,body,onMount,panelClass=''){
  if(!$('sheet'))document.body.insertAdjacentHTML('beforeend','<div id="sheet" class="sheet" hidden><div class="sheet-backdrop" data-sheet-close></div><section class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"><div class="sheet-handle" data-sheet-close></div><div class="sheet-head"><h3 id="sheetTitle"></h3><button type="button" class="btn" data-sheet-close aria-label="Zavřít">✕</button></div><div id="sheetBody"></div></section></div>');
  clearTimeout(sheetCloseTimer);const s=$('sheet');s.className='sheet '+panelClass;$('sheetTitle').textContent=title;$('sheetBody').innerHTML=body;s.hidden=false;s.querySelector('.sheet-panel').scrollTop=0;document.body.classList.add('sheet-open');requestAnimationFrame(()=>s.classList.add('open'));
  s.onclick=e=>{if(e.target.closest('[data-sheet-close]'))closeSheet();};
  if(onMount)onMount($('sheetBody'));
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
const SPORT_ICON={ride:'🚴',run:'🏃',gym:'🏋️'};
function miniRing(label,value,progress,color,sub,view){return '<button type="button" class="mini-ring" data-go="'+view+'"><span class="mini-ring-dial" style="--p:'+Math.max(0,Math.min(100,num(progress)))+';--c:'+color+'"><b>'+esc(value)+'</b></span><span class="mini-ring-label">'+esc(label)+'</span><small>'+esc(sub)+'</small></button>';}
function todayItems(date){
  const days=hubDays()||state.week?.days||[],d=days.find(x=>x.date===date)||(date===selectedHistoryDate?{date,daily:state.daily}:null),t=d?.daily?.training||{},out=[];
  for(const a of (t.completed||[]).filter(x=>!isNutritionItem(x)))out.push({kind:'done',sport:activitySport(a),name:a.name||a.type,meta:hm(num(a.durationHours)*60)+(measured(a.tss)?' · TSS '+fmt(a.tss):''),a});
  const paired=new Set((t.matched||[]).map(m=>String(m.planned?.id||'')));
  for(const p of (t.planned||[]).filter(x=>!isNutritionItem(x)&&!paired.has(String(x.id||''))))out.push({kind:'planned',sport:activitySport(p),name:p.name||'Plán',meta:(p.durationHours?hm(num(p.durationHours)*60):'')+(measured(p.tss)?' · TSS '+fmt(p.tss):''),p});
  const sports=new Set(out.map(x=>x.sport));
  if(date===pragueToday()&&(state.gym?.date||pragueToday())===date&&(state.gym?.values||[]).slice(7).some(r=>r?.[1])&&!sports.has('gym')){out.push({kind:'gymplan',sport:'gym',name:state.gym.values[2]?.[1]||'Silový trénink',meta:(state.gym.values.slice(7).filter(r=>r?.[1]).length)+' sérií v plánu'});sports.add('gym');}
  const role=date>=pragueToday()&&!statusPausesTraining()?(state.weekPlan?.roles?.[weekdayOf(date)]?.items||[]):[];
  for(const x of role)if(!sports.has(x.sport))out.push({kind:'role',sport:x.sport,name:x.label,meta:'podle plánu týdne'});
  return out;
}
// Walks are everyday movement, not training: they get no rating.
function isWalkActivity(a){return !activitySport(a)&&/walk|hike|chůze|procház|túra/i.test(String(a?.type||'')+' '+String(a?.name||''))}
function todayItemHtml(x){
  const actions=x.kind==='planned'&&/^planned:/.test(String(x.p?.id||''))?'<button class="btn" data-today="move" data-id="'+esc(x.p.id)+'" data-name="'+esc(x.name)+'">Přesunout</button>':
    x.kind==='role'&&x.sport!=='gym'?'<button class="btn primary" data-today="generate" data-sport="'+x.sport+'">Generovat</button>':
    (x.kind==='gymplan'||x.kind==='role'&&x.sport==='gym')&&!(statusPausesTraining()&&(state.todayPick||pragueToday())>=pragueToday())?'<button class="btn primary" data-today="gym">▶ Začít</button>':
    x.kind==='done'&&!isWalkActivity(x.a)?'<button class="btn" data-today="rate" data-name="'+esc(x.name||'Trénink')+'">Hodnocení</button>':'';
  return '<div class="today-item '+x.kind+'"><span class="today-icon">'+(SPORT_ICON[x.sport]||'•')+'</span><div><strong>'+esc(x.name)+'</strong><small>'+(x.kind==='done'?'✓ hotovo · ':x.kind==='planned'?'plán · ':x.kind==='role'?'návrh · ':'')+esc(x.meta||'')+'</small></div>'+actions+'</div>';
}
function renderToday(){
  const el=$('today');if(!el||!state.daily)return;
  const date=selectedHistoryDate,food=state.daily?.nutrition?.foodLog?.totals||{},target=num(state.daily?.nutrition?.calorieTarget);
  const night=primarySleepSessions(state.sleep?.sessions).find(s=>(s.date||String(s.endTime||'').slice(0,10))===date),sleep=sleepIndex(night);
  const t=state.daily?.training||{},done=(t.completed||[]).filter(a=>!isNutritionItem(a)).reduce((s,a)=>s+num(a.tss),0),plan=(t.planned||[]).filter(a=>!isNutritionItem(a)).reduce((s,a)=>s+num(a.tss),0);
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  const days=(hubDays()||state.week?.days||[]).map(d=>d.date);if(!state.todayPick||!days.includes(state.todayPick))state.todayPick=days.includes(date)?date:days[0];
  const strip=days.map(d=>{const items=todayItems(d),icons=[...new Set(items.map(x=>x.sport).filter(Boolean))].slice(0,3).map(s=>SPORT_ICON[s]).join('');return '<button type="button" class="strip-day'+(d===state.todayPick?' active':'')+(d===pragueToday()?' today':'')+'" data-strip="'+d+'"><span>'+esc(new Intl.DateTimeFormat('cs-CZ',{weekday:'short'}).format(new Date(d+'T12:00:00Z')))+'</span><b>'+Number(d.slice(8))+'</b><i>'+(icons||'·')+'</i></button>';}).join('');
  const pick=state.todayPick,pickItems=todayItems(pick);
  // The timeline may sit in this screen: park it back in Přehled before the
  // screen is rebuilt, or the rebuild would delete it.
  const parked=$('dayTimeline');if(parked&&el.contains(parked))$('dailyPulse')?.after(parked);
  ($('todayTop')||el).innerHTML='<div class="today-layout"><div class="today-main"><div class="today-head"><div class="eyebrow">'+esc(longDate(date))+(()=>{const p=savedProfile(),days=p.eventDate?Math.round((Date.parse(p.eventDate+'T12:00:00Z')-Date.parse(pragueToday()+'T12:00:00Z'))/864e5):null;return days!=null&&days>=0?' · 🏁 '+esc(p.eventName||'Závod')+' za '+days+' dní':'';})()+'</div><h1>'+(date!==pragueToday()?'Den':hour<10?'Dobré ráno':hour<18?'Dnes':'Dobrý večer')+'</h1></div>'+
    '<div class="mini-rings">'+miniRing('Spánek',sleep==null?'—':sleep+'%',sleep||0,'#a99bff',night?hm(night.durationMin):'bez záznamu','recovery')+(()=>{const s=dayStrain(date,done),goal=trainingStrain(Math.max(plan,done));return miniRing('Strain',s==null?'—':fmt(s,1),s==null?0:s/21*100,'#83e9c3',s==null?(plan?'plán ~'+fmt(goal,1):'zatím klid'):strainBand(s)+(plan>done?' · plán ~'+fmt(goal,1):''),'training');})()+miniRing('Kalorie',target?fmt(num(food.kcal)/target*100)+'%':'—',target?num(food.kcal)/target*100:0,'#ffc274',fmt(food.kcal)+' / '+fmt(target)+' kcal','nutrition')+(()=>{const f=state.fluids?.[date];return miniRing('Pití',f?fluidLabel(f.totalMl):'—',f?f.totalMl/Math.max(1,f.target.ml)*100:0,'#64d2ff',f?'cíl '+fluidLabel(f.target.ml):'načítám','water');})()+'</div>'+
    '<article class="card today-card"><div class="today-card-head"><div class="label">Trénink · '+esc(pick===pragueToday()?'dnes':longDate(pick))+'</div><div class="today-card-tools">'+(()=>{const wk=mondayOf(pick),cur=wk===pragueMonday();return '<span class="today-week-nav" role="group" aria-label="Týden"><button type="button" class="btn review-btn" data-week-step="-1" aria-label="Předchozí týden">‹</button><span class="small">Týden '+isoWeek(wk)+'</span><button type="button" class="btn review-btn" data-week-step="1" aria-label="Další týden">›</button>'+(cur?'':'<button type="button" class="btn review-btn" data-week-step="0">Tento týden</button>')+'</span>';})()+'<button type="button" class="btn review-btn" data-review="'+esc(pick)+'">🔍 Revize dne</button></div></div>'+(pickItems.length?pickItems.map(todayItemHtml).join(''):'<p class="small">Volno. Sport na tento den přidáš ve Workoutech v plánu týdne.</p>')+'<div class="week-strip" role="group" aria-label="Dny týdne">'+strip+'</div></article>'+
    '</div><div id="todayTimelineSlot"></div></div>';
  // One timeline for both screens: it moves here only while Dnes is shown,
  // otherwise a data reload would take it out of the visible Přehled.
  const tl=$('dayTimeline');if(tl&&el.classList.contains('active'))$('todayTimelineSlot').appendChild(tl);
  renderAthleteStatus();
}
// Dnes → Trénink browses whole weeks: the same weekday a week back or ahead,
// or back to today. The week is shared with the plan in Workouty.
async function shiftTodayWeek(step){
  const base=mondayOf(state.todayPick||selectedHistoryDate),next=step?dateShift(base,7*step):pragueMonday();
  const offset=Math.round((Date.parse((state.todayPick||base)+'T12:00:00Z')-Date.parse(base+'T12:00:00Z'))/864e5);
  state.hubWeek=next;state.todayPick=step?dateShift(next,Math.max(0,Math.min(6,offset))):pragueToday();
  const card=document.querySelector('#today .today-card');if(card)card.classList.add('loading');
  try{await Promise.all([hubWeekData(),loadWeekPlan(true)]);}catch(error){toast('Týden se nenačetl: '+error.message);}
  renderToday();
}
async function todayAction(b){
  const a=b.dataset.today;
  if(a==='move'){const id=b.dataset.id,name=b.dataset.name;openSheet('Přesunout „'+name+'“',dayChips(),body=>body.addEventListener('click',e=>{const c=e.target.closest('[data-move-to]');if(c){closeSheet();movePlanned(id,c.dataset.moveTo,name);}if(e.target.closest('[data-delete-planned]')){closeSheet();deletePlanned(id,name);}}));return}
  if(a==='generate'){activate('workouts');setWorkoutSport(b.dataset.sport);$('generateDate').value=state.todayPick||pragueToday();await generateWorkoutForDay(0);$('generatedWorkout').scrollIntoView({behavior:'smooth',block:'start'});return}
  if(a==='gym'){await openGymDay(state.todayPick||pragueToday(),false);openGymMode();return}
  if(a==='rpe'){openRpeSheet();}if(a==='rate')openRatingSheet({date:state.todayPick||pragueToday(),name:b.dataset.name});
}
function dayChips(){const today=pragueToday();return '<p class="small">Vyber den. Změna se propíše i do Intervals.icu.</p><div class="sheet-days">'+Array.from({length:10},(_,i)=>{const d=dateShift(today,i);return '<button type="button" class="btn" data-move-to="'+d+'"><b>'+esc(new Intl.DateTimeFormat('cs-CZ',{weekday:'short'}).format(new Date(d+'T12:00:00Z')))+'</b>'+esc(dateLabel(d))+'</button>'}).join('')+'</div><button type="button" class="btn sheet-danger" data-delete-planned>Smazat z plánu i z Intervals.icu</button>';}
async function openRpeSheet(){
  openSheet('RPE k tréninku','<p class="small">Načítám naplánované workouty…</p>');
  let rows=[];try{rows=(await jsonFetch('/app/api/workouts/scheduled')).workouts||[];}catch{}
  const due=rows.filter(w=>!w.feedback_id&&w.scheduled_date<=pragueToday());
  $('sheetBody').innerHTML=due.length?due.map(w=>'<div class="rpe-pick" data-id="'+esc(w.workout_id)+'" data-date="'+esc(w.scheduled_date)+'"><strong>'+esc(w.name)+'</strong><small>'+esc(longDate(w.scheduled_date))+(w.completed_percent!=null?' · dokončeno '+Math.round(w.completed_percent)+' %':'')+'</small><div class="rpe-scale">'+[1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" data-rpe="'+n+'">'+n+'</button>').join('')+'</div></div>').join('')+'<p class="small">1–2 velmi lehce · 5–6 středně · 9–10 maximum. Uloží se i do Intervals.icu.</p>':'<p class="small">Žádný odjetý workout z knihovny nečeká na RPE.</p>';
  $('sheetBody').onclick=async e=>{const b=e.target.closest('[data-rpe]');if(!b)return;const row=b.closest('.rpe-pick');b.disabled=true;try{const r=await jsonFetch('/app/api/workouts/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workoutId:row.dataset.id,scheduledDate:row.dataset.date,rpe:Number(b.dataset.rpe)})});row.innerHTML='<strong>✓ RPE '+b.dataset.rpe+' uloženo</strong><small>'+(r.intervals?.status==='ok'?'i v Intervals.icu':'v aplikaci')+(r.reflection==='pending'?' · kouč připravuje zpětnou vazbu':'')+'</small>';if(r.reflection==='pending')awaitReflection(row.dataset.date);}catch(error){toast(error.message);b.disabled=false;}};
}
function openWeightSheet(date=pragueToday()){
  // The last weight, or an empty field to type the first one.
  if(typeof date!=='string'||date>pragueToday())date=pragueToday();
  const last=Number((state.weight?.records||[]).filter(r=>measured(r.value_numeric)).at(-1)?.value_numeric)||null;
  openSheet('Zapsat váhu','<div class="stepper big"><button type="button" data-step="-0.1">−</button><input id="weightValue" class="food-input" type="text" inputmode="decimal" autocomplete="off" placeholder="kg" aria-label="Váha v kg" style="width:7ch;text-align:center;font-size:inherit" value="'+(last?last.toFixed(1):'')+'"><button type="button" data-step="0.1">+</button></div><p class="small" style="text-align:center">kg · '+esc(date===pragueToday()?'dnes':longDate(date))+'</p><button type="button" class="btn primary sheet-wide" id="weightSave">Uložit</button>',body=>{
    const read=()=>Number(String($('weightValue').value).replace(',','.'));
    body.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const v=read();if(v>0)$('weightValue').value=(Math.round((v+Number(b.dataset.step))*10)/10).toFixed(1);});
    $('weightSave').onclick=async()=>{const v=Math.round(read()*10)/10;if(!(v>=30&&v<=300))return toast('Zadej váhu v kg.');try{await jsonFetch('/app/api/weight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kg:v,date})});closeSheet();toast('Váha '+fmt(v,1)+' kg je uložená.');load();}catch(error){toast(error.message);}};
  });
}
function openQuickAdd(){
  openSheet('Rychle zapsat','<div class="quick-actions">'+[['food','🍽','Jídlo'],['barcode','▥','Čárový kód'],['label','📷','Fotka etikety'],['water','💧','Pití'],['weight','⚖','Váha'],['rpe','💬','Hodnocení'],['gym','🏋️','Gym trénink']].map(([k,i,l])=>'<button type="button" data-quick="'+k+'"><span>'+i+'</span>'+l+'</button>').join('')+'</div>',body=>body.onclick=e=>{const b=e.target.closest('[data-quick]');if(!b)return;const k=b.dataset.quick;
    if(k==='water')return openFluidSheet(selectedHistoryDate);if(k==='weight')return openWeightSheet();if(k==='rpe')return openRatingSheet({date:selectedHistoryDate});closeSheet();
    if(k==='gym')return openGymMode();
    if(k==='barcode')return openBarcodeScanner();openFoodLogger();if(k==='label')$('foodLabelPhoto')?.click();});
}

// Gym workout mode: one set at a time, steppers for weight and reps, RPE, rest timer.
let gymMode=null;
function gymFailureValue(value){return value===true||/^(true|1|ano)$/i.test(String(value||''));}
function gymSupersetSelect(group,attrs=''){return '<select class="gym-superset-select" '+attrs+' aria-label="Supersérie"><option value="">Bez supersérie</option>'+['A','B','C','D','E','F'].map(id=>'<option value="'+id+'"'+(group===id?' selected':'')+'>Supersérie '+id+'</option>').join('')+'</select>';}
function gymOptionsCell(r){return String(r[0]).toUpperCase()==='WARMUP'?'<td class="gym-options-cell">—</td>':'<td class="gym-options-cell"><label><input type="checkbox" data-col="11"'+(gymFailureValue(r[11])?' checked':'')+'>Do selhání</label>'+gymSupersetSelect(r[12],'data-superset')+'</td>';}
function gymModeOptionsHtml(r){return String(r[0]).toUpperCase()==='WARMUP'?'':'<div class="gym-set-options"><label><input id="gmFailure" type="checkbox"'+(gymMode.toFailure?' checked':'')+'>Do selhání · RPE 10</label>'+gymSupersetSelect(r[12],'id="gmSuperset"')+'</div>'+(r[12]?'<p class="small">Supersérie '+esc(r[12])+' · cviky se střídají, odpočinek po celém kole.</p>':'');}
function upgradeGymOptionsHeader(values){if(!values[6])values[6]=['Typ','Cvik','Série','Plán kg','Plán reps','Skutečně kg','Skutečně reps','RPE','Hotovo','Poznámka','Video'];values[6][11]='Do selhání';values[6][12]='Supersérie';}
async function setGymSuperset(idx,group){
  const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]),exercise=values[idx]?.[1];if(!exercise)return;
  for(const r of values.slice(7))if(r[1]===exercise&&String(r[0]).toUpperCase()==='WORK')r[12]=/^[A-F]$/.test(group)?group:'';
  upgradeGymOptionsHeader(values);
  gymSaveQueue=gymSaveQueue.then(async()=>{const result=await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:values.slice(7),fullValues:values,date:gymDay()})});state.gym={...state.gym,values:result.values||values,history:result.history||state.gym?.history||[]};renderGym();renderGymHistory(state.gym.history);});
  await gymSaveQueue;
}
function orderGymSets(values){
  const sets=values.map((r,i)=>({r,i})).filter(x=>x.i>=7&&x.r?.[1]&&/^(WORK|WARMUP)$/i.test(String(x.r[0]||'WORK'))),groups=new Map(),emitted=new Set(),out=[];
  for(const x of sets)if(String(x.r[0]).toUpperCase()==='WORK'&&/^[A-F]$/.test(x.r[12]||''))groups.set(x.r[1],x.r[12]);
  for(const x of sets){const group=groups.get(x.r[1]);if(!group){out.push(x);continue;}if(emitted.has(group))continue;emitted.add(group);const members=sets.filter(s=>groups.get(s.r[1])===group),work=members.filter(s=>String(s.r[0]).toUpperCase()!=='WARMUP'),exercises=[...new Set(work.map(s=>s.r[1]))];out.push(...members.filter(s=>String(s.r[0]).toUpperCase()==='WARMUP'));const queues=exercises.map(name=>work.filter(s=>s.r[1]===name));for(let round=0;queues.some(q=>q[round]);round++)for(const q of queues)if(q[round])out.push({...q[round],superset:group,round});}
  return out;
}
function gymSets(){return orderGymSets(state.gym?.values||[]);}
async function saveGymSet(idx,{kg,reps,rpe,toFailure}){
  const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]);const row=values[idx];row[5]=String(kg);row[6]=String(reps);row[7]=toFailure?'10':rpe?String(rpe):'';row[8]='TRUE';row[11]=toFailure?'TRUE':'FALSE';upgradeGymOptionsHeader(values);
  const used=values.slice(7);while(used.length&&used[used.length-1].every(v=>String(v??'').trim()===''))used.pop();
  const result=await jsonFetch('/app/api/gym',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:used,fullValues:values.slice(0,7).concat(used),date:gymDay()})});
  state.gym={...state.gym,values:result.values||values,history:result.history||state.gym?.history||[]};try{renderGym();}catch{}
}
async function openGymMode(){
  if(!state.gym?.values)await loadGym().catch(()=>{});
  if(!$('gymMode'))document.body.insertAdjacentHTML('beforeend','<div id="gymMode" class="gym-mode" hidden role="dialog" aria-modal="true" aria-label="Režim tréninku"></div>');
  const sets=gymSets();const first=sets.findIndex(x=>String(x.r[8]).toUpperCase()!=='TRUE');
  gymMode={pos:first<0?0:first,rest:null};$('gymMode').hidden=false;document.body.classList.add('gym-mode-open');renderGymMode();
}
function closeGymMode(){clearInterval(gymMode?.timer);$('gymMode').hidden=true;document.body.classList.remove('gym-mode-open');gymMode=null;try{renderToday();}catch{}}
function renderGymMode(){
  const el=$('gymMode');if(!el||!gymMode)return;const sets=gymSets();
  if(!sets.length){el.innerHTML='<div class="gm-top"><button class="btn" data-gm="close">✕</button></div><div class="gm-empty"><h2>Dnes bez plánu</h2><p class="small">Nech trenéra sestavit trénink podle týdne a únavy.</p><button class="btn primary" data-gm="generate">Generovat trénink</button></div>';return wireGymMode();}
  const doneCount=sets.filter(x=>String(x.r[8]).toUpperCase()==='TRUE').length;
  if(gymMode.finished||doneCount===sets.length&&gymMode.pos>=sets.length){const vol=sets.reduce((s,x)=>s+num(x.r[5])*num(x.r[6]),0);el.innerHTML='<div class="gm-top"><span></span><button class="btn" data-gm="close">✕</button></div><div class="gm-empty"><div class="gm-check">✓</div><h2>Trénink hotový</h2><p>'+doneCount+' sérií · objem '+fmt(vol)+' kg</p><button class="btn primary" data-gm="close">Zavřít</button></div>';return wireGymMode();}
  gymMode.pos=Math.max(0,Math.min(sets.length-1,gymMode.pos));const cur=sets[gymMode.pos],r=cur.r,name=r[1],warm=x=>String(x.r[0]).toUpperCase()==='WARMUP',same=sets.filter(x=>x.r[1]===name&&warm(x)===warm(cur)),k=same.indexOf(cur)+1;
  const exercises=[...new Set(sets.map(x=>x.r[1]))],ex=exercises.indexOf(name)+1,done=String(r[8]).toUpperCase()==='TRUE';
  if(gymMode.kg==null||gymMode.forIdx!==cur.i){gymMode.forIdx=cur.i;gymMode.kg=num(r[5]||r[3]||same.find(x=>x.r[5])?.r[5],0);gymMode.reps=num(r[6]||r[4],10);gymMode.rpe=num(r[7],0)||null;gymMode.toFailure=gymFailureValue(r[11]);}
  const rest=gymMode.rest?'<div class="gm-rest"><div class="gm-rest-ring" style="--p:'+(gymMode.rest.left/gymMode.rest.total*100)+'"><b>'+Math.floor(gymMode.rest.left/60)+':'+String(gymMode.rest.left%60).padStart(2,'0')+'</b><small>pauza</small></div><div class="gm-rest-actions"><button class="btn" data-gm="rest+">+30 s</button><button class="btn primary" data-gm="rest-skip">Pokračovat</button></div></div>':'';
  el.innerHTML='<div class="gm-top"><span class="small">Cvik '+ex+' / '+exercises.length+' · '+doneCount+' / '+sets.length+' sérií</span><button class="btn" data-gm="close" aria-label="Zavřít režim tréninku">✕</button></div><div class="gm-progress"><i style="width:'+(doneCount/sets.length*100)+'%"></i></div>'+
    '<div class="gm-body" id="gmBody"><div class="eyebrow"'+(warm(cur)?' style="color:#f5c26b"':'')+'>'+(warm(cur)?'Rozcvička ':'Série ')+k+' z '+same.length+(done?' · ✓ hotovo':'')+'</div><h2>'+esc(name)+'</h2><p class="small">Plán '+esc(r[3]||'—')+' kg × '+esc(r[4]||'—')+'</p>'+
    (rest||'<div class="gm-steppers"><div><span class="label">Váha · kg</span><div class="stepper"><button type="button" data-gm="kg-">−</button><output>'+fmt(gymMode.kg,1)+'</output><button type="button" data-gm="kg+">+</button></div></div><div><span class="label">Opakování</span><div class="stepper"><button type="button" data-gm="reps-">−</button><output>'+gymMode.reps+'</output><button type="button" data-gm="reps+">+</button></div></div></div><div class="label" style="margin-top:14px">RPE (volitelně)</div><div class="gm-rpe">'+[6,7,8,9,10].map(n=>'<button type="button" data-gm-rpe="'+n+'" aria-pressed="'+(gymMode.rpe===n)+'">'+n+'</button>').join('')+'</div>'+gymModeOptionsHtml(r)+'<button type="button" class="btn primary gm-done" data-gm="done">'+(done?'Uložit znovu ✓':'Série hotová ✓')+'</button>')+
    '</div><div class="gm-nav"><button class="btn" data-gm="prev">◀ Předchozí</button><button class="btn" data-gm="next">Další ▶</button></div>';
  wireGymMode();
}
function wireGymMode(){
  const el=$('gymMode');
  el.onchange=async e=>{if(!gymMode)return;if(e.target.id==='gmFailure'){gymMode.toFailure=e.target.checked;if(gymMode.toFailure)gymMode.rpe=10;renderGymMode();}if(e.target.id==='gmSuperset'){const cur=gymSets()[gymMode.pos];try{await setGymSuperset(cur.i,e.target.value);gymMode.pos=gymSets().findIndex(x=>x.i===cur.i);renderGymMode();}catch(error){toast(error.message);}}};
  el.onclick=async e=>{const b=e.target.closest('[data-gm],[data-gm-rpe]');if(!b||!gymMode)return;const a=b.dataset.gm,sets=gymSets();
    if(b.dataset.gmRpe){gymMode.rpe=gymMode.rpe===Number(b.dataset.gmRpe)?null:Number(b.dataset.gmRpe);return renderGymMode();}
    if(a==='close')return closeGymMode();
    if(a==='generate'){b.disabled=true;b.textContent='Generuji…';try{await jsonFetch('/app/api/gym/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:gymDay()})});await loadGym();}catch(error){toast(error.message);}gymMode.pos=0;return renderGymMode();}
    if(a==='kg-'||a==='kg+'){gymMode.kg=Math.max(0,Math.round((gymMode.kg+(a==='kg+'?2.5:-2.5))*10)/10);return renderGymMode();}
    if(a==='reps-'||a==='reps+'){gymMode.reps=Math.max(0,gymMode.reps+(a==='reps+'?1:-1));return renderGymMode();}
    if(a==='prev'||a==='next'){gymMode.rest=null;clearInterval(gymMode.timer);gymMode.pos+=a==='next'?1:-1;if(gymMode.pos>=sets.length){gymMode.finished=true;}return renderGymMode();}
    if(a==='rest+'){gymMode.rest.left+=30;gymMode.rest.total+=30;return renderGymMode();}
    if(a==='rest-skip'){clearInterval(gymMode.timer);gymMode.rest=null;return renderGymMode();}
    if(a==='done'){b.disabled=true;const cur=sets[gymMode.pos];try{await saveGymSet(cur.i,{kg:gymMode.kg,reps:gymMode.reps,rpe:gymMode.rpe,toFailure:gymMode.toFailure});}catch(error){toast('Série se neuložila: '+error.message);b.disabled=false;return}
      const next=gymSets().findIndex((x,i)=>i>gymMode.pos&&String(x.r[8]).toUpperCase()!=='TRUE');if(next<0&&gymSets().every(x=>String(x.r[8]).toUpperCase()==='TRUE')){gymMode.finished=true;return renderGymMode();}
      gymMode.pos=next<0?gymMode.pos+1:next;const upcoming=gymSets()[gymMode.pos],withinSuperset=cur.superset&&cur.superset===upcoming?.superset&&cur.round===upcoming?.round;clearInterval(gymMode.timer);gymMode.rest=withinSuperset?null:{left:90,total:90};if(gymMode.rest)gymMode.timer=setInterval(()=>{if(!gymMode?.rest)return clearInterval(gymMode?.timer);gymMode.rest.left--;if(gymMode.rest.left<=0){clearInterval(gymMode.timer);gymMode.rest=null;try{navigator.vibrate?.(200)}catch{}}renderGymMode();},1000);return renderGymMode();}
  };
  // Swipe left / right between sets.
  let x0=null;el.ontouchstart=e=>{x0=e.touches[0].clientX};el.ontouchend=e=>{if(x0==null||!gymMode)return;const dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>70&&!gymMode.rest){gymMode.pos+=dx<0?1:-1;if(gymMode.pos>=gymSets().length)gymMode.finished=true;renderGymMode();}};
}

function installPhoneLayer(){
  document.body.insertAdjacentHTML('beforeend','<button type="button" class="fab" id="quickAdd" aria-label="Rychle zapsat">+</button>');
  $('quickAdd').onclick=openQuickAdd;
  $('today').addEventListener('click',e=>{const go=e.target.closest('[data-go]');if(go){if(go.dataset.go==='water')openFluidSheet(selectedHistoryDate);else activate(go.dataset.go);return}const s=e.target.closest('[data-strip]');if(s){state.todayPick=s.dataset.strip;renderToday();return}const rv=e.target.closest('[data-review]');if(rv){openReviewSheet(rv.dataset.review);return}const ws=e.target.closest('[data-week-step]');if(ws){shiftTodayWeek(Number(ws.dataset.weekStep));return}const b=e.target.closest('[data-today]');if(b)todayAction(b);});
  // On a phone the small menus become bottom sheets.
  window.addEventListener('click',e=>{
    if(!isPhone())return;
    const tip=e.target.closest('.info-tip');
    if(tip){e.preventDefault();e.stopPropagation();const [title,...ps]=INFO_TEXTS[tip.dataset.info]||['Nápověda','Bez popisu.'];openSheet(title,ps.map(p=>'<p>'+esc(p)+'</p>').join(''));return}
    const item=e.target.closest('#hubWeek .hub-item.editable');
    if(item&&!e.target.closest('.hub-actions')){e.preventDefault();e.stopPropagation();const id=item.dataset.eventId,name=item.dataset.name;openSheet('„'+name+'“',dayChips(),body=>body.addEventListener('click',ev=>{const c=ev.target.closest('[data-move-to]');if(c){closeSheet();movePlanned(id,c.dataset.moveTo,name);}if(ev.target.closest('[data-delete-planned]')){closeSheet();deletePlanned(id,name);}}));}
  },true);
  // The gym panel gets the workout mode on every screen size.
  $('generateGym')?.insertAdjacentHTML('beforebegin','<button class="btn primary" id="startGymMode" type="button">▶ Režim tréninku</button>');
  $('startGymMode').onclick=openGymMode;
  const previous=load;load=async()=>{await previous();await loadWeekPlan().catch(()=>{});renderToday();};
  const wasActivate=activate;activate=function(id){wasActivate(id);$('quickAdd').hidden=id==='settings';if(id!=='today'){const tl=$('dayTimeline'),pulse=$('dailyPulse');if(id==='overview'&&tl&&pulse)pulse.after(tl);}else renderToday();};
  let restored='today';try{const saved=localStorage.getItem('pfd-active-view');if($(saved)?.classList.contains('view'))restored=saved;}catch{}activate(restored);
}
installPhoneLayer();

// ---- Proposals for the plan of the week and the gym day ----
// "Navrhnout tréninky" turns every open plan chip (today and later) into a
// concrete session: rides and runs from the generator (with the chip's length),
// gym days as a plan for that day. Nothing goes to Intervals.icu until asked.
async function proposeWeek(){
  return showAdaptiveWeekProposal();
}
async function generateWeekProposals(items){
  const revision=statusCoachingRevision;
  const b=$('proposeWeek');
  b.disabled=true;state.proposals=state.proposals||{};
  try{
    let n=0;for(const x of items){if(revision!==statusCoachingRevision)return;n++;$('plannerStatus').textContent='Navrhuji '+n+' / '+items.length+'…';const key=x.date+'|'+x.sport;state.proposals[key]={status:'busy'};renderWeekHub();
      try{
        if(x.sport==='gym'){
          const g=await jsonFetch('/app/api/gym/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:x.date,preview:true,durationMinutes:x.minutes,startTime:x.startTime,focus:x.role==='gym_upper'?'upper':undefined,focusSource:'week'})});
          if(revision!==statusCoachingRevision)return;
          state.proposals[key]={gym:new Set((g.plan?.rows||[]).map(r=>r?.[1]).filter(Boolean)).size,gymPreview:g,existing:x.existing};
        }else{
          const r=await jsonFetch('/app/api/workouts/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:x.date,sport:x.sport,environment:x.environment||'auto',availabilityMinutes:x.minutes})});
          if(revision!==statusCoachingRevision)return;
          state.proposals[key]=r.status==='ok'?{workout:r.workout,result:r,existing:x.existing}:{error:r.message||'Bez návrhu'};
        }
      }catch(error){if(revision!==statusCoachingRevision)return;state.proposals[key]={error:error.message};}
      renderWeekHub();
    }
    const open=Object.values(state.proposals).filter(p=>p.workout&&!p.scheduled&&!p.existing).length;
    $('plannerStatus').innerHTML=open?'Hotovo · <button type="button" class="btn" id="proposeAddAll">Přidat vše do Intervals.icu ('+open+')</button>':'Hotovo';
    const all=$('proposeAddAll');if(all)all.onclick=addAllProposals;
  }finally{b.disabled=false;}
}
async function scheduleProposal(key){
  const pr=state.proposals?.[key];if(!pr?.workout||pr.existing)return false;const [date]=key.split('|');
  await jsonFetch('/app/api/workouts/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workoutId:pr.workout.id,date,confirm:true,environment:pr.result?.environment||'outdoor'})});
  pr.scheduled=true;return true;
}
async function addAllProposals(){
  const keys=Object.keys(state.proposals||{}).filter(k=>state.proposals[k].workout&&!state.proposals[k].scheduled&&!state.proposals[k].existing);
  if(!keys.length||!window.confirm('Přidat '+keys.length+' navržené tréninky do Intervals.icu?'))return;
  let ok=0;for(const k of keys){try{if(await scheduleProposal(k))ok++;}catch(error){toast('Zápis selhal: '+error.message);}}
  toast(ok+' tréninků je v Intervals.icu.');$('plannerStatus').textContent='✓ '+ok+' v Intervals.icu';state.hubWeekData=null;await refreshAfterPlanChange();
}
function installProposals(){
  $('proposeWeek').onclick=proposeWeek;
  $('hubWeek').addEventListener('click',async e=>{
    const b=e.target.closest('[data-proposal]');if(!b)return;e.stopPropagation();
    const key=b.dataset.date+'|'+(b.dataset.sport||'gym'),pr=state.proposals?.[key];
    if(b.dataset.proposal==='add'){if(!window.confirm('Přidat „'+pr.workout.name+'“ na '+longDate(b.dataset.date)+' do Intervals.icu?'))return;b.disabled=true;try{await scheduleProposal(key);toast(pr.workout.name+' je v Intervals.icu.');state.hubWeekData=null;await refreshAfterPlanChange();}catch(error){toast('Zápis selhal: '+error.message);b.disabled=false;}}
    if(b.dataset.proposal==='open'){activate('workouts');setWorkoutSport(b.dataset.sport);state.generated={...pr.result,existing:pr.existing};state.generatedVariant=0;$('generateDate').value=b.dataset.date;renderGeneratedWorkout(state.generated);$('generatedWorkout').scrollIntoView({behavior:'smooth',block:'start'});}
    if(b.dataset.proposal==='gym'){if(pr?.gymPreview)openGymPreview(b.dataset.date,pr);else openGymDay(b.dataset.date);}
  },true);
  // Gym: any day, not only today.
  const input=$('gymDate');input.value=gymDay();input.min=dateShift(pragueToday(),-30);
  input.onchange=()=>openGymDay(input.value,false);
  const previous=load;load=async()=>{await previous();if(gymDay()!==pragueToday())await loadGym().catch(()=>{});};
}
async function openGymDay(date,show=true){
  state.gymDate=date||pragueToday();$('gymDate').value=state.gymDate;
  if(show){activate('workouts');setWorkoutSport('gym');}
  try{await loadGym();}catch(error){toast(error.message);}
  renderGymPlanHint();
}
installProposals();
// Personal calorie target: everyday activity, sport (only without a connected
// source), weekly goal and target weight, stored with the rest of the profile.
// Without weight or a complete profile the server returns no target; say what
// is missing instead of showing 0 kcal.
const ENERGY_MISSING={weight:'váha',sex:'pohlaví',age:'datum narození',height:'výška',activity:'denní aktivita',goal:'cíl',sportHours:'sport za týden'};
function installEnergyProfile(){
  const form=$('fitnessProfileForm');if(!form)return;
  const select=(id,label,options)=>'<label>'+label+'<select class="food-input" id="'+id+'"><option value="">Vyber</option>'+options.map(([v,t])=>'<option value="'+v+'">'+esc(t)+'</option>').join('')+'</select></label>';
  form.querySelector('button.primary').insertAdjacentHTML('beforebegin',
    select('profileActivity','Pohyb přes den mimo trénink (práce, chůze, venčení psa)',[['sedentary','Sedavá práce, málo chůze'],['light','Lehce aktivní: hodně chůze, práce vestoje'],['active','Aktivní: většinu dne v pohybu'],['heavy','Fyzicky náročná práce']])+
    select('profileSportHours','Sport za týden (jen bez propojení Google/Intervals)',[['0','Žádný'],['1-3','1–3 hodiny'],['3-6','3–6 hodin'],['6-10','6–10 hodin'],['10+','Víc než 10 hodin']])+
    select('profileGoal','Cíl',[['lose_0.25','Hubnout 0,25 kg týdně'],['lose_0.5','Hubnout 0,5 kg týdně'],['lose_0.75','Hubnout 0,75 kg týdně'],['lose_1','Hubnout 1 kg týdně'],['maintain','Udržovat váhu']])+
    '<label>Cílová váha · kg<input id="profileTargetWeight" class="food-input" type="number" min="35" max="250" step="0.1"></label>');
  $('profileAge').parentElement.insertAdjacentHTML('beforebegin','<label>Datum narození<input id="profileBirthDate" class="food-input" type="date"></label>');
  // With a birth date the age is computed (and stays current); the age field shows it.
  const syncAge=()=>{const age=ageFromBirthDate($('profileBirthDate').value);$('profileAge').readOnly=age!=null;if(age!=null)$('profileAge').value=age;};
  $('profileBirthDate').addEventListener('input',syncAge);
  form.previousElementSibling.textContent='Profil se ukládá na server. Z pohlaví, věku, výšky, váhy a denní aktivity počítáme klidový výdej a z cíle denní kalorický cíl; trénink přidávají propojené zdroje. Váhu zapisuješ v přehledu váhy.';
  const fields=[['profileSex','sex'],['profileBirthDate','birthDate'],['profileAge','age'],['profileHeight','height'],['profileHrmax','hrmax'],['profileRhr','rhr'],['profileActivity','activity'],['profileSportHours','sportHours'],['profileGoal','goal'],['profileTargetWeight','targetWeight']];
  const fill=()=>{const p=savedProfile();for(const [id,key] of fields)if($(id))$(id).value=p[key]??'';syncAge();};
  fill();
  // The server profile wins, so the form is the same on every device.
  jsonFetch('/app/api/profile').then(r=>{
    if(r?.profile){const server=Object.fromEntries(Object.entries(r.profile).filter(([,v])=>v!==null&&v!==''));localStorage.setItem('fitnessProfile',JSON.stringify({...savedProfile(),...server}));fill();}
    // What the app works out itself stays automatic (it is refreshed daily) and
    // shows as the placeholder of an empty field; a typed value overrides it.
    const s=r?.suggestions||{};
    try{localStorage.setItem('fitnessProfileSuggested',JSON.stringify(s));}catch{}
    const auto=(id,value,text)=>{if(!value||!$(id))return;if($(id).tagName==='SELECT')$(id).options[0].textContent='Automaticky: '+text;else $(id).placeholder='Automaticky: '+text;};
    auto('profileHeight',s.height,s.height+' (Google Health)');
    auto('profileActivity',s.activity,({sedentary:'sedavý',light:'lehce aktivní',active:'aktivní',heavy:'velmi aktivní'}[s.activity]||s.activity)+' · '+Number(s.averageSteps).toLocaleString('cs-CZ')+' kroků/den');
    auto('profileRhr',s.rhr,s.rhr+' (průměr 30 dní)');
    auto('profileHrmax',s.hrmax,s.hrmax+' (max. z aktivit, 6 měs.)');
    // A date field has no placeholder: show the Google birth date under it.
    if(s.birthDate&&!$('profileBirthDate').value&&!$('profileBirthDateAuto')){const [y,m,d]=s.birthDate.split('-');$('profileBirthDate').insertAdjacentHTML('afterend','<small class="small" id="profileBirthDateAuto">Automaticky z Google účtu: '+Number(d)+'. '+Number(m)+'. '+y+'</small>');const age=ageFromBirthDate(s.birthDate);if(age!=null&&!$('profileAge').value)$('profileAge').placeholder='Automaticky: '+age;}
    if(!$('profileSuggestionNote'))form.insertAdjacentHTML('afterend','<p class="small" id="profileSuggestionNote">Prázdná pole s „Automaticky“ doplňujeme z Google Health a Intervals.icu a denně aktualizujeme. Vlastní hodnota je přepíše; smazáním se vrátíš k automatické. Pohlaví, datum narození a cíl je potřeba vyplnit; věk se z data narození počítá sám.</p>');
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
    box.querySelectorAll('[data-energy]').forEach(b=>b.onclick=()=>{if(b.dataset.energy==='weight')return openWeightSheet();activate('settings');$('fitnessProfileForm')?.scrollIntoView({behavior:'smooth'});});}
}
installEnergyProfile();
const renderNutritionWithoutNotice=renderNutrition;renderNutrition=function(){renderNutritionWithoutNotice();renderEnergyProfileNotice();};

// ---- Výživa like a food diary app: day overview with drinks, meals, quick logging ----
// Drinks of the shown day and the day's target, from /app/api/fluids.
const FLUID_KINDS=[['water','💧','Voda'],['coffee','☕','Káva'],['tea','🍵','Čaj'],['milk','🥛','Mléko'],['other','🧃','Jiné']];
function fluidLabel(ml){return ml>=1000?fmt(ml/1000,2).toString().replace('.',',')+' l':fmt(ml)+' ml';}
async function loadFluids(date=nutritionDay()){try{const r=await jsonFetch('/app/api/fluids?date='+date);state.fluids={...(state.fluids||{}),[date]:r};}catch{}renderDayOverview();if(date===selectedHistoryDate){renderDayTimeline();if($('today')?.classList.contains('active'))renderToday();}return state.fluids?.[date];}
async function addFluidDrink(date,ml,kind='water'){
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit'}).format(new Date());
  try{await jsonFetch('/app/api/fluids',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,ml,kind,at:date+'T'+(date===pragueToday()?now:'12:00')})});toast('💧 +'+fluidLabel(ml));await loadFluids(date);}catch(error){toast(error.message);}
}
function openFluidSheet(date=nutritionDay()){
  const f=state.fluids?.[date],entries=f?.entries||[];let kind='water';
  openSheet('Pití · '+(date===pragueToday()?'dnes':longDate(date)),'<p class="small">'+(f?fluidLabel(f.totalMl)+' z '+fluidLabel(f.target.ml):'Načítám…')+'</p><div class="fluid-kinds" role="group" aria-label="Nápoj">'+FLUID_KINDS.map(([k,i,l])=>'<button type="button" class="btn'+(k==='water'?' active':'')+'" data-kind="'+k+'">'+i+' '+l+'</button>').join('')+'</div><div class="fluid-amounts">'+[150,250,330,500,750].map(ml=>'<button type="button" class="btn" data-ml="'+ml+'">+'+ml+' ml</button>').join('')+'</div><div class="food-controls"><input id="fluidCustom" class="food-input" inputmode="numeric" placeholder="Jiné množství v ml"><button type="button" class="btn primary" id="fluidCustomAdd">Přidat</button></div>'+(entries.length?'<h3 style="margin:14px 0 6px">Zapsáno</h3>'+entries.slice().reverse().map(e=>e.kind==='food'?'<div class="fluid-row"><span>🍽 '+esc(String(e.consumedAt).slice(11,16))+' · '+esc(e.name)+'<small>z jídelníčku'+(e.alcohol?' · alkohol se do pití nepočítá':'')+'</small></span><strong>'+(e.alcohol?'0 ml':fluidLabel(e.ml))+'</strong><span></span></div>':'<div class="fluid-row"><span>'+(FLUID_KINDS.find(x=>x[0]===e.kind)?.[1]||'💧')+' '+esc(String(e.consumedAt).slice(11,16))+'</span><strong>'+fluidLabel(e.ml)+'</strong><button type="button" class="btn" data-delete-fluid="'+e.id+'" aria-label="Smazat">✕</button></div>').join(''):''),body=>{
    body.onclick=async e=>{const k=e.target.closest('[data-kind]');if(k){kind=k.dataset.kind;body.querySelectorAll('[data-kind]').forEach(b=>b.classList.toggle('active',b===k));return}
      const a=e.target.closest('[data-ml]');if(a){await addFluidDrink(date,Number(a.dataset.ml),kind);openFluidSheet(date);return}
      if(e.target.id==='fluidCustomAdd'){const ml=Number(String($('fluidCustom').value).replace(',','.'));if(!(ml>=10&&ml<=3000))return toast('Zadej 10–3000 ml.');await addFluidDrink(date,ml,kind);openFluidSheet(date);return}
      const d=e.target.closest('[data-delete-fluid]');if(d){try{await jsonFetch('/app/api/fluids?id='+d.dataset.deleteFluid,{method:'DELETE'});await loadFluids(date);openFluidSheet(date);}catch(error){toast(error.message);}}};
  });
}
// The day the food diary shows.
function nutritionDay(){return $('foodDate')?.value||selectedHistoryDate||pragueToday();}
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
  el.innerHTML='<div class="do-head"><h3>Denní přehled</h3><small>'+esc(date===pragueToday()?'dnes':longDate(date))+'</small></div>'+
    '<div class="do-ring-row"><div><b>'+fmt(eaten.kcal)+'</b><span>Snědeno</span></div><div class="do-ring" style="--p:'+p+'"><b>'+(target?fmt(Math.abs(left)):'—')+'</b><span>'+(target?left>=0?'Zbývá kcal':'Nad cílem':'Cíl chybí')+'</span></div><div><b>'+(burned?fmt(burned):'—')+'</b><span>Aktivní výdej '+(measured(n.energyBudget?.active)?'dne':'aktivit')+'</span><small class="do-burned-source">'+(measured(n.energyBudget?.active)?'Google · veškerý pohyb dne':'Souhrny zaznamenaných aktivit')+'</small></div></div>'+
    '<div class="do-macros">'+macro('Sacharidy',eaten.carbs_g,num(m.carbs_g??m.carbsGrams),'#ffb347')+macro('Bílkoviny',eaten.protein_g,num(m.protein_g??m.proteinGrams),'#6fb7ff')+macro('Tuky',eaten.fat_g,num(m.fat_g??m.fatGrams),'#b48cff')+'</div>'+
    hydrationOverviewHtml(date,f,water);
  installHydrationOverview(el,date);
}
function hydrationOverviewHtml(date,f,progress){
  const draft=(state.fluidDrafts||={})[date]||={kind:'water',custom:''},entries=(f?.entries||[]).slice().reverse().slice(0,3);
  return '<section class="do-water"><div class="do-water-head"><div><span class="hydration-eyebrow">Hydratace</span><h4>Pití</h4></div><div class="hydration-total"><strong>'+(f?fluidLabel(f.totalMl):'…')+'</strong><span>z '+(f?fluidLabel(f.target.ml):'…')+'</span></div></div><i class="do-water-bar"><b style="width:'+progress+'%"></b></i><div class="hydration-kinds" role="group" aria-label="Druh nápoje">'+FLUID_KINDS.map(([kind,icon,label])=>'<button type="button" data-water-kind="'+kind+'" class="hydration-kind'+(draft.kind===kind?' active':'')+'" aria-pressed="'+(draft.kind===kind)+'"><span aria-hidden="true">'+icon+'</span>'+label+'</button>').join('')+'</div><div class="do-water-actions">'+[150,250,330,500,750,1000].map(ml=>'<button type="button" class="btn" data-water="'+ml+'">+ '+(ml===1000?'1 l':ml+' ml')+'</button>').join('')+'</div><form class="hydration-custom" id="inlineFluidForm"><label class="sr-only" for="inlineFluidAmount">Vlastní množství nápoje v ml</label><div><input id="inlineFluidAmount" inputmode="decimal" type="text" placeholder="Vlastní množství" value="'+esc(draft.custom)+'"><span>ml</span></div><button type="submit" class="btn primary">Přidat</button></form>'+(entries.length?'<div class="hydration-recent"><div class="hydration-recent-head"><span>Poslední zápisy</span><button type="button" data-water-more>Všechny zápisy ↗</button></div>'+entries.map(entry=>{const kind=FLUID_KINDS.find(k=>k[0]===entry.kind)||['food','🍽',entry.name||'Nápoj'];return '<div class="hydration-entry"><span>'+kind[1]+'</span><div><strong>'+esc(entry.name||kind[2])+'</strong><small>'+esc(String(entry.consumedAt||'').slice(11,16))+(entry.kind==='food'?' · z jídelníčku':'')+'</small></div><b>'+fluidLabel(entry.ml)+'</b>'+(entry.kind!=='food'?'<button type="button" data-inline-delete-fluid="'+entry.id+'" aria-label="Smazat '+esc(kind[2])+' '+entry.ml+' ml">×</button>':'<span></span>')+'</div>';}).join('')+'</div>':'<button class="hydration-history-link" type="button" data-water-more>Historie pití ↗</button>')+'<p class="do-water-note">Počítáme vypitý objem včetně kávy, čaje a mléka. Nápoje z jídelníčku v ml se přičtou automaticky. <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3886980/" target="_blank" rel="noopener noreferrer">Proč ↗</a></p></section>';
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
    (isOpen?'<div class="ml-entries">'+(r.entries.length?r.entries.map(e=>'<div class="ml-entry"><span>'+esc(e.recipe_title||'Jídlo')+'<small>'+fmt(e.kcal)+' kcal · B '+fmt(e.protein_g)+' · S '+fmt(e.carbs_g)+' · T '+fmt(e.fat_g)+' g</small>'+foodAssessmentHtml(e)+foodExportHtml(e)+'</span>'+(e.id?'<button type="button" class="btn" data-meal-edit="'+esc(e.id)+'">Upravit</button>':'')+'</div>').join(''):'<p class="small">Zatím nic. Přidej jídlo tlačítkem +.</p>')+'</div>':'')+'</div>';}).join('')+
    '<div id="mealSettingsBox" hidden><p class="small">Která jídla během dne sleduješ:</p><div class="meal-preferences">'+mealSlots.map(s=>'<label><input type="checkbox" data-meal-pref="'+s.id+'" '+(mealEnabled.includes(s.id)?'checked':'')+'> '+s.name+'</label>').join('')+'</div></div>';
  el.onclick=e=>{
    const add=e.target.closest('[data-meal-add]');if(add){startMealLog(add.dataset.mealAdd);return}
    const retry=e.target.closest('[data-food-sync]');if(retry){retry.disabled=true;jsonFetch('/app/api/food/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(retry.dataset.foodSync)})}).then(()=>{toast('Zápis do Google zkouším znovu.');loadEnteredFood();}).catch(error=>{toast(error.message);retry.disabled=false;});return}const edit=e.target.closest('[data-meal-edit]');if(edit){openFoodManage(edit.dataset.mealEdit);return}
    const row=e.target.closest('[data-meal-toggle-row]');if(row){const id=row.dataset.mealToggleRow,s=new Set(state.openMeals||[]);s.has(id)?s.delete(id):s.add(id);state.openMeals=[...s];renderMealList();return}
    if(e.target.id==='mealSettings'){$('mealSettingsBox').hidden=!$('mealSettingsBox').hidden;}
  };
  el.querySelectorAll('[data-meal-pref]').forEach(input=>input.onchange=()=>{const selected=[...el.querySelectorAll('[data-meal-pref]:checked')].map(i=>i.dataset.mealPref);if(!selected.length){input.checked=true;return toast('Nech vybrané alespoň jedno jídlo.');}mealEnabled=selected;try{localStorage.setItem('pfd-meals-v1',JSON.stringify(selected));}catch{}renderMealDiary();});
}
// "+" on a meal: log into it.
function startMealLog(slot){openFoodLogger(slot);}
function setFoodMeal(slot){if(!$('foodMeal'))return;$('foodMeal').value=slot;document.querySelectorAll('[data-meal-chip]').forEach(b=>b.classList.toggle('active',b.dataset.mealChip===slot));const add=$('foodAddDirect');if(add)add.textContent='Přidat · '+(mealSlots.find(s=>s.id===slot)?.name||'jídlo');}
function mealByTime(){const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',hourCycle:'h23'}).format(new Date()));return h<10?'breakfast':h<12?'snack_am':h<15?'lunch':h<18?'snack_pm':'dinner';}

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
async function openBarcodeScanner(){
  openSheet('Skenovat čárový kód','<div class="scan-box"><video id="scanVideo" playsinline muted autoplay></video><div class="scan-frame"></div></div><p class="small" id="scanStatus">Spouštím kameru…</p><div class="food-controls"><input id="scanManual" class="food-input" inputmode="numeric" placeholder="Nebo opiš číslo EAN"><button type="button" class="btn" id="scanManualOk">OK</button></div><label class="btn sheet-wide scan-photo">📷 Vyfotit místo skenování<input hidden id="scanPhoto" type="file" accept="image/*" capture="environment"></label>',body=>{
    $('scanManualOk').onclick=()=>{const code=$('scanManual').value.replace(/\D/g,'');if(!/^\d{8,14}$/.test(code))return toast('EAN má 8–14 číslic.');barcodeFound(code);};
    $('scanPhoto').onchange=e=>{const file=e.target.files[0];closeSheet();openFoodLogger();readFoodPhoto(file,'barcode');};
  });
  const video=$('scanVideo'),status=$('scanStatus');
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Prohlížeč nemá přístup ke kameře.');
    if('BarcodeDetector'in window&&(await BarcodeDetector.getSupportedFormats?.().catch(()=>[]))?.includes?.('ean_13')){
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(!$('scanVideo')){stream.getTracks().forEach(t=>t.stop());return}video.srcObject=stream;await video.play().catch(()=>{});
      const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});let live=true;scanStop=()=>{live=false;stream.getTracks().forEach(t=>t.stop());};
      status.textContent='Namiř kameru na čárový kód.';
      const tick=async()=>{if(!live)return;try{const codes=await detector.detect(video);const code=codes.find(c=>/^\d{8,14}$/.test(c.rawValue))?.rawValue;if(code){barcodeFound(code);return}}catch{}setTimeout(tick,200);};tick();
    }else{
      status.textContent='Načítám čtečku…';
      const ZX=await loadFoodLibrary('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js','ZXingBrowser'),reader=new ZX.BrowserMultiFormatReader();
      if(!$('scanVideo'))return;
      const controls=await reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false},video,result=>{const code=result?.getText?.();if(code&&/^\d{8,14}$/.test(code))barcodeFound(code);});
      scanStop=()=>controls.stop();if(!$('scanVideo')){stopScanner();return}status.textContent='Namiř kameru na čárový kód.';
    }
  }catch(error){status.textContent=(error?.name==='NotAllowedError'?'Přístup ke kameře je zakázaný. Povol ho v nastavení prohlížeče, nebo kód vyfoť či opiš.':'Kameru se nepodařilo spustit: '+(error?.message||error))+'';}
}
function stopScanner(){try{scanStop?.();}catch{}scanStop=null;}
async function barcodeFound(code){
  stopScanner();navigator.vibrate?.(60);closeSheet();openFoodLogger();
  $('foodBarcode').value=code;$('foodQuery').value='';
  await searchFood();
}

function installNutritionHome(){
  const nutrition=$('nutrition');if(!nutrition||$('dayOverview'))return;
  nutrition.insertAdjacentHTML('afterbegin','<div class="nutrition-home"><article class="card day-overview" id="dayOverview"></article><article class="card meal-list" id="mealList"></article></div>');
  $('mealList').closest('.nutrition-home').after($('foodEntry'));
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
  openSheet('Revize · '+(date===pragueToday()?'dnes':longDate(date)),'<p class="small">Kouč kontroluje plán dne v kontextu týdne, formy, spánku a tvých hodnocení…</p>');
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
  const save=$('basketSave').onclick;$('basketSave').onclick=async()=>{const before=(mealEntries||[]).length,meal=mealSlots.find(s=>s.id===$('foodMeal').value)?.name||'jídla';await save();if((mealEntries||[]).length>before){closeFoodLogger();toast('Zapsáno do: '+meal);}};
  // "Co dál dnes?" takes the place of the energy-by-meal chart.
  const next=$('foodPlan')?.closest('.card'),chart=$('mealDistribution');if(next&&chart){chart.classList.add('replaced');chart.after(next);}
}
installFoodPanel();

// ---- Hodnocení: RPE and how it felt for any finished session ----
// A library workout scheduled that day gets the RPE (also to Intervals.icu)
// and the coach's note in the background; any other session goes straight to
// the coach with the same RPE and note.
function openRatingSheet({date=pragueToday(),name=null}={}){
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
          $('rateResult').innerHTML='<p class="small">✓ Uloženo'+(res.intervals?.status==='ok'?' i v Intervals.icu':'')+'. Kouč připravuje zpětnou vazbu, objeví se v timeline.</p>';awaitReflection(date);
        }else{
          const res=await jsonFetch('/app/api/coach/reflections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,rpe,notes:(pick?pick+': ':'')+notes})});
          state.reflections={...(state.reflections||{}),[date]:[res.reflection,...(state.reflections?.[date]||[])]};renderDayTimeline();
          $('rateResult').innerHTML='<div class="coach-note"><small>💬 Kouč</small><p>'+esc(res.reflection.text)+'</p></div>';
        }
        btn.textContent='✓ Uloženo';
      }catch(error){toast(error.message);btn.disabled=false;btn.textContent='Uložit hodnocení';}
    };
  });
}
// ---- Zdraví: the tiles that matter. Sleep and weight as in Dnes, sleep debt
// and VO₂ max instead of the averages; the long-term card is gone. ----
const SLEEP_NEED_MIN=480;
function sleepDebt(sessions,date){
  const nights=sessions.filter(s=>{const d=s.date||String(s.endTime||'').slice(0,10);return d<=date&&d>=dateShift(date,-6);});
  if(!nights.length)return null;
  const net=nights.reduce((s,n)=>s+SLEEP_NEED_MIN-num(n.durationMin),0);
  return {minutes:Math.max(0,Math.round(net)),nights:nights.length,average:nights.reduce((s,n)=>s+num(n.durationMin),0)/nights.length};
}
function healthTile(label,value,meta,tone=''){return '<div class="metric-tile'+(tone?' tone-'+tone:'')+'"><div class="label">'+label+'</div><div class="metric-number">'+value+'</div><div class="small">'+meta+'</div></div>';}
function renderHealthTiles(){
  const recovery=$('recovery');if(!recovery)return;
  let box=$('healthTiles');
  if(!box){box=document.createElement('div');box.id='healthTiles';box.className='recovery-metrics health-tiles';const old=recovery.querySelector('.recovery-metrics');if(old){old.before(box);old.hidden=true;}else recovery.querySelector('.recovery-command')?.after(box);}
  const date=selectedHistoryDate,sessions=primarySleepSessions(state.sleep?.sessions).map(s=>({...s,date:s.date||String(s.endTime||'').slice(0,10)})).filter(s=>s.date<=date),last=sessions[0];
  const older=sessions.filter(s=>last&&s.date<last.date&&s.date>=dateShift(last.date,-30)),mean=older.length?older.reduce((s,r)=>s+num(r.durationMin),0)/older.length:null,score=sleepIndex(last);
  const sleepDelta=last&&mean!=null?Math.round(last.durationMin-mean):null;
  const sleep=healthTile('Spánek',last?hm(last.durationMin):'—',last?'Noc '+esc(dateLabel(last.date))+(score!=null?' · skóre '+score+'/100':'')+(sleepDelta!=null?' '+deltaBadge(sleepDelta,'min',1,15):''):'Bez záznamu');
  const debt=sleepDebt(sessions,date);
  const debtTile=healthTile('Spánkový dluh',debt?(debt.minutes?hm(debt.minutes):'0 h'):'—',debt?'7 nocí vs. potřeba 8 h · Ø '+hm(debt.average)+(debt.nights<7?' · změřeno '+debt.nights+'/7':''):'Chybí noci za posledních 7 dní',debt?(debt.minutes<120?'good':debt.minutes<300?'warn':'bad'):'');
  const vo2=latestVo2(),prev=vo2?googleWellness().concat(state.fitness?.wellness||[]).filter(r=>r.id<=dateShift(vo2.date,-28)&&measured(r.vo2max??r.vo2Max)).sort((a,b)=>a.id.localeCompare(b.id)).at(-1):null,vo2Delta=prev?Number(vo2.value)-Number(prev.vo2max??prev.vo2Max):null;
  const vo2Tile=healthTile('VO₂ max',vo2&&measured(vo2.value)?fmt(vo2.value,1)+' <small>ml/kg/min</small>':'—',vo2?esc(vo2.source||'')+' · '+esc(dateLabel(vo2.date))+(vo2Delta!=null?' '+deltaBadge(vo2Delta,'',1,0.5,1):''):'Bez měření z hodinek');
  const w=state.weight||{},hist=(w.records||[]).filter(x=>num(x.value_numeric)>0&&/^\d{4}-\d{2}-\d{2}/.test(String(x.sample_time||''))&&String(x.sample_time).slice(0,10)<=date).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time))),lastW=hist.at(-1);
  const mean30=(()=>{const xs=hist.filter(x=>String(x.sample_time).slice(0,10)>=dateShift(date,-29)).map(x=>num(x.value_numeric));return xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;})();
  const targetW=num(state.daily?.nutrition?.targetWeightKg)||null,lw=lastW?num(lastW.value_numeric):null;
  const weightTile=healthTile('Hmotnost',lw?fmt(lw,1)+' <small>kg</small>':'—',lw?(mean30!=null?'30 dní Ø '+fmt(mean30,1)+' kg '+deltaBadge(lw-mean30,'kg',targetW&&targetW<lw?-1:targetW&&targetW>lw?1:0,0.3,1):'')+(targetW?' · cíl '+fmt(targetW,1)+' kg':''):'Bez vážení');
  box.innerHTML=sleep+debtTile+vo2Tile+weightTile;
  const hs=$('healthspan');if(hs){hs.hidden=true;const head=hs.previousElementSibling;if(head?.classList.contains('section'))head.hidden=true;}
}
// A coloured change: dir 1 = higher is better, -1 = lower is better, 0 = neutral.
function deltaBadge(delta,unit,dir,flat,decimals=0){
  if(delta==null||!Number.isFinite(delta))return '';
  const tone=Math.abs(delta)<flat||!dir?'flat':(delta>0)===(dir>0)?'good':'bad';
  return '<span class="delta-badge '+tone+'">'+(delta>0?'▲ +':delta<0?'▼ −':'')+fmt(Math.abs(delta),decimals)+(unit?' '+unit:'')+'</span>';
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
  profileCard.insertAdjacentHTML('beforebegin','<article class="card" id="sportFocusCard" style="margin-top:16px"><h3>Hlavní sport a cíl</h3><p class="small">Podle toho kouč, Revize dne a poznámky k tréninku volí roli i směr. Bez vyplnění zůstává obecný trenér vytrvalosti a síly.</p><form id="sportFocusForm" class="food-editor-grid">'+
    '<label>Hlavní sport<select class="food-input" id="focusSport"><option value="">Nevybráno</option>'+MAIN_SPORT_OPTIONS.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select></label>'+
    '<label>Čas na trénink · h týdně<input id="focusHours" class="food-input" type="number" min="1" max="40" step="0.5" placeholder="např. 8"></label>'+
    '<label class="wide">Cíl<input id="focusGoal" class="food-input" maxlength="300" placeholder="např. FTP 300 W, maraton pod 3:30, udržet kondici"></label>'+
    '<label>Hlavní závod<input id="focusEvent" class="food-input" maxlength="120" placeholder="např. L’Etape Czech Republic"></label>'+
    '<label>Datum závodu<input id="focusEventDate" class="food-input" type="date"></label>'+
    '<button class="btn primary" type="submit">Uložit sport a cíl</button><p class="small" id="focusStatus"></p></form></article>');
  const fields=[['focusSport','mainSport'],['focusHours','weeklyHours'],['focusGoal','sportGoal'],['focusEvent','eventName'],['focusEventDate','eventDate']];
  const fill=()=>{const p=savedProfile();for(const [id,key] of fields)if(document.activeElement!==$(id))$(id).value=p[key]??'';$('focusStatus').textContent=focusSummary(p);};
  fill();
  $('sportFocusForm').onsubmit=async e=>{
    e.preventDefault();const next={...savedProfile()};for(const [id,key] of fields)next[key]=$(id).value.trim();
    localStorage.setItem('fitnessProfile',JSON.stringify(next));
    try{const r=await jsonFetch('/app/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});if(r?.profile)localStorage.setItem('fitnessProfile',JSON.stringify({...next,...r.profile}));fill();toast('Sport a cíl uloženy.');try{renderToday();}catch{}}
    catch(error){toast('Neuložilo se: '+error.message);}
  };
  const wasActivate=activate;activate=function(id){wasActivate(id);if(id==='settings')fill();};
}
function focusSummary(p){
  const sport=MAIN_SPORT_OPTIONS.find(([v])=>v===p.mainSport)?.[1],days=p.eventDate?Math.round((Date.parse(p.eventDate+'T12:00:00Z')-Date.parse(pragueToday()+'T12:00:00Z'))/864e5):null;
  return [sport,p.weeklyHours?p.weeklyHours+' h/týden':'',p.eventDate&&days>=0?(p.eventName||'Závod')+' za '+days+' dní':''].filter(Boolean).join(' · ');
}
installSportFocus();

// Availability, week exceptions and the persistent personal coach.
const STATUS_LABELS={active:'Active',sick:'Sick',injured:'Injured',on_break:'On break'};
const STATUS_DESCRIPTIONS={active:'Připravený na pohyb a trénink',sick:'Odpočinek během nemoci',injured:'Prostor pro zotavení ze zranění',on_break:'Čas na pauzu a regeneraci'};
function statusIcon(status){
  const paths={active:'<circle cx="15" cy="5.5" r="2.5" fill="currentColor" stroke="none"/><path d="m10 11 4-3 4 4 4 1M14 9l-3 8-5 3m5-3 5 3-1 5M9 11l-4 5"/>',sick:'<path d="M4 7v17m0-5h22v5m0-5v-5a3 3 0 0 0-3-3H13v8M4 11h5v5H4"/><path d="M17 5h6m-3-3v6"/>',injured:'<g transform="rotate(-42 15 15)"><rect x="8" y="3" width="14" height="24" rx="6"/><rect x="10.5" y="10" width="9" height="10" rx="2"/><path d="M12 6h.01M18 6h.01M12 24h.01M18 24h.01M13 13h.01M17 17h.01"/></g>',on_break:'<path d="M15 10c-5-5-10-3-11 0 5-1 8 0 11 3m0-3c4-5 9-3 11 0-5-1-8 0-11 3m0-3c0-5 3-7 6-6-2 2-3 4-6 6m0 3-2 12m-6 1h15"/>'};
  return '<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[status]||paths.active)+'</svg>';
}
function renderAthleteStatus(){
  const head=document.querySelector('#today .today-head');if(!head)return;
  $('athleteStatusBox')?.remove();
  const s=state.athleteState||{status:'active'},a=state.coachAdvice;
  head.insertAdjacentHTML('beforeend','<div id="athleteStatusBox"><button type="button" class="athlete-status status-'+esc(s.status)+'" id="changeAthleteStatus"><span class="status-orb">'+statusIcon(s.status)+'</span><span class="status-current-copy"><strong>'+esc(STATUS_LABELS[s.status]||'Active')+'</strong><small>'+esc(statusValidityLabel(s)+(s.note?' · '+s.note:''))+'</small></span><svg class="status-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button></div>');
  $('changeAthleteStatus').onclick=openAthleteStatus;
  $('athleteStatusNotice')?.remove();
  if(statusPausesTraining())head.insertAdjacentHTML('beforeend','<div class="notice" id="athleteStatusNotice" role="status"><strong>'+esc(STATUS_LABELS[s.status])+' · tréninky pozastavené</strong><p>'+esc(s.status==='injured'?'Kouč zohlední tvoje omezení. Před návrhem náhradního sportu je potřeba je upřesnit.':'Kouč nyní doporučuje odpočinek a respektuje tvoji pauzu.')+' '+(s.statusUntil?'Od '+dateLabel(s.statusUntil)+' se stav vrátí na Active.':'Běžná doporučení obnovíš přepnutím na Active.')+'</p><small>Plán v kalendáři zůstává uložený.</small></div>');
  $('coachAdviceCard')?.remove();
  if(a){$('assistantConversation').insertAdjacentHTML('beforebegin','<div class="notice coach-advice" id="coachAdviceCard"><strong>'+esc(a.headline)+'</strong><p>'+esc(a.message)+'</p><div class="select-row"><button class="btn primary" type="button" id="adviceAccept">Změnit na On break</button><button class="btn" type="button" id="adviceDiscuss">Probrat kompromis</button><button class="btn" type="button" id="adviceDecline">Teď ne</button></div></div>');
    $('adviceAccept').onclick=()=>saveAthleteStatus('on_break','Pauza podle doporučení regenerace');
    $('adviceDiscuss').onclick=()=>openFloatingAssistant('Vidíš slabší regeneraci: '+a.reasons.join(' ')+' '+a.message+' Najdeme kompromis místo úplné pauzy?');
    $('adviceDecline').onclick=async()=>{await athleteStatePost({dismiss:a.id});state.coachAdvice=null;renderAthleteStatus();};
  }
  const fab=$('floatingAssistant');if(fab){fab.textContent=a?'✦ Asistent · návrh':'✦ Asistent';fab.classList.toggle('has-advice',!!a);}
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
function statusValidityLabel(s){return s.statusUntil?'Platí do '+dateLabel(dateShift(s.statusUntil,-1)):'Platí do další změny';}
function openAthleteStatus(){
  const s=state.athleteState||{status:'active',note:''};
  openSheet('Aktuální stav','<form id="athleteStatusForm"><p class="status-intro">Jak se právě cítíš? Přizpůsobíme tomu nové návrhy tréninků.</p><div class="status-choices">'+Object.entries(STATUS_LABELS).map(([value,label])=>'<label class="status-choice status-'+value+'"><input type="radio" name="status" value="'+value+'"'+(s.status===value?' checked':'')+'><span class="status-orb">'+statusIcon(value)+'</span><span class="status-choice-copy"><strong>'+label+'</strong><small>'+STATUS_DESCRIPTIONS[value]+'</small></span><span class="status-radio" aria-hidden="true"></span></label>').join('')+'</div><div class="status-duration"><label for="athleteStatusDuration">◷ Platnost stavu</label><select id="athleteStatusDuration"><option value="indefinite">Do další změny</option><option value="tomorrow">Do zítřka</option><option value="7">Na 7 dní</option><option value="14">Na 14 dní</option><option value="custom">Vlastní datum</option></select><label id="athleteStatusCustomWrap" hidden>Poslední den stavu<input id="athleteStatusUntil" type="date" min="'+pragueToday()+'" value="'+(s.statusUntil?dateShift(s.statusUntil,-1):dateShift(pragueToday(),6))+'"></label><small id="athleteStatusExpiryHint"></small></div><details class="status-note"><summary>Přidat poznámku nebo omezení</summary><label class="sr-only" for="athleteStatusNote">Poznámka nebo omezení</label><textarea id="athleteStatusNote" maxlength="500" placeholder="Například: citlivé koleno, vynechat běh…">'+esc(s.note||'')+'</textarea></details><div class="control-sheet-footer"><button class="btn primary status-save" type="submit">Uložit stav</button></div></form>',body=>{
    if(s.note)body.querySelector('details').open=true;
    const duration=$('athleteStatusDuration'),custom=$('athleteStatusUntil'),hint=$('athleteStatusExpiryHint');
    if(s.statusUntil)duration.value='custom';
    const until=()=>duration.value==='indefinite'?null:duration.value==='custom'?dateShift(custom.value,1):dateShift(pragueToday(),duration.value==='tomorrow'?1:Number(duration.value));
    const update=()=>{const active=body.querySelector('[name=status]:checked').value==='active';duration.disabled=active;$('athleteStatusCustomWrap').hidden=active||duration.value!=='custom';custom.required=!active&&duration.value==='custom';hint.textContent=active?'Active platí, dokud si nevybereš jiný stav.':duration.value==='indefinite'?'Zpět na Active přepneš sám.':'Od '+dateLabel(until())+' se stav automaticky vrátí na Active.';};
    duration.onchange=update;custom.oninput=()=>{if(custom.value)update();};body.querySelectorAll('[name=status]').forEach(input=>input.onchange=update);update();
    body.querySelector('form').onsubmit=e=>{e.preventDefault();const status=body.querySelector('[name=status]:checked').value;saveAthleteStatus(status,$('athleteStatusNote').value,status==='active'?null:until());};
  },'status-sheet');
}
async function openFloatingAssistant(message=''){
  if(!$('assistantDialog').open)$('assistantDialog').show();
  $('floatingAssistant')?.classList.add('is-open');
  if(message)setAssistantDraft(message);
  const turns=state.athleteState?.conversation||[];
  if(turns.length&&!$('assistantConversation').children.length)$('assistantConversation').innerHTML=turns.map(t=>coachTurnHtml(t.role,t.content)).join('');
  else if(!$('assistantConversation').children.length)$('assistantConversation').innerHTML='<div class="assistant-welcome"><span>✦</span><strong>Co dnes upravíme?</strong>Projdeme plán, regeneraci nebo výživu.<br>Návrhy můžeš potvrdit, odmítnout i probrat.</div>';
  $('assistantMessage').focus();
  updateAssistantComposer();
  positionAssistantInViewport();
  try{await loadInbox();renderCoachActionCards((state.inbox||[]).filter(x=>x.status==='draft'&&x.draft?.kind==='coach_action').map(x=>({...x.draft.action,draftId:x.id})));}catch{}
  scrollAssistant();
}
function coachRichText(value){
  const inline=s=>esc(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  let out='',paragraph=[],list=null;
  const flush=()=>{if(paragraph.length){out+='<p>'+inline(paragraph.join(' '))+'</p>';paragraph=[];}if(list){out+='</'+list+'>';list=null;}};
  for(const raw of String(value||'').split(/\r?\n/)){const line=raw.trim(),heading=line.match(/^#{1,6}\s+(.+)/),item=line.match(/^(?:[-*]|(\d+)[.)])\s+(.+)/);if(!line){flush();continue;}if(heading){flush();out+='<h4>'+inline(heading[1])+'</h4>';}else if(item){if(paragraph.length){out+='<p>'+inline(paragraph.join(' '))+'</p>';paragraph=[];}const kind=item[1]?'ol':'ul';if(list!==kind){if(list)out+='</'+list+'>';out+='<'+kind+'>';list=kind;}out+='<li>'+inline(item[2])+'</li>';}else{if(list){out+='</'+list+'>';list=null;}paragraph.push(line);}}
  flush();return out;
}
function coachTurnHtml(role,content){return '<div class="coach-turn '+(role==='user'?'user':'assistant')+'"><strong>'+esc(role==='user'?'Ty':'Asistent')+'</strong><div class="coach-message">'+coachRichText(content)+'</div></div>';}
function appendCoachTurn(role,content){$('assistantConversation').querySelector('.assistant-welcome')?.remove();$('assistantConversation').insertAdjacentHTML('beforeend',coachTurnHtml(role,content));scrollAssistant();}
function scrollAssistant(){const el=$('assistantScroll');if(el)el.scrollTop=el.scrollHeight;}
let assistantBusy=false;
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
async function fetchAssistantReply(message,onAnswer){
  const response=await fetch('/app/api/assistant',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,stream:true})});
  if(response.status===401)showLoginGate();
  if(!response.headers.get('Content-Type')?.includes('application/x-ndjson')){const result=await response.json();if(!response.ok)throw new Error(result.message||'Odpověď se nepodařilo načíst.');return result;}
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;
  const receive=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='answer')onAnswer(event.answer);if(event.type==='done')result=event.result;if(event.type==='error')throw new Error(event.message);};
  try{
    while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let index;while((index=buffer.indexOf('\n'))>=0){receive(buffer.slice(0,index));buffer=buffer.slice(index+1);}if(done)break;}
    if(buffer.trim())receive(buffer);if(!result)throw new Error('Spojení se přerušilo. Zkus to znovu.');return result;
  }finally{reader.releaseLock();}
}
async function sendAssistantMessage(message,{retry=false}={}){
  if(assistantBusy||!message.trim())return;
  assistantBusy=true;const revision=statusCoachingRevision;
  if(!retry){appendCoachTurn('user',message);rememberCoachTurn('user',message);}
  if(!retry)setAssistantDraft('');else updateAssistantComposer();
  $('assistantConversation').insertAdjacentHTML('beforeend','<div class="assistant-typing" id="assistantTyping" role="status" aria-label="Asistent připravuje odpověď"><span></span><span></span><span></span><small>Asistent odpovídá</small></div>');
  $('assistantStatus').textContent='Zpráva odeslána';scrollAssistant();
  let streamedTurn=null;
  try{
    const r=await fetchAssistantReply(message,answer=>{
      if(revision!==statusCoachingRevision)return;
      $('assistantTyping')?.remove();
      if(!streamedTurn){appendCoachTurn('assistant','');streamedTurn=$('assistantConversation').lastElementChild;streamedTurn.classList.add('streaming');}
      streamedTurn.querySelector('.coach-message').innerHTML=coachRichText(answer);scrollAssistant();
    });
    $('assistantTyping')?.remove();
    if(revision!==statusCoachingRevision){streamedTurn?.remove();appendCoachTurn('assistant','Stav se mezitím změnil. Pošli požadavek znovu pro aktuální doporučení.');return;}
    if(r.kind==='food_draft'){renderFoodDraft(message,r);scrollAssistant();return;}
    if(streamedTurn){streamedTurn.querySelector('.coach-message').innerHTML=coachRichText(r.answer);streamedTurn.classList.remove('streaming');scrollAssistant();}else appendCoachTurn('assistant',r.answer);rememberCoachTurn('assistant',r.answer);
    if(r.actions?.length)renderCoachActionCards(r.actions);
    $('assistantStatus').textContent=r.memorySaved?'Preference uložena. Najdeš ji v Nastavení.':'Změny potvrdíš až v návrhu.';
    if(r.memorySaved){state.athleteState.memories=[...new Set([...(state.athleteState.memories||[]),r.memorySaved])];renderCoachMemories();}
  }catch(error){
    $('assistantTyping')?.remove();
    if(streamedTurn){streamedTurn.classList.remove('streaming');streamedTurn.querySelector('strong').textContent='Asistent · nedokončená odpověď';}
    const notice=document.createElement('div');notice.className='assistant-retry';notice.setAttribute('role','alert');
    const copy=document.createElement('p');copy.textContent=error.message;notice.append(copy);
    const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Zkusit znovu';
    button.onclick=()=>{if(assistantBusy)return;notice.remove();streamedTurn?.remove();sendAssistantMessage(message,{retry:true});};notice.append(button);
    $('assistantConversation').append(notice);$('assistantStatus').textContent='Zprávu se nepodařilo vyřídit.';scrollAssistant();
  }finally{assistantBusy=false;updateAssistantComposer();}
}
function renderCoachActionCards(actions=[]){
  let el=$('coachActionCards');if(!el){$('assistantConversation').insertAdjacentHTML('afterend','<div id="coachActionCards"></div>');el=$('coachActionCards');}
  const label=a=>a.type==='gym_swap'?'Vyměnit '+a.fromExercise+' → '+a.toExercise+' · '+a.sets+' × '+a.reps+(a.kg==null?' · zátěž doplníš':(' · '+a.kg+' kg')):a.type==='status'?'Změnit stav na '+STATUS_LABELS[a.status]:a.type==='move'?'Přesunout '+(a.eventSnapshot?.name||'trénink')+' na '+longDate(a.date):a.type==='rest'?'Odstranit '+(a.eventSnapshot?.name||'trénink')+' · '+longDate(a.date):'Připravit '+HUB_SPORTS[a.sport]+' · '+longDate(a.date)+' · '+hm(a.minutes);
  el.innerHTML=actions.map((a,i)=>'<div class="notice coach-action"><strong>'+esc(label(a))+'</strong><p>'+esc(a.reason)+'</p><div class="select-row"><button class="btn primary" data-coach-action="'+i+'" data-decision="confirm">'+(a.type==='rest'?'Potvrdit odstranění':'Potvrdit')+'</button><button class="btn" data-coach-action="'+i+'" data-decision="reject">Odmítnout</button><button class="btn" data-coach-feedback="'+i+'">Navrhnout kompromis</button></div></div>').join('');
  el.querySelectorAll('[data-coach-feedback]').forEach(b=>b.onclick=()=>{setAssistantDraft('K návrhu „'+label(actions[Number(b.dataset.coachFeedback)])+'“ mám zpětnou vazbu: ');$('assistantMessage').focus();});
  el.querySelectorAll('[data-coach-action]').forEach(b=>b.onclick=async()=>{const a=actions[Number(b.dataset.coachAction)];b.disabled=true;try{const r=await jsonFetch('/app/api/assistant/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draftId:a.draftId,decision:b.dataset.decision})});b.closest('.coach-action').innerHTML='<p>'+esc(r.message)+'</p>';if(b.dataset.decision==='confirm'){
      if(a.type==='status'){state.athleteState=r.result;state.coachAdvice=null;renderAthleteStatus();await refreshStatusCoaching();}
      else if(a.type==='gym_swap'){if(gymDay()===a.date){state.gym={...state.gym,...r.result};renderGym();}scheduleCoachRefresh();}
      else if(a.type==='workout'&&r.result){$('assistantDialog').close();if(a.sport==='gym')openGymPreview(a.date,{gymPreview:r.result});else{activate('workouts');setWorkoutSport(a.sport);state.generated=r.result;$('generateDate').value=a.date;renderGeneratedWorkout(r.result);$('generatedWorkout').scrollIntoView({behavior:'smooth'});}}
      else{state.hubWeekData=null;await refreshAfterPlanChange();}
    }}catch(error){$('assistantStatus').textContent=error.message;b.disabled=false;}});
}
function availabilityTime(minutes){return minutes==null?'Neurčeno':minutes===0?'Bez sportu':(Math.floor(minutes/60)?Math.floor(minutes/60)+' h':'')+(minutes%60?' '+minutes%60+' min':'');}
function availabilityEditorHtml(prefs,historyEstimate){
  return '<div class="availability-intro"><span class="availability-eyebrow">Časová dostupnost</span><p>Kolik času můžeš každý den věnovat sportu?</p><div class="availability-total"><strong id="availabilityTotal"></strong><span>za týden</span></div></div><div class="availability-grid">'+['Pondělí','Úterý','Středa','Čtvrtek','Pátek','Sobota','Neděle'].map((label,i)=>{const a=prefs.availability?.[i]||{},m=a.minutes;return '<div class="availability-row" data-availability-day="'+i+'" data-specified="'+(m==null?'false':'true')+'"><div class="availability-day-head"><label for="availabilitySlider'+i+'">'+label+'</label><button class="availability-duration" type="button" data-edit-duration aria-expanded="false"><span data-time-label>'+availabilityTime(m)+'</span><span aria-hidden="true">⌄</span></button></div><input id="availabilitySlider'+i+'" data-minutes type="range" min="0" max="'+Math.max(360,Math.ceil((m||0)/60)*60)+'" step="'+(m!=null&&m%15?'1':'15')+'" value="'+(m||0)+'" aria-label="Čas pro sport · '+label+'"><div class="availability-exact" hidden><label>Hodiny<input data-hours type="number" min="0" max="24" step="1" value="'+Math.floor((m||0)/60)+'"></label><label>Minuty<input data-edit-minutes type="number" min="0" max="59" step="1" value="'+((m||0)%60)+'"></label><button type="button" class="btn" data-set-duration>Nastavit</button></div></div>';}).join('')+'</div><section class="availability-frequency"><div class="availability-frequency-head"><label for="availabilityCount">Aktivit za týden</label><div class="availability-frequency-controls"><input id="availabilityCount" type="number" min="0" max="14" step="1" aria-label="Počet aktivit za týden" value="'+(prefs.weeklyActivities??historyEstimate?.count??3)+'"'+(prefs.weeklyActivities==null?' disabled':' required')+'><label class="history-toggle"><input id="availabilityByHistory" type="checkbox"'+(prefs.weeklyActivities==null?' checked':'')+'> <span>Podle historie</span></label></div></div><p id="availabilityHistoryNote" class="availability-history-note" data-history-message="'+esc(historyEstimate?.message||'Historie zatím není dostupná. Do jejího načtení použijeme nejvýše 3 aktivity týdně podle dostupného času.')+'"></p></section>';
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
  return {...prefs,weeklyActivities:$('availabilityByHistory').checked?null:Number($('availabilityCount').value),availability:[...root.querySelectorAll('[data-availability-day]')].map(row=>({window:'',minutes:row.dataset.specified==='true'?Number(row.querySelector('[data-minutes]').value):null,preferredSports:[]}))};
}
async function openAvailabilityEditor(scope){
  try{
    const weekly=scope==='week',start=state.hubWeek||pragueMonday(),data=weekly?await loadWeekPlan(true):await jsonFetch('/app/api/week-plan');
    openSheet('Časové možnosti','<form id="availabilityForm"><div class="availability-scope">'+(weekly?dateLabel(start)+' – '+dateLabel(dateShift(start,6)):'Běžný týden')+'</div>'+availabilityEditorHtml(data.prefs,data.historyEstimate)+'<div class="control-sheet-footer"><p class="small">'+(weekly?'Platí jen pro vybraný týden.':'Základ pro týdny bez vlastní výjimky.')+'</p><div id="availabilityError" class="small" role="status"></div><button class="btn primary availability-save" type="submit">Uložit</button>'+(weekly&&data.prefs.source==='week'?' <button class="btn availability-reset" type="button" id="resetAvailabilityWeek">Vrátit běžný týden</button>':'')+'</div></form>',body=>{
      installAvailabilityControls(body);
      body.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=body.querySelector('[type=submit]');b.disabled=true;try{await jsonFetch('/app/api/week-plan'+(weekly?'?start='+start:''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(readAvailabilityEditor(body,data.prefs))});closeSheet();await loadWeekPlan(true);renderWeekHub();renderAvailabilitySummary();toast('Časové možnosti uloženy.');}catch(error){$('availabilityError').textContent=error.message;b.disabled=false;}};
      if($('resetAvailabilityWeek'))$('resetAvailabilityWeek').onclick=async()=>{try{await jsonFetch('/app/api/week-plan?start='+start,{method:'DELETE'});closeSheet();await loadWeekPlan(true);renderWeekHub();toast('Používám běžný týden.');}catch(error){$('availabilityError').textContent=error.message}};
    },'availability-sheet');
  }catch(error){toast(error.message);}
}
async function renderAvailabilitySummary(){
  const el=$('availabilitySummary');if(!el)return;
  try{const {prefs}=await jsonFetch('/app/api/week-plan');const specified=prefs.availability?.filter(a=>a.minutes!=null)||[];el.textContent=specified.length?specified.length+' dní s nastavenou dostupností · '+fmt(specified.reduce((s,a)=>s+a.minutes,0)/60,1)+' h/týden'+(prefs.weeklyActivities!=null?' · '+prefs.weeklyActivities+' aktivit':' · počet podle historie'):'Nastav běžný týden, aby asistent věděl, kdy máš čas.';}catch(error){el.textContent=error.message;}
}
async function showAdaptiveWeekProposal(){
  const b=$('proposeWeek'),revision=statusCoachingRevision;
  b.disabled=true;$('plannerStatus').textContent='Kontroluji budoucí tréninky…';
  try{
    await openFloatingAssistant();
    const start=state.hubWeek||pragueMonday();
    appendCoachTurn('user','Navrhnout tréninky · týden '+dateLabel(start)+'–'+dateLabel(dateShift(start,6)));
    $('assistantStatus').textContent='Kontroluji budoucí plán, poslední zátěž a regeneraci…';
    const r=await jsonFetch('/app/api/coach/week',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start})});
    if(revision!==statusCoachingRevision)return;
    appendCoachTurn('assistant',r.review?.answer||'Plán jsem zkontroloval podle dostupných dat.');
    renderCoachActionCards(r.actions||r.review?.actions||[]);
    renderAssistantWeekProposal(r);
    $('assistantStatus').textContent=(r.review?.source==='rules'?'Revize podle pravidel · ':'')+'Zkontrolováno '+(r.reviewedCount??0)+' budoucích tréninků · změny čekají na potvrzení.';
    $('plannerStatus').textContent='Revize hotová · návrhy v asistentovi';
    state.athleteState=(await jsonFetch('/app/api/athlete-state')).state;
    scrollAssistant();
  }catch(error){$('plannerStatus').textContent=error.message;$('assistantStatus').textContent=error.message;}finally{b.disabled=false;}
}
function renderAssistantWeekProposal(r){
  const el=$('weekProposalCards'),p=r.proposal||{},items=p.items||[],paused=statusPausesTraining();
  el.innerHTML=(p.warnings||[]).map(w=>'<p class="small">'+esc((w.date?dateLabel(w.date)+' · ':'')+w.text)+'</p>').join('')+
    (p.missingAvailability?'<p class="small">Pro nový plán nastav časové možnosti.</p><button class="btn" id="proposalAvailability">Nastavit dostupnost</button>':'')+
    (items.length?'<h4>Nové aktivity · '+dateLabel(r.start)+'</h4><div class="week-proposal-list">'+items.map(x=>'<div><strong>'+esc(longDate(x.date))+'</strong><span>'+esc(HUB_SPORTS[x.sport])+' · '+hm(x.minutes)+' · '+(x.environment==='indoor'?'indoor':'outdoor')+'</span><small>'+esc(x.reason||x.label||'')+'</small></div>').join('')+'</div>':'')+
    '<div class="assistant-week-tools">'+(items.length&&!paused?'<button class="btn primary" id="confirmWeekProposal">Připravit tyto tréninky</button>':'')+(!paused?'<button class="btn" id="detailExistingWeek">Rozpracovat plánované</button>':'')+'<button class="btn" id="discussWeekProposal">Probrat kompromis</button></div>';
  if($('proposalAvailability'))$('proposalAvailability').onclick=()=>openAvailabilityEditor('week');
  if($('confirmWeekProposal'))$('confirmWeekProposal').onclick=async()=>{const button=$('confirmWeekProposal');button.disabled=true;try{state.weekPlan=await jsonFetch('/app/api/week-plan?start='+r.start,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p.prefs)});await generateWeekProposals(items);appendCoachTurn('assistant','Konkrétní návrhy jsou připravené v plánu týdne. Před zápisem do kalendáře je můžeš zkontrolovat.');}catch(error){$('assistantStatus').textContent=error.message;button.disabled=false;}};
  $('discussWeekProposal').onclick=()=>{setAssistantDraft('K návrhu pro týden '+r.start+' chci kompromis: ');$('assistantMessage').focus();};
  if($('detailExistingWeek'))$('detailExistingWeek').onclick=async()=>{const button=$('detailExistingWeek');button.disabled=true;try{const week=await hubWeekData(),detail=[];for(const d of week.days||[]){if(d.date<pragueToday())continue;for(const a of d.daily?.training?.planned||[]){const sport=activitySport(a);if(!['ride','run','gym'].includes(sport))continue;detail.push({date:d.date,sport,minutes:Math.round((a.durationHours||1)*60),environment:sport==='gym'?'indoor':'auto',existing:a.id});}}if(detail.length){await generateWeekProposals(detail);appendCoachTurn('assistant','Podrobnosti k naplánovaným tréninkům jsou připravené v plánu týdne.');}else $('assistantStatus').textContent='V tomto týdnu nejsou zbývající plánované tréninky.';}catch(error){$('assistantStatus').textContent=error.message;}finally{button.disabled=false;}};
}
function openGymPreview(date,pr){
  const g=pr.gymPreview,plan=g.plan;
  openSheet('Návrh gymu · '+longDate(date),'<h3>'+esc(plan.planName)+'</h3><p>'+esc(plan.rationale)+'</p><div class="gym-preview-rows">'+(plan.rows||[]).map(row=>'<div><b>'+esc(row[1])+'</b><span>'+esc(row[0])+' · '+esc(row[3]||'podle RPE')+' kg × '+esc(row[4])+'</span></div>').join('')+'</div>'+(pr.existing?'<p class="small">Jde o rozpracování existujícího tréninku. Změny můžeš provést v gymu.</p><button class="btn" id="openPreviewGym">Otevřít gym</button>':pr.scheduled?'<p>✓ Plán je uložený.</p>':'<button class="btn primary" id="confirmGymPreview">Uložit tento gym plán</button>'),body=>{
    if($('openPreviewGym'))$('openPreviewGym').onclick=()=>{closeSheet();openGymDay(date)};
    if($('confirmGymPreview'))$('confirmGymPreview').onclick=async()=>{const b=$('confirmGymPreview');b.disabled=true;try{const r=await jsonFetch('/app/api/gym/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draftId:g.draftId})});pr.scheduled=true;closeSheet();toast(r.intervals?.status==='error'?'Gym je uložený, zápis do Intervals selhal: '+r.intervals.message:'Gym plán uložený.');await renderWeekHub();}catch(error){toast(error.message);b.disabled=false;}};
  });
}
function installAdaptivePlanning(){
  $('settings').insertAdjacentHTML('beforeend','<article class="card" id="availabilitySettings" style="margin-top:12px"><h3>Časové možnosti</h3><p class="small" id="availabilitySummary">Načítám…</p><button class="btn primary" id="editDefaultAvailability" type="button">Nastavit běžný týden</button><div id="coachMemories"></div></article>');
  $('editDefaultAvailability').onclick=()=>openAvailabilityEditor('default');
  $('proposeWeek').insertAdjacentHTML('beforebegin','<button class="btn" id="editWeekAvailability" type="button">Časové možnosti</button>');
  $('editWeekAvailability').onclick=()=>openAvailabilityEditor('week');
  document.body.insertAdjacentHTML('beforeend','<button class="assistant-fab" id="floatingAssistant" type="button" aria-label="Otevřít osobního AI asistenta">✦ Asistent</button>');
  $('floatingAssistant').onclick=()=>openFloatingAssistant();
  const auto=$('generateEnvironment');if(auto){auto.insertAdjacentHTML('afterbegin','<option value="auto">Podle počasí a sezóny</option>');auto.value='auto';}
  $('assistantForm').onsubmit=async e=>{
    e.preventDefault();await sendAssistantMessage($('assistantMessage').value.trim());
  };
  $('assistantMessage').addEventListener('input',updateAssistantComposer);updateAssistantComposer();
  window.visualViewport?.addEventListener('resize',positionAssistantInViewport);window.visualViewport?.addEventListener('scroll',positionAssistantInViewport);
  const previous=load;load=async()=>{await previous();try{const r=await jsonFetch('/app/api/athlete-state');state.athleteState=r.state;renderCoachMemories();renderToday();const signature=JSON.stringify([pragueToday(),state.athleteState.status,(state.fitness?.wellness||[]).at(-1),(state.sleep?.sessions||[]).filter(s=>s.date===pragueToday())]);if(state.checkInSignature!==signature){const check=await jsonFetch('/app/api/coach/check-in');state.coachAdvice=check.advice;state.checkInSignature=signature;renderAthleteStatus();}}catch{};};
  const priorActivate=activate;activate=function(id){priorActivate(id);if(id==='settings'){renderAvailabilitySummary();renderCoachMemories();}if(id==='today')renderAthleteStatus();};
}
function renderCoachMemories(){
  const el=$('coachMemories');if(!el)return;const memories=state.athleteState?.memories||[];
  el.innerHTML='<h4>Asistent si pamatuje</h4>'+(memories.length?memories.map((m,i)=>'<div class="memory-row"><span>'+esc(m)+'</span><button class="btn" type="button" data-forget-memory="'+i+'">Zapomenout</button></div>').join(''):'<p class="small">Výslovné preference sdělené asistentovi se uloží sem.</p>');
  el.querySelectorAll('[data-forget-memory]').forEach(b=>b.onclick=async()=>{try{await athleteStatePost({forget:memories[Number(b.dataset.forgetMemory)]});renderCoachMemories();}catch(error){toast(error.message)}});
}
installAdaptivePlanning();

function activityEnvironmentBadge(activity,sport){
  if(sport==='gym'||/weight|strength/i.test(activity.type||''))return '';
  const p=activity.payload||{},type=String(activity.type||'')+' '+String(p.type||p.exercise?.exerciseType||''),text=String(activity.name||p.name||'');
  const indoor=activity.environment==='indoor'||p.environment==='indoor'||p.indoor===true||/Virtual|Indoor|Treadmill|POOL_SWIMMING/i.test(type)||/\bindoor\b|trenaž|trenaz|zwift|treadmill|běžecký pás/i.test(text);
  const outdoor=activity.environment==='outdoor'||p.environment==='outdoor'||p.indoor===false||p.exercise?.exerciseMetadata?.hasGps===true||Number(p.distance)>0||/OUTDOOR|OPEN_WATER/i.test(type)||/\boutdoor\b|venku|silnice|trail/i.test(text)||/^(Ride|Run|Walk|Hike|EBikeRide|MountainBikeRide|GravelRide)( |$)/.test(type);
  return '<span class="activity-environment '+(indoor?'indoor':outdoor?'outdoor':'unknown')+'">'+(indoor?'Indoor':outdoor?'Outdoor':'Prostředí neuvedeno')+'</span>';
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
  let card=$('weeklyEnergy');if(!card){card=document.createElement('article');card.id='weeklyEnergy';card.className='card weekly-energy';$('nutrition').querySelector('.nutrition-home')?.after(card);}
  const days=state.week?.days||[];if(!days.length){card.hidden=true;return}card.hidden=false;
  const b=weeklyEnergySummary(days,pragueToday()),difference=Math.round(b.closedDifference);
  card.innerHTML='<div class="do-head"><h3>Kalorie za týden</h3><small>'+esc(dateLabel(weekStart)+' – '+dateLabel(dateShift(weekStart,6)))+'</small></div><div class="weekly-energy-values"><div><span>Cíl za celý týden</span><strong>'+(b.targets===days.length?fmt(b.target):'Neúplný cíl')+' <small>kcal</small></strong></div><div><span>Zapsaný příjem</span><strong>'+fmt(b.consumed)+' <small>kcal</small></strong></div><div><span>Do týdenního cíle</span><strong>'+(b.targets===days.length?fmt(b.remaining):'—')+' <small>kcal</small></strong></div></div><div class="weekly-energy-bar"><i style="width:'+Math.min(100,b.target?b.consumed/b.target*100:0)+'%"></i></div>'+
    (b.closed?'<p class="weekly-energy-difference">'+(difference>=0?'Pod cílem zaznamenaných minulých dní o ':'Nad cílem zaznamenaných minulých dní o ')+'<strong>'+fmt(Math.abs(difference))+' kcal</strong>.</p>':'')+
    '<p class="small">'+b.logged+' z '+b.elapsed+' uplynulých dní má záznam'+(b.missing?' · '+b.missing+' dní bez zápisu se do rozdílu nepočítá':'')+'. Dnešek může být rozepsaný; rozdíl platí, pokud jsou minulá jídla zapsaná celá. Zbytek týdenního cíle zahrnuje i další dny.</p>';
}
function activityEnergyLabel(a){
  if(!measured(a.calories))return '';
  const c=a.energyCheck;
  let text=' · '+fmt(a.calories)+' kcal '+(c?.telemetry?'z minutových dat':'ze souhrnu zařízení');
  if(c?.telemetry&&c.summaryMismatch)text+=' · původní souhrn '+fmt(c.summaryCalories)+' kcal';
  if(c?.status==='review')text+=c.telemetry?' · ⚠ výdej chůze k ověření':' · ⚠ výdej k ověření; pro plán orientačně '+fmt(a.caloriesForPlanning)+' kcal (odhad podle hmotnosti a délky chůze)';
  return text;
}
function foodAssessmentHtml(entry){
  const p=num(entry.protein_g),c=num(entry.carbs_g),f=num(entry.fat_g),energy=p*4+c*4+f*9;
  if(!energy)return '';
  let text=p*4/energy>=.2&&p>=10?'Bílkovinná porce · '+fmt(p)+' g bílkovin':c*4/energy>=.6?'Převážně sacharidy · '+fmt(c)+' g':f*9/energy>=.6?'Převážně tuky · '+fmt(f)+' g':'Smíšená porce · '+fmt(p)+' g bílkovin';
  let note={};try{note=JSON.parse(entry.note||'{}');}catch{}
  if(num(note.salt_g)>=1.5)text+=' · sůl '+fmt(note.salt_g,1)+' g';
  return '<small class="food-assessment" title="Stručný přehled podle zapsané porce a maker">'+esc(text)+'</small>';
}
function foodExportHtml(entry){
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
    try{const r=await jsonFetch('/app/api/food/personal'),products=r.products||[];$('sheetBody').innerHTML=products.length?'<p class="small">'+products.length+' potravin z tvého účtu.</p>'+products.map((p,i)=>'<button type="button" class="food-result" data-library-food="'+i+'"><strong>'+esc(p.name)+'</strong><span>'+fmt(p.calories_100g)+' kcal / '+(p.nutrition_basis==='portion'?'porce':'100 '+p.nutrition_basis)+(p.quantity?' · '+esc(p.quantity):'')+'</span></button>').join(''):'<p class="small">Zatím tu nemáš uloženou žádnou potravinu.</p>';$('sheetBody').querySelectorAll('[data-library-food]').forEach(b=>b.onclick=()=>{const p=products[Number(b.dataset.libraryFood)];closeSheet();openFoodLogger();selectFoodProduct(p);});}catch(error){$('sheetBody').textContent=error.message;}
  };
  const nutrition=renderNutrition;renderNutrition=function(){nutrition();renderWeeklyEnergy();};
  const style=document.createElement('style');style.textContent='.weekly-energy{margin:16px 0}.weekly-energy-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.weekly-energy-values span{display:block;font-size:12px;color:#9dabb6}.weekly-energy-values strong{display:block;font-size:25px;margin:7px 0}.weekly-energy-values small{font-size:12px}.weekly-energy-bar{height:6px;background:#29333b;border-radius:10px;overflow:hidden;margin:16px 0}.weekly-energy-bar i{display:block;height:100%;background:#91e5c9}.food-assessment{color:#a0c5b8!important;margin-top:5px}.food-export{color:#8c9dac!important;margin-top:4px}.food-export button{font:inherit;color:#91e5c9;background:none;border:0;text-decoration:underline;cursor:pointer;padding:0}.export-error,.export-uncertain{color:#ffc184!important}.activity-environment{display:table;font-size:10px;padding:3px 6px;border:1px solid #354550;border-radius:5px;margin:5px 0;color:#a3cbbb}.activity-environment.indoor{color:#c3b0ee}.manual-food-package{grid-column:1/-1!important}#foodExtraSizes{margin-top:12px}#foodExtraSizes .food-editor-grid{margin-top:10px}#foodAdvancedFields .food-input,#foodExtraSizes .food-input{font-size:16px!important}#foodAddDirect:disabled{opacity:.4}#myFoodLibrary{margin-top:8px}.food-catalog-note{margin:10px 0}.ml-entry>span{min-width:0}.ml-entry small{white-space:normal;overflow-wrap:anywhere}@media(max-width:600px){.weekly-energy-values{gap:8px}.weekly-energy-values strong{font-size:20px}.weekly-energy-values span{font-size:11px}#foodAdvancedFields{grid-template-columns:repeat(2,minmax(0,1fr))!important}#foodProductName{font-size:16px!important}}';document.head.append(style);
}
installReliableFoodEditor();
setInterval(()=>{if(!document.hidden&&(mealEntries||[]).some(e=>['queued','syncing','operation'].includes(e.google?.status)))loadEnteredFood();},10000);
