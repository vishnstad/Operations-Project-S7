"""
app.py — Interactive dashboard for
    "Optimal Crop-Area Allocation for Agricultural Resource Planning"
    (Operations Research project — LP on GOV district-level crop data)

Run:   streamlit run app.py
Upload any CSV/Excel with (at least) Crop, Area, Production columns — or use
the bundled Government dataset / synthetic demo dataset — and every insight,
plot and both LP models are recomputed live.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

sys.path.insert(0, str(Path(__file__).parent))
import or_core as oc  # noqa: E402

ROOT = Path(__file__).parent
GOV_PATH = ROOT / "Indian Agriculture Crop Production and yield (GOV)" / "Indian_crop_production_yield_dataset.csv"
DEMO_PATH = ROOT / "sample_data" / "synthetic_crop_data_demo.csv"
MINI_PATH = ROOT / "sample_data" / "synthetic_minimal_farm.csv"

# Categorical palette in fixed order (validated reference palette; slot 1 / slot 2 / slot 3)
HIST, OPT, THIRD = "#2a78d6", "#eb6834", "#1baf7a"
NEUTRAL = "#8a8984"
SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]
DIVERGING = [[0, "#eb6834"], [0.5, "#e9e8e4"], [1, "#2a78d6"]]

st.set_page_config(page_title="Optimal Crop-Area Allocation (OR)", page_icon="🌾", layout="wide")


def style(fig, height=420, legend=True):
    fig.update_layout(height=height, margin=dict(l=10, r=10, t=50, b=10),
                      font=dict(size=13), hoverlabel=dict(font_size=13),
                      legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0) if legend else None,
                      showlegend=legend)
    fig.update_xaxes(showgrid=False)
    fig.update_yaxes(gridcolor="rgba(128,128,128,0.18)", zeroline=False)
    return fig


def show(fig):
    st.plotly_chart(fig, width="stretch")


def fmt(x, d=0):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "–"
    return f"{x:,.{d}f}"


# =========================================================================
# Data loading (cached)
# =========================================================================
@st.cache_data(show_spinner="Reading file…")
def read_any(src, name: str) -> pd.DataFrame:
    if name.lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(src)
    return pd.read_csv(src, low_memory=False)


@st.cache_data(show_spinner="Cleaning data…")
def prepare(raw: pd.DataFrame, colmap: tuple, drop_zero: bool, merge_alias: bool, drop_agg: bool,
            reconcile: bool):
    df = oc.standardise(raw, dict(colmap))
    d, rep = oc.clean(df, drop_zero, merge_alias, drop_agg, reconcile)
    return d, rep.as_frame(), rep.rows_in, rep.stacked


# =========================================================================
# Sidebar — data source & scope
# =========================================================================
st.sidebar.title("🌾 Crop-Area LP")
st.sidebar.caption("Operations Research · Linear Programming on Govt. of India crop data")

src = st.sidebar.radio("1 · Data source",
                       ["Synthetic demo dataset", "Bundled GOV dataset (575k rows)", "Upload my own file"],
                       help="The faculty can upload any CSV / Excel file here.")
raw, src_name = None, ""
if src.startswith("Upload"):
    up = st.sidebar.file_uploader("CSV or Excel", type=["csv", "xlsx", "xls"])
    if up is not None:
        raw, src_name = read_any(up, up.name), up.name
elif src.startswith("Bundled"):
    if GOV_PATH.exists():
        raw, src_name = read_any(str(GOV_PATH), GOV_PATH.name), "GOV dataset"
    else:
        st.sidebar.error("GOV CSV not found next to app.py.")
else:
    raw, src_name = read_any(str(DEMO_PATH), DEMO_PATH.name), "Synthetic demo"

with st.sidebar.expander("Sample files to download & upload"):
    for p in [DEMO_PATH, MINI_PATH]:
        if p.exists():
            st.download_button(f"⬇ {p.name}", p.read_bytes(), p.name, "text/csv", width="stretch")

if raw is None:
    st.title("Optimal Crop-Area Allocation for Agricultural Resource Planning")
    st.info("⬅ Upload a CSV/Excel file (or pick a bundled dataset) to begin. "
            "Minimum columns: **Crop, Area, Production**. Optional: State, District, Year, Season, Yield.")
    st.stop()

# ---- column mapping --------------------------------------------------------
guess = oc.guess_column_map(raw.columns)
with st.sidebar.expander("2 · Column mapping", expanded=not all(k in guess for k in ["Crop", "Area", "Production"])):
    st.caption("Auto-detected; change if your file uses other names.")
    opts = ["(none)"] + list(raw.columns)
    colmap = {}
    for canon in oc.CANONICAL:
        default = guess.get(canon, "(none)")
        sel = st.selectbox(canon, opts, index=opts.index(default), key=f"map_{canon}")
        if sel != "(none)":
            colmap[canon] = sel

with st.sidebar.expander("3 · Cleaning rules"):
    drop_zero = st.checkbox("Drop Production = 0 rows", True)
    merge_alias = st.checkbox("Merge crop-name variants (Paddy→Rice …)", True)
    drop_agg = st.checkbox("Drop aggregate rows (Total foodgrain …)", True)
    reconcile = st.checkbox("Reconcile stacked duplicate source (×100 copy)", True,
                            help="The GOV CSV contains most 1997-2015 records twice: once in tonnes and "
                                 "once with Production ×100. Untick to see the raw (broken) behaviour.")

try:
    data, clean_rep, rows_in, stacked = prepare(raw, tuple(sorted(colmap.items())), drop_zero, merge_alias,
                                                drop_agg, reconcile)
except ValueError as e:
    st.error(f"Column mapping problem: {e}. Fix it in **2 · Column mapping** in the sidebar.")
    st.stop()
if data.empty:
    st.error("No usable rows after cleaning.")
    st.stop()

# ---- scope (slide 4: single state, single season, multi-year average) -----
st.sidebar.markdown("**4 · Planning scope**")
states = sorted(data["State_Name"].unique())
default_state = "Karnataka" if "Karnataka" in states else states[0]
state = st.sidebar.selectbox("State", states, index=states.index(default_state))
d_state = data[data["State_Name"] == state]
seasons = sorted(d_state["Season"].unique())
season = st.sidebar.selectbox("Season", seasons, index=seasons.index("Kharif") if "Kharif" in seasons else 0)
districts_all = sorted(d_state["District_Name"].unique())
districts = st.sidebar.multiselect("District(s) — empty = whole state", districts_all)
ymin, ymax = int(data["Crop_Year"].min()), int(data["Crop_Year"].max())
if ymin < ymax:
    # default window = years with reasonably complete coverage (drops partial edge years such as 2020)
    rpy = data.groupby("Crop_Year").size()
    full = rpy[rpy >= 0.65 * rpy.median()].index
    years = st.sidebar.slider("Crop years to average", ymin, ymax, (int(full.min()), int(full.max())),
                              help="Default excludes partial-coverage years (GOV: 1997 and 2020 have far "
                                   "fewer records). Yields are averaged over this window.")
else:
    years = (ymin, ymax)

st.sidebar.markdown("**5 · Model settings**")
yield_label = st.sidebar.selectbox("Yield coefficient y_c", ["Mean of yearly yields (deck)",
                                                             "Median of yearly yields (robust)",
                                                             "Area-weighted (ΣP / ΣA)"])
yield_method = {"Mean": "mean", "Medi": "median", "Area": "weighted"}[yield_label[:4]]
bound_label = st.sidebar.selectbox("Crop bounds a_c ≤ x_c ≤ m_c", ["Historical min / max area (deck)",
                                                                   "± band around historical average"])
bound_mode = "historical" if bound_label.startswith("Hist") else "band"
band_pct = st.sidebar.slider("Band ± %", 5, 100, 30, 5) if bound_mode == "band" else 30
n_years = max(1, years[1] - years[0] + 1)
min_years = st.sidebar.slider("Min. years of data per crop", 1, n_years, max(1, round(0.67 * n_years)),
                              help="Default: a crop must be observed in ≥ 2/3 of the years in the window; "
                                   "rarer crops give unstable averages and are dropped.")
ratio_thr = st.sidebar.number_input("Unit-check scale threshold (× pool median)", 10.0, 10000.0, 250.0, 10.0)

scope = oc.filter_scope(data, state, districts, season, years)
scope_label = f"{state} · {season} · {', '.join(districts) if districts else 'all districts'} · {years[0]}–{years[1]}"
if scope.empty:
    st.warning("No rows in this scope — widen the filters.")
    st.stop()

# ---- unit check & coefficients (shared by all LP tabs) --------------------
unit = oc.unit_check(scope, ratio_thr)
pool_default = unit.loc[unit["status"] == "Pool", "Crop"].tolist()

st.title("Optimal Crop-Area Allocation for Agricultural Resource Planning")
st.caption(f"Linear Programming on district-level crop production data · **Source:** {src_name} · "
           f"**Scope:** {scope_label}")

tabs = st.tabs(["📋 Data & Quality", "📊 Exploratory Insights", "⚖️ Unit Check & Coefficients",
                "📈 Opt 1 · Max Output", "🌱 Opt 2 · Min Land", "🔬 Sensitivity",
                "🗺️ Multi-District", "📘 Method"])

# =========================================================================
# TAB 1 — Data & Quality
# =========================================================================
with tabs[0]:
    c = st.columns(6)
    c[0].metric("Rows (raw)", fmt(rows_in))
    c[1].metric("Rows (clean)", fmt(len(data)))
    c[2].metric("States", data["State_Name"].nunique())
    c[3].metric("Districts", data["District_Name"].nunique())
    c[4].metric("Crops", data["Crop"].nunique())
    c[5].metric("Years", f"{ymin}–{ymax}")

    left, right = st.columns([1.1, 1])
    if stacked:
        st.info(f"**Data quirk found and fixed — stacked duplicate source.** {stacked['pairs']:,} records "
                 f"(same state, district, year, season, crop *and* area) appear twice, the second copy with "
                 f"Production × {stacked['factor']:,} ({100 * stacked['share_with_factor']:.1f} % of pairs). "
                 f"Rows from #{stacked['boundary_row']:,} onward were rescaled ÷ {stacked['factor']:,} and the "
                 f"twins dropped, so every row is now in one unit (GOV: tonnes, yield in t/ha). Without this, "
                 f"pre-2015 years would be double-counted and yields would mix two scales.", icon="🛠️")
    with left:
        st.subheader("Cleaning log")
        st.dataframe(clean_rep, hide_index=True, width="stretch")
        st.caption("Workflow step 2 (slide 14): filter & clean rows before any coefficient is built.")
    with right:
        st.subheader("Raw column profile")
        prof = pd.DataFrame({"dtype": raw.dtypes.astype(str), "missing": raw.isna().sum(),
                             "unique": raw.nunique()})
        st.dataframe(prof, width="stretch")

    st.subheader("Records by season and by year")
    a, b = st.columns(2)
    sc = data["Season"].value_counts().reset_index()
    sc.columns = ["Season", "Rows"]
    a.plotly_chart(style(px.bar(sc, x="Season", y="Rows", title="Rows per season",
                                color_discrete_sequence=[HIST]), 330, False), width="stretch")
    yc = data.groupby("Crop_Year").size().reset_index(name="Rows")
    b.plotly_chart(style(px.bar(yc, x="Crop_Year", y="Rows", title="Rows per crop year",
                                color_discrete_sequence=[HIST]), 330, False), width="stretch")

    st.subheader("Data-quirk check: pooled yield per year (scope)")
    sb = oc.structural_break_check(oc.filter_scope(data, state, districts, season, None)
                                   [lambda x: x["Crop"].isin(pool_default)])
    fig = px.line(sb, x="Crop_Year", y="Pooled_yield", markers=True,
                  title="Area-weighted yield of poolable crops (ΣProduction / ΣArea), all years",
                  color_discrete_sequence=[HIST])
    fig.add_vrect(x0=years[0] - 0.5, x1=years[1] + 0.5, fillcolor=NEUTRAL, opacity=0.08, line_width=0,
                  annotation_text="years used", annotation_position="top left")
    show(style(fig, 360, False))
    jumps = sb[sb["YoY_change_%"].abs() > 40]
    if len(jumps):
        st.warning("⚠️ Year-on-year jumps > 40 % in pooled yield at: "
                   + ", ".join(f"{int(r['Crop_Year'])} ({r['YoY_change_%']:+.0f} %)" for _, r in jumps.iterrows())
                   + ". Jumps this large signal either a reporting-unit change or an extreme weather year — "
                     "keep the averaging window on one side of the break.")

    with st.expander("Preview cleaned rows in scope"):
        st.dataframe(scope.head(500), hide_index=True, width="stretch")
        st.download_button("⬇ Download scope as CSV", scope.to_csv(index=False).encode(), "scope_data.csv")

# =========================================================================
# TAB 2 — Exploratory insights (slide 10)
# =========================================================================
with tabs[1]:
    st.markdown("Slide 10 analysis plan: **yield by crop / district / year**, **area vs production by "
                "district**, **best-yield crop per district & season**.")
    state_season = oc.filter_scope(data, state, None, season, years)

    top_by = st.radio("Rank crops by", ["Area", "Production"], horizontal=True)
    agg = scope.groupby("Crop").agg(Area=("Area", "sum"), Production=("Production", "sum")).reset_index()
    agg = agg[agg["Crop"].isin(pool_default)].sort_values(top_by, ascending=True).tail(15)
    fig = px.bar(agg, x=top_by, y="Crop", orientation="h", color_discrete_sequence=[HIST],
                 title=f"Top crops by total {top_by.lower()} (poolable crops, {season})")
    show(style(fig, 460, False))

    st.subheader("Yield trend over years")
    crops_avail = sorted(scope["Crop"].unique())
    top3 = scope.groupby("Crop")["Area"].sum().sort_values(ascending=False).index[:3].tolist()
    pick = st.multiselect("Crops (max 3 for colour clarity; more → small multiples)", crops_avail, top3)
    if pick:
        yt = (oc.filter_scope(data, state, districts, season, None)
              .query("Crop in @pick").groupby(["Crop", "Crop_Year"])
              .agg(P=("Production", "sum"), A=("Area", "sum")).reset_index())
        yt["Yield"] = yt["P"] / yt["A"]
        if len(pick) <= 3:
            fig = px.line(yt, x="Crop_Year", y="Yield", color="Crop", markers=True,
                          color_discrete_sequence=[HIST, OPT, THIRD],
                          title="Yield per hectare by year (area-weighted)")
            show(style(fig, 400))
        else:
            fig = px.line(yt, x="Crop_Year", y="Yield", facet_col="Crop", facet_col_wrap=3,
                          color_discrete_sequence=[HIST], title="Yield per hectare by year")
            fig.update_yaxes(matches=None, showticklabels=True)
            show(style(fig, 260 * int(np.ceil(len(pick) / 3)), False))

    st.subheader("Area vs production — district by district")
    dd = state_season[state_season["Crop"].isin(pool_default)].groupby("District_Name").agg(
        Area=("Area", "sum"), Production=("Production", "sum")).reset_index()
    dd["Yield"] = dd["Production"] / dd["Area"]
    fig = px.scatter(dd, x="Area", y="Production", hover_name="District_Name", size="Yield",
                     color_discrete_sequence=[HIST], log_x=True, log_y=True,
                     title=f"{state} · {season}: each bubble = district (size = yield)")
    fig.update_traces(marker=dict(line=dict(width=2, color="white"), opacity=0.8))
    show(style(fig, 440, False))

    st.subheader("Yield heat-map: district × crop")
    hm = (state_season[state_season["Crop"].isin(pool_default)]
          .groupby(["District_Name", "Crop"]).agg(P=("Production", "sum"), A=("Area", "sum")).reset_index())
    hm["Yield"] = hm["P"] / hm["A"]
    topc = state_season.groupby("Crop")["Area"].sum().loc[lambda s: s.index.isin(pool_default)] \
        .sort_values(ascending=False).index[:12]
    piv = hm[hm["Crop"].isin(topc)].pivot(index="District_Name", columns="Crop", values="Yield")
    if not piv.empty:
        fig = px.imshow(piv, aspect="auto", color_continuous_scale=SEQ,
                        title="Average yield (top-12 crops by area); blank = not grown")
        show(style(fig, max(380, 22 * len(piv) + 120), False))

    st.subheader("Best-yield crop per district, per season")
    st.caption("Highest area-weighted yield among poolable crops grown on ≥ 1 % of the district's season area.")
    bs = oc.filter_scope(data, state, None, None, years)
    bs = bs[bs["Crop"].isin(oc.unit_check(bs, ratio_thr).query("status=='Pool'")["Crop"])]
    g = bs.groupby(["District_Name", "Season", "Crop"]).agg(P=("Production", "sum"), A=("Area", "sum")).reset_index()
    g["share"] = g["A"] / g.groupby(["District_Name", "Season"])["A"].transform("sum")
    g = g[g["share"] >= 0.01]
    g["Yield"] = g["P"] / g["A"]
    if not g.empty:
        best = g.loc[g.groupby(["District_Name", "Season"])["Yield"].idxmax()]
        st.dataframe(best.pivot(index="District_Name", columns="Season", values="Crop"), width="stretch")

    st.subheader("Yield variability (risk) per crop")
    cv = unit[unit["status"] == "Pool"].sort_values("cv").tail(20)
    fig = px.bar(cv, x="cv", y="Crop", orientation="h", color_discrete_sequence=[HIST],
                 title="Coefficient of variation of row-level yield (higher = less predictable)")
    show(style(fig, 460, False))

# =========================================================================
# TAB 3 — Unit check & coefficients (slides 8, 9, 11)
# =========================================================================
with tabs[2]:
    st.markdown("**Only crops reported in the same production unit may be pooled into one LP** "
                "(slides 8–9, assumption 1). Two independent tests:")
    st.markdown("- *Known convention*: data.gov.in reports Coconut in **nuts**, Cotton in **bales of 170 kg**, "
                "Jute/Mesta/Sannhamp in **bales of 180 kg**.\n"
                f"- *Data-driven*: a crop whose median yield is more than **{ratio_thr:,.0f}×** the pool median "
                "(or below 1/that) is a scale outlier.")
    u = unit.copy()
    u["include"] = u["status"] == "Pool"
    fig = px.bar(u.sort_values("median_yield"), x="median_yield", y="Crop", orientation="h", log_x=True,
                 color="status", color_discrete_map={"Pool": HIST, "Exclude": OPT},
                 title="Median yield per crop (log scale) — excluded crops sit on a different scale")
    show(style(fig, max(380, 20 * len(u) + 120)))
    st.dataframe(u[["Crop", "records", "median_yield", "mean_yield", "cv", "ratio_to_pool_median",
                    "status", "reason"]].round(3), hide_index=True, width="stretch")

    crops_sel = st.multiselect("Crops pooled into the LP (override if needed)",
                               sorted(unit["Crop"]), sorted(pool_default),
                               key=f"crops_sel|{src_name}|{state}|{season}|{districts}|{years}|{ratio_thr}")

    coef_raw = oc.build_coefficients(scope, crops_sel, yield_method, min_years)
    coef = oc.apply_bounds(coef_raw, bound_mode, band_pct)
    st.subheader("LP coefficients")
    st.caption("y_c = yield coefficient; a_c / m_c = bounds on hectares; hist_area = average yearly hectares "
               "actually planted (the allocation we compare against).")
    show_coef = coef.rename(columns={"lo": "LP lower bound", "hi": "LP upper bound"})
    st.dataframe(show_coef.round(3), hide_index=True, width="stretch")
    dropped = sorted(set(crops_sel) - set(coef["Crop"]))
    if dropped:
        st.caption(f"Dropped (fewer than {min_years} years of data): {', '.join(dropped)}")
    fig = px.bar(coef.sort_values("y_c"), x="y_c", y="Crop", orientation="h", error_x="yield_sd",
                 color_discrete_sequence=[HIST], title="Yield coefficient y_c ± year-to-year std. dev.")
    show(style(fig, max(360, 22 * len(coef) + 120), False))

if len(coef) < 2:
    for t in tabs[3:7]:
        with t:
            st.warning("Need at least 2 poolable crops with enough years to build an LP. Adjust scope/crops.")
    L_hist = D_hist = 0
else:
    L_hist, D_hist = oc.historical_baseline(coef)
    feas = oc.feasibility_bounds(coef)

# =========================================================================
# TAB 4 — Optimization 1: maximise output
# =========================================================================
def comparison_chart(alloc, title):
    a = alloc.sort_values("hist_area", ascending=True)
    fig = go.Figure()
    fig.add_bar(y=a["Crop"], x=a["hist_area"], name="Historical (avg)", orientation="h", marker_color=HIST)
    fig.add_bar(y=a["Crop"], x=a["x_opt"], name="LP optimal", orientation="h", marker_color=OPT)
    fig.add_scatter(y=a["Crop"], x=a["m_c"], mode="markers", name="Upper bound m_c",
                    marker=dict(symbol="line-ns-open", size=14, color=NEUTRAL, line=dict(width=2)))
    fig.update_layout(barmode="group", bargap=0.25, bargroupgap=0.08, title=title, xaxis_title="Hectares")
    return style(fig, max(380, 34 * len(a) + 140))


def alloc_table(alloc):
    t = alloc[["Crop", "y_c", "a_c", "m_c", "hist_area", "x_opt", "change_ha", "change_%",
               "hist_output", "opt_output", "reduced_cost", "bound_status"]].copy()
    return t.round(2)


if len(coef) >= 2:
    with tabs[3]:
        st.markdown("**Q1. Given a fixed land budget L, how many hectares per crop maximise total production?**")
        st.latex(r"\max Z=\sum_c y_c x_c \quad\text{s.t.}\quad \sum_c x_c\le L,\;\; a_c\le x_c\le m_c,\;\; x_c\ge 0")
        lc = st.columns([1.3, 1])
        L = lc[0].number_input("Land budget L (ha) — default = historical average total area",
                               min_value=0.0, value=float(round(L_hist)), step=float(max(1, round(L_hist / 100))))
        lc[1].info(f"Feasible range of L: **{fmt(feas['min_land'])} ha** (Σa_c) and up. "
                   f"Land beyond Σm_c = {fmt(feas['max_land'])} ha cannot be used.")
        r1 = oc.solve_max_output(coef, L)
        if not r1.ok:
            st.error(f"LP status: **{r1.status}** — L is below Σa_c = {fmt(feas['min_land'])} ha "
                     "(the minimum-area bounds alone need more land).")
        else:
            hist_out = D_hist
            k = st.columns(5)
            k[0].metric("Optimal output Z*", fmt(r1.objective))
            k[1].metric("Historical output", fmt(hist_out))
            k[2].metric("Output gain", f"{100 * (r1.objective - hist_out) / hist_out:+.2f} %")
            k[3].metric("Land used", fmt(r1.alloc['x_opt'].sum()), f"of L = {fmt(L)}", delta_color="off")
            k[4].metric("Shadow price of land λ*", fmt(r1.shadow_price, 3),
                        help="Extra output from one more hectare of land (dual value of the land constraint).")
            show(comparison_chart(r1.alloc, "Hectares per crop: historical vs LP-optimal"))

            a = r1.alloc.copy()
            a = a.sort_values("change_ha")
            fig = px.bar(a, x="change_ha", y="Crop", orientation="h", color_discrete_sequence=[OPT],
                         title="Re-allocation: change in hectares (optimal − historical)")
            fig.add_vline(x=0, line_color=NEUTRAL)
            show(style(fig, max(360, 26 * len(a) + 120), False))

            st.subheader("Solution table")
            st.dataframe(alloc_table(r1.alloc), hide_index=True, width="stretch")
            st.download_button("⬇ Download optimal plan (CSV)", r1.alloc.to_csv(index=False).encode(),
                               "opt1_max_output_plan.csv")

            st.subheader("Interpretation")
            up = r1.alloc[r1.alloc["change_ha"] > 1].sort_values("change_ha", ascending=False)
            dn = r1.alloc[r1.alloc["change_ha"] < -1].sort_values("change_ha")
            basic = r1.alloc[r1.alloc["bound_status"].str.startswith("basic")]
            st.markdown(
                f"- The LP **expands** {', '.join(up['Crop'].head(5))} and **shrinks** "
                f"{', '.join(dn['Crop'].head(5))}.\n"
                f"- Crops with y_c > λ* = {r1.shadow_price:,.3f} go to their upper bound; crops with y_c < λ* "
                f"stay at their lower bound. "
                + (f"**{basic['Crop'].iloc[0]}** is the marginal (basic) crop that absorbs the remaining land, "
                   f"so its yield *is* the shadow price.\n" if len(basic) else
                   "No crop is strictly between its bounds (the land constraint is degenerate or slack).\n")
                + f"- Every extra hectare of land would add ≈ **{r1.shadow_price:,.2f}** output units "
                  f"(valid until the marginal crop hits a bound — see Sensitivity tab).\n"
                f"- Reduced cost of a crop at its lower bound = how much its yield must rise before the LP "
                "would give it more land.")

            with st.expander("Show the LP model as solved (PuLP / CBC) and solver cross-check"):
                st.code(r1.lp_text, language="text")
                cc = st.columns(3)
                cc[0].metric("PuLP-CBC objective", fmt(r1.objective, 2))
                cc[1].metric("SciPy-HiGHS objective", fmt(r1.scipy_objective, 2))
                cc[2].metric("|difference| / Z*", f"{abs(r1.objective - r1.scipy_objective) / r1.objective:.2e}")
                st.caption(f"Shadow price — PuLP: {r1.shadow_price:.6f} · SciPy: {r1.scipy_shadow:.6f}")

# =========================================================================
# TAB 5 — Optimization 2: minimise land
# =========================================================================
    with tabs[4]:
        st.markdown("**Q2. To guarantee a minimum total production D, what is the smallest land footprint?**")
        st.latex(r"\min \sum_c x_c \quad\text{s.t.}\quad \sum_c y_c x_c\ge D,\;\; a_c\le x_c\le m_c,\;\; x_c\ge 0")
        dc = st.columns([1.3, 1])
        target_pct = dc[0].slider("Target D as % of historical output", 50, 150, 100, 1)
        D = D_hist * target_pct / 100
        dc[1].info(f"D = **{fmt(D)}** · achievable range: {fmt(feas['min_output'])} – {fmt(feas['max_output'])} "
                   "(Σy_c·a_c to Σy_c·m_c)")
        r2 = oc.solve_min_land(coef, D)
        if not r2.ok:
            st.error(f"LP status: **{r2.status}** — D exceeds the maximum achievable output "
                     f"Σ y_c m_c = {fmt(feas['max_output'])}.")
        else:
            k = st.columns(5)
            k[0].metric("Minimum land", f"{fmt(r2.objective)} ha")
            k[1].metric("Historical land", f"{fmt(L_hist)} ha")
            k[2].metric("Land saved", f"{fmt(L_hist - r2.objective)} ha",
                        f"{100 * (L_hist - r2.objective) / L_hist:.2f} %")
            k[3].metric("Output delivered", fmt(r2.alloc['opt_output'].sum()))
            k[4].metric("Shadow price of target μ*", f"{r2.shadow_price:.6f}",
                        help="Extra hectares needed per extra unit of production.")
            show(comparison_chart(r2.alloc, "Hectares per crop: historical vs least-land plan"))
            st.dataframe(alloc_table(r2.alloc), hide_index=True, width="stretch")
            st.download_button("⬇ Download least-land plan (CSV)", r2.alloc.to_csv(index=False).encode(),
                               "opt2_min_land_plan.csv")
            r1b = oc.solve_max_output(coef, r2.objective, use_pulp=False)
            if r1b.ok and r1b.shadow_price > 0:
                st.success(f"**Primal–dual link (slide 13):** solving Opt 1 with L = {fmt(r2.objective)} ha (this "
                           f"minimum land) gives back Z* = {fmt(r1b.objective)} ≈ D, and λ* = "
                           f"{r1b.shadow_price:.4f}, so 1/λ* = {1 / r1b.shadow_price:.6f} = μ*. The two models are the "
                           "same frontier read in opposite directions, priced by the same marginal crop.")
            with st.expander("Show the LP model as solved"):
                st.code(r2.lp_text, language="text")
                st.caption(f"PuLP: {r2.objective:,.2f} · SciPy: {r2.scipy_objective:,.2f}")

# =========================================================================
# TAB 6 — Sensitivity (Review III)
# =========================================================================
    with tabs[5]:
        st.subheader("1 · Parametric land budget — Z*(L)")
        Ls = np.linspace(feas["min_land"], feas["max_land"] * 1.05, 60)
        pl = oc.parametric_land(coef, Ls)
        fig = px.line(pl, x="L", y="Z", color_discrete_sequence=[HIST], markers=False,
                      title="Optimal output vs land budget (piecewise linear, concave)")
        fig.add_vline(x=L_hist, line_dash="dot", line_color=NEUTRAL, annotation_text="historical L")
        show(style(fig, 380, False))
        fig = px.line(pl, x="L", y="shadow_price", line_shape="hv", color_discrete_sequence=[OPT],
                      title="Shadow price of land λ*(L) — steps down as each crop hits its upper bound")
        show(style(fig, 320, False))

        st.subheader("2 · Parametric production target — Land*(D)")
        Ds = np.linspace(feas["min_output"], feas["max_output"], 60)
        pt = oc.parametric_target(coef, Ds)
        fig = px.line(pt, x="D", y="Land", color_discrete_sequence=[HIST],
                      title="Minimum land vs production target (convex)")
        fig.add_vline(x=D_hist, line_dash="dot", line_color=NEUTRAL, annotation_text="historical output")
        show(style(fig, 360, False))

        st.subheader("3 · Yield-coefficient ranging (Opt 1 at historical L)")
        rg, lam = oc.yield_ranging(coef, L_hist)
        st.caption(f"λ* = {lam:,.3f}. The optimal *basis* (which crops sit at max / min) is unchanged while each "
                   "y_c stays inside its allowable range.")
        st.dataframe(rg.replace(np.inf, np.nan).round(3), hide_index=True, width="stretch")

        st.subheader("4 · Weather / yield shock scenario")
        sc1, sc2 = st.columns([1, 2])
        shock = sc1.slider("Yield shock (%)", -40, 40, -15, 5)
        shock_crops = sc2.multiselect("Crops hit by the shock (empty = all)", coef["Crop"].tolist())
        rs = oc.yield_shock(coef, L_hist, shock, shock_crops or None)
        base = oc.solve_max_output(coef, L_hist, use_pulp=False)
        m = st.columns(3)
        m[0].metric("Z* baseline", fmt(base.objective))
        m[1].metric("Z* under shock", fmt(rs.objective), f"{100 * (rs.objective - base.objective) / base.objective:+.2f} %")
        changed = (rs.alloc["x_opt"] - base.alloc["x_opt"]).abs().sum()
        m[2].metric("Hectares re-allocated by LP", fmt(changed))
        if changed > 1:
            st.info("The shock changes the optimal crop mix — the plan is sensitive to these yields.")
        else:
            st.success("The optimal crop mix is unchanged — the plan is robust to this shock (only Z* scales).")

        st.subheader("5 · How much flexibility is needed? (bound-band sweep)")
        bb = oc.bound_band_sweep(coef_raw, [0, 5, 10, 15, 20, 30, 40, 50, 75, 100])
        fig = go.Figure()
        fig.add_scatter(x=bb["band_pct"], y=bb["output_gain_pct"], mode="lines+markers",
                        name="Opt 1: output gain %", line=dict(color=HIST, width=2), marker=dict(size=8))
        fig.add_scatter(x=bb["band_pct"], y=bb["land_saving_pct"], mode="lines+markers",
                        name="Opt 2: land saving %", line=dict(color=OPT, width=2), marker=dict(size=8))
        fig.update_layout(title="Gain when each crop may move only ±p % from its historical area",
                          xaxis_title="Allowed change per crop, ±%", yaxis_title="%")
        show(style(fig, 380))

# =========================================================================
# TAB 7 — Multi-district comparison (Review III)
# =========================================================================
    with tabs[6]:
        st.markdown(f"Both LPs solved **independently for every district** of {state} ({season}, "
                    f"{years[0]}–{years[1]}), each with its own yields, bounds, L and D = its historical values.")
        md_scope = oc.filter_scope(data, state, None, season, years)
        md = oc.multi_district(md_scope, coef["Crop"].tolist(), yield_method, bound_mode, band_pct, min_years)
        if md.empty:
            st.info("Not enough districts with ≥ 2 crops in this scope.")
        else:
            k = st.columns(4)
            k[0].metric("Districts solved", len(md))
            k[1].metric("Median output gain", f"{md['output_gain_pct'].median():.2f} %")
            k[2].metric("Median land saving", f"{md['land_saving_pct'].median():.2f} %")
            k[3].metric("Total extra output", fmt((md["opt_output"] - md["hist_output"]).sum()))
            mds = md.sort_values("output_gain_pct")
            fig = go.Figure()
            fig.add_bar(y=mds["District"], x=mds["output_gain_pct"], orientation="h", name="Output gain % (Opt 1)",
                        marker_color=HIST)
            fig.add_bar(y=mds["District"], x=mds["land_saving_pct"], orientation="h", name="Land saving % (Opt 2)",
                        marker_color=OPT)
            fig.update_layout(barmode="group", title="Potential improvement by district", xaxis_title="%")
            show(style(fig, max(420, 30 * len(md) + 140)))
            fig = px.scatter(md, x="land_L", y="output_gain_pct", hover_name="District", log_x=True,
                             color_discrete_sequence=[HIST], size="crops",
                             title="Is the gain related to district size? (bubble size = no. of crops)")
            fig.update_traces(marker=dict(line=dict(width=2, color="white")))
            show(style(fig, 380, False))
            st.dataframe(md.round(3), hide_index=True, width="stretch")
            st.download_button("⬇ Download district comparison", md.to_csv(index=False).encode(),
                               "multi_district_results.csv")

# =========================================================================
# TAB 8 — Method (mirrors the Review-I deck)
# =========================================================================
with tabs[7]:
    st.subheader("Problem")
    st.markdown("Land is fixed; crops differ sharply in yield. Using actual historical yield records, how should "
                "land be re-allocated across crops to get the most out of a fixed area?")
    st.subheader("Workflow (slide 14)")
    steps = ["Government crop-production dataset (or uploaded file)", "Filter state / district / season, clean rows",
             "Check production-unit consistency across crops", "Average yield/ha per crop across years",
             "Formulate LP (max output / min land)", "Solve — PuLP (CBC) and SciPy linprog (HiGHS)",
             "Compare vs historical allocation", "Sensitivity analysis & multi-district comparison"]
    st.markdown("\n".join(f"{i}. {s}" for i, s in enumerate(steps, 1)))
    st.subheader("Optimization 1 — maximise agricultural output")
    st.latex(r"\begin{aligned}\max\; Z &= \sum_{c} y_c x_c\\ \text{s.t.}\; \sum_c x_c &\le L "
             r"&&\text{(total cultivable land)}\\ a_c \le x_c &\le m_c \;\;\forall c &&\text{(historical min/max area)}\\"
             r" x_c &\ge 0 \;\;\forall c\end{aligned}")
    st.subheader("Optimization 2 — minimise land for a production target")
    st.latex(r"\begin{aligned}\min\; &\sum_{c} x_c\\ \text{s.t.}\; \sum_c y_c x_c &\ge D\\ a_c \le x_c &\le m_c "
             r"\;\;\forall c\\ x_c &\ge 0\end{aligned}")
    st.subheader("Notation")
    st.markdown("""
