# Plán: Hyposvepomoci — Interaktivní hypoteční průvodce (ČR)

## Kontext

Cíl je responzivní web, který laickou veřejnost provede hypotékou **od prvního rozhodnutí až po podpis smlouvy** — ne "Wikipedia o hypotékách + kalkulačka", ale **interaktivní průvodce**, kde je kalkulačka nástroj používaný v jednotlivých rozhodovacích bodech. Web musí být fakticky přesný podle aktuální legislativy (stav k 5. 9. 2026), s ověřitelnými zdroji, a připravený na dlouhodobou aktualizaci. Součástí je monetizace formou paywallu — s tím, že klientský paywall je pouze UX demo, ne bezpečnostní ochrana.

**Filozofie**: Datově řízený systém, ne statické články. Legislativa se mění (LTV má stále závazné hranice, DTI/DSTI už ne, investiční nemovitosti mají od 1. 4. 2026 přísnější doporučení) — proto všechna časově citlivá data žijí v centrální datové vrstvě, ne zadrátovaná v HTML.

---

## ⚠️ KRITICKÁ PRAVIDLA (předat Claude Code doslova)

```
CRITICAL:
1. Never hard-code current legal/regulatory values directly into UI components.
   All time-sensitive financial/legal values must come from a centralized data layer
   (data/*.json) with source URL, validFrom, verifiedAt and notes.

2. Never claim that client-side Base64/obfuscation/localStorage protects premium
   content. Phase-1 access-code gating is a UX/demo gate only, NOT a security mechanism.
   Premium data must NOT be shipped to the client before authorization in production.

3. Never state that a regulatory value is a "binding limit" (závazný limit) unless the
   current source explicitly confirms it. As of 2026: LTV is binding; DTI/DSTI are
   deactivated (only ČNB recommendations / obezřetnost thresholds).

4. Calculator is an orientační (indicative) tool. Always show the disclaimer that a
   bank's real amortization schedule may differ (úročení, zaokrouhlování, datum čerpání).
```

---

## Technologie

**Plain HTML + CSS + Vanilla JS** (bez build systému) pro UI, ale **modulární data a obsah od začátku**.

- **Proč plain**: Deployne se kamkoliv (GitHub Pages, Netlify, Vercel) bez konfigurace, laik/majitel edituje obsah bez frameworku.
- **Architektura připravená na růst**: UI je zatím single-page (kotvy + scroll), ale obsah a data jsou modulární tak, aby šlo později přejít na více stránek (`/kalkulacka`, `/refinancovani`, `/predcasne-splaceni` …) bez kompletního přepisu. Hranicí není počet řádků, ale obsahová struktura — web je fakticky malý obsahový portál.
- **Budoucí migrace**: Astro/Eleventy pokud bude potřeba pravých stránek a SSG.
- **CDN závislosti**:
  - **Chart.js 4.x** — grafy amortizace
  - **Google Fonts** — Inter (nadpisy) + Source Sans 3 (text) — plná podpora českých znaků

---

## Datová vrstva (základ celého webu)

```
data/
  regulatory.json    # ČNB limity, LTV/DTI/DSTI, typy nemovitostí
  tax.json           # daňové odpočty dle roku obstarání
  early-repayment.json # pravidla předčasného splacení
  banks.json         # (premium) nabídky bank
  glossary.json      # slovníček pojmů
content/
  legal/  concepts/  guides/  glossary/  calculators/
```

