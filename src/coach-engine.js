import { trainingStatus } from './training-status.js';
import { todayGymContext } from './coach-gym-adjustment.js';
import { isQualityName } from './session-intensity.js';
import { parseIntervalsDescription } from './planned-detail.js';
import { L, plural } from './lang.js';
import { buildRideReview } from './ride-review.js';
import { buildGymReview } from './gym-review.js';
import { buildRunReview } from './run-review.js';
const n=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const txt=v=>String(v||'');
const isBike=x=>/ride|cycling|bike|kolo/i.test(txt(x?.name)+' '+txt(x?.type));
const isRun=x=>/^(Run|VirtualRun|TrailRun|Treadmill)/i.test(txt(x?.type));
const isGym=x=>/weight|strength|weights|posil|gym/i.test(txt(x?.name)+' '+txt(x?.type));
const isHard=x=>/threshold|vo2|interval|sweet spot|tempo/i.test(txt(x?.name))||isQualityName(x?.name);
function sleepFacts(sessions,date){
  const rows=sessions.filter(s=>n(s.durationMin)>=180&&(!date||!s.date||s.date<=date)).sort((a,b)=>txt(b.endTime||b.date).localeCompare(txt(a.endTime||a.date))).slice(0,7);
  const last=rows[0],day=last?.date||txt(last?.endTime).slice(0,10),fresh=!date||!day||day===date;
  // Whether this athlete's nights reach the app at all, and whether last night has arrived:
  // the morning card waits for it (and starts at the wake-up time when the night has one).
  return {last:fresh?n(last?.durationMin):null,avg:rows.length?rows.reduce((sum,s)=>sum+n(s.durationMin),0)/rows.length:null,
    tracked:rows.length>0,today:Boolean(last&&day===date),wokeAt:last&&day===date&&last.endTime?txt(last.endTime):null};
}
function rideFuel(hours,hard){
  const carbs=L(' g sacharidů/h',' g of carbs/h');
  if(hours>=3)return (hard?'70–90':'60–75')+carbs;
  if(hours>=1.5)return (hard?'50–70':'30–60')+carbs;
  if(hours>=1&&hard)return '30–45'+carbs+L(' podle pocitu',' as you feel');
  return null;
}
const sportTitle=(base,focus)=>base+(focus?.sportLabel?' · '+focus.sportLabel:'');
// What today actually holds: the Intervals.icu plan plus the app's own gym plan for the day.
// The morning advice speaks only about these sessions, by name, or says the day is free.
function planToday(planned,todayGym){
  const gymLeft=Boolean(todayGym?.exercises?.length&&!todayGym.exercises.every(e=>e.sets.every(x=>x.completed)));
  const endurance=planned.filter(p=>!isGym(p)&&txt(p.name).trim()),gym=gymLeft||planned.some(isGym);
  const names=[...endurance.map(p=>txt(p.name).trim()),...(gym?[planned.find(isGym)?.name?txt(planned.find(isGym).name).trim():L('Posilovna','Gym')]:[])];
  return {endurance,hard:endurance.find(isHard)||null,easy:endurance.find(p=>!isHard(p))||null,gym,names,empty:!names.length};
}
const quoted=name=>L('„'+name+'“','"'+name+'"');
function morningAdvice({plan,low,heavy,sleepLow}){
  const parts=[];
  if(low){
    if(plan.empty)return sleepLow?L('Dnes nemáš nic v plánu, a to se po kratší noci hodí. Dej si procházku nebo lehké protažení, jez pravidelně a jdi dnes dřív spát.','Nothing is planned today, which suits a short night. Go for a walk or stretch lightly, eat regularly and go to bed earlier tonight.'):L('Dnes nemáš nic v plánu, a to se při nízké formě hodí. Lehký pohyb a protažení stačí, tělo potřebuje dohnat únavu.','Nothing is planned today, which suits your low form. Light movement and stretching are enough; your body needs to absorb the fatigue.');
    if(plan.hard)parts.push(L('U ','For ')+quoted(plan.hard.name)+L(' uber jeden hlavní úsek nebo jeď úseky o 5 % níž; když se při rozcvičení necítíš, dej místo něj lehký trénink.',' drop one main effort or hold the efforts 5% lower; if the warm-up feels bad, do an easy session instead.'));
    if(plan.easy)parts.push(quoted(plan.easy.name)+L(' drž opravdu lehce, klidně o 15–20 minut kratší.',' keep truly easy, even 15–20 minutes shorter.'));
    if(plan.gym)parts.push(L('V posilovně uber u každého cviku jednu sérii a nech 2–3 opakování v rezervě.','In the gym drop one set per exercise and keep 2–3 reps in reserve.'));
    return parts.join(' ')+L(' Před tréninkem zapiš, jak se cítíš.',' Before training, log how you feel.');
  }
  if(heavy){
    if(plan.empty)return L('Po včerejší velké zátěži máš dnes volno, a to je přesně co potřebuješ. Lehká procházka, protažení a dost jídla stačí.','After yesterday\'s big load today is free, which is exactly what you need. An easy walk, stretching and enough food are plenty.');
    if(plan.hard)parts.push(L('Při rozcvičení na ','During the warm-up for ')+quoted(plan.hard.name)+L(' ověř, že nohy fungují; když ne, uber jeden úsek.',' check that your legs respond; if not, drop one effort.'));
    if(plan.easy)parts.push(quoted(plan.easy.name)+L(' drž lehce, ať tělo dožene včerejšek.',' keep easy so your body can absorb yesterday.'));
    if(plan.gym)parts.push(L('V posilovně nech 2 opakování v rezervě.','In the gym keep 2 reps in reserve.'));
    return L('Po včerejší velké zátěži začni zvolna. ','After yesterday\'s big load, start easy. ')+parts.join(' ');
  }
  if(plan.empty)return L('Dnes nemáš nic v plánu: prostor pro regeneraci. Další aktivitu přizpůsob chuti a času, který máš.','Nothing is planned today: room to recover. Fit any activity to your mood and the time you have.');
  return L('Dnešní plán (','You can stick to today\'s plan (')+plan.names.join(', ')+L(') můžeš dodržet; při rozcvičení ověř, že se cítíš dobře.','); check during the warm-up that you feel good.');
}
function morningSummary({date,sleep,fitness,yesterday,planned,policy,todayGym}){
  const facts=[],previous=yesterday?.training?.completed||[],plan=planToday(planned,todayGym);
  if(sleep.last!=null){
    const delta=sleep.avg==null?null:Math.round(sleep.last-sleep.avg);
    facts.push(L('Spánek ','Sleep ')+Math.floor(Math.round(sleep.last)/60)+' h '+Math.round(sleep.last)%60+' min'+(delta!=null&&Math.abs(delta)>=30?' ('+Math.abs(delta)+' min '+(delta<0?L('méně než obvykle','less than usual'):L('více než obvykle','more than usual'))+')':'')+'.');
  }
  const load=previous.map(a=>n(a.tss)).filter(v=>v!=null),minutes=previous.reduce((sum,a)=>sum+(n(a.durationHours)||0)*60,0);
  if(previous.length)facts.push(L('Včera ','Yesterday ')+previous.length+' '+plural(previous.length,'aktivita','aktivity','aktivit','activity','activities')+(minutes>0?' · '+Math.round(minutes)+' min':'')+(load.length?' · '+Math.round(load.reduce((a,b)=>a+b,0))+' TSS':'')+'.');
  if(n(fitness.tsb)!=null)facts.push(L('Aktuální forma ','Current form ')+Math.round(n(fitness.tsb))+'.');
  if(!facts.length&&!policy.paused)return null;
  facts.push(plan.empty?L('Dnes nemáš nic v plánu.','Nothing planned today.'):L('Dnes v plánu: ','Planned today: ')+plan.names.join(', ')+'.');
  const sleepLow=sleep.last!=null&&sleep.last<360,low=sleepLow||n(fitness.tsb)!=null&&n(fitness.tsb)<-25,heavy=load.reduce((a,b)=>a+b,0)>150||minutes>=180;
  const next=policy.paused?policy.guidance[0]:morningAdvice({plan,low,heavy,sleepLow});
  return {date,headline:policy.paused?policy.label+L(' · dnešní přehled',' · today\'s overview'):low&&plan.empty?L('Den na odpočinek','A day to recover'):low?L('Dnes s větší rezervou','Take it easier today'):heavy?L('Navazujeme na náročný včerejšek','Following a demanding yesterday'):L('Jak dnes začít','How to start today'),text:facts.join(' '),recommendation:next,plan:{empty:plan.empty,names:plan.names},sleepSync:{tracked:Boolean(sleep.tracked),today:Boolean(sleep.today),wokeAt:sleep.wokeAt||null}};
}
const dec=(v,d=1)=>{const s=String(Math.round(v*10**d)/10**d);return L(s.replace('.',','),s);};
const pctRange=(lo,hi)=>hi!=null&&hi!==lo?Math.round(lo)+'–'+Math.round(hi)+' % FTP':Math.round(lo)+' % FTP';
const wattRange=(lo,hi,ftp)=>ftp?' ('+(hi!=null&&hi!==lo?Math.round(lo/100*ftp)+'–'+Math.round(hi/100*ftp):Math.round(lo/100*ftp))+' W)':'';
const stepLow=s=>n(s.powerLow??s.powerStart??s.power),stepHigh=s=>n(s.powerHigh??s.powerEnd);
// What the session is for, in one sentence the rider can act on.
function ridePurpose(ride){
  const name=txt(ride.name).toLowerCase()+' '+txt(ride.description).toLowerCase();
  if(/recovery|regener|easy spin|lehce/.test(name))return L('Cíl: prokrvit nohy a urychlit regeneraci. Tep i výkon drž nízko, žádné úseky navíc.','Goal: get blood flowing to the legs and speed up recovery. Keep heart rate and power low, no extra efforts.');
  if(/vo2|vo₂/.test(name))return L('Cíl: VO₂max. Krátké tvrdé úseky na hranici udržitelného výkonu, mezi nimi opravdu lehce.','Goal: VO₂max. Short hard efforts at the limit of what you can sustain, truly easy in between.');
  if(/threshold|práh|prah|ftp/.test(name))return L('Cíl: posunout FTP. Bloky drž na hraně udržitelného výkonu, ne nad ní.','Goal: raise FTP. Hold the blocks at the edge of sustainable power, not above it.');
  if(/sweet ?spot/.test(name))return L('Cíl: zvednout FTP s menší únavou než u prahu. Stabilní výkon, plynulá kadence.','Goal: raise FTP with less fatigue than threshold work. Steady power, smooth cadence.');
  if(/tempo/.test(name))return L('Cíl: svalová vytrvalost v tempu. Výkon drž rovnoměrně, bez výkyvů do prahu.','Goal: muscular endurance at tempo. Keep power even, without surges to threshold.');
  if(/long|dlouh/.test(name))return L('Cíl: aerobní základ a vytrvalost na dlouhé trati. Začni lehce a jez od první hodiny.','Goal: aerobic base and long-distance endurance. Start easy and eat from the first hour.');
  return L('Cíl: aerobní základ. Tempo, ve kterém zvládneš mluvit v celých větách.','Goal: aerobic base. A pace at which you can talk in full sentences.');
}
// The main set and the cadence work, read from the Intervals.icu workout text.
function rideStructure(ride,ftp){
  let blocks=[];try{blocks=parseIntervalsDescription(ride.description||'');}catch{blocks=[];}
  const out=[],repeat=blocks.filter(b=>b.steps&&n(b.repeats)>1).sort((a,b)=>Math.max(...b.steps.map(x=>stepLow(x)||0))-Math.max(...a.steps.map(x=>stepLow(x)||0)))[0];
  const work=repeat&&[...repeat.steps].sort((a,b)=>(stepLow(b)||0)-(stepLow(a)||0))[0],rest=work&&repeat.steps.find(x=>x!==work);
  // A repeat is a set of intervals only when its work part is clearly above the easy part.
  const intervals=work&&stepLow(work)!=null&&(stepLow(work)>=76||rest&&stepLow(rest)!=null&&stepLow(work)-stepLow(rest)>=10);
  if(intervals){
    out.push(L('Hlavní část: ','Main set: ')+repeat.repeats+'× '+dec(work.durationMinutes,0)+' min · '+pctRange(stepLow(work),stepHigh(work))+wattRange(stepLow(work),stepHigh(work),ftp)+(rest?L(', mezi úseky ',', ')+dec(rest.durationMinutes,0)+L(' min lehce',' min easy between efforts'):'')+'.');
  }else{
    // Steady ride: the power range of everything between warm-up and cool-down.
    const main=(blocks.length>2?blocks.slice(1,-1):blocks).flatMap(b=>b.steps||[b]).filter(x=>stepLow(x)!=null),minutes=main.reduce((sum,x)=>sum+n(x.durationMinutes),0)*(main.length?1:0);
    const lo=main.length?Math.min(...main.map(stepLow)):null,hi=main.length?Math.max(...main.map(x=>stepHigh(x)??stepLow(x))):null;
    const repeats=blocks.filter(b=>b.steps).reduce((m,b)=>m+(n(b.repeats)||1)*b.steps.reduce((x,y)=>x+n(y.durationMinutes),0)-b.steps.reduce((x,y)=>x+n(y.durationMinutes),0),0);
    if(lo!=null&&minutes+repeats>=10)out.push(L('Hlavní část: ','Main set: ')+dec(minutes+repeats,0)+L(' min rovnoměrně · ',' min steady · ')+pctRange(lo,hi)+wattRange(lo,hi,ftp)+'.');
  }
  const steps=blocks.flatMap(b=>b.steps?b.steps.map(x=>({...x,repeats:n(b.repeats)||1})):[{...b,repeats:1}]),cad=steps.find(x=>x.cadence&&/^\d/.test(String(x.cadence))&&Number(String(x.cadence).split('–')[0])>=95);
  if(cad)out.push(L('Kadence: ','Cadence: ')+(cad.repeats>1?cad.repeats+'× ':'')+dec(cad.durationMinutes,0)+L(' min na ',' min at ')+cad.cadence+L(' rpm. Točíš rychleji, netlačíš víc – výkon zůstává lehký.',' rpm. Spin faster, don\'t push harder – the power stays easy.'));
  return out;
}
function bikeCoach(c,ride){
  const low=c.sleep.last!=null&&c.sleep.last<360||n(c.fitness.tsb)!=null&&n(c.fitness.tsb)<-25,hard=isHard(ride),t=c.thresholds||{};
  const indoor=/virtual|indoor|trainer|zwift|trenaž/i.test(txt(ride.type)+' '+txt(ride.name)),ftp=indoor?(n(t.indoorFtp)||(n(t.ftp)?Math.round(n(t.ftp)*.95):null)):n(t.ftp);
  const minutes=Math.round((n(ride.durationHours)||0)*60),tss=n(ride.tss),intensity=tss&&minutes?Math.sqrt(tss/(minutes/60*100)):null;
  const actions=[low&&hard?L('Slabší regenerace: zvaž lehkou variantu bez intervalů; rozhodni podle pocitu při rozjetí.','Weaker recovery: consider an easy version without intervals; decide by how you feel during the warm-up.'):hard?L('Drž předepsané pracovní bloky a mezi nimi lehce regeneruj.','Hold the prescribed work blocks and recover easily between them.'):low?L('Po slabší noci jeď spíš ve spodní části pásma a délku zkrať, pokud se nohy nerozjedou.','After a poor night, ride in the lower part of the zone and cut the ride short if your legs don\'t come around.'):L('Drž rovnoměrné vytrvalostní tempo, bez přidaných intenzivních úseků.','Hold a steady endurance pace without adding intense efforts.')];
  actions.push(ridePurpose(ride),...rideStructure(ride,ftp));
  if(!hard&&n(t.lthr))actions.push(L('Tep drž do ~','Keep heart rate under ~')+Math.round(n(t.lthr)*.89)+L(' bpm (horní hranice Z2 z tvého prahového tepu ',' bpm (top of Z2 from your threshold heart rate of ')+Math.round(n(t.lthr))+' bpm).');
  if(minutes||tss)actions.push(L('Plán: ','Plan: ')+[minutes?minutes+' min':null,tss?'TSS '+Math.round(tss):null,intensity?'IF '+dec(intensity,2):null,ftp?(indoor?'indoor FTP ':'FTP ')+ftp+' W':null].filter(Boolean).join(' · ')+'.');
  return {id:'cycling',title:sportTitle(L('Vytrvalostní trenér','Endurance coach'),c.focus),phase:'before',status:low?'caution':'ready',headline:ride.name||L('Dnešní jízda','Today\'s ride'),actions,confidence:ride.name?'high':'medium'};
}
function gymCoach(c,workout){
  const low=c.sleep.last!=null&&c.sleep.last<360,hardRide=c.training.planned.some(a=>isBike(a)&&isHard(a)),actions=[];
  if(c.todayGym?.exercises?.length)actions.push(L('Dnes: ','Today: ')+c.todayGym.exercises.map(e=>{const left=e.sets.filter(s=>!s.completed).length;return e.name+' ('+left+' '+plural(left,'série','série','sérií','set','sets')+')';}).join(', ')+'.');
  if(low)actions.push(L('Po krátkém spánku uber jednu pracovní sérii na cvik a nech si 2–3 opakování v rezervě.','After a short night, drop one work set per exercise and keep 2–3 reps in reserve.'));
  else if(hardRide)actions.push(L('Vedle náročné vytrvalostní jednotky nech 2–3 opakování v rezervě. U zatížených svalů uprav dávku, ale zachovej silový stimul.','Next to a hard endurance session, keep 2–3 reps in reserve. Reduce the dose for already loaded muscles but keep the strength stimulus.'));
  else actions.push(L('Drž plánované série. Zátěž přidej, až zvládneš horní hranici opakování s čistou technikou a rezervou.','Stick to the planned sets. Add weight once you reach the top of the rep range with clean technique and reps in reserve.'));
  return {id:'gym',title:sportTitle(L('Silový trenér','Strength coach'),c.focus),phase:'before',status:low?'caution':'ready',headline:workout.name||L('Dnešní posilování','Today\'s strength session'),actions,confidence:'high'};
}
function nutritionCoach(c,done,paused){
  const intake=n(c.food.kcal),target=n(c.nutrition?.calorieTarget),ride=c.training.planned.find(isBike),hours=n(ride?.durationHours),fuel=ride&&!paused?rideFuel(hours,isHard(ride)):null;
  if(!(intake>0)&&!fuel&&!done.length)return null;
  const actions=[];
  if(intake>0&&target>0)actions.push(L('Zapsáno ','Logged ')+Math.round(intake)+' / '+Math.round(target)+' kcal · '+L('zbývá ','')+Math.round(Math.max(0,target-intake))+L(' kcal.',' kcal left.'));
  else if(intake>0)actions.push(L('Zapsáno ','Logged ')+Math.round(intake)+L(' kcal. Denní cíl zatím není k dispozici.',' kcal. The daily goal is not available yet.'));
  if(fuel)actions.push(L('Na '+Math.round(hours*60)+'min jízdu počítej s '+fuel+'. Palivo během aktivity je součástí denního příjmu.','For a '+Math.round(hours*60)+'-minute ride, plan on '+fuel+'. Fuel during the activity counts toward your daily intake.'));
  if(done.length){
    const energy=done.map(a=>n(a.calories)).filter(v=>v!=null),names=done.map(a=>a.name||a.type).join(', '),kcal=energy.length?Math.round(energy.reduce((a,b)=>a+b,0)):null;
    actions.push(L('Po aktivitě '+names+(kcal!=null?' · '+kcal+' kcal zaznamenaného výdeje':'')+': doplň běžné jídlo s bílkovinami a sacharidy. Výdej už je započtený v denním cíli.','After '+names+(kcal!=null?' · '+kcal+' kcal of recorded expenditure':'')+': have a regular meal with protein and carbs. The expenditure is already included in your daily goal.'));
  }
  const protein=n(c.nutrition?.macros?.protein_g??c.nutrition?.macros?.proteinGrams),loggedProtein=n(c.food.protein_g);
  if(intake>0&&protein>0&&loggedProtein!=null&&protein-loggedProtein>20)actions.push(L('Do cíle bílkovin zbývá '+Math.round(protein-loggedProtein)+' g; rozlož je do zbývajících jídel.',Math.round(protein-loggedProtein)+' g of protein left; spread it over your remaining meals.'));
  if(paused)actions.splice(1,0,L('Aktuální stav pozastavuje běžné tréninky; zbývající plán v kalendáři neber jako doporučení ho dnes absolvovat.','Your current status pauses regular training; the remaining plan in the calendar is not a recommendation to do it today.'));
  return {id:'nutrition',title:sportTitle(L('Sportovní výživa','Sports nutrition'),c.focus),status:intake>0?'tracking':'ready',phase:done.length?'after':ride?'before':'rest',headline:done.length?L('Po aktivitě · doplnění energie','After activity · refuel'):fuel?L('Palivo pro dnešní jízdu','Fuel for today\'s ride'):L('Zbývající příjem','Remaining intake'),actions:actions.slice(0,4),confidence:intake>0?'high':'medium'};
}
function activityReview(a,matched,input={}){
  const plan=matched.find(m=>String(m.actualId)===String(a.id))?.planned;
  // A ride is set against its planned steps and the day's recovery (ride-review.js).
  if(isBike(a)){
    const r=buildRideReview({activity:a,detail:input.rideDetails?.[a.id]||null,plan,wellness:input.wellness||[],fitness:input.fitness||{},date:input.date||input.daily?.date});
    return {id:'review-'+a.id,title:L('Kolo · hodnocení jízdy','Bike · ride review'),headline:a.name||L('Dokončená jízda','Completed ride'),phase:'after',status:'tracking',actions:r.actions,verdict:r.verdict,target:r.target,table:r.table,chart:r.chart,sections:r.sections,analysis:[],confidence:r.table?'high':'medium'};
  }
  if(isRun(a)){
    const r=buildRunReview({activity:a,detail:input.rideDetails?.[a.id]||null,plan,wellness:input.wellness||[],fitness:input.fitness||{},date:input.date||input.daily?.date,thresholdPace:input.thresholds?.runThresholdPace});
    return {id:'review-'+a.id,title:L('Běh · hodnocení','Run · review'),headline:a.name||L('Dokončený běh','Completed run'),phase:'after',status:'tracking',actions:r.actions,verdict:r.verdict,target:r.target,table:r.table,chart:r.chart,sections:r.sections,analysis:[],confidence:r.table?'high':'medium'};
  }
  if(isGym(a)&&input.gymReview)return gymReviewCard(input.gymReview,a.name,a.id);
  const h=n(a.durationHours),tss=n(a.tss),calories=n(a.calories),actions=[];
  const measured=[h>0?Math.round(h*60)+' min':null,tss!=null?Math.round(tss)+' TSS':null,calories!=null?Math.round(calories)+' kcal':null].filter(Boolean);
  if(measured.length)actions.push(L('Dokončeno: ','Completed: ')+measured.join(' · ')+'.');
  if(plan&&n(plan.tss)>0&&tss!=null)actions.push(L('Zátěž oproti plánu: ','Load vs. plan: ')+Math.round(tss/n(plan.tss)*100)+' %.'+(tss/n(plan.tss)>1.15?L(' Vyšší zátěž zohledni u zbývajících jednotek.',' Take the higher load into account in the remaining sessions.'):''));
  else if(!plan)actions.push(L('Bez spárovaného plánu nelze vyhodnotit, jak byl splněn.','Without a matched plan, completion can\'t be assessed.'));
  const p=a.payload||{},np=n(p.icu_normalized_watts||p.icu_weighted_average_watts),ftp=n(p.icu_ftp),analysis=[];
  if(plan&&n(plan.durationHours)>0&&h!=null)analysis.push({label:L('Délka oproti plánu','Duration vs. plan'),text:Math.round(h*60)+' / '+Math.round(n(plan.durationHours)*60)+L(' min. Samotná délka nepotvrzuje, že byly odjeté intervaly.',' min. Duration alone doesn\'t confirm the intervals were done.')});
  if(np>0&&ftp>0)analysis.push({label:L('Intenzita','Intensity'),text:'IF '+(np/ftp).toFixed(2)+' · NP '+Math.round(np)+' W · FTP '+Math.round(ftp)+' W.'});
  return {id:'review-'+a.id,title:isBike(a)?L('Kolo · hodnocení jízdy','Bike · ride rating'):L('Posilovna · dokončený trénink','Gym · completed workout'),headline:a.name||L('Dokončená aktivita','Completed activity'),phase:'after',status:'tracking',actions,analysis,confidence:'medium'};
}
function gymReviewCard(r,name,id){
  return {id:'review-'+id,title:L('Posilovna · hodnocení tréninku','Gym · session review'),headline:name||L('Posilovna','Gym'),phase:'after',status:'tracking',actions:r.actions,verdict:r.verdict,table:r.table,sets:r.sets,sections:r.sections,analysis:[],confidence:'high'};
}
export function buildCoachCouncil(input){
  const date=input.date||input.daily?.date,daily=input.daily||{},training=daily.training||{},completed=training.completed||[],matched=training.matched||[],used=new Set(),policy=trainingStatus(input.athleteState);
  const planned=(training.planned||[]).filter(p=>{
    if(matched.some(m=>String(m.planned?.id)===String(p.id)&&p.id!=null))return false;
    const found=completed.find(a=>!used.has(a.id)&&(p.id!=null&&String(a.pairedEventId||a.plannedEventId)===String(p.id)||txt(p.name).trim()&&txt(p.name).trim().toLowerCase()===txt(a.name).trim().toLowerCase()));
    if(found){used.add(found.id);return false;}return true;
  });
  const c={...daily,training:{...training,planned,completed:[]},sleep:sleepFacts(input.sleepSessions||[],date),fitness:input.fitness||{},food:daily.nutrition?.foodLog?.totals||{},focus:input.focus,todayGym:input.gym?todayGymContext(input.gym,date):null,thresholds:input.thresholds||null};
  const coaches=[],bike=planned.find(isBike),gym=planned.find(isGym);
  if(policy.paused)coaches.push({id:'athlete-status',title:L('Aktuální stav','Current status'),status:'recovery',headline:policy.headline,phase:'rest',confidence:'high',actions:[policy.guidance[0],...(policy.note?[L('Tvoje omezení: ','Your limitations: ')+policy.note]:[])]});
  // A gym session logged in the app is reviewed from its sets, with or without a watch activity;
  // once every set is done, the review replaces the preparation card.
  input={...input,gymReview:input.gym&&date&&!input.ahead?buildGymReview({values:input.gym.values,history:input.strengthHistory||[],date,wellness:input.wellness||[]}):null};
  const gymDone=input.gymReview&&c.todayGym?.exercises?.length&&c.todayGym.exercises.every(e=>e.sets.every(x=>x.completed));
  if(!policy.paused){if(bike)coaches.push(bikeCoach(c,bike));if(gym&&!gymDone)coaches.push(gymCoach(c,gym));}
  const reviews=completed.filter(a=>isBike(a)||isGym(a)||isRun(a)).map(a=>activityReview(a,matched,input));
  if(input.gymReview&&!reviews.some(r=>r.sets))reviews.push(gymReviewCard(input.gymReview,input.gym.values?.[2]?.[3]||null,'gym-'+date));
  const fuel=nutritionCoach(c,completed.filter(a=>isBike(a)||isGym(a)),policy.paused);
  if(fuel)coaches.push(fuel);
  return {version:'adaptive-coach-council-v4',generatedAt:new Date().toISOString(),morningSummary:input.ahead?null:morningSummary({date,sleep:c.sleep,fitness:c.fitness,yesterday:input.yesterday,planned,policy,todayGym:c.todayGym}),priorities:coaches.map(c=>c.headline+': '+c.actions[0]).slice(0,3),coaches,reviews};
}
