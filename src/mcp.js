const MCP_PROTOCOL_VERSION = "2025-11-25";
const SERVER_VERSION = "1.0.3";
const DEMO_API_KEY = "health-strength-demo-2026";

const TOOLS = [
  { name:"getStrengthContext", title:"Get strength training context", description:"Read integrated training context for a date, including cycling load, recovery data, and strength history.", inputSchema:{type:"object",properties:{date:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getStrengthHistory", title:"Get completed strength history", description:"Read completed strength-training sets from D1.", inputSchema:{type:"object",properties:{limit:{type:"integer",minimum:1,maximum:500,default:100}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getTodayStrengthSheet", title:"Read today's strength sheet", description:"Read the current Dnešní trénink Google Sheet contents.", inputSchema:{type:"object",properties:{}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"generateStrengthPlan", title:"Generate today's strength workout", description:"Generate an adaptive strength workout and write it to the Google Sheet unless preview=true.", inputSchema:{type:"object",properties:{date:{type:"string"},preview:{type:"boolean",default:false}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
  { name:"syncStrengthSheet", title:"Sync completed strength sets", description:"Sync completed strength sets from the Google Sheet into D1.", inputSchema:{type:"object",properties:{}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
  { name:"analyzeStrengthWorkout", title:"Analyze completed strength workout", description:"Sync and analyze the completed strength workout.", inputSchema:{type:"object",properties:{command:{type:"string"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
  { name:"findStrengthAlternatives", title:"Find exercise alternatives", description:"Find suitable strength-exercise alternatives.", inputSchema:{type:"object",properties:{exercise:{type:"string"},muscle:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"substituteStrengthExercise", title:"Substitute today's exercise", description:"Replace an exercise in today's Google Sheet workout.", inputSchema:{type:"object",required:["from"],properties:{from:{type:"string"},to:{type:"string"},muscle:{type:"string"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];

export async function handleMcp(request,env){
 const origin=request.headers.get("Origin"),cors=corsHeaders(origin);
 if(origin&&!isAllowedOrigin(origin))return new Response("Forbidden",{status:403,headers:cors});
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"Access-Control-Allow-Methods":"POST,GET,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type,MCP-Protocol-Version,Mcp-Session-Id,Accept"}});
 if(request.method==="GET")return new Response(null,{status:405,headers:{...cors,Allow:"POST, GET"}});
 if(request.method!=="POST")return new Response("Method Not Allowed",{status:405,headers:{...cors,Allow:"POST, GET"}});
 const expectedKey=env.MCP_API_KEY||env.STRENGTH_API_KEY;
 if(!expectedKey)return json({jsonrpc:"2.0",error:{code:-32603,message:"MCP authentication is not configured"}},500,cors);
 const authorization=request.headers.get("Authorization")||"",demoMode=authorization===`Bearer ${DEMO_API_KEY}`;
 if(!demoMode&&authorization!==`Bearer ${expectedKey}`)return new Response("Unauthorized",{status:401,headers:{...cors,"WWW-Authenticate":'Bearer realm="health-api-mcp"'}});
 let message;try{message=await request.json()}catch{return json({jsonrpc:"2.0",error:{code:-32700,message:"Parse error"}},400,cors)}
 if(!message||message.jsonrpc!=="2.0"||typeof message.method!=="string")return json({jsonrpc:"2.0",id:message?.id??null,error:{code:-32600,message:"Invalid Request"}},400,cors);
 const protocolHeader=request.headers.get("MCP-Protocol-Version");
 if(message.method!=="initialize"&&protocolHeader&&!isSupportedProtocol(protocolHeader))return json({jsonrpc:"2.0",id:message.id??null,error:{code:-32602,message:"Unsupported MCP protocol version"}},400,cors);
 if(message.method==="initialize"){
   const requested=message.params?.protocolVersion,protocolVersion=isSupportedProtocol(requested)?requested:MCP_PROTOCOL_VERSION,sessionId=crypto.randomUUID();
   return json({jsonrpc:"2.0",id:message.id,result:{protocolVersion,capabilities:{tools:{}},serverInfo:{name:"health-api-strength-coach",title:"Health API Strength Coach",version:SERVER_VERSION},instructions:"Use strength context and completed strength history before generating a workout. generateStrengthPlan writes the adaptive workout to the Google Sheet unless preview=true."}},200,{...cors,"Mcp-Session-Id":sessionId,"MCP-Protocol-Version":protocolVersion});
 }
 if(message.method==="notifications/initialized"||message.method==="notifications/cancelled"||message.method==="ping"){if(message.id===undefined)return new Response(null,{status:202,headers:cors});return json({jsonrpc:"2.0",id:message.id,result:{}},200,cors)}
 if(message.method==="tools/list")return json({jsonrpc:"2.0",id:message.id,result:{tools:TOOLS}},200,cors);
 if(message.method==="tools/call"){
   const name=message.params?.name,args=message.params?.arguments||{},tool=TOOLS.find(x=>x.name===name);
   if(!tool)return json({jsonrpc:"2.0",id:message.id,error:{code:-32602,message:`Unknown tool: ${name}`}},400,cors);
   try{const result=demoMode?demoTool(name,args):await callHealthApi(request,env,name,args);return json({jsonrpc:"2.0",id:message.id,result:{content:[{type:"text",text:JSON.stringify(result)}]}},200,cors)}
   catch(error){const detail=error instanceof Error?error.message:String(error);return json({jsonrpc:"2.0",id:message.id,result:{isError:true,content:[{type:"text",text:detail}]}},200,cors)}
 }
 return json({jsonrpc:"2.0",id:message.id??null,error:{code:-32601,message:`Method not found: ${message.method}`}},404,cors);
}

function isSupportedProtocol(v){return v==="2025-11-25"||v==="2025-06-18"}
function isAllowedOrigin(o){try{const u=new URL(o);return u.protocol==="https:"&&["chatgpt.com","chat.openai.com","platform.openai.com"].includes(u.hostname)}catch{return false}}
function corsHeaders(o){return o?{"Access-Control-Allow-Origin":o,Vary:"Origin"}:{}}
function demoTool(name,args){
 const date=String(args.date||"2026-09-21");
 if(name==="getStrengthContext")return{status:"ok",date,demo:true,recentCycling:[{date:"2026-09-19",name:"Long Endurance",hours:3,tss:121}],plannedCycling:[{date:"2026-09-20",name:"Tempo + Endurance",hours:2.6,tss:129}],recovery:{restingHr:52,hrvMs:89,sleepMinutes:374},strength:{historyReady:true,completedSetCount:0}};
 if(name==="getStrengthHistory")return{status:"ok",demo:true,count:0,rows:[]};
 if(name==="getTodayStrengthSheet")return{status:"ok",demo:true,sheet:"Dnešní trénink",workoutDate:date};
 if(name==="findStrengthAlternatives")return{status:"ok",demo:true,exercise:args.exercise||null,alternatives:[]};
 throw new Error(`Unsupported demo tool: ${name}`);
}
async function callHealthApi(request,env,toolName,args){
 const base=new URL(request.url).origin;
 const routes={
  getStrengthContext:()=>`/strength/context${args.date?`?date=${encodeURIComponent(String(args.date))}`:""}`,
  getStrengthHistory:()=>`/strength/history?limit=${encodeURIComponent(String(args.limit??100))}`,
  getTodayStrengthSheet:()=>"/strength/sheet/today",
  generateStrengthPlan:()=>"/strength/generate-plan",
  syncStrengthSheet:()=>"/strength/sync",
  analyzeStrengthWorkout:()=>"/strength/analyze",
  findStrengthAlternatives:()=>"/strength/alternatives",
  substituteStrengthExercise:()=>"/strength/substitute"
 };
 const route=routes[toolName];if(!route)throw new Error(`Unsupported tool: ${toolName}`);
 const method=["getStrengthContext","getStrengthHistory","getTodayStrengthSheet"].includes(toolName)?"GET":"POST";
 const headers=new Headers({Accept:"application/json"});
 const internalKey=env.STRENGTH_API_KEY||env.MCP_API_KEY;
 if(!internalKey)throw new Error("Strength API authentication is not configured");
 headers.set("Authorization",`Bearer ${internalKey}`);
 let url=`${base}${route()}`,body;
 if(method==="POST"){
   headers.set("Content-Type","application/json");
   if(toolName==="generateStrengthPlan") body=JSON.stringify({date:args.date||null,preview:Boolean(args.preview)});
   else if(toolName==="analyzeStrengthWorkout") body=JSON.stringify({command:args.command||"analyze"});
   else if(toolName==="findStrengthAlternatives") body=JSON.stringify({exercise:args.exercise||"",muscle:args.muscle||""});
   else if(toolName==="substituteStrengthExercise") body=JSON.stringify({from:args.from||"",to:args.to||"",muscle:args.muscle||""});
   else body="{}";
 }
 const response=await fetch(url,{method,headers,body}),text=await response.text();
 let data;try{data=JSON.parse(text)}catch{data={status:"error",message:text}}
 if(!response.ok)throw new Error(data?.message||data?.error?.message||`health-api HTTP ${response.status}`);
 if(data?.status==="error")throw new Error(`${data.step||toolName}: ${data.message||"unknown backend error"}`);
 return data;
}
function json(value,status=200,extraHeaders={}){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...extraHeaders}})}
