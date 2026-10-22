// Where a done activity came from, for the line under its name in the app's
// detail ("Google Health", "Wahoo"): the service or device that recorded it,
// with the key of its logo in the app (IntegrationIcon; null: the name alone).
//
// An Intervals.icu activity names its upload in `source` (WAHOO, GARMIN_CONNECT,
// STRAVA, ZWIFT, OAUTH_CLIENT, UPLOAD, MANUAL) and the recorder in
// `device_name`; one written in Aurin carries external_id "loadwise:…".
const DEVICES = [
  [/wahoo|elemnt|kickr/i, { name: 'Wahoo', logo: 'wahoo' }],
  [/garmin|forerunner|fenix|f[eē]nix|edge \d|venu|epix|instinct/i, { name: 'Garmin', logo: null }],
  [/zwift/i, { name: 'Zwift', logo: null }],
  [/polar/i, { name: 'Polar', logo: null }],
  [/coros/i, { name: 'COROS', logo: null }],
  [/suunto/i, { name: 'Suunto', logo: null }],
  [/apple watch|watch\d|apple/i, { name: 'Apple Health', logo: 'apple' }],
  [/fitbit|pixel watch|google/i, { name: 'Google Health', logo: 'google' }],
  [/ultrahuman/i, { name: 'Ultrahuman', logo: 'ultrahuman' }],
  [/whoop/i, { name: 'WHOOP', logo: 'whoop' }]
];
const SOURCES = { WAHOO: 'Wahoo', GARMIN_CONNECT: 'Garmin', STRAVA: 'Strava', ZWIFT: 'Zwift', POLAR: 'Polar', COROS: 'COROS', SUUNTO: 'Suunto' };
const INTERVALS = { name: 'Intervals.icu', logo: 'intervals' };

export function intervalsOrigin(detail = {}) {
  if (String(detail.external_id || '').startsWith('loadwise:')) return { name: 'Aurin', logo: 'aurin' };
  const device = String(detail.device_name || '');
  const source = String(detail.source || '').toUpperCase();
  for (const [match, origin] of DEVICES) if (match.test(device)) return origin;
  if (SOURCES[source]) return DEVICES.map(([, o]) => o).find(o => o.name === SOURCES[source]) || { name: SOURCES[source], logo: null };
  return INTERVALS;
}

export function watchOrigin(family) {
  if (family === 'apple-health') return { name: 'Apple Health', logo: 'apple' };
  if (family === 'google-wearables') return { name: 'Google Health', logo: 'google' };
  if (family === 'wahoo') return { name: 'Wahoo', logo: 'wahoo' };
  return null;
}

// Who recorded a watch workout. Apple Health names the app or device that
// wrote it (sourceName): Google Health's iPhone app copies the Fitbit's
// workouts there, so one of those is Google Health's, with Google's logo.
export function watchRecorder(family, sourceName) {
  if (family !== 'apple-health') return watchOrigin(family);
  const name = String(sourceName || '').trim();
  if (/aurin|loadwise/i.test(name)) return { name: 'Aurin', logo: 'aurin' };
  if (/watch/i.test(name)) return { name: 'Apple Watch', logo: 'apple' };
  if (/iphone/i.test(name)) return { name: 'iPhone', logo: 'apple' };
  for (const [match, origin] of DEVICES) if (origin.logo !== 'apple' && match.test(name)) return origin;
  return { name: name ? name.slice(0, 40) : 'Apple Health', logo: 'apple' };
}

// An Apple Health workout Google Health's iPhone app wrote: a copy of one
// Google Health has itself (apple-health.js keeps Google's, which follows edits).
export const fromGoogleApp = sourceName => watchRecorder('apple-health', sourceName).logo === 'google';
