async function ensure(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))').run();
}
export async function dashboardSyncStatus(db,name='dashboard_recent'){
  await ensure(db);
  // waitUntil may be stopped by the runtime without a final status write.
  // Recover abandoned app imports without expiring Google's batched queue.
  await db.prepare("UPDATE sync_status SET status='error',finished_at=datetime('now') WHERE user_id=? AND status='running' AND (sync_name LIKE 'initial_%' OR sync_name='dashboard_recent') AND updated_at<datetime('now','-5 minutes')").bind(db.userId).run();
  const row=await db.prepare("SELECT sync_name,status,details_json,updated_at,finished_at FROM sync_status WHERE user_id=? AND sync_name=?").bind(db.userId,name).first();
  const parse=run=>{try{return JSON.parse(run?.details_json||'{}');}catch{return {};}};
  const details=parse(row);
  // A connector's refresh must not wait for or report another connector's errors.
  if(name!=='dashboard_recent')return {...details,results:details.results||[],status:row?.status||'idle',updatedAt:row?.updated_at||null};
  const google=await db.prepare("SELECT status FROM sync_status WHERE user_id=? AND sync_name='google'").bind(db.userId).first();
  const initial=(await db.prepare("SELECT sync_name,status,details_json,updated_at,finished_at FROM sync_status WHERE user_id=? AND sync_name LIKE 'initial_%'").bind(db.userId).all()).results||[];
  const running=row?.status==='running'||google?.status==='running'||initial.some(r=>r.status==='running');
  // Keep the latest result for each source. A successful full retry replaces
  // that source's older recent-import failure, while other errors stay visible.
  const latest=new Map();
  for(const run of [row,...initial].filter(Boolean)){
    const data=parse(run),time=Date.parse(run.finished_at||data.finishedAt||data.startedAt||run.updated_at||'')||0;
    const source=run.sync_name.startsWith('initial_')?run.sync_name.slice(8):run.sync_name;
    const entries=data.results?.length?data.results:[{source,status:run.status}];
    for(const [index,entry] of entries.entries()){
      const key=entry.source||source+':'+index,previous=latest.get(key);
      if(!previous||time>=previous.time)latest.set(key,{time,result:run.status==='error'?{...entry,status:'error'}:entry});
    }
  }
  const results=[...latest.values()].map(r=>r.result);
  const partial=['partial','error'].includes(google?.status)||results.some(r=>['partial','error'].includes(r.status));
  return {...details,results,status:running?'running':partial?'partial':row||initial.length?'done':'idle',googleStatus:google?.status||null,updatedAt:row?.updated_at||null};
}
export async function startDashboardSync(db,ctx,work,name='dashboard_recent'){
  await ensure(db);const runId=crypto.randomUUID(),startedAt=new Date().toISOString();
  const claim=await db.prepare("INSERT INTO sync_status(user_id,sync_name,status,started_at,finished_at,details_json,updated_at) VALUES(?,?,'running',?,NULL,?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET status='running',started_at=excluded.started_at,finished_at=NULL,details_json=excluded.details_json,updated_at=excluded.updated_at WHERE sync_status.status!='running' OR sync_status.updated_at<datetime('now','-5 minutes')").bind(db.userId,name,startedAt,JSON.stringify({runId,startedAt})).run();
  if(claim.meta?.changes===0)return dashboardSyncStatus(db,name);
  ctx.waitUntil((async()=>{
    let results=[],status='done';
    try{results=await work();if(results.some(r=>r.status==='error'||r.status==='partial'))status='partial';}
    catch(error){status='error';results=[{status:'error',message:error.message}];}
    const details={runId,startedAt,finishedAt:new Date().toISOString(),results};
    await db.prepare("UPDATE sync_status SET status=?,finished_at=?,details_json=?,updated_at=datetime('now') WHERE user_id=? AND sync_name=? AND details_json LIKE ?").bind(status,details.finishedAt,JSON.stringify(details),db.userId,name,'%'+runId+'%').run();
  })());
  return {status:'running',runId,startedAt};
}
