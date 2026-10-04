import { validDay, weekStartOf } from './training-availability.js';
import { todayGymContext } from './coach-gym-adjustment.js';

// The browser identifies the screen. Training results always come from storage.
export function assistantAppContext(input, today) {
  const raw=input&&typeof input==='object'?input:{};
  const view=['today','workouts','training','health','nutrition','settings'].includes(raw.view)?raw.view:'today';
  const date=validDay(raw.date)?raw.date:today;
  return {view,date,weekStart:weekStartOf(validDay(raw.weekStart)?raw.weekStart:date),
    sport:['ride','run','gym'].includes(raw.sport)?raw.sport:null,
    exercise:typeof raw.exercise==='string'?raw.exercise.trim().slice(0,120):null};
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
  return {appContext:{...appContext,exercise},selectedGym,gymPlan:gym,
    selectedDay:days.find(d=>d.date===appContext.date)?.daily?.training||null,
    selectedWeek:{start:appContext.weekStart,days:prefs.days,availability:prefs.availability,weeklyActivities:prefs.weeklyActivities},
    week:{...inputs.week,days}};
}