**Příklad `regulatory.json`:**
```json
{
  "ltv_owner_standard": {
    "value": 80, "unit": "%", "binding": true,
    "appliesTo": "vlastní bydlení",
    "validFrom": "2024-01-01", "source": "ČNB",
    "sourceUrl": "https://www.cnb.cz/...", "verifiedAt": "2026-09-05",
    "note": "Závazný limit LTV pro vlastní bydlení."
  },
  "ltv_owner_young": {
    "value": 90, "unit": "%", "binding": true,
    "appliesTo": "žadatel <36 let, vlastní bydlení",
    "validFrom": "2024-01-01", "source": "ČNB", "verifiedAt": "2026-09-05"
  },
  "ltv_investment": {
    "value": 70, "unit": "%", "binding": false,
    "appliesTo": "investiční nemovitost",
    "validFrom": "2026-04-01", "source": "ČNB doporučení", "verifiedAt": "2026-09-05"
  },
  "dsti_recommendation": {
    "value": 40, "unit": "%", "binding": false,
    "validFrom": "...", "source": "ČNB obezřetnost", "verifiedAt": "2026-09-05",
    "note": "DSTI není závazný limit; ČNB doporučuje zvýšenou obezřetnost nad 40 %."
  },
  "dti_recommendation": {
    "value": 8, "unit": "×", "binding": false, "verifiedAt": "2026-09-05"
  },
  "dti_investment": {
    "value": 7, "unit": "×", "binding": false,
    "validFrom": "2026-04-01", "verifiedAt": "2026-09-05"
  }
}
```

Každá hodnota nese: `value`, `binding`, `validFrom`, `source`, `sourceUrl`, `verifiedAt`, `note`. UI hodnoty **čte z JSON**, nikdy je nemá napsané natvrdo.

---

## Fact & Source System

Místo `<!-- VERIFY -->` komentářů: každé právní/číselné tvrzení v HTML je obalené a napojené na datovou vrstvu.

```html
<span class="fact" data-fact="ltv_owner_standard" data-verified="2026-09-05">80 %</span>
```

- JS při načtení projde `.fact` elementy, doplní hodnotu z `regulatory.json` a přidá tooltip/popover: "Ověřeno 5. 9. 2026 · Zdroj: ČNB".
- Rozlišení "závazný limit" vs. "doporučení" se řídí polem `binding` — text se generuje podle něj, aby nikdy nevzniklo nepřesné tvrzení.

**Tři vrstvy data-aktuálnosti** (zobrazené samostatně, ne jedno globální datum):
- **Zákonná data** — "Ověřeno DD. MM. RRRR"
- **Tržní data** (sazby bank) — "Ověřeno DD. MM. RRRR"
- **Edukační obsah** — "Revize DD. MM. RRRR"
- Nahoře web: "Stav informací: 5. září 2026".

---

## Struktura webu

### 0. Hero + User Journey (vstupní rozcestník)
Místo aby web začínal "Co je hypotéka", začne otázkou **"V jaké jste situaci?"** s dlaždicemi, které uživatele odscrollují na relevantní část:
- Teprve začínám
- Chci koupit nemovitost
- Už vybírám hypotéku
- Mám hypotéku
- Končí mi fixace
- Chci refinancovat

Tím se odbourá problém "obrovský text, nevím kde začít". Kalkulačka a průvodce jsou provázané.

### 1. Co je hypotéka
- Srozumitelné vysvětlení, rozdíl oproti spotřebitelskému úvěru a stavebnímu spoření
- Úvod do terminologie (jistina, úrok, anuita, fixace, LTV, DSTI/DTI)
- Vizuální diagram toku peněz

### 2. Jak na hypotéku krok za krokem (timeline)
1. Zjistěte, kolik si můžete dovolit
2. Naspořte vlastní zdroje (podle LTV — viz níže)
3. Vybírejte nemovitost (s pre-approval)
4. Porovnejte nabídky bank (min. 3–5)
5. Podejte žádost (checklist dokumentů)
6. Odhad nemovitosti — u bytů ve městech banky často dělají **online (desktop) odhad zdarma** z cenových map; laici zbytečně platí vlastního odhadce, jehož posudek banka nemusí akceptovat
7. Schválení a podpis smlouvy
8. Čerpání úvěru
9. Zápis zástavního práva — **zákonná ochranná lhůta: vklad může být povolen nejdříve po uplynutí 20 dnů** od odeslání informace o plombě; skutečná doba vyřízení bývá delší a v čase se mění (např. průměr červenec 2026 ≈ 22 dnů). Banka často uvolní peníze už na základě "plomby" (návrhu na vklad). Formulace čerpaná z datové vrstvy, ne natvrdo.
10. Splácení začíná

### 3. Podmínky a požadavky — Regulatorní model ČNB
Zásadní: přesné rozlišení závazné vs. doporučené (vše z `regulatory.json`).

