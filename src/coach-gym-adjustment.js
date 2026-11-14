import { L } from './lang.js';
import { parseStrengthPlan } from './strength-history.js';
import { EXERCISES, FOCUS_GROUPS, fitsEquipment, painfulExercises } from './strength-generator.js';
import { findExerciseAlternatives, resolveLoad } from './strength-intelligence.js';
import { gymLoadEstimate } from './gym-catalog.js';
import { availableAt, stationExercises } from './gym-equipment.js';
import { splitSides } from './gym-sides.js';

// An exercise the athlete's own equipment allows (/app/api/gym sends it); the
// default gym's only when it is unknown.
const fits=(name,gym)=>gym?.equipment?fitsEquipment(name,gym.equipment):availableAt(name);

// wanted: the muscle groups the athlete named (requestedMuscles): for each, a
// few catalogue exercises the coach can add with type=gym_add.
export function todayGymContext(gym,date,memories=[],broken=[],wanted=[]){
  const painful=new Set([...painfulExercises(memories).avoid,...stationExercises(broken)]);
  if(!gym?.values?.length)return null;
  const parsed=parseStrengthPlan(gym.values);
  if(parsed.date!==date)return null;
  const work=parsed.rows.filter(r=>r.type==='WORK'),names=[...new Set(work.map(r=>r.exercise))];
  return {date,exercises:names.map(name=>({name,muscle:EXERCISES[name]?.muscle,pattern:EXERCISES[name]?.pattern,
    sets:work.filter(r=>r.exercise===name).map(r=>({set:r.setNo,kg:r.plannedKg,reps:r.plannedReps,completed:r.completed,actualKg:r.actualKg,actualReps:r.actualReps,rpe:r.rpe,toFailure:r.toFailure,superset:r.superset})),
    alternatives:findExerciseAlternatives(name).filter(a=>EXERCISES[a.name]&&fits(a.name,gym)&&!painful.has(a.name)&&!names.includes(a.name)).slice(0,4).map(a=>({name:a.name,muscle:a.muscle,pattern:a.pattern,reps:EXERCISES[a.name].reps}))})),
    ...(wanted.length?{addable:Object.fromEntries(wanted.filter(g=>FOCUS_GROUPS[g]).map(g=>[g,FOCUS_GROUPS[g].exercises.filter(n=>EXERCISES[n]&&fits(n,gym)&&!painful.has(n)&&!names.includes(n)).slice(0,4).map(n=>({name:n,sets:addSets(n),reps:EXERCISES[n].reps}))]))}:{})};
}

// The sets an added exercise gets: its usual dose, at most three on top of the plan.
const addSets=name=>Math.min(Number(EXERCISES[name]?.sets)||3,3);
const started=r=>r.completed||r.actualKg!=null||r.actualReps!=null||r.rpe!=null;
// An exercise the plan may take in: from the catalogue, on the athlete's
// equipment, not on a part that hurts or a machine out of order, not in yet.
function guardNew(name,gym,parsed,memories,broken){
  if(!EXERCISES[name]||!fits(name,gym))throw new Error(L('Cvik není v aktuálním plánu nebo katalogu.', 'The exercise isn\'t in the current plan or catalog.'));
  if(parsed.rows.some(r=>r.exercise===name))throw new Error(L('Náhradní cvik už v plánu je.', 'The replacement exercise is already in the plan.'));
  if(painfulExercises(memories).avoid.has(name))throw new Error(L('Náhrada zatěžuje partii, která tě podle paměti trenéra bolí.', 'The replacement loads a body part that hurts, as the coach remembers.'));
  if(stationExercises(broken).includes(name))throw new Error(L('Stroj na tenhle cvik teď podle tebe nefunguje.', 'The machine for this exercise is out of order, as you said.'));
}

