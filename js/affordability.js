/*
 * affordability.js — Režim B: „Teprve hledám nemovitost" (Fáze P1)
 *
 * Hlavní produktová funkce: z příjmu, závazků, vlastních zdrojů a rezervy spočítá,
 * jak drahou nemovitost si člověk může dovolit (tři úrovně), najde hlavní
 * omezení (bottleneck engine), vykreslí personalizovanou hypoteční kartu
 * a „Jak jsme k tomu došli". Výsledky jsou modelové/orientační, ne verdikt banky.
 *
 * Vlastní zdroje lze doplnit z dalších zdrojů financování (dar, půjčka od rodiny,
 * spotřebitelský úvěr, druhá nemovitost do zástavy). Kalkulačka počítá i se splátkou
 * dalších úvěrů (zátěž DSTI) a upozorní, když splátky úvěrů překročí zdravou mez.
 *
 * Také řídí přepínač režimů A/B v sekci kalkulačky.
 */
(function () {
  "use strict";
  var C = window.HypoCalc;
  var TX_COST_RATE = 0.03;
  var STRESS_PB = 2; // stres +2 p.b.
  // Orientační parametry spotřebitelského úvěru pro odhad splátky, když ji uživatel nezadá.
  var CONSUMER_RATE = 9;      // % p.a.
  var CONSUMER_TERM_M = 84;   // 7 let

  var INITIAL_SEARCH = window.location.search; // snapshot dřív, než kterýkoli modul přepíše URL
  var DEFAULTS = {
    prijem: 60000, zavazky: 0, uspory: 800000, rezerva: 150000, mlady: false, typ: "vlastni", doba: 30, sazba: 5.0, osoby: 2,
    // Další zdroje financování — přepínače + částky.
    src_dar: false, dar_castka: 0,
    src_rodina: false, rodina_castka: 0, rodina_splatka: 0,
    src_spotreb: false, spotreb_castka: 0, spotreb_splatka: 0,
    src_zastava: false, zastava_hodnota: 0
  };
  var state = {};
  var root, rafId;

  var TIERS = [
    { id: "max", label: "Orientační maximum", dsti: 45, note: "Na hraně obezřetnosti. Malý prostor pro chyby." },
    { id: "rozumny", label: "Rozumný rozpočet", dsti: 40, note: "Doporučená obezřetnost ČNB." },
    { id: "komfort", label: "Komfortní rozpočet", dsti: 35, note: "Větší finanční rezerva každý měsíc." }
  ];

  // Definice dalších zdrojů financování.
  var SOURCES = [
    { id: "dar", toggle: "src_dar", label: "Dostanu dar", hint: "Peníze od rodiny/blízkých, které nemusíte vracet. Přidají se k vlastním zdrojům, žádná splátka.",
      fields: [{ k: "dar_castka", label: "Výše daru" }] },
    { id: "rodina", toggle: "src_rodina", label: "Půjčka od rodiny", hint: "Půjčka od blízkých se splátkovým kalendářem. Přidá hotovost, ale měsíční splátka zatíží rozpočet.",
      fields: [{ k: "rodina_castka", label: "Výše půjčky" }, { k: "rodina_splatka", label: "Měsíční splátka", hint: "Kolik rodině měsíčně splácíte. Bezúročná půjčka bez pevných splátek = 0." }] },
    { id: "spotreb", toggle: "src_spotreb", label: "Spotřebitelský úvěr", hint: "Úvěr z banky/nebankovky. Banka jeho splátku započítá do vašich závazků (DSTI).",
      fields: [{ k: "spotreb_castka", label: "Výše úvěru" }, { k: "spotreb_splatka", label: "Měsíční splátka", hint: "Necháte-li prázdné, odhadneme ji orientačně (9 % p.a., 7 let)." }] },
    { id: "zastava", toggle: "src_zastava", label: "Druhá nemovitost do zástavy", hint: "Další nemovitost jako zajištění — rozšíří základnu pro LTV. Nepřidává hotovost.",
      fields: [{ k: "zastava_hodnota", label: "Hodnota druhé nemovitosti" }] }
  ];

  function parseNum(v) { var n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
  function fmtInt(n) { try { return new Intl.NumberFormat("cs-CZ").format(Math.round(n)); } catch (e) { return String(Math.round(n)); } }
  function fmtCZK(n) { try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Math.round(n)); } catch (e) { return fmtInt(n) + " Kč"; } }

  function reg(key, fb) {
    var d = window.HypoData && window.HypoData.data && window.HypoData.data.regulatory && window.HypoData.data.regulatory.facts;
    if (d && d[key] && typeof d[key].value === "number") return d[key].value;
    var f = window.HypoData && window.HypoData.getFact && window.HypoData.getFact(key);
    return f && typeof f.value === "number" ? f.value : fb;
  }
  function maxLtv() {
    if (state.typ === "investice") return reg("ltv_investment", 70);
    if (state.mlady) return reg("ltv_owner_young", 90);
    return reg("ltv_owner_standard", 80);
  }
  function dstiThr() { return reg("dsti_recommendation", 40); }
  function dtiThr() { return state.typ === "investice" ? reg("dti_investment", 7) : reg("dti_recommendation", 8); }

  /* --- Agregace dalších zdrojů financování --- */
  function consumerPayment() {
    if (state.spotreb_splatka > 0) return state.spotreb_splatka;
    if (state.spotreb_castka > 0) return C.calculateMonthlyPayment(state.spotreb_castka, CONSUMER_RATE, CONSUMER_TERM_M);
    return 0;
  }
  function funding() {
    var extraCash = 0, extraDebt = 0, collateral = 0;
    if (state.src_dar) extraCash += state.dar_castka || 0;
    if (state.src_rodina) { extraCash += state.rodina_castka || 0; extraDebt += state.rodina_splatka || 0; }
    if (state.src_spotreb) { extraCash += state.spotreb_castka || 0; extraDebt += consumerPayment(); }
    if (state.src_zastava) collateral += state.zastava_hodnota || 0;
    return { extraCash: extraCash, extraDebt: extraDebt, collateral: collateral };
  }

  /* --- Stavba vstupů --- */
  function moneyField(id, label, hint) {
    return '<div class="field"><label for="aff-' + id + '">' + label + '</label>' +
      (hint ? '<span class="field__hint">' + hint + '</span>' : '') +
      '<div class="field__input"><input id="aff-' + id + '" data-aff-money data-key="' + id + '" type="text" inputmode="numeric" autocomplete="off"><span class="field__suffix">Kč</span></div></div>';
  }

  function sourceBlock(src) {
    var fields = src.fields.map(function (f) { return moneyField(f.k, f.label, f.hint); }).join("");
    return '<div class="aff-src" data-aff-src="' + src.id + '">' +
      '<div class="aff-src__head">' +
        '<span class="aff-src__label">' + src.label + '</span>' +
        '<div class="seg seg--sm" role="group" aria-label="' + src.label + '">' +
          '<button type="button" data-aff-seg="' + src.toggle + '" data-val="true">Ano</button>' +
          '<button type="button" data-aff-seg="' + src.toggle + '" data-val="false">Ne</button>' +
        '</div></div>' +
      '<p class="aff-src__hint">' + src.hint + '</p>' +
      '<div class="aff-src__body" data-aff-src-body>' + fields + '</div>' +
    '</div>';
  }

  function build() {
    root.innerHTML =
      '<div class="calc">' +
        '<form class="calc__inputs" novalidate>' +
          '<div class="calc__group">' +
            moneyField("prijem", "Čistý měsíční příjem domácnosti") +
            moneyField("zavazky", "Splátky jiných úvěrů měsíčně", "Kreditní karty, leasing, spotřebitelské úvěry, které už máte.") +
            moneyField("uspory", "Vaše úspory celkem", "Vlastní naspořené peníze. Další zdroje přidejte níže.") +
            moneyField("rezerva", "Kolik chci ponechat jako rezervu", "Nepoužije se na koupi. Doporučeno alespoň 3–6 měsíčních výdajů.") +
            '<div class="field"><label for="aff-sazba">Předpokládaná sazba <span class="field__rangeval" data-aff-out="sazba"></span></label><input id="aff-sazba" data-aff-range data-key="sazba" type="range" min="0.5" max="10" step="0.01"></div>' +
            '<div class="field"><label for="aff-doba">Doba splácení <span class="field__rangeval" data-aff-out="doba"></span></label><input id="aff-doba" data-aff-range data-key="doba" type="range" min="5" max="40" step="1"></div>' +
            '<div class="field"><label>Typ nemovitosti</label><div class="seg" role="group" aria-label="Typ nemovitosti">' +
              '<button type="button" data-aff-seg="typ" data-val="vlastni">Vlastní bydlení</button>' +
              '<button type="button" data-aff-seg="typ" data-val="investice">Investiční</button></div></div>' +
            '<div class="field" data-aff-mlady><label>Je vám méně než 36 let?</label><div class="seg" role="group" aria-label="Věk do 36 let">' +
              '<button type="button" data-aff-seg="mlady" data-val="true">Ano</button>' +
              '<button type="button" data-aff-seg="mlady" data-val="false">Ne</button></div></div>' +
          '</div>' +
          '<div class="calc__group">' +
            '<details class="aff-sources"><summary>Další zdroje financování (dar, půjčka, druhá zástava)</summary>' +
              '<p class="field__hint" style="margin:var(--sp-2) 0 var(--sp-3)">Nemusíte mít celou akontaci jen z úspor. Přidejte, co reálně použijete — kalkulačka započítá i splátky dalších úvěrů.</p>' +
              SOURCES.map(sourceBlock).join("") +
            '</details>' +
          '</div>' +
        '</form>' +
        '<div class="calc__outputs">' +
          '<p class="calc__disclaimer">Orientační modelový výpočet, ne rozhodnutí banky. Skutečné posouzení se mezi bankami liší.</p>' +
          '<div data-aff-tiers></div>' +
          '<div data-aff-debt></div>' +
          '<div data-aff-bottleneck></div>' +
          '<div data-aff-card></div>' +
          '<details class="how"><summary>Jak jsme k tomu došli?</summary><div data-aff-how></div></details>' +
        '</div>' +
      '</div>';
  }

  function sync() {
    root.querySelectorAll("[data-aff-money]").forEach(function (el) {
      var k = el.getAttribute("data-key");
      if (document.activeElement !== el) el.value = state[k] ? fmtInt(state[k]) : (state[k] === 0 ? "0" : "");
    });
    root.querySelector('[data-key="sazba"]').value = state.sazba;
    root.querySelector('[data-key="doba"]').value = state.doba;
    root.querySelector('[data-aff-out="sazba"]').textContent = String(state.sazba).replace(".", ",") + " %";
    root.querySelector('[data-aff-out="doba"]').textContent = state.doba + " let";
    root.querySelectorAll('[data-aff-seg="typ"]').forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-val") === state.typ)); });
    root.querySelectorAll('[data-aff-seg="mlady"]').forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-val") === String(state.mlady))); });
    var mf = root.querySelector("[data-aff-mlady]"); if (mf) mf.style.display = state.typ === "investice" ? "none" : "";
    // Přepínače zdrojů + zobrazení jejich polí.
    SOURCES.forEach(function (src) {
      var on = !!state[src.toggle];
      root.querySelectorAll('[data-aff-seg="' + src.toggle + '"]').forEach(function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-val") === "true") === on)); });
      var block = root.querySelector('[data-aff-src="' + src.id + '"]');
      if (block) { var body = block.querySelector("[data-aff-src-body]"); if (body) body.style.display = on ? "" : "none"; }
    });
  }

  function tierResult(dstiMax) {
    var f = funding();
    return C.maxAffordableProperty({
      netIncome: state.prijem, obligations: state.zavazky, savings: state.uspory, reserve: state.rezerva,
      termMonths: state.doba * 12, rate: state.sazba, ltvMax: maxLtv(), dstiMax: dstiMax, dtiMax: dtiThr(),
      txRate: TX_COST_RATE, extraCash: f.extraCash, extraDebtService: f.extraDebt, collateralValue: f.collateral
    });
  }

  function recompute() {
    if (!state.prijem) {
      root.querySelector("[data-aff-tiers]").innerHTML = '<div class="note note--warn"><p>Zadejte čistý měsíční příjem domácnosti — spočítáme, jak drahou nemovitost si můžete dovolit.</p></div>';
      root.querySelector("[data-aff-debt]").innerHTML = "";
      root.querySelector("[data-aff-bottleneck]").innerHTML = "";
      root.querySelector("[data-aff-card]").innerHTML = "";
      root.querySelector("[data-aff-how]").innerHTML = "";
      return;
    }
    var f = funding();
    var results = {};
    TIERS.forEach(function (t) { results[t.id] = tierResult(t.dsti); });
    var rozumny = results.rozumny;
    var payment = function (r) { return C.calculateMonthlyPayment(r.loan, state.sazba, state.doba * 12); };

    // Tiers
    var tilesHtml = '<h3 style="margin-bottom:var(--sp-3)">Jak drahou nemovitost si můžete dovolit?</h3>' +
      '<p class="text-muted">Orientační výsledek podle zadaných parametrů. Skutečné posouzení se může mezi bankami lišit.</p>' +
      '<div class="tiers">';
    TIERS.forEach(function (t) {
      var r = results[t.id];
      tilesHtml += '<div class="tier tier--' + t.id + '">' +
        '<div class="tier__label">' + t.label + '</div>' +
        '<div class="tier__price">' + fmtCZK(r.maxProperty) + '</div>' +
        '<div class="tier__meta">úvěr ' + fmtCZK(r.loan) + ' · splátka ' + fmtCZK(payment(r)) + '</div>' +
        '<div class="tier__note">' + t.note + '</div></div>';
    });
    tilesHtml += '</div>';
    // Když jsou úrovně stejné → omezují vlastní zdroje, ne příjem.
    if (Math.abs(results.max.maxProperty - results.komfort.maxProperty) < 1) {
      tilesHtml += '<div class="note"><p>Vaše hranice je daná <strong>vlastními zdroji</strong> (a limitem LTV), ne příjmem — proto jsou úrovně stejné. Víc vlastních peněz = vyšší dosažitelná cena.</p></div>';
    }
    root.querySelector("[data-aff-tiers]").innerHTML = tilesHtml;

    // Zdraví zadlužení — souhrn splátek (hypotéka + ostatní úvěry) vs. příjem.
    root.querySelector("[data-aff-debt]").innerHTML = debtHealthHtml(rozumny, f, payment(rozumny));

    // Bottleneck pro Režim B — hlavní omezení + zdraví rezervy.
    var pay = payment(rozumny);
    var reserveAfter = rozumny.reserveAfter;               // ≥ zadaná rezerva
    var neededOwn = rozumny.neededOwn;                     // akontace + náklady
    var ownAvail = rozumny.ownForPurchase;                 // (úspory + hotovost ze zdrojů) − rezerva
    var diff = ownAvail - neededOwn;                       // ≥ 0 (model je konzistentní)
    var reserveTarget = pay * 3;

    var bn;
    if (rozumny.maxProperty < 1) {
      bn = { level: "red", key: "vlastni_zdroje", title: "Nedostatek prostředků",
             text: "Se zadanými zdroji a požadovanou rezervou nevychází dosažitelná cena. Zvyšte vlastní zdroje, snižte rezervu nebo splátky dalších úvěrů." };
    } else if (reserveAfter < reserveTarget) {
      bn = { level: "amber", key: "rezerva", title: "Nízká rezerva po koupi",
             text: "Po koupi by vám zůstalo jen ~" + fmtCZK(reserveAfter) + ". Zdravá rezerva bývá 3–6 měsíčních splátek (" + fmtCZK(pay * 3) + "–" + fmtCZK(pay * 6) + "). Zvažte levnější nemovitost." };
    } else if (rozumny.bottleneck === "vlastni_zdroje") {
      bn = { level: "tip", key: "vlastni_zdroje", title: "Hlavní omezení: vlastní zdroje",
             text: "Vaši dosažitelnou cenu určují vlastní zdroje (a závazný limit LTV), ne příjem. Víc vlastních peněz nebo druhá nemovitost do zástavy = vyšší dosažitelná cena." };
    } else {
      bn = { level: "tip", key: "prijem", title: "Hlavní omezení: příjem",
             text: "Vaši dosažitelnou cenu určuje příjem (kolik unesou splátky). Delší doba splatnosti nebo nižší stávající závazky by cenu zvýšily." };
    }
    var bnClass = bn.level === "red" ? "note--critical" : (bn.level === "amber" ? "note--warn" : "note--tip");
    var bnIcon = bn.level === "red" ? "🔴" : (bn.level === "amber" ? "🟠" : "🟢");
    var bnLink = bn.key === "vlastni_zdroje" ? '<p style="margin-top:var(--sp-2)"><a href="#vlastni-zdroje">Co s nedostatkem vlastních zdrojů? →</a></p>' : "";
    root.querySelector("[data-aff-bottleneck]").innerHTML =
      '<h3 style="margin-top:var(--sp-8)">Co vás nejvíc omezuje?</h3>' +
      '<div class="note ' + bnClass + '"><div class="note__title">' + bnIcon + ' ' + bn.title + '</div><p>' + bn.text + '</p>' + bnLink + '</div>';

    // Personalizovaná karta
    var stressPay = C.calculateMonthlyPayment(rozumny.loan, state.sazba + STRESS_PB, state.doba * 12);
    var hasExtra = f.extraCash > 0 || f.collateral > 0;
    var card =
      '<h3 style="margin-top:var(--sp-8)">Vaše hypoteční karta</h3>' +
      '<div class="hcard">' +
        cardRow("Rozumný rozpočet na nemovitost", fmtCZK(rozumny.maxProperty), true) +
        cardRow("Odhadovaná hypotéka", fmtCZK(rozumny.loan)) +
        (hasExtra ? cardRow("Vlastní zdroje celkem (úspory + další zdroje)", fmtCZK(rozumny.ownFundsTotal)) : "") +
        cardRow("Potřebné vlastní zdroje (akontace + náklady)", fmtCZK(neededOwn)) +
        cardRow("Vaše zdroje na koupi (po odečtení rezervy)", fmtCZK(ownAvail)) +
        (f.collateral > 0 ? cardRow("Druhá nemovitost do zástavy", fmtCZK(f.collateral)) : "") +
        cardRow(diff >= 0 ? "Přebývá" : "Chybí", fmtCZK(Math.abs(diff)), false, diff < 0 ? "neg" : "pos") +
        cardRow("Hlavní omezení", bnTitleShort(bn)) +
        cardRow("Rezerva po koupi", fmtCZK(reserveAfter), false, reserveAfter < reserveTarget ? "warn" : "pos") +
        cardRow("Splátka hypotéky", fmtCZK(pay)) +
        (f.extraDebt > 0 ? cardRow("Splátky dalších úvěrů měsíčně", fmtCZK(f.extraDebt), false, "warn") : "") +
        (f.extraDebt > 0 ? cardRow("Splátky celkem (vč. ostatních závazků)", fmtCZK(pay + state.zavazky + f.extraDebt), false, "warn") : "") +
        cardRow("Splátka hypotéky při +2 p. b. (" + String(state.sazba + STRESS_PB).replace(".", ",") + " %)", fmtCZK(stressPay), false, "warn") +
      '</div>' +
      '<div class="means-box" style="margin-top:var(--sp-4)"><h4>Co můžete udělat</h4><ul>' +
        actions(bn, diff).map(function (a) { return "<li>" + a + "</li>"; }).join("") +
      '</ul></div>' +
      '<div class="confidence-note">🟣 Modelový výpočet · 🟠 orientační odhad. Není to rozhodnutí banky.</div>';
    root.querySelector("[data-aff-card]").innerHTML = card;

    // „Jak jsme k tomu došli"
    var srcLine = "";
    if (f.extraCash > 0 || f.extraDebt > 0 || f.collateral > 0) {
      srcLine = '<p><strong>Další zdroje:</strong> hotovost navíc ' + fmtCZK(f.extraCash) + ' (přičtena k úsporám), měsíční splátky dalších úvěrů ' + fmtCZK(f.extraDebt) + ' (zvyšují závazky pro DSTI), druhá zástava ' + fmtCZK(f.collateral) + ' (rozšiřuje základnu LTV).</p>';
    }
    root.querySelector("[data-aff-how]").innerHTML =
      '<p><strong>Vstupy:</strong> příjem ' + fmtCZK(state.prijem) + ', závazky ' + fmtCZK(state.zavazky) + ', úspory ' + fmtCZK(state.uspory) + ', rezerva ' + fmtCZK(state.rezerva) + ', sazba ' + String(state.sazba).replace(".", ",") + ' %, doba ' + state.doba + ' let, LTV limit ' + maxLtv() + ' %.</p>' +
      srcLine +
      '<p><strong>Postup:</strong> Vlastní zdroje na koupi = (úspory + hotovost z dalších zdrojů) − rezerva = ' + fmtCZK(ownAvail) + ' (rezerva ' + fmtCZK(state.rezerva) + ' zůstává stranou). Hypotéka dorovná zbytek ceny a nákladů — nepůjčuje se víc, než je potřeba. Cena podle vlastních zdrojů je omezená limitem LTV (' + maxLtv() + ' %) a případnou druhou zástavou; cena podle příjmu vychází z maximálního úvěru, který unesou splátky (DSTI ' + dstiThr() + ' % a DTI ' + dtiThr() + '×, tj. ' + fmtCZK(rozumny.maxLoanByIncome) + '). Bereme nižší z obou = ' + fmtCZK(rozumny.maxProperty) + '.</p>' +
      '<p><strong>Předpoklady:</strong> <button class="term" data-term="anuita">anuitní splácení</button>, měsíční úrok = roční ÷ 12, transakční náklady ~3 % ceny. Splátky dalších úvěrů se počítají do <button class="term" data-term="dsti">DSTI</button>. <strong>Nebere v úvahu:</strong> konkrétní metodiku banky, bonusové/nepravidelné příjmy, budoucí změny sazeb, individuální posouzení <button class="term" data-term="bonita">bonity</button>.</p>';

    updateUrl();
    if (window.HypoTerms) window.HypoTerms.enhance(root);
  }

  /* --- Zdraví zadlužení: splátky (hypotéka + ostatní úvěry) vs. příjem --- */
  function debtHealthHtml(rozumny, f, mortgagePay) {
    if (f.extraDebt <= 0) return ""; // ukazujeme jen, když jsou další úvěry se splátkou
    var thr = dstiThr(); // doporučená mez DSTI (obezřetnost ČNB), typicky 40 %
    var obligOnly = state.zavazky + f.extraDebt;                    // splátky ostatních úvěrů
    var obligShare = state.prijem > 0 ? obligOnly / state.prijem * 100 : 0;
    var totalDebt = mortgagePay + obligOnly;                        // vše včetně hypotéky
    var dstiTotal = state.prijem > 0 ? totalDebt / state.prijem * 100 : 0;

    var level, icon, cls, title, text;
    if (obligShare >= thr) {
      level = "red"; cls = "note--critical"; icon = "🔴"; title = "Splátky úvěrů přesahují zdravou mez";
      text = "Samotné splátky ostatních úvěrů (" + fmtCZK(obligOnly) + ", tj. " + obligShare.toFixed(0) + " % příjmu) dosahují doporučené hranice DSTI (" + thr + " %). Na hypotéku téměř nezbývá kapacita. Zvažte menší/levnější další úvěr nebo dar místo půjčky.";
    } else if (dstiTotal > 45 || obligShare >= 25) {
      level = "amber"; cls = "note--warn"; icon = "🟠"; title = "Vysoké zatížení splátkami";
      text = "Splátky ostatních úvěrů (" + fmtCZK(obligOnly) + ") tvoří " + obligShare.toFixed(0) + " % příjmu a výrazně snižují dostupnou výši hypotéky. Celkové splátky včetně hypotéky by byly ~" + fmtCZK(totalDebt) + " (" + dstiTotal.toFixed(0) + " % příjmu). Ověřte si, že takové zatížení dlouhodobě unesete.";
    } else {
      level = "green"; cls = "note--tip"; icon = "🟢"; title = "Splátky úvěrů jsou v pořádku";
      text = "Splátky ostatních úvěrů (" + fmtCZK(obligOnly) + ", " + obligShare.toFixed(0) + " % příjmu) hypotéku výrazně neomezují. Celkové splátky včetně hypotéky ~" + fmtCZK(totalDebt) + " (" + dstiTotal.toFixed(0) + " % příjmu).";
    }
    return '<div class="note ' + cls + '" style="margin-top:var(--sp-6)"><div class="note__title">' + icon + ' ' + title + '</div><p>' + text + '</p>' +
      '<p class="text-muted" style="margin-bottom:0;font-size:0.85rem">🔵 DSTI (podíl všech splátek na čistém příjmu) není závazný limit; ČNB doporučuje obezřetnost nad ' + thr + ' %.</p></div>';
  }

  function cardRow(k, v, strong, cls) {
    return '<div class="hcard__row' + (strong ? " hcard__row--strong" : "") + '"><span>' + k + '</span><span class="' + (cls ? "hcard__v--" + cls : "") + '">' + v + '</span></div>';
  }
  function bnTitleShort(bn) { return bn.level === "green" ? "žádné zásadní" : bn.title; }
  function actions(bn, diff) {
    var a = [];
    var f = funding();
    if (bn.key === "vlastni_zdroje" || diff < 0) {
      a.push("Hledat levnější nemovitost.");
      if (!state.src_dar && !state.src_rodina) a.push("Zvýšit vlastní zdroje (naspořit, dar nebo půjčka od rodiny — přidejte je v „Další zdroje financování“).");
      if (!state.src_zastava) a.push("Zvážit druhou nemovitost do zástavy (rozšíří základnu LTV).");
    }
    if (bn.key === "prijem") {
      a.push("Prodloužit dobu splatnosti (nižší splátka, ale víc na úrocích).");
      if (f.extraDebt > 0) a.push("Snížit splátky dalších úvěrů — každá koruna splátky snižuje dostupnou hypotéku.");
      a.push("Snížit stávající závazky (zrušit nevyužité kreditní karty).");
      a.push("Přidat spolužadatele.");
    }
    if (bn.key === "rezerva") a.push("Ponechat si vyšší hotovostní rezervu, koupit levněji.");
    a.push("Porovnat více nabídek bank.");
    return a;
  }

  /* --- URL (jen když je Režim B aktivní, ať se moduly nepřepisují) --- */
  function updateUrl() {
    if (root && root.hidden) return;
    try {
      var qs = "mode=B&prijem=" + state.prijem + "&zavazky=" + state.zavazky + "&uspory=" + state.uspory + "&rezerva=" + state.rezerva + "&sazba=" + state.sazba + "&doba=" + state.doba + "&typ=" + state.typ + "&mlady=" + state.mlady;
      if (state.src_dar && state.dar_castka) qs += "&dar=" + state.dar_castka;
      if (state.src_rodina && (state.rodina_castka || state.rodina_splatka)) qs += "&rodina=" + state.rodina_castka + "," + state.rodina_splatka;
      if (state.src_spotreb && (state.spotreb_castka || state.spotreb_splatka)) qs += "&spotreb=" + state.spotreb_castka + "," + state.spotreb_splatka;
      if (state.src_zastava && state.zastava_hodnota) qs += "&zastava=" + state.zastava_hodnota;
      history.replaceState(null, "", window.location.pathname + "?" + qs + "#kalkulacka");
    } catch (e) {}
  }

  function scheduleRecompute() { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(recompute); }

  function attach() {
    root.querySelectorAll("[data-aff-money]").forEach(function (el) {
      var k = el.getAttribute("data-key");
      el.addEventListener("input", function () { state[k] = parseNum(el.value); scheduleRecompute(); });
      el.addEventListener("focus", function () { if (state[k]) el.value = String(Math.round(state[k])); });
      el.addEventListener("blur", function () { el.value = state[k] ? fmtInt(state[k]) : ""; });
    });
    root.querySelectorAll("[data-aff-range]").forEach(function (el) {
      var k = el.getAttribute("data-key");
      el.addEventListener("input", function () { state[k] = parseNum(el.value); root.querySelector('[data-aff-out="' + k + '"]').textContent = (k === "sazba" ? String(state[k]).replace(".", ",") + " %" : state[k] + " let"); scheduleRecompute(); });
    });
    root.querySelectorAll("[data-aff-seg]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var seg = btn.getAttribute("data-aff-seg"), val = btn.getAttribute("data-val");
        if (seg === "mlady" || /^src_/.test(seg)) state[seg] = (val === "true");
        else state[seg] = val;
        sync(); scheduleRecompute();
      });
    });
  }

  /* --- Přepínač režimů A/B --- */
  function initModeSwitch() {
    var btns = document.querySelectorAll(".calc-mode__btn");
    var affRoot = document.getElementById("affordability-root");
    var calcRoot = document.getElementById("calculator-root");
    if (!btns.length || !affRoot || !calcRoot) return;
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-mode");
        btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        affRoot.hidden = mode !== "B";
        calcRoot.hidden = mode !== "A";
      });
    });
    // Výchozí režim z URL (?mode=A/B)
    if (/[?&]mode=A/.test(window.location.search)) {
      var aBtn = document.querySelector('.calc-mode__btn[data-mode="A"]');
      if (aBtn) aBtn.click();
    }
  }

  function loadInitial() {
    var s = Object.assign({}, DEFAULTS);
    // Předvyplnění z průvodce (sessionStorage) — pokud uživatel nezadal cenu, hodí se pro Režim B.
    try {
      var pf = JSON.parse(sessionStorage.getItem("hypo:prefill") || "null");
      if (pf) {
        if (pf.prijem) s.prijem = pf.prijem;
        if (pf.zavazky != null) s.zavazky = pf.zavazky;
        if (pf.vlastni != null) s.uspory = pf.vlastni;
        if (pf.mlady != null) s.mlady = pf.mlady;
        if (pf.typ) s.typ = pf.typ;
      }
    } catch (e) {}
    // URL parametry (mají přednost) — ze snapshotu URL při načtení stránky
    var q = new URLSearchParams(INITIAL_SEARCH);
    ["prijem", "zavazky", "uspory", "rezerva", "sazba", "doba"].forEach(function (k) { if (q.has(k)) s[k] = parseNum(q.get(k)); });
    if (q.get("typ")) s.typ = q.get("typ");
    if (q.has("mlady")) s.mlady = q.get("mlady") === "true";
    // Zdroje financování z URL
    if (q.has("dar")) { s.src_dar = true; s.dar_castka = parseNum(q.get("dar")); }
    if (q.has("rodina")) { s.src_rodina = true; var rp = q.get("rodina").split(","); s.rodina_castka = parseNum(rp[0]); s.rodina_splatka = parseNum(rp[1] || 0); }
    if (q.has("spotreb")) { s.src_spotreb = true; var sp = q.get("spotreb").split(","); s.spotreb_castka = parseNum(sp[0]); s.spotreb_splatka = parseNum(sp[1] || 0); }
    if (q.has("zastava")) { s.src_zastava = true; s.zastava_hodnota = parseNum(q.get("zastava")); }
    return s;
  }

  function init() {
    root = document.getElementById("affordability-root");
    if (!root || !C) return;
    state = loadInitial();
    build(); attach(); sync(); recompute();
    initModeSwitch();
  }

  if (window.HypoData && window.HypoData.loaded) init();
  else document.addEventListener("hypodata:ready", init, { once: true });
  setTimeout(function () { if (!root) init(); }, 2500);
})();
