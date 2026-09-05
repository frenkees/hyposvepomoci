/*
 * affordability.js — Režim B: „Teprve hledám nemovitost" (Fáze P1)
 *
 * Hlavní produktová funkce: z příjmu, závazků, úspor a rezervy spočítá,
 * jak drahou nemovitost si člověk může dovolit (tři úrovně), najde hlavní
 * omezení (bottleneck engine), vykreslí personalizovanou hypoteční kartu
 * a „Jak jsme k tomu došli". Výsledky jsou modelové/orientační, ne verdikt banky.
 *
 * Také řídí přepínač režimů A/B v sekci kalkulačky.
 */
(function () {
  "use strict";
  var C = window.HypoCalc;
  var TX_COST_RATE = 0.03;
  var STRESS_PB = 2; // stres +2 p.b.

  var INITIAL_SEARCH = window.location.search; // snapshot dřív, než kterýkoli modul přepíše URL
  var DEFAULTS = { prijem: 60000, zavazky: 0, uspory: 800000, rezerva: 150000, mlady: false, typ: "vlastni", doba: 30, sazba: 5.0, osoby: 2 };
  var state = {};
  var root, rafId;

  var TIERS = [
    { id: "max", label: "Orientační maximum", dsti: 45, note: "Na hraně obezřetnosti. Malý prostor pro chyby." },
    { id: "rozumny", label: "Rozumný rozpočet", dsti: 40, note: "Doporučená obezřetnost ČNB." },
    { id: "komfort", label: "Komfortní rozpočet", dsti: 35, note: "Větší finanční rezerva každý měsíc." }
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

  /* --- Stavba vstupů --- */
  function moneyField(id, label, hint) {
    return '<div class="field"><label for="aff-' + id + '">' + label + '</label>' +
      (hint ? '<span class="field__hint">' + hint + '</span>' : '') +
      '<div class="field__input"><input id="aff-' + id + '" data-aff-money data-key="' + id + '" type="text" inputmode="numeric" autocomplete="off"><span class="field__suffix">Kč</span></div></div>';
  }

  function build() {
    root.innerHTML =
      '<div class="calc">' +
        '<form class="calc__inputs" novalidate>' +
          '<div class="calc__group">' +
            moneyField("prijem", "Čistý měsíční příjem domácnosti") +
            moneyField("zavazky", "Splátky jiných úvěrů měsíčně", "Kreditní karty, leasing, spotřebitelské úvěry.") +
            moneyField("uspory", "Vaše úspory celkem") +
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
        '</form>' +
        '<div class="calc__outputs">' +
          '<p class="calc__disclaimer">Orientační modelový výpočet, ne rozhodnutí banky. Skutečné posouzení se mezi bankami liší.</p>' +
          '<div data-aff-tiers></div>' +
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
  }

  function tierResult(dstiMax) {
    return C.maxAffordableProperty({
      netIncome: state.prijem, obligations: state.zavazky, savings: state.uspory, reserve: state.rezerva,
      termMonths: state.doba * 12, rate: state.sazba, ltvMax: maxLtv(), dstiMax: dstiMax, dtiMax: dtiThr()
    });
  }

  function recompute() {
    if (!state.prijem) {
      root.querySelector("[data-aff-tiers]").innerHTML = '<div class="note note--warn"><p>Zadejte čistý měsíční příjem domácnosti — spočítáme, jak drahou nemovitost si můžete dovolit.</p></div>';
      root.querySelector("[data-aff-bottleneck]").innerHTML = "";
      root.querySelector("[data-aff-card]").innerHTML = "";
      root.querySelector("[data-aff-how]").innerHTML = "";
      return;
    }
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

    // Bottleneck (na rozumné úrovni)
    var pay = payment(rozumny);
    var ltv = rozumny.maxProperty > 0 ? (rozumny.loan / rozumny.maxProperty) * 100 : 0;
    var txCosts = rozumny.maxProperty * TX_COST_RATE;
    var reserveAfter = state.rezerva - txCosts;
    var dsti = state.prijem ? ((pay + state.zavazky) / state.prijem) * 100 : null;
    var bn = C.detectBottleneck({ ltv: ltv, ltvMax: maxLtv(), dsti: dsti, dstiThr: dstiThr(), reserveAfter: reserveAfter, monthlyPayment: pay });
    var bnClass = bn.level === "red" ? "note--critical" : (bn.level === "amber" ? "note--warn" : "note--tip");
    var bnIcon = bn.level === "red" ? "🔴" : (bn.level === "amber" ? "🟠" : "🟢");
    root.querySelector("[data-aff-bottleneck]").innerHTML =
      '<h3 style="margin-top:var(--sp-8)">Co vás nejvíc omezuje?</h3>' +
      '<div class="note ' + bnClass + '"><div class="note__title">' + bnIcon + ' ' + bn.title + '</div><p>' + bn.text + '</p></div>';

    // Personalizovaná karta
    var neededOwn = rozumny.maxProperty * (1 - maxLtv() / 100);
    var ownAvail = Math.max(0, state.uspory - state.rezerva);
    var diff = ownAvail - neededOwn;
    var stressPay = C.calculateMonthlyPayment(rozumny.loan, state.sazba + STRESS_PB, state.doba * 12);
    var card =
      '<h3 style="margin-top:var(--sp-8)">Vaše hypoteční karta</h3>' +
      '<div class="hcard">' +
        cardRow("Rozumný rozpočet na nemovitost", fmtCZK(rozumny.maxProperty), true) +
        cardRow("Potřebné vlastní zdroje (akontace)", fmtCZK(neededOwn)) +
        cardRow("Vaše vlastní zdroje na koupi", fmtCZK(ownAvail)) +
        cardRow(diff >= 0 ? "Přebývá" : "Chybí", fmtCZK(Math.abs(diff)), false, diff < 0 ? "neg" : "pos") +
        cardRow("Hlavní omezení", bnTitleShort(bn)) +
        cardRow("Rezerva po koupi", fmtCZK(reserveAfter), false, reserveAfter < 0 ? "neg" : "") +
        cardRow("Splátka (rozumný rozpočet)", fmtCZK(pay)) +
        cardRow("Splátka při +2 p. b. (" + String(state.sazba + STRESS_PB).replace(".", ",") + " %)", fmtCZK(stressPay), false, "warn") +
      '</div>' +
      '<div class="means-box" style="margin-top:var(--sp-4)"><h4>Co můžete udělat</h4><ul>' +
        actions(bn, diff).map(function (a) { return "<li>" + a + "</li>"; }).join("") +
      '</ul></div>' +
      '<div class="confidence-note">🟣 Modelový výpočet · 🟠 orientační odhad. Není to rozhodnutí banky.</div>';
    root.querySelector("[data-aff-card]").innerHTML = card;

    // „Jak jsme k tomu došli"
    root.querySelector("[data-aff-how]").innerHTML =
      '<p><strong>Vstupy:</strong> příjem ' + fmtCZK(state.prijem) + ', závazky ' + fmtCZK(state.zavazky) + ', úspory ' + fmtCZK(state.uspory) + ', rezerva ' + fmtCZK(state.rezerva) + ', sazba ' + String(state.sazba).replace(".", ",") + ' %, doba ' + state.doba + ' let, LTV limit ' + maxLtv() + ' %.</p>' +
      '<p><strong>Postup:</strong> Vlastní zdroje na koupi = úspory − rezerva = ' + fmtCZK(ownAvail) + '. Maximální úvěr podle DSTI ' + dstiThr() + ' % a DTI ' + dtiThr() + '× = ' + fmtCZK(rozumny.maxLoanByIncome) + '. Cena je omezena buď příjmem (úvěr + vlastní zdroje), nebo LTV (vlastní zdroje ÷ (1 − LTV)). Bereme nižší z obou.</p>' +
      '<p><strong>Předpoklady:</strong> anuitní splácení, měsíční úrok = roční ÷ 12, transakční náklady ~3 % ceny. <strong>Nebere v úvahu:</strong> konkrétní metodiku banky, bonusové/nepravidelné příjmy, budoucí změny sazeb, individuální posouzení bonity.</p>';

    updateUrl();
  }

  function cardRow(k, v, strong, cls) {
    return '<div class="hcard__row' + (strong ? " hcard__row--strong" : "") + '"><span>' + k + '</span><span class="' + (cls ? "hcard__v--" + cls : "") + '">' + v + '</span></div>';
  }
  function bnTitleShort(bn) { return bn.level === "green" ? "žádné zásadní" : bn.title; }
  function actions(bn, diff) {
    var a = [];
    if (bn.key === "vlastni_zdroje" || diff < 0) { a.push("Hledat levnější nemovitost."); a.push("Zvýšit vlastní zdroje (naspořit, dar od rodiny)."); a.push("Zvážit dodatečné zajištění (další nemovitost do zástavy)."); }
    if (bn.key === "prijem") { a.push("Prodloužit dobu splatnosti (nižší splátka, ale víc na úrocích)."); a.push("Snížit stávající závazky (zrušit nevyužité kreditní karty)."); a.push("Přidat spolužadatele."); }
    if (bn.key === "rezerva") a.push("Ponechat si vyšší hotovostní rezervu, koupit levněji.");
    a.push("Porovnat více nabídek bank.");
    return a;
  }

  /* --- URL (jen když je Režim B aktivní, ať se moduly nepřepisují) --- */
  function updateUrl() {
    if (root && root.hidden) return;
    try {
      var qs = "mode=B&prijem=" + state.prijem + "&zavazky=" + state.zavazky + "&uspory=" + state.uspory + "&rezerva=" + state.rezerva + "&sazba=" + state.sazba + "&doba=" + state.doba + "&typ=" + state.typ + "&mlady=" + state.mlady;
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
      btn.addEventListener("click", function () { var seg = btn.getAttribute("data-aff-seg"), val = btn.getAttribute("data-val"); state[seg] = seg === "mlady" ? (val === "true") : val; sync(); scheduleRecompute(); });
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
