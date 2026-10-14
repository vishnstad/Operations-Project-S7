"""
webapp/server.py — FastAPI backend for the CropLP web interface.

All computation is delegated to ../or_core.py (the same engine used by the
report and the IEEE paper), so every number shown in
the browser is identical to the documented results.

Run:   python webapp/server.py        (opens http://127.0.0.1:8000)
"""
from __future__ import annotations

import asyncio
import functools
import io
import os
import sys
import threading
import uuid
import webbrowser
from pathlib import Path

import numpy as np
import orjson
import pandas as pd
import plotly
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
import or_core as oc  # noqa: E402

BUILTIN = {
    "demo": dict(label="Synthetic demo dataset", path=ROOT / "sample_data" / "synthetic_crop_data_demo.csv",
                 blurb="Fictional 'Demo Pradesh' — 6 districts, 3 seasons, 2008-2019, with planted data quirks."),
    "mini": dict(label="Minimal farm file", path=ROOT / "sample_data" / "synthetic_minimal_farm.csv",
                 blurb="Only 4 columns with different names — shows automatic column mapping."),
    "gov": dict(label="Government of India dataset",
                path=ROOT / "Indian Agriculture Crop Production and yield (GOV)" / "Indian_crop_production_yield_dataset.csv",
                blurb="575,879 district-season-year records, 1997-2020 (data.gov.in)."),
}
PLOTLY_JS = Path(plotly.__file__).parent / "package_data" / "plotly.min.js"


class ORJSON(Response):
    media_type = "application/json"

    def render(self, content) -> bytes:
        return orjson.dumps(content, option=orjson.OPT_SERIALIZE_NUMPY | orjson.OPT_NON_STR_KEYS)


def jr(fn):
    """Return route results through orjson (handles numpy types, NaN -> null)."""
    if asyncio.iscoroutinefunction(fn):
        @functools.wraps(fn)
        async def aw(*a, **k):
            out = await fn(*a, **k)
            return out if isinstance(out, Response) else ORJSON(out)
        return aw

    @functools.wraps(fn)
    def w(*a, **k):
        out = fn(*a, **k)
        return out if isinstance(out, Response) else ORJSON(out)
    return w


app = FastAPI(title="CropLP")
SESS: dict[str, dict] = {}
_RAW_CACHE: dict[str, pd.DataFrame] = {}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def records(df: pd.DataFrame, cols=None, rnd=6):
    if df is None or len(df) == 0:
        return []
    d = df if cols is None else df[[c for c in cols if c in df.columns]]
    d = d.copy()
    fl = d.select_dtypes(include="number").columns
    d[fl] = d[fl].replace([np.inf, -np.inf], np.nan)
    out = []
    for r in d.to_dict("records"):
        row = {}
        for k, v in r.items():
            if isinstance(v, (float, np.floating)):
                row[k] = None if np.isnan(v) else round(float(v), rnd)
            elif isinstance(v, (np.integer,)):
                row[k] = int(v)
            elif isinstance(v, (np.bool_,)):
                row[k] = bool(v)
            else:
                row[k] = v
        out.append(row)
    return out


def num(x):
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (np.isnan(x) or np.isinf(x)) else x


def get_sess(sid: str) -> dict:
    s = SESS.get(sid)
    if s is None:
        raise HTTPException(404, "Session expired — please load the data again.")
    return s


def new_session(raw: pd.DataFrame, name: str, source: str) -> dict:
    sid = uuid.uuid4().hex
    SESS[sid] = dict(raw=raw, name=name, source=source, data=None)
    guess = oc.guess_column_map(raw.columns)
    preview = raw.head(8).astype(object).where(raw.head(8).notna(), None)
    return dict(sid=sid, name=name, source=source, rows=len(raw), columns=list(map(str, raw.columns)),
                guess=guess, canonical=oc.CANONICAL, required=["Crop", "Area", "Production"],
                preview=records(preview))


