import app from "./sheets-gateway.js";
import { handleMcpCompat } from "./mcp-compat.js";
import { handleOAuthCompat } from "./oauth-compat.js";
import { syncDailyNutritionNotes, deleteDailyNutritionNotes } from "./intervals-nutrition-notes.js";
import { verifyGitHubActionsToken } from "./github-oidc.js";
import { dashboardPage } from "./dashboard.js";
import { handleGoogleOAuth } from "./google-oauth.js";
import { importStrengthHistory, getStrengthHistory } from "./strength-history.js";
import legacyHealthApi from "./index.js";

const OPENAPI_URL = "https://raw.githubusercontent.com/shaarkyn/health-api/main/openapi.json";

export default {
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Legacy Google Health endpoints live in index.js. The deployed Worker
    // uses entrypoint.js, so expose these routes explicitly instead of letting
    // them fall through to the dashboard gateway.
    if (url.pathname === "/sync/google" || url.pathname === "/sync/google/status" || url.pathname === "/health/sleep" || url.pathname === "/health/db") {
      return legacyHealthApi.fetch(request, env, ctx);
    }
    if (url.pathname === "/mcp/health" && request.method === "GET") return Response.json({ status: "ok", service: "health-api-mcp", version: "1.1.0", endpoint: "/mcp", protocol: "2026-07-28+legacy" });
    if (url.pathname === "/automation/strength") return handleStrengthAutomation(request, env, ctx);
    if (url.pathname === "/automation/nutrition") return handleNutritionAutomation(request, env, ctx);
    if (url.pathname === "/automation/nutrition-notes") return handleNutritionNotesAutomation(request, env);
    if (url.pathname === "/automation/planned-calories-cleanup") return handlePlannedCaloriesCleanup(request, env);
    const oauthResponse = await handleOAuthCompat(request, env, url.pathname);
    if (oauthResponse) return oauthResponse;
    if (url.pathname === "/mcp") return handleMcpCompat(request, env);
    if (url.pathname === "/.well-known/openai-apps-challenge" && request.method === "GET") {
      if (!env.OPENAI_APP_CHALLENGE) return new Response("Not configured", { status: 404 });
      return new Response(env.OPENAI_APP_CHALLENGE, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
    const googleOAuth = await handleGoogleOAuth(request, env, url.pathname);
    if (googleOAuth) return googleOAuth;
    if (url.pathname === "/app" && request.method === "GET") return dashboardPage();
    if (url.pathname === "/app/dashboard-client.js" && request.method === "GET") return new Response("const $=id=>document.getElementById(id);\nlet weekStart=pragueMonday(),selectedHistoryDate=pragueToday(),state={};\nfunction esc(v){return String(v??\"\").replace(/[&<>\"']/g,m=>({\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",'\"':\"&quot;\",\"'\":\"&#39;\"}[m]))}\nfunction num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}\nfunction fmt(v,d=0){return Math.round(num(v)*10**d)/10**d}\nfunction dateShift(date,days){const p=date.split(\"-\").map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]+days)).toISOString().slice(0,10)}\nfunction pragueToday(){const p=new Intl.DateTimeFormat(\"en-GB\",{timeZone:\"Europe/Prague\",year:\"numeric\",month:\"2-digit\",day:\"2-digit\"}).formatToParts(new Date());return p.find(x=>x.type===\"year\").value+\"-\"+p.find(x=>x.type===\"month\").value+\"-\"+p.find(x=>x.type===\"day\").value}\nfunction pragueMonday(){const d=pragueToday().split(\"-\").map(Number),x=new Date(Date.UTC(d[0],d[1]-1,d[2])),wd=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-wd);return x.toISOString().slice(0,10)}\nfunction dateLabel(d){return new Intl.DateTimeFormat(\"cs-CZ\",{day:\"2-digit\",month:\"2-digit\"}).format(new Date(d+\"T12:00:00Z\"))}\nfunction longDate(d){return new Intl.DateTimeFormat(\"cs-CZ\",{weekday:\"long\",day:\"numeric\",month:\"numeric\"}).format(new Date(d+\"T12:00:00Z\"))}\nfunction hm(min){if(!Number.isFinite(Number(min)))return \"—\";return Math.floor(Number(min)/60)+\"h \"+Math.round(Number(min)%60)+\"m\"}\nfunction isNutritionItem(x){const n=String(x?.name||\"\").trim(),t=String(x?.type||\"\").trim();return /nutrition/i.test(n)||/^nutrition$/i.test(t)}\nfunction scoreClass(v){return v>=80?\"\":\" \"+(v>=60?\"mid\":\"low\")}\nfunction scoreBadge(v,label=\"Skóre\"){return '<span class=\"score'+scoreClass(v)+'\">'+label+\" \"+fmt(v)+\"%</span>\"}\nfunction trendArrow(current,previous,invert=false,unit=\"\"){\n  const a=Number(current),b=Number(previous);\n  if(!Number.isFinite(a)||!Number.isFinite(b)||a===b)return \"\";\n  const delta=a-b,good=invert?delta<0:delta>0,arrow=delta>0?\"↑\":\"↓\";\n  return '<div class=\"trend '+(good?\"good\":\"bad\")+'\">'+arrow+\" \"+(delta>0?\"+\":\"\")+fmt(delta,1)+\" \"+esc(unit)+'</div>';\n}\nfunction macroTargetsOf(d){\n  const m=d?.daily?.nutrition?.macros||d?.daily?.macros||d?.daily?.calories?.macros||{};\n  return {\n    protein:Number(m.protein_g ?? m.proteinGrams ?? d?.daily?.nutrition?.protein ?? 0),\n    carbs:Number(m.carbs_g ?? m.carbsGrams ?? 0),\n    fat:Number(m.fat_g ?? m.fatGrams ?? 0)\n  };\n}\nfunction nutritionScore(food,target){\n  const kcal=Number(food?.kcal||0),p=Number(food?.protein_g||0),c=Number(food?.carbs_g||0),f=Number(food?.fat_g||0);\n  if(kcal<=0 && p<=0 && c<=0 && f<=0) return null;\n  const vals=[[\"kcal\",target.calorieTarget],[\"protein_g\",target.macros?.protein],[\"carbs_g\",target.macros?.carbs],[\"fat_g\",target.macros?.fat]];\n  const scores=vals.filter(([,t])=>Number(t)>0).map(([k,t])=>Math.min(1,Number(food?.[k]||0)/Number(t)));\n  return scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100):null;\n}\nfunction macroChart(id,days){const svg=$(id),d=days.find(x=>x.date===pragueToday())||days[days.length-1];if(!d){svg.innerHTML='<text x=\"50%\" y=\"50%\" text-anchor=\"middle\" fill=\"#91a0b5\">Bez dat</text>';return;}const food=d.food?.totals||{},m=macroTargetsOf(d),items=[[\"Protein\",num(food.protein_g),num(m.protein),\"#60a5fa\"],[\"Sacharidy\",num(food.carbs_g),num(m.carbs),\"#f59e0b\"],[\"Tuk\",num(food.fat_g),num(m.fat),\"#a78bfa\"]],max=Math.max(1,...items.map(x=>Math.max(x[1],x[2]))),base=220,gw=210,bw=62,gap=20,left=100;let out='<text x=\"'+left+'\" y=\"16\" fill=\"#91a0b5\" font-size=\"10\">DNEŠNÍ PŘÍJEM VS. CÍL · g</text>';items.forEach((x,i)=>{const gx=left+i*gw,ah=x[1]/max*base,th=x[2]/max*base;out+='<rect x=\"'+(gx+bw+gap)+'\" y=\"'+(40+base-th)+'\" width=\"'+bw+'\" height=\"'+th+'\" rx=\"5\" fill=\"'+x[3]+'\" opacity=\".22\"/><rect x=\"'+gx+'\" y=\"'+(40+base-ah)+'\" width=\"'+bw+'\" height=\"'+ah+'\" rx=\"5\" fill=\"'+x[3]+'\"/><text x=\"'+(gx+bw/2)+'\" y=\"'+(40+base+20)+'\" text-anchor=\"middle\" fill=\"#d8e0ea\" font-size=\"11\">'+esc(x[0])+'</text><text x=\"'+(gx+bw/2)+'\" y=\"'+Math.max(30,40+base-ah-7)+'\" text-anchor=\"middle\" fill=\"#d8e0ea\" font-size=\"10\">'+fmt(x[1])+'</text><text x=\"'+(gx+bw+gap+bw/2)+'\" y=\"'+Math.max(30,40+base-th-7)+'\" text-anchor=\"middle\" fill=\"#91a0b5\" font-size=\"10\">'+fmt(x[2])+'</text>';});out+='<text x=\"100\" y=\"292\" fill=\"#d8e0ea\" font-size=\"10\">plné = příjem</text><text x=\"190\" y=\"292\" fill=\"#91a0b5\" font-size=\"10\">světlé = cíl</text><text x=\"650\" y=\"292\" fill=\"#91a0b5\" font-size=\"10\">Vybraný den: '+esc(longDate(d.date))+'</text>';svg.innerHTML=out;}\nfunction isoWeek(date){\n  const d=new Date(date+\"T12:00:00Z\"), th=new Date(d);\n  th.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));\n  const y=th.getUTCFullYear(), jan=new Date(Date.UTC(y,0,1));\n  return String(Math.ceil((((th-jan)/86400000)+1)/7)).padStart(2,\"0\");\n}\nfunction populateWeekSelectors(weekId,dayId,days){\n  const ws=$(weekId),ds=dayId?$(dayId):null;\n  if(!ws)return;\n  const opts=[];\n  for(let i=-12;i<=8;i++){\n    const d=dateShift(pragueMonday(),i*7);\n    opts.push('<option value=\"'+d+'\" '+(d===weekStart?\"selected\":\"\")+'>Týden '+isoWeek(d)+' · '+dateLabel(d)+'–'+dateLabel(dateShift(d,6))+'</option>');\n  }\n  ws.innerHTML=opts.join(\"\");\n  if(ds){\n    ds.innerHTML=days.map(x=>'<option value=\"'+x.date+'\" '+(x.date===selectedHistoryDate?\"selected\":\"\")+'>'+esc(longDate(x.date))+'</option>').join(\"\");\n    ds.onchange=()=>{selectedHistoryDate=ds.value;renderTraining();renderNutrition()};\n  }\n  ws.onchange=()=>{weekStart=ws.value;selectedHistoryDate=weekStart;load()};\n}\nfunction toast(msg){const t=$(\"toast\");t.textContent=msg;t.classList.add(\"show\");setTimeout(()=>t.classList.remove(\"show\"),2600)}\nasync function jsonFetch(path,options={}){const r=await fetch(path,{credentials:\"same-origin\",...options});const d=await r.json().catch(()=>({message:\"Invalid response\"}));if(!r.ok)throw new Error(d.message||\"HTTP \"+r.status);return d}\nfunction activate(view){document.querySelectorAll(\".navbtn\").forEach(b=>b.classList.toggle(\"active\",b.dataset.view===view));document.querySelectorAll(\".view\").forEach(v=>v.classList.toggle(\"active\",v.id===view))}\nfunction multiLineChart(id,series,labels,opts={}){const svg=$(id),W=opts.W||1000,H=opts.H||300,pad=40,all=series.flatMap(s=>s.values.map(Number).filter(Number.isFinite));if(!all.length){svg.innerHTML='<text x=\"50%\" y=\"50%\" text-anchor=\"middle\" fill=\"#91a0b5\">Bez dat</text>';return}let min=Math.min(...all),max=Math.max(...all);if(min===max){min-=1;max+=1}const x=i=>pad+(W-pad*2)*(labels.length<=1?.5:i/(labels.length-1)),y=v=>H-pad-(H-pad*2)*(v-min)/(max-min);let out='<line x1=\"'+pad+'\" y1=\"'+(H-pad)+'\" x2=\"'+(W-pad)+'\" y2=\"'+(H-pad)+'\" stroke=\"#24364d\"/>';for(let i=0;i<labels.length;i++){if(i===0||i===labels.length-1||i%Math.max(1,Math.floor(labels.length/6))===0)out+='<text x=\"'+x(i)+'\" y=\"'+(H-10)+'\" text-anchor=\"middle\" fill=\"#91a0b5\" font-size=\"10\">'+esc(labels[i])+'</text>'}series.forEach(s=>{const pts=[];s.values.forEach((v,i)=>{if(Number.isFinite(Number(v)))pts.push(x(i)+\",\"+y(Number(v)))});if(pts.length>1)out+='<polyline points=\"'+pts.join(\" \")+'\" fill=\"none\" stroke=\"'+s.stroke+'\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>'});let lx=pad;series.forEach(s=>{out+='<line x1=\"'+lx+'\" y1=\"16\" x2=\"'+(lx+18)+'\" y2=\"16\" stroke=\"'+s.stroke+'\" stroke-width=\"3\"/><text x=\"'+(lx+24)+'\" y=\"20\" fill=\"#91a0b5\" font-size=\"11\">'+esc(s.label)+'</text>';lx+=95+String(s.label).length*4});svg.innerHTML=out}\nfunction chartSvg(id,values,targets,labels,opts={}){const svg=$(id),W=opts.W||700,H=opts.H||250,pad=34,vals=values.map(v=>Number(v)).filter(Number.isFinite),tar=(targets||[]).map(v=>Number(v)).filter(Number.isFinite),all=vals.concat(tar);if(!all.length){svg.innerHTML='<text x=\"50%\" y=\"50%\" text-anchor=\"middle\" fill=\"#8d99aa\">Bez dat</text>';return}let min=Math.min(...all),max=Math.max(...all);if(min===max){min-=1;max+=1}const x=i=>pad+(W-pad*2)*(values.length<=1?.5:i/(values.length-1)),y=v=>H-pad-(H-pad*2)*(v-min)/(max-min);let out='<line x1=\"'+pad+'\" y1=\"'+(H-pad)+'\" x2=\"'+(W-pad)+'\" y2=\"'+(H-pad)+'\" stroke=\"#26303d\"/>';const pts=[];values.forEach((v,i)=>{if(Number.isFinite(Number(v))){pts.push(x(i)+\",\"+y(Number(v)));out+='<circle cx=\"'+x(i)+'\" cy=\"'+y(Number(v))+'\" r=\"3\" fill=\"#7c5cff\"/>'}if(labels[i])out+='<text x=\"'+x(i)+'\" y=\"'+(H-8)+'\" text-anchor=\"middle\" fill=\"#8d99aa\" font-size=\"10\">'+esc(labels[i])+'</text>'});if(pts.length>1)out+='<polyline points=\"'+pts.join(\" \")+'\" fill=\"none\" stroke=\"#7c5cff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>';if(targets?.length){const p=targets.map((v,i)=>Number.isFinite(Number(v))?x(i)+\",\"+y(Number(v)):null).filter(Boolean);if(p.length>1)out+='<polyline points=\"'+p.join(\" \")+'\" fill=\"none\" stroke=\"#34d399\" stroke-width=\"2\" stroke-dasharray=\"6 5\"/>'}svg.innerHTML=out}\nfunction barChart(id,values,targets,labels){const svg=$(id),W=700,H=250,pad=28,all=values.concat(targets||[]).map(num),max=Math.max(1,...all)*1.12,bw=(W-pad*2)/Math.max(1,values.length)*.58;let out=\"\";values.forEach((v,i)=>{const x=pad+i*(W-pad*2)/Math.max(1,values.length)+(W-pad*2)/Math.max(1,values.length)*.21,h=num(v)/max*(H-55),ht=num(targets?.[i])/max*(H-55);out+='<rect x=\"'+x+'\" y=\"'+(H-30-ht)+'\" width=\"'+bw+'\" height=\"'+ht+'\" rx=\"4\" fill=\"#34d399\" opacity=\".25\"/><rect x=\"'+x+'\" y=\"'+(H-30-h)+'\" width=\"'+bw+'\" height=\"'+h+'\" rx=\"4\" fill=\"#7c5cff\"/><text x=\"'+(x+bw/2)+'\" y=\"'+(H-9)+'\" text-anchor=\"middle\" fill=\"#8d99aa\" font-size=\"10\">'+esc(labels[i])+'</text>'});svg.innerHTML=out}\nfunction renderOverview(){\n  const d=state.daily||{},f=d.nutrition?.foodLog?.totals||{},target=d.nutrition||{};\n  $(\"overviewDate\").textContent=longDate(pragueToday());\n  const completed=(d.training?.completed||[]).filter(x=>!isNutritionItem(x));\n  const planned=(d.training?.planned||[]).filter(x=>!isNutritionItem(x));\n  const lastSleep=state.sleep?.sessions?.[0];\n  const sleepSessions=state.sleep?.sessions||[],sleepPrev=sleepSessions.slice(1,15).filter(x=>Number.isFinite(Number(x.durationMin))),sleepAvg=sleepPrev.length?sleepPrev.reduce((sum,x)=>sum+num(x.durationMin),0)/sleepPrev.length:null; $(\"oSleep\").innerHTML=lastSleep?hm(lastSleep.durationMin)+trendArrow(lastSleep.durationMin,sleepAvg,false,\" min vs avg\"):\"—\"; $(\"overviewSleepHistory\").innerHTML=sleepSessions.slice(0,7).map(x=>'<div class=\"metric-line\"><span>'+esc(longDate(x.date||String(x.endTime||\"\").slice(0,10)))+'</span><strong>'+hm(x.durationMin)+'</strong></div>').join(\"\")||'<div class=\"muted\">Žádná historie spánku.</div>';\n  $(\"oTraining\").textContent=completed.length+\" / \"+planned.length+\" dokončeno\";\n  $(\"oTrainingNote\").textContent=planned.length?planned.map(x=>x.name||x.type).join(\" • \"):\"Volno\";\n  const calTarget=Number(target.calorieTarget||d.calories?.target||0);\n  const score=nutritionScore({kcal:f.kcal,protein_g:f.protein_g,carbs_g:f.carbs_g,fat_g:f.fat_g},{calorieTarget:calTarget,macros:{protein:target.macros?.protein_g??target.macros?.proteinGrams,carbs:target.macros?.carbs_g??target.macros?.carbsGrams,fat:target.macros?.fat_g??target.macros?.fatGrams}});\n  $(\"oFood\").textContent=fmt(f.kcal)+\" / \"+fmt(calTarget)+\" kcal\";\n  $(\"oFoodNote\").innerHTML=(score==null?\"Zatím bez záznamu\":scoreBadge(score,\"Výživa\"));\n  const m=macroTargetsOf({daily:{nutrition:{macros:target.macros}}});\n  $(\"oMacros\").innerHTML='<div class=\"macro-line\"><b style=\"color:#60a5fa\">P</b><span>'+fmt(f.protein_g)+' / '+fmt(m.protein)+' g</span></div><div class=\"macro-line\"><b style=\"color:#f59e0b\">C</b><span>'+fmt(f.carbs_g)+' / '+fmt(m.carbs)+' g</span></div><div class=\"macro-line\"><b style=\"color:#a78bfa\">F</b><span>'+fmt(f.fat_g)+' / '+fmt(m.fat)+' g</span></div>';\n  const sleep=state.sleep?.sessions||[],last=sleep[0],prevSleep=sleep[1];\n  const sleepScore=last?Math.round(Math.min(100,Math.max(0,(num(last.durationMin)/480)*70+(num(last.stages?.DEEP)/90)*15+(num(last.stages?.REM)/90)*15))):null;\n  const todayPlanTss=planned.reduce((a,z)=>a+num(z.tss),0),todayActualTss=completed.reduce((a,z)=>a+num(z.tss),0);\n  const trainingScore=planned.length&&todayPlanTss?Math.round(Math.min(100,todayActualTss/todayPlanTss*100)):(completed.length?100:null);\n  const rs=sleep.slice(1,15).filter(x=>Number.isFinite(Number(x.durationMin)));const recoveryAvg=rs.length?rs.reduce((sum,x)=>sum+num(x.durationMin),0)/rs.length:null;$(\"oRecoverySleep\").innerHTML=(sleepScore==null?\"—\":sleepScore+\"%\")+trendArrow(last?.durationMin,recoveryAvg,false,\" min vs avg\");\n  $(\"oRecoveryTraining\").innerHTML=(trainingScore==null?\"—\":trainingScore+\"%\");\n  $(\"oRecoveryNote\").textContent=\"spánek · tréninková shoda\";\n  const today=pragueToday(),tomorrow=dateShift(today,1),days=state.week?.days||[];\n  const compact=days.filter(x=>x.date===today||x.date===tomorrow);\n  const renderPlanDay=x=>{\n    const p=(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z));\n    const a=(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z));\n    const items=p.map(z=>{const match=a.find(y=>String(y.pairedEventId||y.paired_event_id||\"\")===String(z.id||\"\"))||a.find(y=>Math.abs(num(y.tss)-num(z.tss))<=5&&String(y.name||\"\").toLowerCase().includes(String(z.name||\"\").toLowerCase().slice(0,12)));return {z,done:Boolean(match),actual:match};});\n    a.filter(y=>!p.some(z=>String(z.name||\"\").toLowerCase()===String(y.name||\"\").toLowerCase())).forEach(y=>items.push({z:y,done:true}));\n    return '<div class=\"plan-day '+(x.date===today?\"today\":\"\")+'\"><div class=\"dow\">'+esc(longDate(x.date))+'</div>'+ (items.length?items.map(({z,done,actual})=>'<div class=\"plan-item '+(done?\"done\":\"\")+'\"><div class=\"name\">'+esc(z.name||z.type||\"Aktivita\")+'</div><div class=\"meta\">'+(done?\"✓ Dokončeno\":\"Plán\")+(z.durationHours?\" · \"+fmt(z.durationHours,1)+\" h\":\"\")+(z.tss?\" · TSS \"+fmt(z.tss):\"\")+(done&&actual?\" · skutečně \"+fmt(actual.tss):\"\")+'</div></div>').join(\"\"):'<div class=\"muted\">Volno</div>')+'</div>';\n  };\n  $(\"overviewPlan\").innerHTML=compact.map(renderPlanDay).join(\"\");\n  $(\"overviewWeekPlan\").innerHTML=days.map(renderPlanDay).join(\"\");\n  const fw=state.fitness?.wellness||[],latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};\n  $(\"oFitness\").innerHTML=(Number.isFinite(Number(latest.ctl))?fmt(latest.ctl):\"—\")+trendArrow(latest.ctl,prev.ctl,false,\"\");\n  $(\"oForm\").innerHTML=(Number.isFinite(Number(latest.tsb))?fmt(latest.tsb):\"—\")+trendArrow(latest.tsb,prev.tsb,false,\"\");\n  const wr=(d.weight?.records||[]).filter(x=>x.value_numeric!=null).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time)));\n  const currentW=wr.length?Number(wr[wr.length-1].value_numeric):Number(d.weight?.current);\n  const weekW=wr.filter(x=>new Date(x.sample_time).getTime()<=Date.now()-7*86400000).slice(-1)[0];\n  const targetW=Number(d.nutrition?.targetWeightKg||80),remainingW=Number.isFinite(currentW)?currentW-targetW:null; $(\"oWeight\").innerHTML=Number.isFinite(currentW)?fmt(currentW,1)+\" kg\"+trendArrow(currentW,weekW?.value_numeric,true,\" kg vs 7d\"):\"—\"; $(\"oWeightMeta\").textContent=Number.isFinite(remainingW)?\"Aktuálně · cíl \"+fmt(targetW,1)+\" kg · zbývá \"+fmt(Math.max(0,remainingW),1)+\" kg\":\"aktuálně · cíl \"+fmt(targetW,1)+\" kg\";\n  chartSvg(\"calChart\",days.map(x=>num(x.food?.totals?.kcal)),days.map(x=>num(x.daily?.calories?.target)),days.map(x=>dateLabel(x.date)),{W:1000,H:260});\n}\nfunction renderTraining(){\n  const days=state.week?.days||[],fw=state.fitness?.wellness||[];\n  $(\"trainingRange\").textContent=\"Týden \"+isoWeek(weekStart)+\" · \"+dateLabel(weekStart)+\" – \"+dateLabel(dateShift(weekStart,6));\n  populateWeekSelectors(\"trainingWeekSelect\",null,days);\n  const selected=days.find(x=>x.date===pragueToday())||days[0];\n  const planned=days.flatMap(x=>(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z)).map(z=>({...z,date:x.date})));\n  const completed=days.flatMap(x=>(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z)).map(z=>({...z,date:x.date})));\n  $(\"trainingWeekOverview\").innerHTML=days.map(x=>{const p=(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z)),a=(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z)),pt=p.reduce((s,z)=>s+num(z.tss),0),at=a.reduce((s,z)=>s+num(z.tss),0),ph=p.reduce((s,z)=>s+num(z.durationHours),0),ah=a.reduce((s,z)=>s+num(z.durationHours),0);return '<div class=\"plan-day '+(x.date===pragueToday()?\"today\":\"\")+'\"><div class=\"dow\">'+esc(longDate(x.date))+'</div><div class=\"date\">'+(a.length?\"✓ \":\"\")+esc(p.map(z=>z.name||z.type).join(\" • \")||\"Volno\")+'</div><div class=\"meta\">TSS '+fmt(at)+' / '+fmt(pt)+' · '+fmt(ah,1)+' / '+fmt(ph,1)+' h</div></div>';}).join(\"\");\n  $(\"plannedList\").innerHTML=planned.length?planned.map(x=>'<div class=\"activity\"><strong>'+esc(longDate(x.date))+' · '+esc(x.name||\"Workout\")+'</strong><span class=\"small\">'+esc(x.type||\"\")+(x.durationHours?\" · \"+fmt(x.durationHours,1)+\" h\":\"\")+(x.tss?\" · TSS \"+fmt(x.tss):\"\")+'</span></div>').join(\"\"):'<div class=\"muted\">Nic plánováno.</div>';\n  $(\"completedList\").innerHTML=completed.length?completed.slice().reverse().map(x=>'<div class=\"activity\"><strong>'+esc(longDate(x.date))+' · '+esc(x.name||x.type||\"Activity\")+'</strong><span class=\"small\">'+esc(x.type||\"\")+(x.durationHours?\" · \"+fmt(x.durationHours,1)+\" h\":\"\")+(x.tss?\" · TSS \"+fmt(x.tss):\"\")+(x.calories?\" · \"+fmt(x.calories)+\" kcal\":\"\")+'</span></div>').join(\"\"):'<div class=\"muted\">Zatím nic dokončeno.</div>';\n  const latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};\n  $(\"tFitness\").innerHTML=(Number.isFinite(Number(latest.ctl))?fmt(latest.ctl):\"—\")+trendArrow(latest.ctl,prev.ctl,false,\"\");\n  $(\"tFatigue\").innerHTML=(Number.isFinite(Number(latest.atl))?fmt(latest.atl):\"—\")+trendArrow(latest.atl,prev.atl,true,\"\");\n  $(\"tForm\").innerHTML=(Number.isFinite(Number(latest.tsb))?fmt(latest.tsb):\"—\")+trendArrow(latest.tsb,prev.tsb,false,\"\");\n  $(\"tRamp\").innerHTML=(Number.isFinite(Number(latest.rampRate))?fmt(latest.rampRate,1):\"—\")+trendArrow(latest.rampRate,prev.rampRate,false,\"\");\n  const labels=fw.map(x=>dateLabel(String(x.id||\"\").slice(0,10)));\n  multiLineChart(\"pmcChart\",[{label:\"Fitness\",stroke:\"#3b82f6\",values:fw.map(x=>num(x.ctl))},{label:\"Fatigue\",stroke:\"#ef6b73\",values:fw.map(x=>num(x.atl))},{label:\"Form\",stroke:\"#35c48b\",values:fw.map(x=>num(x.tsb))}],labels,{W:1000,H:300});\n  const form=num(latest.tsb),ramp=num(latest.rampRate);\n  $(\"pmcInsight\").textContent=!Number.isFinite(form)?\"Bez aktuálních wellness dat.\":form<0?\"Form je záporný: zátěž je vyšší než dlouhodobá připravenost. Zaměř se na regeneraci a nepřidávej další intenzitu bez důvodu.\":ramp>5?\"Fitness roste rychleji. Sleduj kumulovanou únavu; další zvyšování objemu má smysl jen při stabilní regeneraci.\":\"Fitness/form jsou v relativně stabilním pásmu. Pokračuj podle plánu a sleduj vývoj TSB.\";\n  const tssDays=days.map(x=>{const p=(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z)),a=(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z));return {date:x.date,planned:p.reduce((s,z)=>s+num(z.tss),0),actual:a.reduce((s,z)=>s+num(z.tss),0)};});\n  barChart(\"tssChart\",tssDays.map(x=>x.actual),tssDays.map(x=>x.planned),tssDays.map(x=>dateLabel(x.date)));\n  const totalP=tssDays.reduce((s,x)=>s+x.planned,0),totalA=tssDays.reduce((s,x)=>s+x.actual,0);\n  $(\"tssInsight\").innerHTML=(totalP?scoreBadge(Math.min(100,Math.round(totalA/totalP*100)),\"Týden\"):\"Bez TSS plánu\")+\" · \"+fmt(totalA)+\" / \"+fmt(totalP)+\" TSS. <span class=\\\"muted\\\">Zelený sloupec = plán, modrý = skutečnost.</span>\";\n  const load=fw.slice(-42); chartSvg(\"loadChart\",load.map(x=>num(x.atlLoad||x.ctlLoad||0)),[],load.map(x=>dateLabel(String(x.id||\"\").slice(0,10))),{W:1000,H:250});\n  const totalHours=days.reduce((s,x)=>s+(x.daily?.training?.completed||[]).reduce((a,z)=>a+num(z.durationHours),0),0);\n  $(\"trainingSummary\").innerHTML='<div class=\"metric-line\"><span>Fitness</span><strong>'+fmt(latest.ctl)+trendArrow(latest.ctl,prev.ctl,false,\"\")+'</strong></div><div class=\"metric-line\"><span>Fatigue</span><strong>'+fmt(latest.atl)+trendArrow(latest.atl,prev.atl,true,\"\")+'</strong></div><div class=\"metric-line\"><span>Form</span><strong>'+fmt(latest.tsb)+trendArrow(latest.tsb,prev.tsb,false,\"\")+'</strong></div><div class=\"metric-line\"><span>TSS skutečnost / plán</span><strong>'+fmt(totalA)+' / '+fmt(totalP)+'</strong></div><div class=\"metric-line\"><span>Čas tento týden</span><strong>'+fmt(totalHours,1)+' h</strong></div>';\n  const selectedActs=(selected?.daily?.training?.completed||[]).filter(x=>!isNutritionItem(x));\n  $(\"trainingActivityTable\").innerHTML='<div class=\"notice\" style=\"margin-bottom:8px\">Vybraný den: <strong>'+esc(selected?longDate(selected.date):\"—\")+'</strong></div>'+(selectedActs.length?'<div class=\"scroll\"><table><thead><tr><th>Aktivita</th><th>Typ</th><th>TSS</th><th>Délka</th><th>Dokončení</th></tr></thead><tbody>'+selectedActs.map(x=>{const p=(selected?.daily?.training?.planned||[]).find(z=>!isNutritionItem(z)&&(String(x.pairedEventId||\"\")===String(z.id||\"\")||String(z.name||\"\").toLowerCase().slice(0,12)===String(x.name||\"\").toLowerCase().slice(0,12)));const ratio=p&&num(p.tss)>0?Math.round(num(x.tss)/num(p.tss)*100):(p&&num(p.durationHours)>0?Math.round(num(x.durationHours)/num(p.durationHours)*100):100);return '<tr><td>'+esc(x.name||x.type||\"Aktivita\")+'</td><td>'+esc(x.type||\"\")+'</td><td>'+fmt(x.tss)+'</td><td>'+fmt(x.durationHours,1)+' h</td><td>'+scoreBadge(ratio)+'</td></tr>'}).join(\"\")+'</tbody></table></div>':'<div class=\"muted\">Vybraný den nemá dokončenou aktivitu.</div>');\n}\nfunction renderNutrition(){\n  const days=state.week?.days||[];\n  $(\"nutritionRange\").textContent=\"Týden \"+isoWeek(weekStart)+\" · \"+dateLabel(weekStart)+\" – \"+dateLabel(dateShift(weekStart,6));\n  populateWeekSelectors(\"nutritionWeekSelect\",null,days);\n  const today=days.find(x=>x.date===pragueToday())||days[days.length-1];\n  $(\"nutritionReason\").textContent=today?.daily?.nutrition?.reason||\"Denní cíl se adaptuje podle tréninku, hmotnosti a cíle.\";\n  const tn=today?.daily?.nutrition||{},cb=tn.calorieBreakdown||{},targetCal=num(tn.calorieTarget||today?.daily?.calories?.target),trainingCal=Math.max(0,num(cb.activityAdjustment));$(\"nutritionTargetSummary\").innerHTML='<strong>Dnešní cíl: '+fmt(targetCal)+' kcal</strong> · základ '+fmt(Math.max(0,num(cb.baselineRestTDEE)-num(cb.weightLossDeficit)))+' kcal + '+fmt(trainingCal)+' kcal z tréninku − deficit '+fmt(cb.weightLossDeficit)+' kcal. <span class=\"muted\">Tréninkový výdej je součástí cíle, ne navíc.</span>';  $(\"nutritionDays\").innerHTML=days.map(x=>{\n    const t=num(x.daily?.calories?.target),e=num(x.food?.totals?.kcal),m=macroTargetsOf(x);\n    const p=num(x.food?.totals?.protein_g),c=num(x.food?.totals?.carbs_g),f=num(x.food?.totals?.fat_g);\n    const score=nutritionScore({kcal:e,protein_g:p,carbs_g:c,fat_g:f},{calorieTarget:t,macros:m});\n    return '<div class=\"day '+(x.date===pragueToday()?\"today\":\"\")+'\"><div class=\"dayhead\">'+esc(longDate(x.date))+' '+(score==null?'<span class=\"pill\">Bez záznamu</span>':scoreBadge(score))+'</div><div class=\"value\" style=\"font-size:20px\">'+fmt(e)+' / '+fmt(t)+' kcal</div><div class=\"bar\"><i style=\"width:'+Math.min(100,t?e/t*100:0)+'%\"></i></div><div class=\"macro-lines\"><div class=\"macro-line\"><b style=\"color:#60a5fa\">Protein</b><span>'+fmt(p)+' / '+fmt(m.protein)+' g</span></div><div class=\"macro-line\"><b style=\"color:#f59e0b\">Sacharidy</b><span>'+fmt(c)+' / '+fmt(m.carbs)+' g</span></div><div class=\"macro-line\"><b style=\"color:#a78bfa\">Tuk</b><span>'+fmt(f)+' / '+fmt(m.fat)+' g</span></div></div></div>';\n  }).join(\"\");\n  macroChart(\"nutritionChart\",days);\n\n  const selected=today;\n  const mealGroups=selected?.recommendations?.mealRecommendations||[];\n  const stores=selected?.recommendations?.storeAlternatives||[];\n  const remKcal=Math.max(0,targetCal-num(selected?.food?.totals?.kcal)),rem=selected?.recommendations?.remaining||{};\n  $(\"foodPlan\").innerHTML=selected?'<div class=\"reason\"><strong>Zbývá '+fmt(remKcal)+' kcal</strong> · P '+fmt(rem.protein_g)+' g · C '+fmt(rem.carbs_g)+' g · F '+fmt(rem.fat_g)+' g<br>'+esc(selected.recommendations?.coaching||\"Doporučení se přepočítává podle toho, co už jsi snědl.\")+'</div>'+\n    (mealGroups.length?mealGroups.map(group=>'<div style=\"margin-top:12px\"><h3 style=\"margin-bottom:6px\">'+esc(group.label)+'</h3>'+\n      (group.recommendations?.length?group.recommendations.slice(0,3).map(r=>'<div class=\"foodrow\"><div><strong>'+esc(r.name||r.title||\"Jídlo\")+'</strong><div class=\"small\">'+esc(r.recommendation_reason||\"\")+'</div><div class=\"small\">1 porce · '+fmt(r.kcal||r.calories)+' kcal · P '+fmt(r.protein_g)+' · C '+fmt(r.carbs_g)+' · F '+fmt(r.fat_g)+'</div></div><div class=\"right\">'+scoreBadge(Math.min(100,Math.max(0,Number(r.recommendation_score||0))))+'</div></div>').join(\"\"):'<div class=\"muted\">Pro tuto část dne nemám vhodný recept.</div>')+'</div>').join(\"\"):'<div class=\"muted\">Dnešní zbývající jídla jsou pokrytá.</div>')+\n    (stores.length?'<details style=\"margin-top:12px\"><summary>Alternativa z běžného obchodu</summary>'+stores.slice(0,4).map(r=>'<div class=\"foodrow\"><div><strong>'+esc(r.name)+'</strong><div class=\"small\">'+esc(r.reason||\"\")+'</div></div><div class=\"right\">'+fmt(r.kcal)+' kcal</div></div>').join(\"\")+'</details>':''):'—';\n\n  const nr=state.nutrition?.records||[];\n  const selectedFoods=nr.filter(x=>String(x.startTime||\"\").slice(0,10)===String(selected?.date||\"\"));\n  $(\"nutritionInfo\").textContent=selectedFoods.length+\" záznamů z Google Health pro \"+(selected?.date||\"vybraný den\");\n  $(\"nutritionRows\").innerHTML=(selectedFoods.length?selectedFoods.slice().sort((a,b)=>String(b.startTime).localeCompare(String(a.startTime))).map(x=>'<tr><td>'+esc(x.startTime?new Date(x.startTime).toLocaleString(\"cs-CZ\"):\"—\")+'</td><td>'+esc(x.foodDisplayName||\"—\")+'</td><td>'+esc(x.mealType||\"—\")+'</td><td>'+fmt(x.kcal)+'</td><td>'+fmt(x.protein_g,1)+' g</td><td>'+fmt(x.carbs_g,1)+' g</td><td>'+fmt(x.fat_g,1)+' g</td></tr>').join(\"\"):'<tr><td colspan=\"7\">Pro vybraný den bez Google Health záznamu.</td></tr>');\n}\nfunction renderRecovery(){\n  const ss=state.sleep?.sessions||[],last=ss[0],range=Number($(\"sleepRange\")?.value||30);\n  const filtered=ss.filter(x=>{const t=new Date(x.endTime||x.startTime||0).getTime();return range>=3000||t>=Date.now()-range*86400000;});\n  $(\"rLast\").textContent=last?hm(last.durationMin):\"—\";\n  $(\"rLastMeta\").textContent=last?(last.startTime?new Date(last.startTime).toLocaleTimeString(\"cs-CZ\",{hour:\"2-digit\",minute:\"2-digit\"}):\"\")+\" → \"+(last.endTime?new Date(last.endTime).toLocaleTimeString(\"cs-CZ\",{hour:\"2-digit\",minute:\"2-digit\"}):\"\"):\"\";\n  const avg=filtered.length?filtered.reduce((a,x)=>a+num(x.durationMin),0)/filtered.length:0;\n  $(\"rAvg\").textContent=avg?hm(avg):\"—\";\n  $(\"rAvgLabel\").textContent=range>=3000?\"all time\":range===365?\"poslední rok\":range===180?\"posledních 6 měsíců\":range===30?\"poslední měsíc\":\"posledních 7 dní\";\n  $(\"rDeep\").textContent=last?.stages?.DEEP?hm(last.stages.DEEP):\"—\"; $(\"rRem\").textContent=last?.stages?.REM?hm(last.stages.REM):\"—\";\n  const sleepScore=last?Math.round(Math.min(100,Math.max(0,(num(last.durationMin)/480)*70+(num(last.stages?.DEEP)/90)*15+(num(last.stages?.REM)/90)*15))):null;\n  $(\"sleepScore\").innerHTML=sleepScore!=null?scoreBadge(sleepScore,\"Kvalita\"):'<span class=\"muted\">Bez dat</span>';\n  chartSvg(\"sleepChart\",filtered.slice().reverse().map(x=>num(x.durationMin)/60),[],filtered.slice().reverse().map(x=>dateLabel(x.date)),{W:700,H:250});\n  const selected=last;\n  if(selected){\n    const total=Object.values(selected.stages||{}).reduce((a,b)=>a+num(b),0)||1;\n    $(\"sleepStages\").innerHTML='<div class=\"metric-line\"><span>Deep</span><strong>'+hm(selected.stages?.DEEP)+'</strong></div><div class=\"sleep-stage\"><i class=\"stage-deep\" style=\"width:'+num(selected.stages?.DEEP)/total*100+'%\"></i></div><div class=\"metric-line\"><span>REM</span><strong>'+hm(selected.stages?.REM)+'</strong></div><div class=\"sleep-stage\"><i class=\"stage-rem\" style=\"width:'+num(selected.stages?.REM)/total*100+'%\"></i></div><div class=\"metric-line\"><span>Light</span><strong>'+hm(selected.stages?.LIGHT)+'</strong></div><div class=\"sleep-stage\"><i class=\"stage-light\" style=\"width:'+num(selected.stages?.LIGHT)/total*100+'%\"></i></div><div class=\"metric-line\"><span>Awake</span><strong>'+hm(selected.stages?.AWAKE)+'</strong></div><div class=\"sleep-stage\"><i class=\"stage-awake\" style=\"width:'+num(selected.stages?.AWAKE)/total*100+'%\"></i></div>';\n   } else { $(\"sleepStages\").innerHTML='<div class=\"muted\">Bez dat.</div>'; }\n  $(\"sleepRows\").innerHTML=ss.map(x=>'<tr><td>'+esc(x.date||\"—\")+'</td><td>'+esc(x.startTime?new Date(x.startTime).toLocaleTimeString(\"cs-CZ\",{hour:\"2-digit\",minute:\"2-digit\"}):\"—\")+'</td><td>'+esc(x.endTime?new Date(x.endTime).toLocaleTimeString(\"cs-CZ\",{hour:\"2-digit\",minute:\"2-digit\"}):\"—\")+'</td><td>'+hm(x.durationMin)+'</td><td>'+hm(x.stages?.DEEP)+'</td><td>'+hm(x.stages?.REM)+'</td><td>'+hm(x.stages?.LIGHT)+'</td><td>'+hm(x.stages?.AWAKE)+'</td></tr>').join(\"\")||'<tr><td colspan=\"8\">Bez dat.</td></tr>';\n}\nfunction renderHealth(){const w=state.weight||{};$(\"hWeight\").textContent=fmt(w.latest?.value_numeric,1);$(\"hAvg7\").textContent=fmt(w.average7d,1);$(\"hAvg30\").textContent=fmt(w.average30d,1);$(\"hActivities\").textContent=state.activities?.count||0;const wr=(w.records||[]).slice(-365);chartSvg(\"healthWeightChart\",wr.map(x=>num(x.value_numeric)),[],wr.map(x=>dateLabel(String(x.sample_time).slice(0,10))));const acts=(state.activities?.activities||[]).slice(0,30);$(\"healthActivityTable\").innerHTML=acts.length?'<div class=\"scroll\"><table><thead><tr><th>Datum</th><th>Aktivita</th><th>Typ</th><th>Zdroj</th></tr></thead><tbody>'+acts.map(x=>{let p={};try{p=JSON.parse(x.payload_json||\"{}\")}catch{}const e=p.exercise||{};return '<tr><td>'+esc(String(x.start_time||\"\").slice(0,16).replace(\"T\",\" \"))+'</td><td>'+esc(p.name||p.title||e.displayName||e.exerciseType||\"Activity\")+'</td><td>'+esc(p.type||p.category||e.exerciseType||\"\")+'</td><td>'+esc(x.source_family===\"intervals\"?\"Intervals.icu\":\"Google Health\")+'</td></tr>'}).join(\"\")+'</tbody></table></div>':'<div class=\"muted\">Žádné aktivity.</div>'}\nlet gymSaveQueue=Promise.resolve();\nfunction gymRowValues(tr){const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]),idx=Number(tr.dataset.row)+7;if(!values[idx])values[idx]=[];tr.querySelectorAll(\"input[data-col]\").forEach(inp=>{const c=Number(inp.dataset.col);values[idx][c]=inp.type===\"checkbox\"?(inp.checked?\"TRUE\":\"FALSE\"):inp.value;});return {values,idx};}\nfunction persistGymRow(tr){const {values}=gymRowValues(tr),used=values.slice(7);while(used.length&&used[used.length-1].every(v=>String(v??\"\").trim()===\"\"))used.pop();gymSaveQueue=gymSaveQueue.then(async()=>{const result=await jsonFetch(\"/app/api/gym\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({values:used})});state.gym={...state.gym,values:used,history:result.history||state.gym?.history||[]};$(\"gymNotice\").textContent=result.status===\"error\"?\"Uložení do databáze selhalo: \"+(result.message||\"neznámá chyba\"):\"✓ Zapsáno do interní databáze · \"+new Date().toLocaleTimeString(\"cs-CZ\");});return gymSaveQueue.catch(e=>{$(\"gymNotice\").textContent=\"Uložení selhalo: \"+e.message;throw e;});}\nfunction renderGymHistory(history){const grouped={};(history||[]).forEach(x=>{const d=x.workout_date||x.date||String(x.started_at||\"\").slice(0,10)||\"—\";(grouped[d]||(grouped[d]=[])).push(x);});const ds=Object.keys(grouped).sort().reverse().slice(0,20);$(\"gymHistory\").innerHTML=ds.map(d=>'<div class=\"history-workout\"><strong>'+esc(longDate(d))+'</strong><div class=\"history-sets\">'+grouped[d].slice(0,20).map(x=>'<div class=\"history-set\">'+esc(x.exercise||\"Cvik\")+' · '+esc(String(x.actualKg??x.weightKg??\"—\"))+' kg × '+esc(String(x.actualReps??x.reps??\"—\"))+'</div>').join(\"\")+'</div></div>').join(\"\")||'<div class=\"muted\">Historie zatím neobsahuje dokončené série.</div>';}\nfunction renderGym(){const values=state.gym?.values||[];const rows=values.slice(7).filter(r=>r.some(v=>String(v??\"\").trim()!==\"\"));$(\"gymMeta\").textContent=(values[2]?.[1]||\"Dnešní silový trénink\")+\" · \"+pragueToday();$(\"gymNotice\").textContent=rows.length?rows.filter(r=>String(r[0]||\"\")===\"WORK\").length+\" pracovních řádků · dokončené série se ukládají do interní databáze\":\"Dnešní sheet je prázdný. Můžeš vygenerovat plán.\";const start=values.slice(7).findIndex(r=>r.some(v=>String(v??\"\").trim()!==\"\"));const actualRows=start<0?[]:values.slice(7+start);$(\"gymRows\").innerHTML=actualRows.map((r,i)=>{const idx=i+(start<0?0:start),type=r[0]||\"\",exercise=r[1]||\"\";const rawVideo=state.gym?.videoLinks?.[idx+7]||r[10]||\"\";const formula=String(rawVideo);const formulaUrl=formula.match(/HYPERLINK\\(\\s*\"([^\"]+)\"/i)?.[1]||\"\";const video=/^https?:\\/\\//i.test(formula)?formula:formulaUrl||(\"https://www.youtube.com/results?search_query=\"+encodeURIComponent(String(exercise||\"\")+\" exercise technique\"));return '<tr data-row=\"'+idx+'\"><td><span class=\"gym-type\">'+esc(type)+'</span></td><td><strong>'+esc(exercise)+'</strong></td><td>'+esc(r[2]||\"\")+'</td><td>'+esc(r[3]||\"\")+'</td><td>'+esc(r[4]||\"\")+'</td><td><input data-col=\"5\" value=\"'+esc(r[5]||\"\")+'\" inputmode=\"decimal\"></td><td><input data-col=\"6\" value=\"'+esc(r[6]||\"\")+'\" inputmode=\"numeric\"></td><td><input data-col=\"7\" value=\"'+esc(r[7]||\"\")+'\" inputmode=\"decimal\"></td><td><input data-col=\"8\" type=\"checkbox\" '+(String(r[8]).toUpperCase()===\"TRUE\"||r[8]===true?\"checked\":\"\")+'></td><td><a href=\"'+esc(video)+'\" target=\"_blank\" rel=\"noopener noreferrer\">▶ Video</a></td></tr>'}).join(\"\")||'<tr><td colspan=\"10\" class=\"muted\">Žádný plán.</td></tr>'}\nasync function loadGym(){state.gym=await jsonFetch(\"/app/api/gym\");renderGym();renderGymHistory(state.gym.history||[])}\nasync function saveGym(){const b=$(\"saveGym\");b.disabled=true;b.textContent=\"Saving…\";try{for(const tr of document.querySelectorAll(\"#gymRows tr[data-row]\"))await persistGymRow(tr);toast(\"Workout saved\");}catch(e){toast(\"Save selhal: \"+e.message)}finally{b.disabled=false;b.textContent=\"Save workout\"}}\nasync function generateGym(){const b=$(\"generateGym\");b.disabled=true;b.textContent=\"Generating…\";try{await jsonFetch(\"/app/api/gym/generate\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({date:pragueToday()})});toast(\"Today's plan generated\");await loadGym()}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent=\"Generate today's plan\"}}\nwindow.addEventListener(\"error\",e=>{try{toast(\"Chyba aplikace: \"+(e.error?.message||e.message||\"neznámá chyba\"))}catch{}});\nwindow.addEventListener(\"unhandledrejection\",e=>{try{toast(\"Chyba aplikace: \"+(e.reason?.message||String(e.reason||\"Promise rejected\")))}catch{}});\nasync function load(){ $(\"topStatus\").textContent=\"Načítám…\"; const end=dateShift(weekStart,6); const jobs=[[\"daily\",\"/app/api/daily\"],[\"fitness\",\"/app/api/fitness?days=90\"],[\"week\",\"/app/api/week?start=\"+weekStart],[\"weight\",\"/app/api/weight\"],[\"activities\",\"/app/api/activities\"],[\"nutrition\",\"/app/api/nutrition?start=\"+weekStart+\"&end=\"+dateShift(end,1)],[\"sleep\",\"/app/api/sleep?start=\"+dateShift(pragueToday(),-365)+\"&end=\"+dateShift(pragueToday(),1)],[\"gym\",\"/app/api/gym\"]]; const results=await Promise.allSettled(jobs.map(([,url])=>jsonFetch(url))); state={...state}; let failed=0; results.forEach((r,i)=>{const key=jobs[i][0]; if(r.status===\"fulfilled\") state[key]=r.value; else {failed++; state[key]={status:\"error\",message:r.reason?.message||\"Načtení selhalo\"};}}); try{renderOverview();}catch{} try{renderTraining();}catch{} try{renderNutrition();}catch{} try{renderRecovery();}catch{} try{renderHealth();}catch{} try{renderGym();}catch{} $(\"topStatus\").textContent=failed===0?\"Live · \"+new Date().toLocaleTimeString(\"cs-CZ\"):(failed<jobs.length?\"Částečně načteno\":\"Data unavailable\"); $(\"topStatus\").className=failed===0?\"status-label small\":failed<jobs.length?\"status-label small status-partial\":\"status-label small status-error\"; if(failed) toast(\"Některá datová služba není dostupná.\");}\ndocument.querySelectorAll(\".navbtn\").forEach(b=>b.onclick=()=>activate(b.dataset.view));\n$(\"refresh\").onclick=async()=>{const b=$(\"refresh\");b.disabled=true;b.textContent=\"Syncing…\";try{const r=await jsonFetch(\"/app/api/sync\",{method:\"POST\"});toast(r.status===\"accepted\"?\"Synchronizace běží na pozadí. Kontroluji nová data…\":\"Data synchronized\");let n=0;const poll=()=>{n++;b.textContent=n<4?\"Syncing…\":\"Refreshing…\";load();if(n<4)setTimeout(poll,4500);else{b.disabled=false;b.textContent=\"Refresh\"}};setTimeout(poll,3000)}catch(e){toast(\"Sync selhal: \"+e.message);b.disabled=false;b.textContent=\"Refresh\"}};\n$(\"prevWeek\").onclick=()=>{weekStart=dateShift(weekStart,-7);selectedHistoryDate=weekStart;load()};\n$(\"nextWeek\").onclick=()=>{weekStart=dateShift(weekStart,7);selectedHistoryDate=weekStart;load()};\n$(\"thisWeek\").onclick=()=>{weekStart=pragueMonday();selectedHistoryDate=weekStart;load()};\n$(\"saveGym\").onclick=saveGym;$(\"generateGym\").onclick=generateGym;\n$(\"gymRows\").addEventListener(\"change\",e=>{if(e.target.matches(\"input[data-col]\")){const tr=e.target.closest(\"tr[data-row]\");if(tr)persistGymRow(tr).catch(()=>{});}});\n$(\"gymRows\").addEventListener(\"input\",e=>{if(e.target.matches(\"input[data-col]:not([type=checkbox])\")){const tr=e.target.closest(\"tr[data-row]\");if(!tr)return;clearTimeout(tr._saveTimer);tr._saveTimer=setTimeout(()=>persistGymRow(tr).catch(()=>{}),700);}});\n\n$(\"sleepRange\").onchange=renderRecovery;\nload();", { status: 200, headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" } });
    if (url.pathname === "/app/login" && request.method === "POST") return handleDashboardLogin(request, env);
    if (url.pathname === "/app/logout" && request.method === "POST") return handleDashboardLogout();
    if (url.pathname.startsWith("/app/api/")) return handleDashboardApi(request, env, ctx, url);
    if (url.pathname === "/" && request.method === "GET") return homepagePage();
    if (url.pathname === "/privacy" && request.method === "GET") return privacyPage();
    if (url.pathname === "/terms" && request.method === "GET") return policyPage("Terms of Use", `Health & Strength is provided for personal training organization and planning. You are responsible for the accuracy of connected data and for deciding whether a generated workout is appropriate for you. The app does not provide medical diagnosis or emergency care. Use of the app requires authorization to the connected health-api service.`);
    if (url.pathname === "/support" && request.method === "GET") return policyPage("Support", `Support for Health & Strength is provided through the project repository and its maintainer. Include the affected tool name, approximate time, and non-sensitive error message when reporting a problem. Never include API keys, OAuth refresh tokens, or other secrets in a support request.`);
    if (url.pathname === "/logo.svg" && request.method === "GET") return logoResponse();
    if (url.pathname === "/openapi.json" && request.method === "GET") {
      const response = await fetch(OPENAPI_URL, { cf: { cacheTtl: 60 } });
      if (!response.ok) return new Response(JSON.stringify({ status: "error", message: "OpenAPI schema unavailable" }), { status: 502, headers: { "content-type": "application/json" } });
      const text = await response.text();
      return new Response(text, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
    }
    return app.fetch(request, env, ctx);
  }
};

async function handleDashboardLogin(request, env) {
  const expected = String(env.STRENGTH_API_KEY || "");
  if (!expected) return Response.json({status:"error",message:"Dashboard authentication is not configured."},{status:503});
  const body = await request.json().catch(() => ({}));
  const key = String(body?.key || "");
  if (!key || key !== expected) return Response.json({status:"error",message:"Invalid dashboard access key."},{status:401});
  const exp = Math.floor(Date.now()/1000) + 30*24*60*60;
  const payload = base64url(new TextEncoder().encode(JSON.stringify({exp})));
  const signature = await dashboardHmac(payload, expected);
  const cookie = "pfd_session="+payload+"."+signature+"; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax";
  return Response.json({status:"ok",expiresAt:new Date(exp*1000).toISOString()},{headers:{"Set-Cookie":cookie,"Cache-Control":"no-store"}});
}
async function handleDashboardLogout() {
  return new Response(JSON.stringify({status:"ok"}),{status:200,headers:{"content-type":"application/json; charset=utf-8","Set-Cookie":"pfd_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax","Cache-Control":"no-store"}});
}
async function verifyDashboardSession(request, secret) {
  if (!secret) return false;
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.split(";").map(x=>x.trim()).find(x=>x.startsWith("pfd_session="));
  if (!match) return false;
  const token = match.slice("pfd_session=".length);
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0,dot), sig = token.slice(dot+1);
  const expected = await dashboardHmac(payload, secret);
  if (!timingSafeEqualString(sig, expected)) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    return Number(data?.exp) > Math.floor(Date.now()/1000);
  } catch { return false; }
}
async function newDashboardSessionCookie(secret) {
  const exp = Math.floor(Date.now()/1000) + 30*24*60*60;
  const payload = base64url(new TextEncoder().encode(JSON.stringify({exp})));
  const signature = await dashboardHmac(payload, secret);
  return "pfd_session="+payload+"."+signature+"; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax";
}
async function dashboardHmac(value, secret) {
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig = await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return base64url(new Uint8Array(sig));
}
function timingSafeEqualString(a,b) {
  if (a.length !== b.length) return false;
  let x=0; for(let i=0;i<a.length;i++) x |= a.charCodeAt(i)^b.charCodeAt(i); return x===0;
}
function base64url(bytes) {
  let s=""; for(const b of bytes) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromBase64url(s) {
  s=s.replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4)s+="=";
  const bin=atob(s); return Uint8Array.from(bin,c=>c.charCodeAt(0));
}

async function handleDashboardApi(request, env, ctx, url) {
  const internalAuth = { "Authorization": "Bearer " + String(env.STRENGTH_API_KEY || "") };

  if (url.pathname === "/app/api/nutrition/log" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const entries = Array.isArray(body?.entries) ? body.entries : [body];
      if (!entries.length) return Response.json({status:"error",message:"entries is required"},{status:400});
      const results = [];
      for (const entry of entries) {
        const foodBody = {
          date: entry.date || null,
          consumed_at: entry.consumed_at || null,
          name: entry.name || "Manual entry",
          kcal: Number(entry.kcal || 0),
          protein_g: Number(entry.protein_g || 0),
          carbs_g: Number(entry.carbs_g || 0),
          fat_g: Number(entry.fat_g || 0),
          fiber_g: Number(entry.fiber_g || 0),
          source: entry.source || "dashboard",
          note: entry.note || null
        };
        const foodResponse = await app.fetch(new Request(new URL("/food/log", request.url), {
          method:"POST",
          headers:{...internalAuth,"Content-Type":"application/json"},
          body:JSON.stringify(foodBody)
        }), env, ctx);
        const foodResult = await foodResponse.json().catch(()=>({}));
        if (!foodResponse.ok) throw new Error(foodResult.message || "Food log write failed");
        let googleResult=null;
        if (entry.google !== false) {
          const nutritionResponse = await app.fetch(new Request(new URL("/health/nutrition/log", request.url), {
            method:"POST",
            headers:{...internalAuth,"Content-Type":"application/json"},
            body:JSON.stringify({
              consumed_at: entry.consumed_at || null,
              name: entry.name || "Food",
              mealType: entry.mealType || "SNACK",
              kcal: Number(entry.kcal || 0),
              protein_g: Number(entry.protein_g || 0),
              carbs_g: Number(entry.carbs_g || 0),
              fat_g: Number(entry.fat_g || 0),
              servings: Number(entry.servings || 1)
            })
          }), env, ctx);
          googleResult=await nutritionResponse.json().catch(()=>({}));
          if (!nutritionResponse.ok) throw new Error(googleResult.message || "Google Health nutrition write failed");
        }
        results.push({food:foodResult,google:googleResult});
      }
      return Response.json({status:"ok",count:results.length,results},{headers:{"Cache-Control":"no-store"}});
    } catch (error) {
      return Response.json({status:"error",message:error.message},{status:500});
    }
  }

  if (url.pathname === "/app/api/fitness" && request.method === "GET") {
    try {
      const days = Math.max(42, Math.min(180, Number(url.searchParams.get("days") || 90)));
      const newest = new Date();
      const oldest = new Date(newest.getTime() - days * 86400000);
      const isoDate = d => d.toISOString().slice(0,10);
      const apiKey = String(env.INTERVALS_API_KEY || "");
      if (!apiKey) return Response.json({status:"error",message:"INTERVALS_API_KEY is not configured"},{status:503});
      const auth = "Basic " + btoa("API_KEY:" + apiKey);
      const target = "https://intervals.icu/api/v1/athlete/0/wellness?oldest="+encodeURIComponent(isoDate(oldest))+"&newest="+encodeURIComponent(isoDate(newest));
      const response = await fetch(target,{headers:{Authorization:auth,Accept:"application/json"}});
      const data = await response.json().catch(()=>[]);
      if (!response.ok) return Response.json({status:"error",message:"Intervals wellness HTTP "+response.status,data},{status:response.status});
      const wellness = (Array.isArray(data)?data:[]).map(x=>({...x,tsb:Number.isFinite(Number(x.ctl))&&Number.isFinite(Number(x.atl))?Number(x.ctl)-Number(x.atl):null})).filter(x=>x.id).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      return Response.json({status:"ok",source:"intervals.icu",days,wellness},{headers:{"Cache-Control":"no-store"}});
    } catch (error) {
      return Response.json({status:"error",message:error.message},{status:502});
    }
  }

  if (url.pathname === "/app/api/sync" && request.method === "POST") {
    const internal = new URL("/sync/all", request.url);
    ctx.waitUntil(
      app.fetch(new Request(internal, { method:"GET", headers: internalAuth }), env, ctx)
        .then(async response => { if (!response.ok) console.error("Dashboard background sync failed", response.status, await response.text()); })
        .catch(error => console.error("Dashboard background sync failed", error))
    );
    return Response.json({status:"accepted",message:"Background synchronization started"},{status:202,headers:{"Cache-Control":"no-store"}});
  }

  if (url.pathname === "/app/api/gym") {
    if (request.method === "GET") {
      let data={status:"ok",values:[],videoLinks:{}};
      let responseStatus=200;
      try {
        const internal = new URL("/strength/sheet/today", request.url);
        const response = await app.fetch(new Request(internal, { method:"GET", headers: internalAuth }), env, ctx);
        data = await response.json().catch(() => ({status:"error",message:"Invalid response"}));
        responseStatus = response.status;
      } catch(error) {
        console.error("Gym sheet plan read failed",error);
        data={status:"partial",values:[],videoLinks:{},message:"Dnešní plán ze Sheets není dostupný."};
        responseStatus=200;
      }
      let history=[];
      try { history=await getStrengthHistory(env.DB,500); } catch(error) { console.error("Gym history read failed",error); }
      return Response.json({...data,history,storage:"d1"},{ status: responseStatus, headers: {"Cache-Control":"no-store"} });
    }
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const values = Array.isArray(body?.values) ? body.values : null;
      if (!values) return Response.json({status:"error",message:"values must be a 2D array"}, {status:400});

      const date = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      const sets = values.map((r,i)=>({
        type:String(r?.[0]||"WORK").toUpperCase(),
        exercise:r?.[1]||"",
        setNo:r?.[2],
        plannedKg:r?.[3],
        plannedReps:r?.[4],
        actualKg:r?.[5],
        actualReps:r?.[6],
        rpe:r?.[7],
        completed:["TRUE","true","1","ANO","ano","✓","☑"].includes(String(r?.[8]??"")),
        note:r?.[9]||""
      })).filter(x=>x.exercise && /^(WARMUP|WORK)$/.test(x.type) && x.completed);

      let historyResult=null;
      if(sets.length) {
        historyResult=await importStrengthHistory(env.DB,{date,sets});
      }

      const history=await getStrengthHistory(env.DB,500);
      return Response.json({
        status:"ok",
        storage:"d1",
        history,
        historySaved:historyResult,
        sheetSaved:false,
        message:sets.length
          ? "Workout uložen do interní databáze."
          : "Nebyla označena žádná dokončená série."
      },{headers:{"Cache-Control":"no-store"}});
    }
    return Response.json({status:"error",message:"Method not allowed"},{status:405});
  }

  if (url.pathname === "/app/api/gym/generate" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const internal = new URL("/strength/generate-plan", request.url);
    const response = await app.fetch(new Request(internal,{
      method:"POST",
      headers:{...internalAuth,"Content-Type":"application/json"},
      body:JSON.stringify({...body,date:body?.date||null})
    }),env,ctx);
    const data=await response.json().catch(()=>({status:"error",message:"Invalid response"}));
    return Response.json(data,{status:response.status,headers:{"Cache-Control":"no-store"}});
  }

  if (request.method !== "GET") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });

  if (url.pathname === "/app/api/week") {
    const requestedStart = url.searchParams.get("start");
    const start = requestedStart && /^\d{4}-\d{2}-\d{2}$/.test(requestedStart)
      ? requestedStart
      : pragueWeekStart();
    const dates = Array.from({length:7}, (_, i) => shiftDate(start, i));
    const days = await Promise.all(dates.map(async date => {
      const dailyUrl = new URL("/analysis/daily", request.url);
      dailyUrl.searchParams.set("date", date);
      const foodUrl = new URL("/food/log", request.url);
      foodUrl.searchParams.set("date", date);
      const recommendUrl = new URL("/food/recommend", request.url);
      recommendUrl.searchParams.set("date", date);
      const [dailyResponse, foodResponse, recommendResponse] = await Promise.all([
        app.fetch(new Request(dailyUrl, {method:"GET",headers:internalAuth}), env, ctx),
        app.fetch(new Request(foodUrl, {method:"GET",headers:internalAuth}), env, ctx),
        app.fetch(new Request(recommendUrl, {method:"GET",headers:internalAuth}), env, ctx)
      ]);
      return {
        date,
        daily: await dailyResponse.json(),
        food: await foodResponse.json(),
        recommendations: await recommendResponse.json()
      };
    }));
    return Response.json({status:"ok",start,end:dates[6],days},{headers:{"Cache-Control":"no-store"}});
  }

  const routes = {
    "/app/api/daily": "/analysis/daily",
    "/app/api/weight": "/health/weight",
    "/app/api/activities": "/health/activities",
    "/app/api/nutrition": "/health/nutrition",
    "/app/api/sleep": "/health/sleep",
    "/app/api/health-db": "/health/db"
  };
  const target = routes[url.pathname];
  if (!target) return Response.json({ status: "error", message: "Not found" }, { status: 404 });

  const internal = new URL(target, request.url);
  for (const [key, value] of url.searchParams) internal.searchParams.set(key, value);
  const response = await app.fetch(new Request(internal, { method: "GET", headers: internalAuth }), env, ctx);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

