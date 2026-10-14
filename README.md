# Optimal Crop-Area Allocation for Agricultural Resource Planning

*A linear-programming approach using district-level crop production data (Government of India).*
Operations Research project: Nitin Krishna V, Vishal Suresh, Manogna Challa, Gaurav Mahesh (Amrita School of AI).

This repository contains the full implementation of the approach in
`Optimal_Crop_Area_Allocation_OR_Review1 (V3).pdf`:

* the data pipeline (cleaning, unit check, yield averaging);
* both LP models (**max output** and **min land**), solved with PuLP and cross-checked with SciPy;
* the Review-III extensions (sensitivity analysis and multi-district comparison);
* **CropLP**, an interactive web app with a guided step-by-step interface. Any CSV or Excel file can be uploaded, and every insight, plot and optimisation is recomputed live. It works fully offline.

The full write-up is in **[REPORT.md](REPORT.md)**. An **IEEE-format LaTeX paper** with all figures is in **[ieee_paper/](ieee_paper/README.md)**; upload `ieee_paper/ieee_paper_overleaf.zip` to Overleaf to compile it.

---

## 1. Quick start

```bash
pip install -r requirements.txt
python webapp/server.py        # or double-click run_app.bat on Windows
```

Your browser opens **<http://127.0.0.1:8000>** automatically. Press `Ctrl+C` in the terminal to stop.

**One-click demo links** (the server must be running):

| Link | Opens |
|---|---|
| <http://127.0.0.1:8000/?load=demo> | Demo dataset, Data-quality page |
| <http://127.0.0.1:8000/?load=gov&page=max> | Government dataset, Maximise-output page (Karnataka · Kharif · 1998–2019) |
| <http://127.0.0.1:8000/?load=demo&page=whatif&theme=dark> | What-if page in dark mode |

Valid `page` values are `data`, `explore`, `crops`, `max`, `min`, `whatif`, `districts` and `method`.

| Script | Purpose |
|---|---|
| `python generate_synthetic_data.py` | Regenerates the two test files in `sample_data/` (seeded, reproducible) |
| `python run_case_study.py` | Reproduces every number and figure in the report, writing to `results/` |
| `python ieee_paper/make_figures.py` | Regenerates the IEEE paper figures |
| `streamlit run app.py` (or `run_streamlit.bat`) | The earlier Streamlit prototype, kept for reference |

## 2. Folder structure

```
Project/
├── webapp/
│   ├── server.py                  FastAPI backend: wraps or_core.py as a JSON API
│   └── static/                    index.html · app.css · app.js (hand-built UI, Plotly.js served locally)
├── or_core.py                     All logic: cleaning, unit check, coefficients, LPs, sensitivity
├── app.py                         Legacy Streamlit prototype
├── generate_synthetic_data.py     Builds sample_data/*.csv
├── run_case_study.py              Builds results/* used in REPORT.md
├── requirements.txt · run_app.bat · run_streamlit.bat
├── README.md · REPORT.md
├── ieee_paper/                    IEEE LaTeX paper, figures, Overleaf zip
├── sample_data/
│   ├── synthetic_crop_data_demo.csv    "Demo Pradesh": 6 districts × 3 seasons × 2008-2019, with planted quirks
│   └── synthetic_minimal_farm.csv      only Crop/Year/Area_ha/Production_q (tests column mapping)
├── results/                       CSV tables + PNG figures + case_study_results.md
└── Indian Agriculture Crop Production and yield (GOV)/
    └── Indian_crop_production_yield_dataset.csv   (575,879 rows)
```

## 3. The CropLP interface

A left-hand **workflow sidebar** walks the user through eight steps. A sticky **scope bar** (State · Season · Districts · Years) and a **Model settings** drawer apply to every page.

| Step | What the user sees | Link to the deck |
|---|---|---|
| 1 · Load data | Drag-and-drop upload, demo or Government dataset. Column mapping is auto-detected and editable, with a file preview and cleaning switches. | Slide 7 |
| 2 · Data quality | KPI tiles, a "what we cleaned and why" list, the stacked-duplicate banner, records per year and season, a preview table | Slides 8–9, 14 |
| 3 · Explore | Auto-written insight cards, top crops, yield trends (pick up to 3 crops), pooled-yield consistency check, district bubble chart, district × crop heat-map, best crop per district and season, yield risk | Slide 10 |
| 4 · Crops & inputs | A toggle switch per crop with unit badges ("bales of 170 kg"), unit-check chart, y_c ± s.d., LP input table (CSV) | Slides 8, 9, 11 |
| 5 · Maximise output | Land slider, presets and an exact-value box. Gain, Z*, λ*, a plain-English summary, before/after chart, change per crop, solution table (CSV), the LP as solved, and a PuLP vs HiGHS check. | Slides 11–12 |
| 6 · Minimise land | Target slider (50–150%). Land saved, μ*, the plan, and a **duality check card** (1/λ* = μ*). | Slide 13 |
| 7 · What-if | Z*(L), the λ* step curve, Land*(D), a weather-shock simulator (pick crops), a flexibility (±p%) sweep, yield ranging in plain words | Review III |
| 8 · Compare districts | Gain and saving per district, crop diversity vs gain, most-expanded crop, sortable and searchable table (CSV) | Review III |
| How it works | Formulation, symbols, solution intuition, assumptions, glossary, references | Slides 3–6, 16, 18 |

Usability features:
* hover over any dotted-underlined term (shadow price, reduced cost, …) for a definition;
* the **?** button opens a quick guide and glossary;
* light and dark themes;
* works on a phone-width screen;
* every table is sortable and every result downloadable;
* infeasible inputs are explained in plain words, not shown as errors.

### Uploading data

The minimum columns are `Crop`, `Area` and `Production`. `State`, `District`, `Year`, `Season` and `Yield` are optional.

Column names are auto-detected (for example, `Production_q` is mapped to Production). If every required column is found, analysis starts straight away; otherwise the mapping screen highlights what is missing. CSV files separated by commas, semicolons or tabs are accepted, as are `.xlsx` and `.xls` files. If no Yield column is present, it is computed as Production ÷ Area.

## 4. Suggested demo during the review (≈5 minutes)

1. Start the app and click **Try the demo dataset**. The *Data quality* page lists the planted quirks that were caught: 8 duplicates, 25 zero-production rows, 144 "Total foodgrain" aggregate rows and the Paddy→Rice alias.
2. **Crops & inputs.** Cotton is switched off automatically (*bales of 170 kg*). Change Season to *Whole Year* and Coconut (*nuts*) is excluded.
3. **Maximise output.** Click *+10%* and *−20%* and watch the "What this means" panel change. Open *Solver cross-check* to see that PuLP and HiGHS agree.
4. **Minimise land.** Move the target slider. The duality card shows 1/λ* = μ*.
5. **What-if.** Pick one crop and drag the shock to −30% to see whether the plan changes or only the total output.
6. Click **New data** and upload `synthetic_minimal_farm.csv`, which has only 4 differently named columns. It is mapped automatically, and the gain (+12.07% with default settings) matches the RIVERBEND row of the full demo file.
7. Load the **Government of India data**. The orange banner reports the **stacked-duplicate-source** problem the pipeline found and fixed (Report §5.2). With the defaults (Karnataka · Kharif · 1998–2019) the numbers match the report exactly: **+21.60%** output and **−23.86%** land.
