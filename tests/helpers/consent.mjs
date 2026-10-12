// AI runs only with the user's consent (consent.js, subscription.js), so a test
// database that calls the AI as a user grants it first.
import { CONSENT_VERSION } from "../../src/consent.js";

export function grantAiConsent(db, ...userIds) {
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS user_consents (user_id INTEGER NOT NULL, kind TEXT NOT NULL, version TEXT NOT NULL, granted_at TEXT NOT NULL, withdrawn_at TEXT, PRIMARY KEY (user_id, kind))");
  const insert = db.sqlite.prepare("INSERT OR REPLACE INTO user_consents (user_id, kind, version, granted_at, withdrawn_at) VALUES (?, ?, ?, '2026-10-01T00:00:00Z', NULL)");
  for (const id of userIds) for (const kind of ["health", "ai"]) insert.run(id, kind, CONSENT_VERSION);
  return db;
}
