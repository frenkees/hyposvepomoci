/*
 * app.js — Základní chování stránky (Fáze 1)
 *  - mobilní menu (hamburger)
 *  - scroll spy (zvýraznění aktivní položky navigace)
 *  - vykreslení slovníčku a programů SFPI z datové vrstvy (po hypodata:ready)
 */
(function () {
  "use strict";

  /* --- Mobilní menu --- */
  function initMobileMenu() {
    var nav = document.querySelector(".nav");
    var toggle = nav && nav.querySelector(".nav__toggle");
    if (!nav || !toggle) return;

    toggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", String(!open));
      toggle.setAttribute("aria-expanded", String(!open));
      toggle.setAttribute("aria-label", open ? "Otevřít menu" : "Zavřít menu");
    });

    // Zavřít po kliknutí na odkaz v mobilním menu.
    nav.querySelectorAll(".nav__mobile a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.setAttribute("data-open", "false");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* --- Scroll spy --- */
  function initScrollSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".nav__links a[href^='#']"));
    if (!links.length || !("IntersectionObserver" in window)) return;

    var map = {};
    links.forEach(function (l) {
      var id = l.getAttribute("href").slice(1);
      var sec = document.getElementById(id);
      if (sec) map[id] = l;
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = map[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("is-active"); });
          link.classList.add("is-active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

    Object.keys(map).forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec) observer.observe(sec);
    });
  }

  /* --- Slovníček (dvě úrovně) --- */
  function renderGlossary(data) {
    var host = document.getElementById("glossary-list");
    var terms = data.glossary && data.glossary.terms;
    if (!host || !terms) return;

    host.innerHTML = "";
    terms.forEach(function (t, i) {
      var item = document.createElement("div");
      item.className = "glossary__item";

      var term = document.createElement("div");
      term.className = "glossary__term";
      term.textContent = t.term;

      var short = document.createElement("p");
      short.className = "glossary__short";
      short.textContent = t.short;

      item.appendChild(term);
      item.appendChild(short);

      if (t.deep) {
        var deepId = "glossary-deep-" + i;
        var btn = document.createElement("button");
        btn.className = "glossary__toggle";
        btn.type = "button";
        btn.textContent = "Chci tomu opravdu rozumět ▾";
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-controls", deepId);

        var deep = document.createElement("div");
        deep.className = "glossary__deep";
        deep.id = deepId;
        deep.hidden = true;
        deep.textContent = t.deep;

        btn.addEventListener("click", function () {
          var open = !deep.hidden;
          deep.hidden = open;
          btn.setAttribute("aria-expanded", String(!open));
          btn.textContent = open ? "Chci tomu opravdu rozumět ▾" : "Skrýt ▴";
        });

        item.appendChild(btn);
        item.appendChild(deep);
      }
      host.appendChild(item);
    });
  }

  /* --- Programy SFPI (dynamický stav) --- */
  function renderSfpi(data) {
    var host = document.getElementById("sfpi-programs");
    var programs = data.sfpi && data.sfpi.programs;
    if (!host || !programs) return;

    host.innerHTML = "";
    programs.forEach(function (p) {
      var card = document.createElement("div");
      card.className = "card";

      var status = document.createElement("span");
      status.className = "confidence-badge";
      // Barevné odlišení stavu programu.
      if (p.status === "otevreno") status.classList.add("confidence--zakon");
      else if (p.status === "pouze_stavajici") status.classList.add("confidence--doporuceni");
      else status.classList.add("confidence--rada");
      status.textContent = p.statusLabel || p.status;

      var h = document.createElement("h3");
      h.textContent = p.name + " ";
      h.appendChild(status);

      var note = document.createElement("p");
      note.textContent = p.note || "";

      var means = document.createElement("p");
      means.className = "text-muted";
      means.textContent = p.means || "";

      card.appendChild(h);
      card.appendChild(note);
      if (p.means) card.appendChild(means);
      host.appendChild(card);
    });
  }

  /* --- Init --- */
  function init() {
    initMobileMenu();
    initScrollSpy();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Obsah závislý na datech vykreslíme, až je datová vrstva připravená.
  document.addEventListener("hypodata:ready", function (e) {
    var data = e.detail.data;
    renderGlossary(data);
    renderSfpi(data);
  });
})();
