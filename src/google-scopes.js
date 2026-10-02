// Google OAuth scopes. Connecting Google Health asks for HEALTH_SCOPES; the
// optional extras are asked for separately ("Rozšířit oprávnění Google"), so
// connecting never depends on them. Each user's granted scopes are stored with
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
  // Birth date from the Google account (People API), for the age.
  birthday: "https://www.googleapis.com/auth/user.birthday.read"
};

export function grantedExtras(env) {
  const granted = new Set(env.GOOGLE_SCOPES || []);
  return Object.fromEntries(Object.entries(EXTRA_SCOPES).map(([name, scope]) => [name, granted.has(scope)]));
}

// Scopes for a Google Health access token: the base ones plus weight writing
// when granted. People API scopes get their own token (see birthdayScopes);
// Google Health has rejected tokens carrying other APIs' scopes before.
export function healthScopes(env) {
  return grantedExtras(env).weightWrite ? [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite] : HEALTH_SCOPES;
}

export const birthdayScopes = [EXTRA_SCOPES.birthday];
