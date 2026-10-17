import { classifyPlannedWorkout } from "./planned-workout.js";
import { trainingStatus } from './training-status.js';
import { qualityDomain } from './session-intensity.js';
import { recoveryWeek as recoveryWeek_, weekLoadsBefore, hrvWeekTrendDown, hrvSourceRows } from './week-planner.js';
import { localToday, localDateTime } from "./user-time.js";
import { cycleState, cycleTrainingCaution } from "./cycle-model.js";
import { L, plural as pluralWord } from "./lang.js";
import { readinessFor } from "./readiness.js";
import { manualReadinessFor } from "./morning-checkin.js";
import { readinessParts } from "./app-health.js";
import { sessionLoad } from "./training-load.js";

const n=(v,d=null)=>v===null||v===undefined||v===""?d:Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const txt=v=>String(v??"").toLowerCase();

const BIKE_RE=/ride|cycling|bike|kolo|endurance|tempo|sweet.?spot|threshold|vo2|sprint/i;
const HARD_RE=/threshold|vo2|anaerob|sprint|interval|sweet.?spot|race|z[aá]vod/i;
const LOWER_RE=/squat|dřep|dre(p|p)|leg press|leg extension|leg curl|deadlift|mrtv|pendulum|lunge|výpad|vypad|adduction|abduction|calf|lýt|lyt/i;

