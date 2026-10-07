// Calculations use measurements from every source, never the export ledger.
// julianday compares offset timestamps chronologically instead of as strings.
export async function latestStoredWeight(db, userId = db.userId) {
  return db.prepare(`SELECT value_numeric, sample_time, source_family FROM health_datapoints
    WHERE user_id=? AND data_type='weight' AND value_numeric BETWEEN 30 AND 300
    ORDER BY julianday(COALESCE(sample_time,start_time)) DESC, id DESC LIMIT 1`)
    .bind(userId).first();
}