async function handleStrengthAutomation(request, env, ctx) {
  if (request.method !== "POST") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  try {
    await verifyGitHubActionsToken(request);
    const body = await request.json().catch(() => ({}));
    const date = body?.date == null || body.date === "" ? null : String(body.date).trim();
    const action = String(body?.action || "generate").toLowerCase();
    const preview = body?.preview === true;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ status: "error", message: "Invalid date; expected YYYY-MM-DD" }, { status: 400 });

    const routes = {
      generate: "/strength/generate-plan",
      regenerate: "/strength/generate-plan",
      adjust: "/strength/generate-plan",
      shorten: "/strength/generate-plan",
      protect_legs: "/strength/generate-plan",
      focus_upper: "/strength/generate-plan",
      focus_lower: "/strength/generate-plan",
      substitute: "/strength/substitute",
      import_history: "/strength/history/import",
      sheet_maintenance: "/strength/sheets/maintenance",
      sync: "/strength/sync"
    };
    const route = routes[action];
    if (!route) return Response.json({ status: "error", message: `Unknown strength action: ${action}` }, { status: 400 });

    const internalUrl = new URL(route, request.url);
    const payload = { ...body, date, preview, action };
    if (action === "protect_legs" || action === "focus_upper") payload.forceProtectLegs = true;
    if (action === "shorten" && payload.durationMinutes == null) payload.durationMinutes = 60;
    if (action === "substitute") {
      if (!payload.from) return Response.json({ status: "error", message: "substitute requires 'from'" }, { status: 400 });
      if (!payload.to && !payload.muscle) return Response.json({ status: "error", message: "substitute requires 'to' or 'muscle'" }, { status: 400 });
    }

    const internalRequest = new Request(internalUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.STRENGTH_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const response = await app.fetch(internalRequest, env, ctx);
    const result = await response.clone().json().catch(() => null);
    if (result && typeof result === "object") return Response.json({ ...result, action }, { status: response.status });
    return response;
  } catch (error) {
    return Response.json({ status: "error", step: "github_actions_auth", message: error.message }, { status: 401 });
  }
}


