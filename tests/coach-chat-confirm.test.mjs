import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { appendChatTurnIds } from '../src/assistant-chats.js';
import { ensureCoachInboxTable } from '../src/coach-inbox.js';
import { chatConfirmation, openDraftsOfLastAnswer, confirmInChat, notConfirmedAgain } from '../src/coach-chat-confirm.js';

// Petr 2026-11-14: "Ja ti je potvrzuju v chatu, tak to potvrd a pridej tam ty i ty bicepsy" did nothing.
test('a clear yes in the text confirms, a question, a no or a pick does not',()=>{
  for(const m of ['Ja ti je potvrzuju v chatu, tak to potvrd a pridej tam ty i ty bicepsy','S tím souhlasím, ale já bych tam chtěl i něco na biceps','Ano, a přidej biceps','Jo','Potvrzuji.','Yes please','Go ahead and add some curls','Udělej to'])
    assert.equal(chatConfirmation(m),true,m);
  for(const m of ['Mám to potvrdit?','Ne, nechci to','Potvrď jen první','Souhlasím s první výměnou','ok a co zítra?','Zatím ne, počkej','Don\'t confirm it','Proč bys to měnil?','Kolik sérií?','','Nesouhlasím'])
    assert.equal(chatConfirmation(m),false,m);
});

test('only the open cards under the last answer of this chat are confirmed',async()=>{
  const db=scopedDb(createD1(),1);
  const first=await appendChatTurnIds(db,null,'Uprav gym','Navrhuji výměny.');
  const second=await appendChatTurnIds(db,first.chatId,'Chci i biceps','Výměny čekají na potvrzení.');
  await ensureCoachInboxTable(db);
  const swap=(from,to)=>({type:'gym_swap',date:'2026-11-14',fromExercise:from,toExercise:to,reason:'r'});
  const add=async(messageId,action,status='draft')=>(await db.prepare('INSERT INTO coach_inbox(user_id,channel,message,draft_json,status) VALUES(?,?,?,?,?)').bind(1,'cycling','m',JSON.stringify({kind:'coach_action',action,chatId:first.chatId,messageId}),status).run()).meta.last_row_id;
  await add(first.messageId,swap('Low row','Standing rowing machine'));
  const a=await add(second.messageId,swap('Low row','Standing rowing machine')),b=await add(second.messageId,swap('One Arm Dumbbell Bench Press','DB bench press'));
  await add(second.messageId,swap('Lat pulldown','Seated cable row'),'rejected');
  const open=await openDraftsOfLastAnswer(db,first.chatId);
  assert.deepEqual(open.map(d=>d.draftId),[a,b]);
  assert.deepEqual(await openDraftsOfLastAnswer(db,999),[]);
  const done=await confirmInChat(open,async id=>id===a?{ok:true}:{ok:false,message:'Plán se mezitím změnil.'});
  assert.deepEqual(done.map(d=>[d.done,d.reason||'']),[[true,''],[false,'Plán se mezitím změnil.']]);
  // The answer does not bring a card again for the change just made.
  assert.deepEqual(notConfirmedAgain([open[0].action,open[1].action],done),[open[1].action]);
});

test('the chat confirms through the card\'s own endpoint, before the coach reads the plan',async()=>{
  const { readFile } = await import('node:fs/promises');
  const entry=await readFile(new URL('../src/entrypoint.js',import.meta.url),'utf8'),body=entry.slice(entry.indexOf('const answerMessage=async'));
  assert.ok(body.indexOf('confirmInChat(drafts')<body.indexOf('loadCoachInputs('));
  assert.match(body.slice(body.indexOf('confirmInChat(drafts'),body.indexOf('loadCoachInputs(')),/\/app\/api\/assistant\/action'[\s\S]*decision:'confirm'/);
  assert.match(body,/!ghost&&chatConfirmation\(message\)/);
});
