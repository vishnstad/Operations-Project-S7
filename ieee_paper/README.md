# IEEE paper: LaTeX source

| File | Purpose |
|---|---|
| `main.tex` | The paper, in IEEE conference format (`IEEEtran`). Two-column, with 10 figures and 6 tables, all cross-referenced. |
| `figures/*.pdf` | Vector figures used by `main.tex`. A `.png` copy of each is included for previews and slides. |
| `make_figures.py` | Regenerates every figure from the dataset via `../or_core.py`, at IEEE column width. |
| `ieee_paper_overleaf.zip` | `main.tex` plus `figures/`, ready to upload to Overleaf. |

## Figures and tables

* Fig. 1 (workflow) and Fig. 10 (dashboard architecture) are drawn in **TikZ** inside `main.tex`, so they need no image files.
* Figs. 2 and 7 span both columns (`figure*`). The other figures are single-column.

| Ref | Content | Source |
|---|---|---|
| Fig. 1 | Project workflow | TikZ |
| Fig. 2 | Stacked-duplicate-source defect (rows per year, raw vs reconciled yield) | `fig_stacked_source` |
| Fig. 3 | Production-unit check | `fig_unit_check` |
| Fig. 4 | Yield coefficients ± s.d. | `fig_coefficients` |
| Fig. 5 | Opt. 1 allocation vs historical | `fig_opt1_allocation` |
| Fig. 6 | Opt. 2 allocation vs historical | `fig_opt2_allocation` |
| Fig. 7 | Z\*(L) and shadow price λ\*(L) | `fig_parametric_land` |
| Fig. 8 | Gain vs allowed ±p% flexibility | `fig_band_sweep` |
| Fig. 9 | Multi-district comparison | `fig_multi_district` |
| Fig. 10 | Dashboard architecture | TikZ |
| Tables I–VI | Dataset, cleaning log, coefficients, model summary, shock scenarios, synthetic validation | in `main.tex` |

## Compile

**Overleaf (easiest):**
1. Go to New Project → Upload Project and upload `ieee_paper_overleaf.zip`.
2. Click Recompile. The compiler is pdfLaTeX, and Overleaf already includes `IEEEtran`.

**Local:** install TeX Live or MiKTeX, then run:

```bash
pdflatex main.tex
pdflatex main.tex     # second pass resolves the figure/table/equation references
```

The bibliography uses `thebibliography`, so BibTeX is not needed.

## Regenerate the figures

```bash
python ieee_paper/make_figures.py
```

Every number in the paper's tables comes from the same pipeline, `run_case_study.py` together with `../results/case_study_results.md`.

## Before submitting

The affiliation line says "Amrita Vishwa Vidyapeetham, Coimbatore". Edit it in `main.tex`, around line 45, if your campus differs, and add e-mail addresses if your faculty requires them.
