/* =====================================================================
   Crop-Area Allocation — simple frontend (vanilla JS + Plotly.js, offline)
   All numbers come from the FastAPI backend (webapp/server.py -> or_core.py).
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
  crops: null, L: null, target: 100, trendPick: null,
  cache: {},
};

// ------------------------------------------------------------------ formatting
const nf = (d) => new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
function fmt(x, d = 0) {
  if (x == null || Number.isNaN(x)) return "–";
  const s = nf(d).format(x);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}
const pct = (x, d = 1) => (x == null ? "–" : (x > 0 ? "+" : "") + fmt(x, d) + "%");
const title = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function toast(msg, err = false) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), err ? 6000 : 3000);
}

// ------------------------------------------------------------------ API
async function api(path, body, form = false) {
  const r = await fetch(path, form ? { method: "POST", body } :
    { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || `Request failed (${r.status})`);
  return j;
}
const ctx = () => ({ sid: S.sid, scope: S.scope, settings: S.settings, crops: S.crops });
async function cached(path, body) {
  const key = path + JSON.stringify(body);
  if (!S.cache[key]) S.cache[key] = api(path, body);
  try { return await S.cache[key]; } catch (e) { delete S.cache[key]; throw e; }
}
function invalidate(keepL = false) { S.cache = {}; if (!keepL) S.L = null; }

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
const C = () => ({ hist: cssv("--accent"), opt: cssv("--accent-2"), neutral: cssv("--neutral-mark"),
  text: cssv("--text-2"), grid: cssv("--border") });
function plot(sel, data, layout = {}, height = 320) {
  const el = $(sel); if (!el) return;
  const c = C();
  const base = {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: cssv("--font"), size: 12.5, color: c.text },
    margin: { l: 60, r: 16, t: 10, b: 44 }, height, hovermode: "closest",
    legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0 },
    xaxis: { gridcolor: c.grid, zeroline: false, automargin: true },
    yaxis: { gridcolor: c.grid, zeroline: false, automargin: true },
  };
  Plotly.react(el, data, { ...base, ...layout, xaxis: { ...base.xaxis, ...(layout.xaxis || {}) }, yaxis: { ...base.yaxis, ...(layout.yaxis || {}) } },
    { displayModeBar: false, responsive: true });
}
const hbar = (rows, yk, xk, color, hover) => ({ type: "bar", orientation: "h", y: rows.map((r) => r[yk]), x: rows.map((r) => r[xk]),
  marker: { color }, hovertemplate: hover });
const vline = (x) => ({ type: "line", xref: "x", yref: "paper", x0: x, x1: x, y0: 0, y1: 1, line: { color: C().neutral, dash: "dot", width: 1.5 } });

// ------------------------------------------------------------------ tables (click a header to sort)
function table(sel, cols, rows, { limit = 0, search = false } = {}) {
  const el = $(sel); if (!el) return;
  const st = { k: null, asc: false, all: !limit, q: "" };
  function draw() {
    let r = rows.slice();
    if (st.q) { const q = st.q.toLowerCase(); r = r.filter((x) => cols.some((c) => String(x[c.k] ?? "").toLowerCase().includes(q))); }
    if (st.k) r.sort((a, b) => { const x = a[st.k], y = b[st.k]; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * (st.asc ? 1 : -1); });
    const shown = st.all ? r : r.slice(0, limit);
    const more = limit && r.length > limit ? ` · <a href="#" class="tmore">${st.all ? "show fewer" : "show all " + r.length}</a>` : "";
    el.innerHTML = (search || more ? `<div class="tools">${search ? `<input type="search" class="tq" placeholder="Search" value="${esc(st.q)}">` : "<span></span>"}<span class="muted">${fmt(r.length)} rows${more}</span></div>` : "") +
      `<div class="twrap"><table><thead><tr>${cols.map((c) => `<th data-k="${c.k}" class="${c.r ? "r" : ""}">${c.label}</th>`).join("")}</tr></thead><tbody>
      ${shown.map((x) => `<tr>${cols.map((c) => `<td class="${c.r ? "r" : ""}">${c.f ? c.f(x[c.k], x) : esc(x[c.k])}</td>`).join("")}</tr>`).join("")
        || `<tr><td colspan="${cols.length}" class="muted">No rows</td></tr>`}</tbody></table></div>`;
    $$("th", el).forEach((th) => th.onclick = () => { st.asc = st.k === th.dataset.k ? !st.asc : false; st.k = th.dataset.k; draw(); });
    const m = $(".tmore", el); if (m) m.onclick = (e) => { e.preventDefault(); st.all = !st.all; draw(); };
    const q = $(".tq", el); if (q) q.oninput = () => { st.q = q.value; draw(); const n = $(".tq", el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  }
  draw();
}
const F = {
  int: (v) => fmt(v, 0), n3: (v) => fmt(v, 3), n4: (v) => fmt(v, 4), title: (v) => esc(title(v)),
  pct: (v) => (v == null ? "–" : `<span class="${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${pct(v)}</span>`),
  signed: (v) => (v == null ? "–" : `<span class="${v > 0.5 ? "pos" : v < -0.5 ? "neg" : ""}">${v > 0 ? "+" : ""}${fmt(v, 0)}</span>`),
  status: (v) => !v ? "–" : v.startsWith("at max") ? "at maximum" : v.startsWith("at min") ? "at minimum" : v.startsWith("basic") ? "<b>marginal crop</b>" : esc(v),
};

// ------------------------------------------------------------------ page helpers
const num = (label, value, main = false) => `<div class="num ${main ? "main" : ""}"><div class="l">${label}</div><div class="v">${value}</div></div>`;
const note = (html, kind = "") => `<div class="note ${kind}">${html}</div>`;
const loading = (msg = "Calculating…") => `<div class="loading">${msg}</div>`;
const ORDER = ["home", "explore", "crops", "max", "min", "whatif", "districts", "method"];
const LABEL = { explore: "Explore", crops: "Crops", max: "Maximise output", min: "Minimise land", whatif: "Sensitivity", districts: "Districts", method: "Model" };
const next = (page) => { const n = ORDER[ORDER.indexOf(page) + 1]; return n ? `<div class="next"><button class="btn primary" data-go="${n}">Next: ${LABEL[n]} →</button></div>` : ""; };
const scopeText = () => S.scope ? `${S.scope.state} · ${S.scope.season} · ${S.scope.districts.length ? title(S.scope.districts[0]) : "all districts"} · ${S.scope.years[0]}–${S.scope.years[1]}` : "";

// ------------------------------------------------------------------ navigation
const view = () => $("#view");
const PAGES = {};
function go(page) {
  if (!PAGES[page]) return;
  if (!S.prep && !["home", "method"].includes(page)) page = "home";
  S.page = page;
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.page === page));
  $("#scope").classList.toggle("hidden", !S.prep || ["home", "method"].includes(page));
  window.scrollTo({ top: 0 });
  PAGES[page]();
}
const rerender = () => PAGES[S.page]();
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); go(g.dataset.go); }
  const t = e.target.closest("#tabs button");
  if (t && !t.disabled) go(t.dataset.page);
});
async function guarded(fn) {
  try { await fn(); } catch (e) {
    view().innerHTML = note(`<b>Could not compute this page.</b> ${esc(e.message)}`, "bad") + `<button class="btn" id="retry">Try again</button>`;
    $("#retry").onclick = () => { invalidate(true); rerender(); };
  }
}

// ================================================================== 1. Data
PAGES.home = function () {
  if (!S.meta) return renderStart();
  if (!S.prep) return renderMapping();
  renderData();
};

function renderStart() {
  view().innerHTML = `
    <h1>Load crop production data</h1>
    <p class="muted">The app cleans the data, checks production units, builds the two linear programmes from the
      average yields, and compares the optimal crop allocation with the historical one.</p>
    <div class="choices">
      <label class="choice" id="drop"><input type="file" id="fileIn" accept=".csv,.xlsx,.xls,.txt" hidden>
        <b>Upload a file</b><span>CSV or Excel. Click here or drop a file. Needs Crop, Area and Production columns.</span></label>
      <button class="choice" data-load="demo"><b>Demo dataset</b><span>Synthetic test data, 1,664 rows. Loads instantly.</span></button>
      <button class="choice" data-load="gov"><b>Government of India dataset</b><span>575,879 rows, used in the report. Takes about 10 s.</span></button>
    </div>
    <p class="small muted">Sample files to try uploading:
      <a href="/api/sample/demo">synthetic_crop_data_demo.csv</a> (full columns) ·
      <a href="/api/sample/mini">synthetic_minimal_farm.csv</a> (only Crop, Year, Area, Production).</p>`;
  const drop = $("#drop"), fi = $("#fileIn");
  fi.onchange = () => fi.files[0] && uploadFile(fi.files[0]);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && uploadFile(e.dataTransfer.files[0]));
  $$("[data-load]").forEach((b) => b.onclick = () => loadBuiltin(b.dataset.load));
}

async function loadBuiltin(name) {
  view().innerHTML = loading(name === "gov" ? "Reading 575,879 records (about 10 seconds)…" : "Loading…");
  try { setMeta(await api("/api/load", { name })); } catch (e) { toast(e.message, true); resetAll(); }
}
async function uploadFile(file) {
  view().innerHTML = loading(`Reading ${esc(file.name)}…`);
  const fd = new FormData(); fd.append("file", file);
  try { setMeta(await api("/api/upload", fd, true)); } catch (e) { toast(e.message, true); resetAll(); }
}
function setMeta(m) {
  Object.assign(S, { meta: m, sid: m.sid, prep: null, colmap: { ...m.guess }, crops: null });
  invalidate(); lockTabs(true);
  $("#dataName").textContent = `${m.name} · ${fmt(m.rows)} rows`;
  $("#newDataBtn").classList.remove("hidden");
  if (m.required.every((k) => S.colmap[k])) prepare(); else renderMapping();
}
function resetAll() {
  Object.assign(S, { sid: null, meta: null, prep: null, scope: null, crops: null, L: null, cache: {} });
  lockTabs(true); $("#dataName").textContent = ""; $("#newDataBtn").classList.add("hidden"); go("home");
}
function lockTabs(lock) { $$("#tabs button").forEach((b) => { if (!["home", "method"].includes(b.dataset.page)) b.disabled = lock; }); }

const CLEAN_RULES = [["drop_zero", "Drop rows with zero production"], ["merge_alias", "Merge crop-name spellings (e.g. Paddy → Rice)"],
  ["drop_agg", "Drop aggregate rows (e.g. Total foodgrain)"], ["reconcile", "Fix duplicate copies stored ×100"]];
const cleaningChecks = () => `<div class="checks">${CLEAN_RULES.map(([k, t]) =>
  `<label><input type="checkbox" data-clean="${k}" ${S.cleaning[k] ? "checked" : ""}> ${t}</label>`).join("")}</div>`;

function renderMapping() {
  const m = S.meta;
  const desc = { State_Name: "State", District_Name: "District", Crop_Year: "Year", Season: "Season",
    Crop: "Crop *", Area: "Area (ha) *", Production: "Production *", Yield: "Yield" };
  view().innerHTML = `
    <h1>Match your columns</h1>
    <p class="muted">${esc(m.name)} · ${fmt(m.rows)} rows. Columns marked * are required.</p>
    <div class="map">${m.canonical.map((k) => {
      const req = m.required.includes(k), val = S.colmap[k] || "";
      return `<label class="${req && !val ? "missing" : ""}">${desc[k]}<select data-map="${k}"><option value="">— none —</option>${m.columns.map((c) =>
        `<option ${c === val ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`; }).join("")}</div>
    <h2>Cleaning</h2>${cleaningChecks()}
    <p style="margin-top:14px"><button class="btn primary" id="goPrep">Analyse data</button></p>
    <h2>File preview</h2><div id="pv"></div>`;
  $$("[data-map]").forEach((s) => s.onchange = () => { S.colmap[s.dataset.map] = s.value; renderMapping(); });
  $$("[data-clean]").forEach((c) => c.onchange = () => { S.cleaning[c.dataset.clean] = c.checked; });
  table("#pv", m.columns.map((c) => ({ k: c, label: esc(c) })), m.preview, { limit: 8 });
  $("#goPrep").onclick = prepare;
}

async function prepare() {
  const missing = S.meta.required.filter((k) => !S.colmap[k]);
  if (missing.length) { toast("Please choose a column for: " + missing.join(", "), true); return renderMapping(); }
  view().innerHTML = loading("Cleaning and checking the data…");
  try {
    const p = await api("/api/prepare", { sid: S.sid, colmap: S.colmap, cleaning: S.cleaning });
    S.prep = p; S.crops = null; invalidate();
    S.scope = { state: p.default.state, season: p.default.season, districts: [], years: p.default.years };
    buildScope(); lockTabs(false);
    const target = S.autoPage && PAGES[S.autoPage] ? S.autoPage : "home";
    S.autoPage = null;
    go(target);
  } catch (e) { toast(e.message, true); renderMapping(); }
}

function renderData() {
  const p = S.prep, k = p.kpis;
  view().innerHTML = `
    <h1>Data summary</h1>
    <p class="muted">${esc(S.meta.name)}. Every row is cleaned before any number is computed.</p>
    <div class="nums">
      ${num("Usable rows", fmt(k.rows_clean), true)}
      ${num("Rows removed", fmt(k.rows_raw - k.rows_clean))}
      ${num("States / districts", `${fmt(k.states)} / ${fmt(k.districts)}`)}
      ${num("Crops", fmt(k.crops))}
      ${num("Years", `${k.year_min}–${k.year_max}`)}
    </div>
    ${p.stacked ? note(`<b>Duplicate copy found and fixed.</b> ${fmt(p.stacked.pairs)} records appear twice, the second copy with
      production ×${fmt(p.stacked.factor)}. The copies were rescaled and the duplicates dropped, so all production is in one unit.`, "warn") : ""}
    <h2>Cleaning steps</h2><div id="tbClean"></div>
    <h2>Records per year</h2><div id="chYear" class="chart"></div>
    <h2>Cleaned data (first rows)</h2><div id="tbPrev"></div>
    ${next("home")}`;
  table("#tbClean", [{ k: "step", label: "Step" }, { k: "removed", label: "Rows removed", r: 1, f: F.int }, { k: "why", label: "Reason" }], p.cleaning);
  plot("#chYear", [{ type: "bar", x: p.rows_per_year.x, y: p.rows_per_year.y, marker: { color: C().hist },
    hovertemplate: "%{x}: %{y:,} rows<extra></extra>" }], { yaxis: { title: "rows" } }, 260);
  table("#tbPrev", [{ k: "State_Name", label: "State" }, { k: "District_Name", label: "District", f: F.title }, { k: "Crop_Year", label: "Year" },
    { k: "Season", label: "Season" }, { k: "Crop", label: "Crop" }, { k: "Area", label: "Area (ha)", r: 1, f: F.int },
    { k: "Production", label: "Production", r: 1, f: (v) => fmt(v, 1) }, { k: "Yield", label: "Yield", r: 1, f: F.n3 }], p.preview, { limit: 10 });
}

// ------------------------------------------------------------------ scope bar
function buildScope() {
  const p = S.prep, sc = S.scope;
  const st = $("#selState"), se = $("#selSeason"), di = $("#selDistrict"), y0 = $("#selY0"), y1 = $("#selY1");
  const opts = (arr, cur, lab = (x) => x) => arr.map((x) => `<option value="${esc(x)}" ${x === cur ? "selected" : ""}>${esc(lab(x))}</option>`).join("");
  const fill = () => {
    const h = p.hierarchy[sc.state];
    if (!h.seasons.includes(sc.season)) sc.season = h.seasons.includes("Kharif") ? "Kharif" : h.seasons[0];
    st.innerHTML = opts(p.states, sc.state);
    se.innerHTML = opts(h.seasons, sc.season);
    di.innerHTML = `<option value="">All districts</option>` + opts(h.districts, sc.districts[0], title);
    const yrs = []; for (let y = p.kpis.year_min; y <= p.kpis.year_max; y++) yrs.push(y);
    y0.innerHTML = opts(yrs, sc.years[0]); y1.innerHTML = opts(yrs, sc.years[1]);
  };
  fill();
  const changed = () => { fill(); S.crops = null; S.trendPick = null; invalidate(); rerender(); };
  st.onchange = () => { sc.state = st.value; sc.districts = []; changed(); };
  se.onchange = () => { sc.season = se.value; changed(); };
  di.onchange = () => { sc.districts = di.value ? [di.value] : []; changed(); };
  y0.onchange = () => { sc.years = [Math.min(+y0.value, sc.years[1]), sc.years[1]]; changed(); };
  y1.onchange = () => { sc.years = [sc.years[0], Math.max(+y1.value, sc.years[0])]; changed(); };
}

// ================================================================== 2. Explore
PAGES.explore = () => guarded(async () => {
  view().innerHTML = loading();
  const d = await cached("/api/explore", ctx());
  if (S.page !== "explore") return;
  if (!S.trendPick) S.trendPick = d.trend_default;
  view().innerHTML = `
    <h1>Explore the data</h1>
    <p class="muted">${esc(scopeText())}. Only crops measured by weight are included.</p>
    <ul class="plain">${d.insights.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    <div class="two">
      <div><h2>Top crops by area</h2><div id="chTop" class="chart"></div></div>
      <div><h2>Yield trend</h2><p class="small muted">Choose up to 3 crops: <span id="picks"></span></p><div id="chTrend" class="chart"></div></div>
    </div>
    <h2>Districts: area vs production</h2><div id="chDist" class="chart"></div>
    <h2>Best-yielding crop per district and season</h2><div id="tbBest"></div>
    ${next("explore")}`;
  const c = C();
  const t = [...d.top_crops].sort((a, b) => a.Area - b.Area);
  plot("#chTop", [hbar(t, "Crop", "Area", c.hist, "%{y}: %{x:,.0f} ha<extra></extra>")],
    { margin: { l: 10, r: 16, t: 6, b: 40 }, xaxis: { title: "hectares (total)" } }, Math.max(300, 22 * t.length + 60));
  const pal = [c.hist, c.opt, c.neutral];
  const drawTrend = () => {
    $("#picks").innerHTML = Object.keys(d.trend).map((k) =>
      `<label style="margin-right:10px;white-space:nowrap"><input type="checkbox" data-tc="${esc(k)}" ${S.trendPick.includes(k) ? "checked" : ""}> ${esc(k)}</label>`).join("");
    $$("[data-tc]").forEach((b) => b.onchange = () => {
      const k = b.dataset.tc;
      if (!b.checked) S.trendPick = S.trendPick.filter((x) => x !== k);
      else if (S.trendPick.length >= 3) { toast("Up to 3 crops at a time."); b.checked = false; return; }
      else S.trendPick = [...S.trendPick, k];
      drawTrend();
    });
    plot("#chTrend", S.trendPick.filter((k) => d.trend[k]).map((k, i) => ({ type: "scatter", mode: "lines+markers", name: k,
      x: d.trend[k].x, y: d.trend[k].y, line: { color: pal[i], width: 2 }, marker: { size: 6 },
      hovertemplate: `${k} %{x}: %{y:.3f}/ha<extra></extra>` })), { yaxis: { title: "yield per ha" } }, 300);
  };
  drawTrend();
  plot("#chDist", [{ type: "scatter", mode: "markers", x: d.districts.map((r) => r.Area), y: d.districts.map((r) => r.Production),
    text: d.districts.map((r) => title(r.District_Name)), marker: { size: 10, color: c.hist, opacity: 0.8 },
    hovertemplate: "<b>%{text}</b><br>Area %{x:,.0f} ha<br>Production %{y:,.0f}<extra></extra>" }],
  { xaxis: { type: "log", title: "area (ha, log scale)" }, yaxis: { type: "log", title: "production (log scale)" } }, 320);
  const seasons = [...new Set(d.best.map((r) => r.Season))].sort();
  const byD = {}; d.best.forEach((r) => { (byD[r.District] ||= { District: r.District })[r.Season] = `${r.Crop} (${fmt(r.Yield, 2)})`; });
  table("#tbBest", [{ k: "District", label: "District", f: F.title }, ...seasons.map((s) => ({ k: s, label: esc(s), f: (v) => esc(v || "–") }))],
    Object.values(byD), { limit: 12, search: true });
});

// ================================================================== 3. Crops
PAGES.crops = () => guarded(async () => {
  view().innerHTML = loading();
  const d = await cached("/api/crops", ctx());
  if (S.page !== "crops") return;
  const sel = new Set(d.selected), inCoef = new Set(d.coef.map((r) => r.Crop));
  const coefBy = Object.fromEntries(d.coef.map((r) => [r.Crop, r]));
  const st = S.settings;
  view().innerHTML = `
    <h1>Crops in the model</h1>
    <p class="muted">${esc(scopeText())}. Only crops measured in the same unit (weight) can be added together, so crops counted in nuts
      or bales are left out. Each crop also needs data in at least ${d.min_years} of the selected years.</p>
    ${d.baseline ? `<div class="nums">
      ${num("Crops in the LP", fmt(d.coef.length), true)}
      ${num("Historical land L (ha)", fmt(d.baseline.L))}
      ${num("Historical output D", fmt(d.baseline.D))}
    </div>` : note("Fewer than 2 crops have enough data for an LP. Tick more crops or widen the years.", "bad")}
    <p class="row"><button class="btn" id="cRec">Recommended</button><button class="btn" id="cAll">Select all</button><button class="btn" id="cNone">Clear</button></p>
    <div class="twrap croptbl"><table><thead><tr><th></th><th>Crop</th><th>Unit check</th><th class="r">y<sub>c</sub> (yield/ha)</th>
      <th class="r">a<sub>c</sub> (min ha)</th><th class="r">m<sub>c</sub> (max ha)</th><th class="r">Historical ha</th><th class="r">Years</th></tr></thead><tbody>
      ${[...d.unit].sort((a, b) => (coefBy[b.Crop] ? coefBy[b.Crop].y_c : -1) - (coefBy[a.Crop] ? coefBy[a.Crop].y_c : -1)).map((u) => {
        const on = sel.has(u.Crop), r = coefBy[u.Crop];
        const unit = u.status === "Exclude" ? `<span class="neg">${esc((u.reason.split(":")[1] || "excluded").trim())}</span>`
          : on && !inCoef.has(u.Crop) ? "too few years" : "weight";
        return `<tr class="${on && r ? "" : "off"}"><td><input type="checkbox" data-crop="${esc(u.Crop)}" ${on ? "checked" : ""}></td><td>${esc(u.Crop)}</td><td>${unit}</td>
          <td class="r">${r ? fmt(r.y_c, 3) : "–"}</td><td class="r">${r ? fmt(r.lp_lo) : "–"}</td><td class="r">${r ? fmt(r.lp_hi) : "–"}</td>
          <td class="r">${r ? fmt(r.hist_area) : "–"}</td><td class="r">${r ? r.years : "–"}</td></tr>`; }).join("")}
    </tbody></table></div>
    <p class="small" style="margin-top:6px"><a href="#" id="dlCoef">Download LP inputs (CSV)</a></p>
    <h2>Yield coefficients y<sub>c</sub></h2><div id="chCoef" class="chart"></div>
    <details><summary>Model settings (optional)</summary>
      <p><label>Yield y<sub>c</sub>: <select id="ym">
        <option value="mean">mean of yearly yields (default)</option><option value="median">median of yearly yields</option>
        <option value="weighted">area-weighted (Σ production ÷ Σ area)</option></select></label></p>
      <p><label>Bounds a<sub>c</sub>, m<sub>c</sub>: <select id="bm">
        <option value="historical">historical min / max area (default)</option><option value="band">± band around average area</option></select></label>
        <label id="bandBox"> band ±<input type="number" id="bp" min="5" max="100" step="5" style="width:70px" value="${st.band_pct}">%</label></p>
      <p><label>Minimum years of data per crop: <input type="number" id="my" min="1" style="width:80px" value="${st.min_years ?? ""}" placeholder="auto"></label></p>
      <p class="small muted">Cleaning rules (re-runs cleaning):</p>${cleaningChecks()}
      <p><button class="btn primary" id="apply">Apply</button> <button class="btn" id="reset">Reset</button></p>
    </details>
    ${next("crops")}`;
  $$("[data-crop]").forEach((c) => c.onchange = () => {
    const cur = new Set(S.crops ?? d.selected);
    c.checked ? cur.add(c.dataset.crop) : cur.delete(c.dataset.crop);
    S.crops = [...cur]; invalidate(); rerender();
  });
  $("#cRec").onclick = () => { S.crops = null; invalidate(); rerender(); };
  $("#cAll").onclick = () => { S.crops = d.unit.map((u) => u.Crop); invalidate(); rerender(); };
  $("#cNone").onclick = () => { S.crops = []; invalidate(); rerender(); };
  $("#dlCoef").onclick = (e) => { e.preventDefault(); downloadCSV(d.coef, "lp_coefficients.csv"); };
  const cf = [...d.coef].sort((a, b) => a.y_c - b.y_c);
  plot("#chCoef", [{ ...hbar(cf, "Crop", "y_c", C().hist, "%{y}: %{x:.3f}/ha<extra></extra>"),
    error_x: { type: "data", array: cf.map((x) => x.yield_sd), color: C().neutral, thickness: 1.2, width: 3 } }],
  { margin: { l: 10, r: 16, t: 6, b: 40 }, xaxis: { title: "average yield per hectare (bars: ± year-to-year s.d.)" } }, Math.max(300, 22 * cf.length + 60));

  $("#ym").value = st.yield_method; $("#bm").value = st.bound_mode;
  const band = () => $("#bandBox").classList.toggle("hidden", $("#bm").value !== "band");
  band(); $("#bm").onchange = band;
  const tmpClean = { ...S.cleaning };
  $$("details [data-clean]").forEach((c) => c.onchange = () => { tmpClean[c.dataset.clean] = c.checked; });
  $("#apply").onclick = async () => {
    Object.assign(st, { yield_method: $("#ym").value, bound_mode: $("#bm").value, band_pct: +$("#bp").value || 30,
      min_years: $("#my").value ? Math.max(1, +$("#my").value) : null });
    S.crops = null; invalidate();
    if (JSON.stringify(tmpClean) !== JSON.stringify(S.cleaning)) {
      S.cleaning = tmpClean;
      const sc = S.scope; S.autoPage = "crops";
      await prepare();
      if (sc && S.prep.hierarchy[sc.state]) { S.scope = sc; buildScope(); invalidate(); go("crops"); }
    } else rerender();
    toast("Settings applied.");
  };
  $("#reset").onclick = () => { Object.assign(st, { yield_method: "mean", bound_mode: "historical", band_pct: 30, min_years: null, ratio_thr: 250 });
    S.crops = null; invalidate(); rerender(); toast("Settings reset."); };
});

// ------------------------------------------------------------------ shared LP output
function allocChart(sel, alloc, planLabel) {
  const c = C(), a = [...alloc].sort((x, y) => x.hist_area - y.hist_area);
  plot(sel, [
    { type: "bar", orientation: "h", name: "Historical average", y: a.map((r) => r.Crop), x: a.map((r) => r.hist_area), marker: { color: c.hist },
      hovertemplate: "%{y}<br>historical %{x:,.0f} ha<extra></extra>" },
    { type: "bar", orientation: "h", name: planLabel, y: a.map((r) => r.Crop), x: a.map((r) => r.x_opt), marker: { color: c.opt },
      customdata: a.map((r) => r.change_ha), hovertemplate: "%{y}<br>plan %{x:,.0f} ha<br>change %{customdata:+,.0f} ha<extra></extra>" },
  ], { barmode: "group", bargap: 0.3, xaxis: { title: "hectares" }, margin: { l: 10, r: 16, t: 30, b: 44 } }, Math.max(340, 30 * a.length + 90));
}
function allocTable(sel, alloc) {
  table(sel, [{ k: "Crop", label: "Crop" }, { k: "y_c", label: "y<sub>c</sub>", r: 1, f: F.n3 },
    { k: "a_c", label: "Min ha", r: 1, f: F.int }, { k: "m_c", label: "Max ha", r: 1, f: F.int },
    { k: "hist_area", label: "Historical ha", r: 1, f: F.int }, { k: "x_opt", label: "Optimal ha", r: 1, f: F.int },
    { k: "change_ha", label: "Change ha", r: 1, f: F.signed }, { k: "reduced_cost", label: "Reduced cost", r: 1, f: F.n4 },
    { k: "bound_status", label: "Status", f: F.status }], alloc);
}
function lpDetails(r) {
  const same = r.scipy_objective != null && Math.abs(r.objective - r.scipy_objective) <= 1e-6 * Math.abs(r.objective || 1);
  return `<details><summary>The LP as solved (PuLP)</summary><pre>${esc(r.lp_text)}</pre></details>
    <details><summary>Solver cross-check: PuLP vs SciPy</summary>
      <table><tbody>
        <tr><td>Objective, PuLP (CBC)</td><td class="r">${fmt(r.objective, 2)}</td></tr>
        <tr><td>Objective, SciPy linprog (HiGHS)</td><td class="r">${fmt(r.scipy_objective, 2)}</td></tr>
        <tr><td>Dual value, PuLP / SciPy</td><td class="r">${fmt(r.shadow, 6)} / ${fmt(r.scipy_shadow, 6)}</td></tr>
      </tbody></table><p class="small ${same ? "pos" : "neg"}" style="margin-top:8px">${same ? "Both solvers agree." : "The solvers differ — check the model."}</p></details>`;
}

// ================================================================== 4. Maximise output
PAGES.max = () => guarded(async () => {
  if (!$("#maxBody")) view().innerHTML = `<div id="maxBody">${loading()}</div>`;
  const d = await cached("/api/optimize/max", { ...ctx(), L: S.L });
  if (S.page !== "max") return;
  const r = d.result, ok = r.status === "Optimal";
  if (S.L == null) S.L = d.L;
  const lo = Math.floor(d.feas.min_land * 0.9), hi = Math.ceil(Math.max(d.feas.max_land * 1.1, d.L_hist * 1.3));
  view().innerHTML = `<div id="maxBody">
    <h1>Optimization 1: maximise output</h1>
    <div class="math">maximise Z = Σ<sub>c</sub> y<sub>c</sub> x<sub>c</sub> &nbsp; subject to &nbsp; Σ<sub>c</sub> x<sub>c</sub> ≤ L, &nbsp; a<sub>c</sub> ≤ x<sub>c</sub> ≤ m<sub>c</sub>, &nbsp; x<sub>c</sub> ≥ 0</div>
    <div class="control">Land budget L: <b id="lVal">${fmt(S.L)} ha</b>
      <input type="range" id="lSl" min="${lo}" max="${hi}" step="${Math.max(1, Math.round((hi - lo) / 400))}" value="${S.L}">
      <div class="ends"><span>${fmt(lo)}</span><span>${fmt(hi)}</span></div>
      <div class="row"><input type="number" id="lIn" value="${Math.round(S.L)}" style="width:150px"> ha
        <button class="btn" id="lHist">Use historical (${fmt(d.L_hist)} ha)</button></div>
    </div>
    ${ok ? `<div class="nums">
      ${num("Output gain vs history", pct(d.gain_pct, 2), true)}
      ${num("Optimal output Z*", fmt(r.objective))}
      ${num("Historical output", fmt(d.D_hist))}
      ${num("Shadow price of land λ*", fmt(r.shadow, 4))}
    </div>
    <h2>What this means</h2><ul class="plain">${d.explain.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    <h2>Historical vs optimal hectares</h2><div id="chAlloc"></div>
    <h2>Solution</h2><div id="tbAlloc"></div>
    <p class="small"><a href="#" id="dl">Download plan (CSV)</a></p>
    ${lpDetails(r)}` : note(`<b>No feasible plan.</b> ${esc(d.explain[0])}`, "bad")}
    ${next("max")}</div>`;
  const apply = (v) => { S.L = Math.max(0, +v); PAGES.max(); };
  $("#lSl").oninput = () => { $("#lVal").textContent = fmt(+$("#lSl").value) + " ha"; $("#lIn").value = $("#lSl").value; };
  $("#lSl").onchange = () => apply($("#lSl").value);
  $("#lIn").onchange = () => apply($("#lIn").value);
  $("#lHist").onclick = () => apply(d.L_hist);
  if (!ok) return;
  allocChart("#chAlloc", r.alloc, "Optimal (LP)");
  allocTable("#tbAlloc", r.alloc);
  $("#dl").onclick = (e) => { e.preventDefault(); downloadCSV(r.alloc, "max_output_plan.csv"); };
});

// ================================================================== 5. Minimise land
PAGES.min = () => guarded(async () => {
  if (!$("#minBody")) view().innerHTML = `<div id="minBody">${loading()}</div>`;
  const d = await cached("/api/optimize/min", { ...ctx(), target_pct: S.target });
  if (S.page !== "min") return;
  const r = d.result, ok = r.status === "Optimal";
  view().innerHTML = `<div id="minBody">
    <h1>Optimization 2: minimise land</h1>
    <div class="math">minimise Σ<sub>c</sub> x<sub>c</sub> &nbsp; subject to &nbsp; Σ<sub>c</sub> y<sub>c</sub> x<sub>c</sub> ≥ D, &nbsp; a<sub>c</sub> ≤ x<sub>c</sub> ≤ m<sub>c</sub>, &nbsp; x<sub>c</sub> ≥ 0</div>
    <div class="control">Production target D: <b id="tVal">${S.target}% of historical = ${fmt(d.D)}</b>
      <input type="range" id="tSl" min="50" max="150" step="1" value="${S.target}">
      <div class="ends"><span>50%</span><span>100% = historical output</span><span>150%</span></div>
    </div>
    ${ok ? `<div class="nums">
      ${num("Land saved", `${fmt(d.saving_ha)} ha (${fmt(d.saving_pct, 2)}%)`, true)}
      ${num("Minimum land needed", fmt(r.objective) + " ha")}
      ${num("Historical land", fmt(d.L_hist) + " ha")}
      ${num("Shadow price of target μ*", fmt(r.shadow, 6))}
    </div>
    ${d.duality && d.duality.inv_lam ? note(`<b>Duality check:</b> solving Optimization 1 with L = ${fmt(d.duality.L)} ha gives λ* = ${fmt(d.duality.lam, 6)},
      so 1/λ* = <b>${fmt(d.duality.inv_lam, 6)}</b>, which equals μ* = <b>${fmt(d.duality.mu, 6)}</b>. Both models describe the same optimum.`) : ""}
    <h2>What this means</h2><ul class="plain">${d.explain.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    <h2>Historical vs least-land hectares</h2><div id="chAlloc2"></div>
    <h2>Solution</h2><div id="tbAlloc2"></div>
    <p class="small"><a href="#" id="dl2">Download plan (CSV)</a></p>
    ${lpDetails(r)}` : note(`<b>Target not reachable.</b> ${esc(d.explain[0])}`, "bad")}
    ${next("min")}</div>`;
  $("#tSl").oninput = () => { $("#tVal").textContent = `${$("#tSl").value}% of historical = ${fmt(d.D_hist * $("#tSl").value / 100)}`; };
  $("#tSl").onchange = () => { S.target = +$("#tSl").value; PAGES.min(); };
  if (!ok) return;
  allocChart("#chAlloc2", r.alloc, "Least-land (LP)");
  allocTable("#tbAlloc2", r.alloc);
  $("#dl2").onclick = (e) => { e.preventDefault(); downloadCSV(r.alloc, "min_land_plan.csv"); };
});

// ================================================================== 6. Sensitivity
PAGES.whatif = () => guarded(async () => {
  view().innerHTML = loading("Solving the LP for many land budgets…");
  const d = await cached("/api/sensitivity", { ...ctx(), shock: -15, shock_crops: [] });
  if (S.page !== "whatif") return;
  view().innerHTML = `
    <h1>Sensitivity analysis</h1>
    <p class="muted">${esc(scopeText())}.</p>
    <div class="two">
      <div><h2>Optimal output Z* vs land L</h2><div id="chZL" class="chart"></div></div>
      <div><h2>Shadow price λ* vs land L</h2><div id="chLam" class="chart"></div></div>
    </div>
    <p class="small muted">The curve flattens (diminishing returns) and λ* falls in steps each time another crop reaches its maximum area.
      The dotted line is the historical land.</p>
    <h2>Gain when each crop may move only ±p% from its historical area</h2><div id="chBand" class="chart"></div>
    <h2>Yield ranging (at historical land, λ* = ${fmt(d.lam, 4)})</h2>
    <p class="small muted">How far each crop's yield can change before the optimal plan changes.</p>
    <div id="tbRange"></div>
    ${next("whatif")}`;
  const c = C(), land = d.land.filter((r) => r.Z != null);
  plot("#chZL", [{ type: "scatter", mode: "lines", x: land.map((r) => r.L), y: land.map((r) => r.Z), line: { color: c.hist, width: 2.5 },
    hovertemplate: "L %{x:,.0f} ha<br>Z* %{y:,.0f}<extra></extra>" }],
  { shapes: [vline(d.L_hist)], xaxis: { title: "land budget L (ha)" }, yaxis: { title: "Z*" } }, 290);
  plot("#chLam", [{ type: "scatter", mode: "lines", line: { shape: "hv", color: c.opt, width: 2.5 }, x: land.map((r) => r.L), y: land.map((r) => r.shadow_price),
    hovertemplate: "L %{x:,.0f} ha<br>λ* %{y:.3f}<extra></extra>" }],
  { shapes: [vline(d.L_hist)], xaxis: { title: "land budget L (ha)" }, yaxis: { title: "λ*" } }, 290);
  plot("#chBand", [
    { type: "scatter", mode: "lines+markers", name: "Output gain (Opt 1)", x: d.band.map((r) => r.band_pct), y: d.band.map((r) => r.output_gain_pct), line: { color: c.hist, width: 2.5 } },
    { type: "scatter", mode: "lines+markers", name: "Land saving (Opt 2)", x: d.band.map((r) => r.band_pct), y: d.band.map((r) => r.land_saving_pct), line: { color: c.opt, width: 2.5 } },
  ], { xaxis: { title: "allowed change per crop (±%)" }, yaxis: { title: "%" }, hovermode: "x unified", margin: { l: 60, r: 16, t: 30, b: 44 } }, 290);
  table("#tbRange", [{ k: "Crop", label: "Crop" }, { k: "y_c", label: "Yield now", r: 1, f: F.n3 }, { k: "status", label: "Status", f: F.status },
    { k: "allowable_min_yield", label: "Plan holds if yield ≥", r: 1, f: F.n3 },
    { k: "allowable_max_yield", label: "and ≤", r: 1, f: (v) => (v == null ? "no limit" : fmt(v, 3)) }], d.ranging);
});

// ================================================================== 7. Districts
PAGES.districts = () => guarded(async () => {
  view().innerHTML = loading("Solving both models for every district…");
  const d = await cached("/api/districts", ctx());
  if (S.page !== "districts") return;
  const head = `<h1>District comparison</h1><p class="muted">Both models solved separately for every district of ${esc(S.scope.state)}
    (${esc(S.scope.season)}, ${S.scope.years[0]}–${S.scope.years[1]}).</p>`;
  if (!d.rows.length) { view().innerHTML = head + note("Not enough districts with 2 or more crops in this scope."); return; }
  const s = d.summary;
  view().innerHTML = `${head}
    <div class="nums">
      ${num("Districts", fmt(s.n))}
      ${num("Median output gain", pct(s.median_gain, 1), true)}
      ${num("Median land saving", fmt(s.median_saving, 1) + "%")}
      ${num("Highest gain", esc(title(s.best)))}
    </div>
    <h2>Output gain and land saving by district</h2><div id="chMD"></div>
    <h2>All districts</h2><div id="tbMD"></div>
    <p class="small"><a href="#" id="dl3">Download (CSV)</a></p>
    ${next("districts")}`;
  const c = C(), r = [...d.rows].sort((a, b) => a.output_gain_pct - b.output_gain_pct);
  plot("#chMD", [
    { type: "bar", orientation: "h", name: "Output gain % (Opt 1)", y: r.map((x) => title(x.District)), x: r.map((x) => x.output_gain_pct), marker: { color: c.hist } },
    { type: "bar", orientation: "h", name: "Land saving % (Opt 2)", y: r.map((x) => title(x.District)), x: r.map((x) => x.land_saving_pct), marker: { color: c.opt } },
  ], { barmode: "group", bargap: 0.25, margin: { l: 10, r: 16, t: 30, b: 44 }, xaxis: { title: "%" } }, Math.max(360, 28 * r.length + 90));
  table("#tbMD", [{ k: "District", label: "District", f: F.title }, { k: "crops", label: "Crops", r: 1 }, { k: "land_L", label: "Land (ha)", r: 1, f: F.int },
    { k: "output_gain_pct", label: "Output gain", r: 1, f: F.pct }, { k: "land_saving_pct", label: "Land saving %", r: 1, f: (v) => fmt(v, 1) },
    { k: "land_shadow_price", label: "λ*", r: 1, f: F.n3 }, { k: "biggest_expansion", label: "Crop expanded most" }], d.rows, { search: true });
  $("#dl3").onclick = (e) => { e.preventDefault(); downloadCSV(d.rows, "district_comparison.csv"); };
});

// ================================================================== Model (reference)
PAGES.method = function () {
  view().innerHTML = `
    <h1>The model</h1>
    <p>Land is fixed and crops differ in yield. Using historical yield records, how should land be re-allocated across crops?</p>
    <h2>Optimization 1: maximise output</h2>
    <div class="math">maximise Z = Σ<sub>c</sub> y<sub>c</sub> x<sub>c</sub><br>subject to Σ<sub>c</sub> x<sub>c</sub> ≤ L, &nbsp; a<sub>c</sub> ≤ x<sub>c</sub> ≤ m<sub>c</sub>, &nbsp; x<sub>c</sub> ≥ 0</div>
    <h2>Optimization 2: minimise land</h2>
    <div class="math">minimise Σ<sub>c</sub> x<sub>c</sub><br>subject to Σ<sub>c</sub> y<sub>c</sub> x<sub>c</sub> ≥ D, &nbsp; a<sub>c</sub> ≤ x<sub>c</sub> ≤ m<sub>c</sub>, &nbsp; x<sub>c</sub> ≥ 0</div>
    <h2>Symbols</h2>
    <div class="twrap"><table><thead><tr><th>Symbol</th><th>Meaning</th><th>Taken from the data as</th></tr></thead><tbody>
      <tr><td>x<sub>c</sub></td><td>hectares given to crop c (decision variable)</td><td>—</td></tr>
      <tr><td>y<sub>c</sub></td><td>yield of crop c</td><td>average over the years of (Σ production ÷ Σ area)</td></tr>
      <tr><td>a<sub>c</sub>, m<sub>c</sub></td><td>minimum / maximum hectares</td><td>smallest / largest yearly area in the window</td></tr>
      <tr><td>L</td><td>land budget</td><td>average yearly area of the selected crops</td></tr>
      <tr><td>D</td><td>production target</td><td>Σ y<sub>c</sub> × average area (historical output)</td></tr>
      <tr><td>λ*, μ*</td><td>shadow prices of land and of the target</td><td>dual values from the solver; μ* = 1/λ*</td></tr>
    </tbody></table></div>
    <h2>Workflow</h2>
    <p>Load data → clean → check production units → average yields → build LP → solve (PuLP, cross-checked with SciPy) →
      compare with historical allocation → sensitivity and district comparison.</p>
    <h2>Why the solution looks like this</h2>
    <p>With one land constraint and bounds on each crop, the LP is a continuous knapsack: every crop gets its minimum, then the remaining
      land goes to the highest-yield crops first, each up to its maximum. The one crop left between its bounds is the marginal crop, and its
      yield equals the shadow price λ*.</p>
    <h2>Assumptions and limitations</h2>
    <ul class="plain">
      <li>Production units must match: crops counted in nuts or bales are excluded.</li>
      <li>Yields are historical averages; weather variation is not modelled.</li>
      <li>Output, not profit: the dataset has no price or cost data.</li>
      <li>Not modelled: soil, irrigation, labour, crop rotation, prices and demand.</li>
    </ul>
    <h2>References</h2>
    <ol class="small muted">
      <li>H. A. Taha, <i>Operations Research: An Introduction</i>, 10th ed., Pearson, 2017.</li>
      <li>S. Wankhade &amp; H. Lunge, LP technique for optimum resource allocation in agricultural production, Akola district, 2012.</li>
      <li>F. Majeke et al., Linear programming approach — application in agriculture, 2020.</li>
      <li>S. Supriya et al., Optimal crop plans using LP in Jayashankar Bhupalpally district, Telangana, 2022.</li>
      <li>K. K. Paidipati &amp; S. R. Padi, Optimal programming problems for crop planning and agricultural resource management, 2017.</li>
      <li>X. Liang, LP approach in agricultural production-land allocation, Springer, 2023.</li>
      <li>MoA&amp;FW, Govt. of India, District-wise Season-wise Crop Production Statistics (1997–2020-21), data.gov.in.</li>
    </ol>`;
};

// ================================================================== boot
$("#newDataBtn").onclick = () => resetAll();
// Deep links, e.g. /?load=demo&page=max  or  /?load=gov&page=districts
const QP = new URLSearchParams(location.search);
S.autoPage = { data: "home" }[QP.get("page")] || QP.get("page");
if (QP.get("load")) loadBuiltin(QP.get("load")); else go(S.autoPage === "method" ? "method" : "home");
