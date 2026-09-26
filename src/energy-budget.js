export function energyBudget(daily,profile,health){
  const weight=Number(daily.weight?.current??daily.nutrition?.currentWeight),age=Number(profile.age),height=Number(profile.height),active=health?.today?.activeCalories;
  if(!(weight>0&&age>=18&&age<=100&&height>=100&&height<=230&&['male','female'].includes(profile.sex))||active==null||!(active>=0))return null;
  const basal=10*weight+6.25*height-5*age+(profile.sex==='male'?5:-161),digestion=.1,deficit=Number(daily.nutrition?.calorieBreakdown?.weightLossDeficit)||0;
  // Active calories already cover exercise and everyday movement. Never add
  // cycling or step calories a second time. This is a running, not final, day.
  return{basal:Math.round(basal),active:Math.round(active),digestionShare:digestion,deficit:Math.max(0,deficit),target:Math.max(1800,Math.round((basal+active)/(1-digestion)-Math.max(0,deficit))),source:'google-health',partial:true};
}
