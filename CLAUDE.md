# CLAUDE.md — Hyposvepomoci

Interaktivní hypoteční průvodce pro laickou veřejnost (ČR). Plán projektu: [`PLAN.md`](./PLAN.md).

## Architektura
- **Plain HTML + CSS + Vanilla JS**, bez build systému. Žádný npm/webpack pro běh webu.
- Jediná externí závislost přes CDN: **Chart.js 4.x** (grafy) + **Google Fonts** (Inter, Source Sans 3).
- UI je zatím single-page (kotvy + scroll), ale **data a obsah jsou modulární** — připraveno na budoucí přechod na více stránek.

## Spuštění (lokálně)
Web čte `data/*.json` přes `fetch`, takže **musí běžet přes HTTP server**, ne z `file://`:
```
python3 -m http.server 8000   # pak otevřít http://localhost:8000
```

## Kritická pravidla (nikdy neporušovat)
1. **Žádná regulatorní/číselná hodnota natvrdo v HTML.** Vše jde přes datovou vrstvu (`data/*.json` → `js/data-layer.js`), aby neslo `source`, `verifiedAt` a typ informace (`confidence`).
2. **Nikdy netvrdit, že klientský paywall chrání obsah.** Fáze 1 paywall je pouze UX demo; prémiový obsah se do klienta neposílá před autorizací.
3. **Nikdy neoznačit hodnotu za „závazný limit“, pokud to zdroj nepotvrzuje.** Stav 2026: LTV závazný; DTI/DSTI deaktivované (jen doporučení ČNB).
4. **Kalkulačka je orientační.** Vždy zobrazit disclaimer, že skutečný splátkový kalendář banky se může lišit.

## Designový princip
Každá informace odpovídá nejen na „Co to je?“, ale i „Co to pro mě znamená?“ a „Co dál?“.
Typy informace: 🟢 ZÁKON / 🔵 DOPORUČENÍ / 🟣 PRAKTICKÁ RADA (pole `confidence`).
Tři pohledy u klíčových výstupů: 🏦 banka / ⚖️ regulace / 🧠 vy.

## Datová vrstva
- `data/regulatory.json` — LTV/DTI/DSTI, katastr; každý fakt: `value, unit, binding, confidence, validFrom, source, sourceUrl, verifiedAt, note, means, next`.
- `data/tax.json` — daňové odpočty dle roku obstarání bytové potřeby.
- `data/early-repayment.json` — pravidla + rozhodovací strom předčasného splacení.
- `data/sfpi.json` — státní programy (dynamický stav).
- `data/glossary.json` — slovníček (dvě úrovně: `short`, `deep`).
- `data/banks.json` — PREMIUM, záměrně prázdné (nezveřejňovat bez procesu aktualizace).

Fakty se do HTML vkládají přes `<span class="fact" data-fact="klíč"></span>`; `js/data-layer.js` je naplní a přidá tooltip + štítek typu informace. Volitelné atributy: `data-part="means|next|note"`, `data-badge="false"`.

## Ověřování faktů
Všechna čísla mají `verifiedAt`. Před publikací a periodicky ověřovat proti: ČNB (cnb.cz), Finanční správa (financnisprava.cz), MF ČR (mfcr.cz), ČÚZK (cuzk.cz), SFPI (sfpi.cz).

## Fáze vývoje (viz PLAN.md)
0. Datová a fact vrstva ← hotovo
1. Základ + průvodce + designový princip
2. Kalkulačka (matematika první, s testy)
3. Grafy + rozhodovací nástroje
4. Paywall (demo) + print
5. Polish (SEO, accessibility, výkon)
