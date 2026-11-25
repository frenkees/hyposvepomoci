/*
 * readiness-guide.js — Průvodce "Jsem připraven na hypotéku?" (Fáze 1)
 *
 * 6–8 jednoduchých otázek (vždy jedna na obrazovce) → barevně kódovaný výsledek
 * (vlastní zdroje / LTV / příjmové zatížení / rezerva po nákupu) + hlavní doporučení.
 * Výsledek je ORIENTAČNÍ, ne verdikt. Hodnoty předá kalkulačce přes sessionStorage.
 *
 * Regulatorní prahy čte z datové vrstvy (window.HypoData), s bezpečnými fallbacky.
 */
(function () {
  "use strict";

  var ASSUMED_RATE = 4.9;      // orientační sazba pro odhad splátky
  var TERM_YEARS = 30;         // orientační doba splácení
  var TX_COST_RATE = 0.03;     // odhad transakčních nákladů (katastr, právní servis, rezerva) ~3 % ceny
  var PREFILL_KEY = "hypo:prefill";

  var QUESTIONS = [
    { id: "ucel", type: "choice", q: "Kupujete pro vlastní bydlení, nebo jako investici?",
      options: [ { label: "Pro vlastní bydlení", value: "vlastni" }, { label: "Jako investici", value: "investice" } ] },
    { id: "cena", type: "number", q: "Kolik přibližně stojí nemovitost?", suffix: "Kč", placeholder: "např. 5 000 000" },
    { id: "vlastni", type: "number", q: "Kolik máte vlastních peněz (úspor) k dispozici?", suffix: "Kč", placeholder: "např. 1 200 000" },
    { id: "prijem", type: "number", q: "Jaký je čistý měsíční příjem vaší domácnosti?", suffix: "Kč / měsíc", placeholder: "např. 70 000" },
    { id: "zavazky", type: "number", q: "Kolik měsíčně splácíte na jiných úvěrech? (0, pokud žádné)", suffix: "Kč / měsíc", placeholder: "např. 3 000", allowZero: true },
    { id: "mlady", type: "choice", q: "Je vám méně než 36 let?",
      options: [ { label: "Ano, je mi méně než 36", value: "ano" }, { label: "Ne, je mi 36 a více", value: "ne" } ] },
    { id: "prijem_typ", type: "choice", q: "Jaký máte hlavní typ příjmu?",
      options: [ { label: "Zaměstnanec", value: "zamestnanec" }, { label: "OSVČ / podnikání", value: "osvc" }, { label: "Kombinace / jiné", value: "jine" } ] },
    { id: "vybrano", type: "choice", q: "Máte už konkrétní nemovitost vybranou?",
      options: [ { label: "Ano, vím kterou", value: "ano" }, { label: "Zatím ne", value: "ne" } ] }
  ];

  var state = { step: 0, answers: {} };
  var root;

  /* --- Pomocné --- */
  function num(v) { var n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
  function fmt(n) { try { return new Intl.NumberFormat("cs-CZ").format(Math.round(n)); } catch (e) { return String(Math.round(n)); } }

  function monthlyPayment(principal, annualRatePct, years) {
    var r = (annualRatePct / 100) / 12;
    var n = years * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  /** Max LTV dle typu nemovitosti a věku (z datové vrstvy, s fallbackem). */
  function maxLtv() {
    var a = state.answers;
    var d = (window.HypoData && window.HypoData.data && window.HypoData.data.regulatory && window.HypoData.data.regulatory.facts) || {};
    function val(key, fb) { return d[key] && typeof d[key].value === "number" ? d[key].value : fb; }
    if (a.ucel === "investice") return val("ltv_investment", 70);
    if (a.mlady === "ano") return val("ltv_owner_young", 90);
    return val("ltv_owner_standard", 80);
  }
  function dstiThreshold() {
    var d = (window.HypoData && window.HypoData.data && window.HypoData.data.regulatory && window.HypoData.data.regulatory.facts) || {};
    return d.dsti_recommendation && d.dsti_recommendation.value ? d.dsti_recommendation.value : 40;
  }

  /* --- Render kroku --- */
  function render() {
    if (!root) return;
    if (state.step >= QUESTIONS.length) { renderResult(); return; }

    var qDef = QUESTIONS[state.step];
    var pct = Math.round((state.step / QUESTIONS.length) * 100);

    var html = '' +
      '<div class="guide__progress"><div class="guide__progress-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="guide__step-count">Otázka ' + (state.step + 1) + ' z ' + QUESTIONS.length + '</div>' +
      '<div class="guide__q" id="guide-q">' + qDef.q + '</div>';

    if (qDef.type === "choice") {
      html += '<div class="guide__options">';
      qDef.options.forEach(function (o, i) {
        html += '<button type="button" class="guide__option" data-value="' + o.value + '" data-idx="' + i + '">' + o.label + '</button>';
      });
      html += '</div>';
    } else {
      var prev = state.answers[qDef.id] != null ? state.answers[qDef.id] : "";
      html += '<div class="guide__field">' +
              '<label class="visually-hidden" for="guide-input">' + qDef.q + '</label>' +
              '<input id="guide-input" type="text" inputmode="numeric" autocomplete="off" placeholder="' + (qDef.placeholder || "") + '" value="' + prev + '"> ' +
              '<span class="text-muted">' + (qDef.suffix || "") + '</span>' +
              '</div>';
    }

    html += '<div class="guide__nav">';
    html += state.step > 0
      ? '<button type="button" class="btn btn--ghost" data-back>← Zpět</button>'
      : '<span></span>';
    if (qDef.type === "number") html += '<button type="button" class="btn btn--primary" data-next>Pokračovat →</button>';
    else html += '<span></span>';
    html += '</div>';

    root.innerHTML = html;

    // Handlery
    root.querySelectorAll(".guide__option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.answers[qDef.id] = btn.getAttribute("data-value");
        next();
      });
    });
    var nextBtn = root.querySelector("[data-next]");
    var input = root.querySelector("#guide-input");
    if (nextBtn && input) {
      nextBtn.addEventListener("click", function () {
        var v = num(input.value);
        if (v <= 0 && !qDef.allowZero) { input.focus(); input.style.borderColor = "var(--color-danger)"; return; }
        state.answers[qDef.id] = qDef.allowZero ? String(v) : input.value.trim();
        next();
      });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") nextBtn.click(); });
      input.focus();
    }
    var backBtn = root.querySelector("[data-back]");
    if (backBtn) backBtn.addEventListener("click", back);

    // Přesun fokusu na otázku kvůli přístupnosti.
    var qEl = document.getElementById("guide-q");
    if (qEl && state.step > 0) { qEl.setAttribute("tabindex", "-1"); }
  }

  function next() { state.step++; render(); }
  function back() { if (state.step > 0) state.step--; render(); }

  /* --- Výsledek --- */
  function assess() {
    var a = state.answers;
    var price = num(a.cena), own = num(a.vlastni), income = num(a.prijem), obligations = num(a.zavazky);
    var ltvMax = maxLtv();

    var rows = [];
    var reds = 0, ambers = 0;

    // Konzistentní model: vezmete maximum, které dovolí LTV, a zbytek úspor
    // (nad minimální akontaci a náklady) zůstává jako rezerva.
    var txCosts = price * TX_COST_RATE;                 // odhad transakčních nákladů
    var loan = price * (ltvMax / 100);                  // úvěr při maximálním LTV
    var neededOwnMin = price - loan;                    // minimální akontace
    var minRequired = neededOwnMin + txCosts;           // akontace + náklady
    var cushion = own - minRequired;                    // co zbyde na rezervu

    // 1) Vlastní zdroje (na akontaci + náklady)
    if (price > 0) {
      var r;
      if (cushion >= txCosts * 0.5) r = ["green", "Vlastní zdroje: pravděpodobně dostačující", "Máte na akontaci i na náklady s rezervou."];
      else if (cushion >= 0) r = ["amber", "Vlastní zdroje: těsně na hranici", "Na akontaci a náklady to vychází, ale bez velké rezervy."];
      else r = ["red", "Vlastní zdroje: nedostatečné", "Chybí přibližně " + fmt(-cushion) + " Kč na minimální akontaci a náklady (limit LTV " + ltvMax + " %)."];
      rows.push(r);
    }

    // 2) LTV — kolik máte prostoru pod závazným limitem
    if (price > 0) {
      var r2;
      if (cushion >= price * 0.10) r2 = ["green", "LTV: v bezpečné zóně", "Máte prostor jít i pod limit " + ltvMax + " % (nižší úvěr, nižší riziko)."];
      else if (cushion >= 0) r2 = ["amber", "LTV: blízko regulatorní hranice", "Jste u závazného limitu " + ltvMax + " % — malý prostor, když bude odhad nižší než cena."];
      else r2 = ["red", "LTV: nad limitem", "Potřebovali byste víc vlastních zdrojů nebo jiné zajištění (limit " + ltvMax + " %)."];
      rows.push(r2);
    }

    // 3) Příjmové zatížení (DSTI proxy)
    var payment = loan > 0 ? monthlyPayment(loan, ASSUMED_RATE, TERM_YEARS) : 0;
    if (income > 0) {
      var dsti = ((payment + obligations) / income) * 100;
      var thr = dstiThreshold();
      var r3;
      if (dsti < thr) r3 = ["green", "Příjmové zatížení: v doporučeném pásmu", "Splátky by braly ~" + Math.round(dsti) + " % příjmu (doporučená obezřetnost nad " + thr + " %)."];
      else if (dsti <= thr + 10) r3 = ["amber", "Příjmové zatížení: zvýšené", "Splátky ~" + Math.round(dsti) + " % příjmu — nad doporučenou obezřetností."];
      else r3 = ["red", "Příjmové zatížení: vysoké", "Splátky ~" + Math.round(dsti) + " % příjmu. Zvažte nižší úvěr nebo delší dobu."];
      rows.push(r3);
    }

    // 4) Rezerva po nákupu (= co zbyde nad minimální akontaci a náklady)
    if (price > 0 && income > 0) {
      var leftover = cushion;
      var r4;
      if (leftover >= payment * 6) r4 = ["green", "Rezerva po nákupu: zdravá", "Po koupi by vám zůstalo ~" + fmt(leftover) + " Kč (přes 6 splátek)."];
      else if (leftover >= payment * 3) r4 = ["amber", "Rezerva po nákupu: malá", "Po koupi by zbylo ~" + fmt(Math.max(0, leftover)) + " Kč — cílem bývá 3–6 měsíčních splátek."];
      else r4 = ["red", "Rezerva po nákupu: nízká", "Po koupi by téměř nic nezbylo. Rezerva bývá důležitější než rychlé splacení."];
      rows.push(r4);
    }

    rows.forEach(function (r) { if (r[0] === "red") reds++; else if (r[0] === "amber") ambers++; });

    // Hlavní doporučení
    var advice;
    var firstRed = rows.filter(function (r) { return r[0] === "red"; })[0];
    if (firstRed) advice = "Co bych řešil jako první: " + firstRed[1].split(":")[0].toLowerCase() + " — " + firstRed[2];
    else if (ambers) advice = "Vypadá to slibně. Zaměřte se na body označené žlutě a projeďte si scénář v kalkulačce.";
    else advice = "Vaše situace vypadá zdravě. Ověřte si detaily v kalkulačce a porovnejte více nabídek.";

    return { rows: rows, advice: advice, price: price, own: own, income: income, obligations: obligations, loan: loan, ltvMax: ltvMax };
  }

  function savePrefill(res) {
    try {
      var a = state.answers;
      // Intuitivní úvěr pro kalkulačku: vložíte úspory, zbytek je úvěr — omezeno limitem LTV.
      var maxLoan = res.price * (res.ltvMax / 100);
      var uver = Math.max(0, Math.min(res.price - res.own, maxLoan));
      sessionStorage.setItem(PREFILL_KEY, JSON.stringify({
        cena: res.price, vlastni: res.own, uver: Math.round(uver),
        prijem: res.income, zavazky: res.obligations,
        mlady: a.mlady === "ano", typ: a.ucel || "vlastni"
      }));
    } catch (e) { /* sessionStorage nemusí být dostupné */ }
  }

  function renderResult() {
    var res = assess();
    savePrefill(res);

    var html = '<div class="guide__step-count">Hotovo — orientační přehled</div>' +
               '<h3 style="margin-top:0">Vaše situace</h3>' +
               '<p class="text-muted">Jen orientační odhad, ne rozhodnutí banky. Přesné hodnoty spočítáte v kalkulačce.</p>' +
               '<div class="readiness__grid">';
    res.rows.forEach(function (r) {
      html += '<div class="readiness__row">' +
              '<span class="readiness__dot readiness__dot--' + r[0] + '" aria-hidden="true"></span>' +
              '<span><span class="readiness__label">' + r[1] + '</span><br><span class="text-muted">' + r[2] + '</span></span>' +
              '</div>';
    });
    html += '</div>';
    html += '<div class="readiness__advice"><strong>' + res.advice + '</strong></div>';
    html += '<div class="guide__nav"><button type="button" class="btn btn--ghost" data-restart>← Znovu</button>' +
            '<a class="btn btn--primary" href="#kalkulacka" data-tocalc>Pokračovat na kalkulačku →</a></div>';

    root.innerHTML = html;

    var restart = root.querySelector("[data-restart]");
    if (restart) restart.addEventListener("click", function () { state = { step: 0, answers: {} }; render(); });
  }

  /* --- Init --- */
  function init() {
    root = document.getElementById("guide");
    if (!root) return;
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
