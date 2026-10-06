import { trainingStatus } from './training-status.js';
import { todayGymContext } from './coach-gym-adjustment.js';
import { isQualityName } from './session-intensity.js';
import { parseIntervalsDescription } from './planned-detail.js';
const n=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const txt=v=>String(v||'');
const isBike=x=>/ride|cycling|bike|kolo/i.test(txt(x?.name)+' '+txt(x?.type));
const isGym=x=>/weight|strength|weights|posil|gym/i.test(txt(x?.name)+' '+txt(x?.type));
const isHard=x=>/threshold|vo2|interval|sweet spot|tempo/i.test(txt(x?.name))||isQualityName(x?.name);
function sleepFacts(sessions,date){
  const rows=sessions.filter(s=>n(s.durationMin)>=180&&(!date||!s.date||s.date<=date)).sort((a,b)=>txt(b.endTime||b.date).localeCompare(txt(a.endTime||a.date))).slice(0,7);
  const last=rows[0],fresh=!date||!last?.date||last.date===date;
  return {last:fresh?n(last?.durationMin):null,avg:rows.length?rows.reduce((sum,s)=>sum+n(s.durationMin),0)/rows.length:null};
}
function rideFuel(hours,hard){
  if(hours>=3)return hard?'70–90 g sacharidů/h':'60–75 g sacharidů/h';
  if(hours>=1.5)return hard?'50–70 g sacharidů/h':'30–60 g sacharidů/h';
  if(hours>=1&&hard)return '30–45 g sacharidů/h podle pocitu';
  return null;
}
const sportTitle=(base,focus)=>base+(focus?.sportLabel?' · '+focus.sportLabel:'');
function morningSummary({date,sleep,fitness,yesterday,planned,policy}){
  const facts=[],previous=yesterday?.training?.completed||[];
  if(sleep.last!=null){
    const delta=sleep.avg==null?null:Math.round(sleep.last-sleep.avg);
    facts.push('Spánek '+Math.floor(Math.round(sleep.last)/60)+' h '+Math.round(sleep.last)%60+' min'+(delta!=null&&Math.abs(delta)>=30?' ('+Math.abs(delta)+' min '+(delta<0?'méně':'více')+' než poslední průměr)':'')+'.');
  }
  const load=previous.map(a=>n(a.tss)).filter(v=>v!=null),minutes=previous.reduce((sum,a)=>sum+(n(a.durationHours)||0)*60,0);
  if(previous.length)facts.push('Včera '+previous.length+' '+(previous.length===1?'aktivita':'aktivity')+(minutes>0?' · '+Math.round(minutes)+' min':'')+(load.length?' · '+Math.round(load.reduce((a,b)=>a+b,0))+' TSS':'')+'.');
  if(n(fitness.tsb)!=null)facts.push('Aktuální forma '+Math.round(n(fitness.tsb))+'.');
  if(!facts.length&&!policy.paused)return null;
  const low=sleep.last!=null&&sleep.last<360||n(fitness.tsb)!=null&&n(fitness.tsb)<-25,heavy=load.reduce((a,b)=>a+b,0)>150||minutes>=180;
  const next=policy.paused?policy.guidance[0]:low?'Dnes drž rezervu: u posilování uber sérii, u vytrvalosti zvol lehké tempo. Před těžkou jednotkou doplň, jak se cítíš.':heavy?'Po včerejší velké zátěži začni klidně; podle pocitu uprav objem a nech rezervu.':planned.length?'Dnešní plán můžeš držet; při rozcvičení ověř, že se cítíš dobře.':'Dnes máš prostor pro regeneraci; další aktivitu přizpůsob chuti a dostupnému času.';
  return {date,headline:policy.paused?policy.label+' · dnešní přehled':low?'Dnes s větší rezervou':heavy?'Navazujeme na náročný včerejšek':'Jak dnes začít',text:facts.join(' '),recommendation:next};
}
const dec=(v,d=1)=>String(Math.round(v*10**d)/10**d).replace('.',',');
const pctRange=(lo,hi)=>hi!=null&&hi!==lo?Math.round(lo)+'–'+Math.round(hi)+' % FTP':Math.round(lo)+' % FTP';
const wattRange=(lo,hi,ftp)=>ftp?' ('+(hi!=null&&hi!==lo?Math.round(lo/100*ftp)+'–'+Math.round(hi/100*ftp):Math.round(lo/100*ftp))+' W)':'';
const stepLow=s=>n(s.powerLow??s.powerStart??s.power),stepHigh=s=>n(s.powerHigh??s.powerEnd);
// What the session is for, in one sentence the rider can act on.
function ridePurpose(ride){
  const name=txt(ride.name).toLowerCase()+' '+txt(ride.description).toLowerCase();
  if(/recovery|regener|easy spin|lehce/.test(name))return 'Cíl: prokrvit nohy a urychlit regeneraci. Tep i výkon drž nízko, žádné úseky navíc.';
  if(/vo2|vo₂/.test(name))return 'Cíl: VO₂max. Krátké tvrdé úseky naplno udržitelného výkonu, mezi nimi opravdu lehce.';
  if(/threshold|práh|prah|ftp/.test(name))return 'Cíl: posunout FTP. Bloky drž na hraně udržitelného výkonu, ne nad ní.';
  if(/sweet ?spot/.test(name))return 'Cíl: zvednout FTP s menší únavou než u prahu. Stabilní výkon, plynulá kadence.';
  if(/tempo/.test(name))return 'Cíl: svalová vytrvalost v tempu. Výkon drž rovnoměrně, bez výkyvů do prahu.';
  if(/long|dlouh/.test(name))return 'Cíl: aerobní základ a vytrvalost na dlouhé trati. Začni lehce a jez od první hodiny.';
  return 'Cíl: aerobní základ. Tempo, ve kterém zvládneš mluvit v celých větách.';
}
// The main set and the cadence work, read from the Intervals.icu workout text.
function rideStructure(ride,ftp){
  let blocks=[];try{blocks=parseIntervalsDescription(ride.description||'');}catch{blocks=[];}
  const out=[],repeat=blocks.filter(b=>b.steps&&n(b.repeats)>1).sort((a,b)=>Math.max(...b.steps.map(x=>stepLow(x)||0))-Math.max(...a.steps.map(x=>stepLow(x)||0)))[0];
  const work=repeat&&[...repeat.steps].sort((a,b)=>(stepLow(b)||0)-(stepLow(a)||0))[0],rest=work&&repeat.steps.find(x=>x!==work);
  // A repeat is a set of intervals only when its work part is clearly above the easy part.
  const intervals=work&&stepLow(work)!=null&&(stepLow(work)>=76||rest&&stepLow(rest)!=null&&stepLow(work)-stepLow(rest)>=10);
  if(intervals){
    out.push('Hlavní část: '+repeat.repeats+'× '+dec(work.durationMinutes,0)+' min · '+pctRange(stepLow(work),stepHigh(work))+wattRange(stepLow(work),stepHigh(work),ftp)+(rest?', mezi úseky '+dec(rest.durationMinutes,0)+' min lehce':'')+'.');
  }else{
    // Steady ride: the power range of everything between warm-up and cool-down.
    const main=(blocks.length>2?blocks.slice(1,-1):blocks).flatMap(b=>b.steps||[b]).filter(x=>stepLow(x)!=null),minutes=main.reduce((sum,x)=>sum+n(x.durationMinutes),0)*(main.length?1:0);
    const lo=main.length?Math.min(...main.map(stepLow)):null,hi=main.length?Math.max(...main.map(x=>stepHigh(x)??stepLow(x))):null;
    const repeats=blocks.filter(b=>b.steps).reduce((m,b)=>m+(n(b.repeats)||1)*b.steps.reduce((x,y)=>x+n(y.durationMinutes),0)-b.steps.reduce((x,y)=>x+n(y.durationMinutes),0),0);
    if(lo!=null&&minutes+repeats>=10)out.push('Hlavní část: '+dec(minutes+repeats,0)+' min rovnoměrně · '+pctRange(lo,hi)+wattRange(lo,hi,ftp)+'.');
  }
  const steps=blocks.flatMap(b=>b.steps?b.steps.map(x=>({...x,repeats:n(b.repeats)||1})):[{...b,repeats:1}]),cad=steps.find(x=>x.cadence&&/^\d/.test(String(x.cadence))&&Number(String(x.cadence).split('–')[0])>=95);
  if(cad)out.push('Kadence: '+(cad.repeats>1?cad.repeats+'× ':'')+dec(cad.durationMinutes,0)+' min na '+cad.cadence+' rpm. Točíš rychleji, netlačíš víc – výkon zůstává lehký.');
  return out;
}
function bikeCoach(c,ride){
  const low=c.sleep.last!=null&&c.sleep.last<360||n(c.fitness.tsb)!=null&&n(c.fitness.tsb)<-25,hard=isHard(ride),t=c.thresholds||{};
  const indoor=/virtual|indoor|trainer|zwift|trenaž/i.test(txt(ride.type)+' '+txt(ride.name)),ftp=indoor?(n(t.indoorFtp)||(n(t.ftp)?Math.round(n(t.ftp)*.95):null)):n(t.ftp);
  const minutes=Math.round((n(ride.durationHours)||0)*60),tss=n(ride.tss),intensity=tss&&minutes?Math.sqrt(tss/(minutes/60*100)):null;
  const actions=[low&&hard?'Slabší regenerace: zvaž lehkou variantu bez intervalů; rozhodni podle pocitu při rozjetí.':hard?'Drž předepsané pracovní bloky a mezi nimi lehce regeneruj.':low?'Po slabší noci jeď spíš ve spodní části pásma a délku zkrať, pokud se nohy nerozjedou.':'Drž rovnoměrné vytrvalostní tempo, bez přidaných intenzivních úseků.'];
  actions.push(ridePurpose(ride),...rideStructure(ride,ftp));
  if(!hard&&n(t.lthr))actions.push('Tep drž do ~'+Math.round(n(t.lthr)*.89)+' bpm (horní hranice Z2 z tvého prahového tepu '+Math.round(n(t.lthr))+' bpm).');
  if(minutes||tss)actions.push('Plán: '+[minutes?minutes+' min':null,tss?'TSS '+Math.round(tss):null,intensity?'IF '+dec(intensity,2):null,ftp?(indoor?'indoor FTP ':'FTP ')+ftp+' W':null].filter(Boolean).join(' · ')+'.');
  return {id:'cycling',title:sportTitle('Vytrvalostní trenér',c.focus),phase:'before',status:low?'caution':'ready',headline:ride.name||'Dnešní jízda',actions,confidence:ride.name?'high':'medium'};
}
function gymCoach(c,workout){
  const low=c.sleep.last!=null&&c.sleep.last<360,hardRide=c.training.planned.some(a=>isBike(a)&&isHard(a)),actions=[];
  if(c.todayGym?.exercises?.length)actions.push('Dnes: '+c.todayGym.exercises.map(e=>e.name+' ('+e.sets.filter(s=>!s.completed).length+' sérií)').join(', ')+'.');
  if(low)actions.push('Po krátkém spánku uber jednu pracovní sérii na cvik a nech 2–3 opakování v rezervě.');
  else if(hardRide)actions.push('Vedle náročné vytrvalostní jednotky nech 2–3 opakování v rezervě. U zatížených svalů uprav dávku, zachovej silový stimul.');
  else actions.push('Drž plánované série. Zátěž přidej až po zvládnutí horní hranice opakování s čistou technikou a rezervou.');
  return {id:'gym',title:sportTitle('Silový trenér',c.focus),phase:'before',status:low?'caution':'ready',headline:workout.name||'Dnešní posilování',actions,confidence:'high'};
}
function nutritionCoach(c,done,paused){
  const intake=n(c.food.kcal),target=n(c.nutrition?.calorieTarget),ride=c.training.planned.find(isBike),hours=n(ride?.durationHours),fuel=ride&&!paused?rideFuel(hours,isHard(ride)):null;
  if(!(intake>0)&&!fuel&&!done.length)return null;
  const actions=[];
  if(intake>0&&target>0)actions.push('Zapsáno '+Math.round(intake)+' / '+Math.round(target)+' kcal · zbývá '+Math.round(Math.max(0,target-intake))+' kcal.');
  else if(intake>0)actions.push('Zapsáno '+Math.round(intake)+' kcal. Denní cíl zatím není dostupný.');
  if(fuel)actions.push('Pro '+Math.round(hours*60)+'min jízdu počítej s '+fuel+'. Palivo během aktivity je součást denního příjmu.');
  if(done.length){
    const energy=done.map(a=>n(a.calories)).filter(v=>v!=null);
    actions.push('Po '+done.map(a=>a.name||a.type).join(', ')+(energy.length?' · '+Math.round(energy.reduce((a,b)=>a+b,0))+' kcal evidovaného výdeje':'')+': doplň běžné jídlo s bílkovinou a sacharidy. Výdej už patří do denního cíle.');
  }
  const protein=n(c.nutrition?.macros?.protein_g??c.nutrition?.macros?.proteinGrams),loggedProtein=n(c.food.protein_g);
  if(intake>0&&protein>0&&loggedProtein!=null&&protein-loggedProtein>20)actions.push('Do bílkovin zbývá '+Math.round(protein-loggedProtein)+' g; rozlož je do zbývajících jídel.');
  if(paused)actions.splice(1,0,'Aktuální status pozastavuje běžné tréninky; zbývající plán v kalendáři není doporučení jej dnes absolvovat.');
  return {id:'nutrition',title:sportTitle('Sportovní výživa',c.focus),status:intake>0?'tracking':'ready',phase:done.length?'after':ride?'before':'rest',headline:done.length?'Po aktivitě · doplnění energie':fuel?'Palivo pro dnešní jízdu':'Zbývající příjem',actions:actions.slice(0,4),confidence:intake>0?'high':'medium'};
}
function activityReview(a,matched){
  const plan=matched.find(m=>String(m.actualId)===String(a.id))?.planned,h=n(a.durationHours),tss=n(a.tss),calories=n(a.calories),actions=[];
  const measured=[h>0?Math.round(h*60)+' min':null,tss!=null?Math.round(tss)+' TSS':null,calories!=null?Math.round(calories)+' kcal':null].filter(Boolean);
  if(measured.length)actions.push('Dokončeno: '+measured.join(' · ')+'.');
  if(plan&&n(plan.tss)>0&&tss!=null)actions.push('Zátěž proti plánu: '+Math.round(tss/n(plan.tss)*100)+' %.'+(tss/n(plan.tss)>1.15?' Vyšší zátěž zohledni u zbývajících jednotek.':''));
  else if(!plan)actions.push('Bez spárovaného plánu nelze vyhodnotit jeho splnění.');
  const p=a.payload||{},np=n(p.icu_normalized_watts||p.icu_weighted_average_watts),ftp=n(p.icu_ftp),analysis=[];
  if(plan&&n(plan.durationHours)>0&&h!=null)analysis.push({label:'Délka proti plánu',text:Math.round(h*60)+' / '+Math.round(n(plan.durationHours)*60)+' min. Délka sama nepotvrzuje provedení intervalů.'});
  if(np>0&&ftp>0)analysis.push({label:'Intenzita',text:'IF '+(np/ftp).toFixed(2)+' · NP '+Math.round(np)+' W · FTP '+Math.round(ftp)+' W.'});
  return {id:'review-'+a.id,title:isBike(a)?'Kolo · hodnocení jízdy':'Posilovna · dokončený trénink',headline:a.name||'Dokončená aktivita',phase:'after',status:'tracking',actions,analysis,confidence:'medium'};
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
  if(policy.paused)coaches.push({id:'athlete-status',title:'Aktuální stav',status:'recovery',headline:policy.headline,phase:'rest',confidence:'high',actions:[policy.guidance[0],...(policy.note?['Tvoje omezení: '+policy.note]:[])]});
  else{if(bike)coaches.push(bikeCoach(c,bike));if(gym)coaches.push(gymCoach(c,gym));}
  const reviews=completed.filter(a=>isBike(a)||isGym(a)).map(a=>activityReview(a,matched)),fuel=nutritionCoach(c,completed.filter(a=>isBike(a)||isGym(a)),policy.paused);
  if(fuel)coaches.push(fuel);
  return {version:'adaptive-coach-council-v4',generatedAt:new Date().toISOString(),morningSummary:input.ahead?null:morningSummary({date,sleep:c.sleep,fitness:c.fitness,yesterday:input.yesterday,planned,policy}),priorities:coaches.map(c=>c.headline+': '+c.actions[0]).slice(0,3),coaches,reviews};
}
