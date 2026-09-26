const present=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export function sampleActivityStreams(streams,limit=1200){
  const rows=Array.isArray(streams)?streams:[],time=rows.find(s=>s.type==='time')?.data||[];
  return rows.filter(s=>['time','watts','heartrate','altitude','cadence','latlng'].includes(s.type)).map(s=>{const data=Array.isArray(s.data)?s.data:[],step=Math.max(1,Math.ceil(data.length/limit));return{type:s.type,points:data.flatMap((v,i)=>{if(i%step&&i!==data.length-1)return[];if(s.type==='latlng')return Array.isArray(v)&&present(v[0])&&present(v[1])&&Math.abs(Number(v[0]))<=90&&Math.abs(Number(v[1]))<=180?[{t:present(time[i])?Number(time[i]):i,v:[Number(v[0]),Number(v[1])]}]:[];return present(v)?[{t:present(time[i])?Number(time[i]):i,v:Number(v)}]:[];})};});
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
    const keys=['id','name','type','distance','moving_time','elapsed_time','total_elevation_gain','average_watts','icu_normalized_watts','icu_weighted_average_watts','icu_ftp','average_heartrate','max_heartrate','average_cadence','icu_training_load','calories'];
    return Response.json({status:'ok',activity:Object.fromEntries(keys.filter(k=>detail[k]!=null).map(k=>[k,detail[k]])),streams:sampleActivityStreams(streams),source:'intervals.icu'},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return Response.json({message:'Detail není dostupný. Některé aktivity nemají přístupný GPS nebo výkonový stream.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
