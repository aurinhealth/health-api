import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { appendChatTurn, chatContext, listChats, readChat, deleteChat, chatTitle, forgetOldChatMessages } from '../src/assistant-chats.js';

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

test('only the last 30 days of chats are shown, given to the coach and kept',async()=>{
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2);
  const old=await appendChatTurn(db,null,'Starý dotaz','Odpověď');
  const mixed=await appendChatTurn(db,null,'Dotaz z minulého měsíce','Stará odpověď');
  await raw.prepare("UPDATE assistant_chats SET updated_at=datetime('now','-31 days'),created_at=datetime('now','-31 days') WHERE id=?").bind(old).run();
  await raw.prepare("UPDATE assistant_messages SET created_at=datetime('now','-31 days') WHERE chat_id IN (?,?)").bind(old,mixed).run();
  await raw.prepare("UPDATE assistant_chats SET created_at=datetime('now','-40 days') WHERE id=?").bind(mixed).run();
  assert.equal(await appendChatTurn(db,mixed,'Nový dotaz','Nová odpověď'),mixed);
  const otherChat=await appendChatTurn(other,null,'Cizí dotaz','Odpověď');
  await raw.prepare("UPDATE assistant_chats SET updated_at=datetime('now','-32 days'),created_at=datetime('now','-33 days') WHERE id=?").bind(otherChat).run();
  await raw.prepare("UPDATE assistant_messages SET created_at=datetime('now','-32 days') WHERE chat_id=?").bind(otherChat).run();
  // Before the nightly removal: nothing older than 30 days is listed, opened or given to the coach.
  assert.deepEqual((await listChats(db)).map(c=>[c.id,c.messages]),[[mixed,2]]);
  assert.equal(await readChat(db,old),null);
  assert.deepEqual((await readChat(db,mixed)).messages.map(m=>m.content),['Nový dotaz','Nová odpověď']);
  assert.deepEqual((await chatContext(db,mixed)).map(t=>t.content),['Nový dotaz','Nová odpověď']);
  assert.deepEqual(await chatContext(db,old),[]);
  // Writing into a chat over 30 days old starts a new one.
  const fresh=await appendChatTurn(db,old,'Pokračuju','Dobře');
  assert.notEqual(fresh,old);
  // The legacy turns in athlete_state go too; the coach's memories stay.
  await raw.prepare('CREATE TABLE athlete_state (user_id INTEGER PRIMARY KEY, state_json TEXT NOT NULL)').run();
  await raw.prepare('INSERT INTO athlete_state VALUES (1,?),(2,?)').bind(JSON.stringify({memories:['Bolí koleno'],conversation:[{role:'user',content:'Starý'}]}),JSON.stringify({conversation:[{role:'user',content:'Cizí'}]})).run();
  // One pass over the whole database, every user at once (the nightly cleanup).
  assert.deepEqual(await forgetOldChatMessages(raw),{messages:6,chats:2});
  const left=raw.sqlite.prepare('SELECT chat_id,content FROM assistant_messages WHERE user_id=1 ORDER BY id').all().map(r=>[r.chat_id,r.content]);
  assert.deepEqual(left,[[mixed,'Nový dotaz'],[mixed,'Nová odpověď'],[fresh,'Pokračuju'],[fresh,'Dobře']]);
  const kept=raw.sqlite.prepare('SELECT title,created_at>=datetime(\'now\',\'-1 day\') AS recent FROM assistant_chats WHERE id=?').get(mixed);
  assert.equal(kept.title,'Nový dotaz');
  assert.equal(kept.recent,1);
  assert.deepEqual(JSON.parse(raw.sqlite.prepare('SELECT state_json FROM athlete_state WHERE user_id=1').get().state_json),{memories:['Bolí koleno']});
  // The other user's chat untouched for 30 days went in the same pass.
  assert.equal(raw.sqlite.prepare('SELECT COUNT(*) AS n FROM assistant_chats WHERE user_id=2').get().n,0);
  assert.equal(JSON.parse(raw.sqlite.prepare('SELECT state_json FROM athlete_state WHERE user_id=2').get().state_json).conversation,undefined);
  // A second run changes nothing.
  const before=raw.sqlite.prepare('SELECT id,title,created_at FROM assistant_chats ORDER BY id').all();
  assert.deepEqual(await forgetOldChatMessages(raw),{messages:0,chats:0});
  assert.deepEqual(raw.sqlite.prepare('SELECT id,title,created_at FROM assistant_chats ORDER BY id').all(),before);
  const title=chatTitle('Prober prosím celý můj týden a navrhni, jak rozložit intervaly, dlouhou jízdu i posilovnu');
  assert.ok(title.length<=60&&title.endsWith('…'));
  assert.equal(chatTitle('  '),'Nový chat');
});

test('a chat whose messages are all older than 30 days goes, a broken athlete state does not stop it',async()=>{
  const raw=createD1(),db=scopedDb(raw,1);
  const stale=await appendChatTurn(db,null,'Dávno','Odpověď');
  await raw.prepare("UPDATE assistant_chats SET created_at=datetime('now','-35 days') WHERE id=?").bind(stale).run();
  await raw.prepare("UPDATE assistant_messages SET created_at=datetime('now','-35 days') WHERE chat_id=?").bind(stale).run();
  // A broken athlete_state row does not stop the cleanup.
  await raw.prepare('CREATE TABLE athlete_state (user_id INTEGER PRIMARY KEY, state_json TEXT NOT NULL)').run();
  await raw.prepare('INSERT INTO athlete_state VALUES (1,?)').bind('{broken').run();
  assert.deepEqual(await forgetOldChatMessages(raw),{messages:2,chats:1});
  assert.equal(raw.sqlite.prepare('SELECT COUNT(*) AS n FROM assistant_chats').get().n,0);
  assert.equal(raw.sqlite.prepare('SELECT COUNT(*) AS n FROM assistant_messages').get().n,0);
});


test('the nightly chat cleanup goes through the core database and each ready shard once', async () => {
  const { userDataDatabases } = await import('../src/user-data-shards.js');
  const core = createD1(), a = createD1(), b = createD1();
  core.sqlite.exec("CREATE TABLE user_data_shards (shard_key TEXT, binding_name TEXT, state TEXT); INSERT INTO user_data_shards VALUES ('legacy','DB','ready'),('s1','USER_DATA_001','ready'),('s2','USER_DATA_002','provisioning'),('s3','USER_DATA_003','ready')");
  const env = { DB: core, USER_DATA_ROUTING: 'true', USER_DATA_001: a, USER_DATA_002: b, USER_DATA_003: a };
  assert.deepEqual(await userDataDatabases(env), [core, a]);
  assert.deepEqual(await userDataDatabases({ DB: core }), [core]);
});
