import { L } from './lang.js';
// Reveal only the answer string from a partial structured reply. Never expose
// unfinished action JSON or incomplete escapes to the chat.
export function partialCoachAnswer(json){
  const match=json.match(/^\s*\{\s*"answer"\s*:\s*"/);if(!match)return '';
  let result='';
  for(let i=match[0].length;i<json.length;i++){
    const char=json[i];if(char==='"')break;
    if(char!=='\\'){result+=char;continue;}
    const escape=json[++i];if(escape==null)break;
    if(escape==='u'){
      const digits=json.slice(i+1,i+5);if(!/^[0-9a-f]{4}$/i.test(digits))break;
      result+=String.fromCharCode(parseInt(digits,16));i+=4;
    }else{const escapes={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!Object.hasOwn(escapes,escape))break;result+=escapes[escape];}
  }
  // A surrogate pair may arrive in two separate chunks.
  return /[\uD800-\uDBFF]$/.test(result)?result.slice(0,-1):result;
}

export async function readOpenAIStream(response,onText){
  if(!response.body)throw new Error(L('AI nevrátila odpověď.', 'The AI didn\'t return an answer.'));
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',completed=null,text='';
  const parse=block=>{
    const lines=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart());if(!lines.length)return;
    const data=lines.join('\n');if(data==='[DONE]')return;
    const event=JSON.parse(data);
    if(event.type==='response.output_text.delta'){text+=event.delta||'';onText(event.delta||'');}
    if(event.type==='response.completed')completed=event.response;
    // Cut off at max_output_tokens: the part that arrived is kept and marked.
    if(event.type==='response.incomplete')completed={...event.response,status:'incomplete'};
    // A failure after generation started still cost tokens: the usage the event carries goes with the error (coach-assistant.js records it).
    if(['error','response.failed'].includes(event.type)){console.error('OpenAI stream failed',String(event.error?.message||event.response?.error?.message||event.message||'').slice(0,300));const failure=new Error(L('služba AI odpověď přerušila', 'the AI service broke off the answer'));failure.ai=true;if(event.response?.usage){failure.usage=event.response.usage;failure.model=event.response.model||null;}throw failure;}
  };
  try{
    while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let match;
      while((match=buffer.match(/\r?\n\r?\n/))){const pos=match.index;parse(buffer.slice(0,pos));buffer=buffer.slice(pos+match[0].length);}
      if(done)break;
    }
    if(buffer.trim())parse(buffer);
    if(!completed)throw new Error(L('Spojení s AI se přerušilo. Zkus to znovu.', 'The connection to the AI was interrupted. Try again.'));
    return {...completed,streamedText:text};
  }finally{reader.releaseLock();}
}

// What the athlete reads when the answer fails: one sentence in the coach's
// voice, no status code. What the AI service said goes only to the log
// (coach-assistant.js); a limit keeps its own text.
export function coachFailureText(error){
  if(error?.limit)return error.message;
  return error?.ai&&error.status===429?L('Kouč teď neodpověděl, AI služba je přetížená. Zkus to za chvíli.', 'The coach didn\'t answer just now, the AI service is busy. Try again in a moment.'):L('Kouč teď neodpověděl. Zkus to za chvíli.', 'The coach didn\'t answer just now. Try again in a moment.');
}

// The browser receives readable answer updates; proposed changes are published
// only in the final event, after server validation and draft persistence.
// waitUntil (ctx.waitUntil) keeps the work going when the app hangs up, so the
// answer is still saved, counted and billed. The "chat" event names the chat
// the answer will be saved in, so the app can load it after a lost connection.
export function assistantStreamResponse(work,{waitUntil=null}={}){
  const encoder=new TextEncoder();let cancelled=false;
  const stream=new ReadableStream({
    start(controller){
      const send=data=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(data)+'\n'));};
      const done=(async()=>{
        try{send({type:'start'});const result=await work(answer=>send({type:'answer',answer}),message=>send({type:'progress',message}),chatId=>send({type:'chat',chatId}),step=>send({type:'step',step}));send({type:'done',result});}
        catch(error){console.error('Streaming assistant failed',error.message);send({type:'error',message:coachFailureText(error)});}
        finally{if(!cancelled)controller.close();}
      })();
      waitUntil?.(done);
      return done;
    },cancel(){cancelled=true;}
  });
  return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff'}});
}
