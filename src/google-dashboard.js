const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const day=t=>{if(!t)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;const d=new Date(t);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):null;};
export function googleHealthSummary(rows,today){
  const days=new Map(),coverage={};
  for(const row of rows){let p;try{p=JSON.parse(row.payload_json||'{}');}catch{continue;}
    const camel=row.data_type.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),obj=p[camel]||p,date=obj.date?`${obj.date.year}-${String(obj.date.month).padStart(2,'0')}-${String(obj.date.day).padStart(2,'0')}`:day(row.sample_time||row.end_time||row.start_time||obj.interval?.endTime||obj.interval?.startTime);
    if(!date)continue;coverage[row.data_type]=[coverage[row.data_type],date].filter(Boolean).sort().at(-1);
    const item=days.get(date)||{id:date,source:'google-health'};let key,value;
    if(row.data_type==='daily-resting-heart-rate'){key='restingHR';value=finite(row.value_numeric)??finite(obj.beatsPerMinute);}
    if(row.data_type==='daily-heart-rate-variability'){key='hrv';value=finite(row.value_numeric)??finite(obj.rmssd);}
    if(row.data_type==='daily-vo2-max'){key='vo2max';value=finite(row.value_numeric)??finite(obj.vo2Max);}
    if(row.data_type==='steps'){key='steps';value=finite(row.value_numeric)??finite(obj.count);}
    if(row.data_type==='active-energy-burned'){key='activeCalories';value=finite(row.value_numeric)??finite(obj.kcal);}
    if(key&&value!=null)item[key]=['steps','activeCalories'].includes(key)?(item[key]||0)+value:value;
    days.set(date,item);
  }
  return{status:'ok',source:'google-health',coverage,wellness:[...days.values()].sort((a,b)=>a.id.localeCompare(b.id)),today:days.get(today)||{id:today,source:'google-health'}};
}
export async function googleDashboard(db,today){
  const oldest=new Date(today+'T12:00:00Z');oldest.setUTCDate(oldest.getUTCDate()-31);
  const data=await db.prepare(`SELECT data_type,sample_time,start_time,end_time,value_numeric,payload_json FROM health_datapoints WHERE source_family='google-wearables' AND record_role='primary' AND data_type IN ('daily-resting-heart-rate','daily-heart-rate-variability','daily-vo2-max','steps','active-energy-burned') AND COALESCE(sample_time,end_time,start_time,'')>=? ORDER BY id LIMIT 40000`).bind(oldest.toISOString().slice(0,10)).all();
  const summary=googleHealthSummary(data.results||[],today);
  const sync=await db.prepare("SELECT status,updated_at,details_json FROM sync_status WHERE sync_name='google'").first();
  let detail={};try{detail=JSON.parse(sync?.details_json||'{}');}catch{}
  return {...summary,sync:{status:sync?.status||'unknown',updatedAt:sync?.updated_at,error:detail.last_error?.message||null}};
}
