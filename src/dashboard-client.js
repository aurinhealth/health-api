const $=id=>document.getElementById(id);
let weekStart=pragueMonday(),selectedHistoryDate=pragueToday(),state={};
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function fmt(v,d=0){return Math.round(num(v)*10**d)/10**d}
function dateShift(date,days){const p=date.split("-").map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]+days)).toISOString().slice(0,10)}
function pragueToday(){const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());return p.find(x=>x.type==="year").value+"-"+p.find(x=>x.type==="month").value+"-"+p.find(x=>x.type==="day").value}
function pragueMonday(){const d=pragueToday().split("-").map(Number),x=new Date(Date.UTC(d[0],d[1]-1,d[2])),wd=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-wd);return x.toISOString().slice(0,10)}
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
  const W=1000,H=440,top=34,bottom=76,left=36,plot=H-top-bottom,slot=(W-left-26)/shown.length,bw=Math.min(102,slot*.7);
  let out='<text x="20" y="20" fill="#91a0b5" font-size="12">KALORIE · PŘÍJEM / CÍL</text>';
  shown.forEach((d,i)=>{const food=d.food?.totals||{},target=Math.max(1,num(d.daily?.nutrition?.calorieTarget||d.daily?.calories?.target)),eaten=Math.max(0,num(food.kcal)),m=macroTargetsOf(d),vals=[{kcal:num(food.protein_g)*4,color:"#60a5fa",pct:m.protein?Math.round(num(food.protein_g)/m.protein*100):0},{kcal:num(food.carbs_g)*4,color:"#f59e0b",pct:m.carbs?Math.round(num(food.carbs_g)/m.carbs*100):0},{kcal:num(food.fat_g)*9,color:"#a78bfa",pct:m.fat?Math.round(num(food.fat_g)/m.fat*100):0}],x=left+i*slot+(slot-bw)/2;out+='<rect x="'+x+'" y="'+top+'" width="'+bw+'" height="'+plot+'" rx="10" fill="#14253a" stroke="#36516f" stroke-width="2"/>';let y=top+plot,remaining=Math.min(target,eaten);vals.forEach(v=>{const amount=Math.min(remaining,v.kcal),h=amount/target*plot;y-=h;remaining-=amount;if(h>0){out+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" fill="'+v.color+'"/>';if(h>=24)out+='<text x="'+(x+bw/2)+'" y="'+(y+h/2+4)+'" text-anchor="middle" fill="#07101d" font-size="12" font-weight="800">'+v.pct+'%</text>';}});if(remaining>0){const h=remaining/target*plot;y-=h;out+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" fill="#64748b"/>';}const pct=Math.round(eaten/target*100);out+='<text x="'+(x+bw/2)+'" y="'+(H-48)+'" text-anchor="middle" fill="#d8e0ea" font-size="12" font-weight="700">'+esc(dateLabel(d.date))+'</text><text x="'+(x+bw/2)+'" y="'+(H-28)+'" text-anchor="middle" fill="#f4f7fb" font-size="12" font-weight="750">'+fmt(eaten)+' kcal</text><text x="'+(x+bw/2)+'" y="'+(H-12)+'" text-anchor="middle" fill="#91a0b5" font-size="11">z '+fmt(target)+' kcal · '+pct+'%</text>';});
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
async function jsonFetch(path,options={}){const r=await fetch(path,{credentials:"same-origin",...options});const d=await r.json().catch(()=>({message:"Invalid response"}));if(!r.ok)throw new Error(d.message||"HTTP "+r.status);return d}
function activate(view){document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===view))}
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
    return '<div class="plan-item '+tone+'"><div class="name">'+esc(actual?.name||planned?.name||actual?.type||planned?.type||"Aktivita")+'</div><div class="meta">'+label+(item.durationHours?" · "+fmt(item.durationHours,1)+" h":"")+(actual?.tss?" · TSS "+fmt(actual.tss):planned?.tss?" · TSS "+fmt(planned.tss):"")+(actual?.calories?" · "+fmt(actual.calories)+" kcal":"")+'</div>'+planName+'</div>';
  }).join("");
  return '<div class="plan-day '+(x.date===pragueToday()?"today":"")+'"><div class="dow">'+esc(longDate(x.date))+'</div>'+(items||'<div class="muted">Volno</div>')+'</div>';
}

