import dataset from './food-reference-data.json' with {type:'json'};

export const foodReferenceDataset=dataset;
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1)));row=next;}return row[b.length];}

// Match all requested words. Never turn a named brand into an unrelated generic food.
export function searchReferenceFoods(query,limit=12){return rankFoods(dataset.products,query,limit);}

// Shared by the reference foods and NutriDatabaze. Equal scores keep the input order.
export function rankFoods(products,query,limit=12){
 const q=fold(query),tokens=q.split(' ').filter(Boolean);if(!q)return [];
 return products.map(p=>{
  const name=fold(p.name),words=fold([p.name,...(p.aliases||[])].join(' ')).split(' ');
  let score=0;
  for(const token of tokens){const exact=words.includes(token),prefix=token.length>=3&&words.some(w=>w.startsWith(token));
   const fuzzy=!exact&&!prefix&&token.length>=5&&words.some(w=>Math.abs(w.length-token.length)<=1&&distance(w,token)<=1);
   if(!exact&&!prefix&&!fuzzy)return null;score+=exact?30:prefix?15:5;
  }
  if(name===q||name.startsWith(q+' '))score+=50;
  return {p,score};
 }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,Math.max(1,Math.min(20,Number(limit)||12))).map(({p})=>({...p}));
}
