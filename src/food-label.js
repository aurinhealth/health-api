// OCR output is a draft; missing fields remain missing until the user verifies the label.
// The table usually starts with energy, so a nutrient word before it (e.g. the
// product name "Protein pudding 200 g") is used only when the table lacks it.
const NUTRIENTS=[['protein_100g',/b[ií]lkovin|\bproteins?\b/i],['carbs_100g',/sacharid|carbohydrate/i],['fat_100g',/\btuky?\b|\bfats?\b/i],['fiber_100g',/vl[aá]knin|\bfib(?:er|re)\b/i],['salt_100g',/\bs[uů]l\b|\bsalt\b/i]];
const SUB_ITEM=/nasycen|saturated|cukr|sugars?\b|z toho|of which|mastn[eé] kyseliny/i;
export function parseNutritionLabel(text){
  const result={};const lines=String(text||'').split(/\r?\n/);
  const number=raw=>Number(String(raw).replace(',','.'));
  const energyLine=lines.findIndex(line=>/kcal|\bkj\b|energ/i.test(line)&&/\d/.test(line));
  const kcalOf=line=>{
    const pair=line.match(/kj\s*\/\s*kcal\D*?(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/i);if(pair)return number(pair[2]);
    const kcal=line.match(/(\d+(?:[.,]\d+)?)\s*kcal/i);if(kcal)return number(kcal[1]);
    return null;
  };
  // Energy: a line naming it first (a "1 porce = 120 kcal" note may precede the table).
  for(const line of [...lines.filter(l=>/energ/i.test(l)),...lines]){const v=kcalOf(line);if(v!=null){result.calories_100g=v;break;}}
  if(result.calories_100g==null){const kj=lines.map(l=>l.match(/(\d+(?:[.,]\d+)?)\s*kj\b/i)).find(Boolean);if(kj)result.calories_100g=Math.round(number(kj[1])/4.184);}
  const ordered=energyLine>0?[...lines.slice(energyLine),...lines.slice(0,energyLine)]:lines;
  for(const line of ordered){
    if(SUB_ITEM.test(line))continue;
    for(const [field,pattern] of NUTRIENTS){
      if(field in result)continue;
      const at=line.search(pattern);if(at<0)continue;
      const rest=line.slice(at);
      // "12,5 g"; when OCR drops the unit, the first number after the word.
      const match=rest.match(/(\d+(?:[.,]\d+)?)\s*g\b/i)||rest.match(/^[^\d]*?(\d+(?:[.,]\d+)?)(?:\s|$)/);
      if(match)result[field]=number(match[1]);
    }
  }
  return result;
}

// A warning when energy and macronutrients do not add up (4/4/9 kcal per g,
// fibre 2), which is the usual sign of a misread digit or a wrong column.
export function nutritionConsistency(values={}){
  const kcal=Number(values.calories_100g),p=Number(values.protein_100g),c=Number(values.carbs_100g),f=Number(values.fat_100g);
  if(![kcal,p,c,f].every(Number.isFinite)||kcal<40)return null;
  const fiber=Number(values.fiber_100g)||0,estimate=4*p+4*Math.max(0,c)+9*f+2*fiber;
  if(Math.abs(estimate-kcal)<=Math.max(25,kcal*.2))return null;
  return 'Energie '+Math.round(kcal)+' kcal nesedí s makroživinami (≈ '+Math.round(estimate)+' kcal). Zkontroluj přepis proti fotce.';
}

export function parseNutritionPortion(text){
  const raw=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const boundary=raw.findIndex(s=>/^suroviny$|^ingredients$|^přidat další$/i.test(s));
  const labelRows=raw.map((s,i)=>/^(?:(?:kalorie|energie|sacharidy|b[ií]lkoviny|tuky)\s*)+$/i.test(s)?i:-1).filter(i=>i>=0);
  const headerEnd=labelRows.length?Math.max(...labelRows)+1:raw.length;
  const summary=raw.slice(0,Math.min(boundary<0?raw.length:boundary,headerEnd));
  const values=parseNutritionLabel(summary.join('\n'));
  for(let i=0;i<summary.length-1;i++){
    const numbers=[...summary[i].matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kcal|g)\b/gi)],labels=[...summary[i+1].matchAll(/kalorie|energie|sacharidy|b[ií]lkoviny|tuky/gi)];
    if(numbers.length&&numbers.length<=labels.length)labels.slice(0,numbers.length).forEach((label,j)=>{const key=/kalorie|energie/i.test(label[0])?'calories_100g':/sacharidy/i.test(label[0])?'carbs_100g':/b[ií]lkoviny/i.test(label[0])?'protein_100g':'fat_100g';values[key]=Number(numbers[j][1].replace(',','.'));});
  }
  for(const [field,pattern] of [['calories_100g',/^kalorie$|^energie$/i],['protein_100g',/^b[ií]lkoviny$|^proteins?$/i],['carbs_100g',/^sacharidy$|^carbohydrates?$/i],['fat_100g',/^tuky$|^fat$/i]]){
    if(values[field]!=null)continue;
    const i=summary.findIndex(s=>pattern.test(s));
    if(i>=0){const previous=summary[i-1]?.match(/^([\d]+(?:[.,]\d+)?)\s*(?:g|kcal)$/i),next=summary[i+1]?.match(/^([\d]+(?:[.,]\d+)?)\s*(?:g|kcal)$/i);const match=previous||next;if(match)values[field]=Number(match[1].replace(',','.'));}
  }
  if((labelRows.length||['calories_100g','protein_100g','carbs_100g','fat_100g'].every(k=>values[k]!=null))&&values.calories_100g!=null&&!/100\s*(?:g|ml)/i.test(summary.join('\n'))){
    const mealTitle=summary.find(s=>/sn[ií]dan[eě]|ob[eě]d|ve[cč]e[rř]e|sva[cč]ina/i.test(s))?.match(/sn[ií]dan[eě]|ob[eě]d|ve[cč]e[rř]e|sva[cč]ina/i)?.[0];
    const valueIndex=summary.findIndex(s=>/\d\s*kcal/i.test(s));
    const name=summary.slice(0,valueIndex<0?summary.length:valueIndex).reverse().find(s=>s.length>2&&!/\d|energie|kalorie|kcal|b[ií]lkov|sachar|tuk|nutri[cč]|hodnot|ned[aá]vno|ulo[zž]it|přidat|^[<>]|^(?:sn[ií]dan[eě]|ob[eě]d|ve[cč]e[rř]e|sva[cč]ina)$/i.test(s))||mealTitle;
    return {values,basis:'portion',ambiguous:false,name:name?.slice(0,120)||null};
  }
  // In a two-column table, the portion is normally the last value. Show all OCR text for correction.
  const lines=String(text||'').split(/\r?\n/).map(line=>{const values=[...line.matchAll(/([\d]+(?:[.,]\d+)?)\s*(kcal|g)\b/gi)];if(values.length>1){const unit=/kcal/i.test(line)?'kcal':'g',matches=values.filter(v=>v[2].toLowerCase()===unit);if(matches.length>1)return line.slice(0,matches[0].index)+matches.at(-1)[0];}return line;});
  return {values:parseNutritionLabel(lines.join('\n')),basis:'portion',ambiguous:/100\s*(?:g|ml)/i.test(text),name:String(text||'').split(/\r?\n/).map(s=>s.trim()).find(s=>s.length>2&&!/\d|energie|kcal|b[ií]lkov|sachar|tuk|nutri[cč]|hodnot/i.test(s))?.slice(0,120)||'Jídlo z fotografie'};
}
