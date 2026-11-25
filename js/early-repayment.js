/*
 * early-repayment.js — Interaktivní rozhodovací strom předčasného splacení (Fáze 3)
 * Data z early-repayment.json (decisionTree). Bez univerzálního "1 % / 50 000 Kč".
 */
(function () {
  "use strict";

  function getTree() {
    var d = window.HypoData && window.HypoData.data && window.HypoData.data.earlyRepayment;
    return d ? d.decisionTree : null;
  }

  var RESULTS = {
    bez_nahrady: { cls: "note--tip", title: "Zpravidla bez náhrady" },
    specificky_rezim: { cls: "note", title: "Specifický režim náhrady" },
    obecny_strop: { cls: "note--warn", title: "Obecný strop náhrady" }
  };

  function render(host, tree) {
    var nodesById = {};
    tree.nodes.forEach(function (n) { nodesById[n.id] = n; });

    var state = { id: tree.nodes[0].id, history: [] };

    function draw() {
      var node = nodesById[state.id];
      var html = '<div class="guide__step-count">Rozhodovací strom · krok ' + (state.history.length + 1) + '</div>' +
                 '<div class="guide__q" style="font-size:1.15rem">' + node.question + '</div>' +
                 '<div class="guide__options">' +
                   '<button type="button" class="guide__option" data-ans="yes">Ano</button>' +
                   '<button type="button" class="guide__option" data-ans="ne">Ne</button>' +
                 '</div>';
      if (state.history.length) html += '<div class="guide__nav"><button type="button" class="btn btn--ghost" data-back>← Zpět</button><span></span></div>';
      host.innerHTML = html;

      host.querySelectorAll("[data-ans]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var ans = btn.getAttribute("data-ans");
          var branch = ans === "yes" ? node.yes : node.no;
          state.history.push(state.id);
          if (typeof branch === "string") { state.id = branch; draw(); }
          else showResult(branch);
        });
      });
      var back = host.querySelector("[data-back]");
      if (back) back.addEventListener("click", function () { state.id = state.history.pop(); draw(); });
    }

    function showResult(branch) {
      var meta = RESULTS[branch.result] || { cls: "note", title: "Výsledek" };
      host.innerHTML =
        '<div class="note ' + meta.cls + '"><div class="note__title">' + meta.title + '</div><p>' + branch.text + '</p></div>' +
        '<p class="text-muted" style="font-size:.85rem">Orientační. Konkrétní podmínky vždy ověřte ve své úvěrové smlouvě a u banky (zákon č. 257/2016 Sb., novela od 1. 9. 2024).</p>' +
        '<div class="guide__nav"><button type="button" class="btn btn--ghost" data-restart>← Začít znovu</button><span></span></div>';
      var r = host.querySelector("[data-restart]");
      if (r) r.addEventListener("click", function () { state = { id: tree.nodes[0].id, history: [] }; draw(); });
    }

    draw();
  }

  function init() {
    var host = document.getElementById("early-repayment-tree");
    var tree = getTree();
    if (host && tree) render(host, tree);
  }
  if (window.HypoData && window.HypoData.loaded) init();
  else document.addEventListener("hypodata:ready", init, { once: true });
})();
