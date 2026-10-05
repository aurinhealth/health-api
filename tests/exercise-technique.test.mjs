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

test('every catalog exercise says where to feel it and what must not hurt',async()=>{
  const { FEEL } = await import('../src/exercise-feel.js');
  for(const name of Object.keys(EXERCISES)){
    assert.equal(FEEL[name]?.length,2,name+' has no feel cues');
    assert.deepEqual(techniqueFor(name).feel,FEEL[name]);
    assert.equal(techniqueFor(name).source,'library');
  }
  assert.deepEqual(Object.keys(FEEL).filter(name=>!EXERCISES[name]),[]);
});

test('an exercise outside the catalog gets its card written once by AI, stored and reused',async()=>{
  const { storedTechnique, generateTechnique, exerciseInUse } = await import('../src/exercise-technique.js');
  const { importStrengthHistory } = await import('../src/strength-history.js');
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2),original=globalThis.fetch,calls=[];
  const answer={setup:['Kettlebell mezi chodidly.','Záda rovná.'],steps:['Boky dozadu.','Švih z kyčlí.','Nahoře zpevni hýždě.'],feel:['Hýždě a zadní stehna.','Spodní záda nebolí.'],mistakes:['Dřep místo předklonu.'],breathing:'Výdech nahoře.',videoId:'abcdefghijk',videoTitle:'Kettlebell swing',query:'kettlebell swing form'};
  globalThis.fetch=async(_,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json({model:body.model,output_text:JSON.stringify(answer)});};
  try{
    const env={OPENAI_API_KEY:'test',DB:db};
    // Only an exercise the athlete really has.
    assert.equal(await exerciseInUse(db,'Kettlebell swing'),false);
    await importStrengthHistory(db,{date:'2026-10-04',sets:[{exercise:'Kettlebell swing',actualKg:16,actualReps:15,completed:true}]});
    assert.equal(await exerciseInUse(db,'Kettlebell swing'),true);
    assert.equal(await exerciseInUse(other,'Kettlebell swing'),false);
    const made=await generateTechnique(env,'Kettlebell swing');
    assert.equal(calls.length,1);assert.equal(calls[0].model,'gpt-6-luna');assert.deepEqual(calls[0].tools,[{type:'web_search'}]);
    assert.deepEqual(made.video,{id:'abcdefghijk',title:'Kettlebell swing'});
    // Stored for everyone: the next athlete reads it without the AI.
    const stored=await storedTechnique(other,'Kettlebell swing');
    const card=techniqueFor('Kettlebell swing',null,stored);
    assert.equal(card.source,'ai');assert.deepEqual(card.steps,answer.steps);assert.deepEqual(card.feel,answer.feel);assert.equal(card.video.id,'abcdefghijk');
    assert.equal(techniqueFor('Kettlebell swing'),null);
    // A broken answer stores nothing; an invalid video id is dropped.
    answer.steps=['Jen jeden krok.'];await assert.rejects(generateTechnique(env,'Sandbag carry'));
    assert.equal(await storedTechnique(db,'Sandbag carry'),null);
    answer.steps=['a','b','c'];answer.videoId='javascript:x';
    assert.equal((await generateTechnique(env,'Sandbag carry')).video,null);
  }finally{globalThis.fetch=original;}
  const entry=(await import('node:fs')).readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
  assert.match(entry,/if\(!stored&&env\.OPENAI_API_KEY&&await exerciseInUse\(env\.DB,exercise\)\)stored=await generateTechnique\(env,exercise\)/);
});
