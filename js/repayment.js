/*
 * repayment.js — Rozhodovací nástroje: splácení (P2)
 * 30 vs 35 let · mimořádná splátka vs rezerva · vyplatí se refinancovat.
 */
(function () {
  "use strict";
  var C = window.HypoCalc;

  function parseNum(v) { var n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
  function fmtInt(n) { try { return new Intl.NumberFormat("cs-CZ").format(Math.round(n)); } catch (e) { return String(Math.round(n)); } }
  function fmtCZK(n) { try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Math.round(n)); } catch (e) { return fmtInt(n) + " Kč"; } }
  function money(id, label, val, hint) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' + (hint ? '<span class="field__hint">' + hint + '</span>' : '') +
      '<div class="field__input"><input id="' + id + '" type="text" inputmode="numeric" value="' + fmtInt(val) + '"><span class="field__suffix">Kč</span></div></div>';
  }
  function pctField(id, label, val) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><div class="field__input"><input id="' + id + '" type="text" inputmode="decimal" value="' + String(val).replace(".", ",") + '"><span class="field__suffix">%</span></div></div>';
  }
  function monthsToText(m) { var y = Math.floor(m / 12), mm = m % 12; return (y ? y + " let " : "") + (mm ? mm + " měs." : (y ? "" : "0 měs.")); }

  /* --- 30 vs 35 let --- */
  function toolDoba() {
    var host = document.getElementById("tool-doba");
    if (!host) return;
    host.innerHTML = '<div class="grid grid--2"><div>' +
      money("d-uver", "Výše úvěru", 4000000) + pctField("d-sazba", "Úroková sazba", 5) +
      '<div class="field"><label>Porovnat doby</label><p class="text-muted" style="margin:0">30 let vs 35 let</p></div>' +
      '</div><div data-d-out></div></div>';
    function recompute() {
      var loan = parseNum(host.querySelector("#d-uver").value);
      var rate = parseNum(host.querySelector("#d-sazba").value);
      var r = C.compareTerms(loan, rate, [360, 420]);
      var a = r[0], bb = r[1];
      host.querySelector("[data-d-out]").innerHTML =
        '<div class="three-views">' +
          '<div class="view"><div class="view__label">30 let</div><p>Splátka: ' + fmtCZK(a.payment) + '<br>Úroky: ' + fmtCZK(a.totalInterest) + '<br>Celkem: ' + fmtCZK(a.totalPaid) + '</p></div>' +
          '<div class="view"><div class="view__label">35 let</div><p>Splátka: ' + fmtCZK(bb.payment) + '<br>Úroky: ' + fmtCZK(bb.totalInterest) + '<br>Celkem: ' + fmtCZK(bb.totalPaid) + '</p></div>' +
        '</div>' +
        '<div class="metric" style="margin-top:var(--sp-3)"><div class="metric__label">35 let: nižší splátka o</div><div class="metric__value" style="color:var(--color-success)">' + fmtCZK(a.payment - bb.payment) + '</div></div>' +
        '<div class="metric" style="margin-top:var(--sp-3)"><div class="metric__label">…ale na úrocích zaplatíte navíc</div><div class="metric__value" style="color:var(--color-danger)">' + fmtCZK(bb.totalInterest - a.totalInterest) + '</div></div>' +
        '<div class="note note--warn" style="margin-top:var(--sp-4)"><p>Delší doba znamená pohodlnější splátku, ale dráž celkově. Kompromis: vzít delší dobu a chybějící rozdíl posílat jako mimořádnou splátku, když můžete.</p></div>';
    }
    host.querySelectorAll("input").forEach(function (el) { el.addEventListener("input", recompute); });
    recompute();
  }

  /* --- Mimořádná splátka vs rezerva --- */
  function toolExtra() {
    var host = document.getElementById("tool-extra");
    if (!host) return;
    host.innerHTML = '<div class="grid grid--2"><div>' +
      money("e-zust", "Zbývající jistina", 3000000) + pctField("e-sazba", "Úroková sazba", 5) +
      '<div class="field"><label for="e-doba">Zbývající doba</label><div class="field__input"><input id="e-doba" type="text" inputmode="numeric" value="25"><span class="field__suffix">let</span></div></div>' +
      money("e-extra", "Mimořádná splátka měsíčně navíc", 5000) +
      money("e-rezerva", "Vaše volná hotovostní rezerva", 200000, "Kolik byste měli i po posílání navíc.") +
      '</div><div data-e-out></div></div>';
    function recompute() {
      var bal = parseNum(host.querySelector("#e-zust").value);
      var rate = parseNum(host.querySelector("#e-sazba").value);
      var months = Math.round(parseNum(host.querySelector("#e-doba").value) * 12);
      var extra = parseNum(host.querySelector("#e-extra").value);
      var rez = parseNum(host.querySelector("#e-rezerva").value);
      var basePay = C.calculateMonthlyPayment(bal, rate, months);
      var r = C.extraPaymentImpact(bal, rate, months, extra);
      var reserveMonths = basePay > 0 ? rez / basePay : 0;
      host.querySelector("[data-e-out]").innerHTML =
        '<div class="metric"><div class="metric__label">Splatíte dřív o</div><div class="metric__value" style="color:var(--color-success)">' + monthsToText(r.monthsSaved) + '</div></div>' +
        '<div class="metric" style="margin-top:var(--sp-3)"><div class="metric__label">Ušetříte na úrocích</div><div class="metric__value" style="color:var(--color-success)">' + fmtCZK(r.interestSaved) + '</div></div>' +
        '<div class="metric" style="margin-top:var(--sp-3)"><div class="metric__label">Nová doba splácení</div><div class="metric__value">' + monthsToText(r.newMonths) + '</div></div>' +
        (reserveMonths < 3
          ? '<div class="note note--critical" style="margin-top:var(--sp-4)"><div class="note__title">🔴 Nejdřív rezerva</div><p>Vaše rezerva vychází jen na ~' + reserveMonths.toFixed(1) + ' měsíční splátky. Rezerva bývá důležitější než rychlé splacení — než posílat navíc, doplňte polštář na 3–6 splátek.</p></div>'
          : '<div class="note note--tip" style="margin-top:var(--sp-4)"><p>Rezerva vypadá dostatečně (~' + reserveMonths.toFixed(1) + ' splátek). Mimořádná splátka pak dává smysl — zvažte i alternativní zhodnocení peněz.</p></div>');
    }
    host.querySelectorAll("input").forEach(function (el) { el.addEventListener("input", recompute); });
    recompute();
  }

  /* --- Refinancování --- */
  function toolRefi() {
    var host = document.getElementById("tool-refi");
    if (!host) return;
    host.innerHTML = '<div class="grid grid--2"><div>' +
      money("r-zust", "Zbývající jistina", 3000000) +
      '<div class="field"><label for="r-doba">Zbývající doba</label><div class="field__input"><input id="r-doba" type="text" inputmode="numeric" value="20"><span class="field__suffix">let</span></div></div>' +
      pctField("r-stara", "Současná sazba", 5.5) + pctField("r-nova", "Nová nabízená sazba", 4.5) +
      money("r-naklady", "Náklady refinancování", 15000, "Odhad, zápis zástavy, administrativa, případná sankce.") +
      '</div><div data-r-out></div></div>';
    function recompute() {
      var bal = parseNum(host.querySelector("#r-zust").value);
      var months = Math.round(parseNum(host.querySelector("#r-doba").value) * 12);
      var oldR = parseNum(host.querySelector("#r-stara").value);
      var newR = parseNum(host.querySelector("#r-nova").value);
      var costs = parseNum(host.querySelector("#r-naklady").value);
      var r = C.calculateRefinancingBreakeven(bal, months, oldR, newR, costs);
      var worth = r.monthlySaving > 0 && isFinite(r.breakevenMonths) && r.breakevenMonths < months;
      host.querySelector("[data-r-out]").innerHTML =
        '<div class="metric"><div class="metric__label">Měsíční úspora</div><div class="metric__value" style="color:' + (r.monthlySaving > 0 ? 'var(--color-success)' : 'var(--color-danger)') + '">' + fmtCZK(r.monthlySaving) + '</div></div>' +
        '<div class="metric" style="margin-top:var(--sp-3)"><div class="metric__label">Náklady se vrátí za</div><div class="metric__value">' + (isFinite(r.breakevenMonths) ? monthsToText(r.breakevenMonths) : "—") + '</div></div>' +
        '<div class="metric" style="margin-top:var(--sp-3)"><div class="metric__label">Celková úspora (po nákladech)</div><div class="metric__value" style="color:' + (r.totalSaving > 0 ? 'var(--color-success)' : 'var(--color-danger)') + '">' + fmtCZK(r.totalSaving) + '</div></div>' +
        (worth
          ? '<div class="note note--tip" style="margin-top:var(--sp-4)"><div class="note__title">🟢 Refinancování se pravděpodobně vyplatí</div><p>Náklady se vrátí za ' + monthsToText(r.breakevenMonths) + ' a pak už jen spoříte. Ověřte přesné podmínky a sankce u banky.</p></div>'
          : '<div class="note note--warn" style="margin-top:var(--sp-4)"><div class="note__title">🟠 Refinancování se spíš nevyplatí</div><p>Úspora nepřeváží náklady v rámci zbývající doby. Nejlepší okno bývá konec fixace, kdy lze přejít obvykle bez sankce.</p></div>');
    }
    host.querySelectorAll("input").forEach(function (el) { el.addEventListener("input", recompute); });
    recompute();
  }

  function init() {
    if (!C) return;
    toolDoba(); toolExtra(); toolRefi();
    if (window.HypoTerms) window.HypoTerms.enhance(document.getElementById("splaceni"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
