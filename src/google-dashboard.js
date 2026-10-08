import { localDate } from "./user-time.js";
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const day=t=>{if(!t)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;const d=new Date(t);return Number.isFinite(+d)?localDate(d):null;};
export function googleHealthSummary(rows,today,zoneRows=[]){
  const days=new Map(),coverage={};
  for(const row of rows){let p;try{p=JSON.parse(row.payload_json||'{}');}catch{continue;}
    const camel=row.data_type.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),obj=p[camel]||p,date=obj.date?`${obj.date.year}-${String(obj.date.month).padStart(2,'0')}-${String(obj.date.day).padStart(2,'0')}`:day(row.sample_time||row.end_time||row.start_time||obj.interval?.endTime||obj.interval?.startTime);
    if(!date)continue;coverage[row.data_type]=[coverage[row.data_type],date].filter(Boolean).sort().at(-1);
    const item=days.get(date)||{id:date,source:'google-health'};let key,value;
    if(row.data_type==='daily-resting-heart-rate'){key='restingHR';value=finite(row.value_numeric)??finite(obj.beatsPerMinute);}
    if(row.data_type==='daily-heart-rate-variability'){key='hrv';value=finite(obj.averageHeartRateVariabilityMilliseconds)??finite(row.value_numeric)??finite(obj.rmssd);}
    if(row.data_type==='daily-respiratory-rate'){key='respiration';value=finite(row.value_numeric)??finite(obj.breathsPerMinute);}
    // Skin temperature in sleep as the deviation from Google's own 30-day baseline.
    if(row.data_type==='daily-sleep-temperature-derivations'){const t=finite(obj.nightlyTemperatureCelsius)??finite(row.value_numeric),b=finite(obj.baselineTemperatureCelsius);if(t!=null&&b!=null){key='skinTempDeviation';value=Math.round((t-b)*100)/100;const sd=finite(obj.relativeNightlyStddev30dCelsius);if(sd!=null)item.skinTempSd=sd;}}
    if(row.data_type==='daily-vo2-max'){key='vo2max';value=finite(row.value_numeric)??finite(obj.vo2Max);}
    if(row.data_type==='steps'){key='steps';value=finite(row.value_numeric)??finite(obj.count);}
    if(row.data_type==='active-energy-burned'){key='activeCalories';value=finite(row.value_numeric)??finite(obj.kcal);}
    if(key&&value!=null)item[key]=['steps','activeCalories'].includes(key)?(item[key]||0)+value:value;
    days.set(date,item);
  }
  // Minutes in Google's heart-rate zones per local day (for all-day strain).
  for(const z of zoneRows){const date=day(z.start_time),key=String(z.zone||'').toLowerCase(),minutes=(Date.parse(z.end_time)-Date.parse(z.start_time))/60000;
    if(!date||!['light','moderate','vigorous','peak'].includes(key)||!(minutes>0&&minutes<=1440))continue;
    const item=days.get(date)||{id:date,source:'google-health'},zones=item.hrZoneMinutes||(item.hrZoneMinutes={light:0,moderate:0,vigorous:0,peak:0});zones[key]=Math.round((zones[key]+minutes)*10)/10;days.set(date,item);coverage['time-in-heart-rate-zone']=[coverage['time-in-heart-rate-zone'],date].filter(Boolean).sort().at(-1);}
  return{status:'ok',source:'google-health',coverage,wellness:[...days.values()].sort((a,b)=>a.id.localeCompare(b.id)),today:days.get(today)||{id:today,source:'google-health'}};
}
export async function googleDashboard(db,today){
  const shift=d=>new Date(Date.parse(today+'T12:00:00Z')+d*86400000).toISOString().slice(0,10),end=shift(1);
  // Daily values (one row a day) go back 61 days: recovery compares them with
  // the athlete's own 60-day baseline. Steps, energy and heart-rate zones are
  // many rows a day and only needed for the last month. The outer list of all
  // seven types lets SQLite use the (user, source, type) index; with only the
  // OR of two lists it read the whole table (~1M heart-rate rows, ~0.3 s+).
  const [data,zones]=await Promise.all([
    db.prepare(`SELECT data_type,sample_time,start_time,end_time,value_numeric,payload_json FROM health_datapoints WHERE user_id = ? AND source_family='google-wearables' AND record_role='primary' AND ((data_type IN ('daily-resting-heart-rate','daily-heart-rate-variability','daily-respiratory-rate','daily-sleep-temperature-derivations','daily-vo2-max') AND COALESCE(sample_time,end_time,start_time,'')>=?) OR (data_type IN ('steps','active-energy-burned') AND COALESCE(sample_time,end_time,start_time,'')>=?)) AND COALESCE(sample_time,end_time,start_time,'')<? AND data_type IN ('daily-resting-heart-rate','daily-heart-rate-variability','daily-respiratory-rate','daily-sleep-temperature-derivations','daily-vo2-max','steps','active-energy-burned') ORDER BY id LIMIT 40000`).bind(db.userId,shift(-61),shift(-31),end).all(),
    db.prepare(`SELECT start_time,end_time,json_extract(payload_json,'$.timeInHeartRateZone.heartRateZoneType') AS zone FROM health_datapoints WHERE user_id = ? AND source_family='google-wearables' AND record_role='primary' AND data_type='time-in-heart-rate-zone' AND start_time>=? AND start_time<? LIMIT 20000`).bind(db.userId,shift(-31),end).all().catch(()=>({results:[]}))
  ]);
  const summary=googleHealthSummary(data.results||[],today,zones.results||[]);
  const sync=await db.prepare("SELECT status,updated_at,details_json FROM sync_status WHERE user_id=? AND sync_name IN ('google','google_recent') ORDER BY updated_at DESC LIMIT 1").bind(db.userId).first();
  let detail={};try{detail=JSON.parse(sync?.details_json||'{}');}catch{}
  return {...summary,sync:{status:sync?.status||'unknown',updatedAt:sync?.updated_at,error:detail.last_error?.message||null}};
}
