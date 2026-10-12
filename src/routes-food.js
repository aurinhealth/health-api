// Food routes of the dashboard API: personal foods, the food log, search, labels,
// photos, the cookbook and drinks.
import { searchRecipes } from "./personal-recipes.js";
import { savePersonalFood, listPersonalFoods, searchFoodCatalog as searchPersonalFoods } from "./personal-foods.js";
import { searchWorldFoods, barcodeKey } from "./world-foods.js";

import { readBarcodeWithAI, readFoodPhotoWithAI } from "./food-photo.js";
import { foodIntake } from "./food-portions.js";
import { productFromLabel } from "./food-sources.js";
import { getCookbookRecipeByPage } from "./cookbook.js";
import { queueFoodGoogle, processFoodGoogle } from "./food-google-sync.js";
import { lookupFoodWithAI } from "./food-ai.js";
import { listFluids, foodDrinks, dayActivityHours, hydrationTarget, hydrationMl, addFluid, updateFluid, deleteFluid, FluidInputError } from "./fluids.js";
import { searchCookbookRecipes, mealConsumedAt } from "./food-log.js";
import { updateFoodEntry, copyFoodEntry, deleteFoodEntry } from "./food-entry-management.js";
import legacyHealthApi, { googleToken } from "./index.js";
import { L } from "./lang.js";
import { localToday } from "./user-time.js";
import { dashboardProfile } from "./dashboard-shared.js";

export async function queueFoodGoogleSafely(env,ctx,id,options){
  try{
    const result=await queueFoodGoogle(env.DB,id,options);
    ctx.waitUntil(processFoodGoogle(env,{token:googleToken}).catch(error=>console.error('Food export',error.message)));
    return result;
  }catch{
    // The local write already succeeded. A retry must not create another meal.
    return {status:'error',message:L('Jídlo je uložené v aplikaci. Export do Google se nepodařilo připravit; zkus Odeslat znovu.', 'The meal is saved in the app. The export to Google couldn\'t be prepared; try Send again.')};
  }
}

