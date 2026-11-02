import { L } from './lang.js';
import { validDay } from './training-availability.js';
import { trainingStatus } from './training-status.js';
import { prepareGymSwap,gymAdjustmentRequest } from './coach-gym-adjustment.js';
import { kcalTargets } from './activity-edits.js';
import { isHardSession, isHardKind } from './session-intensity.js';
import { trimGymPlan } from './gym-trim.js';
import { parseStrengthPlan } from './strength-history.js';
import { planTemplates, getTemplate, planStart } from './training-plans.js';
import { actionInstructions } from './private/coach-actions.js';
export { actionInstructions };

// Pictures the app can draw under an answer from the athlete's real data.
export const COACH_VISUALS=['form','recovery','sleep','nutrition','week','training','zones'];
// The kind of ride or run a proposed workout is (week-ai.js KINDS), so the
// prepared workout is the one the answer talks about.
export const WORKOUT_KINDS=['recovery','endurance','long','tempo','sweet_spot','threshold','vo2max'];
// The muscle groups a gym card can be built around (strength-generator.js
// FOCUS_GROUPS, the same ids; a test keeps them equal).
export const GYM_MUSCLES=['chest','upper_back','lats','front_delts','side_delts','rear_delts','biceps','triceps','abs','obliques','quads','hamstrings','hips','calves','forearms','traps','lower_back'];
export const COACH_ACTION_FORMAT={type:'json_schema',name:'coach_reply',strict:true,schema:{type:'object',additionalProperties:false,required:['answer','visuals','actions','memory'],properties:{answer:{type:'string'},memory:{type:'object',additionalProperties:false,required:['forget','update'],properties:{forget:{type:'array',items:{type:'string'}},update:{type:'array',items:{type:'object',additionalProperties:false,required:['from','to'],properties:{from:{type:'string'},to:{type:'string'}}}}}},visuals:{type:'array',items:{type:'string',enum:COACH_VISUALS}},actions:{type:'array',items:{type:'object',additionalProperties:false,required:['type','eventId','date','sport','minutes','status','statusUntil','reason','fromExercise','toExercise','workoutId','kind','activityId','otherActivityId','time','kcal','gymFocus','gymMuscles','insisted','planId','days','raceKm'],properties:{type:{type:'string',enum:['status','move','rest','workout','gym_swap','week_sport','activity_kcal','activity_delete','activity_merge','activity_time','plan']},eventId:{type:'string'},date:{type:'string'},sport:{type:'string',enum:['ride','run','gym','swim','']},minutes:{type:'integer'},status:{type:'string',enum:['active','sick','injured','on_break','']},statusUntil:{type:'string'},reason:{type:'string'},fromExercise:{type:'string'},toExercise:{type:'string'},workoutId:{type:'string'},kind:{type:'string',enum:['',...WORKOUT_KINDS]},gymFocus:{type:'string',enum:['','upper','lower']},gymMuscles:{type:'array',items:{type:'string',enum:GYM_MUSCLES}},insisted:{type:'boolean'},activityId:{type:'string'},otherActivityId:{type:'string'},time:{type:'string'},kcal:{type:'integer'},planId:{type:'string'},days:{type:'array',items:{type:'integer'}},raceKm:{type:'number'}}}}}}};
export const ACTION_INSTRUCTIONS=actionInstructions();
// Words the athlete must have used before the coach may propose Sick or Injured.
export const SICK_WORDS=/nemoc|horeč|horec|sick|chřip|chrip|nachl|rým|covid|vir[oó]z|viros|teplot|\bill\b|illness|unwell|fever|\bflu\b|\bcold\b|virus|sore throat|temperature/i;
export const INJURY_WORDS=/zran|bol[eíe]|bolest|injur|natáh|natah|podvrt|výron|vyron|nateklé|natekl|\bpain|\bhurt|sprain|swollen|pulled/i;
// The multi-week plans the coach can start (training-plans.js), as the coach sees them.
export const coachPlanTemplates=()=>planTemplates().map(t=>({id:t.id,sport:t.sport,name:t.name,goal:t.goal,weeks:t.weeks.length,daysPerWeek:t.days,level:t.level,...(t.race?{raceKm:t.race.km,...(t.race.options?{raceKmOptions:t.race.options}:{})}:{})}));
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
  if(a.type==='plan')return L('Založit plán ','Start the plan ')+(a.planName||'')+(a.raceDate?L(' (závod ',' (race on ')+shortDate(a.raceDate)+')':a.startDate?L(' (od ',' (from ')+shortDate(a.firstDay||a.startDate)+')':'');
  if(a.type==='gym_swap')return L('Vyměnit ','Swap ')+a.fromExercise+' → '+a.toExercise+' ('+shortDate(a.date)+')';
  if(a.type==='week_sport')return L('Přidat '+SPORT_NAMES()[a.sport]+' do týdenního plánu na ','Add a '+SPORT_NAMES()[a.sport]+' to the week plan on ')+shortDate(a.date);
  if(a.type==='status')return L('Stav ','Status ')+STATUS_NAMES()[a.status]+(a.statusUntil?L(' (znovu Aktivní od ',' (back to Active from ')+shortDate(a.statusUntil)+')':'');
  if(a.type==='move')return L('Přesunout ','Move ')+workout+L(' na ',' to ')+shortDate(a.date);
  if(a.type==='rest')return L('Odstranit ','Remove ')+workout+' ('+shortDate(a.date)+')';
  if(a.trim)return a.workoutName+' ('+shortDate(a.date)+')';
  const half=a.gymFocus?L({upper:' (horní polovina)',lower:' (nohy)'},{upper:' (upper body)',lower:' (legs)'})[a.gymFocus]:'';
  return L('Připravit '+SPORT_NAMES()[a.sport]+half,'Prepare a '+SPORT_NAMES()[a.sport]+half)+(a.workoutName?L(' „'+a.workoutName+'“',' “'+a.workoutName+'”'):'')+' '+a.minutes+L(' min na ',' min on ')+shortDate(a.date);
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
const ILLNESS_FLAG=/^(?:respiration|skin_temp|wrist_temp)_elevated$|^checkin_sick$/;
export function holdBackToday(context){
  const r=context?.cyclingCoachV2?.readiness;
  return r?.status==='red'||r?.todayZone==='red'||(r?.flags||[]).some(f=>ILLNESS_FLAG.test(f));
}
// The hard days around a proposed one: done and planned sessions of the week
// (session-intensity.js, tempo included), plus the hard workouts proposed
// earlier in the same answer. A hard workout needs 48 h from each and at most
// two hard days in any 7 (Revize 2026-10-16, nález 3).
// The sport of a planned session (Intervals.icu type), as a card's sport field.
export function eventSport(e){const t=String(e?.type||'');return /run/i.test(t)?'run':/weight|strength|gym/i.test(t)?'gym':/ride|cycl|bike/i.test(t)?'ride':'';}
const dayDiff=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
export function hardDayConflict(date,hardDates){
  if(hardDates.some(d=>Math.abs(dayDiff(d,date))<2))return true;
  for(let start=-6;start<=0;start++){const from=dayDiff(date,'1970-01-01')+start;if(hardDates.filter(d=>{const x=dayDiff(d,'1970-01-01');return x>=from&&x<=from+6;}).length>=2)return true;}
  return false;
}
// The half of the body a gym proposal is for: the coach's field, else the
// athlete's words ("jen na nohy", "bez nohou", "nohy bolí"); Revize 2026-10-16, nález 23.
const GYM_UPPER=/bez\s+noh|horn[íi]\s+(?:polovin|část|cast)|vr[šs]ek|upper\s*body|no\s+legs|nohy\s+(?:bol|nemůž|nemuz)|bol[íi]\s+(?:mě\s+|me\s+)?nohy/i,GYM_LOWER=/(?:jen|pouze|jenom)\s+(?:na\s+)?nohy|na\s+nohy|doln[íi]\s+(?:polovin|část|cast)|leg\s*day|legs\s+only|only\s+legs|lower\s*body/i;
export function gymFocusOf(a,message){
  if(['upper','lower'].includes(a?.gymFocus))return a.gymFocus;
  const m=String(message||'');return GYM_UPPER.test(m)?'upper':GYM_LOWER.test(m)?'lower':null;
}
// The muscle groups the athlete asked for by name ("cviky na prsa", "chest
// day", "procvičit záda a biceps"): a wish, not a complaint, so "bolí mě záda"
// names none. A card the answer calls chest-focused was built as a lower-body
// day without them (Petr 2026-11-01).
const MUSCLE_WORDS=[
  [/prs(?:a|ou|ní|ni|ách|ach|um)?(?!\p{L})|hrudn\p{L}*|hrudi|chest|pecs?(?!\p{L})|pectorals?/iu,['chest']],
  [/(?:horní\s+|horni\s+)?z[áa]d(?:a|ech|ou)?(?!\p{L})|(?:upper\s+)?back(?!\p{L})|lats?(?!\p{L})/iu,['upper_back','lats']],
  [/ramen(?:a|ou)?(?!\p{L})|ramínk\p{L}*|shoulders?|delts?(?!\p{L})/iu,['front_delts','side_delts','rear_delts']],
  [/bicepsy?|biceps(?:es)?|bicák\p{L}*|bicak\p{L}*/iu,['biceps']],
  [/tricepsy?|triceps(?:es)?|tricák\p{L}*|tricak\p{L}*/iu,['triceps']],
  [/ruce(?!\p{L})|ruk(?:y|ou)?(?!\p{L})|paže|paze|arms?(?!\p{L})/iu,['biceps','triceps']],
  [/břich\p{L}*|brich\p{L}*|břišní|brisni|abs(?!\p{L})|core(?!\p{L})|střed\s+těla|stred\s+tela/iu,['abs','obliques']],
  [/hýžd\p{L}*|hyzd\p{L}*|zadek|zadeček|glutes?(?!\p{L})/iu,['hips']],
  [/lýtk\p{L}*|lytk\p{L}*|calf|calves/iu,['calves']],
  [/zadní\s+stehn\p{L}*|zadni\s+stehn\p{L}*|hamstrings?/iu,['hamstrings']],
  [/přední\s+stehn\p{L}*|predni\s+stehn\p{L}*|quads?(?!\p{L})|quadriceps/iu,['quads']]
];
const MUSCLE_ANY=new RegExp(MUSCLE_WORDS.map(([re])=>'(?:'+re.source+')').join('|'),'iu');
// "na prsa a triceps", "for chest and arms", "procvičit záda", "chest day", "cviky na prsa".
const MUSCLE_LIST='(?:'+MUSCLE_ANY.source+')(?:\\s*(?:,|a|and|i|\\+|&)\\s*(?:'+MUSCLE_ANY.source+'))*';
const MUSCLE_WISH=new RegExp('(?:(?<!\\p{L})(?:na|for|on|train|training|work|hit|target)|procvi\\p{L}*|posíl\\p{L}*|posil\\p{L}*|zaměř\\p{L}*\\s+na|zamer\\p{L}*\\s+na)\\s+(?:(?:the|my|moje|mé|me|si)\\s+)?'+MUSCLE_LIST+'|'+MUSCLE_LIST+'\\s+(?:day|exercises?|workout|session|cviky|cvičení|cviceni|trénink|trenink)','giu');
export function requestedMuscles(message){
  const out=[];
  for(const m of String(message||'').matchAll(MUSCLE_WISH))for(const [re,groups] of MUSCLE_WORDS)if(new RegExp(re.source,'giu').test(m[0]))for(const g of groups)if(!out.includes(g))out.push(g);
  return out;
}
// What a single group needs beside it to fill a real session: 75 minutes of
// chest alone would be seven presses and flyes.
const COMPANIONS={chest:['triceps','abs'],upper_back:['lats','biceps'],lats:['upper_back','biceps'],front_delts:['side_delts','triceps'],side_delts:['rear_delts','triceps'],rear_delts:['upper_back','side_delts'],biceps:['triceps','forearms'],triceps:['biceps','chest'],abs:['obliques','lower_back'],obliques:['abs','lower_back'],quads:['hamstrings','hips'],hamstrings:['quads','hips'],hips:['quads','hamstrings'],calves:['quads','hamstrings'],forearms:['biceps','triceps'],traps:['upper_back','rear_delts'],lower_back:['hips','abs']};
const LEG_GROUPS=['quads','hamstrings','hips','calves'];
// The muscle groups a gym card is built around: the ones the athlete named
// always, then the coach's, at most five; a lone group gets its companions
// for a session of 45 minutes or more.
export function gymMusclesOf(a,message){
  const asked=requestedMuscles(message),coach=(Array.isArray(a?.gymMuscles)?a.gymMuscles:[]).filter(g=>GYM_MUSCLES.includes(g));
  let out=[...new Set([...asked,...coach])].slice(0,5);
  if(out.length===1&&Number(a?.minutes)>=45)out=[...out,...COMPANIONS[out[0]]];
  return out;
}
export function validateCoachActions(actions,context,today,{userInitiated=false}={}){
  const events=new Map((context.week||[]).flatMap(d=>(d.planned||[]).map(a=>[String(a.id),{date:d.date,...a}])));
  // A planned session on the proposed day itself is the one it replaces (a
  // workout on a planned day passes only when the athlete asked for it).
  let hard=(context.week||[]).flatMap(d=>[...(d.planned||[]).filter(isHardSession).map(a=>({date:d.date,planned:true,id:String(a.id)})),...(d.completed||[]).filter(isHardSession).map(()=>({date:d.date}))]).filter(h=>validDay(h.date));
  // A rest or move in the same answer takes its planned session away first, so
  // "rest today, VO2max on Tuesday" counts without today's VO2max (Revize
  // doporučování tréninků 2026-10-16, S15); the cards keep their order.
  // Five cards: a tired weekend needs today's ride, Saturday's tempo and both gym days, a gym block three days (Coach evaluation runs 25–30, S27 and S28).
  const list=(Array.isArray(actions)?actions:[]).slice(0,5),first=a=>['move','rest'].includes(a?.type)?0:1;
  const out=new Array(list.length);
  const taken=()=>out.flat().filter(Boolean);
  for(const i of [...list.keys()].sort((i,j)=>first(list[i])-first(list[j])||i-j))out[i]=check(list[i]);
  const kept=out.flat();
  // A new ride or run on a day the plan has one of the same sport replaces it:
  // without the coach's rest or move the calendar would hold two (Coach
  // evaluation run 18, S26), so its rest comes with the card.
  for(const w of kept.filter(a=>a.type==='workout'&&a.sport!=='gym'&&!a.trim)){
    for(const [id,e] of events){
      if(e.date!==w.date||eventSport(e)!==w.sport||kept.some(a=>['rest','move'].includes(a.type)&&a.eventId===id))continue;
      kept.push({type:'rest',eventId:id,date:e.date,sport:w.sport,reason:L('Nahradí ho navržený trénink.','Replaced by the proposed workout.'),replacedBy:w.date,eventSnapshot:{name:e.name,date:e.date,durationHours:e.durationHours}});
    }
  }
  return kept;
  function check(a){
    const reason=String(a.reason||'').trim().slice(0,500);if(!reason)return [];
    if(a.type==='gym_swap'&&!trainingStatus(context.athleteState).paused&&validDay(a.date)&&a.date>=today&&context.gymPlan?.values?.length){
      try{const swap=prepareGymSwap(context.gymPlan,a.fromExercise,a.toExercise,reason,context.preferenceMemory);return swap.date===a.date?[swap]:[];}catch{return [];}
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
    // A multi-week plan the athlete asked for in the chat: a known template, a
    // race date (race plans) or a start the plan rules accept, the days of the
    // week within the plan's range (else the week plan's days), one per answer.
    if(a.type==='plan'){
      const template=getTemplate(String(a.planId||''));
      if(!userInitiated||!template||trainingStatus(context.athleteState).paused||taken().some(x=>x.type==='plan'))return [];
      let when;try{when=planStart(template,{today,raceDate:template.race&&validDay(a.date)?a.date:null,startDate:!template.race&&validDay(a.date)&&a.date>today?a.date:null});}catch{return [];}
      const days=[...new Set((Array.isArray(a.days)?a.days:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))].sort();
      const chosen=template.sport!=='gym'&&days.length>=template.days[0]&&days.length<=template.days[1]?days:null;
      const raceKm=template.race?.options?.includes(Number(a.raceKm))?Number(a.raceKm):template.race?.km??null;
      return [{type:'plan',planId:template.id,sport:template.sport,planName:template.name,weeksCount:template.weeks.length,date:when.raceDate&&template.race?when.raceDate:when.firstDay||when.startDate,startDate:when.startDate,...(when.firstDay?{firstDay:when.firstDay}:{}),...(template.race?{raceDate:when.raceDate,raceKm}:{}),...(!template.race&&validDay(a.date)&&a.date>today?{requestedStart:a.date}:{}),...(chosen?{days:chosen}:{}),reason}];
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
      hard=hard.flatMap(h=>h.id!==String(a.eventId)?[h]:a.type==='move'?[{...h,date:a.date}]:[]);
      return [{type:a.type,eventId:String(a.eventId),date:a.type==='move'?a.date:event.date,sport:eventSport(event),reason,eventSnapshot:{name:event.name,date:event.date,durationHours:event.durationHours}}];
    }
    // A swim card (sport swim) is dropped here: the app has no swim card yet, and
    // without the sport in the schema the coach put a swim on a gym card (coach evaluation run 38, S32).
    if(a.type==='workout'&&!trainingStatus(context.athleteState).paused&&validDay(a.date)&&a.date>=today&&['ride','run','gym'].includes(a.sport)&&Number.isInteger(a.minutes)&&a.minutes>=(a.sport==='run'?20:30)&&a.minutes<=360){
      if(!userInitiated&&context.remainingPlanned?.some(x=>x.date===a.date))return [];
      const budget=context.availabilityByDate?.[a.date]?.minutes;if(!userInitiated&&budget!=null&&a.minutes>budget)return [];
      // Only a workout the coach was actually offered; the preview then shows exactly it.
      const library=a.workoutId?(context.workoutLibraryRecommendations||[]).find(w=>String(w.id)===String(a.workoutId)&&(!w.sport||w.sport===a.sport)):null;
      const kind=a.sport!=='gym'&&!library&&WORKOUT_KINDS.includes(a.kind)?{kind:a.kind}:{};
      const intense=a.sport!=='gym'&&isHardKind(library?library.system:a.kind);
      if(intense&&a.date===today&&holdBackToday(context))return [];
      // The athlete asked for it again in this chat after the coach's concern:
      // their call passes the 48 h and two-in-7 rules (Petr 2026-10-19).
      const insisted=a.insisted===true&&a.sport!=='gym'&&(context.conversation||[]).some(t=>t.role==='user');
      if(intense&&insisted)hard.push({date:a.date});
      else if(intense){if(hardDayConflict(a.date,hard.filter(h=>!(h.planned&&h.date===a.date)).map(h=>h.date)))return [];hard.push({date:a.date});}
      if(a.sport==='gym'){
        // No gym today on a red morning or with signs of illness, not even shortened (S20).
        if(a.date===today&&holdBackToday(context))return [];
        // A day that already has a gym plan gets that plan shortened, never a
        // second one (it could not be saved next to it).
        let planDate=null;try{planDate=context.gymPlan?.values?.length?parseStrengthPlan(context.gymPlan.values).date:null;}catch{}
        if(planDate&&planDate===a.date){
          const trimmed=trimGymPlan(context.gymPlan.values,a.minutes);if(!trimmed)return [];
          return [{type:'workout',date:a.date,sport:'gym',minutes:a.minutes,reason,workoutName:trimmed.name,trim:{values:trimmed.values,source:context.gymPlan.values,removed:trimmed.removed}}];
        }
        // Named muscle groups set the half of the body too, so the card, its
        // name and the next days' rule (never the same half twice) agree.
        const muscles=gymMusclesOf(a,context.userMessage),legs=muscles.filter(g=>LEG_GROUPS.includes(g)).length;
        const focus=muscles.length?(legs===muscles.length?'lower':legs?null:'upper'):gymFocusOf(a,context.userMessage);
        return [{type:'workout',date:a.date,sport:'gym',minutes:a.minutes,reason,...(focus?{gymFocus:focus}:{}),...(muscles.length?{gymMuscles:muscles}:{})}];
      }
      return [{type:'workout',date:a.date,sport:a.sport,minutes:a.minutes,reason,...kind,...(insisted?{insisted:true}:{}),...(library&&a.sport!=='gym'?{workoutId:String(library.id),workoutName:library.name}:{})}];
    }
    return [];
  }
}
