/*
 * tax-calculator.js — Daňový kalkulátor odpočtu úroků (Fáze 3)
 * Limit dle roku obstarání bytové potřeby (z tax.json). Zdůrazňuje rozdíl
 * odpočet od základu daně ≠ sleva na dani ≠ vrácení celé částky.
 */
(function () {
  "use strict";
  var TAX_RATE = 0.15; // orientační sazba daně z příjmů FO pro odhad úspory

  function fmtCZK(n) { try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Math.round(n)); } catch (e) { return Math.round(n) + " Kč"; } }
  function parseNum(v) { var n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }

  function limits() {
    var t = window.HypoData && window.HypoData.data && window.HypoData.data.tax && window.HypoData.data.tax.facts;
    return {
      old: t && t.odpocet_limit_do_2020 ? t.odpocet_limit_do_2020.value : 300000,
      neu: t && t.odpocet_limit_od_2021 ? t.odpocet_limit_od_2021.value : 150000
    };
  }

  function render(host) {
    host.innerHTML =
      '<div class="field"><label for="tax-uroky">Zaplacené úroky za rok</label>' +
        '<div class="field__input"><input id="tax-uroky" type="text" inputmode="numeric" placeholder="např. 120 000"><span class="field__suffix">Kč</span></div></div>' +
      '<div class="field" style="margin-top:var(--sp-3)"><label for="tax-rok">Rok obstarání bytové potřeby</label>' +
        '<span class="field__hint">Rozhoduje datum obstarání bytové potřeby, ne datum smlouvy.</span>' +
        '<div class="field__input"><input id="tax-rok" type="text" inputmode="numeric" placeholder="např. 2024" style="max-width:140px"></div></div>' +
      '<div data-tax-out style="margin-top:var(--sp-4)"></div>';

    var uroky = host.querySelector("#tax-uroky");
    var rok = host.querySelector("#tax-rok");
    var out = host.querySelector("[data-tax-out]");

    function recompute() {
      var u = parseNum(uroky.value), y = parseNum(rok.value);
      if (u <= 0 || y < 1990 || y > 2100) { out.innerHTML = '<p class="text-muted">Zadejte zaplacené úroky a rok obstarání.</p>'; return; }
      var lim = limits();
      var limit = y <= 2020 ? lim.old : lim.neu;
      var deduction = Math.min(u, limit);
      var saving = deduction * TAX_RATE;
      out.innerHTML =
        '<div class="breakdown">' +
          '<div class="breakdown__row"><span>Maximální odpočitatelná částka (rok ' + y + ')</span><span>' + fmtCZK(limit) + '</span></div>' +
          '<div class="breakdown__row"><span>Uplatnitelný odpočet od základu daně</span><span>' + fmtCZK(deduction) + '</span></div>' +
          '<div class="breakdown__row breakdown__row--total"><span>Orientační úspora na dani (≈ ' + (TAX_RATE * 100) + ' %)</span><span>' + fmtCZK(saving) + '</span></div>' +
        '</div>' +
        '<div class="note note--warn" style="margin-top:var(--sp-4)"><div class="note__title">Pozor na časté nedorozumění</div>' +
        '<p>Odpočet <strong>od základu daně</strong> není totéž co sleva na dani ani vrácení celé částky úroků. Ze zaplacených ' + fmtCZK(deduction) + ' úroků reálně ušetříte přibližně <strong>' + fmtCZK(saving) + '</strong>, ne ' + fmtCZK(deduction) + '.</p></div>';
    }

    uroky.addEventListener("input", recompute);
    rok.addEventListener("input", recompute);
    recompute();
  }

  function init() {
    var host = document.getElementById("tax-calculator");
    if (host) render(host);
  }
  if (window.HypoData && window.HypoData.loaded) init();
  else document.addEventListener("hypodata:ready", init, { once: true });
})();
