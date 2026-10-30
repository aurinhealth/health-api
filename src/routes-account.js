// Account routes of the dashboard API: me, consent, passkeys, e-mail, sign-out,
// Apple ID, export and delete, subscription, training setup and onboarding.
import { initialImport } from "./account-sync.js";
import { onboardingStatus, completeOnboarding } from "./onboarding.js";
import { subscriptionStatus } from "./subscription.js";
import { appAccountToken, saveAppTransaction, storePurchase } from "./app-store.js";
import { coachAllowance } from "./coach-allowance.js";
import { consentStatus, saveConsent } from "./consent.js";
import { missingProviders, connectionEnvironment, deleteConnectionSecret } from "./connection-secrets.js";
import { bumpCacheVersion } from "./api-cache.js";
import { appleIdentity, unlinkAppleIdentity, revokeApple } from "./apple-login.js";
import { handleSignOutEverywhere, signedOutElsewhere, handleDashboardLogout } from "./dashboard-auth.js";
import { aiAllowance } from "./ai-usage.js";
import { exportAccountStream, deleteAccount } from "./account-data.js";
import { listPasskeys, handlePasskeyApi } from "./passkeys.js";
import { handleEmailChange } from "./email-login.js";
import { emailConfigured } from "./email-sender.js";
import { L } from "./lang.js";
import { localToday } from "./user-time.js";
import { internalTester } from "./staging.js";
import { appSettings, saveAppSettings } from "./app-settings.js";
import { profilePhoto, saveProfilePhoto, removeProfilePhoto } from "./profile-photo.js";
import { healthPaused, pauseHealthData, resumeBlocked } from "./health-pause.js";
import { syncUltrahuman, FIRST_IMPORT_DAYS as ULTRAHUMAN_FIRST_DAYS } from "./ultrahuman.js";
import { syncWhoop, FIRST_IMPORT_DAYS as WHOOP_FIRST_DAYS } from "./whoop.js";
import { syncWahoo, FIRST_IMPORT_DAYS as WAHOO_FIRST_DAYS } from "./wahoo.js";

// Health data turned on again after a pause (health-pause.js): every connected
// service brings its history in again, as when it was connected.
function reimportAfterPause(env,ctx){
  const first=(name,run)=>ctx.waitUntil(run().then(()=>bumpCacheVersion(env.DB)).catch(error=>console.error(name+" import after pause failed",error.message)));
  first("Google and Intervals.icu",()=>initialImport(env,ctx,{force:true}));
  if(env.ULTRAHUMAN_TOKEN)first("Ultrahuman",()=>syncUltrahuman(env,{days:ULTRAHUMAN_FIRST_DAYS}));
  if(env.WHOOP_TOKEN)first("WHOOP",()=>syncWhoop(env,{days:WHOOP_FIRST_DAYS}));
  if(env.WAHOO_TOKEN)first("Wahoo",()=>syncWahoo(env,{days:WAHOO_FIRST_DAYS}));
}

