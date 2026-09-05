/*
 * calculator-core.test.js — testy čistého matematického modelu.
 * Spuštění:  node js/calculator-core.test.js
 * Bez frameworku — vlastní mini-harness. Nenulový exit kód při chybě.
 */
var C = require("./calculator-core.js");

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; }
  else { failed++; console.error("  ✗ " + name + (extra ? "  → " + extra : "")); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.5 : tol); }

/* 1) Anuita: 3 000 000 Kč, 5 %, 30 let ≈ 16 104,65 Kč/měs. */
(function () {
  var p = C.calculateMonthlyPayment(3000000, 5, 360);
  ok("anuita 3M/5%/30y ≈ 16104.65", approx(p, 16104.65, 1), p.toFixed(2));
})();

/* 2) Nulový úrok: splátka = jistina / počet měsíců, žádné úroky. */
(function () {
  var p = C.calculateMonthlyPayment(1200000, 0, 240);
  ok("0% splátka = 5000", approx(p, 5000, 0.01), p);
  var s = C.generateAmortizationSchedule(1200000, 0, 240, {});
  ok("0% celkové úroky = 0", approx(s.totalInterest, 0, 0.01), s.totalInterest);
  ok("0% zůstatek na konci = 0", s.rows[s.rows.length - 1].balance === 0);
})();

/* 3) Invarianty standardního úvěru (4M/4.5%/30y). */
(function () {
  var principal = 4000000;
  var s = C.generateAmortizationSchedule(principal, 4.5, 360, {});
  var sumPrincipal = s.rows.reduce(function (a, r) { return a + r.principal + r.extra; }, 0);
  ok("Σ jistina = původní jistina", approx(sumPrincipal, principal, 1), sumPrincipal.toFixed(2));
  ok("poslední zůstatek ≈ 0", approx(s.rows[s.rows.length - 1].balance, 0, 0.5));
  ok("celkem zaplaceno = úroky + jistina", approx(s.totalPaid, s.totalInterest + principal, 1),
     s.totalPaid.toFixed(2) + " vs " + (s.totalInterest + principal).toFixed(2));
  ok("splátek přesně 360", s.months === 360, s.months);
})();

/* 4) Mimořádná měsíční splátka zkrátí dobu a sníží úroky. */
(function () {
  var base = C.generateAmortizationSchedule(4000000, 4.5, 360, {});
  var extra = C.generateAmortizationSchedule(4000000, 4.5, 360, { extraMonthly: 5000 });
  ok("extra splátka zkrátí dobu", extra.months < base.months, extra.months + " < " + base.months);
  ok("extra splátka sníží úroky", extra.totalInterest < base.totalInterest);
  // I s mimořádnými splátkami platí invariant Σ jistina = principal.
  var sump = extra.rows.reduce(function (a, r) { return a + r.principal + r.extra; }, 0);
  ok("invariant Σ jistina i s extra", approx(sump, 4000000, 1), sump.toFixed(2));
})();

/* 5) Jednorázová mimořádná splátka sníží zůstatek i celkové úroky. */
(function () {
  var base = C.generateAmortizationSchedule(4000000, 4.5, 360, {});
  var one = C.generateAmortizationSchedule(4000000, 4.5, 360, { oneTimePayments: [{ month: 12, amount: 300000 }] });
  ok("jednorázová splátka sníží úroky", one.totalInterest < base.totalInterest);
  ok("jednorázová splátka zkrátí dobu", one.months < base.months);
})();

/* 6) Změna sazby po fixaci mění splátku. */
(function () {
  var s = C.generateAmortizationSchedule(4000000, 4.5, 360, { rateChanges: [{ fromMonth: 61, annualRatePct: 6.5 }] });
  var before = s.rows[59].payment;  // měsíc 60 (poslední před změnou)
  var after = s.rows[61].payment;   // měsíc 62 (po změně)
  ok("vyšší sazba po fixaci → vyšší splátka", after > before, before.toFixed(0) + " → " + after.toFixed(0));
  ok("i po změně sazby zůstatek doběhne na 0", approx(s.rows[s.rows.length - 1].balance, 0, 0.5));
})();

