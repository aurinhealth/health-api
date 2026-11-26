// The owner's overview of accounts and subscriptions (Petr 2026-11-25/26,
// mockup v4 after the team review): aurin.health/app/owner, only for the owner,
// behind Cloudflare Access and the owner's sign-in. Accounts by number only:
// no e-mail, no name, no transaction id, no health value, no export. Purchases
// count only from the App Store (Production); the owner and the App Review
// account are left out. Activity per account (last use, active days) waits for
// the usage counts after the release (#1077); until then nothing here
// pretends to know it (users.last_login_at is a sign-in, not use).
import { ensureStoreColumns } from "./app-store.js";
import { ensureAiUsage, aiMonthlyLimitUsd } from "./ai-usage.js";
import { groupOfSubscription, unpaidLimitShare, paidLimitAccount } from "./ai-limit-share.js";
import { NET_USD_PER_MONTH } from "./ops-report.js";
import { dailyStats } from "./store-report.js";
import { scriptPolicy } from "./web-security.js";

const DAY = 864e5;
const day = t => new Date(t).toISOString().slice(0, 10);
const time = text => Date.parse(String(text || "").replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(text || "")) ? "" : "Z"));
const yearly = productId => String(productId || "").endsWith(".yearly");
const missingTable = error => /no such table/i.test(String(error?.message || error));

// What Apple's notification says, for the account's history.
function eventName(row, firstPaid) {
  switch (row.type) {
    case "SUBSCRIBED": return Number(row.free_trial) === 1 ? "Začal zkušební období" : yearly(row.product_id) ? "Koupil roční předplatné" : "Koupil měsíční předplatné";
    case "DID_RENEW": return row === firstPaid ? "Zaplatil po zkušebním období" : "Obnoveno";
    case "DID_CHANGE_RENEWAL_STATUS": return row.subtype === "AUTO_RENEW_DISABLED" ? (Number(row.free_trial) === 1 ? "Vypnul obnovení ve zkušebním období" : "Vypnul obnovení (platí do konce období)") : "Zapnul obnovení";
    case "DID_CHANGE_RENEWAL_PREF": return row.subtype === "UPGRADE" ? "Přechází na roční" : row.subtype === "DOWNGRADE" ? "Přechází na měsíční" : null;
    case "DID_FAIL_TO_RENEW": return "Platba se nepovedla, Apple zkouší znovu";
    case "EXPIRED": case "GRACE_PERIOD_EXPIRED": return "Předplatné skončilo";
    case "OFFER_REDEEMED": return "Uplatnil nabídku";
    case "CONSUMPTION_REQUEST": return "Žádost o vrácení peněz";
    case "REFUND": return "Peníze vráceny";
    case "REFUND_DECLINED": return "Vrácení zamítnuto";
    case "REVOKE": return "Rodinné sdílení skončilo";
    default: return null;
  }
}

