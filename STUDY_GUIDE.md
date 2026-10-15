# Study Guide: Optimal Crop-Area Allocation with Linear Programming

This guide teaches the whole project from zero. Read it top to bottom once, and you should be able to explain every equation, every number, every graph, and point to the exact line of code that produces it.

**How to use it:** read one part at a time. Keep the web app open beside the guide: start it with `python webapp/server.py` (or double-click `run_app.bat`) and it opens http://127.0.0.1:8000 on **Karnataka · Kharif**, the case used everywhere below. Each part ends with a **▶ Try it in the app** box telling you which page to open and what to look for. Links like [or_core.py#L314](or_core.py#L314) jump to the exact line on GitHub.

### Study plan (about 3½ hours, three sittings)

| Sitting | Parts | Goal | Time |
|---|---|---|---|
| **1 · Understand the problem** | 1 The problem · 2 LP from scratch · 3 The dataset | explain *what* we solve and *why this data* | 50 min |
| **2 · Understand the models** | 4 Data → LP numbers · 5 Optimization 1 · 6 Optimization 2 · 7 Results | derive both models and read every result | 70 min |
| **3 · Defend the project** | 8 Sensitivity · 9 Districts & validation · 10 Code & paper map · 11 Faculty questions · 12 Cheat sheet | answer "how sure are you?" and any code question | 75 min |

Before a review, read **Part 11** (questions) and **Part 12** (cheat sheet) only. That takes 20 minutes.

### One map: PPT → paper → this guide → app → code

Use this table when the faculty points at a slide and asks "where is this?"