**Regulatorní stav (2026):**
- **LTV — závazný limit**: 80 % vlastní bydlení, 90 % pro žadatele <36 let (vlastní bydlení)
- **DSTI — aktuálně NENÍ závazný limit** (ČNB doporučuje obezřetnost nad 40 %)
- **DTI — aktuálně NENÍ závazný limit** (ČNB doporučuje obezřetnost nad 8× čistého ročního příjmu)
- **Investiční nemovitosti (od 1. 4. 2026)**: doporučení LTV 70 %, DTI 7×

Přepínač **typ nemovitosti: vlastní bydlení / investiční** — mění posouzení i texty.

### 4. Bankovní realita — co banky opravdu posuzují
Rozděleno do praktických kategorií (ne obecné "co banky kontrolují"):
- **Příjem**: zaměstnanec, OSVČ, DPP/DPČ, krátké podnikání, příjmy z nájmu, bonusy/provize
- **Závazky**: kreditní karta, kontokorent, spotřebitelský úvěr, leasing, BNPL
- **Žadatel**: věk, počet dětí, spolužadatel, pracovní historie, registry (BRKI/NRKI, SOLUS)
- **Nemovitost**: byt, rodinný dům, družstevní byt, stavební pozemek, rekreační objekt, nemovitost v zástavě, nebytový prostor
- Potřebné dokumenty: checklist zaměstnanec vs. OSVČ

### 5. Úroky a fixace
- **5a. Co skutečně ovlivňuje sazbu hypotéky?** — řetězec: měnová politika → tržní sazby → náklady financování bank → marže + riziko klienta → nabídnutá sazba. **NEpoužívat zjednodušení "repo → PRIBOR → marže"**. PRIBOR jen jako vysvětlený pojem ve slovníčku (web ho nesmí automaticky tahat z ČNB a redistribuovat — komerční užití je omezené).
- **5b. Fixační období** (1, 3, 5, 7, 10, 15, 20 let) — pro/proti, rozhodovací framework
- **5c. Konec fixace** — banky počítají s leností klientů, vždy porovnat, okno pro refinancování/splacení bez sankce
- Tabulka typických spreadů mezi fixacemi

### 6. Na co si dát pozor (přejmenováno z "co banky neříkají")
Méně konfrontační, prakticky užitečné.
- **6a. Skryté poplatky**: odhad, vedení účtu, zpracování, pojištění
- **6b. Pojištění**: vinkulace majetkového pojištění (povinné), životní pojištění (nepovinné, banky tlačí, často předražené vs. externí)
- **6c. Časté chyby**: neporovnávání nabídek, ignorování RPSN, špatná volba fixace, půjčování maxima, opomenutí životních změn
- **6d. Checklist "Co si pohlídat ve smlouvě a nabídce"** (interaktivní, později premium produkt):
  ☐ úroková sazba ☐ RPSN ☐ podmínky zvýhodněné sazby ☐ pojištění ☐ účet u banky ☐ mimořádné splátky ☐ podmínky předčasného splacení ☐ sankce ☐ podmínky čerpání ☐ odhad ☐ podmínky změny fixace

### 7. Předčasné splacení (samostatná, přesná sekce)
**Nepoužívat univerzální claim "1 % / 50 000 Kč".** Realita je odstupňovaná a má výjimky bez náhrady. Vše z `early-repayment.json`.

**Interaktivní rozhodovací strom:**
```
Chci předčasně splatit
   → Je právě konec fixace? ANO → bez náhrady
                            NE ↓
   → Je bez fixace / v období bez fixace? ANO → specifický režim
                            NE ↓
   → Roční částečná splátka (zákonná možnost)? ANO → v limitu bez náhrady
                            NE ↓
   → Prodej nemovitosti, smlouva > 24 měsíců? ANO → specifický režim
                            NE ↓
   → Životní situace (zákonné případy)? ANO → bez náhrady
                            NE ↓
   → Obecný strop účelně vynaložených nákladů:
     0,25 % za každý rok zbývající do konce fixace, max. 1 %
     (a další zákonné stropy — čerpáno z datové vrstvy)
```
Odkaz na zdroje (MF ČR, zákon č. 257/2016 Sb. + novela účinná od 1. 9. 2024).