async function handleNutritionAutomation(request, env, ctx) {
  if (request.method !== "POST") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  try {
    await verifyGitHubActionsToken(request);
    const body = await request.json().catch(() => ({}));
    const date = body?.date == null || body.date === "" ? null : String(body.date).trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ status: "error", message: "Invalid date; expected YYYY-MM-DD" }, { status: 400 });
    const internalUrl = new URL("/nutrition/plan", request.url);
    const internalRequest = new Request(internalUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.STRENGTH_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, date })
    });
    const response = await app.fetch(internalRequest, env, ctx);
    const result = await response.clone().json().catch(() => null);
    if (result && typeof result === "object") return Response.json(result, { status: response.status });
    return response;
  } catch (error) {
    return Response.json({ status: "error", step: "github_actions_auth", message: error.message }, { status: 401 });
  }
}

function homepagePage() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Petr Fitness Data — Health & Strength</title><meta name="description" content="Petr Fitness Data is a personal training data service for workout planning, training history, cycling context and nutrition workflows."></head><body><main><h1>Petr Fitness Data</h1><p>Petr Fitness Data is a private personal training service used with Health & Strength to organize training history, generate strength workouts, use cycling context, and support nutrition workflows.</p><p><strong>Google Health data disclosure:</strong> With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p><p>The service can process training and fitness data from connected services, including Google data and Google Sheets data that the account owner has authorized, in order to provide these requested workflows.</p><p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a> · <a href="/support">Support</a></p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function privacyPage() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy — Petr Fitness Data</title></head><body><main><h1>Privacy Policy</h1><p><strong>Petr Fitness Data</strong> is a private personal training service used with Health & Strength.</p><h2>What data the service may access</h2><p>When authorized by the account owner, the service may access fitness and training information from connected Google services and other configured services. This can include Google Sheet workout data, training history, planned workouts, cycling context, recovery metrics, nutrition information, and other fitness data needed for the requested workflows.</p><h2>How Google data is used</h2><p>Google user data is used only to provide the training and nutrition workflows requested by the account owner, such as reading and updating the configured workout spreadsheet, processing authorized fitness data, reading authorized nutrition logs, and adding nutrition logs that the account owner asks the service to record. The service does not sell Google user data and does not use it for advertising.</p><h2>Storage and sharing</h2><p>Data may be processed and stored in the private health-api backend, its configured database, and connected services such as the account owner's Google Sheet. Data may be transmitted between these configured services when necessary to provide the requested functionality. The service does not intentionally disclose personal data to unrelated third parties.</p><h2>Security</h2><p>OAuth credentials and API secrets are intended to be stored as private service secrets rather than in the source code repository. Access to the service is controlled by the configured authentication mechanisms.</p><h2>Changes</h2><p>This policy may be updated when the service or its data practices change. The current version is published on this page.</p><h2>Contact</h2><p>For support or privacy questions, use the <a href="/support">Support</a> page.</p><p><a href="/">Back to Petr Fitness Data</a></p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function policyPage(title, text) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>${title} — Health & Strength</title></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function logoResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#111827"/><path d="M68 132h32l18-54 30 100 20-46h20" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><circle cx="68" cy="132" r="8" fill="#fff"/></svg>`;
  return new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}


