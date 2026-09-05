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

  var HypoData = {
    loaded: false,
    data: {},
    /** Vrátí jeden fakt podle klíče (hledá napříč regulatory/tax). */
    getFact: function (key) {
      var reg = this.data.regulatory && this.data.regulatory.facts;
      if (reg && reg[key]) return reg[key];
      var tax = this.data.tax && this.data.tax.facts;
      if (tax && tax[key]) return tax[key];
      var er = this.data.earlyRepayment && this.data.earlyRepayment.facts;
      if (er && er[key]) return er[key];
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
      el.classList.add("fact--missing");
      el.setAttribute("title", "Chybí data pro: " + key);
      return;
    }

    var part = el.getAttribute("data-part") || "value";
    var text = "";
    if (part === "value") {
      text = formatNumber(fact.value) + (fact.unit ? " " + fact.unit : "");
    } else if (fact[part] != null) {
      text = String(fact[part]);
    } else {
      text = formatNumber(fact.value) + (fact.unit ? " " + fact.unit : "");
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
        // Bez datové vrstvy web nesmí zobrazovat nepodložená čísla — jasně to oznámíme.
        var banner = document.querySelector("[data-currency-layers]");
        if (banner) {
          banner.textContent = "Data se nepodařilo načíst. Web musí běžet přes HTTP server (ne přímo ze souboru).";
          banner.classList.add("currency-layers--error");
        }
        if (window.console) console.error("[data-layer] " + err.message);
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
