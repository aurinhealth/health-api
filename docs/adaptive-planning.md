# Časové možnosti, aktuální stav a osobní asistent

## Dostupnost

V Nastavení → Časové možnosti a preference se ukládá běžný týden. Každý den má časové okno (například `10–15` nebo `10:30–15:00`), samostatný časový rozpočet v hodinách a preferované sporty. Okno `10–15` s rozpočtem 3 h tedy neznamená pětihodinový trénink. Prázdný rozpočet je neurčený, nula znamená den bez času. Okno omezuje horní hranici rozpočtu.

Ve Workoutech → Časové možnosti týdne lze nastavit výjimku pro vybraný týden. Výjimka má přednost před základem, nepřenáší se do dalších týdnů a lze ji odstranit tlačítkem Vrátit běžný týden. Změny sportovních kartiček v kalendáři nyní platí pro vybraný týden. Dřívější opakovaný rozvrh zůstává jako výchozí nastavení.

Počet aktivit za týden je volitelný. Bez něj se používá historie dokončených aktivit za poslední tři týdny a dostupný čas. Bez historie je konzervativním výchozím počtem 3. Nedostupné dny a již naplánované aktivity se respektují; prázdný kalendář bez dostupnosti vyzve k jejímu nastavení.

## Návrhy a revize

Navrhnout tréninky připraví revizi existujícího týdne a návrhy pro prázdné dny. Plánovač funguje i bez CTL nebo API klíče; AI revize je volitelná. Akce Připravit konkrétní tréninky uloží sportovní rozvrh pouze pro tento týden a vytvoří náhledy workoutů. Gym se uloží až po potvrzení konkrétního náhledu, nikoli při pouhém návrhu.

Rozpracovat plánované vytvoří konkrétní alternativy pro již naplánované sporty, aniž by přidávalo další událost do stejného dne. Změny existujícího plánu lze probrat s asistentem nebo provést běžným ovládáním kalendáře.

Předpověď Open-Meteo se načítá i na serveru. Pro kolo se od listopadu do února preferuje indoor, stejně jako při nízké teplotě, silném větru nebo dešti. Automatická indoor jednotka má nejvýše 90 minut. Bez předpovědi se jasně uvádí sezónní odhad. Uživatel může v jednotlivém generátoru výslovně zvolit prostředí.

## Stav a asistent

V Dnes lze přepnout Active, Sick, Injured nebo On break a doplnit poznámku. Stav je uložený na serveru pro daného uživatele. Neaktivní stav pozastaví generování, nové kalendářní zápisy a noční gym automatizaci. Kalendář ani historie se přepnutím stavu nemažou.

Po načtení nebo změně denních dat se vyhodnotí více signálů regenerace. Kombinace krátkého spánku, horší HRV, vyššího klidového tepu nebo nízké formy může nabídnout On break. Jediné špatné číslo stav nemění a z naměřených dat se neurčuje Sick ani Injured. Nabídku lze přijmout, odmítnout pro daný den nebo probrat kompromis.

Plovoucí asistent uchovává posledních 12 zpráv a výslovné preference. Preference jsou vidět v Nastavení a lze je odstranit. Každá navržená změna stavu, přesun nebo vynechání tréninku má samostatné potvrzení/odmítnutí. Server kontroluje vlastníka návrhu a před změnou existujícího tréninku znovu ověří aktuální událost v Intervals.icu. Návrh jiné aktivity nejprve vytvoří náhled; zápis do kalendáře vyžaduje další potvrzení.

## AI modely a data

`OPENAI_LIGHT_MODEL` (výchozí `gpt-6-luna`) slouží pro jednoduché úlohy, jídlo, krátké odpovědi a stručné hodnocení. `OPENAI_MODEL` (výchozí `gpt-6-sol`) slouží pro plánování a revizi týdne s reasoning `medium`; analýza bloku používá `high` a až 84 dní uložených aktivit plus dostupnou fitness historii. Chybějící či nesynchronizované záznamy zůstávají chybějícími daty. Modely lze změnit serverovou konfigurací. Požadavky používají Responses API s `store:false`.

Oficiální dokumentace: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol).

Nové tabulky `week_plan_overrides` a `athlete_state` vznikají při použití funkcí a jsou zahrnuté do ochrany osobních tabulek. Všechny dotazy filtrují `user_id`; změna nevyžaduje převod ani mazání historických dat.
