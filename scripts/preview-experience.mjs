import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {dashboardPage} from '../src/dashboard.js';
import {gymExerciseCatalog} from '../src/gym-catalog.js';
import {BASE_WORKOUT_LIBRARY,defaultCapabilities,parseWorkoutSearchFilters,rankWorkoutCandidates} from '../src/workout-library.js';

const port=Number(process.env.PORT)||8791;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const demoFoods=[
  {id:1,consumed_date:today,consumed_at:today+'T07:30:00Z',recipe_title:'Ovesná kaše',kcal:430,protein_g:23,carbs_g:62,fat_g:10,note:JSON.stringify({mealType:'breakfast',ingredients:[{name:'Ovesné vločky',amount:70,unit:'g'}]})},
  {id:2,consumed_date:today,consumed_at:today+'T12:30:00Z',recipe_title:'Rýže s kuřecím masem',kcal:640,protein_g:47,carbs_g:78,fat_g:15,note:JSON.stringify({mealType:'lunch'})}
];
let nextFoodId=3;
const send=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
async function bodyOf(req){let body='';for await(const chunk of req)body+=chunk;return JSON.parse(body||'{}')}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(url.pathname==='/app'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await dashboardPage().text());return}
    if(url.pathname==='/app/dashboard-client.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(await readFile(new URL('../src/dashboard-client.js',import.meta.url),'utf8'));return}
    if(url.pathname==='/app/api/gym/exercises'&&req.method==='GET'){send(res,{status:'ok',exercises:gymExerciseCatalog()});return}
    if(url.pathname==='/app/api/workouts/search'&&req.method==='GET'){
      const filters=parseWorkoutSearchFilters(url.searchParams),capabilities=defaultCapabilities(),workouts=rankWorkoutCandidates(BASE_WORKOUT_LIBRARY,filters,{readiness:'green',hardBikeDaysRolling7d:0},capabilities);
      send(res,{status:'ok',total:workouts.length,workouts:workouts.slice(0,filters.limit),capabilities,rankingContext:{readiness:'green',hardBikeDaysRolling7d:0},sourcePolicy:'Místní náhled knihovny workoutů.'});return;
    }
    if(url.pathname==='/app/api/workouts/scheduled'&&req.method==='GET'){send(res,{status:'ok',workouts:[]});return}
    if(url.pathname==='/app/api/food/day'&&req.method==='GET'){
      const entries=demoFoods.filter(row=>row.consumed_date===(url.searchParams.get('date')||today));
      const totals=entries.reduce((sum,row)=>{for(const key of ['kcal','protein_g','carbs_g','fat_g'])sum[key]+=Number(row[key]||0);return sum},{kcal:0,protein_g:0,carbs_g:0,fat_g:0});
      send(res,{status:'ok',preview:true,entries,totals});return;
    }
    if(url.pathname==='/app/api/food/entry'&&['PATCH','POST','DELETE'].includes(req.method)){
      const body=await bodyOf(req),index=demoFoods.findIndex(row=>row.id===Number(body.id));
      if(index<0){send(res,{message:'Ukázkové jídlo nebylo nalezeno.'},404);return}
      const row=demoFoods[index];
      if(req.method==='DELETE')demoFoods.splice(index,1);
      else if(req.method==='POST')demoFoods.push({...row,id:nextFoodId++,consumed_date:body.targetDate,consumed_at:body.targetDate+row.consumed_at.slice(10)});
      else{
        const note=JSON.parse(row.note||'{}');if(body.mealType)note.mealType=body.mealType;
        Object.assign(row,{consumed_date:body.date||row.consumed_date,consumed_at:body.date?body.date+row.consumed_at.slice(10):row.consumed_at,recipe_title:body.name||row.recipe_title,note:JSON.stringify(note)});
        for(const key of ['kcal','protein_g','carbs_g','fat_g'])if(body[key]!=null)row[key]=Number(body[key]);
      }
      send(res,{status:'ok',preview:true,id:req.method==='POST'?nextFoodId-1:row.id});return;
    }
    if(url.pathname.startsWith('/app/api/')&&req.method==='GET'){
      const remote=await fetch('https://petrfitnessdata.eu'+url.pathname+url.search);
      res.writeHead(remote.status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(await remote.text());return;
    }
    send(res,{message:'Místní náhled: ostatní zápisy jsou zakázané.'},405);
  }catch(error){send(res,{message:error.message},502)}
});
server.listen(port,'127.0.0.1',()=>console.log('Místní náhled: http://127.0.0.1:'+port+'/app'));
