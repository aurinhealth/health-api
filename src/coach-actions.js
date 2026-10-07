import { validDay } from './training-availability.js';
import { trainingStatus } from './training-status.js';
import { prepareGymSwap,gymAdjustmentRequest } from './coach-gym-adjustment.js';

// Pictures the app can draw under an answer from the athlete's real data.
export const COACH_VISUALS=['form','recovery','sleep','nutrition','week','training','zones'];
export const COACH_ACTION_FORMAT={type:'json_schema',name:'coach_reply',strict:true,schema:{type:'object',additionalProperties:false,required:['answer','visuals','actions'],properties:{answer:{type:'string'},visuals:{type:'array',items:{type:'string',enum:COACH_VISUALS}},actions:{type:'array',items:{type:'object',additionalProperties:false,required:['type','eventId','date','sport','minutes','status','statusUntil','reason','fromExercise','toExercise','workoutId'],properties:{type:{type:'string',enum:['status','move','rest','workout','gym_swap','week_sport']},eventId:{type:'string'},date:{type:'string'},sport:{type:'string',enum:['ride','run','gym','']},minutes:{type:'integer'},status:{type:'string',enum:['active','sick','injured','on_break','']},statusUntil:{type:'string'},reason:{type:'string'},fromExercise:{type:'string'},toExercise:{type:'string'},workoutId:{type:'string'}}}}}}};
export const ACTION_INSTRUCTIONS=`Vrať answer, visuals a nejvýše 3 actions k potvrzení. visuals jsou 0–2 obrázky, které aplikace nakreslí pod odpověď ze skutečných dat: form (kondice, únava, forma), recovery (HRV a klidový tep), sleep (spánek posledních nocí), nutrition (dnešní jídlo a makra proti cíli), week (zátěž týdne proti cíli), training (dnešní tréninky), zones (FTP a zóny). Vyber jen ty, které odpověď opravdu ilustrují; čísla z nich v textu neopakuj, stačí je okomentovat. Každá action musí mít konkrétní důvod. Pokud uživatel jen diskutuje nebo odmítá, nemusíš navrhnout akci.
type=gym_swap nahrazuje jeden nezačatý cvik v selectedGym, pokud je otevřený, jinak v todayGym: fromExercise přesně z plánu a toExercise z jeho alternatives, date je datum tohoto plánu. Zachová počet pracovních sérií a cílovou partii. Navrhuj ji při žádosti o změnu cviků; neodstraňuj místo toho celý trénink. Zátěž připraví aplikace z historie náhradního cviku. Neznámé kilogramy nevymýšlej.
type=week_sport přidá sport do rozvrhu na konkrétní date, i když ten den už obsahuje jiný sport. Použij ji pro žádost zařadit gym/kolo/běh do týdne; zachová ostatní sporty. Nevytváří hotový trénink ani zápis do Intervals.icu, minutes=0. K přípravě konkrétního tréninku s délkou slouží workout.
type=status navrhuje změnu stavu; nemoc/zranění jen pokud ji uvedl uživatel. statusUntil je první den (YYYY-MM-DD), kdy stav už neplatí, pokud ho uživatel uvedl nebo je zřejmý; jinak ''. type=move přesouvá existující trénink na date; type=rest ruší konkrétní existující trénink pro odpočinek; obě používají skutečné eventId z kontextu week.planned. type=workout připraví náhled sportu pro konkrétní den s danými minutes. Pokud v answer doporučuješ konkrétní workout z workoutLibraryRecommendations, dej jeho id do workoutId (jinak ''), aby náhled ukázal přesně tento trénink. Nezapisuje přímo do kalendáře. Nepřidávej akci, kterou data nepodporují. Nepotřebná pole vyplň prázdným řetězcem, minutes=0. Akce jsou pouze návrhy, nic nebylo provedeno. Aplikace každou akci ukáže pod odpovědí jako kartu s náhledem (u workout profil tréninku nebo cviky s postavou), proto v answer konkrétní cviky, série ani intervaly navrženého tréninku nevypisuj; napiš jen proč a na co si dát pozor, nejvýše 3 krátké body. Uživatel návrh potvrdí nebo upraví zprávou (např. „potvrzuji“, „delší“, „jinou variantu“); o tlačítkách nepiš.`;
// Words the athlete must have used before the coach may propose Sick or Injured.
export const SICK_WORDS=/nemoc|horeč|horec|sick|chřip|chrip|nachl|rým|covid|vir[oó]z|viros|teplot/i;
export const INJURY_WORDS=/zran|bol[eíe]|bolest|injur|natáh|natah|podvrt|výron|vyron|nateklé|natekl/i;
const SHORT_DAYS=['ne','po','út','st','čt','pá','so'];
const shortDate=d=>validDay(d)?SHORT_DAYS[new Date(d+'T12:00:00Z').getUTCDay()]+' '+Number(d.slice(8))+'. '+Number(d.slice(5,7))+'.':'';
const SPORT_NAMES={ride:'kolo',run:'běh',gym:'gym'},STATUS_NAMES={active:'Active',sick:'Sick',injured:'Injured',on_break:'On break'};
// One line per validated proposal, stored with the answer so later turns know it.
export function actionSummary(a){
  if(a.type==='gym_swap')return 'Vyměnit '+a.fromExercise+' → '+a.toExercise+' ('+shortDate(a.date)+')';
  if(a.type==='week_sport')return 'Přidat '+SPORT_NAMES[a.sport]+' do týdne na '+shortDate(a.date);
  if(a.type==='status')return 'Stav '+STATUS_NAMES[a.status]+(a.statusUntil?' (znovu Active od '+shortDate(a.statusUntil)+')':'');
  if(a.type==='move')return 'Přesunout '+(a.eventSnapshot?.name||'trénink')+' na '+shortDate(a.date);
  if(a.type==='rest')return 'Odstranit '+(a.eventSnapshot?.name||'trénink')+' ('+shortDate(a.date)+')';
  return 'Připravit '+SPORT_NAMES[a.sport]+(a.workoutName?' „'+a.workoutName+'“':'')+' '+a.minutes+' min na '+shortDate(a.date);
}
// The safety inputs the week review sets, for the chat path too: each day's
// time budget from its own week's plan and the sessions planned from today on.
// `planFor(date)` returns the week plan (availability Monday..Sunday).
export function actionSafetyContext(days,today,planFor){
  const ahead=(days||[]).filter(d=>validDay(d.date)&&d.date>=today);
  return {
    availabilityByDate:Object.fromEntries(ahead.map(d=>[d.date,planFor(d.date)?.availability?.[(new Date(d.date+'T12:00:00Z').getUTCDay()+6)%7]]).filter(([,a])=>a&&typeof a==='object')),
    remainingPlanned:ahead.flatMap(d=>(d.planned||d.daily?.training?.planned||[]).filter(a=>!/nutrition/i.test(a.name||'')).map(a=>({date:d.date,id:a.id,name:a.name})))
  };
}
export const actionsNote=actions=>actions?.length?'[Návrhy: '+actions.map(actionSummary).join('; ')+']':'';
export function validateCoachActions(actions,context,today,{userInitiated=false}={}){
  const events=new Map((context.week||[]).flatMap(d=>(d.planned||[]).map(a=>[String(a.id),{date:d.date,...a}])));
  return (Array.isArray(actions)?actions:[]).slice(0,3).flatMap(a=>{
    const reason=String(a.reason||'').trim().slice(0,500);if(!reason)return [];
    if(a.type==='gym_swap'&&!trainingStatus(context.athleteState).paused&&validDay(a.date)&&a.date>=today&&context.gymPlan?.values?.length){
      try{const swap=prepareGymSwap(context.gymPlan,a.fromExercise,a.toExercise,reason);return swap.date===a.date?[swap]:[];}catch{return [];}
    }
    if(a.type==='week_sport'&&!trainingStatus(context.athleteState).paused&&validDay(a.date)&&a.date>=today&&['ride','run','gym'].includes(a.sport)){
      return [{type:'week_sport',date:a.date,sport:a.sport,reason}];
    }
    if(a.type==='status'&&['active','sick','injured','on_break'].includes(a.status)){
      const words=[context.userMessage,...(context.conversation||[]).filter(t=>t.role==='user').map(t=>t.content)].join(' ');
      if(a.status==='sick'&&!SICK_WORDS.test(words))return [];
      if(a.status==='injured'&&!INJURY_WORDS.test(words))return [];
      const until=a.status!=='active'&&validDay(a.statusUntil)&&a.statusUntil>today?a.statusUntil:null;
      return [{type:'status',status:a.status,reason,...(until?{statusUntil:until}:{})}];
    }
    if(['move','rest'].includes(a.type)){
      const since=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
      const signals=[context.userMessage,...(context.athleteFeedback||[]).filter(f=>f.date&&f.date>=since&&f.date<=today).map(f=>f.notes)].join(' ');
      const requestedRest=/(?:odpoč|pauz|zruš|zrus|volno|vynech|nemoc|horeč|horec|bolest|bolí|zran)/i.test(signals);
      if(a.type==='rest'&&gymAdjustmentRequest(context.userMessage||'',context.appContext)&&!requestedRest&&!trainingStatus(context.athleteState).paused&&context.cyclingCoachV2?.readiness?.status!=='red')return [];
      const event=events.get(String(a.eventId));
      if(!event||event.date<today||!String(a.eventId).startsWith('planned:'))return [];
      if(a.type==='move'&&(!validDay(a.date)||a.date<today))return [];
      const budget=context.availabilityByDate?.[a.date]?.minutes;
      if(!userInitiated&&a.type==='move'&&budget!=null&&Number(event.durationHours)*60>budget)return [];
      return [{type:a.type,eventId:String(a.eventId),date:a.type==='move'?a.date:event.date,reason,eventSnapshot:{name:event.name,date:event.date,durationHours:event.durationHours}}];
    }
    if(a.type==='workout'&&!trainingStatus(context.athleteState).paused&&validDay(a.date)&&a.date>=today&&['ride','run','gym'].includes(a.sport)&&Number.isInteger(a.minutes)&&a.minutes>=(a.sport==='run'?20:30)&&a.minutes<=360){
      if(!userInitiated&&context.remainingPlanned?.some(x=>x.date===a.date))return [];
      const budget=context.availabilityByDate?.[a.date]?.minutes;if(!userInitiated&&budget!=null&&a.minutes>budget)return [];
      // Only a workout the coach was actually offered; the preview then shows exactly it.
      const library=a.workoutId?(context.workoutLibraryRecommendations||[]).find(w=>String(w.id)===String(a.workoutId)&&(!w.sport||w.sport===a.sport)):null;
      return [{type:'workout',date:a.date,sport:a.sport,minutes:a.minutes,reason,...(library&&a.sport!=='gym'?{workoutId:String(library.id),workoutName:library.name}:{})}];
    }
    return [];
  });
}
