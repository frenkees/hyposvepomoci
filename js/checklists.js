/*
 * checklists.js — Checklist před podpisem (zdarma) + otázky na bankéře (Fáze 3)
 * Checklist ukládá stav do localStorage (per-viewer). Otázky lze zkopírovat.
 */
(function () {
  "use strict";

  var CHECKLIST = [
    { group: "Úvěr", items: ["Znám úrokovou sazbu", "Znám RPSN", "Rozumím fixaci a co bude po ní", "Vím, co se stane, když sazbu na konci fixace nepřijmu"] },
    { group: "Náklady", items: ["Vím o všech poplatcích", "Vím, kolik stojí pojištění", "Vím, které služby jsou podmínkou zvýhodněné sazby"] },
    { group: "Předčasné splacení", items: ["Rozumím pravidlům a možným nákladům při předčasném splacení"] },
    { group: "Nemovitost", items: ["Znám hodnotu odhadu", "Rozumím svému LTV", "Mám vyřešené zástavní právo a pojištění"] }
  ];

  var QUESTIONS = [
    "Jaká bude moje sazba bez pojištění?",
    "Co musím splnit pro tuto sazbu?",
    "Kolik mě tyto podmínky stojí ročně?",
    "Jaké jsou možnosti mimořádné splátky?",
    "Jaké jsou podmínky předčasného splacení?",
    "Jak banka určuje hodnotu nemovitosti?"
  ];

  var LS_KEY = "hypo:checklist";

  function loadState() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; } }
  function saveState(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} }

  function renderChecklist(host) {
    var saved = loadState();
    var html = '<h3>Checklist před podpisem</h3><p class="text-muted">Zdarma. Odškrtnuté položky se pamatují jen ve vašem prohlížeči.</p>';
    CHECKLIST.forEach(function (g, gi) {
      html += '<div style="margin-top:var(--sp-3)"><strong>' + g.group + '</strong><div style="display:grid;gap:var(--sp-1);margin-top:var(--sp-2)">';
      g.items.forEach(function (it, ii) {
        var id = "chk-" + gi + "-" + ii;
        var on = saved[id] ? " checked" : "";
        html += '<label style="font-weight:400;display:flex;gap:var(--sp-2);align-items:flex-start"><input type="checkbox" id="' + id + '" data-chk' + on + '> <span>' + it + '</span></label>';
      });
      html += '</div></div>';
    });
    host.innerHTML = html;
    host.querySelectorAll("[data-chk]").forEach(function (cb) {
      cb.addEventListener("change", function () { var s = loadState(); s[cb.id] = cb.checked; saveState(s); });
    });
  }

  function renderQuestions(host) {
    var html = '<h3>Otázky, které položit bankéři</h3><ul>' +
      QUESTIONS.map(function (q) { return "<li>" + q + "</li>"; }).join("") + "</ul>" +
      '<button type="button" class="btn btn--ghost" data-copy-q>📋 Zkopírovat otázky do telefonu</button>';
    host.innerHTML = html;
    host.querySelector("[data-copy-q]").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      var text = QUESTIONS.map(function (q, i) { return (i + 1) + ". " + q; }).join("\n");
      var done = function () { btn.textContent = "✓ Zkopírováno"; setTimeout(function () { btn.textContent = "📋 Zkopírovat otázky do telefonu"; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
    });
  }

  function init() {
    var c = document.getElementById("checklist"); if (c) renderChecklist(c);
    var q = document.getElementById("banker-questions"); if (q) renderQuestions(q);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
