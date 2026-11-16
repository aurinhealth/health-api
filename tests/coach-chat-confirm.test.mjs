import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { appendChatTurnIds } from '../src/assistant-chats.js';
import { ensureCoachInboxTable } from '../src/coach-inbox.js';
import { chatConfirmation, openDraftsOfLastAnswer, confirmInChat, notConfirmedAgain, answerAsks } from '../src/coach-chat-confirm.js';

// Petr 2026-11-14: "Ja ti je potvrzuju v chatu, tak to potvrd a pridej tam ty i ty bicepsy" did nothing.
test('a clear yes in the text confirms, a question, a no, a later, a change or a pick does not',()=>{
  for(const m of ['Ja ti je potvrzuju v chatu, tak to potvrd a pridej tam ty i ty bicepsy','Potvrzuji.','Udělej to','Go ahead and add some curls','I confirm'])
    assert.equal(chatConfirmation(m),'strong',m);
  for(const m of ['Jo','Yes please','Jasně, díky'])assert.equal(chatConfirmation(m),'weak',m);
  assert.equal(chatConfirmation('Ano, potvrzuju'),'strong');
  // Second review: a change, a later or something else after the verb, and a bare "Ok".
  for(const m of ['Udělej to lehčí','Udělej to kratší','Proveď to s menší vahou','Go ahead and make it harder','Udělej to tak, aby to bylo do 30 minut','Do it in 30 minutes','Udělej to pro příští týden','Do it next week','Do it after lunch','Potvrď je potom','Potvrzuju, že jsem to udělal','Confirmed that my knee hurts','Potvrď mi, kolik sérií mám','Confirm what exactly','Souhlasím, i když mě bolí rameno','I agree it is hard','Ok','Okay','Beru','Ty jo','Potvrzuju a přidej to až zítra a vynech dřep'])
    assert.equal(chatConfirmation(m),false,m);
  // Review of #1087: each of these confirmed before.
  for(const m of ['Mám to potvrdit?','Ne, nechci to','Potvrď jen první','S prvním návrhem souhlasím','Souhlasím s tou výměnou leg pressu','ok a co zítra?','Zatím ne, počkej','Don\'t confirm it','Nesouhlasím',
    'Udělej to jinak','Udělej to až zítra','Do it tomorrow','Beru zpět','Nemůžu to potvrdit','I can\'t confirm that','Nevím, jestli to potvrdit','Potvrdím to později','Potvrdím to večer','Jo, ještě se rozmyslím','Ano, rozmyslím si to',
    'Jo, ale místo hack squatu dej dřep','Ano, ale bez leg pressu','Proveď to, ale dej tam místo dřepu výpady','Yes, but swap bench too','Jo a co zítra?','Ano?','Sure, why?','Jasně, chápu. Proč ale ten hack squat?','Souhlasím, že mě bolí koleno','Potvrzení mi nefunguje','S tím souhlasím, ale já bych tam chtěl i něco na biceps',''])
    assert.equal(chatConfirmation(m),false,m);
});

test('a bare yes after a question in the answer answers the question',()=>{
  assert.equal(answerAsks([{role:'assistant',content:'Vyměnil bych dřep. Mám ti dát i lehké vyjetí?\n\n[Návrhy: Vyměnit A → B (so 14. 11.)]'}]),true);
  assert.equal(answerAsks([{role:'assistant',content:'Vyměnil bych dřep za hack squat.\n\n[Návrhy: Vyměnit A → B (so 14. 11.)]'}]),false);
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
  // A rest or a status still needs the tap; a card from an earlier day is left.
  await add(second.messageId,{type:'rest',eventId:'planned:1',date:'2026-11-14',reason:'r'});
  await db.prepare("UPDATE coach_inbox SET created_at='2019-01-01 10:00:00' WHERE user_id=1 AND id=?").bind(await add(second.messageId,swap('Hack squat','Leg press'))).run();
  const open=await openDraftsOfLastAnswer(db,first.chatId,'2020-01-01 00:00:00');
  assert.deepEqual(open.map(d=>d.draftId),[a,b]);
  assert.deepEqual(await openDraftsOfLastAnswer(db,999,'2026-11-14 00:00:00'),[]);
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
  // The yes is read before the message is counted (a bare confirmation is free), so above answerMessage.
  const route=entry.slice(entry.indexOf("url.pathname==='/app/api/assistant'&&request.method==='POST'"),entry.indexOf('const answerMessage=async'));
  assert.match(route,/ghost\|\|body\.pushReply\?false:chatConfirmation\(message\)/);
  assert.ok(route.indexOf('openDraftsOfLastAnswer(')<route.indexOf('claimFreeReply('));
});
