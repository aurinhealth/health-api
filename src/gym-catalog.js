import {EXERCISES} from './strength-generator.js';
import {EXERCISE_INTELLIGENCE} from './strength-intelligence.js';
import {availableAt,stationLabel} from './gym-equipment.js';

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
  'Cable crunch':'břicho zkracovačky kladka',
  'Barbell bench press':'benchpress osa tlaky prsa',
  'DB incline press':'šikmá lavice tlaky jednoručky prsa',
  'One-arm DB row':'přítah jednoručky jednoruč záda',
  'Standing multi flight':'upažování boční ramena stroj',
  'Face pull':'face pull zadní ramena lano kladka',
  'Cable overhead triceps extension':'triceps za hlavou lano kladka',
  'Goblet squat':'dřep jednoručka goblet',
  'Cable glute kickback':'kickback zanožování hýždě kladka',
  'Cable pull-through':'pull through hýždě lano kladka předklon',
  'Cable hip abduction':'unožování hýždě kladka abdukce',
  'Barbell hip thrust':'hip thrust osa hýždě zdvih pánve lavice',
  'DB reverse lunge':'výpady vzad hýždě stehna jednoručky',
  'DB step-up':'výstupy na lavici hýždě stehna step up',
  'DB single-leg Romanian deadlift':'jednonožný rumunský mrtvý tah hamstringy hýždě',
  'DB sumo squat':'sumo dřep široký vnitřní stehna hýždě jednoručka',
  'Leg press high feet':'legpress hýždě nohy vysoko',
  'Abduction machine forward lean':'roznožování hýždě předklon abdukce',
  'Glute hyperextension':'hyperextenze hýždě roman chair',
  'Cable fly':'rozpažování prsa kladky crossover',
  'Low-to-high cable fly':'rozpažování zdola horní prsa kladky',
  'Single-arm cable row':'přítah jednoruč kladka záda veslování',
  'Close-grip lat pulldown':'stahování horní kladky úzký úchop záda',
  'Wide-grip low row':'přítahy široký úchop horní záda',
  'Barbell row':'přítah osy v předklonu záda',
  'DB lateral raise':'upažování ramena jednoručky',
  'DB Arnold press':'arnold tlaky ramena jednoručky',
  'DB rear delt fly':'zadní ramena rozpažování v předklonu jednoručky',
  'DB incline curl':'biceps šikmá lavice jednoručky',
  'Cable rope hammer curl':'kladivo biceps lano kladka',
  'Cable triceps kickback':'triceps kickback zapažování kladka',
  'DB overhead triceps extension':'triceps za hlavou jednoručka',
  'Single-leg calf raise':'výpony jednonož lýtka jednoručka'
};

export function gymExerciseCatalog(){
  // Only exercises that can be done in the gym (METAGYM Kutná Hora), with the station.
  return Object.entries(EXERCISES).filter(([name])=>EXERCISE_INTELLIGENCE[name]&&availableAt(name)).map(([name,def])=>({name,muscle:muscleLabels[def.muscle]||def.muscle,sets:def.sets,reps:def.reps,search:[searchTerms[name]||'',stationLabel(name)||''].join(' ').trim(),note:def.note||'',station:stationLabel(name)}));
}

export function findGymExercises(query,items=gymExerciseCatalog()){
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs').trim();
  const words=norm(query).split(/\s+/).filter(Boolean);
  return items.filter(item=>words.every(word=>norm([item.name,item.muscle,item.search].join(' ')).includes(word))).sort((a,b)=>a.name.localeCompare(b.name,'cs'));
}
