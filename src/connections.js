import { grantedExtras, missingHealthPermissions } from "./google-scopes.js";
import { intervalsOAuthConfigured } from "./intervals-oauth.js";
import { INTERVALS_TOKEN_PREFIX } from "./intervals-auth.js";
// Connection metadata never exposes credentials. Provider consent remains on the provider's site.
export async function connectionStatus(env) {
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const googleConnected = Boolean(google && env.GOOGLE_REFRESH_TOKEN);
  const intervalsButton = intervalsOAuthConfigured(env);
  return {status:"ok",providers:[
    {id:"google",name:"Google Health",required:false,configured:google,connected:googleConnected,connectUrl:google?"/oauth/google":null,extras:grantedExtras(env),extrasUrl:google?"/oauth/google?extra=1":null,
      // Permissions unticked on Google's consent screen: that data stays empty until they are granted.
      missingPermissions:googleConnected?missingHealthPermissions(env):[],
      metrics:["Spánek a fáze","Aktivity","Hmotnost","Jídlo"],note:"Připojení a obnova oprávnění probíhá přes Google. Po tvém souhlasu aplikace uloží připojení automaticky a vrátí tě zpět."},
    {id:"intervals",name:"Intervals.icu",required:false,configured:true,connected:Boolean(env.INTERVALS_API_KEY),
      // With an app registered at Intervals.icu one button connects; otherwise the personal API key.
      connectUrl:intervalsButton?"/oauth/intervals":null,method:intervalsButton?"oauth":"key",via:String(env.INTERVALS_API_KEY||"").startsWith(INTERVALS_TOKEN_PREFIX)?"oauth":env.INTERVALS_API_KEY?"key":null,
      keyUrl:"https://intervals.icu/settings",
      metrics:["Aktivity a plán","Fitness / únava / forma","Wellness"],note:intervalsButton?"Připojení probíhá na stránce Intervals.icu. Po tvém souhlasu tě vrátíme zpět.":"Vlož svůj API klíč z Intervals.icu (Settings → Developer Settings). Athlete ID zadávat nemusíš, zjistíme ho z klíče. Klíč ověříme u Intervals a uložíme zašifrovaný na serveru."}
  ]};
}
