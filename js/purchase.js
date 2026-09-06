/*
 * purchase.js — Nákup nemovitosti: timeline, dokumenty, checklist před koupí (P2)
 */
(function () {
  "use strict";

  var STEPS = [
    ["Výběr nemovitosti", "Vyberete nemovitost a ideálně si necháte předběžně posoudit financování."],
    ["Rezervační smlouva", "Zaplatíte rezervační poplatek a nemovitost se stáhne z nabídky. Čtěte podmínky vrácení."],
    ["Financování", "Podáte žádost o hypotéku a doložíte podklady."],
    ["Kupní smlouva + úschova", "Podepíšete kupní smlouvu; peníze jdou do úschovy (advokátní / notářské / bankovní), ne přímo prodávajícímu."],
    ["Odhad nemovitosti", "Banka nechá nemovitost ocenit — z odhadu počítá LTV."],
    ["Schválení hypotéky", "Banka úvěr schválí a připraví úvěrovou smlouvu."],
    ["Zástavní právo", "Podá se návrh na vklad zástavního práva do katastru (objeví se plomba)."],
    ["Čerpání úvěru", "Banka uvolní peníze do úschovy / prodávajícímu, často už na základě plomby."],
    ["Zápis v katastru", "Katastr provede vklad vlastnictví i zástavy (nejdříve po 20denní lhůtě)."],
    ["Předání nemovitosti", "Převezmete nemovitost, sepíšete předávací protokol, přepíšete energie."],
    ["Splácení", "Začínáte splácet hypotéku. Nastavte si připomínku před koncem fixace."]
  ];

  var DOCS = [
    ["Rezervační smlouva", "Zavazuje k budoucí koupi a skládá se rezervační poplatek. Pozor na podmínky, za jakých se poplatek vrací (např. když banka neschválí úvěr)."],
    ["Kupní smlouva", "Hlavní smlouva o převodu vlastnictví. Nechte si ji zkontrolovat — řeší cenu, termíny, stav nemovitosti, sankce."],
    ["Úschova peněz", "Kupní cena se skládá do advokátní, notářské nebo bankovní úschovy a prodávajícímu se uvolní až po zápisu vlastnictví. Chrání kupujícího i prodávajícího."],
    ["Zástavní právo a plomba", "Banka si k nemovitosti zapíše zástavní právo. Po podání návrhu se objeví plomba; banka na jejím základě často uvolní peníze."],
    ["Čerpání úvěru", "Uvolnění peněz z hypotéky. Může být jednorázové (koupě) nebo postupné (rekonstrukce/stavba)."],
    ["Předání nemovitosti", "Fyzické převzetí + předávací protokol (stavy měřidel, klíče, závady). Přepis energií a případně SVJ."]
  ];

  var CHECKLIST = [
    { group: "Nemovitost — právní a technický stav", items: [
      "Ověřen vlastník na listu vlastnictví (katastr)",
      "Zkontrolovány zástavy a exekuce na nemovitosti",
      "Zkontrolována věcná břemena",
      "U bytu: stav SVJ / družstva a jeho hospodaření",
      "Zjištěny dluhy váznoucí na nemovitosti (fond oprav, energie)",
      "Prověřen technický stav a plánované opravy",
      "Zkontrolován průkaz energetické náročnosti (PENB)"
    ] },
    { group: "Financování — podmínky hypotéky", items: [
      "Znám úrokovou sazbu i RPSN",
      "Rozumím délce fixace a co bude po ní",
      "Vím o všech poplatcích a povinném pojištění",
      "Znám podmínky zvýhodněné sazby (účet, pojištění)",
      "Znám podmínky předčasného splacení a sankce",
      "Vím o možnosti mimořádných splátek"
    ] }
  ];

  var LS_KEY = "hypo:checklist-koupe";
  function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} }

  function renderTimeline() {
    var host = document.getElementById("purchase-timeline");
    if (!host) return;
    host.innerHTML = STEPS.map(function (s, i) {
      return '<li class="timeline__item"><div class="timeline__num">' + (i + 1) + '</div>' +
        '<div class="timeline__title">' + s[0] + '</div><p>' + s[1] + '</p></li>';
    }).join("");
  }

  function renderDocs() {
    var host = document.getElementById("purchase-docs");
    if (!host) return;
    host.innerHTML = DOCS.map(function (d) {
      return '<div class="card"><h3 style="font-size:1.1rem">' + d[0] + '</h3><p>' + d[1] + '</p></div>';
    }).join("");
  }

  function renderChecklist() {
    var host = document.getElementById("purchase-checklist");
    if (!host) return;
    var saved = load();
    var total = 0, done = 0;
    CHECKLIST.forEach(function (g, gi) { g.items.forEach(function (_, ii) { total++; if (saved["p-" + gi + "-" + ii]) done++; }); });

    var html = '<div class="chk-progress"><div class="guide__progress"><div class="guide__progress-bar" data-chk-bar style="width:' + (total ? Math.round(done / total * 100) : 0) + '%"></div></div>' +
      '<div class="chk-progress__count text-muted" data-chk-count>' + done + ' z ' + total + ' hotovo</div></div>';
    CHECKLIST.forEach(function (g, gi) {
      html += '<div class="card" style="margin-top:var(--sp-4)"><strong>' + g.group + '</strong><div style="display:grid;gap:var(--sp-1);margin-top:var(--sp-2)">';
      g.items.forEach(function (it, ii) {
        var id = "p-" + gi + "-" + ii;
        html += '<label style="font-weight:400;display:flex;gap:var(--sp-2);align-items:flex-start"><input type="checkbox" data-pchk id="' + id + '"' + (saved[id] ? " checked" : "") + '> <span>' + it + '</span></label>';
      });
      html += '</div></div>';
    });
    host.innerHTML = html;

    host.querySelectorAll("[data-pchk]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var s = load(); s[cb.id] = cb.checked; save(s);
        var d = 0; host.querySelectorAll("[data-pchk]").forEach(function (x) { if (x.checked) d++; });
        var bar = host.querySelector("[data-chk-bar]"); if (bar) bar.style.width = (total ? Math.round(d / total * 100) : 0) + "%";
        var cnt = host.querySelector("[data-chk-count]"); if (cnt) cnt.textContent = d + " z " + total + " hotovo";
      });
    });
  }

  function init() {
    renderTimeline();
    renderDocs();
    renderChecklist();
    if (window.HypoTerms) window.HypoTerms.enhance(document.getElementById("nakup"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
