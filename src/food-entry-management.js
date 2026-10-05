const MEALS=new Set(['breakfast','snack_am','lunch','snack_pm','dinner','snack']);
const FIELDS={kcal:10000,protein_g:1000,carbs_g:1000,fat_g:1000};

function dateValue(value){
  const date=String(value||'');
  const parsed=new Date(date+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error('Zadej platné datum.');
  return date;
}
function entryId(value){
  const id=Number(value);
  if(!Number.isSafeInteger(id)||id<=0)throw new Error('Neplatné jídlo.');
  return id;
}
function noteObject(value){try{const note=JSON.parse(value||'{}');return note&&typeof note==='object'&&!Array.isArray(note)?note:{legacyNote:String(value)}}catch{return value?{legacyNote:String(value)}:{}}}
function changedDate(timestamp,date){return /^\d{4}-\d{2}-\d{2}/.test(String(timestamp||''))?date+String(timestamp).slice(10):date+'T12:00:00.000Z'}
async function existing(db,id){const row=await db.prepare('SELECT * FROM food_logs WHERE id=? AND user_id=?').bind(entryId(id),db.userId).first();if(!row)throw new Error('Jídlo už v deníku není.');return row}

export async function updateFoodEntry(db,id,patch){
  const row=await existing(db,id),date=patch.date==null?row.consumed_date:dateValue(patch.date);
  const name=patch.name==null?row.recipe_title:String(patch.name).trim().slice(0,180);
  if(!name)throw new Error('Doplň název jídla.');
  const note=noteObject(row.note);
  if(patch.mealType!=null){if(!MEALS.has(patch.mealType))throw new Error('Neplatný typ jídla.');note.mealType=patch.mealType}
  const values=Object.fromEntries(Object.entries(FIELDS).map(([key,max])=>{
    if(patch[key]==='')throw new Error('Zkontroluj energii a makra.');
    const value=patch[key]==null?Number(row[key]||0):Number(patch[key]);
    if(!Number.isFinite(value)||value<0||value>max)throw new Error('Zkontroluj energii a makra.');
    return [key,Math.round(value*10)/10];
  }));
  await db.prepare('UPDATE food_logs SET consumed_date=?,consumed_at=?,recipe_title=?,kcal=?,protein_g=?,carbs_g=?,fat_g=?,note=? WHERE id=? AND user_id=?')
    .bind(date,changedDate(row.consumed_at,date),name,values.kcal,values.protein_g,values.carbs_g,values.fat_g,patch.mealType==null?row.note:JSON.stringify(note),row.id,db.userId).run();
  return {status:'ok',id:row.id,date};
}

export async function copyFoodEntry(db,id,targetDate){
  const row=await existing(db,id),date=dateValue(targetDate);
  const result=await db.prepare('INSERT INTO food_logs (user_id,consumed_date,consumed_at,cookbook_page,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,fiber_g,source,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(db.userId,date,changedDate(row.consumed_at,date),row.cookbook_page,row.recipe_title,row.servings,row.kcal,row.protein_g,row.carbs_g,row.fat_g,row.fiber_g,row.source,row.note).run();
  return {status:'ok',id:result.meta.last_row_id,date};
}

export async function deleteFoodEntry(db,id){
  const row=await existing(db,id);
  await db.prepare('DELETE FROM food_logs WHERE id=? AND user_id=?').bind(row.id,db.userId).run();
  return {status:'ok',id:row.id,date:row.consumed_date};
}
