import { L } from './lang.js';
import { grantedExtras, missingHealthPermissions } from "./google-scopes.js";
import { intervalsOAuthConfigured } from "./intervals-oauth.js";
import { INTERVALS_TOKEN_PREFIX } from "./intervals-auth.js";
import { readConnectionHealth } from "./connection-health.js";
import { appleHealthStatus } from "./apple-health.js";
import { ultrahumanConfigured } from "./ultrahuman.js";
import { whoopConfigured } from "./whoop.js";
import { readSourcePriority } from "./source-priority.js";
// Connection metadata never exposes credentials. Provider consent remains on the provider's site.
export async function connectionStatus(env) {
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const googleConnected = Boolean(google && env.GOOGLE_REFRESH_TOKEN);
  const intervalsButton = intervalsOAuthConfigured(env), intervalsConnected = Boolean(env.INTERVALS_API_KEY);
  // A stored key the provider refused at the last sync (connection-health.js).
  const health = await readConnectionHealth(env);
  const state = (provider, connected) => connected ? health[provider] : { needsReconnect: false, lastError: null, lastErrorAt: null, lastSuccessAt: null };
  // Apple Health is connected on the iPhone (HealthKit); the server only knows what the phone sent.
  const ultrahuman = ultrahumanConfigured(env), ultrahumanConnected = Boolean(env.ULTRAHUMAN_TOKEN);
  const whoop = whoopConfigured(env), whoopConnected = Boolean(env.WHOOP_TOKEN);
  const apple = env.DB && env.USER_ID != null ? await appleHealthStatus(env.DB, env.USER_ID).catch(() => ({ connected: false })) : { connected: false };
  // Where nights and days come from when several sources measure them (source-priority.js).
  const priority = env.DB && env.USER_ID != null ? await readSourcePriority(env.DB, env.USER_ID) : { night: "auto", day: "auto" };
  return {status:"ok",priority,providers:[
    {id:"google",name:"Google Health",required:false,configured:google,connected:googleConnected,...state("google",googleConnected),connectUrl:google?"/oauth/google":null,extras:grantedExtras(env),extrasUrl:google?"/oauth/google?extra=1":null,
      // Permissions unticked on Google's consent screen: that data stays empty until they are granted.
      missingPermissions:googleConnected?missingHealthPermissions(env):[],
      metrics:[L("Spánek a fáze", "Sleep and stages"),L("Aktivity", "Activities"),L("Hmotnost", "Weight"),L("Jídlo", "Food")],note:L("Připojení a obnova oprávnění probíhá přes Google. Po tvém souhlasu aplikace uloží připojení automaticky a vrátí tě zpět.", "Connecting and renewing permissions happens through Google. After you agree, the app saves the connection automatically and brings you back.")},
    {id:"intervals",name:"Intervals.icu",required:false,configured:true,connected:intervalsConnected,...state("intervals",intervalsConnected),
      // With an app registered at Intervals.icu one button connects; otherwise the personal API key.
      connectUrl:intervalsButton?"/oauth/intervals":null,method:intervalsButton?"oauth":"key",via:String(env.INTERVALS_API_KEY||"").startsWith(INTERVALS_TOKEN_PREFIX)?"oauth":env.INTERVALS_API_KEY?"key":null,
      keyUrl:"https://intervals.icu/settings",
      metrics:[L("Aktivity a plán", "Activities and plan"),L("Fitness / únava / forma", "Fitness / fatigue / form"),"Wellness"],note:intervalsButton?L("Připojení probíhá na stránce Intervals.icu. Po tvém souhlasu tě vrátíme zpět.", "Connecting happens on the Intervals.icu site. After you agree, we'll bring you back."):L("Vlož svůj API klíč z Intervals.icu (Settings → Developer Settings). Athlete ID zadávat nemusíš, zjistíme ho z klíče. Klíč ověříme u Intervals a uložíme zašifrovaný na serveru.", "Paste your Intervals.icu API key (Settings → Developer Settings). You don't need the athlete ID; we get it from the key. We verify the key with Intervals and store it encrypted on the server.")}
    // Offered once the Ultrahuman app is registered; which night counts is source-priority.js's call.
    ,...(ultrahuman||ultrahumanConnected?[{id:"ultrahuman",name:"Ultrahuman",required:false,configured:ultrahuman,connected:ultrahumanConnected,...state("ultrahuman",ultrahumanConnected),connectUrl:ultrahuman?"/oauth/ultrahuman":null,
      metrics:[L("Spánek a fáze", "Sleep and stages"),L("HRV a klidový tep", "HRV and resting heart rate"),L("Teplota kůže", "Skin temperature"),"VO2max"],note:L("Připojení probíhá na stránce Ultrahumanu. Po tvém souhlasu tě vrátíme zpět.", "Connecting happens on the Ultrahuman site. After you agree, we'll bring you back.")}]:[])
    ,...(whoop||whoopConnected?[{id:"whoop",name:"WHOOP",required:false,configured:whoop,connected:whoopConnected,...state("whoop",whoopConnected),connectUrl:whoop?"/oauth/whoop":null,
      metrics:[L("Spánek a fáze", "Sleep and stages"),L("HRV a klidový tep", "HRV and resting heart rate"),L("Dech a kyslík", "Breathing and oxygen")],note:L("Připojení probíhá na stránce WHOOPu. Po tvém souhlasu tě vrátíme zpět.", "Connecting happens on the WHOOP site. After you agree, we'll bring you back.")}]:[])
    // Listed once the phone has connected it: the web cannot connect HealthKit.
    ,...(apple.connected?[{id:"apple",name:"Apple Health",required:false,configured:true,connected:apple.connected,method:"healthkit",needsReconnect:false,lastError:null,lastErrorAt:null,lastSuccessAt:apple.lastSuccessAt||null,categories:apple.categories||[],
      metrics:[L("Spánek a fáze", "Sleep and stages"),L("Tréninky", "Workouts"),L("Tep, HRV a VO2max", "Heart rate, HRV and VO2max"),L("Kroky a energie", "Steps and energy"),L("Hmotnost", "Weight")],note:L("Data čte aplikace Aurin v iPhonu. Co smí číst, vybereš v Aurinu a potvrdíš v systému.", "The Aurin iPhone app reads the data. Choose what it may read in Aurin and confirm it in iOS.")}]:[])
  ]};
}
