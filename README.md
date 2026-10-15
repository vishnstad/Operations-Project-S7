# Optimal Crop-Area Allocation for Agricultural Resource Planning

*A linear-programming approach using district-level crop production data (Government of India).*
Operations Research project: Nitin Krishna V, Vishal Suresh, Manogna Challa, Gaurav Mahesh (Amrita School of AI).

This repository contains the full implementation of the approach in
`Optimal_Crop_Area_Allocation_OR_Review1 (V3).pdf`:

* the data pipeline (cleaning, unit check, yield averaging);
* both LP models (**max output** and **min land**), solved with PuLP and cross-checked with SciPy;
* the Review-III extensions (sensitivity analysis and multi-district comparison);
* an interactive web app with a simple tab-by-tab interface. Any CSV or Excel file can be uploaded, and every insight, plot and optimisation is recomputed live. It works fully offline.

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
| <http://127.0.0.1:8000/?load=demo> | Demo dataset, Data tab |
| <http://127.0.0.1:8000/?load=gov&page=max> | Government dataset, Maximise-output page (Karnataka · Kharif · 1998–2019) |
| <http://127.0.0.1:8000/?load=demo&page=whatif&theme=dark> | Sensitivity tab in dark mode |

Valid `page` values are `data`, `explore`, `crops`, `max`, `min`, `whatif` (Sensitivity), `districts` and `method`.

| Script | Purpose |
|---|---|
| `python generate_synthetic_data.py` | Regenerates the two test files in `sample_data/` (seeded, reproducible) |
| `python run_case_study.py` | Reproduces every number and figure in the report, writing to `results/` |
| `python ieee_paper/make_figures.py` | Regenerates the IEEE paper figures |

## 2. Folder structure

```
Project/
├── webapp/
│   ├── server.py                  FastAPI backend: wraps or_core.py as a JSON API
│   └── static/                    index.html · app.css · app.js (simple UI, Plotly.js served locally)
├── or_core.py                     All logic: cleaning, unit check, coefficients, LPs, sensitivity
├── generate_synthetic_data.py     Builds sample_data/*.csv
├── run_case_study.py              Builds results/* used in REPORT.md
├── requirements.txt · run_app.bat
├── README.md · REPORT.md
├── ieee_paper/                    IEEE LaTeX paper (main.tex), 4 figures, Overleaf zip
├── sample_data/
│   ├── synthetic_crop_data_demo.csv    "Demo Pradesh": 6 districts × 3 seasons × 2008-2019, with planted quirks
│   └── synthetic_minimal_farm.csv      only Crop/Year/Area_ha/Production_q (tests column mapping)
├── results/                       CSV tables, the 4 report figures, case_study_results.md
└── Indian Agriculture Crop Production and yield (GOV)/
    └── Indian_crop_production_yield_dataset.csv   (575,879 rows)
```

## 3. The web interface

A plain tab bar walks through the steps. Once data is loaded, a scope bar (State · Season · District · Years) applies to every page.

| Tab | What it shows | PPT slide |
|---|---|---|
| 1 · Data | Upload a file or pick the demo / Government dataset; cleaning steps, records per year, cleaned preview | 7–9 |
| 2 · Explore | Key insights, top crops, yield trend (up to 3 crops), district area vs production, best crop per district and season | 10 |
| 3 · Crops | Unit check and LP inputs per crop (y_c, a_c, m_c), crop on/off, yield chart; optional model settings | 8, 9, 11 |
| 4 · Maximise output | Optimization 1: land budget slider, gain, Z*, λ*, plain-English summary, historical vs optimal chart, solution table, the LP as solved, PuLP vs SciPy check | 11–12 |
| 5 · Minimise land | Optimization 2: target slider, land saved, μ*, duality check (1/λ* = μ*), plan | 13 |
| 6 · Sensitivity | Z*(L), λ*(L), gain under a ±p% band, yield ranging | Review III |
| 7 · Districts | Both models solved per district: gain, saving, table | Review III |
| Model | Formulation, symbols, assumptions, references | 3–6, 16, 18 |

Every table can be sorted by clicking a column header, and every result can be downloaded as CSV.

### Uploading data

The minimum columns are `Crop`, `Area` and `Production`. `State`, `District`, `Year`, `Season` and `Yield` are optional.

Column names are auto-detected (for example, `Production_q` is mapped to Production). If every required column is found, analysis starts straight away; otherwise the mapping screen highlights what is missing. CSV files separated by commas, semicolons or tabs are accepted, as are `.xlsx` and `.xls` files. If no Yield column is present, it is computed as Production ÷ Area.

## 4. Suggested demo during the review (≈5 minutes)

1. Start the app and click **Demo dataset**. The *Data* tab lists the planted quirks that were caught: 8 duplicates, 25 zero-production rows, 144 "Total foodgrain" aggregate rows and the Paddy→Rice alias.
2. **Crops.** Cotton is switched off automatically (*bales of 170 kg*). Change Season to *Whole Year* and Coconut (*nuts*) is excluded.
3. **Maximise output.** Drag the land slider and watch "What this means" change. Open *Solver cross-check* to see that PuLP and SciPy agree.
4. **Minimise land.** Move the target slider. The duality check shows 1/λ* = μ*.
5. **Sensitivity.** Show how output flattens and λ* falls in steps as land grows.
6. Click **Load different data** and upload `synthetic_minimal_farm.csv`, which has only 4 differently named columns. It is mapped automatically, and the gain (+12.07% with default settings) matches the RIVERBEND row of the full demo file.
7. Load the **Government of India data**. The yellow note on the *Data* tab reports the **duplicate-copy** problem the pipeline found and fixed (Report §5.2). With the defaults (Karnataka · Kharif · 1998–2019) the numbers match the report exactly: **+21.60%** output and **−23.86%** land.
