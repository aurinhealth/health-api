// Connection metadata never exposes credentials. Provider consent remains on the provider's site.
export async function connectionStatus(env) {
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  return {status:"ok",providers:[
    {id:"google",name:"Google Health",required:true,configured:google,connected:Boolean(google&&env.GOOGLE_REFRESH_TOKEN),connectUrl:google?"/oauth/google":null,metrics:["Spánek a fáze","Aktivity","Hmotnost","Jídlo"],note:"Připojení a obnova oprávnění probíhá přes Google. Po tvém souhlasu aplikace uloží připojení automaticky a vrátí tě do Nastavení."},
    {id:"intervals",name:"Intervals.icu",required:true,configured:true,connected:Boolean(env.INTERVALS_API_KEY),connectUrl:"https://intervals.icu/settings",metrics:["Aktivity a plán","Fitness / únava / forma","Wellness"],note:"Vlož svůj API klíč z Intervals.icu (Settings → Developer Settings). Athlete ID zadávat nemusíš, zjistíme ho z klíče. Klíč ověříme u Intervals a uložíme zašifrovaný na serveru."}
  ]};
}
