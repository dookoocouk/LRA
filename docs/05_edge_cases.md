# Deliverable 5: 20 AI Edge Cases — Hallucination Risks & Label Tricks

> **Project:** RealFood? — UK Food Label Decoder App
> **Version:** 1.0
> **Date:** 19 February 2026

---

## Overview

This document catalogues 20 edge cases that the RealFood? AI pipeline must handle correctly. They are split into two categories:

- **Section A — Hallucination Risks:** Cases where the AI model may fabricate, misinterpret, or over-confidently report information that is not present (or not accurately present) in the source label image.
- **Section B — Label Tricks:** Legitimate-but-misleading manufacturer practices designed to make a product appear healthier than it is. The AI must detect these and factor them into its scoring.

Each case includes worked examples, expected correct behaviour, and mitigation or detection strategies.

---

## Section A: Hallucination Risks

These are failure modes where the AI produces output that is factually wrong relative to the actual label data. Hallucinations erode user trust and can pose genuine safety risks, particularly around allergen information.

---

### A-1: Allergen Cross-Contamination Warning Parsed as Declared Ingredient

**Title:** "May contain traces of nuts" misread as an actual ingredient

**Description:**
Precautionary allergen labelling (PAL) such as "May contain traces of nuts" or "Made in a factory that handles milk" is a risk warning, not an ingredient declaration. If the AI treats this text as part of the ingredients list, it will incorrectly report nuts or milk as declared ingredients, inflating the allergen profile and misleading users who rely on the distinction between "contains" and "may contain" for dietary decisions.

**Example Input (OCR text):**
```
Ingredients: Wheat Flour, Sugar, Vegetable Oil, Salt.
Allergy Advice: May contain traces of nuts and milk.
```

**Wrong AI Output:**
```json
{
  "ingredients": ["Wheat Flour", "Sugar", "Vegetable Oil", "Salt", "Nuts", "Milk"],
  "allergens_declared": ["Wheat", "Nuts", "Milk"]
}
```

**Correct AI Output:**
```json
{
  "ingredients": ["Wheat Flour", "Sugar", "Vegetable Oil", "Salt"],
  "allergens_declared": ["Wheat"],
  "allergens_precautionary": ["Nuts", "Milk"]
}
```

**Mitigation:**
- Implement a dedicated parsing stage that distinguishes the "Ingredients:" block from "Allergy Advice:" / "May contain:" blocks using keyword anchors.
- Maintain a regular-expression allowlist for common PAL phrases (e.g., `may contain`, `produced in a factory`, `not suitable for`, `traces of`).
- In the data schema, separate `allergens_declared` from `allergens_precautionary` so downstream logic never conflates the two.
- Add a post-processing validation rule: any allergen sourced solely from a PAL phrase must not appear in the declared ingredients list unless it is independently present there.

---

### A-2: Fabricated Ingredient Not Present in OCR Text

**Title:** AI invents an ingredient not present in the OCR text

**Description:**
Large language models can "fill in the gaps" based on training data. If the label says "vegetable oil" without specifying the source, the AI may hallucinate a specific oil such as "palm oil" or "rapeseed oil" because those are statistically common in UK products. This is dangerous: palm oil is a concern for some users on environmental grounds, and rapeseed oil is an allergen consideration for a small number of individuals.

**Example Input (OCR text):**
```
Ingredients: Wheat Flour (Wheat), Vegetable Oil, Sugar, Raising Agents
(Sodium Bicarbonate, Ammonium Bicarbonate), Salt.
```

**Wrong AI Output:**
```json
{
  "ingredients": ["Wheat Flour", "Palm Oil", "Sugar", "Sodium Bicarbonate", "Ammonium Bicarbonate", "Salt"]
}
```

**Correct AI Output:**
```json
{
  "ingredients": ["Wheat Flour", "Vegetable Oil", "Sugar", "Sodium Bicarbonate", "Ammonium Bicarbonate", "Salt"],
  "notes": ["Vegetable oil source not specified on label."]
}
```

**Mitigation:**
- Enforce a strict "closed-world" constraint: every ingredient in the output must have a direct textual span in the OCR input. Implement a token-alignment check that maps each output ingredient back to a character range in the source text.
- Where an ingredient is generic (e.g., "vegetable oil", "natural flavouring"), preserve the generic term verbatim and flag it with a note rather than speculating on the specific substance.
- During prompt engineering, include an explicit instruction: "Do not infer or specify ingredient sub-types that are not stated on the label."
- Run an automated post-check that diffs output ingredient tokens against input OCR tokens and flags any output token with no fuzzy match (Levenshtein distance > threshold) in the input.

---

### A-3: E-Number Hallucination

**Title:** AI assigns wrong E-number to an ingredient name

**Description:**
The AI may attempt to be "helpful" by appending E-numbers to ingredient names — for example, labelling citric acid as E330, which is correct, but labelling ascorbic acid as E300 when the label actually states E301 (sodium ascorbate). Worse, the AI may invent an E-number entirely. Incorrect E-number mappings could cause the app to apply the wrong risk classification (e.g., flagging a benign additive as controversial, or vice versa).

**Example Input (OCR text):**
```
Ingredients: Water, Sugar, Citric Acid, Sodium Benzoate, Ascorbic Acid.
```

**Wrong AI Output:**
```json
{
  "ingredients": [
    {"name": "Water"},
    {"name": "Sugar"},
    {"name": "Citric Acid", "e_number": "E330"},
    {"name": "Sodium Benzoate", "e_number": "E212"},
    {"name": "Ascorbic Acid", "e_number": "E304"}
  ]
}
```
*(E212 is incorrect — Sodium Benzoate is E211. E304 is ascorbyl palmitate, not ascorbic acid which is E300.)*

**Correct AI Output:**
```json
{
  "ingredients": [
    {"name": "Water"},
    {"name": "Sugar"},
    {"name": "Citric Acid", "e_number": "E330", "e_number_source": "lookup_table"},
    {"name": "Sodium Benzoate", "e_number": "E211", "e_number_source": "lookup_table"},
    {"name": "Ascorbic Acid", "e_number": "E300", "e_number_source": "lookup_table"}
  ]
}
```