// One account: the trial, the subscription and the refund as the table shows
// them, and its history from Apple's notifications (store_events, kept since
// 2026-11-25).
function account(user, sub, events, spent, env, now) {
  const group = sub ? groupOfSubscription(sub, now) : "free";
  const start = events.find(e => e.type === "SUBSCRIBED" && Number(e.free_trial) === 1);
  const firstPaid = start && events.find(e => e.type === "DID_RENEW" && e.original_transaction_id === start.original_transaction_id && Number(e.signed_at) > Number(start.signed_at));
  const off = start && events.find(e => e.type === "DID_CHANGE_RENEWAL_STATUS" && e.subtype === "AUTO_RENEW_DISABLED" && Number(e.free_trial) === 1 && Number(e.signed_at) >= Number(start.signed_at));
  let trial = null;
  if (group === "trial") trial = Number(sub.auto_renew) === 0 ? { state: "off", day: off ? Math.floor((Number(off.signed_at) - Number(start.signed_at)) / DAY) + 1 : null } : { state: "running", days: Math.max(0, Math.ceil((time(sub.valid_until) - now) / DAY)) };
  else if (firstPaid) trial = { state: "paid", at: day(Number(firstPaid.signed_at)) };
  else if (start) trial = { state: "ended", at: Number(start.expires_at) > 0 ? day(Number(start.expires_at)) : null };
  const renewal = [...events].reverse().find(e => ["DID_FAIL_TO_RENEW", "DID_RENEW", "EXPIRED", "GRACE_PERIOD_EXPIRED", "SUBSCRIBED"].includes(e.type));
  const failing = renewal?.type === "DID_FAIL_TO_RENEW";
  let plan = null;
  if (group === "paid" || group === "gift" || (failing && sub?.store_environment === "Production")) {
    const since = events.find(e => (e.type === "SUBSCRIBED" && Number(e.free_trial) !== 1) || e.type === "DID_RENEW");
    const family = [...events].reverse().find(e => e.ownership)?.ownership === "FAMILY_SHARED";
    plan = { yearly: yearly(sub.product_id), since: since ? day(Number(since.signed_at)) : null,
      state: group === "gift" ? "gift" : failing ? "fail" : family ? "family" : Number(sub.auto_renew) === 0 ? "off" : "ok" };
  }
  const refund = [...events].reverse().find(e => ["CONSUMPTION_REQUEST", "REFUND", "REFUND_DECLINED"].includes(e.type));
  const paidLimits = group === "paid" || group === "gift" || paidLimitAccount(env, user.id);
  const limit = paidLimits ? aiMonthlyLimitUsd(env, 1, "paid") : aiMonthlyLimitUsd(env, unpaidLimitShare(env), "unpaid");
  const history = [];
  if (sub?.first_download_at) history.push([sub.first_download_at, "Stáhl aplikaci (App Store)"]);
  history.push([day(time(user.created_at)), "Registrace"]);
  for (const e of events) { const name = eventName(e, firstPaid); if (name) history.push([day(Number(e.signed_at)), name]); }
  return {
    id: Number(user.id), downloaded: sub?.first_download_at || null, created: day(time(user.created_at)), group,
    trial, plan, refund: refund ? { type: refund.type, at: day(Number(refund.signed_at)) } : null,
    ai: Math.round((spent || 0) * 100) / 100, limit, history: history.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  };
}

