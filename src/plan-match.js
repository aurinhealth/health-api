// Which real activity fulfilled which planned session, on one day: the
// pairing behind the daily energy (index.js) and the training calendar
// (app-calendar.js), whose days then go through daySessions
// (app-training.js) like the week's sessions. Pure.

// Ride, VirtualRide, GravelRide, MountainBikeRide, EBikeRide and Google's
// *_BIKING types are all cycling.
const FAMILIES=[["strength",/weight|strength|posil/],["cycling",/ride|cycl|bik|road|mtb|gravel/],["running",/run|běh/],["walking",/walk|chůz/],["swimming",/swim|plav/]];
const KNOWN_FAMILIES=new Set(FAMILIES.map(f=>f[0]));
const familyOf=text=>(FAMILIES.find(([,re])=>re.test(String(text||"").toLowerCase()))||[null])[0];
// The type decides before the name: "Run after the ride" is a run.
function activityFamily(item){
  return familyOf(item?.type)||familyOf(item?.name)||String(item?.type||"").toLowerCase()||"other";
}
const vagueFamily=f=>!f||f==="other"||f==="unknown";

function nameOrFamilyMatch(planned,a){
  const pName=(String(planned?.name||"")+" "+String(planned?.type||"")).toLowerCase();
  const stopWords=new Set(["workout","training","trénink","planned","plan","upper","body"]);
  const tokens=(pName.match(/[a-z0-9áéěíóúůýčďňřšťž]+/gi)||[]).filter(t=>t.length>=5&&!stopWords.has(t));
  const family=activityFamily(planned);
  const aName=(String(a.name||"")+" "+String(a.type||"")).toLowerCase();
  return tokens.some(token=>aName.includes(token)) || (!vagueFamily(family) && activityFamily(a)===family);
}

// Something was recorded although its sport is unknown: a length, a distance,
// or the stub Intervals.icu shows in place of a Strava activity.
function recordedSomething(a){
  const p=a?.payload||{};
  return Number(a?.durationHours||0)>0 || Number(p.distance||p.icu_distance||0)>0 || Boolean(p._note) || /strava/i.test(String(p.source||""));
}

// Both lists are already restricted to one calendar day by D1. A plan takes at
// most one activity and an activity satisfies one plan, the strongest signal
// first for the whole day: Intervals.icu's own pairing (paired_event_id is the
// bare event id, for an app-owned plan the id it got in Intervals.icu), then
// the name or the sport, then an activity of unknown sport for a plan whose
// sport is known.
// A pairing made by hand in the app (manual-pairs.js) comes before all of
// them; a plan the user unpaired takes no activity.
export function matchPlannedWorkouts(planned, actuals, remoteIds=new Map(), manual=new Map()){
  const out=new Map(),used=new Set();
  const ids=w=>{const id=String(w?.id??"").replace(/^planned:/,"");return [id,remoteIds.get(id)].filter(Boolean).map(String);};
  const handPicked=new Set([...manual.values()].filter(Boolean));
  for(const a of actuals||[])if(handPicked.has(String(a.id??"")))used.add(a);
  for(const w of planned||[]){
    const chosen=manual.get(String(w?.id??""));
    if(chosen==null)continue;
    const a=chosen&&(actuals||[]).find(x=>String(x.id??"")===chosen);
    if(a)out.set(w,a);
  }
  const passes=[
    (w,a)=>a.pairedEventId!=null&&ids(w).includes(String(a.pairedEventId)),
    nameOrFamilyMatch,
    (w,a)=>KNOWN_FAMILIES.has(activityFamily(w))&&vagueFamily(activityFamily(a))&&recordedSomething(a)
  ];
  for(const pass of passes)for(const w of planned||[]){
    if(out.has(w)||manual.has(String(w?.id??"")))continue;
    const a=(actuals||[]).find(x=>!used.has(x)&&pass(w,x));
    if(a){out.set(w,a);used.add(a);}
  }
  return out;
}