// The order a session keeps after a change (Petr 2026-11-14: a swapped or
// added exercise should not just take the old place): the big lifts with a
// warm-up first, then other compound work, the small muscles, the core last,
// as the generator builds it. Started exercises and supersets stay as they are;
// only the first main lift keeps three warm-up sets, a later one keeps one.
const rank=name=>{const d=EXERCISES[name];if(!d)return 2;if(d.muscle==='core'||d.pattern==='core')return 3;return d.warmup?0:d.fatigue>=0.8?1:2;};
export function orderGymPlan(values){
  const header=values.findIndex(r=>r?.[0]==='Typ'&&r?.[1]==='Cvik');if(header<0)return values;
  const blocks=[];
  for(const row of values.slice(header+1)){
    const key=String(row?.[12]||'').trim()?'S:'+row[12]:'E:'+row?.[1],last=blocks.at(-1);
    if(last&&(last.key===key||!row?.[1]))last.rows.push(row);else blocks.push({key,rows:[row]});
  }
  const parsed=parseStrengthPlan(values),done=new Set(parsed.rows.filter(started).map(r=>r.exercise));
  for(const b of blocks){b.fixed=b.rows.some(r=>done.has(String(r?.[1]||'').trim()))||b.key.startsWith('S:');b.rank=Math.min(...b.rows.map(r=>rank(String(r?.[1]||'').trim())));}
  const movable=blocks.filter(b=>!b.fixed).map((b,i)=>({b,i})).sort((x,y)=>x.b.rank-y.b.rank||x.i-y.i).map(x=>x.b);
  const ordered=blocks.map(b=>b.fixed?b:movable.shift());
  let firstMain=true;
  const rows=ordered.flatMap(b=>{
    const warm=b.rows.filter(r=>String(r?.[0]).toUpperCase()==='WARMUP');
    if(!warm.length)return b.rows;
    const keep=firstMain||b.fixed;firstMain=false;
    if(keep||warm.length<=2)return b.rows;
    // One ramp-up set before a later main lift: the middle one (65 %, 5 reps), per side.
    const middle=new Set(warm.filter(r=>String(r[2])==='2'));
    return b.rows.filter(r=>String(r?.[0]).toUpperCase()!=='WARMUP'||middle.has(r)).map(r=>middle.has(r)?[r[0],r[1],'1',...r.slice(3)]:r);
  });
  return [...values.slice(0,header+1),...rows];
}

// One exercise more for today: its usual sets, placed where it belongs.
export function prepareGymAdd(gym,toExercise,reason,memories=[],broken=[]){
  const parsed=parseStrengthPlan(gym.values);
  guardNew(toExercise,gym,parsed,memories,broken);
  const def=EXERCISES[toExercise],sets=addSets(toExercise),estimate=gymLoadEstimate(toExercise,gym.history||[])||{kg:null},kg=estimate.kg??'';
  const video='https://www.youtube.com/results?search_query='+encodeURIComponent(toExercise+' exercise technique'),rows=[];
  if(def.warmup)for(const [i,factor,reps] of [[1,.4,'8'],[2,.65,'5'],[3,.8,'3']])rows.push(['WARMUP',toExercise,String(i),kg===''?'':String(resolveLoad(toExercise,kg*factor)),reps,'','','','FALSE','[WARMUP]',video,'FALSE','','','']);
  for(let i=0;i<sets;i++)rows.push(['WORK',toExercise,String(i+1),String(kg),def.reps,'','','','FALSE','',video,'FALSE','','','']);
  const addedRows=splitSides(rows,{columns:15}),after=orderGymPlan([...gym.values,...addedRows]);
  if(after.length-7>100)throw new Error(L('Přidáním by plán překročil 100 sérií.', 'Adding it would push the plan over 100 sets.'));
  const order=[...new Set(parseStrengthPlan(after).rows.filter(r=>r.type==='WORK').map(r=>r.exercise))];
  return {type:'gym_add',date:parsed.date,toExercise,reason,sets,reps:def.reps,kg:estimate.kg,position:order.indexOf(toExercise)+1,of:order.length,addedRows};
}
export function applyGymAdd(values,action){
  const parsed=parseStrengthPlan(values);
  if(parsed.date!==action.date||parsed.rows.some(r=>r.exercise===action.toExercise))throw new Error(L('Plán se mezitím změnil. Požádej o nový návrh.', 'The plan has changed in the meantime. Ask for a new proposal.'));
  const result=orderGymPlan([...values,...action.addedRows]);
  if(result.length-7>100)throw new Error(L('Přidáním by plán překročil 100 sérií.', 'Adding it would push the plan over 100 sets.'));
  return result;
}

