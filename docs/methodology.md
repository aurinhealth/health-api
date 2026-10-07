# Metodika výpočtů a zdroje

Tento dokument popisuje, jak aplikace počítá vlastní ukazatele, z čeho vychází a kde má výpočet limity. Slouží jako podklad pro komunikaci se zákazníky: u každé funkce je metoda, zdroj a co přesně tvrdit a co ne.

Platí pro všechno: HRV, klidový tep, dech, spánek, tepové zóny a aktivní energii bereme ze zařízení přes Google Health a Intervals.icu. Přesnost těchto vstupů neovlivníme. Rozhoduje metoda, kterou z nich počítáme.

Zdroje byly ověřené přes abstrakty, bibliografické záznamy a primární dokumentaci (Google Health API discovery dokument). Plné texty několika studií nebyly z vývojového prostředí dostupné; u nich uvádíme jen to, co potvrzují abstrakty a citované úryvky. Před citací ve veřejném materiálu je vždy potřeba přečíst plné znění.

## 1. Funkce postavené na standardních metodách

### Heart Rate Recovery (HRR)

- **Výpočet:** pokles tepu od posledního úseku v zóně 4+ k nejnižšímu tepu během následujících 2 minut (`src/activity-detail.js`, `heartRateRecovery`).
- **Srovnání:** Garmin počítá „Recovery Heart Rate“ stejně, jako rozdíl tepu na konci zátěže a po 2 minutách. My HRR dopočítáme ze záznamu aktivity i bez ukončení tréninku na hodinkách.
- **Zdroj:** Cole CR et al. *Heart-rate recovery immediately after exercise as a predictor of mortality.* N Engl J Med 1999;341:1351–1357. [PMID 10536127](https://pubmed.ncbi.nlm.nih.gov/10536127/). Pokles o ≤ 12 tepů za první minutu: 4× vyšší úmrtnost za 6 let (2× po úpravě na další faktory).
- **Co tvrdit:** klinicky ověřená metrika zotavení srdce. Nejde o diagnózu.

### Klidový metabolismus (Mifflin-St Jeor)

- **Výpočet:** `src/energy-profile.js`, `restingMetabolicRate`.
- **Zdroj:** Frankenfield D et al. *Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review.* J Am Diet Assoc 2005;105:775–789. Mifflin-St Jeor odhadne klidový metabolismus v toleranci ±10 % u 82 % lidí bez obezity a asi 70 % lidí s obezitou. Je nejspolehlivější ze srovnávaných rovnic.
- **Co tvrdit:** nejpřesnější ověřená predikční rovnice. U jednotlivce se může mýlit o 10–20 %; proto cíl dál ladí podle vývoje váhy (bod 2.6).

### Progrese vah podle RPE/RIR

- **Výpočet:** dvojitá progrese. Všechny pracovní série na horní hranici rozsahu opakování nebo s lehkým RPE posunou váhu o krok nahoru. RPE ≥ 9,5 vrátí krok zpět. (`src/strength-intelligence.js`)
- **Zdroj:** Helms ER et al. *Application of the repetitions in reserve-based rating of perceived exertion scale for resistance training.* Strength Cond J 2016;38(4):42–49. Validace škály: Zourdos MC et al., J Strength Cond Res 2016;30:267–275.
- **Co tvrdit:** autoregulace podle počtu opakování do selhání, stejný princip jako JuggernautAI a Fitbod.

### TSS, IF, CTL/ATL/TSB

- **Výpočet:** TSS = hodiny × IF² × 100. Dokončené aktivity mají TSS, CTL a ATL z Intervals.icu; plánované tréninky počítáme sami (`src/workout-model.js`).
- **Zdroj:** Allen H, Coggan A. *Training and Racing with a Power Meter.* VeloPress (2. vyd. 2010). Banisterův model fitness–fatigue: Banister EW 1991 (kapitola v *Physiological Testing of the High-Performance Athlete*).
- **Co tvrdit:** průmyslový standard (TrainingPeaks, Intervals.icu). Banisterův model popisuje data, nepředpovídá přesně výkon. Neprezentovat jako predikci.

### Zóny a FTP

- **Výpočet:** `src/training-zones.js`, mimo jiné dvouparametrový model kritického výkonu (CP z testů 3 a 12 min).
- **Zdroj:** Monod H, Scherrer J. Ergonomics 1965;8:329–338. Poole DC et al. *Critical power: an important fatigue threshold in exercise physiology.* Med Sci Sports Exerc 2016;48:2320–2334. [PMC5070974](https://pmc.ncbi.nlm.nih.gov/articles/PMC5070974/).

### Pitný režim

- **Výpočet:** 30 ml na kg hmotnosti (bez váhy 2,0 l muži, 1,6 l ženy), plus 0,5 l za hodinu tréninku; nejméně 1,5 l, nejvíc 6 l (`src/fluids.js`).
- **Zdroj:** EFSA NDA Panel. *Scientific Opinion on Dietary reference values for water.* EFSA Journal 2010;8(3):1459. Dostatečný celkový příjem vody je 2,5 l mužům a 2,0 l ženám; asi 20 % pochází z jídla.
- **Co tvrdit:** orientační cíl podle EFSA, ne předpis.

### Šetření nohou a dávka v posilovně podle vytrvalostní zátěže

- **Výpočet:** posilovna ubere objem při velké vytrvalostní únavě (forma TSB), nízké regeneraci nebo blízké klíčové jízdě. Nohy šetří, když je náročná nebo dlouhá jízda dnes či zítra, po velkých 48 hodinách nebo při TSB ≤ −25 (`src/strength-generator.js`).
- **Zdroje:** Wilson JM et al. *Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises.* J Strength Cond Res 2012;26:2293–2307 (21 studií, 422 effect size). Hypertrofie: samotná síla ES 1,23, kombinace 0,85; síla 1,76 proti 1,44; výkon 0,91 proti 0,55. Interferenci působil běh, ne kolo, a rostla s frekvencí a délkou vytrvalostního tréninku. Robineau J et al. *Specific training effects of concurrent aerobic and strength exercises depend on recovery duration.* J Strength Cond Res 2016;30:672–683 (0 h pauza nejhorší, 24 h nejlepší, doporučení aspoň 6 h).
- **Co tvrdit:** princip je podložený a konkurence ho nemá. Konkrétní prahy (TSB −25, koeficienty dávky) jsou naše kalibrace, ne výsledek studie.

## 2. Funkce přepracované podle literatury

### 2.1 Index regenerace (jeden pro dashboard i trenéry)

- **Výpočet:** `src/recovery-model.js`, `recoveryReadiness`.
  - HRV (50 %) jako lnRMSSD proti průměru a SD předchozích 60 dní.
  - Klidový tep (25 %) proti stejné baseline.
  - Spánek (25 %) jako procento potřeby spánku.
  - Každá složka: osobní průměr = 70, −1 SD = 50, −2 SD = 30. Celkem 0–100; zelená ≥ 67, žlutá 34–66, červená < 34.
  - Trend: 7denní průměr lnRMSSD pod průměrem o víc než nejmenší významnou změnu (0,5 SD).
  - Dech ve spánku o ≥ 1 dech/min a 2 SD nad baseline ubere 10 bodů.
  - Teplota kůže ve spánku o ≥ 0,5 °C a zároveň 2 noční SD nad 30denní baseline Google Health ubere 10 bodů (Google Health typ `daily-sleep-temperature-derivations`).
  - Potřebuje 14 předchozích měření.
- **Zdroje:**
  - Plews DJ et al. Eur J Appl Physiol 2012;112:3729–3741, [PMID 22367011](https://pubmed.ncbi.nlm.nih.gov/22367011/): 7denní průměr lnRMSSD zachytil přetrénování, jednotlivé dny ne.
  - Plews DJ et al. Int J Sports Physiol Perform 2013;8:688–691: týdenní průměry korelovaly s výkonem r = 0,72–0,76, jednotlivé dny ne.
  - Plews DJ et al. Sports Med 2013;43:773–781 (přehled).
  - Buchheit M. *Monitoring training status with HR measures: do all roads lead to Rome?* Front Physiol 2014;5:73, [PMID 24578692](https://pubmed.ncbi.nlm.nih.gov/24578692/).
  - Javaloyes A et al. Int J Sports Physiol Perform 2019;14:23–32: trénink řízený HRV (7denní lnRMSSD mimo SWC → lehký den) zlepšil cyklistům 40min časovku o 7,3 %, tradiční plán ne.
  - Kiviniemi AM et al. Eur J Appl Physiol 2007;101:743–751: pravidlo „HRV pod 10denním průměrem − SD, nebo dva dny po sobě klesá → lehký trénink nebo volno“; skupina řízená HRV zvýšila maximální rychlost z 15,5 na 16,4 km/h a VO₂peak z 56 na 60 ml/kg/min. Naše hranice „−1 SD = žlutá“ vychází ze stejné logiky, jen s delší baseline.
  - Smarr BL et al. Sci Rep 2020 (*Feasibility of continuous fever monitoring using wearable devices*): noční teplota kůže z prstenu Oura zachytila nástup horečky, často dřív, než lidé hlásili příznaky.
- **Proti konkurenci:** Whoop (HRV, klidový tep, spánek, dech) a Oura (HRV balance proti 3 měsícům, klidový tep, teplota, spánek…) používají stejné vstupy, ale váhy nezveřejňují. My máme stejné jádro, zveřejněnou metodu a stejné číslo pro dashboard i trenéra. Navíc trend proti SWC, jak ho používají studie.
- **Limity:** váhy 50/25/25 a převod z-skóre na body jsou naše volba. Literatura říká, že HRV je hlavní ukazatel, ale přesné váhy nedává. Žádný výrobce svůj složený index nezveřejňuje ani nezávisle nevalidoval; proto máme vlastní ověření (bod 2.8). Bellenger 2016 (Sports Med, metaanalýza 24 studií) upozorňuje, že klidové HRV samo funkční přetížení spolehlivě nezachytí; index proto kombinuje víc signálů. Teplota v luteální fázi stoupá méně než o náš práh.

### 2.2 Spánkový index, potřeba spánku a spánkový dluh

- **Výpočet:** `sleepNeedMinutes`, `sleepIndexScore`, `sleepDebtMinutes` v `src/recovery-model.js`.
  - Potřeba spánku (`sleepNeedFor`): 8 h (od 65 let 7,5 h); po zátěži dne ≥ 14 o 15 min a po ≥ 18 o 30 min víc; při nízkém HRV statusu (7denní lnRMSSD pod baseline o víc než SWC) o 15 min; se spánkovým dluhem o čtvrtinu dluhu, nejvýš 30 min. Zdřímnutí (Google je označuje jako `nap`) potřebu sníží. Výsledek vždy 7–9 h.
  - Index: délka proti potřebě (50 bodů; nula při polovině potřeby, plný počet při splněné potřebě); kvalita (35): když zařízení hlásí dobu usnutí a bdění, pak efektivita od 85 % (20), usnutí do 30 min (7,5) a bdění po usnutí do 20 min (7,5), jinak jen efektivita (35); podíl hlubokého spánku ≥ 13 % a REM ≥ 20 % (15). Bez fází se přepočítá.
  - Dluh: součet nedospání za 7 dní včetně zdřímnutí; delší den spánku splatí nejvýš hodinu.
- **Zdroje:**
  - Hirshkowitz M et al. Sleep Health 2015;1:40–43, [PMID 29073412](https://pubmed.ncbi.nlm.nih.gov/29073412/): 7–9 h pro 18–64 let, 7–8 h od 65.
  - Watson NF et al. (AASM/SRS) Sleep 2015;38:843–844: dospělí ≥ 7 h.
  - Ohayon M et al. Sleep Health 2017;3:6–19: znaky dobré kvality spánku jsou efektivita ≥ 85 %, usnutí do 30 min, bdění po usnutí do 20 min a nejvýš 1 probuzení delší než 5 min (u starších lidí mírnější hranice bdění).
  - Carskadon MA, Dement WC. *Normal Human Sleep: An Overview* (Principles and Practice of Sleep Medicine): u mladých dospělých je hluboký spánek 13–23 % a REM 20–25 %. Naše prahy 13 % a 20 % jsou dolní hranice těchto rozmezí.
  - Ohayon MM et al. Sleep 2004;27:1255–1273 (65 studií, 3 577 lidí): podíl hlubokého spánku a REM s věkem klesá, po 60 letech už klesá jen efektivita. Přesná čísla podle věku z tabulek studie zatím nemáme, proto prahy nepřizpůsobujeme věku.
  - Van Dongen HP et al. Sleep 2003;26:117–126: nedospání se sčítá.
  - Walsh NP et al. Br J Sports Med 2021;55:356–368 (expertní konsenzus): univerzální doporučení 7–9 h pro sportovce „pravděpodobně není ideální“, doporučuje individuální přístup, více příležitosti ke spánku při vysoké tréninkové zátěži a zdřímnutí 20–90 min. Podle toho přidáváme čas po náročném dni a se spánkovým dluhem.
  - Whoop: potřeba spánku = základ + dluh + zátěž − zdřímnutí (složky jsou v jejich API). Garmin Sleep Coach: věk, aktivita, historie spánku, zdřímnutí a HRV status, vždy 7–9 h. Ani jeden nezveřejňuje velikost jednotlivých přídavků; naše +15 min za HRV a čtvrtina dluhu jsou kalibrace.
  - Přesnost fází z hodinek je 60–85 % proti polysomnografii, proto mají fáze nejmenší váhu.
- **Proti konkurenci:** stejné vstupy jako Garmin Sleep Coach (věk, aktivita, historie spánku, zdřímnutí, HRV) i jeho rozmezí 7–9 h; navíc kritéria kvality spánku NSF, která Garmin ani Whoop nezveřejňují.

### 2.3 Celodenní zátěž 0–21

- **Výpočet:** čas ve čtyřech tepových zónách Google Health × váhy 2/3/4/5, tedy TRIMP podle Edwardse. Ověřeno v oficiálním discovery dokumentu Google Health API v4: typ `time-in-heart-rate-zone` má hodnoty `LIGHT`, `MODERATE`, `VIGOROUS`, `PEAK` a zóny jsou podle Karvonena z tepové rezervy (Fitbit: střední 40–59 %, intenzivní 60–84 %, špičková ≥ 85 % tepové rezervy). Pak `21 × (1 − e^(−load/225))` (`heartRateLoad`, `strainScore`). Bez zón se použije odhad z aktivní energie a aplikace to uvede.
- **Zdroje:**
  - Edwards S. *The Heart Rate Monitor Book.* 1993: součet minut v 5 zónách × 1–5.
  - Foster C et al. J Strength Cond Res 2001;15:109–115: session-RPE validované proti Edwardsově TRIMP.
  - Shcherbina A et al. J Pers Med 2017;7:3: chyba kalorií z hodinek 27–93 %, proto kalorie jen jako záloha.
- **Proti konkurenci:** Whoop počítá kardio zátěž z času v tepových zónách na stejné škále 0–21. My máme stejný princip a zveřejněné váhy. Svalová zátěž je u nás samostatný ukazatel (bod 2.4).
- **Limity:** Googlovy zóny odpovídají Edwardsovým zónám 2–5 jen přibližně (procenta tepové rezervy vs. maxima). Konstanta 225 je kalibrace škály.

### 2.4 Svěžest svalů

- **Výpočet:** únava každé svalové skupiny klesá exponenciálně. Časové konstanty jsou nastavené tak, aby běžný trénink nechal sval „zotavený“ (≥ 75 %) po zhruba 72 h u velkých svalů zapojených vícekloubovými cviky (stehna, hýždě, záda, hrudník) a po 48 h u ostatních. Série do selhání (RPE ≥ 9,5) mají zotavení o 30 % delší (`src/fitness-insights.js`).
- **Zdroje:**
  - Korak JA et al. Int J Exerc Sci 2015;8:85–96: po 48 h byla většina lidí do 1 opakování od výchozí hodnoty, u bench pressu a mrtvého tahu jen 60–70 %; doporučení 72 h pro vícekloubové cviky.
  - McLester JR et al. J Strength Cond Res 2003;17:259–273: svalová vytrvalost obnovená za 48 h.
  - Morán-Navarro R et al. Eur J Appl Physiol 2017;117:2387–2399: trénink do selhání prodlužuje zotavení přes 48 h.
- **Proti konkurenci:** Fitbod a Bevel mají podobný model zotavení svalů, ale metodu nezveřejňují. My navíc započítáváme kolo a běh do zátěže nohou.

### 2.5 Únava z vytrvalosti v posilovně a regenerační týden

- **Výpočet:**
  - Dávka v posilovně se řídí formou TSB (CTL − ATL) a ne poměrem akutní a chronické zátěže (`src/strength-generator.js`).
  - Regenerační týden pro všechny sporty nastane po týdnu ≥ 125 % udržovací zátěže (CTL × 7), po třech týdnech nad ní, nebo když 7denní průměr HRV před týdnem klesne pod osobní pásmo o víc než SWC (`src/week-planner.js`, `hrvWeekTrendDown`).
- **Zdroje:**
  - Impellizzeri FM et al. Int J Sports Physiol Perform 2020;15:907–913.
  - Impellizzeri FM et al. Sports Med 2021;51:581–592: poměr akutní a chronické zátěže (ACWR) nemá vlastní prediktivní hodnotu, proto ho nepoužíváme.
  - Plews 2012 a Javaloyes 2019 (viz 2.1) pro spouštěč z HRV.
  - Bell L et al. Sports Med Open 2023;9:87 (Delphi konsenzus k deloadu) a Front Sports Act Living 2022;4:1073223 (deload obvykle 5–7 dní každé 4–6 týdny).
- **Limity:** pravidla 125 % a „tři týdny“ jsou trenérská praxe, ne výsledek kontrolované studie. Pro vytrvalostní cyklus 3:1 jsme kontrolovanou studii nenašli. Spouštěč z HRV je individuální a podložený.

### 2.7 Týdenní cíl zátěže a kapacita tréninkového dne

- **Výpočet:** týdenní cíl je CTL × 7 + 5 % (`weekTargets` v `src/week-planner.js`). Kapacita dne bez zadaného času je tento cíl rozpočítaný na 5 tréninkových dní a převedený na minuty lehkého tréninku (kolo IF 0,7 = 49 TSS/h, běh IF 0,83 = 69 rTSS/h a o 20 % méně času kvůli vyšší mechanické zátěži). Pak úpravy podle spánku, TSB, připravenosti, regeneračního týdne a ladění formy (`capacityMinutes` v `src/cycling-coach-v2.js`). Když CTL už roste o víc než 8 bodů týdně, cíl i kapacita jen drží CTL × 7.
- **Odvození:** CTL je 42denní exponenciální průměr denní zátěže, takže týden na CTL × 7 kondici drží a +5 % ji zvedá asi o CTL/120 bodů za týden. To je výrazně pod 5–8 body týdně, které Joe Friel (TrainingPeaks) označuje za udržitelné; nad 8 hrozí přetížení. TSS = hodiny × IF² × 100 (Coggan).
- **Zdroje:** Friel J., TrainingPeaks: *Why Ramp Rate Is an Important Training Metric* (trenérské doporučení, ne recenzovaná studie). Allen & Coggan (TSS, CTL).
- **Proti konkurenci:** Garmin (Firstbeat) řídí zátěž poměrem akutní a chronické zátěže s optimem 0,8–1,4 a vzorec pro denní doporučení nezveřejňuje. TrainerRoad používá strojové učení nad dokončenými tréninky. Intervals.icu tréninky nepředepisuje. My máme veřejně odvozené pravidlo a stejné číslo v plánu týdne i v délce tréninku.
- **Limity:** 5 tréninkových dní je výchozí předpoklad. Modelem optimalizované plány (Banister, Busso) nejsou prospektivně ověřené.

### 2.8 Ověření indexu regenerace na vlastních datech

- **Endpoint:** `GET /app/api/recovery-validation?days=120` (`src/recovery-validation.js`). Pro každý tréninkový den spáruje ranní skóre regenerace s průběhem tréninku:
  - efficiency factor z Intervals.icu (výkon nebo tempo na tep) jako z-skóre v rámci sportu; očekávaná korelace je kladná,
  - RPE očištěné o intenzitu (reziduum regrese RPE na IF); očekávaná korelace je záporná.
- **Statistika:** u jednoho sportovce Pearsonovo r s 95% intervalem spolehlivosti (Fisherova transformace); verdikt „podporuje“ jen když interval nepřekročí nulu, pod 10 dní „málo dat“. Přes více sportovců korelace opakovaných měření (rmcorr; Bakdash JZ, Marusich LR. Front Psychol 2017;8:456), která používá jen variabilitu uvnitř člověka: `node scripts/recovery-validation-rmcorr.mjs a.json b.json …`.
- **Proč takhle:** výrobci své indexy nezávisle nevalidují. Whoop zveřejnil analýzu 389 profesionálních golfistů, kde složený Recovery sledoval výkon lépe než jednotlivé metriky. Tohle je náš ekvivalent na vlastních uživatelích. Doporučený další krok je smíšený model (výsledek ~ skóre centrované na osobu + zátěž + náhodný sklon pro uživatele) a srovnání s prostým z-skóre HRV, aby složený index prokázal přidanou hodnotu.

### 2.6 Kalorický cíl a vývoj váhy

- **Výpočet:**
  - Cíl je vyšší z očekávaného dne (Mifflin-St Jeor × aktivita − cíl + trénink) a průběžného rozpočtu z naměřené energie.
  - Tempo váhy je sklon lineární regrese všech vážení za 5 týdnů.
  - Korekce je podle energetické bilance: (skutečné − cílové tempo) × 7700 kcal/kg / 7, z toho polovina, nejvýš ±250 kcal, zaokrouhleno na 25 kcal. Uplatní se, když je tempo mimo pásmo cíle (`trendAdjustment`, `d1WeightTrend`).
- **Zdroje:**
  - Racette SB et al. Am J Physiol Endocrinol Metab 2012;302:E441–E448: příjem = výdej + změna zásob; regrese denních vážení je nejspolehlivější odhad změny zásob.
  - Hall KD et al. Lancet 2011;378:826–837: statické pravidlo 7700 kcal/kg přeceňuje dlouhodobý úbytek. Proto bereme polovinu a strop.
- **Proti konkurenci:** Garmin a Whoop berou výdej z hodinek. Ten má chybu přes 20 % a navíc nemá jednotný směr (O'Driscoll R et al. Br J Sports Med 2020;54:332–340). Naše smyčka podle váhy tuto systematickou chybu postupně opraví, podobně jako aplikace s adaptivním výdejem.

## Co zbývá

- **Výsledky ověření (bod 2.8):** nástroj je hotový, ale tvrzení „index předpovídá průběh tréninku“ lze použít až po spuštění na reálných datech (aspoň desítky tréninkových dní u více uživatelů).
- **Normy fází spánku podle věku:** přesná čísla z tabulek Ohayon 2004 jsme z prostředí nezískali; prahy fází proto nejsou věkově upravené.
- **Přídavky k potřebě spánku:** +15 min za nízké HRV a čtvrtina dluhu jsou naše kalibrace; Garmin ani Whoop své hodnoty nezveřejňují.
