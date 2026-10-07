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
export async function subscriptionStatus(env) {
  const enforced = env.AI_PAYWALL_ENABLED === 'true';
  let plan='free';
  if(enforced && env.DB){
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS subscriptions (user_id INTEGER PRIMARY KEY,plan TEXT NOT NULL DEFAULT \'free\',valid_until TEXT)').run();
    const row=await env.DB.prepare('SELECT plan,valid_until FROM subscriptions WHERE user_id=?').bind(env.USER_ID ?? env.DB.userId).first();
    if(row?.plan==='ai' && row.valid_until && Date.parse(row.valid_until)>Date.now())plan='ai';
  }
  return {status:'ok',mode:enforced?'paid':'pilot',plan,aiAccess:!enforced||plan==='ai',billingActive:enforced,checkoutAvailable:false,features:SUBSCRIPTION_FEATURES,
    terms:'Během pilotu pro pozvané jsou všechny dostupné funkce zdarma. Není potřeba platební karta a nic se automaticky neúčtuje. Budoucí AI předplatné, cenu, limity a podmínky oznámíme před spuštěním; placený tarif si zvolíš výslovně. Propojené služby mohou mít vlastní podmínky a ceny.'};
}
export async function assertAIAccess(env){
  if((await subscriptionStatus(env)).aiAccess)return;
  const error=new Error('Tato AI funkce vyžaduje AI předplatné. Přehled najdeš v Nastavení → Předplatné.');error.status=402;error.ai=true;throw error;
}
