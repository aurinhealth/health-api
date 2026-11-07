import { L } from './lang.js';
import { consentStatus } from './consent.js';
import { storeConfigured, proActive, subscriptionRow } from './app-store.js';
import { FREE_PLANS } from './training-plans.js';
import { isFreeFeature } from './ai-features.js';
// Aurin Pro can be bought in the app (app-store.js); AI still needs it only once
// AI_PAYWALL_ENABLED is on. Until then (the pilot) everyone has AI.
// AI_PAYWALL_ENABLED (Worker var): 'true' turns the paid split on for everyone;
// 'owner' only for the owner's account, so Petr can try the paid app (offer,
// locked plans, a TestFlight purchase) while every tester stays in the free
// pilot (Petr, 5 Nov 2026); anything else is the pilot.
export const paywallOn = env => {
  const value = String(env?.AI_PAYWALL_ENABLED ?? '').trim();
  return value === 'true' || (value === 'owner' && env?.USER_IS_OWNER === true);
};
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
  {name:'AI doplnění chybějící techniky cviku mimo katalog', ai:false},
  {name:'Vitamíny, minerály, vlastní makra a nutriční cíle', ai:true}
];
const FEATURES_EN = {"Vitamíny, minerály, vlastní makra a nutriční cíle": "Vitamins, minerals, custom macros and nutrient targets", "Profil, kalorické cíle a přehledy": "Profile, calorie goals and overviews", "Ruční zápis jídla, váhy a tréninků": "Manual logging of food, weight and workouts", "Moje potraviny, moje jídla a hledání v katalogu": "My foods, my meals and catalog search", "Základní generování a plánování tréninků": "Basic workout generation and planning", "Propojení a synchronizace služeb": "Connecting and syncing services", "AI trenér a úpravy plánů vlastními slovy": "AI coach and plan changes in your own words", "AI hodnocení dne, týdne a odcvičeného tréninku": "AI review of the day, the week and a completed workout", "Rozpoznání jídla a etikety z fotky pomocí AI": "AI recognition of meals and labels from a photo", "AI zápis jídla vlastními slovy a webové dohledání potravin": "AI food logging in your own words and web lookup of foods", "AI doplnění chybějící techniky cviku mimo katalog": "AI technique cards for exercises outside the catalog"};
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
  const enforced = paywallOn(env);
  // Until Pro can be bought, everyone has Pro (testers see it unlocked, Pro icons included).
  let plan=enforced?'free':'ai';
  if(enforced && env.DB){
    if(proActive(env,await subscriptionRow(env)))plan='ai';
  }
  // AI sends the user's data to OpenAI, so it needs the user's AI consent
  // (consent.js); the owner has it until he turns it off. Fail-closed: any env
  // with a database is a user's, whether or not userEnv marked CONSENT_REQUIRED.
  // Only a bare env without a database (local tools, tests) skips the check.
  const aiConsent=env.DB||env.RAW_DB||env.CONSENT_REQUIRED||env.USER_ID!=null?(await consentStatus(env)).aiAllowed:true;
  return {status:'ok',mode:enforced?'paid':'pilot',plan,introSeen:await introSeen(env),aiConsent,aiAccess:aiConsent&&(!enforced||plan==='ai'),billingActive:enforced,checkoutAvailable:enforced&&storeConfigured(env),features:SUBSCRIPTION_FEATURES.map(f=>({...f,name:L(f.name,FEATURES_EN[f.name]||f.name)})),
    terms:L('Zatím jsou všechny dostupné funkce zdarma. Není potřeba platební karta a nic se automaticky neúčtuje. Budoucí AI předplatné, cenu, limity a podmínky oznámíme před spuštěním; placený tarif si zvolíš výslovně. Propojené služby mohou mít vlastní podmínky a ceny.', 'For now, all available features are free. No payment card is needed and nothing is charged automatically. We\'ll announce the future AI subscription, its price, limits and terms before it launches; you\'ll choose a paid plan explicitly. Connected services may have their own terms and prices.')};
}
// Training plans beyond the free starter ones (training-plans.js FREE_PLANS)
// need Pro once the paywall is on (paywallOn). No AI consent here: a plan sends
// nothing to an AI model. No query during the pilot, one row read after.
export async function plansUnlocked(env){
  if(!paywallOn(env))return true;
  if(!env.DB)return false;
  return proActive(env,await subscriptionRow(env).catch(()=>null));
}
export async function assertPlanAccess(env,template){
  if(FREE_PLANS.has(template.id)||await plansUnlocked(env))return;
  const error=new Error(L('Tento plán je součástí Aurin Pro.', 'This plan is part of Aurin Pro.'));error.status=402;throw error;
}
// A free feature (ai-features.js) needs only the consent, not Pro.
export async function assertAIAccess(env,feature=null){
  const status=await subscriptionStatus(env);
  if(status.aiAccess||(status.aiConsent&&isFreeFeature(feature)))return;
  if(!status.aiConsent){const error=new Error(L('AI funkce potřebují tvůj souhlas. Zapneš je v Nastavení → Soukromí a data.', 'AI features need your consent. Turn them on in Settings → Privacy & data.'));error.status=403;error.ai=true;error.consent=true;throw error;}
  const error=new Error(L('Tato AI funkce je součástí Aurin Pro. Najdeš ho v Nastavení → Aurin Pro.', 'This AI feature is part of Aurin Pro. See Settings → Aurin Pro.'));error.status=402;error.ai=true;error.limit=true;throw error;
}
