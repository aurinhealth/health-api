import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFromWeatherKit, hourlyFromWeatherKit, wmoCode, weatherKitWeek, weatherKitJwt, weatherKitConfigured } from '../src/weatherkit.js';
import { pickHours, weekWeather } from '../src/adaptive-week.js';
import { withTimeZone } from '../src/user-time.js';

const p8 = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return { pair, p8: '-----BEGIN PRIVATE KEY-----\n' + btoa(String.fromCharCode(...der)) + '\n-----END PRIVATE KEY-----' };
};
const decode = part => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));

test('Apple days become the week plan\'s days in the user\'s zone', () => withTimeZone('Europe/Prague', () => {
  const data = { forecastDaily: { days: [
    { forecastStart: '2026-10-25T23:00:00Z', conditionCode: 'PartlyCloudy', temperatureMax: 14.2, temperatureMin: 6.1, precipitationAmount: 0.4, precipitationChance: 0.3, windSpeedMax: 18 },
    { forecastStart: '2026-10-26T23:00:00Z', conditionCode: 'Thunderstorms', temperatureMax: 9, temperatureMin: 3, precipitationAmount: 5, precipitationChance: 0.8, daytimeForecast: { windSpeed: 30 } },
    { forecastStart: '2026-11-02T23:00:00Z', conditionCode: 'Clear', temperatureMax: 9, temperatureMin: 3 }
  ] } };
  const days = dailyFromWeatherKit(data, '2026-10-26', '2026-11-01');
  assert.deepEqual(Object.keys(days), ['2026-10-26', '2026-10-27']);
  assert.deepEqual(days['2026-10-26'], { code: 2, max: 14.2, min: 6.1, wind: 18, rain: 0.4, rainProb: 30, source: 'apple' });
  assert.equal(days['2026-10-27'].code, 95);
  assert.equal(days['2026-10-27'].wind, 30);
}));

test('Apple hours give the card its five hours in local time', () => withTimeZone('Europe/Prague', () => {
  const hours = Array.from({ length: 24 }, (_, h) => ({ forecastStart: new Date(Date.UTC(2026, 9, 26, h - 1)).toISOString().replace('.000', ''), temperature: h + 0.4, conditionCode: 'Rain' }));
  const picked = pickHours(hourlyFromWeatherKit({ forecastHourly: { hours } }), '2026-10-26');
  assert.deepEqual(picked.map(h => h.hour), [8, 11, 14, 17, 20]);
  assert.deepEqual(picked[0], { hour: 8, temp: 8, code: 61 });
}));

test('unknown conditions have no code', () => {
  assert.equal(wmoCode('Clear'), 0);
  assert.equal(wmoCode('Something new'), null);
});

test('the developer token names the key, the team and the app', async () => {
  const { pair, p8: key } = await p8();
  const env = { WEATHERKIT_KEY_ID: 'KEY123', WEATHERKIT_KEY_P8: key, APPLE_TEAM_ID: 'TEAM456' };
  assert.equal(weatherKitConfigured(env), true);
  assert.equal(weatherKitConfigured({ APPLE_TEAM_ID: 'TEAM456' }), false);
  const token = await weatherKitJwt(env, Date.UTC(2026, 9, 26));
  const [h, c, s] = token.split('.');
  assert.deepEqual(decode(h), { alg: 'ES256', kid: 'KEY123', id: 'TEAM456.health.aurin.app' });
  const claims = decode(c);
  assert.equal(claims.iss, 'TEAM456');
  assert.equal(claims.sub, 'health.aurin.app');
  assert.equal(claims.exp - claims.iat, 3600);
  const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, sig, new TextEncoder().encode(h + '.' + c)));
});

test('the week asks Apple with the token and the user\'s zone', async () => {
  const { p8: key } = await p8();
  const env = { WEATHERKIT_KEY_ID: 'K', WEATHERKIT_KEY_P8: key, APPLE_TEAM_ID: 'T' };
  let seen;
  const fetchImpl = async (url, init) => { seen = { url: new URL(url), auth: init.headers.Authorization }; return Response.json({ forecastDaily: { days: [] } }); };
  await withTimeZone('Europe/Prague', () => weatherKitWeek(env, { latitude: 50.08, longitude: 14.42 }, '2026-10-26', fetchImpl));
  assert.equal(seen.url.pathname, '/api/v1/weather/en/50.08/14.42');
  assert.equal(seen.url.searchParams.get('dataSets'), 'forecastDaily');
  assert.equal(seen.url.searchParams.get('timezone'), 'Europe/Prague');
  assert.match(seen.auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
});

test('a failed Apple forecast leaves the week without weather', async () => {
  const { p8: key } = await p8();
  const env = { WEATHERKIT_KEY_ID: 'K2', WEATHERKIT_KEY_P8: key, APPLE_TEAM_ID: 'T' };
  const original = globalThis.fetch, error = console.error;
  globalThis.fetch = async () => new Response('nope', { status: 401 });
  console.error = () => {};
  try { assert.deepEqual(await weekWeather({ latitude: 1, longitude: 2 }, '2026-10-26', env), {}); }
  finally { globalThis.fetch = original; console.error = error; }
});
