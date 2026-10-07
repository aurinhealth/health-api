import { L } from './lang.js';
// Billing is deliberately inactive during the invitation-only pilot.
export const SUBSCRIPTION_FEATURES = [
  {name:'Profil, kalorické cíle a přehledy', ai:false},
  {name:'Ruční zápis jídla, váhy a tréninků', ai:false},
  {name:'Moje potraviny, moje jídla a hledání v katalogu', ai:false},
  {name:'Základní generování a plánování tréninků', ai:false},
  {name:'Propojení a synchronizace služeb', ai:false},
  {name:'AI trenér a úpravy plánů vlastními slovy', ai:true},
  {name:'AI hodnocení dne, týdne a odcvičeného tréninku', ai:true},
  {name:'Rozpoznání jídla a etikety z fotky pomocí AI', ai:true},
  {name:'AI zápis jídla vlastními slovy a webové dohledání potravin', ai:true},
  {name:'AI doplnění chybějící techniky cviku mimo katalog', ai:true}
];
const FEATURES_EN = {"Profil, kalorické cíle a přehledy": "Profile, calorie goals and overviews", "Ruční zápis jídla, váhy a tréninků": "Manual logging of food, weight and workouts", "Moje potraviny, moje jídla a hledání v katalogu": "My foods, my meals and catalog search", "Základní generování a plánování tréninků": "Basic workout generation and planning", "Propojení a synchronizace služeb": "Connecting and syncing services", "AI trenér a úpravy plánů vlastními slovy": "AI coach and plan changes in your own words", "AI hodnocení dne, týdne a odcvičeného tréninku": "AI review of the day, the week and a completed workout", "Rozpoznání jídla a etikety z fotky pomocí AI": "AI recognition of meals and labels from a photo", "AI zápis jídla vlastními slovy a webové dohledání potravin": "AI food logging in your own words and web lookup of foods", "AI doplnění chybějící techniky cviku mimo katalog": "AI technique cards for exercises outside the catalog"};
// The comparison of the plans pops up once, at the first use of an AI feature
// during the pilot (kept per account, dashboard_profile row 4). Once the paid
// split is on, it shows whenever a locked feature is used.
const INTRO_ROW = 4;
async function introSeen(env) {
  if (!env.DB || !(env.USER_ID ?? env.DB.userId)) return false;
  const row = await env.DB.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=?').bind(env.USER_ID ?? env.DB.userId, INTRO_ROW).first().catch(() => null);
  try { return Boolean(JSON.parse(row?.profile_json || 'null')?.aiIntroSeenAt); } catch { return false; }
}
export async function markAiIntroSeen(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY(user_id,id))').run();
  await env.DB.prepare('INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET profile_json=excluded.profile_json').bind(env.USER_ID ?? env.DB.userId, INTRO_ROW, JSON.stringify({ aiIntroSeenAt: new Date().toISOString() })).run();
  return { status: 'ok', introSeen: true };
}
export async function subscriptionStatus(env) {
  const enforced = env.AI_PAYWALL_ENABLED === 'true';
  let plan='free';
  if(enforced && env.DB){
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS subscriptions (user_id INTEGER PRIMARY KEY,plan TEXT NOT NULL DEFAULT \'free\',valid_until TEXT)').run();
    const row=await env.DB.prepare('SELECT plan,valid_until FROM subscriptions WHERE user_id=?').bind(env.USER_ID ?? env.DB.userId).first();
    if(row?.plan==='ai' && row.valid_until && Date.parse(row.valid_until)>Date.now())plan='ai';
  }
  return {status:'ok',mode:enforced?'paid':'pilot',plan,introSeen:await introSeen(env),aiAccess:!enforced||plan==='ai',billingActive:enforced,checkoutAvailable:false,features:SUBSCRIPTION_FEATURES.map(f=>({...f,name:L(f.name,FEATURES_EN[f.name]||f.name)})),
    terms:L('Během pilotu pro pozvané jsou všechny dostupné funkce zdarma. Není potřeba platební karta a nic se automaticky neúčtuje. Budoucí AI předplatné, cenu, limity a podmínky oznámíme před spuštěním; placený tarif si zvolíš výslovně. Propojené služby mohou mít vlastní podmínky a ceny.', 'During the invitation-only pilot, all available features are free. No payment card is needed and nothing is charged automatically. We\'ll announce the future AI subscription, its price, limits and terms before it launches; you\'ll choose a paid plan explicitly. Connected services may have their own terms and prices.')};
}
export async function assertAIAccess(env){
  if((await subscriptionStatus(env)).aiAccess)return;
  const error=new Error(L('Tato AI funkce vyžaduje AI předplatné. Přehled najdeš v Nastavení → Předplatné.', 'This AI feature needs an AI subscription. See Settings → Subscription.'));error.status=402;error.ai=true;error.limit=true;throw error;
}
