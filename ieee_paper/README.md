# IEEE paper: LaTeX source

A short IEEE conference paper (`IEEEtran`). It follows the structure, formulation and references of the Review-I deck, `Optimal_Crop_Area_Allocation_OR_Review1 (V3).pdf`, and adds the computed results.

| File | Purpose |
|---|---|
| `main.tex` | The paper: 5 figures, 4 tables and the deck's 7 references only |
| `figures/*.pdf` | Vector figures used by `main.tex`. A `.png` copy of each is also included. |
| `make_figures.py` | Regenerates the figures from the dataset via `../or_core.py` |
| `ieee_paper_overleaf.zip` | `main.tex` plus the 4 figure PDFs it uses, ready to upload to Overleaf |

## Figures and tables

| Ref | Content |
|---|---|
| Table I | Related work (the deck's literature table) |
| Table II | Data cleaning |
| Fig. 1 | Records per year and pooled yield, raw vs cleaned (`fig_stacked_source`) |
| Fig. 2 | Project workflow (drawn in TikZ, as on the deck's workflow slide) |
| Table III | Optimal vs historical allocation |
| Fig. 3 | Opt. 1 allocation (`fig_opt1_allocation`) |
| Fig. 4 | Output and value of land vs land budget (`fig_parametric_land`) |
| Fig. 5 | Multi-district comparison (`fig_multi_district`) |

## Compile

**Overleaf:** go to New Project → Upload Project, upload `ieee_paper_overleaf.zip`, then click Recompile (pdfLaTeX).

**Local:** run `pdflatex main.tex` twice.

## References

Only the deck's seven references are used: Taha; Wankhade & Lunge; Majeke et al.; Supriya et al.; Paidipati & Padi; Liang; and MoA&FW (data.gov.in).
