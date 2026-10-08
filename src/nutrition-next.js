import { localHour } from "./user-time.js";
const MEALS = [
  {type:"BREAKFAST",label:"Snídaně",from:0,to:10},
  {type:"LUNCH",label:"Oběd",from:10,to:15},
  {type:"SNACK",label:"Svačina",from:15,to:19},
  {type:"DINNER",label:"Večeře",from:18,to:24}
];

export function nextUnloggedMeals(completed, hour) {
  const pending=MEALS.filter(meal=>!completed.has(meal.type));
  if(!pending.length)return [];
  const upcoming=pending.filter(meal=>meal.to>hour);
  if(!upcoming.length)return [];
  const current=[...upcoming].reverse().find(meal=>meal.from<=hour) || upcoming[0];
  return [current,...upcoming.filter(meal=>meal!==current)].slice(0,3);
}

export function completedMealTypes(entries) {
  const completed=new Set();
  for(const entry of entries||[]){
    let note={};
    try{note=typeof entry.note==='string'?JSON.parse(entry.note):entry.note||{}}catch{}
    const label=String(entry.meal_type||entry.mealType||note.mealType||note.meal_type||'').toLowerCase();
    if(/breakfast|snídan|snidan/.test(label))completed.add('BREAKFAST');
    else if(/lunch|oběd|obed/.test(label))completed.add('LUNCH');
    else if(/dinner|večeř|vecer/.test(label))completed.add('DINNER');
    else if(/snack|svačin|svacin/.test(label))completed.add('SNACK');
    else if(entry.consumed_at){
      const date=new Date(entry.consumed_at);
      if(!Number.isNaN(date.getTime())){
        const hour=localHour(date);
        completed.add(hour<10?'BREAKFAST':hour<15?'LUNCH':hour<18?'SNACK':'DINNER');
      }
    }
  }
  return completed;
}
