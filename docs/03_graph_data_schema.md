# RealFood? — Graph Data Schema

## 1. Design Goals

1. **Link ingredients to evidence-based flags** with traceable source references.
2. **Support vector embeddings** for fuzzy-matching misspelled, abbreviated, or variation-heavy ingredient names.
3. **Enable graph traversal** — e.g., "show me all products containing Class A UPF markers that also have a health halo claim."
4. **UK-centric**: Align node properties with FSA terminology, UK FIR 2014 requirements, and NOVA classification.

---

## 2. Node Types

### 2.1 `Ingredient`

The core entity. Represents a canonical ingredient as recognised in UK food labelling.

```
Ingredient {
  id:                 UUID
  canonical_name:     String          -- "sodium nitrite"
  display_name:       String          -- "Sodium Nitrite"
  e_number:           String?         -- "E250" (nullable)
  synonyms:           [String]        -- ["nitrite of soda", "NaNO2"]
  embedding:          Vector(384)     -- voyage-3-lite or equivalent
  nova_class:         Enum(1,2,3,4)   -- NOVA food classification
  upf_severity:       Enum(A,B,C,D,NONE)
  category:           String          -- "preservative", "emulsifier", "sweetener", etc.
  fsa_status:         Enum(APPROVED, UNDER_REVIEW, RESTRICTED, BANNED)
  description:        String          -- Plain-English explanation
  created_at:         DateTime
  updated_at:         DateTime
}
```

### 2.2 `Flag`

An evidence-based concern or annotation attached to an ingredient.

```
Flag {
  id:                 UUID
  flag_type:          Enum(UPF_MARKER, ALLERGEN, REGULATORY, LABEL_TRICK, HEALTH_CONCERN)
  severity:           Enum(CRITICAL, HIGH, MODERATE, LOW, INFO)
  title:              String          -- "Linked to gut microbiome disruption"
  description:        String          -- Full explanation
  evidence_quality:   Enum(META_ANALYSIS, RCT, COHORT, CASE_STUDY, MECHANISTIC, REGULATORY_OPINION)
  source_refs:        [UUID -> Source]
  applicable_context: String?         -- "when consumed > 5mg/kg bodyweight/day"
  created_at:         DateTime
}
```

### 2.3 `Source`

A citable reference backing a flag.

```
Source {
  id:                 UUID
  title:              String          -- "Ultra-processed food and risk of CVD: BMJ 2024"
  authors:            [String]
  publication:        String          -- "British Medical Journal"
  year:               Int
  doi:                String?
  url:                String?
  source_type:        Enum(PEER_REVIEWED, FSA_GUIDANCE, WHO_REPORT, EFSA_OPINION, SACN_REPORT)
  accessed_at:        DateTime
}
```

### 2.4 `Product`

A scanned food product.

```
Product {
  id:                 UUID
  barcode:            String?         -- EAN-13
  name:               String
  brand:              String?
  retailer:           String?         -- "Tesco", "Sainsbury's", etc.
  raw_ocr_text:       String          -- Full OCR dump
  nutrition_per_100g: NutritionData
  score:              Float
  traffic_light:      Enum(RED, AMBER, GREEN)
  scanned_at:         DateTime
  label_image_hash:   String          -- SHA-256 of uploaded image
}
```

### 2.5 `NutritionData` (embedded / value object)

```
NutritionData {
  energy_kj:          Float
  energy_kcal:        Float
  fat_g:              Float
  saturates_g:        Float
  carbohydrate_g:     Float
  sugars_g:           Float
  fibre_g:            Float?
  protein_g:          Float
  salt_g:             Float
}
```

### 2.6 `LabelTrick`

A detected deceptive practice on a specific product.

```
LabelTrick {
  id:                 UUID
  trick_type:         Enum(BROKEN_OUT_SUGARS, CLEAN_LABEL_SWAP, FLAVOURING_AMBIGUITY,
                           PERCENTAGE_GAME, HEALTH_HALO, ALLERGEN_OBSCURING)
  description:        String
  evidence:           String          -- The specific text from the label
  penalty_applied:    Float
}
```

---

## 3. Edge Types (Relationships)

