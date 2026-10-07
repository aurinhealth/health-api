import {normalizeProfile,energyBaseline,effectiveProfile} from './energy-profile.js';
import {readSuggestions} from './profile-suggestions.js';
import {normalizeAvailability} from './training-availability.js';
import {pragueToday} from './prague-date.js';
export async function ensureOnboarding(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS user_setup (user_id INTEGER PRIMARY KEY,completed_at TEXT,training_json TEXT NOT NULL DEFAULT \'{}\')').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY(user_id,id))').run();
}
export async function trainingSetup(db){
  await ensureOnboarding(db);const row=await db.prepare('SELECT training_json FROM user_setup WHERE user_id=?').bind(db.userId).first();
  try{return JSON.parse(row?.training_json||'{}');}catch{return {};}
}
export async function hasRecentActivityData(db,userId=db.userId){
  return Boolean(await db.prepare("SELECT id FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND COALESCE(start_time,sample_time)>=date('now','-28 days') AND (record_role IS NULL OR record_role!='duplicate') LIMIT 1").bind(userId).first());
}
export async function onboardingStatus(env){
  const db=env.DB;await ensureOnboarding(db);
  const [row,saved,suggestions,weight,tracked]=await Promise.all([
    db.prepare('SELECT completed_at,training_json FROM user_setup WHERE user_id=?').bind(db.userId).first(),
    db.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1').bind(db.userId).first(),readSuggestions(db,db.userId),
    db.prepare("SELECT value_numeric FROM health_datapoints WHERE user_id=? AND data_type IN ('weight','weight-written') AND value_numeric>0 ORDER BY COALESCE(sample_time,start_time) DESC LIMIT 1").bind(db.userId).first(),hasRecentActivityData(db)]);
  const profile=effectiveProfile(JSON.parse(saved?.profile_json||'{}'),suggestions),baseline=energyBaseline(profile,weight?.value_numeric,{activityTracked:tracked});
  const training=JSON.parse(row?.training_json||'{}');
  return {status:'ok',completed:Boolean(row?.completed_at),completedAt:row?.completed_at||null,profile,suggestions,weightKg:weight?.value_numeric||null,baseline,training,activityTracked:tracked,connectedProviders:env.CONNECTED_PROVIDERS||[]};
}
export function normalizeTraining(input={}){
  const experience=['beginner','regular','experienced'].includes(input.experience)?input.experience:'';
  const equipment=['gym','dumbbells','bodyweight'].includes(input.equipment)?input.equipment:'';
  const limitations=String(input.limitations||'').trim().slice(0,500);
  const availability=normalizeAvailability(input.availability);
  if(!experience||!equipment||!Array.isArray(input.availability)||input.availability.length!==7||availability.some(d=>d.minutes==null))throw new Error('Vyplň zkušenost, vybavení a časové možnosti pro celý týden.');
  return {experience,equipment,limitations,availability};
}
export async function completeOnboarding(env,input){
  const db=env.DB;await ensureOnboarding(db);
  const profile=normalizeProfile(input.profile),training=normalizeTraining(input.training),weight=Number(input.weightKg);
  if(!profile.mainSport||!profile.sportGoal)throw new Error('Vyber hlavní sport a napiš svůj tréninkový cíl.');
  if(!Number.isFinite(weight)||weight<35||weight>250)throw new Error('Zadej platnou hmotnost od 35 do 250 kg.');
  const baseline=energyBaseline(profile,weight,{activityTracked:await hasRecentActivityData(db)});
  if(!baseline.ready)throw new Error('Doplň údaje pro kalorie: '+baseline.missing.join(', '));
  const date=pragueToday(),start=date+'T12:00:00',payload=JSON.stringify({kg:weight,date,source:'manual'});
  await db.batch([
    db.prepare('INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,1,?) ON CONFLICT(user_id,id) DO UPDATE SET profile_json=excluded.profile_json').bind(db.userId,JSON.stringify(profile)),
    db.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,value_numeric,value_unit,payload_json) VALUES(?,'manual','weight',?,?,?,?, 'kg',?) ON CONFLICT(user_id,source_family,data_type,external_id) DO UPDATE SET value_numeric=excluded.value_numeric,payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId,'onboarding-weight:'+date,start,start,weight,payload),
    db.prepare("INSERT INTO user_setup(user_id,completed_at,training_json) VALUES(?,CURRENT_TIMESTAMP,?) ON CONFLICT(user_id) DO UPDATE SET completed_at=COALESCE(user_setup.completed_at,excluded.completed_at),training_json=excluded.training_json").bind(db.userId,JSON.stringify(training))
  ]);
  return {status:'ok',completed:true,profile,training,baseline};
}
