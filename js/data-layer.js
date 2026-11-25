/*
 * data-layer.js — Datová a fact vrstva (Fáze 0)
 *
 * Zodpovědnost:
 *  - načte data/*.json (regulatory, tax, early-repayment, glossary, sfpi, banks)
 *  - naplní <span class="fact" data-fact="..."> hodnotou z datové vrstvy
 *  - u každého faktu vykreslí štítek typu informace (ZÁKON / DOPORUČENÍ / RADA)
 *    a tooltip se zdrojem + datem ověření
 *  - vykreslí tři vrstvy data-aktuálnosti (zákonná / tržní / edukační)
 *  - vystaví načtená data globálně jako window.HypoData a vyšle událost
 *    "hypodata:ready", na kterou se navazují ostatní moduly (kalkulačka, slovníček…)
 *
 * KRITICKÉ PRAVIDLO: žádná regulatorní/číselná hodnota se nepíše natvrdo do HTML.
 * Vše prochází přes tuto vrstvu, aby neslo zdroj, datum ověření a typ informace.
 */
(function () {
  "use strict";

  var DATA_FILES = {
    regulatory: "data/regulatory.json",
    tax: "data/tax.json",
    earlyRepayment: "data/early-repayment.json",
    glossary: "data/glossary.json",
    sfpi: "data/sfpi.json",
    banks: "data/banks.json"
  };

  // Štítky typu informace — řízené polem `confidence` v datové vrstvě.
  var CONFIDENCE = {
    zakon:      { label: "ZÁKON",       cls: "confidence--zakon",      title: "Zákonný fakt / závazný limit" },
    doporuceni: { label: "DOPORUČENÍ",  cls: "confidence--doporuceni", title: "Doporučení / metodika (např. ČNB)" },
    rada:       { label: "PRAKTICKÁ RADA", cls: "confidence--rada",    title: "Praktická rada autora webu" }
  };

  /*
   * FALLBACK_FACTS — vestavěná záložní kopie klíčových hodnot přímo v datové vrstvě.
   * Pojistka pro případ, že se data/*.json nepodaří načíst (výpadek sítě, špatná
   * cesta na hostingu apod.). Díky ní se fakt NIKDY nevykreslí prázdný.
   * Toto je součást datové vrstvy, ne UI — pravidlo „žádné hodnoty natvrdo v HTML“ platí dál.
   * Zdroj hodnot je totožný s data/regulatory.json | tax.json | early-repayment.json (verifiedAt 2026-09-05).
   */
  var FALLBACK_FACTS = {
    ltv_owner_standard: { value: 80, unit: "%", binding: true, confidence: "zakon", source: "ČNB", verifiedAt: "2026-09-05", note: "Závazný limit LTV pro vlastní bydlení.", means: "alespoň 20 % hodnoty zajištění z vlastních zdrojů" },
    ltv_owner_young: { value: 90, unit: "%", binding: true, confidence: "zakon", source: "ČNB", verifiedAt: "2026-09-05", note: "Zvýšený limit LTV pro žadatele do 36 let na vlastní bydlení." },
    ltv_investment: { value: 70, unit: "%", binding: false, confidence: "doporuceni", source: "ČNB — doporučení", verifiedAt: "2026-09-05", note: "Doporučená hranice LTV pro investiční nemovitosti (od 1. 4. 2026)." },
    dsti_recommendation: { value: 40, unit: "%", binding: false, confidence: "doporuceni", source: "ČNB — doporučení", verifiedAt: "2026-09-05", note: "DSTI není závazný limit; ČNB doporučuje obezřetnost nad 40 %.", means: "Vyšší DSTI neznamená automatické zamítnutí — nad 40 % je vhodná opatrnost." },
    dti_recommendation: { value: 8, unit: "×", binding: false, confidence: "doporuceni", source: "ČNB — doporučení", verifiedAt: "2026-09-05", note: "DTI není závazný limit; ČNB doporučuje obezřetnost nad 8násobkem.", means: "Celkový dluh nad 8× ročního čistého příjmu je rizikovější, není ale vyloučen." },
    dti_investment: { value: 7, unit: "×", binding: false, confidence: "doporuceni", source: "ČNB — doporučení", verifiedAt: "2026-09-05", note: "Přísnější doporučení DTI pro investiční nemovitosti (od 1. 4. 2026)." },
    katastr_ochranna_lhuta: { value: 20, unit: "dnů", binding: true, confidence: "zakon", source: "ČÚZK", verifiedAt: "2026-09-05", note: "Vklad lze povolit nejdříve po 20 dnech od plomby; reálná doba bývá delší." },
    obecny_strop_procenta: { value: 0.25, unit: "% za každý rok do konce fixace", binding: true, confidence: "zakon", source: "Zákon č. 257/2016 Sb.; MF ČR", verifiedAt: "2026-09-05", note: "Obecný strop náhrady nákladů při předčasném splacení." },
    obecny_strop_maximum: { value: 1, unit: "% z předčasně splacené částky", binding: true, confidence: "zakon", source: "Zákon č. 257/2016 Sb.; MF ČR", verifiedAt: "2026-09-05", note: "Horní strop náhrady účelně vynaložených nákladů." },
    odpocet_limit_do_2020: { value: 300000, unit: "Kč / rok", binding: true, confidence: "zakon", source: "Zákon č. 586/1992 Sb.; Finanční správa", verifiedAt: "2026-09-05", note: "Limit odpočtu úroků pro bytovou potřebu obstaranou do konce 2020." },
    odpocet_limit_od_2021: { value: 150000, unit: "Kč / rok", binding: true, confidence: "zakon", source: "Zákon č. 586/1992 Sb.; Finanční správa", verifiedAt: "2026-09-05", note: "Limit odpočtu úroků pro bytovou potřebu obstaranou od 1. 1. 2021." }
  };

  var HypoData = {
    loaded: false,
    usingFallback: false,
    data: {},
    /** Vrátí jeden fakt podle klíče (hledá napříč regulatory/tax/earlyRepayment, pak fallback). */
    getFact: function (key) {
      var reg = this.data.regulatory && this.data.regulatory.facts;
      if (reg && reg[key]) return reg[key];
      var tax = this.data.tax && this.data.tax.facts;
      if (tax && tax[key]) return tax[key];
      var er = this.data.earlyRepayment && this.data.earlyRepayment.facts;
      if (er && er[key]) return er[key];
      if (FALLBACK_FACTS[key]) return FALLBACK_FACTS[key];
      return null;
    }
  };

  /** Naformátuje číslo v české konvenci (mezera jako oddělovač tisíců). */
  function formatNumber(value) {
    if (typeof value !== "number") return String(value);
    try {
      return new Intl.NumberFormat("cs-CZ").format(value);
    } catch (e) {
      return String(value);
    }
  }

  /** Datum ISO → české "5. 9. 2026". */
  function formatDate(iso) {
    if (!iso) return "";
    var parts = String(iso).split("-");
    if (parts.length !== 3) return iso;
    return parseInt(parts[2], 10) + ". " + parseInt(parts[1], 10) + ". " + parts[0];
  }

  /** Sestaví DOM štítku typu informace. */
  function buildConfidenceBadge(confidence) {
    var meta = CONFIDENCE[confidence];
    if (!meta) return null;
    var badge = document.createElement("span");
    badge.className = "confidence-badge " + meta.cls;
    badge.textContent = meta.label;
    badge.setAttribute("title", meta.title);
    badge.setAttribute("aria-label", "Typ informace: " + meta.title);
    return badge;
  }

  /**
   * Naplní jeden .fact element.
   * <span class="fact" data-fact="ltv_owner_standard"></span>
   * data-part="value|means|next|note" volitelně vybere konkrétní část faktu.
   * data-badge="false" potlačí štítek typu informace.
   */
  function fillFact(el) {
    var key = el.getAttribute("data-fact");
    if (!key) return;
    var fact = HypoData.getFact(key);
    if (!fact) {
      // Nikdy nenecháme prázdno — raději neutrální placeholder + vysvětlení v tooltipu.
      el.textContent = "údaj se nepodařilo načíst";
      el.classList.add("fact--missing");
      el.setAttribute("title", "Aktuální údaj se nepodařilo načíst (" + key + ").");
      return;
    }

    var part = el.getAttribute("data-part") || "value";
    var valueText = (fact.value != null && !isNaN(fact.value))
      ? formatNumber(fact.value) + (fact.unit ? " " + fact.unit : "")
      : "údaj se nepodařilo načíst";
    var text;
    if (part === "value") {
      text = valueText;
    } else if (fact[part] != null && String(fact[part]).length) {
      text = String(fact[part]);
    } else {
      text = valueText; // fallback na hodnotu, když daná část (means/next) chybí
    }

    el.textContent = text;
    el.classList.add("fact--filled");

    // Tooltip se zdrojem a datem ověření.
    var tip = [];
    if (fact.note) tip.push(fact.note);
    if (fact.source) tip.push("Zdroj: " + fact.source);
    if (fact.verifiedAt) tip.push("Ověřeno " + formatDate(fact.verifiedAt));
    if (tip.length) el.setAttribute("title", tip.join(" · "));
    el.setAttribute("data-source-url", fact.sourceUrl || "");

    // Štítek typu informace (pokud není potlačen).
    if (el.getAttribute("data-badge") !== "false" && fact.confidence) {
      var badge = buildConfidenceBadge(fact.confidence);
      if (badge) {
        el.appendChild(document.createTextNode(" "));
        el.appendChild(badge);
      }
    }
  }

  /** Naplní všechny .fact elementy na stránce. */
  function fillAllFacts(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll(".fact[data-fact]");
    for (var i = 0; i < nodes.length; i++) fillFact(nodes[i]);
  }

  /** Vykreslí tři vrstvy data-aktuálnosti do elementu [data-currency-layers]. */
  function renderCurrencyLayers() {
    var host = document.querySelector("[data-currency-layers]");
    if (!host) return;
    var layers = [
      { name: "Zákonná data", at: HypoData.data.regulatory && HypoData.data.regulatory._meta.verifiedAt, verb: "Ověřeno" },
      { name: "Tržní data (sazby bank)", at: HypoData.data.banks && HypoData.data.banks._meta.verifiedAt, verb: "Ověřeno" },
      { name: "Edukační obsah", at: HypoData.data.glossary && HypoData.data.glossary._meta.verifiedAt, verb: "Revize" }
    ];
    host.innerHTML = "";
    layers.forEach(function (l) {
      var item = document.createElement("span");
      item.className = "currency-layer";
      var when = l.at ? l.verb + " " + formatDate(l.at) : "průběžně aktualizováno";
      item.innerHTML = "<strong>" + l.name + ":</strong> " + when;
      host.appendChild(item);
    });
  }

  /** Načte jeden JSON soubor. */
  function loadJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error("Nepodařilo se načíst " + url + " (" + res.status + ")");
      return res.json();
    });
  }

  /** Načte všechna data a inicializuje vrstvu. */
  function init() {
    var keys = Object.keys(DATA_FILES);
    var promises = keys.map(function (k) { return loadJSON(DATA_FILES[k]); });

    Promise.all(promises)
      .then(function (results) {
        keys.forEach(function (k, i) { HypoData.data[k] = results[i]; });
        HypoData.loaded = true;

        fillAllFacts(document);
        renderCurrencyLayers();

        // Vystavit globálně + vyslat událost pro ostatní moduly.
        window.HypoData = HypoData;
        document.dispatchEvent(new CustomEvent("hypodata:ready", { detail: HypoData }));
      })
      .catch(function (err) {
        // Fetch selhal (výpadek sítě, špatná cesta na hostingu, file://…).
        // Web NESMÍ zůstat s prázdnými hodnotami — vyplníme fakty z vestavěného fallbacku.
        HypoData.loaded = true;
        HypoData.usingFallback = true;
        window.HypoData = HypoData;

        fillAllFacts(document);

        var banner = document.querySelector("[data-currency-layers]");
        if (banner) {
          banner.textContent = "Zobrazeny poslední ověřené hodnoty (2026-09-05). Aktuální data se nepodařilo načíst.";
          banner.classList.add("currency-layers--error");
        }
        // Ostatní moduly (kalkulačka) se spustí i tak — mají vlastní fallbacky.
        document.dispatchEvent(new CustomEvent("hypodata:ready", { detail: HypoData }));
        if (window.console) console.warn("[data-layer] fallback: " + err.message);
      });
  }

  // API pro ostatní moduly (např. dynamicky vložený obsah).
  HypoData.fillFacts = fillAllFacts;
  HypoData.formatNumber = formatNumber;
  HypoData.formatDate = formatDate;
  window.HypoData = HypoData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