### 8. Refinancování
- Kdy se vyplatí, proces, náklady (nový odhad, nový zápis zástavního práva)
- Break-even pravidlo (napojeno na refinanční kalkulačku)
- Provázáno se sekcí 7 (předčasné splacení)

### 9. Daňové odpočty → interaktivní kalkulátor
Ne pouhý text. Kalkulátor z `tax.json`:
```
Zaplacené úroky za rok:   [ 120 000 Kč ]
Datum obstarání bytové potřeby: [ 2024 ]
→ Max. odpočitatelná částka: 150 000 Kč   (300 000 Kč do konce 2020, 150 000 Kč od 1. 1. 2021)
→ Uplatnitelný odpočet od základu daně: 120 000 Kč
```
**Kriticky jasně oddělit**: odpočet od základu daně ≠ daňová sleva ≠ vrácení celé částky. Lidé si často pletou 150 000 Kč odpočtu za 150 000 Kč zpět. Rozhoduje **datum obstarání bytové potřeby, ne datum smlouvy**.

### 10. Státní podpora bydlení — aktuálně dostupné programy
Přejmenováno z "SFPI půjčky do 36 let" (program Vlastní bydlení je archivován; podpora vlastnického bydlení FO zastavena). **Dynamický obsah dle stavu** (z datové vrstvy):
- Aktuálně otevřeno / Aktuálně uzavřeno / Pouze pro stávající smlouvy / Archivováno
- Tím web nezůstane s "mrtvým" programem.

### 11. Slovníček pojmů (z `glossary.json`)
Anuita, BRKI/NRKI, ČNB, DSTI, DTI, Fixace, Jistina, Katastr, LTV, PRIBOR, Refinancování, RPSN, Vinkulace, Zástavní právo, Plomba, atd.

### 12. Prémiový obsah — viz Monetizace

### Footer
- Disclaimer: "Slouží pouze k vzdělávacím účelům, nepředstavuje finanční poradenství."
- Tři vrstvy data-aktuálnosti, GDPR/cookie

---

## Kalkulačka — detailní návrh

### Přesnost a oddělení modelů
- **`calculator-core.js`** = čistý matematický model. `monthlyRate = annualRate / 12`, anuita. Deterministický, testovatelný.
- **(volitelně později) bank-realistic-model** = odlišná pravidla úročení/zaokrouhlení/data čerpání.
- Nahoře kalkulačky viditelný disclaimer: *"Orientační výpočet. Skutečný splátkový kalendář banky se může lišit v důsledku způsobu úročení, zaokrouhlování, data čerpání a dalších smluvních podmínek."*

### Vstupy — základní
- **Kupní cena** (CZK)
- **Odhadní hodnota nemovitosti** (CZK) — samostatné pole, defaultně = kupní cena
- **Vlastní zdroje** (CZK + % z ceny)
- **Výše úvěru** (auto = cena − vlastní zdroje, editovatelné)
- **Úroková sazba** (%, krok 0.01)
- **Doba splácení** (5–40 let)
- **Typ nemovitosti**: vlastní bydlení / investiční

**LTV se počítá vůči hodnotě zajištění (odhadu), NE automaticky vůči kupní ceně.** Např. cena 5 mil., odhad 4,6 mil., úvěr 4 mil. → LTV = 86,96 %. Toto je pro laika klíčová informace a musí být v UI vysvětleno.

**UX vstupy**: slider + textový input s maskou ("5 000 000 Kč"), na mobilu `type="text"` + `inputmode="numeric"` (ne `type="number"`), JS formátování.

**Sdílení přes URL**: parametry v query stringu (`?cena=5000000&uver=4000000&sazba=4.5`), předvyplnění při načtení, tlačítko "Zkopírovat odkaz" (lidé řeší hypotéku v páru).

### Vstupy — pokročilé (collapsible)
- Fixační období, očekávaná sazba po fixaci
- Mimořádná měsíční splátka, jednorázová mimořádná splátka (+ rok)
- Čistý měsíční příjem domácnosti, existující závazky (pro DSTI/DTI orientaci)

