import healthApp from "./strength-gateway.js";
import { timingSafeEqualString } from "./dashboard-auth.js";
import { searchWorkoutLibrary, getCapabilities, scheduleWorkoutInIntervals, recordWorkoutFeedback } from "./workout-library.js";

const MCP_PROTOCOL_VERSION = "2026-07-28";
const SERVER_VERSION = "1.1.0";
const DEMO_API_KEY = "health-strength-demo-2026";

export const TOOLS = [
  { name:"getCyclingContext", title:"Get adaptive cycling context", description:"Read season, weather, wind, daylight, and time-window context used to adapt cycling plans.", inputSchema:{type:"object",properties:{date:{type:"string"},lat:{type:"number"},lon:{type:"number"},rideType:{type:"string"},durationMinutes:{type:"integer",minimum:20,maximum:360},startTime:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},

  { name:"searchCyclingWorkouts", title:"Search personalized cycling workouts", description:"Search the adaptive workout library by training system, duration, load and difficulty, ranked against the athlete's stored capability and optional readiness context.", inputSchema:{type:"object",properties:{environment:{type:"string",enum:["indoor","outdoor"],description:"indoor (trainer, ERG) or outdoor (ranges, free sprints)"},system:{type:"string",enum:["recovery","endurance","tempo","sweet_spot","threshold","vo2max","anaerobic","sprint"]},durationMinutes:{type:"integer",minimum:20,maximum:360},durationTolerance:{type:"integer",minimum:0,maximum:90},targetLoad:{type:"number",minimum:0,maximum:500},loadTolerance:{type:"number",minimum:0,maximum:250},maxDifficulty:{type:"number",minimum:1,maximum:10},readiness:{type:"string",enum:["green","yellow","red"]},hardBikeDaysRolling7d:{type:"integer",minimum:0,maximum:7},phase:{type:"string",enum:["base","build","recovery","taper"]},limit:{type:"integer",minimum:1,maximum:50}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getCyclingCapabilities", title:"Get cycling capabilities", description:"Read the athlete's adaptive 1-10 capability levels and confidence for endurance, tempo, sweet spot, threshold, VO2max, anaerobic, sprint and recovery.", inputSchema:{type:"object",properties:{}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"scheduleCyclingWorkout", title:"Schedule cycling workout", description:"Add one selected workout-library workout to Intervals.icu on a chosen date. Only call after the user explicitly approves that exact workout and date; confirm must be true.", inputSchema:{type:"object",required:["workoutId","date","confirm"],properties:{environment:{type:"string",enum:["indoor","outdoor"],description:"Write the indoor or outdoor version to Intervals.icu"},workoutId:{type:"string"},date:{type:"string"},confirm:{type:"boolean"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
  { name:"recordCyclingWorkoutFeedback", title:"Record cycling workout feedback", description:"Record completion percentage and optional RPE for a workout-library session and update the corresponding cycling capability.", inputSchema:{type:"object",required:["workoutId"],properties:{workoutId:{type:"string"},scheduledDate:{type:"string"},completedPercent:{type:"number",minimum:0,maximum:150},rpe:{type:"number",minimum:1,maximum:10},survey:{type:"string"},notes:{type:"string"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},

  { name:"getStrengthContext", title:"Get strength training context", description:"Read integrated training context for a date, including cycling load, recovery data, and strength history.", inputSchema:{type:"object",properties:{date:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getStrengthHistory", title:"Get completed strength history", description:"Read completed strength-training sets from D1.", inputSchema:{type:"object",properties:{limit:{type:"integer",minimum:1,maximum:500,default:100}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getTodayStrengthWorkout", title:"Read today's strength workout", description:"Read today's strength workout plan stored in the app database (D1).", inputSchema:{type:"object",properties:{}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getNutritionPlan", title:"Get daily nutrition plan", description:"Build the daily nutrition plan from the shared cycling, recovery, and strength context.", inputSchema:{type:"object",properties:{date:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getDailyDecision", title:"Get adaptive daily decision", description:"Combine recovery, cycling load, strength readiness, nutrition, and upcoming rides into one daily decision context.", inputSchema:{type:"object",properties:{date:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getDailyPlan", title:"Get unified daily plan", description:"Return one actionable plan combining cycling, strength, nutrition, food, recovery, and meal timing for the day.", inputSchema:{type:"object",properties:{date:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getWeeklyReview", title:"Get weekly training review", description:"Summarize the last 7 days of cycling, strength, nutrition, and weight trend.", inputSchema:{type:"object",properties:{date:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"searchCookbook", title:"Search cookbook recipes", description:"Find recipes by cookbook page and/or name.", inputSchema:{type:"object",properties:{page:{type:"integer"},name:{type:"string"},limit:{type:"integer",minimum:1,maximum:50}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getCookbookRecipe", title:"Get cookbook recipe", description:"Get a cookbook recipe including available nutrition values.", inputSchema:{type:"object",properties:{page:{type:"integer"},name:{type:"string"},recipeId:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"logMeal", title:"Log food", description:"Log a cookbook meal or manually supplied nutrition into the daily food log. Status can be eaten or planned.", inputSchema:{type:"object",properties:{date:{type:"string"},page:{type:"integer"},name:{type:"string"},recipeId:{type:"string"},servings:{type:"number"},mealTime:{type:"string"},mealType:{type:"string"},calories:{type:"number"},protein_g:{type:"number"},carbs_g:{type:"number"},fat_g:{type:"number"},status:{type:"string",enum:["eaten","planned","cancelled"]},source:{type:"string"},note:{type:"string"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
  { name:"getFoodDay", title:"Get daily food log", description:"Read eaten and planned food plus totals and the nutrition target for a day.", inputSchema:{type:"object",properties:{date:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"recommendNutrition", title:"Recommend what to eat", description:"Compare the daily food log with the adaptive nutrition target and suggest what remains to be covered.", inputSchema:{type:"object",properties:{date:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"resolveFood", title:"Resolve food product", description:"Resolve a food from its package-label nutrition per 100 g, or find one of the user's saved foods by barcode or name. There is no external food database: for anything else, read the label values.", inputSchema:{type:"object",properties:{barcode:{type:"string"},name:{type:"string"},brand:{type:"string"},calories_100g:{type:"number"},protein_100g:{type:"number"},carbs_100g:{type:"number"},fat_100g:{type:"number"},serving_size:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
  { name:"getFoodProduct", title:"Get food product", description:"Find one of the user's saved foods by barcode or name.", inputSchema:{type:"object",properties:{barcode:{type:"string"},name:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"getFoodFavorites", title:"Get frequent foods", description:"List frequently eaten foods from the last 60 days for quick reuse and meal planning.", inputSchema:{type:"object",properties:{limit:{type:"integer",minimum:1,maximum:50}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"logFoodProduct", title:"Log food product", description:"Log the consumed amount in grams of a food given by its package-label values per 100 g or found among the user's saved foods.", inputSchema:{type:"object",properties:{date:{type:"string"},barcode:{type:"string"},name:{type:"string"},brand:{type:"string"},grams:{type:"number"},calories_100g:{type:"number"},protein_100g:{type:"number"},carbs_100g:{type:"number"},fat_100g:{type:"number"},mealTime:{type:"string"},mealType:{type:"string"},note:{type:"string"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
  { name:"consumePlannedFood", title:"Consume planned food", description:"Move all or part of a planned food entry into eaten intake while preserving the remaining planned portion.", inputSchema:{type:"object",required:["id"],properties:{id:{type:"integer"},servings:{type:"number"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
  { name:"updateFoodEntry", title:"Update food entry", description:"Correct a food log entry's time, portions, nutrition values, status, or note.", inputSchema:{type:"object",required:["id"],properties:{id:{type:"integer"},mealTime:{type:"string"},mealType:{type:"string"},servings:{type:"number"},calories:{type:"number"},protein_g:{type:"number"},carbs_g:{type:"number"},fat_g:{type:"number"},fiber_g:{type:"number"},salt_g:{type:"number"},status:{type:"string",enum:["eaten","planned","cancelled"]},note:{type:"string"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
  { name:"cancelFoodEntry", title:"Cancel food entry", description:"Soft-cancel a food log entry so it no longer contributes to daily totals.", inputSchema:{type:"object",required:["id"],properties:{id:{type:"integer"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
  { name:"generateStrengthPlan", title:"Generate today's strength workout", description:"Generate an adaptive strength workout and save it as the day's plan in the app database unless preview=true.", inputSchema:{type:"object",properties:{date:{type:"string"},preview:{type:"boolean",default:false},focus:{type:"string",enum:["upper","lower","full"]},forceProtectLegs:{type:"boolean"},durationMinutes:{type:"integer",minimum:20,maximum:120},maxExercises:{type:"integer",minimum:2,maximum:8},excludeExercises:{type:"array",items:{type:"string"}}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
  { name:"syncStrengthPlan", title:"Sync completed strength sets", description:"Save the completed sets of today's workout plan into the strength history.", inputSchema:{type:"object",properties:{}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
  { name:"analyzeStrengthWorkout", title:"Analyze completed strength workout", description:"Sync and analyze the completed strength workout.", inputSchema:{type:"object",properties:{command:{type:"string"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
  { name:"findStrengthAlternatives", title:"Find exercise alternatives", description:"Find suitable strength-exercise alternatives.", inputSchema:{type:"object",properties:{exercise:{type:"string"},muscle:{type:"string"}}}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  { name:"substituteStrengthExercise", title:"Substitute today's exercise", description:"Replace an exercise in today's workout plan.", inputSchema:{type:"object",required:["from"],properties:{from:{type:"string"},to:{type:"string"},muscle:{type:"string"}}}, annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];

export async function handleMcp(request,env){
 const origin=request.headers.get("Origin"),cors=corsHeaders(origin);
 if(origin&&!isAllowedOrigin(origin))return new Response("Forbidden",{status:403,headers:cors});
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"Access-Control-Allow-Methods":"POST,GET,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type,MCP-Protocol-Version,Mcp-Session-Id,Accept"}});
 if(request.method==="GET")return new Response(null,{status:405,headers:{...cors,Allow:"POST, GET"}});
 if(request.method!=="POST")return new Response("Method Not Allowed",{status:405,headers:{...cors,Allow:"POST, GET"}});
 const expectedKey=env.MCP_API_KEY||env.STRENGTH_API_KEY;
 if(!expectedKey)return json({jsonrpc:"2.0",error:{code:-32603,message:"MCP authentication is not configured"}},500,cors);
 const authorization=request.headers.get("Authorization")||"",demoMode=timingSafeEqualString(authorization,`Bearer ${DEMO_API_KEY}`);
 // The owner key (API clients) or the demo key (static sample data). There is
 // no OAuth: nobody types the owner key into a web form to connect a client.
 if(!demoMode&&!timingSafeEqualString(authorization,`Bearer ${expectedKey}`))return new Response("Unauthorized",{status:401,headers:{...cors,"WWW-Authenticate":'Bearer realm="health-api-mcp"'}});
 let message;try{message=await request.json()}catch{return json({jsonrpc:"2.0",error:{code:-32700,message:"Parse error"}},400,cors)}
 if(!message||message.jsonrpc!=="2.0"||typeof message.method!=="string")return json({jsonrpc:"2.0",id:message?.id??null,error:{code:-32600,message:"Invalid Request"}},400,cors);
 const protocolHeader=request.headers.get("MCP-Protocol-Version");
 if(message.method!=="initialize"&&protocolHeader&&!isSupportedProtocol(protocolHeader))return json({jsonrpc:"2.0",id:message.id??null,error:{code:-32602,message:"Unsupported MCP protocol version"}},400,cors);
 if(message.method==="initialize"){
   const requested=message.params?.protocolVersion,protocolVersion=isSupportedProtocol(requested)?requested:MCP_PROTOCOL_VERSION,sessionId=crypto.randomUUID();
   return json({jsonrpc:"2.0",id:message.id,result:{protocolVersion,capabilities:{tools:{}},serverInfo:{name:"health-api-strength-coach",title:"Health API Strength Coach",version:SERVER_VERSION},instructions:"Use the shared daily context for training and nutrition. For cycling, use getDailyDecision or current training context first when readiness matters, then searchCyclingWorkouts for ranked library candidates. scheduleCyclingWorkout must only be called after explicit user approval of the exact workout and date. generateStrengthPlan saves the adaptive workout as the day's plan unless preview=true."}},200,{...cors,"Mcp-Session-Id":sessionId,"MCP-Protocol-Version":protocolVersion});
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

function isSupportedProtocol(v){return v==="2026-07-28"||v==="2025-11-25"||v==="2025-06-18"}
function isAllowedOrigin(o){try{const u=new URL(o);return u.protocol==="https:"&&["chatgpt.com","chat.openai.com","platform.openai.com"].includes(u.hostname)}catch{return false}}
function corsHeaders(o){return o?{"Access-Control-Allow-Origin":o,Vary:"Origin"}:{}}
function demoTool(name,args){
 const date=String(args.date||"2026-09-21");
 if(name==="getStrengthContext")return{status:"ok",date,demo:true,recentCycling:[{date:"2026-09-19",name:"Long Endurance",hours:3,tss:121}],plannedCycling:[{date:"2026-09-20",name:"Tempo + Endurance",hours:2.6,tss:129}],recovery:{restingHr:52,hrvMs:89,sleepMinutes:374},strength:{historyReady:true,completedSetCount:0}};
 if(name==="searchCyclingWorkouts")return{status:"ok",demo:true,count:1,workouts:[{id:"pfd-vo2-5x4-90",name:"VO₂ 5×4 · 90 min",primary_system:"vo2max",duration_minutes:90,suitability:90}]};
 if(name==="getCyclingCapabilities")return{status:"ok",demo:true,capabilities:{vo2max:{level:5.5,confidence:.6}}};
 if(name==="scheduleCyclingWorkout")return{status:"ok",demo:true,workout:{id:args.workoutId||"demo",name:"Demo workout"},date:args.date||date};
 if(name==="recordCyclingWorkoutFeedback")return{status:"ok",demo:true,system:"vo2max",before:5.5,after:5.65};
 if(name==="getStrengthHistory")return{status:"ok",demo:true,count:0,rows:[]};
 if(name==="getTodayStrengthWorkout")return{status:"ok",demo:true,title:"Dnešní trénink",workoutDate:date};
 if(name==="findStrengthAlternatives")return{status:"ok",demo:true,exercise:args.exercise||null,alternatives:[]};
 if(name==="searchCookbook")return{status:"ok",demo:true,count:0,recipes:[]};
 if(name==="getCookbookRecipe")return{status:"ok",demo:true,recipe:null};
 if(name==="logMeal")return{status:"ok",demo:true,id:1,entryStatus:args.status||"eaten"};
 if(name==="getFoodDay")return{status:"ok",demo:true,date,entries:[],totals:{eaten:{calories:0,protein_g:0,carbs_g:0,fat_g:0},planned:{calories:0,protein_g:0,carbs_g:0,fat_g:0}}};
 if(name==="recommendNutrition")return{status:"ok",demo:true,remaining:{},suggestions:[]};
 if(name==="resolveFood")return{status:"ok",demo:true,match:"package_label",product:{name:args.name||"Demo food",calories_100g:args.calories_100g||100,protein_100g:args.protein_100g||10,carbs_100g:args.carbs_100g||10,fat_100g:args.fat_100g||2}};
 if(name==="getFoodProduct")return{status:"ok",demo:true,product:null};
 if(name==="getFoodFavorites")return{status:"ok",demo:true,foods:[]};
 if(name==="logFoodProduct")return{status:"ok",demo:true,id:1,grams:args.grams||null};
 if(name==="consumePlannedFood")return{status:"ok",demo:true,mode:"promoted",id:args.id||1};
 if(name==="updateFoodEntry")return{status:"ok",demo:true,id:args.id||1};
 if(name==="cancelFoodEntry")return{status:"ok",demo:true,id:args.id||1,cancelled:true};
 throw new Error(`Unsupported demo tool: ${name}`);
}
async function callHealthApi(request,env,toolName,args){
 if(toolName==="searchCyclingWorkouts"){
   return searchWorkoutLibrary(env.DB,{
     environment:args.environment,
     system:args.system,
     durationMinutes:args.durationMinutes,
     durationTolerance:args.durationTolerance,
     targetLoad:args.targetLoad,
     loadTolerance:args.loadTolerance,
     maxDifficulty:args.maxDifficulty,
     limit:args.limit??20
   },{
     readiness:args.readiness||"green",
     hardBikeDaysRolling7d:args.hardBikeDaysRolling7d??0,
     phase:args.phase||""
   });
 }
 if(toolName==="getCyclingCapabilities") return {status:"ok",capabilities:await getCapabilities(env.DB)};
 if(toolName==="scheduleCyclingWorkout") return scheduleWorkoutInIntervals(env,env.DB,{workoutId:String(args.workoutId||""),date:String(args.date||""),confirm:args.confirm===true,environment:args.environment});
 if(toolName==="recordCyclingWorkoutFeedback") return recordWorkoutFeedback(env.DB,{
   workoutId:String(args.workoutId||""),scheduledDate:args.scheduledDate||null,
   completedPercent:args.completedPercent??100,rpe:args.rpe??null,
   survey:args.survey||"completed",notes:args.notes||null
 });
 const base=new URL(request.url).origin;
 const routes={
  getStrengthContext:()=>`/strength/context${args.date?`?date=${encodeURIComponent(String(args.date))}`:""}`,
  getCyclingContext:()=>`/cycling/context?${new URLSearchParams(Object.entries({date:args.date,lat:args.lat,lon:args.lon,ride_type:args.rideType,duration_minutes:args.durationMinutes,start_time:args.startTime}).filter(([,v])=>v!=null&&v!=="" )).toString()}`,
  getStrengthHistory:()=>`/strength/history?limit=${encodeURIComponent(String(args.limit??100))}`,
  getTodayStrengthWorkout:()=>"/strength/today",
  getNutritionPlan:()=>"/nutrition/plan",
  getDailyDecision:()=>"/decision/daily",
  getDailyPlan:()=>`/daily/plan${args.date?`?date=${encodeURIComponent(String(args.date))}`:""}`,
  getWeeklyReview:()=>`/training/weekly-review${args.date?`?date=${encodeURIComponent(String(args.date))}`:""}`,
  searchCookbook:()=>`/cookbook/search?${new URLSearchParams(Object.entries({page:args.page,name:args.name,limit:args.limit}).filter(([,v])=>v!=null&&v!=="")).toString()}`,
  getCookbookRecipe:()=>`/cookbook/recipe?${new URLSearchParams(Object.entries({page:args.page,name:args.name,recipe_id:args.recipeId}).filter(([,v])=>v!=null&&v!=="")).toString()}`,
  logMeal:()=>"/nutrition/log-meal",
  getFoodDay:()=>`/nutrition/day?date=${encodeURIComponent(String(args.date||""))}`,
  recommendNutrition:()=>"/nutrition/recommend",
  resolveFood:()=>"/food/resolve",
  getFoodProduct:()=>`/food/product?${new URLSearchParams(Object.entries({barcode:args.barcode,name:args.name}).filter(([,v])=>v!=null&&v!=="" )).toString()}`,
  getFoodFavorites:()=>`/food/favorites?limit=${encodeURIComponent(String(args.limit??20))}`,
  logFoodProduct:()=>"/nutrition/log-product",
  consumePlannedFood:()=>"/nutrition/consume",
  updateFoodEntry:()=>"/nutrition/food/update",
  cancelFoodEntry:()=>"/nutrition/food/cancel",
  generateStrengthPlan:()=>"/strength/generate-plan",
  syncStrengthPlan:()=>"/strength/sync",
  analyzeStrengthWorkout:()=>"/strength/analyze",
  findStrengthAlternatives:()=>"/strength/alternatives",
  substituteStrengthExercise:()=>"/strength/substitute"
 };
 const route=routes[toolName];if(!route)throw new Error(`Unsupported tool: ${toolName}`);
 const method=["getStrengthContext","getCyclingContext","getStrengthHistory","getTodayStrengthWorkout","getWeeklyReview","getDailyPlan","getFoodFavorites","searchCookbook","getCookbookRecipe","getFoodDay","getFoodProduct"].includes(toolName)?"GET":"POST";
 const headers=new Headers({Accept:"application/json"});
 const internalKey=env.STRENGTH_API_KEY||env.MCP_API_KEY;
 if(!internalKey)throw new Error("Strength API authentication is not configured");
 headers.set("Authorization",`Bearer ${internalKey}`);
 let url=`${base}${route()}`,body;
 if(toolName==="getNutritionPlan") body=JSON.stringify({date:args.date||null});
 if(toolName==="getDailyDecision") body=JSON.stringify({date:args.date||null});
 if(method==="POST"){
   headers.set("Content-Type","application/json");
   if(toolName==="logMeal") body=JSON.stringify(args);
   else if(toolName==="recommendNutrition") body=JSON.stringify({date:args.date||null});
   else if(toolName==="getDailyDecision") body=JSON.stringify({date:args.date||null});
   else if(toolName==="resolveFood") body=JSON.stringify(args);
   else if(toolName==="logFoodProduct") body=JSON.stringify(args);
   else if(toolName==="consumePlannedFood") body=JSON.stringify(args);
   else if(toolName==="updateFoodEntry") body=JSON.stringify(args);
   else if(toolName==="cancelFoodEntry") body=JSON.stringify(args);
   else if(toolName==="generateStrengthPlan") body=JSON.stringify({date:args.date||null,preview:Boolean(args.preview),focus:args.focus||undefined,forceProtectLegs:Boolean(args.forceProtectLegs),durationMinutes:args.durationMinutes||undefined,maxExercises:args.maxExercises||undefined,excludeExercises:Array.isArray(args.excludeExercises)?args.excludeExercises:[]});
   else if(toolName==="analyzeStrengthWorkout") body=JSON.stringify({command:args.command||"analyze"});
   else if(toolName==="findStrengthAlternatives") body=JSON.stringify({exercise:args.exercise||"",muscle:args.muscle||""});
   else if(toolName==="substituteStrengthExercise") body=JSON.stringify({from:args.from||"",to:args.to||"",muscle:args.muscle||""});
   else if(toolName!=="getNutritionPlan") body="{}";
 }
 const internalRequest=new Request(url,{method,headers,body});
 const response=await healthApp.fetch(internalRequest,env,undefined),text=await response.text();
 let data;try{data=JSON.parse(text)}catch{data={status:"error",message:text}}
 if(!response.ok)throw new Error(data?.message||data?.error?.message||`health-api HTTP ${response.status}`);
 if(data?.status==="error")throw new Error(`${data.step||toolName}: ${data.message||"unknown backend error"}`);
 return data;
}
function json(value,status=200,extraHeaders={}){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...extraHeaders}})}
