# RealFood? — Scoring Engine: Deterministic Traffic-Light Rubric

## 1. Design Principles

1. **Deterministic**: Identical input always produces identical output. No LLM temperature variance in scoring.
2. **Transparent**: Every point deduction is traceable to a specific ingredient or nutritional value.
3. **FSA-aligned**: Nutritional thresholds use the UK FSA front-of-pack traffic-light criteria.
4. **Composable**: The score is a weighted sum of independent sub-scores, each auditable.

---

## 2. Master Formula

The overall product score is computed as:

```
Score = S_upf + S_nutrition + S_additives + S_label_tricks + S_positives
```

Where each component is defined below. The final score is clamped to [0, 100].

### 2.1 Full LaTeX Representation

```latex
\text{Score}_{\text{final}} = \text{clamp}\Bigg(
  100
  - \underbrace{\sum_{i=1}^{N} w_{\text{upf}}(c_i) \cdot \text{UPF}(i)}_{\text{UPF penalty } S_{\text{upf}}}
  - \underbrace{\sum_{k \in \mathcal{N}} w_k \cdot \delta_k}_{\text{Nutrition penalty } S_{\text{nutrition}}}
  - \underbrace{\sum_{j=1}^{M} w_{\text{add}}(a_j)}_{\text{Additive penalty } S_{\text{additives}}}
  - \underbrace{\sum_{t=1}^{T} w_{\text{trick}}(t)}_{\text{Label trick penalty } S_{\text{label\_tricks}}}
  + \underbrace{\sum_{p=1}^{P} w_{\text{pos}}(p)}_{\text{Positive bonus } S_{\text{positives}}}
,\; 0,\; 100 \Bigg)
```

---

## 3. Component Definitions

### 3.1 UPF Penalty — `S_upf`

Each ingredient `i` is checked against the UPF marker database. If flagged, a
penalty is applied based on the ingredient's **position** in the list (proxy for
quantity) and its **severity class**.

| Severity Class | Description | Base Weight |
|---|---|---|
| **Class A — Critical** | Hydrogenated fats, high-fructose syrups, artificial sweeteners (aspartame, acesulfame-K) | 8.0 |
| **Class B — High** | Modified starches, emulsifiers (polysorbates, carrageenan), artificial colours | 5.0 |
| **Class C — Moderate** | Maltodextrin, dextrose, "flavourings" (unspecified), invert sugar syrup | 3.0 |
| **Class D — Low** | Citric acid (when functional), mono- and diglycerides, pectin (non-fruit context) | 1.5 |

**Position decay function** — ingredients listed first are present in larger quantities:

```latex
w_{\text{upf}}(c_i) = \text{BaseWeight}(c_i) \times \left(1 - \frac{\text{pos}(i) - 1}{N}\right)^{0.5}
```

Where `pos(i)` is the 1-indexed position and `N` is total ingredient count.

**Example**: Hydrogenated fat listed 2nd of 15 ingredients:

```
w = 8.0 * (1 - 1/15)^0.5 = 8.0 * 0.9333^0.5 = 8.0 * 0.966 = 7.73
```

### 3.2 Nutrition Penalty — `S_nutrition`

Uses FSA front-of-pack thresholds (per 100g for food, per 100ml for drinks).

| Nutrient `k` | Green (no penalty) | Amber (partial) | Red (full penalty) | Max Weight `w_k` |
|---|---|---|---|---|
| Fat | <= 3.0g | 3.1–17.5g | > 17.5g | 5.0 |
| Saturates | <= 1.5g | 1.6–5.0g | > 5.0g | 5.0 |
| Sugars | <= 5.0g | 5.1–22.5g | > 22.5g | 6.0 |
| Salt | <= 0.3g | 0.31–1.5g | > 1.5g | 6.0 |

**Penalty calculation per nutrient**:

```latex
\delta_k = \begin{cases}
0 & \text{if value}_k \leq \text{green}_k \\
\frac{\text{value}_k - \text{green}_k}{\text{red}_k - \text{green}_k} & \text{if green}_k < \text{value}_k \leq \text{red}_k \\
1 & \text{if value}_k > \text{red}_k
\end{cases}
```

Penalty contribution: `w_k * delta_k`

### 3.3 Additive Penalty — `S_additives`

E-number additives not already captured by UPF flags are scored by risk tier:

| Tier | Examples | Penalty |
|---|---|---|
| **Tier 1 — Under regulatory review** | E171 (titanium dioxide — banned EU, under FSA review), E110, E129 | 4.0 each |
| **Tier 2 — Contested evidence** | E250 (sodium nitrite), E621 (MSG), E951 (aspartame) | 2.5 each |
| **Tier 3 — Generally recognised** | E330 (citric acid), E322 (lecithins), E412 (guar gum) | 0.5 each |

Cap: `S_additives <= 15` (prevents over-punishment of products with many benign E-numbers).

### 3.4 Label Trick Penalty — `S_label_tricks`

Detected deceptive labelling practices:

| Trick | Detection Method | Penalty |
|---|---|---|
| **Broken-out sugars** | >= 3 distinct sugar sources in ingredient list | 5.0 |
| **"Flavouring" ambiguity** | Unqualified "flavouring" or "flavourings" without "natural" prefix | 2.0 |
| **Clean-label swap** | Known UPF substitute detected (e.g., "rice starch" for "modified starch") | 3.0 |
| **Percentage game** | Key characterising ingredient at legal minimum (e.g., "Chicken Pie" with 12% chicken) | 4.0 |
| **Health halo claims** | "No added sugar" but contains concentrated fruit juice sweetener | 3.0 |

