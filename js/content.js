/*
 * content.js — Obsahové bloky (Fáze 3): příklad rodiny, red flags, FAQ "Co se stane, když…"
 */
(function () {
  "use strict";
  var C = window.HypoCalc;
  function fmtCZK(n) { try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Math.round(n)); } catch (e) { return Math.round(n) + " Kč"; } }

  /* --- Příklad: Jan a Petra (počítáno živě) --- */
  function renderFamily(host) {
    if (!C) return;
    var price = 5200000, own = 1100000, loan = 4100000, appraisal = 5200000, rate = 4.5, years = 30;
    var pay = C.calculateMonthlyPayment(loan, rate, years * 12);
    var pay6 = C.calculateMonthlyPayment(loan, 6, years * 12);
    var ltv = C.calculateLTV(loan, appraisal);
    var txCosts = Math.round(price * 0.03);
    var reserve = own - (price - loan) - txCosts;
    var income = 72000;
    var dsti = C.calculateDSTI(pay, 0, income);
    var url = "?cena=" + price + "&odhad=" + appraisal + "&vlastni=" + own + "&uver=" + loan + "&sazba=" + rate + "&doba=" + years + "&prijem=" + income + "#kalkulacka";

    host.innerHTML =
      '<p><strong>Jan a Petra:</strong> čistý příjem ' + fmtCZK(income) + ', nemovitost ' + fmtCZK(price) + ', úspory ' + fmtCZK(own) + ', hypotéka ' + fmtCZK(loan) + ' na ' + years + ' let při ' + String(rate).replace(".", ",") + ' %.</p>' +
      '<ol class="timeline" style="margin-top:var(--sp-4)">' +
        step(1, "Vlastní zdroje", "Vloží " + fmtCZK(price - loan) + " jako akontaci. Na transakční náklady počítají ~" + fmtCZK(txCosts) + ".") +
        step(2, "LTV", "Úvěr " + fmtCZK(loan) + " vůči hodnotě " + fmtCZK(appraisal) + " → LTV " + ltv.toFixed(1).replace(".", ",") + " %. Pod limitem.") +
        step(3, "Splátka", "Měsíčně " + fmtCZK(pay) + ". To je " + dsti.toFixed(0) + " % jejich čistého příjmu.") +
        step(4, "Když sazba po fixaci vzroste na 6 %", "Splátka by stoupla na " + fmtCZK(pay6) + " — o " + fmtCZK(pay6 - pay) + " víc. Unesli by to?") +
        step(5, "Rezerva po koupi", (reserve < 0 ? "Po koupi jim chybí ~" + fmtCZK(-reserve) + " — musí ještě naspořit nebo snížit cíl." : "Po koupi jim zůstane ~" + fmtCZK(reserve) + ".")) +
        step(6, "Co řešit s bankou", "Sazba bez pojištění, podmínky mimořádných splátek, co bude na konci fixace.") +
      '</ol>' +
      '<a class="btn btn--primary" href="' + url + '">Otevřít jejich scénář v kalkulačce →</a>';
  }
  function step(n, t, d) { return '<li class="timeline__item"><div class="timeline__num">' + n + '</div><div class="timeline__title">' + t + '</div><p>' + d + '</p></li>'; }

  /* --- Red flags --- */
  function renderRedFlags(host) {
    var flags = [
      ["🔴", "„Sazba 3,99 %“", "Zjistěte, za jakých podmínek této sazby dosáhnete — bývá podmíněná."],
      ["🟡", "„Pojištění je součástí nabídky“", "Ověřte, zda je povinné, nebo jen podmínkou zvýhodněné sazby."],
      ["🟡", "„Odhad zdarma“", "Zjistěte, zda jde o bankovní odhad a bude použitelný pro váš účel."],
      ["🟡", "„Schválíme vám i víc“", "To, že banka půjčí víc, neznamená, že si to máte vzít. Hlídejte si rezervu."]
    ];
    host.innerHTML = '<h3>Red flags v nabídce</h3><div class="breakdown">' +
      flags.map(function (f) { return '<div class="breakdown__row" style="display:block"><div><strong>' + f[0] + " " + f[1] + '</strong></div><div class="text-muted">' + f[2] + '</div></div>'; }).join("") +
      '</div>';
  }

  /* --- FAQ "Co se stane, když…" --- */
  var FAQ = [
    ["Co když banka ocení dům na méně, než kolik stojí?", "LTV se počítá z odhadu, ne z ceny. Nižší odhad = vyšší LTV. Rozdíl musíte dorovnat vyššími vlastními zdroji, nebo hledat jinou banku/odhad."],
    ["Co když změním zaměstnání před čerpáním?", "Banka může příjem přehodnotit, hlavně ve zkušební době. Ideální je velké změny neřešit těsně před čerpáním."],
    ["Co když budu chtít splatit za 5 let?", "Projděte si rozhodovací strom předčasného splacení — často to jde ke konci fixace bez náhrady."],
    ["Co když se rozvedeme?", "Úvěr i nemovitost je potřeba vypořádat; banka musí se změnou dlužníků souhlasit. Řeší se refinancováním nebo vyplacením."],
    ["Co když jeden z nás zemře?", "Proto banky nabízejí životní pojištění. Bez něj přechází dluh na dědice / spoludlužníka."],
    ["Co když přijdu o práci?", "Klíčová je rezerva. Projděte si příjmový šok ve stres testu kalkulačky."],
    ["Co když chci nemovitost pronajímat?", "Jde o investiční nemovitost — přísnější doporučení (LTV 70 %, DTI 7×) a jiné daňové posouzení."],
    ["Co když chci koupit družstevní byt?", "Není to klasická nemovitost k zástavě; financování bývá složitější (často úvěr bez zástavy dané jednotky)."]
  ];
  function renderFaq(host) {
    host.innerHTML = FAQ.map(function (q, i) {
      return '<div class="glossary__item"><button class="glossary__toggle" type="button" aria-expanded="false" aria-controls="faq-' + i + '" style="font-size:1.02rem">' + q[0] + ' ▾</button>' +
             '<div class="glossary__deep" id="faq-' + i + '" hidden>' + q[1] + '</div></div>';
    }).join("");
    host.querySelectorAll(".glossary__toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var panel = document.getElementById(btn.getAttribute("aria-controls"));
        var open = !panel.hidden; panel.hidden = open;
        btn.setAttribute("aria-expanded", String(!open));
        btn.textContent = btn.textContent.replace(/[▾▴]$/, open ? "▾" : "▴");
      });
    });
    host.className = "glossary";
  }

  function init() {
    var f = document.getElementById("family-example"); if (f) renderFamily(f);
    var rf = document.getElementById("red-flags"); if (rf) renderRedFlags(rf);
    var faq = document.getElementById("faq"); if (faq) renderFaq(faq);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