| Symbol | Meaning | From the data |
|---|---|---|
| $x_c$ | hectares allotted to crop *c* (decision) | — |
| $y_c$ | yield coefficient of crop *c* | average of yearly Yield (= Production/Area) |
| $a_c,\\,m_c$ | min / max hectares of crop *c* | min / max yearly area in the window |
| $L$ | land budget | default: average yearly total area of pooled crops |
| $D$ | production target | default: Σ y_c × average area (historical output) |
| $\\lambda^*$ | shadow price of land (Opt 1 dual) | extra output per extra hectare |
| $\\mu^*$ | shadow price of target (Opt 2 dual) | extra hectares per extra unit of output |
""")
    st.subheader("Why the solution has this shape")
    st.markdown("With one coupling constraint and box bounds, the LP is a *continuous knapsack*: rank crops by "
                "y_c, give every crop its minimum a_c, then fill the remaining land from the highest-yield crop down, "
                "each up to m_c. The crop where land runs out is the single basic variable, and its yield equals "
                "λ*. This is why the Sensitivity tab's Z*(L) curve is piecewise linear and concave with "
                "slopes equal to successive crop yields.")
    st.subheader("Assumptions & limitations (slide 16)")
    st.markdown("""
1. **Production units must match** — count/bale crops (Coconut, Cotton, Jute, Mesta, Sannhamp) are excluded when pooling.
2. **Historical averages** — weather variation is not modelled in the base LP (see the yield-shock scenario).
3. **Output, not profit** — the dataset has no cost or price field.
4. **Not modelled** — soil quality, irrigation, labour, crop rotation, price/demand shifts.
5. **Weight-based objective favours heavy crops** — which is why the bounds a_c, m_c matter so much.
""")
    st.caption("References: Taha (2017); Wankhade & Lunge (2012); Majeke et al. (2020); Supriya et al. (2022); "
               "Paidipati & Padi (2017); Liang (2023); MoA&FW, GoI — District-wise Season-wise Crop Production "
               "Statistics 1997–2020-21 (data.gov.in via Kaggle).")
