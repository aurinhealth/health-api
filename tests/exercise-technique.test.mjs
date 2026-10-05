import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { EXERCISES } from '../src/strength-generator.js';
import { TECHNIQUE } from '../src/exercise-technique-data.js';
import { techniqueFor, youtubeId, ownExerciseVideo, saveOwnExerciseVideo } from '../src/exercise-technique.js';

test('every catalog exercise has a technique card with steps and a valid video or a search link',()=>{
  for(const name of Object.keys(EXERCISES)){
    const t=techniqueFor(name);
    assert.ok(t,name);
    assert.ok(TECHNIQUE[name]?.steps?.length>=3,name+' has no steps');
    assert.ok(TECHNIQUE[name].mistakes?.length>=1,name+' has no mistakes');
    assert.match(t.searchUrl,/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    if(t.video)assert.match(t.video.id,/^[A-Za-z0-9_-]{11}$/);
  }
  assert.equal(techniqueFor('Neexistující cvik'),null);
});

test('YouTube links of every shape give the video id; other links do not',()=>{
  for(const url of ['https://www.youtube.com/watch?v=abcdefghijk&t=10','https://youtu.be/abcdefghijk?si=x','https://m.youtube.com/shorts/abcdefghijk','https://www.youtube-nocookie.com/embed/abcdefghijk'])assert.equal(youtubeId(url),'abcdefghijk',url);
  for(const url of ['https://vimeo.com/123','javascript:alert(1)','https://youtube.com/watch?v=short','nonsense'])assert.equal(youtubeId(url),null,url);
});

test('an own video replaces the library video for that athlete only',async()=>{
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2);
  await saveOwnExerciseVideo(db,'DB shrug','https://youtu.be/abcdefghijk');
  const own=techniqueFor('DB shrug',await ownExerciseVideo(db,'DB shrug'));
  assert.deepEqual([own.video.id,own.video.source,own.ownUrl],['abcdefghijk','own','https://youtu.be/abcdefghijk']);
  assert.equal(await ownExerciseVideo(other,'DB shrug'),null);
  await saveOwnExerciseVideo(db,'DB shrug','https://example.com/shrug.mp4');
  const link=techniqueFor('DB shrug',await ownExerciseVideo(db,'DB shrug'));
  assert.equal(link.ownUrl,'https://example.com/shrug.mp4');assert.notEqual(link.video?.source,'own');
  await saveOwnExerciseVideo(db,'DB shrug','');
  assert.equal(await ownExerciseVideo(db,'DB shrug'),null);
  await assert.rejects(saveOwnExerciseVideo(db,'DB shrug','javascript:alert(1)'));
  await assert.rejects(saveOwnExerciseVideo(db,'Nic','https://youtu.be/abcdefghijk'));
});