// Everything the page shows, from the central database. now: for tests.
export async function ownerOverview(env, { now = Date.now() } = {}) {
  const db = env.DB;
  await ensureStoreColumns(db);
  await ensureAiUsage(db);
  // Left out: the owner, App Review, and the server's own accounts (the deploy check is disabled, the load test's are @test.aurin.health).
  const left = new Set([env.OWNER_EMAIL, env.APP_REVIEW_EMAIL, env.SMOKE_USER_EMAIL].map(e => String(e || "").trim().toLowerCase()).filter(Boolean));
  const users = ((await db.prepare("SELECT id, email, created_at FROM users WHERE disabled = 0").all()).results || []).filter(u => { const email = String(u.email || "").trim().toLowerCase(); return !left.has(email) && !/^sample\+load.*@test\.aurin\.health$/.test(email); });
  const subs = new Map(((await db.prepare("SELECT user_id, plan, valid_until, product_id, store_environment, free_trial, offer_type, testflight, auto_renew, first_download_at FROM subscriptions").all()).results || []).map(s => [Number(s.user_id), s]));
  const rows = await db.prepare("SELECT user_id, original_transaction_id, type, subtype, product_id, free_trial, ownership, expires_at, signed_at FROM store_events WHERE environment = 'Production' AND user_id > 0 ORDER BY signed_at").all().then(r => r.results || [], error => { if (missingTable(error)) return []; throw error; });
  const events = new Map();
  for (const row of rows) { const id = Number(row.user_id); if (!events.has(id)) events.set(id, []); events.get(id).push(row); }
  const today = day(now), monthFrom = today.slice(0, 8) + "01", weekFrom = day(now - 6 * DAY);
  const month = new Map(((await db.prepare("SELECT user_id, SUM(cost_usd) AS cost FROM ai_usage WHERE day >= ? AND model != 'pending' GROUP BY user_id").bind(monthFrom).all()).results || []).map(r => [Number(r.user_id), Number(r.cost) || 0]));
  const week = new Set(((await db.prepare("SELECT user_id FROM ai_usage WHERE day >= ? AND model NOT IN ('pending', 'carried-over') GROUP BY user_id HAVING SUM(cost_usd) > 0").bind(weekFrom).all()).results || []).map(r => Number(r.user_id)));
  const accounts = users.map(u => account(u, subs.get(Number(u.id)), events.get(Number(u.id)) || [], month.get(Number(u.id)), env, now));
  const ids = new Set(accounts.map(a => a.id));
  const active = accounts.map(a => [a, subs.get(a.id)]);
  const within = (s, days) => { const until = time(s?.valid_until); return until > now && until - now <= days * DAY; };
  const paid = active.filter(([a]) => a.group === "paid");
  // Trials whose week is over: started 8 to 90 days ago.
  const starts = rows.filter(r => ids.has(Number(r.user_id)) && r.type === "SUBSCRIBED" && Number(r.free_trial) === 1 && Number(r.signed_at) >= now - 90 * DAY && Number(r.signed_at) <= now - 8 * DAY);
  const converted = starts.filter(s => rows.some(r => r.type === "DID_RENEW" && r.original_transaction_id === s.original_transaction_id && Number(r.signed_at) > Number(s.signed_at))).length;
  const cancelDays = [0, 0, 0, 0, 0, 0, 0];
  for (const a of accounts) { const e = events.get(a.id) || [], start = e.find(r => r.type === "SUBSCRIBED" && Number(r.free_trial) === 1);
    const off = start && Number(start.signed_at) >= now - 90 * DAY && e.find(r => r.type === "DID_CHANGE_RENEWAL_STATUS" && r.subtype === "AUTO_RENEW_DISABLED" && Number(r.free_trial) === 1 && Number(r.signed_at) >= Number(start.signed_at));
    if (off) cancelDays[Math.min(6, Math.floor((Number(off.signed_at) - Number(start.signed_at)) / DAY))]++; }
  const recent = accounts.filter(a => time(a.created) >= now - 30 * DAY);
  const monthEvents = rows.filter(r => ids.has(Number(r.user_id)) && day(Number(r.signed_at)) >= monthFrom);
  const buckets = [0, 0, 0, 0, 0];
  for (const a of accounts) buckets[!a.ai ? 0 : a.limit ? Math.min(4, 1 + Math.floor(a.ai / a.limit * 4)) : 1]++;
  return {
    today,
    numbers: {
      accounts: accounts.length, newWeek: accounts.filter(a => a.created >= weekFrom).length,
      trials: accounts.filter(a => a.group === "trial").length, trialsEnding: active.filter(([a, s]) => a.group === "trial" && within(s, 3)).length,
      monthly: paid.filter(([a]) => !a.plan?.yearly).length, yearly: paid.filter(([a]) => a.plan?.yearly).length, gifts: accounts.filter(a => a.group === "gift").length,
      earnsUsd: Math.round(paid.reduce((sum, [a]) => sum + (a.plan?.yearly ? NET_USD_PER_MONTH.yearly : NET_USD_PER_MONTH.monthly), 0)),
      renew30: paid.filter(([, s]) => Number(s.auto_renew) !== 0 && within(s, 30)).length, end30: active.filter(([a, s]) => (a.group === "paid" || a.group === "gift") && Number(s.auto_renew) === 0 && within(s, 30)).length,
      trialsPaid: converted, trialsDone: starts.length, aiWeek: accounts.filter(a => week.has(a.id)).length,
      refundRequests: monthEvents.filter(r => r.type === "CONSUMPTION_REQUEST").length, refunds: monthEvents.filter(r => r.type === "REFUND").length
    },
    funnel: [recent.length, recent.filter(a => a.trial).length, recent.filter(a => a.plan && a.plan.state !== "gift").length],
    cancelDays, aiBuckets: buckets, days: await dailyStats(db), accounts
  };
}

// ---- The page ----
// GET /app/owner: the page shell holds no data; its script reads
// /app/owner/data with the owner's session, and offers the passkey sign-in
// when there is none. Nobody but the owner sees a number.
export function ownerPageResponse() {
  return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": scriptPolicy(SCRIPT_TAG) } });
}

