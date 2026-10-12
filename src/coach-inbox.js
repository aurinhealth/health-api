// The coaches' inbox (/app/api/inbox): drafts from a message, confirmed by the athlete,
// and the assistant's recent proposals read back for its context.
import app from "./strength-gateway.js";
import { actionSummary } from "./coach-actions.js";
import { searchCookbookRecipes, logFood } from "./food-log.js";
import { L } from "./lang.js";
import { localToday } from "./user-time.js";

export async function ensureCoachInboxTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS coach_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    message TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coach_inbox_user_0 ON coach_inbox(user_id, created_at DESC)`).run();
}

export function coachChannel(value, message) {
  const requested=String(value||"").toLowerCase();
  if (["cycling","gym","nutrition","food"].includes(requested)) return requested;
  const t=String(message||"").toLowerCase();
  if (/j[ií]d|recept|kalori|protein|sachar|sni?d|ob[eě]d|ve[cč]eř|zapsat/.test(t)) return "nutrition";
  if (/posil|gym|dřep|drep|bench|mrtv|s[eé]ri/.test(t)) return "gym";
  return "cycling";
}

export async function createCoachDraft(env, ctx, internalAuth, body) {
  const message=String(body?.message||"").trim();
  if(!message) throw new Error(L("Napiš zprávu pro trenéra.", "Write a message for the coach."));
  const channel=coachChannel(body?.channel,message), date=String(body?.date||localToday()).slice(0,10);
  let reply="", action={type:"advice",date};
  if(channel==="gym") {
    const r=await app.fetch(new Request("https://internal/strength/generate-plan",{method:"POST",headers:{...internalAuth,"Content-Type":"application/json"},body:JSON.stringify({date,preview:true})}),env,ctx);
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.status!=="ok") throw new Error(d.message||L("Gym plán se nepodařilo připravit.", "The gym plan couldn't be prepared."));
    const rows=(d.plan?.rows||[]).filter(x=>String(x.type||"").toUpperCase()==="WORK");
    reply=L(`Připravil jsem návrh ${d.plan?.planName||"silového tréninku"}: ${[...new Set(rows.map(x=>x.exercise))].slice(0,4).join(" · ")}. Je postavený podle regenerace, cyklistiky a tvé historie.`, `I've prepared ${d.plan?.planName||"a strength workout"}: ${[...new Set(rows.map(x=>x.exercise))].slice(0,4).join(" · ")}. It's built around your recovery, cycling and your history.`);
    action={type:"gym_generate",date};
  } else if(channel==="nutrition") {
    const page=Number((message.match(/(?:str(?:ana|\.)?|page)\s*(\d{1,3})/i)||[])[1]);
    const recipes=await searchCookbookRecipes({page:Number.isFinite(page)&&page>0?page:undefined,name:Number.isFinite(page)&&page>0?undefined:message,limit:3});
    const recipe=recipes.recipes?.[0]||null;
    if(recipe) {
      reply=L(`Našel jsem v kuchařce „${recipe.name}“${recipe.page?` (str. ${recipe.page})`:""}: ${Math.round(Number(recipe.calories||0))} kcal · B ${Math.round(Number(recipe.protein_g||0))} g · S ${Math.round(Number(recipe.carbs_g||0))} g · T ${Math.round(Number(recipe.fat_g||0))} g. Potvrzením ho zapíšeš do dnešní výživy.`, `I found “${recipe.name}” in the cookbook${recipe.page?` (p. ${recipe.page})`:""}: ${Math.round(Number(recipe.calories||0))} kcal · P ${Math.round(Number(recipe.protein_g||0))} g · C ${Math.round(Number(recipe.carbs_g||0))} g · F ${Math.round(Number(recipe.fat_g||0))} g. Confirm to log it in today's nutrition.`);
      action={type:"food_log",date,page:recipe.page,name:recipe.name};
    } else reply=L("V kuchařce jsem nenašel jednoznačný recept. Napiš název receptu nebo číslo strany a připravím zápis.", "I didn't find a clear match in the cookbook. Write the recipe name or page number and I'll prepare the entry.");
  } else {
    reply=channel==="cycling"?L("Cyklistický trenér bere kolo jako hlavní prioritu. Pro přesný návrh napiš délku, typ jízdy a zda chceš plán nebo kontrolu existující jednotky.", "The cycling coach treats the bike as the main priority. For a precise proposal, write the duration, the type of ride and whether you want a plan or a check of an existing session."):L("Připravil jsem doporučení.", "I've prepared a recommendation.");
  }
  const draft={channel,message,date,reply,action};
  const ins=await env.DB.prepare("INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)").bind(env.USER_ID,channel,message,JSON.stringify(draft)).run();
  return {status:"ok",draftId:ins.meta?.last_row_id,draft};
}

