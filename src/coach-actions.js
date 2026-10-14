import { L } from './lang.js';
import { validDay } from './training-availability.js';
import { trainingStatus } from './training-status.js';
import { prepareGymSwap,gymAdjustmentRequest } from './coach-gym-adjustment.js';
import { kcalTargets } from './activity-edits.js';

// Pictures the app can draw under an answer from the athlete's real data.
export const COACH_VISUALS=['form','recovery','sleep','nutrition','week','training','zones'];
// The kind of ride or run a proposed workout is (week-ai.js KINDS), so the
// prepared workout is the one the answer talks about.
export const WORKOUT_KINDS=['recovery','endurance','long','tempo','sweet_spot','threshold','vo2max'];
export const COACH_ACTION_FORMAT={type:'json_schema',name:'coach_reply',strict:true,schema:{type:'object',additionalProperties:false,required:['answer','visuals','actions','memory'],properties:{answer:{type:'string'},memory:{type:'object',additionalProperties:false,required:['forget','update'],properties:{forget:{type:'array',items:{type:'string'}},update:{type:'array',items:{type:'object',additionalProperties:false,required:['from','to'],properties:{from:{type:'string'},to:{type:'string'}}}}}},visuals:{type:'array',items:{type:'string',enum:COACH_VISUALS}},actions:{type:'array',items:{type:'object',additionalProperties:false,required:['type','eventId','date','sport','minutes','status','statusUntil','reason','fromExercise','toExercise','workoutId','kind','activityId','otherActivityId','time','kcal'],properties:{type:{type:'string',enum:['status','move','rest','workout','gym_swap','week_sport','activity_kcal','activity_delete','activity_merge','activity_time']},eventId:{type:'string'},date:{type:'string'},sport:{type:'string',enum:['ride','run','gym','']},minutes:{type:'integer'},status:{type:'string',enum:['active','sick','injured','on_break','']},statusUntil:{type:'string'},reason:{type:'string'},fromExercise:{type:'string'},toExercise:{type:'string'},workoutId:{type:'string'},kind:{type:'string',enum:['',...WORKOUT_KINDS]},activityId:{type:'string'},otherActivityId:{type:'string'},time:{type:'string'},kcal:{type:'integer'}}}}}}};
// The reply format, in the app language; ACTION_INSTRUCTIONS is the Czech default.
export const actionInstructions=()=>L(`Vrať answer, visuals a nejvýše 3 actions k potvrzení. visuals jsou 0–2 obrázky, které aplikace nakreslí pod odpověď ze skutečných dat: form (kondice, únava, forma), recovery (HRV a klidový tep), sleep (spánek posledních nocí), nutrition (dnešní jídlo a makra proti cíli), week (zátěž týdne proti cíli), training (dnešní tréninky), zones (FTP a zóny). Vyber jen ty, které odpověď opravdu ilustrují; čísla z nich v textu neopakuj, stačí je okomentovat. Každá action musí mít konkrétní důvod. Pokud uživatel jen diskutuje nebo odmítá, nemusíš navrhnout akci.
type=gym_swap nahrazuje jeden nezačatý cvik v selectedGym, pokud je otevřený, jinak v todayGym: fromExercise přesně z plánu a toExercise z jeho alternatives, date je datum tohoto plánu. Zachová počet pracovních sérií a cílovou partii. Navrhuj ji při žádosti o změnu cviků; neodstraňuj místo toho celý trénink. Zátěž připraví aplikace z historie náhradního cviku. Neznámé kilogramy nevymýšlej.
type=week_sport přidá sport do rozvrhu na konkrétní date, i když ten den už obsahuje jiný sport. Použij ji pro žádost zařadit gym/kolo/běh do týdne; zachová ostatní sporty. Nevytváří hotový trénink ani zápis do Intervals.icu, minutes=0. K přípravě konkrétního tréninku s délkou slouží workout.
type=activity_kcal přepíše kalorie dokončené aktivity jen v Aurinu (zdroj jako Intervals.icu nebo hodinky zůstane beze změny): activityId je přesné id aktivity z completed v kontextu, kcal nová hodnota v kcal, date její den. Navrhni ji, když uživatel chce kalorie aktivity opravit nebo je hodnota zjevná chyba měření; neříkej, že to nejde.
type=activity_delete smaže dokončenou aktivitu jen v Aurinu (v hodinkách, Apple/Google Health i Intervals.icu zůstane): activityId z completed, date její den. Jen když o to uživatel požádá (např. jel autem, záznam je omyl).
type=activity_merge sloučí dvě části jednoho tréninku, které hodinky rozdělily: activityId a otherActivityId z completed, stejný sport, stejný den, pauza mezi nimi nejvýše 90 minut (podle start a end). V Aurinu vznikne jedna aktivita, zdroje zůstanou.
type=activity_time posune začátek aktivity zapsané v Aurinu (source local) na time ve tvaru HH:MM, délka zůstane; čas z hodinek měnit nejde, to uživateli řekni. Tyto tři akce jdou po potvrzení vrátit.
type=status navrhuje změnu stavu; nemoc/zranění jen pokud ji uvedl uživatel. statusUntil je první den (YYYY-MM-DD), kdy stav už neplatí, pokud ho uživatel uvedl nebo je zřejmý; jinak ''. type=move přesouvá existující trénink na date; type=rest ruší konkrétní existující trénink pro odpočinek; obě používají skutečné eventId z kontextu week.planned. type=workout připraví náhled sportu pro konkrétní den s danými minutes. Pokud v answer doporučuješ konkrétní workout z workoutLibraryRecommendations, dej jeho id do workoutId (jinak ''), aby náhled ukázal přesně tento trénink. U kola a běhu bez workoutId dej do kind druh tréninku, který v answer doporučuješ (recovery, endurance, long, tempo, sweet_spot, threshold, vo2max), a aplikace připraví přesně tento druh; u gymu kind=''. Nezapisuje přímo do kalendáře. Nepřidávej akci, kterou data nepodporují. Nepotřebná pole vyplň prázdným řetězcem, minutes=0, kcal=0. Akce jsou pouze návrhy, nic nebylo provedeno. Aplikace každou akci ukáže pod odpovědí jako kartu s náhledem (u workout profil tréninku nebo cviky s postavou), proto v answer konkrétní cviky, série ani intervaly navrženého tréninku nevypisuj; napiš jen proč a na co si dát pozor, nejvýše 3 krátké body. Uživatel návrh potvrdí nebo upraví zprávou (např. „potvrzuji“, „delší“, „jinou variantu“); o tlačítkách nepiš.
memory mění preferenceMemory: když uživatel v této zprávě jasně řekne, že něco z preferenceMemory už neplatí („už mě nebolí koleno“, „běh mě zase baví“), dej přesný text té položky do memory.forget; když se jen změnila („kolo jen o víkendu“ místo „kolo jen v úterý“), dej do memory.update from s přesným textem a to s novým krátkým zněním v první osobě uživatele. Jinak nech obě pole prázdná. Aplikace změnu ukáže pod odpovědí a dá se vrátit, v answer ji jen krátce zmiň.`,
`Return answer, visuals and at most 3 actions for confirmation. visuals are 0–2 pictures the app draws under the answer from real data: form (fitness, fatigue, form), recovery (HRV and resting heart rate), sleep (the last nights), nutrition (today's food and macros against the target), week (the week's load against the target), training (today's workouts), zones (FTP and zones). Pick only those that genuinely illustrate the answer; do not repeat their numbers in the text, a comment on them is enough. Every action needs a concrete reason. When the user is only discussing or declining, you need not propose an action.
type=gym_swap replaces one not-yet-started exercise in selectedGym when it is open, otherwise in todayGym: fromExercise exactly as in the plan and toExercise from its alternatives, date is the date of that plan. It keeps the number of work sets and the target muscle group. Propose it when exercises are to be changed; do not remove the whole session instead. The app prepares the load from the replacement's history. Never invent unknown kilograms.
type=week_sport adds a sport to the schedule on a given date, even when that day already has another sport. Use it for a request to put the gym/ride/run into the week; it keeps the other sports. It creates neither a finished workout nor an Intervals.icu entry, minutes=0. A concrete workout with a duration is prepared by workout.
type=activity_kcal sets the calories of a completed activity in Aurin only (the source such as Intervals.icu or the watch stays unchanged): activityId is the exact id of the activity from completed in the context, kcal the new value in kcal, date its day. Propose it when the user wants an activity's calories corrected or the value is an obvious measurement error; do not say it cannot be done.
type=activity_delete deletes a completed activity in Aurin only (the watch, Apple/Google Health and Intervals.icu keep it): activityId from completed, date its day. Only when the user asks (e.g. they drove, the record is a mistake).
type=activity_merge joins two parts of one session the watch split: activityId and otherActivityId from completed, the same sport, the same day, at most 90 minutes between them (by start and end). Aurin gets one activity; the sources keep theirs.
type=activity_time moves the start of an activity typed into Aurin (source local) to time as HH:MM, keeping its length; a watch's time cannot change, tell the user so. These three can be undone after confirming.
type=status proposes a status change; sick/injured only when the user said so. statusUntil is the first day (YYYY-MM-DD) the status no longer applies, when the user said it or it is obvious; otherwise ''. type=move moves an existing workout to date; type=rest cancels a specific existing workout for rest; both use the real eventId from the week.planned context. type=workout prepares a preview of a sport for a given day with the given minutes. When the answer recommends a specific workout from workoutLibraryRecommendations, put its id in workoutId (otherwise '') so the preview shows exactly that workout. For a ride or run without workoutId, kind is the kind of session the answer recommends (recovery, endurance, long, tempo, sweet_spot, threshold, vo2max) and the app prepares exactly that kind; for the gym kind=''. It does not write to the calendar directly. Never add an action the data does not support. Fill unused fields with an empty string, minutes=0, kcal=0. Actions are proposals only; nothing has been done. The app shows every action under the answer as a card with a preview (for workout the session profile or the exercises with a figure), so do not list the exercises, sets or intervals of the proposed workout in answer; write only why and what to watch, at most 3 short points. The user confirms or changes the proposal with a message (e.g. "confirm", "longer", "another option"); do not mention buttons.
memory changes preferenceMemory: when the user clearly says in this message that something in preferenceMemory no longer applies ("my knee doesn't hurt any more", "I enjoy running again"), put that item's exact text in memory.forget; when it only changed ("rides only at the weekend" instead of "rides only on Tuesdays"), put its exact text in memory.update from and the new short wording, in the user's first person, in to. Otherwise leave both empty. The app shows the change under the answer and it can be undone; mention it only briefly in answer.`);
export const ACTION_INSTRUCTIONS=actionInstructions();
// Words the athlete must have used before the coach may propose Sick or Injured.
export const SICK_WORDS=/nemoc|horeč|horec|sick|chřip|chrip|nachl|rým|covid|vir[oó]z|viros|teplot/i;
export const INJURY_WORDS=/zran|bol[eíe]|bolest|injur|natáh|natah|podvrt|výron|vyron|nateklé|natekl/i;
const SHORT_DAYS=['ne','po','út','st','čt','pá','so'],SHORT_DAYS_EN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],MONTHS_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const shortDate=d=>!validDay(d)?'':L(SHORT_DAYS[new Date(d+'T12:00:00Z').getUTCDay()]+' '+Number(d.slice(8))+'. '+Number(d.slice(5,7))+'.',SHORT_DAYS_EN[new Date(d+'T12:00:00Z').getUTCDay()]+' '+Number(d.slice(8))+' '+MONTHS_EN[Number(d.slice(5,7))-1]);
const SPORT_NAMES=()=>L({ride:'kolo',run:'běh',gym:'gym'},{ride:'ride',run:'run',gym:'gym'}),STATUS_NAMES=()=>L({active:'Trénink',sick:'Nemoc',injured:'Zranění',on_break:'Pauza'},{active:'Training',sick:'Sick',injured:'Injured',on_break:'On break'});
// One line per validated proposal, stored with the answer so later turns know it.
export function actionSummary(a){
  const workout=a.eventSnapshot?.name||L('trénink','workout');
  if(a.type==='activity_delete')return L('Smazat ','Delete ')+(a.activityName||L('aktivitu','the activity'))+' ('+shortDate(a.date)+L(', jen v Aurinu)',', in Aurin only)');
  if(a.type==='activity_merge')return L('Sloučit ','Merge ')+(a.activityName||'')+' + '+(a.otherName||'')+' ('+shortDate(a.date)+')';
  if(a.type==='activity_time')return L('Posunout ','Move ')+(a.activityName||L('aktivitu','the activity'))+' ('+shortDate(a.date)+L(') na ',') to ')+a.time;
  if(a.type==='activity_kcal')return L('Kalorie ','Calories of ')+(a.activityName||L('aktivity','the activity'))+' ('+shortDate(a.date)+'): '+a.kcal+' kcal';
  if(a.type==='gym_swap')return L('Vyměnit ','Swap ')+a.fromExercise+' → '+a.toExercise+' ('+shortDate(a.date)+')';
  if(a.type==='week_sport')return L('Přidat '+SPORT_NAMES()[a.sport]+' do týdne na ','Add a '+SPORT_NAMES()[a.sport]+' to the week on ')+shortDate(a.date);
  if(a.type==='status')return L('Stav ','Status ')+STATUS_NAMES()[a.status]+(a.statusUntil?L(' (znovu Trénink od ',' (back to Training from ')+shortDate(a.statusUntil)+')':'');
  if(a.type==='move')return L('Přesunout ','Move ')+workout+L(' na ',' to ')+shortDate(a.date);
  if(a.type==='rest')return L('Odstranit ','Remove ')+workout+' ('+shortDate(a.date)+')';
  return L('Připravit '+SPORT_NAMES()[a.sport],'Prepare a '+SPORT_NAMES()[a.sport])+(a.workoutName?L(' „'+a.workoutName+'“',' “'+a.workoutName+'”'):'')+' '+a.minutes+L(' min na ',' min on ')+shortDate(a.date);
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
export const actionsNote=actions=>actions?.length?L('[Návrhy: ','[Proposals: ')+actions.map(actionSummary).join('; ')+']':'';
export function validateCoachActions(actions,context,today,{userInitiated=false}={}){
  const events=new Map((context.week||[]).flatMap(d=>(d.planned||[]).map(a=>[String(a.id),{date:d.date,...a}])));
  return (Array.isArray(actions)?actions:[]).slice(0,3).flatMap(a=>{
    const reason=String(a.reason||'').trim().slice(0,500);if(!reason)return [];
    if(a.type==='gym_swap'&&!trainingStatus(context.athleteState).paused&&validDay(a.date)&&a.date>=today&&context.gymPlan?.values?.length){
      try{const swap=prepareGymSwap(context.gymPlan,a.fromExercise,a.toExercise,reason);return swap.date===a.date?[swap]:[];}catch{return [];}
    }
    // Calories of a done activity it was shown, set in Aurin only (activity-edits.js).
    if(a.type==='activity_kcal'){
      const activity=kcalTargets(context).get(String(a.activityId||'')),kcal=Number(a.kcal);
      if(!activity||!Number.isInteger(kcal)||kcal<1||kcal>6000)return [];
      return [{type:'activity_kcal',activityId:String(activity.id),kcal,date:validDay(a.date)?a.date:'',activityName:String(activity.name||activity.type||'').slice(0,120),...(Number(activity.calories)>0?{fromKcal:Math.round(Number(activity.calories))}:{}),reason}];
    }
    // Delete, merge and time of done activities it was shown, in Aurin only (activity-chat-edits.js).
    if(['activity_delete','activity_merge','activity_time'].includes(a.type)){
      const targets=kcalTargets(context),activity=targets.get(String(a.activityId||''));
      if(!activity||/^gym:/.test(String(activity.id)))return [];
      const name=x=>[String(x.name||x.type||'').slice(0,80),x.start].filter(Boolean).join(' ');
      const base={type:a.type,activityId:String(activity.id),date:validDay(a.date)?a.date:'',activityName:name(activity),reason};
      if(a.type==='activity_delete')return [base];
      if(a.type==='activity_time'){
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(a.time||''))||activity.source!=='local'||a.time===activity.start)return [];
        return [{...base,time:a.time,...(activity.start?{fromTime:activity.start}:{})}];
      }
      const other=targets.get(String(a.otherActivityId||''));
      if(!other||other.id===activity.id||/^gym:/.test(String(other.id)))return [];
      return [{...base,otherActivityId:String(other.id),otherName:name(other)}];
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
      const kind=a.sport!=='gym'&&!library&&WORKOUT_KINDS.includes(a.kind)?{kind:a.kind}:{};
      return [{type:'workout',date:a.date,sport:a.sport,minutes:a.minutes,reason,...kind,...(library&&a.sport!=='gym'?{workoutId:String(library.id),workoutName:library.name}:{})}];
    }
    return [];
  });
}