// Cloudflare Access in front of /app/owner* (security review 2026-11-26, SEC-1): once
// ACCESS_TEAM_DOMAIN (e.g. aurin.cloudflareaccess.com) and ACCESS_AUD (the
// application's audience tag) are set, the data also needs Access's signed
// token for the owner's e-mail, so a stolen session alone reads nothing.
// Unset (before Access is set up, and locally) the owner's session decides.
const accessKeys = new Map();
const bytes = text => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4)), c => c.charCodeAt(0));
export async function accessAllowed(request, env, fetchImpl = fetch) {
  if (!String(env.ACCESS_TEAM_DOMAIN || "").trim() && !String(env.ACCESS_AUD || "").trim()) return true;
  return ownerAccess(request, env, fetchImpl);
}

// True only with Access set up and its valid token for the owner. Access adds the token as a
// header inside /app/owner*; the passkey sign-in the page calls (/auth/passkey/*) lies outside, where
// the browser still sends Access's CF_Authorization cookie (web-app-closed.js lets the owner through).
export async function ownerAccess(request, env, fetchImpl = fetch) {
  const team = String(env.ACCESS_TEAM_DOMAIN || "").trim(), aud = String(env.ACCESS_AUD || "").trim();
  if (!team || !aud) return false;
  try {
    const token = request.headers.get("Cf-Access-Jwt-Assertion") || (/(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get("Cookie") || "") || [])[1] || "";
    const [head, body, signature] = String(token).split(".");
    const header = JSON.parse(new TextDecoder().decode(bytes(head))), claims = JSON.parse(new TextDecoder().decode(bytes(body)));
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (header.alg !== "RS256" || claims.iss !== "https://" + team || !audiences.includes(aud) || !(claims.exp > Date.now() / 1000)) return false;
    if (String(claims.email || "").toLowerCase() !== String(env.OWNER_EMAIL || "").trim().toLowerCase()) return false;
    if (!accessKeys.has(team) || !accessKeys.get(team).some(k => k.kid === header.kid)) accessKeys.set(team, (await (await fetchImpl(`https://${team}/cdn-cgi/access/certs`)).json()).keys || []);
    const jwk = accessKeys.get(team).find(k => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(signature), new TextEncoder().encode(head + "." + body));
  } catch { return false; }
}

