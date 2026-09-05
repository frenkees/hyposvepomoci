/*
 * terms.js — Systém pojmů, 3 úrovně (Fáze P1)
 *
 * <button class="term" data-term="ltv">LTV</button>
 *   Úroveň 1: hover/fokus → tooltip s krátkým vysvětlením (short).
 *   Úroveň 2: klik/Enter → detail pojmu (jednoduše, příklad, proč, související, zdroje).
 *   Úroveň 3: v detailu „Chci tomu rozumět do hloubky" → podrobné vysvětlení (deep)
 *             a odkaz do slovníčku.
 *
 * Reusable: HypoTerms.enhance(root) projde [data-term] a napojí je (i po dynamickém
 * vykreslení kalkulačky). HypoTerms.open(id) otevře detail. Přístupné klávesnicí.
 */
(function () {
  "use strict";

  var byId = {};
  var modal, lastFocused;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  function buildIndex(terms) {
    (terms || []).forEach(function (t) { if (t.id) byId[t.id] = t; });
  }

  /* --- Enhance [data-term] --- */
  function enhance(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("[data-term]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute("data-term-ready") === "1") continue;
      var id = el.getAttribute("data-term");
      var t = byId[id];
      if (!t) continue;
      el.setAttribute("data-term-ready", "1");
      el.classList.add("term");
      // Tooltip (short) — na hover i fokus.
      var tip = document.createElement("span");
      tip.className = "term__tip";
      tip.setAttribute("role", "tooltip");
      tip.textContent = t.short;
      el.appendChild(tip);
      // Přístupnost: chová se jako tlačítko.
      if (el.tagName !== "BUTTON") { el.setAttribute("role", "button"); el.setAttribute("tabindex", "0"); }
      el.setAttribute("aria-haspopup", "dialog");
      el.setAttribute("aria-label", (el.getAttribute("data-label") || el.firstChild && el.firstChild.textContent || t.term) + " — vysvětlení pojmu");
      (function (termId, node) {
        node.addEventListener("click", function (e) { e.preventDefault(); open(termId, node); });
        node.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(termId, node); } });
      })(id, el);
    }
  }

  /* --- Modal --- */
  function ensureModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "term-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="term-modal__backdrop" data-close></div>' +
      '<div class="term-modal__panel" role="dialog" aria-modal="true" aria-labelledby="term-modal-title">' +
        '<button class="term-modal__close" data-close aria-label="Zavřít">✕</button>' +
        '<div class="term-modal__body"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", close); });
    document.addEventListener("keydown", function (e) { if (!modal.hidden && e.key === "Escape") close(); });
  }

  function relatedChips(ids) {
    var chips = (ids || []).map(function (rid) {
      var rt = byId[rid];
      if (!rt) return "";
      return '<button class="term-chip" data-goto="' + esc(rid) + '">' + esc(rt.term) + '</button>';
    }).filter(Boolean).join("");
    return chips ? '<div class="term-modal__related"><span class="term-modal__k">Související pojmy:</span> ' + chips + '</div>' : "";
  }

  function sourceLinks(srcs) {
    if (!srcs || !srcs.length) return "";
    var items = srcs.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a></li>'; }).join("");
    return '<div class="term-modal__sources"><span class="term-modal__k">Zdroje:</span><ul>' + items + '</ul></div>';
  }

  function open(id, invoker) {
    var t = byId[id];
    if (!t) return;
    ensureModal();
    lastFocused = invoker || document.activeElement;

    var body = modal.querySelector(".term-modal__body");
    body.innerHTML =
      '<div class="term-modal__eyebrow">Pojem</div>' +
      '<h3 id="term-modal-title" class="term-modal__title">' + esc(t.term) + (t.abbr ? ' <span class="term-modal__abbr">' + esc(t.abbr) + '</span>' : "") + '</h3>' +
      '<p class="term-modal__lead">' + esc(t.short) + '</p>' +
      (t.simple ? '<h4>Jednoduše</h4><p>' + esc(t.simple) + '</p>' : "") +
      (t.example ? '<h4>Příklad</h4><p>' + esc(t.example) + '</p>' : "") +
      (t.why ? '<h4>Proč na tom záleží?</h4><p>' + esc(t.why) + '</p>' : "") +
      (t.deep ? '<details class="term-modal__deep"><summary>Chci tomu rozumět do hloubky →</summary><p>' + esc(t.deep) + '</p></details>' : "") +
      relatedChips(t.related) +
      sourceLinks(t.sources) +
      '<div class="term-modal__foot"><a class="btn btn--ghost" href="#slovnicek" data-close>Otevřít slovníček</a></div>';

    // Související pojmy → přepnout detail.
    body.querySelectorAll("[data-goto]").forEach(function (b) {
      b.addEventListener("click", function () { open(b.getAttribute("data-goto"), invoker); });
    });
    body.querySelectorAll('[data-close][href="#slovnicek"]').forEach(function (b) { b.addEventListener("click", close); });

    modal.hidden = false;
    document.body.style.overflow = "hidden";
    var closeBtn = modal.querySelector(".term-modal__close");
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* --- Init --- */
  function init() {
    var terms = window.HypoData && window.HypoData.data && window.HypoData.data.glossary && window.HypoData.data.glossary.terms;
    if (terms) buildIndex(terms);
    enhance(document);
  }

  window.HypoTerms = { enhance: enhance, open: open, close: close, _index: byId };

  if (window.HypoData && window.HypoData.loaded) init();
  else document.addEventListener("hypodata:ready", init, { once: true });
})();
