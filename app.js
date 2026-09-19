(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const PALETTE = ["#2e75b6", "#e08a1e", "#1a7f4b", "#c0392b", "#7d5ba6", "#17a2b8", "#b8860b", "#6c7a89", "#d6558b", "#3a9d8f"];
  let curated, live, charts = [];

  const fetchJSON = async p => { const r = await fetch(p + "?t=" + Date.now()); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); };

  async function init() {
    try { [curated, live] = await Promise.all([fetchJSON("data/curated.json"), fetchJSON("data/live.json").catch(() => null)]); }
    catch (e) { $("#view").innerHTML = `<div class="banner warn">Could not load data: ${esc(e.message)}</div>`; return; }
    $("#srcfile").textContent = curated.source_file;
    $("#asof").textContent = live ? `Live data last refreshed ${live.fetched_at}` : "Curated analysis";
    const tabs = curated.sheets.map((s, i) => ({ id: "s" + i, name: s.name, sheet: s }));
    if (live) tabs.push({ id: "live", name: "Live Data", live: true });
    $("#tabs").innerHTML = tabs.map(t => `<button class="tab${t.live ? " live" : ""}" role="tab" data-id="${t.id}" aria-selected="false">${esc(t.name)}</button>`).join("");
    $("#tabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) show(b.dataset.id, tabs); });
    show((location.hash || "").slice(1) || "s0", tabs);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => show(current, tabs));
  }

  let current;
  function show(id, tabs) {
    const t = tabs.find(x => x.id === id) || tabs[0];
    current = t.id; history.replaceState(null, "", "#" + t.id);
    document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.id === t.id));
    charts.forEach(c => c.destroy()); charts = [];
    const view = $("#view");
    view.innerHTML = t.live ? renderLive() : renderSheet(t.sheet);
    view.querySelectorAll("canvas[data-chart]").forEach(cv => makeChart(cv, JSON.parse(cv.dataset.chart)));
    scrollTo(0, 0);
  }

  // ---------- curated sheets ----------
  function renderSheet(sheet) {
    let out = "";
    for (const b of sheet.blocks) {
      switch (b.t) {
        case "title": out += `<h2 class="sheet">${esc(b.text)}</h2>`; break;
        case "subtitle": out += `<p class="subtitle">${esc(b.text)}</p>`; break;
        case "section": out += `<h3 class="section">${esc(b.text)}</h3>`; break;
        case "subhead": out += `<div class="subhead">${esc(b.text)}</div>`; break;
        case "note": out += `<p class="note">${esc(b.text)}</p>`; break;
        case "cards": out += `<div class="cards">${b.cards.map(c => `<div class="card ${/^[-−]/.test(c[1] || "") ? "neg" : ""}"><div class="l">${esc(c[0])}</div><div class="v">${esc(c[1])}</div><div class="n">${esc(c.slice(2).join(" · "))}</div></div>`).join("")}</div>`; break;
        case "table": out += tableHTML(b); break;
        case "chart": out += chartBox(b); break;
      }
    }
    return out;
  }

  function tableHTML(t) {
    const head = t.header.map(h => `<th>${esc(h)}</th>`).join("");
    const rows = t.rows.map(r => {
      if (r.group) {
        const [a, b] = r.cells;
        return `<tr class="${r.cls}"><td colspan="${b ? 1 : t.header.length}">${esc(a.d)}</td>${b ? `<td colspan="${t.header.length - 1}">${esc(b.d)}</td>` : ""}</tr>`;
      }
      const tds = r.cells.map(c => {
        const isNum = c.v !== undefined;
        return `<td class="${isNum ? "num" : ""}${isNum && c.v < 0 ? " neg" : ""}">${esc(c.d)}</td>`;
      }).join("");
      return `<tr class="${r.cls}">${tds}</tr>`;
    }).join("");
    return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function chartBox(c, cls = "") {
    const tall = c.type === "bar" && c.labels.length > 8 && c.series.length === 1;
    return `<div class="chartbox ${tall ? "tall" : ""} ${cls}"><h4>${esc(c.title)}</h4><div class="cv"><canvas data-chart='${esc(JSON.stringify(c)).replace(/'/g, "&#39;")}'></canvas></div></div>`;
  }

  function makeChart(cv, c) {
    const ink = css("--muted"), grid = css("--line");
    const horizontal = c.type === "bar" && c.series.length === 1 && c.labels.length > 8;
    const fmt = v => (v == null ? "" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 }));
    let cfg;
    if (c.type === "doughnut") {
      cfg = { type: "doughnut", data: { labels: c.labels, datasets: [{ data: c.series[0].data, backgroundColor: PALETTE, borderColor: css("--card"), borderWidth: 2 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { color: ink, boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: x => ` ${x.label}: ${fmt(x.parsed)}` } } } } };
    } else {
      const single = c.series.length === 1;
      const datasets = c.series.map((s, i) => {
        const isLine = c.type === "line" || (c.type === "combo" && i > 0);
        const base = { label: s.name, data: s.data, type: isLine ? "line" : "bar" };
        if (isLine) Object.assign(base, { borderColor: PALETTE[i % PALETTE.length], backgroundColor: PALETTE[i % PALETTE.length], tension: .25, pointRadius: c.type === "line" && s.data.length > 20 ? 0 : 3, spanGaps: true, borderWidth: 2 });
        else if (single && c.type !== "line") base.backgroundColor = s.data.map(v => (v < 0 ? css("--neg") : PALETTE[0]));
        else base.backgroundColor = PALETTE[i % PALETTE.length];
        return base;
      });
      cfg = { type: "bar", data: { labels: c.labels, datasets },
        options: { maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x", interaction: { mode: "index", intersect: false },
          plugins: { legend: { display: datasets.length > 1, labels: { color: ink, boxWidth: 12 } }, tooltip: { callbacks: { label: x => ` ${x.dataset.label}: ${fmt(x.parsed[horizontal ? "x" : "y"])}` } } },
          scales: horizontal
            ? { y: { ticks: { color: ink, font: { size: 11 }, autoSkip: false }, grid: { color: grid } }, x: { ticks: { color: ink, callback: v => fmt(v) }, grid: { color: grid } } }
            : { x: { ticks: { color: ink, font: { size: 11 }, maxRotation: 60, autoSkip: true }, grid: { color: grid } }, y: { ticks: { color: ink, callback: v => fmt(v) }, grid: { color: grid } } } } };
    }
    charts.push(new Chart(cv, cfg));
  }

  // ---------- live layer ----------
  const yrs = o => Object.keys(o).sort();
  const bn = v => (v == null ? null : Math.round(v / 1e7) / 100);       // USD -> USD bn, 2 dp
  function renderLive() {
    const wb = live.world_bank, S = wb.series, rbi = live.rbi_watch || { items: [] };
    let out = `<h2 class="sheet">Live official data</h2><p class="subtitle">Pulled automatically from public feeds by a scheduled job; last run ${esc(live.fetched_at)}. World Bank dataset updated ${esc(wb.lastupdated || "n/a")}.</p>`;
    out += rbi.items.length
      ? `<div class="banner warn"><b>RBI releases spotted:</b> ${rbi.items.map(i => `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>`).join(" · ")}. If one is a new quarterly BoP release, the curated tabs need a refresh.</div>`
      : `<div class="banner">RBI press-release watch: no BoP, external-debt or reserves release in the latest feed window.</div>`;
    const latest = code => { const d = S[code]?.data || {}, ys = yrs(d); const y = ys[ys.length - 1], p = ys[ys.length - 2]; return { y, v: d[y], pv: d[p], py: p }; };
    const card = (code, label, pct) => {
      if (!S[code]) return "";
      const { y, v, pv, py } = latest(code);
      const val = pct ? v.toFixed(2) + "% of GDP" : (v < 0 ? "-$" : "$") + Math.abs(bn(v)).toLocaleString("en-IN") + " bn";
      const chg = pv ? (pct ? `${(v - pv).toFixed(2)} pp vs ${py}` : `${((v / pv - 1) * 100).toFixed(1)}% vs ${py}`) : "";
      return `<div class="card ${v < 0 ? "neg" : ""}"><div class="l">${esc(label)} (${y})</div><div class="v">${val}</div><div class="n">${chg}</div></div>`;
    };
    out += `<div class="cards">${card("BX.GSR.MRCH.CD", "Goods exports")}${card("BM.GSR.MRCH.CD", "Goods imports")}${card("BN.CAB.XOKA.CD", "Current account")}${card("BN.CAB.XOKA.GD.ZS", "Current account", true)}${card("BX.TRF.PWKR.CD.DT", "Remittances")}${card("FI.RES.TOTL.CD", "Total reserves")}</div>`;

    const mk = (title, codes, type) => {
      const years = [...new Set(codes.flatMap(c => yrs(S[c]?.data || {})))].sort();
      return chartBox({ title, type, labels: years, series: codes.filter(c => S[c]).map(c => ({ name: S[c].label, data: years.map(y => bn(S[c].data[y])) })) });
    };
    out += `<div class="grid2">${mk("Trade in goods and services (USD bn)", ["BX.GSR.MRCH.CD", "BM.GSR.MRCH.CD", "BX.GSR.NFSV.CD", "BM.GSR.NFSV.CD"], "line")}${mk("Current account balance (USD bn)", ["BN.CAB.XOKA.CD"], "bar")}${mk("Capital and transfer flows (USD bn)", ["BX.TRF.PWKR.CD.DT", "BX.KLT.DINV.CD.WD", "BN.KLT.PTXL.CD"], "line")}${mk("Total reserves including gold (USD bn)", ["FI.RES.TOTL.CD"], "line")}</div>`;

    const years = yrs(S["BN.CAB.XOKA.CD"]?.data || {}).slice(-8);
    const rows = Object.entries(S).map(([code, s]) => {
      const pct = code.endsWith("ZS");
      return `<tr><td>${esc(s.label)}${pct ? " (%)" : " (USD bn)"}</td>${years.map(y => { const v = s.data[y]; const x = v == null ? "" : pct ? v.toFixed(2) : bn(v).toLocaleString("en-IN"); return `<td class="num${v < 0 ? " neg" : ""}">${x}</td>`; }).join("")}</tr>`;
    }).join("");
    out += `<h3 class="section">Series table (last ${years.length} years)</h3><div class="tablewrap"><table><thead><tr><th>Series</th>${years.map(y => `<th>${y}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
    out += `<p class="note">Source: ${esc(wb.source)}. Years follow the World Bank's own labelling and can differ from RBI fiscal-year (April to March) figures and revisions in the curated tabs, so the two layers will not match to the decimal.</p>`;
    return out;
  }

  init();
})();
