import { L } from './lang.js';
import { grantedExtras, missingHealthPermissions } from "./google-scopes.js";
import { intervalsOAuthConfigured } from "./intervals-oauth.js";
import { INTERVALS_TOKEN_PREFIX } from "./intervals-auth.js";
import { readConnectionHealth } from "./connection-health.js";
import { appleHealthStatus } from "./apple-health.js";
// Connection metadata never exposes credentials. Provider consent remains on the provider's site.
export async function connectionStatus(env) {
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const googleConnected = Boolean(google && env.GOOGLE_REFRESH_TOKEN);
  const intervalsButton = intervalsOAuthConfigured(env), intervalsConnected = Boolean(env.INTERVALS_API_KEY);
  // A stored key the provider refused at the last sync (connection-health.js).
  const health = await readConnectionHealth(env);
  const state = (provider, connected) => connected ? health[provider] : { needsReconnect: false, lastError: null, lastErrorAt: null, lastSuccessAt: null };
  // Apple Health is connected on the iPhone (HealthKit); the server only knows what the phone sent.
  const apple = env.DB && env.USER_ID != null ? await appleHealthStatus(env.DB, env.USER_ID).catch(() => ({ connected: false })) : { connected: false };
  return {status:"ok",providers:[
    {id:"google",name:"Google Health",required:false,configured:google,connected:googleConnected,...state("google",googleConnected),connectUrl:google?"/oauth/google":null,extras:grantedExtras(env),extrasUrl:google?"/oauth/google?extra=1":null,
      // Permissions unticked on Google's consent screen: that data stays empty until they are granted.
      missingPermissions:googleConnected?missingHealthPermissions(env):[],
      metrics:[L("Spánek a fáze", "Sleep and stages"),L("Aktivity", "Activities"),L("Hmotnost", "Weight"),L("Jídlo", "Food")],note:L("Připojení a obnova oprávnění probíhá přes Google. Po tvém souhlasu aplikace uloží připojení automaticky a vrátí tě zpět.", "Connecting and renewing permissions happens through Google. After you agree, the app saves the connection automatically and brings you back.")},
    {id:"intervals",name:"Intervals.icu",required:false,configured:true,connected:intervalsConnected,...state("intervals",intervalsConnected),
      // With an app registered at Intervals.icu one button connects; otherwise the personal API key.
      connectUrl:intervalsButton?"/oauth/intervals":null,method:intervalsButton?"oauth":"key",via:String(env.INTERVALS_API_KEY||"").startsWith(INTERVALS_TOKEN_PREFIX)?"oauth":env.INTERVALS_API_KEY?"key":null,
      keyUrl:"https://intervals.icu/settings",
      metrics:[L("Aktivity a plán", "Activities and plan"),L("Fitness / únava / forma", "Fitness / fatigue / form"),"Wellness"],note:intervalsButton?L("Připojení probíhá na stránce Intervals.icu. Po tvém souhlasu tě vrátíme zpět.", "Connecting happens on the Intervals.icu site. After you agree, we'll bring you back."):L("Vlož svůj API klíč z Intervals.icu (Settings → Developer Settings). Athlete ID zadávat nemusíš, zjistíme ho z klíče. Klíč ověříme u Intervals a uložíme zašifrovaný na serveru.", "Paste your Intervals.icu API key (Settings → Developer Settings). You don't need the athlete ID; we get it from the key. We verify the key with Intervals and store it encrypted on the server.")}
    // Listed once the phone has connected it: the web cannot connect HealthKit.
    ,...(apple.connected?[{id:"apple",name:"Apple Health",required:false,configured:true,connected:apple.connected,method:"healthkit",needsReconnect:false,lastError:null,lastErrorAt:null,lastSuccessAt:apple.lastSuccessAt||null,categories:apple.categories||[],
      metrics:[L("Spánek a fáze", "Sleep and stages"),L("Tréninky", "Workouts"),L("Tep, HRV a VO2max", "Heart rate, HRV and VO2max"),L("Kroky a energie", "Steps and energy"),L("Hmotnost", "Weight")],note:L("Data čte aplikace Aurin v iPhonu. Co smí číst, vybereš v Aurinu a potvrdíš v systému.", "The Aurin iPhone app reads the data. Choose what it may read in Aurin and confirm it in iOS.")}]:[])
  ]};
}
