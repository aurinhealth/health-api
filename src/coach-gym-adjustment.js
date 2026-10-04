import { parseStrengthSheet } from './strength-history.js';
import { EXERCISES } from './strength-generator.js';
import { findExerciseAlternatives,estimateStartingLoad } from './strength-intelligence.js';
import { availableAt } from './gym-equipment.js';

export function todayGymContext(gym,date){
  if(!gym?.values?.length)return null;
  const parsed=parseStrengthSheet(gym.values);
  if(parsed.date!==date)return null;
  const work=parsed.rows.filter(r=>r.type==='WORK'),names=[...new Set(work.map(r=>r.exercise))];
  return {date,exercises:names.map(name=>({name,muscle:EXERCISES[name]?.muscle,pattern:EXERCISES[name]?.pattern,
    sets:work.filter(r=>r.exercise===name).map(r=>({set:r.setNo,kg:r.plannedKg,reps:r.plannedReps,completed:r.completed,actualKg:r.actualKg,actualReps:r.actualReps,rpe:r.rpe,toFailure:r.toFailure,superset:r.superset})),
    alternatives:findExerciseAlternatives(name).filter(a=>EXERCISES[a.name]&&availableAt(a.name)&&!names.includes(a.name)).slice(0,4).map(a=>({name:a.name,muscle:a.muscle,pattern:a.pattern,reps:EXERCISES[a.name].reps}))}))};
}

export function prepareGymSwap(gym,fromExercise,toExercise,reason){
  const parsed=parseStrengthSheet(gym.values),source=parsed.rows.filter(r=>r.exercise===fromExercise),def=EXERCISES[toExercise];
  if(!source.length||!def||!availableAt(toExercise)||fromExercise===toExercise)throw new Error('Cvik není v aktuálním plánu nebo katalogu.');
  if(def.muscle!==EXERCISES[fromExercise]?.muscle)throw new Error('Náhrada musí zachovat cílovou partii.');
  if(parsed.rows.some(r=>r.exercise===toExercise))throw new Error('Náhradní cvik už v plánu je.');
  if(source.some(r=>r.completed||r.actualKg!=null||r.actualReps!=null||r.rpe!=null))throw new Error('Rozcvičený nebo rozepsaný cvik nelze nahradit.');
  const work=source.filter(r=>r.type==='WORK');if(!work.length)throw new Error('Cvik nemá pracovní série.');
  const estimate=estimateStartingLoad({exercise:toExercise,history:gym.history||[],targetReps:def.reps,fallbackKg:null});
  // No guessed weight when this athlete has no suitable reference.
  const kg=estimate.kg??'',video='https://www.youtube.com/results?search_query='+encodeURIComponent(toExercise+' exercise technique');
  const rows=[];
  if(def.warmup){for(const [i,factor,reps] of [[1,.4,'8'],[2,.65,'5'],[3,.8,'3']])rows.push(['WARMUP',toExercise,String(i),kg===''?'':String(Math.round(kg*factor*2)/2),reps,'','','','FALSE','[WARMUP]',video,'FALSE','']);}
  for(const [i,set] of work.entries())rows.push(['WORK',toExercise,String(i+1),String(kg),def.reps,'','','','FALSE',set.note,video,set.toFailure?'TRUE':'FALSE',set.superset]);
  return {type:'gym_swap',date:parsed.date,fromExercise,toExercise,reason,sets:work.length,reps:def.reps,kg:estimate.kg,
    sourceSnapshot:source.map(r=>gym.values[r.sheetRow-1]),replacementRows:rows};
}

// Change only the proposed exercise. Other exercises, logged results and header
// values survive; a stale or partly completed source cannot be overwritten.
export function applyGymSwap(values,action){
  const parsed=parseStrengthSheet(values),source=parsed.rows.filter(r=>r.exercise===action.fromExercise);
  if(parsed.date!==action.date||!source.length||source.some(r=>r.completed||r.actualKg!=null||r.actualReps!=null||r.rpe!=null)||parsed.rows.some(r=>r.exercise===action.toExercise)||JSON.stringify(source.map(r=>values[r.sheetRow-1]))!==JSON.stringify(action.sourceSnapshot))throw new Error('Cvik se mezitím změnil nebo už začal. Požádej o nový návrh.');
  const indices=new Set(source.map(r=>r.sheetRow-1)),first=Math.min(...indices),result=[];
  values.forEach((row,i)=>{if(i===first)result.push(...action.replacementRows);if(!indices.has(i))result.push(row);});
  if(result.length-7>100)throw new Error('Náhradou by plán překročil 100 sérií.');
  return result;
}

export const gymAdjustmentRequest=message=>/(?:uprav|zm[eě]n|vym[eě]n|nahrad|jin[eéýá]|alternativ|skladb|cvik)/i.test(message)&&/(?:gym|posil|cvi[cč]en|cvik|tr[eé]nink)/i.test(message);
