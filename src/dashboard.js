export function dashboardPage() {
  const html = `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Petr Fitness Data — Command Center</title>
<style>
:root{color-scheme:dark;--bg:#07101d;--sidebar:#0a1524;--panel:#101c2d;--panel2:#142238;--line:#24364d;--text:#f4f7fb;--muted:#91a0b5;--accent:#3b82f6;--accent2:#63a4ff;--ok:#35c48b;--warn:#e9b44c;--bad:#ef6b73;--cyan:#38bdf8}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
button,input,select{font:inherit}button{cursor:pointer}.shell{display:grid;grid-template-columns:238px minmax(0,1fr);min-height:100vh}.sidebar{background:var(--sidebar);border-right:1px solid var(--line);padding:22px 14px;position:sticky;top:0;height:100vh}.brand{padding:3px 10px 24px}.brand strong{display:block;font-size:18px;letter-spacing:-.02em}.brand span{color:var(--muted);font-size:12px}.nav{display:grid;gap:5px}.nav button{border:1px solid transparent;background:transparent;color:var(--muted);padding:11px 12px;border-radius:10px;text-align:left;font-weight:650}.nav button:hover{background:var(--panel2);color:var(--text)}.nav button.active{background:rgba(59,130,246,.15);border-color:rgba(59,130,246,.36);color:#fff}.sidebar-foot{position:absolute;bottom:18px;left:24px;right:18px;color:var(--muted);font-size:11px}.main{min-width:0}.topbar{height:72px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 30px;position:sticky;top:0;background:rgba(7,16,29,.94);backdrop-filter:blur(12px);z-index:5}.top-title{font-size:17px;font-weight:750}.top-sub{color:var(--muted);font-size:12px}.actions{display:flex;gap:8px;align-items:center}.status-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);display:inline-block}.btn{border:1px solid var(--line);background:var(--panel2);color:var(--text);padding:9px 12px;border-radius:9px;font-weight:650}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn:hover{filter:brightness(1.08)}.content{max-width:1500px;padding:26px 30px 70px;margin:0 auto}.view{display:none}.view.active{display:block}.hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:22px}.eyebrow{color:var(--accent2);font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:750}.hero h1{margin:3px 0 4px;font-size:30px;letter-spacing:-.035em}.hero p{margin:0;color:var(--muted)}.section{font-size:17px;font-weight:750;margin:24px 0 12px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0;box-shadow:0 6px 20px rgba(0,0,0,.16)}.card h3{font-size:14px;margin:0 0 13px}.label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;font-weight:700}.value{font-size:26px;font-weight:800;letter-spacing:-.03em;margin-top:3px}.small{font-size:12px;color:var(--muted)}.muted{color:var(--muted)}.pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#202936;color:#cbd4df;font-size:11px;font-weight:650}.good{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.accent{color:var(--accent2)}.weekbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.weeknav{display:flex;gap:6px}.weeknav .btn{padding:7px 10px}.weektitle{font-weight:750}.daygrid{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:8px}.day{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:11px;min-height:155px}.day.today{border-color:var(--accent);box-shadow:inset 0 0 0 1px rgba(124,92,255,.18)}.dayhead{font-weight:700}.bar{height:6px;background:#242c37;border-radius:99px;overflow:hidden;margin:8px 0}.bar i{display:block;height:100%;background:var(--accent);border-radius:99px}.macro-p{background:#60a5fa!important}.macro-c{background:#f59e0b!important}.macro-f{background:#a78bfa!important}.trend{font-size:12px;font-weight:700;margin-top:5px}.score{font-size:11px;font-weight:750;padding:3px 7px;border-radius:999px;background:rgba(53,196,139,.12);color:var(--ok);white-space:nowrap}.score.mid{background:rgba(233,180,76,.12);color:var(--warn)}.score.low{background:rgba(239,107,115,.12);color:var(--bad)}.macro-lines{display:grid;gap:5px;margin-top:8px}.macro-line{display:flex;justify-content:space-between;gap:8px;font-size:11px}.macro-line b{font-weight:750}.reason{padding:10px 12px;border-left:3px solid var(--accent);background:rgba(59,130,246,.07);border-radius:7px;margin-bottom:10px}.compact-plan{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.compact-plan .plan-day{min-height:120px}.select-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.select-row select{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:7px 9px}.stack-chart{width:100%;height:300px;display:block}.bar.ok i{background:var(--ok)}.activity{padding:10px 0;border-bottom:1px solid var(--line)}.activity:last-child{border-bottom:0}.activity strong{display:block}.right{text-align:right;white-space:nowrap}.foodrow{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid var(--line)}.foodrow:last-child{border-bottom:0}.scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:middle}th{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700}.chart{width:100%;height:250px;display:block}.legend{display:flex;gap:16px;color:var(--muted);font-size:11px}.metric-line{display:flex;justify-content:space-between;gap:10px;margin:7px 0}.gym-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.gym-table input{width:82px;background:#0c1118;border:1px solid var(--line);color:var(--text);border-radius:7px;padding:7px}.gym-table input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent)}.gym-table a{color:#b9aaff;text-decoration:none;font-weight:650}.gym-table a:hover{text-decoration:underline}.gym-type{font-size:10px;color:var(--muted);font-weight:750;letter-spacing:.05em}.sleep-stage{display:flex;height:16px;border-radius:7px;overflow:hidden;background:#202733}.sleep-stage i{display:block}.stage-deep{background:#5b4ae8}.stage-rem{background:#a06cf7}.stage-light{background:#4cc9f0}.stage-awake{background:#f5b74b}.notice{padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:rgba(59,130,246,.07);color:#cbd4df}.toast{position:fixed;right:22px;bottom:22px;background:#122033;border:1px solid var(--line);padding:12px 15px;border-radius:10px;box-shadow:0 14px 40px #0008;display:none;z-index:20}.status-error{color:var(--bad)}.status-partial{color:var(--warn)}.plan-grid{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:8px}.plan-day{background:#0d1828;border:1px solid var(--line);border-radius:10px;padding:12px;min-height:142px}.plan-day.today{border-color:var(--accent);box-shadow:inset 0 0 0 1px rgba(59,130,246,.18)}.plan-day .dow{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.plan-day .date{font-weight:750;margin:2px 0 10px}.plan-item{padding:8px 9px;border-left:3px solid var(--accent);background:#122238;border-radius:7px;margin-top:7px}.plan-item.done{border-left-color:var(--ok)}.plan-item .name{font-weight:700;font-size:12px}.plan-item .meta{font-size:11px;color:var(--muted);margin-top:2px}.toast.show{display:block}
@media(max-width:1050px){.shell{grid-template-columns:1fr}.sidebar{height:auto;position:sticky;z-index:10;padding:10px 14px;border-right:0;border-bottom:1px solid var(--line)}.brand{display:none}.nav{display:flex;overflow:auto}.nav button{white-space:nowrap}.sidebar-foot{display:none}.topbar{top:51px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.daygrid{overflow:auto;grid-template-columns:repeat(7,170px)}}.desktop-hide{display:none}@media(max-width:700px){.content{padding:16px 12px 44px}.topbar{padding:0 12px;height:64px}.top-sub{display:none}.hero{align-items:flex-start;flex-direction:column;gap:10px;margin-bottom:16px}.hero h1{font-size:25px}.grid,.grid2,.grid3{grid-template-columns:1fr}.actions .status-label{display:none}.actions{width:100%}.actions .btn{flex:1}.daygrid{grid-template-columns:1fr;overflow:visible}.day{min-height:0}.plan-grid{grid-template-columns:1fr}.compact-plan{grid-template-columns:1fr}.plan-day{min-height:0}.weekbar{align-items:flex-start;flex-direction:column}.weeknav{width:100%}.weeknav .btn{flex:1}.gym-table{min-width:760px}.gym-table-wrap{overflow-x:auto}.chart{height:210px}.sidebar{padding:8px 10px}.nav{gap:4px}.nav button{padding:9px 10px;font-size:12px}.brand{display:none}.sidebar-foot{display:none}}
</style>
</head>
<body>
<div class="shell">
<aside class="sidebar">
  <div class="brand"><strong>Petr Fitness Data</strong><span>Performance Command Center</span></div>
  <nav class="nav">
    <button class="navbtn active" data-view="overview">▦ <span>Přehled</span></button>
    <button class="navbtn" data-view="training">◈ <span>Trénink</span></button>
    <button class="navbtn" data-view="gym">▣ <span>Gym</span></button>
    <button class="navbtn" data-view="recovery">◒ <span>Recovery & spánek</span></button>
    <button class="navbtn" data-view="nutrition">◉ <span>Výživa</span></button>
    <button class="navbtn" data-view="health">⌁ <span>Health data</span></button>
  </nav>
  <div class="sidebar-foot">Private training workspace<br>Data is loaded server-side</div>
</aside>
<main class="main">
<header class="topbar">
  <div><div class="top-title">Petr Fitness Data</div><div class="top-sub">Training intelligence · Health · Nutrition</div></div>
  <div class="actions"><span class="status-dot"></span><span class="status-label small" id="topStatus">Live</span><button class="btn" id="refresh">Refresh</button></div>
</header>
<div class="content">
<section id="overview" class="view active">
  <div class="hero"><div><div class="eyebrow">Performance overview</div><h1>Dobrý den, Petře</h1><p id="overviewDate">—</p></div></div>
  <div class="grid">
    <div class="card"><div class="label">Hmotnost</div><div id="oWeight" class="value">—</div><div class="small">kg · cíl 80 kg</div></div>
    <div class="card"><div class="label">Spánek</div><div id="oSleep" class="value">—</div><div class="small">poslední noc</div></div>
    <div class="card"><div class="label">Fitness</div><div id="oFitness" class="value">—</div><div class="small">CTL · Intervals.icu</div></div>
    <div class="card"><div class="label">Form</div><div id="oForm" class="value">—</div><div class="small">TSB · dnes</div></div>
  </div>
  <div class="grid3" style="margin-top:12px">
    <div class="card"><div class="label">Dnešní trénink</div><div id="oTraining" class="value">—</div><div id="oTrainingNote" class="small"></div></div>
    <div class="card"><div class="label">Dnešní výživa</div><div id="oFood" class="value">—</div><div id="oFoodNote" class="small"></div><div id="oMacros" class="macro-lines"></div></div>
    <div class="card"><div class="label">Recovery</div><div class="grid2" style="margin-top:4px"><div><div class="small">Spánek</div><div id="oRecoverySleep" class="value" style="font-size:22px">—</div></div><div><div class="small">Trénink</div><div id="oRecoveryTraining" class="value" style="font-size:22px">—</div></div></div><div id="oRecoveryNote" class="small">samostatně · celkové recovery</div></div>
  </div>
  <div class="section">Dnešní plán · další 2 dny</div><div class="card"><div id="overviewPlan" class="compact-plan"></div></div>
  <div class="section">Týdenní tréninkový plán</div><div class="card"><div id="overviewWeekPlan" class="plan-grid"></div></div>
  <div class="card" style="margin-top:12px"><h3>Kalorie · cíl vs. příjem</h3><svg id="calChart" class="chart" viewBox="0 0 1000 260"></svg></div>
</section>

<section id="training" class="view">
  <div class="weekbar"><div><div class="eyebrow">Training management</div><div class="section" style="margin:2px 0">Tréninkový týden</div><div id="trainingRange" class="small"></div></div><div class="select-row"><select id="trainingWeekSelect"></select><select id="trainingDaySelect"></select><div class="weeknav"><button class="btn" id="prevWeek">←</button><button class="btn" id="thisWeek">Tento týden</button><button class="btn" id="nextWeek">→</button></div></div></div>
  <div class="daygrid" id="trainingDays"></div>
  <div class="grid" style="margin-top:12px">
    <div class="card"><div class="label">Fitness</div><div id="tFitness" class="value">—</div><div class="small">CTL · 42denní trend</div></div>
    <div class="card"><div class="label">Fatigue</div><div id="tFatigue" class="value">—</div><div class="small">ATL · 7denní trend</div></div>
    <div class="card"><div class="label">Form</div><div id="tForm" class="value">—</div><div class="small">TSB = Fitness − Fatigue</div></div>
    <div class="card"><div class="label">Ramp rate</div><div id="tRamp" class="value">—</div><div class="small">změna Fitness</div></div>
  </div>
  <div class="grid2" style="margin-top:12px">
    <div class="card"><h3>Fitness · Fatigue · Form</h3><svg id="pmcChart" class="chart" viewBox="0 0 1000 300"></svg><div id="pmcInsight" class="notice" style="margin-top:10px"></div></div>
    <div class="card"><h3>Plán vs. skutečnost · TSS</h3><svg id="tssChart" class="chart" viewBox="0 0 1000 300"></svg><div id="tssInsight" class="notice" style="margin-top:10px"></div></div>
  </div>
  <div class="grid2" style="margin-top:12px">
    <div class="card"><h3>Tréninkový load · posledních 42 dní</h3><svg id="loadChart" class="chart" viewBox="0 0 1000 250"></svg></div>
    <div class="card"><h3>Aktivity · historie</h3><div id="trainingSummary" class="small"></div><div id="trainingActivityTable"></div></div>
  </div>

  <div class="grid2" style="margin-top:12px"><div class="card"><h3>Plánované aktivity</h3><div id="plannedList"></div></div><div class="card"><h3>Dokončené aktivity</h3><div id="completedList"></div></div></div>
</section>

<section id="gym" class="view">
  <div class="hero"><div><div class="eyebrow">Strength management</div><h1>Gym</h1><p id="gymMeta">Dnešní silový trénink</p></div><div class="actions"><button class="btn" id="generateGym">Generate today's plan</button><button class="btn primary" id="saveGym">Save workout</button></div></div>
  <div class="notice" id="gymNotice">Načítám dnešní trénink…</div>
  <div class="card" style="margin-top:12px"><div class="scroll"><table class="gym-table"><thead><tr><th>Typ</th><th>Cvik</th><th>Série</th><th>Plán kg</th><th>Plán reps</th><th>Skutečně kg</th><th>Skutečně reps</th><th>RPE</th><th>Hotovo</th><th>Video</th></tr></thead><tbody id="gymRows"></tbody></table></div></div>
</section>

<section id="recovery" class="view">
  <div class="hero"><div><div class="eyebrow">Recovery intelligence</div><h1>Recovery & spánek</h1><p>Spánek, délka a rozložení jednotlivých fází</p></div></div>
  <div class="grid">
    <div class="card"><div class="label">Poslední noc</div><div id="rLast" class="value">—</div><div class="small" id="rLastMeta"></div></div>
    <div class="card"><div class="label">Průměr</div><div id="rAvg" class="value">—</div><div class="small" id="rAvgLabel">posledních 14 dní</div></div>
    <div class="card"><div class="label">Deep</div><div id="rDeep" class="value">—</div><div class="small">poslední noc</div></div>
    <div class="card"><div class="label">REM</div><div id="rRem" class="value">—</div><div class="small">poslední noc</div></div>
  </div>
  <div class="grid2" style="margin-top:12px"><div class="card"><div class="select-row"><h3 style="margin-right:auto">Spánek · historie</h3><select id="sleepRange"><option value="7">7 dní</option><option value="30">Měsíc</option><option value="180">6 měsíců</option><option value="365">1 rok</option><option value="3650">All time</option></select><select id="sleepDaySelect"></select></div><svg id="sleepChart" class="chart" viewBox="0 0 700 250"></svg></div><div class="card"><h3>Poslední noc · fáze</h3><div id="sleepScore" style="margin-bottom:10px"></div><div id="sleepStages"></div></div></div>
  <div class="card" style="margin-top:12px"><h3>Vybraný den</h3><div id="sleepDayDetail" class="grid3"></div><details style="margin-top:12px"><summary>Kompletní seznam nocí</summary><div class="scroll"><table><thead><tr><th>Datum</th><th>Usnutí</th><th>Probuzení</th><th>Délka</th><th>Deep</th><th>REM</th><th>Light</th><th>Awake</th></tr></thead><tbody id="sleepRows"></tbody></table></div></details></div>
</section>

<section id="nutrition" class="view">
  <div class="weekbar"><div><div class="eyebrow">Nutrition intelligence</div><div class="section" style="margin:2px 0">Výživa</div><div id="nutritionRange" class="small"></div><div id="nutritionReason" class="small" style="margin-top:5px"></div></div><div class="select-row"><select id="nutritionWeekSelect"></select><select id="nutritionDaySelect"></select></div></div>
  <div class="daygrid" id="nutritionDays"></div>
  <div class="grid2" style="margin-top:12px"><div class="card"><h3>Makra · příjem vs. cíl</h3><svg id="nutritionChart" class="stack-chart" viewBox="0 0 900 300"></svg></div><div class="card"><h3>Co dál dnes?</h3><div id="foodPlan"></div></div></div>
  <div class="section">Google Health · historie jídel</div><div class="card"><div id="nutritionInfo" class="small"></div><div class="scroll"><table><thead><tr><th>Datum</th><th>Jídlo</th><th>Typ</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Tuk</th></tr></thead><tbody id="nutritionRows"></tbody></table></div></div>
</section>

<section id="health" class="view">
  <div class="hero"><div><div class="eyebrow">Health data</div><h1>Health data</h1><p>Historie pohybu, hmotnosti a zdrojových dat</p></div></div>
  <div class="grid"><div class="card"><div class="label">Hmotnost</div><div id="hWeight" class="value">—</div><div class="small">kg</div></div><div class="card"><div class="label">7denní průměr</div><div id="hAvg7" class="value">—</div><div class="small">kg</div></div><div class="card"><div class="label">30denní průměr</div><div id="hAvg30" class="value">—</div><div class="small">kg</div></div><div class="card"><div class="label">Aktivity</div><div id="hActivities" class="value">—</div><div class="small">záznamů</div></div></div>
  <div class="grid2" style="margin-top:12px"><div class="card"><h3>Vývoj hmotnosti</h3><svg id="healthWeightChart" class="chart" viewBox="0 0 700 250"></svg></div><div class="card"><h3>Aktivita · historie</h3><div id="healthActivityTable"></div></div></div>
</section>
</div></main></div>
<div id="toast" class="toast"></div>
<script>
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
  const svg=$(id),W=900,H=300,left=95,right=25,top=28,row=36;
  const segs=[["carbs","Sacharidy","#f59e0b",45],["protein","Protein","#60a5fa",35],["fat","Tuk","#a78bfa",20]];
  let out='<text x="'+left+'" y="14" fill="#91a0b5" font-size="10">CÍL · podíl kcal</text><text x="'+(left+330)+'" y="14" fill="#91a0b5" font-size="10">SNĚDENO · podíl cíle</text>';
  days.forEach((d,i)=>{
    const y=top+i*row, t=num(d.daily?.calories?.target), food=d.food?.totals||{}, m=macroTargetsOf(d);
    out+='<text x="0" y="'+(y+12)+'" fill="#91a0b5" font-size="10">'+esc(dateLabel(d.date))+'</text>';
    let x=left;
    segs.forEach(([key,label,color,pct])=>{
      const w=270*pct/100;
      out+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="13" rx="2" fill="'+color+'" opacity=".55"/>';
      out+='<text x="'+(x+w/2)+'" y="'+(y+10)+'" text-anchor="middle" fill="#08111e" font-size="9" font-weight="700">'+pct+'%</text>'; x+=w;
    });
    const targetParts={carbs:m.carbs*4,protein:m.protein*4,fat:m.fat*9};
    const actualParts={carbs:num(food.carbs_g)*4,protein:num(food.protein_g)*4,fat:num(food.fat_g)*9};
    let ax=left+330;
    const scale=t>0?Math.min(1,(num(food.kcal)/t)):0;
    segs.forEach(([key,label,color])=>{
      const targetK=targetParts[key]||0, actualK=actualParts[key]||0;
      const w=270*(targetK/Math.max(1,t))*scale;
      if(w>0)out+='<rect x="'+ax+'" y="'+y+'" width="'+w+'" height="13" rx="2" fill="'+color+'"/>';
      ax+=w;
    });
    out+='<text x="'+(W-right)+'" y="'+(y+11)+'" text-anchor="end" fill="#d8e0ea" font-size="10">'+fmt(food.kcal)+' / '+fmt(t)+' kcal</text>';
  });
  svg.innerHTML=out;
}
function isoWeek(date){
  const d=new Date(date+"T12:00:00Z"), th=new Date(d);
  th.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const y=th.getUTCFullYear(), jan=new Date(Date.UTC(y,0,1));
  return String(Math.ceil((((th-jan)/86400000)+1)/7)).padStart(2,"0");
}
function populateWeekSelectors(weekId,dayId,days){
  const ws=$(weekId),ds=$(dayId);
  if(!ws||!ds)return;
  const opts=[];
  for(let i=-12;i<=8;i++){
    const d=dateShift(pragueMonday(),i*7);
    opts.push('<option value="'+d+'" '+(d===weekStart?"selected":"")+'>Týden '+isoWeek(d)+' · '+dateLabel(d)+'–'+dateLabel(dateShift(d,6))+'</option>');
  }
  ws.innerHTML=opts.join("");
  ds.innerHTML=days.map(x=>'<option value="'+x.date+'" '+(x.date===selectedHistoryDate?"selected":"")+'>'+esc(longDate(x.date))+'</option>').join("");
  ws.onchange=()=>{weekStart=ws.value;selectedHistoryDate=weekStart;load()};
  ds.onchange=()=>{selectedHistoryDate=ds.value;renderTraining();renderNutrition()};
}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
async function jsonFetch(path,options={}){const r=await fetch(path,{credentials:"same-origin",...options});const d=await r.json().catch(()=>({message:"Invalid response"}));if(!r.ok)throw new Error(d.message||"HTTP "+r.status);return d}
function activate(view){document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===view))}
function multiLineChart(id,series,labels,opts={}){const svg=$(id),W=opts.W||1000,H=opts.H||300,pad=40,all=series.flatMap(s=>s.values.map(Number).filter(Number.isFinite));if(!all.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#91a0b5">Bez dat</text>';return}let min=Math.min(...all),max=Math.max(...all);if(min===max){min-=1;max+=1}const x=i=>pad+(W-pad*2)*(labels.length<=1?.5:i/(labels.length-1)),y=v=>H-pad-(H-pad*2)*(v-min)/(max-min);let out='<line x1="'+pad+'" y1="'+(H-pad)+'" x2="'+(W-pad)+'" y2="'+(H-pad)+'" stroke="#24364d"/>';for(let i=0;i<labels.length;i++){if(i===0||i===labels.length-1||i%Math.max(1,Math.floor(labels.length/6))===0)out+='<text x="'+x(i)+'" y="'+(H-10)+'" text-anchor="middle" fill="#91a0b5" font-size="10">'+esc(labels[i])+'</text>'}series.forEach(s=>{const pts=[];s.values.forEach((v,i)=>{if(Number.isFinite(Number(v)))pts.push(x(i)+","+y(Number(v)))});if(pts.length>1)out+='<polyline points="'+pts.join(" ")+'" fill="none" stroke="'+s.stroke+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'});let lx=pad;series.forEach(s=>{out+='<line x1="'+lx+'" y1="16" x2="'+(lx+18)+'" y2="16" stroke="'+s.stroke+'" stroke-width="3"/><text x="'+(lx+24)+'" y="20" fill="#91a0b5" font-size="11">'+esc(s.label)+'</text>';lx+=95+String(s.label).length*4});svg.innerHTML=out}
function chartSvg(id,values,targets,labels,opts={}){const svg=$(id),W=opts.W||700,H=opts.H||250,pad=34,vals=values.map(v=>Number(v)).filter(Number.isFinite),tar=(targets||[]).map(v=>Number(v)).filter(Number.isFinite),all=vals.concat(tar);if(!all.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#8d99aa">Bez dat</text>';return}let min=Math.min(...all),max=Math.max(...all);if(min===max){min-=1;max+=1}const x=i=>pad+(W-pad*2)*(values.length<=1?.5:i/(values.length-1)),y=v=>H-pad-(H-pad*2)*(v-min)/(max-min);let out='<line x1="'+pad+'" y1="'+(H-pad)+'" x2="'+(W-pad)+'" y2="'+(H-pad)+'" stroke="#26303d"/>';const pts=[];values.forEach((v,i)=>{if(Number.isFinite(Number(v))){pts.push(x(i)+","+y(Number(v)));out+='<circle cx="'+x(i)+'" cy="'+y(Number(v))+'" r="3" fill="#7c5cff"/>'}if(labels[i])out+='<text x="'+x(i)+'" y="'+(H-8)+'" text-anchor="middle" fill="#8d99aa" font-size="10">'+esc(labels[i])+'</text>'});if(pts.length>1)out+='<polyline points="'+pts.join(" ")+'" fill="none" stroke="#7c5cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';if(targets?.length){const p=targets.map((v,i)=>Number.isFinite(Number(v))?x(i)+","+y(Number(v)):null).filter(Boolean);if(p.length>1)out+='<polyline points="'+p.join(" ")+'" fill="none" stroke="#34d399" stroke-width="2" stroke-dasharray="6 5"/>'}svg.innerHTML=out}
function barChart(id,values,targets,labels){const svg=$(id),W=700,H=250,pad=28,all=values.concat(targets||[]).map(num),max=Math.max(1,...all)*1.12,bw=(W-pad*2)/Math.max(1,values.length)*.58;let out="";values.forEach((v,i)=>{const x=pad+i*(W-pad*2)/Math.max(1,values.length)+(W-pad*2)/Math.max(1,values.length)*.21,h=num(v)/max*(H-55),ht=num(targets?.[i])/max*(H-55);out+='<rect x="'+x+'" y="'+(H-30-ht)+'" width="'+bw+'" height="'+ht+'" rx="4" fill="#34d399" opacity=".25"/><rect x="'+x+'" y="'+(H-30-h)+'" width="'+bw+'" height="'+h+'" rx="4" fill="#7c5cff"/><text x="'+(x+bw/2)+'" y="'+(H-9)+'" text-anchor="middle" fill="#8d99aa" font-size="10">'+esc(labels[i])+'</text>'});svg.innerHTML=out}
function renderOverview(){
  const d=state.daily||{},f=d.nutrition?.foodLog?.totals||{},target=d.nutrition||{};
  $("overviewDate").textContent=longDate(pragueToday());
  const completed=(d.training?.completed||[]).filter(x=>!isNutritionItem(x));
  const planned=(d.training?.planned||[]).filter(x=>!isNutritionItem(x));
  $("oTraining").textContent=completed.length+" / "+planned.length+" dokončeno";
  $("oTrainingNote").textContent=planned.length?planned.map(x=>x.name||x.type).join(" • "):"Volno";
  const calTarget=Number(target.calorieTarget||d.calories?.target||0);
  const score=nutritionScore({kcal:f.kcal,protein_g:f.protein_g,carbs_g:f.carbs_g,fat_g:f.fat_g},{calorieTarget:calTarget,macros:{protein:target.macros?.protein_g??target.macros?.proteinGrams,carbs:target.macros?.carbs_g??target.macros?.carbsGrams,fat:target.macros?.fat_g??target.macros?.fatGrams}});
  $("oFood").textContent=fmt(f.kcal)+" / "+fmt(calTarget)+" kcal";
  $("oFoodNote").innerHTML=(score==null?"Zatím bez záznamu":scoreBadge(score,"Výživa"));
  const m=macroTargetsOf({daily:{nutrition:{macros:target.macros}}});
  $("oMacros").innerHTML='<div class="macro-line"><b style="color:#60a5fa">P</b><span>'+fmt(f.protein_g)+' / '+fmt(m.protein)+' g</span></div><div class="macro-line"><b style="color:#f59e0b">C</b><span>'+fmt(f.carbs_g)+' / '+fmt(m.carbs)+' g</span></div><div class="macro-line"><b style="color:#a78bfa">F</b><span>'+fmt(f.fat_g)+' / '+fmt(m.fat)+' g</span></div>';
  const sleep=state.sleep?.sessions||[],last=sleep[0],prevSleep=sleep[1];
  const sleepScore=last?Math.round(Math.min(100,Math.max(0,(num(last.durationMin)/480)*70+(num(last.stages?.DEEP)/90)*15+(num(last.stages?.REM)/90)*15))):null;
  const todayPlanTss=planned.reduce((a,z)=>a+num(z.tss),0),todayActualTss=completed.reduce((a,z)=>a+num(z.tss),0);
  const trainingScore=planned.length&&todayPlanTss?Math.round(Math.min(100,todayActualTss/todayPlanTss*100)):(completed.length?100:null);
  $("oRecoverySleep").innerHTML=(sleepScore==null?"—":sleepScore+"%")+trendArrow(last?.durationMin,prevSleep?.durationMin,false," min");
  $("oRecoveryTraining").innerHTML=(trainingScore==null?"—":trainingScore+"%");
  $("oRecoveryNote").textContent="spánek · tréninková shoda";
  const today=pragueToday(),tomorrow=dateShift(today,1),days=state.week?.days||[];
  const compact=days.filter(x=>x.date===today||x.date===tomorrow);
  const renderPlanDay=x=>{
    const p=(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z));
    const a=(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z));
    const items=p.map(z=>{const match=a.find(y=>String(y.pairedEventId||y.paired_event_id||"")===String(z.id||""))||a.find(y=>Math.abs(num(y.tss)-num(z.tss))<=5&&String(y.name||"").toLowerCase().includes(String(z.name||"").toLowerCase().slice(0,12)));return {z,done:Boolean(match),actual:match};});
    a.filter(y=>!p.some(z=>String(z.name||"").toLowerCase()===String(y.name||"").toLowerCase())).forEach(y=>items.push({z:y,done:true}));
    return '<div class="plan-day '+(x.date===today?"today":"")+'"><div class="dow">'+esc(longDate(x.date))+'</div>'+ (items.length?items.map(({z,done,actual})=>'<div class="plan-item '+(done?"done":"")+'"><div class="name">'+esc(z.name||z.type||"Aktivita")+'</div><div class="meta">'+(done?"✓ Dokončeno":"Plán")+(z.durationHours?" · "+fmt(z.durationHours,1)+" h":"")+(z.tss?" · TSS "+fmt(z.tss):"")+(done&&actual?" · skutečně "+fmt(actual.tss):"")+'</div></div>').join(""):'<div class="muted">Volno</div>')+'</div>';
  };
  $("overviewPlan").innerHTML=compact.map(renderPlanDay).join("");
  $("overviewWeekPlan").innerHTML=days.map(renderPlanDay).join("");
  const fw=state.fitness?.wellness||[],latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};
  $("oFitness").innerHTML=(Number.isFinite(Number(latest.ctl))?fmt(latest.ctl):"—")+trendArrow(latest.ctl,prev.ctl,false,"");
  $("oForm").innerHTML=(Number.isFinite(Number(latest.tsb))?fmt(latest.tsb):"—")+trendArrow(latest.tsb,prev.tsb,false,"");
  const wr=(d.weight?.records||[]).filter(x=>x.value_numeric!=null).sort((a,b)=>String(a.sample_time).localeCompare(String(b.sample_time)));
  const currentW=wr.length?Number(wr[wr.length-1].value_numeric):Number(d.weight?.current);
  const weekW=wr.filter(x=>new Date(x.sample_time).getTime()<=Date.now()-7*86400000).slice(-1)[0];
  $("oWeight").innerHTML=Number.isFinite(currentW)?fmt(currentW,1)+trendArrow(currentW,weekW?.value_numeric,true," kg"):"—";
  chartSvg("calChart",days.map(x=>num(x.food?.totals?.kcal)),days.map(x=>num(x.daily?.calories?.target)),days.map(x=>dateLabel(x.date)),{W:1000,H:260});
}
function renderTraining(){
  const days=state.week?.days||[],fw=state.fitness?.wellness||[];
  $("trainingRange").textContent="Týden "+isoWeek(weekStart)+" · "+dateLabel(weekStart)+" – "+dateLabel(dateShift(weekStart,6));
  populateWeekSelectors("trainingWeekSelect","trainingDaySelect",days);
  $("trainingDays").innerHTML=days.map(x=>{
    const a=(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z));
    const p=(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z));
    const plannedTss=p.reduce((s,z)=>s+num(z.tss),0),actualTss=a.reduce((s,z)=>s+num(z.tss),0);
    const plannedHours=p.reduce((s,z)=>s+num(z.durationHours),0),actualHours=a.reduce((s,z)=>s+num(z.durationHours),0); const completion=p.length&&plannedTss?Math.round(actualTss/plannedTss*100):(p.length&&plannedHours?Math.round(actualHours/plannedHours*100):(a.length?100:null));
    return '<div class="day '+(x.date===pragueToday()?"today":"")+'"><div class="dayhead">'+esc(longDate(x.date))+'</div><div class="small">'+fmt(a.reduce((s,z)=>s+num(z.durationHours),0),1)+' h dokončeno</div><div class="bar"><i style="width:'+Math.min(100,completion??0)+'%"></i></div><div class="small">'+(completion==null?"Bez hodnocení":scoreBadge(completion,"Dokončení"))+'</div>'+(a.length?a.map(z=>'<div class="small good">✓ '+esc(z.name||z.type||"Aktivita")+'</div>').join(""):"")+(p.length?p.map(z=>'<div style="margin-top:6px"><span class="pill">PLÁN</span> '+esc(z.name||z.type||"Workout")+'</div>').join(""):'<div class="muted" style="margin-top:6px">Bez plánu</div>')+'</div>';
  }).join("");
  const selected=days.find(x=>x.date===selectedHistoryDate)||days[0];
  if(selected) $("trainingDaySelect").value=selected.date;
  const planned=days.flatMap(x=>(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z)).map(z=>({...z,date:x.date})));
  const completed=days.flatMap(x=>(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z)).map(z=>({...z,date:x.date})));
  $("plannedList").innerHTML=planned.length?planned.map(x=>'<div class="activity"><strong>'+esc(longDate(x.date))+' · '+esc(x.name||"Workout")+'</strong><span class="small">'+esc(x.type||"")+(x.durationHours?" · "+fmt(x.durationHours,1)+" h":"")+(x.tss?" · TSS "+fmt(x.tss):"")+'</span></div>').join(""):'<div class="muted">Nic plánováno.</div>';
  $("completedList").innerHTML=completed.length?completed.slice().reverse().map(x=>'<div class="activity"><strong>'+esc(longDate(x.date))+' · '+esc(x.name||x.type||"Activity")+'</strong><span class="small">'+esc(x.type||"")+(x.durationHours?" · "+fmt(x.durationHours,1)+" h":"")+(x.tss?" · TSS "+fmt(x.tss):"")+(x.calories?" · "+fmt(x.calories)+" kcal":"")+'</span></div>').join(""):'<div class="muted">Zatím nic dokončeno.</div>';
  const latest=fw[fw.length-1]||{},prev=fw[fw.length-8]||{};
  $("tFitness").innerHTML=(Number.isFinite(Number(latest.ctl))?fmt(latest.ctl):"—")+trendArrow(latest.ctl,prev.ctl,false,"");
  $("tFatigue").innerHTML=(Number.isFinite(Number(latest.atl))?fmt(latest.atl):"—")+trendArrow(latest.atl,prev.atl,true,"");
  $("tForm").innerHTML=(Number.isFinite(Number(latest.tsb))?fmt(latest.tsb):"—")+trendArrow(latest.tsb,prev.tsb,false,"");
  $("tRamp").innerHTML=(Number.isFinite(Number(latest.rampRate))?fmt(latest.rampRate,1):"—")+trendArrow(latest.rampRate,prev.rampRate,false,"");
  const labels=fw.map(x=>dateLabel(String(x.id||"").slice(0,10)));
  multiLineChart("pmcChart",[{label:"Fitness",stroke:"#3b82f6",values:fw.map(x=>num(x.ctl))},{label:"Fatigue",stroke:"#ef6b73",values:fw.map(x=>num(x.atl))},{label:"Form",stroke:"#35c48b",values:fw.map(x=>num(x.tsb))}],labels,{W:1000,H:300});
  const form=num(latest.tsb),ramp=num(latest.rampRate);
  $("pmcInsight").textContent=!Number.isFinite(form)?"Bez aktuálních wellness dat.":form<0?"Form je záporný: zátěž je vyšší než dlouhodobá připravenost. Zaměř se na regeneraci a nepřidávej další intenzitu bez důvodu.":ramp>5?"Fitness roste rychleji. Sleduj kumulovanou únavu; další zvyšování objemu má smysl jen při stabilní regeneraci.":"Fitness/form jsou v relativně stabilním pásmu. Pokračuj podle plánu a sleduj vývoj TSB.";
  const tssDays=days.map(x=>{const p=(x.daily?.training?.planned||[]).filter(z=>!isNutritionItem(z)),a=(x.daily?.training?.completed||[]).filter(z=>!isNutritionItem(z));return {date:x.date,planned:p.reduce((s,z)=>s+num(z.tss),0),actual:a.reduce((s,z)=>s+num(z.tss),0)};});
  barChart("tssChart",tssDays.map(x=>x.actual),tssDays.map(x=>x.planned),tssDays.map(x=>dateLabel(x.date)));
  const totalP=tssDays.reduce((s,x)=>s+x.planned,0),totalA=tssDays.reduce((s,x)=>s+x.actual,0);
  $("tssInsight").innerHTML=(totalP?scoreBadge(Math.min(100,Math.round(totalA/totalP*100)),"Týden"):"Bez TSS plánu")+" · "+fmt(totalA)+" / "+fmt(totalP)+" TSS. <span class=\"muted\">Zelený sloupec = plán, modrý = skutečnost.</span>";
  const load=fw.slice(-42); chartSvg("loadChart",load.map(x=>num(x.atlLoad||x.ctlLoad||0)),[],load.map(x=>dateLabel(String(x.id||"").slice(0,10))),{W:1000,H:250});
  const totalHours=days.reduce((s,x)=>s+(x.daily?.training?.completed||[]).reduce((a,z)=>a+num(z.durationHours),0),0);
  $("trainingSummary").innerHTML='<div class="metric-line"><span>Fitness</span><strong>'+fmt(latest.ctl)+trendArrow(latest.ctl,prev.ctl,false,"")+'</strong></div><div class="metric-line"><span>Fatigue</span><strong>'+fmt(latest.atl)+trendArrow(latest.atl,prev.atl,true,"")+'</strong></div><div class="metric-line"><span>Form</span><strong>'+fmt(latest.tsb)+trendArrow(latest.tsb,prev.tsb,false,"")+'</strong></div><div class="metric-line"><span>TSS skutečnost / plán</span><strong>'+fmt(totalA)+' / '+fmt(totalP)+'</strong></div><div class="metric-line"><span>Čas tento týden</span><strong>'+fmt(totalHours,1)+' h</strong></div>';
  const selectedActs=(selected?.daily?.training?.completed||[]).filter(x=>!isNutritionItem(x));
  $("trainingActivityTable").innerHTML='<div class="notice" style="margin-bottom:8px">Vybraný den: <strong>'+esc(selected?longDate(selected.date):"—")+'</strong></div>'+(selectedActs.length?'<div class="scroll"><table><thead><tr><th>Aktivita</th><th>Typ</th><th>TSS</th><th>Délka</th><th>Dokončení</th></tr></thead><tbody>'+selectedActs.map(x=>{const p=(selected?.daily?.training?.planned||[]).find(z=>!isNutritionItem(z)&&(String(x.pairedEventId||"")===String(z.id||"")||String(z.name||"").toLowerCase().slice(0,12)===String(x.name||"").toLowerCase().slice(0,12)));const ratio=p&&num(p.tss)>0?Math.round(num(x.tss)/num(p.tss)*100):(p&&num(p.durationHours)>0?Math.round(num(x.durationHours)/num(p.durationHours)*100):100);return '<tr><td>'+esc(x.name||x.type||"Aktivita")+'</td><td>'+esc(x.type||"")+'</td><td>'+fmt(x.tss)+'</td><td>'+fmt(x.durationHours,1)+' h</td><td>'+scoreBadge(ratio)+'</td></tr>'}).join("")+'</tbody></table></div>':'<div class="muted">Vybraný den nemá dokončenou aktivitu.</div>');
}
function renderNutrition(){
  const days=state.week?.days||[];
  $("nutritionRange").textContent="Týden "+isoWeek(weekStart)+" · "+dateLabel(weekStart)+" – "+dateLabel(dateShift(weekStart,6));
  populateWeekSelectors("nutritionWeekSelect","nutritionDaySelect",days);
  const today=days.find(x=>x.date===pragueToday())||days[days.length-1];
  $("nutritionReason").textContent=today?.daily?.nutrition?.reason||"Denní cíl se adaptuje podle tréninku, hmotnosti a cíle.";
  $("nutritionDays").innerHTML=days.map(x=>{
    const t=num(x.daily?.calories?.target),e=num(x.food?.totals?.kcal),m=macroTargetsOf(x);
    const p=num(x.food?.totals?.protein_g),c=num(x.food?.totals?.carbs_g),f=num(x.food?.totals?.fat_g);
    const score=nutritionScore({kcal:e,protein_g:p,carbs_g:c,fat_g:f},{calorieTarget:t,macros:m});
    return '<div class="day '+(x.date===pragueToday()?"today":"")+'"><div class="dayhead">'+esc(longDate(x.date))+' '+(score==null?'<span class="pill">Bez záznamu</span>':scoreBadge(score))+'</div><div class="value" style="font-size:20px">'+fmt(e)+' / '+fmt(t)+' kcal</div><div class="bar"><i style="width:'+Math.min(100,t?e/t*100:0)+'%"></i></div><div class="macro-lines"><div class="macro-line"><b style="color:#60a5fa">Protein</b><span>'+fmt(p)+' / '+fmt(m.protein)+' g</span></div><div class="macro-line"><b style="color:#f59e0b">Sacharidy</b><span>'+fmt(c)+' / '+fmt(m.carbs)+' g</span></div><div class="macro-line"><b style="color:#a78bfa">Tuk</b><span>'+fmt(f)+' / '+fmt(m.fat)+' g</span></div></div></div>';
  }).join("");
  macroChart("nutritionChart",days);

  const selected=days.find(x=>x.date===selectedHistoryDate)||today;
  if(selected) $("nutritionDaySelect").value=selected.date;
  const mealGroups=selected?.recommendations?.mealRecommendations||[];
  const stores=selected?.recommendations?.storeAlternatives||[];
  $("foodPlan").innerHTML=selected?'<div class="reason">'+esc(selected.recommendations?.coaching||"Doporučení se přepočítává podle dnešního příjmu.")+'</div>'+
    (mealGroups.length?mealGroups.map(group=>'<div style="margin-top:12px"><h3 style="margin-bottom:6px">'+esc(group.label)+'</h3>'+
      (group.recommendations?.length?group.recommendations.slice(0,3).map(r=>'<div class="foodrow"><div><strong>'+esc(r.name||r.title||"Jídlo")+'</strong><div class="small">'+esc(r.recommendation_reason||"")+'</div><div class="small">1 porce · '+fmt(r.kcal||r.calories)+' kcal · P '+fmt(r.protein_g)+' · C '+fmt(r.carbs_g)+' · F '+fmt(r.fat_g)+'</div></div><div class="right">'+scoreBadge(Math.min(100,Math.max(0,Number(r.recommendation_score||0))))+'</div></div>').join(""):'<div class="muted">Pro tuto část dne nemám vhodný recept.</div>')+'</div>').join(""):'<div class="muted">Dnešní zbývající jídla jsou pokrytá.</div>')+
    (stores.length?'<details style="margin-top:12px"><summary>Alternativa z běžného obchodu</summary>'+stores.slice(0,4).map(r=>'<div class="foodrow"><div><strong>'+esc(r.name)+'</strong><div class="small">'+esc(r.reason||"")+'</div></div><div class="right">'+fmt(r.kcal)+' kcal</div></div>').join("")+'</details>':''):'—';

  const nr=state.nutrition?.records||[];
  const selectedFoods=nr.filter(x=>String(x.startTime||"").slice(0,10)===String(selected?.date||""));
  $("nutritionInfo").textContent=selectedFoods.length+" záznamů z Google Health pro "+(selected?.date||"vybraný den");
  $("nutritionRows").innerHTML=(selectedFoods.length?selectedFoods.slice().sort((a,b)=>String(b.startTime).localeCompare(String(a.startTime))).map(x=>'<tr><td>'+esc(x.startTime?new Date(x.startTime).toLocaleString("cs-CZ"):"—")+'</td><td>'+esc(x.foodDisplayName||"—")+'</td><td>'+esc(x.mealType||"—")+'</td><td>'+fmt(x.kcal)+'</td><td>'+fmt(x.protein_g,1)+' g</td><td>'+fmt(x.carbs_g,1)+' g</td><td>'+fmt(x.fat_g,1)+' g</td></tr>').join(""):'<tr><td colspan="7">Pro vybraný den bez Google Health záznamu.</td></tr>');
}
function renderRecovery(){
  const ss=state.sleep?.sessions||[],last=ss[0],range=Number($("sleepRange")?.value||30);
  const filtered=ss.filter(x=>{const t=new Date(x.endTime||x.startTime||0).getTime();return range>=3000||t>=Date.now()-range*86400000;});
  $("rLast").textContent=last?hm(last.durationMin):"—";
  $("rLastMeta").textContent=last?(last.startTime?new Date(last.startTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"")+" → "+(last.endTime?new Date(last.endTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):""):"";
  const avg=filtered.length?filtered.reduce((a,x)=>a+num(x.durationMin),0)/filtered.length:0;
  $("rAvg").textContent=avg?hm(avg):"—";
  $("rAvgLabel").textContent=range>=3000?"all time":range===365?"poslední rok":range===180?"posledních 6 měsíců":range===30?"poslední měsíc":"posledních 7 dní";
  $("rDeep").textContent=last?.stages?.DEEP?hm(last.stages.DEEP):"—"; $("rRem").textContent=last?.stages?.REM?hm(last.stages.REM):"—";
  const sleepScore=last?Math.round(Math.min(100,Math.max(0,(num(last.durationMin)/480)*70+(num(last.stages?.DEEP)/90)*15+(num(last.stages?.REM)/90)*15))):null;
  $("sleepScore").innerHTML=sleepScore!=null?scoreBadge(sleepScore,"Kvalita"):'<span class="muted">Bez dat</span>';
  chartSvg("sleepChart",filtered.slice().reverse().map(x=>num(x.durationMin)/60),[],filtered.slice().reverse().map(x=>dateLabel(x.date)),{W:700,H:250});
  const opts=filtered.map(x=>'<option value="'+esc(x.date)+'">'+esc(longDate(x.date))+'</option>').join("");
  const sd=$("sleepDaySelect"); sd.innerHTML=opts; if(last) sd.value=filtered.find(x=>x.date===selectedHistoryDate)?.date||last.date;
  const selected=filtered.find(x=>x.date===sd.value)||last;
  if(selected){
    const total=Object.values(selected.stages||{}).reduce((a,b)=>a+num(b),0)||1;
    $("sleepStages").innerHTML='<div class="metric-line"><span>Deep</span><strong>'+hm(selected.stages?.DEEP)+'</strong></div><div class="sleep-stage"><i class="stage-deep" style="width:'+num(selected.stages?.DEEP)/total*100+'%"></i></div><div class="metric-line"><span>REM</span><strong>'+hm(selected.stages?.REM)+'</strong></div><div class="sleep-stage"><i class="stage-rem" style="width:'+num(selected.stages?.REM)/total*100+'%"></i></div><div class="metric-line"><span>Light</span><strong>'+hm(selected.stages?.LIGHT)+'</strong></div><div class="sleep-stage"><i class="stage-light" style="width:'+num(selected.stages?.LIGHT)/total*100+'%"></i></div><div class="metric-line"><span>Awake</span><strong>'+hm(selected.stages?.AWAKE)+'</strong></div><div class="sleep-stage"><i class="stage-awake" style="width:'+num(selected.stages?.AWAKE)/total*100+'%"></i></div>';
    $("sleepDayDetail").innerHTML='<div class="card"><div class="label">Datum</div><div class="value" style="font-size:18px">'+esc(longDate(selected.date))+'</div></div><div class="card"><div class="label">Délka</div><div class="value" style="font-size:18px">'+hm(selected.durationMin)+'</div></div><div class="card"><div class="label">Fáze</div><div class="value" style="font-size:18px">D '+hm(selected.stages?.DEEP)+' · REM '+hm(selected.stages?.REM)+'</div></div>';
  } else { $("sleepStages").innerHTML='<div class="muted">Bez dat.</div>'; $("sleepDayDetail").innerHTML='<div class="muted">Bez dat.</div>'; }
  $("sleepRows").innerHTML=ss.map(x=>'<tr><td>'+esc(x.date||"—")+'</td><td>'+esc(x.startTime?new Date(x.startTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"—")+'</td><td>'+esc(x.endTime?new Date(x.endTime).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"—")+'</td><td>'+hm(x.durationMin)+'</td><td>'+hm(x.stages?.DEEP)+'</td><td>'+hm(x.stages?.REM)+'</td><td>'+hm(x.stages?.LIGHT)+'</td><td>'+hm(x.stages?.AWAKE)+'</td></tr>').join("")||'<tr><td colspan="8">Bez dat.</td></tr>';
}
function renderHealth(){const w=state.weight||{};$("hWeight").textContent=fmt(w.latest?.value_numeric,1);$("hAvg7").textContent=fmt(w.average7d,1);$("hAvg30").textContent=fmt(w.average30d,1);$("hActivities").textContent=state.activities?.count||0;const wr=(w.records||[]).slice(-365);chartSvg("healthWeightChart",wr.map(x=>num(x.value_numeric)),[],wr.map(x=>dateLabel(String(x.sample_time).slice(0,10))));const acts=(state.activities?.activities||[]).slice(0,30);$("healthActivityTable").innerHTML=acts.length?'<div class="scroll"><table><thead><tr><th>Datum</th><th>Aktivita</th><th>Typ</th><th>Zdroj</th></tr></thead><tbody>'+acts.map(x=>{let p={};try{p=JSON.parse(x.payload_json||"{}")}catch{}const e=p.exercise||{};return '<tr><td>'+esc(String(x.start_time||"").slice(0,16).replace("T"," "))+'</td><td>'+esc(p.name||p.title||e.displayName||e.exerciseType||"Activity")+'</td><td>'+esc(p.type||p.category||e.exerciseType||"")+'</td><td>'+esc(x.source_family==="intervals"?"Intervals.icu":"Google Health")+'</td></tr>'}).join("")+'</tbody></table></div>':'<div class="muted">Žádné aktivity.</div>'}
function renderGym(){const values=state.gym?.values||[];const rows=values.slice(7).filter(r=>r.some(v=>String(v??"").trim()!==""));$("gymMeta").textContent=(values[2]?.[1]||"Dnešní silový trénink")+" · "+pragueToday();$("gymNotice").textContent=rows.length?rows.filter(r=>String(r[0]||"")==="WORK").length+" pracovních řádků · změny se zapisují zpět do Google Sheets":"Dnešní sheet je prázdný. Můžeš vygenerovat plán.";const start=values.slice(7).findIndex(r=>r.some(v=>String(v??"").trim()!==""));const actualRows=start<0?[]:values.slice(7+start);$("gymRows").innerHTML=actualRows.map((r,i)=>{const idx=i+(start<0?0:start),type=r[0]||"",exercise=r[1]||"";const rawVideo=state.gym?.videoLinks?.[idx+7]||r[10]||"";const formula=String(rawVideo);const formulaUrl=formula.match(/HYPERLINK\(\s*"([^"]+)"/i)?.[1]||"";const video=/^https?:\\/\\//i.test(formula)?formula:formulaUrl||("https://www.youtube.com/results?search_query="+encodeURIComponent(String(exercise||"")+" exercise technique"));return '<tr data-row="'+idx+'"><td><span class="gym-type">'+esc(type)+'</span></td><td><strong>'+esc(exercise)+'</strong></td><td>'+esc(r[2]||"")+'</td><td>'+esc(r[3]||"")+'</td><td>'+esc(r[4]||"")+'</td><td><input data-col="5" value="'+esc(r[5]||"")+'" inputmode="decimal"></td><td><input data-col="6" value="'+esc(r[6]||"")+'" inputmode="numeric"></td><td><input data-col="7" value="'+esc(r[7]||"")+'" inputmode="decimal"></td><td><input data-col="8" type="checkbox" '+(String(r[8]).toUpperCase()==="TRUE"||r[8]===true?"checked":"")+'></td><td><a href="'+esc(video)+'" target="_blank" rel="noopener noreferrer">▶ Video</a></td></tr>'}).join("")||'<tr><td colspan="10" class="muted">Žádný plán.</td></tr>'}
async function loadGym(){state.gym=await jsonFetch("/app/api/gym");renderGym()}
async function saveGym(){const b=$("saveGym");b.disabled=true;b.textContent="Saving…";try{const values=(state.gym?.values||[]).map(r=>Array.isArray(r)?r.slice():[]);const rows=document.querySelectorAll("#gymRows tr[data-row]");rows.forEach(tr=>{const idx=Number(tr.dataset.row)+7;if(!values[idx])values[idx]=[];tr.querySelectorAll("input[data-col]").forEach(inp=>{const c=Number(inp.dataset.col);values[idx][c]=inp.type==="checkbox"?(inp.checked?"TRUE":"FALSE"):inp.value})});const used=values.slice(7);while(used.length&&used[used.length-1].every(v=>String(v??"").trim()===""))used.pop();const result=await jsonFetch("/app/api/gym",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({values:used})});toast(result.sync?.status==="ok"?"Gym workout saved":"Workout saved, sync needs attention");await loadGym()}catch(e){toast("Save selhal: "+e.message)}finally{b.disabled=false;b.textContent="Save workout"}}
async function generateGym(){const b=$("generateGym");b.disabled=true;b.textContent="Generating…";try{await jsonFetch("/app/api/gym/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:pragueToday()})});toast("Today's plan generated");await loadGym()}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent="Generate today's plan"}}
async function load(){ $("topStatus").textContent="Načítám…"; const end=dateShift(weekStart,6); const jobs=[["daily","/app/api/daily"],["fitness","/app/api/fitness?days=90"],["week","/app/api/week?start="+weekStart],["weight","/app/api/weight"],["activities","/app/api/activities"],["nutrition","/app/api/nutrition?start="+weekStart+"&end="+dateShift(end,1)],["sleep","/app/api/sleep?start="+dateShift(pragueToday(),-365)+"&end="+dateShift(pragueToday(),1)],["gym","/app/api/gym"]]; const results=await Promise.allSettled(jobs.map(([,url])=>jsonFetch(url))); state={...state}; let failed=0; results.forEach((r,i)=>{const key=jobs[i][0]; if(r.status==="fulfilled") state[key]=r.value; else {failed++; state[key]={status:"error",message:r.reason?.message||"Načtení selhalo"};}}); try{renderOverview();}catch{} try{renderTraining();}catch{} try{renderNutrition();}catch{} try{renderRecovery();}catch{} try{renderHealth();}catch{} try{renderGym();}catch{} $("topStatus").textContent=failed===0?"Live · "+new Date().toLocaleTimeString("cs-CZ"):(failed<jobs.length?"Částečně načteno":"Data unavailable"); $("topStatus").className=failed===0?"status-label small":failed<jobs.length?"status-label small status-partial":"status-label small status-error"; if(failed) toast("Některá datová služba není dostupná.");}
document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>activate(b.dataset.view));
$("refresh").onclick=async()=>{const b=$("refresh");b.disabled=true;b.textContent="Syncing…";try{const r=await jsonFetch("/app/api/sync",{method:"POST"});toast(r.status==="accepted"?"Synchronizace běží na pozadí. Kontroluji nová data…":"Data synchronized");let n=0;const poll=()=>{n++;b.textContent=n<4?"Syncing…":"Refreshing…";load();if(n<4)setTimeout(poll,4500);else{b.disabled=false;b.textContent="Refresh"}};setTimeout(poll,3000)}catch(e){toast("Sync selhal: "+e.message);b.disabled=false;b.textContent="Refresh"}};
$("prevWeek").onclick=()=>{weekStart=dateShift(weekStart,-7);selectedHistoryDate=weekStart;load()};
$("nextWeek").onclick=()=>{weekStart=dateShift(weekStart,7);selectedHistoryDate=weekStart;load()};
$("thisWeek").onclick=()=>{weekStart=pragueMonday();selectedHistoryDate=weekStart;load()};
$("saveGym").onclick=saveGym;$("generateGym").onclick=generateGym;
$("sleepRange").onchange=renderRecovery;
$("sleepDaySelect").onchange=()=>{selectedHistoryDate=$("sleepDaySelect").value;renderRecovery};
load();
</script>
</body></html>`;
  return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}