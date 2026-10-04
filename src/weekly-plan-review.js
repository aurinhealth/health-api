import { coachContext } from './coach-assistant.js';
import { trainingStatus } from './training-status.js';

const shift=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const hard=a=>/threshold|vo2|interval|sweet spot|tempo/i.test(a.name||'')||Number(a.tss)>=90&&Number(a.durationHours)<=1.5;

export function weekReviewContext({inputs,prefs,state,start,today,proposal,weather,history,athleteFeedback=[],coachNotes=[]}){
  const context=coachContext({...inputs,date:today,preferences:prefs,athleteState:state,athleteFeedback,coachNotes});
  const end=[shift(start,6),shift(today,7)].sort().at(-1);
  const remaining=(context.week||[]).filter(d=>d.date>=today&&d.date<=end).flatMap(d=>{
    const source=inputs.week.days.find(x=>x.date===d.date)?.daily?.training||{},matched=new Set((source.matched||[]).map(m=>String(m.planned?.id)));
    return (d.planned||[]).filter(a=>!matched.has(String(a.id))&&!/nutrition/i.test(a.name+' '+a.type)&&!(d.completed||[]).some(c=>String(c.name).trim().toLowerCase()===String(a.name).trim().toLowerCase())).map(a=>({...a,date:d.date}));
  });
  Object.assign(context,{availability:prefs.availability,weeklyActivities:prefs.weeklyActivities,athleteState:state.status,statusNote:state.note,preferenceMemory:state.memories||[],weather,proposal,history,reviewScope:{start:today,end,selectedWeek:start},remainingPlanned:remaining});
  context.week=context.week.map(d=>({...d,planned:remaining.filter(a=>a.date===d.date)}));
  return context;
}

export function fallbackWeekReview(context){
  const policy=trainingStatus({status:context.athleteState,note:context.statusNote}),remaining=context.remainingPlanned||[],actions=[];
  if(policy.paused){
    for(const a of remaining.slice(0,3))actions.push({type:'rest',eventId:String(a.id),reason:'Stav '+policy.label+' má přednost před plánem. Navrhuji tento trénink vynechat.'});
    return {answer:policy.headline+'. '+(policy.note?policy.note+' ':'')+(remaining.length?'Navrhuji vynechat nejbližší tréninky. Každou změnu můžeš potvrdit zvlášť.':'Budoucí tréninky v kontrolovaném období nejsou naplánované.'),actions,source:'rules'};
  }
  const badFeedback=(context.athleteFeedback||[]).find(f=>f.date>=shift(context.date,-3)&&f.date<=context.date&&(Number(f.rpe)>=7&&/bolest|těžk|tez|únav|unav|vyčerp/i.test(f.notes||'')||Number(f.rpe)>=9));
  const low=context.cyclingCoachV2?.readiness?.status==='red';
  if((badFeedback||low)&&remaining[0]?.date<=shift(context.date,1))actions.push({type:'rest',eventId:String(remaining[0].id),reason:badFeedback?'Po posledním tréninku hlásíš RPE '+badFeedback.rpe+' a výraznou únavu. Dej prostor odpočinku.':'Aktuální ukazatele regenerace jsou slabé. Nejbližší trénink navrhuji vynechat.'});
  for(let i=1;i<remaining.length&&actions.length<3;i++){
    const a=remaining[i],previous=remaining[i-1],target=shift(a.date,1);
    if(hard(a)&&hard(previous)&&a.date<=shift(previous.date,1)&&!remaining.some(x=>x.date===target)&&target<=context.reviewScope.end){
      const weekday=(new Date(target+'T12:00:00Z').getUTCDay()+6)%7,budget=(context.availabilityByDate?.[target]||context.availability?.[weekday])?.minutes;
      if(budget!=null&&budget<Number(a.durationHours)*60)continue;
      actions.push({type:'move',eventId:String(a.id),date:target,reason:'Dvě náročné jednotky jsou těsně po sobě. Přesun vloží den pro regeneraci.'});
    }
  }
  const count=remaining.length,reviewed=count===1?'1 budoucí trénink':count<5?count+' budoucí tréninky':count+' budoucích tréninků';
  return {answer:count?'Zkontroloval jsem '+reviewed+'. '+(actions.length?'Navrhuji tyto změny kvůli regeneraci a návaznosti jednotek.':'V dostupných datech nevidím jasný důvod pro změnu. Detailní AI revize nyní není dostupná.'):'V kontrolovaném období není naplánovaný žádný budoucí trénink. Nové aktivity navrhnu podle časových možností.',actions,source:'rules'};
}

export const WEEK_REVIEW_REQUEST='Zkontroluj VŠECHNY remainingPlanned v reviewScope, nejen dokončený týden nebo prázdné dny. Nejprve stručně řekni, zda budoucí plán sedí vzhledem k posledním tréninkům, RPE a poznámkám, aktuální regeneraci, stavu, dostupnému času a počasí. Pak dej nejvýše 3 konkrétní actions k potvrzení (vynechat nebo přesunout existující trénink; workout znamená jen náhled nové jednotky a nesmí vytvářet duplicitní plán). Pokud nic není potřeba změnit, řekni to a vrať prázdné actions. U prázdného týdne vysvětli návrh z proposal. Answer nejvýše 90 slov, 2–3 krátké odstavce nebo body. Reason každé změny jedna krátká věta. Nic sám neukládej.';
