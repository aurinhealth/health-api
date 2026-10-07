async function ensure(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))').run();
}
export async function dashboardSyncStatus(db,name='dashboard_recent'){
  await ensure(db);
  // waitUntil may be stopped by the runtime without a final status write.
  // Recover abandoned app imports without expiring Google's batched queue.
  await db.prepare("UPDATE sync_status SET status='error',finished_at=datetime('now') WHERE user_id=? AND status='running' AND (sync_name LIKE 'initial_%' OR sync_name='dashboard_recent') AND updated_at<datetime('now','-5 minutes')").bind(db.userId).run();
  const row=await db.prepare("SELECT status,details_json,updated_at FROM sync_status WHERE user_id=? AND sync_name=?").bind(db.userId,name).first();
  const google=await db.prepare("SELECT status FROM sync_status WHERE user_id=? AND sync_name='google'").bind(db.userId).first();

  let details={};try{details=JSON.parse(row?.details_json||'{}');}catch{/* Keep status visible. */}
  const initial=(await db.prepare("SELECT sync_name,status,details_json FROM sync_status WHERE user_id=? AND sync_name LIKE 'initial_%'").bind(db.userId).all()).results||[];
  const running=row?.status==='running'||google?.status==='running'||initial.some(r=>r.status==='running');
  const partial=google?.status==='partial'||google?.status==='error'||initial.some(r=>r.status==='partial'||r.status==='error');
  const results=[...(details.results||[])];
  for(const run of initial){if(run.sync_name===name)continue;try{results.push(...(JSON.parse(run.details_json||'{}').results||[]));}catch{/* Older import without details. */}}
  return {...details,results,status:running?'running':partial?'partial':row?.status||(initial.length?'done':'idle'),googleStatus:google?.status||null,updatedAt:row?.updated_at||null};
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
