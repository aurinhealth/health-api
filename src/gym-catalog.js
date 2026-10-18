import {EXERCISES} from './strength-generator.js';
import {EXERCISE_INTELLIGENCE,findExerciseAlternatives,estimateStartingLoad,resolveLoad} from './strength-intelligence.js';
import {L} from './lang.js';
import {normalizeExerciseName} from './strength-normalization.js';
import {availableAt,hasKnownStations,stationLabel} from './gym-equipment.js';
import {withoutDisliked} from './exercise-feedback.js';

const MUSCLES_CS={chest:'Hrudník',back:'Záda',shoulders:'Ramena',quads:'Přední stehna',hamstrings:'Zadní stehna',glutes:'Hýždě',biceps:'Biceps',triceps:'Triceps',core:'Střed těla',adductors:'Vnitřní stehna',abductors:'Vnější stehna',rear_delts:'Zadní ramena',side_delts:'Boční ramena',calves:'Lýtka',forearms:'Předloktí',traps:'Trapézy',lower_back:'Spodní záda'};
const MUSCLES_EN={chest:'Chest',back:'Back',shoulders:'Shoulders',quads:'Quads',hamstrings:'Hamstrings',glutes:'Glutes',biceps:'Biceps',triceps:'Triceps',core:'Core',adductors:'Adductors',abductors:'Abductors',rear_delts:'Rear delts',side_delts:'Side delts',calves:'Calves',forearms:'Forearms',traps:'Traps',lower_back:'Lower back'};
export const muscleLabel=id=>L(MUSCLES_CS,MUSCLES_EN)[id]||id;
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
  'Single-leg calf raise':'výpony jednonož lýtka jednoručka',
  'Barbell back squat':'dřep s osou klec stehna hýždě',
  'Barbell front squat':'čelní dřep osa klec stehna',
  'Smith machine squat':'dřep smith stroj stehna',
  'Smith machine split squat':'bulharský dřep smith hýždě výpad',
  'Smith machine hip thrust':'hip thrust smith hýždě zdvih pánve',
  'Smith machine incline press':'tlaky šikmá lavice smith horní prsa',
  'Barbell overhead press':'tlak osy nad hlavu ramena military press',
  'DB wrist curl':'předloktí zápěstí flexe úchop',
  'DB reverse wrist curl':'předloktí zápěstí extenze nadhmat',
  'Cable reverse curl':'předloktí obrácený bicepsový zdvih nadhmat kladka',
  'DB shrug':'trapézy krčení ramen jednoručky',
  'Barbell shrug':'trapézy krčení ramen osa',
  'Smith machine shrug':'trapézy krčení ramen smith',
  'Cable upright row':'trapézy přítah k bradě kladka ramena',
  'Barbell good morning':'spodní záda dobré ráno předklon osa',
  'Pull-up':'shyby hrazda nadhmat záda laty',
  'Chin-up':'shyby podhmat hrazda biceps záda laty',
  'Assisted pull-up':'asistované shyby stroj protizávaží záda laty',
  'Hanging leg raise':'přednožování ve visu hrazda břicho',
  'Dips':'kliky na bradlech dipy triceps prsa',
  'Assisted dip':'asistované kliky na bradlech dipy stroj protizávaží triceps',
  'Kettlebell swing':'kettlebell švihy swing hýždě kyčle',
  'EZ bar curl':'biceps ez osa bicepsový zdvih',
  'EZ bar skull crusher':'triceps francouzský tlak vleže ez osa lebka',
  'Preacher curl':'biceps scottova lavice ez osa',
  'Band pull-apart':'roztahování gumy zadní ramena lopatky guma',
  'Hack squat':'hack dřep stroj stehna',
  'Seated leg curl':'zakopávání vsedě hamstringy zadní stehna',
  'Glute kickback machine':'zanožování stroj kickback hýždě',
  'Seated calf raise':'výpony vsedě lýtka',
  'T-bar row':'t-bar přítah v předklonu záda',
  'Chest-supported row':'přítah s oporou hrudníku stroj záda veslování',
  'TRX row':'trx závěsný systém přítahy záda vlastní váha',
  'Barbell incline bench press':'šikmá lavice osa tlaky horní prsa benchpress',
  'Trap bar deadlift':'mrtvý tah trap bar šestihranná osa hýždě stehna',
  'Landmine press':'landmine tlak jednoruč ramena osa',
  'Medicine ball slam':'medicinbal slam hody o zem břicho výbušnost',
  'Box step-up':'výstupy na bednu box step up hýždě stehna',
  "Smith Machine Bench Press":"bench smith tlak prsa lavice",
  "Smith Machine Decline Bench Press":"negativní bench smith spodní prsa",
  "Inverted Row":"přítahy vlastní vahou inverted row smith záda",
  "Smith Machine Bent-Over Row":"přítah v předklonu smith záda veslování",
  "Smith Machine Overhead Press":"tlak nad hlavu smith ramena",
  "Smith Machine Seated Overhead Press":"tlak nad hlavu vsedě smith ramena",
  "Smith Machine Close Grip Bench Press":"úzký bench smith triceps",
  "Smith Machine Front Squat":"čelní dřep smith stehna",
  "Smith Machine Sumo Romanian Deadlift":"rumunský mrtvý tah sumo smith zadní stehna",
  "Smith Machine Calf Raise":"výpony lýtka smith",
  "Cable Bench Chest Fly":"rozpažování na lavici kladky prsa",
  "Cable Bench Press":"bench kladky tlak prsa",
  "Cable Chest Press":"tlak ve stoje kladky prsa",
  "Cable Decline Bench Press":"negativní tlak kladky spodní prsa",
  "Cable High-to-Low Fly":"rozpažování shora dolů kladky spodní prsa",
  "Cable Incline Bench Press":"šikmý tlak kladky horní prsa",
  "Cable Standing Single Arm Chest Press":"tlak jednoruč kladka prsa",
  "Single-Arm Cable Fly":"rozpažování jednoruč kladka prsa",
  "Cable Row Bar Standing Row":"přítah ve stoje tyč kladka záda",
  "Cable Supinating Row":"přítah s vytočením dlaně kladka záda",
  "Straight-Arm Lat Pulldown":"stahování napnutých paží kladka laty",
  "Straight Arm Rope Pulldown (Light)":"stahování lana napnuté paže laty",
  "Cable External Rotation":"zevní rotace ramene kladka rotátory",
  "Cable Front Raise":"předpažování kladka přední ramena",
  "Cable Overhead Press":"tlak nad hlavu kladky ramena",
  "Cable Single Arm Rear Delt Row":"přítah zadní ramena jednoruč kladka",
  "Leaning Cable Lateral Raise":"upažování v náklonu kladka boční ramena",
  "Cable Bar Pushdown":"stahování tyče triceps kladka",
  "Cable Overhead Straight Bar Extensions":"tricepsový tlak za hlavou tyč kladka",
  "Cross-Body Cable Tricep Extension":"triceps přes tělo kladka jednoruč",
  "Reverse-Grip Tricep Pushdown":"stahování podhmatem triceps kladka",
  "Single-Arm Overhead Cable Extension":"triceps za hlavou jednoruč kladka",
  "Cable Side Bend":"úklony kladka šikmé břicho",
  "Cable Single Arm Rope Pushdown":"stahování jednoruč lano triceps",
  "Machine Cable V Bar Push Downs":"stahování v tyč triceps",
  "Cable Standing Low To High Wood Chopper":"dřevorubec zespodu nahoru kladka rotace",
  "Cable Bench Straight Leg Kickback":"zanožování napnutá noha lavice kladka hýždě",
  "Cable 30 Degree Shrug":"krčení ramen kladky trapézy",
  "Cable Wrist Curl":"flexe zápěstí kladka předloktí",
  "Cable Bar Face Pull":"face pull tyč zadní ramena",
  "Cable Rope Kneeling Face Pull":"face pull v kleku lano",
  "Cable Seated Rope Face Pull":"face pull vsedě lano",
  "Cable Single Leg Laying Leg Curl":"zakopávání vleže kladka jednonož",
  "Cable Single Arm Underhand Grip Row":"přítah jednoruč podhmatem kladka",
  "Straight Bar Bench Mid Rows":"přítah tyče vsedě lavice kladka",
  "Decline Machine Chest Press":"negativní tlak stroj spodní prsa",
  "Incline Machine Chest Press":"šikmý tlak stroj horní prsa",
  "Neutral-Grip Lat Pulldown":"stahování neutrální úchop laty",
  "Single-Arm Lat Pulldown":"stahování jednoruč laty",
  "Wide-Grip Lat Pulldown":"stahování široký úchop laty",
  "Calf Press":"lýtka leg press výpony",
  "Single-Leg Press":"leg press jednonož stehna",
  "Reverse Hack Squat":"reverse hack dřep hýždě",
  "Machine Underhand Row":"přítah podhmatem stroj opora hrudníku",
  "Hammer Strength High Row":"high row stroj na kotouče laty",
  "Hammer Strength Iso-Lateral Row":"iso lateral row stroj na kotouče záda",
  "Machine Lat Pullover":"pullover stroj laty",
  "Machine Back Extension":"záklony vsedě stroj spodní záda",
  "Reverse Hyperextension":"reverse hyper zanožování hýždě",
  "Machine Preacher Curl":"bicepsový stroj scott",
  "Machine Tricep Extension":"tricepsový stroj vsedě",
  "Belt Squat":"belt squat dřep opasek",
  "Machine Crunch":"sklapovačky stroj břicho",
  "Captain's Chair Knee Raise":"zvedání kolen kapitánská židle břicho",
  "Selectorized Torso Rotation Machine":"rotace trupu stroj šikmé břicho"

};

