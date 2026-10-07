# Účet, vlastní data a budoucí předplatné

Přístup zůstává jen pro pozvané. `/auth/google` žádá pouze `openid email`;
Google Health má samostatný volitelný souhlas `/oauth/google`. Registrace
nepřipojuje zdravotní zdroje.

Průvodce má zdroje, volitelný energetický profil a volitelné tréninkové údaje.
Dokončení je uložené v `user_setup` podle účtu. Pokud už data stačí pro kalorie,
profil se přeskočí; automatický trénink nevyžaduje další potvrzení. Při ruční
úpravě v Nastavení jsou oba formuláře dostupné. Neúplný profil nebrání vstupu
do aplikace. Bez hmotnosti, pohlaví pro výpočet, věku, výšky a běžné aktivity
se kalorický cíl nevymýšlí a zůstává nedostupný. Výchozí hmotnostní cíl je
udržování. Ruční odhad sportu není povinný. „Automaticky“ je dostupné až se
skutečnou nedávnou historií obsahující délku aktivit, nikoli jen propojením.

Hlavní sport je nejčastější druh dokončené aktivity za 56 dní; při rovnosti,
bez aktivit nebo nepodporovaném dominantním sportu jde o všeobecnou kondici.
Zkušenost je opatrný odhad pravidelnosti za 84 dní: alespoň 2 tréninky týdně
a 6 aktivních týdnů znamená pravidelně sportujícího; alespoň 4 týdně a 10
aktivních týdnů vyšší pravidelnost. Jinak začátečník. Jde o produktovou
heuristiku, ne ověření technické zdatnosti nebo let zkušeností. Ruční volba má
přednost. Automatické hodnoty se po importu znovu odvozují a nezafixují se
v osobním profilu. Aktivita z více zdrojů se započítá jednou. Sportovní cíl
může zůstat prázdný. FTP, tempo a zóny jsou volitelné.

