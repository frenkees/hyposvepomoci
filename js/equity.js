/*
 * equity.js — „Nemám dost vlastních zdrojů" (P2)
 * Vzdělávací možnosti řešení + tři interaktivní nástroje:
 * dodatečná zástava, dopad nižšího ocenění, konsolidace.
 */
(function () {
  "use strict";
  var C = window.HypoCalc;

  function parseNum(v) { var n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
  function fmtInt(n) { try { return new Intl.NumberFormat("cs-CZ").format(Math.round(n)); } catch (e) { return String(Math.round(n)); } }
  function fmtCZK(n) { try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Math.round(n)); } catch (e) { return fmtInt(n) + " Kč"; } }
  function pct(n) { return n.toFixed(1).replace(".", ",") + " %"; }

  /* --- Vzdělávací možnosti --- */
  var OPTIONS = [
    { t: "Levnější nemovitost", s: "Nejjednodušší cesta: nižší cena = nižší potřebná akontace.",
      jak: "Snížíte cílovou cenu, takže vám vaše úspory stačí na akontaci i náklady.", komu: "Komukoli, kdo má flexibilitu ve výběru.", plus: "Bez dalšího rizika, nižší splátka.", minus: "Kompromis v lokalitě, velikosti nebo stavu.", riziko: "Malé.", banka: "Standardní posouzení." },
    { t: "Naspořit víc / počkat", s: "Odložit koupi a dorovnat vlastní zdroje.",
      jak: "Pár měsíců až let spoření může chybějící částku pokrýt.", komu: "Kdo nespěchá.", plus: "Nižší úvěr, větší rezerva.", minus: "Ceny nemovitostí i sazby se mohou změnit.", riziko: "Tržní (změna cen/sazeb).", banka: "Standardní posouzení." },
    { t: "Dar od rodiny", s: "Peněžní dar na akontaci od blízkých.",
      jak: "Rodič či prarodič daruje část akontace; banka obvykle chce doložit původ a darovací smlouvu.", komu: "Kdo má rodinné zázemí.", plus: "Nezvyšuje zadlužení.", minus: "Není vždy dostupné; daňové aspekty u vzdálenějších dárců.", riziko: "Malé.", banka: "Ověřuje původ prostředků." },
    { t: "Rodinná půjčka", s: "Půjčka od rodiny místo daru.",
      jak: "Blízcí půjčí na akontaci; banka ji ale může započítat jako závazek.", komu: "Kdo dar nemá, ale má komu vrátit.", plus: "Flexibilní podmínky.", minus: "Zvyšuje celkové zadlužení a může zhoršit bonitu.", riziko: "Rodinné vztahy, zatížení rozpočtu.", banka: "Může počítat jako závazek do DSTI." },
    { t: "Dodatečná nemovitost do zástavy", s: "LTV se počítá vůči hodnotě více nemovitostí.",
      jak: "Do zástavy přidáte další nemovitost (např. rodičů), čímž vzroste hodnota zajištění a klesne LTV.", komu: "Kdo má přístup k další nemovitosti.", plus: "Může umožnit financování bez hotovosti navíc.", minus: "Zatížíte i druhou nemovitost.", riziko: "VYSOKÉ — při problémech se splácením je ohrožena i dodatečná nemovitost.", banka: "Oceňuje obě nemovitosti; posuzuje souhlas vlastníka zástavy." },
    { t: "Vyšší bankovní ocenění", s: "Jiná banka může nemovitost ocenit výše.",
      jak: "Pokud banka nemovitost ocení blíž kupní ceně, klesne potřeba vlastních zdrojů.", komu: "Kde je odhad podhodnocený.", plus: "Bez další hotovosti.", minus: "Nelze si vynutit; každá banka oceňuje jinak.", riziko: "Malé, ale nejisté.", banka: "Rozhoduje vlastní odhad — nelze zaručit." },
    { t: "Výjimka banky", s: "Individuální posouzení nad rámec standardu.",
      jak: "U bonitních klientů může banka udělit výjimku z části podmínek.", komu: "Silná bonita, stabilní příjem.", plus: "Řešení na míru.", minus: "Není nárok; podmínky se liší.", riziko: "Nejisté.", banka: "Zcela individuální." },
    { t: "Konsolidace jiných dluhů", s: "Sloučení dražších úvěrů do hypotéky.",
      jak: "Spotřebitelské úvěry se sloučí do hypotéky s nižší sazbou a delší splatností.", komu: "Kdo má drahé nezajištěné úvěry.", plus: "Nižší měsíční zatížení, uvolní se prostor v rozpočtu.", minus: "Delší splatnost = víc na úrocích; nezajištěný dluh se stává zajištěným.", riziko: "Nemovitost ručí i za původně nezajištěný dluh.", banka: "Posuzuje účel a celkové zajištění." }
  ];

  function renderOptions() {
    var host = document.getElementById("equity-options");
    if (!host) return;
    host.innerHTML = OPTIONS.map(function (o) {
      return '<div class="card"><h3 style="font-size:1.1rem">' + o.t + '</h3><p>' + o.s + '</p>' +
        '<details class="how"><summary>Podrobně</summary><div class="means">' +
          row("Jak to funguje", o.jak) + row("Komu pomůže", o.komu) + row("Výhoda", o.plus) +
          row("Nevýhoda", o.minus) + row("Riziko", o.riziko) + row("Co banka posuzuje", o.banka) +
        '</div></div></details></div>';
    }).join("");
  }
  function row(k, v) { return '<div class="means__row"><span class="means__k">' + k + '</span><span>' + v + '</span></div>'; }

  /* --- Nástroj: dodatečná zástava --- */
  function moneyInput(id, label, val, hint) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' + (hint ? '<span class="field__hint">' + hint + '</span>' : '') +
      '<div class="field__input"><input id="' + id + '" type="text" inputmode="numeric" value="' + fmtInt(val) + '"><span class="field__suffix">Kč</span></div></div>';
  }

  function toolZastava() {
    var host = document.getElementById("tool-zastava");
    if (!host) return;
    host.innerHTML =
      '<div class="grid grid--2">' +
        '<div>' +
          moneyInput("z-uver", "Výše úvěru", 4500000) +
          moneyInput("z-main", "Hodnota kupované nemovitosti", 5000000) +
          moneyInput("z-add", "Hodnota dodatečné nemovitosti do zástavy", 2000000) +
        '</div><div data-z-out></div></div>';
    var out = host.querySelector("[data-z-out]");
    function recompute() {
      var loan = parseNum(host.querySelector("#z-uver").value);
      var main = parseNum(host.querySelector("#z-main").value);
      var add = parseNum(host.querySelector("#z-add").value);
      var r = C.combinedLtv(loan, main, add);
      out.innerHTML =
        '<div class="metric"><div class="metric__label">LTV jen kupovaná nemovitost</div><div class="metric__value">' + pct(r.ltvMain) + '</div></div>' +
        '<div class="metric" style="margin-top:var(--sp-3)"><div class="metric__label">LTV se zástavou obou (hodnota ' + fmtCZK(r.combinedValue) + ')</div><div class="metric__value" style="color:var(--color-success)">' + pct(r.ltvCombined) + '</div></div>' +
        '<div class="note note--critical" style="margin-top:var(--sp-4)"><div class="note__title">🔴 Dodatečná zástava není „zdarma“</div><p>Přidáním nemovitosti do zástavy ručíte i touto nemovitostí. Při problémech se splácením je ohrožena také ona.</p></div>';
    }
    host.querySelectorAll("input").forEach(function (el) { el.addEventListener("input", recompute); });
    recompute();
  }

  /* --- Nástroj: nižší ocenění --- */
  function toolOceneni() {
    var host = document.getElementById("tool-ocenene");
    if (!host) return;
    host.innerHTML =
      '<div class="grid grid--2"><div>' +
        moneyInput("o-cena", "Kupní cena", 5000000) +
        moneyInput("o-odhad", "Bankovní ocenění", 4700000) +
        '<div class="field"><label for="o-ltv">Limit LTV</label><select id="o-ltv"><option value="80">80 % (vlastní bydlení)</option><option value="90">90 % (do 36 let)</option><option value="70">70 % (investiční)</option></select></div>' +
      '</div><div data-o-out></div></div>';
    var out = host.querySelector("[data-o-out]");
    function recompute() {
      var price = parseNum(host.querySelector("#o-cena").value);
      var appr = parseNum(host.querySelector("#o-odhad").value);
      var ltv = parseNum(host.querySelector("#o-ltv").value);
      var r = C.lowerAppraisalImpact(price, appr, ltv);
      out.innerHTML =
        '<div class="breakdown">' +
          '<div class="breakdown__row"><span>Potřebné vlastní zdroje při ceně</span><span>' + fmtCZK(r.neededAtPrice) + '</span></div>' +
          '<div class="breakdown__row"><span>Potřebné vlastní zdroje při ocenění</span><span>' + fmtCZK(r.neededAtAppraisal) + '</span></div>' +
          '<div class="breakdown__row breakdown__row--total"><span>Musíte doložit navíc</span><span style="color:' + (r.extraNeeded > 0 ? 'var(--color-danger)' : 'var(--color-success)') + '">' + fmtCZK(r.extraNeeded) + '</span></div>' +
        '</div>' +
        (r.extraNeeded > 0 ? '<div class="note note--warn" style="margin-top:var(--sp-4)"><p>Banka ocenila nemovitost níž než je kupní cena — o rozdíl musíte navýšit vlastní zdroje, nebo hledat banku s vyšším oceněním.</p></div>' : '<div class="note note--tip" style="margin-top:var(--sp-4)"><p>Ocenění stačí, potřeba vlastních zdrojů se nezvyšuje.</p></div>');
    }
    host.querySelectorAll("input,select").forEach(function (el) { el.addEventListener("input", recompute); });
    recompute();
  }

  /* --- Nástroj: konsolidace --- */
  function toolKonsolidace() {
    var host = document.getElementById("tool-konsolidace");
    if (!host) return;
    host.innerHTML =
      '<div class="grid grid--2"><div>' +
        moneyInput("k-hypo", "Hypotéka na koupi", 4400000) +
        moneyInput("k-dluh", "Jiné dluhy celkem", 100000, "Spotřebitelské úvěry, které chcete sloučit.") +
        moneyInput("k-splatky", "Měsíční splátky těchto dluhů", 3000) +
        '<div class="field"><label for="k-sazba">Sazba hypotéky</label><div class="field__input"><input id="k-sazba" type="text" inputmode="decimal" value="5"><span class="field__suffix">%</span></div></div>' +
      '</div><div data-k-out></div></div>';
    var out = host.querySelector("[data-k-out]");
    function recompute() {
      var mortgage = parseNum(host.querySelector("#k-hypo").value);
      var dluh = parseNum(host.querySelector("#k-dluh").value);
      var splatky = parseNum(host.querySelector("#k-splatky").value);
      var sazba = parseNum(host.querySelector("#k-sazba").value);
      var r = C.consolidation({ mortgage: mortgage, otherDebts: [{ amount: dluh, monthlyPayment: splatky }], newRate: sazba, newTermMonths: 360 });
      out.innerHTML =
        '<div class="three-views">' +
          '<div class="view"><div class="view__label">Před</div><p>Úvěrů: ' + r.before.count + '<br>Dluh: ' + fmtCZK(r.before.totalDebt) + '<br>Splátky: ' + fmtCZK(r.before.totalMonthly) + '</p></div>' +
          '<div class="view view--you"><div class="view__label">Po</div><p>Úvěrů: ' + r.after.count + '<br>Dluh: ' + fmtCZK(r.after.totalDebt) + '<br>Splátka: ' + fmtCZK(r.after.monthly) + '<br>Zajištěno nemovitostí</p></div>' +
        '</div>' +
        '<div class="metric" style="margin-top:var(--sp-3)"><div class="metric__label">Nižší měsíční zatížení o</div><div class="metric__value" style="color:var(--color-success)">' + fmtCZK(Math.max(0, r.monthlySaving)) + '</div></div>' +
        '<div class="note note--warn" style="margin-top:var(--sp-4)"><div class="note__title">Co to znamená</div><p>Nižší splátka je díky delší splatnosti — <strong>dluh se nesnižuje</strong> a za delší dobu zaplatíte víc na úrocích. Původně nezajištěný dluh je navíc nově <strong>zajištěn nemovitostí</strong>.</p></div>';
    }
    host.querySelectorAll("input").forEach(function (el) { el.addEventListener("input", recompute); });
    recompute();
  }

  function init() {
    if (!C) return;
    renderOptions();
    toolZastava();
    toolOceneni();
    toolKonsolidace();
    if (window.HypoTerms) window.HypoTerms.enhance(document.getElementById("vlastni-zdroje"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
