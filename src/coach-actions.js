import { L } from './lang.js';
import { validDay } from './training-availability.js';
import { trainingStatus } from './training-status.js';
import { prepareGymSwap,gymAdjustmentRequest } from './coach-gym-adjustment.js';
import { kcalTargets } from './activity-edits.js';
import { actionInstructions } from './private/coach-actions.js';
export { actionInstructions };

// Pictures the app can draw under an answer from the athlete's real data.
export const COACH_VISUALS=['form','recovery','sleep','nutrition','week','training','zones'];
// The kind of ride or run a proposed workout is (week-ai.js KINDS), so the
// prepared workout is the one the answer talks about.
export const WORKOUT_KINDS=['recovery','endurance','long','tempo','sweet_spot','threshold','vo2max'];
export const COACH_ACTION_FORMAT={type:'json_schema',name:'coach_reply',strict:true,schema:{type:'object',additionalProperties:false,required:['answer','visuals','actions','memory'],properties:{answer:{type:'string'},memory:{type:'object',additionalProperties:false,required:['forget','update'],properties:{forget:{type:'array',items:{type:'string'}},update:{type:'array',items:{type:'object',additionalProperties:false,required:['from','to'],properties:{from:{type:'string'},to:{type:'string'}}}}}},visuals:{type:'array',items:{type:'string',enum:COACH_VISUALS}},actions:{type:'array',items:{type:'object',additionalProperties:false,required:['type','eventId','date','sport','minutes','status','statusUntil','reason','fromExercise','toExercise','workoutId','kind','activityId','otherActivityId','time','kcal'],properties:{type:{type:'string',enum:['status','move','rest','workout','gym_swap','week_sport','activity_kcal','activity_delete','activity_merge','activity_time']},eventId:{type:'string'},date:{type:'string'},sport:{type:'string',enum:['ride','run','gym','']},minutes:{type:'integer'},status:{type:'string',enum:['active','sick','injured','on_break','']},statusUntil:{type:'string'},reason:{type:'string'},fromExercise:{type:'string'},toExercise:{type:'string'},workoutId:{type:'string'},kind:{type:'string',enum:['',...WORKOUT_KINDS]},activityId:{type:'string'},otherActivityId:{type:'string'},time:{type:'string'},kcal:{type:'integer'}}}}}}};
export const ACTION_INSTRUCTIONS=actionInstructions();
// Words the athlete must have used before the coach may propose Sick or Injured.
export const SICK_WORDS=/nemoc|horeč|horec|sick|chřip|chrip|nachl|rým|covid|vir[oó]z|viros|teplot|\bill\b|illness|unwell|fever|\bflu\b|\bcold\b|virus|sore throat|temperature/i;
export const INJURY_WORDS=/zran|bol[eíe]|bolest|injur|natáh|natah|podvrt|výron|vyron|nateklé|natekl|\bpain|\bhurt|sprain|swollen|pulled/i;
const SHORT_DAYS=['ne','po','út','st','čt','pá','so'],SHORT_DAYS_EN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],MONTHS_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const shortDate=d=>!validDay(d)?'':L(SHORT_DAYS[new Date(d+'T12:00:00Z').getUTCDay()]+' '+Number(d.slice(8))+'. '+Number(d.slice(5,7))+'.',SHORT_DAYS_EN[new Date(d+'T12:00:00Z').getUTCDay()]+' '+Number(d.slice(8))+' '+MONTHS_EN[Number(d.slice(5,7))-1]);
const SPORT_NAMES=()=>L({ride:'kolo',run:'běh',gym:'gym'},{ride:'ride',run:'run',gym:'gym'}),STATUS_NAMES=()=>L({active:'Aktivní',sick:'Nemoc',injured:'Zranění',on_break:'Pauza'},{active:'Active',sick:'Sick',injured:'Injured',on_break:'Rest'});
// One line per validated proposal, stored with the answer so later turns know it.
export function actionSummary(a){
  const workout=a.eventSnapshot?.name||L('trénink','workout');
  if(a.type==='activity_delete')return L('Smazat ','Delete ')+(a.activityName||L('aktivitu','the activity'))+' ('+shortDate(a.date)+L(', jen v Aurinu)',', in Aurin only)');
  if(a.type==='activity_merge')return L('Sloučit ','Merge ')+(a.activityName||'')+' + '+(a.otherName||'')+' ('+shortDate(a.date)+')';
  if(a.type==='activity_time')return L('Posunout ','Move ')+(a.activityName||L('aktivitu','the activity'))+' ('+shortDate(a.date)+L(') na ',') to ')+a.time;
  if(a.type==='activity_kcal')return L('Kalorie ','Calories of ')+(a.activityName||L('aktivity','the activity'))+' ('+shortDate(a.date)+'): '+a.kcal+' kcal';
  if(a.type==='gym_swap')return L('Vyměnit ','Swap ')+a.fromExercise+' → '+a.toExercise+' ('+shortDate(a.date)+')';
  if(a.type==='week_sport')return L('Přidat '+SPORT_NAMES()[a.sport]+' do týdne na ','Add a '+SPORT_NAMES()[a.sport]+' to the week on ')+shortDate(a.date);
  if(a.type==='status')return L('Stav ','Status ')+STATUS_NAMES()[a.status]+(a.statusUntil?L(' (znovu Aktivní od ',' (back to Active from ')+shortDate(a.statusUntil)+')':'');
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
// Hard work the app never prepares for today on a red readiness day or with
// signs of illness (safetyNote): the answer may say so, the card cannot.
const INTENSE=['vo2max','threshold','tempo','sweet_spot','anaerobic','sprint'];
const ILLNESS_FLAG=/^(?:respiration|skin_temp|wrist_temp)_elevated$|^checkin_sick$/;
export function holdBackToday(context){
  const r=context?.cyclingCoachV2?.readiness;
  return r?.status==='red'||r?.todayZone==='red'||(r?.flags||[]).some(f=>ILLNESS_FLAG.test(f));
}
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
      const requestedRest=/(?:odpoč|pauz|zruš|zrus|volno|vynech|nemoc|horeč|horec|bolest|bolí|zran|\brest\b|\bbreak\b|cancel|skip|day off|\bsick|\bill\b|fever|\bpain|\bhurt|injur)/i.test(signals);
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
      if(a.sport!=='gym'&&a.date===today&&INTENSE.includes(library?library.system:a.kind)&&holdBackToday(context))return [];
      return [{type:'workout',date:a.date,sport:a.sport,minutes:a.minutes,reason,...kind,...(library&&a.sport!=='gym'?{workoutId:String(library.id),workoutName:library.name}:{})}];
    }
    return [];
  });
}