async function handleNutritionNotesAutomation(request, env) {
  if (request.method !== "POST") return Response.json({status:"error",message:"Method not allowed"},{status:405});
  try {
    await verifyGitHubActionsToken(request);
    const body=await request.json().catch(()=>({}));
    const today=new Date(), oldest=String(body?.oldest||today.toISOString().slice(0,10)), newest=String(body?.newest||new Date(today.getTime()+14*86400000).toISOString().slice(0,10));
    if (String(body?.action || "").toLowerCase() === "delete") {
      return Response.json(await deleteDailyNutritionNotes(env,{oldest,newest}));
    }
    let weightKg=Number(body?.weightKg);
    if(!Number.isFinite(weightKg)){
      const row=await env.DB.prepare(`SELECT value_numeric FROM health_datapoints WHERE LOWER(data_type) LIKE '%weight%' AND value_numeric IS NOT NULL ORDER BY COALESCE(sample_time,start_time) DESC LIMIT 1`).first();
      weightKg=Number(row?.value_numeric);
    }
    if(!Number.isFinite(weightKg)||weightKg<=0) weightKg=88;
    return Response.json(await syncDailyNutritionNotes(env,{oldest,newest,weightKg}));
  } catch(error){ return Response.json({status:"error",step:"nutrition_notes",message:error.message},{status:500}); }
}


function pragueWeekStart() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).formatToParts(now);
  const y = Number(parts.find(x=>x.type==="year").value);
  const m = Number(parts.find(x=>x.type==="month").value);
  const d = Number(parts.find(x=>x.type==="day").value);
  const weekday = parts.find(x=>x.type==="weekday").value;
  const index = {Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6}[weekday] ?? 0;
  return shiftDate(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`, -index);
}
function shiftDate(date, days) {
  const p = String(date).slice(0,10).split("-").map(Number);
  const d = new Date(Date.UTC(p[0],p[1]-1,p[2]+Number(days)));
  return d.toISOString().slice(0,10);
}