// One exercise less: not started, and at least two exercises stay.
export function prepareGymRemove(gym,fromExercise,reason){
  const parsed=parseStrengthPlan(gym.values),source=parsed.rows.filter(r=>r.exercise===fromExercise);
  if(!source.length)throw new Error(L('Cvik není v aktuálním plánu nebo katalogu.', 'The exercise isn\'t in the current plan or catalog.'));
  if(source.some(started))throw new Error(L('Rozcvičený nebo rozepsaný cvik nelze odebrat.', 'An exercise that\'s warmed up or partly logged can\'t be removed.'));
  if(new Set(parsed.rows.filter(r=>r.type==='WORK'&&r.exercise!==fromExercise).map(r=>r.exercise)).size<2)throw new Error(L('V plánu musí zůstat aspoň dva cviky.', 'At least two exercises must stay in the plan.'));
  const work=source.filter(r=>r.type==='WORK'),sided=work.some(r=>r.side);
  return {type:'gym_remove',date:parsed.date,fromExercise,reason,sets:sided?work.filter(r=>r.side==='L').length:work.length,sourceSnapshot:source.map(r=>gym.values[r.planRow-1])};
}
export function applyGymRemove(values,action){
  const parsed=parseStrengthPlan(values),source=parsed.rows.filter(r=>r.exercise===action.fromExercise);
  if(parsed.date!==action.date||!source.length||source.some(started)||JSON.stringify(source.map(r=>values[r.planRow-1]))!==JSON.stringify(action.sourceSnapshot))throw new Error(L('Cvik se mezitím změnil nebo už začal. Požádej o nový návrh.', 'The exercise has changed or already started. Ask for a new proposal.'));
  const drop=new Set(source.map(r=>r.planRow-1));
  return orderGymPlan(values.filter((_,i)=>!drop.has(i)));
}

// The confirmed card's change of the stored plan (entrypoint.js, /app/api/assistant/action).
export const applyGymChange=(values,action)=>({gym_swap:applyGymSwap,gym_add:applyGymAdd,gym_remove:applyGymRemove})[action.type](values,action);