# ---------------------------------------------------------------------------
# request models
# ---------------------------------------------------------------------------
class LoadReq(BaseModel):
    name: str


class Cleaning(BaseModel):
    drop_zero: bool = True
    merge_alias: bool = True
    drop_agg: bool = True
    reconcile: bool = True


class PrepareReq(BaseModel):
    sid: str
    colmap: dict[str, str]
    cleaning: Cleaning = Cleaning()


class Scope(BaseModel):
    state: str
    season: str
    districts: list[str] = []
    years: list[int]


class Settings(BaseModel):
    yield_method: str = "mean"
    bound_mode: str = "historical"
    band_pct: float = 30.0
    min_years: int | None = None
    ratio_thr: float = 250.0


class Ctx(BaseModel):
    sid: str
    scope: Scope
    settings: Settings = Settings()
    crops: list[str] | None = None


class OptReq(Ctx):
    L: float | None = None
    target_pct: float = 100.0


class SensReq(Ctx):
    shock: float = -15.0
    shock_crops: list[str] = []


# ---------------------------------------------------------------------------
# context builder shared by all analysis endpoints
# ---------------------------------------------------------------------------
def build_ctx(req: Ctx):
    s = get_sess(req.sid)
    data = s.get("data")
    if data is None:
        raise HTTPException(400, "Data not prepared yet.")
    sc, st = req.scope, req.settings
    years = tuple(sc.years)
    n_years = max(1, years[1] - years[0] + 1)
    min_years = st.min_years if st.min_years else max(1, round(0.67 * n_years))
    min_years = min(min_years, n_years)
    scope = oc.filter_scope(data, sc.state, sc.districts or None, sc.season, years)
    if scope.empty:
        raise HTTPException(400, "No records in this scope — widen the filters.")
    unit = oc.unit_check(scope, st.ratio_thr)
    pool_default = unit.loc[unit["status"] == "Pool", "Crop"].tolist()
    crops = [c for c in (req.crops if req.crops is not None else pool_default) if c in set(unit["Crop"])]
    coef_raw = oc.build_coefficients(scope, crops, st.yield_method, min_years)
    coef = oc.apply_bounds(coef_raw, st.bound_mode, st.band_pct)
    return dict(sess=s, data=data, scope=scope, unit=unit, pool_default=pool_default, crops=crops,
                coef_raw=coef_raw, coef=coef, min_years=min_years, years=years)


def need_lp(c):
    if len(c["coef"]) < 2:
        raise HTTPException(400, "At least 2 crops with enough years of data are needed for an LP. "
                                 "Add crops on the Crops page or widen the year window.")


# ---------------------------------------------------------------------------
# routes — data
# ---------------------------------------------------------------------------
@app.get("/api/builtin")
@jr
def builtin():
    return [dict(key=k, label=v["label"], blurb=v["blurb"], available=v["path"].exists(),
                 size_mb=round(v["path"].stat().st_size / 1e6, 1) if v["path"].exists() else None)
            for k, v in BUILTIN.items()]


@app.get("/api/sample/{key}")
def sample(key: str):
    if key not in ("demo", "mini"):
        raise HTTPException(404)
    p = BUILTIN[key]["path"]
    return FileResponse(p, filename=p.name, media_type="text/csv")


@app.post("/api/load")
@jr
def load(req: LoadReq):
    if req.name not in BUILTIN:
        raise HTTPException(404, "Unknown dataset")
    b = BUILTIN[req.name]
    if not b["path"].exists():
        raise HTTPException(404, f"File not found: {b['path'].name}")
    key = str(b["path"])
    if key not in _RAW_CACHE:
        _RAW_CACHE[key] = pd.read_csv(b["path"], low_memory=False)
    return new_session(_RAW_CACHE[key], b["label"], req.name)


