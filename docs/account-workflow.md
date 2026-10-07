# Účet, vlastní data a budoucí předplatné

Přístup zůstává jen pro pozvané. `/auth/google` žádá pouze `openid email`;
Google Health má samostatný volitelný souhlas `/oauth/google`. Registrace
nepřipojuje zdravotní zdroje.

Průvodce má tři kroky: zdroje, energetický profil a tréninkové údaje. Dokončení
je uložené v `user_setup` podle účtu, ne podle prohlížeče. Potřebuje hmotnost,
pohlaví pro výpočet, věk, výšku, běžnou aktivitu a cíl; bez dostupné historie
sportu také týdenní odhad. Trénink má hlavní sport, cíl, zkušenost, vybavení a
sedm denních časových rozpočtů. Nula znamená den bez sportu. FTP a tempo jsou
volitelné. Údaje lze znovu upravit v Nastavení. Poznámka k omezení se předává
trenérovi; při nemoci nebo zranění je nutné nastavit stav, který pozastaví plán.

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

`AI_PAYWALL_ENABLED` je standardně vypnutý. Oprávnění ke všem voláním OpenAI
se kontroluje centrálně na serveru. Pro budoucí zapnutí je nutné nejprve doplnit
platby, webhooky a provozní limity. Po výslovném nastavení na `true` je pro AI
potřeba serverový záznam `subscriptions(plan='ai', valid_until=<budoucí datum>)`.
Aplikace nemá klientské API pro změnu vlastního tarifu. Vypršené předplatné
nemá AI přístup. Připojený API klíč je samostatný předpoklad dostupnosti AI.

AI používají trenérský chat a slovní úpravy plánu, AI hodnocení,
rozpoznání jídla/etikety z fotografie, rozbor jídla z textu, webové dohledání
potravin a generování nových návodů na cviky. Energetické výpočty, základní
tréninkové generátory, katalogy a ruční evidence fungují bez OpenAI.

## Ověření a migrace

Použij Node >=22, `npm run check`, `npm run lint` a `npm test`.
D1 migrace `0009_account_workflow.sql` je aditivní. Pro nové místní databáze
nejprve spusť `staging/schema.sql`, potom migrace. Produkční nasazení zůstává
přes GitHub Actions po pushi do `main`, včetně kontrol a aplikace migrací.