export function gymExerciseCatalog(){
  // Every exercise whose stations the app knows (METAGYM Kutná Hora or the
  // usual equipment of other gyms), with the station; the app offers the
  // athlete those of their own gym (the stations of each exercise);
  // standardGym: METAGYM Kutná Hora (the "gym" preset) has it.
  return Object.entries(EXERCISES).filter(([name])=>EXERCISE_INTELLIGENCE[name]&&hasKnownStations(name)).map(([name,def])=>({name,muscle:muscleLabel(def.muscle),sets:def.sets,reps:def.reps,search:[searchTerms[name]||'',stationLabel(name)||''].join(' ').trim(),note:def.note||'',station:stationLabel(name),standardGym:availableAt(name)}));
}

// What can take the place of an exercise in the plan: the same muscle,
// possible in the gym, the most similar first, with the load from the
// athlete's own history (or a similar exercise) when there is one.
// The load for an exercise put into a plan by hand or by the AI coach, from
// the athlete's own history of it or of a variant (barbell squat → Smith
// squat). An exercise unlike anything done before stays without a weight.
export function gymLoadEstimate(exercise,history=[]){
  const name=normalizeExerciseName(exercise),def=EXERCISES[name];if(!def)return null;
  const estimate=estimateStartingLoad({exercise:name,history,targetReps:def.reps,fallbackKg:null});
  if(estimate.kg==null)return null;
  // From another exercise never more than twice the catalogue's start, as the
  // generator (Revize 2026-10-16, nález 21: a 150 kg back squat gave a 135 kg pendulum squat).
  const kg=estimate.source==='cross-exercise-estimate'&&def.baseKg>0?Math.min(estimate.kg,resolveLoad(name,def.baseKg*2)):estimate.kg;
  return {kg,source:estimate.source,reference:estimate.referenceExercise||null};
}
// Exercises the athlete gave a thumbs down (taste.disliked) are offered only
// when nothing else fits; liked ones come first among equally similar ones.
export function gymAlternatives(exercise,history=[],exclude=[],taste={}){
  const name=normalizeExerciseName(exercise),skip=new Set([name,...exclude.map(normalizeExerciseName)]);
  if(!EXERCISE_INTELLIGENCE[name])return [];
  const liked=new Set((taste.liked||[]).map(normalizeExerciseName));
  const found=findExerciseAlternatives(name,history).filter(a=>EXERCISES[a.name]&&availableAt(a.name)&&!skip.has(a.name));
  const ranked=withoutDisliked(found,taste.disliked,a=>a.name).map((a,i)=>({a,i})).sort((x,y)=>(x.i-(liked.has(x.a.name)?1.5:0))-(y.i-(liked.has(y.a.name)?1.5:0))).map(x=>x.a);
  return ranked.slice(0,8).map(a=>{
    const def=EXERCISES[a.name],estimate=gymLoadEstimate(a.name,history)||{kg:null,source:'no-reference'};
    return {name:a.name,muscle:muscleLabel(def.muscle),sets:def.sets,reps:def.reps,kg:estimate.kg??null,source:estimate.source,note:def.note||'',station:stationLabel(a.name)||'',warmup:Boolean(def.warmup)};
  });
}

export function findGymExercises(query,items=gymExerciseCatalog()){
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs').trim();
  const words=norm(query).split(/\s+/).filter(Boolean);
  return items.filter(item=>words.every(word=>norm([item.name,item.muscle,item.search].join(' ')).includes(word))).sort((a,b)=>a.name.localeCompare(b.name,'cs'));
}
