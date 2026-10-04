export function parseFoodQuantity(value){
  const text=String(value??'').trim().replace(',','.');
  const fraction=text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  const result=fraction?Number(fraction[1])/Number(fraction[2]):Number(text);
  return text&&Number.isFinite(result)&&result>0?result:null;
}
export function foodPackageSize(value){
  const text=String(value||'').toLowerCase().replace(',','.');
  const multi=text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  const single=text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/),match=multi||single;
  if(!match)return null;const count=multi?Number(match[1]):1,amount=Number(match[multi?2:1]),unit=match[multi?3:2];
  return {amount:amount*(unit==='kg'||unit==='l'?1000:unit==='cl'?10:1),unit:/ml|cl|^l$/.test(unit)?'ml':'g',count};
}
export function foodPortionDefaults(product){
  const pack=foodPackageSize(product?.quantity),serving=foodPackageSize(product?.serving_size);
  const basis=product?.nutrition_basis==='ml'?'ml':product?.nutrition_basis==='g'?'g':pack?.unit||serving?.unit||'g';
  return {basis,package:pack,serving,unit:pack?'pack':basis,quantity:1*(pack?1:100)};
}
export function foodIntake(product,quantity,unit,options={}){
  const q=parseFoodQuantity(quantity);if(!q||q>10000)throw new Error('Zadej množství, například 100, 0,5 nebo 1/2.');
  const meta=foodPortionDefaults(product);let amount=q,amountUnit=unit;
  if(unit==='pack'){if(!meta.package)throw new Error('Velikost balení není známá. Zadej g/ml nebo velikost jednoho kusu.');amount=q*meta.package.amount;amountUnit=meta.package.unit;}
  else if(unit==='piece'){const saved=foodPackageSize(product?.piece_size),piece=parseFoodQuantity(options.pieceAmount)||saved?.amount;if(!piece)throw new Error('Doplň velikost jednoho kusu podle etikety nebo vážení.');amount=q*piece;amountUnit=options.pieceUnit||saved?.unit||meta.basis;}
  else if(unit!=='g'&&unit!=='ml'&&unit!=='portion')throw new Error('Neplatná jednotka.');
  if(product?.nutrition_basis==='portion'){if(unit!=='portion')throw new Error('Hodnoty jsou za celou porci. Zadej počet porcí.');amount=q;amountUnit='portion';}
  else if(unit==='portion'){if(!meta.serving)throw new Error('Doplň velikost jedné porce v g/ml.');amount=q*meta.serving.amount;amountUnit=meta.serving.unit;}
  if(amountUnit!==meta.basis&&amountUnit!=='portion'){const density=parseFoodQuantity(options.density);if(!density)throw new Error('Převod g ↔ ml vyžaduje hustotu v g/ml. Nebo použij jednotku nutriční tabulky.');amount=amountUnit==='ml'?amount*density:amount/density;amountUnit=meta.basis;}
  if(amount>100000)throw new Error('Množství je příliš velké.');
  const factor=amountUnit==='portion'?q:amount/100,result={amount,unit:amountUnit,factor};
  for(const [key,field]of [['calories','calories_100g'],['protein_g','protein_100g'],['carbs_g','carbs_100g'],['fat_g','fat_100g'],['fiber_g','fiber_100g'],['salt_g','salt_100g']])result[key]=product?.[field]==null||product[field]===''?null:Number(product[field])*factor;
  return result;
}
