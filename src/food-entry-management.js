import { L } from './lang.js';
import { hideAppleFood, OTHER_APP_SOURCES } from './apple-food.js';
const MEALS=new Set(['breakfast','snack_am','lunch','snack_pm','dinner','snack_late','snack']);
const FIELDS={kcal:10000,protein_g:1000,carbs_g:1000,fat_g:1000};

function dateValue(value){
  const date=String(value||'');
  const parsed=new Date(date+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error(L('Zadej platné datum.', 'Enter a valid date.'));
  return date;
}
function entryId(value){
  const id=Number(value);
  if(!Number.isSafeInteger(id)||id<=0)throw new Error(L('Neplatné jídlo.', 'Invalid meal.'));
  return id;
}
function noteObject(value){try{const note=JSON.parse(value||'{}');return note&&typeof note==='object'&&!Array.isArray(note)?note:{legacyNote:String(value)}}catch{return value?{legacyNote:String(value)}:{}}}
function changedDate(timestamp,date){return /^\d{4}-\d{2}-\d{2}/.test(String(timestamp||''))?date+String(timestamp).slice(10):date+'T12:00:00.000Z'}
// Food another app wrote to Apple or Google Health is that app's: it changes there (apple-food.js).
const OTHER_APP=new Set(OTHER_APP_SOURCES);
async function own(db,id){const row=await existing(db,id);if(OTHER_APP.has(row.source))throw new Error(L('Tohle jídlo je z jiné aplikace, uprav ho tam.', 'This meal comes from another app, change it there.'));return row}
async function existing(db,id){const row=await db.prepare('SELECT * FROM food_logs WHERE id=? AND user_id=?').bind(entryId(id),db.userId).first();if(!row)throw new Error(L('Jídlo už v deníku není.', 'The meal is no longer in the log.'));return row}

// The amount the entry was logged with, in its own unit (150 g, 2 ks, 1 porce):
// what the athlete typed first, else the resolved amount, else amount_g.
function loggedAmount(note){
  for(const key of ['enteredQuantity','amount','amount_g']){const value=Number(note[key]);if(note[key]!=null&&note[key]!==''&&Number.isFinite(value)&&value>0)return value}
  return null;
}
const round1=value=>Math.round(value*10)/10;

// A new amount scales the energy, macros, fibre, sugar, salt and the stored
// amounts by the same ratio; values sent explicitly still win.
function rescale(row,note,amount){
  const value=Number(amount);
  if(Number.isFinite(value)&&value>5000)throw new Error(L('Tohle množství je moc velké.', 'That amount is too large.'));
  if(amount===''||!Number.isFinite(value)||value<=0)throw new Error(L('Zadej množství.', 'Enter an amount.'));
  const before=loggedAmount(note);
  if(!before)throw new Error(L('U tohoto jídla neznám původní množství, uprav hodnoty ručně.', 'The original amount of this meal is unknown; edit the values by hand.'));
  const ratio=value/before,scaled={};
  for(const key of [...Object.keys(FIELDS),'fiber_g'])scaled[key]=row[key]==null?null:round1(Number(row[key]||0)*ratio);
  for(const key of ['sugar_g','salt_g']){const v=Number(note[key]);if(note[key]!=null&&note[key]!==''&&Number.isFinite(v))note[key]=Math.round(v*ratio*100)/100}
  for(const key of ['enteredQuantity','amount','amount_g']){const v=Number(note[key]);if(note[key]!=null&&note[key]!==''&&Number.isFinite(v))note[key]=key==='enteredQuantity'?round1(value):round1(v*ratio)}
  if(Array.isArray(note.ingredients))note.ingredients=note.ingredients.map(i=>i&&Number.isFinite(Number(i.amount))&&Number(i.amount)>0?{...i,amount:round1(Number(i.amount)*ratio)}:i);
  return scaled;
}

export async function updateFoodEntry(db,id,patch){
  const row=await own(db,id),date=patch.date==null?row.consumed_date:dateValue(patch.date);
  const name=patch.name==null?row.recipe_title:String(patch.name).trim().slice(0,180);
  if(!name)throw new Error(L('Doplň název jídla.', 'Add the meal name.'));
  const note=noteObject(row.note);
  let noteChanged=false;
  if(patch.mealType!=null){if(!MEALS.has(patch.mealType))throw new Error(L('Neplatný typ jídla.', 'Invalid meal type.'));note.mealType=patch.mealType;noteChanged=true}
  // amount_g: the new amount in the entry's own unit (grams for most foods).
  const amount=patch.amount_g??patch.quantity;
  const scaled=amount==null?{}:rescale(row,note,amount);
  if(amount!=null)noteChanged=true;
  const values=Object.fromEntries(Object.entries(FIELDS).map(([key,max])=>{
    if(patch[key]==='')throw new Error(L('Zkontroluj energii a makra.', 'Check the energy and macros.'));
    const value=patch[key]!=null?Number(patch[key]):scaled[key]!=null?scaled[key]:Number(row[key]||0);
    if(!Number.isFinite(value)||value<0||value>max)throw new Error(L('Zkontroluj energii a makra.', 'Check the energy and macros.'));
    return [key,round1(value)];
  }));
  const fiber=scaled.fiber_g!==undefined?scaled.fiber_g:row.fiber_g;
  await db.prepare('UPDATE food_logs SET consumed_date=?,consumed_at=?,recipe_title=?,kcal=?,protein_g=?,carbs_g=?,fat_g=?,fiber_g=?,note=? WHERE id=? AND user_id=?')
    .bind(date,changedDate(row.consumed_at,date),name,values.kcal,values.protein_g,values.carbs_g,values.fat_g,fiber,noteChanged?JSON.stringify(note):row.note,row.id,db.userId).run();
  return {status:'ok',id:row.id,date};
}

export async function copyFoodEntry(db,id,targetDate,mealType=null){
  const row=await existing(db,id),date=dateValue(targetDate);
  if(mealType!=null&&!MEALS.has(mealType))throw new Error(L('Neplatný typ jídla.', 'Invalid meal type.'));
  // A copy of another app's food is the athlete's own entry.
  let source=row.source,note=row.note;
  if(OTHER_APP.has(source)||mealType!=null){const n=noteObject(row.note);if(OTHER_APP.has(source)){delete n.external_id;delete n.app;source='manual'}if(mealType!=null)n.mealType=mealType;note=JSON.stringify(n)}
  const result=await db.prepare('INSERT INTO food_logs (user_id,consumed_date,consumed_at,cookbook_page,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,fiber_g,source,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(db.userId,date,changedDate(row.consumed_at,date),row.cookbook_page,row.recipe_title,row.servings,row.kcal,row.protein_g,row.carbs_g,row.fat_g,row.fiber_g,source,note).run();
  return {status:'ok',id:result.meta.last_row_id,date};
}

export async function deleteFoodEntry(db,id){
  // Another app's meal goes from Aurin only and stays out of later syncs.
  const imported=await existing(db,id);
  if(OTHER_APP.has(imported.source)){await hideAppleFood(db,db.userId,'meal',imported.id);return {status:'ok',id:imported.id,date:imported.consumed_date}}
  const row=await own(db,id);
  await db.prepare('DELETE FROM food_logs WHERE id=? AND user_id=?').bind(row.id,db.userId).run();
  return {status:'ok',id:row.id,date:row.consumed_date};
}

// Several foods at once (Vybrat in a meal): delete, move to another day or
// meal, or copy there. Another app's food is deleted from Aurin only and
// copied as the athlete's own; it cannot be moved. Returns what changed, by id.
export async function bulkFoodEntries(db,{action,ids,date,mealType}={}){
  const list=[...new Set((Array.isArray(ids)?ids:[]).map(Number).filter(n=>Number.isInteger(n)&&n>0))].slice(0,100);
  if(!list.length)throw new Error(L('Nic není vybrané.', 'Nothing is selected.'));
  if(!['delete','move','copy'].includes(action))throw new Error(L('Neznámá akce.', 'Unknown action.'));
  const done=[],skipped=[];
  for(const id of list){
    if(action==='delete'){done.push(await deleteFoodEntry(db,id));continue}
    if(action==='copy'){done.push(await copyFoodEntry(db,id,date,mealType??null));continue}
    const row=await existing(db,id);
    if(OTHER_APP.has(row.source)){skipped.push(id);continue}
    done.push(await updateFoodEntry(db,id,{date,mealType:mealType??undefined}));
  }
  return {status:'ok',done,skipped};
}
