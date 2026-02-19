# RealFood? — AI MVP Scope: The Intelligence Baseline

## 1. Problem Statement

UK consumers face a labelling environment where ultra-processed foods (UPFs) hide
behind compliant-but-misleading ingredient lists. Existing barcode-lookup apps
(e.g., Yuka, Open Food Facts) return static database entries. They cannot reason
about what an ingredient *implies* or detect "stealth" reformulations.

RealFood? closes this gap with **Semantic Label Analysis**: an LLM-backed
inference layer that sits *above* OCR and *below* the user-facing score.

---

## 2. Two-Layer Architecture

### Layer 1 — OCR (Optical Character Recognition)

| Aspect | Detail |
|---|---|
| **Purpose** | Extract raw text from a photograph of a food label. |
| **Technology** | Google Cloud Vision API / Apple Vision framework (on-device). |
| **Output** | Unstructured string of ingredients, nutrition table values, allergen warnings. |
| **Limitations** | Zero semantic understanding. Cannot distinguish "flavouring" from "natural flavouring". Cannot infer that "modified starch" is a UPF marker. |

**OCR is a solved problem. It is necessary but not sufficient.**

### Layer 2 — Semantic Label Analysis (SLA)

| Aspect | Detail |
|---|---|
| **Purpose** | Interpret the OCR output: classify ingredients, flag UPF markers, detect label tricks, generate a human-readable verdict. |
| **Technology** | LLM (Claude API) with structured output, deterministic scoring rubric, and a curated knowledge graph of UK-approved additives. |
| **Output** | Structured JSON: `{ ingredients: [...], flags: [...], score: float, traffic_light: "red"|"amber"|"green", reasoning: string }` |
| **Capabilities beyond OCR** | Fuzzy-match misspelled ingredients. Detect broken-out sugars. Identify "clean label" substitutions (e.g., "rice starch" replacing "modified starch"). Contextual allergen interpretation. |

---

## 3. Intelligence Baseline — What the MVP Must Do

### 3.1 Must-Have (P0)

| ID | Capability | Acceptance Criteria |
|---|---|---|
| P0-1 | **Ingredient Extraction** | Given OCR text, return a structured list of individual ingredients with correct nesting (compound ingredients). |
| P0-2 | **UPF Marker Detection** | Flag any ingredient on the NOVA Group 4 / FSA UPF watchlist. Minimum 200 markers at launch. |
| P0-3 | **Traffic-Light Score** | Deterministic score (0–100) mapped to Red / Amber / Green. Reproducible: same input always yields same score. |
| P0-4 | **UK Nutrition Table Parsing** | Parse per-100g and per-serving values for energy (kJ/kcal), fat, saturates, carbohydrate, sugars, fibre, protein, salt. |
| P0-5 | **Allergen Extraction** | Identify declared allergens (bold text convention per UK FIR 2014). |
| P0-6 | **Safety Guardrails** | Never output medical advice, dietary prescriptions, or unqualified health claims. |

### 3.2 Should-Have (P1)

| ID | Capability | Detail |
|---|---|---|
| P1-1 | **Broken-Out Sugar Detection** | Identify when manufacturers list multiple sugar sources separately to push "sugars" down the ingredient list. |
| P1-2 | **"Clean Label" Substitution Alerts** | Detect when a UPF marker is replaced with a less-known equivalent (e.g., "pea fibre" instead of "cellulose"). |
| P1-3 | **Additive E-Number Resolution** | Map E-numbers to plain-English names and risk categories. |
| P1-4 | **Compound Ingredient Unpacking** | Parse nested brackets, e.g., "Chocolate (sugar, cocoa butter, emulsifier (soya lecithin))". |

### 3.3 Could-Have (P2)

| ID | Capability | Detail |
|---|---|---|
| P2-1 | **Historical Reformulation Tracking** | Compare current label to previous version. Flag silent changes. |
| P2-2 | **Batch / Best-Before Context** | Use date codes to flag products near recall windows. |
| P2-3 | **Multi-Language Label Support** | Handle bilingual UK labels (English + Welsh, or EU-origin imports). |

---

## 4. Data Flow (MVP)

```
[Camera] --> [OCR Engine] --> raw_text: string
                                  |
                                  v
                         [Pre-processor]
                         - Normalise Unicode
                         - Strip artefacts
                         - Detect label sections
                                  |
                                  v
                         [Semantic Label Analyser (LLM)]
                         - System prompt + rubric
                         - Ingredient knowledge graph lookup
                         - UPF flag matching (deterministic)
                         - Nutrition parsing
                                  |
                                  v
                         [Scoring Engine]
                         - Deterministic rubric
                         - Traffic-light assignment
                                  |
                                  v
                         [Response Builder]
                         - Structured JSON
                         - Human-readable summary
                         - Guardrail filter (final pass)
                                  |
                                  v
                         [Client App]
```

---

## 5. Technology Stack (MVP)

| Component | Choice | Rationale |
|---|---|---|
| OCR | Google Cloud Vision API | Best-in-class for UK label fonts; handles curved text on packaging. |
| LLM | Claude (Anthropic) via API | Strong instruction-following, structured output, lower hallucination rate on factual lookups. |
| Knowledge Graph | Neo4j (hosted) or SQLite + JSON (local-first MVP) | Ingredient-to-flag relationships. Vector index for fuzzy matching. |
| Embeddings | `voyage-3-lite` or `text-embedding-3-small` | Ingredient name fuzzy matching and deduplication. |
| Backend | Python 3.12 + FastAPI | Async, type-safe, rapid prototyping. |
| Client | React Native (Expo) | Cross-platform UK App Store + Google Play. |
| Hosting | Railway / Fly.io (MVP) | Low-cost, EU-region availability for GDPR compliance. |

---

## 6. What Is NOT in the MVP

- Barcode scanning / Open Food Facts lookup (Phase 2 integration).
- User accounts or personalisation.
- Dietary recommendations or meal planning.
- Any form of medical or nutritional advice.
- Social features (sharing, reviews).
