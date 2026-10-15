# Study Guide: Optimal Crop-Area Allocation with Linear Programming

This guide teaches the whole project from zero. Read it top to bottom once, and you should be able to explain every equation, every number, every graph, and point to the exact line of code that produces it.

**How to use it:** read one part at a time. After each part, open the linked code or graph and check it yourself. Links like [or_core.py#L306](or_core.py#L306) jump to the exact line on GitHub.

| Part | Topic | Time |
|---|---|---|
| 1 | The problem in plain words | 5 min |
| 2 | Linear programming from scratch | 20 min |
| 3 | The dataset and its problems | 20 min |
| 4 | From raw data to LP numbers | 15 min |
| 5 | Optimization 1: maximise output | 25 min |
| 6 | Optimization 2: minimise land | 15 min |
| 7 | Results for Karnataka | 10 min |
| 8 | Sensitivity analysis | 15 min |
| 9 | District comparison | 5 min |
| 10 | How the code fits together | 15 min |
| 11 | Likely faculty questions | 15 min |
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

Three real rows:

| State | District | Year | Season | Crop | Area (ha) | Production | yield |
|---|---|---|---|---|---|---|---|
| Andaman & Nicobar | NICOBARS | 2000 | Kharif | Arecanut | 1,254 | 2,000 | 1.59 |
| Andaman & Nicobar | NICOBARS | 2000 | Kharif | Rice | 102 | 321 | 3.15 |
| Andaman & Nicobar | NICOBARS | 2000 | Kharif | Other Kharif pulses | 2 | 1 | 0.50 |

$$\text{Yield} = \frac{\text{Production}}{\text{Area}}$$

### 3.2 Why this dataset (from the PPT)

* **It gives us:** Area, which becomes the land constraint; Yield, which becomes the output coefficient; and many years, so we average instead of guessing.
* **It does not give us:** prices or costs, so there is no profit objective.
* It is a government source at district level over many years, not a one-off survey of one farm. That is our research gap: previous LP crop studies (Table I of the paper) used one-time surveys of single districts.

### 3.3 The problems we found and fixed (cleaning)

Code: `clean()` at [or_core.py#L196](or_core.py#L196).

| # | Problem | Rows affected | Fix | Code |
|---|---|---|---|---|
| 1 | **Duplicate copy ×100.** The file is two copies stacked together. Rows from #236,378 onward repeat earlier records, but Production is exactly 100× larger. | 212,373 duplicate pairs | Rescale the second block ÷100, keep one copy | `reconcile_stacked_sources()` [L144](or_core.py#L144) |
| 2 | **Zero production.** Usually means "not reported", not real crop failure. | 3,634 | Drop | [L224–228](or_core.py#L224) |
| 3 | **Aggregate rows** such as "Total foodgrain" are sums of other rows, so they would be counted twice. | 1,133 | Drop | [L104](or_core.py#L104), [L230–234](or_core.py#L230) |
| 4 | **Spelling variants**, e.g. "Paddy" vs "Rice" | renamed | Merge names | [L107](or_core.py#L107), [L236–239](or_core.py#L236) |
| 5 | **Different units.** Coconut is counted in *nuts*; Cotton, Jute and Mesta in *bales*. You cannot add nuts to tonnes. | per crop | Exclude from the pooled LP | `unit_check()` [L262](or_core.py#L262) |
| 6 | **Partial years.** 1997 and 2020 have far fewer rows. | — | Use 1998–2019 | [server.py#L285](webapp/server.py#L285) |

**Result:** 575,879 → **358,739** clean rows. After the ×100 fix, rice yields come out at 1.8–2.8 t/ha, which matches official figures. So Production is in **tonnes** and Yield in **t/ha**. The PPT said quintals, but the data shows tonnes.

**How the duplicate copy was detected** (`reconcile_stacked_sources`, [L144–193](or_core.py#L144)):

1. Find rows that share State, District, Year, Season, Crop and Area ([L161](or_core.py#L161)).
2. Compute the Production ratio of each pair. The most common ratio is 100, in 99.4% of pairs ([L171–175](or_core.py#L171)).
3. All the "small" twins come before row 236,378 and all the "big" twins after it, so the code divides the second block by 100 ([L182–188](or_core.py#L182)).

**Graph:** [results/fig1_stacked_source_fix.png](results/fig1_stacked_source_fix.png) (Fig. 1 in the IEEE paper).

![Stacked source fix](results/fig1_stacked_source_fix.png)

* The left panel is the raw file. Pooled yield climbs from about 200 to over 1,000 because two scales are mixed.
* The right panel is after the fix: a sensible 4–6 t/ha.
* The jump at 2020 is because 2020 is a partial year, which is why we stop at 2019.

**The unit check rule** ([L262–292](or_core.py#L262)) excludes a crop if either:

* it is in the known non-weight list (`NON_WEIGHT_UNITS`, [L116](or_core.py#L116)); or
* its median yield is more than 250× (or less than 1/250×) the median of all crops ([L284](or_core.py#L284)). This catches unknown count-type crops in uploaded files.

For Karnataka Kharif, **Mesta** and **Cotton** are excluded (bales).

---

## Part 4 · From raw data to LP numbers

We pick a **scope**: one state, one season and a range of years. The default is **Karnataka, Kharif, 1998–2019** ([server.py#L287](webapp/server.py#L287)). Filtering happens in `filter_scope()` at [or_core.py#L246](or_core.py#L246).

For each crop $c$ we compute these numbers in `build_coefficients()` at [or_core.py#L306](or_core.py#L306).

**Step 1: add up all districts for each year** ([L318–321](or_core.py#L318)):

$$A_{c,t} = \sum_{\text{districts}} \text{Area}, \qquad P_{c,t} = \sum_{\text{districts}} \text{Production}, \qquad Y_{c,t} = \frac{P_{c,t}}{A_{c,t}}$$

Here $t$ is the year. We take total production ÷ total area rather than averaging the district Yield column, because averaging district yields would treat a 10-hectare district the same as a 100,000-hectare one.

**Step 2: the LP inputs** ([L327](or_core.py#L327), [L332–334](or_core.py#L332)):

| Symbol | Meaning | Formula | Code |
|---|---|---|---|
| $y_c$ | yield coefficient (t/ha) | $y_c = \frac{1}{T}\sum_t Y_{c,t}$, the average over the $T$ years | [L327](or_core.py#L327) |
| $a_c$ | minimum area | $a_c = \min_t A_{c,t}$, the smallest area the crop ever had | [L332](or_core.py#L332) |
| $m_c$ | maximum area | $m_c = \max_t A_{c,t}$, the largest area the crop ever had | [L332](or_core.py#L332) |
| $\bar{A}_c$ | historical area | $\bar{A}_c = \frac{1}{T}\sum_t A_{c,t}$, the average area (the "actual" plan) | [L333](or_core.py#L333) |

**Step 3: the baseline** (`historical_baseline()`, [L495–498](or_core.py#L495)):

$$L = \sum_c \bar{A}_c \qquad\qquad D = \sum_c y_c \,\bar{A}_c$$

* $L$ is the land historically used: **6,125,458 ha**.
* $D$ is the historical output valued at the average yields: **9,729,947 t**.

We value the historical plan with the same $y_c$ as the optimal plan, so the comparison is fair: both plans are scored with the same yields.

**A rule to remember:** a crop enters the LP only if it has data in at least ⅔ of the years. For 22 years that is **15** years ([server.py#L192](webapp/server.py#L192)). Crops with gaps would give unreliable averages. In Karnataka Kharif, **19 crops** pass.

`apply_bounds()` ([L341](or_core.py#L341)) copies $a_c, m_c$ into the columns the solver uses (`lo`, `hi`). In "band" mode it sets them to $\bar{A}_c(1 \pm p\%)$ instead, which is used in sensitivity analysis.

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
| variables $x_c$ with $a_c \le x_c \le m_c$ | [or_core.py#L417](or_core.py#L417) `LpVariable(lowBound=lo, upBound=hi)` | [L395](or_core.py#L395) `bounds=(lo, hi)` |
| $Z = \sum y_c x_c$ | [L419](or_core.py#L419) `output = lpSum(y_c * x_c)` | [L397](or_core.py#L397) `linprog(-y_c, …)` |
| maximise | [L415](or_core.py#L415) `LpMaximize`, [L422](or_core.py#L422) | linprog only minimises, so we minimise $-Z$ |
| $\sum x_c \le L$ | [L420](or_core.py#L420) `land = lpSum(x)`, [L423](or_core.py#L423) `land <= L` | [L397](or_core.py#L397) `A_ub=[1,…,1], b_ub=[L]` |
| solve | [L427](or_core.py#L427) CBC solver | HiGHS solver |
| shadow price $\lambda^*$ | [L433](or_core.py#L433) `constraints["Land"].pi` | [L401](or_core.py#L401) `ineqlin.marginals` |
| reduced costs | [L431](or_core.py#L431) `x.dj` | — |
| entry point | `solve_max_output()` [L459](or_core.py#L459) | |

Both solvers run every time, and the web app shows that they agree (to within 0.1 t on the Karnataka case).

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

The code labels each crop "at max", "at min" or "basic" in `_bound_status()` ([L380](or_core.py#L380)). The explanation text in the app ("Bajra is the marginal crop…") is written by `interpret_max()` at [server.py#L407](webapp/server.py#L407).

### 5.5 The graph

[results/fig3_opt1_allocation.png](results/fig3_opt1_allocation.png) is Fig. 3 in the IEEE paper and the "Historical vs optimal hectares" chart in the app.

![Opt 1 allocation](results/fig3_opt1_allocation.png)

* **Blue** is the historical average area; **orange** is the LP plan; the grey tick is $m_c$.
* Potato, Onion, Maize, Rice, Ragi, Jowar and Soyabean go up to their tick (max).
* Bajra sits in between: it is the marginal crop, with $\lambda^* = 0.808$.
* Pulses, oilseeds and small millets drop to their minimum.

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
| minimise $\sum x_c$ | [L415](or_core.py#L415) `LpMinimize`, [L425](or_core.py#L425) | [L402](or_core.py#L402) `linprog(c=[1,…,1])` |
| $\sum y_c x_c \ge D$ | [L426](or_core.py#L426) `output >= D` | [L402](or_core.py#L402) written as $-\sum y_c x_c \le -D$, because linprog only accepts ≤ |
| bounds | [L417](or_core.py#L417) | [L395](or_core.py#L395) |
| $\mu^*$ | [L433](or_core.py#L433) `constraints["Target"].pi` | [L406](or_core.py#L406) |
| entry point | `solve_min_land()` [L464](or_core.py#L464) | |

The target $D$ is the historical output by default. The app's slider changes it from 50% to 150% ([server.py#L457](webapp/server.py#L457)).

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

* Code: [server.py#L471](webapp/server.py#L471) for the app, and [run_case_study.py#L96-L98](run_case_study.py#L96) for the report.
* The app shows this as the "Duality check" note on the *Minimise land* tab.

> **Be precise if asked:** the PPT calls the two models a "primal/dual pairing". Strictly, they are not formal LP duals of each other; they are the **inverse** (swapped) forms of the same resource problem. What is mathematically exact is the reciprocal relationship between their shadow prices, and that is what we verify.

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

---

## Part 8 · Sensitivity analysis (Review III)

"How sure are we?" Code is in [or_core.py#L504–573](or_core.py#L504); the app's *Sensitivity* tab calls them through [server.py#L491](webapp/server.py#L491).

### 8.1 Varying the land budget: Z*(L) and λ*(L)

`parametric_land()` ([L504](or_core.py#L504)) solves Optimization 1 for 80–120 different values of $L$.

[results/fig5_parametric_land.png](results/fig5_parametric_land.png) (Fig. 4 in the IEEE paper):

![Parametric land](results/fig5_parametric_land.png)

* **Left, $Z^*(L)$:** output grows as land grows, but more and more slowly. This is **diminishing returns**: the best crops fill up first, so extra land goes to worse crops.
* **Right, $\lambda^*(L)$:** the slope of the left curve. It falls in **steps**, and each step is the moment one crop reaches its max and the next-best crop becomes marginal. The dotted line is the historical $L$.

The curve is **concave** (bends downward). This is a general LP fact: the optimal value as a function of a right-hand side is piecewise-linear and concave for a maximisation.

### 8.2 How much freedom does the gain need? (bound band)

`bound_band_sweep()` ([L562](or_core.py#L562)) replaces the bounds with $\bar{A}_c(1 \pm p\%)$, meaning each crop can move only ±p% from its average, and re-solves both models.

| Band | Output gain | Land saving |
|---|---|---|
| ±10% | **6.2%** | **5.0%** |
| historical min/max (default) | 21.6% | 23.9% |

So the large gain needs big shifts. A realistic ±10% change still gives about 6%, which is in line with the +3.75–15% reported by Supriya et al. [4].

### 8.3 Yield ranging: how stable is the plan?

`yield_ranging()` ([L521](or_core.py#L521)) answers: *how far can each crop's yield change before the optimal plan changes?*

* a crop **at max** stays at max as long as $y_c \ge \lambda^*$;
* a crop **at min** stays at min as long as $y_c \le \lambda^*$;
* the **marginal** crop stays marginal between the yields of its neighbours.

**Example:** Castor seed (0.791) is just below $\lambda^* = 0.808$. A yield rise of only 0.017 t/ha would make it worth expanding. Potato (6.61) is far above, so its place is very safe.

### 8.4 Yield shock (code only)

`yield_shock()` ([L554](or_core.py#L554)) multiplies chosen yields by, say, −15% (a bad monsoon) and re-solves. If every yield falls by the same %, the plan stays the same and only the total drops. The simplified app no longer shows this, but it is still in `run_case_study.py` ([L129–137](run_case_study.py#L129)) and the report.

---

## Part 9 · District comparison (Review III)

`multi_district()` ([or_core.py#L579](or_core.py#L579)) repeats Parts 4–6 **separately for each district**, each with its own $y_c$, $a_c$, $m_c$, $L$ and $D$.

[results/fig7_multi_district.png](results/fig7_multi_district.png) (Fig. 5 in the IEEE paper):

![Multi-district](results/fig7_multi_district.png)

* 27 districts; median gain **25.8%**.
* Highest gains are in diverse dry districts: **Koppal +65%**, **Gadag +55%**. They grow many crops with very different yields, so re-allocation has room to help.
* Lowest gains are in coastal rice districts: **Udupi +0.2%**, Dakshina Kannada +0.6%. They grow almost only rice, so there is nothing to re-allocate.

The lesson: **the LP helps most where the crop mix is diverse.**

---

## Part 10 · How the code fits together

### 10.1 Files

| File | Role | Read it when… |
|---|---|---|
| [or_core.py](or_core.py) | **All the OR logic**: cleaning, unit check, coefficients, both LPs, sensitivity, districts | the faculty asks about the method (most important file) |
| [webapp/server.py](webapp/server.py) | FastAPI server: receives requests from the web page, calls `or_core`, returns JSON | they ask how the UI gets its numbers |
| [webapp/static/app.js](webapp/static/app.js) | The web page: tabs, sliders, charts (Plotly) | they ask about the interface |
| [run_case_study.py](run_case_study.py) | Produces every number and figure in REPORT.md → `results/` | you want to reproduce the report |
| [ieee_paper/make_figures.py](ieee_paper/make_figures.py) | Produces the IEEE paper figures (PDF) | you need the paper figures again |
| [generate_synthetic_data.py](generate_synthetic_data.py) | Builds the demo test files in `sample_data/` | they ask how the demo data was made |
| [REPORT.md](REPORT.md), [ieee_paper/main.tex](ieee_paper/main.tex) | Write-ups | — |

### 10.2 The pipeline (PPT slide 14 workflow → code)

| PPT workflow step | Function | Line |
|---|---|---|
| Government dataset | `pd.read_csv` → `standardise()` | [or_core.py#L71](or_core.py#L71) |
| Filter state/season, clean rows | `clean()`, `filter_scope()` | [L196](or_core.py#L196), [L246](or_core.py#L246) |
| Check production-unit consistency | `unit_check()` | [L262](or_core.py#L262) |
| Average yield/ha per crop | `build_coefficients()` | [L306](or_core.py#L306) |
| Formulate LP | `_solve()` | [L409](or_core.py#L409) |
| Solve (PuLP / SciPy) | `solve_max_output()`, `solve_min_land()`, `_scipy()` | [L459](or_core.py#L459), [L464](or_core.py#L464), [L393](or_core.py#L393) |
| Compare vs historical | `historical_baseline()` and the `change_ha` column | [L495](or_core.py#L495), [L453](or_core.py#L453) |
| Visualise & interpret | web app, `run_case_study.py` | — |

### 10.3 Web app tabs → backend

Start the app with `python webapp/server.py`, then open http://127.0.0.1:8000.

| Tab | Page code (app.js) | API (server.py) | OR functions |
|---|---|---|---|
| 1 Data | [L152](webapp/static/app.js#L152), [L242](webapp/static/app.js#L242) | `/api/prepare` [L266](webapp/server.py#L266) | `clean` |
| 2 Explore | [L292](webapp/static/app.js#L292) | `/api/explore` [L313](webapp/server.py#L313) | `unit_check`, summaries |
| 3 Crops | [L339](webapp/static/app.js#L339) | `/api/crops` [L390](webapp/server.py#L390) | `unit_check`, `build_coefficients` |
| 4 Maximise output | [L444](webapp/static/app.js#L444) | `/api/optimize/max` [L436](webapp/server.py#L436) | `solve_max_output` |
| 5 Minimise land | [L484](webapp/static/app.js#L484) | `/api/optimize/min` [L457](webapp/server.py#L457) | `solve_min_land` + duality check |
| 6 Sensitivity | [L519](webapp/static/app.js#L519) | `/api/sensitivity` [L491](webapp/server.py#L491) | `parametric_land`, `bound_band_sweep`, `yield_ranging` |
| 7 Districts | [L554](webapp/static/app.js#L554) | `/api/districts` [L521](webapp/server.py#L521) | `multi_district` |
| Model | [L585](webapp/static/app.js#L585) | — | the equations, written out |

Every API request rebuilds the inputs with `build_ctx()` ([server.py#L184](webapp/server.py#L184)): filter scope → unit check → coefficients → bounds. On the Maximise and Minimise tabs, open **"The LP as solved"** to see the exact equations PuLP received, with real numbers (built by `_lp_text()`, [or_core.py#L469](or_core.py#L469)).

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
1997 and 2020 are partial years with far fewer records ([server.py#L285](webapp/server.py#L285) picks years with at least 65% of the median row count).

**Q8. Isn't 21.6% unrealistic?**
It assumes every crop can move anywhere within its historical min–max. With a realistic ±10% limit, the gain is 6.2%, which is consistent with published LP crop studies (3.75–15%). Both numbers are reported.

**Q9. What about profit, soil, irrigation and rotation?**
They are not in the dataset, so they are not modelled. We say so openly instead of inventing numbers (Assumptions & Limitations).

**Q10. What is the ×100 duplicate problem?**
The CSV contains the same 212,373 records twice; the second copy's production is ×100. Left unfixed, yields mix two scales and older years count twice. We detect it automatically and fix it (Part 3.3).

---

## Part 12 · Cheat sheet

### Equations

$$\text{Yield}_{c,t} = \frac{\sum \text{Production}}{\sum \text{Area}}, \qquad y_c = \text{mean}_t\,\text{Yield}_{c,t}, \qquad a_c = \min_t A_{c,t}, \qquad m_c = \max_t A_{c,t}$$

$$L = \sum_c \bar{A}_c, \qquad D = \sum_c y_c \bar{A}_c$$

$$\textbf{Opt 1:}\ \max \sum_c y_c x_c \ \text{ s.t. } \sum_c x_c \le L,\ a_c \le x_c \le m_c,\ x_c \ge 0$$

$$\textbf{Opt 2:}\ \min \sum_c x_c \ \text{ s.t. } \sum_c y_c x_c \ge D,\ a_c \le x_c \le m_c,\ x_c \ge 0$$

$$\lambda^* = y_{\text{marginal crop}}, \qquad \mu^* = \frac{1}{\lambda^*}\ \text{(at the same point)}, \qquad \text{gain} = \frac{Z^* - D}{D}, \qquad \text{saving} = \frac{L - \text{Land}^*}{L}$$

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
| Districts | 27, median gain 25.8%; Koppal +65%, Udupi +0.2% |

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
