import {METAGYM_KUTNA_HORA,OTHER_STATION_IDS} from './gym-equipment.js';
import {normalizeProfile,energyBaseline,effectiveProfile} from './energy-profile.js';
import {readSuggestions} from './profile-suggestions.js';
import {normalizeAvailability} from './training-availability.js';
import { localToday } from "./user-time.js";
import {trainingHistory,starterPlan} from './training-history.js';
import {latestStoredWeight} from './athlete-weight.js';
export async function ensureOnboarding(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS user_setup (user_id INTEGER PRIMARY KEY,completed_at TEXT,training_json TEXT NOT NULL DEFAULT \'{}\')').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY(user_id,id))').run();
}
export async function trainingSetup(db){
  await ensureOnboarding(db);const row=await db.prepare('SELECT training_json FROM user_setup WHERE user_id=?').bind(db.userId).first();
  let saved={};try{saved=JSON.parse(row?.training_json||'{}');}catch{}
  const history=await trainingHistory(db);
  const places=Array.isArray(saved.places)&&saved.places.length?{places:saved.places,activePlace:saved.activePlace}:legacyPlaces(saved);
  return {...saved,...places,experience:!saved.experience||saved.experience==='auto'?history.experience:saved.experience,experienceMode:!saved.experience||saved.experience==='auto'?'auto':'manual',equipment:saved.equipment||'bodyweight',history};
}

