/* =====================================================================
   CropLP — frontend (vanilla JS + Plotly.js, works fully offline)
   ===================================================================== */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ------------------------------------------------------------------ state
const S = {
  sid: null, meta: null, prep: null, page: "home",
  colmap: {}, cleaning: { drop_zero: true, merge_alias: true, drop_agg: true, reconcile: true },
  scope: null,
  settings: { yield_method: "mean", bound_mode: "historical", band_pct: 30, min_years: null, ratio_thr: 250 },
  crops: null, L: null, target: 100, shock: -15, shockCrops: [], trendPick: null, topBy: "Area",
  cache: {},
};

// ------------------------------------------------------------------ icons
const IC = {
  upload: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  flask: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/></svg>',
  gov: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M2 10l10-6 10 6"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>',
  tool: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/></svg>',
  bulb: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
  dl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  dot: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/></svg>',
};

// ------------------------------------------------------------------ glossary
const GLOSS = {
  yc: ["Yield coefficient y<sub>c</sub>", "Average production per hectare of crop c over the chosen years (Production ÷ Area). It is the 'value' of a hectare in the LP."],
  bounds: ["Bounds a<sub>c</sub> ≤ x<sub>c</sub> ≤ m<sub>c</sub>", "The least and most land a crop may receive. By default the smallest and largest area the crop actually had in the chosen years — keeps the plan realistic."],
  L: ["Land budget L", "Total hectares available to share among the crops. Default: the average land the selected crops actually used."],
  D: ["Production target D", "Minimum total production the plan must deliver. Default: the historical output."],
  shadow: ["Shadow price λ*", "How much total output rises if one more hectare of land were available. It equals the yield of the marginal crop."],
  mu: ["Shadow price μ*", "Extra hectares needed for each extra unit of production target. In theory μ* = 1/λ* at the same point."],
  basic: ["Marginal (basic) crop", "The one crop that sits strictly between its bounds. It absorbs the leftover land, and its yield sets the shadow price."],
  reduced: ["Reduced cost", "For a crop held at its minimum: how much its yield must rise before the LP would give it more land (negative = not worth expanding)."],
  ranging: ["Yield ranging", "The range within which a crop's yield can move without changing which crops are expanded or cut."],
  unit: ["Production-unit check", "Only crops measured in the same unit (weight) can be added together. Crops reported in nuts or bales are excluded."],
  stacked: ["Stacked duplicate source", "The same record appearing twice in the file, once with production ×100. Detected automatically and fixed by rescaling."],
  cv: ["Coefficient of variation", "Standard deviation ÷ mean of yield. Higher = less predictable crop."],
};
const term = (k, text) => `<span class="term" data-term="${k}">${text}</span>`;

// ------------------------------------------------------------------ utils
const nf = (d) => new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
function fmt(x, d = 0) {
  if (x == null || Number.isNaN(x)) return "–";
  const s = nf(d).format(x);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;   // no "-0.000"
}
function fmtBig(x) {
  if (x == null) return "–";
  const a = Math.abs(x);
  if (a >= 1e9) return fmt(x / 1e9, 2) + " B";
  if (a >= 1e6) return fmt(x / 1e6, 2) + " M";
  if (a >= 1e4) return fmt(x / 1e3, 1) + " K";
  return fmt(x, a < 10 ? 2 : 0);
}
function pct(x, d = 1, sign = true) { return x == null ? "–" : (sign && x > 0 ? "+" : "") + fmt(x, d) + "%"; }
function delta(x, invert = false, d = 1) {
  if (x == null) return "";
  const good = invert ? x < 0 : x > 0;
  return `<span class="delta ${good ? "up" : "down"}">${x > 0 ? "▲" : "▼"} ${fmt(Math.abs(x), d)}%</span>`;
}
const title = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function toast(msg, err = false) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), err ? 6500 : 3200);
}

let inflight = 0;
function busy(on) {
  inflight += on ? 1 : -1;
  const p = $("#progress");
  if (inflight > 0) { p.className = "progress"; void p.offsetWidth; p.className = "progress on"; }
  else { p.className = "progress done"; }
}