@app.post("/api/upload")
@jr
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    name = file.filename or "upload"
    try:
        if name.lower().endswith((".xlsx", ".xls")):
            raw = pd.read_excel(io.BytesIO(content))
        else:
            # small files: sniff the delimiter (comma / semicolon / tab); big files: fast C parser
            raw = pd.read_csv(io.BytesIO(content), sep=None, engine="python") \
                if len(content) < 5_000_000 else pd.read_csv(io.BytesIO(content), low_memory=False)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Could not read the file: {e}")
    if raw.empty:
        raise HTTPException(400, "The file has no rows.")
    return new_session(raw, name, "upload")


@app.post("/api/prepare")
@jr
def prepare(req: PrepareReq):
    s = get_sess(req.sid)
    colmap = {k: v for k, v in req.colmap.items() if v}
    try:
        df = oc.standardise(s["raw"], colmap)
    except ValueError as e:
        raise HTTPException(400, str(e))
    c = req.cleaning
    data, rep = oc.clean(df, c.drop_zero, c.merge_alias, c.drop_agg, c.reconcile)
    if data.empty:
        raise HTTPException(400, "No usable rows remain after cleaning.")
    s["data"] = data

    hierarchy = {}
    for st_name, g in data.groupby("State_Name"):
        hierarchy[st_name] = dict(seasons=sorted(g["Season"].unique().tolist()),
                                  districts=sorted(g["District_Name"].unique().tolist()),
                                  rows=int(len(g)))
    rpy = data.groupby("Crop_Year").size()
    full = rpy[rpy >= 0.65 * rpy.median()].index
    states = sorted(hierarchy)
    default_state = "Karnataka" if "Karnataka" in hierarchy else max(hierarchy, key=lambda k: hierarchy[k]["rows"])
    seasons = hierarchy[default_state]["seasons"]
    default_season = "Kharif" if "Kharif" in seasons else seasons[0]
    raw = s["raw"]
    profile = [dict(column=str(cn), dtype=str(raw[cn].dtype), missing=int(raw[cn].isna().sum()),
                    unique=int(raw[cn].nunique())) for cn in raw.columns]
    return dict(
        kpis=dict(rows_raw=rep.rows_in, rows_clean=rep.rows_out, states=len(hierarchy),
                  districts=int(data["District_Name"].nunique()), crops=int(data["Crop"].nunique()),
                  year_min=int(data["Crop_Year"].min()), year_max=int(data["Crop_Year"].max())),
        cleaning=[dict(step=a, removed=b, why=w) for a, b, w in rep.steps],
        stacked=rep.stacked, hierarchy=hierarchy, states=states,
        default=dict(state=default_state, season=default_season,
                     years=[int(full.min()), int(full.max())]),
        rows_per_year=dict(x=rpy.index.tolist(), y=rpy.values.tolist()),
        rows_per_season=data["Season"].value_counts().to_dict(),
        profile=profile,
        preview=records(data.head(200)),
    )


