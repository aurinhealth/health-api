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
