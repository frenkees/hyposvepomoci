/*
 * paywall.js — Prémiové nástroje (Fáze 4)
 *
 * DŮLEŽITÉ: Toto je POUZE UX demo, NE bezpečnostní mechanismus.
 * Prémiový obsah se do prohlížeče vůbec neposílá — zde jsou jen ukázkové
 * (locked) karty s popisem hodnoty. Reálné odemčení bude až přes serverové
 * ověření platby (Stripe + serverless), viz PLAN.md, Fáze 2 monetizace.
 * Nikde netvrdíme, že klientský kód chrání placený obsah.
 */
(function () {
  "use strict";

  var FEATURES = [
    { icon: "🏦", title: "Porovnání konkrétních nabídek bank", teaser: "Zjistěte, která nabídka vás za 5 let vyjde levněji — ne seznam pojmů, ale srovnání reálných čísel." },
    { icon: "🔄", title: "Refinanční kalkulačka", teaser: "Zadáte parametry stávající hypotéky a spočítáte break-even — kdy se refinancování vyplatí." },
    { icon: "⚖️", title: "Porovnání scénářů vedle sebe", teaser: "Dva scénáře najednou: kratší vs. delší fixace, s/bez mimořádných splátek." },
    { icon: "✅", title: "Personalizovaný checklist", teaser: "Checklist na míru vaší situaci (OSVČ, spolužadatel, družstevní byt…)." },
    { icon: "🗣️", title: "Vyjednávací průvodce", teaser: "Konkrétní argumenty a postup, jak s bankou vyjednat lepší sazbu." },
    { icon: "📄", title: "Případové studie", teaser: "Reálné příběhy s čísly — kde lidé ušetřili a kde prodělali." }
  ];

  function render(host) {
    var grid = document.createElement("div");
    grid.className = "grid grid--3";
    FEATURES.forEach(function (f) {
      var card = document.createElement("div");
      card.className = "premium-card";
      card.innerHTML =
        '<div class="premium-card__lock" aria-hidden="true">🔒</div>' +
        '<h3>' + f.icon + " " + f.title + '</h3>' +
        '<p class="premium-card__teaser">' + f.teaser + '</p>' +
        '<div class="premium-card__overlay"><span class="confidence-badge confidence--rada">Hypotéka Pro</span></div>';
      grid.appendChild(card);
    });
    host.appendChild(grid);

    var cta = document.createElement("div");
    cta.className = "premium-cta";
    cta.innerHTML =
      '<button type="button" class="btn btn--primary" data-premium-cta>Chci vědět o spuštění</button>' +
      '<p class="text-muted" data-premium-note style="margin-top:var(--sp-3)">Prémiové nástroje se připravují. Jádro webu (kalkulačka, stres test, daňový kalkulátor, checklist, slovníček) zůstává zdarma.</p>';
    host.appendChild(cta);

    cta.querySelector("[data-premium-cta]").addEventListener("click", function () {
      var note = cta.querySelector("[data-premium-note]");
      note.innerHTML = "Díky za zájem! Spuštění prémiových nástrojů teprve chystáme — zatím si užijte bezplatné jádro webu.";
      note.style.color = "var(--color-primary)";
    });
  }

  function init() {
    var host = document.getElementById("premium-root");
    if (host) render(host);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
