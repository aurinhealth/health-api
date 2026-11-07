import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { appendChatTurn, appendChatTurnIds, chatContext, listChats, readChat, deleteChat, chatTitle, openChatForAnswer, dropEmptyChat } from '../src/assistant-chats.js';

test('a chat keeps its own turns; a new chat starts without the old context',async()=>{
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2);
  const first=await appendChatTurn(db,null,'Jak mám jet zítra?','Lehce, 90 minut v Z2.');
  assert.ok(first>0);
  assert.equal(await appendChatTurn(db,first,'A v sobotu?','Delší jízdu.'),first);
  assert.deepEqual((await chatContext(db,first)).map(t=>t.role),['user','assistant','user','assistant']);
  const second=await appendChatTurn(db,undefined,'Co k večeři?','Rýži s kuřetem.');
  assert.notEqual(second,first);
  assert.equal((await chatContext(db,second)).length,2);
  assert.deepEqual(await chatContext(db,null),[]);
  const chats=await listChats(db);
  assert.deepEqual(chats.map(c=>c.title).sort(),['Co k večeři?','Jak mám jet zítra?']);
  assert.equal(chats.find(c=>c.id===first).messages,4);
  // Another user can neither read nor continue the chat.
  assert.equal(await readChat(other,first),null);
  assert.deepEqual(await chatContext(other,first),[]);
  assert.notEqual(await appendChatTurn(other,first,'Ahoj','Ahoj.'),first);
  assert.equal((await readChat(db,first)).messages.length,4);
  await deleteChat(db,first);
  assert.equal(await readChat(db,first),null);
  assert.deepEqual((await listChats(db)).map(c=>c.id),[second]);
});

test('old chats stay until the athlete deletes them and titles stay short',async()=>{
  const raw=createD1(),db=scopedDb(raw,1);
  const old=await appendChatTurn(db,null,'Starý dotaz','Odpověď');
  await raw.prepare("UPDATE assistant_chats SET updated_at=datetime('now','-400 days') WHERE id=?").bind(old).run();
  await appendChatTurn(db,null,'Nový dotaz','Odpověď');
  assert.deepEqual((await listChats(db)).map(c=>c.title),['Nový dotaz','Starý dotaz']);
  assert.equal((await readChat(db,old)).messages.length,2);
  assert.equal((await chatContext(db,old)).length,2);
  const title=chatTitle('Prober prosím celý můj týden a navrhni, jak rozložit intervaly, dlouhou jízdu i posilovnu');
  assert.ok(title.length<=60&&title.endsWith('…'));
  assert.equal(chatTitle('  '),'Nový chat');
});


test('thumbs under an answer keep only its id and a reason, and go with the chat',async()=>{
  const {appendChatTurnIds,saveAnswerFeedback}=await import('../src/assistant-chats.js');
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2);
  const {chatId,messageId}=await appendChatTurnIds(db,null,'Můžu dnes intervaly?','Ano, HRV je v normálu.');
  assert.ok(chatId>0&&messageId>0);
  const read=await readChat(db,chatId);
  assert.equal(read.messages.find(m=>m.role==='assistant').id,messageId);
  assert.equal(read.messages[1].rating,undefined);
  // The question is not an answer, and another user's answer is not there.
  const question=read.messages.find(m=>m.role==='user').id;
  await assert.rejects(saveAnswerFeedback(db,{messageId:question,rating:'up'}),e=>e.status===404);
  await assert.rejects(saveAnswerFeedback(other,{messageId,rating:'up'}),e=>e.status===404);
  await assert.rejects(saveAnswerFeedback(db,{messageId,rating:'meh'}),e=>e.status===400);
  await assert.rejects(saveAnswerFeedback(db,{messageId,rating:'up',reason:'numbers'}),e=>e.status===400);
  await assert.rejects(saveAnswerFeedback(db,{messageId,rating:'down',reason:'Free text from the chat'}),e=>e.status===400);
  await saveAnswerFeedback(db,{messageId,rating:'down'});
  await saveAnswerFeedback(db,{messageId,rating:'down',reason:'numbers'});
  const rows=raw.sqlite.prepare('SELECT * FROM assistant_feedback').all();
  assert.equal(rows.length,1);
  assert.deepEqual(Object.keys(rows[0]).sort(),['chat_id','message_id','rating','reason','updated_at','user_id']);
  assert.equal(rows[0].reason,'numbers');
  assert.equal((await readChat(db,chatId)).messages[1].rating,'down');
  // Taken back, then up again.
  await saveAnswerFeedback(db,{messageId,rating:null});
  assert.equal((await readChat(db,chatId)).messages[1].rating,undefined);
  await saveAnswerFeedback(db,{messageId,rating:'up'});
  assert.equal((await readChat(db,chatId)).messages[1].rating,'up');
  await deleteChat(db,chatId);
  assert.equal(raw.sqlite.prepare('SELECT COUNT(*) AS n FROM assistant_feedback').get().n,0);
});

