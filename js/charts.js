/*
 * charts.js — Grafy, amortizační tabulka a CSV (Fáze 3)
 *
 * Poslouchá 'calc:updated' z kalkulačky. Grafy kreslí přes Chart.js (CDN);
 * pokud se knihovna nenačte, zobrazí textový fallback — UI nikdy není rozbité.
 * Amortizační tabulka (po letech) a CSV export nemají žádnou závislost.
 */
(function () {
  "use strict";

  var charts = {};
  var lastSchedule = null;
  var CHART_SRC = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
  var chartLoading = false;

  function fmtCZK(n) { try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(Math.round(n)); } catch (e) { return Math.round(n) + " Kč"; } }
  function hasChart() { return typeof window.Chart !== "undefined"; }
  /* Když graf nejde vykreslit, sbal i prázdný 260px box okolo canvasu. */
  function hideCanvasBox(canvas) {
    canvas.style.display = "none";
    var box = canvas.closest(".chart-card__canvas");
    if (box) box.style.height = "auto";
  }

  /* Lazy-load Chart.js — až když se kalkulačka objeví ve viewportu. */
  function ensureChartJs() {
    if (hasChart() || chartLoading) return;
    chartLoading = true;
    var s = document.createElement("script");
    s.src = CHART_SRC; s.async = true;
    s.onload = function () { if (lastSchedule) redraw(lastSchedule); };
    s.onerror = function () { /* zůstane textový fallback */ };
    document.head.appendChild(s);
  }
  function initLazyLoad() {
    var target = document.getElementById("kalkulacka");
    if (!target) return;
    if (!("IntersectionObserver" in window)) { ensureChartJs(); return; }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { ensureChartJs(); obs.disconnect(); } });
    }, { rootMargin: "300px" });
    obs.observe(target);
  }

  /** Agregace měsíčního kalendáře po rocích. */
  function byYear(rows) {
    var years = [];
    rows.forEach(function (r) {
      var y = Math.ceil(r.month / 12);
      var e = years[y - 1] || (years[y - 1] = { year: y, paid: 0, interest: 0, principal: 0, balance: 0 });
      e.paid += r.payment + r.extra;
      e.interest += r.interest;
      e.principal += r.principal + r.extra;
      e.balance = r.balance;
    });
    return years;
  }

  var CSS = getComputedStyle(document.documentElement);
  function tok(name, fb) { var v = CSS.getPropertyValue(name); return v ? v.trim() : fb; }

  function renderBalanceChart(years) {
    var canvas = document.querySelector('[data-chart="balance"]');
    var fb = document.querySelector('[data-chart-fallback="balance"]');
    if (!canvas) return;
    if (!hasChart()) {
      hideCanvasBox(canvas);
      // Fallback: zůstatek v milnících.
      var picks = [5, 10, 15, 20, 25, 30].filter(function (y) { return years[y - 1]; });
      fb.innerHTML = '<table class="stress" style="width:100%"><tbody>' +
        picks.map(function (y) { return '<tr><td>Za ' + y + ' let</td><td style="text-align:right">' + fmtCZK(years[y - 1].balance) + '</td></tr>'; }).join("") +
        '</tbody></table>';
      return;
    }
    fb.innerHTML = "";
    var labels = years.map(function (y) { return y.year; });
    var data = years.map(function (y) { return Math.round(y.balance); });
    if (charts.balance) { charts.balance.data.labels = labels; charts.balance.data.datasets[0].data = data; charts.balance.update(); return; }
    charts.balance = new window.Chart(canvas, {
      type: "line",
      data: { labels: labels, datasets: [{ label: "Zbývající dluh", data: data, borderColor: tok("--color-primary", "#1B4965"), backgroundColor: "rgba(27,73,101,0.08)", fill: true, tension: 0.2, pointRadius: 0 }] },
      options: chartOpts("Kč")
    });
  }

  function renderCompositionChart(years) {
    var canvas = document.querySelector('[data-chart="composition"]');
    var fb = document.querySelector('[data-chart-fallback="composition"]');
    if (!canvas) return;
    var totalInt = years.reduce(function (a, y) { return a + y.interest; }, 0);
    var totalPrin = years.reduce(function (a, y) { return a + y.principal; }, 0);
    if (!hasChart()) {
      hideCanvasBox(canvas);
      fb.innerHTML = '<table class="stress" style="width:100%"><tbody>' +
        '<tr><td>Jistina celkem</td><td style="text-align:right">' + fmtCZK(totalPrin) + '</td></tr>' +
        '<tr><td>Úroky celkem</td><td style="text-align:right">' + fmtCZK(totalInt) + '</td></tr></tbody></table>';
      return;
    }
    fb.innerHTML = "";
    var labels = years.map(function (y) { return y.year; });
    var prin = years.map(function (y) { return Math.round(y.principal); });
    var intr = years.map(function (y) { return Math.round(y.interest); });
    if (charts.comp) {
      charts.comp.data.labels = labels;
      charts.comp.data.datasets[0].data = prin;
      charts.comp.data.datasets[1].data = intr;
      charts.comp.update(); return;
    }
    charts.comp = new window.Chart(canvas, {
      type: "bar",
      data: { labels: labels, datasets: [
        { label: "Jistina", data: prin, backgroundColor: tok("--color-primary", "#1B4965") },
        { label: "Úrok", data: intr, backgroundColor: tok("--color-secondary", "#5FA8D3") }
      ] },
      options: Object.assign(chartOpts("Kč"), { scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: kFmt } } } })
    });
  }

  function kFmt(v) { return (v >= 1000000 ? (v / 1000000).toFixed(1) + " M" : (v / 1000).toFixed(0) + " tis."); }
  function chartOpts(unit) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: "bottom", labels: { font: { family: "Inter, sans-serif" } } },
                 tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + fmtCZK(c.parsed.y); } } } },
      scales: { x: { title: { display: true, text: "Rok" }, grid: { display: false } },
                y: { ticks: { callback: kFmt } } }
    };
  }

  function fmtInt(n) { try { return new Intl.NumberFormat("cs-CZ").format(Math.round(n)); } catch (e) { return String(Math.round(n)); } }

  /** Amortizační tabulka po letech. Kompaktní čísla (v Kč), aby se vešla bez přetékání. */
  function renderAmortTable(sched) {
    var host = document.querySelector("[data-amort]");
    if (!host) return;
    var years = byYear(sched.rows);
    var html = '<table class="amort-table"><thead><tr><th>Rok</th><th>Zaplaceno</th><th>Úrok</th><th>Jistina</th><th>Zůstatek</th></tr></thead><tbody>';
    years.forEach(function (y) {
      html += '<tr><td>' + y.year + '</td><td>' + fmtInt(y.paid) + '</td><td>' + fmtInt(y.interest) + '</td><td>' + fmtInt(y.principal) + '</td><td>' + fmtInt(y.balance) + '</td></tr>';
    });
    html += '</tbody></table><p class="text-muted" style="font-size:.85rem">Souhrn po letech, částky v Kč. Měsíční detail je v CSV.</p>';
    host.innerHTML = html;
  }

  /* --- CSV export (měsíční detail) --- */
  function toCSV(sched) {
    var sep = ";"; // české Excel prostředí
    function n(x) { return String(Math.round(x)).replace(".", ","); }
    var lines = ["Mesic" + sep + "Splatka" + sep + "Urok" + sep + "Jistina" + sep + "Mimoradna" + sep + "Zustatek"];
    sched.rows.forEach(function (r) {
      lines.push([r.month, n(r.payment), n(r.interest), n(r.principal), n(r.extra), n(r.balance)].join(sep));
    });
    return "﻿" + lines.join("\r\n"); // BOM kvůli diakritice v Excelu
  }

  function downloadCSV() {
    if (!lastSchedule) return;
    var blob = new Blob([toCSV(lastSchedule)], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "splatkovy-kalendar.csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  /* --- Napojení --- */
  function redraw(sched) {
    var years = byYear(sched.rows);
    renderBalanceChart(years);
    renderCompositionChart(years);
    renderAmortTable(sched);
  }

  document.addEventListener("calc:updated", function (e) {
    lastSchedule = e.detail.result.sched;
    redraw(lastSchedule);
  });

  document.addEventListener("click", function (e) {
    if (e.target && e.target.matches("[data-csv]")) downloadCSV();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initLazyLoad);
  else initLazyLoad();
})();
