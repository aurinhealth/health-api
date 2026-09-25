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
button,input,select{font:inherit}button{cursor:pointer}.shell{display:grid;grid-template-columns:238px minmax(0,1fr);min-height:100vh}.sidebar{background:var(--sidebar);border-right:1px solid var(--line);padding:22px 14px;position:sticky;top:0;height:100vh}.brand{padding:3px 10px 24px}.brand strong{display:block;font-size:18px;letter-spacing:-.02em}.brand span{color:var(--muted);font-size:12px}.nav{display:grid;gap:5px}.nav button{border:1px solid transparent;background:transparent;color:var(--muted);padding:11px 12px;border-radius:10px;text-align:left;font-weight:650}.nav button:hover{background:var(--panel2);color:var(--text)}.nav button.active{background:rgba(59,130,246,.15);border-color:rgba(59,130,246,.36);color:#fff}.sidebar-foot{position:absolute;bottom:18px;left:24px;right:18px;color:var(--muted);font-size:11px}.main{min-width:0}.topbar{height:72px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 30px;position:sticky;top:0;background:rgba(7,16,29,.94);backdrop-filter:blur(12px);z-index:5}.top-title{font-size:17px;font-weight:750}.top-sub{color:var(--muted);font-size:12px}.actions{display:flex;gap:8px;align-items:center}.status-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);display:inline-block}.btn{border:1px solid var(--line);background:var(--panel2);color:var(--text);padding:9px 12px;border-radius:9px;font-weight:650}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn:hover{filter:brightness(1.08)}.content{max-width:1500px;padding:26px 30px 70px;margin:0 auto}.view{display:none}.view.active{display:block}.hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:22px}.eyebrow{color:var(--accent2);font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:750}.hero h1{margin:3px 0 4px;font-size:30px;letter-spacing:-.035em}.hero p{margin:0;color:var(--muted)}.section{font-size:17px;font-weight:750;margin:24px 0 12px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0;box-shadow:0 6px 20px rgba(0,0,0,.16)}.card h3{font-size:14px;margin:0 0 13px}.label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;font-weight:700}.value{font-size:26px;font-weight:800;letter-spacing:-.03em;margin-top:3px}.small{font-size:12px;color:var(--muted)}.muted{color:var(--muted)}.pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#202936;color:#cbd4df;font-size:11px;font-weight:650}.good{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.accent{color:var(--accent2)}.weekbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.weeknav{display:flex;gap:6px}.weeknav .btn{padding:7px 10px}.weektitle{font-weight:750}.daygrid{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:8px}.day{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:11px;min-height:155px}.day.today{border-color:var(--accent);box-shadow:inset 0 0 0 1px rgba(124,92,255,.18)}.dayhead{font-weight:700}.bar{height:6px;background:#242c37;border-radius:99px;overflow:hidden;margin:8px 0}.bar i{display:block;height:100%;background:var(--accent);border-radius:99px}.macro-p{background:#60a5fa!important}.macro-c{background:#f59e0b!important}.macro-f{background:#a78bfa!important}.trend{font-size:12px;font-weight:700;margin-top:5px}.score{font-size:11px;font-weight:750;padding:3px 7px;border-radius:999px;background:rgba(53,196,139,.12);color:var(--ok);white-space:nowrap}.score.mid{background:rgba(233,180,76,.12);color:var(--warn)}.score.low{background:rgba(239,107,115,.12);color:var(--bad)}.macro-lines{display:grid;gap:5px;margin-top:8px}.macro-line{display:flex;justify-content:space-between;gap:8px;font-size:11px}.macro-line b{font-weight:750}.reason{padding:10px 12px;border-left:3px solid var(--accent);background:rgba(59,130,246,.07);border-radius:7px;margin-bottom:10px}.compact-plan{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.compact-plan .plan-day{min-height:120px}.select-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.select-row select{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:7px 9px}.stack-chart{width:100%;height:300px;display:block}.bar.ok i{background:var(--ok)}.activity{padding:10px 0;border-bottom:1px solid var(--line)}.activity:last-child{border-bottom:0}.activity strong{display:block}.right{text-align:right;white-space:nowrap}.foodrow{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid var(--line)}.foodrow:last-child{border-bottom:0}.scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:middle}th{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700}.chart{width:100%;height:250px;display:block}.legend{display:flex;gap:16px;color:var(--muted);font-size:11px}.metric-line{display:flex;justify-content:space-between;gap:10px;margin:7px 0}.gym-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.gym-table input{width:82px;background:#0c1118;border:1px solid var(--line);color:var(--text);border-radius:7px;padding:7px}.gym-table input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent)}.gym-table a{color:#b9aaff;text-decoration:none;font-weight:650}.gym-table a:hover{text-decoration:underline}.gym-type{font-size:10px;color:var(--muted);font-weight:750;letter-spacing:.05em}.sleep-stage{display:flex;height:16px;border-radius:7px;overflow:hidden;background:#202733}.sleep-stage i{display:block}.stage-deep{background:#5b4ae8}.stage-rem{background:#a06cf7}.stage-light{background:#4cc9f0}.stage-awake{background:#f5b74b}.notice{padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:rgba(59,130,246,.07);color:#cbd4df}.toast{position:fixed;right:22px;bottom:22px;background:#122033;border:1px solid var(--line);padding:12px 15px;border-radius:10px;box-shadow:0 14px 40px #0008;display:none;z-index:20}.status-error{color:var(--bad)}.status-partial{color:var(--warn)}.plan-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;width:100%}.plan-grid .plan-day{min-width:0}.plan-grid .plan-item{overflow-wrap:anywhere}.plan-day{background:#0d1828;border:1px solid var(--line);border-radius:10px;padding:12px;min-height:142px}.plan-day.today{border-color:var(--accent);box-shadow:inset 0 0 0 1px rgba(59,130,246,.18)}.plan-day .dow{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.plan-day .date{font-weight:750;margin:2px 0 10px}.plan-item{padding:8px 9px;border-left:3px solid var(--accent);background:#122238;border-radius:7px;margin-top:7px}.plan-item.done{border-left-color:var(--ok)}.plan-item .name{font-weight:700;font-size:12px}.plan-item .meta{font-size:11px;color:var(--muted);margin-top:2px}.macro-bar-chart{width:100%;height:300px;display:block}.history-workout{padding:10px 0;border-bottom:1px solid var(--line)}.history-workout:last-child{border-bottom:0}.history-workout strong{display:block}.history-sets{display:grid;gap:4px;margin-top:5px}.history-set{font-size:12px;color:var(--muted)}.coach-card{background:#0d1828;border:1px solid var(--line);border-radius:12px;padding:14px}.coach-card.ready{border-color:rgba(53,196,139,.55)}.coach-card.caution{border-color:rgba(245,158,11,.65)}.coach-card.missing-data{border-color:rgba(239,107,115,.55)}.coach-card h3{margin:0 0 5px}.coach-actions{margin:10px 0 0;padding-left:18px}.coach-actions li{margin:5px 0;color:#d8e0ea}.axis-label{font-size:10px;fill:#91a0b5}.toast.show{display:block}
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
    <div class="card"><div class="label">Hmotnost</div><div id="oWeight" class="value">—</div><div id="oWeightMeta" class="small">aktuálně · cíl 80 kg</div></div>
    <div class="card"><div class="label">Spánek</div><div id="oSleep" class="value">—</div><div id="oSleepMeta" class="small">recovery vs. 30 dní</div></div>
    <div class="card"><div class="label">Fitness</div><div id="oFitness" class="value">—</div><div class="small">CTL · Intervals.icu</div></div>
    <div class="card"><div class="label">Form</div><div id="oForm" class="value">—</div><div class="small">TSB · dnes</div></div>
  </div>
  <div class="grid2" style="margin-top:12px">
    <div class="card"><div class="label">Dnešní trénink</div><div id="oTraining" class="value">—</div><div id="oTrainingNote" class="small"></div></div>
    <div class="card"><div class="label">Dnešní výživa</div><div id="oFood" class="value">—</div><div id="oFoodNote" class="small"></div><div id="oMacros" class="macro-lines"></div></div>
  </div>
  <div class="section">Tým odborných poradců</div><div class="card coach-council"><div id="coachPriorities"></div><div id="coachCards" class="grid3" style="margin-top:12px"></div><details style="margin-top:12px"><summary>Pravidla a použité důkazy</summary><div id="coachGuardrails" class="small" style="margin-top:8px"></div></details></div>
  <div class="section">Týdenní tréninkový plán</div><div class="card"><div id="overviewWeekPlan" class="plan-grid"></div></div>
  <div class="card" style="margin-top:12px"><h3>Kalorie · cíl vs. příjem</h3><svg id="calChart" class="stack-chart" style="height:440px" viewBox="0 0 1000 440"></svg></div>
</section>

<section id="training" class="view">
  <div class="weekbar"><div><div class="eyebrow">Training management</div><div class="section" style="margin:2px 0">Tréninkový týden</div><div id="trainingRange" class="small"></div></div><div class="select-row"><select id="trainingWeekSelect"></select><div class="weeknav"><button class="btn" id="prevWeek">←</button><button class="btn" id="thisWeek">Tento týden</button><button class="btn" id="nextWeek">→</button></div></div></div>
  <div class="grid" style="margin-top:12px">
    <div class="card"><div class="label">Fitness</div><div id="tFitness" class="value">—</div><div class="small">CTL · 42denní trend</div></div>
    <div class="card"><div class="label">Fatigue</div><div id="tFatigue" class="value">—</div><div class="small">ATL · 7denní trend</div></div>
    <div class="card"><div class="label">Form</div><div id="tForm" class="value">—</div><div class="small">TSB = Fitness − Fatigue</div></div>
    <div class="card"><div class="label">Ramp rate</div><div id="tRamp" class="value">—</div><div class="small">změna Fitness</div></div>
  </div>
  <div class="section">Týdenní plán · skutečnost</div>
  <div class="card"><div id="trainingWeekOverview" class="plan-grid"></div></div>
  <div class="card" style="margin-top:12px"><h3>Fitness · Fatigue · Form</h3><svg id="pmcChart" class="chart" style="height:420px" viewBox="0 0 1000 420"></svg><div id="pmcInsight" class="notice" style="margin-top:10px"></div></div>
  <div class="card" style="margin-top:12px"><h3>Týdenní zátěž · plán a skutečnost</h3><svg id="tssChart" class="chart" style="height:320px" viewBox="0 0 1000 320"></svg><div id="tssInsight" class="notice" style="margin-top:10px"></div></div>
  <div class="grid2" style="margin-top:12px">
    <div class="card"><h3>Tréninkový load · posledních 42 dní</h3><svg id="loadChart" class="chart" viewBox="0 0 1000 250"></svg></div>
    <div class="card"><h3>Aktivity · historie</h3><div id="trainingSummary" class="small"></div><div id="trainingActivityTable"></div></div>
  </div>

  <div class="grid2" style="margin-top:12px"><div class="card"><h3>Plánované aktivity</h3><div id="plannedList"></div></div><div class="card"><h3>Dokončené aktivity</h3><div id="completedList"></div></div></div>
</section>

<section id="gym" class="view">
  <div class="hero"><div><div class="eyebrow">Strength management</div><h1>Gym</h1><p id="gymMeta">Dnešní silový trénink</p></div><div class="actions"><button class="btn" id="generateGym">Generate today's plan</button><button class="btn" id="addGymExercise">＋ Přidat cvik</button><button class="btn primary" id="saveGym">Save workout</button></div></div>
  <div class="notice" id="gymNotice">Načítám dnešní trénink…</div>
  <div class="card" style="margin-top:12px"><div class="scroll"><table class="gym-table"><thead><tr><th>Typ</th><th>Cvik</th><th>Série</th><th>Plán kg</th><th>Plán reps</th><th>Skutečně kg</th><th>Skutečně reps</th><th>RPE</th><th>Hotovo</th><th>Video</th></tr></thead><tbody id="gymRows"></tbody></table></div></div><div class="card" style="margin-top:12px"><details><summary>Historie silových tréninků</summary><div id="gymHistory" style="margin-top:10px"></div></details></div>
</section>

<section id="recovery" class="view">
  <div class="hero"><div><div class="eyebrow">Recovery intelligence</div><h1>Recovery & spánek</h1><p>Spánek, délka a rozložení jednotlivých fází</p></div></div>
  <div class="grid">
    <div class="card"><div class="label">Poslední noc</div><div id="rLast" class="value">—</div><div class="small" id="rLastMeta"></div></div>
    <div class="card"><div class="label">Průměr</div><div id="rAvg" class="value">—</div><div class="small" id="rAvgLabel">posledních 14 dní</div></div>
    <div class="card"><div class="label">Deep</div><div id="rDeep" class="value">—</div><div class="small">poslední noc</div></div>
    <div class="card"><div class="label">REM</div><div id="rRem" class="value">—</div><div class="small">poslední noc</div></div>
  </div>
  <div class="grid2" style="margin-top:12px"><div class="card"><div class="select-row"><h3 style="margin-right:auto">Spánek · historie</h3><select id="sleepRange"><option value="7">7 dní</option><option value="30">Měsíc</option><option value="180">6 měsíců</option><option value="365">1 rok</option><option value="3650">All time</option></select></div><svg id="sleepChart" class="chart" viewBox="0 0 760 300"></svg><div id="sleepTrendMeta" class="small" style="margin-top:6px"></div></div><div class="card"><h3>Poslední noc · fáze</h3><div id="sleepScore" style="margin-bottom:10px"></div><div id="sleepStages"></div></div></div>
  <div class="card" style="margin-top:12px"><details open><summary>Historie nocí</summary><div id="sleepRows" style="margin-top:10px"></div></details></div>
</section>

<section id="nutrition" class="view">
  <div class="weekbar"><div><div class="eyebrow">Nutrition intelligence</div><div class="section" style="margin:2px 0">Výživa</div><div id="nutritionRange" class="small"></div><div id="nutritionReason" class="small" style="margin-top:5px"></div><div id="nutritionTargetSummary" class="notice" style="margin-top:8px"></div></div><div class="select-row"><select id="nutritionWeekSelect"></select><select id="nutritionDaySelect"></select></div></div>
  <div class="daygrid" id="nutritionDays"></div>
  <div class="grid2" style="margin-top:12px"><div class="card"><h3>Kalorie · cíl vs. příjem</h3><svg id="nutritionChart" class="stack-chart" style="height:440px" viewBox="0 0 1000 440"></svg></div><div class="card"><h3>Co dál dnes?</h3><div id="foodPlan"></div></div></div>
  <div class="section">Google Health · historie jídel</div><div class="card"><details><summary>Historie jídel ▾</summary><div id="nutritionInfo" class="small" style="margin:10px 0"></div><div id="nutritionRows"></div></details></div>
</section>

<section id="health" class="view">
  <div class="hero"><div><div class="eyebrow">Health data</div><h1>Health data</h1><p>Historie pohybu, hmotnosti a zdrojových dat</p></div></div>
  <div class="grid"><div class="card"><div class="label">Hmotnost</div><div id="hWeight" class="value">—</div><div class="small">kg</div></div><div class="card"><div class="label">7denní průměr</div><div id="hAvg7" class="value">—</div><div class="small">kg</div></div><div class="card"><div class="label">30denní průměr</div><div id="hAvg30" class="value">—</div><div class="small">kg</div></div><div class="card"><div class="label">Aktivity</div><div id="hActivities" class="value">—</div><div class="small">záznamů</div></div></div>
  <div class="card" style="margin-top:12px"><h3>Vývoj hmotnosti</h3><svg id="healthWeightChart" class="chart" style="height:360px" viewBox="0 0 1000 360"></svg><div id="weightHistory"></div></div>
</section>
</div></main></div>
<div id="toast" class="toast"></div>
<script src="/app/dashboard-client.js?v=20260925-18" defer></script>
</body></html>`;
  return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}
