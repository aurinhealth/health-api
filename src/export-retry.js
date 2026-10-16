// A failed export waits longer after each attempt (10 min, 20, 40 … up to 6 h)
// and stops after EXPORT_ATTEMPTS: one broken workout must not spend Wahoo's
// app-wide daily limit or keep calling Intervals.icu every 5 minutes.
export const EXPORT_ATTEMPTS=8;
export const exportDue=(alias='')=>`(${alias}status='pending' OR (${alias}status='error' AND ${alias}updated_at<datetime('now','-'||MIN(360,5*(1<<MIN(${alias}attempts,7)))||' minutes')) OR (${alias}status='running' AND ${alias}updated_at<datetime('now','-5 minutes')))`;
export const failedExport=`status=CASE WHEN attempts+1>=${EXPORT_ATTEMPTS} THEN 'failed' ELSE 'error' END,attempts=attempts+1`;
