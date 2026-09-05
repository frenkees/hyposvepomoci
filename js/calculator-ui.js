/*
 * calculator-ui.js — UI kalkulačky (Fáze 2)
 *
 * Staví kalkulačku do #calculator-root, počítá přes HypoCalc (calculator-core.js),
 * respektuje designový princip (Co to pro mě znamená, tři pohledy 🏦/⚖️/🧠),
 * počítá LTV vůči ODHADU, dostupnost A/B/C, rezervu a dvouosý stres test.
 * Sdílí stav přes URL a předvyplní se z průvodce (sessionStorage 'hypo:prefill').
 * Po každém přepočtu vyšle 'calc:updated' (data pro grafy ve Fázi 3).
 */
(function () {
  "use strict";

  var C = window.HypoCalc;
  var PREFILL_KEY = "hypo:prefill";
  var FIX_OPTIONS = [1, 3, 5, 7, 10, 15, 20];

  var DEFAULTS = {
    cena: 5000000, odhad: 5000000, vlastni: 1000000, uver: 4000000,
    sazba: 4.9, doba: 30, typ: "vlastni", mlady: false,
    fixace: 5, sazbaPo: "", extraMesic: 0, prijem: 0, vydaje: 0, zavazky: 0
  };

  var INITIAL_SEARCH = window.location.search; // snapshot dřív, než jiný modul přepíše URL
  var state = {};
  var touched = { odhad: false, uver: false };
  var root, rafId;

  /* --- Formátování / parsování --- */
  function parseNum(v) { var n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
  function fmtInt(n) { try { return new Intl.NumberFormat("cs-CZ").format(Math.round(n)); } catch (e) { return String(Math.round(n)); } }
  function fmtCZK(n) { try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Math.round(n)); } catch (e) { return fmtInt(n) + " Kč"; } }
  function fmtPct(n, dec) { return (Math.round(n * (dec ? 100 : 10) / (dec ? 1 : 1)) / (dec ? 100 : 10)).toFixed(dec || 1).replace(".", ",") + " %"; }

  /* --- Regulatorní prahy z datové vrstvy --- */
  function reg(key, fb) {
    var d = window.HypoData && window.HypoData.data && window.HypoData.data.regulatory && window.HypoData.data.regulatory.facts;
    return d && d[key] && typeof d[key].value === "number" ? d[key].value : fb;
  }
  function maxLtv() {
    if (state.typ === "investice") return reg("ltv_investment", 70);
    if (state.mlady) return reg("ltv_owner_young", 90);
    return reg("ltv_owner_standard", 80);
  }
  function dstiThr() { return reg("dsti_recommendation", 40); }
  function dtiThr() { return state.typ === "investice" ? reg("dti_investment", 7) : reg("dti_recommendation", 8); }

  /* --- Načtení počátečního stavu: URL > prefill z průvodce > výchozí --- */
  function loadInitial() {
    var s = Object.assign({}, DEFAULTS);
    try {
      var pf = JSON.parse(sessionStorage.getItem(PREFILL_KEY) || "null");
      if (pf) {
        if (pf.cena) { s.cena = pf.cena; s.odhad = pf.cena; }
        if (pf.vlastni != null) s.vlastni = pf.vlastni;
        if (pf.uver != null) s.uver = pf.uver;
        if (pf.prijem != null) s.prijem = pf.prijem;
        if (pf.zavazky != null) s.zavazky = pf.zavazky;
        if (pf.typ) s.typ = pf.typ;
        if (pf.mlady != null) s.mlady = pf.mlady;
      }
    } catch (e) {}
    var urlState = C.deserializeState(INITIAL_SEARCH);
    Object.keys(urlState).forEach(function (k) { s[k] = urlState[k]; if (k === "odhad") touched.odhad = true; if (k === "uver") touched.uver = true; });
    return s;
  }

  /* --- Stavba DOM --- */
  function moneyField(id, label, hint) {
    return '<div class="field"><label for="calc-' + id + '">' + label + '</label>' +
      (hint ? '<span class="field__hint">' + hint + '</span>' : '') +
      '<div class="field__input"><input id="calc-' + id + '" data-money data-key="' + id + '" type="text" inputmode="numeric" autocomplete="off"><span class="field__suffix">Kč</span></div></div>';
  }

  function build() {
    var fixOpts = FIX_OPTIONS.map(function (y) { return '<option value="' + y + '">' + y + ' let</option>'; }).join("");
    root.innerHTML =
      '<div class="calc">' +
        '<form class="calc__inputs" novalidate>' +
          '<div class="calc__group">' +
            moneyField("cena", "Kupní cena nemovitosti") +
            moneyField("odhad", "Odhadní hodnota (zajištění)", "LTV se počítá z odhadu, ne z kupní ceny.") +
            moneyField("vlastni", "Vlastní zdroje") +
            moneyField("uver", "Výše úvěru", "Automaticky: cena − vlastní zdroje. Lze upravit.") +
            '<div class="field"><label for="calc-sazba">Úroková sazba <span class="field__rangeval" data-out="sazba"></span></label>' +
              '<input id="calc-sazba" data-range data-key="sazba" type="range" min="0.5" max="10" step="0.01"></div>' +
            '<div class="field"><label for="calc-doba">Doba splácení <span class="field__rangeval" data-out="doba"></span></label>' +
              '<input id="calc-doba" data-range data-key="doba" type="range" min="5" max="40" step="1"></div>' +
            '<div class="field"><label>Typ nemovitosti</label>' +
              '<div class="seg" role="group" aria-label="Typ nemovitosti">' +
                '<button type="button" data-seg="typ" data-val="vlastni">Vlastní bydlení</button>' +
                '<button type="button" data-seg="typ" data-val="investice">Investiční</button></div></div>' +
            '<div class="field" data-mlady-field><label>Je vám méně než 36 let?</label>' +
              '<div class="seg" role="group" aria-label="Věk do 36 let">' +
                '<button type="button" data-seg="mlady" data-val="true">Ano</button>' +
                '<button type="button" data-seg="mlady" data-val="false">Ne</button></div></div>' +
          '</div>' +
          '<button type="button" class="calc__advanced-toggle" data-adv-toggle aria-expanded="false">Pokročilé nastavení ▾</button>' +
          '<div class="calc__group" data-advanced hidden>' +
            '<div class="field"><label for="calc-fixace">Fixační období</label>' +
              '<select id="calc-fixace" data-key="fixace">' + fixOpts + '</select></div>' +
            '<div class="field"><label for="calc-sazbaPo">Očekávaná sazba po fixaci</label>' +
              '<div class="field__input"><input id="calc-sazbaPo" data-num data-key="sazbaPo" type="text" inputmode="decimal" autocomplete="off" placeholder="např. 6"><span class="field__suffix">%</span></div></div>' +
            moneyField("extraMesic", "Mimořádná měsíční splátka") +
            moneyField("prijem", "Čistý měsíční příjem domácnosti") +
            moneyField("vydaje", "Běžné měsíční výdaje (bez splátky)") +
            moneyField("zavazky", "Splátky jiných úvěrů měsíčně") +
          '</div>' +
          '<div class="calc__share">' +
            '<button type="button" class="btn btn--ghost" data-copy>🔗 Zkopírovat odkaz na scénář</button>' +
            '<button type="button" class="btn btn--ghost" data-print>🖨️ Vytisknout / uložit PDF</button>' +
          '</div>' +
        '</form>' +
        '<div class="calc__outputs">' +
          '<p class="calc__disclaimer">Orientační výpočet. Skutečný splátkový kalendář banky se může lišit (způsob úročení, zaokrouhlování, datum čerpání a další smluvní podmínky).</p>' +
          '<div class="metrics" data-metrics></div>' +
          '<div class="means-box" data-ltv-means></div>' +
          '<div><h4>Jedna splátka, tři pohledy</h4><div class="three-views" data-three-views></div></div>' +
          '<div><h4>Vlastní zdroje nejsou totéž co „peníze na složení“</h4><div class="card"><div class="breakdown" data-breakdown></div></div></div>' +
          '<div><h4>Kolik si můžu dovolit vs. kolik mi půjčí banka</h4><div class="abc" data-abc></div></div>' +
          '<div><h4>Stres test: co když…</h4><div class="stress" data-stress></div></div>' +
          '<div class="charts" data-charts>' +
            '<div class="chart-card"><h4>Vývoj dluhu v čase</h4><div class="chart-card__canvas"><canvas data-chart="balance" role="img" aria-label="Graf poklesu zbývajícího dluhu v čase. Číselné hodnoty najdete ve splátkovém kalendáři níže."></canvas></div><div data-chart-fallback="balance"></div></div>' +
            '<div class="chart-card"><h4>Složení splátek (jistina vs. úrok)</h4><div class="chart-card__canvas"><canvas data-chart="composition" role="img" aria-label="Graf složení splátek na jistinu a úrok v jednotlivých letech."></canvas></div><div data-chart-fallback="composition"></div></div>' +
          '</div>' +
          '<div><div style="display:flex;justify-content:space-between;align-items:center;gap:var(--sp-3);flex-wrap:wrap"><h4 style="margin:0">Splátkový kalendář po letech</h4><button type="button" class="btn btn--ghost" data-csv>⬇ Stáhnout (CSV)</button></div><div class="amort" data-amort></div></div>' +
        '</div>' +
      '</div>';
  }

  /* --- Zápis stavu do vstupů --- */
  function syncInputs() {
    root.querySelectorAll("[data-money]").forEach(function (el) {
      var k = el.getAttribute("data-key");
      if (document.activeElement !== el) el.value = state[k] ? fmtInt(state[k]) : (state[k] === 0 ? "0" : "");
    });
    root.querySelectorAll("[data-num]").forEach(function (el) {
      var k = el.getAttribute("data-key");
      if (document.activeElement !== el) el.value = state[k] === "" || state[k] == null ? "" : String(state[k]).replace(".", ",");
    });
    var sazba = root.querySelector('[data-key="sazba"]'); if (sazba) sazba.value = state.sazba;
    var doba = root.querySelector('[data-key="doba"]'); if (doba) doba.value = state.doba;
    var fix = root.querySelector('[data-key="fixace"]'); if (fix) fix.value = state.fixace;
    root.querySelector('[data-out="sazba"]').textContent = String(state.sazba).replace(".", ",") + " %";
    root.querySelector('[data-out="doba"]').textContent = state.doba + " let";
    root.querySelectorAll('[data-seg="typ"]').forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-val") === state.typ)); });
    root.querySelectorAll('[data-seg="mlady"]').forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-val") === String(state.mlady))); });
    var mladyField = root.querySelector("[data-mlady-field]");
    if (mladyField) mladyField.style.display = state.typ === "investice" ? "none" : "";
  }

  /* --- Výpočet + render výstupů --- */
  function indicator(level, text) {
    return '<span class="ind ind--' + level + '"><span class="ind__dot"></span>' + text + '</span>';
  }

  function compute() {
    var loan = state.uver, term = state.doba * 12;
    var rateChanges = [];
    if (state.sazbaPo !== "" && state.sazbaPo != null && parseNum(state.sazbaPo) > 0 && state.fixace * 12 < term) {
      rateChanges.push({ fromMonth: state.fixace * 12 + 1, annualRatePct: parseNum(state.sazbaPo) });
    }
    var sched = C.generateAmortizationSchedule(loan, state.sazba, term, {
      extraMonthly: state.extraMesic || 0, rateChanges: rateChanges
    });
    var firstPayment = sched.rows.length ? sched.rows[0].payment : 0;

    var ltv = C.calculateLTV(loan, state.odhad || state.cena);
    var dsti = state.prijem ? C.calculateDSTI(firstPayment, state.zavazky || 0, state.prijem) : null;
    var dti = state.prijem ? C.calculateDTI(loan, state.prijem * 12) : null;

    return { sched: sched, firstPayment: firstPayment, ltv: ltv, dsti: dsti, dti: dti, loan: loan, term: term };
  }

  function renderMetrics(r) {
    var lmax = maxLtv();
    var ltvLevel = r.ltv <= lmax - 5 ? "green" : (r.ltv <= lmax ? "amber" : "red");
    var m = root.querySelector("[data-metrics]");

    var cards = [
      { label: "Měsíční splátka", value: fmtCZK(r.firstPayment) },
      { label: "Celkem zaplaceno", value: fmtCZK(r.sched.totalPaid) },
      { label: "Zaplacené úroky", value: fmtCZK(r.sched.totalInterest) },
      { label: "Přeplatek (úroky/jistina)", value: r.loan ? fmtPct(r.sched.totalInterest / r.loan * 100) : "—" },
      { label: "LTV (vůči odhadu)", value: fmtPct(r.ltv), ind: indicator(ltvLevel, ltvLevel === "green" ? "v mezích (limit " + lmax + " %)" : (ltvLevel === "amber" ? "u limitu " + lmax + " %" : "nad limitem " + lmax + " %")) },
      { label: "Doba splácení", value: (r.sched.months / 12).toFixed(1).replace(".", ",") + " let" }
    ];
    if (r.dsti != null) {
      var dLevel = r.dsti < dstiThr() ? "green" : (r.dsti <= dstiThr() + 10 ? "amber" : "red");
      cards.push({ label: "DSTI (orientačně)", value: fmtPct(r.dsti), ind: indicator(dLevel, "doporučení < " + dstiThr() + " %") });
    }
    if (r.dti != null) {
      var tLevel = r.dti < dtiThr() ? "green" : (r.dti <= dtiThr() + 1 ? "amber" : "red");
      cards.push({ label: "DTI (orientačně)", value: r.dti.toFixed(1).replace(".", ",") + "×", ind: indicator(tLevel, "doporučení < " + dtiThr() + "×") });
    }

    m.innerHTML = cards.map(function (c) {
      return '<div class="metric"><div class="metric__label">' + c.label + '</div>' +
             '<div class="metric__value">' + c.value + '</div>' + (c.ind || "") + '</div>';
    }).join("");
  }

  function renderLtvMeans(r) {
    var lmax = maxLtv();
    var box = root.querySelector("[data-ltv-means]");
    var txt;
    if (r.ltv <= lmax - 5) txt = "Váš úvěr je pohodlně pod limitem " + lmax + " % hodnoty zajištění. Máte prostor i kdyby banka ocenila nemovitost níže, než je kupní cena.";
    else if (r.ltv <= lmax) txt = "Jste těsně pod limitem " + lmax + " %. Pozor: pokud banka ocení nemovitost níže než kupní cenu, LTV povyskočí a můžete se dostat nad limit — připravte si rezervu ve vlastních zdrojích.";
    else txt = "Úvěr přesahuje limit " + lmax + " % hodnoty zajištění. Budete potřebovat víc vlastních zdrojů, nižší úvěr, nebo jiné zajištění. Připomínáme: LTV se počítá z odhadu, ne z kupní ceny.";
    box.innerHTML = "<h4>Co pro vás znamená LTV " + fmtPct(r.ltv) + "?</h4><p>" + txt + "</p>";
  }

  function renderThreeViews(r) {
    var host = root.querySelector("[data-three-views]");
    var youText;
    if (r.dsti != null) {
      var aff = C.calculateAffordability(state.prijem, state.vydaje || 0, state.zavazky || 0, r.firstPayment);
      youText = "Po splátce a běžných výdajích vám měsíčně zbývá přibližně <strong>" + fmtCZK(aff.remaining) + "</strong>. To je vaše skutečná rezerva na nečekané výdaje.";
    } else {
      youText = "Zadejte příjem a výdaje v pokročilém nastavení a uvidíte, kolik vám po splátce reálně zbyde.";
    }
    host.innerHTML =
      '<div class="view view--bank"><div class="view__label">🏦 Banka</div><p>Posuzuje příjem, závazky, historii v registrech a hodnotu zajištění. Splátka ' + fmtCZK(r.firstPayment) + ' je jen část rozhodnutí.</p></div>' +
      '<div class="view view--reg"><div class="view__label">⚖️ Regulace</div><p>Závazné je LTV (' + fmtPct(r.ltv) + '). DSTI/DTI jsou jen doporučení — ne důvod k automatickému zamítnutí.</p></div>' +
      '<div class="view view--you"><div class="view__label">🧠 Vy</div><p>' + youText + '</p></div>';
  }

  function renderBreakdown(r) {
    var host = root.querySelector("[data-breakdown]");
    var txCosts = Math.round((state.cena || 0) * 0.03);
    var downPayment = (state.cena || 0) - r.loan;
    var reserve = (state.vlastni || 0) - downPayment - txCosts;
    var rows = [
      ["Vaše úspory", fmtCZK(state.vlastni || 0)],
      ["− Akontace (cena − úvěr)", fmtCZK(downPayment)],
      ["− Transakční náklady (odhad ~3 %: katastr, právní servis, odhad)", fmtCZK(txCosts)]
    ];
    var reserveClass = reserve < 0 ? ' style="color:var(--color-danger)"' : "";
    var html = rows.map(function (x) { return '<div class="breakdown__row"><span>' + x[0] + '</span><span>' + x[1] + '</span></div>'; }).join("");
    html += '<div class="breakdown__row breakdown__row--total"><span>= Hotovostní rezerva po koupi</span><span' + reserveClass + '>' + fmtCZK(reserve) + '</span></div>';
    if (reserve < 0) html += '<p class="text-muted" style="margin-top:var(--sp-3)">⚠️ Vaše úspory nepokryjí akontaci i náklady. Zvažte nižší cenu, vyšší úvěr (pozor na LTV) nebo více naspořit.</p>';
    else if (r.firstPayment && reserve < r.firstPayment * 3) html += '<p class="text-muted" style="margin-top:var(--sp-3)">⚠️ Po koupi zbývá málo. Zdravá rezerva bývá 3–6 měsíčních splátek (' + fmtCZK(r.firstPayment * 3) + '–' + fmtCZK(r.firstPayment * 6) + ').</p>';
    host.innerHTML = html;
  }

  function renderAbc(r) {
    var host = root.querySelector("[data-abc]");
    if (!state.prijem) { host.innerHTML = '<p class="text-muted">Zadejte čistý příjem (a ideálně běžné výdaje) v pokročilém nastavení — spočítáme, kolik si můžete bezpečně dovolit.</p>'; return; }
    var maxB = C.calculateMaxLoan(state.prijem, state.zavazky || 0, state.sazba, r.term, { dsti: dstiThr(), dti: dtiThr() });
    var aff = C.calculateAffordability(state.prijem, state.vydaje || 0, state.zavazky || 0, r.firstPayment);
    host.innerHTML =
      '<div class="abc__card abc__card--c"><div class="abc__tag">🧠 C — kolik si bezpečně dovolím</div>' +
        '<div class="abc__val">' + fmtCZK(aff.remaining) + ' / měs. zbyde</div>' +
        '<p class="text-muted">Po splátce ' + fmtCZK(r.firstPayment) + ', výdajích a závazcích. ' + (aff.remaining < 0 ? "Záporné — scénář je nad vaše síly." : (aff.remaining < r.firstPayment ? "Malá rezerva." : "Rozumná rezerva.")) + '</p></div>' +
      '<div class="abc__card"><div class="abc__tag">🏦 B — kolik mi může schválit banka</div>' +
        '<div class="abc__val">≈ ' + fmtCZK(maxB.maxLoan) + '</div>' +
        '<p class="text-muted">Orientačně dle doporučení (rozhoduje ' + (maxB.binding === "dsti" ? "DSTI" : "DTI") + '). Není to verdikt banky.</p></div>' +
      '<div class="abc__card"><div class="abc__tag">⚖️ A — regulatorní pohled</div>' +
        '<div class="abc__val">LTV limit ' + maxLtv() + ' %</div>' +
        '<p class="text-muted">Závazný je limit LTV; DSTI/DTI jsou doporučení. Váš úvěr má LTV ' + fmtPct(r.ltv) + '.</p></div>';
  }

  function renderStress(r) {
    var host = root.querySelector("[data-stress]");
    var base = Math.round(state.sazba);
    var rates = [Math.max(0.5, base - 1), base, base + 1, base + 2, base + 3];
    var rateRows = C.stressTestRate(r.loan, r.term, rates).map(function (x) {
      var hl = Math.abs(x.rate - (state.sazba + 2)) < 0.6 ? ' style="font-weight:700"' : "";
      return '<tr' + hl + '><td>' + String(x.rate).replace(".", ",") + ' %</td><td>' + fmtCZK(x.payment) + '</td></tr>';
    }).join("");

    var incomeTable = "";
    if (state.prijem) {
      var scen = [{ label: "Dnešní příjem", factor: 1 }, { label: "−10 %", factor: 0.9 }, { label: "−20 %", factor: 0.8 }, { label: "Jeden příjem vypadne (−50 %)", factor: 0.5 }];
      var incRows = C.stressTestIncome(r.firstPayment, state.zavazky || 0, state.vydaje || 0, state.prijem, scen).map(function (x) {
        var neg = x.remaining < 0 ? ' class="neg"' : "";
        return '<tr><td>' + x.label + '</td><td' + neg + '>' + fmtCZK(x.remaining) + '</td></tr>';
      }).join("");
      incomeTable = '<div><h4 style="font-size:.95rem">Příjmový šok — kolik zbyde</h4><table><thead><tr><th>Scénář</th><th>Zbyde / měs.</th></tr></thead><tbody>' + incRows + '</tbody></table></div>';
    } else {
      incomeTable = '<div><p class="text-muted">Pro příjmový šok zadejte příjem a výdaje v pokročilém nastavení.</p></div>';
    }

    host.innerHTML =
      '<div><h4 style="font-size:.95rem">Úrokový šok — splátka při jiné sazbě</h4>' +
        '<table><thead><tr><th>Sazba</th><th>Splátka</th></tr></thead><tbody>' + rateRows + '</tbody></table>' +
        '<p class="text-muted">Tučně: dnešní sazba +2 p. b. Unesete to?</p></div>' +
      incomeTable;
  }

  function recompute() {
    var r = compute();
    renderMetrics(r);
    renderLtvMeans(r);
    renderThreeViews(r);
    renderBreakdown(r);
    renderAbc(r);
    renderStress(r);
    updateUrl();
    document.dispatchEvent(new CustomEvent("calc:updated", { detail: { state: Object.assign({}, state), result: r } }));
  }

  function scheduleRecompute() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(recompute);
  }

  /* --- Derivace vztahů mezi poli --- */
  function applyDerived(changedKey) {
    if (changedKey === "cena") {
      if (!touched.odhad) state.odhad = state.cena;
      state.uver = Math.max(0, state.cena - state.vlastni);
    } else if (changedKey === "vlastni") {
      state.uver = Math.max(0, state.cena - state.vlastni);
    } else if (changedKey === "uver") {
      touched.uver = true;
      state.vlastni = Math.max(0, state.cena - state.uver);
    } else if (changedKey === "odhad") {
      touched.odhad = true;
    }
  }

  /* --- URL --- */
  function updateUrl() {
    var self = document.getElementById("calculator-root");
    if (self && self.hidden) return; // píše jen aktivní režim
    var qs = C.serializeState({
      cena: state.cena, odhad: state.odhad, vlastni: state.vlastni, uver: state.uver,
      sazba: state.sazba, doba: state.doba, typ: state.typ, mlady: state.mlady,
      fixace: state.fixace, sazbaPo: state.sazbaPo, extraMesic: state.extraMesic,
      prijem: state.prijem, vydaje: state.vydaje, zavazky: state.zavazky
    });
    try { history.replaceState(null, "", window.location.pathname + "?" + qs + "#kalkulacka"); } catch (e) {}
  }

  /* --- Listenery --- */
  function attach() {
    root.querySelectorAll("[data-money]").forEach(function (el) {
      var k = el.getAttribute("data-key");
      el.addEventListener("input", function () { state[k] = parseNum(el.value); applyDerived(k); syncMoneyOnly(); scheduleRecompute(); });
      el.addEventListener("focus", function () { if (state[k]) el.value = String(Math.round(state[k])); });
      el.addEventListener("blur", function () { el.value = state[k] ? fmtInt(state[k]) : ""; });
    });
    root.querySelectorAll("[data-num]").forEach(function (el) {
      var k = el.getAttribute("data-key");
      el.addEventListener("input", function () { state[k] = el.value.trim() === "" ? "" : parseNum(el.value); scheduleRecompute(); });
    });
    root.querySelectorAll("[data-range]").forEach(function (el) {
      var k = el.getAttribute("data-key");
      el.addEventListener("input", function () {
        state[k] = parseNum(el.value);
        root.querySelector('[data-out="' + k + '"]').textContent = (k === "sazba" ? String(state[k]).replace(".", ",") + " %" : state[k] + " let");
        scheduleRecompute();
      });
    });
    var fix = root.querySelector('[data-key="fixace"]');
    if (fix) fix.addEventListener("change", function () { state.fixace = parseNum(fix.value); scheduleRecompute(); });

    root.querySelectorAll("[data-seg]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var seg = btn.getAttribute("data-seg"), val = btn.getAttribute("data-val");
        state[seg] = seg === "mlady" ? (val === "true") : val;
        syncInputs(); scheduleRecompute();
      });
    });

    var advToggle = root.querySelector("[data-adv-toggle]");
    var adv = root.querySelector("[data-advanced]");
    advToggle.addEventListener("click", function () {
      var open = !adv.hidden; adv.hidden = open;
      advToggle.setAttribute("aria-expanded", String(!open));
      advToggle.textContent = open ? "Pokročilé nastavení ▾" : "Pokročilé nastavení ▴";
    });

    var printBtn = root.querySelector("[data-print]");
    if (printBtn) printBtn.addEventListener("click", function () {
      document.body.classList.add("print-calc");
      window.print();
      setTimeout(function () { document.body.classList.remove("print-calc"); }, 500);
    });

    root.querySelector("[data-copy]").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      var url = window.location.href;
      var done = function () { btn.textContent = "✓ Odkaz zkopírován"; setTimeout(function () { btn.textContent = "🔗 Zkopírovat odkaz na scénář"; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);
      else done();
    });
  }

  // Během psaní do peněžního pole přepočítáme jen odvozená pole (ne formátování aktivního inputu).
  function syncMoneyOnly() {
    root.querySelectorAll("[data-money]").forEach(function (el) {
      var k = el.getAttribute("data-key");
      if (document.activeElement !== el) el.value = state[k] ? fmtInt(state[k]) : (state[k] === 0 ? "" : "");
    });
  }

  /* --- Init --- */
  function init() {
    root = document.getElementById("calculator-root");
    if (!root || !C) return;
    state = loadInitial();
    build();
    attach();
    syncInputs();
    recompute();
  }

  // Kalkulačka potřebuje regulatorní data pro prahy — počkáme na ně, ale funguje i bez nich (fallbacky).
  if (window.HypoData && window.HypoData.loaded) init();
  else document.addEventListener("hypodata:ready", init, { once: true });
  // Fallback, kdyby se data nenačetla (např. file://) — přesto vykreslit s výchozími prahy.
  setTimeout(function () { if (!root) init(); }, 2500);
})();