// Places to train: several gyms and a home gym, each with its own stations,
// name, web page and dumbbells. The active one is mirrored into the flat
// fields (equipment, stations, gymName, gymUrl, dumbbellWeights) that the
// generator reads, so switching places never overwrites another's list.
const PLACE_KINDS=['gym','home'];
const validStation=id=>Object.hasOwn(METAGYM_KUTNA_HORA.stations,id)||OTHER_STATION_IDS.includes(id);
// "gym" (the setting before places) meant METAGYM Kutná Hora.
const ALL_STATIONS=Object.keys(METAGYM_KUTNA_HORA.stations);
const cleanUrl=v=>/^https?:\/\/\S+$/i.test(String(v||'').trim())?String(v).trim().slice(0,300):'';
const cleanWeights=v=>[...new Set((Array.isArray(v)?v:[]).map(Number).filter(kg=>Number.isFinite(kg)&&kg>0&&kg<=100).map(kg=>Math.round(kg*4)/4))].sort((a,b)=>a-b).slice(0,60);
export function normalizePlaces(input){
  const seen=new Set();
  return (Array.isArray(input)?input:[]).slice(0,10).map((p,i)=>{
    let id=/^[a-z0-9-]{1,40}$/.test(String(p?.id||''))?String(p.id):'place-'+(i+1);
    while(seen.has(id))id+='-'+i;seen.add(id);
    const kind=PLACE_KINDS.includes(p?.kind)?p.kind:'gym';
    return {id,kind,name:String(p?.name||'').trim().slice(0,80)||(kind==='home'?'Domácí posilovna':'Posilovna'),
      stations:[...new Set((Array.isArray(p?.stations)?p.stations:[]).map(String).filter(validStation))],url:cleanUrl(p?.url),dumbbellWeights:cleanWeights(p?.dumbbellWeights)};
  });
}
// Accounts saved before places: their one gym or home gym becomes the first place.
export function legacyPlaces(saved={}){
  const equipment=saved.equipment||'bodyweight';
  if(equipment==='bodyweight'&&!(saved.stations||[]).length)return {places:[],activePlace:'bodyweight'};
  const home=equipment==='home'||equipment==='dumbbells';
  const stations=equipment==='gym'?ALL_STATIONS:equipment==='dumbbells'?['dumbbells','adjustable_bench','floor_mats']:(saved.stations||[]);
  return {places:normalizePlaces([{id:'place-1',kind:home?'home':'gym',name:saved.gymName,stations,url:saved.gymUrl,dumbbellWeights:saved.dumbbellWeights}]),activePlace:'place-1'};
}
// The flat fields from the active place ("bodyweight": none).
export function mirrorActivePlace(training){
  const places=normalizePlaces(training.places);
  const active=places.find(p=>p.id===training.activePlace);
  if(training.activePlace==='bodyweight'||!active)return {...training,places,activePlace:active?active.id:'bodyweight',equipment:'bodyweight',stations:[],gymName:'',gymUrl:'',dumbbellWeights:[]};
  return {...training,places,activePlace:active.id,equipment:active.kind==='home'?'home':'custom',stations:active.stations,gymName:active.name,gymUrl:active.url,dumbbellWeights:active.dumbbellWeights};
}
export async function hasRecentActivityData(db,userId=db.userId){
  return Boolean(await db.prepare("SELECT id FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND COALESCE(start_time,sample_time)>=date('now','-28 days') AND (record_role IS NULL OR record_role!='duplicate') LIMIT 1").bind(userId).first());
}
export async function onboardingStatus(env){
  const db=env.DB;await ensureOnboarding(db);
  const [row,saved,suggestions,weight,tracked]=await Promise.all([
    db.prepare('SELECT completed_at,training_json FROM user_setup WHERE user_id=?').bind(db.userId).first(),
    db.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1').bind(db.userId).first(),readSuggestions(db,db.userId),
    latestStoredWeight(db),hasRecentActivityData(db)]);
  const history=await trainingHistory(db),savedProfile=JSON.parse(saved?.profile_json||'{}');
  const profile=effectiveProfile(savedProfile,suggestions);
  if(!profile.goal)profile.goal='maintain';
  const baseline=energyBaseline(profile,weight?.value_numeric,{activityTracked:tracked});
  const training=await trainingSetup(db);
  return {status:'ok',completed:Boolean(row?.completed_at),completedAt:row?.completed_at||null,profile,savedProfile,suggestions,weightKg:weight?.value_numeric||null,baseline,training,history,automaticPlan:starterPlan(history,training.experience),activityTracked:tracked,connectedProviders:env.CONNECTED_PROVIDERS||[]};
}
export function normalizeTraining(input={}){
  const experience=['beginner','regular','experienced'].includes(input.experience)?input.experience:'auto';
  const equipment=['gym','custom','home','dumbbells','bodyweight'].includes(input.equipment)?input.equipment:'bodyweight';
  const limitations=String(input.limitations||'').trim().slice(0,500);
  const availability=normalizeAvailability(input.availability);
  // Own gym: the stations it has (ids of METAGYM_KUTNA_HORA.stations and the usual others), its name and web page.
  const stations=[...new Set((Array.isArray(input.stations)?input.stations:[]).map(String).filter(id=>Object.hasOwn(METAGYM_KUTNA_HORA.stations,id)||OTHER_STATION_IDS.includes(id)))];
  const gymName=String(input.gymName||'').trim().slice(0,120),gymUrl=/^https?:\/\/\S+$/i.test(String(input.gymUrl||'').trim())?String(input.gymUrl).trim().slice(0,300):'';
  // The dumbbells there are (kg per hand), so the plan asks for a weight that exists.
  const dumbbellWeights=[...new Set((Array.isArray(input.dumbbellWeights)?input.dumbbellWeights:[]).map(Number).filter(kg=>Number.isFinite(kg)&&kg>0&&kg<=100).map(kg=>Math.round(kg*4)/4))].sort((a,b)=>a-b).slice(0,60);
  const kind=equipment==='custom'&&!stations.length?'gym':equipment==='home'&&!stations.length?'dumbbells':equipment;
  const places=normalizePlaces(input.places);
  const activePlace=input.activePlace==='bodyweight'||places.some(p=>p.id===input.activePlace)?String(input.activePlace):places[0]?.id||'bodyweight';
  // The gym goal (strength-generator.js goalReps), the warm-up and the stretching (on unless turned off).
  const goal=['strength','strength_muscle','muscle','muscle_fitness','fitness'].includes(input.goal)?input.goal:'auto';
  const stretching=input.stretching!==false,warmup=input.warmup!==false,warmupCardio=input.warmupCardio!==false;
  return {experience,equipment:kind,limitations,availability,stations,gymName,gymUrl,dumbbellWeights,places,activePlace,goal,warmup,warmupCardio,stretching};
}
export async function updateTrainingSetup(db,input={}){
  await ensureOnboarding(db);
  const row=await db.prepare('SELECT training_json FROM user_setup WHERE user_id=?').bind(db.userId).first();
  const old=JSON.parse(row?.training_json||'{}');
  // Saving places: the flat fields follow the active place. Saving the flat
  // fields (the setup, the web): they go into the active place too.
  const merged={...old,...(Array.isArray(old.places)&&old.places.length?{}:legacyPlaces(old)),...input};
  const usesPlaces=Array.isArray(input.places)||input.activePlace!=null;
  const training=normalizeTraining(usesPlaces?mirrorActivePlace(merged):intoActivePlace(merged));
  await db.prepare("INSERT INTO user_setup(user_id,training_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET training_json=excluded.training_json").bind(db.userId,JSON.stringify(training)).run();
  return trainingSetup(db);
}
// Flat fields saved without places (setup, web): written into the active place.
function intoActivePlace(training){
  const places=normalizePlaces(training.places),i=places.findIndex(p=>p.id===training.activePlace);
  if(training.equipment==='bodyweight')return {...training,places,activePlace:'bodyweight'};
  if(i<0)return training;
  const home=training.equipment==='home'||training.equipment==='dumbbells';
  places[i]={...places[i],kind:home?'home':'gym',stations:training.equipment==='gym'?ALL_STATIONS:training.equipment==='dumbbells'?['dumbbells','adjustable_bench','floor_mats']:(training.stations||[]).filter(validStation),
    name:String(training.gymName||'').trim()||places[i].name,url:cleanUrl(training.gymUrl)||places[i].url,dumbbellWeights:cleanWeights(training.dumbbellWeights)};
  return {...training,places};
}
export async function completeOnboarding(env,input={}){
  const db=env.DB;await ensureOnboarding(db);
  const oldProfile=await db.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1').bind(db.userId).first();
  const previous=JSON.parse(oldProfile?.profile_json||'{}');
  const oldTraining=await db.prepare('SELECT training_json FROM user_setup WHERE user_id=?').bind(db.userId).first();
  const profile=normalizeProfile({...previous,...input.profile,goal:input.profile?.goal||previous.goal||'maintain'}),training=normalizeTraining({...JSON.parse(oldTraining?.training_json||'{}'),...input.training});
  const supplied=input.weightKg!=null&&input.weightKg!=='';
  const previousWeight=await latestStoredWeight(db);
  const weight=supplied?Number(input.weightKg):previousWeight?.value_numeric;
  if(supplied&&(!Number.isFinite(weight)||weight<35||weight>250))throw new Error('Zadej platnou hmotnost od 35 do 250 kg.');
  const history=await trainingHistory(db);
  if(profile.sportHours==='auto'&&!history.automaticSportAvailable)profile.sportHours='';
  const baseline=energyBaseline(effectiveProfile(profile,await readSuggestions(db,db.userId)),weight,{activityTracked:await hasRecentActivityData(db)});
  const date=localToday(),start=date+'T12:00:00',payload=JSON.stringify({kg:weight,date,source:'manual'});
  await db.batch([
    db.prepare('INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,1,?) ON CONFLICT(user_id,id) DO UPDATE SET profile_json=excluded.profile_json').bind(db.userId,JSON.stringify(profile)),
    ...(supplied?[db.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,value_numeric,value_unit,payload_json) VALUES(?,'manual','weight',?,?,?,?, 'kg',?) ON CONFLICT(user_id,source_family,data_type,external_id) DO UPDATE SET value_numeric=excluded.value_numeric,payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId,'onboarding-weight:'+date,start,start,weight,payload)]:[]),
    db.prepare("INSERT INTO user_setup(user_id,completed_at,training_json) VALUES(?,CURRENT_TIMESTAMP,?) ON CONFLICT(user_id) DO UPDATE SET completed_at=COALESCE(user_setup.completed_at,excluded.completed_at),training_json=excluded.training_json").bind(db.userId,JSON.stringify(training))
  ]);
  return {...await onboardingStatus(env),status:'ok',completed:true,baseline};
}
