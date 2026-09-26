// Connection metadata never exposes credentials. Provider consent remains on the provider's site.
export async function connectionStatus(env) {
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  return {status:"ok",providers:[
    {id:"google",name:"Google Health",configured:google,connected:Boolean(google&&env.GOOGLE_REFRESH_TOKEN),connectUrl:google?"/oauth/google":null,metrics:["Spánek a fáze","Aktivity","Hmotnost","Jídlo"],note:"Připojení a obnova oprávnění probíhá přes Google. Po tvém souhlasu aplikace uloží připojení automaticky a vrátí tě do Nastavení."},
    {id:"intervals",name:"Intervals.icu",configured:Boolean(env.INTERVALS_API_KEY),connected:Boolean(env.INTERVALS_API_KEY),connectUrl:"https://intervals.icu/settings",metrics:["Aktivity a plán","Fitness / únava / forma","Wellness"],note:"API klíč z nastavení Intervals lze připojit přímo zde. Klíč ověříme u Intervals a uložíme zašifrovaný na serveru."},
    {id:"apple",name:"Apple Health",configured:false,connected:false,connectUrl:null,metrics:["Spánek","HRV a tep","Aktivity","Tělesné údaje"],note:"HealthKit se připojuje na iPhonu. Přímé webové přihlášení není dostupné. Pro automatickou synchronizaci je potřeba iOS bridge; export Apple Health lze použít pro budoucí import."}
  ]};
}
