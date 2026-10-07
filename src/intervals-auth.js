// Intervals.icu accepts a personal API key (Basic auth) or, after the
// "Připojit Intervals.icu" button (OAuth), an access token. Both are saved as
// the user's "intervals" credential (env.INTERVALS_API_KEY); a token is kept
// with its "Bearer " prefix, so every request picks the right header here.
export const INTERVALS_TOKEN_PREFIX = "Bearer ";

export function intervalsAuthorization(credential) {
  const value = String(credential ?? "");
  return value.startsWith(INTERVALS_TOKEN_PREFIX) ? value : "Basic " + btoa("API_KEY:" + value);
}