```
(Product)     -[CONTAINS {position: Int, percentage: Float?}]->     (Ingredient)
(Ingredient)  -[HAS_FLAG {context: String?}]->                     (Flag)
(Flag)        -[CITED_BY]->                                        (Source)
(Ingredient)  -[SUBSTITUTES_FOR {direction: "cleaner"|"equivalent"}]-> (Ingredient)
(Ingredient)  -[SYNONYM_OF]->                                     (Ingredient)
(Product)     -[HAS_LABEL_TRICK]->                                 (LabelTrick)
(LabelTrick)  -[INVOLVES]->                                        (Ingredient)
(Product)     -[REFORMULATED_FROM {date: DateTime}]->              (Product)
```

---

## 4. Vector Embedding Strategy

### 4.1 Problem

Ingredient names on UK labels exhibit high variation:

| Canonical | Variations Found in the Wild |
|---|---|
| sodium nitrite | sodium nitrate (sic), E250, nitrite, preservative: sodium nitrite, preservative (E250) |
| carrageenan | carageenan, carragenan, E407, carrageen, Irish moss extract |
| mono- and diglycerides of fatty acids | E471, mono and diglycerides, monoglycerides |

OCR compounds this with artefacts: `carrageenari`, `E47l` (letter L for digit 1).

### 4.2 Solution: Embedding Index

1. **Generate embeddings** for every `canonical_name` + `synonym` using a lightweight model (`voyage-3-lite`, 384 dimensions).
2. **Store in a vector index** (pgvector in PostgreSQL, or Neo4j's native vector index).
3. **At query time**, embed the OCR-extracted ingredient string and perform **approximate nearest neighbour (ANN)** search with cosine similarity.
4. **Threshold**: similarity >= 0.82 triggers a match. Between 0.70–0.82, flag for human review.

### 4.3 Index Schema (pgvector example)

```sql
CREATE TABLE ingredient_embeddings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
    text_variant    TEXT NOT NULL,          -- The specific string embedded
    embedding       vector(384) NOT NULL,
    is_canonical    BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ingredient_embedding
    ON ingredient_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

### 4.4 Hybrid Matching Pipeline

```
OCR text: "preservative (E25O)"   -- note: letter O not zero
          |
          v
    [Normaliser]
    - Strip parentheses/colons: "E25O"
    - Common OCR corrections: "E250"
          |
          v
    [Exact Lookup] -- check canonical_name, e_number, synonyms
    - Match found? -> return Ingredient node
    - No match? -> continue
          |
          v
    [Vector Search]
    - Embed "E25O" -> query vector
    - ANN search, top-3 results
    - If top result similarity >= 0.82 -> return match
    - If 0.70-0.82 -> flag for review
    - If < 0.70 -> mark as UNKNOWN_INGREDIENT
```

---

## 5. Cypher Query Examples (Neo4j)

### Find all Class A UPF ingredients in a product

```cypher
MATCH (p:Product {id: $productId})-[c:CONTAINS]->(i:Ingredient)
WHERE i.upf_severity = 'A'
RETURN i.canonical_name, c.position, i.category
ORDER BY c.position
```

### Find all products with broken-out sugars

```cypher
MATCH (p:Product)-[:HAS_LABEL_TRICK]->(lt:LabelTrick)
WHERE lt.trick_type = 'BROKEN_OUT_SUGARS'
RETURN p.name, p.brand, lt.evidence
```

### Trace evidence for a flag

```cypher
MATCH (i:Ingredient {canonical_name: 'carrageenan'})-[:HAS_FLAG]->(f:Flag)-[:CITED_BY]->(s:Source)
WHERE f.severity IN ['CRITICAL', 'HIGH']
RETURN f.title, f.evidence_quality, s.title, s.doi
```

### Fuzzy ingredient lookup (vector similarity)

```cypher
WITH $queryEmbedding AS qe
CALL db.index.vector.queryNodes('ingredient_embedding_index', 5, qe)
YIELD node, score
WHERE score >= 0.82
RETURN node.canonical_name, node.e_number, score
ORDER BY score DESC
```

---

## 6. Seed Data Requirements (MVP)

| Entity | Target Count | Source |
|---|---|---|
| Ingredients | 500+ canonical entries | FSA approved additives list, NOVA Group 4 markers, common UK label ingredients |
| Flags | 200+ | PubMed, EFSA opinions, SACN reports, FSA guidance |
| Sources | 100+ | Curated bibliography of UK/EU food safety literature |
| Synonyms per ingredient | 3–8 average | OpenFoodFacts taxonomy, manual curation |
| Embeddings per ingredient | 5–15 (canonical + synonyms + common misspellings) | Generated from synonym list + synthetic OCR errors |