### Výstupy — metriky
- Měsíční splátka, Celkem zaplaceno, Zaplacené úroky, Poměr úroků k jistině
- **LTV** vs. hodnota zajištění, s indikátorem podle `regulatory.json` (respektuje typ nemovitosti a věk <36)
- **DSTI / DTI** — zobrazené jako **orientace, ne verdikt**:
  - "LTV: závazný limit — nad hranicí banka úvěr neposkytne"
  - "DSTI: aktuálně není závazný limit; ČNB doporučuje obezřetnost nad 40 %"
  - "DTI: aktuálně není závazný limit; obezřetnost nad 8×"
  - **NIKDY** "banka vám neschválí" u DSTI/DTI.

### Realistický rozpočet koupě (nová sekce kalkulačky)
Kolik peněz **reálně** potřebujete v den koupě — ne jen vlastní zdroje:
```
Kupní cena − Hypotéka = Vlastní zdroje
+ rezerva, + vybavení, + rekonstrukce, + poplatek katastr,
+ odhad, + právní servis, + pojištění
→ "Kolik potřebujete mít skutečně k dispozici"
```
Pro laika cennější než další graf.

### Hypoteční stres test (USP, přímo pod hlavní kalkulačkou)
```
Splátka dnes při X %:        ...
Co když sazba po fixaci bude: 3 % / 5 % / 6 % / 7 % / 8 % → nové splátky
→ "Dokázala by vaše domácnost splácet při sazbě +2 p. b.?"
```
Navazuje na obezřetnostní logiku ČNB.

### Grafy (Chart.js)
1. Složení splátky v čase (stacked area) — jistina vs. úrok
2. Zbývající dluh v čase (line) — s/bez mimořádných splátek, vyšrafovaná úspora
3. Kumulativní úroky (line) — s/bez, anotace úspory
4. Složení splátky (donut)
5. Dopad fixace / stres test (bar) — splátky při různých sazbách

### Amortizační tabulka
- Měsíc / Splátka / Úrok / Jistina / Zbývající dluh, seskupeno po rocích
- Export CSV (free)

### Doplňkové kalkulátory
- **"Kolik si mohu půjčit"** — příjem, závazky, doba, sazba → orientační max. výše (dle obezřetnosti, ne jako verdikt)
- **Simulátor změny sazby** (napojený na stres test)
- **Dopad mimořádné splátky** — ušetřené měsíce/úroky, nové datum splacení
- **Refinanční kalkulačka** (premium) — break-even

### Core funkce (`calculator-core.js`, bez DOM)
```
calculateMonthlyPayment(principal, annualRate, termMonths)
generateAmortizationSchedule(principal, annualRate, termMonths, extraMonthly, oneTimePayments)
calculateLTV(loanAmount, collateralValue)          // vůči odhadu, ne ceně
calculateDSTI(monthlyPayment, existingObligations, netMonthlyIncome)
calculateDTI(totalLoanAmount, annualNetIncome)
calculateRefinancingBreakeven(remainingBalance, remainingTerm, oldRate, newRate, costs)
calculateMaxLoan(netMonthlyIncome, existingObligations, annualRate, termMonths, thresholds)
stressTest(principal, remainingTerm, rateScenarios[])
serializeState(params) / deserializeState(queryString)
```
Formátování: `Intl.NumberFormat('cs-CZ', {style:'currency', currency:'CZK'})`. Debounce přes `requestAnimationFrame`.

### Automatické testy (`calculator-core.test.js`)
Ne ruční kontrola tří příkladů. Test suite + **invarianty**:
- Konkrétní hodnoty: anuita, 0 % úrok, vysoký úrok, 5 let, 40 let, mimořádná/jednorázová splátka, zaokrouhlení, poslední splátka
- **Invarianty** (nejdůležitější):
  - součet jistiny za celý úvěr = původní jistina
  - poslední zůstatek ≈ 0
  - celkem zaplaceno = jistina + úrok
- Matematika musí projít testy **před** napojením UI.

---

## Vizuální design

