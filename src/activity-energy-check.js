import { L } from './lang.js';
// A plausibility check, not a replacement for measured energy. Terrain,
// carrying load and individual physiology can move a walk outside this range.
// MET reference: https://pacompendium.com/walking/ (2024 Adult Compendium).
export function walkingEnergyCheck(activity,weightKg){
  if(!/^(Walk|Walking)$/i.test(activity.type||''))return null;
  const weight=Number(weightKg),hours=Number(activity.durationHours),metrics=activity.payload?.exercise?.metricsSummary||{};
  if(!(weight>=30&&weight<=300&&hours>0&&hours<=12))return {status:'unavailable',reason:L('Chybí hmotnost nebo délka chůze pro kontrolu výdeje.', 'Weight or walk duration is missing for the expenditure check.')};
  const km=Number(metrics.distanceMillimeters||metrics.distanceMillimiters||0)/1000000,speed=km/hours;
  const met=speed>0?(speed<3.2?2.8:speed<4.5?3:speed<5.6?3.8:speed<6.4?4.8:5.5):3.5;
  const estimated=Math.round((met-1)*weight*hours),low=Math.round(estimated*.6),high=Math.round(estimated*1.6),reported=Number(activity.calories);
  const review=reported>0&&(reported>high||reported<low);
  return {status:review?'review':'consistent',reported:reported>0?reported:null,estimated,low,high,
    source:L('Google Health · souhrn chůze', 'Google Health · walking summary'),basis:'active',steps:Number(metrics.steps)||null,distanceKm:km||null,
    reason:review?L('Údaj zařízení se liší od orientačního odhadu běžné chůze. Zkontroluj délku, kopce, zátěž a tep.', 'The device value differs from a rough estimate for normal walking. Check the duration, hills, load and heart rate.'):L('Orientační kontrola podle hmotnosti, délky a dostupné vzdálenosti. Nejde o měření.', 'A rough check based on weight, duration and the available distance. It isn\'t a measurement.')};
}
export function activityTelemetryEnergy(activity,rows){
  const start=Date.parse(activity.start),end=Date.parse(activity.end),duration=end-start;
  if(!(duration>0&&duration<=12*3600000))return null;
  const intervals=rows.map(row=>({start:Date.parse(row.start_time),end:Date.parse(row.end_time),kcal:Number(row.value_numeric)})).filter(r=>Number.isFinite(r.kcal)&&r.kcal>=0&&r.end>r.start&&r.end>start&&r.start<end&&r.end-r.start<=10*60000).sort((a,b)=>a.start-b.start||a.end-b.end);
  let covered=0,kcal=0,last=start;
  for(const row of intervals){
    // Reconciled points should not overlap. If cached points do overlap, use
    // each second only once instead of adding the calories a second time.
    const from=Math.max(start,row.start,last),to=Math.min(end,row.end);if(to<=from)continue;
    covered+=to-from;kcal+=row.kcal*(to-from)/(row.end-row.start);last=to;
  }
  return covered/duration>=.98?{kcal:Math.round(kcal),coverage:covered/duration,source:'google-active-energy-intervals'}:null;
}