test('a chat without any thumbs reads as before',async()=>{
  const raw=createD1(),db=scopedDb(raw,1);
  const id=await appendChatTurn(db,null,'Ahoj','Ahoj.');
  const chat=await readChat(db,id);
  assert.equal(chat.messages.length,2);
  assert.ok(chat.messages.every(m=>!('rating' in m)));
});

test('a streamed answer names its chat first; the chat is listed once the answer is saved (audit 23.1)',async()=>{
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2);
  const opened=await openChatForAnswer(db,null,'Jak mám jet zítra?');
  assert.equal(opened.created,true);
  // While the answer is written, the empty chat is not in the list.
  assert.deepEqual(await listChats(db),[]);
  const saved=await appendChatTurnIds(db,opened.id,'Jak mám jet zítra?','Lehce.');
  assert.equal(saved.chatId,opened.id);
  assert.deepEqual((await listChats(db)).map(c=>[c.id,c.title,c.messages]),[[opened.id,'Jak mám jet zítra?',2]]);
  // A chat that goes on keeps its id; another user's id becomes a new chat.
  assert.deepEqual(await openChatForAnswer(db,opened.id,'A v sobotu?'),{id:opened.id,created:false});
  assert.equal((await openChatForAnswer(other,opened.id,'Ahoj')).created,true);
  // A failed answer: the new chat goes, a chat with messages stays.
  const failed=await openChatForAnswer(db,undefined,'Co k večeři?');
  await dropEmptyChat(db,failed.id);
  await dropEmptyChat(db,opened.id);
  await dropEmptyChat(other,opened.id);
  assert.deepEqual((await raw.prepare('SELECT id FROM assistant_chats WHERE user_id=1').all()).results.map(r=>r.id),[opened.id]);
});

test('search finds a word only in the athlete\'s own chats, newest message per chat',async()=>{
  const {searchChats,searchSnippet}=await import('../src/assistant-chats.js');
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2);
  const knee=await appendChatTurn(db,null,'Squats hurt my left knee again, what instead?','Skip the back squat today and do step-downs.');
  await appendChatTurn(db,knee,'And the KNEE tomorrow?','Ride easy, the knee likes it.');
  const tired=await appendChatTurn(db,null,'Proč mám takovou únavu?','Únava je po třech krátkých nocích normální.');
  await appendChatTurn(db,null,'Co k večeři?','Rýži s kuřetem.');
  await appendChatTurn(other,null,'My knee is fine','Good.');
  const found=await searchChats(db,'  Knee ');
  assert.deepEqual(found.map(r=>r.chatId),[knee]);
  assert.equal(found[0].role,'assistant');
  assert.equal(found[0].snippet,'Ride easy, the knee likes it.');
  assert.equal(found[0].title,'Squats hurt my left knee again, what instead?');
  // Upper and lower case of Czech letters too; one result per chat.
  assert.deepEqual((await searchChats(db,'únava')).map(r=>[r.chatId,r.role]),[[tired,'assistant']]);
  assert.deepEqual((await searchChats(db,'ÚNAVU')).map(r=>r.chatId),[tired]);
  // Too short, LIKE marks taken literally, another user's words not found.
  assert.deepEqual(await searchChats(db,'k'),[]);
  assert.deepEqual(await searchChats(db,'%'),[]);
  assert.deepEqual(await searchChats(db,'_n'),[]);
  assert.deepEqual(await searchChats(other,'squats'),[]);
  // A deleted chat is not found.
  await deleteChat(db,knee);
  assert.deepEqual(await searchChats(db,'knee'),[]);
  // The piece of text: around the word, cut on spaces, without the app's notes.
  const long='Word '.repeat(30)+'here is the target word, and then '+'more text '.repeat(30)+'[Návrhy: plan]';
  const s=searchSnippet(long,'target');
  assert.ok(s.startsWith('…')&&s.endsWith('…')&&s.includes('target')&&s.length<170,s);
  assert.equal(searchSnippet('[Fotka] **Protein** after gym','protein'),'Protein after gym');
});
