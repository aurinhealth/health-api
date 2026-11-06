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

- **Výpočet:** dvojitá progrese. Všechny pracovní série na horní hranici rozsahu opakování nebo s lehkým RPE posunou váhu o krok nahoru. Krok zpět přijde, když pod rozsah spadne první série nebo aspoň polovina sérií; u hlavního cviku i selhání (RPE ≥ 9,5) v první sérii. Selhání s opakováními v rozsahu váhu jen podrží. Cvik po 4 a více sériích na stejný sval (série pomocného svalu za polovinu) se porovnává s posledním tréninkem na podobném místě; bez takového tréninku doplňkový cvik váhu jednou podrží i 3 opakování pod rozsahem. (`src/strength-intelligence.js`, `progressionDecision`, `priorMuscleSets`)
- **Zdroj (pořadí a selhání):** Simão R et al. *Exercise order in resistance training.* Sports Med 2012;42:251–265, doi:10.2165/11597240-000000000-00000. Refalo MC et al. *Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis.* Sports Med 2023;53:649–665, doi:10.1007/s40279-022-01784-y.
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

- **Výpočet:** posilovna ubere objem při velké vytrvalostní únavě (forma TSB), nízké regeneraci nebo blízké klíčové jízdě. Nohy šetří, když je náročná nebo dlouhá jízda dnes či zítra, po velkých 48 hodinách nebo při TSB ≤ −25; jízda naplánovaná na dnes, která už je odjetá, se nepočítá jako klíčová jednotka před sebou. Šetřené nohy mají nejvýš 2 pracovní série na cvik s obvyklou vahou a rezervou 2–3 opakování a váha dál roste dvojitou progresí (`src/strength-generator.js`, audit 2026-11-06, bod 6.2).
- **Zdroje:** Wilson JM et al. *Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises.* J Strength Cond Res 2012;26:2293–2307 (21 studií, 422 effect size). Hypertrofie: samotná síla ES 1,23, kombinace 0,85; síla 1,76 proti 1,44; výkon 0,91 proti 0,55. Interferenci působil běh, ne kolo, a rostla s frekvencí a délkou vytrvalostního tréninku. Robineau J et al. *Specific training effects of concurrent aerobic and strength exercises depend on recovery duration.* J Strength Cond Res 2016;30:672–683 (0 h pauza nejhorší, 24 h nejlepší, doporučení aspoň 6 h). Schumann M et al. *Compatibility of concurrent aerobic and strength training for skeletal muscle size and function.* Sports Med 2022;52:601–612, doi:10.1007/s40279-021-01587-7 (43 studií: hypertrofie ani maximální síla se nesnižují, výbušnost ano, hlavně ve stejném tréninku). Rønnestad BR et al. *Effect of heavy strength training on thigh muscle cross-sectional area, performance determinants, and performance in well-trained cyclists.* Eur J Appl Physiol 2010;108:965–975 (těžká posilovna nohou cyklistům pomáhá).
- **Co tvrdit:** princip je podložený a konkurence ho nemá. Konkrétní prahy (TSB −25, koeficienty dávky) jsou naše kalibrace, ne výsledek studie.

## 2. Funkce přepracované podle literatury

### 2.1 Index regenerace (jeden pro aplikaci i trenéry)