// A replacement loading a part the coach remembers as painful is refused (Revize 2026-10-16, nález 24).
export function prepareGymSwap(gym,fromExercise,toExercise,reason,memories=[],broken=[]){
  const parsed=parseStrengthPlan(gym.values),source=parsed.rows.filter(r=>r.exercise===fromExercise),def=EXERCISES[toExercise];
  if(!source.length||!def||!fits(toExercise,gym)||fromExercise===toExercise)throw new Error(L('Cvik není v aktuálním plánu nebo katalogu.', 'The exercise isn\'t in the current plan or catalog.'));
  if(def.muscle!==EXERCISES[fromExercise]?.muscle)throw new Error(L('Náhrada musí zachovat cílovou partii.', 'The replacement must keep the target muscle group.'));
  if(parsed.rows.some(r=>r.exercise===toExercise))throw new Error(L('Náhradní cvik už v plánu je.', 'The replacement exercise is already in the plan.'));
  if(painfulExercises(memories).avoid.has(toExercise))throw new Error(L('Náhrada zatěžuje partii, která tě podle paměti trenéra bolí.', 'The replacement loads a body part that hurts, as the coach remembers.'));
  if(stationExercises(broken).includes(toExercise))throw new Error(L('Stroj na tenhle cvik teď podle tebe nefunguje.', 'The machine for this exercise is out of order, as you said.'));
  if(source.some(r=>r.completed||r.actualKg!=null||r.actualReps!=null||r.rpe!=null))throw new Error(L('Rozcvičený nebo rozepsaný cvik nelze nahradit.', 'An exercise that\'s warmed up or partly logged can\'t be replaced.'));
  // A one-sided exercise holds each set twice, left and right (gym-sides.js),
  // and the weaker side one more: the swap keeps the sets, not the rows.
  const all=source.filter(r=>r.type==='WORK'),sided=all.some(r=>r.side),work=sided?all.filter(r=>r.side===(all.filter(x=>x.side==='L').length<=all.filter(x=>x.side==='P').length?'L':'P')):all;
  if(!work.length)throw new Error(L('Cvik nemá pracovní série.', 'The exercise has no work sets.'));
  // The generator's estimate: own history, a similar exercise, or the catalogue's start.
  const estimate=gymLoadEstimate(toExercise,gym.history||[])||{kg:null};
  const kg=estimate.kg??'',video='https://www.youtube.com/results?search_query='+encodeURIComponent(toExercise+' exercise technique');
  const rows=[];
  // Warm-ups at the equipment's step (a bar 17,5 kg, not 17; Revize 2026-10-16, nález 28).
  if(def.warmup){for(const [i,factor,reps] of [[1,.4,'8'],[2,.65,'5'],[3,.8,'3']])rows.push(['WARMUP',toExercise,String(i),kg===''?'':String(resolveLoad(toExercise,kg*factor)),reps,'','','','FALSE','[WARMUP]',video,'FALSE','','','']);}
  // Each set keeps its options: to failure, superset and intensity (the labels).
  for(const [i,set] of work.entries())rows.push(['WORK',toExercise,String(i+1),String(kg),def.reps,'','','','FALSE',set.note,video,set.toFailure?'TRUE':'FALSE',set.superset||'','',set.intensity||'']);
  // A one-sided replacement goes left and right, as the generator writes it.
  const replacementRows=splitSides(rows,{columns:15});
  return {type:'gym_swap',date:parsed.date,fromExercise,toExercise,reason,sets:work.length,reps:def.reps,kg:estimate.kg,
    sourceSnapshot:source.map(r=>gym.values[r.planRow-1]),replacementRows};
}

// Change only the proposed exercise. Other exercises, logged results and header
// values survive; a stale or partly completed source cannot be overwritten.
export function applyGymSwap(values,action){
  const parsed=parseStrengthPlan(values),source=parsed.rows.filter(r=>r.exercise===action.fromExercise);
  if(parsed.date!==action.date||!source.length||source.some(r=>r.completed||r.actualKg!=null||r.actualReps!=null||r.rpe!=null)||parsed.rows.some(r=>r.exercise===action.toExercise)||JSON.stringify(source.map(r=>values[r.planRow-1]))!==JSON.stringify(action.sourceSnapshot))throw new Error(L('Cvik se mezitím změnil nebo už začal. Požádej o nový návrh.', 'The exercise has changed or already started. Ask for a new proposal.'));
  const indices=new Set(source.map(r=>r.planRow-1)),first=Math.min(...indices),result=[];
  values.forEach((row,i)=>{if(i===first)result.push(...action.replacementRows);if(!indices.has(i))result.push(row);});
  if(result.length-7>100)throw new Error(L('Náhradou by plán překročil 100 sérií.', 'The replacement would push the plan over 100 sets.'));
  return orderGymPlan(result);
}

// A change to a gym session: a change word plus a gym word ("Vyměň dřep",
// "Uprav dnešní cvičení"). "Trénink" alone counts only on the open gym screen,
// so "Jiný trénink na kole" stays a ride request. [nň]/[dď]: "Změň", "Nahraď".
export const gymAdjustmentRequest=(message,appContext=null)=>{
  const m=String(message||'');
  return /(?:uprav|zm[eě][nň]|vym[eě][nň]|nahra[dď]|jin[eéýá]|alternativ|skladb|cvik|adjust|chang|swap|replac|different|alternative)/i.test(m)&&(/(?:gym|posil|cvi[cč]en|cvik|s[eé]ri|bench|d[řr]ep|mrtv|přítah|tlak|činky|stroj|exercise|lift|squat|deadlift|press|(?<!\p{L})rows?(?!\p{L})|dumbbell|barbell|machine|(?<!\p{L})sets?(?!\p{L}))/iu.test(m)||appContext?.sport==='gym'&&/tr[eé]nink|workout|session/i.test(m));
};