async function api(path, body, form = false) {
  busy(true);
  try {
    const r = await fetch(path, form ? { method: "POST", body } :
      { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || `Request failed (${r.status})`);
    return j;
  } finally { busy(false); }
}

const ctx = () => ({ sid: S.sid, scope: S.scope, settings: S.settings, crops: S.crops });
async function cached(path, body) {
  const key = path + JSON.stringify(body);
  if (!S.cache[key]) S.cache[key] = api(path, body);
  try { return await S.cache[key]; } catch (e) { delete S.cache[key]; throw e; }
}
function invalidate({ keepL = false } = {}) { S.cache = {}; if (!keepL) S.L = null; }

function downloadCSV(rows, name) {
  if (!rows || !rows.length) return;
  const cols = Object.keys(rows[0]);
  const q = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ------------------------------------------------------------------ charts
function colors() {
  return { hist: cssv("--accent"), opt: cssv("--accent-2"), third: cssv("--accent-3"), neutral: cssv("--neutral-mark"),
    text: cssv("--text-2"), grid: cssv("--border"), surface: cssv("--surface"), bad: cssv("--bad") };
}
function plot(el, data, layout = {}, opts = {}) {
  if (typeof el === "string") el = $(el);
  if (!el) return;
  const c = colors();
  const base = {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: cssv("--font") || "Segoe UI, sans-serif", size: 12.5, color: c.text },
    margin: { l: 60, r: 16, t: 10, b: 44 }, height: opts.height || 340,
    hoverlabel: { font: { size: 12.5 } }, hovermode: "closest",
    legend: { orientation: "h", y: 1.08, x: 0, font: { size: 12 } },
    xaxis: { gridcolor: c.grid, zeroline: false, linecolor: c.grid, automargin: true },
    yaxis: { gridcolor: c.grid, zeroline: false, linecolor: c.grid, automargin: true },
  };
  const merged = { ...base, ...layout,
    xaxis: { ...base.xaxis, ...(layout.xaxis || {}) }, yaxis: { ...base.yaxis, ...(layout.yaxis || {}) } };
  Plotly.react(el, data, merged, { displaylogo: false, responsive: true,
    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines"],
    toImageButtonOptions: { format: "png", scale: 2, filename: opts.filename || "croplp-chart" } });
}

// ------------------------------------------------------------------ tables
function table(el, cols, rows, { search = false, limit = 0, id = "" } = {}) {
  if (typeof el === "string") el = $(el);
  const st = { sortK: null, asc: false, q: "", all: !limit };
  function draw() {
    let r = rows.slice();
    if (st.q) { const q = st.q.toLowerCase(); r = r.filter((x) => cols.some((c) => String(x[c.k] ?? "").toLowerCase().includes(q))); }
    if (st.sortK) {
      r.sort((a, b) => { const x = a[st.sortK], y = b[st.sortK];
        if (x == null) return 1; if (y == null) return -1;
        return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * (st.asc ? 1 : -1); });
    }
    const shown = st.all ? r : r.slice(0, limit);
    const tools = (search || (limit && r.length > limit)) ? `<div class="table-tools">
        ${search ? `<input class="input tsearch" placeholder="Search…" value="${esc(st.q)}">` : "<span></span>"}
        <span class="small muted">${fmt(r.length)} rows${limit && r.length > limit ? ` · <a href="#" class="tmore">${st.all ? "show fewer" : "show all"}</a>` : ""}</span></div>` : "";
    el.innerHTML = tools + `<div class="table-wrap"><table class="t" ${id ? `id="${id}"` : ""}><thead><tr>${cols.map((c) =>
      `<th data-k="${c.k}" class="${c.r ? "r" : ""} ${st.sortK === c.k ? "sorted" + (st.asc ? " asc" : "") : ""}" title="Sort">${c.label}</th>`).join("")}</tr></thead>
      <tbody>${shown.map((x) => `<tr>${cols.map((c) => `<td class="${c.r ? "r" : ""}">${c.f ? c.f(x[c.k], x) : esc(x[c.k])}</td>`).join("")}</tr>`).join("")
      || `<tr><td colspan="${cols.length}" class="muted">No rows</td></tr>`}</tbody></table></div>`;
    $$("th", el).forEach((th) => th.onclick = () => { const k = th.dataset.k; st.asc = st.sortK === k ? !st.asc : false; st.sortK = k; draw(); });
    const s = $(".tsearch", el);
    if (s) { s.oninput = debounce(() => { st.q = s.value; draw(); const n = $(".tsearch", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); }
    const m = $(".tmore", el); if (m) m.onclick = (e) => { e.preventDefault(); st.all = !st.all; draw(); };
  }
  draw();
}
const F = {
  int: (v) => fmt(v, 0), n2: (v) => fmt(v, 2), n3: (v) => fmt(v, 3), n4: (v) => fmt(v, 4),
  pct: (v) => v == null ? "–" : `<span class="${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${pct(v)}</span>`,
  signed: (v) => v == null ? "–" : `<span class="${v > 0.5 ? "pos" : v < -0.5 ? "neg" : ""}">${v > 0 ? "+" : ""}${fmt(v, 0)}</span>`,
  status: (v) => {
    if (!v) return "–";
    if (v.startsWith("at max")) return '<span class="badge good">▲ at maximum</span>';
    if (v.startsWith("at min")) return '<span class="badge neutral">▼ at minimum</span>';
    if (v.startsWith("basic")) return '<span class="badge info">● marginal crop</span>';
    return esc(v);
  },
  title: (v) => esc(title(v)),
};

// ------------------------------------------------------------------ UI helpers
const loader = (msg = "Crunching the numbers…") => `<div class="center-load"><div class="spinner"></div><div>${msg}</div></div>`;
const callout = (kind, html, icon = kind === "warn" ? IC.warn : kind === "good" ? IC.check : IC.info) =>
  `<div class="callout ${kind}">${icon}<div>${html}</div></div>`;
const kpi = (label, value, sub = "", hero = false) =>
  `<div class="card kpi ${hero ? "hero" : ""}"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
const card = (head, body, sub = "", right = "") =>
  `<div class="card"><div class="card-head"><div><h3>${head}</h3>${sub ? `<p>${sub}</p>` : ""}</div>${right}</div>${body}</div>`;
const pageHead = (eyebrow, h, p, right = "") =>
  `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${h}</h1>${p ? `<p>${p}</p>` : ""}</div>${right}</div>`;
const NEXT = { home: "data", data: "explore", explore: "crops", crops: "max", max: "min", min: "whatif", whatif: "districts", districts: "method" };
const NAMES = { home: "Load data", data: "Data quality", explore: "Explore", crops: "Crops & inputs", max: "Maximise output",
  min: "Minimise land", whatif: "What-if analysis", districts: "Compare districts", method: "How it works" };
const nextBar = (page) => NEXT[page] ? `<div class="next-bar"><span class="muted small">Step ${Object.keys(NAMES).indexOf(page) + 1} of 8</span>
  <button class="btn primary" data-go="${NEXT[page]}">Next: ${NAMES[NEXT[page]]} ${IC.arrow}</button></div>` : "";
const scopeText = () => S.scope ? `${S.scope.state} · ${S.scope.season} · ${S.scope.districts.length ? S.scope.districts.length + " district(s)" : "all districts"} · ${S.scope.years[0]}–${S.scope.years[1]}` : "";

// ------------------------------------------------------------------ navigation
const view = () => $("#view");
const PAGES = {};
function go(page) {
  if (!PAGES[page]) return;
  if (!S.prep && !["home", "method"].includes(page)) page = "home";
  S.page = page;
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("#scopebar").classList.toggle("hidden", !S.prep || ["home", "data", "method"].includes(page));
  closeMS();
  window.scrollTo({ top: 0 });
  try { history.replaceState(null, "", "#" + page); } catch (e) { /* ignore */ }
  PAGES[page]();
}
function rerender() { PAGES[S.page](); }
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); go(g.dataset.go); }
  const n = e.target.closest(".nav-item");
  if (n && !n.disabled) go(n.dataset.page);
});

async function guarded(fn) {
  try { await fn(); } catch (e) {
    view().innerHTML = `<div class="page">${callout("bad", `<b>Something needs attention.</b><br>${esc(e.message)}`)}
      <div style="margin-top:14px"><button class="btn" id="retry">Try again</button></div></div>`;
    $("#retry").onclick = () => { invalidate({ keepL: true }); rerender(); };
  }
}

// ================================================================== PAGE: home
PAGES.home = async function () {
  const v = view();
  if (S.meta) return renderMapping();
  v.innerHTML = `<div class="page">
    <div class="hero">
      <div class="eyebrow">Operations Research · Linear Programming</div>
      <h1>Find the crop mix that gets the most out of every hectare.</h1>
      <p class="lead">Load district-level crop records and CropLP cleans them, checks units, builds the
      linear programme from real yields and tells you — in plain language — how land should be re-allocated
      to <b>maximise output</b> or to <b>save land</b> for the same production.</p>
      <div class="hero-steps"><span><i>1</i>Load data</span><span><i>2</i>Check quality</span><span><i>3</i>Explore</span>
        <span><i>4</i>Optimise</span><span><i>5</i>Test what-ifs</span></div>
    </div>
    <div class="source-cards">
      <label class="source drop" id="drop">
        <input type="file" id="fileIn" accept=".csv,.xlsx,.xls,.txt" hidden>
        <div class="s-ic">${IC.upload}</div>
        <h3>Upload your own file</h3>
        <p>Drag & drop a CSV or Excel file here, or <u>click to browse</u>.</p>
        <p class="small muted">Needs at least <b>Crop</b>, <b>Area</b> and <b>Production</b> columns.</p>
      </label>
      <button class="source" data-load="demo"><span class="badge good tag">Recommended to start</span>
        <div class="s-ic">${IC.flask}</div><h3>Try the demo dataset</h3>
        <p>A fictional state with 6 districts, 3 seasons and deliberately planted data problems to catch.</p>
        <span class="small muted">1,664 rows · loads instantly</span></button>
      <button class="source" data-load="gov"><div class="s-ic">${IC.gov}</div><h3>Government of India data</h3>
        <p>The full district-wise, season-wise crop production record used in the project report.</p>
        <span class="small muted">575,879 rows · ~10 s to load</span></button>
    </div>
    <div class="grid g2 format">
      ${card("What should my file look like?", `<div class="table-wrap"><table class="t"><thead><tr><th>Column</th><th>Needed?</th><th>Example</th></tr></thead><tbody>
        <tr><td><b>Crop</b></td><td><span class="badge bad">required</span></td><td>Rice</td></tr>
        <tr><td><b>Area</b> (hectares)</td><td><span class="badge bad">required</span></td><td>1254</td></tr>
        <tr><td><b>Production</b></td><td><span class="badge bad">required</span></td><td>2000</td></tr>
        <tr><td>Year</td><td><span class="badge neutral">optional</span></td><td>2015</td></tr>
        <tr><td>State, District, Season</td><td><span class="badge neutral">optional</span></td><td>Karnataka, Mysore, Kharif</td></tr>
        <tr><td>Yield</td><td><span class="badge neutral">optional</span></td><td>computed if missing</td></tr></tbody></table></div>
        <p class="small muted" style="margin-top:10px">Column names don't have to match exactly — you can map them on the next screen. Comma, semicolon or tab separated CSV and Excel files all work.</p>`)}
      ${card("Sample files to test uploading", `<div class="stack">
        <div class="check-row"><div><div class="t1">synthetic_crop_data_demo.csv</div><div class="t2">Full 8-column schema · 1,664 rows · contains duplicates, aggregates, nut/bale units, a drought year</div></div>
          <a class="btn sm" href="/api/sample/demo">${IC.dl} Download</a></div>
        <div class="check-row"><div><div class="t1">synthetic_minimal_farm.csv</div><div class="t2">Only Crop / Year / Area_ha / Production_q — tests automatic column mapping</div></div>
          <a class="btn sm" href="/api/sample/mini">${IC.dl} Download</a></div>
        </div>`, "Download one, then upload it above to see the full flow.")}
    </div></div>`;

  const drop = $("#drop"), fi = $("#fileIn");
  fi.onchange = () => fi.files[0] && uploadFile(fi.files[0]);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && uploadFile(e.dataTransfer.files[0]));
  $$("[data-load]").forEach((b) => b.onclick = () => loadBuiltin(b.dataset.load));
};

async function loadBuiltin(name) {
  view().innerHTML = `<div class="page">${loader(name === "gov" ? "Reading 575,879 records… (about 5–10 seconds)" : "Loading dataset…")}</div>`;
  try { setMeta(await api("/api/load", { name })); }
  catch (e) { toast(e.message, true); resetAll(); }
}
async function uploadFile(file) {
  view().innerHTML = `<div class="page">${loader(`Reading ${esc(file.name)}…`)}</div>`;
  const fd = new FormData(); fd.append("file", file);
  try { setMeta(await api("/api/upload", fd, true)); }
  catch (e) { toast(e.message, true); resetAll(); }
}
function setMeta(m) {
  S.meta = m; S.sid = m.sid; S.prep = null; S.colmap = { ...m.guess }; S.crops = null; invalidate();
  lockNav(true);
  $("#dataChip").classList.remove("hidden"); $("#dataChipText").textContent = `${m.name} · ${fmt(m.rows)} rows`;
  $("#newDataBtn").classList.remove("hidden");
  const ok = m.required.every((k) => S.colmap[k]);
  // all required columns detected -> go straight to analysis
  if (ok) prepare(true); else renderMapping();
}
function resetAll() {
  Object.assign(S, { sid: null, meta: null, prep: null, scope: null, crops: null, L: null, cache: {} });
  lockNav(true); $("#dataChip").classList.add("hidden"); $("#newDataBtn").classList.add("hidden");
  $("#scopebar").classList.add("hidden"); go("home");
}
function lockNav(lock) { $$(".nav-item").forEach((b) => { if (!["home", "method"].includes(b.dataset.page)) b.disabled = lock; }); }

function renderMapping() {
  const m = S.meta;
  const desc = { State_Name: "State / region", District_Name: "District / block", Crop_Year: "Year", Season: "Season",
    Crop: "Crop name", Area: "Area (hectares)", Production: "Production", Yield: "Yield (optional, recomputed)" };
  view().innerHTML = `<div class="page">
    ${pageHead("Step 1 · Load data", "Check how your columns were read",
      `We auto-detected the columns of <b>${esc(m.name)}</b> (${fmt(m.rows)} rows). Fix anything highlighted in red, then analyse.`,
      `<button class="btn primary lg" id="goPrep">Analyse data ${IC.arrow}</button>`)}
    ${S.prep ? callout("good", "This dataset is already analysed. Change the mapping and press <b>Analyse data</b> to re-run.") + "<div style='height:14px'></div>" : ""}
    ${card("Column mapping", `<div class="map-grid">${m.canonical.map((k) => {
        const req = m.required.includes(k), val = S.colmap[k] || "";
        return `<div class="map-item ${req && !val ? "missing" : ""}"><div class="mi-top"><b>${desc[k]}</b>
          ${req ? '<span class="badge bad">required</span>' : val ? '<span class="badge good">detected</span>' : '<span class="badge neutral">optional</span>'}</div>
          <select class="select" data-map="${k}"><option value="">— not in file —</option>${m.columns.map((c) =>
            `<option ${c === val ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>`; }).join("")}</div>`,
      "Which column of your file holds each piece of information.")}
    <div class="grid g2">
      ${card("Preview of your file", `<div id="pv"></div>`, "First rows exactly as uploaded.")}
      ${card("Cleaning rules", cleaningSwitches(), "Applied before any number is computed. All are recommended.")}
    </div></div>`;
  $$("[data-map]").forEach((s) => s.onchange = () => { S.colmap[s.dataset.map] = s.value; renderMapping(); });
  bindCleaning();
  table("#pv", m.columns.map((c) => ({ k: c, label: esc(c) })), m.preview);
  $("#goPrep").onclick = () => prepare(false);
}
function cleaningSwitches() {
  const items = [["drop_zero", "Drop rows with zero production", "Usually unreported values; would drag averages to zero."],
    ["merge_alias", "Merge crop-name spellings", "e.g. Paddy → Rice, Dry Ginger → Dry ginger."],
    ["drop_agg", "Drop aggregate rows", "Rows like 'Total foodgrain' are sums of other rows — would double count."],
    ["reconcile", "Fix stacked duplicate copies", "Detects the same record repeated with production ×100 and rescales it."]];
  return items.map(([k, a, b]) => `<div class="check-row"><div><div class="t1">${a}</div><div class="t2">${b}</div></div>
    <label class="switch"><input type="checkbox" data-clean="${k}" ${S.cleaning[k] ? "checked" : ""}><span></span></label></div>`).join("");
}
function bindCleaning(root = document) { $$("[data-clean]", root).forEach((c) => c.onchange = () => { S.cleaning[c.dataset.clean] = c.checked; }); }

async function prepare(auto) {
  const missing = S.meta.required.filter((k) => !S.colmap[k]);
  if (missing.length) { toast("Please map: " + missing.join(", "), true); return renderMapping(); }
  view().innerHTML = `<div class="page">${loader("Cleaning and checking the data…")}</div>`;
  try {
    const p = await api("/api/prepare", { sid: S.sid, colmap: S.colmap, cleaning: S.cleaning });
    S.prep = p; S.crops = null; invalidate();
    S.scope = { state: p.default.state, season: p.default.season, districts: [], years: p.default.years };
    buildScopeBar(); lockNav(false);
    if (auto) toast("Columns detected automatically — data cleaned and ready.");
    const target = S.autoPage && PAGES[S.autoPage] ? S.autoPage : "data";
    S.autoPage = null;
    go(target);
  } catch (e) { toast(e.message, true); renderMapping(); }
}

// ------------------------------------------------------------------ scope bar
function buildScopeBar() {
  const p = S.prep, sc = S.scope;
  const st = $("#selState"), se = $("#selSeason"), y0 = $("#selY0"), y1 = $("#selY1");
  st.innerHTML = p.states.map((s) => `<option ${s === sc.state ? "selected" : ""}>${esc(s)}</option>`).join("");
  const fillSeason = () => {
    const ss = p.hierarchy[sc.state].seasons;
    if (!ss.includes(sc.season)) sc.season = ss.includes("Kharif") ? "Kharif" : ss[0];
    se.innerHTML = ss.map((s) => `<option ${s === sc.season ? "selected" : ""}>${esc(s)}</option>`).join("");
  };
  fillSeason();
  const yrs = []; for (let y = p.kpis.year_min; y <= p.kpis.year_max; y++) yrs.push(y);
  const fillYears = () => {
    y0.innerHTML = yrs.map((y) => `<option ${y === sc.years[0] ? "selected" : ""}>${y}</option>`).join("");
    y1.innerHTML = yrs.map((y) => `<option ${y === sc.years[1] ? "selected" : ""}>${y}</option>`).join("");
  };
  fillYears();
  updateMSLabel();
  st.onchange = () => { sc.state = st.value; sc.districts = []; fillSeason(); updateMSLabel(); scopeChanged(); };
  se.onchange = () => { sc.season = se.value; scopeChanged(); };
  y0.onchange = () => { sc.years = [Math.min(+y0.value, sc.years[1]), sc.years[1]]; fillYears(); scopeChanged(); };
  y1.onchange = () => { sc.years = [sc.years[0], Math.max(+y1.value, sc.years[0])]; fillYears(); scopeChanged(); };
}
function scopeChanged() { S.crops = null; S.shockCrops = []; S.trendPick = null; invalidate(); rerender(); }

// districts multiselect
let msTemp = [];
function updateMSLabel() {
  const d = S.scope.districts;
  $("#msBtn").textContent = !d.length ? "All districts" : d.length === 1 ? title(d[0]) : `${d.length} districts selected`;
}
function openMS() {
  msTemp = [...S.scope.districts];
  $("#msPop").classList.remove("hidden"); $("#msSearch").value = ""; drawMS(); $("#msSearch").focus();
}
function closeMS() { $("#msPop").classList.add("hidden"); }
function drawMS() {
  const q = $("#msSearch").value.toLowerCase();
  const all = S.prep.hierarchy[S.scope.state].districts.filter((d) => d.toLowerCase().includes(q));
  $("#msList").innerHTML = all.map((d) => `<label class="ms-opt"><input type="checkbox" value="${esc(d)}" ${msTemp.includes(d) ? "checked" : ""}>${esc(title(d))}</label>`).join("")
    || '<div class="muted small" style="padding:8px">No match</div>';
  $$("#msList input").forEach((c) => c.onchange = () => { msTemp = c.checked ? [...msTemp, c.value] : msTemp.filter((x) => x !== c.value); });
}
$("#msBtn").onclick = (e) => { e.stopPropagation(); $("#msPop").classList.contains("hidden") ? openMS() : closeMS(); };
$("#msSearch").oninput = drawMS;
$("#msClear").onclick = () => { msTemp = []; drawMS(); };
$("#msApply").onclick = () => { S.scope.districts = msTemp; updateMSLabel(); closeMS(); scopeChanged(); };
$("#msPop").onclick = (e) => e.stopPropagation();
document.addEventListener("click", () => closeMS());

// ================================================================== PAGE: data quality
PAGES.data = function () {
  const p = S.prep, k = p.kpis;
  const removed = k.rows_raw - k.rows_clean;
  view().innerHTML = `<div class="page">
    ${pageHead("Step 2 · Data quality", "Your data, cleaned and checked",
      "Before any optimisation, every row is checked. Here is exactly what was found and what was done about it.",
      `<button class="btn" data-go="home">Edit column mapping</button>`)}
    <div class="grid g4">
      ${kpi("Usable records", fmt(k.rows_clean), `${fmt(k.rows_raw)} in the file · ${fmt(removed)} removed`, true)}
      ${kpi("States × districts", `${fmt(k.states)} × ${fmt(k.districts)}`, "geographic coverage")}
      ${kpi("Crops", fmt(k.crops), "distinct crop names after merging")}
      ${kpi("Years", `${k.year_min}–${k.year_max}`, `default analysis window ${p.default.years[0]}–${p.default.years[1]}`)}
    </div>
    ${p.stacked ? `<div style="margin-top:16px">${callout("warn", `<b>Hidden data problem found and fixed: ${term("stacked", "stacked duplicate copy")}.</b>
      ${fmt(p.stacked.pairs)} records appear twice — identical state, district, year, season, crop and area — but the second copy's
      production is ×${fmt(p.stacked.factor)} (in ${fmt(100 * p.stacked.share_with_factor, 1)}% of pairs). Rows from #${fmt(p.stacked.boundary_row)}
      onward were rescaled ÷${fmt(p.stacked.factor)} and the duplicates dropped, so every number is now in one unit.
      Without this, older years would count twice and yields would mix two scales.`, IC.tool)}</div>` : ""}
    <div class="grid g2" style="margin-top:16px">
      ${card("What we cleaned", `<ul class="steps">${p.cleaning.map((c) => {
          const hit = c.removed > 0 || /renamed|rescaled/.test(c.why) && !/^0 rows/.test(c.why);
          return `<li class="${hit ? "hit" : "ok"}"><span class="st-ic">${hit ? IC.tool : IC.check}</span>
          <div><div>${esc(c.step)}</div><div class="st-why">${esc(c.why)}</div></div>
          <span class="st-n">${c.removed ? "−" + fmt(c.removed) : "0"}</span></li>`; }).join("")}</ul>`,
        "Each rule, how many rows it removed, and why it matters.")}
      <div>
        ${card("Records per year", `<div id="chYear" class="chart"></div>`, "Gaps or spikes here reveal partial or duplicated years.")}
        ${card("Records per season", `<div id="chSeason" class="chart"></div>`)}
      </div>
    </div>
    ${card("Cleaned data preview", `<div id="tbPrev"></div>`, "First 200 cleaned rows. Yield = Production ÷ Area.")}
    ${card("Column profile of the original file", `<div id="tbProf"></div>`)}
    ${nextBar("data")}</div>`;
  const c = colors();
  plot("#chYear", [{ type: "bar", x: p.rows_per_year.x, y: p.rows_per_year.y, marker: { color: c.hist },
    hovertemplate: "%{x}: %{y:,} rows<extra></extra>" }], { yaxis: { title: "rows" } }, { height: 250 });
  const se = Object.entries(p.rows_per_season).sort((a, b) => b[1] - a[1]);
  plot("#chSeason", [{ type: "bar", x: se.map((d) => d[0]), y: se.map((d) => d[1]), marker: { color: c.hist },
    hovertemplate: "%{x}: %{y:,} rows<extra></extra>" }], {}, { height: 230 });
  table("#tbPrev", [{ k: "State_Name", label: "State" }, { k: "District_Name", label: "District", f: F.title }, { k: "Crop_Year", label: "Year" },
    { k: "Season", label: "Season" }, { k: "Crop", label: "Crop" }, { k: "Area", label: "Area (ha)", r: 1, f: F.int },
    { k: "Production", label: "Production", r: 1, f: (v) => fmt(v, 1) }, { k: "Yield", label: "Yield", r: 1, f: F.n3 }],
    p.preview, { search: true, limit: 12 });
  table("#tbProf", [{ k: "column", label: "Column" }, { k: "dtype", label: "Type" }, { k: "missing", label: "Missing", r: 1, f: F.int },
    { k: "unique", label: "Unique values", r: 1, f: F.int }], p.profile);
};

// ================================================================== PAGE: explore
PAGES.explore = () => guarded(async () => {
  view().innerHTML = `<div class="page">${pageHead("Step 3 · Explore", "What the data says", scopeText())}${loader()}</div>`;
  const d = await cached("/api/explore", ctx());
  if (S.page !== "explore") return;
  const trendCrops = Object.keys(d.trend);
  if (!S.trendPick) S.trendPick = d.trend_default;
  view().innerHTML = `<div class="page">
    ${pageHead("Step 3 · Explore", "What the data says", `Scope: <b>${esc(scopeText())}</b>. Only crops measured by weight are shown.`)}
    <div class="insights">${d.insights.map((t) => `<div class="insight"><span class="ic">${IC.bulb}</span><div>${esc(t)}</div></div>`).join("")}</div>
    <div class="grid g2" style="margin-top:16px">
      ${card("Top crops", `<div id="chTop" class="chart"></div>`, "Total over the selected years.",
        `<div class="seg" id="segTop"><button data-v="Area" class="${S.topBy === "Area" ? "on" : ""}">Area</button><button data-v="Production" class="${S.topBy === "Production" ? "on" : ""}">Production</button></div>`)}
      ${card("Yield trend over the years", `<div class="chips" id="trendChips" style="margin-bottom:8px">${trendCrops.map((c) =>
          `<button class="pick ${S.trendPick.includes(c) ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div><div id="chTrend" class="chart"></div>`,
        "Pick up to 3 crops. Yield = total production ÷ total area per year.")}
    </div>
    ${card("Data-consistency check: pooled yield per year", `${d.jumps.length ? callout("warn", `Year-on-year jumps above 40% at <b>${d.jumps.map((j) => `${j.year} (${pct(j.pct, 0)})`).join(", ")}</b>. Such jumps mean either an extreme weather year or a change in how data was reported — keep the averaging window on one side of them.`) + '<div style="height:10px"></div>' : ""}<div id="chPooled" class="chart"></div>`,
      "All years shown; the shaded band is the window used for averaging.")}
    <div class="grid g2">
      ${card("Districts: area vs production", `<div id="chDist" class="chart"></div>`, "Each bubble is a district (bubble size = yield). Log scales.")}
      ${card("Yield variability (risk)", `<div id="chCV" class="chart"></div>`, `${term("cv", "Coefficient of variation")} of yield — higher means less predictable.`)}
    </div>
    ${card("Yield map: district × crop", `<div id="chHeat" class="chart"></div>`, "Average yield of the 12 largest crops. Blank = not grown there.")}
    ${card("Best-yielding crop per district and season", `<div id="tbBest"></div>`, "Among weight-unit crops that occupy at least 1% of the district's season area.")}
    ${nextBar("explore")}</div>`;
  const c = colors();
  const drawTop = () => {
    const t = [...d.top_crops].sort((a, b) => a[S.topBy] - b[S.topBy]);
    plot("#chTop", [{ type: "bar", orientation: "h", y: t.map((r) => r.Crop), x: t.map((r) => r[S.topBy]), marker: { color: c.hist },
      customdata: t.map((r) => 100 * r.share), hovertemplate: `%{y}<br>${S.topBy}: %{x:,.0f}<br>Area share: %{customdata:.1f}%<extra></extra>` }],
    { margin: { l: 10, r: 16, t: 6, b: 40 }, xaxis: { title: S.topBy === "Area" ? "hectares" : "production" } }, { height: Math.max(300, 24 * t.length + 60) });
  };
  drawTop();
  $$("#segTop button").forEach((b) => b.onclick = () => { S.topBy = b.dataset.v; $$("#segTop button").forEach((x) => x.classList.toggle("on", x === b)); drawTop(); });
  const pal = [c.hist, c.opt, c.third];
  const drawTrend = () => {
    $$("#trendChips .pick").forEach((b) => {
      const i = S.trendPick.indexOf(b.dataset.c);
      b.classList.toggle("on", i >= 0); b.style.background = i >= 0 ? pal[i] : ""; });
    plot("#chTrend", S.trendPick.filter((k) => d.trend[k]).map((k, i) => ({ type: "scatter", mode: "lines+markers", name: k,
      x: d.trend[k].x, y: d.trend[k].y, line: { color: pal[i], width: 2 }, marker: { size: 6 },
      hovertemplate: `${k} %{x}: %{y:.3f}/ha<extra></extra>` })), { yaxis: { title: "yield per ha" } }, { height: 300 });
  };
  drawTrend();
  $$("#trendChips .pick").forEach((b) => b.onclick = () => {
    const k = b.dataset.c;
    if (S.trendPick.includes(k)) S.trendPick = S.trendPick.filter((x) => x !== k);
    else if (S.trendPick.length >= 3) { toast("Up to 3 crops at a time — deselect one first."); return; }
    else S.trendPick = [...S.trendPick, k];
    drawTrend();
  });
  plot("#chPooled", [{ type: "scatter", mode: "lines+markers", x: d.pooled.x, y: d.pooled.y, line: { color: c.hist, width: 2 },
    marker: { size: 6 }, hovertemplate: "%{x}: %{y:.3f}/ha<extra></extra>" }],
  { shapes: [{ type: "rect", xref: "x", yref: "paper", x0: S.scope.years[0] - 0.5, x1: S.scope.years[1] + 0.5, y0: 0, y1: 1,
    fillcolor: c.neutral, opacity: 0.12, line: { width: 0 } }], yaxis: { title: "pooled yield" } }, { height: 280 });
  plot("#chDist", [{ type: "scatter", mode: "markers", x: d.districts.map((r) => r.Area), y: d.districts.map((r) => r.Production),
    text: d.districts.map((r) => title(r.District_Name)), customdata: d.districts.map((r) => [r.Yield, r.crops]),
    marker: { color: c.hist, opacity: 0.75, line: { color: c.surface, width: 2 },
      size: d.districts.map((r) => r.Yield), sizemode: "area", sizeref: 2 * Math.max(...d.districts.map((r) => r.Yield || 0), 1) / 40 ** 2, sizemin: 5 },
    hovertemplate: "<b>%{text}</b><br>Area %{x:,.0f} ha<br>Production %{y:,.0f}<br>Yield %{customdata[0]:.3f}/ha · %{customdata[1]} crops<extra></extra>" }],
  { xaxis: { type: "log", title: "area (ha)" }, yaxis: { type: "log", title: "production" } }, { height: 330 });
  const cv = [...d.cv].reverse();
  plot("#chCV", [{ type: "bar", orientation: "h", y: cv.map((r) => r.Crop), x: cv.map((r) => r.cv), marker: { color: c.hist },
    hovertemplate: "%{y}: CV %{x:.2f}<extra></extra>" }], { margin: { l: 10, r: 16, t: 6, b: 40 }, xaxis: { title: "coefficient of variation" } },
  { height: Math.max(300, 20 * cv.length + 60) });
  if (d.heat.y.length) {
    plot("#chHeat", [{ type: "heatmap", x: d.heat.x, y: d.heat.y.map(title), z: d.heat.z, hoverongaps: false,
      colorscale: [[0, "#cde2fb"], [0.25, "#86b6ef"], [0.5, "#3987e5"], [0.75, "#1c5cab"], [1, "#0d366b"]],
      colorbar: { title: { text: "yield/ha", side: "right" }, thickness: 12 },
      hovertemplate: "%{y} · %{x}<br>yield %{z:.3f}/ha<extra></extra>" }],
    { margin: { l: 10, r: 10, t: 6, b: 90 }, xaxis: { tickangle: -35 } }, { height: Math.max(320, 22 * d.heat.y.length + 130) });
  }
  // pivot best crop
  const seasons = [...new Set(d.best.map((r) => r.Season))].sort();
  const byD = {}; d.best.forEach((r) => { (byD[r.District] ||= { District: r.District })[r.Season] = `${r.Crop} <span class="muted small">(${fmt(r.Yield, 2)})</span>`; });
  table("#tbBest", [{ k: "District", label: "District", f: F.title }, ...seasons.map((s) => ({ k: s, label: esc(s), f: (v) => v || '<span class="muted">–</span>' }))],
    Object.values(byD), { search: true, limit: 15 });
});

// ================================================================== PAGE: crops
PAGES.crops = () => guarded(async () => {
  view().innerHTML = `<div class="page">${pageHead("Step 4 · Crops & inputs", "Which crops go into the model", scopeText())}${loader()}</div>`;
  const d = await cached("/api/crops", ctx());
  if (S.page !== "crops") return;
  const sel = new Set(d.selected), inCoef = new Set(d.coef.map((r) => r.Crop));
  view().innerHTML = `<div class="page">
    ${pageHead("Step 4 · Crops & inputs", "Which crops go into the model",
      `Only crops measured in the same unit can be added up (${term("unit", "unit check")}). Crops in nuts or bales are switched off automatically — you can override any choice.`,
      `<div class="presets"><button class="btn sm" id="cRec">Recommended</button><button class="btn sm" id="cAll">Select all</button><button class="btn sm" id="cNone">Clear</button></div>`)}
    ${d.baseline ? `<div class="grid g4">
      ${kpi("Crops in the LP", fmt(d.coef.length), `${d.selected.length} selected · ${d.dropped.length} dropped for too few years`, true)}
      ${kpi(`Historical land (${term("L", "L")})`, fmtBig(d.baseline.L) + " ha", fmt(d.baseline.L) + " ha")}
      ${kpi(`Historical output (${term("D", "D")})`, fmtBig(d.baseline.D), fmt(d.baseline.D))}
      ${kpi("Feasible land range", `${fmtBig(d.feas.min_land)} – ${fmtBig(d.feas.max_land)}`, "Σ minimum areas – Σ maximum areas")}
    </div>` : callout("warn", "Fewer than 2 crops have enough data for an LP. Switch more crops on, or widen the year window / lower the minimum years in <b>Model settings</b>.")}
    ${card("Crop selection", `<div class="crop-list">${d.unit.map((u) => {
        const on = sel.has(u.Crop), dropped = on && !inCoef.has(u.Crop);
        const badge = u.status === "Exclude" ? `<span class="badge bad" title="${esc(u.reason)}">${esc(u.reason.split(":")[1] || "excluded").trim()}</span>`
          : dropped ? `<span class="badge warn">too few years</span>` : '<span class="badge good">weight unit</span>';
        return `<div class="crop-item ${on ? "" : "off"}"><label class="switch"><input type="checkbox" data-crop="${esc(u.Crop)}" ${on ? "checked" : ""}><span></span></label>
          <div class="grow"><div class="crop-top"><span class="crop-name">${esc(u.Crop)}</span>${badge}</div><div class="crop-meta">median yield ${fmt(u.median_yield, 3)} · ${fmt(u.records)} records</div></div></div>`; }).join("")}</div>`,
      `Each crop needs data in at least <b>${d.min_years}</b> of the selected years (change in Model settings).`)}
    <div class="grid g2">
      ${card("Unit check: median yield per crop", `<div id="chUnit" class="chart"></div>`, "Log scale. Crops on a very different scale are counted in another unit.")}
      ${card(`Yield coefficients ${term("yc", "y<sub>c</sub>")}`, `<div id="chCoef" class="chart"></div>`, "Average yield ± year-to-year standard deviation. The LP's 'value per hectare'.")}
    </div>
    ${card("LP input table", `<div id="tbCoef"></div>`, `${term("yc", "y<sub>c</sub>")} yield coefficient · ${term("bounds", "a<sub>c</sub> / m<sub>c</sub>")} minimum / maximum hectares · historical = average yearly hectares.`,
      `<button class="btn sm" id="dlCoef">${IC.dl} CSV</button>`)}
    ${nextBar("crops")}</div>`;
  $$("[data-crop]").forEach((c) => c.onchange = () => {
    const cur = new Set(S.crops ?? d.selected);
    c.checked ? cur.add(c.dataset.crop) : cur.delete(c.dataset.crop);
    S.crops = [...cur]; invalidate(); rerender();
  });
  $("#cRec").onclick = () => { S.crops = null; invalidate(); rerender(); };
  $("#cAll").onclick = () => { S.crops = d.unit.map((u) => u.Crop); invalidate(); rerender(); };
  $("#cNone").onclick = () => { S.crops = []; invalidate(); rerender(); };
  const c = colors();
  const u = [...d.unit].sort((a, b) => a.median_yield - b.median_yield);
  plot("#chUnit", ["Pool", "Exclude"].map((st) => {
    const r = u.filter((x) => x.status === st);
    return { type: "bar", orientation: "h", name: st === "Pool" ? "pooled (weight)" : "excluded", y: r.map((x) => x.Crop), x: r.map((x) => x.median_yield),
      marker: { color: st === "Pool" ? c.hist : c.opt }, customdata: r.map((x) => x.reason), hovertemplate: "%{y}: %{x:.3f}<br>%{customdata}<extra></extra>" };
  }), { xaxis: { type: "log", title: "median yield (log scale)", dtick: "D2" }, yaxis: { categoryorder: "array", categoryarray: u.map((x) => x.Crop) }, margin: { l: 10, r: 16, t: 30, b: 40 } },
  { height: Math.max(320, 20 * u.length + 80) });
  const cf = [...d.coef].sort((a, b) => a.y_c - b.y_c);
  plot("#chCoef", [{ type: "bar", orientation: "h", y: cf.map((x) => x.Crop), x: cf.map((x) => x.y_c), marker: { color: c.hist },
    error_x: { type: "data", array: cf.map((x) => x.yield_sd), color: c.neutral, thickness: 1.2, width: 3 },
    hovertemplate: "%{y}: %{x:.3f}/ha<extra></extra>" }], { margin: { l: 10, r: 16, t: 6, b: 40 }, xaxis: { title: "yield per hectare" } },
  { height: Math.max(320, 22 * cf.length + 60) });
  table("#tbCoef", [{ k: "Crop", label: "Crop" }, { k: "y_c", label: "y<sub>c</sub>", r: 1, f: F.n3 }, { k: "yield_sd", label: "s.d.", r: 1, f: F.n3 },
    { k: "lp_lo", label: "a<sub>c</sub> (min ha)", r: 1, f: F.int }, { k: "lp_hi", label: "m<sub>c</sub> (max ha)", r: 1, f: F.int },
    { k: "hist_area", label: "historical ha", r: 1, f: F.int }, { k: "years", label: "years", r: 1 }], d.coef);
  $("#dlCoef").onclick = () => downloadCSV(d.coef, "lp_coefficients.csv");
});

// ------------------------------------------------------------------ shared LP visuals
function allocChart(el, alloc, labelOpt = "LP plan") {
  const c = colors();
  const a = [...alloc].sort((x, y) => x.hist_area - y.hist_area);
  plot(el, [
    { type: "bar", orientation: "h", name: "Historical (average)", y: a.map((r) => r.Crop), x: a.map((r) => r.hist_area), marker: { color: c.hist },
      hovertemplate: "%{y}<br>historical %{x:,.0f} ha<extra></extra>" },
    { type: "bar", orientation: "h", name: labelOpt, y: a.map((r) => r.Crop), x: a.map((r) => r.x_opt), marker: { color: c.opt },
      customdata: a.map((r) => [r.change_ha, r["change_%"]]),
      hovertemplate: "%{y}<br>plan %{x:,.0f} ha<br>change %{customdata[0]:+,.0f} ha (%{customdata[1]:+.1f}%)<extra></extra>" },
    { type: "scatter", mode: "markers", name: "Upper bound", y: a.map((r) => r.Crop), x: a.map((r) => r.m_c),
      marker: { symbol: "line-ns-open", size: 16, color: c.neutral, line: { width: 2 } }, hovertemplate: "%{y}<br>max %{x:,.0f} ha<extra></extra>" },
  ], { barmode: "group", bargap: 0.28, bargroupgap: 0.06, xaxis: { title: "hectares" },
    margin: { l: 10, r: 16, t: ($(el)?.clientWidth || 800) < 560 ? 76 : 34, b: 44 }, legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0 } },
  { height: Math.max(360, 34 * a.length + 100), filename: "allocation" });
}
function allocTable(el, alloc) {
  table(el, [{ k: "Crop", label: "Crop" }, { k: "y_c", label: "Yield", r: 1, f: F.n3 },
    { k: "hist_area", label: "Historical ha", r: 1, f: F.int }, { k: "x_opt", label: "Plan ha", r: 1, f: F.int },
    { k: "change_ha", label: "Change ha", r: 1, f: F.signed }, { k: "change_%", label: "Change", r: 1, f: F.pct },
    { k: "a_c", label: "Min ha", r: 1, f: F.int }, { k: "m_c", label: "Max ha", r: 1, f: F.int },
    { k: "reduced_cost", label: term("reduced", "Reduced cost"), r: 1, f: F.n4 }, { k: "bound_status", label: "Status", f: F.status }], alloc);
}
function lpDetails(r) {
  const rel = r.objective && r.scipy_objective != null ? Math.abs(r.objective - r.scipy_objective) / Math.abs(r.objective) : null;
  return `<details class="box"><summary>Show the exact LP model that was solved</summary><pre>${esc(r.lp_text)}</pre></details>
    <details class="box"><summary>Solver cross-check (PuLP-CBC vs SciPy-HiGHS)</summary>
      <div class="grid g3" style="margin-bottom:14px">
        ${kpi("PuLP-CBC objective", fmt(r.objective, 2))}${kpi("SciPy-HiGHS objective", fmt(r.scipy_objective, 2))}
        ${kpi("Relative difference", rel == null ? "–" : rel.toExponential(1), rel != null && rel < 1e-6 ? "✔ both solvers agree" : "")}
      </div><p class="small muted">Dual value — PuLP: ${fmt(r.shadow, 6)} · SciPy: ${fmt(r.scipy_shadow, 6)}</p></details>`;
}

// ================================================================== PAGE: maximise
PAGES.max = () => guarded(async () => {
  const head = pageHead("Step 5 · Optimise", "Maximise output on a fixed land budget",
    `Given ${term("L", "L hectares")}, how should they be split among crops to produce the most? Scope: <b>${esc(scopeText())}</b>.`);
  if (!view().querySelector("#maxBody")) view().innerHTML = `<div class="page">${head}<div id="maxBody">${loader()}</div></div>`;
  const d = await cached("/api/optimize/max", { ...ctx(), L: S.L });
  if (S.page !== "max") return;
  const r = d.result, ok = r.status === "Optimal";
  if (S.L == null) S.L = d.L;
  const lo = Math.floor(d.feas.min_land * 0.9), hi = Math.ceil(Math.max(d.feas.max_land * 1.1, d.L_hist * 1.3));
  const step = Math.max(1, Math.round((hi - lo) / 400));
  view().innerHTML = `<div class="page">${head}<div id="maxBody">
    ${card("Land budget", `<div class="control-row"><div class="slider-wrap">
        <div class="slider-top"><span class="muted">Hectares available</span><span class="big" id="lVal">${fmt(S.L)} ha</span></div>
        <input type="range" id="lSlider" min="${lo}" max="${hi}" step="${step}" value="${S.L}">
        <div class="range-ends"><span>${fmtBig(lo)}</span><span>historical ${fmtBig(d.L_hist)}</span><span>${fmtBig(hi)}</span></div></div>
        <div class="field"><label>Exact value</label><input class="input num" id="lInput" type="number" value="${Math.round(S.L)}" style="width:150px"></div>
        <div class="presets">${[-20, -10, 0, 10, 20].map((p) => `<button class="btn sm" data-lp="${p}">${p === 0 ? "Historical" : (p > 0 ? "+" : "") + p + "%"}</button>`).join("")}</div></div>
      <p class="small muted" style="margin:10px 0 0">Feasible from ${fmt(d.feas.min_land)} ha (every crop at its minimum). Land beyond ${fmt(d.feas.max_land)} ha cannot be used (every crop at its maximum).</p>`)}
    ${ok ? `<div class="grid g4">
      ${kpi("Output gain vs history", pct(d.gain_pct, 2), `from the same ${fmtBig(S.L)} ha`, true)}
      ${kpi("Optimal output Z*", fmtBig(r.objective), fmt(r.objective))}
      ${kpi("Historical output", fmtBig(d.D_hist), fmt(d.D_hist))}
      ${kpi(`${term("shadow", "Shadow price λ*")}`, fmt(r.shadow, 3), "extra output per extra hectare")}
    </div>
    <div class="grid g2w">
      ${card("Recommended re-allocation", `<div id="chAlloc"></div>`, "Blue = what was planted on average · orange = the LP plan · tick = the crop's maximum.")}
      <div>
        ${card("What this means", `<ul class="story">${d.explain.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`)}
        ${card("Change per crop", `<div id="chChange"></div>`)}
      </div>
    </div>
    ${card("Full solution", `<div id="tbAlloc"></div>`, `${term("basic", "Marginal crop")} = the one between its bounds; its yield equals λ*.`,
      `<button class="btn sm" id="dlAlloc">${IC.dl} Download plan</button>`)}
    ${lpDetails(r)}` : callout("bad", `<b>No feasible plan.</b> ${esc(d.explain[0])}`)}
    ${nextBar("max")}</div></div>`;
  const sl = $("#lSlider"), li = $("#lInput");
  const apply = (v) => { S.L = Math.max(0, +v); PAGES.max(); };
  sl.oninput = () => { $("#lVal").textContent = fmt(+sl.value) + " ha"; li.value = sl.value; };
  sl.onchange = () => apply(sl.value);
  li.onchange = () => apply(li.value);
  $$("[data-lp]").forEach((b) => b.onclick = () => apply(d.L_hist * (1 + b.dataset.lp / 100)));
  if (!ok) return;
  allocChart("#chAlloc", r.alloc);
  const a = [...r.alloc].sort((x, y) => x.change_ha - y.change_ha), c = colors();
  plot("#chChange", [{ type: "bar", orientation: "h", y: a.map((x) => x.Crop), x: a.map((x) => x.change_ha), marker: { color: c.opt },
    hovertemplate: "%{y}: %{x:+,.0f} ha<extra></extra>" }],
  { margin: { l: 10, r: 16, t: 6, b: 40 }, xaxis: { title: "hectares (plan − historical)", zeroline: true, zerolinecolor: c.neutral } },
  { height: Math.max(280, 22 * a.length + 60) });
  allocTable("#tbAlloc", r.alloc);
  $("#dlAlloc").onclick = () => downloadCSV(r.alloc, "max_output_plan.csv");
});

// ================================================================== PAGE: minimise
PAGES.min = () => guarded(async () => {
  const head = pageHead("Step 6 · Optimise", "Minimise land for a production target",
    `What is the smallest area that still delivers ${term("D", "the target D")}? Scope: <b>${esc(scopeText())}</b>.`);
  if (!view().querySelector("#minBody")) view().innerHTML = `<div class="page">${head}<div id="minBody">${loader()}</div></div>`;
  const d = await cached("/api/optimize/min", { ...ctx(), target_pct: S.target });
  if (S.page !== "min") return;
  const r = d.result, ok = r.status === "Optimal";
  view().innerHTML = `<div class="page">${head}<div id="minBody">
    ${card("Production target", `<div class="control-row"><div class="slider-wrap">
        <div class="slider-top"><span class="muted">Target as % of historical output</span><span class="big" id="tVal">${S.target}% · ${fmtBig(d.D)}</span></div>
        <input type="range" id="tSlider" min="50" max="150" step="1" value="${S.target}">
        <div class="range-ends"><span>50%</span><span>100% = historical</span><span>150%</span></div></div>
        <div class="presets">${[80, 90, 100, 110, 120].map((p) => `<button class="btn sm ${p === S.target ? "primary" : ""}" data-tp="${p}">${p}%</button>`).join("")}</div></div>
      <p class="small muted" style="margin:10px 0 0">Achievable output ranges from ${fmt(d.feas.min_output)} to ${fmt(d.feas.max_output)}.</p>`)}
    ${ok ? `<div class="grid g4">
      ${kpi("Land saved", fmtBig(d.saving_ha) + " ha", `${pct(-d.saving_pct, 2)} vs historical land`, true)}
      ${kpi("Minimum land needed", fmtBig(r.objective) + " ha", fmt(r.objective) + " ha")}
      ${kpi("Historical land", fmtBig(d.L_hist) + " ha", fmt(d.L_hist) + " ha")}
      ${kpi(`${term("mu", "Shadow price μ*")}`, fmt(r.shadow, 5), "extra ha per extra unit of target")}
    </div>
    <div class="grid g2w">
      ${card("Least-land plan", `<div id="chAlloc2"></div>`, "Blue = historical average · orange = least-land plan.")}
      <div>
        ${card("What this means", `<ul class="story">${d.explain.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`)}
        ${d.duality && d.duality.inv_lam ? card("Check: the two models agree (duality)", `<p>Solving <b>Maximise output</b> with exactly <b>${fmt(d.duality.L)} ha</b> gives back
          Z* = ${fmt(d.duality.Z)} (the target) with λ* = ${fmt(d.duality.lam, 4)}.</p>
          <div class="grid g2">${kpi("1 / λ*", fmt(d.duality.inv_lam, 6))}${kpi("μ*", fmt(d.duality.mu, 6))}</div>
          <p class="small muted" style="margin-top:10px">Equal, as LP duality predicts: both models describe the same efficient frontier from opposite directions.</p>`) : ""}
      </div>
    </div>
    ${card("Full solution", `<div id="tbAlloc2"></div>`, "", `<button class="btn sm" id="dlAlloc2">${IC.dl} Download plan</button>`)}
    ${lpDetails(r)}` : callout("bad", `<b>Target not reachable.</b> ${esc(d.explain[0])}`)}
    ${nextBar("min")}</div></div>`;
  const sl = $("#tSlider");
  sl.oninput = () => { $("#tVal").textContent = `${sl.value}% · ${fmtBig(d.D_hist * sl.value / 100)}`; };
  sl.onchange = () => { S.target = +sl.value; PAGES.min(); };
  $$("[data-tp]").forEach((b) => b.onclick = () => { S.target = +b.dataset.tp; PAGES.min(); });
  if (!ok) return;
  allocChart("#chAlloc2", r.alloc, "Least-land plan");
  allocTable("#tbAlloc2", r.alloc);
  $("#dlAlloc2").onclick = () => downloadCSV(r.alloc, "min_land_plan.csv");
});

// ================================================================== PAGE: what-if
PAGES.whatif = () => guarded(async () => {
  const head = pageHead("Step 7 · What-if analysis", "How robust is the plan?",
    `Sensitivity analysis on the current crops and scope (<b>${esc(scopeText())}</b>).`);
  if (!view().querySelector("#wiBody")) view().innerHTML = `<div class="page">${head}<div id="wiBody">${loader("Solving ~150 linear programmes…")}</div></div>`;
  const d = await cached("/api/sensitivity", { ...ctx(), shock: S.shock, shock_crops: S.shockCrops });
  if (S.page !== "whatif") return;
  const crops = d.ranging.map((r) => r.Crop);
  const sh = d.shock;
  view().innerHTML = `<div class="page">${head}<div id="wiBody">
    <div class="grid g2">
      ${card("If we had more (or less) land…", `<div id="chZL"></div>`, "Optimal output for every land budget. Flattening = diminishing returns.")}
      ${card(`…what is one more hectare worth? (${term("shadow", "λ*")})`, `<div id="chLam"></div>`, "Each step down is the moment another crop reaches its maximum area.")}
    </div>
    ${card("Weather / yield shock", `<div class="control-row" style="margin-bottom:14px"><div class="slider-wrap" style="max-width:360px">
        <div class="slider-top"><span class="muted">Change in yield</span><span class="big" id="shVal">${pct(S.shock, 0)}</span></div>
        <input type="range" id="shSlider" min="-40" max="40" step="5" value="${S.shock}"><div class="range-ends"><span>−40%</span><span>0</span><span>+40%</span></div></div>
        <div style="flex:2;min-width:260px"><div class="field-label" style="margin-bottom:6px">Crops affected (none selected = all crops)</div>
        <div class="chips">${crops.map((c) => `<button class="pick ${S.shockCrops.includes(c) ? "on" : ""}" data-sc="${esc(c)}">${esc(c)}</button>`).join("")}</div></div></div>
      <div class="grid g3">${kpi("Output before shock", fmtBig(sh.base))}${kpi("Output after shock", fmtBig(sh.shocked), sh.change_pct == null ? "" : delta(sh.change_pct, false, 2))}
        ${kpi("Land moved by the LP", fmtBig(sh.moved_ha) + " ha", sh.moved_ha > 1 ? "the best crop mix changes" : "same crop mix — the plan is robust")}</div>
      ${sh.moved_ha > 1 ? `<div id="chShock" style="margin-top:12px"></div>` : `<div style="margin-top:12px">${callout("good", "The optimal crop mix does not change under this shock — only the total output scales. The plan is <b>robust</b>.")}</div>`}`,
      "Simulate a bad (or good) season. Does the best plan change, or only the total?")}
    <div class="grid g2">
      ${card("How much flexibility does the gain need?", `<div id="chBand"></div>`, "Gain when each crop may move only ±p% from its historical area — a realistic re-planning range.")}
      ${card("Land needed vs production target", `<div id="chDL"></div>`, "Minimum land for every target level (Optimization 2).")}
    </div>
    ${card(`${term("ranging", "Yield ranging")} — how much can each yield change before the plan changes?`, `<div id="tbRange"></div>`,
      `At historical land, λ* = ${fmt(d.lam, 4)}. Expanded crops stay expanded while their yield stays above it; minimum crops stay at minimum while below it.`)}
    ${nextBar("whatif")}</div></div>`;
  const c = colors();
  const land = d.land.filter((r) => r.Z != null);
  plot("#chZL", [{ type: "scatter", mode: "lines", x: land.map((r) => r.L), y: land.map((r) => r.Z), line: { color: c.hist, width: 2.5 },
    hovertemplate: "L %{x:,.0f} ha<br>Z* %{y:,.0f}<extra></extra>" }],
  { shapes: [vline(d.L_hist, c)], annotations: [vlab(d.L_hist, "historical L", c)], xaxis: { title: "land budget (ha)" }, yaxis: { title: "optimal output" } }, { height: 300 });
  plot("#chLam", [{ type: "scatter", mode: "lines", line: { shape: "hv", color: c.opt, width: 2.5 }, x: land.map((r) => r.L), y: land.map((r) => r.shadow_price),
    hovertemplate: "L %{x:,.0f} ha<br>λ* %{y:.3f}<extra></extra>" }],
  { shapes: [vline(d.L_hist, c)], xaxis: { title: "land budget (ha)" }, yaxis: { title: "λ* (output per extra ha)" } }, { height: 300 });
  const tg = d.target.filter((r) => r.Land != null);
  plot("#chDL", [{ type: "scatter", mode: "lines", x: tg.map((r) => r.D), y: tg.map((r) => r.Land), line: { color: c.hist, width: 2.5 },
    hovertemplate: "target %{x:,.0f}<br>land %{y:,.0f} ha<extra></extra>" }],
  { shapes: [vline(d.D_hist, c)], annotations: [vlab(d.D_hist, "historical output", c)], xaxis: { title: "production target" }, yaxis: { title: "minimum land (ha)" } }, { height: 300 });
  plot("#chBand", [
    { type: "scatter", mode: "lines+markers", name: "Output gain (Opt 1)", x: d.band.map((r) => r.band_pct), y: d.band.map((r) => r.output_gain_pct), line: { color: c.hist, width: 2.5 }, marker: { size: 8 } },
    { type: "scatter", mode: "lines+markers", name: "Land saving (Opt 2)", x: d.band.map((r) => r.band_pct), y: d.band.map((r) => r.land_saving_pct), line: { color: c.opt, width: 2.5 }, marker: { size: 8, symbol: "square" } },
  ], { xaxis: { title: "allowed change per crop (±%)" }, yaxis: { title: "%" }, hovermode: "x unified", margin: { l: 60, r: 16, t: 34, b: 44 } }, { height: 300 });
  if (sh.moved_ha > 1) {
    const a = sh.alloc.filter((x) => Math.abs(x.x_opt_shock - x.x_opt_base) > 1);
    plot("#chShock", [
      { type: "bar", name: "Plan before shock", x: a.map((x) => x.Crop), y: a.map((x) => x.x_opt_base), marker: { color: c.hist } },
      { type: "bar", name: "Plan after shock", x: a.map((x) => x.Crop), y: a.map((x) => x.x_opt_shock), marker: { color: c.opt } },
    ], { barmode: "group", yaxis: { title: "hectares" }, margin: { l: 60, r: 16, t: 34, b: 60 } }, { height: 280 });
  }
  table("#tbRange", [{ k: "Crop", label: "Crop" }, { k: "y_c", label: "Yield now", r: 1, f: F.n3 }, { k: "status", label: "Status", f: F.status },
    { k: "allowable_min_yield", label: "Plan holds if yield ≥", r: 1, f: F.n3 }, { k: "allowable_max_yield", label: "…and ≤", r: 1, f: (v) => v == null ? "no limit" : fmt(v, 3) },
    { k: "allowable_decrease", label: "Can fall by", r: 1, f: F.n3 }, { k: "allowable_increase", label: "Can rise by", r: 1, f: (v) => v == null ? "no limit" : fmt(v, 3) }], d.ranging);
  const sl = $("#shSlider");
  sl.oninput = () => { $("#shVal").textContent = pct(+sl.value, 0); };
  sl.onchange = () => { S.shock = +sl.value; PAGES.whatif(); };
  $$("[data-sc]").forEach((b) => b.onclick = () => {
    const k = b.dataset.sc; S.shockCrops = S.shockCrops.includes(k) ? S.shockCrops.filter((x) => x !== k) : [...S.shockCrops, k]; PAGES.whatif(); });
});
const vline = (x, c) => ({ type: "line", xref: "x", yref: "paper", x0: x, x1: x, y0: 0, y1: 1, line: { color: c.neutral, dash: "dot", width: 1.5 } });
const vlab = (x, t, c) => ({ x, y: 1, xref: "x", yref: "paper", text: t, showarrow: false, xanchor: "left", yanchor: "top", font: { size: 11, color: c.neutral } });

// ================================================================== PAGE: districts
PAGES.districts = () => guarded(async () => {
  view().innerHTML = `<div class="page">${pageHead("Step 8 · Compare districts", "Where does re-planning pay off most?", scopeText())}${loader("Solving both models for every district…")}</div>`;
  const d = await cached("/api/districts", ctx());
  if (S.page !== "districts") return;
  const head = pageHead("Step 8 · Compare districts", "Where does re-planning pay off most?",
    `Both models solved separately for every district of <b>${esc(S.scope.state)}</b> (${esc(S.scope.season)}, ${S.scope.years[0]}–${S.scope.years[1]}), each with its own yields, bounds and historical land.`);
  if (!d.rows.length) { view().innerHTML = `<div class="page">${head}<div class="empty"><div class="e-ic">${IC.info}</div>Not enough districts with 2+ crops in this scope.</div></div>`; return; }
  const s = d.summary;
  view().innerHTML = `<div class="page">${head}
    <div class="grid g4">
      ${kpi("Median output gain", pct(s.median_gain, 1), `across ${s.n} districts`, true)}
      ${kpi("Median land saving", fmt(s.median_saving, 1) + "%", "less land for the same output")}
      ${kpi("Most potential", esc(title(s.best)), "highest output gain")}
      ${kpi("Least potential", esc(title(s.worst)), "already close to optimal")}
    </div>
    ${card("Potential improvement by district", `<div id="chMD"></div>`, "Blue = extra output on the same land · orange = land that could be saved for the same output.")}
    <div class="grid g2">
      ${card("Does crop diversity matter?", `<div id="chMD2"></div>`, "Districts growing more crops give the LP more room to improve.")}
      ${card("Which crop would be expanded most?", `<div id="chMD3"></div>`, "Count of districts where each crop receives the largest increase.")}
    </div>
    ${card("All districts", `<div id="tbMD"></div>`, "", `<button class="btn sm" id="dlMD">${IC.dl} CSV</button>`)}
    ${nextBar("districts")}</div>`;
  const c = colors(), r = [...d.rows].sort((a, b) => a.output_gain_pct - b.output_gain_pct);
  plot("#chMD", [
    { type: "bar", orientation: "h", name: "Output gain %", y: r.map((x) => title(x.District)), x: r.map((x) => x.output_gain_pct), marker: { color: c.hist } },
    { type: "bar", orientation: "h", name: "Land saving %", y: r.map((x) => title(x.District)), x: r.map((x) => x.land_saving_pct), marker: { color: c.opt } },
  ], { barmode: "group", bargap: 0.25, margin: { l: 10, r: 16, t: 34, b: 44 }, xaxis: { title: "%" } }, { height: Math.max(380, 30 * r.length + 100) });
  plot("#chMD2", [{ type: "scatter", mode: "markers", x: d.rows.map((x) => x.crops), y: d.rows.map((x) => x.output_gain_pct), text: d.rows.map((x) => title(x.District)),
    marker: { size: 11, color: c.hist, opacity: 0.8, line: { color: c.surface, width: 2 } }, hovertemplate: "<b>%{text}</b><br>%{x} crops · gain %{y:.1f}%<extra></extra>" }],
  { xaxis: { title: "number of crops grown", dtick: 1 }, yaxis: { title: "output gain %" } }, { height: 300 });
  const cnt = {}; d.rows.forEach((x) => { cnt[x.biggest_expansion] = (cnt[x.biggest_expansion] || 0) + 1; });
  const ce = Object.entries(cnt).sort((a, b) => a[1] - b[1]);
  plot("#chMD3", [{ type: "bar", orientation: "h", y: ce.map((x) => x[0]), x: ce.map((x) => x[1]), marker: { color: c.hist },
    hovertemplate: "%{y}: %{x} districts<extra></extra>" }], { margin: { l: 10, r: 16, t: 6, b: 40 }, xaxis: { title: "districts", dtick: 2 } }, { height: 300 });
  table("#tbMD", [{ k: "District", label: "District", f: F.title }, { k: "crops", label: "Crops", r: 1 }, { k: "land_L", label: "Land (ha)", r: 1, f: F.int },
    { k: "output_gain_pct", label: "Output gain", r: 1, f: F.pct }, { k: "land_saving_pct", label: "Land saving", r: 1, f: (v) => pct(v, 1, false) },
    { k: "land_shadow_price", label: "λ*", r: 1, f: F.n3 }, { k: "best_yield_crop", label: "Best-yield crop" }, { k: "biggest_expansion", label: "Expand most" }],
  d.rows, { search: true });
  $("#dlMD").onclick = () => downloadCSV(d.rows, "district_comparison.csv");
});

// ================================================================== PAGE: method
PAGES.method = function () {
  const x = (c) => `x<sub>${c}</sub>`;
  view().innerHTML = `<div class="page">
    ${pageHead("Reference", "How it works", "The model behind every number, in brief. Based on the project's Review-I formulation.")}
    ${card("The question", `<p style="font-size:15px">Land is fixed and crops differ sharply in yield. <b>Using actual historical yield records, how should land be re-allocated across crops to get the most out of a fixed area?</b></p>
      <div class="flow">${["Load data", "Clean & fix quirks", "Unit check", "Average yields", "Build LP", "Solve (CBC + HiGHS)", "Compare with history", "Sensitivity & districts"]
        .map((s, i, a) => `<span class="fstep">${s}</span>${i < a.length - 1 ? '<span class="farr">→</span>' : ""}`).join("")}</div>`)}
    <div class="grid g2">
      ${card("Optimization 1 — maximise output", `<div class="math">maximise &nbsp; Z = <span class="op">∑</span><sub>c</sub> y<sub>c</sub> ${x("c")}<br>
        subject to &nbsp; <span class="op">∑</span><sub>c</sub> ${x("c")} ≤ L &nbsp;&nbsp;<span class="muted small">(land)</span><br>
        &emsp;&emsp;&emsp;&emsp;&ensp; a<sub>c</sub> ≤ ${x("c")} ≤ m<sub>c</sub>, &nbsp; ${x("c")} ≥ 0</div>`, "Best use of a fixed land budget.")}
      ${card("Optimization 2 — minimise land", `<div class="math">minimise &nbsp; <span class="op">∑</span><sub>c</sub> ${x("c")}<br>
        subject to &nbsp; <span class="op">∑</span><sub>c</sub> y<sub>c</sub> ${x("c")} ≥ D &nbsp;&nbsp;<span class="muted small">(target)</span><br>
        &emsp;&emsp;&emsp;&emsp;&ensp; a<sub>c</sub> ≤ ${x("c")} ≤ m<sub>c</sub>, &nbsp; ${x("c")} ≥ 0</div>`, "Least land that still meets a production target.")}
    </div>
    ${card("Symbols", `<div class="table-wrap"><table class="t"><thead><tr><th>Symbol</th><th>Meaning</th><th>Taken from the data as</th></tr></thead><tbody>
      <tr><td>${x("c")}</td><td>hectares given to crop c (the decision)</td><td>—</td></tr>
      <tr><td>y<sub>c</sub></td><td>yield coefficient</td><td>mean of yearly (Σ production ÷ Σ area)</td></tr>
      <tr><td>a<sub>c</sub>, m<sub>c</sub></td><td>minimum / maximum hectares</td><td>smallest / largest yearly area in the window</td></tr>
      <tr><td>L</td><td>land budget</td><td>average yearly total area of the selected crops</td></tr>
      <tr><td>D</td><td>production target</td><td>Σ y<sub>c</sub> × average area (historical output)</td></tr>
      <tr><td>λ*, μ*</td><td>shadow prices of land and of the target</td><td>dual values reported by the solver; μ* = 1/λ*</td></tr></tbody></table></div>`)}
    ${card("Why the answer has this shape", `<p>With one shared constraint and simple bounds, the LP is a <b>continuous knapsack</b>: every crop first gets its minimum,
      then the remaining land is filled from the highest-yield crop downward, each up to its maximum. The crop where land runs out is the single
      ${term("basic", "marginal crop")}; its yield <i>is</i> the ${term("shadow", "shadow price")}. That is why the output-vs-land curve is concave and the shadow price falls in steps.</p>`)}
    <div class="grid g2">
      ${card("Assumptions & limitations", `<ul class="story">
        <li><b>Units must match</b> — crops counted in nuts or bales are excluded from the pooled total.</li>
        <li><b>Historical averages</b> — weather is not in the base model (see What-if → yield shock).</li>
        <li><b>Output, not profit</b> — the dataset has no price or cost fields, so none are invented.</li>
        <li><b>Weight favours heavy crops</b> — a tonne of onion counts like a tonne of pulses.</li>
        <li><b>Bounds drive the result</b> — wide historical bounds give optimistic gains; ±10% bands give realistic ones.</li>
        <li><b>Not modelled</b> — soil, irrigation, labour, rotation, prices, food security.</li></ul>`)}
      ${card("Glossary", `<dl class="gloss">${Object.values(GLOSS).map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("")}</dl>`)}
    </div>
    ${card("References", `<ol class="small" style="margin:0;padding-left:18px;color:var(--text-2)">
      <li>H. A. Taha, <i>Operations Research: An Introduction</i>, 10th ed., Pearson, 2017.</li>
      <li>S. Wankhade & H. Lunge, LP technique for optimum resource allocation in agricultural production, Akola district, 2012.</li>
      <li>F. Majeke et al., Linear programming approach — application in agriculture, 2020.</li>
      <li>S. Supriya et al., Optimal crop plans using LP in Jayashankar Bhupalpally district, Telangana, 2022.</li>
      <li>K. K. Paidipati & S. R. Padi, Optimal programming problems for crop planning and agricultural resource management, 2017.</li>
      <li>X. Liang, LP approach in agricultural production-land allocation, Springer, 2023.</li>
      <li>MoA&FW, Govt. of India, District-wise Season-wise Crop Production Statistics (1997–2020-21), data.gov.in.</li></ol>`)}
  </div>`;
};

// ================================================================== settings drawer
function openSettings() {
  const st = S.settings, n = S.scope ? S.scope.years[1] - S.scope.years[0] + 1 : 10;
  const tmp = { ...st }, tmpClean = { ...S.cleaning };
  $("#overlay").innerHTML = `<div class="scrim" id="scrim"></div><aside class="drawer" role="dialog" aria-label="Model settings">
    <div class="drawer-head"><h2>Model settings</h2><button class="icon-btn" id="dClose" aria-label="Close">${IC.x}</button></div>
    <div class="drawer-body">
      <h4>Yield coefficient y<sub>c</sub></h4>
      ${[["mean", "Mean of yearly yields", "As in the project formulation (default)"], ["median", "Median of yearly yields", "Robust to one-off bad or good years"],
        ["weighted", "Area-weighted", "Σ production ÷ Σ area over all years"]].map(([v, a, b]) =>
        `<label class="radio-card"><input type="radio" name="ym" value="${v}" ${tmp.yield_method === v ? "checked" : ""}><span>${a}<small>${b}</small></span></label>`).join("")}
      <h4>Crop bounds a<sub>c</sub> ≤ x<sub>c</sub> ≤ m<sub>c</sub></h4>
      ${[["historical", "Historical min / max area", "Each crop stays within the range it actually had (default)"],
        ["band", "± band around the average", "More conservative: each crop moves at most ±p%"]].map(([v, a, b]) =>
        `<label class="radio-card"><input type="radio" name="bm" value="${v}" ${tmp.bound_mode === v ? "checked" : ""}><span>${a}<small>${b}</small></span></label>`).join("")}
      <div id="bandBox" class="${tmp.bound_mode === "band" ? "" : "hidden"}"><div class="slider-top"><span class="muted">Band</span><b id="bandVal">±${tmp.band_pct}%</b></div>
        <input type="range" id="bandSl" min="5" max="100" step="5" value="${tmp.band_pct}"></div>
      <h4>Data requirements</h4>
      <div class="field" style="margin-bottom:10px"><label>Minimum years of data per crop</label>
        <input class="input" type="number" id="minY" min="1" max="${n}" placeholder="auto (${Math.max(1, Math.round(0.67 * n))} = ⅔ of ${n} years)" value="${tmp.min_years ?? ""}"></div>
      <div class="field"><label>Unit-check scale threshold (× pool median)</label><input class="input" type="number" id="thr" min="10" step="10" value="${tmp.ratio_thr}"></div>
      <h4>Cleaning rules</h4>
      <div id="dClean">${cleaningSwitches()}</div>
    </div>
    <div class="drawer-foot"><button class="btn ghost" id="dReset">Reset defaults</button><button class="btn primary" id="dApply">Apply</button></div></aside>`;
  const close = () => { $("#overlay").innerHTML = ""; };
  $("#scrim").onclick = close; $("#dClose").onclick = close;
  $$("[name=ym]").forEach((r) => r.onchange = () => { tmp.yield_method = r.value; });
  $$("[name=bm]").forEach((r) => r.onchange = () => { tmp.bound_mode = r.value; $("#bandBox").classList.toggle("hidden", r.value !== "band"); });
  $("#bandSl").oninput = () => { tmp.band_pct = +$("#bandSl").value; $("#bandVal").textContent = `±${tmp.band_pct}%`; };
  $$("[data-clean]", $("#dClean")).forEach((c) => c.onchange = () => { tmpClean[c.dataset.clean] = c.checked; });
  $("#dReset").onclick = () => { Object.assign(S.settings, { yield_method: "mean", bound_mode: "historical", band_pct: 30, min_years: null, ratio_thr: 250 });
    close(); invalidate(); rerender(); toast("Settings reset to defaults."); };
  $("#dApply").onclick = async () => {
    tmp.min_years = $("#minY").value ? Math.max(1, +$("#minY").value) : null;
    tmp.ratio_thr = Math.max(1, +$("#thr").value || 250);
    Object.assign(S.settings, tmp);
    const cleanChanged = JSON.stringify(tmpClean) !== JSON.stringify(S.cleaning);
    close();
    if (cleanChanged && S.sid) {
      S.cleaning = tmpClean;
      const page = S.page, sc = S.scope;
      await prepare(false);
      if (sc && S.prep.hierarchy[sc.state]) { S.scope = sc; buildScopeBar(); }
      go(page);
    } else { S.crops = null; invalidate(); rerender(); }
    toast("Settings applied.");
  };
}
$("#settingsBtn").onclick = openSettings;

// ================================================================== help, theme, tooltips
$("#helpBtn").onclick = () => {
  $("#overlay").innerHTML = `<div class="scrim" id="scrim"></div><div class="modal" role="dialog" aria-label="Help">
    <div class="card-head"><h2>Quick guide</h2><button class="icon-btn" id="hClose">${IC.x}</button></div>
    <ol style="padding-left:18px;margin:0 0 6px">
      <li><b>Load data</b> — upload a CSV/Excel file or pick a ready dataset.</li>
      <li><b>Data quality</b> — see exactly what was cleaned and why.</li>
      <li><b>Choose a scope</b> in the bar at the top: state, season, districts and years.</li>
      <li><b>Explore</b> trends, then check which <b>crops</b> enter the model.</li>
      <li><b>Optimise</b> — drag the sliders; results update instantly.</li>
      <li><b>What-if</b> and <b>Compare districts</b> test how robust the plan is.</li></ol>
    <p class="small muted">Dotted-underlined words have a definition — hover over them.</p>
    <h3 style="margin-top:14px">Glossary</h3><dl class="gloss">${Object.values(GLOSS).map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("")}</dl></div>`;
  const close = () => { $("#overlay").innerHTML = ""; };
  $("#scrim").onclick = close; $("#hClose").onclick = close;
};
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("#overlay").innerHTML = ""; closeMS(); } });

function setTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { t ? localStorage.setItem("croplp-theme", t) : localStorage.removeItem("croplp-theme"); } catch (e) { /* storage unavailable */ }
}
try { const t = localStorage.getItem("croplp-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
$("#themeBtn").onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(dark ? "light" : "dark");
  rerender();
};
$("#newDataBtn").onclick = () => { S.meta = null; resetAll(); };

const tip = $("#tip");
document.addEventListener("mouseover", (e) => {
  const t = e.target.closest(".term");
  if (!t) { tip.classList.add("hidden"); return; }
  const g = GLOSS[t.dataset.term]; if (!g) return;
  tip.innerHTML = `<b>${g[0]}</b>${g[1]}`; tip.classList.remove("hidden");
  const r = t.getBoundingClientRect();
  tip.style.left = Math.min(window.innerWidth - 316, Math.max(8, r.left)) + "px";
  tip.style.top = (r.bottom + 8 + tip.offsetHeight > window.innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + "px";
});

// ================================================================== boot
// Deep links, e.g. /?load=demo&page=max  or  /?load=gov&page=districts&theme=dark
const QP = new URLSearchParams(location.search);
if (QP.get("theme")) document.documentElement.dataset.theme = QP.get("theme");
S.autoPage = QP.get("page");
if (QP.get("load")) loadBuiltin(QP.get("load")); else go(S.autoPage === "method" ? "method" : "home");
