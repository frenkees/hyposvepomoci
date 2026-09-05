/*
 * offer-translator.js — Překladač bankovní nabídky do lidské řeči (Fáze 3)
 * Uživatel zadá parametry nabídky → web vysvětlí, co znamenají a co si ověřit.
 */
(function () {
  "use strict";
  function parseNum(v) { var n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; }

  function render(host) {
    host.innerHTML =
      '<h3>Překladač bankovní nabídky</h3>' +
      '<p class="text-muted">Zadejte čísla z konkrétní nabídky. Vysvětlíme, co znamenají a co si před podpisem ověřit.</p>' +
      '<div class="field"><label for="ot-urok">Úroková sazba</label><div class="field__input"><input id="ot-urok" type="text" inputmode="decimal" placeholder="např. 4,59"><span class="field__suffix">%</span></div></div>' +
      '<div class="field" style="margin-top:var(--sp-3)"><label for="ot-rpsn">RPSN</label><div class="field__input"><input id="ot-rpsn" type="text" inputmode="decimal" placeholder="např. 4,82"><span class="field__suffix">%</span></div></div>' +
      '<div class="field" style="margin-top:var(--sp-3)"><label>Je zvýhodněná sazba podmíněná?</label>' +
        '<label style="font-weight:400"><input type="checkbox" data-cond="ucet"> vedením účtu u banky</label>' +
        '<label style="font-weight:400"><input type="checkbox" data-cond="pojisteni"> sjednáním pojištění</label>' +
      '</div>' +
      '<div data-ot-out style="margin-top:var(--sp-4)"></div>';

    var urok = host.querySelector("#ot-urok");
    var rpsn = host.querySelector("#ot-rpsn");
    var out = host.querySelector("[data-ot-out]");
    var conds = host.querySelectorAll("[data-cond]");

    function recompute() {
      var u = parseNum(urok.value), r = parseNum(rpsn.value);
      var items = [];
      if (u > 0 && r > 0) {
        var diff = (r - u).toFixed(2).replace(".", ",");
        if (r > u) items.push(["🟡", "RPSN je vyšší než úrok o " + diff + " p. b.", "Rozdíl tvoří poplatky a povinné náklady. Porovnávejte nabídky podle RPSN, ne jen podle úroku."]);
        else items.push(["🟢", "RPSN je blízko úroku", "Nabídka nemá velké skryté poplatky navíc — dobré znamení."]);
      }
      var checked = [];
      conds.forEach(function (c) { if (c.checked) checked.push(c.getAttribute("data-cond")); });
      if (checked.indexOf("ucet") > -1) items.push(["🟡", "Sazba je podmíněna účtem", "Zjistěte, kolik stojí povinný účet ročně a co se stane se sazbou, když ho zrušíte."]);
      if (checked.indexOf("pojisteni") > -1) items.push(["🟡", "Sazba je podmíněna pojištěním", "Ověřte, zda je pojištění povinné, nebo jen podmínkou slevy. Bankovní pojištění bývá dražší než externí."]);

      if (!items.length) { out.innerHTML = '<p class="text-muted">Zadejte úrok a RPSN.</p>'; return; }
      out.innerHTML = '<div class="means-box"><h4>Co si před podpisem ověřit</h4><div class="breakdown">' +
        items.map(function (it) { return '<div class="breakdown__row"><span>' + it[0] + ' ' + it[1] + '</span></div><div style="padding-bottom:var(--sp-2)"><span class="text-muted">' + it[2] + '</span></div>'; }).join("") +
        '</div></div>';
    }

    urok.addEventListener("input", recompute);
    rpsn.addEventListener("input", recompute);
    conds.forEach(function (c) { c.addEventListener("change", recompute); });
    recompute();
  }

  function init() { var h = document.getElementById("offer-translator"); if (h) render(h); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