export async function handleFoodApi(request,env,ctx,url,session,internalAuth){
  if(url.pathname==='/app/api/food/personal'&&request.method==='POST'){try{return Response.json({status:'ok',product:await savePersonalFood(env.DB,await request.json())});}catch(e){return Response.json({message:e.message},{status:400});}}
  if(url.pathname==='/app/api/food/personal'&&request.method==='GET')return Response.json({status:'ok',products:await listPersonalFoods(env.DB,{sort:url.searchParams.get('sort')==='frequent'?'frequent':'recent'})},{headers:{'Cache-Control':'no-store'}});

  if(url.pathname==='/app/api/food/entry'&&['PATCH','POST','DELETE'].includes(request.method)){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const body=await request.json(),id=body.id;
      const result=request.method==='PATCH'?await updateFoodEntry(env.DB,id,body):request.method==='POST'?await copyFoodEntry(env.DB,id,body.targetDate):await deleteFoodEntry(env.DB,id);
      const google=await queueFoodGoogleSafely(env,ctx,result.id,{deleted:request.method==='DELETE'});
      result.google=google;
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }


  if(url.pathname==='/app/api/food/search'&&request.method==='POST'){
    // Private saved foods first, then the common food-label catalogue, then
    // the read-only world catalogue in R2. A food users saved or corrected
    // replaces the world record with the same barcode.
    try {const body=await request.json(),name=String(body.name||'').slice(0,180),barcode=String(body.barcode||'').slice(0,24),[saved,world]=await Promise.all([(async()=>[...await searchPersonalFoods(env.DB,name,barcode),...(!barcode?await searchRecipes(env.DB,name):[])])(),searchWorldFoods(env,{name,barcode}).catch(error=>{console.error('world foods',error?.message);return [];})]),codes=new Set(saved.map(p=>barcodeKey(p.barcode)).filter(Boolean)),candidates=[...saved,...world.filter(p=>!codes.has(barcodeKey(p.barcode)))];return Response.json({status:'ok',candidates,product:candidates[0]||null},{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:L('Uložené potraviny se nepodařilo načíst. Zkus to znovu nebo zadej hodnoty z etikety.', 'Saved foods couldn\'t be loaded. Try again or enter the values from the label.'),detail:String(error.message).slice(0,160)},{status:500});}
  }
  // A food not saved yet: AI looks up its label values on the web. Only a
  // proposal; the user confirms it and the app saves it with the barcode.
  if(url.pathname==='/app/api/food/ai-lookup'&&request.method==='POST'){
    if(!env.OPENAI_API_KEY)return Response.json({status:'unavailable',message:L('AI není připojena (chybí OPENAI_API_KEY). Zadej hodnoty z etikety.', 'AI is not connected (OPENAI_API_KEY is missing). Enter the values from the label.')},{status:503});
    try{
      const body=await request.json().catch(()=>({})),name=String(body.name||'').slice(0,180),barcode=String(body.barcode||'').slice(0,24);
      const r=await lookupFoodWithAI(env,{name,barcode,language:env.INTERFACE_LANGUAGE});
      if(!r.product)return Response.json({status:'not_found',message:L('AI výrobek s jistotou nenašla. Zadej hodnoty z etikety (nebo ji vyfoť).', 'The AI couldn\'t find the product with certainty. Enter the values from the label (or take a photo of it).')},{headers:{'Cache-Control':'no-store'}});
      return Response.json({status:'ok',product:{...r.product,name:r.product.name||name},model:r.model},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.limit?error.message:L('Dohledání přes AI selhalo: ', 'The AI lookup failed: ')+String(error.message).slice(0,160)},{status:error.limit?(error.status||429):502});}
  }
  // A label, a portion summary or a meal photographed: AI vision reads the
  // values as a draft for the food editor. Without AI the client uses OCR.
  if(url.pathname==='/app/api/food/photo'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(!env.OPENAI_API_KEY)return Response.json({status:'unavailable',message:L('AI není připojena; fotku přečtu na zařízení.', 'AI is not connected; I\'ll read the photo on the device.')},{status:503});
    try{
      const body=await request.json().catch(()=>({}));
      if(body.mode==='barcode'){const b=await readBarcodeWithAI(env,{image:body.image});return Response.json(b.barcode?{status:'ok',barcode:b.barcode}:{status:'unreadable',message:L('Číslo pod čárovým kódem se nepodařilo přečíst. Vyfoť kód zblízka, nebo číslo opiš.', 'The number under the barcode couldn\'t be read. Take a close-up photo of the code or type the number.')},{headers:{'Cache-Control':'no-store'}});}
      const r=await readFoodPhotoWithAI(env,{image:body.image,mode:body.mode==='portion'?'portion':'label',language:env.INTERFACE_LANGUAGE});
      if(!r.result)return Response.json({status:'unreadable',message:L('Na fotce jsem hodnoty nepřečetl. Vyfoť tabulku zblízka a rovně, nebo hodnoty zadej ručně.', 'I couldn\'t read the values in the photo. Take a close, straight photo of the table or enter the values by hand.')},{headers:{'Cache-Control':'no-store'}});
      return Response.json({status:'ok',...r.result,model:r.model},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.limit?error.message:L('Čtení fotky přes AI selhalo: ', 'Reading the photo with AI failed: ')+String(error.message).slice(0,160)},{status:error.limit?(error.status||429):/JPG|PNG/.test(error.message)?400:502});}
  }
  // Cookbook by recipe name (the page lookup is below).
  if(url.pathname==='/app/api/food/recipes'&&request.method==='GET'){
    const q=String(url.searchParams.get('q')||'').trim().slice(0,120);
    if(q.length<2)return Response.json({status:'ok',recipes:[]},{headers:{'Cache-Control':'no-store'}});
    return Response.json(await searchCookbookRecipes({name:q,limit:8}),{headers:{'Cache-Control':'no-store'}});
  }
  // Drinks of a day with the day's target (body weight and training).
  if(url.pathname==='/app/api/fluids'){
    const validDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
    try{
      if(request.method==='GET'){
        const date=validDay(url.searchParams.get('date'))?url.searchParams.get('date'):localToday();
        const [logged,fromFood,weight,profile,hours]=await Promise.all([listFluids(env.DB,date),foodDrinks(env.DB,env.USER_ID,date),
          env.DB.prepare("SELECT value_numeric FROM health_datapoints WHERE user_id=? AND data_type='weight' AND value_numeric IS NOT NULL AND COALESCE(sample_time,start_time,end_time)<=? ORDER BY COALESCE(sample_time,start_time,end_time) DESC LIMIT 1").bind(env.USER_ID,date+'T23:59:59').first().catch(()=>null),
          dashboardProfile(env).catch(()=>null),dayActivityHours(env.DB,env.USER_ID,date)]);
        const target=hydrationTarget({weightKg:weight?.value_numeric,sex:profile?.sex,...hours});
        // Drinks from the food diary are listed with the logged ones and counted (alcohol not).
        const entries=[...logged,...fromFood].sort((a,b)=>String(a.consumedAt).localeCompare(String(b.consumedAt))).map(e=>({...e,hydrationMl:hydrationMl(e.ml,e.kind)}));
        return Response.json({status:'ok',date,entries,totalMl:entries.reduce((s,e)=>s+e.ml,0),hydrationMl:entries.reduce((s,e)=>s+e.hydrationMl,0),target},{headers:{'Cache-Control':'no-store'}});
      }
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      if(request.method==='POST'){const body=await request.json().catch(()=>({}));return Response.json({status:'ok',entry:await addFluid(env.DB,{date:validDay(body.date)?body.date:localToday(),ml:body.ml,kind:body.kind,at:body.at})},{headers:{'Cache-Control':'no-store'}});}
      if(request.method==='PATCH'){const body=await request.json().catch(()=>({}));return Response.json({status:'ok',entry:await updateFluid(env.DB,{id:body.id,ml:body.ml,kind:body.kind,at:body.at})},{headers:{'Cache-Control':'no-store'}});}
      if(request.method==='DELETE'){await deleteFluid(env.DB,url.searchParams.get('id'));return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});}
      return Response.json({message:'Method not allowed'},{status:405});
    }catch(error){return Response.json({status:'error',message:error.message},{status:error instanceof FluidInputError?400:500});}
  }
  if(url.pathname==='/app/api/food/recipe'&&request.method==='GET'){
    const recipe=await getCookbookRecipeByPage(url.searchParams.get('page'));
    return Response.json(recipe?{recipe}:{message:L('Na této stránce není známý recept.', 'There\'s no known recipe on this page.')},{status:recipe?200:404,headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/food/log'&&request.method==='POST'){
    try {const body=await request.json(),p=body.product||{};
      if(!/^\d{4}-\d{2}-\d{2}$/.test(body.date)||!String(p.name||'').trim()) return Response.json({message:L('Zkontroluj název a datum.', 'Check the name and date.')},{status:400});
      for(const field of ['calories_100g','protein_100g','carbs_100g','fat_100g'])if(p[field]==null||p[field]===''||!Number.isFinite(Number(p[field]))||Number(p[field])<0||Number(p[field])>(field==='calories_100g'?(p.nutrition_basis==='portion'?10000:1000):(p.nutrition_basis==='portion'?1000:100)))return Response.json({message:L('Doplň energii i všechna tři makra pro zvolený základ tabulky.', 'Fill in the energy and all three macros for the chosen table basis.')},{status:400});
      let amount;try{amount=foodIntake(p,body.quantity??body.grams,body.unit||(p.nutrition_basis==='portion'?'portion':p.nutrition_basis==='ml'?'ml':'g'),{pieceAmount:body.pieceAmount,pieceUnit:body.pieceUnit,density:body.density});}catch(error){return Response.json({message:error.message},{status:400});}
      const ingredients=Array.isArray(body.ingredients)?body.ingredients.slice(0,50).map(a=>({name:String(a.name||'').slice(0,180),amount:Number(a.amount)||null,unit:['g','ml','portion'].includes(a.unit)?a.unit:'g'})):[];
      const saved=await legacyHealthApi.fetch(new Request(new URL('/food/log',request.url),{method:'POST',headers:{...internalAuth,'Content-Type':'application/json'},body:JSON.stringify({date:body.date,consumed_at:mealConsumedAt(body.date,body.mealType,body.time)||undefined,name:String(p.name).slice(0,180),kcal:amount.calories,protein_g:amount.protein_g,carbs_g:amount.carbs_g,fat_g:amount.fat_g,fiber_g:amount.fiber_g,source:'package_label',note:JSON.stringify({product:productFromLabel(p),amount:amount.amount,unit:amount.unit,enteredQuantity:body.quantity??body.grams,enteredUnit:body.unit||'g',barcode:p.barcode||null,brand:p.brand||null,mealType:body.mealType||'snack',salt_g:amount.salt_g,sugar_g:amount.sugar_g,source_url:p.source_url||null,ingredients})})}),env,ctx);
      const result=await saved.json();if(!saved.ok)throw new Error(L('Uložení selhalo.', 'Saving failed.'));
      let personal=null,warning=null;
      if(p.source!=='composed'){try{personal=await savePersonalFood(env.DB,p,{used:true});}catch(error){warning=L('Jídlo je zapsané, ale potravinu pro příště se nepodařilo uložit: ', 'The meal is logged, but the food couldn\'t be saved for next time: ')+error.message;}}
      const google=await queueFoodGoogleSafely(env,ctx,result.id);
      warning ||= google.status==='error'?google.message:null;
      return Response.json({...result,google,personal,warning,message:warning||L('Jídlo je zapsané', 'The meal is logged')+(personal?L(' a potravina uložená pro příště', ' and the food is saved for next time'):'')+'.'},{headers:{'Cache-Control':'no-store'}});
    }catch{return Response.json({message:L('Jídlo se nepodařilo uložit. Zkontroluj hodnoty a zkus to znovu.', 'The meal couldn\'t be saved. Check the values and try again.')},{status:500});}
  }
}
