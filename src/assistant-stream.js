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
  if(!response.body)throw new Error('AI nevrátila odpověď.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',completed=null;
  const parse=block=>{
    const lines=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart());if(!lines.length)return;
    const data=lines.join('\n');if(data==='[DONE]')return;
    const event=JSON.parse(data);
    if(event.type==='response.output_text.delta')onText(event.delta||'');
    if(event.type==='response.completed')completed=event.response;
    if(['error','response.failed','response.incomplete'].includes(event.type))throw new Error('AI odpověď se nepodařilo dokončit. Zkus to znovu.');
  };
  try{
    while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let match;
      while((match=buffer.match(/\r?\n\r?\n/))){const pos=match.index;parse(buffer.slice(0,pos));buffer=buffer.slice(pos+match[0].length);}
      if(done)break;
    }
    if(buffer.trim())parse(buffer);
    if(!completed)throw new Error('Spojení s AI se přerušilo. Zkus to znovu.');
    return completed;
  }finally{reader.releaseLock();}
}

// The browser receives readable answer updates; proposed changes are published
// only in the final event, after server validation and draft persistence.
export function assistantStreamResponse(work){
  const encoder=new TextEncoder();let cancelled=false;
  const stream=new ReadableStream({
    async start(controller){
      const send=data=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(data)+'\n'));};
      try{send({type:'start'});const result=await work(answer=>send({type:'answer',answer}),message=>send({type:'progress',message}));send({type:'done',result});}
      catch(error){console.error('Streaming assistant failed',error.message);send({type:'error',message:'AI odpověď se nepodařilo dokončit. Zkus to znovu.'});}
      finally{if(!cancelled)controller.close();}
    },cancel(){cancelled=true;}
  });
  return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff'}});
}
