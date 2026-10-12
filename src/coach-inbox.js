// The coach's proposals (coach_inbox): drafts the athlete confirms or rejects in the
// assistant, read back as recent proposals for its context.
import { actionSummary } from "./coach-actions.js";
import { L } from "./lang.js";

export async function ensureCoachInboxTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS coach_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    message TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coach_inbox_user_0 ON coach_inbox(user_id, created_at DESC)`).run();
}

// Earlier proposals of the assistant from the last week and what became of them.
export async function recentCoachProposals(env){
  await ensureCoachInboxTable(env.DB);
  const rows=(await env.DB.prepare("SELECT draft_json,status,created_at FROM coach_inbox WHERE user_id=? AND status IN ('draft','confirmed','rejected') AND created_at>=datetime('now','-7 days') AND draft_json LIKE '%\"coach_action\"%' ORDER BY id DESC LIMIT 12").bind(env.USER_ID).all()).results||[];
  const label={draft:L('čeká na rozhodnutí', 'waiting for a decision'),confirmed:L('potvrzeno', 'confirmed'),rejected:L('odmítnuto', 'rejected')};
  return rows.map(r=>{let d={};try{d=JSON.parse(r.draft_json||'{}');}catch{/* skipped */}return d.kind==='coach_action'&&d.action?{proposal:actionSummary(d.action),status:label[r.status],createdAt:String(r.created_at).slice(0,16)}:null;}).filter(Boolean);
}