# ---------------------------------------------------------------------------
# routes — analysis
# ---------------------------------------------------------------------------
@app.post("/api/explore")
@jr
def explore(req: Ctx):
    c = build_ctx(req)
    data, scope, pool = c["data"], c["scope"], c["pool_default"]
    sc = req.scope
    sp = scope[scope["Crop"].isin(pool)]

    # pooled yield over ALL years (quirk detector)
    sb = oc.structural_break_check(
        oc.filter_scope(data, sc.state, sc.districts or None, sc.season, None).query("Crop in @pool"))
    jumps = [dict(year=int(r.Crop_Year), pct=float(r["YoY_change_%"])) for _, r in sb.iterrows()
             if pd.notna(r["YoY_change_%"]) and abs(r["YoY_change_%"]) > 40]

    agg = sp.groupby("Crop").agg(Area=("Area", "sum"), Production=("Production", "sum")).reset_index()
    tot_area = agg["Area"].sum()
    agg["share"] = agg["Area"] / tot_area if tot_area else 0
    agg = agg.sort_values("Area", ascending=False)

    # yield trend for the top-8 crops by area (frontend lets the user pick)
    top8 = agg["Crop"].head(8).tolist()
    yt = (oc.filter_scope(data, sc.state, sc.districts or None, sc.season, None)
          .query("Crop in @top8").groupby(["Crop", "Crop_Year"])
          .agg(P=("Production", "sum"), A=("Area", "sum")).reset_index())
    yt["Yield"] = yt["P"] / yt["A"]
    trend = {cr: dict(x=g["Crop_Year"].tolist(), y=g["Yield"].round(4).tolist()) for cr, g in yt.groupby("Crop")}

    state_season = oc.filter_scope(data, sc.state, None, sc.season, tuple(sc.years))
    ss = state_season[state_season["Crop"].isin(pool)]
    dd = ss.groupby("District_Name").agg(Area=("Area", "sum"), Production=("Production", "sum"),
                                         crops=("Crop", "nunique")).reset_index()
    dd["Yield"] = dd["Production"] / dd["Area"]

    hm = ss.groupby(["District_Name", "Crop"]).agg(P=("Production", "sum"), A=("Area", "sum")).reset_index()
    hm["Yield"] = hm["P"] / hm["A"]
    topc = ss.groupby("Crop")["Area"].sum().sort_values(ascending=False).index[:12].tolist()
    piv = hm[hm["Crop"].isin(topc)].pivot(index="District_Name", columns="Crop", values="Yield")
    piv = piv.reindex(columns=topc)
    heat = dict(x=list(piv.columns), y=list(piv.index),
                z=[[None if pd.isna(v) else round(float(v), 4) for v in row] for row in piv.values])

    # best-yield crop per district & season (≥1% of the district-season area)
    bs = oc.filter_scope(data, sc.state, None, None, tuple(sc.years))
    bs = bs[bs["Crop"].isin(oc.unit_check(bs, req.settings.ratio_thr).query("status=='Pool'")["Crop"])]
    g = bs.groupby(["District_Name", "Season", "Crop"]).agg(P=("Production", "sum"), A=("Area", "sum")).reset_index()
    best = []
    if not g.empty:
        g["share"] = g["A"] / g.groupby(["District_Name", "Season"])["A"].transform("sum")
        g = g[g["share"] >= 0.01]
        g["Yield"] = g["P"] / g["A"]
        b = g.loc[g.groupby(["District_Name", "Season"])["Yield"].idxmax()]
        best = records(b.rename(columns={"District_Name": "District"})[["District", "Season", "Crop", "Yield"]])

    cv = c["unit"].query("status=='Pool'").sort_values("cv", ascending=False)

    insights = []
    if len(agg):
        t = agg.iloc[0]
        insights.append(f"{t['Crop']} is the dominant crop, covering {100 * t['share']:.0f}% of the pooled area.")
        top3 = agg.head(3)
        insights.append(f"The top 3 crops ({', '.join(top3['Crop'])}) cover {100 * top3['share'].sum():.0f}% of the area.")
    if len(dd) > 1:
        hi, lo = dd.loc[dd["Yield"].idxmax()], dd.loc[dd["Yield"].idxmin()]
        insights.append(f"Highest pooled yield: {hi['District_Name'].title()} ({hi['Yield']:.2f}/ha); "
                        f"lowest: {lo['District_Name'].title()} ({lo['Yield']:.2f}/ha).")
    if len(cv):
        insights.append(f"Most unpredictable yield: {cv.iloc[0]['Crop']} (CV {cv.iloc[0]['cv']:.2f}).")

    return dict(
        insights=insights, jumps=jumps,
        pooled=dict(x=sb["Crop_Year"].tolist(), y=sb["Pooled_yield"].round(4).tolist()),
        top_crops=records(agg.head(15)), trend=trend, trend_default=top8[:3],
        districts=records(dd), heat=heat, best=best,
        cv=records(cv.head(20), ["Crop", "cv", "median_yield"]),
    )


