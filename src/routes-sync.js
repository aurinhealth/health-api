// Synchronizace routes of the dashboard API (sync-destinations.js).
import { syncLocalWorkout } from "./local-workouts.js";
import { googleToken } from "./index.js";
import { syncOverview, DESTINATIONS, saveSyncPrefs, googleMissingScopes, sendActivity, activitySends, retrySend } from "./sync-destinations.js";
import { L } from "./lang.js";
import { activityTypes, changeActivityType } from "./activity-type.js";

export async function handleSyncApi(request,env,ctx,url,session,internalAuth){
  // Synchronizace (sync-destinations.js): where the user sends data, and the
  // sends of done activities with their state and "Zkusit znovu".
  if(url.pathname==='/app/api/sync/prefs'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    return Response.json(await syncOverview(env),{headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname.startsWith('/app/api/sync/prefs/')&&request.method==='PUT'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const destination=url.pathname.slice('/app/api/sync/prefs/'.length);
    if(!DESTINATIONS.includes(destination))return Response.json({message:L('Neznámá aplikace.', 'Unknown app.')},{status:404});
    try{
      const prefs=await saveSyncPrefs(env.DB,env.USER_ID,destination,await request.json().catch(()=>({})));
      return Response.json({status:'ok',destination,prefs,...(destination==='google'&&env.GOOGLE_REFRESH_TOKEN?{missingScopes:googleMissingScopes(env,prefs)}:{})},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:error.status||400});}
  }
  if(url.pathname==='/app/api/sync/activity'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{return Response.json(await sendActivity(env,await request.json().catch(()=>({})),{googleToken}),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:error.message},{status:error.status||400});}
  }
  // The type of a done activity (activity-type.js): the list, and a change.
  if(url.pathname==='/app/api/activity/types'&&request.method==='GET')return Response.json({status:'ok',types:activityTypes()},{headers:{'Cache-Control':'no-store'}});
  if(url.pathname==='/app/api/activity/type'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{return Response.json(await changeActivityType(env,await request.json().catch(()=>({})),{googleToken}),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:error.message},{status:error.status||400});}
  }
  if(url.pathname==='/app/api/sync/sends'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    return Response.json({status:'ok',key:url.searchParams.get('key'),sends:await activitySends(env,url.searchParams.get('key'))},{headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/sync/retry'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{const body=await request.json().catch(()=>({}));return Response.json({status:'ok',send:await retrySend(env,body.key,body.destination,{googleToken})},{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:error.message},{status:error.status||400});}
  }
  if(url.pathname==='/app/api/workouts/export'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json();return Response.json({status:'ok',sync:await syncLocalWorkout(env,String(body.eventId||'').replace(/^planned:/,''))});
  }
}
