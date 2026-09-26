import app from "./sheets-gateway.js";
import { buildCoachCouncil } from "./coach-engine.js";
import { handleMcpCompat } from "./mcp-compat.js";
import { handleOAuthCompat } from "./oauth-compat.js";
import { syncDailyNutritionNotes, deleteDailyNutritionNotes } from "./intervals-nutrition-notes.js";
import { verifyGitHubActionsToken } from "./github-oidc.js";
import { dashboardPage } from "./dashboard.js";
import { connectionStatus } from "./connections.js";
import { whoopOAuth, whoopData } from "./whoop.js";
import { connectionEnvironment, saveConnectionSecret } from "./connection-secrets.js";
import { resolveFood, calculateAmount } from './food-sources.js';
import { parseNutritionLabel } from './food-label.js';
import dashboardClient from "./dashboard-client.js";
import { handleGoogleOAuth } from "./google-oauth.js";
import { importStrengthHistory, getStrengthHistory } from "./strength-history.js";
import { searchCookbookRecipes, logFood } from "./food-log.js";
import legacyHealthApi from "./index.js";

const OPENAPI_URL = "https://raw.githubusercontent.com/shaarkyn/health-api/main/openapi.json";

export default {
  async scheduled(controller, env, ctx) {
    env = await connectionEnvironment(env);
    return app.scheduled(controller, env, ctx);
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Static assets stay independent of provider storage availability.
    if (url.pathname !== '/app' && url.pathname !== '/app/dashboard-client.js') env = await connectionEnvironment(env);
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
    if (url.pathname.startsWith('/oauth/whoop')) return whoopOAuth(request, env, await verifyDashboardSession(request, env.STRENGTH_API_KEY));
    if (url.pathname.startsWith('/oauth/google') && !(await verifyDashboardSession(request, env.STRENGTH_API_KEY))) return new Response('Připojení vyžaduje přihlášení do dashboardu.',{status:401});
    const googleOAuth = await handleGoogleOAuth(request, env, url.pathname);
    if (googleOAuth) return googleOAuth;
    if (url.pathname === "/app" && request.method === "GET") return dashboardPage();
    if (url.pathname === "/app/dashboard-client.js" && request.method === "GET") return new Response(dashboardClient, { status: 200, headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" } });
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

function pragueToday() {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  return parts.find(x=>x.type==="year").value+"-"+parts.find(x=>x.type==="month").value+"-"+parts.find(x=>x.type==="day").value;
}

async function ensureCoachInboxTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS coach_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    message TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coach_inbox_created ON coach_inbox(created_at DESC)`).run();
}

function coachChannel(value, message) {
  const requested=String(value||"").toLowerCase();
  if (["cycling","gym","nutrition","food"].includes(requested)) return requested;
  const t=String(message||"").toLowerCase();
  if (/j[ií]d|recept|kalori|protein|sachar|sni?d|ob[eě]d|ve[cč]eř|zapsat/.test(t)) return "nutrition";
  if (/posil|gym|dřep|drep|bench|mrtv|s[eé]ri/.test(t)) return "gym";
  return "cycling";
}

async function createCoachDraft(env, ctx, internalAuth, body) {
  const message=String(body?.message||"").trim();
  if(!message) throw new Error("Napiš zprávu pro trenéra.");
  const channel=coachChannel(body?.channel,message), date=String(body?.date||pragueToday()).slice(0,10);
  let reply="", action={type:"advice",date};
  if(channel==="gym") {
    const r=await app.fetch(new Request("https://internal/strength/generate-plan",{method:"POST",headers:{...internalAuth,"Content-Type":"application/json"},body:JSON.stringify({date,preview:true})}),env,ctx);
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.status!=="ok") throw new Error(d.message||"Gym plán se nepodařilo připravit.");
    const rows=(d.plan?.rows||[]).filter(x=>String(x.type||"").toUpperCase()==="WORK");
    reply=`Připravil jsem návrh ${d.plan?.planName||"silového tréninku"}: ${[...new Set(rows.map(x=>x.exercise))].slice(0,4).join(" · ")}. Je postavený podle regenerace, cyklistiky a tvé historie.`;
    action={type:"gym_generate",date};
  } else if(channel==="nutrition") {
    const page=Number((message.match(/(?:str(?:ana|\.)?|page)\s*(\d{1,3})/i)||[])[1]);
    const recipes=await searchCookbookRecipes({page:Number.isFinite(page)&&page>0?page:undefined,name:Number.isFinite(page)&&page>0?undefined:message,limit:3});
    const recipe=recipes.recipes?.[0]||null;
    if(recipe) {
      reply=`Našel jsem v kuchařce „${recipe.name}“${recipe.page?` (str. ${recipe.page})`:""}: ${Math.round(Number(recipe.calories||0))} kcal · B ${Math.round(Number(recipe.protein_g||0))} g · S ${Math.round(Number(recipe.carbs_g||0))} g · T ${Math.round(Number(recipe.fat_g||0))} g. Potvrzením ho zapíšeš do dnešní výživy.`;
      action={type:"food_log",date,page:recipe.page,name:recipe.name};
    } else reply="V kuchařce jsem nenašel jednoznačný recept. Napiš název receptu nebo číslo strany a připravím zápis.";
  } else {
    reply=channel==="cycling"?"Cyklistický trenér bere kolo jako hlavní prioritu. Pro přesný návrh napiš délku, typ jízdy a zda chceš plán nebo kontrolu existující jednotky.":"Připravil jsem doporučení.";
  }
  const draft={channel,message,date,reply,action};
  const ins=await env.DB.prepare("INSERT INTO coach_inbox(channel,message,draft_json) VALUES(?,?,?)").bind(channel,message,JSON.stringify(draft)).run();
  return {status:"ok",draftId:ins.meta?.last_row_id,draft};
}

async function handleCoachInbox(request, env, ctx, internalAuth) {
  try {
    await ensureCoachInboxTable(env.DB);
    if(request.method==="GET") {
      const rows=await env.DB.prepare("SELECT id,channel,message,draft_json,status,created_at,confirmed_at FROM coach_inbox ORDER BY id DESC LIMIT 30").all();
      return Response.json({status:"ok",items:(rows.results||[]).map(r=>({...r,draft:JSON.parse(r.draft_json||"{}")}))},{headers:{"Cache-Control":"no-store"}});
    }
    const body=await request.json().catch(()=>({}));
    if(body?.action!=="confirm") return Response.json(await createCoachDraft(env,ctx,internalAuth,body),{headers:{"Cache-Control":"no-store"}});
    const id=Number(body?.draftId); if(!id) return Response.json({status:"error",message:"Chybí návrh k potvrzení."},{status:400});
    const row=await env.DB.prepare("SELECT * FROM coach_inbox WHERE id=?").bind(id).first();
    if(!row) return Response.json({status:"error",message:"Návrh už neexistuje."},{status:404});
    if(row.status==="confirmed") return Response.json({status:"ok",message:"Tento návrh už je potvrzený."});
    const draft=JSON.parse(row.draft_json||"{}"); let result={status:"ok"};
    if(draft.action?.type==="gym_generate") {
      const r=await app.fetch(new Request("https://internal/strength/generate-plan",{method:"POST",headers:{...internalAuth,"Content-Type":"application/json"},body:JSON.stringify({date:draft.date})}),env,ctx);
      result=await r.json().catch(()=>({status:"error",message:"Neplatná odpověď Gymu"})); if(!r.ok||result.status!=="ok") throw new Error(result.message||"Gym plán se nepodařilo uložit.");
    }
    if(draft.action?.type==="food_log") result=await logFood(env.DB,{date:draft.date,page:draft.action.page,name:draft.action.name,source:"cookbook",note:"Zapsáno ze schránky trenérů"});
    await env.DB.prepare("UPDATE coach_inbox SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
    return Response.json({status:"ok",message:draft.action?.type==="food_log"?"Jídlo je zapsané ve výživě.":draft.action?.type==="gym_generate"?"Gym plán je uložený a odeslaný do tréninku.":"Doporučení potvrzeno.",result},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return Response.json({status:"error",message:error.message},{status:500}); }
}

async function handleDashboardApi(request, env, ctx, url) {
  const internalAuth = { "Authorization": "Bearer " + String(env.STRENGTH_API_KEY || "") };

  if(url.pathname==='/app/api/food/day'&&request.method==='GET'){
    const target=new URL('/food/log',request.url);target.searchParams.set('date',url.searchParams.get('date')||pragueToday());
    return legacyHealthApi.fetch(new Request(target,{headers:internalAuth}),env,ctx);
  }

  if(url.pathname==='/app/api/food/search'&&request.method==='POST'){
    try {const body=await request.json();return Response.json(await resolveFood({name:String(body.name||'').slice(0,180),barcode:String(body.barcode||'').slice(0,24),limit:12}),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:'Databáze potravin právě neodpovídá. Zkus to znovu nebo načti etiketu.',detail:String(error.message).slice(0,160)},{status:502});}
  }
  if(url.pathname==='/app/api/food/label'&&request.method==='POST'){
    const body=await request.json().catch(()=>({}));return Response.json({status:'ok',values:parseNutritionLabel(String(body.text||'').slice(0,12000))});
  }
  if(url.pathname==='/app/api/food/log'&&request.method==='POST'){
    try {const body=await request.json(),p=body.product||{},grams=Number(body.grams);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(body.date)||!String(p.name||'').trim()||!Number.isFinite(grams)||grams<=0||grams>10000) return Response.json({message:'Zkontroluj název, datum a množství.'},{status:400});
      for(const field of ['calories_100g','protein_100g','carbs_100g','fat_100g'])if(p[field]==null||p[field]===''||!Number.isFinite(Number(p[field]))||Number(p[field])<0||Number(p[field])>(field==='calories_100g'?1000:100))return Response.json({message:'Doplň a ověř energii i všechna tři makra na 100 g.'},{status:400});
      const amount=calculateAmount(p,grams);
      const saved=await legacyHealthApi.fetch(new Request(new URL('/food/log',request.url),{method:'POST',headers:{...internalAuth,'Content-Type':'application/json'},body:JSON.stringify({date:body.date,name:String(p.name).slice(0,180),kcal:amount.calories,protein_g:amount.protein_g,carbs_g:amount.carbs_g,fat_g:amount.fat_g,fiber_g:amount.fiber_g,source:p.source==='openfoodfacts'?'openfoodfacts':'package_label',note:JSON.stringify({grams,barcode:p.barcode||null,brand:p.brand||null,mealType:body.mealType||'snack',salt_g:amount.salt_g,source_url:p.source_url||null})})}),env,ctx);
      const result=await saved.json();if(!saved.ok)throw new Error('Uložení selhalo.');
      return Response.json({...result,message:'Jídlo je uložené do denního příjmu.'},{headers:{'Cache-Control':'no-store'}});
    }catch{return Response.json({message:'Jídlo se nepodařilo uložit. Zkontroluj hodnoty a zkus to znovu.'},{status:500});}
  }

  if (url.pathname === "/app/api/connections" && request.method === "GET") {
    return Response.json(await connectionStatus(env), {headers:{"Cache-Control":"no-store"}});
  }
  if (url.pathname === '/app/api/connections' && request.method === 'POST') {
    if (!(await verifyDashboardSession(request, env.STRENGTH_API_KEY))) return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    if (request.headers.get('Origin') !== url.origin) return Response.json({message:'Neplatný původ požadavku.'},{status:403});
    const body=await request.json().catch(()=>({}));
    if(body.provider!=='intervals'||typeof body.key!=='string'||body.key.length<8||body.key.length>512) return Response.json({message:'Zadej platný API klíč Intervals.icu.'},{status:400});
    const check=await fetch('https://intervals.icu/api/v1/athlete/0',{headers:{Authorization:'Basic '+btoa('API_KEY:'+body.key),Accept:'application/json'}});
    if(!check.ok) return Response.json({message:'Intervals klíč nepřijal. Zkontroluj klíč v nastavení Intervals.'},{status:400});
    await saveConnectionSecret(env,'intervals',body.key);
    return Response.json({status:'ok',message:'Intervals.icu je připojené.'},{headers:{'Cache-Control':'no-store'}});
  }
  if (url.pathname === '/app/api/whoop' && request.method === 'GET') {
    if (!(await verifyDashboardSession(request, env.STRENGTH_API_KEY))) return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    try { return Response.json(await whoopData(env),{headers:{'Cache-Control':'no-store'}}); }
    catch { return Response.json({message:'WHOOP nelze načíst. Zkontroluj připojení v Nastavení.'},{status:502}); }
  }

  if (url.pathname === "/app/api/inbox") return handleCoachInbox(request, env, ctx, internalAuth);

  if (url.pathname === "/app/api/coaches" && request.method === "GET") {
    try {
      const today=new Date(), oldest=new Date(today.getTime()-14*86400000).toISOString().slice(0,10), newest=today.toISOString().slice(0,10);
      const dailyResponse=await app.fetch(new Request(new URL("/analysis/daily",request.url),{headers:internalAuth}),env,ctx);
      const sleepUrl=new URL("/health/sleep",request.url);sleepUrl.searchParams.set("start",oldest);sleepUrl.searchParams.set("end",newest);
      const sleepResponse=await app.fetch(new Request(sleepUrl,{headers:internalAuth}),env,ctx);
      const [daily,sleepData]=await Promise.all([dailyResponse.json(),sleepResponse.json()]);
      let fitness={};
      if(env.INTERVALS_API_KEY){
        const auth="Basic "+btoa("API_KEY:"+String(env.INTERVALS_API_KEY));
        const response=await fetch("https://intervals.icu/api/v1/athlete/0/wellness?oldest="+oldest+"&newest="+newest,{headers:{Authorization:auth,Accept:"application/json"}});
        const rows=await response.json().catch(()=>[]);
        const latest=Array.isArray(rows)&&rows.length?rows[rows.length-1]:{};
        fitness={...latest,tsb:Number.isFinite(Number(latest.ctl))&&Number.isFinite(Number(latest.atl))?Number(latest.ctl)-Number(latest.atl):null};
      }
      return Response.json({status:"ok",...buildCoachCouncil({daily,fitness,sleepSessions:sleepData.sessions||[]})},{headers:{"Cache-Control":"no-store"}});
    } catch(error){return Response.json({status:"error",message:error.message},{status:500});}
  }

  if (url.pathname === "/app/api/weight" && request.method === "POST") {
    const body = await request.text();
    return app.fetch(new Request(new URL("/app/api/weight", request.url), {
      method:"POST",
      headers:{...internalAuth,"Content-Type":"application/json"},
      body
    }), env, ctx);
  }

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
      }
      try {
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gym_plans (workout_date TEXT PRIMARY KEY, values_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
        const saved=await env.DB.prepare(`SELECT values_json FROM gym_plans WHERE workout_date=?`).bind(pragueToday()).first();
        if(saved?.values_json) data.values=JSON.parse(saved.values_json);
      } catch(error) { console.error("Gym plan read failed",error); }
      let history=[];
      try { history=await getStrengthHistory(env.DB,500); } catch(error) { console.error("Gym history read failed",error); }
      return Response.json({...data,history,storage:"d1"},{status:responseStatus,headers:{"Cache-Control":"no-store"}});
    }
    if (request.method === "POST") {
      try {
      const body = await request.json().catch(() => ({}));
      const date = body?.date || pragueToday();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gym_plans (workout_date TEXT PRIMARY KEY, values_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();

      if (body?.action === "plan") {
        const values = Array.isArray(body?.values) ? body.values : null;
        if (!values) return Response.json({status:"error",message:"values must be a 2D array"},{status:400});
        await env.DB.prepare(`INSERT INTO gym_plans(workout_date,values_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(workout_date) DO UPDATE SET values_json=excluded.values_json,updated_at=CURRENT_TIMESTAMP`).bind(date,JSON.stringify(values)).run();
        return Response.json({status:"ok",storage:"d1",message:"Plán uložen."},{headers:{"Cache-Control":"no-store"}});
      }

      const values = Array.isArray(body?.values) ? body.values : null;
      if (!values) return Response.json({status:"error",message:"values must be a 2D array"},{status:400});
      const sets = values.map((r,i)=>({
        type:String(r?.[0]||"WORK").toUpperCase(), exercise:r?.[1]||"", setNo:r?.[2],
        plannedKg:r?.[3], plannedReps:r?.[4], actualKg:r?.[5], actualReps:r?.[6],
        rpe:r?.[7], completed:["TRUE","true","1","ANO","ano","✓","☑"].includes(String(r?.[8]??"")), note:r?.[9]||""
      })).filter(x=>x.exercise && /^(WARMUP|WORK)$/.test(x.type) && x.completed);
      let historyResult=null;
      if(sets.length) historyResult=await importStrengthHistory(env.DB,{date,sets});
      // Keep the editable workout snapshot together with the completed-set
      // history.  The UI can then be safely reloaded after every autosave.
      const storedValues = Array.isArray(body?.fullValues) ? body.fullValues : values;
      await env.DB.prepare(`INSERT INTO gym_plans(workout_date,values_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(workout_date) DO UPDATE SET values_json=excluded.values_json,updated_at=CURRENT_TIMESTAMP`).bind(date,JSON.stringify(storedValues)).run();
      const history=await getStrengthHistory(env.DB,500);
      return Response.json({status:"ok",storage:"d1",values:storedValues,history,historySaved:historyResult,sheetSaved:false,message:sets.length?"Workout uložen do interní databáze.":"Změny plánu jsou uložené; dokončené série označ Hotovo."},{headers:{"Cache-Control":"no-store"}});
      } catch(error) {
        console.error("Gym save failed", error);
        return Response.json({status:"error",message:"Gym save: "+(error?.message||"unknown error")},{status:500,headers:{"Cache-Control":"no-store"}});
      }
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
