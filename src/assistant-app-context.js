import { validDay, weekStartOf } from './training-availability.js';
import { todayGymContext } from './coach-gym-adjustment.js';
import { compactActivity } from './coach-assistant.js';

const SUBJECT_KINDS=['activity','planned','exercise','metric','workout'];
const LIVE_PHASES=['set','rest','restBeforeExercise'];
const text=(v,max)=>typeof v==='string'&&v.trim()?v.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):null;

// What the athlete asks about from a detail screen ("Zeptat se kouče"): a done
// activity, a planned session, a gym exercise or a health metric, by its id
// and the title the screen shows. Its numbers come from storage, never from here.
function screenSubject(raw){
  if(!raw||typeof raw!=='object'||!SUBJECT_KINDS.includes(raw.kind))return null;
  const id=typeof raw.id==='string'&&/^[\w:.-]{1,80}$/.test(raw.id)?raw.id:null;
  const metric=typeof raw.metric==='string'&&/^[a-z0-9_]{1,30}$/i.test(raw.metric)?raw.metric:null;
  return {kind:raw.kind,id,title:text(raw.title,120),metric};
}

// Režim tréninku: where in the gym workout under way the athlete is (doing a
// set, resting between sets, resting before the next exercise). The sets done
// come from the saved day (selectedGym), never from here.
function liveWorkout(raw){
  if(!raw||typeof raw!=='object'||!LIVE_PHASES.includes(raw.phase))return null;
  const whole=(v,max)=>Number.isInteger(v)&&v>0&&v<=max?v:null;
  const live={phase:raw.phase,exercise:text(raw.exercise,120),set:whole(raw.set,100),restSeconds:whole(raw.restSeconds,3600),previousExercise:text(raw.previousExercise,120)};
  return Object.fromEntries(Object.entries(live).filter(([,v])=>v!=null));
}

// The browser identifies the screen. Training results always come from storage.
export function assistantAppContext(input, today) {
  const raw=input&&typeof input==='object'?input:{};
  const view=['today','workouts','training','health','nutrition','settings'].includes(raw.view)?raw.view:'today';
  const date=validDay(raw.date)?raw.date:today;
  const subject=screenSubject(raw.subject);
  const live=liveWorkout(raw.live);
  return {view,date,weekStart:weekStartOf(validDay(raw.weekStart)?raw.weekStart:date),
    sport:['ride','run','gym'].includes(raw.sport)?raw.sport:null,
    exercise:typeof raw.exercise==='string'?raw.exercise.trim().slice(0,120):null,
    ...(subject?{subject}:{}),...(live?{live}:{})};
}

// The done activity or the planned session the detail screen shows, found in
// the selected day's stored training by its id (an Intervals.icu activity, a
// watch workout or "planned:<event id>").
const sameId=(item,id)=>[item?.id,item?.activityId,item?.eventId,item?.payload?.id].some(v=>v!=null&&(String(v)===id||String(v).replace(/^planned:/,'')===id.replace(/^planned:/,'')));
export function selectedSubject(subject,day){
  if(!subject?.id||!day)return {};
  if(subject.kind==='activity'){
    const activity=(day.completed||[]).find(a=>sameId(a,subject.id));
    return activity?{selectedActivity:compactActivity(activity)}:{};
  }
  if(subject.kind==='planned'){
    const session=[...(day.planned||[]),...(day.matched||[]).map(m=>m?.planned).filter(Boolean)].find(p=>sameId(p,subject.id));
    return session?{selectedSession:compactActivity(session)}:{};
  }
  return {};
}

export async function selectedAssistantContext(appContext,inputs,{loadGym,loadWeek,loadPrefs}) {
  const needsWeek=!(inputs.week?.days||[]).some(d=>d.date===appContext.weekStart);
  const [gym,extraWeek,prefs]=await Promise.all([
    appContext.sport==='gym'?(appContext.date===inputs.date?inputs.gym:loadGym(appContext.date)):null,
    needsWeek?loadWeek(appContext.weekStart):null,
    loadPrefs(appContext.weekStart)
  ]);
  const days=[...(inputs.week?.days||[])];
  for(const day of extraWeek?.days||[])if(!days.some(d=>d.date===day.date))days.push(day);
  days.sort((a,b)=>a.date.localeCompare(b.date));
  const selectedGym=todayGymContext(gym,appContext.date);
  const exercise=selectedGym?.exercises.some(e=>e.name===appContext.exercise)?appContext.exercise:null;
  const selectedDay=days.find(d=>d.date===appContext.date)?.daily?.training||null;
  return {appContext:{...appContext,exercise},selectedGym,gymPlan:gym,selectedDay,...selectedSubject(appContext.subject,selectedDay),
    selectedWeek:{start:appContext.weekStart,days:prefs.days,availability:prefs.availability,weeklyActivities:prefs.weeklyActivities},
    week:{...inputs.week,days}};
}
