import { readAllowed } from "./source-reading.js";

// Google OAuth scopes. Connecting Google Health asks for HEALTH_SCOPES and the
// optional extras on one Google page; the user may untick the extras there, so
// nothing depends on them. Each user's granted scopes are stored with
// their connection (provider "google_scopes") and loaded as env.GOOGLE_SCOPES.

export const HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.nutrition.readonly",
  "https://www.googleapis.com/auth/googlehealth.nutrition.writeonly"
];

export const EXTRA_SCOPES = {
  // Writing weight to Google Health (manual entries, weight from Intervals.icu).
  weightWrite: "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.writeonly",
  // Writing workouts logged in the app to Google Health (Synchronizace,
  // sync-destinations.js). Only ever an extra, never one of HEALTH_SCOPES.
  activityWrite: "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.writeonly",
  // Birth date from the Google account (People API), for the age.
  birthday: "https://www.googleapis.com/auth/user.birthday.read",
  // The route of a workout recorded with GPS (exportExerciseTcx, watch-detail.js).
  location: "https://www.googleapis.com/auth/googlehealth.location.readonly"
};

// Base permissions by what they unlock, for the connection status and for
// skipping data whose permission the user did not give.
export const HEALTH_PERMISSIONS = {
  activity: HEALTH_SCOPES[0],
  metrics: HEALTH_SCOPES[1],
  sleep: HEALTH_SCOPES[2],
  nutritionRead: HEALTH_SCOPES[3],
  nutritionWrite: HEALTH_SCOPES[4]
};

export function grantedExtras(env) {
  const granted = new Set(env.GOOGLE_SCOPES || []);
  return Object.fromEntries(Object.entries(EXTRA_SCOPES).map(([name, scope]) => [name, granted.has(scope)]));
}

// Google's consent screen lets the user untick single permissions, so what was
// asked for is not always what was granted. Connections saved before the
// granted scopes were stored are taken as granting everything asked for.
function grantedSet(env) {
  return Array.isArray(env.GOOGLE_SCOPES) && env.GOOGLE_SCOPES.length ? new Set(env.GOOGLE_SCOPES) : null;
}
export function hasGoogleScope(env, scope) {
  const granted = grantedSet(env);
  return !granted || granted.has(scope);
}
// Base permissions the user did not give, by name (see HEALTH_PERMISSIONS).
export function missingHealthPermissions(env) {
  return Object.entries(HEALTH_PERMISSIONS).filter(([, scope]) => !hasGoogleScope(env, scope)).map(([name]) => name);
}

// Which base permission each synced Google Health data type needs. Types the
// user did not grant are skipped instead of failing the sync; a type missing
// here is always asked for.
const TYPE_PERMISSION = {
  sleep: "sleep", "respiratory-rate-sleep-summary": "sleep",
  "heart-rate": "metrics", "heart-rate-variability": "metrics", "oxygen-saturation": "metrics",
  "daily-resting-heart-rate": "metrics", "daily-heart-rate-variability": "metrics", "daily-oxygen-saturation": "metrics",
  "daily-respiratory-rate": "metrics", "daily-sleep-temperature-derivations": "metrics", weight: "metrics", "body-fat": "metrics",
  "active-energy-burned": "activity", "active-minutes": "activity", "active-zone-minutes": "activity", steps: "activity",
  distance: "activity", floors: "activity", "sedentary-period": "activity", "time-in-heart-rate-zone": "activity",
  "daily-heart-rate-zones": "activity", "daily-vo2-max": "activity", exercise: "activity", "total-calories": "activity"
};
// A type the user switched off in Zdroje dat (env.READ_OFF, source-reading.js) is skipped too.
export function googleTypeAllowed(env, type) {
  if (!readAllowed(env.READ_OFF, "google", type)) return false;
  const permission = TYPE_PERMISSION[type];
  return !permission || hasGoogleScope(env, HEALTH_PERMISSIONS[permission]);
}
// A refusal for a data type when the user gave only some permissions is a
// permission the user chose not to give, not a failed sync.
export function skippedForPermission(env, error) {
  return /HTTP 403/.test(String(error?.message || "")) && missingHealthPermissions(env).length > 0;
}

// Scopes for a Google Health access token: the granted base ones plus weight
// and workout writing when granted. Asking a refresh for a scope the user did not grant
// fails the whole token. People API scopes get their own token (see
// birthdayScopes); Google Health has rejected tokens carrying other APIs'
// scopes before.
export function healthScopes(env) {
  const extras = grantedExtras(env);
  const wanted = [...HEALTH_SCOPES, ...(extras.weightWrite ? [EXTRA_SCOPES.weightWrite] : []), ...(extras.activityWrite ? [EXTRA_SCOPES.activityWrite] : []), ...(extras.location ? [EXTRA_SCOPES.location] : [])];
  return wanted.filter(scope => hasGoogleScope(env, scope));
}

export const birthdayScopes = [EXTRA_SCOPES.birthday];