@app.post("/api/crops")
@jr
def crops(req: Ctx):
    c = build_ctx(req)
    coef = c["coef"]
    out = dict(
        unit=records(c["unit"], ["Crop", "records", "median_yield", "mean_yield", "cv", "ratio_to_pool_median",
                                 "status", "reason"]),
        pool_default=c["pool_default"], selected=c["crops"], min_years=c["min_years"],
        coef=records(coef.rename(columns={"lo": "lp_lo", "hi": "lp_hi"})),
        dropped=sorted(set(c["crops"]) - set(coef["Crop"])),
    )
    if len(coef) >= 2:
        L, D = oc.historical_baseline(coef)
        out["baseline"] = dict(L=L, D=D)
        out["feas"] = oc.feasibility_bounds(coef)
    return out


def interpret_max(r, D):
    a = r.alloc
    up = a[a["change_ha"] > 1].sort_values("change_ha", ascending=False)["Crop"].tolist()
    dn = a[a["change_ha"] < -1].sort_values("change_ha")["Crop"].tolist()
    basic = a[a["bound_status"].str.startswith("basic")]["Crop"].tolist()
    lam = r.shadow_price
    msgs = []
    if up:
        msgs.append(f"Give more land to {', '.join(up[:5])}{' and others' if len(up) > 5 else ''}.")
    if dn:
        msgs.append(f"Take land away from {', '.join(dn[:5])}{' and others' if len(dn) > 5 else ''}.")
    if basic:
        msgs.append(f"{basic[0]} is the 'marginal' crop: it absorbs whatever land is left, so its yield "
                    f"({lam:,.3f}/ha) sets the value of one extra hectare.")
    msgs.append(f"Every extra hectare of land would add about {lam:,.3f} units of output (shadow price λ*).")
    if D:
        msgs.append(f"Overall, the same land produces {100 * (r.objective - D) / D:+.1f}% compared with the "
                    "historical crop mix.")
    return msgs


def lp_payload(r):
    return dict(status=r.status, objective=num(r.objective), shadow=num(r.shadow_price),
                scipy_objective=num(r.scipy_objective), scipy_shadow=num(r.scipy_shadow),
                lp_text=r.lp_text, alloc=records(r.alloc))


@app.post("/api/optimize/max")
@jr
def opt_max(req: OptReq):
    c = build_ctx(req)
    need_lp(c)
    coef = c["coef"]
    Lh, Dh = oc.historical_baseline(coef)
    feas = oc.feasibility_bounds(coef)
    L = req.L if req.L is not None else Lh
    r = oc.solve_max_output(coef, L)
    out = dict(L=L, L_hist=Lh, D_hist=Dh, feas=feas, result=lp_payload(r))
    if r.ok:
        out["gain_pct"] = 100 * (r.objective - Dh) / Dh if Dh else None
        out["land_used"] = float(r.alloc["x_opt"].sum())
        out["explain"] = interpret_max(r, Dh)
    else:
        out["explain"] = [f"The minimum areas alone need {feas['min_land']:,.0f} ha, "
                          f"more than the {L:,.0f} ha available."]
    return out


@app.post("/api/optimize/min")
@jr
def opt_min(req: OptReq):
    c = build_ctx(req)
    need_lp(c)
    coef = c["coef"]
    Lh, Dh = oc.historical_baseline(coef)
    feas = oc.feasibility_bounds(coef)
    D = Dh * req.target_pct / 100
    r = oc.solve_min_land(coef, D)
    out = dict(D=D, L_hist=Lh, D_hist=Dh, feas=feas, result=lp_payload(r))
    if r.ok:
        out["saving_ha"] = Lh - r.objective
        out["saving_pct"] = 100 * (Lh - r.objective) / Lh
        a = r.alloc
        basic = a[a["bound_status"].str.startswith("basic")]["Crop"].tolist()
        r1b = oc.solve_max_output(coef, r.objective, use_pulp=False)
        out["duality"] = dict(L=r.objective, Z=num(r1b.objective), lam=num(r1b.shadow_price),
                              inv_lam=num(1 / r1b.shadow_price) if r1b.ok and r1b.shadow_price else None,
                              mu=num(r.shadow_price))
        out["explain"] = [
            f"The target of {D:,.0f} can be met on {r.objective:,.0f} ha — "
            f"{out['saving_ha']:,.0f} ha ({out['saving_pct']:.1f}%) less than historically used.",
            (f"{basic[0]} is the marginal crop; each extra unit of target needs {r.shadow_price:.5f} ha "
             "(shadow price μ*)." if basic else
             f"Each extra unit of target needs {r.shadow_price:.5f} ha (shadow price μ*)."),
            "The freed land could be left fallow, used for other seasons' crops, or for non-farm needs.",
        ]
    else:
        out["explain"] = [f"Even with every crop at its maximum area the output is only "
                          f"{feas['max_output']:,.0f}."]
    return out