Cap: `S_label_tricks <= 12`

### 3.5 Positive Bonus — `S_positives`

| Factor | Criteria | Bonus |
|---|---|---|
| **High fibre** | >= 6g per 100g | +3.0 |
| **High protein** | >= 20% energy from protein | +2.0 |
| **Whole ingredient list** | All ingredients are single-word whole foods (e.g., "oats, water, salt") | +5.0 |
| **Short ingredient list** | <= 5 ingredients, all recognisable | +3.0 |
| **Organic certification** | UK Soil Association or EU organic logo detected | +2.0 |

Cap: `S_positives <= 10`

---

## 4. Traffic-Light Mapping

| Score Range | Traffic Light | Label | Consumer Guidance |
|---|---|---|---|
| 75–100 | **Green** | "Good choice" | Predominantly whole ingredients. Low processing markers. |
| 45–74 | **Amber** | "Some concerns" | Contains some processed elements. Review flagged ingredients. |
| 0–44 | **Red** | "High concern" | Significant UPF markers, poor nutritional profile, or deceptive labelling detected. |

---

## 5. Worked Example

**Product**: Supermarket own-brand "Chicken & Bacon Sandwich"

**Ingredients (OCR output)**: Malted wheat flour, water, cooked chicken breast (15%) (chicken breast, water, salt, dextrose, stabiliser: sodium triphosphate), smoked bacon (8%) (pork belly, salt, dextrose, antioxidant: sodium ascorbate, preservative: sodium nitrite, smoke flavouring), mayonnaise (rapeseed oil, water, pasteurised free range egg yolk, spirit vinegar, sugar, salt, mustard flour, flavouring), tomato, lettuce, emulsifier (mono- and diglycerides of fatty acids), humectant (glycerol), flour treatment agent (ascorbic acid).

**Nutrition per 100g**: Energy 920kJ, Fat 8.2g, Saturates 1.8g, Carbohydrate 24.1g, Sugars 3.2g, Fibre 1.9g, Protein 10.1g, Salt 1.1g.

### Scoring Breakdown

**UPF Penalties**:
- Dextrose (Class C, pos 7/25): `3.0 * (1 - 6/25)^0.5 = 3.0 * 0.872 = 2.62`
- Sodium triphosphate (Class B, pos 9/25): `5.0 * (1 - 8/25)^0.5 = 5.0 * 0.824 = 4.12`
- Dextrose again (Class C, pos 14/25): `3.0 * (1 - 13/25)^0.5 = 3.0 * 0.693 = 2.08`
- Sodium nitrite (Class A, pos 16/25): `8.0 * (1 - 15/25)^0.5 = 8.0 * 0.632 = 5.06`
- Smoke flavouring (Class C, pos 17/25): `3.0 * (1 - 16/25)^0.5 = 3.0 * 0.600 = 1.80`
- "Flavouring" unqualified (Class C, pos 22/25): `3.0 * (1 - 21/25)^0.5 = 3.0 * 0.400 = 1.20`
- Mono- and diglycerides (Class D, pos 23/25): `1.5 * (1 - 22/25)^0.5 = 1.5 * 0.346 = 0.52`
- Glycerol (Class C, pos 24/25): `3.0 * (1 - 23/25)^0.5 = 3.0 * 0.283 = 0.85`

**S_upf** = 2.62 + 4.12 + 2.08 + 5.06 + 1.80 + 1.20 + 0.52 + 0.85 = **18.25**

**Nutrition Penalties**:
- Fat 8.2g: amber zone. `delta = (8.2 - 3.0) / (17.5 - 3.0) = 0.359`. Penalty: `5.0 * 0.359 = 1.79`
- Saturates 1.8g: amber zone. `delta = (1.8 - 1.5) / (5.0 - 1.5) = 0.086`. Penalty: `5.0 * 0.086 = 0.43`
- Sugars 3.2g: green zone. Penalty: 0
- Salt 1.1g: amber zone. `delta = (1.1 - 0.3) / (1.5 - 0.3) = 0.667`. Penalty: `6.0 * 0.667 = 4.00`

**S_nutrition** = 1.79 + 0.43 + 0 + 4.00 = **6.22**

**Additive Penalties**:
- E250 (sodium nitrite) — Tier 2: 2.5 (already counted in UPF but additive risk is additive)

**S_additives** = **2.5**

**Label Trick Penalties**:
- Dextrose appears in 2 sub-ingredients (not quite 3 sugar sources — no broken-out sugar penalty)
- "Flavouring" unqualified: 2.0

**S_label_tricks** = **2.0**

**Positives**: None applicable.

**Final Score** = 100 - 18.25 - 6.22 - 2.5 - 2.0 + 0 = **71.03**

**Traffic Light**: **Amber** — "Some concerns"

---

## 6. Implementation Notes

- All weights are stored in a versioned configuration file (`scoring_config.yaml`), not hardcoded.
- The LLM is used for ingredient classification and label trick detection; the arithmetic is deterministic Python.
- Score reproducibility is enforced by unit tests: given a fixed config and input, the output must be bit-identical.
- Version the rubric. When weights change, old scores are not retroactively updated — products are re-scored on next scan.