| PPT slide | Topic | IEEE paper ([main.tex](ieee_paper/main.tex)) | This guide | App page | Main code |
|---|---|---|---|---|---|
| 3 | Problem statement | §I Introduction | Part 1 | Overview | — |
| 4 | Objectives & scope | §I | Part 1 | Overview | — |
| 5–6 | Literature review, research gap | §II, Table I | Part 3.2 | — | — |
| 7–8 | Dataset, real rows | §III, Table II | Part 3.1 | Data | [or_core.py#L71](or_core.py#L71) |
| 9 | Why this dataset (nuts, no prices) | §III-A, §III-B, Table III | Parts 3.2–3.3 | Data | `clean()` [L204](or_core.py#L204), `unit_check()` [L270](or_core.py#L270) |
| 10 | What we analyse | §V | Parts 7, 9 | Data, Crops, Districts | — |
| 11–12 | Optimization 1 + formulation | §IV-B, eq. (2), Table IV | Part 5 | Results → Model 1 | `solve_max_output()` [L483](or_core.py#L483) |
| 13 | Optimization 2 | §IV-C, eq. (3), Table IV | Part 6 | Results → Model 2 | `solve_min_land()` [L488](or_core.py#L488) |
| 14 | Workflow | §V, Fig. 2 | Part 10.3 | all pages | whole of `or_core.py` |
| 15 | Tools | §V, Table V | Part 10.1 | — | — |
| 16 | Assumptions & limitations | §IX | Parts 7, 11 | Model inputs → Assumptions | — |
| 17 | Work plan (Reviews I–III) | §V, Table VI | Parts 8–9 (Review III) | Sensitivity, Districts | [L528–L603](or_core.py#L528) |
| 18 | References | References | Part 12 | — | — |
| *(new)* | Pulse-share constraint | §IV-E, eq. (4), §VII | Part 8.5 | Model inputs | `lp_model()` [L423](or_core.py#L423) |

| Part | Topic | Time |
|---|---|---|
| 1 | The problem in plain words | 5 min |
| 2 | Linear programming from scratch | 20 min |
| 3 | The dataset and its problems | 25 min |
| 4 | From raw data to LP numbers | 15 min |
| 5 | Optimization 1: maximise output | 25 min |
| 6 | Optimization 2: minimise land | 15 min |
| 7 | Results for Karnataka | 15 min |
| 8 | Sensitivity analysis and the pulse constraint | 25 min |
| 9 | District comparison and validation | 10 min |
| 10 | How the code and the paper fit together | 15 min |
| 11 | Likely faculty questions | 20 min |
| 12 | Cheat sheet and glossary | 5 min |

---

## Part 1 · The problem in plain words

A state has a fixed amount of farmland. Every season, farmers split it among crops such as rice, maize, ragi and groundnut. Each crop produces a different amount per hectare (its **yield**). Today the split is mostly decided by habit.

**Our question:** if we use the government's own historical records, how *should* the land be split so that we get the most out of it?

We answer it in two ways, as in the PPT:

1. **Optimization 1 (maximise output):** keep the land fixed. Which split gives the most total production?
2. **Optimization 2 (minimise land):** keep the production fixed. What is the smallest area that still produces it?

Both are solved with **linear programming (LP)**, a core Operations Research method.

**What we do not do:** the dataset has no prices or costs, so we never talk about profit. We optimise tonnes and hectares only.

**Scope (PPT slide 4):** one state, one season, yields averaged over many years, and only crops measured in the same unit (weight) go into one LP.

> **▶ Try it in the app:** open **Overview**. The *Problem*, *Approach*, *Scope* and *Questions* cards are this part in four boxes. The India map shows Model 1's output gain for every state in the chosen season; click any state to load it.

---

## Part 2 · Linear programming from scratch

### 2.1 The three ingredients of every LP

Every LP has exactly three parts:

| Ingredient | Question it answers | In our project |
|---|---|---|
| **Decision variables** | What can we choose? | $x_c$ = hectares given to crop $c$ |
| **Objective function** | What are we trying to maximise or minimise? | total output, or total land |
| **Constraints** | What limits our choices? | land available, production target, and min/max area for each crop |

It is called **linear** because the objective and constraints only add up variables multiplied by constants. There is never $x^2$, $x \cdot y$ or $\sqrt{x}$. "2 tonnes per hectare × 100 hectares = 200 tonnes" is linear.

### 2.2 A two-crop picture

Suppose there are 2 crops and 10 hectares:

* maximise $3x_1 + 2x_2$ (crop 1 yields 3 t/ha, crop 2 yields 2 t/ha);
* subject to $x_1 + x_2 \le 10$, $x_1 \le 6$, and $x_1, x_2 \ge 0$.

Every pair $(x_1, x_2)$ that satisfies all the constraints is a **feasible** plan. Together they form a polygon called the **feasible region**. A key LP theorem says the best plan is always at a **corner** of this polygon. The **simplex method** (Taha, Ch. 3) walks from corner to corner, improving each time.

Here the answer is: give crop 1 as much as allowed ($x_1 = 6$), then give the rest to crop 2 ($x_2 = 4$). Output = $18 + 8 = 26$ t.

That "fill the best crop first" pattern is exactly what happens in our project, just with 19 crops instead of 2.

### 2.3 Shadow price (dual value): the most important OR idea here

Ask: *if we had one more hectare, how much more output would we get?*

In the example, the 11th hectare would go to crop 2 (crop 1 is already at its limit of 6), so output rises by **2 t**. That 2 is the **shadow price** of the land constraint. Solvers report it automatically as the constraint's **dual value**.

* A shadow price tells you **what one more unit of a resource is worth**.
* We write it as $\lambda^*$ (lambda-star) for land in Optimization 1, and $\mu^*$ (mu-star) for the production target in Optimization 2.

### 2.4 Reduced cost

For a crop stuck at its minimum, the **reduced cost** says how much better its yield would need to be before the LP would give it more land. For a crop at its maximum, it says how much better than the cut-off it is. We report it per crop in the solution table.

---

## Part 3 · The dataset and its problems

### 3.1 What it is

| | |
|---|---|
| **Name** | District-wise, Season-wise Crop Production Statistics |
| **Source** | Ministry of Agriculture & Farmers Welfare, Govt. of India (data.gov.in), via Kaggle |
| **File** | `Indian Agriculture Crop Production and yield (GOV)/Indian_crop_production_yield_dataset.csv` |
| **Size** | 575,879 rows × 8 columns |
| **Coverage** | 36 states/UTs, about 730 districts, about 100 crops, crop years 1997–2020 |
| **Columns** | `State_Name`, `District_Name`, `Crop_Year`, `Season`, `Crop`, `Area`, `Production`, `yield` |
| **Seasons** | Kharif, Rabi, Whole Year, Autumn, Summer, Winter |

Real rows (PPT slide 8, paper Table II):

| State | District | Year | Season | Crop | Area (ha) | Production | Yield |
|---|---|---|---|---|---|---|---|
| A. & N. Islands | Nicobars | 2000 | Kharif | Arecanut | 1,254 | 2,000 | 1.60 |
| A. & N. Islands | Nicobars | 2000 | Kharif | Rice | 102 | 321 | 3.15 |
| A. & N. Islands | Nicobars | 2001 | Whole Year | Cashewnut | 719 | 192 | 0.27 |
| A. & N. Islands | Nicobars | 2001 | Whole Year | **Coconut** | 18,190 | **64,430,000** | **3,542.06** |

$$\text{Yield} = \frac{\text{Production}}{\text{Area}}$$

**Look at the Coconut row.** Its yield is about 1,000× larger than rice's, because coconut is counted in **nuts**, not tonnes. If you added it to rice tonnes, the LP would give all land to coconut. This one row is why we unit-check crops before pooling them (Part 3.3, problem 5).

### 3.2 Why this dataset, and the research gap (PPT slides 5, 6 and 9)

* **It gives us:** Area, which becomes the land constraint; Yield, which becomes the output coefficient; and many years, so we average instead of guessing.
* **It does not give us:** prices or costs, so there is no profit objective.
* **Learning from earlier reviews (slide 9):** do not propose a method the data cannot support, and find data quirks *before* they break the model. That is why Part 3.3 exists.
* **Research gap (slides 5–6, paper §II, Table I):** the earlier LP crop studies (Wankhade & Lunge, Majeke, Supriya, Paidipati & Padi, Liang) each used a one-time survey of one district and assumed prices are known. None built the LP from a multi-year, multi-district government record. Ours does, so anyone can reproduce it from a public file.
* **Our positioning:** build the LP only from area, production and yield; leave cost and profit out rather than invent them.

### 3.3 The problems we found and fixed (cleaning)

Code: `clean()` at [or_core.py#L204](or_core.py#L204).

| # | Problem | Rows affected | Fix | Code |
|---|---|---|---|---|
| 1 | **Duplicate copy ×100.** The file is two copies stacked together. Rows from #236,378 onward repeat earlier records, but Production is exactly 100× larger. | 212,373 duplicate pairs | Rescale the second block ÷100, keep one copy | `reconcile_stacked_sources()` [L152](or_core.py#L152) |
| 2 | **Zero production.** Usually means "not reported", not real crop failure. | 3,634 | Drop | [L232–236](or_core.py#L232) |
| 3 | **Aggregate rows** such as "Total foodgrain" are sums of other rows, so they would be counted twice. | 1,133 | Drop | [L104](or_core.py#L104), [L238–242](or_core.py#L238) |
| 4 | **Spelling variants**, e.g. "Paddy" vs "Rice" | renamed | Merge names | [L107](or_core.py#L107), [L244–247](or_core.py#L244) |
| 5 | **Different units.** Coconut is counted in *nuts*; Cotton, Jute and Mesta in *bales*. You cannot add nuts to tonnes. | per crop | Exclude from the pooled LP | `unit_check()` [L270](or_core.py#L270) |
| 6 | **Partial years.** 1997 and 2020 have far fewer rows. | — | Use 1998–2019 | [server.py#L80](webapp/server.py#L80) |

**Result:** 575,879 → **358,739** clean rows. After the ×100 fix, rice yields come out at 1.8–2.8 t/ha, which matches official figures. So Production is in **tonnes** and Yield in **t/ha**. The PPT said quintals, but the data shows tonnes.

**How the duplicate copy was detected** (`reconcile_stacked_sources`, [L152–201](or_core.py#L152)):

1. Find rows that share State, District, Year, Season, Crop and Area ([L169](or_core.py#L169)).
2. Compute the Production ratio of each pair. The most common ratio is 100, in 99.4% of pairs ([L179–183](or_core.py#L179)).
3. All the "small" twins come before row 236,378 and all the "big" twins after it, so the code divides the second block by 100 ([L190–196](or_core.py#L190)).

**Graph:** [results/fig1_stacked_source_fix.png](results/fig1_stacked_source_fix.png) (Fig. 1 in the IEEE paper).

![Stacked source fix](results/fig1_stacked_source_fix.png)

* The left panel is the raw file. Pooled yield climbs from about 200 to over 1,000 because two scales are mixed.
* The right panel is after the fix: a sensible 4–6 t/ha.
* The jump at 2020 is because 2020 is a partial year, which is why we stop at 2019.

**The unit check rule** ([L270–300](or_core.py#L270)) excludes a crop if either:

* it is in the known non-weight list (`NON_WEIGHT_UNITS`, [L116](or_core.py#L116)); or
* its median yield is more than 250× (or less than 1/250×) the median of all crops ([L292](or_core.py#L292)). This catches count-type crops that are not on the list.

For Karnataka Kharif, **Mesta** and **Cotton** are excluded (bales).

> **▶ Try it in the app:** open **Data**. *Dataset and cleaning* shows the 575,879 → 358,739 log, step by step. *Records per year* shows why 1997 and 2020 are dropped. The excluded crops (Cotton, Mesta) are listed with their reason.

---

## Part 4 · From raw data to LP numbers

We pick a **scope**: one state, one season and a range of years. The default is **Karnataka, Kharif, 1998–2019** ([server.py#L39](webapp/server.py#L39), [L80](webapp/server.py#L80)). Filtering happens in `filter_scope()` at [or_core.py#L254](or_core.py#L254).

For each crop $c$ we compute these numbers in `build_coefficients()` at [or_core.py#L314](or_core.py#L314).

**Step 1: add up all districts for each year** ([L326–329](or_core.py#L326)):

$$A_{c,t} = \sum_{\text{districts}} \text{Area}, \qquad P_{c,t} = \sum_{\text{districts}} \text{Production}, \qquad Y_{c,t} = \frac{P_{c,t}}{A_{c,t}}$$

Here $t$ is the year. We take total production ÷ total area rather than averaging the district Yield column, because averaging district yields would treat a 10-hectare district the same as a 100,000-hectare one.

**Step 2: the LP inputs** ([L335](or_core.py#L335), [L340–342](or_core.py#L340)):

| Symbol | Meaning | Formula | Code |
|---|---|---|---|
| $y_c$ | yield coefficient (t/ha) | $y_c = \frac{1}{T}\sum_t Y_{c,t}$, the average over the $T$ years | [L335](or_core.py#L335) |
| $a_c$ | minimum area | $a_c = \min_t A_{c,t}$, the smallest area the crop ever had | [L340](or_core.py#L340) |
| $m_c$ | maximum area | $m_c = \max_t A_{c,t}$, the largest area the crop ever had | [L340](or_core.py#L340) |
| $\bar{A}_c$ | historical area | $\bar{A}_c = \frac{1}{T}\sum_t A_{c,t}$, the average area (the "actual" plan) | [L341](or_core.py#L341) |

**Step 3: the baseline** (`historical_baseline()`, [L519–522](or_core.py#L519)):

$$L = \sum_c \bar{A}_c \qquad\qquad D = \sum_c y_c \,\bar{A}_c$$

* $L$ is the land historically used: **6,125,458 ha**.
* $D$ is the historical output valued at the average yields: **9,729,947 t**.

We value the historical plan with the same $y_c$ as the optimal plan, so the comparison is fair: both plans are scored with the same yields.

**A rule to remember:** a crop enters the LP only if it has data in at least ⅔ of the years. For 22 years that is **15** years ([server.py#L108–109](webapp/server.py#L108)). Crops with gaps would give unreliable averages. In Karnataka Kharif, **19 crops** pass.

`apply_bounds()` ([L349](or_core.py#L349)) copies $a_c, m_c$ into the columns the solver uses (`lo`, `hi`). In "band" mode it sets them to $\bar{A}_c(1 \pm p\%)$ instead, which is used in sensitivity analysis.

In the paper, all of Step 2 is **equation (1)** in §IV-A.

> **▶ Try it in the app:** open **Data → LP coefficients: average yield per crop**. Each bar is one $y_c$, with its ± standard deviation across years. Then open **Model inputs → Yield estimate**: you can switch $y_c$ from the mean to the median or an area-weighted average and watch the results change.

---

## Part 5 · Optimization 1: maximise output

### 5.1 The model (PPT slides 11–12)

$$
\begin{aligned}
\text{maximise} \quad & Z = \sum_c y_c \, x_c && \text{(total output, tonnes)}\\
\text{subject to} \quad & \sum_c x_c \le L && \text{(land constraint)}\\
& a_c \le x_c \le m_c \quad \forall c && \text{(each crop stays within its historical range)}\\
& x_c \ge 0 \quad \forall c && \text{(no negative hectares)}
\end{aligned}
$$

Line by line:

* $y_c x_c$ is the tonnes from crop $c$, and adding over all crops gives total output $Z$.
* $\sum x_c \le L$: you cannot plant more land than you have.
* $a_c \le x_c \le m_c$ keeps the plan realistic. Without it, the LP would put *all* land into potato, the highest-yield crop. The bounds say no crop may go below or above what it has actually had in the past.
* $x_c \ge 0$ is automatic here, because $a_c > 0$.

### 5.2 Where each equation lives in the code

| Equation | PuLP (main solver) | SciPy (cross-check) |
|---|---|---|
| variables $x_c$ with $a_c \le x_c \le m_c$ | [or_core.py#L428](or_core.py#L428) `LpVariable(lowBound=lo, upBound=hi)` | [L410](or_core.py#L410) `bounds=(lo, hi)` |
| $Z = \sum y_c x_c$ | [L430](or_core.py#L430) `output = lpSum(y_c * x_c)` | [L412](or_core.py#L412) `linprog(-y_c, …)` |
| maximise | [L426](or_core.py#L426) `LpMaximize`, [L433](or_core.py#L433) | linprog only minimises, so we minimise $-Z$ |
| $\sum x_c \le L$ | [L431](or_core.py#L431) `land = lpSum(x)`, [L434](or_core.py#L434) `land <= L` | [L412](or_core.py#L412) `A_ub=[1,…,1], b_ub=[L]` |
| solve | [L451](or_core.py#L451) CBC solver | HiGHS solver |
| shadow price $\lambda^*$ | [L457](or_core.py#L457) `constraints["Land"].pi` | [L420](or_core.py#L420) `ineqlin.marginals` |
| reduced costs | [L455](or_core.py#L455) `x.dj` | — |
| entry point | `solve_max_output()` [L483](or_core.py#L483) | |

Both solvers run every time. The app's sidebar shows how closely they agree on the current run ([app.js#L207–208](webapp/static/app.js#L207)); for Karnataka the difference is about 0.001 t out of 11.8 million t.

### 5.3 Solve a tiny example by hand

Three crops, $L = 80$ ha:

| Crop | $y_c$ (t/ha) | $a_c$ | $m_c$ | historical $\bar{A}_c$ |
|---|---|---|---|---|
| A | 3 | 10 | 50 | 20 |
| B | 2 | 10 | 40 | 30 |
| C | 1 | 10 | 40 | 30 |

Historical output: $D = 3(20) + 2(30) + 1(30) = 150$ t on $L = 80$ ha.

**Solve by the greedy rule**, which is exactly what the simplex does for this kind of LP:

1. Give every crop its minimum: A = 10, B = 10, C = 10. That uses 30 ha, leaving 50.
2. The best yield is A (3 t/ha). Fill A up to its max: +40 → A = 50. Leaves 10 ha.
3. The next best is B (2 t/ha). Give B the last 10 → B = 20 (still below its max of 40).
4. C stays at its minimum, 10.

Plan: A = 50, B = 20, C = 10. Output $Z^* = 150 + 40 + 10 = 200$ t, which is **+33.3%** over 150.

* **Shadow price:** one more hectare would go to B, so $\lambda^* = 2$. Check: with $L = 81$, $Z^* = 202$.
* **Marginal (basic) crop:** B, the one crop strictly between its bounds. The shadow price always equals the marginal crop's yield.
* **Reduced costs:** A: $3 - 2 = +1$ (better than the cut-off, so at max). C: $1 - 2 = -1$ (worse, so at min). B: 0.

I ran this exact example through `or_core.solve_max_output` and got A = 50, B = 20, C = 10, $Z^* = 200$, $\lambda^* = 2$.

### 5.4 Why the answer always looks like this

With **one** shared constraint plus simple bounds, this LP is a **continuous knapsack problem**. The optimal rule is always:

1. every crop gets $a_c$;
2. the leftover land goes to crops in order of yield, highest first, each up to $m_c$;
3. the crop where the land runs out is the single **marginal crop**;
4. $\lambda^* =$ yield of the marginal crop;
5. crops with $y_c > \lambda^*$ are at $m_c$; crops with $y_c < \lambda^*$ are at $a_c$.

The code labels each crop "at max", "at min" or "basic" in `_bound_status()` ([L388](or_core.py#L388)). The plain-English summary in the app ("Bajra takes the remaining land; one more hectare is worth 0.81 t (λ*)") is written by `interpret()` at [app.js#L273](webapp/static/app.js#L273) and shown under *What the plan says* on the **Results** page.

### 5.5 The graph

[results/fig3_opt1_allocation.png](results/fig3_opt1_allocation.png) is Fig. 3 in the IEEE paper and the *Hectares per crop* chart on the app's **Results** page.

![Opt 1 allocation](results/fig3_opt1_allocation.png)

* **Blue** is the historical average area; **orange** is the LP plan; the grey tick is $m_c$.
* Potato, Onion, Maize, Rice, Ragi, Jowar and Soyabean go up to their tick (max).
* Bajra sits in between: it is the marginal crop, with $\lambda^* = 0.808$.
* Pulses, oilseeds and small millets drop to their minimum.

> **▶ Try it in the app:** open **Results** with *Model 1 · Max output* selected. Check four things against this part: the gain (+21.6%) and λ\* (0.808); *Hectares per crop* (the graph above); the **status** column of the *Allocation table* (at max / basic / at min); and *Where the extra output comes from*. Then go to **Model inputs**, move *Land available* to 101%, come back, and see that output rose by about 0.808 × 61,000 ha ≈ 49,500 t. That is λ\* in action.

---

## Part 6 · Optimization 2: minimise land

### 6.1 The model (PPT slide 13)

$$
\begin{aligned}
\text{minimise} \quad & \sum_c x_c && \text{(total land)}\\
\text{subject to} \quad & \sum_c y_c \, x_c \ge D && \text{(production target)}\\
& a_c \le x_c \le m_c, \quad x_c \ge 0 \quad \forall c
\end{aligned}
$$

It uses the same data and the same $y_c$. The objective and the main constraint are swapped.

### 6.2 Where it lives in the code

| Equation | PuLP | SciPy |
|---|---|---|
| minimise $\sum x_c$ | [L426](or_core.py#L426) `LpMinimize`, [L436](or_core.py#L436) | [L414](or_core.py#L414) `linprog(c=[1,…,1])` |
| $\sum y_c x_c \ge D$ | [L437](or_core.py#L437) `output >= D` | [L414](or_core.py#L414) written as $-\sum y_c x_c \le -D$, because linprog only accepts ≤ |
| bounds | [L428](or_core.py#L428) | [L410](or_core.py#L410) |
| $\mu^*$ | [L457](or_core.py#L457) `constraints["Target"].pi` | [L420](or_core.py#L420) |
| entry point | `solve_min_land()` [L488](or_core.py#L488) | |

The target $D$ is the historical output by default. On the app's *Model inputs* page a slider changes it from 50% to 150% ([server.py#L225](webapp/server.py#L225)).

### 6.3 The same toy example

Target $D = 150$ t.

1. Every crop at its minimum: 30 ha → $30 + 20 + 10 = 60$ t. We still need 90 t.
2. The cheapest way to get tonnes is the crop with the most tonnes per hectare, A (3 t/ha). A needs $90 / 3 = 30$ more ha → A = 40, still below its max of 50.
3. Total land = **60 ha** instead of 80, a **25%** saving.

* **Shadow price:** one more tonne of target needs $1/3$ ha of A, so $\mu^* = 1/3$.
* **Duality check:** solve Optimization 1 with $L = 60$. The marginal crop is A, so $\lambda^* = 3$, and $1/\lambda^* = 1/3 = \mu^*$. ✔

### 6.4 The duality check, μ* = 1/λ*

Both models describe the same "efficient frontier" (the best output for each amount of land), seen from opposite sides:

* $\lambda^*$ = extra **tonnes** per extra **hectare**;
* $\mu^*$ = extra **hectares** per extra **tonne**;
* so, at the same point, $\mu^* = 1/\lambda^*$.

**Karnataka:** Optimization 2 gives $\mu^* = 0.380616$ ha/t, with Rice as the marginal crop. Solving Optimization 1 at that land level (4,663,668 ha) gives $\lambda^* = 2.627323$ (Rice's yield). $1/2.627323 = 0.380616$ ✔.

* Code: [server.py#L245](webapp/server.py#L245) and [L275](webapp/server.py#L275) for the app, and [run_case_study.py#L96-L98](run_case_study.py#L96) for the report.
* The app shows this as the "Duality check" note on the *Results* page when you switch to Model 2 ([app.js#L255](webapp/static/app.js#L255)).

> **Be precise if asked:** the PPT calls the two models a "primal/dual pairing". Strictly, they are not formal LP duals of each other; they are the **inverse** (swapped) forms of the same resource problem. What is mathematically exact is the reciprocal relationship between their shadow prices, and that is what we verify.

Paper Table IV puts Optimization 1 and 2 side by side (decision, objective, binding constraint, bounds, output, dual), exactly like the PPT's slide 11 and 13 cards.

> **▶ Try it in the app:** on **Results**, click *Model 2 · Min land*. You should see 4,663,668 ha (−23.9%) and, under the buttons, the note "Duality check: μ\* = 0.3806 … 1/λ\* at that land = 0.3806. They match." Then on **Model inputs** set *Production target* to 120% and watch the land needed rise.

---

## Part 7 · Results for Karnataka, Kharif, 1998–2019

Run `python run_case_study.py` to reproduce every number. The output goes to [results/case_study_results.md](results/case_study_results.md).

| | Historical | LP optimal | Change |
|---|---|---|---|
| **Opt 1:** output on $L$ = 6,125,458 ha | 9,729,947 t | **11,831,631 t** | **+21.6%** |
| **Opt 2:** land for $D$ = 9,729,947 t | 6,125,458 ha | **4,663,668 ha** | **−23.9%** (1.46 M ha saved) |

| Quantity | Value | Meaning |
|---|---|---|
| $\lambda^*$ | 0.808 t/ha | one more hectare adds about 0.81 t (Bajra's yield) |
| $\mu^*$ | 0.3806 ha/t | one more tonne of target needs about 0.38 ha (1/Rice's yield) |
| crops in LP | 19 | Mesta and Cotton excluded (bales) |

The crop table, sorted by yield. The LP fills from the top:

| Crop | $y_c$ | Optimal status |
|---|---|---|
| Potato | 6.610 | at max |
| Onion | 6.084 | at max |
| Maize | 2.855 | at max |
| Rice | 2.627 | at max |
| Ragi | 1.569 | at max |
| Jowar | 1.332 | at max |
| Soyabean | 0.859 | at max |
| **Bajra** | **0.808** | **marginal, so λ* = 0.808** |
| Castor seed … Moong | 0.791 … 0.233 | at min |

> **Read it critically:** "output" is total tonnes. Heavy crops such as potato and onion naturally win on tonnes per hectare. The +21.6% means more *tonnes*, not more money or nutrition. That is the honest limitation of a dataset with no prices.

These numbers are paper **Table VII** (§VI).

> **▶ Try it in the app:** on **Results**, open *Change from history* (which crops gain or lose hectares) and the *Allocation table* (compare its $y_c$ and status columns with the table above). Then change the **State** at the top to Punjab or Maharashtra and see how the answer changes for a different crop mix.

---

## Part 8 · Sensitivity analysis and the pulse constraint (Review III)

"How sure are we?" Code is in [or_core.py#L528–597](or_core.py#L528); the app's *Sensitivity* page uses `parametric_land` and `bound_band_sweep` through [server.py#L246–247](webapp/server.py#L246). `yield_ranging` is used in `run_case_study.py`, not in the app.

### 8.1 Varying the land budget: Z*(L) and λ*(L)

`parametric_land()` ([L528](or_core.py#L528)) solves Optimization 1 for 80–120 different values of $L$.

[results/fig5_parametric_land.png](results/fig5_parametric_land.png) (Fig. 4 in the IEEE paper):

![Parametric land](results/fig5_parametric_land.png)

* **Left, $Z^*(L)$:** output grows as land grows, but more and more slowly. This is **diminishing returns**: the best crops fill up first, so extra land goes to worse crops.
* **Right, $\lambda^*(L)$:** the slope of the left curve. It falls in **steps**, and each step is the moment one crop reaches its max and the next-best crop becomes marginal. The dotted line is the historical $L$.

The curve is **concave** (bends downward). This is a general LP fact: the optimal value as a function of a right-hand side is piecewise-linear and concave for a maximisation.

### 8.2 How much freedom does the gain need? (bound band)

`bound_band_sweep()` ([L586](or_core.py#L586)) replaces the bounds with $\bar{A}_c(1 \pm p\%)$, meaning each crop can move only ±p% from its average, and re-solves both models.

| Band ±p% | 5% | 10% | 20% | 30% | 50% | historical min/max (default) |
|---|---|---|---|---|---|---|
| Output gain | 3.1% | **6.2%** | 12.5% | 18.7% | 31.2% | 21.6% |
| Land saving | 2.5% | **5.0%** | 10.0% | 15.0% | 25.0% | 23.9% |

So the large gain needs big shifts. A realistic ±10% change still gives about 6%, which is in line with the +3.75–15% reported by Supriya et al. [4]. This is paper **Table VIII**.

Notice the gain grows almost exactly in proportion to $p$ (about 0.62% per 1% of freedom). That is because with a band, almost every crop ends at an edge of its own ±p% range: the high-yield crops go up by the full $p\%$ and the low-yield crops go down by the full $p\%$, so the gain scales with $p$.

### 8.3 Yield ranging: how stable is the plan?

`yield_ranging()` ([L545](or_core.py#L545)) answers: *how far can each crop's yield change before the optimal plan changes?*

* a crop **at max** stays at max as long as $y_c \ge \lambda^*$;
* a crop **at min** stays at min as long as $y_c \le \lambda^*$;
* the **marginal** crop stays marginal between the yields of its neighbours.

**Examples:**

* Castor seed (0.791) is just below $\lambda^* = 0.808$. A yield rise of only 0.017 t/ha would make it worth expanding.
* Soyabean (0.859) is the weakest expanded crop. A fall of only 0.05 t/ha would push it below $\lambda^*$ and out of the expanded set, so it is the most fragile part of the plan.
* Potato (6.61) is far above, so its place is very safe.

### 8.4 Yield shock (code and report only)

`yield_shock()` ([L578](or_core.py#L578)) multiplies chosen yields by, say, −30% (a bad monsoon) and re-solves. It is in `run_case_study.py` ([L129–137](run_case_study.py#L129)) and the report, not in the app.

* **All crops −30%:** every yield shrinks by the same factor, so the order of crops does not change. The plan stays the same (0 ha moved); only the total output drops.
* **Soyabean alone −30%:** Soyabean falls below $\lambda^*$, so the LP cuts it to its minimum and gives the land to the next crop. **288,406 ha** move.

**Lesson:** the plan is robust to general bad years, and sensitive only to crops sitting near the cut-off $\lambda^*$.

### 8.5 The pulse-share constraint (added in the app; paper eq. 4)

**Why:** the unconstrained LP is greedy for tonnes. It cuts land under pulses (Arhar/Tur, Urad, Moong, Horse-gram, other Kharif pulses) from **23.2%** of the land to **12.6%**. Pulses matter for protein and for soil nitrogen, so a planner might insist on keeping them.

**The constraint:** pulse crops must keep at least a share $s$ of the land used:

$$\sum_{c \in \text{pulses}} x_c \;\ge\; s \sum_c x_c$$

It is still linear (move everything to one side: $\sum_c s\,x_c - \sum_{c \in \text{pulses}} x_c \le 0$), so both models stay LPs.

**Code:** the list of pulse crops is `PULSE_CROPS` ([or_core.py#L128](or_core.py#L128)). PuLP adds it in `lp_model()` ([L438–440](or_core.py#L438)); SciPy adds it as an extra row from `_share_row()` ([L401](or_core.py#L401)). It is off by default ($s = 0$), so all headline numbers are unchanged.

**Karnataka results** (computed with `or_core`):

| Pulse floor $s$ | Output gain (Opt 1) | Land saving (Opt 2) |
|---|---|---|
| off (default) | 21.6% | 23.9% |
| 20% | 20.5% | 21.5% |
| **23.2% (keep history)** | **19.0%** | **19.1%** |
| 30% | 15.1% | 13.6% |
| 35% | 10.7% | 8.8% |

**How to read it:** each extra point of pulse share costs output, because land is forced from high-yield crops into low-yield pulses. Keeping the historical pulse share still gives **+19%**, so most of the gain survives a sensible policy. If $s$ is set above what the crops' upper bounds allow, the LP becomes **infeasible** and the app says so.

> **▶ Try it in the app:** open **Sensitivity**. *Optimal output vs land budget* is Fig. 4 left, *Value of one more hectare (λ\*)* is Fig. 4 right, and *Limiting how far each crop may move* is the band table. Then go to **Model inputs → Minimum land under pulses**, set it to 23%, and check that the gain on **Results** drops to about 19%. *Effect of your inputs* on that page shows the change against the default plan.

---

## Part 9 · District comparison and validation (Review III)

`multi_district()` ([or_core.py#L603](or_core.py#L603)) repeats Parts 4–6 **separately for each district**, each with its own $y_c$, $a_c$, $m_c$, $L$ and $D$.

[results/fig7_multi_district.png](results/fig7_multi_district.png) (Fig. 5 in the IEEE paper):

![Multi-district](results/fig7_multi_district.png)

* 27 districts; median gain **25.8%** more output, or **24.4%** less land.
* Highest gains are in diverse dry districts: **Koppal +65%**, **Gadag +55%**, Raichur +48%. They grow many crops with very different yields, so re-allocation has room to help.
* Lowest gains are in coastal rice districts: **Udupi +0.2%**, Dakshina Kannada +0.6%. They grow almost only rice, so there is nothing to re-allocate.
* The gain rises with the number of crops a district grows (correlation $r = 0.50$).
* Maize is the crop the LP expands most often (16 of 27 districts).

The lesson: **the LP helps most where the crop mix is diverse.**

> **▶ Try it in the app:** open **Districts**. *Output gain on the map* colours each district; *Gain by district* ranks them; *More crops, more room to gain* is the $r = 0.50$ scatter. Districts created recently (or renamed) have no map boundary and appear only in the charts.

### 9.1 Validation: how we know the pipeline works

* **Synthetic data:** [generate_synthetic_data.py](generate_synthetic_data.py) builds "Demo Pradesh" (1,664 rows in `sample_data/`) with planted defects: duplicates, zero-production rows, aggregate rows, spelling variants, crops in nuts and bales, and a drought year. The pipeline catches every one.
* **Two solvers:** PuLP-CBC and SciPy-HiGHS agree to within $10^{-9}$ (relative).
* **Theory check:** $\mu^* = 1/\lambda^*$ holds exactly (Part 6.4).
* **Hand check:** the toy example in Part 5.3 matches a hand calculation.

This is paper §VIII.

---

## Part 10 · How the code and the paper fit together

### 10.1 Tools (PPT slide 15, paper Table V)

| Purpose | Tool | Where |
|---|---|---|
| Data and statistics | Pandas, NumPy | all of `or_core.py` |
| Optimisation | PuLP (CBC solver), SciPy `linprog` (HiGHS solver) | `lp_model()`, `_scipy()` |
| Visualisation | Matplotlib (report and paper figures), Plotly (app charts and maps) | `run_case_study.py`, `ieee_paper/make_figures.py`, `app.js` |
| Interface | Web app: FastAPI backend + Plotly.js frontend | `webapp/` |

The PPT listed Streamlit as an *optional* interface for Review III. We built a web app instead: it is faster, works offline, and uses exactly the same `or_core.py` as the report, so every number matches.

### 10.2 Files

| File | Role | Read it when… |
|---|---|---|
| [or_core.py](or_core.py) | **All the OR logic**: cleaning, unit check, coefficients, both LPs, sensitivity, districts | the faculty asks about the method (most important file) |
| [webapp/server.py](webapp/server.py) | FastAPI server: receives requests from the web page, calls `or_core`, returns JSON | they ask how the UI gets its numbers |
| [webapp/static/app.js](webapp/static/app.js) | The web page: sidebar pages, inputs, maps and charts (Plotly) | they ask about the interface |
| [run_case_study.py](run_case_study.py) | Produces every number and figure in REPORT.md → `results/` | you want to reproduce the report |
| [ieee_paper/make_figures.py](ieee_paper/make_figures.py) | Produces the IEEE paper figures (PDF) | you need the paper figures again |
| [generate_synthetic_data.py](generate_synthetic_data.py) | Builds the demo test files in `sample_data/` | they ask how the demo data was made |
| [REPORT.md](REPORT.md), [ieee_paper/main.tex](ieee_paper/main.tex) | Write-ups | — |

### 10.3 The pipeline (PPT slide 14 workflow, paper Fig. 2 → code)

| PPT workflow step | Function | Line |
|---|---|---|
| Government dataset | `pd.read_csv` → `standardise()` | [or_core.py#L71](or_core.py#L71) |
| Filter state/season, clean rows | `clean()`, `filter_scope()` | [L204](or_core.py#L204), [L254](or_core.py#L254) |
| Check production-unit consistency | `unit_check()` | [L270](or_core.py#L270) |
| Average yield/ha per crop | `build_coefficients()` | [L314](or_core.py#L314) |
| Formulate LP | `lp_model()`, `_solve()` | [L423](or_core.py#L423), [L444](or_core.py#L444) |
| Solve (PuLP / SciPy) | `solve_max_output()`, `solve_min_land()`, `_scipy()` | [L483](or_core.py#L483), [L488](or_core.py#L488), [L408](or_core.py#L408) |
| Compare vs historical | `historical_baseline()` and the `change_ha` column | [L519](or_core.py#L519), [L477](or_core.py#L477) |
| Visualise & interpret | web app, `run_case_study.py` | — |

### 10.4 Web app pages → backend

Start the app with `python webapp/server.py` (or double-click `run_app.bat`), then open http://127.0.0.1:8000. The bar at the top picks the **State** and **Season**, and every page re-solves for that choice.

The page sends one request, `/api/run` ([server.py#L211](webapp/server.py#L211)). That request runs the whole pipeline for the chosen state and season and returns everything every page needs:
`filter_scope` → `solve_scope()` ([L103](webapp/server.py#L103): `unit_check`, `build_coefficients`, `apply_bounds`) → `solve_max_output` and `solve_min_land` → sensitivity and districts.

| Page | Page code (app.js) | Data from (server.py) | OR functions |
|---|---|---|---|
| Overview | [L303](webapp/static/app.js#L303), text in `interpret()` [L273](webapp/static/app.js#L273) | `/api/run`, plus `/api/india` [L157](webapp/server.py#L157) for the India map | both LPs, solved for every state |
| Data | [L315](webapp/static/app.js#L315) | `/api/meta` [L148](webapp/server.py#L148) (cleaning) and `/api/run` (profile) | `clean`, `unit_check`, `build_coefficients` |
| Model inputs | `renderInputs()` [L148](webapp/static/app.js#L148), [L356](webapp/static/app.js#L356) | `Settings` [L90](webapp/server.py#L90) | changes L, D, bounds, yield method, pulse floor |
| Results | `renderModel()` [L245](webapp/static/app.js#L245), [L337](webapp/static/app.js#L337) | `/api/run` → `opt1`, `opt2` | `solve_max_output`, `solve_min_land`, duality check |
| Crops | [L368](webapp/static/app.js#L368) | `/api/crop` [L189](webapp/server.py#L189) | one crop's yield in every state |
| Sensitivity | [L394](webapp/static/app.js#L394) | `/api/run` → `curve`, `band` | `parametric_land`, `bound_band_sweep` |
| Districts | [L411](webapp/static/app.js#L411) | `/api/run` → `districts`, `district_geo` | `multi_district` |

The *Minimum land under pulses* input on **Model inputs** is the constraint explained in Part 8.5.

To see the exact equations PuLP receives, with real numbers, use `_lp_text()` ([or_core.py#L493](or_core.py#L493)) on the result of `lp_model()`. The app does not show this panel.

### 10.5 The IEEE paper, section by section

[ieee_paper/main.tex](ieee_paper/main.tex). Compile it by uploading `ieee_paper/ieee_paper_overleaf.zip` to Overleaf.

| Paper | Contents | Guide part |
|---|---|---|
| §I Introduction | problem, objectives, scope | 1 |
| §II Literature review, Table I | five LP crop studies; the gap; our positioning | 3.2 |
| §III Dataset, Tables II–III, Fig. 1 | fields, real rows (Coconut), why this dataset, quirks and cleaning | 3 |
| §IV Formulation, eqs. (1)–(4), Table IV | coefficients, Opt 1, Opt 2, side-by-side table, knapsack structure, pulse constraint | 4, 5, 6, 8.5 |
| §V Workflow, tools, interface, Fig. 2, Tables V–VI | workflow, tools, what is analysed, the web app, work plan | 10 |
| §VI Results, Table VII, Fig. 3 | Karnataka numbers, duals, duality check | 5, 6, 7 |
| §VII Sensitivity and districts, Table VIII, Figs. 4–5 | land budget, bounds, yields, pulse share, 27 districts | 8, 9 |
| §VIII Validation | synthetic data, two solvers, μ\* = 1/λ\* | 9.1 |
| §IX Assumptions and limitations | units, averages, output not profit, bounds, not modelled | 7, 11 |
| §X Conclusion | headline numbers and future work | 12 |

| Equation | What it is |
|---|---|
| (1) | $y_c$, $\bar A_c$, $a_c$, $m_c$ from the data |
| (2) | Optimization 1, max output |
| (3) | Optimization 2, min land |
| (4) | pulse-share constraint |

---

## Part 11 · Likely faculty questions (with answers)

**Q1. Why is this an OR problem and not just sorting crops by yield?**
Because of the constraints. Each crop must stay within $[a_c, m_c]$ and the total land is fixed, so you must decide how much of each crop, not just which is best. The LP gives the provably optimal amounts *and* the shadow prices. The greedy solution is optimal only because of this problem's special structure (one shared constraint), and LP theory is what proves that.

**Q2. Why do most crops end at their minimum or maximum?**
The LP is a continuous knapsack (Part 5.4). At an optimal corner, every crop except one sits on a bound.

**Q3. What does λ* = 0.808 mean?**
One extra hectare would add 0.808 t of output, which is the yield of the marginal crop, Bajra. It tells a planner what more land is worth.

**Q4. How do you know the solver is right?**
Two independent solvers (PuLP-CBC and SciPy-HiGHS) give the same answer. The duality check $\mu^* = 1/\lambda^*$ holds. The toy example in Part 5.3 matches a hand calculation.

**Q5. Why not use the dataset's Yield column directly?**
For a state we need state-level yield: total production ÷ total area per year. Averaging district yields would weight a tiny district the same as a huge one. Both come from the same columns.

**Q6. Why are Cotton and Coconut excluded?**
They are counted in bales and nuts, not tonnes, and you cannot add bales to tonnes (PPT slides 8, 9 and 16).

**Q7. Why 1998–2019?**
1997 and 2020 are partial years with far fewer records ([server.py#L80](webapp/server.py#L80) picks years with at least 65% of the median row count).

**Q8. Isn't 21.6% unrealistic?**
It assumes every crop can move anywhere within its historical min–max. With a realistic ±10% limit, the gain is 6.2%, which is consistent with published LP crop studies (3.75–15%). Both numbers are reported.

**Q9. What about profit, soil, irrigation and rotation?**
They are not in the dataset, so they are not modelled. We say so openly instead of inventing numbers (Assumptions & Limitations).

**Q10. What is the ×100 duplicate problem?**
The CSV contains the same 212,373 records twice; the second copy's production is ×100. Left unfixed, yields mix two scales and older years count twice. We detect it automatically and fix it (Part 3.3).

**Q11. The PPT says Production is in quintals. Why do you say tonnes?**
After the ×100 fix, rice comes out at 1.8–2.8 per hectare. Official rice yields in tonnes per hectare are in that range; in quintals they would be about 18–28. So the data is in tonnes. We checked it against the data instead of trusting the label.

**Q12. What is the pulse constraint, and does it change your results?**
It is an optional extra linear constraint: pulses must keep at least a share $s$ of the land (Part 8.5, paper eq. 4). It is off by default, so the headline +21.6% does not use it. Keeping the historical 23.2% pulse share still gives +19.0%.

**Q13. Is it still an LP with the pulse constraint?**
Yes. $\sum_{\text{pulses}} x_c \ge s \sum_c x_c$ rearranges to $\sum_c s\,x_c - \sum_{\text{pulses}} x_c \le 0$: every term is a constant times a variable. It is no longer a pure knapsack, though, so the "one marginal crop" rule can have two basic variables.

**Q14. Why a web app and not Streamlit, as the PPT said?**
The PPT listed Streamlit as optional. The web app runs the same `or_core.py` as the report, adds India and district maps, and every page re-solves when you change the state, season or any input. All numbers match the paper.

**Q15. Which file should I open if asked about the code logic?**
[or_core.py](or_core.py). Everything OR lives there: cleaning (`clean`), unit check (`unit_check`), coefficients (`build_coefficients`), the LP (`lp_model`, `_solve`), sensitivity (`parametric_land`, `bound_band_sweep`, `yield_ranging`) and districts (`multi_district`). The web app only calls these functions (Part 10.4).

---

## Part 12 · Cheat sheet

### Equations

$$\text{Yield}_{c,t} = \frac{\sum \text{Production}}{\sum \text{Area}}, \qquad y_c = \text{mean}_t\,\text{Yield}_{c,t}, \qquad a_c = \min_t A_{c,t}, \qquad m_c = \max_t A_{c,t}$$

$$L = \sum_c \bar{A}_c, \qquad D = \sum_c y_c \bar{A}_c$$

$$\textbf{Opt 1:}\ \max \sum_c y_c x_c \ \text{ s.t. } \sum_c x_c \le L,\ a_c \le x_c \le m_c,\ x_c \ge 0$$

$$\textbf{Opt 2:}\ \min \sum_c x_c \ \text{ s.t. } \sum_c y_c x_c \ge D,\ a_c \le x_c \le m_c,\ x_c \ge 0$$

$$\lambda^* = y_{\text{marginal crop}}, \qquad \mu^* = \frac{1}{\lambda^*}\ \text{(at the same point)}, \qquad \text{gain} = \frac{Z^* - D}{D}, \qquad \text{saving} = \frac{L - \text{Land}^*}{L}$$

$$\textbf{Pulse floor (optional):}\ \sum_{c \in \text{pulses}} x_c \ge s \sum_c x_c$$

### Key numbers

| | |
|---|---|
| Raw → clean rows | 575,879 → 358,739 |
| Duplicate ×100 pairs | 212,373 |
| Scope | Karnataka · Kharif · 1998–2019 · 19 crops (≥ 15 years each) |
| L, D | 6,125,458 ha · 9,729,947 t |
| Opt 1 | 11,831,631 t (+21.6%), λ* = 0.808 (Bajra) |
| Opt 2 | 4,663,668 ha (−23.9%), μ* = 0.3806 (Rice) |
| ±10% band | +6.2% output / −5.0% land |
| Duality check | μ* = 0.3806 = 1/2.627 (λ* at 4,663,668 ha) |
| Pulse share | 23.2% historically → 12.6% in the LP; keeping 23.2% gives +19.0% / −19.1% |
| Yield shock | all −30%: 0 ha moved; Soyabean −30%: 288,406 ha moved |
| Districts | 27, median gain 25.8% (24.4% land); Koppal +65%, Udupi +0.2% |
| Validation | 1,664-row synthetic file, every planted defect caught; solvers agree to 10⁻⁹ |

### Glossary

| Term | Meaning |
|---|---|
| **Decision variable** | what the model chooses: here $x_c$, hectares per crop |
| **Objective** | what is maximised or minimised |
| **Constraint** | a limit the plan must respect |
| **Feasible** | a plan that satisfies every constraint |
| **Infeasible** | no plan satisfies them, e.g. $L$ smaller than $\sum a_c$ |
| **Optimal** | the best feasible plan |
| **Shadow price / dual value** | gain in the objective from one more unit of a constraint's resource |
| **Reduced cost** | how much a crop's yield must improve before the LP would change its area |
| **Marginal (basic) crop** | the one crop strictly between its bounds; its yield equals λ* |
| **Binding constraint** | a constraint that holds with equality at the optimum, so it limits the answer |
| **Sensitivity analysis** | how the solution changes when inputs change |
| **Knapsack problem** | fill a limited capacity with the most valuable items; our LP is the continuous version |
| **CBC / HiGHS** | the two LP solver engines used (via PuLP and SciPy) |

### References (from the PPT)

1. H. A. Taha, *Operations Research: An Introduction*, 10th ed., Pearson, 2017. (Read Ch. 2–3 for LP and simplex, and Ch. 4 for duality and sensitivity.)
2. S. Wankhade & H. Lunge, LP technique for optimum resource allocation in agricultural production, Akola district, 2012.
3. F. Majeke et al., Linear programming approach — application in agriculture, 2020.
4. S. Supriya et al., Optimal crop plans using LP in Jayashankar Bhupalpally district, Telangana, 2022.
5. K. K. Paidipati & S. R. Padi, Optimal programming problems for crop planning and agricultural resource management, 2017.
6. X. Liang, LP approach in agricultural production-land allocation, Springer, 2023.
7. MoA&FW, Govt. of India, District-wise Season-wise Crop Production Statistics (1997–2020-21), data.gov.in, via Kaggle.
