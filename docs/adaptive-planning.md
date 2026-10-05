# Časové možnosti, aktuální stav a osobní asistent

## Dostupnost

V Nastavení → Časové možnosti se ukládá běžný týden. Časová dostupnost znamená celkovou délku, kterou lze daný den věnovat sportu, například 1 h 30 min. Upravuje se posuvníkem nebo přesným zadáním hodin a minut. Nejde o konkrétní hodiny dne. Neurčený den zůstává neurčený, nula znamená den bez sportu. Původní časová okna se převedou na uložený časový rozpočet (nebo délku okna, pokud rozpočet chybí); jejich začátek už neurčuje čas zápisu do kalendáře. Preference sportu z dostupnosti byly odstraněny.

Ve Workoutech → Časové možnosti lze nastavit výjimku pro vybraný týden. Výjimka má přednost před základem, nepřenáší se do dalších týdnů a lze ji odstranit tlačítkem Vrátit běžný týden. Změny sportovních kartiček v kalendáři platí pro vybraný týden. Dřívější opakovaný rozvrh zůstává jako výchozí nastavení.

Počet aktivit se zadává číslem, vedle je zaškrtávací volba Podle historie. Pro odhad se používá historie dokončených aktivit za poslední tři týdny; musí zahrnovat alespoň dva týdny a čtyři dokončené aktivity. Při chybějící či krátké historii editor i návrh týdne vysvětlí, že dočasným základem jsou nejvýše tři aktivity týdně podle dostupného času. Ruční počet má přednost. Nedostupné dny a již naplánované aktivity se respektují; prázdný kalendář bez dostupnosti vyzve k jejímu nastavení.

Denní přehled výživy umožňuje přímo vybrat nápoj, zapsat šest obvyklých množství nebo vlastní množství a zobrazit či odstranit poslední zápisy. Celá historie pití zůstává dostupná přes odkaz Všechny zápisy.

## Návrhy a revize

Vygenerovat tréninky (vedle tlačítka je „i“ s vysvětlením) připraví revizi existujícího týdne a návrhy pro prázdné dny. Plánovač funguje i bez CTL nebo API klíče; AI revize je volitelná. Akce Připravit konkrétní tréninky uloží sportovní rozvrh pouze pro tento týden a vytvoří náhledy workoutů. Gym se uloží až po potvrzení konkrétního náhledu, nikoli při pouhém návrhu.

Rozpracovat plánované vytvoří konkrétní alternativy pro již naplánované sporty, aniž by přidávalo další událost do stejného dne. Změny existujícího plánu lze probrat s asistentem nebo provést běžným ovládáním kalendáře.

Předpověď Open-Meteo se načítá i na serveru. Pro kolo se od listopadu do února preferuje indoor, stejně jako při nízké teplotě, silném větru nebo dešti. Automatická indoor jednotka má nejvýše 90 minut. Bez předpovědi se jasně uvádí sezónní odhad. Uživatel může v jednotlivém generátoru výslovně zvolit prostředí.

## Plán týdne a Doporučené tréninky

Sporty se do dnů přetahují (nebo na mobilu ťuknutím vyberou a ťuknutím na den položí); jeden den může mít až čtyři tréninky, třeba kolo i gym nebo dvakrát kolo (druhý trénink stejného sportu je lehký a má vlastní cíl). Gym položený na den, kde byl dřív zrušený, se tam znovu počítá. Přesunutá kartička s sebou nebere návrh vytvořený pro původní den. Návrh dne (např. „2h 0m · ~98 TSS · IF 0,70 · Vytrvalost“) se u kartiček ukáže až po 5 s bez změny plánu, aby přesouvání nezahlcovalo kalendář.

Zátěž zůstává v TSS: je to Load z Intervals.icu, ze kterého se počítá CTL/ATL. Vedle ní se ukazuje IF (intensity factor, TSS = h × IF² × 100), aby bylo vidět, jak tvrdý trénink je, nejen jak velký.

Doporučené tréninky je okno s knihovnou workoutů: zaměření (vytrvalost, práh…) se přepíná nahoře, filtry se rozbalují tlačítkem Filtry. Po kliknutí na návrh dne ukáže pět nejvhodnějších tréninků pro ten den. Otevřené tlačítkem v plánovači nejdřív nabídne Denní doporučení, ale jen když na dnešek není nic v plánu; to může být kolo, běh i gym. Samostatná karta Trénink na den byla zrušena.

Přesunutý gym trénink v Intervals.icu vezme s sebou i neodcvičený plán cviků.

Změny se v týdenním přehledu ukážou hned. Zbytek aplikace (Dnes, Trénink, Výživa) se obnoví, až se plán 5 s nemění. Přesuny a mazání tréninků se do Intervals.icu posílají sloučené nejpozději do 15 s (víc přesunů jednoho tréninku = jedna změna, při zavření stránky hned). Když je Intervals.icu odmítne, změna se vrátí zpět. Nový trénink z knihovny se uloží i lokálně, takže je v týdnu vidět bez čekání na synchronizaci.

## Stav a asistent

V Dnes lze přepnout Active, Sick, Injured nebo On break a doplnit poznámku. Stav je uložený na serveru pro daného uživatele. Neaktivní stav pozastaví generování, nové kalendářní zápisy a noční gym automatizaci. Kalendář ani historie se přepnutím stavu nemažou.

Po načtení nebo změně denních dat se vyhodnotí více signálů regenerace. Kombinace krátkého spánku, horší HRV, vyššího klidového tepu nebo nízké formy může nabídnout On break. Jediné špatné číslo stav nemění a z naměřených dat se neurčuje Sick ani Injured. Nabídku lze přijmout, odmítnout pro daný den nebo probrat kompromis.

Plovoucí asistent uchovává posledních 12 zpráv a výslovné preference. Preference jsou vidět v Nastavení a lze je odstranit. Každá navržená změna stavu, přesun nebo vynechání tréninku má samostatné potvrzení/odmítnutí. Server kontroluje vlastníka návrhu a před změnou existujícího tréninku znovu ověří aktuální událost v Intervals.icu. Návrh jiné aktivity nejprve vytvoří náhled; zápis do kalendáře vyžaduje další potvrzení.

## AI modely a data

`OPENAI_LIGHT_MODEL` (výchozí `gpt-6-luna`) slouží pro jednoduché úlohy, jídlo, krátké odpovědi a stručné hodnocení. `OPENAI_MODEL` (výchozí `gpt-6-sol`) slouží pro plánování a revizi týdne s reasoning `medium`; analýza bloku používá `high` a až 84 dní uložených aktivit plus dostupnou fitness historii. Chybějící či nesynchronizované záznamy zůstávají chybějícími daty. Modely lze změnit serverovou konfigurací. Požadavky používají Responses API s `store:false`.

Oficiální dokumentace: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol).

Nové tabulky `week_plan_overrides` a `athlete_state` vznikají při použití funkcí a jsou zahrnuté do ochrany osobních tabulek. Všechny dotazy filtrují `user_id`; změna nevyžaduje převod ani mazání historických dat.