export async function handleAccountApi(request,env,ctx,url,session,internalAuth){
  if (url.pathname === "/app/api/me" && request.method === "GET") {
    const [onboarding,ai,consent]=await Promise.all([onboardingStatus(env),session.signedIn&&env.OPENAI_API_KEY?aiAllowance(env).catch(error=>{console.error('AI usage read failed',error.message);return null;}):null,session.signedIn?consentStatus(env):null]);
    const apple = session.user ? await appleIdentity(env.RAW_DB, session.user.id) : null;
    const passkeys = session.user ? await listPasskeys(env.RAW_DB, session.user.id) : [];
    return Response.json({status:"ok",user:session.user||null,missingProviders:missingProviders(env),onboarding,ai,consent,apple,passkeys,emailLogin:emailConfigured(env),internalTester:internalTester(env,session.user)},{headers:{"Cache-Control":"no-store"}});
  }
  // The app's own settings, kept with the account for a new install (app-settings.js).
  if(url.pathname==='/app/api/app-settings'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method==='GET')return Response.json({status:'ok',...await appSettings(env.DB)},{headers:{'Cache-Control':'no-store'}});
    if(request.method!=='PUT')return Response.json({message:'Method not allowed'},{status:405});
    let body;try{body=await request.json();}catch{return Response.json({message:L('Neplatný požadavek.','Invalid request.')},{status:400});}
    try{return Response.json(await saveAppSettings(env.DB,body),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:error.message},{status:400});}
  }
  // The profile photo, kept with the account (profile-photo.js).
  if(url.pathname==='/app/api/profile/photo'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method==='GET')return Response.json({status:'ok',...await profilePhoto(env.DB)},{headers:{'Cache-Control':'no-store'}});
    if(request.method==='DELETE')return Response.json(await removeProfilePhoto(env.DB),{headers:{'Cache-Control':'no-store'}});
    if(request.method!=='PUT')return Response.json({message:'Method not allowed'},{status:405});
    let body;try{body=await request.json();}catch{return Response.json({message:L('Neplatný požadavek.','Invalid request.')},{status:400});}
    try{return Response.json(await saveProfilePhoto(env.DB,body),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:error.message},{status:400});}
  }
  // Consent to health data (required) and to AI with OpenAI (optional); consent.js.
  if(url.pathname==='/app/api/consent'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json().catch(()=>({}));
    // Turning paused health data back on: the deletion finishes first (health-pause.js).
    const resuming=body?.health===true&&!session.user?.isOwner&&await healthPaused(env.RAW_DB||env.DB,env.USER_ID);
    if(resuming){const blocked=await resumeBlocked(env);if(blocked)return Response.json({status:'health_deleting',message:blocked},{status:409,headers:{'Retry-After':'60','Cache-Control':'no-store'}});}
    try{
      const result=await saveConsent(env,body);
      if(resuming){await bumpCacheVersion(env.DB);reimportAfterPause(env,ctx);}
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }
    catch(error){return Response.json({message:error.message},{status:400});}
  }
  // Settings → Privacy and data → Pause health data: the consent is withdrawn and
  // the health data deleted; the account stays (health-pause.js).
  if(url.pathname==='/app/api/health-pause'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json().catch(()=>({}));
    if(String(body.confirm||'').trim().toUpperCase()!=='PAUSE')return Response.json({message:L('Potvrzení chybí.', 'The confirmation is missing.')},{status:400});
    try{const result=await pauseHealthData(env,session.user);await bumpCacheVersion(env.DB);return Response.json({...result,consent:await consentStatus(env)},{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:error.message},{status:400});}
  }
  if (url.pathname.startsWith("/app/api/passkeys")) {
    const passkeyApi = await handlePasskeyApi(request, env, url, session, ctx);
    if (passkeyApi) return passkeyApi;
  }
  if (url.pathname.startsWith("/app/api/account/email/")) {
    const emailChange = await handleEmailChange(request, env, url, session, ctx);
    if (emailChange) return emailChange;
  }
  // Settings → Účet: every other device is signed out; this one gets a fresh cookie.
  if (url.pathname === "/app/api/account/sign-out-everywhere") return handleSignOutEverywhere(request, env, url, session);
  // Settings → Účet: unlinks the Apple ID.
  if (url.pathname === "/app/api/me/apple" && request.method === "DELETE") {
    if (!session.signedIn) return Response.json({message:"Přihlas se do dashboardu."},{status:401});
    if (request.headers.get("Origin") !== url.origin) return Response.json({message:"Neplatný původ požadavku."},{status:403});
    await unlinkAppleIdentity(env.RAW_DB, session.user.id);
    // The app's Apple sign-in is given back too, when the app made one.
    const keys = await connectionEnvironment(env);
    // A refused revoke keeps the token, so deleting the account later tries again.
    if (keys.APPLE_REFRESH_TOKEN && (await revokeApple(keys)) !== "failed") await deleteConnectionSecret(env, "apple");
    // Whoever is signed in through that Apple ID elsewhere is signed out; this device stays.
    return signedOutElsewhere(env.RAW_DB, session.user.id, env, Response.json({status:"ok"},{headers:{"Cache-Control":"no-store"}}), request);
  }
  // The user's own data: download everything, or delete the account with it.
  if(url.pathname==='/app/api/account/export'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    // NDJSON, streamed page by page (account-data.js): a large account never sits in memory whole.
    return new Response(exportAccountStream(env,session.user),{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Content-Disposition':'attachment; filename="aurin-data-'+localToday()+'.ndjson"','Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/account/delete'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json().catch(()=>({}));
    if(String(body.confirm||'').trim().toUpperCase()!=='SMAZAT')return Response.json({message:'Pro potvrzení napiš SMAZAT.'},{status:400});
    try{
      const result=await deleteAccount(await connectionEnvironment(env),session.user);
      // The session cookie goes too.
      return Response.json(result,{headers:{'Cache-Control':'no-store','Set-Cookie':handleDashboardLogout().headers.get('Set-Cookie')}});
    }catch(error){return Response.json({message:error.message},{status:400});}
  }
  // With the week's coach messages, which Settings → Aurin Pro shows from 75 % on (coach-allowance.js).
  // The purchase as the App Store last told it, and the account's appAccountToken for the next one (app-store.js).
  if(url.pathname==='/app/api/subscription'&&request.method==='GET'){
    const store=session.signedIn?await Promise.all([appAccountToken(env),storePurchase(env)]).catch(error=>{console.error('App Store row failed',error.message);return [null,null];}):[null,null];
    return Response.json({...await subscriptionStatus(env),coachAllowance:await coachAllowance(env).catch(()=>null),appAccountToken:store[0],purchase:store[1]},{headers:{'Cache-Control':'no-store'}});
  }
  // A signed transaction the app saw: a purchase, a renewal, a restore or a redeemed code.
  if(url.pathname==='/app/api/subscription/transaction'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{return Response.json(await saveAppTransaction(env,await request.json().catch(()=>({}))),{headers:{'Cache-Control':'no-store'}});}
    catch(error){if(error.status)return Response.json({status:'error',message:error.message},{status:error.status});throw error;}
  }
  if(url.pathname==='/app/api/onboarding'){
    if(request.method==='GET')return Response.json(await onboardingStatus(env),{headers:{'Cache-Control':'no-store'}});
    if(request.method==='POST'){
      if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      try{const result=await completeOnboarding(env,await request.json());await bumpCacheVersion(env.DB);const sync=await initialImport(env,ctx);return Response.json({...result,sync});}
      catch(error){return Response.json({message:error.message},{status:400});}
    }
  }
}
