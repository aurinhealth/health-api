// Single-ingredient foods (meat cuts, fish, eggs, plain dairy, fruit,
// vegetables, legumes, grains, nuts, seeds) whose vitamins and minerals are
// estimated from one generic food of a composition table. Used by
// scripts/build-micronutrients.mjs for catalogue foods (mostly Open Food Facts)
// that have only macros. A name matches an entry when every `has` pattern is in
// it (folded: lower case, no diacritics, so Czech is written without them), no
// `not` pattern is, and no excluded word (processed, flavoured, mixed) is,
// unless the entry `allow`s it. The build then accepts the match only when the
// food's macros agree with the reference (macrosAgree), which also separates
// raw from cooked and plain from sweetened.
//
// Each reference is [source, exact description in that table]. US milk, flour,
// rice and bread are fortified, so milk comes from CoFID and grains are the
// unenriched USDA items or European tables.
import { fold } from '../src/world-foods.js';

// Words that mark a processed, flavoured or composed product (prefixes).
export const EXCLUDED = ['obal', 'marin', 'uzen', 'sunk', 'salam', 'parek', 'parky', 'klobas', 'slanin', 'slajs', 'ochuc',
  'prichut', 'sirup', 'cokol', 'sladk', 'slazen', 'kandov', 'karamel', 'smaz', 'pecen', 'gril', 'varen', 'dusen', 'bread',
  'batter', 'smoked', 'cured', 'flavo', 'sweeten', 'candied', 'fried', 'roast', 'prazen', 'cooked', 'sauce', 'omack',
  'dressing', 'nugget', 'kebab', 'gyros', 'burger', 'pizza', 'polevk', 'soup', 'pastik', 'pate', 'jerky', 'susen', 'dried',
  'dzem', 'marmelad', 'kompot', 'syrup', 'nektar', 'nectar', 'chips', 'lupin', 'hranol', 'kroket', 'steril', 'nakladan',
  'pickl', 'brine', 'nalev', 'kysan', 'prasek', 'powder', 'protein', 'instant', 'smes', 'salat', 'salad', 'jogurt', 'yog',
  'tycin', 'rolk', 'chrum', 'snack', 'crisp', 'puff', 'pufovan', 'dort', 'kolac', 'musli', 'muesli', 'granola', 'cereal', 'zmrzlin', 'bonbon', 'puding', 'pudding', 'dezert',
  'dessert', 'smoothie', 'napoj', 'drink', 'vegan', 'veggi', 'rostlinn', 'imitac', 'alternativ', 'vanil', 'kakao', 'cocoa',
  'cukr', 'sugar', 'krem', 'cream', 'pomazank', 'spread', 'hotov', 'sous', 'konzerv', 'canned', 'tavene', 'taveny',
  'tavenn', 'chut', 'aroma', 'koren', 'spice', 'seasoned', 'stuffed', 'plnen', 'dzus', 'juice', 'mlecn', 'mouc', 'pecivo'];
// Whole words that mark the same, or join several ingredients.
export const EXCLUDED_WORDS = ['med', 'honey', 'bar', 'jam', 'ice', 'mix', 'style', 's', 'se', 'a', 'and', 'with', 'mit',
  'avec', 'con', 'v', 've', 'in', 'und', 'et', 'na', 'ala', 'la'];

const SR = 'usda_sr_legacy', COFID = 'cofid';
const PLANT_MILK = 'sojov\\w*|ovesn\\w*|mandl\\w*|kokos\\w*|ryzov\\w*|rostlin\\w*|soy\\w*|oat|almond|coconut|rice|kozi|goat|kondenz\\w*|condensed|zakys\\w*|kefir\\w*|podmasl\\w*|buttermilk|acidof\\w*';
const CHICKEN = 'kure|kurec\\w*|kurat\\w*|chicken|broiler';
const NOT_PART = 'drum\\w*|stehen\\w*|stehn\\w*|thigh|kridl\\w*|kridel|wing\\w*|jatr\\w*|liver|mlet\\w*|ground|minced|palick\\w*|drumstick|cele|whole|ctvrt\\w*|kuze|skin';

