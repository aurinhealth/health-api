import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalsOrigin, watchOrigin, watchRecorder, fromGoogleApp } from '../src/activity-origin.js';

test('an Intervals.icu activity names the device or service that recorded it', () => {
  assert.deepEqual(intervalsOrigin({ source: 'OAUTH_CLIENT', device_name: 'Wahoo ELEMNT BOLT' }), { name: 'Wahoo', logo: 'wahoo' });
  assert.deepEqual(intervalsOrigin({ source: 'WAHOO' }), { name: 'Wahoo', logo: 'wahoo' });
  assert.deepEqual(intervalsOrigin({ source: 'GARMIN_CONNECT', device_name: 'Forerunner 965' }), { name: 'Garmin', logo: null });
  assert.deepEqual(intervalsOrigin({ source: 'STRAVA' }), { name: 'Strava', logo: null });
  assert.deepEqual(intervalsOrigin({ source: 'MANUAL' }), { name: 'Intervals.icu', logo: 'intervals' });
  assert.deepEqual(intervalsOrigin({ source: 'OAUTH_CLIENT', external_id: 'loadwise:1:abc' }), { name: 'Aurin', logo: 'aurin' });
});

test('a watch workout names its health app', () => {
  assert.equal(watchOrigin('google-wearables').name, 'Google Health');
  assert.equal(watchOrigin('apple-health').logo, 'apple');
  assert.equal(watchOrigin('other'), null);
});

test('an Apple Health workout names the app that wrote it, with its logo', () => {
  assert.deepEqual(watchRecorder('apple-health', 'Google Health'), { name: 'Google Health', logo: 'google' });
  assert.deepEqual(watchRecorder('apple-health', 'Fitbit'), { name: 'Google Health', logo: 'google' });
  assert.deepEqual(watchRecorder('apple-health', 'Apple Watch uživatele Petr'), { name: 'Apple Watch', logo: 'apple' });
  assert.deepEqual(watchRecorder('apple-health', 'Ultrahuman'), { name: 'Ultrahuman', logo: 'ultrahuman' });
  assert.deepEqual(watchRecorder('apple-health', ''), { name: 'Apple Health', logo: 'apple' });
  assert.deepEqual(watchRecorder('google-wearables', 'Apple Watch'), { name: 'Google Health', logo: 'google' });
  assert.equal(fromGoogleApp('Google Health'), true);
  assert.equal(fromGoogleApp('Apple Watch'), false);
});