export async function handleCoachInbox(request, env, ctx, internalAuth) {
  try {
    await ensureCoachInboxTable(env.DB);
    if(request.method==="GET") {
      const rows=await env.DB.prepare("SELECT id,channel,message,draft_json,status,created_at,confirmed_at FROM coach_inbox WHERE user_id=? ORDER BY id DESC LIMIT 30").bind(env.USER_ID).all();
      return Response.json({status:"ok",items:(rows.results||[]).map(r=>({...r,draft:JSON.parse(r.draft_json||"{}")}))},{headers:{"Cache-Control":"no-store"}});
    }
    const body=await request.json().catch(()=>({}));
    if(body?.action!=="confirm") return Response.json(await createCoachDraft(env,ctx,internalAuth,body),{headers:{"Cache-Control":"no-store"}});
    const id=Number(body?.draftId); if(!id) return Response.json({status:"error",message:L("Chybí návrh k potvrzení.", "The proposal to confirm is missing.")},{status:400});
    const row=await env.DB.prepare("SELECT * FROM coach_inbox WHERE id=? AND user_id=?").bind(id,env.USER_ID).first();
    if(!row) return Response.json({status:"error",message:L("Návrh už neexistuje.", "The proposal no longer exists.")},{status:404});
    if(row.status==="confirmed") return Response.json({status:"ok",message:L("Tento návrh už je potvrzený.", "This proposal is already confirmed.")});
    const draft=JSON.parse(row.draft_json||"{}"); let result={status:"ok"};
    if(draft.kind)return Response.json({status:'error',message:L('Tento návrh potvrď v AI nebo v náhledu gymu.', 'Confirm this proposal in AI or in the gym preview.')},{status:400});
    if(draft.action?.type==="gym_generate") {
      const r=await app.fetch(new Request("https://internal/strength/generate-plan",{method:"POST",headers:{...internalAuth,"Content-Type":"application/json"},body:JSON.stringify({date:draft.date})}),env,ctx);
      result=await r.json().catch(()=>({status:"error",message:L("Neplatná odpověď Gymu", "Invalid response from the gym planner")})); if(!r.ok||result.status!=="ok") throw new Error(result.message||L("Gym plán se nepodařilo uložit.", "The gym plan couldn't be saved."));
    }
    if(draft.action?.type==="food_log") result=await logFood(env.DB,{date:draft.date,page:draft.action.page,name:draft.action.name,source:"cookbook",note:L("Zapsáno ze schránky trenérů", "Logged from the coaches' inbox")});
    await env.DB.prepare("UPDATE coach_inbox SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(id,env.USER_ID).run();
    return Response.json({status:"ok",message:draft.action?.type==="food_log"?L("Jídlo je zapsané ve výživě.", "The meal is logged in Nutrition."):draft.action?.type==="gym_generate"?L("Gym plán je uložený a odeslaný do tréninku.", "The gym plan is saved and sent to your training."):L("Doporučení potvrzeno.", "Recommendation confirmed."),result},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return Response.json({status:"error",message:error.message},{status:500}); }
}

// Earlier proposals of the assistant from the last week and what became of them.
export async function recentCoachProposals(env){
  await ensureCoachInboxTable(env.DB);
  const rows=(await env.DB.prepare("SELECT draft_json,status,created_at FROM coach_inbox WHERE user_id=? AND status IN ('draft','confirmed','rejected') AND created_at>=datetime('now','-7 days') AND draft_json LIKE '%\"coach_action\"%' ORDER BY id DESC LIMIT 12").bind(env.USER_ID).all()).results||[];
  const label={draft:L('čeká na rozhodnutí', 'waiting for a decision'),confirmed:L('potvrzeno', 'confirmed'),rejected:L('odmítnuto', 'rejected')};
  return rows.map(r=>{let d={};try{d=JSON.parse(r.draft_json||'{}');}catch{/* skipped */}return d.kind==='coach_action'&&d.action?{proposal:actionSummary(d.action),status:label[r.status],createdAt:String(r.created_at).slice(0,16)}:null;}).filter(Boolean);
}
