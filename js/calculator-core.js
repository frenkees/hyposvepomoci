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
    stressTestRate: stressTestRate,
    stressTestIncome: stressTestIncome,
    serializeState: serializeState,
    deserializeState: deserializeState,
    STATE_KEYS: STATE_KEYS
  };
});