export async function ownerDataResponse(env) {
  return Response.json(await ownerOverview(env), { headers: { "cache-control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

const CSS = `:root{--bg:#f6f7f5;--panel:#fff;--fg:#1b211d;--muted:#66706a;--line:#e2e6e3;--green:#2f7d55;--amber:#c8600a;--rose:#b4415c;--indigo:#4b55b8;--soft:#eef3ef;--onaccent:#fff;--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;--serif:"New York","Iowan Old Style","Palatino Linotype",Palatino,serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#121513;--panel:#1b1f1c;--fg:#e9ece9;--muted:#9aa49d;--line:#2c322e;--green:#5fc28d;--amber:#ff9238;--rose:#e57a93;--indigo:#8f98f0;--soft:#203027;--onaccent:#121513}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);font-size:14px;line-height:1.45;padding:20px 16px 48px}
[hidden]{display:none!important}.wrap{max-width:1100px;margin:0 auto;display:grid;gap:18px}
h1{font-family:var(--serif);font-weight:600;margin:0;font-size:26px}.note{color:var(--muted);margin:4px 0 0;max-width:75ch}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}.tabs a{padding:10px 14px;color:var(--muted);text-decoration:none;font-weight:600;border-bottom:2px solid transparent}.tabs a[aria-current="page"]{color:var(--fg);border-color:var(--amber)}
.screen{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:grid;gap:16px;min-width:0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.kpi{background:var(--soft);border-radius:10px;padding:12px 14px}.kpi b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.kpi span{color:var(--muted);font-size:12px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.chart{border:1px solid var(--line);border-radius:10px;padding:14px;min-width:0}.chart h3{margin:0 0 2px;font-size:14px}.chart p{margin:0 0 8px;color:var(--muted);font-size:12px}
svg text{fill:var(--muted);font-size:10px;font-family:var(--font)}.legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted)}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}
.tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.chip{border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:999px;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer;min-height:32px}.chip b{color:var(--muted);font-weight:500;margin-left:4px}.chip[aria-pressed="true"]{background:var(--fg);color:var(--bg)}.chip[aria-pressed="true"] b{color:var(--bg)}
input{border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:8px;padding:6px 10px;font:inherit;width:150px}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:13px}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}th button{all:unset;cursor:pointer}
td{padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}tr.row{cursor:pointer}tr.row:hover td{background:var(--soft)}tr.detail td{background:var(--soft);white-space:normal}
.pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:600}.p-trial{background:color-mix(in srgb,var(--amber) 16%,transparent);color:var(--amber)}.p-paid{background:color-mix(in srgb,var(--green) 16%,transparent);color:var(--green)}.p-off{background:color-mix(in srgb,var(--rose) 14%,transparent);color:var(--rose)}.p-none{color:var(--muted)}
.bar{display:inline-block;width:56px;height:6px;border-radius:3px;background:var(--line);vertical-align:middle;margin-right:6px;position:relative;overflow:hidden}.bar i{position:absolute;inset:0 auto 0 0;background:var(--indigo)}.bar i.hot{background:var(--rose)}
.timeline{list-style:none;margin:0;padding:2px 0 2px 16px;border-left:2px solid var(--line);display:grid;gap:4px}.timeline span{color:var(--muted);margin-right:8px}
.pager{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;color:var(--muted)}.pager button,.signin button{border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer;min-height:44px}.pager button:disabled{opacity:.4}`;

const SCRIPT = `(function(){
const $=id=>document.getElementById(id),DAY=864e5;
const fmt=s=>{if(!s)return"–";const d=new Date(s+"T00:00:00Z");return d.getUTCDate()+". "+(d.getUTCMonth()+1)+".";};
const num=n=>String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g," ");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
async function signIn(){$("signin-error").textContent="";try{
 const o=await (await fetch("/auth/passkey/options",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).json();
 const c=await navigator.credentials.get({publicKey:{challenge:unb64(o.challenge),rpId:o.rpId,timeout:o.timeout,userVerification:"required",allowCredentials:[]}});
 const credential={id:c.id,rawId:b64(c.rawId),type:c.type,response:{clientDataJSON:b64(c.response.clientDataJSON),authenticatorData:b64(c.response.authenticatorData),signature:b64(c.response.signature),userHandle:c.response.userHandle?b64(c.response.userHandle):null}};
 const r=await fetch("/auth/passkey/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential})});
 if(!r.ok)throw new Error((await r.json().catch(()=>({}))).message||"Přihlášení se nepovedlo.");load();
}catch(e){$("signin-error").textContent=e.message||"Přihlášení se nepovedlo.";}}
$("signin-button").onclick=signIn;
async function load(){const r=await fetch("/app/owner/data",{headers:{Accept:"application/json"}});
 if(r.status===401||r.status===403){$("signin").hidden=false;$("main").hidden=true;$("loading").hidden=true;return;}
 if(!r.ok){$("loading").textContent=r.status===404?"Stránka nenalezena.":"Nepovedlo se načíst. Zkus to za chvíli.";$("signin").hidden=true;return;}
 const d=await r.json();$("signin").hidden=true;$("main").hidden=false;$("loading").hidden=true;render(d);}
function render(d){const n=d.numbers,pct=n.trialsDone?Math.round(n.trialsPaid/n.trialsDone*100):0;
 const k=[[num(n.accounts),"účtů, +"+n.newWeek+" za 7 dní"],[n.trials,"ve zkušebním období, "+n.trialsEnding+" končí do 3 dní"],[n.monthly+n.yearly,"platí ("+n.monthly+" měsíčně, "+n.yearly+" ročně)"+(n.gifts?", dárky "+n.gifts:"")],["~"+num(n.earnsUsd)+" USD","měsíčně po odečtení Applu a DPH (odhad)"],[n.renew30+" / "+n.end30,"příštích 30 dní se obnoví / skončí"],[n.trialsPaid+" z "+n.trialsDone,"ukončených trialů zaplatilo"+(n.trialsDone>=30?" ("+pct+" %)":"")],[n.aiWeek,"lidí použilo AI za 7 dní"],[n.refundRequests+" / "+n.refunds,"žádosti o vrácení peněz / vráceno tento měsíc"]];
 $("kpis").innerHTML=k.map(([b,s])=>'<div class="kpi"><b>'+b+'</b><span>'+s+'</span></div>').join("");
 charts(d);table(d.accounts);}
const NS="http://www.w3.org/2000/svg";
const el=(svg,tag,a,text)=>{const e=document.createElementNS(NS,tag);for(const x in a)e.setAttribute(x,a[x]);if(text!=null)e.textContent=text;svg.appendChild(e);return e;};
const nice=m=>{const s=[2,4,6,10,20,40,60,100,200,400,600,1000,2000,4000,10000];return s.find(v=>v>=m)||Math.ceil(m);};
function axes(svg,max){for(const t of[0,max/2,max]){const y=134-t/max*110;el(svg,"line",{x1:34,y1:y,x2:330,y2:y,stroke:"var(--line)"});el(svg,"text",{x:2,y:y+3},t);}}
function bars(id,cols,labels){const svg=$(id);svg.textContent="";const max=nice(Math.max(1,...cols.map(c=>c.reduce((a,[v])=>a+v,0))));axes(svg,max);const w=Math.min(56,280/cols.length);
 cols.forEach((c,i)=>{let y=134;for(const[v,color]of c){const h=v/max*110;y-=h;el(svg,"rect",{x:40+i*w,y,width:w*.7,height:h,fill:color});}if(labels&&labels[i])el(svg,"text",{x:40+i*w+w*.35,y:150,"text-anchor":"middle"},labels[i]);});
 if(!cols.length)el(svg,"text",{x:120,y:80},"Zatím žádná data");}
function charts(d){const now=Date.parse(d.today+"T00:00:00Z"),weeks=[];for(let w=11;w>=0;w--)weeks.push(now-(w*7+6)*DAY);
 const created=d.accounts.map(a=>Date.parse(a.created+"T00:00:00Z"));
 bars("c1",weeks.map(s=>[[created.filter(t=>t>=s&&t<s+7*DAY).length,"var(--green)"]]),weeks.map((s,i)=>i%3===0?fmt(new Date(s).toISOString().slice(0,10)):""));
 const byWeek=[];for(const row of d.days){const t=Date.parse(row.day+"T00:00:00Z"),i=Math.floor((now-t)/(7*DAY));if(i<12){const w=11-i;(byWeek[w]=byWeek[w]||[]).push(row);}}
 const filled=byWeek.map((rows,i)=>({rows:rows||[],label:fmt(new Date(weeks[i]).toISOString().slice(0,10))})).filter(w=>w.rows.length);
 bars("c3",filled.map(w=>{const r=w.rows[w.rows.length-1];return[[r.paid_monthly||0,"var(--green)"],[r.paid_yearly||0,"var(--indigo)"],[r.trials||0,"var(--amber)"]];}),filled.map((w,i)=>i%3===0?w.label:""));
 const sum=(rows,k)=>rows.reduce((a,r)=>a+(Number(r[k])||0),0);
 bars("c2",filled.map(w=>[[sum(w.rows,"renewed")+sum(w.rows,"converted"),"var(--green)"],[sum(w.rows,"expired"),"var(--rose)"]]),filled.map((w,i)=>i%3===0?w.label:""));
 {const svg=$("c4");svg.textContent="";const f=d.funnel,top=Math.max(1,f[0]);[["Registrace",f[0]],["Zkušební období",f[1]],["Zaplatili",f[2]]].forEach(([name,v],i)=>{const w=Math.max(2,v/top*200);el(svg,"rect",{x:120,y:14+i*36,width:w,height:24,rx:4,fill:["var(--green)","var(--amber)","var(--indigo)"][i]});el(svg,"text",{x:4,y:30+i*36,"font-size":11},name);el(svg,"text",{x:126+w,y:30+i*36,"font-size":11},v);});}
 bars("c5",d.cancelDays.map((v,i)=>[[v,i===0?"var(--rose)":"var(--amber)"]]),d.cancelDays.map((v,i)=>(i+1)+". den"));
 bars("c6",d.aiBuckets.map((v,i)=>[[v,i===4?"var(--rose)":i===0?"var(--line)":"var(--indigo)"]]),["nic","do 25 %","do 50 %","do 75 %","75 % +"]);}
const REFUND={CONSUMPTION_REQUEST:"žádost",REFUND:"vráceno",REFUND_DECLINED:"zamítnuto"};
const filters=[["vse","Vše",()=>true],["trial","Zkušební období",u=>u.trial&&u.trial.state==="running"],["plati","Platí",u=>u.plan&&u.plan.state!=="fail"],["off","Obnovení vypnuto",u=>u.plan&&u.plan.state==="off"],["fail","Problém s platbou",u=>u.plan&&u.plan.state==="fail"],["zruseno","Zrušené trialy",u=>u.trial&&u.trial.state==="off"],["refund","Vrácení peněz",u=>u.refund],["limit","U limitu AI",u=>u.limit&&u.ai>=u.limit*.8]];
let users=[],filter="vse",page=0,sort=["created",-1],q="",open=null;
function table(list){users=list;$("filters").innerHTML=filters.map(([k,name,f])=>'<button class="chip" data-f="'+k+'" aria-pressed="'+(k===filter)+'">'+name+'<b>'+users.filter(f).length+'</b></button>').join("");draw();}
$("filters").onclick=e=>{const b=e.target.closest("button");if(!b)return;filter=b.dataset.f;page=0;$("filters").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));draw();};
$("q").oninput=e=>{q=e.target.value.replace(/\\D/g,"");page=0;draw();};
document.querySelectorAll("th button").forEach(b=>b.onclick=()=>{const k=b.dataset.sort;sort=[k,sort[0]===k?-sort[1]:-1];draw();});
$("prev").onclick=()=>{page--;draw();};$("next").onclick=()=>{page++;draw();};
const val=(u,k)=>k==="ai"?(u.limit?u.ai/u.limit:0):k==="id"?u.id:(u[k]||"");
const trialCell=t=>!t?'<span class="pill p-none">–</span>':t.state==="running"?'<span class="pill p-trial">běží, '+t.days+' dny</span>':t.state==="off"?'<span class="pill p-off">zrušeno'+(t.day?" "+t.day+". den":"")+'</span>':t.state==="paid"?"zaplaceno "+fmt(t.at):"skončilo "+fmt(t.at);
const planCell=p=>{if(!p)return'<span class="pill p-none">nemá</span>';const word=p.yearly?"ročně":"měsíčně",cls=p.state==="fail"?"p-off":p.state==="off"?"p-trial":"p-paid";return'<span class="pill '+cls+'">'+word+'</span> '+({off:"obnovení vypnuto",fail:"problém s platbou",family:"rodinné sdílení",gift:"dárek"}[p.state]||(p.since?"od "+fmt(p.since):""));};
function draw(){const f=filters.find(x=>x[0]===filter)[2];const list=users.filter(f).filter(u=>!q||String(u.id).startsWith(q)).sort((a,b)=>{const x=val(a,sort[0]),y=val(b,sort[0]);return(x<y?-1:x>y?1:0)*sort[1];});
 const per=25,pages=Math.max(1,Math.ceil(list.length/per));page=Math.max(0,Math.min(page,pages-1));const shown=list.slice(page*per,page*per+per);
 $("rows").innerHTML=shown.map(u=>'<tr class="row" data-id="'+u.id+'" tabindex="0"><td>#'+u.id+'</td><td>'+fmt(u.downloaded)+'</td><td>'+fmt(u.created)+'</td><td>'+trialCell(u.trial)+'</td><td>'+planCell(u.plan)+'</td><td>'+(u.refund?'<span class="pill p-off">'+REFUND[u.refund.type]+" "+fmt(u.refund.at)+'</span>':"–")+'</td><td><span class="bar"><i class="'+(u.limit&&u.ai>=u.limit*.8?"hot":"")+'" style="width:'+(u.limit?Math.min(100,u.ai/u.limit*100):0)+'%"></i></span>'+u.ai.toFixed(2).replace(".",",")+(u.limit!=null?" / "+String(u.limit).replace(".",","):"")+' USD</td></tr>'+(open===u.id?'<tr class="detail"><td colspan="7"><ul class="timeline">'+u.history.map(([t,x])=>'<li><span>'+fmt(t)+'</span>'+esc(x)+'</li>').join("")+'</ul></td></tr>':"")).join("");
 $("count").textContent=list.length?(page*per+1)+"–"+(page*per+shown.length)+" z "+num(list.length):"Nic neodpovídá filtru";$("prev").disabled=page===0;$("next").disabled=page>=pages-1;}
$("rows").onclick=e=>{const tr=e.target.closest("tr.row");if(!tr)return;const id=Number(tr.dataset.id);open=open===id?null:id;draw();};
$("rows").onkeydown=e=>{if(e.key==="Enter")e.target.click();};
const tabs=["prehled","uzivatele"];const show=()=>{const t=tabs.includes(location.hash.slice(1))?location.hash.slice(1):"prehled";for(const x of tabs)$("tab-"+x).hidden=x!==t;document.querySelectorAll(".tabs a").forEach(a=>a.dataset.tab===t?a.setAttribute("aria-current","page"):a.removeAttribute("aria-current"));};
addEventListener("hashchange",show);show();load();
})();`;
const SCRIPT_TAG = `<script>${SCRIPT}</script>`;

const chart = (id, title, note, legend = "") => `<div class="chart"><h3>${title}</h3><p>${note}</p><svg id="${id}" viewBox="0 0 340 160" width="100%" role="img" aria-label="${title}"></svg>${legend}</div>`;
const legend = items => `<div class="legend">${items.map(([color, name]) => `<span><i style="background:var(--${color})"></i>${name}</span>`).join("")}</div>`;

const PAGE = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Aurin</title><style>${CSS}</style></head><body><div class="wrap">
<section class="screen signin" id="signin" hidden><p><button id="signin-button">Přihlásit</button></p><p class="note" id="signin-error" role="alert"></p></section>
<p class="note" id="loading">Načítám…</p>
<div id="main" hidden>
<header><h1>Přehled uživatelů Aurin</h1><p class="note">Jen pro tebe. Účty jsou jen čísla, žádné e-maily ani zdravotní hodnoty, žádný export. Bez tebe a účtu pro App Review, nákupy z TestFlightu se jako placení nepočítají. Historie předplatných se ukládá od 25. 11. 2026.</p></header>
<nav class="tabs" aria-label="Záložky"><a href="#prehled" data-tab="prehled">Přehled</a><a href="#uzivatele" data-tab="uzivatele">Uživatelé</a></nav>
<section class="screen" id="tab-prehled"><div class="kpis" id="kpis"></div><div class="grid2">
${chart("c1", "Registrace za týden", "Posledních 12 týdnů")}
${chart("c3", "Předplatná", "Ke konci týdne, data od 25. 11. 2026", legend([["green", "měsíčně"], ["indigo", "ročně"], ["amber", "zkušební období"]]))}
${chart("c2", "Obnovení a odchody", "Za týden, data od 25. 11. 2026", legend([["green", "zaplaceno a obnoveno"], ["rose", "skončilo"]]))}
${chart("c4", "Od registrace k placení", "Registrace za posledních 30 dní. Stažení ukazuje App Store Connect.")}
${chart("c5", "Kdy lidé ruší zkušební období", "Den trialu, počty za 90 dní")}
${chart("c6", "AI útrata vůči limitu", "Tento měsíc, každý vůči svému limitu")}
</div><p class="note">Přibude později: aktivní uživatelé a kohorty podle týdne registrace (po vydání s měřením používání a kolem 100 lidí).</p></section>
<section class="screen" id="tab-uzivatele" hidden><div class="tools" id="filters" role="group" aria-label="Filtr"></div>
<div class="tools"><label for="q" class="note" style="margin:0">Účet</label><input id="q" type="search" placeholder="#123" inputmode="numeric"></div>
<div class="scroll"><table><thead><tr><th><button data-sort="id">Účet</button></th><th><button data-sort="downloaded">Stažení</button></th><th><button data-sort="created">Registrace</button></th><th>Zkušební období</th><th>Předplatné</th><th>Vrácení peněz</th><th><button data-sort="ai">AI tento měsíc</button></th></tr></thead><tbody id="rows"></tbody></table></div>
<div class="pager"><span id="count"></span><span><button id="prev">Předchozí</button> <button id="next">Další</button></span></div>
<p class="note">Klepni na řádek pro historii účtu od Applu. Stažení = první stažení tímto Apple účtem, „–“ když ho Apple neposlal (TestFlight, starší instalace).</p></section>
</div></div>${SCRIPT_TAG}</body></html>`;