@app.post("/api/sensitivity")
@jr
def sensitivity(req: SensReq):
    c = build_ctx(req)
    need_lp(c)
    coef = c["coef"]
    Lh, Dh = oc.historical_baseline(coef)
    feas = oc.feasibility_bounds(coef)
    pl = oc.parametric_land(coef, np.linspace(feas["min_land"], feas["max_land"] * 1.05, 80))
    pt = oc.parametric_target(coef, np.linspace(feas["min_output"], feas["max_output"], 60))
    rg, lam = oc.yield_ranging(coef, Lh)
    base = oc.solve_max_output(coef, Lh, use_pulp=False)
    rs = oc.yield_shock(coef, Lh, req.shock, req.shock_crops or None)
    moved = float((rs.alloc["x_opt"] - base.alloc["x_opt"]).abs().sum() / 2) if rs.ok and base.ok else None
    shock_alloc = []
    if rs.ok and base.ok:
        m = base.alloc[["Crop", "x_opt"]].merge(rs.alloc[["Crop", "x_opt"]], on="Crop", suffixes=("_base", "_shock"))
        shock_alloc = records(m)
    bb = oc.bound_band_sweep(c["coef_raw"], [0, 5, 10, 15, 20, 30, 40, 50, 75, 100])
    return dict(
        L_hist=Lh, D_hist=Dh,
        land=records(pl), target=records(pt),
        ranging=records(rg), lam=num(lam),
        shock=dict(pct=req.shock, base=num(base.objective), shocked=num(rs.objective),
                   change_pct=num(100 * (rs.objective - base.objective) / base.objective) if rs.ok else None,
                   moved_ha=moved, alloc=shock_alloc),
        band=records(bb),
    )


@app.post("/api/districts")
@jr
def districts(req: Ctx):
    c = build_ctx(req)
    sc, st = req.scope, req.settings
    md_scope = oc.filter_scope(c["data"], sc.state, None, sc.season, tuple(sc.years))
    md = oc.multi_district(md_scope, c["coef"]["Crop"].tolist() or c["crops"], st.yield_method,
                           st.bound_mode, st.band_pct, c["min_years"])
    if md.empty:
        return dict(rows=[], summary=None)
    summary = dict(n=len(md), median_gain=float(md["output_gain_pct"].median()),
                   median_saving=float(md["land_saving_pct"].median()),
                   extra_output=float((md["opt_output"] - md["hist_output"]).sum()),
                   best=md.iloc[0]["District"], worst=md.iloc[-1]["District"])
    return dict(rows=records(md), summary=summary)


# ---------------------------------------------------------------------------
# static frontend
# ---------------------------------------------------------------------------
@app.get("/vendor/plotly.min.js")
def plotly_js():
    return FileResponse(PLOTLY_JS, media_type="application/javascript",
                        headers={"Cache-Control": "max-age=86400"})


@app.get("/")
def index():
    return FileResponse(HERE / "static" / "index.html", headers={"Cache-Control": "no-cache"})


app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    url = f"http://127.0.0.1:{port}"
    if "--no-browser" not in sys.argv:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    print(f"\n  CropLP is running at {url}   (Ctrl+C to stop)\n")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