function renderCoachCouncil(){
  const council=state.coaches||{},cards=council.coaches||[];
  const p=$("coachPriorities"),c=$("coachCards"),g=$("coachGuardrails");if(!p||!c||!g)return;
  p.innerHTML='<div class="eyebrow">KOORDINÁTOR · DNEŠNÍ PRIORITY</div>'+(council.priorities?.length?'<ol class="coach-actions">'+council.priorities.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ol>':'<div class="muted">Zatím bez společného doporučení.</div>');
  c.innerHTML=cards.map(x=>'<div class="coach-card '+esc(x.status||"")+'"><div class="eyebrow">'+esc(x.title)+'</div><h3>'+esc(x.headline)+'</h3><div class="small">Jistota: '+esc(x.confidence||"—")+'</div><ul class="coach-actions">'+(x.actions||[]).map(a=>'<li>'+esc(a)+'</li>').join("")+'</ul><details><summary>Proč?</summary><div class="small">'+(x.evidence||[]).map(e=>esc(e)).join("<br>")+'</div>'+((x.resources||[]).length?'<div class="small" style="margin-top:8px">'+x.resources.filter(r=>/^https:\/\//.test(String(r.url||""))).map(r=>'<a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">'+esc(r.label||"Otevřít postup")+'</a>').join("<br>")+'</div>':"")+'</details></div>').join("");
  g.innerHTML=(council.guardrails||[]).map(x=>"• "+esc(x)).join("<br>");
}

function renderOverview(){
  const d=state.daily||{},f=d.nutrition?.foodLog?.totals||{},target=d.nutrition||{};
  $("overviewDate").textContent=longDate(pragueToday());
  const completed=(d.training?.completed||[]).filter(x=>!isNutritionItem(x));
  const planned=(d.training?.planned||[]).filter(x=>!isNutritionItem(x));
  const sleepSessions=primarySleepSessions(state.sleep?.sessions);
  const lastSleep=sleepSessions[0];
  const sleepPrev=sleepSessions.slice(1,15),sleepAvg=sleepPrev.length?sleepPrev.reduce((sum,x)=>sum+num(x.durationMin),0)/sleepPrev.length:null;
  $("oSleep").innerHTML=lastSleep?hm(lastSleep.durationMin)+trendArrow(lastSleep.durationMin,sleepAvg,false," min vs avg"):"—";
  const recent=sleepSessions.slice(0,7),durations=recent.map(x=>num(x.durationMin)),avg7=durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:0;
  const delta=lastSleep&&avg7?num(lastSleep.durationMin)-avg7:0;
  $("overviewSleepHistory").innerHTML=recent.length?'<div class="grid3"><div><div class="small">Poslední noc</div><strong>'+hm(lastSleep.durationMin)+'</strong></div><div><div class="small">7denní průměr</div><strong>'+hm(avg7)+'</strong></div><div><div class="small">Odchylka</div><strong>'+(delta>=0?"+":"")+fmt(delta)+' min</strong></div></div><div class="notice" style="margin-top:10px">'+(avg7>=450?"Regenerace je délkou spánku v dobrém pásmu.":avg7>=390?"Spánek je použitelný, ale pro lepší adaptaci míř k 7,5–8 hodinám.":"Nízký průměr spánku může brzdit regeneraci i výkon.")+'</div>':'<div class="muted">Žádná historie spánku.</div>';
  const focus=planned[0]||completed[0];
  if(focus){const hrs=num(focus.durationHours),cycling=/ride|cycl|bike|endurance|threshold/i.test((focus.name||"")+" "+(focus.type||""));$("oTraining").textContent=focus.name||focus.type||"Dnešní trénink";$("oTrainingNote").textContent=cycling?(hrs>=2?"Vytrvalostní trénink: drž plánovanou intenzitu, začni doplňovat sacharidy od první hodiny a pij průběžně.":hrs>=1?"Kratší cyklistika: soustřeď se na kvalitu intervalů; obvykle stačí voda a běžné jídlo před tréninkem.":"Krátká jízda: priorita je technika a přesné provedení."):"Dnešní aktivita: hlídej techniku, postupné zatížení a nechoď do selhání u všech sérií.";}else{$("oTraining").textContent="Regenerace / volný den";$("oTrainingNote").textContent="Bez plánovaného tréninku. Lehká chůze a mobilita jsou vhodné, pokud se cítíš dobře.";}
  const calTarget=Number(target.calorieTarget||d.calories?.target||0);
  const score=nutritionScore({kcal:f.kcal,protein_g:f.protein_g,carbs_g:f.carbs_g,fat_g:f.fat_g},{calorieTarget:calTarget,macros:{protein:target.macros?.protein_g??target.macros?.proteinGrams,carbs:target.macros?.carbs_g??target.macros?.carbsGrams,fat:target.macros?.fat_g??target.macros?.fatGrams}});
  $("oFood").textContent=fmt(f.kcal)+" / "+fmt(calTarget)+" kcal";
  $("oFoodNote").innerHTML=(score==null?"Zatím bez záznamu":scoreBadge(score,"Výživa"));
  const m=macroTargetsOf({daily:{nutrition:{macros:target.macros}}});
  $("oMacros").innerHTML='<div class="macro-line"><b style="color:#60a5fa">P</b><span>'+fmt(f.protein_g)+' / '+fmt(m.protein)+' g</span></div><div class="macro-line"><b style="color:#f59e0b">C</b><span>'+fmt(f.carbs_g)+' / '+fmt(m.carbs)+' g</span></div><div class="macro-line"><b style="color:#a78bfa">F</b><span>'+fmt(f.fat_g)+' / '+fmt(m.fat)+' g</span></div>';
  const sleep=primarySleepSessions(state.sleep?.sessions),last=sleep[0],prevSleep=sleep[1];
  const sleepScore=last?Math.round(Math.min(100,Math.max(0,(num(last.durationMin)/480)*70+(num(last.stages?.DEEP)/90)*15+(num(last.stages?.REM)/90)*15))):null;
  const todayPlanTss=planned.reduce((a,z)=>a+num(z.tss),0),todayActualTss=completed.reduce((a,z)=>a+num(z.tss),0);
  const trainingScore=planned.length&&todayPlanTss?Math.round(Math.min(100,todayActualTss/todayPlanTss*100)):(completed.length?100:null);
  const rs=sleep.slice(1,15).filter(x=>Number.isFinite(Number(x.durationMin)));const recoveryAvg=rs.length?rs.reduce((sum,x)=>sum+num(x.durationMin),0)/rs.length:null;$("oRecoverySleep").innerHTML=(sleepScore==null?"—":sleepScore+"%")+trendArrow(last?.durationMin,recoveryAvg,false," min vs avg");
  $("oRecoveryTraining").innerHTML=(trainingScore==null?"—":trainingScore+"%");
  $("oRecoveryNote").textContent="spánek · tréninková shoda";
  const today=pragueToday(),tomorrow=dateShift(today,1),days=state.week?.days||[];
  const compact=days.filter(x=>x.date===today||x.date===tomorrow);
  $("overviewPlan").innerHTML=compact.map(trainingDayMarkup).join("");
  $("overviewWeekPlan").innerHTML=days.map(trainingDayMarkup).join("");
  const fw=state.fitness?.wellness||[],latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};
  $("oFitness").innerHTML=(Number.isFinite(Number(latest.ctl))?fmt(latest.ctl):"—")+trendArrow(latest.ctl,prev.ctl,false,"");
  $("oForm").innerHTML=(Number.isFinite(Number(latest.tsb))?fmt(latest.tsb):"—")+trendArrow(latest.tsb,prev.tsb,false,"");
  const wr=(d.weight?.records||[]).filter(x=>x.value_numeric!=null).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time)));
  const currentW=wr.length?Number(wr[wr.length-1].value_numeric):Number(d.weight?.current);
  const startW=wr[0];
  const weightDelta=Number.isFinite(currentW)&&startW?currentW-num(startW.value_numeric):null;
  const weightTrend=weightDelta==null||Math.abs(weightDelta)<.05?"":'<div class="trend '+(weightDelta<0?"good":"bad")+'">'+(weightDelta>0?"↑ +":"↓ ")+fmt(weightDelta,1)+' kg od počáteční váhy</div>';
  const targetW=Number(d.nutrition?.targetWeightKg||80),remainingW=Number.isFinite(currentW)?currentW-targetW:null; $("oWeight").innerHTML=Number.isFinite(currentW)?fmt(currentW,1)+" kg"+weightTrend:"—"; $("oWeightMeta").textContent=Number.isFinite(remainingW)?"Aktuálně · cíl "+fmt(targetW,1)+" kg · zbývá "+fmt(Math.max(0,remainingW),1)+" kg":"aktuálně · cíl "+fmt(targetW,1)+" kg";
  macroChart("calChart",days);
}
function renderTraining(){
  const days=state.week?.days||[],fw=state.fitness?.wellness||[];
  $("trainingRange").textContent="Týden "+isoWeek(weekStart)+" · "+dateLabel(weekStart)+" – "+dateLabel(dateShift(weekStart,6));
  populateWeekSelectors("trainingWeekSelect",null,days);
  const selected=days.find(x=>x.date===pragueToday())||days[0];
  const planned=days.flatMap(x=>(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z)).map(z=>({...z,date:x.date})));
  const completed=days.flatMap(x=>(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z)).map(z=>({...z,date:x.date})));
  const matched=days.flatMap(x=>(x.daily?.training?.matched||[]).map(z=>({...z,date:x.date})));
  $("trainingWeekOverview").innerHTML=days.map(trainingDayMarkup).join("");
  $("plannedList").innerHTML=planned.length?planned.map(x=>'<div class="activity"><strong>'+esc(longDate(x.date))+' · '+esc(x.name||"Workout")+'</strong><span class="small">Plánováno · '+esc(x.type||"")+(x.durationHours?" · "+fmt(x.durationHours,1)+" h":"")+(x.tss?" · TSS "+fmt(x.tss):"")+'</span></div>').join(""):'<div class="muted">Všechny plánované tréninky jsou splněné nebo tento týden žádné nejsou.</div>';
  $("completedList").innerHTML=completed.length?completed.slice().reverse().map(x=>{const plan=matched.find(m=>String(m.actualId)===String(x.id));return '<div class="activity"><strong>'+esc(longDate(x.date))+' · '+esc(x.name||x.type||"Activity")+'</strong><span class="small">'+(plan?"Podle plánu":"Mimo plán")+" · "+esc(x.type||"")+(x.durationHours?" · "+fmt(x.durationHours,1)+" h":"")+(x.tss?" · TSS "+fmt(x.tss):"")+(x.calories?" · "+fmt(x.calories)+" kcal":"")+'</span></div>'}).join(""):'<div class="muted">Zatím nic dokončeno.</div>';
  const latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};
  $("tFitness").innerHTML=(Number.isFinite(Number(latest.ctl))?fmt(latest.ctl):"—")+trendArrow(latest.ctl,prev.ctl,false,"");
  $("tFatigue").innerHTML=(Number.isFinite(Number(latest.atl))?fmt(latest.atl):"—")+trendArrow(latest.atl,prev.atl,true,"");
  $("tForm").innerHTML=(Number.isFinite(Number(latest.tsb))?fmt(latest.tsb):"—")+trendArrow(latest.tsb,prev.tsb,false,"");
  $("tRamp").innerHTML=(Number.isFinite(Number(latest.rampRate))?fmt(latest.rampRate,1):"—")+trendArrow(latest.rampRate,prev.rampRate,false,"");
  const labels=fw.map(x=>dateLabel(String(x.id||"").slice(0,10)));
  multiLineChart("pmcChart",[{label:"Fitness",stroke:"#3b82f6",values:fw.map(x=>num(x.ctl))},{label:"Fatigue",stroke:"#ef6b73",values:fw.map(x=>num(x.atl))},{label:"Form",stroke:"#35c48b",values:fw.map(x=>num(x.tsb))}],labels,{W:1000,H:420});
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
  const today=days.find(x=>x.date===pragueToday())||days[days.length-1];
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
  const loggedMealText=(state.nutrition?.records||[]).filter(x=>String(x.startTime||"").slice(0,10)===String(selected?.date||"")).map(x=>String(x.mealType||"")).join(" ").toLowerCase();
  const hour=new Date().getHours();
  const isGroupNeeded=group=>{
    const label=String(group.label||"").toLowerCase();
    const isBreakfast=/snídan|breakfast/.test(label),isLunch=/oběd|lunch/.test(label),isDinner=/večeř|dinner/.test(label),isSnack=/svačin|snack/.test(label);
    if((isBreakfast&&/snídan|breakfast/.test(loggedMealText))||(isLunch&&/oběd|lunch/.test(loggedMealText))||(isDinner&&/večeř|dinner/.test(loggedMealText)))return false;
    if(hour<9)return isBreakfast||isSnack||isLunch;
    if(hour<13)return isSnack||isLunch;
    if(hour<17)return isSnack||isDinner;
    return isDinner||isSnack;
  };
  const mealGroups=allMealGroups.filter(isGroupNeeded).slice(0,3);
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
    (mealGroups.length?mealGroups.map(group=>'<div style="margin-top:12px"><h3 style="margin-bottom:6px">'+esc(group.label)+'</h3>'+
      (group.recommendations?.length?group.recommendations.slice(0,3).map(r=>'<div class="foodrow"><div><strong>'+esc(r.name||r.title||"Jídlo")+'</strong><div class="small">'+esc(r.recommendation_reason||"")+'</div><div class="small">1 porce · '+fmt(r.kcal||r.calories)+' kcal · P '+fmt(r.protein_g)+' · C '+fmt(r.carbs_g)+' · F '+fmt(r.fat_g)+'</div></div><div class="right">'+scoreBadge(Math.min(100,Math.max(0,Number(r.recommendation_score||0))))+'</div></div>').join(""):'<div class="muted">Pro tuto část dne nemám vhodný recept.</div>')+'</div>').join(""):'<div class="muted">Dnešní zbývající jídla jsou pokrytá.</div>')+
    (mealGroups.length?'':fallback)+
    (stores.length?'<details style="margin-top:12px"><summary>Alternativa z běžného obchodu</summary>'+stores.slice(0,4).map(r=>'<div class="foodrow"><div><strong>'+esc(r.name)+'</strong><div class="small">'+esc(r.reason||"")+'</div></div><div class="right">'+fmt(r.kcal)+' kcal</div></div>').join("")+'</details>':''):'—';

  const nr=state.nutrition?.records||[];
  const selectedFoods=nr.filter(x=>String(x.startTime||"").slice(0,10)===String(selected?.date||""));
  $("nutritionInfo").textContent=selectedFoods.length+" záznamů z Google Health pro "+(selected?.date||"vybraný den");
  $("nutritionRows").innerHTML=layeredHistory(nr,x=>x.startTime,x=>'<div class="history-workout"><strong>'+esc(x.foodDisplayName||"Jídlo")+' · '+fmt(x.kcal)+' kcal</strong><div class="small">'+esc(x.startTime?new Date(x.startTime).toLocaleString("cs-CZ"):"—")+' · '+esc(x.mealType||"—")+' · P '+fmt(x.protein_g,1)+' g · C '+fmt(x.carbs_g,1)+' g · F '+fmt(x.fat_g,1)+' g</div></div>');
}
function renderRecovery(){
  const ss=primarySleepSessions(state.sleep?.sessions),last=ss[0],range=Number($("sleepRange")?.value||30);
  const filtered=ss.filter(x=>{const t=new Date(x.endTime||x.startTime||0).getTime();return range>=3000||t>=Date.now()-range*86400000;});
  $("rLast").textContent=last?hm(last.durationMin):"—";
  $("rLastMeta").textContent=last?(last.startTime?new Date(last.startTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"")+" → "+(last.endTime?new Date(last.endTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):""):"";
  const avg=filtered.length?filtered.reduce((a,x)=>a+num(x.durationMin),0)/filtered.length:0;
  $("rAvg").textContent=avg?hm(avg):"—";
  $("rAvgLabel").textContent=range>=3000?"all time":range===365?"poslední rok":range===180?"posledních 6 měsíců":range===30?"poslední měsíc":"posledních 7 dní";
  $("rDeep").textContent=last?.stages?.DEEP?hm(last.stages.DEEP):"—"; $("rRem").textContent=last?.stages?.REM?hm(last.stages.REM):"—";
  const sleepScore=last?Math.round(Math.min(100,Math.max(0,(num(last.durationMin)/480)*70+(num(last.stages?.DEEP)/90)*15+(num(last.stages?.REM)/90)*15))):null;
  $("sleepScore").innerHTML=sleepScore!=null?scoreBadge(sleepScore,"Kvalita"):'<span class="muted">Bez dat</span>';
  chartSvg("sleepChart",filtered.slice().reverse().map(x=>num(x.durationMin)/60),[],filtered.slice().reverse().map(x=>dateLabel(x.date)),{W:700,H:250,axis:true,unit:" h",decimals:1,min:range===7?4:undefined});
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
  const w=state.weight||{},weightDisplay=v=>Number.isFinite(Number(v))&&Number(v)>0?fmt(v,1):"—";
  $("hWeight").textContent=weightDisplay(w.latest?.value_numeric);$("hAvg7").textContent=weightDisplay(w.average7d);$("hAvg30").textContent=weightDisplay(w.average30d);$("hActivities").textContent=state.activities?.count||0;
  const wr=(w.records||[]).filter(x=>num(x.value_numeric)>0&&/^\d{4}-\d{2}-\d{2}/.test(String(x.sample_time||""))).slice(-365);
  chartSvg("healthWeightChart",wr.map(x=>num(x.value_numeric)),[],wr.map(x=>dateLabel(String(x.sample_time).slice(0,10))),{W:1000,H:360,axis:true,unit:" kg",decimals:1});
  $("weightHistory").innerHTML=layeredHistory(wr,x=>x.sample_time,x=>'<div class="history-workout"><strong>'+esc(longDate(String(x.sample_time).slice(0,10)))+'</strong><div class="small">'+fmt(x.value_numeric,1)+' kg · '+esc(x.source_family||"zdroj")+'</div></div>');
}
let gymSaveQueue=Promise.resolve();
function gymRowValues(tr){const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]),idx=Number(tr.dataset.row)+7;if(!values[idx])values[idx]=[];tr.querySelectorAll("input[data-col]").forEach(inp=>{const c=Number(inp.dataset.col);values[idx][c]=inp.type==="checkbox"?(inp.checked?"TRUE":"FALSE"):inp.value;});return {values,idx};}
function persistGymRow(tr){const {values}=gymRowValues(tr),used=values.slice(7);while(used.length&&used[used.length-1].every(v=>String(v??"").trim()===""))used.pop();gymSaveQueue=gymSaveQueue.then(async()=>{const result=await jsonFetch("/app/api/gym",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({values:used})});state.gym={...state.gym,values:used,history:result.history||state.gym?.history||[]};$("gymNotice").textContent=result.status==="error"?"Uložení do databáze selhalo: "+(result.message||"neznámá chyba"):"✓ Zapsáno do interní databáze · "+new Date().toLocaleTimeString("cs-CZ");});return gymSaveQueue.catch(e=>{$("gymNotice").textContent="Uložení selhalo: "+e.message;throw e;});}
function renderGymHistory(history){$("gymHistory").innerHTML=layeredHistory(history,x=>x.workout_date||x.date||x.started_at,x=>'<div class="history-workout"><strong>'+esc(x.exercise||"Cvik")+'</strong><div class="small">'+esc(String(x.actualKg??x.weightKg??"—"))+' kg × '+esc(String(x.actualReps??x.reps??"—"))+'</div></div>');}
async function saveGymPlanValues(values){const rows=values.slice(7);while(rows.length&&rows[rows.length-1].every(v=>String(v??'').trim()===''))rows.pop();values=values.slice(0,7).concat(rows);await jsonFetch("/app/api/gym",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"plan",date:pragueToday(),values})});state.gym={...state.gym,values};renderGym();}
function gymPlanEdit(action,idx){const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]);const rows=values.slice(7);if(action==="remove-set"){rows.splice(idx,1);}else if(action==="add-set"){const src=rows[idx]||["WORK","","1","","10","","","","FALSE","",""];const copy=src.slice();copy[2]=String(Number(src[2]||1)+1);copy[5]="";copy[6]="";copy[7]="";copy[8]="FALSE";rows.splice(idx+1,0,copy);}else if(action==="remove-exercise"){const ex=String(rows[idx]?.[1]||"");for(let i=rows.length-1;i>=0;i--)if(String(rows[i]?.[1]||"")===ex)rows.splice(i,1);}else if(action==="add-exercise"){const ex=prompt("Název cviku:");if(!ex)return;for(let n=1;n<=3;n++)rows.push(["WORK",ex,String(n),"","8-12","","","","FALSE","",""]);}values.splice(7,values.length-7,...rows);saveGymPlanValues(values).catch(e=>toast("Úprava plánu selhala: "+e.message));}
function renderGym(){const values=state.gym?.values||[];const rows=values.slice(7).filter(r=>r.some(v=>String(v??"").trim()!==""));$("gymMeta").textContent=(values[2]?.[1]||"Dnešní silový trénink")+" · "+pragueToday();$("gymNotice").textContent=rows.length?rows.filter(r=>String(r[0]||"")==="WORK").length+" pracovních řádků · plán i výsledky jsou v interní databázi":"Dnešní plán je prázdný. Přidej cvik nebo vygeneruj plán.";const start=values.slice(7).findIndex(r=>r.some(v=>String(v??"").trim()!==""));const actualRows=start<0?[]:values.slice(7+start);$("gymRows").innerHTML=actualRows.map((r,i)=>{const idx=i+(start<0?0:start),type=r[0]||"",exercise=r[1]||"";const rawVideo=state.gym?.videoLinks?.[idx+7]||r[10]||"";const formula=String(rawVideo);const formulaUrl=formula.match(/HYPERLINK\(\s*"([^"]+)"/i)?.[1]||"";const video=/^https?:\/\//i.test(formula)?formula:formulaUrl||("https://www.youtube.com/results?search_query="+encodeURIComponent(String(exercise||"")+" exercise technique"));return '<tr data-row="'+idx+'"><td><span class="gym-type">'+esc(type)+'</span></td><td><strong>'+esc(exercise)+'</strong></td><td>'+esc(r[2]||"")+'</td><td>'+esc(r[3]||"")+'</td><td>'+esc(r[4]||"")+'</td><td><input data-col="5" value="'+esc(r[5]||"")+'" inputmode="decimal"></td><td><input data-col="6" value="'+esc(r[6]||"")+'" inputmode="numeric"></td><td><input data-col="7" value="'+esc(r[7]||"")+'" inputmode="decimal"></td><td><input data-col="8" type="checkbox" '+(String(r[8]).toUpperCase()==="TRUE"||r[8]===true?"checked":"")+'></td><td><a href="'+esc(video)+'" target="_blank" rel="noopener noreferrer">▶ Video</a></td><td><button class="btn gym-action" data-action="add-set" data-idx="'+idx+'">+ série</button> <button class="btn gym-action" data-action="remove-set" data-idx="'+idx+'">− série</button> <button class="btn gym-action" data-action="remove-exercise" data-idx="'+idx+'">🗑 cvik</button></td></tr>'}).join("")||'<tr><td colspan="11" class="muted">Žádný plán.</td></tr>'}
async function loadGym(){state.gym=await jsonFetch("/app/api/gym");renderGym();renderGymHistory(state.gym.history||[])}
async function saveGym(){const b=$("saveGym");b.disabled=true;b.textContent="Saving…";try{for(const tr of document.querySelectorAll("#gymRows tr[data-row]"))await persistGymRow(tr);toast("Workout saved");}catch(e){toast("Save selhal: "+e.message)}finally{b.disabled=false;b.textContent="Save workout"}}
async function generateGym(){const b=$("generateGym");b.disabled=true;b.textContent="Generating…";try{await jsonFetch("/app/api/gym/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:pragueToday()})});toast("Today's plan generated");await loadGym()}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent="Generate today's plan"}}
window.addEventListener("error",e=>{try{toast("Chyba aplikace: "+(e.error?.message||e.message||"neznámá chyba"))}catch{}});
window.addEventListener("unhandledrejection",e=>{try{toast("Chyba aplikace: "+(e.reason?.message||String(e.reason||"Promise rejected")))}catch{}});
async function load(){ $("topStatus").textContent="Načítám…"; const end=dateShift(weekStart,6); const jobs=[["daily","/app/api/daily"],["coaches","/app/api/coaches"],["fitness","/app/api/fitness?days=90"],["week","/app/api/week?start="+weekStart],["weight","/app/api/weight"],["activities","/app/api/activities"],["nutrition","/app/api/nutrition?start=2026-01-01&end="+dateShift(pragueToday(),1)],["sleep","/app/api/sleep?start="+dateShift(pragueToday(),-365)+"&end="+dateShift(pragueToday(),1)],["gym","/app/api/gym"]]; const results=await Promise.allSettled(jobs.map(([,url])=>jsonFetch(url))); state={...state}; let failed=0; results.forEach((r,i)=>{const key=jobs[i][0]; if(r.status==="fulfilled") state[key]=r.value; else {failed++; state[key]={status:"error",message:r.reason?.message||"Načtení selhalo"};}}); try{renderOverview();}catch{} try{renderCoachCouncil();}catch{} try{renderTraining();}catch{} try{renderNutrition();}catch{} try{renderRecovery();}catch{} try{renderHealth();}catch{} try{renderGym();}catch{} $("topStatus").textContent=failed===0?"Live · "+new Date().toLocaleTimeString("cs-CZ"):(failed<jobs.length?"Částečně načteno":"Data unavailable"); $("topStatus").className=failed===0?"status-label small":failed<jobs.length?"status-label small status-partial":"status-label small status-error"; if(failed) toast("Některá datová služba není dostupná.");}
document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>activate(b.dataset.view));
$("refresh").onclick=async()=>{const b=$("refresh");b.disabled=true;b.textContent="Syncing…";try{const r=await jsonFetch("/app/api/sync",{method:"POST"});toast(r.status==="accepted"?"Synchronizace běží na pozadí. Kontroluji nová data…":"Data synchronized");let n=0;const poll=()=>{n++;b.textContent=n<4?"Syncing…":"Refreshing…";load();if(n<4)setTimeout(poll,4500);else{b.disabled=false;b.textContent="Refresh"}};setTimeout(poll,3000)}catch(e){toast("Sync selhal: "+e.message);b.disabled=false;b.textContent="Refresh"}};
$("prevWeek").onclick=()=>{weekStart=dateShift(weekStart,-7);selectedHistoryDate=weekStart;load()};
$("nextWeek").onclick=()=>{weekStart=dateShift(weekStart,7);selectedHistoryDate=weekStart;load()};
$("thisWeek").onclick=()=>{weekStart=pragueMonday();selectedHistoryDate=weekStart;load()};
$("saveGym").onclick=saveGym;$("generateGym").onclick=generateGym;$("addGymExercise").onclick=()=>gymPlanEdit("add-exercise",0);$("gymRows").addEventListener("click",e=>{const b=e.target.closest(".gym-action");if(b)gymPlanEdit(b.dataset.action,Number(b.dataset.idx));});
$("gymRows").addEventListener("change",e=>{if(e.target.matches("input[data-col]")){const tr=e.target.closest("tr[data-row]");if(tr)persistGymRow(tr).catch(()=>{});}});
$("gymRows").addEventListener("input",e=>{if(e.target.matches("input[data-col]:not([type=checkbox])")){const tr=e.target.closest("tr[data-row]");if(!tr)return;clearTimeout(tr._saveTimer);tr._saveTimer=setTimeout(()=>persistGymRow(tr).catch(()=>{}),700);}});

$("sleepRange").onchange=renderRecovery;
load();
