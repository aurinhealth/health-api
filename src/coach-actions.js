import { validDay } from './training-availability.js';
import { trainingStatus } from './training-status.js';
import { prepareGymSwap,gymAdjustmentRequest } from './coach-gym-adjustment.js';

export const COACH_ACTION_FORMAT={type:'json_schema',name:'coach_reply',strict:true,schema:{type:'object',additionalProperties:false,required:['answer','actions'],properties:{answer:{type:'string'},actions:{type:'array',items:{type:'object',additionalProperties:false,required:['type','eventId','date','sport','minutes','status','reason','fromExercise','toExercise'],properties:{type:{type:'string',enum:['status','move','rest','workout','gym_swap']},eventId:{type:'string'},date:{type:'string'},sport:{type:'string',enum:['ride','run','gym','']},minutes:{type:'integer'},status:{type:'string',enum:['active','sick','injured','on_break','']},reason:{type:'string'},fromExercise:{type:'string'},toExercise:{type:'string'}}}}}}};
export const ACTION_INSTRUCTIONS=`Vrať answer a nejvýše 3 actions k potvrzení. Každá action musí mít konkrétní důvod. Pokud uživatel jen diskutuje nebo odmítá, nemusíš navrhnout akci.
type=gym_swap nahrazuje jeden nezačatý cvik v todayGym: fromExercise přesně z plánu a toExercise z jeho alternatives, date=todayGym.date. Zachová počet pracovních sérií a cílovou partii. Navrhuj ji při žádosti o změnu cviků; neodstraňuj místo toho celý trénink. Zátěž připraví aplikace z historie náhradního cviku. Neznámé kilogramy nevymýšlej.
type=status navrhuje změnu stavu; nemoc/zranění jen pokud ji uvedl uživatel. type=move přesouvá existující trénink na date; type=rest ruší konkrétní existující trénink pro odpočinek; obě používají skutečné eventId z kontextu week.planned. type=workout připraví náhled sportu pro konkrétní den s danými minutes. Nezapisuje přímo do kalendáře. Nepřidávej akci, kterou data nepodporují. Nepotřebná pole vyplň prázdným řetězcem, minutes=0. Akce jsou pouze návrhy, nic nebylo provedeno.`;
export function validateCoachActions(actions,context,today){
  const events=new Map((context.week||[]).flatMap(d=>(d.planned||[]).map(a=>[String(a.id),{date:d.date,...a}])));
  return (Array.isArray(actions)?actions:[]).slice(0,3).flatMap(a=>{
    const reason=String(a.reason||'').trim().slice(0,500);if(!reason)return [];
    if(a.type==='gym_swap'&&!trainingStatus(context.athleteState).paused&&a.date===today&&context.gymPlan?.values?.length){
      try{const swap=prepareGymSwap(context.gymPlan,a.fromExercise,a.toExercise,reason);return swap.date===today?[swap]:[];}catch{return [];}
    }
    if(a.type==='status'&&['active','sick','injured','on_break'].includes(a.status)){
      const words=[context.userMessage,...(context.conversation||[]).filter(t=>t.role==='user').map(t=>t.content)].join(' ');
      if(a.status==='sick'&&!/nemoc|horeč|horec|sick/i.test(words))return [];
      if(a.status==='injured'&&!/zran|bol[eí]|bolest|injur/i.test(words))return [];
      return [{type:'status',status:a.status,reason}];
    }
    if(['move','rest'].includes(a.type)){
      const since=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
      const signals=[context.userMessage,...(context.athleteFeedback||[]).filter(f=>f.date&&f.date>=since&&f.date<=today).map(f=>f.notes)].join(' ');
      const requestedRest=/(?:odpoč|pauz|zruš|zrus|volno|vynech|nemoc|horeč|horec|bolest|bolí|zran)/i.test(signals);
      if(a.type==='rest'&&gymAdjustmentRequest(context.userMessage||'')&&!requestedRest&&!trainingStatus(context.athleteState).paused&&context.cyclingCoachV2?.readiness?.status!=='red')return [];
      const event=events.get(String(a.eventId));
      if(!event||event.date<today||!String(a.eventId).startsWith('planned:'))return [];
      if(a.type==='move'&&(!validDay(a.date)||a.date<today))return [];
      const budget=context.availabilityByDate?.[a.date]?.minutes;
      if(a.type==='move'&&budget!=null&&Number(event.durationHours)*60>budget)return [];
      return [{type:a.type,eventId:String(a.eventId),date:a.type==='move'?a.date:event.date,reason,eventSnapshot:{name:event.name,date:event.date,durationHours:event.durationHours}}];
    }
    if(a.type==='workout'&&!trainingStatus(context.athleteState).paused&&validDay(a.date)&&a.date>=today&&['ride','run','gym'].includes(a.sport)&&Number.isInteger(a.minutes)&&a.minutes>=(a.sport==='run'?20:30)&&a.minutes<=360){
      if(context.remainingPlanned?.some(x=>x.date===a.date))return [];
      const budget=context.availabilityByDate?.[a.date]?.minutes;if(budget!=null&&a.minutes>budget)return [];
      return [{type:'workout',date:a.date,sport:a.sport,minutes:a.minutes,reason}];
    }
    return [];
  });
}