### Typografie
| Použití | Font | Váha | Velikost |
|---------|------|------|----------|
| H1 | Inter | 700 | 2.5rem |
| H2 | Inter | 600 | 2rem |
| H3 | Inter | 600 | 1.5rem |
| Body | Source Sans 3 | 400 | 1rem (16px) |
| Lead | Source Sans 3 | 400 | 1.125rem |
| Body line-height | — | — | 1.7 |

### Barevné schéma
```css
--color-primary:        #1B4965;  /* Tmavě modrá — nadpisy, nav, CTA */
--color-primary-light:  #2D6A8F;
--color-primary-dark:   #0D2B3E;  /* Footer */
--color-secondary:      #5FA8D3;  /* Odkazy, akcenty */
--color-secondary-light:#BEE9E8;
--color-success:        #2D6A4F;  /* OK / v mezích */
--color-warning:        #E9C46A;  /* Doporučení / obezřetnost */
--color-danger:         #D62828;  /* Překročený závazný limit */
--color-bg:             #F7F9FB;
--color-surface:        #FFFFFF;
--color-border:         #E2E8F0;
--color-text:           #1A1A2E;
--color-text-secondary: #4A5568;
```
Barevná logika indikátorů: **červená jen pro překročení závazného limitu (LTV)**; **žlutá pro doporučení/obezřetnost (DSTI/DTI)** — aby barva neříkala "zamítnuto" tam, kde limit není závazný.

### Layout
- Max šířka 1140px, breakpointy mobile <640 / tablet 640–1024 / desktop >1024
- Sticky nav (blur backdrop), karty (bílé, 1px border, 8px radius, jemný stín)
- Info boxy: barevný levý border (info/tip/obezřetnost/kritické)

---

## Monetizace

### Free (většina obsahu)
Veškerý edukační obsah, průvodce, hlavní kalkulačka se všemi grafy, stres test, realistický rozpočet, daňový kalkulátor, slovníček, LTV/DSTI/DTI orientace.

### Prémiový obsah — "Hypotéka Pro"
1. Podrobné porovnání bank (viz datová infrastruktura níže)
2. Refinanční kalkulačka
3. Porovnání scénářů side-by-side
4. Vyjednávací průvodce
5. Interaktivní checklist s trackingem pokroku
6. PDF export (přes `@media print`, ne klientské PDF knihovny)
7. Případové studie
8. Strategie fixace

**Porovnání bank vyžaduje datovou infrastrukturu** — ne statický text. `data/banks.json`:
```json
{ "lastUpdated": "...", "offers": [
  { "bank": "...", "product": "...", "fixation": 5, "rate": null,
    "conditions": "...", "maxLTV": 80, "note": "...", "verifiedAt": "..." }]}
```
Každá nabídka nese datum ověření. Bez procesu údržby se z webu rychle stane zdroj zastaralých finančních informací → v plánu explicitně: **je potřeba někdo, kdo data udržuje**; jinak sekci nezveřejňovat.

### Paywall — POUZE UX demo v Phase 1
- **Phase 1 je demo gate, NE bezpečnost.** Base64/hash v JS/localStorage NEchrání obsah — kdokoli stáhne JS, najde data, patchne, změní localStorage.
- Dvě čisté možnosti:
  - **(A) MVP soft gate** — vizuální overlay ("Prémiový obsah — [Odemknout]"), ale **prémiový obsah reálně není v HTML/JS klientu**. Kliknutí vede na budoucí platbu. Nic se nechrání, nic se necenzuruje falešně.
  - **(B) Produkční** — Browser → Auth → serverless API → ověření subscription → premium content. Stripe + Supabase/Netlify Functions (Phase 2).
- Plán říká explicitně: Phase 1 nesmí tvrdit, že chrání placený obsah.
- **PDF export**: `@media print` + tlačítko "Vytisknout / Uložit do PDF" (prohlížeč zvládne PDF; klientské knihovny jsou vizuálně nestabilní kvůli grafům/fontům).

---

