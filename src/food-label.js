// OCR output is a draft; missing fields remain missing until the user verifies the label.
export function parseNutritionLabel(text){
  const result={};const lines=String(text||'').split(/\r?\n/);
  const number=raw=>Number(String(raw).replace(',','.'));
  for(const line of lines){
    const energy=line.match(/([\d]+(?:[.,]\d+)?)\s*kcal/i);if(energy&&!('calories_100g'in result))result.calories_100g=number(energy[1]);
    for(const [field,pattern]of [['protein_100g',/b[ií]lkoviny|proteins?/i],['carbs_100g',/sacharidy|carbohydrates?/i],['fat_100g',/tuky|^\s*fat\b/i],['fiber_100g',/vl[aá]knina|fib(?:er|re)/i],['salt_100g',/s[uů]l|salt/i]]){
      if(pattern.test(line)&&!field.includes('calories')&&!/nasycen|saturated|cukry|sugars/i.test(line)){const match=line.match(/([\d]+(?:[.,]\d+)?)\s*g\b/i);if(match&&!(field in result))result[field]=number(match[1]);}
    }
  }
  return result;
}

export function parseNutritionPortion(text){
  // In a two-column table, the portion is normally the last value. Show all OCR text for correction.
  const lines=String(text||'').split(/\r?\n/).map(line=>{const values=[...line.matchAll(/([\d]+(?:[.,]\d+)?)\s*(kcal|g)\b/gi)];if(values.length>1){const unit=/kcal/i.test(line)?'kcal':'g',matches=values.filter(v=>v[2].toLowerCase()===unit);if(matches.length>1)return line.slice(0,matches[0].index)+matches.at(-1)[0];}return line;});
  return {values:parseNutritionLabel(lines.join('\n')),basis:'portion',ambiguous:/100\s*(?:g|ml)/i.test(text),name:String(text||'').split(/\r?\n/).map(s=>s.trim()).find(s=>s.length>2&&!/\d|energie|kcal|b[ií]lkov|sachar|tuk|nutri[cč]|hodnot/i.test(s))?.slice(0,120)||'Jídlo z fotografie'};
}
