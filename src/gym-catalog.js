import {EXERCISES} from './strength-generator.js';
import {EXERCISE_INTELLIGENCE} from './strength-intelligence.js';

const muscleLabels={chest:'Hrudník',back:'Záda',shoulders:'Ramena',quads:'Přední stehna',hamstrings:'Zadní stehna',glutes:'Hýždě',biceps:'Biceps',triceps:'Triceps',core:'Střed těla',adductors:'Vnitřní stehna',abductors:'Vnější stehna',rear_delts:'Zadní ramena',side_delts:'Boční ramena',calves:'Lýtka'};
const searchTerms={
  'DB bench press':'bench tlaky jednoručky prsa',
  'Low row':'veslování přítahy záda',
  'DB shoulder press':'tlaky ramena jednoručky',
  'Pivot leg press':'legpress tlak nohama stehna',
  'Prone leg curl Prime':'zakopávání hamstringy',
  'Cable curl':'biceps kladka',
  'DB curl':'biceps jednoručky',
  'Hammer curl':'kladivo biceps',
  'Cable triceps extension':'triceps stahování kladka',
  'Abs bench crunch':'břicho zkracovačky',
  'Chest flat press Prime':'tlaky prsa hrudník',
  'Shoulder press Prime':'tlaky ramena',
  'Lat pulldown':'stahování horní kladky záda',
  'Standing rowing machine':'veslování přítahy záda',
  'Pendulum squat':'dřep stehna',
  'Leg extension Prime':'předkopávání stehna',
  'Hip thrust':'hýždě zdvih pánve',
  'DB Romanian deadlift':'rumunský mrtvý tah jednoručky',
  'Barbell Romanian deadlift':'rumunský mrtvý tah osa',
  'DB Bulgarian split squat':'bulharský dřep',
  'Adduction machine':'přitahování stehen',
  'Abduction machine':'roznožování stehna',
  'Pec deck':'rozpažování prsa',
  'Rear delt pec deck':'zadní ramena rozpažování',
  'Cable lateral raise':'upažování ramena kladka',
  'Cable pullover':'pullover záda',
  'Cable rear delt fly':'zadní ramena kladka',
  'Pallof press':'antirotace břicho střed těla',
  'Cable woodchop':'rotace břicho kladka',
  'Roman chair':'hyperextenze záda',
  'Standing calf raise':'výpony lýtka',
  'Cable crunch':'břicho zkracovačky kladka'
};

export function gymExerciseCatalog(){
  return Object.entries(EXERCISES).filter(([name])=>EXERCISE_INTELLIGENCE[name]).map(([name,def])=>({name,muscle:muscleLabels[def.muscle]||def.muscle,sets:def.sets,reps:def.reps,search:searchTerms[name]||'',note:def.note||''}));
}

export function findGymExercises(query,items=gymExerciseCatalog()){
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs').trim();
  const words=norm(query).split(/\s+/).filter(Boolean);
  return items.filter(item=>words.every(word=>norm([item.name,item.muscle,item.search].join(' ')).includes(word))).sort((a,b)=>a.name.localeCompare(b.name,'cs'));
}
