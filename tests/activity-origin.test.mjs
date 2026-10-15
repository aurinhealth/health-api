import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalsOrigin, watchOrigin } from '../src/activity-origin.js';

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