// [id, Czech label, has (all), refs, options]
const RAW = [
  // Poultry
  ['chicken_breast', 'Kuřecí prsa', [CHICKEN, 'prs\\w*|breast\\w*|rizk\\w*|rizek|file\\w*|fillet\\w*|supreme'], [[SR, 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw']], { not: NOT_PART }],
  ['chicken_thigh', 'Kuřecí stehna', [CHICKEN, 'stehen\\w*|stehn\\w*|thigh\\w*|horn\\w*'], [[SR, 'Chicken, broilers or fryers, dark meat, thigh, meat only, raw'], [SR, 'Chicken, broilers or fryers, thigh, meat and skin, raw']], { not: 'jatr\\w*|liver|kridl\\w*|wing\\w*' }],
  ['chicken_drumstick', 'Kuřecí paličky', [CHICKEN, 'palick\\w*|drumstick\\w*'], [[SR, 'Chicken, broilers or fryers, drumstick, meat and skin, raw'], [SR, 'Chicken, broilers or fryers, dark meat, drumstick, meat only, raw']]],
  ['chicken_wing', 'Kuřecí křídla', [CHICKEN, 'kridl\\w*|kridel|wing\\w*'], [[SR, 'Chicken, broilers or fryers, wing, meat and skin, raw']]],
  ['chicken_whole', 'Kuře celé', ['kure|chicken', 'cele|cely|whole|grilovaci'], [[SR, 'Chicken, broilers or fryers, meat and skin, raw']], { not: 'prs\\w*|breast|stehn\\w*|thigh|kridl\\w*|wing' }],
  ['chicken_ground', 'Kuřecí mleté maso', [CHICKEN, 'mlet\\w*|ground|minced'], [[SR, 'Chicken, ground, raw']]],
  ['chicken_liver', 'Kuřecí játra', [CHICKEN, 'jatr\\w*|liver\\w*'], [[SR, 'Chicken, liver, all classes, raw']]],
  ['turkey_breast', 'Krůtí prsa', ['kruti|krut\\w*|turkey', 'prs\\w*|breast\\w*|rizk\\w*|file\\w*|fillet\\w*'], [[SR, 'Turkey, whole, breast, meat only, raw']], { not: 'stehn\\w*|stehen\\w*|thigh|mlet\\w*|ground|minced' }],
  ['turkey_thigh', 'Krůtí stehno', ['kruti|krut\\w*|turkey', 'stehn\\w*|stehen\\w*|thigh\\w*|horn\\w*'], [[SR, 'Turkey, thigh, from whole bird, meat only, raw']]],
  ['turkey_ground', 'Krůtí mleté maso', ['kruti|krut\\w*|turkey', 'mlet\\w*|ground|minced'], [[SR, 'Turkey, ground, raw']]],
  ['duck', 'Kachna', ['kachna|kachni|duck'], [[SR, 'Duck, domesticated, meat and skin, raw'], [SR, 'Duck, domesticated, meat only, raw']], { not: 'jatr\\w*|liver|sadl\\w*|fat' }],
  // Beef, veal, pork, lamb, game
  ['beef_ground', 'Hovězí mleté maso', ['hovezi|beef', 'mlet\\w*|ground|minced'], [[SR, 'Beef, ground, 95% lean meat / 5% fat, raw'], [SR, 'Beef, ground, 90% lean meat / 10% fat, raw'], [SR, 'Beef, ground, 85% lean meat / 15% fat, raw'], [SR, 'Beef, ground, 80% lean meat / 20% fat, raw'], [SR, 'Beef, ground, 75% lean meat / 25% fat, raw']], { not: 'veprov\\w*|pork' }],
  ['beef_tenderloin', 'Hovězí svíčková', ['hovezi|beef|svickov\\w*', 'svickov\\w*|tenderloin|filet\\w*|fillet'], [[SR, 'Beef, tenderloin, steak, separable lean only, trimmed to 1/8" fat, all grades, raw']]],
  ['beef_sirloin', 'Hovězí roštěná', ['hovezi|beef|rosten\\w*', 'rosten\\w*|sirloin|steak\\w*|ribeye|entrecote|rump\\w*'], [[SR, 'Beef, top sirloin, steak, separable lean only, trimmed to 1/8" fat, all grades, raw'], [SR, 'Beef, rib, eye, small end (ribs 10-12), separable lean and fat, trimmed to 0" fat, choice, raw']]],
  ['beef_round', 'Hovězí kýta', ['hovezi|beef', 'kyt\\w*|round|ořech|orech|valek|spicka|plec\\w*|chuck|zadni|predni|guláš|gulas\\w*|stew'], [[SR, 'Beef, round, top round, steak, separable lean only, trimmed to 1/8" fat, all grades, raw'], [SR, 'Beef, chuck, arm pot roast, separable lean only, trimmed to 1/8" fat, all grades, raw'], [SR, 'Beef, chuck, arm pot roast, separable lean and fat, trimmed to 1/8" fat, all grades, raw']]],
  ['beef_liver', 'Hovězí játra', ['hovezi|beef', 'jatr\\w*|liver'], [[SR, 'Beef, variety meats and by-products, liver, raw']]],
  ['pork_tenderloin', 'Vepřová panenka', ['panenk\\w*|tenderloin'], [[SR, 'Pork, fresh, loin, tenderloin, separable lean only, raw']], { not: 'hovezi|beef' }],
  ['pork_loin', 'Vepřová kotleta', ['veprov\\w*|pork', 'kotlet\\w*|chop\\w*|loin|nizk\\w*|vysok\\w*|karbanatek'], [[SR, 'Pork, fresh, loin, center loin (chops), bone-in, separable lean only, raw'], [SR, 'Pork, fresh, loin, center loin (chops), bone-in, separable lean and fat, raw']], { not: 'tenderloin|panenk\\w*' }],
  ['pork_neck', 'Vepřová krkovice', ['krkovic\\w*|pork neck|neck|butt|krk'], [[SR, 'Pork, fresh, shoulder, (Boston butt), blade (steaks), separable lean and fat, raw'], [SR, 'Pork, fresh, shoulder, (Boston butt), blade (steaks), separable lean only, raw']], { not: 'hovezi|beef|kruti|turkey|kach\\w*' }],
  ['pork_leg', 'Vepřová kýta', ['veprov\\w*|pork', 'kyt\\w*|leg|ham|plec\\w*|shoulder|gulas\\w*|stew|platk\\w*|rizk\\w*|maso'], [[SR, 'Pork, fresh, leg (ham), whole, separable lean only, raw'], [SR, 'Pork, fresh, shoulder, whole, separable lean only, raw'], [SR, 'Pork, fresh, shoulder, whole, separable lean and fat, raw']], { not: 'mlet\\w*|ground|minced|jatr\\w*|liver|bucek|belly|zebr\\w*|rib\\w*' }],
  ['pork_belly', 'Vepřový bůček', ['bucek|bucku|belly|bok'], [[SR, 'Pork, fresh, belly, raw']], { not: 'hovezi|beef' }],
  ['pork_ribs', 'Vepřová žebra', ['veprov\\w*|pork', 'zebr\\w*|zebir\\w*|ribs?|spareribs?'], [[SR, 'Pork, fresh, spareribs, separable lean and fat, raw']]],
  ['pork_ground', 'Vepřové mleté maso', ['veprov\\w*|pork', 'mlet\\w*|ground|minced'], [[SR, 'Pork, fresh, ground, raw']], { not: 'hovezi|beef' }],
  ['pork_liver', 'Vepřová játra', ['veprov\\w*|pork', 'jatr\\w*|liver'], [[SR, 'Pork, fresh, variety meats and by-products, liver, raw']]],
  ['veal', 'Telecí maso', ['telec\\w*|veal'], [[SR, 'Veal, leg (top round), separable lean only, raw']], { not: 'jatr\\w*|liver' }],
  ['lamb', 'Jehněčí maso', ['jehnec\\w*|lamb'], [[SR, 'Lamb, leg, whole (shank and sirloin), separable lean only, trimmed to 1/4" fat, choice, raw'], [SR, 'Lamb, composite of trimmed retail cuts, separable lean and fat, trimmed to 1/4" fat, choice, raw']]],
  ['rabbit', 'Králík', ['kralik\\w*|kralic\\w*|rabbit'], [[SR, 'Game meat, rabbit, domesticated, composite of cuts, raw']]],
  ['venison', 'Zvěřina', ['zverin\\w*|jelen\\w*|srnci|srnec|venison|deer'], [[SR, 'Game meat, deer, raw']]],
  // Fish and seafood
  ['salmon', 'Losos', ['losos\\w*|salmon'], [[SR, 'Fish, salmon, Atlantic, farmed, raw'], [SR, 'Fish, salmon, Atlantic, wild, raw'], [SR, 'Fish, salmon, pink, raw']]],
  ['cod', 'Treska', ['tresk\\w*|cod'], [[SR, 'Fish, cod, Atlantic, raw'], [SR, 'Fish, pollock, Alaska, raw']], { not: 'jatr\\w*|liver|jikr\\w*|roe' }],
  ['pollock', 'Aljašská treska', ['pollock|pollack|aljas\\w*'], [[SR, 'Fish, pollock, Alaska, raw']]],
  ['hake', 'Merluza', ['merluz\\w*|merlus\\w*|hake'], [[SR, 'Fish, whiting, mixed species, raw']]],
  ['tuna', 'Tuňák', ['tunak\\w*|tuna'], [[SR, 'Fish, tuna, fresh, yellowfin, raw']]],
  ['tuna_canned_water', 'Tuňák ve vlastní šťávě', ['tunak\\w*|tuna', 'vlastn\\w*|stav\\w*|vod\\w*|water|brine|nalev\\w*|natural\\w*'], [[SR, 'Fish, tuna, light, canned in water, drained solids']], { allow: 'nalev\\w*|brine|v|ve|in|konzerv\\w*|canned|steril\\w*' }],
  ['tuna_canned_oil', 'Tuňák v oleji', ['tunak\\w*|tuna', 'olej\\w*|oil'], [[SR, 'Fish, tuna, light, canned in oil, drained solids']], { allow: 'v|ve|in|konzerv\\w*|canned|steril\\w*' }],
  ['trout', 'Pstruh', ['pstruh\\w*|trout'], [[SR, 'Fish, trout, rainbow, farmed, raw']]],
  ['carp', 'Kapr', ['kapr|kapra|kapri|carp'], [[SR, 'Fish, carp, raw']]],
  ['mackerel', 'Makrela', ['makrel\\w*|mackerel'], [[SR, 'Fish, mackerel, Atlantic, raw']]],
  ['herring', 'Sleď', ['sled|sledi|sledu|herring'], [[SR, 'Fish, herring, Atlantic, raw']]],
  ['sardines', 'Sardinky v oleji', ['sardin\\w*|sardines?'], [[SR, 'Fish, sardine, Atlantic, canned in oil, drained solids with bone']], { allow: 'v|ve|in|olej\\w*|oil|konzerv\\w*|canned' }],
  ['tilapia', 'Tilápie', ['tilapi\\w*'], [[SR, 'Fish, tilapia, raw']]],
  ['shrimp', 'Krevety', ['krevet\\w*|shrimps?|prawns?'], [[SR, 'Crustaceans, shrimp, raw']]],
  ['mussels', 'Slávky', ['slavk\\w*|musle|mussels?'], [[SR, 'Mollusks, mussel, blue, raw']]],
  // Eggs
  ['egg', 'Vejce', ['vejce|vajicko|vajicka|eggs?'], [[SR, 'Egg, whole, raw, fresh']], { not: 'bilk\\w*|bile|white|zloutk\\w*|yolk\\w*|nudle|testovin\\w*|noodle\\w*|pasta|liker|majonez\\w*|mayo\\w*|cokolad\\w*|kinder' }],
  ['egg_white', 'Vaječné bílky', ['vajecn\\w*|egg|bilk\\w*', 'bilk\\w*|bile|white\\w*'], [[SR, 'Egg, white, raw, fresh']]],
  ['egg_yolk', 'Vaječné žloutky', ['zloutk\\w*|yolk\\w*'], [[SR, 'Egg, yolk, raw, fresh']]],
  // Dairy (milk from CoFID: US milk has added vitamins A and D)
  ['milk', 'Mléko', ['mleko|milk'], [[COFID, 'Milk, whole, pasteurised, average'], [COFID, 'Milk, semi-skimmed, pasteurised, average'], [COFID, 'Milk, skimmed, pasteurised, average']], { liquid: true, not: PLANT_MILK + '|cokolad\\w*|chocolate|kav\\w*|coffee|latte|kakao|cocoa|banan\\w*|jahod\\w*' }],
  ['yogurt', 'Bílý jogurt', ['jogurt\\w*|yogh?urt\\w*', 'bil\\w*|natur\\w*|plain|klasick\\w*|smetanov\\w*|selsk\\w*'], [[SR, 'Yogurt, plain, whole milk'], [SR, 'Yogurt, plain, low fat'], [SR, 'Yogurt, plain, skim milk']], { allow: 'jogurt\\w*|yog\\w*', not: 'reck\\w*|greek|skyr|ovoc\\w*|fruit|jahod\\w*|boruvk\\w*|malin\\w*|broskv\\w*|meruňk\\w*|merunk\\w*|visn\\w*|tresn\\w*|kokos\\w*|coconut|stracciatell\\w*|lesni|napoj\\w*|drink\\w*|kozi|goat|ovci|sheep' }],
  ['greek_yogurt', 'Řecký jogurt', ['jogurt\\w*|yogh?urt\\w*|skyr', 'reck\\w*|greek|skyr|islandsk\\w*'], [[SR, 'Yogurt, Greek, plain, whole milk'], [SR, 'Yogurt, Greek, plain, lowfat'], [SR, 'Yogurt, Greek, plain, nonfat']], { allow: 'jogurt\\w*|yog\\w*', not: 'ovoc\\w*|fruit|jahod\\w*|boruvk\\w*|malin\\w*|broskv\\w*|merunk\\w*|visn\\w*|kokos\\w*|coconut|stracciatell\\w*|med|honey|vanil\\w*|napoj\\w*|drink\\w*' }],
  ['cottage', 'Cottage sýr', ['cottage'], [[SR, 'Cheese, cottage, creamed, large or small curd'], [SR, 'Cheese, cottage, lowfat, 2% milkfat']], { not: 'pazit\\w*|chive\\w*|bylink\\w*|herb\\w*|ananas|pineapple|ovoc\\w*|fruit' }],
  ['quark', 'Tvaroh', ['tvaroh|tvarohu|quark'], [[COFID, 'Cheese, quark'], [COFID, 'Fromage frais, virtually fat free, natural']], { not: 'tvarohov\\w*|ovoc\\w*|fruit|vanil\\w*|jahod\\w*|meruňk\\w*|merunk\\w*|kakao|cokolad\\w*|termix|dezert\\w*|pomazank\\w*|knedl\\w*|buchtick\\w*' }],
  ['edam', 'Eidam', ['eidam\\w*|edam\\w*'], [[SR, 'Cheese, edam']]],
  ['gouda', 'Gouda', ['gouda'], [[SR, 'Cheese, gouda']]],
  ['emmental', 'Ementál', ['emental\\w*|emmental\\w*|swiss|ementaler\\w*'], [[SR, 'Cheese, swiss']]],
  ['cheddar', 'Čedar', ['cedar\\w*|cheddar\\w*'], [[SR, 'Cheese, cheddar']]],
  ['mozzarella', 'Mozzarella', ['mozzarell\\w*|mozarell\\w*'], [[SR, 'Cheese, mozzarella, whole milk'], [SR, 'Cheese, mozzarella, low moisture, part-skim']], { not: 'pizz\\w*|stick\\w*|tycink\\w*' }],
  ['parmesan', 'Parmazán', ['parmazan\\w*|parmesan\\w*|parmigian\\w*|grana|padano'], [[SR, 'Cheese, parmesan, hard']]],
  ['feta', 'Balkánský sýr / feta', ['feta|balkansk\\w*|salatov\\w*'], [[SR, 'Cheese, feta']], { allow: 'salat\\w*' }],
  ['brie', 'Hermelín / brie', ['hermelin\\w*|brie|camembert\\w*|camembert'], [[SR, 'Cheese, brie'], [SR, 'Cheese, camembert']], { not: 'nakladan\\w*|pecen\\w*' }],
  ['ricotta', 'Ricotta', ['ricott\\w*'], [[SR, 'Cheese, ricotta, whole milk']]],
  ['butter', 'Máslo', ['maslo|masla|butter'], [[SR, 'Butter, without salt'], [SR, 'Butter, salted']], { not: 'arasid\\w*|peanut\\w*|orech\\w*|nut\\w*|kakao\\w*|cocoa|bylink\\w*|herb\\w*|cesnek\\w*|garlic|rostlin\\w*|bambuck\\w*|pecivo|cookies?|susenk\\w*|margarin\\w*|shea|bodybutter' }],
  ['cream_whipping', 'Smetana ke šlehání', ['smetan\\w*|cream|sahne', 'sleh\\w*|whipping|heavy|double|31|33|35|36|40'], [[SR, 'Cream, fluid, heavy whipping']], { allow: 'cream|krem', not: 'rostlin\\w*|sprej|spray|ztuzovac\\w*|sour|zakys\\w*' }],
  ['sour_cream', 'Zakysaná smetana', ['zakysan\\w*|sour'], [[SR, 'Cream, sour, cultured']], { allow: 'cream|kysan\\w*', not: 'onion|cibul\\w*|chips|dip' }],
  // Fruit
  ['apple', 'Jablka', ['jablko|jablka|jablek|apples?'], [[SR, 'Apples, raw, with skin']], { not: 'granat\\w*|pomegranate|pine\\w*|custard|rosti\\w*' }],
  ['banana', 'Banány', ['banan|banany|bananu|bananas?'], [[SR, 'Bananas, raw']]],
  ['orange', 'Pomeranče', ['pomeranc|pomerance|pomerancu|oranges?'], [[SR, 'Oranges, raw, all commercial varieties']]],
  ['mandarin', 'Mandarinky', ['mandarink\\w*|klementin\\w*|clementines?|mandarins?|tangerines?'], [[SR, 'Tangerines, (mandarin oranges), raw']]],
  ['pear', 'Hrušky', ['hruska|hrusky|hrusek|pears?'], [[SR, 'Pears, raw']], { not: 'avocado\\w*|prickly' }],
  ['grapes', 'Hroznové víno', ['hrozn\\w*|grapes?'], [[SR, 'Grapes, red or green (European type, such as Thompson seedless), raw']], { not: 'grapefruit\\w*|rozink\\w*|raisin\\w*|ocet|vinegar' }],
  ['strawberries', 'Jahody', ['jahody|jahod|strawberr\\w*'], [[SR, 'Strawberries, raw']]],
  ['blueberries', 'Borůvky', ['boruvk\\w*|blueberr\\w*'], [[SR, 'Blueberries, raw']]],
  ['raspberries', 'Maliny', ['maliny|malin|raspberr\\w*'], [[SR, 'Raspberries, raw']]],
  ['cherries', 'Třešně', ['tresne|tresni|cherries|cherry'], [[SR, 'Cherries, sweet, raw']], { not: 'rajc\\w*|tomat\\w*|cherry tomat\\w*' }],
  ['sour_cherries', 'Višně', ['visne|visni'], [[SR, 'Cherries, sour, red, raw']]],
  ['plums', 'Švestky', ['svestk\\w*|slivk\\w*|plums?'], [[SR, 'Plums, raw']]],
  ['apricots', 'Meruňky', ['merunk\\w*|apricots?'], [[SR, 'Apricots, raw']]],
  ['peaches', 'Broskve', ['broskev|broskve|broskvi|peach\\w*'], [[SR, 'Peaches, yellow, raw']]],
  ['nectarines', 'Nektarinky', ['nektarink\\w*|nectarines?'], [[SR, 'Nectarines, raw']]],
  ['kiwi', 'Kiwi', ['kiwi'], [[SR, 'Kiwifruit, green, raw']]],
  ['pineapple', 'Ananas', ['ananas|pineapples?'], [[SR, 'Pineapple, raw, all varieties']]],
  ['mango', 'Mango', ['mango|manga|mangos|mangoes'], [[SR, 'Mangos, raw']]],
  ['watermelon', 'Meloun vodní', ['vodni|watermelons?', 'meloun\\w*|watermelons?'], [[SR, 'Watermelon, raw']]],
  ['melon', 'Meloun cukrový', ['meloun\\w*|melons?|cantaloupe\\w*|galia|honeydew'], [[SR, 'Melons, cantaloupe, raw'], [SR, 'Melons, honeydew, raw']], { not: 'vodni|watermelon\\w*' }],
  ['lemon', 'Citrony', ['citron|citrony|citronu|lemons?'], [[SR, 'Lemons, raw, without peel']], { not: 'tráva|trava|grass|stav\\w*|juice' }],
  ['lime', 'Limetky', ['limetk\\w*|limes?'], [[SR, 'Limes, raw']]],
  ['grapefruit', 'Grapefruit', ['grapefruit\\w*|grepfruit\\w*|grep'], [[SR, 'Grapefruit, raw, pink and red, all areas'], [SR, 'Grapefruit, raw, white, all areas']]],
  ['avocado', 'Avokádo', ['avokad\\w*|avocados?'], [[SR, 'Avocados, raw, all commercial varieties']], { not: 'guacamole' }],
  ['redcurrant', 'Rybíz červený', ['rybiz\\w*|currants?', 'cerven\\w*|bil\\w*|red|white'], [[SR, 'Currants, red and white, raw']]],
  ['blackcurrant', 'Rybíz černý', ['rybiz\\w*|currants?', 'cern\\w*|black'], [[SR, 'Currants, european black, raw']]],
  ['figs', 'Fíky', ['fiky|fik|figs?'], [[SR, 'Figs, raw']]],
  ['pomegranate', 'Granátové jablko', ['granatov\\w*|pomegranates?'], [[SR, 'Pomegranates, raw']]],
  ['prunes', 'Sušené švestky', ['svestk\\w*|prunes?|plums?', 'susen\\w*|dried|prunes?'], [[SR, 'Plums, dried (prunes), uncooked']], { allow: 'susen\\w*|dried' }],
  ['raisins', 'Rozinky', ['rozink\\w*|raisins?'], [[SR, 'Raisins, dark, seedless']]],
  ['dates', 'Datle', ['datle|datli|dates?'], [[SR, 'Dates, medjool'], [SR, 'Dates, deglet noor']], { allow: 'susen\\w*|dried' }],
  ['dried_apricots', 'Sušené meruňky', ['merunk\\w*|apricots?', 'susen\\w*|dried'], [[SR, 'Apricots, dried, sulfured, uncooked']], { allow: 'susen\\w*|dried' }],
  // Vegetables
  ['carrot', 'Mrkev', ['mrkev|mrkve|carrots?'], [[SR, 'Carrots, raw']]],
  ['potato', 'Brambory', ['brambor|brambory|potato|potatoes'], [[SR, 'Potatoes, flesh and skin, raw'], [SR, 'Potatoes, white, flesh and skin, raw']], { not: 'sladk\\w*|sweet|batat\\w*|knedl\\w*|testo|dough|kase|mash\\w*|chips|lupin\\w*|hranol\\w*|krokety|plack\\w*|gnocchi|noky|skrob\\w*|starch|flakes|vlocky|vločky' }],
  ['sweet_potato', 'Batáty', ['batat\\w*|sweet potato\\w*|sladk\\w* brambor\\w*'], [[SR, 'Sweet potato, raw, unprepared']], { allow: 'sladk\\w*' }],
  ['tomato', 'Rajčata', ['rajcat\\w*|rajce|tomato|tomatoes'], [[SR, 'Tomatoes, red, ripe, raw, year round average']], { not: 'protlak\\w*|pyre|puree|paste|kecup\\w*|ketchup|passat\\w*|drcen\\w*|loupan\\w*|krajen\\w*|susen\\w*|dried|stav\\w*|juice' }],
  ['cucumber', 'Okurky', ['okurk\\w*|okurek|cucumbers?'], [[SR, 'Cucumber, with peel, raw']], { not: 'kyselo\\w*|sterilov\\w*|nakladan\\w*|cornichon\\w*|pickle\\w*|chlazen' }],
  ['pepper_red', 'Paprika červená', ['paprik\\w*|peppers?', 'cerven\\w*|red'], [[SR, 'Peppers, sweet, red, raw']], { not: 'mlet\\w*|ground|chili\\w*|chilli\\w*|udl\\w*|smoked|plnen\\w*|kapi\\w*|sterilov\\w*|pasta|pyre|lusk' }],
  ['pepper_yellow', 'Paprika žlutá', ['paprik\\w*|peppers?', 'zlut\\w*|yellow|orange|oranzov\\w*'], [[SR, 'Peppers, sweet, yellow, raw']], { not: 'mlet\\w*|ground|chili\\w*|chilli\\w*' }],
  ['pepper_green', 'Paprika zelená', ['paprik\\w*|peppers?', 'zelen\\w*|green|bil\\w*|beraní|berani|kapi\\w*'], [[SR, 'Peppers, sweet, green, raw']], { not: 'mlet\\w*|ground|chili\\w*|chilli\\w*|jalapen\\w*' }],
  ['onion', 'Cibule', ['cibul\\w*|onions?'], [[SR, 'Onions, raw']], { not: 'jarn\\w*|spring|green|pazitk\\w*|smazen\\w*|fried|krouzk\\w*|rings?|susen\\w*' }],
  ['spring_onion', 'Jarní cibulka', ['jarn\\w*|spring|green', 'cibul\\w*|onions?'], [[SR, 'Onions, spring or scallions (includes tops and bulb), raw']]],
  ['garlic', 'Česnek', ['cesnek|cesneku|garlic'], [[SR, 'Garlic, raw']], { not: 'medvid\\w*|wild|bear\\w*|granul\\w*|susen\\w*|pasta|paste|olej\\w*|oil|lisovan\\w*' }],
  ['broccoli', 'Brokolice', ['brokolic\\w*|broccoli'], [[SR, 'Broccoli, raw']]],
  ['cauliflower', 'Květák', ['kvetak\\w*|cauliflower\\w*'], [[SR, 'Cauliflower, raw']]],
  ['cabbage', 'Zelí', ['zeli|cabbage', 'bil\\w*|hlavkov\\w*|white|green|cabbage|zeli'], [[SR, 'Cabbage, raw']], { not: 'cerven\\w*|red|kysan\\w*|sauerkraut|cinsk\\w*|chinese|peking\\w*|savoy|kapust\\w*' }],
  ['red_cabbage', 'Červené zelí', ['cerven\\w*|red', 'zeli|cabbage'], [[SR, 'Cabbage, red, raw']], { not: 'kysan\\w*|sauerkraut|sterilov\\w*' }],
  ['savoy', 'Kapusta', ['kapust\\w*|savoy'], [[SR, 'Cabbage, savoy, raw']], { not: 'kadern\\w*|kale|rusk\\w*' }],
  ['chinese_cabbage', 'Pekingské zelí', ['peking\\w*|cinsk\\w*|chinese|napa', 'zeli|cabbage'], [[SR, 'Cabbage, chinese (pe-tsai), raw']]],
  ['kale', 'Kadeřávek', ['kaderav\\w*|kale|kadern\\w*'], [[SR, 'Kale, raw']], { not: 'chips|chipsy' }],
  ['spinach', 'Špenát', ['spenat\\w*|spinach'], [[SR, 'Spinach, raw']], { not: 'pyre|puree|protlak\\w*|listy v smetane|creamed|knedl\\w*|testovin\\w*|pasta|tortil\\w*|wrap' }],
  ['lettuce_iceberg', 'Ledový salát', ['ledov\\w*|iceberg', 'salat\\w*|lettuce'], [[SR, 'Lettuce, iceberg (includes crisphead types), raw']], { allow: 'salat\\w*' }],
  ['lettuce', 'Hlávkový salát', ['hlavkov\\w*|lettuce|lollo|dubov\\w*|polnick\\w*|lamb s lettuce|romain\\w*|cos'], [[SR, 'Lettuce, green leaf, raw'], [SR, 'Lettuce, cos or romaine, raw']], { allow: 'salat\\w*' }],
  ['arugula', 'Rukola', ['rukol\\w*|rucol\\w*|arugula|rocket'], [[SR, 'Arugula, raw']], { allow: 'salat\\w*' }],
  ['zucchini', 'Cuketa', ['cuket\\w*|zucchin\\w*|courgett\\w*'], [[SR, 'Squash, summer, zucchini, includes skin, raw']]],
  ['pumpkin', 'Dýně', ['dyne|dyni|pumpkins?|hokkaido|butternut'], [[SR, 'Pumpkin, raw'], [SR, 'Squash, winter, butternut, raw']], { not: 'semin\\w*|seeds?|olej\\w*|oil|jadr\\w*|kernels?' }],
  ['eggplant', 'Lilek', ['lilek|lilku|baklazan\\w*|eggplants?|aubergines?'], [[SR, 'Eggplant, raw']]],
  ['mushrooms', 'Žampiony', ['zampion\\w*|mushrooms?|champignons?'], [[SR, 'Mushrooms, white, raw'], [SR, 'Mushrooms, brown, italian, or crimini, raw']], { not: 'shiitake|houby susen\\w*|krem\\w*|sterilov\\w*|krajen\\w* sterilov\\w*' }],
  ['celery', 'Řapíkatý celer', ['rapikat\\w*|stalks?|celery', 'celer\\w*|celery'], [[SR, 'Celery, raw']], { not: 'semin\\w*|salt|sul|koren\\w*|root|bulv\\w*' }],
  ['celeriac', 'Celer bulvový', ['celer|celeru|celeriac|bulvov\\w*'], [[SR, 'Celeriac, raw']], { not: 'rapikat\\w*|stalks?|celery|semin\\w*|salt|sul|nat' }],
  ['beetroot', 'Červená řepa', ['rep\\w*|beets?|beetroots?', 'cerven\\w*|red|beets?|beetroots?|salatov\\w*'], [[SR, 'Beets, raw']], { allow: 'salat\\w*', not: 'cukrov\\w*|sugar|steril\\w*|kysel\\w*|pickled|stav\\w*|juice|varen\\w*|cooked' }],
  ['radish', 'Ředkvičky', ['redkvick\\w*|redkev|redkve|radish\\w*'], [[SR, 'Radishes, raw']]],
  ['kohlrabi', 'Kedluben', ['kedlub\\w*|kohlrabi'], [[SR, 'Kohlrabi, raw']]],
  ['leek', 'Pórek', ['porek|porku|leeks?'], [[SR, 'Leeks, (bulb and lower leaf-portion), raw']]],
  ['green_beans', 'Zelené fazolky', ['fazolk\\w*|green beans?|snap beans?|string beans?'], [[SR, 'Beans, snap, green, raw']], { not: 'steril\\w*|kysel\\w*' }],
  ['peas', 'Hrášek', ['hrasek|hrachu|hrach|peas?', 'zelen\\w*|green|hrasek|mrazen\\w*|frozen|sladk\\w*|garden'], [[SR, 'Peas, green, raw']], { allow: 'sladk\\w*', not: 'loupan\\w*|split|pulen\\w*|cizrn\\w*|chick\\w*|steril\\w*|protein' }],
  ['corn', 'Kukuřice cukrová', ['kukuric\\w*|corn|maize', 'cukrov\\w*|sweet|klas\\w*|cob|zrn\\w*|kernels?'], [[SR, 'Corn, sweet, yellow, raw']], { allow: 'sladk\\w*|sugar|cukr\\w*', not: 'popcorn|lupin\\w*|chips|flakes|lupink\\w*|mouk\\w*|flour|meal|krupic\\w*|syrup|sirup\\w*|steril\\w*' }],
  ['asparagus', 'Chřest', ['chrest\\w*|asparagus'], [[SR, 'Asparagus, raw']], { not: 'steril\\w*' }],
  ['brussels', 'Růžičková kapusta', ['ruzick\\w*|brussels?', 'kapust\\w*|sprouts?'], [[SR, 'Brussels sprouts, raw']]],
  ['parsnip', 'Pastinák', ['pastinak\\w*|parsnips?'], [[SR, 'Parsnips, raw']]],
  ['parsley_root', 'Petržel kořenová', ['petrzel\\w*|parsley', 'koren\\w*|root|bulv\\w*'], [[SR, 'Parsnips, raw']], { allow: 'koren\\w*' }],
  ['parsley', 'Petrželová nať', ['petrzel\\w*|parsley'], [[SR, 'Parsley, fresh']], { not: 'koren\\w*|root|susen\\w*|dried|bulv\\w*' }],
  // Legumes (dry, and boiled for canned or cooked ones)
  ['lentils', 'Čočka', ['cock\\w*|lentils?'], [[SR, 'Lentils, raw'], [SR, 'Lentils, pink or red, raw'], [SR, 'Lentils, mature seeds, cooked, boiled, without salt']], { allow: 'steril\\w*|konzerv\\w*|canned|varen\\w*|cooked|nalev\\w*|brine|v|ve|in|cerven\\w*|red', not: 'chips|cestovin\\w*|testovin\\w*|pasta|mouk\\w*|flour|polevk\\w*|soup|salat\\w*|klicky|sprouts?' }],
  ['chickpeas', 'Cizrna', ['cizrn\\w*|chickpeas?|garbanzo\\w*'], [[SR, 'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw'], [SR, 'Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt']], { allow: 'steril\\w*|konzerv\\w*|canned|varen\\w*|cooked|nalev\\w*|brine|v|ve|in', not: 'chips|cestovin\\w*|testovin\\w*|pasta|mouk\\w*|flour|hummus|humus|pomazank\\w*' }],
  ['beans_red', 'Fazole červené', ['fazol\\w*|beans?', 'cerven\\w*|red|kidney|ledvin\\w*'], [[SR, 'Beans, kidney, red, mature seeds, raw'], [SR, 'Beans, kidney, red, mature seeds, cooked, boiled, without salt']], { allow: 'steril\\w*|konzerv\\w*|canned|varen\\w*|cooked|nalev\\w*|brine|v|ve|in', not: 'chili|chilli|tomat\\w*|rajc\\w*|baked|zapecen\\w*|fazolk\\w*' }],
  ['beans_white', 'Fazole bílé', ['fazol\\w*|beans?', 'bil\\w*|white|navy|cannellini|great northern'], [[SR, 'Beans, white, mature seeds, raw'], [SR, 'Beans, white, mature seeds, cooked, boiled, without salt']], { allow: 'steril\\w*|konzerv\\w*|canned|varen\\w*|cooked|nalev\\w*|brine|v|ve|in', not: 'tomat\\w*|rajc\\w*|baked|zapecen\\w*|fazolk\\w*' }],
  ['beans_black', 'Fazole černé', ['fazol\\w*|beans?', 'cern\\w*|black'], [[SR, 'Beans, black, mature seeds, raw']], { not: 'tomat\\w*|rajc\\w*|fazolk\\w*' }],
  ['split_peas', 'Hrách loupaný', ['hrach\\w*|peas?', 'loupan\\w*|pulen\\w*|split|zlut\\w*|yellow'], [[SR, 'Peas, green, split, mature seeds, raw']], { not: 'protein|mouk\\w*|flour' }],
  ['soybeans', 'Sójové boby', ['soj\\w*|soy\\w*', 'boby|bob|beans?|zrn\\w*'], [[SR, 'Soybeans, mature seeds, raw']], { not: 'omack\\w*|sauce|napoj\\w*|drink|mlek\\w*|milk|maso|kostky|granul\\w*|chunks?|klicky|sprouts?|edamame' }],
  ['mung', 'Mungo', ['mungo|mung'], [[SR, 'Mung beans, mature seeds, raw']], { not: 'klicky|sprouts?' }],
  // Grains
  ['rice_white', 'Rýže bílá', ['ryze|ryzi|rice', 'bil\\w*|white|basmati|jasmin\\w*|dlouhozrn\\w*|long|kulat\\w*|parboil\\w*|loupan\\w*|arborio|risott\\w*'], [[SR, 'Rice, white, long-grain, regular, raw, unenriched'], [SR, 'Rice, white, medium-grain, raw, unenriched']], { not: 'natural\\w*|brown|hned\\w*|celozrn\\w*|wild|divok\\w*|cerv\\w*|black|cern\\w*|nudle|noodles?|chleb\\w*|chlebic\\w*|cakes?|wafer\\w*|oplatk\\w*|mouk\\w*|flour|napoj\\w*|drink|mlek\\w*|milk|puding\\w*|kase|varen\\w*|cooked|sacky|bags?|instant|ryzovar|plnen\\w*' }],
  ['rice_brown', 'Rýže natural', ['ryze|ryzi|rice', 'natural\\w*|brown|hned\\w*|celozrn\\w*|whole'], [[SR, 'Rice, brown, long-grain, raw'], [SR, 'Rice, brown, medium-grain, raw']], { not: 'chleb\\w*|chlebic\\w*|cakes?|wafer\\w*|oplatk\\w*|mouk\\w*|flour|napoj\\w*|drink|mlek\\w*|milk|varen\\w*|cooked' }],
  ['oats', 'Ovesné vločky', ['oves\\w*|ovsen\\w*|oats?|oatmeal|porridge', 'vlock\\w*|flakes|rolled|oats|oatmeal|jumbo|porridge'], [[SR, 'Cereals, oats, regular and quick, not fortified, dry']], { not: 'napoj\\w*|drink|mlek\\w*|milk|susenk\\w*|cookies?|tycink\\w*|bar|cokol\\w*|ovoc\\w*|fruit|jablk\\w*|boruvk\\w*|jahod\\w*|med|honey|kakao|protein|krem|kase s|granola|musli|muesli|otruby|bran' }],
  ['flour_white', 'Mouka pšeničná', ['mouk\\w*|flour', 'psenic\\w*|wheat|hladk\\w*|polohrub\\w*|hrub\\w*|vyberov\\w*|all purpose|plain|chlebov\\w*|00'], [[SR, 'Wheat flour, white, all-purpose, unenriched']], { allow: 'mouk\\w*', not: 'celozrn\\w*|whole\\w*|grahamov\\w*|zitn\\w*|rye|spald\\w*|spelt|kukur\\w*|corn|ryz\\w*|rice|pohank\\w*|buckwheat|bezlep\\w*|gluten|kokos\\w*|mandl\\w*|almond|cizrn\\w*|chick\\w*|smes\\w*|mix|palacink\\w*|pancake\\w*|kypric\\w*|self raising|self rising|wholemeal' }],
  ['flour_whole', 'Mouka celozrnná', ['mouk\\w*|flour', 'celozrn\\w*|whole\\w*|grahamov\\w*|wholemeal'], [[SR, 'Wheat flour, whole-grain']], { allow: 'mouk\\w*', not: 'zitn\\w*|rye|spald\\w*|spelt|kukur\\w*|corn|ryz\\w*|rice|pohank\\w*|buckwheat|oves\\w*|oat' }],
  ['flour_rye', 'Mouka žitná', ['mouk\\w*|flour', 'zitn\\w*|rye'], [[SR, 'Rye flour, medium'], [SR, 'Rye flour, dark'], [SR, 'Rye flour, light']], { allow: 'mouk\\w*', not: 'kvas\\w*|sourdough' }],
  ['flour_spelt', 'Mouka špaldová', ['spald\\w*|spelt', 'mouk\\w*|flour'], [[SR, 'Spelt, uncooked']], { allow: 'mouk\\w*' }],
  ['buckwheat', 'Pohanka', ['pohank\\w*|buckwheat'], [[SR, 'Buckwheat groats, roasted, dry'], [SR, 'Buckwheat']], { allow: 'prazen\\w*|roast\\w*|loupan\\w*', not: 'mouk\\w*|flour|nudle|noodles?|testovin\\w*|pasta|chleb\\w*|lupink\\w*|vlock\\w*|flakes|kase s|musli|tycink\\w*' }],
  ['millet', 'Jáhly', ['jahl\\w*|millet'], [[SR, 'Millet, raw']], { not: 'vlock\\w*|flakes|kase s|mouk\\w*|flour' }],
  ['quinoa', 'Quinoa', ['quinoa|quinoi|kinoa|kinoy'], [[SR, 'Quinoa, uncooked']], { not: 'vlock\\w*|flakes|pufovan\\w*|puffed|chleb\\w*|testovin\\w*|pasta|mouk\\w*' }],
  ['couscous', 'Kuskus', ['kuskus\\w*|couscous'], [[SR, 'Couscous, dry']], { not: 'celozrn\\w*|whole\\w*|perl\\w*' }],
  ['bulgur', 'Bulgur', ['bulgur\\w*|bulghur'], [[SR, 'Bulgur, dry']]],
  ['barley', 'Kroupy', ['kroup\\w*|pearl\\w* barley|barley'], [[SR, 'Barley, pearled, raw']], { not: 'vlock\\w*|flakes|mouk\\w*|flour|malt\\w*|slad\\w*|kava|coffee|caj|tea' }],
  ['pasta', 'Těstoviny', ['testovin\\w*|spaget\\w*|spaghetti|penne|fusilli|kolinka|vretena|tagliatell\\w*|farfalle|macaroni|pasta|nudle|fleky'], [[SR, 'Pasta, dry, unenriched']], { not: 'celozrn\\w*|whole\\w*|wholemeal|spald\\w*|spelt|vajecn\\w*|egg\\w*|bezlep\\w*|gluten|kukur\\w*|corn|ryz\\w*|rice|cock\\w*|lentil\\w*|cizrn\\w*|chick\\w*|hrach\\w*|pea|fazol\\w*|bean\\w*|plnen\\w*|filled|tortellin\\w*|ravioli|gnocchi|cerstv\\w*|fresh|sauce|omack\\w*|carbonar\\w*|bolognes\\w*|lasagn\\w*|instant|cup|polevk\\w*|soup|salat\\w*|chlazen\\w*|ramen|udon|soba|konjac|konjak|shirataki' }],
  ['pasta_whole', 'Těstoviny celozrnné', ['testovin\\w*|spaget\\w*|spaghetti|penne|fusilli|pasta', 'celozrn\\w*|whole\\w*|wholemeal|integral\\w*'], [[SR, 'Pasta, whole-wheat, dry (Includes foods for USDA\'s Food Distribution Program)']], { not: 'spald\\w*|spelt|bezlep\\w*|gluten|plnen\\w*|filled' }],
  ['semolina', 'Krupice', ['krupic\\w*|semolina'], [[SR, 'Semolina, unenriched']], { not: 'kase\\w*|puding\\w*|kukur\\w*|corn|ryz\\w*|rice|cokol\\w*|kakao' }],
  ['polenta', 'Polenta', ['polent\\w*|cornmeal|kukuricn\\w* krupic\\w*'], [[SR, 'Cornmeal, degermed, unenriched, yellow']], { not: 'hotov\\w*|instant' }],
  // Bread (European tables: US and UK white flour is fortified)
  ['bread_rye', 'Chléb žitnopšeničný', ['chleb\\w*|bread', 'zitn\\w*|rye|konzumn\\w*|kmin\\w*|sumav\\w*|selsk\\w*|kvas\\w*|sourdough|mix|pecnik|cesk\\w*|psenicnozitn\\w*|zitnopsenicn\\w*'], [['ciqual', 'Rye and wheat bread']], { allow: 'mix|pecen\\w*', not: 'toast\\w*|tostov\\w*|celozrn\\w*|whole\\w*|tmav\\w*|vícezrn\\w*|vicezrn\\w*|semin\\w*|seeds?|bezlep\\w*|gluten|knackebrot|krehk\\w*|crisp\\w*|chlebic\\w*|krutony|strouh\\w*|crumbs?|sendvic\\w*|sandwich\\w*|pomazank\\w*|chlebovk\\w*|tortill\\w*|pita|naan|bagel\\w*|brioch\\w*|sladk\\w*|dyn\\w*|slunecn\\w*|chia|len\\w*|ovesn\\w*|spald\\w*|kukur\\w*|mrkv\\w*|brambor\\w*' }],
  ['bread_rye_dark', 'Chléb žitný celozrnný', ['chleb\\w*|bread', 'zitn\\w*|rye', 'celozrn\\w*|whole\\w*|tmav\\w*|dark|pumpernickel|100'], [['ciqual', 'Rye bread, whole grain, prepacked']], { allow: 'pecen\\w*', not: 'toast\\w*|semin\\w*|seeds?|knackebrot|krehk\\w*|crisp\\w*|chlebic\\w*' }],
  ['bread_white', 'Rohlík / bílé pečivo', ['rohlik\\w*|bulk\\w*|bageta|bagety|baguett\\w*|veka|vek\\w*|kaiserk\\w*|houska|housk\\w*|white bread|bily chleb'], [['ciqual', 'Bread, French bread, baguette']], { allow: 'pecen\\w*|pecivo', not: 'celozrn\\w*|whole\\w*|grahamov\\w*|vicezrn\\w*|semin\\w*|seeds?|sladk\\w*|maslov\\w*|butter|plnen\\w*|filled|sunk\\w*|syr\\w*|cheese|cesnek\\w*|garlic|bylink\\w*|herb\\w*|sendvic\\w*|sandwich\\w*|hot dog|hotdog|parek|bezlep\\w*|gluten|chips|krutony|strouh\\w*|crumbs?|tvaroh\\w*|mak\\w*|jablk\\w*|ovoc\\w*|cokol\\w*|kakao|pizza|tortill\\w*|sojov\\w*|sypan\\w*|sol\\w*|kmin\\w*|spald\\w*|zitn\\w*|rye|kukur\\w*' }],
  ['bread_whole', 'Chléb celozrnný pšeničný', ['chleb\\w*|bread|rohlik\\w*|bulk\\w*|housk\\w*|bageta', 'celozrn\\w*|whole\\w*|wholemeal|grahamov\\w*'], [[SR, 'Bread, whole-wheat, commercially prepared']], { allow: 'pecen\\w*|pecivo', not: 'zitn\\w*|rye|toast\\w*|tostov\\w*|semin\\w*|seeds?|spald\\w*|spelt|sladk\\w*|krehk\\w*|crisp\\w*|chlebic\\w*|knackebrot|tortill\\w*|pita|wrap\\w*|bezlep\\w*|gluten' }],
  // Nuts and seeds (roasted unsalted nuts are close enough)
  ['almonds', 'Mandle', ['mandle|mandli|almonds?'], [[SR, 'Nuts, almonds'], [SR, 'Nuts, almonds, dry roasted, without salt added']], { allow: 'prazen\\w*|roast\\w*|loupan\\w*|blanch\\w*|platk\\w*|plátky|platky|sliced|mlet\\w*|ground|natural\\w*', not: 'napoj\\w*|drink|mlek\\w*|milk|maslo|butter|mouk\\w*|flour|cokol\\w*|cokolad\\w*|chocolate|jogurt\\w*|yog\\w*|med\\w*|honey|soln\\w*|salted|uzen\\w*|smoked|tamari|chili|bbq|wasabi|marcipan\\w*|marzipan|krem\\w*|pasta|paste|sirup\\w*|olej\\w*|oil|mix|smes\\w*|karamel\\w*|caramel|skorice|cinnamon|kakao|cocoa' }],
  ['walnuts', 'Vlašské ořechy', ['vlass\\w*|walnuts?', 'orech\\w*|jadr\\w*|kernels?|walnuts?|halves|pulky'], [[SR, 'Nuts, walnuts, english']], { not: 'cokol\\w*|chocolate|med\\w*|honey|karamel\\w*|caramel|olej\\w*|oil|mix|smes\\w*' }],
  ['hazelnuts', 'Lískové ořechy', ['lisk\\w*|hazelnuts?|filberts?|liskovk\\w*'], [[SR, 'Nuts, hazelnuts or filberts']], { allow: 'prazen\\w*|roast\\w*|loupan\\w*|blanch\\w*|mlet\\w*|ground', not: 'cokol\\w*|chocolate|nugat\\w*|nougat|krem\\w*|cream|pomazank\\w*|spread|napoj\\w*|drink|mlek\\w*|milk|caj\\w*|kava|coffee|sirup\\w*|syrup|olej\\w*|oil|wafer\\w*|oplatk\\w*|mix|smes\\w*|karamel\\w*|med\\w*|honey|aroma' }],
  ['cashews', 'Kešu ořechy', ['kesu|cashews?'], [[SR, 'Nuts, cashew nuts, raw'], [SR, 'Nuts, cashew nuts, dry roasted, without salt added']], { allow: 'prazen\\w*|roast\\w*|natural\\w*|cele|whole|pulky|halves', not: 'soln\\w*|salted|chili|curry|wasabi|med\\w*|honey|cokol\\w*|chocolate|maslo|butter|krem\\w*|pasta|paste|napoj\\w*|drink|mlek\\w*|milk|mix|smes\\w*|karamel\\w*|bbq|pepr\\w*|pepper|sweet' }],
  ['peanuts', 'Arašídy', ['arasid\\w*|burske|buraky|peanuts?'], [[SR, 'Peanuts, all types, raw'], [SR, 'Peanuts, all types, dry-roasted, without salt']], { allow: 'prazen\\w*|roast\\w*|loupan\\w*|natural\\w*|blanch\\w*|neloupan\\w*|in shell|ve skoapce', not: 'maslo|butter|krem\\w*|pasta|paste|spread|soln\\w*|salted|cokol\\w*|chocolate|chili|med\\w*|honey|obal\\w*|coated|krupav\\w*|crunchy|olej\\w*|oil|wasabi|bbq|pikant\\w*|karamel\\w*|tycink\\w*|bar|flips|krekr\\w*|cracker\\w*|mix|smes\\w*|sweet|ochucen\\w*|kokos\\w*|cesnek\\w*|cibul\\w*|paprik\\w*' }],
  ['peanut_butter', 'Arašídové máslo', ['arasid\\w*|burske|peanuts?', 'maslo|butter|krem\\w*|pasta|paste'], [[SR, 'Peanut butter, smooth style, without salt'], [SR, 'Peanut butter, chunk style, without salt']], { allow: 'krem\\w*|cream\\w*|spread|prazen\\w*|roast\\w*|jemn\\w*|smooth|crunchy|kousk\\w*|chunk\\w*|natural\\w*|100', not: 'cokol\\w*|chocolate|med\\w*|honey|kakao|cocoa|protein|powder|prasek|karamel\\w*|sladk\\w*|sweet\\w*|slaz\\w*|jahod\\w*|kokos\\w*|light|lite|reduced|tycink\\w*|bar|susenk\\w*|cookies?|flips|wafer\\w*|oplatk\\w*' }],
  ['pistachios', 'Pistácie', ['pistac\\w*|pistachios?'], [[SR, 'Nuts, pistachio nuts, raw'], [SR, 'Nuts, pistachio nuts, dry roasted, without salt added']], { allow: 'prazen\\w*|roast\\w*|loupan\\w*|neloupan\\w*|natural\\w*|jadr\\w*|kernels?|in shell', not: 'soln\\w*|salted|krem\\w*|cream|pasta|paste|spread|cokol\\w*|chocolate|zmrzlin\\w*|ice|aroma|mix|smes\\w*|sweet' }],
  ['brazil', 'Para ořechy', ['para|brazil\\w*', 'orech\\w*|nuts?'], [[SR, 'Nuts, brazilnuts, dried, unblanched']], { allow: 'susen\\w*|dried', not: 'cokol\\w*|chocolate|mix|smes\\w*' }],
  ['macadamia', 'Makadamové ořechy', ['makadam\\w*|macadamia\\w*'], [[SR, 'Nuts, macadamia nuts, raw']], { allow: 'prazen\\w*|roast\\w*', not: 'soln\\w*|salted|cokol\\w*|chocolate|med\\w*|honey|mix|smes\\w*|susenk\\w*|cookies?|olej\\w*|oil' }],
  ['pecans', 'Pekanové ořechy', ['pekan\\w*|pecans?'], [[SR, 'Nuts, pecans']], { not: 'cokol\\w*|chocolate|karamel\\w*|caramel|med\\w*|honey|sirup\\w*|syrup|pie|mix|smes\\w*' }],
  ['sunflower_seeds', 'Slunečnicová semínka', ['slunecnic\\w*|sunflower', 'semin\\w*|semen\\w*|seeds?|jadr\\w*|kernels?|loupan\\w*'], [[SR, 'Seeds, sunflower seed kernels, dried'], [SR, 'Seeds, sunflower seed kernels, dry roasted, without salt']], { allow: 'prazen\\w*|roast\\w*|loupan\\w*|susen\\w*|dried', not: 'olej\\w*|oil|chleb\\w*|bread|pecivo|soln\\w*|salted|cokol\\w*|chocolate|maslo|butter|lecit\\w*|mix|smes\\w*' }],
  ['pumpkin_seeds', 'Dýňová semínka', ['dynov\\w*|dyne|pumpkin\\w*|pepit\\w*', 'semin\\w*|semen\\w*|seeds?|jadr\\w*|kernels?|pepit\\w*'], [[SR, 'Seeds, pumpkin and squash seed kernels, dried']], { allow: 'prazen\\w*|roast\\w*|loupan\\w*|susen\\w*|dried', not: 'olej\\w*|oil|chleb\\w*|bread|pecivo|soln\\w*|salted|cokol\\w*|chocolate|protein|mouk\\w*|flour|mix|smes\\w*' }],
  ['flax', 'Lněné semínko', ['lnen\\w*|flax\\w*|linseed\\w*'], [[SR, 'Seeds, flaxseed']], { allow: 'mlet\\w*|ground|zlat\\w*|golden|hned\\w*|brown', not: 'olej\\w*|oil|chleb\\w*|bread|pecivo|krekr\\w*|cracker\\w*|mix|smes\\w*|mouk\\w*|flour|vlakn\\w*|fiber|fibre' }],
  ['chia', 'Chia semínka', ['chia'], [[SR, 'Seeds, chia seeds, dried']], { allow: 'susen\\w*|dried|semin\\w*', not: 'puding\\w*|pudding|napoj\\w*|drink|tycink\\w*|bar|chleb\\w*|bread|pecivo|mouk\\w*|flour|jogurt\\w*|yog\\w*|mix|smes\\w*|olej\\w*|oil|kase' }],
  ['sesame', 'Sezam', ['sezam\\w*|sesame'], [[SR, 'Seeds, sesame seeds, whole, dried']], { allow: 'susen\\w*|dried|loupan\\w*|neloupan\\w*|bil\\w*|cern\\w*|hulled|prazen\\w*|roast\\w*', not: 'olej\\w*|oil|tahin\\w*|tahini|pasta|paste|chleb\\w*|bread|pecivo|tycink\\w*|bar|krekr\\w*|cracker\\w*|chalv\\w*|halva|mix|smes\\w*|med\\w*|honey|cokol\\w*' }],
  ['tahini', 'Tahini', ['tahin\\w*|tahini'], [[SR, 'Seeds, sesame butter, tahini, from raw and stone ground kernels'], [SR, 'Seeds, sesame butter, tahini, from roasted and toasted kernels (most common type)']], { allow: 'pasta|paste|krem\\w*|cream|prazen\\w*|roast\\w*|bil\\w*|cern\\w*|natural\\w*|100', not: 'cokol\\w*|chocolate|kakao|cocoa|med\\w*|honey|chalv\\w*|halva|sladk\\w*|sweet' }],
  ['hemp', 'Konopné semínko', ['konop\\w*|hemp', 'semin\\w*|semen\\w*|seeds?|loupan\\w*|hulled|hearts?'], [[SR, 'Seeds, hemp seed, hulled']], { allow: 'loupan\\w*', not: 'protein|olej\\w*|oil|mouk\\w*|flour|napoj\\w*|drink|mlek\\w*|milk|caj\\w*|tea|cbd|kosmet\\w*|cokol\\w*' }],
  ['poppy', 'Mák', ['mak|maku|poppy', 'mak|maku|modr\\w*|mlet\\w*|ground|semin\\w*|seeds?|cel\\w*|whole|poppy'], [[SR, 'Spices, poppy seed']], { allow: 'mlet\\w*|ground', not: 'nap\\w*|napln\\w*|filling|kolac\\w*|buchty|rohlik\\w*|housk\\w*|pecivo|cokol\\w*|zavin\\w*|strudl\\w*|bulk\\w*|makov\\w*|cukr\\w*|sugar|vanil\\w*|dort\\w*|kase|tvaroh\\w*|olej\\w*|oil|mix|smes\\w*' }],
  ['coconut', 'Strouhaný kokos', ['kokos\\w*|coconut', 'strouhan\\w*|desiccated|shredded|grated|chips|platk\\w*|flakes|susen\\w*|dried'], [[SR, 'Nuts, coconut meat, dried (desiccated), not sweetened']], { allow: 'susen\\w*|dried|chips|platk\\w*|flakes|strouhan\\w*', not: 'mlek\\w*|milk|napoj\\w*|drink|voda|water|olej\\w*|oil|tuk\\w*|fat|cokol\\w*|chocolate|tycink\\w*|bar|susenk\\w*|cookies?|sladk\\w*|sweet\\w*|slazen\\w*|prazen\\w*|toast\\w*|cukr\\w*|krem\\w*|cream|mouk\\w*|flour|jogurt\\w*|yog\\w*|chia' }],
  // Oils and fats
  ['olive_oil', 'Olivový olej', ['olivov\\w*|olive', 'olej\\w*|oil'], [[SR, 'Oil, olive, salad or cooking']], { not: 'olivy|olive s|pomace|sprej|spray|bylink\\w*|herb\\w*|cesnek\\w*|garlic|chili|lanyz\\w*|truffle|bazalk\\w*|basil|citron\\w*|lemon|aroma|mix|smes\\w*|tunak\\w*|tuna|sardin\\w*|makrel\\w*|losos\\w*|v|ve|in|majonez\\w*|mayo\\w*|dresink\\w*|dressing' }],
  ['sunflower_oil', 'Slunečnicový olej', ['slunecnic\\w*|sunflower', 'olej\\w*|oil'], [[SR, 'Oil, sunflower, linoleic, (approx. 65%)'], [SR, 'Oil, sunflower, high oleic (70% and over)']], { not: 'semin\\w*|seeds?|jadr\\w*|kernels?|sprej|spray|v|ve|in|mix|smes\\w*|tunak\\w*|sardin\\w*|makrel\\w*|majonez\\w*' }],
  ['rapeseed_oil', 'Řepkový olej', ['repkov\\w*|rapeseed|canola', 'olej\\w*|oil'], [[SR, 'Oil, canola']], { not: 'sprej|spray|v|ve|in|mix|smes\\w*|majonez\\w*' }],
  // Juices (liquids)
  ['orange_juice', 'Pomerančová šťáva 100 %', ['pomeranc\\w*|orange', 'dzus\\w*|stav\\w*|juice|100'], [[SR, 'Orange juice, raw']], { liquid: true, allow: 'dzus\\w*|juice', not: 'nektar\\w*|nectar|napoj\\w*|drink|sirup\\w*|syrup|limonad\\w*|lemonade|mrkev\\w*|carrot\\w*|mango|jablk\\w*|apple|ananas|pineapple|banan\\w*|multi\\w*|grep\\w*|grapefruit|aloe|smoothie|koncentrat\\w*|concentrate\\w*|sycen\\w*|sparkling|soda|zazvor\\w*|ginger|cerven\\w*|red|blood|krvav\\w*|light|zero|protein|vitamin\\w*' }],
  ['apple_juice', 'Jablečná šťáva 100 %', ['jablecn\\w*|jablk\\w*|apple', 'dzus\\w*|stav\\w*|juice|mosst|most|100'], [[SR, 'Apple juice, canned or bottled, unsweetened, without added ascorbic acid']], { liquid: true, allow: 'dzus\\w*|juice', not: 'nektar\\w*|nectar|napoj\\w*|drink|sirup\\w*|syrup|limonad\\w*|lemonade|mrkev\\w*|carrot\\w*|pomeranc\\w*|orange|hrusk\\w*|pear|jahod\\w*|malin\\w*|cerven\\w*|aronie|rybiz\\w*|banan\\w*|multi\\w*|ocet|vinegar|cider|cidre|sycen\\w*|sparkling|soda|koncentrat\\w*|concentrate\\w*|zazvor\\w*|ginger|smoothie|vitamin\\w*|aloe|mango' }],
];

const re = s => new RegExp(`\\b(?:${s})\\b`);
// Compiled entries: { id, cs, has: [RegExp], not, allow, refs: [[source, description]], liquid }
export const MATCHES = RAW.map(([id, cs, has, refs, o = {}]) => ({ id, cs, has: has.map(re), not: o.not ? re(o.not) : null,
  allow: o.allow ? re(o.allow) : null, refs, liquid: !!o.liquid }));

// Words of a name: folded, every run of letters and digits (one-letter words
// such as Czech "s" or "a" count, they join ingredients).
export const tokens = s => fold(s).match(/[a-z0-9]+/g) || [];

// Phrases that say nothing about processing: removed before the checks so their
// "a", "s" or "na" do not read as a second ingredient.
const NEUTRAL = /\b(bez (kosti|kuze|kuzi)( a (kosti|kuze|kuzi))?|s kuzi|s kosti|na kosti|typ [abc]|with skin|without skin|skin on|bone in|boneless|skinless|a kategorie|tr a|trida a)\b/g;

function excludedWord(w, entry) {
  if (entry.allow && entry.allow.test(w)) return false;
  return EXCLUDED_WORDS.includes(w) || EXCLUDED.some(p => w.startsWith(p));
}

// Entries whose patterns a food's name matches and whose exclusions it passes.
// The words of every name count for the exclusions (an English "smoked" rules
// out the Czech name too); the patterns must match within one name.
export function nameMatches(rec, entries = MATCHES) {
  const names = [rec.cs, rec.en, rec.n].filter(Boolean);
  const texts = names.map(n => tokens(n).join(' ').replace(NEUTRAL, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!texts.length) return [];
  const all = new Set(texts.join(' ').split(' '));
  const joined = names.some(n => /[&+]/.test(n));
  const out = [];
  for (const e of entries) {
    // The name shown (Czech, else English, else the original) must match:
    // Open Food Facts names in other languages are sometimes another product.
    if (!e.has.every(r => r.test(texts[0]))) continue;
    if (e.not && texts.some(t => e.not.test(t))) continue;
    if (joined || [...all].some(w => excludedWord(w, e))) continue;
    out.push(e);
  }
  return out;
}

// Macros per 100 g within: protein ±25 % (or ±2 g), fat ±40 % (or ±2 g),
// carbs ±40 % (or ±3 g), kcal ±20 %. Returns the distance (lower is closer)
// or null when any differs too much.
export function macroDistance(r, ref) {
  let d = 0;
  for (const [k, rel, abs] of [['p', 0.25, 2], ['f', 0.4, 2], ['c', 0.4, 3], ['e', 0.2, 0]]) {
    const a = r[k], b = ref[k];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    const tol = Math.max(rel * Math.abs(b), abs);
    if (Math.abs(a - b) > tol + 1e-9) return null;
    d += tol ? Math.abs(a - b) / tol : 0;
  }
  return d;
}
export const macrosAgree = (r, ref) => macroDistance(r, ref) != null;

// The best reference for a food: among the entries its name matches, the
// reference whose macros are closest; liquids (u: 'ml') only to liquid
// references. refOf(source, description) -> { k, e, p, c, f } or null.
export function matchFood(rec, refOf, entries = MATCHES) {
  const named = nameMatches(rec, entries);
  if (!named.length) return { reason: 'name' };
  let best = null, reason = 'macros';
  for (const e of named) {
    if (rec.u === 'ml' && !e.liquid) { if (reason === 'macros' && !best) reason = 'liquid'; continue; }
    for (const [src, desc] of e.refs) {
      const ref = refOf(src, desc);
      if (!ref) continue;
      const d = macroDistance(rec, ref);
      if (d != null && (!best || d < best.d)) best = { entry: e, ref, d };
    }
  }
  if (best) return best;
  return { reason, entry: named[0] };
}
