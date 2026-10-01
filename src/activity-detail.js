import {analyzeRide} from './ride-analysis.js';
const present=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export function sampleActivityStreams(streams,limit=1200){
  const rows=Array.isArray(streams)?streams:[],time=rows.find(s=>s.type==='time')?.data||[];
  return rows.filter(s=>['time','watts','heartrate','altitude','cadence','latlng'].includes(s.type)).map(s=>{const data=Array.isArray(s.data)?s.data:[],step=Math.max(1,Math.ceil(data.length/limit));return{type:s.type,points:data.flatMap((v,i)=>{if(i%step&&i!==data.length-1)return[];if(s.type==='latlng')return Array.isArray(v)&&present(v[0])&&present(v[1])&&Math.abs(Number(v[0]))<=90&&Math.abs(Number(v[1]))<=180?[{t:present(time[i])?Number(time[i]):i,v:[Number(v[0]),Number(v[1])]}]:[];return present(v)?[{t:present(time[i])?Number(time[i]):i,v:Number(v)}]:[];})};});
}
// Heart Rate Recovery: the drop from the peak of the last effort in zone 4+
// to the lowest heart rate within the following two minutes of the recording.
export function heartRateRecovery(time=[],hr=[],zone4=null){
  const t=i=>present(time[i])?Number(time[i]):i,valid=hr.map(Number).filter(v=>v>0);
  if(valid.length<30)return null;
  const threshold=present(zone4)?Number(zone4):Math.max(...valid)*.9;
  let last=-1;for(let i=hr.length-1;i>=0;i--){if(Number(hr[i])>=threshold&&t(hr.length-1)-t(i)>=60){last=i;break;}}
  if(last<0)return null;
  let peak=0;for(let i=last;i>=0&&t(last)-t(i)<=60;i--)peak=Math.max(peak,Number(hr[i])||0);
  let low=Infinity,seconds=0;for(let i=last+1;i<hr.length&&t(i)-t(last)<=120;i++){const v=Number(hr[i]);if(v>0&&v<low){low=v;seconds=t(i)-t(last);}}
  if(!Number.isFinite(low)||seconds<30)return null;
  return {peak:Math.round(peak),after:Math.round(low),drop:Math.round(peak-low),seconds:Math.round(seconds),threshold:Math.round(threshold)};
}
// Work intervals detected by Intervals.icu, with the numbers worth comparing.
export function activityIntervals(detail={}){
  const rows=Array.isArray(detail.icu_intervals)?detail.icu_intervals:[];
  return rows.filter(r=>present(r.elapsed_time)||present(r.moving_time)).slice(0,60).map(r=>({label:r.label||null,type:r.type||null,start:present(r.start_time)?Number(r.start_time):null,seconds:Number(r.moving_time??r.elapsed_time),watts:present(r.average_watts)?Math.round(r.average_watts):null,np:present(r.weighted_average_watts)?Math.round(r.weighted_average_watts):null,hr:present(r.average_heartrate)?Math.round(r.average_heartrate):null,maxHr:present(r.max_heartrate)?Math.round(r.max_heartrate):null,cadence:present(r.average_cadence)?Math.round(r.average_cadence):null,distance:present(r.distance)?Number(r.distance):null,zone:present(r.zone)?Number(r.zone):null}));
}
async function boundedJson(response,maxBytes=8*1024*1024){
  if(!response.ok)throw new Error('Zdroj aktivity není dostupný.');
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new Error('Záznam aktivity je příliš velký.');}chunks.push(value);}}finally{reader.releaseLock();}
  const joined=new Uint8Array(bytes);let offset=0;for(const part of chunks){joined.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(joined));
}
export async function activityDetail(request,env,id,authorized){
  if(!authorized)return Response.json({message:'Pro soukromou trasu a detail aktivity se přihlas v Nastavení.'},{status:401,headers:{'Cache-Control':'no-store'}});
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id||''))return Response.json({message:'Neplatná aktivita.'},{status:400});
  if(!env.INTERVALS_API_KEY)return Response.json({message:'Nejprve připoj Intervals.icu.'},{status:409});
  const headers={Authorization:'Basic '+btoa('API_KEY:'+String(env.INTERVALS_API_KEY)),Accept:'application/json'},base='https://intervals.icu/api/v1/activity/'+encodeURIComponent(id);
  try{
    const [detail,streams]=await Promise.all([fetch(base+'?intervals=true',{headers,signal:AbortSignal.timeout(10000)}).then(boundedJson),fetch(base+'/streams?types=time,watts,heartrate,altitude,cadence,latlng',{headers,signal:AbortSignal.timeout(10000)}).then(boundedJson).catch(()=>[])]);
    const keys=['id','name','type','distance','moving_time','elapsed_time','total_elevation_gain','average_watts','icu_average_watts','icu_weighted_avg_watts','icu_normalized_watts','icu_weighted_average_watts','icu_ftp','average_heartrate','max_heartrate','average_cadence','icu_training_load','calories'];
    const activity=Object.fromEntries(keys.filter(k=>detail[k]!=null).map(k=>[k,detail[k]]));
    activity.average_watts=detail.icu_average_watts??detail.average_watts;
    activity.icu_normalized_watts=detail.icu_weighted_avg_watts??detail.icu_normalized_watts??detail.icu_weighted_average_watts;
    const stream=type=>(Array.isArray(streams)?streams:[]).find(x=>x.type===type)?.data||[],zones=Array.isArray(detail.icu_hr_zones)?detail.icu_hr_zones:null;
    const hrr=heartRateRecovery(stream('time'),stream('heartrate'),zones&&zones.length>=4?Number(zones[2])+1:null);
    return Response.json({status:'ok',activity,analysis:analyzeRide(activity,streams),streams:sampleActivityStreams(streams),intervals:activityIntervals(detail),hrr,source:'intervals.icu'},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return Response.json({message:'Detail není dostupný. Některé aktivity nemají přístupný GPS nebo výkonový stream.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
