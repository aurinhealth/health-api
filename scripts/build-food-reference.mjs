// Deterministic import of cited everyday foods. Names are translated; nutrients
// are copied, never generated. Run with the official OpenNutrition 2025.1 TSV.
import {createReadStream,writeFileSync,readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
const translations=`
Chicken Breast, Boneless Skinless, Cooked|Kuřecí prsa · tepelně upravená|kuřecí maso vařené
Boneless Skinless Chicken Breast, Raw|Kuřecí prsa · syrová bez kůže|kuřecí maso kuře
Rice, Cooked|Rýže · vařená|rýže vařená
Long Grain White Rice|Rýže bílá dlouhozrnná · suchá|rýže suchá
Jasmine Rice|Rýže jasmínová · suchá|jasmínová rýže
Basmati Rice|Rýže basmati · suchá|basmati
Brown Rice|Rýže natural · suchá|hnědá rýže
Rolled Oats|Ovesné vločky|vločky oves
Oatmeal, Cooked|Ovesná kaše · vařená ve vodě|ovesná kaše
Quick Oats|Ovesné vločky · jemné|jemné vločky
Whole Milk|Mléko plnotučné|mléko
2% Reduced-Fat Milk|Mléko · 2 % tuku|mléko polotučné 2%
1% Low-Fat Milk|Mléko · 1 % tuku|nízkotučné mléko
Nonfat Milk|Mléko odstředěné|odstředěné mléko
Unsweetened Oat Milk|Ovesný nápoj · neslazený|ovesné mléko
Banana|Banán · jedlý podíl|banán banány banánu
Apples|Jablko · jedlý podíl|jablko jablka jablku
Yellow Nectarine|Nektarinka · čerstvá|nektarinka nektarinky nektarinku
Pear|Hruška · čerstvá|hruška hrušky
Peach|Broskev · čerstvá|broskev broskve
Plums|Švestky · čerstvé|švestka švestky slíva
Orange|Pomeranč · jedlý podíl|pomeranč pomeranče
Clementines|Klementinka|mandarinka mandarinky klementinky
Grapes|Hroznové víno|hrozny víno hroznové
Blueberries|Borůvky · čerstvé|borůvka borůvky
Blueberries, Frozen|Borůvky · mražené|mražené borůvky
Strawberries|Jahody · čerstvé|jahoda jahody
Strawberries, Frozen|Jahody · mražené|mražené jahody
Raspberries|Maliny · čerstvé|malina maliny
Raspberries, Frozen|Maliny · mražené|mražené maliny
Lemon|Citron · jedlý podíl|citrón citron citróny
Avocado|Avokádo · jedlý podíl|avokádo
Potatoes|Brambory · syrové|brambor brambory
Sweet Potatoes|Batáty · syrové|batát sladké brambory
Roasted Potatoes|Brambory · pečené|pečené brambory
Mashed Potatoes|Bramborová kaše|kaše bramborová
Onions|Cibule · syrová|cibule cibuli
Onions, Cooked|Cibule · vařená|vařená cibule
Garlic|Česnek|česnek česneku
Garlic Powder|Česnek · sušený|sušený česnek
Carrots|Mrkev · syrová|mrkev mrkve
Tomatoes|Rajčata · čerstvá|rajče rajčata rajčátka
Cherry Tomatoes|Cherry rajčata|cherry rajče
Cucumber|Okurka · čerstvá|okurka okurky
Spinach|Špenát · syrový|špenát
Spinach, Cooked|Špenát · vařený|vařený špenát
Broccoli|Brokolice · syrová|brokolice
Broccoli, Frozen|Brokolice · mražená|mražená brokolice
Cauliflower|Květák · syrový|květák
Cauliflower, Frozen|Květák · mražený|mražený květák
Zucchini|Cuketa · syrová|cuketa cukety
Eggplant|Lilek · syrový|lilek baklažán
Green Cabbage|Zelí bílé · syrové|bílé zelí zelí
Pumpkin|Dýně · syrová|dýně
Mushrooms|Žampiony · syrové|houby žampiony žampion
Bell Peppers|Paprika · syrová|paprika papriky
Green Bell Peppers|Paprika zelená · syrová|zelená paprika
Yellow Bell Peppers|Paprika žlutá · syrová|žlutá paprika
Green Peas, Frozen|Hrášek · mražený|hrášek zelený hrách
Corn|Kukuřice|kukuřice
Romaine Lettuce|Salát římský|římský salát
Spaghetti|Špagety · suché|špagety těstoviny suché
Spaghetti, Cooked|Špagety · vařené|špagety vařené těstoviny
Fusilli|Těstoviny fusilli · suché|fusilli vřetena
Fusilli, Cooked|Těstoviny fusilli · vařené|vařené fusilli
Macaroni|Makarony · suché|makarony
Macaroni, Cooked|Makarony · vařené|vařené makarony
Penne, Cooked|Těstoviny penne · vařené|penne
Couscous|Kuskus · suchý|kuskus couscous
Quinoa|Quinoa · suchá|quinoa merlík
Brown Lentils|Čočka hnědá · suchá|čočka
Red Lentils|Čočka červená · suchá|červená čočka
Lentils, Cooked|Čočka · vařená|vařená čočka
Canned Chickpeas|Cizrna · konzervovaná|cizrna
Chickpeas, Canned and Drained|Cizrna · konzervovaná, slitá|slitá cizrna
Black Beans, Canned and Drained|Fazole černé · konzervované, slité|fazole černé
Whole Wheat Flour|Mouka pšeničná celozrnná|celozrnná mouka
White Bread|Chléb bílý|bílý chléb chleba
Whole Wheat Bread|Chléb celozrnný pšeničný|celozrnný chléb
Rye Bread|Chléb žitný|žitný chléb žitný chleba
Whole Wheat Tortilla|Tortilla celozrnná|celozrnná tortilla
Corn Tortillas|Tortilla kukuřičná|kukuřičná tortilla
Butter|Máslo|máslo másla
Unsalted Butter|Máslo nesolené|nesolené máslo
Olive Oil|Olivový olej|olej olivový
Extra Virgin Olive Oil|Olivový olej extra panenský|extra panenský olej
Canola Oil|Řepkový olej|olej řepkový
Sugar|Cukr|cukr cukru
Honey|Med|med medu
Almonds|Mandle|mandle
Almonds, Roasted|Mandle · pražené|pražené mandle
Walnuts|Vlašské ořechy|vlašský ořech ořechy
Peanuts|Arašídy|arašídy burské oříšky
Peanuts, Roasted|Arašídy · pražené|pražené arašídy
Smooth Peanut Butter|Arašídové máslo · hladké|arašídové máslo
Crunchy Peanut Butter|Arašídové máslo · křupavé|křupavé arašídové máslo
Tofu|Tofu|tofu
Firm Tofu|Tofu · pevné|pevné tofu
Hummus|Hummus|humus hummus
Whole Milk Unsweetened Yogurt|Jogurt bílý plnotučný|jogurt bílý plnotučný
Low-Fat Unsweetened Yogurt|Jogurt bílý nízkotučný|nízkotučný jogurt
Whole Milk Greek Yogurt|Řecký jogurt plnotučný|řecký jogurt
Low-Fat Greek Yogurt|Řecký jogurt nízkotučný|nízkotučný řecký jogurt
Cottage Cheese|Sýr cottage|cottage cottage cheese
Cheddar Cheese|Sýr cheddar|čedar cheddar
Part-Skim Mozzarella Cheese|Mozzarella · částečně odtučněná|mozzarella
Parmesan Cheese, Grated|Parmazán · strouhaný|parmazán parmesan
Hard-Boiled Eggs|Vejce · vařené natvrdo|vejce vařené vajíčko
Scrambled Eggs|Vejce · míchaná|míchaná vejce
Egg Whites|Vaječný bílek|bílek bílky
Turkey Breast, Raw|Krůtí prsa · syrová|krůtí maso
Turkey Breast, Cooked|Krůtí prsa · tepelně upravená|vařené krůtí maso
Chicken Thighs, Boneless Skinless, Raw|Kuřecí stehna · syrová bez kůže|kuřecí stehna
Ground Beef, Raw|Hovězí maso mleté · syrové|mleté hovězí hovězí maso
Ground Beef, Cooked|Hovězí maso mleté · tepelně upravené|vařené mleté hovězí
Pork Tenderloin, Raw|Vepřová panenka · syrová|panenka vepřová
Grilled Pork Tenderloin|Vepřová panenka · grilovaná|grilovaná panenka
Pork Shoulder, Raw|Vepřová plec · syrová|vepřová plec
Atlantic Salmon, Raw|Losos atlantský · syrový|losos
Atlantic Salmon, Cooked|Losos atlantský · tepelně upravený|vařený losos
Smoked Salmon|Losos · uzený|uzený losos
Light Tuna, Canned, Drained|Tuňák · konzervovaný, slitý|tuňák
Dark Chocolate|Čokoláda hořká|hořká čokoláda
Milk Chocolate|Čokoláda mléčná|mléčná čokoláda
Orange Juice|Pomerančová šťáva|pomerančový džus
Tomato Ketchup|Kečup rajčatový|kečup ketchup
Mayonnaise|Majonéza|majonéza
Cinnamon|Skořice|skořice
Black Pepper|Pepř černý|pepř
Water|Voda|voda
`.trim().split('\n').map(line=>line.split('|'));
const names=new Map(translations.map(([en,name,alias])=>[en,{name,aliases:alias.split(' ')}]));
const reader=createInterface({input:createReadStream(process.argv[2]),crlfDelay:Infinity});
const products=[],seen=new Set();
for await(const line of reader){const cols=line.split('\t'),mapped=names.get(cols[1]);if(!mapped||cols[4]!=='everyday'||seen.has(cols[1]))continue;const citations=JSON.parse(cols[5]);if(!citations.length)continue;const n=JSON.parse(cols[7]);if(['calories','protein','carbohydrates','total_fat'].some(k=>!Number.isFinite(n[k])||n[k]<0))continue;const fiber=Number.isFinite(n.dietary_fiber)?n.dietary_fiber:null;
  // USDA total carbohydrate includes fiber. EU "Sacharidy" excludes it.
  const carbs=fiber==null?null:Math.max(0,n.carbohydrates-fiber);if(carbs==null)continue;
  products.push({id:cols[0],name:mapped.name,aliases:mapped.aliases,original_name:cols[1],nutrition_basis:'g',calories_100g:n.calories,protein_100g:n.protein,carbs_100g:Math.round(carbs*100)/100,fat_100g:n.total_fat,fiber_100g:fiber,salt_100g:Number.isFinite(n.sodium)?Math.round(n.sodium/1000*2.5*1000)/1000:null,source:'opennutrition',source_url:'https://www.opennutrition.app/search',citations,brand:'Běžná surovina · referenční hodnoty',confidence:'reference',quantity:''});seen.add(cols[1]);
}
const dataset={version:'2025.1-cs-1',source:'OpenNutrition',license:'ODbL-1.0; modified DbCL-1.0',license_url:'https://opendatacommons.org/licenses/odbl/1-0/',contents_license_url:'https://www.opennutrition.app/download',attribution:'OpenNutrition · https://www.opennutrition.app',source_download:'https://downloads.opennutrition.app/opennutrition-dataset-2025.1.zip',modifications:'Czech names and search aliases; selected reference foods with source citations; available carbohydrates exclude dietary fiber; sodium converted to salt.',carbohydrate_convention:'available carbohydrates = total carbohydrates minus dietary fiber; per 100 g, not per 100 ml',products};
dataset.license_text=readFileSync(new URL('../data/licenses/OpenNutrition-ODbL.txt',import.meta.url),'utf8');
dataset.contents_license_text=readFileSync(new URL('../data/licenses/OpenNutrition-DbCL.txt',import.meta.url),'utf8');
writeFileSync(new URL('../src/food-reference-data.json',import.meta.url),JSON.stringify(dataset,null,2)+'\n');
console.log(JSON.stringify({imported:products.length,missing:translations.filter(([en])=>!seen.has(en)).map(([en])=>en)}));