**Mitigation:**
- Never allow the LLM to generate E-numbers from memory. Instead, use a verified lookup table (sourced from the UK Food Standards Agency or EU additive register) as a deterministic post-processing step.
- The AI should output ingredient names only; a separate service maps names to E-numbers using exact and fuzzy matching against the authoritative table.
- If no confident match is found in the lookup table, return `"e_number": null` rather than guessing.
- Include an `e_number_source` field so the front end can distinguish between label-stated E-numbers, lookup-derived E-numbers, and unresolved cases.

---

### A-4: Confidence Inflation on Blurry or Partial OCR Text

**Title:** AI reports high confidence on blurry or partial OCR text

**Description:**
When the input image is poor quality — blurred, partially obscured, badly lit, or creased — the OCR layer may produce garbled or incomplete text. The AI may nonetheless report high confidence scores for its ingredient extraction, giving the user a false sense of reliability. For example, OCR might capture "sod…m benz…te" and the AI confidently outputs "Sodium Benzoate" with 95% confidence, when the actual text could equally be "Sodium Benzoate" or a different compound.

**Example Input (OCR text, degraded):**
```
Ingredie ts: Whe t Fl ur, Su ar, V getable O l, S d  m B nz  te, Fl v urings.
OCR Confidence: 0.42
```

**Wrong AI Output:**
```json
{
  "ingredients": ["Wheat Flour", "Sugar", "Vegetable Oil", "Sodium Benzoate", "Flavourings"],
  "overall_confidence": 0.93
}
```

**Correct AI Output:**
```json
{
  "ingredients": [
    {"name": "Wheat Flour", "confidence": 0.75, "ocr_quality": "degraded"},
    {"name": "Sugar", "confidence": 0.70, "ocr_quality": "degraded"},
    {"name": "Vegetable Oil", "confidence": 0.65, "ocr_quality": "degraded"},
    {"name": "Sodium Benzoate", "confidence": 0.55, "ocr_quality": "degraded"},
    {"name": "Flavourings", "confidence": 0.60, "ocr_quality": "degraded"}
  ],
  "overall_confidence": 0.48,
  "warnings": ["Low OCR quality detected. Results may be unreliable. Please re-scan the label in better lighting."]
}
```

**Mitigation:**
- Propagate OCR-level confidence scores through to the AI extraction layer. The AI's output confidence for any ingredient must not exceed the OCR confidence for the corresponding text region.
- Define confidence thresholds: below 0.6 OCR confidence, the app should display an explicit warning and suggest re-scanning.
- Implement a "confidence calibration" layer: compare the AI's self-reported confidence against ground-truth accuracy on a test set of degraded images, and apply a correction factor.
- In the UI, visually distinguish low-confidence ingredients (e.g., greyed-out text, question-mark icon) so users know which items are uncertain.

---

### A-5: Category Bleed — Permitted Ingredient Mislabelled as Harmful

**Title:** AI classifies a permitted ingredient as harmful without context

**Description:**
Some ingredients serve multiple functions depending on context. Citric acid (E330) is a naturally occurring acid found in citrus fruits; it is also used as an acidity regulator and preservative. If the AI lacks contextual awareness, it may categorically flag citric acid as a "chemical preservative" in a lemon curd (where it is inherent to the lemons) or in a product where it is functioning as an acidity regulator rather than a preservative. This leads to unjustified penalty scores.

**Example Input (OCR text):**
```
Lemon Curd
Ingredients: Sugar, Whole Egg, Butter (Milk), Lemon Juice (22%), Cornflour,
Lemon Oil, Citric Acid.
```

**Wrong AI Output:**
```json
{
  "ingredient_flags": [
    {"name": "Citric Acid", "category": "Chemical Preservative", "risk": "moderate",
     "note": "Synthetic preservative added to extend shelf life."}
  ]
}
```

**Correct AI Output:**
```json
{
  "ingredient_flags": [
    {"name": "Citric Acid", "category": "Acidity Regulator", "risk": "low",
     "note": "Naturally present in citrus fruits. In a lemon-based product, likely used as an acidity regulator rather than a preservative. Classified as E330; generally recognised as safe."}
  ]
}
```

**Mitigation:**
- Build a context-aware classification system: the function assigned to a multi-use additive should consider the product category, the other ingredients present, and the additive's position in the ingredients list.
- Maintain a lookup table of multi-function additives with their possible roles (preservative, acidity regulator, antioxidant, flavouring) and the product contexts in which each role is most likely.
- Include product-category information in the AI prompt (e.g., "This is a lemon curd") so the model can reason about whether citric acid is intrinsic or added.
- Default to the least alarming plausible classification unless there is positive evidence of a more concerning use.

---

### A-6: Nutrition Table Cross-Contamination

**Title:** AI mixes per-100g and per-serving columns

**Description:**
UK nutrition labels commonly present two columns: "per 100g" and "per serving" (or "per portion"). If the AI (or the upstream OCR) does not correctly distinguish these columns, it may report per-serving values as per-100g values or vice versa. This leads to wildly inaccurate nutritional assessments — a product with 5g sugar per serving but 20g per 100g could appear four times healthier (or worse) than it actually is.

**Example Input (OCR text):**
```
                  Per 100g    Per Serving (25g)
Energy            1875 kJ     469 kJ
Fat               22.0 g      5.5 g
  of which saturates  11.0 g      2.8 g
Carbohydrate      58.0 g      14.5 g
  of which sugars    32.0 g      8.0 g
Protein            6.0 g      1.5 g
Salt               0.5 g      0.13 g
```

**Wrong AI Output:**
```json
{
  "nutrition_per_100g": {
    "energy_kj": 469,
    "fat_g": 5.5,
    "saturates_g": 2.8,
    "carbohydrate_g": 14.5,
    "sugars_g": 8.0,
    "protein_g": 1.5,
    "salt_g": 0.13
  }
}
```
*(These are the per-serving values, not per-100g.)*

