// Account routes of the dashboard API: me, consent, passkeys, e-mail, sign-out,
// Apple ID, export and delete, subscription, training setup and onboarding.
import { initialImport } from "./account-sync.js";
import { onboardingStatus, trainingSetup, updateTrainingSetup, completeOnboarding } from "./onboarding.js";
import { subscriptionStatus, markAiIntroSeen } from "./subscription.js";
import { consentStatus, saveConsent } from "./consent.js";
import { missingProviders, connectionEnvironment, deleteConnectionSecret } from "./connection-secrets.js";
import { bumpCacheVersion } from "./api-cache.js";
import { appleConfigured, appleIdentity, unlinkAppleIdentity, revokeApple } from "./apple-login.js";
import { handleSignOutEverywhere, signedOutElsewhere, handleDashboardLogout } from "./dashboard-auth.js";
import { aiAllowance } from "./ai-usage.js";
import { exportAccountData, deleteAccount } from "./account-data.js";
import { listPasskeys, handlePasskeyApi } from "./passkeys.js";
import { handleEmailChange } from "./email-login.js";
import { emailConfigured } from "./email-sender.js";
import { L } from "./lang.js";
import { localToday } from "./user-time.js";

export async function handleAccountApi(request,env,ctx,url,session,internalAuth){
  if (url.pathname === "/app/api/me" && request.method === "GET") {
    const [onboarding,ai,consent]=await Promise.all([onboardingStatus(env),session.signedIn&&env.OPENAI_API_KEY?aiAllowance(env).catch(error=>{console.error('AI usage read failed',error.message);return null;}):null,session.signedIn?consentStatus(env):null]);
    const apple = appleConfigured(env) && session.user ? await appleIdentity(env.RAW_DB, session.user.id) : null;
    const passkeys = session.user ? await listPasskeys(env.RAW_DB, session.user.id) : [];
    return Response.json({status:"ok",user:session.user||null,missingProviders:missingProviders(env),onboarding,ai,consent,apple,passkeys,emailLogin:emailConfigured(env)},{headers:{"Cache-Control":"no-store"}});
  }
  // Consent to health data (required) and to AI with OpenAI (optional); consent.js.
  if(url.pathname==='/app/api/consent'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{const result=await saveConsent(env,await request.json().catch(()=>({})));return Response.json(result,{headers:{'Cache-Control':'no-store'}});}
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
  // Settings → Účet: unlinks the Apple ID (linking goes through /auth/apple?link=1).
  if (url.pathname === "/app/api/me/apple" && request.method === "DELETE") {
    if (!session.signedIn) return Response.json({message:"Přihlas se do dashboardu."},{status:401});
    if (request.headers.get("Origin") !== url.origin) return Response.json({message:"Neplatný původ požadavku."},{status:403});
    await unlinkAppleIdentity(env.RAW_DB, session.user.id);
    // The app's Apple sign-in is given back too, when the app made one.
    const keys = await connectionEnvironment(env);
    if (keys.APPLE_REFRESH_TOKEN) { await revokeApple(keys); await deleteConnectionSecret(env, "apple"); }
    // Whoever is signed in through that Apple ID elsewhere is signed out; this device stays.
    return signedOutElsewhere(env.RAW_DB, session.user.id, env, Response.json({status:"ok"},{headers:{"Cache-Control":"no-store"}}));
  }
  // The user's own data: download everything, or delete the account with it.
  if(url.pathname==='/app/api/account/export'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const data=await exportAccountData(env,session.user);
    return new Response(JSON.stringify(data,null,1),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="loadwise-data-'+localToday()+'.json"','Cache-Control':'no-store'}});
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
  if(url.pathname==='/app/api/subscription'&&request.method==='GET')return Response.json(await subscriptionStatus(env),{headers:{'Cache-Control':'no-store'}});
  if(url.pathname==='/app/api/subscription/intro'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    return Response.json(await markAiIntroSeen(env),{headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/training-setup'){
    if(request.method==='GET')return Response.json({status:'ok',training:await trainingSetup(env.DB)},{headers:{'Cache-Control':'no-store'}});
    if(request.method==='PATCH'){
      if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      try{const training=await updateTrainingSetup(env.DB,await request.json());await bumpCacheVersion(env.DB);return Response.json({status:'ok',training});}catch(error){return Response.json({message:error.message},{status:400});}
    }
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
