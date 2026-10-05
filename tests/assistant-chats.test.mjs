import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { appendChatTurn, chatContext, listChats, readChat, deleteChat, chatTitle } from '../src/assistant-chats.js';

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

test('chats untouched for 90 days are removed and titles stay short',async()=>{
  const raw=createD1(),db=scopedDb(raw,1);
  const old=await appendChatTurn(db,null,'Starý dotaz','Odpověď');
  await raw.prepare("UPDATE assistant_chats SET updated_at=datetime('now','-91 days') WHERE id=?").bind(old).run();
  await appendChatTurn(db,null,'Nový dotaz','Odpověď');
  assert.deepEqual((await listChats(db)).map(c=>c.title),['Nový dotaz']);
  assert.equal(await readChat(db,old),null);
  const title=chatTitle('Prober prosím celý můj týden a navrhni, jak rozložit intervaly, dlouhou jízdu i posilovnu');
  assert.ok(title.length<=60&&title.endsWith('…'));
  assert.equal(chatTitle('  '),'Nový chat');
});