/* 7) LTV vůči hodnotě zajištění (odhadu). */
(function () {
  var ltv = C.calculateLTV(4000000, 4600000);
  ok("LTV 4M / 4.6M ≈ 86.96 %", approx(ltv, 86.9565, 0.01), ltv.toFixed(4));
})();

/* 8) DSTI / DTI. */
(function () {
  var dsti = C.calculateDSTI(20000, 3000, 60000);
  ok("DSTI (20k+3k)/60k ≈ 38.33 %", approx(dsti, 38.333, 0.01), dsti.toFixed(3));
  var dti = C.calculateDTI(4000000, 600000);
  ok("DTI 4M / 600k = 6.67×", approx(dti, 6.6667, 0.01), dti.toFixed(4));
})();

/* 9) Max úvěr (B) — omezeno DSTI/DTI. */
(function () {
  var r = C.calculateMaxLoan(70000, 3000, 5, 360, { dsti: 40, dti: 8 });
  ok("maxLoan je kladné a konečné", r.maxLoan > 0 && isFinite(r.maxLoan), r.maxLoan.toFixed(0));
  ok("maxLoan = min(byDsti, byDti)", approx(r.maxLoan, Math.min(r.byDsti, r.byDti), 1));
  // Kontrola konzistence: splátka z maxLoanByDsti + závazky ≈ 40 % příjmu.
  var pay = C.calculateMonthlyPayment(r.byDsti, 5, 360);
  ok("byDsti odpovídá prahu DSTI 40 %", approx((pay + 3000) / 70000 * 100, 40, 0.1), ((pay + 3000) / 70000 * 100).toFixed(2));
})();

/* 10) Dostupnost (C) a hotovost po koupi. */
(function () {
  var a = C.calculateAffordability(70000, 25000, 3000, 20000);
  ok("zbytek = 70k−25k−3k−20k = 22k", approx(a.remaining, 22000, 0.01), a.remaining);
  var cash = C.calculateCashAfterPurchase(1200000, 5000000, 3800000, 150000);
  ok("hotovost po koupi = 1.2M − 1.2M akontace − 150k = -150k", approx(cash, -150000, 0.01), cash);
})();

/* 11) Refinancování — break-even. */
(function () {
  var r = C.calculateRefinancingBreakeven(3000000, 240, 5.5, 4.5, 15000);
  ok("refi: měsíční úspora > 0", r.monthlySaving > 0, r.monthlySaving.toFixed(0));
  ok("refi: break-even konečný", isFinite(r.breakevenMonths), r.breakevenMonths);
  ok("refi: celková úspora kladná", r.totalSaving > 0, r.totalSaving.toFixed(0));
})();

/* 12) Stres testy. */
(function () {
  var rate = C.stressTestRate(3800000, 360, [3, 5, 7]);
  ok("úrokový šok: 3 scénáře", rate.length === 3);
  ok("úrokový šok: vyšší sazba → vyšší splátka", rate[2].payment > rate[0].payment);
  var inc = C.stressTestIncome(20000, 3000, 25000, 70000, [{ label: "-20 %", factor: 0.8 }]);
  ok("příjmový šok: zbytek klesne", inc[0].remaining < (70000 - 25000 - 3000 - 20000));
})();

/* 13) URL state — round trip. */
(function () {
  var params = { cena: 5000000, vlastni: 1200000, uver: 3800000, sazba: 4.5, doba: 30, typ: "vlastni", mlady: true };
  var s = C.serializeState(params);
  var back = C.deserializeState(s);
  ok("serialize/deserialize round trip", back.cena === 5000000 && back.sazba === 4.5 && back.mlady === true && back.typ === "vlastni", s);
})();

/* --- Souhrn --- */
console.log("\n" + (failed === 0 ? "✓ VŠE OK" : "✗ SELHÁNÍ") + " — prošlo " + passed + ", selhalo " + failed);
process.exit(failed === 0 ? 0 : 1);