function isoDate(v){return String(v||"").slice(0,10)}
function shiftIso(date,days){const d=new Date(isoDate(date)+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function diffDays(a,b){const x=Date.parse(isoDate(a)+"T12:00:00Z"),y=Date.parse(isoDate(b)+"T12:00:00Z");return Number.isFinite(x)&&Number.isFinite(y)?Math.round((x-y)/86400000):null}
const RUN_TYPE_RE=/run|běh|beh|jog|treadmill/i;
const OTHER_TYPE_RE=/walk|hike|swim|weight|strength|yoga|ski|row/i;
// Intervals.icu events may carry only their category ("WORKOUT") as the type.
const typeOf=a=>{const t=String(a?.type||"");return /^(workout|note|race_[abc])$/i.test(t)?"":t};
const RUN_HARD_RE=/threshold|vo2|anaerob|sprint|interval|fartlek|hill|kopc|yasso|cruise|úsek|usek|race|z[aá]vod|tempo/i;
// An activity's type decides first; untyped entries fall back to the name.
const RUN_NAME_RE=/\b(run|running|běh|beh|jog)\b/i;
function isRide(a){const type=typeOf(a);if(RUN_TYPE_RE.test(type)||OTHER_TYPE_RE.test(type)||(!type&&RUN_NAME_RE.test(String(a?.name||""))))return false;return BIKE_RE.test(type+" "+String(a?.name||""))}
function isRun(a){const type=typeOf(a);if(type)return RUN_TYPE_RE.test(type);return RUN_NAME_RE.test(String(a?.name||""))}
function isHardRun(a){
  if(RUN_HARD_RE.test(String(a?.name||"")+" "+String(a?.tags||""))||qualityDomain(String(a?.name||"")+" "+String(a?.tags||""),"run")) return true;
  const intensity=n(a?.payload?.icu_intensity);
  if(intensity&&intensity>=88) return true;
  const hours=n(a?.durationHours,0);
  return n(a?.tss,0)>=50&&hours>0&&hours<=1.5&&n(a?.tss,0)/hours>=75;
}
function isHard(a){
  if(HARD_RE.test(String(a?.name||"")+" "+String(a?.tags||""))||qualityDomain(String(a?.name||"")+" "+String(a?.tags||""),"ride")) return true;
  const np=n(a?.normalizedPower??a?.payload?.icu_weighted_average_watts),ftp=n(a?.ftp??a?.payload?.icu_ftp);
  if(np&&ftp&&np/ftp>=0.86) return true;
  return n(a?.tss,0)>=100&&n(a?.durationHours,0)<=1.75;
}
function allWeekActivities(week){
  const out=[];
  for(const row of week?.days||[]){
    for(const a of row?.daily?.training?.completed||[]) out.push({...a,date:a.date||row.date,completed:true});
    for(const a of row?.daily?.training?.planned||[]) out.push({...a,date:a.date||row.date,planned:true});
  }
  return out;
}
// FTP-free load of a watch workout: resting HR (median of 30 days), max HR
// from age (Tanaka) and sex, as own-fitness.js loadAthlete has them.
function hrAthlete(health,profile,date){
  const rest=(Array.isArray(health?.wellness)?health.wellness:[]).filter(r=>{const age=diffDays(date,r.id);return age!=null&&age>=0&&age<=30;}).map(r=>n(r.restingHR)).filter(v=>v>0).sort((a,b)=>a-b);
  const age=n(profile?.age);
  return {restHr:rest.length?rest[Math.floor(rest.length/2)]:null,maxHr:age?Math.round(208-0.7*age):null,sex:profile?.sex||null};
}
function withHeartRateLoad(activities,athlete){
  if(!athlete.restHr||!athlete.maxHr)return activities;
  return activities.map(a=>{
    if(!a.completed||n(a.tss)!=null||!(isRide(a)||isRun(a)))return a;
    const avgHr=n(a.averageHeartRate??a.payload?.average_heartrate),minutes=n(a.durationHours,0)*60;
    if(!(avgHr>0)||!(minutes>0))return a;
    const tss=sessionLoad({minutes,avgHr,kind:isRun(a)?"run":"ride"},athlete);
    return tss!=null?{...a,tss,tssFromHeartRate:true}:a;
  });
}
function latestWellness(fitness,date){
  const rows=Array.isArray(fitness?.wellness)?fitness.wellness:[];
  return rows.filter(row=>{const age=diffDays(date,row.id);return age!=null&&age>=0&&age<=2}).at(-1)||{};
}
export function wellnessTrend(fitness,date,key){
  const rows=(Array.isArray(fitness?.wellness)?fitness.wellness:[]).map(r=>({age:diffDays(date,r.id),value:n(r[key])})).filter(r=>r.age!=null&&r.age>=0&&r.value!=null&&r.value>0);
  const today=rows.filter(r=>r.age<=1).sort((a,b)=>a.age-b.age)[0];
  const past=rows.filter(r=>r.age>=2&&r.age<=29).map(r=>r.value);
  if(!today||past.length<5)return null;
  const baseline=past.reduce((a,b)=>a+b,0)/past.length;
  return {today:today.value,baseline:Math.round(baseline*10)/10,deltaPct:Math.round((today.value/baseline-1)*1000)/10,delta:Math.round((today.value-baseline)*10)/10};
}
function latestSleepMinutes(health,date){
  const candidates=[];
  const walk=v=>{
    if(!v) return;
    if(Array.isArray(v)){for(const x of v)walk(x);return}
    if(typeof v!=="object") return;
    const key=txt(v.type||v.dataType||v.name||v.metric);
    const minutes=n(v.durationMin??v.durationMinutes??v.minutes);
    if(minutes&&minutes>120&&minutes<900&&(key.includes("sleep")||v.sleepStage||v.startTime&&v.endTime)) candidates.push({minutes,time:String(v.endTime||v.startTime||"")});
    for(const [k,x] of Object.entries(v)) if(/sleep/i.test(k)||Array.isArray(x)) walk(x);
  };
  walk(health);
  candidates.sort((a,b)=>b.time.localeCompare(a.time));
  const recent=candidates.find(row=>{const age=diffDays(date,row.time);return age!=null&&age>=0&&age<=1});
  return recent?.minutes??null;
}
function recentLowerGym(gym,date,lookbackDays=2){
  const rows=Array.isArray(gym?.history)?gym.history:[];
  return rows.filter(x=>{
    const d=diffDays(date,x.date||x.workout_date||x.workoutDate);
    return d!=null&&d>=0&&d<=lookbackDays&&LOWER_RE.test(String(x.exercise||x.name||""));
  });
}
function classifyDomain(a){
  const s=txt(a?.name)+" "+txt(a?.tags);
  const domain=qualityDomain(s,"ride");
  if(domain) return domain;
  if(/tempo/.test(s)) return "moderate";
  return "low";
}
function runTemplate(kind,minutes){
  const m=Math.max(20,Math.round(minutes||60));
  const templates=L({
    recovery:{name:"Regenerační běh",kind:"recovery",target:"pod 78 % prahového tempa, RPE 1–2",structure:[Math.min(m,40)+" min velmi lehce, klidně s chůzí"]},
    endurance:{name:"Lehký běh",kind:"endurance",target:"78–88 % prahového tempa, konverzační tempo",structure:["5 min rozklus",Math.max(15,m-5)+" min lehce"]},
    tempo:{name:"Tempový běh",kind:"tempo",target:"89–95 % prahového tempa",structure:["12 min rozklus","20–30 min tempo","8 min výklus"]},
    sweet_spot:{name:"Sub-threshold",kind:"sweet_spot",target:"95–97 % prahového tempa",structure:["12 min rozklus","5×6 min, mezi nimi 1 min klus","8 min výklus"]},
    threshold:{name:"Prahové úseky",kind:"threshold",target:"97–101 % prahového tempa",structure:["12 min rozklus","4×8 min, mezi nimi 2 min klus","8 min výklus"]},
    vo2:{name:"VO₂max úseky",kind:"vo2",target:"104–108 % prahového tempa",structure:["12 min rozklus + 4 rovinky","5×4 min, mezi nimi 3 min klus","8 min výklus"]},
    long_endurance:{name:"Dlouhý běh",kind:"long_endurance",target:"80–86 % prahového tempa",structure:["10 min rozklus","souvisle lehce, kopce podle úsilí"]},
    openers:{name:"Aktivace před závodem",kind:"openers",target:"lehce, krátce závodní tempo",structure:["15 min lehce","4× 20 s rovinky v závodním tempu, mezi nimi 1 min klus","5 min výklus"]},
    race:{name:"Závod",kind:"race",target:"rozklus 10–15 min + 3 krátká zrychlení před startem",structure:["10–15 min rozklus","3× 15 s zrychlení","start"]}
  },{
    recovery:{name:"Recovery run",kind:"recovery",target:"below 78 % of threshold pace, RPE 1–2",structure:[Math.min(m,40)+" min very easy, walk if you like"]},
    endurance:{name:"Easy run",kind:"endurance",target:"78–88 % of threshold pace, conversational",structure:["5 min warm-up jog",Math.max(15,m-5)+" min easy"]},
    tempo:{name:"Tempo run",kind:"tempo",target:"89–95 % of threshold pace",structure:["12 min warm-up jog","20–30 min tempo","8 min cool-down jog"]},
    sweet_spot:{name:"Sub-threshold",kind:"sweet_spot",target:"95–97 % of threshold pace",structure:["12 min warm-up jog","5×6 min with 1 min jog between","8 min cool-down jog"]},
    threshold:{name:"Threshold intervals",kind:"threshold",target:"97–101 % of threshold pace",structure:["12 min warm-up jog","4×8 min with 2 min jog between","8 min cool-down jog"]},
    vo2:{name:"VO₂max intervals",kind:"vo2",target:"104–108 % of threshold pace",structure:["12 min warm-up jog + 4 strides","5×4 min with 3 min jog between","8 min cool-down jog"]},
    long_endurance:{name:"Long run",kind:"long_endurance",target:"80–86 % of threshold pace",structure:["10 min warm-up jog","continuous and easy, hills by effort"]},
    openers:{name:"Pre-race openers",kind:"openers",target:"easy, briefly at race pace",structure:["15 min easy","4× 20 s strides at race pace with 1 min jog between","5 min cool-down jog"]},
    race:{name:"Race",kind:"race",target:"10–15 min warm-up jog + 3 short accelerations before the start",structure:["10–15 min warm-up jog","3× 15 s accelerations","start"]}
  });
  return {...(templates[kind]||templates.endurance),durationMinutes:m};
}
function workoutTemplate(kind,minutes,cadence="85–95 rpm",sport="ride"){
  if(sport==="run") return runTemplate(kind,minutes);
  const m=Math.max(30,Math.round(minutes||75));
  const templates=L({
    recovery:{name:"Recovery / lehké Z1",kind:"recovery",target:"45–55 % FTP nebo RPE 1–2",structure:["10 min velmi lehce","20–35 min plynule Z1","5–10 min vyjetí"],cadence},
    endurance:{name:"Endurance Z2",kind:"endurance",target:"60–72 % FTP nebo RPE 2–4",structure:["10–15 min postupné rozjetí",Math.max(20,m-25)+" min stabilní Z2","10 min vyjetí"],cadence},
    tempo:{name:"Tempo",kind:"tempo",target:"80–87 % FTP",structure:["15 min rozjetí","2×15–20 min @ 80–87 %, mezi nimi 5 min lehce","10 min vyjetí"],cadence},
    sweet_spot:{name:"Sweet Spot",kind:"sweet_spot",target:"88–94 % FTP",structure:["15 min rozjetí","3×10–12 min @ 88–94 %, mezi nimi 5 min lehce","10 min vyjetí"],cadence},
    threshold:{name:"Threshold",kind:"threshold",target:"95–100 % FTP",structure:["15 min rozjetí","3×10 min @ 95–100 %, mezi nimi 5 min lehce","10 min vyjetí"],cadence},
    vo2:{name:"VO₂max",kind:"vo2",target:"108–116 % FTP",structure:["15 min rozjetí + 3 krátké aktivace","5×4 min @ 108–116 %, mezi nimi 4 min lehce","10–15 min vyjetí"],cadence:"90–100 rpm"},
    long_endurance:{name:"Long Endurance",kind:"long_endurance",target:"60–72 % FTP",structure:["15 min lehce","souvislá Z2; kopce bez závodění","10–15 min vyjetí"],cadence},
    openers:{name:"Aktivace před závodem",kind:"openers",target:"Z2 s krátkými úseky 105–115 % FTP",structure:["15 min lehce","3× 1 min @ 105–115 %, mezi nimi 2 min lehce","3× 10 s sprint","10 min vyjetí"],cadence},
    race:{name:"Závod",kind:"race",target:"rozjetí 15–20 min s 2–3 krátkými zrychleními před startem",structure:["15–20 min rozjetí v Z2","2–3× 30 s @ 105 % FTP","start"],cadence}
  },{
    recovery:{name:"Recovery / easy Z1",kind:"recovery",target:"45–55 % FTP or RPE 1–2",structure:["10 min very easy","20–35 min smooth Z1","5–10 min cool-down"],cadence},
    endurance:{name:"Endurance Z2",kind:"endurance",target:"60–72 % FTP or RPE 2–4",structure:["10–15 min gradual warm-up",Math.max(20,m-25)+" min steady Z2","10 min cool-down"],cadence},
    tempo:{name:"Tempo",kind:"tempo",target:"80–87 % FTP",structure:["15 min warm-up","2×15–20 min @ 80–87 %, 5 min easy between","10 min cool-down"],cadence},
    sweet_spot:{name:"Sweet Spot",kind:"sweet_spot",target:"88–94 % FTP",structure:["15 min warm-up","3×10–12 min @ 88–94 %, 5 min easy between","10 min cool-down"],cadence},
    threshold:{name:"Threshold",kind:"threshold",target:"95–100 % FTP",structure:["15 min warm-up","3×10 min @ 95–100 %, 5 min easy between","10 min cool-down"],cadence},
    vo2:{name:"VO₂max",kind:"vo2",target:"108–116 % FTP",structure:["15 min warm-up + 3 short openers","5×4 min @ 108–116 %, 4 min easy between","10–15 min cool-down"],cadence:"90–100 rpm"},
    long_endurance:{name:"Long Endurance",kind:"long_endurance",target:"60–72 % FTP",structure:["15 min easy","continuous Z2; no racing on climbs","10–15 min cool-down"],cadence},
    openers:{name:"Pre-race openers",kind:"openers",target:"Z2 with short efforts at 105–115 % FTP",structure:["15 min easy","3× 1 min @ 105–115 %, 2 min easy between","3× 10 s sprint","10 min cool-down"],cadence},
    race:{name:"Race",kind:"race",target:"15–20 min warm-up with 2–3 short accelerations before the start",structure:["15–20 min warm-up in Z2","2–3× 30 s @ 105 % FTP","start"],cadence}
  });
  const t=templates[kind]||templates.endurance;
  return {...t,durationMinutes:m};
}

export const CYCLING_COACH_V2_META={
  version:"cycling-coach-v2.0-predeploy",
  status:"predeploy",
  influences:[
    "capability-versus-workout challenge progression by energy system",
    "availability/readiness/RPE-driven daily adaptation",
    "freshness plus low/moderate/high training-load balance"
  ],
  note:"Independent implementation. It does not reproduce TrainerRoad, JOIN, Xert, or any team\'s proprietary algorithms."
};

// How long the athlete can train today when no time was given: the week's
// load target spread over five training days, then sleep, form (TSB),
// readiness, a recovery week and a comeback after a break.
// The week's target is the week plan's (weekTargets): CTL is the 42-day
// average of daily load, so CTL × 7 holds fitness and +5 % raises it by about
// CTL/120 a week, well under the 5–8 CTL a week Friel (TrainingPeaks) calls
// sustainable; above 8 a week the load only holds. Easy riding at IF 0.7 is
// IF² × 100 = 49 TSS/h; easy running at IF 0.83 is 69 rTSS/h, and a run gets
// 20 % less time for its higher mechanical load.
function capacityMinutes({ctl,tsb,sleepMinutes,readiness,recoveryWeek,returning,sport,taper=false,ramp=null}){
  const run=sport==="run",reasons=[];
  let m;
  if(ctl==null){m=run?45:75;reasons.push(L("kondici (CTL) zatím neznám, beru "+m+" min","fitness (CTL) unknown so far, using "+m+" min"));}
  else{
    const hold=ramp!=null&&ramp>8,dayLoad=ctl*7*(hold?1:1.05)/5;
    m=run?dayLoad/69*60*.8:dayLoad/49*60;
    reasons.push(L("kondice CTL "+Math.round(ctl)+": týdenní cíl "+Math.round(ctl*7*(hold?1:1.05))+" TSS"+(hold?" (CTL roste o "+Math.round(ramp)+" za týden, nad 8 zátěž jen držím)":"")+" na 5 tréninkových dní ≈ "+Math.round(dayLoad)+" TSS → "+Math.round(m)+" min","fitness CTL "+Math.round(ctl)+": weekly target "+Math.round(ctl*7*(hold?1:1.05))+" TSS"+(hold?" (CTL is rising by "+Math.round(ramp)+" a week; above 8 I only hold the load)":"")+" over 5 training days ≈ "+Math.round(dayLoad)+" TSS → "+Math.round(m)+" min"));
  }
  const apply=(factor,text)=>{m*=factor;reasons.push(text+" "+(factor>1?"+":"−")+Math.round(Math.abs(factor-1)*100)+" %");};
  if(sleepMinutes!=null&&sleepMinutes<360)apply(.8,L("spánek pod 6 h","sleep under 6 h"));
  else if(sleepMinutes!=null&&sleepMinutes<420)apply(.9,L("spánek pod 7 h","sleep under 7 h"));
  if(tsb!=null&&tsb<=-25)apply(.75,L("velká únava","high fatigue")+" (TSB "+Math.round(tsb)+")");
  else if(tsb!=null&&tsb<=-15)apply(.85,L("únava","fatigue")+" (TSB "+Math.round(tsb)+")");
  else if(tsb!=null&&tsb>=5)apply(1.15,L("tělo je odpočaté","you're rested")+" (TSB "+Math.round(tsb)+")");
  if(readiness==="red")apply(.7,L("nízká připravenost","low readiness"));
  else if(readiness==="yellow")apply(.9,L("střední připravenost","moderate readiness"));
  if(recoveryWeek)apply(.7,L("regenerační týden","recovery week"));
  if(taper)apply(.6,L("ladění formy před závodem","tapering before a race"));
  if(returning)apply(.7,L("návrat po pauze","returning after a break"));
  return {minutes:clamp(m,run?20:30,run?150:300),reasons};
}
// The session length for the chosen kind.
function sessionMinutesFor(kind,capacity,sport){
  const run=sport==="run",step=run?5:15,round=m=>Math.max(step,Math.round(m/step)*step),reasons=[...capacity.reasons];
  let m=capacity.minutes;
  if(kind==="recovery"){m=clamp(m*.5,run?20:30,run?40:60);reasons.push(L("regenerace je krátká","recovery is short"));}
  else if(kind==="openers"){m=run?30:45;reasons.push(L("aktivace před závodem je krátká","pre-race openers are short"));}
  else if(kind==="race"){m=run?20:30;reasons.push(L("jen rozjetí před startem","just a warm-up before the start"));}
  else if(["tempo","sweet_spot","threshold","vo2"].includes(kind)){
    const [lo,hi]=run?[40,80]:[60,120];
    if(m<lo||m>hi)reasons.push(L("kvalitní trénink držím na "+lo+"–"+hi+" min","I keep quality sessions at "+lo+"–"+hi+" min"));
    m=clamp(m,lo,hi);
  }
  return {minutes:round(m),reasons};
}

// Words that differ between the bike and the run coach.
const WORDS_CS={
  ride:{novice:"Kondice je zatím nízká – první týdny stavím aerobní základ bez intervalů a jízdy prodlužuji postupně; kvalitu přidám, až kondice poroste.",hard3:"v aktuálním týdnu už byly nejméně 3 náročné cyklistické dny",hard2:"rozpočet kvalitních cyklistických dnů je už téměř vyčerpaný",today:"dnes už proběhla cyklistická jednotka",none:"V datech nevidím žádnou nedávnou jízdu – začínám aerobní jízdou; kvalitu přidám, až bude trénink zase pravidelný.",off:d=>"Posledních "+d+" dní bez jízdy – návrat přes aerobní jízdu se sníženou obtížností, kvalita přijde v dalších dnech.",two:"Dvě kvalitní jízdy v týdnu už byly – dnes aerobní objem.",recent:"Kvalita byla před méně než 48 h – dnes aerobní jízda na zotavení.",safe:"Připravenost není ideální pro kvalitu – aerobní jízda je bezpečná volba.",gym:"chránit kvalitu kola po posilování dolní části těla",labels:{sweet_spot:"Sweet spot",threshold:"Práh",vo2max:"VO₂max",tempo:"Tempo"}},
  run:{novice:"S běháním začínáš – první týdny jen lehký běh (klidně s chůzí) a délku zvyšuji postupně; úseky přidám, až bude běhání pravidelné.",hard3:"v aktuálním týdnu už byly nejméně 3 náročné běhy",hard2:"rozpočet kvalitních běhů je už téměř vyčerpaný",today:"dnes už proběhl běh",none:"V datech nevidím žádný nedávný běh – začínám lehkým během; kvalitu přidám, až bude běhání zase pravidelné.",off:d=>"Posledních "+d+" dní bez běhu – návrat přes lehký běh se sníženou obtížností; šlachy a klouby si na běh zvykají pomaleji než srdce.",two:"Dva kvalitní běhy v týdnu už byly – dnes lehký objem.",recent:"Kvalita byla před méně než 48 h – dnes lehký běh na zotavení.",safe:"Připravenost není ideální pro kvalitu – lehký běh je bezpečná volba.",gym:"chránit kvalitu běhu po posilování dolní části těla",labels:{sweet_spot:"Sub-threshold",threshold:"Práh",vo2max:"VO₂max",tempo:"Tempo"}}
};
const WORDS_EN={
  ride:{novice:"Your fitness is still low – for the first weeks I'm building an aerobic base without intervals and lengthening rides gradually; quality comes once your fitness grows.",hard3:"there have already been at least 3 hard cycling days this week",hard2:"the budget of quality cycling days is almost used up",today:"you've already ridden today",none:"I don't see any recent ride in the data – starting with an aerobic ride; quality comes once training is regular again.",off:d=>"The last "+d+" days without a ride – coming back with an easier aerobic ride, quality follows in the next days.",two:"Two quality rides this week already – aerobic volume today.",recent:"The last quality session was less than 48 h ago – an aerobic recovery ride today.",safe:"Readiness isn't ideal for quality – an aerobic ride is the safe choice.",gym:"protect the quality of the ride after lower-body strength work",labels:{sweet_spot:"Sweet spot",threshold:"Threshold",vo2max:"VO₂max",tempo:"Tempo"}},
  run:{novice:"You're new to running – for the first weeks only easy runs (walk breaks are fine) and I increase the duration gradually; intervals come once running is regular.",hard3:"there have already been at least 3 hard runs this week",hard2:"the budget of quality runs is almost used up",today:"you've already run today",none:"I don't see any recent run in the data – starting with an easy run; quality comes once running is regular again.",off:d=>"The last "+d+" days without a run – coming back with an easier easy run; tendons and joints adapt to running more slowly than the heart.",two:"Two quality runs this week already – easy volume today.",recent:"The last quality session was less than 48 h ago – an easy recovery run today.",safe:"Readiness isn't ideal for quality – an easy run is the safe choice.",gym:"protect the quality of the run after lower-body strength work",labels:{sweet_spot:"Sub-threshold",threshold:"Threshold",vo2max:"VO₂max",tempo:"Tempo"}}
};


export function buildCyclingCoachV2({date,daily,week,fitness,health,gym,preferences={},availabilityMinutes=null,goal=null,manualReadiness=null,capabilities={},sport="ride",athleteState=null,focus=null,profile=null,checkin=null,upcomingTest=null,recoveryTime=null}={}){
  const policy=trainingStatus(athleteState);
  sport=sport==="run"?"run":"ride";
  const W=L(WORDS_CS,WORDS_EN)[sport],isSport=sport==="run"?isRun:isRide,hardOf=sport==="run"?isHardRun:isHard,run=sport==="run";
  const targetDate=isoDate(date)||localToday();
  // Workouts only the watch recorded have no TSS: their heart-rate load
  // (hrTSS, training-load.js) lets hardOf see a hard session from the watch.
  const weekActivities=withHeartRateLoad(allWeekActivities(week),hrAthlete(health,profile,targetDate));
  const completedAll=weekActivities.filter(a=>a.completed&&isSport(a));
  const completed=completedAll.filter(a=>{const d=diffDays(targetDate,a.date);return d!=null&&d>=0&&d<=6;});
  const planned=weekActivities.filter(a=>{if(!a.planned||!isSport(a))return false;const d=diffDays(a.date,targetDate);return d!=null&&d>=0&&d<=14;});
  // The body's signals (HRV, resting HR, sleep, form) exist only up to today.
  // Tomorrow is judged by today's readiness, the one Today shows; a day further
  // on by the training load alone, as recovery by then is not known yet.
  // Missing data no longer makes it yellow: every hard session planned for the
  // day after tomorrow used to be eased that way (Petr, 2026-10-14).
  const now=localToday(),bodyDate=targetDate>now?now:targetDate,daysAhead=Math.max(0,diffDays(targetDate,now)??0),farAhead=daysAhead>=2,signalDate=farAhead?targetDate:bodyDate;
  const wellness=latestWellness(fitness,bodyDate);
  const ctl=n(wellness.ctl),atl=n(wellness.atl),tsb=n(wellness.tsb,ctl!=null&&atl!=null?ctl-atl:null),ramp=n(wellness.rampRate??wellness.ramp_rate);
  const wellnessSleep=(Array.isArray(fitness?.wellness)?fitness.wellness:[]).filter(r=>{const age=diffDays(signalDate,r.id);return age!=null&&age>=0&&age<=1&&n(r.sleepSecs)>7200;}).sort((a,b)=>String(b.id).localeCompare(String(a.id)))[0];
  const sleepMinutes=latestSleepMinutes(health,signalDate)??(wellnessSleep?Math.round(n(wellnessSleep.sleepSecs)/60):null);
  const lowerGym=recentLowerGym(gym,targetDate,2);
  const todayCompleted=completed.filter(a=>isoDate(a.date)===targetDate);
  const hard7=completed.filter(hardOf).length;
  const tss7=completed.reduce((s,a)=>s+n(a.tss,0),0);
  const domains={low:0,moderate:0,high:0};
  for(const a of completed) domains[classifyDomain(a)]+=n(a.tss,Math.max(20,n(a.durationHours,1)*50));

  // Readiness is the body's recovery from the shared model, the same number and
  // zone the Today screen shows (src/recovery-model.js: HRV, resting HR and
  // sleep against the athlete's own 60-day baseline, breathing and skin
  // temperature as early signs of illness; Google Health, Apple Health and
  // Intervals.icu wellness merged). Training load the body signals do not show
  // yet, deep fatigue (TSB), can only lower it, and so can the athlete's own
  // morning check-in.
  const readinessReasons=[],ZONES=["red","yellow","green"],lower=(a,b)=>ZONES[Math.min(ZONES.indexOf(a),ZONES.indexOf(b))];
  // The same readiness and the same inputs as Today (readiness.js): the sleep
  // goal, the strain of the day before and the morning check-in included, so
  // the number quoted here is the one Today shows. A readiness number sent
  // with the request wins over the stored check-in (see below).
  const sessions=Array.isArray(health?.sleep)?health.sleep:[];
  const ready=readinessFor({date:signalDate,google:health?.wellness,intervals:fitness?.wellness,sessions,profile,checkin:manualReadiness==null?checkin:null});
  const rows=ready.rows,body=ready.body,bh=body.components?.hrv,br=body.components?.restingHR,bs=body.components?.sleep;
  const hrv=wellnessTrend({wellness:rows},signalDate,"hrv"),rhr=wellnessTrend({wellness:rows},signalDate,"restingHR");
  if(daysAhead===1&&ready.score!=null)readinessReasons.push(L("na zítřek beru dnešní připravenost, novější data zatím nejsou","for tomorrow I use today's readiness, as there is no newer data yet"));
  if(farAhead)readinessReasons.push(L("regenerace na tento den ještě není známá, intenzitu určuje zátěž","recovery for this day isn't known yet, so the training load sets the intensity"));
  if(ready.score!=null)readinessReasons.push(ready.score<body.score
    ?L("připravenost "+ready.score+" (HRV, klidový tep a spánek proti tvému průměru, snížená ranním pocitem)","readiness "+ready.score+" (HRV, resting heart rate and sleep against your average, lowered by the morning check-in)")
    :L("připravenost "+ready.score+" (HRV, klidový tep a spánek proti tvému průměru)","readiness "+ready.score+" (HRV, resting heart rate and sleep against your average)"));
  if(ready.provisional)readinessReasons.push(L("průměr nového zdroje dat je zatím převzatý z dřívějšího zdroje, číslo je orientační","the new data source's average is carried over from the earlier source for now, so the number is provisional"));
  if(bh&&bh.z<=-1)readinessReasons.push(L("HRV "+Math.round(bh.value)+" ms je pod tvým běžným pásmem "+Math.round(bh.low)+"–"+Math.round(bh.high)+" ms","HRV "+Math.round(bh.value)+" ms is below your usual range of "+Math.round(bh.low)+"–"+Math.round(bh.high)+" ms"));
  if(br&&br.z>=1)readinessReasons.push(L("klidový tep "+Math.round(br.value)+" je o "+Math.round(br.value-br.baseline)+" "+pluralWord(Math.round(br.value-br.baseline),"tep","tepy","tepů")+" nad tvým průměrem","resting heart rate "+Math.round(br.value)+" is "+Math.round(br.value-br.baseline)+" beats above your average"));
  // Both at once is a strong sign of fatigue or a coming illness.
  if(bh&&br&&bh.z<=-1&&br.z>=1)readinessReasons.push(L("HRV i klidový tep zároveň ukazují na výraznou únavu","HRV and resting heart rate both point to significant fatigue"));
  if(bh?.trend==="down")readinessReasons.push(L("7denní průměr HRV klesl pod tvoje běžné pásmo","the 7-day HRV average has dropped below your usual range"));
  if(bs&&bs.performance<85)readinessReasons.push(L("spánek "+Math.round(bs.minutes/60*10)/10+" h z potřebných "+Math.round(bs.need/60*10)/10+" h","sleep "+Math.round(bs.minutes/60*10)/10+" h of the "+Math.round(bs.need/60*10)/10+" h you need"));
  if(body.flags?.includes("respiration_elevated"))readinessReasons.push(L("dech ve spánku je výrazně nad tvým průměrem, může jít o nastupující nemoc","breathing during sleep is well above your average, which may be an oncoming illness"));
  if(body.flags?.includes("skin_temp_elevated"))readinessReasons.push(L("teplota kůže ve spánku je zvýšená, může jít o nastupující nemoc","skin temperature during sleep is raised, which may be an oncoming illness"));
  // Apple Watch's wrist temperature in sleep against the athlete's own nights:
  // from +1.0 °C a reason of its own, as a possible oncoming illness.
  const bw=body.components?.wristTemp;
  if(bw?.elevated)readinessReasons.push(L("teplota zápěstí ve spánku je o "+bw.deviation.toFixed(1).replace(".",",")+" °C nad tvým průměrem, může jít o nastupující nemoc","wrist temperature during sleep is "+bw.deviation.toFixed(1)+" °C above your average, which may be an oncoming illness"));
  // Without the body's signals (no watch, or under 14 days of baseline) the
  // load decides, and only fatigue data plus a full night allow green.
  let readiness=ready.zone||(farAhead||tsb!=null&&sleepMinutes!=null&&sleepMinutes>=420?"green":"yellow");
  if(!body.zone&&!farAhead)readinessReasons.push(L("chybí HRV nebo klidový tep s aspoň 14denním průměrem, připravenost odhaduji ze zátěže","no HRV or resting heart rate with at least a 14-day average yet, so readiness comes from the training load"));
  const loadCap=(zone,text)=>{readiness=lower(readiness,zone);readinessReasons.push(text);};
  if(tsb!=null&&tsb<=-30)loadCap("red",L("forma/únava je hluboko v záporných hodnotách","form is deep in negative territory")+" (TSB "+Math.round(tsb)+")");
  else if(tsb!=null&&tsb<=-20)loadCap("yellow",L("výrazná kumulovaná únava","significant accumulated fatigue")+" (TSB "+Math.round(tsb)+")");
  // The rest of the load is said here and acts through its own rules below
  // (two quality days a week, legs after the gym, the length of the session).
  if(ramp!=null&&ramp>8)readinessReasons.push(L("rychlý růst tréninkové zátěže","training load rising fast"));
  if(hard7>=3)readinessReasons.push(W.hard3);
  else if(hard7===2)readinessReasons.push(W.hard2);
  if(lowerGym.length)readinessReasons.push(L("nedávná lower-body silová zátěž","recent lower-body strength work"));
  if(todayCompleted.length)readinessReasons.push(W.today);
  // The morning check-in on Today (morning-checkin.js), unless the request
  // brings its own number.
  if(manualReadiness==null&&checkin)manualReadiness=manualReadinessFor(checkin);
  if(manualReadiness!=null){
    const m=clamp(n(manualReadiness,50),0,100),feeling={fresh:L("svěží","fresh"),normal:L("normál","normal"),tired:L("unavený","tired"),sick:L("nemocný","sick")}[checkin];
    loadCap(m<34?"red":m<67?"yellow":"green",feeling&&manualReadiness===manualReadinessFor(checkin)?L("ranní pocit: ","morning check-in: ")+feeling:L("zohledněn ruční readiness check-in","manual readiness check-in taken into account"));
  }
  // The number Today shows (after the morning check-in).
  const score=ready.score;
  // A beginner: low fitness, or without fitness data only a few sessions of
  // this sport. Intervals, long sessions and the load-based recovery week wait
  // until the base is there.
  const novice=ctl!=null?ctl<15:completedAll.length<4;

  const plannedToday=planned.find(a=>isoDate(a.date)===targetDate)||daily?.training?.planned?.find(isSport)||null;
  const plannedInfo=plannedToday?classifyPlannedWorkout(plannedToday,sport):null;
  const [minLen,maxLen]=sport==="run"?[20,240]:[30,360];
  const explicitMinutes=n(availabilityMinutes,n(preferences.availableMinutes,n(plannedInfo?.minutes,n(plannedToday?.durationHours)*60||null)));
  // No time given and nothing planned: the coach picks the length from the
  // athlete's usual session over the last three weeks (or CTL), see below.
  const autoLength=explicitMinutes==null;
  let requestedMinutes=clamp(autoLength?capacityMinutes({ctl,tsb,sleepMinutes,readiness,recoveryWeek:false,returning:false,sport,ramp}).minutes:explicitMinutes,minLen,maxLen);
  const longMinutes=sport==="run"?90:150;
  const cadence=preferences.cadence||"85–95 rpm";
  const rationale=[];
  let returning=false;

  // Recovery week: this week's load (done + planned) well below last week's,
  // or a plan named that way.
  const monday=shiftIso(targetDate,-((new Date(targetDate+"T12:00:00Z").getUTCDay()+6)%7));
  const inWeek=(a,start)=>{const d=diffDays(a.date,start);return d!=null&&d>=0&&d<=6;};
  const rides=weekActivities.filter(isSport);
  const loadOf=a=>n(a.tss,n(a.durationHours,0)*50);
  const thisWeekLoad=Math.round(rides.filter(a=>inWeek(a,monday)).reduce((s,a)=>s+loadOf(a),0));
  const lastWeekLoad=Math.round(rides.filter(a=>a.completed&&inWeek(a,shiftIso(monday,-7))).reduce((s,a)=>s+loadOf(a),0));
  const namedRecovery=rides.some(a=>inWeek(a,monday)&&/recovery week|deload|regenera[čc]n[íi] t[ýy]den|odpo[čc]inkov/i.test(String(a.name||"")+" "+String(a.description||"")));
  // Same rule as the calendar's week targets: after a week ≥ 125 % of maintenance (CTL × 7).
  // Periodization from the main event in the settings: base more than 12
  // weeks out, build in the last 12, taper in the final week, openers the day
  // before and the race itself. A lighter taper week is not a recovery week.
  const eventDays=focus?.event?.date?diffDays(focus.event.date,targetDate):null;
  const eventPhase=eventDays==null||eventDays<0?null:eventDays===0?"race":eventDays===1?"openers":eventDays<=7?"taper":eventDays<=84?"build":"base";
  const tapering=["race","openers","taper"].includes(eventPhase);
  // The same rule as the week plan and the gym (all sports from the Intervals.icu
  // wellness; this sport's rides when the wellness has no loads).
  const wellnessLoads=weekLoadsBefore(fitness?.wellness,monday),weekLoads=wellnessLoads.length?wellnessLoads:[lastWeekLoad];
  const rule=recoveryWeek_({base:ctl!=null&&ctl>0?ctl*7:null,weekLoads,hrvDown:hrvWeekTrendDown(hrvSourceRows(fitness?.wellness,health?.wellness,monday),monday)});
  // A beginner's load is always well above a CTL that is still catching up, so
  // the load rule would call every week a recovery week.
  const recoveryWeek=!tapering&&(namedRecovery||rule.recovery&&!novice);
  if(recoveryWeek)rationale.push(namedRecovery?L("Tento týden je v plánu označený jako regenerační.","This week is marked as a recovery week in your plan."):rule.reason==="hrv_trend"?L("Regenerační týden: 7denní průměr HRV před týdnem klesl pod tvoje běžné pásmo, tělo nestíhá vstřebat zátěž. Tenhle týden proto cílím na zhruba 70 %.","Recovery week: a week ago the 7-day HRV average dropped below your usual range, so your body isn't absorbing the load. This week I'm aiming for about 70 %."):rule.reason==="heavy_last_week"?L("Regenerační týden: minulý týden "+weekLoads[0]+" TSS je "+Math.round(weekLoads[0]/(ctl*7)*100)+" % udržovací zátěže (CTL "+Math.round(ctl)+" × 7), tenhle týden proto cílím na zhruba 70 %.","Recovery week: last week's "+weekLoads[0]+" TSS is "+Math.round(weekLoads[0]/(ctl*7)*100)+" % of maintenance load (CTL "+Math.round(ctl)+" × 7), so this week I'm aiming for about 70 %."):L("Regenerační týden: tři týdny v řadě nad udržovací zátěží ("+weekLoads.slice(0,3).reverse().join(", ")+" TSS při CTL "+Math.round(ctl)+" × 7), tenhle týden proto cílím na zhruba 70 %.","Recovery week: three weeks in a row above maintenance load ("+weekLoads.slice(0,3).reverse().join(", ")+" TSS at CTL "+Math.round(ctl)+" × 7), so this week I'm aiming for about 70 %."));
  const phase=txt(goal?.phase||preferences.phase||(tapering?eventPhase:recoveryWeek?"recovery":eventPhase||"auto"));
  const named=focus?.event?.name,eventName=named?L("„"+named+"“","“"+named+"”"):L("závod","your race");
  const count=(n,cs1,cs2,cs5,en1,en2)=>n+" "+pluralWord(n,cs1,cs2,cs5,en1,en2);
  const toEvent=named?eventName:L("závodu","your race");
  const weeks=Math.round(eventDays/7);
  if(eventPhase&&!goal?.phase&&!preferences.phase)rationale.push(eventPhase==="race"?L("Dnes je "+eventName+".","Today is "+eventName+"."):eventPhase==="openers"?L("Zítra je "+eventName+" – dnes jen krátká aktivace.","Tomorrow is "+eventName+" – just short openers today."):eventPhase==="taper"?L("Do "+toEvent+" "+pluralWord(eventDays,"zbývá","zbývají","zbývá")+" "+count(eventDays,"den","dny","dní")+": ladění formy, objem jde dolů a intenzita zůstává krátká.",count(eventDays,"","","","day","days")+" to "+toEvent+": tapering, volume goes down and intensity stays short."):eventPhase==="build"?L("Do "+toEvent+" "+pluralWord(weeks,"zbývá","zbývají","zbývá")+" "+count(weeks,"týden","týdny","týdnů")+": fáze rozvoje, kvalita míří na závodní intenzitu.",count(weeks,"","","","week","weeks")+" to "+toEvent+": build phase, quality targets race intensity."):L("Do "+toEvent+" "+pluralWord(weeks,"zbývá","zbývají","zbývá")+" "+count(weeks,"týden","týdny","týdnů")+": základní fáze, stavíme aerobní základ a sweet spot.",count(weeks,"","","","week","weeks")+" to "+toEvent+": base phase, building the aerobic base and sweet spot."));

  const lastRide=completedAll.map(a=>diffDays(targetDate,a.date)).filter(d=>d!=null&&d>=0).sort((a,b)=>a-b)[0];
  const lastHard=completedAll.filter(hardOf).map(a=>diffDays(targetDate,a.date)).filter(d=>d!=null&&d>=0).sort((a,b)=>a-b)[0];
  // The other sport tires the same legs and heart: a hard run counts before a
  // hard ride (and the other way round) for the 48 h rule and the week's quality.
  const otherIs=run?isRide:isRun,otherHardOf=run?isHard:isHardRun;
  const otherHardDays=weekActivities.filter(a=>a.completed&&otherIs(a)&&otherHardOf(a)).map(a=>diffDays(targetDate,a.date)).filter(d=>d!=null&&d>=0&&d<=6);
  const lastOtherHard=otherHardDays.length?Math.min(...otherHardDays):null;
  const otherRecent=lastOtherHard!=null&&lastOtherHard<2,hardAll7=hard7+otherHardDays.length;
  const qualityOk=!novice&&(lastHard==null||lastHard>=2)&&!otherRecent&&hardAll7<3&&!(lastRide!=null&&lastRide>=7);
  let kind="endurance";
  const planText=txt(plannedToday?.name)+" "+txt(goal?.focus);
  const KIND_OF={recovery:"recovery",endurance:"endurance",tempo:"tempo",sweet_spot:"sweet_spot",threshold:"threshold",vo2max:"vo2"};
  if(plannedInfo?.system){
    kind=KIND_OF[plannedInfo.system]||"endurance";
    const info=plannedInfo.minutes?" ("+plannedInfo.minutes+" min"+(plannedInfo.intensityFactor?", IF "+plannedInfo.intensityFactor.toFixed(2):"")+")":"";
    rationale.push(L("V Intervals.icu máš na tento den naplánováno „"+(plannedToday.name||"trénink")+"“"+info+" – doporučení se drží plánu.","You have “"+(plannedToday.name||"a workout")+"” planned for this day in Intervals.icu"+info+" – the recommendation follows the plan."));
  }
  else if(phase==="race") kind="race";
  else if(phase==="openers") kind="openers";
  else if(/vo2|anaerob/.test(planText)) kind="vo2";
  else if(/threshold/.test(planText)) kind="threshold";
  else if(/sweet/.test(planText)) kind="sweet_spot";
  else if(/tempo/.test(planText)) kind="tempo";
  // The weekly planner's role for the day (long / easy); quality stays automatic.
  else if(/^long/.test(txt(goal?.focus))) kind="long_endurance";
  else if(/^recovery/.test(txt(goal?.focus))) kind="recovery";
  else if(/^endurance/.test(txt(goal?.focus))) kind="endurance";
  else if(!autoLength&&requestedMinutes>=longMinutes&&phase!=="taper") kind="long_endurance";
  // An explicit phase picks the quality, but never 48 h after the last one or after a break.
  else if(phase==="build"&&hard7<2&&qualityOk) kind=domains.high<domains.moderate*0.35?"vo2":"threshold";
  else if(phase==="base"&&hard7<2&&qualityOk&&domains.moderate<domains.low*0.45) kind=sport==="run"?"threshold":"sweet_spot";
  else if(!recoveryWeek){
    // Nothing planned and no phase set: decide from the recent rides.
    if(lastRide==null||lastRide>=7){
      kind="endurance";returning=true;
      rationale.push(lastRide==null?W.none:W.off(lastRide));
    } else if(novice){
      kind="endurance";
      rationale.push(W.novice);
    } else if(otherRecent||hardAll7>=3){
      kind="endurance";
      rationale.push(otherRecent
        ?(run?L("Tvrdá jízda byla "+(lastOtherHard===0?"dnes":"včera")+" – běh dnes lehce, nohy potřebují 48 h.","A hard ride was "+(lastOtherHard===0?"today":"yesterday")+" – an easy run today, the legs need 48 h."):L("Tvrdý běh byl "+(lastOtherHard===0?"dnes":"včera")+" – jízda dnes lehce, nohy potřebují 48 h.","A hard run was "+(lastOtherHard===0?"today":"yesterday")+" – an easy ride today, the legs need 48 h."))
        :L("Za posledních 7 dní byly už 3 tvrdé tréninky kola a běhu dohromady – dnes lehce.","There have already been 3 hard rides and runs together in the last 7 days – easy today."));
    } else if(phase==="taper"){
      // After the beginner and the other sport's hard day (Revize 2026-10-16).
      // One short, sharp session keeps the form; everything else is easy and shorter.
      if(readiness==="green"&&hard7===0&&eventDays>=3){kind="vo2";rationale.push(L("Krátká ostrá intenzita udrží formu, objem je nižší.","Short, sharp intensity keeps your form while the volume is lower."));}
      else kind="endurance";
    } else if(readiness==="green"&&hard7===0){
      // The quality system trained longest ago (by feedback), in phase order.
      const order=sport==="run"?(phase==="build"?["threshold","vo2max","tempo"]:["threshold","tempo","vo2max"]):phase==="build"?["threshold","vo2max","sweet_spot"]:["sweet_spot","threshold","vo2max"];
      const lastTouched=sys=>Date.parse(capabilities?.[sys]?.updated_at||"")||0;
      const pick=[...order].sort((a,b)=>lastTouched(a)-lastTouched(b))[0];
      kind=pick==="vo2max"?"vo2":pick;
      rationale.push(L("Tento týden zatím žádná kvalita a tělo je odpočaté"+(tsb!=null?" (TSB "+Math.round(tsb)+")":"")+" – je čas na kvalitní trénink. "+W.labels[pick]+" jsi z kvalitních systémů netrénoval nejdéle.","No quality yet this week and you're rested"+(tsb!=null?" (TSB "+Math.round(tsb)+")":"")+" – time for a quality session. Of the quality systems, "+W.labels[pick]+" is the one you trained longest ago."));
    } else if(readiness==="green"&&hard7===1&&(lastHard==null||lastHard>=2)){
      kind=domains.high<domains.moderate?"vo2":"threshold";
      rationale.push(L("Jedna kvalita v týdnu už byla a od ní "+(lastHard==null?"uběhlo několik dní":pluralWord(lastHard,"uběhl","uběhly","uběhlo")+" "+count(lastHard,"den","dny","dní"))+" – přidávám druhou, jiného typu.","There's been one quality session this week, "+(lastHard==null?"a few days":count(lastHard,"","","","day","days"))+" ago – I'm adding a second one of a different type."));
    } else {
      rationale.push(hard7>=2?W.two:lastHard!=null&&lastHard<2?W.recent:W.safe);
    }
  }

  const adaptations=[];
  // One check for every session, whatever chose it (the plan in Intervals.icu,
  // a kind asked for in the chat or the week plan, the phase, the coach's own
  // pick): the condensed kinds first, so the checks see what is ridden, then
  // the body (red, signs of illness, yellow), then the load (beginner, a
  // break, 48 h after a hard day of either sport, two quality days a week,
  // legs after the gym, a recovery week). Only the race and its openers keep
  // their kind.
  if(requestedMinutes<(sport==="run"?45:55)&&kind==="long_endurance"){kind="tempo";adaptations.push(L("trénink zhuštěn do dostupného času","workout condensed into the available time"));}
  if(requestedMinutes<(sport==="run"?35:50)&&["threshold","sweet_spot"].includes(kind)){kind="tempo";adaptations.push(L("krátké časové okno","short time window"));}
  const QUALITY=["tempo","sweet_spot","threshold","vo2"],quality=()=>QUALITY.includes(kind);
  // The longest session the day allows (red, illness, a break), applied with the length below.
  let cap=null;const capAt=(minutes,text)=>{if(!cap||minutes<cap.minutes)cap={minutes,text};};
  // Breathing or temperature in sleep well above the athlete's own, or a sick
  // morning check-in: no intensity and short, as Today says.
  const illness=(body.flags||[]).some(f=>/^(respiration|skin_temp|wrist_temp)_elevated$/.test(f))||checkin==="sick";
  // The cycle (cycle-model.js) as Today eases it: a bleeding day with heavy
  // flow, cramps or fatigue makes a hard ride or run easy, unless the athlete
  // kept the plan that day (Revize doporučování tréninků 2026-10-16, nález 11).
  const cycleIn=profile?.cycle||null,cycleDay=cycleIn?.days?.find?.(d=>d.date===targetDate);
  const cycleEase=Boolean(cycleIn&&!cycleDay?.keepPlan&&cycleTrainingCaution(cycleState({settings:cycleIn.settings,days:cycleIn.days,date:targetDate})));
  // Regenerace (recovery-time.js): hard training waits until hardFrom, not
  // only two calendar days; a day it does not reach by 18:00 stays easy
  // (Revize doporučování tréninků 2026-10-16, nález 12).
  const hardFrom=recoveryTime?.readyAt?localDateTime(recoveryTime.readyAt):null,notRecovered=Boolean(hardFrom&&hardFrom>targetDate+"T18:00");
  // No ride in the data at all with a known fitness says nothing about a break.
  const offBreak=lastRide!=null&&lastRide>=7;
  if(["race","openers"].includes(kind)){
    if(readiness==="red")adaptations.push(L("nízká připravenost před závodem: aktivaci zkrať a hlavně odpočívej","low readiness before the race: shorten the openers and above all rest"));
  } else {
    if(readiness==="red"){
      // Red is rest or a short, easy spin, whatever the plan or the free time.
      kind="recovery";capAt(run?30:45,L("nízká připravenost","low readiness"));
      adaptations.push(L("nízká připravenost: jen krátká regenerace","low readiness: only a short recovery session"));
    } else if(illness){
      if(quality()||kind==="long_endurance")kind="endurance";
      capAt(run?40:60,L("možný začátek nemoci","possible oncoming illness"));
      adaptations.push(L("dech nebo teplota ve spánku jsou vyšší, může jít o začátek nemoci: bez intenzity a krátce","breathing or temperature in sleep are raised, which may be an oncoming illness: no intensity and short"));
    } else if(cycleEase&&(quality()||kind==="long_endurance")){
      kind="endurance";capAt(run?30:45,L("menstruace","period"));
      adaptations.push(L("menstruace se silným krvácením, křečemi nebo únavou: dnes lehce a krátce","period with heavy flow, cramps or fatigue: easy and short today"));
    } else if(readiness==="yellow"&&quality()){
      kind="endurance";
      adaptations.push(L("střední připravenost: bez intenzity","moderate readiness: no intensity"));
    }
    if(quality()){
      const why=novice?W.novice:offBreak?W.off(lastRide):lastHard!=null&&lastHard<2?W.recent:notRecovered?L("regenerace po posledních trénincích potrvá do "+hardFrom.slice(8,10).replace(/^0/,"")+". "+hardFrom.slice(5,7).replace(/^0/,"")+". "+hardFrom.slice(11,16),"recovery from the last sessions lasts until "+hardFrom.slice(0,10)+" "+hardFrom.slice(11,16)):otherRecent?L("tvrdý trénink druhého sportu byl před méně než 48 h","a hard session of the other sport was less than 48 h ago"):hard7>=2||hardAll7>=3?L("dodržen limit kvalitních dnů","quality-day limit respected"):lowerGym.length?W.gym:recoveryWeek&&!plannedInfo?.system?L("regenerační týden: bez intenzity","recovery week: no intensity"):null;
      if(why){kind=recoveryWeek&&!plannedInfo?.system&&!novice&&!offBreak&&requestedMinutes<=75?"recovery":"endurance";adaptations.push(why);}
    }
    if(offBreak&&!novice){
      returning=true;
      if(kind==="long_endurance")kind="endurance";
      capAt(run?45:90,L("návrat po pauze","returning after a break"));
    }
  }
  // A threshold test the athlete planned (threshold-check.js): the two days
  // before it stay without intensity, the day before short and easy.
  const testDays=upcomingTest?.testDate?diffDays(upcomingTest.testDate,targetDate):null;
  if(testDays===1||testDays===2){
    if(["vo2","threshold","sweet_spot","tempo","long_endurance"].includes(kind)&&!plannedInfo?.system)kind=testDays===1?"recovery":"endurance";
    adaptations.push(testDays===1?L("zítra je test: dnes jen lehce a krátce","test tomorrow: just short and easy today"):L("pozítří je test: bez intenzity","test in two days: no intensity"));
  }

  // Back from Nemoc (athlete-state.js recoveredAt): the first three days stay
  // easy and shorter, the first one only recovery, whatever was planned.
  const sinceIll=!policy.paused&&athleteState?.recoveredAt?diffDays(targetDate,athleteState.recoveredAt):null;
  if(sinceIll!=null&&sinceIll>=0&&sinceIll<=2&&!["race","openers"].includes(kind)){
    const easy=sinceIll===0?"recovery":"endurance";
    if(kind!=="recovery"&&kind!==easy)kind=easy;
    returning=true;
    capAt(sinceIll===0?(run?30:45):(run?40:75),L("návrat po nemoci","back after being ill"));
    adaptations.push(sinceIll===0?L("první den po nemoci: jen lehce a krátce","first day after being ill: just short and easy"):L("návrat po nemoci: "+(sinceIll===1?"druhý":"třetí")+" den bez intenzity","back after being ill: day "+(sinceIll+1)+" without intensity"));
  }
  // A beginner's ride grows like a run: at most 10 % over the longest ride of
  // the last two weeks, never below an hour.
  const noviceRideLimit=(()=>{
    if(run||!novice||["race","openers"].includes(kind)||plannedInfo?.minutes)return null;
    const longest=Math.max(0,...completedAll.filter(a=>{const d=diffDays(targetDate,a.date);return d!=null&&d>=1&&d<=14;}).map(a=>n(a.durationHours,0)*60));
    const minutes=Math.max(60,Math.round(longest*1.1/5)*5);
    return {minutes,reason:longest?L("začátečník: nejdelší jízda za 2 týdny měla "+Math.round(longest)+" min, nejvýš "+minutes+" min (+10 %)","beginner: your longest ride in 2 weeks was "+Math.round(longest)+" min, so at most "+minutes+" min (+10 %)"):L("začátečník: začínám na "+minutes+" min","beginner: starting at "+minutes+" min")};
  })();
  let capacity=null;
  if(autoLength){
    capacity=capacityMinutes({ctl,tsb,sleepMinutes,readiness,recoveryWeek,returning,sport,taper:phase==="taper",ramp});
    // An easy day with room for more becomes a long ride/run – any day of the week.
    if(kind==="endurance"&&capacity.minutes>=longMinutes&&!novice){kind="long_endurance";rationale.push(sport==="run"?L("Máš kapacitu na dlouhý běh – staví vytrvalost bez intenzity.","You have capacity for a long run – it builds endurance without intensity."):L("Máš kapacitu na dlouhou aerobní jízdu – staví vytrvalost bez intenzity.","You have capacity for a long aerobic ride – it builds endurance without intensity."));}
    const len=sessionMinutesFor(kind,capacity,sport);
    requestedMinutes=clamp(len.minutes,minLen,maxLen);
    if(noviceRideLimit&&requestedMinutes>noviceRideLimit.minutes){requestedMinutes=noviceRideLimit.minutes;len.reasons.push(noviceRideLimit.reason);}
    rationale.push(L("Délka "+requestedMinutes+" min: "+len.reasons.join("; ")+". Pokud chceš jinou, zadej čas na trénink.","Duration "+requestedMinutes+" min: "+len.reasons.join("; ")+". If you want a different one, enter your training time."));
  }
  else if(!plannedInfo?.minutes){
    // The time the athlete has is a limit, not a target: an easy day, a
    // quality session or the taper does not fill three free hours.
    const before=requestedMinutes,cap={recovery:run?40:60,openers:run?30:45,race:run?20:30}[kind]??(["tempo","sweet_spot","threshold","vo2"].includes(kind)?(run?80:120):null);
    if(phase==="taper"&&kind!=="openers"&&kind!=="race")requestedMinutes=Math.max(minLen,Math.round(requestedMinutes*.65/5)*5);
    if(cap!=null)requestedMinutes=Math.min(requestedMinutes,cap);
    if(requestedMinutes<before)rationale.push(L("Délka "+requestedMinutes+" min z dostupných "+before+" min: ","Duration "+requestedMinutes+" of the available "+before+" min: ")+(phase==="taper"?L("ladění formy zkracuje objem","tapering cuts the volume"):kind==="recovery"?L("regenerace má být krátká","recovery should be short"):L("kvalita nepotřebuje víc času","quality doesn't need more time"))+".");
    if(noviceRideLimit&&requestedMinutes>noviceRideLimit.minutes){rationale.push(L("Délka "+noviceRideLimit.minutes+" min z dostupných "+requestedMinutes+" min: ","Duration "+noviceRideLimit.minutes+" of the available "+requestedMinutes+" min: ")+noviceRideLimit.reason+".");requestedMinutes=noviceRideLimit.minutes;}
  }
  if(noviceRideLimit&&kind==="long_endurance"&&requestedMinutes<longMinutes)kind="endurance";
  if(cap&&requestedMinutes>cap.minutes){rationale.push(L("Délka "+cap.minutes+" min z "+requestedMinutes+" min: "+cap.text+".","Duration "+cap.minutes+" of "+requestedMinutes+" min: "+cap.text+"."));requestedMinutes=cap.minutes;}
  // Running load grows slowly: tendons and joints adapt later than the heart
  // and lungs. Without a race, no run is more than 10 % longer than the
  // longest one of the last two weeks (30 min after a break).
  if(run&&kind!=="race"&&!plannedInfo?.minutes){
    const longest=Math.max(0,...completedAll.filter(a=>{const d=diffDays(targetDate,a.date);return d!=null&&d>=1&&d<=14;}).map(a=>n(a.durationHours,0)*60));
    const limit=Math.max(30,Math.round(longest*1.1/5)*5);
    if(requestedMinutes>limit){rationale.push(longest?L("Nejdelší běh za poslední 2 týdny měl "+Math.round(longest)+" min, dnes proto nejvýš "+limit+" min (+10 %).","Your longest run in the last 2 weeks was "+Math.round(longest)+" min, so at most "+limit+" min today (+10 %)."):L("Za poslední 2 týdny nevidím žádný běh, začínám na "+limit+" min.","I don't see any run in the last 2 weeks, starting at "+limit+" min."));requestedMinutes=limit;if(kind==="long_endurance"&&limit<longMinutes)kind="endurance";}
  }
  if(testDays===1&&!plannedInfo?.minutes)requestedMinutes=Math.min(requestedMinutes,run?30:60);
  const session=workoutTemplate(kind,requestedMinutes,cadence,sport);
  const capabilitySystem=kind==="long_endurance"?"endurance":kind==="vo2"?"vo2max":kind;
  const capability=capabilities?.[capabilitySystem]||null;
  const capabilityLevel=n(capability?.level,3);
  const progressionOffset=readiness==="green"?.45:readiness==="yellow"?-.25:-1;
  const targetDifficulty=Math.round(clamp(capabilityLevel+progressionOffset+(phase==="build"?.2:phase==="recovery"?-.6:0)-(returning||novice?1:0),1,10)*10)/10;
  const progressionAction=readiness==="red"?"deload":targetDifficulty>capabilityLevel+.1?"progress":targetDifficulty<capabilityLevel-.1?"regress":"maintain";
  const alternatives=[];
  if(kind!=="endurance") alternatives.push(workoutTemplate("endurance",Math.min(requestedMinutes,sport==="run"?60:90),cadence,sport));
  if(readiness!=="red"&&kind!=="recovery") alternatives.push(workoutTemplate("recovery",Math.min(requestedMinutes,sport==="run"?40:60),cadence,sport));
  if(requestedMinutes>=longMinutes&&kind!=="long_endurance"&&readiness==="green") alternatives.push(workoutTemplate("long_endurance",requestedMinutes,cadence,sport));

  const missing=[];
  if(sleepMinutes==null)missing.push("recent sleep duration");
  if(tsb==null)missing.push("current CTL/ATL/TSB");
  if(!completed.length)missing.push(sport==="run"?"completed runs for the current week":"completed rides for the current week");
  if(manualReadiness==null)missing.push("subjective readiness / soreness check-in");
  if(!goal)missing.push("explicit goal/event and phase");
  if(availabilityMinutes==null&&preferences.availableMinutes==null)missing.push("explicit available training time");

  return {
    ...CYCLING_COACH_V2_META,
    sport,
    date:targetDate,
    // flags: the recovery model's warnings (respiration_elevated, skin_temp_elevated, wrist_temp_elevated, hrv_trend_down) and a tired or sick check-in.
    // The "HRV +15 · Tep −8 · Spánek −13" row under the readiness on Health:
    // points each signal added to or took from 70, never beats or ms.
    readiness:{score,status:readiness,todayZone:ready.zone||null,todayScore:ready.score??null,todayParts:ready.score==null?[]:[...readinessParts(body),...(body.score!=null&&ready.score<body.score?[{key:"checkin",points:ready.score-body.score}]:[])],reasons:readinessReasons,flags:[...(body.flags||[]),...(["tired","sick"].includes(checkin)?["checkin_"+checkin]:[])],provisional:!!ready.provisional,sleepMinutes,ctl,atl,tsb,rampRate:ramp,hrv,restingHr:rhr,wristTempDeviation:bw?.deviation??null,manualReadiness:manualReadiness??null},
    load:{bikeTssRolling7d:Math.round(tss7),hardBikeDaysRolling7d:hard7,domainLoadRolling7d:domains,lowerBodyGymSignals48h:lowerGym.length},
    athleteState:policy,rationale:policy.paused?policy.guidance:rationale,week:{recoveryWeek,thisWeekLoad,lastWeekLoad},
    constraints:{availableMinutes:requestedMinutes,autoLength,novice,capacityMinutes:capacity?Math.round(capacity.minutes):null,plannedToday:plannedToday?{name:plannedToday.name,type:plannedToday.type,durationHours:plannedToday.durationHours,tss:plannedToday.tss,system:plannedInfo?.system||null,minutes:plannedInfo?.minutes||null,intensityFactor:plannedInfo?.intensityFactor??null,structure:plannedInfo?.structure||[]}:null,cadence,phase:phase||"auto"},
    recommendation:policy.paused?{session:{kind:'rest',name:policy.headline,durationMinutes:0,steps:[],cadence:null},adaptations:policy.guidance,decisionRule:'status_pause',progression:{system:null,capabilityLevel,targetDifficulty:null,action:'pause',confidence:1}}:{session,adaptations,decisionRule:readiness==="red"?"recover":readiness==="yellow"?"maintain_quality_guardrails":"progress_if_context_allows",progression:{system:capabilitySystem,capabilityLevel,targetDifficulty,action:progressionAction,confidence:n(capability?.confidence,.2)}},
    alternatives:policy.paused?[]:alternatives,
    missingData:missing,
    confidence:missing.length>=4?"low":missing.length>=2?"medium":"high"
  };
}
