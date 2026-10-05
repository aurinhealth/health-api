# Časové možnosti, aktuální stav a osobní asistent

## Dostupnost

V Nastavení → Časové možnosti se ukládá běžný týden. Časová dostupnost znamená celkovou délku, kterou lze daný den věnovat sportu, například 1 h 30 min. Upravuje se posuvníkem nebo přesným zadáním hodin a minut. Nejde o konkrétní hodiny dne. Neurčený den zůstává neurčený, nula znamená den bez sportu. Původní časová okna se převedou na uložený časový rozpočet (nebo délku okna, pokud rozpočet chybí); jejich začátek už neurčuje čas zápisu do kalendáře. Preference sportu z dostupnosti byly odstraněny.

Ve Workoutech → Časové možnosti lze nastavit výjimku pro vybraný týden. Výjimka má přednost před základem, nepřenáší se do dalších týdnů a lze ji odstranit tlačítkem Vrátit běžný týden. Změny sportovních kartiček v kalendáři platí pro vybraný týden. Dřívější opakovaný rozvrh zůstává jako výchozí nastavení.

Počet aktivit se zadává číslem, vedle je zaškrtávací volba Podle historie. Pro odhad se používá historie dokončených aktivit za poslední tři týdny; musí zahrnovat alespoň dva týdny a čtyři dokončené aktivity. Při chybějící či krátké historii editor i návrh týdne vysvětlí, že dočasným základem jsou nejvýše tři aktivity týdně podle dostupného času. Ruční počet má přednost. Nedostupné dny a již naplánované aktivity se respektují; prázdný kalendář bez dostupnosti vyzve k jejímu nastavení.

Denní přehled výživy umožňuje přímo vybrat nápoj, zapsat šest obvyklých množství nebo vlastní množství a zobrazit či odstranit poslední zápisy. Celá historie pití zůstává dostupná přes odkaz Všechny zápisy.

## Návrhy a revize

Vygenerovat tréninky (vedle tlačítka je „i“ s vysvětlením) připraví revizi existujícího týdne a návrhy pro prázdné dny. Plánovač funguje i bez CTL nebo API klíče; AI revize je volitelná. Akce Připravit konkrétní tréninky je schválení: uloží sportovní rozvrh pouze pro tento týden, připraví konkrétní workouty i gym a ty se do Intervals.icu zapíšou samy do 15 s, stejně jako přesuny a mazání (při zavření stránky hned). Do té doby jde kterýkoli zastavit tlačítkem Nezapisovat u kartičky. Průběh Vygenerováno → Schváleno → Nasazeno je vidět pod plánem týdne i v odpovědi asistenta. Trénink potvrzený v asistentovi jde stejnou cestou. Přidání workoutu z knihovny tlačítkem Naplánovat se už znovu nepotvrzuje; dotaz zůstal jen u mazání a rušení.

Rozpracovat plánované vytvoří konkrétní alternativy pro již naplánované sporty, aniž by přidávalo další událost do stejného dne. Změny existujícího plánu lze probrat s asistentem nebo provést běžným ovládáním kalendáře.

Předpověď Open-Meteo se načítá i na serveru. Pro kolo se od listopadu do února preferuje indoor, stejně jako při nízké teplotě, silném větru nebo dešti. Automatická indoor jednotka má nejvýše 90 minut. Bez předpovědi se jasně uvádí sezónní odhad. Uživatel může v jednotlivém generátoru výslovně zvolit prostředí.

## Plán týdne a Doporučené tréninky

Sporty se do dnů přetahují (nebo na mobilu ťuknutím vyberou a ťuknutím na den položí); jeden den může mít až čtyři tréninky, třeba kolo i gym nebo dvakrát kolo (druhý trénink stejného sportu je lehký a má vlastní cíl). Gym položený na den, kde byl dřív zrušený, se tam znovu počítá. Přesunutá kartička s sebou nebere návrh vytvořený pro původní den. Návrh dne (např. „2h 0m · ~98 TSS · IF 0,70 · Vytrvalost“) se u kartiček ukáže až po 5 s bez změny plánu, aby přesouvání nezahlcovalo kalendář.

Běh roste pomalu: týdenní objem běhu (hotové, naplánované i navržené běhy) je nejvýš o 10 % nad větším z minulého týdne a průměru posledních 4 týdnů; 60 min týdně jde vždy. Návrhy běhu se podle toho zkrátí a záhlaví týdne to řekne.

Zátěž zůstává v TSS: je to Load z Intervals.icu, ze kterého se počítá CTL/ATL. Vedle ní se ukazuje IF (intensity factor, TSS = h × IF² × 100), aby bylo vidět, jak tvrdý trénink je, nejen jak velký.

Doporučené tréninky je okno s knihovnou workoutů: zaměření (vytrvalost, práh…) se přepíná nahoře, filtry se rozbalují tlačítkem Filtry. Po kliknutí na návrh dne ukáže pět nejvhodnějších tréninků pro ten den. Otevřené tlačítkem v plánovači nejdřív nabídne Denní doporučení, ale jen když na dnešek není nic v plánu; to může být kolo, běh i gym. Samostatná karta Trénink na den byla zrušena.

Přesunutý gym trénink v Intervals.icu vezme s sebou i neodcvičený plán cviků.

U každé kartičky jde kliknutím na ⏱ zvolit délku (gym 30–90 min, kolo a běh od 20 min do 5 h) a vedle názvu sportu přepnout venku / indoor. Bez vlastní volby rozhoduje předpověď počasí a sezóna. Indoor trénink je kratší a tím lehčí: kolo 70 % venkovní délky, nejvýš 90 min, běh na páse 80 %, nejvýš 60 min; intenzita role zůstává. Volby se ukládají k týdnu (`prefs.sessions`, klíč den|sport|pořadí) a cestují s kartičkou při přesunu.

