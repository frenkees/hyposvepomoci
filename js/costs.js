/*
 * costs.js — Skutečné náklady bydlení + nájem vs. koupě (P2)
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

  /* --- Skutečné náklady bydlení --- */
  function toolNaklady() {
    var host = document.getElementById("tool-naklady");
    if (!host) return;
    host.innerHTML = '<div class="grid grid--2"><div>' +
      money("n-splatka", "Měsíční splátka hypotéky", 21000) +
      money("n-energie", "Energie (elektřina, plyn, voda)", 4500) +
      money("n-svj", "SVJ / fond oprav", 3000) +
      money("n-pojisteni", "Pojištění nemovitosti (měsíčně)", 400) +
      money("n-udrzba", "Rezerva na údržbu a opravy", 1500) +
      '</div><div data-n-out></div></div>';
    function recompute() {
      var ids = ["n-splatka", "n-energie", "n-svj", "n-pojisteni", "n-udrzba"];
      var vals = ids.map(function (id) { return parseNum(host.querySelector("#" + id).value); });
      var total = vals.reduce(function (a, b) { return a + b; }, 0);
      var splatka = vals[0];
      host.querySelector("[data-n-out]").innerHTML =
        '<div class="metric"><div class="metric__label">Skutečné měsíční náklady na bydlení</div><div class="metric__value">' + fmtCZK(total) + '</div></div>' +
        '<div class="breakdown" style="margin-top:var(--sp-4)">' +
          '<div class="breakdown__row"><span>Samotná splátka</span><span>' + fmtCZK(splatka) + '</span></div>' +
          '<div class="breakdown__row"><span>Ostatní náklady bydlení</span><span>' + fmtCZK(total - splatka) + '</span></div>' +
          '<div class="breakdown__row breakdown__row--total"><span>Celkem měsíčně</span><span>' + fmtCZK(total) + '</span></div>' +
        '</div>' +
        '<div class="note note--warn" style="margin-top:var(--sp-4)"><p>Kalkulačka končící u „splátka " + fmtCZK(splatka) + "“ klame. Reálně za bydlení zaplatíte kolem <strong>" + fmtCZK(total) + "</strong> měsíčně. S tím počítejte v rozpočtu.</p></div>';
    }
    host.querySelectorAll("input").forEach(function (el) { el.addEventListener("input", recompute); });
    recompute();
  }

  /* --- Nájem vs. koupě --- */
  function toolNajem() {
    var host = document.getElementById("tool-najem");
    if (!host) return;
    host.innerHTML = '<div class="grid grid--2"><div>' +
      money("v-najem", "Měsíční nájem", 18000) + pctField("v-najem-rust", "Roční růst nájmu", 3) +
      money("v-cena", "Cena nemovitosti", 5000000) + money("v-uver", "Výše hypotéky", 4000000) +
      pctField("v-sazba", "Úroková sazba", 5) +
      '<div class="field"><label for="v-doba">Doba hypotéky</label><div class="field__input"><input id="v-doba" type="text" inputmode="numeric" value="30"><span class="field__suffix">let</span></div></div>' +
      money("v-naklady", "Náklady vlastnictví navíc měsíčně", 4900, "SVJ, fond oprav, pojištění, údržba (co navíc oproti nájmu).") +
      pctField("v-rust", "Roční růst hodnoty nemovitosti", 2) +
      '<div class="field"><label for="v-horizont">Horizont porovnání</label><div class="field__input"><input id="v-horizont" type="text" inputmode="numeric" value="10"><span class="field__suffix">let</span></div></div>' +
      '</div><div data-v-out></div></div>';
    function recompute() {
      var p = {
        monthlyRent: parseNum(host.querySelector("#v-najem").value),
        rentGrowthPct: parseNum(host.querySelector("#v-najem-rust").value),
        price: parseNum(host.querySelector("#v-cena").value),
        loan: parseNum(host.querySelector("#v-uver").value),
        ratePct: parseNum(host.querySelector("#v-sazba").value),
        termMonths: Math.round(parseNum(host.querySelector("#v-doba").value) * 12),
        ownershipMonthly: parseNum(host.querySelector("#v-naklady").value),
        appreciationPct: parseNum(host.querySelector("#v-rust").value),
        horizonYears: parseNum(host.querySelector("#v-horizont").value)
      };
      var r = C.rentVsBuy(p);
      var cheaperLabel = r.cheaper === "koupe" ? "Koupě vychází levněji" : "Nájem vychází levněji";
      var cheaperClass = r.cheaper === "koupe" ? "note--tip" : "note--warn";
      host.querySelector("[data-v-out]").innerHTML =
        '<div class="three-views">' +
          '<div class="view"><div class="view__label">🏠 Koupě</div><p>Akontace: ' + fmtCZK(r.downPayment) + '<br>Splátky: ' + fmtCZK(r.ownPaymentsTotal) + '<br>Náklady navíc: ' + fmtCZK(r.ownCostsTotal) + '<br>Majetek na konci: ' + fmtCZK(r.equityEnd) + '<br><strong>Čistý náklad: ' + fmtCZK(r.netOwning) + '</strong></p></div>' +
          '<div class="view"><div class="view__label">🔑 Nájem</div><p>Zaplacený nájem: ' + fmtCZK(r.rentTotal) + '<br>Majetek na konci: 0 Kč<br><strong>Čistý náklad: ' + fmtCZK(r.netRenting) + '</strong></p></div>' +
        '</div>' +
        '<div class="note ' + cheaperClass + '" style="margin-top:var(--sp-4)"><div class="note__title">' + cheaperLabel + ' o ' + fmtCZK(r.diff) + '</div>' +
        '<p>Za ' + p.horizonYears + ' let a při zadaných předpokladech. <strong>Model nezohledňuje</strong> investování ušetřených peněz, transakční náklady, daně ani riziko. Změňte růst hodnoty nebo nájmu a uvidíte, jak citlivý výsledek je.</p></div>' +
        '<div class="confidence-note">🟣 Modelový výpočet — silně závisí na předpokladech (růst cen, sazba, horizont).</div>';
    }
    host.querySelectorAll("input").forEach(function (el) { el.addEventListener("input", recompute); });
    recompute();
  }

  function init() {
    if (!C) return;
    toolNaklady(); toolNajem();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