**Correct AI Output:**
```json
{
  "nutrition_per_100g": {
    "energy_kj": 1875,
    "fat_g": 22.0,
    "saturates_g": 11.0,
    "carbohydrate_g": 58.0,
    "sugars_g": 32.0,
    "protein_g": 6.0,
    "salt_g": 0.5
  },
  "nutrition_per_serving": {
    "serving_size": "25g",
    "energy_kj": 469,
    "fat_g": 5.5,
    "saturates_g": 2.8,
    "carbohydrate_g": 14.5,
    "sugars_g": 8.0,
    "protein_g": 1.5,
    "salt_g": 0.13
  }
}
```

**Mitigation:**
- Use spatial/positional OCR data (bounding boxes) to cluster numeric values into columns before feeding them to the AI.
- Implement a plausibility check: per-serving values should be proportionally smaller than per-100g values by a factor consistent with the stated serving size. If per-100g sugars are reported as 8.0g and the serving is 25g, the ratio (8.0/25 × 100 = 32.0) should match the other column — if it does, the columns are swapped.
- Include explicit column-header detection in the OCR post-processing pipeline.
- Always require the AI to output both columns (where available) and the stated serving size, enabling automated cross-validation.

---

### A-7: Sub-Ingredient Promotion

**Title:** AI lists a sub-ingredient of a compound ingredient as a top-level ingredient

**Description:**
UK labelling law requires that compound ingredients (ingredients which are themselves made from multiple ingredients) list their sub-ingredients in parentheses. For example, "Chocolate Chips (Cocoa Mass, Sugar, Cocoa Butter, Emulsifier: Soya Lecithin)" — here, Soya Lecithin is a sub-ingredient of Chocolate Chips. If the AI flattens the hierarchy, it may promote Soya Lecithin to a top-level ingredient, distorting the product's composition profile. This makes the product appear to contain more additives than it does at the top level, and misrepresents ingredient ordering by weight.

**Example Input (OCR text):**
```
Ingredients: Wheat Flour, Chocolate Chips (Cocoa Mass, Sugar, Cocoa Butter,
Emulsifier: Soya Lecithin), Butter (Milk), Eggs, Sugar, Raising Agent
(Sodium Bicarbonate).
```

**Wrong AI Output:**
```json
{
  "ingredients": ["Wheat Flour", "Cocoa Mass", "Sugar", "Cocoa Butter", "Soya Lecithin",
                   "Butter", "Eggs", "Sugar", "Sodium Bicarbonate"]
}
```

**Correct AI Output:**
```json
{
  "ingredients": [
    {"name": "Wheat Flour", "level": 0},
    {"name": "Chocolate Chips", "level": 0, "sub_ingredients": [
      {"name": "Cocoa Mass", "level": 1},
      {"name": "Sugar", "level": 1},
      {"name": "Cocoa Butter", "level": 1},
      {"name": "Soya Lecithin", "level": 1, "function": "Emulsifier"}
    ]},
    {"name": "Butter", "level": 0, "sub_ingredients": [
      {"name": "Milk", "level": 1}
    ]},
    {"name": "Eggs", "level": 0},
    {"name": "Sugar", "level": 0},
    {"name": "Sodium Bicarbonate", "level": 0, "function": "Raising Agent"}
  ]
}
```

**Mitigation:**
- Parse parenthetical blocks as nested sub-ingredient lists. Use bracket-matching logic to correctly handle nested parentheses (e.g., compound ingredients within compound ingredients).
- Define a hierarchical ingredient schema with `level` fields (0 = top-level, 1 = sub-ingredient, 2 = sub-sub-ingredient) so that downstream scoring can weight appropriately.
- In the AI prompt, explicitly instruct: "Preserve the ingredient hierarchy as shown on the label. Sub-ingredients in parentheses must remain nested under their parent compound ingredient."
- Implement a structural validation rule: any ingredient token found inside parentheses in the OCR text must have `level >= 1` in the output.

---

### A-8: Brand Name Classified as Ingredient

**Title:** AI classifies a brand name as an ingredient

**Description:**
Food labels contain brand names, product names, marketing slogans, and other non-ingredient text. If the AI's text segmentation is poor, it may absorb these into the ingredients list. For example, "Hovis Seed Sensations" could lead to "Hovis" appearing as an ingredient, or "Warburtons Toastie" could result in "Warburtons" being flagged. This is particularly problematic when brand names resemble plausible ingredient terms.

**Example Input (OCR text):**
```
Hovis Seed Sensations
Seven Seeds
Ingredients: Wheat Flour (Wheat Flour, Calcium Carbonate, Iron, Niacin,
Thiamin), Water, Mixed Seeds (10%) (Sunflower Seeds, Linseed, Poppy Seeds,
Sesame Seeds, Pumpkin Seeds, Millet, Gold Linseed), Yeast, Salt, Soya Flour,
Vegetable Oil (Rapeseed), Emulsifiers (E472e, E481), Flour Treatment Agent
(Ascorbic Acid).
```

**Wrong AI Output:**
```json
{
  "ingredients": ["Hovis", "Wheat Flour", "Calcium Carbonate", "Iron", "Niacin",
                   "Thiamin", "Water", "Mixed Seeds", "Yeast", "Salt", "..."]
}
```

**Correct AI Output:**
```json
{
  "product_name": "Hovis Seed Sensations — Seven Seeds",
  "ingredients": [
    {"name": "Wheat Flour", "level": 0, "sub_ingredients": [
      {"name": "Calcium Carbonate", "level": 1},
      {"name": "Iron", "level": 1},
      {"name": "Niacin", "level": 1},
      {"name": "Thiamin", "level": 1}
    ]},
    {"name": "Water", "level": 0},
    {"name": "Mixed Seeds", "level": 0, "percentage": "10%"},
    "..."
  ]
}
```

