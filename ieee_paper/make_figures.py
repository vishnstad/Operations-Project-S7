"""
make_figures.py — regenerate every figure of the IEEE paper at IEEE column width.

Single-column figures are 3.5 in wide, double-column (figure*) 7.16 in, 8-pt text,
saved as vector PDF in ./figures/.  All numbers come from ../or_core.py on the
GOV dataset, so the figures always match the tables in main.tex.

Run from anywhere:   python ieee_paper/make_figures.py
"""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
import or_core as oc  # noqa: E402

FIG = HERE / "figures"
FIG.mkdir(exist_ok=True)
GOV = ROOT / "Indian Agriculture Crop Production and yield (GOV)" / "Indian_crop_production_yield_dataset.csv"
STATE, SEASON, YEARS, MIN_YEARS = "Karnataka", "Kharif", (1998, 2019), 15

BLUE, ORANGE, GRAY = "#2a78d6", "#eb6834", "#8a8984"
COL, WIDE = 3.5, 7.16
plt.rcParams.update({
    "font.size": 8, "axes.titlesize": 8, "axes.labelsize": 8, "legend.fontsize": 7,
    "xtick.labelsize": 7, "ytick.labelsize": 7, "font.family": "serif",
    "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
    "grid.alpha": 0.25, "grid.linewidth": 0.5, "lines.linewidth": 1.4, "savefig.bbox": "tight",
    "savefig.pad_inches": 0.02, "pdf.fonttype": 42,
})


def save(fig, name):
    fig.savefig(FIG / f"{name}.pdf")
    plt.close(fig)


def main():
    raw = pd.read_csv(GOV)
    df = oc.standardise(raw, oc.guess_column_map(raw.columns))
    data, _ = oc.clean(df)
    raw_d, _ = oc.clean(df, reconcile_stacked=False)

    # Fig: stacked-source quirk (double column, 2 panels)
    pool = lambda x: x[x["Crop"].isin(oc.unit_check(x).query("status=='Pool'")["Crop"])]  # noqa: E731
    sb_raw, sb = oc.structural_break_check(pool(raw_d)), oc.structural_break_check(pool(data))
    rpy_raw, rpy = raw_d.groupby("Crop_Year").size(), data.groupby("Crop_Year").size()
    fig, ax = plt.subplots(1, 3, figsize=(WIDE, 1.9))
    ax[0].bar(rpy_raw.index - 0.2, rpy_raw.values / 1e3, 0.4, color=ORANGE, label="raw file")
    ax[0].bar(rpy.index + 0.2, rpy.values / 1e3, 0.4, color=BLUE, label="reconciled")
    ax[0].set_title("(a) Records per crop year"); ax[0].set_ylabel("thousand rows")
    ax[0].set_ylim(0, 40)
    ax[0].legend(frameon=False, loc="upper left", ncol=2, handlelength=1, columnspacing=0.8)
    ax[1].plot(sb_raw["Crop_Year"], sb_raw["Pooled_yield"], marker="o", ms=2.5, color=ORANGE)
    ax[1].set_title(r"(b) Raw pooled yield $\Sigma P/\Sigma A$")
    ax[2].plot(sb["Crop_Year"], sb["Pooled_yield"], marker="o", ms=2.5, color=BLUE)
    ax[2].set_title("(c) Reconciled pooled yield (t/ha)")
    for a in ax:
        a.set_xlabel("Crop year")
    fig.tight_layout(w_pad=1.0)
    save(fig, "fig_stacked_source")

    # scope, coefficients, solutions
    scope = oc.filter_scope(data, STATE, None, SEASON, YEARS)
    unit = oc.unit_check(scope)
    crops = unit.query("status=='Pool'")["Crop"].tolist()
    coef = oc.apply_bounds(oc.build_coefficients(scope, crops, "mean", MIN_YEARS), "historical")
    L, D = oc.historical_baseline(coef)
    feas = oc.feasibility_bounds(coef)
    r1, r2 = oc.solve_max_output(coef, L), oc.solve_min_land(coef, D)

    # Fig: Opt 1 allocation (single column)
    for r, name in [(r1, "fig_opt1_allocation")]:
        a = r.alloc.sort_values("hist_area")
        y = np.arange(len(a))
        fig, ax = plt.subplots(figsize=(COL, 3.3))
        ax.barh(y - 0.2, a["hist_area"] / 1e3, 0.38, color=BLUE, label="historical average")
        ax.barh(y + 0.2, a["x_opt"] / 1e3, 0.38, color=ORANGE, label="LP optimal")
        ax.scatter(a["m_c"] / 1e3, y, marker="|", s=40, color=GRAY, lw=1, label=r"upper bound $m_c$", zorder=3)
        ax.set_yticks(y, a["Crop"]); ax.set_xlabel("Thousand hectares"); ax.grid(axis="y", alpha=0)
        ax.legend(frameon=False, loc="lower right")
        save(fig, name)

    # Fig: parametric land (double column, 2 panels)
    pl = oc.parametric_land(coef, np.linspace(feas["min_land"], feas["max_land"] * 1.05, 120))
    fig, ax = plt.subplots(1, 2, figsize=(WIDE, 2.0))
    ax[0].plot(pl["L"] / 1e6, pl["Z"] / 1e6, color=BLUE)
    ax[0].axvline(L / 1e6, ls=":", color=GRAY, lw=1)
    ax[0].annotate("historical $L$", (L / 1e6, pl["Z"].min() / 1e6), xytext=(4, 2), textcoords="offset points",
                   fontsize=7, color=GRAY)
    ax[0].set_xlabel("Land budget $L$ (million ha)"); ax[0].set_ylabel(r"$Z^*$ (million t)")
    ax[0].set_title(r"(a) Optimal output $Z^*(L)$")
    ax[1].step(pl["L"] / 1e6, pl["shadow_price"], where="post", color=ORANGE)
    ax[1].axvline(L / 1e6, ls=":", color=GRAY, lw=1)
    ax[1].set_xlabel("Land budget $L$ (million ha)"); ax[1].set_ylabel(r"$\lambda^*$ (t/ha)")
    ax[1].set_title(r"(b) Shadow price of land $\lambda^*(L)$")
    fig.tight_layout(w_pad=2)
    save(fig, "fig_parametric_land")

    # Fig: multi-district
    md = oc.multi_district(oc.filter_scope(data, STATE, None, SEASON, YEARS), crops, "mean", "historical",
                           30, MIN_YEARS).sort_values("output_gain_pct")
    y = np.arange(len(md))
    fig, ax = plt.subplots(figsize=(COL, 3.9))
    ax.barh(y - 0.2, md["output_gain_pct"], 0.38, color=BLUE, label="output gain (Opt. 1)")
    ax.barh(y + 0.2, md["land_saving_pct"], 0.38, color=ORANGE, label="land saving (Opt. 2)")
    ax.set_yticks(y, [d.title() for d in md["District"]]); ax.set_xlabel("%"); ax.grid(axis="y", alpha=0)
    ax.legend(frameon=False, loc="lower right")
    save(fig, "fig_multi_district")

    print(f"Opt1 gain {100 * (r1.objective - D) / D:.2f}%  Opt2 saving {100 * (L - r2.objective) / L:.2f}%  "
          f"districts {len(md)}")
    print("Figures written to", FIG)


if __name__ == "__main__":
    main()