Doporučené tréninky se pro kartičky načítají předem na pozadí a server si výpočet kontextu trenéra a FTP pamatuje 10 minut (`api-cache.js`, Workers Cache API). Každá změna od uživatele (synchronizace, úprava plánu, hodnocení) mezipaměť zneplatní.

Změny se v týdenním přehledu ukážou hned. Zbytek aplikace (Dnes, Trénink, Výživa) se obnoví, až se plán 5 s nemění. Přesuny a mazání tréninků se do Intervals.icu posílají sloučené nejpozději do 15 s (víc přesunů jednoho tréninku = jedna změna, při zavření stránky hned). Když je Intervals.icu odmítne, změna se vrátí zpět. Nový trénink z knihovny se uloží i lokálně, takže je v týdnu vidět bez čekání na synchronizaci.

## Stav a asistent

Ohodnocený trénink (RPE v Intervals.icu, poznámka kouče k němu, nebo hodnocení právě uložené) má v Dnes místo tlačítka Hodnocení „✓ ohodnoceno“.

V Dnes lze přepnout Active, Sick, Injured nebo On break a doplnit poznámku. Stav je uložený na serveru pro daného uživatele. Neaktivní stav pozastaví generování, nové kalendářní zápisy a noční gym automatizaci. Kalendář ani historie se přepnutím stavu nemažou.

Po načtení nebo změně denních dat se vyhodnotí více signálů regenerace. Kombinace krátkého spánku, horší HRV, vyššího klidového tepu nebo nízké formy může nabídnout On break. Jediné špatné číslo stav nemění a z naměřených dat se neurčuje Sick ani Injured. Nabídku lze přijmout, odmítnout pro daný den nebo probrat kompromis.

Plovoucí asistent ukládá rozhovory jako chaty (D1, tabulky `assistant_chats` a `assistant_messages`). Trenér vidí jen posledních 12 zpráv aktuálního chatu; „＋ Nový“ začne čistý chat a po 6 hodinách bez zprávy se nový chat začne sám. Seznam „☰ Chaty“ umí otevřít nebo smazat starší chat; chaty bez zprávy 90 dní se mažou. Výslovné preference platí napříč chaty, jsou vidět v Nastavení a lze je odstranit. Každá navržená změna stavu, přesun nebo vynechání tréninku má samostatné potvrzení/odmítnutí. Server kontroluje vlastníka návrhu a před změnou existujícího tréninku znovu ověří aktuální událost v Intervals.icu. Návrh jiné aktivity nejprve vytvoří náhled; zápis do kalendáře vyžaduje další potvrzení.

## AI modely a data

`OPENAI_LIGHT_MODEL` (výchozí `gpt-6-luna`) odpovídá na rychlé a jednoduché dotazy („Jaké mám FTP?“, „Kolik mám dnes bílkovin?“, „Co mám zítra za trénink?“ – se stejnými daty jako trenér), na small talk, jídlo a stručná hodnocení. `OPENAI_MODEL` (výchozí `gpt-6-sol`) dostane vše, co chce úvahu: plánování, úpravy, revizi týdne, rozhodnutí („Mám dnes jít na intervaly?“), doporučení a analýzu bloku (až 84 dní aktivit). Reasoning je u obou `low`, aby složitá odpověď nebrala zbytečně tokeny; `OPENAI_REASONING_EFFORT` ho pro hlavní model může zvýšit. Chybějící či nesynchronizované záznamy zůstávají chybějícími daty. Modely lze změnit serverovou konfigurací. Požadavky používají Responses API s `store:false`.

Oficiální dokumentace: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol).

Nové tabulky `week_plan_overrides` a `athlete_state` vznikají při použití funkcí a jsou zahrnuté do ochrany osobních tabulek. Všechny dotazy filtrují `user_id`; změna nevyžaduje převod ani mazání historických dat.

## Detail tréninku v týdnu

Klik na trénink v týdenním přehledu otevře jeho detail. Naplánované kolo nebo běh vypadá jako karta doporučeného tréninku: profil výkonu, délka, TSS, IF, FTP a rozpis kroků (z workoutu knihovny, ze kterého vznikl, jinak z workout_doc nebo textu události v Intervals.icu; `src/planned-detail.js`, `/app/api/workouts/planned`). Gym ukáže postavu se zvýrazněnými partiemi podle počtu sérií a krátký seznam cviků. Akce u naplánovaného: Přesunout, Vyměnit za jiný (nový trénink z doporučení nahradí původní) a Zrušit. U hotového je porovnání s plánem (délka, TSS, IF a celkové hodnocení) a celý záznam aktivity: čísla, trasa, výkon, tep a intervaly; u posilovny plán proti zapsaným sériím a postava podle odcvičených sérií. Kartička týdenního plánu se pro sport, který už má v daný den naplánovaný nebo hotový trénink, nezobrazuje.

## Technika cviků

V režimu tréninku otevře „📖 Technika a video“ kartu cviku: nastavení, provedení, kde má být cvik cítit a co nemá bolet (`src/exercise-feel.js`), časté chyby, dýchání a ukázkové video (`src/exercise-technique-data.js`, videa dohledaná vyhledáváním). Každý cvik katalogu musí mít kartu i „Kde to cítit“ (hlídá test). Cvik mimo katalog, který má sportovec v plánu nebo historii, dostane kartu jednou od AI (lehký model s vyhledáním videa) a uloží se do tabulky `exercise_techniques`, takže se příště čte ze serveru. Vlastní odkaz na video se ukládá ke cviku (tabulka `exercise_videos`) a nahradí ukázku; odkaz mimo YouTube se otevře v prohlížeči. AI trenér zůstává dostupný tlačítkem „✦ AI“.