- **Výpočet:** `src/recovery-model.js`, `recoveryReadiness`.
  - HRV (50 %) jako lnRMSSD proti průměru a SD předchozích 60 dní.
  - Klidový tep (25 %) proti stejné baseline.
  - Spánek (25 %) jako procento potřeby spánku.
  - Každá složka: osobní průměr = 70, −1 SD = 50, −2 SD = 30. Celkem 0–100; zelená ≥ 67, žlutá 34–66, červená < 34.
  - Trend: 7denní průměr lnRMSSD pod průměrem o víc než nejmenší významnou změnu (0,5 SD).
  - Dech ve spánku o ≥ 1 dech/min a 2 SD nad baseline ubere 10 bodů.
  - Teplota kůže ve spánku o ≥ 0,5 °C a zároveň 2 noční SD nad 30denní baseline Google Health ubere 10 bodů (Google Health typ `daily-sleep-temperature-derivations`).
  - Potřebuje 14 předchozích měření.
  - HRV a klidový tep se porovnávají jen se dny stejného zdroje (Apple SDNN, Google RMSSD, Intervals.icu). Nový zdroj s méně než 14 dny převezme baseline jiného zdroje, pokud se oba aspoň 5 dní překrývají: posun je průměrný rozdíl ve dnech překryvu (ln HRV, tepy/min). Dokud nový zdroj nemá 14 vlastních dní, je číslo orientační (`provisional`, `sourceBaseline`). Bez překryvu HRV nového zdroje čeká na 14 vlastních dní a klidový tep se porovná s průměrem všech zdrojů (`restingHRMixed`); i takové číslo je orientační.
  - Dech ve spánku stejně: jen proti dnům stejného zdroje (`respirationSource`), s převzetím při překryvu. Bez něj nový zdroj dech nehodnotí, dokud nemá 14 nocí, protože jiné hodinky můžou ukazovat o 1 dech/min víc.
  - Trend HRV pro týden volna (`hrvWeekTrendDown`) a nízký status HRV pro potřebu spánku (`hrvStatusLow`) berou jen jeden zdroj: týden volna zařízení s nejvíc ranními měřeními v týdnu před ním (Intervals.icu jen když má víc rán než všechna zařízení dohromady, protože může míchat dvoje hodinky), status HRV zdroj nejnovějšího rána.
  - Noc: hlavní noc dne je nejdelší spánek (3 h a víc). Když domovský zdroj zachytil jen úlomek pod 3 h a jiné zařízení celou noc, platí ta delší (jen spánek; HRV a klidový tep zůstávají u domovského zařízení, `src/source-priority.js`). Noc pod 3 h se započítá a připravenost má nejvýš horní hranici žluté (66) se štítkem „krátká noc“. Když noc chybí a hodinky jinak noci zaznamenávají (aspoň jedna za 14 dní), připravenost nemá číslo: probdělá noc a hodinky na stole vypadají stejně. HRV a klidový tep se ukážou dál. Bez jakýchkoli nocí (spánek se neměří) zůstává číslo z HRV a tepu (`src/readiness.js`, `shortNight`, `withoutNight`). Zdroj: Craven J et al. Sports Med 2022;52:2669–2690, [PMC9584849](https://pmc.ncbi.nlm.nih.gov/articles/PMC9584849/): akutní ztráta spánku sníží výkon o 7,6 %.
  - Dnes, Zdraví, kouč kola a běhu, kouč posilovny i revize dne berou číslo z jedné funkce se stejnými vstupy: 90 dní wellness, spánek za 30 dní, cíl spánku z profilu, zátěž předchozího dne a ranní pocit (`src/readiness.js`, `readinessFor`).
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
  - Potřeba spánku (`sleepNeedFor`): 8 h (od 65 let 7,5 h); po zátěži dne ≥ 14 o 15 min a po ≥ 18 o 30 min víc; při nízkém HRV statusu (7denní lnRMSSD pod baseline o víc než SWC) o 15 min; se spánkovým dluhem o čtvrtinu dluhu, nejvýš 30 min. Zdřímnutí (označené zařízením jako `nap`, nebo spánek pod 3 h začatý mezi 9:00 a 20:00 místního času) potřebu sníží; krátká noc není zdřímnutí, zvýší dluh. Výsledek vždy 7–9 h.
  - Index: délka proti potřebě (50 bodů; nula při polovině potřeby, plný počet při splněné potřebě); kvalita (35): když zařízení hlásí dobu usnutí a bdění, pak efektivita od 85 % (20), usnutí do 30 min (7,5) a bdění po usnutí do 20 min (7,5), jinak jen efektivita (35); podíl hlubokého spánku ≥ 13 % a REM ≥ 20 % (15). Bez fází se přepočítá.
  - Dluh: součet nedospání za 7 dní včetně zdřímnutí; delší den spánku splatí nejvýš hodinu.
  - Noc z Intervals.icu nemá čas v posteli, takže vlastní index spočítat nejde; pak se ukáže skóre spánku ze zařízení (`sleepScore`), pokud ho Intervals.icu má (`sleepIndexFor`).
  - Apple Health: noc začíná a končí vzorky „v posteli“, pokud je iPhone zapsal, takže efektivita i doba usnutí odpovídají skutečnosti. Dech a SpO₂ ze spánku patří ke dni probuzení (vzorek od 15:00 počítá k dalšímu dni).
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
- **Cíl zátěže na den** (`strainTarget` v `src/app-today.js`): střed podle připravenosti (50 → 10, 72 → 12,6, 90 → 14,8), plán dne ho táhne napůl k zátěži plánu, spánkový dluh ubere až 2, žlutá připravenost ho omezí na 12 a červená na 6, ±1,5 kolem středu. Den volna (nejvýš 6,5) platí jen tehdy, když plán existuje (běžící tréninkový plán v Aurinu, plán posilovny od včerejška do zítřka, nebo tréninky naplánované či splněné včera, dnes nebo zítra) a dnešek je v něm prázdný. U minulého dne Dnes okolní dny nečte, platí jen jeho vlastní plán. Bez plánu se cíl řídí připraveností a horní hranice nesmí přesáhnout obvyklý den: 80. percentil denní zátěže za posledních 28 dní, počítané jako na Dnes (tepové zóny, nebo TSS dne z Intervals.icu a kroky; `usualStrain`), nikdy pod 8 jako den volna. U nového sportovce s méně než 14 takovými dny nejvýš 12. Text „no plan · not above your usual volume“, žádný poměr akutní a chronické zátěže. Je to odhad, ne předpověď.
- **Zdroje k cíli:** WHOOP Strain Target funguje i bez plánu, výchozí záměr je udržet kondici. WHO 2020 (Bull FC et al., Br J Sports Med 2020;54:1451–1462): 150–300 min středně intenzivní aktivity týdně, takže „den volna“ každý den bez plánu by šel proti tomu. Strop podle obvyklé zátěže má jen slabou oporu: Nielsen RØ et al., JOSPT 2014 (nárůst nad 30 % za 2 týdny, HR 1,59, nesignifikantní).

### 2.3a Zátěž posilovny a tréninky jen z hodinek (CTL)

- **Výpočet:** `src/training-load.js`.
  - Posilovna: session-RPE, tedy RPE × minuty × 0,1 (`SRPE_SCALE`). Hodina při RPE 6 = 36 (dřívější pevná hodnota), při RPE 10 = 60. Minuty se odhadnou ze zapsaných sérií stejně jako v plánovači posilovny (`strength-timing.js`), nebo se vezme délka tréninku z hodinek. RPE je průměr pracovních sérií (`strength_sets.rpe`), jinak hodnocení dne od sportovce. Bez RPE rozhoduje objem: kg × opakování / 250 (`VOLUME_PER_LOAD`), v mezích RPE 3 až 10 pro danou délku. Bez RPE i objemu RPE 6.
  - S připojeným Intervals.icu zůstává jeho CTL základem a přičtou se tréninky, které má jen hodinky (Apple Health, Google Health). Stejný trénink se pozná podle začátku do 10 min a stejného sportu; tréninky starší než první aktivita Intervals.icu v databázi se nepřičítají.
- **Zdroje:** Foster C et al. J Strength Cond Res 2001;15:109–115 (session-RPE).
- **Limity:** konstanty 0,1 a 250 jsou kalibrace na dřívější hodnotu 36 za běžnou hodinu, ne publikovaný převod na TSS.

### 2.4 Svěžest svalů

- **Výpočet:** únava každé svalové skupiny klesá exponenciálně. Časové konstanty jsou nastavené tak, aby běžný trénink nechal sval „zotavený“ (≥ 75 %) po zhruba 72 h u velkých svalů zapojených vícekloubovými cviky (stehna, hýždě, záda, hrudník) a po 48 h u ostatních. Série do selhání (RPE ≥ 9,5) mají zotavení o 30 % delší (`src/fitness-insights.js`).
- **Zdroje:**
  - Korak JA et al. Int J Exerc Sci 2015;8:85–96: po 48 h byla většina lidí do 1 opakování od výchozí hodnoty, u bench pressu a mrtvého tahu jen 60–70 %; doporučení 72 h pro vícekloubové cviky.
  - McLester JR et al. J Strength Cond Res 2003;17:259–273: svalová vytrvalost obnovená za 48 h.
  - Morán-Navarro R et al. Eur J Appl Physiol 2017;117:2387–2399: trénink do selhání prodlužuje zotavení přes 48 h.
- **Proti konkurenci:** Fitbod a Bevel mají podobný model zotavení svalů, ale metodu nezveřejňují. My navíc započítáváme kolo a běh do zátěže nohou.

### 2.4a Svaly na Tréninku (kdy jsou zase odpočaté)

- **Výpočet:** `src/muscle-fatigue.js`, `GET /app/api/muscles`. Svaly jsou ty z katalogu cviků (`muscle` v `strength-generator.js`). Jednotka je jedna těžká série (RPE 8) daného svalu: RPE 6 se počítá napůl, RPE 10 jedenapůlkrát; svaly, které pomáhají (tabulka `SECONDARY` podle pohybového vzoru, např. dřep → hýždě 0,5 a vnitřní stehna 0,4), dostanou svůj podíl. Kolo, běh a chůze se počítají jen jako odhad: tréninková zátěž × podíl svalu jako v bodě 2.4, děleno 10, kolo na 70 % (koncentrická práce). Únava klesá exponenciálně s časovými konstantami z bodu 2.4. Sval je odpočatý, když zbývá méně než 1,75 série; to po běžném tréninku 4–6 sérií vychází na 48–72 h u stehen, hýždí a zadních stehen, 36–53 h u malých svalů, nejvýš 96 h. Den posilovny končí podle tréninku z hodinek, jinak posledním uložením série, jinak v 18:00.
- **Limity:** konstanty 1,75 a podíly pomocných svalů jsou kalibrace, ne publikované hodnoty. Zátěž nohou z kola a běhu je hrubý odhad a aplikace ho tak označí (≈).

### 2.5 Únava z vytrvalosti v posilovně a regenerační týden

- **Výpočet:**
  - Dávka v posilovně se řídí formou TSB (CTL − ATL) a ne poměrem akutní a chronické zátěže (`src/strength-generator.js`).
  - Regenerační týden pro všechny sporty nastane po týdnu ≥ 125 % udržovací zátěže (CTL × 7), po třech týdnech nad ní, nebo když 7denní průměr HRV před týdnem klesne pod osobní pásmo o víc než SWC (`src/week-planner.js`, `hrvWeekTrendDown`).
- **Zdroje:**
  - Impellizzeri FM et al. Int J Sports Physiol Perform 2020;15:907–913.
  - Impellizzeri FM et al. Sports Med 2021;51:581–592: poměr akutní a chronické zátěže (ACWR) nemá vlastní prediktivní hodnotu, proto ho nepoužíváme k předpovědi rizika ani k řízení dávky. Aplikace a kouč ho ukazují jen slovy jako popis týdne: „Posledních 7 dní vs. obvyklých 28“ výrazně pod (< 0,7), pod (0,7–0,9), obvyklá (0,9–1,15), nad (1,15–1,5), výrazně nad (> 1,5); číslo poměru, „sweet spot“ ani riziko se neukazují (`src/workload-ratio.js`, Today audit D4). Hranice jsou naše popisné, ne výsledek studie.
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

### 2.9 Sauna v Aktivitě dne a v Regeneraci

- **Pravidlo:** sauna je zátěž srdce a oběhu, ne odpočinek. Z nabídky zmizí při statusu Nemoc nebo Zranění, při jediném signálu z noci (zvýšená teplota zápěstí nebo kůže, zvýšený dech ve spánku), při alkoholu včera nebo dnes (zaškrtnutý v deníku, pivo či víno v pití nebo nápoj s alkoholem v jídelníčku; sportovcovo ✕ v deníku má přednost), při Nemoci zaškrtnuté v deníku včera nebo dnes a do 72 h po zranění zapsaném v deníku (`saunaSigns` v `src/coach-pick.js`, `saunaRisks` v `src/journal-store.js`). V červený den je první volba Volno s procházkou a sauna smí být nanejvýš druhá. Text důvodu nejmenuje příčinu („Sauna adds load, so not today“). Zpětná vazba kouče po tréninku dostane jen příznak `saunaOff` a saunu pak nezmíní.
- **Klidový tep sám o sobě** (aspoň 2 obvyklé odchylky nad obvyklou hodnotou) saunu taky vyřadí. Je to opatrná volba bez přímého důkazu: sauna je zátěž oběhu a vyšší klidový tep často provází alkohol, horko nebo náročný trénink.
- **Zdroje:** Hannuksela ML, Ellahham S. Am J Med 2001;110:118–126 (alkohol a sauna: hypotenze, arytmie). Kenttämies A, Karkola K. J Forensic Sci 2008;53:724–729 (úmrtí v sauně, asi polovina pod vlivem alkoholu). Sports Medicine Australia, „No HARM“ 48–72 h po poranění měkkých tkání (bez tepla). AOK: zátěž srdce v sauně je srovnatelná s mírným tréninkem.
- **Limity:** jde o konzervativní pravidla, ne o hodnocení zdraví. Aurin není zdravotnický prostředek.

### 2.6 Kalorický cíl a vývoj váhy

- **Výpočet:**
  - Cíl je vyšší z očekávaného dne (Mifflin-St Jeor × aktivita − cíl + trénink) a průběžného rozpočtu z naměřené energie.
  - Tempo váhy je sklon lineární regrese všech vážení za 5 týdnů.
  - Korekce je podle energetické bilance: (skutečné − cílové tempo) × 7700 kcal/kg / 7, z toho polovina, nejvýš ±250 kcal, zaokrouhleno na 25 kcal. Uplatní se, když je tempo mimo pásmo cíle (`trendAdjustment`, `d1WeightTrend`).
- **Zdroje:**
  - Racette SB et al. Am J Physiol Endocrinol Metab 2012;302:E441–E448: příjem = výdej + změna zásob; regrese denních vážení je nejspolehlivější odhad změny zásob.
  - Hall KD et al. Lancet 2011;378:826–837: statické pravidlo 7700 kcal/kg přeceňuje dlouhodobý úbytek. Proto bereme polovinu a strop.
- **Proti konkurenci:** Garmin a Whoop berou výdej z hodinek. Ten má chybu přes 20 % a navíc nemá jednotný směr (O'Driscoll R et al. Br J Sports Med 2020;54:332–340). Naše smyčka podle váhy tuto systematickou chybu postupně opraví, podobně jako aplikace s adaptivním výdejem.

### 2.10 Klidový tep nad obvyklým rozmezím (karta „Dnes se hodí lehčí den“)

- **Práh zátěže:** klidový tep aspoň 2 obvyklé odchylky nad obvyklou hodnotou 2 noci po sobě, nebo 1 noc a zároveň HRV pod svým obvyklým rozmezím (`restingHRAbove` v `src/night-check.js`). Jen proti vlastnímu obvyklému rozmezí zdroje (14 nocí z těch samých hodinek): s rozmezím převzatým z jiných hodinek (nové hodinky, `restingHRMixed` nebo provizorní) se signál nespouští, protože by posun nového zařízení četl jako vzestup.
- **Text:** „Resting heart rate is above your usual range. Alcohol, heat, a late meal, stress or hard training can do this.“ Karta nabízí lehčí den (stejná výměna jako u ostatních nočních hodnot). Nikdy nepíše „abnormal“, nemoc ani infekci.
- **Proč dvě noci:** klidový tep je u jednotlivce stabilní, ale pětina lidí má aspoň jeden týden s výkyvem ≥ 10 tepů/min (Quer G et al., PLoS One 2020;15:e0227709), takže jedna noc dává falešné poplachy. Změny tepu a HRV dávají smysl jen spolu s dalšími znaky přetížení (Bosquet L et al., Br J Sports Med 2008). Alkohol zvyšuje tep v noci v závislosti na dávce (Pietilä J et al., JMIR Ment Health 2018). Horko zvyšuje tep při stejné zátěži (Racinais S et al., Scand J Med Sci Sports 2015, konsenzus k tréninku v horku).
- **Limity:** je to práh zátěže pro úpravu tréninku, ne hodnocení zdraví.

## Co zbývá

- **Výsledky ověření (bod 2.8):** nástroj je hotový, ale tvrzení „index předpovídá průběh tréninku“ lze použít až po spuštění na reálných datech (aspoň desítky tréninkových dní u více uživatelů).
- **Normy fází spánku podle věku:** přesná čísla z tabulek Ohayon 2004 jsme z prostředí nezískali; prahy fází proto nejsou věkově upravené.
- **Přídavky k potřebě spánku:** +15 min za nízké HRV a čtvrtina dluhu jsou naše kalibrace; Garmin ani Whoop své hodnoty nezveřejňují.