**Mitigation:**
- Use the "Ingredients:" keyword as a hard boundary: only text after this keyword (and before the next section header such as "Allergy Advice:" or "Storage:") should be parsed as ingredients.
- Maintain a known-brands database (major UK brands: Hovis, Warburtons, Kingsmill, McVitie's, Cadbury, etc.) and exclude matches from the ingredient list.
- In the OCR pipeline, use spatial layout analysis to separate header/title regions from the ingredients panel.
- Instruct the AI explicitly: "Only extract text that appears after the 'Ingredients:' heading. Ignore product names, brand names, and marketing claims."

---

### A-9: Cooking Instructions Parsed as Ingredients

**Title:** AI parses cooking instructions as ingredient data

**Description:**
Food packaging typically includes cooking or preparation instructions adjacent to or near the ingredients list. Text such as "Heat in oven at 180°C for 25 minutes" or "Microwave on high for 3 minutes" contains no ingredient information, but if the AI's text segmentation fails, these instructions may be parsed as part of the ingredients. This could lead to nonsensical outputs like "Oven" or "180°C" appearing as ingredients.

**Example Input (OCR text):**
```
Ingredients: Chicken Breast (40%), Water, Rice Flour, Salt, Black Pepper,
Garlic Powder. Cooking Instructions: Remove sleeve. Pierce film lid several
times. Place on a baking tray in the centre of a pre-heated oven at 180°C /
Fan 160°C / Gas Mark 4 for 25 minutes. Stir halfway through. Leave to stand
for 1 minute after heating. Caution: product will be hot.
```

**Wrong AI Output:**
```json
{
  "ingredients": ["Chicken Breast", "Water", "Rice Flour", "Salt", "Black Pepper",
                   "Garlic Powder", "Baking Tray", "Oven", "Gas Mark 4"]
}
```

**Correct AI Output:**
```json
{
  "ingredients": [
    {"name": "Chicken Breast", "percentage": "40%"},
    {"name": "Water"},
    {"name": "Rice Flour"},
    {"name": "Salt"},
    {"name": "Black Pepper"},
    {"name": "Garlic Powder"}
  ],
  "cooking_instructions_detected": true
}
```

**Mitigation:**
- Detect section boundaries using keyword anchors: "Cooking Instructions:", "Preparation:", "How to Cook:", "Storage:", "Best Before:" etc. Ingredient parsing must stop at the first non-ingredient section header.
- Build a reject-list of terms that are never ingredients: "oven", "microwave", "baking tray", "gas mark", "°C", "minutes", "pierce", "film lid", "sleeve".
- Use sentence structure analysis: cooking instructions are imperative sentences ("Remove…", "Place…", "Stir…"), whereas ingredients are noun phrases in a comma-separated list.
- If the OCR does not clearly delineate sections, apply a secondary classifier trained to distinguish ingredient text from instructional text based on linguistic features.

---

### A-10: Foreign-Language Ingredient Hallucination on Bilingual Labels

**Title:** AI hallucinates English translations of Welsh or other language text on bilingual UK labels

**Description:**
Many UK products, particularly those sold in Wales, carry bilingual labelling in English and Welsh (Cymraeg). Other products may include Gaelic, French (for Northern Ireland cross-border products), or Polish/Urdu for targeted demographics. If the AI encounters the non-English text and attempts to translate it, it may produce inaccurate translations or, worse, generate phantom ingredients by mistranslating unfamiliar terms. Welsh food terminology can be particularly challenging: "siwgr" (sugar), "halen" (salt), and "blawd" (flour) may be mistranslated or duplicated alongside their English equivalents.

**Example Input (OCR text):**
```
Ingredients: Wheat Flour, Sugar, Butter (Milk), Eggs, Raising Agent
(Sodium Bicarbonate), Salt.
Cynhwysion: Blawd Gwenith, Siwgr, Menyn (Llaeth), Wyau, Cyfrwng Codi
(Sodiwm Bicarbonad), Halen.
```

**Wrong AI Output:**
```json
{
  "ingredients": ["Wheat Flour", "Sugar", "Butter", "Eggs", "Sodium Bicarbonate", "Salt",
                   "Blawd Gwenith", "Siwgr", "Menyn", "Llaeth", "Wyau", "Cyfrwng Codi",
                   "Sodiwm Bicarbonad", "Halen"]
}
```
*(Welsh ingredients duplicated as separate entries, some untranslated, creating a false impression of 14 ingredients instead of 6.)*

**Correct AI Output:**
```json
{
  "ingredients": [
    {"name": "Wheat Flour"},
    {"name": "Sugar"},
    {"name": "Butter", "contains": ["Milk"]},
    {"name": "Eggs"},
    {"name": "Sodium Bicarbonate", "function": "Raising Agent"},
    {"name": "Salt"}
  ],
  "bilingual_label_detected": true,
  "languages": ["English", "Welsh"]
}
```

**Mitigation:**
- Detect bilingual labels by looking for known Welsh (and other language) section headers: "Cynhwysion:" (Ingredients), "Cyngor Alergedd:" (Allergy Advice). When detected, parse only the English block and note the presence of the second language.
- Maintain a small Welsh-English food vocabulary lookup (siwgr→sugar, halen→salt, blawd→flour, llaeth→milk, menyn→butter, wyau→eggs, dŵr→water, olew→oil) to validate that the Welsh block is a translation rather than additional ingredients.
- Implement a deduplication step: if two sets of ingredients are detected and one is a near-complete translation of the other, discard the non-English set.
- In the AI prompt, instruct: "UK labels may be bilingual. Parse only the English ingredients list. Do not duplicate ingredients from Welsh, Gaelic, or other language sections."

---

## Section B: Label Tricks

These are legitimate labelling practices that manufacturers use — within the letter of the law — to make products appear healthier, simpler, or more natural than they are. The AI must detect these tricks, explain them to the user, and factor them into the product's RealFood? score.

---

### B-1: Broken-Out Sugars

**Title:** Manufacturer lists sugar, glucose syrup, dextrose, and maltose separately to push each one down the ingredients list

**Description:**
UK law requires ingredients to be listed in descending order of weight. By splitting total sugar content across multiple named sugars — white sugar, glucose syrup, dextrose, maltose, fructose, honey, invert sugar syrup, etc. — a manufacturer ensures that no single sugar appears as the first or second ingredient. Individually, each sugar may sit mid-list, but collectively they may constitute the largest component of the product by weight.

**Example Input (OCR text):**
```
Ingredients: Wheat Flour, Glucose Syrup, Vegetable Oil (Palm), Dextrose,
Maltodextrin, Sugar, Fructose, Honey, Dried Whole Milk Powder, Raising
Agents (Sodium Bicarbonate, Ammonium Bicarbonate), Salt, Emulsifier
(Soya Lecithin), Natural Flavouring.
```

**What the Trick Hides:**
The product contains six separate sugar-type ingredients (Glucose Syrup, Dextrose, Maltodextrin, Sugar, Fructose, Honey). If combined, total sugars would very likely be the single largest ingredient by weight, ahead of Wheat Flour. Listing them separately disguises this, making the product appear flour-based rather than sugar-based.

**Expected AI Detection:**
```json
{
  "sugar_splitting_detected": true,
  "sugar_type_ingredients": ["Glucose Syrup", "Dextrose", "Maltodextrin", "Sugar", "Fructose", "Honey"],
  "sugar_type_count": 6,
  "warning": "This product lists 6 separate sugar-type ingredients. If combined, total sugars may be the largest single ingredient by weight.",
  "estimated_combined_rank": 1
}
```

**Scoring Impact:**
Significant negative adjustment. The RealFood? score should penalise products with 3 or more distinct sugar-type ingredients, with increasing severity as the count rises. A secondary penalty should apply if the combined estimated sugar weight would promote sugars to position 1 or 2 in the ingredients list.

---

### B-2: "Natural Flavouring" Opacity

**Title:** Unspecified "natural flavourings" that could mask MSG or other additives

**Description:**
Under EU-retained regulation (EC) No 1334/2008, the term "natural flavouring" is legally permitted on UK labels without specifying the exact substance. This opacity allows manufacturers to include flavour enhancers such as yeast extract (a source of free glutamates, functionally similar to MSG), hydrolysed vegetable protein, or other processed flavouring compounds under a clean-sounding umbrella term. Users seeking to avoid ultra-processed food (UPF) markers cannot determine what is actually present.

**Example Input (OCR text):**
```
Ingredients: Chicken (45%), Water, Rice Starch, Salt, Natural Flavouring.
```

**What the Trick Hides:**
"Natural Flavouring" could be anything from a simple herb extract to a complex processed flavouring system involving yeast extract, hydrolysed proteins, or enzyme-modified substrates. The consumer has no way to distinguish a genuinely simple flavouring from a UPF-adjacent one.

**Expected AI Detection:**
```json
{
  "opacity_flag": true,
  "ingredient": "Natural Flavouring",
  "warning": "'Natural Flavouring' is a legally permitted catch-all term. The specific substance(s) are not disclosed. It may contain yeast extract, hydrolysed proteins, or other processed flavour compounds.",
  "transparency_rating": "low",
  "upf_risk": "uncertain"
}
```

**Scoring Impact:**
Moderate negative adjustment. The RealFood? score should apply an "opacity penalty" for each instance of unspecified flavouring. The penalty should be smaller than for a known UPF additive (since the flavouring might be benign) but should reflect the lack of transparency. The app should inform the user that the ingredient cannot be fully assessed.

---

### B-3: Clean-Label Substitution

**Title:** Replacing "modified starch" with "tapioca starch" to avoid UPF perception

**Description:**
The clean-label movement has led manufacturers to replace ingredients that sound "chemical" with functionally equivalent alternatives that sound natural. "Modified starch" (a UPF marker under NOVA classification) might be replaced with "tapioca starch" or "rice starch" — which, depending on the processing applied, may be just as modified but are not labelled as such because the base starch name is used instead. Similarly, "cellulose" may be replaced with "bamboo fibre", or "carrageenan" with "Irish moss extract".

**Example Input (OCR text):**
```
Ingredients: Water, Pea Protein, Tapioca Starch, Coconut Oil, Bamboo Fibre,
Natural Flavouring, Sea Salt, Beetroot Juice (Colour).
```

**What the Trick Hides:**
The product appears to be made from simple, recognisable ingredients. However, "Tapioca Starch" in this context (a processed vegan product) may be physically or enzymatically modified; "Bamboo Fibre" is functionally equivalent to cellulose (E460); "Coconut Oil" may be fractionated or refined; and "Natural Flavouring" is opaque. The label reads like a wholefood product, but the degree of processing may be significant.

**Expected AI Detection:**
```json
{
  "clean_label_substitutions_detected": true,
  "flags": [
    {"ingredient": "Tapioca Starch", "possible_equivalent": "Modified Starch",
     "note": "In processed products, tapioca starch may be physically or enzymatically modified. Without further detail, UPF status is uncertain."},
    {"ingredient": "Bamboo Fibre", "possible_equivalent": "Cellulose (E460)",
     "note": "Bamboo fibre is functionally equivalent to cellulose. This is a clean-label substitution."},
    {"ingredient": "Natural Flavouring", "note": "Unspecified — see opacity flag."}
  ],
  "warning": "This product uses clean-label ingredient names that may obscure the level of processing involved."
}
```

**Scoring Impact:**
Mild to moderate negative adjustment. The RealFood? score should flag clean-label substitutions with an informational note rather than a heavy penalty, since the actual processing level is uncertain. The score should reflect this uncertainty with a small "clean-label ambiguity" deduction. Products with multiple such substitutions should receive a cumulative penalty.

---

### B-4: The Percentage Game

**Title:** "Chicken Pie" with only 12% chicken

**Description:**
UK food labelling law (Food Information Regulations 2014, retained from EU FIC) requires that any ingredient highlighted in the product name, marketing, or imagery must have its percentage declared. However, there is no minimum threshold — a "Chicken Pie" can legally contain as little as 6–12% chicken. The prominent product name creates an expectation of a chicken-rich product, while the small percentage buried in the ingredients list reveals otherwise.

**Example Input (OCR text):**
```
Farmhouse Chicken & Ham Pie
Ingredients: Wheat Flour, Water, Pork Fat, Chicken (12%), Ham (8%),
Modified Maize Starch, Salt, Dried Onion, White Pepper, Yeast Extract,
Flavouring.
```

**What the Trick Hides:**
A product named "Chicken & Ham Pie" prominently featuring chicken in its name contains only 12% chicken and 8% ham — a total of 20% named meats. The remaining 80% is predominantly flour, water, pork fat, starch, and flavourings. The product name creates a misleading impression of protein content.

**Expected AI Detection:**
```json
{
  "named_ingredient_percentage_check": true,
  "product_name": "Farmhouse Chicken & Ham Pie",
  "named_ingredients": [
    {"name": "Chicken", "declared_percentage": "12%", "expectation": "primary_ingredient"},
    {"name": "Ham", "declared_percentage": "8%", "expectation": "primary_ingredient"}
  ],
  "total_named_ingredient_percentage": "20%",
  "warning": "The named ingredients (Chicken and Ham) make up only 20% of this product. The remaining 80% comprises flour, water, fat, starch, and other ingredients.",
  "filler_ingredients": ["Wheat Flour", "Water", "Pork Fat", "Modified Maize Starch"]
}
```

**Scoring Impact:**
Significant negative adjustment. The RealFood? score should penalise products where the named or highlighted ingredient constitutes less than 50% of the product, with increasing severity at lower percentages. A "Chicken Pie" with 12% chicken should receive a substantial "misleading name" penalty. The threshold percentages should be calibrated against typical category norms (e.g., a premium chicken pie might contain 40%+ chicken).

---

### B-5: Health Halo — "No Added Sugar" with Concentrated Fruit Juice

**Title:** "No Added Sugar" on product sweetened with concentrated grape juice

**Description:**
UK regulations permit a "No Added Sugar" claim if no mono- or disaccharides or other foods used for sweetening have been added. However, concentrated fruit juices (grape, apple, date) are extremely high in fructose and glucose and function as sweeteners, yet some manufacturers argue they are "fruit ingredients" rather than "added sugars." The front-of-pack "No Added Sugar" claim creates a health halo that is contradicted by the actual sugar content revealed in the nutrition table.

**Example Input (OCR text):**
```
No Added Sugar*
Ingredients: Oats, Dried Fruit (15%) (Raisins, Sultanas), Concentrated
Grape Juice, Rice Syrup, Sunflower Oil, Puffed Rice, Natural Flavouring.
*Contains naturally occurring sugars.
Nutrition per 100g: Sugars 28.0g
```

**What the Trick Hides:**
The product carries a prominent "No Added Sugar" claim, but contains Concentrated Grape Juice and Rice Syrup — both of which are highly processed, concentrated sugar sources. The nutrition table reveals 28.0g sugars per 100g, which is high. The asterisked footnote "Contains naturally occurring sugars" is technically accurate but misleading, as the concentrated juice and syrup are functionally identical to added sugar.

**Expected AI Detection:**
```json
{
  "health_claim_analysis": {
    "claim": "No Added Sugar",
    "contradicting_ingredients": ["Concentrated Grape Juice", "Rice Syrup"],
    "actual_sugar_per_100g": 28.0,
    "sugar_traffic_light": "red",
    "warning": "This product claims 'No Added Sugar' but contains Concentrated Grape Juice and Rice Syrup, which are functionally equivalent to added sugars. Total sugars are 28.0g per 100g, which is classified as HIGH under the UK traffic-light system (>22.5g/100g)."
  }
}
```

**Scoring Impact:**
Major negative adjustment. The RealFood? score should apply a "health halo deception" penalty when a front-of-pack health claim is contradicted by the ingredients list or nutrition data. The penalty should be proportional to the degree of contradiction — a "No Added Sugar" product with 28g/100g sugars from concentrated juices warrants a severe deduction. An additional flag should warn the user that the claim may be technically legal but practically misleading.

---

### B-6: Allergen Font Tricks — Non-Compliance with UK FIR 2014

**Title:** Allergens not bolded as required by UK Food Information Regulations 2014

**Description:**
The UK Food Information Regulations 2014 (retained from EU FIC Regulation 1169/2011) require that the 14 major allergens be emphasised in the ingredients list — typically through bold, italic, underline, or CAPITALISATION. Some manufacturers use minimal emphasis (e.g., very slightly bolder weight that is hard to distinguish) or inconsistent formatting, making allergens difficult to spot. While this is technically non-compliance, it occurs in practice and the AI must detect it.

**Example Input (OCR text with formatting metadata):**
```
Ingredients: WHEAT Flour, Sugar, Vegetable Oil, Skimmed MILK Powder,
Cocoa Butter, Cocoa Mass, Whey Powder (milk), Emulsifier (SOYA Lecithin),
Barley Malt Extract, Raising Agents (Ammonium Bicarbonate, Sodium
Bicarbonate), Salt, Flavouring.
```
*(Note: "milk" in "Whey Powder (milk)" is lowercase — not emphasised. "Barley" is not emphasised despite being a gluten-containing cereal.)*

**What the Trick Hides:**
Not all allergens are consistently emphasised. A consumer scanning for bolded allergens would miss the milk allergen in "Whey Powder (milk)" and the gluten-containing cereal "Barley" in "Barley Malt Extract." This inconsistent formatting can be genuinely dangerous for allergy sufferers who rely on visual emphasis to quickly identify allergens.

**Expected AI Detection:**
```json
{
  "allergen_formatting_check": {
    "compliant": false,
    "allergens_correctly_emphasised": ["WHEAT", "MILK", "SOYA"],
    "allergens_not_emphasised": [
      {"ingredient": "Whey Powder (milk)", "allergen": "Milk", "issue": "'milk' not emphasised in sub-ingredient"},
      {"ingredient": "Barley Malt Extract", "allergen": "Barley (gluten)", "issue": "'Barley' not emphasised despite being a gluten-containing cereal"}
    ],
    "warning": "This label does not consistently emphasise all 14 major allergens as required by UK FIR 2014. Milk and Barley (gluten) are present but not highlighted."
  }
}
```

**Scoring Impact:**
Moderate negative adjustment, plus a prominent safety alert. The RealFood? score should apply a "labelling compliance" penalty for inconsistent allergen emphasis. More importantly, the app should generate a high-priority allergen safety warning that lists all allergens found in the ingredients — whether emphasised or not — so that allergy sufferers are not misled by poor formatting.

---

### B-7: "Made with Real Fruit" — Minimal Fruit Content

**Title:** Product claims "Made with Real Fruit" but contains 2% fruit juice from concentrate

**Description:**
Front-of-pack claims such as "Made with Real Fruit", "Contains Real Strawberries", or "With Real Lemon" create an impression of significant fruit content. In practice, the product may contain as little as 1–3% fruit, often in the form of juice from concentrate or fruit purée that has been heavily processed. The imagery on the packaging (photographs of fresh strawberries, lemons, etc.) reinforces this impression.

**Example Input (OCR text):**
```
Made with Real Strawberries!
Strawberry Flavour Yoghurt
Ingredients: Yoghurt (Milk), Sugar, Water, Modified Maize Starch,
Strawberry Juice from Concentrate (2%), Flavouring, Colour (Carmine),
Acidity Regulator (Sodium Citrate).
```

**What the Trick Hides:**
The front-of-pack claim "Made with Real Strawberries!" and the product name "Strawberry Flavour Yoghurt" suggest a strawberry-rich product. The actual strawberry content is 2% juice from concentrate — not whole strawberries or even fresh juice. The strawberry flavour and pink colour come primarily from added flavouring and carmine (a dye derived from cochineal insects). The product is predominantly yoghurt, sugar, water, and starch.

**Expected AI Detection:**
```json
{
  "marketing_claim_analysis": {
    "claim": "Made with Real Strawberries!",
    "actual_fruit_ingredient": "Strawberry Juice from Concentrate",
    "actual_fruit_percentage": "2%",
    "fruit_form": "juice_from_concentrate",
    "is_whole_fruit": false,
    "colour_source": "Carmine (not from strawberries)",
    "flavour_source": "Added flavouring (not solely from strawberries)",
    "warning": "This product claims to be 'Made with Real Strawberries' but contains only 2% Strawberry Juice from Concentrate. The colour comes from Carmine and the flavour from added flavourings, not from real strawberries."
  }
}
```

**Scoring Impact:**
Significant negative adjustment. The RealFood? score should apply a "misleading fruit claim" penalty when a product's marketing emphasises fruit content but the declared percentage is below 10%. Additional penalties should apply when the fruit is in a processed form (juice from concentrate rather than whole fruit) and when artificial colours or flavourings supplement the minimal real fruit content.

---

### B-8: Compound Ingredient Nesting — Hiding UPF Additives

**Title:** Hiding UPF additives inside a sub-ingredient parenthetical

**Description:**
Compound ingredients allow manufacturers to nest additive-heavy components inside parenthetical sub-ingredient lists, where consumers are less likely to scrutinise them. A product may appear to have a short, clean top-level ingredients list, but each compound ingredient may contain emulsifiers, stabilisers, modified starches, and other UPF markers in its sub-ingredients. The visual complexity of nested parentheses also discourages careful reading.

**Example Input (OCR text):**
```
Ingredients: Chicken Breast (78%), Breadcrumb Coating (Wheat Flour,
Water, Maize Starch, Salt, Dextrose, Raising Agent (Ammonium Bicarbonate),
Paprika Extract, Emulsifier (E471, E481), Stabiliser (Xanthan Gum),
Anti-caking Agent (Silicon Dioxide)), Sunflower Oil.
```

**What the Trick Hides:**
At the top level, this product has only three ingredients: Chicken Breast, Breadcrumb Coating, and Sunflower Oil — appearing remarkably simple. However, the Breadcrumb Coating alone contains 10 sub-ingredients, including Dextrose (a sugar), two emulsifiers (E471, E481), a stabiliser (Xanthan Gum), and an anti-caking agent (Silicon Dioxide). The total additive count is obscured by nesting.

**Expected AI Detection:**
```json
{
  "compound_ingredient_analysis": {
    "top_level_count": 3,
    "total_unique_ingredients": 13,
    "hidden_additives": [
      {"name": "Dextrose", "parent": "Breadcrumb Coating", "category": "Sugar"},
      {"name": "E471", "parent": "Breadcrumb Coating", "category": "Emulsifier"},
      {"name": "E481", "parent": "Breadcrumb Coating", "category": "Emulsifier"},
      {"name": "Xanthan Gum", "parent": "Breadcrumb Coating", "category": "Stabiliser"},
      {"name": "Silicon Dioxide", "parent": "Breadcrumb Coating", "category": "Anti-caking Agent"}
    ],
    "warning": "This product appears to have only 3 ingredients at top level, but contains 13 unique ingredients in total, including 5 additives nested within the Breadcrumb Coating."
  }
}
```

**Scoring Impact:**
Moderate negative adjustment. The RealFood? score should assess UPF markers at all hierarchy levels, not just the top level. The score should count total unique additives across all nesting levels. An additional "nesting complexity" flag should be raised when the ratio of total ingredients to top-level ingredients exceeds 3:1, indicating that significant complexity is hidden in compound ingredients.

---

### B-9: Salt/Sodium Switching

**Title:** Declaring sodium instead of salt to make the number appear smaller

**Description:**
Salt (sodium chloride) and sodium are related but numerically different: salt = sodium × 2.5. UK regulations require that the nutrition table declare "Salt" (not sodium) under the Food Information Regulations 2014. However, some products — particularly older label designs or those imported and relabelled — may still display sodium, or display both with sodium more prominently. A consumer (or AI) reading "Sodium: 0.4g" might not realise this equates to 1.0g of salt, which is a more concerning figure (20% of the 5g daily reference intake).

**Example Input (OCR text):**
```
Nutrition Information (per 100g):
Energy: 1050 kJ / 250 kcal
Fat: 8.0g
  of which Saturates: 3.5g
Carbohydrate: 35.0g
  of which Sugars: 4.0g
Protein: 9.0g
Sodium: 0.8g
```

**What the Trick Hides:**
By declaring "Sodium: 0.8g" instead of the legally required "Salt" figure, the number appears moderate. The actual salt equivalent is 0.8g × 2.5 = 2.0g per 100g, which is classified as HIGH (red) under the UK traffic-light system (threshold: >1.5g salt per 100g). A consumer who does not know the conversion factor would significantly underestimate the salt content.

**Expected AI Detection:**
```json
{
  "salt_sodium_check": {
    "declared_as": "sodium",
    "declared_value_g": 0.8,
    "salt_equivalent_g": 2.0,
    "uk_traffic_light": "red",
    "compliance_issue": "UK FIR 2014 requires salt (not sodium) to be declared in the nutrition table.",
    "warning": "This label declares Sodium (0.8g/100g) instead of Salt. The salt equivalent is 2.0g/100g, which is classified as HIGH (red) under the UK traffic-light system."
  }
}
```

**Scoring Impact:**
Significant negative adjustment on two grounds. First, a compliance penalty for declaring sodium instead of salt, in breach of UK FIR 2014. Second, the actual salt content of 2.0g/100g triggers the high-salt penalty under the traffic-light scoring system. The AI must always convert sodium to salt (×2.5) when sodium is declared, and must flag the non-compliant labelling practice.

---

### B-10: "Source of Fibre" Claim with Added Inulin

**Title:** Product meets "source of fibre" threshold but fibre comes from added inulin rather than whole grains

**Description:**
Under UK/EU nutrition claims regulation (EC) No 1924/2006, a product may claim to be a "Source of Fibre" if it contains at least 3g fibre per 100g, or "High in Fibre" at 6g per 100g. Some manufacturers achieve this threshold not through whole grains, fruits, or vegetables, but by adding isolated fibre extracts — most commonly inulin (chicory root fibre) or polydextrose. While these are technically dietary fibres, they are ultra-processed ingredients extracted and refined from their original food matrix. The health benefits of isolated fibres may differ from those of intact whole-food fibres.

**Example Input (OCR text):**
```
Source of Fibre
Ingredients: Wheat Flour, Sugar, Vegetable Oil (Palm), Inulin (Chicory
Root Fibre) (8%), Glucose Syrup, Dried Whole Egg, Raising Agents (Sodium
Bicarbonate, Disodium Diphosphate), Salt, Emulsifier (Soya Lecithin),
Flavouring.
Nutrition per 100g: Fibre 4.5g
```

**What the Trick Hides:**
The "Source of Fibre" claim creates an impression of a wholesome, whole-grain product. In reality, the fibre comes almost entirely from added inulin — an isolated, processed fibre extract. The base product is a standard biscuit made from refined wheat flour, sugar, palm oil, and glucose syrup. Without the added inulin, the product would likely not qualify for the fibre claim. The inulin itself is a UPF marker under the NOVA classification: it is an industrially extracted substance not found in that form in domestic kitchens.

**Expected AI Detection:**
```json
{
  "fibre_claim_analysis": {
    "claim": "Source of Fibre",
    "fibre_per_100g": 4.5,
    "threshold_met": true,
    "fibre_sources": [
      {"ingredient": "Inulin (Chicory Root Fibre)", "percentage": "8%", "type": "isolated_added_fibre", "is_upf_marker": true},
      {"ingredient": "Wheat Flour", "type": "refined_flour", "note": "Refined wheat flour contributes minimal fibre."}
    ],
    "whole_grain_present": false,
    "warning": "The 'Source of Fibre' claim is technically valid (4.5g/100g ≥ 3g threshold), but the fibre comes predominantly from added Inulin (Chicory Root Fibre), an isolated, industrially extracted fibre. This is a UPF marker. The product does not contain whole grains.",
    "recommendation": "Fibre from whole food sources (whole grains, fruits, vegetables) is generally considered more beneficial than isolated added fibres."
  }
}
```

**Scoring Impact:**
Moderate negative adjustment. The RealFood? score should distinguish between fibre from whole-food sources and fibre from isolated additives. When a fibre claim is substantiated primarily by added isolated fibres (inulin, polydextrose, methylcellulose), the score should apply a "fibre quality" penalty and flag the inulin as a UPF marker. The product should not receive the positive scoring benefit normally associated with high-fibre products, since the fibre does not indicate a genuinely whole-food composition.

---

## Summary

| ID   | Category           | Title                                      | Severity |
|------|--------------------|--------------------------------------------|----------|
| A-1  | Hallucination Risk | Allergen warning parsed as ingredient      | High     |
| A-2  | Hallucination Risk | Fabricated ingredient not in OCR text       | High     |
| A-3  | Hallucination Risk | Wrong E-number assignment                  | Medium   |
| A-4  | Hallucination Risk | Confidence inflation on poor OCR           | High     |
| A-5  | Hallucination Risk | Permitted ingredient mislabelled as harmful | Medium   |
| A-6  | Hallucination Risk | Nutrition column cross-contamination       | High     |
| A-7  | Hallucination Risk | Sub-ingredient promoted to top level       | Medium   |
| A-8  | Hallucination Risk | Brand name classified as ingredient        | Low      |
| A-9  | Hallucination Risk | Cooking instructions parsed as ingredients | Low      |
| A-10 | Hallucination Risk | Bilingual label duplication                | Medium   |
| B-1  | Label Trick        | Broken-out sugars                          | High     |
| B-2  | Label Trick        | Natural flavouring opacity                 | Medium   |
| B-3  | Label Trick        | Clean-label substitution                   | Medium   |
| B-4  | Label Trick        | Low percentage of named ingredient         | High     |
| B-5  | Label Trick        | Health halo with concentrated juice         | High     |
| B-6  | Label Trick        | Allergen font non-compliance               | High     |
| B-7  | Label Trick        | Minimal fruit content with bold claims     | Medium   |
| B-8  | Label Trick        | Additives hidden in compound nesting       | Medium   |
| B-9  | Label Trick        | Salt/sodium switching                      | High     |
| B-10 | Label Trick        | Fibre claim via isolated added inulin      | Medium   |

---

*Document prepared for the RealFood? project. All examples use fictitious but realistic UK product data for illustration purposes.*
