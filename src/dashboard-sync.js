async function ensure(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))').run();
}
export async function dashboardSyncStatus(db){
  await ensure(db);
  const row=await db.prepare("SELECT status,details_json,updated_at FROM sync_status WHERE user_id=? AND sync_name='dashboard_recent'").bind(db.userId).first();
  if(!row)return {status:'idle'};
  let details={};try{details=JSON.parse(row.details_json||'{}');}catch{/* Keep status visible. */}
  return {...details,status:row.status,updatedAt:row.updated_at};
}
export async function startDashboardSync(db,ctx,work){
  await ensure(db);const runId=crypto.randomUUID(),startedAt=new Date().toISOString();
  const claim=await db.prepare("INSERT INTO sync_status(user_id,sync_name,status,started_at,finished_at,details_json,updated_at) VALUES(?,'dashboard_recent','running',?,NULL,?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET status='running',started_at=excluded.started_at,finished_at=NULL,details_json=excluded.details_json,updated_at=excluded.updated_at WHERE sync_status.status!='running' OR sync_status.updated_at<datetime('now','-5 minutes')").bind(db.userId,startedAt,JSON.stringify({runId,startedAt})).run();
  if(claim.meta?.changes===0)return dashboardSyncStatus(db);
  ctx.waitUntil((async()=>{
    let results=[],status='done';
    try{results=await work();if(results.some(r=>r.status==='error'||r.status==='partial'))status='partial';}
    catch(error){status='error';results=[{status:'error',message:error.message}];}
    const details={runId,startedAt,finishedAt:new Date().toISOString(),results};
    await db.prepare("UPDATE sync_status SET status=?,finished_at=?,details_json=?,updated_at=datetime('now') WHERE user_id=? AND sync_name='dashboard_recent' AND details_json LIKE ?").bind(status,details.finishedAt,JSON.stringify(details),db.userId,'%'+runId+'%').run();
  })());
  return {status:'running',runId,startedAt};
}
