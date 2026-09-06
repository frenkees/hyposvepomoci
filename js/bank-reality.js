/*
 * bank-reality.js — Bankovní realita: příjmy, závazky/registry, žadatel (P2)
 * Strukturovaný edukační obsah. Důsledně rozlišuje „obecný princip" od
 * metodiky konkrétní banky (žádná konkrétní bankovní pravidla jako univerzální).
 */
(function () {
  "use strict";

  var GROUPS = [
    {
      title: "Příjem — čím ho doložíte",
      intro: "Typ příjmu zásadně mění, jak snadné je hypotéku doložit.",
      items: [
        { t: "Zaměstnanec (HPP)", princip: "Nejsnáze doložitelný příjem — potvrzení o příjmu nebo výpisy z účtu.", pozor: "Zkušební doba a smlouva na dobu určitou situaci komplikují; banka může chtít delší historii." },
        { t: "OSVČ", princip: "Banka obvykle vychází z daňového přiznání a posuzuje zisk (příjmy minus výdaje), obvykle za 1–2 roky.", pozor: "Kdo uplatňuje vysoké paušální nebo skutečné výdaje kvůli nižší dani, vykazuje nižší zisk — a tím i nižší doložitelný příjem. Metodiky se mezi bankami výrazně liší." },
        { t: "Společník / jednatel s.r.o.", princip: "Příjmem může být mzda i podíl na zisku (dividendy).", pozor: "Posouzení je individuální; některé banky dividendy zohledňují jen zčásti." },
        { t: "DPP / DPČ", princip: "Dohody banky obvykle berou opatrněji, často jen jako doplňkový příjem.", pozor: "Samotná dohoda zpravidla na hypotéku nestačí." },
        { t: "Krátká historie podnikání", princip: "Kratší doba podnikání znamená méně podkladů k doložení.", pozor: "Některé banky vyžadují minimální dobu podnikání." },
        { t: "Příjmy z nájmu", princip: "Nájem může být započítán jako příjem.", pozor: "Často se počítá jen část a je potřeba ho doložit (smlouva, přiznání)." },
        { t: "Bonusy, provize, přesčasy, příplatky", princip: "Nepravidelné složky příjmu banka může zohlednit.", pozor: "Obvykle jen zčásti nebo průměrem za delší období — nespoléhejte na plnou výši." }
      ]
    },
    {
      title: "Závazky a registry — co vás může brzdit",
      intro: 'Problémem nemusí být jen aktuální splátka. Vstupuje to do <button class="term" data-term="dsti">DSTI</button> a banka nahlíží do <button class="term" data-term="registry">registrů</button>.',
      items: [
        { t: "Kreditní karta a kontokorent", princip: "I nevyužitý limit se může počítat jako potenciální závazek.", pozor: "Zrušení nepoužívaných karet a kontokorentů před žádostí může pomoct." },
        { t: "Spotřebitelský úvěr, leasing", princip: "Měsíční splátky vstupují do posouzení zatížení (DSTI).", pozor: "Konsolidace nebo předčasné splacení může uvolnit prostor." },
        { t: "Odložené platby (BNPL)", princip: "Rostoucí faktor — i odložená platba typu „kup teď, zaplať později“ je závazek.", pozor: "Neviditelné splátky se sčítají." },
        { t: "Ručení za cizí úvěr", princip: "Ručení je také závazek, i když sami nesplácíte.", pozor: "Banka ho může zohlednit." },
        { t: "Registry (BRKI, NRKI, SOLUS)", princip: "Banka ověří vaši úvěrovou historii a platební morálku.", pozor: "I splacené prodlení může být v registru vidět." }
      ]
    },
    {
      title: "Žadatel — vaše situace",
      intro: 'Kromě peněz banka posuzuje i osobní situaci a celkovou <button class="term" data-term="bonita">bonitu</button>.',
      items: [
        { t: "Věk (a hranice 36 let)", princip: "Věk pod 36 let ovlivňuje limit LTV (až 90 % na vlastní bydlení) a maximální dobu splatnosti (úvěr má být splacen do určitého věku).", pozor: "NENÍ to automatický nárok na hypotéku — banka stále posuzuje bonitu a další parametry." },
        { t: "Počet dětí a vyživované osoby", princip: "Zvyšují posuzované životní náklady domácnosti.", pozor: "Snižují prostor pro splátku." },
        { t: "Spolužadatel", princip: "Přidá další příjem — ale i jeho závazky a historii.", pozor: "Může pomoci i uškodit, podle situace spolužadatele." },
        { t: "Pracovní a platební historie", princip: "Stabilita zaměstnání a čistá historie splácení posilují bonitu.", pozor: "Časté změny nebo prodlení mohou vadit." }
      ]
    }
  ];

  function render(host) {
    host.innerHTML = GROUPS.map(function (g) {
      var items = g.items.map(function (it) {
        return '<details class="how"><summary>' + it.t + '</summary><div class="means">' +
          '<div class="means__row"><span class="means__k">Obecný princip</span><span>' + it.princip + '</span></div>' +
          '<div class="means__row"><span class="means__k">Na co pozor</span><span>' + it.pozor + '</span></div>' +
          '</div></details>';
      }).join("");
      return '<div style="margin-top:var(--sp-8)"><h3>' + g.title + '</h3><p class="text-muted">' + g.intro + '</p><div style="display:grid;gap:var(--sp-2)">' + items + '</div></div>';
    }).join("");
    if (window.HypoTerms) window.HypoTerms.enhance(host);
  }

  function init() {
    var host = document.getElementById("bank-reality");
    if (host) render(host);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