## Struktura souborů
```
hyposvepomoci/
├── index.html
├── css/  main.css  sections.css  calculator.css  charts.css  paywall.css  print.css
├── js/
│   ├── app.js               # nav, scroll spy, user-journey rozcestník
│   ├── data-layer.js        # načtení data/*.json, fill .fact elementů, aktuálnost
│   ├── calculator-core.js   # čistá matematika + URL state (bez DOM)
│   ├── calculator-core.test.js
│   ├── calculator-ui.js     # DOM binding, formátování, URL sync, stres test, rozpočet
│   ├── charts.js
│   ├── tax-calculator.js
│   ├── early-repayment.js   # rozhodovací strom
│   └── paywall.js           # soft gate (demo), bez skutečného obsahu v klientu
├── data/  regulatory.json  tax.json  early-repayment.json  banks.json  glossary.json
├── content/  legal/ concepts/ guides/ glossary/ calculators/
├── assets/  favicon.svg  og-image.png
└── CLAUDE.md
```

---

## Pořadí implementace

**Fáze 0 — Datová a fact vrstva (základ, dělá se první)**
- `data/*.json` se strukturou (value, binding, validFrom, source, verifiedAt, note)
- `data-layer.js` — načtení JSON, naplnění `.fact` elementů, tooltip zdrojů, tři vrstvy aktuálnosti
- **Přesná verifikace všech čísel proti zdrojům k datu buildu** (ČNB, MF ČR, Finanční správa, ČÚZK)

**Fáze 1 — Základ + průvodce**
- `index.html` (user-journey rozcestník, sekce, footer), `main.css` + `sections.css`, `app.js`
- Edukační obsah — texty jako placeholder s přesnými odbornými nadpisy, finální texty dodá uživatel

**Fáze 2 — Kalkulačka (matematika první)**
- `calculator-core.js` + `calculator-core.test.js` → testy MUSÍ projít
- Až poté `calculator-ui.js`, `calculator.css`, LTV vůči odhadu, URL sdílení, realistický rozpočet, stres test

**Fáze 3 — Grafy + specializované kalkulátory**
- `charts.js`, `tax-calculator.js`, `early-repayment.js` (rozhodovací strom), amortizační tabulka + CSV

**Fáze 4 — Paywall (demo) + print**
- `paywall.js` soft gate (bez obsahu v klientu), `print.css` pro PDF

**Fáze 5 — Polish**
- Favicon, OG, SEO (Schema.org: FAQPage, FinancialProduct)
- Accessibility (ARIA, keyboard, kontrasty, focus, 44px cíle, reduced-motion)
- Lazy-load Chart.js, optimalizace fontů

---

## Doporučený postup předání Claude Code
1. **Inicializace**: "Zde je master-plan. Zatím nekóduj. Potvrď pochopení, vytvoř adresářovou strukturu a prázdné soubory."
2. **Fáze 0 zvlášť**: datová vrstva + verifikace čísel proti zdrojům.
3. **Iterace po fázích** dle plánu, texty jako placeholder.
4. **Kalkulačka**: nejdřív `calculator-core.js` + testy; UI se napojí až po zelených testech.

---

## Ověření (verifikace)
1. `data-layer`: `.fact` elementy se plní z JSON, tooltip zobrazuje zdroj + datum ověření; nikde není číslo natvrdo
2. Regulatorní logika: přepínač vlastní/investiční + věk <36 mění LTV práh; DSTI/DTI zobrazeny jako doporučení, ne verdikt
3. Kalkulačka: LTV počítáno vůči odhadu (cena 5M / odhad 4,6M / úvěr 4M → 86,96 %); anuita ověřená testy; URL sdílení funguje
4. `calculator-core.test.js`: všechny testy + invarianty zelené
5. Předčasné splacení: rozhodovací strom vrací správné větve; žádný univerzální "1 % / 50 000 Kč" claim
6. Daňový kalkulátor: 300k do 2020 / 150k od 2021 dle roku obstarání; jasně oddělený odpočet vs. sleva vs. vrácení
7. Paywall: soft gate nezobrazuje prémiový obsah v HTML/JS; kód netvrdí, že chrání placený obsah
8. Mobile: masky vstupů, hamburger, dotykové cíle 44px; Accessibility: tab nav, screen reader