Časové možnosti se vyplňují pouze v Plánu. Bez vlastního rozpočtu se použije
objem a dny z posledních 28 dní (alespoň 4 tréninky ve 3 aktivních týdnech),
jindy výchozí šablona: začátečník 105 min / 3 dny, pravidelný 150 min / 4 dny,
vyšší pravidelnost 240 min / 6 dní. Začátečník začíná opatrně pod cílovým
objemem; víkend má v šabloně delší prostor. Tyto minuty a víkendové rozložení
jsou nastavitelné produktové výchozí hodnoty, nikoli naměřené populační
průměry nebo znalost volného času. WHO doporučuje dospělým 150–300 minut
středně intenzivní aerobní aktivity (nebo ekvivalent) a sílu alespoň dva dny
týdně; ACSM podporuje postupnou progresi podle zkušeností. Samotné minuty
šablony nezaručují splnění těchto doporučení ani vhodnost intenzity.
Zdroje: [WHO 2020](https://doi.org/10.1136/bjsports-2020-102955),
[ACSM 2009](https://doi.org/10.1249/MSS.0b013e3181915670).
Vlastní čas, nulový rozpočet i týdenní výjimka mají přednost. Dokončení či
úprava průvodce vlastní rozvrh nepřepisuje.

Místo pro sílu se nastavuje u posilovny tlačítkem „Kde cvičím“: doma bez
nářadí, s jednoručkami a lavicí, nebo v posilovně. Bez volby vlastní váha.
Poznámka k omezení se předává trenérovi; při nemoci nebo zranění je nutné
nastavit stav, který pozastaví plán.

Připojení služby spustí úvodní import na pozadí: Google přes existující dávkovou
frontu, Intervals přes import historie. Obě služby mají samostatný stav, aby
připojení druhé služby během běžícího importu neztratilo práci. Průběh je vidět
v Nastavení. Kalorie jsou dostupné před dokončením importu; samotné propojení
bez nedávných aktivit nezruší odhad sportu z profilu. Tlačítko Obnovit opakuje
neúspěšný import a exporty. Google OAuth musí být nakonfigurovaný u poskytovatele.

## Potraviny a recepty

Ve Výživě jsou Moje potraviny a Moje jídla. Vlastní potravina má stabilní klíč,
takže přejmenování nevytvoří kopii. Úprava nebo smazání nemění historický
jídelníček. Recept ukládá suroviny, jejich množství a nutriční hodnoty použitého
množství; součet se dělí počtem porcí. Sdílení receptu je výslovná volba.

Společný katalog je dostupný přes hledání, ne jako seznam cizích záznamů.
Obsahuje jen produktové/recepturní údaje, bez účtu, osobních preferencí,
jídelníčku či poznámek. Komunitní údaje jsou označené jako neověřené; hlášení
nesrovnalosti je jednou na uživatele a položku a zobrazí upozornění ostatním.
Příspěvky jsou deduplikované podle obsahu. Při úpravě se odpojí starý příspěvek;
pokud ho sdílí i někdo další, zůstává. Starší katalog nemá zpětně dostupné
vlastnictví příspěvků, proto se staré anonymní položky neodstraňují hromadně.

## Trénink a exporty

Nové tréninky jsou nejprve uložené v `local_workouts` a lokálním kalendáři.
`workout_exports` obsahuje stav a identitu exportu pro každého poskytovatele;
nyní je implementovaný adaptér Intervals. Neúspěšný export nezruší plán.
Přesuny, změny prostředí a smazání vlastních plánů fungují bez připojení.
Export používá stabilní `external_id` a upsert; opakování nevyrobí kopii.
Import rozpozná vlastní exporty, aby je v přehledech nezapočítal dvakrát.
Neúspěšné exporty opakuje Obnovit nebo pravidelná synchronizace.

Plány převzaté z Intervals před touto změnou zachovávají své původní externí
vlastnictví. Nově vytvářené plány v aplikaci mají vlastní lokální identitu.
Budoucí adaptér přidá poskytovatele do outboxu bez změny uloženého plánu.

Vlastní trénink lze zadat ručně. Odcvičení lokálního workoutu se výslovně
potvrdí se skutečnou délkou a RPE; vznikne záznam v místní historii i bez
externí aktivity. Ručně zaznamenané dokončení se neodesílá jako nová aktivita
do Intervals. Silové plány respektují vybrané vybavení; začátečník má menší
objem. Rozšířený katalog nabízí i cviky s vlastní vahou.

## Předplatné a AI

Nastavení → Předplatné ukazuje podmínky pilotu a plánovanou tabulku Free/AI.
Během pilotu jsou všechny dostupné funkce zdarma, bez karty a účtování.
Cena ani limity nejsou vymyšlené. Platební brána není implementovaná.

Při prvním použití AI funkce během pilotu (asistent, hodnocení, úprava
posilovny, jídlo z fotky, dohledání potraviny) jednou vyskočí okno s porovnáním
Free a AI a tlačítkem Předplatit AI, které zatím jen řekne, že platby nejsou
spuštěné. Že ho uživatel viděl, je uložené u účtu (`dashboard_profile` řádek 4,
`POST /app/api/subscription/intro`), takže se neukáže znovu ani na jiném
zařízení. Po zapnutí `AI_PAYWALL_ENABLED` se stejné okno ukáže pokaždé, když
zamčená funkce vrátí 402.

`AI_PAYWALL_ENABLED` je standardně vypnutý. Oprávnění ke všem voláním OpenAI
se kontroluje centrálně na serveru. Pro budoucí zapnutí je nutné nejprve doplnit
platby, webhooky a provozní limity. Po výslovném nastavení na `true` je pro AI
potřeba serverový záznam `subscriptions(plan='ai', valid_until=<budoucí datum>)`.
Aplikace nemá klientské API pro změnu vlastního tarifu. Vypršené předplatné
nemá AI přístup. Připojený API klíč je samostatný předpoklad dostupnosti AI.

AI používají trenérský chat a slovní úpravy plánu, AI hodnocení,
rozpoznání jídla/etikety z fotografie, rozbor jídla z textu, webové dohledání
potravin a doplnění chybějící techniky cviku mimo katalog. Hotové katalogové
návody se zobrazují bez AI. Při otevření techniky cviku mimo katalog, který
uživatel má v historii/plánu, AI jednou vytvoří společný text techniky a
dohledá video. Výsledek se uloží a používá znovu. Individuální úpravy patří
do trenérského chatu, tento společný návod není personalizovaný.
Energetické výpočty, základní
tréninkové generátory, katalogy a ruční evidence fungují bez OpenAI.

## Vlastní data a smazání účtu

Nastavení → Účet nabízí stažení všech dat účtu (`GET /app/api/account/export`,
JSON ze všech osobních tabulek bez klíčů připojení) a smazání účtu
(`POST /app/api/account/delete` s potvrzením `SMAZAT`, `account-data.js`).
Smazání vrátí Googlu souhlas k Google Health, odstraní řádky účtu ze všech
osobních tabulek (`PERSONAL_TABLES`) i samotný účet a odhlásí. Znovu se
přihlásit jde jen s novou pozvánkou. Sdílený katalog potravin a receptů osobní
údaje neobsahuje a zůstává. Účet správce smazat nejde. Intervals.icu nemá volání
pro odvolání klíče; uživatel může aplikaci odebrat v nastavení Intervals.icu.

## Ověření a migrace

Použij Node >=22, `npm run check`, `npm run lint` a `npm test`.
D1 migrace `0009_account_workflow.sql` je aditivní. Pro nové místní databáze
nejprve spusť `staging/schema.sql`, potom migrace. Produkční nasazení zůstává
přes GitHub Actions po pushi do `main`, včetně kontrol a aplikace migrací.
