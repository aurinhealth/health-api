import { deviceEnergyExtra } from './app-training.js';
import { refillMacros } from './diet.js';

export function energyBudget(daily,profile,health){
  const weight=Number(daily.weight?.current??daily.nutrition?.currentWeight),age=Number(profile.age),height=Number(profile.height),active=health?.today?.activeCalories;
  if(!(weight>0&&age>=18&&age<=100&&height>=100&&height<=230&&['male','female'].includes(profile.sex))||active==null||!(active>=0))return null;
  // The watch's calories the user chose not to count (Kalorie k ověření →
  // odhad) never raise the target either, as in the day's active energy.
  const counted=Math.max(0,active-deviceEnergyExtra(daily.training?.completed));
  const basal=10*weight+6.25*height-5*age+(profile.sex==='male'?5:-161),digestion=.1,deficit=Number(daily.nutrition?.calorieBreakdown?.weightLossDeficit)||0;
  // Active calories already cover exercise and everyday movement. Never add
  // cycling or step calories a second time. This is a running, not final, day.
  // A personal profile carries its own floor (resting metabolism); otherwise 1800 as before.
  const floor=daily.nutrition?.calorieBreakdown?.source==='profile'?Number(daily.nutrition.calorieBreakdown.minTarget)||1800:1800;
  return{basal:Math.round(basal),active:Math.round(counted),digestionShare:digestion,deficit:Math.max(0,deficit),surplus:Math.max(0,-deficit),target:Math.max(floor,Math.round((basal+counted)/(1-digestion)-deficit)),source:'google-health',partial:true};
}

// The day's calorie target with the Google Health energy budget: the higher of
// the expected day from the profile (resting expenditure × everyday activity,
// minus the goal, plus training) and the running budget from the active energy
// measured so far. Early in the day the running budget only knows a part of
// the day's movement; it takes over once the day is more active than usual.
// The day view, the week view and the coaches all go through here.
// An own goal (profile.kcalGoal, Cíle → Kalorie → Vlastní) replaces the target;
// autoCalorieTarget keeps the computed one for the settings.
export function applyEnergyBudget(daily,profile,health){
  // No budget either while the day has no personal target (weight or profile missing).
  const budget=daily?.nutrition?.calorieTarget!=null&&profile?energyBudget(daily,profile,health):null;
  if(budget){
    const expected=Number(daily.nutrition.calorieTarget)||0,target=Math.max(budget.target,expected);
    budget.expectedTarget=expected;budget.basis=target>budget.target?'profile':'google-health';
    daily.nutrition.energyBudget=budget;setTarget(daily,target);
  }
  const own=Number(profile?.kcalGoal);
  // The own goal is fixed: no training bonus on top and no budget behind it.
  if(daily?.nutrition&&own>0){daily.nutrition.autoCalorieTarget=daily.nutrition.calorieTarget??null;daily.nutrition.ownTarget=true;delete daily.nutrition.energyBudget;setTarget(daily,own);}
  return daily;
}

function setTarget(daily,target){
  daily.nutrition.calorieTarget=target;daily.calories={...daily.calories,target};
  // The macro the diet fills (carbs, or fat on keto and lower carb) takes the change (diet.js).
  daily.nutrition.macros=refillMacros(daily.nutrition.macros||{},target);
}
