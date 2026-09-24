export function dashboardPage() {
  const html = `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Petr Fitness Data</title>
<style>
:root{color-scheme:dark;--bg:#090b0f;--panel:#12161e;--panel2:#171c26;--line:#293140;--text:#f4f5f7;--muted:#98a2b3;--accent:#8b5cf6;--accent2:#a78bfa;--ok:#34d399;--warn:#f59e0b;--bad:#f87171}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1380px;margin:0 auto;padding:28px 22px 70px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:18px}h1{font-size:30px;line-height:1.15;margin:0 0 5px}.sub{color:var(--muted)}
button,.tab{border:0;border-radius:10px;padding:10px 14px;background:var(--accent);color:white;font-weight:700;cursor:pointer}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 22px}.tab{background:transparent;border:1px solid var(--line);color:var(--muted)}.tab.active{background:var(--accent);border-color:var(--accent);color:#fff}
.auth{background:var(--panel);border:1px solid var(--line);padding:14px 16px;border-radius:14px;margin-bottom:20px}.authrow{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.auth input{width:320px;max-width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#0d1117;color:var(--text)}.status{color:var(--muted);margin-top:7px}.status.ok{color:var(--ok)}.status.err{color:var(--bad)}
.view{display:none}.view.active{display:block}.section{font-size:19px;font-weight:750;margin:22px 0 11px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:17px;min-width:0}.card h3{margin:0 0 12px;font-size:15px}.label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.07em}.value{font-size:25px;font-weight:800;margin-top:3px}.small{font-size:12px;color:var(--muted)}.metric-note{margin-top:5px;font-size:12px;color:var(--muted)}.pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#202733;color:#d8dee8;font-size:11px}.good{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.weekbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.weeknav{display:flex;gap:7px;align-items:center}.weeknav button{background:var(--panel2);border:1px solid var(--line);padding:8px 11px}.weektitle{font-weight:750;min-width:220px;text-align:center}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 7px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}.scroll{overflow:auto}
.daygrid{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:8px}.day{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px;min-height:170px}.day.today{border-color:var(--accent)}.dayhead{font-weight:750;margin-bottom:8px}.daynum{color:var(--muted);font-size:11px}.bar{height:7px;border-radius:99px;background:#252c37;overflow:hidden;margin:7px 0}.bar>i{display:block;height:100%;background:var(--accent)}.bar.good>i{background:var(--ok)}
.chart{height:240px;width:100%;display:block}.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:8px}.legend span:before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--accent);margin-right:5px}.legend .green:before{background:var(--ok)}.legend .orange:before{background:var(--warn)}
.activity{padding:11px 0;border-bottom:1px solid var(--line)}.activity:last-child{border-bottom:0}.activity strong{display:block}.muted{color:var(--muted)}
.foodrow{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.foodrow:last-child{border-bottom:0}.foodname{font-weight:650}.right{text-align:right;white-space:nowrap}
@media(max-width:1050px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.grid3{grid-template-columns:1fr 1fr}.daygrid{overflow:auto;grid-template-columns:repeat(7,170px)}}
@media(max-width:700px){main{padding:20px 14px 50px}.top{flex-direction:column}.grid,.grid2,.grid3{grid-template-columns:1fr}.weektitle{min-width:0}.daygrid{grid-template-columns:repeat(7,160px)}}
</style>
</head>
<body>
<main>
  <div class="top">
    <div><h1>Petr Fitness Data</h1><div class="sub">Training • Health • Nutrition</div></div>
    <button id="refresh">Refresh</button>
  </div>

  <section class="auth">
    <div><strong>Dashboard</strong> <span class="pill">session protected</span></div>
    <div class="small">Session je uložená pouze jako podepsaná HttpOnly cookie; API key se v prohlížeči neukládá.</div>
    <div class="authrow" style="margin-top:9px"><input id="key" type="password" autocomplete="current-password" placeholder="Dashboard access key"><button id="connect">Sign in</button><button id="logout" hidden>Sign out</button></div>
    <div id="status" class="status">Kontroluji session…</div>
  </section>

  <nav class="tabs">
    <button class="tab active" data-view="overview">Přehled</button>
    <button class="tab" data-view="training">Trénink</button>
    <button class="tab" data-view="nutrition">Výživa</button>
    <button class="tab" data-view="health">Osobní data</button>
  </nav>

  <div id="content" hidden>
    <section id="overview" class="view active">
      <div class="section">Dnes</div>
      <div class="grid">
        <div class="card"><div class="label">Kalorický cíl</div><div id="oCal" class="value">—</div><div class="small">kcal</div></div>
        <div class="card"><div class="label">Odhad TDEE</div><div id="oTdee" class="value">—</div><div class="small">kcal</div></div>
        <div class="card"><div class="label">Hmotnost</div><div id="oWeight" class="value">—</div><div class="small">kg</div></div>
        <div class="card"><div class="label">Protein</div><div id="oProtein" class="value">—</div><div class="small">g / den</div></div>
      </div>
      <div class="grid3" style="margin-top:14px">
        <div class="card"><div class="label">Snědeno</div><div id="oFood" class="value">—</div><div class="metric-note" id="oFoodNote"></div></div>
        <div class="card"><div class="label">Dnešní trénink</div><div id="oTraining" class="value">—</div><div class="metric-note" id="oTrainingNote"></div></div>
        <div class="card"><div class="label">Týdenní zátěž</div><div id="oWeek" class="value">—</div><div class="metric-note">dny s plánem / aktivitou</div></div>
      </div>
      <div class="section">Týdenní přehled</div>
      <div class="card"><div id="weekSummary"></div></div>
      <div class="grid2" style="margin-top:14px">
        <div class="card"><h3>Kalorie: cíl vs. snědeno</h3><svg id="calChart" class="chart" viewBox="0 0 700 240"></svg><div class="legend"><span>Cíl</span><span class="green">Snědeno</span></div></div>
        <div class="card"><h3>Hmotnost</h3><svg id="weightChart" class="chart" viewBox="0 0 700 240"></svg><div class="legend"><span>Hmotnost</span></div></div>
      </div>
    </section>

    <section id="training" class="view">
      <div class="weekbar"><div><div class="section" style="margin:0">Tréninkový týden</div><div id="trainingRange" class="small"></div></div><div class="weeknav"><button id="prevWeek">←</button><button id="thisWeek">Tento týden</button><button id="nextWeek">→</button></div></div>
      <div class="daygrid" id="trainingDays"></div>
      <div class="grid2" style="margin-top:14px">
        <div class="card"><h3>Plánované aktivity</h3><div id="plannedList"></div></div>
        <div class="card"><h3>Dokončené aktivity</h3><div id="completedList"></div></div>
      </div>
      <div class="card" style="margin-top:14px"><h3>Délka tréninku v týdnu</h3><svg id="activityChart" class="chart" viewBox="0 0 1000 250"></svg></div>
    </section>

    <section id="nutrition" class="view">
      <div class="weekbar"><div><div class="section" style="margin:0">Výživa</div><div id="nutritionRange" class="small"></div></div></div>
      <div class="daygrid" id="nutritionDays"></div>
      <div class="grid2" style="margin-top:14px">
        <div class="card"><h3>Kalorie za týden</h3><svg id="nutritionChart" class="chart" viewBox="0 0 700 240"></svg></div>
        <div class="card"><h3>Plán jídla / doporučení</h3><div id="foodPlan"></div></div>
      </div>
      <div class="section">Historie jídla z Google Health</div>
      <div class="card"><div id="nutritionInfo" class="small"></div><div class="scroll" style="margin-top:8px"><table><thead><tr><th>Datum</th><th>Jídlo</th><th>Jídlo typ</th><th>kcal</th><th>Protein</th><th>Sacharidy</th><th>Tuk</th></tr></thead><tbody id="nutritionRows"></tbody></table></div></div>
    </section>

    <section id="health" class="view">
      <div class="section">Osobní data</div>
      <div class="grid">
        <div class="card"><div class="label">Aktuální hmotnost</div><div id="hWeight" class="value">—</div><div class="small">kg</div></div>
        <div class="card"><div class="label">7denní průměr</div><div id="hAvg7" class="value">—</div><div class="small">kg</div></div>
        <div class="card"><div class="label">30denní průměr</div><div id="hAvg30" class="value">—</div><div class="small">kg</div></div>
        <div class="card"><div class="label">Aktivity</div><div id="hActivities" class="value">—</div><div class="small">záznamů</div></div>
      </div>
      <div class="grid2" style="margin-top:14px">
        <div class="card"><h3>Vývoj hmotnosti</h3><svg id="healthWeightChart" class="chart" viewBox="0 0 700 280"></svg></div>
        <div class="card"><h3>Kalorický příjem vs. cíl</h3><svg id="healthCalChart" class="chart" viewBox="0 0 700 280"></svg></div>
      </div>
      <div class="section">Aktivita za poslední období</div>
      <div class="card"><div id="healthActivityTable"></div></div>
    </section>
  </div>
</main>
<script>
const $=id=>document.getElementById(id);
let weekStart=pragueMonday();
let state={week:null,weight:null,activities:null,nutrition:null,daily:null};

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function fmt(v,d=0){return Math.round(num(v)*10**d)/10**d}
function dateShift(date,days){const p=date.split("-").map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]+days)).toISOString().slice(0,10)}
function pragueToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function pragueMonday(){const d=pragueToday();const p=d.split("-").map(Number);const x=new Date(Date.UTC(p[0],p[1]-1,p[2]));const wd=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-wd);return x.toISOString().slice(0,10)}
function dateLabel(d){return new Intl.DateTimeFormat("cs-CZ",{day:"2-digit",month:"2-digit"}).format(new Date(d+"T12:00:00Z"))}
function longDate(d){return new Intl.DateTimeFormat("cs-CZ",{weekday:"long",day:"numeric",month:"numeric"}).format(new Date(d+"T12:00:00Z"))}
async function jsonFetch(path,options={}){const r=await fetch(path,{credentials:"same-origin",...options});const d=await r.json().catch(()=>({message:"Invalid response"}));if(!r.ok){const e=new Error(d.message||"HTTP "+r.status);e.status=r.status;throw e}return d}
function setConnected(ok,msg){$("status").textContent=msg;$("status").className="status "+(ok?"ok":"err")}
function activate(view){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===view));document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===view))}
function weekLabel(){return dateLabel(weekStart)+" – "+dateLabel(dateShift(weekStart,6))}
function chartSvg(id,values,targets,labels,opts={}){
  const svg=$(id);const W=opts.W||700,H=opts.H||240,pad=34;
  const nums=values.map(num).filter(Number.isFinite);const tnums=(targets||[]).map(num).filter(Number.isFinite);const all=nums.concat(tnums);
  if(!all.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#98a2b3">Bez dat</text>';return}
  let min=Math.min(...all),max=Math.max(...all);if(min===max){min-=1;max+=1}const x=i=>pad+(W-pad*2)*(values.length<=1?.5:i/(values.length-1));const y=v=>H-pad-(H-pad*2)*(v-min)/(max-min);
  let out='<line x1="'+pad+'" y1="'+(H-pad)+'" x2="'+(W-pad)+'" y2="'+(H-pad)+'" stroke="#293140"/>';
  values.forEach((v,i)=>{if(Number.isFinite(num(v)))out+='<circle cx="'+x(i)+'" cy="'+y(num(v))+'" r="3.5" fill="#8b5cf6"/>';if(labels[i])out+='<text x="'+x(i)+'" y="'+(H-9)+'" text-anchor="middle" fill="#98a2b3" font-size="11">'+esc(labels[i])+'</text>'});
  if(values.some(v=>Number.isFinite(num(v)))){const pts=values.map((v,i)=>Number.isFinite(num(v))?x(i)+","+y(num(v)):null).filter(Boolean).join(" ");out+='<polyline points="'+pts+'" fill="none" stroke="#8b5cf6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'}
  if(targets&&targets.length){const pts=targets.map((v,i)=>Number.isFinite(num(v))?x(i)+","+y(num(v)):null).filter(Boolean).join(" ");out+='<polyline points="'+pts+'" fill="none" stroke="#34d399" stroke-width="2" stroke-dasharray="6 5"/>'}
  svg.innerHTML=out
}
function barChart(id,values,targets,labels){
  const svg=$(id),W=700,H=240,pad=28;const all=values.concat(targets).map(num);const max=Math.max(1,...all)*1.12;const bw=(W-pad*2)/values.length*.58;let out="";
  values.forEach((v,i)=>{const x=pad+i*(W-pad*2)/values.length+(W-pad*2)/values.length*.21;const h=num(v)/max*(H-55);const ht=num(targets[i])/max*(H-55);out+='<rect x="'+x+'" y="'+(H-30-ht)+'" width="'+bw+'" height="'+ht+'" rx="4" fill="#34d399" opacity=".28"/><rect x="'+x+'" y="'+(H-30-h)+'" width="'+bw+'" height="'+h+'" rx="4" fill="#8b5cf6"/><text x="'+(x+bw/2)+'" y="'+(H-9)+'" text-anchor="middle" fill="#98a2b3" font-size="10">'+esc(labels[i])+'</text>'});svg.innerHTML=out
}
function renderOverview(){
 const d=state.daily||{};const food=d.nutrition?.foodLog?.totals||{};$("oCal").textContent=fmt(d.calories?.target);$("oTdee").textContent=fmt(d.calories?.estimatedTDEE);$("oWeight").textContent=fmt(d.weight?.current,1);$("oProtein").textContent=fmt(d.nutrition?.protein);
 $("oFood").textContent=fmt(food.kcal)+" kcal";$("oFoodNote").textContent=fmt(food.kcal/Math.max(1,num(d.calories?.target))*100,0)+" % cíle";
 const acts=d.training?.completed||[],planned=d.training?.planned||[];$("oTraining").textContent=acts.length?acts.length+" hotovo":"Volno";$("oTrainingNote").textContent=planned.length?planned.length+" plánováno":"Nic plánováno";
 const days=(state.week?.days||[]).filter(x=>(x.daily?.training?.completed||[]).length||(x.daily?.training?.planned||[]).length).length;$("oWeek").textContent=days+"/7";
 const daysW=state.week?.days||[];$("weekSummary").innerHTML=daysW.map(x=>{const dd=x.daily||{},a=dd.training?.completed||[],p=dd.training?.planned||[],target=num(dd.calories?.target),e=num(x.food?.totals?.kcal);return '<div class="foodrow"><div><strong>'+esc(longDate(x.date))+'</strong><div class="small">'+(a.length?a.length+" aktivita":"bez dokončené aktivity")+' • '+(p.length?p.length+" plán":"bez plánu")+'</div></div><div class="right">'+fmt(e)+' / '+fmt(target)+' kcal</div></div>'}).join("");
 const labels=daysW.map(x=>dateLabel(x.date));const vals=daysW.map(x=>num(x.food?.totals?.kcal));const targets=daysW.map(x=>num(x.daily?.calories?.target));barChart("calChart",vals,targets,labels);
 const wr=(state.weight?.records||[]).slice(-30);chartSvg("weightChart",wr.map(x=>num(x.value_numeric)),[],wr.map(x=>dateLabel(String(x.sample_time).slice(0,10))));
}
function renderTraining(){
 const days=state.week?.days||[];$("trainingRange").textContent=weekLabel();$("trainingDays").innerHTML=days.map(x=>{const a=x.daily?.training?.completed||[],p=x.daily?.training?.planned||[];const dur=a.reduce((s,z)=>s+num(z.durationHours),0);return '<div class="day '+(x.date===pragueToday()?"today":"")+'"><div class="dayhead">'+esc(longDate(x.date))+'</div><div class="small">'+fmt(dur,1)+' h dokončeno</div><div class="bar"><i style="width:'+Math.min(100,dur/2*100)+'%"></i></div>'+(p.length?p.map(z=>'<div style="margin:6px 0"><span class="pill">'+esc(z.type||"plan")+'</span><div>'+esc(z.name||"")+'</div></div>').join(""):'<div class="muted">Bez plánu</div>')+'</div>'}).join("");
 const planned=days.flatMap(x=>(x.daily?.training?.planned||[]).map(z=>({...z,date:x.date})));const completed=days.flatMap(x=>(x.daily?.training?.completed||[]).map(z=>({...z,date:x.date})));
 $("plannedList").innerHTML=planned.length?planned.map(x=>'<div class="activity"><strong>'+esc(longDate(x.date))+' — '+esc(x.name||"Workout")+'</strong><span class="small">'+esc(x.type||"")+(x.durationHours?" • "+fmt(x.durationHours,1)+" h":"")+(x.tss?" • TSS "+fmt(x.tss):"")+'</span></div>').join(""):'<div class="muted">Nic plánováno.</div>';
 $("completedList").innerHTML=completed.length?completed.slice().reverse().map(x=>'<div class="activity"><strong>'+esc(longDate(x.date))+' — '+esc(x.name||"Activity")+'</strong><span class="small">'+esc(x.type||"")+(x.durationHours?" • "+fmt(x.durationHours,1)+" h":"")+(x.calories?" • "+fmt(x.calories)+" kcal":"")+'</span></div>').join(""):'<div class="muted">Zatím nic dokončeno.</div>';
 chartSvg("activityChart",days.map(x=>(x.daily?.training?.completed||[]).reduce((s,z)=>s+num(z.durationHours),0)),[],days.map(x=>dateLabel(x.date)),{W:1000,H:250});
}
function renderNutrition(){
 const days=state.week?.days||[];$("nutritionRange").textContent=weekLabel();
 $("nutritionDays").innerHTML=days.map(x=>{const t=num(x.daily?.calories?.target),e=num(x.food?.totals?.kcal),pct=t?Math.min(100,e/t*100):0;const diff=t-e;return '<div class="day '+(x.date===pragueToday()?"today":"")+'"><div class="dayhead">'+esc(longDate(x.date))+'</div><div class="value" style="font-size:20px">'+fmt(e)+' <span class="small">/ '+fmt(t)+' kcal</span></div><div class="bar '+(Math.abs(diff)<150?"good":"")+'"><i style="width:'+pct+'%"></i></div><div class="small">P '+fmt(x.food?.totals?.protein_g,0)+' g • C '+fmt(x.food?.totals?.carbs_g,0)+' g • F '+fmt(x.food?.totals?.fat_g,0)+' g</div><div class="small" style="margin-top:8px">'+(x.daily?.nutrition?.protein?fmt(x.daily.nutrition.protein)+" g protein cíl":"")+'</div></div>'}).join("");
 const vals=days.map(x=>num(x.food?.totals?.kcal)),targets=days.map(x=>num(x.daily?.calories?.target));barChart("nutritionChart",vals,targets,days.map(x=>dateLabel(x.date)));
 const selected=days.find(x=>x.date===pragueToday())||days[0];const rec=selected?.recommendations?.recommendations||[];$("foodPlan").innerHTML=selected?'<div class="small" style="margin-bottom:10px">'+esc(selected.recommendations?.coaching||"")+'</div>'+(rec.length?rec.slice(0,5).map(r=>'<div class="foodrow"><div><div class="foodname">'+esc(r.title||r.name||"Jídlo")+'</div><div class="small">'+esc(r.recommendation_reason||"")+'</div></div><div class="right">'+fmt(r.kcal)+' kcal<br><span class="small">'+fmt(r.protein_g,0)+' g P</span></div></div>').join(""):'<div class="muted">Žádné doporučení.</div>'):'—';
 const nr=state.nutrition?.records||[];$("nutritionInfo").textContent=nr.length+" záznamů z Google Health";$("nutritionRows").innerHTML=nr.slice().sort((a,b)=>String(b.startTime).localeCompare(String(a.startTime))).map(x=>'<tr><td>'+esc(x.startTime?new Date(x.startTime).toLocaleString("cs-CZ"):"—")+'</td><td>'+esc(x.foodDisplayName||"—")+'</td><td>'+esc(x.mealType||"—")+'</td><td>'+fmt(x.kcal)+'</td><td>'+fmt(x.protein_g,1)+' g</td><td>'+fmt(x.carbs_g,1)+' g</td><td>'+fmt(x.fat_g,1)+' g</td></tr>').join("")||'<tr><td colspan="7">Bez záznamů.</td></tr>';
}
function renderHealth(){
 const w=state.weight||{};$("hWeight").textContent=fmt(w.latest?.value_numeric,1);$("hAvg7").textContent=fmt(w.average7d,1);$("hAvg30").textContent=fmt(w.average30d,1);$("hActivities").textContent=(state.activities?.count||0);
 const wr=(w.records||[]).slice(-30);chartSvg("healthWeightChart",wr.map(x=>num(x.value_numeric)),[],wr.map(x=>dateLabel(String(x.sample_time).slice(0,10))),{W:700,H:280});
 const days=state.week?.days||[];barChart("healthCalChart",days.map(x=>num(x.food?.totals?.kcal)),days.map(x=>num(x.daily?.calories?.target)),days.map(x=>dateLabel(x.date)));
 const acts=(state.activities?.activities||[]).filter(x=>x.data_type==="activity").slice(0,20);$("healthActivityTable").innerHTML=acts.length?'<div class="scroll"><table><thead><tr><th>Datum</th><th>Aktivita</th><th>Typ</th></tr></thead><tbody>'+acts.map(x=>{let p={};try{p=JSON.parse(x.payload_json||"{}")}catch{}return '<tr><td>'+esc(String(x.start_time||"").slice(0,16).replace("T"," "))+'</td><td>'+esc(p.name||p.title||"Activity")+'</td><td>'+esc(p.type||p.category||"")+'</td></tr>'}).join("")+'</tbody></table></div>':'<div class="muted">Žádné aktivity.</div>';
}
async function load(){
 $("status").textContent="Načítám data…";$("status").className="status";
 try{
  const end=dateShift(weekStart,6);
  const [daily,week,weight,activities,nutrition]=await Promise.all([
    jsonFetch("/app/api/daily"),
    jsonFetch("/app/api/week?start="+weekStart),
    jsonFetch("/app/api/weight"),
    jsonFetch("/app/api/activities"),
    jsonFetch("/app/api/nutrition?start="+weekStart+"&end="+dateShift(end,1))
  ]);
  state={daily,week,weight,activities,nutrition};$("content").hidden=false;
  renderOverview();renderTraining();renderNutrition();renderHealth();
  $("key").value="";$("key").disabled=true;$("connect").hidden=true;$("logout").hidden=false;
  setConnected(true,"Connected • poslední refresh "+new Date().toLocaleTimeString("cs-CZ"));
 }catch(e){
  if(e.status===401){$("content").hidden=true;$("key").disabled=false;$("key").placeholder="Dashboard access key";$("connect").hidden=false;$("logout").hidden=true;$("status").textContent="Session expired. Přihlas se znovu."}
  else setConnected(false,"Chyba: "+e.message);
 }
}
async function login(){
 const key=$("key").value.trim();if(!key){$("status").textContent="Zadej dashboard access key.";return}
 try{await jsonFetch("/app/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key})});await load()}catch(e){setConnected(false,"Přihlášení selhalo: "+e.message)}
}
async function logout(){await fetch("/app/logout",{method:"POST",credentials:"same-origin"});$("content").hidden=true;$("key").disabled=false;$("key").placeholder="Dashboard access key";$("connect").hidden=false;$("logout").hidden=true;$("status").textContent="Odhlášeno.";$("status").className="status"}
$("connect").onclick=login;$("logout").onclick=logout;$("refresh").onclick=load;
$("prevWeek").onclick=()=>{weekStart=dateShift(weekStart,-7);load()};$("nextWeek").onclick=()=>{weekStart=dateShift(weekStart,7);load()};$("thisWeek").onclick=()=>{weekStart=pragueMonday();load()};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>activate(b.dataset.view));
load();
</script>
</body></html>`;
  return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}
