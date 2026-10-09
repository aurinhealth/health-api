-- 0015 is drop_unused_tables.
-- Problems the user reports from the app (Settings → Nahlásit problém,
-- src/support-report.js): their message, an optional JPEG screenshot (base64)
-- and the app's diagnostics. Also e-mailed to the operator when e-mail is set up.
CREATE TABLE IF NOT EXISTS support_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  screenshot_base64 TEXT,
  diagnostics_json TEXT,
  emailed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_support_reports_user ON support_reports(user_id, created_at DESC);
