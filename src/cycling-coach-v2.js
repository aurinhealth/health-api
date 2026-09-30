import { classifyPlannedWorkout } from "./planned-workout.js";

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
  if(RUN_HARD_RE.test(String(a?.name||"")+" "+String(a?.tags||""))) return true;
  const intensity=n(a?.payload?.icu_intensity);
  if(intensity&&intensity>=88) return true;
  const hours=n(a?.durationHours,0);
  return n(a?.tss,0)>=50&&hours>0&&hours<=1.5&&n(a?.tss,0)/hours>=75;
}
function isHard(a){
  if(HARD_RE.test(String(a?.name||"")+" "+String(a?.tags||""))) return true;
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
function latestWellness(fitness,date){
  const rows=Array.isArray(fitness?.wellness)?fitness.wellness:[];
  return rows.filter(row=>{const age=diffDays(date,row.id);return age!=null&&age>=0&&age<=2}).at(-1)||{};
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
  if(/vo2|anaerob|sprint/.test(s)) return "high";
  if(/threshold|sweet.?spot|tempo/.test(s)) return "moderate";
  return "low";
}
function runTemplate(kind,minutes){
  const m=Math.max(20,Math.round(minutes||60));
  const templates={
    recovery:{name:"Regenerační běh",kind:"recovery",target:"pod 78 % prahového tempa, RPE 1–2",structure:[Math.min(m,40)+" min velmi lehce, klidně s chůzí"]},
    endurance:{name:"Lehký běh",kind:"endurance",target:"78–88 % prahového tempa, konverzační tempo",structure:["5 min rozklus",Math.max(15,m-5)+" min lehce"]},
    tempo:{name:"Tempový běh",kind:"tempo",target:"89–95 % prahového tempa",structure:["12 min rozklus","20–30 min tempo","8 min výklus"]},
    sweet_spot:{name:"Sub-threshold",kind:"sweet_spot",target:"95–97 % prahového tempa",structure:["12 min rozklus","5×6 min, mezi 1 min klus","8 min výklus"]},
    threshold:{name:"Prahové úseky",kind:"threshold",target:"97–101 % prahového tempa",structure:["12 min rozklus","4×8 min, mezi 2 min klus","8 min výklus"]},
    vo2:{name:"VO₂max úseky",kind:"vo2",target:"104–108 % prahového tempa",structure:["12 min rozklus + 4 rovinky","5×4 min, mezi 3 min klus","8 min výklus"]},
    long_endurance:{name:"Dlouhý běh",kind:"long_endurance",target:"80–86 % prahového tempa",structure:["10 min rozklus","souvisle lehce, kopce podle úsilí"]}
  };
  return {...(templates[kind]||templates.endurance),durationMinutes:m};
}
function workoutTemplate(kind,minutes,cadence="85–95 rpm",sport="ride"){
  if(sport==="run") return runTemplate(kind,minutes);
  const m=Math.max(30,Math.round(minutes||75));
  const templates={
    recovery:{name:"Recovery / lehké Z1",kind:"recovery",target:"45–55 % FTP nebo RPE 1–2",structure:["10 min velmi lehce","20–35 min plynule Z1","5–10 min vyjetí"],cadence},
    endurance:{name:"Endurance Z2",kind:"endurance",target:"60–72 % FTP nebo RPE 2–4",structure:["10–15 min postupný rozjezd",Math.max(20,m-25)+" min stabilní Z2","10 min vyjetí"],cadence},
    tempo:{name:"Tempo",kind:"tempo",target:"80–87 % FTP",structure:["15 min rozjezd","2×15–20 min @ 80–87 %, mezi 5 min lehce","10 min vyjetí"],cadence},
    sweet_spot:{name:"Sweet Spot",kind:"sweet_spot",target:"88–94 % FTP",structure:["15 min rozjezd","3×10–12 min @ 88–94 %, mezi 5 min lehce","10 min vyjetí"],cadence},
    threshold:{name:"Threshold",kind:"threshold",target:"95–100 % FTP",structure:["15 min rozjezd","3×10 min @ 95–100 %, mezi 5 min lehce","10 min vyjetí"],cadence},
    vo2:{name:"VO₂max",kind:"vo2",target:"108–116 % FTP",structure:["15 min rozjezd + 3 krátké aktivace","5×4 min @ 108–116 %, mezi 4 min lehce","10–15 min vyjetí"],cadence:"90–100 rpm"},
    long_endurance:{name:"Long Endurance",kind:"long_endurance",target:"60–72 % FTP",structure:["15 min lehce","souvislá Z2; kopce bez závodění","10–15 min vyjetí"],cadence}
  };
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

// Words that differ between the bike and the run coach.
const WORDS={
  ride:{hard3:"už byly nejméně 3 náročné cyklistické dny v aktuálním týdnu",hard2:"rozpočet kvalitních cyklistických dnů je už téměř vyčerpaný",today:"dnes už proběhla cyklistická jednotka",none:"V datech nevidím žádnou nedávnou jízdu – začínám aerobní jízdou; kvalitu přidám, až bude trénink zase pravidelný.",off:d=>"Posledních "+d+" dní bez jízdy – návrat přes aerobní jízdu se sníženou obtížností, kvalita přijde v dalších dnech.",two:"Dvě kvalitní jízdy v týdnu už byly – dnes aerobní objem.",recent:"Kvalita byla před méně než 48 h – dnes aerobní jízda na zotavení.",safe:"Připravenost není ideální pro kvalitu – aerobní jízda je bezpečná volba.",gym:"chránit kvalitu kola po lower-body gymu",labels:{sweet_spot:"Sweet spot",threshold:"Práh",vo2max:"VO₂max",tempo:"Tempo"}},
  run:{hard3:"už byly nejméně 3 náročné běhy v aktuálním týdnu",hard2:"rozpočet kvalitních běhů je už téměř vyčerpaný",today:"dnes už proběhl běh",none:"V datech nevidím žádný nedávný běh – začínám lehkým během; kvalitu přidám, až bude běhání zase pravidelné.",off:d=>"Posledních "+d+" dní bez běhu – návrat přes lehký běh se sníženou obtížností; šlachy a klouby si na běh zvykají pomaleji než srdce.",two:"Dva kvalitní běhy v týdnu už byly – dnes lehký objem.",recent:"Kvalita byla před méně než 48 h – dnes lehký běh na zotavení.",safe:"Připravenost není ideální pro kvalitu – lehký běh je bezpečná volba.",gym:"chránit kvalitu běhu po lower-body gymu",labels:{sweet_spot:"Sub-threshold",threshold:"Práh",vo2max:"VO₂max",tempo:"Tempo"}}
};

export function buildCyclingCoachV2({date,daily,week,fitness,health,gym,preferences={},availabilityMinutes=null,goal=null,manualReadiness=null,capabilities={},sport="ride"}={}){
  sport=sport==="run"?"run":"ride";
  const W=WORDS[sport],isSport=sport==="run"?isRun:isRide,hardOf=sport==="run"?isHardRun:isHard;
  const targetDate=isoDate(date)||new Date().toISOString().slice(0,10);
  const weekActivities=allWeekActivities(week);
  const completedAll=weekActivities.filter(a=>a.completed&&isSport(a));
  const completed=completedAll.filter(a=>{const d=diffDays(targetDate,a.date);return d!=null&&d>=0&&d<=6;});
  const planned=weekActivities.filter(a=>{if(!a.planned||!isSport(a))return false;const d=diffDays(a.date,targetDate);return d!=null&&d>=0&&d<=14;});
  const wellness=latestWellness(fitness,targetDate);
  const ctl=n(wellness.ctl),atl=n(wellness.atl),tsb=n(wellness.tsb,ctl!=null&&atl!=null?ctl-atl:null),ramp=n(wellness.rampRate??wellness.ramp_rate);
  const sleepMinutes=latestSleepMinutes(health,targetDate);
  const lowerGym=recentLowerGym(gym,targetDate,2);
  const todayCompleted=completed.filter(a=>isoDate(a.date)===targetDate);
  const hard7=completed.filter(hardOf).length;
  const tss7=completed.reduce((s,a)=>s+n(a.tss,0),0);
  const domains={low:0,moderate:0,high:0};
  for(const a of completed) domains[classifyDomain(a)]+=n(a.tss,Math.max(20,n(a.durationHours,1)*50));

  let score=100; const readinessReasons=[];
  if(tsb!=null){
    if(tsb<=-30){score-=25;readinessReasons.push("forma/únava je hluboko v záporných hodnotách");}
    else if(tsb<=-20){score-=16;readinessReasons.push("výrazná kumulovaná únava");}
    else if(tsb<=-10){score-=7;readinessReasons.push("mírná kumulovaná únava");}
  }
  if(ramp!=null&&ramp>8){score-=10;readinessReasons.push("rychlý růst tréninkové zátěže");}
  if(sleepMinutes!=null){
    if(sleepMinutes<360){score-=18;readinessReasons.push("spánek pod 6 h");}
    else if(sleepMinutes<420){score-=8;readinessReasons.push("spánek pod 7 h");}
    else if(sleepMinutes>=450) score+=3;
  }
  if(hard7>=3){score-=12;readinessReasons.push(W.hard3);}
  else if(hard7===2){score-=5;readinessReasons.push(W.hard2);}
  if(lowerGym.length){score-=8;readinessReasons.push("nedávná lower-body silová zátěž");}
  if(todayCompleted.length){score-=12;readinessReasons.push(W.today);}
  if(manualReadiness!=null){
    const m=clamp(n(manualReadiness,50),0,100);
    score=Math.round(score*0.65+m*0.35);
    readinessReasons.push("zohledněn ruční readiness check-in");
  }
  if(tsb==null){score=Math.min(score,74);readinessReasons.push("chybí aktuální ukazatel tréninkové únavy");}
  if(sleepMinutes==null){score=Math.min(score,74);readinessReasons.push("chybí aktuální spánek");}
  if(tsb==null&&sleepMinutes==null&&manualReadiness==null)score=Math.min(score,54);
  score=Math.round(clamp(score,0,100));
  const readiness=score<55?"red":score<75?"yellow":"green";

  const plannedToday=planned.find(a=>isoDate(a.date)===targetDate)||daily?.training?.planned?.find(isSport)||null;
  const plannedInfo=plannedToday?classifyPlannedWorkout(plannedToday,sport):null;
  const requestedMinutes=sport==="run"
    ?clamp(n(availabilityMinutes,n(preferences.availableMinutes,n(plannedInfo?.minutes,n(plannedToday?.durationHours)*60||60))),20,240)
    :clamp(n(availabilityMinutes,n(preferences.availableMinutes,n(plannedInfo?.minutes,n(plannedToday?.durationHours)*60||90))),30,360);
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
  const recoveryWeek=namedRecovery||(lastWeekLoad>=(sport==="run"?100:150)&&thisWeekLoad<lastWeekLoad*.7);
  if(recoveryWeek)rationale.push(namedRecovery?"Tento týden je v plánu označený jako regenerační.":"Tento týden je regenerační: plánovaná a odjetá zátěž "+thisWeekLoad+" TSS je "+Math.round(thisWeekLoad/Math.max(lastWeekLoad,1)*100)+" % minulého týdne ("+lastWeekLoad+" TSS).");
  const phase=txt(goal?.phase||preferences.phase||(recoveryWeek?"recovery":"auto"));

  let kind="endurance";
  const planText=txt(plannedToday?.name)+" "+txt(goal?.focus);
  const KIND_OF={recovery:"recovery",endurance:"endurance",tempo:"tempo",sweet_spot:"sweet_spot",threshold:"threshold",vo2max:"vo2"};
  if(plannedInfo?.system){
    kind=KIND_OF[plannedInfo.system]||"endurance";
    rationale.push("V Intervals.icu máš na tento den naplánováno „"+(plannedToday.name||"trénink")+"“"+(plannedInfo.minutes?" ("+plannedInfo.minutes+" min"+(plannedInfo.intensityFactor?", IF "+plannedInfo.intensityFactor.toFixed(2):"")+")":"")+" – doporučení se drží plánu.");
  }
  else if(/vo2|anaerob/.test(planText)) kind="vo2";
  else if(/threshold/.test(planText)) kind="threshold";
  else if(/sweet/.test(planText)) kind="sweet_spot";
  else if(/tempo/.test(planText)) kind="tempo";
  else if(requestedMinutes>=longMinutes) kind="long_endurance";
  else if(phase==="build"&&hard7<2) kind=domains.high<domains.moderate*0.35?"vo2":"threshold";
  else if(phase==="base"&&hard7<2&&domains.moderate<domains.low*0.45) kind=sport==="run"?"threshold":"sweet_spot";
  else if(!recoveryWeek){
    // Nothing planned and no phase set: decide from the recent rides.
    const lastRide=completedAll.map(a=>diffDays(targetDate,a.date)).filter(d=>d!=null&&d>=0).sort((a,b)=>a-b)[0];
    const lastHard=completedAll.filter(hardOf).map(a=>diffDays(targetDate,a.date)).filter(d=>d!=null&&d>=0).sort((a,b)=>a-b)[0];
    if(lastRide==null||lastRide>=7){
      kind="endurance";returning=true;
      rationale.push(lastRide==null?W.none:W.off(lastRide));
    } else if(readiness==="green"&&hard7===0){
      // The quality system trained longest ago (by feedback), in phase order.
      const order=sport==="run"?(phase==="build"?["threshold","vo2max","tempo"]:["threshold","tempo","vo2max"]):phase==="build"?["threshold","vo2max","sweet_spot"]:["sweet_spot","threshold","vo2max"];
      const lastTouched=sys=>Date.parse(capabilities?.[sys]?.updated_at||"")||0;
      const pick=[...order].sort((a,b)=>lastTouched(a)-lastTouched(b))[0];
      kind=pick==="vo2max"?"vo2":pick;
      rationale.push("Tento týden zatím žádná kvalita a jsi odpočatý"+(tsb!=null?" (TSB "+Math.round(tsb)+")":"")+" – je čas na kvalitní trénink. "+W.labels[pick]+" jsi z kvalitních systémů trénoval nejdéle.");
    } else if(readiness==="green"&&hard7===1&&(lastHard==null||lastHard>=2)){
      kind=domains.high<domains.moderate?"vo2":"threshold";
      rationale.push("Jedna kvalita v týdnu už byla a od ní uběhlo "+(lastHard??"několik")+" dní – přidávám druhou, jiného typu.");
    } else {
      rationale.push(hard7>=2?W.two:lastHard!=null&&lastHard<2?W.recent:W.safe);
    }
  }

  const adaptations=[];
  if(readiness==="red"){
    kind=score<40?"recovery":"endurance";
    adaptations.push("vysoká únava: zrušit intenzitu");
  } else if(readiness==="yellow"&&["vo2","threshold","sweet_spot"].includes(kind)){
    kind=requestedMinutes<=75?"endurance":"tempo";
    adaptations.push("střední readiness: snížit intenzitu nebo objem kvality");
  }
  if(hard7>=2&&["vo2","threshold","sweet_spot"].includes(kind)){
    kind="endurance"; adaptations.push("dodržen limit kvalitních dnů");
  }
  if(lowerGym.length&&["vo2","threshold"].includes(kind)){
    kind="endurance"; adaptations.push(W.gym);
  }
  if(recoveryWeek&&["vo2","threshold","sweet_spot","tempo"].includes(kind)&&!plannedInfo?.system){kind=requestedMinutes<=75?"recovery":"endurance";adaptations.push("regenerační týden: bez intenzity");}
  if(requestedMinutes<(sport==="run"?45:55)&&kind==="long_endurance"){kind="tempo";adaptations.push("trénink zhuštěn do dostupného času");}
  if(requestedMinutes<(sport==="run"?35:50)&&["threshold","sweet_spot"].includes(kind)){kind="tempo";adaptations.push("krátké časové okno");}

  const session=workoutTemplate(kind,requestedMinutes,cadence,sport);
  const capabilitySystem=kind==="long_endurance"?"endurance":kind==="vo2"?"vo2max":kind;
  const capability=capabilities?.[capabilitySystem]||null;
  const capabilityLevel=n(capability?.level,3);
  const progressionOffset=readiness==="green"?.45:readiness==="yellow"?-.25:-1;
  const targetDifficulty=Math.round(clamp(capabilityLevel+progressionOffset+(phase==="build"?.2:phase==="recovery"?-.6:0)-(returning?1:0),1,10)*10)/10;
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
    readiness:{score,status:readiness,reasons:readinessReasons,sleepMinutes,ctl,atl,tsb,rampRate:ramp,manualReadiness:manualReadiness??null},
    load:{bikeTssRolling7d:Math.round(tss7),hardBikeDaysRolling7d:hard7,domainLoadRolling7d:domains,lowerBodyGymSignals48h:lowerGym.length},
    rationale,week:{recoveryWeek,thisWeekLoad,lastWeekLoad},
    constraints:{availableMinutes:requestedMinutes,plannedToday:plannedToday?{name:plannedToday.name,type:plannedToday.type,durationHours:plannedToday.durationHours,tss:plannedToday.tss,system:plannedInfo?.system||null,minutes:plannedInfo?.minutes||null,intensityFactor:plannedInfo?.intensityFactor??null,structure:plannedInfo?.structure||[]}:null,cadence,phase:phase||"auto"},
    recommendation:{session,adaptations,decisionRule:readiness==="red"?"recover":readiness==="yellow"?"maintain_quality_guardrails":"progress_if_context_allows",progression:{system:capabilitySystem,capabilityLevel,targetDifficulty,action:progressionAction,confidence:n(capability?.confidence,.2)}},
    alternatives,
    missingData:missing,
    confidence:missing.length>=4?"low":missing.length>=2?"medium":"high"
  };
}
