import { L } from './lang.js';
import { parseStrengthPlan } from './strength-history.js';
import { EXERCISES, FOCUS_GROUPS, fitsEquipment, painfulExercises } from './strength-generator.js';
import { findExerciseAlternatives, resolveLoad } from './strength-intelligence.js';
import { gymLoadEstimate } from './gym-catalog.js';
import { availableAt, stationExercises } from './gym-equipment.js';
import { splitSides } from './gym-sides.js';
import { estimateStrengthTiming } from './strength-timing.js';

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
  // How long the plan takes, so "do 45 minut" can be answered with "už se vejde".
  let estimatedMinutes=null;try{estimatedMinutes=estimateStrengthTiming(gym.values.slice(parsed.headerRow).filter(r=>r?.[1]),EXERCISES,90).estimatedMinutes||null;}catch{}
  return {date,estimatedMinutes,exercises:names.map(name=>({name,muscle:EXERCISES[name]?.muscle,pattern:EXERCISES[name]?.pattern,
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

// The place of a swapped or added exercise (Petr 2026-11-14: it should not
// just take the old place): before the first exercise not started yet that
// comes later in the generator's order (big lifts with a warm-up, other
// compound work, small muscles, core last), else at the end. Only this
// exercise moves; the rest of the plan stays row for row. Behind another main
// lift it keeps one warm-up set, as the generator writes a later main lift.
// An exercise in a superset stays where it is.
const rank=name=>{const d=EXERCISES[name];if(!d)return 2;if(d.muscle==='core'||d.pattern==='core')return 3;return d.warmup?0:d.fatigue>=0.8?1:2;};
const isWarmup=r=>String(r?.[0]||'').toUpperCase()==='WARMUP';
export function placeExercise(values,name){
  const header=values.findIndex(r=>r?.[0]==='Typ'&&r?.[1]==='Cvik');if(header<0)return values;
  const own=(r,i)=>i>header&&String(r?.[1]||'').trim()===name;
  const mine=values.filter(own);
  if(!mine.length||mine.some(r=>String(r?.[12]||'').trim()))return values;
  const rest=values.filter((r,i)=>!own(r,i));
  const parsed=parseStrengthPlan(rest),done=new Set(parsed.rows.filter(started).map(r=>r.exercise)),seen=new Set();
  // No place next to or inside a superset: none before an exercise in one,
  // none right after a superset row whose group goes on below.
  const grouped=new Set(parsed.rows.filter(r=>r.superset).map(r=>r.exercise));
  const inside=i=>{const g=String(rest[i-1]?.[12]||'').trim();return g&&rest.slice(i).some(r=>String(r?.[12]||'').trim()===g);};
  let at=rest.length;
  for(let i=header+1;i<rest.length;i++){
    const other=String(rest[i]?.[1]||'').trim();
    if(!other||seen.has(other))continue;seen.add(other);
    if(!done.has(other)&&!grouped.has(other)&&!inside(i)&&rank(other)>rank(name)){at=i;break;}
  }
  // A main lift before it already brought the body up to speed.
  const behindMain=rest.slice(header+1,at).some(isWarmup);
  const warm=mine.filter(isWarmup),moved=behindMain&&warm.length>2?mine.filter(r=>!isWarmup(r)||String(r[2])==='2').map(r=>isWarmup(r)?[r[0],r[1],'1',...r.slice(3)]:r):mine;
  return [...rest.slice(0,at),...moved,...rest.slice(at)];
}

// The plan's own day, so the load after a break is held or lowered for it.
const planDate=gym=>{try{return parseStrengthPlan(gym.values).date||null;}catch{return null;}};
// The rows of an exercise new to the plan: its usual sets at the generator's
// estimate, warm-ups for a main lift, left and right for a one-sided one.
function newExerciseRows(name,gym){
  const def=EXERCISES[name],estimate=gymLoadEstimate(name,gym.history||[],planDate(gym))||{kg:null},kg=estimate.kg??'';
  const video='https://www.youtube.com/results?search_query='+encodeURIComponent(name+' exercise technique'),rows=[];
  if(def.warmup)for(const [i,factor,reps] of [[1,.4,'8'],[2,.65,'5'],[3,.8,'3']])rows.push(['WARMUP',name,String(i),kg===''?'':String(resolveLoad(name,kg*factor)),reps,'','','','FALSE','[WARMUP]',video,'FALSE','','','']);
  for(let i=0;i<addSets(name);i++)rows.push(['WORK',name,String(i+1),String(kg),def.reps,'','','','FALSE','',video,'FALSE','','','']);
  return {estimate,rows:splitSides(rows,{columns:15})};
}

const EXTEND_ORDER=['hips','side_delts','biceps','triceps','rear_delts','calves','abs','front_delts','chest','upper_back','lats','quads','hamstrings'];
// "Prodluž mi posilovnu na 90 minut" (Chat v1, Petr 2026-11-14): the day's
// stored plan gets exercises for its halves of the body, the groups it does
// not train yet first, each placed where it belongs, while the
// estimate fits the new length. Nothing already in the plan changes. Null
// when nothing fits or the plan already fills the time.
export function extendGymPlan(gym,minutes,memories=[],broken=[]){
  if(!Array.isArray(gym?.values)||!(minutes>0))return null;
  let parsed;try{parsed=parseStrengthPlan(gym.values);}catch{return null;}
  const header=gym.values.findIndex(r=>r?.[0]==='Typ'&&r?.[1]==='Cvik');if(header<0||!parsed.rows.length)return null;
  const rowsOf=values=>values.slice(header+1).filter(r=>r?.[1]);
  const estimate=values=>estimateStrengthTiming(rowsOf(values),EXERCISES,minutes).estimatedMinutes;
  // Longer than the plan's own length and its estimate, or it is no lengthening.
  const limit=Number(gym.values.find(r=>r?.[0]==='Časový limit (min)')?.[1])||0;
  const before=estimate(gym.values);if(minutes<=limit||before>=minutes-5)return null;
  const painful=new Set([...painfulExercises(memories).avoid,...stationExercises(broken)]),inPlan=new Set(parsed.rows.map(r=>r.exercise));
  const work=parsed.rows.filter(r=>r.type==='WORK'),setsIn=g=>work.filter(r=>FOCUS_GROUPS[g].exercises.includes(r.exercise)).length;
  // The halves of the body the plan trains stay the only ones (an upper-body
  // day that spares the legs keeps sparing them); within them the groups it
  // does not train yet come first, then those with the fewest sets.
  const legs=LEGS.some(g=>setsIn(g)),upper=Object.keys(FOCUS_GROUPS).some(g=>!LEGS.includes(g)&&!CORE.includes(g)&&setsIn(g));
  const allowed=EXTEND_ORDER.filter(g=>FOCUS_GROUPS[g]&&(LEGS.includes(g)?legs:CORE.includes(g)||upper));
  const groups=[...allowed.filter(g=>!setsIn(g)),...allowed.filter(g=>setsIn(g)).sort((a,b)=>setsIn(a)-setsIn(b))];
  const queue=groups.map(g=>FOCUS_GROUPS[g].exercises.filter(n=>EXERCISES[n]&&fits(n,gym)&&!painful.has(n)&&!inPlan.has(n)));
  let values=gym.values;const added=[];
  // One exercise per group in turn, at most four.
  for(let grew=true;grew&&added.length<4;){
    grew=false;
    for(const list of queue){
      while(list.length&&added.length<4){
        const name=list.shift();if(added.includes(name))continue;
        const next=placeExercise([...values,...newExerciseRows(name,gym).rows],name);
        if(next.length-7>100||estimate(next)>minutes)continue;
        values=next;added.push(name);grew=true;break;
      }
    }
  }
  if(!added.length)return null;
  const out=values.map(r=>Array.isArray(r)?r.slice():r),timingRow=out.findIndex(r=>r?.[0]==='Časový limit (min)'),after=estimate(out);
  if(timingRow>=0)out[timingRow]=['Časový limit (min)',minutes,'Odhad (min)',after];
  return {values:out,added,estimatedMinutes:after,name:L('Dnešní plán prodloužený na '+minutes+' min','Today\'s plan lengthened to '+minutes+' min')};
}

// Does the asked focus change the day's plan ("Dneska jen horní polovinu")?
// upper: the plan has legs; lower: it has upper-body work; named muscle
// groups: one of them is not in it yet. Core counts for neither half.
const LEGS=['quads','hamstrings','hips','calves'],CORE=['abs','obliques','lower_back'];
export function focusChanges(values,{focus=null,muscles=[]}={}){
  let parsed;try{parsed=parseStrengthPlan(values);}catch{return false;}
  const groups=new Set(parsed.rows.filter(r=>r.type==='WORK').flatMap(r=>Object.keys(FOCUS_GROUPS).filter(g=>FOCUS_GROUPS[g].exercises.includes(r.exercise))));
  if(muscles.length)return muscles.some(g=>FOCUS_GROUPS[g]&&!groups.has(g));
  const legs=LEGS.some(g=>groups.has(g)),upper=[...groups].some(g=>!LEGS.includes(g)&&!CORE.includes(g));
  // A plan of neither half (core only) changes with either.
  if(focus==='upper')return legs||!upper;
  if(focus==='lower')return upper||!legs;
  return false;
}
export const planStarted=values=>{try{return parseStrengthPlan(values).rows.some(started);}catch{return true;}};

// One exercise more for today: its usual sets, placed where it belongs.
export function prepareGymAdd(gym,toExercise,reason,memories=[],broken=[]){
  const parsed=parseStrengthPlan(gym.values);
  guardNew(toExercise,gym,parsed,memories,broken);
  const def=EXERCISES[toExercise],sets=addSets(toExercise),{estimate,rows:addedRows}=newExerciseRows(toExercise,gym);
  const after=placeExercise([...gym.values,...addedRows],toExercise);
  if(after.length-7>100)throw new Error(L('Přidáním by plán překročil 100 sérií.', 'Adding it would push the plan over 100 sets.'));
  const order=[...new Set(parseStrengthPlan(after).rows.filter(r=>r.type==='WORK').map(r=>r.exercise))];
  return {type:'gym_add',date:parsed.date,toExercise,reason,sets,reps:def.reps,kg:estimate.kg,position:order.indexOf(toExercise)+1,of:order.length,addedRows};
}
export function applyGymAdd(values,action){
  const parsed=parseStrengthPlan(values);
  if(parsed.date!==action.date||parsed.rows.some(r=>r.exercise===action.toExercise))throw new Error(L('Plán se mezitím změnil. Požádej o nový návrh.', 'The plan has changed in the meantime. Ask for a new proposal.'));
  const result=placeExercise([...values,...action.addedRows],action.toExercise);
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
  const drop=new Set(source.map(r=>r.planRow-1)),left=values.filter((_,i)=>!drop.has(i));
  // A superset partner left alone is no superset any more.
  const groups=new Map();for(const r of parseStrengthPlan(left).rows)if(r.superset)groups.set(r.superset,new Set([...(groups.get(r.superset)||[]),r.exercise]));
  const header=left.findIndex(r=>r?.[0]==='Typ'&&r?.[1]==='Cvik');
  return left.map((r,i)=>i>header&&groups.get(String(r?.[12]||'').trim())?.size===1?[...r.slice(0,12),'',...r.slice(13)]:r);
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
  const estimate=gymLoadEstimate(toExercise,gym.history||[],parsed.date)||{kg:null};
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
  return placeExercise(result,action.toExercise);
}

// A change to a gym session: a change word plus a gym word ("Vyměň dřep",
// "Uprav dnešní cvičení"). "Trénink" alone counts only on the open gym screen,
// so "Jiný trénink na kole" stays a ride request. [nň]/[dď]: "Změň", "Nahraď".
export const gymAdjustmentRequest=(message,appContext=null)=>{
  const m=String(message||'');
  return /(?:uprav|zm[eě][nň]|vym[eě][nň]|nahra[dď]|jin[eéýá]|alternativ|skladb|cvik|adjust|chang|swap|replac|different|alternative)/i.test(m)&&(/(?:gym|posil|cvi[cč]en|cvik|s[eé]ri|bench|d[řr]ep|mrtv|přítah|tlak|činky|stroj|exercise|lift|squat|deadlift|press|(?<!\p{L})rows?(?!\p{L})|dumbbell|barbell|machine|(?<!\p{L})sets?(?!\p{L}))/iu.test(m)||appContext?.sport==='gym'&&/tr[eé]nink|workout|session/i.test(m));
};
