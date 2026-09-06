/*
 * calculator-core.js — Čistý matematický model hypotéky (Fáze 2)
 *
 * Bez DOM. Funguje v prohlížeči (window.HypoCalc) i v Node (module.exports),
 * aby šel testovat samostatně (calculator-core.test.js).
 *
 * Model je ORIENTAČNÍ: monthlyRate = annualRate / 12, anuitní splácení.
 * Skutečný splátkový kalendář banky se může lišit (úročení, zaokrouhlování,
 * datum čerpání a další smluvní podmínky).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HypoCalc = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var EPS = 0.005; // tolerance pro nulový zůstatek (Kč)

  /** Měsíční anuitní splátka. */
  function calculateMonthlyPayment(principal, annualRatePct, termMonths) {
    if (principal <= 0 || termMonths <= 0) return 0;
    var r = (annualRatePct / 100) / 12;
    if (r === 0) return principal / termMonths;
    var f = Math.pow(1 + r, termMonths);
    return principal * (r * f) / (f - 1);
  }

  /** Kolik jistiny odpovídá dané měsíční splátce (inverzní k anuitě). */
  function principalFromPayment(payment, annualRatePct, termMonths) {
    if (payment <= 0 || termMonths <= 0) return 0;
    var r = (annualRatePct / 100) / 12;
    if (r === 0) return payment * termMonths;
    var f = Math.pow(1 + r, termMonths);
    return payment * (f - 1) / (r * f);
  }

  /**
   * Amortizační kalendář.
   * opts:
   *   extraMonthly:   mimořádná měsíční splátka navíc (Kč)
   *   oneTimePayments: [{ month, amount }] jednorázové mimořádné splátky
   *   rateChanges:    [{ fromMonth, annualRatePct }] změny sazby (např. po fixaci)
   * Vrací: { rows:[{month, payment, interest, principal, extra, balance}],
   *          totalInterest, totalPaid, months }
   */
  function generateAmortizationSchedule(principal, annualRatePct, termMonths, opts) {
    opts = opts || {};
    var extraMonthly = opts.extraMonthly || 0;
    var oneTime = {};
    (opts.oneTimePayments || []).forEach(function (p) {
      oneTime[p.month] = (oneTime[p.month] || 0) + p.amount;
    });
    var rateChanges = {};
    (opts.rateChanges || []).forEach(function (c) { rateChanges[c.fromMonth] = c.annualRatePct; });

    var rows = [];
    var balance = principal;
    var curRate = annualRatePct;
    var basePayment = calculateMonthlyPayment(balance, curRate, termMonths);
    var totalInterest = 0, totalPaid = 0;

    for (var m = 1; m <= termMonths && balance > EPS; m++) {
      // Změna sazby → přepočet splátky na zbývající zůstatek a zbývající dobu.
      if (rateChanges[m] != null) {
        curRate = rateChanges[m];
        basePayment = calculateMonthlyPayment(balance, curRate, termMonths - m + 1);
      }

      var monthlyRate = (curRate / 100) / 12;
      var interest = balance * monthlyRate;
      var payment = basePayment;
      var principalPortion = payment - interest;

      // Poslední řádná splátka nesmí přeplatit jistinu.
      if (principalPortion >= balance) {
        principalPortion = balance;
        payment = interest + principalPortion;
      }
      balance -= principalPortion;

      // Mimořádné splátky (měsíční + jednorázové), max do výše zůstatku.
      var extra = extraMonthly + (oneTime[m] || 0);
      if (extra > balance) extra = balance;
      if (extra < 0) extra = 0;
      balance -= extra;

      totalInterest += interest;
      totalPaid += payment + extra;

      rows.push({
        month: m,
        payment: payment,
        interest: interest,
        principal: principalPortion,
        extra: extra,
        balance: balance < EPS ? 0 : balance
      });
    }

    return { rows: rows, totalInterest: totalInterest, totalPaid: totalPaid, months: rows.length };
  }

  /** LTV = úvěr / hodnota zajištění (odhad), v %. Pozor: NE vůči kupní ceně. */
  function calculateLTV(loanAmount, collateralValue) {
    if (collateralValue <= 0) return 0;
    return (loanAmount / collateralValue) * 100;
  }

  /** DSTI = (splátka + ostatní závazky) / čistý měsíční příjem, v %. */
  function calculateDSTI(monthlyPayment, existingObligations, netMonthlyIncome) {
    if (netMonthlyIncome <= 0) return 0;
    return ((monthlyPayment + existingObligations) / netMonthlyIncome) * 100;
  }

  /** DTI = celkový dluh / čistý roční příjem (násobek). */
  function calculateDTI(totalLoanAmount, annualNetIncome) {
    if (annualNetIncome <= 0) return 0;
    return totalLoanAmount / annualNetIncome;
  }

  /**
   * (B) Kolik může banka orientačně schválit — omezeno DSTI a DTI prahy.
   * thresholds: { dsti (%), dti (×) }. Vrací { maxLoan, byDsti, byDti, binding }.
   */
  function calculateMaxLoan(netMonthlyIncome, existingObligations, annualRatePct, termMonths, thresholds) {
    thresholds = thresholds || { dsti: 40, dti: 8 };
    var maxPaymentByDsti = netMonthlyIncome * (thresholds.dsti / 100) - existingObligations;
    if (maxPaymentByDsti < 0) maxPaymentByDsti = 0;
    var byDsti = principalFromPayment(maxPaymentByDsti, annualRatePct, termMonths);
    var byDti = netMonthlyIncome * 12 * thresholds.dti;
    var maxLoan = Math.min(byDsti, byDti);
    return {
      maxLoan: maxLoan,
      byDsti: byDsti,
      byDti: byDti,
      binding: byDsti <= byDti ? "dsti" : "dti"
    };
  }

  /**
   * (C) Kolik si můžu bezpečně dovolit — co zbyde po splátce a výdajích.
   * Vrací { remaining, ratio } (ratio = podíl volných peněz na příjmu).
   */
  function calculateAffordability(netMonthlyIncome, livingCosts, existingObligations, monthlyPayment) {
    var remaining = netMonthlyIncome - livingCosts - existingObligations - monthlyPayment;
    var ratio = netMonthlyIncome > 0 ? (remaining / netMonthlyIncome) * 100 : 0;
    return { remaining: remaining, ratio: ratio };
  }

  /** Hotovost po koupi = úspory − akontace − transakční náklady. Akontace = cena − úvěr. */
  function calculateCashAfterPurchase(ownFunds, purchasePrice, loanAmount, extraCosts) {
    var downPayment = purchasePrice - loanAmount;
    return ownFunds - downPayment - (extraCosts || 0);
  }

  /** Break-even refinancování. Vrací { monthlySaving, totalSaving, breakevenMonths }. */
  function calculateRefinancingBreakeven(remainingBalance, remainingMonths, oldRatePct, newRatePct, costs) {
    var oldPay = calculateMonthlyPayment(remainingBalance, oldRatePct, remainingMonths);
    var newPay = calculateMonthlyPayment(remainingBalance, newRatePct, remainingMonths);
    var monthlySaving = oldPay - newPay;
    var totalSaving = monthlySaving * remainingMonths - (costs || 0);
    var breakevenMonths = monthlySaving > 0 ? Math.ceil((costs || 0) / monthlySaving) : Infinity;
    return { monthlySaving: monthlySaving, totalSaving: totalSaving, breakevenMonths: breakevenMonths };
  }

  /** Úrokový šok — splátky při různých sazbách. rateScenarios: pole % sazeb. */
  function stressTestRate(balance, remainingMonths, rateScenarios) {
    return (rateScenarios || []).map(function (rate) {
      return { rate: rate, payment: calculateMonthlyPayment(balance, rate, remainingMonths) };
    });
  }

  /**
   * Příjmový šok — co zbyde při poklesu příjmu.
   * scenarios: [{ label, factor }] (factor 0.9 = −10 %, 0 = výpadek).
   */
  function stressTestIncome(monthlyPayment, existingObligations, livingCosts, netMonthlyIncome, scenarios) {
    return (scenarios || []).map(function (s) {
      var income = netMonthlyIncome * s.factor;
      var remaining = income - livingCosts - existingObligations - monthlyPayment;
      return { label: s.label, income: income, remaining: remaining };
    });
  }

  /**
   * (Režim B) Jak drahou nemovitost si můžu dovolit — z příjmu, úspor a rezervy.
   * Vrací maximální cenu nemovitosti při daném limitu LTV a prahu DSTI/DTI.
   * params: { netIncome, obligations, savings, reserve, termMonths, rate, ltvMax, dstiMax, dtiMax }
   * Vrací: { maxProperty, loan, ownForPurchase, maxLoanByIncome, pByLtv, pByIncome, bottleneck }
   *   bottleneck: "vlastni_zdroje" | "prijem" — co omezuje víc.
   */
  function maxAffordableProperty(params) {
    var netIncome = params.netIncome || 0;
    var obligations = params.obligations || 0;
    var savings = params.savings || 0;
    var reserve = params.reserve || 0;
    var termMonths = params.termMonths || 360;
    var rate = params.rate || 0;
    var ltvMax = params.ltvMax || 80;
    var dstiMax = params.dstiMax || 40;
    var dtiMax = params.dtiMax || 8;

    var ownForPurchase = Math.max(0, savings - reserve);
    var maxLoanByIncome = calculateMaxLoan(netIncome, obligations, rate, termMonths, { dsti: dstiMax, dti: dtiMax }).maxLoan;

    // Omezení výší úvěru vůči LTV: cena ≤ vlastní_na_nákup / (1 − LTVmax).
    var pByLtv = ltvMax < 100 ? ownForPurchase / (1 - ltvMax / 100) : Infinity;
    // Omezení příjmem: cena ≤ max_úvěr + vlastní_na_nákup.
    var pByIncome = maxLoanByIncome + ownForPurchase;

    var maxProperty = Math.max(0, Math.min(pByLtv, pByIncome));
    var loan = Math.max(0, maxProperty - ownForPurchase);

    return {
      maxProperty: maxProperty,
      loan: loan,
      ownForPurchase: ownForPurchase,
      maxLoanByIncome: maxLoanByIncome,
      pByLtv: pByLtv,
      pByIncome: pByIncome,
      bottleneck: pByIncome <= pByLtv ? "prijem" : "vlastni_zdroje"
    };
  }

  /**
   * Bottleneck engine — najde hlavní omezení situace a vrátí lidský popis.
   * s: { ltv, ltvMax, dsti, dstiThr, dti, dtiThr, reserveAfter, monthlyPayment, remainingAfterCosts }
   * Vrací: { level: "green|amber|red", key, title, text } — nejzávažnější nález.
   */
  function detectBottleneck(s) {
    var problems = [];
    function add(level, key, title, text) { problems.push({ level: level, key: key, title: title, text: text }); }

    if (s.ltv != null && s.ltvMax != null) {
      if (s.ltv > s.ltvMax + 0.01) add("red", "vlastni_zdroje", "Vlastní zdroje / LTV", "Úvěr přesahuje závazný limit LTV " + s.ltvMax + " %. Potřebujete víc vlastních zdrojů, levnější nemovitost nebo jiné zajištění.");
      else if (s.ltv > s.ltvMax - 5) add("amber", "ltv", "LTV u hranice", "Jste těsně pod limitem " + s.ltvMax + " %. Nižší bankovní ocenění by vás mohlo dostat nad limit.");
    }
    if (s.reserveAfter != null) {
      if (s.reserveAfter < 0) add("red", "vlastni_zdroje", "Nedostatek vlastních prostředků", "Úspory nepokryjí akontaci a náklady koupě. Chybí přibližně " + Math.round(-s.reserveAfter) + " Kč.");
      else if (s.monthlyPayment && s.reserveAfter < s.monthlyPayment * 3) add("amber", "rezerva", "Nízká rezerva po koupi", "Po koupi zbývá málo hotovosti. Zdravá rezerva bývá 3–6 měsíčních splátek.");
    }
    if (s.dsti != null && s.dstiThr != null) {
      if (s.dsti > s.dstiThr + 10) add("red", "prijem", "Vysoké příjmové zatížení", "Splátky by braly velkou část příjmu (DSTI ~" + Math.round(s.dsti) + " %). Zvažte nižší úvěr nebo delší splatnost.");
      else if (s.dsti > s.dstiThr) add("amber", "prijem", "Zvýšené příjmové zatížení", "DSTI ~" + Math.round(s.dsti) + " % je nad doporučenou obezřetností " + s.dstiThr + " %.");
    }
    if (s.remainingAfterCosts != null && s.remainingAfterCosts < 0) {
      add("red", "prijem", "Nevychází rozpočet", "Po splátce a běžných výdajích by domácnosti nezbývalo nic. Scénář je nad vaše síly.");
    }

    if (!problems.length) return { level: "green", key: "ok", title: "Zásadní překážku nevidíme", text: "Podle zadaných parametrů situace vypadá zdravě. Ověřte si detaily a porovnejte více nabídek." };
    // Nejzávažnější: nejdřív red, pak amber; v rámci úrovně první nalezený.
    var red = problems.filter(function (p) { return p.level === "red"; });
    return (red[0] || problems[0]);
  }

  /**
   * Dodatečná zástava — LTV vůči hodnotě VÍCE zastavených nemovitostí.
   * Vrací { ltvMain, ltvCombined, combinedValue }.
   */
  function combinedLtv(loanAmount, mainValue, additionalValue) {
    var combined = (mainValue || 0) + (additionalValue || 0);
    return {
      ltvMain: mainValue > 0 ? (loanAmount / mainValue) * 100 : 0,
      ltvCombined: combined > 0 ? (loanAmount / combined) * 100 : 0,
      combinedValue: combined
    };
  }

  /**
   * Dopad nižšího bankovního ocenění na potřebné vlastní zdroje.
   * Vrací { neededAtPrice, neededAtAppraisal, extraNeeded } (akontace + rozdíl).
   * Potřebná akontace = cena − (ocenění × LTVmax). Když je ocenění nižší, akontace roste.
   */
  function lowerAppraisalImpact(price, appraisal, ltvMax) {
    var maxLoanByPrice = price * (ltvMax / 100);
    var maxLoanByAppraisal = appraisal * (ltvMax / 100);
    // Kolik vlastních zdrojů je potřeba, aby úvěr nepřekročil LTV vůči danému ocenění.
    var neededAtPrice = Math.max(0, price - maxLoanByPrice);
    var neededAtAppraisal = Math.max(0, price - maxLoanByAppraisal);
    return {
      neededAtPrice: neededAtPrice,
      neededAtAppraisal: neededAtAppraisal,
      extraNeeded: Math.max(0, neededAtAppraisal - neededAtPrice)
    };
  }

  /**
   * Konsolidace — sloučení hypotéky a dalších dluhů do jednoho zajištěného úvěru.
   * params: { mortgage, otherDebts:[{amount, monthlyPayment}], newRate, newTermMonths }
   * Vrací before/after souhrny. Delší splatnost sníží splátku, ale nesnižuje dluh;
   * původně nezajištěný dluh je po konsolidaci zajištěn nemovitostí.
   */
  function consolidation(params) {
    var mortgage = params.mortgage || 0;
    var others = params.otherDebts || [];
    var newRate = params.newRate || 0;
    var newTerm = params.newTermMonths || 360;

    var otherTotal = others.reduce(function (a, d) { return a + (d.amount || 0); }, 0);
    var otherMonthly = others.reduce(function (a, d) { return a + (d.monthlyPayment || 0); }, 0);
    var mortgageMonthly = calculateMonthlyPayment(mortgage, newRate, newTerm);

    var newTotal = mortgage + otherTotal;
    var newMonthly = calculateMonthlyPayment(newTotal, newRate, newTerm);

    return {
      before: { count: 1 + others.length, totalDebt: newTotal, totalMonthly: mortgageMonthly + otherMonthly },
      after: { count: 1, totalDebt: newTotal, monthly: newMonthly, termMonths: newTerm, secured: true },
      monthlySaving: (mortgageMonthly + otherMonthly) - newMonthly
    };
  }

  /**
   * Porovnání dob splatnosti (např. 30 vs 35 let).
   * Vrací pole { termMonths, years, payment, totalInterest, totalPaid }.
   */
  function compareTerms(principal, annualRatePct, termsMonths) {
    return (termsMonths || []).map(function (n) {
      var pay = calculateMonthlyPayment(principal, annualRatePct, n);
      var totalPaid = pay * n;
      return { termMonths: n, years: n / 12, payment: pay, totalPaid: totalPaid, totalInterest: totalPaid - principal };
    });
  }

  /**
   * Dopad mimořádné (pravidelné měsíční) splátky navíc.
   * Vrací { baseMonths, newMonths, monthsSaved, interestSaved, baseInterest, newInterest }.
   */
  function extraPaymentImpact(balance, annualRatePct, remainingMonths, extraMonthly) {
    var base = generateAmortizationSchedule(balance, annualRatePct, remainingMonths, {});
    var withExtra = generateAmortizationSchedule(balance, annualRatePct, remainingMonths, { extraMonthly: extraMonthly || 0 });
    return {
      baseMonths: base.months,
      newMonths: withExtra.months,
      monthsSaved: base.months - withExtra.months,
      baseInterest: base.totalInterest,
      newInterest: withExtra.totalInterest,
      interestSaved: base.totalInterest - withExtra.totalInterest
    };
  }

  /* --- URL state (sdílení scénáře odkazem) --- */
  var STATE_KEYS = ["cena", "odhad", "vlastni", "uver", "sazba", "doba", "typ", "mlady",
                    "fixace", "sazbaPo", "extraMesic", "prijem", "vydaje", "zavazky"];

  function serializeState(params) {
    var parts = [];
    STATE_KEYS.forEach(function (k) {
      if (params[k] != null && params[k] !== "") parts.push(k + "=" + encodeURIComponent(params[k]));
    });
    return parts.join("&");
  }

  function deserializeState(queryString) {
    var out = {};
    if (!queryString) return out;
    queryString.replace(/^[?#]/, "").split("&").forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split("=");
      var k = decodeURIComponent(kv[0]);
      if (STATE_KEYS.indexOf(k) === -1) return;
      var v = decodeURIComponent(kv[1] || "");
      if (v === "true") v = true; else if (v === "false") v = false;
      else if (v !== "" && !isNaN(Number(v))) v = Number(v);
      out[k] = v;
    });
    return out;
  }

  return {
    calculateMonthlyPayment: calculateMonthlyPayment,
    principalFromPayment: principalFromPayment,
    generateAmortizationSchedule: generateAmortizationSchedule,
    calculateLTV: calculateLTV,
    calculateDSTI: calculateDSTI,
    calculateDTI: calculateDTI,
    calculateMaxLoan: calculateMaxLoan,
    calculateAffordability: calculateAffordability,
    calculateCashAfterPurchase: calculateCashAfterPurchase,
    calculateRefinancingBreakeven: calculateRefinancingBreakeven,
    maxAffordableProperty: maxAffordableProperty,
    detectBottleneck: detectBottleneck,
    combinedLtv: combinedLtv,
    lowerAppraisalImpact: lowerAppraisalImpact,
    consolidation: consolidation,
    compareTerms: compareTerms,
    extraPaymentImpact: extraPaymentImpact,
    stressTestRate: stressTestRate,
    stressTestIncome: stressTestIncome,
    serializeState: serializeState,
    deserializeState: deserializeState,
    STATE_KEYS: STATE_KEYS
  };
});
