export function dashboardPage() {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Petr Fitness Data — Dashboard</title>
<style>
:root{color-scheme:dark;--bg:#0b0d10;--card:#151922;--line:#28303b;--text:#f3f4f6;--muted:#9ca3af;--accent:#8b5cf6;--ok:#34d399;--warn:#f59e0b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:28px 20px 60px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:24px}
h1{font-size:28px;margin:0 0 4px}.sub{color:var(--muted)}button{border:0;border-radius:10px;padding:10px 14px;background:var(--accent);color:white;font-weight:700;cursor:pointer}
input{width:320px;max-width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#0f1319;color:var(--text)}
.auth{background:var(--card);border:1px solid var(--line);padding:16px;border-radius:14px;margin-bottom:20px}.authrow{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.status{color:var(--muted);margin-top:8px}.status.ok{color:var(--ok)}.status.err{color:#f87171}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}.label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}.value{font-size:25px;font-weight:750;margin-top:4px}.small{font-size:12px;color:var(--muted)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 6px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:12px}
.section{margin:22px 0 10px;font-size:18px;font-weight:700}.pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#202733;color:#d1d5db;font-size:12px}
@media(max-width:850px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.grid2{grid-template-columns:1fr}.top{flex-direction:column}}
@media(max-width:520px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
  <div class="top">
    <div><h1>Petr Fitness Data</h1><div class="sub">Personal training, health and nutrition dashboard</div></div>
    <button id="refresh">Refresh</button>
  </div>

  <section class="auth">
    <div><strong>Dashboard access</strong></div>
    <div class="small">Your dashboard session is authenticated server-side. The API key is never stored in the browser.</div>
    <div class="authrow" style="margin-top:10px"><input id="key" type="password" autocomplete="current-password" placeholder="Dashboard access key"><button id="connect">Sign in</button><button id="logout" hidden>Sign out</button></div>
    <div id="status" class="status">Not connected.</div>
  </section>

  <div id="content" hidden>
    <div class="section">Today</div>
    <div class="grid">
      <div class="card"><div class="label">Calories target</div><div id="calTarget" class="value">—</div><div class="small">kcal</div></div>
      <div class="card"><div class="label">Estimated TDEE</div><div id="tdee" class="value">—</div><div class="small">kcal</div></div>
      <div class="card"><div class="label">Weight</div><div id="weight" class="value">—</div><div class="small">kg</div></div>
      <div class="card"><div class="label">Protein target</div><div id="protein" class="value">—</div><div class="small">g</div></div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Food logged</div><div id="foodKcal" class="value">—</div><div class="small">kcal</div></div>
      <div class="card"><div class="label">Protein logged</div><div id="foodProtein" class="value">—</div><div class="small">g</div></div>
      <div class="card"><div class="label">Carbs logged</div><div id="foodCarbs" class="value">—</div><div class="small">g</div></div>
      <div class="card"><div class="label">Fat logged</div><div id="foodFat" class="value">—</div><div class="small">g</div></div>
    </div>

    <div class="section">Training</div>
    <div class="grid2">
      <div class="card"><strong>Completed activities</strong><div id="completed" class="small" style="margin-top:10px">—</div></div>
      <div class="card"><strong>Planned workouts</strong><div id="planned" class="small" style="margin-top:10px">—</div></div>
    </div>

    <div class="section">Recent weight</div>
    <div class="card"><table><thead><tr><th>Date</th><th>Weight</th><th>Unit</th></tr></thead><tbody id="weights"></tbody></table></div>

    <div class="section">Google Health nutrition</div>
    <div class="card"><div id="nutritionInfo" class="small">—</div><div style="overflow:auto;margin-top:10px"><table><thead><tr><th>Time</th><th>Food</th><th>Meal</th></tr></thead><tbody id="nutritionRows"></tbody></table></div></div>
  </div>
</main>
<script>
const $=id=>document.getElementById(id);
function n(v,unit=""){return v==null||Number.isNaN(Number(v))?"—":Math.round(Number(v)*10)/10+(unit?" "+unit:"")}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
async function jsonFetch(path,options={}){
  const r=await fetch(path,{credentials:"same-origin",...options});
  const d=await r.json().catch(()=>({message:"Invalid response"}));
  if(!r.ok){const e=new Error(d.message||"HTTP "+r.status);e.status=r.status;throw e}
  return d
}
async function login(){
  const key=$("key").value.trim();
  if(!key){$("status").textContent="Enter the dashboard access key.";return}
  $("status").textContent="Signing in…";$("status").className="status";
  try{
    await jsonFetch("/app/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key})});
    $("key").value="";$("key").placeholder="Session active";$("key").disabled=true;
    $("connect").hidden=true;$("logout").hidden=false;
    await loadData();
  }catch(e){$("status").textContent="Sign-in failed: "+e.message;$("status").className="status err"}
}
async function logout(){
  await fetch("/app/logout",{method:"POST",credentials:"same-origin"});
  $("content").hidden=true;$("key").disabled=false;$("key").placeholder="Dashboard access key";
  $("connect").hidden=false;$("logout").hidden=true;$("status").textContent="Signed out."; $("status").className="status";
}
async function loadData(){
  $("status").textContent="Loading…";$("status").className="status";
  try{
    const [daily,nutrition]=await Promise.all([jsonFetch("/app/api/daily"),jsonFetch("/app/api/nutrition")]);
    $("content").hidden=false;
    $("calTarget").textContent=n(daily.calories?.target);$("tdee").textContent=n(daily.calories?.estimatedTDEE);
    $("weight").textContent=n(daily.weight?.current);$("protein").textContent=n(daily.nutrition?.protein);
    const ft=daily.nutrition?.foodLog?.totals||{};$("foodKcal").textContent=n(ft.kcal);$("foodProtein").textContent=n(ft.protein_g);$("foodCarbs").textContent=n(ft.carbs_g);$("foodFat").textContent=n(ft.fat_g);
    const c=daily.training?.completed||[],p=daily.training?.planned||[];
    $("completed").innerHTML=c.length?c.slice(0,8).map(x=>'<div style="margin-bottom:7px"><span class="pill">'+esc(x.type||x.name||"Activity")+'</span> '+esc(x.name||"")+'</div>').join(""):"None";
    $("planned").innerHTML=p.length?p.slice(0,8).map(x=>'<div style="margin-bottom:7px"><span class="pill">'+esc(x.type||x.name||"Workout")+'</span> '+esc(x.name||"")+'</div>').join(""):"None";
    const rows=daily.weight?.records||[];$("weights").innerHTML=rows.slice(-14).reverse().map(x=>'<tr><td>'+esc(x.date||x.sample_time||x.sample||"")+'</td><td>'+n(x.value??x.weight??x.value_numeric)+'</td><td>'+esc(x.unit||x.value_unit||"kg")+'</td></tr>').join("")||'<tr><td colspan="3">No records</td></tr>';
    const nr=nutrition.records||[];$("nutritionInfo").textContent=(nr.length||0)+" Google Health nutrition records returned.";
    $("nutritionRows").innerHTML=nr.slice(-30).reverse().map(x=>'<tr><td>'+esc(x.startTime||x.start_time||x.sampleTime||"")+'</td><td>'+esc(x.foodDisplayName||x.food_display_name||x.name||"Nutrition entry")+'</td><td>'+esc(x.mealType||x.meal_type||"")+'</td></tr>').join("")||'<tr><td colspan="3">No Google Health nutrition records found.</td></tr>';
    $("status").textContent="Connected • last refresh "+new Date().toLocaleTimeString();$("status").className="status ok";
  }catch(e){
    if(e.status===401){$("content").hidden=true;$("key").disabled=false;$("key").placeholder="Dashboard access key";$("connect").hidden=false;$("logout").hidden=true;$("status").textContent="Session expired. Sign in again."}
    else $("status").textContent="Error: "+e.message;
    $("status").className="status err";
  }
}
$("connect").onclick=login;$("logout").onclick=logout;$("refresh").onclick=loadData;
</script>
</body></html>`;
  return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}
